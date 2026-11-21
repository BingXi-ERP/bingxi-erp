/**
 * 464 供应商应付汇总与发票明细的勾稽守恒断言集（ap_reconciliation 域）。
 *
 * 本文件守的缺口：现有 161-05 只钉住汇总出口的个别数值、汇总与余额出口的集合差、
 * 供应商编码名称富化，未把汇总出口与发票明细列表做「汇总 == 明细逐行累加、差额为 0」
 * 的跨口勾稽；本文件专守该守恒面，且用跨页读回明细，覆盖分页场景下的漏算。
 *
 * 调用面（backend/src/routes/finance.rs 注册，前缀 /api/v1/erp）：
 * POST /purchase/suppliers 建专属供应商；POST /ap/invoices 建应付单；
 * GET /ap/invoices 发票明细分页列表；GET /ap/invoices/{id} 详情；
 * POST /ap/invoices/{id}/approve 审核；DELETE /ap/invoices/{id} 删除；
 * GET /ap/reconciliations/summary 供应商应付汇总。
 *
 * 契约真相（逐字段对照后端源码，非推测）：
 * - 汇总出参 SupplierApSummary（backend/src/services/ap_reconciliation_ops/types.rs:34-67）：
 *   supplier_id / supplier_code / supplier_name / total_invoice_count / total_invoice_amount /
 *   total_paid_amount / total_unpaid_amount / paid_invoice_count / partial_paid_invoice_count /
 *   overdue_invoice_count / overdue_amount，全部 snake_case。
 * - 汇总口径（backend/src/services/ap_reconciliation_ops/report.rs:24-27,43-79）：从 ap_invoice
 *   按 supplier_id 全量聚合；amount_sum / paid_sum / unpaid_sum 逐行直接累加模型三列；
 *   PAID 与 PARTIAL_PAID 计数逐行判 invoice_status；overdue 判
 *   unpaid_amount > 0 且 due_date < Utc::now().date_naive()，金额取该行未付额。
 * - 明细出参为 ap_invoice::Model 序列化（backend/src/models/ap_invoice.rs:24-90）：
 *   amount / paid_amount / unpaid_amount / invoice_status / due_date（snake_case）；
 *   列表信封 PaginatedResponse（backend/src/utils/response.rs:39-45,59-66）：data.items / data.total。
 * - 建单（backend/src/services/ap_invoice_ops/crud.rs:92-118）：paid_amount 恒 0，
 *   unpaid_amount = amount - paid_amount，invoice_status 初值为 DRAFT
 *   （backend/src/models/status/general.rs:16）。故逐行恒等式 amount = paid + unpaid 成立。
 * - 成功信封机器码 code 固定 200（backend/src/utils/response.rs:88-93）。
 * - Decimal 出参是字符串，按两位小数的整数分比较；差额必须为 0 分，不做四舍五入。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, ensureTestEntities, genCode, loginViaUI } from './helpers';

type Row = Record<string, unknown>;

interface InvoicePage {
  items: Row[];
  total: number;
  page: number;
  page_size: number;
}

/** Decimal 出参折到指定标度的整数刻度；标度超出且尾数非零即抛错，不做四舍五入 */
function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出分位精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac.slice(0, scale)).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 两位小数金额字面量折分位（期望值侧唯一入口） */
function cents(want: string): bigint {
  return toScaled(want, 2, `期望金额 ${want}`);
}

/** 逐分差额断言：汇总值减去明细累加值必须恰为 0 分 */
function expectZeroDiff(actual: unknown, detailSumCents: bigint, label: string): void {
  const diff = toScaled(actual, 2, label) - detailSumCents;
  expect(diff, `${label}：汇总 - 明细累加 的差额必须为 0 分，实际=${diff} 分`).toBe(0n);
}

/** 取正整数主键，缺失或非正即抛错点名步骤 */
function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label}：无有效整数 id，raw=${JSON.stringify(v)}`);
  }
  return n;
}

/** 取非负整数计数，非整数即抛错而不是当作 0 */
function requireCount(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`${label}：计数非整数，raw=${JSON.stringify(v)}`);
  }
  return n;
}

/** 出参必须是数组，否则显式抛错（不把缺数组降级成空数组蒙过） */
function requireRows(v: unknown, label: string): Row[] {
  if (!Array.isArray(v)) {
    throw new Error(`${label}：出参必须是数组，raw=${JSON.stringify(v)}`);
  }
  return v as Row[];
}

/** 相对今天的 UTC 日历日（后端 due_date 是 NaiveDate，按 UTC 日期同基准比较） */
function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** 为本用例新建专属供应商：同 worker 共用供应商会被前序用例造数污染，绝对金额断言即失效 */
async function createDedicatedSupplier(page: Page, tag: string): Promise<number> {
  const res = await apiCall<Row>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E应付464-${tag}`,
    supplier_short_name: `E464${tag.slice(-4)}`,
    contact_phone: '13800000001',
  });
  expect(res.code, `专属供应商 ${tag} 建单必须返回机器码 200`).toBe(200);
  return requireId(res.data.id, `专属供应商 ${tag} 创建`);
}

