import { test, expect } from '../diagnose-fixture';
import { loginViaUI, loginAsRole, apiCallRaw, apiCallExpectFail, failureCode, API_BASE, API_PREFIX } from './helpers';

/**
 * 导出审批令牌链（号段 236）：申请 → 审批 → 一次性取回明文 → 导出放行 → 复用被拒
 *
 * 判据全部取自服务端源码，注释里的 文件:行号 就是断言依据，不是装饰。
 *
 * 七枚端点的真实形状（逐条对着 routes + handler 返回值确认）：
 * - POST /api/v1/erp/export-approvals            routes/system.rs:439 + export_approval_handler.rs:44
 *   出参 = detail_masked(masked_json)（handler:53 / service:1207,1316），键 = export_approval_request 模型字段名（snake_case），
 *   且 download_token / token_hash 被强制置 null（service:1320-1321）——明文只能经 token-once 取一次。
 * - GET  /api/v1/erp/export-approvals            handler:58   → {items,total,page,page_size}（handler:73-78），非 admin 被强制覆盖 applicant（handler:69）
 * - GET  /api/v1/erp/export-approvals/pending-for-me handler:84 → 同上信封，集合只含 pending / pending_l2（service:1225-1227）
 * - POST /api/v1/erp/export-inspections          export_inspection_routes.rs:14 + export_inspection_handler.rs:53
 * - GET  /api/v1/erp/export-inspections          export_inspection_routes.rs:12 → PaginatedResponse{items,total,page,page_size}（handler:16-36）
 * - GET  /api/v1/erp/export-inspections/certificates/{id}   export_inspection_routes.rs:26 + certificate_of_origin_handler.rs:28
 *   直接 `Json(json!(item))`，不套 ApiResponse 信封（与全站成功信封不一致，本文件钉成断言并列为发现项）。
 * - GET  /api/v1/erp/export-inspections/certificates/{id}/print export_inspection_routes.rs:39 + print_handler.rs:249
 *   → docx 二进制（print_handler.rs:255 docx_response），不是 JSON。
 *
 * 状态词表唯一事实来源 = 写入方 models/export_approval_request.rs:37-65（全小写）：
 * pending / pending_l2 / approved / rejected / expired / cancelled / consumed / exhausted。
 * 敏感资源清单与取值同源 models/export_approval_request.rs:222-242（customer/supplier/dye_recipe/price_list/finance_report/audit_log/product）。
 * 受理门四态文案同源 export_approval_service.rs：缺令牌 :848、无效令牌 :733 与 :750、
 * 非本人 :855、异资源 :861、非 approved :770、已使用 :764。三条不同拒因同时在场才证明令牌真被读。
 *
 * 一次性消费与防重放：导出成功后 record_download 置 status=consumed（service:1062），
 * 再次校验走 assert_token_consumable 的 consumed 分支（service:763-767）——本文件把它钉成复用必拒。
 */

/** 导出审批行的脱敏出参（NOT NULL 列不标可选，缺键即判红） */
interface ApprovalRow {
  id: number;
  applicant_user_id: number;
  applicant_username: string;
  resource_type: string;
  file_format: string;
  status: string;
  approval_level: number;
  risk_level: string;
  token_viewed: boolean;
  token_consumed: boolean;
  download_count: number;
  max_downloads: number;
  download_token?: string | null;
  token_hash?: string | null;
  token_fingerprint?: string | null;
}
interface ApprovalPage {
  items: ApprovalRow[];
  total: number;
  page: number;
  page_size: number;
}
/** GET /{id}/token-once 出参（handler:202-213 两态） */
interface TokenOncePayload {
  available: boolean;
  message: string;
  token?: string;
  fingerprint?: string;
}

const STATUS_PENDING = 'pending'; // export_approval_request.rs:41
const STATUS_APPROVED = 'approved'; // export_approval_request.rs:43
const STATUS_CONSUMED = 'consumed'; // export_approval_request.rs:47
const IN_FLIGHT = [STATUS_PENDING, 'pending_l2']; // service:1225-1227 待办集合

