// BPM 审批超时自动转交端到端 E2E — 585
//
// 真实链路：创建带 timeout 的会签流程定义 → 发起实例 → 等待统一 Scheduler
// 扫描同节点全部到期任务并转交 → 代理人分别继承原签署席位 → 所有席位签署后实例完成。
// 禁止 mock、网络拦截和假响应；所有账号、角色、流程与任务均落真实 PostgreSQL。
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
  for (const cleanup of CLEANUP.reverse()) {
    await tryCleanup(page, cleanup.method, cleanup.path, cleanup.label);
  }
  CLEANUP.length = 0;
});

interface BpmTask {
  id: number;
  node_id: string;
  status: string;
  actual_handler_id?: number | null;
  actual_handler_name?: string | null;
  due_date?: string | null;
  assignee_ids?: number[] | null;
  task_variables?: {
    delegated_from_user_id?: number;
    signatures?: Array<{ user_id: number; action: string }>;
    timeout?: { after_seconds: number; transfer_count: number };
  } | null;
}

interface InstanceDetail {
  instance: { id: number; status: string };
  tasks: BpmTask[];
}

async function fetchDetail(
  page: import('@playwright/test').Page,
  instanceId: number
): Promise<InstanceDetail> {
  const detail = await apiCallRaw<InstanceDetail>(
    page,
    'GET',
    `/bpm/instances/${instanceId}/detail`
  );
  if (!Array.isArray(detail?.tasks) || !detail.instance) {
    throw new Error(`实例详情契约漂移：${JSON.stringify(detail).slice(0, 300)}`);
  }
  return detail;
}

