/**
 * 功能：锁定库存流水 before/after 台账对同一四维键连续入库、出库后可逐行回放且终值等于库存详情。
 *
 * 六要素：
 * - 调用方：本 spec 自建白坯产品与专属批号，先走采购订单→收货→质检合格→确认入库，再建销售订单
 *   审批后按批号全额发货；不复用共享夹具的库存行与流水。
 * - 入参：采购订单 60 米、收货单同批号 60 米（色号空=白坯、免缸号与匹号），销售订单 25 米；
 *   批次号每轮唯一，流水按 product_id+warehouse_id+batch_no 精确定位。
 * - 传给谁：POST /products、/purchase/orders、/purchase/receipts、/purchase/inspections、
 *   /purchase/receipts/{id}/confirm、/sales/orders、/sales/orders/{id}/submit|approve|ship；
 *   GET /inventory/stock/transactions、/inventory/stock。
 * - 存什么：入库腿由 purchase_receipt_private.rs 写 PURCHASE_RECEIPT / before/after 米数，
 *   出库腿由 delivery_ops/ship.rs 写 SALES_DELIVERY / 同维度 before/after；
 *   流水出参键为 snake_case（models/inventory_transaction.rs），Decimal 为字符串。
 * - 断言什么：逐行 after == 同行 before + quantity_meters == 下一行 before；首行 before=0；
 *   入库腿 source_bill_no 回指收货单号，出库腿回指销售订单号；末行 after == 库存行 quantity_meters。
 * - 前置：ctx 的供应商/仓库/部门/品类就绪；六要素比较一律 BigInt 分位，禁 Number 相等。
 * - 不重复：既有用例只钉单次出库的数量回写，未钉跨入库→出库端到端流水首尾相接与终值闭环。
 */
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  seedInspectionPass,
  tryCleanup,
  apiCallRaw,
} from './helpers';
import { pickListArray } from './ui-helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;
const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