const MSG_NO_TOKEN = '敏感资源导出需先获得导出审批令牌'; // export_approval_service.rs:848
const MSG_BAD_TOKEN = '下载令牌无效'; // :733 空/未命中 与 :750 历史行回退未命中
const MSG_CONSUMED = '导出令牌已被使用（状态 consumed），一次性令牌禁止复用'; // :764-767
const MSG_RESOURCE_MISMATCH = '导出令牌资源类型不匹配'; // :861-864
const MSG_NOT_APPROVED = '不可下载'; // :770-773

/**
 * 功能：直连 GET 并把响应体按 JSON 解析成给定类型，同时带回真实状态码。
 * 调用方：本文件的受理门归因、脱敏外发核验、证书详情与失败信封取证腿。
 * 入参：page 与 /api/v1/erp 之后的路径（含查询串）。
 * 传给谁：page.request.get（沿用 worker 会话 cookie），解析结果交调用方断言。
 * 存什么：不落库，只读。
 * 存哪里：不适用。解析失败一律抛错并带上状态码与原文片段，不做静默兜底。
 */
async function getJson<T>(page: import('@playwright/test').Page, pathWithQuery: string): Promise<{ status: number; body: T }> {
  const res = await page.request.get(`${API_BASE}${API_PREFIX}${pathWithQuery}`);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch (e) {
    throw new Error(`GET ${pathWithQuery} 响应不是合法 JSON（status=${res.status()}）：${text.slice(0, 200)}，原因 ${(e as Error).message}`);
  }
  console.log(`[236] GET ${pathWithQuery} → status=${res.status()}`);
  return { status: res.status(), body };
}

/**
 * 功能：取二进制备体（xlsx/docx 腿），用于容器魔数与内容类型判定。
 * 调用方：审计日志导出放行腿、产地证打印腿。
 * 入参：page 与 /api/v1/erp 之后的路径。
 * 传给谁：page.request.get，返回的状态/头/字节交调用方断言。
 * 存什么：不落库，只读。
 * 存哪里：不适用。
 */
async function getRawBytes(page: import('@playwright/test').Page, pathWithQuery: string) {
  const res = await page.request.get(`${API_BASE}${API_PREFIX}${pathWithQuery}`);
  const buf = await res.body();
  console.log(`[236] GET ${pathWithQuery} → status=${res.status()} bytes=${buf.length} ct=${res.headers()['content-type'] ?? ''}`);
  return { status: res.status(), headers: res.headers(), buf };
}

/** 申请一张审批单并返回脱敏行（六要素见 create_request：service:148-210） */
async function createApproval(
  page: import('@playwright/test').Page,
  resourceType: string,
  estimatedRows: number
): Promise<ApprovalRow> {
  return apiCallRaw<ApprovalRow>(page, 'POST', '/export-approvals', {
    resource_type: resourceType,
    export_params: {},
    estimated_rows: estimatedRows,
    file_format: 'xlsx',
  });
}

