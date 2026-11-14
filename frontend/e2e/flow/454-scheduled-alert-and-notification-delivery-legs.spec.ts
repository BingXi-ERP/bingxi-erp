import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  deferCleanup,
  flushDeferredCleanups,
  listNotifications,
  loginAsRole,
  loginViaUI,
  type DeferredCleanup,
} from './helpers';
import { safeGoto } from './ui-helpers';

/**
 * 454 定时预警与通知触达契约链（配置写入 → 立即执行 → 落库台账 → 收件人正确 → 防重复）
 *
 * e2e 不能等真实 cron 到点，本文件只走"配置写读 + 在册立即执行端点 + 读台账与站内信"这条可验证面。
 * 每个端点都先在 frontend/scripts/route-snapshot.txt 取到"方法 + 路径"才写进用例。
 *
 * 契约事实（以写入方源码为准，大小写逐字符照抄）：
 *
 * 1. 缺料预警阈值 handlers/material_shortage_handler.rs：
 *    POST /material-shortage/threshold 入参 safety_factor / critical_threshold / severe_threshold
 *    皆可选且只覆盖提交的键；GET 同名端点读回同一份配置；DECIMAL 出参是序列化字符串。
 *    存储口径为 migration/src/domain/v15/mod.rs 建表段的三列 DECIMAL(5,2)，
 *    库侧串就是事实值：断言按读回串逐字符比，期望值由该串按整数分推导，
 *    测试内既不再二次舍入，也不用浮点加法造值（浮点会造出列上根本不存在的 50.050000000000004）。
 *    GET /material-shortage/alerts 出参是 PaginatedResponse{items,total,page,page_size}。
 *
 * 2. 账期（账龄）预警规则 handlers/aging_alert_rule_handler.rs + models/aging_alert_rule.rs：
 *    POST 必填 rule_name / rule_code / aging_bucket / threshold_days / alert_level / notify_method，
 *    可选 notify_roles（JSONB 数组）、is_active、remarks。
 *    aging_bucket 取值 current/30_days/60_days/90_days/180_days/1_year/over_1_year；
 *    alert_level 取值 info/warning/critical；notify_method 取值 system/email/sms，
 *    本文件只用 system，不触发真实邮件与短信外发。
 *    PUT 是可空列三态：键缺席=保持原值、显式 null=清空为 NULL、有值=覆盖。
 *    GET 列表页码基数为 0（与其余 1 基列表不同，必须显式传 page=0）。
 *    DELETE /aging-alert-rules/{id} 在册，清理腿走它。
 *
 * 3. 审批超时提醒 handlers/bulk_color_approval_handler.rs：
 *    GET /bulk-color-approvals/reminders/pending-configurable 与
 *    POST /bulk-color-approvals/reminders/check-timeouts 都吃 TimeoutCheckQuery
 *    （reminder_days、reject_days），出参 data 为裸数组。提醒天数是门控值：
 *    reminder_days=0 收全部待确认、极大值应收敛到空集；reject_days 取极大值时不许自动拒任何单，
 *    据此同时验"配置生效"与"不误伤他人数据"。
 *
 * 4. 财务预警台账 services/finance_alert_service.rs + handlers/finance_alert_handler.rs：
 *    POST /finance-alerts/trigger-scan 入参 alert_type（可选，None=全 4 类），出参
 *    {created, created_count}；四类 token 为 ar_overdue / inventory_backlog / cash_flow_shortage /
 *    budget_overrun；状态词表为小写 active / acknowledged / resolved / expired，
 *    状态机 active → acknowledged → resolved / expired。
 *    幂等窗口只对未处理态生效：同 alert_type + target_module + target_id 且状态属
 *    {active, acknowledged} 时不再新建，resolved 出窗。
 *    站内信按收件人角色集逐人投递（标题前缀 [财务预警]、正文等于预警正文）：角色集由启用中
 *    账龄规则声明的 notify_roles 在唯一解析点决定（services/finance_alert_service.rs
 *    ::resolve_recipient_users，角色码到角色 id 到在册且启用的用户 id，去重升序），
 *    notification_id 存本轮第一条（主通知）号。角色集解析不到用户时显式不投递并保持为空，
 *    手工触发不因"有人点了按钮"就降级成发给点击者本人。
 *    因此本文件的接收侧判据一律在角色集内岗位的会话里读，触发人岗位反向判不可见。
 *    GET /finance-alerts 支持 alert_type / alert_level / status / target_module 过滤，
 *    status 与 alert_type 越界一律 400；预警行没有删除路由，终结只能靠 acknowledge + resolve。
 *
 * 5. 应收逾期候选 scan_ar_overdue：unpaid_amount > 0 且 due_date < 今日 且
 *    approval_status = APPROVED 且客户名非空的 ar_invoice（只看 approval_status，不看 status）。
 *    POST /ar/invoices 落 status=DRAFT、approval_status=PENDING、unpaid_amount=发票额；
 *    POST /ar/invoices/{id}/approve 把两态同时推到 APPROVED。
 *    DELETE /ar/invoices/{id} 要求 status=DRAFT，审批后不可删；终结只在册的
 *    POST /ar/invoices/{id}/cancel（入参 reason 必填，故清理走当场 apiCall 而非无体的延迟队列）。
 *    预警正文只由客户名、逾期天数、未收金额组装，不引入成本价等字段，脱敏面按此断。
 */

