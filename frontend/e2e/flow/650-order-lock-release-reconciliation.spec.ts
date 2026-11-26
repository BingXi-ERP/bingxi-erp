/**
 * 功能：锁定「现货订单提交锁缸、审批不重复锁、作废释放不落孤立预留」的跨模块勾稽链。
 *
 * 六要素：
 * - 调用方：本 spec 自建唯一四维库存行与 stock 来源订单，不复用共享库存与预留。
 * - 入参：唯一 color/batch/dye_lot 四维；订单单品单仓 30 米；submit、approve、cancel 三腿。
 * - 传给谁：POST /inventory/stock/fabric、GET /inventory/stock、POST /sales/orders、
 *   POST /sales/orders/{id}/submit、POST /sales/orders/{id}/approve、POST /sales/orders/{id}/cancel、
 *   GET /inventory/reservations。
 * - 存什么：submit 后 locked 预留与库存 available/reserved 变化；approve 后预留不变；
 *   cancel 后无 pending/locked 行、released_at 非空、库存回基线。
 * - 存哪里：inventory_stocks/inventory_reservations/sales_orders；唯一四维天然隔离，不留清理动作。
 *
 * 源码判据：services/so/order_workflow.rs submit 后调 lock_on_submit、cancel 时
 *   release_on_cancel；services/so/order_stock_lock.rs 按 STOCK 行 FIFO 锁缸与释放；
 *   models/inventory_reservation.rs status/released_at 字段；models/status/purchase_inventory.rs
 *   预留词表 pending/locked/released；handlers/inventory_reservation_handler.rs
 *   查询返回 {list,total} 且仅支持 product/warehouse/status 过滤。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  seedFourDimStockIn,
} from './helpers';

interface StockRow {
  batch_no?: string;
  quantity_available: number;
  quantity_reserved: number;
}

interface ReservationRow {
  id: number;
  order_id: number;
  status: string;
  quantity: number | string;
  released_at: string | null;
  notes: string | null;
}

function toNum(v: unknown, label: string): number {
  const n = Number(v);
  expect(Number.isFinite(n), `${label}：出参必须为数值，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

function expectStock(row: StockRow, available: number, reserved: number, label: string): void {
  expect(toNum(row.quantity_available, `${label} available`), `${label} 可用量`).toBe(available);
  expect(toNum(row.quantity_reserved, `${label} reserved`), `${label} 预留量`).toBe(reserved);
}

/** 唯一四维库存行回读；本 spec 的库存粒度只有一行。 */
async function readStockRow(
  page: Page,
  productId: number,
  colorNo: string,
  batchNo: string
): Promise<StockRow> {
  const res = await apiCallRaw<{ items?: StockRow[]; total?: number }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&color_no=${encodeURIComponent(colorNo)}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  const row = res.items?.find(item => String(item.batch_no ?? '') === batchNo);
  expect(row, `[650] 库存行未回读：product=${productId} batch=${batchNo}`).toBeTruthy();
  return row as StockRow;
}

/** 分页扫预留列表并按 order_id 锚定；查询参数仅 product/warehouse/status。 */
async function reservationsForOrder(
  page: Page,
  productId: number,
  warehouseId: number,
  status: string,
  orderId: number
): Promise<ReservationRow[]> {
  const rows: ReservationRow[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await apiCallRaw<{ list?: ReservationRow[]; total?: number }>(
      page,
      'GET',
      `/inventory/reservations?product_id=${productId}&warehouse_id=${warehouseId}&status=${status}&page=${pageNo}&page_size=100`
    );
    if (!Array.isArray(res.list)) {
      throw new Error(`[650] /inventory/reservations 未返回 list 数组：status=${status}`);
    }
    rows.push(...res.list.filter(row => Number(row.order_id) === orderId));
    const total = Number(res.total ?? 0);
    if (pageNo * 100 >= total) break;
  }
  return rows;
}

test.describe.serial('650 订单提交锁缸/取消释放无孤立单据', () => {
  test('650-1 submit 锁缸、approve 不重复锁、cancel 全量释放', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.productIds[0] || !ctx.warehouseIds[0] || !ctx.customerId) {
      throw new Error('[650] 前置缺失：产品/仓库/客户未就绪');
    }
    const tag = genCode('F650');
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchNo = `${tag}-B`;
    await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '40',
    });

    const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      order_date: new Date().toISOString(),
      remarks: `650锁缸${tag}`,
      items: [
        {
          product_id: productId,
          quantity: '30',
          unit_price: '25.50',
          color_no: colorNo,
          batch_requirement: batchNo,
          dye_lot_requirement: dyeLotNo,
          fulfillment_source: 'stock',
        },
      ],
    });
    const orderId = Number(created?.id);
    expect(orderId, '[650-1] stock 来源订单必须返回正整数主键').toBeGreaterThan(0);

    // draft 腿：无 locked/pending 预留，库存纹丝不动。
    expect(
      (await reservationsForOrder(page, productId, warehouseId, 'locked', orderId)).length,
      '[650-1] draft 订单不得有 locked 预留'
    ).toBe(0);
    expect(
      (await reservationsForOrder(page, productId, warehouseId, 'pending', orderId)).length,
      '[650-1] draft 订单不得有 pending 预留'
    ).toBe(0);
    expectStock(await readStockRow(page, productId, colorNo, batchNo), 40, 0, '[650-1] draft');

    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
    expectStock(await readStockRow(page, productId, colorNo, batchNo), 10, 30, '[650-1] submit 后');
    const locked = await reservationsForOrder(page, productId, warehouseId, 'locked', orderId);
    expect(locked.length, '[650-1] submit 后必须恰有 1 行 locked 预留').toBe(1);
    expect(toNum(locked[0].quantity, '[650-1] locked 预留量'), '[650-1] 锁缸量').toBe(30);

    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
    expectStock(
      await readStockRow(page, productId, colorNo, batchNo),
      10,
      30,
      '[650-1] approve 后'
    );
    const afterApprove = await reservationsForOrder(
      page,
      productId,
      warehouseId,
      'locked',
      orderId
    );
    expect(afterApprove.length, '[650-1] approve 后 locked 行数不得变').toBe(1);
    expect(afterApprove[0].id, '[650-1] approve 后必须仍是同一条预留').toBe(locked[0].id);
    expect(
      toNum(afterApprove[0].quantity, '[650-1] approve 后预留量'),
      '[650-1] 审批不触发二次锁缸'
    ).toBe(30);

    await apiCall(page, 'POST', `/sales/orders/${orderId}/cancel`);
    expectStock(await readStockRow(page, productId, colorNo, batchNo), 40, 0, '[650-1] cancel 后');
    expect(
      (await reservationsForOrder(page, productId, warehouseId, 'locked', orderId)).length,
      '[650-1] cancel 后不得残留 locked 行'
    ).toBe(0);
    expect(
      (await reservationsForOrder(page, productId, warehouseId, 'pending', orderId)).length,
      '[650-1] cancel 后不得残留 pending 行'
    ).toBe(0);
    const released = await reservationsForOrder(page, productId, warehouseId, 'released', orderId);
    expect(released.length, '[650-1] cancel 后必须留下 released 留痕').toBe(1);
    expect(String(released[0].released_at ?? ''), '[650-1] released_at 必须非空').not.toBe('');
    expect(toNum(released[0].quantity, '[650-1] released 预留量'), '[650-1] 释放量').toBe(30);
  });
});