test.describe('P236 导出审批令牌链与商检记录/产地证出参形状', () => {
  test('匿名与越权档：未登录 401，非审批角色办不了审批腿', async ({ page, browser }) => {
    // 匿名腿用独立新建上下文，不复用 worker 会话，避免 storageState 带 cookie 变成假绿
    const anon = await browser.newContext();
    for (const path of ['/export-approvals?page=1&page_size=1', '/export-approvals/pending-for-me', '/export-inspections?page=1&page_size=1']) {
      const res = await anon.request.get(`${API_BASE}${API_PREFIX}${path}`);
      expect(res.status(), `未登录 GET ${path} 应 401，实际 ${res.status()}`).toBe(401);
      const body = await res.json();
      expect(
        typeof body.code === 'string' && body.code.length > 0,
        `未登录 ${path} 的拒绝体必须是带字符串机器码的 AppError 信封，实际：${JSON.stringify(body).slice(0, 200)}`
      ).toBe(true);
    }
    await anon.close();

    // manager 未被授予 export-approvals:approve（init_service_ops/permission.rs 的键清单里
    // export-approvals 只有 create/read，见 :448-449），审批腿必须被权限门拦掉
    await loginViaUI(page, undefined, undefined, true);
    const row = await createApproval(page, 'audit_log', 10);
    expect(row.status, `新建申请初始状态应为 ${STATUS_PENDING}，实际 ${row.status}`).toBe(STATUS_PENDING);

    await loginAsRole(page, 'manager');
    const denied = await apiCallExpectFail(page, 'POST', `/export-approvals/${row.id}/approve`, { comments: '越权尝试' });
    expect(denied.status, `manager 审批导出申请应 403（缺 export-approvals:approve），实际 ${denied.status}`).toBe(403);
    expect(String(denied.message ?? '').length, 'manager 越权拒绝原因为空文案，不可外显').toBeGreaterThan(0);

    // 越权未生效：回读申请行仍是 pending，没有被非审批人改成 approved
    await loginViaUI(page, undefined, undefined, true);
    const detail = await apiCallRaw<ApprovalRow>(page, 'GET', `/export-approvals/${row.id}`);
    expect(detail.status, `manager 越权后申请行状态应仍是 ${STATUS_PENDING}（实际 ${detail.status}＝越权写库成功）`).toBe(STATUS_PENDING);
    console.log(`[236] 越权档：manager approve=${denied.status}"${denied.message}"，回读状态=${detail.status}`);
  });

  test('主干因果链：申请→台账与待我审批回读→审批通过→令牌一次性取回→导出放行→复用被拒', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);

    // 1 申请（低风险单节点）
    const created = await createApproval(page, 'audit_log', 10);
    expect(created.id, '申请出参 id 为空或为 0').toBeGreaterThan(0);
    expect(created.resource_type, `出参 resource_type 应逐字回显 audit_log，实际 ${created.resource_type}`).toBe('audit_log');
    expect(created.applicant_username, '出参 applicant_username 为空（建单人未取会话）').toBeTruthy();
    expect(String(created.applicant_username).length, '出参 applicant_username 长度 0').toBeGreaterThan(0);
    expect(created.file_format, `出参 file_format 应为规范化的 xlsx（service:224-234），实际 ${created.file_format}`).toBe('xlsx');
    expect(created.approval_level, `低风险（<1000 行）审批层级应为 1（service:142-144），实际 ${created.approval_level}`).toBe(1);
    expect(String(created.risk_level).length, '出参 risk_level 为空').toBeGreaterThan(0);
    expect(created.status, `初始状态应为 ${STATUS_PENDING}，实际 ${created.status}`).toBe(STATUS_PENDING);
    // 脱敏门：列表/详情侧永不外发凭据原文（masked_json service:1320-1321）
    expect(created.download_token ?? null, `脱敏出参 download_token 应为 null，实际 ${JSON.stringify(created.download_token)}`).toBeNull();
    expect(created.token_hash ?? null, '脱敏出参 token_hash 应为 null（哈希不外发）').toBeNull();

    // 2 审批台账可回读到该条
    const ledger = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals?page=1&page_size=100&resource_type=audit_log');
    expect(Array.isArray(ledger.items), `台账出参 items 应为数组，实际 ${JSON.stringify(ledger).slice(0, 160)}`).toBe(true);
    expect(ledger.total, `台账 total(${ledger.total}) 应至少包含本次新建的 1 条`).toBeGreaterThanOrEqual(1);
    const ledgerRow = ledger.items.find(r => r.id === created.id);
    expect(ledgerRow, `台账未回读到新建申请 id=${created.id}（写入与读取不同源）`).toBeDefined();
    expect(ledgerRow as ApprovalRow, '台账行的资源类型应与申请时一致').toHaveProperty('resource_type', 'audit_log');
    expect(ledgerRow as ApprovalRow, '台账行的状态应与详情一致').toHaveProperty('status', STATUS_PENDING);
    expect(ledgerRow?.download_token ?? null, '台账侧 download_token 出现明文＝脱敏漂移').toBeNull();

    // 3 待我审批可回读（在途集合含 pending/pending_l2，service:1225-1227）
    const pendingPage = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals/pending-for-me?page=1&page_size=100');
    expect(Array.isArray(pendingPage.items), 'pending-for-me 出参 items 不是数组').toBe(true);
    const inPending = pendingPage.items.some(r => r.id === created.id);
    expect(inPending, `新建 pending 申请未出现在 pending-for-me（id=${created.id}，共 ${pendingPage.items.length} 条）`).toBe(true);

    // 4 未通过的令牌不可用于导出：token-once 只认 approved（service:692-695）
    const tooEarly = await apiCallExpectFail(page, 'GET', `/export-approvals/${created.id}/token-once`);
    expect(tooEarly.status, `pending 阶段取令牌应被拒，实际 ${tooEarly.status}`).not.toBe(200);
    expect(tooEarly.status, `pending 阶段取令牌不得 5xx（真实失败被掩盖），实际 ${tooEarly.status}`).toBeLessThan(500);

    // 5 审批通过（一级终审，同一请求内同步补回写，service:340-345）
    const approved = await apiCallRaw<ApprovalRow>(page, 'POST', `/export-approvals/${created.id}/approve`, { comments: 'e2e 令牌链' });
    expect(approved.status, `一级审批后状态应落 ${STATUS_APPROVED}，实际 ${approved.status}`).toBe(STATUS_APPROVED);

    // 6 状态流转有回读：approved 后必须从待办集合消失
    const afterApprove = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals/pending-for-me?page=1&page_size=100');
    expect(
      afterApprove.items.some(r => r.id === created.id),
      `申请 id=${created.id} 已 approved 却仍在 pending-for-me 中＝待办集合与状态漂移`
    ).toBe(false);

    // 7 一次性取回明文
    const firstView = await apiCallRaw<TokenOncePayload>(page, 'GET', `/export-approvals/${created.id}/token-once`);
    expect(firstView.available, `首次 token-once 应 available=true，实际出参 ${JSON.stringify(firstView).slice(0, 200)}`).toBe(true);
    expect(typeof firstView.token, `token 字段类型应为 string，实际 ${typeof firstView.token}`).toBe('string');
    expect(String(firstView.token).length, 'token-once  returned 空明文').toBeGreaterThan(0);
    const token = String(firstView.token);
    const secondView = await apiCallRaw<TokenOncePayload>(page, 'GET', `/export-approvals/${created.id}/token-once`);
    expect(secondView.available, '第二次 token-once 仍回明文＝一次性凭据承诺失效').toBe(false);
    expect(secondView.token ?? null, `第二次调用不得再带 token，实际 ${JSON.stringify(secondView.token)}`).toBeNull();
    expect(String(secondView.message ?? '').length, '第二次调用应给出可外显的引导文案').toBeGreaterThan(0);

    // 8 真令牌放行导出腿（受理门全绿：本人 + 同资源 + 范围一致）
    const okExport = await getRawBytes(page, `/audit-logs/export?download_token=${encodeURIComponent(token)}`);
    expect(okExport.status, `合法令牌导出审计日志应 200，实际 ${okExport.status} ct=${okExport.headers['content-type']}`).toBe(200);
    expect(
      okExport.headers['content-type'] ?? '',
      `放行腿应返回 xlsx 二进制，实际 ct=${okExport.headers['content-type']}`
    ).toContain('spreadsheetml');
    expect(okExport.buf.length, '放行腿返回零字节体（只有信封没有内容）').toBeGreaterThan(0);

    // 9 防重放：消费后回读 consumed，且同一令牌复用必被拒（service:1062 + :763-767）
    const consumedRow = await apiCallRaw<ApprovalRow>(page, 'GET', `/export-approvals/${created.id}`);
    expect(consumedRow.status, `导出成功后申请行状态应落 ${STATUS_CONSUMED}（record_download），实际 ${consumedRow.status}`).toBe(STATUS_CONSUMED);
    expect(consumedRow.token_consumed, 'token_consumed 标记未随消费置真').toBe(true);
    const replay = await getJson<{ code?: unknown; message?: string }>(
      page,
      `/audit-logs/export?download_token=${encodeURIComponent(token)}`
    );
    expect(replay.status, `已消费令牌复用不得 200，实际 ${replay.status}`).not.toBe(200);
    expect(
      replay.body.message ?? '',
      `复用拒因应逐字同源 service:764-767，实际：${JSON.stringify(replay.body).slice(0, 200)}`
    ).toContain(MSG_CONSUMED);
    console.log(`[236] 令牌链闭环：申请#${created.id} → 通过 → 一次性取回 → 放行 200 → 复用 ${replay.status}"${replay.body.message}"`);
  });

  test('受理门三条拒因互不相同：缺令牌 / 伪令牌 / 异资源令牌，且与放行态对照', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);

    const missing = await getJson<{ message?: string }>(page, '/audit-logs/export');
    expect(missing.status, `无令牌导出应 403（fail-closed），实际 ${missing.status}`).toBe(403);
    expect(missing.body.message ?? '', `缺令牌拒因应逐字同源 :848，实际：${missing.body.message}`).toContain(MSG_NO_TOKEN);

    const bogus = await getJson<{ message?: string }>(page, '/audit-logs/export?download_token=e2e236-not-a-real-token');
    expect(bogus.status, `伪造令牌应 403，实际 ${bogus.status}`).toBe(403);
    expect(
      bogus.body.message ?? '',
      `伪令牌拒因必须不同于"缺令牌"文案，否则说明令牌根本没被读，实际：${bogus.body.message}`
    ).not.toContain(MSG_NO_TOKEN);
    expect(bogus.body.message ?? '', `伪令牌拒因应逐字同源 :733/:750，实际：${bogus.body.message}`).toContain(MSG_BAD_TOKEN);

    // 异资源合法令牌打本端点：走通哈希与本人门后卡在资源比对（:860-864）
    const priceReq = await createApproval(page, 'price_list', 10);
    expect(priceReq.status, `price_list 申请初始应为 ${STATUS_PENDING}，实际 ${priceReq.status}`).toBe(STATUS_PENDING);
    const priceApproved = await apiCallRaw<ApprovalRow>(page, 'POST', `/export-approvals/${priceReq.id}/approve`, { comments: 'e2e 异资源配对' });
    expect(priceApproved.status, `price_list 一级审批后应 ${STATUS_APPROVED}，实际 ${priceApproved.status}`).toBe(STATUS_APPROVED);
    const priceToken = String((await apiCallRaw<TokenOncePayload>(page, 'GET', `/export-approvals/${priceReq.id}/token-once`)).token);
    expect(priceToken.length, 'price_list 令牌取回为空').toBeGreaterThan(0);

    const cross = await getJson<{ message?: string }>(page, `/audit-logs/export?download_token=${encodeURIComponent(priceToken)}`);
    expect(cross.status, `合法但异资源的令牌打审计日志导出不得 200，实际 ${cross.status}`).not.toBe(200);
    expect(
      cross.body.message ?? '',
      `异资源拒因应点名资源类型不匹配（:861），且不得与缺令牌/伪令牌文案混同，实际：${cross.body.message}`
    ).toContain(MSG_RESOURCE_MISMATCH);
    expect(cross.body.message ?? '', '异资源拒因不应退化成缺令牌文案').not.toContain(MSG_NO_TOKEN);
    expect(cross.body.message ?? '', '异资源拒因不应退化成无效令牌文案').not.toContain(MSG_BAD_TOKEN);

    // 被驳回的申请其令牌不可下载（:770-773）——与放行态形成正反对照
    const rejectedReq = await createApproval(page, 'audit_log', 10);
    const rejected = await apiCallRaw<ApprovalRow>(page, 'POST', `/export-approvals/${rejectedReq.id}/reject`, { comments: 'e2e 驳回对照' });
    expect(rejected.status, `驳回后状态应落 rejected，实际 ${rejected.status}`).toBe('rejected');
    const afterReject = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals/pending-for-me?page=1&page_size=100');
    expect(
      afterReject.items.some(r => r.id === rejectedReq.id),
      `驳回后 id=${rejectedReq.id} 仍留在待办集合＝状态流转没有回读`
    ).toBe(false);
    const rejectedToken = await apiCallExpectFail(page, 'GET', `/export-approvals/${rejectedReq.id}/token-once`);
    expect(rejectedToken.status, `驳回件取令牌应被拒（非 approved），实际 ${rejectedToken.status}`).not.toBe(200);
    expect(rejectedToken.message ?? '', `驳回件拒因应点名"不可下载"态（:770），实际：${rejectedToken.message}`).toContain(MSG_NOT_APPROVED);
    console.log(
      `[236] 受理门归因：缺令牌="${missing.body.message}" 伪令牌="${bogus.body.message}" 异资源="${cross.body.message}" 驳回件="${rejectedToken.message}"`
    );
  });

  test('二级审批链：高风险双节点申请在途期间不得发令牌，待办集合与状态保持一致', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);

    const high = await createApproval(page, 'customer', 5000);
    expect(high.approval_level, `高风险（>=1000 行）审批层级应为 2（service:142-144,238-252），实际 ${high.approval_level}`).toBe(2);
    expect(high.status, `新建高风险申请初始应为 ${STATUS_PENDING}，实际 ${high.status}`).toBe(STATUS_PENDING);

    const ledger = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals?page=1&page_size=100&resource_type=customer');
    expect(ledger.items.some(r => r.id === high.id), `台账未回读高风险申请 id=${high.id}`).toBe(true);

    // 一级通过不终结流程时，行仍待在途集合；终结则落 approved。两种真态都不允许跳到终态之外的值
    const afterL1 = await apiCallRaw<ApprovalRow>(page, 'POST', `/export-approvals/${high.id}/approve`, { comments: 'e2e 一级' });
    expect(
      [STATUS_APPROVED, ...IN_FLIGHT],
      `一级审批后状态必须落在写入方词表的可推进集合内，实际 ${afterL1.status}（词表见 export_approval_request.rs:37-65）`
    ).toContain(afterL1.status);

    const pending = await apiCallRaw<ApprovalPage>(page, 'GET', '/export-approvals/pending-for-me?page=1&page_size=100');
    const membership = pending.items.some(r => r.id === high.id);
    expect(membership, `待办集合成员判定与状态不一致：status=${afterL1.status} 在待办=${membership}`).toBe(
      IN_FLIGHT.includes(afterL1.status)
    );

    if (afterL1.status === STATUS_APPROVED) {
      // 一级即终审（单节点流程定义）：令牌应可一次性取回
      const view = await apiCallRaw<TokenOncePayload>(page, 'GET', `/export-approvals/${high.id}/token-once`);
      expect(view.available, `已 approved 却取不到令牌明文`).toBe(true);
      expect(String(view.token ?? '').length, 'approved 态 token-once 明文为空').toBeGreaterThan(0);
    } else {
      // 仍在途：任何时刻都不得外发可用凭据（service:692-695）
      const early = await apiCallExpectFail(page, 'GET', `/export-approvals/${high.id}/token-once`);
      expect(early.status, `在途（${afterL1.status}）取令牌不得 200，实际 ${early.status}`).not.toBe(200);
      expect(early.status, `在途取令牌不得 5xx，实际 ${early.status}`).toBeLessThan(500);
      expect(early.message ?? '', `在途取令牌应点名状态不可下载，实际：${early.message}`).toContain(MSG_NOT_APPROVED);
      // 用这枚尚未签发的凭据形状去打导出腿必然不是放行
      const notYet = await getJson<{ message?: string }>(page, '/audit-logs/export?download_token=e2e236-not-issued-yet');
      expect(notYet.status, `未签发凭据不得放行，实际 ${notYet.status}`).toBe(403);
    }
    console.log(`[236] 二级链：approval_level=${high.approval_level} 一级后 status=${afterL1.status} 在待办=${membership}`);
  });

  test('商检记录与产地证：建单门、分页信封四键、证书详情绕过信封与打印 docx 二进制形状', async ({ page }) => {
    const noToken = await getJson<{ message?: string }>(page, '/audit-logs/export');
    expect(noToken.status, '商检腿前置：受理门基线（缺令牌 403）应成立').toBe(403);

    // 列表腿：全站唯一分页信封 PaginatedResponse{items,total,page,page_size}
    const list = await apiCallRaw<{ items: Array<{ id: number; inspection_no?: string; sales_order_id?: number }>; total: number; page: number; page_size: number }>(
      page,
      'GET',
      '/export-inspections?page=1&page_size=10'
    );
    expect(Array.isArray(list.items), `商检列表 items 应为数组，实际 ${JSON.stringify(list).slice(0, 160)}`).toBe(true);
    expect(typeof list.total, `商检列表缺 total 键或类型错（分页信封漂移）：${JSON.stringify(list).slice(0, 160)}`).toBe('number');
    expect(list.page, `商检列表 page 应回显入参 1，实际 ${list.page}`).toBe(1);
    expect(list.page_size, `商检列表 page_size 应回显入参 10，实际 ${list.page_size}`).toBe(10);

    // 建单腿缺必填：必须是可读业务拒绝（400），绝不能 5xx，也绝不能 2xx
    const emptyBody = await apiCallExpectFail(page, 'POST', '/export-inspections', {});
    expect(emptyBody.status, `空体建单应 400（必填缺失），实际 ${emptyBody.status}`).toBe(400);
    expect(failureCode(emptyBody), '空体建单的拒绝体缺少字符串机器码').toBeTruthy();
    expect(String(emptyBody.message ?? '').length, '空体建单拒绝原因为空').toBeGreaterThan(0);

    // 建单腿引用不存在的外键：必须映射成业务拒绝，不得 200 造孤儿，也不得裸抛 500
    const orphan = await apiCallExpectFail(page, 'POST', '/export-inspections', {
      inspection_no: `E2E236-${Date.now()}`,
      sales_order_id: 2147483001,
      product_name: 'e2e 商检配对坯布',
      hs_code: '5208310000',
      inspection_type: 'pre_export',
      inspection_agency: 'e2e 机构',
      inspection_date: '2026-03-01',
      remarks: 'e2e 外键门配对',
    });
    expect(
      orphan.status,
      `引用不存在销售订单的建单不得 2xx（销售订单外键未被拦截会留下孤儿商检行），实际 ${orphan.status}`
    ).toBeGreaterThanOrEqual(400);
    expect(orphan.status, `外键拒绝不得裸抛 5xx（真实失败被掩盖），实际 ${orphan.status}`).toBeLessThan(500);
    expect(failureCode(orphan), '外键拒绝体缺少字符串机器码（AppError 信封漂移）').toBeTruthy();

    // 证书集合腿：handler 只回 {items,total}，与全站分页信封不一致（发现项，钉成断言）
    const inspectionId = list.items.length > 0 ? list.items[0].id : 1;
    const certList = await getJson<{ items?: unknown[]; total?: number; page?: unknown; page_size?: unknown }>(
      page,
      `/export-inspections/${inspectionId}/certificates?page=1&page_size=10`
    );
    expect(certList.status, `证书集合腿出现 5xx（服务错误），实际 ${certList.status}`).toBeLessThan(500);
    if (certList.status === 200) {
      expect(Array.isArray(certList.body.items), `证书集合出参 items 应为数组，实际 ${JSON.stringify(certList.body).slice(0, 160)}`).toBe(true);
      expect(typeof certList.body.total, '证书集合出参缺 total 键').toBe('number');
      expect(certList.body.page, '证书集合出现了 page 键（与 handler certificate_of_origin_handler.rs:13-24 不符，需重新定性）').toBeUndefined();
      expect(certList.body.page_size, '证书集合出现了 page_size 键（同上）').toBeUndefined();
      console.log(`[236] 证书集合 inspection_id=${inspectionId} total=${certList.body.total}（无 page/page_size，信封漂移已钉住）`);
    } else {
      expect(typeof certList.body.code === 'string', `证书集合非 200 时应给 AppError 信封，实际：${JSON.stringify(certList.body).slice(0, 160)}`).toBe(true);
      console.log(`[236] 证书集合 inspection_id=${inspectionId} status=${certList.status} code=${String(certList.body.code)}`);
    }

    // 详情腿与打印腿：先试真实存在的证书记录，取不到就用不存在的 id 把失败态钉住
    const candidateId =
      certList.status === 200 && Array.isArray(certList.body.items) && certList.body.items.length > 0
        ? Number((certList.body.items[0] as { id?: number }).id)
        : 2147483001;
    const detail = await getJson<Record<string, unknown>>(page, `/export-inspections/certificates/${candidateId}`);
    if (candidateId === 2147483001) {
      expect(detail.status, `不存在证书应被拒且非 2xx，实际 ${detail.status}`).not.toBe(200);
      expect(detail.status, `不存在证书不得 5xx，实际 ${detail.status}`).toBeLessThan(500);
      expect(typeof detail.body.code === 'string', '不存在证书拒绝体缺字符串机器码').toBe(true);
      console.log(`[236] 证书详情无可用记录（inspection_id=${inspectionId} 下 0 条），已按不存在态钉住拒绝信封`);
    } else {
      // handler 直出模型，不套 ApiResponse：成功体没有 code/message/data 三键（发现项）
      expect(detail.status, `存在证书详情应 200，实际 ${detail.status}`).toBe(200);
      expect(detail.body.id, `证书详情回读的 id 应等于请求路径 id=${candidateId}，实际 ${JSON.stringify(detail.body).slice(0, 160)}`).toBe(candidateId);
      expect('code' in detail.body, '证书详情竟带 code 键（说明该腿已改回统一信封，需同步本断言与前端消费面）').toBe(false);
    }

    const print = await getRawBytes(page, `/export-inspections/certificates/${candidateId}/print`);
    if (candidateId === 2147483001) {
      expect(print.status, `不存在证书的打印腿不得 200，实际 ${print.status}`).not.toBe(200);
      expect(print.status, `不存在证书打印不得 5xx，实际 ${print.status}`).toBeLessThan(500);
    } else {
      expect(print.status, `产地证打印应 200，实际 ${print.status}`).toBe(200);
      expect(
        print.headers['content-type'] ?? '',
        `打印腿应回 docx MIME（print_handler.rs:255 docx_response），实际 ${print.headers['content-type']}`
      ).toContain('wordprocessingml');
      expect(print.buf.length, '打印腿返回零字节 docx').toBeGreaterThan(0);
      expect(print.buf.readUInt16LE(0), `docx 应以 zip 魔数 PK 开头，实际 ${print.buf.subarray(0, 2).toString('hex')}`).toBe(0x4b50);
    }
  });
});
