// 514 定制订单工艺节点写链（纯 API E2E）：五节点初始态 → advance 状态机 → 手工日志 →
// 非法动作零写入 → finally 带 reason 真取消。逐条核源，不按猜测断言：
// - routes/custom_order.rs:21-25 建单；:39-55 节点写口；:56-60 timeline 读口。
// - services/custom_order_crud_service.rs:75-119 建单同事务自动插 5 节点；:146 主单 draft；
//   :166-192 节点初始 pending，四日期/operator_id/notes 全 NULL。
// - utils/process_state_machine.rs:149-158 五节点定义。
// - services/custom_order_process_service.rs:121-175 advance 动作映射、日期与 operator_id、
//   每次 advance 自动落日志；:177-197 手工日志；:199-233 timeline 节点按 sequence 升序、
//   日志按 log_time DESC（故只断日志集合与数量，不断数组顺序）。
// - models/status/production.rs:45-56 节点小写词 pending/in_progress/completed/blocked；
//   models/status/sales.rs:141-143 主单小写 draft/cancelled；两套词表不可混用。
// - handlers/custom_order_handler.rs:105-111 ProcessError::InvalidState → AppError::business
//   → HTTP 400 + BUSINESS_ERROR（utils/error.rs:201-203,373-387,824-826），对外文案脱敏，
//   故只断机器码，不断内部文案。
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from '../flow/helpers';

interface OrderRow {
  id?: number;
  order_no?: string;
  status?: string;
  customer_id?: number;
  product_id?: number;
  created_by?: number | null;
}

interface NodeRow {
  id?: number;
  node_type?: string;
  node_name?: string;
  sequence?: number;
  status?: string;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  operator_id?: number | null;
  notes?: string | null;
}

interface LogRow {
  id?: number;
  action?: string;
  operator_id?: number | null;
  before_status?: string | null;
  after_status?: string | null;
  log_time?: string;
  log_content?: string | null;
  attachments?: string[];
}

interface TimelineNodeRow extends NodeRow {
  logs?: LogRow[];
}

interface TimelineRow {
  order_id?: number;
  order_no?: string;
  current_status?: string;
  nodes?: TimelineNodeRow[];
}

interface DetailRow extends OrderRow {
  process_nodes?: NodeRow[];
}

