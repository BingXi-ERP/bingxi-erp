// 4.23 报表时间维度 + 4.30 跨年归属：AR 月报按 invoice_date 的 YYYY-MM 分桶，
//   跨年票各归其月，草稿与取消票不进任何月份。
// 后端判据：routes/finance.rs:945-948 挂 GET /ar/reports/monthly；
//   handlers/ar_report_handler.rs:103-113 缓存键含 customer_id 与起止日（专属客户+区间隔离）；
//   services/ar_ops/report.rs:292-298 where 恒带 status NOT IN (CANCELLED, DRAFT)，
//   :316-324 `to_char(invoice_date,'YYYY-MM') AS month`，GROUP BY month + ORDER BY month；
//   响应行键 month/invoice_count/invoice_amount/paid_amount/unpaid_amount（Decimal 出参为 string）。
// 与既有覆盖分工：459 验统计端点状态剔除与逾期，端点与分桶判据均不同；
//   flow/160 只测 AP 账龄报表月报的 period_start/period_end，非 AR 的 YYYY-MM 分桶；
//   fullflow/11-ar 只验建单/approve。全 e2e 无 /ar/reports/monthly 断言。
// 检测力：跨年票归错月则月份桶 count/amount 红；草稿或取消票混入则桶多出记录即红；
//   分桶键改用 created_at 则按开票日造的三票归属即红。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

interface ArRow {
  id?: number;
  status?: string;
}
interface MonthRow {
  month?: string;
  invoice_count?: number;
  invoice_amount?: unknown;
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

async function seedApproved(
  page: Page,
  customerId: number,
  amount: string,
  date: string
): Promise<number> {
  const created = await apiCallRaw<ArRow>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    customer_name: `E2E460客户${customerId}`,
    source_type: 'MANUAL',
    source_bill_no: genCode('E460'),
    invoice_date: date,
    due_date: '2099-12-31',
    invoice_amount: amount,
  });
  const id = Number(created?.id);
  expect(id, `[460] 建票失败 date=${date}`).toBeGreaterThan(0);
  const approved = await apiCallRaw<ArRow>(page, 'POST', `/ar/invoices/${id}/approve`);
  expect(approved.status, '[460] 须 approve 为 APPROVED').toBe('APPROVED');
  return id;
}

test.describe('4.23 AR月报跨年分桶', () => {
  test('460-01 按开票日 YYYY-MM 分桶，草稿与取消票不进任何月份', async ({ page }) => {
    await loginViaUI(page);

    const customer = await apiCallRaw<ArRow>(page, 'POST', '/crm/customers', {
      customer_name: `E2E460月报客户${genCode('C')}`,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[460] 前置：自建客户失败').toBeGreaterThan(0);

    const ids: number[] = [];
    try {
      ids.push(await seedApproved(page, customerId, '100.00', '2025-12-31'));
      ids.push(await seedApproved(page, customerId, '200.00', '2026-01-01'));
      ids.push(await seedApproved(page, customerId, '300.00', '2026-01-31'));

      // 草稿票：不 approve，须被剔除
      const draft = await apiCallRaw<ArRow>(page, 'POST', '/ar/invoices', {
        customer_id: customerId,
        customer_name: `E2E460客户${customerId}`,
        source_type: 'MANUAL',
        source_bill_no: genCode('E460D'),
        invoice_date: '2026-01-15',
        due_date: '2099-12-31',
        invoice_amount: '999.00',
      });
      ids.push(Number(draft?.id ?? 0));

      // 取消票：approve 后 cancel，须被剔除
      const toCancel = await seedApproved(page, customerId, '888.00', '2026-01-20');
      ids.push(toCancel);
      const cancelled = await apiCallRaw<ArRow>(page, 'POST', `/ar/invoices/${toCancel}/cancel`, {
        reason: `E2E460-${genCode('R')}`,
      });
      expect(cancelled.status, '[460] 取消票状态须为 CANCELLED').toBe('CANCELLED');

      const rows = await apiCallRaw<MonthRow[]>(
        page,
        'GET',
        `/ar/reports/monthly?customer_id=${customerId}&start_date=2025-12-01&end_date=2026-01-31`
      );
      expect(Array.isArray(rows), '[460] 月报出参须为数组').toBe(true);
      const months = rows.map(r => String(r.month ?? ''));
      expect(months, '[460] 须恰好两个月份桶且按月份升序').toEqual(['2025-12', '2026-01']);

      const dec = rows.find(r => r.month === '2025-12');
      expect(Number(dec?.invoice_count), '[460] 2025-12 桶须 1 张票').toBe(1);
      expect(toScaled(dec?.invoice_amount, '2025-12 金额'), '[460] 2025-12 桶金额须 100').toBe(
        toScaled('100.00', '期望 100')
      );

      const jan = rows.find(r => r.month === '2026-01');
      expect(Number(jan?.invoice_count), '[460] 2026-01 桶须 2 张生效票').toBe(2);
      expect(
        toScaled(jan?.invoice_amount, '2026-01 金额'),
        '[460] 2026-01 桶金额须 200+300=500'
      ).toBe(toScaled('500.00', '期望 500'));

      for (const row of rows) {
        expect(
          Number(row.invoice_count),
          `[460] 月份 ${row.month} 不得混入草稿(999)或取消(888)票`
        ).toBeLessThanOrEqual(2);
      }
    } finally {
      for (const id of ids) {
        if (id > 0) {
          await tryCleanup(page, 'DELETE', `/ar/invoices/${id}`, `460 应收单 ${id}`);
        }
      }
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `460 客户 ${customerId}`);
    }
  });
});
