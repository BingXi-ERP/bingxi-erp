// 同一订单两仓并发发货的库存守恒与订单已发量汇总（接口级真实落库用例）。
//
// 功能，覆盖并发与多端一致性中「多仓并发 ship 只扣本仓行、订单已发量守恒」的判据。
// 同一 approved 销售订单（单行 product，数量 60）在两仓各播种同四维可用库存 100，
// 两路真并发 POST ship，各带不同 warehouse_code 发 30。服务端按 warehouse_code 定位仓
// （delivery_ops/ship.rs:200-217 的 load_ship_order_context + check_inventory），
// 经订单头 lock_exclusive 串行化后两路都应成功：各仓只扣本仓库存行 100→70、
// quantity_shipped 0→30，订单行 shipped_quantity 累加为 30+30=60（两单之和），
// 无跨仓串扣（A 仓行不会被 B 仓发货扣减）。状态由 check_order_fully_shipped
// 判为 shipped。与 fullflow/20 单仓 P2P 分工：本例只钉多仓并发扣减守恒。
// 调用方，frontend e2e flow 分片；打真实端点 POST /sales/orders/{id}/ship 与
// GET /inventory/stock、GET /sales/orders/{id}，不 mock 响应。
// 入参，登录态与客户/产品/两仓库由 worker fixture 与 ensureTestEntities 提供；
// 仓库编码从仓库列表按 id 反查真实 warehouse_code，取不到直接抛错不回落默认值；
// 色号/批次/缸号带唯一 tag，两仓同四维，确保发货候选按仓而非按款串扣。
// 传给谁，断言结果只进 Playwright 报告；两路响应全部保留判读，任一路被误拒、
// 任仓被双扣或串扣、已发量对不上两单之和都判红。
// 存什么，sales_orders 一行的 status、sales_order_item 一行的 shipped_quantity、
// 两仓各一条 inventory_stocks 行的 quantity_available/quantity_shipped 真实列值。
// 存哪里，以上表均在测试库本体；本用例自建订单收尾按 id 显式 DELETE，
// 库存与订单行随发货单状态机保留，归属由唯一 tag 提供可追溯证据，不伪造审计链。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  seedFourDimStockIn,
  tryCleanup,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;
const ORDERS: number[] = [];
const SHIP_A = 30;
const SHIP_B = 30;
const ORDER_QTY = SHIP_A + SHIP_B;
const STOCK_SEED = 100;

interface SettledCall {
  ok: boolean;
  status?: number;
  text?: string;
  data?: Row;
}

async function settleCall(
  page: Page,
  method: 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<SettledCall> {
  try {
    const data = await apiCallRaw<Row>(page, method, path, body);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, status: err.status, text: err.message };
  }
}

