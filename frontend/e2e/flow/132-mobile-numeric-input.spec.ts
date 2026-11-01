import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  BASE_URL,
  API_PREFIX,
  apiCallRaw,
  tryCleanup,
  genName,
  baseAdminUsername,
  baseAdminPassword,
  loginInIsolatedContext,
} from './helpers';
import { pickSelectIn, formItemByExactLabel, waitForDialog } from './ui-helpers';

/*
 * 移动端面料业务数字输入框适配判据：数字键盘可达、小数精度校验、非法值不发请求。
 *
 * 调用方：CI 的 e2e flow 分片与本地 playwright --list，视口由本文件自行设定。
 * 入参：page/browser，由 diagnose-fixture 注入，带本 worker 会话与诊断上下文。
 * 传给谁：判据依据外部标准两则——其一，移动端数字键盘可达性依据 HTML inputmode 规范
 *         与 WCAG 2.1 SC 1.3.5 Identify Input Purpose：录入小数的业务字段在触屏设备必须
 *         通过 el-input 的 inputmode="decimal"（或 NumericInput 底层同款绑定）唤起数字小键盘，
 *         缺该属性即回退全字符键盘，判为可达性缺陷；其二，小数精度与非法值拦截的口径以「前端
 *         校验严于或等于后端契约」为准，落库列 products.width/gram_weight 与 bom_items.scrap_rate
 *         为 DECIMAL，前端须在提交前拦掉超位小数与越界值。测量对象是产品建档弹窗
 *         （views/product/tabs/ProductFormDialogTab.vue，路由 /product）与 BOM 明细表单
 *         （views/bom/BillOfMaterialsForm.vue，路由 /bom）在移动视口下的真实渲染输入单元与其
 *         提交网络面，全部读 DOM 属性、点真实保存、按 page.on('request') 计数，不读源码字符串。
 * 存什么：五段可复现事实——克重/幅宽录入单元的 inputmode 取值、BOM 损耗率录入单元的 inputmode
 *         取值、克重非法值下建档 POST 是否出门、合法克重与幅宽落库后由管理员会话读回的列值、
 *         出米数字段的只读派生形态。
 * 存哪里：本文件，随 e2e/flow 目录由分片编排的 hash 分片收集。
 *
 * 与源码缺陷的关系：本专项里「克重与幅宽缺数字键盘属性」一腿按当前实现判红，是对源码缺陷的
 * 如实点名，期望值不放宽；该缺陷交功能支在 ProductFormDialogTab 给两字段补 inputmode（或整体
 * 换 NumericInput）后转绿。BOM 损耗率缺提交级非法拦截属同源缺陷，其「非法值不发请求」腿需整表
 * 合法才能触发提交、脆弱且易与本缺陷无关的必填校验混判，故本文件不落成脆弱用例，改在交付报告里
 * 点名 BillOfMaterialsForm 上报，交调度与决策另派修复。可编辑米数的移动录入位在验布打卷对话框
 * （views/fabric-inspections/index.vue 卷长 m，NumericInput 三者齐备），但入口需已定级验布单、
 * 播种链跨委外建档，超出本轻量车道可达范围，如实登记为覆盖缺口而非硬凑。
 */

/** 移动竖屏测量视口 375×812，与既有窄屏回归用例同档 */
const MOBILE_VIEWPORT = { width: 375, height: 812 };

/** 建档请求 URL 匹配：仅命中 POST /products 本体，排除 /products/{id} 与批量与颜色子路径 */
const PRODUCT_CREATE_URL = new RegExp(`${API_PREFIX}/products(\\?.*)?$`);

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

/** 点页面头部动作区的建档入口并等待建档弹窗出现，返回弹窗定位 */
async function openCreateDialog(page: Page, buttonName: RegExp): Promise<Locator> {
  const trigger = page.getByRole('button', { name: buttonName }).first();
  await expect(trigger, `移动视口下应有建档入口 ${buttonName}，否则前置页面形态已变`).toBeVisible();
  await trigger.click();
  return waitForDialog(page);
}

/**
 * 读某个精确 label 表单项内真 input 的 inputmode。调用方：数字键盘两族用例。
 * 入参：作用域容器、字段 label 全文。传给谁：返回值只进本文件的键盘可达性判定。
 * 存什么存哪里：只在内存，不落库不落盘。定位失败由 Playwright 自然超时抛错，不吞成 null。
 */
async function inputmodeOfField(root: Locator, labelText: string): Promise<string | null> {
  return formItemByExactLabel(root, labelText).locator('input').first().getAttribute('inputmode');
}

/** 按唯一名称建一个产品分类，供产品建档的必选分类下拉命中，返回主键与名称供点选与回删 */
async function seedCategory(page: Page, name: string): Promise<{ id: number; name: string }> {
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/product-categories', {
    name,
  });
  const id = Number(created?.id);
  expect(
    id,
    `移动数字专项种子分类应建档成功：${JSON.stringify(created).slice(0, 160)}`
  ).toBeGreaterThan(0);
  return { id, name };
}

