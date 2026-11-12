import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  loginViaUI,
  apiCallRaw,
  apiCallExpectFail,
  pickDifferentUserCredential,
  loginInIsolatedContext,
} from './helpers';

/**
 * 4.7 消息通知链路：收件人维度隔离、敏感面收敛、防重复投递
 *
 * 后端事实基线（写面与读面逐一核对过源码）：
 * - 写面（HTTP 直达腿）POST /api/v1/erp/notifications/announcement
 * （服务端实现 挂载 → 服务端实现 的 create_announcement）：
 * 入参 { user_ids, title, content }，user_ids 先 sort_unstable+dedup 再投递
 * （服务端实现），逐用户调
 * 服务端实现 的 send_system_announcement（:794），
 * 每用户落一行 notifications：notification_type=SYSTEM、business_type=SYSTEM、
 * sender_name=系统管理员、dedup_key=None（服务端实现）。
 * 出参 { delivered_count }。
 * - 读面 GET /api/v1/erp/notifications（服务端实现 的 list_notifications）：
 * 按当前会话 user_id 过滤且排除 status=DELETED（服务端实现），
 * 出参 data = { list, total, page, page_size }，list 每行 = notifications 表实体全列
 * （服务端实现），键名即库列名（snake_case）。
 * GET /notifications/{id} 与 DELETE /notifications/{id} 均做 owner 校验，
 * 非本人 403（服务端实现）。DELETE 是软删（status→DELETED）。
 * - notifications 表列全集（去重/收件人断言的判据来源）：
 * id, user_id, notification_type, title, content, priority, status,
 * business_type, business_id, action_url, sender_id, sender_name,
 * read_at, processed_at, created_at, updated_at, dedup_key。
 *
 * 能力盘点结论（两种互不依赖口径交叉核对，本文件只断真实存在的腿）：
 * - 站内通知"失败重试"腿不存在：handlers 目录扫描（retry|wechat|订阅消息）命中文件均为
 * webhook/import/print 域，notification 相关 handler 零命中；route-snapshot.txt 中
 * retry 端点仅 data-import tasks 下 retry 与 webhooks 下 retry 两支，notifications
 * 前缀下无任何 retry 路由；notifications 表实体无 retry_count/next_retry_at 列。
 * 邮件重试在 email_log 域（SMTP 队列）、Webhook 重试在 webhooks 域，均非站内通知腿。
 * - "同事件去重"腿在 HTTP 同步面只有 announcement 的 user_ids 去重；
 * dedup_key 5 分钟/24h 窗口（服务端实现 的 check_dedup）只由事件监听与
 * 库存预警调度器触达，announcement 传 dedup_key=None，HTTP 面无法同步驱动该窗口。
 *
 * 敏感数据断言口径：通知读面出参键集恰好等于上列 notifications 表 17 列白名单
 * （无 phone/mobile/email/cost/margin 类键），文本面（title/content/action_url/
 * sender_name 拼接）不得出现中国大陆手机号形态与"成本价/毛利"字样。
 *
 * 账号：默认会话 = 本 worker 管理员账号 A（收公告的对照收件人）；
 * B 取 role-credentials.json 中与 A 不同的独立身份账号
 * （既有测试工具 的 pickDifferentUserCredential），口令经该凭证只读取得，源码不拼字面量。
 */

/** 发布走 handler 同步落库（await create_notification 后才返回），仍留窗口防读写连接池时差 */
const NOTIF_SETTLE_MS = 3000;

/** notifications 表实体全列（服务端实现），读面出参键集的白名单基准 */
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

/** 敏感列名黑名单片段：任何键名命中即视为通知读面泄露了联系人/成本类列 */
const SENSITIVE_KEY_FRAGMENTS = [
  'phone',
  'mobile',
  'email',
  'cost',
  'margin',
  'profit',
  'password',
];

/** 中国大陆手机号形态（11 位，1 开头，第二位 3-9） */
const PHONE_PATTERN = /1[3-9]\d{9}/;

interface NotificationRow {
  id: number;
  user_id: number;
  notification_type: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  business_type: string | null;
  sender_name: string | null;
  dedup_key: string | null;
}

async function listNotificationRows(
  page: Page,
  status?: 'UNREAD' | 'READ' | 'PROCESSED'
): Promise<NotificationRow[]> {
  const q = `page=1&page_size=100${status ? `&status=${status}` : ''}`;
  const body = await apiCallRaw<{ list?: NotificationRow[]; total: number }>(
    page,
    'GET',
    `/notifications?${q}`
  );
  if (!Array.isArray(body?.list)) {
    throw new Error(
      `[504] /notifications 响应缺少 list 数组，实际 keys=${JSON.stringify(Object.keys(body ?? {}))}`
    );
  }
  return body.list;
}

