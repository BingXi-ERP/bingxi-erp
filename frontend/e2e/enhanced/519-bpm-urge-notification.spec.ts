// 4.519 BPM pending 任务催办通知落库链（纯 API，不依赖共享任务）。
//
// 后端判据（逐字段核源）：
// - `POST /bpm/tasks/{task_id}/urge` 挂载于 backend/src/routes/system.rs:156；handler
//   backend/src/handlers/bpm_handler.rs:284-303 收 `{urge_message:String}`，成功出参
//   `data="催办成功"`、`message="催办通知已发送"`。
// - 服务 backend/src/services/bpm_ops/task.rs:547-601：仅 `task.status == pending`
//   可催办；通过后给 `actual_handler_id` 创建通知：type=INTERNAL、title="任务催办"、
//   content=`任务 '{task_no}' 需要您尽快处理。催办消息: {urge_message}`、priority=HIGH、
//   business_type=BPM、business_id=instance_id、action_url=/bpm/approval、sender_id=None、
//   sender_name=系统、dedup_key=None；创建失败只告警不影响主流程。
// - 落库 backend/src/services/notification_service.rs:103-138：status=UNREAD、
//   read_at/processed_at=None；实体键见 backend/src/models/notification.rs:98-137。
// - 词表：bpm_task 小写 pending/completed/rejected/cancelled
//   （backend/src/models/status/bpm_crm_contract.rs:131-145）；通知类型/优先级/状态均大写
//   （backend/src/models/notification.rs:10-31,47-64,79-96），逐字符比较。
//
// 覆盖面与避让：
// - 519-01 钉正向八项通知字段逐列回读 + 催办前后任务状态/业务字段零变化。
// - 519-02 钉 completed 状态催办门（非 pending 另一种状态样本）与“拒绝后不落催办通知”。
//   bpm/04-task-gate-negative.spec.ts:04-02 已覆盖 rejected 状态的状态门，本例不重复该样本；
//   两例的催办消息均由 genCode 生成唯一 marker，不依赖共享库全局 total。
//
// 造数与清理：每例自建 definition/process/task（唯一 code + 当前用户为 assignee），
// 经 GET /bpm/instances/{id}/detail 精确回查本例任务；afterEach 先删本例 BPM 通知、
// 再 cancel 未结束实例、最后删 definition。无浏览器下载/预览，不伪造端点，不提交。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const TASK_STATUS_PENDING = 'pending';
const TASK_STATUS_COMPLETED = 'completed';
const NOTIFICATION_TYPE_INTERNAL = 'INTERNAL';
const NOTIFICATION_STATUS_UNREAD = 'UNREAD';
const URGE_GATE_MESSAGE = '只能催办待处理任务'; // bpm_ops/task.rs:555

interface BpmTaskLite {
  id: number;
  task_no: string;
  status: string | null;
  actual_handler_id: number | null;
  approval_opinion: string | null;
}

interface InstanceDetailLite {
  instance: { id: number; instance_no: string; status: string | null };
  tasks: BpmTaskLite[];
}

interface NotificationLite {
  id: number;
  user_id: number;
  notification_type: string;
  title: string;
  content: string;
  priority: string;
  status: string;
  business_type: string | null;
  business_id: number | string | null;
  action_url: string | null;
  sender_id: number | null;
  sender_name: string | null;
  dedup_key: string | null;
  read_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface NotificationPage {
  list: NotificationLite[];
  total: number;
  page: number;
  page_size: number;
}

const CLEANUP: Array<{ method: 'DELETE' | 'POST'; path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  // 逆序：通知 → 未结束实例 cancel → definition。
  for (const c of CLEANUP.reverse()) await tryCleanup(page, c.method, c.path, c.label);
  CLEANUP.length = 0;
});

