// 4.29 数据勾稽：入库单手动重算后，总金额/总数量/副单位数量与明细逐行求和守恒且重复调用零漂移。
// 后端判据：handlers/purchase_receipt_handler.rs:471-483 只回 null，金额须二次 GET 回读；
//   services/purchase_receipt_ops/items.rs:337-364 取明细 amount / quantity / quantity_alt 求和，
//   写回主表 total_amount / total_quantity / total_quantity_alt 并刷新 updated_at；
//   models/purchase_receipt_item.rs 金额列名是 amount（不是 total_amount）。
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

interface EntityRef {
  id: number;
  code: string;
  name: string;
  unit: string;
}

interface ReceiptHead {
  receipt_no?: unknown;
  supplier_id?: unknown;
  warehouse_id?: unknown;
  notes?: unknown;
  total_amount?: unknown;
  total_quantity?: unknown;
  total_quantity_alt?: unknown;
  updated_at?: unknown;
}

interface ReceiptItem {
  id?: unknown;
  line_no?: unknown;
  product_id?: unknown;
  material_code?: unknown;
  batch_no?: unknown;
  quantity?: unknown;
  quantity_alt?: unknown;
  unit_price?: unknown;
  amount?: unknown;
}

interface ItemInput {
  lineNo: number;
  quantity: string;
  quantityAlt: string;
  unitPrice: string;
  amount: string;
}

/** Decimal 字符串按固定刻度转整数最小单位，避免浮点相等比较。 */
function decimalUnits(value: unknown, scale: number, label: string): bigint {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    throw new Error(`${label} 必须是 Decimal 字符串，实际 ${JSON.stringify(value)}`);
  }
  const fractionRaw = match[3];
  const fraction = (fractionRaw === undefined ? '' : fractionRaw).padEnd(scale, '0');
  expect(/^0*$/.test(fraction.slice(scale)), `${label} 超出 ${scale} 位的小数部分须为零`).toBe(
    true
  );
  const fractionPart = fraction.slice(0, scale);
  const units =
    BigInt(match[2]) * 10n ** BigInt(scale) + (fractionPart.length > 0 ? BigInt(fractionPart) : 0n);
  return match[1] === '-' ? -units : units;
}

function timestampMs(value: unknown, label: string): number {
  const ms = Date.parse(String(value));
  expect(Number.isFinite(ms), `${label} 须为可解析时间戳，实际 ${String(value)}`).toBe(true);
  return ms;
}

async function readHead(page: Page, receiptId: number): Promise<ReceiptHead> {
  return await apiCallRaw<ReceiptHead>(page, 'GET', `/purchase/receipts/${receiptId}`);
}

async function readItems(page: Page, receiptId: number): Promise<ReceiptItem[]> {
  return await apiCallRaw<ReceiptItem[]>(page, 'GET', `/purchase/receipts/${receiptId}/items`);
}

async function ownSupplier(page: Page, tag: string): Promise<number> {
  const code = genCode(`E521S${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E521供方${code}`,
    supplier_short_name: `E521-${code.slice(-6)}`,
  });
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[521] 专属供应商须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  CLEANUP.push({ path: `/purchase/suppliers/${id}`, label: `supplier#${id}` });
  return id;
}