async function createApprover(
  page: import('@playwright/test').Page,
  browser: import('@playwright/test').Browser,
  label: string
): Promise<{ userId: number; session: IsolatedAuthedSession }> {
  const suffix = `${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const roleCode = `e2e_timeout_${label}_${suffix}`;
  const role = await apiCall<{ id?: number }>(page, 'POST', '/roles', {
    name: `E2E 超时转交角色 ${label} ${suffix}`,
    code: roleCode,
    description: '585 审批超时转交专用角色',
  });
  if (!role.data?.id) {
    throw new Error(`创建角色失败：${JSON.stringify(role)}`);
  }
  const roleId = role.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/roles/${roleId}`, label: 'bpm_timeout_role' });

  const grant = await apiCall(page, 'PUT', `/roles/${roleId}/permissions`, [
    { resource_type: 'bpm-tasks', action: 'read', allowed: true },
    { resource_type: 'bpm-tasks', action: 'approve', allowed: true },
  ]);
  if (!grant.data) {
    throw new Error(`授权审批角色失败：${JSON.stringify(grant)}`);
  }

  const username = `e2e_timeout_${label}_${suffix}`;
  const user = await apiCall<{ id?: number }>(page, 'POST', '/users', {
    username,
    password: testPassword(),
    email: `${username}@test.com`,
    role_id: roleId,
  });
  if (!user.data?.id) {
    throw new Error(`创建审批用户失败：${JSON.stringify(user)}`);
  }
  const userId = user.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/users/${userId}`, label: 'bpm_timeout_user' });

  const session = await loginInIsolatedContext(browser, username, testPassword());
  return { userId, session };
}

async function approveAs(
  page: import('@playwright/test').Page,
  taskId: number,
  userId: number,
  opinion: string
): Promise<void> {
  await apiCall(page, 'POST', '/bpm/tasks/approve', {
    task_id: taskId,
    handler_id: userId,
    handler_name: `e2e_user_${userId}`,
    action: 'approve',
    approval_opinion: opinion,
  });
}

test('585-01 超时会签同节点任务全部转交并由代理人继承各原席位完成审批', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
  if (!me.data?.id) {
    throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
  }
  const initiatorId = me.data.id;
  const second = await createApprover(page, browser, 'second');
  const fallback = await createApprover(page, browser, 'fallback');

  try {
    const processKey = genCode('e2e-timeout');
    const definition = await apiCall<{ id?: number }>(page, 'POST', '/bpm/definitions', {
      name: `E2E 审批超时转交 ${processKey}`,
      code: processKey,
      description: '585 会签超时自动转交',
      category: 'e2e_test',
      version: '1.0',
      status: 'ACTIVE',
      config: {
        node_modes: { sign: 'countersign' },
        nodes: [
          { id: 'start', name: '开始', type: 'start_event' },
          {
            id: 'sign',
            name: '会签审批',
            type: 'user_task',
            assignee_ids: [initiatorId, second.userId],
            timeout: {
              after_seconds: 1,
              transfer_to_user_id: fallback.userId,
            },
          },
          { id: 'end', name: '完成', type: 'end_event' },
        ],
        edges: [
          { source: 'start', target: 'sign' },
          { source: 'sign', target: 'end' },
        ],
      },
    });
    if (!definition.data?.id) {
      throw new Error(`创建超时流程定义失败：${JSON.stringify(definition)}`);
    }
    CLEANUP.push({
      method: 'DELETE',
      path: `/bpm/definitions/${definition.data.id}`,
      label: 'bpm_timeout_definition',
    });

    const started = await apiCall<{ instance_id?: number; task_ids?: number[] }>(
      page,
      'POST',
      '/bpm/process/start',
      {
        process_key: processKey,
        business_type: 'e2e_test',
        business_id: definition.data.id,
        title: `E2E 超时会签 ${processKey}`,
        initiator_id: initiatorId,
        initiator_name: `e2e_user_${initiatorId}`,
      }
    );
    if (!started.data?.instance_id || started.data.task_ids?.length !== 2) {
      throw new Error(`发起会签实例失败：${JSON.stringify(started)}`);
    }
    const instanceId = started.data.instance_id;

    const initial = await fetchDetail(page, instanceId);
    const originalTask = initial.tasks.find(task => task.actual_handler_id === initiatorId);
    if (!originalTask) {
      throw new Error(`无法定位发起人的会签任务：${JSON.stringify(initial.tasks)}`);
    }
    const originalTaskId = originalTask.id;
    const secondTask = initial.tasks.find(
      task => task.id !== originalTaskId && task.actual_handler_id === second.userId
    );
    if (!originalTask || !secondTask) {
      throw new Error(`会签初始任务分工不正确：${JSON.stringify(initial.tasks)}`);
    }
    expect(originalTask.assignee_ids).toEqual([initiatorId, second.userId]);
    expect(originalTask.task_variables?.timeout?.after_seconds).toBe(1);
    expect(originalTask.due_date).toBeTruthy();

    await expect
      .poll(
        async () => {
          const detail = await fetchDetail(page, instanceId);
          return detail.tasks.map(task => task.actual_handler_id);
        },
        {
          timeout: 120_000,
          intervals: [1000, 2000, 5000],
          message: '统一调度器应在两轮内转交同节点的全部到期待办',
        }
      )
      .toEqual([fallback.userId, fallback.userId]);

    const transferred = await fetchDetail(page, instanceId);
    const transferredTask = transferred.tasks.find(task => task.id === originalTaskId);
    if (!transferredTask) {
      throw new Error('转交后原任务必须仍存在');
    }
    expect(transferredTask.status).toBe('pending');
    expect(transferredTask.due_date).toBeNull();
    expect(transferredTask.task_variables?.timeout?.transfer_count).toBe(1);
    expect(transferredTask.task_variables?.delegated_from_user_id).toBe(initiatorId);
    expect(transferredTask.assignee_ids).toEqual([initiatorId, second.userId]);
    const transferredSecondTask = transferred.tasks.find(task => task.id === secondTask.id);
    expect(transferredSecondTask?.actual_handler_id).toBe(fallback.userId);
    expect(transferredSecondTask?.due_date).toBeNull();
    expect(transferredSecondTask?.task_variables?.delegated_from_user_id).toBe(second.userId);

    await fallback.session.page.goto('/bpm');
    await expect(
      fallback.session.page.getByText('审批管理', { exact: true }).first()
    ).toBeVisible();

    await approveAs(
      fallback.session.page,
      originalTaskId,
      fallback.userId,
      '代理人继承原签署席位同意'
    );
    let detail = await fetchDetail(page, instanceId);
    expect(detail.instance.status).toBe('PROCESSING');
    expect(
      detail.tasks.find(task => task.id === originalTaskId)?.task_variables?.signatures
    ).toContainEqual(expect.objectContaining({ user_id: fallback.userId, action: 'approve' }));

    await approveAs(
      fallback.session.page,
      secondTask.id,
      fallback.userId,
      '代理人继承第二签署席位同意'
    );
    detail = await fetchDetail(page, instanceId);
    expect(detail.instance.status).toBe('COMPLETED');
    expect(detail.tasks.map(task => task.status).sort()).toEqual(['completed', 'completed']);
    expect(
      detail.tasks.find(task => task.id === secondTask.id)?.task_variables?.signatures
    ).toContainEqual(expect.objectContaining({ user_id: fallback.userId, action: 'approve' }));
  } finally {
    await fallback.session.close();
    await second.session.close();
  }
});
