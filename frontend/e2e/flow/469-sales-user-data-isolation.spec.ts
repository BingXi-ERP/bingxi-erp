import { test, expect } from '../diagnose-fixture';
import {
  apiCallRaw,
  apiCallExpectFail,
  expectDenied,
  genCode,
  loginInIsolatedContext,
  loginViaUI,
  testPassword,
  tryCleanup,
} from './helpers';

/**
 * 两个同为 sales_rep/self 的独立账号，分别持有私海客户与报价草稿。
 * role.rs 无条件补建 sales_rep；global-setup 为每个角色只写一份凭证，故不假设有第二份
 * 业务员凭证，而由本 worker 管理员创建两个同角色账号，不创建角色、不追加授权。
 * quotations 的读写门均为 get_by_id_scoped，跨 sales_user_id 固定 403/FORBIDDEN。
 * /crm/customers 实际挂 customer_handler，操作 customers.owner_id，不是 CRM 线索兼容 handler。
 * sales_rep 无 customers:update/products:read：客户写腿仅验证 RBAC 拒绝及零漂移，
 * 产品腿仅验证不可读，不把它们的 403 冒称为行级写门或产品成本掩码覆盖。
 * 报价 DTO 本身没有成本/底价键，详情和列表递归检查键集（包括明细）。
 * 报价无 DELETE 路由；产品被报价明细外键引用，随单留库。客户软删、账号停用、会话关闭。
 */

type Page = Parameters<typeof apiCallRaw>[0];
type Browser = Parameters<typeof loginInIsolatedContext>[0];
type Session = Awaited<ReturnType<typeof loginInIsolatedContext>>;
type Row = Record<string, unknown>;
type Customer = Row & { id: number; owner_id: number; customer_name: string };
type Quotation = Row & {
  id: number;
  quotation_no: string;
  sales_user_id: number;
  customer_id: number;
  status: string;
  items: Array<Row & { product_id: number; unit_price: string }>;
};
type Actor = {
  id: number;
  session: Session;
  customer: Customer;
  quotation: Quotation;
};
type Setup = { a: Actor; b: Actor; marker: string; productId: number };

const COST_PRICE = 29.37;
const UNIT_PRICE = '83.40';
const sessions: Session[] = [];
const userIds: number[] = [];
const customerIds: number[] = [];

function positiveId(id: number, subject: string): number {
  expect(Number.isSafeInteger(id), `${subject} 必须返回整数 id`).toBe(true);
  expect(id, `${subject} 必须返回正数 id`).toBeGreaterThan(0);
  return id;
}

