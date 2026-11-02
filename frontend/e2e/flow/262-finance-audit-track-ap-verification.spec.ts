import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
  type ApiFailureBody,
} from './helpers';

/**
 * 262 财务审计轨迹族 子账报表 应付自动核销 会计期间年结 的真实契约配对
 *
 * 覆盖端点（全部相对 baseURL=/api/v1/erp 书写）
 * GET  /finance/audit/search 审计轨迹检索
 * GET  /finance/audit/stats 审计轨迹统计
 * POST /finance/audit/track 写入一条审计轨迹
 * GET  /finance/reports/subsidiary-ledger 子账（明细账）报表
 * POST /ap/verifications/auto 应付自动核销
 * POST /finance/accounting-periods/year-end-closing 会计期间年结
 *
 * 判据来源（逐段读后端源，非推测）。
 * 路由装配 backend/src/routes/finance.rs，审计族 finance_audit_routes（/audit/track /audit/stats
 * /audit/search），报表族 finance_report_routes（/reports/subsidiary-ledger），
 * 期间族 accounting_period_routes（/accounting-periods/year-end-closing），
 * 应付族 ap_verification_routes（/ap/verifications/auto，经 routes/mod.rs 的
 * `nest("/api/v1/erp", finance::sub_routes())` 落在 erp 根前缀下）。
 *
 * 审计族（handlers/omni_audit_handler.rs）。
 * track_event（:56）把入参交给 omni_audit_service.rs 的 log()，落库映射为
 * module=event_type（:207）与 action=event_name（:208），即请求体里的 resource 与
 * action 两键不参与落库（只进 HMAC 签名材料），description 恒为 NULL（:212 取消息体的
 * description，而 track_event 构造时写死 None）。检索 search_logs（:150）按
 * event_type 参数精确过滤 module 列，keyword 参数只 ILIKE description、resource_name、
 * username 三列。因此本 spec 的唯一 marker 埋在 event_type（落 module 列）而不是
 * description，写后回读按 module 精确取回自己那一行，逐列对表 username、user_id、
 * trace_id、duration_ms、response_status、created_at 与写入值，替代"列表非空"式假绿。
 * status 列经 SUCCESS、FAILED、DENIED 映射为 200、500、403（omni_audit_service.rs:219-227），
 * duration_ms 缺省记 0。
 * 统计 get_dashboard_stats（:109）单条 SQL 出四键，其中 ui_clicks_today 判据是
 * request_method IS NULL、api_calls_today 判据是 request_method IS NOT NULL，
 * 二者对 total_events_today 构成严格二分，故 total==ui+api 是恒等式而非巧合，
 * 本 spec 断该恒等式并断自埋 marker 行带来的自增量（该行 request_method 为 NULL，
 * 必计入 ui_clicks）。并发请求会同时写审计行，自增只断下界不断等值。
 * 检索信封漂移按现状钉：search_logs 出参只有 items 与 total 两键，没有分页词表的
 * page 与 page_size（omni_audit_handler.rs:196 的 json! 字面量），故本 spec 断
 * 键集合恰为 items,total，不改成迁就 PaginatedResponse 的四键判据。
 *
 * 审计族拒绝腿通道。字段长度门走 validator，经 utils/error.rs:719-723 的
 * From<ValidationErrors> 转 validation_displayable，无自定义 message 时文案由
 * :739 的 `字段名: 规则码` 生成，可逐字符外显。payload 超 10KB 走
 * validation_displayable 固定文案（omni_audit_handler.rs:69）。三类拒绝码同为
 * VALIDATION_ERROR，只有文案不同，本 spec 逐条断文案而不是只断状态码。
 *
 * 子账报表（handlers/finance_report_handler.rs:186 加 services/finance_report_service.rs:645）。
 * 出参为 SubsidiaryLedger（models/dto/finance_report_dto.rs:133）七键
 * dimension_type、dimension_value、entries、total_debit、total_credit、period_start、
 * period_end，行结构为 SubsidiaryLedgerEntry（:118）十键。total_debit 与 total_credit
 * 由 build_subsidiary_entries 对 entries 逐行累加得到，故"合计等于明细求和"是本族的
 * 钩稽恒等式，对空集与非空集同时成立，本 spec 按出参自身求和断等值而非断常量。
 * 维度取值词表以写入方 apply_dimension_filter（:683）为准，CUSTOMER、SUPPLIER、
 * DEPARTMENT 为大写，dimension_value 非数字与未知 dimension_type 两支都落到
 * `Err(_) => query` 与 :696 的 `_ => query`，即静默不加过滤条件（缺陷见下方点名）。
 * 该 handler 无 AuthContext 抽取器，鉴权只靠全局 auth_middleware（bootstrap/
 * middleware_bootstrap.rs:259 注册在 csrf 与 permission 之外层），所以未登录腿必 401。
 *
 * 应付自动核销（handlers/ap_verification_handler.rs:96 加 services/ap_verification_service.rs:45）。
 * 自动核销先把该供应商未核销应付单与已确认付款单按到期日贪心配对，配对集为空即
 * `AppError::business("没有可核销的应付单和付款单")`（:59）。本 spec 为本 worker 新建专属
 * 供应商并只挂一张手工应付单，付款单侧恒为空集，因此拒绝腿是确定性的（不依赖库内他人数据）。
 * 拒绝发生在事务提交之前，txn 被丢弃即回滚，故断三件前后态：该供应商核销列表 total 前后同为 0、
 * 应付单未核销余额 unpaid_amount 前后逐分位相同、paid_amount 加 unpaid_amount 恒等于 amount。
 * 成功面（真正生成核销记录并让余额递减）需要同时存在未核销应付单与状态为已确认的付款单，
 * 后者要走过付款单确认流程，非本 spec 可确定性造出，故成功面缺口如实写明于本段，
 * 不在测试侧把被拒腿包装成核销成功。
 * AutoVerifyRequest（:92）没有实现 Validate，缺 supplier_id 死在 axum Json 抽取层，
 * 由 middleware/trace_context.rs 的 normalize_extractor_rejection 收口为
 * 400 加 VALIDATION_ERROR 加固定公开规则文案。
 * 未核销发票与付款单两腿缺 supplier_id 走 AppError::bad_request（:191 与 :219），
 * public_message 收敛为固定「请求参数错误」（utils/error.rs:853 加 utils/messages.rs:46）。
 *
 * 年结（handlers/accounting_period_handler.rs:81 加 services/accounting_period_service.rs:217）。
 * year 是 Query 必填 i32，缺 ?year 即 400 加 VALIDATION_ERROR 加固定公开规则文案。
 * 第一步校验该年度期间数为 12，不满即 AppError::business（:230），真实拒因
 * 「年结失败：年度 N 仅有 K 个期间，需 12 个月完整」被收敛为通用「业务处理失败」；
 * 第二步逐期间要求状态全为 CLOSED（:238），同走 business 通道。年结成功面需要一个
 * 十二期齐全且全部 CLOSED 的年度，库内不保证存在（写成功还会插入次年第 01 期，
 * 属不可回退的写操作），故本 spec 用零期间的远期年度取确定性拒绝腿，并断期间集合
 * 总数前后不变以证明被拒时零半截写（无新期间、无结转凭证）。
 *
 * 查出的后端缺陷（按现状钉桩，不改源码，不改判据方向）。
 * D1 handlers/omni_audit_handler.rs:78-90 与 services/omni_audit_service.rs:207-212，
 *    track 入参的 resource 与 action 两键不落库（module 取 event_type、action 取 event_name），
 *    调用方以为报了资源与动作，检索面永远取不到，本 spec 断 resource_type、resource_id、
 *    resource_name 与 action 的实际落库形态把该错位钉住。
 * D2 services/omni_audit_service.rs:212 加 handlers/omni_audit_handler.rs:78-90，
 *    track 写入的 description 恒 NULL，而 search_logs 的 keyword 只过滤 description、
 *    resource_name、username，导致 UI 埋点族自己写的内容无法被关键词检索命中，
 *    本 spec 以"marker 作 keyword 检索 total 恒 0"钉住该现状。
 * D3 handlers/omni_audit_handler.rs:196，search 出参缺 page 与 page_size，
 *    与 PaginatedResponse（utils/response.rs:34）四键词表不一致，前端分页控件拿不到回显页码。
 * D4 services/omni_audit_service.rs:242 的 log() 是 fire-and-forget tokio::spawn，
 *    且写入失败只记 error 日志（:152-156）不返回调用方，track 恒回 200，
 *    落库与否调用方无从判断，本 spec 用带界轮询回读把真实落库结果作为判据。
 * D5 handlers/omni_audit_handler.rs:56 的 track_event 没有 require_admin_role 门
 *    （:18-35 只挂在 stats 与 search 两腿），任何登录用户都能伪造审计轨迹条目写入。
 * D6 services/finance_report_service.rs:696 的 `_ => query` 与 :686、:693 的
 *    `Err(_) => query`，未知 dimension_type 与非数字 dimension_value 一律静默降级为
 *    不加过滤的全量取数，既不报错也不收窄，跨维度数据可被读穿，本 spec 钉该现状并点名。
 * D7 services/ap_verification_service.rs:59 与 services/accounting_period_service.rs:230、:238
 *    走 AppError::business 通道，拒因只到调用方眼前一句「业务处理失败」，
 *    年结的"缺几个月"与核销的"缺付款单"这类可操作信息全部丢失。
 * D8 handlers/ap_verification_handler.rs:92 的 AutoVerifyRequest 未实现 Validate，
 *    supplier_id 非法值（如 0 或负数）不进参数门，只会以零命中进入配对再被拒。
 *
 * 假绿防线。每个写腿为本 worker 另建专属供应商，使按 supplier_id 过滤的列表与聚合出口只有
 * 我自己的行，绝对值与空集都能直接断言；审计 marker 每次现生成，回读按 module 精确过滤；
 * 金额折成分位整数比较，绕开 Decimal 序列化成数字还是字符串的形态差异；缺键与类型异常一律
 * 显式抛错点名列名，不用 ?? 与默认值兜底。权限档覆盖未登录 401 六腿各一次并在同一用例内
 * 回读证明零半截写，非授权角色 403 覆盖审计读面两腿（该两腿的 403 由 handler 自身
 * require_admin_role 保证，与被 permission_middleware 拒绝同码同文案，结论不受影响）。
 */

