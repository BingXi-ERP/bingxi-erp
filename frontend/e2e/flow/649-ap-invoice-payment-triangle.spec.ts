/**
 * 功能：锁定「应付发票逐页累加 ↔ 余额汇总 ↔ 已确认付款」三角守恒。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属供应商（共享供应商会被前序用例造数污染，绝对断言即失效），
 *   建四张应付单——两张审核入账、一张停留草稿、一张审核后取消；对第一张做部分付款全链。
 * - 入参：发票 300.00 / 150.50（草稿）/ 200.00（取消）/ 300.00（付款标的），部分付款 120.00；
 *   手工建单六要素口径，金额一律两位小数字符串。
 * - 传给谁：POST /purchase/suppliers、/ap/invoices、/ap/invoices/{id}/approve|cancel、
 *   /ap/payment-requests（submit/approve）、/ap/payments、PUT /ap/payments/{id}、
 *   /ap/payments/{id}/confirm；GET /ap/invoices?supplier_id= 分页、/ap/invoices/balance?supplier_id=、
 *   /ap/payments?supplier_id= 分页。
 * - 存什么：余额汇总由 ap_invoice_ops/report.rs:95-130 应用层求和并排除 DRAFT/CANCELLED，
 *   返回 BalanceSummary{total_invoice_amount,total_paid_amount,total_unpaid_amount,invoice_count}；
 *   付款确认由 ap_payment_service.rs 按明细分摊回写 paid/unpaid。
 * - 断言什么：逐页发票累加（排除 invoice_status 为 DRAFT/CANCELLED）与汇总三额逐分相等且
 *   invoice_count 相等；CONFIRMED 付款单 payment_amount 之和 == total_paid_amount == 已付明细累加，
 *   三角差额按 BigInt 分位为 0；草稿与取消单不计入任何一口。
 * - 前置：ctx 基础实体就绪；禁 Number 相等，禁兜底掩盖缺键。
 * - 不重复：04-02 只钉单张发票付款前后，160 只钉报表三口契约，464 只钉供应商汇总守恒，
 *   本例钉「明细累加-余额汇总-付款台账」三角互证。
 */
import { test, expect } from '../diagnose-fixture';
import {
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
  type ApiRequestBody,
} from './helpers';
import { pickListArray } from './ui-helpers';
import { type Page } from '@playwright/test';

type Row = Record<string, unknown>;
const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

/** 两位小数定标：Decimal 出参转 BigInt 分位，标度外尾数非零直接抛错（静默截断即假绿）。 */
function toCents(v: unknown, label: string): bigint {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if (!m) throw new Error(`[649] ${label} Decimal 出参形态非法：${JSON.stringify(v)}`);
  const [, sign, int, frac = ''] = m;
  if (frac.length > 2 && frac.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`[649] ${label} 标度超过 2 位且尾数非零：${raw}`);
  }
  const cents = BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
  return sign === '-' ? -cents : cents;
}

function requireId(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(
    Number.isFinite(n) && n > 0,
    `[649] ${label} 须返回正整数 id，实际 ${JSON.stringify(v)}`
  ).toBe(true);
  return n;
}

/** 以 page_size=100 跨页读回该供应商全部发票行，total 与逐页行数必须一致。 */
async function readAllInvoices(page: Page, supplierId: number): Promise<Row[]> {
  const first = await dwbGet<{ items?: Row[]; total?: number }>(
    page,
    `/ap/invoices?supplier_id=${supplierId}&page=1&page_size=100`
  );
  const total = requireId(first.total, '发票列表 total');
  const rows = pickListArray({ items: first.items }, 'items', '[649] 发票首页');
  for (let p = 2; rows.length < total; p++) {
    const more = await dwbGet<{ items?: Row[] }>(
      page,
      `/ap/invoices?supplier_id=${supplierId}&page=${p}&page_size=100`
    );
    rows.push(...pickListArray({ items: more.items }, 'items', `[649] 发票第 ${p} 页`));
  }
  expect(rows.length, '[649] 逐页发票行数必须等于 total').toBe(total);
  return rows;
}

