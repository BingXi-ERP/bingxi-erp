import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  loginAsRole,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  testUsername,
  APP_ERROR_CODES,
  API_BASE,
  API_PREFIX,
} from './helpers';

/**
 * 财务分析趋势与报表配对（号段 263）：financial-analysis 族六枚端点的写后回读闭环、
 * 聚合口径自洽、参数门与鉴权门。判据全部取自服务端源码，注释里的 文件:行号 就是断言依据。
 *
 * 界面入口：frontend/src/views/financial-analysis/tabs/AnalysisListTab.vue（路由 /financial-analysis），
 * 该页经 src/api/financial-analysis.ts 调用本族端点（列表/详情/更新/删除/带参执行/趋势查询），
 * 但 e2e 侧此前从未做过出参形状配对：smoke/financial-analysis.smoke.spec.ts 只跑页面可达，
 * flow/29c 只断容器可见。POST /financial-analysis/trends 在前端零调用（api 层无 createFinancialTrend），
 * 只能直连接口面配对。
 *
 * 挂载与键形（routes/finance.rs，nest 前缀 /api/v1/erp，见 routes/mod.rs）：
 * - GET  /financial-analysis/trends        handler:173 get_trends
 * - POST /financial-analysis/trends        handler:231 create_trend
 * - GET  /financial-analysis/reports/{id}  handler:483 get_report（{id} 为 i32，route-snapshot.txt:525）
 * - PUT  /financial-analysis/reports/{id}  handler:406 update_report（snapshot:1712）
 * - DELETE /financial-analysis/reports/{id} handler:461 delete_report（snapshot:50）
 * - POST /financial-analysis/reports/{id}/execute handler:513 execute_report（snapshot:1276）
 * 权限键由 URL 段推导（middleware/permission.rs extract_resource_info）：`financial-analysis`
 * 是直接资源段（utils/path_utils.rs），派生键 = financial-analysis:read/create/update/delete；
 * `execute` 不在 PATH_ACTION_KEYWORDS（permission.rs）内，故执行腿派生 create 键。
 * 唯一持有助手种子：services/init_service_ops/permission.rs 只给 finance_manager
 * ("financial-analysis","*")；manager（:430 起）不持有该键 ⇒ manager 全腿必 403。
 *
 * 出参键名以实体/handler 手挑键为准（snake_case）：
 * - 趋势行 = models/financial_analysis_result.rs 全 12 字段（handler:259 to_value(Model)）
 * - 报表列表行 = handler:297-304 手挑 6 键；详情 = handler:497-508 手挑 10 键
 * - 报表写侧响应 = handler:360-367（5 键）/ :446-454（7 键）
 * DECIMAL 出参为字符串（Cargo.toml:60 rust_decimal 仅 serde 特性；与 api 层
 * FinancialTrend.indicator_value: string 同源），数值判定一律先 Number() 归一并显式断 typeof。
 * 状态词表唯一事实来源 = 写入方 models/status/general.rs master_data（小写 active/inactive），
 * create_indicator 落 master_data::ACTIVE（services/financial_analysis_service.rs）；
 * 趋势方向中文词表 = service:262-270（上升/下降/持平），禁止英文化。
 * 失败信封只有 AppError 一种形状：NOT_FOUND/404、VALIDATION_ERROR/400（utils/error.rs,817-823）。
 * 脱敏通道判定：handler 用的是 AppError::not_found（非 displayable）⇒ HTTP message 恒为
 * 固定公开文案「资源未找到」（utils/messages.rs，error.rs），含 ID 的原文只进日志；
 * validator 拒绝经 From<ValidationErrors>（error.rs）转 displayable 通道 ⇒ 字段文案可外显；
 * 提取器解码拒绝由 trace_context.rs 统一转 400 + REQUEST_DECODING_PUBLIC（error.rs）。
 *
 * 本文件钉住的后端缺陷（按现状断，不写成成功，修法落地时须同步反转这些断言）：
 * D1 GET /trends 出参只有 {items,total}，没有 page/page_size（handler:198-201），与全站分页信封
 *    utils/response.rs PaginatedResponse 四键不一致；且 total 取的是 limit 之后的长度
 *    （handler:184 clamp + :200 trends.len()），调用方拿不到真实总数 —— handler:198,201 钉住。
 * D2 list_reports 把已减过 1 的页码再传进 service 的第二次减 1（handler:287 + service:207），
 *    第 1 页与第 2 页返回同一批数据、第 3 页起每页前跳一页；而 get_indicators 未预减（handler:117）
 *    故同表同服务的指标列表分页正常 —— 两腿并列断，缺陷面与对照面同框。
 * D3 POST /trends 不校验 indicator_id 存在性（service:239-290 直接 insert），孤儿趋势行可落库；
 *    且 routes/finance.rs 该路径只有 GET/POST，没有 DELETE —— 写脏不可回收，按现状钉住。
 * D4 execute 腿对**用户自建报表恒 no_data**：calculate_indicators 只算 5 枚预定义指标
 *    （service:737-790 定义 + :567-583 逐枚 try_save），handler:540 按 indicator_id==报表 id 过滤
 *    永不命中（新建报表的 id 不在预定义集内）⇒ 返回 status=no_data + latest_result=null
 *    （handler:557-564）。执行腿也不回写报表行自身状态（handler:513-587 无任何 update），
 *    报表的 status 永远停在创建时的 active。
 * D5 PUT 的 status 只限长度不限词表（handler:386 `length(max = 20)`），任意 ≤20 字符 token
 *    直接 Set 落库（handler:431-433），与 master_data 词表不比对 ⇒ 词表外状态可写入并被详情回显。
 * D6 差异率取整口径两套：POST /trends 路径不 round（service:249-256），execute 计算路径
 *    round_dp(2)（service:818-825）+ 比率本体 round_dp(4)（service:703-711）⇒ 同名指标两种精度；
 *    且差异率列刻度只有 DECIMAL(5,2)（m0012:367），比率的 4 位精度到不了差异率。
 * D7 报表无独立表：POST/PUT/DELETE /reports 全部落在 financial_indicators（handler:344-355 + :416 + :468），
 *    与指标定义同表同键 ⇒ 报表列表必然混入指标定义行（handler:286-292 无类型过滤），
 *    而"报表 id"与"指标 id"在趋势外键上也不可区分。
 * D8 报表编码 = `RPT-<unix 秒>`（handler:346）而 indicator_code 列 NOT NULL UNIQUE（m0012:346）
 *    ⇒ 同一秒内两次建单必撞唯一键。本文件用隔秒规避（waitOutLastCodeSecond）以保证造数确定性，
 *    不等于该生成方式可用。
 */

/** 趋势行 = financial_analysis_result::Model 全字段（NOT NULL 列不标可选，缺键即判红） */
interface TrendRow {
  id: number;
  analysis_type: string;
  period: string;
  indicator_id: number;
  indicator_value: string;
  target_value?: string | null;
  variance?: string | null;
  variance_rate?: string | null;
  trend?: string | null;
  analysis_date?: string | null;
  created_by?: number | null;
  created_at: string;
}
/** GET /trends 出参（handler:198-201，无 page/page_size，见 D1） */
interface TrendPage {
  items: TrendRow[];
  total: number;
}
/** 报表列表行 = handler:297-304 手挑 6 键 */
interface ReportListItem {
  id: number;
  name: string;
  indicator_code: string;
  indicator_type: string;
  status: string;
  created_at: string;
}
interface ReportListPage {
  items: ReportListItem[];
  total: number;
  page: number;
  page_size: number;
}
/** 报表详情 = handler:497-508 手挑 10 键 */
interface ReportDetail {
  id: number;
  name: string;
  indicator_code: string;
  indicator_type: string;
  formula?: string | null;
  unit?: string | null;
  status: string;
  remark?: string | null;
  created_at: string;
  updated_at: string;
}
/** 写侧响应：create 5 键（handler:360-367）、update 7 键（handler:446-454） */
interface ReportCreateRow {
  id: number;
  name: string;
  indicator_code: string;
  indicator_type: string;
  status: string;
  created_at: string;
}
interface ReportUpdateRow {
  id: number;
  name: string;
  indicator_code: string;
  indicator_type: string;
  status: string;
  remark?: string | null;
  updated_at: string;
}
/** 指标定义行 = financial_analysis::Model 全字段（handler:121 items 直出实体） */
interface IndicatorRow {
  id: number;
  indicator_name: string;
  indicator_code: string;
  indicator_type: string;
  formula?: string | null;
  unit?: string | null;
  status: string;
  remark?: string | null;
  created_at: string;
  updated_at: string;
}
interface IndicatorPage {
  items: IndicatorRow[];
  total: number;
  page: number;
  page_size: number;
}
/** execute 出参 = handler:567-584 手挑 7 键 */
interface ExecutePayload {
  id: number;
  name: string;
  status: string;
  period: string;
  latest_result: {
    analysis_type: string;
    period: string;
    indicator_value: string;
    target_value?: string | null;
    variance?: string | null;
    variance_rate?: string | null;
    trend?: string | null;
    analysis_date?: string | null;
  } | null;
  executed_at: string;
  total_indicators_computed: number;
}