type ThresholdConfig = {
  critical_threshold?: string | number;
  severe_threshold?: string | number;
};

type AlertRule = {
  id: number;
  rule_name: string;
  rule_code: string;
  aging_bucket: string;
  threshold_days: number;
  threshold_amount: string | number | null;
  alert_level: string;
  notify_method: string;
  notify_roles: string[] | null;
  is_active: boolean;
  remarks: string | null;
};

type RulePage = { items?: AlertRule[]; total?: number };

type AlertRow = {
  id: number;
  alert_no: string;
  alert_type: string;
  alert_level: string;
  title: string;
  content: string;
  target_module: string | null;
  target_id: number | null;
  threshold_value: string | number | null;
  actual_value: string | number | null;
  status: string;
  triggered_by: number | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolve_note: string | null;
  expired_at: string | null;
  notification_id: number | null;
};

type AlertPage = { items?: AlertRow[]; total?: number };
type ScanResult = { created: AlertRow[]; created_count: number };
type CustRow = { id: number; customer_name: string };

/**
 * 功能：454-04 与 454-06 自建启用规则时声明的收件岗位码，同时是这两腿读站内信的登录岗位。
 * 调用方：建账龄规则的 notify_roles 入参、loginAsRole 入参与断言消息里的岗位名。
 * 入参：无（常量）。传给谁：aging_alert_rules.notify_roles（JSONB 数组列）与 e2e 建岗凭证。
 * 存什么：一个在 e2e 建岗花名册在册、除本文件外没有任何规则把它写进 notify_roles 的岗位码，
 * 使该岗位收件箱只承载本文件的投递，逐人投递与可见性判据都不被其它用例的投递量干扰。
 * 存哪里：不落库，只保证"角色集声明"与"登录岗位"两处字面量同源。
 */
const NOTIFY_ROLE = 'cost_accountant';

function uniq(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 功能：把 DECIMAL 序列化串按整数分（两位小数）加量，产出提交值与期望值共用的十进制串。
 * 调用方：454-01 的阈值写入入参与写后回读断言。
 * 入参：serialized 是 GET /material-shortage/threshold 读回的列值
 * （material_shortage_threshold_configs 三列均 DECIMAL(5,2)，见 migration/src/domain/v15/mod.rs 建表段，
 * PostgreSQL 按列 typmod 归一后序列化串恒带两位小数）；cents 是要加的分数；label 用于点名是哪一列。
 * 传给谁：apiCall 请求体（DECIMAL 入参按字符串十进制提交，与本仓其它金额入参同形）。
 * 存什么/存哪里：不落库，只产出与库侧口径逐字符一致的字符串。
 * 为什么不在测试里做浮点加法：基线 + 0.02 + 0.03 会产生 50.050000000000004，
 * 该值在两位小数的列上根本不存在，拿它当期望值会把"读回成功"误判成"读不回"。
 */
function addCents(serialized: unknown, cents: number, label: string): string {
  const s = String(serialized);
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) {
    throw new Error(`${label} 应为最多两位小数的 DECIMAL 序列化串，实际 ${s}`);
  }
  const totalCents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  const nextCents = totalCents + cents;
  if (nextCents < 0) {
    throw new Error(`${label} 按分加量后为负（${nextCents} 分），阈值列非负且业务上不允许负值`);
  }
  return `${Math.floor(nextCents / 100)}.${String(nextCents % 100).padStart(2, '0')}`;
}

/** 距今 days 天前的日期（后端候选判据用本地日历日） */
function pastDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** 列表信封缺 items 即点名抛出，绝不退化成"0 条" */
function requireItems<T>(data: { items?: T[] } | null | undefined, where: string): T[] {
  if (!Array.isArray(data?.items)) {
    throw new Error(
      `${where} 响应缺少 items 数组，实际 keys=${JSON.stringify(Object.keys(data ?? {}))}`
    );
  }
  return data.items;
}

/** 裸数组出参校验（部分端点的 data 就是 Vec，不带分页壳） */
function requireArray(data: unknown, where: string): unknown[] {
  if (!Array.isArray(data)) {
    throw new Error(`${where} 响应 data 应为数组，实际 ${typeof data}`);
  }
  return data;
}

function isForCustomer(a: AlertRow, custId: number): boolean {
  return a.target_module === 'customer' && a.target_id === custId;
}

