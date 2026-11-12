import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  deferCleanup,
  flushDeferredCleanups,
  ensureTestEntities,
  getCtx,
  loginAsRole,
  loginViaUI,
  type DeferredCleanup,
} from './helpers';

/**
 * 501 定时任务与后台作业：预警推送对象正确性与重复触发的幂等守恒
 *
 * 覆盖两条判据：
 *   - 库存预警、账期预警、审批超时提醒各自"推给谁、不该推给谁"；
 *   - 同一触发重复执行时，服务端真实行数与关键字段守恒（不靠放宽阈值消红）。
 * e2e 无法等待真实 cron 到点，本文件只走在册的立即执行端点与读台账/读站内信两条可验证面。
 * 每个端点都先在 frontend/scripts/route-snapshot.txt 与 backend/src/routes 取到"方法 + 路径"才写进用例。
 *
 * 契约事实（比较值一律照抄写入方源码）：
 *
 * 1. 账期预警（财务预警台账）services/finance_alert_service.rs + handlers/finance_alert_handler.rs：
 *    POST /finance-alerts/trigger-scan 入参 alert_type（可选），出参 {created, created_count}；
 *    ar_overdue 的候选是按客户聚合的应收发票，落库行带 target_module='customer' 与 target_id=客户 id。
 *    幂等只对未处理态生效：同 alert_type + target_module + target_id 且状态属
 *    {active, acknowledged} 时跳过建行（services/finance_alert_service.rs::alert_already_exists），
 *    故重复触发不得为该客户再开第二张预警单。
 *    状态词表为小写 active / acknowledged / resolved / expired；单号 FA-{YYYYMMDD}{4 位流水}。
 *    GET /finance-alerts/{id} 与 GET /finance-alerts（PaginatedResponse{items,total,page,page_size}）
 *    支持 alert_type / target_module / status 过滤；预警行没有删除路由，终结只能 acknowledge + resolve。
 *
 * 2. 账期预警的收件人：services/finance_alert_service.rs::resolve_recipient_users 是唯一解析点，
 *    取全部 is_active=true 的账龄规则 notify_roles 的角色码并集，映射到在册且启用的用户 id 后逐人投递；
 *    标题前缀 [财务预警]、正文逐字等于预警正文，dedup_key 为空（去重完全靠第 1 条的建行幂等）。
 *    触发者本人不在角色集内时收不到，手工触发不会降级成发给点击者。
 *    规则本身：POST /aging-alert-rules 必填 rule_name / rule_code / aging_bucket / threshold_days /
 *    alert_level / notify_method，可选 notify_roles；GET 列表页码基数为 0；DELETE /aging-alert-rules/{id} 在册。
 *
 * 3. 审批超时提醒 services/bulk_color_approval_service.rs::send_pending_reminders：
 *    POST /bulk-color-approvals/reminders/send-pending?threshold_hours=N 返回 data=本轮投递成功条数；
 *    提醒对象取 record.approver_id，投递标题为 `批色待剪样超时提醒 #{id}`、dedup_key
 *    =bca_pending_reminder_{id}_{YYYYMMDDHH}（services/notification_service.rs::check_dedup 的窗口是
 *    DEDUP_WINDOW_SECS=300 秒，故同一次用例内的连发必然被去重，跨 5 分钟的同小时连发会重复投递——该缺口只登记不设阈值放行）。
 *    GET /bulk-color-approvals/reminders/pending?threshold_hours=N 出参
 *    {items,total,page,page_size} 且按登录人数据范围下推；提醒本身不改单据状态，也不生成新单据。
 *
 * 4. 库存预警：派生词表 services/stock_alert.rs::AlertType::code（out_of_stock / low_stock /
 *    over_stock / expiring / slow_moving / discrepancy）与无告警值 ALERT_TYPE_NORMAL='normal'，
 *    由 services/inventory_stock_query.rs::compute_alert_type 派生，GET /inventory/stock/alerts
 *    出参 PaginatedResponse<StockAlertRow>{items,total,page,page_size}，纯读、不落单据。
 *    推送腿有两条且不同源：worker services/stock_alert_notification_scheduler.rs 每 6 小时扫一次并
 *    投给角色码 admin / manager / warehouse_manager 的在册用户（HTTP 侧无触发入口，只能等周期），
 *    而 GET /inventory/stock 的 handlers/inventory_stock_handler.rs::send_inventory_alerts 把收件人
 *    写成常量 0。故本文件对库存预警只能断"重复触发不新增站内信"与"不该收到的人确实收不到"，
 *    正向投递无法从 HTTP 证明，缺口在交付报告里点名。
 */

