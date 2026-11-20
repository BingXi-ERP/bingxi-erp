// 4.39 字段长度门：客户联系人 name/title/remarks 超长须被 validator 拒绝，不静默截断。
// 后端判据：services/customer_ops/types.rs:177-192 的 CreateCustomerContactRequest
//   name length(1..50)、title length(max=100)、remarks length(max=500)；
//   handlers/crm_customer_handler.rs:434 create_contact 真调 req.validate()（非只定义不触发）。
// 校验拒绝走 VALIDATION_ERROR（utils/error.rs:719 From<ValidationErrors>），HTTP 400。
// 检测力：若 handler 漏调 validate，三个超长请求会落库返回 200，负例即红；
//   正常联系人仍须建成，证明校验门未整体误伤。与 465/490 的库位/财务长度门正交（不同端点）。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallExpectFail,
  expectStateGateRejection,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

function phone(): string {
  return `139${String(Date.now()).slice(-8)}`;
}

async function seedCustomer(page: Page): Promise<number> {
  const tag = genCode('E439C');
  const created = await apiCall<Row>(page, 'POST', '/crm/customers', {
    customer_name: `439联系人客户${tag}`,
    contact_person: `439联系${tag}`,
    contact_phone: phone(),
    customer_type: 'retail',
    status: 'active',
  });
  const id = Number(created.data?.id);
  expect(id, '前置：建客户须返回正整数主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `439 客户 ${id}` });
  return id;
}

test('439-02 联系人超长字段被 validator 拒绝，正常联系人仍可建', async ({ page }) => {
  const customerId = await seedCustomer(page);
  const base = { name: `439联系人${genCode('C')}`, phone: phone() };
  const endpoint = `/crm/customers/${customerId}/contacts`;

  const cases: Array<{ label: string; patch: Record<string, unknown>; field: string }> = [
    { label: '姓名 51 字', patch: { name: '姓'.repeat(51) }, field: 'name' },
    { label: '职务 101 字', patch: { title: 'T'.repeat(101) }, field: 'title' },
    { label: '备注 501 字', patch: { remarks: '备'.repeat(501) }, field: 'remarks' },
  ];
  for (const c of cases) {
    const rejected = await apiCallExpectFail(page, 'POST', endpoint, { ...base, ...c.patch });
    expectStateGateRejection(rejected, `联系人${c.label}建单`);
    expect(
      String(rejected.message ?? ''),
      `${c.label} 的拒因须可定位（不得只回脱敏常量），实际 ${JSON.stringify(rejected.message)}`
    ).not.toBe('');
  }

  const ok = await apiCall<Row>(page, 'POST', endpoint, {
    ...base,
    title: 'T'.repeat(100),
    remarks: '备'.repeat(500),
  });
  const contactId = Number(ok.data?.id);
  expect(contactId, '边界值：name/title=100/remarks=500 须放行').toBeGreaterThan(0);
  CLEANUP.push({
    path: `/crm/customers/${customerId}/contacts/${contactId}`,
    label: `439 联系人 ${contactId}`,
  });
  void customerId;
});