/** 写入方词表（models/status/general.rs，小写） */
const STATUS_ACTIVE = 'active'; // master_data::ACTIVE
const STATUS_INACTIVE = 'inactive'; // master_data::INACTIVE
/** 趋势方向中文词表（service:262-270） */
const TREND_UP = '上升';
const TREND_DOWN = '下降';
const TREND_FLAT = '持平';

/** 同源文案（逐字符照抄后端常量，断言点即引用点） */
const MSG_NOT_FOUND_MASKED = '资源未找到'; // utils/messages.rs（AppError::not_found 脱敏通道）
const MSG_REQUEST_DECODING =
  '请求格式不正确：请求体或查询参数存在缺失的必填字段、字段类型错误或内容类型错误，请修正后重试'; // utils/error.rs
const MSG_MISSING_INDICATOR_ID = '财务分析请求缺少指标ID'; // handler:183 validation_displayable
const MSG_PERIOD_LENGTH = '周期长度必须在1到20字符之间'; // handler:53
const MSG_ANALYSIS_TYPE_LENGTH = '分析类型长度不能超过30字符'; // handler:50
const MSG_NAME_LENGTH = '报告名称长度必须在1到100字符之间'; // handler:378
const MSG_TYPE_LENGTH = '报告类型长度不能超过30字符'; // handler:381
const MSG_DESC_LENGTH = '描述长度不能超过500字符'; // handler:384
const MSG_STATUS_ILLEGAL = '状态取值非法'; // handler:386
const MSG_TREND_CREATED = '财务趋势数据创建成功'; // handler:261
const MSG_REPORT_CREATED = '财务分析报告创建成功'; // handler:368
const MSG_REPORT_UPDATED = '财务分析报告更新成功'; // handler:455
const MSG_REPORT_DELETED = '财务分析报告删除成功'; // handler:478
const MSG_EXEC_COMPLETED = '财务分析报告执行成功'; // handler:558
const MSG_EXEC_NO_DATA =
  '财务分析报告执行完成，但该指标无计算结果（可能缺少科目余额数据或指标未在预定义列表中）'; // handler:562

/** 预定义指标码（service:739-780 definitions 清单），execute 计算腿的唯一可命中集 */
const PREDEFINED_CODES = [
  'CURRENT_RATIO',
  'QUICK_RATIO',
  'DEBT_ASSET_RATIO',
  'AR_TURNOVER_RATIO',
  'AP_TURNOVER_RATIO',
];

/** 不存在主键候选：远大于真实自增值、仍在 i32 范围内（Path<i32> 可解析，不进解码门） */
const MISSING_ID = 999999999;

/**
 * 功能：把 rust_decimal 出参按"必须是字符串"归一成数值，缺键/类型错直接判红。
 * 调用方：趋势值、目标值、差异、差异率等所有 DECIMAL 断言点。
 * 入参：label 定位失败信息，raw 为原始出参值。
 * 传给谁：expect 断言后把 Number 归一值返回给调用方比较（不混比字符串与数值）。
 * 存什么：不落库，纯函数。
 * 存哪里：不适用。类型错绝不兜底成 0——缺键与 0 值是两回事。
 */
function decimal(label: string, raw: unknown): number {
  expect(
    typeof raw === 'string' && raw.length > 0,
    `${label} 应为 rust_decimal 字符串出参，实际 ${JSON.stringify(raw)}`
  ).toBe(true);
  const n = Number(raw as string);
  expect(Number.isFinite(n), `${label} 字符串无法归一成有限数值，实际 ${JSON.stringify(raw)}`).toBe(
    true
  );
  return n;
}
/** 同上，放行 null（模型里 Option<Decimal> 列可为 null，service:248-256） */
function decimalOpt(label: string, raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  return decimal(label, raw);
}

/**
 * 功能：按 UTC 日历日平移 'YYYY-MM-DD'，用于趋势的日期区间门。
 * 调用方：区间命中腿与区间外腿（start_date/end_date 按 analysis_date 过滤，service:311-326）。
 * 入参：isoDate 基准日，days 平移量（可为负）。
 * 传给谁：返回串拼进查询串交 GET /trends。
 * 存什么：不落库。
 * 存哪里：不适用。基准日取自回读行的 analysis_date（service:280 Utc::now().date_naive()），
 *        不用墙钟推导，跨 UTC 午夜跑也不会自相矛盾。
 */
