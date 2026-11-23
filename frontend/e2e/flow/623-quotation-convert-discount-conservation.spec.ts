// 623 报价转销售订单：行级折扣继承与单头守恒、二次转单状态门幂等
//
// 六要素·功能：把 approved 报价按真实 convert 端点转成销售订单，逐字段核行折扣继承与
//   单头 subtotal/discount/tax/total/balance 守恒，并核二次 convert 不落第二张订单。
// 六要素·调用方：E2E 回归套件（diagnose-fixture 注入 worker 独立登录态），由 CI 联动专项腿执行。
// 六要素·入参：worker 自建报价专用产品与单位（getCtx().quotationProductId/Unit）、自建客户、
//   两条不同折扣率（8 与 12）的报价明细、POST /quotations/{id}/convert 无 JSON 体。
// 六要素·存什么：报价单头/行金额、订单单头与 items[] 的折扣和金额、报价 converted 状态与
//   converted_sales_order_id、二次转单的 AppError 机器码与失败文案。
// 六要素·存哪里：sales_quotations / sales_quotation_items / sales_orders / sales_order_items
//   （只读经 GET /quotations/{id}、GET /sales/orders/{id}、GET /sales/orders?customer_id=）。
// 六要素·检测力自证：两行折扣率不同且 discount_amount 非零；改动任一继承值或单头守恒即判红；
//   二次转单必须 4xx 且首张订单/来源回指不变；金额一律 Decimal 字符串折 BigInt 整数分逐位相等，
//   不用浮点、不用 toBeCloseTo，缺键直接抛错不回落默认值。
//
// 源码判据（逐条对照写入方，不改口径）：
// - services/quotation_convert_service.rs:284,288 行 discount_percent = 报价行 discount_rate、
//   discount_amount = 报价行 discount_amount；:196 单头 discount_amount 写 Decimal::ZERO。
// - 同文件 :270-300：行 subtotal=报价行 amount、tax_amount=amount_with_tax-amount、
//   total_amount=amount_with_tax；单头 subtotal/tax/total 直搬报价头，balance=total。
//   故守恒断言落在单头（discount_amount=0 时 subtotal-discount+tax=total 恒成立）。
//   行级存在 total_amount=subtotal+tax、并未扣 discount_amount 的实现事实；若按"行也要扣折扣后守恒"
//   断言，会对真实后端得到假红。该口径冲突只登记，不在本用例臆造断言。
// - models/sales_quotation.rs:38-40 单头 subtotal/tax_amount/total_amount 为 Decimal；
//   models/quotation_create_dto.rs:53-65 建单只收 discount_rate，discount_amount 由
//   services/quotation_ops/crud.rs:185 按 数量×单价×率/100 落库（两位 round_dp）。
// - 端点：routes/quotations.rs:29 POST /quotations/{id}/convert；出参 SalesOrderResponse
//   （handlers/quotation_handler.rs:90）仅含 id/order_no/customer_id/total_amount/status/created_at。
//   报告中的 GET /sales-orders/{id} 需核对：真实订单详情是 routes/mod.rs:518 nest 的
//   /api/v1/erp/sales + routes/sales.rs:25 的 /orders/{id}；/sales-orders/{id} 属客户门户另一端点，
//   本例只用 /sales/orders/{id}（出参 SalesOrderDetail/ItemDetail，snake_case）。
// - 审批前置：金额远低于 10 万走 submit 自批（quotation_approval_service.rs:42）；若配置改道
//   pending_approval，则补 POST /approve 走完真实审批链，不跳过状态门。
// - 幂等：无 quotation_id 唯一键、无已生成订单查询，靠 status != "approved" 状态门二次拒绝
//   （services/quotation_convert_service.rs:124-129），不是返回同一订单。
// - 错误体只有 AppError：字符串码 BUSINESS_ERROR（utils/error.rs），无数字 code 旁路。
import { test, expect } from '../diagnose-fixture';
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
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRow(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new Error(`${label} 必须是 JSON 对象，实际 ${JSON.stringify(value)?.slice(0, 200)}`);
  }
  return value;
}

function readRows(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组，实际 ${typeof value}`);
  return value.map((row, i) => requireRow(row, `${label}[${i}]`));
}

function requirePositiveId(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${label} 非正整数，实际 ${JSON.stringify(value)}`);
  return n;
}

/** Decimal 出参（string|number）折 BigInt 分位；超两位小数且尾数非零即抛错，不静默截断。 */
function cents(value: unknown, label: string): bigint {
  const s =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label} 非 Decimal 线格式，raw=${JSON.stringify(value)}`);
  const fraction = (m[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超两位，raw=${s}`);
  }
  const n = BigInt(m[2] ?? '0') * 100n + BigInt(fraction.slice(0, 2) || '0');
  return m[1] === '-' ? -n : n;
}

