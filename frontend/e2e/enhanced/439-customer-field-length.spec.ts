// 4.39 字段长度门：客户主档 CreateCustomerRequest 各超长字段须被 validator 拒绝，不静默截断。
// 后端判据：handlers/customer_handler.rs:24-50 的 CreateCustomerRequest
//   customer_name length(1..200)、contact_person(max100)、contact_phone(max20)、
//   address(max500)、tax_id(max50)、customer_code(1..50)；
//   :265 create_customer 在 :270 真调 payload.validate()（非只定义不触发）。
// 路由：POST /api/v1/erp/crm/customers（customer_handler::create_customer，
//   routes/crm.rs:35 customers() → :615 merge → mod.rs:571 nest /api/v1/erp/crm）。
// 校验拒绝走 VALIDATION_ERROR，HTTP 400。检测力：漏调 validate 时六个超长请求落库返回 200 即红；
//   上限值放行并回读客户名长度，证明校验门未整体误伤。
// 与 439-02 联系人子表长度门正交（不同 DTO/端点）；与 414c 客户名 trim 搜索正交（校验 vs 检索）。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  expectStateGateRejection,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id: number;
  customer_name?: string;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

/** 用唯一 tag 作前缀填充到精确长度，避免批量跑时撞唯一约束 */
function pad(tag: string, ch: string, len: number): string {
  return `${tag}${ch.repeat(Math.max(0, len - tag.length))}`;
}

test('439-03 客户主档超长字段被 validator 拒绝，上限值放行并回读', async ({ page }) => {
  const tag = genCode('E439F');
  const endpoint = '/crm/customers';
  const base = {
    customer_name: `439主档客户${tag}`,
    customer_type: 'retail',
    status: 'active',
  };

  const cases: Array<{ label: string; field: string; value: string }> = [
    { label: '客户名 201 字', field: 'customer_name', value: '客'.repeat(201) },
    { label: '客户编码 51 字', field: 'customer_code', value: 'C'.repeat(51) },
    { label: '联系人 101 字', field: 'contact_person', value: '联'.repeat(101) },
    { label: '联系电话 21 字', field: 'contact_phone', value: '1'.repeat(21) },
    { label: '地址 501 字', field: 'address', value: '址'.repeat(501) },
    { label: '税号 51 字', field: 'tax_id', value: 'T'.repeat(51) },
  ];
  for (const c of cases) {
    const rejected = await apiCallExpectFail(page, 'POST', endpoint, {
      ...base,
      [c.field]: c.value,
    });
    expectStateGateRejection(rejected, `客户${c.label}建档`);
    expect(
      String(rejected.message ?? ''),
      `${c.label} 的拒因须可定位（不得只回脱敏常量），实际 ${JSON.stringify(rejected.message)}`
    ).not.toBe('');
  }

  // 上限值放行：各字段取 validator 上限，回读客户名须为 200 字不被截断。
  // 联系电话用真实手机号形态，避开长度之外的潜在格式校验（负例已在 validate 阶段拦住）。
  const ok = await apiCall<Row>(page, 'POST', endpoint, {
    customer_name: pad(`439${tag}`, '客', 200),
    customer_code: pad(`C${tag}`, 'C', 50),
    contact_person: pad(`联${tag}`, '联', 100),
    contact_phone: `139${String(Date.now()).slice(-8)}`,
    address: pad(`址${tag}`, '址', 500),
    tax_id: pad(`T${tag}`, 'T', 50),
    customer_type: 'retail',
    status: 'active',
  });
  const id = Number(ok?.id);
  expect(id, '上限值：各字段取 validator 上限须放行建档').toBeGreaterThan(0);
  expect(ok?.customer_name?.length, '回读客户名须为 200 字，不得被截断').toBe(200);
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `439 客户 ${id}` });
});
