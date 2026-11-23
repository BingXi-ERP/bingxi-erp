// BPM 或签（orsign）+ 加签（add-sign）端到端 E2E — 584
//
// 背景：或签由流程定义 config 顶层 node_modes[node_id]="orsign" 驱动：任一处理人 approve
//   即推进（其余同节点 pending 任务级联 cancelled）；单人 reject 只落本人任务，同节点全部
//   rejected 才终止实例。加签端点 POST /bpm/tasks/add-sign 仅对 pending 且会签/或签节点的
//   任务开放（单人节点与已结束任务被拒），为新增处理人创建同节点 pending 任务。
//   唯一事实来源：backend/src/services/bpm_ops/sign_mode.rs、bpm_ops/task.rs（approve/add_sign_task）。
// 状态词表：bpm_task 小写 pending/completed/rejected/cancelled；bpm_instance 大写
//   PROCESSING/COMPLETED/TERMINATED/CANCELLED（backend/src/models/status/bpm_crm_contract.rs）。
// 第二审批人：本例自建角色（bpm-tasks:approve）+ 用户，经 loginInIsolatedContext 真实登录；
//   不复用列表里权限不明的既有账号，不伪造用户 id。
// 加签门文案逐字符照抄后端源码原文（后端文案非 i18n key），锚点见行尾注释 ——
const MSG_ADDSIGN_SINGLE = '单人审批工单不支持加签，请先将节点配置为会签或或签'; // bpm_ops/task.rs add_sign_task
const MSG_ADDSIGN_NOT_PENDING = '只有待处理工单可以加签，已完成或已拒绝的工单不可加签'; // bpm_ops/task.rs add_sign_task
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
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

