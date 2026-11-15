/**
 * 495 登录安全锁定面：锁定账户列表、按主键解锁、按用户名解锁、解锁后的审计事实保留。
 *
 * 调用面（backend/src/routes/analytics.rs 的 security() 注册，无二级前缀）：
 *   GET  /api/v1/erp/locked-accounts 锁定账户列表（出参数组，每项 id / username /
 *        lock_reason / locked_at / unlock_at）
 *   POST /api/v1/erp/locked-accounts/{id}/unlock 按用户主键解锁（仅 admin）
 *   POST /api/v1/erp/unlock 按用户名解锁（仅 admin，请求体 {username}）
 *   GET  /api/v1/erp/login-logs?username=&status=&page=&page_size= 登录日志分页
 *
 * 判据单源：handlers/login_security_handler.rs 与 handlers/auth_handler_session.rs。
 * 锁定不是账号上的标志位，而是按 username 聚合 30 分钟内 log_login 的 FAILED 行数，
 * 达到 MAX_FAILED_ATTEMPTS（9）即视为锁定；解锁就是删该 username 的 FAILED 行。
 * 登录失败行的 user_id 写的是占位 0（登录未成功前不取主键），所以列表的 id 必须由 users
 * 表按用户名回查得出；回查不到（该用户名没有账号）时 id 为 null，按主键解锁不可达，
 * 只有的按用户名解锁腿能清理。
 * 列表腿同样受权限门控：鉴权键由 URL 段推导（middleware/permission.rs），非 admin 岗打列表得
 * 403 而不是空数组；两条解锁腿在权限门之上再加 admin 角色门，故非 admin 打一个不存在的主键
 * 也得到 403 而不是 404。
 * 非生产环境跳过 check_account_lockout（auth_handler_session.rs），所以本文件造失败登录
 * 不会锁住同源 IP 的其他用例，但 FAILED 行确实落库并被列表统计。
 *
 * 前置自建：两枚 admin 岗账号（一枚打满阈值、一枚停在阈值下）加一枚非 admin 岗账号，
 * 用户名带时间戳后缀跨分片不撞；afterAll 先按主键清 FAILED 行再删账号。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginInIsolatedContext,
  loginViaUI,
  testPassword,
  tryCleanup,
} from './helpers';

/** 列表行（出参键 = login_security_handler::get_locked_accounts 的 json 构造） */
interface LockedRow {
  id: number | null;
  username: string;
  lock_reason: string;
  locked_at: string | null;
  unlock_at: string | null;
}

/** 登录日志分页出参（list / total / page / page_size） */
interface LoginLogPage {
  list: Array<{ id: number; username: string; status: string }>;
  total: number;
  page: number;
  page_size: number;
}

/** 岗位列表出参（只取选岗要用的两列） */
interface RolePage {
  roles: Array<{ id: number; code: string }>;
}

/** 后端阈值常量（login_security_handler.rs MAX_FAILED_ATTEMPTS） */
const MAX_FAILED_ATTEMPTS = 9;

// 同一份文件会被 chromium 与 webkit 两个 worker 同时装配，只用毫秒时间戳作后缀会在同一毫秒
// 撞名（撞名后一侧的解锁会删掉另一侧同名的失败行，锁定态随机消失），故再拼一段随机子串。
const stamp =
  Date.now().toString(36) +
  Math.floor(Math.random() * 46656)
    .toString(36)
    .padStart(3, '0');
const victimName = `e2elkvb${stamp}`;
const underName = `e2elkub${stamp}`;
const plainName = `e2elkpn${stamp}`;
const ghostName = `e2elkgh${stamp}`;

/** 以错密码打登录端点 n 次，逐次必须 401，每次落一行 FAILED 登录日志 */
async function fireFailedLogins(page: Page, username: string, n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    const res = await apiCallExpectFail(page, 'POST', '/auth/login', {
      username,
      password: `wrong-pw-${i}-${stamp}`,
    });
    expect(res.status, `[495] ${username} 第 ${i + 1} 次错密码应 401`).toBe(401);
  }
}

/** 在锁定列表里按用户名定位，未出现返回 null（列表是全库聚合，不得断言总条数） */
async function findLocked(page: Page, username: string): Promise<LockedRow | null> {
  const rows = await apiCallRaw<LockedRow[]>(page, 'GET', '/locked-accounts');
  return rows.find(r => r.username === username) ?? null;
}

/** 按状态读某用户名的登录日志总数 */
async function logCount(page: Page, username: string, status: string): Promise<number> {
  const logs = await apiCallRaw<LoginLogPage>(
    page,
    'GET',
    `/login-logs?username=${username}&status=${status}&page=1&page_size=10`
  );
  return logs.total;
}

