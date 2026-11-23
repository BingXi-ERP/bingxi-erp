// 4.14 搜索×权限叠加 E2E — enhanced/605-customer-keyword-scope-isolation
// 功能：客户列表带 keyword 搜索时，结果集仍受 data_scope 行级隔离约束——业务员只命中
//   自己归属的客户，不能通过搜索绕开数据隔离（4.14 原文口径）。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入，
//   业务员会话由本 spec 自建独立 BrowserContext。
// 入参：无外部入参；客户名与编码均自建唯一前缀片段，避免与共享数据撞名。
// 传给谁：POST /crm/customers 建档（admin 与 salesperson 各一条，owner_id 分别落建档人）→
//   GET /crm/customers?keyword=<前缀>&page=1&page_size=50 双身份对照取列表 →
//   DELETE /crm/customers/{id} 清理。
// 存什么：customers 两行，各带独有 customer_code 与含同一前缀的 customer_name。
// 存哪里：customers 表。
// 与既有覆盖的边界（不重复也不缺口）：
//   role-idor-sales-and-customers.spec.ts 已钉「无 keyword」维度（salesperson 列表不含
//   admin 客户行、按 ID GET 403 无权限）；data-scope-isolation.spec.ts self-05 已钉
//   leads 域的搜索×隔离。本 spec 补客户域 keyword 维度：salesperson 带 keyword 搜索
//   仍看不到 admin 归属的私有客户行。
// 反假绿设计（三向对照）：
//   ① admin(all scope) 带 keyword 必须同时命中两行——证明 keyword 通道工作、两行确实
//     在库、前缀可匹配；缺此对照时"业务员搜不到"可能只是 keyword 断裂或行不存在的假绿。
//   ② salesperson(self) 带 keyword 必须命中自己建的行——证明其搜索通道有效、会话真实，
//     负例不是空会话假绿。
//   ③ 核心负例：同一搜索结果不得含 admin 归属的行——搜索只收紧结果集、不绕过隔离。
// 前置约束：salesperson 由 global-setup SEED 持 customers:read/create（global-setup.ts:717/725），
//   且其权限闭合等于 SHELL+清单（后端同名角色矩阵不会带入），缺键即 RBAC 403 判红。
import { test, expect, type Browser } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import { apiCallRaw, genCode, tryCleanup, getRoleCredential, BASE_URL } from '../flow/helpers';

interface CustomerRow {
  id: number;
  customer_name: string;
}

interface CustomerPage {
  items: CustomerRow[];
  total: number;
}

/**
 * 客户分页出参的列表数组定位：唯一信封 PaginatedResponse{items,total,page,page_size}。
 * 取不到 items 数组就点名载荷判红——兜底成空数组会把契约漂移伪装成"该行不可见"，
 * 让隔离与可见断言同时失去检测力。
 */
function customerRows(payload: CustomerPage, who: string): CustomerRow[] {
  expect(
    Array.isArray(payload.items),
    `${who} 的 /crm/customers 出参缺 items 数组键，实际载荷 ${JSON.stringify(payload)}`
  ).toBe(true);
  return payload.items;
}

/**
 * 以指定角色登录并建一条客户，返回客户 ID 与客户名。
 * 使用独立 BrowserContext（storageState 显式置空）保证身份隔离——不置空会继承
 * playwright.config.ts use.storageState 的分片主账号 cookie，"业务员"请求实际带
 * admin 身份，隔离断言被伪造成同一身份假绿。
 */
async function loginRoleAndCreateCustomer(
  browser: Browser,
  role: string,
  prefix: string
): Promise<{
  context: import('@playwright/test').BrowserContext;
  page: import('@playwright/test').Page;
  userId: number;
  customerId: number;
  customerName: string;
}> {
  const cred = getRoleCredential(role);
  // global-setup ensureRoleUsers 必须保证角色凭证就绪；缺失属 setup 缺陷，判红不 skip 掩盖
  if (!cred) {
    throw new Error(
      `角色 ${role} 凭证不存在——global-setup ensureRoleUsers 未正确执行，属 setup 缺陷判红`
    );
  }
  // 角色账号初始密码是 ensureRoleUsers 的 DEFAULT_ROLE_PASSWORD，必须取 cred.password
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
  });
  await applyAuthMocks(context, { username: cred.username, password: cred.password });
  const page = await context.newPage();

  const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');

  const tag = genCode('C605');
  const customerName = `${prefix}-${tag}`;
  const created = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_code: `C${tag}`,
    customer_name: customerName,
    contact_person: `联系人-${tag}`,
    contact_phone: `139${String(Date.now()).slice(-8)}`,
    customer_type: 'retail',
    status: 'active',
  });
  if (!(Number.isSafeInteger(created.id) && created.id > 0)) {
    await context.close();
    throw new Error(`建客户失败：${JSON.stringify(created)}`);
  }

  return { context, page, userId: me.id, customerId: created.id, customerName };
}

