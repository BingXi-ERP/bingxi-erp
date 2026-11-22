/**
 * 功能：守「对账账本不侵占核销额度」边界。对账单走到 closed 后，其 RECEIPT/COLLECTION 明细
 *       不得占用收款的核销余额；只有 closed 核销单的 RECEIPT/AR_COLLECTION 明细占用额度，
 *       取消该核销后同一额度必须可再次使用。
 * 调用方：Playwright E2E 分片执行 frontend/e2e/flow/551-*.spec.ts，不依赖 UI 点击。
 * 入参：自建客户、两张已审批发票、已确认收款、手工核销金额和对账期间。
 * 传给谁：POST /ar/invoices、/ar/payments、/ar/verifications/manual、
 *        /ar-reconciliations-enhanced/generate、/ar-reconciliations/{id}/{send,confirm,close}，
 *        GET /ar/verifications/unverified/payments、/ar/verifications/{id}、
 *        /ar-reconciliations-enhanced/{id}/details 逐层回读。
 * 存什么：发票已收/未收、核销单 closed/cancelled、两类 RECEIPT 明细的 document_type 与金额，
 *        以及收款候选列表的剩余额度，全部按分位十进制串核对。
 * 存哪里：ar_invoice / ar_collection / ar_reconciliation / ar_reconciliation_item；
 *        E2E 只通过 HTTP 出参回读，不直连数据库。
 */
import { type Page } from '@playwright/test';
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';

type Row = Record<string, unknown>;

const TODAY = new Date().toISOString().slice(0, 10);
const PERIOD_START = `${TODAY.slice(0, 4)}-01-01`;
const PERIOD_END = `${TODAY.slice(0, 4)}-12-31`;

function requireNum(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：无有效数值，raw=${JSON.stringify(v)}`);
  return n;
}

/** DECIMAL 出参先校验字符串形态，再折成人民币分位比较，杜绝浮点相等 */
function toScaled(v: unknown, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > 2 && frac.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出分位精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac.slice(0, 2)).padEnd(intPart.length + 2, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

function cents(want: string): bigint {
  return toScaled(want, `期望金额 ${want}`);
}

function eqAmount(actual: unknown, expected: bigint, label: string): void {
  expect(
    toScaled(actual, label),
    `${label}：期望(分)=${expected} 实际=${JSON.stringify(actual)}`
  ).toBe(expected);
}

function requireItems(detail: Row, label: string): Row[] {
  if (!Array.isArray(detail.items)) throw new Error(`${label}：详情缺 items 数组`);
  return detail.items as Row[];
}

function itemByDoc(
  items: Row[],
  itemType: string,
  docType: string,
  docId: number,
  label: string
): Row {
  const found = items.find(
    item =>
      item.item_type === itemType &&
      item.document_type === docType &&
      Number(item.document_id) === docId
  );
  if (!found) throw new Error(`${label}：未找到 ${itemType}/${docType} doc_id=${docId} 的明细`);
  return found;
}

async function createCustomer(page: Page, tag: string): Promise<number> {
  const row = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `e2e-551-recon-ledger-${tag}`,
    status: 'active',
  });
  return requireNum(row.id, '自建客户');
}

async function createApprovedInvoice(
  page: Page,
  customerId: number,
  amount: string,
  tag: string
): Promise<number> {
  const inv = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    invoice_amount: amount,
    invoice_date: TODAY,
    due_date: TODAY,
    remark: `E2E-${tag}-INV-${amount}`,
  });
  const id = requireNum(inv.id, `建应收 ${amount}`);
  await apiCall(page, 'POST', `/ar/invoices/${id}/approve`);
  const approved = await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${id}`);
  expect(approved.status, `发票 ${id} 审批后必须是大写 APPROVED`).toBe('APPROVED');
  eqAmount(approved.invoice_amount, cents(amount), `发票 ${id} 面额`);
  return id;
}

async function readInvoice(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar/invoices/${id}`);
}

async function readPayment(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar/payments/${id}`);
}

