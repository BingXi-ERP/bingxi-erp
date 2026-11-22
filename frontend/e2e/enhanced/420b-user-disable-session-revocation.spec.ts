/**
 * 4.20 会话安全：管理员停用账号后，该账号已签发的会话令牌必须即时失效，且无法再用原密码登录。
 *
 * 调用面：
 *   POST /api/v1/erp/auth/login        （免 CSRF，middleware/public_routes.rs:21）建一次性用户会话
 *   PUT  /api/v1/erp/users/{id}        （routes/iam.rs，管理员）status=inactive 停用 / active 恢复
 *   GET  /api/v1/erp/auth/me           （AUTH_ONLY_PATHS，public_routes.rs:112）裸 token 探活
 * 判据链（后端源码逐行核对）：
 *   handlers/user_handler.rs:103 UpdateUserRequest.status: Option<String>；
 *   services/user_service.rs:333-336 将 status 归一为 becoming_active（== master_data::ACTIVE "active"，
 *     models/status/general.rs:132），:336 调 handle_user_status_change；
 *   user_service.rs:373-389 禁用（非 active）分支调 auth_service::revoke_user_jtis(uid, "USER_DISABLED")，
 *     恢复（active）分支调 unrevoke_user 清除吊销标记；
 *   middleware/auth.rs:242-247 先以 claims.iat.timestamp() 调 is_user_token_revoked 命中即
 *     :267 返回 401 UNAUTHORIZED（"用户已被禁用或删除"）；:270 之后才是 is_active 缓存检查；
 *   services/auth_service_ops/auth.rs:50 登录时 !is_active → AuthError::UserInactive，
 *     services/auth_service.rs:118 映射为 AppError::unauthorized("用户未激活") → HTTP 401。
 * 真检测的关键（防止 is_active 缓存掩盖 JTI 吊销缺陷）：
 *   auth.rs:50,63 的 is_active 状态有 60 秒进程内缓存。故登录后先用旧 token 打一次 /auth/me，
 *   把该 uid 的 is_active=true 写进缓存；随后管理员停用账号（DB is_active=false，但缓存仍为 true），
 *   此时旧 token 若仍 200 说明 JTI 吊销缺失，断言即红——命中 401 只可能来自 JTI 吊销分支。
 *   跨秒前提：判据 token_iat < revoked_at 为秒级严格小于，登录与停用须跨过秒边界（显式等 1.5s）。
 * 正向对照：停用期间管理员自己的 /auth/me 仍 200（证明端点整体健康，非全局故障）；
 *   恢复 active 后原账号重新登录并探活 200（证明 unrevoke 生效、非端点整体坏）。
 * 清理：finally 先恢复 active 再删除一次性用户，避免留下停用账号。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import {
  apiCall,
  ensureTestEntities,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
  API_BASE,
  API_PREFIX,
  type ApiFailureBody,
} from '../flow/helpers';

async function rawLogin(page: Page, username: string, password: string) {
  return page.request.post(`${API_BASE}${API_PREFIX}/auth/login`, {
    data: { username, password },
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });
}

test.describe('4.20 停用账号强制下线', () => {
  test('4.20-02 停用后旧会话即时失效且原密码无法登录，恢复后可重登', async ({ browser, page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);

    const username = `e2e_disable_${genCode('U')}`.toLowerCase();
    // 确定性密码模板（两字母一数字一符号循环），避开服务端键盘序列检测的随机红。
    const pw = 'Bk9#Vn4$Wm7!Qx2&';

    const created = await apiCall<{ id?: number; is_active?: boolean }>(page, 'POST', '/users', {
      username,
      password: pw,
    });
    const userId = created.data?.id;
    expect(userId, `一次性用户建档失败：${JSON.stringify(created)}`).toBeTruthy();
    expect(created.data?.is_active, '前置：一次性用户须为 active').toBe(true);

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    let bare: APIRequestContext | undefined;
    try {
      const login0 = await rawLogin(p, username, pw);
      expect(login0.status(), `前置：原密码应可登录，body=${await login0.text()}`).toBe(200);
      const cookies = await ctx.cookies();
      const oldToken = cookies.find(c => c.name === 'access_token')?.value ?? '';
      expect(oldToken, '前置：登录后应下发 access_token cookie').toBeTruthy();

      bare = await pwRequest.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const oldCookie = `access_token=${oldToken}`;

      // 预热 is_active 缓存为 true：确保后续 401 只能来自 JTI 吊销，而非 is_active 缓存。
      const warm = await bare.get(`${API_PREFIX}/auth/me`, { headers: { Cookie: oldCookie } });
      expect(warm.status(), '前置：旧 token 停用前应可用（同时预热 is_active=true 缓存）').toBe(
        200
      );

      // 跨秒：token_iat < revoked_at 为秒级严格小于，须让停用落在登录之后至少一秒。
      await p.waitForTimeout(1500);

      // 管理员停用该用户：status=inactive → revoke_user_jtis(USER_DISABLED)。
      const disabled = await apiCall<{ is_active?: boolean }>(page, 'PUT', `/users/${userId}`, {
        status: 'inactive',
      });
      expect(disabled.data?.is_active, '停用后管理员回读须 is_active=false（DB 已变更）').toBe(
        false
      );

      // 旧 token 应被即时拒绝：401 + UNAUTHORIZED（此刻 is_active 缓存仍为 true，只可能是 JTI 吊销）。
      const oldMeResp = await bare.get(`${API_PREFIX}/auth/me`, {
        headers: { Cookie: oldCookie },
      });
      const oldMeBody = (await oldMeResp.json().catch(() => null)) as ApiFailureBody | null;
      expect(oldMeResp.status(), '停用后旧 access_token 打 /auth/me 应 401').toBe(401);
      expect(failureCode(oldMeBody), '旧 token 被拒的机器码应为 UNAUTHORIZED').toBe('UNAUTHORIZED');
      expect(String(oldMeBody?.message ?? ''), '拒响应带非空文案').not.toBe('');

      // 停用账号无法用原密码登录：401（UserInactive）。
      const relogin = await rawLogin(p, username, pw);
      const reloginBody = (await relogin.json().catch(() => null)) as ApiFailureBody | null;
      expect(relogin.status(), '停用账号用原密码登录应 401').toBe(401);
      expect(failureCode(reloginBody), '登录拒绝的机器码应为 UNAUTHORIZED').toBe('UNAUTHORIZED');

      // 正向对照 1：停用期间管理员自己的会话仍可用，证明 /auth/me 端点整体健康。
      const adminMe = await page.request.get(`${API_BASE}${API_PREFIX}/auth/me`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      expect(adminMe.status(), '管理员会话打 /auth/me 应 200（端点整体健康）').toBe(200);

      // 恢复 active：unrevoke_user 清除吊销标记，账号重新可用。
      const restored = await apiCall<{ is_active?: boolean }>(page, 'PUT', `/users/${userId}`, {
        status: 'active',
      });
      expect(restored.data?.is_active, '恢复后管理员回读须 is_active=true').toBe(true);

      // 正向对照 2：恢复后原账号可重新登录并探活，证明不是账号本身被破坏。
      const login1 = await rawLogin(p, username, pw);
      expect(login1.status(), `恢复后原密码应可登录，body=${await login1.text()}`).toBe(200);
      const meAfter = await p.request.get(`${API_BASE}${API_PREFIX}/auth/me`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      expect(meAfter.status(), '恢复后新会话打 /auth/me 应 200').toBe(200);
    } finally {
      if (bare) await bare.dispose();
      await ctx.close();
      // 先恢复 active 再删除：确保即便中途失败，清理 leg 也不会遗留停用账号。
      await apiCall(page, 'PUT', `/users/${userId}`, { status: 'active' }).catch(() => undefined);
      await tryCleanup(page, 'DELETE', `/users/${userId}`, '[4.20] disable user');
    }
  });
});
