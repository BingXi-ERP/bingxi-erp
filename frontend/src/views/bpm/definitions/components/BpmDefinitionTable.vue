<!--
  BpmDefinitionTable.vue - BPM 流程定义列表
  拆分自 bpm/definitions.vue（P14 批 2 I-3 第 5 批）
  批次 282：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
-->
<template>
  <el-card
    class="table-card bpm-definition-table"
    :class="{ 'bpm-definition-table--phone': isPhone }"
  >
    <section v-if="isPhone" v-loading="loading" class="bpm-definition-mobile">
      <ul v-if="data.length" class="card-list" :aria-label="$t('bpm.definitions.table.ariaLabel')">
        <li v-for="row in data" :key="row.id" class="card-item">
          <dl class="card-fields">
            <div class="field-emphasis">
              <dt>{{ $t('bpm.definitions.table.processName') }}</dt>
              <dd>{{ row.process_name }}</dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.processKey') }}</dt>
              <dd>{{ row.process_key }}</dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.category') }}</dt>
              <dd>{{ getCategoryText(row.category!, t) }}</dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.version') }}</dt>
              <dd>{{ row.version }}</dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.status') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.status)">
                  {{ getStatusText(row.status, t) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.description') }}</dt>
              <dd>{{ row.description }}</dd>
            </div>
            <div>
              <dt>{{ $t('bpm.definitions.table.createdAt') }}</dt>
              <dd>{{ row.created_at }}</dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button
              v-permission="PERMISSIONS.BPM_DEFINITION_UPDATE"
              size="small"
              @click="emit('edit', row)"
              >{{ $t('bpm.definitions.table.edit') }}</el-button
            >
            <el-button size="small" type="primary" @click="emit('versions', row)">{{
              $t('bpm.definitions.table.versions')
            }}</el-button>
            <el-button size="small" type="success" @click="emit('save-as-template', row)">
              {{ $t('bpm.definitions.table.saveAsTemplate') }}
            </el-button>
            <el-button
              v-permission="PERMISSIONS.BPM_DEFINITION_DELETE"
              size="small"
              type="danger"
              @click="emit('delete', row)"
              >{{ $t('bpm.definitions.table.delete') }}</el-button
            >
          </div>
        </li>
      </ul>
      <el-empty v-else :description="$t('components.v2Table.empty')" />
    </section>
    <el-table
      v-else
      v-loading="loading"
      :data="data"
      border
      stripe
      :aria-label="$t('bpm.definitions.table.ariaLabel')"
    >
      <el-table-column
        prop="process_key"
        :label="$t('bpm.definitions.table.processKey')"
        min-width="140"
      />
      <el-table-column
        prop="process_name"
        :label="$t('bpm.definitions.table.processName')"
        min-width="180"
      />
      <el-table-column prop="category" :label="$t('bpm.definitions.table.category')" width="100">
        <template #default="{ row }">
          {{ getCategoryText(row.category, t) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="version"
        :label="$t('bpm.definitions.table.version')"
        width="100"
        align="center"
      />
      <el-table-column
        prop="status"
        :label="$t('bpm.definitions.table.status')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">
            {{ getStatusText(row.status, t) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        :label="$t('bpm.definitions.table.description')"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="created_at"
        :label="$t('bpm.definitions.table.createdAt')"
        min-width="160"
      />
      <el-table-column :label="$t('bpm.definitions.table.operation')" width="320" fixed="right">
        <template #default="{ row }">
          <el-button
            v-permission="PERMISSIONS.BPM_DEFINITION_UPDATE"
            size="small"
            @click="emit('edit', row)"
            >{{ $t('bpm.definitions.table.edit') }}</el-button
          >
          <el-button size="small" type="primary" @click="emit('versions', row)">{{
            $t('bpm.definitions.table.versions')
          }}</el-button>
          <el-button size="small" type="success" @click="emit('save-as-template', row)">
            {{ $t('bpm.definitions.table.saveAsTemplate') }}
          </el-button>
          <el-button
            v-permission="PERMISSIONS.BPM_DEFINITION_DELETE"
            size="small"
            type="danger"
            @click="emit('delete', row)"
            >{{ $t('bpm.definitions.table.delete') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      :aria-label="$t('bpm.definitions.table.paginationAriaLabel')"
      @update:current-page="(v: number) => emit('update:page', v)"
      @update:page-size="(v: number) => emit('update:page-size', v)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCategoryText, getStatusType, getStatusText } from '../composables/bpmDfFmts';
import type { ProcessDefinition } from '@/api/bpm-enhanced';
import { PERMISSIONS } from '@/constants/permissions';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/** 列表组件（批次 282：page/pageSize props + v-model 绑定分页） */
defineProps<{
  // 列表数据
  data: ProcessDefinition[];
  // 总数
  total: number;
  // 加载状态
  loading: boolean;
  // 分页
  page: number;
  pageSize: number;
}>();

const emit = defineEmits<{
  edit: [row: ProcessDefinition];
  versions: [row: ProcessDefinition];
  'save-as-template': [row: ProcessDefinition];
  delete: [row: ProcessDefinition];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.el-pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
.card-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.card-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.card-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 16px;
}
.card-fields > div {
  min-width: 0;
}
.field-emphasis {
  grid-column: 1 / -1;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.field-emphasis dd {
  font-weight: 600;
}
.card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.card-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.bpm-definition-table--phone :deep(.el-pagination button) {
  min-height: 44px;
  min-width: 44px;
}
</style>
