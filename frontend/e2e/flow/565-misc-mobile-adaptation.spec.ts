// 565 杂项域四页响应式回归：物流跟踪/数据导入/支付通道/定制单跟踪在桌面显示原有内容、
// 在手机视口换卡片或自适应布局且不产生横向溢出。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告，不改任何业务数据。
// 存什么：四页各自的视口切换事实——桌面锚点可见、手机卡片容器出现、桌面锚点退场、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import { BASE_URL, loginViaUI } from './helpers';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

const CASES = [
  {
    route: '/logistics',
    label: '物流跟踪',
    mobile: 'logistics-mobile',
    table: '.logistics .v2-table-wrapper',
  },
  {
    route: '/data-import',
    label: '数据导入',
    mobile: 'data-import-mobile',
    table: '.data-import-page .el-table',
  },
  {
    route: '/system/payment-channels',
    label: '支付通道',
    mobile: 'payment-channels-mobile',
    table: '.payment-channels .channel-grid',
  },
  {
    route: '/custom-orders/1/track',
    label: '定制单跟踪',
    mobile: 'tracking-mobile',
    table: '.custom-order-tracking .el-card',
  },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

test.describe('565 杂项域四页响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  for (const item of CASES) {
    test(`${item.label}桌面锚点与手机卡片分支`, async ({ page }) => {
      await gotoRoute(page, item.route);

      const card = page.locator(`.${item.mobile}`);
      await expect(card, `${item.label}：桌面视口不应渲染手机卡片容器`).toHaveCount(0);
      const anchor = page.locator(item.table).first();
      await expect(anchor, `${item.label}：桌面视口应显示原有内容`).toBeVisible();

      await page.setViewportSize(PHONE);
      await expect(card, `${item.label}：手机视口卡片容器必须出现`).toBeVisible();
      await expect(anchor, `${item.label}：手机视口桌面锚点必须退场`).toBeHidden();

      const main = page.locator('.main-content').first();
      await expect(main, `${item.label}：主内容区应渲染`).toBeVisible();
      const overflow = await main.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${item.label}：手机视口主内容不得横向溢出`).toBeLessThanOrEqual(2);
    });
  }
});
