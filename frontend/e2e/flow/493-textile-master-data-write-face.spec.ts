/**
 * 493 纺织品安全主数据三面写面：检测项目、限值判定表、出口市场要求登记。
 *
 * 调用面（backend/src/routes/textile_safety.rs 注册）：
 *   GET    /api/v1/erp/textile-test-items 项目列表（出参 {items}，basis 过滤）
 *   POST   /api/v1/erp/textile-test-items 建项目（出参项目本体）
 *   PUT    /api/v1/erp/textile-test-items/{id} 修项目（编码封账不可改）
 *   DELETE /api/v1/erp/textile-test-items/{id} 删项目（出参 {deleted}，被引用先行人道拒绝）
 *   GET    /api/v1/erp/textile-limit-rules 限值行列表（出参 {rules}，item_id 与 safety_category 过滤）
 *   POST   /api/v1/erp/textile-limit-rules 建限值行（四维加比较器唯一）
 *   PUT    /api/v1/erp/textile-limit-rules/{id} 修订限值行（同套形态与唯一性校验）
 *   DELETE /api/v1/erp/textile-limit-rules/{id} 删限值行（出参 {deleted}）
 *   GET    /api/v1/erp/textile-export-requirements 出口要求列表（出参 {requirements}，market 过滤）
 *   POST   /api/v1/erp/textile-export-requirements 登记出口要求（编码唯一）
 *   PUT    /api/v1/erp/textile-export-requirements/{id} 修订出口要求
 *   DELETE /api/v1/erp/textile-export-requirements/{id} 删出口要求（出参 {deleted}）
 *
 * 判据单源：services/textile_safety_master_service.rs 与 models/status/textile_safety.rs。
 * 项目词表：item_kind 取 numeric/grade/sensory/boolean，basis_standard 取
 * GB18401/GB31701/EXPORT/CUSTOMER，check_kind 取 measurable/manual。
 * 限值四维：safety_category 取 GB18401_A/B/C 加 any，product_form 取 final/intermediate
 * 加 any，condition_tag 取 none 加四枚豁免标签；比较器取 lte/gte/between/forbidden/
 * must_none/na；lte 要 limit_high，gte 要 limit_low，between 要双界，后三型不收数值界。
 * 出口要求：market 只收 eu/us/jp/other（dom 不挂出口要求），requirement_type 取
 * oeko_tex/reach_svhc/cpsia_lead/cpsia_phthalate/cpsia_cert/jp_formaldehyde，
 * oeko_tex_class 取 I/II/III/IV。
 *
 * 前置自建：项目编码带 genCode 唯一后缀且 basis 一律 CUSTOMER（不自动入送检清单，
 * 避免污染同库其他用例的清单推导）；限值行与出口要求挂在本文件自建项目上。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from './helpers';

/** 检测项目行（出参键 = models/textile_test_item.rs 字段） */
interface ItemRow {
  id: number;
  item_code: string;
  item_name: string;
  item_kind: string;
  basis_standard: string;
  check_kind: string;
  method_standard: string | null;
  unit: string | null;
  description: string;
}

/** 限值行（出参键 = models/textile_limit_rule.rs 字段，DECIMAL 线格式字符串） */
interface RuleRow {
  id: number;
  item_id: number;
  safety_category: string;
  product_form: string;
  condition_tag: string;
  comparator: string;
  limit_low: string | number | null;
  limit_high: string | number | null;
  clause_ref: string;
  remark: string;
}

/** 出口要求行（出参键 = models/textile_export_market_requirement.rs 字段） */
interface ReqRow {
  id: number;
  requirement_code: string;
  market: string;
  requirement_type: string;
  oeko_tex_class: string | null;
  standard_ref: string;
  detail: string;
  mandatory: boolean;
}

/** 必然不存在的 id（i32 上界，各 404 腿共用） */
const MISSING_ID = 2147483647;

/** 清理登记：先删限值行再删项目（引用守卫），出口要求独立 */
const createdItemIds: number[] = [];
const createdRuleIds: number[] = [];
const createdReqIds: number[] = [];

function itemBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    item_code: genCode('E2E-MDI'),
    item_name: 'E2E主数据项目',
    item_kind: 'numeric',
    basis_standard: 'CUSTOMER',
    check_kind: 'measurable',
    unit: 'mg/kg',
    ...overrides,
  };
}

async function createItem(page: Page, overrides: Record<string, unknown> = {}): Promise<ItemRow> {
  const row = await apiCallRaw<ItemRow>(page, 'POST', '/textile-test-items', itemBody(overrides));
  if (!row.id) {
    throw new Error(`[493] 建项目未返回 id：${JSON.stringify(row)}`);
  }
  createdItemIds.push(row.id);
  return row;
}

function ruleBody(
  itemCode: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    item_code: itemCode,
    safety_category: 'any',
    product_form: 'any',
    condition_tag: 'none',
    comparator: 'lte',
    limit_high: 75,
    clause_ref: 'GB 18401-2010 表1',
    ...overrides,
  };
}

async function createRule(
  page: Page,
  itemCode: string,
  overrides: Record<string, unknown> = {}
): Promise<RuleRow> {
  const row = await apiCallRaw<RuleRow>(
    page,
    'POST',
    '/textile-limit-rules',
    ruleBody(itemCode, overrides)
  );
  if (!row.id) {
    throw new Error(`[493] 建限值行未返回 id：${JSON.stringify(row)}`);
  }
  createdRuleIds.push(row.id);
  return row;
}

function reqBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requirement_code: genCode('E2E-MDR'),
    market: 'eu',
    requirement_type: 'oeko_tex',
    oeko_tex_class: 'II',
    standard_ref: 'OEKO-TEX STANDARD 100',
    detail: 'E2E出口要求细则说明',
    mandatory: true,
    ...overrides,
  };
}

async function createReq(page: Page, overrides: Record<string, unknown> = {}): Promise<ReqRow> {
  const row = await apiCallRaw<ReqRow>(
    page,
    'POST',
    '/textile-export-requirements',
    reqBody(overrides)
  );
  if (!row.id) {
    throw new Error(`[493] 登记出口要求未返回 id：${JSON.stringify(row)}`);
  }
  createdReqIds.push(row.id);
  return row;
}

/** 拒绝断言：HTTP 400 + 字符串机器码（脱敏族只断码不断文案） */
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