function num(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(Number.isFinite(n), `${label} 须是有效数字，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

/** 按仓库 ID 从列表反查真实 warehouse_code，取不到直接抛错。 */
async function resolveWarehouseCode(page: Page, warehouseId: number): Promise<string> {
  const res = await apiCallRaw<Row>(page, 'GET', '/warehouses?page=1&page_size=200');
  const rows = pickListArray<Row>(res, 'items', '[666] 仓库列表反查发货编码');
  const hit = rows.find(w => Number(w.id) === warehouseId);
  if (!hit) {
    throw new Error(`[666] 仓库列表里没有 ID=${warehouseId} 的仓库行`);
  }
  const code = String(hit.warehouse_code ?? hit.code ?? '');
  if (code.trim() === '') {
    throw new Error(`[666] 仓库 ${warehouseId} 的编码键读回为空`);
  }
  return code;
}

async function readStockRow(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row> {
  const listed = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  const row = listed.items?.find(r => String(r.batch_no) === batchNo);
  expect(
    row,
    `[666] 库存行未回读：product=${productId} warehouse=${warehouseId} batch=${batchNo}`
  ).toBeTruthy();
  return row as Row;
}

/** 建一张 approved 销售订单并推到 approved，返回主键。 */
async function createApprovedOrder(page: Page, tag: string, productId: number): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    remarks: `666多仓并发发货${tag}`,
    items: [
      {
        product_id: productId,
        quantity: String(ORDER_QTY),
        unit_price: '25.50',
      },
    ],
  });
  const id = Number(created.id);
  expect(Number.isInteger(id) && id > 0, '[666] 建单未回真实主键').toBe(true);
  ORDERS.push(id);
  await apiCallRaw(page, 'POST', `/sales/orders/${id}/submit`);
  await apiCallRaw(page, 'POST', `/sales/orders/${id}/approve`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  expect(detail.status, '[666] 发货前订单须为 approved').toBe('approved');
  return id;
}

function shipBody(
  orderId: number,
  warehouseCode: string,
  productId: number,
  qty: number,
  colorNo: string,
  batchNo: string,
  dyeLotNo: string,
  tag: string
): Record<string, unknown> {
  return {
    order_id: orderId,
    warehouse_code: warehouseCode,
    items: [
      {
        product_id: productId,
        quantity: qty,
        color_no: colorNo,
        dye_lot_no: dyeLotNo,
        batch_no: batchNo,
      },
    ],
    remarks: `666并发出库${tag}`,
  };
}

test.describe('666 同订单两仓并发发货库存守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });
  test.afterEach(async ({ page }) => {
    for (const id of ORDERS.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `[666] 订单 ${id}`);
    }
  });

  test('666-01 两仓并发 ship 各扣本仓行、订单已发量为两单之和', async ({ page }) => {
    const tag = genCode('666');
    const productId = getCtx().productIds[0]!;
    const warehouseA = getCtx().warehouseIds[0]!;
    const warehouseB = getCtx().warehouseIds[1]!;
    const colorNo = `${tag}-C`;
    const batchNo = `${tag}-B`;
    const dyeLotNo = `${tag}-LOT`;

    // 两仓各播种同四维可用库存，确保发货候选按仓定位、互不串扣。
    for (const warehouseId of [warehouseA, warehouseB]) {
      await seedFourDimStockIn(page, {
        productId,
        warehouseId,
        colorNo,
        dyeLotNo,
        batchNo,
        quantityMeters: String(STOCK_SEED),
      });
    }
    // 播种自检：两仓可用量均为 100 后再发货，避免共享库残留导致守恒数字失真。
    {
      const rowA = await readStockRow(page, productId, warehouseA, batchNo);
      const rowB = await readStockRow(page, productId, warehouseB, batchNo);
      expect(num(rowA.quantity_available, '[666] A 仓播种 available'), 'A 仓播种').toBe(STOCK_SEED);
      expect(num(rowB.quantity_available, '[666] B 仓播种 available'), 'B 仓播种').toBe(STOCK_SEED);
    }

    const orderId = await createApprovedOrder(page, tag, productId);
    const codeA = await resolveWarehouseCode(page, warehouseA);
    const codeB = await resolveWarehouseCode(page, warehouseB);
    expect(codeA === codeB, '[666] 两仓须有不同 warehouse_code').toBe(false);

    // 两路真并发 ship：Promise.all 同拍发出，不同仓各发一单，服务端按仓串行扣减。
    const [resA, resB] = await Promise.all([
      settleCall(
        page,
        'POST',
        `/sales/orders/${orderId}/ship`,
        shipBody(orderId, codeA, productId, SHIP_A, colorNo, batchNo, dyeLotNo, 'A')
      ),
      settleCall(
        page,
        'POST',
        `/sales/orders/${orderId}/ship`,
        shipBody(orderId, codeB, productId, SHIP_B, colorNo, batchNo, dyeLotNo, 'B')
      ),
    ]);
    expect(resA.ok, `[666] A 仓发货应成功：status=${resA.status} text=${resA.text}`).toBe(true);
    expect(resB.ok, `[666] B 仓发货应成功：status=${resB.status} text=${resB.text}`).toBe(true);

    // 各仓只扣本仓对应库存行：available 100→70、shipped 0→30，双扣/串扣/不扣都判红。
    const rowA = await readStockRow(page, productId, warehouseA, batchNo);
    const rowB = await readStockRow(page, productId, warehouseB, batchNo);
    expect(num(rowA.quantity_available, '[666] A 仓 available'), 'A 仓只扣本仓 30').toBe(
      STOCK_SEED - SHIP_A
    );
    expect(num(rowA.quantity_shipped, '[666] A 仓 shipped'), 'A 仓已发 30').toBe(SHIP_A);
    expect(num(rowB.quantity_available, '[666] B 仓 available'), 'B 仓只扣本仓 30').toBe(
      STOCK_SEED - SHIP_B
    );
    expect(num(rowB.quantity_shipped, '[666] B 仓 shipped'), 'B 仓已发 30').toBe(SHIP_B);
    expect(num(rowA.quantity_available, '[666] A 仓非负'), 'A 仓可用量非负').toBeGreaterThanOrEqual(
      0
    );
    expect(num(rowB.quantity_available, '[666] B 仓非负'), 'B 仓可用量非负').toBeGreaterThanOrEqual(
      0
    );

    // 订单行 shipped_quantity 累加为两单之和 60，状态随全额发货推进到 shipped。
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    const lines = pickListArray<Row>(detail, 'items', '[666] 订单明细行');
    const line = lines.find(l => Number(l.product_id) === productId);
    expect(line, '[666] 订单明细须含发货产品行').toBeTruthy();
    expect(
      num(line!.shipped_quantity, '[666] 订单行 shipped_quantity'),
      '订单行已发量=两单之和'
    ).toBe(ORDER_QTY);
    expect(detail.status, '[666] 全额发货后订单状态').toBe('shipped');
  });
});
