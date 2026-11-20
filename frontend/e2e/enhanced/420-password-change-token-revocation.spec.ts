/**
 * 4.20 会话安全：修改密码后，改密前签发的旧会话令牌必须即时失效。
 *
 * 调用面：
 *   POST /api/v1/erp/auth/login（免 CSRF，middleware/public_routes.rs:21）建立一次性用户会话
 *   POST /api/v1/erp/users/change-password（AUTH_ONLY_PATHS，public_routes.rs:113）改密
 *   GET  /api/v1/erp/auth/me（AUTH_ONLY_PATHS，public_routes.rs:112）用裸 token 探活
 * 判据链（后端源码逐行核对）：
 *   handlers/user_handler.rs:942 改密成功后调 auth_service::revoke_user_jtis(uid, "PASSWORD_CHANGED")；
 *   services/auth_service_ops/jti.rs:199-201 写 REVOKED_USERS[uid] = Utc::now().timestamp()（秒级）；
 *   middleware/auth.rs:242-245 以 claims.iat.timestamp() 调 is_user_token_revoked，
 *   jti.rs:218-219 判据为 token_iat < revoked_at（严格小于）；命中即
 *   middleware/auth.rs:267 返回 unauthorized_response → HTTP 401，机器码 UNAUTHORIZED
 *   （utils/error.rs:785 CODE_UNAUTHORIZED，utils/response.rs:140-141）。
 * 时序前提：判据是秒级严格小于，若登录与改密落在同一秒，旧 token 的 iat == revoked_at
 *   不满足小于、不会被拒，用例会假红。故取到 token 后显式等待跨过秒边界再改密。
 * 真检测：去掉 revoke_user_jtis 调用时旧 token 仍 200，本断言即红。改密后新登录 token 的
 *   iat >= revoked_at 仍有效（200）作正向对照，排除"端点整体坏"造成的假红。
 * 出参只锁 status 与机器码：命中分支文案与"禁用/删除"共用同一分支（auth.rs:267），
 *   属实现细节，不逐字钉死，仅断非空。
 * 前置与清理：自建无角色一次性用户（改密与 /auth/me 均 AUTH_ONLY，不需 RBAC），
 *   密码用确定性模板避开服务端键盘序列检测的随机红，范式同 system/03-password-change-loop；
 *   finally 关独立 context、重登 admin 删除该用户。
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

test.describe('4.20 改密后旧会话即时失效', () => {
  test('4.20-01 改密前签发的 access_token 改密后被拒，新登录令牌仍可用', async ({
    browser,
    page,
  }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);

    const username = `e2e_revoke_${genCode('U')}`.toLowerCase();
    // 确定性密码模板（两字母一数字一符号循环），任一连续 4 字符窗口都混含字母与非字母，
    // 不命中服务端键盘序列检测，避免随机红；同 system/03-password-change-loop 口径。
    const pwOld = 'Bk9#Vn4$Wm7!Qx2&';
    const pwNew = 'Tz6#Hd3$Rj8!Yp5&';

    const created = await apiCall<{ id?: number; username?: string; role_id?: number | null }>(
      page,
      'POST',
      '/users',
      { username, password: pwOld }
    );
    const userId = created.data?.id;
    expect(userId, `一次性用户建档失败：${JSON.stringify(created)}`).toBeTruthy();
    expect(
      created.data?.role_id ?? null,
      '前置：一次性用户须无角色（改密与 /auth/me 均为 AUTH_ONLY，带角色即失去对本豁免的检出力）'
    ).toBeNull();

    // 独立 context 登录：改密会吊销该用户全部旧 token，不能打在 worker 默认会话上
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const p = await ctx.newPage();
    let bare: APIRequestContext | undefined;
    try {
      const login0 = await rawLogin(p, username, pwOld);
      expect(login0.status(), `前置：旧密码应可登录，body=${await login0.text()}`).toBe(200);
      const cookies = await ctx.cookies();
      const oldToken = cookies.find(c => c.name === 'access_token')?.value ?? '';
      expect(oldToken, '前置：登录后应下发 access_token cookie').toBeTruthy();
      const csrf = cookies.find(c => c.name === 'csrf_token')?.value;

      // 跨秒：判据为 token_iat < revoked_at（秒级严格小于），必须让改密落在登录之后至少一秒
      await p.waitForTimeout(1500);

      const changeResp = await p.request.post(`${API_BASE}${API_PREFIX}/users/change-password`, {
        data: { old_password: pwOld, new_password: pwNew },
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
      });
      const changeText = await changeResp.text();
      expect(changeResp.status(), `改密应 200，实际 body=${changeText}`).toBe(200);

      // 改密前签发的旧 token 现应被拒：401 + UNAUTHORIZED
      bare = await pwRequest.newContext({
        baseURL: API_BASE,
        extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      const oldMeResp = await bare.get(`${API_PREFIX}/auth/me`, {
        headers: { Cookie: `access_token=${oldToken}` },
      });
      const oldMeBody = (await oldMeResp.json().catch(() => null)) as ApiFailureBody | null;
      expect(oldMeResp.status(), '改密后旧 access_token 打 /auth/me 应 401').toBe(401);
      expect(failureCode(oldMeBody), '旧 token 被拒的机器码应为 UNAUTHORIZED').toBe('UNAUTHORIZED');
      expect(String(oldMeBody?.message ?? ''), '拒响应带非空文案').not.toBe('');
      console.log(`[4.20] 改密后旧 token → ${oldMeResp.status()} code=${failureCode(oldMeBody)}`);

      // 正向对照：改密后新登录的 token 应可用（iat >= revoked_at 不被吊销）
      const login1 = await rawLogin(p, username, pwNew);
      expect(login1.status(), `新密码应可登录，body=${await login1.text()}`).toBe(200);
      const meAfter = await p.request.get(`${API_BASE}${API_PREFIX}/auth/me`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      expect(meAfter.status(), '改密后新会话打 /auth/me 应 200').toBe(200);
    } finally {
      if (bare) await bare.dispose();
      await ctx.close();
      await loginViaUI(page, undefined, undefined, true);
      await tryCleanup(page, 'DELETE', `/users/${userId}`, '[4.20] one-time user');
    }
  });
});
