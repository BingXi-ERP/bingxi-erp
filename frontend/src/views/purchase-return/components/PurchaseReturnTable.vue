<!--
  PurchaseReturnTable.vue - 采购退货列表表格
  任务编号: P14 批 2 I-3 第 2 批（拆分原 purchase-return/index.vue）
  批次 286：page/pageSize props + v-model 绑定分页
-->
<template>
  <el-card class="table-card">
    <!-- 手机卡片（<768 与采购管理表格同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="return-mobile">
      <ul class="order-list" :aria-label="t('purchaseReturn.table.mobileCardAria')">
        <li v-for="row in tableData" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div class="order-number">
              <dt>{{ t('purchaseReturn.table.column.returnNo') }}</dt>
              <dd>{{ row.return_no }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.purchaseOrderNo') }}</dt>
              <dd>{{ row.purchase_order_no }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.supplier') }}</dt>
              <dd>{{ row.supplier_name }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.returnDate') }}</dt>
              <dd>{{ row.return_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.returnAmount') }}</dt>
              <dd class="amount">¥{{ row.total_amount }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.status') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.return_status)">
                  {{ getStatusText(row.return_status) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('purchaseReturn.table.column.reason') }}</dt>
              <dd>{{ row.reason_detail }}</dd>
            </div>
          </dl>
          <div class="order-actions">
            <el-button type="primary" link @click="emit('view', row as PurchaseReturn)">
              {{ t('purchaseReturn.table.button.view') }}
            </el-button>
            <el-button
              v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
              type="primary"
              link
              @click="emit('edit', row as PurchaseReturn)"
            >
              {{ t('purchaseReturn.table.button.edit') }}
            </el-button>
            <el-button
              v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
              type="warning"
              link
              @click="emit('submit', row as PurchaseReturn)"
            >
              {{ t('purchaseReturn.table.button.submit') }}
            </el-button>
            <el-button
              v-if="row.return_status === PURCHASE_RETURN_STATUS.SUBMITTED"
              type="success"
              link
              @click="emit('approve', row as PurchaseReturn)"
            >
              {{ t('purchaseReturn.table.button.approve') }}
            </el-button>
            <el-button
              v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
              type="danger"
              link
              @click="emit('delete', row as PurchaseReturn)"
            >
              {{ t('purchaseReturn.table.button.delete') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-else
      v-loading="loading"
      :data="tableData"
      border
      stripe
      :aria-label="t('purchaseReturn.table.aria.list')"
    >
      <el-table-column
        prop="return_no"
        :label="t('purchaseReturn.table.column.returnNo')"
        min-width="140"
      />
      <el-table-column
        prop="purchase_order_no"
        :label="t('purchaseReturn.table.column.purchaseOrderNo')"
        min-width="140"
      />
      <el-table-column
        prop="supplier_name"
        :label="t('purchaseReturn.table.column.supplier')"
        min-width="150"
      />
      <el-table-column
        prop="return_date"
        :label="t('purchaseReturn.table.column.returnDate')"
        min-width="120"
      />
      <el-table-column
        prop="total_amount"
        :label="t('purchaseReturn.table.column.returnAmount')"
        min-width="100"
      >
        <template #default="{ row }">
          <span class="amount">¥{{ row.total_amount }}</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="return_status"
        :label="t('purchaseReturn.table.column.status')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.return_status)">
            {{ getStatusText(row.return_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="reason_detail"
        :label="t('purchaseReturn.table.column.reason')"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column :label="t('purchaseReturn.table.column.action')" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="emit('view', row as PurchaseReturn)">{{
            t('purchaseReturn.table.button.view')
          }}</el-button>
          <el-button
            v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
            size="small"
            type="primary"
            @click="emit('edit', row as PurchaseReturn)"
          >
            {{ t('purchaseReturn.table.button.edit') }}
          </el-button>
          <el-button
            v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
            size="small"
            type="warning"
            @click="emit('submit', row as PurchaseReturn)"
          >
            {{ t('purchaseReturn.table.button.submit') }}
          </el-button>
          <el-button
            v-if="row.return_status === PURCHASE_RETURN_STATUS.SUBMITTED"
            size="small"
            type="success"
            @click="emit('approve', row as PurchaseReturn)"
          >
            {{ t('purchaseReturn.table.button.approve') }}
          </el-button>
          <el-button
            v-if="row.return_status === PURCHASE_RETURN_STATUS.DRAFT"
            size="small"
            type="danger"
            @click="emit('delete', row as PurchaseReturn)"
          >
            {{ t('purchaseReturn.table.button.delete') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      :current-page="page"
      :page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      :aria-label="t('purchaseReturn.table.aria.pagination')"
      @update:current-page="(v: number) => emit('update:page', v)"
      @update:page-size="(v: number) => emit('update:page-size', v)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { PurchaseReturn } from '@/api/purchase-return';
import { getStatusType, getStatusText } from '../composables/prRtnFmts';
// 行内操作的状态门槛以写入侧原值为比较对象（draft 可编辑/提交/删除，submitted 可审批）
import { PURCHASE_RETURN_STATUS } from '@/utils/purchase-return-status';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 采购退货列表表格组件（批次 286：page/pageSize props + v-model 绑定分页）
 */
defineProps<{
  // 表格数据
  tableData: PurchaseReturn[];
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
  view: [row: PurchaseReturn];
  edit: [row: PurchaseReturn];
  submit: [row: PurchaseReturn];
  approve: [row: PurchaseReturn];
  delete: [row: PurchaseReturn];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.amount {
  font-weight: 600;
  color: #f56c6c;
}
.return-mobile {
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
:deep(.el-pagination) {
  margin-top: 20px;
  justify-content: flex-end;
}
</style>
