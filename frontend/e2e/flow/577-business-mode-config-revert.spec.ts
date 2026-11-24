// 4.24 配置误改回滚 E2E — flow/577-business-mode-config-revert
// 功能：业务模式配置改错后，变更留痕可按 trace 关联，回放旧值后配置与行为恢复、留痕可查。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；取现有 6 种种子模式之一改其 description，不新建/删除封闭词表模式。
// 传给谁：GET /production/business-modes 取现有模式 → GET /production/business-modes/{id} 读原值 A →
//   PUT /production/business-modes/{id} 改 description=B → GET /finance/audit/search 查变更留痕 →
//   PUT 回放 description=A → GET 详情核对恢复 → GET /finance/audit/search 查回滚留痕。
// 存什么：business_mode_config 行（description 由 A→B→A，其余列不动）；omni_audit_logs 行只读不写。
// 存哪里：business_mode_config 表；omni_audit_logs 表（中间件异步落库）。
// 口径说明：报告明确"变更记录由全局审计提供，回滚是当前版本通过旧值回放实现，无配置专用一键回滚端点"；
//   business_mode_ops 无 AuditLogService 调用，故留痕走 omni 中间件（/finance/audit/search，含 trace_id 与
//   按需 request_body），与 553 同范式；本例不假设一键回滚 UI/API。
//   后端判据：production.rs 注册 PUT /production/business-modes/{id}；UpdateBusinessModeConfigRequest
//   description 为 Option，局部提交只改提供列；trace_id 由链路中间件写入响应头 X-Trace-Id 与审计行。
import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
import {
  apiCallRaw,
  API_BASE,
  API_PREFIX,
  genCode,
  isCsrfRejection,
  type ApiFailureBody,
} from './helpers';

interface ModeRow {
  id?: number;
  mode_code?: string;
  mode_name?: string;
  description?: string | null;
}
interface RawResponse {
  status: number;
  json: Record<string, unknown>;
  traceId: string;
}
interface AuditSearchData {
  items?: Array<Record<string, unknown>>;
  total?: number;
}

/**
 * 取响应头 X-Trace-Id 的原始 PUT：审计行 trace_id 须与响应头逐字符同源，helper 的 apiCall 不回响应头。
 * CSRF token 一次性消费（csrf.rs consume + Set-Cookie 轮换），页面后台写（/ws/ticket 心跳建票）
 * 会与本次写竞态消费同一 token，故沿用 helpers.apiCall 同款有界重放：拒绝响应头
 * x-new-csrf-token 即后端下发的新活 token，回写 cookie 后重放；重放耗尽仍 CSRF 拒绝属会话面失败，判红不放过。
 */
async function putWithTrace(
  page: Page,
  path: string,
  body: Record<string, unknown>
): Promise<RawResponse> {
  const url = `${API_BASE}${API_PREFIX}${path}`;
  const csrfCookie = async (): Promise<string> => {
    const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value;
    if (!csrf) {
      throw new Error(`577 原始 PUT ${path} 缺少 csrf_token cookie，前置未登录`);
    }
    return csrf;
  };
  const doFetch = (token: string): Promise<APIResponse> =>
    page.request.fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': token,
      },
      data: JSON.stringify(body),
    });
  const parseBody = async (res: APIResponse): Promise<Record<string, unknown>> => {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`577 PUT ${path} 非 JSON HTTP ${res.status()}: ${text.slice(0, 200)}`);
    }
  };

  let response = await doFetch(await csrfCookie());
  let json = await parseBody(response);
  for (
    let attempt = 1;
    attempt <= 2 && isCsrfRejection(response.status(), json as ApiFailureBody);
    attempt++
  ) {
    const recovery = response.headers()['x-new-csrf-token'];
    if (!recovery) break;
    await page.context().addCookies([{ name: 'csrf_token', value: recovery, url }]);
    response = await doFetch(recovery);
    json = await parseBody(response);
  }
  if (isCsrfRejection(response.status(), json as ApiFailureBody)) {
    throw new Error(
      `577 PUT ${path} 被 CSRF 中间件拒绝且重放耗尽（status=${response.status()} code=${String(json.code)}）` +
        `——属会话面失败非业务拒绝，判红不放过`
    );
  }
  const traceId = response.headers()['x-trace-id'];
  if (typeof traceId !== 'string') {
    throw new Error(`577 PUT ${path} 缺 X-Trace-Id 响应头，无法做 trace 同源断言`);
  }
  return { status: response.status(), json, traceId };
}

