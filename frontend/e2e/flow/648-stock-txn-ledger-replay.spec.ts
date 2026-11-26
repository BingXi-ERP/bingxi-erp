/**
 * 功能：锁定「同一四维键先采购入库、后销售出库」的库存流水逐行回放台账。
 *
 * 六要素：
 * - 调用方：本 spec 自建唯一批次的采购订单/入库单，确认入库后建销售订单并一次出库同批；
 *   不依赖共享库存行的既有数量。
 * - 入参：唯一 batch_no（白坯腿留空 color_no/dye_lot_no 免缸号/匹号门）、采购与销售数量均为 40。
 * - 传给谁：POST /purchase/orders、POST /purchase/orders/{id}/submit、POST /purchase/orders/{id}/approve、
 *   POST /purchase/receipts、POST /purchase/receipts/{id}/confirm、GET /inventory/stock、
 *   POST /sales/orders、POST /sales/orders/{id}/submit、POST /sales/orders/{id}/approve、
 *   POST /sales/orders/{id}/ship、GET /inventory/stock/transactions。
 * - 存什么：按 created_at 升序回放流水，首行 before=0、逐行 next.before==prev.after、
 *   末行 after==可用库存；入库腿 source_bill_type/no 回指入库单，出库腿回指销售订单。
 * - 存哪里：purchase_orders/purchase_receipts/inventory_transactions/sales_orders 各一行；
 *   收尾尽力撤采购单；销售订单与流水由唯一批次天然隔离，不清库以免破坏回放证据。
 *
 * 源码判据：services/purchase_receipt_private.rs 入库腿写
 *   transaction_type=PURCHASE_RECEIPT、source_bill_type=PURCHASE_RECEIPT、source_bill_no=入库单号；
 *   services/so/delivery_ops/ship.rs 出库腿写 transaction_type=SALES_DELIVERY、
 *   source_bill_type=sales_order、source_bill_no=订单号（写入方原词，不按报告口径改写）；
 *   services/inventory_stock_query.rs 交易查询固定 created_at ASC。
 */
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  seedInspectionPass,
  tryCleanup,
} from './helpers';

interface TxnRow {
  transaction_type: string;
  quantity_meters: number | string;
  quantity_before_meters: number | string;
  quantity_after_meters: number | string;
  source_bill_type: string | null;
  source_bill_no: string | null;
}

interface StockRow {
  quantity_available: number | string;
  batch_no?: string;
}

interface WarehouseRow {
  id?: number;
  warehouse_code?: string;
}

interface ProductRow {
  code?: string;
  name?: string;
}

