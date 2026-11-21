// 505 权限变更审计：审计写入与仅管理员可见的矩阵差异。
// 后端判据：handlers/permission_audit_handler.rs:36-43 在中间件放行后仍要求 is_admin_role；
// services/init_service_ops/permission.rs:1483-1489 给 auditor 授 permission-audits:read，
// 故 auditor 持读码却在 handler 被拒，403/FORBIDDEN 与 AppError::permission_denied 同源。
// services/role_permission_service.rs:645-679,1111-1135 写入 role_permission_assign 审计，
// models/permission_change_audit.rs:15-42 是出参键的唯一来源，列表返回 snake_case 实体列。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginAsRole,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const AUDITS = '/permission-audits';

const AUDIT_KEYS = [
  'action',
  'changed_at',
  'change_type',
  'client_ip',
  'id',
  'new_value',
  'old_value',
  'operator_id',
  'remark',
  'resource_type',
  'role_id',
  'user_id',
].sort();

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

interface AuditRow {
  id: number;
  change_type: string;
  operator_id: number;
  role_id: number | null;
  user_id: number | null;
  resource_type: string | null;
  action: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  client_ip: string | null;
  remark: string | null;
}

function int(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[505] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function text(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && (value as string).length > 0,
    `[505] ${label} 须非空字符串，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as string;
}

async function roleIdByCode(page: Page, code: string): Promise<number> {
  const listed = await apiCallRaw<{
    roles?: Array<{ id?: number; code?: string }>;
    total?: number;
  }>(page, 'GET', '/roles');
  expect(
    Array.isArray(listed?.roles),
    `[505] /roles 须返回 roles 数组，实际=${JSON.stringify(listed)}`
  ).toBe(true);
  const roles = listed.roles as Array<{ id?: number; code?: string }>;
  const found = roles.find(role => role.code === code);
  expect(
    found !== undefined,
    `[505] 须存在角色 ${code}，实际 codes=${JSON.stringify(roles.map(role => role.code))}`
  ).toBe(true);
  return int(found?.id, `角色 ${code} 的 id`);
}

async function assertAuditorHasReadCode(page: Page, auditorRoleId: number): Promise<void> {
  const detail = await apiCallRaw<{
    permissions?: Array<Record<string, unknown>>;
  }>(page, 'GET', `/roles/${auditorRoleId}`);
  expect(
    Array.isArray(detail?.permissions),
    `[505] auditor 角色详情须返回 permissions 数组，实际=${JSON.stringify(detail)}`
  ).toBe(true);
  const permissions = detail.permissions as Array<Record<string, unknown>>;
  const grant = permissions.find(
    permission =>
      permission.resource_type === 'permission-audits' &&
      permission.action === 'read' &&
      permission.allowed === true
  );
  expect(
    grant !== undefined,
    `[505] auditor 须持有 permission-audits:read，实际=${JSON.stringify(permissions)}`
  ).toBe(true);
}

async function expectForbidden(page: Page, role: string): Promise<void> {
  await loginAsRole(page, role);
  const failure = await apiCallExpectFail(page, 'GET', `${AUDITS}?page=1&page_size=20`);
  expect(failure.status, `[505] ${role} 访问权限审计须 403，实际=${failure.status}`).toBe(403);
  expect(
    failureCode(failure),
    `[505] ${role} 拒绝机器码须 FORBIDDEN，实际=${JSON.stringify(failure)}`
  ).toBe(APP_ERROR_CODES.FORBIDDEN);
}

test.describe('505 权限变更审计矩阵', () => {
  test('505-01 审计写入落库且持读码审计岗仍被管理员门拒绝', async ({ page }) => {
    let roleId: number | undefined;
    let permissionId: number | undefined;
    try {
      await loginViaUI(page, undefined, undefined, true);
      const adminId = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
      const operatorId = int(adminId?.id, '当前管理员 id');
      const auditorId = await roleIdByCode(page, 'auditor');
      await assertAuditorHasReadCode(page, auditorId);
      await roleIdByCode(page, 'report_viewer');

      const marker = genCode('E505');
      const roleCode = marker.toLowerCase().replace('-', '_');
      const createdRole = await apiCallRaw<{ id?: number; code?: string }>(page, 'POST', '/roles', {
        name: `E505 ${marker}`,
        code: roleCode,
      });
      roleId = int(createdRole?.id, '建临时角色返回 id');
      expect(createdRole.code, '[505] 建临时角色回读 code').toBe(roleCode);

      const granted = await apiCallRaw<{ id?: number }>(
        page,
        'POST',
        `/roles/${roleId}/permissions`,
        { resource_type: 'reports', action: 'read', allowed: true }
      );
      permissionId = int(granted?.id, '授权返回 role_permission id');

      const filtered = await apiCallRaw<Paged<AuditRow>>(
        page,
        'GET',
        `${AUDITS}?change_type=role_permission_assign&role_id=${roleId}&page=1&page_size=20`
      );
      expect(
        Array.isArray(filtered?.items),
        `[505] 审计列表须返回 items 数组，实际=${JSON.stringify(filtered)}`
      ).toBe(true);
      expect(filtered.page, '[505] 审计列表回显 page').toBe(1);
      expect(filtered.page_size, '[505] 审计列表回显 page_size').toBe(20);
      expect(
        Number.isInteger(filtered.total) && filtered.total >= 1,
        `[505] 按自建角色过滤须至少一条审计，实际 total=${filtered.total}`
      ).toBe(true);

      const rows = filtered.items.filter(
        row =>
          row.role_id === roleId &&
          row.change_type === 'role_permission_assign' &&
          row.resource_type === 'reports' &&
          row.action === 'read' &&
          row.new_value === 'true'
      );
      expect(rows.length, `[505] 自建角色审计须唯一，实际=${JSON.stringify(filtered.items)}`).toBe(
        1
      );
      const row = rows[0];
      expect(
        Object.keys(row).sort(),
        '[505] 审计行须逐键来自 permission_change_audit 实体'
      ).toEqual(AUDIT_KEYS);
      expect(int(row.id, '审计行 id') > 0, '[505] 审计行 id 须为正整数').toBe(true);
      expect(row.operator_id, '[505] 审计 operator_id 须当前管理员').toBe(operatorId);
      expect(row.role_id, '[505] 审计 role_id 须自建角色').toBe(roleId);
      expect(row.user_id, '[505] 角色授权审计不带 user_id').toBe(null);
      expect(row.old_value, '[505] 新授权无旧值').toBe(null);
      expect(text(row.changed_at, '审计 changed_at').length > 0, '[505] 审计时间须非空').toBe(true);

      const listed = await apiCallRaw<Paged<AuditRow>>(
        page,
        'GET',
        `${AUDITS}?page=0&page_size=1000`
      );
      expect(listed.page, '[505] page=0 须钳到 1').toBe(1);
      expect(listed.page_size, '[505] page_size=1000 须钳到 100').toBe(100);
      expect(
        listed.items.some(item => item.id === row.id),
        '[505] 新建审计须出现在默认倒序首页'
      ).toBe(true);

      await expectForbidden(page, 'auditor');
      await expectForbidden(page, 'report_viewer');
    } finally {
      try {
        await loginViaUI(page, undefined, undefined, true);
      } finally {
        if (permissionId !== undefined) {
          await tryCleanup(page, 'DELETE', `/roles/permissions/${permissionId}`, '505 临时授权');
        }
        if (roleId !== undefined) {
          await tryCleanup(page, 'DELETE', `/roles/${roleId}`, '505 临时角色');
        }
      }
    }
  });
});
