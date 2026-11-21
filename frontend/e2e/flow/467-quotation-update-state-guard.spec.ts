/**
 * 467 报价单改单状态守卫：仅 draft/rejected 可改，已提交/已审批态 PUT /quotations/{id} 必被拒
 *
 * 本文件钉死的业务事实（逐条对照后端源码写入方，非推测）：
 * 1. 状态门唯一事实源：backend/src/services/quotation_ops/update.rs:65-72 load_for_update——
 *    仅 quotation_status::DRAFT/REJECTED（models/status/sales.rs 的 quotation 子模块，小写
 *    draft/rejected）可进更新事务；其他状态在 lock_exclusive 行锁内返回
 *    AppError::business_displayable("当前状态不允许此操作")。
 * 2. 失败信封形状：utils/error.rs BusinessErrorDisplayable → HTTP 400、机器码 BUSINESS_ERROR
 *    （error.rs:825 与 BusinessError 同码），且 message 外显真实文案（error.rs:851
 *    display_message 对 Displayable 变体返回原文，单测 business_displayable_exposes_real_message
 *    钉死）——故本文件断言 message 含"当前状态不允许此操作"逐字子串。
 * 3. 提交审批档位：quotation_approval_service.rs ApproverRole::from_amount 以
 *    AMOUNT_THRESHOLD_SELF=100000 分档——total_amount < 10 万提交即销售员自批直接 approved；
 *    达到 10 万走 submit_to_bpm 落 pending_approval（quotation_ext 词表）。
 *    两条守卫腿各造一档：467-02 钉已提交（pending_approval），467-03 钉已审批（approved），
 *    两态都必然命中状态门，guard 分支不区分具体阻塞态。
 * 4. 对照腿（467-01）：draft 态同一 PUT 端点改单必须成功且详情回读逐字段等于提交值——
 *    证明"路径/权限/DTO 形状"本身通，排除"守卫腿的 400 其实是权限或解码失败"的假阳性。
 * 5. 反假成功（零漂移）：守卫腿拒绝后 GET /quotations/{id} 重读，整棵响应树（含 updated_at
 *    与 items[]）与拒绝前快照 toEqual 全等——拒绝不落任何副作用（update.rs 状态门在事务内
 *    apply_field_updates 之前返回，理论零写入，测试面坐实）。
 *
 * 造数范式：夹具实体走 flow/helpers 的 ensureTestEntities（ctx.customerId /
 * ctx.quotationProductId / ctx.quotationProductUnit）；建单入参逐字段对照
 * backend/src/models/quotation_create_dto.rs 的 CreateQuotationDto/CreateQuotationItemDto；
 * PUT 入参对照 backend/src/models/quotation_update_dto.rs 的 UpdateQuotationDto（全量替换明细
 * 用 items）。tax_inclusive=false、tax_rate=0 使 total_amount=Σ(数量×净单价)，档位判据（10 万）
 * 与税额噪声无关。
 *
 * 状态词表（写入方 models/status/sales.rs::quotation，小写）：draft / approved / rejected /
 * cancelled；扩展态 quotation_ext：pending_approval / expired / converted。断言值与写入值
 * 逐字符相同，禁止英文化或大小写改写。
 *
 * 出参键名以实体/DTO 为准（snake_case）：详情腿 get_quotation（handlers/quotation_handler.rs）
 * 出 QuotationResponseDto 含 items[]；行腿键取 models/sales_quotation_item.rs
 * （quantity/unit_price/amount/amount_with_tax）。金额线格式：subtotal/tax_amount/total_amount
 * 与行 amount 是 DECIMAL(18,2)（出参字符串），unit_price/unit_price_with_tax 是 DECIMAL(18,6)。
 */
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
  loginViaUI,
} from './helpers';

type Row = Record<string, unknown>;

/** 状态门外显文案（update.rs:69-70 business_displayable 入参，逐字符） */
const STATE_GATE_MESSAGE = '当前状态不允许此操作';

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
  const padded = intPart + frac.slice(0, scale).padEnd(scale, '0');
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

/** 详情腿读回单头（QuotationResponseDto 扁平，不信建单/改单出参本身） */
async function readQuotation(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
}

/** 详情腿读回的明细行（items[]），缺 items 键即点名（不兜底空数组掩盖缺键） */
function quoteItems(detail: Row, label: string): Row[] {
  if (!Object.prototype.hasOwnProperty.call(detail, 'items')) {
    throw new Error(
      `${label}：报价详情出参缺 items 键，零漂移断言无行腿对照面，实际键=${Object.keys(detail).join(',')}`
    );
  }
  const items = detail.items as Row[];
  expect(Array.isArray(items), `${label}：items 必须为数组`).toBe(true);
  return items;
}

