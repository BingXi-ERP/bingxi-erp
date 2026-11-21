import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  seedGreigeStockIn,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';

/**
 * 库存数量篡改守卫：调整数量必须严格为正且不能造成负库存；盘点实盘允许零、拒绝负数。
 *
 * 真值来源：inventory_adjustment_handler.rs 的 DTO 仅 Deserialize，quantity 仅解析 Decimal；
 * inventory_adjustment_service.rs::create_adjustment / create_adjustment_items 未校验数量范围，
 * quantity_after 直接按 increase 加、其他类型减，审批再写入库存。这是 P0 源码缺陷，判责为
 * 后端补校验；调整负例要求 HTTP 400 + VALIDATION_ERROR/BUSINESS_ERROR，不把当前放行钉成预期。
 * inventory_count_service.rs::record_count_items / update_count_item 则已有非负校验，
 * 返回可外显的 VALIDATION_ERROR「实盘数量不能为负」，零值合法。
 *
 * 各 test 独立造库存、不串行依赖，调整缺陷判红不会跳过盘点对照腿。数量与流水只读本用例
 * 唯一批次；调整列表按 handler 的真实键 adjustments 读取（不是通用分页的 items），遍历
 * 所有分页后按唯一 reason_description 定位，避免用全库总数变化误判并发写入。
 * 负例先读副作用再断拒绝；软断言仅用于完整执行各数量攻击面，每条仍严格判红，不接受 5xx。
 */
type Row = Record<string, unknown>;
type Decimal = string | number;
interface StockFixture {
  stockId: number;
  productId: number;
  warehouseId: number;
  batchNo: string;
}
interface CountDetail {
  id: number;
  status: string;
  total_items: number;
  counted_items: number;
  variance_items: number;
  items: Array<{
    id: number;
    stock_id: number;
    quantity_before: Decimal;
    quantity_actual: Decimal;
    quantity_difference: Decimal;
  }>;
}
interface AdjustmentSummary {
  id: number;
  reason_description: string | null;
}

const cleanup: Array<{ path: string; label: string }> = [];

function numeric(value: unknown, label: string): number {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`[468] ${label} 缺失或不是数字：${JSON.stringify(value)}`);
  }
  if (String(value).trim().length === 0 || !Number.isFinite(Number(value))) {
    throw new Error(`[468] ${label} 不是有限数值：${JSON.stringify(value)}`);
  }
  return Number(value);
}

async function seedStock(page: Page, label: string): Promise<StockFixture> {
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  const warehouseId = ctx.warehouseIds[0];
  expect(Number.isInteger(productId) && productId > 0, '产品前置必须真实存在').toBe(true);
  expect(Number.isInteger(warehouseId) && warehouseId > 0, '仓库前置必须真实存在').toBe(true);
  const batchNo = genCode(label);
  const row = await seedGreigeStockIn(page, {
    productId,
    warehouseId,
    batchNo,
    quantityMeters: '100',
  });
  const stockId = numeric(row.id, '库存 id');
  expect(Number.isInteger(stockId) && stockId > 0, '库存造数必须成功').toBe(true);
  expect(numeric(row.quantity_on_hand, '库存 quantity_on_hand')).toBe(100);
  cleanup.push({ path: `/inventory/stock/${stockId}`, label: `${label} 库存` });
  return { stockId, productId, warehouseId, batchNo };
}

