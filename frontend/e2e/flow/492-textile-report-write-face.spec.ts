/**
 * 492 纺织品安全第三方报告写面：登记、要素修正、完整性门、逐项目结果录入、报告级判定。
 *
 * 调用面（backend/src/routes/textile_safety.rs 注册）：
 *   GET    /api/v1/erp/textile-reports?submission_id= 按送检单列报告（出参 {reports}）
 *   POST   /api/v1/erp/textile-reports 登记（出参报告本体）
 *   GET    /api/v1/erp/textile-reports/{id} 详情（出参 {report, results}）
 *   PUT    /api/v1/erp/textile-reports/{id} 修正要素（改后复位 pending）
 *   PUT    /api/v1/erp/textile-reports/{id}/acceptance 完整性门（出参 {report, missing_elements}）
 *   POST   /api/v1/erp/textile-reports/{id}/results 逐项目结果 upsert（出参结果行数组）
 *   PUT    /api/v1/erp/textile-reports/{id}/judgement 报告级判定（出参结果行数组，报告必须已受理）
 *
 * 判据单源：services/textile_safety_report_service.rs 与 models/status/textile_safety.rs。
 * 受理态词表 pending / accepted / rejected；缺项代号 cma / cnas / sample_name /
 * material_composition / color_no / test_basis / item_results / conclusion / expired /
 * not_yet_valid / batch_mismatch；结果行 verdict 词表 pass / fail / na / pending。
 * 登记前提：送检单处于 sent 或 reported；sent 登记后自动推进 reported。
 * 完整性门：资质至少持一枚（CMA 或 CNAS），六项要素齐，有效期窗口覆盖今日，
 * 报告色号与工艺和送检单批次口径一致；任一缺项落 rejected 并逐条点名。
 * 结果录入：项目必须在主数据且在送检清单内；numeric 要 measured_value，grade 要
 * measured_token（半级编码换算，3-4 记 3.5），sensory 与 boolean 要 none 或 detected flag；
 * 重录实测复位 verdict 为 pending。判定：报告已受理且在有效期窗口内才产三态结论。
 *
 * 前置自建：专属产品 + 四枚检测项目主数据（GB18401 数值项与等级项与布尔项、CUSTOMER
 * 点名项）+ 数值项 lte 75 通配限值行。主数据编码带 genCode 唯一后缀，跨分片共库不撞。
 * 送检单推进链：建单 draft → 推导清单 → sampling → sent（登记报告后自动 reported）。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

/** 送检单行（出参键 = models/textile_safety_submission.rs 字段，snake_case） */
interface SubmissionRow {
  id: number;
  submission_no: string;
  product_id: number;
  color_no: string;
  process_no: string;
  status: string;
}

/** 送检单详情出参是包装体，单本体挂 submission 键，报告集挂 reports 键 */
interface SubmissionDetail {
  submission: SubmissionRow;
  reports: Array<{ id: number; report_no: string; acceptance_status: string }>;
}

/** 报告行（出参键 = models/textile_third_party_report.rs 字段） */
interface ReportRow {
  id: number;
  report_no: string;
  submission_id: number;
  inspection_agency: string;
  has_cma: boolean;
  has_cnas: boolean;
  sample_name: string | null;
  material_composition: string | null;
  color_no: string | null;
  process_no: string | null;
  test_basis: string | null;
  conclusion: string | null;
  oeko_tex_class: string | null;
  issue_date: string;
  valid_until: string | null;
  acceptance_status: string;
  rejection_detail: string;
  created_by: number;
}

/** 逐项目结果行（measured_value 是 DECIMAL 线格式字符串，比较前 Number 化） */
interface ResultRow {
  id: number;
  report_id: number;
  item_id: number;
  measured_value: string | number | null;
  measured_text: string | null;
  measured_unit: string | null;
  verdict: string;
  judged_at: string | null;
}

interface GatePayload {
  report: ReportRow;
  missing_elements: string[];
}

interface ReportDetail {
  report: ReportRow;
  results: ResultRow[];
}

/** 本用例自建前置（产品 + 四枚检测项目主数据 + 数值项限值行） */
interface Seed {
  productId: number;
  userId: number;
  numericCode: string;
  gradeCode: string;
  flagCode: string;
  custCode: string;
}

