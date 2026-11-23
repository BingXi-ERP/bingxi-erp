// 561 销售与胚布域新适配列表响应式回归：四张列表在桌面显示表格、在手机视口换卡片且不产生横向溢出。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告，不改任何业务数据。
// 存什么：四页各自的视口切换事实——桌面表格/虚拟表格可见、手机卡片容器出现、桌面表格退场、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import { BASE_URL, loginViaUI } from './helpers';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const CASES = [
  { route: '/sales-returns', label: '销售退货', mobile: 'returns-mobile' },
  { route: '/sales-contract', label: '销售合同', mobile: 'contract-mobile' },
  { route: '/sales-price', label: '销售价格', mobile: 'price-mobile' },
  { route: '/greige-fabrics', label: '坯布档案', mobile: 'greige-mobile' },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

test.describe('561 销售与胚布域新适配列表响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  for (const item of CASES) {
    test(`${item.label}桌面表格与手机卡片分支`, async ({ page }) => {
      await gotoRoute(page, item.route);

      const card = page.locator(`.${item.mobile}`);
      await expect(card, `${item.label}：桌面视口不应渲染手机卡片容器`).toHaveCount(0);
      const table = page
        .locator('.main-content .el-table, .main-content .v2-table-wrapper')
        .first();
      await expect(table, `${item.label}：桌面视口应显示表格`).toBeVisible();

      await page.setViewportSize(PHONE);
      await expect(card, `${item.label}：手机视口卡片容器必须出现`).toBeVisible();
      await expect(table, `${item.label}：手机视口表格必须退场`).toBeHidden();

      const main = page.locator('.main-content').first();
      await expect(main, `${item.label}：主内容区应渲染`).toBeVisible();
      const overflow = await main.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${item.label}：手机视口主内容不得横向溢出`).toBeLessThanOrEqual(2);
    });
  }
});
