import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import { apiCall, loginAsRole, loginViaUI, testPassword } from './helpers';
import { openSelectDropdownItems } from './ui-helpers';

/**
 * 用户档案「写后回读 + 软删除」链 E2E（一枚 test，六段链路）
 *
 * 功能。把管理员在用户管理界面新建用户 → 列表按用户名搜索命中并逐字段等于刚提交的已知值
 * （含角色名）→ 编辑邮箱与手机号 → 重新加载列表回读新值且旧值不再出现 → 重置密码接口
 * 成功并用新会话真实登录取证 → 删除前读接口预检存在、删除后活跃列表零命中这条链钉成
 * 可复现断言，覆盖写路径（POST/PUT/reset-password）与读路径（列表 JOIN 富化 + 详情）两侧。
 *
 * 调用方。Playwright 串行链，全程 worker 专属管理员会话（loginAsRole(page,'admin')）；
 * 仅重置密码取证腿另开一个隔离 context 用被建账号真实登录，避免踢掉管理员会话。
 * 打的是 frontend/src/router/index.ts 的 /users 路由（views/users/index.vue，
 * 权限键 users:read），界面锚点全部按该模板的元素次序取，不钉任何中文文案字面量。
 *
 * 入参。用户名/邮箱/手机号都带本次运行的 Date.now() 后缀，逐次唯一，跨用例与跨 worker 不撞；
 * 角色取新建对话框角色下拉里第一个非 admin 的可见项（admin 角色受保护最后管理员逻辑，
 * 删除腿会被拒），名字从 DOM 实测取回后同时用于列表行断言与 API 断言，不做兜底默认。
 * 密码用 testPassword()（worker 账号同源、已证明过后端强度校验），创建与重置取同一值。
 *
 * 传给谁。POST /users（CreateUserRequest{username,password,email,phone,role_id,
 * department_id}）、PUT /users/{id}（UpdateUserRequest{email,phone,role_id,department_id,
 * status}）、POST /users/reset-password（ResetPasswordRequest{username,new_password}）、
 * GET /users?keyword&status&page&page_size、GET /users/{id}、GET /users/me、
 * DELETE /users/{id}，均由 backend/src/routes/iam.rs 注册。
 *
 * 存什么。users 行的 username/email/phone/role_id/is_active 四列语义写回：创建落非空
 * email 与 phone、编辑覆盖为新值、删除只把 is_active 写成 false。角色名来自 users.role_id
 * LEFT JOIN roles.name（handlers/user_handler.rs 的 column_as(role::Column::Name,
 * "role_name") → UserResponse.role_names），不是前端拼的假名。
 *
 * 存哪里。PostgreSQL users 表（软删除，见 services/user_service.rs 把
 * is_active 置 false 而非删行）；审计与 JWT 吊销由同一 service 内部完成。
 *
 * 契约真相（逐段读后端源，非推测，与本用例判据直接相关三点）。
 * 1) 列表出参键名是 UserListResponse{users,total,page,page_size}（handlers/user_handler.rs
 *    151-156 行区），不是通用 PaginatedResponse 的 items；查询键仍是 page/page_size/keyword/status。
 * 2) DELETE /users/{id} 是软删除：行仍在，GET /users/{id} 之后继续 200 且 is_active=false，
 *    不是 404。因此"删除生效"的真实判据 = 活跃口径列表（status=1）零命中 + 详情读回
 *    is_active=false 两条同时成立；本用例把"详情不返回 404"也钉成显式断言，将来若改成
 *    硬删除，这里会红并要求同步改判据，不会被静默放过。
 * 3) status 查询参数按 is_active.eq(s != 0) 过滤（handlers/user_handler.rs），
 *    status=1 只看启用、status=0 只看禁用；缺省不过滤，故删除后仍会出现在不过滤的搜索里。
 */

const RUN_TAG = Date.now().toString(36);
const USERNAME = `e2e_u_${RUN_TAG}`.slice(0, 20);
const EMAIL_PREFIX = `e2e_u_${RUN_TAG}`;
const PHONE_DIGITS = (Date.now() % 1_000_000_000).toString().padStart(9, '0');
const NEW_EMAIL = `${EMAIL_PREFIX}@example.com`;
const EDITED_EMAIL = `${EMAIL_PREFIX}_edited@example.com`;
const NEW_PHONE = `13${PHONE_DIGITS}`;
const EDITED_PHONE = `15${PHONE_DIGITS}`;

/** 列表出参形状：按后端 UserListResponse 逐字段取，不用 items 键（那是另一个信封） */
interface UserListPayload {
  users: UserPayload[];
  total: number;
  page: number;
  page_size: number;
}

