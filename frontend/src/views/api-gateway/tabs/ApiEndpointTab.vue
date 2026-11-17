<!--
  ApiEndpointTab.vue - API 网关接口管理 Tab
  来源：原 api-gateway/index.vue 中 endpoints tab
  拆分日期：2026-06-17 P1-3-Batch-5
-->
<template>
  <el-card
    shadow="hover"
    class="api-endpoint-card api-endpoint-tab"
    :class="{ 'api-endpoint-tab--phone': isPhone }"
  >
    <div class="filter-container">
      <el-input
        v-model="localQuery.keyword"
        :placeholder="t('apiGateway.endpointTab.searchPlaceholder')"
        style="width: 200px"
        clearable
        @clear="handleSearch"
        @keyup.enter="handleSearch"
      />
      <el-select
        v-model="localQuery.method"
        :placeholder="t('apiGateway.endpointTab.methodPlaceholder')"
        clearable
        style="width: 120px"
      >
        <el-option label="GET" value="GET" />
        <el-option label="POST" value="POST" />
        <el-option label="PUT" value="PUT" />
        <el-option label="DELETE" value="DELETE" />
        <el-option label="PATCH" value="PATCH" />
      </el-select>
      <el-select
        v-model="localQuery.status"
        :placeholder="t('apiGateway.endpointTab.statusPlaceholder')"
        clearable
        style="width: 120px"
      >
        <el-option :label="t('apiGateway.endpointTab.statusActive')" value="active" />
        <el-option :label="t('apiGateway.endpointTab.statusInactive')" value="inactive" />
        <el-option :label="t('apiGateway.endpointTab.statusDeprecated')" value="deprecated" />
      </el-select>
      <el-button type="primary" @click="handleSearch">
        <el-icon><Search /></el-icon>
        {{ t('apiGateway.endpointTab.search') }}
      </el-button>
      <el-button type="primary" @click="emit('new-endpoint')">
        <el-icon><Plus /></el-icon>
        {{ t('apiGateway.endpointTab.create') }}
      </el-button>
    </div>

    <section v-if="isPhone" v-loading="loading" class="api-endpoint-mobile">
      <ul
        v-if="endpoints.length"
        class="card-list"
        :aria-label="t('apiGateway.endpointTab.tableAriaLabel')"
      >
        <li v-for="row in endpoints" :key="row.id" class="card-item">
          <dl class="card-fields">
            <div class="field-emphasis">
              <dt>{{ t('apiGateway.endpointTab.columnPath') }}</dt>
              <dd class="api-endpoint-long-text">{{ row.path }}</dd>
            </div>
            <div>
              <dt>{{ t('apiGateway.endpointTab.columnMethod') }}</dt>
              <dd class="api-endpoint-long-text">
                <el-tag :type="methodTypeMap[row.method]" size="small">
                  {{ row.method }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('apiGateway.endpointTab.columnDescription') }}</dt>
              <dd>{{ row.description }}</dd>
            </div>
            <div>
              <dt>{{ t('apiGateway.endpointTab.columnVersion') }}</dt>
              <dd>{{ row.version }}</dd>
            </div>
            <div>
              <dt>{{ t('apiGateway.endpointTab.columnRateLimit') }}</dt>
              <dd>{{ row.rate_limit }}</dd>
            </div>
            <div>
              <dt>{{ t('apiGateway.endpointTab.columnStatus') }}</dt>
              <dd>
                <el-tag :type="statusTypeMap[row.status]" size="small">
                  {{ getStatusLabel(row.status) }}
                </el-tag>
              </dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button
              v-permission="'api_endpoint:update'"
              type="primary"
              @click="emit('edit-endpoint', row)"
              >{{ t('apiGateway.endpointTab.edit') }}</el-button
            >
            <el-button
              v-permission="'api_endpoint:delete'"
              type="danger"
              @click="emit('delete-endpoint', row)"
              >{{ t('apiGateway.endpointTab.delete') }}</el-button
            >
          </div>
        </li>
      </ul>
      <el-empty v-else :description="t('components.v2Table.empty')" />
    </section>
    <el-table
      v-else
      v-loading="loading"
      :data="endpoints"
      stripe
      :aria-label="t('apiGateway.endpointTab.tableAriaLabel')"
    >
      <el-table-column
        prop="path"
        :label="t('apiGateway.endpointTab.columnPath')"
        min-width="200"
      />
      <el-table-column prop="method" :label="t('apiGateway.endpointTab.columnMethod')" width="80">
        <template #default="{ row }">
          <el-tag :type="methodTypeMap[row.method]" size="small">
            {{ row.method }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        :label="t('apiGateway.endpointTab.columnDescription')"
        min-width="150"
      />
      <el-table-column
        prop="version"
        :label="t('apiGateway.endpointTab.columnVersion')"
        width="80"
      />
      <el-table-column
        prop="rate_limit"
        :label="t('apiGateway.endpointTab.columnRateLimit')"
        width="100"
        align="right"
      />
      <el-table-column
        prop="status"
        :label="t('apiGateway.endpointTab.columnStatus')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="statusTypeMap[row.status]" size="small">
            {{ getStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('apiGateway.endpointTab.columnOperation')"
        width="180"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            v-permission="'api_endpoint:update'"
            type="primary"
            link
            size="small"
            @click="emit('edit-endpoint', row)"
            >{{ t('apiGateway.endpointTab.edit') }}</el-button
          >
          <el-button
            v-permission="'api_endpoint:delete'"
            type="danger"
            link
            size="small"
            @click="emit('delete-endpoint', row)"
            >{{ t('apiGateway.endpointTab.delete') }}</el-button
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
        :aria-label="t('apiGateway.endpointTab.paginationAriaLabel')"
        @current-change="(v: number) => emit('update:page', v)"
        @size-change="(v: number) => emit('update:page-size', v)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Search, Plus } from '@element-plus/icons-vue';
import type { ApiEndpoint } from '@/api/api-gateway';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

export interface EndpointQuery {
  keyword: string;
  method: string;
  status: string;
}

const props = defineProps<{
  endpoints: ApiEndpoint[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  // 批次 281：queryParams 类型放宽为 Record<string, unknown>，兼容 useTableApi 的 queryParams
  queryParams: Record<string, unknown>;
  methodTypeMap: Record<string, string>;
  statusTypeMap: Record<string, string>;
  statusMap: Record<string, string>;
}>();

const emit = defineEmits<{
  fetch: [];
  'update:page': [value: number];
  'update:page-size': [value: number];
  'new-endpoint': [];
  'edit-endpoint': [row: ApiEndpoint];
  'delete-endpoint': [row: ApiEndpoint];
  'update:queryParams': [value: EndpointQuery];
}>();

const localQuery = reactive<EndpointQuery>({
  keyword: '',
  method: '',
  status: '',
  ...(props.queryParams as Partial<EndpointQuery>),
});

watch(
  () => props.queryParams,
  newQuery => Object.assign(localQuery, newQuery),
  { deep: true }
);

// 批次 281：搜索时先同步筛选条件到父组件 queryParams，再触发 fetch 刷新
const handleSearch = () => {
  emit('update:queryParams', { ...localQuery });
  emit('fetch');
};

// 状态标签映射：返回 t() 调用，确保语言切换响应
const getStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    active: t('apiGateway.endpointTab.statusActive'),
    inactive: t('apiGateway.endpointTab.statusInactive'),
    deprecated: t('apiGateway.endpointTab.statusDeprecated'),
  };
  return map[status] || status;
};
</script>

<style scoped>
.filter-container {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}

.pagination-container {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.api-endpoint-tab--phone .filter-container {
  flex-wrap: wrap;
}
.api-endpoint-tab--phone .filter-container > * {
  min-height: 44px;
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
.card-fields dd.api-endpoint-long-text {
  overflow-wrap: anywhere;
  word-break: break-all;
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
.api-endpoint-tab--phone :deep(.el-pagination button) {
  min-height: 44px;
  min-width: 44px;
}
</style>
