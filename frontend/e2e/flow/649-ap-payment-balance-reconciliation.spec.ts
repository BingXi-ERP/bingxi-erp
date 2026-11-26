/**
 * 功能：锁定 AP 发票↔付款↔供应商余额三层勾稽，以及 balance 出口对草稿/取消票的排除门。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属供应商、两张 AUDITED 应付单与三笔 CONFIRMED 付款，不复用共享 AP 行。
 * - 入参：票A 500 先付 300 再付 200 结清；票B 1000 部分付 400；付款申请逐笔 submit+approve 后建付款。
 * - 传给谁：POST /purchase/suppliers、POST /ap/invoices、POST /ap/invoices/{id}/approve、
 *   POST /ap/payment-requests、POST /ap/payment-requests/{id}/submit、
 *   POST /ap/payment-requests/{id}/approve、POST /ap/payments、PUT /ap/payments/{id}、
 *   POST /ap/payments/{id}/confirm、GET /ap/payments、GET /ap/invoices、GET /ap/invoices/balance。
 * - 存什么：断言每张票 amount==paid+unpaid；CONFIRMED 付款额合计==已付合计；
 *   balance 四键等于逐页有效票累加，且草稿票被排除门挡在余额外。
 * - 存哪里：suppliers/ap_invoices/ap_payment_requests/ap_payments；收尾逆序尽力清理付款申请与供应商。
 *
 * 源码判据：models/ap_invoice.rs amount/paid_amount/unpaid_amount 三列同源；
 *   ap_payment_service.rs confirm 时按申请明细分摊回写 paid_amount；
 *   models/status/general.rs PAYMENT_CONFIRMED='CONFIRMED'；
 *   ap_invoice_ops/report.rs balance 排除 DRAFT/CANCELLED 后累加四键。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, genCode, genName, tryCleanup } from './helpers';

interface ApInvoiceRow {
  id: number;
  invoice_status: string;
  amount: number | string;
  paid_amount: number | string;
  unpaid_amount: number | string;
  notes?: string;
}

interface PaymentRow {
  id: number;
  payment_status: string;
  payment_amount: number | string;
}

interface BalanceRow {
  total_invoice_amount: number | string;
  total_paid_amount: number | string;
  total_unpaid_amount: number | string;
  invoice_count: number;
}

function toScaled(v: unknown, label: string): bigint {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(raw);
  if (!m) throw new Error(`${label}：Decimal 出参必须为至多三位小数，实际 ${JSON.stringify(v)}`);
  const [, sign, int, frac = ''] = m;
  return BigInt((sign === '-' ? '-' : '') + int + frac.padEnd(3, '0'));
}

/** 逐页读供应商应付单；page_size=100。 */
async function listSupplierInvoices(page: Page, supplierId: number): Promise<ApInvoiceRow[]> {
  const rows: ApInvoiceRow[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await apiCallRaw<{ items?: ApInvoiceRow[]; total?: number }>(
      page,
      'GET',
      `/ap/invoices?supplier_id=${supplierId}&page=${pageNo}&page_size=100`
    );
    if (!Array.isArray(res.items)) {
      throw new Error(`[649] /ap/invoices 未返回 items 数组：第 ${pageNo} 页`);
    }
    rows.push(...res.items);
    const total = Number(res.total ?? 0);
    if (pageNo * 100 >= total) break;
  }
  return rows;
}

