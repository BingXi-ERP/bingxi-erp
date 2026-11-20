// 4.33 隐私脱敏：普通客户域列表/详情的 contact_phone 按角色分面。
// 后端判据：handlers/customer_handler.rs:204-212 列表、:245-256 详情共用
//   crm_customer_handler::apply_customer_field_permission（:98-143）：非 admin 恒调
//   CrmService::mask_customer_pii_defaults（services/crm/cust.rs:98-109），mask_phone
//   （utils/field_mask.rs:4-12）保留前3后4、中间四星，并移除 address；
//   admin 由 admin_checker::is_admin_role 判定放行原文（:107-123）。
// 与既有覆盖分工：447 spec 测 /crm/customers/enhanced（线索域 mobile_phone/email），
//   29-permission-data-scope 测地址列表/360 的 contact_phone；普通 /crm/customers
//   列表与 /{id} 详情的 contact_phone 分面零覆盖，本例专钉此缺口。
// 检测力：列表或详情任一腿漏挂脱敏则业务员读到原文即红；非 admin 被误判为 admin
//   则掩码消失即红；admin 原文对照证明脱敏只改出参不改库内真值。
// 手机号用动态真实值（439-contact 已验证范式），不用 {{PHONE_xxx}} 占位符——
//   占位符的替换值不可预知，硬编码掩码前3后4会把假红写进断言。
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginAsRole, tryCleanup } from '../flow/helpers';

interface CustomerRow {
  id: number;
  customer_name?: string;
  contact_phone?: string;
  address?: string;
}

test('443-01 普通客户列表与详情的 contact_phone 业务员掩码、admin 原文', async ({ page }) => {
  // 业务员自建归属行：customers.owner_id 由服务端写成 created_by
  // （global-setup.ts:718），业务员行级作用域只看本人客户，故必须由 salesperson
  // 身份建，不能借 admin 建后切读（那样业务员因 owner 不符看不到，分面无从取证）。
  await loginAsRole(page, 'salesperson');
  const name = `443客户${genCode('C')}`;
  const rawPhone = `139${String(Date.now()).slice(-8)}`;
  const maskedPhone = `139****${rawPhone.slice(-4)}`;
  const created = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: name,
    customer_type: 'retail',
    status: 'active',
    contact_phone: rawPhone,
    address: `${name}地址`,
  });
  const id = Number(created.data?.id);
  expect(id, '业务员自建客户须返回正整数主键').toBeGreaterThan(0);

  try {
    // 列表分面：按自建客户名定位（tag 唯一），断言 contact_phone 掩码且 address 键被移除。
    const list = await apiCallRaw<{ items?: CustomerRow[] }>(
      page,
      'GET',
      '/crm/customers?page=1&page_size=100'
    );
    expect(Array.isArray(list.items), '客户列表出参须带 items 数组').toBe(true);
    const row = list.items!.find(r => r.customer_name === name);
    expect(
      row,
      `业务员列表须能读到自建客户 ${name}（owner_id=本人），否则分面无从取证`
    ).toBeTruthy();
    expect(row!.contact_phone, '业务员列表 contact_phone 须为前3+****+后4 掩码，不得出原文').toBe(
      maskedPhone
    );
    expect('address' in row!, '业务员列表须移除 address 键').toBe(false);

    // 详情分面：同一 ID 走 get_customer，断言同一掩码规则。
    const detail = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${id}`);
    expect(detail.contact_phone, '业务员详情 contact_phone 须同样掩码').toBe(maskedPhone);

    // admin 对照：切管理员读同一 ID，须出原文且 address 在册，证明脱敏只改出参不改库内真值。
    await loginAsRole(page, 'admin');
    const adminDetail = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${id}`);
    expect(adminDetail.contact_phone, 'admin 详情须出 contact_phone 原文').toBe(rawPhone);
    expect(adminDetail.address, 'admin 详情须保留 address 原文').toBe(`${name}地址`);
  } finally {
    // 清理在 admin 身份下执行：try 中途失败时 cookie 可能仍是业务员（无 customers:delete），
    // 先切 admin 保证删除腿有权限，避免留脏数据。
    await loginAsRole(page, 'admin');
    await tryCleanup(page, 'DELETE', `/crm/customers/${id}`, `443 客户 ${id}`);
  }
});
