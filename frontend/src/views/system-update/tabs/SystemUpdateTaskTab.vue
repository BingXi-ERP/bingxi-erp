<!--
  SystemUpdateTaskTab.vue - 系统更新任务 Tab
  来源：原 system-update/index.vue 中 tasks tab
  拆分日期：2026-06-17 P1-3-Batch-5
  批次 283：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
-->
<template>
  <el-card shadow="hover">
    <!-- 手机端：更新任务单列卡片 -->
    <section v-if="isPhone" v-loading="loading" class="sys-table-mobile">
      <ul class="card-list" :aria-label="t('systemUpdate.taskTab.tableAriaLabel')">
        <li v-for="(row, index) in tasks" :key="row.id ?? index" class="card-item">
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('systemUpdate.taskTab.columnTaskCode') }}</dt>
              <dd>{{ row.task_code }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnFromVersion') }}</dt>
              <dd>{{ row.from_version }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnToVersion') }}</dt>
              <dd>{{ row.to_version }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnStatus') }}</dt>
              <dd>
                <el-tag :type="taskStatusTypeMap[row.status]" size="small">
                  {{ getTaskStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnProgress') }}</dt>
              <dd>
                <el-tag v-if="isInProgress(row.status)" type="warning" size="small">
                  {{ t('systemUpdate.taskTab.progressInProgress') }}
                </el-tag>
                <el-tag v-else :type="taskStatusTypeMap[row.status]" size="small">
                  {{ getTaskStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnErrorMessage') }}</dt>
              <dd>{{ row.error_message }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnStartedAt') }}</dt>
              <dd>{{ row.started_at }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.taskTab.columnCompletedAt') }}</dt>
              <dd>{{ row.completed_at }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button type="info" @click="emit('view-detail', row)">
              {{ t('systemUpdate.backupTab.buttonDetail') }}
            </el-button>
            <el-button
              v-if="row.status === 'completed'"
              v-permission="PERMISSIONS.SYSTEM_UPDATE_ROLLBACK_CREATE"
              type="warning"
              @click="emit('rollback', row)"
            >
              {{ t('systemUpdate.taskTab.buttonRollback') }}
            </el-button>
            <el-button
              v-if="
                row.status === 'pending' ||
                row.status === 'downloading' ||
                row.status === 'installing'
              "
              type="danger"
              @click="emit('cancel', row)"
            >
              {{ t('systemUpdate.taskTab.buttonCancel') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="loading"
      :data="tasks"
      stripe
      :aria-label="t('systemUpdate.taskTab.tableAriaLabel')"
    >
      <el-table-column
        prop="task_code"
        :label="t('systemUpdate.taskTab.columnTaskCode')"
        width="140"
      />
      <el-table-column
        prop="from_version"
        :label="t('systemUpdate.taskTab.columnFromVersion')"
        width="100"
      />
      <el-table-column
        prop="to_version"
        :label="t('systemUpdate.taskTab.columnToVersion')"
        width="100"
      />
      <el-table-column
        prop="status"
        :label="t('systemUpdate.taskTab.columnStatus')"
        width="120"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="taskStatusTypeMap[row.status]" size="small">
            {{ getTaskStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="progress"
        :label="t('systemUpdate.taskTab.columnProgress')"
        width="150"
      >
        <template #default="{ row }">
          <!-- 后端进度无真实中间百分比：不显误导性 %，仅显状态标签（进行中/终态）。 -->
          <el-tag v-if="isInProgress(row.status)" type="warning" size="small">
            {{ t('systemUpdate.taskTab.progressInProgress') }}
          </el-tag>
          <el-tag v-else :type="taskStatusTypeMap[row.status]" size="small">
            {{ getTaskStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="error_message"
        :label="t('systemUpdate.taskTab.columnErrorMessage')"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="started_at"
        :label="t('systemUpdate.taskTab.columnStartedAt')"
        width="160"
      />
      <el-table-column
        prop="completed_at"
        :label="t('systemUpdate.taskTab.columnCompletedAt')"
        width="160"
      />
      <el-table-column :label="t('systemUpdate.taskTab.columnActions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button type="info" link size="small" @click="emit('view-detail', row)">{{
            t('systemUpdate.backupTab.buttonDetail')
          }}</el-button>
          <el-button
            v-if="row.status === 'completed'"
            v-permission="PERMISSIONS.SYSTEM_UPDATE_ROLLBACK_CREATE"
            type="warning"
            link
            size="small"
            @click="emit('rollback', row)"
            >{{ t('systemUpdate.taskTab.buttonRollback') }}</el-button
          >
          <el-button
            v-if="
              row.status === 'pending' ||
              row.status === 'downloading' ||
              row.status === 'installing'
            "
            v-permission="PERMISSIONS.SYSTEM_UPDATE_TASKS_CANCEL"
            type="danger"
            link
            size="small"
            @click="emit('cancel', row)"
            >{{ t('systemUpdate.taskTab.buttonCancel') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-container">
      <el-pagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        :aria-label="t('systemUpdate.taskTab.paginationAriaLabel')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:page-size', v)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { PERMISSIONS } from '@/constants/permissions';
import { type UpdateTask } from '@/api/system-update';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{
  tasks: UpdateTask[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  taskStatusTypeMap: Record<string, string>;
}>();

const emit = defineEmits<{
  rollback: [row: UpdateTask];
  cancel: [row: UpdateTask];
  'view-detail': [row: UpdateTask];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

/** 进行中的任务状态（后端无中间百分比，进度列显「进行中」不确定态） */
const IN_PROGRESS_STATUSES: UpdateTask['status'][] = ['pending', 'downloading', 'installing'];
const isInProgress = (status: string): boolean =>
  (IN_PROGRESS_STATUSES as string[]).includes(status);

/** 更新任务状态 → i18n 标签（语言切换响应） */
const getTaskStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending':
      return t('systemUpdate.common.taskStatusPending');
    case 'downloading':
      return t('systemUpdate.common.taskStatusDownloading');
    case 'downloaded':
      return t('systemUpdate.common.taskStatusDownloaded');
    case 'installing':
      return t('systemUpdate.common.taskStatusInstalling');
    case 'completed':
      return t('systemUpdate.common.taskStatusCompleted');
    case 'failed':
      return t('systemUpdate.common.taskStatusFailed');
    case 'rolled_back':
      return t('systemUpdate.common.taskStatusRolledBack');
    default:
      return status;
  }
};
</script>

<style scoped>
.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.sys-table-mobile .card-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.sys-table-mobile .card-item {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.sys-table-mobile .card-fields > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.sys-table-mobile .card-fields dt {
  color: #909399;
  flex-shrink: 0;
}

.sys-table-mobile .card-fields dd {
  margin: 0;
  text-align: right;
  word-break: break-all;
}

.sys-table-mobile .field-emphasis dd {
  font-weight: 500;
}

.sys-table-mobile .card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #ebeef5;
}

.sys-table-mobile .card-actions .el-button {
  margin: 0;
}
</style>
