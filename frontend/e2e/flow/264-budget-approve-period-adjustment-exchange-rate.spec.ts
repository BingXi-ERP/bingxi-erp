import { test, expect } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  ensureBudgetPlan,
  expectDenied,
  failureCode,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
  apiCall,
  apiCallExpectFail,
} from './helpers';

/**
 * 264 期末调整台账 / 预算版本审批 / 汇率查询 / 凭证号生成 的 e2e 配对真契约
 *
 * 覆盖端点（六条腿全部按 frontend/scripts/route-snapshot.txt 逐条核对存在性与方法集合）：
 *   GET  /period-adjustments            快照 :624
 *   POST /period-adjustments            快照 :1352
 *   GET  /period-adjustments/{id}       快照 :625（同族另有 confirm/reverse/cancel 三条 POST 状态腿 :1353-1355）
 *   POST /budgets/versions              快照 :1110
 *   GET  /budgets/versions/{id}         快照 :283
 *   PUT  /budgets/versions/{id}/approve 快照 :1672
 *   GET  /exchange-rates/query          快照 :478（POST /exchange-rates :1248 与 GET /exchange-rates :476 作种子与交叉验证）
 *   GET  /vouchers/generate-no          快照 :973
 *
 * 判据来源（全部读后端源码实核，不凭响应形状猜）：
 *
 * 1. 期末调整面**没有更正腿**：backend/src/routes/period_adjustment.rs:21-38 只注册 POST / 、
 *    GET / 、GET /{id} 与 POST /{id}/confirm|reverse|cancel，**不存在 PUT/PATCH /{id}**（快照同判）。
 *    台账一经落库只能靠状态流转处置，更正＝取消后重建。故任务书要求的「PUT 后再双读」在本域
 *    物理不成立，本 spec 以 confirm/reverse/cancel 三条真实状态写腿做「写后双读」，并把 PUT 面按
 *    「已注册路径 + 未注册方法」钉成 405（与 254 对审计不可篡改面的同一口径：405 体由 axum
 *    方法兜底直出、不经 AppError，故只钉状态码不硬写文案，同时回读证明 405 未发生写入）。
 * 2. 金额钩稽的真实形态：period_adjustment_record 全列清单（models/period_adjustment_record.rs
 *    :20-77 + migration/src/domain/v15/mod.rs:2106-2131）**没有余额列**，
 *    「调整前后余额」在本域不存在，可断的恒等式是三件：
 *    ① 落库 amount 的数值等于请求额（列 DECIMAL(14,2)，超两位小数会被静默舍入）；
 *    ② 同一期间台账的金额合计在任何状态流转前后**不变**（confirm/reverse/cancel 只改状态与
 *       操作人/时间列，services/period_adjustment_service.rs:184-257 全程不触碰 amount）；
 *    ③ 按 status 分区计数之和 == 列表 total（列表侧 count 在分页前下推、与可见集同源，:470-503）。
 *    任何「状态改了却丢行/多行/金额被改写」都会让 ②③ 直接判红，不是只断 200。
 * 3. 状态词表的写入方就是服务层字面量（backend/src/models/status/ 下**没有**期末调整词条）：
 *    services/period_adjustment_service.rs:35-40 定义 draft/confirmed/reversed/cancelled 四枚
 *    小写 token，:145 建单写 draft，:199 confirm 写 confirmed，:241 reverse 写 reversed，
 *    :256 cancel 写 cancelled。比较点逐字符取该词表。预算版本词表同样是服务层字面量
 *    （draft 见 services/budget_management_service.rs:1535，approved 见 :1576），
 *    models/status/ 下亦无对应文件，故两域都按写入方字面量断，不引前端标签件。
 * 4. 拒绝通道差异（不许拿脱敏文案当业务原因断，也不许反过来假设都可外显）：
 *    期末调整四枚状态门（:186-190 / :224-228 / :247-251）与建单四枚校验（:96-118）一律走
 *    `AppError::business` → 出参 message 被收敛成通用常量「业务处理失败」
 *    （utils/messages.rs:43 + utils/error.rs:850），真实原因只进 tracing 日志；
 *    主键不存在走 `AppError::not_found`（:440）→ message「资源未找到」（messages.rs:42）。
 *    预算版本审批门则走 `AppError::business_displayable`（budget_management_service.rs:1572）
 *    → 文案「只有草稿状态的版本才能审批」可外显，本 spec 逐字符断原文。
 * 5. 点名缺陷 A（状态腿的静默失败）：confirm/reverse 调 create_adjustment_voucher
 *    （:265-272 起），失败**仅 warn 返回 None**，调用方无条件把 status 写 confirmed/reversed
 *    并把 voucher_id/reverse_voucher_id 落 None（:199-207 / :241-249）。凭证创建要过期间锁定与
 *    科目存在性校验（services/voucher_ops/crud.rs:47 + :95 precheck_subjects_exist_txn）。
 *    本用例引用一对必然不存在的科目码（E264D/E264C，VARCHAR(32) 容得下）→ 凭证必不生成，
 *    于是「voucher_id/reverse_voucher_id 落 null 而状态照转」是**当前可确定性成立**的形状，
 *    即「确认成功但账上无凭证」的半程状态被钉成失败可见：后端一旦改为传播错误或成功生成凭证，
 *    该断言立即判红。不伪造科目、不用兜底掩盖。
 * 6. 点名缺陷 B（凭证号展示端点，归入仓内单据号展示端点废除清单）：
 *    GET /vouchers/generate-no（handlers/voucher_handler.rs:401-418）签名只有 State，**不接任何入参**，
 *    前缀硬编码 "JZ"，且走自开事务的 DocumentNumberGenerator::generate_no
 *    （utils/number_generator.rs:45-58 → :61-91，探测过程只有 SELECT，号**不落库也不预留**）；
 *    而真号源按凭证类型派生前缀并在调用方事务内取号
 *    （services/voucher_ops/crud.rs:60-72：记→JZ / 收→SK / 付→FK / 转→ZZ，default JZ）。
 *    可写类型词表 available_voucher_types()（crud.rs:688-695）含「收/付/转」→ 对这三类
 *    该端点给出的前缀必错。本 spec 钉「带 ?voucher_type=收 仍返回 JZ 前缀」这一形状与真号源
 *    不一致，并留出翻转说明：后端若按类型派生前缀，本断言判红即证明可移出清单。不为它编造
 *    「号已预留」的成功语义，也不断「连续两次返回同一号」这类受并发影响的伪判据。
 * 7. 点名缺陷 C（同一 {id} 段两种主键含义）：GET /budgets/versions/{id} 的 {id} 是 **plan_id**
 *    （handler:932-937 + service:1547-1550 按 plan_id 过滤，出参是裸数组），
 *    PUT /budgets/versions/{id}/approve 的 {id} 是 **version id**（handler:945-952 +
 *    service:1560-1565 走 find_by_id）。同形不同义：按版本 ID 调读腿只会拿到空数组。
 * 8. 点名缺陷 D（信封漂移，按现状钉住）：预算版本三条腿绕过 ApiResponse 直出
 *    `{code: 200, message, data}`（handler:924-928 / :938-941 / :954-958），读腿出参是裸 Vec、
 *    **没有分页信封**，故本 spec 只断数组含目标行、不假装有 total；
 *    期末调整列表用 handlers/bad_debt_handler.rs:154-159 的 PagedResponse（items/total/page/
 *    page_size 四键，与 utils/response.rs:34-39 的 PaginatedResponse 同形却**是另一份定义**，
 *    仓内两套分页结构体并存）；汇率列表（currency_handler.rs:156-169）取回 total 后用 `_total`
 *    丢弃、只出裸数组，同属该漂移族。失败体侧本域无旁路，一律 AppError 形状。
 * 9. 汇率查询口径（handlers/currency_handler.rs:124-146 + services/currency_service.rs:127-140）：
 *    GetExchangeRateQuery 只有 from_currency/to_currency **两个必填字段，没有任何日期入参**，
 *    服务层按 effective_date DESC 取首条 → 「查询日」维度在本端点不存在，取到的是该币种对的
 *    **最新生效行**（含未来生效日；本用例特意种一条 2999-12-31 的行把它钉住，并断带
 *    effective_date 参数仍返回同一行）。未知币种对**不是**「缺数据即空」：handler:141-144 显式
 *    AppError::not_found → 404 + 「资源未找到」，故按 404 断而不按空 data 断。
 *    DECIMAL 出参是字符串：ExchangeRateResponse.rate 由 model.rate.to_string() 显式产出
 *    （:83-102），列 scale 见 migration/src/domain/system/m0005_add_basic_data_and_system_tables.rs:38
 *    DECIMAL(20,8) → 先断 typeof string，再 Number() 比等值，并种一条 8 位小数汇率
 *    （3.14159265）作为小数位口径判据：任何截断/精度丢失都会判红。
 *    点名缺陷 E：service:132-137 未过滤 is_deleted 列（models/exchange_rate.rs:16 该列可空，
 *    migration/src/domain/system/mod.rs:151 后补），软删汇率仍会被查回；exchange_rates 在快照里
 *    只有 GET 根、GET query、POST 根、按 ID 出 print 四条（:476-478 + :1248），**API 面无软删入口**，
 *    该缺陷只能源码判读、测试侧不可达，如实点名不伪造。
 * 10. 期间(period)列不受格式校验：服务层只判空（:110-112），列 VARCHAR(16)
 *     （migration/src/domain/v15/mod.rs:2110）→ 任意短串都能入账并被结账批处理按等值匹配纳入
 *     （:398-402）。本用例正是用这个形态做 worker 级数据隔离，同时把该事实写在这里点名。
 *
 * 权限档（判据 backend/src/middleware/permission.rs 的 URL 段派生 + 种子
 * backend/src/services/init_service_ops/permission.rs）：
 * - 全库角色授予集里**没有任何一条 ("period-adjustments", ...)**（backend/src 全量 grep 只在
 *   routes/mod.rs:543 挂载、handler 文档、init_service.rs:188 与 utils/path_utils.rs:427 的
 *   资源登记表出现），即期末调整台账只靠 admin 兜住（is_admin_role 短路，permission.rs:587/634）。
 *   本 spec 因此把「写账腿唯一可用身份是 admin」钉成断言，非 admin 一律 403 FORBIDDEN。
 * - auditor 持 permission-audits:read 与 audit-logs:read（permission.rs:1465-1470），
 *   不含 budgets / exchange-rates / vouchers / period-adjustments 任何一枚 → 用作 403 靶心角色。
 * - 未登录 401：认证面复用 CODE_UNAUTHORIZED（utils/error.rs:785）= "UNAUTHORIZED"；
 *   helpers.ts 的 APP_ERROR_CODES 未登记该码（禁改共享件），故本文件就近声明常量并点名来源行。
 * - 401 腿只打 GET：CSRF 中间件对写方法先行，未登录写请求可能落到 CSRF 拒绝码而非 401，
 *   那不是本腿靶心；写腿的拒绝面由 auditor 403 腿覆盖并回读证明零半截写。
 *
 * 数据卫生：期末调整腿用 worker 独占的唯一期间串隔离（≤16 字符，适配 VARCHAR(16)），只读写自己
 * 期间；预算版本腿自建版本行（引用 ensureBudgetPlan 的既有/新建方案），审批只作用于自建版本；
 * 汇率腿自建一对非业务常用币种 AUD/AED，不与其他 spec 的 USD/CNY 对互扰；凭证号与凭证类型腿纯读，
 * 零写入。403/401 腿在被拒后一律回读证明零半截写。
 */