/** 本用例在启用规则里声明的收件岗位码；与 loginAsRole 入参同源，不复用其它用例的岗位 */
const NOTIFY_ROLE = 'warehouse_keeper';

/** 用于反向判不可见的岗位码：必须不在任何启用规则的 notify_roles 并集里，用例内先实证再断 */
const NON_RECIPIENT_ROLE = 'report_viewer';

const FINANCE_ALERT_TITLE_PREFIX = '[财务预警] ';

/** 库存告警类型词表，逐字符照抄 services/stock_alert.rs::AlertType::code 的返回值 */
const STOCK_ALERT_TYPES = [
  'out_of_stock',
  'low_stock',
  'over_stock',
  'expiring',
  'slow_moving',
  'discrepancy',
] as const;

type InboxRow = { id: number; title: string; content?: string };

type AlertRule = {
  id: number;
  rule_code: string;
  notify_roles: string[] | null;
  is_active: boolean;
};

type AlertRow = {
  id: number;
  alert_no: string;
  alert_type: string;
  title: string;
  content: string;
  target_module: string | null;
  target_id: number | null;
  status: string;
  notification_id: number | null;
};

type RulePage = { items?: AlertRule[]; total?: number };
type AlertPage = { items?: AlertRow[]; total?: number };
type ScanResult = { created: AlertRow[]; created_count: number };
type CustRow = { id: number; customer_name: string };
type StockAlertRow = { id: number; product_id: number; alert_type: string };
type BcaRow = { id: number; approval_status: string; approver_id: number | null };
type BcaPage = { items?: BcaRow[]; total?: number };

function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 距今 days 天前的纯日期字符串（后端候选谓词按 NaiveDate 比较） */
function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * 功能：列表信封缺 items 即点名抛出，绝不把"读不到键"降级成 0 行。
 * 调用方：本文件全部台账与规则列表读取点。
 * 入参：data 是分页信封，where 是点名用的端点标签。
 * 传给谁：仅用例内断言与计数，不传给任何接口。
 * 存什么/存哪里：不落库。
 */
function requireItems<T>(data: { items?: T[] } | null | undefined, where: string): T[] {
  if (!Array.isArray(data?.items)) {
    throw new Error(
      `${where} 响应缺少 items 数组，实际 keys=${JSON.stringify(Object.keys(data ?? {}))}`
    );
  }
  return data.items;
}

/**
 * 功能：读回当前会话的未读站内信全集，作为命中数守恒与"不该推给谁"的计数面。
 * 调用方：账期预警投递腿、审批超时提醒反向腿与库存预警触发腿。
 * 入参：page 为当前已登录会话；端点 GET /notifications?status=UNREAD&page=1&page_size=100
 * （后端 handlers/notification_handler.rs 把 page_size clamp 到 100，收件人取登录态 user_id）。
 * 传给谁：仅用例内 expect 判据与 console 取证行。
 * 存什么/存哪里：不落库；判据行来自 notifications 表。
 * 只取本页会低估命中数，故带回的 total 大于本页行数即点名抛出，不把"没读到"当成"没有"。
 */
async function readInbox(page: Page): Promise<InboxRow[]> {
  const body = await apiCallRaw<{ list?: InboxRow[]; total?: number }>(
    page,
    'GET',
    '/notifications?status=UNREAD&page=1&page_size=100'
  );
  if (!Array.isArray(body?.list)) {
    throw new Error(
      `GET /notifications 响应缺少 list 数组，实际 keys=${JSON.stringify(Object.keys(body ?? {}))}`
    );
  }
  if (typeof body.total !== 'number') {
    throw new Error(`GET /notifications 响应缺少 total 数值，实际 ${String(body.total)}`);
  }
  if (body.list.length < body.total) {
    throw new Error(
      `GET /notifications 未读列表只带回 ${body.list.length}/${body.total} 行，命中数判据失去守恒意义`
    );
  }
  return body.list;
}

