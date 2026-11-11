/**
 * 496 打印模板写面：建档查找键门、要素修正、可空列三态、默认位互斥、副本、预览注入面、打印发起与删除。
 *
 * 调用面（backend/src/routes 挂载前缀 /api/v1/erp，路由实名见 frontend/scripts/route-snapshot.txt）：
 *   GET    /api/v1/erp/print-templates 列表（出参 data 是裸数组，不是分页信封）
 *   GET    /api/v1/erp/print-templates/{id} 详情（出参模板本体）
 *   POST   /api/v1/erp/print-templates 建档
 *   PUT    /api/v1/erp/print-templates/{id} 要素修正
 *   DELETE /api/v1/erp/print-templates/{id} 删除
 *   PUT    /api/v1/erp/print-templates/{id}/set-default 设为默认（按 doc_type 互斥降位）
 *   POST   /api/v1/erp/print-templates/{id}/copy 副本
 *   POST   /api/v1/erp/print-templates/{id}/preview 预览（出参 {html, variables}）
 *   POST   /api/v1/erp/print-templates/{id}/print 发起打印（出参打印作业引用）
 *
 * 判据单源：handlers/print_handler.rs 与 services/print_service.rs 的 SUPPORTED_DOC_TYPES 词表、
 * models/print_template.rs 的列形状。出参里 template_type 序列化成键 type（serde rename），
 * 入参同名；doc_type 是渲染链路查找键，缺它或写词表外取值的模板永远命中不到
 * load_active_default_template(doc_type)，属"存得进、打不出"的影子配置，必须 fail-visible 拒。
 * 拒因原文：doc_type 空为"打印模板必须指定单据类型（doc_type），否则渲染链路无法命中该模板"，
 * 词表外为"打印模板单据类型非法（须为打印链路支持的单据类型）：{doc_type}"，
 * 份数越界为"打印模板缺省份数须在 1-99 之间：{v}"，名称长度为 1-100 字符。
 * 三者都是 400 VALIDATION_ERROR 且外显可操作文案；主键查不到是 404 NOT_FOUND，但该面走脱敏
 * 通路，出参文案恒为公共常量「资源未找到」，含 id 的真实原因只进日志，不得指望界面点名。
 * 默认位互斥按 doc_type 而非 module：同 doc_type 下另一行升位时本行必降位。
 * 可空列 default_target_name 三态为 键缺席保持、显式 null 清空、有值覆盖。
 * 预览面出三层防护：模板名与请求体变量值一律 HTML 转义，页面带 CSP 禁脚本执行。
 * 前置自建：每腿用 genCode 造唯一模板名与编码，afterAll 逐枚删除并留显式日志。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from './helpers';

interface PrintTemplate {
  id: number;
  template_code: string;
  template_name: string;
  description: string;
  module: string;
  type: string;
  doc_type: string;
  paper_size: string;
  orientation: string;
  copies_default: number;
  default_target_name: string | null;
  content: string;
  is_default: boolean;
  status: string;
}

interface PreviewBody {
  html: string;
  variables: Record<string, unknown>;
}

/** 渲染链路支持的单据类型之一，词表真值取 services/print_service.rs 的 SUPPORTED_DOC_TYPES */
const DOC_TYPE = 'sales_order';

/** 本轮建过的模板主键，afterAll 逐枚清理 */
const createdIds: number[] = [];

async function createTemplate(page: Page, body: Record<string, unknown>): Promise<PrintTemplate> {
  const row = await apiCallRaw<PrintTemplate>(page, 'POST', '/print-templates', body);
  createdIds.push(row.id);
  return row;
}

function baseBody(name: string): Record<string, unknown> {
  return {
    template_name: name,
    doc_type: DOC_TYPE,
    content: '<div>抬头 {{doc_no}}</div>',
  };
}