function shiftUtcDay(isoDate: string, days: number): string {
  const base = new Date(`${isoDate}T00:00:00Z`);
  expect(Number.isNaN(base.getTime()), `基准日无法解析：${isoDate}`).toBe(false);
  return new Date(base.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 功能：给出本 worker 唯一且**逐次递增唯一**的期间串，避免并发与同毫秒撞车。
 * 调用方：趋势写腿（三条各一期间）与执行腿的计算期间。
 * 入参：tag 单字母区分同一 worker 内的不同用途。
 * 传给谁：拼成 period 串，交 POST /trends 与 GET /trends 的 period 过滤、以及 execute 的 ?period=。
 * 存什么：不存业务数据，只在模块内记一个自增序号（worker 内单进程顺序执行，够用）。
 * 存哪里：模块变量 periodSeq；period 列本身是 VARCHAR(20) 且无格式 CHECK
 *        （m0012_add_ap_ar_finance_analysis.rs），长度 20 是硬上限，超了会被 handler:53 长度门拒。
 */
let periodSeq = 0;
function uniqPeriod(tag: string): string {
  periodSeq += 1;
  // worker 身份取本 worker 账号名的数字尾缀，保证跨 worker 也不撞同一期间
  const workerTag = testUsername().replace(/\D/g, '').slice(-2) || '0';
  const p = `E2E263${workerTag}${Date.now().toString(36)}${periodSeq}${tag}`;
  expect(p.length, `期间串超长（>20，会被 handler:53 长度门拒）：${p}`).toBeLessThanOrEqual(20);
  return p;
}

/**
 * 功能：把两次建报表的调用隔到不同的 unix 秒。
 * 调用方：createReport（本文件全部造报表的腿）。
 * 入参：无，读模块变量 lastReportCodeSecond。
 * 传给谁：setTimeout 等到上一秒彻底过去后再发下一单。
 * 存什么：只记上一次建单成功的 unix 秒，不存业务数据。
 * 存哪里：模块变量。
 * 为什么要隔秒（缺陷 D8）：报表编码由 handler:346 用 `RPT-<Utc::now().timestamp()>` 生成，
 * 秒级粒度，而 financial_indicators.indicator_code 是 NOT NULL UNIQUE
 * （m0012_add_ap_ar_finance_analysis.rs）⇒ 同一秒内的第二次建单必撞唯一键。
 * 本文件用隔秒规避以保证造数确定性，不因此掩盖该缺陷（修法应是编码带上序列或改随机串）。
 */
let lastReportCodeSecond = 0;
async function waitOutLastCodeSecond(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  if (now <= lastReportCodeSecond) {
    await new Promise(resolve => setTimeout(resolve, (lastReportCodeSecond - now + 1) * 1000 + 60));
  }
}
function markReportCodeSecond(): void {
  lastReportCodeSecond = Math.floor(Date.now() / 1000);
}

/**
 * 功能：创建一份报表配置（POST /financial-analysis/reports）并返回出参行。
 * 调用方：写后回读、更新、删除、执行四腿的前置造数。
 * 入参：page、唯一名称、报告类型、期间起止、关联指标、描述。
 * 传给谁：CreateReportRequest（handler:80-90，全字段必填除 indicators/description）。
 * 存什么：服务端把它当作 financial_indicators 行写入（handler:344-355 复用 CreateIndicatorRequest，
 *        indicator_code = RPT-<unix 秒>），period/关联指标/描述拼进 remark（handler:331-342）。
 * 存哪里：表 financial_indicators（models/financial_analysis.rs sea_orm table_name）。
 */
async function createReport(
  page: import('@playwright/test').Page,
  opts: {
    name: string;
    reportType: string;
    periodStart: string;
    periodEnd: string;
    indicators?: number[];
    description?: string;
  }
): Promise<ReportCreateRow> {
  await waitOutLastCodeSecond();
  const res = await apiCall<ReportCreateRow>(page, 'POST', '/financial-analysis/reports', {
    name: opts.name,
    report_type: opts.reportType,
    period_start: opts.periodStart,
    period_end: opts.periodEnd,
    indicators: opts.indicators,
    description: opts.description,
  });
  expect(res.code, `建报表应 200，实际信封 ${JSON.stringify(res).slice(0, 200)}`).toBe(200);
  expect(res.message, `建报表 message 应逐字同源 handler:368，实际 ${res.message}`).toBe(
    MSG_REPORT_CREATED
  );
  markReportCodeSecond();
  return res.data;
}

/**
 * 功能：写一条趋势数据（POST /financial-analysis/trends）并返回落库后的全字段行。
 * 调用方：趋势写后回读闭环与聚合自洽腿。
 * 入参：指标 id、期间、值/目标值（DECIMAL 以字符串提交，避免 JSON 浮点进 service:249 的减法）。
 * 传给谁：CreateTrendDto（handler:48-61），service:239 create_analysis_result 落库。
 * 存什么：financial_analysis_results 一行，variance/variance_rate/trend 由 service:248-270 派生。
 * 存哪里：表 financial_analysis_results（models/financial_analysis_result.rs）。
 */
async function createTrend(
  page: import('@playwright/test').Page,
  body: {
    analysisType?: string;
    period: string;
    indicatorId: number;
    value: string;
    targetValue?: string;
  }
): Promise<TrendRow> {
  const payload: Record<string, unknown> = {
    period: body.period,
    indicator_id: body.indicatorId,
    value: body.value,
  };
  if (body.analysisType !== undefined) payload.analysis_type = body.analysisType;
  if (body.targetValue !== undefined) payload.target_value = body.targetValue;
  const res = await apiCall<TrendRow>(page, 'POST', '/financial-analysis/trends', payload);
  expect(res.code, `写趋势应 200，实际信封 ${JSON.stringify(res).slice(0, 200)}`).toBe(200);
  expect(res.message, `写趋势 message 应逐字同源 handler:261，实际 ${res.message}`).toBe(
    MSG_TREND_CREATED
  );
  return res.data;
}

/**
 * 功能：读趋势集合（GET /financial-analysis/trends），带回真实 HTTP 状态与 {items,total}。
 * 调用方：写后回读、期间/日期区间/limit 三口径腿。
 * 入参：query 为 indicator_id 及其余过滤串（indicator_id 必填，缺失即 400，见 handler:181-183）。
 * 传给谁：page.request.get（沿用 worker 会话），结果交调用方逐字段断。
 * 存什么：不落库，只读。
 * 存哪里：不适用；解析失败抛错并带状态码与原文片段，不静默兜底。
 */
async function getTrends(
  page: import('@playwright/test').Page,
  query: string
): Promise<{ status: number; body: TrendPage }> {
  const path = `/financial-analysis/trends?${query}`;
  const res = await page.request.get(`${API_BASE}${API_PREFIX}${path}`);
  const text = await res.text();
  let body: TrendPage;
  try {
    body = JSON.parse(text) as TrendPage;
  } catch (e) {
    throw new Error(
      `GET ${path} 响应不是合法 JSON（status=${res.status()}）：${text.slice(0, 200)}，原因 ${(e as Error).message}`
    );
  }
  expect(
    Array.isArray(body.items),
    `GET ${path} 出参 items 应为数组，实际 ${text.slice(0, 200)}`
  ).toBe(true);
  console.log(
    `[263] GET ${path} → status=${res.status()} items=${body.items.length} total=${body.total}`
  );
  return { status: res.status(), body };
}

test.describe('P263 财务分析趋势与报表：写后回读闭环、聚合口径与六枚端点参数门', () => {
  test('鉴权档：未登录 401，manager 六枚端点全 403 且越权写不回读', async ({ page, browser }) => {
    // 匿名腿用独立新建上下文，不复用 worker 会话，避免 storageState 带 cookie 变成假绿
    const anon = await browser.newContext();
    for (const path of [
      '/financial-analysis/trends?indicator_id=1',
      `/financial-analysis/reports/${MISSING_ID}`,
      '/financial-analysis/reports?page=1&page_size=1',
    ]) {
      const res = await anon.request.get(`${API_BASE}${API_PREFIX}${path}`);
      expect(res.status(), `未登录 GET ${path} 应 401，实际 ${res.status()}`).toBe(401);
      const body = await res.json();
      expect(
        typeof body.code === 'string' && body.code.length > 0,
        `未登录 ${path} 的拒绝体必须是带字符串机器码的 AppError 信封，实际：${JSON.stringify(body).slice(0, 200)}`
      ).toBe(true);
      console.log(`[263] 未登录 GET ${path} → 401 code=${String(body.code)}`);
    }
    await anon.close();

    // 授权面先造一份真实报表，作为越权写的靶子
    await loginViaUI(page, undefined, undefined, true);
    const name = `E2E263-越权靶-${Date.now().toString(36)}`;
    const target = await createReport(page, {
      name,
      reportType: 'monthly',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      description: '越权靶子',
    });

    // manager 不持有 financial-analysis 任何动作键（permission.rs 起的切片里没有该资源，
    // 全仓该键只授 finance_manager，见 :1169）⇒ 六枚端点逐枚 403
    await loginAsRole(page, 'manager');
    const deniedLegs: Array<
      ['GET' | 'POST' | 'PUT' | 'DELETE', string, Record<string, unknown> | undefined, string]
    > = [
      ['GET', '/financial-analysis/trends?indicator_id=1', undefined, 'read'],
      [
        'POST',
        '/financial-analysis/trends',
        { period: '2026-01', indicator_id: 1, value: '1' },
        'create',
      ],
      ['GET', `/financial-analysis/reports/${target.id}`, undefined, 'read'],
      ['PUT', `/financial-analysis/reports/${target.id}`, { name: '越权改名' }, 'update'],
      ['DELETE', `/financial-analysis/reports/${target.id}`, undefined, 'delete'],
      [
        'POST',
        `/financial-analysis/reports/${target.id}/execute`,
        undefined,
        'create（execute 段不派生动作，见 permission.rs）',
      ],
    ];
    for (const [method, path, body, action] of deniedLegs) {
      const denied = await apiCallExpectFail(page, method, path, body);
      expect(
        denied.status,
        `manager 打 ${method} ${path} 应 403（缺 financial-analysis:${action}），实际 ${denied.status}`
      ).toBe(403);
      expect(
        failureCode(denied),
        `manager 越权拒绝体应为 AppError 字符串机器码，实际 code=${JSON.stringify(denied)}`
      ).toBe(APP_ERROR_CODES.FORBIDDEN);
      expect(
        String(denied.message ?? '').length,
        `manager 越权 ${method} ${path} 拒绝原因为空文案`
      ).toBeGreaterThan(0);
      console.log(
        `[263] manager ${method} ${path} → 403 ${String(denied.code)} "${String(denied.message)}"`
      );
    }

    // 越权未生效：靶子行仍归 worker 会话创建时的原值，既没被改名也没被删
    await loginViaUI(page, undefined, undefined, true);
    const after = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${target.id}`
    );
    expect(
      after.name,
      `manager 越权 PUT 后名称应仍为提交原文（实际 ${after.name}＝越权写库成功）`
    ).toBe(name);
    expect(after.status, `manager 越权不得改状态，实际 ${after.status}`).toBe(STATUS_ACTIVE);
    const anonTrend = await getTrends(page, 'indicator_id=1');
    expect(anonTrend.status, '回切授权会话后趋势读腿应可用').toBe(200);
    console.log(`[263] 越权回读：name=${after.name} status=${after.status}`);
  });

  test('趋势族：POST 写后 GET 双路回读、派生值逐字段同源、三口径过滤自洽', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);

    // 报表行即指标行（handler:344 复用 CreateIndicatorRequest）：用它当趋势的指标外键，全链自控
    const report = await createReport(page, {
      name: `E2E263-趋势宿主-${Date.now().toString(36)}`,
      reportType: 'trend_host',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
    });
    const hostId = Number(report.id);
    expect(hostId, `宿主报表 id 应为正整数，实际 ${report.id}`).toBeGreaterThan(0);

    const p1 = uniqPeriod('A');
    const p2 = uniqPeriod('B');
    const p3 = uniqPeriod('C');

    // 三条：高于目标 / 低于目标 / 等于目标，把趋势方向三态一次覆盖
    const rows = [
      await createTrend(page, {
        period: p1,
        indicatorId: hostId,
        value: '1234.56',
        targetValue: '1000',
      }),
      await createTrend(page, {
        analysisType: 'manual',
        period: p2,
        indicatorId: hostId,
        value: '800',
        targetValue: '1000',
      }),
      await createTrend(page, {
        period: p3,
        indicatorId: hostId,
        value: '1000',
        targetValue: '1000',
      }),
    ];

    // 写侧出参逐字段同源（handler:259 = to_value(Model)，键名即实体字段名）
    const expectTrend = (
      row: TrendRow,
      value: string,
      target: string | null,
      period: string,
      analysisType: string
    ) => {
      expect(
        typeof row.id,
        `趋势行 id 类型应为 number，实际 ${JSON.stringify(row).slice(0, 200)}`
      ).toBe('number');
      expect(row.id, '趋势行 id 应为落库后的自增主键（非 0）').toBeGreaterThan(0);
      expect(row.period, `期间应逐字回显 ${period}，实际 ${row.period}`).toBe(period);
      expect(row.indicator_id, `指标外键应逐字回显宿主 ${hostId}，实际 ${row.indicator_id}`).toBe(
        hostId
      );
      expect(
        row.analysis_type,
        `分析类型应回显 ${analysisType}（缺省由 handler:242 填 "trend"），实际 ${row.analysis_type}`
      ).toBe(analysisType);
      expect(
        decimal('indicator_value', row.indicator_value),
        'indicator_value 归一后应等于提交值'
      ).toBeCloseTo(Number(value), 6);
      if (target === null) {
        expect(
          row.target_value ?? null,
          `未提交目标值时 target_value 应为 null，实际 ${JSON.stringify(row.target_value)}`
        ).toBeNull();
      } else {
        expect(
          decimal('target_value', row.target_value),
          'target_value 归一后应等于提交值'
        ).toBeCloseTo(Number(target), 6);
      }
      // 派生腿逐字段对表：variance=value-target（service:248）、trend 三态中文（service:262-270）
      const v = decimal('indicator_value', row.indicator_value);
      const rate = decimalOpt('variance_rate', row.variance_rate);
      const variance = decimalOpt('variance', row.variance);
      if (target === null) {
        expect(variance, '无目标值时 variance 应为 null').toBeNull();
        expect(rate, '无目标值时 variance_rate 应为 null').toBeNull();
        expect(row.trend ?? null, '无目标值时 trend 应为 null').toBeNull();
      } else {
        const t = Number(target);
        expect(
          variance,
          `variance 应等于 value-target=${v - t}，实际 ${JSON.stringify(row.variance)}`
        ).toBeCloseTo(v - t, 6);
        // 差异率列刻度 DECIMAL(5,2)（migration/src/domain/business/m0012_add_ap_ar_finance_analysis.rs）：
        // 写侧不 round（service:249-256，见 D6）而列只留 2 位 ⇒ 按 2 位精度比数值，
        // 不把列刻度当成失败，也不放过量级错。
        expect(
          rate,
          `variance_rate 应等于 (value-target)/target*100（DECIMAL(5,2) 刻度内），实际 ${JSON.stringify(row.variance_rate)}`
        ).toBeCloseTo(((v - t) / t) * 100, 2);
        const expectToken = v - t > 0 ? TREND_UP : v - t < 0 ? TREND_DOWN : TREND_FLAT;
        expect(
          row.trend,
          `trend 应落中文词表 ${expectToken}（service:262-270），实际 ${JSON.stringify(row.trend)}`
        ).toBe(expectToken);
      }
      expect(
        typeof row.analysis_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.analysis_date),
        `analysis_date 应为 YYYY-MM-DD（service:280 date_naive），实际 ${JSON.stringify(row.analysis_date)}`
      ).toBe(true);
      expect(
        Number.isInteger(row.created_by) && Number(row.created_by) > 0,
        `created_by 应为创建人正整数，实际 ${JSON.stringify(row.created_by)}`
      ).toBe(true);
    };
    expectTrend(rows[0], '1234.56', '1000', p1, 'trend');
    expectTrend(rows[1], '800', '1000', p2, 'manual');
    expectTrend(rows[2], '1000', '1000', p3, 'trend');

    // 回读路 1：整表按 indicator_id 取回 —— 长度与区间一致、成员纯净、求和与写侧汇总一致
    const all = await getTrends(page, `indicator_id=${hostId}&page_size=50`);
    expect(all.status, '趋势回读应 200').toBe(200);
    expect(
      all.body.items.length,
      `宿主指标下应恰有本次写入的 3 条，实际 ${JSON.stringify(all.body).slice(0, 240)}`
    ).toBe(3);
    expect(
      all.body.total,
      `total 应等于 items 长度（handler:200 取的是 trends.len()，见 D1）`
    ).toBe(all.body.items.length);
    // D1 信封漂移钉住：全站分页信封是 PaginatedResponse{items,total,page,page_size}（utils/response.rs），
    // 该腿只回两键；若后端补齐 page/page_size，本行断言应随之反转。
    const envelopeKeys = Object.keys(all.body).sort();
    expect(
      envelopeKeys.includes('page') || envelopeKeys.includes('page_size'),
      `GET /trends 出现 page/page_size 键（D1 已修，需同步反转本断言并更新前端 api/financial-analysis.ts 类型）：${envelopeKeys.join(',')}`
    ).toBe(false);
    const byId = new Map(all.body.items.map(r => [r.period, r]));
    for (const row of rows) {
      const readBack = byId.get(row.period);
      expect(readBack, `列表路未回读到期间 ${row.period}（写读不同源）`).toBeDefined();
      expect(
        String(readBack?.id),
        `列表路 id 应等于写侧 id=${row.id}，实际 ${JSON.stringify(readBack?.id)}`
      ).toBe(String(row.id));
      expect(
        decimal('列表路 indicator_value', readBack?.indicator_value),
        '列表路值应等于写侧值'
      ).toBeCloseTo(decimal('写侧 indicator_value', row.indicator_value), 6);
      expect(
        Object.keys(readBack as object).sort(),
        `趋势行键集应与 financial_analysis_result::Model 12 字段逐一对齐，实际 ${JSON.stringify(readBack).slice(0, 240)}`
      ).toEqual([
        'analysis_date',
        'analysis_type',
        'created_at',
        'created_by',
        'id',
        'indicator_id',
        'indicator_value',
        'period',
        'target_value',
        'trend',
        'variance',
        'variance_rate',
      ]);
    }
    const sumRead = all.body.items.reduce(
      (acc, r) => acc + decimal('items[].indicator_value', r.indicator_value),
      0
    );
    const sumWritten = rows.reduce((acc, r) => acc + decimal('写侧值', r.indicator_value), 0);
    expect(sumRead, `序列求和应与写侧逐条汇总一致（${sumRead} vs ${sumWritten}）`).toBeCloseTo(
      sumWritten,
      6
    );

    // 回读路 2：period 精确匹配（service:305-308）
    const one = await getTrends(page, `indicator_id=${hostId}&period=${p2}`);
    expect(one.body.items.length, `period=${p2} 应只命中 1 条，实际 ${one.body.items.length}`).toBe(
      1
    );
    expect(one.body.items[0].period, 'period 过滤命中行的期间应等于查询串').toBe(p2);
    expect(one.body.total, 'period 过滤后的 total 应与截断后的 items 长度同源').toBe(1);

    // 回读路 3：analysis_date 区间（service:311-326）——长度与请求区间一致
    const d = String(rows[0].analysis_date);
    const inWindow = await getTrends(page, `indicator_id=${hostId}&start_date=${d}&end_date=${d}`);
    expect(
      inWindow.body.items.length,
      `区间 [${d},${d}] 应命中全部 3 条（三条同日写入），实际 ${inWindow.body.items.length}`
    ).toBe(3);
    const beforeWindow = await getTrends(
      page,
      `indicator_id=${hostId}&start_date=${shiftUtcDay(d, -5)}&end_date=${shiftUtcDay(d, -1)}`
    );
    expect(
      beforeWindow.body.items.length,
      '区间整体早于写入日时应 0 命中（过滤被忽略即假绿）'
    ).toBe(0);
    expect(beforeWindow.body.total, '区间外 total 应随之为 0').toBe(0);
    const afterWindow = await getTrends(
      page,
      `indicator_id=${hostId}&start_date=${shiftUtcDay(d, 1)}`
    );
    expect(afterWindow.body.items.length, 'start_date 晚于写入日时应 0 命中').toBe(0);
    const openWindow = await getTrends(
      page,
      `indicator_id=${hostId}&start_date=${shiftUtcDay(d, -1)}`
    );
    expect(openWindow.body.items.length, '开区间（只给 start_date）应命中 3 条').toBe(3);
    // 时间序列有序：service:330 按 analysis_date DESC 排，出参必须单调不升
    const dates = inWindow.body.items.map(r => String(r.analysis_date));
    const sorted = [...dates].sort().reverse();
    expect(
      dates,
      `趋势序列应按 analysis_date 降序（service:330），实际 ${dates.join(',')}`
    ).toEqual(sorted);

    // limit 腿：page_size 被 clamp 到 1..=100（handler:184），total 是截断后长度 ⇒ D1 的第二半
    const limited = await getTrends(page, `indicator_id=${hostId}&page_size=2`);
    expect(limited.body.items.length, 'page_size=2 应截断到 2 条').toBe(2);
    expect(
      limited.body.total,
      `total=${limited.body.total} 应为截断后的长度而非真实条数 3（D1，handler:184+200）`
    ).toBe(2);
    const overLimit = await getTrends(page, `indicator_id=${hostId}&page_size=99999`);
    expect(
      overLimit.body.items.length,
      'page_size 超上限应被 clamp 而不是报错，仍命中 3 条（未超 clamp 上限）'
    ).toBe(3);

    // 指标隔离：别的指标不得混进本序列
    const other = await getTrends(page, 'indicator_id=1&page_size=50');
    expect(
      other.body.items.some(r => r.indicator_id === hostId),
      `indicator_id=1 的序列里混进了宿主 ${hostId} 的行 ⇒ 过滤未生效`
    ).toBe(false);
    expect(
      other.body.items.every(r => r.indicator_id === 1),
      'GET /trends 必须逐行回显所查 indicator_id'
    ).toBe(true);
    console.log(
      `[263] 趋势闭环：宿主=${hostId} 三条求和=${sumRead} 区间内=${inWindow.body.items.length} 区间外=${beforeWindow.body.items.length} limit total=${limited.body.total}`
    );
  });

  test('趋势参数门：缺指标 400 可外显、解码拒绝固定文案、长度门逐条点名、孤儿外键按现状落库（D3）', async ({
    page,
  }) => {
    await loginViaUI(page, undefined, undefined, true);

    // indicator_id 缺失：走 validation_displayable（handler:183），文案必须原样外显
    const noIndicator = await apiCallExpectFail(page, 'GET', '/financial-analysis/trends');
    expect(
      noIndicator.status,
      `缺 indicator_id 应 400（handler:181-183 主动拒绝，不得回落成"查全部"），实际 ${noIndicator.status}`
    ).toBe(400);
    expect(
      failureCode(noIndicator),
      `缺指标拒绝码应为 VALIDATION_ERROR，实际 ${JSON.stringify(noIndicator)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      noIndicator.message,
      `缺指标应逐字外显 handler:183 文案，实际：${JSON.stringify(noIndicator.message)}`
    ).toBe(MSG_MISSING_INDICATOR_ID);

    // indicator_id 类型错：Query 解码拒绝 → trace_context.rs 统一信封（固定公开文案）
    const badType = await apiCallExpectFail(
      page,
      'GET',
      '/financial-analysis/trends?indicator_id=abc'
    );
    expect(badType.status, 'indicator_id 非整数应 400，实际 ' + badType.status).toBe(400);
    expect(failureCode(badType), '解码拒绝应为 VALIDATION_ERROR 族').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      badType.message,
      `解码拒绝文案应逐字等于 REQUEST_DECODING_PUBLIC（error.rs），实际：${JSON.stringify(badType.message)}`
    ).toBe(MSG_REQUEST_DECODING);
    expect(
      String(badType.message).includes('financial_analysis') ||
        /line \d+ column \d+/.test(String(badType.message)),
      'serde 原文（结构体名/行列号）不得外显（error.rs 安全边界）'
    ).toBe(false);

    // period 空串：validator min=1（handler:53），经 From<ValidationErrors> 外显字段文案
    const emptyPeriod = await apiCallExpectFail(page, 'POST', '/financial-analysis/trends', {
      period: '',
      indicator_id: 1,
      value: '1',
    });
    expect(emptyPeriod.status, '空期间应 400，实际 ' + emptyPeriod.status).toBe(400);
    expect(
      String(emptyPeriod.message ?? ''),
      `期间长度门应点名 handler:53 文案，实际：${JSON.stringify(emptyPeriod.message)}`
    ).toContain(MSG_PERIOD_LENGTH);

    // analysis_type 超 30 字符：handler:50 长度门
    const longType = await apiCallExpectFail(page, 'POST', '/financial-analysis/trends', {
      analysis_type: 'x'.repeat(31),
      period: uniqPeriod('L'),
      indicator_id: 1,
      value: '1',
    });
    expect(longType.status, '超长分析类型应 400').toBe(400);
    expect(String(longType.message ?? '')).toContain(MSG_ANALYSIS_TYPE_LENGTH);

    // value 缺失：Json 解码拒绝（CreateTrendDto.value 是必填 Decimal，handler:58），不得静默按 0 落库
    const noValue = await apiCallExpectFail(page, 'POST', '/financial-analysis/trends', {
      period: uniqPeriod('V'),
      indicator_id: 1,
    });
    expect(noValue.status, '缺 value 应 400，实际 ' + noValue.status).toBe(400);
    expect(noValue.message).toBe(MSG_REQUEST_DECODING);

    // D3：indicator_id 指向不存在的主键也照写不误（service:239-290 无外键存在性判定），
    // 且该族只有 GET/POST（routes/finance.rs）⇒ 写脏无法回收。按现状钉住，不写成成功。
    const orphanId = 2147483001;
    const orphanPeriod = uniqPeriod('O');
    const orphan = await createTrend(page, {
      period: orphanPeriod,
      indicatorId: orphanId,
      value: '7',
    });
    expect(
      orphan.indicator_id,
      `孤儿趋势行应原样落库不存在的主键 ${orphanId}（D3），实际 ${orphan.indicator_id}`
    ).toBe(orphanId);
    const orphanRead = await getTrends(page, `indicator_id=${orphanId}&period=${orphanPeriod}`);
    expect(
      orphanRead.body.items.length,
      '不存在指标的趋势行仍可被 GET /trends 回读（无存在性门）'
    ).toBe(1);
    expect(orphanRead.body.items[0].id, '回读行应为刚写入的那一条').toBe(orphan.id);
    expect(
      orphanRead.body.items[0].target_value ?? null,
      '未提交目标值的孤儿行 target_value 应为 null'
    ).toBeNull();

    // D3 的后半：该族没有 DELETE /trends/{id}（routes/finance.rs 只挂 GET/POST，
    // route-snapshot.txt 亦无 DELETE /financial-analysis/trends），孤儿行写下去就收不回。
    // 按现状钉"请求无效 + 数据仍在"，后端若补回收端点，本腿应改为断删除闭环。
    const noDelete = await apiCallExpectFail(
      page,
      'DELETE',
      `/financial-analysis/trends/${orphan.id}`
    );
    expect(
      noDelete.status,
      `DELETE /financial-analysis/trends/{id} 未挂载，不得被当成删除成功（200），实际 ${noDelete.status}`
    ).not.toBe(200);
    expect(noDelete.status, `路由缺位不得裸抛 5xx，实际 ${noDelete.status}`).toBeLessThan(500);
    const stillThere = await getTrends(page, `indicator_id=${orphanId}&period=${orphanPeriod}`);
    expect(stillThere.body.items.length, '未挂载的删除请求不得产生任何数据效果（行应仍在）').toBe(
      1
    );
    console.log(
      `[263] 参数门：缺指标="${String(noIndicator.message)}" 解码="${String(noValue.message).slice(0, 20)}…" 孤儿行=${orphan.id} DELETE=${noDelete.status}`
    );
  });

  test('报表读腿：详情/列表键集逐一对齐、remark 组合口径、limit 与 off-by-one 分页缺陷（D2）', async ({
    page,
  }) => {
    await loginViaUI(page, undefined, undefined, true);

    const tag = Date.now().toString(36);
    const name = `E2E263-报表-${tag}`;
    const description = `期间报告描述-${tag}`;
    const report = await createReport(page, {
      name,
      reportType: 'quarterly',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
      indicators: [1, 2],
      description,
    });
    const id = Number(report.id);

    // 写侧 5 键手挑（handler:360-367）：不得把指标全表字段泄露出来，也不得缺键
    expect(
      Object.keys(report).sort(),
      `建单出参键集应等于 handler:360-367 的 6 键（含 created_at），实际 ${JSON.stringify(Object.keys(report))}`
    ).toEqual(['created_at', 'id', 'indicator_code', 'indicator_type', 'name', 'status']);
    expect(report.name, '名称应逐字回显提交原文').toBe(name);
    expect(
      report.indicator_type,
      `report_type 应原样落 indicator_type（handler:347），实际 ${report.indicator_type}`
    ).toBe('quarterly');
    expect(
      report.status,
      `新报表状态应由写入方落 master_data::ACTIVE=${STATUS_ACTIVE}（service:229），实际 ${report.status}`
    ).toBe(STATUS_ACTIVE);
    expect(
      report.indicator_code,
      `报表编码应为 RPT-<unix 秒>（handler:346），实际 ${report.indicator_code}`
    ).toMatch(/^RPT-\d+$/);
    expect(
      new Date(report.created_at).getTime(),
      `created_at 应为 RFC3339 可解析串，实际 ${report.created_at}`
    ).not.toBeNaN();

    // 详情腿（handler:497-508）：10 键 + remark 三段拼接口径（handler:331-342）
    const detail = await apiCallRaw<ReportDetail>(page, 'GET', `/financial-analysis/reports/${id}`);
    expect(
      Object.keys(detail).sort(),
      `详情出参键集应等于 handler:497-508 的 10 键，实际 ${JSON.stringify(Object.keys(detail))}`
    ).toEqual([
      'created_at',
      'formula',
      'id',
      'indicator_code',
      'indicator_type',
      'name',
      'remark',
      'status',
      'unit',
      'updated_at',
    ]);
    expect(detail.id, '详情 id 应等于路径 id').toBe(id);
    expect(detail.name, '详情名称应等于写侧名称').toBe(name);
    expect(
      detail.formula ?? null,
      `建报表不传公式，formula 应为 null（handler:348），实际 ${JSON.stringify(detail.formula)}`
    ).toBeNull();
    expect(detail.unit ?? null, '建报表不传单位，unit 应为 null（handler:349）').toBeNull();
    const expectedRemark = `期间: 2026-04-01 ~ 2026-06-30 | 关联指标: 1,2 | 描述: ${description}`;
    expect(
      detail.remark,
      `remark 应逐字等于 handler:331-342 的三段拼接（期间/关联指标/描述以 " | " 连接），实际：${JSON.stringify(detail.remark)}`
    ).toBe(expectedRemark);

    // 列表腿（handler:275-319）：6 键、无 remark/formula/unit —— 描述与期间只在详情可得，前端列表列为空的风险面
    const list = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=1&page_size=100'
    );
    expect(Array.isArray(list.items), '列表 items 应为数组').toBe(true);
    expect(list.page, `列表 page 应回显入参 1，实际 ${list.page}`).toBe(1);
    expect(list.page_size, `列表 page_size 应回显入参 100，实际 ${list.page_size}`).toBe(100);
    expect(
      typeof list.total === 'number' && list.total >= list.items.length,
      `列表 total(${list.total}) 应为数字且不小于本页条数(${list.items.length})`
    ).toBe(true);
    const listed = list.items.find(r => r.id === id);
    expect(
      listed,
      `列表未回读到新建报表 id=${id}（列表按 id DESC 取，service:206-210）`
    ).toBeDefined();
    expect(
      Object.keys(listed as ReportListItem).sort(),
      `列表行键集应等于 handler:297-304 的 6 键；remark/formula/unit 不在列表出参里（前端若绑 remark 必恒空）`
    ).toEqual(['created_at', 'id', 'indicator_code', 'indicator_type', 'name', 'status']);
    expect(listed?.name, '列表行名称应与详情一致').toBe(name);
    expect(listed?.status, '列表行状态应与详情一致').toBe(STATUS_ACTIVE);

    // clamp 面（handler:283-284）：非法页码/超上限被钳位并回显钳位值，而不是 400 也不是全表拉取
    const clamped = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=0&page_size=99999'
    );
    expect(clamped.page, `page=0 应被 clamp 到 1，实际 ${clamped.page}`).toBe(1);
    expect(clamped.page_size, `page_size=99999 应被 clamp 到 100，实际 ${clamped.page_size}`).toBe(
      100
    );
    expect(clamped.items.length, 'clamp 后仍应返回本页数据').toBeGreaterThan(0);

    // 分页腿需要 ≥2 行才能判"换页是否真的换批"，再建一份报表把行数抬到可判
    const second = await createReport(page, {
      name: `E2E263-分页对照-${tag}`,
      reportType: 'quarterly',
      periodStart: '2026-04-01',
      periodEnd: '2026-06-30',
    });
    expect(Number(second.id) > id, `第二份报表 id 应更大（自增），实际 ${second.id} vs ${id}`).toBe(
      true
    );

    // D2：list_reports 预减页码（handler:287）+ service 再减一次（service:207）⇒ 第 1、2 页同批
    const p1 = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=1&page_size=1'
    );
    const p2 = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=2&page_size=1'
    );
    expect(
      p2.page,
      `第 2 页回显的 page 应为 2（响应回显与取数脱节正是 D2 的表征），实际 ${p2.page}`
    ).toBe(2);
    expect(p1.items.length, 'page_size=1 应只回 1 行').toBe(1);
    expect(p2.items.length, '第 2 页也应有数据（total>1，实际批次数不变）').toBe(1);
    expect(
      p1.items[0].id,
      `当前真态是第 1 页与第 2 页首行同 id（D2 off-by-one：handler:287 预减 + service:207 再减）；若两页 id 已不同说明后端修了，需反转本断言。实际 ${p1.items[0].id} vs ${p2.items[0].id}`
    ).toBe(p2.items[0].id);
    // 对照面：同一 service、同一张表的指标列表腿未预减（handler:117）⇒ 分页真的生效
    const i1 = await apiCallRaw<IndicatorPage>(
      page,
      'GET',
      '/financial-analysis/indicators?page=1&page_size=1'
    );
    const i2 = await apiCallRaw<IndicatorPage>(
      page,
      'GET',
      '/financial-analysis/indicators?page=2&page_size=1'
    );
    expect(i1.items.length, '指标列表 page_size=1 应只回 1 行').toBe(1);
    expect(i2.items.length, '指标列表第 2 页应仍有数据（total>1）').toBe(1);
    expect(
      i1.items[0].id === i2.items[0].id,
      `指标列表第 1、2 页首行 id 应不同（对照面，实际同为 ${i1.items[0]?.id}）`
    ).toBe(false);

    // 解码门：page 非整数走 Query 解码拒绝（handler:270 typed DTO，注释 :265-267 记录了改造原因）
    const badPage = await apiCallExpectFail(
      page,
      'GET',
      '/financial-analysis/reports?page=abc&page_size=10'
    );
    expect(badPage.status, 'page 非整数应 400，实际 ' + badPage.status).toBe(400);
    expect(badPage.message).toBe(MSG_REQUEST_DECODING);

    // 详情参数门：不存在主键走脱敏 NOT_FOUND（handler:493 AppError::not_found ⇒ 原文不外显）
    const missing = await apiCallExpectFail(
      page,
      'GET',
      `/financial-analysis/reports/${MISSING_ID}`
    );
    expect(missing.status, `不存在主键详情应 404，实际 ${missing.status}`).toBe(404);
    expect(failureCode(missing)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      missing.message,
      `详情 404 文案应逐字等于脱敏公开常量（messages.rs），实际：${JSON.stringify(missing.message)}`
    ).toBe(MSG_NOT_FOUND_MASKED);
    expect(String(missing.message).includes(String(MISSING_ID)), '脱敏通道不得把记录 ID 外显').toBe(
      false
    );
    console.log(
      `[263] 读腿：id=${id} remark长度=${String(detail.remark).length} 分页D2=${p1.items[0].id}/${p2.items[0].id} 指标对照=${i1.items[0].id}/${i2.items[0].id}`
    );
  });

  test('报表写腿：局部更新只改显式字段、描述段替换而期间段保留、状态词表门缺位（D5）、404/400 逐字同源', async ({
    page,
  }) => {
    await loginViaUI(page, undefined, undefined, true);

    const tag = Date.now().toString(36);
    const report = await createReport(page, {
      name: `E2E263-更新前-${tag}`,
      reportType: 'annual',
      periodStart: '2026-07-01',
      periodEnd: '2026-12-31',
      indicators: [3],
      description: `原描述-${tag}`,
    });
    const id = Number(report.id);
    const before = await apiCallRaw<ReportDetail>(page, 'GET', `/financial-analysis/reports/${id}`);
    const keepPeriodSegment = '期间: 2026-07-01 ~ 2026-12-31';
    const keepIndicatorSegment = '关联指标: 3';
    expect(String(before.remark)).toContain(keepPeriodSegment);
    expect(String(before.remark)).toContain(keepIndicatorSegment);

    // 只传 name：其余字段必须零漂移（handler:425-439 逐 Some 才 Set）
    const renameResp = await apiCall<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {
        name: `E2E263-更新后-${tag}`,
      }
    );
    expect(renameResp.code, '更新腿应 200').toBe(200);
    expect(
      renameResp.message,
      `更新 message 应逐字同源 handler:455，实际 ${JSON.stringify(renameResp.message)}`
    ).toBe(MSG_REPORT_UPDATED);
    const renamed = renameResp.data;
    expect(
      Object.keys(renamed).sort(),
      `更新出参键集应等于 handler:446-454 的 7 键，实际 ${JSON.stringify(Object.keys(renamed))}`
    ).toEqual(['id', 'indicator_code', 'indicator_type', 'name', 'remark', 'status', 'updated_at']);
    expect(renamed.name, '名称应落新值').toBe(`E2E263-更新后-${tag}`);
    expect(
      renamed.indicator_type,
      `未提交 report_type 时类型应保持 ${before.indicator_type}，实际 ${renamed.indicator_type}`
    ).toBe(before.indicator_type);
    expect(
      renamed.indicator_code,
      'indicator_code 不得被更新腿改写（handler:425-433 不覆盖它）'
    ).toBe(before.indicator_code);
    const afterRename = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${id}`
    );
    expect(afterRename.name, '详情回读应与更新出参同源').toBe(renamed.name);
    expect(
      afterRename.remark,
      `只改名称时 remark 应原样保留，实际：${JSON.stringify(afterRename.remark)}`
    ).toBe(before.remark);

    // 描述段替换、其他元数据段保留（handler:391-402 upsert_remark_description）
    const newDesc = `新描述-${tag}`;
    const described = await apiCallRaw<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {
        description: newDesc,
      }
    );
    const expectedRemark = `${keepPeriodSegment} | ${keepIndicatorSegment} | 描述: ${newDesc}`;
    expect(
      described.remark,
      `更新出参 remark 应逐字为 "${expectedRemark}"（描述段替换、期间/关联指标段保留），实际：${JSON.stringify(described.remark)}`
    ).toBe(expectedRemark);
    const afterDesc = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${id}`
    );
    expect(afterDesc.remark, '详情 remark 应与更新出参逐字同源').toBe(expectedRemark);
    const descHits = (String(afterDesc.remark).match(/描述:/g) ?? []).length;
    expect(
      descHits,
      `remark 里「描述:」段应只剩 1 段（旧段未被替换即重复累积），实际 ${descHits} 段`
    ).toBe(1);
    expect(afterDesc.name, '改描述不得顺带改名称').toBe(renamed.name);

    // 状态词表内值可写（active→inactive），写入方词表同源
    const stopped = await apiCallRaw<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {
        status: STATUS_INACTIVE,
      }
    );
    expect(
      stopped.status,
      `状态应落 master_data::INACTIVE=${STATUS_INACTIVE}，实际 ${stopped.status}`
    ).toBe(STATUS_INACTIVE);
    expect(
      (await apiCallRaw<ReportDetail>(page, 'GET', `/financial-analysis/reports/${id}`)).status,
      '详情状态应与更新出参回读一致'
    ).toBe(STATUS_INACTIVE);

    // D5：status 只有长度门、没有词表门（handler:386 `length(max = 20)`）⇒ 任意 ≤20 字符 token 落库。
    // 按现状钉住：若后端补上词表校验，本腿应改为断 400 并同步反转。
    const bogus = 'E2E263-NOT-IN-VOCAB';
    expect(
      bogus.length,
      '越界状态串必须落在长度门之内，才能证明缺的是词表门而非长度门'
    ).toBeLessThanOrEqual(20);
    const illegal = await apiCallRaw<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {
        status: bogus,
      }
    );
    expect(
      illegal.status,
      `D5：词表外状态被直接接受并回显（应为 400 却被 200 放行），实际 ${illegal.status}`
    ).toBe(bogus);
    expect(
      (await apiCallRaw<ReportDetail>(page, 'GET', `/financial-analysis/reports/${id}`)).status,
      '词表外状态同样能被详情回读 ⇒ 落库而非仅回显'
    ).toBe(bogus);
    // 回到词表内，后续腿可比
    const restored = await apiCallRaw<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {
        status: STATUS_ACTIVE,
      }
    );
    expect(restored.status, '恢复后状态应为 active').toBe(STATUS_ACTIVE);

    // 空体局部更新 = 无字段可改（handler:425-439 全 None），业务值不得漂移，但 updated_at 必被刷新（handler:440）
    const noop = await apiCallRaw<ReportUpdateRow>(
      page,
      'PUT',
      `/financial-analysis/reports/${id}`,
      {}
    );
    expect(noop.name, '空体更新不得改名称').toBe(renamed.name);
    expect(noop.remark, '空体更新不得改 remark').toBe(expectedRemark);
    expect(
      new Date(noop.updated_at).getTime() >= new Date(afterDesc.updated_at).getTime(),
      `updated_at 应由 handler:440 显式刷新（回退 ${noop.updated_at} < ${afterDesc.updated_at}）`
    ).toBe(true);

    // 长度门逐条点名（validator ⇒ displayable 通道，文案原样外显，error.rs）
    const nameTooLong = '名'.repeat(101);
    const failName = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      name: nameTooLong,
    });
    expect(failName.status, '超长名称应 400，实际 ' + failName.status).toBe(400);
    expect(failureCode(failName)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(String(failName.message ?? ''), `实际：${JSON.stringify(failName.message)}`).toContain(
      MSG_NAME_LENGTH
    );

    const emptyName = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      name: '',
    });
    expect(emptyName.status, '空名称应 400（min=1），不得静默把 NOT NULL 列清空').toBe(400);
    expect(String(emptyName.message ?? '')).toContain(MSG_NAME_LENGTH);

    const longType = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      report_type: 't'.repeat(31),
    });
    expect(longType.status, '超长报告类型应 400').toBe(400);
    expect(String(longType.message ?? '')).toContain(MSG_TYPE_LENGTH);

    const longDesc = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      description: 'd'.repeat(501),
    });
    expect(longDesc.status, '超长描述应 400').toBe(400);
    expect(String(longDesc.message ?? '')).toContain(MSG_DESC_LENGTH);

    const longStatus = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      status: 's'.repeat(21),
    });
    expect(longStatus.status, '超长状态应 400（长度门仍在）').toBe(400);
    expect(
      String(longStatus.message ?? ''),
      `实际：${JSON.stringify(longStatus.message)}`
    ).toContain(MSG_STATUS_ILLEGAL);

    // 被拒的更新不得留下任何痕迹（回读仍是上一次成功值）
    const untouched = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${id}`
    );
    expect(untouched.name, '被 400 拒绝的更新不得改名称').toBe(renamed.name);
    expect(untouched.remark, '被 400 拒绝的更新不得改 remark').toBe(expectedRemark);

    // 字段类型错（name 传数字）⇒ Json 解码拒绝，不得被 coerced 成字符串落库
    const badField = await apiCallExpectFail(page, 'PUT', `/financial-analysis/reports/${id}`, {
      name: 12345,
    });
    expect(badField.status, '类型错的 name 应 400，实际 ' + badField.status).toBe(400);
    expect(badField.message).toBe(MSG_REQUEST_DECODING);

    // 不存在主键：更新腿同样是脱敏 404（handler:419），与详情腿同源
    const missingPut = await apiCallExpectFail(
      page,
      'PUT',
      `/financial-analysis/reports/${MISSING_ID}`,
      {
        name: `E2E263-幽灵-${tag}`,
      }
    );
    expect(missingPut.status, `更新不存在主键应 404，实际 ${missingPut.status}`).toBe(404);
    expect(failureCode(missingPut)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(missingPut.message, `实际：${JSON.stringify(missingPut.message)}`).toBe(
      MSG_NOT_FOUND_MASKED
    );
    console.log(
      `[263] 写腿：remark=${String(expectedRemark).length}字符 D5词表外状态=${bogus} 长度门命中=${[failName, emptyName, longType, longDesc, longStatus].map(f => f.status).join('/')}`
    );
  });

  test('删除可见性与执行腿：DELETE 后真 404、重删 404、执行不回写报表状态且自建报表恒 no_data（D4）', async ({
    page,
  }) => {
    await loginViaUI(page, undefined, undefined, true);

    const tag = Date.now().toString(36);
    const report = await createReport(page, {
      name: `E2E263-删除腿-${tag}`,
      reportType: 'disposable',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    const id = Number(report.id);
    // 执行前先取一次详情基线，用来判执行腿到底有没有碰报表行本身（D4 的后半）
    const beforeExec = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${id}`
    );
    const expectedRemark = '期间: 2026-09-01 ~ 2026-09-30';
    expect(
      beforeExec.remark,
      `未提交关联指标与描述时，remark 应只有期间段（handler:331-342），实际：${JSON.stringify(beforeExec.remark)}`
    ).toBe(expectedRemark);

    // 执行腿（前置）：新建报表的 id 必不在 5 枚预定义指标内 ⇒ 恒 no_data（D4，handler:540+557-564）
    const period = uniqPeriod('X');
    const exec = await apiCall<ExecutePayload>(
      page,
      'POST',
      `/financial-analysis/reports/${id}/execute?period=${period}`
    );
    expect(
      exec.code,
      `执行腿应 200（真执行、不是 5xx），实际信封 ${JSON.stringify(exec).slice(0, 200)}`
    ).toBe(200);
    expect(
      Object.keys(exec.data).sort(),
      `执行出参键集应等于 handler:567-584 的 7 键，实际 ${JSON.stringify(Object.keys(exec.data))}`
    ).toEqual([
      'executed_at',
      'id',
      'latest_result',
      'name',
      'period',
      'status',
      'total_indicators_computed',
    ]);
    expect(exec.data.id, '执行出参 id 应等于路径 id').toBe(id);
    expect(exec.data.name, '执行出参名称应回显报表名').toBe(report.name);
    expect(
      exec.data.period,
      `期间应逐字回显查询串 ${period}（handler:530-532），实际 ${exec.data.period}`
    ).toBe(period);
    expect(
      exec.data.status,
      `自建报表执行状态应恒为 no_data（D4：handler:540 的 id 过滤永不命中预定义集），实际 ${exec.data.status}`
    ).toBe('no_data');
    expect(
      exec.message,
      `no_data 腿 message 应逐字同源 handler:562，实际：${JSON.stringify(exec.message)}`
    ).toBe(MSG_EXEC_NO_DATA);
    expect(
      exec.message,
      `no_data 腿不得携带 completed 文案（handler:557-564 两态分流被混同即假绿）：${JSON.stringify(exec.message)}`
    ).not.toBe(MSG_EXEC_COMPLETED);
    expect(exec.data.latest_result, 'no_data 腿不得携带 latest_result 结果体').toBeNull();
    expect(
      typeof exec.data.total_indicators_computed === 'number' &&
        exec.data.total_indicators_computed >= 0,
      `total_indicators_computed 应为非负数字（all_results.len()），实际 ${JSON.stringify(exec.data.total_indicators_computed)}`
    ).toBe(true);
    expect(
      new Date(exec.data.executed_at).getTime(),
      'executed_at 应为可解析 RFC3339 串'
    ).not.toBeNaN();

    // 真执行性交叉核对：total_indicators_computed 必须与 financial_analysis_results 里
    // 本次期间落库的预定义指标行数完全一致（service:567-583 逐枚 try_save ⇒ 一次 execute 一行）
    const defs = await apiCallRaw<IndicatorPage>(
      page,
      'GET',
      '/financial-analysis/indicators?page=1&page_size=100'
    );
    const predefined = PREDEFINED_CODES.map(code => {
      const row = defs.items.find(r => r.indicator_code === code);
      expect(
        row,
        `执行腿应由 ensure_indicator_definitions 自动补建指标 ${code}（service:774-787），实际未出现在指标列表`
      ).toBeDefined();
      return row as IndicatorRow;
    });
    for (const row of predefined) {
      expect(
        row.status,
        `自动补建的指标定义状态应为写入方 ${STATUS_ACTIVE}，实际 ${row.status}`
      ).toBe(STATUS_ACTIVE);
    }
    let persisted = 0;
    for (const row of predefined) {
      const leg = await getTrends(page, `indicator_id=${row.id}&period=${period}`);
      expect(
        leg.body.items.length,
        `指标 ${row.indicator_code} 在单一 execute 下最多 1 行，实际 ${leg.body.items.length}`
      ).toBeLessThanOrEqual(1);
      persisted += leg.body.items.length;
    }
    expect(
      persisted,
      `执行出参 total_indicators_computed=${exec.data.total_indicators_computed} 应与本期实际落库行数 ${persisted} 逐一对齐（口径自洽）`
    ).toBe(exec.data.total_indicators_computed);
    // 自建报表名下无结果行（与 latest_result=null 同框，执行腿没有把结果挂到报表 id 上）
    const ownRows = await getTrends(page, `indicator_id=${id}&period=${period}`);
    expect(ownRows.body.items.length, '自建报表 id 下不应有结果行（D4 的另一半）').toBe(0);

    // 执行不回写报表行（handler:513-587 全程无 update）：状态、remark、updated_at 三处零漂移
    const afterExec = await apiCallRaw<ReportDetail>(
      page,
      'GET',
      `/financial-analysis/reports/${id}`
    );
    expect(
      afterExec.status,
      `执行后报表状态应仍是 ${STATUS_ACTIVE}（D4：执行腿不回写状态，前端无法显示"已执行"），实际 ${afterExec.status}`
    ).toBe(STATUS_ACTIVE);
    expect(afterExec.remark, `执行腿不得改 remark，实际：${JSON.stringify(afterExec.remark)}`).toBe(
      expectedRemark
    );
    expect(
      afterExec.updated_at,
      `执行腿不应触碰报表 updated_at（若已触碰说明改成了回写，需同步反转本断言）：${afterExec.updated_at} vs ${beforeExec.updated_at}`
    ).toBe(beforeExec.updated_at);

    // 执行腿参数门：不存在主键 ⇒ 脱敏 404（handler:525）；缺 period ⇒ 取当前年月（handler:530-532）
    const missingExec = await apiCallExpectFail(
      page,
      'POST',
      `/financial-analysis/reports/${MISSING_ID}/execute?period=${period}`
    );
    expect(missingExec.status, `执行不存在主键应 404，实际 ${missingExec.status}`).toBe(404);
    expect(failureCode(missingExec)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(missingExec.message).toBe(MSG_NOT_FOUND_MASKED);
    const defaulted = await apiCall<ExecutePayload>(
      page,
      'POST',
      `/financial-analysis/reports/${id}/execute`
    );
    expect(
      defaulted.data.period,
      `缺 period 时应回落当前年月 YYYY-MM（handler:532），实际 ${defaulted.data.period}`
    ).toMatch(/^\d{4}-\d{2}$/);

    // DELETE 前先把列表总数取下来，删除后用总数增量判"真删了一行"（与窗口取前 100 行的可见性无关）
    const listBefore = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=1&page_size=100'
    );
    expect(
      typeof listBefore.total === 'number' && listBefore.total >= 1,
      `删除前列表 total 应为正数（本测试刚建过单），实际 ${JSON.stringify(listBefore).slice(0, 160)}`
    ).toBe(true);

    // DELETE 腿：200 + 同源文案，data 为 null（ApiResponse<()>）
    const del = await apiCall<unknown>(page, 'DELETE', `/financial-analysis/reports/${id}`);
    expect(del.code, '删除应 200').toBe(200);
    expect(
      del.message,
      `删除 message 应逐字同源 handler:478，实际 ${JSON.stringify(del.message)}`
    ).toBe(MSG_REPORT_DELETED);
    expect(del.data ?? null, '删除出参 data 应为 null（handler:465 ApiResponse<()>）').toBeNull();

    // 不可见性闭环：详情真 404（不是 200 空壳），列表与执行腿同时失去该行
    const goneDetail = await apiCallExpectFail(page, 'GET', `/financial-analysis/reports/${id}`);
    expect(
      goneDetail.status,
      `删除后详情应真 404（若 200 空壳说明只软删未去可见性），实际 ${goneDetail.status}`
    ).toBe(404);
    expect(failureCode(goneDetail)).toBe(APP_ERROR_CODES.NOT_FOUND);
    const goneList = await apiCallRaw<ReportListPage>(
      page,
      'GET',
      '/financial-analysis/reports?page=1&page_size=100'
    );
    expect(
      goneList.items.some(r => r.id === id),
      `删除后列表仍含 id=${id} ⇒ 读写不同源`
    ).toBe(false);
    expect(
      goneList.total,
      `删除后列表 total 应从 ${listBefore.total} 减到 ${listBefore.total - 1}（真删一行，而非软删或只改状态）`
    ).toBe(listBefore.total - 1);
    const goneExec = await apiCallExpectFail(
      page,
      'POST',
      `/financial-analysis/reports/${id}/execute?period=${period}`
    );
    expect(goneExec.status, `删除后执行腿应 404，实际 ${goneExec.status}`).toBe(404);
    expect(goneExec.message).toBe(MSG_NOT_FOUND_MASKED);

    // 重复删除走 rows_affected==0 分支（handler:471-473）：同样真 404，且不外泄记录 ID
    const again = await apiCallExpectFail(page, 'DELETE', `/financial-analysis/reports/${id}`);
    expect(again.status, `重复删除应 404，实际 ${again.status}`).toBe(404);
    expect(failureCode(again)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(again.message, `实际：${JSON.stringify(again.message)}`).toBe(MSG_NOT_FOUND_MASKED);
    expect(String(again.message).includes(String(id)), '删除 404 不得外显记录 ID').toBe(false);

    // 不存在主键的删除腿（同一 rows_affected==0 分支）
    const missingDelete = await apiCallExpectFail(
      page,
      'DELETE',
      `/financial-analysis/reports/${MISSING_ID}`
    );
    expect(missingDelete.status, `删除不存在主键应 404，实际 ${missingDelete.status}`).toBe(404);
    expect(missingDelete.message).toBe(MSG_NOT_FOUND_MASKED);
    console.log(
      `[263] 执行与删除：computed=${exec.data.total_indicators_computed} 落库行=${persisted} 缺省期间=${defaulted.data.period} 删除后详情=${goneDetail.status} 重删=${again.status}`
    );
  });
});
