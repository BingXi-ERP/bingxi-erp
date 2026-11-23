<!--
  ReturnsTable.vue - 销售退货列表表格
  任务编号: P14 批 2 I-3 第 7 批
  拆分原 sales-returns/index.vue 的列表表格部分
-->
<template>
  <section v-if="isPhone" v-loading="loading" class="returns-mobile">
    <ul class="return-list" :aria-label="t('salesReturns.table.mobileCardAria')">
      <li v-for="row in list" :key="row.id" class="return-card">
        <dl class="return-fields">
          <div class="return-number">
            <dt>{{ t('salesReturns.table.columnReturnNo') }}</dt>
            <dd>{{ row.return_no }}</dd>
          </div>
          <div>
            <dt>{{ t('salesReturns.table.columnSalesOrderNo') }}</dt>
            <dd>{{ row.sales_order_no }}</dd>
          </div>
          <div>
            <dt>{{ t('salesReturns.table.columnCustomerName') }}</dt>
            <dd>{{ row.customer_name }}</dd>
          </div>
          <div>
            <dt>{{ t('salesReturns.table.columnReturnDate') }}</dt>
            <dd>{{ row.return_date }}</dd>
          </div>
          <div>
            <dt>{{ t('salesReturns.table.columnReturnAmount') }}</dt>
            <dd>{{ row.total_amount }}</dd>
          </div>
          <div>
            <dt>{{ t('salesReturns.table.columnStatus') }}</dt>
            <dd>
              <el-tag :type="getStatusType(row.status)">{{ getStatusLabel(row.status) }}</el-tag>
            </dd>
          </div>
        </dl>
        <div class="return-actions">
          <el-button size="small" @click="emit('view', row)">
            {{ t('salesReturns.table.buttonDetail') }}
          </el-button>
          <el-button
            v-permission="PERMISSIONS.SALES_RETURN_UPDATE"
            size="small"
            @click="emit('edit', row)"
          >
            {{ t('salesReturns.table.buttonEdit') }}
          </el-button>
          <el-button
            v-if="row.status === 'DRAFT'"
            size="small"
            type="primary"
            plain
            @click="emit('submit', row)"
          >
            {{ t('salesReturns.table.buttonSubmit') }}
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small"
            type="warning"
            plain
            @click="emit('reject', row)"
          >
            {{ t('salesReturns.table.buttonReject') }}
          </el-button>
          <el-button
            v-if="row.status === 'APPROVED'"
            size="small"
            type="success"
            @click="emit('execute', row)"
          >
            {{ t('salesReturns.table.buttonExecute') }}
          </el-button>
          <el-button
            v-if="row.status === 'SUBMITTED'"
            size="small"
            type="primary"
            @click="emit('approve', row)"
          >
            {{ t('salesReturns.table.buttonApprove') }}
          </el-button>
        </div>
      </li>
    </ul>
    <el-empty v-if="!loading && list.length === 0" :description="t('components.v2Table.empty')" />
  </section>
  <el-table
    v-else
    v-loading="loading"
    :data="list"
    border
    :aria-label="t('salesReturns.table.ariaLabel')"
  >
    <el-table-column prop="return_no" :label="t('salesReturns.table.columnReturnNo')" />
    <el-table-column prop="sales_order_no" :label="t('salesReturns.table.columnSalesOrderNo')" />
    <el-table-column prop="customer_name" :label="t('salesReturns.table.columnCustomerName')" />
    <el-table-column prop="return_date" :label="t('salesReturns.table.columnReturnDate')" />
    <el-table-column prop="total_amount" :label="t('salesReturns.table.columnReturnAmount')" />
    <el-table-column prop="status" :label="t('salesReturns.table.columnStatus')">
      <template #default="{ row }">
        <el-tag :type="getStatusType(row.status)">
          {{ getStatusLabel(row.status) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column :label="t('salesReturns.table.columnAction')" width="250">
      <template #default="{ row }">
        <el-button size="small" @click="emit('view', row)">{{
          t('salesReturns.table.buttonDetail')
        }}</el-button>
        <!-- P2-17 修复（批次 86 v2 复审）：编辑按钮补齐 v-permission -->
        <el-button
          v-permission="PERMISSIONS.SALES_RETURN_UPDATE"
          size="small"
          @click="emit('edit', row)"
          >{{ t('salesReturns.table.buttonEdit') }}</el-button
        >
        <el-button
          v-if="row.status === 'DRAFT'"
          size="small"
          type="primary"
          plain
          @click="emit('submit', row)"
          >{{ t('salesReturns.table.buttonSubmit') }}</el-button
        >
        <el-button
          v-if="row.status === 'SUBMITTED'"
          size="small"
          type="warning"
          plain
          @click="emit('reject', row)"
          >{{ t('salesReturns.table.buttonReject') }}</el-button
        >
        <el-button
          v-if="row.status === 'APPROVED'"
          size="small"
          type="success"
          @click="emit('execute', row)"
          >{{ t('salesReturns.table.buttonExecute') }}</el-button
        >
        <el-button
          v-if="row.status === 'SUBMITTED'"
          size="small"
          type="primary"
          @click="emit('approve', row)"
          >{{ t('salesReturns.table.buttonApprove') }}</el-button
        >
      </template>
    </el-table-column>
  </el-table>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { SalesReturn } from '@/api/sales-return';
import {
  salesReturnStatusLabelKey,
  salesReturnStatusTagType as getStatusType,
} from '@/utils/sales-return-status';
// Batch 462 P0-S24：引入权限码常量，与后端 sales-returns 资源对齐
import { PERMISSIONS } from '@/constants/permissions';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

defineProps<{
  list: SalesReturn[];
  loading: boolean;
}>();

const emit = defineEmits<{
  (e: 'view', row: SalesReturn): void;
  (e: 'edit', row: SalesReturn): void;
  (e: 'approve', row: SalesReturn): void;
  (e: 'submit', row: SalesReturn): void;
  (e: 'reject', row: SalesReturn): void;
  (e: 'execute', row: SalesReturn): void;
}>();

/** 退货状态标签：词表与标签键的单一来源在 utils/sales-return-status.ts */
const getStatusLabel = (status: string) => {
  const key = salesReturnStatusLabelKey(status);
  return key ? t(key) : '';
};
</script>

<style scoped>
.returns-mobile {
  min-width: 0;
}
.return-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
  list-style: none;
}
.return-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.return-fields {
  display: grid;
  gap: 12px;
  margin: 0 0 16px;
}
.return-fields > div {
  min-width: 0;
}
.return-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.return-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.return-number dd {
  font-weight: 600;
}
.return-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.return-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
</style>
