// 功能：omni 审计对自建用户改 phone/email 的请求体做字段级 PII 掩码，敏感列按需出参，trace_id 与响应头同源。
// 调用方：Playwright flow 分片；每例自建独立上下文与临时账号，例末清理。
// 入参：无（管理员与收银员凭证来自 role-credentials.json，临时用户由管理员前置创建）。
// 传给谁：PUT /users/{id}、GET /finance/audit/search（默认与 include_sensitive=true 两次）、非管理员 GET 同端点。
// 存什么：users 一行临时账号；omni_audit_logs 行只读不写。存哪里：users 表；审计行由中间件异步落库。
//
// 判据来源：审计中间件只对审计副本做字段级隐私脱敏，请求正文原样透传；
// 脱敏工具对手机号与邮箱按固定形态掩码；查询接口只返回约定分页信封，敏感列按需选择
// 并逐行回读；查询服务默认不返回敏感列，审计服务按既定状态词写入；
// 链路编号中间件把请求头与响应信封的追踪编号对齐；非管理员另有二道门；
// 挂载点按路由表登记的财务域路径为准。
// 上述语义均来自写入方实现，避免在此重复脆弱的行号引用。
import { test, expect, type Page } from '../diagnose-fixture';
import type { Browser } from '@playwright/test';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  getRoleCredential,
  tryCleanup,
} from './helpers';

interface AuditRow {
  id: number;
  trace_id: string;
  user_id: number;
  username: string;
  module: string;
  action: string;
  resource_type: string;
  resource_id: string;
  description: string;
  request_method: string;
  request_path: string;
  response_status: number;
  created_at: string;
  request_body?: string;
  user_agent?: string;
  ip_address?: string;
}

interface AuditSearchData {
  items: AuditRow[];
  total: number;
}

interface UserData {
  id: number;
  email?: string | null;
  phone?: string | null;
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
    throw new Error(`role-credentials.json 缺少 ${role} 凭证，553 无法真实登录，判红不跳过`);
  }
  return cred;
}

/** storageState 显式置空后以真实登录建立隔离会话，不继承 fixture 的任何共享身份 */
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

/**
 * 取响应头 X-Trace-Id 的原始 HTTP 调用：helper 的 apiCall 只回信封不回响应头，
 * 这里保留同一 CSRF 头约定，让审计行 trace_id 能与响应头逐字符比对。
 */
async function fetchWithTrace(
  page: Page,
  method: 'PUT',
  path: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value;
  if (!csrf) {
    throw new Error(`553 原始 HTTP ${method} ${path} 缺少 csrf_token cookie，前置未登录`);
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
      `553 ${method} ${path} 非 JSON 响应 HTTP ${response.status()}: ${text.slice(0, 200)}`
    );
  }
  const traceId = response.headers()['x-trace-id'];
  if (typeof traceId !== 'string') {
    throw new Error(`553 ${method} ${path} 缺 X-Trace-Id 响应头，无法做 trace 同源断言`);
  }
  return { status: response.status(), json, traceId };
}

function auditQuery(userId: number, day: string): string {
  return (
    `/finance/audit/search?user_id=${userId}&event_type=UPDATE` +
    `&start_date=${day}&end_date=${day}&page=1&page_size=100`
  );
}