async function readAllPayments(page: Page, supplierId: number): Promise<Row[]> {
  const first = await dwbGet<{ items?: Row[]; total?: number }>(
    page,
    `/ap/payments?supplier_id=${supplierId}&page=1&page_size=100`
  );
  const total = requireId(first.total, '付款列表 total');
  const rows = pickListArray({ items: first.items }, 'items', '[649] 付款首页');
  for (let p = 2; rows.length < total; p++) {
    const more = await dwbGet<{ items?: Row[] }>(
      page,
      `/ap/payments?supplier_id=${supplierId}&page=${p}&page_size=100`
    );
    rows.push(...pickListArray({ items: more.items }, 'items', `[649] 付款第 ${p} 页`));
  }
  expect(rows.length, '[649] 逐页付款行数必须等于 total').toBe(total);
  return rows;
}

async function createInvoice(
  page: Page,
  supplierId: number,
  amount: string,
  notes: string
): Promise<Row> {
  const today = new Date().toISOString().slice(0, 10);
  return await dwbPost<Row>(page, '/ap/invoices', {
    supplier_id: supplierId,
    invoice_type: 'PURCHASE',
    invoice_date: today,
    due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    amount,
    tax_amount: '0.00',
    notes,
  });
}

test.describe('649 应付发票→付款→未付三角守恒', () => {
  test('649-1 明细累加==余额汇总==付款台账，差额分位为 0', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const tag = genCode('649');
    if (!ctx.warehouseIds[0]) throw new Error('[649] 前置缺失：ctx.warehouseIds[0] 未就绪');

    const supplier = await dwbPost<Row>(page, '/purchase/suppliers', {
      supplier_name: `E2E应付649-${tag}`,
      supplier_short_name: `E649${tag.slice(-4)}`,
      contact_phone: '{{PHONE_x7qh4sbk}}',
    });
    const supplierId = requireId(supplier.id, '专属供应商');
    CLEANUP.push({
      path: `/purchase/suppliers/${supplierId}`,
      label: `[649] 供应商#${supplierId}`,
    });

    const invPay = await createInvoice(page, supplierId, '300.00', `E2E-649-INV1-${tag}`);
    const invPayId = requireId(invPay.id, '付款标的发票');
    CLEANUP.push({ path: `/ap/invoices/${invPayId}`, label: `[649] 应付#${invPayId}` });
    await dwbPost(page, `/ap/invoices/${invPayId}/approve`, {});
    const invDraft = await createInvoice(page, supplierId, '150.50', `E2E-649-INV2-DRAFT-${tag}`);
    const invDraftId = requireId(invDraft.id, '草稿发票');
    CLEANUP.push({ path: `/ap/invoices/${invDraftId}`, label: `[649] 应付#${invDraftId}` });
    const invCancel = await createInvoice(page, supplierId, '200.00', `E2E-649-INV3-CANCEL-${tag}`);
    const invCancelId = requireId(invCancel.id, '取消发票');
    CLEANUP.push({ path: `/ap/invoices/${invCancelId}`, label: `[649] 应付#${invCancelId}` });
    await dwbPost(page, `/ap/invoices/${invCancelId}/approve`, {});
    await dwbPost(page, `/ap/invoices/${invCancelId}/cancel`, {
      reason: 'E2E-649 三角守恒取消分支',
    });

    // 部分付款全链：申请→提交→审批→登记付款单→补流水号→确认分摊。
    const request = await dwbPost<Row>(page, '/ap/payment-requests', {
      supplier_id: supplierId,
      request_date: new Date().toISOString().slice(0, 10),
      payment_type: '货款',
      payment_method: '银行转账',
      request_amount: '120.00',
      currency: 'CNY',
      exchange_rate: '1',
      notes: `E2E-649-REQ-${tag}`,
      items: [{ invoice_id: invPayId, apply_amount: '120.00' }],
    });
    const requestId = requireId(request.id, '付款申请');
    CLEANUP.push({
      path: `/ap/payment-requests/${requestId}`,
      label: `[649] 付款申请#${requestId}`,
    });
    await dwbPost(page, `/ap/payment-requests/${requestId}/submit`, {});
    await dwbPost(page, `/ap/payment-requests/${requestId}/approve`, {});
    const payment = await dwbPost<Row>(page, '/ap/payments', {
      request_id: requestId,
      payment_date: new Date().toISOString().slice(0, 10),
      notes: `E2E-649-PAY-${tag}`,
    });
    const paymentId = requireId(payment.id, '付款单');
    await dwbPut(page, `/ap/payments/${paymentId}`, { transaction_no: `E2E-649-TXN-${tag}` });
    await dwbPost(page, `/ap/payments/${paymentId}/confirm`, {});
    const paymentHead = await dwbGet<Row>(page, `/ap/payments/${paymentId}`);
    expect(paymentHead.payment_status, '[649] 确认后付款单态').toBe('CONFIRMED');

    // 口一：逐页明细累加（排除 DRAFT/CANCELLED，与写入方 report.rs:107-110 同集合）。
    const invoices = await readAllInvoices(page, supplierId);
    const counted = invoices.filter(
      r => String(r.invoice_status) !== 'DRAFT' && String(r.invoice_status) !== 'CANCELLED'
    );
    expect(counted.length, '[649] 计入口径发票张数（草稿/取消排除）').toBe(1);
    const sumInvoice = counted.reduce((acc, r) => acc + toCents(r.amount, '发票 amount'), 0n);
    const sumPaid = counted.reduce(
      (acc, r) => acc + toCents(r.paid_amount, '发票 paid_amount'),
      0n
    );
    const sumUnpaid = counted.reduce(
      (acc, r) => acc + toCents(r.unpaid_amount, '发票 unpaid_amount'),
      0n
    );
    expect(sumPaid + sumUnpaid - sumInvoice, '[649] 已付+未付==应付（明细侧）').toBe(0n);

    // 口二：余额汇总三额+张数与明细侧逐分相等。
    const balance = await dwbGet<Row>(page, `/ap/invoices/balance?supplier_id=${supplierId}`);
    expect(
      toCents(balance.total_invoice_amount, '汇总应付额'),
      '[649] total_invoice_amount==明细累加'
    ).toBe(sumInvoice);
    expect(
      toCents(balance.total_paid_amount, '汇总已付额'),
      '[649] total_paid_amount==明细累加'
    ).toBe(sumPaid);
    expect(
      toCents(balance.total_unpaid_amount, '汇总未付额'),
      '[649] total_unpaid_amount==明细累加'
    ).toBe(sumUnpaid);
    expect(Number(balance.invoice_count), '[649] invoice_count==计入口径张数').toBe(counted.length);

    // 口三：CONFIRMED 付款台账之和==汇总已付额==发票已付明细，三角差额为 0。
    const payments = await readAllPayments(page, supplierId);
    const confirmed = payments.filter(r => String(r.payment_status) === 'CONFIRMED');
    expect(confirmed.length, '[649] 确认态付款单张数').toBe(1);
    const sumPayments = confirmed.reduce(
      (acc, r) => acc + toCents(r.payment_amount, '付款 payment_amount'),
      0n
    );
    expect(sumPayments, '[649] 付款台账==汇总已付额').toBe(
      toCents(balance.total_paid_amount, '复核汇总已付')
    );
    expect(sumInvoice - sumPaid - sumUnpaid, '[649] 三角差额分位为 0').toBe(0n);
    expect(sumPaid, '[649] 部分付款分摊回写已付额').toBe(12000n);
  });
});

async function dwbGet<T>(page: Page, path: string): Promise<T> {
  return await apiCallRaw<T>(page, 'GET', path);
}

async function dwbPost<T>(page: Page, path: string, body: ApiRequestBody = {}): Promise<T> {
  return await apiCallRaw<T>(page, 'POST', path, body);
}

async function dwbPut<T>(page: Page, path: string, body: ApiRequestBody = {}): Promise<T> {
  return await apiCallRaw<T>(page, 'PUT', path, body);
}
