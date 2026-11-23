/**
 * 功能：锁定「现货订单提交锁缸→改量差量→取消释放」全链无孤立预留行。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属产品与四维库存行（共享产品会被并行用例锁缸污染），
 *   建 fulfillment_source=stock 的现货订单，覆盖 draft→submit→approve→改量→cancel 全程。
 * - 入参：库存 100 米；订单先 30 后改 45，色号/缸号/批号每轮唯一；
 *   审批仅走审批分支（后端 order_workflow.rs 审批无锁缸事件分支）。
 * - 传给谁：POST /products、/inventory/stock/fabric（seedFourDimStockIn）、/sales/orders、
 *   /sales/orders/{id}/submit|approve|cancel、PUT /sales/orders/{id}；
 *   GET /inventory/stock、/inventory/reservations（status=locked/pending 过滤）。
 * - 存什么：提交锁缸由 order_workflow.rs:149 lock_on_submit 写 inventory_reservations
 *   （notes 前缀 STOCKLOCK|，status 小写 locked），改量走 sync_on_items_replaced 先 release_all
 *   再按新行量重锁，取消走 release_on_cancel 置 released 并回缸。
 * - 断言什么：draft 无 locked/pending 预留行；submit 后出现本单 locked 行且数量 30、
 *   库存可用降为 70；approve 后库存与预留纹丝不动；改量后旧行 released、新 locked 行 45、
 *   库存 55/45；cancel 后无任何 locked/pending 行、库存回 100/0，全程无孤立单据。
 * - 前置：ctx 客户/仓库/品类就绪；库存三列断言用机器数 toBe，预留数量用 BigInt 分位。
 * - 不重复：566 已钉 FIFO 扣缸与整单拒绝零写入，213/444 已钉手动预留 API 语义；
 *   本例钉订单工作流全程的预留行状态机与无孤立终态。
 */
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
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
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;
const CLEANUP: Array<{ path: string; label: string }> = [];
const ORDERS: number[] = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

function num(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(Number.isFinite(n), `[650] ${label} 须是有效数字，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

async function stockRow(page: Page, productId: number, colorNo: string, batchNo: string): Promise<Row> {
  const listed = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&color_no=${encodeURIComponent(colorNo)}` +
      `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  const rows = pickListArray({ items: listed.items }, 'items', '[650] 库存行');
  const hit = rows.find(r => String(r.batch_no) === batchNo);
  expect(hit, `[650] 库存行未回读：product=${productId} batch=${batchNo}`).toBeTruthy();
  return hit as Row;
}

function expectStock(row: Row, available: number, reserved: number, label: string): void {
  expect(num(row.quantity_available, `${label} available`), `${label} 可用量`).toBe(available);
  expect(num(row.quantity_reserved, `${label} reserved`), `${label} 预留量`).toBe(reserved);
}

/** 预留列表按 product+status 过滤后只保留本单行：product 维度隔离本用例，order_id 精确锚定。 */
async function orderReservations(
  page: Page,
  productId: number,
  orderId: number,
  status: 'locked' | 'pending' | 'released'
): Promise<Row[]> {
  const res = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/reservations?product_id=${productId}&status=${status}&page=1&page_size=100`
  );
  const rows = pickListArray({ items: res.items }, 'items', `[650] 预留行 status=${status}`);
  return rows.filter(r => num(r.order_id, '预留行 order_id') === orderId);
}

async function createStockOrder(
  page: Page,
  tag: string,
  quantity: string,
  productId: number,
  colorNo: string,
  batchNo: string,
  dyeLotNo: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    remarks: `650锁缸${tag}`,
    items: [
      {
        product_id: productId,
        quantity,
        unit_price: '25.50',
        color_no: colorNo,
        batch_requirement: batchNo,
        dye_lot_requirement: dyeLotNo,
        fulfillment_source: 'stock',
      },
    ],
  });
  const orderId = num(created.id, '[650] 建单 id');
  ORDERS.push(orderId);
  CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `[650] 销售订单#${orderId}` });
  return orderId;
}

