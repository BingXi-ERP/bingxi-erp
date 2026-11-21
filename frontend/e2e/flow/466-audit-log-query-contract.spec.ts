import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { loginViaUI, loginAsRole, apiCall, apiCallRaw, apiCallExpectFail } from './helpers';

/**
 * 466 审计日志查询契约与 admin 门控（目标 3.3 操作审计留痕 / 4.11 审计不可篡改 / 4.33 审计合规）
 *
 * 补齐 05-system 5-1「列表非空」之外的三个真值面：
 * - admin 门控：list_audit_logs（audit_log_handler.rs:170-176）首行 require_admin_role，
 *   非 admin 取列表必被拒；这是"审计日志不是谁都能查"的后端硬约束。
 * - 查询信封与分页 clamp：出参 ApiResponse<AuditLogListResponse>，条目键全 snake_case
 *   （audit_log_handler.rs:100-120 / :162-167）；page 下限 1、page_size clamp(1,100)（:178-179）。
 * - resource_id 精确匹配：后端 AuditLogListQuery 注释（:74-76）明示 keyword=5 会命中
 *   resource_id=15 的行，而 resource_id 参数只命中恰好等于 5 的行——用"取一条日志的
 *   resource_id 作子串反查"验证不会把包含匹配的行带进来，这是最容易被 LIKE 实现改坏的边界。
 *
 * 端点唯一事实来源 frontend/scripts/route-snapshot.txt:225（GET /audit-logs → list_audit_logs，
 * system 域）。另一套 audit_enhanced_handler 挂 analytics 域 /logs、出参键 list，与本端点不可混用。
 * 失败一律钉 HTTP 码 + 机器码在场；不用 ?? 掩盖缺键、不把 404/403 当健康绿。
 */

type AuditRow = Record<string, unknown>;

function asObject(v: unknown, leg: string): Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error(`[${leg}] 期望对象，实际 ${JSON.stringify(v)}`);
  }
  return v as Record<string, unknown>;
}

async function getAuditList(
  page: Page,
  qs: string,
  leg: string
): Promise<{
  items: AuditRow[];
  total: number;
  page: number;
  page_size: number;
}> {
  const env = await apiCall<Record<string, unknown>>(page, 'GET', `/audit-logs${qs}`);
  expect(env.code, `[${leg}] 成功信封 code 必须为 200，实际 ${String(env.code)}`).toBe(200);
  const data = asObject(env.data, leg);
  if (!Array.isArray(data.items)) {
    throw new Error(`[${leg}] 出参 items 必须是数组，实际 ${JSON.stringify(data.items)}`);
  }
  return {
    items: data.items as AuditRow[],
    total: Number(data.total),
    page: Number(data.page),
    page_size: Number(data.page_size),
  };
}

test.describe.serial('466 审计日志查询契约与 admin 门控', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('466-01 admin 查询信封字段齐全且分页参数按后端 clamp', async ({ page }) => {
    const list = await getAuditList(page, '?page=0&page_size=1000', '466-01');
    expect(list.page, '466-01 page=0 必须被钳到 1（handler.rs:178）').toBe(1);
    expect(list.page_size, '466-01 page_size=1000 必须被钳到 100（handler.rs:179）').toBe(100);
    expect(Number.isFinite(list.total), `466-01 total 必须是数值，实际 ${list.total}`).toBe(true);

    for (const row of list.items.slice(0, 5)) {
      for (const key of ['id', 'operation_type', 'resource_type', 'created_at']) {
        expect(
          Object.prototype.hasOwnProperty.call(row, key),
          `466-01 审计条目必须含 snake_case 键 ${key}，实际键 ${Object.keys(row).join(',')}`
        ).toBe(true);
      }
    }
    console.log(
      `[466-01] clamp 后 page=${list.page} page_size=${list.page_size} total=${list.total}`
    );
  });

  test('466-02 非 admin 角色查询审计日志被 admin 门控拒绝', async ({ page }) => {
    await loginAsRole(page, 'gm');
    const denied = await apiCallExpectFail(page, 'GET', '/audit-logs?page=1&page_size=20');
    console.log(`[466-02] 非 admin 查询 status=${denied.status} code=${denied.code}`);
    expect(
      denied.status,
      `466-02 非 admin 查审计必须被拒（403），实际 status=${denied.status}`
    ).toBe(403);
    expect(
      typeof denied.code === 'string' || typeof denied.code === 'number' ? denied.code : '<缺失>',
      '466-02 拒绝信封必须带机器码（不得是裸错误）'
    ).toBeTruthy();
  });

  test('466-03 resource_id 参数精确匹配，不把包含匹配的行带进来', async ({ page }) => {
    const first = await getAuditList(page, '?page=1&page_size=100', '466-03-种子');
    const seed = first.items.find(r => {
      const v = r.resource_id;
      return typeof v === 'string' && v.trim().length >= 1;
    });
    const seedId = seed ? String(seed.resource_id) : '';
    expect(
      seedId.length > 0,
      `466-03 前置：需一条 resource_id 非空的日志作种子，实际样本 ${first.items
        .map(r => r.resource_id)
        .slice(0, 8)
        .join(',')}`
    ).toBe(true);

    // 用种子完整 resource_id 反查：精确实现会命中它自己及同值行；
    // 若实现是 LIKE %seedId%，则会带出 resource_id 不同的行（如 seed=15 带出 150/115），被 below 断言抓到。
    const exact = await getAuditList(
      page,
      `?resource_id=${encodeURIComponent(seedId)}&page=1&page_size=100`,
      '466-03-精确'
    );
    expect(
      exact.items.length > 0,
      `466-03 用种子 resource_id=${seedId} 反查必须至少命中它自己（否则查询参数未生效），实际 ${exact.items.length} 条`
    ).toBe(true);
    for (const row of exact.items) {
      expect(
        String(row.resource_id),
        `466-03 resource_id=${seedId} 的结果里不得出现不同值（后端注释 :74-76 要求精确命中），实际 ${String(row.resource_id)}`
      ).toBe(seedId);
    }
    console.log(`[466-03] 种子 resource_id=${seedId} 反查命中 ${exact.items.length} 条且全精确`);
  });
});
