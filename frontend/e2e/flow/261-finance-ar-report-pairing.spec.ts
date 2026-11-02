// 本文件守的缺陷族：报表族六条腿（AR 账龄/按业务员账龄/日报/月报/统计/收款单打印）在主干
// 有界面入口但 e2e 从未与后端出参逐字配对，具体可能形态是档位键名漂移（前端列恒空）、
// total_overdue 与四档合计不再钩稽（分桶边界被改动却无人发现）、baseline_date 参数被静默忽略、
// DRAFT 与 CANCELLED 排除门退化（草稿计进应收）、Decimal 退化成数字或 null、
// 打印腿断供后仍返回 200 空壳、拒绝腿退化成 text/plain 裸文本或数字 code。
// 判据来源全部逐行取自后端源码，文件名与行号写在本文件注释里，改判据必须先改源码。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallRaw,
  failureCode,
  loginAsRole,
} from './helpers';

type Row = Record<string, unknown>;

/**
 * 提取器请求解码拒绝的固定公开文案。
 * 判据来源 backend/src/utils/error.rs（pub const REQUEST_DECODING_PUBLIC），
 * 映射点 backend/src/middleware/trace_context.rs（normalize_extractor_rejection
 * 把 axum Query/Path 的纯文本 400 拒绝转成 AppError::request_decoding_failed，
 * 即 400 + code=VALIDATION_ERROR + 本常量原文，见 utils/error.rs）。
 * 该文案走的是 ValidationErrorDisplayable（可外显通道），所以逐字符断言是合法的；
 * 换成 business 或 validation 的脱敏通道就只能断机器码。
 */
const REQUEST_DECODING_PUBLIC =
  '请求格式不正确：请求体或查询参数存在缺失的必填字段、字段类型错误或内容类型错误，请修正后重试';

/**
 * NotFound 族的脱敏常量。
 * 判据来源 backend/src/utils/messages.rs（err_msg::NOT_FOUND_PUBLIC），
 * 出参映射点 backend/src/utils/error.rs（AppError::NotFound(_) => NOT_FOUND_PUBLIC）。
 * 收款单打印腿的「收款单 N 未找到」走的是 AppError::not_found（脱敏通道，
 * backend/src/services/print_service.rs），原文只进日志不进出参，
 * 所以本文件断的是这条固定常量，不是点名文案（缺陷已写进文件头回报面）。
 */
const NOT_FOUND_PUBLIC = '资源未找到';

/** docx 的 CONTENT_TYPE 与文件名口径：backend/src/utils/docx_export.rs */
const DOCX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 统一失败信封的键集（backend/src/utils/error.rs ErrorResponse 四字段，无第五键） */
const FAILURE_ENVELOPE_KEYS = ['code', 'message', 'timestamp', 'trace_id'];

/** 统计报表键集（backend/src/services/ar_ops/report.rs build_statistics_response） */
const STATISTICS_KEYS = [
  'collection_rate',
  'overdue_amount',
  'overdue_count',
  'paid_amount',
  'total_amount',
  'total_invoices',
  'unpaid_amount',
];

/** 账龄报表键集（backend/src/services/ar_ops/report.rs build_aging_response） */
const AGING_KEYS = [
  'bucket_0_30',
  'bucket_31_60',
  'bucket_61_90',
  'bucket_90_plus',
  'invoice_count',
  'not_due',
  'total_overdue',
];

/** 日报行键集（backend/src/services/ar_ops/report.rs） */
const DAILY_ROW_KEYS = ['date', 'invoice_amount', 'invoice_count', 'paid_amount', 'unpaid_amount'];

/** 月报行键集（backend/src/services/ar_ops/report.rs） */
const MONTHLY_ROW_KEYS = [
  'month',
  'invoice_amount',
  'invoice_count',
  'paid_amount',
  'unpaid_amount',
];

/** 按业务员账龄行键集（backend/src/services/ar_ops/report.rs） */
const AGING_BY_SP_ROW_KEYS = [
  'bucket_0_30',
  'bucket_31_60',
  'bucket_61_90',
  'bucket_90_plus',
  'invoice_count',
  'not_due',
  'salesperson_id',
  'total_overdue',
];

/** i32 上界哨兵：主键取不到任何真实行（客户/业务员/收款单三条负腿共用） */
const IMAX = 2147483647;

