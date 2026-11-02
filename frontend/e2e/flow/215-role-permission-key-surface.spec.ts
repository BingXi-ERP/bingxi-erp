import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import { apiCall, apiCallExpectFail, loginAsRole, loginViaUI, testPassword } from './helpers';
import { PERMISSIONS } from '../../src/constants/permissions';

/** 授权词表只引权威常量并拆段，禁止在本文件写第二套 resource/action 字面量 */
const KEY_ROLES_READ = PERMISSIONS.ROLE_READ;
const KEY_WAREHOUSES_READ = PERMISSIONS.WAREHOUSE_READ;
const KEY_PRODUCTS_READ = PERMISSIONS.PRODUCT_READ;
const SCOPE_TYPE_VALUES: string[] = ["ALL", "DEPT", "DEPT_AND_BELOW", "SELF", "CUSTOM"];


/**
 * 角色与权限键面 E2E（三枚 test：角色写后回读链 / 授权的后端侧生效证据 / 非法输入与词表对齐）
 *
 * 功能。把角色增改删、角色级权限整批替换、以及「授予→后端放行、撤销→后端拒绝」这条真实鉴权链
 * 钉成可复现断言：界面新建角色 + 列表逐字段回读 + PUT 改名 + PUT 写入一组真实存在的权限键并
 * GET 回读成员集合精确相等 + 界面权限对话框与后端授予态配对 + 整批撤销回空集 + 删除后不可见。
 *
 * 调用方。Playwright 串行链，主会话恒为 worker 专属超管（loginAsRole(page,'admin')）；
 * 生效证据腿另开隔离 context 用被授权账号真实登录，全程只走 helpers 的会话与口令口径。
 * 界面锚点取 frontend/src/views/roles/index.vue（路由 /roles）的模板元素次序与类名，
 * 不钉任何中文文案字面量；本文件不使用 el-select 面板，故不涉及下拉选项类名。
 *
 * 入参。角色 name/code 与账号 username 都带本次运行 Date.now().toString(36) 后缀，逐次唯一，
 * 跨用例与跨 worker 不撞；code 取值同时满足后端角色编码规范（小写字母、数字、下划线，3-50 字符，
 * services/role_permission_service.rs）。权限键一律引 frontend/src/constants/permissions.ts
 * 的 PERMISSIONS 权威词表并拆成 resource_type/action 两段传入，不在本文件自造字符串字面量。
 * 口令一律 testPassword()（与 globalSetup 建号同源，已过强度校验）。
 *
 * 传给谁。POST /roles（CreateRolePayload{name,code,description,is_system}）、
 * PUT /roles/{id}（UpdateRolePayload{name,description,is_system}，无 code 字段）、
 * PUT /roles/{id}/permissions（Vec<BatchPermissionEntry{resource_type,action,allowed}>）、
 * GET /roles、GET /roles/{id}、GET /roles/{id}/permissions、DELETE /roles/{id}、
 * GET /data-permissions/scope-types，注册见 backend/src/routes/iam.rs 与
 * backend/src/routes/analytics.rs；被授权账号腿打 GET /roles（同一路由的读面）。
 *
 * 存什么。roles 行的 name/code/description/is_system/data_scope 与 role_permission 关联行的
 * (role_id, resource_type, action, allowed, resource_id=null) 角色级授予语义：整批替换只写角色级行
 * （resource_id 非空的记录级行被显式排除在 diff 之外），删除角色不写软删标记而是删行 + 清缓存。
 * 账号腿写 users 行的 username/password/email/phone/role_id（role_id 指向本次新建角色）。
 *
 * 存哪里。PostgreSQL roles 与 role_permission 表（授予行走 services/role_permission_service.rs
 * 的单事务 diff：锁角色行 → 读现状 → 增/改/删 → 终集合 SoD 复算 → 一条批量审计）；
 * 鉴权判定读 role_permission 并带 role_id 维度缓存（middleware/permission.rs），
 * 整批替换提交成功后按 role_id 失效，故本文件的「先授予后撤销」次序不会撞到过期缓存里的旧判定。
 *
 * 契约真相（逐条对着后端源核对，与本用例判据直接相关五点）。
 * 1) 列表出参是 RoleListResponse{roles,total}（handlers/role_handler.rs、124-153），
 *    不是通用 PaginatedResponse 的 items；total 恒等于 roles 长度（该端点全量返回无分页）。
 * 2) GET /roles/{id}/permissions 与 PUT 的出参元素是 PermissionResponse
 *    {id,resource_type,resource_id,action,allowed}（handlers/role_handler.rs），键名 snake_case；
 *    PUT 返回的是替换后的终集合（handlers/role_handler.rs 用 result.after 序列化），
 *    与 GET 读回的成员集合同源，因此本文件把「写入集合 = 读回集合」按排序后逐元素相等断言，不用包含。
 * 3) 粗域展开只在前端路由守卫，后端 middleware/permission.rs matches_permission 是
 *    resource_type 与 action 的精确匹配（只有 "*" 通配例外）：新角色授予 roles:read 后该账号
 *    才能读 GET /roles，撤销到空集后同一会话同一请求必被后端拒 403，机器码 FORBIDDEN
 *    （utils/error.rs CODE_FORBIDDEN、:821 映射）。这是本文件生效证据腿的判据，界面按钮显隐只作旁证。
 * 4) 非法输入的真实拒绝形状彼此不同：角色不存在=404 NotFound
 *    （services/role_permission_service.rs lock_exclusive 后 ok_or_else not_found）；
 *    resource_type/action 为空或 (resource_type,action) 重复=400 ValidationError（同文件 846-878）；
 *    超管与系统内置角色的授予改写=400 BusinessError（同文件 887-896）；
 *    删除系统内置角色=400 BadRequest（handlers/role_handler.rs）。本文件逐形断状态码与机器码，
 *    不把 404 与 400 并成「任一非 2xx」。
 * 5) GET /data-permissions/scope-types 是词表常量端点（handlers/data_permission_handler.rs），
 *    出参元素键为 value/label/description；本文件断它的成员集合与该处字面量逐一对齐，
 *    与写入侧校验表 valid_scope_types（同文件 166-167）同源。
 */

