// 504 催收任务改派：双状态门 + 事务落库回读 + 终态零写入拒绝。
// 后端判据：handlers/collection_task_handler.rs:216-233 先用 auth 数据范围调 get_task
//   (:604-622 归属门) 再调 service.reassign；请求 DTO models/collection_task_dto.rs:44-47
//   assigned_to:number / remark:string|null；回参 TaskInfo handler:36-57 的
//   status/assigned_to/assigned_at/remark/updated_at 均来自实体列（models/collection_task.rs:14-39）。
//   :105-112 InvalidState → AppError::business → 400 / BUSINESS_ERROR 且 message 脱敏，
//   故负例只断言状态码和机器码，不断言真实原因文案。
// 服务判据：services/collection_task_service.rs:537-567 begin → find_by_id → 白名单
//   ["pending","in_progress"] 精确小写（:549）→ 写 assigned_to/assigned_at/remark/updated_at
//   → commit；终态 InvalidState 在写之前返回（:550-553），故原行零写入。
// 状态写入方同文件 :62-79 pending/in_progress/completed/cancelled；建单 :467 pending，
//   record_contact :489-535 以 mark_completed 决定 in_progress/completed，cancel :569-602 cancelled。
// 造数隔离：customer_name 与任务 remark 均带 genCode 唯一标记，所有回读按自建 task id，
//   不断言全局列表总数。customer_id NOT NULL 且 FK RESTRICT（migration/v15/mod.rs:121），
//   collection_tasks 仅有取消端点而无删除端点，终态任务无法清理，故不伪造 DELETE，
//   仅以唯一标记保留；可取消的活动任务走 tryCleanup。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

const TASKS = '/collection-tasks';

interface Task {
  id?: number;
  status?: string;
  assigned_to?: number;
  assigned_at?: string;
  assigned_by?: number | null;
  updated_at?: string;
  remark?: string | null;
  contact_result?: string | null;
}

function int(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[504] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function text(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && (value as string).length > 0,
    `[504] ${label} 须非空字符串`
  ).toBe(true);
  return value as string;
}

async function selfUserId(page: Page): Promise<number> {
  const me = await apiCallRaw<Record<string, unknown>>(page, 'GET', '/auth/me');
  return int(me?.id, '当前登录用户 id');
}

/** FK 要求 assigned_to 是真实用户（DDL :130），从用户列表取另一个 id，取不到当场红。 */
async function otherUserId(page: Page, self: number): Promise<number> {
  const list = await apiCallRaw<{ users?: Record<string, unknown>[] }>(
    page,
    'GET',
    '/users?page=1&page_size=100'
  );
  expect(
    Array.isArray(list?.users),
    `[504] 用户列表须出 users 数组，实际=${JSON.stringify(list)}`
  ).toBe(true);
  const users = list.users as Record<string, unknown>[];
  const other = users.find(u => Number(u.id) !== self);
  expect(
    other !== undefined,
    `[504] 须存在与当前用户 ${self} 不同的真实用户以承接改派，实际 ids=${JSON.stringify(users.map(u => u.id))}`
  ).toBe(true);
  return int(other?.id, '承接改派的用户 id');
}

async function seedCustomer(page: Page): Promise<number> {
  const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: genCode('E504C'),
  });
  return int(created?.id, '建客户返回 id');
}

/** 手动建单最小必填字段：customer_id/overdue_amount/overdue_days/task_type/due_date/assigned_to。 */
async function createTask(
  page: Page,
  customer: number,
  assignee: number,
  marker: string
): Promise<Task> {
  const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const created = await apiCallRaw<Task>(page, 'POST', TASKS, {
    customer_id: customer,
    overdue_amount: '1500.00',
    overdue_days: 100,
    task_type: 'phone',
    due_date: due,
    assigned_to: assignee,
    remark: marker,
  });
  int(created?.id, '建催收任务返回 id');
  expect(created?.status, `[504] 建单初始状态须 pending，实际=${created?.status}`).toBe('pending');
  return created;
}

async function readTask(page: Page, id: number): Promise<Task> {
  const found = await apiCallRaw<Task>(page, 'GET', `${TASKS}/${id}`);
  int(found?.id, `GET ${TASKS}/${id} 回读 id`);
  expect(found.id, `[504] 回读 id 须与建单 id 一致`).toBe(id);
  return found;
}

async function reassign(page: Page, id: number, assignee: number, remark: string): Promise<Task> {
  return apiCallRaw<Task>(page, 'POST', `${TASKS}/${id}/reassign`, {
    assigned_to: assignee,
    remark,
  });
}

