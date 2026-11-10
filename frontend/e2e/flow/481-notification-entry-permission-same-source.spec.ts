// 通知中心页面可达性：路由权限键与读面端点同源（notifications:read），
// 页面内依赖 users:read 的收件人选择器由 v-permission 精确收口。
//
// 本文件锁住四条真断言：
//  1) 非超管、无 users:read 但有 notifications:read 的岗位：UI 进入通知中心页不落到 /403，
//     且列表请求 200 并按自身用户返回；
//  2) 同一岗位：GET /notifications 直接调用 200（证明不是靠前端隐藏绕开鉴权）；
//  3) 同一岗位：页面内收件人选择器不可达（DOM 中不存在），且直接调用 GET /users 被后端拒 4xx，
//     前端与后端两处都断；
//  4) 超管：整页与选择器都可用，且列表能读出真实条目（非空列表不算通过）。
//
// 前置数据本用例自建：admin 向测试用户与 admin 自身各发一条公告以产生通知，
// 不依赖库中恰好存在某条通知；清理在 afterAll 统一执行（软删除通道，尽力而为不抛错）。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  BASE_URL,
  apiCallExpectFail,
  apiCallRaw,
  genCode,
  loginViaUI,
  testStorageStatePath,
  tryCleanup,
} from './helpers';

interface RoleRow {
  id: number;
  name: string;
  code: string;
  is_system: boolean;
}

/** 建唯一命名的非内置角色 */
async function createScratchRole(page: Page, tag: string): Promise<RoleRow> {
  const stamp =
    Date.now().toString().slice(-6) +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
  const code = `e2np${tag.toLowerCase()}${stamp}`;
  const name = `E2E通知权限${tag}${stamp}`;
  const created = await apiCallRaw<{ id: number }>(page, 'POST', '/roles', { name, code });
  expect(Number.isFinite(created.id), `建角色应返回 id，实际：${JSON.stringify(created)}`).toBe(
    true
  );
  const row = await apiCallRaw<RoleRow>(page, 'GET', `/roles/${created.id}`);
  expect(row.code, `角色回读 code 应为 ${code}`).toBe(code);
  expect(row.is_system, '自建角色不应是内置角色').toBe(false);
  return row;
}

/** 给角色写一条角色级授予（仅用于夹具前置） */
async function seedGrant(
  page: Page,
  roleId: number,
  grant: { resource_type: string; action: string }
): Promise<void> {
  await apiCallRaw(page, 'POST', `/roles/${roleId}/permissions`, {
    resource_type: grant.resource_type,
    action: grant.action,
    allowed: true,
  });
}

/** 建一个非超管用户并返回 {id, username, password}；口令避开 4 连数字行子串（后端键盘序列硬错误） */
async function createScratchUser(
  page: Page,
  roleId: number
): Promise<{ id: number; username: string; password: string }> {
  const stamp = Date.now().toString().slice(-6);
  const username = `e2np_u${stamp}`;
  const password = `Np@${stamp.slice(0, 3)}k${stamp.slice(3)}Z7`;
  const created = await apiCallRaw<{ id: number }>(page, 'POST', '/users', {
    username,
    password,
    role_id: roleId,
  });
  expect(Number.isFinite(created.id), `建用户应返回 id，实际：${JSON.stringify(created)}`).toBe(
    true
  );
  return { id: created.id, username, password };
}

/** 以当前会话（admin）向目标用户发公告以自举通知数据，返回本次投递数 */
async function seedNotification(page: Page, targetUserIds: number[]): Promise<number> {
  const tag = genCode('N');
  const result = await apiCallRaw<{ delivered_count: number }>(
    page,
    'POST',
    '/notifications/announcement',
    {
      user_ids: targetUserIds,
      title: `E2E-481 自举公告 ${tag}`,
      content: `本条通知由 481 号用例自动创建，用于验证通知中心读面可达性。标识：${tag}`,
    }
  );
  expect(
    typeof result.delivered_count === 'number' && result.delivered_count >= targetUserIds.length,
    `发公告后 delivered_count 应 >= ${targetUserIds.length}，实际：${JSON.stringify(result)}`
  ).toBe(true);
  return result.delivered_count;
}

