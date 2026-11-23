// 4.33 隐私脱敏：供应商列表与详情的 contact_phone 按角色分面。
// 后端判据：handlers/supplier_handler.rs:40-53 列表对 value/list/items/data 逐条调
//   mask_contact_fields_batch_for_role，:95-102 详情调 mask_contact_fields_for_role；
//   底层 utils/field_mask.rs:120-156 对 phone 键集（含 contact_phone）非 admin 掩
//   前3后4、中间四星，admin 由 admin_checker::is_admin_role 放行原文。
// 与既有覆盖分工：443 钉普通客户列表/详情 contact_phone 分面；447/68/26 只把
//   供应商非 admin 掩码写作注释事实、断言仅用未脱敏列，供应商列表+详情的
//   contact_phone 分面零断言。本例专钉此缺口。
// 检测力：列表或详情任一腿漏挂脱敏则业务员读到原文即红；非 admin 被误判为
//   admin 则掩码消失即红；admin 原文对照证明脱敏只改出参不改库内真值。
// 手机号用动态真值，不用占位符——替换值不可预知，硬编码掩码会把假红写进断言。
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginAsRole, tryCleanup } from '../flow/helpers';

interface SupplierRow {
  id: number;
  supplier_name?: string;
  contact_phone?: string;
  contact_email?: string;
}

test('659-01 供应商列表与详情的 contact_phone 业务员掩码、admin 原文', async ({ page }) => {
  const name = `659供应商${genCode('S')}`;
  const rawPhone = `138${String(Date.now()).slice(-8)}`;
  const maskedPhone = `138****${rawPhone.slice(-4)}`;
  const rawEmail = `${genCode('mail')}@example.com`;

  await loginAsRole(page, 'admin');
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: name,
    supplier_short_name: `659供${genCode('X').slice(-3)}`,
    contact_phone: rawPhone,
    contact_email: rawEmail,
  });
  const id = Number(created.data?.id);
  expect(id, 'admin 建供应商须返回正整数主键').toBeGreaterThan(0);

  try {
    // 业务员分面：列表按唯一名定位，断言 contact_phone 掩码、不得出原文。
    await loginAsRole(page, 'salesperson');
    const list = await apiCallRaw<{ items?: SupplierRow[] }>(
      page,
      'GET',
      '/purchase/suppliers?page=1&page_size=100'
    );
    expect(Array.isArray(list.items), '供应商列表出参须带 items 数组').toBe(true);
    const row = list.items!.find(s => s.supplier_name === name);
    expect(row, `业务员列表须能读到自建供应商 ${name}，否则分面无从取证`).toBeTruthy();
    expect(row!.contact_phone, '业务员列表 contact_phone 须为前3+****+后4，不得出原文').toBe(
      maskedPhone
    );

    // 详情分面：同一 ID 走 get_supplier，断言同一掩码规则。
    const detail = await apiCallRaw<SupplierRow>(page, 'GET', `/purchase/suppliers/${id}`);
    expect(detail.contact_phone, '业务员详情 contact_phone 须同样掩码').toBe(maskedPhone);

    // admin 对照：切管理员读同一 ID，须出原文，证明脱敏只改出参不改库内真值。
    await loginAsRole(page, 'admin');
    const adminDetail = await apiCallRaw<SupplierRow>(page, 'GET', `/purchase/suppliers/${id}`);
    expect(adminDetail.contact_phone, 'admin 详情须出 contact_phone 原文').toBe(rawPhone);
  } finally {
    // try 中途失败时 cookie 可能仍是业务员（无供应商删除权限），先切 admin 再清理。
    await loginAsRole(page, 'admin');
    await tryCleanup(page, 'DELETE', `/purchase/suppliers/${id}`, `659 供应商 ${id}`);
  }
});