function positiveInt(value: unknown, label: string): number {
  expect(
    Number.isInteger(value) && (value as number) > 0,
    `[514] ${label} 须正整数，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as number;
}

function isoDateTime(value: unknown, label: string): string {
  expect(
    typeof value === 'string' && !Number.isNaN(Date.parse(value as string)),
    `[514] ${label} 须 ISO 时间字符串，实际=${JSON.stringify(value)}`
  ).toBe(true);
  return value as string;
}

function pickNodeById(nodes: NodeRow[] | undefined, id: number, label: string): NodeRow {
  expect(Array.isArray(nodes), `[514] ${label} process_nodes 须数组`).toBe(true);
  const matched = (nodes as NodeRow[]).filter(n => n.id === id);
  expect(matched.length, `[514] ${label} 按 id=${id} 须恰好一个节点`).toBe(1);
  return matched[0];
}

function pickNodeByType(
  nodes: TimelineNodeRow[] | undefined,
  nodeType: string,
  label: string
): TimelineNodeRow {
  expect(Array.isArray(nodes), `[514] ${label} nodes 须数组`).toBe(true);
  const matched = (nodes as TimelineNodeRow[]).filter(n => n.node_type === nodeType);
  expect(matched.length, `[514] ${label} node_type=${nodeType} 须恰好一个节点`).toBe(1);
  return matched[0];
}

async function readDetail(page: Page, orderId: number): Promise<DetailRow> {
  const detail = await apiCallRaw<DetailRow>(page, 'GET', `/custom-orders/${orderId}`);
  expect(detail.id, `[514] 详情 id 须为 ${orderId}`).toBe(orderId);
  expect(Array.isArray(detail.process_nodes), '[514] 详情 process_nodes 须数组').toBe(true);
  expect((detail.process_nodes as NodeRow[]).length, '[514] 详情默认节点数').toBe(5);
  return detail;
}

async function readTimeline(page: Page, orderId: number): Promise<TimelineRow> {
  const timeline = await apiCallRaw<TimelineRow>(page, 'GET', `/custom-orders/${orderId}/timeline`);
  expect(timeline.order_id, `[514] timeline.order_id 须为 ${orderId}`).toBe(orderId);
  expect(Array.isArray(timeline.nodes), '[514] timeline.nodes 须数组').toBe(true);
  expect((timeline.nodes as TimelineNodeRow[]).length, '[514] timeline 默认节点数').toBe(5);
  return timeline;
}

test.describe('514 定制订单工艺节点写链', () => {
  test('514-01 五节点初始态 + start/block/unblock/complete + 手工日志 + 非法动作零写入 + 取消', async ({
    page,
  }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(
      typeof ctx.customerId === 'number' && ctx.customerId > 0,
      `[514] 夹具须备真实客户，customerId=${JSON.stringify(ctx.customerId)}`
    ).toBe(true);
    expect(
      ctx.productIds.length > 0,
      `[514] 夹具须备真实产品，productIds=${JSON.stringify(ctx.productIds)}`
    ).toBe(true);
    const customerId = ctx.customerId as number;
    const productId = ctx.productIds[0];

    let orderId: number | undefined;
    try {
      const created = await apiCallRaw<OrderRow>(page, 'POST', '/custom-orders', {
        customer_id: customerId,
        product_id: productId,
        spec: `${genCode('E514')} 65%棉35%涤 40S 133x72 150cm`,
        quantity: 10,
        unit: '米',
      });
      orderId = positiveInt(created.id, '建单返回 id');
      expect(created.status, '[514] 建单返回主单状态').toBe('draft');

      // 初始态逐节点核：类型/名称/顺序来自 default_process_nodes，日期与操作人全空。
      const detail0 = await readDetail(page, orderId);
      const creatorId = positiveInt(detail0.created_by, '主单 created_by');
      const expectedTypes = ['yarn_purchasing', 'dyeing', 'finishing', 'delivery', 'after_sales'];
      const expectedNames = ['纱线采购', '染整', '后整理', '交付', '售后'];
      const nodes0 = detail0.process_nodes as NodeRow[];
      for (let i = 0; i < 5; i += 1) {
        expect(nodes0[i].sequence, `[514] 第 ${i + 1} 节点 sequence`).toBe(i + 1);
        expect(nodes0[i].node_type, `[514] 第 ${i + 1} 节点 node_type`).toBe(expectedTypes[i]);
        expect(nodes0[i].node_name, `[514] 第 ${i + 1} 节点 node_name`).toBe(expectedNames[i]);
        expect(nodes0[i].status, `[514] 第 ${i + 1} 节点初始状态`).toBe('pending');
        expect(nodes0[i].planned_start_date, `[514] 第 ${i + 1} 节点计划开始`).toBeNull();
        expect(nodes0[i].planned_end_date, `[514] 第 ${i + 1} 节点计划结束`).toBeNull();
        expect(nodes0[i].actual_start_date, `[514] 第 ${i + 1} 节点实际开始`).toBeNull();
        expect(nodes0[i].actual_end_date, `[514] 第 ${i + 1} 节点实际结束`).toBeNull();
        expect(nodes0[i].operator_id, `[514] 第 ${i + 1} 节点 operator_id`).toBeNull();
        expect(nodes0[i].notes, `[514] 第 ${i + 1} 节点 notes`).toBeNull();
      }

      const timeline0 = await readTimeline(page, orderId);
      expect(timeline0.current_status, '[514] timeline 主单仍为 draft').toBe('draft');
      const dyeing0 = pickNodeByType(timeline0.nodes, 'dyeing', '初始 timeline');
      expect(dyeing0.node_name, '[514] 按 node_type 捕获的节点名称').toBe('染整');
      expect(dyeing0.status, '[514] dyeing 初始状态').toBe('pending');
      expect(Array.isArray(dyeing0.logs), '[514] dyeing 初始 logs 须数组').toBe(true);
      expect((dyeing0.logs as LogRow[]).length, '[514] dyeing 初始零日志').toBe(0);
      const dyeingId = positiveInt(dyeing0.id, 'dyeing 节点 id');
      const advancePath = `/custom-orders/${orderId}/nodes/${dyeingId}/advance`;

      // 每步都回读详情（含 operator_id/notes/日期）与 timeline（含 status），
      // operator_id 必须等于建单人会话身份（service 从 auth.user_id 派生，不取请求体）。
      const steps = [
        { action: 'start', status: 'in_progress', notes: 'w5-start', phase: '开始' },
        { action: 'block', status: 'blocked', notes: 'w5-block', phase: '阻塞' },
        { action: 'unblock', status: 'in_progress', notes: 'w5-unblock', phase: '解阻' },
        { action: 'complete', status: 'completed', notes: 'w5-complete', phase: '完成' },
      ];
      let firstStartDate: string | undefined;
      for (const step of steps) {
        const advanced = await apiCallRaw<NodeRow>(page, 'POST', advancePath, {
          action: step.action,
          notes: step.notes,
        });
        expect(advanced.id, `[514] ${step.phase} 响应节点 id`).toBe(dyeingId);
        expect(advanced.status, `[514] ${step.phase} 响应状态`).toBe(step.status);
        expect(advanced.operator_id, `[514] ${step.phase} 响应 operator_id`).toBe(creatorId);
        expect(advanced.notes, `[514] ${step.phase} 响应 notes`).toBe(step.notes);

        const detailAfter = await readDetail(page, orderId);
        const nodeAfter = pickNodeById(detailAfter.process_nodes, dyeingId, `${step.phase} 详情`);
        expect(nodeAfter.status, `[514] ${step.phase} 详情回读状态`).toBe(step.status);
        expect(nodeAfter.operator_id, `[514] ${step.phase} 详情回读 operator_id`).toBe(creatorId);
        expect(nodeAfter.notes, `[514] ${step.phase} 详情回读 notes`).toBe(step.notes);
        expect(nodeAfter.actual_start_date, `[514] ${step.phase} 详情回读实际开始`).toBe(
          advanced.actual_start_date
        );
        expect(nodeAfter.actual_end_date, `[514] ${step.phase} 详情回读实际结束`).toBe(
          advanced.actual_end_date
        );

        const timelineAfter = await readTimeline(page, orderId);
        expect(
          pickNodeByType(timelineAfter.nodes, 'dyeing', `${step.phase} timeline`).status,
          `[514] ${step.phase} timeline 回读状态`
        ).toBe(step.status);
        expect(timelineAfter.current_status, `[514] ${step.phase} timeline 主单仍 draft`).toBe(
          'draft'
        );

        if (step.action === 'start') {
          firstStartDate = isoDateTime(advanced.actual_start_date, 'start 写入实际开始时间');
          expect(advanced.actual_end_date, '[514] start 时实际结束须空').toBeNull();
        } else if (step.action === 'complete') {
          isoDateTime(advanced.actual_end_date, 'complete 写入实际结束时间');
          expect(advanced.actual_start_date, '[514] complete 不覆盖实际开始时间').toBe(
            firstStartDate
          );
        } else {
          expect(advanced.actual_start_date, `[514] ${step.phase} 不覆盖实际开始时间`).toBe(
            firstStartDate
          );
          expect(advanced.actual_end_date, `[514] ${step.phase} 不写实际结束时间`).toBeNull();
        }
      }

      // 手工日志：service.add_log 只做逐字段落库与回显，不校验动作与节点当前状态是否一致。
      const manual = await apiCallRaw<LogRow>(
        page,
        'POST',
        `/custom-orders/${orderId}/nodes/${dyeingId}/logs`,
        {
          action: 'note',
          before_status: 'in_progress',
          after_status: 'in_progress',
          log_content: 'w5-manual-log',
          attachments: ['w5.txt'],
        }
      );
      positiveInt(manual.id, '手工日志 id');
      expect(manual.action, '[514] 手工日志 action').toBe('note');
      expect(manual.before_status, '[514] 手工日志 before_status 逐字符回显').toBe('in_progress');
      expect(manual.after_status, '[514] 手工日志 after_status 逐字符回显').toBe('in_progress');
      expect(manual.operator_id, '[514] 手工日志 operator_id 取会话身份').toBe(creatorId);
      expect(manual.log_content, '[514] 手工日志内容').toBe('w5-manual-log');
      expect(manual.attachments, '[514] 手工日志附件逐字符回显').toEqual(['w5.txt']);
      isoDateTime(manual.log_time, '手工日志 log_time');

      const timelineWithLogs = await readTimeline(page, orderId);
      const dyeingWithLogs = pickNodeByType(timelineWithLogs.nodes, 'dyeing', '日志 timeline');
      expect(Array.isArray(dyeingWithLogs.logs), '[514] 日志 timeline logs 须数组').toBe(true);
      const logs = dyeingWithLogs.logs as LogRow[];
      expect(logs.length, '[514] 4 次 advance + 1 条手工日志').toBe(5);
      expect(
        logs.map(l => l.action).sort(),
        '[514] 日志 action 集合（不依赖 log_time DESC 顺序）'
      ).toEqual(['block', 'complete', 'note', 'start', 'unblock']);
      const attached = logs.filter(
        l => Array.isArray(l.attachments) && (l.attachments as string[]).includes('w5.txt')
      );
      expect(attached.length, '[514] 仅手工日志带附件').toBe(1);
      expect(attached[0].action, '[514] 附件所属日志 action').toBe('note');
      expect(attached[0].log_content, '[514] 附件所属日志内容').toBe('w5-manual-log');
      const otherNodes = timelineWithLogs.nodes as TimelineNodeRow[];
      for (const n of otherNodes) {
        if (n.node_type !== 'dyeing') {
          expect(Array.isArray(n.logs), `[514] ${n.node_type} logs 须数组`).toBe(true);
          expect((n.logs as LogRow[]).length, `[514] ${n.node_type} 应无日志`).toBe(0);
        }
      }

      // 非法 action：ProcessError::InvalidState → BUSINESS_ERROR/400，且节点状态与日志零写入。
      const illegal = await apiCallExpectFail(page, 'POST', advancePath, { action: 'GO' });
      expect(illegal.status, '[514] 非法 action 须 400').toBe(400);
      expect(failureCode(illegal), '[514] 非法 action 机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      const timelineAfterIllegal = await readTimeline(page, orderId);
      const dyeingAfterIllegal = pickNodeByType(
        timelineAfterIllegal.nodes,
        'dyeing',
        '非法动作后 timeline'
      );
      expect(dyeingAfterIllegal.status, '[514] 非法动作后状态不被改写').toBe('completed');
      expect(Array.isArray(dyeingAfterIllegal.logs), '[514] 非法动作后 logs 须数组').toBe(true);
      expect((dyeingAfterIllegal.logs as LogRow[]).length, '[514] 非法动作零日志写入').toBe(5);

      // 额外负例：CreateProcessNodeDto 的 sequence 范围 1-5，越界走 VALIDATION_ERROR/400。
      const badNode = await apiCallExpectFail(page, 'POST', `/custom-orders/${orderId}/nodes`, {
        node_type: 'dyeing',
        node_name: 'bad',
        sequence: 0,
      });
      expect(badNode.status, '[514] sequence=0 须 400').toBe(400);
      expect(failureCode(badNode), '[514] sequence=0 机器码').toBe(
        APP_ERROR_CODES.VALIDATION_ERROR
      );
      expect(
        (await readTimeline(page, orderId)).nodes as TimelineNodeRow[],
        '[514] 越界节点零写入'
      ).toHaveLength(5);
    } finally {
      if (orderId !== undefined) {
        // CancelCustomOrderDto.reason 必填；节点已 completed 但主单仍 draft，取消门允许非终态。
        const cancelled = await apiCallRaw<OrderRow>(page, 'DELETE', `/custom-orders/${orderId}`, {
          reason: 'E2E wave5 514 cleanup',
        });
        expect(cancelled.status, '[514] 取消后主单状态').toBe('cancelled');
        const timelineCancelled = await readTimeline(page, orderId);
        expect(timelineCancelled.current_status, '[514] 取消后 timeline 主单状态').toBe(
          'cancelled'
        );
      }
    }
  });
});
