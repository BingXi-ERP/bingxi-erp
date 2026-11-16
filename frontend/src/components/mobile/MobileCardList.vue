<!--
  MobileCardList.vue - 通用手机卡片列表（<768 断点）
  功能 锁定手机端列表卡片的通用骨架：dl 字段网格 + 行级动作按钮 + 分页，
        避免每个域各写一份 200 行重复模板与样式（已重复 8 次的范式提炼）。
  调用方 各域列表组件在 isPhone 分支内使用，传入 fields/actions/pagination props。
  入参 rows 列表行；fields 字段定义（label+value slot）；actions 动作按钮定义。
  传给谁 ElPagination/ElEmpty（复用 BPM 审批手机卡片同款 44px 触控样式）。
  存什么 无（纯展示组件，不持有状态）。
  存哪里 无。
-->
<template>
  <section v-loading="loading" class="mobile-card-list">
    <ul class="card-list" :aria-label="ariaLabel">
      <li
        v-for="(row, index) in rows"
        :key="(row[keyField] as PropertyKey) ?? index"
        class="card-item"
      >
        <dl class="card-fields">
          <div
            v-for="field in fields"
            :key="field.key"
            :class="['field', { 'field-emphasis': field.emphasis }]"
          >
            <dt>{{ field.label }}</dt>
            <dd>
              <slot :name="`field-${field.key}`" :row="row" :value="row[field.key]">
                {{ formatFieldValue(row[field.key], field) }}
              </slot>
            </dd>
          </div>
        </dl>
        <div v-if="actions.length > 0" class="card-actions">
          <el-button
            v-for="action in visibleActions(row)"
            :key="action.key"
            :type="action.type"
            @click="emit('action', { action: action.key, row })"
          >
            {{ action.label }}
          </el-button>
        </div>
      </li>
    </ul>
    <ElEmpty v-if="!loading && rows.length === 0" :description="emptyText" />
    <ElPagination
      v-if="total > 0"
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="pageSizes"
      :total="total"
      layout="total, sizes, prev, next"
      :aria-label="paginationAria"
      @current-change="(v: number) => emit('page-change', v)"
      @size-change="(v: number) => emit('size-change', v)"
    />
  </section>
</template>

<script setup lang="ts">
import { ElEmpty, ElPagination } from 'element-plus';

export interface MobileCardField {
  key: string;
  label: string;
  emphasis?: boolean;
  format?: (value: unknown) => string;
}

export interface MobileCardAction {
  key: string;
  label: string;
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default';
  visible?: (row: Record<string, unknown>) => boolean;
}

const props = withDefaults(
  defineProps<{
    rows: Record<string, unknown>[];
    fields: MobileCardField[];
    actions?: MobileCardAction[];
    loading?: boolean;
    keyField?: string;
    total?: number;
    page?: number;
    pageSize?: number;
    pageSizes?: number[];
    ariaLabel?: string;
    emptyText?: string;
    paginationAria?: string;
    actionColumns?: number;
  }>(),
  {
    actions: () => [],
    loading: false,
    keyField: 'id',
    total: 0,
    page: 1,
    pageSize: 20,
    pageSizes: () => [10, 20, 50],
    ariaLabel: '',
    emptyText: '',
    paginationAria: '',
    actionColumns: 2,
  }
);

const emit = defineEmits<{
  action: [payload: { action: string; row: Record<string, unknown> }];
  'page-change': [page: number];
  'size-change': [size: number];
}>();

const visibleActions = (row: Record<string, unknown>) =>
  props.actions.filter(a => !a.visible || a.visible(row));

const formatFieldValue = (value: unknown, field: MobileCardField): string => {
  if (value == null || value === '') return '-';
  if (field.format) return field.format(value);
  return String(value);
};

void props.actionColumns;
</script>

<style scoped>
.mobile-card-list {
  min-width: 0;
}
.card-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
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
  gap: 12px;
  margin: 0 0 16px;
}
.card-fields > .field {
  min-width: 0;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
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
.mobile-card-list :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.mobile-card-list :deep(.el-pagination button),
.mobile-card-list :deep(.el-pager li),
.mobile-card-list :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
