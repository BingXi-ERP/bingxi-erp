<!--
  BpmApprovalPendingTable.vue - BPM 审批待办任务表
  拆分自 bpm/approval.vue（P14 批 2 I-3 第 4 批）
  批次 283：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
  迁移：el-table + el-pagination → V2Table 虚拟滚动表格（内置分页）
-->
<template>
  <el-card shadow="hover" class="table-card">
    <section v-if="isPhone" v-loading="loading" class="bpm-pending-mobile">
      <ul class="task-list" :aria-label="t('bpm.pendingTable.ariaLabel')">
        <li v-for="task in tasks" :key="task.id" class="task-card">
          <dl class="task-fields">
            <div class="task-number">
              <dt>{{ t('bpm.approval.pendingTable.taskNo') }}</dt>
              <dd>{{ task.task_no }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.taskName') }}</dt>
              <dd>{{ task.node_name }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.instanceId') }}</dt>
              <dd>{{ task.instance_id }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.status') }}</dt>
              <dd>{{ task.status == null ? '-' : getTaskStatusLabel(task.status) }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.priority') }}</dt>
              <dd>{{ task.priority == null ? '-' : getPriorityTextFmt(task.priority) }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.applyTime') }}</dt>
              <dd>{{ formatDateTime(task.created_at) }}</dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.dueDate') }}</dt>
              <dd :class="{ 'task-overdue': task.due_date && isOverdue(task.due_date) }">
                {{ formatDateTime(task.due_date) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('bpm.approval.pendingTable.handler') }}</dt>
              <dd>{{ task.actual_handler_name || task.actual_handler_id?.toString() || '-' }}</dd>
            </div>
          </dl>
          <div class="task-actions">
            <ElButton type="primary" @click="emit('approve', task)">
              {{ t('bpm.approval.pendingTable.approve') }}
            </ElButton>
            <ElButton type="danger" plain @click="emit('reject', task)">
              {{ t('bpm.approval.pendingTable.reject') }}
            </ElButton>
            <ElButton type="warning" plain @click="emit('transfer', task)">
              {{ t('bpm.approval.pendingTable.transfer') }}
            </ElButton>
            <ElButton @click="emit('view-chain', task)">
              {{ t('bpm.approval.pendingTable.viewChain') }}
            </ElButton>
          </div>
        </li>
      </ul>
      <ElEmpty v-if="!loading && tasks.length === 0" :description="t('components.v2Table.empty')" />
      <ElPagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, next"
        :aria-label="t('components.v2Table.paginationAriaLabel')"
        @current-change="(v: number) => emit('update:page', v)"
        @size-change="(v: number) => emit('update:page-size', v)"
      />
    </section>
    <V2Table
      v-else
      :columns="columns"
      :data="tasks"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      :height="600"
      @page-change="(v: number) => emit('update:page', v)"
      @size-change="(v: number) => emit('update:page-size', v)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useI18n } from 'vue-i18n';
import { ElButton, ElTag, ElEmpty, ElPagination } from 'element-plus';
import V2Table from '@/components/V2Table/index.vue';
import type { ColumnDef } from '@/components/V2Table/types';
import type { ApprovalTask } from '@/api/bpm-enhanced';
import {
  isOverdue,
  getPriorityType,
  getTaskStatusType,
  formatDateTime,
  TASK_STATUSES,
} from '../composables/bpmApFmts';

const { t } = useI18n({ useScope: 'global' });

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/** 任务状态显示文本（取值域与后端 bpm_task 词表同源，见 TASK_STATUSES） */
const TASK_STATUS_LABEL_KEYS: Record<(typeof TASK_STATUSES)[number], string> = {
  pending: 'bpm.approval.taskStatus.pending',
  completed: 'bpm.approval.taskStatus.completed',
  rejected: 'bpm.approval.taskStatus.rejected',
  cancelled: 'bpm.approval.taskStatus.cancelled',
};

const getTaskStatusLabel = (status: string) => {
  const key = TASK_STATUS_LABEL_KEYS[status as (typeof TASK_STATUSES)[number]];
  return key ? t(key) : status;
};

/**
 * 审批待办任务表组件
 */
defineProps<{
  // 任务列表
  tasks: ApprovalTask[];
  // 加载状态
  loading: boolean;
  // 总数
  total: number;
  // 当前页
  page: number;
  // 每页条数
  pageSize: number;
}>();

const emit = defineEmits<{
  approve: [row: ApprovalTask];
  reject: [row: ApprovalTask];
  transfer: [row: ApprovalTask];
  'view-chain': [row: ApprovalTask];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

// 优先级显示文本（响应式求值，随语言切换更新）
const getPriorityTextFmt = (priority: string) => {
  const map: Record<string, string> = {
    high: t('bpm.priority.high'),
    medium: t('bpm.priority.medium'),
    low: t('bpm.priority.low'),
  };
  return map[priority] || priority;
};

/** 操作列渲染：同意 / 拒绝 / 转交 / 审批链 */
const renderActionCell = (row: ApprovalTask) =>
  h('div', { class: 'action-cell' }, [
    h(
      ElButton,
      { type: 'primary', link: true, size: 'small', onClick: () => emit('approve', row) },
      { default: () => t('bpm.approval.pendingTable.approve') }
    ),
    h(
      ElButton,
      { type: 'danger', link: true, size: 'small', onClick: () => emit('reject', row) },
      { default: () => t('bpm.approval.pendingTable.reject') }
    ),
    h(
      ElButton,
      { type: 'warning', link: true, size: 'small', onClick: () => emit('transfer', row) },
      { default: () => t('bpm.approval.pendingTable.transfer') }
    ),
    h(
      ElButton,
      { type: 'info', link: true, size: 'small', onClick: () => emit('view-chain', row) },
      { default: () => t('bpm.approval.pendingTable.viewChain') }
    ),
  ]);

/** 列定义：与后端 bpm_task 实体字段逐一对应（多余字段后端不返回，会渲染成空白列） */
const columns = computed<ColumnDef<ApprovalTask>[]>(() => [
  { key: 'task_no', title: t('bpm.approval.pendingTable.taskNo'), width: 160, fixed: 'left' },
  { key: 'node_name', title: t('bpm.approval.pendingTable.taskName'), width: 160 },
  {
    key: 'instance_id',
    title: t('bpm.approval.pendingTable.instanceId'),
    width: 110,
    renderCell: (row: ApprovalTask) => h('span', String(row.instance_id)),
  },
  {
    key: 'actual_handler_id',
    title: t('bpm.approval.pendingTable.handler'),
    width: 110,
    renderCell: (row: ApprovalTask) =>
      h('span', row.actual_handler_name || row.actual_handler_id?.toString() || '-'),
  },
  {
    key: 'created_at',
    title: t('bpm.approval.pendingTable.applyTime'),
    width: 160,
    renderCell: (row: ApprovalTask) => h('span', formatDateTime(row.created_at)),
  },
  {
    key: 'due_date',
    title: t('bpm.approval.pendingTable.dueDate'),
    width: 160,
    renderCell: (row: ApprovalTask) => {
      if (row.due_date) {
        return h(
          'span',
          { class: { overdue: isOverdue(row.due_date) } },
          formatDateTime(row.due_date)
        );
      }
      return h('span', '-');
    },
  },
  {
    key: 'status',
    title: t('bpm.approval.pendingTable.status'),
    width: 100,
    renderCell: (row: ApprovalTask) =>
      h(
        ElTag,
        {
          type: getTaskStatusType(row.status || '') as
            'success' | 'warning' | 'info' | 'primary' | 'danger',
          size: 'small',
        },
        { default: () => getTaskStatusLabel(row.status || '') }
      ),
  },
  {
    key: 'priority',
    title: t('bpm.approval.pendingTable.priority'),
    width: 100,
    renderCell: (row: ApprovalTask) =>
      h(
        ElTag,
        {
          type: getPriorityType(row.priority || '') as
            'success' | 'warning' | 'info' | 'primary' | 'danger',
          size: 'small',
        },
        { default: () => getPriorityTextFmt(row.priority || '') }
      ),
  },
  {
    key: '__actions__',
    title: t('bpm.approval.pendingTable.operation'),
    width: 220,
    fixed: 'right',
    renderCell: renderActionCell,
  },
]);
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.action-cell {
  display: flex;
  gap: 4px;
  align-items: center;
}
.overdue {
  color: #f56c6c;
  font-weight: 600;
}
.bpm-pending-mobile {
  min-width: 0;
}
.task-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.task-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.task-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.task-fields > div {
  min-width: 0;
}
.task-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.task-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.task-number dd {
  font-weight: 600;
}
.task-fields .task-overdue {
  color: var(--el-color-danger);
}
.task-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.task-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.bpm-pending-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.bpm-pending-mobile :deep(.el-pagination button),
.bpm-pending-mobile :deep(.el-pager li),
.bpm-pending-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
