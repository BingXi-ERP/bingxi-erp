// 现货订单提交锁缸与改量差量联动 E2E（4 枚 test 串行链）。
//
// 判据链注释：后端 services/so/order_stock_lock.rs 只在 submit_order 对
// fulfillment_source=stock 明细锁缸：product+color+非空 batch/dye_lot 严格匹配、
// 正常/合格行 FIFO，available-=q/reserved+=q + version 乐观锁；ledger 借
// inventory_reservations（notes 以 STOCKLOCK| 开头）承载 stock_id，供改量/作废/硬删
// 同事务回缸。所有断言读真实库存三列并用 toBe 机器数，不用 toBeVisible 空壳。
//
// 与既有 213/444 的分工：213 钉「POST /inventory/reservations 只插行不写库存量」，
// 444 钉「手动锁/释放接口的库存语义」；本例只钉订单工作流 submit/update/cancel
// 对库存三列的真实写入，不重复 213/444 的预留 API 用例。prod/purchase 不锁，
// 避免大面积影响既有 E2E——本例 T1 专门用 production 行守这条边界。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  seedFourDimStockIn,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
const ORDERS: number[] = [];

function num(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(Number.isFinite(n), `${label} 须是有效数字，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

async function stockRow(
  page: Page,
  productId: number,
  colorNo: string,
  batchNo: string
): Promise<Row> {
  const listed = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&color_no=${encodeURIComponent(colorNo)}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  const row = listed.items?.find(r => String(r.batch_no) === batchNo);
  expect(row, `[566] 库存行未回读：product=${productId} batch=${batchNo}`).toBeTruthy();
  return row as Row;
}

function expectStock(row: Row, available: number, reserved: number, label: string): void {
  expect(num(row.quantity_available, `${label} available`), `${label} 可用量`).toBe(available);
  expect(num(row.quantity_reserved, `${label} reserved`), `${label} 预留量`).toBe(reserved);
}

async function createStockOrder(
  page: Page,
  tag: string,
  quantity: number,
  colorNo: string,
  batchNo: string,
  dyeLotNo: string,
  source: 'stock' | 'production' = 'stock',
  productId?: number
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    remarks: `566锁缸${tag}`,
    items: [
      {
        product_id: productId ?? getCtx().productIds[0],
        quantity: String(quantity),
        unit_price: '25.50',
        color_no: colorNo,
        batch_requirement: batchNo,
        dye_lot_requirement: dyeLotNo,
        fulfillment_source: source,
      },
    ],
  });
  const id = num(created.id, `[566] ${tag} 建单 id`);
  expect(Number.isInteger(id) && id > 0, `[566] ${tag} 建单未回真实主键`).toBe(true);
  ORDERS.push(id);
  return id;
}

test.describe('566 现货订单提交锁缸与改量差量联动', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });
  test.afterEach(async ({ page }) => {
    for (const id of ORDERS.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `[566] 订单 ${id}`);
    }
  });

  test('566-01 stock 行提交锁缸、production 行不锁', async ({ page }) => {
    const tag = genCode('566A');
    const productId = getCtx().productIds[0];
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchNo = `${tag}-B`;
    await seedFourDimStockIn(page, {
      productId,
      warehouseId: getCtx().warehouseIds[0],
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '100',
    });

    const stockOrder = await createStockOrder(page, tag, 30, colorNo, batchNo, dyeLotNo, 'stock');
    await apiCallRaw(page, 'POST', `/sales/orders/${stockOrder}/submit`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 70, 30, '[566-01] stock 提交后');

    // 同库存维度再造一张 production 行订单：提交后库存三列必须纹丝不动。
    const prodOrder = await createStockOrder(
      page,
      `${tag}-P`,
      20,
      colorNo,
      batchNo,
      dyeLotNo,
      'production'
    );
    await apiCallRaw(page, 'POST', `/sales/orders/${prodOrder}/submit`);
    expectStock(
      await stockRow(page, productId, colorNo, batchNo),
      70,
      30,
      '[566-01] production 提交后'
    );
  });

  test('566-02 库存不足整单拒绝且零写入', async ({ page }) => {
    const tag = genCode('566B');
    const productId = getCtx().productIds[0];
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchNo = `${tag}-B`;
    await seedFourDimStockIn(page, {
      productId,
      warehouseId: getCtx().warehouseIds[0],
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '10',
    });
    const orderId = await createStockOrder(page, tag, 20, colorNo, batchNo, dyeLotNo);

    const rejected = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/submit`);
    expect(failureCode(rejected), '[566-02] 库存不足须业务族拒绝').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(rejected.message ?? ''), '[566-02] 拒因须点名现货库存不足').toContain(
      '现货库存不足'
    );
    expectStock(await stockRow(page, productId, colorNo, batchNo), 10, 0, '[566-02] 整单拒绝后');
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(detail.status, '[566-02] 提交失败主单不能推进状态').toBe('DRAFT');
  });

  test('566-03 改量差量同步与作废释放', async ({ page }) => {
    const tag = genCode('566C');
    const productId = getCtx().productIds[0];
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchNo = `${tag}-B`;
    await seedFourDimStockIn(page, {
      productId,
      warehouseId: getCtx().warehouseIds[0],
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '100',
    });
    const orderId = await createStockOrder(page, tag, 30, colorNo, batchNo, dyeLotNo);
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 70, 30, '[566-03] 提交后');

    const before = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    await apiCallRaw(page, 'PUT', `/sales/orders/${orderId}`, {
      status: before.status,
      expected_updated_at: before.updated_at,
      items: [
        {
          product_id: productId,
          quantity: '45',
          unit_price: '25.50',
          color_no: colorNo,
          batch_requirement: batchNo,
          dye_lot_requirement: dyeLotNo,
          fulfillment_source: 'stock',
        },
      ],
    });
    expectStock(
      await stockRow(page, productId, colorNo, batchNo),
      55,
      45,
      '[566-03] 改量后为净差量'
    );

    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/cancel`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 100, 0, '[566-03] 作废后回缸');
  });

  test('566-04 同色同缸多批次 FIFO 扣缸', async ({ page }) => {
    const tag = genCode('566D');
    const productId = getCtx().productIds[0];
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchFirst = `${tag}-B1`;
    const batchSecond = `${tag}-B2`;
    const warehouseId = getCtx().warehouseIds[0];
    await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo: batchFirst,
      quantityMeters: '10',
    });
    await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo: batchSecond,
      quantityMeters: '10',
    });

    // 不带 batch_requirement：同 product+color+lot 的两行按 created_at/id FIFO 扣。
    const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: getCtx().customerId,
      order_date: new Date().toISOString(),
      remarks: `566FIFO${tag}`,
      items: [
        {
          product_id: productId,
          quantity: '15',
          unit_price: '25.50',
          color_no: colorNo,
          dye_lot_requirement: dyeLotNo,
          fulfillment_source: 'stock',
        },
      ],
    });
    const orderId = num(created.id, '[566-04] 建单 id');
    ORDERS.push(orderId);
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);

    expectStock(
      await stockRow(page, productId, colorNo, batchFirst),
      0,
      10,
      '[566-04] FIFO 先批次'
    );
    expectStock(
      await stockRow(page, productId, colorNo, batchSecond),
      5,
      5,
      '[566-04] FIFO 后批次'
    );
  });
});