/** 终态拒绝：InvalidState 走 AppError::business，出参 message 已脱敏，只验 400 + 机器码。 */
async function expectRejected(
  page: Page,
  id: number,
  assignee: number,
  marker: string,
  state: string
): Promise<void> {
  const failure = await apiCallExpectFail(page, 'POST', `${TASKS}/${id}/reassign`, {
    assigned_to: assignee,
    remark: `${marker}-FORBIDDEN`,
  });
  expect(failure.status, `[504] ${state} 改派须 400，实际=${failure.status}`).toBe(400);
  const code = failureCode(failure);
  expect(
    code,
    `[504] ${state} 改派机器码须 BUSINESS_ERROR，实际=${code} body=${JSON.stringify(failure)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
}

/** 零写入断言：状态、受理人、受理时间、备注、更新时间逐列不变，整行亦不漂移。 */
async function expectUntouched(page: Page, id: number, before: Task, state: string): Promise<void> {
  const after = await readTask(page, id);
  expect(after.status, `[504] ${state} 拒绝后状态不变`).toBe(before.status);
  expect(after.assigned_to, `[504] ${state} 拒绝后受理人不变`).toBe(before.assigned_to);
  expect(after.assigned_at, `[504] ${state} 拒绝后受理时间不变`).toBe(before.assigned_at);
  expect(after.remark, `[504] ${state} 拒绝后备注不变`).toBe(before.remark);
  expect(after.updated_at, `[504] ${state} 拒绝后更新时间不变`).toBe(before.updated_at);
  expect(after, `[504] ${state} 拒绝后整行零写入`).toEqual(before);
}

test.describe('504 催收任务改派门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('504-01 pending 与 in_progress 均可改派，四列落库并回读一致', async ({ page }) => {
    const marker = genCode('E504A');
    const self = await selfUserId(page);
    const other = await otherUserId(page, self);
    const customer = await seedCustomer(page);

    let pending: Task | undefined;
    let running: Task | undefined;
    try {
      // pending 腿：建单自带 pending 与初始 remark，改派只改 assigned_to/assigned_at/remark/updated_at。
      pending = await createTask(page, customer, self, `${marker}-PENDING`);
      const pid = int(pending.id, 'pending 任务 id');
      const beforePending = await readTask(page, pid);
      expect(beforePending.assigned_to, `[504] 建单受理人须为当前用户`).toBe(self);
      expect(beforePending.remark, `[504] 建单备注须为唯一标记`).toBe(`${marker}-PENDING`);

      const changedPending = await reassign(page, pid, other, `${marker}-P-REASSIGNED`);
      expect(changedPending.id, `[504] pending 改派回参 id 不变`).toBe(pid);
      expect(changedPending.status, `[504] pending 改派后状态仍为 pending`).toBe('pending');
      expect(changedPending.assigned_to, `[504] pending 改派后受理人`).toBe(other);
      expect(
        text(changedPending.assigned_at, 'pending 改派回参 assigned_at'),
        `[504] pending 改派须刷新受理时间（原值=${beforePending.assigned_at}）`
      ).not.toBe(text(beforePending.assigned_at, 'pending 改派前 assigned_at'));
      expect(changedPending.remark, `[504] pending 改派回参 remark 精确落库`).toBe(
        `${marker}-P-REASSIGNED`
      );
      expect(
        text(changedPending.updated_at, 'pending 改派回参 updated_at'),
        `[504] pending 改派须刷新更新时间（原值=${beforePending.updated_at}）`
      ).not.toBe(text(beforePending.updated_at, 'pending 改派前 updated_at'));

      const readPending = await readTask(page, pid);
      expect(readPending.status, `[504] pending 改派回读状态`).toBe('pending');
      expect(readPending.assigned_to, `[504] pending 改派回读受理人`).toBe(other);
      expect(readPending.assigned_at, `[504] pending 改派回读受理时间`).toBe(
        changedPending.assigned_at
      );
      expect(readPending.remark, `[504] pending 改派回读备注`).toBe(`${marker}-P-REASSIGNED`);
      expect(readPending.updated_at, `[504] pending 改派回读更新时间`).toBe(
        changedPending.updated_at
      );

      // in_progress 腿：record_contact 未 mark_completed 时按源码写 in_progress。
      running = await createTask(page, customer, self, `${marker}-PROGRESS`);
      const rid = int(running.id, 'in_progress 任务 id');
      const contacted = await apiCallRaw<Task>(page, 'POST', `${TASKS}/${rid}/contact`, {
        contact_result: `${marker}-CONTACT`,
        mark_completed: false,
      });
      expect(
        contacted.status,
        `[504] contact 未标记完成须写 in_progress，实际=${contacted.status}`
      ).toBe('in_progress');
      const beforeRunning = await readTask(page, rid);
      expect(beforeRunning.status, `[504] 改派前回读状态`).toBe('in_progress');

      const changedRunning = await reassign(page, rid, other, `${marker}-I-REASSIGNED`);
      expect(changedRunning.id, `[504] in_progress 改派回参 id 不变`).toBe(rid);
      expect(changedRunning.status, `[504] in_progress 改派后状态仍为 in_progress`).toBe(
        'in_progress'
      );
      expect(changedRunning.assigned_to, `[504] in_progress 改派后受理人`).toBe(other);
      expect(
        text(changedRunning.assigned_at, 'in_progress 改派回参 assigned_at'),
        `[504] in_progress 改派须刷新受理时间（原值=${beforeRunning.assigned_at}）`
      ).not.toBe(text(beforeRunning.assigned_at, 'in_progress 改派前 assigned_at'));
      expect(changedRunning.remark, `[504] in_progress 改派回参 remark 精确落库`).toBe(
        `${marker}-I-REASSIGNED`
      );

      const readRunning = await readTask(page, rid);
      expect(readRunning.status, `[504] in_progress 改派回读状态`).toBe('in_progress');
      expect(readRunning.assigned_to, `[504] in_progress 改派回读受理人`).toBe(other);
      expect(readRunning.assigned_at, `[504] in_progress 改派回读受理时间`).toBe(
        changedRunning.assigned_at
      );
      expect(readRunning.remark, `[504] in_progress 改派回读备注`).toBe(`${marker}-I-REASSIGNED`);
      expect(readRunning.updated_at, `[504] in_progress 改派回读更新时间`).toBe(
        changedRunning.updated_at
      );
    } finally {
      // 两态任务仍可取消；customer_id 为 FK RESTRICT，客户与任务行只能靠唯一标记辨认。
      if (pending?.id !== undefined) {
        await tryCleanup(page, 'POST', `${TASKS}/${pending.id}/cancel`, '504 pending 任务');
      }
      if (running?.id !== undefined) {
        await tryCleanup(page, 'POST', `${TASKS}/${running.id}/cancel`, '504 in_progress 任务');
      }
    }
  });

  test('504-02 completed 与 cancelled 终态拒绝改派且整行零写入', async ({ page }) => {
    const marker = genCode('E504B');
    const self = await selfUserId(page);
    const other = await otherUserId(page, self);
    const customer = await seedCustomer(page);

    // completed：record_contact 带 mark_completed=true 是源码唯一合法推进路径。
    const doneTask = await createTask(page, customer, self, `${marker}-DONE`);
    const doneId = int(doneTask.id, 'completed 任务 id');
    const completed = await apiCallRaw<Task>(page, 'POST', `${TASKS}/${doneId}/contact`, {
      contact_result: `${marker}-DONE-CONTACT`,
      mark_completed: true,
    });
    expect(completed.status, `[504] mark_completed 须写 completed，实际=${completed.status}`).toBe(
      'completed'
    );
    const beforeDone = await readTask(page, doneId);
    expect(beforeDone.status, `[504] completed 前置回读`).toBe('completed');
    expect(beforeDone.assigned_to, `[504] completed 前置受理人`).toBe(self);
    await expectRejected(page, doneId, other, `${marker}-DONE`, 'completed');
    await expectUntouched(page, doneId, beforeDone, 'completed');

    // cancelled：cancel 是源码唯一合法推进路径；终态任务无取消/删除端点可清理。
    const cancelledTask = await createTask(page, customer, self, `${marker}-CANCEL`);
    const cancelId = int(cancelledTask.id, 'cancelled 任务 id');
    const cancelled = await apiCallRaw<Task>(page, 'POST', `${TASKS}/${cancelId}/cancel`, {
      cancel_reason: `${marker}-CANCEL-REASON`,
    });
    expect(cancelled.status, `[504] cancel 须写 cancelled，实际=${cancelled.status}`).toBe(
      'cancelled'
    );
    const beforeCancelled = await readTask(page, cancelId);
    expect(beforeCancelled.status, `[504] cancelled 前置回读`).toBe('cancelled');
    expect(beforeCancelled.assigned_to, `[504] cancelled 前置受理人`).toBe(self);
    await expectRejected(page, cancelId, other, `${marker}-CANCEL`, 'cancelled');
    await expectUntouched(page, cancelId, beforeCancelled, 'cancelled');
  });
});