/** 期末调整状态词表（写入方 services/period_adjustment_service.rs:35-40，逐字符比较） */
const PA_STATUS = {
  DRAFT: 'draft',
  CONFIRMED: 'confirmed',
  REVERSED: 'reversed',
  CANCELLED: 'cancelled',
} as const;

/** 未登录机器码（backend/src/utils/error.rs:785 pub const CODE_UNAUTHORIZED） */
const CODE_UNAUTHORIZED = 'UNAUTHORIZED';

/** AppError 脱敏常量（backend/src/utils/messages.rs:42/43）：断的是通道，不是真实文案 */
const MASKED_BUSINESS_MESSAGE = '业务处理失败';
const MASKED_NOT_FOUND_MESSAGE = '资源未找到';

/**
 * 期末调整台账行：键名与 handlers/period_adjustment_handler.rs:31-58 的 PeriodAdjustmentInfo
 * 逐字段一一对应（amount 为 rust_decimal 直出字符串：backend/Cargo.toml:60 只开 "serde" 特性，
 * 序列化即十进制字面量串；日期列为 chrono RFC3339 串）。
 */
type PeriodAdjustmentRow = {
  id: number;
  adjustment_no: string;
  adjustment_type: string;
  period: string;
  description: string;
  debit_subject_code: string;
  debit_subject_name: string;
  credit_subject_code: string;
  credit_subject_name: string;
  amount: string;
  source_type: string | null;
  source_bill_id: number | null;
  source_bill_no: string | null;
  voucher_id: number | null;
  reverse_voucher_id: number | null;
  status: string;
  confirmed_by: number | null;
  confirmed_at: string | null;
  reversed_by: number | null;
  reversed_at: string | null;
  remarks: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
};

/** 期末调整列表信封（handlers/bad_debt_handler.rs:154-159 PagedResponse 四键） */
type PeriodAdjustmentListBody = {
  items: PeriodAdjustmentRow[];
  total: number;
  page: number;
  page_size: number;
};