/**
 * 功能：按标题逐字统计命中条数，并把命中数与全集行数打进日志留证。
 * 调用方：本文件全部收件箱判据，rows 一律来自 readInbox（已保证覆盖 total）。
 * 入参：rows 是收件箱全集，title 是写入方拼出的完整标题，where 是点名标签。
 * 传给谁：expect 判据。存什么/存哪里：不落库。
 */
function countTitle(rows: InboxRow[], title: string, where: string): number {
  const hit = rows.filter(n => n.title === title).length;
  console.log(`[${where}] 标题「${title}」命中 ${hit} 条，收件箱全集 ${rows.length} 行`);
  return hit;
}

/**
 * 功能：判定预警行是否指向指定客户。
 * 调用方：trigger-scan 幂等腿对 created 数组与台账行的过滤。
 * 入参：a 是预警行，custId 是客户主键；比较值 'customer' 照抄写入方 target_module 取值。
 * 传给谁：仅用例内计数。存什么/存哪里：不落库。
 */
function isForCustomer(a: AlertRow, custId: number): boolean {
  return a.target_module === 'customer' && a.target_id === custId;
}

test.describe.serial('501 定时任务幂等与预警推送对象', () => {
  const cleanup: DeferredCleanup[] = [];
  // 账号与会话态一律由 helpers 的惰性函数在用例内取，describe 体顶层不求值 worker 环境量。

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    await flushDeferredCleanups(page, cleanup);
  });

  test('501-01 账期预警重复触发不重复建单且关键字段守恒', async ({ page }) => {
    test.setTimeout(240_000);
    const tag = uniq();

    const rule = await apiCallRaw<AlertRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-501-AGE-${tag}`,
      rule_code: `e2e501age${tag}`.slice(0, 40),
      aging_bucket: '60_days',
      threshold_days: 30,
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: [NOTIFY_ROLE],
      is_active: true,
      remarks: `501-01 幂等前置 ${tag}`,
    });
    expect(
      Number.isInteger(rule.id) && rule.id > 0,
      `501-01 建规则应回主键 id，实际 ${JSON.stringify(rule)}`
    ).toBe(true);
    deferCleanup(cleanup, 'DELETE', `/aging-alert-rules/${rule.id}`, `501-01 rule-${tag}`);

    const custs = await apiCall<{ items?: CustRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const custRows = requireItems(custs.data, '501-01 /crm/customers');
    if (custRows.length === 0) {
      throw new Error('501-01 前置不成立：/crm/customers 返回 0 行，无法构造按客户聚合的逾期事实');
    }
    const customer = custRows[0];

    const invoice = await apiCallRaw<{ id: number }>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      customer_name: `${customer.customer_name}-501dup${tag}`,
      invoice_amount: 6123.45,
      invoice_date: pastDate(60),
      due_date: pastDate(45),
    });
    await apiCallRaw(page, 'POST', `/ar/invoices/${invoice.id}/approve`);

    const scan1 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const first = scan1.created.filter(a => isForCustomer(a, customer.id));
    if (first.length !== 1) {
      throw new Error(
        `501-01 前置不成立：首次扫描为该客户建了 ${first.length} 条预警（应为 1 条），` +
          `created_count=${scan1.created_count} created 总数=${scan1.created.length}`
      );
    }
    const target = first[0];
    const before = await apiCallRaw<AlertRow>(page, 'GET', `/finance-alerts/${target.id}`);

    // 同条件再扫一次：幂等窗口内不得再建，服务端台账计数与关键字段都必须守恒
    const scan2 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    expect(
      scan2.created.filter(a => isForCustomer(a, customer.id)).length,
      `501-01 二次扫描为该目标再建了预警单（created=${JSON.stringify(scan2.created)})`
    ).toBe(0);

    const after = await apiCallRaw<AlertRow>(page, 'GET', `/finance-alerts/${target.id}`);
    expect(after.status, '501-01 重复触发后状态不应被改写').toBe(before.status);
    expect(after.status, '501-01 新落库的预警应为未处理态').toBe('active');
    expect(after.alert_no, '501-01 单号不应被二次触发覆盖').toBe(before.alert_no);
    expect(after.notification_id, '501-01 主通知号不应被二次触发改动').toBe(before.notification_id);
    expect(after.title, '501-01 标题不应被二次触发改动').toBe(before.title);

    const ledger = await apiCall<AlertPage>(
      page,
      'GET',
      '/finance-alerts?alert_type=ar_overdue&target_module=customer&status=active&page=1&page_size=200'
    );
    const ledgerMine = requireItems(ledger.data, '501-01 /finance-alerts active 台账').filter(
      r => r.target_id === customer.id
    );
    expect(
      ledgerMine.length,
      `501-01 同客户未处理预警应恰为 1 条，实际 ${ledgerMine.length} 条：` +
        JSON.stringify(ledgerMine.map(r => ({ id: r.id, alert_no: r.alert_no })))
    ).toBe(1);

    // 终结腿：预警行无删除路由，只能 acknowledge + resolve；应收发票走在册的 cancel
    const ack = await apiCallRaw<AlertRow>(
      page,
      'POST',
      `/finance-alerts/${target.id}/acknowledge`,
      { remark: '501-01 已核实' }
    );
    expect(ack.status, '501-01 确认后状态应为 acknowledged').toBe('acknowledged');
    const res = await apiCallRaw<AlertRow>(page, 'POST', `/finance-alerts/${target.id}/resolve`, {
      resolve_note: '501-01 用例回收',
    });
    expect(res.status, '501-01 解决后状态应为 resolved').toBe('resolved');
    await apiCall(page, 'POST', `/ar/invoices/${invoice.id}/cancel`, { reason: '501 用例回收' });

    const resolvedLedger = await apiCall<AlertPage>(
      page,
      'GET',
      '/finance-alerts?alert_type=ar_overdue&target_module=customer&status=active&page=1&page_size=200'
    );
    expect(
      requireItems(resolvedLedger.data, '501-01 终结后 active 台账').some(r => r.id === target.id),
      '501-01 已 resolved 的条不应残留 active 集合'
    ).toBe(false);

    await apiCall(page, 'DELETE', `/aging-alert-rules/${rule.id}`);
    const ruleGone = await apiCallExpectFail(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleGone.status, `501-01 规则回收后应 404，实际 ${ruleGone.status}`).toBe(404);

    console.log(
      `501-01 幂等守恒通过：预警 id=${target.id} 单号=${target.alert_no} ` +
        `主通知=${target.notification_id} scan1.created_count=${scan1.created_count} ` +
        `scan2.created_count=${scan2.created_count}`
    );
  });

  test('501-02 账期预警只投给启用规则声明的岗位且不重复投递', async ({ page }) => {
    test.setTimeout(300_000);
    const tag = uniq();

    const rule = await apiCallRaw<AlertRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-501-ROLE-${tag}`,
      rule_code: `e2e501role${tag}`.slice(0, 40),
      aging_bucket: '30_days',
      threshold_days: 15,
      alert_level: 'info',
      notify_method: 'system',
      notify_roles: [NOTIFY_ROLE],
      is_active: true,
      remarks: `501-02 收件岗位前置 ${tag}`,
    });
    deferCleanup(cleanup, 'DELETE', `/aging-alert-rules/${rule.id}`, `501-02 rule-${tag}`);

    // 反向判据的前提要先实证：并集里含非收件岗位时，"收不到"就不再是判据
    const rulesPage = await apiCall<RulePage>(
      page,
      'GET',
      '/aging-alert-rules?page=0&page_size=200'
    );
    const allRules = requireItems(rulesPage.data, '501-02 /aging-alert-rules');
    const totalRules = rulesPage.data.total;
    if (typeof totalRules !== 'number') {
      throw new Error(`501-02 前置不成立：规则列表缺 total 键，实际 ${String(totalRules)}`);
    }
    if (allRules.length < totalRules) {
      throw new Error(
        `501-02 前置不成立：规则列表只带回 ${allRules.length}/${totalRules} 行，并集无法闭合`
      );
    }
    const union = new Set(allRules.filter(r => r.is_active).flatMap(r => r.notify_roles ?? []));
    if (union.has(NON_RECIPIENT_ROLE)) {
      throw new Error(
        `501-02 前置不成立：启用规则并集已含 ${NON_RECIPIENT_ROLE}（并集=${[...union].join(',')}），` +
          '该岗位不再是"不该收到"的判据，需另选岗位码'
      );
    }

    const custs = await apiCall<{ items?: CustRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const custRows = requireItems(custs.data, '501-02 /crm/customers');
    if (custRows.length === 0) {
      throw new Error('501-02 前置不成立：/crm/customers 返回 0 行，无法构造逾期事实');
    }
    const customer = custRows[0];
    const invoice = await apiCallRaw<{ id: number }>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      customer_name: `${customer.customer_name}-501rcv${tag}`,
      invoice_amount: 7234.56,
      invoice_date: pastDate(70),
      due_date: pastDate(50),
    });
    await apiCallRaw(page, 'POST', `/ar/invoices/${invoice.id}/approve`);

    const scan1 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const mine = scan1.created.filter(a => isForCustomer(a, customer.id));
    if (mine.length !== 1) {
      throw new Error(
        `501-02 前置不成立：首次扫描为该客户建了 ${mine.length} 条预警（应为 1 条），` +
          `created_count=${scan1.created_count}`
      );
    }
    const alert = mine[0];
    const notifTitle = `${FINANCE_ALERT_TITLE_PREFIX}${alert.title}`;

    // 触发者本人的会话：手工触发不得把投递降级给点击者
    const triggerInbox = await readInbox(page);
    expect(
      countTitle(triggerInbox, notifTitle, '501-02 触发者收件箱'),
      `501-02 触发者岗位不在启用规则角色集内，不应收到预警 id=${alert.id} 的站内信`
    ).toBe(0);

    // 声明岗位的正向投递；重复触发后同一标题命中数仍为 1
    await loginAsRole(page, NOTIFY_ROLE);
    const inbox1 = await readInbox(page);
    const hit1 = inbox1.find(n => n.title === notifTitle);
    expect(
      hit1,
      `501-02 岗位 ${NOTIFY_ROLE} 的未读列表应含预警 id=${alert.id} 的站内信，实际 ${inbox1.length} 行`
    ).toBeTruthy();
    expect(countTitle(inbox1, notifTitle, '501-02 首次投递'), '501-02 首次触发应恰投递一条').toBe(
      1
    );
    expect(hit1!.content, '501-02 通知正文应逐字等于预警正文').toBe(alert.content);

    const scan2 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    expect(
      scan2.created.filter(a => isForCustomer(a, customer.id)).length,
      '501-02 二次触发不应为该客户再建预警'
    ).toBe(0);

    await loginAsRole(page, NOTIFY_ROLE);
    const inbox2 = await readInbox(page);
    expect(
      countTitle(inbox2, notifTitle, '501-02 重复触发后'),
      `501-02 重复触发后该标题的投递条数应守恒为 1，实际 ${countTitle(
        inbox2,
        notifTitle,
        '501-02 重复触发后守恒'
      )} 条`
    ).toBe(1);

    await loginAsRole(page, NON_RECIPIENT_ROLE);
    const otherInbox = await readInbox(page);
    expect(
      countTitle(otherInbox, notifTitle, '501-02 非声明岗位收件箱'),
      `501-02 ${NON_RECIPIENT_ROLE} 不在任何启用规则的角色集内，不应收到预警 id=${alert.id}`
    ).toBe(0);

    // 站内信删除权只属收件人（services/notification_service.rs::delete_notification 逐条比 user_id），
    // 故回收要回到收件岗位会话里当场执行，不进跨会话的延迟队列。
    await loginAsRole(page, NOTIFY_ROLE);
    const inboxForClean = await readInbox(page);
    for (const row of inboxForClean.filter(n => n.title === notifTitle)) {
      await apiCall(page, 'DELETE', `/notifications/${row.id}`);
    }

    await apiCall(page, 'POST', `/ar/invoices/${invoice.id}/cancel`, { reason: '501 用例回收' });
    await apiCall(page, 'DELETE', `/aging-alert-rules/${rule.id}`);
    const ruleGone = await apiCallExpectFail(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleGone.status, `501-02 规则回收后应 404，实际 ${ruleGone.status}`).toBe(404);

    console.log(
      `501-02 推送对象通过：预警 id=${alert.id} 角色集并集=${[...union].join(',')} ` +
        `命中岗位=${NOTIFY_ROLE} 反向岗位=${NON_RECIPIENT_ROLE}`
    );
  });

  test('501-03 审批超时提醒不降级给触发者且重复发送不改动集合', async ({ page }) => {
    test.setTimeout(300_000);

    await ensureTestEntities(page);
    const ctx = getCtx();
    if (
      typeof ctx.salesOrderId !== 'number' ||
      typeof ctx.dyeBatchId !== 'number' ||
      typeof ctx.customerId !== 'number'
    ) {
      throw new Error(
        `501-03 前置不成立：批色单父数据缺失 salesOrderId=${String(ctx.salesOrderId)} ` +
          `dyeBatchId=${String(ctx.dyeBatchId)} customerId=${String(ctx.customerId)}`
      );
    }

    const host = await apiCallRaw<BcaRow>(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: ctx.salesOrderId,
      dye_batch_id: ctx.dyeBatchId,
      customer_id: ctx.customerId,
      color_no: `BC503${uniq()}`.slice(0, 20),
      dye_lot_no: ctx.dyeLotNo ?? `LOT503${uniq()}`.slice(0, 20),
      batch_no: `B503${uniq()}`.slice(0, 20),
      remark: '501-03 提醒幂等前置',
    });
    const id = host.id;
    expect(
      Number.isInteger(id) && id > 0,
      `501-03 建批色单应回主键，实际 ${JSON.stringify(host)}`
    ).toBe(true);
    deferCleanup(cleanup, 'DELETE', `/bulk-color-approvals/${id}`, `501-03 bca-${id}`);

    // threshold_hours=0 时谓词退化为 created_at < now，本用例刚建的单必然入集；
    // 集合本身即"待提醒"的写入方判据，不在用例里重写状态字面量。
    const pending = await apiCall<BcaPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=0'
    );
    const pendingRows = requireItems(pending.data, '501-03 /reminders/pending');
    const mine = pendingRows.find(r => r.id === id);
    if (!mine) {
      throw new Error(
        `501-03 前置不成立：新建批色单 id=${id} 未进入待提醒集合（带回 ${pendingRows.length} 行，` +
          `total=${String(pending.data.total)}）`
      );
    }
    expect(
      mine.approver_id,
      `501-03 建档腿不应写入审批人，实际 approver_id=${String(mine.approver_id)}；` +
        '非空说明提醒收件人已不再是 approver_id 兜底路径，本用例的反向判据需重取'
    ).toBeNull();

    const send1 = await apiCallRaw<number>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-pending?threshold_hours=0'
    );
    const send2 = await apiCallRaw<number>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-pending?threshold_hours=0'
    );
    if (typeof send1 !== 'number' || typeof send2 !== 'number') {
      throw new Error(
        `501-03 send-pending 出参应为投递条数，实际 send1=${JSON.stringify(send1)} send2=${JSON.stringify(send2)}`
      );
    }

    // 提醒对象是各单的 approver 而非点击者：approver_id 为空时投递落到写死的收件人，
    // 触发者会话必须读不到本单的提醒标题（标题由写入方拼成 `批色待剪样超时提醒 #{id}`）。
    const reminderTitle = `批色待剪样超时提醒 #${id}`;
    const triggerInbox = await readInbox(page);
    expect(
      countTitle(triggerInbox, reminderTitle, '501-03 触发者收件箱'),
      `501-03 触发者两次发起提醒后仍不应收到本单提醒（send1=${send1} send2=${send2}）`
    ).toBe(0);

    // 提醒只投递、不改态、不生成单据：两次发送后本单仍在待提醒集合且状态与提醒前一致
    const pendingAfter = await apiCall<BcaPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=0'
    );
    const mineAfter = requireItems(pendingAfter.data, '501-03 二次提醒后待提醒集合').find(
      r => r.id === id
    );
    expect(mineAfter, `501-03 单 id=${id} 不应因提醒被移出待提醒集合`).toBeTruthy();
    expect(mineAfter!.approval_status, '501-03 提醒不应改动审批态').toBe(mine.approval_status);

    const bcaAfter = await apiCallRaw<BcaRow>(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(bcaAfter.approval_status, '501-03 详情态应与列表一致').toBe(mine.approval_status);
    expect(bcaAfter.approver_id, '501-03 提醒不应回填审批人').toBeNull();

    await apiCall(page, 'DELETE', `/bulk-color-approvals/${id}`);
    const gone = await apiCallExpectFail(page, 'GET', `/bulk-color-approvals/${id}`);
    expect(gone.status, `501-03 批色单回收后应 404，实际 ${gone.status}`).toBe(404);

    console.log(
      `501-03 提醒面取证：单 id=${id} 审批态=${mine.approval_status} approver_id=${String(
        mine.approver_id
      )} send1=${send1} send2=${send2}（收件人为写死的兜底用户，正向投递无法从 HTTP 证明）`
    );
  });

  test('501-04 库存预警派生词表正确且重复读取不新增站内信', async ({ page }) => {
    test.setTimeout(240_000);

    const alerts1 = await apiCall<{ items?: StockAlertRow[]; total?: number }>(
      page,
      'GET',
      '/inventory/stock/alerts?page=1&page_size=50'
    );
    const rows1 = requireItems(alerts1.data, '501-04 /inventory/stock/alerts');
    const total1 = alerts1.data.total;
    if (typeof total1 !== 'number') {
      throw new Error(`501-04 前置不成立：告警列表缺 total 键，实际 ${String(total1)}`);
    }
    // 派生集合是 worker 的输入面：逐行核对 alert_type 落在写入方词表内，不认识的 token 即点名
    for (const row of rows1) {
      expect(
        STOCK_ALERT_TYPES.includes(row.alert_type as (typeof STOCK_ALERT_TYPES)[number]),
        `501-04 告警行 product_id=${row.product_id} 的 alert_type="${row.alert_type}" 不在写入方词表内`
      ).toBe(true);
      expect(row.alert_type, '501-04 告警列表不应带回无告警值 normal').not.toBe('normal');
    }
    if (rows1.length === 0) {
      console.log('[501-04] 本轮告警派生集合为空（total=0），词表核对退化为读侧守恒');
    }

    // 触发面：GET /inventory/stock 每页都会走 send_inventory_alerts；连续两次读取即两次触发
    const inboxBefore = await readInbox(page);
    const stock1 = await apiCallRaw<{ items?: unknown[]; total?: number }>(
      page,
      'GET',
      '/inventory/stock?page=1&page_size=20'
    );
    const alerts2 = await apiCall<{ items?: StockAlertRow[]; total?: number }>(
      page,
      'GET',
      '/inventory/stock/alerts?page=1&page_size=50'
    );
    const rows2 = requireItems(alerts2.data, '501-04 二次 /inventory/stock/alerts');
    expect(
      rows2.map(r => r.id),
      '501-04 重复读取的告警行集合应守恒（纯派生读侧不应改变库存台账）'
    ).toEqual(rows1.map(r => r.id));
    expect(alerts2.data.total, '501-04 重复读取的告警总数应守恒').toBe(total1);

    const inboxAfter = await readInbox(page);
    const before = countTitle(inboxBefore, '库存预警', '501-04 触发前收件箱');
    const after = countTitle(inboxAfter, '库存预警', '501-04 两次触发后收件箱');
    expect(after, `501-04 两次触发之间本会话的库存预警站内信应守恒，实际 ${before}→${after}`).toBe(
      before
    );

    const warehouseInbox = await loginAsRole(page, 'warehouse_manager').then(() => readInbox(page));
    expect(
      countTitle(warehouseInbox, '库存预警', '501-04 仓库管理员收件箱'),
      '501-04 HTTP 触发腿的收件人被写成常量 0，仓库管理员会话不应读到任何库存预警站内信'
    ).toBe(0);

    console.log(
      `501-04 取证：告警行数 ${rows1.length}/${total1}→${rows2.length}/${alerts2.data.total} ` +
        `库存列表带回 ${stock1?.items?.length ?? 0} 行；worker 侧 6 小时周期与角色集投递在 HTTP 无触发入口`
    );
  });
});
