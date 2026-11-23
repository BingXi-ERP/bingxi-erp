// 673 逾期预警正文金额与阈值边界守恒：同客户两票逾期按未收合计与最大天数生成单条预警。
//
// 功能：两张同客户逾期应收 + 启用账龄规则，扫描后预警正文未收金额等于两票 unpaid 之和、天数取最大、
//       级别按阈值判定；部分回款使合计跌破规则阈值后重扫不新增预警，原预警正文不被回写漂移。
// 判据来源（写入方为准）：services/finance_alert_service.rs:430-480 scan_overdue_ar 按客户聚合，
//       total_unpaid+=unpaid_amount、max_days=max(overdue_days)，过滤 unpaid>0/due_date<today/approval_status=APPROVED/status!=CANCELLED；
//       :119-125 ar_overdue_level：>90 critical、>30 warning、否则 info；content 正文逐字为
//       「客户 {} 应收逾期 {} 天，未收金额 {} 元。请尽快安排催收。」，actual_value=total_unpaid。
// 调用方与端点：POST /aging-alert-rules 建规则，POST /ar/invoices 与 /{id}/approve 建两票，
//       POST /finance-alerts/trigger-scan 触发，GET /finance-alerts 列表回读，POST /ar/payments 做部分回款。
// 数据形状与存储：threshold_amount/actual_value/unpaid 均 DECIMAL，JSON 字符串定点分位比较；
//       扫描结果 created/created_count 成对，列表为 PaginatedResponse{items,total,page,page_size}。
// 状态词表与失败：预警级别词表小写 info/warning/critical，ar_overdue 类型逐字匹配；失败仅 AppError 字符串码。
// 与 410 分工：410 钉扫描幂等与通知推送，本例钉正文金额守恒、最大天数与阈值级别边界，不重复推送断言。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
interface AlertRow {
  id: number;
  alert_type: string;
  alert_level: string;
  title: string;
  content: string;
  actual_value: string | null;
  status: string;
}
interface ScanResult {
  created: AlertRow[];
  created_count: number;
}
interface CleanupEntry {
  path: string;
  label: string;
}
const CLEANUP: CleanupEntry[] = [];

