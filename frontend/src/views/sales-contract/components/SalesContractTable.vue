<!--
  SalesContractTable.vue - 销售合同列表表格
  拆分自 sales-contract/index.vue（P14 批 2 I-3 第 1 批）
  批次 284：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
  本次迁移：el-table + el-pagination → V2Table 虚拟滚动表格
-->
<template>
  <el-card shadow="hover" class="table-card">
    <section v-if="isPhone" v-loading="loading" class="contract-mobile">
      <ul class="contract-list" :aria-label="t('salesContract.table.mobileCardAria')">
        <li v-for="row in contractList" :key="row.id" class="contract-card">
          <dl class="contract-fields">
            <div class="contract-number">
              <dt>{{ t('salesContract.table.columnContractNo') }}</dt>
              <dd>{{ row.contract_no }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnContractName') }}</dt>
              <dd>{{ row.contract_name }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnCustomer') }}</dt>
              <dd>{{ row.customer_name }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnTotalAmount') }}</dt>
              <dd>
                {{ formatCurrency(row.total_amount == null ? null : Number(row.total_amount)) }}
              </dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnSignedDate') }}</dt>
              <dd>{{ row.signed_date }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnEffectiveDate') }}</dt>
              <dd>{{ row.effective_date }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnExpiryDate') }}</dt>
              <dd>{{ row.expiry_date }}</dd>
            </div>
            <div>
              <dt>{{ t('salesContract.table.columnStatus') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
              </dd>
            </div>
          </dl>
          <component :is="() => h('div', { class: 'contract-actions' }, buildActionButtons(row))" />
        </li>
      </ul>
      <ElEmpty
        v-if="!loading && contractList.length === 0"
        :description="t('components.v2Table.empty')"
      />
      <ElPagination
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, next"
        :aria-label="t('components.v2Table.paginationAriaLabel')"
        @current-change="(v: number) => emit('update:page', v)"
        @size-change="(v: number) => emit('update:page-size', v)"
      />
    </section>
    <V2Table
      v-else
      :columns="columns"
      :data="contractList"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :page-sizes="[10, 20, 50, 100]"
      :total="total"
      :height="600"
      @page-change="(v: number) => emit('update:page', v)"
      @size-change="(v: number) => emit('update:page-size', v)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed, h } from 'vue';
import { PERMISSIONS } from '@/constants/permissions';
import { useI18n } from 'vue-i18n';
import { ElButton, ElEmpty, ElPagination, ElTag } from 'element-plus';
import V2Table from '@/components/V2Table/index.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { ColumnDef } from '@/components/V2Table/types';
import type { SalesContract } from '@/api/sales-contract';
// P2-17 修复（批次 86 v2 复审）：h() 渲染函数无法使用 v-permission 指令，
// 改为复用 router 守卫的 hasRoutePermission + useUserStore 做权限判断，
// 行为与 v-permission 指令保持一致（无权限则不渲染该按钮）
import { hasRoutePermission } from '@/router';
import { useUserStore } from '@/store/user';
import { formatCurrency, getStatusType } from '../composables/scFmts';
import { salesContractStatusLabelKey } from '@/utils/sales-contract-status';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 权限检查辅助函数（与 v-permission 指令行为等价）
 * @param required 所需权限码
 * @returns 当前用户是否持有该权限
 */
const can = (required: string): boolean => {
  const userStore = useUserStore();
  const permissions = userStore.userInfo?.permissions || [];
  return hasRoutePermission(required, permissions);
};

/**
 * 获取合同状态标签（i18n 响应式：语言切换后自动重算）
 * 词表与配色出自 utils/sales-contract-status（后端 contract = draft/active/cancelled）；
 * 词表外取值由 normalize 抛错，不再 `|| status` 回显裸枚举。
 * @param status 合同状态码
 * @returns 状态对应的本地化标签
 */
const getStatusLabel = (status: string): string => {
  const key = salesContractStatusLabelKey(status);
  return key ? t(key) : '';
};

/**
 * 销售合同列表表格组件（批次 284：page/pageSize props + v-model 绑定分页）
 * 迁移至 V2Table 虚拟滚动表格，移除 el-table / el-pagination
 */
defineProps<{
  // 列表数据
  contractList: SalesContract[];
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
  view: [row: SalesContract];
  edit: [row: SalesContract];
  'submit-approval': [row: SalesContract];
  approve: [row: SalesContract];
  execute: [row: SalesContract];
  delete: [row: SalesContract];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

/**
 * 构建操作列按钮组（按 status 条件渲染不同按钮，编辑/删除受权限控制）
 * @param row 当前行数据
 * @returns 按钮 vnode 数组
 */
const mkBtn = (
  type: 'primary' | 'success' | 'warning' | 'danger',
  labelKey: string,
  onClick: () => void
) => h(ElButton, { type, link: true, size: 'small', onClick }, { default: () => t(labelKey) });

const buildActionButtons = (row: SalesContract): ReturnType<typeof h>[] => {
  const buttons: ReturnType<typeof h>[] = [
    mkBtn('primary', 'salesContract.table.buttonView', () => emit('view', row)),
  ];
  // 草稿状态：编辑 / 提交 / 删除（编辑/删除受权限控制）
  if (row.status === 'draft') {
    if (can(PERMISSIONS.SALES_CONTRACT_UPDATE)) {
      buttons.push(mkBtn('primary', 'salesContract.table.buttonEdit', () => emit('edit', row)));
    }
    buttons.push(
      mkBtn('success', 'salesContract.table.buttonSubmit', () => emit('submit-approval', row))
    );
    if (can(PERMISSIONS.SALES_CONTRACT_DELETE)) {
      buttons.push(mkBtn('danger', 'salesContract.table.buttonDelete', () => emit('delete', row)));
    }
  }
  // 审批：后端 sales_contract_service 仅接受草稿态合同审核（draft→active），无 pending 态
  if (row.status === 'draft') {
    buttons.push(mkBtn('success', 'salesContract.table.buttonApprove', () => emit('approve', row)));
  }
  // 执行中状态：执行
  if (row.status === 'active') {
    buttons.push(mkBtn('warning', 'salesContract.table.buttonExecute', () => emit('execute', row)));
  }
  return buttons;
};

/**
 * 列定义（computed 响应式：语言切换只改 i18n locale、不重挂载组件，
 * 非 computed 写法会让列标题冻在求值时的语言上；本仓多数派参照
 * views/logistics/components/LogisticsTable.vue::columns 与
 * views/production/components/ProductionTable.vue::columns 的同形写法）
 * - 合同金额：formatCurrency 格式化为人民币
 * - 状态：el-tag 渲染（类型由 getStatusType 映射）
 * - 操作列：按 status 条件渲染不同按钮组（编辑/删除受权限控制）
 */
const columns = computed<ColumnDef<SalesContract>[]>(() => [
  { key: 'contract_no', title: t('salesContract.table.columnContractNo'), width: 150 },
  { key: 'contract_name', title: t('salesContract.table.columnContractName'), minWidth: 200 },
  { key: 'customer_name', title: t('salesContract.table.columnCustomer'), width: 150 },
  {
    key: 'total_amount',
    title: t('salesContract.table.columnTotalAmount'),
    width: 120,
    align: 'right',
    // 后端 sales_contract.rs:17 total_amount=Option<Decimal> → JSON 字符串（或 null），
    // 前端类型如实声明 string | null（api/sales-contract.ts:12,25）；formatCurrency 只吃 number，
    // 故消费处 Number() 归一，null 透传由 formatCurrency 统一显示，禁止对字符串直接 .toFixed。
    formatter: row => formatCurrency(row.total_amount == null ? null : Number(row.total_amount)),
  },
  {
    key: 'signed_date',
    title: t('salesContract.table.columnSignedDate'),
    width: 120,
    align: 'center',
  },
  {
    key: 'effective_date',
    title: t('salesContract.table.columnEffectiveDate'),
    width: 120,
    align: 'center',
  },
  {
    key: 'expiry_date',
    title: t('salesContract.table.columnExpiryDate'),
    width: 120,
    align: 'center',
  },
  {
    key: 'status',
    title: t('salesContract.table.columnStatus'),
    width: 100,
    align: 'center',
    renderCell: row =>
      h(ElTag, { type: getStatusType(row.status) }, { default: () => getStatusLabel(row.status) }),
  },
  {
    key: '__actions__',
    title: t('salesContract.table.columnAction'),
    width: 250,
    fixed: 'right',
    align: 'center',
    renderCell: row => h('div', { class: 'action-cell' }, buildActionButtons(row)),
  },
]);
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.action-cell {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}
.contract-mobile {
  min-width: 0;
}
.contract-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.contract-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.contract-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.contract-fields > div {
  min-width: 0;
}
.contract-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.contract-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.contract-number dd {
  font-weight: 600;
}
.contract-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.contract-actions .el-button {
  min-height: 44px;
  margin: 0;
}
.contract-mobile :deep(.el-pagination) {
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.contract-mobile :deep(.el-pagination button),
.contract-mobile :deep(.el-pager li),
.contract-mobile :deep(.el-pagination__sizes .el-select__wrapper) {
  min-width: 44px;
  min-height: 44px;
}
</style>
