// 4.16 数值精度 + 4.29 数据勾稽 + 4.41 联动守恒：采购入库明细改量改价后，行金额与单头合计同源重算。
// 后端判据：services/purchase_receipt_ops/items.rs:104-126 必填列显式 null 前置拒绝；
//   :170-174 三态生效值（键缺席保持、显式 null 清空、有值覆盖）；
//   :249 行金额 = 生效数量 × 生效单价（空单价按 0）；
//   :265 / :330-364 明细写与单头合计在同一事务内重算，数量、辅助数量、金额逐行求和。
// 与既有覆盖分工：461 只读收货单 total_amount→AP，437 测建单双单位，全 e2e 无 PUT 明细守恒断言。
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface ReceiptHead {
  receipt_status?: unknown;
  total_quantity?: unknown;
  total_amount?: unknown;
}

interface ReceiptItem {
  id?: unknown;
  line_no?: unknown;
  quantity?: unknown;
  quantity_alt?: unknown;
  unit_price?: unknown;
  amount?: unknown;
}

interface EntityRef {
  id: number;
  code: string;
  name: string;
  unit: string;
}

function num(value: unknown, label: string): number {
  const n = Number(value);
  expect(Number.isFinite(n), `${label} 必须是可比对数值，实际 ${String(value)}`).toBe(true);
  return n;
}

async function ownSupplier(page: Page, tag: string): Promise<number> {
  const code = genCode(`E494S${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E494供方${code}`,
    supplier_short_name: `E494-${code.slice(-6)}`,
  });
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[494] 专属供应商须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  CLEANUP.push({ path: `/purchase/suppliers/${id}`, label: `supplier#${id}` });
  return id;
}

async function ownProduct(page: Page, tag: string): Promise<EntityRef> {
  const ctx = getCtx();
  const categoryId = Number(ctx.productCategoryIds[0]);
  expect(Number.isInteger(categoryId) && categoryId > 0, '[494] 夹具须有产品分类主键').toBe(true);
  const code = genCode(`E494P${tag}`);
  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/products', {
    code,
    name: `E494面料${code}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `[494] 专属产品须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  CLEANUP.push({ path: `/products/${id}`, label: `product#${id}` });
  const readback = await apiCallRaw<EntityRef>(page, 'GET', `/products/${id}`);
  expect(String(readback.code), '[494] 产品编码须逐字符回读').toBe(code);
  expect(String(readback.unit), '[494] 产品单位须逐字符回读').toBe('米');
  return { id, code, name: String(readback.name), unit: String(readback.unit) };
}

async function readHead(page: Page, receiptId: number): Promise<ReceiptHead> {
  return await apiCallRaw<ReceiptHead>(page, 'GET', `/purchase/receipts/${receiptId}`);
}

async function readItem(page: Page, receiptId: number, itemId: number): Promise<ReceiptItem> {
  const rows = await apiCallRaw<ReceiptItem[]>(
    page,
    'GET',
    `/purchase/receipts/${receiptId}/items`
  );
  const hit = rows.find(r => Number(r.id) === itemId);
  expect(hit, `[494] 明细 ${itemId} 必须在裸数组回读中`).toBeTruthy();
  return hit as ReceiptItem;
}

async function expectConserved(
  page: Page,
  receiptId: number,
  itemId: number,
  expected: { quantity: number; amount: number; unitPrice: number | null }
): Promise<void> {
  const item = await readItem(page, receiptId, itemId);
  const head = await readHead(page, receiptId);
  expect(num(item.quantity, '[494] 行数量'), '[494] 行数量与期望不符').toBe(expected.quantity);
  if (expected.unitPrice === null) {
    expect(item.unit_price, '[494] 空单价必须回读 null').toBeNull();
  } else {
    expect(num(item.unit_price, '[494] 行单价'), '[494] 行单价与期望不符').toBe(expected.unitPrice);
  }
  expect(num(item.amount, '[494] 行金额'), '[494] 行金额须等于数量乘生效单价').toBe(
    expected.amount
  );
  expect(num(head.total_quantity, '[494] 单头总数量'), '[494] 单头总数量须随行同步').toBe(
    expected.quantity
  );
  expect(num(head.total_amount, '[494] 单头总金额'), '[494] 单头总金额须随行金额同步').toBe(
    expected.amount
  );
}

