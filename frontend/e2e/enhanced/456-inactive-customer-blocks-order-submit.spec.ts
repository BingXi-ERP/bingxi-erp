// 4.41 A 链：客户主档停用后，新建订单提交被拦截且不落库。
// 后端判据：routes/sales.rs:29 挂 POST /orders/{id}/submit；
//   handlers/sales_order_handler.rs:356-375 先做行级归属门再调 submit_order；
//   services/so/order_workflow.rs:138-140 submit 依次过信用门与客户启用门；
//   :229-247 validate_customer_active 查 customer 主档，status != active 即
//   AppError::business_displayable("客户状态为 {}，不允许提交订单，请先将该客户恢复为启用状态")；
//   客户软删只把 status 置 inactive（flow/31-deletion-deactivation.spec.ts:131 实证），
//   不级联改订单，订单侧仍持有该 customer_id。
// 与既有覆盖分工：448-06 只测超额信用门（客户本身 active），未停用客户主档；
//   31d 的 createActiveClient 注释只说明避开被他人软删的客户以保证通知链路，未断言拒绝；
//   31 只验客户软删后列表不可见，未走订单提交。全 e2e 无该拒因文案断言。
// 检测力：停用门被移除则 submit 成功即红；拒绝但订单状态被推进则回读红；
//   拒因不点名客户状态则文案断言红。
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

interface CustomerRow {
  id?: number;
  status?: string;
}
interface OrderRow {
  id?: number;
  status?: string;
  customer_id?: number;
}

async function seedActiveCustomer(page: Page): Promise<number> {
  const created = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_name: `E2E456停用门客户${genCode('C')}`,
    status: 'active',
  });
  const id = Number(created?.id);
  expect(id, '[456] 前置：自建 active 客户失败').toBeGreaterThan(0);
  return id;
}

async function seedDraftOrder(page: Page, customerId: number, productId: number): Promise<number> {
  const created = await apiCallRaw<OrderRow>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: productId, quantity: 10, unit_price: 25.5 }],
  });
  const id = Number(created?.id);
  expect(id, '[456] 前置：自建草稿销售订单失败').toBeGreaterThan(0);
  return id;
}

test.describe('4.41 客户停用与订单提交联动', () => {
  test('456-01 客户软删置 inactive 后提交其草稿订单被拒且状态零漂移', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(
      ctx.productIds?.[0],
      '[456] 前置：ensureTestEntities 未产出产品，订单明细无从构造'
    ).toBeTruthy();

    const customerId = await seedActiveCustomer(page);
    const orderId = await seedDraftOrder(page, customerId, Number(ctx.productIds[0]));
    try {
      const before = await apiCallRaw<OrderRow>(page, 'GET', `/sales/orders/${orderId}`);
      expect(before.status, '[456] 新订单起点须为 draft').toBe('draft');
      expect(Number(before.customer_id), '[456] 订单须指向自建客户').toBe(customerId);

      await apiCallRaw(page, 'DELETE', `/crm/customers/${customerId}`);
      const customer = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${customerId}`);
      expect(customer.status, '[456] 客户软删后状态须逐字为 inactive').toBe('inactive');

      const rejected = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/submit`);
      expect(rejected.status, '[456] 停用客户订单提交须被 400 拒绝').toBe(400);
      expect(
        failureCode(rejected),
        `拒绝码须为 BUSINESS_ERROR，实际 ${JSON.stringify(rejected.code)}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(
        String(rejected.message ?? ''),
        `拒因须点名客户状态并给出恢复指引，实际 ${JSON.stringify(rejected.message)}`
      ).toContain('不允许提交订单，请先将该客户恢复为启用状态');

      const after = await apiCallRaw<OrderRow>(page, 'GET', `/sales/orders/${orderId}`);
      expect(after.status, '[456] 被拒后订单状态须仍为 draft，不得半截推进').toBe('draft');
      expect(Number(after.customer_id), '[456] 被拒后订单仍指向同一客户，不得改写关联').toBe(
        customerId
      );
    } finally {
      await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `456 订单 ${orderId}`);
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `456 客户 ${customerId}`);
    }
  });
});