/** 建多人签署流程定义（countersign/orsign）并发起实例；返回首节点全部任务 id */
async function seedMultiSignInstance(
  page: import('@playwright/test').Page,
  meId: number,
  mode: 'countersign' | 'orsign',
  assigneeIds: number[]
): Promise<{ defId: number; instanceId: number; taskIds: number[] }> {
  const processKey = genCode('e2e-ms');
  const defResp = await apiCall<{ id?: number }>(page, 'POST', '/bpm/definitions', {
    name: `E2E ${mode} 流程 ${processKey}`,
    code: processKey,
    description: `584 ${mode}：配置驱动的签署分支`,
    category: 'e2e_test',
    version: '1.0',
    config: {
      node_modes: { sign: mode },
      nodes: [
        { id: 'start', name: '开始', type: 'start_event' },
        { id: 'sign', name: '签署节点', type: 'user_task', assignee_ids: assigneeIds },
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
    throw new Error(`建 ${mode} 流程定义失败：${JSON.stringify(defResp)}`);
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
      title: `E2E ${mode} 实例 ${processKey}`,
      initiator_id: meId,
      initiator_name: `e2e_user_${meId}`,
    }
  );
  if (!startResp.data?.instance_id || !Array.isArray(startResp.data.task_ids)) {
    throw new Error(`发起 ${mode} 实例失败：${JSON.stringify(startResp)}`);
  }
  return {
    defId,
    instanceId: startResp.data.instance_id,
    taskIds: startResp.data.task_ids.map(id => Number(id)),
  };
}

/** 建单人（single 缺省）流程定义并发起实例，返回首节点唯一任务 id（用于加签负例） */
async function seedSingleInstance(
  page: import('@playwright/test').Page,
  meId: number
): Promise<{ defId: number; instanceId: number; taskId: number }> {
  const processKey = genCode('e2e-single');
  const defResp = await apiCall<{ id?: number }>(page, 'POST', '/bpm/definitions', {
    name: `E2E 单人审批流程 ${processKey}`,
    code: processKey,
    description: '584 加签负例：单人节点不支持加签',
    category: 'e2e_test',
    version: '1.0',
    config: {
      nodes: [
        { id: 'start', name: '开始', type: 'start_event' },
        { id: 'sign', name: '审批节点', type: 'user_task', assignee_value: String(meId) },
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
    throw new Error(`建单人流程定义失败：${JSON.stringify(defResp)}`);
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
      title: `E2E 单人审批实例 ${processKey}`,
      initiator_id: meId,
      initiator_name: `e2e_user_${meId}`,
    }
  );
  if (!startResp.data?.instance_id || startResp.data.task_ids?.length !== 1) {
    throw new Error(`发起单人审批实例失败：${JSON.stringify(startResp)}`);
  }
  return {
    defId,
    instanceId: startResp.data.instance_id,
    taskId: Number(startResp.data.task_ids[0]),
  };
}

/** 自建签署第二处理人：专属角色（bpm-tasks:approve）+ 用户 + 独立会话真实登录 */
async function ensureSecondApprover(
  page: import('@playwright/test').Page,
  browser: import('@playwright/test').Browser
): Promise<{ userId: number; session: IsolatedAuthedSession }> {
  const roleCode = genCode('e2e-ms-role');
  const roleResp = await apiCall<{ id?: number }>(page, 'POST', '/roles', {
    name: `E2E 签署审批角色 ${roleCode}`,
    code: roleCode,
    description: '584 第二处理人专用角色',
  });
  if (!roleResp.data?.id) {
    throw new Error(`建第二处理人角色失败：${JSON.stringify(roleResp)}`);
  }
  const roleId = roleResp.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/roles/${roleId}`, label: 'bpm_second_role' });

  const grantResp = await apiCall(page, 'PUT', `/roles/${roleId}/permissions`, [
    { resource_type: 'bpm-tasks', action: 'approve', allowed: true },
  ]);
  if (!grantResp.data) {
    throw new Error(`授权 bpm-tasks:approve 失败：${JSON.stringify(grantResp)}`);
  }

  const username = genCode('e2e-ms-u');
  const userResp = await apiCall<{ id?: number }>(page, 'POST', '/users', {
    username,
    password: testPassword(),
    email: `e2e_${username}@test.com`,
    role_id: roleId,
  });
  if (!userResp.data?.id) {
    throw new Error(`建第二处理人用户失败：${JSON.stringify(userResp)}`);
  }
  const userId = userResp.data.id;
  CLEANUP.push({ method: 'DELETE', path: `/users/${userId}`, label: 'bpm_second_user' });

  const session = await loginInIsolatedContext(browser, username, testPassword());
  return { userId, session };
}

test.describe('584 BPM 或签（orsign）+ 加签（add-sign）', () => {
  test(
    '584-01 或签：任一通过即推进，其余同节点 pending 任务级联 cancelled',
    { tag: ['@bpm', '@orsign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);
      const seeded = await seedMultiSignInstance(page, myId, 'orsign', [myId, second.userId]);
      expect(
        seeded.taskIds.length,
        `或签首节点应为每位处理人各建一枚任务，实际：${JSON.stringify(seeded.taskIds)}`
      ).toBe(2);

      const myTaskId = await pendingTaskIdOf(page, myId, seeded.taskIds);

      await approveAs(page, myTaskId, myId, 'approve', '584 或签第一票通过');

      const status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '或签任一通过后实例应推进为 COMPLETED').toBe('COMPLETED');
      const detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(detail.tasks.find(t => t.id === myTaskId)?.status, '通过人任务应为 completed').toBe(
        'completed'
      );
      const others = detail.tasks.filter(t => t.id !== myTaskId);
      expect(
        others.map(t => t.status),
        '其余同节点 pending 任务应被或签跳过收尾置 completed（留痕 orsign_skipped）'
      ).toEqual(['completed']);

      await second.session.close();
    }
  );

  test(
    '584-02 或签：单人 reject 实例继续，全员 reject 才终止',
    { tag: ['@bpm', '@orsign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);
      const seeded = await seedMultiSignInstance(page, myId, 'orsign', [myId, second.userId]);
      expect(seeded.taskIds.length).toBe(2);

      const myTaskId = await pendingTaskIdOf(page, myId, seeded.taskIds);
      const otherTaskId = await pendingTaskIdOf(page, second.userId, seeded.taskIds);

      await approveAs(
        second.session.page,
        otherTaskId,
        second.userId,
        'reject',
        '584 或签第一票驳回'
      );

      let status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '或签单人 reject 只落本人任务，实例应保持 PROCESSING').toBe('PROCESSING');
      let detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(detail.tasks.find(t => t.id === otherTaskId)?.status, '驳回人任务应为 rejected').toBe(
        'rejected'
      );
      expect(
        detail.tasks.find(t => t.id === myTaskId)?.status,
        '其余 pending 任务应保持 pending（或签等待他人）'
      ).toBe('pending');

      await approveAs(page, myTaskId, myId, 'reject', '584 或签第二票驳回');

      status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '或签全员 reject 后实例应 TERMINATED').toBe('TERMINATED');
      detail = await fetchInstanceDetail(page, seeded.instanceId);
      expect(detail.tasks.map(t => t.status).sort(), '全部签署任务均应为 rejected').toEqual([
        'rejected',
        'rejected',
      ]);

      await second.session.close();
    }
  );

  test(
    '584-03 加签：pending 会签任务加签后新增处理人可投票，全员通过才推进',
    { tag: ['@bpm', '@add-sign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);
      const seeded = await seedMultiSignInstance(page, myId, 'countersign', [myId]);
      expect(seeded.taskIds.length, '单人会签节点初始只有一枚任务').toBe(1);
      const myTaskId = seeded.taskIds[0];

      await apiCall(page, 'POST', '/bpm/tasks/add-sign', {
        task_id: myTaskId,
        add_assignee_ids: [second.userId],
        reason: '584 加签：补充第二审批人',
      });

      const detail = await fetchInstanceDetail(page, seeded.instanceId);
      const pendingIds = detail.tasks.filter(t => t.status === 'pending').map(t => Number(t.id));
      expect(pendingIds.length, '加签后实例内应有两枚 pending 任务（本人 + 新增处理人）').toBe(2);
      expect(pendingIds, '本人原任务加签后应保持 pending').toContain(myTaskId);
      expect(
        pendingIds.find(id => id !== myTaskId),
        '加签应为新增处理人另建一枚 pending 任务，而不是并入本人任务'
      ).toBeTruthy();

      await approveAs(page, myTaskId, myId, 'approve', '584 加签后第一票通过');

      let status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '加签后仅本人通过实例不得推进').toBe('PROCESSING');

      const otherTaskId = pendingIds.find(id => id !== myTaskId);
      expect(otherTaskId, '加签新增处理人的任务 id 应可定位').toBeTruthy();
      await approveAs(
        second.session.page,
        otherTaskId!,
        second.userId,
        'approve',
        '584 加签第二票通过'
      );

      status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '加签处理人也通过后实例应 COMPLETED').toBe('COMPLETED');

      await second.session.close();
    }
  );

  test(
    '584-04 加签负例：单人节点加签被拒；已结束任务加签被拒（外显原文）',
    { tag: ['@bpm', '@add-sign'] },
    async ({ page, browser }) => {
      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      if (!me.data?.id) throw new Error(`GET /auth/me 未返回 id：${JSON.stringify(me)}`);
      const myId = me.data.id;

      const second = await ensureSecondApprover(page, browser);

      // 负例一：single 节点的 pending 任务加签被拒（business_displayable）
      const single = await seedSingleInstance(page, myId);
      const failSingle = await apiCallExpectFail(page, 'POST', '/bpm/tasks/add-sign', {
        task_id: single.taskId,
        add_assignee_ids: [second.userId],
        reason: '584 负例：单人节点加签',
      });
      expect(failureCode(failSingle), '单人节点加签应归 BUSINESS_ERROR').toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      expect(
        failSingle.message,
        `期望逐字符外显原文「${MSG_ADDSIGN_SINGLE}」（bpm_ops/task.rs）；实际「${failSingle.message}」`
      ).toBe(MSG_ADDSIGN_SINGLE);

      // 负例二：countersign 任务已完成后再加签被拒（全员通过后任务 completed）
      const seeded = await seedMultiSignInstance(page, myId, 'countersign', [myId]);
      const myTaskId = seeded.taskIds[0];
      await approveAs(page, myTaskId, myId, 'approve', '584 完成单人会签');
      const status = await fetchInstanceStatus(page, seeded.instanceId);
      expect(status, '单人会签全员通过后实例应 COMPLETED').toBe('COMPLETED');

      const failDone = await apiCallExpectFail(page, 'POST', '/bpm/tasks/add-sign', {
        task_id: myTaskId,
        add_assignee_ids: [second.userId],
        reason: '584 负例：已完成任务加签',
      });
      expect(failureCode(failDone), '已结束任务加签应归 BUSINESS_ERROR').toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      expect(
        failDone.message,
        `期望逐字符外显原文「${MSG_ADDSIGN_NOT_PENDING}」（bpm_ops/task.rs）；实际「${failDone.message}」`
      ).toBe(MSG_ADDSIGN_NOT_PENDING);

      await second.session.close();
    }
  );
});

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
