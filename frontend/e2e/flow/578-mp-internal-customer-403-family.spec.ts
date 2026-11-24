// 小程序内部面 customer 403 家族回归 — 内部 ERP 读接口对 customer 角色逐端点 fail-closed
// 功能：绑定客户的 customer 账号命中内部业务读端点（商品/销售/应收/CRM/用户/角色/
//       公司档案/通知）必须被 RBAC 权限门整族拒绝（403 + FORBIDDEN 机器码）。
//       仪表板是每个角色都有的应用外壳权限，不作为内部业务拒绝面。
//       权限键由 URL 段派生（middleware/permission.rs seg3/seg4），customer 角色不含任何
//       内部键；fail-closed 判据 = 403 且 code 归因到权限门机器码，不接受 CSRF 中间态
//       403（expectDenied 内置假绿拦截）。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 flow 其它用例共享后端账号池。
// 入参：无测试参数；前置由管理员会话执行 ensureTestEntities + customer 角色绑定账号。
// 传给谁：apiCallExpectFail 走统一信封与 CSRF 恢复 helper，expectDenied 归因权限机器码。
// 存什么：逐端点 403 状态码与错误 code 断言；不落库。
// 存哪里：Actions 日志与 Playwright 报告。
import { test, expect } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectDenied,
  genCode,
  getCtx,
  loginInIsolatedContext,
  testPassword,
} from './helpers';

type Row = Record<string, unknown>;
type Page = Parameters<typeof apiCallRaw>[0];

function positiveId(id: unknown, subject: string): number {
  const num = Number(id);
  expect(Number.isSafeInteger(num) && num > 0, `${subject} 应返回正整数 id`).toBe(true);
  return num;
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

test.describe.serial('578 小程序内部面 customer 403 家族回归', () => {
  const customerTag = genCode('578CA');
  const boundUsername = genCode('mp578bound');
  const sessions: Awaited<ReturnType<typeof loginInIsolatedContext>>[] = [];
  const userIds: number[] = [];
  const customerIds: number[] = [];
  let productId = 0;
  let orderId = 0;
  let customerId = 0;

  test('造数：客户档案 + 销售订单，绑定 customer 账号', async ({ page, browser }) => {
    await ensureTestEntities(page);
    productId = getCtx().productIds[0];
    expect(productId, 'ensureTestEntities 应备好产品').toBeTruthy();

    const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `内部面回归客户${customerTag}`,
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '1000',
    });
    customerId = positiveId(created.id, '内部面回归客户建档');
    customerIds.push(customerId);

    const order = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      items: [{ product_id: productId, quantity: 3, unit_price: '30.00' }],
      remarks: `内部面 403 回归 ${customerTag}`,
    });
    orderId = positiveId(order.id, '销售建单');

    const customerRoleId = await findRoleId(page, 'customer');
    const user = await apiCallRaw<Row>(page, 'POST', '/users', {
      username: boundUsername,
      password: testPassword(),
      role_id: customerRoleId,
      customer_id: customerId,
    });
    const userId = positiveId(user.id, '绑定 customer 账号建档');
    userIds.push(userId);
    expect(Number(user.customer_id), '用户管理写口回读绑定归属').toBe(customerId);

    sessions.push(await loginInIsolatedContext(browser, boundUsername, testPassword()));
    const session = sessions[0];
    // 会话有效性哨兵：绑定客户必须能读自己的门户面，证明 403 来自权限门而非登录态损坏
    const dash = await apiCallRaw<Row>(session.page, 'GET', '/customer-portal/dashboard');
    expect(dash, '绑定 customer 门户 dashboard 应 200（哨兵）').toBeTruthy();
  });

  test('customer 会话打内部读面家族逐端点 403，code 归因权限门', async () => {
    const session = sessions[0];
    expect(session, '前置造数测试应已建立绑定客户会话').toBeTruthy();

    // 逐端点 fail-closed 断言：家族 = 小程序内部服务层真实调用的读面
    // （research-53 报告第一节 A 族清单去重；每条都是 customer 无 RBAC 键的资源）
    const family: Array<{ path: string; why: string }> = [
      { path: '/products?page=1&page_size=10', why: '商品列表（ServicesCard 色卡/选品腿）' },
      { path: `/products/${productId}`, why: '商品详情' },
      { path: `/search/products?keyword=${encodeURIComponent(customerTag)}`, why: '商品搜索' },
      { path: `/sales/orders/${orderId}`, why: '销售订单详情' },
      { path: '/sales/sales-returns?page=1&page_size=10', why: '销售退货列表' },
      { path: '/ar/payments?page=1&page_size=10', why: '应收收款列表' },
      { path: '/ar-reconciliations?page=1&page_size=10', why: '应收对账单列表' },
      { path: '/crm/customers?page=1&page_size=10', why: '客户档案列表' },
      { path: `/crm/customers/${customerId}`, why: '客户档案详情' },
      { path: '/users?page=1&page_size=10', why: '用户管理列表' },
      { path: '/roles?page=1&page_size=100', why: '角色列表' },
      { path: '/company-profile/full', why: '公司档案全量' },
      { path: '/notifications/unread-count', why: '通知未读数' },
    ];
    expect(family.length, '家族清单不得被静默截断').toBe(13);
    for (const item of family) {
      const denied = await apiCallExpectFail(session.page, 'GET', item.path);
      expectDenied(denied, `customer 打内部面 ${item.path}（${item.why}）`);
    }

    for (const path of ['/dashboard/overview', '/dashboard/sales-stats']) {
      const overview = await apiCallRaw<Row>(session.page, 'GET', path);
      expect(Object.keys(overview).length, `应用外壳 ${path} 应返回非空对象`).toBeGreaterThan(0);
    }
  });

  test.afterAll(async () => {
    // 账号/客户档案保留不清理：与其他 flow 分片一致，账号池档案由运行环境统一回收，
    // 物理删用户会破坏审计链；此处只显式关闭隔离会话释放浏览器上下文
    for (const session of sessions) {
      await session.close();
    }
  });
});
