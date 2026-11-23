<!--
  ProductionTable.vue - 生产管理订单表（V2Table 包装）
  拆分自 production/index.vue（P14 批 2 I-3 第 4 批）
  行为完全保持一致（仅结构重构）

  P9-3 清理：原文件级 vue/no-mutating-props disable 注释已删除
  （本组件仅读取 props 传给 V2Table 并 emit 事件，无 prop mutation 行为）
-->
<template>
  <section v-if="isPhone" v-loading="loading" class="production-mobile">
    <ul class="production-list" :aria-label="t('production.table.mobileCardAria')">
      <li v-for="row in data" :key="row.id" class="production-card">
        <dl class="production-fields">
          <div class="production-number">
            <dt>{{ t('production.table.colOrderNo') }}</dt>
            <dd>{{ row.order_no }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colProductName') }}</dt>
            <dd>{{ row.product_name || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colPlannedQuantity') }}</dt>
            <dd>{{ row.planned_quantity }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colActualQuantity') }}</dt>
            <dd>{{ row.actual_quantity || '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colScheduledStart') }}</dt>
            <dd>{{ row.planned_start_date ? row.planned_start_date.substring(0, 10) : '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colScheduledEnd') }}</dt>
            <dd>{{ row.planned_end_date ? row.planned_end_date.substring(0, 10) : '-' }}</dd>
          </div>
          <div>
            <dt>{{ t('production.table.colStatus') }}</dt>
            <dd>
              <ElTag :type="getStatusType(row.status)" size="small">
                {{ statusLabel(row.status) }}
              </ElTag>
            </dd>
          </div>
          <div>
            <dt>{{ t('production.table.colPriority') }}</dt>
            <dd>{{ row.priority }}</dd>
          </div>
        </dl>
        <div class="production-actions">
          <ElButton v-if="canViewDetail" type="primary" @click="emit('view-detail', row)">
            {{ t('production.table.buttonView') }}
          </ElButton>
          <ElButton @click="emit('view-logs', row)">
            {{ t('production.table.mobile.buttonLogs') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'DRAFT'"
            type="warning"
            @click="emit('submit-approval', row)"
          >
            {{ t('production.table.mobile.buttonSubmitApproval') }}
          </ElButton>
          <ElButton
            v-if="
              row.status === 'DRAFT' && can(PERMISSIONS.PRODUCTION_ORDER_UPDATE) && canEditDetail
            "
            type="success"
            @click="emit('open-edit', row)"
          >
            {{ t('production.table.buttonEdit') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'DRAFT' && can(PERMISSIONS.PRODUCTION_ORDER_DELETE)"
            type="danger"
            @click="emit('delete', row)"
          >
            {{ t('production.table.buttonDelete') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'PENDING_APPROVAL'"
            type="success"
            @click="emit('approve-order', row, true)"
          >
            {{ t('production.table.mobile.buttonApprove') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'PENDING_APPROVAL'"
            type="danger"
            @click="emit('approve-order', row, false)"
          >
            {{ t('production.table.mobile.buttonReject') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'APPROVED'"
            type="warning"
            @click="emit('status-change', row, 'SCHEDULED')"
          >
            {{ t('production.table.buttonPlan') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'SCHEDULED'"
            type="primary"
            @click="emit('status-change', row, 'IN_PROGRESS')"
          >
            {{ t('production.table.buttonStartProduction') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'IN_PROGRESS'"
            type="success"
            @click="emit('status-change', row, 'COMPLETED')"
          >
            {{ t('production.table.buttonComplete') }}
          </ElButton>
          <ElButton
            v-if="row.status === 'IN_PROGRESS'"
            type="warning"
            @click="emit('report-progress', row)"
          >
            {{ t('production.table.mobile.buttonReportProgress') }}
          </ElButton>
        </div>
      </li>
    </ul>
    <ElEmpty v-if="!loading && data.length === 0" :description="t('components.v2Table.empty')" />
    <ElPagination
      :current-page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50]"
      :total="total"
      layout="total, sizes, prev, next"
      :aria-label="t('components.v2Table.paginationAriaLabel')"
      @current-change="(p: number) => emit('page-change', p)"
      @size-change="(s: number) => emit('size-change', s)"
    />
  </section>
  <V2Table
    v-else
    :columns="columns"
    :data="data"
    :loading="loading"
    :page="page"
    :page-size="pageSize"
    :total="total"
    :height="600"
    @page-change="(p: number) => emit('page-change', p)"
    @size-change="(s: number) => emit('size-change', s)"
  />
</template>

<script setup lang="ts">
import { h, computed } from 'vue';
import { PERMISSIONS } from '@/constants/permissions';
import { useI18n } from 'vue-i18n';
import { ElButton, ElEmpty, ElPagination, ElTag } from 'element-plus';
import V2Table from '@/components/V2Table/index.vue';
import type { ColumnDef } from '@/components/V2Table/types';
import type { ProductionOrder } from '@/api/production';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStatusLabel, getStatusType } from '../composables/prdFmts';
// P2-17 修复（批次 86 v2 复审）：h() 渲染函数无法使用 v-permission 指令，
// 改为复用 router 守卫的 hasRoutePermission + useUserStore 做权限判断，
// 行为与 v-permission 指令保持一致（无权限则不渲染该按钮）
import { hasRoutePermission, canAccessDetailPermission } from '@/router';
import { useUserStore } from '@/store/user';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

// 状态 el-tag 类型别名（与 element-plus 类型保持一致）

/** 权限检查辅助函数（与 v-permission 指令行为等价） */
const can = (required: string): boolean => {
  const userStore = useUserStore();
  const permissions = userStore.userInfo?.permissions || [];
  return hasRoutePermission(required, permissions);
};

// 详情/编辑入口回源 `/production/production-orders/orders/{id}`，该 URL 派生的权限资源段是
// production-orders（双层模块前缀跳段取 seg5="orders"，再按消歧映射对齐权威名）。
// 用 canAccessDetailPermission 与后端 matches_permission 同源判定，判为不可访问时移除入口。
const canViewDetail = computed(() => {
  const userStore = useUserStore();
  return canAccessDetailPermission(
    'production-orders',
    'read',
    userStore.userInfo?.permissions || []
  );
});
const canEditDetail = computed(() => {
  const userStore = useUserStore();
  return canAccessDetailPermission(
    'production-orders',
    'update',
    userStore.userInfo?.permissions || []
  );
});

const statusLabel = getStatusLabel;

defineProps<{
  data: ProductionOrder[];
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
  'view-detail': [row: ProductionOrder];
  'open-edit': [row: ProductionOrder];
  'status-change': [row: ProductionOrder, status: string];
  delete: [row: ProductionOrder];
  'submit-approval': [row: ProductionOrder];
  'approve-order': [row: ProductionOrder, approved: boolean];
  'report-progress': [row: ProductionOrder];
  'view-logs': [row: ProductionOrder];
}>();

/** 创建操作按钮 vnode（≤50 行） */
const renderActionButtons = (row: ProductionOrder): ReturnType<typeof h>[] => {
  // 后端状态机为大写（DRAFT/PENDING_APPROVAL/SCHEDULED/IN_PROGRESS/COMPLETED/REJECTED）
  const buttons: ReturnType<typeof h>[] = [];
  // 详情入口：与后端同源判定无 /{id} 权限时不渲染，避免出现点了必然 403 的死入口
  if (canViewDetail.value) {
    buttons.push(
      h(
        ElButton,
        { type: 'primary', link: true, size: 'small', onClick: () => emit('view-detail', row) },
        { default: () => t('production.table.buttonView') }
      )
    );
  }
  buttons.push(
    h(
      ElButton,
      { type: 'info', link: true, size: 'small', onClick: () => emit('view-logs', row) },
      { default: () => '日志' }
    )
  );
  const status = row.status;
  if (status === 'DRAFT') {
    buttons.push(
      h(
        ElButton,
        { type: 'warning', link: true, size: 'small', onClick: () => emit('submit-approval', row) },
        { default: () => '提交审批' }
      )
    );
  }
  if (status === 'PENDING_APPROVAL') {
    buttons.push(
      h(
        ElButton,
        {
          type: 'success',
          link: true,
          size: 'small',
          onClick: () => emit('approve-order', row, true),
        },
        { default: () => '审批通过' }
      ),
      h(
        ElButton,
        {
          type: 'danger',
          link: true,
          size: 'small',
          onClick: () => emit('approve-order', row, false),
        },
        { default: () => '驳回' }
      )
    );
  }
  if (status === 'IN_PROGRESS') {
    buttons.push(
      h(
        ElButton,
        { type: 'warning', link: true, size: 'small', onClick: () => emit('report-progress', row) },
        { default: () => '汇报进度' }
      )
    );
  }
  // 草稿可改可删；排产/开工/完工按状态机的下一步给出，
  // 目标状态取后端 PUT /status 白名单里的值（SCHEDULED/IN_PROGRESS/COMPLETED）
  if (status === 'DRAFT') {
    // 编辑入口提交 PUT /orders/{id}，后端对 resource_id=NULL 行拒绝；与后端同源判定后隐藏
    if (can(PERMISSIONS.PRODUCTION_ORDER_UPDATE) && canEditDetail.value) {
      buttons.push(
        h(
          ElButton,
          { type: 'success', link: true, size: 'small', onClick: () => emit('open-edit', row) },
          { default: () => t('production.table.buttonEdit') }
        )
      );
    }
    if (can(PERMISSIONS.PRODUCTION_ORDER_DELETE)) {
      buttons.push(
        h(
          ElButton,
          { type: 'danger', link: true, size: 'small', onClick: () => emit('delete', row) },
          { default: () => t('production.table.buttonDelete') }
        )
      );
    }
  }
  if (status === 'APPROVED') {
    buttons.push(
      h(
        ElButton,
        {
          type: 'warning',
          link: true,
          size: 'small',
          onClick: () => emit('status-change', row, 'SCHEDULED'),
        },
        { default: () => t('production.table.buttonPlan') }
      )
    );
  }
  if (status === 'SCHEDULED') {
    buttons.push(
      h(
        ElButton,
        {
          type: 'primary',
          link: true,
          size: 'small',
          onClick: () => emit('status-change', row, 'IN_PROGRESS'),
        },
        { default: () => t('production.table.buttonStartProduction') }
      )
    );
  }
  if (status === 'IN_PROGRESS') {
    buttons.push(
      h(
        ElButton,
        {
          type: 'success',
          link: true,
          size: 'small',
          onClick: () => emit('status-change', row, 'COMPLETED'),
        },
        { default: () => t('production.table.buttonComplete') }
      )
    );
  }
  return buttons;
};

/** 列定义：computed 确保 locale 切换时表头响应式更新 */
const columns = computed<ColumnDef<ProductionOrder>[]>(() => [
  { key: 'order_no', title: t('production.table.colOrderNo'), width: 160, fixed: 'left' },
  { key: 'product_name', title: t('production.table.colProductName'), minWidth: 160 },
  {
    key: 'planned_quantity',
    title: t('production.table.colPlannedQuantity'),
    width: 120,
    align: 'right',
  },
  {
    key: 'actual_quantity',
    title: t('production.table.colActualQuantity'),
    width: 120,
    align: 'right',
  },
  {
    key: 'planned_start_date',
    title: t('production.table.colScheduledStart'),
    width: 140,
    formatter: (row: ProductionOrder) =>
      row.planned_start_date ? row.planned_start_date.substring(0, 10) : '-',
  },
  {
    key: 'planned_end_date',
    title: t('production.table.colScheduledEnd'),
    width: 140,
    formatter: (row: ProductionOrder) =>
      row.planned_end_date ? row.planned_end_date.substring(0, 10) : '-',
  },
  {
    key: 'status',
    title: t('production.table.colStatus'),
    width: 120,
    align: 'center',
    renderCell: (row: ProductionOrder) =>
      h(ElTag, { type: getStatusType(row.status) }, { default: () => statusLabel(row.status) }),
  },
  { key: 'priority', title: t('production.table.colPriority'), width: 100, align: 'center' },
  {
    key: '__actions__',
    title: t('production.table.colAction'),
    width: 280,
    fixed: 'right',
    renderCell: (row: ProductionOrder) =>
      h('div', { class: 'action-cell' }, renderActionButtons(row)),
  },
]);
</script>

<style scoped>
.production-mobile {
  min-width: 0;
}
.production-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.production-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.production-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.production-fields > div {
  min-width: 0;
}
.production-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.production-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.production-number dd {
  font-weight: 600;
}
.production-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.production-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.production-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
</style>