/**
 * 在产品建档弹窗内填一份「面料类」合法基础信息（编码/名称/分类/单位/类型/幅宽/成分）。
 * 入参含分类名与幅宽克重成分文本；克重单独由调用方填以便注入非法值。
 * 传给谁：填完后由调用方点保存驱动提交面。下拉一律经 pickSelectIn 收窄到本次可见面板，不用裸全局选项。
 */
async function fillFabricProductBase(
  page: Page,
  dialog: Locator,
  opts: { code: string; name: string; categoryName: string; width: string; composition: string }
): Promise<void> {
  await formItemByExactLabel(dialog, '产品编码').locator('input').first().fill(opts.code);
  await formItemByExactLabel(dialog, '产品名称').locator('input').first().fill(opts.name);
  await pickSelectIn(dialog, page, '产品分类', { optionText: opts.categoryName });
  await pickSelectIn(dialog, page, '单位', { optionText: '米' });
  await pickSelectIn(dialog, page, '产品类型', { optionText: '坯布' });
  await formItemByExactLabel(dialog, '有效幅宽(cm)').locator('input').first().fill(opts.width);
  await formItemByExactLabel(dialog, '面料成分').locator('input').first().fill(opts.composition);
}

/** 点弹窗页脚「保存」按钮 */
async function clickSave(page: Page, dialog: Locator): Promise<void> {
  const save = dialog.getByRole('button', { name: '保存', exact: true }).last();
  await expect(save, '建档弹窗页脚应有保存按钮').toBeVisible();
  await save.click();
}

test.describe('移动端面料数字输入 · 数字键盘可达性', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginViaUI(page);
  });

  test('产品建档克重与幅宽录入单元应携带 inputmode=decimal 以唤起数字键盘', async ({ page }) => {
    // 判据：面料数值字段在触屏必须唤起数字小键盘；本仓对同族字段（如 BOM 损耗率、验布卷长）
    // 均以 inputmode=decimal 达标，故此处对产品表单克重与幅宽立同一标准。
    // 现状取证：views/product/tabs/ProductFormDialogTab.vue 的克重(g/m²) 与 有效幅宽(cm)
    // 用裸 el-input（v-model 字符串、无 inputmode、无 type=number），移动键盘回退全字符，
    // 本用例据此判红，交功能支补 inputmode 后转绿，期望值不因当前实现缺失而放宽。
    await gotoRoute(page, '/product');
    const dialog = await openCreateDialog(page, /新建产品/);

    const offenders: string[] = [];
    for (const label of ['克重(g/m²)', '有效幅宽(cm)']) {
      const inputmode = await inputmodeOfField(dialog, label);
      if (inputmode !== 'decimal') {
        offenders.push(`${label} 实测 inputmode=${String(inputmode)}（应为 decimal）`);
      }
    }
    expect(
      offenders,
      `产品建档面料数值框缺移动数字键盘属性，源 views/product/tabs/ProductFormDialogTab.vue：${offenders.join('；')}`
    ).toEqual([]);
  });

  test('BOM 明细损耗率录入单元携带 inputmode=decimal（数字键盘达标对照）', async ({ page }) => {
    // 对照位：损耗率用 NumericInput（底层 el-input 绑定 inputmode=decimal），
    // 证明本文件的 inputmode 读法对已达标字段判绿，缺陷定位不是读法误判。
    await gotoRoute(page, '/bom');
    const dialog = await openCreateDialog(page, /新建 BOM|新建BOM|新建/);

    const addBtn = dialog.getByRole('button', { name: /添加物料|添加明细|添加/ }).first();
    await expect(addBtn, 'BOM 建档弹窗应含添加明细入口').toBeVisible();
    await addBtn.click();

    const headers = await dialog.locator('.el-table__header th').allTextContents();
    const lossIdx = headers.findIndex(h => h.includes('损耗率'));
    expect(lossIdx, 'BOM 明细表应存在损耗率列').toBeGreaterThanOrEqual(0);

    const scrapInput = dialog
      .locator('.el-table__body .el-table__row')
      .first()
      .locator('td')
      .nth(lossIdx)
      .locator('input')
      .first();
    const inputmode = await scrapInput.getAttribute('inputmode');
    expect(
      inputmode,
      `损耗率录入单元应在移动端唤起数字键盘（实测 inputmode=${String(inputmode)}），源 views/bom/BillOfMaterialsForm.vue`
    ).toBe('decimal');
  });
});