test.describe.serial('4.7 通知链路：收件人隔离 / 敏感面 / 防重复投递', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('504-1 消息不推错人：公告只落 B 的收件箱，落库列与读面 owner 隔离均按真实列断', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const credB = pickDifferentUserCredential();
    const sessionB = await loginInIsolatedContext(browser, credB.username, credB.password);
    try {
      const meA = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
      const meB = await apiCallRaw<{ id?: number }>(sessionB.page, 'GET', '/auth/me');
      expect(meA?.id, '[504-1] A 侧 /auth/me 未返回数值 id').toBeTruthy();
      expect(meB?.id, '[504-1] B 侧 /auth/me 未返回数值 id').toBeTruthy();
      expect(meB!.id, '[504-1] B 与 A 必须是不同 user_id').not.toBe(meA!.id);

      const tag = Date.now().toString().slice(-8);
      const title = `504收件人隔离-${tag}`;
      const content = `504收件人隔离正文-${tag}`;

      // 写面：只投给 B（delivered_count 是 handler 去重后实际投递人数）
      const sent = await apiCallRaw<{ delivered_count?: number }>(
        page,
        'POST',
        '/notifications/announcement',
        { user_ids: [meB!.id], title, content }
      );
      expect(sent?.delivered_count, '[504-1] 应恰好投递 1 个目标用户').toBe(1);

      await page.waitForTimeout(NOTIF_SETTLE_MS);

      // 真实落库列断言（B 侧读面）：user_id/notification_type/business_type/status/sender_name
      const rowsB = await listNotificationRows(sessionB.page, 'UNREAD');
      const hitB = rowsB.find(r => r.title === title);
      expect(hitB, `[504-1] B 的未读列表应出现标题「${title}」的公告`).toBeTruthy();
      expect(hitB!.user_id, '[504-1] 落库收件人列 user_id 必须等于 B 的 id').toBe(meB!.id);
      expect(hitB!.notification_type, '[504-1] 公告腿落库类型列为 SYSTEM').toBe('SYSTEM');
      expect(hitB!.business_type, '[504-1] 公告腿落库 business_type 列为 SYSTEM').toBe('SYSTEM');
      expect(hitB!.status, '[504-1] 新公告落库状态列为 UNREAD').toBe('UNREAD');
      expect(hitB!.content, '[504-1] 落库正文应与写入正文逐字一致').toBe(content);
      expect(hitB!.sender_name, '[504-1] 公告腿 sender_name 列为系统管理员').toBe('系统管理员');

      // owner 隔离：A（管理员）列表里没有这条，且 A 直接读/删 B 的通知被 403 拒绝
      const rowsA = await listNotificationRows(page);
      expect(
        rowsA.some(r => r.title === title),
        '[504-1] A 的列表不应出现只投给 B 的公告（列表按会话 user_id 过滤）'
      ).toBe(false);
      const readAsA = await apiCallExpectFail(page, 'GET', `/notifications/${hitB!.id}`);
      expect(readAsA.status, '[504-1] A 直读 B 的通知应被拒（403/404，owner 校验）').toBe(403);
      const delAsA = await apiCallExpectFail(page, 'DELETE', `/notifications/${hitB!.id}`);
      expect(delAsA.status, '[504-1] A 删除 B 的通知应被拒（owner 校验）').toBe(403);

      // 清理：B 本人软删（status→DELETED），读面列表消失 + 详情回读状态列为 DELETED 作等价证据
      await apiCallRaw(sessionB.page, 'DELETE', `/notifications/${hitB!.id}`);
      const gone = await listNotificationRows(sessionB.page);
      expect(
        gone.some(r => r.id === hitB!.id),
        '[504-1] 清理后 B 的列表应不再含该通知（读面排除 DELETED）'
      ).toBe(false);
      const afterDelete = await apiCallRaw<{ status?: string }>(
        sessionB.page,
        'GET',
        `/notifications/${hitB!.id}`
      );
      expect(afterDelete?.status, '[504-1] 软删等价证据：详情回读 status 列应为 DELETED').toBe(
        'DELETED'
      );
    } finally {
      await sessionB.close();
    }
  });

  test('504-2 不泄露敏感数据：读面出参键集恰为 notifications 表列，文本面无手机号/成本价/毛利', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const credB = pickDifferentUserCredential();
    const sessionB = await loginInIsolatedContext(browser, credB.username, credB.password);
    try {
      const meB = await apiCallRaw<{ id?: number }>(sessionB.page, 'GET', '/auth/me');
      expect(meB?.id, '[504-2] B 侧 /auth/me 未返回数值 id').toBeTruthy();

      // 给 B 投一条真实公告，保证被检行是"刚写入→刚读出"的完整往返行
      const tag = Date.now().toString().slice(-8);
      const title = `504敏感面-${tag}`;
      const sent = await apiCallRaw<{ delivered_count?: number }>(
        page,
        'POST',
        '/notifications/announcement',
        { user_ids: [meB!.id], title, content: `504敏感面正文-${tag}` }
      );
      expect(sent?.delivered_count, '[504-2] 公告应投递 1 个目标用户').toBe(1);
      await page.waitForTimeout(NOTIF_SETTLE_MS);

      const rows = await listNotificationRows(sessionB.page);
      expect(rows.length, '[504-2] B 列表为空则键集断言无检测力，判前置缺失').toBeGreaterThan(0);
      const target = rows.find(r => r.title === title);
      expect(target, `[504-2] 找不到本轮写入的「${title}」行`).toBeTruthy();

      // 逐行核出参键集：与 notifications 实体列全集逐字符一致，杜绝富化夹带联系人/成本列
      for (const row of rows) {
        const keys = Object.keys(row);
        const extra = keys.filter(k => !(NOTIFICATION_COLUMNS as readonly string[]).includes(k));
        expect(
          extra,
          `[504-2] 通知行 id=${row.id} 出现表列之外的键（疑似富化泄露）: ${JSON.stringify(extra)}`
        ).toEqual([]);
        const sensitive = keys.filter(k =>
          SENSITIVE_KEY_FRAGMENTS.some(f => k.toLowerCase().includes(f))
        );
        expect(
          sensitive,
          `[504-2] 通知行 id=${row.id} 键名命中敏感片段（phone/mobile/email/cost/margin 类）: ${JSON.stringify(sensitive)}`
        ).toEqual([]);
        // 文本面：title+content+action_url+sender_name 拼接后不得含手机号形态与成本口径词
        const text = [
          row.title,
          row.content,
          (row as { action_url?: string | null }).action_url ?? '',
          row.sender_name ?? '',
        ].join('\n');
        expect(
          PHONE_PATTERN.test(text),
          `[504-2] 通知行 id=${row.id} 文本面出现手机号形态: ${text.slice(0, 120)}`
        ).toBe(false);
        expect(text, '[504-2] 通知行文本面不应出现「成本价」').not.toContain('成本价');
        expect(text, '[504-2] 通知行文本面不应出现「毛利」').not.toContain('毛利');
      }

      // 清理本轮自建行（B 本人软删），残留列表不含该标题即清理证据
      await apiCallRaw(sessionB.page, 'DELETE', `/notifications/${target!.id}`);
      const afterCleanup = await listNotificationRows(sessionB.page);
      expect(
        afterCleanup.some(r => r.title === title),
        '[504-2] 清理后 B 列表不应再含本轮通知标题'
      ).toBe(false);
    } finally {
      await sessionB.close();
    }
  });

  test('504-3 防重复轰炸：同一公告请求内 user_ids 重复三次只落一行，真实行数守恒', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const credB = pickDifferentUserCredential();
    const sessionB = await loginInIsolatedContext(browser, credB.username, credB.password);
    try {
      const meB = await apiCallRaw<{ id?: number }>(sessionB.page, 'GET', '/auth/me');
      expect(meB?.id, '[504-3] B 侧 /auth/me 未返回数值 id').toBeTruthy();

      const tag = Date.now().toString().slice(-8);
      const title = `504防轰炸-${tag}`;

      // 同一请求把 B 重复列三人次：handler 在投递前 sort_unstable+dedup
      // （服务端实现），delivered_count 与真实落库行数都必须守恒为 1
      const sent = await apiCallRaw<{ delivered_count?: number }>(
        page,
        'POST',
        '/notifications/announcement',
        { user_ids: [meB!.id, meB!.id, meB!.id], title, content: `504防轰炸正文-${tag}` }
      );
      expect(
        sent?.delivered_count,
        '[504-3] user_ids 重复三次的同一目标应被去重，delivered_count 必须为 1'
      ).toBe(1);

      await page.waitForTimeout(NOTIF_SETTLE_MS);
      const rowsB = await listNotificationRows(sessionB.page);
      const dupCount = rowsB.filter(r => r.title === title).length;
      expect(dupCount, '[504-3] B 收件箱中该标题通知行数应守恒为 1（读面即真实表行）').toBe(1);

      // 对照面：A（管理员，写面操作者）不是收件人，一行都不该有
      const rowsA = await listNotificationRows(page);
      expect(
        rowsA.filter(r => r.title === title).length,
        '[504-3] 非收件人 A 的列表不应出现该通知'
      ).toBe(0);

      // 清理（B 本人软删 + 读面消失证据）
      const target = rowsB.find(r => r.title === title)!;
      await apiCallRaw(sessionB.page, 'DELETE', `/notifications/${target.id}`);
      const afterCleanup = await listNotificationRows(sessionB.page);
      expect(
        afterCleanup.some(r => r.id === target.id),
        '[504-3] 清理后 B 列表不应再含该通知行'
      ).toBe(false);
    } finally {
      await sessionB.close();
    }
  });
});
