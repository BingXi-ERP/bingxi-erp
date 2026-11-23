// 4.23 报表口径 + 4.16 汇总守恒：AR 统计报表总额等于日报按日分组之和、月报按月分组之和；
//   三口共用同一 customer 与同一跨年区间，DRAFT/CANCELLED 票在三口同时剔除，金额按 scaled BigInt 比较。
// 后端判据：routes/finance.rs:935-948 挂 GET /ar/reports/statistics|daily|monthly；
//   handlers/ar_report_handler.rs:19-25 ArReportQuery 收 start_date/end_date/customer_id，
//   :38-41/:74-77/:103-113 三口缓存键各有前缀且含 customer_id 与起止日（自建客户隔离缓存）；
//   services/ar_ops/report.rs:82-99 统计 SQL 恒带 status NOT IN ($1,$2) 且 customer_id/invoice_date 过滤，
//   :109-114 COUNT(*)/SUM(invoice_amount)/SUM(received_amount)/SUM(unpaid_amount) 出 total_invoices/
//   total_amount/paid_amount/unpaid_amount；:195-235 日报同 WHERE 按 invoice_date GROUP BY，
//   :292-324 月报同 WHERE 按 to_char(invoice_date,'YYYY-MM') GROUP BY，Decimal 出参均为 to_string。
// 状态词表：写入方 models/status/common.rs 的大写 DRAFT/CANCELLED，禁用中文或小写变体。
// 与既有覆盖分工：459 验统计端点的草稿/取消剔除与逾期口径，460 验月报跨年分桶，464 验日报按日分桶；
//   本例只锁三出口在同一区间下的分组守恒，不重复各端点自身的单点口径断言。
// 检测力：统计与日报/月报的金额或计数口径一旦漂移（状态过滤不一致、日期列不一致、缓存串味），
//   分位 BigInt 之和即判红；不用 Number 相等，避免精度误差掩盖真实差额。
import { test, expect, type Page } from '../diagnose-fixture';
import { loginViaUI, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

interface CleanupEntry {
  path: string;
  label: string;
}

const CLEANUP: CleanupEntry[] = [];

interface Stats {
  total_invoices: number;
  total_amount: string;
  paid_amount: string;
  unpaid_amount: string;
}

interface DailyRow {
  invoice_date: string;
  invoice_count: number;
  invoice_amount: string;
  paid_amount: string;
  unpaid_amount: string;
}

interface MonthlyRow {
  month: string;
  invoice_count: number;
  invoice_amount: string;
  paid_amount: string;
  unpaid_amount: string;
}

/** Decimal 出参按两位小数放大为 BigInt，禁止用 Number 相等比较金额。 */
function toScaled(v: unknown, label: string): bigint {
  const s = String(v);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw=${s}`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.replace(/0+$/, '').length > 2) {
    throw new Error(`${label}：出参精度超过 2 位，raw="${s}"`);
  }
  const scaled = BigInt(intPart + frac.padEnd(2, '0').slice(0, 2));
  return sign === '-' ? -scaled : scaled;
}

/** 对分组行的某金额列求分位和；缺键/非法形态显式抛错，不做 ?? 兜底。 */
function sumScaled(rows: unknown[], key: string, label: string): bigint {
  return rows.reduce<bigint>(
    (acc, row) => acc + toScaled((row as Record<string, unknown>)[key], `${label}.${key}`),
    0n
  );
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
      `[613] 建应收单失败 amount=${amount} date=${invoiceDate}：${JSON.stringify(created)}`
    );
  }
  CLEANUP.push({ path: `/ar/invoices/${id}`, label: 'ar_invoice' });
  return id;
}

test.describe('4.23 AR 报表三出口分组守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
    CLEANUP.length = 0;
  });

  test('613-01 统计总额等于日报按日之和、月报按月之和（跨年区间守恒）', async ({ page }) => {
    const customer = await apiCallRaw<{ id?: number }>(page, 'POST', '/crm/customers', {
      customer_name: `E2E613守恒客户${genCode('C')}`,
    });
    const customerId = Number(customer?.id);
    expect(
      Number.isInteger(customerId) && customerId > 0,
      `[613] 建客户失败：${JSON.stringify(customer)}`
    ).toBe(true);
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: 'customer' });

    // 两张生效票跨年：2025-12-20 与 2026-01-15，approve 后进入三口统计
    const first = await seedInvoice(page, customerId, '100.00', '2025-12-20');
    await apiCallRaw(page, 'POST', `/ar/invoices/${first}/approve`);
    const second = await seedInvoice(page, customerId, '250.50', '2026-01-15');
    await apiCallRaw(page, 'POST', `/ar/invoices/${second}/approve`);
    // 草稿票不 approve，取消票 approve 后 cancel：二者均被三口的 status NOT IN 剔除
    await seedInvoice(page, customerId, '400.00', '2026-01-02');
    const cancelled = await seedInvoice(page, customerId, '800.00', '2025-12-28');
    await apiCallRaw(page, 'POST', `/ar/invoices/${cancelled}/approve`);
    await apiCallRaw(page, 'POST', `/ar/invoices/${cancelled}/cancel`, {
      reason: `E2E613-${genCode('R')}`,
    });

    const scope = `customer_id=${customerId}&start_date=2025-12-01&end_date=2026-01-31`;
    const stats = await apiCallRaw<Stats>(page, 'GET', `/ar/reports/statistics?${scope}`);
    const daily = await apiCallRaw<DailyRow[]>(page, 'GET', `/ar/reports/daily?${scope}`);
    const monthly = await apiCallRaw<MonthlyRow[]>(page, 'GET', `/ar/reports/monthly?${scope}`);

    expect(Array.isArray(daily), '[613] 日报缺数组出参').toBe(true);
    expect(Array.isArray(monthly), '[613] 月报缺数组出参').toBe(true);
    expect(daily.length, '[613] 日报应按两张生效票的 invoice_date 分两行').toBe(2);
    expect(monthly.length, '[613] 月报应按两张生效票的 YYYY-MM 分两行').toBe(2);
    expect(stats.total_invoices, '[613] 统计生效票数须为两张，草稿/取消票被剔除').toBe(2);

    // 计数守恒：统计 total_invoices == 日报 invoice_count 之和 == 月报 invoice_count 之和
    const dailyCount = daily.reduce((acc, r) => acc + r.invoice_count, 0);
    const monthlyCount = monthly.reduce((acc, r) => acc + r.invoice_count, 0);
    expect(dailyCount, '[613] 日报分组计数之和须等于统计生效票数').toBe(stats.total_invoices);
    expect(monthlyCount, '[613] 月报分组计数之和须等于统计生效票数').toBe(stats.total_invoices);

    // 金额守恒：三口分别比对 invoice_amount / paid_amount / unpaid_amount 的分位和
    const amountKeys = ['invoice_amount', 'paid_amount', 'unpaid_amount'] as const;
    const statByKey: Record<(typeof amountKeys)[number], unknown> = {
      invoice_amount: stats.total_amount,
      paid_amount: stats.paid_amount,
      unpaid_amount: stats.unpaid_amount,
    };
    for (const key of amountKeys) {
      const expected = toScaled(statByKey[key], `statistics.${key}`);
      expect(sumScaled(daily, key, 'daily'), `[613] 日报 ${key} 分位和须等于统计值`).toBe(expected);
      expect(sumScaled(monthly, key, 'monthly'), `[613] 月报 ${key} 分位和须等于统计值`).toBe(
        expected
      );
    }
  });
});
