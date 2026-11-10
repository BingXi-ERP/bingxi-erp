// 系统公告发送门禁前后端同源：唯一判定口径是权限键 notifications:create
//   （POST /notifications/announcement 的键由资源段 notifications 与 POST 方法派生，
//    与公告卡片 v-permission 用的是同一个键）。
//
// 修复前的事实：卡片可见性读权限键，函数体里的受理判定读角色码（admin_checker 里
// ADMIN_ROLE_CODE 等于 admin 那一套），两套口径在持有 notifications:create 的非超管岗位上
// 必然背离——看得见、填得完、发不出。
//
// 本文件锁住五条真断言：
//  1) 持 notifications:create 的非超管岗位直连 POST 放行，delivered_count 等于收件人数；
//  2) 收件人在自己的通知列表里读到这条公告（写面与读面逐值对账，不只看接口没报错）；
//  3) 同一岗位进通知中心，公告卡片渲染（可见性与受理性同键，不再出现假可供性）；
//  4) 只持 notifications:read 的岗位：公告卡片不渲染，且直连 POST 被后端拒 4xx 且小于 500
//     （鉴权拦截不能只靠前端隐藏）；
//  5) 超管回归：同一条 POST 仍放行，本次改动不削减 admin 能力。
//
// 前置数据本用例全部自建（两枚非内置角色与三枚非超管用户），不依赖库里恰好存在某岗位；
// 回收在 afterAll 统一执行。
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

interface ScratchUser {
  id: number;
  username: string;
  password: string;
}

/** 建唯一命名的非内置角色 */
async function createScratchRole(page: Page, tag: string): Promise<RoleRow> {
  const stamp =
    Date.now().toString().slice(-6) +
    Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
  const code = `e2ag${tag.toLowerCase()}${stamp}`;
  const name = `E2E公告门${tag}${stamp}`;
  const created = await apiCallRaw<{ id: number }>(page, 'POST', '/roles', { name, code });
  expect(Number.isFinite(created.id), `建角色应返回 id，实际：${JSON.stringify(created)}`).toBe(
    true
  );
  const row = await apiCallRaw<RoleRow>(page, 'GET', `/roles/${created.id}`);
  expect(row.code, `角色回读 code 应为 ${code}，实际：${row.code}`).toBe(code);
  expect(row.is_system, '自建角色不应是内置角色').toBe(false);
  return row;
}

/** 给角色写一条角色级授予（仅用于夹具前置） */
async function seedGrant(
  page: Page,
  roleId: number,
  resourceType: string,
  action: string
): Promise<void> {
  await apiCallRaw(page, 'POST', `/roles/${roleId}/permissions`, {
    resource_type: resourceType,
    action,
    allowed: true,
  });
}

/** 建一枚非超管用户并返回登录三件套；口令避开 4 连数字行子串（后端键盘序列硬错误） */
async function createScratchUser(
  page: Page,
  roleId: number,
  nameTag: string
): Promise<ScratchUser> {
  const stamp =
    Date.now().toString().slice(-6) +
    Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, '0');
  const username = `e2ag_${nameTag.toLowerCase()}${stamp}`;
  const password = `Ag@${stamp.slice(0, 3)}k${stamp.slice(3)}Z7`;
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

/** 以当前会话身份发一条系统公告，返回本次投递数 */
async function sendAnnouncement(page: Page, targetUserIds: number[], tag: string): Promise<number> {
  const result = await apiCallRaw<{ delivered_count: number }>(
    page,
    'POST',
    '/notifications/announcement',
    {
      user_ids: targetUserIds,
      title: `E2E-482 公告 ${tag}`,
      content: `本条公告由 482 号用例自动创建，用于验证公告发送门控只认权限键。标识：${tag}`,
    }
  );
  return result.delivered_count;
}

