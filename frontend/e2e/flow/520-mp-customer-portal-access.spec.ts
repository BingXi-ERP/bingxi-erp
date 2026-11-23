// 小程序客户门户读面 E2E — /customer-portal/* 功能补齐回归
// 功能：绑定客户的 customer 账号读取自有订单/退货/收款/对账/商品/色卡/汇总；
//       所有行级归属由 users.customer_id 决定，请求侧不能指定他人客户；
//       生产身份由 role.code=customer + 显式绑定双门，未绑定、悬空绑定、非 customer 一律 403。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 flow 其它用例共享后端账号池。
// 入参：无测试参数；前置由管理员会话创建客户档案、销售订单与三类账号。
// 传给谁：apiCallRaw/apiCallExpectFail 走统一信封与 CSRF 恢复 helper。
// 存什么：断言状态码、分页信封、归属字段、响应体键集合；不落库。
// 存哪里：Actions 日志与 Playwright 报告。
import { test, expect } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginInIsolatedContext,
  loginViaUI,
  testPassword,
} from './helpers';

type Row = Record<string, unknown>;
type Page = Parameters<typeof apiCallRaw>[0];

interface PortalList<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
interface OrderRow extends Row {
  id: number;
  order_no: string;
  customer_id: number;
  balance_amount: string;
}

const sessions: Awaited<ReturnType<typeof loginInIsolatedContext>>[] = [];
const userIds: number[] = [];
const customerIds: number[] = [];
const orderIds: number[] = [];
const FORBIDDEN_KEYS = [
  'approval_reason',
  'rejected_reason',
  'approved_by',
  'reject_reason',
  'creator_name',
  'created_by',
  'dept_id',
  'warehouse_id',
  'bank_account',
  'check_no',
  'confirmed_by',
  'cost_price',
  'standard_cost',
  'purchase_price',
  'supplier_price',
  'gross_profit',
  'profit_margin',
];

function positiveId(id: unknown, subject: string): number {
  const num = Number(id);
  expect(Number.isSafeInteger(num) && num > 0, `${subject} 应返回正整数 id`).toBe(true);
  return num;
}

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
}

function expectNoForbiddenKeys(payload: unknown, label: string): void {
  const keys = new Set<string>();
  collectKeys(payload, keys);
  for (const key of FORBIDDEN_KEYS) {
    expect(keys.has(key), `${label} 响应体不得含 ${key}`).toBe(false);
  }
}

async function createCustomer(admin: Page, tag: string): Promise<number> {
  const row = await apiCallRaw<Row>(admin, 'POST', '/crm/customers', {
    customer_name: `门户客户${tag}`,
    customer_type: 'wholesale',
    status: 'active',
    credit_limit: '1000',
  });
  return positiveId(row.id, `门户客户${tag} 建档`);
}

async function createOrder(
  admin: Page,
  customerId: number,
  productId: number,
  tag: string
): Promise<OrderRow> {
  const row = await apiCallRaw<Row>(admin, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [{ product_id: productId, quantity: 3, unit_price: '30.00' }],
    remarks: `门户链路 ${tag}`,
  });
  const orderNo = String(row.order_no ?? '');
  expect(orderNo.length > 0, `门户链路 ${tag} 建单应返回 order_no`).toBe(true);
  return {
    id: positiveId(row.id, '销售建单'),
    order_no: orderNo,
    customer_id: customerId,
    balance_amount: String(row.balance_amount ?? ''),
  };
}

async function findRoleId(admin: Page, code: string): Promise<number> {
  const resp = await apiCallRaw<{ roles?: Array<Row & { code?: string }> }>(
    admin,
    'GET',
    '/roles?page=1&page_size=100'
  );
  expect(Array.isArray(resp.roles), '角色列表必须返回 data.roles').toBe(true);
  const hit = resp.roles!.find(r => r.code === code);
  expect(hit, `${code} 角色应存在——后端种子或 global-setup 幂等补建`).toBeTruthy();
  return positiveId(hit?.id, `${code} 角色行`);
}

async function createUser(
  admin: Page,
  username: string,
  roleId: number,
  customerId?: number
): Promise<number> {
  const body: Row = { username, password: testPassword(), role_id: roleId };
  if (customerId !== undefined) body.customer_id = customerId;
  const row = await apiCallRaw<Row>(admin, 'POST', '/users', body);
  const id = positiveId(row.id, `用户 ${username} 建档`);
  userIds.push(id);
  if (customerId !== undefined) {
    expect(Number(row.customer_id), '用户管理写口回读绑定归属').toBe(customerId);
  }
  return id;
}