/** 功能：DECIMAL 定点转分；入参：JSON 值+字段名；出参：bigint 分；异常：非数字或超两位有效尾数抛错。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} 非 DECIMAL 出参：${JSON.stringify(value)}`);
  }
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!matched) throw new Error(`${label} 无法定点解析：${String(value)}`);
  const fraction = (matched[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超过两位：${String(value)}`);
  }
  return BigInt(`${matched[1]}${matched[2]}${fraction.slice(0, 2)}`);
}

/** 功能：必填正整数 id；入参：未知值+标签；出参：number；异常：非正整数抛错。 */
function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} 非法：${JSON.stringify(value)}`);
  return id;
}

/** 功能：相对今天的日期串；入参：逾期天数；出参：YYYY-MM-DD；异常：无（调用方保证正整数）。 */
function pastDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/** 功能：读取某客户 ar_overdue 预警；入参：page+客户名；出参：标题命中该客户的预警数组；异常：列表形状异常抛错。 */
async function alertsForCustomer(page: Page, customerName: string): Promise<AlertRow[]> {
  const result = await apiCallRaw<{ items?: AlertRow[] }>(
    page,
    'GET',
    '/finance-alerts?alert_type=ar_overdue&page=1&page_size=100'
  );
  if (!Array.isArray(result.items)) {
    throw new Error(`预警列表形状异常：${JSON.stringify(result)}`);
  }
  return result.items.filter(
    alert => alert.alert_type === 'ar_overdue' && alert.title.includes(customerName)
  );
}

test.describe.serial('673 逾期预警正文金额守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    while (CLEANUP.length > 0) {
      const entry = CLEANUP.pop();
      if (entry) await tryCleanup(page, 'DELETE', entry.path, entry.label);
    }
  });

  test('两票逾期按未收合计与最大天数出预警，跌破阈值重扫不新增', async ({ page }) => {
    const tag = genCode('673');
    const customerName = `E2E673-CUST-${tag}`;
    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: customerName,
      status: 'active',
    });
    const customerId = requireId(customer.id, '建客户');
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `customer#${customerId}` });

    const rule = await apiCallRaw<Row>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E673 规则 ${tag}`,
      rule_code: `AGING673_${tag}`,
      aging_bucket: '30_days',
      threshold_days: 30,
      threshold_amount: '600.00',
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: ['cost_accountant'],
      is_active: true,
      remarks: `E2E673 ${tag}`,
    });
    const ruleId = requireId(rule.id, '建账龄规则');
    CLEANUP.push({ path: `/aging-alert-rules/${ruleId}`, label: `aging-rule#${ruleId}` });

    const first = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      customer_name: customerName,
      invoice_amount: 300,
      invoice_date: pastDate(60),
      due_date: pastDate(45),
    });
    const firstId = requireId(first.id, '建第一张逾期应收');
    CLEANUP.push({ path: `/ar/invoices/${firstId}`, label: `ar#${firstId}` });
    await apiCall(page, 'POST', `/ar/invoices/${firstId}/approve`);

    const second = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      customer_name: customerName,
      invoice_amount: 500,
      invoice_date: pastDate(90),
      due_date: pastDate(75),
    });
    const secondId = requireId(second.id, '建第二张逾期应收');
    CLEANUP.push({ path: `/ar/invoices/${secondId}`, label: `ar#${secondId}` });
    await apiCall(page, 'POST', `/ar/invoices/${secondId}/approve`);

    const scan = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    expect(scan.created.length, 'created_count 必须等于实际写入行数').toBe(scan.created_count);
    const own = scan.created.filter(alert => alert.title.includes(customerName));
    expect(own.length, '两票应收应聚合为本客户唯一一条预警').toBe(1);
    const alert = own[0] as AlertRow;
    const expectedUnpaid = `客户 ${customerName} 应收逾期 75 天，未收金额 800.00 元。请尽快安排催收。`;
    expect(alert.content, '正文未收金额须等于两票 unpaid 之和、天数取最大').toBe(expectedUnpaid);
    expect(
      decimalCents(alert.actual_value, '预警 actual_value'),
      'actual_value 与正文金额一致'
    ).toBe(80000n);
    expect(alert.alert_level, '最大逾期 75 天落在 >30 且 <=90 的 warning 区间').toBe('warning');
    expect(alert.status, '预警初始状态应可回读').toBeTruthy();
    CLEANUP.push({ path: `/finance-alerts/${alert.id}`, label: `alert#${alert.id}` });

    // 部分回款使两票未收合计 800.00→550.00，低于规则阈值 600.00。
    await apiCall(page, 'POST', '/ar/payments', {
      customer_id: customerId,
      amount: '250.00',
      payment_method: '银行转账',
      payment_date: new Date().toISOString().slice(0, 10),
      invoice_ids: [firstId],
    });
    const firstAfter = await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${firstId}`);
    expect(decimalCents(firstAfter.unpaid_amount, '第一票部分回款后未收'), '300-250=50.00').toBe(
      5000n
    );
    const secondAfter = await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${secondId}`);
    expect(decimalCents(secondAfter.unpaid_amount, '第二票未收'), '未参与回款仍为 500.00').toBe(
      50000n
    );
    expect(
      decimalCents(firstAfter.unpaid_amount, '第一票未收') +
        decimalCents(secondAfter.unpaid_amount, '第二票未收') <
        60000n,
      '合计 550.00 应低于阈值 600.00'
    ).toBe(true);

    const rescan = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    expect(rescan.created.length, 'rescan.created_count 也应等于写入行数').toBe(
      rescan.created_count
    );
    expect(
      rescan.created.filter(item => item.title.includes(customerName)).length,
      '跌破阈值后重扫不得为同客户新增预警'
    ).toBe(0);
    const persisted = await alertsForCustomer(page, customerName);
    expect(persisted.length, '同客户预警必须仍为唯一一条').toBe(1);
    expect(persisted[0]?.content, '历史预警正文金额快照不得被回写漂移').toBe(expectedUnpaid);
    expect(persisted[0]?.alert_level, '历史级别快照不得漂移').toBe('warning');
  });
});