/** 后端固定公开规则文案（utils/error.rs:881-882 REQUEST_DECODING_PUBLIC 字面量） */
const REQUEST_DECODING_PUBLIC =
  '请求格式不正确：请求体或查询参数存在缺失的必填字段、字段类型错误或内容类型错误，请修正后重试';
/** business 通道收敛后的通用文案（utils/messages.rs:43） */
const BUSINESS_PUBLIC = '业务处理失败';
/** bad_request 通道收敛后的通用文案（utils/messages.rs:46） */
const BAD_REQUEST_PUBLIC = '请求参数错误';
/** permission_denied 通道收敛后的通用文案（utils/messages.rs:47） */
const PERMISSION_PUBLIC = '无权限';

type Json = Record<string, unknown>;

interface AuditSearchPage {
  items: AuditLogRow[];
  total: number;
}

interface AuditLogRow {
  id: number;
  trace_id: string;
  user_id: number;
  username: string;
  module: string;
  action: string;
  resource_type: string;
  resource_id: string;
  resource_name: string;
  description: string;
  request_method: string;
  request_path: string;
  response_status: number;
  duration_ms: number;
  created_at: string;
}

interface AuditStats {
  total_events_today: number;
  ui_clicks_today: number;
  api_calls_today: number;
  security_alerts_today: number;
}