/** 建应付单（手工建单六要素口径），返回主表整行；paid_amount 恒 0、unpaid_amount = amount */
async function createInvoice(
  page: Page,
  supplierId: number,
  amount: string,
  dueDate: string,
  notes: string
): Promise<Row> {
  const res = await apiCall<Row>(page, 'POST', '/ap/invoices', {
    supplier_id: supplierId,
    invoice_type: 'PURCHASE',
    invoice_date: utcDate(0),
    due_date: dueDate,
    amount,
    tax_amount: '0.00',
    notes,
  });
  expect(res.code, `建应付单 ${notes} 必须返回机器码 200`).toBe(200);
  return res.data;
}

/** 读汇总出口：按单一供应商过滤必须恰一行，且 supplier_id 就是过滤入参 */
async function readSummary(page: Page, supplierId: number, label: string): Promise<Row> {
  const res = await apiCall<Row[]>(
    page,
    'GET',
    `/ap/reconciliations/summary?supplier_id=${supplierId}`
  );
  expect(res.code, `${label}：汇总出口必须返回机器码 200`).toBe(200);
  const rows = requireRows(res.data, `${label}：汇总出口 data`);
  expect(rows.length, `${label}：按单一供应商过滤必须恰一行`).toBe(1);
  expect(
    String(rows[0].supplier_id),
    `${label}：汇总行 supplier_id 必须是过滤入参 ${supplierId}`
  ).toBe(String(supplierId));
  return rows[0];
}

/** 以 page_size=1 跨页读回该供应商全部发票明细：分页 total 与逐页取回行数必须一致 */
async function readAllInvoices(page: Page, supplierId: number, label: string): Promise<Row[]> {
  const first = await apiCall<InvoicePage>(
    page,
    'GET',
    `/ap/invoices?supplier_id=${supplierId}&page=1&page_size=1`
  );
  expect(first.code, `${label}：明细列表首页必须返回机器码 200`).toBe(200);
  const total = requireCount(first.data.total, `${label}：明细列表 total`);
  const items = requireRows(first.data.items, `${label}：明细列表首页 items`);
  expect(first.data.page, `${label}：首页回显 page`).toBe(1);
  expect(first.data.page_size, `${label}：首页回显 page_size`).toBe(1);

  for (let p = 2; p <= total; p++) {
    const res = await apiCall<InvoicePage>(
      page,
      'GET',
      `/ap/invoices?supplier_id=${supplierId}&page=${p}&page_size=1`
    );
    expect(res.code, `${label}：明细列表第 ${p} 页必须返回机器码 200`).toBe(200);
    expect(res.data.page, `${label}：第 ${p} 页回显 page`).toBe(p);
    expect(res.data.page_size, `${label}：第 ${p} 页回显 page_size`).toBe(1);
    items.push(...requireRows(res.data.items, `${label}：明细列表第 ${p} 页 items`));
  }
  expect(items.length, `${label}：跨页取回行数必须等于 total=${total}`).toBe(total);
  return items;
}

/**
 * 核心勾稽：汇总出口逐列 == 明细列表逐行累加，金额差额为 0 分。
 * 同时钉住逐行单据恒等式 amount = paid_amount + unpaid_amount，
 * 状态计数与逾期口径按 report.rs 的逐行判据复算。
 */
async function assertConservation(page: Page, supplierId: number, label: string): Promise<Row[]> {
  const summary = await readSummary(page, supplierId, label);
  const items = await readAllInvoices(page, supplierId, label);

  expect(
    requireCount(summary.total_invoice_count, `${label}：汇总应付张数`),
    `${label}：汇总应付张数必须等于明细行数`
  ).toBe(items.length);

  let amountSum = 0n;
  let paidSum = 0n;
  let unpaidSum = 0n;
  for (const inv of items) {
    const amount = toScaled(inv.amount, 2, `${label} 明细 amount`);
    const paid = toScaled(inv.paid_amount, 2, `${label} 明细 paid_amount`);
    const unpaid = toScaled(inv.unpaid_amount, 2, `${label} 明细 unpaid_amount`);
    amountSum += amount;
    paidSum += paid;
    unpaidSum += unpaid;
    expect(
      amount - paid - unpaid,
      `${label}：单据 ${String(inv.invoice_no)} 必须满足 amount = paid_amount + unpaid_amount`
    ).toBe(0n);
    expect(
      ['DRAFT', 'AUDITED', 'PARTIAL_PAID', 'PAID', 'CANCELLED'],
      `${label}：invoice_status 必须落在 ap_invoice 词表，实际=${String(inv.invoice_status)}`
    ).toContain(String(inv.invoice_status));
  }

  expectZeroDiff(
    summary.total_invoice_amount,
    amountSum,
    `${label}：应付合计 total_invoice_amount`
  );
  expectZeroDiff(summary.total_paid_amount, paidSum, `${label}：已付合计 total_paid_amount`);
  expectZeroDiff(summary.total_unpaid_amount, unpaidSum, `${label}：未付合计 total_unpaid_amount`);

  const paidRows = items.filter(inv => String(inv.invoice_status) === 'PAID');
  const partialRows = items.filter(inv => String(inv.invoice_status) === 'PARTIAL_PAID');
  expect(
    requireCount(summary.paid_invoice_count, `${label}：汇总已付清张数`),
    `${label}：汇总已付清张数必须等于明细 PAID 行数`
  ).toBe(paidRows.length);
  expect(
    requireCount(summary.partial_paid_invoice_count, `${label}：汇总部分付款张数`),
    `${label}：汇总部分付款张数必须等于明细 PARTIAL_PAID 行数`
  ).toBe(partialRows.length);

  // report.rs: overdue 判 unpaid_amount > 0 且 due_date < 今天，金额取该行未付额
  const today = utcDate(0);
  const overdueRows = items.filter(inv => {
    const unpaid = toScaled(inv.unpaid_amount, 2, `${label} 逾期判据 unpaid_amount`);
    return unpaid > 0n && String(inv.due_date) < today;
  });
  expect(
    requireCount(summary.overdue_invoice_count, `${label}：汇总逾期张数`),
    `${label}：汇总逾期张数必须等于明细逾期行数`
  ).toBe(overdueRows.length);
  const overdueSum = overdueRows.reduce(
    (acc, inv) => acc + toScaled(inv.unpaid_amount, 2, `${label} 逾期 unpaid_amount`),
    0n
  );
  expectZeroDiff(summary.overdue_amount, overdueSum, `${label}：逾期金额 overdue_amount`);

  return items;
}

