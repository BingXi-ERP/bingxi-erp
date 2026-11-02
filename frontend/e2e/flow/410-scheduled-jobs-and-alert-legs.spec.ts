import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginViaUI,
} from './helpers';

/**
 * 410 定时任务与后台作业的可断腿（库存缺料预警、账期与账龄预警、批色审批超时提醒）
 *
 * 功能：补任务清单第 4.6 段。三条业务都有一条后台作业（定时扫描、阈值定级、超时提醒与
 * 自动处理），本规格只断 HTTP 侧真实存在且语义可判的部分，即阈值配置的读写、扫描触发的
 * 幂等、预警记录与提醒记录的列表回读、超时阈值是否真正进入取数条件、取值域与状态机拒绝。
 * 端点存在性以 backend 路由挂载与 frontend 端点快照为唯二依据，快照里没有的路径一律不写。
 *
 * 调用方：三族 handler 各自的路由注册点。
 * material_shortage_handler 的 get_threshold_config 与 save_threshold_config 与
 * check_material_shortage 与 list_shortage_alerts 与 update_shortage_status，
 * aging_alert_rule_handler 的 create_rule 与 list_rules 与 get_rule 与 update_rule 与
 * delete_rule，finance_alert_handler 的 trigger_scan 与 create_alert 与 list_alerts 与
 * acknowledge 与 resolve，bulk_color_approval_handler 的 list_pending_reminders 与
 * get_pending_reminders 与 list_customer_followups 与 send_pending_reminders 与
 * check_approval_timeouts，notification_handler 的 list_notifications 与 get_unread_count。
 * 前端入口为 material-shortage 页、finance 预警页、bulk-color-approvals 页与通知中心，
 * 本规格走 API 通道直断契约，不经界面，避免与既有遍历规格的选择器棘轮相互干扰。
 *
 * 入参与出参口径：查询分页键为 page 与 page_size。缺料阈值三键与账龄规则的 threshold_amount
 * 以及缺料数量都是 Decimal，本仓未开 serde-float，因此出参是字符串而不是数字。
 * 缺料预警列表出参键取 ShortageAlertView 的字段名，分页外层键取 PaginatedResponse 的四键。
 * 通知列表外层键是 list 而不是 items，这一条是 list_notifications 的真实形状，不按其改写。
 * 批色待提醒列表用 BulkColorApprovalPagedResponse，其 page 恒为 1、page_size 为 total 与 1
 * 的较大值，属该端点自述形状，按形状本身断，不按通用分页契约强扭。
 *
 * 状态词表按写入方逐字符取。缺料预警状态为 identified 与 purchase_request 与 purchase_order
 * 与 received 与 resolved 五个小写值，缺料级别为 Critical 与 Severe 与 Warning 与 Normal
 * 四个首字母大写的值。财务预警类型是 ar_overdue 与 inventory_backlog 与 cash_flow_shortage
 * 与 budget_overrun，级别是 info 与 warning 与 critical，状态是 active 与 acknowledged 与
 * resolved 与 expired，级别到通知优先级的映射与状态流转门都在 finance_alert_service。
 * 批色审批状态是小写 pending 与 sampled 与 sent_to_customer 与 approved 与 rejected 等值。
 *
 * 失败信封只有一种形状，机器码为字符串，且必带 trace_id 与 timestamp，本规格的负例逐条
 * 钉到具体机器码，不出现只判状态码小于 500 的断言。
 *
 * 存什么与存哪里：阈值三键存 material_shortage_threshold_configs 的单行（主键取单行常量），
 * 缺料预警行存 material_shortage_alerts，账龄规则整行存 aging_alert_rules（rule_code 无唯一
 * 约束，故不断重复编码拒绝），财务预警存 finance_alerts 并把 alert_no 按 FA 前缀加日期加
 * 四位流水生成，通知存 notifications 并由 attach_notification 把通知主键回填到预警行的
 * notification_id，批色提醒只写 notifications 而不改批色行状态。
 *
 * 无端点可断的部分见交付说明，不为凑 coverage 编造断言。
 */