test.describe('4.16 采购入库明细金额守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('494-01 改量改价、空值与增删行均保持行金额和单头合计守恒', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    const warehouseId = Number(ctx.warehouseIds[0]);
    const departmentId = Number(ctx.departmentIds[0]);
    expect(Number.isInteger(warehouseId) && warehouseId > 0, '[494] 夹具须有仓库主键').toBe(true);
    expect(Number.isInteger(departmentId) && departmentId > 0, '[494] 夹具须有部门主键').toBe(true);

    const tag = genCode('E494');
    const supplierId = await ownSupplier(page, tag);
    const product = await ownProduct(page, tag);
    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/purchase/receipts', {
      supplier_id: supplierId,
      order_id: null,
      receipt_date: new Date().toISOString().slice(0, 10),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: tag,
      items: [
        {
          line_no: 1,
          material_id: product.id,
          material_code: product.code,
          material_name: product.name,
          batch_no: genCode('E494B1'),
          grade: '一等品',
          quantity: '2',
          quantity_alt: '0',
          unit_master: product.unit,
          unit_price: '10.00',
        },
      ],
    });
    const receiptId = Number(created.id);
    expect(
      Number.isInteger(receiptId) && receiptId > 0,
      `[494] 入库单须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `receipt#${receiptId}` });
    expect(
      String((await readHead(page, receiptId)).receipt_status),
      '[494] 未确认入库单须 DRAFT'
    ).toBe('DRAFT');

    const rows = await apiCallRaw<ReceiptItem[]>(
      page,
      'GET',
      `/purchase/receipts/${receiptId}/items`
    );
    expect(rows.length, '[494] 建单须恰一行明细').toBe(1);
    const itemId = Number(rows[0].id);
    expect(Number.isInteger(itemId) && itemId > 0, '[494] 明细须回真实主键').toBe(true);
    await expectConserved(page, receiptId, itemId, { quantity: 2, amount: 20, unitPrice: 10 });

    await apiCall(page, 'PUT', `/purchase/receipts/${receiptId}/items/${itemId}`, {
      quantity: '3',
      unit_price: '7',
    });
    await expectConserved(page, receiptId, itemId, { quantity: 3, amount: 21, unitPrice: 7 });

    const bad = await apiCallExpectFail(
      page,
      'PUT',
      `/purchase/receipts/${receiptId}/items/${itemId}`,
      {
        quantity: null,
      }
    );
    expect(bad.status, '[494] 显式清空必填数量须 400').toBe(400);
    expect(failureCode(bad), '[494] 清空数量机器码须 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(bad.message, '[494] 拒因须点名数量必填').toContain('入库数量不能清空：该字段为必填项');
    await expectConserved(page, receiptId, itemId, { quantity: 3, amount: 21, unitPrice: 7 });

    await apiCall(page, 'PUT', `/purchase/receipts/${receiptId}/items/${itemId}`, {
      unit_price: null,
    });
    await expectConserved(page, receiptId, itemId, { quantity: 3, amount: 0, unitPrice: null });

    await apiCall(page, 'PUT', `/purchase/receipts/${receiptId}/items/${itemId}`, {});
    await expectConserved(page, receiptId, itemId, { quantity: 3, amount: 0, unitPrice: null });

    await apiCall(page, 'POST', `/purchase/receipts/${receiptId}/items`, {
      line_no: 2,
      material_id: product.id,
      material_code: product.code,
      material_name: product.name,
      batch_no: genCode('E494B2'),
      grade: '一等品',
      quantity: '1',
      quantity_alt: '0',
      unit_master: product.unit,
      unit_price: '4',
    });
    const twoRows = await apiCallRaw<ReceiptItem[]>(
      page,
      'GET',
      `/purchase/receipts/${receiptId}/items`
    );
    expect(twoRows.length, '[494] 追加后须两行明细').toBe(2);
    const second = twoRows.find(r => Number(r.line_no) === 2);
    expect(second, '[494] 第二行须按 line_no 回读').toBeTruthy();
    const secondId = Number((second as ReceiptItem).id);
    expect(Number.isInteger(secondId) && secondId > 0, '[494] 第二行须回真实主键').toBe(true);
    expect(num((second as ReceiptItem).amount, '[494] 第二行金额'), '[494] 第二行金额须 4').toBe(4);
    const withSecond = await readHead(page, receiptId);
    expect(num(withSecond.total_quantity, '[494] 追加后总数量'), '[494] 追加后总数量须 4').toBe(4);
    expect(num(withSecond.total_amount, '[494] 追加后总金额'), '[494] 追加后总金额须 4').toBe(4);

    await apiCall(page, 'DELETE', `/purchase/receipts/${receiptId}/items/${secondId}`);
    const afterDelete = await readHead(page, receiptId);
    expect(
      num(afterDelete.total_quantity, '[494] 删除后总数量'),
      '[494] 删除后总数量须回到 3'
    ).toBe(3);
    expect(num(afterDelete.total_amount, '[494] 删除后总金额'), '[494] 删除后总金额须回到 0').toBe(
      0
    );
    await expectConserved(page, receiptId, itemId, { quantity: 3, amount: 0, unitPrice: null });
  });
});