function toScaled(v: unknown, label: string): bigint {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if (!m) throw new Error(`[648] ${label} Decimal 出参形态非法：${JSON.stringify(v)}`);
  const [, sign, int, frac = ''] = m;
  if (frac.length > 2 && frac.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`[648] ${label} 标度超过 2 位且尾数非零：${raw}`);
  }
  const cents = BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
  return sign === '-' ? -cents : cents;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe.serial('648 库存流水 before/after 逐行回放台账', () => {
  test('648-1 入库→出库流水回放守恒且来源单据可回指', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.supplierId || !ctx.warehouseIds[0] || !ctx.departmentIds[0] || !ctx.productIds[0]) {
      throw new Error('[648] 前置缺失：供应商/仓库/部门/产品未就绪');
    }
    if (!ctx.customerId) throw new Error('[648] 前置缺失：客户未就绪');

    const batchNo = genCode('B648');
    const product = ctx.productIds[0];
    const productDetail = await apiCallRaw<ProductRow>(page, 'GET', `/products/${product}`);
    const materialCode = String(productDetail.code ?? '');
    const materialName = String(productDetail.name ?? '');
    expect(materialCode, '[648-1] 产品详情必须回读 code').not.toBe('');
    expect(materialName, '[648-1] 产品详情必须回读 name').not.toBe('');
    const warehouse = ctx.warehouseIds[0];
    const warehouseDetail = await apiCallRaw<WarehouseRow>(page, 'GET', `/warehouses/${warehouse}`);
    const warehouseCode = String(warehouseDetail?.warehouse_code ?? '');
    expect(warehouseCode, '[648-1] 仓库详情必须回读 warehouse_code').not.toBe('');

    const po = await apiCallRaw<{ id?: number }>(page, 'POST', '/purchase/orders', {
      supplier_id: ctx.supplierId,
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      warehouse_id: warehouse,
      department_id: ctx.departmentIds[0],
      notes: `E2E-648-${batchNo}`,
      items: [
        {
          line_no: 1,
          material_id: product,
          quantity_ordered: '40',
          quantity_alt_ordered: '0',
          unit_price: '10.00',
          tax_rate: '0',
        },
      ],
    });
    const poId = Number(po?.id);
    expect(poId, '[648-1] 采购订单必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/purchase/orders/${poId}`, label: '[648-1] 采购订单' });
    await apiCall(page, 'POST', `/purchase/orders/${poId}/submit`);
    await apiCall(page, 'POST', `/purchase/orders/${poId}/approve`);

    const receipt = await apiCallRaw<{ id?: number; receipt_no?: string }>(
      page,
      'POST',
      '/purchase/receipts',
      {
        order_id: poId,
        supplier_id: ctx.supplierId,
        warehouse_id: warehouse,
        receipt_date: new Date().toISOString().slice(0, 10),
        items: [
          {
            line_no: 1,
            material_id: product,
            material_code: materialCode,
            material_name: materialName,
            unit_master: 'm',
            quantity: 40,
            quantity_alt: 0,
            batch_no: batchNo,
          },
        ],
      }
    );
    const receiptId = Number(receipt?.id);
    const receiptNo = String(receipt?.receipt_no ?? '');
    expect(receiptId, '[648-1] 入库单必须返回正整数主键').toBeGreaterThan(0);
    expect(receiptNo, '[648-1] 入库单必须回读单号').not.toBe('');
    await seedInspectionPass(page, {
      receiptId,
      supplierId: ctx.supplierId,
      passQuantity: '40',
      context: `648-${batchNo}`,
    });
    await apiCall(page, 'POST', `/purchase/receipts/${receiptId}/confirm`);

    const stockBefore = await apiCallRaw<{ items?: StockRow[]; total?: number }>(
      page,
      'GET',
      `/inventory/stock?product_id=${product}&warehouse_id=${warehouse}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
    );
    expect(stockBefore.total, '[648-1] 入库后唯一批次库存应恰有 1 行').toBe(1);
    expect(
      toScaled(stockBefore.items?.[0]?.quantity_available, '[648-1] 入库后可用量'),
      '[648-1] 入库后可用量应为 40'
    ).toBe(4000n);

    const order = await apiCallRaw<{ id?: number; order_no?: string }>(
      page,
      'POST',
      '/sales/orders',
      {
        customer_id: ctx.customerId,
        order_date: new Date().toISOString(),
        items: [
          {
            product_id: product,
            quantity: '40',
            unit_price: '12.00',
            tax_percent: '0',
            quantity_tolerance_pct: '0',
          },
        ],
        notes: `E2E-648-${batchNo}`,
      }
    );
    const orderId = Number(order?.id);
    const orderNo = String(order?.order_no ?? '');
    expect(orderId, '[648-1] 销售订单必须返回正整数主键').toBeGreaterThan(0);
    expect(orderNo, '[648-1] 销售订单必须回读单号').not.toBe('');
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: '[648-1] 销售订单' });
    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
    await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
      order_id: orderId,
      warehouse_code: warehouseCode,
      items: [
        {
          product_id: product,
          quantity: '40',
          batch_no: batchNo,
        },
      ],
    });

    const txns = await apiCallRaw<{ items?: TxnRow[]; total?: number }>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${product}&warehouse_id=${warehouse}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
    );
    expect(txns.total, '[648-1] 唯一批次流水应恰有入库+出库两行').toBe(2);
    const rows = txns.items ?? [];
    expect(rows[0].transaction_type, '[648-1] 首行应为入库流水').toBe('PURCHASE_RECEIPT');
    expect(rows[1].transaction_type, '[648-1] 末行应为出库流水').toBe('SALES_DELIVERY');
    expect(rows[0].source_bill_type, '[648-1] 入库腿来源类型必须回指入库单').toBe(
      'PURCHASE_RECEIPT'
    );
    expect(rows[0].source_bill_no, '[648-1] 入库腿来源单号必须回指入库单号').toBe(receiptNo);
    expect(rows[1].source_bill_type, '[648-1] 出库腿来源类型必须为写入方 sales_order').toBe(
      'sales_order'
    );
    expect(rows[1].source_bill_no, '[648-1] 出库腿来源单号必须回指销售订单号').toBe(orderNo);

    expect(
      toScaled(rows[0].quantity_before_meters, '[648-1] 首行扣前量'),
      '[648-1] 期初必须为 0'
    ).toBe(0n);
    expect(
      toScaled(rows[1].quantity_before_meters, '[648-1] 出库扣前量') -
        toScaled(rows[0].quantity_after_meters, '[648-1] 入库扣后量'),
      '[648-1] next.before-prev.after 差额必须为 0'
    ).toBe(0n);
    expect(
      toScaled(rows[1].quantity_before_meters, '[648-1] 出库扣前量') -
        toScaled(rows[1].quantity_after_meters, '[648-1] 出库扣后量') -
        4000n,
      '[648-1] 出库扣差必须为 40 米'
    ).toBe(0n);

    const stockAfter = await apiCallRaw<{ items?: StockRow[]; total?: number }>(
      page,
      'GET',
      `/inventory/stock?product_id=${product}&warehouse_id=${warehouse}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
    );
    if (Number(stockAfter.total) === 0) {
      expect(
        toScaled(rows[1].quantity_after_meters, '[648-1] 出库扣后量'),
        '[648-1] 无现存行时出库扣后必须为 0'
      ).toBe(0n);
    } else {
      expect(Number(stockAfter.total), '[648-1] 出库后唯一批次库存应至多 1 行').toBe(1);
      expect(
        toScaled(stockAfter.items?.[0]?.quantity_available, '[648-1] 出库后可用量') -
          toScaled(rows[1].quantity_after_meters, '[648-1] 出库扣后量'),
        '[648-1] 末行 after 与可用库存差额必须为 0'
      ).toBe(0n);
    }
  });
});