function auditQueryPath(day: string, requestPath: string, traceId: string): string {
  return (
    `/finance/audit/search?event_type=UPDATE&request_path=${encodeURIComponent(requestPath)}` +
    `&trace_id=${encodeURIComponent(traceId)}&start_date=${day}&end_date=${day}&page=1&page_size=100`
  );
}

function auditDescription(row: Record<string, unknown>): unknown {
  if (typeof row.request_body !== 'string') return undefined;
  try {
    const parsed = JSON.parse(row.request_body) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return (parsed as Record<string, unknown>).description;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function isExactAuditHit(
  row: Record<string, unknown>,
  requestPath: string,
  traceId: string,
  description: string
): boolean {
  return (
    row.module === 'UPDATE' &&
    row.request_path === requestPath &&
    row.trace_id === traceId &&
    auditDescription(row) === description
  );
}

let restoreTarget: { page: Page; path: string; description: string } | undefined;

test.afterEach(async () => {
  if (!restoreTarget) return;
  const target = restoreTarget;
  restoreTarget = undefined;
  const restored = await putWithTrace(target.page, target.path, {
    description: target.description,
  });
  expect(restored.status, '失败收口仍须成功恢复业务模式原值').toBe(200);
  const readback = await apiCallRaw<ModeRow>(target.page, 'GET', target.path);
  expect(String(readback.description ?? ''), '失败收口后业务模式须恢复原值').toBe(
    target.description
  );
});

test('577-01 配置改错后留痕可关联且回放旧值恢复配置与行为', async ({ page }: { page: Page }) => {
  // 取现有模式作为被改对象（封闭词表，不新建）。选 first 即可，改 description 不影响其他列。
  const list = await apiCallRaw<{ items: ModeRow[] }>(
    page,
    'GET',
    '/production/business-modes?page=1&page_size=50'
  );
  const mode = (list.items ?? []).find(m => Number(m.id) > 0);
  expect(mode, '须存在至少一种种子业务模式作为被改对象').toBeDefined();
  if (!mode?.id) throw new Error('577 未取得可改业务模式主键，后续断言不可执行');
  const modeId = mode.id;
  const path = `/production/business-modes/${modeId}`;

  const before = await apiCallRaw<ModeRow>(page, 'GET', path);
  const original = String(before.description ?? '');
  const tag = genCode('577A');
  const changed = `${original}｜误改${tag}`;
  expect(changed, '误改值须与原值不同，否则本例无可观察变化').not.toBe(original);
  restoreTarget = { page, path, description: original };

  // 误改：用带 trace 的原始 PUT，便于后续把审计行与本次写操作逐字符关联。
  const putA = await putWithTrace(page, path, { description: changed });
  expect(putA.status, '误改 PUT 须成功').toBe(200);
  expect(String(putA.json.code), '误改响应须 success 信封').toBe('200');
  expect(putA.traceId, 'X-Trace-Id 须为 32 位十六进制').toMatch(/^[0-9a-f]{32}$/);

  const afterChange = await apiCallRaw<ModeRow>(page, 'GET', path);
  expect(String(afterChange.description ?? ''), '误改后 description 须为 B').toBe(changed);

  // 留痕：omni 审计按 request_path 与 trace_id 定位本次变更，断言请求体含误改值 B。
  // 审计由中间件异步落库，按 553 范式用 expect.poll 等行，避免同步查空集假红。
  const day = new Date().toISOString().slice(0, 10);
  const reqPath = `${API_PREFIX}${path}`;
  let hitSensitive: Record<string, unknown> | undefined;
  let sensitiveTotal: number | undefined;
  await expect
    .poll(
      async () => {
        const sensitive = await apiCallRaw<AuditSearchData>(
          page,
          'GET',
          `${auditQueryPath(day, reqPath, putA.traceId)}&include_sensitive=true`
        );
        expect(Array.isArray(sensitive.items), '审计检索必须返回 items').toBe(true);
        if (!Array.isArray(sensitive.items)) {
          throw new Error('577 审计检索缺少 items，无法关联误改留痕');
        }
        for (const item of sensitive.items) {
          expect(item.module, 'event_type=UPDATE 必须精确过滤模块').toBe('UPDATE');
          expect(item.request_path, 'request_path 必须精确过滤请求路径').toBe(reqPath);
          expect(item.trace_id, 'trace_id 必须精确过滤本次链路').toBe(putA.traceId);
        }
        sensitiveTotal = sensitive.total;
        hitSensitive = sensitive.items.find(item =>
          isExactAuditHit(item, reqPath, putA.traceId, changed)
        );
        return hitSensitive !== undefined;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] }
    )
    .toBe(true);
  expect(sensitiveTotal, '路径与 trace 精确过滤必须只命中一条').toBe(1);
  expect(hitSensitive, '误改审计行必须落地').toBeDefined();
  expect(
    auditDescription(hitSensitive as Record<string, unknown>),
    '审计请求体须保留误改值 B'
  ).toBe(changed);

  const nonSensitive = await apiCallRaw<AuditSearchData>(
    page,
    'GET',
    auditQueryPath(day, reqPath, putA.traceId)
  );
  expect(Array.isArray(nonSensitive.items), '默认审计检索必须返回 items').toBe(true);
  if (!Array.isArray(nonSensitive.items)) {
    throw new Error('577 默认审计检索缺少 items，无法验证敏感字段省略');
  }
  expect(nonSensitive.total, '默认检索与敏感检索须命中同一审计行').toBe(1);
  expect(nonSensitive.items).toHaveLength(1);
  for (const item of nonSensitive.items) {
    expect('request_body' in item, '默认检索不得返回 request_body').toBe(false);
    expect('user_agent' in item, '默认检索不得返回 user_agent').toBe(false);
    expect('ip_address' in item, '默认检索不得返回 ip_address').toBe(false);
  }

  // 回放：把 description 改回原值 A（无专用回滚端点，按写入方旧值回放口径）。
  const putB = await putWithTrace(page, path, { description: original });
  expect(putB.status, '回放 PUT 须成功').toBe(200);
  expect(String(putB.json.code), '回放响应须 success 信封').toBe('200');
  expect(putB.traceId, '回滚腿也须拿到 trace 以关联回滚审计').toMatch(/^[0-9a-f]{32}$/);

  // 行为与配置恢复：description 回到 A；模式主数据（mode_code）未被误改腿动过。
  const afterRevert = await apiCallRaw<ModeRow>(page, 'GET', path);
  expect(String(afterRevert.description ?? ''), '回放后 description 须恢复原值 A').toBe(original);
  expect(afterRevert.mode_code, '回滚后 mode_code 须与基线一致，行为标识未被改动').toBe(
    before.mode_code
  );
  restoreTarget = undefined;

  // 回滚也须留痕：omni 审计可查到回滚腿的 trace（异步落库，poll 等待）。
  let hitRevert: Record<string, unknown> | undefined;
  let revertTotal: number | undefined;
  await expect
    .poll(
      async () => {
        const audit2 = await apiCallRaw<AuditSearchData>(
          page,
          'GET',
          `${auditQueryPath(day, reqPath, putB.traceId)}&include_sensitive=true`
        );
        expect(Array.isArray(audit2.items), '回滚审计检索必须返回 items').toBe(true);
        if (!Array.isArray(audit2.items)) {
          throw new Error('577 回滚审计检索缺少 items，无法关联回滚留痕');
        }
        for (const item of audit2.items) {
          expect(item.module, '回滚 event_type=UPDATE 必须精确过滤模块').toBe('UPDATE');
          expect(item.request_path, '回滚 request_path 必须精确过滤请求路径').toBe(reqPath);
          expect(item.trace_id, '回滚 trace_id 必须精确过滤本次链路').toBe(putB.traceId);
        }
        revertTotal = audit2.total;
        hitRevert = audit2.items.find(item =>
          isExactAuditHit(item, reqPath, putB.traceId, original)
        );
        return hitRevert !== undefined;
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] }
    )
    .toBe(true);
  expect(revertTotal, '回滚路径与 trace 精确过滤必须只命中一条').toBe(1);
  expect(hitRevert, '回滚审计行必须落地').toBeDefined();
  expect(auditDescription(hitRevert as Record<string, unknown>), '回滚审计请求体须保留原值 A').toBe(
    original
  );
});