/** 取本用例引用产品的报价行（单行场景按 product_id 命中），缺行或多行即点名 */
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
 * 报价建单入参（逐字段对照 CreateQuotationDto）：tax_inclusive=false、tax_rate=0 使
 * total_amount=Σ(数量×净单价)；unit 逐字符取夹具产品的真实交易单位
 * （后端 validate_item_units_against_products 强门）。
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

/**
 * 改单入参（逐字段对照 UpdateQuotationDto）：notes 标量腿 + items 全量替换明细腿同时给，
 * 保证守卫腿被拒的 PUT 是"形状合法、若状态门放行必然生效"的请求——拒绝只能归因于状态门，
 * 不能是解码或校验失败。
 */
function updatePayload(productId: number, unit: string, notes: string): Row {
  return {
    notes,
    items: [
      {
        product_id: productId,
        unit,
        quantity: '25',
        unit_price: '40.00',
        unit_price_with_tax: '40.00',
      },
    ],
  };
}

/** 金额构造：数量(分)×单价(百万分之一) ÷ 10^6 折 2 位标度分（入参整分整百，整除无损） */
function amountCents(quantity: string, unitPrice: string): bigint {
  const q = toScaled(quantity, 2, `数量 ${quantity}`);
  const p = toScaled(unitPrice, 6, `单价 ${unitPrice}`);
  const prod = q * p;
  if (prod % 1_000_000n !== 0n) {
    throw new Error(`金额构造非整分：数量=${quantity} 单价=${unitPrice}`);
  }
  return prod / 1_000_000n;
}

/**
 * 守卫腿公共断言：PUT 必 400 + BUSINESS_ERROR + 外显文案含状态门原句 + trace_id 回填；
 * 再整树 toEqual 证明拒绝零副作用。文案断言依据 error.rs:851 display_message 对
 * BusinessErrorDisplayable 返回原文（与 expectStateGateRejection 不读文案的通用范式不同，
 * 本守卫的文案是"只涉及当前用户自己的业务规则"的安全外显点，单测已钉死）。
 */