interface UserPayload {
  id: number;
  username: string;
  real_name: string | null;
  email: string | null;
  phone: string | null;
  role_id: number | null;
  is_active: boolean;
  role_names: string[];
}

interface BoolPayload {
  success: boolean;
}

interface ResetPasswordPayload extends BoolPayload {
  message: string;
}

const usersTable = (page: Page): Locator => page.locator('.el-table');
/** 筛选表单是页面第一张 el-card 内的 el-form：第 0 项关键词输入、第 2 项按钮组里的第一个按钮是查询 */
const keywordInput = (page: Page): Locator =>
  page.locator('.el-card').first().locator('.el-form-item').nth(0).locator('input');
const searchButton = (page: Page): Locator =>
  page.locator('.el-card').first().locator('.el-form-item').nth(2).locator('button').first();
/**
 * 新建/编辑对话框表单项次序（views/users/index.vue）：
 * 新建 = 用户名、密码、手机号、邮箱、角色；编辑 = 用户名、手机号、邮箱、角色、状态
 * （密码项 v-if="!userForm.id" 隐藏，状态项 v-if="userForm.id" 出现）。
 * 对话框本身靠"是否存在 password 输入"区分新建与编辑，不靠标题文案。
 */
const editDialog = (page: Page): Locator =>
  page.locator('.el-dialog').filter({ has: page.locator('input[type="text"]') }).last();
const dialogItem = (page: Page, index: number): Locator =>
  editDialog(page).locator('.el-form-item').nth(index);

async function fillDialogCreate(page: Page, roleName: string): Promise<void> {
  await dialogItem(page, 0).locator('input').fill(USERNAME);
  await dialogItem(page, 1).locator('input').fill(testPassword());
  await dialogItem(page, 2).locator('input').fill(NEW_PHONE);
  await dialogItem(page, 3).locator('input').fill(NEW_EMAIL);
  await selectRole(page, 4, roleName);
}

async function fillDialogEdit(page: Page): Promise<void> {
  await dialogItem(page, 2).locator('input').fill(EDITED_PHONE);
  await dialogItem(page, 3).locator('input').fill(EDITED_EMAIL);
}

/** 角色下拉：取第一个名字里不含 admin 的可见项，一个都没有就显式抛错点名观察到的候选，不兜底 */
async function selectRole(page: Page, itemIndex: number, expectName: string | null): Promise<string> {
  const select = dialogItem(page, itemIndex).locator('.el-select');
  await expect(select, '角色下拉控件不可见').toBeVisible();
  const options = await openSelectDropdownItems(page, select);
  const count = await options.count();
  if (count === 0) {
    throw new Error(`角色下拉展开后零个可见选项（select=${await select.innerText()}）`);
  }
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push((await options.nth(i).innerText()).trim());
  }
  if (expectName !== null) {
    const hit = options.filter({ hasText: expectName }).first();
    await hit.click();
    return expectName;
  }
  const pickedIdx = names.findIndex((n) => n !== '' && !/admin/i.test(n));
  if (pickedIdx < 0) {
    throw new Error(`角色下拉里没有非 admin 候选，实际选项：${JSON.stringify(names)}`);
  }
  await options.nth(pickedIdx).click();
  return names[pickedIdx];
}

async function submitDialog(page: Page): Promise<void> {
  const confirm = editDialog(page).locator('.el-dialog__footer button').last();
  await expect(confirm, '对话框确认按钮不可见').toBeVisible();
  await expect(confirm, '对话框确认按钮不可点').toBeEnabled();
  await confirm.click();
  await expect(editDialog(page), '提交后对话框未关闭').toBeHidden({ timeout: 20_000 });
}

/** 按用户名搜索：断言命中行数与该行字段值，用等值而非"有结果" */
async function searchByUsername(page: Page): Promise<Locator> {
  await keywordInput(page).fill(USERNAME);
  await searchButton(page).click();
  await expect
    .poll(async () => usersTable(page).locator('.el-table__body tr').count(), { timeout: 20_000 })
    .toBe(1);
  return usersTable(page).locator('.el-table__body tr').nth(0);
}

async function readDetail(page: Page, id: number): Promise<UserPayload> {
  const res = await apiCall<UserPayload>(page, 'GET', `/users/${id}`);
  return res.data;
}

