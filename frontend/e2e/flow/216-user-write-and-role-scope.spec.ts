import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallExpectFail, loginAsRole, loginViaUI, testPassword } from './helpers';
import { PERMISSIONS } from '../../src/constants/permissions';

/** 授权词表只引权威常量并拆段，禁止在本文件写第二套 resource/action 字面量 */
const KEY_ROLES_READ = PERMISSIONS.ROLE_READ;
const KEY_WAREHOUSES_READ = PERMISSIONS.WAREHOUSE_READ;

/** roles.data_scope 写入侧词表（backend/src/utils/data_scope.rs:43-48 的 as_str 三值，小写） */
const SCOPE_WRITE_VALUES = ['all', 'dept', 'self'];

/**
 * 用户改写与回收 + 角色单键追加授权 + 角色行级数据范围改写 E2E（三枚 test）
 *
 * 功能。把 214/215 没有配对的六条腿钉成可复现断言：PUT /users/{id} 改可显示字段后按主键回读
 * （新值生效、旧值不残留、未提交的字段不被抹掉）与非法入参的真实拒绝形状 → GET /users/{id}
 * 详情出参逐字段非空壳 → DELETE /users/{id} 软删后「详情 200 还是 404」与列表三个筛选谓词各自
 * 等于后端真实判据 → POST /roles/{id}/permissions 单键追加（集合 = 原集合 ∪ 新键的精确比较、
 * 重复追加走更新不产生第二行）→ 被授权账号真实登录打读端点拿到后端放行证据 →
 * PATCH /roles/{id}/data-scope 逐档改写并回读逐字符相等、非法档被拒。
 *
 * 调用方。Playwright 串行链，主会话恒为 worker 专属超管（loginAsRole(page,'admin')）；
 * 后端放行证据腿另开隔离 context 用被授权账号真实登录。界面锚点零使用（本文件是契约腿，
 * 界面新建/编辑与整批替换面已由 214/215 覆盖），故不涉及下拉面板与 openSelectDropdownItems。
 * 路由与权限键依据：backend/src/routes/iam.rs:20-26（users 读写删）、iam.rs:45-47
 * （roles/{id}/data-scope PATCH→update 派生键 roles:update）、iam.rs:58-62（单键 POST 与
 * 整批 PUT 同路径不同方法）。
 *
 * 入参。用户名/邮箱/手机号与角色 name/code 都带本次运行 Date.now().toString(36) 后缀，逐次唯一，
 * 跨用例与跨 worker 不撞；角色一律用本文件新建的自建角色（is_system=false，系统角色与超管角色
 * 在授予面与 data-scope 面都被拒，services/role_permission_service.rs:392-394）；账号绑定的角色
 * 从 GET /roles 里按 code !== 'admin' 取（admin 角色受 protect_last_admin 保护，
 * handlers/user_handler.rs:620-623，删除腿会被拒）。权限键一律引
 * frontend/src/constants/permissions.ts 的 PERMISSIONS 权威词表并拆成 resource_type/action 两段，
 * data_scope 一律取 data_scope.rs 的小写三值，不在本文件自造字符串。口令一律 testPassword()。
 *
 * 传给谁。POST /users（CreateUserRequest{username,password,email,phone,role_id}）、
 * PUT /users/{id}（UpdateUserRequest{email,phone,role_id,department_id,status}，
 * handlers/user_handler.rs:96-104，无 username 字段）、GET /users?keyword&status&page&page_size、
 * GET /users/{id}、DELETE /users/{id}、POST /roles/{id}/permissions
 * （AssignPermissionPayload{resource_type,resource_id,action,allowed}，role_handler.rs:108-113，
 * role_id 由路径给出、体里不传）、GET /roles/{id}/permissions、PUT /roles/{id}/permissions（仅作
 * 吊销收尾）、GET /roles/{id}、PATCH /roles/{id}/data-scope（UpdateDataScopePayload{data_scope}，
 * role_handler.rs:119-121）。
 *
 * 存什么。users 行的 email/phone/is_active 三列语义写回（PUT 只覆盖请求里 Some 的字段，
 * services/user_service.rs:318-338）；status 字段是字符串 token，落库形态是 is_active 布尔
 * （user_service.rs:333-335 becoming_active = status_val == master_data::ACTIVE）。
 * DELETE 写 is_active=false，不删行。role_permission 关联行写 (role_id, resource_type,
 * resource_id=null, action, allowed)，单键 POST 命中同键时改行不插行
 * （role_permission_service.rs:778-784 find_existing_permission → update_existing_permission）。
 * roles 行只写 data_scope 一列（PATCH 是该列唯一 API 写入口，role_handler.rs:308）。
 *
 * 存哪里。PostgreSQL users / role_permission / roles 三表；users 读路径带 Redis 缓存
 * （user_service.rs:100-110 find_by_id 先读缓存、user_service.rs:347 更新后显式
 * redis_cache_del），故本文件的「先写后按主键回读」不会被过期缓存喂旧值；role_permission 判定
 * 走带 role_id 维度缓存的 middleware/permission.rs，写入方成功后按 role_id 失效，故
 * 「先授予后吊销」次序成立；roles.data_scope 由 auth 中间件每请求现读库、无缓存需失效
 * （role_handler.rs:312-313）。
 *
 * 契约真相（逐条对着后端源核对，与本用例判据直接相关六点）。
 * 1) 列表出参键是 UserListResponse{users,total,page,page_size}（handlers/user_handler.rs:458-463），
 *    详情/改写出参键是 UserResponse 的 snake_case 字段（user_handler.rs:108-123 区），
 *    两个信封都不是通用 PaginatedResponse 的 items；本文件按这些真实键建模，不写 camelCase。
 * 2) DELETE /users/{id} 是软删除（user_handler.rs:626-628 注释 + user_service 置 is_active=false），
 *    故删除后 GET /users/{id} 继续 200 且返回完整实体（find_by_id 不按 is_active 过滤，
 *    user_service.rs:107-110 只按主键取行）。本文件把「详情仍 200 且 username/email/phone/
 *    role_names 逐字段仍是原值」钉成显式断言：一旦这条腿退化成 200 空壳（字段全 null），
 *    断言立刻红；一旦改成硬删除（404），同样红。两种漂移都不许被静默放过。
 * 3) 列表 status 谓词是 is_active.eq(s != 0)（handlers/user_handler.rs:415，214 已核对行号）：
 *    status=1 只看启用、status=0 只看禁用、缺省不过滤。删除后的三条计数判据直接由此推出，
 *    不是猜测：0 行 / 1 行 / 1 行。
 * 4) UpdateUserRequest 的校验只有两条（user_handler.rs:97-100：email 需过 email 格式、
 *    phone 需长度 ≥1），没有 username、没有 email 长度上限、status 无任何校验注解。
 *    validator::ValidationErrors 一律映射为 400 + code=ValidationError（utils/error.rs:719-722）。
 *    status 传非法 token 不会被拒：user_service.rs:333-335 只比较相等，落库成 is_active=false，
 *    属于被观察到的真实形状，本文件断实际行为（200 + 被静默置为禁用）并把缺陷写进回报，
 *    不改成「应被拒」的假断言。
 * 5) 单键 POST 的出参是 PermissionResponse 单个对象（role_handler.rs:490），不是数组；
 *    GET /roles/{id}/permissions 出参是数组，两者同源。重复追加同一键命中
 *    find_existing_permission 分支（role_permission_service.rs:778-781），是更新而非插入，
 *    故追加后集合长度不变、成员集合与上一次逐元素相等。
 * 6) PATCH data-scope 的词表往返校验先于存在性检查（role_permission_service.rs:375-390）：
 *    取值非法 → 400 ValidationError（文案由 :382-384 validation_displayable 构造）；
 *    取值合法但角色不存在 → 404 NotFound；系统角色 → 400 BusinessError。
 *    三类不并成「任一非 2xx」。DEPT_AND_BELOW 与 CUSTOM 本轮刻意不开放（:367 说明列宽
 *    VARCHAR(10) 存不下且无执行器），大写 ALL/DEPT 也一律被拒（parse_scope 会 lower-case
 *    再往返比较，:375-376）。
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

const uniq = (suffix: string): string => `e2e216_${suffix}_${RUN_TAG}`.slice(0, 20);

interface UserPayload {
  id: number;
  username: string;
  real_name: string | null;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  role_id: number | null;
  department_id: number | null;
  is_active: boolean;
  created_at: string;
  department_name: string | null;
  role_names: string[];
}

interface UserListPayload {
  users: UserPayload[];
  total: number;
  page: number;
  page_size: number;
}

interface DeleteUserPayload {
  success: boolean;
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

interface RoleDetailResponse extends RoleResponse {
  data_scope: string;
  permissions: PermissionResponse[] | null;
}

interface RoleListPayload {
  roles: RoleResponse[];
  total: number;
}

interface PermissionResponse {
  id: number;
  resource_type: string;
  resource_id: number | null;
  action: string;
  allowed: boolean;
}

/** 授予集合的稳定指纹：resource_type:action 排序后逐元素比对，杜绝用「包含」糊过去 */
const grantKeys = (rows: PermissionResponse[]): string[] =>
  [...rows].map((r) => `${r.resource_type}:${r.action}`).sort();

