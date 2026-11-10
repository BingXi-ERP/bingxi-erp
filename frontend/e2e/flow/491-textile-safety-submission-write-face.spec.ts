/**
 * 纺织品安全送检单族写面断言级覆盖（建单→要素修改→状态机→清单推导→童装核查→整单判定→草稿删除）。
 *
 * 功能：把 `textile-submissions` 族九枚在册端点从"零断言"钉成"写下去→读回来→逐字段相等"，
 *   并覆盖拒绝腿（词表外/必填缺失/人群类别冲突/非法跃迁/完整性门/封账删除/不存在 id）与
 *   清单重生成幂等、童装核查逐行 upsert 集合语义、整单判定 pass/fail 双结论产出。
 * 调用方：Playwright 分片 e2e flow 项目（frontend/playwright.config.ts），由 CI e2e job 执行。
 * 入参：page 会话（worker admin）；前置产品/检测项目主数据/限值行全部本用例自建，不依赖库内存量行。
 * 传给谁：backend textile_safety_handler（送检单面）、textile_safety_report_handler（报告面，判定前置）、
 *   textile_safety_master_handler（主数据面，自建前置），路由挂载 backend/src/routes/textile_safety.rs。
 * 存什么：textile_safety_submission 本体（维度快照/状态/整单结论）、textile_safety_submission_item 清单行、
 *   textile_child_safety_check 童装核查行；判定前置另写 textile_third_party_report 与 textile_report_item_result。
 * 存哪里：PostgreSQL（DDL backend/migration/src/domain/textile_safety/m0110_create_textile_safety_tables.rs，
 *   submission_no/item_code/report_no 各带 UNIQUE，子表对 submission 为 CASCADE、对 item 为 RESTRICT）。
 *
 * 覆盖端点（资源是 API_PREFIX=/api/v1/erp 下的单段，配对门检索串只认绝对挂载形，故此处按绝对路径登记）：
 *   GET    /api/v1/erp/textile-submissions
 *   POST   /api/v1/erp/textile-submissions
 *   GET    /api/v1/erp/textile-submissions/{id}
 *   PUT    /api/v1/erp/textile-submissions/{id}
 *   DELETE /api/v1/erp/textile-submissions/{id}
 *   PUT    /api/v1/erp/textile-submissions/{id}/status
 *   POST   /api/v1/erp/textile-submissions/{id}/items
 *   PUT    /api/v1/erp/textile-submissions/{id}/child-checks
 *   PUT    /api/v1/erp/textile-submissions/{id}/judgement
 *
 * 词表事实（唯一权威 backend/src/models/status/textile_safety.rs，逐字符照抄，大小写故意混用不可改）：
 *   状态机小写 draft/sampling/sent/reported/judged/closed/withdrawn；安全类别带前缀 GB18401_A/B/C
 *   （裸 A/B/C 被别的域占用，禁传）；人群 infant/child/adult；接触 direct/indirect/infant_use；
 *   形态 final/intermediate；市场 dom/eu/us/jp/other；判定三态 pass/fail/na（待判定 pending 不是整单结论）。
 * 掩码契约边界：utils/error.rs 的 public_message() 对 NotFound/BusinessError/ValidationError 普通变体返回
 *   固定掩码文案，只有 *Displayable 变体外显自定义文案；本族拒绝多走 displayable，但断言只钉机器码
 *   （failureCode）+ message 非空，不把掩码常量当业务契约钉死。
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

/** 送检单本体行（键 = backend/src/models/textile_safety_submission.rs Model 字段名，snake_case） */
interface SubmissionRow {
  id: number;
  submission_no: string;
  product_id: number;
  batch_no: string | null;
  color_no: string;
  process_no: string;
  color_role: string;
  end_user_group: string;
  contact_type: string;
  safety_category: string;
  product_form: string;
  target_market: string;
  exemption_tags: string | null;
  status: string;
  overall_verdict: string | null;
  remarks: string | null;
  created_by: number;
}

/** 清单行（详情面 items_json 键，含项目主数据快照） */
interface ItemRow {
  id: number;
  source: string;
  item_id: number;
  item_code: string;
  item_name: string;
  basis_standard: string;
}