test.describe('客户列表 keyword × 行级数据权限叠加（4.14）', () => {
  test('605-01 业务员带 keyword 搜索只命中自己客户，搜不到他人归属的客户行', async ({
    page,
    browser,
  }) => {
    // salesperson(self scope) 建归属行；admin(all scope，主测试 page) 建对照行。
    // 两条 customer_name 共用同一前缀，keyword=前缀 时对 admin 应双双命中。
    const prefix = 'E2E-SKW-605';
    const sales = await loginRoleAndCreateCustomer(browser, 'salesperson', prefix);
    const adminTag = genCode('C605');
    const adminCustomerName = `${prefix}-${adminTag}`;
    const adminCreated = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
      customer_code: `C${adminTag}`,
      customer_name: adminCustomerName,
      contact_person: `联系人-${adminTag}`,
      contact_phone: `139${String(Date.now()).slice(-8)}`,
      customer_type: 'retail',
      status: 'active',
    });
    expect(
      Number.isSafeInteger(adminCreated.id) && adminCreated.id > 0,
      `admin 建对照客户失败：${JSON.stringify(adminCreated)}`
    ).toBe(true);

    try {
      const adminMe = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
      // 前提：两个身份必须是不同 user_id，否则"他人归属行"不成立
      expect(
        sales.userId,
        `admin(${adminMe.id}) 与 salesperson(${sales.userId}) 必须为不同用户`
      ).not.toBe(adminMe.id);

      const kw = encodeURIComponent(prefix);

      // 正向对照①：admin(all scope) 带 keyword 应同时命中两行——证明 keyword 通道有效、
      // 两行确实在库、前缀可匹配。缺此对照时负例可能是行不存在或搜索断裂的假绿。
      const adminList = await apiCallRaw<CustomerPage>(
        page,
        'GET',
        `/crm/customers?keyword=${kw}&page=1&page_size=50`
      );
      const adminItems = customerRows(adminList, 'admin keyword 正向对照');
      expect(
        adminItems.some(r => r.id === adminCreated.id),
        `admin(all scope) 带 keyword=${prefix} 应命中自己归属的客户行 ${adminCreated.id}`
      ).toBe(true);
      expect(
        adminItems.some(r => r.id === sales.customerId),
        `admin(all scope) 带 keyword=${prefix} 应命中 salesperson 归属的客户行 ${sales.customerId}（证明行在库且前缀可匹配）`
      ).toBe(true);

      // 核心负例③：salesperson(self) 带同一 keyword——必须命中自己的行（负例不是空会话
      // 假绿，②），同时不得含 admin 归属的行（搜索只收紧结果集、不绕开 data_scope 隔离）。
      const salesList = await apiCallRaw<CustomerPage>(
        sales.page,
        'GET',
        `/crm/customers?keyword=${kw}&page=1&page_size=50`
      );
      const salesItems = customerRows(salesList, 'salesperson keyword 隔离');
      expect(
        salesItems.some(r => r.id === sales.customerId),
        `salesperson(self) 带 keyword=${prefix} 应命中自己归属的客户行 ${sales.customerId}（证明搜索通道有效）`
      ).toBe(true);
      expect(
        salesItems.some(r => r.id === adminCreated.id),
        `salesperson(self) 带 keyword=${prefix} 不应看到 admin 归属的客户行 ${adminCreated.id}——搜索不得绕开 data_scope 隔离`
      ).toBe(false);

      // 钉真实业务列：命中的自有行 customer_name 必须与建单入参逐字符相同，防止行内
      // 列串位或空壳行蒙过断言。
      const ownRow = salesItems.find(r => r.id === sales.customerId);
      expect(
        ownRow!.customer_name,
        `salesperson 命中行的 customer_name 应等于建单入参，实际=${JSON.stringify(
          ownRow!.customer_name
        )}`
      ).toBe(sales.customerName);
    } finally {
      await tryCleanup(page, 'DELETE', `/crm/customers/${adminCreated.id}`, '605 客户(admin)');
      await tryCleanup(
        sales.page,
        'DELETE',
        `/crm/customers/${sales.customerId}`,
        '605 客户(salesperson)'
      );
      await sales.context.close();
    }
  });
});
