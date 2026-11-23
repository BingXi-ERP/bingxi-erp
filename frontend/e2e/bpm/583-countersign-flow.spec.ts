// BPM 会签（countersign）端到端 E2E — 583
//
// 背景：会签由流程定义 config 顶层 node_modes[node_id]="countersign" 驱动，节点
//   assignee_ids 数组声明全部处理人，每位处理人各一枚同 instance+node_id 的 pending
//   任务；全部 approve 才推进，任一 reject 立即终止实例（TERMINATED）并级联 cancelled
//   其余 pending 任务。唯一事实来源：backend/src/services/bpm_ops/sign_mode.rs 与
//   backend/src/services/bpm_ops/task.rs（approve 主流程）。
// 状态词表：bpm_task 小写 pending/completed/rejected/cancelled；bpm_instance 大写
//   PROCESSING/COMPLETED/TERMINATED/CANCELLED（backend/src/models/status/bpm_crm_contract.rs）。
// 第二审批人：本例自建角色（bpm-tasks:approve）+ 用户，经 loginInIsolatedContext 真实登录
//   后投出第二票；不复用列表里权限不明的既有账号，不伪造用户 id。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  genCode,
  tryCleanup,
  testPassword,
  loginInIsolatedContext,
  type IsolatedAuthedSession,
} from '../flow/helpers';

const CLEANUP: Array<{ method: 'DELETE' | 'POST'; path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, c.method, c.path, c.label);
  }
  CLEANUP.length = 0;
});

interface BpmTaskLite {
  id: number;
  status: string;
}

interface InstanceDetailLite {
  instance: { id: number; status: string };
  tasks: BpmTaskLite[];
}

async function fetchInstanceDetail(
  page: import('@playwright/test').Page,
  instanceId: number
): Promise<InstanceDetailLite> {
  const detail = await apiCallRaw<InstanceDetailLite>(
    page,
    'GET',
    `/bpm/instances/${instanceId}/detail`
  );
  if (!Array.isArray(detail?.tasks)) {
    throw new Error(
      `GET /bpm/instances/${instanceId}/detail 未返回 tasks 数组（契约漂移？）：${JSON.stringify(detail).slice(0, 300)}`
    );
  }
  return detail;
}

async function fetchInstanceStatus(
  page: import('@playwright/test').Page,
  instanceId: number
): Promise<string> {
  const detail = await fetchInstanceDetail(page, instanceId);
  return detail.instance.status;
}

/** 取指定用户在实例内的唯一 pending 任务 id；找不到或多于一枚即判红，不静默降级 */
async function pendingTaskIdOf(
  page: import('@playwright/test').Page,
  userId: number,
  instanceTaskIds: number[]
): Promise<number> {
  const list = await apiCallRaw<{ items: Array<{ id: number; status: string }> }>(
    page,
    'GET',
    `/bpm/tasks?user_id=${userId}&status=pending&page=1&page_size=100`
  );
  if (!Array.isArray(list?.items)) {
    throw new Error(
      `GET /bpm/tasks 未返回 items 数组（PaginatedResponse 契约漂移？）：${JSON.stringify(list).slice(0, 300)}`
    );
  }
  const pendingIds = new Set(list.items.map(t => Number(t.id)));
  const matched = instanceTaskIds.filter(id => pendingIds.has(id));
  if (matched.length !== 1) {
    throw new Error(
      `用户 ${userId} 在实例任务 ${JSON.stringify(instanceTaskIds)} 中应恰好有一枚 pending 任务，实际：${JSON.stringify(matched)}`
    );
  }
  return matched[0];
}

async function approveAs(
  page: import('@playwright/test').Page,
  taskId: number,
  handlerId: number,
  action: 'approve' | 'reject',
  opinion: string
): Promise<void> {
  await apiCall(page, 'POST', '/bpm/tasks/approve', {
    task_id: taskId,
    handler_id: handlerId,
    handler_name: `e2e_user_${handlerId}`,
    action,
    approval_opinion: opinion,
  });
}

