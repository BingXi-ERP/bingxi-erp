// 4.34 无障碍与可访问性专项 —— 读屏语义（表头 + 表单 label）。
// 功能：验证用户管理页表格具备列头语义与可访问名称、筛选表单与新建弹窗字段具备 label，
//   补 523（登录页 aria-label/Tab）与 524（弹窗焦点）之外未覆盖的读屏语义（对应目标 4.34「读屏兼容」）。
// 调用方：Playwright 分片（frontend/playwright.config.ts）；依赖 diagnose-fixture 登录会话与 applyAuthMocks。
// 入参：无外部入参；用 524 已验证的 /users 页与「用户管理」标题作稳定锚点，不绑定 i18n 具体文案。
// 传给谁：断言交给 Element Plus 渲染出的 .el-table__header th / .el-form-item__label，只判语义非空。
// 存什么：断言 DOM 可访问名称与 label 数量、文本，不做零值兜底。
// 存哪里：断言进测试报告，不写任何业务库。
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';

test.describe('读屏语义（4.34）', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
    await page.goto('/users');
    await expect(page.getByRole('heading', { name: '用户管理' })).toBeVisible({ timeout: 30000 });
  });

  test('用户列表表格具备非空列头语义与可访问名称', async ({ page }) => {
    const grid = page.locator('.el-table').first();
    await expect(grid, '表格容器应带非空可访问名称供读屏识别').toHaveAttribute('aria-label', /\S/);

    const headers = grid.locator('.el-table__header th');
    const count = await headers.count();
    expect(count, '表格应渲染出列头，0 个即表头语义丢失').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = (await headers.nth(i).innerText()).trim();
      expect(text.length, '每个列头都应有非空文本，供读屏播报列名').toBeGreaterThan(0);
    }
  });

  test('筛选表单与新建弹窗字段均具备非空 label', async ({ page }) => {
    const filterLabels = page.locator('.el-form--inline .el-form-item__label');
    const filterCount = await filterLabels.count();
    expect(filterCount, '筛选表单应有字段 label').toBeGreaterThan(0);
    for (let i = 0; i < filterCount; i++) {
      expect(
        (await filterLabels.nth(i).innerText()).trim().length,
        '筛选字段 label 不应为空'
      ).toBeGreaterThan(0);
    }

    await page.getByRole('button', { name: '新建用户' }).click();
    const dialog = page.locator('.el-dialog').first();
    await expect(dialog).toBeVisible({ timeout: 30000 });
    const dialogLabels = dialog.locator('.el-form-item__label');
    const dialogCount = await dialogLabels.count();
    expect(dialogCount, '新建弹窗应有字段 label').toBeGreaterThan(0);
    for (let i = 0; i < dialogCount; i++) {
      expect(
        (await dialogLabels.nth(i).innerText()).trim().length,
        '弹窗字段 label 不应为空'
      ).toBeGreaterThan(0);
    }
  });
});
