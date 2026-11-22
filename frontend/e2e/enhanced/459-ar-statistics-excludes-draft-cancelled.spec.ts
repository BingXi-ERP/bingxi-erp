// 4.23 报表口径 + 4.16 汇总守恒：AR 统计报表剔除草稿与已取消票，只汇总生效票；
//   逾期票按 due_date < 今天且 unpaid_amount > 0 计数与汇总，货款率按 paid/total 计算。
// 后端判据：routes/finance.rs:935-940 挂 GET /ar/reports/statistics；
//   handlers/ar_report_handler.rs:19-25 ArReportQuery 收 start_date/end_date/customer_id，
//   :38-57 缓存键含 customer_id 与起止日（专属客户 + 专属区间隔离缓存）；
//   services/ar_ops/report.rs:82-88 where 恒带 status NOT IN (CANCELLED, DRAFT)，
//   :109-114 COUNT(*)/SUM(invoice_amount)/SUM(received_amount)/SUM(unpaid_amount)
//   与 due_date<today AND unpaid_amount>0 的逾期计数/逾期金额；
//   :133-148 回 collection_rate=paid/total；出参键 total_invoices/total_amount/
//   paid_amount/unpaid_amount/overdue_count/overdue_amount/collection_rate。
//   建单默认 DRAFT 且 unpaid_amount=invoice_amount（services/ar_invoice_service.rs:170-171），
//   approve DRAFT→APPROVED，cancel 置 CANCELLED（body 必带 reason）。
// 与既有覆盖分工：fullflow/11-ar.spec.ts 只验建单 DRAFT、approve、重复 approve 400，
//   flow/160 只测 AP 报表；全 e2e 无 /ar/reports 断言。本例专钉统计口径剔除与逾期。
// 检测力：草稿/取消票被计入则 total_invoices 或 total_amount 即红；逾期条件漏一端则
//   overdue_count 红；汇总不等于明细则金额断言红。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

interface ArRow {
  id?: number;
  status?: string;
}
interface Stats {
  total_invoices?: number;
  total_amount?: unknown;
  paid_amount?: unknown;
  unpaid_amount?: unknown;
  overdue_count?: number;
  overdue_amount?: unknown;
  collection_rate?: number;
}

function toScaled(v: unknown, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw=${JSON.stringify(v)}`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.replace(/0+$/, '').length > 2) {
    throw new Error(`${label}：出参精度超过 2 位，raw="${s}"`);
  }
  const scaled = BigInt(intPart + frac.padEnd(2, '0').slice(0, 2));
  return sign === '-' ? -scaled : scaled;
}
const yuan = (s: string): bigint => toScaled(s, `金额 ${s}`);

async function seedInvoice(
  page: Page,
  customerId: number,
  amount: string,
  invoiceDate: string,
  dueDate: string
): Promise<number> {
  const created = await apiCallRaw<ArRow>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    customer_name: `E2E459客户${customerId}`,
    source_type: 'MANUAL',
    source_bill_no: genCode('E459'),
    invoice_date: invoiceDate,
    due_date: dueDate,
    invoice_amount: amount,
  });
  const id = Number(created?.id);
  expect(id, `[459] 建应收单失败 amount=${amount}`).toBeGreaterThan(0);
  return id;
}

test.describe('4.23 AR统计报表口径', () => {
  test('459-01 剔除草稿与取消票，只汇总生效票并正确计逾期', async ({ page }) => {
    await loginViaUI(page);

    const customer = await apiCallRaw<ArRow>(page, 'POST', '/crm/customers', {
      customer_name: `E2E459统计口径客户${genCode('C')}`,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[459] 前置：自建客户失败').toBeGreaterThan(0);

    const ids: number[] = [];
    try {
      // 生效票一：2025-12-31 开票、已过期未付 → 计入且逾期
      const overdueId = await seedInvoice(page, customerId, '100.00', '2025-12-31', '2020-01-01');
      ids.push(overdueId);
      const approveOverdue = await apiCallRaw<ArRow>(
        page,
        'POST',
        `/ar/invoices/${overdueId}/approve`
      );
      expect(approveOverdue.status, '[459] 逾期票须 approve 为 APPROVED').toBe('APPROVED');

      // 生效票二：2026-01-01 开票、未来到期 → 计入但不逾期
      const currentId = await seedInvoice(page, customerId, '200.00', '2026-01-01', '2099-12-31');
      ids.push(currentId);
      const approveCurrent = await apiCallRaw<ArRow>(
        page,
        'POST',
        `/ar/invoices/${currentId}/approve`
      );
      expect(approveCurrent.status, '[459] 正常票须 approve 为 APPROVED').toBe('APPROVED');

      // 草稿票 400：不 approve，须被剔除
      const draftId = await seedInvoice(page, customerId, '400.00', '2026-01-01', '2099-12-31');
      ids.push(draftId);

      // 取消票 800：approve 后 cancel，须被剔除
      const cancelledId = await seedInvoice(page, customerId, '800.00', '2026-01-01', '2099-12-31');
      ids.push(cancelledId);
      await apiCallRaw(page, 'POST', `/ar/invoices/${cancelledId}/approve`);
      const cancelled = await apiCallRaw<ArRow>(
        page,
        'POST',
        `/ar/invoices/${cancelledId}/cancel`,
        { reason: `E2E459-${genCode('R')}` }
      );
      expect(cancelled.status, '[459] 取消票状态须为 CANCELLED').toBe('CANCELLED');

      const stats = await apiCallRaw<Stats>(
        page,
        'GET',
        `/ar/reports/statistics?customer_id=${customerId}&start_date=2025-12-31&end_date=2026-01-01`
      );
      expect(
        Number(stats.total_invoices),
        '[459] 仅两张 APPROVED 票须计入，草稿与取消票被剔除'
      ).toBe(2);
      expect(yuan(String(stats.total_amount)), '[459] 汇总金额须为 100+200=300').toBe(
        yuan('300.00')
      );
      expect(yuan(String(stats.paid_amount)), '[459] 未收款时 paid_amount 须为 0').toBe(0n);
      expect(yuan(String(stats.unpaid_amount)), '[459] 未付金额须为 300').toBe(yuan('300.00'));
      expect(
        Number(stats.overdue_count),
        '[459] 仅 due_date 过期且未付的票计入逾期，正常票不算'
      ).toBe(1);
      expect(yuan(String(stats.overdue_amount)), '[459] 逾期金额须为 100').toBe(yuan('100.00'));
      expect(
        Number(stats.collection_rate),
        '[459] 无收款时货款率须为 0，不得把草稿/取消票的分母混入'
      ).toBe(0);
    } finally {
      for (const id of ids) {
        await tryCleanup(page, 'DELETE', `/ar/invoices/${id}`, `459 应收单 ${id}`);
      }
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `459 客户 ${customerId}`);
    }
  });
});
