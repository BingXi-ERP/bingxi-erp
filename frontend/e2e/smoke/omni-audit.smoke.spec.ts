import { test, expect } from '../diagnose-fixture';
import { gotoWithRetry } from './_goto';

test.describe('omni-audit 页面冒烟测试', () => {
  test('页面加载', async ({ page }) => {
    await gotoWithRetry(page, '/omni-audit');
    await expect(page.locator('body')).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .locator(
          '.el-table, .el-table-v2, .el-card, .el-form, .el-tabs, .dashboard-container, canvas, .echarts, .el-result, .error-page, .el-empty'
        )
        .first()
    ).toBeAttached({ timeout: 30_000 });
    await expect(
      page.getByText(/近24小时事件总数|Total Events in Last 24 Hours/).first()
    ).toBeVisible();
    await expect(
      page.getByText(/近24小时界面操作|UI Actions in Last 24 Hours/).first()
    ).toBeVisible();
    await expect(
      page.getByText(/近24小时接口调用|API Calls in Last 24 Hours/).first()
    ).toBeVisible();
    await expect(
      page.getByText(/近24小时安全告警|Security Alerts in Last 24 Hours/).first()
    ).toBeVisible();
  });
});
