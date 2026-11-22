// 4.22 主数据引用完整性 + 4.41 A 链：产品停用后视同不存在，新建库存预留被拦截；
//   恢复 active 后同一预留请求放行，证明拦截确由产品状态决定。
// 后端判据：routes/catalog.rs:28 挂 PUT /products/{id}；
//   handlers/product_handler.rs:105-124 UpdateProductRequest.status；
//   services/product_ops/crud.rs:739-740 将 status 直接 Set 落库；
//   models/status/general.rs:130-135 master_data::ACTIVE="active" / INACTIVE="inactive"；
//   services/inventory_reservation_service.rs:54-62 产品行 is_deleted 或 status != active 即
//   AppError::not_found("产品 {id} 不可引用（已软删或已停用，视同不存在）")，在任何写库前。
// 与既有覆盖分工：457 只测仓库停用腿，inventory/06 只用 active 默认产品建预留；
//   全 e2e 无该拒因断言。本例自建产品，不修改共享 ctx 产品，避免并发竞态。
import { test, expect, type Page } from '../diagnose-fixture';
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

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface Row {
  id?: number;
  status?: string;
  product_id?: number;
  warehouse_id?: number;
  order_id?: number;
}

async function seedProduct(page: Page, tag: string): Promise<number> {
  const category = await apiCallRaw<Row>(page, 'POST', '/categories', {
    name: `485类${tag}`,
    code: `485CAT${tag}`,
  });
  const categoryId = Number(category.id);
  expect(categoryId, '[485] 前置：自建分类须回真实主键').toBeGreaterThan(0);

  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    name: `485产品${tag}`,
    code: `485P${tag}`,
    category_id: categoryId,
    unit: 'm',
    product_type: PRODUCT_TYPE.auxiliary,
    status: 'active',
  });
  const id = Number(product.id);
  expect(id, '[485] 前置：自建产品须回真实主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/products/${id}`, label: `[485] 产品 ${id}` });
  return id;
}

async function seedCustomerAndOrder(page: Page, productId: number): Promise<number> {
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `485预留客户_${genCode('E485')}`,
    status: 'active',
  });
  const customerId = Number(customer.id);
  expect(customerId, '[485] 前置：自建客户须回真实主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `[485] 客户 ${customerId}` });

  const order = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: productId, quantity: 10, unit_price: 25.5 }],
  });
  const orderId = Number(order.id);
  expect(orderId, '[485] 前置：自建草稿销售订单须回真实主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `[485] 订单 ${orderId}` });
  return orderId;
}

test.describe('4.22 产品停用拦截库存预留', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('485-01 产品停用建预留 404，恢复 active 后同一请求放行', async ({ page }) => {
    const ctx = getCtx();
    const warehouseId = ctx.warehouseIds[0];
    expect(warehouseId, '[485] 前置：仓库未就绪').toBeGreaterThan(0);

    const productId = await seedProduct(page, genCode('E485'));
    const orderId = await seedCustomerAndOrder(page, productId);

    await apiCallRaw(page, 'PUT', `/products/${productId}`, { status: 'inactive' });
    const off = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
    expect(off.status, '[485] 停用后产品 status 须为 inactive').toBe('inactive');

    const payload = {
      product_id: productId,
      warehouse_id: warehouseId,
      order_id: orderId,
      quantity: '10',
      notes: `E485-${genCode('R')}`,
    };
    const rejected = await apiCallExpectFail(page, 'POST', '/inventory/reservations', payload);
    expect(rejected.status, '[485] 停用产品建预留须 404').toBe(404);
    expect(
      failureCode(rejected),
      `[485] 拒绝码须 NOT_FOUND，实际 ${JSON.stringify(rejected.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      String(rejected.message ?? ''),
      `[485] 拒因须点名产品已停用，实际 ${JSON.stringify(rejected.message)}`
    ).toContain('不可引用（已软删或已停用，视同不存在）');

    await apiCallRaw(page, 'PUT', `/products/${productId}`, { status: 'active' });
    const on = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
    expect(on.status, '[485] 恢复后产品 status 须为 active').toBe('active');

    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/reservations', payload);
    const reservationId = Number(created.id);
    expect(reservationId, '[485] 恢复 active 后同一预留请求须放行').toBeGreaterThan(0);
    expect(Number(created.product_id), '[485] 放行预留须落在该产品').toBe(productId);
    expect(Number(created.warehouse_id), '[485] 放行预留须落在该仓库').toBe(warehouseId);
    expect(Number(created.order_id), '[485] 放行预留须挂在原订单').toBe(orderId);
    CLEANUP.push({
      path: `/inventory/reservations/${reservationId}`,
      label: `[485] 预留 ${reservationId}`,
    });
  });
});
