// 方案 4.34 无障碍承载：高频列表页（产品管理）的表头语义、行操作可访问名称与纯键盘触发。
// 门禁口径同 527：只用可失败断言，不写 toBeTruthy 自比 / toBeVisible 空壳 / ?? || 兜底。
// 中文文案逐字取自 src/locales/zh-CN.ts 的 product.productListTab.* 键。
import { test, expect, type Page, type Locator } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { safeGoto } from './ui-helpers';

const MAX_TAB_PRESSES = 120;

async function tabUntilFocused(page: Page, target: Locator, description: string): Promise<void> {
  for (let press = 0; press < MAX_TAB_PRESSES; press++) {
    if (await target.evaluate(el => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target, `${description}未能在连续 Tab 遍历中获得焦点`).toBeFocused();
}

test.describe('产品列表无障碍', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await safeGoto(page, '/product');
    // el-table 的 aria-label 挂在包装 div 上，按属性精确定位（分页 aria-label 是另一串）。
    await expect(
      page.locator('[aria-label="产品列表"]'),
      '产品列表表格应以 aria-label 暴露'
    ).toHaveCount(1);
  });

  test('表头具备 columnheader 与 row 语义', async ({ page }) => {
    // 作用域收在 el-table 的主表头内，避开 fixed 覆盖层里重复的列头副本。
    const header = page.locator('[aria-label="产品列表"] .el-table__header-wrapper');
    await expect(header.getByRole('row'), '表头表体应以 row 语义渲染').toHaveCount(1);
    await expect(
      header.getByRole('columnheader', { name: '产品编码', exact: true }),
      '产品编码列头应以 columnheader 语义与可访问名称渲染'
    ).toHaveCount(1);
    await expect(
      header.getByRole('columnheader', { name: '产品名称', exact: true }),
      '产品名称列头应以 columnheader 语义与可访问名称渲染'
    ).toHaveCount(1);
    await expect(
      header.getByRole('columnheader', { name: '操作', exact: true }),
      '操作列头应以 columnheader 语义与可访问名称渲染'
    ).toHaveCount(1);

    // 种子产品保证列表非空，数据行以 row 语义渲染。
    await expect(
      page.locator('[aria-label="产品列表"] .el-table__body-wrapper .el-table__row'),
      '产品列表应有数据行'
    ).not.toHaveCount(0);
  });

  test('列表行操作按钮具备可访问名称', async ({ page }) => {
    const table = page.locator('[aria-label="产品列表"]');
    // 操作列 fixed 拆层渲染，按钮散布在主表与 fixed-right 覆盖层；作用域取整个表格包装，
    // 只断言每个操作的按钮以精确可访问名称存在（非空即命中，不绑定具体行数与层）。
    await expect(
      table.getByRole('button', { name: '详情', exact: true }),
      '行内详情按钮应以可访问名称被识别'
    ).not.toHaveCount(0);
    await expect(
      table.getByRole('button', { name: '编辑', exact: true }),
      '行内编辑按钮应以可访问名称被识别'
    ).not.toHaveCount(0);
    await expect(
      table.getByRole('button', { name: '色号', exact: true }),
      '行内色号按钮应以可访问名称被识别'
    ).not.toHaveCount(0);
    await expect(
      table.getByRole('button', { name: '删除', exact: true }),
      '行内删除按钮应以可访问名称被识别'
    ).not.toHaveCount(0);
  });

  test('新增按钮可 Tab 聚焦并由 Enter 触发', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: '新建产品', exact: true });
    await expect(createBtn, '新建产品按钮应存在且唯一').toHaveCount(1);

    await tabUntilFocused(page, createBtn, '新建产品按钮');
    await expect(createBtn, 'Tab 遍历应能聚焦新建产品按钮').toBeFocused();

    // 先确认无弹窗，再由键盘触发；弹窗出现作为 Enter 真实生效的可失败判据。
    await expect(page.locator('.el-dialog:visible'), '触发前应无可见弹窗').toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.locator('.el-dialog:visible'), 'Enter 应打开新建产品弹窗').not.toHaveCount(0);

    // 关闭弹窗，避免遮挡后续用例的焦点遍历。
    await page.keyboard.press('Escape');
    await expect(page.locator('.el-dialog:visible'), 'Escape 应关闭弹窗').toHaveCount(0);
  });

  test('分页操作可 Tab 聚焦并由键盘触发', async ({ page }) => {
    const pagination = page.locator('[aria-label="产品列表分页"]');
    await expect(pagination, '分页组件应以 aria-label 暴露').toHaveCount(1);

    const pageSizeSelect = pagination.getByRole('combobox');
    await expect(pageSizeSelect, '分页每页条数下拉应存在且唯一').toHaveCount(1);

    await tabUntilFocused(page, pageSizeSelect, '分页每页条数下拉');
    await expect(pageSizeSelect, 'Tab 遍历应能聚焦分页下拉').toBeFocused();

    // Enter 展开选项面板作为键盘触发的真实判据；el-select 的 combobox input 把
    // dropdownMenuVisible 同步到 aria-expanded（element-plus select2.mjs），无障碍
    // 测试以 ARIA 展开态为准（不写面板裸类名，口径归 ui-helpers 助手族）。
    await expect(pageSizeSelect, '展开前 combobox aria-expanded 应为 false').toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await page.keyboard.press('Enter');
    await expect(pageSizeSelect, 'Enter 应展开下拉且 aria-expanded 同步为 true').toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await page.keyboard.press('Escape');
  });
});