const RUN_TAG = Date.now().toString(36);

/** 权限键一律拆自权威词表，不在本文件写第二套字面量 */
function splitKey(code: string): { resource_type: string; action: string } {
  const [resource_type, action] = code.split(':');
  if (!resource_type || !action) {
    throw new Error(`权威词表值 "${code}" 不是 resource:action 双段形态`);
  }
  return { resource_type, action };
}

interface RoleResponse {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

interface PermissionResponse {
  id: number;
  resource_type: string;
  resource_id: number | null;
  action: string;
  allowed: boolean;
}

interface RoleDetailResponse extends Omit<RoleResponse, 'created_at' | 'updated_at'> {
  data_scope: string;
  created_at: string;
  updated_at: string;
  permissions: PermissionResponse[] | null;
}

interface RoleListPayload {
  roles: RoleResponse[];
  total: number;
}

interface ScopeTypeEntry {
  value: string;
  label: string;
  description: string;
}

/** 授予集合的稳定指纹：resource_type:action 排序后逐元素比对，杜绝用「包含」糊过去 */
const grantKeys = (rows: PermissionResponse[]): string[] =>
  [...rows].map((r) => `${r.resource_type}:${r.action}`).sort();

async function listRoles(page: Page): Promise<RoleResponse[]> {
  const res = await apiCall<RoleListPayload>(page, 'GET', '/roles');
  expect(res.data.total, 'GET /roles 的 total 不等于 roles 长度（后端全量返回口径）').toBe(
    res.data.roles.length
  );
  return res.data.roles;
}

async function findRoleByCode(page: Page, code: string): Promise<RoleResponse | undefined> {
  return (await listRoles(page)).find((r) => r.code === code);
}

/**
 * 界面新建对话框的三个表单项次序（views/roles/index.vue）：
 * 0 名称（input）、1 编码（input）、2 描述（textarea）。靠 textarea 区分角色表单与权限对话框。
 */
const roleDialog = (page: Page): Locator =>
  page.locator('.el-dialog').filter({ has: page.locator('textarea') }).last();
const roleDialogItem = (page: Page, index: number): Locator =>
  roleDialog(page).locator('.el-form-item').nth(index);
const roleDialogConfirm = (page: Page): Locator =>
  roleDialog(page).locator('.el-dialog__footer button').last();
const rolesTable = (page: Page): Locator => page.locator('.el-table');
const roleRow = (page: Page, name: string): Locator =>
  rolesTable(page).locator('.el-table__body tr').filter({ hasText: name });

async function createRoleViaUI(page: Page, name: string, code: string, description: string): Promise<void> {
  const createBtn = page.locator('.page-header button').first();
  await expect(createBtn, '角色页新建入口按钮不可见').toBeVisible();
  await createBtn.click();
  await expect(roleDialog(page), '新建角色对话框未展开').toBeVisible();
  await expect(roleDialog(page).locator('.el-form-item'), '新建角色对话框表单项数不是 3').toHaveCount(3);
  await roleDialogItem(page, 0).locator('input').fill(name);
  await roleDialogItem(page, 1).locator('input').fill(code);
  await roleDialogItem(page, 2).locator('textarea').fill(description);
  await roleDialogConfirm(page).click();
  await expect(roleDialog(page), '提交后新建角色对话框未关闭').toBeHidden({ timeout: 20_000 });
}

async function openRolePage(page: Page): Promise<void> {
  await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/roles`);
  await expect(page, '未停在 /roles 路由').toHaveURL(/\/roles$/);
  await expect(rolesTable(page), '角色管理页应只有一张列表表格').toHaveCount(1);
}

test.describe('角色与权限键面', () => {
  test.describe.configure({ timeout: 240_000 });

  test('admin 界面建角色 → 列表回读 → PUT 改名 → 整批替换授予并精确回读 → 界面权限对话框配对 → 撤销与删除', async ({
    page,
  }) => {
    const NAME = `e2e_role_face_a_${RUN_TAG}`;
    const RENAMED = `e2e_role_face_a_${RUN_TAG}_renamed`;
    const CODE = `e2e_role_face_a_${RUN_TAG}`;
    const DESC = `e2e_desc_${RUN_TAG}`;

    await loginAsRole(page, 'admin');
    await openRolePage(page);

    // —— 第 1 段：界面新建 ——
    await createRoleViaUI(page, NAME, CODE, DESC);

    // —— 第 2 段：API 列表逐字段回读（键名按 RoleResponse，不用 items）——
    const created = await findRoleByCode(page, CODE);
    expect(created, `GET /roles 读不到刚建角色 code=${CODE}`).toBeDefined();
    const roleId = created!.id;
    expect(created!.name, '回读 name 不等于提交值').toBe(NAME);
    expect(created!.code, '回读 code 不等于提交值').toBe(CODE);
    expect(created!.description, '回读 description 不等于提交值').toBe(DESC);
    expect(created!.is_system, '自建角色 is_system 应为 false（true 会被授予面与删除面拒）').toBe(false);
    expect(typeof roleId, '回读 id 不是数字').toBe('number');
    expect(roleId, '回读 id 不大于 0').toBeGreaterThan(0);

    // —— 第 3 段：界面列表行回读（同一条写在两处都可见）——
    await openRolePage(page);
    await expect(roleRow(page, NAME), '界面应恰有一行命中新角色名').toHaveCount(1);
    await expect(roleRow(page, NAME), '界面行未显示提交的 code').toContainText(CODE);
    await expect(roleRow(page, NAME), '界面行未显示提交的 description').toContainText(DESC);
    await expect(roleRow(page, NAME), '界面行不应显示尚未提交的新名称').not.toContainText(RENAMED);

    // —— 第 4 段：PUT 改名（UpdateRolePayload 无 code 字段，code 必须逐字不变）——
    await apiCall<unknown>(page, 'PUT', `/roles/${roleId}`, { name: RENAMED });
    const detailAfterRename = await apiCall<RoleDetailResponse>(page, 'GET', `/roles/${roleId}`);
    expect(detailAfterRename.data.id, '详情读接口 id 与新建返回不一致').toBe(roleId);
    expect(detailAfterRename.data.name, '详情读接口 name 未改成新值').toBe(RENAMED);
    expect(detailAfterRename.data.code, '详情读接口 code 被改写（后端已禁止修改 code 防提权）').toBe(CODE);
    expect(detailAfterRename.data.description, '改名不应抹掉描述').toBe(DESC);
    expect(detailAfterRename.data.is_system, '改名不应把自建角色变成系统角色').toBe(false);
    expect(
      typeof detailAfterRename.data.data_scope,
      'data_scope 应为后端词表字符串（RoleDetailResponse.data_scope）'
    ).toBe('string');

    await openRolePage(page);
    await expect(roleRow(page, RENAMED), '改名后界面应按新名命中一行').toHaveCount(1);
    await expect(roleRow(page, NAME), '改名后界面旧名仍有一行（旧值未被覆盖）').toHaveCount(0);

    // —— 第 5 段：整批替换写入一组真实存在的权限键（取自权威词表）——
    const wantedCodes = [
      KEY_ROLES_READ,
      KEY_WAREHOUSES_READ,
      KEY_PRODUCTS_READ,
    ];
    const wanted = wantedCodes.map(splitKey);
    const replaceRes = await apiCall<PermissionResponse[]>(
      page,
      'PUT',
      `/roles/${roleId}/permissions`,
      wanted.map((w) => ({ ...w, allowed: true }))
    );
    expect(grantKeys(replaceRes.data), 'PUT 返回的终集合不等于写入集合').toEqual(
      [...wantedCodes].sort()
    );
    expect(
      replaceRes.data.every((r) => r.resource_id === null),
      '角色级整批替换不应产生记录级行（resource_id 必须为 null）'
    ).toBe(true);
    expect(
      replaceRes.data.every((r) => r.allowed === true),
      '整批替换返回行 allowed 应逐条为 true'
    ).toBe(true);
    expect(new Set(replaceRes.data.map((r) => r.id)).size, '整批替换返回行 id 应互不相同').toBe(
      replaceRes.data.length
    );

    // —— 第 6 段：GET 回读成员集合与写入集合精确相等（不是包含）——
    const readBack = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(grantKeys(readBack.data), 'GET /roles/{id}/permissions 成员集合不等于写入集合').toEqual(
      [...wantedCodes].sort()
    );
    expect(readBack.data.length, '回读授予行数不等于写入键数').toBe(wantedCodes.length);

    // —— 第 7 段：界面权限对话框与授予态配对（自建角色不该出现超管只读提示）——
    const permBtn = roleRow(page, RENAMED).locator('td').last().locator('button').nth(1);
    await expect(permBtn, '行内权限入口按钮不可见').toBeVisible();
    await permBtn.click();
    const permDialog = page.locator('.el-dialog').filter({ has: page.locator('.el-tree') }).last();
    await expect(permDialog, '权限配置对话框未展开').toBeVisible();
    await expect(
      permDialog.locator('.el-tree .el-tree-node'),
      '权限树应渲染出可勾节点'
    ).not.toHaveCount(0);
    await expect(
      permDialog.locator('.permission-dialog-alert'),
      '自建角色不应命中超管只读提示（该提示条件是目标是超管角色）'
    ).toHaveCount(0);
    await expect(
      permDialog.locator('.el-dialog__footer button').last(),
      '超管会话对自建角色应渲染整批替换保存入口'
    ).toBeVisible();
    const cancelBtn = permDialog.locator('.el-dialog__footer button').first();
    await cancelBtn.click();
    await expect(permDialog, '取消后权限对话框仍在').toBeHidden({ timeout: 15_000 });

    // —— 第 8 段：整批撤销到空集，回读必须为空 ——
    const revokeRes = await apiCall<PermissionResponse[]>(page, 'PUT', `/roles/${roleId}/permissions`, []);
    expect(revokeRes.data.length, '空集合整批替换应返回空终集合').toBe(0);
    const afterRevoke = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(afterRevoke.data, '整批撤销后仍读到授予行').toEqual([]);

    // —— 第 9 段：界面删除 → 列表不可见 → 详情 404 NotFound ——
    await openRolePage(page);
    const delRow = roleRow(page, RENAMED);
    await expect(delRow, '删除前界面应仍有一行').toHaveCount(1);
    const delBtn = delRow.locator('td').last().locator('button').nth(2);
    await expect(delBtn, '行内删除按钮不可见').toBeVisible();
    await delBtn.click();
    const msgBox = page.locator('.el-message-box');
    await expect(msgBox, '删除确认框未展开').toBeVisible();
    await msgBox.locator('.el-message-box__btns button').last().click();
    await expect(msgBox, '确认后删除框仍在').toBeHidden({ timeout: 20_000 });

    const goneDetail = await apiCallExpectFail(page, 'GET', `/roles/${roleId}`);
    expect(goneDetail.status, '已删除角色的详情读接口应 404').toBe(404);
    expect(goneDetail.code, '已删除角色的机器码应为 NotFound').toBe('NotFound');
    expect(await findRoleByCode(page, CODE), '删除后 GET /roles 仍能按 code 命中').toBeUndefined();
    await openRolePage(page);
    await expect(roleRow(page, RENAMED), '删除后界面仍有该角色行').toHaveCount(0);
  });

  test('新建角色先授予再建账号 → 该账号读端点被后端放行 → 整批撤销后同会话被后端拒 403 FORBIDDEN', async ({
    page,
  }) => {
    const ROLE_CODE = `e2e_role_face_b_${RUN_TAG}`;
    const ROLE_NAME = `e2e_role_face_b_${RUN_TAG}_nm`;
    const USERNAME = `e2e_p_${RUN_TAG}`.slice(0, 20);
    const EMAIL = `e2e_p_${RUN_TAG}@example.com`;
    const PHONE = `13${(Date.now() % 1_000_000_000).toString().padStart(9, '0')}`;

    await loginAsRole(page, 'admin');

    // —— 第 1 段：建角色并先写入 roles:read（词表同源拆段），再建该角色下的账号 ——
    const roleRes = await apiCall<RoleDetailResponse>(page, 'POST', '/roles', {
      name: ROLE_NAME,
      code: ROLE_CODE,
      description: `e2e_grant_leg_${RUN_TAG}`,
    });
    expect(roleRes.data.name, 'POST /roles 回显 name 不等于提交值').toBe(ROLE_NAME);
    expect(roleRes.data.code, 'POST /roles 回显 code 不等于提交值').toBe(ROLE_CODE);
    expect(roleRes.data.is_system, '新建角色 is_system 应为 false').toBe(false);
    const roleId = roleRes.data.id;
    expect(roleId, 'POST /roles 未回显有效 id').toBeGreaterThan(0);

    const grantRolesRead = splitKey(KEY_ROLES_READ);
    const grantRes = await apiCall<PermissionResponse[]>(page, 'PUT', `/roles/${roleId}/permissions`, [
      { ...grantRolesRead, allowed: true },
    ]);
    expect(grantKeys(grantRes.data), '单键整批替换的终集合不等于写入键').toEqual([
      KEY_ROLES_READ,
    ]);

    await apiCall<unknown>(page, 'POST', '/users', {
      username: USERNAME,
      password: testPassword(),
      email: EMAIL,
      phone: PHONE,
      role_id: roleId,
    });

    // —— 第 2 段：被授权账号真实登录并打受控读端点，须被后端放行且拿到真数据 ——
    const ctx = await page.context().browser()!.newContext();
    const targetPage: Page = await ctx.newPage();
    try {
      await loginViaUI(targetPage, USERNAME, testPassword(), true);
      const me = await apiCall<{ id: number; username: string }>(targetPage, 'GET', '/users/me');
      expect(me.data.username, '/users/me 读到的不是本次新建账号').toBe(USERNAME);

      const allowed = await apiCall<RoleListPayload>(targetPage, 'GET', '/roles');
      expect(
        allowed.data.roles.some((r) => r.code === ROLE_CODE),
        '持 roles:read 的账号读 GET /roles 应拿到含本角色的真实集合'
      ).toBe(true);
      expect(allowed.data.total, '被授权账号读到的 total 不等于 roles 长度').toBe(
        allowed.data.roles.length
      );

      // —— 第 3 段：超管整批撤销到空集 → 同一会话同一请求必须被后端拒 ——
      await apiCall<PermissionResponse[]>(page, 'PUT', `/roles/${roleId}/permissions`, []);
      const revokedRead = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
      expect(revokedRead.data, '撤销后超管读该角色授予集不为空').toEqual([]);

      const denied = await apiCallExpectFail(targetPage, 'GET', '/roles');
      expect(denied.status, '撤销授权后该账号 GET /roles 应被后端拒 403').toBe(403);
      expect(denied.code, '后端拒绝机器码应为 FORBIDDEN（utils/error.rs CODE_FORBIDDEN）').toBe(
        'FORBIDDEN'
      );
    } finally {
      await ctx.close();
    }

    // —— 第 4 段：本角色被 users.role_id 引用，删除会撞外键；账号删除腿属另一枚端点集合，
    // 这里只把「角色仍在册」钉成断言，不做越界清理 ——
    const stillThere = await findRoleByCode(page, ROLE_CODE);
    expect(stillThere, '授予腿角色应仍在册（其 id 被本次账号引用，删除属另一枚端点集合）').toBeDefined();
    expect(stillThere!.id, '在册角色的 id 与新建返回不一致').toBe(roleId);
  });

  test('词表端点逐成员对齐与非法授权的真实拒绝形状（404 / 400 两类不混断）', async ({ page }) => {
    const ROLE_CODE = `e2e_role_face_c_${RUN_TAG}`;
    await loginAsRole(page, 'admin');

    // —— 第 1 段：GET /data-permissions/scope-types 成员集合与后端常量逐一对齐 ——
    const scopeTypes = await apiCall<ScopeTypeEntry[]>(page, 'GET', '/data-permissions/scope-types');
    const observedValues = scopeTypes.data.map((t) => t.value);
    expect(observedValues, 'scope-types 的 value 集合不等于后端词表').toEqual(SCOPE_TYPE_VALUES);
    expect(
      scopeTypes.data.every((t) => t.label.trim().length > 0 && t.description.trim().length > 0),
      'scope-types 每项的 label 与 description 都应是非空文案'
    ).toBe(true);

    // —— 第 2 段：角色不存在的授权请求 = 404 NotFound ——
    const ghostRoleId = 2147483646;
    const ghost = await apiCallExpectFail(page, 'PUT', `/roles/${ghostRoleId}/permissions`, []);
    expect(ghost.status, `不存在角色 id ${ghostRoleId} 的授权请求应 404`).toBe(404);
    expect(ghost.code, '不存在角色的机器码应为 NotFound').toBe('NotFound');

    // —— 第 3 段：超管角色的授权改写 = 400 BusinessError（系统维护，与 404 不同形）——
    const adminRole = (await listRoles(page)).find((r) => r.code === 'admin');
    expect(adminRole, '种子数据里应存在 code=admin 的超管角色').toBeDefined();
    const adminGrant = await apiCallExpectFail(page, 'PUT', `/roles/${adminRole!.id}/permissions`, [
      { ...splitKey(KEY_ROLES_READ), allowed: true },
    ]);
    expect(adminGrant.status, '改写超管角色权限应 400').toBe(400);
    expect(adminGrant.code, '改写超管角色的机器码应为 BusinessError').toBe('BusinessError');

    // —— 第 4 段：删除系统内置角色 = 400 BadRequest（不是 403、不是 404）——
    const systemRole = (await listRoles(page)).find((r) => r.is_system && r.code !== 'admin');
    expect(systemRole, '种子数据里应存在一枚非超管的系统内置角色用于删除面取证').toBeDefined();
    const delSystem = await apiCallExpectFail(page, 'DELETE', `/roles/${systemRole!.id}`);
    expect(delSystem.status, '删除系统内置角色应 400').toBe(400);
    expect(delSystem.code, '删除系统内置角色的机器码应为 BadRequest').toBe('BadRequest');

    // —— 第 5 段：授权项本身的入参校验 = 400 ValidationError ——
    const roleRes = await apiCall<RoleDetailResponse>(page, 'POST', '/roles', {
      name: `e2e_role_face_c_${RUN_TAG}`,
      code: ROLE_CODE,
      description: `e2e_neg_${RUN_TAG}`,
    });
    const roleId = roleRes.data.id;

    const emptyKey = await apiCallExpectFail(page, 'PUT', `/roles/${roleId}/permissions`, [
      { resource_type: '', action: 'read', allowed: true },
    ]);
    expect(emptyKey.status, '空 resource_type 的授权项应 400').toBe(400);
    expect(emptyKey.code, '空授权项的机器码应为 ValidationError').toBe('ValidationError');

    const dup = await apiCallExpectFail(page, 'PUT', `/roles/${roleId}/permissions`, [
      { ...splitKey(KEY_WAREHOUSES_READ), allowed: true },
      { ...splitKey(KEY_WAREHOUSES_READ), allowed: true },
    ]);
    expect(dup.status, '同一 (resource_type,action) 重复出现应 400（后端拒绝静默 last-wins）').toBe(400);
    expect(dup.code, '重复授权项的机器码应为 ValidationError').toBe('ValidationError');

    // —— 第 6 段：未注册进权威目录的键目前可原样入库（后端写侧不校验注册表）——
    // 这是被观察到的真实形状，不是期望形状：键派生与鉴权同源，此类幻影键永不命中放行，
    // 但整批替换面接受它并回读得到，故这里断实际行为并把缺陷写进交接，不改成「应被拒」的假断言。
    const GHOST_KEY = 'e2e-ghost-resource-not-in-registry';
    const ghostGrant = await apiCall<PermissionResponse[]>(page, 'PUT', `/roles/${roleId}/permissions`, [
      { resource_type: GHOST_KEY, action: 'read', allowed: true },
    ]);
    expect(grantKeys(ghostGrant.data), '幻影键当前会被原样接受并出现在终集合里').toEqual([
      `${GHOST_KEY}:read`,
    ]);
    const ghostRead = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(
      ghostRead.data.every((r) => r.resource_type === GHOST_KEY && r.allowed === true),
      '幻影键读回应逐行等于写入（未被清洗）'
    ).toBe(true);

    // —— 第 7 段：本角色未被任何账号引用，删除后可读回不可见 ——
    const delRes = await apiCall<unknown>(page, 'DELETE', `/roles/${roleId}`);
    expect(delRes.data, 'DELETE /roles/{id} 成功体是 null 信封（ApiResponse::success(())）').toBeNull();
    const afterDel = await apiCallExpectFail(page, 'GET', `/roles/${roleId}`);
    expect(afterDel.status, '删除后详情读接口应 404').toBe(404);
    expect(afterDel.code, '删除后详情机器码应为 NotFound').toBe('NotFound');
  });
});
