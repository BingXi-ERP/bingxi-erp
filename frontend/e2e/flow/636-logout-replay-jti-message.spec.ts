// 4.20 会话安全：登出吊销旧 token 后，裸重放必须命中 JTI 黑名单文案，且与缺凭据分支可区分。
//
// 功能 钉 POST /auth/logout 成功后旧 access_token 重放 401 + UNAUTHORIZED + 「令牌已被吊销，
//       请重新登录」+ 统一四字段无业务数据；无凭据裸请求同一端点报「缺少认证凭据」。
// 调用方 CI 的 e2e flow 分片按文件粒度调度本文件，无其它调用方。
// 入参 browser/page 来自 diagnose-fixture；一次性角色、用户和口令全部在本用例内自建。
// 传给谁 被测请求发往 API_BASE 指向的后端；断言结果只进 Playwright 报告，不写仓库文件。
// 存什么 仅存一次性角色主键、用户主键、登出前 cookie 与进程内裸 context；不落盘制品。
// 存哪里 业务数据落 CI 现场数据库，finally 逐个删除；会话 cookie 只留在测试进程内存。
//
// 判据链（后端源码逐行核对）：
//   handlers/auth_handler_session.rs:178-204 登出按 cookie 解出 token 并拉黑调用者会话。
//   middleware/auth.rs:204-209 先查 token 黑名单，:223-234 再查 JTI 黑名单，
//     两个分支字面量均为「令牌已被吊销，请重新登录」；:187-196 缺凭据分支为「缺少认证凭据」。
//   utils/response.rs:140-141 + utils/error.rs:775-785 统一失败体四字段与字符串 UNAUTHORIZED。
//   middleware/public_routes.rs:109-117 /auth/me 与 /auth/logout 均为认证自服务端点。
// 隔离约束：登出会吊销本账号会话，绝不能复用 worker 共享 context；沿用 19 spec 的
//   独立 context cookie 捕获+裸请求重放范式，但只读取其范式，不改 19 原文件。
import { test, expect } from '../diagnose-fixture';
import { request as pwRequest, type APIRequestContext } from '@playwright/test';
import {
  apiCall,
  failureCode,
  genCode,
  loginInIsolatedContext,
  loginViaUI,
  testPassword,
  tryCleanup,
  API_BASE,
  API_PREFIX,
  type ApiFailureBody,
  type IsolatedAuthedSession,
} from '../flow/helpers';

const REVOKED_MESSAGE = '令牌已被吊销，请重新登录';
const NO_CREDENTIAL_MESSAGE = '缺少认证凭据';

function expectUnauthorizedEnvelope(
  body: ApiFailureBody,
  status: number,
  expectedMessage: string,
  label: string
): void {
  expect(status, `${label} HTTP 应为 401`).toBe(401);
  expect(failureCode(body), `${label} 机器码应为字符串 UNAUTHORIZED`).toBe('UNAUTHORIZED');
  expect(body.message, `${label} 文案须逐字符匹配源码字面量`).toBe(expectedMessage);
  expect(
    Object.keys(body).sort(),
    `${label} 失败体只许统一四字段，不得夹带 token 或业务数据`
  ).toEqual(['code', 'message', 'timestamp', 'trace_id']);
  expect(typeof body.trace_id, `${label} trace_id 应为字符串`).toBe('string');
  expect((body.trace_id as string).length, `${label} trace_id 不应为空`).toBeGreaterThan(0);
  expect(typeof body.timestamp, `${label} timestamp 应为数字`).toBe('number');
}

test('4.20-02 登出后旧 token 重放命中 JTI 文案，缺凭据走另一分支', async ({ browser, page }) => {
  await loginViaUI(page);

  const tag = genCode('S636').replace(/-/g, '_');
  const roleCode = `e2e_s636_${tag}`.toLowerCase();
  const username = roleCode;
  const password = testPassword();
  expect(password.includes(username), '一次性口令不得含用户名片段').toBe(false);

  const roleCreated = await apiCall<{ id?: number }>(page, 'POST', '/roles', {
    name: `e2e-s636-role-${tag}`,
    code: roleCode,
    description: '一次性登出吊销角色',
  });
  const roleId = roleCreated.data?.id;
  expect(roleId, `建角色应返回 id，实际 ${JSON.stringify(roleCreated)}`).toBeTruthy();

  const userCreated = await apiCall<{ id?: number; role_id?: number | null }>(
    page,
    'POST',
    '/users',
    { username, password, role_id: roleId }
  );
  const userId = userCreated.data?.id;
  expect(userId, `建用户应返回 id，实际 ${JSON.stringify(userCreated)}`).toBeTruthy();
  expect(userCreated.data?.role_id, '一次性用户须绑定新建角色').toBe(roleId);

  let session: IsolatedAuthedSession | undefined;
  let bare: APIRequestContext | undefined;
  let bareNoCred: APIRequestContext | undefined;
  try {
    session = await loginInIsolatedContext(browser, username, password);

    const cookiesBefore = await session.context.cookies();
    const oldCookie = cookiesBefore.find(c => c.name === 'access_token')?.value;
    const csrfToken = cookiesBefore.find(c => c.name === 'csrf_token')?.value;
    expect(oldCookie, '登出前必须拿到 access_token cookie').toBeTruthy();
    expect(csrfToken, '登出前必须拿到 csrf_token cookie').toBeTruthy();

    bare = await pwRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!bare) {
      throw new Error('636 前置失败：裸 context 必须创建成功才能做旧 token 重放');
    }
    // PrivateCookieJar 下发的是密文 cookie 值，重放时必须原样回带，不能拿 JWT 明文拼接。
    const warm = await bare.get(`${API_PREFIX}/auth/me`, {
      headers: { Cookie: `access_token=${oldCookie}` },
    });
    expect(warm.status(), '前置：旧 token 登出前应可用').toBe(200);
    await warm.dispose();

    const logoutResp = await session.page.request.post(`${API_BASE}${API_PREFIX}/auth/logout`, {
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrfToken as string },
    });
    expect(logoutResp.status(), '登出应成功').toBe(200);
    const logoutBody = (await logoutResp.json()) as { data?: { success?: boolean } };
    expect(logoutBody.data?.success, '登出响应应回显 success=true').toBe(true);

    const replay = await bare.get(`${API_PREFIX}/auth/me`, {
      headers: { Cookie: `access_token=${oldCookie}` },
    });
    const replayBody = (await replay.json()) as ApiFailureBody;
    expectUnauthorizedEnvelope(replayBody, replay.status(), REVOKED_MESSAGE, '登出后旧 token 重放');
    await replay.dispose();

    // 另起完全无 cookie jar 的裸 context：证明缺凭据走的是另一个字面量分支。
    bareNoCred = await pwRequest.newContext({ baseURL: API_BASE });
    const noCred = await bareNoCred.get(`${API_PREFIX}/auth/me`);
    const noCredBody = (await noCred.json()) as ApiFailureBody;
    expectUnauthorizedEnvelope(noCredBody, noCred.status(), NO_CREDENTIAL_MESSAGE, '无凭据裸请求');
    await noCred.dispose();
  } finally {
    await session?.close();
    await bare?.dispose();
    await bareNoCred?.dispose();
    await tryCleanup(page, 'DELETE', `/users/${userId}`, '636 一次性用户');
    await tryCleanup(page, 'DELETE', `/roles/${roleId}`, '636 一次性角色');
  }
});
