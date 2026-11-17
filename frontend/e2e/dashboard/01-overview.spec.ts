// 仪表盘 E2E 测试
// 创建时间: 2026-08-19
// 覆盖范围：KPI 卡片加载 → 趋势图 → 库存分布饼图 → 动态活动表
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';

test.describe('仪表盘', () => {
  test.beforeEach(async ({ page, context }) => {
    await applyAuthMocks(context);
    await page.goto('/');
  });

  test('仪表盘 KPI 统计卡片正常加载', async ({ page }) => {
    // 导航前挂监听，取页面自身消费的那次概览响应做真值，避免二次请求与渲染之间的计数漂移。
    // 概览由仪表盘挂载时调用 GET /dashboard/overview，八张统计卡逐卡绑定其整数字段。
    const overviewResp = page.waitForResponse(
      resp => resp.url().includes('/dashboard/overview') && resp.status() === 200,
      { timeout: 30000 }
    );
    await page.goto('/dashboard');
    await expect(page.locator('.el-card, .kpi-card, [class*="stat"]').first()).toBeVisible({
      timeout: 30000,
    });

    // 原断言只认卡片可见：后端把计数回落成零或卡片绑错键时同样绿。这里逐卡与真实出参比对，
    // 缺键与非整数一律判红，不做零值兜底。
    const overview = (await (await overviewResp).json()).data as Record<string, unknown>;
    expect(overview && typeof overview === 'object', '概览响应必须携带 data 信封').toBe(true);
    const kpiBindings: Array<[string, string]> = [
      ['面料总数', 'fabric_count'],
      ['本月订单', 'total_orders'],
      ['客户总数', 'customer_count'],
      ['今日订单', 'today_orders'],
      ['待处理订单', 'pending_orders'],
      ['库存预警', 'low_stock_count'],
    ];
    for (const [label, key] of kpiBindings) {
      const raw = overview[key];
      const expected = Number(raw);
      if (!Number.isInteger(expected) || expected < 0) {
        throw new Error(`${label}的概览字段 ${key} 应为非负整数，实际=${JSON.stringify(raw)}`);
      }
      await expect(
        page.locator('.stat-card').filter({ hasText: label }).locator('.stat-value'),
        `${label}卡片应与概览出参 ${key} 同值，后端=${expected}`
      ).toHaveText(String(expected));
    }
  });

  test('仪表盘销售趋势图正常加载', async ({ page }) => {
    await page.goto('/dashboard');
    const chartContainer = page
      .locator('div')
      .filter({ has: page.locator('.echarts, .chart, svg') });
    await expect(chartContainer.first()).toBeVisible({ timeout: 30000 });
  });

  test('仪表盘最近活动表正常加载', async ({ page }) => {
    await page.goto('/dashboard');
    // 真实文案以 i18n 为准：dashboard.activityTable.title = 「最新活动」（DashboardActivityTable.vue
    // 走 t('dashboard.activityTable.title')），原用例写 /最近活动|活动记录/ 与实际字面量不符 → 恒定位不到。
    await expect(page.getByText('最新活动')).toBeVisible({
      timeout: 30000,
    });
    // 活动表按 aria-label（dashboard.activityTable.ariaLabel = 「最新活动表格」）精确定位：
    // 原 `page.locator('table, .el-table')` 在全页会命中多个表格容器 → strict mode 违例。
    // 表格在无数据时仍渲染表头 + 「暂无数据」空态（属正常渲染），故断表格可见即验证加载。
    await expect(page.getByLabel('最新活动表格')).toBeVisible({ timeout: 30000 });
  });

  test('仪表盘日期筛选功能可用', async ({ page }) => {
    // 假绿清零（Tier A）：原 `if (await dateRange.isVisible()) { click; Escape }` 用
    // getByLabel(/日期/) 定位——Dashboard.vue 的 el-date-picker 没有 <label>「日期」，
    // 只有 startPlaceholder/endPlaceholder（且随 locale 变化），恒定位不到 → 零断言通过。
    // 日期筛选是仪表盘头部无条件渲染控件（Dashboard.vue:12 无 v-if），缺失即产品缺陷，必须红。
    // 改为硬断言：控件存在且可交互（点击后日期区间面板真实弹出）。纯 UI 控件，无需造数据。
    await page.goto('/dashboard');
    const dateFilter = page.locator('.dashboard-header .el-date-editor').first();
    await expect(dateFilter, '仪表盘头部日期筛选控件应存在且可见').toBeVisible({ timeout: 30000 });
    await dateFilter.click();
    await expect(
      page.locator('.el-date-range-picker, .el-picker-panel').first(),
      '点击日期筛选后日期区间选择面板应弹出'
    ).toBeVisible({ timeout: 30000 });
    await page.keyboard.press('Escape');
  });
});