/** 两位小数定标：Decimal 出参转 BigInt 分位，标度外尾数非零直接抛错（静默截断即假绿）。 */
function toCents(v: unknown, label: string): bigint {
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

function idOf(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(
    Number.isFinite(n) && n > 0,
    `[648] ${label} 须返回正整数 id，实际 ${JSON.stringify(v)}`
  ).toBe(true);
  return n;
}

async function allTxns(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row[]> {
  const first = await apiCallRaw<{ items?: Row[]; total?: number }>(
    page,
    'GET',
    `/inventory/stock/transactions?product_id=${productId}&warehouse_id=${warehouseId}` +
      `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
  );
  const total = idOf(first.total, '流水 total');
  const rows = pickListArray({ items: first.items }, 'items', '[648] 流水首页');
  for (let pageNo = 2; rows.length < total; pageNo++) {
    const more = await apiCallRaw<{ items?: Row[] }>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}&warehouse_id=${warehouseId}` +
        `&batch_no=${encodeURIComponent(batchNo)}&page=${pageNo}&page_size=100`
    );
    rows.push(...pickListArray({ items: more.items }, 'items', `[648] 流水第 ${pageNo} 页`));
  }
  expect(rows.length, '[648] 逐页流水行数必须等于 total').toBe(total);
  return rows;
}

async function stockRow(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row> {
  const res = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
      `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
  );
  const rows = pickListArray({ items: res.items }, 'items', '[648] 库存行');
  const hit = rows.find(r => String(r.batch_no) === batchNo);
  expect(hit, `[648] 批号 ${batchNo} 的库存行未回读`).toBeTruthy();
  return hit as Row;
}

test.describe('648 库存流水 before/after 台账回放', () => {
  test('648-1 采购入库→销售出库逐行回放，终值回归库存详情', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const tag = genCode('648');
    const batchNo = `${tag}-B`;
    const today = new Date().toISOString().slice(0, 10);
    if (
      !ctx.supplierId ||
      !ctx.warehouseIds[0] ||
      !ctx.departmentIds[0] ||
      !ctx.productCategoryIds[0]
    ) {
      throw new Error('[648] 前置缺失：供应商/仓库/部门/品类未就绪');
    }

    const product = await apiCallRaw<Row>(page, 'POST', '/products', {
      code: `${tag}-P`,
      name: `E2E648流水回放${tag}`,
      unit: '米',
      category_id: ctx.productCategoryIds[0],
      product_type: PRODUCT_TYPE.auxiliary,
    });
    const productId = idOf(product.id, '产品');
    CLEANUP.push({ path: `/products/${productId}`, label: `[648] 产品#${productId}` });
    expect(
      (await apiCallRaw<Row>(page, 'GET', `/products/${productId}`)).unit,
      '[648] 产品单位'
    ).toBe('米');

    const po = await apiCallRaw<Row>(page, 'POST', '/purchase/orders', {
      supplier_id: ctx.supplierId,
      order_date: today,
      expected_delivery_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      currency: 'CNY',
      exchange_rate: '1',
      notes: `E2E-648-PO-${tag}`,
      items: [
        {
          line_no: 1,
          material_id: productId,
          quantity_ordered: '60',
          quantity_alt_ordered: '0',
          unit_price: '8.00',
          tax_rate: '0',
          quantity_tolerance_pct: '0',
          notes: `E2E-648-L1-${tag}`,
        },
      ],
    });
    const poId = idOf(po.id, '采购订单');
    CLEANUP.push({ path: `/purchase/orders/${poId}`, label: `[648] 采购订单#${poId}` });
    await apiCallRaw(page, 'POST', `/purchase/orders/${poId}/submit`);
    await apiCallRaw(page, 'POST', `/purchase/orders/${poId}/approve`);
    const poDetail = await apiCallRaw<Row>(page, 'GET', `/purchase/orders/${poId}`);
    expect(poDetail.status, '[648] 采购订单审批态').toBe('APPROVED');
    const poItems = pickListArray({ items: poDetail.items }, 'items', '[648] 采购订单明细');
    expect(poItems.length, '[648] 采购订单明细行数').toBe(1);
    const poLine = poItems[0];

    // 白坯收货：不送色号与缸号；材质编码取产品主数据回读值，批号本轮唯一。
    const receipt = await apiCallRaw<Row>(page, 'POST', '/purchase/receipts', {
      supplier_id: ctx.supplierId,
      order_id: poId,
      receipt_date: today,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      notes: `E2E-648-RECEIPT-${tag}`,
      items: [
        {
          line_no: 1,
          order_item_id: poLine.id,
          material_id: productId,
          material_code: product.code,
          material_name: product.name,
          batch_no: batchNo,
          grade: '一等品',
          quantity: '60',
          quantity_alt: '0',
          unit_master: '米',
          unit_price: '8.00',
        },
      ],
    });
    const receiptId = idOf(receipt.id, '收货单');
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `[648] 收货单#${receiptId}` });
    await seedInspectionPass(page, {
      receiptId,
      supplierId: ctx.supplierId,
      passQuantity: '60',
      context: `648-${tag}`,
    });
    await apiCallRaw(page, 'POST', `/purchase/receipts/${receiptId}/confirm`);
    const receiptNo = String(receipt.receipt_no ?? '');
    expect(receiptNo.length, '[648] 收货单须返回 receipt_no').toBeGreaterThan(0);

    const so = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      order_date: new Date().toISOString(),
      remarks: `E2E-648-SO-${tag}`,
      items: [
        {
          product_id: productId,
          quantity: '25',
          unit_price: '12.00',
          tax_percent: '0',
          quantity_tolerance_pct: '0',
          color_no: '',
        },
      ],
    });
    const orderId = idOf(so.id, '销售订单');
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `[648] 销售订单#${orderId}` });
    const orderNo = String(so.order_no ?? '');
    expect(orderNo.length, '[648] 销售订单须返回 order_no').toBeGreaterThan(0);
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/approve`);
    const warehouses = await apiCallRaw<{ items?: Row[] }>(
      page,
      'GET',
      '/warehouses?page=1&page_size=200'
    );
    const warehouseRows = pickListArray({ items: warehouses.items }, 'items', '[648] 仓库列表');
    const warehouse = warehouseRows.find(w => Number(w.id) === ctx.warehouseIds[0]);
    expect(warehouse?.code, '[648] 目标仓库须有 warehouse_code 回读').toBeTruthy();
    await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/ship`, {
      order_id: orderId,
      warehouse_code: String(warehouse?.code),
      items: [{ product_id: productId, quantity: '25', batch_no: batchNo }],
    });

    const txns = await allTxns(page, productId, ctx.warehouseIds[0], batchNo);
    expect(txns.length, '[648] 该四维键至少应有入库与出库两条流水').toBeGreaterThanOrEqual(2);
    const inbound = txns.find(t => String(t.transaction_type) === 'PURCHASE_RECEIPT');
    const outbound = txns.find(t => String(t.transaction_type) === 'SALES_DELIVERY');
    expect(inbound, '[648] 入库腿必须落流水').toBeTruthy();
    expect(outbound, '[648] 出库腿必须落流水').toBeTruthy();
    expect(String(inbound?.source_bill_type), '[648] 入库腿来源单据类型').toBe('PURCHASE_RECEIPT');
    expect(String(inbound?.source_bill_no), '[648] 入库腿来源单号').toBe(receiptNo);
    expect(String(outbound?.source_bill_no), '[648] 出库腿来源单号').toBe(orderNo);
    expect(String(outbound?.source_bill_type), '[648] 出库腿来源单据类型（写入方小写）').toBe(
      'sales_order'
    );

    let previousAfter = 0n;
    for (const [idx, txn] of txns.entries()) {
      const before = toCents(txn.quantity_before_meters, `流水[${idx}] before`);
      const after = toCents(txn.quantity_after_meters, `流水[${idx}] after`);
      const delta = toCents(txn.quantity_meters, `流水[${idx}] delta`);
      expect(before, `[648] 流水[${idx}] before 必须等于上一条 after`).toBe(previousAfter);
      expect(after - before, `[648] 流水[${idx}] 前后差必须等于本条 delta`).toBe(delta);
      previousAfter = after;
    }
    const stock = await stockRow(page, productId, ctx.warehouseIds[0], batchNo);
    expect(
      toCents(stock.quantity_meters, '[648] 库存行米数'),
      '[648] 末条流水 after == 库存详情'
    ).toBe(previousAfter);
    expect(previousAfter, '[648] 60 入库减 25 出库终值').toBe(3500n);
  });
});