/** 折扣率是百分数（8/12），按两位整数分比较即可逐位等值，不引入浮点。 */
function percentCents(value: unknown, label: string): bigint {
  return cents(value, label);
}

function eqCents(actual: unknown, expected: bigint, label: string): void {
  const got = cents(actual, label);
  expect(got, `${label}（BigInt 分位）实际 ${got}，期望 ${expected}`).toBe(expected);
}

async function readQuotation(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return requireRow(await apiCallRaw(page, 'GET', `/quotations/${id}`), `报价 ${id} 详情`);
}

async function readOrder(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return requireRow(await apiCallRaw(page, 'GET', `/sales/orders/${id}`), `订单 ${id} 详情`);
}

/** 按 sequence 找报价行（两行同产品，sequence 是本例建单时显式写入的唯一行标）。 */
function quotationLine(quotation: Row, sequence: number): Row {
  const hits = readRows(quotation.items, '报价明细 items').filter(
    row => Number(row.sequence) === sequence
  );
  if (hits.length !== 1) {
    throw new Error(`报价行 sequence=${sequence} 应唯一，实际命中 ${hits.length} 行`);
  }
  return hits[0]!;
}

/** 按 subtotal 找订单行（convert 把报价行 amount 原样写为订单行 subtotal，逐行唯一）。 */
function orderLine(order: Row, subtotalCentsValue: bigint): Row {
  const hits = readRows(order.items, '订单明细 items').filter(
    row => cents(row.subtotal, '订单行 subtotal') === subtotalCentsValue
  );
  if (hits.length !== 1) {
    throw new Error(`订单行 subtotal=${subtotalCentsValue} 应唯一，实际命中 ${hits.length} 行`);
  }
  return hits[0]!;
}

/** 按本例唯一 notes 标签扫订单列表；列表按 created_at desc，二次误建的新单必在首页。 */
async function countOrdersByTag(
  page: import('@playwright/test').Page,
  customerId: number,
  tag: string
): Promise<number> {
  const res = requireRow(
    await apiCallRaw(page, 'GET', `/sales/orders?customer_id=${customerId}&page=1&page_size=100`),
    '销售订单列表'
  );
  const rows = pickListArray<Row>(res, 'items', '销售订单列表');
  return rows.filter(row => typeof row.notes === 'string' && row.notes.includes(tag)).length;
}