async function createActor(
  admin: Page,
  browser: Browser,
  roleId: number,
  marker: string,
  label: string,
  productId: number,
  unit: string
): Promise<Actor> {
  const username = `${marker}_${label}`.toLowerCase();
  const password = testPassword();
  const user = await apiCallRaw<{ id: number; role_id: number }>(admin, 'POST', '/users', {
    username,
    password,
    role_id: roleId,
  });
  const id = positiveId(user.id, `业务员 ${label}`);
  userIds.push(id);
  expect(user.role_id, '两个账号必须使用相同的真实 sales_rep 角色').toBe(roleId);
  const session = await loginInIsolatedContext(browser, username, password);
  sessions.push(session);
  const identity = await apiCallRaw<{ id: number; username: string }>(
    session.page,
    'GET',
    '/auth/me'
  );
  expect(identity.id, '隔离会话必须属于新建业务员，不能继承管理员身份').toBe(id);
  expect(identity.username).toBe(username);

  const customer = await apiCallRaw<Customer>(session.page, 'POST', '/crm/customers', {
    customer_name: `${marker}-${label}`,
    customer_type: 'other',
    notes: `${marker}-${label}-private`,
  });
  customerIds.push(positiveId(customer.id, `业务员 ${label} 客户`));
  expect(customer.owner_id, '客户必须落在当前业务员私海，不能误用 created_by 或公海行').toBe(id);
  const ownCustomer = await apiCallRaw<Customer>(
    session.page,
    'GET',
    `/crm/customers/${customer.id}`
  );
  expect(ownCustomer.id, '同端点先读本人客户成功，排除 customers:read 缺授').toBe(customer.id);
  expect(ownCustomer.owner_id).toBe(id);

  const quotation = await apiCallRaw<Quotation>(session.page, 'POST', '/quotations', {
    customer_id: customer.id,
    sales_user_id: id,
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: true,
    tax_rate: '0',
    notes: `${marker}-${label}-draft`,
    items: [
      {
        product_id: productId,
        unit,
        quantity: '1',
        unit_price: UNIT_PRICE,
        unit_price_with_tax: UNIT_PRICE,
      },
    ],
  });
  positiveId(quotation.id, `业务员 ${label} 报价`);
  const ownQuotation = await apiCallRaw<Quotation>(
    session.page,
    'GET',
    `/quotations/${quotation.id}`
  );
  expect(ownQuotation.sales_user_id).toBe(id);
  expect(ownQuotation.customer_id).toBe(customer.id);
  expect(ownQuotation.status).toBe('draft');
  expect(ownQuotation.quotation_no).toEqual(expect.any(String));
  expect(ownQuotation.quotation_no.length).toBeGreaterThan(0);
  console.info(
    `[469] ${label} 前置就绪 user=${id} customer=${customer.id} quotation=${quotation.id}`
  );
  return { id, session, customer: ownCustomer, quotation: ownQuotation };
}

async function prepare(admin: Page, browser: Browser): Promise<Setup> {
  const roles = await apiCallRaw<{
    roles: Array<{ id: number; code: string }>;
  }>(admin, 'GET', '/roles');
  expect(Array.isArray(roles.roles), '角色列表契约必须为 data.roles').toBe(true);
  const role = roles.roles.find(row => row.code === 'sales_rep');
  if (!role) {
    throw new Error('469 前置失败：初始化未补建 sales_rep，不能用 admin 或只读 salesperson 代替');
  }
  positiveId(role.id, 'sales_rep 角色');
  // RoleResponse 列表不含 data_scope，必须读 RoleDetailResponse，不能伪造列表字段。
  const roleDetail = await apiCallRaw<{ data_scope: string }>(admin, 'GET', `/roles/${role.id}`);
  expect(roleDetail.data_scope, '普通业务员必须是 self，不能以 all/dept 绕过被测边界').toBe('self');

  const marker = genCode('E469');
  const product = await apiCallRaw<{ id: number }>(admin, 'POST', '/products', {
    code: genCode('E469P'),
    name: `${marker}-cost-sentinel`,
    product_type: '辅料',
    unit: '米',
    standard_price: UNIT_PRICE,
    cost_price: String(COST_PRICE),
  });
  const productId = positiveId(product.id, '报价产品');
  const productDetail = await apiCallRaw<{ unit: string; cost_price: string }>(
    admin,
    'GET',
    `/products/${productId}`
  );
  expect(productDetail.unit).toEqual(expect.any(String));
  expect(productDetail.unit.length).toBeGreaterThan(0);
  expect(
    Number(productDetail.cost_price),
    '管理员先证实产品真实持有非空成本，避免以空成本伪证脱敏'
  ).toBe(COST_PRICE);
  const a = await createActor(admin, browser, role.id, marker, 'A', productId, productDetail.unit);
  const b = await createActor(admin, browser, role.id, marker, 'B', productId, productDetail.unit);
  expect(a.id).not.toBe(b.id);
  expect(a.customer.id).not.toBe(b.customer.id);
  expect(a.quotation.id).not.toBe(b.quotation.id);
  return { a, b, marker, productId };
}

