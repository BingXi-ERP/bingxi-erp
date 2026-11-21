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

// 按唯一批次与整单快照比较副作用，避免全库并发写入干扰拒绝判据。
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
interface AdjustmentDetail {
  id: number;
  status: string;
  total_quantity: Decimal;
  items: Array<{
    id: number;
    stock_id: number;
    quantity: Decimal;
    quantity_before: Decimal;
    quantity_after: Decimal;
    unit_cost: Decimal | null;
    amount: Decimal | null;
  }>;
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

async function seedStock(page: Page, label: string, warehouseIndex = 0): Promise<StockFixture> {
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  const warehouseId = ctx.warehouseIds[warehouseIndex];
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

async function seedReservedStock(page: Page, label: string): Promise<StockFixture> {
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  const warehouseId = ctx.warehouseIds[0];
  const batchNo = genCode(label);
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: batchNo,
    color_no: '',
    grade: '一等品',
    quantity_meters: '100',
    quantity_kg: '20',
  });
  const fixture = {
    stockId: numeric(created.id, '双计量库存主键'),
    productId,
    warehouseId,
    batchNo,
  };
  expect(Number.isSafeInteger(fixture.stockId) && fixture.stockId > 0).toBe(true);
  cleanup.push({ path: `/inventory/stock/${fixture.stockId}`, label });
  const stock = await readStock(page, fixture);
  expect(numeric(stock.quantity_on_hand, '双计量期初米数')).toBe(100);
  expect(numeric(stock.quantity_kg, '双计量期初公斤')).toBe(20);
  // 直接编辑预留字段构造库存快照，不冒称已跑通订单锁库或预留单联动。
  await apiCallRaw(page, 'PUT', `/inventory/stock/${fixture.stockId}`, {
    version: numeric(stock.version, '库存版本'),
    quantity_reserved: '30',
    quantity_available: '70',
  });
  const reserved = await readStock(page, fixture);
  expect(numeric(reserved.quantity_reserved, '期初预留')).toBe(30);
  expect(numeric(reserved.quantity_available, '期初可用')).toBe(70);
  expect(numeric(reserved.quantity_on_hand, '预留后实物数量')).toBe(100);
  expect(numeric(reserved.quantity_kg, '预留后公斤')).toBe(20);
  return fixture;
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

async function createAdjustment(
  page: Page,
  fixture: StockFixture,
  quantity: string
): Promise<AdjustmentDetail> {
  const draft = await apiCallRaw<AdjustmentDetail>(page, 'POST', '/inventory/adjustments', {
    warehouse_id: fixture.warehouseId,
    adjustment_date: new Date().toISOString(),
    adjustment_type: 'decrease',
    reason_type: 'other',
    reason_description: genCode('468-valid'),
    items: [{ stock_id: fixture.stockId, quantity, unit_cost: '1' }],
  });
  expect(Number.isSafeInteger(draft.id) && draft.id > 0, '合法调整单必须返回有效主键').toBe(true);
  cleanup.push({ path: `/inventory/adjustments/${draft.id}`, label: '468 合法调整单' });
  expect(draft.status, '合法调整单初始状态必须待审核').toBe('pending');
  expect(draft.items, '合法调整单必须恰有一行明细').toHaveLength(1);
  expect(draft.items[0].stock_id, '明细必须引用本用例库存').toBe(fixture.stockId);
  expect(numeric(draft.items[0].quantity, '调整数量')).toBe(Number(quantity));
  expect(numeric(draft.items[0].quantity_before, '调整前数量')).toBe(100);
  expect(numeric(draft.items[0].quantity_after, '调整后数量')).toBe(100 - Number(quantity));
  return draft;
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

  test('468-05 合法草稿不能通过新增或更新明细绕过数量校验', async ({ page }) => {
    const fixture = await seedStock(page, '468-05');
    const draft = await createAdjustment(page, fixture, '10');
    const path = `/inventory/adjustments/${draft.id}`;
    const before = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    expect(numeric(beforeStock.quantity_on_hand, '建单后库存'), '待审核不能提前扣库存').toBe(100);

    for (const quantity of ['-5', '0', '105']) {
      for (const attempt of [
        { method: 'POST' as const, path: `${path}/items` },
        { method: 'PUT' as const, path: `/inventory/adjustments/items/${draft.items[0].id}` },
      ]) {
        const fail = await apiCallExpectFail(page, attempt.method, attempt.path, {
          stock_id: fixture.stockId,
          quantity,
          unit_cost: '1',
        });
        expectQuantityRejection(fail, `${attempt.method} ${attempt.path} quantity=${quantity}`);
        expect(
          await apiCallRaw<AdjustmentDetail>(page, 'GET', path),
          '拒绝后主单及明细零漂移'
        ).toEqual(before);
        expect(await readStock(page, fixture), '拒绝后库存不能变化').toEqual(beforeStock);
        expect(await readLedger(page, fixture), '拒绝后不能新增库存流水').toEqual(beforeLedger);
      }
    }
  });

  test('468-06 库存已被另一合法调整更新时审核旧草稿必须拒绝覆盖', async ({ page }) => {
    const fixture = await seedStock(page, '468-06');
    const stale = await createAdjustment(page, fixture, '10');
    const current = await createAdjustment(page, fixture, '20');
    const approved = await apiCallRaw<AdjustmentDetail>(
      page,
      'POST',
      `/inventory/adjustments/${current.id}/approve`
    );
    expect(approved.status, '正向对照必须真正审核成功，排除接口或权限错误').toBe('approved');
    const afterCurrent = await readStock(page, fixture);
    expect(numeric(afterCurrent.quantity_on_hand, '正向审核后账面库存')).toBe(80);
    expect(numeric(afterCurrent.quantity_meters, '正向审核后米数')).toBe(80);
    cleanup.splice(
      cleanup.findIndex(entry => entry.path === `/inventory/adjustments/${current.id}`),
      1
    );
    process.stdout.write(`[468-06] 已审核调整单 ${current.id} 按业务规则保留，不尝试硬删\n`);

    const path = `/inventory/adjustments/${stale.id}`;
    const before = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    expect(before.status, '旧草稿仍应处于待审核态').toBe('pending');
    const beforeLedger = await readLedger(page, fixture);
    const fail = await apiCallExpectFail(page, 'POST', `${path}/approve`);
    expect(fail.status, '陈旧草稿审核必须业务拒绝').toBe(400);
    expect(fail.code, '陈旧快照拒绝必须是业务错误，不是数据库崩溃').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(await readStock(page, fixture), '不能把80库存按旧草稿覆写成90').toEqual(afterCurrent);
    expect(await readLedger(page, fixture), '陈旧草稿拒绝后不能新增流水').toEqual(beforeLedger);
    expect(
      await apiCallRaw<AdjustmentDetail>(page, 'GET', path),
      '拒绝审核须回滚状态及明细'
    ).toEqual(before);
  });

  test('468-07 合法明细新增修改删除后合计与金额同步回读，未审核不动库存', async ({ page }) => {
    const first = await seedStock(page, '468-07-first');
    const second = await seedStock(page, '468-07-second');
    const draft = await createAdjustment(page, first, '10');
    const path = `/inventory/adjustments/${draft.id}`;
    const beforeStocks = await Promise.all([readStock(page, first), readStock(page, second)]);
    const beforeLedgers = await Promise.all([readLedger(page, first), readLedger(page, second)]);
    expect(numeric(draft.total_quantity, '初始调整合计')).toBe(10);

    await apiCallRaw(page, 'POST', `${path}/items`, {
      stock_id: second.stockId,
      quantity: '2',
      unit_cost: '1.234',
    });
    const added = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    expect(added.items).toHaveLength(2);
    expect(numeric(added.total_quantity, '新增明细后合计')).toBe(12);
    const addedItem = added.items.find(item => item.stock_id === second.stockId);
    expect(addedItem, '新增行必须能由库存主键唯一定位').toBeDefined();
    if (!addedItem) throw new Error('[468-07] 新增明细缺失');
    expect(numeric(addedItem.amount, '新增行金额')).toBe(2.47);

    await apiCallRaw(page, 'PUT', `/inventory/adjustments/items/${draft.items[0].id}`, {
      stock_id: first.stockId,
      quantity: '7',
      unit_cost: '1.234',
    });
    const updated = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    expect(updated.items).toHaveLength(2);
    expect(numeric(updated.total_quantity, '修改明细后合计')).toBe(9);
    const updatedItem = updated.items.find(item => item.id === draft.items[0].id);
    expect(updatedItem, '修改行必须仍然存在').toBeDefined();
    if (!updatedItem) throw new Error('[468-07] 修改明细缺失');
    expect(numeric(updatedItem.quantity, '修改行数量')).toBe(7);
    expect(numeric(updatedItem.quantity_after, '修改行调整后数量')).toBe(93);
    expect(numeric(updatedItem.amount, '修改行金额')).toBe(8.64);

    await apiCallRaw(page, 'DELETE', `/inventory/adjustments/items/${addedItem.id}`);
    const deleted = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    expect(deleted.status).toBe('pending');
    expect(deleted.items).toHaveLength(1);
    expect(deleted.items[0]).toEqual(updatedItem);
    expect(numeric(deleted.total_quantity, '删除明细后合计')).toBe(7);
    expect(await Promise.all([readStock(page, first), readStock(page, second)])).toEqual(
      beforeStocks
    );
    expect(await Promise.all([readLedger(page, first), readLedger(page, second)])).toEqual(
      beforeLedgers
    );
  });

  for (const entry of ['create', 'add', 'update'] as const) {
    test(`468-08-${entry} 成本乘法溢出必须业务拒绝且整单库存流水零漂移`, async ({ page }) => {
      const fixture = await seedStock(page, `468-08-${entry}`);
      const beforeStock = await readStock(page, fixture);
      const beforeLedger = await readLedger(page, fixture);
      const overflowItem = {
        stock_id: fixture.stockId,
        quantity: '2',
        unit_cost: '79228162514264337593543950335',
      };
      let fail: ApiFailureResult;
      if (entry === 'create') {
        const first = await seedStock(page, '468-08-valid-first');
        const firstStock = await readStock(page, first);
        const firstLedger = await readLedger(page, first);
        const marker = genCode('468-08-overflow');
        expect(await findAdjustments(page, marker)).toEqual([]);
        fail = await apiCallExpectFail(page, 'POST', '/inventory/adjustments', {
          warehouse_id: fixture.warehouseId,
          adjustment_date: new Date().toISOString(),
          adjustment_type: 'decrease',
          reason_type: 'other',
          reason_description: marker,
          items: [{ stock_id: first.stockId, quantity: '1', unit_cost: '1' }, overflowItem],
        });
        const persisted = await findAdjustments(page, marker);
        for (const row of persisted)
          cleanup.push({ path: `/inventory/adjustments/${row.id}`, label: marker });
        expect(persisted, '第二行溢出须回滚主单与已插入的合法首行').toEqual([]);
        expect(await readStock(page, first)).toEqual(firstStock);
        expect(await readLedger(page, first)).toEqual(firstLedger);
      } else {
        const draft = await createAdjustment(page, fixture, '10');
        const path = `/inventory/adjustments/${draft.id}`;
        const before = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
        fail = await apiCallExpectFail(
          page,
          entry === 'add' ? 'POST' : 'PUT',
          entry === 'add' ? `${path}/items` : `/inventory/adjustments/items/${draft.items[0].id}`,
          overflowItem
        );
        expect(
          await apiCallRaw<AdjustmentDetail>(page, 'GET', path),
          '金额溢出不得改写主单或明细'
        ).toEqual(before);
      }
      expect(fail.status, '溢出应由数量金额规则拒绝，不能返回数据库异常').toBe(400);
      expect(fail.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(fail.message).toBe('调整金额超出范围，请核对数量与单位成本后重试');
      expect(await readStock(page, fixture)).toEqual(beforeStock);
      expect(await readLedger(page, fixture)).toEqual(beforeLedger);
    });
  }

  test('468-09 多行合计超出Decimal范围必须拒绝且不落单', async ({ page }) => {
    const fixture = await seedStock(page, '468-09');
    const marker = genCode('468-09-total');
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    expect(await findAdjustments(page, marker)).toEqual([]);
    const fail = await apiCallExpectFail(page, 'POST', '/inventory/adjustments', {
      warehouse_id: fixture.warehouseId,
      adjustment_date: new Date().toISOString(),
      adjustment_type: 'increase',
      reason_type: 'other',
      reason_description: marker,
      items: ['79228162514264337593543950335', '1'].map(quantity => ({
        stock_id: fixture.stockId,
        quantity,
      })),
    });
    const persisted = await findAdjustments(page, marker);
    for (const row of persisted)
      cleanup.push({ path: `/inventory/adjustments/${row.id}`, label: marker });
    expect(persisted).toEqual([]);
    expect(await readStock(page, fixture)).toEqual(beforeStock);
    expect(await readLedger(page, fixture)).toEqual(beforeLedger);
    expect(fail.status).toBe(400);
    expect(fail.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(fail.message).toBe('调整合计数量超出范围，请减少明细数量后重试');
  });

  for (const entry of ['create', 'add', 'update'] as const) {
    test(`468-10-${entry} 调整单不得引用其他仓库库存且两仓零副作用`, async ({ page }) => {
      const local = await seedStock(page, `468-10-${entry}-local`);
      const foreign = await seedStock(page, `468-10-${entry}-foreign`, 1);
      expect(foreign.warehouseId, '跨仓负例必须使用两个不同真实仓库').not.toBe(local.warehouseId);
      const beforeStocks = await Promise.all([readStock(page, local), readStock(page, foreign)]);
      const beforeLedgers = await Promise.all([readLedger(page, local), readLedger(page, foreign)]);
      const wrongWarehouseLedger = { ...foreign, warehouseId: local.warehouseId };
      const beforeWrongLedger = await readLedger(page, wrongWarehouseLedger);
      const item = { stock_id: foreign.stockId, quantity: '2', unit_cost: '1' };
      let fail: ApiFailureResult;
      if (entry === 'create') {
        const marker = genCode('468-10-cross-warehouse');
        expect(await findAdjustments(page, marker)).toEqual([]);
        fail = await apiCallExpectFail(page, 'POST', '/inventory/adjustments', {
          warehouse_id: local.warehouseId,
          adjustment_date: new Date().toISOString(),
          adjustment_type: 'decrease',
          reason_type: 'other',
          reason_description: marker,
          items: [{ stock_id: local.stockId, quantity: '1', unit_cost: '1' }, item],
        });
        const persisted = await findAdjustments(page, marker);
        for (const row of persisted)
          cleanup.push({ path: `/inventory/adjustments/${row.id}`, label: marker });
        expect(persisted, '第二行跨仓必须回滚主单及合法首行').toEqual([]);
      } else {
        const draft = await createAdjustment(page, local, '10');
        const path = `/inventory/adjustments/${draft.id}`;
        const before = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
        fail = await apiCallExpectFail(
          page,
          entry === 'add' ? 'POST' : 'PUT',
          entry === 'add' ? `${path}/items` : `/inventory/adjustments/items/${draft.items[0].id}`,
          item
        );
        expect(await apiCallRaw<AdjustmentDetail>(page, 'GET', path), '跨仓拒绝后整单不变').toEqual(
          before
        );
      }
      expect(fail.status).toBe(400);
      expect(fail.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(fail.message).toBe('库存所属仓库与调整单仓库不一致，请重新选择库存');
      expect(await Promise.all([readStock(page, local), readStock(page, foreign)])).toEqual(
        beforeStocks
      );
      expect(await Promise.all([readLedger(page, local), readLedger(page, foreign)])).toEqual(
        beforeLedgers
      );
      expect(await readLedger(page, wrongWarehouseLedger), '不得把他仓批次流水记入本仓').toEqual(
        beforeWrongLedger
      );
    });
  }

  test('468-11 非默认仓库同仓调整可正常建单并修改，不能将仓库限制写死', async ({ page }) => {
    const fixture = await seedStock(page, '468-11', 1);
    expect(fixture.warehouseId).not.toBe(getCtx().warehouseIds[0]);
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    const draft = await createAdjustment(page, fixture, '10');
    await apiCallRaw(page, 'PUT', `/inventory/adjustments/items/${draft.items[0].id}`, {
      stock_id: fixture.stockId,
      quantity: '7',
      unit_cost: '1',
    });
    const updated = await apiCallRaw<AdjustmentDetail>(
      page,
      'GET',
      `/inventory/adjustments/${draft.id}`
    );
    expect(updated.status).toBe('pending');
    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].stock_id).toBe(fixture.stockId);
    expect(numeric(updated.total_quantity, '非默认仓库合计')).toBe(7);
    expect(numeric(updated.items[0].quantity_after, '非默认仓库调整后数量')).toBe(93);
    expect(await readStock(page, fixture)).toEqual(beforeStock);
    expect(await readLedger(page, fixture)).toEqual(beforeLedger);
  });

  for (const scenario of [
    { direction: 'increase', quantity: '10', onHand: 110, available: 80, kg: 22 },
    { direction: 'decrease', quantity: '20', onHand: 80, available: 50, kg: 16 },
  ] as const) {
    test(`468-12-${scenario.direction} 审核保留预留量且可用量按差额变化，米公斤同步`, async ({
      page,
    }) => {
      const fixture = await seedReservedStock(page, `468-12-${scenario.direction}`);
      const draft = await apiCallRaw<AdjustmentDetail>(page, 'POST', '/inventory/adjustments', {
        warehouse_id: fixture.warehouseId,
        adjustment_date: new Date().toISOString(),
        adjustment_type: scenario.direction,
        reason_type: 'other',
        reason_description: genCode('468-12-valid'),
        items: [{ stock_id: fixture.stockId, quantity: scenario.quantity, unit_cost: '1' }],
      });
      expect(Number.isSafeInteger(draft.id) && draft.id > 0).toBe(true);
      const cleanupEntry = {
        path: `/inventory/adjustments/${draft.id}`,
        label: '468-12 合法调整单',
      };
      cleanup.push(cleanupEntry);
      expect(draft.status).toBe('pending');
      const path = `/inventory/adjustments/${draft.id}`;
      const approved = await apiCallRaw<AdjustmentDetail>(page, 'POST', `${path}/approve`);
      expect(approved.status).toBe('approved');
      cleanup.splice(cleanup.indexOf(cleanupEntry), 1);
      process.stdout.write(`[468-12] 已审核调整单 ${draft.id} 按业务规则保留\n`);
      const after = await readStock(page, fixture);
      expect(numeric(after.quantity_on_hand, '审核后实物米数')).toBe(scenario.onHand);
      expect(numeric(after.quantity_meters, '审核后面料米数')).toBe(scenario.onHand);
      expect(numeric(after.quantity_available, '审核后可用量')).toBe(scenario.available);
      expect(numeric(after.quantity_reserved, '审核后预留量')).toBe(30);
      expect(numeric(after.quantity_kg, '审核后公斤')).toBe(scenario.kg);
      const detail = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
      const ledger = await readLedger(page, fixture);
      const repeat = await apiCallExpectFail(page, 'POST', `${path}/approve`);
      expect(repeat.status).toBe(400);
      expect(repeat.code).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(await readStock(page, fixture), '重复审核不得再次改变数量或预留').toEqual(after);
      expect(await apiCallRaw<AdjustmentDetail>(page, 'GET', path)).toEqual(detail);
      expect(await readLedger(page, fixture), '重复审核不得新增流水').toEqual(ledger);
    });
  }

  test('468-13 调减超过可用量时审核必须整体回滚，不能侵占预留', async ({ page }) => {
    const fixture = await seedReservedStock(page, '468-13');
    const draft = await createAdjustment(page, fixture, '80');
    const path = `/inventory/adjustments/${draft.id}`;
    const before = await apiCallRaw<AdjustmentDetail>(page, 'GET', path);
    const beforeStock = await readStock(page, fixture);
    const beforeLedger = await readLedger(page, fixture);
    const fail = await apiCallExpectFail(page, 'POST', `${path}/approve`);
    expect(fail.status).toBe(400);
    expect(fail.code).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(fail.message).toBe('调整后可用库存不能为负数，请先核对预留数量');
    expect(await apiCallRaw<AdjustmentDetail>(page, 'GET', path)).toEqual(before);
    expect(await readStock(page, fixture)).toEqual(beforeStock);
    expect(await readLedger(page, fixture)).toEqual(beforeLedger);
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
