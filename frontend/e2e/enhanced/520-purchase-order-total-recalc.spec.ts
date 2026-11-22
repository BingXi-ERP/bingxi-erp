// 520 采购订单总额手动重算：回读明细逐行求和守恒，重复调用零漂移。
// 后端判据：routes/purchase.rs:68-71 挂 POST /orders/{id}/calculate-total；
// handlers/purchase_order_handler.rs:741-755 先做行级归属门，再落库重算，
// 响应 data 仅 {"order_id":id}，金额必须二次 GET 回读；
// services/po/receipt.rs:334-375 把明细 total_amount/quantity/quantity_alt
// 三项求和写回主表并刷新 updated_at；models/purchase_order_item.rs 的
// 主数量键是 quantity、副单位键是 quantity_alt、行金额键是 total_amount。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

interface OrderRow {
  id?: number;
  order_no?: string;
  total_amount?: unknown;
  total_quantity?: unknown;
  total_quantity_alt?: unknown;
  updated_at?: unknown;
  items?: ItemRow[];
}

interface ItemRow {
  id?: number;
  line_no?: number;
  product_id?: number;
  quantity?: unknown;
  quantity_alt?: unknown;
  unit_price?: unknown;
  total_amount?: unknown;
}

function decimalUnits(value: unknown, scale: number, label: string): bigint {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  expect(
    match !== null,
    `[520] ${label} 须为 Decimal 字符串或数字，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const groups = match as RegExpExecArray;
  const fractionRaw = groups[3] ?? '';
  const fraction = fractionRaw.padEnd(scale, '0');
  expect(
    /^0*$/.test(fraction.slice(scale)),
    `[520] ${label} 超出 ${scale} 位的小数部分须为零，实际 ${raw}`
  ).toBe(true);
  const unitPart = BigInt(groups[2]) * 10n ** BigInt(scale);
  const fractionPart = fraction.length > 0 ? BigInt(fraction.slice(0, scale)) : 0n;
  const units = unitPart + fractionPart;
  return groups[1] === '-' ? -units : units;
}

function timestampMs(value: unknown, label: string): number {
  const ms = Date.parse(String(value));
  expect(Number.isFinite(ms), `[520] ${label} 须可解析，实际 ${String(value)}`).toBe(true);
  return ms;
}

function requireId(value: unknown, label: string): number {
  const id = Number(value);
  expect(
    Number.isInteger(id) && id > 0,
    `[520] ${label} 须正整数，实际 ${JSON.stringify(value)}`
  ).toBe(true);
  return id;
}

async function readOrder(page: Page, orderId: number): Promise<OrderRow> {
  const row = await apiCallRaw<OrderRow>(page, 'GET', `/purchase/orders/${orderId}`);
  requireId(row.id, '订单详情 id');
  return row;
}

function itemByLine(items: ItemRow[] | undefined, lineNo: number, label: string): ItemRow {
  expect(Array.isArray(items), `[520] ${label} items 须数组`).toBe(true);
  const rows = (items as ItemRow[]).filter(item => Number(item.line_no) === lineNo);
  expect(rows.length, `[520] ${label} line_no=${lineNo} 须恰好一行`).toBe(1);
  return rows[0];
}

test.describe('4.29 采购订单总额手动重算守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('520-01 重算写回三列且重复调用零漂移', async ({ page }) => {
    const ctx = getCtx();
    const supplierId = Number(ctx.supplierId);
    const warehouseId = Number(ctx.warehouseIds[0]);
    const departmentId = Number(ctx.departmentIds[0]);
    const productId = Number(ctx.productIds[0]);
    for (const [label, value] of [
      ['supplierId', supplierId],
      ['warehouseId', warehouseId],
      ['departmentId', departmentId],
      ['productId', productId],
    ] as const) {
      expect(
        Number.isInteger(value) && value > 0,
        `[520] 夹具 ${label} 须正整数，实际 ${value}`
      ).toBe(true);
    }

    const tag = genCode('E520');
    const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      supplier_id: supplierId,
      order_date: new Date().toISOString().slice(0, 10),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: `E520 重算 ${tag}`,
      items: [
        {
          line_no: 1,
          material_id: productId,
          quantity_ordered: '2',
          quantity_alt_ordered: '4',
          unit_price: '100.00',
          tax_rate: '0',
        },
        {
          line_no: 2,
          material_id: productId,
          quantity_ordered: '3',
          quantity_alt_ordered: '6',
          unit_price: '50.00',
          tax_rate: '0',
        },
      ],
    });
    const orderId = requireId(created.data?.id, '建单返回 id');

    try {
      const before = await readOrder(page, orderId);
      expect(String(before.order_no).startsWith('PO'), '[520] 采购单号须 PO 前缀').toBe(true);
      const first = itemByLine(before.items, 1, '重算前');
      const second = itemByLine(before.items, 2, '重算前');
      expect(Number(first.product_id), '[520] 行 1 物料 id').toBe(productId);
      expect(Number(second.product_id), '[520] 行 2 物料 id').toBe(productId);
      expect(decimalUnits(first.quantity, 4, '[520] 行 1 quantity')).toBe(20_000n);
      expect(decimalUnits(first.quantity_alt, 4, '[520] 行 1 quantity_alt')).toBe(40_000n);
      expect(decimalUnits(first.total_amount, 2, '[520] 行 1 total_amount')).toBe(20_000n);
      expect(decimalUnits(second.quantity, 4, '[520] 行 2 quantity')).toBe(30_000n);
      expect(decimalUnits(second.quantity_alt, 4, '[520] 行 2 quantity_alt')).toBe(60_000n);
      expect(decimalUnits(second.total_amount, 2, '[520] 行 2 total_amount')).toBe(15_000n);
      const beforeUpdatedAt = timestampMs(before.updated_at, '[520] 重算前 updated_at');

      const recalc = await apiCall<{ order_id?: number }>(
        page,
        'POST',
        `/purchase/orders/${orderId}/calculate-total`
      );
      expect(recalc.code, '[520] 重算须成功').toBe(200);
      expect(requireId(recalc.data?.order_id, '重算响应 order_id'), '[520] 响应主键').toBe(orderId);
      expect(recalc.message, '[520] 重算消息').toBe('订单总额计算完成');

      const afterFirst = await readOrder(page, orderId);
      expect(decimalUnits(afterFirst.total_amount, 2, '[520] 重算后 total_amount')).toBe(35_000n);
      expect(decimalUnits(afterFirst.total_quantity, 4, '[520] 重算后 total_quantity')).toBe(
        50_000n
      );
      expect(
        decimalUnits(afterFirst.total_quantity_alt, 4, '[520] 重算后 total_quantity_alt')
      ).toBe(100_000n);
      expect(
        timestampMs(afterFirst.updated_at, '[520] 重算后 updated_at'),
        '[520] 重算须刷新 updated_at'
      ).toBeGreaterThanOrEqual(beforeUpdatedAt);

      const secondRecalc = await apiCall<{ order_id?: number }>(
        page,
        'POST',
        `/purchase/orders/${orderId}/calculate-total`
      );
      expect(secondRecalc.code, '[520] 第二次重算须成功').toBe(200);
      expect(
        requireId(secondRecalc.data?.order_id, '第二次重算响应 order_id'),
        '[520] 第二次响应主键'
      ).toBe(orderId);

      const afterSecond = await readOrder(page, orderId);
      expect(
        decimalUnits(afterSecond.total_amount, 2, '[520] 第二次重算后 total_amount'),
        '[520] 金额不得漂移'
      ).toBe(35_000n);
      expect(
        decimalUnits(afterSecond.total_quantity, 4, '[520] 第二次重算后 total_quantity'),
        '[520] 总数量不得漂移'
      ).toBe(50_000n);
      expect(
        decimalUnits(afterSecond.total_quantity_alt, 4, '[520] 第二次重算后 total_quantity_alt'),
        '[520] 副单位数量不得漂移'
      ).toBe(100_000n);
    } finally {
      await tryCleanup(page, 'DELETE', `/purchase/orders/${orderId}`, `[520] 订单 ${orderId}`);
    }
  });
});
