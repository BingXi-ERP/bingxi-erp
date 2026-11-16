<!--
  SalesOrderTable.vue - 销售订单列表 V2Table 包装（含操作列）
  拆分自 sales/views/OrderListView.vue（P14 批 2 I-3 第 3 批）
  行为完全保持一致（仅结构重构）
-->
<template>
  <el-card shadow="hover">
    <!-- W2.3 手机卡片（<768 与 BPM 审批手机卡片同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="sales-order-mobile">
      <ul class="order-list" :aria-label="t('sales.table.mobileCardAria')">
        <li v-for="row in data" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div class="order-number">
              <dt>{{ t('sales.table.orderNo') }}</dt>
              <dd>{{ row.order_no }}</dd>
            </div>
            <div>
              <dt>{{ t('sales.table.customer') }}</dt>
              <dd>{{ row.customer_name }}</dd>
            </div>
            <div>
              <dt>{{ t('sales.table.orderDate') }}</dt>
              <dd>{{ row.order_date }}</dd>
            </div>
            <div>
              <dt>{{ t('sales.table.totalAmount') }}</dt>
              <dd>{{ formatAmount(row.total_amount || 0) }}</dd>
            </div>
            <div>
              <dt>{{ t('sales.table.status') }}</dt>
              <dd>
                <ElTag :type="getStatusType(row.status)" size="small">
                  {{ getStatusText(row.status) }}
                </ElTag>
              </dd>
            </div>
          </dl>
          <div class="order-actions">
            <ElButton @click="emit('view', row)">{{ t('sales.table.view') }}</ElButton>
            <template v-if="canAccessOrderDetail">
              <ElButton @click="emit('detail', row)">{{ t('common.detail') }}</ElButton>
            </template>
            <ElButton
              v-if="row.status === 'draft' && canSubmitOrder"
              type="warning"
              @click="emit('submitOrder', row)"
            >
              {{ t('sales.table.submit') }}
            </ElButton>
            <ElButton
              v-if="row.status === 'draft' && canDeleteOrder"
              type="danger"
              @click="emit('deleteOrder', row)"
            >
              {{ t('sales.table.delete') }}
            </ElButton>
            <ElButton
              v-if="row.status === 'pending' && canApproveOrder"
              type="primary"
              @click="emit('approve', row)"
            >
              {{ t('sales.table.approve') }}
            </ElButton>
            <ElButton
              v-if="row.status === 'pending' && canRejectOrder"
              type="danger"
              @click="emit('reject', row)"
            >
              {{ t('sales.table.reject') }}
            </ElButton>
            <ElButton
              v-if="row.status === 'approved' || row.status === 'partial_shipped'"
              type="success"
              @click="emit('delivery', row)"
            >
              {{ t('sales.table.deliver') }}
            </ElButton>
            <ElButton
              v-if="row.status === 'approved' || row.status === 'partial_shipped'"
              type="primary"
              @click="emit('reserve', row)"
            >
              {{ t('sales.table.reserve') }}
            </ElButton>
            <ElButton
              v-if="
                (row.status === 'approved' || row.status === 'partial_shipped') &&
                canCreateBulkColor
              "
              type="primary"
              @click="emit('bulkColor', row)"
            >
              {{ t('sales.table.bulkColor') }}
            </ElButton>
            <ElButton
              v-if="(row.status === 'pending' || row.status === 'approved') && canCancelOrder"
              type="danger"
              @click="emit('cancel', row)"
            >
              {{ t('sales.table.cancel') }}
            </ElButton>
            <ElButton
              v-if="canConvertContract && isConvertible(row.status)"
              type="primary"
              @click="emit('convertContract', row)"
            >
              {{ t('sales.table.convertContract') }}
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
        @current-change="(v: number) => emit('page-change', v)"
        @size-change="(v: number) => emit('size-change', v)"
      />
    </section>
    <V2Table
      v-else
      :columns="fullColumns"
      :data="data"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      :height="600"
      @page-change="emit('page-change', $event)"
      @size-change="emit('size-change', $event)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElButton, ElEmpty, ElPagination, ElTag } from 'element-plus';
import V2Table from '@/components/V2Table/index.vue';
import type { ColumnDef } from '@/components/V2Table/types';
import type { SalesOrder } from '@/api/sales';
import { useUserStore } from '@/store/user';
import { canAccessDetailPermission, hasRoutePermission } from '@/router';
import { PERMISSIONS } from '@/constants/permissions';
import { SALES_ORDER_CONVERTIBLE_TO_CONTRACT_STATUSES } from '@/utils/sales-status';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStatusType, getStatusText, formatAmount } from '../composables/olvFmts';

