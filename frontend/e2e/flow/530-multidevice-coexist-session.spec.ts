import { test, expect } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  apiCall,
  type IsolatedAuthedSession,
  loginInIsolatedContext,
  testPassword,
  testUsername,
} from './helpers';

/**
 * 4.20 多端登录并存不互踢（口径固化）
 *
 * 口径来源：.monkeycode/docs/business-caliber-ruling-2026-11-16.md 第 3 条裁定——
 * A 端登录不使 B 端 token 失效；AppClaims 无 device 字段；revoke 仅在登出/改密/改角色/停用。
 * 本文件把"并存不互踢"固化为可失败断言，避免该行为被误报成缺陷。
 *
 * 手段：用 fixtures/multi-context 同款的 lane helper `loginInIsolatedContext` 起两个
 * 独立 BrowserContext（各自 cookie jar），以同一 worker 账号走真实 POST /auth/login。
 * 所有操作只在隔离 context 内进行，不触碰 worker 共享 storageState 与模块级 LOGGED_IN。
 */

/** 需鉴权的受保护 GET 端点：成功必须是真 HTTP 200 + 统一信封 code=200 双条件 */
const PROTECTED_GET = '/auth/me';

/**
 * 校验某端会话确实可用：真实 HTTP 状态码 + 信封 code 双断言，并经车道 helper apiCall 复核。
 * 不以页面可见代替会话有效性。
 */
async function expectProtectedGetOk(session: IsolatedAuthedSession, side: string): Promise<void> {
  const raw = await session.page.request.get(`${API_BASE}${API_PREFIX}${PROTECTED_GET}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    timeout: 60_000,
  });
  expect(
    raw.status(),
    `[530][${side}] 受保护 GET ${PROTECTED_GET} 应为 HTTP 200，实际 ${raw.status()}`
  ).toBe(200);
  const body = await raw.json();
  expect(body.code, `[530][${side}] 成功信封 code 应为 200，实际 ${body.code}`).toBe(200);

  // 车道 helper 范式复核：apiCall 在 code!==200 时抛错，能再次证明是成功信封
  const envelope = await apiCall(session.page, 'GET', PROTECTED_GET);
  expect(envelope.code, `[530][${side}] apiCall 返回信封 code 应为 200`).toBe(200);
}

test.describe('4.20 多端登录并存不互踢', () => {
  test('530-1 A 端登录不使已登录的 B 端 token 失效', async ({ browser }) => {
    test.setTimeout(120_000);

    // B 先在独立 context 登录并持有 token
    const sessionB = await loginInIsolatedContext(browser, testUsername(), testPassword());
    let sessionA: IsolatedAuthedSession | undefined;
    try {
      const cookiesBBefore = await sessionB.context.cookies();
      const bTokensBefore = cookiesBBefore.filter(c => c.name === 'access_token');
      expect(
        bTokensBefore,
        `[530-1] B 登录应恰有 1 条 access_token cookie，实际 ${bTokensBefore.length} 条`
      ).toHaveLength(1);
      await expectProtectedGetOk(sessionB, 'B-登录A前');

      // A 后登录：同一账号、另一个独立 context（并存语义的关键刺激）
      sessionA = await loginInIsolatedContext(browser, testUsername(), testPassword());

      // 两次登录各生成全新 session_id（uuid v4），两端 token 必不同：证明各自持有独立 token
      const cookiesA = await sessionA.context.cookies();
      const cookiesBAfter = await sessionB.context.cookies();
      const aTokens = cookiesA.filter(c => c.name === 'access_token');
      const bTokensAfter = cookiesBAfter.filter(c => c.name === 'access_token');
      expect(
        aTokens,
        `[530-1] A 应恰有 1 条 access_token cookie，实际 ${aTokens.length} 条`
      ).toHaveLength(1);
      expect(
        bTokensAfter,
        `[530-1] B 应恰有 1 条 access_token cookie，实际 ${bTokensAfter.length} 条`
      ).toHaveLength(1);
      expect(aTokens[0].value, '[530-1] A 与 B 必须持有不同的 access_token（独立会话）').not.toBe(
        bTokensAfter[0].value
      );
      expect(bTokensAfter[0].value, '[530-1] A 登录后 B 的 token 不应被改写（并存不互踢）').toBe(
        bTokensBefore[0].value
      );

      // 核心断言：A 端登录后，B 端凭自己的 token 仍能访问受保护端点
      await expectProtectedGetOk(sessionB, 'B-登录A后');
    } finally {
      if (sessionA) await sessionA.close();
      await sessionB.close();
    }
  });

  test('530-2 A 端登出后 B 端 token 仍有效（并存不互踢强断言）', async ({ browser }) => {
    test.setTimeout(120_000);

    const sessionA = await loginInIsolatedContext(browser, testUsername(), testPassword());
    let sessionB: IsolatedAuthedSession | undefined;
    try {
      sessionB = await loginInIsolatedContext(browser, testUsername(), testPassword());

      // 前置：两端会话均有效
      await expectProtectedGetOk(sessionA, 'A-登出前');
      await expectProtectedGetOk(sessionB, 'B-A登出前');

      // A 端主动登出（真实 POST /auth/logout，带本 context 的 csrf_token）
      const cookiesA = await sessionA.context.cookies();
      const csrfA = cookiesA.filter(c => c.name === 'csrf_token');
      expect(
        csrfA,
        `[530-2] A 应恰有 1 条 csrf_token cookie，实际 ${csrfA.length} 条`
      ).toHaveLength(1);
      const logoutResp = await sessionA.page.request.post(`${API_BASE}${API_PREFIX}/auth/logout`, {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-Token': csrfA[0].value,
        },
        timeout: 60_000,
      });
      expect(logoutResp.status(), `[530-2] A 登出应为 HTTP 200，实际 ${logoutResp.status()}`).toBe(
        200
      );
      const logoutBody = await logoutResp.json();
      expect(logoutBody.code, '[530-2] A 登出信封 code 应为 200').toBe(200);
      expect(logoutBody.data.success, '[530-2] A 登出应返回 success=true').toBe(true);

      // 负控：A 的会话确实被吊销（登出不是空操作，否则以下 B 断言无意义）
      const meAAfter = await sessionA.page.request.get(`${API_BASE}${API_PREFIX}${PROTECTED_GET}`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        timeout: 60_000,
      });
      expect(
        meAAfter.status(),
        `[530-2] A 登出后 /auth/me 应为 401，实际 ${meAAfter.status()}`
      ).toBe(401);

      // 强断言：A 登出后，B 凭自己的 token 仍可访问受保护端点（并存不互踢）
      await expectProtectedGetOk(sessionB, 'B-A登出后');
    } finally {
      if (sessionB) await sessionB.close();
      await sessionA.close();
    }
  });
});