async function readVerification(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar/verifications/${id}`);
}

async function candidateFor(
  page: Page,
  customerId: number,
  paymentId: number
): Promise<Row | undefined> {
  const rows = await apiCallRaw<Row[]>(
    page,
    'GET',
    `/ar/verifications/unverified/payments?customer_id=${customerId}`
  );
  if (!Array.isArray(rows)) throw new Error('可核销收款候选接口出参必须是裸数组');
  return rows.find(row => Number(row.id) === paymentId);
}

test.describe.serial('551 对账账本与核销账本分族：closed 对账不占额度，取消核销后可重用', () => {
  let customerId = 0;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await apiCall(page, 'POST', '/finance/accounting-periods/init', {});
  });

  test.afterEach(async ({ page }) => {
    if (customerId > 0) {
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, '551 自建客户');
      customerId = 0;
    }
  });

  test('551-01 对账 COLLECTION 明细与核销 AR_COLLECTION 明细分族，取消后 40 额度可再次核销', async ({
    page,
  }) => {
    const tag = genCode('551');
    customerId = await createCustomer(page, tag);
    // 发票 A 承载全部核销；发票 B 仅用于验证收款余额确实耗尽（避免撞发票侧门）
    const invoiceA = await createApprovedInvoice(page, customerId, '100.00', tag);
    const invoiceB = await createApprovedInvoice(page, customerId, '100.00', tag);

    const payment = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
      customer_id: customerId,
      amount: '100.00',
      payment_method: '银行转账',
      payment_date: TODAY,
      remark: `E2E-${tag}-PAY`,
    });
    const paymentId = requireNum(payment.id, '建收款');
    await apiCall(page, 'POST', `/ar/payments/${paymentId}/confirm`);
    const confirmedPayment = await readPayment(page, paymentId);
    expect(confirmedPayment.status, '收款状态词表小写 confirmed').toBe('confirmed');
    eqAmount(confirmedPayment.collection_amount, cents('100.00'), '收款入账金额');

    // 第一笔手工核销 40：写入 closed 核销单 + RECEIPT/AR_COLLECTION 明细
    const v1 = await apiCallRaw<Row>(page, 'POST', '/ar/verifications/manual', {
      invoice_id: invoiceA,
      payment_id: paymentId,
      amount: '40.00',
      remark: `E2E-${tag}-V1`,
    });
    const v1Id = requireNum(v1.id, '第一笔核销');
    expect(v1.status, '核销单写入即小写 closed').toBe('closed');
    eqAmount(v1.amount, cents('40.00'), '第一笔核销金额');
    const invAAfterV1 = await readInvoice(page, invoiceA);
    eqAmount(invAAfterV1.received_amount, cents('40.00'), '第一笔核销后发票已收');
    eqAmount(invAAfterV1.unpaid_amount, cents('60.00'), '第一笔核销后发票未收');
    const v1Detail = await readVerification(page, v1Id);
    expect(v1Detail.reconciliation_status, '核销单详情主单状态小写 closed').toBe('closed');
    const v1Items = requireItems(v1Detail, '第一笔核销详情');
    const v1Receipt = itemByDoc(
      v1Items,
      'RECEIPT',
      'AR_COLLECTION',
      paymentId,
      '第一笔核销的收款侧明细'
    );
    expect(v1Receipt.match_status, '核销明细匹配状态大写 MATCHED').toBe('MATCHED');
    eqAmount(v1Receipt.amount, cents('-40.00'), '核销账本按记账方向记负');

    // 生成对账并走完 draft→sent→confirmed→closed，制造 COLLECTION 口径的干扰明细
    const rec = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations-enhanced/generate', {
      customer_id: customerId,
      start_date: PERIOD_START,
      end_date: PERIOD_END,
    });
    const recId = requireNum(rec.id, '生成对账单');
    expect(rec.reconciliation_status, '新对账单状态小写 draft').toBe('draft');
    await apiCall(page, 'POST', `/ar-reconciliations/${recId}/send`);
    await apiCall(page, 'POST', `/ar-reconciliations/${recId}/confirm`);
    await apiCall(page, 'POST', `/ar-reconciliations/${recId}/close`);
    const recClosed = await apiCallRaw<Row>(page, 'GET', `/ar-reconciliations/${recId}`);
    expect(recClosed.reconciliation_status, '对账单终态小写 closed').toBe('closed');

    const recDetails = await apiCallRaw<{ reconciliation: Row; details: Row[] }>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/${recId}/details`
    );
    if (!Array.isArray(recDetails.details)) throw new Error('对账详情缺 details 数组');
    const reconReceipt = itemByDoc(
      recDetails.details,
      'RECEIPT',
      'COLLECTION',
      paymentId,
      '已关闭对账的收款明细'
    );
    eqAmount(reconReceipt.amount, cents('-100.00'), '对账账本记收款负全额');
    expect(Number(reconReceipt.reconciliation_id), '对账明细必须归属所建对账单').toBe(recId);

    // 收款仍有 60 可用：对账 COLLECTION 明细不进入核销额度汇总
    const candidateAfterClose = await candidateFor(page, customerId, paymentId);
    if (!candidateAfterClose) throw new Error('对账 closed 后收款应仍在可核销候选中');
    expect(candidateAfterClose.status, '候选收款仍是小写 confirmed').toBe('confirmed');
    eqAmount(candidateAfterClose.collection_amount, cents('100.00'), '候选收款面额未被对账占用');

    const v2 = await apiCallRaw<Row>(page, 'POST', '/ar/verifications/manual', {
      invoice_id: invoiceA,
      payment_id: paymentId,
      amount: '60.00',
      remark: `E2E-${tag}-V2`,
    });
    expect(v2.status, '第二笔核销写入即小写 closed').toBe('closed');
    eqAmount(v2.amount, cents('60.00'), '第二笔核销金额');
    const invAAfterV2 = await readInvoice(page, invoiceA);
    eqAmount(invAAfterV2.received_amount, cents('100.00'), '发票 A 已收合计');
    eqAmount(invAAfterV2.unpaid_amount, cents('0.00'), '发票 A 未收归零');

    // 收款已用尽：0.01 必须由收款余额门拒绝，而不是被已结清发票挡住
    const over = await apiCallExpectFail(page, 'POST', '/ar/verifications/manual', {
      invoice_id: invoiceB,
      payment_id: paymentId,
      amount: '0.01',
      remark: `E2E-${tag}-OVER`,
    });
    expect(over.status, '超出收款可用余额应 400').toBe(400);
    expect(failureCode(over), '余额不足机器码 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const invBAfterOver = await readInvoice(page, invoiceB);
    eqAmount(invBAfterOver.received_amount, cents('0.00'), '被拒后发票 B 已收仍为零');
    eqAmount(invBAfterOver.unpaid_amount, cents('100.00'), '被拒后发票 B 未收不变');
    expect(
      await candidateFor(page, customerId, paymentId),
      '余额用尽后收款退出候选'
    ).toBeUndefined();

    // 取消第一笔 40：核销主单改小写 cancelled，明细留痕但不再占用额度
    await apiCall(page, 'POST', `/ar/verifications/${v1Id}/cancel`);
    const v1Cancelled = await readVerification(page, v1Id);
    expect(v1Cancelled.reconciliation_status, '取消核销后主单小写 cancelled').toBe('cancelled');
    const v1ItemsAfterCancel = requireItems(v1Cancelled, '取消后的核销详情');
    eqAmount(
      itemByDoc(v1ItemsAfterCancel, 'RECEIPT', 'AR_COLLECTION', paymentId, '取消后留痕明细').amount,
      cents('-40.00'),
      '取消不删明细，仅主单状态失效'
    );
    const invAAfterCancel = await readInvoice(page, invoiceA);
    eqAmount(invAAfterCancel.received_amount, cents('60.00'), '取消 40 后发票 A 已收回退到 60');
    eqAmount(invAAfterCancel.unpaid_amount, cents('40.00'), '取消 40 后发票 A 未收回到 40');
    const candidateAfterCancel = await candidateFor(page, customerId, paymentId);
    if (!candidateAfterCancel) throw new Error('取消核销后 40 额度应重新进入候选');
    eqAmount(candidateAfterCancel.collection_amount, cents('100.00'), '重新进入候选的是同一收款');

    const v3 = await apiCallRaw<Row>(page, 'POST', '/ar/verifications/manual', {
      invoice_id: invoiceA,
      payment_id: paymentId,
      amount: '40.00',
      remark: `E2E-${tag}-V3`,
    });
    expect(v3.status, '复用额度的新核销写入即小写 closed').toBe('closed');
    eqAmount(v3.amount, cents('40.00'), '复用的额度金额恰为 40');
    const invAFinal = await readInvoice(page, invoiceA);
    eqAmount(invAFinal.received_amount, cents('100.00'), '发票 A 最终已收 100');
    eqAmount(invAFinal.unpaid_amount, cents('0.00'), '发票 A 最终未收 0');
    expect(invAFinal.status, '发票已收齐后状态大写 PAID').toBe('PAID');
    expect(
      await candidateFor(page, customerId, paymentId),
      '额度再次用尽后退出候选'
    ).toBeUndefined();

    const recStillClosed = await apiCallRaw<Row>(page, 'GET', `/ar-reconciliations/${recId}`);
    expect(recStillClosed.reconciliation_status, '对账全程保持 closed，不被核销取消连带').toBe(
      'closed'
    );
  });
});