async function readStock(page: Page, fixture: StockFixture): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${fixture.stockId}`);
}

async function readLedger(page: Page, fixture: StockFixture): Promise<Row[]> {
  const result = await apiCallRaw<{ items: Row[]; total: number }>(
    page,
    'GET',
    `/inventory/stock/transactions?product_id=${fixture.productId}` +
      `&warehouse_id=${fixture.warehouseId}&batch_no=${encodeURIComponent(fixture.batchNo)}` +
      '&page=1&page_size=100'
  );
  expect(Array.isArray(result.items), '流水信封必须含 items 数组').toBe(true);
  expect(result.items.length, '唯一批次的流水必须完整回读，不能只比较截断首页').toBe(result.total);
  return result.items;
}

async function findAdjustments(page: Page, marker: string): Promise<AdjustmentSummary[]> {
  const matches: AdjustmentSummary[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const result = await apiCallRaw<{
      adjustments: AdjustmentSummary[];
      total: number;
      page: number;
      page_size: number;
    }>(page, 'GET', `/inventory/adjustments?page=${pageNo}&page_size=100`);
    expect(Array.isArray(result.adjustments), '调整列表真实键必须是 adjustments').toBe(true);
    expect(result.page).toBe(pageNo);
    expect(result.page_size).toBe(100);
    expect(Number.isInteger(result.total) && result.total >= 0, '分页 total 必须有效').toBe(true);
    matches.push(...result.adjustments.filter(row => row.reason_description === marker));
    if (pageNo * result.page_size >= result.total) return matches;
    if (pageNo === 1000) throw new Error('[468] 调整列表超出服务端分页上限，不能断言零落库');
  }
}

function expectQuantityRejection(result: ApiFailureResult, label: string): void {
  expect.soft(result.status, `${label} 必须由数量业务规则拒绝，不能放行或裸崩`).toBe(400);
  expect
    .soft([APP_ERROR_CODES.VALIDATION_ERROR, APP_ERROR_CODES.BUSINESS_ERROR], `${label} 拒绝码`)
    .toContain(result.code);
  expect
    .soft(
      typeof result.message === 'string' && result.message.trim().length > 0,
      `${label} 必须有非空拒因`
    )
    .toBe(true);
}

async function rejectAdjustment(
  page: Page,
  fixture: StockFixture,
  adjustmentType: 'increase' | 'decrease',
  quantity: string
): Promise<void> {
  const marker = genCode(`468-${adjustmentType}-${quantity}`);
  const beforeStock = await readStock(page, fixture);
  const beforeLedger = await readLedger(page, fixture);
  expect(await findAdjustments(page, marker), '攻击标记不能预先存在').toEqual([]);
  const result = await apiCallExpectFail(page, 'POST', '/inventory/adjustments', {
    warehouse_id: fixture.warehouseId,
    adjustment_date: new Date().toISOString(),
    adjustment_type: adjustmentType,
    reason_type: 'other',
    reason_description: marker,
    notes: marker,
    items: [{ stock_id: fixture.stockId, quantity, unit_cost: '1', notes: marker }],
  });
  const persisted = await findAdjustments(page, marker);
  for (const row of persisted) {
    cleanup.push({ path: `/inventory/adjustments/${row.id}`, label: marker });
  }
  expect.soft(persisted, `${marker} 不得产生调整主单或附属明细`).toEqual([]);
  expect.soft(await readStock(page, fixture), `${marker} 库存必须零变化`).toEqual(beforeStock);
  expect.soft(await readLedger(page, fixture), `${marker} 不得新增库存流水`).toEqual(beforeLedger);
  expectQuantityRejection(result, marker);
}

async function createCount(page: Page, fixture: StockFixture): Promise<CountDetail> {
  const created = await apiCallRaw<CountDetail>(page, 'POST', '/inventory/counts', {
    warehouse_id: fixture.warehouseId,
    count_date: new Date().toISOString(),
    stock_ids: [fixture.stockId],
    notes: genCode('468-count'),
  });
  expect(Number.isInteger(created.id) && created.id > 0, '盘点造数失败即判红').toBe(true);
  cleanup.push({ path: `/inventory/counts/${created.id}`, label: '468 盘点单' });
  const detail = await readCount(page, created.id);
  expect(detail.status, 'models/status/purchase_inventory.rs::inventory_count').toBe('pending');
  expect(detail.total_items).toBe(1);
  expect(detail.items).toHaveLength(1);
  expect(detail.items[0].stock_id).toBe(fixture.stockId);
  expect(numeric(detail.items[0].quantity_before, '盘点账面数量')).toBe(100);
  return detail;
}

async function readCount(page: Page, countId: number): Promise<CountDetail> {
  const detail = await apiCallRaw<CountDetail>(page, 'GET', `/inventory/counts/${countId}`);
  expect(Array.isArray(detail.items), '盘点详情必须含 items 数组').toBe(true);
  return detail;
}

test.describe('468 库存数量篡改守卫', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    for (const item of cleanup.reverse()) {
      await tryCleanup(page, 'DELETE', item.path, item.label);
    }
    cleanup.length = 0;
  });

  test('468-01 负数增减与超库存调减必须拒绝且不落单、不改库存、不写流水', async ({ page }) => {
    const fixture = await seedStock(page, '468-01');
    await test.step('负数调增会将 100 库存算成 -5，必须在建单前拒绝', async () => {
      await rejectAdjustment(page, fixture, 'increase', '-105');
    });
    await test.step('负数调减会反向增加库存，同样必须拒绝', async () => {
      await rejectAdjustment(page, fixture, 'decrease', '-5');
    });
    await test.step('正数调减超过账面库存会算成 -5，必须拒绝', async () => {
      const stock = await readStock(page, fixture);
      const excess = numeric(stock.quantity_on_hand, '调减前库存') + 5;
      await rejectAdjustment(page, fixture, 'decrease', String(excess));
    });
  });

  test('468-02 零数量调整的增减两型必须拒绝且零副作用', async ({ page }) => {
    const fixture = await seedStock(page, '468-02');
    await rejectAdjustment(page, fixture, 'increase', '0');
    await rejectAdjustment(page, fixture, 'decrease', '0');
  });

  test('468-03 盘点批量录入与明细更新均拒绝负数且整单、库存、流水不变', async ({ page }) => {
    const fixture = await seedStock(page, '468-03');
    const count = await createCount(page, fixture);
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    const attempts = [
      {
        method: 'POST' as const,
        path: `/inventory/counts/${count.id}/record`,
        body: { items: [{ stock_id: fixture.stockId, quantity_actual: '-5' }] },
      },
      {
        method: 'PUT' as const,
        path: `/inventory/counts/items/${count.items[0].id}`,
        body: { quantity_actual: '-5' },
      },
    ];
    for (const attempt of attempts) {
      const result = await apiCallExpectFail(page, attempt.method, attempt.path, attempt.body);
      expect(result.status, attempt.path).toBe(400);
      expect(result.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(result.message).toBe('实盘数量不能为负');
      expect(await readCount(page, count.id), '负数录入不得写入任何盘点字段').toEqual(count);
      expect(await readStock(page, fixture), '负数录入不得更改库存').toEqual(beforeStock);
      expect(await readLedger(page, fixture), '负数录入不得产生流水').toEqual(beforeLedger);
    }
  });

  test('468-04 盘点零实盘合法且独立回读为零，不得一刀切拒绝零', async ({ page }) => {
    const fixture = await seedStock(page, '468-04');
    const count = await createCount(page, fixture);
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    await apiCallRaw(page, 'POST', `/inventory/counts/${count.id}/record`, {
      items: [{ stock_id: fixture.stockId, quantity_actual: '0' }],
    });
    const recorded = await readCount(page, count.id);
    expect(recorded.status).toBe('pending');
    expect(recorded.counted_items).toBe(1);
    expect(recorded.variance_items).toBe(1);
    expect(numeric(recorded.items[0].quantity_actual, '批量录入零实盘')).toBe(0);
    expect(numeric(recorded.items[0].quantity_difference, '批量录入零实盘差异')).toBe(-100);

    // 先写非零再更新为零，避免明细更新未落库却因原本为零而假绿。
    await apiCallRaw(page, 'POST', `/inventory/counts/${count.id}/record`, {
      items: [{ stock_id: fixture.stockId, quantity_actual: '5' }],
    });
    const nonzero = await readCount(page, count.id);
    expect(numeric(nonzero.items[0].quantity_actual, '明细更新前非零对照')).toBe(5);
    await apiCallRaw(page, 'PUT', `/inventory/counts/items/${count.items[0].id}`, {
      quantity_actual: '0',
    });
    const updated = await readCount(page, count.id);
    expect(updated.status).toBe('pending');
    expect(numeric(updated.items[0].quantity_actual, '明细更新零实盘')).toBe(0);
    expect(numeric(updated.items[0].quantity_difference, '明细更新零实盘差异')).toBe(-100);
    expect(await readStock(page, fixture), '仅录入未审批不得直接扣减库存').toEqual(beforeStock);
    expect(await readLedger(page, fixture), '仅录入未审批不得产生库存流水').toEqual(beforeLedger);
  });
});
