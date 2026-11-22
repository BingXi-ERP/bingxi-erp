// 4.21 审批阈值边界：信用额度"订单金额刚好等于可用额度"的放行/超额拒绝分界。
// 后端判据：services/customer_credit_limit.rs:385 `Ok(order_amount <= credit.available_credit)`——
//   等于时放行（<= 含等号），超出才 false；调用链 services/so/order_crud.rs:106 建单事务内
//   check_credit_available，:222-230 false 时 Err(business_displayable "信用额度不足，请调整订单金额或联系管理员调整额度")。
// 检测力：若把 <= 误改成 <，等于额度的订单会被拒，正例即红；若删掉门，超额订单会落库，负例即红。
// 与 470 正交：那条断额度 1000 与 10 对 500 订单的远近两侧，不断"刚好等于 500"的分界点。
// 与 416-credit-limit-precision 正交：那条断额度 DTO 的两位小数精度，本条断下单时的额度比较边界。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id?: number;
  status?: string;
  total_amount?: string | number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

async function seedCustomerWithCredit(page: import('@playwright/test').Page, limit: string) {
  const cust = await apiCall<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E2E额度边界${genCode('C')}`,
    status: 'active',
  });
  const id = cust.data?.id;
  expect(id, '前置：客户建档须返回主键').toBeTruthy();
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `额度边界客户 ${id}` });

  await apiCall(page, 'POST', '/crm/customer-credits', {
    customer_id: id,
    credit_level: 'E2E-BOUNDARY',
    credit_limit: limit,
    credit_days: 30,
  });
  CLEANUP.push({ path: `/crm/customer-credits/${id}`, label: `额度边界信用行 ${id}` });
  return id!;
}

async function order500(
  page: import('@playwright/test').Page,
  customerId: number,
  productId: number
) {
  return apiCall<Row>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: '5',
        unit_price: '100.00',
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E2E额度边界-${genCode('S')}`,
  });
}

test.describe('4.21 信用额度等于订单金额边界', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('421-01 订单金额等于可用额度放行，超 1 分被拒', async ({ page }) => {
    const ctx = getCtx();
    expect(ctx.productIds?.[0], '前置须有产品用于下单').toBeTruthy();

    // 恰好等于：额度 500.00，订单 5×100.00=500.00，须放行（<= 含等号）。
    const equalCustomer = await seedCustomerWithCredit(page, '500.00');
    const ok = await order500(page, equalCustomer, ctx.productIds![0]);
    const okId = ok.data?.id;
    expect(
      okId,
      `订单金额刚好等于可用额度应放行，实际响应 ${JSON.stringify(ok).slice(0, 300)}`
    ).toBeTruthy();
    CLEANUP.push({ path: `/sales/orders/${okId}`, label: `421 等额订单 ${okId}` });

    // 超 1 分：额度 499.99，同订单 500.00，须被信用门拒且文案点名额度不足。
    const shortCustomer = await seedCustomerWithCredit(page, '499.99');
    const rejected = await apiCallExpectFail(page, 'POST', '/sales/orders', {
      customer_id: shortCustomer,
      order_date: new Date().toISOString(),
      items: [
        {
          product_id: ctx.productIds![0],
          quantity: '5',
          unit_price: '100.00',
          tax_percent: '0',
          quantity_tolerance_pct: '0',
        },
      ],
      notes: `E2E额度超限-${genCode('S')}`,
    });
    expect(failureCode(rejected), '超额拒绝须归 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      String(rejected.message ?? ''),
      '拒因须点名信用额度不足，实际 ' + JSON.stringify(rejected.message)
    ).toContain('信用额度不足');

    // 被拒客户名下不得残留订单：列表按客户筛应为空。
    const list = await apiCallRaw<{ items?: Row[] }>(
      page,
      'GET',
      `/sales/orders?customer_id=${shortCustomer}&page=1&page_size=10`
    );
    expect(list.items?.length ?? 0, '超额被拒后该客户不应产生订单').toBe(0);
  });
});