test.describe('650 订单锁缸/释放无孤立单据', () => {
  test('650-1 提交锁缸→审批不动→改量差量→取消全释放', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const tag = genCode('650');
    if (!ctx.customerId || !ctx.warehouseIds[0] || !ctx.productCategoryIds[0]) {
      throw new Error('[650] 前置缺失：客户/仓库/品类未就绪');
    }
    const product = await apiCallRaw<Row>(page, 'POST', '/products', {
      code: `${tag}-P`,
      name: `E2E650锁缸${tag}`,
      unit: '米',
      category_id: ctx.productCategoryIds[0],
      product_type: PRODUCT_TYPE.auxiliary,
    });
    const productId = num(product.id, '[650] 产品 id');
    CLEANUP.push({ path: `/products/${productId}`, label: `[650] 产品#${productId}` });
    const colorNo = `${tag}-C`;
    const dyeLotNo = `${tag}-LOT`;
    const batchNo = `${tag}-B`;
    await seedFourDimStockIn(page, {
      productId,
      warehouseId: ctx.warehouseIds[0],
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '100',
    });

    const orderId = await createStockOrder(page, tag, '30', productId, colorNo, batchNo, dyeLotNo);
    expect(
      (await orderReservations(page, productId, orderId, 'locked')).length +
        (await orderReservations(page, productId, orderId, 'pending')).length,
      '[650-1] draft 订单不得有任何 ACTIVE 预留行'
    ).toBe(0);

    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 70, 30, '[650-1] 提交锁缸后');
    const lockedRows = await orderReservations(page, productId, orderId, 'locked');
    expect(lockedRows.length, '[650-1] 提交后恰好一条 locked 预留行').toBe(1);
    expect(
      lockedRows.reduce((acc, r) => acc + num(r.quantity, 'locked 行数量'), 0),
      '[650-1] locked 预留数量'
    ).toBe(30);
    expect(String(lockedRows[0].status), '[650-1] 预留状态词值（写入方小写）').toBe('locked');

    // 审批仅走审批分支：库存三列与预留数量必须纹丝不动（listener 无审批锁缸分支）。
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/approve`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 70, 30, '[650-1] 审批后');
    const lockedAfterApprove = await orderReservations(page, productId, orderId, 'locked');
    expect(
      lockedAfterApprove.reduce((acc, r) => acc + num(r.quantity, '审批后 locked 数量'), 0),
      '[650-1] 审批不触发锁，预留数量不变'
    ).toBe(30);

    // 改量差量同步：release_all 后按新行量重锁，旧行 released、新 locked 行 45。
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
    expectStock(await stockRow(page, productId, colorNo, batchNo), 55, 45, '[650-1] 改量后净差量');
    const lockedAfterUpdate = await orderReservations(page, productId, orderId, 'locked');
    expect(lockedAfterUpdate.length, '[650-1] 改量后恰一条新 locked 行').toBe(1);
    expect(num(lockedAfterUpdate[0].quantity, '[650-1] 新 locked 行数量'), '[650-1] 改量后锁 45').toBe(45);
    const releasedRows = await orderReservations(page, productId, orderId, 'released');
    expect(releasedRows.length, '[650-1] 旧锁缸行必须落 released，不得孤立').toBeGreaterThanOrEqual(1);

    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/cancel`);
    expectStock(await stockRow(page, productId, colorNo, batchNo), 100, 0, '[650-1] 取消后回缸');
    expect(
      (await orderReservations(page, productId, orderId, 'locked')).length +
        (await orderReservations(page, productId, orderId, 'pending')).length,
      '[650-1] 取消后不得残留任何 ACTIVE 预留行（无孤立单据）'
    ).toBe(0);
    expect(
      (await orderReservations(page, productId, orderId, 'released')).length,
      '[650-1] 取消后历史行全部 released'
    ).toBeGreaterThanOrEqual(2);
  });
});
