// 4.29 应收勾稽 + 4.41-E 收款联动：一笔收款核销多张应收单的顺序分摊守恒。
// 后端判据：services/ar_ops/collection.rs:294-295 按 invoice_ids 顺序逐票扣减；
//   :361-367 allocate=min(remaining, unpaid_amount)、received+=allocate、
//   unpaid=max(invoice_amount-received, 0)；
//   :375-378 unpaid==0 → PAYMENT_PAID(PAID)，received>0 但仍有未收 → PAYMENT_PARTIAL_PAID(PARTIAL_PAID)；
//   models/status/general.rs:43,46 词表值逐字为 PAID / PARTIAL_PAID。
// 与既有用例分工：finance/04 只传单张 invoice_ids 断单票部分→结清；
//   finance/11 显式不传 invoice_ids 走不关联核销；本例专补「一张收款单关联两张应收
//   并验证顺序分摊、两票金额守恒、两票状态分别落 PAID 与 PARTIAL_PAID」的零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCall, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

function readAmount(obj: Record<string, unknown>, key: string, label: string): number {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`${label}：缺少后端真实键 "${key}"，实际键=${Object.keys(obj).join(',')}`);
  }
  const n = Number(obj[key]);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}：键 "${key}" 不可解析为有限数字，raw=${JSON.stringify(obj[key])}`);
  }
  return n;
}

function readStatus(obj: Record<string, unknown>, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(obj, 'status')) {
    throw new Error(`${label}：缺少后端真实键 "status"，实际键=${Object.keys(obj).join(',')}`);
  }
  return String(obj.status);
}

function expectMoney(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}：期望=${expected} 实际=${actual}`).toBeLessThan(
    0.01
  );
}

async function seedCustomer(page: Page): Promise<number> {
  const res = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/crm/customers', {
    customer_name: `E2E多单核销${genCode('AR')}`,
  });
  const id = Number(res.data?.id);
  if (!id) throw new Error(`建客户失败：${JSON.stringify(res)}`);
  CLEANUP.push({ path: `/crm/customers/${id}`, label: 'customer' });
  return id;
}

async function seedInvoice(
  page: Page,
  customerId: number,
  amount: number,
  day: string
): Promise<number> {
  const inv = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    invoice_amount: amount,
    invoice_date: day,
    due_date: day,
  });
  const id = Number(inv.id);
  if (!id) throw new Error(`建应收单失败：${JSON.stringify(inv)}`);
  CLEANUP.push({ path: `/ar/invoices/${id}`, label: 'ar_invoice' });
  return id;
}

async function readInvoice(page: Page, id: number): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(page, 'GET', `/ar/invoices/${id}`);
}

test.describe('463 应收一笔收款核销多单的顺序分摊守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // 收款生成凭证过账要过 check_date_locked；init_first_period 幂等，非 2xx 即环境缺陷。
    await apiCall(page, 'POST', '/finance/accounting-periods/init', {});
  });

  test('463-01 收款 500 按 invoice_ids 顺序分摊到 300/700 两票，金额守恒且状态各落 PAID/PARTIAL_PAID', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page);
    const day = new Date().toISOString().slice(0, 10);

    // 两张应收单：先建 300（应被全额核销），后建 700（应被部分核销）。
    const firstId = await seedInvoice(page, customerId, 300, day);
    const secondId = await seedInvoice(page, customerId, 700, day);

    const firstBefore = await readInvoice(page, firstId);
    const secondBefore = await readInvoice(page, secondId);
    expectMoney(readAmount(firstBefore, 'unpaid_amount', '票1建单未收'), 300, '票1建单未收');
    expectMoney(readAmount(secondBefore, 'unpaid_amount', '票2建单未收'), 700, '票2建单未收');

    // 关键：invoice_ids 指定顺序 [300 票, 700 票]，分摊必须按此顺序而非发票金额/id 排序。
    await apiCall(page, 'POST', '/ar/payments', {
      customer_id: customerId,
      amount: 500,
      payment_method: '银行转账',
      payment_date: day,
      invoice_ids: [firstId, secondId],
    });

    const firstAfter = await readInvoice(page, firstId);
    const secondAfter = await readInvoice(page, secondId);

    // 顺序分摊真值：remaining=500 → 票1 分 min(500,300)=300、remaining=200；
    // 票2 分 min(200,700)=200、remaining=0。反序则票1 已收 0、票2 已收 500，必然判红。
    expectMoney(readAmount(firstAfter, 'received_amount', '票1已收'), 300, '票1顺序分摊额');
    expectMoney(readAmount(firstAfter, 'unpaid_amount', '票1未收'), 0, '票1未收归零');
    expectMoney(readAmount(secondAfter, 'received_amount', '票2已收'), 200, '票2顺序分摊额');
    expectMoney(readAmount(secondAfter, 'unpaid_amount', '票2未收'), 500, '票2未收余额');

    // 状态分别落点：全额核销票 → PAID，部分核销票 → PARTIAL_PAID（词表逐字）。
    expect(readStatus(firstAfter, '票1核销后'), '[463] 票1全额核销状态须逐字为 PAID').toBe('PAID');
    expect(readStatus(secondAfter, '票2核销后'), '[463] 票2部分核销状态须逐字为 PARTIAL_PAID').toBe(
      'PARTIAL_PAID'
    );

    // 守恒：两票已收之和恰等于收款额 500；两票未收之和 = 总额 1000 - 已收 500。
    expectMoney(
      readAmount(firstAfter, 'received_amount', '票1已收') +
        readAmount(secondAfter, 'received_amount', '票2已收'),
      500,
      '[463] 两票已收合计须守恒等于收款额'
    );
    expectMoney(
      readAmount(firstAfter, 'unpaid_amount', '票1未收') +
        readAmount(secondAfter, 'unpaid_amount', '票2未收'),
      500,
      '[463] 两票未收合计须守恒等于总额减收款'
    );

    // 每票自身的会计恒等 invoice - received = unpaid。
    for (const [row, label] of [
      [firstAfter, '票1'],
      [secondAfter, '票2'],
    ] as const) {
      expectMoney(
        readAmount(row, 'invoice_amount', `${label}应收原额`) -
          readAmount(row, 'received_amount', `${label}已收`),
        readAmount(row, 'unpaid_amount', `${label}未收`),
        `[463] ${label}恒等 invoice-received=unpaid`
      );
    }
  });
});
