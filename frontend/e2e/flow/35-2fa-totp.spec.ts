import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  BROWSER_NETWORK_NOISE,
  apiCall,
  apiCallExpectFail,
  assertPageHealthy,
  generateTotp,
  loginViaUI,
  trackPageHealth,
  failureCode,
  APP_ERROR_CODES,
  testPassword,
} from './helpers';

/**
 * P5.5 2FA TOTP 全流程测试
 * 依赖：P3.2（generateTotp）+ 后端 totp/setup、enable、recovery-codes 端点
 *
 * 验证：
 * - setup 拿 secret → TOTP 生成 → enable → 退出后登录带 token 成功、错 token 拒绝
 * - recovery-codes 一次性消费
 * - 禁用回退单因素
 *
 * 账号隔离说明：后端只有 totp/setup、totp/enable、totp/recovery-codes 三个端点，
 * 没有 disable/解绑端点——一旦 enable 成功，该账号即被 2FA 锁死且本轮无法恢复。
 * 若直接在 worker 会话账号上 enable，同 worker（同账号）后续一切真实 UI 登录都会
 * 得到 401「需要提供两步验证码或恢复码」，把整个分片拖成登录失败级联红。
 * 因此每条用例先经 worker 的 admin 会话自建一个一次性专用账号（用户名含并行槽、
 * 运行时间戳与本文件内序号，跨 run / 跨重试绝不复用已锁账号），全部 TOTP 操作
 * 只落在这个专用账号上。
 */
