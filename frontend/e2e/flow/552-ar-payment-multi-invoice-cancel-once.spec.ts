/**
 * 功能：守「多发票直连收款的核销回滚恰好一次」边界。先取消其中一笔核销，再取消仍为 pending
 *       的父收款，只允许回收尚未取消的核销；已取消核销不得二次回滚，发票金额不得变负。
 * 调用方：Playwright E2E 分片执行 frontend/e2e/flow/552-*.spec.ts，不依赖 UI 点击。
 * 入参：自建客户、两张已审批发票 40/60、携带 invoice_ids 的收款、两次取消顺序与状态词。
 * 传给谁：POST /ar/invoices、/ar/payments（invoice_ids）、/ar/verifications/{id}/cancel、
 *        /ar/payments/{id}/cancel，GET /ar/invoices/{id}、/ar/payments/{id}、
 *        /ar/verifications、/ar/verifications/{id} 逐层回读。
 * 存什么：两张发票的已收/未收、两张核销单的 closed/cancelled 与成对明细、
 *        父收款 pending/cancelled，全部按分位十进制串核对。
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

function itemByDoc(items: Row[], itemType: string, docId: number, label: string): Row {
  const found = items.find(
    item => item.item_type === itemType && Number(item.document_id) === docId
  );
  if (!found) throw new Error(`${label}：未找到 ${itemType} doc_id=${docId} 的明细`);
  return found;
}

async function createCustomer(page: Page, tag: string): Promise<number> {
  const row = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `e2e-552-payment-cancel-${tag}`,
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

async function verificationIdForInvoice(page: Page, invoiceId: number): Promise<number> {
  const list = await apiCallRaw<{ list: Row[]; total: number }>(
    page,
    'GET',
    `/ar/verifications?invoice_id=${invoiceId}&page=1&page_size=100`
  );
  if (!Array.isArray(list.list)) throw new Error('核销列表出参缺 list 数组');
  expect(list.total, `发票 ${invoiceId} 只应挂一张直连核销单`).toBe(1);
  const row = list.list.find(item => Number(item.id) > 0);
  if (!row) throw new Error(`发票 ${invoiceId} 的核销列表无有效行`);
  return requireNum(row.id, `发票 ${invoiceId} 的核销单`);
}

function assertInvoice(
  page: Page,
  invoiceId: number,
  received: string,
  unpaid: string,
  label: string
): Promise<void> {
  return readInvoice(page, invoiceId).then(inv => {
    eqAmount(inv.received_amount, cents(received), `${label}已收`);
    eqAmount(inv.unpaid_amount, cents(unpaid), `${label}未收`);
  });
}

test.describe.serial('552 多发票直连收款：先取消一笔核销再取消父收款，禁止二次回滚', () => {
  let customerId = 0;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await apiCall(page, 'POST', '/finance/accounting-periods/init', {});
  });

  test.afterEach(async ({ page }) => {
    if (customerId > 0) {
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, '552 自建客户');
      customerId = 0;
    }
  });

  test('552-01 两张 closed 核销逐笔回滚一次，父收款 cancelled 后重复取消拒绝且金额不变', async ({
    page,
  }) => {
    const tag = genCode('552');
    customerId = await createCustomer(page, tag);
    const invoiceA = await createApprovedInvoice(page, customerId, '40.00', tag);
    const invoiceB = await createApprovedInvoice(page, customerId, '60.00', tag);

    // 收款直连两张发票，分配顺序按 invoice_ids 给定次序：40 + 60 = 100
    const payment = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
      customer_id: customerId,
      amount: '100.00',
      payment_method: '银行转账',
      payment_date: TODAY,
      remark: `E2E-${tag}-PAY`,
      invoice_ids: [invoiceA, invoiceB],
    });
    const paymentId = requireNum(payment.id, '建直连收款');
    const payment0 = await readPayment(page, paymentId);
    expect(payment0.status, '直连收款初始未确认，小写 pending').toBe('pending');
    eqAmount(payment0.collection_amount, cents('100.00'), '收款面额 100');
    await assertInvoice(page, invoiceA, '40.00', '0.00', '直连后发票 A ');
    await assertInvoice(page, invoiceB, '60.00', '0.00', '直连后发票 B ');

    const vA = await verificationIdForInvoice(page, invoiceA);
    const vB = await verificationIdForInvoice(page, invoiceB);
    expect(vA, '两张发票对应两张不同核销单').not.toBe(vB);
    const detailA0 = await readVerification(page, vA);
    const detailB0 = await readVerification(page, vB);
    expect(detailA0.reconciliation_status, '直连核销 A 主单小写 closed').toBe('closed');
    expect(detailB0.reconciliation_status, '直连核销 B 主单小写 closed').toBe('closed');
    const itemsA = requireItems(detailA0, '核销 A 详情');
    const itemsB = requireItems(detailB0, '核销 B 详情');
    const receiptA = itemByDoc(itemsA, 'RECEIPT', paymentId, '核销 A 收款侧');
    const receiptB = itemByDoc(itemsB, 'RECEIPT', paymentId, '核销 B 收款侧');
    expect(receiptA.document_type, '核销账本明细分族值 AR_COLLECTION').toBe('AR_COLLECTION');
    expect(receiptB.document_type, '核销账本明细分族值 AR_COLLECTION').toBe('AR_COLLECTION');
    eqAmount(receiptA.amount, cents('-40.00'), '核销 A 收款侧按记账方向记负');
    eqAmount(receiptB.amount, cents('-60.00'), '核销 B 收款侧按记账方向记负');
    eqAmount(
      itemByDoc(itemsA, 'INVOICE', invoiceA, '核销 A 发票侧').amount,
      cents('40.00'),
      '核销 A 发票侧'
    );
    eqAmount(
      itemByDoc(itemsB, 'INVOICE', invoiceB, '核销 B 发票侧').amount,
      cents('60.00'),
      '核销 B 发票侧'
    );

    // 第一次取消：只回收核销 A，收款仍 pending，发票 B 不被连带回滚
    await apiCall(page, 'POST', `/ar/verifications/${vA}/cancel`);
    const vAAfterCancel = await readVerification(page, vA);
    expect(vAAfterCancel.reconciliation_status, '核销 A 取消后小写 cancelled').toBe('cancelled');
    expect(
      requireItems(vAAfterCancel, '取消后核销 A 详情').length,
      '取消只失效主单，明细留痕'
    ).toBeGreaterThan(0);
    const pAfterFirst = await readPayment(page, paymentId);
    expect(pAfterFirst.status, '取消单笔核销不改变父收款 pending').toBe('pending');
    await assertInvoice(page, invoiceA, '0.00', '40.00', '取消核销 A 后发票 A ');
    const invoiceAAfterFirst = await readInvoice(page, invoiceA);
    expect(invoiceAAfterFirst.status, '发票 A 回滚后恢复大写 APPROVED').toBe('APPROVED');
    await assertInvoice(page, invoiceB, '60.00', '0.00', '取消核销 A 后发票 B ');

    // 第二次取消：回收仍 closed 的核销 B，核销 A 不得被重复回滚
    await apiCall(page, 'POST', `/ar/payments/${paymentId}/cancel`);
    const pCancelled = await readPayment(page, paymentId);
    expect(pCancelled.status, '父收款取消后小写 cancelled').toBe('cancelled');
    const vBAfterPaymentCancel = await readVerification(page, vB);
    expect(vBAfterPaymentCancel.reconciliation_status, '核销 B 被父收款回收为小写 cancelled').toBe(
      'cancelled'
    );
    expect(
      requireItems(vBAfterPaymentCancel, '回收后核销 B 详情').length,
      '核销 B 明细留痕'
    ).toBeGreaterThan(0);
    const vAAfterPaymentCancel = await readVerification(page, vA);
    expect(vAAfterPaymentCancel.reconciliation_status, '核销 A 仍是 cancelled').toBe('cancelled');
    eqAmount(
      itemByDoc(
        requireItems(vAAfterPaymentCancel, '回收后核销 A 详情'),
        'RECEIPT',
        paymentId,
        '核销 A 留痕'
      ).amount,
      cents('-40.00'),
      '已取消核销的明细原样保留'
    );
    await assertInvoice(page, invoiceA, '0.00', '40.00', '父收款取消后发票 A ');
    await assertInvoice(page, invoiceB, '0.00', '60.00', '父收款取消后发票 B ');
    const invoiceBAfterCancel = await readInvoice(page, invoiceB);
    expect(invoiceBAfterCancel.status, '发票 B 回滚后恢复大写 APPROVED').toBe('APPROVED');

    // 重复取消父收款必须被状态门拒绝，且四份金额快照逐项不变
    const secondCancel = await apiCallExpectFail(page, 'POST', `/ar/payments/${paymentId}/cancel`);
    expect(secondCancel.status, '重复取消收款应 400').toBe(400);
    expect(failureCode(secondCancel), '重复取消机器码 BAD_REQUEST').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
    const pAfterSecond = await readPayment(page, paymentId);
    expect(pAfterSecond.status, '重复取消后父收款仍 cancelled').toBe('cancelled');
    eqAmount(pAfterSecond.collection_amount, cents('100.00'), '重复取消不改写收款面额');
    await assertInvoice(page, invoiceA, '0.00', '40.00', '重复取消后发票 A ');
    await assertInvoice(page, invoiceB, '0.00', '60.00', '重复取消后发票 B ');
    const vAFinal = await readVerification(page, vA);
    const vBFinal = await readVerification(page, vB);
    expect(vAFinal.reconciliation_status, '重复取消后核销 A 仍 cancelled').toBe('cancelled');
    expect(vBFinal.reconciliation_status, '重复取消后核销 B 仍 cancelled').toBe('cancelled');
    eqAmount(
      itemByDoc(requireItems(vAFinal, '最终核销 A 详情'), 'INVOICE', invoiceA, '最终核销 A 发票侧')
        .amount,
      cents('40.00'),
      '重复取消不改写核销 A 明细'
    );
    eqAmount(
      itemByDoc(requireItems(vBFinal, '最终核销 B 详情'), 'INVOICE', invoiceB, '最终核销 B 发票侧')
        .amount,
      cents('60.00'),
      '重复取消不改写核销 B 明细'
    );
  });
});
