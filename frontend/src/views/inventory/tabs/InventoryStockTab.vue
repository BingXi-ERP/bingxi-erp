<!--
  InventoryStockTab.vue - 库存台账 Tab
  来源：原 inventory/index.vue 中 stock tab 区
  拆分日期：2026-06-17 P1-3-Batch-3
-->
<template>
  <div>
    <el-card shadow="hover" class="filter-card">
      <el-form
        :inline="true"
        :model="localQuery"
        class="filter-form"
        :aria-label="t('inventory.stockTab.filterAria')"
      >
        <el-form-item :label="t('inventory.stockTab.keyword')">
          <el-input
            v-model="localQuery.keyword"
            :placeholder="t('inventory.stockTab.keywordPlaceholder')"
            clearable
            @clear="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('inventory.stockTab.warehouse')">
          <el-select
            v-model="localQuery.warehouse_id"
            :placeholder="t('inventory.stockTab.warehousePlaceholder')"
            clearable
            @change="handleQuery"
          >
            <el-option
              v-for="wh in warehouses"
              :key="wh.id"
              :label="wh.warehouse_name"
              :value="wh.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('inventory.stockTab.status')">
          <el-select
            v-model="localQuery.stock_status"
            :placeholder="t('inventory.stockTab.statusPlaceholder')"
            clearable
            @change="handleQuery"
          >
            <el-option
              v-for="opt in INVENTORY_STOCK_STATUS_OPTIONS"
              :key="opt"
              :label="t(INVENTORY_STOCK_STATUS_LABEL_KEY[opt])"
              :value="opt"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleQuery">
            <el-icon><Search /></el-icon>
            {{ t('inventory.stockTab.query') }}
          </el-button>
          <el-button @click="emit('reset')">
            <el-icon><Refresh /></el-icon>
            {{ t('inventory.stockTab.reset') }}
          </el-button>
          <el-button type="success" @click="emit('create')">
            {{ t('inventory.stockTab.create') }}
          </el-button>
          <el-button @click="emit('export')">{{ t('inventory.stockTab.export') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" class="table-card">
      <!-- W2.3 手机卡片（<768 与 BPM 审批手机卡片同断点同范式） -->
      <section v-if="isPhone" v-loading="loading" class="stock-mobile">
        <ul class="stock-list" :aria-label="t('inventory.stockTab.mobileCardAria')">
          <li v-for="row in stocks" :key="row.id" class="stock-card" @click="handleRowView(row)">
            <dl class="stock-fields">
              <div class="stock-number">
                <dt>{{ t('inventory.stockTab.colProductCode') }}</dt>
                <dd>{{ row.product_code ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colProductName') }}</dt>
                <dd>{{ row.product_name ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colWarehouse') }}</dt>
                <dd>{{ row.warehouse_name ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colBatchNo') }}</dt>
                <dd>{{ row.batch_no }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colColorCode') }}</dt>
                <dd>{{ row.color_no || '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colDyeLot') }}</dt>
                <dd>{{ row.dye_lot_no ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colQuantity') }}</dt>
                <dd>
                  {{
                    row.quantity_on_hand != null
                      ? Number(row.quantity_on_hand).toLocaleString()
                      : '-'
                  }}
                </dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colStatus') }}</dt>
                <dd>
                  <el-tag :type="statusTagType(row.stock_status)" size="small">
                    {{ getStatusText(row.stock_status) }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ t('inventory.stockTab.colLocation') }}</dt>
                <dd>{{ row.bin_location ?? '-' }}</dd>
              </div>
            </dl>
            <div class="stock-actions">
              <el-button v-if="canEditStockDetail" type="primary" @click="emitEdit(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-button type="danger" @click="emitDelete(row)">{{ t('common.delete') }}</el-button>
            </div>
          </li>
        </ul>
        <ElEmpty
          v-if="!loading && stocks.length === 0"
          :description="t('components.v2Table.empty')"
        />
        <ElPagination
          :current-page="localQuery.page"
          :page-size="localQuery.page_size"
          :page-sizes="[10, 20, 50]"
          :total="total"
          layout="total, sizes, prev, next"
          :aria-label="t('inventory.stockTab.paginationAria')"
          @current-change="handlePageChange"
          @size-change="handleSizeChange"
        />
      </section>
      <div v-else class="table-toolbar">
        <el-button size="small" @click="emit('create')">
          {{ t('inventory.stockTab.create') }}
        </el-button>
      </div>
      <V2Table
        v-if="!isPhone"
        :data="stocks"
        :columns="stockColumns"
        :estimated-row-height="40"
        :loading="loading"
        :total="total"
        :page="localQuery.page"
        :page-size="localQuery.page_size"
        @row-click="handleRowView"
        @page-change="handlePageChange"
        @size-change="handleSizeChange"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, h, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElButton, ElEmpty, ElPagination } from 'element-plus';
import { Search, Refresh } from '@element-plus/icons-vue';
import V2Table from '@/components/V2Table/index.vue';
import { useTableColumns } from '@/composables/useTableColumns';
import { useUserStore } from '@/store/user';
import { canAccessDetailPermission } from '@/router';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStockStatusLabel } from '../composables/invFmts';
import {
  INVENTORY_STOCK_STATUS_LABEL_KEY,
  INVENTORY_STOCK_STATUS_OPTIONS,
} from '@/constants/inventory-stock-status';
// v11 批次 160 P2-7 修复：导入具体接口类型替代 any[]
import type { InventoryStock } from '@/api/inventory';
import type { Warehouse } from '@/api/warehouse';

// 接入 i18n，替换硬编码中文文案
const { t } = useI18n({ useScope: 'global' });

// W2.3 手机卡片断点（<768 与 BPM 审批手机卡片同断点）
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

export interface StockQuery {
  page: number;
  page_size: number;
  keyword: string;
  warehouse_id: number | undefined;
  stock_status: string;
}

const props = defineProps<{
  stocks: InventoryStock[];
  total: number;
  loading: boolean;
  queryParams: StockQuery;
  warehouses: Warehouse[];
}>();

const emit = defineEmits<{
  view: [row: InventoryStock];
  query: [];
  reset: [];
  create: [];
  edit: [row: InventoryStock];
  delete: [row: InventoryStock];
  export: [];
  'update:queryParams': [value: StockQuery];
}>();

const localQuery = reactive<StockQuery>({ ...props.queryParams });

watch(
  () => props.queryParams,
  newParams => {
    Object.assign(localQuery, newParams);
  },
  { deep: true }
);

// 状态标签映射：与详情页、打印共用同一份取值→文案映射（见 composables/invFmts）
const getStatusText = (status: string) => getStockStatusLabel(status, t);

// 手机卡片状态 tag 类型（仅样式映射，不改词表取值域：正常/报废/已删除）
const STOCK_STATUS_TAG_TYPE: Record<string, string> = {
  正常: 'success',
  报废: 'danger',
  已删除: 'info',
};
const statusTagType = (status: string) => STOCK_STATUS_TAG_TYPE[status] ?? '';

const emitEdit = (row: InventoryStock) => emit('edit', row);
const emitDelete = (row: InventoryStock) => emit('delete', row);

// 查看/编辑入口回源 GET 与 PUT `/inventory/stock/{id}`，该 URL 派生的权限资源段是 stock
// （inventory 只是模块前缀）。用 canAccessDetailPermission 与后端 matches_permission 同源判定，
// 判为不可访问时移除入口，避免留下点了必然 403 的按钮。
const userStore = useUserStore();
const canViewStockDetail = computed(() =>
  canAccessDetailPermission('stock', 'read', userStore.userInfo?.permissions || [])
);
const canEditStockDetail = computed(() =>
  canAccessDetailPermission('stock', 'update', userStore.userInfo?.permissions || [])
);
// 行点击进入详情：无 /{id} 读权限时不触发（详情数据无法加载，避免必然 403）
const handleRowView = (row: InventoryStock) => {
  if (canViewStockDetail.value) emit('view', row);
};

const { columns: stockColumns } = useTableColumns<InventoryStock>([
  {
    key: 'product_code',
    title: t('inventory.stockTab.colProductCode'),
    width: 140,
    sortable: true,
  },
  { key: 'product_name', title: t('inventory.stockTab.colProductName'), width: 200 },
  { key: 'warehouse_name', title: t('inventory.stockTab.colWarehouse'), width: 120 },
  { key: 'batch_no', title: t('inventory.stockTab.colBatchNo'), width: 120 },
  { key: 'color_no', title: t('inventory.stockTab.colColorCode'), width: 100 },
  { key: 'dye_lot_no', title: t('inventory.stockTab.colDyeLot'), width: 110 },
  {
    key: 'quantity_on_hand',
    title: t('inventory.stockTab.colQuantity'),
    width: 120,
    align: 'right',
    formatter: (row: InventoryStock) =>
      row.quantity_on_hand != null ? Number(row.quantity_on_hand).toLocaleString() : '-',
  },
  {
    key: 'stock_status',
    title: t('inventory.stockTab.colStatus'),
    width: 100,
    align: 'center',
    formatter: (row: InventoryStock) => getStatusText(row.stock_status),
  },
  { key: 'bin_location', title: t('inventory.stockTab.colLocation'), width: 100 },
  {
    key: 'operation',
    title: t('inventory.stockTab.colOperation'),
    width: 120,
    fixed: 'right',
    // V2Table 通过 renderCell 渲染操作列（无插槽机制）
    renderCell: (row: InventoryStock) => {
      const actions = [
        // 编辑入口保存走 PUT /inventory/stock/{id}，无 /{id} 更新权限时不渲染
        ...(canEditStockDetail.value
          ? [
              h(
                ElButton,
                {
                  size: 'small',
                  type: 'primary',
                  link: true,
                  onClick: (e: Event) => {
                    e.stopPropagation();
                    emit('edit', row);
                  },
                },
                () => t('common.edit')
              ),
            ]
          : []),
        h(
          ElButton,
          {
            size: 'small',
            type: 'danger',
            link: true,
            onClick: (e: Event) => {
              e.stopPropagation();
              emit('delete', row);
            },
          },
          () => t('common.delete')
        ),
      ];
      return h('div', { class: 'operation-cell' }, actions);
    },
  },
]);

// 查询前先回传本地筛选值，确保父组件 fetchData 读到最新 keyword/warehouse_id/stock_status
const handleQuery = () => {
  emit('update:queryParams', { ...localQuery });
  emit('query');
};

const handlePageChange = (newPage: number) => {
  emit('update:queryParams', { ...localQuery, page: newPage });
  emit('query');
};

const handleSizeChange = (newSize: number) => {
  emit('update:queryParams', { ...localQuery, page_size: newSize, page: 1 });
  emit('query');
};
</script>

<style scoped>
.filter-card,
.table-card {
  margin-bottom: 16px;
}

/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.stock-mobile {
  min-width: 0;
}
.stock-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.stock-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.stock-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.stock-fields > div {
  min-width: 0;
}
.stock-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.stock-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.stock-number dd {
  font-weight: 600;
}
.stock-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.stock-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.stock-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.stock-mobile :deep(.el-pagination button),
.stock-mobile :deep(.el-pager li),
.stock-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
