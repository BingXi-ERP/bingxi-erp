// 515 跨用户通知批量已读：A 的批量读只命中本人 UNREAD，混入的他人 id 不生效且幂等。
// 后端判据（源码优先于取证候选）：
// - routes/analytics.rs:422-425 挂 POST /notifications/announcement → handlers/notification_handler.rs:231
//   → services/event_notification_service.rs:944-983 逐人落 SYSTEM 通知；读面 list 为 notifications
//   表实体全列（models/notification.rs:101-...），notification_type/priority/status 出参均为大写词表。
// - routes/analytics.rs:434-437 挂 POST /notifications/batch-read → handler :108-120，
//   services/notification_service.rs:450-473 的 update_many 同时过滤 Id.is_in + UserId.eq(self)
//   + Status=UNREAD；出参是行数，成功文案由 handler 固定为「成功标记 {N} 条通知为已读」。
// - POST /notifications/{id}/read 末段 read 派生 notifications:read 过 RBAC 后，
//   由 service :430-447 的 user_id 比对拒绝，出 HTTP 403 / code=FORBIDDEN /
//   message=PERMISSION_PUBLIC（utils/messages.rs:47「无权限」）。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectDenied,
  genCode,
  pickDifferentUserCredential,
  loginInIsolatedContext,
} from '../flow/helpers';

/** notification_handler 同步落库，留窗口避免读写连接池时差（与 504 通知用例同口径） */
const NOTIF_SETTLE_MS = 3000;

/** models/notification.rs Model 的 17 列，读面出参键集必须逐字相等 */
const NOTIFICATION_COLUMNS = [
  'id',
  'user_id',
  'notification_type',
  'title',
  'content',
  'priority',
  'status',
  'business_type',
  'business_id',
  'action_url',
  'sender_id',
  'sender_name',
  'read_at',
  'processed_at',
  'created_at',
  'updated_at',
  'dedup_key',
] as const;

interface NotificationRow {
  id: number;
  user_id: number;
  notification_type: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  business_type: string | null;
  business_id: number | null;
  action_url: string | null;
  sender_id: number | null;
  sender_name: string | null;
  read_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
  dedup_key: string | null;
}

async function listInbox(
  page: Page,
  status: 'UNREAD' | 'READ',
  tag: string
): Promise<NotificationRow[]> {
  const body = await apiCallRaw<{ list?: NotificationRow[] }>(
    page,
    'GET',
    `/notifications?status=${status}&page=1&page_size=100`
  );
  if (body === undefined) {
    throw new Error(`[515] ${tag} /notifications?status=${status} 无响应体`);
  }
  if (!Array.isArray(body.list)) {
    throw new Error(
      `[515] ${tag} /notifications?status=${status} 缺少 list 数组，实际 ${JSON.stringify(body)}`
    );
  }
  return body.list;
}

function pickByTitle(rows: NotificationRow[], title: string, tag: string): NotificationRow {
  const hits = rows.filter(row => row.title === title);
  expect(hits.length, `[515] ${tag} 唯一 title 应恰好命中 1 条，实际 ${hits.length}`).toBe(1);
  const row = hits[0];
  if (row === undefined) {
    throw new Error(`[515] ${tag} 唯一 title 未解析到通知行`);
  }
  return row;
}

function requireUserId(me: { id?: number }, tag: string): number {
  expect(
    Number.isInteger(me.id),
    `[515] ${tag} /auth/me 应返回整数 id，实际 ${JSON.stringify(me)}`
  ).toBe(true);
  const id = me.id;
  if (id === undefined) {
    throw new Error(`[515] ${tag} /auth/me 缺少 id`);
  }
  return id;
}

function assertRow(
  row: NotificationRow,
  tag: string,
  expected: { userId: number; title: string; content: string; status: 'UNREAD' | 'READ' }
): void {
  expect(Object.keys(row).sort(), `[515] ${tag} 键集应恰为 notifications 表 17 列`).toEqual(
    [...NOTIFICATION_COLUMNS].sort()
  );
  expect(row.id > 0, `[515] ${tag} id 应为正数，实际 ${row.id}`).toBe(true);
  expect(row.user_id, `[515] ${tag} user_id 应为会话本人`).toBe(expected.userId);
  expect(row.notification_type, `[515] ${tag} notification_type 出参应为大写 SYSTEM`).toBe(
    'SYSTEM'
  );
  expect(row.title, `[515] ${tag} title 应与唯一 marker 逐字相等`).toBe(expected.title);
  expect(row.content, `[515] ${tag} content 应与唯一 marker 逐字相等`).toBe(expected.content);
  expect(row.priority, `[515] ${tag} priority 出参应为大写 NORMAL`).toBe('NORMAL');
  expect(row.status, `[515] ${tag} status 出参应为大写 ${expected.status}`).toBe(expected.status);
  expect(row.business_type, `[515] ${tag} 公告 business_type 应为 SYSTEM`).toBe('SYSTEM');
  expect(row.business_id, `[515] ${tag} 公告 business_id 应为 null`).toBeNull();
  expect(row.action_url, `[515] ${tag} 公告 action_url 应为 null`).toBeNull();
  expect(row.sender_id, `[515] ${tag} 系统公告 sender_id 应为 null`).toBeNull();
  expect(row.sender_name, `[515] ${tag} 系统公告 sender_name 应为系统管理员`).toBe('系统管理员');
  expect(row.created_at.length > 0, `[515] ${tag} created_at 应为非空时间串`).toBe(true);
  expect(row.updated_at.length > 0, `[515] ${tag} updated_at 应为非空时间串`).toBe(true);
  expect(row.dedup_key, `[515] ${tag} 公告 dedup_key 应为 null`).toBeNull();
  if (expected.status === 'READ') {
    expect(
      typeof row.read_at === 'string' && row.read_at.length > 0,
      `[515] ${tag} READ 行 read_at 应为非空时间串`
    ).toBe(true);
  } else {
    expect(row.read_at, `[515] ${tag} UNREAD 行 read_at 应为 null`).toBeNull();
  }
  expect(row.processed_at, `[515] ${tag} processed_at 应为 null`).toBeNull();
}