function expectNoCostKeys(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => expectNoCostKeys(entry, `${path}[${index}]`));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      expect(
        /cost|floor|bottom|(?:base|minimum|min|purchase)[_-]?price/i.test(key),
        `${path}.${key} 不应向业务员下发成本或底价键，即便值为 null 也不属于报价 DTO 契约`
      ).toBe(false);
      expectNoCostKeys(entry, `${path}.${key}`);
    }
  }
}

test.describe.serial('469 跨业务员报价与客户隔离', () => {
  let setup: Setup;

  test.beforeEach(async ({ page, browser }) => {
    test.setTimeout(180_000);
    await loginViaUI(page);
    setup = await prepare(page, browser);
  });

  test.afterEach(async ({ page }) => {
    for (const session of sessions.splice(0).reverse()) {
      await session.close();
    }
    for (const customerId of customerIds.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, `[469] 客户 ${customerId}`);
    }
    for (const userId of userIds.splice(0).reverse()) {
      const user = await apiCallRaw<{ is_active: boolean }>(page, 'PUT', `/users/${userId}`, {
        status: 'inactive',
      });
      expect(user.is_active, '专用账号保留外键身份但必须停用').toBe(false);
      console.info(`[469] 专用业务员 ${userId} 已停用`);
    }
  });

  test('469-01 同端点本人可读，他人报价与客户固定 403', async () => {
    const { a, b } = setup;
    for (const [reader, owner] of [
      [a, b],
      [b, a],
    ]) {
      const own = await apiCallRaw<Quotation>(
        reader.session.page,
        'GET',
        `/quotations/${reader.quotation.id}`
      );
      expect(own.id).toBe(reader.quotation.id);
      expectDenied(
        await apiCallExpectFail(reader.session.page, 'GET', `/quotations/${owner.quotation.id}`),
        '同角色已能读本人报价，跨 sales_user_id 必须被行级归属门拒绝'
      );
      expectDenied(
        await apiCallExpectFail(reader.session.page, 'GET', `/crm/customers/${owner.customer.id}`),
        '同角色已能读本人私海客户，跨 owner_id 必须被拒绝'
      );
    }
  });

  test('469-02 本人报价可改，跨归属 PUT 拒绝且管理员与归属人回读零漂移', async ({ page }) => {
    const { a, b, marker } = setup;
    const changed = await apiCallRaw<Quotation>(
      a.session.page,
      'PUT',
      `/quotations/${a.quotation.id}`,
      {
        notes: `${marker}-own-write-control`,
      }
    );
    expect(
      changed.notes,
      '相同方法与端点先证明 quotations:update 可达，403 不能由 RBAC 缺授冒充'
    ).toBe(`${marker}-own-write-control`);
    const before = await apiCallRaw<Quotation>(page, 'GET', `/quotations/${b.quotation.id}`);
    const customerBefore = await apiCallRaw<Customer>(
      page,
      'GET',
      `/crm/customers/${b.customer.id}`
    );
    expectDenied(
      await apiCallExpectFail(a.session.page, 'PUT', `/quotations/${b.quotation.id}`, {
        notes: `${marker}-intrusion`,
        sales_user_id: a.id,
      }),
      '越权改单及顺带篡改归属必须在 service.update 前拒绝'
    );
    expect(await apiCallRaw<Quotation>(page, 'GET', `/quotations/${b.quotation.id}`)).toEqual(
      before
    );
    expect(
      await apiCallRaw<Quotation>(b.session.page, 'GET', `/quotations/${b.quotation.id}`)
    ).toEqual(b.quotation);

    // sales_rep 未授 customers:update；本腿只锁 RBAC 写拒绝，不宣称覆盖客户行级写门。
    for (const customer of [a.customer, b.customer]) {
      expectDenied(
        await apiCallExpectFail(a.session.page, 'PUT', `/crm/customers/${customer.id}`, {
          customer_name: `${marker}-forbidden-write`,
        }),
        '普通业务员未获客户更新权，本人和他人客户均不得修改'
      );
    }
    expect(await apiCallRaw<Customer>(page, 'GET', `/crm/customers/${b.customer.id}`)).toEqual(
      customerBefore
    );
    expect(
      await apiCallRaw<Customer>(b.session.page, 'GET', `/crm/customers/${b.customer.id}`)
    ).toEqual(b.customer);
  });

  test('469-03 本人列表非空，精确搜单及伪造 sales_user_id 不能串入他人数据', async ({ page }) => {
    const { a, b, marker } = setup;
    const own = await apiCallRaw<{ list: Quotation[]; total: number }>(
      a.session.page,
      'GET',
      '/quotations?page=1&page_size=100'
    );
    expect(Array.isArray(own.list), '报价列表契约是 data.list，不是 data.items').toBe(true);
    expect(own.list.map(row => row.id)).toEqual([a.quotation.id]);
    expect(own.total).toBe(1);
    expect(own.list.every(row => row.sales_user_id === a.id)).toBe(true);
    const keyword = encodeURIComponent(b.quotation.quotation_no);
    const adminMatch = await apiCallRaw<{ list: Quotation[]; total: number }>(
      page,
      'GET',
      `/quotations?keyword=${keyword}&sales_user_id=${b.id}`
    );
    expect(
      adminMatch.list.map(row => row.id),
      '管理员先证实查询条件确实能命中 B 单'
    ).toEqual([b.quotation.id]);
    expect(adminMatch.total).toBe(1);
    for (const query of [
      `keyword=${keyword}`,
      `sales_user_id=${b.id}`,
      `keyword=${keyword}&sales_user_id=${b.id}`,
    ]) {
      const result = await apiCallRaw<{ list: Quotation[]; total: number }>(
        a.session.page,
        'GET',
        `/quotations?${query}`
      );
      expect(result.list, '外部筛选不得覆盖 apply_data_scope 的 self 约束').toEqual([]);
      expect(result.total, '不得经 total 泄露他人单据数量').toBe(0);
    }
    const customers = await apiCallRaw<{ items: Customer[]; total: number }>(
      a.session.page,
      'GET',
      `/crm/customers?keyword=${encodeURIComponent(marker)}&page_size=100`
    );
    expect(
      customers.items.map(row => row.id),
      '同关键字命中两位业务员的客户时只返回本人私海行'
    ).toEqual([a.customer.id]);
    expect(customers.total).toBe(1);
    for (const path of ['/crm/customers', '/crm/customers/select']) {
      const result = await apiCallRaw<{ items: Customer[]; total: number }>(
        a.session.page,
        'GET',
        `${path}?keyword=${encodeURIComponent(b.customer.customer_name)}`
      );
      expect(result.items, '客户列表与下拉搜索均不能搜到 B 私海客户').toEqual([]);
      expect(result.total).toBe(0);
    }
  });

  test('469-04 报价详情与列表键集无成本底价，产品成本来源对业务员不可读', async () => {
    const { a, productId } = setup;
    const detail = await apiCallRaw<Quotation>(
      a.session.page,
      'GET',
      `/quotations/${a.quotation.id}`
    );
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0].product_id).toBe(productId);
    expect(Number(detail.items[0].unit_price), '公开报价售价仍必须存在，不能以空响应伪证脱敏').toBe(
      Number(UNIT_PRICE)
    );
    expectNoCostKeys(detail, 'quotation.detail');
    const result = await apiCallRaw<{ list: Quotation[]; total: number }>(
      a.session.page,
      'GET',
      `/quotations?keyword=${encodeURIComponent(a.quotation.quotation_no)}`
    );
    expect(result.list.map(row => row.id)).toEqual([a.quotation.id]);
    expect(result.total).toBe(1);
    expectNoCostKeys(result.list, 'quotation.list');
    for (const path of [`/products/${productId}`, '/products?page=1&page_size=100']) {
      expectDenied(
        await apiCallExpectFail(a.session.page, 'GET', path),
        'sales_rep 无 products:read，不能绕到产品详情或列表读取成本来源'
      );
    }
  });
});
