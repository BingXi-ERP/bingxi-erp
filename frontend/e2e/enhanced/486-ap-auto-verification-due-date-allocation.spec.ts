// 4.5 财务结算 + 4.16 精度：AP 自动核销按到期日升序多票顺序分摊。
// 后端判据：services/ap_verification_service.rs:82-96 仅取 supplier_id 精确匹配、
//   invoice_status 非 DRAFT/CANCELLED、unpaid_amount>0，按 due_date 升序；
//   :98-110 取 CONFIRMED 付款；:112-137 剔除已有核销明细的付款；
//   :139-190 逐票 verify_amount=min(remaining, unpaid)，即时扣减 remaining/unpaid；
//   :255-295 写 paid/unpaid 与 PAID/PARTIAL_PAID，显式 Set 三列落库；
//   :192-215 核销单 verification_type=AUTO、verification_status=COMPLETED、total_amount=分摊和。
// 关键判据：付款 confirm 会先把金额分摊到付款申请引用发票（ap_payment_service.rs:375-427），
//   故用第三张 150 元发票 C 承载付款并先结清，A/B 两张 100 元票保持 unpaid=100 作为核销基线；
//   B（晚到期）先建 id 更小、A（早到期）后建 id 更大，若漏掉排序会先核 B 而断言红。
// 与既有覆盖分工：finance/11 只测 AP manual/cancel 与 AR auto，463 是 AR 多票，
//   446 是 AP 日期筛选；全 e2e 无 /ap/verifications/auto 命中，本例补零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface Row {
  id?: number;
  paid_amount?: string | number;
  unpaid_amount?: string | number;
  amount?: string | number;
  invoice_status?: string;
  verification_type?: string;
  verification_status?: string;
  total_amount?: string | number;
}

