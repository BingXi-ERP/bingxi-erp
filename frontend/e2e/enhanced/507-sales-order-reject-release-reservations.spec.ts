// 拒绝待审销售订单时释放 pending/locked 预留：订单状态与理由、预留 cancelled/released_at、
// 库存可用量按预留量精确回加，以及非 pending 二次拒绝不重复回加。
// 判据来源：services/so/contract.rs reject_order（仅 pending 放行、reason trim 后落库）；
// services/so/delivery_ops/inventory.rs release_reservations（pending/locked→cancelled 并回加 available）；
// models/status/sales.rs 与 models/status/purchase_inventory.rs 的状态词逐字符取值。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

type Row = Record<string, unknown>;

interface CleanupEntry {
  path: string;
  label: string;
  order: number;
}

interface StockSlot {
  productId: number;
  warehouseId: number;
}

const CLEANUP: CleanupEntry[] = [];

test.afterEach(async ({ page }) => {
  const entries = CLEANUP.slice().sort((a, b) => a.order - b.order);
  for (const entry of entries) {
    await tryCleanup(page, 'DELETE', entry.path, entry.label);
  }
  CLEANUP.length = 0;
});

test.beforeEach(async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
});

function requireId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}: 期望正整数 id，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label}: 期望非空字符串，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/** DECIMAL 出参为字符串，转整数分比较，禁止浮点等号。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string') {
    throw new Error(`${label}: DECIMAL 出参必须是字符串，实际类型 ${typeof value}`);
  }
  const parts = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!parts) {
    throw new Error(`${label}: DECIMAL 字符串形态非法，raw=${value}`);
  }
  const negative = parts[1] === '-';
  const fraction = parts[3];
  const fractionCents = fraction === undefined ? 0n : BigInt(fraction.padEnd(2, '0'));
  const amount = BigInt(parts[2]) * 100n + fractionCents;
  return negative ? -amount : amount;
}

function requireArray(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label}: 期望数组，实际 ${JSON.stringify(value)}`);
  }
  return value as Row[];
}

/**
 * restore_reserved_stock 按 product_id + warehouse_id 取单条库存行回加，
 * 因此造数前必须确认该组合在库（含软删）均无既有行，避免回加到别人的行上。
 */
async function countStockRows(
  page: Page,
  productId: number,
  warehouseId: number,
  stockStatus?: string
): Promise<number> {
  const statusSuffix =
    stockStatus === undefined ? '' : `&stock_status=${encodeURIComponent(stockStatus)}`;
  const body = await apiCallRaw<Row>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=100${statusSuffix}`
  );
  if (typeof body.total !== 'number') {
    throw new Error(`库存列表 total 非数字: ${JSON.stringify(body)}`);
  }
  return body.total;
}

async function pickEmptyStockSlot(page: Page): Promise<StockSlot> {
  const ctx = getCtx();
  for (const productId of ctx.productIds) {
    for (const warehouseId of ctx.warehouseIds) {
      const active = await countStockRows(page, productId, warehouseId);
      // inventory_stock_status::DELETED 的真实取值，逐字符对齐后端词表。
      const deleted = await countStockRows(page, productId, warehouseId, '已删除');
      if (active === 0 && deleted === 0) {
        return { productId, warehouseId };
      }
    }
  }
  throw new Error('夹具产品与仓库组合均已有库存行，无法满足回加归因的单行前提');
}

async function seedCustomer(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E2E507-CUST-${tag}`,
    status: 'active',
  });
  const id = requireId(created.id, '建客户');
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `customer#${id}`, order: 4 });
  return id;
}

async function seedCreditRating(page: Page, customerId: number): Promise<void> {
  await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
    customer_id: customerId,
    credit_level: 'E2E507',
    credit_limit: '1500.00',
    credit_days: 30,
  });
  CLEANUP.push({
    path: `/crm/customer-credits/${customerId}`,
    label: `credit#${customerId}`,
    order: 3,
  });
}

async function seedStock(page: Page, slot: StockSlot, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: slot.warehouseId,
    product_id: slot.productId,
    batch_no: `${tag}-BATCH`,
    color_no: `${tag}-COLOR`,
    dye_lot_no: genDyeLotNo(),
    grade: '一等品',
    quantity_meters: '100',
    quantity_kg: '100',
  });
  const id = requireId(created.id, '建库存行');
  CLEANUP.push({ path: `/inventory/stock/${id}`, label: `stock#${id}`, order: 2 });
  return id;
}

async function seedOrder(
  page: Page,
  customerId: number,
  productId: number,
  tag: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: '40',
        unit_price: '10.00',
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `${tag}-SO`,
  });
  const id = requireId(created.id, '建销售订单');
  CLEANUP.push({ path: `/sales/orders/${id}`, label: `so#${id}`, order: 1 });
  return id;
}

async function seedReservation(
  page: Page,
  orderId: number,
  slot: StockSlot,
  quantity: string,
  notes: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/reservations', {
    order_id: orderId,
    product_id: slot.productId,
    warehouse_id: slot.warehouseId,
    quantity,
    notes,
  });
  return requireId(created.id, '建预留');
}

