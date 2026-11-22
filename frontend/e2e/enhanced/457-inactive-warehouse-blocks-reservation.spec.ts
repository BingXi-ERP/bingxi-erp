// 4.22 主数据引用完整性 + 4.41 A 链：仓库停用后视同不存在，新建库存预留被拦截；
//   恢复启用后同一预留请求放行，证明拦截确由仓库启用状态决定。
// 后端判据：routes/catalog.rs:93 挂 PUT /warehouses/{id}；
//   handlers/warehouse_handler.rs:88-113 UpdateWarehouseRequest.status 映射非 Option 列 is_active；
//   services/warehouse_service.rs:382-383 `wh.is_active = Set(s == master_data::ACTIVE)`；
//   routes/inventory.rs:194-200 挂 POST /inventory/reservations；
//   services/inventory_reservation_service.rs:64-72 查仓库行，!is_active 即
//   AppError::not_found("仓库 {id} 不可引用（已停用，视同不存在）")，且该预检在任何写库前。
// 与既有覆盖分工：inventory/06-reservation-readback.spec.ts 只用 active 默认仓建预留，
//   未涉仓库停用分支；flow/465 只覆盖库位主档，未改仓库自身 status。全 e2e 无该拒因断言。
// 检测力：停用门被移除则停用仓预留成功即红；拒绝但状态文案不对即红；
//   恢复后仍拒则证明前置混入了其它门，同样即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface WarehouseRow {
  id?: number;
  is_active?: boolean;
  code?: string;
}
interface CustomerRow {
  id?: number;
}
interface OrderRow {
  id?: number;
}
interface ReservationRow {
  id?: number;
  warehouse_id?: number;
  order_id?: number;
}

async function seedWarehouse(page: Page): Promise<number> {
  const created = await apiCallRaw<WarehouseRow>(page, 'POST', '/warehouses', {
    name: `E2E457停用仓${genCode('W')}`,
    code: `E457${genCode('C')}`,
  });
  const id = Number(created?.id);
  expect(id, '[457] 前置：自建仓库失败').toBeGreaterThan(0);
  return id;
}

async function seedDraftOrder(page: Page, customerId: number, productId: number): Promise<number> {
  const created = await apiCallRaw<OrderRow>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: productId, quantity: 10, unit_price: 25.5 }],
  });
  const id = Number(created?.id);
  expect(id, '[457] 前置：自建草稿销售订单失败').toBeGreaterThan(0);
  return id;
}

test.describe('4.22 仓库停用拦截库存预留', () => {
  test('457-01 停用仓建预留被 404 拒绝，恢复启用后同一请求放行', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(ctx.productIds?.[0], '[457] 前置：ensureTestEntities 未产出产品').toBeTruthy();

    const customer = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
      customer_name: `E2E457预留客户${genCode('C')}`,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[457] 前置：自建客户失败').toBeGreaterThan(0);
    const warehouseId = await seedWarehouse(page);
    const orderId = await seedDraftOrder(page, customerId, Number(ctx.productIds[0]));
    let reservationId = 0;

    try {
      await apiCallRaw(page, 'PUT', `/warehouses/${warehouseId}`, { status: 'inactive' });
      const off = await apiCallRaw<WarehouseRow>(page, 'GET', `/warehouses/${warehouseId}`);
      expect(off.is_active, '[457] 停用后仓库 is_active 须为 false').toBe(false);

      const payload = {
        product_id: Number(ctx.productIds[0]),
        warehouse_id: warehouseId,
        order_id: orderId,
        quantity: '10',
        notes: `E2E457-${genCode('R')}`,
      };
      const rejected = await apiCallExpectFail(page, 'POST', '/inventory/reservations', payload);
      expect(rejected.status, '[457] 停用仓建预留须 404').toBe(404);
      expect(
        failureCode(rejected),
        `拒绝码须为 NOT_FOUND，实际 ${JSON.stringify(rejected.code)}`
      ).toBe(APP_ERROR_CODES.NOT_FOUND);
      expect(
        String(rejected.message ?? ''),
        `拒因须点名仓库已停用，实际 ${JSON.stringify(rejected.message)}`
      ).toContain('不可引用（已停用，视同不存在）');

      await apiCallRaw(page, 'PUT', `/warehouses/${warehouseId}`, { status: 'active' });
      const on = await apiCallRaw<WarehouseRow>(page, 'GET', `/warehouses/${warehouseId}`);
      expect(on.is_active, '[457] 恢复后仓库 is_active 须为 true').toBe(true);

      const created = await apiCallRaw<ReservationRow>(
        page,
        'POST',
        '/inventory/reservations',
        payload
      );
      reservationId = Number(created?.id);
      expect(reservationId, '[457] 恢复启用后同一预留请求须放行').toBeGreaterThan(0);
      expect(Number(created.warehouse_id), '[457] 放行的预留须落在该仓库，不得改用默认仓').toBe(
        warehouseId
      );
      expect(Number(created.order_id), '[457] 放行的预留须挂在原订单').toBe(orderId);
    } finally {
      if (reservationId > 0) {
        await tryCleanup(
          page,
          'DELETE',
          `/inventory/reservations/${reservationId}`,
          `457 预留 ${reservationId}`
        );
      }
      await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `457 订单 ${orderId}`);
      await tryCleanup(page, 'DELETE', `/warehouses/${warehouseId}`, `457 仓库 ${warehouseId}`);
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `457 客户 ${customerId}`);
    }
  });
});
