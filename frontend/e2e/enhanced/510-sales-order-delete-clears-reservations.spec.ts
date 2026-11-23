// 510 销售订单硬删除清除锁缸预留（纯 API E2E）。
// 源码判据（逐行核源，不按猜测断言）：
// - routes/sales.rs:23-25 挂 POST/GET /sales/orders/{id}，DELETE 由同组路由接
//   handlers/sales_order_handler.rs:335-353：先 assert_order_ownership，再 SalesService::delete_order。
// - services/so/order_crud.rs:731-790：lock_exclusive 读单，仅 shipped/completed 拒删；
//   :757 先 delete_reservations，:760-763 删明细，:767-771 带审计删主表，:774 提交事务。
// - services/so/delivery_ops/inventory.rs:39-43 删除作用域 = pending/locked/consumed；
//   :501-515 restore_reserved_stock 后按 order_id 物理删全部预留（released/cancelled 不回加）；
//   :537-635 按 (product_id,warehouse_id) 聚合：pending/locked 的 quantity 全量回加 available，
//   只更新 quantity_available 与 quantity_shipped，quantity_reserved/quantity_on_hand 不动。
// - 建预留与 lock 不改库存（inventory_reservation_service.rs:28-86 无库存写），故 100 基线
//   经两条预留后仍为 100，删单后精确回加到 100+15+10=125；若不回加则判红。
// - 出参键以 models/inventory_reservation.rs:10-47 与库存 StockResponse 为准；
//   预留列表信封是 {list,total,page,page_size}（inventory_reservation_handler.rs:81-86），不是 items。
// - 状态词以写入方为准：models/status/sales.rs sales_order DRAFT='draft'；
//   models/status/purchase_inventory.rs inventory_reservation PENDING='pending'/LOCKED='locked'。
// - DECIMAL 出参为字符串，一律转整数分（bigint）精确比较，不用浮点相等。
// 造数隔离：自建产品/仓库/客户/库存行，清理只删真实存在的库存行与自建实体；
//   预留行不做伪造 DELETE，随订单删除由被测链自身清除。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
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

type Row = Record<string, unknown>;

const PAGE_SIZE = 100;
const BASE_CENTS = 10000n;
const R1_CENTS = 1500n;
const R2_CENTS = 1000n;
const AFTER_DELETE_CENTS = BASE_CENTS + R1_CENTS + R2_CENTS;

interface CleanupEntry {
  path: string;
  label: string;
  done?: () => boolean;
}

const CLEANUP: CleanupEntry[] = [];
let orderDeleted = false;

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    if (c.done?.() === true) continue;
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
  orderDeleted = false;
});

function requireId(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[510] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function requireCount(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) >= 0,
    `[510] ${label} 须非负整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function requireList(value: unknown, label: string): Row[] {
  expect(Array.isArray(value), `[510] ${label} 须数组，实际=${JSON.stringify(value)}`).toBe(true);
  return value as Row[];
}

/** DECIMAL(18,4) 出参转百分位整数：只接受字符串，避免浮点比较掩盖精度问题；
 *  列刻度允许 4 位小数，百分位以下必须为零尾数，不静默截断。 */
function cents(value: unknown, label: string): bigint {
  expect(
    typeof value === 'string',
    `[510] ${label} 的 DECIMAL 出参须字符串，实际类型=${typeof value} raw=${JSON.stringify(value)}`
  ).toBe(true);
  const text = (value as string).trim();
  const matched = /^(-?)(\d+)(?:\.(\d{0,4}))?$/.exec(text);
  expect(matched !== null, `[510] ${label} 的 DECIMAL 字符串形态非法，raw="${text}"`).toBe(true);
  const parts = matched as RegExpExecArray;
  const sign = parts[1];
  const intPart = parts[2];
  const frac = parts[3] === undefined ? '' : parts[3];
  expect(
    frac.length <= 2 || frac.slice(2) === '00',
    `[510] ${label} 含百分位以下非零尾数，超出分精度，raw="${text}"`
  ).toBe(true);
  const digits = (intPart + frac).padEnd(intPart.length + 2, '0').slice(0, intPart.length + 2);
  const amount = BigInt(digits);
  return sign === '-' ? -amount : amount;
}

async function seedProduct(page: Page, tag: string): Promise<number> {
  const ctx = getCtx();
  expect(
    ctx.productCategoryIds.length > 0,
    '[510] 前置：productCategoryIds 为空，无法自建产品'
  ).toBe(true);
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    name: `E510产品${tag}`,
    code: `E510P${tag}`,
    category_id: ctx.productCategoryIds[0],
    unit: 'm',
    product_type: PRODUCT_TYPE.auxiliary,
    status: 'active',
  });
  const id = requireId(created.id, '[510] 自建产品 id');
  CLEANUP.push({ path: `/products/${id}`, label: `510-product#${id}` });
  console.log(`[510] 自建产品 id=${id} code=E510P${tag}`);
  return id;
}