/** 逐页读供应商 CONFIRMED 付款单；page_size=100。 */
async function listConfirmedPayments(page: Page, supplierId: number): Promise<PaymentRow[]> {
  const rows: PaymentRow[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await apiCallRaw<{ items?: PaymentRow[]; total?: number }>(
      page,
      'GET',
      `/ap/payments?supplier_id=${supplierId}&payment_status=CONFIRMED&page=${pageNo}&page_size=100`
    );
    if (!Array.isArray(res.items)) {
      throw new Error(`[649] /ap/payments 未返回 items 数组：第 ${pageNo} 页`);
    }
    rows.push(...res.items);
    const total = Number(res.total ?? 0);
    if (pageNo * 100 >= total) break;
  }
  return rows;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe.serial('649 AP 发票/付款/余额三层勾稽', () => {
  test('649-1 恒等面、付款增量与余额排除门逐额一致', async ({ page }) => {
    const tag = genCode('F649');
    const today = new Date().toISOString().slice(0, 10);
    const supplier = await apiCallRaw<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
      supplier_name: genName('649勾稽供应商'),
      supplier_short_name: '649SUP',
      contact_phone: '{{PHONE_9brm4tqk}}',
    });
    const supplierId = Number(supplier?.id);
    expect(supplierId, '[649-1] 自建供应商必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/purchase/suppliers/${supplierId}`, label: '[649-1] 自建供应商' });

    const createInvoice = async (amount: string, notes: string): Promise<ApInvoiceRow> => {
      const created = await apiCallRaw<ApInvoiceRow>(page, 'POST', '/ap/invoices', {
        supplier_id: supplierId,
        invoice_type: 'PURCHASE',
        invoice_date: today,
        due_date: today,
        amount,
        tax_amount: '0.00',
        notes,
      });
      expect(Number(created?.id), `[649-1] 应付单 ${notes} 必须返回主键`).toBeGreaterThan(0);
      CLEANUP.push({ path: `/ap/invoices/${created.id}`, label: `[649-1] ${notes}` });
      await apiCall(page, 'POST', `/ap/invoices/${created.id}/approve`);
      const after = await apiCallRaw<ApInvoiceRow>(page, 'GET', `/ap/invoices/${created.id}`);
      expect(String(after.invoice_status), `[649-1] ${notes} 审核后必须 AUDITED`).toBe('AUDITED');
      return after;
    };

    const payThroughChain = async (
      invoiceId: number,
      amount: string,
      notes: string
    ): Promise<bigint> => {
      const request = await apiCallRaw<{ id?: number }>(page, 'POST', '/ap/payment-requests', {
        supplier_id: supplierId,
        request_date: today,
        payment_type: 'PROGRESS',
        payment_method: 'TT',
        request_amount: amount,
        currency: 'CNY',
        items: [{ invoice_id: invoiceId, apply_amount: amount, notes }],
      });
      const requestId = Number(request?.id);
      expect(requestId, `[649-1] 付款申请 ${notes} 必须返回主键`).toBeGreaterThan(0);
      CLEANUP.push({ path: `/ap/payment-requests/${requestId}`, label: `[649-1] ${notes}` });
      await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/submit`);
      await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/approve`);

      const payment = await apiCallRaw<PaymentRow>(page, 'POST', '/ap/payments', {
        request_id: requestId,
        payment_date: today,
      });
      const paymentId = Number(payment?.id);
      expect(paymentId, `[649-1] 付款单 ${notes} 必须返回主键`).toBeGreaterThan(0);
      await apiCall(page, 'PUT', `/ap/payments/${paymentId}`, {
        transaction_no: genCode('TXN649'),
      });
      await apiCall(page, 'POST', `/ap/payments/${paymentId}/confirm`);
      const confirmed = await apiCallRaw<PaymentRow>(page, 'GET', `/ap/payments/${paymentId}`);
      expect(String(confirmed.payment_status), `[649-1] ${notes} 确认后状态`).toBe('CONFIRMED');
      return toScaled(confirmed.payment_amount, `[649-1] ${notes} payment_amount`);
    };

    const invoiceA = await createInvoice('500.00', `${tag}-A`);
    const invoiceB = await createInvoice('1000.00', `${tag}-B`);
    const draftC = await apiCallRaw<ApInvoiceRow>(page, 'POST', '/ap/invoices', {
      supplier_id: supplierId,
      invoice_type: 'PURCHASE',
      invoice_date: today,
      due_date: today,
      amount: '888.00',
      tax_amount: '0.00',
      notes: `${tag}-C`,
    });
    expect(Number(draftC?.id), '[649-1] 草稿对照票必须返回主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/ap/invoices/${draftC.id}`, label: '[649-1] 草稿对照票' });

    const payments = [
      await payThroughChain(invoiceA.id, '300.00', `${tag}-A-P1`),
      await payThroughChain(invoiceA.id, '200.00', `${tag}-A-P2`),
      await payThroughChain(invoiceB.id, '400.00', `${tag}-B-P1`),
    ];
    expect(payments.length, '[649-1] 付款链必须真实返回 3 笔金额').toBe(3);

    const invoiceRows = await listSupplierInvoices(page, supplierId);
    const trackedRows = [invoiceA, invoiceB];
    for (const row of trackedRows) {
      const fresh = invoiceRows.find(item => Number(item.id) === Number(row.id));
      expect(fresh, `[649-1] 回读列表必须包含票 ${row.id}`).toBeTruthy();
      expect(
        toScaled(fresh!.amount, `[649-1] 票 ${row.id} amount`) -
          toScaled(fresh!.paid_amount, `[649-1] 票 ${row.id} paid_amount`) -
          toScaled(fresh!.unpaid_amount, `[649-1] 票 ${row.id} unpaid_amount`),
        `[649-1] 票 ${row.id} amount-paid-unpaid 必须为 0`
      ).toBe(0n);
    }
    expect(
      invoiceRows.some(
        row => Number(row.id) === Number(draftC.id) && row.invoice_status === 'DRAFT'
      ),
      '[649-1] 草稿对照票必须真实在册'
    ).toBe(true);

    const confirmedPayments = await listConfirmedPayments(page, supplierId);
    const paymentSum = confirmedPayments.reduce(
      (acc, row) => acc + toScaled(row.payment_amount, '[649-1] 付款单金额'),
      0n
    );
    expect(paymentSum, '[649-1] CONFIRMED 付款合计必须为 900.00').toBe(900000n);
    expect(confirmedPayments.length, '[649-1] CONFIRMED 付款行数必须为 3').toBe(3);

    const paidSum = invoiceRows.reduce(
      (acc, row) => acc + toScaled(row.paid_amount, '[649-1] 应付已付额'),
      0n
    );
    expect(paidSum, '[649-1] 应付已付合计必须为 900.00').toBe(900000n);
    expect(paymentSum - paidSum, '[649-1] CONFIRMED 付款合计-应付已付合计差额必须为 0').toBe(0n);

    const balance = await apiCallRaw<BalanceRow>(
      page,
      'GET',
      `/ap/invoices/balance?supplier_id=${supplierId}`
    );
    const activeRows = invoiceRows.filter(
      row => row.invoice_status !== 'DRAFT' && row.invoice_status !== 'CANCELLED'
    );
    expect(activeRows.length, '[649-1] balance 计数必须等于有效票行数').toBe(
      Number(balance.invoice_count)
    );
    expect(
      activeRows.reduce((acc, row) => acc + toScaled(row.amount, '[649-1] balance 分母金额'), 0n) -
        toScaled(balance.total_invoice_amount, '[649-1] balance 应付合计'),
      '[649-1] balance 应付合计差额必须为 0'
    ).toBe(0n);
    expect(
      activeRows.reduce(
        (acc, row) => acc + toScaled(row.paid_amount, '[649-1] balance 已付金额'),
        0n
      ) - toScaled(balance.total_paid_amount, '[649-1] balance 已付合计'),
      '[649-1] balance 已付合计差额必须为 0'
    ).toBe(0n);
    expect(
      activeRows.reduce(
        (acc, row) => acc + toScaled(row.unpaid_amount, '[649-1] balance 未付金额'),
        0n
      ) - toScaled(balance.total_unpaid_amount, '[649-1] balance 未付合计'),
      '[649-1] balance 未付合计差额必须为 0'
    ).toBe(0n);
    expect(
      toScaled(balance.total_invoice_amount, '[649-1] balance 应付合计') -
        toScaled(balance.total_paid_amount, '[649-1] balance 已付合计') -
        toScaled(balance.total_unpaid_amount, '[649-1] balance 未付合计'),
      '[649-1] balance 三额恒等必须为 0'
    ).toBe(0n);
    expect(
      toScaled(balance.total_invoice_amount, '[649-1] balance 应付合计'),
      '[649-1] balance 必须排除草稿票，仅 A+B=1500'
    ).toBe(1500000n);
  });
});
