// 455 报价阶梯价与超折扣审批门 持久化与准入
//
// 本文件守的业务事实（逐条对照后端源码写入方，非推测）：
// 1. 阶梯价：报价行 tier_pricing 是一段按订购量分档的单价表（同一产品/色号在不同档单价不同），
//    明细改量到另一档后，行 amount 与单头 subtotal 按新档单价重算；落库值与详情接口重读值逐位一致
//    （写后一律 GET /quotations/{id} 重读，不信建单/改单出参本身）。
// 2. 超折扣门（金额档位审批）：quotation_approval_service.rs 的 ApproverRole::from_amount 以
//    AMOUNT_THRESHOLD_SELF=100000 为界——total_amount < 10 万提交即小额自批直接 approved；
//    达到或超过 10 万提交走 submit_to_bpm 落 pending_approval，不得直接生效。
//    转订单准入在 quotation_convert_service.rs 的 validate_quotation_for_convert：仅 approved 可转，
//    pending_approval 转单必被拒（4xx + AppError 信封），审批通过后才放行。
// 3. 越权面：审批动作 POST /quotations/{id}/approve 的资源细键为 quotations:approve，
//    salesperson 岗不持该键（也不持 create），真实登录打这两个写端点必 403 FORBIDDEN；
//    被拒不得半改目标单据状态（用持键会话回读证明）。
// 4. 假成功防线：明细为空、必填缺失这两类非法建单在落库前即被拒，且重读列表确认没有多出一条半成品单据。
//
// 状态词表（唯一事实来源 = 写入方 models/status/sales.rs，逐字符相同，本域一律小写）：
//   quotation：draft / approved / rejected / cancelled；
//   quotation_ext：pending_approval / expired / converted。
// 出参键名以实体/DTO 为准（snake_case）：列表腿 handlers/quotation_handler.rs 的 ListQuotationsResponse
//   是 {list,total,page,page_size}（不是 base 面的 items）；详情腿 get_quotation 出 QuotationResponseDto
//   含 items[] 与 terms[]；行腿键取 models/sales_quotation_item.rs（quantity/unit_price/amount/
//   amount_with_tax/tier_pricing/discount_rate/discount_amount）。
// 金额线格式：subtotal/tax_amount/total_amount 与行 amount/amount_with_tax 是 DECIMAL(18,2)（出参字符串），
//   unit_price/unit_price_with_tax 是 DECIMAL(18,6)；断言折到对应标度按整数比分，用例内不造第二套舍入。
// 失败信封唯一形状：utils/error.rs 的 ErrorResponse {code,message,trace_id,timestamp}，
//   BusinessError→HTTP 400 码 BUSINESS_ERROR，ValidationError→HTTP 400 码 VALIDATION_ERROR，
//   PermissionDenied/中间件 403 码 FORBIDDEN；提取器解码失败经 trace_context 收口成 400+VALIDATION_ERROR。
//
// 税率口径：本文件建单一律 tax_inclusive=false、tax_rate=0，使 total_amount 恰等于 Σ(数量×净单价)，
//   金额档位判据（10 万）与含税噪声无关，避免把档位误判成税额造出来的值。
//
// 已知未覆盖点（如实登记，交主智能体决策，不在测试侧臆造断言）：
//   派工单要求「数量为负 → 4xx」，但后端报价创建/更新路径对 quantity 无非负门——
//   quotation_create_dto.rs 的 quantity 字段无 range 校验、quotation_ops/calc.rs 的 validate_create
//   只校验明细非空/有效期/贸易术语、迁移 sales_crm 的 sales_quotation_items.quantity 无 CHECK(>0)
//   （对照 custom_orders.quantity 才有 CHECK）。负数量经 calculate_totals 只把小计算成负值后照常入库。
//   若本用例断言负数量返回 4xx，将对着真实后端得到 200 而成为假红旗；故本文件不写该断言，改把「负数量无门」
//   登记为后端源码缺口，需产品/后端裁定是否补非负门后再补测。空明细与必填缺失两类是真 4xx，见 455-04。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