async function seedWarehouse(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/warehouses', {
    name: `E510仓${tag}`,
    code: `E510W${tag}`,
  });
  const id = requireId(created.id, '[510] 自建仓库 id');
  CLEANUP.push({ path: `/warehouses/${id}`, label: `510-warehouse#${id}` });
  console.log(`[510] 自建仓库 id=${id} code=E510W${tag}`);
  return id;
}

async function seedCustomer(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E510客户${tag}`,
    status: 'active',
  });
  const id = requireId(created.id, '[510] 自建客户 id');
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `510-customer#${id}` });
  console.log(`[510] 自建客户 id=${id}`);
  return id;
}

async function seedCredit(page: Page, customerId: number): Promise<void> {
  await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
    customer_id: customerId,
    credit_level: 'E510',
    credit_limit: '5000.00',
    credit_days: 30,
  });
  CLEANUP.push({
    path: `/crm/customer-credits/${customerId}`,
    label: `510-credit#${customerId}`,
  });
  console.log(`[510] 客户 ${customerId} 信用额度已置 5000.00`);
}

async function seedDraftOrder(page: Page, customerId: number, productId: number): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: '10',
        unit_price: '10.00',
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E510-SO-${genCode('N')}`,
  });
  const id = requireId(created.id, '[510] 销售订单 id');
  CLEANUP.push({
    path: `/sales/orders/${id}`,
    label: `510-order#${id}`,
    done: () => orderDeleted,
  });
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  expect(String(detail.status), '[510] 被测订单初始状态须 draft').toBe('draft');
  console.log(`[510] 自建草稿订单 id=${id} status=draft`);
  return id;
}

async function seedStock(
  page: Page,
  productId: number,
  warehouseId: number,
  tag: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: `B-${tag}`,
    color_no: `C-${tag}`,
    dye_lot_no: `L-${tag}`,
    grade: '一等品',
    quantity_meters: '100.00',
    quantity_kg: '100.00',
  });
  const id = requireId(created.id, '[510] 自建库存行 id');
  CLEANUP.push({ path: `/inventory/stock/${id}`, label: `510-stock#${id}` });
  console.log(`[510] 自建库存行 id=${id} product=${productId} warehouse=${warehouseId}`);
  return id;
}

async function seedReservation(
  page: Page,
  label: string,
  orderId: number,
  productId: number,
  warehouseId: number,
  quantity: string,
  tag: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/reservations', {
    order_id: orderId,
    product_id: productId,
    warehouse_id: warehouseId,
    quantity,
    notes: `E510-${label}-${tag}`,
  });
  const id = requireId(created.id, `[510] ${label} 预留 id`);
  expect(String(created.status), `[510] ${label} 建预留初始状态须 pending`).toBe('pending');
  console.log(`[510] ${label} 预留 id=${id} quantity=${quantity} status=pending`);
  return id;
}

