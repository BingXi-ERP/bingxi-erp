// 小程序 BI 利润面脱敏钉子 — /bi/sales/profit 两腿断言
// 功能腿 1：customer 会话打 /bi/sales/profit（不属客户门户路径族）必须被 RBAC 权限门拒绝
//           （403 + FORBIDDEN 机器码，expectDenied 假绿拦截）。
// 功能腿 2：普通授权角色（授予 bi-analysis:read，utils/path_utils.rs:148 ("bi","sales")
//           →"bi-analysis" 派生键）读取同一端点，断言响应聚合行不含成本/利润键
//           （total_cost/total_profit/gross_margin）。
//           ⚠️ 钉子语义：handlers/bi_handler.rs:163-176 对任何过 RBAC 的角色直出
//           ProfitAnalysis 全量字段（services/bi_analysis_ops/types.rs:93-98 静态可证含
//           上述键），本腿红面即"字段级脱敏门缺失"缺陷的运行时证据，后端加字段级门后
//           转绿；本支只钉红不改源码。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 flow 其它用例共享后端账号池。
// 入参：无测试参数；前置由管理员会话造 customer 绑定账号与授权 scratch 角色/用户。
// 传给谁：apiCallExpectFail/apiCallRaw 走统一信封与 CSRF 恢复 helper。
// 存什么：403 归因断言、200 响应体递归键集合断言；不落库。
// 存哪里：Actions 日志与 Playwright 报告。
import { test, expect } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  expectDenied,
  genCode,
  loginInIsolatedContext,
  testPassword,
} from './helpers';

type Row = Record<string, unknown>;
type Page = Parameters<typeof apiCallRaw>[0];

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

test.describe.serial('579 BI 利润面脱敏钉子', () => {
  const customerTag = genCode('579CA');
  const boundUsername = genCode('mp579bound');
  const biUsername = genCode('mp579bi');
  // 角色码无连字符（照抄 481/482 scratch 角色码形态，规避后端角色码形态约束）
  const stamp =
    Date.now().toString().slice(-6) +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
  const biRoleCode = `mp579bi${stamp}`;
  const sessions: Awaited<ReturnType<typeof loginInIsolatedContext>>[] = [];
  let customerId = 0;

  test('造数：customer 绑定账号 + bi-analysis 授权角色账号', async ({ page, browser }) => {
    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `BI 脱敏回归客户${customerTag}`,
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '1000',
    });
    customerId = positiveId(customer.id, 'BI 脱敏回归客户建档');

    const customerRoleId = await findRoleId(page, 'customer');
    const bound = await apiCallRaw<Row>(page, 'POST', '/users', {
      username: boundUsername,
      password: testPassword(),
      role_id: customerRoleId,
      customer_id: customerId,
    });
    expect(Number(bound.customer_id), '绑定归属写口回读').toBe(customerId);

    // scratch 授权角色：仅授予 bi-analysis:read（/bi/sales/* 的派生权限键）
    const role = await apiCallRaw<Row>(page, 'POST', '/roles', {
      name: `BI脱敏回归角色${stamp}`,
      code: biRoleCode,
    });
    const roleId = positiveId(role.id, 'scratch 授权角色建档');
    await apiCallRaw(page, 'POST', `/roles/${roleId}/permissions`, {
      resource_type: 'bi-analysis',
      action: 'read',
      allowed: true,
    });
    const biUser = await apiCallRaw<Row>(page, 'POST', '/users', {
      username: biUsername,
      password: testPassword(),
      role_id: roleId,
    });
    positiveId(biUser.id, 'bi-analysis 授权账号建档');

    sessions.push(await loginInIsolatedContext(browser, boundUsername, testPassword()));
    sessions.push(await loginInIsolatedContext(browser, biUsername, testPassword()));
    expect(sessions.length, '两枚隔离会话就绪').toBe(2);
  });

  test('腿1：customer 会话打 /bi/sales/profit 403 归因权限门', async () => {
    const customerSession = sessions[0];
    expect(customerSession, '前置造数应已建立 customer 会话').toBeTruthy();
    const denied = await apiCallExpectFail(customerSession.page, 'GET', '/bi/sales/profit');
    expectDenied(denied, 'customer 打 /bi/sales/profit（BI 利润面非门户路径族，RBAC fail-closed）');
  });

  test('腿2：bi-analysis 授权角色读 /bi/sales/profit 不得含成本利润键', async () => {
    const biSession = sessions[1];
    expect(biSession, '前置造数应已建立授权会话').toBeTruthy();
    const payload = await apiCallRaw<Row>(biSession.page, 'GET', '/bi/sales/profit');
    // BiResponse 聚合行必须真实可达（面级授权生效），否则腿2退化为恒真空转
    const analysis = (payload as { data?: Row }).data?.data as Row | undefined;
    expect(
      analysis,
      '授权角色读 /bi/sales/profit 应返回聚合行（BiResponse.data.data）'
    ).toBeTruthy();
    expect(
      Array.isArray(Object.keys(analysis!)) && Object.keys(analysis!).length > 0,
      '聚合行不得为空对象（面级可达哨兵）'
    ).toBe(true);

    const keys = new Set<string>();
    collectKeys(payload, keys);
    // 字段级脱敏钉子：成本/利润键对授权角色也不可下发。
    // ⚠️ 静态实锤（handlers/bi_handler.rs:163-176 + bi_analysis_ops/types.rs:93-98）：
    //   ProfitAnalysis 序列化恒含这三键、无字段级门 —— 本断言在 CI 将红，
    //   红面即缺陷证据（登记功能缺失），后端补字段级门后转绿。
    for (const key of ['total_cost', 'total_profit', 'gross_margin']) {
      expect(keys.has(key), `/bi/sales/profit 响应体不得含成本利润键 ${key}`).toBe(false);
    }
  });

  test.afterAll(async () => {
    for (const session of sessions) {
      await session.close();
    }
  });
});