/** 预算版本行：键名对齐 models/budget_version.rs:10-24（total_amount 同为 Decimal 字符串直出） */
type BudgetVersionRow = {
  id: number;
  plan_id: number;
  version_no: string;
  version_name: string;
  total_amount: string;
  status: string;
  change_reason: string | null;
  approved_by: number | null;
  approved_at: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

/** 汇率出参：handlers/currency_handler.rs:83-89 的四列（rate/effective_date 皆字符串） */
type ExchangeRateRow = {
  id: number;
  from_currency: string;
  to_currency: string;
  rate: string;
  effective_date: string;
};

/** 凭证类型定义：services/voucher_service.rs:115-118 的 code/name 两列 */
type VoucherTypeRow = {
  code: string;
  name: string;
};

/**
 * 建单入参：POST /period-adjustments 的 CreatePeriodAdjustmentRequest
 * （services/period_adjustment_service.rs:55-69，非 Option 字段必填）。
 * 调用方：264-01 与 264-02；传给谁：apiCall / apiCallExpectFail 的请求体；
 * 存什么：六个业务列的提交值；存哪里：period_adjustment_record 表（被拒腿不落库）。
 */
type CreateAdjustmentBody = {
  adjustment_type: string;
  period: string;
  description: string;
  debit_subject_code: string;
  debit_subject_name: string;
  credit_subject_code: string;
  credit_subject_name: string;
  amount: number;
  remarks: string;
};

/**
 * 金额整数分位：DECIMAL 字符串先断 typeof，再 Number() 取值并化到整数分位，
 * 供恒等式求和比较，避免浮点累加把钩稽糊成 1e-8 级误差（钩稽断言必须能因真实错账判红）。
 * 调用方：264-01/02/03；传给谁：expect；存什么/存哪里：不持久化。
 */
function centsOf(amount: string, context: string): number {
  expect(typeof amount, `${context}：DECIMAL 出参必须是字符串，实际 typeof=${typeof amount}`).toBe(
    'string'
  );
  const value = Number(amount);
  expect(Number.isFinite(value), `${context}：金额字面量不可转数值，实际 ${amount}`).toBe(true);
  return Math.round(value * 100);
}

/**
 * 列表可见集金额合计（整数分位）。调用方：264-01 的恒等式②三处对照；存什么/存哪里：不持久化。
 */
function sumCents(rows: PeriodAdjustmentRow[], context: string): number {
  return rows.reduce((acc, row) => acc + centsOf(row.amount, `${context} id=${row.id}`), 0);
}

/**
 * 按主键从列表可见集取行：取不到即点名抛错，绝不用 undefined 静默放过（缺键是本仓最常见假绿通道）。
 * 调用方：264-01；入参：items、目标 id、断言语境；传给谁：抛错文本；存什么/存哪里：不持久化。
 */
function pickRowById(
  items: PeriodAdjustmentRow[],
  id: number,
  context: string
): PeriodAdjustmentRow {
  const hit = items.find(row => row.id === id);
  if (!hit) {
    throw new Error(
      `${context}：列表可见集里没有 id=${id}，实际 ids=${items.map(row => row.id).join(',')}`
    );
  }
  return hit;
}

/** 状态分区计数：与列表 total 做和值钩稽（判据 2③）。存什么/存哪里：不持久化。 */
function statusPartition(rows: PeriodAdjustmentRow[], status: string): number {
  return rows.filter(row => row.status === status).length;
}

/**
 * 本 worker 本用例独占的期间标记串（≤16 字符，适配 period VARCHAR(16) 列）。
 * 依赖判据 10（服务层只判空、不校验 YYYY-MM 形制）做数据隔离，同时在文件头点名该缺陷。
 */
function uniquePeriod(tag: string): string {
  return `E264${tag}${Date.now().toString(36).toUpperCase().slice(-6)}`.slice(0, 16);
}

/**
 * 汇率字符串的小数位长度：split 结果按 typeof 收窄，不用非空断言也不给默认值。
 * 调用方：264-04 的小数位口径判据；存什么/存哪里：不持久化。
 */
function fractionLength(rate: string): number {
  const parts = rate.split('.');
  expect(parts.length, `264-04 汇率字符串形制异常：${rate}`).toBeLessThanOrEqual(2);
  const fracPart = parts[1];
  return typeof fracPart === 'string' ? fracPart.length : 0;
}

test.describe('264 期末调整台账 / 预算版本审批 / 汇率查询 / 凭证号生成 配对契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, testUsername(), testPassword());
  });

  test('264-01 期末调整建单到确认到取消：写后双读逐字段 + 金额合计与状态分区恒等', async ({
    page,
  }) => {
    const period = uniquePeriod('A');
    const baseline = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&page=1&page_size=50`
    );
    expect(
      baseline.data.total,
      `264-01 隔离前提不成立：唯一期间 ${period} 基线台账应为空，实际 total=${baseline.data.total}`
    ).toBe(0);

    const bodyOf = (seq: string, amount: number): CreateAdjustmentBody => ({
      adjustment_type: 'provision',
      period,
      description: `E264预提计提${seq}`,
      debit_subject_code: 'E264D',
      debit_subject_name: `E264借方科目${seq}`,
      credit_subject_code: 'E264C',
      credit_subject_name: `E264贷方科目${seq}`,
      amount,
      remarks: `e264-remarks-${seq}`,
    });

    const createdOne = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      '/period-adjustments',
      bodyOf('1', 12345.67)
    );
    const row1 = createdOne.data;
    expect(typeof row1.id, `264-01 建单出参 id 应为数值，实际 typeof=${typeof row1.id}`).toBe(
      'number'
    );
    expect(row1.id > 0, `264-01 建单未返回有效主键：id=${row1.id}`).toBe(true);

    // 写后回读（详情腿）：断的是落库值，不是请求值的回显
    const detail1 = await apiCall<PeriodAdjustmentRow>(
      page,
      'GET',
      `/period-adjustments/${row1.id}`
    );
    const readBack1 = detail1.data;
    expect(readBack1.id, '264-01 详情腿主键与建单不一致').toBe(row1.id);
    expect(readBack1.period, '264-01 期间落库值不等于提交值').toBe(period);
    expect(readBack1.adjustment_type, '264-01 调整类型落库值漂移').toBe('provision');
    expect(readBack1.description, '264-01 摘要落库值漂移').toBe('E264预提计提1');
    expect(readBack1.debit_subject_code, '264-01 借方科目编码落库值漂移').toBe('E264D');
    expect(readBack1.debit_subject_name, '264-01 借方科目名称落库值漂移').toBe('E264借方科目1');
    expect(readBack1.credit_subject_code, '264-01 贷方科目编码落库值漂移').toBe('E264C');
    expect(readBack1.credit_subject_name, '264-01 贷方科目名称落库值漂移').toBe('E264贷方科目1');
    expect(readBack1.remarks, '264-01 备注落库值漂移').toBe('e264-remarks-1');
    expect(readBack1.status, '264-01 建单初始态必须是写入方词表的 draft').toBe(PA_STATUS.DRAFT);
    expect(
      readBack1.adjustment_no.startsWith('PA-'),
      `264-01 单号应取 PA- 前缀（service :33 ADJUSTMENT_NO_PREFIX），实际 ${readBack1.adjustment_no}`
    ).toBe(true);
    expect(
      centsOf(readBack1.amount, '264-01 建单回读 amount'),
      '264-01 恒等式①破裂：调整金额落库值 != 提交值 12345.67（DECIMAL(14,2) 精度或写入通道异常）'
    ).toBe(1234567);
    expect(readBack1.confirmed_by, '264-01 draft 态确认人列必须为 null').toBeNull();
    expect(readBack1.confirmed_at, '264-01 draft 态确认时间列必须为 null').toBeNull();
    expect(readBack1.reversed_by, '264-01 draft 态冲销人列必须为 null').toBeNull();
    expect(readBack1.voucher_id, '264-01 draft 态凭证列必须为 null').toBeNull();
    expect(readBack1.reverse_voucher_id, '264-01 draft 态红字凭证列必须为 null').toBeNull();
    expect(readBack1.source_type, '264-01 未提交的可选列必须落 null 而非缺键').toBeNull();
    expect(readBack1.source_bill_id, '264-01 未提交的可选列必须落 null 而非缺键').toBeNull();
    expect(readBack1.source_bill_no, '264-01 未提交的可选列必须落 null 而非缺键').toBeNull();
    expect(
      typeof readBack1.created_by,
      `264-01 建单人应取服务端会话并落库（service :152），实际 typeof=${typeof readBack1.created_by}`
    ).toBe('number');
    expect(
      Number.isFinite(Date.parse(readBack1.created_at)),
      '264-01 created_at 非可解析时间串'
    ).toBe(true);

    const createdTwo = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      '/period-adjustments',
      bodyOf('2', 88)
    );
    const row2 = createdTwo.data;
    const listAfterCreate = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&page=1&page_size=50`
    );
    const rowsAfterCreate = listAfterCreate.data.items;
    expect(listAfterCreate.data.total, '264-01 建两条后台账 total 应为 2').toBe(2);
    expect(listAfterCreate.data.page, '264-01 分页信封 page 键未回显请求值').toBe(1);
    expect(listAfterCreate.data.page_size, '264-01 分页信封 page_size 键未回显请求值').toBe(50);
    expect(
      centsOf(
        pickRowById(rowsAfterCreate, row2.id, '264-01 列表回读').amount,
        '264-01 列表回读第二行 amount'
      ),
      '264-01 第二行金额落库值 != 88.00（DECIMAL 补零口径）'
    ).toBe(8800);
    const sumAfterCreate = sumCents(rowsAfterCreate, '264-01 建单后');
    expect(sumAfterCreate, '264-01 恒等式①：期间金额合计应为 12345.67 + 88.00 = 12433.67').toBe(
      1243367
    );
    expect(
      statusPartition(rowsAfterCreate, PA_STATUS.DRAFT),
      '264-01 建单后 draft 分区应为 2'
    ).toBe(2);
    expect(
      statusPartition(rowsAfterCreate, PA_STATUS.DRAFT) +
        statusPartition(rowsAfterCreate, PA_STATUS.CONFIRMED) +
        statusPartition(rowsAfterCreate, PA_STATUS.CANCELLED) +
        statusPartition(rowsAfterCreate, PA_STATUS.REVERSED),
      '264-01 恒等式③破裂：状态分区之和必须等于列表 total（count 与可见集同源）'
    ).toBe(listAfterCreate.data.total);

    // 确认腿：状态流转的真实副作用 = status / confirmed_by / confirmed_at 三列真写进去
    const confirmed = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      `/period-adjustments/${row1.id}/confirm`,
      {}
    );
    expect(confirmed.data.status, '264-01 确认后状态应为写入方词表的 confirmed').toBe(
      PA_STATUS.CONFIRMED
    );
    expect(
      typeof confirmed.data.confirmed_by,
      `264-01 确认人未落库，实际 typeof=${typeof confirmed.data.confirmed_by}`
    ).toBe('number');
    expect(
      typeof confirmed.data.confirmed_at,
      `264-01 确认时间未落库，实际 typeof=${typeof confirmed.data.confirmed_at}`
    ).toBe('string');
    expect(
      Number.isFinite(Date.parse(String(confirmed.data.confirmed_at))),
      `264-01 确认时间不是可解析时间串：${confirmed.data.confirmed_at}`
    ).toBe(true);
    expect(
      confirmed.data.voucher_id,
      '264-01 现状钉桩（文件头缺陷 A）：确认腿凭证生成失败被静默吞掉（service :265-272 只 warn），' +
        'voucher_id 落 null 而状态已转 confirmed。后端改为传播错误或真正生成凭证时本断言必须判红'
    ).toBeNull();

    const detailConfirmed = await apiCall<PeriodAdjustmentRow>(
      page,
      'GET',
      `/period-adjustments/${row1.id}`
    );
    expect(detailConfirmed.data.status, '264-01 确认后详情双读状态未落地').toBe(
      PA_STATUS.CONFIRMED
    );
    expect(detailConfirmed.data.confirmed_by, '264-01 确认人两读不同源').toBe(
      confirmed.data.confirmed_by
    );
    expect(
      detailConfirmed.data.confirmed_at,
      '264-01 确认时间两读不同源（逐字符相等才算落库）'
    ).toBe(confirmed.data.confirmed_at);
    expect(
      centsOf(detailConfirmed.data.amount, '264-01 确认后金额'),
      '264-01 恒等式②破裂：确认只应改状态与确认两列，调整金额被改写'
    ).toBe(1234567);

    const listAfterConfirm = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&page=1&page_size=50`
    );
    const rowsAfterConfirm = listAfterConfirm.data.items;
    expect(listAfterConfirm.data.total, '264-01 确认不应新增台账行（total 必须仍为 2）').toBe(2);
    expect(
      statusPartition(rowsAfterConfirm, PA_STATUS.CONFIRMED),
      '264-01 confirmed 分区应为 1'
    ).toBe(1);
    expect(
      statusPartition(rowsAfterConfirm, PA_STATUS.DRAFT),
      '264-01 确认后 draft 分区应为 1'
    ).toBe(1);
    expect(
      sumCents(rowsAfterConfirm, '264-01 确认后'),
      '264-01 恒等式②破裂：状态流转前后金额合计必须不变'
    ).toBe(sumAfterCreate);

    // 取消腿：另一条 draft 的处置（draft → cancelled），再断一次合计与分区恒等
    const cancelled = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      `/period-adjustments/${row2.id}/cancel`,
      {}
    );
    expect(cancelled.data.status, '264-01 取消后状态应为写入方词表的 cancelled').toBe(
      PA_STATUS.CANCELLED
    );
    const listAfterCancel = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&page=1&page_size=50`
    );
    const rowsAfterCancel = listAfterCancel.data.items;
    expect(listAfterCancel.data.total, '264-01 取消不应新增/丢失台账行').toBe(2);
    expect(
      statusPartition(rowsAfterCancel, PA_STATUS.CANCELLED),
      '264-01 cancelled 分区应为 1'
    ).toBe(1);
    expect(statusPartition(rowsAfterCancel, PA_STATUS.DRAFT), '264-01 取消后不应再有 draft').toBe(
      0
    );
    expect(
      sumCents(rowsAfterCancel, '264-01 取消后'),
      '264-01 恒等式②破裂：取消腿改动了金额或行集合'
    ).toBe(sumAfterCreate);
    expect(
      pickRowById(rowsAfterCancel, row2.id, '264-01 取消后列表回读').reverse_voucher_id,
      '264-01 取消腿不应产生红字凭证'
    ).toBeNull();

    // 过滤读口径：period/status/adjustment_type 三枚过滤串都是服务层等值下推（:475-485），
    // 过滤集必须与全量自洽，且不得把别的期间的行混进来
    const filteredConfirmed = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&status=${PA_STATUS.CONFIRMED}&adjustment_type=provision&page=1&page_size=50`
    );
    expect(
      filteredConfirmed.data.total,
      '264-01 status+type 组合过滤应命中唯一一条 confirmed'
    ).toBe(1);
    expect(
      pickRowById(filteredConfirmed.data.items, row1.id, '264-01 组合过滤腿').status,
      '264-01 组合过滤命中的不是被确认的那条'
    ).toBe(PA_STATUS.CONFIRMED);
  });

  test('264-02 期末调整拒绝腿：建单四条门与状态门零半截写，PUT 更正腿未注册 405', async ({
    page,
  }) => {
    const period = uniquePeriod('B');
    const rejectCases: Array<{ label: string; body: CreateAdjustmentBody }> = [
      {
        label: '非法调整类型（service :96-103 白名单门）',
        body: {
          adjustment_type: 'accrual',
          period,
          description: 'E264非法类型',
          debit_subject_code: 'E264D',
          debit_subject_name: 'E264借',
          credit_subject_code: 'E264C',
          credit_subject_name: 'E264贷',
          amount: 10,
          remarks: 'x',
        },
      },
      {
        label: '零金额（service :113-115 amount<=0 门）',
        body: {
          adjustment_type: 'provision',
          period,
          description: 'E264零金额',
          debit_subject_code: 'E264D',
          debit_subject_name: 'E264借',
          credit_subject_code: 'E264C',
          credit_subject_name: 'E264贷',
          amount: 0,
          remarks: 'x',
        },
      },
      {
        label: '空白期间（service :110-112 判空门）',
        body: {
          adjustment_type: 'amortization',
          period: '   ',
          description: 'E264空期间',
          debit_subject_code: 'E264D',
          debit_subject_name: 'E264借',
          credit_subject_code: 'E264C',
          credit_subject_name: 'E264贷',
          amount: 10,
          remarks: 'x',
        },
      },
      {
        label: '借贷科目编码为空（service :116-118 门）',
        body: {
          adjustment_type: 'estimate',
          period,
          description: 'E264空科目',
          debit_subject_code: '',
          debit_subject_name: 'E264借',
          credit_subject_code: '',
          credit_subject_name: 'E264贷',
          amount: 10,
          remarks: 'x',
        },
      },
    ];

    for (const item of rejectCases) {
      const rejected = await apiCallExpectFail(page, 'POST', '/period-adjustments', item.body);
      expect(rejected.status, `264-02 ${item.label} 应被拒为 400，实际 ${rejected.status}`).toBe(
        400
      );
      expect(failureCode(rejected), `264-02 ${item.label} 机器码应为 BUSINESS_ERROR`).toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      expect(
        rejected.message,
        `264-02 ${item.label} 出参 message 应等于脱敏常量（utils/messages.rs:43），实际 ${JSON.stringify(
          rejected.message
        )}；真实原因不外显是本域通道现状，不得拿它当业务原因断`
      ).toBe(MASKED_BUSINESS_MESSAGE);
    }

    const afterRejects = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      `/period-adjustments?period=${period}&page=1&page_size=50`
    );
    expect(
      afterRejects.data.total,
      `264-02 四条拒绝腿存在半截写：期间 ${period} 应零入账，实际 total=${afterRejects.data.total}`
    ).toBe(0);

    const missing = await apiCallExpectFail(page, 'GET', '/period-adjustments/999999999');
    expect(missing.status, `264-02 不存在主键应 404，实际 ${missing.status}`).toBe(404);
    expect(failureCode(missing), '264-02 不存在主键机器码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    expect(
      missing.message,
      '264-02 not_found 通道出参应为脱敏常量（真实文案含记录 ID 只进日志，service :440）'
    ).toBe(MASKED_NOT_FOUND_MESSAGE);

    const draft = await apiCall<PeriodAdjustmentRow>(page, 'POST', '/period-adjustments', {
      adjustment_type: 'amortization',
      period,
      description: 'E264待处置',
      debit_subject_code: 'E264D',
      debit_subject_name: 'E264借',
      credit_subject_code: 'E264C',
      credit_subject_name: 'E264贷',
      amount: 55.5,
      remarks: 'e264-put-probe',
    });
    const draftId = draft.data.id;

    // PUT/PATCH 更正面在本域不存在（routes/period_adjustment.rs:21-38 未注册）→ 已注册路径 + 未注册方法 = 405
    const putProbe = await apiCallExpectFail(page, 'PUT', `/period-adjustments/${draftId}`, {
      amount: 999,
    });
    expect(
      putProbe.status,
      `264-02 PUT /period-adjustments/{id} 应为 405（更正腿未注册），实际 ${putProbe.status}`
    ).toBe(405);
    const readBackAfterPut = await apiCall<PeriodAdjustmentRow>(
      page,
      'GET',
      `/period-adjustments/${draftId}`
    );
    expect(
      centsOf(readBackAfterPut.data.amount, '264-02 PUT 探测后金额'),
      '264-02 405 却发生了写入：金额被改成 999（服务层不存在该写入口，入口被绕过即判红）'
    ).toBe(5550);
    expect(readBackAfterPut.data.status, '264-02 405 探测后状态被改写').toBe(PA_STATUS.DRAFT);

    const confirmOnce = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      `/period-adjustments/${draftId}/confirm`,
      {}
    );
    expect(confirmOnce.data.status, '264-02 前提：首次确认应成功转 confirmed').toBe(
      PA_STATUS.CONFIRMED
    );

    // 终态重复确认：confirmed 不再是 draft → 状态门拒绝（AppError::business 脱敏通道）
    const confirmTwice = await apiCallExpectFail(
      page,
      'POST',
      `/period-adjustments/${draftId}/confirm`,
      {}
    );
    expect(confirmTwice.status, `264-02 终态重复确认应 400，实际 ${confirmTwice.status}`).toBe(400);
    expect(failureCode(confirmTwice), '264-02 重复确认机器码应为 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(confirmTwice.message, '264-02 重复确认应命中 business 脱敏通道').toBe(
      MASKED_BUSINESS_MESSAGE
    );

    const cancelAfterConfirm = await apiCallExpectFail(
      page,
      'POST',
      `/period-adjustments/${draftId}/cancel`,
      {}
    );
    expect(
      cancelAfterConfirm.status,
      `264-02 非 draft 取消应 400，实际 ${cancelAfterConfirm.status}`
    ).toBe(400);
    expect(failureCode(cancelAfterConfirm), '264-02 非法态取消机器码应为 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(cancelAfterConfirm.message, '264-02 非法态取消应命中 business 脱敏通道').toBe(
      MASKED_BUSINESS_MESSAGE
    );

    // 冲销腿（confirmed → reversed 是本域合法流转）：断冲销人/时间落库、红字凭证同为缺陷 A 的 null
    const reversed = await apiCall<PeriodAdjustmentRow>(
      page,
      'POST',
      `/period-adjustments/${draftId}/reverse`,
      {}
    );
    expect(reversed.data.status, '264-02 冲销后状态应为写入方词表的 reversed').toBe(
      PA_STATUS.REVERSED
    );
    expect(reversed.data.reversed_by, '264-02 冲销人列未落库').toEqual(expect.any(Number));
    expect(reversed.data.reversed_at, '264-02 冲销时间列未落库').toEqual(expect.any(String));
    expect(
      reversed.data.reverse_voucher_id,
      '264-02 现状钉桩（文件头缺陷 A）：红字冲销凭证生成失败被静默吞掉，reverse_voucher_id 落 null'
    ).toBeNull();
    expect(
      centsOf(reversed.data.amount, '264-02 冲销后金额'),
      '264-02 恒等式②破裂：冲销只应改状态与冲销两列'
    ).toBe(5550);

    const reverseTwice = await apiCallExpectFail(
      page,
      'POST',
      `/period-adjustments/${draftId}/reverse`,
      {}
    );
    expect(reverseTwice.status, `264-02 终态重复冲销应 400，实际 ${reverseTwice.status}`).toBe(400);
    expect(reverseTwice.message, '264-02 重复冲销应命中 business 脱敏通道').toBe(
      MASKED_BUSINESS_MESSAGE
    );

    const final = await apiCall<PeriodAdjustmentRow>(page, 'GET', `/period-adjustments/${draftId}`);
    expect(
      final.data.status,
      '264-02 被拒的重复确认/非法取消/重复冲销造成了状态漂移（应仍为 reversed）'
    ).toBe(PA_STATUS.REVERSED);
    expect(final.data.confirmed_by, '264-02 冲销腿覆写了确认人列（服务层只应追加冲销两列）').toBe(
      confirmOnce.data.confirmed_by
    );
    expect(final.data.confirmed_at, '264-02 冲销腿覆写了确认时间列').toBe(
      confirmOnce.data.confirmed_at
    );
  });

  test('264-03 预算版本审批：draft 到 approved 的审批人/时间双读，终态重复审批外显同源原文', async ({
    page,
  }) => {
    const planId = await ensureBudgetPlan(page);
    const marker = Date.now().toString().slice(-6);

    const created = await apiCall<BudgetVersionRow>(page, 'POST', '/budgets/versions', {
      plan_id: planId,
      version_no: `V264${marker}`,
      version_name: `E264预算版本${marker}`,
      total_amount: 500000,
      change_reason: 'e264 审批腿自建版本',
    });
    const version = created.data;
    expect(version.plan_id, '264-03 版本落库的 plan_id 与请求引用不一致').toBe(planId);
    expect(version.version_no, '264-03 version_no 落库值漂移').toBe(`V264${marker}`);
    expect(version.version_name, '264-03 version_name 落库值漂移').toBe(`E264预算版本${marker}`);
    expect(
      version.status,
      '264-03 建版本初始态必须写 draft（budget_management_service.rs:1535）'
    ).toBe(PA_STATUS.DRAFT);
    expect(version.approved_by, '264-03 draft 态审批人列应为 null').toBeNull();
    expect(version.approved_at, '264-03 draft 态审批时间列应为 null').toBeNull();
    expect(
      centsOf(version.total_amount, '264-03 版本 total_amount'),
      '264-03 版本总额落库值 != 提交值 500000'
    ).toBe(50000000);

    // 判据 7：读腿 {id} 是 plan_id、写腿 {id} 是 version id，同形不同义，按现状钉住
    const listBody = await apiCall<BudgetVersionRow[]>(page, 'GET', `/budgets/versions/${planId}`);
    const rows = listBody.data;
    expect(
      Array.isArray(rows),
      `264-03 读腿出参应为裸数组（handler :938-941 绕过 ApiResponse 且无分页信封），实际 typeof=${typeof rows}`
    ).toBe(true);
    const hitByPlan = rows.find(row => row.id === version.id);
    if (!hitByPlan) {
      throw new Error(
        `264-03 GET /budgets/versions/${planId} 未按 plan_id 命中自建版本，实际 ids=${rows
          .map(row => row.id)
          .join(',')}`
      );
    }
    expect(hitByPlan.status, '264-03 读腿版本状态与写腿不一致').toBe(PA_STATUS.DRAFT);
    expect(hitByPlan.total_amount, '264-03 读腿版本总额字符串与写腿不同源').toBe(
      version.total_amount
    );
    expect(hitByPlan.change_reason, '264-03 读腿变更原因落库值漂移').toBe('e264 审批腿自建版本');

    const approved = await apiCall<BudgetVersionRow>(
      page,
      'PUT',
      `/budgets/versions/${version.id}/approve`,
      {}
    );
    expect(
      approved.data.status,
      `264-03 审批后状态必须逐字符等于写入方词表的 approved（service :1576），实际 ${approved.data.status}`
    ).toBe('approved');
    expect(approved.data.approved_by, '264-03 审批人列应落为数值 user id').toEqual(
      expect.any(Number)
    );
    const approvedBy = Number(approved.data.approved_by);
    expect(
      Number.isInteger(approvedBy) && approvedBy > 0,
      `264-03 审批人应为正整数 user id，实际 ${approved.data.approved_by}`
    ).toBe(true);
    expect(approved.data.approved_at, '264-03 审批时间列应落为字符串').toEqual(expect.any(String));
    expect(
      Number.isFinite(Date.parse(String(approved.data.approved_at))),
      `264-03 审批时间不可解析：${approved.data.approved_at}`
    ).toBe(true);

    const readBack = await apiCall<BudgetVersionRow[]>(page, 'GET', `/budgets/versions/${planId}`);
    const approvedRow = readBack.data.find(row => row.id === version.id);
    if (!approvedRow) {
      throw new Error(
        `264-03 审批后按 plan_id 回读丢失该版本，ids=${readBack.data.map(row => row.id).join(',')}`
      );
    }
    expect(approvedRow.status, '264-03 审批状态未落库（双读不一致）').toBe('approved');
    expect(approvedRow.approved_by, '264-03 审批人双读不同源').toBe(approved.data.approved_by);
    expect(approvedRow.approved_at, '264-03 审批时间双读不同源（逐字符相等）').toBe(
      approved.data.approved_at
    );
    expect(
      centsOf(approvedRow.total_amount, '264-03 审批后总额'),
      '264-03 审批只应改状态与审批两列，版本总额被改写即恒等式破裂'
    ).toBe(50000000);
    expect(approvedRow.version_no, '264-03 审批后 version_no 被改写').toBe(`V264${marker}`);
    expect(approvedRow.created_by, '264-03 审批不应覆写建版人列').toBe(version.created_by);

    const again = await apiCallExpectFail(
      page,
      'PUT',
      `/budgets/versions/${version.id}/approve`,
      {}
    );
    expect(again.status, `264-03 终态重复审批应 400，实际 ${again.status}`).toBe(400);
    expect(failureCode(again), '264-03 重复审批机器码应为 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      again.message,
      `264-03 重复审批走 business_displayable（service :1572）应外显同源规则文案，实际 ${JSON.stringify(
        again.message
      )}`
    ).toBe('只有草稿状态的版本才能审批');

    const ghost = await apiCallExpectFail(page, 'PUT', '/budgets/versions/999999999/approve', {});
    expect(ghost.status, `264-03 审批不存在版本应 404，实际 ${ghost.status}`).toBe(404);
    expect(failureCode(ghost), '264-03 审批不存在版本机器码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    expect(ghost.message, '264-03 not_found 通道应脱敏').toBe(MASKED_NOT_FOUND_MESSAGE);

    const afterDenial = await apiCall<BudgetVersionRow[]>(
      page,
      'GET',
      `/budgets/versions/${planId}`
    );
    const unchanged = afterDenial.data.find(row => row.id === version.id);
    if (!unchanged) {
      throw new Error('264-03 拒绝腿回读丢失自建版本，无法证明零半截写');
    }
    expect(unchanged.status, '264-03 被拒的重复审批/幽灵 ID 审批改写了版本状态').toBe('approved');
    expect(unchanged.approved_at, '264-03 被拒请求覆写了审批时间').toBe(approved.data.approved_at);
    expect(unchanged.approved_by, '264-03 被拒请求覆写了审批人').toBe(approved.data.approved_by);
  });

  test('264-04 汇率查询口径：无日期入参而取最新生效行，DECIMAL 字符串与未知币种 404', async ({
    page,
  }) => {
    const seeded = await apiCall<ExchangeRateRow>(page, 'POST', '/exchange-rates', {
      from_currency: 'AUD',
      to_currency: 'AED',
      rate: 2.5,
      effective_date: '2024-01-05',
    });
    expect(
      typeof seeded.data.rate,
      `264-04 汇率出参应为字符串（handler :98 rate.to_string()），实际 typeof=${typeof seeded.data.rate}`
    ).toBe('string');
    expect(seeded.data.from_currency, '264-04 from_currency 落库值漂移').toBe('AUD');
    expect(seeded.data.to_currency, '264-04 to_currency 落库值漂移').toBe('AED');
    expect(seeded.data.effective_date, '264-04 effective_date 落库值漂移').toBe('2024-01-05');
    expect(Number(seeded.data.rate), '264-04 首条汇率数值不等于提交值 2.5').toBe(2.5);

    // 第二条：8 位小数 + 未来生效日，分别钉「小数位口径」与「取最新一条、与查询日无关」
    const seeded2 = await apiCall<ExchangeRateRow>(page, 'POST', '/exchange-rates', {
      from_currency: 'AUD',
      to_currency: 'AED',
      rate: 3.14159265,
      effective_date: '2999-12-31',
    });
    expect(
      Number(seeded2.data.rate),
      '264-04 8 位小数汇率被截断/失真（列 DECIMAL(20,8)，小数位口径判据）'
    ).toBe(3.14159265);

    const q = await apiCall<ExchangeRateRow>(
      page,
      'GET',
      '/exchange-rates/query?from_currency=AUD&to_currency=AED'
    );
    expect(typeof q.data.rate, '264-04 query 腿汇率应为字符串').toBe('string');
    expect(
      q.data.id,
      '264-04 query 腿未取最新生效日行（应按 effective_date DESC 取首条，currency_service.rs:132-137）'
    ).toBe(seeded2.data.id);
    expect(q.data.rate, '264-04 query 与写后回读的汇率字符串不同源').toBe(seeded2.data.rate);
    expect(q.data.effective_date, '264-04 query 腿生效日不等于未来生效行').toBe('2999-12-31');
    expect(Number(q.data.rate), '264-04 query 腿汇率数值口径漂移').toBe(3.14159265);
    expect(
      fractionLength(q.data.rate),
      '264-04 汇率小数位应保留到提交值的 8 位且不超过列 scale（DECIMAL(20,8)）'
    ).toBe(8);

    // 缺陷核心判据：带"查询日"参数仍返回同一最新行 → 本端点没有日期维度
    const withDateParam = await apiCall<ExchangeRateRow>(
      page,
      'GET',
      '/exchange-rates/query?from_currency=AUD&to_currency=AED&effective_date=2024-01-05'
    );
    expect(
      withDateParam.data.id,
      '264-04 传 effective_date 就换行，说明后端已按日期取数（与本 spec 记录的现状不同源，需同步改判据）'
    ).toBe(seeded2.data.id);
    expect(
      withDateParam.data.effective_date,
      '264-04 日期入参被忽略后的生效日不等于最新生效行'
    ).toBe('2999-12-31');

    const unknown = await apiCallExpectFail(
      page,
      'GET',
      '/exchange-rates/query?from_currency=AUD&to_currency=MTL'
    );
    expect(unknown.status, `264-04 未知币种对应 404 而非空 data，实际 ${unknown.status}`).toBe(404);
    expect(failureCode(unknown), '264-04 未知币种机器码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    expect(unknown.message, '264-04 not_found 通道应脱敏为资源未找到').toBe(
      MASKED_NOT_FOUND_MESSAGE
    );

    // 写入侧拒绝腿：P0-1 历史缺陷值 0.01 与 ISO 4217 形制门，两条都走 AppError::business（脱敏）
    const tooSmall = await apiCallExpectFail(page, 'POST', '/exchange-rates', {
      from_currency: 'AUD',
      to_currency: 'AED',
      rate: 0.01,
      effective_date: '2025-01-01',
    });
    expect(tooSmall.status, `264-04 0.01 汇率应被拒 400，实际 ${tooSmall.status}`).toBe(400);
    expect(failureCode(tooSmall), '264-04 0.01 汇率机器码应为 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      tooSmall.message,
      '264-04 汇率值防护走 business 脱敏通道（service :152-162），真实文案不外显'
    ).toBe(MASKED_BUSINESS_MESSAGE);

    const badCode = await apiCallExpectFail(page, 'POST', '/exchange-rates', {
      from_currency: 'aud',
      to_currency: 'AED',
      rate: 4.25,
      effective_date: '2025-01-01',
    });
    expect(badCode.status, `264-04 小写币种码应被拒 400，实际 ${badCode.status}`).toBe(400);
    expect(failureCode(badCode), '264-04 ISO 码门机器码应为 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(badCode.message, '264-04 ISO 码门同样走脱敏通道').toBe(MASKED_BUSINESS_MESSAGE);

    const notOverwritten = await apiCall<ExchangeRateRow>(
      page,
      'GET',
      '/exchange-rates/query?from_currency=AUD&to_currency=AED'
    );
    expect(notOverwritten.data.id, '264-04 被拒的写腿覆写了汇率行（应仍是最新生效行）').toBe(
      seeded2.data.id
    );
    expect(notOverwritten.data.rate, '264-04 被拒的写腿改动了汇率字符串').toBe(seeded2.data.rate);

    // 列表腿与 query 腿交叉验证同一行集合（列表侧 total 被 _total 丢弃，故只断可见集 —— 判据 8）
    const listBody = await apiCall<ExchangeRateRow[]>(
      page,
      'GET',
      '/exchange-rates?from_currency=AUD&page=1&page_size=100'
    );
    const mine = listBody.data
      .filter(row => row.from_currency === 'AUD' && row.to_currency === 'AED')
      .map(row => row.id)
      .sort((a, b) => a - b);
    expect(mine, '264-04 列表腿与写腿/query 腿的行集合不一致').toEqual(
      [seeded.data.id, seeded2.data.id].sort((a, b) => a - b)
    );
  });

  test('264-05 凭证号展示端点：前缀硬编码不随类型、无入参、真号源另派生，按废除清单钉形状', async ({
    page,
  }) => {
    const generated = await apiCall<{ voucher_no: string }>(page, 'GET', '/vouchers/generate-no');
    const voucherNo = generated.data.voucher_no;
    expect(
      typeof voucherNo,
      `264-05 出参键 voucher_no 应为字符串（handler :415-417），实际 typeof=${typeof voucherNo}`
    ).toBe('string');
    expect(
      voucherNo.startsWith('JZ'),
      `264-05 现状钉桩：该端点前缀硬编码 JZ（handler :407-413），实际 ${voucherNo}`
    ).toBe(true);
    const todayUtc = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(
      new RegExp(`^JZ${todayUtc}\\d{3}$`).test(voucherNo),
      `264-05 号形制应为 JZ+YYYYMMDD(UTC)+3 位流水（number_generator :74-75 取 UTC 日期、width 默认 3），实际 ${voucherNo}`
    ).toBe(true);

    // 带类型参数仍返回 JZ：证明签名不接入参（handler :401-403 只有 State），
    // 而真号源按类型派生前缀（voucher_ops/crud.rs:60-66 记→JZ/收→SK/付→FK/转→ZZ），
    // 故对「收」类凭证该端点给的前缀必错。后端若按类型派生，本断言判红即证明可移出废除清单。
    const withType = await apiCall<{ voucher_no: string }>(
      page,
      'GET',
      '/vouchers/generate-no?voucher_type=' + encodeURIComponent('收')
    );
    expect(
      withType.data.voucher_no.startsWith('SK'),
      `264-05 现状钉桩：真号源对「收」给 SK 前缀（crud.rs:62），本端点却忽略入参给 JZ，` +
        `实际 ${withType.data.voucher_no}——若已按类型派生则判红并应移出废除清单`
    ).toBe(false);

    const types = await apiCall<VoucherTypeRow[]>(page, 'GET', '/vouchers/types');
    const typeCodes = types.data.map(item => item.code);
    expect(
      typeCodes.includes('记'),
      `264-05 可写类型词表应含「记」（crud.rs:688-695），实际 ${typeCodes.join('/')}`
    ).toBe(true);
    expect(
      typeCodes.includes('收'),
      `264-05 可写类型词表应含「收」，实际 ${typeCodes.join('/')}`
    ).toBe(true);
    expect(
      typeCodes.includes('JZ'),
      `264-05 类型词表里不应存在取号前缀枚（JZ/SK/FK/ZZ 是前缀不是类型值），实际 ${typeCodes.join('/')}`
    ).toBe(false);
  });

  test('264-06 权限档：未登录 401 与 auditor 非授权 403，被拒后回读证明零半截写', async ({
    page,
    browser,
  }) => {
    const anonymousPaths = [
      '/period-adjustments?period=E264PERM&page=1&page_size=1',
      '/period-adjustments/1',
      '/budgets/versions/1',
      '/exchange-rates/query?from_currency=AUD&to_currency=AED',
      '/vouchers/generate-no',
    ];
    const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      for (const path of anonymousPaths) {
        const resp = await anonContext.request.get(`${API_BASE}${API_PREFIX}${path}`);
        const bodyText = await resp.text();
        let parsedCode: string | undefined;
        try {
          const parsed = JSON.parse(bodyText) as { code?: unknown };
          parsedCode = typeof parsed.code === 'string' ? parsed.code : undefined;
        } catch {
          parsedCode = undefined;
        }
        expect(resp.status(), `264-06 未登录 GET ${path} 应 401，实际 ${resp.status()}`).toBe(401);
        expect(
          parsedCode,
          `264-06 未登录 GET ${path} 失败体机器码应为 UNAUTHORIZED（utils/error.rs:785），` +
            `实际 body 前 120 字符 ${bodyText.slice(0, 120)}`
        ).toBe(CODE_UNAUTHORIZED);
      }
    } finally {
      await anonContext.close();
    }

    // 非授权角色：种子授予集不含 period-adjustments（判据见文件头），auditor 亦无 budgets/exchange-rates/vouchers
    await loginAsRole(page, 'auditor');
    const writeAttempt = await apiCallExpectFail(page, 'POST', '/period-adjustments', {
      adjustment_type: 'provision',
      period: 'E264PERM',
      description: 'E264越权写',
      debit_subject_code: 'E264D',
      debit_subject_name: 'E264借',
      credit_subject_code: 'E264C',
      credit_subject_name: 'E264贷',
      amount: 100,
      remarks: 'x',
    });
    expectDenied(writeAttempt, '264-06 auditor POST /period-adjustments 应被 RBAC 拒绝');

    const deniedRequests: Array<['GET' | 'PUT', string]> = [
      ['GET', '/period-adjustments?page=1&page_size=1'],
      ['GET', '/period-adjustments/1'],
      ['GET', '/budgets/versions/1'],
      ['PUT', '/budgets/versions/1/approve'],
      ['GET', '/exchange-rates/query?from_currency=AUD&to_currency=AED'],
      ['GET', '/vouchers/generate-no'],
    ];
    for (const [method, path] of deniedRequests) {
      const denied = await apiCallExpectFail(page, method, path, method === 'PUT' ? {} : undefined);
      expectDenied(denied, `264-06 auditor ${method} ${path} 应被 RBAC 拒绝`);
    }

    // 换回本 worker 的管理员会话回读，证明 403 拒绝未留下半截写
    await loginViaUI(page, testUsername(), testPassword(), true);
    const afterDenial = await apiCall<PeriodAdjustmentListBody>(
      page,
      'GET',
      '/period-adjustments?period=E264PERM&page=1&page_size=50'
    );
    expect(
      afterDenial.data.total,
      `264-06 403 拒绝后仍发生写入：期间 E264PERM 台账 total=${afterDenial.data.total}`
    ).toBe(0);
    const versionProbe = await apiCall<BudgetVersionRow[]>(page, 'GET', '/budgets/versions/1');
    expect(
      versionProbe.data.filter(row => row.version_name.startsWith('E264越权')).length,
      '264-06 auditor 的越权审批腿在 plan_id=1 下产生了版本行'
    ).toBe(0);
  });
});
