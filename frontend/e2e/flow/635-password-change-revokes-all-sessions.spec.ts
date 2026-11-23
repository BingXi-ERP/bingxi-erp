// 4.20 会话安全：改密必须用用户级吊销同时打死该账号此前签发的全部会话。
//
// 功能 钉 POST /users/change-password 成功后，改密前签发的两枚 access_token 各自在裸 context
//       重放 GET /auth/me 均 401 + UNAUTHORIZED + 用户级吊销固定文案 + 统一四字段且无业务数据。
// 调用方 CI 的 e2e flow 分片按文件粒度调度本文件，无其它调用方。
// 入参 browser/page 来自 diagnose-fixture；一次性角色、用户和口令全部在本用例内自建，不读共享会话。
// 传给谁 被测请求发往 API_BASE 指向的后端；断言结果只进 Playwright 报告，不写仓库文件。
// 存什么 仅存一次性角色主键、用户主键、两份会话 cookie 与进程内裸 context；不落盘制品。
// 存哪里 业务数据落 CI 现场数据库，finally 逐个删除；会话 cookie 只留在测试进程内存。
//
// 判据链（后端源码逐行核对）：
//   handlers/user_handler.rs:947-961 改密成功调用 revoke_user_jtis(uid, "PASSWORD_CHANGED")，
//     :971-986 带补偿重试；services/auth_service_ops/jti.rs:218-225 记录 revoked_at。
//   middleware/auth.rs:242-267 用 token.iat < revoked_at 判用户级吊销，字面量在 :267。
//   utils/response.rs:140-141 与 utils/error.rs:775-780：unauthorized_response 出统一失败体
//     {code,message,trace_id,timestamp}，code 为字符串 UNAUTHORIZED（error.rs:785）。
// 隔离约束：改密会吊销本账号全部会话，绝不能在 worker 共享 context 上做；两枚会话均用
//   loginInIsolatedContext 另起 context，断言后 session.close()，用户与角色 finally 清理。
// 时间判据：iat 与 revoked_at 都按秒存，登录与改密之间跨过一秒边界，避免同秒边界假绿。
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

const REVOKED_MESSAGE = '用户已被禁用或删除，请联系管理员';

function expectRevokedEnvelope(body: ApiFailureBody, status: number, label: string): void {
  expect(status, `${label} HTTP 应为 401`).toBe(401);
  expect(failureCode(body), `${label} 机器码应为字符串 UNAUTHORIZED`).toBe('UNAUTHORIZED');
  expect(body.message, `${label} 文案须逐字符等于 middleware/auth.rs:267`).toBe(REVOKED_MESSAGE);
  expect(
    Object.keys(body).sort(),
    `${label} 失败体只许统一四字段，不得夹带 token 或业务数据`
  ).toEqual(['code', 'message', 'timestamp', 'trace_id']);
  expect(typeof body.trace_id, `${label} trace_id 应为字符串`).toBe('string');
  expect((body.trace_id as string).length, `${label} trace_id 不应为空`).toBeGreaterThan(0);
  expect(typeof body.timestamp, `${label} timestamp 应为数字`).toBe('number');
}

