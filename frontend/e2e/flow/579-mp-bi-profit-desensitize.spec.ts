// 小程序 BI 利润面脱敏钉子 — /bi/sales/profit 两腿断言
// 功能腿 1：customer 会话打 /bi/sales/profit（不属客户门户路径族）必须被 RBAC 权限门拒绝
//           （403 + FORBIDDEN 机器码，expectDenied 假绿拦截）。
// 功能腿 2：普通授权角色（授予 bi-analysis:read）读取同一端点，默认不含成本/利润键；
//           逐字段授予可读权限后对应键出现，撤销单字段权限后仅该键消失。
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
type FieldPermissionRow = Row & {
  id?: number;
  role_id?: number;
  resource_type?: string;
  field_name?: string;
  can_read?: boolean;
  is_enabled?: boolean;
};

const sensitiveFields = ['total_cost', 'total_profit', 'gross_margin'] as const;

function analysisFrom(payload: Row): Row {
  const analysis = payload.data;
  expect(
    analysis && typeof analysis === 'object' && !Array.isArray(analysis),
    '利润接口必须返回 BiResponse.data 聚合对象'
  ).toBe(true);
  return analysis as Row;
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
  const fieldPermissionIds = new Set<number>();
  let adminPage: Page | undefined;
  let customerId = 0;
  let biRoleId = 0;
  let totalCostPermissionId = 0;

  test('造数：customer 绑定账号 + bi-analysis 授权角色账号', async ({ page, browser }) => {
    adminPage = page;
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
    biRoleId = roleId;
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

  test('腿2：利润字段默认脱敏，逐字段授权与撤销只影响对应键', async ({ page }) => {
    const biSession = sessions[1];
    expect(biSession, '前置造数应已建立授权会话').toBeTruthy();

    const defaultPayload = await apiCallRaw<Row>(biSession.page, 'GET', '/bi/sales/profit');
    const defaultAnalysis = analysisFrom(defaultPayload);
    expect(
      Object.keys(defaultAnalysis).length,
      '面级授权必须返回非空聚合行，不能恒空假绿'
    ).toBeGreaterThan(0);
    const revenue = defaultAnalysis.total_revenue;
    expect(
      typeof revenue === 'number' && Number.isFinite(revenue),
      '非敏感收入字段必须可达且为有限数值'
    ).toBe(true);
    for (const field of sensitiveFields) {
      expect(Object.hasOwn(defaultAnalysis, field), `未授权字段 ${field} 不得出现在响应中`).toBe(
        false
      );
    }

    for (const field of sensitiveFields) {
      const permission = await apiCallRaw<FieldPermissionRow>(page, 'POST', '/field-permissions', {
        role_id: biRoleId,
        resource_type: 'bi-analysis',
        field_name: field,
        can_read: true,
        can_write: false,
        mask_strategy: 'NONE',
      });
      const permissionId = positiveId(permission.id, `${field} 字段权限建档`);
      fieldPermissionIds.add(permissionId);
      expect(permission.role_id, `${field} 字段权限必须绑定 scratch 角色`).toBe(biRoleId);
      expect(permission.resource_type, `${field} 字段权限资源类型必须为 bi-analysis`).toBe(
        'bi-analysis'
      );
      expect(permission.field_name, `${field} 字段权限字段名必须逐字回读`).toBe(field);
      expect(permission.can_read, `${field} 字段权限必须可读`).toBe(true);
      expect(permission.is_enabled, `${field} 字段权限建档后必须启用`).toBe(true);
      if (field === 'total_cost') totalCostPermissionId = permissionId;
    }

    const permissions = await apiCallRaw<FieldPermissionRow[]>(
      page,
      'GET',
      `/field-permissions?role_id=${biRoleId}&resource_type=bi-analysis`
    );
    expect(Array.isArray(permissions), '字段权限列表必须返回裸数组').toBe(true);
    for (const field of sensitiveFields) {
      const matches = permissions.filter(
        item => item.role_id === biRoleId && item.field_name === field
      );
      expect(matches, `${field} 字段权限必须可从列表回读`).toHaveLength(1);
      expect(matches[0].can_read, `${field} 字段权限回读必须可读`).toBe(true);
    }

    const grantedAnalysis = analysisFrom(
      await apiCallRaw<Row>(biSession.page, 'GET', '/bi/sales/profit')
    );
    for (const field of sensitiveFields) {
      expect(Object.hasOwn(grantedAnalysis, field), `授权字段 ${field} 必须出现在响应中`).toBe(
        true
      );
      const value = grantedAnalysis[field];
      expect(
        typeof value === 'number' && Number.isFinite(value),
        `授权字段 ${field} 必须是有限数值`
      ).toBe(true);
    }

    expect(totalCostPermissionId, '成本字段权限 id 必须已记录').toBeGreaterThan(0);
    await apiCallRaw(page, 'DELETE', `/field-permissions/${totalCostPermissionId}`);
    fieldPermissionIds.delete(totalCostPermissionId);

    const afterRevoke = await apiCallRaw<FieldPermissionRow[]>(
      page,
      'GET',
      `/field-permissions?role_id=${biRoleId}&resource_type=bi-analysis`
    );
    expect(
      afterRevoke.find(item => item.id === totalCostPermissionId)?.is_enabled,
      '撤销后的成本字段权限必须保留记录但处于禁用状态'
    ).toBe(false);

    const revokedAnalysis = analysisFrom(
      await apiCallRaw<Row>(biSession.page, 'GET', '/bi/sales/profit')
    );
    expect(Object.hasOwn(revokedAnalysis, 'total_cost'), '撤销成本字段权限后仅成本键必须消失').toBe(
      false
    );
    for (const field of ['total_profit', 'gross_margin'] as const) {
      expect(Object.hasOwn(revokedAnalysis, field), `撤销成本权限不得误伤 ${field}`).toBe(true);
      const value = revokedAnalysis[field];
      expect(
        typeof value === 'number' && Number.isFinite(value),
        `保留授权字段 ${field} 必须仍为有限数值`
      ).toBe(true);
    }
  });

  test.afterAll(async () => {
    if (adminPage) {
      for (const permissionId of fieldPermissionIds) {
        await apiCallRaw(adminPage, 'DELETE', `/field-permissions/${permissionId}`);
      }
    }
    for (const session of sessions) {
      await session.close();
    }
  });
});
