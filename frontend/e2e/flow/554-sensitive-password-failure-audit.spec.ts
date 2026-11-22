// 功能：敏感路径改密失败也留 omni 审计，整请求体逐字符 REDACTED，失败信封与响应头 trace 同源。
// 调用方：Playwright flow 分片；每例管理员前置建临时账号，两个独立身份会话，例末清理。
// 入参：无（管理员凭证来自 role-credentials.json，临时账号口令由本例生成）。
// 传给谁：POST /users/change-password（错误旧口令）、GET /finance/audit/search?include_sensitive=true、POST /auth/login 回读副作用。
// 存什么：users 一行临时账号；审计行只读不写。存哪里：users 表；omni 审计行由中间件异步落库。
//
// 判据来源：真实敏感路由按路由表登记的口令修改端点；
// 新口令强度先验、错旧口令返回未授权且不触达改库；
// 审计中间件对命中整请求做脱敏；
// 追踪编号中间件让请求头与错误信封的链路编号同源；
// 未授权为既定机器码；
// 审计行按建档动作落库，
// 其中 DENIED 状态回退落 response_status=403（不是 HTTP 401），本例按写入方取值断言；
// 管理员门与敏感列出参由查询侧约束。
import { test, expect, type Page } from '../diagnose-fixture';
import type { Browser } from '@playwright/test';
import { applyAuthMocks } from '../smoke/_helpers';
import { API_BASE, API_PREFIX, apiCallRaw, getRoleCredential, tryCleanup } from './helpers';

interface AuditRow {
  id: number;
  trace_id: string;
  user_id: number;
  username: string;
  module: string;
  action: string;
  request_method: string;
  request_path: string;
  response_status: number;
  request_body?: string;
  user_agent?: string;
  ip_address?: string;
}

interface AuditSearchData {
  items: AuditRow[];
  total: number;
}

interface RoleCredential {
  username: string;
  password: string;
}

function stamp(): string {
  return `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
}

function requiredCredential(role: string): RoleCredential {
  const cred = getRoleCredential(role);
  if (!cred) {
    throw new Error(`role-credentials.json 缺少 ${role} 凭证，554 无法真实登录，判红不跳过`);
  }
  return cred;
}

/** storageState 显式置空后真实登录，不继承 fixture 的共享会话 */
async function isolatedSession(
  browser: Browser,
  cred: RoleCredential
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  await applyAuthMocks(context, cred);
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.close();
    },
  };
}

interface RawResponse {
  status: number;
  json: Record<string, unknown>;
  traceId: string;
}

/** 原始 HTTP 调用：apiCallExpectFail 不回响应头，这里保留同一 CSRF 头约定取 X-Trace-Id */
async function fetchWithTrace(
  page: Page,
  method: 'POST',
  path: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value;
  if (!csrf) {
    throw new Error(`554 原始 HTTP ${method} ${path} 缺少 csrf_token cookie，前置未登录`);
  }
  const response = await page.request.fetch(`${API_BASE}${API_PREFIX}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': csrf,
    },
    data: JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `554 ${method} ${path} 非 JSON 响应 HTTP ${response.status()}: ${text.slice(0, 200)}`
    );
  }
  const traceId = response.headers()['x-trace-id'];
  if (typeof traceId !== 'string') {
    throw new Error(`554 ${method} ${path} 缺 X-Trace-Id 响应头，无法做 trace 同源断言`);
  }
  return { status: response.status(), json, traceId };
}

test('554-01 错旧口令失败留整请求 REDACTED 审计，三方 trace 同源且原口令仍可登录', async ({
  browser,
}) => {
  const admin = await isolatedSession(browser, requiredCredential('admin'));
  let userId: number | undefined;
  try {
    const s = stamp();
    const username = `e2ea554${s}`;
    const password = ['Aa9', s, 'Zx7', '#'].join('');
    const wrongOld = ['WrongOld', s, '#Qq8'].join('');
    const nextPassword = ['NewPwd', s, '#Zx9', 'a'].join('');
    const created = await apiCallRaw<{ id: number }>(admin.page, 'POST', '/users', {
      username,
      password,
      email: `p554${s}@example.com`,
      phone: `137${s.slice(0, 8)}`,
    });
    if (!Number.isFinite(created.id)) {
      throw new Error(`554 自建用户未返回主键: ${JSON.stringify(created)}`);
    }
    userId = created.id;

    const subject = await isolatedSession(browser, { username, password });
    let failed: RawResponse;
    try {
      failed = await fetchWithTrace(subject.page, 'POST', '/users/change-password', {
        old_password: wrongOld,
        new_password: nextPassword,
      });
    } finally {
      await subject.close();
    }
    expect(failed.status).toBe(401);
    expect(failed.json.code).toBe('UNAUTHORIZED');
    expect(typeof failed.json.trace_id).toBe('string');
    expect(failed.json.trace_id).toBe(failed.traceId);
    expect(failed.traceId).toMatch(/^[0-9a-f]{32}$/);

    const day = new Date().toISOString().slice(0, 10);
    const query =
      `/finance/audit/search?user_id=${userId}&event_type=CREATE` +
      `&start_date=${day}&end_date=${day}&page=1&page_size=100&include_sensitive=true`;
    let auditRow: AuditRow | undefined;
    await expect
      .poll(
        async () => {
          const result = await apiCallRaw<AuditSearchData>(admin.page, 'GET', query);
          if (!Array.isArray(result.items) || typeof result.total !== 'number') {
            throw new Error(`554 审计检索出参必须是 data.items/total: ${JSON.stringify(result)}`);
          }
          auditRow = result.items.find(
            item =>
              item.trace_id === failed.traceId &&
              item.request_path === `${API_PREFIX}/users/change-password`
          );
          return auditRow !== undefined;
        },
        { timeout: 30_000, intervals: [500, 1000, 2000] }
      )
      .toBe(true);
    if (!auditRow) {
      throw new Error('554 失败请求的审计行未在有限轮询内落库，不以空集冒充通过');
    }
    const row = auditRow;
    expect(Object.keys(row)).toContain('request_body');
    expect(Object.keys(row)).toContain('user_agent');
    expect(Object.keys(row)).toContain('ip_address');
    expect(row.request_body).toBe('[REDACTED]');
    expect(row.request_body).not.toContain(wrongOld);
    expect(row.request_body).not.toContain(nextPassword);
    expect(row.request_body).not.toContain(password);
    expect(row.trace_id).toBe(failed.traceId);
    expect(row.user_id).toBe(userId);
    expect(row.module).toBe('CREATE');
    expect(row.action).toBe(`POST ${API_PREFIX}/users/change-password`);
    expect(row.request_method).toBe('POST');
    expect(row.request_path).toBe(`${API_PREFIX}/users/change-password`);
    expect(row.response_status).toBe(403);

    const relogin = await isolatedSession(browser, { username, password });
    try {
      const me = await apiCallRaw<{ id: number }>(relogin.page, 'GET', '/auth/me');
      expect(me.id).toBe(userId);
    } finally {
      await relogin.close();
    }
  } finally {
    if (userId !== undefined) {
      await tryCleanup(admin.page, 'DELETE', `/users/${userId}`, '554 临时用户');
    }
    await admin.close();
  }
});