test.describe.serial('482 系统公告发送门控前后端同源', () => {
  // 夹具状态在 beforeAll 自建、afterAll 统一回收；逐例回收会让后续用例拿不到登录名。
  let senderRoleId = 0;
  let plainRoleId = 0;
  let sender: ScratchUser = { id: 0, username: '', password: '' };
  let target: ScratchUser = { id: 0, username: '', password: '' };
  let plain: ScratchUser = { id: 0, username: '', password: '' };
  // 482-01 写入、482-02 读取的同一条公告标识
  let sentTag = '';

  test.beforeAll(async ({ browser }) => {
    // beforeAll 不注入 page，用本 worker 会话态独立建 context
    const seedContext = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await seedContext.newPage();
    try {
      await loginViaUI(page);

      // 发送岗：notifications:read 与 notifications:create，且不含任何 admin 角色码。
      // 放行依据只能是 create 键，因为岗位码是本用例现造的随机码，不在任何角色码白名单里。
      const senderRole = await createScratchRole(page, 'S');
      senderRoleId = senderRole.id;
      await seedGrant(page, senderRoleId, 'notifications', 'read');
      await seedGrant(page, senderRoleId, 'notifications', 'create');
      sender = await createScratchUser(page, senderRoleId, 's');

      // 只读岗：只授 notifications:read，刻意不授 create
      const plainRole = await createScratchRole(page, 'P');
      plainRoleId = plainRole.id;
      await seedGrant(page, plainRoleId, 'notifications', 'read');
      plain = await createScratchUser(page, plainRoleId, 'p');

      // 收件人挂在只读岗下：读自己的通知走壳权限里的 notifications:read
      target = await createScratchUser(page, plainRoleId, 't');
    } finally {
      await seedContext.close();
    }
  });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const u of [sender, target, plain]) {
        if (u.id > 0) await tryCleanup(page, 'DELETE', `/users/${u.id}`, `user#${u.id}`);
      }
      for (const roleId of [senderRoleId, plainRoleId]) {
        if (roleId > 0) await tryCleanup(page, 'DELETE', `/roles/${roleId}`, `role#${roleId}`);
      }
    } finally {
      await ctx.close();
    }
  });

  test('482-01 非超管持 notifications:create：直连 POST 公告放行且投递数等于收件人数', async ({
    page,
  }) => {
    await loginViaUI(page, sender.username, sender.password, true);

    sentTag = genCode('A');
    const delivered = await sendAnnouncement(page, [target.id], sentTag);
    expect(delivered, `持 create 键的非超管发公告应投递 1 条，实际：${delivered}`).toBe(1);
  });

  test('482-02 收件人读面回读：自己的通知列表里能读到 482-01 那条公告', async ({ page }) => {
    expect(sentTag, '482-02 需要 482-01 先发出公告').not.toBe('');
    await loginViaUI(page, target.username, target.password, true);

    const res = await apiCallRaw<{ list?: unknown[] }>(
      page,
      'GET',
      '/notifications?page=1&page_size=50'
    );
    expect(
      Array.isArray(res.list),
      `list 应为数组，实际 keys=${JSON.stringify(Object.keys(res))}`
    ).toBe(true);

    const items = res.list as Array<{ title?: string }>;
    expect(
      items.some(n => n.title?.includes(sentTag)),
      `收件人列表应含标识 ${sentTag} 的公告，实际标题集：${JSON.stringify(items.map(n => n.title))}`
    ).toBe(true);
  });

  test('482-03 同一岗位进通知中心：公告卡片渲染，可见性与受理性同键', async ({ page }) => {
    await loginViaUI(page, sender.username, sender.password, true);
    await page.goto(`${BASE_URL}/notification`);
    await page.waitForLoadState('networkidle');

    expect(page.url(), '持 create 的岗位进通知中心不应被弹到 /403').not.toContain('/403');
    const announceCardCount = await page.locator('.announce-card').count();
    expect(
      announceCardCount,
      `持 notifications:create 的岗位应渲染公告卡片（后端已放行，前端不应继续隐藏），实际 count=${announceCardCount}`
    ).toBe(1);
  });

  test('482-04 只持 notifications:read 的岗位：卡片不渲染且直连 POST 被后端拒 4xx', async ({
    page,
  }) => {
    await loginViaUI(page, plain.username, plain.password, true);
    await page.goto(`${BASE_URL}/notification`);
    await page.waitForLoadState('networkidle');

    const announceCardCount = await page.locator('.announce-card').count();
    expect(
      announceCardCount,
      `无 notifications:create 的岗位不应渲染公告卡片，实际 count=${announceCardCount}`
    ).toBe(0);

    // 前端隐藏之外还要断后端鉴权：直连调用必须被拒，且是客户端拒绝而不是 5xx
    const fail = await apiCallExpectFail(page, 'POST', '/notifications/announcement', {
      user_ids: [target.id],
      title: `E2E-482 越位公告 ${genCode('X')}`,
      content: '越权尝试',
    });
    expect(
      fail.status,
      `无 create 键发公告应被后端拒绝（4xx），实际 ${fail.status}`
    ).toBeGreaterThanOrEqual(400);
    expect(fail.status, `应为客户端拒绝而非 5xx，实际 ${fail.status}`).toBeLessThan(500);
  });

  test('482-05 超管回归：同一条 POST 公告仍放行', async ({ page }) => {
    await loginViaUI(page);
    const tag = genCode('A');
    const delivered = await sendAnnouncement(page, [target.id], tag);
    expect(
      delivered,
      `超管发公告应投递 1 条，本次改动不得削减 admin 能力，实际：${delivered}`
    ).toBe(1);
  });
});
