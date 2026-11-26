import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from '../flow/helpers';

interface WorkCenterModel {
  id: number;
  code: string;
  name: string;
  daily_capacity: string;
  capacity_unit: string | null;
  status: string;
}

interface CapacityTrendPoint {
  date: string;
  planned_quantity: string;
  actual_quantity: string;
  capacity_quantity: string;
  capacity_unit: string | null;
}

test.describe.serial('产能趋势真实契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('05-01 真实订单按日期返回计划量/实际量/日产能，前端图表可消费', async ({ page }) => {
    await ensureTestEntities(page);
    const productId = getCtx().quotationProductId;
    const capacityUnit = getCtx().quotationProductUnit;
    expect(productId, 'ensureTestEntities 应提供真实产品 ID').toBeTruthy();
    expect(capacityUnit, 'ensureTestEntities 应提供产品真实计量单位').toBeTruthy();

    const code = genCode('E2E-TREND');
    const name = `E2E趋势产线${code.slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    const workCenter = await apiCallRaw<WorkCenterModel>(
      page,
      'POST',
      '/production/capacity/work-centers',
      {
        code,
        name,
        work_center_type: 'weaving',
        daily_capacity: '100.00',
        capacity_unit: capacityUnit,
        status: 'ACTIVE',
      }
    );
    expect(workCenter.id, '工作中心创建应返回真实 ID').toBeTruthy();

    let orderId: number | undefined;
    try {
      const order = await apiCallRaw<{ id: number }>(
        page,
        'POST',
        '/production/production-orders/orders',
        {
          product_id: productId,
          planned_quantity: 40,
          planned_start_date: today,
          planned_end_date: today,
          work_center_id: workCenter.id,
        }
      );
      orderId = order.id;
      expect(orderId, '生产订单创建应返回真实 ID').toBeTruthy();

      const draftTrend = await apiCallRaw<CapacityTrendPoint[]>(
        page,
        'GET',
        `/production/capacity/trend?days=1&work_center_id=${workCenter.id}`
      );
      expect(draftTrend).toHaveLength(1);
      expect(Number(draftTrend[0].planned_quantity), '草稿订单不得计入计划趋势').toBe(0);

      await apiCall(page, 'PUT', `/production/production-orders/orders/${orderId}/status`, {
        status: 'SCHEDULED',
      });

      const trend = await apiCallRaw<CapacityTrendPoint[]>(
        page,
        'GET',
        `/production/capacity/trend?days=1&work_center_id=${workCenter.id}`
      );
      expect(trend).toHaveLength(1);
      expect(trend[0].date).toBe(today);
      expect(Number(trend[0].planned_quantity)).toBe(40);
      expect(Number(trend[0].actual_quantity)).toBe(0);
      expect(Number(trend[0].capacity_quantity)).toBe(100);
      expect(trend[0].capacity_unit).toBe(capacityUnit);
      expect(typeof trend[0].planned_quantity, 'Decimal 数量契约应为字符串').toBe('string');

      const ranged = await apiCallRaw<CapacityTrendPoint[]>(
        page,
        'GET',
        `/production/capacity/trend?date_from=${today}&date_to=${today}&work_center_id=${workCenter.id}`
      );
      expect(ranged).toEqual(trend);

      for (const query of [
        'days=1',
        `days=0&work_center_id=${workCenter.id}`,
        `date_from=${today}&work_center_id=${workCenter.id}`,
        `date_to=${today}&work_center_id=${workCenter.id}`,
        `date_from=${today}&date_to=2020-01-01&work_center_id=${workCenter.id}`,
      ]) {
        const failed = await apiCallExpectFail(page, 'GET', `/production/capacity/trend?${query}`);
        expect(failed.status, `非法趋势参数应返回 400: ${query}`).toBe(400);
        expect(failureCode(failed)).toBe(APP_ERROR_CODES.BAD_REQUEST);
      }

      await page.goto('/capacity');
      await page.locator('.header-actions .el-select').click();
      await page.locator('.el-select-dropdown__item').filter({ hasText: name }).click();
      const chartTrendResponse = page.waitForResponse(
        response =>
          response.url().includes('/production/capacity/trend') &&
          response.url().includes(`work_center_id=${workCenter.id}`) &&
          response.url().includes('days=30') &&
          response.request().method() === 'GET'
      );
      await page.locator('.chart-row .el-radio-button').nth(1).click();
      const chartResponse = await chartTrendResponse;
      expect(chartResponse.status(), '图表切换 30 天应读取真实趋势').toBe(200);
      const chartPayload = (await chartResponse.json()) as { data: CapacityTrendPoint[] };
      expect(chartPayload.data).toHaveLength(30);
      expect(Number(chartPayload.data.at(-1)?.planned_quantity)).toBe(40);
      await expect(page.locator('.chart-container canvas')).toBeVisible({ timeout: 30_000 });
    } finally {
      if (orderId) {
        await apiCall(page, 'DELETE', `/production/production-orders/orders/${orderId}`).catch(
          (error: unknown) => console.warn('[capacity-trend] 清理生产订单失败', error)
        );
      }
      await apiCall(page, 'DELETE', `/production/capacity/work-centers/${workCenter.id}`).catch(
        (error: unknown) => console.warn('[capacity-trend] 清理工作中心失败', error)
      );
    }
  });
});
