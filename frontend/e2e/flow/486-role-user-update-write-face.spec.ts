// 功能：角色与用户「改」两个写口的真实落库回读链，外加管理员门与角色编码不可改两条安全判据。
// 调用方：Playwright flow 分片。入参：无（前置在每例内自建）。
// 传给谁：PUT /roles/{id} 与 PUT /users/{id} 两个端点，回读走 GET /roles/{id} 与 GET /users/{id}。
// 存什么：自建 scratch 角色与 scratch 用户，例末删除。存哪里：roles 与 users 两表。
//
// 判据来源：UpdateRolePayload 只有 name description is_system 三列，刻意不含 code（禁止改角色编码防提权），
// 故本用例提交 code 后回读 code 必须逐字符不变；UpdateUserRequest 五列皆为 Option，
// 键缺席即保持旧值、带值即覆盖，不存在第三态；两个 handler 都先过 require_admin_role，
// 非管理员会话拿到 403 且目标行不得被改动。403 的出参 message 由错误层统一换成脱敏常量，
// handler 传入的自定义详情只写日志，所以越权腿钉 HTTP 状态与机器码，不钉文案。
// 详情的 department_name 与 role_names 由单次 LEFT JOIN 富化（UserResponse 的 From<Model> 带不出这两列），
// 故改角色后读回的角色名必须跟着新归属走。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  baseAdminPassword,
  failureCode,
  loginInIsolatedContext,
  loginViaUI,
  tryCleanup,
} from './helpers';

interface RoleDetailRow {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_system: boolean;
  data_scope: string;
}

interface UserRow {
  id: number;
  username: string;
  email: string | null;
  phone: string | null;
  role_id: number | null;
  is_active: boolean;
  role_names: string[];
}

const ABSENT_PROBE_ID = 99999999;

/** 唯一戳：避免并行分片与重跑之间撞名，撞名会把建号失败伪装成断言失败 */
function stamp(): string {
  return `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
}

/**
 * 功能：自建一个非内置 scratch 角色并 GET 回读确认。入参：page 管理员会话、tag 用例标识。
 * 传给谁：POST /roles 建号，GET /roles/{id} 回读。存什么：roles 一行。存哪里：roles 表。
 */
async function createScratchRole(page: Page, tag: string): Promise<RoleDetailRow> {
  const s = stamp();
  const code = `e2eru${tag}${s}`;
  const name = `E2E改口角色${tag}${s}`;
  const created = await apiCallRaw<{ id: number }>(page, 'POST', '/roles', {
    name,
    code,
    description: `初始描述${s}`,
  });
  expect(Number.isFinite(created.id), `建角色应返回 id，实际 ${JSON.stringify(created)}`).toBe(
    true
  );
  const row = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${created.id}`);
  expect(row.code, '角色回读 code 应与提交值逐字符相同').toBe(code);
  expect(row.is_system, '自建角色不应是内置角色，否则后续删除与改写会被内置门挡住').toBe(false);
  return row;
}

/**
 * 功能：自建一个绑定指定角色的 scratch 用户并 GET 回读确认。入参：page 管理员会话、tag 标识、roleId 绑定角色。
 * 传给谁：POST /users 建号，GET /users/{id} 回读。存什么：users 一行。存哪里：users 表。
 * 口令只读 env 读取器，不在源码拼字面量。
 */
async function createScratchUser(page: Page, tag: string, roleId: number): Promise<UserRow> {
  const s = stamp();
  const username = `e2eru${tag}${s}`;
  const created = await apiCallRaw<{ id: number }>(page, 'POST', '/users', {
    username,
    password: baseAdminPassword(),
    email: `${username}@example.com`,
    phone: '13900000001',
    role_id: roleId,
  });
  expect(Number.isFinite(created.id), `建用户应返回 id，实际 ${JSON.stringify(created)}`).toBe(
    true
  );
  const row = await apiCallRaw<UserRow>(page, 'GET', `/users/${created.id}`);
  expect(row.username, '用户回读 username 应与提交值相同').toBe(username);
  expect(row.role_id, '用户回读 role_id 应为建号时绑定的自建角色').toBe(roleId);
  return row;
}

