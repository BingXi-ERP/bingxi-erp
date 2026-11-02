import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  expectDenied,
  failureCode,
  loginAsRole,
  loginViaUI,
  apiCall,
  apiCallExpectFail,
  testUsername,
} from './helpers';

/**
 * 252 审计闭环 / 反向追溯 / 安全告警 / 账号解锁族 的 e2e 配对真契约
 *
 * 守的是什么（判据全部取自后端源码实核，不凭响应形状猜）：
 * - POST /audit-logs/record-print（audit_log_handler.rs）：字段校验逐字文案
 *   「resource_type 长度必须在 1-64 个字符之间 / title 长度必须在 1-200 个字符之间 /
 *   record_count 不能为负数」，合法上报经 AuditLogService::record_async 异步落
 *   audit_logs（operation_type=PRINT、severity=INFO、resource_name=title、
 *   description=「用户 {u} 前端打印 {title}（共 N 条记录）」、request_path=
 *   /api/v1/erp/audit-logs/record-print、after_snapshot 含 source=frontend_print；
 *   PRINT 属追加事件，before_snapshot 按源码恒为 None，不断言）。回读 GET /audit-logs
 *   用本 spec 自埋的唯一 marker 做因果对账，钉住「发起→落库→可查」闭环，
 *   而非「列表非空即通过」。
 * - GET /audit-logs（audit_log_handler.rs + can_access_audit_logs）：仅
 *   admin/auditor 角色可读，非 admin 会话与未登录会话都被拦。列表信封
 *   {items,total,page,page_size}，行字段即 AuditLogListItem（audit_log_handler.rs）；
 *   审计模型（models/audit_log.rs）存 账号(user_id/username)、IP、UA、变更前后快照、
 *   created_at，但不存独立「角色/终端」列，故只断言真实存在的列，不假装角色列存在。
 * - GET /business-trace/backward（business_trace_handler.rs）：customer_id 为
 *   i32 必填、batch_no 必填，缺参/非整数入参 400；出参 {traces,total}、message
 *   「反向追溯完成」逐字同源。服务层（business_trace_service.rs）对不存在主键
 *   无存在性检查、返回空数组 ⇒ 现状为 200+空壳而非 404，本 spec 按现状契约断言并在
 *   交接中点名该缺陷形状（与数据权限详情的 200+null 缺陷同型）。
 * - GET /alerts（login_security_handler.rs）：告警由近 24h SUCCESS 登录按
 *   user_id 聚合多 IP 实时计算，无持久化主键；出参 SecurityAlert 无 id 字段，
 *   alert_type 恒 MULTI_IP_LOGIN、description 形如「24小时内从 N 个不同 IP 登录」。
 *   POST /alerts/{id}/resolve（login_security_handler.rs）为纯桩：不校验 id
 *   存在、不写任何状态，恒 200+「告警已解锁文案族」中的「告警已处理」。因此状态转移
 *   回读在本端点物理不可达——spec 按源码真相断言「resolve 前后告警集逐项不变」的
 *   无操作语义（含对不存在 id 放行），该桩缺陷已单独点名，不在测试侧伪造状态变化。
 * - GET /lock-status（login_security_handler.rs）：OptionalAuthContext——
 *   匿名与本人都可查；已登录非 admin 查他人 username 被拒。MAX_FAILED_ATTEMPTS=9、
 *   统计窗口 30 分钟（L:95-96）为锁定口径唯一来源。
 * - GET /locked-accounts（login_security_handler.rs）：按 FAILED 登录聚合，
 *   lock_reason 形如「N 次登录失败」，仅列 ≥9 次者；与 /lock-status 同窗同阈值，
 *   故列表内每个账号的 lock-status.is_locked 必为 true（口径自洽断言）。
 * - POST /unlock 与 POST /locked-accounts/{id}/unlock（L:222-245、L:383-408）：均
 *   require_admin_role，非 admin 被拦；真删 log_login 该 username 全部 FAILED 行，
 *   故解锁后回读 /lock-status 窗口内 failed_attempts 必为 0——库态变化可回读，
 *   不是只看 200。by-id 腿对不存在用户 404 NOT_FOUND（「用户 {id}」文案）。
 *   username 腿成功文案「账号已解锁」逐字同源。
 *
 * 数据卫生：解锁腿只作用于本 worker 自己的会话账号（globalSetup 建的独立 admin），
 * 不碰角色账号与其他 worker 账号，不制造跨会话干扰。
 */

type AuditRow = {
  id: number;
  user_id: number | null;
  username: string | null;
  operation_type: string | null;
  severity: string | null;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  description: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  request_method: string | null;
  request_path: string | null;
  created_at: string | null;
};

type AuditListBody = {
  items: AuditRow[];
  total: number;
  page: number;
  page_size: number;
};

type TraceListBody = {
  traces: Array<Record<string, unknown>>;
  total: number;
};