async function readDetail(page: Page, id: number): Promise<UserPayload> {
  const res = await apiCall<UserPayload>(page, 'GET', `/users/${id}`);
  return res.data;
}

/** 后端 UserListResponse 的 users 键（不是 items），关键词命中数与行值都由调用方逐条断 */
async function searchUsers(page: Page, keyword: string, status: string): Promise<UserListPayload> {
  const res = await apiCall<UserListPayload>(
    page,
    'GET',
    `/users?keyword=${encodeURIComponent(keyword)}&status=${status}&page=1&page_size=20`
  );
  return res.data;
}

async function listRoles(page: Page): Promise<RoleResponse[]> {
  const res = await apiCall<RoleListPayload>(page, 'GET', '/roles');
  expect(res.data.total, 'GET /roles 的 total 不等于 roles 长度（后端全量返回口径）').toBe(
    res.data.roles.length
  );
  return res.data.roles;
}

async function createUserFixture(
  page: Page,
  roleId: number,
  prefix: string
): Promise<{ user: UserPayload; email: string; phone: string }> {
  const username = uniq(prefix);
  const email = `${uniq(prefix)}@example.com`;
  const phone = `13${(Date.now() % 1_000_000_000).toString().padStart(9, '0')}`;
  const res = await apiCall<UserPayload>(page, 'POST', '/users', {
    username,
    password: testPassword(),
    email,
    phone,
    role_id: roleId,
  });
  expect(res.data.id, `${prefix} 建档未回显有效 id`).toBeGreaterThan(0);
  expect(res.data.username, `${prefix} 建档回显用户名不等于提交值`).toBe(username);
  expect(res.data.is_active, `${prefix} 建档后 is_active 应为 true`).toBe(true);
  return { user: res.data, email, phone };
}