test.describe('角色与用户改口写后回读与管理员门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('486-01 改角色名与描述后回读生效且旧值不残留', async ({ page }) => {
    const role = await createScratchRole(page, 'a');
    try {
      const s = stamp();
      const newName = `E2E改名后${s}`;
      const newDesc = `改后描述${s}`;
      await apiCallRaw<RoleDetailRow>(page, 'PUT', `/roles/${role.id}`, {
        name: newName,
        description: newDesc,
      });
      const after = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${role.id}`);
      expect(after.name, '改后回读 name 应为新值').toBe(newName);
      expect(after.description, '改后回读 description 应为新值').toBe(newDesc);
      expect(after.name, '旧角色名不得残留').not.toBe(role.name);
      expect(after.description, '旧描述不得残留').not.toBe(role.description);
      expect(after.code, '改名列不应波及 code').toBe(role.code);
    } finally {
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-01 角色');
    }
  });

  test('486-02 改角色时缺席描述保持旧值，带值才覆盖', async ({ page }) => {
    const role = await createScratchRole(page, 'b');
    try {
      const onlyName = `E2E只改名${stamp()}`;
      await apiCallRaw<RoleDetailRow>(page, 'PUT', `/roles/${role.id}`, { name: onlyName });
      const kept = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${role.id}`);
      expect(kept.name, '只提交 name 时 name 应生效').toBe(onlyName);
      expect(kept.description, '描述键缺席时应保持旧值，不得被清空').toBe(role.description);

      const overwritten = `E2E覆盖描述${stamp()}`;
      await apiCallRaw<RoleDetailRow>(page, 'PUT', `/roles/${role.id}`, {
        description: overwritten,
      });
      const after = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${role.id}`);
      expect(after.description, '带描述值时应覆盖').toBe(overwritten);
      expect(after.name, '描述腿不应波及上一腿改好的 name').toBe(onlyName);
    } finally {
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-02 角色');
    }
  });

  test('486-03 提交 code 不得改动角色编码（防提权判据）', async ({ page }) => {
    const role = await createScratchRole(page, 'c');
    try {
      // UpdateRolePayload 无 code 列，提交的 code 属未知键被忽略；若后端将来接纳该键即为提权面回归。
      await apiCallRaw<RoleDetailRow>(page, 'PUT', `/roles/${role.id}`, {
        name: `E2E夹带code${stamp()}`,
        code: 'admin',
      });
      const after = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${role.id}`);
      expect(after.code, '夹带 code=admin 后角色编码必须不变，否则普通角色可被改成管理员角色').toBe(
        role.code
      );
      expect(after.code, '角色编码不得变成 admin').not.toBe('admin');
      expect(after.is_system, '夹带提交不得把自建角色抬成内置角色').toBe(false);
    } finally {
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-03 角色');
    }
  });

  test('486-04 改不存在角色返回不存在且不造假成功', async ({ page }) => {
    const missing = await apiCallExpectFail(page, 'PUT', `/roles/${ABSENT_PROBE_ID}`, {
      name: `E2E不存在角色${stamp()}`,
    });
    expect(missing.status, '改不存在角色应回 404，不得回 200 假成功').toBe(404);
    const readBack = await apiCallExpectFail(page, 'GET', `/roles/${ABSENT_PROBE_ID}`);
    expect(readBack.status, '不存在主键回读仍应 404，证明前一腿没有落库').toBe(404);
  });

  test('486-05 改用户邮箱与电话后回读生效且缺席键保持旧值', async ({ page }) => {
    const role = await createScratchRole(page, 'e');
    const user = await createScratchUser(page, 'e', role.id);
    try {
      const s = stamp();
      const newEmail = `e2eru-a-${s}@example.com`;
      await apiCallRaw<UserRow>(page, 'PUT', `/users/${user.id}`, {
        email: newEmail,
        phone: '13900000002',
      });
      const after = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(after.email, '改后回读 email 应为新值').toBe(newEmail);
      expect(after.phone, '改后回读 phone 应为新值').toBe('13900000002');
      expect(after.email, '旧邮箱不得残留').not.toBe(user.email);
      expect(after.phone, '旧电话不得残留').not.toBe(user.phone);

      const nextEmail = `e2eru-b-${stamp()}@example.com`;
      await apiCallRaw<UserRow>(page, 'PUT', `/users/${user.id}`, { email: nextEmail });
      const kept = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(kept.email, '只提交 email 时 email 应生效').toBe(nextEmail);
      expect(kept.phone, 'phone 键缺席时应保持上一腿的新值，不得回落建号值').toBe('13900000002');
      expect(kept.username, '改联系方式不应波及 username').toBe(user.username);
    } finally {
      await tryCleanup(page, 'DELETE', `/users/${user.id}`, '486-05 用户');
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-05 角色');
    }
  });

  test('486-06 改用户非法邮箱与空电话被拒且不落库', async ({ page }) => {
    const role = await createScratchRole(page, 'f');
    const user = await createScratchUser(page, 'f', role.id);
    try {
      const badEmail = await apiCallExpectFail(page, 'PUT', `/users/${user.id}`, {
        email: '不是邮箱形态',
      });
      expect(badEmail.status, '非法邮箱应回 400').toBe(400);
      const afterBadEmail = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(afterBadEmail.email, '非法邮箱被拒后邮箱必须仍是旧值').toBe(user.email);

      const emptyPhone = await apiCallExpectFail(page, 'PUT', `/users/${user.id}`, { phone: '' });
      expect(emptyPhone.status, '空电话违反长度下界应回 400').toBe(400);
      const afterEmptyPhone = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(afterEmptyPhone.phone, '空电话被拒后电话必须仍是旧值').toBe(user.phone);
    } finally {
      await tryCleanup(page, 'DELETE', `/users/${user.id}`, '486-06 用户');
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-06 角色');
    }
  });

  test('486-07 改用户角色后回读角色归属与角色名同步', async ({ page }) => {
    const fromRole = await createScratchRole(page, 'g1');
    const toRole = await createScratchRole(page, 'g2');
    const user = await createScratchUser(page, 'g', fromRole.id);
    try {
      await apiCallRaw<UserRow>(page, 'PUT', `/users/${user.id}`, { role_id: toRole.id });
      const after = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(after.role_id, '改角色后回读 role_id 应为新角色').toBe(toRole.id);
      expect(after.role_id, '旧角色归属不得残留').not.toBe(fromRole.id);
      expect(after.role_names, '角色名列表应含新角色名，证明读面 JOIN 跟着归属走').toContain(
        toRole.name
      );
      expect(after.role_names, '角色名列表不得仍含旧角色名').not.toContain(fromRole.name);
    } finally {
      await tryCleanup(page, 'DELETE', `/users/${user.id}`, '486-07 用户');
      await tryCleanup(page, 'DELETE', `/roles/${toRole.id}`, '486-07 目标角色');
      await tryCleanup(page, 'DELETE', `/roles/${fromRole.id}`, '486-07 原角色');
    }
  });

  test('486-08 非管理员会话改用户与改角色均被后端拒绝且目标行不变', async ({ page, browser }) => {
    const role = await createScratchRole(page, 'h');
    const user = await createScratchUser(page, 'h', role.id);
    // 越权会话用本例自建的非管理员账号，不借全局账号池，避免与其它用例互相改写归属。
    const session = await loginInIsolatedContext(browser, user.username, baseAdminPassword());
    try {
      const denyUser = await apiCallExpectFail(session.page, 'PUT', `/users/${user.id}`, {
        email: `e2eru-esc-${stamp()}@example.com`,
      });
      expect(denyUser.status, '非管理员改用户应被后端拒绝回 403，不能只靠前端隐藏按钮').toBe(403);
      // 403 出参 message 是脱敏常量，handler 给的自定义详情只进日志，故这里钉机器码不钉文案
      expect(
        failureCode(denyUser),
        `非管理员改用户的机器码应为 FORBIDDEN，实际=${failureCode(denyUser)}`
      ).toBe(APP_ERROR_CODES.FORBIDDEN);
      expect(
        typeof denyUser.message === 'string' && denyUser.message.length > 0,
        '403 应带非空脱敏文案'
      ).toBe(true);

      const denyRole = await apiCallExpectFail(session.page, 'PUT', `/roles/${role.id}`, {
        name: `E2E越权改名${stamp()}`,
      });
      expect(denyRole.status, '非管理员改角色应被后端拒绝回 403').toBe(403);
      expect(
        failureCode(denyRole),
        `非管理员改角色的机器码应为 FORBIDDEN，实际=${failureCode(denyRole)}`
      ).toBe(APP_ERROR_CODES.FORBIDDEN);

      const userAfter = await apiCallRaw<UserRow>(page, 'GET', `/users/${user.id}`);
      expect(userAfter.email, '越权被拒后用户邮箱必须逐字符不变').toBe(user.email);
      const roleAfter = await apiCallRaw<RoleDetailRow>(page, 'GET', `/roles/${role.id}`);
      expect(roleAfter.name, '越权被拒后角色名必须逐字符不变').toBe(role.name);
      expect(roleAfter.code, '越权被拒后角色编码必须不变').toBe(role.code);
    } finally {
      await session.close();
      await tryCleanup(page, 'DELETE', `/users/${user.id}`, '486-08 用户');
      await tryCleanup(page, 'DELETE', `/roles/${role.id}`, '486-08 角色');
    }
  });
});