test.describe.serial('515 通知批量已读跨用户隔离', () => {
  test('515-1 A 批量已读只落本人，混入 B 的 id 不生效且重发幂等，B 仍 UNREAD', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const credB = pickDifferentUserCredential();
    const sessionB = await loginInIsolatedContext(browser, credB.username, credB.password);
    let aNotifId: number | undefined;
    let bNotifId: number | undefined;
    try {
      const aUserId = requireUserId(
        await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me'),
        'A'
      );
      const bUserId = requireUserId(
        await apiCallRaw<{ id?: number }>(sessionB.page, 'GET', '/auth/me'),
        'B'
      );
      expect(bUserId === aUserId, '[515] B 必须与 A 是不同 user_id').toBe(false);

      const title = genCode('515批量已读');
      const content = genCode('515批量已读正文');
      const sent = await apiCallRaw<{ delivered_count?: number }>(
        page,
        'POST',
        '/notifications/announcement',
        { user_ids: [aUserId, bUserId], title, content }
      );
      expect(sent?.delivered_count, '[515] 公告应恰好投递 A/B 两个不同用户').toBe(2);
      await page.waitForTimeout(NOTIF_SETTLE_MS);

      const aInitial = pickByTitle(await listInbox(page, 'UNREAD', 'A 初始'), title, 'A 初始');
      const bInitial = pickByTitle(
        await listInbox(sessionB.page, 'UNREAD', 'B 初始'),
        title,
        'B 初始'
      );
      assertRow(aInitial, 'A 初始', { userId: aUserId, title, content, status: 'UNREAD' });
      assertRow(bInitial, 'B 初始', { userId: bUserId, title, content, status: 'UNREAD' });
      expect(aInitial.id === bInitial.id, '[515] A/B 必须是两条不同通知行').toBe(false);
      aNotifId = aInitial.id;
      bNotifId = bInitial.id;

      const first = await apiCall<number>(page, 'POST', '/notifications/batch-read', {
        ids: [bNotifId, aNotifId],
      });
      expect(first.data, '[515] 批量已读只应命中 A 本人 1 条 UNREAD').toBe(1);
      expect(first.message, '[515] 成功文案应逐字来自 handler success_with_message').toBe(
        '成功标记 1 条通知为已读'
      );

      const second = await apiCall<number>(page, 'POST', '/notifications/batch-read', {
        ids: [bNotifId, aNotifId],
      });
      expect(second.data, '[515] 幂等重发不应再更新任何行').toBe(0);
      expect(second.message, '[515] 幂等文案应为 0 条').toBe('成功标记 0 条通知为已读');

      const denied = await apiCallExpectFail(page, 'POST', `/notifications/${bNotifId}/read`);
      expectDenied(denied, '[515] A 对 B 的通知发单条已读应被 owner 门拒绝');
      expect(denied.message, '[515] 403 文案应为 PERMISSION_PUBLIC 脱敏常量').toBe('无权限');

      const aRead = pickByTitle(await listInbox(page, 'READ', 'A 回读'), title, 'A 回读');
      assertRow(aRead, 'A 回读', { userId: aUserId, title, content, status: 'READ' });
      expect(aRead.id, '[515] A 回读应命中同一条通知').toBe(aNotifId);
      expect(
        (await listInbox(page, 'UNREAD', 'A 回读')).some(row => row.id === aNotifId),
        '[515] A 的该通知不应再出现在 UNREAD 列表'
      ).toBe(false);

      const bAfter = pickByTitle(
        await listInbox(sessionB.page, 'UNREAD', 'B 回读'),
        title,
        'B 回读'
      );
      assertRow(bAfter, 'B 回读', { userId: bUserId, title, content, status: 'UNREAD' });
      expect(bAfter.id, '[515] B 回读应命中同一条通知').toBe(bNotifId);
      expect(
        (await listInbox(sessionB.page, 'READ', 'B 回读')).some(row => row.id === bNotifId),
        '[515] B 的通知不得出现在 A 批量已读后的 READ 列表'
      ).toBe(false);
    } finally {
      if (aNotifId !== undefined) {
        await apiCall(page, 'DELETE', `/notifications/${aNotifId}`);
        const afterDelete = await apiCallRaw<{ status?: string }>(
          page,
          'GET',
          `/notifications/${aNotifId}`
        );
        expect(afterDelete.status, '[515] A 清理后详情回读应为软删 DELETED').toBe('DELETED');
      }
      if (bNotifId !== undefined) {
        await apiCall(sessionB.page, 'DELETE', `/notifications/${bNotifId}`);
        const afterDelete = await apiCallRaw<{ status?: string }>(
          sessionB.page,
          'GET',
          `/notifications/${bNotifId}`
        );
        expect(afterDelete.status, '[515] B 清理后详情回读应为软删 DELETED').toBe('DELETED');
      }
      await sessionB.close();
    }
  });
});
