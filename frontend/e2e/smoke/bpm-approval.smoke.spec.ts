import { test, expect } from '../diagnose-fixture';
import { gotoWithRetry } from './_goto';

test.describe('bpm approval 页面冒烟测试', () => {
  test('待办在手机与桌面边界切换且保留分页', async ({ page }) => {
    console.log('[bpm-mobile] 打开真实审批页面，检查 767/768 边界');
    await page.setViewportSize({ width: 767, height: 900 });
    await gotoWithRetry(page, '/bpm/approval');
    const mobile = page.locator('.bpm-pending-mobile');
    await expect(mobile).toBeVisible();
    await expect(mobile.locator('.el-pagination')).toBeVisible();
    await expect(page.locator('.table-card:visible .v2-table-wrapper')).toHaveCount(0);
    for (const width of [320, 360, 393, 412]) {
      console.log(`[bpm-mobile] 检查 ${width}px 待办容器及分页无横溢出`);
      await page.setViewportSize({ width, height: 900 });
      await expect(mobile).toBeVisible();
      expect(await mobile.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(2);
      await expect(mobile.locator('.el-pagination')).toBeVisible();
    }
    await page.setViewportSize({ width: 769, height: 900 });
    await expect(mobile).toHaveCount(0);
    await expect(page.locator('.table-card:visible .v2-table-wrapper')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.table-card:visible .v2-table-wrapper')).toBeVisible();
    console.log('[bpm-mobile] 审批响应式容器及分页检查完成（不代表审批业务验收）');
  });

  test('已办手机卡片保留分页且切回桌面表格', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await gotoWithRetry(page, '/bpm/approval');
    await page.getByRole('tab', { name: '已审批', exact: true }).click();
    const mobile = page.locator('.bpm-completed-mobile');
    await expect(mobile, '手机已办应显示卡片容器').toBeVisible();
    await expect(mobile.locator('.el-pagination'), '已办保留分页').toBeVisible();
    expect(
      await mobile.evaluate(el => el.scrollWidth - el.clientWidth),
      '已办手机内容不得横向撑破'
    ).toBeLessThanOrEqual(2);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(mobile, '桌面不保留手机副本').toHaveCount(0);
    await expect(
      page.locator('.table-card:visible .v2-table-wrapper'),
      '已办桌面表格可见'
    ).toBeVisible();
  });

  test('页面加载', async ({ page }) => {
    await gotoWithRetry(page, '/bpm/approval');
    await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .locator(
          '.el-table, .el-table-v2, .el-card, .el-form, .el-tabs, .dashboard-container, canvas, .echarts, .el-result, .error-page, .el-empty'
        )
        .first()
    ).toBeAttached({ timeout: 30_000 });
  });
});