test.describe('481 通知中心路由权限键与读面同源', () => {
  // 夹具状态：beforeAll 自建，afterAll 统一回收；不用 afterEach 逐例回收，
  // 因为后续用例仍需以同一自建用户登录。
  let scratchRoleId = 0;
  let scratchUserId = 0;
  let scratchUsername = '';
  let scratchPassword = '';

  test.beforeAll(async ({ browser }) => {
    // beforeAll 不注入 page，用本 worker 会话态独立建 context（并发 worker 各用各的一次性 CSRF）
    const seedContext = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await seedContext.newPage();
    try {
      await loginViaUI(page);

      const role = await createScratchRole(page, 'R1');
      scratchRoleId = role.id;

      // 显式授予 notifications:read（路由入口与读面同源所需）；不授予 users:read
      await seedGrant(page, scratchRoleId, { resource_type: 'notifications', action: 'read' });

      const user = await createScratchUser(page, scratchRoleId);
      scratchUserId = user.id;
      scratchUsername = user.username;
      scratchPassword = user.password;

      // 自建通知数据：同时发给自建用户与 admin 自身（超管用例断言列表非空）
      const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
      await seedNotification(page, [scratchUserId, me.id]);
    } finally {
      await seedContext.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    // 回收走 admin 会话：用户删除为软删除通道，角色为非内置可硬删；失败仅告警不抛错
    const ctx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      if (scratchUserId > 0)
        await tryCleanup(page, 'DELETE', `/users/${scratchUserId}`, `user#${scratchUserId}`);
      if (scratchRoleId > 0)
        await tryCleanup(page, 'DELETE', `/roles/${scratchRoleId}`, `role#${scratchRoleId}`);
    } finally {
      await ctx.close();
    }
  });

  test('481-01 非超管有 notifications:read 无 users:read：UI 进入通知中心不落到 /403', async ({
    page,
  }) => {
    await loginViaUI(page, scratchUsername, scratchPassword, true);
    await page.goto(`${BASE_URL}/notification`);
    await page.waitForLoadState('networkidle');

    // 路由守卫放行判据：URL 不应落在 /403（修复前入口键为 users:read，该岗位必被弹出）
    expect(
      page.url(),
      `非超管进通知中心不应被路由守卫弹到 /403，实际 URL=${page.url()}`
    ).not.toContain('/403');

    // 页面主体已渲染（列表卡片头部可见）
    const pageTitle = page.locator('.notification .card-header span').first();
    await expect(pageTitle).toBeVisible({ timeout: 30_000 });
  });

  test('481-02 同一岗位：GET /notifications 直接调用 200 且按自身用户返回', async ({ page }) => {
    await loginViaUI(page, scratchUsername, scratchPassword, true);

    // 直连 API（不经 UI），200 即读面鉴权键真正放行，而非前端隐藏绕开
    const res = await apiCallRaw<{ list?: unknown[] }>(
      page,
      'GET',
      '/notifications?page=1&page_size=50'
    );
    expect(
      Array.isArray(res.list),
      `list 应为数组，实际 keys=${JSON.stringify(Object.keys(res))}`
    ).toBe(true);

    // 自举数据保证至少一条，且标题含本用例标识（按自身用户返回）
    const items = res.list as Array<{ title?: string }>;
    expect(items.length, '通知列表应含自举公告').toBeGreaterThanOrEqual(1);
    expect(
      items.some(n => n.title?.includes('E2E-481')),
      '列表中应含本用例自举的公告'
    ).toBe(true);
  });

  test('481-03 同一岗位：收件人选择器不可达 + 直接调 /users 被后端 4xx', async ({ page }) => {
    await loginViaUI(page, scratchUsername, scratchPassword, true);
    await page.goto(`${BASE_URL}/notification`);
    await page.waitForLoadState('networkidle');

    // 3a 前端面：该岗位无 notifications:create，公告卡整体被移除；
    // 即便公告卡存在，其内收件人选择器也因 v-permission users:read 被移除。
    const recipientSelectCount = await page.locator('.announce-card .el-select').count();
    expect(
      recipientSelectCount,
      `无 users:read 的岗位不应渲染收件人 el-select（v-permission 应移除该 form-item），实际 count=${recipientSelectCount}`
    ).toBe(0);

    // 3b 后端面：直接调 GET /users 必须被拒（4xx + FORBIDDEN 语义），不能只断前端
    const fail = await apiCallExpectFail(page, 'GET', '/users?page=1&page_size=1');
    expect(
      fail.status,
      `无 users:read 调 GET /users 应被后端拒绝（4xx），实际 ${fail.status}`
    ).toBeGreaterThanOrEqual(400);
    expect(fail.status, `应为客户端拒绝而非 5xx，实际 ${fail.status}`).toBeLessThan(500);
  });

  test('481-04 超管：整页与选择器可用，列表有真实条目', async ({ page }) => {
    await loginViaUI(page);
    await page.goto(`${BASE_URL}/notification`);
    await page.waitForLoadState('networkidle');

    // 页面可达
    expect(page.url(), `超管进通知中心不应 403，实际 URL=${page.url()}`).not.toContain('/403');

    // 公告卡可见（超管持 notifications:create 通配）
    const announceCard = page.locator('.announce-card');
    await expect(announceCard).toBeVisible({ timeout: 10_000 });

    // 收件人选择器可见（超管持 users:read）
    const recipientSelect = announceCard.locator('.el-select').first();
    await expect(recipientSelect).toBeVisible();

    // 列表读出真实条目（含 beforeAll 发给 admin 自身的自举公告；空列表不算通过）
    const items = page.locator('.notification-list .notification-item');
    const count = await items.count();
    expect(count, `超管的通知列表应有真实条目（非空），实际 ${count}`).toBeGreaterThan(0);
  });
});