/** 建会签流程定义并发起实例；节点 assignee_ids 声明全部处理人，返回首节点全部任务 id */
async function seedCountersignInstance(
  page: import('@playwright/test').Page,
  meId: number,
  assigneeIds: number[]
): Promise<{ defId: number; instanceId: number; taskIds: number[] }> {
  const processKey = genCode('e2e-cs');
  const defResp = await apiCall<{ id?: number }>(page, 'POST', '/bpm/definitions', {
    name: `E2E 会签流程 ${processKey}`,
    code: processKey,
    description: '583 会签：全部通过才推进，任一驳回即终止',
    category: 'e2e_test',
    version: '1.0',
    config: {
      node_modes: { sign: 'countersign' },
      nodes: [
        { id: 'start', name: '开始', type: 'start_event' },
        { id: 'sign', name: '会签节点', type: 'user_task', assignee_ids: assigneeIds },
        { id: 'end', name: '完成', type: 'end_event' },
      ],
      edges: [
        { source: 'start', target: 'sign' },
        { source: 'sign', target: 'end' },
      ],
    },
    status: 'ACTIVE',
  });
  if (!defResp.data?.id) {
    throw new Error(`建会签流程定义失败：${JSON.stringify(defResp)}`);
  }
  const defId = defResp.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/bpm/definitions/${defId}`, label: 'bpm_definition' });

  const startResp = await apiCall<{ instance_id?: number; task_ids?: number[] }>(
    page,
    'POST',
    '/bpm/process/start',
    {
      process_key: processKey,
      business_type: 'e2e_test',
      business_id: defId,
      title: `E2E 会签实例 ${processKey}`,
      initiator_id: meId,
      initiator_name: `e2e_user_${meId}`,
    }
  );
  if (!startResp.data?.instance_id || !Array.isArray(startResp.data.task_ids)) {
    throw new Error(`发起会签实例失败：${JSON.stringify(startResp)}`);
  }
  return {
    defId,
    instanceId: startResp.data.instance_id,
    taskIds: startResp.data.task_ids.map(id => Number(id)),
  };
}

/** 自建会签第二审批人：专属角色（bpm-tasks:approve）+ 用户 + 独立会话真实登录 */
async function ensureSecondApprover(
  page: import('@playwright/test').Page,
  browser: import('@playwright/test').Browser
): Promise<{ userId: number; session: IsolatedAuthedSession }> {
  const roleCode = genCode('e2e-cs-role');
  const roleResp = await apiCall<{ id?: number }>(page, 'POST', '/roles', {
    name: `E2E 会签审批角色 ${roleCode}`,
    code: roleCode,
    description: '583 会签第二审批人专用角色',
  });
  if (!roleResp.data?.id) {
    throw new Error(`建第二审批人角色失败：${JSON.stringify(roleResp)}`);
  }
  const roleId = roleResp.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/roles/${roleId}`, label: 'bpm_second_role' });

  const grantResp = await apiCall(page, 'PUT', `/roles/${roleId}/permissions`, [
    { resource_type: 'bpm-tasks', action: 'approve', allowed: true },
  ]);
  if (!grantResp.data) {
    throw new Error(`授权 bpm-tasks:approve 失败：${JSON.stringify(grantResp)}`);
  }

  const username = genCode('e2e-cs-u');
  const userResp = await apiCall<{ id?: number }>(page, 'POST', '/users', {
    username,
    password: testPassword(),
    email: `e2e_${username}@test.com`,
    role_id: roleId,
  });
  if (!userResp.data?.id) {
    throw new Error(`建第二审批人用户失败：${JSON.stringify(userResp)}`);
  }
  const userId = userResp.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/users/${userId}`, label: 'bpm_second_user' });

  const session = await loginInIsolatedContext(browser, username, testPassword());
  return { userId, session };
}

test.describe('583 BPM 会签（countersign）', () => {
  test(
    '583-01 会签：双人全部通过才推进，单人通过后实例仍 PROCESSING',
    { tag: ['@bpm', '@countersign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);
      const seeded = await seedCountersignInstance(page, myId, [myId, second.userId]);
      expect(
        seeded.taskIds.length,
        `会签首节点应为每位处理人各建一枚任务（处理人 ${JSON.stringify([myId, second.userId])}），实际：${JSON.stringify(seeded.taskIds)}`
      ).toBe(2);

      const myTaskId = await pendingTaskIdOf(page, myId, seeded.taskIds);
      const otherTaskId = await pendingTaskIdOf(page, second.userId, seeded.taskIds);

      await approveAs(page, myTaskId, myId, 'approve', '583 会签第一票通过');

      let status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '会签单人通过后实例不得推进，应保持 PROCESSING').toBe('PROCESSING');

      let detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(
        detail.tasks.find(t => t.id === myTaskId)?.status,
        '第一票通过后本人任务应为 completed'
      ).toBe('completed');
      expect(
        detail.tasks.find(t => t.id === otherTaskId)?.status,
        '第二审批人任务应仍为 pending（会签等待全员）'
      ).toBe('pending');

      await approveAs(
        second.session.page,
        otherTaskId,
        second.userId,
        'approve',
        '583 会签第二票通过'
      );

      status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '会签全员通过后实例应推进为 COMPLETED').toBe('COMPLETED');
      detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(detail.tasks.map(t => t.status).sort(), '两枚会签任务均应为 completed').toEqual([
        'completed',
        'completed',
      ]);

      await second.session.close();
    }
  );

  test(
    '583-02 会签：任一驳回立即终止实例，其余 pending 任务级联 cancelled',
    { tag: ['@bpm', '@countersign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);
      const seeded = await seedCountersignInstance(page, myId, [myId, second.userId]);
      expect(seeded.taskIds.length).toBe(2);

      const myTaskId = await pendingTaskIdOf(page, myId, seeded.taskIds);
      const otherTaskId = await pendingTaskIdOf(page, second.userId, seeded.taskIds);

      await approveAs(second.session.page, otherTaskId, second.userId, 'reject', '583 会签驳回');

      const status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '会签任一驳回后实例应立即 TERMINATED').toBe('TERMINATED');
      const detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(detail.tasks.find(t => t.id === otherTaskId)?.status, '驳回人任务应为 rejected').toBe(
        'rejected'
      );
      expect(
        detail.tasks.find(t => t.id === myTaskId)?.status,
        '其余 pending 会签任务应级联 cancelled'
      ).toBe('cancelled');

      await second.session.close();
    }
  );
});