test.describe('496 打印模板写面', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async ({ browser }) => {
    // page 是按用例创建的 fixture，afterAll 里拿不到；清理腿自建一次性会话登录后执行
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdIds) {
        try {
          await apiCallRaw<void>(page, 'DELETE', `/print-templates/${id}`);
          console.info(`[496] 清理模板 ${id} 已删除`);
        } catch (e) {
          console.warn(`[496] 清理模板 ${id} 失败: ${(e as Error).message}`);
        }
      }
    } finally {
      await ctx.close();
    }
  });

  test('496-01 建档只给必填即落库，出参键与列同名且默认位为假', async ({ page }) => {
    const name = genCode('E2E-PTPL');
    const row = await createTemplate(page, baseBody(name));

    expect(row.id, '建档应返回自增主键').toBeGreaterThan(0);
    expect(row.template_name).toBe(name);
    expect(row.doc_type, '查找键必须原样回显，否则前端编辑会丢它').toBe(DOC_TYPE);
    expect(row.template_code, '未给编码时后端要造出可用编码').not.toBe('');
    expect(row.is_default, '新建行不得抢占默认位').toBe(false);
    expect(row.status, '未给状态时落列默认启用 token').toBe('active');
    expect(row.copies_default >= 1 && row.copies_default <= 99, '缺省份数须落在受理区间内').toBe(
      true
    );
    expect(row, 'template_type 的出参键序列化成 type').toHaveProperty('type');
    expect(row.type, 'type 承载的是模板类别文本').toEqual(expect.any(String));
    expect(row.default_target_name, '未给目标时为空值而非造出来').toBeNull();
  });

  test('496-02 单据类型空串被 400 点名必填键缺失', async ({ page }) => {
    const bad = baseBody(genCode('E2E-PTPL-EMPTYDOC'));
    bad.doc_type = '';
    const fail = await apiCallExpectFail(page, 'POST', '/print-templates', bad);

    expect(fail.status, '空 doc_type 应 400').toBe(400);
    expect(failureCode(fail), '机器码应是校验类').toBe('VALIDATION_ERROR');
    expect(fail.message, '拒因要点名缺失的查找键').toContain('打印模板必须指定单据类型');
  });

  test('496-03 单据类型词表外被 400 且拒因逐字符含非法值', async ({ page }) => {
    const bad = baseBody(genCode('E2E-PTPL-DOCX'));
    bad.doc_type = 'not_a_real_doc_type';
    const res = await apiCallExpectFail(page, 'POST', '/print-templates', bad);

    expect(res.status).toBe(400);
    expect(failureCode(res)).toBe('VALIDATION_ERROR');
    expect(res.message, '拒因点名传入的非法取值').toContain('打印模板单据类型非法');
    expect(res.message).toContain('not_a_real_doc_type');
  });

  test('496-04 名称超长与份数越界各自 400 并点名越界值', async ({ page }) => {
    const tooLong = baseBody(`E2E-PTPL-${'x'.repeat(120)}`);
    const nameFail = await apiCallExpectFail(page, 'POST', '/print-templates', tooLong);
    expect(nameFail.status).toBe(400);
    expect(nameFail.message, '长度门点名 1-100 字符区间').toContain('模板名称长度须为 1-100 字符');

    const zeroCopies = { ...baseBody(genCode('E2E-PTPL-C0')), copies_default: 0 };
    const zeroFail = await apiCallExpectFail(page, 'POST', '/print-templates', zeroCopies);
    expect(zeroFail.status).toBe(400);
    expect(zeroFail.message).toContain('打印模板缺省份数须在 1-99 之间：0');

    const overCopies = { ...baseBody(genCode('E2E-PTPL-C100')), copies_default: 100 };
    const overFail = await apiCallExpectFail(page, 'POST', '/print-templates', overCopies);
    expect(overFail.status).toBe(400);
    expect(overFail.message, '上界同样逐值点名，不只拦下界').toContain('：100');
  });

  test('496-05 详情按主键回读建档本体，不存在的主键 404 且不泄露主键', async ({ page }) => {
    const row = await createTemplate(page, baseBody(genCode('E2E-PTPL-DETAIL')));
    const again = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${row.id}`);

    expect(again.template_code).toBe(row.template_code);
    expect(again.doc_type).toBe(DOC_TYPE);
    expect(again.id, '详情出参是本体，不再套一层壳').toBe(row.id);

    const miss = await apiCallExpectFail(page, 'GET', '/print-templates/99999999');
    expect(miss.status).toBe(404);
    expect(failureCode(miss)).toBe(APP_ERROR_CODES.NOT_FOUND);
    // 脱敏判据：404 面只出公共文案，被查主键不得原样回显（防用 404 文案探测存在的模板 id）
    expect(miss.message, '脱敏文案非空').not.toBe('');
    expect(miss.message, '不得把被查主键外显给调用方').not.toContain('99999999');
  });

  test('496-06 列表出参是裸数组且每行都带 type 与 doc_type 两键', async ({ page }) => {
    const row = await createTemplate(page, baseBody(genCode('E2E-PTPL-LIST')));
    const rows = await apiCallRaw<PrintTemplate[]>(page, 'GET', '/print-templates');

    expect(Array.isArray(rows), '列表信封是数组而非分页对象').toBe(true);
    const hit = rows.find(r => r.id === row.id);
    expect(hit, '新建模板须出现在列表里').toBeDefined();
    expect(hit?.doc_type, '列表行也要可见查找键').toBe(DOC_TYPE);
    expect(typeof hit?.type, '列表行用 type 承载 template_type').toBe('string');
  });

  test('496-07 修正要素后回读新值，未传 doc_type 时查找键保持', async ({ page }) => {
    const row = await createTemplate(page, baseBody(genCode('E2E-PTPL-UPD')));
    const newName = genCode('E2E-PTPL-UPD2');
    await apiCallRaw<PrintTemplate>(page, 'PUT', `/print-templates/${row.id}`, {
      template_name: newName,
      paper_size: 'A4',
      copies_default: 3,
    });
    const after = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${row.id}`);

    expect(after.template_name, '改名要落库').toBe(newName);
    expect(after.paper_size).toBe('A4');
    expect(after.copies_default, '份数改到区间内要生效').toBe(3);
    expect(after.doc_type, '请求未带查找键时保持原值，不许被清空').toBe(DOC_TYPE);

    const badPatch = await apiCallExpectFail(page, 'PUT', `/print-templates/${row.id}`, {
      doc_type: 'bogus_type',
    });
    expect(badPatch.status, '修正腿同样吃词表门').toBe(400);
  });

  test('496-08 打印目标三态 有值覆盖 显式空清空 键缺席保持', async ({ page }) => {
    const row = await createTemplate(page, {
      ...baseBody(genCode('E2E-PTPL-TGT')),
      default_target_name: 'E2E-TARGET-A',
    });
    expect(row.default_target_name, '建档给值即覆盖').toBe('E2E-TARGET-A');

    await apiCallRaw<PrintTemplate>(page, 'PUT', `/print-templates/${row.id}`, {
      description: '只改描述，不动目标键',
    });
    const kept = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${row.id}`);
    expect(kept.default_target_name, '键缺席要保持原值').toBe('E2E-TARGET-A');
    expect(kept.description, '同腿的要素修正要落库').toBe('只改描述，不动目标键');

    await apiCallRaw<PrintTemplate>(page, 'PUT', `/print-templates/${row.id}`, {
      default_target_name: null,
    });
    const cleared = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${row.id}`);
    expect(cleared.default_target_name, '显式空值要清空而非保持').toBeNull();
  });

  test('496-09 默认位按 doc_type 互斥 另一行上任本行必降位', async ({ page }) => {
    const a = await createTemplate(page, {
      ...baseBody(genCode('E2E-PTPL-DA')),
      is_default: true,
    });
    const b = await createTemplate(page, baseBody(genCode('E2E-PTPL-DB')));
    expect(a.is_default, '显式请求置默认位要生效').toBe(true);

    await apiCallRaw<void>(page, 'PUT', `/print-templates/${b.id}/set-default`);
    const aAfter = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${a.id}`);
    const bAfter = await apiCallRaw<PrintTemplate>(page, 'GET', `/print-templates/${b.id}`);

    expect(bAfter.is_default, 'set-default 要把目标行升位').toBe(true);
    expect(aAfter.is_default, '同 doc_type 旧默认行必须被降位').toBe(false);
  });

  test('496-10 副本换编码留查找键且不继承默认位', async ({ page }) => {
    const src = await createTemplate(page, {
      ...baseBody(genCode('E2E-PTPL-SRC')),
      is_default: true,
    });
    const copy = await apiCallRaw<PrintTemplate>(page, 'POST', `/print-templates/${src.id}/copy`);
    createdIds.push(copy.id);

    expect(copy.id, '副本是新行').not.toBe(src.id);
    expect(copy.template_code, '副本编码要区别于源').not.toBe(src.template_code);
    expect(copy.doc_type, '副本沿用源的查找键').toBe(DOC_TYPE);
    expect(copy.is_default, '副本不得继承默认位，否则同单据类型两行争位').toBe(false);
  });

  test('496-11 预览出 html 与 variables 且模板名与变量值一律转义', async ({ page }) => {
    const risky = `<svg onload=alert(1)>${genCode('E2E-PTPL-XSS')}`;
    const row = await createTemplate(page, {
      ...baseBody(risky),
      css_styles: 'h3{color:#111}',
    });
    const preview = await apiCallRaw<PreviewBody>(
      page,
      'POST',
      `/print-templates/${row.id}/preview`,
      { doc_no: '<b>SO-1</b>' }
    );

    expect(preview.html, '预览要出 html 串').toContain('<div>抬头');
    expect(preview.html, '页面要带禁脚本的 CSP 声明').toContain(
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
    );
    expect(preview.html, '模板名里的标签必须被转义，不得原样进页面').not.toContain(
      '<svg onload=alert(1)>'
    );
    expect(preview.html, '变量值同样转义后才替换占位符').not.toContain('<b>SO-1</b>');
    expect(preview.variables, '请求体变量原样回显在 variables 键').toHaveProperty('doc_no');

    const miss = await apiCallExpectFail(page, 'POST', '/print-templates/99999999/preview', {});
    expect(miss.status, '预览未存在的模板要 404').toBe(404);
  });

  test('496-12 发起打印缺单据主键被 400 点名，模板不存在 404', async ({ page }) => {
    const row = await createTemplate(page, baseBody(genCode('E2E-PTPL-PRINT')));
    const noDoc = await apiCallExpectFail(page, 'POST', `/print-templates/${row.id}/print`, {});
    expect(noDoc.status, '缺 doc_id 不允许静默排队').toBe(400);
    expect(failureCode(noDoc)).toBe('VALIDATION_ERROR');

    const miss = await apiCallExpectFail(page, 'POST', '/print-templates/99999999/print', {
      doc_id: 1,
    });
    expect(miss.status, '查找模板先于取单据主键').toBe(404);
  });

  test('496-13 无引用的模板可删除，删后详情 404', async ({ page }) => {
    const row = await createTemplate(page, baseBody(genCode('E2E-PTPL-DEL')));
    await apiCallRaw<void>(page, 'DELETE', `/print-templates/${row.id}`);

    const gone = await apiCallExpectFail(page, 'GET', `/print-templates/${row.id}`);
    expect(gone.status, '删除后详情通道必须查不到').toBe(404);
    expect(failureCode(gone)).toBe(APP_ERROR_CODES.NOT_FOUND);

    const delAgain = await apiCallExpectFail(page, 'DELETE', `/print-templates/${row.id}`);
    expect(delAgain.status, '重复删除按主键不存在拒，不静默成功').toBe(404);
  });
});