function requireNum(value: unknown, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label}：期望正整数主键，实际 raw=${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * Decimal 出参折分位。
 * 后端全部报表金额键都是 rust_decimal 的 to_string（如
 * backend/src/services/ar_ops/report.rs、:184、:504），即 JSON 字符串；
 * 这里先显式断 typeof 再比较，键缺失或被改成 number/null 时当场判红，
 * 不做 String() 强转、不做 ?? 兜底。标度超出两位且残位非零同样抛错（不静默截断）。
 */
function amountCents(value: unknown, label: string): bigint {
  expect(
    typeof value,
    `${label}：后端 Decimal 出参必须是字符串（to_string），实际 raw=${JSON.stringify(value)}`
  ).toBe('string');
  const s = String(value).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 字符串形态非法 raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > 2 && frac.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：Decimal 标度超出分位且残位非零 raw="${s}"`);
  }
  const v = BigInt((intPart + frac).padEnd(intPart.length + 2, '0'));
  return sign === '-' ? -v : v;
}

function expectAmount(value: unknown, expectedCents: bigint, label: string): void {
  expect(amountCents(value, label).toString(), `${label}（分位精确比较）`).toBe(
    expectedCents.toString()
  );
}

function assertExactKeys(obj: Row, keys: string[], label: string): void {
  expect(Object.keys(obj).sort(), `${label}：出参键集必须与后端 json! 字面逐字相等`).toEqual(keys);
}

/** 账龄族共用的钩稽恒等式：total_overdue 恒等于四档逾期之和（report.rs 的定义式） */
function assertAgingReconcile(row: Row, label: string): void {
  const sum =
    amountCents(row.bucket_0_30, `${label} bucket_0_30`) +
    amountCents(row.bucket_31_60, `${label} bucket_31_60`) +
    amountCents(row.bucket_61_90, `${label} bucket_61_90`) +
    amountCents(row.bucket_90_plus, `${label} bucket_90_plus`);
  expect(amountCents(row.total_overdue, `${label} total_overdue`), `${label}：档位钩稽`).toBe(sum);
}

/**
 * 二进制与原始出参读取入口（apiCall 只解析 JSON 成功信封、apiCallExpectFail 只回
 * status/code/message，本文件还要逐键断统一信封的 trace_id 与 timestamp，
 * 以及打印腿的响应头与字节流，故另开一条窄通道，不复用被收窄过的助手）。
 */
async function rawGet(page: Page, path: string) {
  const resp = await page.request.get(`${API_BASE}${API_PREFIX}${path}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  return {
    status: resp.status(),
    headers: resp.headers(),
    bodyText: await resp.text(),
    bytes: await resp.body(),
  };
}

/** 建一个本次运行专属客户，用于把报表筛选口径与并发 worker 的数据彻底隔离 */
async function createIsolatedCustomer(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E2E 261 报表客户 ${tag}`,
    status: 'active',
  });
  return requireNum(created.id, '新建客户主键');
}

async function cancelInvoice(page: Page, id: number, reason: string): Promise<void> {
  await apiCall(page, 'POST', `/ar/invoices/${id}/cancel`, { reason });
}

/** 本次运行的隔离后缀：客户名与单号备注都带上它，跨 worker 与跨用例互不相撞 */
const RUN_TAG = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * 应收报表族与收款单打印配对 E2E（五枚 test）
 *
 * 功能。把主干有界面入口、e2e 从未配对过的六条腿逐键钉死。GET /ar/reports/statistics 断
 * 七个出参键与后端 json! 字面逐字相等、四个金额键必须是字符串三个计数比率键必须是数字，
 * 并断「已收加未收等于票面合计」与「回款率等于已收除以票面合计」两条可失败钩稽恒等式。
 * GET /ar/reports/daily 与 /monthly 与 statistics 在同一筛选谓词下做三腿互钩（日报按日键前
 * 七位导出月键必须逐字符等于月报的月键，票数与三个金额键的求和必须逐键等于月报，月报合计
 * 必须等于统计的单聚合值）。GET /ar/reports/aging 断分档键集合与源码写死的档位口径一致，
 * 用一张专属客户下的八张发票把每个档位的左右边界各摆两笔（相差一日与三十日落 0-30、
 * 三十一与六十落 31-60、六十一与九十落 61-90、九十一落 90 以上、基准日之后落 not_due），
 * 逐档金额必须精确等于对应票据，并断 total_overdue 等于四档之和、not_due 加 total_overdue
 * 等于该客户未收合计（total_overdue 的定义式在 report.rs）。同一批数据顺带把
 * DRAFT 与 CANCELLED 两道排除门跑成真实计数差（草稿期八张全不计入、审批后全计入、
 * 取消一张后计数与合计同步退出）。GET /ar/reports/aging/by-salesperson 断基准日逐字符回显
 * 与顶层两键。GET /ar/collections/{id}/print 断 docx 的 content-type、文件名与 zip 魔数
 * PK 与字节非空（拒绝 200 空壳）。参数门逐条断 400 加 VALIDATION_ERROR 加逐字符公开文案，
 * 拒绝腿与成功腿绝不并成「任一非 2xx」。
 *
 * 调用方。Playwright 串行链，主会话恒为 worker 专属超管（loginAsRole(page,'admin')）。
 * 界面锚点零使用，本文件全是契约腿，界面侧的报表页入口已由前端 views/ar/tabs/ArReportTab.vue
 * 承载（api/ar.ts 的四个封装即本文件所配对的后端出参）。二进制与失败信封逐键读取
 * 走本文件内自建的 rawGet（helpers 的 apiCall 只解析 JSON 成功信封、apiCallExpectFail 只回
 * status 与 code 与 message，拿不到 trace_id 与 timestamp 与响应头）。
 * 路由与 handler 依据。backend/src/routes/finance.rs（ar_report_routes 五条 .route）、
 * finance.rs（/ar/collections/{id}/print 挂 print_handler::ar_collection_print_docx）、
 * backend/src/routes/mod.rs 的 erp nest 前缀（前端 baseURL /api/v1/erp 已含，调用只写其后）。
 *
 * 入参。报表族查询参数只有 start_date 与 end_date 与 customer_id 与 baseline_date 与
 * salesperson_id 五个（backend/src/handlers/ar_report_handler.rs，无分页字段、
 * 无 deny_unknown_fields，故 page 与 year 之类多余参数被静默忽略，本文件把该现状钉成
 * 显式断言）。日期一律 YYYY-MM-DD 补零串，金额一律两位小数字符串。打印腿的路径参数是
 * ar_collection 主键。负腿哨兵统一取 i32 上界 2147483647，不依赖任何存量数据。
 *
 * 传给谁。POST /crm/customers 建本次运行专属客户以隔离筛选口径，POST /ar/invoices
 * （CreateArInvoiceRequestDto）加 POST /ar/invoices/{id}/approve 建八张已审批应收发票，
 * POST /ar/payments（CreateArPaymentRequest，customer_id 与 amount 与 payment_method 与
 * payment_date 必填）建可打印的收款单，POST /ar/invoices/{id}/cancel 收尾退出报表口径。
 *
 * 存什么。ar_invoices 行的 invoice_date 与 due_date 与 invoice_amount 与 unpaid_amount
 * 与 status（大写词值 DRAFT 与 APPROVED 与 CANCELLED，唯一来源
 * backend/src/models/status/general.rs，报表侧排除门即绑这两个常量）；
 * ar_collections 行的 collection_no 与 collection_amount 与 status；
 * print_audit 由打印腿 best-effort 异步写（print_handler.rs）。
 * 存哪里。PostgreSQL ar_invoices 与 ar_collections 与 print_audit_logs。报表四条腿的读侧
 * 有一层 60 秒结果缓存（ar_report_handler.rs，CacheService），故本文件对同一参数的
 * 观测只读一次，DRAFT 前后与取消后的三组观测刻意用三个不同的区间表达式承载，
 * 避免把缓存陈旧值误当成判据。
 *
 * 契约真相与本文件查出的后端缺陷（逐条对着源码核对）。
 * 1) 报表族四条腿直出聚合值，不套 PaginatedResponse{items,total,page,page_size}
 *    （utils/response.rs），载荷键就是 build_*_response 的 json! 字面
 *    （services/ar_ops/report.rs、:181-187、:271-277、:498-506、:564-573、:577-580），
 *    日报与月报是裸数组不是行集对象。本文件按实际形状建模，不发明 items 键。
 * 2) 缺陷（要交接）。账龄腿的缓存键只由 customer_id 与 salesperson_id 拼成
 *    （backend/src/handlers/ar_report_handler.rs），baseline_date 不在键内，
 *    同一客户在同一区间内换基准日会命中上一份陈旧结果，即 baseline_date 在 60 秒内被静默吞掉。
 *    按业务员腿的键含 baseline_date（同文件 :180），对照可见是漏写而非设计。
 *    本文件因此对每个（customer_id，salesperson_id）组合只发一次账龄请求，不据此判绿也不据此判红。
 * 3) 缺陷（要交接）。ar_invoices.salesperson_id 全仓无写入方，
 *    backend/src/services/ar_invoice_service.rs 与 :214-245 两处建模型都以
 *    ..Default::default() 收尾，没有任何 Set(salesperson_id)，销售发货自动应收同口径。
 *    于是 GET /ar/reports/aging/by-salesperson 的 WHERE salesperson_id IS NOT NULL
 *    （services/ar_ops/report.rs）恒零行，按业务员账龄与 aging 的 salesperson_id 筛选
 *    两条腿在真实数据上不可达，前端 api/ar.ts 也只注释而未调用该端点。
 *    本文件把「恒空」钉成显式断言（261-05），一旦补齐写入口本断言即判红，逼后续把行内钩稽与
 *    aging 双腿等值配对补上，而不是让这条腿静默挂着。
 * 4) 收款单打印的「未找到」拒因走的是脱敏通道，AppError::not_found
 *    （backend/src/services/print_service.rs）出参恒为固定常量「资源未找到」
 *    （utils/messages.rs 与 utils/error.rs），点名单号的原文只进日志，
 *    故 261-03 断该常量而非点名文案，缺陷属可外显族选道偏差，一并交接。
 * 5) 行级归属门对「行不存在」直接放行（print_service.rs 的 let Some(owner) else
 *    return Ok），所以不存在的收款单 id 到不了 403，必定走到取数分支的 404，
 *    261-03 的负腿据此断 404 而不是断 403 或断「任一非 2xx」。
 * 6) 提取器解码拒绝的可外显文案唯一（utils/error.rs 的 REQUEST_DECODING_PUBLIC，
 *    经 :890-896 的 request_decoding_failed 走 ValidationErrorDisplayable），
 *    映射点在 middleware/trace_context.rs，族别是 400 加 VALIDATION_ERROR，
 *    不是 axum 默认的 422 纯文本。
 * 7) 逾期口径与账龄口径不同源是刻意的。统计腿的逾期用当天（report.rs），
 *    账龄腿的逾期用 baseline_date 且只取 unpaid_amount 大于零的行（report.rs），
 *    所以 261-04 只在两者必然重合的日期区间上断各自的值，不做跨腿的逾期金额等值。
 *
 * 成功面缺口。按业务员账龄的逐行档位与 aging 双腿等值配对需要 ar_invoices.salesperson_id
 * 有值才可跑（见第 3 条，全仓无写入口，后端也没有该列的写入端点或种子），
 * 本文件不用 psql 直连改列来凑绿，只钉现状并把缺口交接；其余四条腿的成功面全部由
 * 本文件自建的专属客户与八张固定到期日发票确定性地跑到非空。
 */
test.describe('261 应收报表族与收款单打印 契约配对', () => {
  test('261-01 GET /ar/reports/statistics 键面、类型面与回款率钩稽', async ({ page }) => {
    await loginAsRole(page, 'admin');
    const res = await apiCall<Row>(page, 'GET', '/ar/reports/statistics');
    expect(res.code, '统计报表成功信封 code 应为 200').toBe(200);
    expect(
      Object.keys(res).sort(),
      '统计报表顶层只有 ApiResponse{code,data}，报表族不套分页信封（utils/response.rs）'
    ).toEqual(['code', 'data']);

    const data = res.data;
    expect(typeof data, '统计报表载荷应是单聚合对象而非数组').toBe('object');
    expect(Array.isArray(data), '统计报表载荷不是行集').toBe(false);
    assertExactKeys(data as Row, STATISTICS_KEYS, '统计报表载荷键集');

    const row = data as Row;
    for (const key of ['total_amount', 'paid_amount', 'unpaid_amount', 'overdue_amount']) {
      expect(typeof row[key], `统计报表 ${key} 必须是 Decimal 字符串`).toBe('string');
    }
    for (const key of ['total_invoices', 'overdue_count', 'collection_rate']) {
      expect(typeof row[key], `统计报表 ${key} 必须是 JSON number`).toBe('number');
    }

    const total = amountCents(row.total_amount, '统计 total_amount');
    const paid = amountCents(row.paid_amount, '统计 paid_amount');
    const unpaid = amountCents(row.unpaid_amount, '统计 unpaid_amount');
    expect(
      paid + unpaid,
      '已收加分文必须等于票面合计（report.rs 三条 SUM 的账本恒等式）'
    ).toBe(total);
    expect(
      Number(row.overdue_amount),
      '逾期金额是非负项求和（report.rs 的 CASE 只计 unpaid_amount 大于零的行）'
    ).toBeGreaterThanOrEqual(0);
    expect(
      Number(row.overdue_count),
      '逾期票数不可能超过总票数（同一 NOT IN 门内取子集，report.rs）'
    ).toBeLessThanOrEqual(Number(row.total_invoices));

    const rate = Number(row.collection_rate);
    if (total === 0n) {
      expect(rate, '票面合计为零时回款率走 else 分支恒为零（report.rs）').toBe(0);
    } else {
      const expected = Number(paid.toString()) / Number(total.toString());
      expect(
        Math.abs(rate - expected),
        `回款率必须等于已收除以票面合计，实际 rate=${rate} expected=${expected}`
      ).toBeLessThan(1e-9);
    }
  });

  test('261-02 报表族参数门逐码逐文案，未登记参数被忽略', async ({ page }) => {
    await loginAsRole(page, 'admin');
    const gates: Array<{ path: string; why: string }> = [
      { path: '/ar/reports/statistics?start_date=2026-13-45', why: '月 13 越界' },
      { path: '/ar/reports/statistics?end_date=not-a-date', why: '非日期字面量' },
      { path: '/ar/reports/aging?customer_id=abc', why: 'i32 位传非数字' },
      { path: '/ar/reports/aging/by-salesperson?baseline_date=2026-02-30', why: '二月三十不存在' },
      { path: '/ar/reports/daily?start_date=2026-1-1', why: '未补零的日期串' },
      { path: '/ar/reports/monthly?customer_id=1.5', why: 'i32 位传小数' },
    ];
    for (const gate of gates) {
      const fail = await rawGet(page, gate.path);
      expect(fail.status, `${gate.path}（${gate.why}）应 400`).toBe(400);
      const body = JSON.parse(fail.bodyText) as Row;
      assertExactKeys(body, FAILURE_ENVELOPE_KEYS, `${gate.path} 失败信封键集`);
      expect(failureCode(body), `${gate.path} 机器码`).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(body.message, `${gate.path} 拒因文案必须逐字符等于提取器解码公开的固定文案`).toBe(
        REQUEST_DECODING_PUBLIC
      );
      expect(typeof body.trace_id, '失败信封 trace_id 必须是字符串').toBe('string');
      expect(String(body.trace_id).length, '失败信封 trace_id 必须非空').toBeGreaterThan(0);
      expect(typeof body.timestamp, '失败信封 timestamp 是 i64 序列化成 JSON number').toBe(
        'number'
      );
      expect(
        fail.headers['content-type'] ?? '',
        '解码拒绝不得再以 text/plain 裸文本出参（error.rs 族规）'
      ).toContain('application/json');
    }

    const ignored = await apiCall<Row>(
      page,
      'GET',
      '/ar/reports/statistics?page=1&page_size=5&year=2020'
    );
    expect(ignored.code, '未登记参数不改变请求结果（ArReportQuery 无 deny_unknown_fields）').toBe(
      200
    );
    assertExactKeys(ignored.data as Row, STATISTICS_KEYS, '多余分页与 year 参数被忽略后的统计键集');
  });

  test('261-03 GET /ar/collections/{id}/print 出件三证与不存在收款单的拒绝腿', async ({ page }) => {
    await loginAsRole(page, 'admin');
    const customerId = await createIsolatedCustomer(page, RUN_TAG);
    const payment = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
      customer_id: customerId,
      amount: '321.09',
      payment_method: '银行转账',
      payment_date: '2020-02-02',
      remark: 'e2e 261 打印腿',
    });
    const collectionId = requireNum(payment.id, '新建收款单主键');
    expectAmount(payment.collection_amount, 32109n, '收款单出参金额');
    expect(typeof payment.collection_no, '收款单号必须是字符串（models/ar_collection.rs）').toBe(
      'string'
    );

    const ok = await rawGet(page, `/ar/collections/${collectionId}/print`);
    expect(ok.status, '真实收款单打印应 200（内置默认模板已随启动种子落库）').toBe(200);
    expect(
      ok.headers['content-type'],
      '打印腿 content-type 必须是 docx 的固定 MIME（docx_export.rs）'
    ).toBe(DOCX_CONTENT_TYPE);
    expect(
      ok.headers['content-disposition'],
      '文件名口径是 {doc_type}_{id}.docx（print_handler.rs + docx_export.rs）'
    ).toBe(`attachment; filename="ar_collection_${collectionId}.docx"`);
    expect(ok.bytes.length, '打印字节流非空即真出件，不接受 200 空壳').toBeGreaterThan(0);
    expect(
      ok.bytes.subarray(0, 2).toString('latin1'),
      'docx 即 zip 容器，头部两字节必须是 PK'
    ).toBe('PK');

    const ghost = await rawGet(page, `/ar/collections/${IMAX}/print`);
    expect(ghost.status, '不存在的收款单打印应 404（print_service.rs）').toBe(404);
    const ghostBody = JSON.parse(ghost.bodyText) as Row;
    assertExactKeys(ghostBody, FAILURE_ENVELOPE_KEYS, '打印 404 失败信封键集');
    expect(failureCode(ghostBody), '打印 404 机器码').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      ghostBody.message,
      '打印 404 走的是 not_found 脱敏通道，出参恒为固定常量「资源未找到」，点名单据号的原因只进日志'
    ).toBe(NOT_FOUND_PUBLIC);
    expect(typeof ghostBody.trace_id, '打印 404 必须有 trace_id').toBe('string');
  });

  test('261-04 应收报表族：草稿取消排除门、日报月报统计三腿钩稽、账龄档位边界与业务员筛选门', async ({
    page,
  }) => {
    test.slow();
    await loginAsRole(page, 'admin');
    const customerId = await createIsolatedCustomer(page, RUN_TAG);
    const INVOICE_DATE = '2020-01-05';
    const BASELINE = '2020-06-30';
    const specs: Array<[string, string, bigint]> = [
      ['2020-07-05', '111.11', 11111n],
      ['2020-06-29', '222.22', 22222n],
      ['2020-05-31', '333.33', 33333n],
      ['2020-05-30', '444.44', 44444n],
      ['2020-05-01', '555.55', 55555n],
      ['2020-04-30', '666.66', 66666n],
      ['2020-04-01', '777.77', 77777n],
      ['2020-03-31', '888.88', 88888n],
    ];
    const GRAND = specs.reduce((acc, s) => acc + s[2], 0n);

    const draftIds: number[] = [];
    for (const spec of specs) {
      const inv = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
        customer_id: customerId,
        invoice_amount: spec[1],
        invoice_date: INVOICE_DATE,
        due_date: spec[0],
      });
      draftIds.push(requireNum(inv.id, `建应收草稿（到期日 ${spec[0]}）`));
    }

    const winDraft = `?customer_id=${customerId}&start_date=2020-01-05&end_date=2020-01-05`;
    const statDraft = await apiCallRaw<Row>(page, 'GET', `/ar/reports/statistics${winDraft}`);
    assertExactKeys(statDraft, STATISTICS_KEYS, '草稿期统计键集');
    expect(Number(statDraft.total_invoices), '八张草稿票一张都不计入').toBe(0);
    for (const key of ['total_amount', 'paid_amount', 'unpaid_amount', 'overdue_amount']) {
      expectAmount(statDraft[key], 0n, `草稿期统计 ${key}`);
    }
    const dailyDraft = await apiCallRaw<Row[]>(page, 'GET', `/ar/reports/daily${winDraft}`);
    expect(Array.isArray(dailyDraft), '日报载荷是裸数组（report.rs）').toBe(true);
    expect(dailyDraft.length, '草稿期日报零行').toBe(0);
    const monthlyDraft = await apiCallRaw<Row[]>(page, 'GET', `/ar/reports/monthly${winDraft}`);
    expect(monthlyDraft.length, '草稿期月报零行（与日报同一 NOT IN 排除门，report.rs）').toBe(
      0
    );

    for (const id of draftIds) {
      await apiCall(page, 'POST', `/ar/invoices/${id}/approve`);
    }

    const winWide = `?customer_id=${customerId}&start_date=2020-01-01&end_date=2020-12-31`;
    const stat = await apiCallRaw<Row>(page, 'GET', `/ar/reports/statistics${winWide}`);
    expect(Number(stat.total_invoices), '审批后八张票全部计入').toBe(8);
    expectAmount(stat.total_amount, GRAND, '统计票面合计');
    expectAmount(stat.paid_amount, 0n, '统计已收（本批收款未关联任何发票）');
    expectAmount(stat.unpaid_amount, GRAND, '统计未收');
    expect(Number(stat.overdue_count), '到期日全在 2020 年，按当天口径逐张判逾期').toBe(8);
    expectAmount(stat.overdue_amount, GRAND, '统计逾期合计等于未收合计');
    expect(Number(stat.collection_rate), '已收为零则回款率为零').toBe(0);

    const daily = await apiCallRaw<Row[]>(page, 'GET', `/ar/reports/daily${winWide}`);
    expect(daily.length, '八个发票日同一天则日报单行').toBe(1);
    assertExactKeys(daily[0], DAILY_ROW_KEYS, '日报行键集');
    expect(daily[0].date, '日报日期键逐字符等于发票日').toBe(INVOICE_DATE);
    expect(Number(daily[0].invoice_count), '日报票数').toBe(8);
    expectAmount(daily[0].invoice_amount, GRAND, '日报票面额');
    expectAmount(daily[0].paid_amount, 0n, '日报已收');
    expectAmount(daily[0].unpaid_amount, GRAND, '日报未收');

    const monthly = await apiCallRaw<Row[]>(page, 'GET', `/ar/reports/monthly${winWide}`);
    expect(monthly.length, '跨单月则月报单行').toBe(1);
    assertExactKeys(monthly[0], MONTHLY_ROW_KEYS, '月报行键集');
    expect(monthly[0].month, '月键格式来自 to_char YYYY-MM（report.rs）').toBe('2020-01');

    // 三腿钩稽：日聚合求和 == 月聚合求和 == 单聚合统计，同一筛选谓词下三者必须逐键相等
    const sumBy = (rows: Row[], key: string): bigint =>
      rows.reduce((acc, r) => acc + amountCents(r[key], `行集 ${key}`), 0n);
    const sumCount = (rows: Row[]): number =>
      rows.reduce((acc, r) => acc + Number(r.invoice_count), 0);
    const monthFromDaily = daily.map(r => String(r.date).slice(0, 7));
    expect(monthFromDaily, '月键必须由日键前七位导出（同一 invoice_date 列）').toEqual(
      monthly.map(r => r.month)
    );
    expect(sumCount(daily), '日报票数合计等于月报票数合计').toBe(sumCount(monthly));
    expect(sumCount(monthly), '月报票数合计等于统计总票数').toBe(Number(stat.total_invoices));
    for (const key of ['invoice_amount', 'paid_amount', 'unpaid_amount']) {
      expect(sumBy(daily, key).toString(), `日报 ${key} 求和必须等于月报同键求和`).toBe(
        sumBy(monthly, key).toString()
      );
    }
    expect(sumBy(monthly, 'invoice_amount').toString(), '月报票面求和等于统计票面合计').toBe(
      amountCents(stat.total_amount, '统计 total_amount').toString()
    );

    const aging = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar/reports/aging?customer_id=${customerId}&baseline_date=${BASELINE}`
    );
    assertExactKeys(aging, AGING_KEYS, '账龄报表键集');
    expectAmount(aging.not_due, 11111n, '账龄未到期档（due_date >= 基准日，report.rs）');
    expectAmount(
      aging.bucket_0_30,
      22222n + 33333n,
      '0-30 档必须含相差一日与相差三十日两笔（report.rs 的差值小于等于 30）'
    );
    expectAmount(
      aging.bucket_31_60,
      44444n + 55555n,
      '31-60 档必须含相差三十一年与相差六十日两笔（report.rs 的 BETWEEN 31 AND 60）'
    );
    expectAmount(
      aging.bucket_61_90,
      66666n + 77777n,
      '61-90 档必须含相差六十一日与相差九十日两笔（report.rs）'
    );
    expectAmount(
      aging.bucket_90_plus,
      88888n,
      '九十日以上档从相差九十一日开始（report.rs 的差值大于 90）'
    );
    expect(Number(aging.invoice_count), '账龄票数只计 unpaid_amount 大于零的行').toBe(8);
    assertAgingReconcile(aging, '账龄档位');
    const unpaidAll =
      amountCents(aging.not_due, '账龄 not_due') +
      amountCents(aging.total_overdue, '账龄 total_overdue');
    expect(unpaidAll, '未到期加逾期合计必须等于该客户未收合计').toBe(GRAND);

    // 业务员筛选谓词独立成键（缓存键含 salesperson_id，与上一笔账龄请求不撞），
    // 本客户八张票的 salesperson_id 恒为 NULL，故该谓词下必须逐键归零。
    const agingSp = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar/reports/aging?customer_id=${customerId}&baseline_date=${BASELINE}&salesperson_id=${IMAX}`
    );
    assertExactKeys(agingSp, AGING_KEYS, '按不存在业务员筛选的账龄键集');
    for (const key of [
      'not_due',
      'bucket_0_30',
      'bucket_31_60',
      'bucket_61_90',
      'bucket_90_plus',
      'total_overdue',
    ]) {
      expectAmount(agingSp[key], 0n, `业务员筛选后账龄 ${key}`);
    }
    expect(
      Number(agingSp.invoice_count),
      '业务员筛选后票数必须为零（report.rs 的等值谓词）'
    ).toBe(0);
    assertAgingReconcile(agingSp, '业务员筛选后账龄');

    await cancelInvoice(page, draftIds[0], 'e2e 261 取消门验证');
    const winCancel = `?customer_id=${customerId}&start_date=2020-01-05&end_date=2020-12-31`;
    const statCancelled = await apiCallRaw<Row>(page, 'GET', `/ar/reports/statistics${winCancel}`);
    expect(Number(statCancelled.total_invoices), '取消票被排除门剔除，计数降到七').toBe(7);
    expectAmount(
      statCancelled.total_amount,
      GRAND - 11111n,
      '取消票票面额必须从合计里整笔退出（report.rs 的 NOT IN 绑 CANCELLED 与 DRAFT）'
    );
    const dailyCancelled = await apiCallRaw<Row[]>(page, 'GET', `/ar/reports/daily${winCancel}`);
    expect(dailyCancelled.length, '取消后日报仍单行').toBe(1);
    expect(Number(dailyCancelled[0].invoice_count), '取消后日报票数同步降到七').toBe(7);

    for (const id of draftIds.slice(1)) {
      await cancelInvoice(page, id, 'e2e 261 收尾清理');
    }
  });

  test('261-05 按业务员账龄腿：基准日回显、载荷键面与写入侧缺口现状', async ({ page }) => {
    await loginAsRole(page, 'admin');
    const res = await apiCall<Row>(page, 'GET', '/ar/reports/aging/by-salesperson');
    expect(res.code, '按业务员账龄默认基准日请求应 200').toBe(200);
    const loose = res.data as Row;
    assertExactKeys(loose, ['baseline_date', 'by_salesperson'], '按业务员账龄顶层键集');
    expect(
      String(loose.baseline_date),
      '缺省基准日必须是当天日期串（report.rs 的 unwrap_or_else）'
    ).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    for (const baseline of ['2020-06-30', '2100-01-01']) {
      const data = await apiCallRaw<Row>(
        page,
        'GET',
        `/ar/reports/aging/by-salesperson?baseline_date=${baseline}`
      );
      assertExactKeys(data, ['baseline_date', 'by_salesperson'], `基准日 ${baseline} 顶层键集`);
      expect(data.baseline_date, `基准日必须逐字符回显入参（report.rs 直接输出 today）`).toBe(
        baseline
      );
      expect(Array.isArray(data.by_salesperson), 'by_salesperson 必须是行数组').toBe(true);
      const rows = data.by_salesperson as Row[];
      for (const row of rows) {
        assertExactKeys(row, AGING_BY_SP_ROW_KEYS, `业务员 ${baseline} 行键集`);
        assertAgingReconcile(row, `业务员 ${baseline} 行`);
      }
      expect(
        rows.length,
        '现状钉桩：本腿恒空。全仓没有任何写入方给 ar_invoices.salesperson_id 赋值'
      ).toBe(0);
    }
  });
});
