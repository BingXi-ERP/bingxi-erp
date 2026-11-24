// 4.39 软删与物理删 E2E — flow/574-soft-delete-visibility-and-delete-confirm
// 功能：软删客户在 active 列表不可见但按 id 与关联单据仍可查；物理删除 UI 二次确认点取消则零删除。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；客户/订单/产品均自建唯一标识，避免撞共享单据。
// 传给谁：POST /crm/customers → DELETE /crm/customers/{id} → GET /crm/customers?status=active →
//   GET /crm/customers/{id} → POST /sales/orders（关联）→ GET /sales/orders/{id} →
//   产品 UI：safeGoto /product → findTableRow → 行内删除 → 确认弹窗点"取消" → API 回读证零删除。
// 存什么：customers 一行 status=inactive；sales_orders 一行（customer_id 指向该客户）；
//   products 一行用于 UI 取消腿（不删）。
// 存哪里：customers / sales_orders / products 表。
// 口径说明：31b/31c 已覆盖"创建→删除→详情404"与软删标记，本例不重复其删除门；
//   按报告建议补两条空缺：①软删后 active 列表不含、但详情与关联单据仍可查；
//   ②物理删除的二次确认是前端 ElMessageBox 交互（后端无二次确认），点"取消"断言零删除。
//   后端判据：list_customers 仅显式传 status 才过滤（crud.rs:163-167）；get_customer 不按 status 过滤。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, ensureTestEntities, genCode, getCtx, tryCleanup } from './helpers';
import { findTableRow, safeGoto } from './ui-helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface CustomerRow {
  id: number;
  customer_code?: string;
  customer_name?: string;
  status?: string;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test('574-01 软删客户 active 列表不可见但详情与关联订单可查', async ({ page }: { page: Page }) => {
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (ctx.productIds.length === 0) {
    throw new Error('前置不成立：夹具未产出产品主键，无法建关联订单');
  }
  const tag = genCode('574A');
  const code = `C${tag}`;
  const name = `客户${tag}软删关联`;

  const created = await apiCall<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_code: code,
    customer_name: name,
    customer_type: 'retail',
    status: 'active',
  });
  const customerId = Number(created.data?.id);
  expect(customerId, '建档须返回正整数主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `574 客户 ${customerId}` });

  // 先造关联销售订单，软删客户后该单据仍应可查（关联不留孤儿断链）。
  const order = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    items: [{ product_id: ctx.productIds[0], quantity: 1, unit_price: '12.00' }],
    remarks: `574关联订单${tag}`,
  });
  const orderId = Number(order.id);
  expect(Number.isInteger(orderId) && orderId > 0, '关联订单须回真实主键').toBe(true);
  CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `574 订单 ${orderId}` });

  await apiCall(page, 'DELETE', `/crm/customers/${customerId}`);

  // active 列表显式过滤后不含软删行。
  const active = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    '/crm/customers?status=active&page=1&page_size=100'
  );
  expect(
    (active.items ?? []).some(r => Number(r.id) === customerId),
    '软删后 status=active 列表不应含该客户'
  ).toBe(false);

  // 详情与关联单据仍可查：证明软删只改状态、未物理删行、未断关联。
  const detail = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${customerId}`);
  expect(Number(detail.id), '软删后客户详情仍可查').toBe(customerId);
  expect(String(detail.status).toLowerCase(), '详情 status 须为 inactive').toBe('inactive');
  const orderDetail = await apiCallRaw<{ id?: unknown; customer_id?: unknown }>(
    page,
    'GET',
    `/sales/orders/${orderId}`
  );
  expect(Number(orderDetail.id), '软删客户后其关联销售订单仍可查').toBe(orderId);
  expect(
    Number(orderDetail.customer_id),
    '关联订单的 customer_id 仍指向该（软删）客户，不留孤儿'
  ).toBe(customerId);
});

test('574-02 物理删除二次确认点取消后记录零删除', async ({ page }: { page: Page }) => {
  const tag = genCode('574B');
  const code = `P${tag}`;
  const name = `产品${tag}取消删除`;

  const created = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code,
    name,
    unit: '米',
    status: 'active',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(created.data?.id);
  expect(productId, '建品须返回正整数主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/products/${productId}`, label: `574 产品 ${productId}` });

  await safeGoto(page, '/product');
  const row = await findTableRow(page, name);
  expect(row, `产品列表须找到自建产品 ${name}`).toBeTruthy();
  if (!row) throw new Error(`产品列表未找到自建产品 ${name}`);
  const delBtn = row.locator('button.el-button--danger, button:has-text("删除")').first();
  await delBtn.click();

  // 二次确认弹窗出现后点"取消"（非主按钮），不得触发实际删除。
  const mbox = page.locator('.el-message-box:visible').last();
  await mbox.waitFor({ state: 'visible', timeout: 10_000 });
  const cancelBtn = mbox.getByRole('button', { name: '取消' });
  await cancelBtn.click();
  await page.waitForTimeout(800);

  // 权威断言走 API：取消后按 id 详情仍在，证明零删除（不依赖列表刷新时序）。
  const still = await apiCallRaw<{ id?: unknown; code?: string }>(
    page,
    'GET',
    `/products/${productId}`
  );
  expect(Number(still.id), '点取消后产品须仍存在，证明二次确认取消为零删除').toBe(productId);
  expect(still.code, '点取消后产品 code 须原样保留').toBe(code);
});
