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
 * 254 审计高危标记 / 审计不可篡改 / 缸号-供应商-客户追溯腿 的 e2e 配对真契约
 *
 * 守的是什么（判据全部取自后端源码实核，不凭响应形状猜）：
 * - 严重级别词表的唯一真源是 models/audit_log.rs 的 Severity::as_str()，只有
 *   INFO / WARN / ERROR / CRITICAL 四个大写 token，**没有 HIGH**：本仓「高危单独标记」的实现
 *   形态是高危动作被写成 WARN 及以上。全后端扫描确认：角色授予变更（role_handler.rs/509/
 *   571/619）、用户软删除与改密失败（user_handler.rs/858）、权限合规与导出合规服务
 *   （permission_compliance_service.rs / export_compliance_service.rs）、鉴权中间件
 *   （permission.rs）写 WARN/CRITICAL，其余常规台账一律 INFO（audit_log_service.rs/475/592、
 *   audit_log_handler.rs/682）。本 spec 因此用「批量整批替换角色级授予」这条真业务写腿
 *   （role_handler.rs：operation_type=UPDATE、severity=Severity::Warn、resource_type=
 *   role_permission、resource_id=role_id、before_snapshot 与 after_snapshot 双双 Some(serde_json::Value)，
 *   由 role_permission_service.rs 以稳定排序的授予明细数组落库）做高危对账，
 *   而不是挑一条只产 INFO 的动作冒充高危。
 * - 变更前后值的真实列名：models/audit_log.rs 是旧字段 old_value/new_value（注释逐字标明
 *   「与 before_snapshot/after_snapshot 同义」），:122-125 是推荐字段 before_snapshot/after_snapshot。
 *   详情 DTO（audit_log_handler.rs）四列一起外显，故本 spec 同时读回推荐列与旧列，
 *   并点名 :126-128 的 condition 列只存在于库侧、AuditLogListItem 与详情 DTO 均未暴露，
 *   API 面读不到它，测试侧不假装能读。
 * - 审计不可篡改：审计挂载面 routes/system.rs 只注册 GET /audit-logs、
 *   GET /audit-logs/export、GET /audit-logs/{id}、POST /audit-logs/record-print、
 *   GET /audit-logs/export-logs、GET /audit-logs/summary —— 读腿 + 一条纯追加写腿，
 *   **不存在任何 PUT/PATCH/DELETE 或批量改写入口**。本 spec 因此在「已注册路径 + 未注册方法」
 *   的八个形态上逐条确定断 405（axum 方法兜底语义，先例见 31b 对只挂 put/delete 的静态节点
 *   打 GET 必得 405 的同一口径），并的第二道证据是把同一条审计行在探测前后逐字段整读回来做
 *   全字段深等值（含详情四列快照）。探测体是空信封，故只钉状态码不硬写文案。
 * - 追溯三条腿的入参维度（handler:73-95）：/forward 必填 supplier_id(i32)+batch_no、
 *   /backward 必填 customer_id(i32)+batch_no、/snapshot/{trace_chain_id} 是路径参数主键；
 *   两腿出参信封 message 逐字同源「正向追溯完成」（handler:204）/「反向追溯完成」（handler:252）。
 *   快照腿有真存在性检查：business_trace_service.rs 查不到链即
 *   AppError::not_found("追溯链不存在")；两枚读腿对不存在主键无检查、返回 200+traces:[]+total:0。
 *   本 spec 把这一「写侧 404、读侧空壳」的不对称按现状钉死并点名（与 252 已点名的 backward
 *   空壳、数据权限详情 200+null 同型，且新增覆盖 forward 正腿）。
 *   快照写入→读回的正腿在本车道物理不可达：business_trace_chain 只由服务层账单流程内部插入
 *   （business_trace_service.rs/511），API 面没有任何创建入口（routes 全量 grep 只有
 *   five-dimension/forward/backward/snapshot 四条），故无法先造链再读回节点标识；此处如实点名
 *   「缺可达种子」，不在测试侧伪造链节点、也不改成「任一状态码」糊过去。
 * - 权限档：审计读腿与快照腿的 handler 深度防御不齐——list/detail/record-print 走
 *   require_admin_role（audit_log_handler.rs + can_access_audit_logs，仅 admin/auditor），
 *   而 GET /audit-logs/summary（audit_log_handler.rs）签名是 `_auth`、无深度防御，
 *   与 253 点名的观测族同型；business-trace 四条腿（handler:96/162/210/258）一律只挂 AuthContext。
 *   本 spec 按现状断非 admin 角色访问四枚读/写腿被 RBAC 拦成 403（FORBIDDEN 机器码，
 *   非 CSRF 拒绝码），并把缺深度防御这件事在断言语义里点名；若后端实际未拦该断言即判红，不放宽。
 *
 * 数据卫生：高危标记腿自建一个 is_system=false 的临时角色（专用 e254 marker 命名），
 * 只替换这一个角色的授予集（SoD 违例集刻意避开 create/approve 共存：read/export/print），
 * afterAll 删除该角色回收；不碰任何既有角色与其他 worker 的账号，避免把别人的授予整批抹掉。
 * 不可篡改腿纯读 + 方法探测，零写入。追溯腿只用不存在的主键探测，零写入。
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

