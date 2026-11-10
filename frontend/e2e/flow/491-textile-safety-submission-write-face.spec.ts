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

  test('491-03 PUT 要素三态：改成功回读新值旧值不残留，非法值被拒原值不变', async ({ page }) => {
    const s = seed!;
    const oldColor = genCode('E2E-OLD-C');
    const created = await createSubmission(page, s, { color_no: oldColor, remarks: 'E2E旧备注' });
    const newColor = genCode('E2E-NEW-C');
    const newProcess = genCode('E2E-NEW-P');
    const newBatch = genCode('E2E-NEW-B');
    // 改成功：全量字段重提交（update 与建单同判据，body 仍是完整 CreateSubmissionBody）
    await apiCallRaw(
      page,
      'PUT',
      `/textile-submissions/${created.id}`,
      submissionBody(s, {
        submission_no: created.submission_no,
        color_no: newColor,
        process_no: newProcess,
        batch_no: newBatch,
        color_role: 'representative',
        target_market: 'eu',
        remarks: 'E2E新备注',
      })
    );
    const after = (await detail(page, created.id)).submission;
    expect(after.color_no, '改后色号等于新值').toBe(newColor);
    expect(after.color_no, '旧色号不得残留').not.toBe(oldColor);
    expect(after.process_no).toBe(newProcess);
    expect(after.batch_no).toBe(newBatch);
    expect(after.color_role).toBe('representative');
    expect(after.target_market).toBe('eu');
    expect(after.remarks).toBe('E2E新备注');

    // 非法值被拒：裸 A 不在带前缀词表内（GB18401_A 才是合法码），拒后原值不变
    const res = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${created.id}`,
      submissionBody(s, {
        submission_no: created.submission_no,
        color_no: newColor,
        safety_category: 'A',
      })
    );
    expectRejection(res, APP_ERROR_CODES.VALIDATION_ERROR, '491-03 裸A类别');
    const unchanged = (await detail(page, created.id)).submission;
    expect(unchanged.color_no, '非法修改被拒后色号保持上一次成功值').toBe(newColor);
    expect(unchanged.safety_category, '非法类别不得落库').toBe(CATEGORY_B);
  });

  test('491-04 状态机：清单非空门、合法跃迁、非法跃迁与词表外拒绝、撤回腿', async ({ page }) => {
    const s = seed!;
    const created = await createSubmission(page, s);
    const id = created.id;
    // draft→sampling 要求清单非空：未推导即推进被业务门拦下，状态不变
    const noItems = await apiCallExpectFail(page, 'PUT', `/textile-submissions/${id}/status`, {
      status: STATUS.SAMPLING,
    });
    expectRejection(noItems, APP_ERROR_CODES.BUSINESS_ERROR, '491-04 清单非空门');
    expect((await detail(page, id)).submission.status, '被拒后仍是草稿').toBe(STATUS.DRAFT);

    await apiCallRaw(page, 'POST', `/textile-submissions/${id}/items`, { extra_item_codes: [] });
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/status`, { status: STATUS.SAMPLING });
    expect((await detail(page, id)).submission.status, '合法跃迁 draft→sampling 落库').toBe(
      STATUS.SAMPLING
    );

    const sent = await apiCallRaw<{
      submission: SubmissionRow;
      stock_link: { matched: number; scope_note: string };
    }>(page, 'PUT', `/textile-submissions/${id}/status`, { status: STATUS.SENT });
    expect(sent.submission.status, '合法跃迁 sampling→sent 落库').toBe(STATUS.SENT);
    expect(typeof sent.stock_link.scope_note, 'sent 推进必须回显库存联动口径').toBe('string');
    expect((await detail(page, id)).submission.status).toBe(STATUS.SENT);

    // 非法跃迁 sent→draft（白名单无此边）与 sent→judged（judged 只能判定产出）均拒，状态不变
    for (const target of [STATUS.DRAFT, STATUS.JUDGED]) {
      const res = await apiCallExpectFail(page, 'PUT', `/textile-submissions/${id}/status`, {
        status: target,
      });
      expectRejection(res, APP_ERROR_CODES.BUSINESS_ERROR, `491-04 非法跃迁 sent→${target}`);
      expect((await detail(page, id)).submission.status, '非法跃迁后状态不变').toBe(STATUS.SENT);
    }
    // 词表外目标状态：校验先于跃迁，落 VALIDATION_ERROR
    const badVocab = await apiCallExpectFail(page, 'PUT', `/textile-submissions/${id}/status`, {
      status: 'DONE',
    });
    expectRejection(badVocab, APP_ERROR_CODES.VALIDATION_ERROR, '491-04 词表外状态');
    expect((await detail(page, id)).submission.status).toBe(STATUS.SENT);

    // 撤回腿：sent→withdrawn 合法（旁支终态）
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/status`, {
      status: STATUS.WITHDRAWN,
    });
    expect((await detail(page, id)).submission.status, '撤回腿落 withdrawn').toBe(STATUS.WITHDRAWN);
  });

  test('491-05 清单推导集合与主数据 basis 分组一致，重生成幂等且点名项存活', async ({ page }) => {
    const s = seed!;
    // 童装人群触发 GB31701 加考组；内销不挂 EXPORT 组，推导集确定
    const created = await createSubmission(page, s, { end_user_group: 'child' });
    const id = created.id;
    const gb18401 = await apiCallRaw<{ items: Array<{ item_code: string }> }>(
      page,
      'GET',
      '/textile-test-items?basis=GB18401'
    );
    const gb31701 = await apiCallRaw<{ items: Array<{ item_code: string }> }>(
      page,
      'GET',
      '/textile-test-items?basis=GB31701'
    );
    const expected = new Set<string>([
      ...gb18401.items.map(i => i.item_code),
      ...gb31701.items.map(i => i.item_code),
      s.custCode,
    ]);
    expect(expected.has(s.gb18401Code), '自建 GB18401 项应在推导依据内').toBe(true);
    expect(expected.has(s.childMeasCode), '童装人群应加挂自建 GB31701 项').toBe(true);

    const first = await apiCallRaw<{ items: ItemRow[]; needs_attention: boolean }>(
      page,
      'POST',
      `/textile-submissions/${id}/items`,
      { extra_item_codes: [s.custCode] }
    );
    const firstCodes = new Set(first.items.map(i => i.item_code));
    expect([...firstCodes].sort(), '推导集合等于 GB18401∪GB31701∪点名项').toEqual(
      [...expected].sort()
    );
    expect(first.needs_attention, '内销无出口推荐缺口，needs_attention 应为 false').toBe(false);
    const custRow = first.items.find(i => i.item_code === s.custCode);
    expect(custRow?.source, '点名项归因 CUSTOMER').toBe(SOURCE.CUSTOMER);
    expect(
      first.items.find(i => i.item_code === s.gb18401Code)?.source,
      '基本安全项归因 GB18401'
    ).toBe(SOURCE.GB18401);
    expect(
      first.items.find(i => i.item_code === s.childMeasCode)?.source,
      '童装加考项归因 GB31701'
    ).toBe(SOURCE.GB31701);

    // 重生成幂等：自动行冲掉重插（主键可变），但 item_code 集合与行数不变，CUSTOMER 行原主键存活
    const second = await apiCallRaw<{ items: ItemRow[] }>(
      page,
      'POST',
      `/textile-submissions/${id}/items`,
      { extra_item_codes: [s.custCode] }
    );
    expect(second.items.length, '重生成不产生重复行（行数不变）').toBe(first.items.length);
    expect([...new Set(second.items.map(i => i.item_code))].sort(), '重生成项目集合不变').toEqual(
      [...expected].sort()
    );
    const custRow2 = second.items.find(i => i.item_code === s.custCode);
    expect(custRow2?.id, '点名行主键跨重生成存活').toBe(custRow?.id);
    expect(custRow2?.source).toBe(SOURCE.CUSTOMER);

    // 点名项不存在：校验先于冲行，拒绝后清单不变
    const bad = await apiCallExpectFail(page, 'POST', `/textile-submissions/${id}/items`, {
      extra_item_codes: ['E2E-NO-SUCH-ITEM'],
    });
    expectRejection(bad, APP_ERROR_CODES.VALIDATION_ERROR, '491-05 点名项不存在');
    const unchanged = (await detail(page, id)).items;
    expect([...new Set(unchanged.map(i => i.item_code))].sort(), '拒绝后清单集合不变').toEqual(
      [...expected].sort()
    );
  });

  /** 按编码取主数据 id（童装核查行只带 item_id，需此映射对账） */
  async function itemIdByCode(page: Page, code: string): Promise<number> {
    const all = await apiCallRaw<{ items: Array<{ id: number; item_code: string }> }>(
      page,
      'GET',
      '/textile-test-items'
    );
    const hit = all.items.find(i => i.item_code === code);
    if (!hit) {
      throw new Error(`[491] 主数据缺自建项目 ${code}（前置漂移）`);
    }
    return hit.id;
  }

  /**
   * 推进到已收报告态：推导清单→sampling→sent→登记报告（自动 reported）→录结果→完整性门→报告判定。
   * accept/judgeReport 置 false 可停在"报告 pending"用于完整性门拒绝腿。报告色号/工艺与送检单一致、
   * 检验依据含完整标准号加类别展示形，有效期窗口覆盖今日，否则完整性门记缺项落 rejected。
   */
  async function advanceToReported(
    page: Page,
    s: Seed,
    sub: SubmissionRow,
    opts: { accept?: boolean; judgeReport?: boolean; reportValue?: number } = {}
  ): Promise<{ reportId: number; reportNo: string }> {
    await apiCallRaw(page, 'POST', `/textile-submissions/${sub.id}/items`, {
      extra_item_codes: [],
    });
    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, {
      status: STATUS.SAMPLING,
    });
    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, { status: STATUS.SENT });
    const reportNo = genCode('E2E-RPT');
    const report = await apiCallRaw<{ id: number }>(page, 'POST', '/textile-reports', {
      report_no: reportNo,
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
    });
    await apiCallRaw(page, 'POST', `/textile-reports/${report.id}/results`, {
      rows: [
        {
          item_code: s.gb18401Code,
          measured_value: opts.reportValue ?? 20,
          measured_unit: 'mg/kg',
        },
      ],
    });
    if (opts.accept !== false) {
      const gate = await apiCallRaw<{
        report: { acceptance_status: string };
        missing_elements: string[];
      }>(page, 'PUT', `/textile-reports/${report.id}/acceptance`, {});
      expect(gate.report.acceptance_status, '要素齐备完整性门应落 accepted').toBe('accepted');
      expect(gate.missing_elements.length, 'accepted 时缺项清单应为空').toBe(0);
    }
    if (opts.judgeReport !== false) {
      await apiCallRaw(page, 'PUT', `/textile-reports/${report.id}/judgement`, {});
    }
    return { reportId: report.id, reportNo };
  }

  test('491-06 童装核查逐行 upsert：新增/改/未提交行保留，非法录入形态被拒集合不变', async ({
    page,
  }) => {
    const s = seed!;
    const created = await createSubmission(page, s, { end_user_group: 'child' });
    const id = created.id;
    const measId = await itemIdByCode(page, s.childMeasCode);
    const manualId = await itemIdByCode(page, s.childManualCode);

    // 新增一行（可测项录实测值，verdict 落待判定）
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/child-checks`, {
      rows: [{ item_code: s.childMeasCode, measured_value: 50, measured_unit: 'mg/kg' }],
    });
    let cc = (await detail(page, id)).child_checks;
    expect(cc.length, '首次登记新增一行').toBe(1);
    expect(cc[0].item_id).toBe(measId);
    expect(Number(cc[0].measured_value), '实测值落库').toBe(50);
    expect(cc[0].verdict, '录入后待判定').toBe(VERDICT.PENDING);

    // 改一行（可测项重录复位待判定）+ 新增第二行（人工项给结论位）
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/child-checks`, {
      rows: [
        { item_code: s.childMeasCode, measured_value: 80, measured_unit: 'mg/kg' },
        {
          item_code: s.childManualCode,
          check_desc: 'E2E绳带条款核查',
          manual_conclusion: VERDICT.PASS,
        },
      ],
    });
    cc = (await detail(page, id)).child_checks;
    expect(cc.length, '改一行并新增一行后共两行').toBe(2);
    const meas = cc.find(r => r.item_id === measId)!;
    const manual = cc.find(r => r.item_id === manualId)!;
    expect(Number(meas.measured_value), '可测项改后等于新值').toBe(80);
    expect(meas.verdict, '重录复位待判定').toBe(VERDICT.PENDING);
    expect(manual.check_kind, '人工项核查方式快照取主数据').toBe('manual');
    expect(manual.manual_conclusion).toBe(VERDICT.PASS);

    // 集合语义是逐行 upsert 而非全量替换：只提交人工项改结论，未提交的可测行保留不删
    await apiCallRaw(page, 'PUT', `/textile-submissions/${id}/child-checks`, {
      rows: [{ item_code: s.childManualCode, manual_conclusion: VERDICT.FAIL }],
    });
    cc = (await detail(page, id)).child_checks;
    expect(cc.length, '未提交行保留（无删除语义），仍两行').toBe(2);
    expect(cc.find(r => r.item_id === manualId)?.manual_conclusion, '人工项改后结论').toBe(
      VERDICT.FAIL
    );
    expect(
      Number(cc.find(r => r.item_id === measId)?.measured_value),
      '未提交的可测行原值保留'
    ).toBe(80);

    // 非法录入形态：可测项不接受人工结论位、人工项不接受实测值，拒后集合不变
    const badMeas = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${id}/child-checks`,
      {
        rows: [{ item_code: s.childMeasCode, measured_value: 80, manual_conclusion: VERDICT.PASS }],
      }
    );
    expectRejection(badMeas, APP_ERROR_CODES.VALIDATION_ERROR, '491-06 可测项给人工结论');
    const badManual = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${id}/child-checks`,
      {
        rows: [{ item_code: s.childManualCode, measured_value: 5 }],
      }
    );
    expectRejection(badManual, APP_ERROR_CODES.VALIDATION_ERROR, '491-06 人工项给实测值');
    cc = (await detail(page, id)).child_checks;
    expect(cc.length, '非法录入被拒后集合不变').toBe(2);
    expect(Number(cc.find(r => r.item_id === measId)?.measured_value)).toBe(80);
    expect(cc.find(r => r.item_id === manualId)?.manual_conclusion).toBe(VERDICT.FAIL);
  });

  test('491-07 整单判定完整性门：非 reported/无采信报告/缺人工结论三腿拒绝且不落半态', async ({
    page,
  }) => {
    const s = seed!;
    // 腿 A：草稿态判定只从 reported 推进
    const draft = await createSubmission(page, s, { end_user_group: 'child' });
    const resA = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${draft.id}/judgement`,
      {}
    );
    expectRejection(resA, APP_ERROR_CODES.BUSINESS_ERROR, '491-07 草稿态判定');
    expect((await detail(page, draft.id)).submission.status).toBe(STATUS.DRAFT);

    // 腿 B：已收报告但报告未过完整性门（pending）→ 无可靠采信对象
    const subB = await createSubmission(page, s, { end_user_group: 'child' });
    await advanceToReported(page, s, subB, { accept: false, judgeReport: false });
    const resB = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${subB.id}/judgement`,
      {}
    );
    expectRejection(resB, APP_ERROR_CODES.BUSINESS_ERROR, '491-07 无采信报告');
    const dB = (await detail(page, subB.id)).submission;
    expect(dB.status, '拒绝后仍 reported').toBe(STATUS.REPORTED);
    expect(dB.overall_verdict, '拒绝后整单结论仍空').toBeNull();

    // 腿 C：报告齐备但人工核查项缺结论位 → 拒绝完成（绝不代判）
    const subC = await createSubmission(page, s, { end_user_group: 'child' });
    await advanceToReported(page, s, subC);
    await apiCallRaw(page, 'PUT', `/textile-submissions/${subC.id}/child-checks`, {
      rows: [
        { item_code: s.childMeasCode, measured_value: 50, measured_unit: 'mg/kg' },
        { item_code: s.childManualCode, check_desc: 'E2E待补结论核查' },
      ],
    });
    const resC = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-submissions/${subC.id}/judgement`,
      {}
    );
    expectRejection(resC, APP_ERROR_CODES.BUSINESS_ERROR, '491-07 缺人工结论');
    const dC = (await detail(page, subC.id)).submission;
    expect(dC.status, '缺结论拒绝后仍 reported').toBe(STATUS.REPORTED);
    expect(dC.overall_verdict, '缺结论不得产出整单结论').toBeNull();
  });

  test('491-08 前置齐备判定产出 pass 与 judged 态，回读结论并可关闭', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s, { end_user_group: 'child' });
    const { reportNo } = await advanceToReported(page, s, sub);
    const measId = await itemIdByCode(page, s.childMeasCode);
    const manualId = await itemIdByCode(page, s.childManualCode);
    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/child-checks`, {
      rows: [
        { item_code: s.childMeasCode, measured_value: 50, measured_unit: 'mg/kg' },
        {
          item_code: s.childManualCode,
          check_desc: 'E2E绳带核查',
          manual_conclusion: VERDICT.PASS,
        },
      ],
    });
    const out = await apiCallRaw<{
      submission: SubmissionRow;
      stock_link: { matched: number; scope_note: string };
      adoption: { adopted: { report_no: string } | null };
    }>(page, 'PUT', `/textile-submissions/${sub.id}/judgement`, {});
    expect(out.submission.status, '判定产出 judged 态').toBe(STATUS.JUDGED);
    expect(out.submission.overall_verdict, '全 pass 汇总整单 pass').toBe(VERDICT.PASS);
    expect(out.adoption.adopted?.report_no, '唯一采信本次登记的有效报告').toBe(reportNo);
    expect(typeof out.stock_link.scope_note, '判定必须回显库存联动口径').toBe('string');

    const d = await detail(page, sub.id);
    expect(d.submission.status).toBe(STATUS.JUDGED);
    expect(d.submission.overall_verdict).toBe(VERDICT.PASS);
    expect(d.child_checks.find(r => r.item_id === measId)?.verdict, '可测加考行判定 pass').toBe(
      VERDICT.PASS
    );
    expect(d.child_checks.find(r => r.item_id === manualId)?.verdict, '人工行搬运结论 pass').toBe(
      VERDICT.PASS
    );

    // judged→closed 合法归档
    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/status`, {
      status: STATUS.CLOSED,
    });
    expect((await detail(page, sub.id)).submission.status, 'judged→closed 落库').toBe(
      STATUS.CLOSED
    );
  });

  test('491-09 不合格结论也能产出：可测加考超限汇总整单 fail 并落 judged', async ({ page }) => {
    const s = seed!;
    const sub = await createSubmission(page, s, { end_user_group: 'child' });
    await advanceToReported(page, s, sub);
    const measId = await itemIdByCode(page, s.childMeasCode);
    // 可测项实测 200 超 lte 上限 100 → fail；人工项与报告项 pass，任一 fail 即整单 fail
    await apiCallRaw(page, 'PUT', `/textile-submissions/${sub.id}/child-checks`, {
      rows: [
        { item_code: s.childMeasCode, measured_value: 200, measured_unit: 'mg/kg' },
        {
          item_code: s.childManualCode,
          check_desc: 'E2E绳带核查',
          manual_conclusion: VERDICT.PASS,
        },
      ],
    });
    const out = await apiCallRaw<{
      submission: SubmissionRow;
      stock_link: { matched: number; scope_note: string };
    }>(page, 'PUT', `/textile-submissions/${sub.id}/judgement`, {});
    expect(out.submission.status, 'fail 结论同样产出 judged 态').toBe(STATUS.JUDGED);
    expect(out.submission.overall_verdict, '任一行 fail 汇总整单 fail').toBe(VERDICT.FAIL);
    // 未登记批次号无法点名库存行：联动 matched 0 且口径显式回显（不静默）
    expect(out.stock_link.matched, '无批次号库存联动零命中').toBe(0);
    expect(out.stock_link.scope_note.length, '零命中必须点名说明').toBeGreaterThan(0);
    const d = await detail(page, sub.id);
    expect(d.submission.overall_verdict).toBe(VERDICT.FAIL);
    expect(d.child_checks.find(r => r.item_id === measId)?.verdict, '超限可测行判 fail').toBe(
      VERDICT.FAIL
    );
  });

  test('491-10 草稿可删删后 404，非草稿删除被拒记录仍在', async ({ page }) => {
    const s = seed!;
    const draft = await createSubmission(page, s);
    const del = await apiCallRaw<{ deleted: number }>(
      page,
      'DELETE',
      `/textile-submissions/${draft.id}`
    );
    expect(del.deleted, '删除回显被删 id').toBe(draft.id);
    const gone = await apiCallExpectFail(page, 'GET', `/textile-submissions/${draft.id}`);
    expect(gone.status, '删后详情 404').toBe(404);
    expectRejection(gone, APP_ERROR_CODES.NOT_FOUND, '491-10 删后回读');

    // 推进到 sampling 后非草稿：删除被业务门拒，记录仍在
    const advanced = await createSubmission(page, s);
    await apiCallRaw(page, 'POST', `/textile-submissions/${advanced.id}/items`, {
      extra_item_codes: [],
    });
    await apiCallRaw(page, 'PUT', `/textile-submissions/${advanced.id}/status`, {
      status: STATUS.SAMPLING,
    });
    const res = await apiCallExpectFail(page, 'DELETE', `/textile-submissions/${advanced.id}`);
    expectRejection(res, APP_ERROR_CODES.BUSINESS_ERROR, '491-10 非草稿删除');
    expect((await detail(page, advanced.id)).submission.status, '拒绝删除后记录仍在').toBe(
      STATUS.SAMPLING
    );
  });

  test('491-11 不存在 id 各腿 404：详情/修改/删除/状态/清单/核查/判定', async ({ page }) => {
    const s = seed!;
    const base = `/textile-submissions/${MISSING_ID}`;
    const legs: Array<{
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: 'GET', path: base },
      { method: 'PUT', path: base, body: submissionBody(s) },
      { method: 'DELETE', path: base },
      { method: 'PUT', path: `${base}/status`, body: { status: STATUS.SAMPLING } },
      { method: 'POST', path: `${base}/items`, body: { extra_item_codes: [] } },
      { method: 'PUT', path: `${base}/child-checks`, body: { rows: [] } },
      { method: 'PUT', path: `${base}/judgement`, body: {} },
    ];
    for (const leg of legs) {
      const res = await apiCallExpectFail(page, leg.method, leg.path, leg.body);
      expect(res.status, `491-11 ${leg.method} ${leg.path} 应 404`).toBe(404);
      expectRejection(res, APP_ERROR_CODES.NOT_FOUND, `491-11 ${leg.method} ${leg.path}`);
    }
  });

  test('491-12 重复编码建单被拒且只落一行（唯一约束不变量）', async ({ page }) => {
    const s = seed!;
    const dupNo = genCode('E2E-DUP');
    await createSubmission(page, s, { submission_no: dupNo });
    // WHY：单号唯一约束在库侧，服务层在插入结果上把唯一冲突归口成业务拒绝，
    // 所以这里钉 400 加业务机器码加拒因点名冲突单号；钉"非成功即可"会把服务端故障当契约放过。
    const res = await apiCallExpectFail(
      page,
      'POST',
      '/textile-submissions',
      submissionBody(s, { submission_no: dupNo })
    );
    expect(res.status, '重复编码属用户可改的业务拒绝，不是服务端故障').toBe(400);
    expect(failureCode(res), '唯一冲突归口业务机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(res.message ?? '', '拒因须点名冲突的单号').toContain(dupNo);
    const list = await apiCallRaw<{ items: SubmissionRow[] }>(
      page,
      'GET',
      `/textile-submissions?product_id=${s.productId}&page=1&page_size=100`
    );
    expect(list.items.filter(r => r.submission_no === dupNo).length, '重复编码只落一行').toBe(1);
  });
});