test.describe.serial('553 omni 审计 PII 字段掩码、敏感列按需与 trace 同源', () => {
  test('553-01 改手机号邮箱：默认无敏感列，按需出参三键且逐键保留固定掩码，trace 与响应头同源', async ({
    browser,
  }) => {
    const admin = await isolatedSession(browser, requiredCredential('admin'));
    let userId: number | undefined;
    try {
      const adminMe = await apiCallRaw<{ id: number }>(admin.page, 'GET', '/auth/me');
      if (!Number.isFinite(adminMe.id)) {
        throw new Error(`553 管理员 /auth/me 未返回有效 id: ${JSON.stringify(adminMe)}`);
      }
      const s = stamp();
      const username = `e2ea553${s}`;
      const newPhone = `13${s.slice(0, 9)}`;
      const newEmail = `a553${s}@example.com`;
      const password = ['Aa9', s, 'Zx7', '#'].join('');
      const created = await apiCallRaw<{ id: number }>(admin.page, 'POST', '/users', {
        username,
        password,
        email: `init553${s}@example.com`,
        phone: `139${s.slice(0, 8)}`,
      });
      if (!Number.isFinite(created.id)) {
        throw new Error(`553 自建用户未返回主键: ${JSON.stringify(created)}`);
      }
      userId = created.id;
      const path = `/users/${userId}`;
      const put = await fetchWithTrace(admin.page, 'PUT', path, {
        email: newEmail,
        phone: newPhone,
      });
      expect(put.status).toBe(200);
      expect(put.json.code).toBe(200);
      const data = put.json.data as UserData | undefined;
      expect(data?.id).toBe(userId);
      expect(data?.email).toBe(newEmail);
      expect(data?.phone).toBe(newPhone);
      expect(put.traceId).toMatch(/^[0-9a-f]{32}$/);

      const day = new Date().toISOString().slice(0, 10);
      const query = auditQuery(adminMe.id, day);
      let defaultRow: AuditRow | undefined;
      await expect
        .poll(
          async () => {
            const result = await apiCallRaw<AuditSearchData>(admin.page, 'GET', query);
            if (!Array.isArray(result.items) || typeof result.total !== 'number') {
              throw new Error(`553 审计检索出参必须是 data.items/total: ${JSON.stringify(result)}`);
            }
            defaultRow = result.items.find(
              item => item.trace_id === put.traceId && item.request_path === `${API_PREFIX}${path}`
            );
            return defaultRow !== undefined;
          },
          { timeout: 30_000, intervals: [500, 1000, 2000] }
        )
        .toBe(true);
      if (!defaultRow) {
        throw new Error('553 审计行未在有限轮询内落库，不以空集冒充通过');
      }
      const row = defaultRow;
      expect(Object.keys(row)).not.toContain('request_body');
      expect(Object.keys(row)).not.toContain('user_agent');
      expect(Object.keys(row)).not.toContain('ip_address');
      expect(row.trace_id).toBe(put.traceId);
      expect(row.user_id).toBe(adminMe.id);
      expect(row.module).toBe('UPDATE');
      expect(row.action).toBe(`PUT ${API_PREFIX}${path}`);
      expect(row.request_method).toBe('PUT');
      expect(row.request_path).toBe(`${API_PREFIX}${path}`);
      expect(row.response_status).toBe(200);

      const sensitive = await apiCallRaw<AuditSearchData>(
        admin.page,
        'GET',
        `${query}&include_sensitive=true`
      );
      expect(Array.isArray(sensitive.items)).toBe(true);
      const sensitiveRow = sensitive.items.find(
        item => item.trace_id === put.traceId && item.request_path === `${API_PREFIX}${path}`
      );
      if (!sensitiveRow) {
        throw new Error('553 include_sensitive=true 未取回同一 trace 的审计行');
      }
      expect(Object.keys(sensitiveRow)).toContain('request_body');
      expect(Object.keys(sensitiveRow)).toContain('user_agent');
      expect(Object.keys(sensitiveRow)).toContain('ip_address');
      expect(typeof sensitiveRow.request_body).toBe('string');
      expect(typeof sensitiveRow.user_agent).toBe('string');
      expect(typeof sensitiveRow.ip_address).toBe('string');
      expect(sensitiveRow.request_body).toContain('"phone":"1***********"');
      expect(sensitiveRow.request_body).toContain('"email":"***@***.***"');
      expect(sensitiveRow.request_body).not.toContain(newPhone);
      expect(sensitiveRow.request_body).not.toContain(newEmail);
      expect(sensitiveRow.trace_id).toBe(put.traceId);
    } finally {
      if (userId !== undefined) {
        await tryCleanup(admin.page, 'DELETE', `/users/${userId}`, '553 临时用户');
      }
      await admin.close();
    }
  });

  test('553-02 非管理员对同一检索即使带 include_sensitive=true 也被二道门拒绝', async ({
    browser,
  }) => {
    const cashier = await isolatedSession(browser, requiredCredential('cashier'));
    try {
      const denied = await apiCallExpectFail(
        cashier.page,
        'GET',
        '/finance/audit/search?include_sensitive=true&page=1&page_size=10'
      );
      expect(denied.status).toBe(403);
      expect(failureCode(denied)).toBe(APP_ERROR_CODES.FORBIDDEN);
    } finally {
      await cashier.close();
    }
  });
});