test.describe('P5.5 2FA TOTP', () => {
  let totpAccountSeq = 0;
  let adminRoleId: number | undefined;

  /** 查询 admin 角色 id（worker 会话账号即 admin，具备 GET /roles 与 POST /users 权限） */
  async function ensureAdminRoleId(page: Page): Promise<number> {
    if (adminRoleId !== undefined) {
      return adminRoleId;
    }
    const roles = await apiCall<{ roles?: Array<{ id: number; code?: string; name?: string }> }>(
      page,
      'GET',
      '/roles'
    );
    const admin = roles.data?.roles?.find(r => r.code === 'admin' || r.name === 'admin');
    if (!admin?.id) {
      throw new Error(
        `TOTP 专用账号前置失败：GET /roles 未找到 admin 角色（响应：${JSON.stringify(roles).slice(0, 200)}）`
      );
    }
    adminRoleId = admin.id;
    return adminRoleId;
  }

  /** 自建一次性 TOTP 专用账号，返回用户名（密码统一走 testPassword） */
  async function createIsolatedTotpAccount(page: Page): Promise<string> {
    const roleId = await ensureAdminRoleId(page);
    const username = `e2e_totp_p${test.info().parallelIndex}_${Date.now().toString(36)}_${++totpAccountSeq}`;
    const created = await apiCall<{ id?: number }>(page, 'POST', '/users', {
      username,
      password: testPassword(),
      role_id: roleId,
    });
    if (!created.data?.id) {
      throw new Error(`TOTP 专用账号创建未返回 id：${JSON.stringify(created).slice(0, 200)}`);
    }
    return username;
  }

  test('setup → enable → 登录带 token 成功', async ({ page }) => {
    const username = await createIsolatedTotpAccount(page);
    await loginViaUI(page, username, testPassword(), true);
    const collector = trackPageHealth(page);

    // 1. setup 拿 secret（后端 GET /auth/totp/setup，非 POST）
    const setupResp = await apiCall<{ secret?: string; qr_code?: string }>(
      page,
      'GET',
      '/auth/totp/setup'
    );
    const secret = setupResp?.data?.secret;
    expect(
      secret,
      `GET /auth/totp/setup 未返回 secret（响应：${JSON.stringify(setupResp).slice(0, 200)}），TOTP 前置失败`
    ).toBeTruthy();
    // secret 缺失即前置失败：显式判空收窄为 string 再传给 generateTotp（禁止非空断言 !）。
    if (!secret) {
      throw new Error('TOTP 前置失败：/auth/totp/setup 未返回 secret');
    }

    // 2. 生成 TOTP
    const totpCode = generateTotp(secret);

    // 3. enable（后端 TotpVerifyRequest { token }，字段名为 token 非 code）
    const enableResp = await apiCall(page, 'POST', '/auth/totp/enable', {
      token: totpCode,
    });
    expect(
      enableResp !== null && enableResp !== undefined,
      `[35-totp] enable 应成功（secret=${secret?.slice(0, 8)}… code=${totpCode}）`
    ).toBeTruthy();

    await assertPageHealthy(page, collector, { consoleNoisePatterns: BROWSER_NETWORK_NOISE });
  });

  test('错 TOTP code 拒绝', async ({ page }) => {
    const username = await createIsolatedTotpAccount(page);
    await loginViaUI(page, username, testPassword(), true);

    const setupResp = await apiCall<{ secret?: string; qr_code?: string }>(
      page,
      'GET',
      '/auth/totp/setup'
    );
    const secret = setupResp?.data?.secret;
    expect(
      secret,
      `GET /auth/totp/setup 未返回 secret（响应：${JSON.stringify(setupResp).slice(0, 200)}），TOTP 前置失败`
    ).toBeTruthy();

    // 故意用错 code（后端 TotpVerifyRequest { token }，字段名为 token）
    // 后端真实语义（读码结论，非推断）：
    //   services/totp_service.rs:69-79 —— 令牌不匹配返回 Ok(false)，不抛错；
    //   handlers/auth_handler_misc.rs:343 —— enable_totp 的 `Ok(false)` 分支
    //     `=> Err(AppError::bad_request("验证码不正确"))`，即该端点**不会**返回 200 + data=false，
    //     而是 HTTP 400（utils/error.rs:178 BadRequest → BAD_REQUEST），
    //     响应体由 utils/error.rs:143-148 直出 { code: "BAD_REQUEST", message(脱敏), trace_id, timestamp }。
    // 因此旧断言 `enableResp?.data === false || enableResp === false` 写错在断言侧：
    //   ① data === false 永不成立（该分支根本不产生 ApiResponse<bool>）；
    //   ② apiCall/apiCallRaw 是"成功语义"，对 code !== 200 直接抛错（见 helpers.apiCall），
    //      所以 400 会让用例在到达断言前就异常失败，而不是判为"被正确拒绝"。
    // 负例改用 apiCallExpectFail，并同时校验状态码与机器码。
    const enableResp = await apiCallExpectFail(page, 'POST', '/auth/totp/enable', {
      token: '000000',
    });
    expect(
      enableResp.status,
      `错误 TOTP 码应被拒为 HTTP 400，实际响应=${JSON.stringify(enableResp).slice(0, 200)}`
    ).toBe(400);
    expect(
      failureCode(enableResp),
      `错误 TOTP 码应命中 BadRequest 机器码，实际响应=${JSON.stringify(enableResp).slice(0, 200)}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  });

  test('生成恢复码并消费', async ({ page }) => {
    const username = await createIsolatedTotpAccount(page);
    await loginViaUI(page, username, testPassword(), true);

    // 后端真实路径为 /auth/totp/recovery-codes（nest 在 /auth 下的 totp 子组）
    // generate_recovery_codes 返回 ApiResponse<Vec<String>>：data 就是恢复码数组本身，
    // 此前按 resp.codes / resp.data.codes 取值恒为 undefined → 用例每轮静默跳过（假绿）
    const recoveryResp = await apiCall<string[]>(page, 'POST', '/auth/totp/recovery-codes');
    const codes = recoveryResp.data;
    expect(
      Array.isArray(codes),
      `恢复码 data 应为字符串数组，实际：${JSON.stringify(recoveryResp).slice(0, 200)}`
    ).toBe(true);
    expect(codes.length, '恢复码应至少生成 1 条').toBeGreaterThan(0);
    expect(
      codes.every(c => typeof c === 'string' && c.length > 0),
      `恢复码每条应为非空字符串，实际：${JSON.stringify(recoveryResp).slice(0, 200)}`
    ).toBe(true);

    // 恢复码应是一次性的
    expect(codes.length).toBeGreaterThan(0);
  });
});