/** material_shortage_threshold_configs 单行的三个阈值键，Decimal 出参为字符串 */
type ThresholdConfig = {
  safety_factor: string;
  critical_threshold: string;
  severe_threshold: string;
};

/** detect_shortages 的汇总出参，shortage_count 恒等于三级计数之和 */
type ShortageSummary = {
  total_materials_checked: number;
  shortage_count: number;
  critical_count: number;
  severe_count: number;
  warning_count: number;
  affected_orders_count: number;
  items: Array<{
    material_id: number;
    material_name: string;
    shortage_quantity: string;
    level: string;
  }>;
};

/** list_shortage_alerts 的分页出参，键名取 ShortageAlertView */
type ShortageAlertPage = {
  items: Array<{
    material_id: number;
    alert_id: number | null;
    material_code: string;
    shortage_quantity: string;
    level: string;
    status: string | null;
  }>;
  total: number;
  page: number;
  page_size: number;
};

/** aging_alert_rules 整行，threshold_amount 为 Decimal 串、可空 */
type AgingRule = {
  id: number;
  rule_name: string;
  rule_code: string;
  aging_bucket: string;
  threshold_days: number;
  threshold_amount: string | null;
  alert_level: string;
  notify_method: string;
  notify_roles: string[] | null;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

/** finance_alert_handler 的 AlertInfo，threshold_value 与 actual_value 为 Decimal 串 */
type FinanceAlert = {
  id: number;
  alert_no: string;
  alert_type: string;
  alert_level: string;
  title: string;
  content: string;
  target_module: string | null;
  target_id: number | null;
  status: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  resolved_at: string | null;
  resolved_by: number | null;
  resolve_note: string | null;
  notification_id: number | null;
};

type TriggerScanResult = {
  created: FinanceAlert[];
  created_count: number;
};

/** list_notifications 的外层键是 list，形状按 handler 的 json 宏字面量 */
type NotificationListPage = {
  list: Array<{
    id: number;
    user_id: number;
    notification_type: string;
    title: string;
    status: string;
    business_type: string | null;
    business_id: number | null;
  }>;
  total: number;
  page: number;
  page_size: number;
};

/** BulkColorApprovalInfo 中被本规格取用的键，approval_status 是小写词表值 */
type BulkColorApprovalInfo = {
  id: number;
  approval_status: string;
  created_at: string;
  sent_to_customer_at: string | null;
  delivery_blocking: boolean;
};

type ReminderPage = {
  items: BulkColorApprovalInfo[];
  total: number;
  page: number;
  page_size: number;
};

/** send_pending_reminders 的出参，threshold_hours 原样回显请求参数 */
type ReminderSendResult = {
  sent_count: number;
  threshold_hours: number;
};

const SHORTAGE_LEVELS = ['Critical', 'Severe', 'Warning', 'Normal'];
const SHORTAGE_STATUSES = [
  'identified',
  'purchase_request',
  'purchase_order',
  'received',
  'resolved',
];
const FINANCE_ALERT_TYPES = [
  'ar_overdue',
  'inventory_backlog',
  'cash_flow_shortage',
  'budget_overrun',
];
const FINANCE_ALERT_STATUSES = ['active', 'acknowledged', 'resolved', 'expired'];
const BCA_PENDING_STATUS = 'pending';

function uniqTag(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

test.describe.serial('410 定时任务与后台作业的可断腿', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  // ======================================================================
  // 库存缺料预警腿
  // ======================================================================

  test('缺料阈值单行读出三键且都是 Decimal 串', async ({ page }) => {
    const config = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');

    expect(typeof config.safety_factor, 'safety_factor 必须是 Decimal 串').toBe('string');
    expect(typeof config.critical_threshold, 'critical_threshold 必须是 Decimal 串').toBe('string');
    expect(typeof config.severe_threshold, 'severe_threshold 必须是 Decimal 串').toBe('string');
    for (const key of ['safety_factor', 'critical_threshold', 'severe_threshold'] as const) {
      expect(
        Number.isFinite(Number(config[key])),
        `${key} 的落库值应可解析为有限小数，实际为 ${config[key]}`
      ).toBe(true);
    }
  });

  test('缺料阈值写入后逐键读回并按原值恢复单行', async ({ page }) => {
    const original = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');

    const probe: ThresholdConfig = {
      safety_factor: '1.25',
      critical_threshold: '88.50',
      severe_threshold: '33.20',
    };
    const saved = await apiCallRaw<ThresholdConfig>(page, 'POST', '/material-shortage/threshold', {
      safety_factor: probe.safety_factor,
      critical_threshold: probe.critical_threshold,
      severe_threshold: probe.severe_threshold,
    });
    expect(saved.safety_factor, '保存接口应回显写入的 safety_factor').toBe(probe.safety_factor);
    expect(saved.critical_threshold, '保存接口应回显写入的 critical_threshold').toBe(
      probe.critical_threshold
    );

    const readBack = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    expect(
      [readBack.safety_factor, readBack.critical_threshold, readBack.severe_threshold],
      '三个阈值键必须从 material_shortage_threshold_configs 单行读回写入值'
    ).toEqual([probe.safety_factor, probe.critical_threshold, probe.severe_threshold]);

    await apiCall(page, 'POST', '/material-shortage/threshold', original);
    const restored = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    expect(
      [restored.safety_factor, restored.critical_threshold, restored.severe_threshold],
      '恢复写入必须把单行还原到本用例开始前的值'
    ).toEqual([original.safety_factor, original.critical_threshold, original.severe_threshold]);
  });

  test('缺料检查按请求内阈值定级且汇总恒等式成立', async ({ page }) => {
    const extreme = await apiCallRaw<ShortageSummary>(page, 'POST', '/material-shortage/check', {
      threshold: { safety_factor: '1', critical_threshold: '999999', severe_threshold: '999999' },
    });

    expect(
      extreme.shortage_count,
      'shortage_count 必须等于三级计数之和，源码口径就是三者相加'
    ).toBe(extreme.critical_count + extreme.severe_count + extreme.warning_count);
    expect(
      extreme.warning_count,
      `缺口率大于零且不高于极端阈值时全部落 Warning，critical ${extreme.critical_count} severe ${extreme.severe_count} warning ${extreme.warning_count}`
    ).toBe(extreme.shortage_count);
    expect(extreme.critical_count, '极端阈值下不应有紧急级').toBe(0);
    expect(extreme.severe_count, '极端阈值下不应有严重级').toBe(0);
    expect(
      extreme.items.length >= extreme.shortage_count,
      '明细条数不应少于缺料条数，明细允许包含正常级'
    ).toBe(true);
    for (const item of extreme.items) {
      expect(SHORTAGE_LEVELS, `级别必须是 ShortageLevel 词表值，实际 ${item.level}`).toContain(
        item.level
      );
    }

    const defaults = await apiCallRaw<ShortageSummary>(page, 'POST', '/material-shortage/check', {
      threshold: { safety_factor: '1', critical_threshold: '100', severe_threshold: '50' },
    });
    expect(
      defaults.shortage_count,
      '用回默认阈值复检后汇总恒等式仍须成立'
    ).toBe(defaults.critical_count + defaults.severe_count + defaults.warning_count);
    expect(
      defaults.total_materials_checked >= defaults.shortage_count,
      '被检物料数不应少于缺料数'
    ).toBe(true);
  });

  test('缺料预警列表分页与取值域及状态机拒绝', async ({ page }) => {
    const list = await apiCallRaw<ShortageAlertPage>(
      page,
      'GET',
      '/material-shortage/alerts?page=1&page_size=5'
    );

    expect(list.page, 'page 必须回显请求页码').toBe(1);
    expect(list.page_size, 'page_size 必须回显请求页大小').toBe(5);
    expect(
      list.items.length <= list.page_size,
      `首页明细数不得超过页大小，实际 ${list.items.length} 对 ${list.page_size}`
    ).toBe(true);
    for (const item of list.items) {
      expect(SHORTAGE_LEVELS, `列表级别必须在词表内，实际 ${item.level}`).toContain(item.level);
      if (item.status !== null) {
        expect(
          SHORTAGE_STATUSES,
          `列表状态必须在 shortage_alert_status 词表内，实际 ${String(item.status)}`
        ).toContain(String(item.status));
      }
      expect(
        typeof item.shortage_quantity,
        '缺口数量是 Decimal，出参必须是字符串而不是数字'
      ).toBe('string');
    }

    const badStatus = await apiCallExpectFail(
      page,
      'PUT',
      '/material-shortage/999999999/status',
      { status: 'not_a_status' }
    );
    expect(
      failureCode(badStatus),
      `词表外状态必须被取值域校验拒绝，失败体 ${JSON.stringify(badStatus)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(badStatus.trace_id, '失败信封必须带 trace_id').toBeTruthy();
    expect(badStatus.timestamp, '失败信封必须带 timestamp').toBeTruthy();

    const badLevel = await apiCallExpectFail(
      page,
      'GET',
      '/material-shortage/alerts?level=NotALevel'
    );
    expect(
      failureCode(badLevel),
      `越界级别必须报校验失败而不是静默空列表，失败体 ${JSON.stringify(badLevel)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    const legalStatus = await apiCallRaw<ShortageAlertPage>(
      page,
      'GET',
      '/material-shortage/alerts?status=RESOLVED&page_size=5'
    );
    for (const item of legalStatus.items) {
      expect(
        item.status,
        `大小写不敏感归一后只能返回规范落库值，实际 ${String(item.status)}`
      ).toBe('resolved');
    }
  });

  // ======================================================================
  // 账期与账龄预警腿
  // ======================================================================

  const createdRuleIds: number[] = [];

  test.afterEach(async ({ page }) => {
    while (createdRuleIds.length > 0) {
      const id = createdRuleIds.shift();
      if (id === undefined) {
        break;
      }
      await apiCall(page, 'DELETE', '/aging-alert-rules/' + id).catch((e: Error) => {
        console.warn(`[410] 账龄规则 ${id} 清理失败: ${e.message}`);
      });
    }
  });

  test('账龄预警规则整行写读与三态清空与删除后不可见', async ({ page }) => {
    const tag = uniqTag();
    const created = await apiCallRaw<AgingRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `410 账期预警规则 ${tag}`,
      rule_code: `AGING410_${tag}`,
      aging_bucket: '90_days',
      threshold_days: 90,
      threshold_amount: '1500.50',
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: ['purchaser', 'planner'],
      is_active: true,
      remarks: `probe ${tag}`,
    });
    createdRuleIds.push(created.id);

    expect(created.rule_code, `创建应回显 rule_code，实际 ${created.rule_code}`).toBe(
      `AGING410_${tag}`
    );
    expect(created.threshold_days, 'threshold_days 应落 90').toBe(90);
    expect(created.threshold_amount, 'threshold_amount 是 Decimal 串').toBe('1500.50');
    expect(created.notify_roles, 'notify_roles 必须按 JSONB 数组存回，不能是 PG 数组崩溃').toEqual([
      'purchaser',
      'planner',
    ]);
    expect(created.is_active, '显式提交 true 应读回 true').toBe(true);

    const detail = await apiCallRaw<AgingRule>(page, 'GET', '/aging-alert-rules/' + created.id);
    expect(detail.aging_bucket, '详情应与创建行的账龄区间一致').toBe('90_days');
    expect(detail.alert_level, '详情应与创建行的预警级别一致').toBe('warning');
    expect(detail.remarks, '详情应与创建行的备注一致').toBe(`probe ${tag}`);

    await apiCall(page, 'PUT', '/aging-alert-rules/' + created.id, {
      threshold_days: 120,
      remarks: null,
      is_active: false,
    });
    const updated = await apiCallRaw<AgingRule>(page, 'GET', '/aging-alert-rules/' + created.id);
    expect(updated.threshold_days, '阈值天数应被覆盖为 120').toBe(120);
    expect(updated.remarks, '显式 null 应清空为 NULL 而不是保持原值').toBeNull();
    expect(updated.is_active, '启用位应被覆盖为 false').toBe(false);
    expect(updated.rule_code, '未提交的 rule_code 必须保持原值').toBe(`AGING410_${tag}`);

    const listed = await apiCallRaw<{ items: AgingRule[]; total: number }>(
      page,
      'GET',
      '/aging-alert-rules?aging_bucket=90_days&alert_level=warning&page=0&page_size=100'
    );
    const hit = listed.items.filter(r => r.id === created.id);
    expect(hit.length, `按区间与级别筛选后必须仍能命中本行，列表共 ${listed.items.length} 行`).toBe(
      1
    );
    expect(hit[0].threshold_days, '列表出参须反映更新后的阈值天数').toBe(120);

    await apiCall(page, 'DELETE', '/aging-alert-rules/' + created.id);
    const gone = await apiCallExpectFail(page, 'GET', '/aging-alert-rules/' + created.id);
    expect(failureCode(gone), '删除后详情通道必须报未找到').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(gone.trace_id, '未找到也必须走统一失败信封并带 trace_id').toBeTruthy();
  });

  test('账龄规则未找到与财务预警非法取值被拒绝', async ({ page }) => {
    const missing = await apiCallExpectFail(page, 'GET', '/aging-alert-rules/999999999');
    expect(failureCode(missing), '不存在的规则 id 必须报未找到').toBe(APP_ERROR_CODES.NOT_FOUND);

    const badType = await apiCallExpectFail(page, 'POST', '/finance-alerts', {
      alert_type: 'not_a_type',
      alert_level: 'warning',
      title: '410 非法类型探针',
      content: '探针内容',
    });
    expect(
      failureCode(badType),
      `非法 alert_type 必须报校验失败，失败体 ${JSON.stringify(badType)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    const badLevel = await apiCallExpectFail(page, 'POST', '/finance-alerts', {
      alert_type: 'ar_overdue',
      alert_level: 'NOT_A_LEVEL',
      title: '410 非法级别探针',
      content: '探针内容',
    });
    expect(failureCode(badLevel), '级别大小写不同也不放行，必须按逐字符白名单拒绝').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );

    const badStatus = await apiCallExpectFail(page, 'GET', '/finance-alerts?status=not_a_status');
    expect(
      failureCode(badStatus),
      `列表越界状态必须拒绝而不是当成无数据，失败体 ${JSON.stringify(badStatus)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  });

  test('账期逾期扫描触发幂等且推送腿通知可回读', async ({ page }) => {
    const unreadBefore = await apiCallRaw<number>(page, 'GET', '/notifications/unread-count');

    const first = await apiCallRaw<TriggerScanResult>(
      page,
      'POST',
      '/finance-alerts/trigger-scan',
      { alert_type: 'ar_overdue' }
    );
    expect(first.created.length, 'created_count 必须等于实际写入行数').toBe(first.created_count);
    for (const alert of first.created) {
      expect(alert.alert_type, '按类型过滤扫描出的行必须是该类型').toBe('ar_overdue');
      expect(alert.status, '新生成的预警必须落在 active').toBe('active');
      expect(
        /^FA-\d{8}\d{4}$/.test(alert.alert_no),
        `预警单号必须是 FA 前缀加日期加四位流水，实际 ${alert.alert_no}`
      ).toBe(true);
      expect(
        FINANCE_ALERT_TYPES,
        `类型必须在 AlertType 词表内，实际 ${alert.alert_type}`
      ).toContain(alert.alert_type);
      expect(
        alert.notification_id,
        `触发人有值时通知必须生成并回填 id，实际行 ${alert.alert_no} 的 notification_id 为 ${String(alert.notification_id)}`
      ).not.toBeNull();
    }

    const second = await apiCallRaw<TriggerScanResult>(
      page,
      'POST',
      '/finance-alerts/trigger-scan',
      { alert_type: 'ar_overdue' }
    );
    expect(
      second.created_count,
      `同类型同目标的 active 或 acknowledged 行已存在时必须整批跳过，第二次却新增 ${second.created_count} 行`
    ).toBe(0);

    const unreadAfter = await apiCallRaw<number>(page, 'GET', '/notifications/unread-count');
    expect(
      unreadAfter - unreadBefore,
      `通知未读数增量必须等于本次生成的预警行数 ${first.created.length}`
    ).toBe(first.created.length);

    const inbox = await apiCallRaw<NotificationListPage>(
      page,
      'GET',
      '/notifications?notification_type=SYSTEM&status=UNREAD&page=1&page_size=100'
    );
    for (const alert of first.created) {
      const matched = inbox.list.filter(
        n => n.business_type === 'finance_alert' && n.business_id === alert.id
      );
      expect(
        matched.length,
        `预警 ${alert.alert_no} 必须在通知列表按 business_type 与 business_id 回读到，收件箱共 ${inbox.list.length} 行`
      ).toBe(1);
      expect(matched[0].id, '列表回读到的通知主键必须与预警行回填的 id 相同').toBe(
        alert.notification_id
      );
      expect(matched[0].notification_type, '财务预警通知必须落 SYSTEM 类型').toBe('SYSTEM');
      expect(matched[0].status, '新通知必须落 UNREAD').toBe('UNREAD');
    }
  });

  test('财务预警确认与解决的状态机门', async ({ page }) => {
    const tag = uniqTag();
    const created = await apiCallRaw<FinanceAlert>(page, 'POST', '/finance-alerts', {
      alert_type: 'ar_overdue',
      alert_level: 'critical',
      title: `410 账期预警探针 ${tag}`,
      content: `探针内容 ${tag}`,
      target_module: 'ar_invoice',
      target_id: 9410,
      threshold_value: '30',
      actual_value: '95',
      value_unit: 'days',
    });
    expect(created.status, '手动创建的预警必须落 active').toBe('active');
    expect(created.alert_level, '级别必须原样落 critical').toBe('critical');
    expect(
      created.notification_id,
      '手动创建通道不生成通知，notification_id 必须是 null'
    ).toBeNull();

    const resolveFirst = await apiCallExpectFail(
      page,
      'POST',
      `/finance-alerts/${created.id}/resolve`,
      { resolve_note: '越级解决探针' }
    );
    expect(
      failureCode(resolveFirst),
      `active 直接解决必须被状态机拒绝，失败体 ${JSON.stringify(resolveFirst)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const acknowledged = await apiCallRaw<FinanceAlert>(
      page,
      'POST',
      `/finance-alerts/${created.id}/acknowledge`,
      { remark: `410 确认留痕 ${tag}` }
    );
    expect(acknowledged.status, '确认后状态必须流转到 acknowledged').toBe('acknowledged');
    expect(acknowledged.acknowledged_at, '确认时间必须落库').toBeTruthy();
    expect(acknowledged.acknowledged_by, '确认人必须是当前登录用户 id').not.toBeNull();

    const acknowledgeAgain = await apiCallExpectFail(
      page,
      'POST',
      `/finance-alerts/${created.id}/acknowledge`,
      { remark: '重复确认探针' }
    );
    expect(
      failureCode(acknowledgeAgain),
      `重复确认必须报状态机拒绝，失败体 ${JSON.stringify(acknowledgeAgain)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const resolved = await apiCallRaw<FinanceAlert>(
      page,
      'POST',
      `/finance-alerts/${created.id}/resolve`,
      { resolve_note: `410 解决说明 ${tag}` }
    );
    expect(resolved.status, 'acknowledged 之后解决必须落 resolved').toBe('resolved');
    expect(resolved.resolve_note, '解决说明必须落库并读回').toBe(`410 解决说明 ${tag}`);
    expect(resolved.resolved_at, '解决时间必须落库').toBeTruthy();

    const resolveAgain = await apiCallExpectFail(
      page,
      'POST',
      `/finance-alerts/${created.id}/resolve`,
      { resolve_note: '重复解决探针' }
    );
    expect(
      failureCode(resolveAgain),
      `重复解决必须被状态机拒绝，失败体 ${JSON.stringify(resolveAgain)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const filtered = await apiCallRaw<{ items: FinanceAlert[] }>(
      page,
      'GET',
      '/finance-alerts?status=resolved&alert_type=ar_overdue&page=1&page_size=100'
    );
    const mine = filtered.items.filter(a => a.id === created.id);
    expect(mine.length, '已解决的探针行必须能在 resolved 过滤结果中回读').toBe(1);
    expect(mine[0].status, '过滤结果里的状态必须是过滤条件本身').toBe('resolved');
    for (const row of filtered.items) {
      expect(FINANCE_ALERT_STATUSES, `状态词表外不得出现在列表，实际 ${row.status}`).toContain(
        row.status
      );
    }
  });

  // ======================================================================
  // 批色审批超时提醒腿
  // ======================================================================

  test('批色待提醒列表的时间阈值真正进入取数条件', async ({ page }) => {
    const all = await apiCallRaw<ReminderPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=0'
    );
    expect(all.page, '该端点自述 page 恒为 1').toBe(1);
    expect(all.page_size, '该端点自述 page_size 为 total 与 1 的较大值').toBe(
      Math.max(all.total, 1)
    );
    expect(
      all.items.length,
      `total 必须等于 items 长度，实际 ${all.total} 对 ${all.items.length}`
    ).toBe(all.total);
    for (const row of all.items) {
      expect(
        row.approval_status,
        `待提醒列表只应包含 pending 记录，实际 ${row.approval_status}`
      ).toBe(BCA_PENDING_STATUS);
    }

    const hour = await apiCallRaw<ReminderPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=1'
    );
    expect(
      hour.total <= all.total,
      `阈值收紧到 1 小时后集合只能变小，实际 ${hour.total} 对 ${all.total}`
    ).toBe(true);

    const impossible = await apiCallRaw<ReminderPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=999999'
    );
    expect(
      impossible.total,
      '把阈值推到 999999 小时后必须查无记录，否则时间条件没起作用'
    ).toBe(0);
    expect(impossible.items).toEqual([]);

    const badThreshold = await apiCallExpectFail(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending?threshold_hours=abc'
    );
    expect(
      badThreshold.status,
      `非数字阈值必须被查询参数反序列化拒绝，失败体 ${JSON.stringify(badThreshold)}`
    ).toBe(400);

    const configurableEmpty = await apiCallRaw<BulkColorApprovalInfo[]>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/pending-configurable?reminder_days=999999&reject_days=999999'
    );
    expect(configurableEmpty, '可配置待提醒通道在极端提醒天数下必须返回空数组').toEqual([]);

    const followups = await apiCallRaw<ReminderPage>(
      page,
      'GET',
      '/bulk-color-approvals/reminders/followups?threshold_hours=999999'
    );
    expect(followups.total, '客户跟进超时列表在极端阈值下必须为空').toBe(0);
  });

  test('批色提醒发送的阈值回显与去重窗口幂等', async ({ page }) => {
    const emptySend = await apiCallRaw<ReminderSendResult>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-pending?threshold_hours=999999'
    );
    expect(emptySend.threshold_hours, 'threshold_hours 必须原样回显请求参数').toBe(999999);
    expect(emptySend.sent_count, '极端阈值下无待提醒记录，发送数必须为 0').toBe(0);

    const first = await apiCallRaw<ReminderSendResult>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-pending?threshold_hours=0'
    );
    expect(first.threshold_hours, '回显值必须是 0').toBe(0);
    expect(first.sent_count >= 0, '发送数不得为负').toBe(true);

    const second = await apiCallRaw<ReminderSendResult>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-pending?threshold_hours=0'
    );
    expect(
      second.sent_count,
      `同一小时的 dedup_key 落在 5 分钟窗口内，第二次一条都不该重复发出，第一次 ${first.sent_count} 第二条 ${second.sent_count}`
    ).toBe(0);

    const followups = await apiCallRaw<ReminderSendResult>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/send-followups?threshold_hours=999999'
    );
    expect(followups.sent_count, '跟进提醒在极端阈值下无目标记录').toBe(0);
    expect(followups.threshold_hours, '跟进提醒同样回显阈值参数').toBe(999999);
  });

  test('批色超时自动拒绝的阈值边界不放行任何记录', async ({ page }) => {
    const rejected = await apiCallRaw<BulkColorApprovalInfo[]>(
      page,
      'POST',
      '/bulk-color-approvals/reminders/check-timeouts?reminder_days=999999&reject_days=999999'
    );
    expect(
      rejected,
      'reject_days 推到 999999 天时不应有任何 sent_to_customer 记录被判超时，否则会误伤在册数据'
    ).toEqual([]);
  });
});
