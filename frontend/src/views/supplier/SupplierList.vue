<!--
  SupplierList.vue - 供应商列表子组件
  来源：原 supplier/index.vue 中 列表+筛选区（line 28-99）
  拆分日期：2026-06-17 P1-3-Batch-6
-->
<template>
  <div>
    <el-card shadow="hover" class="filter-card">
      <el-form
        :inline="true"
        :model="localQuery"
        class="filter-form"
        :aria-label="t('supplier.list.filterAriaLabel')"
      >
        <el-form-item :label="t('supplier.list.filter.keyword')">
          <el-input
            v-model="localQuery.keyword"
            :placeholder="t('supplier.list.filter.keywordPlaceholder')"
            clearable
          />
        </el-form-item>
        <el-form-item :label="t('supplier.list.filter.grade')">
          <el-select
            v-model="localQuery.grade"
            :placeholder="t('supplier.list.filter.gradePlaceholder')"
            clearable
          >
            <el-option :label="t('supplier.list.option.gradeA')" value="A" />
            <el-option :label="t('supplier.list.option.gradeB')" value="B" />
            <el-option :label="t('supplier.list.option.gradeC')" value="C" />
            <el-option :label="t('supplier.list.option.gradeD')" value="D" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('supplier.list.filter.status')">
          <el-select
            v-model="localQuery.status"
            :placeholder="t('supplier.list.filter.statusPlaceholder')"
            clearable
          >
            <el-option :label="t('supplier.list.option.statusActive')" value="active" />
            <el-option :label="t('supplier.list.option.statusInactive')" value="inactive" />
          </el-select>
        </el-form-item>
        <!-- batch-13 P3: 加工商筛选 -->
        <el-form-item label="类型">
          <el-select v-model="localQuery.is_processor" placeholder="全部" clearable>
            <el-option label="供应商" :value="false" />
            <el-option label="加工商" :value="true" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleQuery">{{
            t('supplier.list.button.search')
          }}</el-button>
          <el-button @click="handleReset">{{ t('supplier.list.button.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" class="table-card">
      <!-- 手机卡片（<768 与 BPM 审批手机卡片同断点同范式） -->
      <section v-if="isPhone" v-loading="loading" class="supplier-mobile">
        <ul class="supplier-list" :aria-label="t('supplier.list.mobileCardAriaLabel')">
          <li v-for="row in suppliers" :key="row.id" class="supplier-card">
            <dl class="supplier-fields">
              <div class="supplier-number">
                <dt>{{ t('supplier.list.column.supplierCode') }}</dt>
                <dd>{{ row.supplier_code }}</dd>
              </div>
              <div>
                <dt>{{ t('supplier.list.column.supplierName') }}</dt>
                <dd>{{ row.supplier_name }}</dd>
              </div>
              <div>
                <dt>{{ t('supplier.list.column.contactPhone') }}</dt>
                <dd>{{ row.contact_phone || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('supplier.list.column.grade') }}</dt>
                <dd>
                  <el-tag :type="getGradeTag(row.grade ?? '')" size="small">
                    {{ row.grade || '-' }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ t('supplier.list.column.type') }}</dt>
                <dd>{{ row.supplier_type || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('supplier.list.column.status') }}</dt>
                <dd>
                  <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                    {{
                      row.status === 'active'
                        ? t('supplier.list.option.statusActive')
                        : t('supplier.list.option.statusInactive')
                    }}
                  </el-tag>
                </dd>
              </div>
            </dl>
            <div class="supplier-actions">
              <el-button type="primary" @click="$emit('edit', row)">{{
                t('supplier.list.button.edit')
              }}</el-button>
              <el-button type="danger" @click="$emit('delete', row)">{{
                t('supplier.list.button.delete')
              }}</el-button>
            </div>
          </li>
        </ul>
        <ElEmpty
          v-if="!loading && suppliers.length === 0"
          :description="t('components.v2Table.empty')"
        />
        <ElPagination
          v-model:current-page="localQuery.page"
          v-model:page-size="localQuery.page_size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, next"
          :aria-label="t('supplier.list.paginationAriaLabel')"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </section>
      <el-table
        v-else
        v-loading="loading"
        :data="suppliers"
        stripe
        :aria-label="t('supplier.list.tableAriaLabel')"
      >
        <el-table-column
          prop="supplier_code"
          :label="t('supplier.list.column.supplierCode')"
          width="120"
          fixed
        />
        <el-table-column
          prop="supplier_name"
          :label="t('supplier.list.column.supplierName')"
          min-width="180"
          fixed
        />
        <el-table-column
          prop="supplier_short_name"
          :label="t('supplier.list.column.shortName')"
          width="100"
        />
        <el-table-column
          prop="contact_phone"
          :label="t('supplier.list.column.contactPhone')"
          width="130"
        />
        <el-table-column
          prop="contact_email"
          :label="t('supplier.list.column.email')"
          width="180"
          show-overflow-tooltip
        />
        <el-table-column prop="grade" :label="t('supplier.list.column.grade')" width="80">
          <template #default="{ row }">
            <el-tag :type="getGradeTag(row.grade)" size="small">
              {{ row.grade || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="supplier_type" :label="t('supplier.list.column.type')" width="100" />
        <el-table-column prop="status" :label="t('supplier.list.column.status')" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{
                row.status === 'active'
                  ? t('supplier.list.option.statusActive')
                  : t('supplier.list.option.statusInactive')
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('supplier.list.column.operation')" width="180" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="$emit('edit', row)">{{
              t('supplier.list.button.edit')
            }}</el-button>
            <el-button type="danger" link size="small" @click="$emit('delete', row)">{{
              t('supplier.list.button.delete')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="localQuery.page"
          v-model:page-size="localQuery.page_size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          :aria-label="t('supplier.list.paginationAriaLabel')"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElEmpty, ElPagination } from 'element-plus';
// v11 批次 176 P2-1 修复：引入 Supplier 和 SupplierQueryParams 替代 any
import type { Supplier, SupplierQueryParams } from '@/api/supplier';
import { useBreakpoint } from '@/composables/useBreakpoint';

const { t } = useI18n({ useScope: 'global' });

// 手机卡片断点（<768 与 BPM 审批手机卡片同断点）
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const props = defineProps<{
  suppliers: Supplier[];
  total: number;
  loading: boolean;
  queryParams: SupplierQueryParams;
  dialogMode: 'list' | 'view' | 'add' | 'edit';
}>();

const emit = defineEmits<{
  search: [];
  reset: [];
  'update:queryParams': [value: SupplierQueryParams];
  add: [];
  view: [row: Supplier];
  edit: [row: Supplier];
  delete: [row: Supplier];
}>();

const localQuery = reactive({ ...props.queryParams });

/** 等级 → Element Plus Tag 类型映射 */
const getGradeTag = (grade: string): 'success' | 'warning' | 'danger' | 'info' => {
  if (grade === 'A') return 'success';
  if (grade === 'D') return 'danger';
  return 'warning';
};

watch(
  () => props.queryParams,
  newQ => Object.assign(localQuery, newQ),
  { deep: true }
);

const handlePageChange = (page: number) => {
  localQuery.page = page;
  emit('update:queryParams', { ...localQuery });
};

const handleSizeChange = (pageSize: number) => {
  localQuery.page_size = pageSize;
  localQuery.page = 1;
  emit('update:queryParams', { ...localQuery });
};

const handleQuery = () => {
  emit('update:queryParams', { ...localQuery, page: 1 });
  emit('search');
};

const handleReset = () => {
  localQuery.keyword = '';
  localQuery.grade = '';
  localQuery.status = '';
  localQuery.is_processor = undefined;
  localQuery.page = 1;
  localQuery.page_size = 20;
  handleQuery();
};
</script>

<style scoped>
/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.supplier-mobile {
  min-width: 0;
}
.supplier-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.supplier-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.supplier-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.supplier-fields > div {
  min-width: 0;
}
.supplier-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.supplier-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.supplier-number dd {
  font-weight: 600;
}
.supplier-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.supplier-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.supplier-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.supplier-mobile :deep(.el-pagination button),
.supplier-mobile :deep(.el-pager li),
.supplier-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
