// 4.23 报表时间维度：AR 日报表按 invoice_date 分组，闭区间 [start_date, end_date]，
//   剔除 DRAFT/CANCELLED，逐日汇总 invoice_count/invoice_amount/paid_amount/unpaid_amount。
// 后端判据：routes/finance.rs:945-948 挂 GET /ar/reports/daily；
//   handlers/ar_report_handler.rs:67-97 ArReportQuery 收 start_date/end_date/customer_id，
//   :74-77 缓存键含三参数（本例用自建客户 + 三个不同区间，避免串味）；
//   services/ar_ops/report.rs:195-235 build_daily_sql_and_params：
//     WHERE status NOT IN (CANCELLED, DRAFT) + customer_id/invoice_date>=start/invoice_date<=end；
//     GROUP BY invoice_date ORDER BY invoice_date ASC；出参五字段 Decimal 均 to_string()。
// 与既有用例分工：459 验统计端点剔除与逾期、460 验月报 YYYY-MM 跨年分桶、
//   461 验账龄 baseline 五桶；本例专补日报「按自然日分组 + 闭区间同日边界 + 逐日金额」零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

type DailyRow = {
  date?: string;
  invoice_count?: string | number;
  invoice_amount?: string;
  paid_amount?: string;
  unpaid_amount?: string;
};

function money(raw: string | number | undefined, label: string): bigint {
  if (raw === undefined) throw new Error(`${label}：缺少后端真实字段，raw=undefined`);
  const s = String(raw);
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：无法解析 Decimal，raw=${s}`);
  const frac = (m[2] ?? '').padEnd(2, '0').slice(0, 2);
  return BigInt(m[1]) * 100n + BigInt(frac);
}

async function seedInvoice(
  page: Page,
  customerId: number,
  amount: string,
  invoiceDate: string
): Promise<number> {
  const created = await apiCallRaw<{ id?: string | number }>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    invoice_amount: amount,
    invoice_date: invoiceDate,
    due_date: invoiceDate,
  });
  const id = Number(created?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      `[464] 建应收单失败 amount=${amount} date=${invoiceDate}：${JSON.stringify(created)}`
    );
  }
  CLEANUP.push({ path: `/ar/invoices/${id}`, label: 'ar_invoice' });
  return id;
}

async function daily(
  page: Page,
  customerId: number,
  start: string,
  end: string
): Promise<DailyRow[]> {
  return apiCallRaw<DailyRow[]>(
    page,
    'GET',
    `/ar/reports/daily?customer_id=${customerId}&start_date=${start}&end_date=${end}`
  );
}

test.describe('4.23 AR日报表口径', () => {
  test('464-01 按自然日分组、闭区间同日边界、剔除草稿与取消票、逐日金额守恒', async ({ page }) => {
    await loginViaUI(page);

    const customer = await apiCallRaw<{ id?: string | number }>(page, 'POST', '/crm/customers', {
      customer_name: `E2E464日报客户${genCode('C')}`,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[464] 前置：自建客户失败').toBeGreaterThan(0);
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: 'customer' });

    // 生效票一：2025-12-31 开票 100 → 计入首日
    const firstId = await seedInvoice(page, customerId, '100.00', '2025-12-31');
    const firstApproved = await apiCallRaw<{ status?: string }>(
      page,
      'POST',
      `/ar/invoices/${firstId}/approve`
    );
    expect(firstApproved.status, '[464] 首日票须 approve 为 APPROVED').toBe('APPROVED');

    // 生效票二：2026-01-01 开票 200 → 计入次日
    const secondId = await seedInvoice(page, customerId, '200.00', '2026-01-01');
    const secondApproved = await apiCallRaw<{ status?: string }>(
      page,
      'POST',
      `/ar/invoices/${secondId}/approve`
    );
    expect(secondApproved.status, '[464] 次日票须 approve 为 APPROVED').toBe('APPROVED');

    // 草稿票 400（2026-01-02）：不 approve，须被剔除
    await seedInvoice(page, customerId, '400.00', '2026-01-02');

    // 取消票 800（2026-01-02）：approve 后 cancel，须被剔除
    const cancelledId = await seedInvoice(page, customerId, '800.00', '2026-01-02');
    await apiCallRaw(page, 'POST', `/ar/invoices/${cancelledId}/approve`);
    const cancelled = await apiCallRaw<{ status?: string }>(
      page,
      'POST',
      `/ar/invoices/${cancelledId}/cancel`,
      { reason: `E2E464-${genCode('R')}` }
    );
    expect(cancelled.status, '[464] 取消票状态须为 CANCELLED').toBe('CANCELLED');

    // 区间跨全部四张票：只回两行生效票（DRAFT/CANCELLED 剔除），按 invoice_date 升序
    const rows = await daily(page, customerId, '2025-12-31', '2026-01-02');
    expect(Array.isArray(rows), '[464] 日报出参须为数组').toBe(true);
    expect(
      rows.map(r => r.date),
      '[464] 日报须按自然日升序且只含生效票'
    ).toEqual(['2025-12-31', '2026-01-01']);
    const first = rows[0];
    const second = rows[1];
    expect(Number(first.invoice_count), '[464] 首日票数').toBe(1);
    expect(Number(second.invoice_count), '[464] 次日票数').toBe(1);
    expect(money(first.invoice_amount, '首日开票额'), '[464] 首日开票额=100').toBe(10000n);
    expect(money(first.unpaid_amount, '首日未收额'), '[464] 首日未收额=100').toBe(10000n);
    expect(money(first.paid_amount, '首日已收额'), '[464] 首日已收额=0').toBe(0n);
    expect(money(second.invoice_amount, '次日开票额'), '[464] 次日开票额=200').toBe(20000n);
    expect(money(second.unpaid_amount, '次日未收额'), '[464] 次日未收额=200').toBe(20000n);

    // 闭区间同日边界：start=end=开票日恰命中；start=end=剔除票日返回空
    const sameDay = await daily(page, customerId, '2025-12-31', '2025-12-31');
    expect(sameDay.length, '[464] 同日闭区间须恰命中首日一行').toBe(1);
    expect(sameDay[0].date, '[464] 同日区间日期').toBe('2025-12-31');
    expect(money(sameDay[0].invoice_amount, '同日开票额'), '[464] 同日开票额=100').toBe(10000n);

    const excludedDay = await daily(page, customerId, '2026-01-02', '2026-01-02');
    expect(excludedDay.length, '[464] 仅含草稿/取消票的日子须返回空数组').toBe(0);
  });
});