test.describe.serial('493 纺织品安全主数据三面写面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterAll(async ({ browser }) => {
    // 引用守卫要求先清限值行再清项目；出口要求无引用面直接清。失败仅告警不判红。
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdRuleIds) {
        await tryCleanup(page, 'DELETE', `/textile-limit-rules/${id}`, `493 rule ${id}`);
      }
      for (const id of createdItemIds) {
        await tryCleanup(page, 'DELETE', `/textile-test-items/${id}`, `493 item ${id}`);
      }
      for (const id of createdReqIds) {
        await tryCleanup(page, 'DELETE', `/textile-export-requirements/${id}`, `493 req ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('493-01 检测项目建档逐字段回读，basis 过滤真下推且词表外被拒', async ({ page }) => {
    const code = genCode('E2E-MD01');
    const created = await createItem(page, {
      item_code: code,
      item_name: 'E2E建档回读项目',
      method_standard: 'GB/T 2912.1',
      description: 'E2E建档描述',
    });
    expect(created.item_code, '编码逐字符落库').toBe(code);
    expect(created.item_kind).toBe('numeric');
    expect(created.basis_standard, 'CUSTOMER 基组不自动入送检清单').toBe('CUSTOMER');
    expect(created.check_kind).toBe('measurable');
    expect(created.unit).toBe('mg/kg');
    expect(created.method_standard).toBe('GB/T 2912.1');
    expect(created.description).toBe('E2E建档描述');

    const list = await apiCallRaw<{ items: ItemRow[] }>(
      page,
      'GET',
      '/textile-test-items?basis=CUSTOMER'
    );
    expect(
      list.items.some(i => i.id === created.id),
      'basis 过滤应含本项目'
    ).toBe(true);
    expect(
      list.items.every(i => i.basis_standard === 'CUSTOMER'),
      'basis 过滤不得串组'
    ).toBe(true);

    const badBasis = await apiCallExpectFail(page, 'GET', '/textile-test-items?basis=NO-STANDARD');
    expectRejection(badBasis, APP_ERROR_CODES.VALIDATION_ERROR, '列表 basis 词表外');
  });

  test('493-02 检测项目建档校验：空值与三枚词表外被拒，重复编码业务拒绝', async ({ page }) => {
    const empty = await apiCallExpectFail(
      page,
      'POST',
      '/textile-test-items',
      itemBody({ item_code: '  ' })
    );
    expectRejection(empty, APP_ERROR_CODES.VALIDATION_ERROR, '空白项目编码');

    const badKind = await apiCallExpectFail(
      page,
      'POST',
      '/textile-test-items',
      itemBody({ item_kind: 'text' })
    );
    expectRejection(badKind, APP_ERROR_CODES.VALIDATION_ERROR, '测量类型词表外');
    expect(badKind.message ?? '', '拒因应点名合法取值').toContain('numeric');

    const badBasis = await apiCallExpectFail(
      page,
      'POST',
      '/textile-test-items',
      itemBody({ basis_standard: 'ISO9001' })
    );
    expectRejection(badBasis, APP_ERROR_CODES.VALIDATION_ERROR, '标准分组词表外');

    const badCheck = await apiCallExpectFail(
      page,
      'POST',
      '/textile-test-items',
      itemBody({ check_kind: 'auto' })
    );
    expectRejection(badCheck, APP_ERROR_CODES.VALIDATION_ERROR, '核查方式词表外');

    const code = genCode('E2E-MD02');
    await createItem(page, { item_code: code });
    const dup = await apiCallExpectFail(
      page,
      'POST',
      '/textile-test-items',
      itemBody({ item_code: code })
    );
    expectRejection(dup, APP_ERROR_CODES.BUSINESS_ERROR, '重复项目编码');
    const list = await apiCallRaw<{ items: ItemRow[] }>(
      page,
      'GET',
      '/textile-test-items?basis=CUSTOMER'
    );
    expect(list.items.filter(i => i.item_code === code).length, '重复编码只落一行').toBe(1);
  });

  test('493-03 检测项目修改：名称单位可修，编码封账不可改，悬空 id 判 404', async ({ page }) => {
    const created = await createItem(page);
    const updated = await apiCallRaw<ItemRow>(
      page,
      'PUT',
      `/textile-test-items/${created.id}`,
      itemBody({ item_code: created.item_code, item_name: 'E2E改名后项目', unit: '级' })
    );
    expect(updated.item_name, '名称修正落库').toBe('E2E改名后项目');
    expect(updated.unit, '单位修正落库').toBe('级');
    expect(updated.item_code, '编码保持不变').toBe(created.item_code);

    const renameCode = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-test-items/${created.id}`,
      itemBody({ item_code: genCode('E2E-NEWCODE') })
    );
    expectRejection(renameCode, APP_ERROR_CODES.BUSINESS_ERROR, '项目编码封账');

    const dangling = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-test-items/${MISSING_ID}`,
      itemBody()
    );
    expect(dangling.status, `悬空项目 id 应 404，实际=${dangling.status}`).toBe(404);
    expect(failureCode(dangling)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('493-04 检测项目删除引用守卫：挂着限值行禁删并点名，清引用后可删', async ({ page }) => {
    const item = await createItem(page);
    const rule = await createRule(page, item.item_code);

    const blocked = await apiCallExpectFail(page, 'DELETE', `/textile-test-items/${item.id}`);
    expectRejection(blocked, APP_ERROR_CODES.BUSINESS_ERROR, '被引用项目删除');

    await apiCallRaw(page, 'DELETE', `/textile-limit-rules/${rule.id}`);
    const idx = createdRuleIds.indexOf(rule.id);
    if (idx >= 0) createdRuleIds.splice(idx, 1);
    const del = await apiCallRaw<{ deleted: number }>(
      page,
      'DELETE',
      `/textile-test-items/${item.id}`
    );
    expect(del.deleted, '删除出参点名被删 id').toBe(item.id);
    const itemIdx = createdItemIds.indexOf(item.id);
    if (itemIdx >= 0) createdItemIds.splice(itemIdx, 1);

    const list = await apiCallRaw<{ items: ItemRow[] }>(
      page,
      'GET',
      '/textile-test-items?basis=CUSTOMER'
    );
    expect(
      list.items.some(i => i.id === item.id),
      '删除后列表不再含本项目'
    ).toBe(false);
  });

  test('493-05 限值行建档回读与四维唯一，列表双过滤真下推', async ({ page }) => {
    const item = await createItem(page);
    const rule = await createRule(page, item.item_code, { limit_high: 75, remark: 'E2E限值备注' });
    expect(rule.item_id, '限值行挂靠自建项目').toBe(item.id);
    expect(rule.safety_category).toBe('any');
    expect(rule.product_form).toBe('any');
    expect(rule.condition_tag).toBe('none');
    expect(rule.comparator).toBe('lte');
    expect(Number(rule.limit_high), '上限落库').toBe(75);
    expect(rule.limit_low, 'lte 行不存下界').toBeNull();
    expect(rule.clause_ref).toBe('GB 18401-2010 表1');
    expect(rule.remark).toBe('E2E限值备注');

    const dup = await apiCallExpectFail(
      page,
      'POST',
      '/textile-limit-rules',
      ruleBody(item.item_code)
    );
    expectRejection(dup, APP_ERROR_CODES.BUSINESS_ERROR, '同四维加比较器重复建行');

    const byItem = await apiCallRaw<{ rules: RuleRow[] }>(
      page,
      'GET',
      `/textile-limit-rules?item_id=${item.id}`
    );
    expect(byItem.rules.length, '按项目过滤只含本行').toBe(1);
    expect(byItem.rules[0].id).toBe(rule.id);

    const byCat = await apiCallRaw<{ rules: RuleRow[] }>(
      page,
      'GET',
      '/textile-limit-rules?safety_category=any'
    );
    expect(
      byCat.rules.some(r => r.id === rule.id),
      '类别过滤应含本行'
    ).toBe(true);
    expect(
      byCat.rules.every(r => r.safety_category === 'any'),
      '类别过滤不得串维'
    ).toBe(true);

    const badCat = await apiCallExpectFail(page, 'GET', '/textile-limit-rules?safety_category=D');
    expectRejection(badCat, APP_ERROR_CODES.VALIDATION_ERROR, '列表类别维词表外');
  });

  test('493-06 限值行形态门：比较器与数值界自洽，词表外与无主项目被拒', async ({ page }) => {
    const item = await createItem(page);
    const cases: Array<{ label: string; over: Record<string, unknown> }> = [
      { label: 'lte 缺上限', over: { limit_high: null } },
      { label: 'gte 缺下限', over: { comparator: 'gte', limit_high: null } },
      { label: 'between 缺下界', over: { comparator: 'between', limit_high: 100 } },
      { label: 'forbidden 夹带数值界', over: { comparator: 'forbidden', limit_high: 1 } },
      {
        label: 'must_none 夹带数值界',
        over: { comparator: 'must_none', limit_high: null, limit_low: 0 },
      },
      { label: 'na 夹带数值界', over: { comparator: 'na', limit_high: 5 } },
      { label: '比较器词表外', over: { comparator: 'eq' } },
      { label: '类别维词表外', over: { safety_category: 'GB18401_D' } },
      { label: '形态维词表外', over: { product_form: 'fabric' } },
      { label: '条件维词表外', over: { condition_tag: 'unknown_tag' } },
    ];
    for (const c of cases) {
      const res = await apiCallExpectFail(
        page,
        'POST',
        '/textile-limit-rules',
        ruleBody(item.item_code, c.over)
      );
      expectRejection(res, APP_ERROR_CODES.VALIDATION_ERROR, c.label);
    }
    const noItem = await apiCallExpectFail(
      page,
      'POST',
      '/textile-limit-rules',
      ruleBody(genCode('E2E-NOITEM'))
    );
    expectRejection(noItem, APP_ERROR_CODES.VALIDATION_ERROR, '无主项目编码');
    expect(noItem.message ?? '', '无主项目拒因应点名主数据').toContain('主数据');

    // 正向：must_none 无数值界合法落库
    const ok = await createRule(page, item.item_code, {
      comparator: 'must_none',
      limit_high: null,
    });
    expect(ok.comparator).toBe('must_none');
    expect(ok.limit_high, '禁用型不存数值界').toBeNull();
  });

  test('493-07 限值行修订：改值落库，撞他行四维被拒，悬空 id 判 404', async ({ page }) => {
    const item = await createItem(page);
    const lte = await createRule(page, item.item_code);
    const gte = await createRule(page, item.item_code, {
      comparator: 'gte',
      limit_high: null,
      limit_low: 1,
    });

    const clash = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-limit-rules/${gte.id}`,
      ruleBody(item.item_code)
    );
    expectRejection(clash, APP_ERROR_CODES.BUSINESS_ERROR, '修订撞他行四维组合');

    const updated = await apiCallRaw<RuleRow>(
      page,
      'PUT',
      `/textile-limit-rules/${lte.id}`,
      ruleBody(item.item_code, { limit_high: 50 })
    );
    expect(Number(updated.limit_high), '修订上限落库').toBe(50);
    expect(updated.id, '修订不换行 id').toBe(lte.id);

    const dangling = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-limit-rules/${MISSING_ID}`,
      ruleBody(item.item_code)
    );
    expect(dangling.status, `悬空限值行 id 应 404，实际=${dangling.status}`).toBe(404);
    expect(failureCode(dangling)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('493-08 限值行删除：出参点名，再删判 404，列表回收', async ({ page }) => {
    const item = await createItem(page);
    const rule = await createRule(page, item.item_code);
    const del = await apiCallRaw<{ deleted: number }>(
      page,
      'DELETE',
      `/textile-limit-rules/${rule.id}`
    );
    expect(del.deleted).toBe(rule.id);
    const idx = createdRuleIds.indexOf(rule.id);
    if (idx >= 0) createdRuleIds.splice(idx, 1);

    const again = await apiCallExpectFail(page, 'DELETE', `/textile-limit-rules/${rule.id}`);
    expect(again.status, `已删限值行再删应 404，实际=${again.status}`).toBe(404);
    expect(failureCode(again)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const list = await apiCallRaw<{ rules: RuleRow[] }>(
      page,
      'GET',
      `/textile-limit-rules?item_id=${item.id}`
    );
    expect(list.rules.length, '删除后按项目过滤为空集').toBe(0);
  });

  test('493-09 出口要求建档回读，market 过滤真下推且 dom 与词表外被拒', async ({ page }) => {
    const code = genCode('E2E-MD09');
    const created = await createReq(page, {
      requirement_code: code,
      market: 'eu',
      oeko_tex_class: 'II',
    });
    expect(created.requirement_code).toBe(code);
    expect(created.market).toBe('eu');
    expect(created.requirement_type).toBe('oeko_tex');
    expect(created.oeko_tex_class).toBe('II');
    expect(created.standard_ref).toBe('OEKO-TEX STANDARD 100');
    expect(created.detail).toBe('E2E出口要求细则说明');
    expect(created.mandatory, '强制位默认 true').toBe(true);

    const list = await apiCallRaw<{ requirements: ReqRow[] }>(
      page,
      'GET',
      '/textile-export-requirements?market=eu'
    );
    expect(
      list.requirements.some(r => r.id === created.id),
      'market 过滤应含本要求'
    ).toBe(true);
    expect(
      list.requirements.every(r => r.market === 'eu'),
      'market 过滤不得串市场'
    ).toBe(true);

    const dom = await apiCallExpectFail(page, 'GET', '/textile-export-requirements?market=dom');
    expectRejection(dom, APP_ERROR_CODES.VALIDATION_ERROR, '内销不挂出口要求');
    const bad = await apiCallExpectFail(page, 'GET', '/textile-export-requirements?market=mars');
    expectRejection(bad, APP_ERROR_CODES.VALIDATION_ERROR, '市场词表外');
  });

  test('493-10 出口要求校验矩阵：空值与三枚词表外被拒，重复编码业务拒绝', async ({ page }) => {
    const emptyCode = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ requirement_code: ' ' })
    );
    expectRejection(emptyCode, APP_ERROR_CODES.VALIDATION_ERROR, '空白要求编码');
    const emptyDetail = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ detail: ' ' })
    );
    expectRejection(emptyDetail, APP_ERROR_CODES.VALIDATION_ERROR, '空白细则说明');
    const dom = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ market: 'dom' })
    );
    expectRejection(dom, APP_ERROR_CODES.VALIDATION_ERROR, '登记市场收 dom');
    const badType = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ requirement_type: 'iso9001' })
    );
    expectRejection(badType, APP_ERROR_CODES.VALIDATION_ERROR, '要求类型词表外');
    const badClass = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ oeko_tex_class: 'V' })
    );
    expectRejection(badClass, APP_ERROR_CODES.VALIDATION_ERROR, 'OEKO-TEX 分级词表外');

    const code = genCode('E2E-MD10');
    await createReq(page, { requirement_code: code });
    const dup = await apiCallExpectFail(
      page,
      'POST',
      '/textile-export-requirements',
      reqBody({ requirement_code: code })
    );
    expectRejection(dup, APP_ERROR_CODES.BUSINESS_ERROR, '重复要求编码');
  });

  test('493-11 出口要求修订与删除：改值落库，再删判 404，列表回收', async ({ page }) => {
    const created = await createReq(page, {
      market: 'jp',
      requirement_type: 'jp_formaldehyde',
      oeko_tex_class: null,
    });
    const updated = await apiCallRaw<ReqRow>(
      page,
      'PUT',
      `/textile-export-requirements/${created.id}`,
      reqBody({
        requirement_code: created.requirement_code,
        market: 'jp',
        requirement_type: 'jp_formaldehyde',
        oeko_tex_class: null,
        detail: 'E2E修订后细则',
        mandatory: false,
      })
    );
    expect(updated.detail).toBe('E2E修订后细则');
    expect(updated.mandatory, '强制位可修为 false').toBe(false);

    const dangling = await apiCallExpectFail(
      page,
      'PUT',
      `/textile-export-requirements/${MISSING_ID}`,
      reqBody()
    );
    expect(dangling.status, `悬空出口要求 id 应 404，实际=${dangling.status}`).toBe(404);

    const del = await apiCallRaw<{ deleted: number }>(
      page,
      'DELETE',
      `/textile-export-requirements/${created.id}`
    );
    expect(del.deleted).toBe(created.id);
    const idx = createdReqIds.indexOf(created.id);
    if (idx >= 0) createdReqIds.splice(idx, 1);
    const again = await apiCallExpectFail(
      page,
      'DELETE',
      `/textile-export-requirements/${created.id}`
    );
    expect(again.status, `已删出口要求再删应 404，实际=${again.status}`).toBe(404);

    const list = await apiCallRaw<{ requirements: ReqRow[] }>(
      page,
      'GET',
      '/textile-export-requirements?market=jp'
    );
    expect(
      list.requirements.some(r => r.id === created.id),
      '删除后列表不再含本要求'
    ).toBe(false);
  });

  test('493-12 三面悬空 id 的修改与删除均判 404', async ({ page }) => {
    const item = await createItem(page);
    const legs: Array<{ method: 'PUT' | 'DELETE'; path: string; body?: Record<string, unknown> }> =
      [
        { method: 'PUT', path: `/textile-test-items/${MISSING_ID}`, body: itemBody() },
        { method: 'DELETE', path: `/textile-limit-rules/${MISSING_ID}` },
        {
          method: 'PUT',
          path: `/textile-limit-rules/${MISSING_ID}`,
          body: ruleBody(item.item_code),
        },
        { method: 'DELETE', path: `/textile-export-requirements/${MISSING_ID}` },
        { method: 'PUT', path: `/textile-export-requirements/${MISSING_ID}`, body: reqBody() },
      ];
    for (const leg of legs) {
      const res = await apiCallExpectFail(page, leg.method, leg.path, leg.body);
      expect(res.status, `${leg.method} ${leg.path} 应 404，实际=${res.status}`).toBe(404);
      expect(failureCode(res), `${leg.method} ${leg.path} 机器码 NOT_FOUND`).toBe(
        APP_ERROR_CODES.NOT_FOUND
      );
    }
  });
});