test.describe.serial('454 预警配置与通知触达契约链', () => {
  const cleanup: DeferredCleanup[] = [];
  // 口令与账号一律由 helpers 的惰性函数在用例内取（describe 体顶层不求值 worker 环境量）

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    await flushDeferredCleanups(page, cleanup);
  });

  test('454-01 缺料预警阈值写入回读一致且改值后旧值不残留', async ({ page }) => {
    test.setTimeout(180_000);

    // 期望值只认库侧序列化串（两位小数），改量按整数分推导，测试内不做浮点加法
    const base = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    const baseCritical = String(base.critical_threshold);
    const baseSevere = String(base.severe_threshold);
    if (!/^\d+\.\d{2}$/.test(baseCritical) || !/^\d+\.\d{2}$/.test(baseSevere)) {
      throw new Error(
        `454-01 前置不成立：阈值基线不是两位小数的 DECIMAL 序列化串，实际=${JSON.stringify(base)}`
      );
    }
    console.log(`[454-01] 基线 critical=${baseCritical} severe=${baseSevere}`);

    const newCritical = addCents(baseCritical, 1, '基线 critical');
    const newSevere = addCents(baseSevere, 2, '基线 severe');
    await apiCall(page, 'POST', '/material-shortage/threshold', {
      critical_threshold: newCritical,
      severe_threshold: newSevere,
    });
    const after = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    expect(String(after.critical_threshold), '454-01 改后 critical 未读回新值').toBe(newCritical);
    expect(String(after.severe_threshold), '454-01 改后 severe 未读回新值').toBe(newSevere);

    // 只提交单键时另一键保持新值而非回落基线（部分覆盖，不是整表重置）
    const keepSevere = addCents(newSevere, 3, '上一轮 severe');
    await apiCall(page, 'POST', '/material-shortage/threshold', { severe_threshold: keepSevere });
    const partial = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    expect(String(partial.severe_threshold), '454-01 单键更新 severe 未读回新值').toBe(keepSevere);
    expect(String(partial.critical_threshold), '454-01 未提交的 critical 不应被改').toBe(
      newCritical
    );

    // 全局配置交回基线，避免影响其它车道
    await apiCall(page, 'POST', '/material-shortage/threshold', {
      critical_threshold: baseCritical,
      severe_threshold: baseSevere,
    });
    const restored = await apiCallRaw<ThresholdConfig>(page, 'GET', '/material-shortage/threshold');
    expect(String(restored.critical_threshold), '454-01 基线回写 critical').toBe(baseCritical);
    expect(String(restored.severe_threshold), '454-01 基线回写 severe').toBe(baseSevere);

    const list = await apiCall<RulePage>(
      page,
      'GET',
      '/material-shortage/alerts?page=1&page_size=5'
    );
    const rows = requireItems(list.data, '454-01 /material-shortage/alerts');
    const total = list.data.total;
    if (typeof total !== 'number') {
      throw new Error(`454-01 前置不成立：缺料预警列表缺 total 键，实际=${String(total)}`);
    }
    expect(total >= rows.length, '454-01 total 不应小于本页条数').toBe(true);
    console.log(`[454-01] 缺料预警列表 total=${total} 本页=${rows.length}`);
  });

  test('454-02 账期预警规则建改查与天数及推送角色读回', async ({ page }) => {
    test.setTimeout(180_000);
    const tag = uniq();

    const created = await apiCallRaw<AlertRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-454-AGE-${tag}`,
      rule_code: `e2e454age${tag}`.slice(0, 40),
      aging_bucket: '60_days',
      threshold_days: 45,
      threshold_amount: 1234.56,
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: ['finance_manager', 'purchase_clerk'],
      is_active: true,
      remarks: `454-02 初值 ${tag}`,
    });
    const id = created.id;
    expect(Number.isInteger(id) && id > 0, '454-02 建规则应返回正整数 id').toBe(true);
    deferCleanup(cleanup, 'DELETE', `/aging-alert-rules/${id}`, `454-02 rule-${tag}`);

    expect(created.threshold_days).toBe(45);
    expect(created.aging_bucket).toBe('60_days');
    expect(created.alert_level).toBe('warning');
    expect(created.notify_method).toBe('system');
    expect(created.notify_roles, '454-02 推送角色应原样存为数组').toEqual([
      'finance_manager',
      'purchase_clerk',
    ]);
    expect(created.is_active).toBe(true);

    const single = await apiCallRaw<AlertRule>(page, 'GET', `/aging-alert-rules/${id}`);
    expect(single.rule_code).toBe(created.rule_code);
    expect(single.threshold_days, '454-02 详情阈值天数应读回 45').toBe(45);
    expect(Number(single.threshold_amount), '454-02 详情阈值金额应读回 1234.56').toBe(1234.56);
    expect(single.notify_roles, '454-02 详情推送角色应读回两个').toEqual([
      'finance_manager',
      'purchase_clerk',
    ]);

    const listed = await apiCall<RulePage>(
      page,
      'GET',
      '/aging-alert-rules?page=0&page_size=100&aging_bucket=60_days'
    );
    const hit = requireItems(listed.data, '454-02 /aging-alert-rules').find(r => r.id === id);
    expect(hit, `454-02 列表按 60_days 过滤应含 id=${id}`).toBeTruthy();

    // 改值：天数与推送角色替换后，旧天数与旧角色都不得残留
    await apiCall(page, 'PUT', `/aging-alert-rules/${id}`, {
      threshold_days: 60,
      notify_roles: ['finance_manager'],
    });
    const updated = await apiCallRaw<AlertRule>(page, 'GET', `/aging-alert-rules/${id}`);
    expect(updated.threshold_days, '454-02 改后天数应为 60').toBe(60);
    expect(updated.notify_roles, '454-02 改后角色应只剩 finance_manager').toEqual([
      'finance_manager',
    ]);

    // 三态可空列：显式 null 清空为 NULL
    await apiCall(page, 'PUT', `/aging-alert-rules/${id}`, {
      threshold_amount: null,
      notify_roles: null,
      remarks: null,
    });
    const cleared = await apiCallRaw<AlertRule>(page, 'GET', `/aging-alert-rules/${id}`);
    expect(cleared.threshold_amount, '454-02 显式 null 应清空金额').toBeNull();
    expect(cleared.notify_roles, '454-02 显式 null 应清空推送角色').toBeNull();
    expect(cleared.remarks, '454-02 显式 null 应清空备注').toBeNull();
    expect(cleared.threshold_days, '454-02 未提交的键应保持 60').toBe(60);

    // 停用腿：is_active 关掉后不再进启用集（撤条件后不残留启用态）
    await apiCall(page, 'PUT', `/aging-alert-rules/${id}`, { is_active: false });
    const activeSet = await apiCall<RulePage>(
      page,
      'GET',
      '/aging-alert-rules?page=0&page_size=100&is_active=true'
    );
    expect(
      requireItems(activeSet.data, '454-02 is_active=true').some(r => r.id === id),
      '454-02 停用后不应出现在启用列表'
    ).toBe(false);
    const inactiveSet = await apiCall<RulePage>(
      page,
      'GET',
      '/aging-alert-rules?page=0&page_size=100&is_active=false'
    );
    expect(
      requireItems(inactiveSet.data, '454-02 is_active=false').some(r => r.id === id),
      '454-02 停用后应出现在停用列表'
    ).toBe(true);

    // 词表越界被拒而非静默落库（大小写与取值都不允许旁路）
    const badBucket = await apiCallExpectFail(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-454-BAD-${tag}`,
      rule_code: `e2e454bad${tag}`.slice(0, 40),
      aging_bucket: '45_days',
      threshold_days: 1,
      alert_level: 'warning',
      notify_method: 'system',
    });
    expect(badBucket.status, `454-02 非法账龄区间应 400，实际 ${badBucket.status}`).toBe(400);

    await apiCall(page, 'DELETE', `/aging-alert-rules/${id}`);
    const gone = await apiCall<RulePage>(
      page,
      'GET',
      '/aging-alert-rules?page=0&page_size=100&aging_bucket=60_days'
    );
    expect(
      requireItems(gone.data, '454-02 删后列表').some(r => r.id === id),
      `454-02 删除后列表不应再含 id=${id}`
    ).toBe(false);
  });

  test('454-03 审批超时提醒门控生效且不自动拒他人单据', async ({ page }) => {
    test.setTimeout(180_000);
    const loose =
      '/bulk-color-approvals/reminders/pending-configurable?reminder_days=0&reject_days=0';
    const strictQ =
      '/bulk-color-approvals/reminders/pending-configurable?reminder_days=99999&reject_days=99999';

    const permissive = requireArray(await apiCallRaw(page, 'GET', loose), '454-03 宽松门控');
    const strict = requireArray(await apiCallRaw(page, 'GET', strictQ), '454-03 严格门控');
    expect(
      strict.length <= permissive.length,
      `454-03 提醒天数放大后候选数应收敛，严格 ${strict.length} > 宽松 ${permissive.length}`
    ).toBe(true);
    console.log(`[454-03] 宽松 ${permissive.length} 条 / 严格 ${strict.length} 条待确认色卡审批`);

    // 极大拒绝天数不得自动拒任何单：立即执行端点返回空集，待确认集合前后条数一致
    const before = requireArray(await apiCallRaw(page, 'GET', loose), '454-03 执行前');
    const timeoutPath = '/bulk-color-approvals/reminders/check-timeouts';
    const rejected = requireArray(
      await apiCallRaw(page, 'POST', `${timeoutPath}?reminder_days=99999&reject_days=99999`),
      '454-03 check-timeouts'
    );
    expect(
      rejected.length,
      `454-03 极大 reject_days 不应自动拒单，实际 ${rejected.length} 条`
    ).toBe(0);
    const after = requireArray(await apiCallRaw(page, 'GET', loose), '454-03 执行后');
    expect(after.length, '454-03 立即执行后待确认集合条数不应变化').toBe(before.length);

    // 台账状态过滤大小写敏感：大写 ACTIVE 属越界，应 400 而不是静默空列表
    const badStatus = await apiCallExpectFail(
      page,
      'GET',
      '/finance-alerts?page=1&page_size=10&status=ACTIVE'
    );
    expect(badStatus.status, `454-03 大写 status 过滤应 400，实际 ${badStatus.status}`).toBe(400);
  });

  test('454-04 应收逾期预警真实触发落库并按规则角色集投递站内信', async ({ page }) => {
    test.setTimeout(240_000);
    const tag = uniq();

    // 收件人由启用中账龄规则的 notify_roles 在唯一解析点决定，所以本腿先自建一条启用规则、
    // 把角色集显式声明为 NOTIFY_ROLE 并回读自证；不建规则就解析不到任何收件人，
    // 预警行的 notification_id 会按"显式不投递"保持为空（不回落成点击者）。
    const rule = await apiCallRaw<AlertRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-454-04-AGE-${tag}`,
      rule_code: `e2e454o4${tag}`.slice(0, 40),
      aging_bucket: '30_days',
      threshold_days: 30,
      threshold_amount: 1000,
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: [NOTIFY_ROLE],
      is_active: true,
      remarks: `454-04 收件人角色集 ${tag}`,
    });
    expect(
      Number.isInteger(rule.id) && rule.id > 0,
      `454-04 建收件人规则应返回正整数 id，实际 ${String(rule.id)}`
    ).toBe(true);
    const ruleRead = await apiCallRaw<AlertRule>(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleRead.notify_roles, '454-04 收件人角色集应原样读回').toEqual([NOTIFY_ROLE]);
    expect(ruleRead.is_active, '454-04 收件人规则必须为启用态').toBe(true);

    const custs = await apiCall<{ items?: CustRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const custList = requireItems(custs.data, '454-04 /crm/customers');
    if (custList.length === 0) {
      throw new Error('454-04 前置不成立：客户主数据为空，无法构造真实逾期应收单');
    }
    const customer = custList[0];
    if (typeof customer.customer_name !== 'string' || customer.customer_name === '') {
      throw new Error(
        `454-04 前置不成立：客户 id=${customer.id} 缺 customer_name，实际键集=${JSON.stringify(
          Object.keys(customer)
        )}`
      );
    }
    const custName = `${customer.customer_name}-454${tag}`;

    const invoice = await apiCallRaw<{
      id: number;
      unpaid_amount: string | number;
      status: string;
      approval_status: string;
    }>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      customer_name: custName,
      invoice_amount: 8888.88,
      invoice_date: pastDate(45),
      due_date: pastDate(40),
    });
    const invoiceId = invoice.id;
    expect(Number.isInteger(invoiceId) && invoiceId > 0, '454-04 建应收单应返回正整数 id').toBe(
      true
    );
    expect(invoice.status, '454-04 新建应收单应为 DRAFT').toBe('DRAFT');
    expect(invoice.approval_status, '454-04 新建应收单审批态应为 PENDING').toBe('PENDING');
    expect(Number(invoice.unpaid_amount), '454-04 未收金额应等于发票额').toBe(8888.88);

    await apiCallRaw(page, 'POST', `/ar/invoices/${invoiceId}/approve`);

    const scan = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    requireArray(scan.created, '454-04 created');
    expect(scan.created_count, '454-04 created_count 应等于 created 条数').toBe(
      scan.created.length
    );
    const mine = scan.created.filter(a => isForCustomer(a, customer.id));
    if (mine.length === 0) {
      throw new Error(
        `454-04 前置不成立：逾期应收单已审批且到期日 ${pastDate(40)} 已过，扫描仍无该客户预警；` +
          `created=${scan.created.length} 条，target 集=${JSON.stringify(
            scan.created.map(a => [a.target_module, a.target_id])
          )}`
      );
    }
    const alert = mine[0];

    expect(alert.alert_type).toBe('ar_overdue');
    expect(alert.status, '454-04 新建预警状态应为 active').toBe('active');
    expect(alert.alert_no.startsWith('FA-'), `454-04 单号应带 FA- 前缀：${alert.alert_no}`).toBe(
      true
    );
    expect(Number(alert.actual_value), '454-04 实际值应为未收金额 8888.88').toBe(8888.88);
    expect(Number(alert.threshold_value), '454-04 阈值应落 0').toBe(0);
    expect(alert.triggered_by, '454-04 triggered_by 应为当前登录用户').not.toBeNull();
    expect(alert.expired_at, '454-04 新建预警不应有 expired_at').toBeNull();
    expect(alert.title.includes(custName), `454-04 标题应含客户真名：${alert.title}`).toBe(true);

    // 脱敏面：正文只由客户名/逾期天数/未收金额组装，不引入成本与单价字段
    for (const sensitive of ['cost_price', 'unit_price', '成本价', '单位成本']) {
      expect(alert.content.includes(sensitive), `454-04 正文不应含 ${sensitive}`).toBe(false);
    }

    const detail = await apiCallRaw<AlertRow>(page, 'GET', `/finance-alerts/${alert.id}`);
    expect(detail.alert_no).toBe(alert.alert_no);
    expect(detail.status).toBe('active');
    expect(detail.content).toBe(alert.content);

    const ledger = await apiCall<AlertPage>(
      page,
      'GET',
      `/finance-alerts?alert_type=ar_overdue&status=active&page=1&page_size=100`
    );
    const ledgerHit = requireItems(ledger.data, '454-04 /finance-alerts').find(
      r => r.id === alert.id
    );
    expect(ledgerHit, `454-04 active 台账应可检索到 id=${alert.id}`).toBeTruthy();

    const notifId = detail.notification_id;
    if (typeof notifId !== 'number') {
      throw new Error(`454-04 前置不成立：预警未回填 notification_id=${String(notifId)}`);
    }

    // 反向判据：触发人岗位（本分片会话）不在 notify_roles 内，其未读列表不得出现这条通知。
    const triggerInbox = await listNotifications(page, 'UNREAD');
    expect(
      triggerInbox.find(n => n.id === notifId),
      `454-04 触发人岗位不在角色集 ${NOTIFY_ROLE} 内，未读列表不应含通知 id=${notifId}`
    ).toBeUndefined();

    // 越界类型不静默回落全量，而是 400
    const badType = await apiCallExpectFail(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'AR_OVERDUE',
    });
    expect(badType.status, `454-04 大写 alert_type 应 400，实际 ${badType.status}`).toBe(400);

    // 预警行无删除路由，按状态机终结（同时清掉未处理态，避免污染后续扫描）
    await apiCall(page, 'POST', `/finance-alerts/${alert.id}/acknowledge`, { remark: '用例回收' });
    await apiCall(page, 'POST', `/finance-alerts/${alert.id}/resolve`, {
      resolve_note: '454 契约链用例回收',
    });
    // 应收单审批后不可删，走唯一在册终结跃迁（reason 必填，故不能进无体的延迟队列）
    await apiCall(page, 'POST', `/ar/invoices/${invoiceId}/cancel`, {
      reason: '454 契约链用例回收',
    });
    // 规则只在本腿扫描那一刻参与收件人解析，投递完成后当场回收并把 404 读回，
    // 不把启用中的角色集留给同分片的后续用例；删除权属于建规则的岗位，故排在切岗之前。
    await apiCall(page, 'DELETE', `/aging-alert-rules/${rule.id}`);
    const ruleGone = await apiCallExpectFail(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleGone.status, `454-04 规则回收后应 404，实际 ${ruleGone.status}`).toBe(404);

    // 接收侧判据换到角色集内岗位的会话里读；站内信的删除权只属收件人
    // （notification_service.rs::delete_notification 逐条比 user_id），回收也在这一段登记。
    await loginAsRole(page, NOTIFY_ROLE);
    const inbox = await listNotifications(page, 'UNREAD');
    const got = inbox.find(n => n.title === `[财务预警] ${alert.title}`);
    expect(
      got,
      `454-04 角色集内岗位 ${NOTIFY_ROLE} 的未读列表应含预警 id=${alert.id} 的站内信，` +
        `实际 ${inbox.length} 行`
    ).toBeTruthy();
    deferCleanup(cleanup, 'DELETE', `/notifications/${got!.id}`, `454-04 notif ${got!.id}`);
    expect(got!.content, '454-04 通知正文应等于预警正文').toBe(alert.content);
    const unread = await apiCallRaw<number>(page, 'GET', '/notifications/unread-count');
    expect(
      typeof unread === 'number' && unread > 0,
      `454-04 ${NOTIFY_ROLE} 收件后未读计数异常：${String(unread)}`
    ).toBe(true);
    console.log(
      `[454-04] 预警 id=${alert.id} no=${alert.alert_no} 角色集=${NOTIFY_ROLE} ` +
        `主通知 id=${notifId} 收件通知 id=${got!.id}`
    );
  });

  test('454-05 二次触发不翻倍且终结后未处理集不残留该条', async ({ page }) => {
    test.setTimeout(240_000);
    const tag = uniq();

    // 自己造一份逾期事实，保证目标客户与预警条数可判
    const custs = await apiCall<{ items?: CustRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const customer = requireItems(custs.data, '454-05 /crm/customers')[0];
    const custName = `${customer.customer_name}-454dup${tag}`;
    const invoice = await apiCallRaw<{ id: number }>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      customer_name: custName,
      invoice_amount: 5555.55,
      invoice_date: pastDate(50),
      due_date: pastDate(42),
    });
    await apiCallRaw(page, 'POST', `/ar/invoices/${invoice.id}/approve`);

    const scan1 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const first = scan1.created.filter(a => isForCustomer(a, customer.id));
    if (first.length !== 1) {
      throw new Error(
        `454-05 前置不成立：首次扫描为该客户建了 ${first.length} 条预警（应为 1 条），` +
          `created 总数=${scan1.created.length}`
      );
    }
    const target = first[0];

    // 同条件再扫一次：不得为该目标再建，未处理窗口内条数恒为 1
    const scan2 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const dup = scan2.created.filter(a => isForCustomer(a, customer.id));
    expect(dup.length, '454-05 二次扫描不应为该目标再建预警').toBe(0);

    const ledger = await apiCall<AlertPage>(
      page,
      'GET',
      '/finance-alerts?alert_type=ar_overdue&target_module=customer&page=1&page_size=200'
    );
    const unhandled = requireItems(ledger.data, '454-05 /finance-alerts').filter(
      r => r.target_id === customer.id && r.status === 'active'
    );
    expect(unhandled.length, '454-05 同目标 active 预警应恰为 1 条').toBe(1);

    // 未确认直接解决应被拒，且状态不得被改写（值判据，不靠错误码）
    const earlyResolve = await apiCallExpectFail(
      page,
      'POST',
      `/finance-alerts/${target.id}/resolve`,
      { resolve_note: '454-05 跳过确认直接解决' }
    );
    expect(earlyResolve.status, `454-05 越序 resolve 应被拒，实际 ${earlyResolve.status}`).toBe(
      400
    );
    const stillActive = await apiCallRaw<AlertRow>(page, 'GET', `/finance-alerts/${target.id}`);
    expect(stillActive.status, '454-05 被拒后状态应仍为 active').toBe('active');

    const ack = await apiCallRaw<AlertRow>(
      page,
      'POST',
      `/finance-alerts/${target.id}/acknowledge`,
      {
        remark: '454-05 已核实',
      }
    );
    expect(ack.status, '454-05 确认后状态应为 acknowledged').toBe('acknowledged');
    expect(ack.acknowledged_at, '454-05 确认时间应回填').not.toBeNull();

    const res = await apiCallRaw<AlertRow>(page, 'POST', `/finance-alerts/${target.id}/resolve`, {
      resolve_note: '454-05 逾期款项已另行处理',
    });
    expect(res.status, '454-05 解决后状态应为 resolved').toBe('resolved');
    expect(res.resolved_at, '454-05 解决时间应回填').not.toBeNull();
    expect(res.resolve_note, '454-05 解决说明应原样读回').toBe('454-05 逾期款项已另行处理');

    // 反向腿：撤除本条逾期事实并终结后，已 resolved 的这条不得回到 active 集合
    await apiCall(page, 'POST', `/ar/invoices/${invoice.id}/cancel`, {
      reason: '454 契约链用例回收',
    });
    const scan3 = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const ledger2 = await apiCall<AlertPage>(
      page,
      'GET',
      '/finance-alerts?alert_type=ar_overdue&status=active&page=1&page_size=200'
    );
    const rows2 = requireItems(ledger2.data, '454-05 终结后 active 台账');
    expect(
      rows2.some(r => r.id === target.id),
      '454-05 已 resolved 的条不应残留 active 集合'
    ).toBe(false);
    const stale = rows2.filter(r => r.target_id === customer.id);
    const born3 = scan3.created.filter(a => isForCustomer(a, customer.id));
    // 幂等窗口只对未处理态生效：出窗后允许重建，但同目标未处理态最多 1 条，绝不翻倍
    expect(
      stale.length <= 1 && born3.length <= 1,
      `454-05 同目标未处理态不得翻倍，台账 ${stale.length} 条 / 本次新增 ${born3.length} 条`
    ).toBe(true);
    if (born3.length === 1) {
      await apiCall(page, 'POST', `/finance-alerts/${born3[0].id}/acknowledge`, {
        remark: '用例回收',
      });
      await apiCall(page, 'POST', `/finance-alerts/${born3[0].id}/resolve`, {
        resolve_note: '454 契约链用例回收',
      });
    }

    const resolvedList = await apiCall<AlertPage>(
      page,
      'GET',
      '/finance-alerts?alert_type=ar_overdue&status=resolved&page=1&page_size=200'
    );
    expect(
      requireItems(resolvedList.data, '454-05 resolved 台账').some(r => r.id === target.id),
      `454-05 resolved 集合应含 id=${target.id}`
    ).toBe(true);
  });

  test('454-06 站内信按规则角色集投递，非角色集岗位不可见', async ({ page }) => {
    test.setTimeout(240_000);
    const tag = uniq();

    // 收件人由规则声明的角色集决定（与 454-04 同一个解析点），本腿先自建启用规则并回读自证。
    const rule = await apiCallRaw<AlertRule>(page, 'POST', '/aging-alert-rules', {
      rule_name: `E2E-454-06-AGE-${tag}`,
      rule_code: `e2e454o6${tag}`.slice(0, 40),
      aging_bucket: '30_days',
      threshold_days: 30,
      threshold_amount: 1000,
      alert_level: 'warning',
      notify_method: 'system',
      notify_roles: [NOTIFY_ROLE],
      is_active: true,
      remarks: `454-06 收件人角色集 ${tag}`,
    });
    const ruleRead = await apiCallRaw<AlertRule>(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleRead.notify_roles, '454-06 收件人角色集应原样读回').toEqual([NOTIFY_ROLE]);
    expect(ruleRead.is_active, '454-06 收件人规则必须为启用态').toBe(true);

    const custs = await apiCall<{ items?: CustRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=50'
    );
    const cust = requireItems(custs.data, '454-06 /crm/customers')[0];
    const custName = `${cust.customer_name}-454ui${tag}`;
    const invoice = await apiCallRaw<{ id: number }>(page, 'POST', '/ar/invoices', {
      customer_id: cust.id,
      customer_name: custName,
      invoice_amount: 6666.66,
      invoice_date: pastDate(30),
      due_date: pastDate(25),
    });
    await apiCall(page, 'POST', `/ar/invoices/${invoice.id}/approve`);

    const scan = await apiCallRaw<ScanResult>(page, 'POST', '/finance-alerts/trigger-scan', {
      alert_type: 'ar_overdue',
    });
    const mine = scan.created.filter(a => a.title.includes(custName));
    if (mine.length === 0) {
      throw new Error(
        `454-06 前置不成立：新建逾期单生成的预警不在扫描结果，created=${scan.created.length}，` +
          `标题集=${JSON.stringify(scan.created.map(a => a.title))}`
      );
    }
    const alert = mine[0];
    const notifId = alert.notification_id;
    if (typeof notifId !== 'number') {
      throw new Error(
        `454-06 前置不成立：预警 id=${alert.id} 未回填 notification_id=${String(notifId)}`
      );
    }

    const marker = `[财务预警] ${custName}`;
    const pageTitle = page.locator('.notification .card-header').getByText('通知中心', {
      exact: true,
    });

    // 触发人岗位（本分片会话）不在角色集内：先证页面真渲染，再判 0 才有意义。
    await safeGoto(page, '/notification');
    await expect(pageTitle, '454-06 未渲染通知中心页面标题').toBeVisible();
    await expect(
      page.locator('.item-title', { hasText: marker }),
      `454-06 触发人岗位不在角色集 ${NOTIFY_ROLE} 内，不应看到 ${marker}`
    ).toHaveCount(0);

    // 写侧回收全部留在触发人岗位上做完：预警按状态机终结，规则只在本腿扫描那一刻参与收件人
    // 解析，投递完成后当场回收并把 404 读回，不把启用中的角色集留给同分片的后续用例。
    await apiCall(page, 'POST', `/finance-alerts/${alert.id}/acknowledge`, { remark: '用例回收' });
    await apiCall(page, 'POST', `/finance-alerts/${alert.id}/resolve`, {
      resolve_note: '454 契约链用例回收',
    });
    await apiCall(page, 'POST', `/ar/invoices/${invoice.id}/cancel`, {
      reason: '454 契约链用例回收',
    });
    await apiCall(page, 'DELETE', `/aging-alert-rules/${rule.id}`);
    const ruleGone = await apiCallExpectFail(page, 'GET', `/aging-alert-rules/${rule.id}`);
    expect(ruleGone.status, `454-06 规则回收后应 404，实际 ${ruleGone.status}`).toBe(404);

    // 会计岗与角色集内岗位的判据走 API 而不是界面：通知中心路由的可见门挂在 users:read
    // （router/index.ts 的 meta.permission），而 e2e 建岗面除通配超管外无人持这枚键，
    // 用界面判 0 会把"进不去页面"当成"没推到"。两岗同机制，一读得到一个读不到，
    // 既排除整个读面空转，也排除投递仍落在点击者身上。
    await loginAsRole(page, 'accountant');
    const accountantInbox = await listNotifications(page, 'UNREAD');
    expect(
      accountantInbox.find(n => n.title === `[财务预警] ${alert.title}`),
      `454-06 accountant 非收件人，收件箱不应含预警 id=${alert.id} 的站内信`
    ).toBeUndefined();

    // 角色集内岗位登录：站内信删除权只属收件人
    // （notification_service.rs::delete_notification 逐条比 user_id），
    // 所以本腿最后一段留在这个岗位，延迟回收队列在它之后才 flush。
    await loginAsRole(page, NOTIFY_ROLE);
    const inbox = await listNotifications(page, 'UNREAD');
    const got = inbox.find(n => n.title === `[财务预警] ${alert.title}`);
    expect(
      got,
      `454-06 角色集内岗位 ${NOTIFY_ROLE} 的未读列表应含预警 id=${alert.id} 的站内信，` +
        `实际 ${inbox.length} 行`
    ).toBeTruthy();
    expect(
      inbox.filter(n => n.title === `[财务预警] ${alert.title}`).length,
      `454-06 同一预警对同一收件人只应投递一条，实际 ${inbox.length} 行里命中多条`
    ).toBe(1);
    deferCleanup(cleanup, 'DELETE', `/notifications/${got!.id}`, `454-06 notif ${got!.id}`);
    expect(got!.content, '454-06 通知正文应等于预警正文').toBe(alert.content);

    console.log(
      `454-06 可见性腿通过：预警 id=${alert.id} 角色集=${NOTIFY_ROLE} ` +
        `主通知 id=${notifId} 收件通知 id=${got!.id}`
    );
  });

  test('454-07 手工建预警走同一状态词表且未知类型被拒', async ({ page }) => {
    test.setTimeout(180_000);
    const tag = uniq();

    const created = await apiCallRaw<AlertRow>(page, 'POST', '/finance-alerts', {
      alert_type: 'budget_overrun',
      alert_level: 'critical',
      title: `454-07 手工预警 ${tag}`,
      content: `454-07 手工预警正文 ${tag}`,
      target_module: 'e2e_probe',
      target_id: 987654321,
      threshold_value: 100,
      actual_value: 200,
      value_unit: 'CNY',
    });
    expect(created.status, '454-07 手工建预警应落 active').toBe('active');
    expect(created.alert_level).toBe('critical');
    expect(
      created.alert_no.startsWith('FA-'),
      `454-07 单号应带 FA- 前缀：${created.alert_no}`
    ).toBe(true);
    expect(
      created.notification_id,
      `454-07 手工建预警不带触发人上下文，不应产生站内信：${String(created.notification_id)}`
    ).toBeNull();

    const detail = await apiCallRaw<AlertRow>(page, 'GET', `/finance-alerts/${created.id}`);
    expect(detail.title).toBe(`454-07 手工预警 ${tag}`);
    expect(Number(detail.actual_value), '454-07 实际值应读回 200').toBe(200);

    const badCreate = await apiCallExpectFail(page, 'POST', '/finance-alerts', {
      alert_type: 'Inventory_Backlog',
      alert_level: 'warning',
      title: `454-07 越界类型 ${tag}`,
      content: '越界类型',
    });
    expect(badCreate.status, `454-07 未知 alert_type 应 400，实际 ${badCreate.status}`).toBe(400);

    const missing = await apiCallExpectFail(page, 'GET', '/finance-alerts/987654321');
    expect(missing.status, `454-07 取不存在预警应 404，实际 ${missing.status}`).toBe(404);

    await apiCall(page, 'POST', `/finance-alerts/${created.id}/acknowledge`, {
      remark: '用例回收',
    });
    await apiCall(page, 'POST', `/finance-alerts/${created.id}/resolve`, {
      resolve_note: '454 契约链用例回收',
    });
  });
});