/** 建本例唯一 definition + process，返回精确锚点；assignee 固定为当前登录用户。 */
async function seedPendingTask(
  page: Page
): Promise<{ instanceId: number; taskId: number; myId: number }> {
  const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
  const myId = Number(me?.id);
  if (!Number.isInteger(myId) || myId <= 0) {
    throw new Error(`前置失败：/auth/me 未返回有效用户 id：${JSON.stringify(me)}`);
  }

  const processKey = genCode('e2e-urge');
  const defResp = await apiCall<{ id?: number }>(page, 'POST', '/bpm/definitions', {
    name: `E2E 催办通知流程 ${processKey}`,
    code: processKey,
    description: 'E2E 519 催办通知专用（本例自建）',
    category: 'e2e_test',
    version: '1.0',
    config: {
      nodes: [
        { id: 'start', name: '提交审批', type: 'start_event' },
        { id: 'approve_task', name: '审批节点', type: 'user_task', assignee_value: String(myId) },
        { id: 'end', name: '完成', type: 'end_event' },
      ],
      edges: [
        { source: 'start', target: 'approve_task' },
        { source: 'approve_task', target: 'end' },
      ],
    },
    status: 'ACTIVE',
  });
  const defId = defResp.data?.id;
  if (!defId) throw new Error(`建流程定义失败：${JSON.stringify(defResp)}`);
  CLEANUP.push({ method: 'DELETE', path: `/bpm/definitions/${defId}`, label: '519 definition' });

  const startResp = await apiCall<{ instance_id?: number; task_ids?: number[] }>(
    page,
    'POST',
    '/bpm/process/start',
    {
      process_key: processKey,
      business_type: 'e2e_test',
      business_id: defId,
      title: `E2E 催办通知 ${processKey}`,
      initiator_id: myId,
      initiator_name: `e2e_user_${myId}`,
    }
  );
  const instanceId = Number(startResp.data?.instance_id);
  const taskIds = startResp.data?.task_ids ?? [];
  if (!Number.isInteger(instanceId) || instanceId <= 0 || taskIds.length === 0) {
    throw new Error(`发起流程后未返回有效实例/任务：${JSON.stringify(startResp)}`);
  }
  CLEANUP.push({
    method: 'POST',
    path: `/bpm/instances/${instanceId}/cancel`,
    label: '519 instance cancel',
  });
  return { instanceId, taskId: Number(taskIds[0]), myId };
}

/** 从实例详情精确回查本例任务；detail 只含本实例任务，天然隔离共享 seed。 */
async function fetchTask(page: Page, instanceId: number, taskId: number): Promise<BpmTaskLite> {
  const detail = await apiCallRaw<InstanceDetailLite>(
    page,
    'GET',
    `/bpm/instances/${instanceId}/detail`
  );
  if (!Array.isArray(detail?.tasks)) {
    throw new Error(
      `GET /bpm/instances/${instanceId}/detail 未返回 tasks 数组：${JSON.stringify(detail).slice(0, 300)}`
    );
  }
  const task = detail.tasks.find(t => Number(t.id) === taskId);
  if (!task) throw new Error(`实例 ${instanceId} 详情中找不到本例任务 id=${taskId}`);
  return task;
}

/**
 * 通知列表只在服务端按 status/notification_type 过滤（notification_handler.rs:20-25），
 * business_type 不是查询参数；所以按本例 instance_id 在客户端精确筛选，绝不断全局 total。
 */
async function listBpmNotifications(page: Page, instanceId: number): Promise<NotificationLite[]> {
  const page1 = await apiCallRaw<NotificationPage>(
    page,
    'GET',
    `/notifications?status=${NOTIFICATION_STATUS_UNREAD}&notification_type=${NOTIFICATION_TYPE_INTERNAL}&page=1&page_size=100`
  );
  if (!Array.isArray(page1?.list)) {
    throw new Error(`GET /notifications 未返回 list 数组：${JSON.stringify(page1).slice(0, 300)}`);
  }
  return page1.list.filter(n => n.business_type === 'BPM' && Number(n.business_id) === instanceId);
}

/** 把本例产生的 BPM 通知登记清理；DELETE /notifications/{id} 在册（routes/analytics.rs:427-430）。 */
function registerNotificationCleanup(rows: NotificationLite[]): void {
  for (const n of rows) {
    const id = Number(n.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`BPM 通知主键异常，拒绝登记清理：${JSON.stringify(n)}`);
    }
    CLEANUP.push({
      method: 'DELETE',
      path: `/notifications/${id}`,
      label: `519 notification ${id}`,
    });
  }
}