type GrantDetail = {
  id?: number;
  resource_type: string;
  resource_id: number | null;
  action: string;
  allowed: boolean;
};

type AuditDetailBody = {
  base: AuditRow;
  before_snapshot: GrantDetail[] | unknown | null;
  after_snapshot: GrantDetail[] | unknown | null;
  old_value: unknown;
  new_value: unknown;
};

type RoleDetail = {
  id: number;
  name: string;
  code: string;
  is_system: boolean;
};

type TraceListBody = {
  traces: Array<Record<string, unknown>>;
  total: number;
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

async function findAuditRowById(page: import('@playwright/test').Page, id: number): Promise<AuditRow> {
  const list = await apiCall<AuditListBody>(page, 'GET', '/audit-logs?page_size=50');
  const row = list.data.items.find((it) => it.id === id);
  expect(row, `审计列表未回读到 id=${id} 的行（读腿被门拦或该行不在首页窗口）`).toBeTruthy();
  return row as AuditRow;
}

const createdRoleIds: number[] = [];

test.describe('254 审计高危标记与不可篡改配对', () => {
  test.afterAll(async ({ browser }) => {
    if (createdRoleIds.length === 0) return;
    const page = await browser.newPage();
    try {
      await loginViaUI(page);
      for (const roleId of createdRoleIds) {
        await apiCallExpectFail(page, 'DELETE', `/roles/${roleId}`).catch(() => undefined);
      }
    } finally {
      await page.close();
    }
  });

  test('高危动作单独标记：批量整批替换角色授予落审计为 WARN 且前后快照两向齐全', async ({
    page,
  }) => {
    await loginViaUI(page);
    const marker = `E254R${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const resourceType = `e254_probe_${marker}`;

    const created = await apiCall<RoleDetail>(page, 'POST', '/roles', {
      name: `e254-role-${marker}`,
      code: `e254_${marker}`,
      description: 'e2e 高危审计配对临时角色',
      is_system: false,
    });
    expect(typeof created.data.id).toBe('number');
    expect(created.data.id).toBeGreaterThan(0);
    expect(created.data.is_system, '自建角色必须非系统角色，否则整批替换会被拒').toBe(false);
    const roleId = created.data.id;
    createdRoleIds.push(roleId);

    // 第一笔：授予 read（before 为空集）
    const first = await apiCall<GrantDetail[]>(page, 'PUT', `/roles/${roleId}/permissions`, [
      { resource_type: resourceType, action: 'read', allowed: true },
    ]);
    expect(first.data.length).toBe(1);

    // 第二笔：整批替换为 read/export/print —— 同一 marker 资源，避开 create/approve 的 SoD 共存集
    const second = await apiCall<GrantDetail[]>(page, 'PUT', `/roles/${roleId}/permissions`, [
      { resource_type: resourceType, action: 'read', allowed: true },
      { resource_type: resourceType, action: 'export', allowed: true },
      { resource_type: resourceType, action: 'print', allowed: true },
    ]);
    expect(second.data.length).toBe(3);

    // record_async 为 best-effort 异步落库，两笔都要到位（有界轮询 20s，超时判红不静默）
    const resourceName = `role_id=${roleId} 批量整批替换角色级授予`;
    let rows: AuditRow[] = [];
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && rows.length < 2) {
      const list = await apiCall<AuditListBody>(
        page,
        'GET',
        `/audit-logs?operation_type=UPDATE&severity=WARN&resource_type=role_permission&resource_id=${roleId}&page_size=50`
      );
      rows = list.data.items.filter((it) => it.resource_name === resourceName);
      if (rows.length < 2) await page.waitForTimeout(1_000);
    }
    expect(rows.length, `20s 内未回读到 role_id=${roleId} 的两条批量替换审计行`).toBeGreaterThanOrEqual(
      2
    );

    // 在两条同名单行里定位「1 → 3」那一笔：靠快照基数，不靠时间序猜测
    let pair: { before: GrantDetail[]; after: GrantDetail[]; row: AuditRow } | undefined;
    for (const candidate of rows) {
      const detail = await apiCall<AuditDetailBody>(page, 'GET', `/audit-logs/${candidate.id}`);
      const before = detail.data.before_snapshot;
      const after = detail.data.after_snapshot;
      if (!Array.isArray(before) || !Array.isArray(after)) continue;
      if (before.length === 1 && after.length === 3) {
        pair = { before: before as GrantDetail[], after: after as GrantDetail[], row: candidate };
      }
    }
    expect(pair, '批量替换的 WARN 审计行必须同时带 1 条 before 与 3 条 after 授予快照').toBeTruthy();
    const hit = pair as { before: GrantDetail[]; after: GrantDetail[]; row: AuditRow };

    // 高危标记：severity 逐字符等于词表高危 token（models/audit_log.rs Self::Warn => "WARN"）
    expect(hit.row.severity, '高危写动作必须被单独标记为 WARN，不得混在 INFO 台账里').toBe('WARN');
    expect(hit.row.operation_type).toBe('UPDATE');
    expect(hit.row.resource_type).toBe('role_permission');
    expect(hit.row.resource_id).toBe(String(roleId));
    expect(hit.row.username, '审计行必须记录发起账号').toBe(testUsername());
    expect(hit.row.request_method).toBe('PUT');
    expect(hit.row.request_path).toBe(`/api/v1/erp/roles/${roleId}/permissions`);
    expect(hit.row.created_at, '审计时间列不得为空').toBeTruthy();
    expect(hit.row.description).toContain(String(roleId));
    // 批量计数由 service 统计口径外显（role_handler.rs）：read 保留、export/print 新增
    expect(hit.row.description).toMatch(/新增 2、更新 0、删除 0$/);

    // 前后值两向核对：变更前集合与变更后集合都可在同一行里读到，且 before ⊂ after
    expect(hit.before.length).toBe(1);
    expect(hit.before[0].resource_type).toBe(resourceType);
    expect(hit.before[0].action).toBe('read');
    expect(hit.after.length).toBe(3);
    const afterActions = hit.after.map((g) => g.action);
    expect(afterActions).toContain('read');
    expect(afterActions).toContain('export');
    expect(afterActions).toContain('print');
    for (const g of hit.before) {
      expect(
        hit.after.some((x) => x.resource_type === g.resource_type && x.action === g.action),
        'before 的每一项都必须原样存在于 after（整批替换未抹掉的既有授予）'
      ).toBe(true);
    }
    // marker 在前后两侧快照里都可见 = 变更前后内容确实同源同行可查
    const raw = JSON.stringify({ before: hit.before, after: hit.after });
    expect(raw).toContain(marker);

    // 旧字段别名族（old_value/new_value）按源码与推荐列同义，详情 DTO 一并外显
    const detail = await apiCall<AuditDetailBody>(page, 'GET', `/audit-logs/${hit.row.id}`);
    expect(JSON.stringify(detail.data.old_value ?? detail.data.before_snapshot)).toContain(marker);
    expect(JSON.stringify(detail.data.new_value ?? detail.data.after_snapshot)).toContain(marker);
  });

  test('审计不可篡改：八个写形态全 405，同 id 读回逐字段与四列快照深等值', async ({ page }) => {
    await loginViaUI(page);

    const list = await apiCall<AuditListBody>(page, 'GET', '/audit-logs?page_size=50');
    expect(Array.isArray(list.data.items)).toBe(true);
    expect(
      list.data.items.length,
      '审计台账为空则本用例无从取证，判红而非静默通过'
    ).toBeGreaterThan(0);
    const picked = list.data.items[0];
    expect(picked.id).toBeGreaterThan(0);

    const beforeRow = await findAuditRowById(page, picked.id);
    const beforeDetail = await apiCall<AuditDetailBody>(page, 'GET', `/audit-logs/${picked.id}`);

    // 已注册路径 + 未注册方法：路由存在性成立、方法兜底必为 405（改写入口不存在）
    const registeredPathProbes: Array<{ method: 'PUT' | 'PATCH' | 'DELETE'; path: string }> = [
      { method: 'PUT', path: `/audit-logs/${picked.id}` },
      { method: 'PATCH', path: `/audit-logs/${picked.id}` },
      { method: 'DELETE', path: `/audit-logs/${picked.id}` },
      { method: 'PUT', path: '/audit-logs' },
      { method: 'PATCH', path: '/audit-logs' },
      { method: 'DELETE', path: '/audit-logs' },
      { method: 'PATCH', path: '/audit-logs/export-logs' },
      { method: 'PUT', path: '/audit-logs/record-print' },
    ];
    for (const probe of registeredPathProbes) {
      const res = await apiCallExpectFail(page, probe.method, probe.path, {
        severity: 'INFO',
        description: 'e254-tamper-probe',
      });
      expect(
        res.status,
        `审计挂载面无 ${probe.method} ${probe.path} 注册，应 405（实际 ${res.status} body=${JSON.stringify(
          res
        ).slice(0, 200)}）`
      ).toBe(405);
    }

    // 第二道证据：探测扫过之后，同一行的每个字段与四列快照逐字节不变
    const afterRow = await findAuditRowById(page, picked.id);
    expect(afterRow, '审计行不得被任何写形态 API 变更').toEqual(beforeRow);
    const afterDetail = await apiCall<AuditDetailBody>(page, 'GET', `/audit-logs/${picked.id}`);
    expect(afterDetail.data, '审计详情的前后快照与旧字段别名亦不得被变更').toEqual(beforeDetail.data);
    expect(afterDetail.data.base.id).toBe(beforeRow.id);
  });

  test('访问门：非 admin 读审计/读汇总/写快照被拦，匿名会话三枚读腿 401', async ({ page }) => {
    await loginViaUI(page);
    const anyRow = await apiCall<AuditListBody>(page, 'GET', '/audit-logs?page_size=1');
    expect(anyRow.data.total).toBeGreaterThanOrEqual(0);

    // 非 admin：审计列表、审计详情、汇总（handler 无深度防御，只剩 RBAC 独木）、快照写腿
    await loginAsNonAdmin(page);
    const deniedList = await apiCallExpectFail(page, 'GET', '/audit-logs?page_size=1');
    expectDenied(deniedList, '非 admin 读取审计列表');

    const deniedDetail = await apiCallExpectFail(page, 'GET', `/audit-logs/${anyRow.data.items[0].id}`);
    expectDenied(deniedDetail, '非 admin 读取审计详情');

    const deniedSummary = await apiCallExpectFail(page, 'GET', '/audit-logs/summary');
    expectDenied(deniedSummary, '非 admin 读取审计汇总（audit_log_handler.rs 缺深度防御）');

    const deniedSnapshot = await apiCallExpectFail(
      page,
      'POST',
      `/business-trace/snapshot/E254-NONADMIN-${Date.now()}`
    );
    expectDenied(deniedSnapshot, '非 admin 写追溯快照');

    // 匿名：清 cookie 后直取，AuthContext 抽取失败必 401
    await page.context().clearCookies();
    for (const path of [
      '/audit-logs?page_size=1',
      '/audit-logs/summary',
      '/business-trace/forward?supplier_id=1&batch_no=E254',
    ]) {
      const anon = await apiCallExpectFail(page, 'GET', path);
      expect(anon.status, `未登录访问 ${path} 应 401`).toBe(401);
    }
  });

  test('追溯腿契约：快照腿真 404 存在性检查，两枚读腿缺参 400、不存在主键 200+空壳（缺陷点名）', async ({
    page,
  }) => {
    await loginViaUI(page);

    const ghostChain = `E254-NO-SUCH-TRACE-${Date.now()}${Math.floor(Math.random() * 1e6)}`;

    // 写侧：快照腿对不存在主键有真存在性检查（business_trace_service.rs）
    const snapshot = await apiCallExpectFail(page, 'POST', `/business-trace/snapshot/${ghostChain}`);
    expect(snapshot.status, `不存在主键写快照应 404，实际 ${snapshot.status}`).toBe(404);
    expect(failureCode(snapshot)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(snapshot.message).toContain('追溯链不存在');

    // 读侧两腿：必填维度缺失/类型非法直出 400
    const forwardMissing = await apiCallExpectFail(page, 'GET', '/business-trace/forward');
    expect(forwardMissing.status, '/forward 缺 supplier_id 与 batch_no 应 400').toBe(400);
    const forwardBadType = await apiCallExpectFail(
      page,
      'GET',
      '/business-trace/forward?supplier_id=not-an-int&batch_no=E254'
    );
    expect(forwardBadType.status, 'supplier_id 非 i32 应 400').toBe(400);

    const backwardMissing = await apiCallExpectFail(page, 'GET', '/business-trace/backward');
    expect(backwardMissing.status, '/backward 缺 customer_id 与 batch_no 应 400').toBe(400);
    const backwardBadType = await apiCallExpectFail(
      page,
      'GET',
      '/business-trace/backward?customer_id=not-an-int&batch_no=E254'
    );
    expect(backwardBadType.status, 'customer_id 非 i32 应 400').toBe(400);

    // 缸号维度：同一 batch_no 在供应商正向腿与客户反向腿上均无链时，现状为 200+空壳（应为 404 的
    // 缺陷形状，与快照腿的 404 形成不对称；252 只点名 backward，本用例把 forward 正腿一并钉住）
    const forwardGhost = await apiCall<TraceListBody>(
      page,
      'GET',
      '/business-trace/forward?supplier_id=999999999&batch_no=E254-NO-SUCH-BATCH'
    );
    expect(forwardGhost.message, '正向追溯文案逐字同源（business_trace_handler.rs）').toBe(
      '正向追溯完成'
    );
    expect(Array.isArray(forwardGhost.data.traces)).toBe(true);
    expect(forwardGhost.data.traces).toEqual([]);
    expect(forwardGhost.data.total).toBe(0);

    const backwardGhost = await apiCall<TraceListBody>(
      page,
      'GET',
      '/business-trace/backward?customer_id=999999999&batch_no=E254-NO-SUCH-BATCH'
    );
    expect(backwardGhost.message).toBe('反向追溯完成');
    expect(backwardGhost.data.traces).toEqual([]);
    expect(backwardGhost.data.total).toBe(0);

    // 读写两腿的 total 口径自洽：handler 以 traces.len() 作 total（handler:200-202 注释同源）
    expect(forwardGhost.data.total).toBe(forwardGhost.data.traces.length);
    expect(backwardGhost.data.total).toBe(backwardGhost.data.traces.length);
  });
});
