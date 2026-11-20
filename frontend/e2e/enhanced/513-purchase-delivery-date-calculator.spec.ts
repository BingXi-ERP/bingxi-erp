// 采购交期计算：零历史供应商的默认交期与生产天数、工作日推进。
// 后端判据：handlers/purchase_order_handler.rs:500-558 定义请求/出参并调 service；
// services/purchase_delivery_calculator.rs:54-87 组装结果，:99-137 统计已完成/部分收货历史，
// :140-169 按数量分档（>500→3，>100→2，其余 1），多行取最大后乘 1.2 并下取整，
// :171-183 从起始日次日起跳过周末。零历史时均值 7、历史 0，basis 文案逐字符来自 :71-78。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface DeliveryResult {
  suggested_date?: string;
  avg_lead_time_days?: number;
  max_production_days?: number;
  calculation_basis?: string;
  historical_orders?: number;
}

const SUPPLIER_ID = 2147483647;
const ORDER_DATE = '2026-01-05';
const BASIS = '供应商无历史交货数据，使用默认交货周期7天';

function int(value: unknown, label: string): number {
  expect(Number.isInteger(value), `[513] ${label} 须整数，实际=${JSON.stringify(value)}`).toBe(
    true
  );
  return value as number;
}

async function calculate(
  page: Page,
  items: Array<{ product_id: number; quantity: string }>
): Promise<DeliveryResult> {
  const result = await apiCallRaw<DeliveryResult>(page, 'POST', '/purchase/orders/delivery-date', {
    supplier_id: SUPPLIER_ID,
    order_date: ORDER_DATE,
    items,
  });
  expect(
    typeof result?.suggested_date === 'string',
    `[513] suggested_date 须 YYYY-MM-DD，实际=${JSON.stringify(result)}`
  ).toBe(true);
  expect(result.calculation_basis, '[513] 零历史交期依据须逐字符一致').toBe(BASIS);
  expect(int(result.historical_orders, 'historical_orders'), '[513] 零历史供应商样本数').toBe(0);
  expect(int(result.avg_lead_time_days, 'avg_lead_time_days'), '[513] 默认交货周期').toBe(7);
  return result;
}

test.describe('513 采购交期计算', () => {
  test('513-01 零历史默认 7 天与生产天数分档按工作日推进', async ({ page }) => {
    await loginViaUI(page);

    const single = await calculate(page, [{ product_id: 1, quantity: '10' }]);
    expect(int(single.max_production_days, '单腿生产天数'), '[513] 10 件生产天数').toBe(1);
    expect(single.suggested_date, '[513] 默认 7 天自 2026-01-05 起推进 8 个工作日').toBe(
      '2026-01-15'
    );

    const multi = await calculate(page, [
      { product_id: 1, quantity: '60' },
      { product_id: 2, quantity: '501' },
    ]);
    expect(
      int(multi.max_production_days, '多腿生产天数'),
      '[513] 60→1、501→3，多行取 3 后乘 1.2 下取整仍为 3'
    ).toBe(3);
    expect(multi.suggested_date, '[513] 7+3=10 个工作日推进到 2026-01-19').toBe('2026-01-19');
  });
});