test.describe('用户改写与回收 + 角色单键授权与数据范围改写', () => {
  test.describe.configure({ timeout: 240_000 });

  test('PUT 改写用户可显示字段 → 主键回读新值且旧值不残留 → 未提交字段不被抹掉 → 非法入参真实拒绝', async ({
    page,
  }) => {
    await loginAsRole(page, 'admin');

    // —— 第 1 段：取一个非 admin 角色作为建档角色（admin 受最后管理员保护）——
    const roles = await listRoles(page);
    const bindRole = roles.find((r) => r.code !== 'admin');
    expect(bindRole, 'GET /roles 里没有非 admin 角色可供建档').toBeDefined();
    const bindRoleId = bindRole!.id;
    const bindRoleName = bindRole!.name;

    // —— 第 2 段：建档（初值），为改写腿准备一个已知基线 ——
    const fixture = await createUserFixture(page, bindRoleId, 'w');
    const userId = fixture.user.id;
    const INIT_EMAIL = fixture.email;
    const INIT_PHONE = fixture.phone;
    const NEW_EMAIL = `${INIT_EMAIL.slice(0, -10)}_new@example.com`;
    const NEW_PHONE = `15${INIT_PHONE.slice(2)}`;

    const beforeEdit = await readDetail(page, userId);
    expect(beforeEdit.email, '改写前详情邮箱不等于建档值').toBe(INIT_EMAIL);
    expect(beforeEdit.phone, '改写前详情手机号不等于建档值').toBe(INIT_PHONE);
    expect(beforeEdit.role_names, '改写前详情角色名不等于所选角色').toEqual([bindRoleName]);

    // —— 第 3 段：PUT 改写邮箱 + 手机号，出参即 UserResponse，先断返回体 ——
    const putRes = await apiCall<UserPayload>(page, 'PUT', `/users/${userId}`, {
      email: NEW_EMAIL,
      phone: NEW_PHONE,
    });
    expect(putRes.data.id, 'PUT 返回体 id 不等于目标用户 id').toBe(userId);
    expect(putRes.data.email, 'PUT 返回体邮箱不是新值').toBe(NEW_EMAIL);
    expect(putRes.data.phone, 'PUT 返回体手机号不是新值').toBe(NEW_PHONE);
    expect(putRes.data.username, 'PUT 不应改动用户名（UpdateUserRequest 无该字段）').toBe(
      beforeEdit.username
    );

    // —— 第 4 段：按主键回读，新值生效且旧值不残留 ——
    const afterEdit = await readDetail(page, userId);
    expect(afterEdit.email, '详情回读邮箱未改成新值').toBe(NEW_EMAIL);
    expect(afterEdit.phone, '详情回读手机号未改成新值').toBe(NEW_PHONE);
    expect(afterEdit.email, '详情回读仍能看到旧邮箱（旧值未被覆盖）').not.toBe(INIT_EMAIL);
    expect(afterEdit.phone, '详情回读仍能看到旧手机号（旧值未被覆盖）').not.toBe(INIT_PHONE);
    expect(afterEdit.id, '详情回读 id 与目标不一致').toBe(userId);
    expect(afterEdit.is_active, '改写邮箱不应把用户置为禁用').toBe(true);
    expect(afterEdit.role_id, '改写邮箱不应改动 role_id').toBe(bindRoleId);
    expect(afterEdit.role_names, '改写邮箱不应改动角色名').toEqual([bindRoleName]);

    // —— 第 5 段：列表侧同一行也必须是新值（写路径与读富化路径同源）——
    const listAfterEdit = await searchUsers(page, afterEdit.username, '1');
    expect(listAfterEdit.total, '改写后活跃口径列表 total 不为 1').toBe(1);
    expect(listAfterEdit.users.length, '改写后活跃口径列表行数不为 1').toBe(1);
    expect(listAfterEdit.users[0].email, '列表行邮箱不是新值').toBe(NEW_EMAIL);
    expect(listAfterEdit.users[0].email, '列表行仍是旧邮箱').not.toBe(INIT_EMAIL);
    expect(listAfterEdit.users[0].phone, '列表行手机号不是新值').toBe(NEW_PHONE);
    expect(listAfterEdit.page_size, '列表 page_size 回显不等于请求值').toBe(20);

    // —— 第 6 段：部分更新语义——只提交 phone，email 必须保持上一次的值不被抹成 null ——
    const ONLY_PHONE = `17${INIT_PHONE.slice(2)}`;
    await apiCall<UserPayload>(page, 'PUT', `/users/${userId}`, { phone: ONLY_PHONE });
    const partial = await readDetail(page, userId);
    expect(partial.phone, '只提交 phone 时手机号未改成新值').toBe(ONLY_PHONE);
    expect(partial.email, '只提交 phone 时 email 被抹掉了（后端应为 None 不覆盖）').toBe(NEW_EMAIL);

    // —— 第 7 段：非法入参的真实拒绝形状（400 两类校验各一条，均不落库）——
    const badEmail = await apiCallExpectFail(page, 'PUT', `/users/${userId}`, {
      email: 'not-an-email',
    });
    expect(badEmail.status, '非法邮箱格式应被拒 400').toBe(400);
    expect(badEmail.code, '非法邮箱的机器码应为 ValidationError').toBe('ValidationError');

    const emptyPhone = await apiCallExpectFail(page, 'PUT', `/users/${userId}`, { phone: '' });
    expect(emptyPhone.status, '空手机号应被拒 400（validator length min=1）').toBe(400);
    expect(emptyPhone.code, '空手机号的机器码应为 ValidationError').toBe('ValidationError');

    // 两次拒绝后行内值必须仍是第 6 段的结果（拒绝不得留下半截写入）
    const afterRejects = await readDetail(page, userId);
    expect(afterRejects.email, '被拒的非法邮箱仍被写进了库').toBe(NEW_EMAIL);
    expect(afterRejects.phone, '被拒的空手机号仍被写进了库').toBe(ONLY_PHONE);

    // —— 第 8 段：改写不存在的用户 = 404 NotFound ——
    const ghostPut = await apiCallExpectFail(page, 'PUT', '/users/2147483646', {
      email: NEW_EMAIL,
    });
    expect(ghostPut.status, '改写不存在的主键应 404').toBe(404);
    expect(ghostPut.code, '改写不存在主键的机器码应为 NotFound').toBe('NotFound');

    // —— 第 9 段：非法 status token 的实际形状（后端不校验，只按相等比较落 is_active）——
    // 这是被观察到的真实行为，不是期望行为：期望是 400 拒绝未知词表值，实际是 200 并把用户静默
    // 置为禁用（services/user_service.rs:333-335）。这里断实际值，缺陷写进回报，不假装它被拒。
    const statusProbe = await apiCall<UserPayload>(page, 'PUT', `/users/${userId}`, {
      status: 'e2e216_not_a_status_token',
    });
    expect(statusProbe.data.is_active, '非法 status token 当前会把 is_active 静默写成 false').toBe(
      false
    );
    const afterStatus = await readDetail(page, userId);
    expect(afterStatus.is_active, '非法 status token 的静默禁用未落库（回读仍为启用）').toBe(false);
    expect(afterStatus.email, '非法 status token 不应顺带抹掉邮箱').toBe(NEW_EMAIL);
  });

  test('DELETE 回收用户 → 详情 200 且逐字段非空壳 → 三个列表谓词各自等于后端判据 → 主键不存在 404', async ({
    page,
  }) => {
    await loginAsRole(page, 'admin');
    const roles = await listRoles(page);
    const bindRole = roles.find((r) => r.code !== 'admin');
    expect(bindRole, 'GET /roles 里没有非 admin 角色可供建档').toBeDefined();

    const fixture = await createUserFixture(page, bindRole!.id, 'd');
    const userId = fixture.user.id;
    const username = fixture.user.username;
    const INIT_EMAIL = fixture.email;
    const INIT_PHONE = fixture.phone;

    // —— 第 1 段：删除前预检（活跃口径 1 行 + 详情启用）——
    const preDelete = await readDetail(page, userId);
    expect(preDelete.id, '删除前预检读到的 id 不一致').toBe(userId);
    expect(preDelete.is_active, '删除前预检 is_active 应为 true').toBe(true);
    const preActive = await searchUsers(page, username, '1');
    expect(preActive.total, '删除前活跃口径 total 不为 1').toBe(1);

    // —— 第 2 段：DELETE 回收，出参是 DeleteUserResponse{success} ——
    const delRes = await apiCall<DeleteUserPayload>(page, 'DELETE', `/users/${userId}`);
    expect(delRes.data.success, 'DELETE /users/{id} 返回 success 不为 true').toBe(true);

    // —— 第 3 段：软删真相 = 详情仍 200，且必须是完整实体而不是空壳 ——
    // 逐字段断原值：若后端退化成「200 + 字段全 null」的空壳，或改成硬删（apiCall 非 2xx 会抛），
    // 本段都会红并要求同步改判据，不会被静默放过。
    const afterDelete = await readDetail(page, userId);
    expect(afterDelete.id, '回收后详情 id 字段丢失（疑似 200 空壳）').toBe(userId);
    expect(afterDelete.username, '回收后详情 username 字段丢失（疑似 200 空壳）').toBe(username);
    expect(afterDelete.email, '回收后详情 email 字段丢失（疑似 200 空壳）').toBe(INIT_EMAIL);
    expect(afterDelete.phone, '回收后详情 phone 字段丢失（疑似 200 空壳）').toBe(INIT_PHONE);
    expect(afterDelete.role_names, '回收后详情 role_names 字段丢失（疑似 200 空壳）').toEqual([
      bindRole!.name,
    ]);
    expect(afterDelete.is_active, '回收后详情 is_active 应为 false').toBe(false);

    // —— 第 4 段：列表三个谓词各自等于后端 is_active.eq(s != 0) 的判据 ——
    const activeList = await searchUsers(page, username, '1');
    expect(activeList.total, '软删后 status=1 的 total 应为 0').toBe(0);
    expect(activeList.users.length, '软删后 status=1 仍返回行').toBe(0);

    const inactiveList = await searchUsers(page, username, '0');
    expect(inactiveList.total, '软删后 status=0 的 total 应为 1（行仍在，只是停用）').toBe(1);
    expect(inactiveList.users[0].is_active, 'status=0 读回 is_active 应为 false').toBe(false);
    expect(inactiveList.users[0].username, 'status=0 读回用户名不等于建档值').toBe(username);

    const unfilteredList = await apiCall<UserListPayload>(
      page,
      'GET',
      `/users?keyword=${encodeURIComponent(username)}&page=1&page_size=20`
    );
    expect(unfilteredList.data.total, '软删后不带 status 的行数应为 1（缺省不过滤）').toBe(1);
    expect(unfilteredList.data.page, '缺省过滤口径 page 回显不等于请求值').toBe(1);

    // —— 第 5 段：回收一个不存在的主键 = 404 NotFound（与成功软删不同形）——
    const ghostDelete = await apiCallExpectFail(page, 'DELETE', '/users/2147483646');
    expect(ghostDelete.status, '删除不存在的主键应 404').toBe(404);
    expect(ghostDelete.code, '删除不存在主键的机器码应为 NotFound').toBe('NotFound');

    // —— 第 6 段：回收后的主键读详情仍不 404（把软删语义钉死，防将来改硬删无人发现）——
    const detailStatus = await apiCall<UserPayload>(page, 'GET', `/users/${userId}`);
    expect(detailStatus.data.id, '软删后详情应仍按主键命中同一行').toBe(userId);
  });

  test('POST 单键追加授权 → 集合精确等于原集合加新键 → 重复追加不产生第二行 → 该账号真被后端放行 → PATCH data-scope 逐档回读与非法档拒绝', async ({
    page,
  }) => {
    const ROLE_CODE = `e2e216_role_${RUN_TAG}`.slice(0, 20);
    await loginAsRole(page, 'admin');

    // —— 第 1 段：自建角色（is_system=false 才允许被授予与改写数据范围）——
    const roleRes = await apiCall<RoleDetailResponse>(page, 'POST', '/roles', {
      name: `e2e216_role_${RUN_TAG}`,
      code: ROLE_CODE,
      description: `e2e216_grant_${RUN_TAG}`,
    });
    const roleId = roleRes.data.id;
    expect(roleId, 'POST /roles 未回显有效 id').toBeGreaterThan(0);
    expect(roleRes.data.code, 'POST /roles 回显 code 不等于提交值').toBe(ROLE_CODE);
    expect(roleRes.data.is_system, '自建角色 is_system 应为 false').toBe(false);

    const baseline = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    const keys0 = grantKeys(baseline.data);

    // —— 第 2 段：POST 单键追加，出参是单个 PermissionResponse ——
    const grantWh = splitKey(KEY_WAREHOUSES_READ);
    const post1 = await apiCall<PermissionResponse>(page, 'POST', `/roles/${roleId}/permissions`, {
      ...grantWh,
      resource_id: null,
      allowed: true,
    });
    expect(post1.data.resource_type, '单键追加回显 resource_type 不等于提交键的资源段').toBe(
      grantWh.resource_type
    );
    expect(post1.data.action, '单键追加回显 action 不等于提交键的动作段').toBe(grantWh.action);
    expect(post1.data.allowed, '单键追加回显 allowed 应为 true').toBe(true);
    expect(
      post1.data.resource_id,
      '角色级单键追加的 resource_id 应为 null（记录级授权是另一条腿）'
    ).toBeNull();
    expect(post1.data.id, '单键追加未回显行 id').toBeGreaterThan(0);

    // —— 第 3 段：GET 集合 = 原集合 ∪ 新键，精确比较、长度 +1 ——
    const expectSet1 = [...keys0, KEY_WAREHOUSES_READ].sort();
    const read1 = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(grantKeys(read1.data), '追加一个键后的成员集合不等于原集合加新键').toEqual(expectSet1);
    expect(read1.data.length, '追加一个键后的行数不等于原行数加一').toBe(keys0.length + 1);

    // —— 第 4 段：重复追加同一键 = 更新原行，不插第二行 ——
    const post2 = await apiCall<PermissionResponse>(page, 'POST', `/roles/${roleId}/permissions`, {
      ...grantWh,
      resource_id: null,
      allowed: true,
    });
    const read2 = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(grantKeys(read2.data), '重复追加同一键后成员集合发生了变化（疑似插了第二行）').toEqual(
      expectSet1
    );
    expect(read2.data.length, '重复追加同一键后行数增加了（后端应命中更新分支）').toBe(
      expectSet1.length
    );
    expect(post2.data.id, '重复追加返回的行 id 与首次不一致（首次行被替换掉了）').toBe(post1.data.id);

    // —— 第 5 段：再追加第二枚真实键，集合精确比较 ——
    const grantRoles = splitKey(KEY_ROLES_READ);
    await apiCall<PermissionResponse>(page, 'POST', `/roles/${roleId}/permissions`, {
      ...grantRoles,
      resource_id: null,
      allowed: true,
    });
    const expectSet2 = [...keys0, KEY_WAREHOUSES_READ, KEY_ROLES_READ].sort();
    const read3 = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
    expect(grantKeys(read3.data), '两枚键都追加后的成员集合不等于期望集合').toEqual(expectSet2);
    expect(read3.data.length, '两枚键都追加后的行数不等于期望行数').toBe(expectSet2.length);

    // —— 第 6 段：后端侧生效证据——该角色下的账号真实登录打读端点必须被放行 ——
    const fixture = await createUserFixture(page, roleId, 'g');
    const username = fixture.user.username;
    const ctx = await page.context().browser()!.newContext();
    const targetPage: Page = await ctx.newPage();
    try {
      await loginViaUI(targetPage, username, testPassword(), true);
      const me = await apiCall<{ id: number; username: string }>(targetPage, 'GET', '/users/me');
      expect(me.data.username, '/users/me 读到的不是本次新建账号').toBe(username);
      const allowed = await apiCall<RoleListPayload>(targetPage, 'GET', '/roles');
      expect(allowed.data.total, '持 roles:read 的账号读 GET /roles 的 total 不等于 roles 长度').toBe(
        allowed.data.roles.length
      );
      expect(
        allowed.data.roles.some((r) => r.code === ROLE_CODE),
        'POST 追加的 roles:read 未放行该账号读 GET /roles（拿不到含本角色的真实集合）'
      ).toBe(true);

      // —— 第 7 段：整批撤到空集后同一会话同一请求必须被后端拒（证明第 6 段是授予带来的效果）——
      await apiCall<PermissionResponse[]>(page, 'PUT', `/roles/${roleId}/permissions`, []);
      const revoked = await apiCall<PermissionResponse[]>(page, 'GET', `/roles/${roleId}/permissions`);
      expect(grantKeys(revoked.data), '整批撤销后该角色授予集不为空').toEqual([...keys0].sort());
      const denied = await apiCallExpectFail(targetPage, 'GET', '/roles');
      expect(denied.status, '撤销授权后该账号 GET /roles 应被后端拒 403').toBe(403);
      expect(denied.code, '后端拒绝机器码应为 FORBIDDEN（utils/error.rs:787 CODE_FORBIDDEN）').toBe(
        'FORBIDDEN'
      );
    } finally {
      await ctx.close();
    }

    // —— 第 8 段：PATCH data-scope 逐档改写并回读，值与写入逐字符相同 ——
    for (const scope of SCOPE_WRITE_VALUES) {
      const patchRes = await apiCall<RoleDetailResponse>(page, 'PATCH', `/roles/${roleId}/data-scope`, {
        data_scope: scope,
      });
      expect(patchRes.data.data_scope, `PATCH 回显 data_scope 不等于写入值 ${scope}`).toBe(scope);
      expect(patchRes.data.id, 'PATCH 返回体 id 不等于目标角色 id').toBe(roleId);
      expect(patchRes.data.code, '改写数据范围不应改动角色 code').toBe(ROLE_CODE);
      const detail = await apiCall<RoleDetailResponse>(page, 'GET', `/roles/${roleId}`);
      expect(detail.data.data_scope, `详情回读 data_scope 不等于写入值 ${scope}`).toBe(scope);
      expect(detail.data.is_system, '改写数据范围不应把自建角色变成系统角色').toBe(false);
    }

    // —— 第 9 段：非法档的真实拒绝（大写五档词表与本轮未开放档一律拒）——
    for (const bad of ['ALL', 'DEPT_AND_BELOW', 'CUSTOM', '', 'not_a_scope']) {
      const rejected = await apiCallExpectFail(page, 'PATCH', `/roles/${roleId}/data-scope`, {
        data_scope: bad,
      });
      expect(rejected.status, `非法 data_scope "${bad}" 应被拒 400`).toBe(400);
      expect(rejected.code, `非法 data_scope "${bad}" 的机器码应为 ValidationError`).toBe(
        'ValidationError'
      );
    }
    // 非法请求不得留下半截写入：终值仍是第 8 段最后写入的 self
    const afterBad = await apiCall<RoleDetailResponse>(page, 'GET', `/roles/${roleId}`);
    expect(afterBad.data.data_scope, '非法 data_scope 请求改动了库里的值').toBe('self');

    // —— 第 10 段：取值合法但角色不存在 = 404；系统角色 = 400 BusinessError（与 404 不同形）——
    const ghostScope = await apiCallExpectFail(page, 'PATCH', '/roles/2147483646/data-scope', {
      data_scope: 'dept',
    });
    expect(ghostScope.status, '合法取值写不存在角色应 404').toBe(404);
    expect(ghostScope.code, '不存在角色的机器码应为 NotFound').toBe('NotFound');

    const systemRole = (await listRoles(page)).find((r) => r.is_system && r.code !== 'admin');
    expect(systemRole, '种子数据里应存在一枚非超管的系统内置角色用于 data-scope 面取证').toBeDefined();
    const sysScope = await apiCallExpectFail(page, 'PATCH', `/roles/${systemRole!.id}/data-scope`, {
      data_scope: 'dept',
    });
    expect(sysScope.status, '改写系统内置角色的数据范围应 400').toBe(400);
    expect(sysScope.code, '改写系统内置角色的机器码应为 BusinessError').toBe('BusinessError');

    // —— 第 11 段：词表漂移取证——展示端点的大写五档不是写入侧词表 ——
    // GET /data-permissions/scope-types 出参是 ALL/DEPT/DEPT_AND_BELOW/SELF/CUSTOM（215 已钉），
    // 写入侧只收 all/dept/self：照展示词表回写必 400。本段把这条不一致钉成断言，缺陷写进回报。
    const displayVocab = await apiCall<{ value: string }[]>(page, 'GET', '/data-permissions/scope-types');
    const writtable = new Set<string>(SCOPE_WRITE_VALUES);
    const displayOnly = displayVocab.data.filter((t) => !writtable.has(t.value));
    expect(
      displayOnly.length,
      '展示词表与写入词表当前应存在未重合项（若哪天对齐了，本断言会红并要求复核）'
    ).toBeGreaterThan(0);
  });
});