interface SubsidiaryLedgerEntry {
  business_date: string;
  business_no: string;
  business_type: string;
  subject_code: string;
  subject_name: string;
  summary: string | null;
  debit: number | string;
  credit: number | string;
  customer_id: number | null;
  supplier_id: number | null;
}

interface SubsidiaryLedger {
  dimension_type: string;
  dimension_value: string;
  entries: SubsidiaryLedgerEntry[];
  total_debit: number | string;
  total_credit: number | string;
  period_start: string;
  period_end: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

interface SupplierRow {
  id: number;
  supplier_name?: string;
}

interface ApInvoiceRow {
  id: number;
  invoice_no: string;
  supplier_id: number;
  amount: number | string;
  paid_amount: number | string;
  unpaid_amount: number | string;
  invoice_status: string;
}

interface PeriodRow {
  id: number;
}

/** 金额列折成分位整数：只容后端 Decimal 序列化出的数字或字符串，其余形态显式抛错点名 */
function toCents(value: unknown, column: string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(
      `${column} 出参形态异常：${typeof value}（后端 Decimal 应序列化为数字或字符串）`
    );
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${column} 出参不可解析为金额：${String(value)}`);
  }
  return Math.round(parsed * 100);
}

function requireId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 未取回有效主键，实际出参：${String(JSON.stringify(value))}`);
  }
  return value;
}

/** 本 worker 会话内唯一的审计 marker：只容小写字母与数字，避免 URL 编码与 SQL 通配歧义 */
function auditMarker(label: string): string {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0')}`;
  const marker = `e262${label}${tag}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (marker.length > 60) {
    throw new Error(`审计 marker 超出后端 event_type 的 64 字符上限：${marker.length}`);
  }
  console.log(`[262] 自埋审计 marker（${label}）：${marker}`);
  return marker;
}

function utcDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** 审计检索：按 module 精确过滤，出参即 search_logs 的 items,total 两键体 */
async function searchAudit(page: Page, module: string): Promise<AuditSearchPage> {
  const path = `/finance/audit/search?event_type=${encodeURIComponent(module)}&page=1&page_size=100`;
  const res = await apiCall<AuditSearchPage>(page, 'GET', path);
  if (res.code !== 200 || !res.data) {
    throw new Error(
      `审计检索 ${module} 失败：code=${String(res.code)} message=${String(res.message)}`
    );
  }
  return res.data;
}

/**
 * 带界轮询等审计行落库。omni_audit_service.rs:242 的 log() 是 fire-and-forget spawn，
 * 写失败只记日志不回错，故回读超时必须是显式失败而不是"取不到就当没有"。
 */
async function waitForAuditRow(page: Page, module: string): Promise<AuditSearchPage> {
  const deadline = Date.now() + 20_000;
  let last: AuditSearchPage = { items: [], total: 0 };
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    last = await searchAudit(page, module);
    if (last.items.length > 0) {
      console.log(
        `[262] 审计行已落库 module=${module}，第 ${attempt} 次回读命中 total=${last.total}`
      );
      return last;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(
    `写后 20 秒内未回读到 module=${module} 的审计行（回读 ${attempt} 次，最后 total=${String(last.total)}）。` +
      '缺陷面：track 恒回 200，落库失败仅记 error 日志（omni_audit_service.rs:152-156、:242）'
  );
}

/** 未登录取数：清空本 test 上下文的会话 cookie 后直连接口（context 每用例新建，不污染其它用例） */
async function fetchAnonymous(
  page: Page,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; json: ApiFailureBody }> {
  await page.context().clearCookies();
  const res = await page.request.fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    data: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: ApiFailureBody = {};
  try {
    json = JSON.parse(text) as ApiFailureBody;
  } catch {
    console.warn(
      `[262] 匿名 ${method} ${path} 返回非 JSON，status=${res.status()} 前 120 字符：${text.slice(0, 120)}`
    );
  }
  console.log(
    `[262] 匿名 ${method} ${path} → status=${res.status()} code=${String(failureCode(json))}`
  );
  return { status: res.status(), json };
}

/** 失败体统一形状自检：字符串机器码之外还必须有 trace_id 与 timestamp（AppError 唯一形状） */
function assertErrorEnvelope(
  json: ApiFailureBody,
  expectedCode: string,
  expectedMessage: string,
  label: string
): void {
  expect(failureCode(json), `${label} 失败体机器码`).toBe(expectedCode);
  expect(json.message, `${label} 拒因文案`).toBe(expectedMessage);
  expect(json.trace_id, `${label} 失败体缺 trace_id`).toMatch(/^[0-9a-f]{32}$/);
  expect(json.timestamp, `${label} 失败体缺 timestamp`).toBeDefined();
}

async function createDedicatedSupplier(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E财务262-${tag}`,
    supplier_short_name: `E262${tag.slice(-4)}`,
    contact_phone: '13800000002',
  });
  const id = requireId(created.id, `专属供应商 ${tag}`);
  console.log(`[262] 专属供应商 ${tag} 主键 ${id}`);
  return id;
}

