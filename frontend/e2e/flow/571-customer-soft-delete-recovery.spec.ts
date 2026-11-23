// 4.38 误删恢复 E2E — flow/571-customer-soft-delete-recovery
// 功能：客户DELETE 是软删（置 status=inactive）而非硬删，审计留痕可复原删除前关键字段。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；客户用唯一 code/name 自建，避免撞唯一约束。
// 传给谁：POST /crm/customers 建档 → DELETE /crm/customers/{id} 软删 →
//   GET /crm/customers?status=inactive 查软删行 → GET /audit-logs?resource_type=customer 查变更审计 →
//   GET /audit-logs/{id} 读 before/after 快照 → PUT /crm/customers/{id} 将 status 回放为 active。
// 存什么：customers 一行（关键字段 customer_code/customer_name/status）、
//   audit_logs 行（before_snapshot 存删除前完整模型、after_snapshot 存 inactive 模型）。
// 存哪里：customers 表；audit_logs 表。
// 口径说明：报告已明确"回收站/备份一键恢复"是条件性需求、非本审计认定的缺失功能，
//   故本用例不假设任何 restore 端点；只断言既有 status=inactive + 审计快照可查，
//   恢复腿用写入方真实存在的 UpdateCustomerArgs.status（types.rs:155）把状态改回 active，
//   并按报告建议回读关键字段。快照字段出自 audit_log_service::update_with_audit。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, genCode, tryCleanup } from './helpers';

interface CustomerRow {
  id: number;
  customer_code?: string;
  customer_name?: string;
  status?: string;
}

interface AuditRow {
  id: number;
  resource_id?: string | null;
  resource_type?: string | null;
  operation_type?: string | null;
  before_snapshot?: Record<string, unknown> | null;
  after_snapshot?: Record<string, unknown> | null;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test('571-01 客户软删置 inactive 且审计快照可复原删除前关键字段', async ({
  page,
}: {
  page: Page;
}) => {
  const tag = genCode('571A');
  const code = `C${tag}`;
  const name = `客户${tag}软删恢复`;

  const created = await apiCall<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_code: code,
    customer_name: name,
    contact_person: `联系人${tag}`,
    contact_phone: `139${String(Date.now()).slice(-8)}`,
    customer_type: 'retail',
    status: 'active',
  });
  const id = Number(created.data?.id);
  expect(id, '建档须返回正整数主键').toBeGreaterThan(0);
  CLEANUP.push({
    path: `/crm/customers/${id}`,
    label: `571 恢复腿客户 ${id}`,
  });

  // 软删：DELETE 走 delete_customer，状态置 inactive，不物理删行。
  const del = await apiCall<CustomerRow>(page, 'DELETE', `/crm/customers/${id}`);
  // apiCall 成功即返回 code=200 的业务信封，业务失败会显式抛错，故无需再断言 HTTP status。
  expect(del.code, 'DELETE 客户须成功信封').toBe(200);
  expect(String(del.data?.status).toLowerCase(), 'DELETE 回读 status 须为 inactive').toBe(
    'inactive'
  );

  // 软删行不再出现在 active 列表，但按 id 详情仍可查（未硬删）。
  const activeList = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    '/crm/customers?status=active&page=1&page_size=100'
  );
  expect(
    (activeList.items ?? []).some(r => Number(r.id) === id),
    '软删后 active 列表不应再含该客户'
  ).toBe(false);
  const detail = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${id}`);
  expect(Number(detail.id), '软删后按 id 详情仍可查，证明非硬删').toBe(id);
  expect(String(detail.status).toLowerCase(), '详情 status 须为 inactive').toBe('inactive');

  // 审计留痕：update_with_audit 以 resource_type=customer、resource_id=客户主键写 UPDATE 审计。
  // 列表条目按脱敏口径不带快照（见 445 spec），故列表只定位审计 id，快照在详情端点核对。
  const logs = await apiCallRaw<{ items: AuditRow[] }>(
    page,
    'GET',
    `/audit-logs?resource_type=customer&resource_id=${id}&page=1&page_size=50`
  );
  const candidates = (logs.items ?? []).filter(it => String(it.resource_id) === String(id));
  expect(candidates.length, `按 resource_id=${id} 应至少命中 1 条客户审计`).toBeGreaterThanOrEqual(
    1
  );

  // 详情展开快照：before_snapshot 保存删除前完整模型，after_snapshot 为 inactive 模型。
  // 建档、软删、恢复都会写 UPDATE 审计，逐条查详情定位那条 before=active/after=inactive 的软删行。
  let audit: AuditRow | undefined;
  for (const candidate of candidates) {
    const full = await apiCallRaw<AuditRow>(page, 'GET', `/audit-logs/${candidate.id}`);
    if (
      String(full.before_snapshot?.status ?? '').toLowerCase() === 'active' &&
      String(full.after_snapshot?.status ?? '').toLowerCase() === 'inactive'
    ) {
      audit = full;
      break;
    }
  }
  expect(audit, '应找到 before=active/after=inactive 的软删审计详情').toBeDefined();
  if (!audit) throw new Error('571 未定位到软删审计详情，后续快照断言不可执行');
  expect(
    String(audit.before_snapshot?.customer_code),
    'before_snapshot 须留存删除前 customer_code，可据以复原'
  ).toBe(code);
  expect(
    String(audit.before_snapshot?.customer_name),
    'before_snapshot 须留存删除前 customer_name，可据以复原'
  ).toBe(name);
  expect(
    String(audit.before_snapshot?.status).toLowerCase(),
    'before_snapshot 的 status 须为删除前 active'
  ).toBe('active');
  expect(
    String(audit.after_snapshot?.status).toLowerCase(),
    'after_snapshot 的 status 须为删除后 inactive'
  ).toBe('inactive');

  // 恢复腿：用写入方真实存在的 status 字段把客户改回 active（非假设的 restore 端点）。
  const restored = await apiCall<CustomerRow>(page, 'PUT', `/crm/customers/${id}`, {
    customer_name: name,
    status: 'active',
  });
  expect(restored.code, '回放 status=active 须成功信封').toBe(200);
  const after = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${id}`);
  expect(String(after.status).toLowerCase(), '恢复后 status 须回到 active').toBe('active');
  expect(after.customer_code, '恢复后关键字段 customer_code 须与删除前一致').toBe(code);
  expect(after.customer_name, '恢复后关键字段 customer_name 须与删除前一致').toBe(name);
});