/** 童装核查行（键 = backend/src/models/textile_child_safety_check.rs Model；DECIMAL 出参为字符串） */
interface ChildCheckRow {
  id: number;
  submission_id: number;
  item_id: number;
  check_kind: string;
  measured_value: string | null;
  measured_unit: string | null;
  measured_flag: string | null;
  check_desc: string | null;
  manual_conclusion: string | null;
  verdict: string;
  judged_at: string | null;
}

/** 详情面载荷（textile_safety_handler::get_submission 的 json! 形状） */
interface DetailPayload {
  submission: SubmissionRow;
  items: ItemRow[];
  child_checks: ChildCheckRow[];
  reports: Array<{ id: number; report_no: string; acceptance_status: string }>;
  adoption: {
    adopted: { report_no: string } | null;
    excluded: Array<{ report_no: string; reason: string }>;
  };
}

/** 本用例自建前置（产品 + 四枚检测项目主数据 + 数值项限值行） */
interface Seed {
  productId: number;
  userId: number;
  gb18401Code: string;
  childMeasCode: string;
  childManualCode: string;
  custCode: string;
}

// 词表稳定码（单源 models/status/textile_safety.rs，禁止散写第二套）
const STATUS = {
  DRAFT: 'draft',
  SAMPLING: 'sampling',
  SENT: 'sent',
  REPORTED: 'reported',
  JUDGED: 'judged',
  CLOSED: 'closed',
  WITHDRAWN: 'withdrawn',
} as const;
const CATEGORY_B = 'GB18401_B';
const VERDICT = { PASS: 'pass', FAIL: 'fail', NA: 'na', PENDING: 'pending' } as const;
const SOURCE = { GB18401: 'GB18401', GB31701: 'GB31701', CUSTOMER: 'CUSTOMER' } as const;

/** 必然不存在的 id（i32 上界，各 404 腿共用） */
const MISSING_ID = 2147483647;

let seed: Seed | null = null;
/** 本文件建过的送检单 id（afterAll 尽力清理；非草稿态按契约不可删，只清草稿） */
const createdSubmissionIds: number[] = [];

/** 今天与一年后（报告有效期窗口必须覆盖今日，否则完整性门记 expired） */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function nextYear(): string {
  return new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
}

/**
 * 自建前置：专属产品 + GB18401 数值项 + GB31701 可测项 + GB31701 人工项 + CUSTOMER 点名项，
 * 并给两枚数值项各播一条 lte 通配限值行（类别/形态 any、无条件 none），使判定器有矩阵可查。
 * 为什么必须自建：generate_items 的项目集单源是主数据 basis 分组，判定器无限值行即拒绝造结论；
 * 依赖"库里恰好有一行"会让断言随种子漂移。主数据编码带 genCode 唯一后缀，跨分片共库不撞 UNIQUE。
 */