test.describe('623 报价转单折扣与金额守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('623-01 两档折扣行继承、单头守恒，二次转单 4xx 且不落第二张订单', async ({ page }) => {
    test.setTimeout(300_000);
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const customerId = ctx.customerId;
    if (productId === undefined || customerId === undefined) {
      throw new Error('前置缺失：报价专用产品或客户未就绪');
    }
    const unit = ctx.quotationProductUnit;
    if (typeof unit !== 'string' || unit === '') {
      throw new Error('前置缺失：报价产品落库单位未就绪，禁用硬编码单位');
    }
    const tag = genCode('623-Q2O');
    const today = new Date().toISOString().slice(0, 10);
    const validUntil = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // 两行不同折扣率：8% 与 12%，总金额 100*12.50 + 80*10.00 = 2050 元，远低于自批阈值 10 万。
    // discount_amount 由后端按 数量×单价×率/100 落库，本例不在 payload 里伪造该列。
    const created = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
      customer_id: customerId,
      sales_user_id: 0,
      quotation_date: today,
      valid_until: validUntil,
      currency: 'CNY',
      exchange_rate: '1',
      base_currency: 'CNY',
      price_terms: 'FOB',
      tax_inclusive: false,
      tax_rate: '0',
      notes: `E2E-${tag}-HEAD`,
      items: [
        {
          product_id: productId,
          unit,
          sequence: 1,
          quantity: '100',
          unit_price: '12.50',
          unit_price_with_tax: '12.50',
          discount_rate: '8',
          notes: `E2E-${tag}-L1`,
        },
        {
          product_id: productId,
          unit,
          sequence: 2,
          quantity: '80',
          unit_price: '10.00',
          unit_price_with_tax: '10.00',
          discount_rate: '12',
          notes: `E2E-${tag}-L2`,
        },
      ],
    });
    const quotationId = requirePositiveId(created.data?.id, '报价单主键');

    const before = await readQuotation(page, quotationId);
    expect(before.status, '新建报价单应为小写 draft').toBe('draft');
    const q1 = quotationLine(before, 1);
    const q2 = quotationLine(before, 2);
    eqCents(q1.discount_amount, 10000n, '报价行1 折扣额=100×12.50×8%');
    eqCents(q2.discount_amount, 9600n, '报价行2 折扣额=80×10.00×12%');
    expect(
      percentCents(q1.discount_rate, '报价行1 折扣率') !==
        percentCents(q2.discount_rate, '报价行2 折扣率'),
      '两行折扣率必须真实不同（8 与 12），否则本例无检测力'
    ).toBe(true);

    await apiCall(page, 'POST', `/quotations/${quotationId}/submit`);
    let approved = await readQuotation(page, quotationId);
    if (approved.status !== 'approved') {
      await apiCall(page, 'POST', `/quotations/${quotationId}/approve`);
      approved = await readQuotation(page, quotationId);
    }
    expect(approved.status, 'convert 前置必须是 approved，不得跳过审批链').toBe('approved');

    const beforeHits = await countOrdersByTag(page, customerId, tag);
    expect(beforeHits, '转单前本标签订单应恰好零张').toBe(0);

    const converted = await apiCall<{ id?: number; total_amount?: unknown }>(
      page,
      'POST',
      `/quotations/${quotationId}/convert`
    );
    const orderId = requirePositiveId(converted.data?.id, '转出销售订单主键');
    const q1After = quotationLine(await readQuotation(page, quotationId), 1);
    const q2After = quotationLine(await readQuotation(page, quotationId), 2);

    const order = await readOrder(page, orderId);
    const o1 = orderLine(order, cents(q1After.amount, '报价行1 amount'));
    const o2 = orderLine(order, cents(q2After.amount, '报价行2 amount'));

    // 行级继承：discount_percent 逐字符等于报价 discount_rate，discount_amount 逐分相等
    expect(
      percentCents(o1.discount_percent, '订单行1 discount_percent'),
      '行1 折扣率须照抄报价行，不换算不取整'
    ).toBe(percentCents(q1After.discount_rate, '报价行1 discount_rate'));
    expect(
      percentCents(o2.discount_percent, '订单行2 discount_percent'),
      '行2 折扣率须照抄报价行，不换算不取整'
    ).toBe(percentCents(q2After.discount_rate, '报价行2 discount_rate'));
    eqCents(
      o1.discount_amount,
      cents(q1After.discount_amount, '报价行1 discount_amount'),
      '订单行1 折扣额'
    );
    eqCents(
      o2.discount_amount,
      cents(q2After.discount_amount, '报价行2 discount_amount'),
      '订单行2 折扣额'
    );
    expect(
      percentCents(o1.discount_percent, '行1 折扣率') !==
        percentCents(o2.discount_percent, '行2 折扣率'),
      '两订单行折扣率必须保留差异，防止统一覆盖成同一值'
    ).toBe(true);

    // 单头守恒（BigInt 整数分）：主表 discount_amount=0，subtotal-0+tax=total=balance=报价 total
    eqCents(order.subtotal, cents(approved.subtotal, '报价单头 subtotal'), '订单单头 subtotal');
    eqCents(
      order.tax_amount,
      cents(approved.tax_amount, '报价单头 tax_amount'),
      '订单单头 tax_amount'
    );
    eqCents(order.discount_amount, 0n, '订单单头 discount_amount');
    eqCents(
      cents(order.subtotal, '订单单头 subtotal') -
        cents(order.discount_amount, '订单单头 discount_amount') +
        cents(order.tax_amount, '订单单头 tax_amount'),
      cents(order.total_amount, '订单单头 total_amount'),
      '订单单头 subtotal-discount+tax=total'
    );
    eqCents(
      order.total_amount,
      cents(approved.total_amount, '报价单头 total_amount'),
      '订单总额=报价总额'
    );
    eqCents(order.balance_amount, cents(order.total_amount, '订单总额'), '订单余额=订单总额');
    eqCents(
      converted.data?.total_amount,
      cents(order.total_amount, '订单详情总额'),
      'convert 出参总额'
    );

    const afterHits = await countOrdersByTag(page, customerId, tag);
    expect(afterHits, '一次 convert 只应落一张同源订单').toBe(1);

    // 二次转单：状态门拒绝（非 2xx + BUSINESS_ERROR），不返回同一订单、不新建第二张
    const second = await apiCallExpectFail(page, 'POST', `/quotations/${quotationId}/convert`);
    expect(
      second.status >= 200 && second.status < 300,
      `二次转单必须非 2xx，实际 ${second.status}`
    ).toBe(false);
    expect(failureCode(second), '失败码须为 AppError 字符串 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(second.message ?? ''), '拒绝文案应点名 approved 状态门').toContain('approved');

    const afterSecond = await readQuotation(page, quotationId);
    expect(afterSecond.status, '二次被拒后报价仍为 converted').toBe('converted');
    expect(
      requirePositiveId(afterSecond.converted_sales_order_id, '报价来源回指订单 id'),
      '来源回指必须仍是首张订单，不得改指新单'
    ).toBe(orderId);
    expect(
      await countOrdersByTag(page, customerId, tag),
      '二次 convert 被拒后同源订单不得增到两张'
    ).toBe(1);
    const firstStill = await readOrder(page, orderId);
    expect(
      readRows(firstStill.items, '首张订单明细').length,
      '首张订单明细不得被二次转单改写'
    ).toBe(2);
  });
});