test('4.20-01 改密吊销全部旧会话：会话 A/B 重放均 401，新密码可登', async ({ browser, page }) => {
  await loginViaUI(page);

  const tag = genCode('S635').replace(/-/g, '_');
  const roleCode = `e2e_s635_${tag}`.toLowerCase();
  const username = roleCode;
  const oldPassword = testPassword();
  const newPassword = `${oldPassword}_X7a`;
  expect(oldPassword.includes(username), '一次性口令不得含用户名片段').toBe(false);
  expect(newPassword.includes(username), '新口令不得含用户名片段').toBe(false);
  expect(newPassword === oldPassword, '新旧口令必须不同').toBe(false);

  const roleCreated = await apiCall<{ id?: number }>(page, 'POST', '/roles', {
    name: `e2e-s635-role-${tag}`,
    code: roleCode,
    description: '一次性改密吊销角色',
  });
  const roleId = roleCreated.data?.id;
  expect(roleId, `建角色应返回 id，实际 ${JSON.stringify(roleCreated)}`).toBeTruthy();

  const userCreated = await apiCall<{ id?: number; role_id?: number | null }>(
    page,
    'POST',
    '/users',
    { username, password: oldPassword, role_id: roleId }
  );
  const userId = userCreated.data?.id;
  expect(userId, `建用户应返回 id，实际 ${JSON.stringify(userCreated)}`).toBeTruthy();
  expect(userCreated.data?.role_id, '一次性用户须绑定新建角色').toBe(roleId);

  let sessionA: IsolatedAuthedSession | undefined;
  let sessionB: IsolatedAuthedSession | undefined;
  let bareA: APIRequestContext | undefined;
  let bareB: APIRequestContext | undefined;
  let probe: APIRequestContext | undefined;
  try {
    sessionA = await loginInIsolatedContext(browser, username, oldPassword);
    sessionB = await loginInIsolatedContext(browser, username, oldPassword);

    const cookieA = (await sessionA.context.cookies()).find(c => c.name === 'access_token')?.value;
    const cookieB = (await sessionB.context.cookies()).find(c => c.name === 'access_token')?.value;
    expect(cookieA, '会话 A 必须拿到 access_token cookie').toBeTruthy();
    expect(cookieB, '会话 B 必须拿到 access_token cookie').toBeTruthy();

    // 用 PrivateCookieJar 下发的原始 cookie 值重放（不是 JWT 明文），先证两枚旧 token 改密前可用。
    bareA = await pwRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    bareB = await pwRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!bareA || !bareB) {
      throw new Error('635 前置失败：两份裸 context 必须创建成功才能做双会话重放');
    }
    const warmA = await bareA.get(`${API_PREFIX}/auth/me`, {
      headers: { Cookie: `access_token=${cookieA}` },
    });
    const warmB = await bareB.get(`${API_PREFIX}/auth/me`, {
      headers: { Cookie: `access_token=${cookieB}` },
    });
    expect(warmA.status(), '前置：会话 A 改密前应可用').toBe(200);
    expect(warmB.status(), '前置：会话 B 改密前应可用').toBe(200);
    await warmA.dispose();
    await warmB.dispose();

    // 跨过 iat/revoked_at 的秒级边界，杜绝同秒签发同秒吊销被比较逻辑漏掉。
    await new Promise(resolve => setTimeout(resolve, 1200));

    const csrfToken = (await sessionA.context.cookies()).find(c => c.name === 'csrf_token')?.value;
    expect(csrfToken, '会话 A 必须拿到 csrf_token cookie').toBeTruthy();
    const changeResp = await sessionA.page.request.post(
      `${API_BASE}${API_PREFIX}/users/change-password`,
      {
        data: { old_password: oldPassword, new_password: newPassword },
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrfToken as string },
      }
    );
    expect(changeResp.status(), '改密应成功').toBe(200);
    const changeBody = (await changeResp.json()) as { data?: { success?: boolean } };
    expect(changeBody.data?.success, '改密响应应回显 success=true').toBe(true);

    for (const [label, bare, cookie] of [
      ['会话 A', bareA, cookieA],
      ['会话 B', bareB, cookieB],
    ] as const) {
      const replay = await bare.get(`${API_PREFIX}/auth/me`, {
        headers: { Cookie: `access_token=${cookie}` },
      });
      const body = (await replay.json()) as ApiFailureBody;
      expectRevokedEnvelope(body, replay.status(), `改密后${label}旧 token 重放`);
      await replay.dispose();
    }

    probe = await pwRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    const newLogin = await probe.post(`${API_PREFIX}/auth/login`, {
      data: { username, password: newPassword },
    });
    expect(newLogin.status(), '新密码应可登录').toBe(200);
    await newLogin.dispose();
  } finally {
    await sessionA?.close();
    await sessionB?.close();
    await bareA?.dispose();
    await bareB?.dispose();
    await probe?.dispose();
    await tryCleanup(page, 'DELETE', `/users/${userId}`, '635 一次性用户');
    await tryCleanup(page, 'DELETE', `/roles/${roleId}`, '635 一次性角色');
  }
});
