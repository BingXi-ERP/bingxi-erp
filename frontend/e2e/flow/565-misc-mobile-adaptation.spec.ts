// 565 杂项域四页响应式回归：物流跟踪/数据导入/支付通道/定制单跟踪在桌面显示原有内容、
// 在手机视口换卡片或自适应布局且不产生横向溢出。
// 调用方：CI 的 e2e flow 分片与 playwright test --list。入参：fixture 注入的 page 与登录态。
// 传给谁：断言只进 Playwright 报告；仅定制单跟踪腿自建一张真单（桌面 el-card 分支
//   v-if="!isPhone && timeline"，tracking.vue 桌面 el-card 挂 v-if="!isPhone && timeline"，时间线取不到即不渲染，写死 id 在
//   CI 库内不可依赖），用例结束删除回卷。
// 存什么：四页各自的视口切换事实——桌面锚点可见、手机卡片容器出现、桌面锚点退场、主内容区无横向滚动。
// 存哪里：本文件，随 e2e/flow 一起被 87 号作业矩阵收集。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  BASE_URL,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

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
    route: '/custom-orders/{id}/track',
    label: '定制单跟踪',
    mobile: 'tracking-mobile',
    table: '.custom-order-tracking .el-card',
  },
];

async function gotoRoute(page: Page, route: string): Promise<void> {
  await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
}

const CLEANUP: Array<{ path: string; label: string }> = [];

/** 定制单跟踪桌面分支仅在时间线取到真单时渲染，先建一张专属真单并回读其 id。 */
async function seedCustomOrderRoute(page: Page): Promise<string> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const created = await apiCall<{ id?: number }>(page, 'POST', '/custom-orders', {
    order_no: genCode('CO565'),
    customer_id: ctx.customerId,
    product_id: ctx.productIds[0] || 1,
    color_id: ctx.productColorIds[0],
    spec: '65%棉35%涤 40S 133x72 150cm',
    quantity: 500,
    unit: '米',
    expected_delivery_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    notes: genCode('565-track'),
  });
  const id = Number(created.data?.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(
      `565 前置不成立：定制单建单未返回 id，实际响应=${JSON.stringify(created.data).slice(0, 200)}`
    );
  }
  CLEANUP.push({ path: `/custom-orders/${id}`, label: `565 定制单 ${id}` });
  return `/custom-orders/${id}/track`;
}

test.describe('565 杂项域四页响应式', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await loginViaUI(page);
  });

  test.afterEach(async ({ page }) => {
    for (const c of CLEANUP.reverse()) {
      await tryCleanup(page, 'DELETE', c.path, c.label);
    }
    CLEANUP.length = 0;
  });

  for (const item of CASES) {
    test(`${item.label}桌面锚点与手机卡片分支`, async ({ page }) => {
      const route = item.route.includes('{id}') ? await seedCustomOrderRoute(page) : item.route;
      await gotoRoute(page, route);

      const card = page.locator(`.${item.mobile}`).first();
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