/** DECIMAL 线格式（字符串/数字）折成整数分位；超出标度且非零尾数即判红，不静默截断 */
function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 金额逐位相等断言（2 位标度） */
function eqAmount(actual: unknown, expectedCents: bigint, label: string): void {
  expect(
    toScaled(actual, 2, label),
    `${label}：期望(分)=${expectedCents} 实际=${JSON.stringify(actual)}`
  ).toBe(expectedCents);
}

/** 单价逐位相等断言（6 位标度，DECIMAL(18,6) 线格式） */
function eqPrice(actual: unknown, want: string, label: string): void {
  expect(
    toScaled(actual, 6, label),
    `${label}：期望单价=${want} 实际=${JSON.stringify(actual)}`
  ).toBe(toScaled(want, 6, `${label} 期望值`));
}

function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：未取得有效正整数主键，raw=${JSON.stringify(v)}`);
  return n;
}

function requireStr(v: unknown, label: string): string {
  if (typeof v !== 'string' || v === '')
    throw new Error(`${label}：出参非非空字符串，raw=${JSON.stringify(v)}`);
  return v;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** 详情腿读回单头（QuotationResponseDto 扁平） */
async function readQuotation(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
}

/** 详情腿读回的明细行（items[]），缺 items 键即点名（不兜底空数组掩盖缺键） */
function quoteItems(detail: Row, label: string): Row[] {
  if (!Object.prototype.hasOwnProperty.call(detail, 'items')) {
    throw new Error(
      `${label}：报价详情出参缺 items 键，行腿金额无回读口即阶梯价守恒不可证，实际键=${Object.keys(detail).join(',')}`
    );
  }
  const items = detail.items as Row[];
  expect(Array.isArray(items), `${label}：items 必须为数组`).toBe(true);
  return items;
}

/** 取本用例引用产品的报价行（单行场景按 product_id 命中），缺行点名 */
function singleLine(detail: Row, productId: number, label: string): Row {
  const lines = quoteItems(detail, label).filter(l => Number(l.product_id) === productId);
  if (lines.length !== 1) {
    throw new Error(
      `${label}：期望恰 1 条产品 ${productId} 报价行，实际 ${lines.length} 条，明细=${JSON.stringify(detail.items).slice(0, 400)}`
    );
  }
  return lines[0];
}

/**
 * 报价建单入参：tax_inclusive=false、tax_rate=0 使 total_amount=Σ(数量×净单价)，
 * 档位判据纯净。unit 逐字符取夹具产品的真实交易单位（后端 validate_item_units_against_products 强门），
 * product_id 取 ctx.quotationProductId（自建、单位已知、带克重幅宽）。
 */
function quotationPayload(
  customerId: number,
  salesUserId: number,
  productId: number,
  unit: string,
  items: Row[],
  notes: string
): Row {
  return {
    customer_id: customerId,
    sales_user_id: salesUserId,
    quotation_date: today(),
    valid_until: plusDays(30),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: false,
    tax_rate: '0',
    items,
    notes,
  };
}

/** 行单价×数量折金额（2 位标度整数），与后端 calculate_totals 的 round_dp(2) 同口径基准 */
function amountCents(quantity: string, unitPrice: string): bigint {
  const q = toScaled(quantity, 2, `数量 ${quantity}`);
  const p = toScaled(unitPrice, 6, `单价 ${unitPrice}`);
  // q(分) × p(百万分之一) = 积(10^8)，折回 2 位标度(10^2)需 ÷10^6；此处入参都是整分整百单价，
  // 积必为 10^6 的整数倍，整除无损，不做四舍五入（断言只认后端出参，本函数仅供构造期望档位的对照值）。
  const prod = q * p;
  if (prod % 1_000_000n !== 0n) {
    throw new Error(`金额构造非整分：数量=${quantity} 单价=${unitPrice}`);
  }
  return prod / 1_000_000n;
}

test.describe('455 报价阶梯价与超折扣审批门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('455-01 阶梯价按档单价入库、改量跨档重算金额与小计、写后详情接口重读逐位一致', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const productId = ctx.quotationProductId;
    if (productId === undefined) {
      throw new Error('前置缺失：ctx.quotationProductId 未就绪（阶梯价行必须引用单位已知的自建产品）');
    }
    const unit = ctx.quotationProductUnit;
    if (unit === '') throw new Error('前置缺失：ctx.quotationProductUnit 为空');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireId(me.id, '当前用户');
    const tag = genCode('Q455A');

    // 同一产品三档阶梯价：1-99→12.50、100-999→11.00、1000+→9.50（单位元/净单价，档位单价互不相同）
    const tierPricing = [
      { min_quantity: '1', max_quantity: '99', unit_price: '12.50' },
      { min_quantity: '100', max_quantity: '999', unit_price: '11.00' },
      { min_quantity: '1000', max_quantity: null, unit_price: '9.50' },
    ];
    // 三档单价两两不同（阶梯价定义本身成立，否则"按档重算"无从对照）
    const distinctPrices = new Set(tierPricing.map(t => t.unit_price));
    expect(distinctPrices.size, '阶梯价三档单价必须互不相同').toBe(3);

    // 建单：数量落在第一档，净单价取第一档 12.50
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [
        {
          product_id: productId,
          unit,
          quantity: '50',
          unit_price: '12.50',
          unit_price_with_tax: '12.50',
          tier_pricing: tierPricing,
          notes: `E2E-${tag}-L1`,
        },
      ], `E2E-${tag}-HEAD`)
    );
    const quotationId = requireId(created.id, '阶梯价报价单主键');
    expect(
      requireStr(created.quotation_no, '报价单号'),
      '建单回读单号由后端生成且带 QT 前缀'
    ).toMatch(/^QT/);

    // 建单详情重读（写后用详情接口，不信建单出参）：行腿单价/金额、tier_pricing 落库、单头小计
    const first = await readQuotation(page, quotationId);
    expect(first.status, '新建报价单初始状态小写 draft').toBe('draft');
    const line1 = singleLine(first, productId, '建单详情');
    eqPrice(line1.unit_price, '12.50', '第一档单价');
    eqAmount(line1.amount, amountCents('50', '12.50'), '第一档行金额=50×12.50');
    eqAmount(first.subtotal, amountCents('50', '12.50'), '单头小计=行金额合计');
    // tier_pricing 原样持久化为对象数组，三档单价逐档回读
    const storedTiers = line1.tier_pricing as Row[];
    expect(Array.isArray(storedTiers), 'tier_pricing 必须落库为数组').toBe(true);
    expect(storedTiers.length, 'tier_pricing 必须恰三档').toBe(3);
    eqPrice(storedTiers[0].unit_price, '12.50', '落库档位0单价');
    eqPrice(storedTiers[1].unit_price, '11.00', '落库档位1单价');
    eqPrice(storedTiers[2].unit_price, '9.50', '落库档位2单价');

    // 改量到第二档：数量 50→200，净单价按第二档 11.00 重录，PUT 全量替换明细
    await apiCall(page, 'PUT', `/quotations/${quotationId}`, {
      items: [
        {
          product_id: productId,
          unit,
          quantity: '200',
          unit_price: '11.00',
          unit_price_with_tax: '11.00',
          tier_pricing: tierPricing,
          notes: `E2E-${tag}-L2`,
        },
      ],
    });

    // 改量后详情重读：行单价变到第二档、金额与小计按新档新量重算，tier_pricing 仍保留
    const after = await readQuotation(page, quotationId);
    const line2 = singleLine(after, productId, '改量后详情');
    eqPrice(line2.unit_price, '11.00', '改量后第二档单价');
    eqAmount(line2.amount, amountCents('200', '11.00'), '改量后行金额=200×11.00');
    eqAmount(after.subtotal, amountCents('200', '11.00'), '改量后单头小计重算');
    eqAmount(after.total_amount, amountCents('200', '11.00'), '税率 0 下总额=小计');
    expect(
      toScaled(line2.quantity, 2, '改量后行数量'),
      '行数量必须落库为 200'
    ).toBe(toScaled('200', 2, '期望数量'));
    // 单价档位切换前后必须是不同值（证明"按档重算"真实发生，而非两次同值恒等）
    expect(
      toScaled(line2.unit_price, 6, '第二档单价') !== toScaled(line1.unit_price, 6, '第一档单价'),
      '改档后单价必须与改档前不同（第一档 12.50 → 第二档 11.00）'
    ).toBe(true);
    const retainedTiers = line2.tier_pricing as Row[];
    expect(retainedTiers.length, '改量重算不得抹掉 tier_pricing 档位表').toBe(3);
    console.log(
      `[455-01] 阶梯价入库与跨档重算守恒通过 报价单=${quotationId} 一档单价=${line1.unit_price} 二档单价=${line2.unit_price} 二档金额=${line2.amount}`
    );
  });

  test('455-02 超折扣门：达档金额提交落待审批不得直接生效、未审批转单被拒、审批通过后方可转订单', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const productId = ctx.quotationProductId;
    if (productId === undefined) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
    const unit = ctx.quotationProductUnit;
    if (unit === '') throw new Error('前置缺失：ctx.quotationProductUnit 为空');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireId(me.id, '当前用户');
    const tag = genCode('Q455B');

    // 对照腿（证明档位门真实存在、不是恒待审批）：小额（< 10 万）提交走自批直接 approved
    const smallTotal = amountCents('10', '50.00'); // 500 元
    const small = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [
        {
          product_id: productId,
          unit,
          quantity: '10',
          unit_price: '50.00',
          unit_price_with_tax: '50.00',
        },
      ], `E2E-${tag}-SMALL`)
    );
    const smallId = requireId(small.id, '小额报价单');
    await apiCall(page, 'POST', `/quotations/${smallId}/submit`);
    const smallAfter = await readQuotation(page, smallId);
    expect(
      smallAfter.status,
      '低于 10 万门槛提交即自批，状态直接 approved（档位门左支）'
    ).toBe('approved');
    eqAmount(smallAfter.total_amount, smallTotal, '小额单总额=500');

    // 主腿：达到销售经理档（10 万~50 万）的大额单，提交后必须 pending_approval 而非 approved
    const bigTotal = amountCents('2000', '60.00'); // 120000 元，落 10 万~50 万档
    expect(
      bigTotal >= 10_000_000n,
      `主腿总额必须 ≥ 10 万门槛才能命中待审批档，实际(分)=${bigTotal}`
    ).toBe(true);
    const big = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [
        {
          product_id: productId,
          unit,
          quantity: '2000',
          unit_price: '60.00',
          unit_price_with_tax: '60.00',
          // 带折扣率：折扣额由服务端按 数量×单价×折扣率÷100 落到行 discount_amount，验证折扣事实入库
          discount_rate: '10',
        },
      ], `E2E-${tag}-BIG`)
    );
    const bigId = requireId(big.id, '大额报价单');
    const bigLine = singleLine(await readQuotation(page, bigId), productId, '大额单建后读回');
    eqAmount(
      bigLine.discount_amount,
      amountCents('2000', '6.00'), // 2000×60×10÷100 = 12000 元
      '折扣额=数量×单价×折扣率÷100 落库'
    );

    // 提交：大额走 BPM → pending_approval（不是直接生效）
    await apiCall(page, 'POST', `/quotations/${bigId}/submit`);
    const submitted = await readQuotation(page, bigId);
    expect(
      submitted.status,
      '达档金额提交后必须待审批，不得直接生效（quotation_ext.pending_approval）'
    ).toBe('pending_approval');
    expect(
      submitted.status !== 'approved',
      '待审批态必须区别于已审批态（防"提交即生效"假绿）'
    ).toBe(true);

    // 未审批通过时「转订单」这条腿必须被后端拒（4xx + AppError 信封，含 code/message/trace_id）
    const fConvert = await apiCallExpectFail(page, 'POST', `/quotations/${bigId}/convert`);
    expect(
      fConvert.status >= 400 && fConvert.status < 500,
      `待审批单转订单必须 4xx，实际 status=${fConvert.status}`
    ).toBe(true);
    expect(failureCode(fConvert), '待审批转单机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(requireStr(fConvert.trace_id, '待审批转单拒绝 trace_id').length, '拒绝体必须带 trace_id').toBeGreaterThan(
      0
    );
    expect(String(fConvert.message ?? '').length, '拒绝体必须带 message').toBeGreaterThan(0);
    // 被拒转单后单据仍待审批，且未被牵连出转单标记
    const stillPending = await readQuotation(page, bigId);
    expect(stillPending.status, '被拒转单后仍 pending_approval（准入门不得半改状态）').toBe(
      'pending_approval'
    );
    expect(stillPending.converted_sales_order_id, '被拒转单不得写入转单关联 id').toBeNull();

    // 审批通过（经理岗语义：持 quotations:approve 的会话批准，通过理由真实落 approval_reason）
    await apiCall(page, 'POST', `/quotations/${bigId}/approve`, {
      approval_reason: `E2E-${tag}-批准`,
    });
    const approved = await readQuotation(page, bigId);
    expect(approved.status, '审批通过后状态 approved').toBe('approved');
    expect(Number(approved.approved_by), '审批人落真实操作人').toBe(myId);
    expect(approved.approved_at, '审批时间必须写入').toBeTruthy();
    expect(String(approved.approval_reason ?? ''), '通过理由真实落库').toContain(tag);

    // 审批通过后转订单放行
    const order = await apiCallRaw<Row>(page, 'POST', `/quotations/${bigId}/convert`);
    const orderId = requireId(order.id, '报价转出的销售订单主键');
    expect(requireStr(order.order_no, '销售订单号').length, '转单成功返回真实订单号').toBeGreaterThan(0);
    expect(order.status, '转出订单为草稿 draft').toBe('draft');
    // 转单后报价单进 converted 终态并回填关联订单 id
    const converted = await readQuotation(page, bigId);
    expect(converted.status, '转单后报价单小写 converted').toBe('converted');
    expect(Number(converted.converted_sales_order_id), '回填的转单关联订单 id 一致').toBe(orderId);
    console.log(
      `[455-02] 超折扣门通过 大额单=${bigId} 待审批→拒绝转单→审批→转订单=${orderId} 小额自批单=${smallId}`
    );
  });

  test('455-03 越权面：salesperson 不持审批键与建单键均被鉴权拒 403 且目标单据零变更', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const productId = ctx.quotationProductId;
    if (productId === undefined) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
    const unit = ctx.quotationProductUnit;
    if (unit === '') throw new Error('前置缺失：ctx.quotationProductUnit 为空');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireId(me.id, '当前用户');
    const tag = genCode('Q455C');

    // 持键会话（本 worker 管理员）建一张大额单并提交到待审批，作为越权靶子
    const big = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [
        {
          product_id: productId,
          unit,
          quantity: '2000',
          unit_price: '60.00',
          unit_price_with_tax: '60.00',
        },
      ], `E2E-${tag}-TARGET`)
    );
    const bigId = requireId(big.id, '越权靶子报价单');
    await apiCall(page, 'POST', `/quotations/${bigId}/submit`);
    const target = await readQuotation(page, bigId);
    expect(target.status, '靶子提交后待审批').toBe('pending_approval');

    // 切到 salesperson 岗：不持 quotations:approve → 审批端点必 403，且不得是 200 空体
    await loginAsRole(page, 'salesperson');
    const fApprove = await apiCallExpectFail(page, 'POST', `/quotations/${bigId}/approve`, {
      approval_reason: `E2E-${tag}-越权批准`,
    });
    expect(fApprove.status, 'salesperson 直接审批应被鉴权拒 403').toBe(403);
    expect(failureCode(fApprove), '越权审批机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    // 拒绝必须是真实拒绝体而非 200 空体：403 + 字符串码已证；再钉 data 不被伪装成功
    expect(fApprove.status === 200, '越权审批绝不得 200').toBe(false);

    // salesperson 也不持 quotations:create → 建单端点同样 403
    const fCreate = await apiCallExpectFail(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [
        { product_id: productId, unit, quantity: '1', unit_price: '1.00', unit_price_with_tax: '1.00' },
      ], `E2E-${tag}-越权建单`)
    );
    expect(fCreate.status, 'salesperson 建报价单应被拒 403').toBe(403);
    expect(failureCode(fCreate), '越权建单机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 库内零变更必须用持键会话回读证明（403 会话自读不可信）
    await loginViaUI(page, testUsername(), testPassword(), true);
    const afterSalesperson = await readQuotation(page, bigId);
    expect(
      afterSalesperson.status,
      '越权审批被拒后单据仍 pending_approval（RBAC 不得半改状态）'
    ).toBe('pending_approval');
    expect(afterSalesperson.approved_by, '越权被拒不得写入审批人').toBeNull();
    expect(afterSalesperson.approved_at, '越权被拒不得写入审批时间').toBeNull();
    console.log(`[455-03] 越权面通过 salesperson 审批与建单均 403 且靶子单 ${bigId} 零变更`);
  });

  test('455-04 假成功防线：明细为空与必填缺失均被拒 4xx，重读列表确认不多出半成品单据', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const productId = ctx.quotationProductId;
    if (productId === undefined) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
    const unit = ctx.quotationProductUnit;
    if (unit === '') throw new Error('前置缺失：ctx.quotationProductUnit 为空');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireId(me.id, '当前用户');
    const tag = genCode('Q455D');

    // 基线：本客户报价单总数（用于证明非法建单一条都没落库）
    const listBefore = await apiCallRaw<Row>(
      page,
      'GET',
      `/quotations?customer_id=${ctx.customerId}&page=1&page_size=200`
    );
    const totalBefore = Number(listBefore.total);
    expect(
      Number.isFinite(totalBefore),
      `列表 total 必须为有效数字，实际 ${JSON.stringify(listBefore.total)}`
    ).toBe(true);

    // 非法 1：明细为空（validator length(min=1) 拦截，未触达落库）
    const fEmpty = await apiCallExpectFail(
      page,
      'POST',
      '/quotations',
      quotationPayload(ctx.customerId, myId, productId, unit, [], `E2E-${tag}-EMPTY`)
    );
    expect(fEmpty.status, '空明细建单必须 4xx').toBe(400);
    expect(failureCode(fEmpty), '空明细机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );

    // 非法 2：必填缺失（去 customer_id，serde 解码失败经 trace_context 收口成 400+VALIDATION_ERROR）
    const missingRequired = quotationPayload(
      ctx.customerId,
      myId,
      productId,
      unit,
      [{ product_id: productId, unit, quantity: '1', unit_price: '10.00', unit_price_with_tax: '10.00' }],
      `E2E-${tag}-NOCUST`
    );
    delete missingRequired.customer_id;
    const fMissing = await apiCallExpectFail(page, 'POST', '/quotations', missingRequired);
    expect(fMissing.status, '必填缺失建单必须 4xx').toBe(400);
    expect(failureCode(fMissing), '必填缺失机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );

    // 非法 3：单位与产品交易单位不符（validate_item_units_against_products 在事务内拒，回滚不留痕）
    const fUnit = await apiCallExpectFail(
      page,
      'POST',
      '/quotations',
      {
        ...quotationPayload(
          ctx.customerId,
          myId,
          productId,
          '公斤',
          [{ product_id: productId, unit: '公斤', quantity: '1', unit_price: '10.00', unit_price_with_tax: '10.00' }],
          `E2E-${tag}-BADUNIT`
        ),
      }
    );
    expect(fUnit.status, '单位不符建单必须 4xx').toBe(400);
    expect(failureCode(fUnit), '单位不符机器码 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );

    // 重读列表：三次非法都不得多出一条半成品，且没有半成品带本轮标记
    const listAfter = await apiCallRaw<Row>(
      page,
      'GET',
      `/quotations?customer_id=${ctx.customerId}&page=1&page_size=200`
    );
    const totalAfter = Number(listAfter.total);
    expect(totalAfter, '非法建单后本客户报价单总数不得增加（无半成品落库）').toBe(totalBefore);
    const rowsAfter = pickListArray<Row>(listAfter, 'list', '非法建单后列表');
    const rejectedMarkers = [`${tag}-EMPTY`, `${tag}-NOCUST`, `${tag}-BADUNIT`];
    const leaked = rowsAfter.filter(r => {
      const note = r.notes;
      return typeof note === 'string' && rejectedMarkers.some(m => note.includes(m));
    });
    expect(leaked.length, '列表不得出现任何被拒建单的标记行（证明事务未半落）').toBe(0);
    console.log(
      `[455-04] 假成功防线通过 空明细/缺必填/单位不符均 400，total ${totalBefore}→${totalAfter} 无半成品`
    );
  });
});
