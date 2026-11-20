<!--
  SystemUpdateBackupTab.vue - 系统备份 Tab
  来源：原 system-update/index.vue 中 backups tab
  拆分日期：2026-06-17 P1-3-Batch-5
  批次 283：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
-->
<template>
  <el-card shadow="hover">
    <!-- 手机端：备份记录单列卡片 -->
    <section v-if="isPhone" v-loading="loading" class="sys-table-mobile">
      <ul class="card-list" :aria-label="t('systemUpdate.backupTab.tableAriaLabel')">
        <li v-for="(row, index) in backups" :key="row.id ?? index" class="card-item">
          <dl class="card-fields">
            <div class="field field-emphasis">
              <dt>{{ t('systemUpdate.backupTab.columnBackupCode') }}</dt>
              <dd>{{ row.backup_code }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnBackupType') }}</dt>
              <dd>{{ getBackupTypeLabel(row.backup_type) }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnDescription') }}</dt>
              <dd>{{ row.description }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnFileSize') }}</dt>
              <dd>{{ row.file_size }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnStatus') }}</dt>
              <dd>
                <el-tag :type="backupStatusTypeMap[row.status]" size="small">
                  {{ getBackupStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnCreatedBy') }}</dt>
              <dd>{{ row.created_by_name }}</dd>
            </div>
            <div class="field">
              <dt>{{ t('systemUpdate.backupTab.columnCreatedAt') }}</dt>
              <dd>{{ row.created_at }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button type="info" @click="emit('view-detail', row)">
              {{ t('systemUpdate.backupTab.buttonDetail') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-if="!isPhone"
      v-loading="loading"
      :data="backups"
      stripe
      :aria-label="t('systemUpdate.backupTab.tableAriaLabel')"
    >
      <el-table-column
        prop="backup_code"
        :label="t('systemUpdate.backupTab.columnBackupCode')"
        width="140"
      />
      <el-table-column
        prop="backup_type"
        :label="t('systemUpdate.backupTab.columnBackupType')"
        width="100"
      >
        <template #default="{ row }">
          {{ getBackupTypeLabel(row.backup_type) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        :label="t('systemUpdate.backupTab.columnDescription')"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="file_size"
        :label="t('systemUpdate.backupTab.columnFileSize')"
        width="100"
      >
        <template #default="{ row }">
          {{ formatFileSize(row.file_size) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="status"
        :label="t('systemUpdate.backupTab.columnStatus')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="backupStatusTypeMap[row.status]" size="small">
            {{ getBackupStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="created_by_name"
        :label="t('systemUpdate.backupTab.columnCreatedBy')"
        width="100"
      />
      <el-table-column
        prop="created_at"
        :label="t('systemUpdate.backupTab.columnCreatedAt')"
        width="160"
      />
      <el-table-column :label="t('systemUpdate.backupTab.columnActions')" width="300" fixed="right">
        <template #default="{ row }">
          <el-button type="info" link size="small" @click="emit('view-detail', row)">{{
            t('systemUpdate.backupTab.buttonDetail')
          }}</el-button>
          <!-- 下载/恢复/删除：后端无 {id}/download|restore|delete 端点，故置灰 + 提示"暂不支持"，
               禁假可用/假成功；保留按钮以诚实呈现功能规划边界（创建备份仍可用）。
               置灰按钮不挂任何点击接线（disabled 下事件永不触发，死函数与其调用点已清除）。 -->
          <el-tooltip :content="t('systemUpdate.backupTab.notSupported')" placement="top">
            <span>
              <el-button
                v-if="row.status === 'completed'"
                type="primary"
                link
                size="small"
                disabled
                >{{ t('systemUpdate.backupTab.buttonDownload') }}</el-button
              >
            </span>
          </el-tooltip>
          <el-tooltip :content="t('systemUpdate.backupTab.notSupported')" placement="top">
            <span>
              <el-button
                v-if="row.status === 'completed'"
                type="success"
                link
                size="small"
                disabled
                >{{ t('systemUpdate.backupTab.buttonRestore') }}</el-button
              >
            </span>
          </el-tooltip>
          <el-tooltip :content="t('systemUpdate.backupTab.notSupported')" placement="top">
            <span>
              <el-button type="danger" link size="small" disabled>{{
                t('systemUpdate.backupTab.buttonDelete')
              }}</el-button>
            </span>
          </el-tooltip>
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
        :aria-label="t('systemUpdate.backupTab.paginationAriaLabel')"
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
import type { SystemBackup } from '@/api/system-update';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{
  backups: SystemBackup[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  backupStatusTypeMap: Record<string, string>;
  formatFileSize: (size: number) => string;
}>();

const emit = defineEmits<{
  'view-detail': [row: SystemBackup];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

/** 备份类型 → i18n 标签（语言切换响应） */
const getBackupTypeLabel = (type: string): string => {
  switch (type) {
    case 'full':
      return t('systemUpdate.common.backupTypeFull');
    case 'incremental':
      return t('systemUpdate.common.backupTypeIncremental');
    case 'database':
      return t('systemUpdate.common.backupTypeDatabase');
    case 'files':
      return t('systemUpdate.common.backupTypeFiles');
    default:
      return type;
  }
};

/** 备份状态 → i18n 标签（语言切换响应） */
const getBackupStatusLabel = (status: string): string => {
  switch (status) {
    case 'creating':
      return t('systemUpdate.common.backupStatusCreating');
    case 'completed':
      return t('systemUpdate.common.backupStatusCompleted');
    case 'failed':
      return t('systemUpdate.common.backupStatusFailed');
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
