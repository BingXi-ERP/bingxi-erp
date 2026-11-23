<!--
  PurchaseReceiptTable.vue - 采购入库列表
  拆分自 purchaseReceipt/index.vue（P14 批 2 I-3 第 4 批）
  行为完全保持一致（仅结构重构）
-->
<template>
  <!-- 手机卡片（<768 与采购管理表格同断点同范式） -->
  <section v-if="isPhone" v-loading="loading" class="receipt-mobile">
    <ul class="order-list" :aria-label="t('purchaseReceipt.table.mobileCardAria')">
      <li v-for="row in data" :key="row.id" class="order-card">
        <dl class="order-fields">
          <div class="order-number">
            <dt>{{ t('purchaseReceipt.table.column.receiptNo') }}</dt>
            <dd>{{ row.receipt_no }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.receiptDate') }}</dt>
            <dd>{{ row.receipt_date }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.purchaseOrderNo') }}</dt>
            <dd>{{ row.purchase_order_no }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.supplier') }}</dt>
            <dd>{{ row.supplier_name }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.warehouse') }}</dt>
            <dd>{{ row.warehouse_name }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.quantity') }}</dt>
            <dd>{{ row.total_quantity }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.quantityAlt') }}</dt>
            <dd>{{ row.total_quantity_alt }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.amount') }}</dt>
            <dd>{{ Number(row.total_amount ?? 0).toFixed(2) }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.status') }}</dt>
            <dd>
              <el-tag :type="getReceiptStatusTagFmt(row.receipt_status)">
                {{ getReceiptStatusLabelFmt(row.receipt_status) }}
              </el-tag>
            </dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.inspectionStatus') }}</dt>
            <dd>
              <el-tag :type="getReceiptInspectionStatusTagFmt(row.inspection_status)">
                {{ getReceiptInspectionStatusLabelFmt(row.inspection_status) }}
              </el-tag>
            </dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.createdBy') }}</dt>
            <dd>{{ row.created_by_name }}</dd>
          </div>
          <div>
            <dt>{{ t('purchaseReceipt.table.column.createdAt') }}</dt>
            <dd>{{ row.created_at }}</dd>
          </div>
        </dl>
        <div class="order-actions">
          <el-button @click="emit('view', row as PurchaseReceiptEntity)">
            {{ t('purchaseReceipt.table.aria.viewDetail') }}
          </el-button>
          <el-button
            v-if="row.receipt_status === RECEIPT_STATUS.DRAFT"
            type="primary"
            @click="emit('edit', row as PurchaseReceiptEntity)"
          >
            {{ t('purchaseReceipt.table.aria.edit') }}
          </el-button>
          <el-button
            v-if="row.receipt_status === RECEIPT_STATUS.DRAFT"
            v-permission="'purchase-receipts:confirm'"
            type="warning"
            @click="emit('approve', row as PurchaseReceiptEntity)"
          >
            {{ t('purchaseReceipt.table.button.approve') }}
          </el-button>
          <el-button
            v-if="
              row.receipt_status === RECEIPT_STATUS.DRAFT &&
              (row.inspection_status === RECEIPT_INSPECTION.PENDING ||
                row.inspection_status === RECEIPT_INSPECTION.REJECTED)
            "
            v-permission="'purchase-receipts:concession'"
            type="warning"
            @click="emit('concede', row as PurchaseReceiptEntity)"
          >
            {{ t('purchaseReceipt.table.button.concession') }}
          </el-button>
          <el-button
            v-if="
              row.receipt_status === RECEIPT_STATUS.DRAFT &&
              row.inspection_status === RECEIPT_INSPECTION.CONCESSION_ACCEPTED
            "
            v-permission="'purchase-receipts:rejudge'"
            type="info"
            @click="emit('rejudge', row as PurchaseReceiptEntity)"
          >
            {{ t('purchaseReceipt.table.button.rejudge') }}
          </el-button>
          <el-button
            v-if="row.receipt_status === RECEIPT_STATUS.DRAFT"
            type="danger"
            @click="emit('delete', row as PurchaseReceiptEntity)"
          >
            {{ t('purchaseReceipt.table.aria.delete') }}
          </el-button>
        </div>
      </li>
    </ul>
  </section>

  <el-table
    v-else
    :data="data"
    :loading="loading"
    border
    fit
    highlight-current-row
    :aria-label="t('purchaseReceipt.table.aria.list')"
    style="width: 100%"
  >
    <el-table-column
      prop="receipt_no"
      :label="t('purchaseReceipt.table.column.receiptNo')"
      width="150"
    />
    <el-table-column
      prop="receipt_date"
      :label="t('purchaseReceipt.table.column.receiptDate')"
      width="120"
    />
    <el-table-column
      prop="purchase_order_no"
      :label="t('purchaseReceipt.table.column.purchaseOrderNo')"
      width="150"
    />
    <el-table-column
      prop="supplier_name"
      :label="t('purchaseReceipt.table.column.supplier')"
      width="150"
    />
    <el-table-column
      prop="warehouse_name"
      :label="t('purchaseReceipt.table.column.warehouse')"
      width="120"
    />
    <el-table-column
      prop="total_quantity"
      :label="t('purchaseReceipt.table.column.quantity')"
      width="110"
      align="right"
    >
      <template #default="scope">
        <!-- rust_decimal 出参为十进制字符串，原样回显（合计必落库，非空列） -->
        {{ scope.row.total_quantity }}
      </template>
    </el-table-column>
    <el-table-column
      prop="total_quantity_alt"
      :label="t('purchaseReceipt.table.column.quantityAlt')"
      width="110"
      align="right"
    >
      <template #default="scope">
        <!-- 辅量合计：无辅量采集时为 0.0000（后端 unwrap_or(ZERO) 累加口径），原样回显 -->
        {{ scope.row.total_quantity_alt }}
      </template>
    </el-table-column>
    <el-table-column
      prop="total_amount"
      :label="t('purchaseReceipt.table.column.amount')"
      width="120"
      align="right"
    >
      <template #default="scope">
        {{ Number(scope.row.total_amount ?? 0).toFixed(2) }}
      </template>
    </el-table-column>
    <el-table-column
      prop="receipt_status"
      :label="t('purchaseReceipt.table.column.status')"
      width="100"
      align="center"
    >
      <template #default="scope">
        <el-tag :type="getReceiptStatusTagFmt(scope.row.receipt_status)">
          {{ getReceiptStatusLabelFmt(scope.row.receipt_status) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column
      prop="inspection_status"
      :label="t('purchaseReceipt.table.column.inspectionStatus')"
      width="100"
      align="center"
    >
      <template #default="scope">
        <el-tag :type="getReceiptInspectionStatusTagFmt(scope.row.inspection_status)">
          {{ getReceiptInspectionStatusLabelFmt(scope.row.inspection_status) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column
      prop="created_by_name"
      :label="t('purchaseReceipt.table.column.createdBy')"
      width="100"
    />
    <el-table-column
      prop="created_at"
      :label="t('purchaseReceipt.table.column.createdAt')"
      width="150"
    />
    <el-table-column :label="t('purchaseReceipt.table.column.action')" width="320" align="center">
      <template #default="scope">
        <el-button
          size="small"
          :aria-label="t('purchaseReceipt.table.aria.viewDetail')"
          @click="emit('view', scope.row as PurchaseReceiptEntity)"
        >
          <el-icon><View /></el-icon>
        </el-button>
        <el-button
          v-if="scope.row.receipt_status === RECEIPT_STATUS.DRAFT"
          size="small"
          type="primary"
          :aria-label="t('purchaseReceipt.table.aria.edit')"
          @click="emit('edit', scope.row as PurchaseReceiptEntity)"
        >
          <el-icon><Edit /></el-icon>
        </el-button>
        <!-- 收货确认入口：状态门与权限门各自独立——本岗无 confirm 键时不该看见一个必吃 403 的按钮 -->
        <el-button
          v-if="scope.row.receipt_status === RECEIPT_STATUS.DRAFT"
          v-permission="'purchase-receipts:confirm'"
          size="small"
          type="warning"
          data-testid="receipt-confirm-btn"
          @click="emit('approve', scope.row as PurchaseReceiptEntity)"
        >
          <el-icon><Check /></el-icon> {{ t('purchaseReceipt.table.button.approve') }}
        </el-button>
        <!--
          让步接收/复检改判通道入口：状态由词表常量 v-if 门控，
          操作权限由 v-permission 独立门控，两者缺一不可。
        -->
        <el-button
          v-if="
            scope.row.receipt_status === RECEIPT_STATUS.DRAFT &&
            (scope.row.inspection_status === RECEIPT_INSPECTION.PENDING ||
              scope.row.inspection_status === RECEIPT_INSPECTION.REJECTED)
          "
          v-permission="'purchase-receipts:concession'"
          size="small"
          type="warning"
          data-testid="receipt-concession-btn"
          @click="emit('concede', scope.row as PurchaseReceiptEntity)"
        >
          {{ t('purchaseReceipt.table.button.concession') }}
        </el-button>
        <el-button
          v-if="
            scope.row.receipt_status === RECEIPT_STATUS.DRAFT &&
            scope.row.inspection_status === RECEIPT_INSPECTION.CONCESSION_ACCEPTED
          "
          v-permission="'purchase-receipts:rejudge'"
          size="small"
          type="info"
          data-testid="receipt-rejudge-btn"
          @click="emit('rejudge', scope.row as PurchaseReceiptEntity)"
        >
          {{ t('purchaseReceipt.table.button.rejudge') }}
        </el-button>
        <el-button
          v-if="scope.row.receipt_status === RECEIPT_STATUS.DRAFT"
          size="small"
          type="danger"
          :aria-label="t('purchaseReceipt.table.aria.delete')"
          @click="emit('delete', scope.row as PurchaseReceiptEntity)"
        >
          <el-icon><Delete /></el-icon>
        </el-button>
      </template>
    </el-table-column>
  </el-table>

  <div class="pagination-container" :class="{ 'mobile-pagination': isPhone }">
    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50, 100]"
      :total="total"
      layout="total, sizes, prev, pager, next, jumper"
      :aria-label="t('purchaseReceipt.table.aria.pagination')"
      @update:current-page="(v: number) => emit('update:page', v)"
      @update:page-size="(v: number) => emit('update:page-size', v)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { View, Edit, Delete, Check } from '@element-plus/icons-vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { PurchaseReceiptEntity } from '@/api/purchase-receipt';
import {
  PURCHASE_RECEIPT_STATUS as RECEIPT_STATUS,
  PURCHASE_RECEIPT_INSPECTION_STATUS as RECEIPT_INSPECTION,
} from '@/utils/purchase-receipt-status';
import {
  getReceiptStatusLabel,
  getReceiptStatusTagType,
  getReceiptInspectionStatusLabel,
  getReceiptInspectionStatusTagType,
} from '../composables/prcFmts';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 采购入库列表组件（批次 285：page/pageSize props + v-model 绑定分页）
 */
defineProps<{
  // 列表数据
  data: PurchaseReceiptEntity[];
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
  view: [row: PurchaseReceiptEntity];
  edit: [row: PurchaseReceiptEntity];
  approve: [row: PurchaseReceiptEntity];
  concede: [row: PurchaseReceiptEntity];
  rejudge: [row: PurchaseReceiptEntity];
  delete: [row: PurchaseReceiptEntity];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

// 透传格式化函数
const getReceiptStatusLabelFmt = getReceiptStatusLabel;
const getReceiptStatusTagFmt = getReceiptStatusTagType;
const getReceiptInspectionStatusLabelFmt = getReceiptInspectionStatusLabel;
const getReceiptInspectionStatusTagFmt = getReceiptInspectionStatusTagType;
</script>

<style scoped>
.receipt-mobile {
  min-width: 0;
}
.order-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.order-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.order-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.order-fields > div {
  min-width: 0;
}
.order-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.order-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.order-number dd {
  font-weight: 600;
}
.order-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.order-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.pagination-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
.mobile-pagination {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.mobile-pagination :deep(button),
.mobile-pagination :deep(.el-pager li),
.mobile-pagination :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