test.describe.serial('262 财务审计轨迹与子账报表 应付核销与年结契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('262-01 审计轨迹 track 写后按自埋 marker 回读逐列对表，检索信封与 keyword 面钉现状', async ({
    page,
  }) => {
    const marker = auditMarker('trk');
    const eventName = `${marker}evt`;
    const resourceSent = `${marker}res`;
    const actionSent = `${marker}act`;
    const sessionUser = testUsername();

    const tracked = await apiCall<null>(page, 'POST', '/finance/audit/track', {
      event_type: marker,
      event_name: eventName,
      resource: resourceSent,
      action: actionSent,
      payload: { marker, seq: 1 },
      duration_ms: 321,
      status: 'SUCCESS',
    });
    expect(tracked.code, 'track 应返回 200 信封').toBe(200);
    expect(tracked.data, 'track 出参体为 ApiResponse<()>，即空体').toBeNull();
    expect(tracked.message, 'track 不带文案（ApiResponse::success 的 message 为 None）').toBeNull();

    const found = await waitForAuditRow(page, marker);
    expect(found.total, 'marker 精确过滤后 total 至少覆盖自埋这一行').toBeGreaterThanOrEqual(1);
    expect(found.items.length, 'marker 过滤出的每一行都必须是本用例写入的 module').toBeGreaterThan(
      0
    );
    const row = found.items[0];
    expect(
      found.items.every(item => item.module === marker),
      '检索按 event_type 过滤 module 列，返回集不得混入他人行'
    ).toBe(true);

    expect(row.module, '落库 module 必须逐字符等于写入的 event_type').toBe(marker);
    expect(row.action, '落库 action 列取的是 event_name 而非请求的 action（缺陷 D1）').toBe(
      eventName
    );
    expect(row.username, '落库 username 必须是本 worker 会话账号').toBe(sessionUser);
    expect(row.user_id, '落库 user_id 必须是正整数主键').toBeGreaterThan(0);
    expect(row.trace_id, 'track 把本次请求 trace 归到审计行，应为 32 位小写 hex').toMatch(
      /^[0-9a-f]{32}$/
    );
    expect(row.duration_ms, 'duration_ms 应逐值落库').toBe(321);
    expect(row.response_status, 'status=SUCCESS 映射为 response_status 200').toBe(200);
    expect(row.created_at, 'created_at 应按 handler 的 %Y-%m-%d %H:%M:%S 格式化输出').toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
    );
    expect(
      row.description,
      'track_event 恒不写 description（缺陷 D2），空串兜底自 get_opt_string'
    ).toBe('');
    expect(row.resource_type, 'track_event 的 resource_type 恒为 NULL，出参空串').toBe('');
    expect(row.resource_id, 'track_event 的 resource_id 恒为 NULL，出参空串').toBe('');
    expect(row.resource_name, 'track_event 的 resource_name 恒为 NULL，出参空串').toBe('');
    expect(row.request_method, '手动埋点行无请求方法，出参空串（统计面据此计入 ui_clicks）').toBe(
      ''
    );
    expect(row.request_path, '手动埋点行无请求路径，出参空串').toBe('');

    const envelopeKeys = Object.keys(row).sort().join(',');
    expect(
      envelopeKeys,
      '检索行键集合必须等于 build_select_fields 未含敏感列时的 15 列（omni_audit_handler.rs:270-276）'
    ).toBe(
      'action,created_at,description,duration_ms,id,module,request_method,request_path,resource_id,resource_name,resource_type,response_status,trace_id,user_id,username'
    );

    const pageKeys = Object.keys(found).sort().join(',');
    expect(pageKeys, '检索信封只出 items,total 两键（缺陷 D3，分页四键在此不成立）').toBe(
      'items,total'
    );

    const byKeyword = await apiCall<AuditSearchPage>(
      page,
      'GET',
      `/finance/audit/search?keyword=${encodeURIComponent(marker)}&page=1&page_size=100`
    );
    expect(byKeyword.code, 'keyword 检索应成功返回').toBe(200);
    expect(
      byKeyword.data?.total,
      'marker 只落在 module 列，keyword 三列（description/resource_name/username）覆盖不到埋点内容（缺陷 D2）'
    ).toBe(0);

    const absent = auditMarker('gone');
    const noneFound = await searchAudit(page, absent);
    expect(noneFound.total, '从未写入过的 marker 必须 0 命中，证明过滤真实生效').toBe(0);
    expect(noneFound.items.length, '空集出空数组而不是补一行零值').toBe(0);

    const statusDenied = await apiCall<null>(page, 'POST', '/finance/audit/track', {
      event_type: marker,
      event_name: `${marker}denied`,
      resource: resourceSent,
      action: actionSent,
      duration_ms: 0,
      status: 'DENIED',
    });
    expect(statusDenied.code, 'DENIED 埋点同样应 200').toBe(200);
    const deniedFound = await waitForAuditRow(page, marker);
    const deniedRow = deniedFound.items.find(item => item.action === `${marker}denied`);
    if (!deniedRow) {
      throw new Error(
        `DENIED 埋点行未回读到，marker=${marker} 的返回集：${JSON.stringify(deniedFound.items.map(i => i.action))}`
      );
    }
    expect(deniedRow.response_status, 'status=DENIED 必须映射为 response_status 403').toBe(403);
    expect(deniedRow.duration_ms, 'duration_ms 缺省时后端记 0 而不是 NULL').toBe(0);
    console.log(`[262] 审计轨迹写后回读闭环完成，marker=${marker} 共 ${deniedFound.total} 行`);
  });

  test('262-02 审计统计三项分区恒等与自埋行自增闭环', async ({ page }) => {
    const before = await apiCall<AuditStats>(page, 'GET', '/finance/audit/stats');
    expect(before.code, '统计面应 200').toBe(200);
    if (!before.data) {
      throw new Error('统计面出参为空，AuditStats 四键缺失');
    }
    const b = before.data;
    for (const key of [
      'total_events_today',
      'ui_clicks_today',
      'api_calls_today',
      'security_alerts_today',
    ] as const) {
      expect(typeof b[key], `统计键 ${key} 必须是数字（AuditStats i64 序列化）`).toBe('number');
      expect(Number.isFinite(b[key]), `统计键 ${key} 不可为 NaN`).toBe(true);
    }
    expect(
      Object.keys(b).sort().join(','),
      '统计出参键集合必须等于 AuditStats 四键（services/omni_audit_query_service.rs:21-27）'
    ).toBe('api_calls_today,security_alerts_today,total_events_today,ui_clicks_today');
    expect(
      b.total_events_today,
      '近 24 小时总量必须等于 UI 埋点与接口调用二分之和（同一 SQL 快照，恒等式）'
    ).toBe(b.ui_clicks_today + b.api_calls_today);
    expect(
      b.security_alerts_today,
      '安全告警是 403 与 5xx 子集，不可能超过总量'
    ).toBeLessThanOrEqual(b.total_events_today);

    const marker = auditMarker('stat');
    const tracked = await apiCall<null>(page, 'POST', '/finance/audit/track', {
      event_type: marker,
      event_name: `${marker}evt`,
      resource: 'e2e262',
      action: 'e2e262',
      payload: { marker },
      duration_ms: 12,
      status: 'SUCCESS',
    });
    expect(tracked.code, '统计闭环的埋点应 200').toBe(200);

    const found = await waitForAuditRow(page, marker);
    expect(found.items[0].request_method, '埋点行 request_method 为空，必计入 ui_clicks 分区').toBe(
      ''
    );

    const after = await apiCall<AuditStats>(page, 'GET', '/finance/audit/stats');
    if (!after.data) {
      throw new Error('统计面回读为空');
    }
    const a = after.data;
    expect(
      a.total_events_today,
      '自埋 marker 行已落库，总量必须至少比埋点前多这一行（并发请求只会再加不会减）'
    ).toBeGreaterThanOrEqual(b.total_events_today + 1);
    expect(
      a.ui_clicks_today,
      '自埋 marker 行 request_method 为 NULL，UI 埋点分区必须至少自增 1'
    ).toBeGreaterThanOrEqual(b.ui_clicks_today + 1);
    expect(a.api_calls_today, '接口调用分区只增不减').toBeGreaterThanOrEqual(b.api_calls_today);
    expect(a.security_alerts_today, '安全告警分区只增不减').toBeGreaterThanOrEqual(
      b.security_alerts_today
    );
    expect(a.total_events_today, '自增后二分恒等式仍须逐值成立，否则四键不是同一快照').toBe(
      a.ui_clicks_today + a.api_calls_today
    );
    console.log(
      `[262] 统计闭环 marker=${marker} total ${b.total_events_today}→${a.total_events_today}，ui ${b.ui_clicks_today}→${a.ui_clicks_today}`
    );
  });

  test('262-03 审计 track 参数门：长度越界 超 10KB 缺键三类拒绝码与逐字文案', async ({ page }) => {
    const overLong = await apiCallExpectFail(page, 'POST', '/finance/audit/track', {
      event_type: 'e262overlengtheventtypewhichismuchlongerthansixtyfourcharacters1234567890',
      event_name: 'ok',
      resource: 'ok',
      action: 'ok',
    });
    expect(overLong.status, 'event_type 超 64 字符应 400').toBe(400);
    assertErrorEnvelope(
      overLong,
      APP_ERROR_CODES.VALIDATION_ERROR,
      'event_type: length',
      'event_type 长度门'
    );

    const payloadTooBig = await apiCallExpectFail(page, 'POST', '/finance/audit/track', {
      event_type: 'e262payload',
      event_name: 'ok',
      resource: 'ok',
      action: 'ok',
      payload: { blob: 'x'.repeat(11_000) },
    });
    expect(payloadTooBig.status, 'payload 超 10KB 应 400').toBe(400);
    assertErrorEnvelope(
      payloadTooBig,
      APP_ERROR_CODES.VALIDATION_ERROR,
      'payload 超过 10KB 上限',
      'payload 体积门'
    );

    const missingKey = await apiCallExpectFail(page, 'POST', '/finance/audit/track', {
      event_name: 'ok',
      resource: 'ok',
      action: 'ok',
    });
    expect(missingKey.status, '缺 event_type 应死在 Json 抽取层并收口为 400').toBe(400);
    assertErrorEnvelope(
      missingKey,
      APP_ERROR_CODES.VALIDATION_ERROR,
      REQUEST_DECODING_PUBLIC,
      'event_type 必填门'
    );

    const marker = auditMarker('gate');
    const negativeProbe = await searchAudit(page, 'event_type');
    expect(negativeProbe.total, '字面量 event_type 不是任何真实 module，应 0 命中').toBe(0);
    const rejectedProbe = await searchAudit(page, marker);
    expect(
      rejectedProbe.total,
      '三条被拒的埋点请求不得留下任何审计行（半截写反查，marker 从未成功提交）'
    ).toBe(0);
    console.log(`[262] 审计参数门三条拒绝均零落库，探针 marker=${marker}`);
  });

  test('262-04 子账报表：专属供应商空集与合计明细钩稽 未知维度不过滤钉现状 缺参与未登录拒绝', async ({
    page,
  }) => {
    const supplierId = await createDedicatedSupplier(page, 'sub');
    const start = utcDate(-120);
    const end = utcDate(0);
    const qs = `start_date=${start}&end_date=${end}`;

    const ledger = await apiCall<SubsidiaryLedger>(
      page,
      'GET',
      `/finance/reports/subsidiary-ledger?dimension_type=SUPPLIER&dimension_value=${supplierId}&${qs}`
    );
    expect(ledger.code, '子账报表应 200').toBe(200);
    if (!ledger.data) {
      throw new Error('子账报表出参为空，SubsidiaryLedger 七键缺失');
    }
    const led = ledger.data;
    expect(
      Object.keys(led).sort().join(','),
      '出参键集合必须等于 SubsidiaryLedger 七键（models/dto/finance_report_dto.rs:133-141）'
    ).toBe(
      'dimension_type,dimension_value,entries,period_end,period_start,total_credit,total_debit'
    );
    expect(led.dimension_type, '维度类型必须逐字符回显入参（写入方词表大写 SUPPLIER）').toBe(
      'SUPPLIER'
    );
    expect(led.dimension_value, '维度值必须原样回显入参字符串').toBe(String(supplierId));
    expect(led.period_start, '期间起必须回显入参日期').toBe(start);
    expect(led.period_end, '期间止必须回显入参日期').toBe(end);
    expect(Array.isArray(led.entries), 'entries 必须是数组').toBe(true);
    expect(
      led.entries.length,
      '专属供应商名下无辅助核算记录，空集必须出空数组（不是补一行零值）'
    ).toBe(0);

    const debitSum = led.entries.reduce((sum, e) => sum + toCents(e.debit, 'entries.debit'), 0);
    const creditSum = led.entries.reduce((sum, e) => sum + toCents(e.credit, 'entries.credit'), 0);
    expect(
      toCents(led.total_debit, 'total_debit'),
      '借方合计必须等于明细逐行求和（钩稽恒等式）'
    ).toBe(debitSum);
    expect(
      toCents(led.total_credit, 'total_credit'),
      '贷方合计必须等于明细逐行求和（钩稽恒等式）'
    ).toBe(creditSum);

    const unknown = await apiCall<SubsidiaryLedger>(
      page,
      'GET',
      `/finance/reports/subsidiary-ledger?dimension_type=NOT_A_DIMENSION&dimension_value=abc&${qs}`
    );
    expect(
      unknown.code,
      '未知 dimension_type 与非数字 dimension_value 不报错（缺陷 D6 现状）'
    ).toBe(200);
    if (!unknown.data) {
      throw new Error('未知维度腿出参为空');
    }
    expect(unknown.data.dimension_type, '未知维度类型仍原样回显').toBe('NOT_A_DIMENSION');
    expect(
      unknown.data.entries.length,
      '未知维度降级为不过滤全量取数，行数不可能少于专属供应商过滤集（缺陷 D6）'
    ).toBeGreaterThanOrEqual(led.entries.length);
    const uDebitSum = unknown.data.entries.reduce(
      (sum, e) => sum + toCents(e.debit, 'entries.debit'),
      0
    );
    const uCreditSum = unknown.data.entries.reduce(
      (sum, e) => sum + toCents(e.credit, 'entries.credit'),
      0
    );
    expect(
      toCents(unknown.data.total_debit, '未知维度 total_debit'),
      '全量腿同样必须满足借方合计等于明细求和，否则合计与明细不同源'
    ).toBe(uDebitSum);
    expect(
      toCents(unknown.data.total_credit, '未知维度 total_credit'),
      '全量腿同样必须满足贷方合计等于明细求和'
    ).toBe(uCreditSum);
    if (unknown.data.entries.length > 0) {
      const first = unknown.data.entries[0];
      expect(
        Object.keys(first).sort().join(','),
        '行键集合必须等于 SubsidiaryLedgerEntry 十键（models/dto/finance_report_dto.rs:118-129）'
      ).toBe(
        'business_date,business_no,business_type,credit,customer_id,debit,subject_code,subject_name,summary,supplier_id'
      );
    }

    const missingDim = await apiCallExpectFail(
      page,
      'GET',
      `/finance/reports/subsidiary-ledger?dimension_value=${supplierId}&${qs}`
    );
    expect(missingDim.status, '缺 dimension_type 应死在 Query 抽取层并收口为 400').toBe(400);
    assertErrorEnvelope(
      missingDim,
      APP_ERROR_CODES.VALIDATION_ERROR,
      REQUEST_DECODING_PUBLIC,
      'dimension_type 必填门'
    );

    const anon = await fetchAnonymous(
      page,
      'GET',
      `/finance/reports/subsidiary-ledger?dimension_type=SUPPLIER&dimension_value=${supplierId}&${qs}`
    );
    expect(
      anon.status,
      '未登录取子账报表必须 401（该 handler 无 AuthContext 抽取器，全靠全局鉴权中间件）'
    ).toBe(401);
    expect(failureCode(anon.json), '未登录机器码').toBe('UNAUTHORIZED');

    await loginViaUI(page, testUsername(), testPassword(), true);
    const stillEmpty = await apiCall<SubsidiaryLedger>(
      page,
      'GET',
      `/finance/reports/subsidiary-ledger?dimension_type=SUPPLIER&dimension_value=${supplierId}&${qs}`
    );
    expect(stillEmpty.data?.entries.length, '被拒的匿名读没有改动任何数据，专属供应商仍空集').toBe(
      0
    );
    console.log(`[262] 子账报表三态配对完成，供应商 ${supplierId}`);
  });

  test('262-05 应付自动核销：无付款单配对被拒 零半截写 发票未核销余额前后不变', async ({
    page,
  }) => {
    const supplierId = await createDedicatedSupplier(page, 'apv');
    const amount = '1234.56';
    const invoice = await apiCallRaw<ApInvoiceRow>(page, 'POST', '/ap/invoices', {
      supplier_id: supplierId,
      invoice_type: 'PURCHASE',
      invoice_date: utcDate(0),
      due_date: utcDate(30),
      amount,
      tax_amount: '0.00',
      notes: 'E2E262 自动核销拒绝腿专用',
    });
    const invoiceId = requireId(invoice.id, '应付单建单');
    console.log(`[262] 专属应付单 ${invoiceId}（供应商 ${supplierId}）`);

    const before = await apiCallRaw<ApInvoiceRow>(page, 'GET', `/ap/invoices/${invoiceId}`);
    expect(before.supplier_id, '应付单归属必须回显建单入参').toBe(supplierId);
    expect(toCents(before.amount, 'amount'), '票面金额必须逐分位等于建单入参').toBe(
      toCents(amount, 'amount')
    );
    expect(
      toCents(before.paid_amount, 'paid_amount') + toCents(before.unpaid_amount, 'unpaid_amount'),
      '已付加未付必须等于票面金额（核销前钩稽恒等式）'
    ).toBe(toCents(before.amount, 'amount'));
    const unpaidBefore = toCents(before.unpaid_amount, 'unpaid_amount');
    expect(typeof before.invoice_status, 'invoice_status 必须是后端写入的状态字符串').toBe(
      'string'
    );

    const unverifiedInvoices = await apiCallRaw<ApInvoiceRow[]>(
      page,
      'GET',
      `/ap/verifications/unverified/invoices?supplier_id=${supplierId}`
    );
    expect(Array.isArray(unverifiedInvoices), '未核销应付单出口必须是数组').toBe(true);
    for (const row of unverifiedInvoices) {
      expect(row.supplier_id, '未核销应付单过滤必须生效，不得混入他人供应商行').toBe(supplierId);
      expect(
        toCents(row.unpaid_amount, 'unpaid_amount') > 0,
        `未核销出口只应出 unpaid_amount 大于 0 的行，实际 ${JSON.stringify(row.unpaid_amount)}`
      ).toBe(true);
    }

    const unverifiedPayments = await apiCallRaw<Json[]>(
      page,
      'GET',
      `/ap/verifications/unverified/payments?supplier_id=${supplierId}`
    );
    expect(Array.isArray(unverifiedPayments), '未核销付款单出口必须是数组').toBe(true);
    expect(
      unverifiedPayments.length,
      '专属供应商名下没有付款单，配对源一侧恒为空集（拒绝腿的确定性前提）'
    ).toBe(0);

    const listBefore = await apiCallRaw<Paginated<Json>>(
      page,
      'GET',
      `/ap/verifications?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(listBefore.total, '核销前列表 total 必须为 0').toBe(0);
    expect(listBefore.items.length, '核销前列表必须空数组').toBe(0);

    const rejected = await apiCallExpectFail(page, 'POST', '/ap/verifications/auto', {
      supplier_id: supplierId,
    });
    expect(rejected.status, '无可配对单据应 400').toBe(400);
    assertErrorEnvelope(
      rejected,
      APP_ERROR_CODES.BUSINESS_ERROR,
      BUSINESS_PUBLIC,
      '自动核销空配对门'
    );
    console.log(
      '[262] 自动核销被拒（真实拒因「没有可核销的应付单和付款单」被 business 通道收敛，缺陷 D7）'
    );

    const after = await apiCallRaw<ApInvoiceRow>(page, 'GET', `/ap/invoices/${invoiceId}`);
    expect(
      toCents(after.unpaid_amount, 'unpaid_amount'),
      '被拒的核销不得改动未核销余额（前后逐分位等值）'
    ).toBe(unpaidBefore);
    expect(
      toCents(after.paid_amount, 'paid_amount') + toCents(after.unpaid_amount, 'unpaid_amount'),
      '被拒后票面与已付未付的钩稽恒等式仍须成立'
    ).toBe(toCents(after.amount, 'amount'));

    const listAfter = await apiCallRaw<Paginated<Json>>(
      page,
      'GET',
      `/ap/verifications?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(listAfter.total, '被拒的核销不得留下核销单主表行（半截写反查）').toBe(0);
    expect(listAfter.items.length, '被拒后核销列表仍须空数组').toBe(0);
    expect(listAfter.page, '核销列表分页信封回显页码').toBe(1);
    expect(listAfter.page_size, '核销列表分页信封回显每页条数').toBe(20);

    const missingSupplier = await apiCallExpectFail(page, 'POST', '/ap/verifications/auto', {});
    expect(missingSupplier.status, '缺 supplier_id 应 400').toBe(400);
    assertErrorEnvelope(
      missingSupplier,
      APP_ERROR_CODES.VALIDATION_ERROR,
      REQUEST_DECODING_PUBLIC,
      'supplier_id 必填门'
    );

    const noFilter = await apiCallExpectFail(page, 'GET', '/ap/verifications/unverified/invoices');
    expect(noFilter.status, '未核销应付单缺 supplier_id 应 400').toBe(400);
    assertErrorEnvelope(
      noFilter,
      APP_ERROR_CODES.BAD_REQUEST,
      BAD_REQUEST_PUBLIC,
      '未核销应付单必填门'
    );

    const anonAuto = await fetchAnonymous(page, 'POST', '/ap/verifications/auto', {
      supplier_id: supplierId,
    });
    expect(anonAuto.status, '未登录自动核销必须 401 且先于 CSRF 与权限层').toBe(401);
    expect(failureCode(anonAuto.json), '未登录机器码').toBe('UNAUTHORIZED');

    await loginViaUI(page, testUsername(), testPassword(), true);
    const afterAnon = await apiCallRaw<Paginated<Json>>(
      page,
      'GET',
      `/ap/verifications?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(afterAnon.total, '未登录被拒的核销写没有落任何核销单（半截写反查）').toBe(0);
    const afterAnonInvoice = await apiCallRaw<ApInvoiceRow>(
      page,
      'GET',
      `/ap/invoices/${invoiceId}`
    );
    expect(
      toCents(afterAnonInvoice.unpaid_amount, 'unpaid_amount'),
      '未登录被拒的核销写没有扣减发票余额'
    ).toBe(unpaidBefore);
    console.log(`[262] 应付自动核销拒绝腿与前后态钩稽配对完成，应付单 ${invoiceId}`);
  });

  test('262-06 年结：零期间年度被拒 期间集合总数不变 缺 year 参数门', async ({ page }) => {
    const periodsBefore = await apiCallRaw<PeriodRow[]>(page, 'GET', '/finance/accounting-periods');
    expect(Array.isArray(periodsBefore), '期间列表出参必须是数组（Vec<AccountingPeriodDto>）').toBe(
      true
    );
    const countBefore = periodsBefore.length;

    const rejected = await apiCallExpectFail(
      page,
      'POST',
      '/finance/accounting-periods/year-end-closing?year=2099'
    );
    expect(rejected.status, '年度 2099 无任何期间，年结应 400').toBe(400);
    assertErrorEnvelope(rejected, APP_ERROR_CODES.BUSINESS_ERROR, BUSINESS_PUBLIC, '年结期间数门');
    console.log(
      '[262] 年结被拒（真实拒因「仅有 0 个期间，需 12 个月完整」被 business 通道收敛，缺陷 D7）'
    );

    const periodsAfter = await apiCallRaw<PeriodRow[]>(page, 'GET', '/finance/accounting-periods');
    expect(
      periodsAfter.length,
      '被拒的年结不得插入次年第 01 期或写任何结转凭证（期间总数前后等值）'
    ).toBe(countBefore);

    const rejectedAgain = await apiCallExpectFail(
      page,
      'POST',
      '/finance/accounting-periods/year-end-closing?year=2099'
    );
    expect(rejectedAgain.status, '同一年度重复请求年结的拒绝形态必须可重入一致').toBe(400);
    expect(failureCode(rejectedAgain), '重复拒绝机器码一致').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const missingYear = await apiCallExpectFail(
      page,
      'POST',
      '/finance/accounting-periods/year-end-closing'
    );
    expect(missingYear.status, '缺 ?year 应死在 Query 抽取层并收口为 400').toBe(400);
    assertErrorEnvelope(
      missingYear,
      APP_ERROR_CODES.VALIDATION_ERROR,
      REQUEST_DECODING_PUBLIC,
      'year 必填门'
    );

    const anonClosing = await fetchAnonymous(
      page,
      'POST',
      '/finance/accounting-periods/year-end-closing?year=2098'
    );
    expect(anonClosing.status, '未登录年结必须 401').toBe(401);
    expect(failureCode(anonClosing.json), '未登录机器码').toBe('UNAUTHORIZED');

    await loginViaUI(page, testUsername(), testPassword(), true);
    const periodsFinal = await apiCallRaw<PeriodRow[]>(page, 'GET', '/finance/accounting-periods');
    expect(periodsFinal.length, '未登录被拒的年结没有写任何期间（期间总数仍等于基线）').toBe(
      countBefore
    );
    console.log(`[262] 年结拒绝腿与期间集合不变性配对完成，期间总数 ${countBefore}`);
  });

  test('262-07 权限档：非 admin 角色审计读面 403 且被拒面零可见数据', async ({ page }) => {
    await loginAsRole(page, 'accountant');

    const stats = await apiCallExpectFail(page, 'GET', '/finance/audit/stats');
    expect(stats.status, '审计统计仅限 code=admin，非 admin 必 403').toBe(403);
    assertErrorEnvelope(stats, APP_ERROR_CODES.FORBIDDEN, PERMISSION_PUBLIC, '统计面 admin 门');

    const search = await apiCallExpectFail(
      page,
      'GET',
      '/finance/audit/search?page=1&page_size=20'
    );
    expect(search.status, '审计检索仅限 code=admin，非 admin 必 403').toBe(403);
    assertErrorEnvelope(search, APP_ERROR_CODES.FORBIDDEN, PERMISSION_PUBLIC, '检索面 admin 门');

    console.log(
      '[262] 非 admin 两读腿均 403 FORBIDDEN，本角色对审计底表零可见（缺口：track 写腿无 admin 门，缺陷 D5；两腿为只读，拒绝即无写入）'
    );
  });

  test('262-08 权限档：六腿未登录全部 401 且被拒后回读零半截写', async ({ page }) => {
    const supplierId = await createDedicatedSupplier(page, 'anon');
    const marker = auditMarker('anon');

    const periodsBefore = await apiCallRaw<PeriodRow[]>(page, 'GET', '/finance/accounting-periods');
    const listBefore = await apiCallRaw<Paginated<Json>>(
      page,
      'GET',
      `/ap/verifications?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(listBefore.total, '匿名写探针前，专属供应商核销列表 total 为 0').toBe(0);

    const legs: Array<{ method: 'GET' | 'POST'; path: string; body?: unknown; label: string }> = [
      { method: 'GET', path: '/finance/audit/search?page=1&page_size=20', label: '检索' },
      { method: 'GET', path: '/finance/audit/stats', label: '统计' },
      {
        method: 'GET',
        path: `/finance/reports/subsidiary-ledger?dimension_type=SUPPLIER&dimension_value=${supplierId}&start_date=${utcDate(-30)}&end_date=${utcDate(0)}`,
        label: '子账报表',
      },
      {
        method: 'POST',
        path: '/finance/audit/track',
        body: { event_type: marker, event_name: marker, resource: marker, action: marker },
        label: '埋点写入',
      },
      {
        method: 'POST',
        path: '/ap/verifications/auto',
        body: { supplier_id: supplierId },
        label: '应付自动核销',
      },
      {
        method: 'POST',
        path: '/finance/accounting-periods/year-end-closing?year=2097',
        label: '年结',
      },
    ];

    for (const leg of legs) {
      const anon = await fetchAnonymous(page, leg.method, leg.path, leg.body);
      expect(anon.status, `${leg.label} 未登录必须 401`).toBe(401);
      expect(failureCode(anon.json), `${leg.label} 未登录机器码`).toBe('UNAUTHORIZED');
      expect(anon.json.trace_id, `${leg.label} 未登录失败体缺 trace_id`).toMatch(/^[0-9a-f]{32}$/);
      expect(anon.json.timestamp, `${leg.label} 未登录失败体缺 timestamp`).toBeDefined();
    }

    await loginViaUI(page, testUsername(), testPassword(), true);
    const probeAfter = await searchAudit(page, marker);
    expect(
      probeAfter.total,
      '未登录被拒的埋点写没有落任何审计行（半截写反查，marker 从未进 handler）'
    ).toBe(0);
    const listAfter = await apiCallRaw<Paginated<Json>>(
      page,
      'GET',
      `/ap/verifications?supplier_id=${supplierId}&page=1&page_size=20`
    );
    expect(listAfter.total, '未登录被拒的自动核销没有落核销单').toBe(0);
    const periodsAfter = await apiCallRaw<PeriodRow[]>(page, 'GET', '/finance/accounting-periods');
    expect(periodsAfter.length, '未登录被拒的年结没有写任何期间（期间总数仍等于基线）').toBe(
      periodsBefore.length
    );
    console.log(`[262] 六腿未登录 401 全部配对完成并回读证明零半截写，探针 marker=${marker}`);
  });
});
