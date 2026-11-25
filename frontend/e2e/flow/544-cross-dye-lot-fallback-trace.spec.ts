// 4.37 缸差管理：指定缸不足后的跨缸回退留痕。
// 当前后端在 services/inventory_deduction.rs plan_deduction 中确定性回退，
// services/so/delivery_ops/ship.rs build_delivery_item/build_record_transaction_args
// 把指定缸、实扣缸写进出库明细 remarks 与 SALES_DELIVERY 流水 notes。
// 本用例只钉这道已实现的留痕与库存守恒；「跨缸替代需审批」功能缺口另行登记在
// .monkeycode/docs/capability-gap-2026-11-03.md，不能用本用例代替审批门。
//
// 染色布强制四维含匹号：指定缸必须有自己的 AVAILABLE 匹（piece tuple 命中），
// 回退缸只需同产品/色号/批次的可扣库存行；发货 120 米时先扣指定缸 30 米，
// 再按确定性次序跨缸扣回退缸 90 米。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  seedFourDimStockIn,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

const REQUESTED_AVAILABLE = 30;
const FALLBACK_AVAILABLE = 120;
const SHIP_QTY = 120;

function dec(value: unknown, label: string): number {
  const text = String(value);
  expect(text, `${label} 应为十进制字符串或数字，实际=${text}`).toMatch(/^-?\d+(?:\.\d+)?$/);
  const parsed = Number(text);
  expect(Number.isFinite(parsed), `${label} 应为有限数`).toBe(true);
  return parsed;
}

function requiredText(row: Row, key: string, label: string): string {
  const value = row[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(`${label} 缺少必出键 ${key}，实际=${JSON.stringify(row).slice(0, 240)}`);
  }
  return String(value);
}