test.describe('519 BPM 催办通知落库链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('519-01 pending 催办成功，通知逐字段落库且任务状态与业务字段不变', async ({ page }) => {
    const { instanceId, taskId, myId } = await seedPendingTask(page);
    const before = await fetchTask(page, instanceId, taskId);
    expect(before.status, '前置任务必须是小写 pending').toBe(TASK_STATUS_PENDING);
    expect(Number(before.actual_handler_id), '前置任务处理人必须是当前用户').toBe(myId);

    const marker = genCode('E519URGE');
    const urged = await apiCall<string>(page, 'POST', `/bpm/tasks/${taskId}/urge`, {
      urge_message: marker,
    });
    expect(urged.data, '催办成功出参逐字符等于后端 data').toBe('催办成功');
    expect(urged.message, '催办成功消息逐字符等于后端 message').toBe('催办通知已发送');

    const after = await fetchTask(page, instanceId, taskId);
    for (const key of ['task_no', 'status', 'actual_handler_id', 'approval_opinion'] as const) {
      expect(after[key], `催办不得改写任务 ${key}`).toStrictEqual(before[key]);
    }
    expect(after.status, '催办后任务状态仍是 pending').toBe(TASK_STATUS_PENDING);

    const rows = await listBpmNotifications(page, instanceId);
    registerNotificationCleanup(rows);
    const matches = rows.filter(n => String(n.content ?? '').includes(marker));
    expect(matches.length, `唯一催办 marker ${marker} 必须只命中一条通知`).toBe(1);
    const note = matches[0];

    expect(Number(note.id), '通知主键必须为正整数').toBeGreaterThan(0);
    expect(Number(note.user_id), '通知接收人必须是处理人（当前用户）').toBe(myId);
    expect(note.notification_type, '站内信类型大写 INTERNAL').toBe(NOTIFICATION_TYPE_INTERNAL);
    expect(note.title, '催办标题逐字符相等').toBe('任务催办');
    expect(note.content, '催办内容按 task_no + marker 逐字符相等').toBe(
      `任务 '${before.task_no}' 需要您尽快处理。催办消息: ${marker}`
    );
    expect(note.priority, '催办优先级大写 HIGH').toBe('HIGH');
    expect(note.status, '新建通知未读状态大写 UNREAD').toBe(NOTIFICATION_STATUS_UNREAD);
    expect(note.business_type, '业务类型逐字符 BPM').toBe('BPM');
    expect(Number(note.business_id), '业务 id 必须指向本例流程实例').toBe(instanceId);
    expect(note.action_url, '跳转链接取写入方常量').toBe('/bpm/approval');
    expect(note.sender_id, '催办通知无具体发送人，DB NULL 出参 null').toBeNull();
    expect(note.sender_name, '发送人显示名为系统').toBe('系统');
    expect(note.dedup_key, '催办不走去重，dedup_key 为 null').toBeNull();
    expect(note.read_at, '未读通知 read_at 为 null').toBeNull();
    expect(note.processed_at, '未读通知 processed_at 为 null').toBeNull();
    expect(note.created_at, 'created_at 必须非空').toBeTruthy();
    expect(note.updated_at, 'updated_at 必须非空').toBeTruthy();
  });

  test('519-02 completed 任务催办被拒且不落催办通知', async ({ page }) => {
    const { instanceId, taskId, myId } = await seedPendingTask(page);
    const approveMarker = genCode('E519APPR');
    await apiCall(page, 'POST', '/bpm/tasks/approve', {
      task_id: taskId,
      handler_id: myId,
      handler_name: `e2e_user_${myId}`,
      action: 'approve',
      approval_opinion: `[519] completed 催办门 ${approveMarker}`,
    });
    const before = await fetchTask(page, instanceId, taskId);
    expect(before.status, '审批后任务应为小写 completed').toBe(TASK_STATUS_COMPLETED);

    // 先把发起流程自带的通知登记清理，再测负例；本例不期待新增催办通知。
    registerNotificationCleanup(await listBpmNotifications(page, instanceId));

    const marker = genCode('E519GATE');
    const denied = await apiCallExpectFail(page, 'POST', `/bpm/tasks/${taskId}/urge`, {
      urge_message: marker,
    });
    expect(denied.status, '非 pending 催办必须 400').toBe(400);
    expect(failureCode(denied), '机器码必须 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(denied.message, '业务拒因逐字符相等（该构造点显示原文）').toBe(URGE_GATE_MESSAGE);

    const after = await fetchTask(page, instanceId, taskId);
    expect(after.status, '拒绝后任务状态仍是 completed').toBe(TASK_STATUS_COMPLETED);
    expect(after.approval_opinion, '拒绝后审批意见不被催办改写').toBe(before.approval_opinion);

    const rowsAfter = await listBpmNotifications(page, instanceId);
    registerNotificationCleanup(rowsAfter);
    const leaked = rowsAfter.filter(n => String(n.content ?? '').includes(marker));
    expect(leaked.length, '被拒催办不得落任何带本例 marker 的通知').toBe(0);
  });
});