test.describe('495 登录安全锁定与解锁面', () => {
  let victimId = 0;
  let underId = 0;
  let plainId = 0;
  const createdUserIds: number[] = [];

  test.beforeEach(async ({ page }) => {
    // page 是按用例创建的 fixture，beforeAll 里拿不到；前置账号在本 worker 首个用例里懒建一次
    if (createdUserIds.length > 0) {
      return;
    }
    const rolePage = await apiCallRaw<RolePage>(page, 'GET', '/roles?page=1&page_size=50');
    const nonAdmin = rolePage.roles.find(r => r.code !== 'admin');
    if (!nonAdmin) {
      throw new Error('[495] 岗位列表里没有非 admin 岗，无法构造越权会话');
    }
    const adminRoleId = rolePage.roles[0].id;

    const wanted: Array<[string, number, (id: number) => void]> = [
      [victimName, adminRoleId, id => (victimId = id)],
      [underName, adminRoleId, id => (underId = id)],
      [plainName, nonAdmin.id, id => (plainId = id)],
    ];
    for (const [name, roleId, remember] of wanted) {
      const created = await apiCallRaw<{ id: number }>(page, 'POST', '/users', {
        username: name,
        password: testPassword(),
        email: `${name}@test.com`,
        phone: '13800000000',
        role_id: roleId,
      });
      if (!created.id) {
        throw new Error(`[495] 自建账号 ${name} 未返回主键，前置失败`);
      }
      remember(created.id);
      createdUserIds.push(created.id);
    }
    console.log(
      `[495] 前置账号就绪 victim=${victimId} under=${underId} plain=${plainId} ghost=${ghostName}`
    );
  });

  test.afterAll(async ({ browser }) => {
    // afterAll 同样拿不到 page fixture，自建一次性会话走清理腿
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      // 先按主键清 FAILED 行再删账号：FAILED 行按用户名挂账，不删要留到 30 分钟窗口自己过期
      for (const id of [victimId, underId, plainId]) {
        if (id) {
          await tryCleanup(page, 'POST', `/locked-accounts/${id}/unlock`, `495 unlock ${id}`);
        }
      }
      for (const id of createdUserIds) {
        await tryCleanup(page, 'DELETE', `/users/${id}`, `495 user ${id}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('495-01 列表出参是数组且逐行五键齐全，unlock_at 恒为 null', async ({ page }) => {
    const rows = await apiCallRaw<LockedRow[]>(page, 'GET', '/locked-accounts');
    expect(Array.isArray(rows), '列表出参应为数组而非分页信封').toBe(true);
    for (const row of rows) {
      expect(row, '每行应携带 id 键').toHaveProperty('id');
      expect(typeof row.username, 'username 应为字符串').toBe('string');
      expect(row.lock_reason, '锁定原因应带失败次数').toMatch(/次登录失败$/);
      expect(row.unlock_at, '解锁时间由人工回填，列表侧恒为 null').toBeNull();
    }
    console.log(`[495-01] 当前窗口内锁定行数=${rows.length}`);
  });

  test('495-02 阈值边界：8 次失败不入列，第 9 次入列且 id 为真实主键', async ({ page }) => {
    await fireFailedLogins(page, underName, MAX_FAILED_ATTEMPTS - 1);
    expect(await findLocked(page, underName), `${MAX_FAILED_ATTEMPTS - 1} 次未达阈值不得入列`).toBe(
      null
    );

    await fireFailedLogins(page, victimName, MAX_FAILED_ATTEMPTS);
    const row = await findLocked(page, victimName);
    expect(row, `${MAX_FAILED_ATTEMPTS} 次失败应入列`).not.toBeNull();
    // 解锁腿按主键定位：id 若不是 users 表真实主键，界面点解锁必失败（回归锁）
    expect(row?.id, '列表 id 必须是 users 表真实主键').toBe(victimId);
    expect(row?.lock_reason, '锁定原因应逐字符等于次数文案').toBe(
      `${MAX_FAILED_ATTEMPTS} 次登录失败`
    );
    expect(row?.locked_at, '锁定时间取最近一次失败时间').toBeTruthy();
    expect(Number.isNaN(Date.parse(String(row?.locked_at))), 'locked_at 应为合法时间串').toBe(
      false
    );
  });

  test('495-03 用户名无对应账号时入列且 id 为 null', async ({ page }) => {
    await fireFailedLogins(page, ghostName, MAX_FAILED_ATTEMPTS);
    const row = await findLocked(page, ghostName);
    expect(row, '不存在的用户名打满阈值同样出现在列表').not.toBeNull();
    expect(row?.id, 'users 回查不到时 id 必须为 null，不得伪造主键').toBeNull();
    expect(row?.lock_reason, '无名账号也按失败次数计锁').toBe(`${MAX_FAILED_ATTEMPTS} 次登录失败`);
  });

  test('495-04 按主键解锁后该用户名离开列表且 FAILED 行清零', async ({ page }) => {
    const res = await apiCallRaw<unknown>(page, 'POST', `/locked-accounts/${victimId}/unlock`);
    console.log(`[495-04] 解锁出参=${JSON.stringify(res)}`);
    expect(await findLocked(page, victimName), '解锁后不得再出现在锁定列表').toBeNull();
    expect(await logCount(page, victimName, 'FAILED'), '解锁应删净该用户名的 FAILED 行').toBe(0);
  });

  test('495-05 解锁只清失败行，同用户名的成功登录事实保留', async ({ page, browser }) => {
    const session = await loginInIsolatedContext(browser, underName, testPassword());
    await session.close();
    const successBefore = await logCount(page, underName, 'SUCCESS');
    expect(successBefore, '隔离登录应留下一行 SUCCESS 事实').toBeGreaterThanOrEqual(1);

    await apiCallRaw(page, 'POST', `/locked-accounts/${underId}/unlock`);
    expect(await logCount(page, underName, 'FAILED'), '解锁后失败行应为 0').toBe(0);
    expect(await logCount(page, underName, 'SUCCESS'), '解锁不得连带删除成功登录记录').toBe(
      successBefore
    );
  });

  test('495-06 解锁幂等：重复解锁同一主键仍成功且不报错', async ({ page }) => {
    await fireFailedLogins(page, underName, MAX_FAILED_ATTEMPTS);
    expect(await findLocked(page, underName), '打满阈值后应入列').not.toBeNull();

    await apiCallRaw(page, 'POST', `/locked-accounts/${underId}/unlock`);
    const again = await apiCallRaw<unknown>(page, 'POST', `/locked-accounts/${underId}/unlock`);
    console.log(`[495-06] 二次解锁出参=${JSON.stringify(again)}`);
    expect(await findLocked(page, underName), '删 0 行不报错，列表仍应干净').toBeNull();
  });

  test('495-07 主键不存在时按 404 拒绝', async ({ page }) => {
    const missing = await apiCallExpectFail(page, 'POST', '/locked-accounts/99999999/unlock');
    expect(missing.status, '不存在的用户应 404').toBe(404);
    expect(failureCode(missing), '机器码应为 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('495-08 非 admin 解锁被拒，且权限门先于存在性检查', async ({ page, browser }) => {
    await fireFailedLogins(page, underName, MAX_FAILED_ATTEMPTS);
    expect(await findLocked(page, underName), '前置：under 应处于锁定态').not.toBeNull();

    const session = await loginInIsolatedContext(browser, plainName, testPassword());
    try {
      const denied = await apiCallExpectFail(
        session.page,
        'POST',
        `/locked-accounts/${underId}/unlock`
      );
      expect(denied.status, '非 admin 解锁应 403').toBe(403);
      expect(failureCode(denied), '机器码应为 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

      // 同一会话打一个不存在的主键仍是 403：证明先判角色再查用户，不外泄"该 id 是否存在"
      const deniedMissing = await apiCallExpectFail(
        session.page,
        'POST',
        '/locked-accounts/99999999/unlock'
      );
      expect(deniedMissing.status, '角色门应先于存在性检查').toBe(403);
    } finally {
      await session.close();
    }
    expect(await findLocked(page, underName), '越权失败不应产生解锁副作用').not.toBeNull();

    await apiCallRaw(page, 'POST', `/locked-accounts/${underId}/unlock`);
  });

  test('495-09 列表腿受权限门控，非 admin 被拒且不泄露锁定名单', async ({ browser }) => {
    const session = await loginInIsolatedContext(browser, plainName, testPassword());
    try {
      const denied = await apiCallExpectFail(session.page, 'GET', '/locked-accounts');
      expect(denied.status, '非 admin 读锁定列表应 403').toBe(403);
      expect(failureCode(denied), '机器码应为 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    } finally {
      await session.close();
    }
  });

  test('495-10 按用户名解锁清理无主键账号的失败行', async ({ page }) => {
    // 前置自建：锁定态是跨用例的全库聚合事实，不假定上一用例留下的状态仍成立
    await fireFailedLogins(page, ghostName, MAX_FAILED_ATTEMPTS);
    expect(await findLocked(page, ghostName), '前置：无账号用户名打满阈值应入列').not.toBeNull();
    const res = await apiCallRaw<unknown>(page, 'POST', '/unlock', { username: ghostName });
    console.log(`[495-10] 按名解锁出参=${JSON.stringify(res)}`);
    expect(await findLocked(page, ghostName), '按用户名解锁应清掉 ghost 的失败行').toBeNull();
  });
});