async function expectUpdateRejectedNoDrift(
  page: Page,
  quotationId: number,
  productId: number,
  unit: string,
  label: string
): Promise<void> {
  const snapshot = await readQuotation(page, quotationId);
  expect(snapshot.id, `${label}：快照主键`).toBe(quotationId);

  const rejected = await apiCallExpectFail(
    page,
    'PUT',
    `/quotations/${quotationId}`,
    updatePayload(productId, unit, `${label}-被状态门拦下的改单`)
  );
  expect(rejected.status, `${label}：状态门必须 HTTP 400`).toBe(400);
  expect(failureCode(rejected), `${label}：机器码必须 BUSINESS_ERROR`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
  expect(rejected.message, `${label}：外显文案必须含状态门原句`).toContain(STATE_GATE_MESSAGE);
  expect(
    typeof rejected.trace_id === 'string' && rejected.trace_id !== '',
    `${label}：失败信封必须回填 trace_id`
  ).toBe(true);

  const after = await readQuotation(page, quotationId);
  expect(after, `${label}：拒绝后整树零漂移（含 updated_at 与 items[]）`).toEqual(snapshot);
}

test.describe('467 报价单改单状态守卫', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('467-01 对照腿：draft 态 PUT 改单成功且详情回读逐字段等于提交值', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const productId = ctx.quotationProductId;
    if (productId === undefined) {
      throw new Error(
        '前置缺失：ctx.quotationProductId 未就绪（改单行必须引用单位已知的自建产品）'
      );
    }
    const unit = ctx.quotationProductUnit;
    if (unit === '') throw new Error('前置缺失：ctx.quotationProductUnit 为空');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireId(me.id, '当前用户');
    const tag = genCode('Q467A');

    // 小额草稿单：10×50=500 元，与守卫腿小额档一致，唯一变量是是否经过 submit
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(
        ctx.customerId,
        myId,
        productId,
        unit,
        [
          {
            product_id: productId,
            unit,
            quantity: '10',
            unit_price: '50.00',
            unit_price_with_tax: '50.00',
          },
        ],
        `E2E-${tag}-DRAFT`
      )
    );
    const id = requireId(created.id, '467-01 草稿报价单');
    requireStr(created.quotation_no, '467-01 报价单号');

    const draft = await readQuotation(page, id);
    expect(draft.status, '467-01：建单后初始状态必须 draft').toBe('draft');
    expect(draft.notes, '467-01：建单备注落库').toBe(`E2E-${tag}-DRAFT`);
    eqAmount(singleLine(draft, productId, '467-01 建后行').amount, 50_000n, '467-01 建后行金额');

    // 改单：notes 标量 + 明细全量替换（10×50 → 25×40），tax_rate=0 故小计=行金额
    const put = await apiCall<Row>(
      page,
      'PUT',
      `/quotations/${id}`,
      updatePayload(productId, unit, `E2E-${tag}-UPDATED`)
    );
    expect(put.data.status, '467-01：改单腿出参状态必须仍是 draft（update 不推进状态）').toBe(
      'draft'
    );

    const updated = await readQuotation(page, id);
    expect(updated.status, '467-01：改单后重读状态仍 draft').toBe('draft');
    expect(
      updated.notes,
      '467-01：PUT 提交的 notes 必须落库（对照腿证明改单链路通，排除假阳性）'
    ).toBe(`E2E-${tag}-UPDATED`);
    const line = singleLine(updated, productId, '467-01 改后行');
    eqAmount(line.quantity, 2_500n, '467-01 改后行数量=25');
    expect(toScaled(line.unit_price, 6, '467-01 改后行单价'), '467-01 改后行单价=40.00').toBe(
      toScaled('40.00', 6, '467-01 期望单价')
    );
    eqAmount(line.amount, 100_000n, '467-01 改后行金额=25×40');
    eqAmount(updated.subtotal, 100_000n, '467-01 改后小计重算');
    eqAmount(updated.total_amount, 100_000n, '467-01 改后总额重算');
  });

  test('467-02 守卫腿：已提交（pending_approval）态 PUT 改单必 400+BUSINESS_ERROR 且零漂移', async ({
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
    const tag = genCode('Q467B');

    // 大额单：2000×60=120000 元 ≥ 10 万门槛 → 提交走 BPM 落 pending_approval（不设折扣率，
    // 排除超折扣门取更严者的噪声，唯一变量是金额档位）
    const bigTotal = amountCents('2000', '60.00');
    expect(
      bigTotal >= 10_000_000n,
      `467-02 前置自检：总额(分)=${bigTotal} 必须达到 10 万自批门槛才能命中待审批档`
    ).toBe(true);
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(
        ctx.customerId,
        myId,
        productId,
        unit,
        [
          {
            product_id: productId,
            unit,
            quantity: '2000',
            unit_price: '60.00',
            unit_price_with_tax: '60.00',
          },
        ],
        `E2E-${tag}-BIG`
      )
    );
    const id = requireId(created.id, '467-02 大额报价单');

    await apiCall(page, 'POST', `/quotations/${id}/submit`);
    const submitted = await readQuotation(page, id);
    expect(
      submitted.status,
      '467-02：达档提交后必须 pending_approval（若此断言红先查自批阈值配置，不改测试口径）'
    ).toBe('pending_approval');

    await expectUpdateRejectedNoDrift(page, id, productId, unit, '467-02 已提交态守卫');
    const after = await readQuotation(page, id);
    expect(
      after.status,
      '467-02：拒绝后状态必须仍是 pending_approval（不得被改单请求推进或回退）'
    ).toBe('pending_approval');
  });

  test('467-03 守卫腿：已审批（approved）态 PUT 改单必 400+BUSINESS_ERROR 且零漂移', async ({
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
    const tag = genCode('Q467C');

    // 小额单：20×30=600 元 < 10 万门槛 → 提交即销售员自批直接 approved（免 approve 端点
    // 造 approved 态，轻量且与 455-02 已钉的自批档位行为一致）
    const created = await apiCallRaw<Row>(
      page,
      'POST',
      '/quotations',
      quotationPayload(
        ctx.customerId,
        myId,
        productId,
        unit,
        [
          {
            product_id: productId,
            unit,
            quantity: '20',
            unit_price: '30.00',
            unit_price_with_tax: '30.00',
          },
        ],
        `E2E-${tag}-APPROVED`
      )
    );
    const id = requireId(created.id, '467-03 小额报价单');

    await apiCall(page, 'POST', `/quotations/${id}/submit`);
    const submitted = await readQuotation(page, id);
    expect(
      submitted.status,
      '467-03：低于门槛提交即自批，状态直接 approved（若此断言红先查自批阈值配置，不改测试口径）'
    ).toBe('approved');

    await expectUpdateRejectedNoDrift(page, id, productId, unit, '467-03 已审批态守卫');
    const after = await readQuotation(page, id);
    expect(after.status, '467-03：拒绝后状态必须仍是 approved').toBe('approved');
  });
});