async function readStock(page: Page, stockId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${stockId}`);
}

async function readReservations(page: Page, productId: number): Promise<Row[]> {
  const body = await apiCallRaw<Row>(
    page,
    'GET',
    `/inventory/reservations?product_id=${productId}&page=1&page_size=100`
  );
  return requireArray(body.list, '预留列表 data.list');
}

function rowById(rows: Row[], id: number, label: string): Row {
  const found = rows.find(row => typeof row.id === 'number' && row.id === id);
  if (!found) {
    throw new Error(`${label}: 预留列表未找到 id=${id}`);
  }
  return found;
}

test('507-01 拒绝待审销售订单释放预留并精确回加库存，二次拒绝不重复回加', async ({ page }) => {
  const slot = await pickEmptyStockSlot(page);
  const tag = genCode('E507');

  const customerId = await seedCustomer(page, tag);
  await seedCreditRating(page, customerId);
  const stockId = await seedStock(page, slot, tag);
  const orderId = await seedOrder(page, customerId, slot.productId, tag);

  const baseline = await readStock(page, stockId);
  expect(decimalCents(baseline.quantity_on_hand, '基线 quantity_on_hand')).toBe(10000n);
  expect(decimalCents(baseline.quantity_available, '基线 quantity_available')).toBe(10000n);
  expect(decimalCents(baseline.quantity_reserved, '基线 quantity_reserved')).toBe(0n);
  expect(decimalCents(baseline.quantity_shipped, '基线 quantity_shipped')).toBe(0n);

  await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);
  const pendingOrder = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(requireString(pendingOrder.status, '提交后订单状态')).toBe('pending');

  const r1 = await seedReservation(page, orderId, slot, '15.00', `${tag}-R1`);
  const r2 = await seedReservation(page, orderId, slot, '10.00', `${tag}-R2`);
  await apiCallRaw(page, 'POST', `/inventory/reservations/${r2}/lock`);

  const beforeReservations = await readReservations(page, slot.productId);
  const beforeR1 = rowById(beforeReservations, r1, '拒绝前 R1');
  const beforeR2 = rowById(beforeReservations, r2, '拒绝前 R2');
  expect(requireString(beforeR1.status, '拒绝前 R1 状态')).toBe('pending');
  expect(requireString(beforeR2.status, '拒绝前 R2 状态')).toBe('locked');
  expect(decimalCents(beforeR1.quantity, '拒绝前 R1 数量')).toBe(1500n);
  expect(decimalCents(beforeR2.quantity, '拒绝前 R2 数量')).toBe(1000n);
  expect(beforeR1.released_at, '拒绝前 R1 无释放时间').toBeNull();
  expect(beforeR2.released_at, '拒绝前 R2 无释放时间').toBeNull();
  const beforeStock = await readStock(page, stockId);
  expect(decimalCents(beforeStock.quantity_available, '建预留后可用量')).toBe(10000n);

  const rejected = await apiCall<Row>(page, 'POST', `/sales/orders/${orderId}/reject`, {
    reason: `  ${tag}  `,
  });
  expect(requireString(rejected.data.message, '拒绝响应 message')).toBe('订单已拒绝');

  const afterOrder = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(requireString(afterOrder.status, '拒绝后订单状态')).toBe('rejected');
  expect(requireString(afterOrder.rejected_reason, '拒绝后 rejected_reason')).toBe(tag);

  const afterReservations = await readReservations(page, slot.productId);
  const afterR1 = rowById(afterReservations, r1, '拒绝后 R1');
  const afterR2 = rowById(afterReservations, r2, '拒绝后 R2');
  expect(requireString(afterR1.status, '拒绝后 R1 状态')).toBe('cancelled');
  expect(requireString(afterR2.status, '拒绝后 R2 状态')).toBe('cancelled');
  expect(requireString(afterR1.released_at, '拒绝后 R1 released_at').length).toBeGreaterThan(0);
  expect(requireString(afterR2.released_at, '拒绝后 R2 released_at').length).toBeGreaterThan(0);
  expect(decimalCents(afterR1.quantity, '拒绝后 R1 数量')).toBe(1500n);
  expect(decimalCents(afterR2.quantity, '拒绝后 R2 数量')).toBe(1000n);
  expect(afterR1.order_id).toBe(orderId);
  expect(afterR2.order_id).toBe(orderId);

  const afterStock = await readStock(page, stockId);
  expect(decimalCents(afterStock.quantity_available, '拒绝后可用量')).toBe(12500n);
  expect(decimalCents(afterStock.quantity_on_hand, '拒绝后在库量')).toBe(10000n);
  expect(decimalCents(afterStock.quantity_reserved, '拒绝后预留量')).toBe(0n);
  expect(decimalCents(afterStock.quantity_shipped, '拒绝后已发量')).toBe(0n);

  const secondReject = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/reject`, {
    reason: `${tag}-SECOND`,
  });
  expect(secondReject.status, '二次拒绝 HTTP 状态').toBe(400);
  expect(failureCode(secondReject), '二次拒绝机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(requireString(secondReject.message, '二次拒绝 message').length).toBeGreaterThan(0);

  const finalOrder = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(requireString(finalOrder.status, '二次拒绝后订单状态')).toBe('rejected');
  const finalStock = await readStock(page, stockId);
  expect(decimalCents(finalStock.quantity_available, '二次拒绝后可用量')).toBe(12500n);
  const finalReservations = await readReservations(page, slot.productId);
  const orderReservations = finalReservations.filter(
    row => typeof row.order_id === 'number' && row.order_id === orderId
  );
  expect(orderReservations, '二次拒绝后预留行数').toHaveLength(2);
});
