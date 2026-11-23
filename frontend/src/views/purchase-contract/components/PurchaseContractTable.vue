<!--
  PurchaseContractTable.vue - 采购合同列表表格
  拆分自 purchase-contract/index.vue（P14 批 2 I-3 第 3 批）
  批次 284：接入 useTableApi 模式（page/pageSize props + v-model 绑定分页）
-->
<template>
  <el-card shadow="hover" class="table-card">
    <!-- 手机卡片（<768 与采购管理表格同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="contract-mobile">
      <ul
        v-if="contractList.length > 0"
        class="order-list"
        :aria-label="t('purchaseContract.table.mobileCardAria')"
      >
        <li v-for="row in contractList" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div class="order-number">
              <dt>{{ t('purchaseContract.table.colContractNo') }}</dt>
              <dd>{{ row.contract_no }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colContractName') }}</dt>
              <dd>{{ row.contract_name }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colSupplier') }}</dt>
              <dd>{{ row.supplier_name }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colTotalAmount') }}</dt>
              <dd>{{ formatCurrency(row.total_amount) }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colSignedDate') }}</dt>
              <dd>{{ row.signed_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colEffectiveDate') }}</dt>
              <dd>{{ row.effective_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colExpiryDate') }}</dt>
              <dd>{{ row.expiry_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseContract.table.colStatus') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
              </dd>
            </div>
          </dl>
          <div class="order-actions">
            <el-button type="primary" link @click="emit('view', row as PurchaseContract)">
              {{ t('purchaseContract.table.view') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              v-permission="PERMISSIONS.PURCHASE_CONTRACT_UPDATE"
              type="primary"
              link
              @click="emit('edit', row as PurchaseContract)"
            >
              {{ t('purchaseContract.table.edit') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              type="success"
              link
              @click="emit('submit', row as PurchaseContract)"
            >
              {{ t('purchaseContract.table.submit') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              type="success"
              link
              @click="emit('approve', row as PurchaseContract)"
            >
              {{ t('purchaseContract.table.approve') }}
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              type="warning"
              link
              @click="emit('execute', row as PurchaseContract)"
            >
              {{ t('purchaseContract.table.execute') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              v-permission="PERMISSIONS.PURCHASE_CONTRACT_DELETE"
              type="danger"
              link
              @click="emit('delete', row as PurchaseContract)"
            >
              {{ t('purchaseContract.table.delete') }}
            </el-button>
          </div>
        </li>
      </ul>
      <el-empty v-else :description="t('purchaseContract.table.mobileEmpty')" />
    </section>

    <el-table
      v-else
      v-loading="loading"
      :data="contractList"
      border
      stripe
      :aria-label="t('purchaseContract.table.listAria')"
    >
      <el-table-column
        type="index"
        :label="t('purchaseContract.table.colIndex')"
        width="60"
        align="center"
      />
      <el-table-column
        prop="contract_no"
        :label="t('purchaseContract.table.colContractNo')"
        width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="contract_name"
        :label="t('purchaseContract.table.colContractName')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column
        prop="supplier_name"
        :label="t('purchaseContract.table.colSupplier')"
        width="150"
        show-overflow-tooltip
      />
      <el-table-column
        prop="total_amount"
        :label="t('purchaseContract.table.colTotalAmount')"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          {{ formatCurrency(row.total_amount) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="signed_date"
        :label="t('purchaseContract.table.colSignedDate')"
        width="120"
        align="center"
      />
      <el-table-column
        prop="effective_date"
        :label="t('purchaseContract.table.colEffectiveDate')"
        width="120"
        align="center"
      />
      <el-table-column
        prop="expiry_date"
        :label="t('purchaseContract.table.colExpiryDate')"
        width="120"
        align="center"
      />
      <el-table-column
        prop="status"
        :label="t('purchaseContract.table.colStatus')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('purchaseContract.table.colOperation')"
        width="250"
        align="center"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            type="primary"
            link
            size="small"
            @click="emit('view', row as PurchaseContract)"
            >{{ t('purchaseContract.table.view') }}</el-button
          >
          <!-- P2-17 修复（批次 86 v2 复审）：编辑/删除按钮补齐 v-permission -->
          <el-button
            v-if="row.status === 'draft'"
            v-permission="PERMISSIONS.PURCHASE_CONTRACT_UPDATE"
            type="primary"
            link
            size="small"
            @click="emit('edit', row as PurchaseContract)"
            >{{ t('purchaseContract.table.edit') }}</el-button
          >
          <el-button
            v-if="row.status === 'draft'"
            type="success"
            link
            size="small"
            @click="emit('submit', row as PurchaseContract)"
            >{{ t('purchaseContract.table.submit') }}</el-button
          >
          <el-button
            v-if="row.status === 'draft'"
            type="success"
            link
            size="small"
            @click="emit('approve', row as PurchaseContract)"
            >{{ t('purchaseContract.table.approve') }}</el-button
          >
          <el-button
            v-if="row.status === 'active'"
            type="warning"
            link
            size="small"
            @click="emit('execute', row as PurchaseContract)"
            >{{ t('purchaseContract.table.execute') }}</el-button
          >
          <el-button
            v-if="row.status === 'draft'"
            v-permission="PERMISSIONS.PURCHASE_CONTRACT_DELETE"
            type="danger"
            link
            size="small"
            @click="emit('delete', row as PurchaseContract)"
            >{{ t('purchaseContract.table.delete') }}</el-button
          >
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
        :aria-label="t('purchaseContract.table.paginationAria')"
        @update:current-page="(v: number) => emit('update:page', v)"
        @update:page-size="(v: number) => emit('update:page-size', v)"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { PERMISSIONS } from '@/constants/permissions';
import type { PurchaseContract } from '@/api/purchase-contract';
import { formatCurrency, getStatusType, getStatusLabel } from '../composables/pcFmts';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 采购合同列表表格组件（批次 284：page/pageSize props + v-model 绑定分页）
 */
defineProps<{
  // 列表数据
  contractList: PurchaseContract[];
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
  view: [row: PurchaseContract];
  edit: [row: PurchaseContract];
  submit: [row: PurchaseContract];
  approve: [row: PurchaseContract];
  execute: [row: PurchaseContract];
  delete: [row: PurchaseContract];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.contract-mobile {
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