test.describe('移动端面料数字输入 · 精度校验与非法值不发请求', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginViaUI(page);
  });

  test('克重超两位小数被前端拦下且建档请求根本不出门', async ({ page }) => {
    // 判据：非法值不仅要显式报错，更要证明提交网络面没发出去——只看红字会放过「显示错误仍发请求」的真缺陷。
    // 位点：产品建档面料克重，规则 numericFormatRule 限两位小数，提交前 formRef.validate() 拦下。
    const category = await seedCategory(page, genName('E2E移动分类'));
    await gotoRoute(page, '/product');
    const dialog = await openCreateDialog(page, /新建产品/);

    let postCount = 0;
    const onRequest = (req: { method(): string; url(): string }) => {
      if (req.method() === 'POST' && PRODUCT_CREATE_URL.test(req.url())) postCount++;
    };
    page.on('request', onRequest);
    try {
      await fillFabricProductBase(page, dialog, {
        code: genName('E2E-NC'),
        name: genName('E2E非法克重'),
        categoryName: category.name,
        width: '160.5',
        composition: '95%棉 5%氨纶',
      });
      // 注入唯一非法项：三位小数，其余必填均合法，使「请求不发」可归因于克重本身
      await formItemByExactLabel(dialog, '克重(g/m²)').locator('input').first().fill('180.123');
      await clickSave(page, dialog);

      const gramError = formItemByExactLabel(dialog, '克重(g/m²)').locator('.el-form-item__error');
      await expect(gramError, '克重超两位小数应在该字段点名格式错误').toBeVisible();
      await page.waitForTimeout(800);
      expect(postCount, `克重非法时不应发出任何建档 POST，实测 ${postCount} 次`).toBe(0);
    } finally {
      page.off('request', onRequest);
      await tryCleanup(
        page,
        'DELETE',
        `/product-categories/${category.id}`,
        '清理非法值用例的种子分类'
      );
    }
  });
});

test.describe('移动端面料数字输入 · 合法落库回读', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginViaUI(page);
  });

  test('合法克重与幅宽保存后由管理员会话逐列读回落库值', async ({ page, browser }) => {
    // 真测：合法值须真实出门、真实落库；落库结果用管理员会话读回逐列比对，不看 toast。
    const category = await seedCategory(page, genName('E2E移动分类'));
    await gotoRoute(page, '/product');
    const dialog = await openCreateDialog(page, /新建产品/);

    await fillFabricProductBase(page, dialog, {
      code: genName('E2E-OK'),
      name: genName('E2E合法克重'),
      categoryName: category.name,
      width: '160.5',
      composition: '95%棉 5%氨纶',
    });
    await formItemByExactLabel(dialog, '克重(g/m²)').locator('input').first().fill('180.25');

    const respPromise = page
      .waitForResponse(
        r =>
          r.request().method() === 'POST' && PRODUCT_CREATE_URL.test(r.url()) && r.status() === 200,
        { timeout: 30_000 }
      )
      .catch(() => null);
    await clickSave(page, dialog);
    const resp = await respPromise;
    expect(resp, '合法克重与幅宽应触发建档 POST 并 200 返回').not.toBeNull();
    const body = await resp!.json().catch(() => ({}));
    const createdId = Number((body as { data?: { id?: number } })?.data?.id);
    expect(createdId, `建档应返回新记录 id：${JSON.stringify(body).slice(0, 160)}`).toBeGreaterThan(
      0
    );

    try {
      const admin = await loginInIsolatedContext(browser, baseAdminUsername(), baseAdminPassword());
      try {
        const row = await apiCallRaw<Record<string, unknown>>(
          admin.page,
          'GET',
          `/products/${createdId}`
        );
        expect(
          Number(row.gram_weight),
          `管理员读回克重应等于录入 180.25，实测 ${JSON.stringify(row.gram_weight)}`
        ).toBe(180.25);
        expect(
          Number(row.width),
          `管理员读回有效幅宽应等于录入 160.5，实测 ${JSON.stringify(row.width)}`
        ).toBe(160.5);
      } finally {
        await admin.close();
      }
    } finally {
      await tryCleanup(page, 'DELETE', `/products/${createdId}`, '清理合法克重建档记录');
      await tryCleanup(
        page,
        'DELETE',
        `/product-categories/${category.id}`,
        '清理落库回读用例的种子分类'
      );
    }
  });
});

test.describe('移动端面料数字输入 · 派生米数只读形态', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginViaUI(page);
  });

  test('产品建档出米数为只读派生项不参与移动数字键盘录入', async ({ page }) => {
    // 米数在移动轻量录入位的正确形态：产品建档不采米数，出米数由克重×幅宽即时派生且只读。
    // 判据钉住「只读 + 随算随显 + 非可编辑数字键盘项」，防止误把派生项改成可手输造数。
    await gotoRoute(page, '/product');
    const dialog = await openCreateDialog(page, /新建产品/);

    await formItemByExactLabel(dialog, '有效幅宽(cm)').locator('input').first().fill('160');
    await formItemByExactLabel(dialog, '克重(g/m²)').locator('input').first().fill('180');

    const meters = formItemByExactLabel(dialog, '出米数').locator('input').first();
    const readonlyAttr = await meters.getAttribute('readonly');
    expect(
      readonlyAttr,
      '出米数应声明为只读，源 views/product/tabs/ProductFormDialogTab.vue'
    ).not.toBeNull();
    const value = await meters.inputValue();
    expect(value.trim(), '填入克重与幅宽后出米数应即时算出并非空，实测为空说明派生链断').not.toBe(
      ''
    );
  });
});
