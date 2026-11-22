// 562 生产与排程域新适配回归：生产/产能/缺料/排程四张列表桌面表格与手机卡片切换，甘特图手机加滚动提示且不横向溢出。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告，不改任何业务数据。
// 存什么：五页各自的视口切换事实——桌面表格或图表可见、手机卡片容器或滚动提示出现、桌面表格退场、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import { BASE_URL, loginViaUI } from './helpers';

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

// 桌面锚点：列表四页用 el-table 或 V2Table 包装；甘特页是 ECharts 容器，手机不退场只加滚动提示。
const CASES = [
  {
    route: '/production',
    label: '生产工单',
    mobile: 'production-mobile',
    desktop: '.el-table, .v2-table-wrapper',
    desktopExits: true,
  },
  {
    route: '/capacity',
    label: '工作中心产能',
    mobile: 'capacity-mobile',
    desktop: '.el-table, .v2-table-wrapper',
    desktopExits: true,
  },
  {
    route: '/material-shortage',
    label: '物料缺口预警',
    mobile: 'shortage-mobile',
    desktop: '.el-table, .v2-table-wrapper',
    desktopExits: true,
  },
  {
    route: '/scheduling',
    label: '排程工单列表',
    mobile: 'machine-mobile',
    desktop: '.el-table, .v2-table-wrapper',
    desktopExits: true,
  },
  {
    route: '/scheduling/gantt',
    label: '排程甘特图',
    mobile: 'gantt-scroll-hint',
    desktop: '.gantt-chart-container',
    desktopExits: false,
  },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

test.describe('562 生产与排程域新适配响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  for (const item of CASES) {
    test(`${item.label}桌面表格与手机分支`, async ({ page }) => {
      await gotoRoute(page, item.route);

      const card = page.locator(`.${item.mobile}`);
      await expect(card, `${item.label}：桌面视口不应渲染手机卡片或滚动提示`).toHaveCount(0);
      const main = page
        .locator(
          '.main-content .el-table, .main-content .v2-table-wrapper, .main-content .gantt-chart-container'
        )
        .first();
      await expect(main, `${item.label}：桌面视口应渲染主内容`).toBeVisible();

      await page.setViewportSize(PHONE);
      await expect(card, `${item.label}：手机视口卡片容器或滚动提示必须出现`).toBeVisible();
      if (item.desktopExits) {
        const table = page
          .locator('.main-content .el-table, .main-content .v2-table-wrapper')
          .first();
        await expect(table, `${item.label}：手机视口表格必须退场`).toBeHidden();
      }

      const doc = page.locator('.main-content').first();
      await expect(doc, `${item.label}：主内容区应渲染`).toBeVisible();
      const overflow = await doc.evaluate(el => el.scrollWidth - el.clientWidth);
      expect(overflow, `${item.label}：手机视口主内容不得横向溢出`).toBeLessThanOrEqual(2);
    });
  }
});