async function ownProduct(page: Page, tag: string): Promise<EntityRef> {
  const ctx = getCtx();
  const categoryId = Number(ctx.productCategoryIds[0]);
  expect(Number.isInteger(categoryId) && categoryId > 0, '[521] 夹具须有产品分类主键').toBe(true);
  const code = genCode(`E521P${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/products', {
    code,
    name: `E521面料${code}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[521] 专属产品须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  CLEANUP.push({ path: `/products/${id}`, label: `product#${id}` });
  const readback = await apiCallRaw<EntityRef>(page, 'GET', `/products/${id}`);
  expect(String(readback.code), '[521] 产品编码须逐字符回读').toBe(code);
  expect(String(readback.unit), '[521] 产品单位须逐字符回读').toBe('米');
  return { id, code, name: String(readback.name), unit: String(readback.unit) };
}

function expectItemInput(item: ReceiptItem, expected: ItemInput, product: EntityRef): void {
  const prefix = `[521] 明细行 ${expected.lineNo}`;
  const id = Number(item.id);
  expect(Number.isInteger(id) && id > 0, `${prefix} 须回真实主键`).toBe(true);
  expect(Number(item.line_no), `${prefix} line_no 回读`).toBe(expected.lineNo);
  expect(Number(item.product_id), `${prefix} product_id 回读`).toBe(product.id);
  expect(String(item.material_code), `${prefix} material_code 回读`).toBe(product.code);
  expect(decimalUnits(item.quantity, 4, `${prefix} quantity`)).toBe(
    decimalUnits(expected.quantity, 4, `${prefix} 期望 quantity`)
  );
  expect(decimalUnits(item.quantity_alt, 4, `${prefix} quantity_alt`)).toBe(
    decimalUnits(expected.quantityAlt, 4, `${prefix} 期望 quantity_alt`)
  );
  expect(decimalUnits(item.unit_price, 6, `${prefix} unit_price`)).toBe(
    decimalUnits(expected.unitPrice, 6, `${prefix} 期望 unit_price`)
  );
  expect(decimalUnits(item.amount, 2, `${prefix} amount`)).toBe(
    decimalUnits(expected.amount, 2, `${prefix} 期望 amount`)
  );
}

test.describe('4.29 入库单总金额手动重算守恒', () => {
  const expectedItems: ItemInput[] = [
    { lineNo: 1, quantity: '2', quantityAlt: '4', unitPrice: '40.00', amount: '80.00' },
    { lineNo: 2, quantity: '3', quantityAlt: '6', unitPrice: '40.00', amount: '120.00' },
  ];
  const expectedAmount = 20_000n;
  const expectedQuantity = 50_000n;
  const expectedQuantityAlt = 100_000n;

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('521-01 手动重算写回三列且重复调用零漂移', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    const warehouseId = Number(ctx.warehouseIds[0]);
    const departmentId = Number(ctx.departmentIds[0]);
    expect(Number.isInteger(warehouseId) && warehouseId > 0, '[521] 夹具须有仓库主键').toBe(true);
    expect(Number.isInteger(departmentId) && departmentId > 0, '[521] 夹具须有部门主键').toBe(true);

    const tag = genCode('E521');
    const supplierId = await ownSupplier(page, tag);
    const product = await ownProduct(page, tag);
    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/receipts', {
      supplier_id: supplierId,
      order_id: null,
      receipt_date: new Date().toISOString().slice(0, 10),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: tag,
      items: expectedItems.map(item => ({
        line_no: item.lineNo,
        material_id: product.id,
        material_code: product.code,
        material_name: product.name,
        batch_no: genCode(`E521B${item.lineNo}`),
        grade: '一等品',
        quantity: item.quantity,
        quantity_alt: item.quantityAlt,
        unit_master: product.unit,
        unit_price: item.unitPrice,
      })),
    });
    const receiptId = Number(created.id);
    expect(
      Number.isInteger(receiptId) && receiptId > 0,
      `[521] 入库单须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `receipt#${receiptId}` });

    const before = await readHead(page, receiptId);
    expect(String(before.receipt_no).startsWith('PR'), '[521] 入库单号须使用 PR 前缀').toBe(true);
    expect(Number(before.supplier_id), '[521] 单头 supplier_id 回读').toBe(supplierId);
    expect(Number(before.warehouse_id), '[521] 单头 warehouse_id 回读').toBe(warehouseId);
    expect(String(before.notes), '[521] 单头 notes 回读').toBe(tag);
    const beforeUpdatedAt = timestampMs(before.updated_at, '[521] 重算前 updated_at');

    const items = await readItems(page, receiptId);
    expect(items.length, '[521] 回读明细行数').toBe(expectedItems.length);
    for (const expected of expectedItems) {
      const hit = items.find(row => Number(row.line_no) === expected.lineNo);
      if (!hit) {
        throw new Error(`[521] 明细行 ${expected.lineNo} 未回读，实际 ${JSON.stringify(items)}`);
      }
      expect(hit.batch_no, `[521] 明细行 ${expected.lineNo} 须回读非空批次`).toBeTruthy();
      expectItemInput(hit, expected, product);
    }

    const recalcData = await apiCallRaw<null>(
      page,
      'POST',
      `/purchase/receipts/${receiptId}/recalculate`
    );
    expect(recalcData, '[521] 重算端点 data 须为 null，金额必须二次 GET 回读').toBeNull();

    const afterFirst = await readHead(page, receiptId);
    expect(decimalUnits(afterFirst.total_amount, 2, '[521] 重算后 total_amount')).toBe(
      expectedAmount
    );
    expect(decimalUnits(afterFirst.total_quantity, 4, '[521] 重算后 total_quantity')).toBe(
      expectedQuantity
    );
    expect(decimalUnits(afterFirst.total_quantity_alt, 4, '[521] 重算后 total_quantity_alt')).toBe(
      expectedQuantityAlt
    );
    expect(
      timestampMs(afterFirst.updated_at, '[521] 重算后 updated_at'),
      '[521] recalculate 必须刷新 updated_at'
    ).toBeGreaterThan(beforeUpdatedAt);

    const secondRecalcData = await apiCallRaw<null>(
      page,
      'POST',
      `/purchase/receipts/${receiptId}/recalculate`
    );
    expect(secondRecalcData, '[521] 第二次重算端点 data 须为 null').toBeNull();
    const afterSecond = await readHead(page, receiptId);
    expect(
      decimalUnits(afterSecond.total_amount, 2, '[521] 第二次重算后 total_amount'),
      '[521] 金额不得漂移'
    ).toBe(expectedAmount);
    expect(
      decimalUnits(afterSecond.total_quantity, 4, '[521] 第二次重算后 total_quantity'),
      '[521] 总数量不得漂移'
    ).toBe(expectedQuantity);
    expect(
      decimalUnits(afterSecond.total_quantity_alt, 4, '[521] 第二次重算后 total_quantity_alt'),
      '[521] 副单位数量不得漂移'
    ).toBe(expectedQuantityAlt);
  });
});