test.describe.serial('520 小程序客户门户读面', () => {
  const orderTag = genCode('520OA');
  const orderTagB = genCode('520OB');
  let customerAId = 0;
  let customerBId = 0;
  let orderAId = 0;
  let orderBId = 0;
  let orderATag = '';
  let orderBTag = '';
  const boundUsername = genCode('mp520bound');
  const unboundUsername = genCode('mp520unbound');
  const danglingUsername = genCode('mp520dangling');
  const temporaryUsername = genCode('mp520temp');

  test('造数：双客户双订单，绑定/未绑定/悬空/非 customer 四类账号', async ({ page, browser }) => {
    await ensureTestEntities(page);
    const productId = getCtx().productIds[0];
    expect(productId, 'ensureTestEntities 应备好产品').toBeTruthy();

    customerAId = await createCustomer(page, orderTag.slice(0, 8));
    customerBId = await createCustomer(page, orderTagB.slice(0, 8));
    customerIds.push(customerAId, customerBId);
    const orderA = await createOrder(page, customerAId, productId, orderTag);
    const orderB = await createOrder(page, customerBId, productId, orderTagB);
    orderIds.push(orderA.id, orderB.id);
    orderAId = orderA.id;
    orderBId = orderB.id;
    orderATag = orderA.order_no;
    orderBTag = orderB.order_no;

    const customerRoleId = await findRoleId(page, 'customer');
    await createUser(page, boundUsername, customerRoleId, customerAId);
    await createUser(page, unboundUsername, customerRoleId);

    // 悬空绑定：先建客户并绑定，再由管理员删除客户档案，用户侧保留失效 customer_id。
    const danglingCustomerId = await createCustomer(page, genCode('520D').slice(0, 8));
    await createUser(page, danglingUsername, customerRoleId, danglingCustomerId);
    await apiCallRaw(page, 'DELETE', `/crm/customers/${danglingCustomerId}`);

    const temporaryRoleId = await findRoleId(page, 'temporary');
    await createUser(page, temporaryUsername, temporaryRoleId, customerAId);

    for (const username of [boundUsername, unboundUsername, danglingUsername, temporaryUsername]) {
      sessions.push(await loginInIsolatedContext(browser, username, testPassword()));
    }
  });

  test('绑定 customer 的八类读端点全 200，逐键无内部/成本字段', async () => {
    const session = sessions[0];
    expect(session, '前置造数与绑定测试应已建立绑定客户会话').toBeTruthy();
    const listPaths = [
      '/customer-portal/orders',
      '/customer-portal/sales-orders',
      '/customer-portal/sales-returns',
      '/customer-portal/payments',
      '/customer-portal/reconciliations',
      '/customer-portal/ar-reconciliations',
      '/customer-portal/products',
      '/customer-portal/color-cards',
    ];
    for (const path of listPaths) {
      const list = await apiCallRaw<PortalList<Row>>(
        session.page,
        'GET',
        `${path}?page=1&page_size=10`
      );
      expect(Array.isArray(list.items), `${path} 应返回分页信封 items`).toBe(true);
      expect(Number.isSafeInteger(Number(list.total)), `${path} total 应为整数`).toBe(true);
      expectNoForbiddenKeys(list, path);
      for (const item of list.items) {
        if ('customer_id' in item) {
          expect(Number(item.customer_id), `${path} 不得出现他户行`).toBe(customerAId);
        }
      }
    }

    const detail = await apiCallRaw<Row>(
      session.page,
      'GET',
      `/customer-portal/sales-orders/${orderAId}`
    );
    expect(Number(detail.customer_id), '自有订单详情归属必须是绑定客户').toBe(customerAId);
    expectNoForbiddenKeys(detail, '/customer-portal/sales-orders/{id}');

    const dashboard = await apiCallRaw<Row>(session.page, 'GET', '/customer-portal/dashboard');
    expect(Number(dashboard.order_count), '汇总订单数至少包含本用例订单').toBeGreaterThanOrEqual(1);
    expect(Number(dashboard.in_transit_count), '在途数不得超过订单总数').toBeLessThanOrEqual(
      Number(dashboard.order_count)
    );
    expectNoForbiddenKeys(dashboard, '/customer-portal/dashboard');
  });

  test('跨客户行零可见：他户订单详情 404，列表按他户单号过滤 0 行', async () => {
    const session = sessions[0];
    const detail = await apiCallExpectFail(
      session.page,
      'GET',
      `/customer-portal/sales-orders/${orderBId}`
    );
    expect(detail.status, '非绑定客户订单详情必须 404').toBe(404);

    const filtered = await apiCallRaw<PortalList<OrderRow>>(
      session.page,
      'GET',
      `/customer-portal/orders?order_no=${encodeURIComponent(orderBTag)}`
    );
    expect(filtered.total, '按他户单号过滤必须 0 行').toBe(0);
    expect(filtered.items, '按他户单号过滤 items 必须为空').toHaveLength(0);

    const owned = await apiCallRaw<PortalList<OrderRow>>(
      session.page,
      'GET',
      `/customer-portal/orders?order_no=${encodeURIComponent(orderATag)}`
    );
    expect(owned.total, '自有单号必须命中一行').toBe(1);
    expect(owned.items[0].customer_id, '命中行归属必须是绑定客户').toBe(customerAId);

    const full = await apiCallRaw<PortalList<OrderRow>>(
      session.page,
      'GET',
      '/customer-portal/orders?page=1&page_size=100'
    );
    const sum = full.items.reduce((acc, item) => acc + Number(item.balance_amount), 0);
    const dashboard = await apiCallRaw<Row>(session.page, 'GET', '/customer-portal/dashboard');
    expect(Math.abs(Number(dashboard.receivable_balance) - sum) < 0.01).toBe(true);
  });

  test('未绑定、悬空绑定、非 customer 角色一律 403，内部读面仍 403', async () => {
    const paths = [
      '/customer-portal/orders?page=1&page_size=10',
      '/customer-portal/sales-orders?page=1&page_size=10',
      '/customer-portal/sales-returns?page=1&page_size=10',
      '/customer-portal/payments?page=1&page_size=10',
      '/customer-portal/reconciliations?page=1&page_size=10',
      '/customer-portal/products?page=1&page_size=10',
      '/customer-portal/color-cards?page=1&page_size=10',
      '/customer-portal/dashboard',
    ];
    const unbound = await apiCallExpectFail(sessions[1].page, 'GET', paths[0]);
    expect(unbound.status, '未绑定账号必须 403（fail-closed）').toBe(403);
    // 403 家族外显固定为脱敏常量（防探测账号绑定状态），业务细节只进服务端日志。
    expect(unbound.message, '未绑定拒绝外显为固定脱敏文案').toBe('无权限');
    expect(unbound.message, '外显不得泄露绑定状态').not.toContain('未绑定');

    const dangling = await apiCallExpectFail(sessions[2].page, 'GET', paths[0]);
    expect(dangling.status, '悬空绑定必须 403').toBe(403);
    expect(dangling.message, '悬空绑定拒绝外显为固定脱敏文案').toBe('无权限');
    expect(dangling.message, '外显不得泄露档案失效状态').not.toContain('失效');

    const temporary = await apiCallExpectFail(sessions[3].page, 'GET', paths[0]);
    expect(temporary.status, '已绑定但非 customer 角色必须 403').toBe(403);
    expect(temporary.message, '角色硬门外显为固定脱敏文案').toBe('无权限');
    expect(temporary.message, '外显不得点名角色要求').not.toContain('customer');

    for (const path of paths.slice(1)) {
      expect(
        (await apiCallExpectFail(sessions[1].page, 'GET', path)).status,
        `${path} 未绑定 403`
      ).toBe(403);
    }

    const internal = await apiCallExpectFail(sessions[0].page, 'GET', '/sales/orders');
    expect(internal.status, 'customer 访问内部销售订单仍应 403').toBe(403);
  });

  test.afterAll(async ({ browser }) => {
    for (const session of sessions) await session.close();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await loginViaUI(page, undefined, undefined, true);
      for (const id of orderIds) await apiCallRaw(page, 'DELETE', `/sales/orders/${id}`);
      for (const id of userIds) await apiCallRaw(page, 'DELETE', `/users/${id}`);
      for (const id of customerIds) await apiCallRaw(page, 'DELETE', `/crm/customers/${id}`);
    } finally {
      await context.close();
    }
  });
});