const { t } = useI18n({ useScope: 'global' });
const userStore = useUserStore();
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
const isConvertible = (status: string) =>
  (SALES_ORDER_CONVERTIBLE_TO_CONTRACT_STATUSES as readonly string[]).includes(status);

// "详情"回源 GET `/sales/orders/{id}`，该 URL 派生的权限资源段是 orders（sales 只是模块前缀，
// 消歧映射未登记 sales+orders，保留 URL 段原名）。用 canAccessDetailPermission 与后端
// matches_permission 同源判定，判为不可访问时移除入口；"查看"用列表已有行，不隐藏。
const canAccessOrderDetail = computed(() =>
  canAccessDetailPermission('orders', 'read', userStore.userInfo?.permissions || [])
);

// 「发起批色」复用批色模块既有建单门（路由 meta.permission = inventory:read），不新增权限键；
// 与 v-permission 指令同源（列表级宽松匹配 hasRoutePermission），无权限者不渲染该入口。
const canCreateBulkColor = computed(() =>
  hasRoutePermission(PERMISSIONS.INVENTORY_READ, userStore.userInfo?.permissions || [])
);

// 「转合同」入口与后端转换门同源的可见性判定：
// 1) 权限：转换端点运行期派生 sales-contracts:create（POST /sales/sales-contracts/from-order/{id}，
//    末段非动作关键字按方法派生 create），无该键者不渲染（点了必 403 的死入口）。
// 2) 状态：仅放行「已审核起活跃态」approved/partial_shipped/shipped/completed，与后端
//    sales_contract_convert_service::ensure_convertible_status 逐态一致（集合取自
//    utils/sales-status 前端单源，draft/pending 未审核、cancelled/rejected 失效均不给入口）。
//    是否已转（重复转换）由对话框打开 preview 后按 existing_contract 提示，按钮侧不预判
//    （避免列表多打一次 preview）。
const canConvertContract = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_CONTRACT_CREATE, userStore.userInfo?.permissions || [])
);

// 行级动作按钮的双判据（状态 && 权限码）所消费的权限列表，与后端 matches_permission 同源。
const userPermissions = computed(() => userStore.userInfo?.permissions || []);

// 提交/撤销/删除归建单人（sales_rep），handler 内 assert_order_ownership 兜行级越权；
// 审批/驳回归 sales_manager（SoD 建审分离）。无权限者不渲染入口，与 v-permission 指令同源口径。
const canSubmitOrder = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_ORDER_SUBMIT, userPermissions.value)
);
const canDeleteOrder = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_ORDER_DELETE, userPermissions.value)
);
const canApproveOrder = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_ORDER_APPROVE, userPermissions.value)
);
const canRejectOrder = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_ORDER_REJECT, userPermissions.value)
);
const canCancelOrder = computed(() =>
  hasRoutePermission(PERMISSIONS.SALES_ORDER_CANCEL, userPermissions.value)
);

/**
 * 销售订单列表 V2Table 包装组件
 * - 列定义由父组件通过 columns prop 传入（来自 useOlv.composables）
 * - 操作列在本组件内部组装（查看 / 审批 / 发货 / 取消 按状态条件渲染）
 */
const props = defineProps<{
  // 列定义（不含操作列）
  columns: ColumnDef<SalesOrder>[];
  // 列表数据
  data: SalesOrder[];
  // 加载状态
  loading: boolean;
  // 当前页
  page: number;
  // 每页大小
  pageSize: number;
  // 总数
  total: number;
}>();

const emit = defineEmits<{
  'page-change': [page: number];
  'size-change': [size: number];
  view: [row: SalesOrder];
  approve: [row: SalesOrder];
  delivery: [row: SalesOrder];
  reserve: [row: SalesOrder];
  bulkColor: [row: SalesOrder];
  cancel: [row: SalesOrder];
  submitOrder: [row: SalesOrder];
  reject: [row: SalesOrder];
  deleteOrder: [row: SalesOrder];
  detail: [row: SalesOrder];
  convertContract: [row: SalesOrder];
}>();