function requireId(obj: Row, label: string): number {
  const id = Number(obj.id);
  if (!Number.isFinite(id) || id <= 0)
    throw new Error(`${label} 无有效 id：${JSON.stringify(obj)}`);
  return id;
}
function readAmount(
  obj: Row,
  key: 'paid_amount' | 'unpaid_amount' | 'amount' | 'total_amount',
  label: string
): number {
  if (!Object.prototype.hasOwnProperty.call(obj, key))
    throw new Error(`${label} 缺少金额键 ${key}`);
  const n = Number(obj[key]);
  if (!Number.isFinite(n)) throw new Error(`${label} 金额不可解析：${JSON.stringify(obj[key])}`);
  return n;
}
function expectMoney(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label} 期望=${expected} 实际=${actual}`).toBeLessThan(
    0.01
  );
}
function ymd(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

async function seedSupplier(page: Page): Promise<number> {
  const created = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `486自动核销供方_${genCode('E486')}`,
  });
  const id = Number(created.data?.id);
  expect(id, `[486] 建专属供应商失败：${JSON.stringify(created)}`).toBeGreaterThan(0);
  CLEANUP.push({ path: `/purchase/suppliers/${id}`, label: `[486] 供应商 ${id}` });
  return id;
}

async function seedApprovedInvoice(
  page: Page,
  supplierId: number,
  amount: number,
  dueOffset: number
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/ap/invoices', {
    supplier_id: supplierId,
    invoice_type: 'PURCHASE',
    amount,
    tax_amount: 0,
    invoice_date: ymd(0),
    due_date: ymd(dueOffset),
  });
  const id = requireId(created, '[486] 建应付单');
  CLEANUP.push({ path: `/ap/invoices/${id}`, label: `[486] 应付单 ${id}` });
  await apiCall(page, 'POST', `/ap/invoices/${id}/approve`);
  return id;
}

async function seedPaidInvoiceToFundPayment(page: Page, supplierId: number): Promise<number> {
  const invoiceId = await seedApprovedInvoice(page, supplierId, 150, 20);
  const req = await apiCallRaw<Row>(page, 'POST', '/ap/payment-requests', {
    supplier_id: supplierId,
    request_date: ymd(0),
    payment_type: 'PROGRESS',
    payment_method: 'TT',
    request_amount: 150,
    currency: 'CNY',
    items: [{ invoice_id: invoiceId, apply_amount: 150, notes: '486 自动核销付款前置' }],
  });
  const requestId = requireId(req, '[486] 建付款申请');
  await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/submit`);
  await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/approve`);
  const payment = await apiCallRaw<Row>(page, 'POST', '/ap/payments', {
    request_id: requestId,
    payment_date: ymd(0),
  });
  const paymentId = requireId(payment, '[486] 建付款单');
  await apiCall(page, 'PUT', `/ap/payments/${paymentId}`, { transaction_no: genCode('486-TXN') });
  await apiCall(page, 'POST', `/ap/payments/${paymentId}/confirm`);
  return paymentId;
}

test.describe('4.5 AP 自动核销到期日分摊', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await apiCall(page, 'POST', '/finance/accounting-periods/init', {});
  });

  test('486-01 按到期日 A(100) B(50) 分摊，核销单 AUTO/COMPLETED/total=150', async ({ page }) => {
    const supplierId = await seedSupplier(page);
    const late = await seedApprovedInvoice(page, supplierId, 100, 5);
    const early = await seedApprovedInvoice(page, supplierId, 100, 1);
    const funding = await seedPaidInvoiceToFundPayment(page, supplierId);

    const fundingAfter = await apiCallRaw<Row>(page, 'GET', `/ap/invoices/${funding}`);
    expectMoney(readAmount(fundingAfter, 'paid_amount', '付款前置票'), 150, '前置票 paid');
    expectMoney(readAmount(fundingAfter, 'unpaid_amount', '付款前置票'), 0, '前置票 unpaid');
    expect(fundingAfter.invoice_status, '[486] 前置票须 PAID').toBe('PAID');

    const earlyBefore = await apiCallRaw<Row>(page, 'GET', `/ap/invoices/${early}`);
    const lateBefore = await apiCallRaw<Row>(page, 'GET', `/ap/invoices/${late}`);
    expectMoney(readAmount(earlyBefore, 'unpaid_amount', '早到期票核销前'), 100, '早票 unpaid');
    expectMoney(readAmount(lateBefore, 'unpaid_amount', '晚到期票核销前'), 100, '晚票 unpaid');
    expect(early > late, '[486] 早到期票 id 须更大，才能抓出按 id 排序的缺陷').toBe(true);

    const created = await apiCallRaw<Row>(page, 'POST', '/ap/verifications/auto', {
      supplier_id: supplierId,
    });
    const verificationId = requireId(created, '[486] 自动核销单');
    const verification = await apiCallRaw<Row>(page, 'GET', `/ap/verifications/${verificationId}`);
    expect(verification.verification_type, '[486] 核销类型须 AUTO').toBe('AUTO');
    expect(verification.verification_status, '[486] 核销状态须 COMPLETED').toBe('COMPLETED');
    expectMoney(readAmount(verification, 'total_amount', '核销单'), 150, '核销单 total');

    const earlyAfter = await apiCallRaw<Row>(page, 'GET', `/ap/invoices/${early}`);
    expectMoney(readAmount(earlyAfter, 'paid_amount', '早到期票核销后'), 100, '早票 paid');
    expectMoney(readAmount(earlyAfter, 'unpaid_amount', '早到期票核销后'), 0, '早票 unpaid');
    expect(earlyAfter.invoice_status, '[486] 早票须 PAID').toBe('PAID');

    const lateAfter = await apiCallRaw<Row>(page, 'GET', `/ap/invoices/${late}`);
    expectMoney(readAmount(lateAfter, 'paid_amount', '晚到期票核销后'), 50, '晚票 paid');
    expectMoney(readAmount(lateAfter, 'unpaid_amount', '晚到期票核销后'), 50, '晚票 unpaid');
    expect(lateAfter.invoice_status, '[486] 晚票须 PARTIAL_PAID').toBe('PARTIAL_PAID');

    await apiCall(page, 'POST', `/ap/verifications/${verificationId}/cancel`, {
      reason: `486 自动核销清理 ${genCode('E486')}`,
    });
  });
});