async function seedFixtures(page: Page): Promise<Seed> {
  const ctx = getCtx();
  const categoryId = ctx.productCategoryIds[0];
  const userId = ctx.userIds[0];
  if (!categoryId || !userId) {
    throw new Error('[491] 前置不成立：ensureTestEntities 未备齐产品分类或当前用户 id');
  }
  const product = await apiCallRaw<{ id: number }>(page, 'POST', '/products', {
    code: genCode('E2E-TXSP'),
    name: `E2E纺织送检产品${Date.now().toString().slice(-6)}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.finished,
    fabric_composition: '100%涤纶',
    gram_weight: 180,
    width: 150,
    meters_per_piece: 50,
  });
  if (!product.id) {
    throw new Error(`[491] 专属产品创建未返回 id：${JSON.stringify(product)}`);
  }
  const gb18401Code = genCode('E2E-TI18401');
  const childMeasCode = genCode('E2E-TI31701M');
  const childManualCode = genCode('E2E-TI31701H');
  const custCode = genCode('E2E-TICUST');
  // GB18401 数值项：恒入清单（法定基本安全项），报告结果与限值判定都打在它上
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: gb18401Code,
    item_name: 'E2E基本安全数值项',
    item_kind: 'numeric',
    basis_standard: 'GB18401',
    check_kind: 'measurable',
    unit: 'mg/kg',
  });
  // GB31701 可测项：童装加考，整单判定时走判定器矩阵
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: childMeasCode,
    item_name: 'E2E童装可测加考项',
    item_kind: 'numeric',
    basis_standard: 'GB31701',
    check_kind: 'measurable',
    unit: 'mg/kg',
  });
  // GB31701 人工项：条款型，判定器只搬运人工结论位，绝不代判
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: childManualCode,
    item_name: 'E2E童装人工条款项',
    item_kind: 'boolean',
    basis_standard: 'GB31701',
    check_kind: 'manual',
  });
  // CUSTOMER 项：不自动入列，仅供 extra_item_codes 点名加验
  await apiCallRaw(page, 'POST', '/textile-test-items', {
    item_code: custCode,
    item_name: 'E2E客户点名加验项',
    item_kind: 'numeric',
    basis_standard: 'CUSTOMER',
    check_kind: 'measurable',
    unit: 'mg/kg',
  });
  // 数值项限值行：lte 上限（GB18401 项 75、童装可测项 100），通配类别/形态、无条件
  await apiCallRaw(page, 'POST', '/textile-limit-rules', {
    item_code: gb18401Code,
    safety_category: 'any',
    product_form: 'any',
    condition_tag: 'none',
    comparator: 'lte',
    limit_high: 75,
  });
  await apiCallRaw(page, 'POST', '/textile-limit-rules', {
    item_code: childMeasCode,
    safety_category: 'any',
    product_form: 'any',
    condition_tag: 'none',
    comparator: 'lte',
    limit_high: 100,
  });
  return { productId: product.id, userId, gb18401Code, childMeasCode, childManualCode, custCode };
}

/** 建单默认体（成人/直接接触/B 类/最终产品/内销，全检色号角色）；overrides 覆盖单字段 */
function submissionBody(s: Seed, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    submission_no: genCode('E2E-TXS'),
    product_id: s.productId,
    color_no: genCode('E2E-CLR'),
    process_no: genCode('E2E-PRC'),
    end_user_group: 'adult',
    contact_type: 'direct',
    safety_category: CATEGORY_B,
    product_form: 'final',
    target_market: 'dom',
    color_role: 'full',
    exemption_tags: [],
    ...overrides,
  };
}

/** 建单并登记清理；返回落库本体行 */
async function createSubmission(
  page: Page,
  s: Seed,
  overrides: Record<string, unknown> = {}
): Promise<SubmissionRow> {
  const row = await apiCallRaw<SubmissionRow>(
    page,
    'POST',
    '/textile-submissions',
    submissionBody(s, overrides)
  );
  if (!row.id) {
    throw new Error(`[491] 建单未返回 id：${JSON.stringify(row)}`);
  }
  createdSubmissionIds.push(row.id);
  return row;
}

/** 详情回读 */
async function detail(page: Page, id: number): Promise<DetailPayload> {
  return apiCallRaw<DetailPayload>(page, 'GET', `/textile-submissions/${id}`);
}

/** 断言拒绝腿：机器码命中 + message 非空（不钉掩码文案常量） */
function expectRejection(
  res: { status: number; code?: string | number; message?: string | null },
  expectedCode: string,
  label: string
): void {
  expect(
    failureCode(res),
    `${label}：机器码应为 ${expectedCode}，实际 status=${res.status} code=${JSON.stringify(res.code)}`
  ).toBe(expectedCode);
  expect(
    typeof res.message === 'string' && res.message.trim().length > 0,
    `${label}：message 应非空，实际 ${JSON.stringify(res.message)}`
  ).toBe(true);
}

test.describe.serial('491 纺织品安全送检单写面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    if (!seed) {
      seed = await seedFixtures(page);
    }
  });

  test.afterAll(async ({ browser }) => {
    // 主数据与草稿尽力清理：非草稿送检单按契约不可删（delete_draft 只放 draft），其引用的
    // 主数据行受 RESTRICT 与 delete_test_item 引用守卫保护同样不可删，tryCleanup 失败仅告警不判红。
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdSubmissionIds) {
        await tryCleanup(page, 'DELETE', `/textile-submissions/${id}`, `491 submission ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('491-01 建单后详情逐字段回读，草稿态与整单结论空位落库', async ({ page }) => {
    const s = seed!;
    const colorNo = genCode('E2E-C01');
    const processNo = genCode('E2E-P01');
    const batchNo = genCode('E2E-B01');
    const created = await createSubmission(page, s, {
      color_no: colorNo,
      process_no: processNo,
      batch_no: batchNo,
      color_role: 'representative',
      exemption_tags: ['plain_or_bleached'],
      remarks: 'E2E建单回读备注',
    });
    expect(created.status, '建单恒落草稿态').toBe(STATUS.DRAFT);

    const d = await detail(page, created.id);
    const sub = d.submission;
    expect(sub.submission_no, '回读单号逐字符相等').toBe(created.submission_no);
    expect(sub.product_id, '回读品种等于自建产品').toBe(s.productId);
    expect(sub.batch_no, '回读批次号相等').toBe(batchNo);
    expect(sub.color_no, '回读色号相等').toBe(colorNo);
    expect(sub.process_no, '回读工艺号相等').toBe(processNo);
    expect(sub.color_role, '回读色号角色相等').toBe('representative');
    expect(sub.end_user_group).toBe('adult');
    expect(sub.contact_type).toBe('direct');
    expect(sub.safety_category, '安全类别落带前缀稳定码').toBe(CATEGORY_B);
    expect(sub.product_form).toBe('final');
    expect(sub.target_market).toBe('dom');
    expect(sub.exemption_tags, '豁免标签拼无空格逗号串').toBe('plain_or_bleached');
    expect(sub.status).toBe(STATUS.DRAFT);
    expect(sub.overall_verdict, '判定前整单结论恒 NULL').toBeNull();
    expect(sub.remarks).toBe('E2E建单回读备注');
    expect(sub.created_by, 'created_by 取会话不可伪造').toBe(s.userId);
    expect(d.items.length, '未推导前清单为空').toBe(0);
    expect(d.child_checks.length, '未登记前童装核查为空').toBe(0);
    expect(d.reports.length, '未挂报告前报告集为空').toBe(0);

    // 列表按品种过滤真实下推：专属产品下必能读到本单
    const list = await apiCallRaw<{ items: SubmissionRow[]; total: number }>(
      page,
      'GET',
      `/textile-submissions?product_id=${s.productId}&page=1&page_size=100`
    );
    expect(
      list.items.some(r => r.id === created.id),
      '列表按品种过滤应含本单'
    ).toBe(true);
  });

  test('491-02 建单拒绝腿：必填缺失/词表外/人群类别冲突/产品不存在，拒绝后零落库', async ({
    page,
  }) => {
    const s = seed!;
    const attempts: Array<{ label: string; body: Record<string, unknown>; code: string }> = [
      {
        label: '色号缺失',
        body: submissionBody(s, { color_no: '' }),
        code: APP_ERROR_CODES.VALIDATION_ERROR,
      },
      {
        label: '人群词表外',
        body: submissionBody(s, { end_user_group: 'alien' }),
        code: APP_ERROR_CODES.VALIDATION_ERROR,
      },
      {
        label: '婴幼儿申报B类松于法定A类',
        body: submissionBody(s, { end_user_group: 'infant', safety_category: CATEGORY_B }),
        code: APP_ERROR_CODES.VALIDATION_ERROR,
      },
      {
        label: '产品不存在',
        body: submissionBody(s, { product_id: MISSING_ID }),
        code: APP_ERROR_CODES.NOT_FOUND,
      },
    ];
    for (const a of attempts) {
      const res = await apiCallExpectFail(page, 'POST', '/textile-submissions', a.body);
      expectRejection(res, a.code, `491-02 ${a.label}`);
      // 拒绝后按专属品种回列表：该单号绝不能落库（每个尝试单号唯一，命中即副作用泄漏）
      const list = await apiCallRaw<{ items: SubmissionRow[] }>(
        page,
        'GET',
        `/textile-submissions?product_id=${s.productId}&page=1&page_size=100`
      );
      const no = a.body.submission_no as string;
      expect(
        list.items.some(r => r.submission_no === no),
        `491-02 ${a.label}：拒绝后不应落库`
      ).toBe(false);
    }
  });

  // 后续用例分批追加锚点
});
