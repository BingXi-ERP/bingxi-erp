import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, { ElPagination } from 'element-plus';
import PendingTable from '@/views/bpm/approval/components/BpmApprovalPendingTable.vue';
import CompletedTable from '@/views/bpm/approval/components/BpmApprovalCompletedTable.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { ApprovalTask } from '@/api/bpm-enhanced';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/composables/useBreakpoint', async () => {
  const { ref } = await import('vue');
  const width = ref(360);
  return { useBreakpoint: () => ({ width }) };
});

const wrappers: ReturnType<typeof mountPending>[] = [];
function mountPending(tasks: ApprovalTask[] = [], loading = false) {
  const wrapper = mount(PendingTable, {
    props: { tasks, loading, total: tasks.length, page: 1, pageSize: 10 },
    global: {
      plugins: [ElementPlus],
      stubs: { V2Table: { name: 'V2Table', template: '<div class="desktop-table" />' } },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  useBreakpoint().width.value = 360;
});

describe('BPM pending mobile interactions', () => {
  it('renders the original task fields and emits the same task for each action', async () => {
    const task: ApprovalTask = {
      id: 41,
      task_no: 'TASK-MOBILE-LONG-IDENTIFIER',
      instance_id: 72,
      process_definition_id: 8,
      node_id: 'review',
      node_name: '审批节点',
      node_type: 'user_task',
      status: 'pending',
      priority: 'high',
      actual_handler_name: '待办处理人',
      created_at: '2026-11-15T08:00:00Z',
      due_date: null,
    };
    const wrapper = mountPending([task]);
    const card = wrapper.get('.task-card');
    for (const value of [
      task.task_no,
      task.node_name,
      String(task.instance_id),
      task.actual_handler_name!,
    ]) {
      expect(card.text()).toContain(value);
    }
    const buttons = card.findAll('.task-actions button');
    expect(buttons).toHaveLength(4);
    for (const [index, action] of ['approve', 'reject', 'transfer', 'view-chain'].entries()) {
      await buttons[index].trigger('click');
      expect(wrapper.emitted(action)).toEqual([[task]]);
    }
  });

  it('forwards controlled pagination changes without changing the parent props', async () => {
    const wrapper = mountPending();
    const pagination = wrapper.getComponent(ElPagination);
    pagination.vm.$emit('current-change', 2);
    pagination.vm.$emit('size-change', 20);
    await nextTick();
    expect(wrapper.emitted('update:page')).toEqual([[2]]);
    expect(wrapper.emitted('update:page-size')).toEqual([[20]]);
    expect(pagination.props('currentPage')).toBe(1);
    expect(pagination.props('pageSize')).toBe(10);
  });

  it('does not show an empty state while loading and keeps only one layout mounted', async () => {
    const wrapper = mountPending([], true);
    expect(wrapper.find('.el-empty').exists()).toBe(false);
    await wrapper.setProps({ loading: false });
    expect(wrapper.find('.el-empty').exists()).toBe(true);
    useBreakpoint().width.value = 767;
    await nextTick();
    expect(wrapper.find('.bpm-pending-mobile').exists()).toBe(true);
    expect(wrapper.find('.desktop-table').exists()).toBe(false);
    useBreakpoint().width.value = 768;
    await nextTick();
    expect(wrapper.find('.bpm-pending-mobile').exists()).toBe(false);
    expect(wrapper.find('.desktop-table').exists()).toBe(true);
    useBreakpoint().width.value = 320;
    await nextTick();
    expect(wrapper.find('.bpm-pending-mobile').exists()).toBe(true);
    expect(wrapper.find('.desktop-table').exists()).toBe(false);
  });
});

describe('BPM completed mobile interactions', () => {
  it('preserves completed fields and exposes only the existing read action', async () => {
    const task: ApprovalTask = {
      id: 81,
      task_no: 'COMPLETED-MOBILE-TASK',
      instance_id: 92,
      process_definition_id: 8,
      node_id: 'review',
      node_name: '审批节点',
      node_type: 'user_task',
      status: 'completed',
      handled_at: '2026-11-15T09:00:00Z',
      approval_opinion: '通过，保留完整审批意见以便追溯。',
    };
    const wrapper = mount(CompletedTable, {
      props: { tasks: [task], loading: false, total: 1, page: 1, pageSize: 10 },
      global: {
        plugins: [ElementPlus],
        stubs: { V2Table: { name: 'V2Table', template: '<div class="desktop-table" />' } },
      },
    });
    try {
      const card = wrapper.get('.completed-task-card');
      expect(card.text()).toContain(task.task_no);
      expect(card.text()).toContain(String(task.instance_id));
      expect(card.text()).toContain(task.approval_opinion);
      expect(card.findAll('button')).toHaveLength(1);
      await card.get('button').trigger('click');
      expect(wrapper.emitted('view-chain')).toEqual([[task]]);
      expect(wrapper.emitted('approve')).toBeUndefined();
      const pagination = wrapper.getComponent(ElPagination);
      pagination.vm.$emit('current-change', 2);
      pagination.vm.$emit('size-change', 20);
      expect(wrapper.emitted('update:page')).toEqual([[2]]);
      expect(wrapper.emitted('update:page-size')).toEqual([[20]]);
      useBreakpoint().width.value = 769;
      await nextTick();
      expect(wrapper.find('.bpm-completed-mobile').exists()).toBe(false);
      expect(wrapper.find('.desktop-table').exists()).toBe(true);
      useBreakpoint().width.value = 320;
      await nextTick();
      await wrapper.setProps({ tasks: [], total: 0, loading: true });
      expect(wrapper.find('.el-empty').exists()).toBe(false);
      await wrapper.setProps({ loading: false });
      expect(wrapper.find('.el-empty').exists()).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });
});

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const source = read('src/views/bpm/approval/components/BpmApprovalPendingTable.vue');
const parent = read('src/views/bpm/approval/index.vue');
const mobile = source.slice(source.indexOf('<section'), source.indexOf('<V2Table'));

// 删除手机分支、分页或动作接线必须判负；布局实测由审批 smoke 覆盖。
describe('BPM pending mobile presentation contract', () => {
  it('switches only at 768px and keeps the desktop table contract', () => {
    expect(source).toContain('useBreakpoint()');
    expect(source).toContain('width.value < 768');
    expect(mobile).toContain('v-if="isPhone"');
    expect(source).toMatch(/<V2Table\s+v-else/);
    expect(source).toContain(':height="600"');
    expect(source).toContain(':columns="columns"');
    expect(source).toContain(':data="tasks"');
    const columns = source.slice(source.indexOf('const columns ='));
    expect([...columns.matchAll(/key: '([^']+)'/g)].map(match => match[1])).toEqual([
      'task_no',
      'node_name',
      'instance_id',
      'actual_handler_id',
      'created_at',
      'due_date',
      'status',
      'priority',
      '__actions__',
    ]);
  });

  it('renders real task fields with loading and empty states, without a second request', () => {
    for (const field of [
      'task_no',
      'node_name',
      'status',
      'priority',
      'created_at',
      'due_date',
      'actual_handler_name',
      'actual_handler_id',
    ]) {
      expect(mobile).toContain(`task.${field}`);
    }
    expect(mobile).toContain('v-loading="loading"');
    expect(mobile).toContain('!loading && tasks.length === 0');
    expect(source).not.toMatch(/import\s+(?!type\b)[^;]+from ['"]@\/api\//);
    expect(source).not.toContain('useTableApi(');
    expect(mobile).not.toMatch(/task\.(amount|business_name|applicant_name)/);
  });

  it('retains all four emits and parent confirmation wiring', () => {
    for (const action of ['approve', 'reject', 'transfer', 'view-chain']) {
      expect(mobile).toContain(`emit('${action}', task)`);
    }
    expect(parent).toContain('@approve="bpmApProc.handleApprove"');
    expect(parent).toContain('@reject="bpmApProc.handleReject"');
    expect(parent).toContain('@confirm="bpmApProc.confirmApproval"');
    expect(mobile).not.toContain('confirmApproval');
    expect(source).toContain('min-height: 44px');
    expect(source).toContain('min-width: 44px');
    expect(source).toContain('overflow-wrap: anywhere');
  });

  it('retains controlled pagination and both update events on mobile', () => {
    expect(mobile).toContain('<ElPagination');
    for (const binding of [
      ':current-page="page"',
      ':page-size="pageSize"',
      ':total="total"',
      ':page-sizes="[10, 20, 50]"',
    ]) {
      expect(mobile).toContain(binding);
    }
    expect(mobile).toContain("emit('update:page', v)");
    expect(mobile).toContain("emit('update:page-size', v)");
  });
});
