// 564 系统管理域响应式回归：BPM/数据权限/全域审计在桌面显示表格、在手机视口换卡片；
// 双因子设置是表单页，桌面锚点改为表单容器，手机视口表单项单列且按钮满足 44px 触控。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告，不改任何业务数据。
// 存什么：四页各自的视口切换事实——桌面表格/表单容器可见、手机卡片容器出现、桌面表格退场、
//        表单页触控目标高度、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import { BASE_URL, loginViaUI } from './helpers';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const CASES = [
  {
    route: '/bpm',
    label: 'BPM审批管理',
    mobile: 'bpm-mobile',
    table: '.main-content .el-table',
  },
  {
    route: '/data-permission',
    label: '数据权限',
    mobile: 'data-permission-mobile',
    table: '.main-content .el-table',
  },
  {
    route: '/omni-audit',
    label: '全域审计',
    mobile: 'omni-audit-mobile',
    table: '.main-content .el-table:visible',
    logsTab: true,
  },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

test.describe('564 系统管理域四页响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  for (const item of CASES) {
    test(`${item.label}桌面表格与手机卡片分支`, async ({ page }) => {
      await gotoRoute(page, item.route);
      if (item.logsTab) {
        await page.locator('.el-tabs__item').nth(1).click();
      }

      const card = page.locator(`.${item.mobile}`);
      await expect(card, `${item.label}：桌面视口不应渲染手机卡片容器`).toHaveCount(0);
      const table = page.locator(item.table).first();
      await expect(table, `${item.label}：桌面视口应显示表格`).toBeVisible();

      await page.setViewportSize(PHONE);
      await expect(card.first(), `${item.label}：手机视口卡片容器必须出现`).toBeVisible();
      await expect(table, `${item.label}：手机视口表格必须退场`).toBeHidden();

      const main = page.locator('.main-content').first();
      await expect(main, `${item.label}：主内容区应渲染`).toBeVisible();
      const overflow = await main.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${item.label}：手机视口主内容不得横向溢出`).toBeLessThanOrEqual(2);
    });
  }

  test('双因子设置表单容器手机自适应分支', async ({ page }) => {
    await gotoRoute(page, '/security/two-factor-setup');

    const container = page.locator('.two-factor-page .el-card').first();
    await expect(container, '双因子设置：桌面视口应显示表单容器').toBeVisible();

    await page.setViewportSize(PHONE);
    await expect(container, '双因子设置：手机视口表单容器必须保留').toBeVisible();
    const touchButton = page.locator('.two-factor-page .el-button:visible').first();
    await expect(touchButton, '双因子设置：手机视口操作按钮应可见').toBeVisible();
    const box = await touchButton.boundingBox();
    expect(box, '双因子设置：手机视口操作按钮应可测量').not.toBeNull();
    expect(box!.height, '双因子设置：手机视口按钮触控高度不得低于 44px').toBeGreaterThanOrEqual(44);

    const main = page.locator('.main-content').first();
    await expect(main, '双因子设置：主内容区应渲染').toBeVisible();
    const overflow = await main.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow, '双因子设置：手机视口主内容不得横向溢出').toBeLessThanOrEqual(2);
  });
});
