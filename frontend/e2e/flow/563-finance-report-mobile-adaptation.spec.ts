// 563 财务与报表域新适配回归：凭证桌面表格与手机卡片切换，销售分析表格退场换卡片，BI 图表保留并加手机横向滚动提示。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告，不改任何业务数据。
// 存什么：三页各自的视口切换事实——桌面表格或图表可见、手机卡片容器或滚动提示出现、桌面表格退场、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import { BASE_URL, loginViaUI } from './helpers';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

// 桌面锚点：凭证与销售分析用 el-table；BI 路由重定向到销售分析的多维分析页签，图表本体不卡片化，锚 ECharts 容器。
const CASES = [
  {
    route: '/voucher',
    label: '凭证管理',
    mobile: 'voucher-mobile',
    desktop: '.el-table',
    desktopExits: true,
  },
  {
    route: '/sales-analysis',
    label: '销售分析',
    mobile: 'sales-analysis-mobile',
    desktop: '.el-table',
    desktopExits: true,
  },
  {
    route: '/bi/sales-analysis',
    label: 'BI 销售多维分析',
    mobile: 'bi-scroll-hint',
    desktop: '.bi-chart-container',
    desktopExits: false,
  },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

test.describe('563 财务报表域新适配响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  for (const item of CASES) {
    test(`${item.label}桌面表格与手机分支`, async ({ page }) => {
      await gotoRoute(page, item.route);

      const card = page.locator(`.${item.mobile}`);
      await expect(card, `${item.label}：桌面视口不应渲染手机卡片或滚动提示`).toHaveCount(0);
      const desktopAnchor = page.locator(`.main-content ${item.desktop}`).first();
      await expect(desktopAnchor, `${item.label}：桌面视口应显示表格或图表`).toBeVisible();

      await page.setViewportSize(PHONE);
      await expect(card, `${item.label}：手机视口卡片容器或滚动提示必须出现`).toBeVisible();
      if (item.desktopExits) {
        await expect(desktopAnchor, `${item.label}：手机视口表格必须退场`).toBeHidden();
      }

      const main = page.locator('.main-content').first();
      await expect(main, `${item.label}：主内容区应渲染`).toBeVisible();
      const overflow = await main.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${item.label}：手机视口主内容不得横向溢出`).toBeLessThanOrEqual(2);
    });
  }
});