/** 组装完整列定义：父列 + 操作列 */
const fullColumns = computed<ColumnDef<SalesOrder>[]>(() => [
  ...props.columns,
  {
    key: '__actions__',
    title: t('sales.table.operation'),
    // 操作列按钮按状态条件渲染且同行并列：已审批/部分发货态最多 6 个按钮
    // （查看/详情/发货/预留库存/发起批色/取消），其中「预留库存」「发起批色」为四字标签；
    // 原 430 按旧最多按钮行取值，新增「发起批色」入口后需再加宽避免 fixed 列内溢出换行；
    // 再叠加「转合同」三字入口，活跃态最多 7 个按钮，宽度续加。
    width: 600,
    fixed: 'right',
    renderCell: (row: SalesOrder) => {
      const buttons = [
        h(
          ElButton,
          { size: 'small', link: true, onClick: () => emit('view', row) },
          { default: () => t('sales.table.view') }
        ),
      ];
      // 详情入口回源 /sales/orders/{id}，后端对非管理员的 resource_id=NULL 权限行拒绝，
      // 与后端同源判定无权限时不渲染（隐藏）该按钮，避免出现点了必然 403 的死入口
      if (canAccessOrderDetail.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              onClick: () => emit('detail', row),
            },
            { default: () => t('common.detail') }
          )
        );
      }
      if (row.status === 'draft' && canSubmitOrder.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'warning',
              onClick: () => emit('submitOrder', row),
            },
            { default: () => t('sales.table.submit') }
          )
        );
      }
      if (row.status === 'draft' && canDeleteOrder.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'danger',
              onClick: () => emit('deleteOrder', row),
            },
            { default: () => t('sales.table.delete') }
          )
        );
      }
      // 待审核（提交后由后端写入 pending）：审核与驳回都只在这个状态下可用
      if (row.status === 'pending' && canApproveOrder.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'primary',
              onClick: () => emit('approve', row),
            },
            { default: () => t('sales.table.approve') }
          )
        );
      }
      if (row.status === 'pending' && canRejectOrder.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'danger',
              onClick: () => emit('reject', row),
            },
            { default: () => t('sales.table.reject') }
          )
        );
      }
      // 发货门已放行 partial_shipped（后端支持分批续发），按钮须同步在部分发货态可见，
      // 否则续发在列表上不可达。终态 shipped、completed、cancelled 仍隐藏。
      if (row.status === 'approved' || row.status === 'partial_shipped') {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'success',
              onClick: () => emit('delivery', row),
            },
            { default: () => t('sales.table.deliver') }
          )
        );
      }
      // 预留库存仅对可履约订单有意义：已审批/部分发货可预留；
      // 草稿/待审/已发货/完成/取消/驳回均不渲染该入口
      if (row.status === 'approved' || row.status === 'partial_shipped') {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'primary',
              onClick: () => emit('reserve', row),
            },
            { default: () => t('sales.table.reserve') }
          )
        );
        // 发起批色：同属可履约订单动作，且须持有批色建单门（复用 inventory:read，不新增权限键）
        if (canCreateBulkColor.value) {
          buttons.push(
            h(
              ElButton,
              {
                size: 'small',
                link: true,
                type: 'primary',
                onClick: () => emit('bulkColor', row),
              },
              { default: () => t('sales.table.bulkColor') }
            )
          );
        }
      }
      if ((row.status === 'pending' || row.status === 'approved') && canCancelOrder.value) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'danger',
              onClick: () => emit('cancel', row),
            },
            { default: () => t('sales.table.cancel') }
          )
        );
      }
      // 转合同入口：仅「已审核起活跃态」且持 sales-contracts:create 才渲染，与后端转换门同源。
      // 重复转换不在这里预判，点开后 preview 命中既有非终态合同会给跳转提示并禁用提交。
      if (
        canConvertContract.value &&
        (SALES_ORDER_CONVERTIBLE_TO_CONTRACT_STATUSES as readonly string[]).includes(row.status)
      ) {
        buttons.push(
          h(
            ElButton,
            {
              size: 'small',
              link: true,
              type: 'primary',
              onClick: () => emit('convertContract', row),
            },
            { default: () => t('sales.table.convertContract') }
          )
        );
      }
      return h('div', { class: 'action-cell' }, buttons);
    },
  },
]);
</script>

<style scoped>
.action-cell {
  display: flex;
  gap: 4px;
  align-items: center;
}

/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.sales-order-mobile {
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
.sales-order-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.sales-order-mobile :deep(.el-pagination button),
.sales-order-mobile :deep(.el-pager li),
.sales-order-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