const STATUS = { SENT: 'sent', REPORTED: 'reported', WITHDRAWN: 'withdrawn' } as const;
const ACCEPT = { PENDING: 'pending', ACCEPTED: 'accepted', REJECTED: 'rejected' } as const;
const VERDICT = { PASS: 'pass', FAIL: 'fail', PENDING: 'pending' } as const;

/** 必然不存在的 id（i32 上界，各 404 腿共用） */
const MISSING_ID = 2147483647;

let seed: Seed | null = null;
/** 本文件建过的送检单 id（afterAll 尽力清理；非草稿态按契约不可删，只清草稿） */
const createdSubmissionIds: number[] = [];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function nextYear(): string {
  return new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
}
function yesterday(): string {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10);
}
function tomorrow(): string {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}
function lastYear(): string {
  return new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
}

/**
 * 自建前置：专属产品 + GB18401 数值项（挂 lte 75 限值行，判定器有矩阵可查）+
 * GB18401 等级项与布尔项（录入形态校验用）+ CUSTOMER 数值项（清单外夹带拒绝用）。
 * 为什么必须自建：generate_items 的项目集单源是主数据 basis 分组，判定器无限值行即拒绝
 * 造结论；依赖"库里恰好有一行"会让断言随种子漂移。
 */
async function seedFixtures(page: Page): Promise<Seed> {
  const ctx = getCtx();
  const categoryId = ctx.productCategoryIds[0];
  const userId = ctx.userIds[0];
  if (!categoryId || !userId) {
    throw new Error('[492] 前置不成立：ensureTestEntities 未备齐产品分类或当前用户 id');
  }
  const product = await apiCallRaw<{ id: number }>(page, 'POST', '/products', {
    code: genCode('E2E-TXRP'),
    name: `E2E纺织报告产品${Date.now().toString().slice(-6)}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.finished,
    fabric_composition: '100%涤纶',
    gram_weight: 180,
    width: 150,
    meters_per_piece: 50,
  });
  if (!product.id) {
    throw new Error(`[492] 专属产品创建未返回 id：${JSON.stringify(product)}`);
  }
  const numericCode = genCode('E2E-RINUM');
  const gradeCode = genCode('E2E-RIGRD');
  const flagCode = genCode('E2E-RIFLG');
  const custCode = genCode('E2E-RICUST');
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: numericCode,
    item_name: 'E2E报告数值项',
    item_kind: 'numeric',
    basis_standard: 'GB18401',
    check_kind: 'measurable',
    unit: 'mg/kg',
  });
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: gradeCode,
    item_name: 'E2E报告等级项',
    item_kind: 'grade',
    basis_standard: 'GB18401',
    check_kind: 'measurable',
  });
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: flagCode,
    item_name: 'E2E报告布尔项',
    item_kind: 'boolean',
    basis_standard: 'GB18401',
    check_kind: 'measurable',
  });
  // CUSTOMER 基组不自动入清单：供"清单外项目夹带被拒"腿使用
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: custCode,
    item_name: 'E2E报告点名项',
    item_kind: 'numeric',
    basis_standard: 'CUSTOMER',
    check_kind: 'measurable',
    unit: 'mg/kg',
  });
  await apiCallRaw(page, 'POST', '/textile-limit-rules', {
    item_code: numericCode,
    safety_category: 'any',
    product_form: 'any',
    condition_tag: 'none',
    comparator: 'lte',
    limit_high: 75,
  });
  return { productId: product.id, userId, numericCode, gradeCode, flagCode, custCode };
}

/** 建单默认体（成人/直接接触/B 类/最终产品/内销）；overrides 覆盖单字段 */
function submissionBody(s: Seed, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submission_no: genCode('E2E-TXRS'),
    product_id: s.productId,
    color_no: genCode('E2E-RCLR'),
    process_no: genCode('E2E-RPRC'),
    end_user_group: 'adult',
    contact_type: 'direct',
    safety_category: 'GB18401_B',
    product_form: 'final',
    target_market: 'dom',
    color_role: 'full',
    exemption_tags: [],
    ...overrides,
  };
}

async function createSubmission(page: Page, s: Seed): Promise<SubmissionRow> {
  const row = await apiCallRaw<SubmissionRow>(
    page,
    'POST',
    '/textile-submissions',
    submissionBody(s)
  );
  if (!row.id) {
    throw new Error(`[492] 建单未返回 id：${JSON.stringify(row)}`);
  }
  createdSubmissionIds.push(row.id);
  return row;
}

/** 推进到已送检态：推导清单 → sampling → sent（sent 触发库存联动，无匹配行时为空操作） */
async function advanceToSent(page: Page, sub: SubmissionRow): Promise<void> {
  await apiCallRaw(page, 'POST', `/textile-submissions/${sub.id}/items`, { extra_item_codes: [] });
  await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, { status: 'sampling' });
  await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, { status: STATUS.SENT });
}

/** 要素齐备的登记默认体（色号工艺与送检单一致、有效期覆盖今日）；overrides 覆盖单字段 */
function registerBody(
  sub: SubmissionRow,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    report_no: genCode('E2E-RPT'),
    submission_id: sub.id,
    inspection_agency: 'E2E第三方检测机构',
    has_cma: true,
    has_cnas: false,
    sample_name: 'E2E送检样品',
    material_composition: '100%涤纶',
    color_no: sub.color_no,
    process_no: sub.process_no,
    test_basis: 'GB 18401-2010 B类',
    conclusion: '所检项目符合标准要求',
    issue_date: today(),
    valid_until: nextYear(),
    ...overrides,
  };
}

async function registerReport(
  page: Page,
  sub: SubmissionRow,
  overrides: Record<string, unknown> = {}
): Promise<ReportRow> {
  const row = await apiCallRaw<ReportRow>(
    page,
    'POST',
    '/textile-reports',
    registerBody(sub, overrides)
  );
  if (!row.id) {
    throw new Error(`[492] 登记报告未返回 id：${JSON.stringify(row)}`);
  }
  return row;
}

/** 给报告录一条数值项实测结果（判定链路的最小输入） */
async function upsertNumeric(
  page: Page,
  s: Seed,
  reportId: number,
  value: number
): Promise<ResultRow[]> {
  return await apiCallRaw<ResultRow[]>(page, 'POST', `/textile-reports/${reportId}/results`, {
    rows: [{ item_code: s.numericCode, measured_value: value, measured_unit: 'mg/kg' }],
  });
}

async function runGate(page: Page, reportId: number): Promise<GatePayload> {
  return await apiCallRaw<GatePayload>(page, 'PUT', `/textile-reports/${reportId}/acceptance`);
}

/** 拒绝断言：HTTP 400 族 + 字符串机器码 + 非空 message（脱敏族只断码不断文案） */
function expectRejection(
  res: { status: number; message?: string | null },
  expectedCode: string,
  label: string
): void {
  expect(
    res.status,
    `${label}：应被拒（400），实际 status=${res.status} message=${JSON.stringify(res.message)}`
  ).toBe(400);
  expect(failureCode(res), `${label}：机器码应为 ${expectedCode}，实际=${failureCode(res)}`).toBe(
    expectedCode
  );
}

test.describe.serial('492 纺织品安全第三方报告写面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    if (!seed) {
      seed = await seedFixtures(page);
    }
  });

  test.afterAll(async ({ browser }) => {
    // 报告无删除端点（留痕面），其挂的送检单非草稿不可删；只清未推进的草稿单，
    // 主数据行受引用守卫保护同样不可删，tryCleanup 失败仅告警不判红。
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdSubmissionIds) {
        await tryCleanup(page, 'DELETE', `/textile-submissions/${id}`, `492 submission ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('492-01 登记前提门：草稿单与悬空单被拒，空编号与脏分级词表外被拒', async ({ page }) => {
    const s = seed!;
    const draft = await createSubmission(page, s);
    const draftRes = await apiCallExpectFail(page, 'POST', '/textile-reports', registerBody(draft));
    expectRejection(draftRes, APP_ERROR_CODES.BUSINESS_ERROR, '草稿态送检单登记报告');

    const dangling = await apiCallExpectFail(
      page,
      'POST',
      '/textile-reports',
      registerBody(draft, { submission_id: MISSING_ID })
    );
    expect(dangling.status, `悬空送检单应 404，实际=${dangling.status}`).toBe(404);
    expect(failureCode(dangling), '悬空单机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);

    const sent = await createSubmission(page, s);
    await advanceToSent(page, sent);
    const emptyNo = await apiCallExpectFail(
      page,
      'POST',
      '/textile-reports',
      registerBody(sent, { report_no: '  ' })
    );
    expectRejection(emptyNo, APP_ERROR_CODES.VALIDATION_ERROR, '空白报告编号');
    expect(emptyNo.message ?? '', '编号拒因应外显可操作文案').toContain('报告编号');

    const badClass = await apiCallExpectFail(
      page,
      'POST',
      '/textile-reports',
      registerBody(sent, { oeko_tex_class: 'CLASS-9' })
    );
    expectRejection(badClass, APP_ERROR_CODES.VALIDATION_ERROR, '词表外 OEKO-TEX 分级');
    expect(badClass.message ?? '', '分级拒因应点名合法取值').toContain('I、II、III、IV');
  });

  test('492-02 登记成功：受理态恒 pending 不可直填，送检单 sent 自动推进 reported', async ({
    page,
  }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    // 请求体塞 acceptance_status 属未声明字段，serde 忽略；受理态只能由完整性门产出
    const report = await registerReport(page, sub, { acceptance_status: ACCEPT.ACCEPTED });
    expect(report.acceptance_status, '受理态恒落 pending，请求体直填不生效').toBe(ACCEPT.PENDING);
    expect(report.rejection_detail, '新登记拒绝明细为空串').toBe('');
    expect(report.created_by, 'created_by 取会话不可伪造').toBe(s.userId);
    expect(report.report_no, '报告编号逐字符落库').toBeTruthy();

    const subDetail = await apiCallRaw<SubmissionDetail>(
      page,
      'GET',
      `/textile-submissions/${sub.id}`
    );
    expect(subDetail.submission.status, 'sent 态登记报告后送检单自动推进 reported').toBe(
      STATUS.REPORTED
    );
    expect(
      subDetail.reports.some(r => r.id === report.id),
      '送检单详情的报告集应含本次登记'
    ).toBe(true);

    const detail = await apiCallRaw<ReportDetail>(page, 'GET', `/textile-reports/${report.id}`);
    expect(detail.report.id, '详情报告本体回读').toBe(report.id);
    expect(detail.report.submission_id, '详情挂单回读').toBe(sub.id);
    expect(Array.isArray(detail.results), '详情结果行集应为数组').toBe(true);
    expect(detail.results.length, '未录入前结果行为空').toBe(0);

    const list = await apiCallRaw<{ reports: ReportRow[] }>(
      page,
      'GET',
      `/textile-reports?submission_id=${sub.id}`
    );
    expect(
      list.reports.some(r => r.id === report.id),
      '按送检单列报告应含本登记'
    ).toBe(true);
    expect(
      list.reports.every(r => r.submission_id === sub.id),
      '列表按 submission_id 过滤不得串单'
    ).toBe(true);
  });

  test('492-03 完整性门全缺项逐条点名落 rejected，拒绝态不得产判定', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const bare = await registerReport(page, sub, {
      has_cma: false,
      has_cnas: false,
      sample_name: null,
      material_composition: null,
      color_no: null,
      process_no: null,
      test_basis: null,
      conclusion: null,
      valid_until: null,
    });
    const gate = await runGate(page, bare.id);
    expect(gate.report.acceptance_status, '缺项非空必须落 rejected').toBe(ACCEPT.REJECTED);
    // 缺项顺序按门体逐段点名：资质两枚 → 六要素 → 有效期 → 批次
    expect(gate.missing_elements, '缺项逐条点名且顺序与门体一致').toEqual([
      'cma',
      'cnas',
      'sample_name',
      'material_composition',
      'color_no',
      'test_basis',
      'item_results',
      'conclusion',
      'expired',
      'batch_mismatch',
    ]);
    expect(gate.report.rejection_detail, '拒绝明细落库为逗号拼接缺项串').toBe(
      gate.missing_elements.join(',')
    );

    const judgeRes = await apiCallExpectFail(page, 'PUT', `/textile-reports/${bare.id}/judgement`);
    expectRejection(judgeRes, APP_ERROR_CODES.BUSINESS_ERROR, 'rejected 报告产判定');
  });

  test('492-04 要素齐备过门落 accepted，判定出 pass，重录复位后改判 fail', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const report = await registerReport(page, sub);
    const rows = await upsertNumeric(page, s, report.id, 20);
    expect(rows.length, 'upsert 返回一行').toBe(1);
    expect(Number(rows[0].measured_value), '实测值落库').toBe(20);
    expect(rows[0].verdict, '录入后待判定').toBe(VERDICT.PENDING);
    expect(rows[0].judged_at, '未判定前 judged_at 为空').toBeNull();

    const gate = await runGate(page, report.id);
    expect(gate.report.acceptance_status, '要素齐备应落 accepted').toBe(ACCEPT.ACCEPTED);
    expect(gate.missing_elements.length, 'accepted 时缺项清单为空').toBe(0);

    const judged = await apiCallRaw<ResultRow[]>(
      page,
      'PUT',
      `/textile-reports/${report.id}/judgement`
    );
    expect(judged.length, '判定覆盖全部结果行').toBe(1);
    expect(judged[0].verdict, '20 不超 lte 75 限值应判 pass').toBe(VERDICT.PASS);
    expect(judged[0].judged_at, '判定后 judged_at 落时间戳').toBeTruthy();

    // 重跑幂等：同输入再判结论不变
    const again = await apiCallRaw<ResultRow[]>(
      page,
      'PUT',
      `/textile-reports/${report.id}/judgement`
    );
    expect(again[0].verdict, '同输入重判结论幂等').toBe(VERDICT.PASS);

    // 重录实测复位：旧结论不得跨输入版本存活
    const reRows = await upsertNumeric(page, s, report.id, 100);
    expect(reRows[0].verdict, '重录后 verdict 复位 pending').toBe(VERDICT.PENDING);
    expect(reRows[0].judged_at, '重录后 judged_at 清空').toBeNull();
    const reJudged = await apiCallRaw<ResultRow[]>(
      page,
      'PUT',
      `/textile-reports/${report.id}/judgement`
    );
    expect(reJudged[0].verdict, '100 超 lte 75 限值应改判 fail').toBe(VERDICT.FAIL);
  });

  test('492-05 修正要素复位 pending 清空拒绝明细，送检单撤回后报告封账不可改', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const report = await registerReport(page, sub);
    await upsertNumeric(page, s, report.id, 20);
    const gate = await runGate(page, report.id);
    expect(gate.report.acceptance_status).toBe(ACCEPT.ACCEPTED);

    const updated = await apiCallRaw<ReportRow>(
      page,
      'PUT',
      `/textile-reports/${report.id}`,
      registerBody(sub, { report_no: report.report_no, sample_name: 'E2E修正后样品名' })
    );
    expect(updated.acceptance_status, '改后受理态复位 pending').toBe(ACCEPT.PENDING);
    expect(updated.rejection_detail, '复位同时清空拒绝明细').toBe('');
    expect(updated.sample_name, '修正要素真落库').toBe('E2E修正后样品名');

    const judgeRes = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-reports/${report.id}/judgement`
    );
    expectRejection(judgeRes, APP_ERROR_CODES.BUSINESS_ERROR, '复位 pending 后产判定');

    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, {
      status: STATUS.WITHDRAWN,
    });
    const sealed = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-reports/${report.id}`,
      registerBody(sub, { report_no: report.report_no })
    );
    expectRejection(sealed, APP_ERROR_CODES.BUSINESS_ERROR, '撤回后报告要素封账');
  });

  test('492-06 结果录入形态矩阵：按测量类型强校验，清单外与无主项目被拒', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const report = await registerReport(page, sub);
    const path = `/textile-reports/${report.id}/results`;

    const noValue = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.numericCode }],
    });
    expectRejection(noValue, APP_ERROR_CODES.VALIDATION_ERROR, '数值项缺实测值');

    const numWithToken = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.numericCode, measured_token: '3-4' }],
    });
    expectRejection(numWithToken, APP_ERROR_CODES.VALIDATION_ERROR, '数值项夹带等级 token');

    const gradeWithValue = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.gradeCode, measured_value: 3.5 }],
    });
    expectRejection(gradeWithValue, APP_ERROR_CODES.VALIDATION_ERROR, '等级项手填编码数值');

    const gradeBadToken = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.gradeCode, measured_token: '9' }],
    });
    expectRejection(gradeBadToken, APP_ERROR_CODES.VALIDATION_ERROR, '等级 token 词表外');

    const flagWithValue = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.flagCode, measured_value: 1 }],
    });
    expectRejection(flagWithValue, APP_ERROR_CODES.VALIDATION_ERROR, '布尔项夹带数值');

    const flagBadText = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.flagCode, measured_text: 'maybe' }],
    });
    expectRejection(flagBadText, APP_ERROR_CODES.VALIDATION_ERROR, '布尔 flag 词表外');

    const unknown = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: genCode('E2E-NOITEM'), measured_value: 1 }],
    });
    expectRejection(unknown, APP_ERROR_CODES.VALIDATION_ERROR, '无主项目编码');
    expect(unknown.message ?? '', '无主项目拒因应点名编码').toContain('主数据');

    const offList = await apiCallExpectFail(page, 'POST', path, {
      rows: [{ item_code: s.custCode, measured_value: 1 }],
    });
    expectRejection(offList, APP_ERROR_CODES.BUSINESS_ERROR, '清单外项目夹带');

    // 正向：等级 token 半级编码换算落值，布尔 flag 落文本位
    const gradeRows = await apiCallRaw<ResultRow[]>(page, 'POST', path, {
      rows: [{ item_code: s.gradeCode, measured_token: '3-4' }],
    });
    expect(Number(gradeRows[0].measured_value), '3-4 按国标半级语义编码为 3.5').toBe(3.5);
    const flagRows = await apiCallRaw<ResultRow[]>(page, 'POST', path, {
      rows: [{ item_code: s.flagCode, measured_text: 'none' }],
    });
    expect(flagRows[0].measured_text, 'flag 存 measured_text 列').toBe('none');
    expect(flagRows[0].measured_value, 'flag 型不产生数值位').toBeNull();
  });

  test('492-07 有效期窗口三档：缺登记与已过期记 expired，出具日未到记 not_yet_valid', async ({
    page,
  }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);

    const missing = await registerReport(page, sub, { valid_until: null });
    await upsertNumeric(page, s, missing.id, 20);
    const g1 = await runGate(page, missing.id);
    expect(g1.report.acceptance_status).toBe(ACCEPT.REJECTED);
    expect(g1.missing_elements, '缺有效期无法核验只记 expired 一枚').toEqual(['expired']);

    // 库侧 chk_textile_report_valid_window 要求 valid_until >= issue_date，过期档必须把出具日一并推到过去
    const expired = await registerReport(page, sub, {
      issue_date: lastYear(),
      valid_until: yesterday(),
    });
    await upsertNumeric(page, s, expired.id, 20);
    const g2 = await runGate(page, expired.id);
    expect(g2.missing_elements, '已超有效期只记 expired 一枚').toEqual(['expired']);

    const future = await registerReport(page, sub, { issue_date: tomorrow() });
    await upsertNumeric(page, s, future.id, 20);
    const g3 = await runGate(page, future.id);
    expect(g3.missing_elements, '出具日尚未到达只记 not_yet_valid 一枚').toEqual(['not_yet_valid']);
  });

  test('492-08 批次口径门：色号不符与工艺缺失或不符都记 batch_mismatch', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);

    const colorOff = await registerReport(page, sub, { color_no: genCode('E2E-OTHERCLR') });
    await upsertNumeric(page, s, colorOff.id, 20);
    const g1 = await runGate(page, colorOff.id);
    expect(g1.missing_elements, '色号与送检单不符只记 batch_mismatch').toEqual(['batch_mismatch']);

    const processMissing = await registerReport(page, sub, { process_no: null });
    await upsertNumeric(page, s, processMissing.id, 20);
    const g2 = await runGate(page, processMissing.id);
    expect(g2.missing_elements, '工艺缺失无法按批次对账记 batch_mismatch').toEqual([
      'batch_mismatch',
    ]);

    const processOff = await registerReport(page, sub, { process_no: genCode('E2E-OTHERPRC') });
    await upsertNumeric(page, s, processOff.id, 20);
    const g3 = await runGate(page, processOff.id);
    expect(g3.missing_elements, '工艺与送检单不符记 batch_mismatch').toEqual(['batch_mismatch']);
  });

  test('492-09 资质至少持一枚即放行：只持 CNAS 的报告过门落 accepted', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const report = await registerReport(page, sub, { has_cma: false, has_cnas: true });
    await upsertNumeric(page, s, report.id, 20);
    const gate = await runGate(page, report.id);
    expect(gate.report.acceptance_status, '只持 CNAS 也属合法资质报告').toBe(ACCEPT.ACCEPTED);
    expect(gate.missing_elements.length).toBe(0);
  });

  test('492-10 检验依据格式门：完整标准号加类别才放行，31701 单引用合法', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);

    const shortBasis = await registerReport(page, sub, { test_basis: 'GB 18401' });
    await upsertNumeric(page, s, shortBasis.id, 20);
    const g1 = await runGate(page, shortBasis.id);
    expect(g1.missing_elements, '不完整标准号记 test_basis').toEqual(['test_basis']);

    const noClass = await registerReport(page, sub, { test_basis: 'GB 18401-2010' });
    await upsertNumeric(page, s, noClass.id, 20);
    const g2 = await runGate(page, noClass.id);
    expect(g2.missing_elements, '18401 引用缺安全类别展示形记 test_basis').toEqual(['test_basis']);

    const childBasis = await registerReport(page, sub, { test_basis: 'GB 31701-2015' });
    await upsertNumeric(page, s, childBasis.id, 20);
    const g3 = await runGate(page, childBasis.id);
    expect(g3.report.acceptance_status, '31701 完整标准号单引用不要求类别展示形').toBe(
      ACCEPT.ACCEPTED
    );
  });

  test('492-11 不存在 id 在五端点上均判 404，空集读面形状成立', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    const legs: Array<{
      method: 'GET' | 'PUT' | 'POST';
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: 'GET', path: `/textile-reports/${MISSING_ID}` },
      { method: 'PUT', path: `/textile-reports/${MISSING_ID}`, body: registerBody(sub) },
      { method: 'PUT', path: `/textile-reports/${MISSING_ID}/acceptance` },
      {
        method: 'POST',
        path: `/textile-reports/${MISSING_ID}/results`,
        body: { rows: [{ item_code: s.numericCode, measured_value: 1 }] },
      },
      { method: 'PUT', path: `/textile-reports/${MISSING_ID}/judgement` },
    ];
    for (const leg of legs) {
      const res = await apiCallExpectFail(page, leg.method, leg.path, leg.body);
      expect(res.status, `不存在 id 的 ${leg.method} ${leg.path} 应 404，实际=${res.status}`).toBe(
        404
      );
      expect(failureCode(res), `${leg.method} ${leg.path} 机器码 NOT_FOUND`).toBe(
        APP_ERROR_CODES.NOT_FOUND
      );
    }

    const empty = await apiCallRaw<{ reports: ReportRow[] }>(
      page,
      'GET',
      `/textile-reports?submission_id=${MISSING_ID}`
    );
    expect(Array.isArray(empty.reports), '空集读面 reports 应为数组').toBe(true);
    expect(empty.reports.length, '悬空单号下列表为空集').toBe(0);

    const noQuery = await apiCallExpectFail(page, 'GET', '/textile-reports');
    expect(noQuery.status, `缺 submission_id 必填查询应 400，实际=${noQuery.status}`).toBe(400);
  });

  test('492-12 同单多报告并存按单隔离，复检追加第二份不改首份', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s);
    await advanceToSent(page, sub);
    const first = await registerReport(page, sub);
    // 首份登记后送检单已 reported，复检追加第二份属合法前提
    const second = await registerReport(page, sub);
    expect(second.id, '复检追加产出独立报告行').not.toBe(first.id);

    const list = await apiCallRaw<{ reports: ReportRow[] }>(
      page,
      'GET',
      `/textile-reports?submission_id=${sub.id}`
    );
    expect(list.reports.length, '同单两份报告并存').toBe(2);
    expect(
      list.reports.every(r => r.submission_id === sub.id),
      '列表不得串单'
    ).toBe(true);

    const other = await createSubmission(page, s);
    const otherList = await apiCallRaw<{ reports: ReportRow[] }>(
      page,
      'GET',
      `/textile-reports?submission_id=${other.id}`
    );
    expect(otherList.reports.length, '未挂报告的单列表为空').toBe(0);

    const firstDetail = await apiCallRaw<ReportDetail>(page, 'GET', `/textile-reports/${first.id}`);
    expect(firstDetail.report.report_no, '追加不改首份编号').toBe(first.report_no);
    expect(firstDetail.report.acceptance_status, '追加不改首份受理态').toBe(ACCEPT.PENDING);
  });
});
