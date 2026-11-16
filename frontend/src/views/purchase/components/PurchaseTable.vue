<!--
  PurchaseTable - 采购管理数据表格（纯展示）
  任务编号: P13 批 1 B3 I-1（拆分 purchase/index.vue 主表格）
  P9-3 批次 F Pattern A 重构：本地 ref 镜像 + watch 防循环 + emit 整体覆盖父组件
-->
<template>
  <el-card shadow="hover" class="table-card">
    <!-- W2.3 手机卡片（<768 与 BPM 审批手机卡片同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="purchase-mobile">
      <ul class="order-list" :aria-label="t('purchase.table.mobileCardAria')">
        <li v-for="row in orders" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div class="order-number">
              <dt>{{ t('purchase.table.colOrderNo') }}</dt>
              <dd>
                <el-link type="primary" @click="onView(row)">{{ row.order_no }}</el-link>
              </dd>
            </div>
            <div>
              <dt>{{ t('purchase.table.colSupplier') }}</dt>
              <dd>{{ row.supplier_name ?? '-' }}</dd>
            </div>
            <div>
              <dt>{{ t('purchase.table.colOrderDate') }}</dt>
              <dd>{{ row.order_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchase.table.colTotalAmount') }}</dt>
              <dd>{{ formatAmount(row.total_amount) }}</dd>
            </div>
            <div>
              <dt>{{ t('purchase.table.colStatus') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </dd>
            </div>
          </dl>
          <div class="order-actions">
            <el-button v-if="canDetail" @click="onView(row)">
              {{ t('purchase.table.detail') }}
            </el-button>
            <el-button
              v-if="isEditableStatus(row.status) && canUpdate"
              type="warning"
              @click="onSubmitOrder(row)"
            >
              {{ t('purchase.table.submit') }}
            </el-button>
            <el-button v-if="isEditableStatus(row.status) && canUpdate" @click="onEdit(row)">
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="row.status === PURCHASE_ORDER_STATUS.DRAFT && canDelete"
              type="danger"
              @click="onDeleteOrder(row)"
            >
              {{ t('common.delete') }}
            </el-button>
            <el-button
              v-if="
                (row.status === PURCHASE_ORDER_STATUS.APPROVED ||
                  row.status === PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED) &&
                canReceive
              "
              type="warning"
              @click="onReceive(row)"
            >
              {{ t('purchase.table.receive') }}
            </el-button>
            <el-button
              v-if="row.status === PURCHASE_ORDER_STATUS.PENDING_APPROVAL && canApprove"
              type="success"
              @click="onApprove(row)"
            >
              {{ t('purchase.table.approve') }}
            </el-button>
            <el-button
              v-if="row.status === PURCHASE_ORDER_STATUS.PENDING_APPROVAL"
              type="danger"
              @click="onReject(row)"
            >
              {{ t('purchase.table.reject') }}
            </el-button>
          </div>
        </li>
      </ul>
      <ElEmpty
        v-if="!loading && orders.length === 0"
        :description="t('components.v2Table.empty')"
      />
      <ElPagination
        v-model:current-page="localQueryParams.page"
        v-model:page-size="localQueryParams.page_size"
        :page-sizes="[10, 20, 50]"
        :total="total"
        layout="total, sizes, prev, next"
        :aria-label="t('purchase.table.paginationAria')"
        @size-change="onQuery"
        @current-change="onQuery"
      />
    </section>
    <el-table
      v-else
      v-loading="loading"
      :data="orders"
      stripe
      :aria-label="t('purchase.table.listAria')"
    >
      <el-table-column prop="order_no" :label="t('purchase.table.colOrderNo')" width="160" fixed>
        <template #default="{ row }">
          <el-link type="primary" @click="onView(row as PurchaseOrder)">{{ row.order_no }}</el-link>
        </template>
      </el-table-column>
      <el-table-column
        prop="supplier_name"
        :label="t('purchase.table.colSupplier')"
        width="180"
        fixed
      />
      <el-table-column prop="order_date" :label="t('purchase.table.colOrderDate')" width="120" />
      <el-table-column
        prop="expected_delivery_date"
        :label="t('purchase.table.colRequiredDate')"
        width="120"
      />
      <el-table-column
        prop="total_amount"
        :label="t('purchase.table.colTotalAmount')"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          <span class="amount"
            >¥{{
              Number(row.total_amount).toLocaleString('zh-CN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            }}</span
          >
        </template>
      </el-table-column>
      <el-table-column
        prop="received_amount"
        :label="t('purchase.table.colReceivedAmount')"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          <span>¥{{ row.received_amount }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="payment_status"
        :label="t('purchase.table.colPaymentStatus')"
        width="100"
      >
        <template #default="{ row }">
          <el-tag :type="getPaymentStatusType(row.payment_status)" size="small">
            {{ getPaymentStatusText(row.payment_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="t('purchase.table.colStatus')" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="creator_name" :label="t('purchase.table.colCreator')" width="100" />
      <el-table-column :label="t('purchase.table.colOperation')" width="320" fixed="right">
        <template #default="{ row }">
          <el-button
            v-permission-detail="{ resource: 'purchase-orders', action: 'read' }"
            type="primary"
            link
            size="small"
            @click="onView(row as PurchaseOrder)"
            >{{ t('purchase.table.detail') }}</el-button
          >
          <el-button
            v-if="isEditableStatus(row.status)"
            type="warning"
            link
            size="small"
            @click="onSubmitOrder(row as PurchaseOrder)"
            >{{ t('purchase.table.submit') }}</el-button
          >
          <el-button
            v-if="isEditableStatus(row.status)"
            v-permission-detail="{ resource: 'purchase-orders', action: 'update' }"
            type="primary"
            link
            size="small"
            @click="onEdit(row as PurchaseOrder)"
            >{{ t('common.edit') }}</el-button
          >
          <el-button
            v-if="row.status === PURCHASE_ORDER_STATUS.DRAFT"
            type="danger"
            link
            size="small"
            @click="onDeleteOrder(row as PurchaseOrder)"
            >{{ t('common.delete') }}</el-button
          >
          <el-button
            v-if="
              row.status === PURCHASE_ORDER_STATUS.APPROVED ||
              row.status === PURCHASE_ORDER_STATUS.PARTIAL_RECEIVED
            "
            v-permission="PERMISSIONS.PURCHASE_RECEIPT_CREATE"
            type="warning"
            link
            size="small"
            @click="onReceive(row as PurchaseOrder)"
            >{{ t('purchase.table.receive') }}</el-button
          >
          <el-button
            v-if="row.status === PURCHASE_ORDER_STATUS.PENDING_APPROVAL"
            v-permission="PERMISSIONS.PURCHASE_ORDER_APPROVE"
            type="success"
            link
            size="small"
            @click="onApprove(row as PurchaseOrder)"
            >{{ t('purchase.table.approve') }}</el-button
          >
          <el-button
            v-if="row.status === PURCHASE_ORDER_STATUS.PENDING_APPROVAL"
            type="danger"
            link
            size="small"
            @click="onReject(row as PurchaseOrder)"
            >{{ t('purchase.table.reject') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-wrapper">
      <el-pagination
        v-model:current-page="localQueryParams.page"
        v-model:page-size="localQueryParams.page_size"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        :aria-label="t('purchase.table.paginationAria')"
        @size-change="onQuery"
        @current-change="onQuery"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElEmpty, ElPagination } from 'element-plus';
import type { PurchaseOrder, PurchaseOrderQueryParams } from '@/api/purchase';
// Batch 468 P0-S28：引入权限码常量，与后端 purchase-orders 资源对齐
import { PERMISSIONS } from '@/constants/permissions';
// 行内操作的状态门槛以后端真实词表值为比较对象：
// 提交/修改在后端允许 DRAFT 与 REJECTED（po/contract.rs submit_order、
// order_ops/crud.rs validate_order_modification），删除仅 DRAFT（delete_order），
// 审批/驳回仅 PENDING_APPROVAL（po/contract.rs approve_order/reject_order）
import { PURCHASE_ORDER_STATUS, type PurchaseOrderStatus } from '@/utils/purchase-status';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { hasRoutePermission, canAccessDetailPermission } from '@/router';
import { useUserStore } from '@/store/user';

// 接入 i18n，替换硬编码中文文案
const { t } = useI18n({ useScope: 'global' });

// W2.3 手机卡片断点与权限判定（与桌面列 v-permission/v-permission-detail 同源口径）
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
const userStore = useUserStore();
const userPermissions = computed(() => userStore.userInfo?.permissions || []);
const canDetail = computed(() =>
  canAccessDetailPermission('purchase-orders', 'read', userPermissions.value)
);
const canUpdate = computed(() =>
  hasRoutePermission(PERMISSIONS.PURCHASE_ORDER_UPDATE, userPermissions.value)
);
const canDelete = computed(() =>
  hasRoutePermission(PERMISSIONS.PURCHASE_ORDER_DELETE, userPermissions.value)
);
const canReceive = computed(() =>
  hasRoutePermission(PERMISSIONS.PURCHASE_RECEIPT_CREATE, userPermissions.value)
);
const canApprove = computed(() =>
  hasRoutePermission(PERMISSIONS.PURCHASE_ORDER_APPROVE, userPermissions.value)
);
const formatAmount = (value: number) =>
  `¥${(Number(value) || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** 可提交/可修改状态（后端允许草稿与被驳回两种） */
const EDITABLE_STATUSES: PurchaseOrderStatus[] = [
  PURCHASE_ORDER_STATUS.DRAFT,
  PURCHASE_ORDER_STATUS.REJECTED,
];
const isEditableStatus = (status: string) =>
  EDITABLE_STATUSES.includes(status as PurchaseOrderStatus);

const props = defineProps<{
  // 采购订单列表
  orders: PurchaseOrder[];
  // 加载状态
  loading: boolean;
  // 总数
  total: number;
  // 查询参数（分页相关，由父组件管理，子组件通过 emit('update:queryParams') 回写）
  queryParams: PurchaseOrderQueryParams;
  // 查看
  onView: (row: PurchaseOrder) => void;
  // 审批
  onApprove: (row: PurchaseOrder) => void;
  // 收货
  onReceive: (row: PurchaseOrder) => void;
  // 提交审批（draft 态）
  onSubmitOrder: (row: PurchaseOrder) => void;
  // 驳回（submitted 态）
  onReject: (row: PurchaseOrder) => void;
  // 编辑
  onEdit: (row: PurchaseOrder) => void;
  // 删除（draft 态）
  onDeleteOrder: (row: PurchaseOrder) => void;
  // 查询回调
  onQuery: () => void;
  // 状态类型
  getStatusType: (s: string) => string;
  // 状态文本
  getStatusText: (s: string) => string;
  // 付款状态类型
  getPaymentStatusType: (s: string) => string;
  // 付款状态文本
  getPaymentStatusText: (s: string) => string;
}>();

const emit = defineEmits<{
  // 整体回写查询参数（父组件监听此事件并 Object.assign 到自己的 queryParams）
  (e: 'update:queryParams', queryParams: PurchaseOrderQueryParams): void;
}>();

// 本地镜像：避免直接修改 prop 触发 vue/no-mutating-props
const localQueryParams = ref<PurchaseOrderQueryParams>({ ...props.queryParams });

// 同步标志位：防止 prop → local 与 local → emit 形成循环
let syncing = false;

// 外部 prop 变化时同步到 local（如父组件重置）
watch(
  () => props.queryParams,
  newParams => {
    if (syncing) return;
    syncing = true;
    localQueryParams.value = { ...newParams };
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);

// 本地变化时通知父组件（用户分页）
watch(
  localQueryParams,
  newParams => {
    if (syncing) return;
    syncing = true;
    emit('update:queryParams', { ...newParams });
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);
</script>

<style scoped>
/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.purchase-mobile {
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
.purchase-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.purchase-mobile :deep(.el-pagination button),
.purchase-mobile :deep(.el-pager li),
.purchase-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