async function readStockRow(
  page: Page,
  productId: number,
  warehouseId: number,
  colorNo: string,
  dyeLotNo: string,
  batchNo: string
): Promise<Row> {
  const qs =
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&color_no=${encodeURIComponent(colorNo)}&dye_lot_no=${encodeURIComponent(dyeLotNo)}` +
    `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=20`;
  const hit = pickListArray<Row>(
    await apiCallRaw<unknown>(page, 'GET', qs),
    'items',
    `544 四维库存行 /inventory/stock 缸号 ${dyeLotNo}`
  ).find(
    row =>
      String(row.color_no) === colorNo &&
      String(row.dye_lot_no) === dyeLotNo &&
      String(row.batch_no) === batchNo
  );
  if (hit === undefined) {
    throw new Error(
      `544 前置不成立：按四维读不到库存行 product=${productId} warehouse=${warehouseId} color=${colorNo} dye=${dyeLotNo} batch=${batchNo}`
    );
  }
  return hit;
}

test.beforeEach(async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
});

test('544-01 指定缸不足时跨缸回退 两笔流水留痕与两缸库存守恒', async ({ page }) => {
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  if (productId === undefined || !ctx.customerId) {
    throw new Error('544-01 前置不成立：夹具产品/客户未就绪');
  }
  const warehouse = await pickDyeableWarehouse(page);
  const tag = genCode('544');
  const colorNo = `E2E-C544-${tag}`;

  // 指定缸：真实委外染色链造出 30 米库存与同缸同批 AVAILABLE 匹。
  const requested = await seedDyedOutboundBundle(page, {
    productId,
    warehouseId: warehouse.id,
    quantityMeters: String(REQUESTED_AVAILABLE),
    pieceCount: 1,
    colorNo,
    context: '544-REQ',
  });
  const requestedDyeLot = requested.dyeLotNo;
  const piece = requested.pieces[0];
  if (piece === undefined) {
    throw new Error(`544-01 前置不成立：指定缸 ${requestedDyeLot} 未产出可出库染色匹`);
  }

  // 回退缸：同产品、同色号、同批次，独立缸号且库存足额。
  const fallbackDyeLot = genCode('544F');
  expect(fallbackDyeLot, '回退缸号必须与指定缸号不同').not.toBe(requestedDyeLot);
  await seedFourDimStockIn(page, {
    productId,
    warehouseId: warehouse.id,
    colorNo,
    dyeLotNo: fallbackDyeLot,
    batchNo: requestedDyeLot,
    quantityMeters: String(FALLBACK_AVAILABLE),
  });

  const requestedBefore = await readStockRow(
    page,
    productId,
    warehouse.id,
    colorNo,
    requestedDyeLot,
    requestedDyeLot
  );
  const fallbackBefore = await readStockRow(
    page,
    productId,
    warehouse.id,
    colorNo,
    fallbackDyeLot,
    requestedDyeLot
  );
  const requestedAvailableBefore = dec(requestedBefore.quantity_available, '出库前指定缸可用量');
  const fallbackAvailableBefore = dec(fallbackBefore.quantity_available, '出库前回退缸可用量');
  expect(requestedAvailableBefore, '指定缸必须小于发货量，才能触发真实跨缸').toBeLessThan(SHIP_QTY);
  expect(fallbackAvailableBefore, '回退缸必须足以补足剩余量').toBeGreaterThanOrEqual(
    SHIP_QTY - requestedAvailableBefore
  );
  if (!piece.piece_no) {
    throw new Error(`544-01 前置不成立：指定缸 ${requestedDyeLot} 的匹号为空`);
  }

  const order = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: String(SHIP_QTY),
        unit_price: '37.50',
        tax_percent: '13',
        quantity_tolerance_pct: '0',
        dye_lot_requirement: requestedDyeLot,
      },
    ],
    notes: `E2E-544-ORDER-${tag}`,
  });
  const orderId = Number(order.id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error(`544-01 前置不成立：销售订单未返回主键，实际=${JSON.stringify(order)}`);
  }
  await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
  await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
  const orderDetail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(String(orderDetail.status), '发货前订单状态').toBe('approved');

  await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
    order_id: orderId,
    warehouse_code: warehouse.code,
    items: [
      {
        product_id: productId,
        quantity: String(SHIP_QTY),
        batch_no: requestedDyeLot,
        color_no: colorNo,
        dye_lot_no: requestedDyeLot,
        piece_no: String(piece.piece_no),
      },
    ],
    remarks: `E2E-544-SHIP-${tag}`,
  });

  const txns = pickListArray<Row>(
    await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}` +
        `&batch_no=${encodeURIComponent(requestedDyeLot)}` +
        `&transaction_type=SALES_DELIVERY&page=1&page_size=100`
    ),
    'items',
    '544 出库流水 /inventory/stock/transactions'
  ).filter(row => String(row.source_bill_no) === String(orderDetail.order_no));
  expect(txns.length, '本单应有一笔精确缸流水与一笔跨缸流水').toBe(2);
  const exactTxn = txns.find(row => String(row.dye_lot_no) === requestedDyeLot);
  const crossTxn = txns.find(row => String(row.dye_lot_no) === fallbackDyeLot);
  if (exactTxn === undefined || crossTxn === undefined) {
    throw new Error(
      `544-01 流水缸号不符：期望 ${requestedDyeLot}/${fallbackDyeLot}，` +
        `实际=${JSON.stringify(txns.map(row => row.dye_lot_no))}`
    );
  }
  expect(String(exactTxn.transaction_type), '精确缸流水类型').toBe('SALES_DELIVERY');
  expect(String(crossTxn.transaction_type), '跨缸流水类型').toBe('SALES_DELIVERY');
  expect(dec(exactTxn.quantity_meters, '精确缸流水扣减米数'), '先扣满指定缸可用量').toBeCloseTo(
    -requestedAvailableBefore,
    2
  );
  expect(dec(crossTxn.quantity_meters, '跨缸流水扣减米数'), '跨缸承担剩余发货量').toBeCloseTo(
    -(SHIP_QTY - requestedAvailableBefore),
    2
  );
  // 流水出参键以 TransactionResponse DTO 为准：notes 字段序列化为 remarks
  const exactNote = requiredText(exactTxn, 'remarks', '精确缸流水');
  expect(exactNote, '精确缸流水不应标记跨缸回退').not.toContain('跨缸回退');
  const crossNote = requiredText(crossTxn, 'remarks', '跨缸流水');
  expect(crossNote, '流水备注应写明跨缸回退').toContain('跨缸回退');
  expect(crossNote, `流水备注应含指定缸 ${requestedDyeLot}`).toContain(requestedDyeLot);
  expect(crossNote, `流水备注应含实扣缸 ${fallbackDyeLot}`).toContain(fallbackDyeLot);
  expect(crossNote, '流水备注应写明数量不足').toContain('数量不足');

  const requestedAfter = await readStockRow(
    page,
    productId,
    warehouse.id,
    colorNo,
    requestedDyeLot,
    requestedDyeLot
  );
  const fallbackAfter = await readStockRow(
    page,
    productId,
    warehouse.id,
    colorNo,
    fallbackDyeLot,
    requestedDyeLot
  );
  expect(Number(requestedAfter.id), '指定缸回读必须是同一库存行').toBe(Number(requestedBefore.id));
  expect(Number(fallbackAfter.id), '回退缸回读必须是同一库存行').toBe(Number(fallbackBefore.id));
  const requestedAvailableAfter = dec(requestedAfter.quantity_available, '出库后指定缸可用量');
  const fallbackAvailableAfter = dec(fallbackAfter.quantity_available, '出库后回退缸可用量');
  expect(requestedAvailableBefore - requestedAvailableAfter, '指定缸应被扣至 0').toBeCloseTo(
    requestedAvailableBefore,
    2
  );
  expect(requestedAvailableAfter, '指定缸可用量不得为负').toBe(0);
  expect(
    fallbackAvailableBefore - fallbackAvailableAfter,
    '回退缸扣减必须等于剩余发货量'
  ).toBeCloseTo(SHIP_QTY - requestedAvailableBefore, 2);
  expect(fallbackAvailableAfter >= 0, '回退缸可用量不得为负').toBe(true);
});