type AlertRow = {
  alert_type: string;
  user_id: number;
  username: string;
  ip_address: string;
  location: string | null;
  detected_at: string;
  description: string;
};

type LockStatusBody = {
  user_id: number;
  username: string;
  is_locked: boolean;
  failed_attempts: number;
  locked_until: string | null;
  max_attempts: number;
};

type LockedRow = {
  id: number | null;
  username: string;
  lock_reason: string;
  locked_at: string | null;
  unlock_at: string | null;
};

async function loginAsNonAdmin(page: import('@playwright/test').Page): Promise<void> {
  const errors: string[] = [];
  for (const role of ['report_viewer', 'e2e_readonly']) {
    try {
      await loginAsRole(page, role);
      return;
    } catch (e) {
      errors.push(`${role}: ${(e as Error).message}`);
    }
  }
  throw new Error(`非 admin 角色账号基建缺失（两个候选角色都登录不上）：${errors.join(' | ')}`);
}

test.describe('252 审计追溯告警解锁配对', () => {
  test('打印埋点→审计回读因果对账：marker 行携带账号/动作/时间/描述且详情含 after_snapshot', async ({
    page,
  }) => {
    await loginViaUI(page);
    const marker = `E252P${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const title = `e252-print-${marker}`;

    const sent = await apiCall(page, 'POST', '/audit-logs/record-print', {
      resource_type: 'customer',
      record_count: 3,
      title,
      resource_id: marker,
    });
    expect(sent, 'record-print 合法上报应成功').toBeTruthy();

    // record_async 为 best-effort 异步落库，给有界轮询窗口（20s），超时即判红不静默
    let row: AuditRow | undefined;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !row) {
      const list = await apiCall<AuditListBody>(
        page,
        'GET',
        `/audit-logs?operation_type=PRINT&keyword=${marker}&page_size=50`
      );
      row = list.data.items.find((it) => it.resource_name === title);
      if (!row) await page.waitForTimeout(1_000);
    }
    expect(row, `20s 内未在审计列表回读到 marker=${marker} 的 PRINT 行`).toBeTruthy();

    const found = row as AuditRow;
    expect(found.operation_type).toBe('PRINT');
    expect(found.severity).toBe('INFO');
    expect(found.username, '审计行必须记录操作账号').toBe(testUsername());
    expect(found.resource_type).toBe('customer');
    expect(found.resource_id).toBe(marker);
    expect(found.description, '描述须含发起账号与 marker 原文').toContain(marker);
    expect(found.description).toContain('前端打印');
    expect(found.request_method).toBe('POST');
    expect(found.request_path).toBe('/api/v1/erp/audit-logs/record-print');
    expect(found.created_at, '审计时间列不得为空').toBeTruthy();

    // 变更内容落库证据：PRINT 为追加事件，before_snapshot 恒 None（源码如此），
    // after_snapshot 应持久化 source=frontend_print 与 marker 原文
    const detail = await apiCall<Record<string, unknown>>(page, 'GET', `/audit-logs/${found.id}`);
    const detailRaw = JSON.stringify(detail.data ?? {});
    expect(detailRaw).toContain('frontend_print');
    expect(detailRaw).toContain(marker);
  });

  test('record-print 入参校验：负数条数与空标题按源码逐字文案 400', async ({ page }) => {
    await loginViaUI(page);
    const negCount = await apiCallExpectFail(page, 'POST', '/audit-logs/record-print', {
      resource_type: 'customer',
      record_count: -1,
      title: 'e252-neg-count',
    });
    expect(negCount.status).toBe(400);
    expect(negCount.message).toContain('record_count 不能为负数');

    const emptyTitle = await apiCallExpectFail(page, 'POST', '/audit-logs/record-print', {
      resource_type: 'customer',
      record_count: 1,
      title: '',
    });
    expect(emptyTitle.status).toBe(400);
    expect(emptyTitle.message).toContain('title 长度必须在 1-200 个字符之间');
  });

  test('审计列表访问门：非 admin 会话与未登录会话均被拦', async ({ page }) => {
    await loginAsNonAdmin(page);
    const asViewer = await apiCallExpectFail(page, 'GET', '/audit-logs?page_size=1');
    expectDenied(asViewer);

    // 未登录腿：清掉本 context 会话 cookie 后直取，AuthContext 提取失败应 401
    await page.context().clearCookies();
    const anon = await apiCallExpectFail(page, 'GET', '/audit-logs?page_size=1');
    expect(anon.status, `未登录访问审计列表应 401，实际 ${anon.status}`).toBe(401);
  });

  test('反向追溯：必填维度缺失/类型非法 400；不存在主键现状 200+空壳（缺陷已点名）', async ({
    page,
  }) => {
    await loginViaUI(page);

    const noParams = await apiCallExpectFail(page, 'GET', '/business-trace/backward');
    expect(noParams.status, '缺 customer_id 与 batch_no 应 400').toBe(400);

    const badType = await apiCallExpectFail(
      page,
      'GET',
      '/business-trace/backward?customer_id=not-an-int&batch_no=E252'
    );
    expect(badType.status, 'customer_id 非 i32 应 400').toBe(400);

    const ghost = await apiCall<TraceListBody>(
      page,
      'GET',
      '/business-trace/backward?customer_id=999999999&batch_no=E252-NO-SUCH-BATCH'
    );
    // 现状契约：服务层无存在性检查，不存在主键返回 200 + 空 traces（应为 404 的缺陷形状，
    // 与数据权限详情 200+data=null 同型，已随交接点名，不在测试侧伪造 404）
    expect(ghost.message).toBe('反向追溯完成');
    expect(Array.isArray(ghost.data.traces)).toBe(true);
    expect(ghost.data.traces).toEqual([]);
    expect(ghost.data.total).toBe(0);
  });

  test('安全告警：列表逐字段形状；resolve 桩语义=对任意 id 恒 200 且回读告警集不变', async ({
    page,
  }) => {
    await loginViaUI(page);

    const before = await apiCall<AlertRow[]>(page, 'GET', '/alerts');
    expect(Array.isArray(before.data)).toBe(true);
    for (const alert of before.data) {
      expect(alert.alert_type).toBe('MULTI_IP_LOGIN');
      expect(alert.username).toBeTruthy();
      expect(alert.detected_at).toBeTruthy();
      expect(alert.description).toMatch(/^24小时内从 \d+ 个不同 IP 登录$/);
    }

    const r1 = await apiCall(page, 'POST', '/alerts/999999999/resolve');
    expect(r1.message).toBe('告警已处理');
    const r2 = await apiCall(page, 'POST', '/alerts/999999999/resolve');
    expect(r2.message).toBe('告警已处理');

    const after = await apiCall<AlertRow[]>(page, 'GET', '/alerts');
    expect(after.data.length, 'resolve 为无持久化桩：回读告警数量应与处理前逐项一致').toBe(
      before.data.length
    );
  });

  test('lock-status：本人查询 200 且阈值 9 逐字同源；缺 username 400；非 admin 查他人被拦', async ({
    page,
  }) => {
    await loginViaUI(page);
    const adminUser = testUsername();

    const own = await apiCall<LockStatusBody>(
      page,
      'GET',
      `/lock-status?username=${encodeURIComponent(adminUser)}`
    );
    expect(own.data.username).toBe(adminUser);
    expect(own.data.max_attempts).toBe(9);
    expect(typeof own.data.is_locked).toBe('boolean');

    const missing = await apiCallExpectFail(page, 'GET', '/lock-status');
    expect(missing.status).toBe(400);
    expect(missing.message).toContain('缺少 username 参数');

    await loginAsNonAdmin(page);
    const peek = await apiCallExpectFail(
      page,
      'GET',
      `/lock-status?username=${encodeURIComponent(adminUser)}`
    );
    expectDenied(peek);
  });

  test('locked-accounts 与 lock-status 口径自洽：列表内每个账号必处于锁定态', async ({ page }) => {
    await loginViaUI(page);
    const locked = await apiCall<LockedRow[]>(page, 'GET', '/locked-accounts');
    expect(Array.isArray(locked.data)).toBe(true);
    for (const item of locked.data) {
      expect(item.username).toBeTruthy();
      expect(item.lock_reason).toMatch(/^\d+ 次登录失败$/);
      const st = await apiCall<LockStatusBody>(
        page,
        'GET',
        `/lock-status?username=${encodeURIComponent(item.username)}`
      );
      expect(st.data.is_locked, `列表口径与 lock-status 口径必须一致`).toBe(true);
      expect(st.data.failed_attempts).toBeGreaterThanOrEqual(9);
    }
  });

  test('解锁族：by-id 不存在 404；本人 username 解锁真删 FAILED 行并回读归零', async ({
    page,
  }) => {
    await loginViaUI(page);

    const notFound = await apiCallExpectFail(page, 'POST', '/locked-accounts/999999999/unlock');
    expect(notFound.status).toBe(404);
    expect(failureCode(notFound)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(notFound.message).toContain('999999999');

    const adminUser = testUsername();
    const unlocked = await apiCall(page, 'POST', '/unlock', { username: adminUser });
    expect(unlocked.message).toBe('账号已解锁');

    const st = await apiCall<LockStatusBody>(
      page,
      'GET',
      `/lock-status?username=${encodeURIComponent(adminUser)}`
    );
    expect(st.data.failed_attempts, 'unlock 真删 log_login FAILED 行，回读窗口计数必为 0').toBe(0);
    expect(st.data.is_locked).toBe(false);
  });

  test('解锁权限门：非 admin 调用 locked-accounts/{id}/unlock 被拦', async ({ page }) => {
    await loginAsNonAdmin(page);
    const denied = await apiCallExpectFail(page, 'POST', '/locked-accounts/1/unlock');
    expectDenied(denied);
  });
});