async function readStock(page: Page, stockId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${stockId}`);
}

function assertStock(row: Row, label: string, available: bigint): void {
  expect(
    cents(row.quantity_on_hand, `[510] ${label} quantity_on_hand`),
    `[510] ${label} on_hand 未变`
  ).toBe(BASE_CENTS);
  expect(
    cents(row.quantity_available, `[510] ${label} quantity_available`),
    `[510] ${label} available 精确回加=${available}`
  ).toBe(available);
  expect(
    cents(row.quantity_reserved, `[510] ${label} quantity_reserved`),
    `[510] ${label} reserved 源码口径保持 0`
  ).toBe(0n);
  expect(
    cents(row.quantity_shipped, `[510] ${label} quantity_shipped`),
    `[510] ${label} shipped 源码口径保持 0`
  ).toBe(0n);
}

/** 按 product_id+warehouse_id 翻完所有页：信封键为 list/total/page/page_size。 */
async function readAllReservations(
  page: Page,
  productId: number,
  warehouseId: number
): Promise<Row[]> {
  const path = (pageNo: number): string =>
    `/inventory/reservations?product_id=${productId}&warehouse_id=${warehouseId}&page=${pageNo}&page_size=${PAGE_SIZE}`;
  const first = await apiCallRaw<Row>(page, 'GET', path(1));
  const total = requireCount(first.total, '[510] 预留列表 total');
  const firstList = requireList(first.list, '[510] 预留列表第 1 页 list');
  expect(first.page, '[510] 预留列表回显 page').toBe(1);
  expect(first.page_size, '[510] 预留列表回显 page_size').toBe(PAGE_SIZE);
  const rows: Row[] = [...firstList];
  const pages = Math.ceil(total / PAGE_SIZE);
  for (let pageNo = 2; pageNo <= pages; pageNo += 1) {
    const current = await apiCallRaw<Row>(page, 'GET', path(pageNo));
    expect(current.page, `[510] 预留列表第 ${pageNo} 页回显 page`).toBe(pageNo);
    rows.push(...requireList(current.list, `[510] 预留列表第 ${pageNo} 页 list`));
  }
  expect(rows.length, '[510] 全页回读行数须与 total 一致').toBe(total);
  console.log(`[510] 预留全页回读 product=${productId} warehouse=${warehouseId} total=${total}`);
  return rows;
}

function findReservation(rows: Row[], id: number, label: string): Row {
  const matched = rows.filter(row => requireId(row.id, `[510] ${label} 回读 id`) === id);
  expect(matched.length, `[510] ${label} 预留须恰好回读一条，实际=${matched.length}`).toBe(1);
  return matched[0];
}

test.describe('510 销售订单硬删除清除全部预留行', () => {
  test('510-01 删单后订单 404 预留全页消失 库存按 pending+locked 预留量精确回加', async ({
    page,
  }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `[510] 夹具缺产品，productIds=${ctx.productIds.length}`).toBe(
      true
    );

    const tag = genCode('E510');
    const productId = await seedProduct(page, tag);
    const warehouseId = await seedWarehouse(page, tag);
    const customerId = await seedCustomer(page, tag);
    await seedCredit(page, customerId);
    const orderId = await seedDraftOrder(page, customerId, ctx.productIds[0]);
    const stockId = await seedStock(page, productId, warehouseId, tag);

    const baseline = await readStock(page, stockId);
    assertStock(baseline, '入库基线', BASE_CENTS);

    const pendingId = await seedReservation(
      page,
      'pending',
      orderId,
      productId,
      warehouseId,
      '15.00',
      tag
    );
    const lockedId = await seedReservation(
      page,
      'locked',
      orderId,
      productId,
      warehouseId,
      '10.00',
      tag
    );
    await apiCallRaw<Row>(page, 'POST', `/inventory/reservations/${lockedId}/lock`);
    console.log(`[510] locked 预留 id=${lockedId} 已 lock`);

    const before = await readAllReservations(page, productId, warehouseId);
    expect(before.length, '[510] 删单前须回读到两条专属预留').toBe(2);
    const pending = findReservation(before, pendingId, 'pending 预留');
    const locked = findReservation(before, lockedId, 'locked 预留');
    expect(String(pending.status), '[510] R1 删单前状态须 pending').toBe('pending');
    expect(String(locked.status), '[510] R2 删单前状态须 locked').toBe('locked');
    expect(cents(pending.quantity, '[510] R1 quantity'), '[510] R1 数量').toBe(R1_CENTS);
    expect(cents(locked.quantity, '[510] R2 quantity'), '[510] R2 数量').toBe(R2_CENTS);
    for (const row of [pending, locked]) {
      expect(requireId(row.order_id, '[510] 预留 order_id'), '[510] 预留须挂在被测订单').toBe(
        orderId
      );
      expect(requireId(row.product_id, '[510] 预留 product_id'), '[510] 预留产品').toBe(productId);
      expect(requireId(row.warehouse_id, '[510] 预留 warehouse_id'), '[510] 预留仓库').toBe(
        warehouseId
      );
    }
    assertStock(await readStock(page, stockId), '建预留与 lock 后（源码无库存写）', BASE_CENTS);

    await apiCallRaw<Row>(page, 'DELETE', `/sales/orders/${orderId}`);
    orderDeleted = true;
    console.log(`[510] 销售订单 id=${orderId} 硬删除请求成功`);

    const gone = await apiCallExpectFail(page, 'GET', `/sales/orders/${orderId}`);
    expect(gone.status, '[510] 删单后订单详情须 404').toBe(404);
    expect(
      failureCode(gone),
      `[510] 404 错误码须 NOT_FOUND，实际=${JSON.stringify(gone.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    const remaining = await readAllReservations(page, productId, warehouseId);
    expect(remaining.length, '[510] 删单后专属维度预留须全部消失').toBe(0);
    for (const row of remaining) {
      expect(
        requireId(row.order_id, '[510] 残留预留 order_id'),
        '[510] 不得存在 order_id 等于已删订单的预留行'
      ).not.toBe(orderId);
    }
    expect(
      remaining.some(
        row =>
          requireId(row.id, '[510] 残留预留 id') === pendingId ||
          requireId(row.id, '[510] 残留预留 id') === lockedId
      ),
      '[510] 两条被测预留 id 不得再出现'
    ).toBe(false);

    assertStock(await readStock(page, stockId), '删单后', AFTER_DELETE_CENTS);
  });
});