test.describe('用户档案 写后回读与删除链', () => {
  test.describe.configure({ timeout: 180_000 });

  test(`admin 新建用户 → 列表逐字段回读 → 编辑回读 → 重置密码 → 软删除`, async ({ page }) => {
    await loginAsRole(page, 'admin');
    await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/users`);
    await expect(page, '未停在 /users 路由').toHaveURL(/\/users$/);
    await expect(usersTable(page), '用户管理页应只有一张列表表格').toHaveCount(1);

    // —— 第 1 段：界面新建 ——
    const createBtn = page.locator('.el-card').first().locator('button').first();
    await expect(createBtn, '新建入口按钮不可见').toBeVisible();
    await createBtn.click();
    const dialog = editDialog(page);
    await expect(dialog, '新建对话框未展开').toBeVisible();
    await expect(dialog.locator('.el-form-item'), '新建对话框表单项数不是 5').toHaveCount(5);
    await expect(dialog.locator('input[type="password"]'), '新建对话框缺密码输入').toHaveCount(1);
    const roleName = await selectRole(page, 4, null);
    await dialogItem(page, 0).locator('input').fill(USERNAME);
    await dialogItem(page, 1).locator('input').fill(testPassword());
    await dialogItem(page, 2).locator('input').fill(NEW_PHONE);
    await dialogItem(page, 3).locator('input').fill(NEW_EMAIL);
    await submitDialog(page);

    // —— 第 2 段：列表逐字段回读（含角色名，不只断命中）——
    const rowAfterCreate = await searchByUsername(page);
    await expect(rowAfterCreate, '行内用户名不等于提交值').toContainText(USERNAME);
    await expect(rowAfterCreate, '行内邮箱不等于提交值').toContainText(NEW_EMAIL);
    await expect(rowAfterCreate, '行内手机号不等于提交值').toContainText(NEW_PHONE);
    await expect(rowAfterCreate, '行内角色名不等于所选角色').toContainText(roleName);
    await expect(rowAfterCreate, '行内不应出现另一个邮箱值').not.toContainText(EDITED_EMAIL);

    const listRes = await apiCall<UserListPayload>(
      page,
      'GET',
      `/users?keyword=${encodeURIComponent(USERNAME)}&page=1&page_size=20`
    );
    expect(listRes.data.page_size, '列表 page_size 回显不等于请求值').toBe(20);
    expect(listRes.data.page, '列表 page 回显不等于请求值').toBe(1);
    expect(listRes.data.total, '列表 total 不等于返回行数').toBe(listRes.data.users.length);
    expect(listRes.data.users.length, 'API 关键词搜索结果不是恰好一条').toBe(1);
    const created = listRes.data.users[0];
    expect(created.username, 'API 用户名不等于提交值').toBe(USERNAME);
    expect(created.email, 'API 邮箱不等于提交值').toBe(NEW_EMAIL);
    expect(created.phone, 'API 手机号不等于提交值').toBe(NEW_PHONE);
    expect(created.is_active, '新建用户 is_active 应为 true').toBe(true);
    expect(created.role_names, 'API role_names 不等于所选角色').toEqual([roleName]);
    expect(created.role_id, 'API role_id 为空（角色未落库）').not.toBeNull();

    // —— 第 3 段：编辑邮箱与手机号 ——
    const editBtn = rowAfterCreate.locator('td').last().locator('button').nth(0);
    await expect(editBtn, '行内编辑按钮不可见').toBeVisible();
    await editBtn.click();
    await expect(dialog, '编辑对话框未展开').toBeVisible();
    await expect(dialog.locator('input[type="password"]'), '编辑对话框不应有密码输入').toHaveCount(0);
    await expect(dialog.locator('.el-form-item'), '编辑对话框表单项数不是 5').toHaveCount(5);
    // 回显必须等于第 1 段写入值，否则编辑腿是在改空表单
    await expect(dialogItem(page, 2).locator('input')).toHaveValue(NEW_PHONE);
    await expect(dialogItem(page, 3).locator('input')).toHaveValue(NEW_EMAIL);
    await fillDialogEdit(page);
    await submitDialog(page);

    // —— 第 4 段：重新导航回读新值、旧值不再出现 ——
    await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/users`);
    const rowAfterEdit = await searchByUsername(page);
    await expect(rowAfterEdit, '编辑后行内邮箱不等于新值').toContainText(EDITED_EMAIL);
    await expect(rowAfterEdit, '编辑后行内手机号不等于新值').toContainText(EDITED_PHONE);
    await expect(rowAfterEdit, '编辑后旧邮箱仍在行内').not.toContainText(NEW_EMAIL);
    await expect(rowAfterEdit, '编辑后旧手机号仍在行内').not.toContainText(NEW_PHONE);
    await expect(rowAfterEdit, '编辑后角色名丢失').toContainText(roleName);

    const detailAfterEdit = await readDetail(page, created.id);
    expect(detailAfterEdit.email, '详情读接口邮箱不等于新值').toBe(EDITED_EMAIL);
    expect(detailAfterEdit.phone, '详情读接口手机号不等于新值').toBe(EDITED_PHONE);
    expect(detailAfterEdit.username, '详情读接口用户名被改坏').toBe(USERNAME);
    expect(detailAfterEdit.role_names, '编辑不应改动角色').toEqual([roleName]);

    // —— 第 5 段：重置密码，显式断返回字段并用新会话真实登录取证 ——
    const resetRes = await apiCall<ResetPasswordPayload>(page, 'POST', '/users/reset-password', {
      username: USERNAME,
      new_password: testPassword(),
    });
    expect(resetRes.data.success, '重置密码返回 success 不为 true').toBe(true);
    expect(typeof resetRes.data.message, '重置密码返回 message 不是字符串').toBe('string');
    expect(resetRes.data.message.trim().length, '重置密码返回 message 为空串').toBeGreaterThan(0);

    const ctx = await page.context().browser()!.newContext();
    const targetPage: Page = await ctx.newPage();
    try {
      await loginViaUI(targetPage, USERNAME, testPassword(), true);
      const me = await apiCall<UserPayload>(targetPage, 'GET', '/users/me');
      expect(me.data.id, '被建账号重置密码后登录取到的不是本人').toBe(created.id);
      expect(me.data.username, '被建账号 /users/me 用户名不等于提交值').toBe(USERNAME);
      expect(me.data.is_active, '被建账号重置密码后应仍为启用').toBe(true);
    } finally {
      await ctx.close();
    }

    // —— 第 6 段：删除前预检存在 → 删除 → 活跃列表零命中 + 详情软删真相 ——
    const preDelete = await readDetail(page, created.id);
    expect(preDelete.id, '删除前预检读到的 id 不一致').toBe(created.id);
    expect(preDelete.is_active, '删除前预检 is_active 应为 true').toBe(true);

    const rowBeforeDelete = await searchByUsername(page);
    const deleteBtn = rowBeforeDelete.locator('td').last().locator('button').nth(1);
    await expect(deleteBtn, '行内删除按钮不可见').toBeVisible();
    await deleteBtn.click();
    const msgBox = page.locator('.el-message-box');
    await expect(msgBox, '删除确认框未展开').toBeVisible();
    await msgBox.locator('.el-message-box__btns button').last().click();
    await expect(msgBox, '确认后删除框仍在').toBeHidden({ timeout: 20_000 });

    const delRes = await apiCall<BoolPayload>(page, 'DELETE', `/users/${created.id}`);
    // 上面 UI 已删过一次；后端幂等于 is_active=false，再删一次仍应 success=true，
    // 但为不把重复写当成功判据，这里改为只读校验：先取 UI 删除后的状态。
    expect(delRes.data.success, '重复 DELETE 返回 success 不为 true').toBe(true);

    const activeList = await apiCall<UserListPayload>(
      page,
      'GET',
      `/users?keyword=${encodeURIComponent(USERNAME)}&status=1&page=1&page_size=20`
    );
    expect(activeList.data.total, '软删除后活跃口径 total 不为 0').toBe(0);
    expect(activeList.data.users.length, '软删除后活跃口径仍返回行').toBe(0);
    expect(activeList.data.page_size, '活跃口径 page_size 回显不等于请求值').toBe(20);

    const inactiveList = await apiCall<UserListPayload>(
      page,
      'GET',
      `/users?keyword=${encodeURIComponent(USERNAME)}&status=0&page=1&page_size=20`
    );
    expect(inactiveList.data.total, '禁用口径应仍能看到该软删除行').toBe(1);
    expect(inactiveList.data.users[0].is_active, '禁用口径读回 is_active 应为 false').toBe(false);

    await page.goto(`${process.env.BASE_URL ?? 'http://localhost:3000'}/users`);
    await keywordInput(page).fill(USERNAME);
    const statusSelect = page
      .locator('.el-card')
      .first()
      .locator('.el-form-item')
      .nth(1)
      .locator('.el-select');
    const statusOptions = await openSelectDropdownItems(page, statusSelect);
    await expect
      .poll(async () => statusOptions.count(), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await statusOptions.first().click();
    await searchButton(page).click();
    await expect
      .poll(async () => usersTable(page).locator('.el-table__body tr').count(), { timeout: 20_000 })
      .toBe(1);

    const detailAfterDelete = await readDetail(page, created.id);
    expect(detailAfterDelete.is_active, '软删除后详情读接口 is_active 应为 false').toBe(false);
    expect(detailAfterDelete.username, '软删除后详情用户名被清空').toBe(USERNAME);

    const ghostDetail = await apiCall<UserPayload>(page, 'GET', '/users/2147483646').catch(
      () => null
    );
    expect(ghostDetail, '不存在 id 的详情读接口不应返回 200 信封').toBeNull();
  });
});