test.describe.serial('464 供应商应付汇总对发票明细的勾稽守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('464-01 汇总逐列等于发票明细跨页累加，三项金额差额全为 0', async ({ page }) => {
    const tag = genCode('E464A');
    const supplierId = await createDedicatedSupplier(page, tag);
    const amounts = ['1234.56', '2345.67', '3456.78'];
    for (let i = 0; i < amounts.length; i++) {
      const inv = await createInvoice(
        page,
        supplierId,
        amounts[i],
        utcDate(-10),
        `${tag}-票${i + 1}`
      );
      requireId(inv.id, `${tag}-票${i + 1} 主键`);
    }

    const items = await assertConservation(page, supplierId, `${tag}-三票`);

    // 反空集假绿：本用例必须真的取回三行，且明细累加额恰为三张建单金额之和
    expect(items.length, `${tag}：必须取回三张发票明细`).toBe(3);
    const expectedSum = amounts.reduce((acc, a) => acc + cents(a), 0n);
    const actualSum = items.reduce(
      (acc, inv) => acc + toScaled(inv.amount, 2, `${tag} 明细 amount`),
      0n
    );
    expect(actualSum, `${tag}：明细累加额必须等于建单金额之和`).toBe(expectedSum);
  });

  test('464-02 审核与删除后汇总对明细重算仍守恒，差额保持 0', async ({ page }) => {
    const tag = genCode('E464B');
    const supplierId = await createDedicatedSupplier(page, tag);
    const invoiceA = await createInvoice(page, supplierId, '1000.00', utcDate(-12), `${tag}-A`);
    const invoiceB = await createInvoice(page, supplierId, '2000.00', utcDate(-12), `${tag}-B`);
    await createInvoice(page, supplierId, '3000.00', utcDate(-12), `${tag}-C`);

    const approve = await apiCall<Row>(
      page,
      'POST',
      `/ap/invoices/${requireId(invoiceA.id, `${tag}-A 主键`)}/approve`
    );
    expect(approve.code, `${tag}：审核应付单必须返回机器码 200`).toBe(200);

    const three = await assertConservation(page, supplierId, `${tag}-审核后`);
    expect(three.length, `${tag}：审核不改变张数，仍为三张`).toBe(3);

    const invoiceBId = requireId(invoiceB.id, `${tag}-B 主键`);
    const beforeDelete = await apiCall<Row>(page, 'GET', `/ap/invoices/${invoiceBId}`);
    expect(beforeDelete.code, `${tag}：删除前详情必须返回机器码 200`).toBe(200);
    expect(String(beforeDelete.data.invoice_status), `${tag}：待删票必须仍在草稿态`).toBe('DRAFT');

    const del = await apiCall<Row>(page, 'DELETE', `/ap/invoices/${invoiceBId}`);
    expect(del.code, `${tag}：删除应付单必须返回机器码 200`).toBe(200);

    const two = await assertConservation(page, supplierId, `${tag}-删除后`);
    expect(two.length, `${tag}：删除后明细必须剩两张`).toBe(2);
    expect(
      two.map(inv => String(inv.id)),
      `${tag}：被删票不得再出现在明细中`
    ).not.toContain(String(invoiceBId));
    expect(
      two.reduce((acc, inv) => acc + toScaled(inv.amount, 2, `${tag} 删除后 amount`), 0n),
      `${tag}：删除后剩余金额必须等于 A + C`
    ).toBe(cents('4000.00'));
  });
});
