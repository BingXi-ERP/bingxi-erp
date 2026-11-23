<!--
  PurchaseInspectionTable.vue - 采购验货列表
  拆分自 purchase-inspection/index.vue（P14 批 2 I-3 第 5 批）
  批次 286：page/pageSize props + v-model 绑定分页
  行为完全保持一致（仅结构重构）
-->
<template>
  <el-card class="table-card">
    <!-- 手机卡片（<768 与采购管理表格同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="inspection-mobile">
      <ul class="order-list" :aria-label="t('purchaseInspection.table.mobileCardAria')">
        <li v-for="row in data" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div class="order-number">
              <dt>{{ t('purchaseInspection.table.column.inspectionNo') }}</dt>
              <dd>{{ row.inspection_no }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.receiptNo') }}</dt>
              <dd>{{ row.receipt_no }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.supplier') }}</dt>
              <dd>{{ row.supplier_name }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.inspectionDate') }}</dt>
              <dd>{{ row.inspection_date }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.inspector') }}</dt>
              <dd>{{ row.inspector_name }}</dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.status') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.inspection_status)">
                  {{ getStatusText(row.inspection_status) }}
                </el-tag>
              </dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.result') }}</dt>
              <dd>
                <el-tag v-if="row.inspection_result" :type="getResultType(row.inspection_result)">
                  {{ getResultText(row.inspection_result) }}
                </el-tag>
                <span v-else>-</span>
              </dd>
            </div>
            <div>
              <dt>{{ t('purchaseInspection.table.column.remark') }}</dt>
              <dd>{{ row.notes }}</dd>
            </div>
          </dl>
          <div class="order-actions">
            <el-button type="primary" link @click="emit('view', row as PurchaseInspection)">
              {{ t('purchaseInspection.table.button.view') }}
            </el-button>
            <el-button
              v-if="row.inspection_status === PURCHASE_INSPECTION_STATUS.PENDING"
              type="primary"
              link
              @click="emit('edit', row as PurchaseInspection)"
            >
              {{ t('purchaseInspection.table.button.edit') }}
            </el-button>
            <el-button
              v-if="row.inspection_status === PURCHASE_INSPECTION_STATUS.PENDING"
              type="success"
              link
              @click="emit('complete', row as PurchaseInspection)"
            >
              {{ t('purchaseInspection.table.button.complete') }}
            </el-button>
            <el-button
              v-if="canGenerateReturn(row)"
              type="warning"
              link
              @click="emit('createReturn', row as PurchaseInspection)"
            >
              {{ t('purchaseInspection.table.button.generateReturn') }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

    <el-table
      v-else
      v-loading="loading"
      :data="data"
      border
      stripe
      :aria-label="t('purchaseInspection.table.ariaLabel')"
    >
      <el-table-column
        prop="inspection_no"
        :label="t('purchaseInspection.table.column.inspectionNo')"
        min-width="140"
      />
      <el-table-column
        prop="receipt_no"
        :label="t('purchaseInspection.table.column.receiptNo')"
        min-width="140"
      />
      <el-table-column
        prop="supplier_name"
        :label="t('purchaseInspection.table.column.supplier')"
        min-width="150"
      />
      <el-table-column
        prop="inspection_date"
        :label="t('purchaseInspection.table.column.inspectionDate')"
        min-width="120"
      />
      <el-table-column
        prop="inspector_name"
        :label="t('purchaseInspection.table.column.inspector')"
        min-width="100"
      />
      <el-table-column
        prop="inspection_status"
        :label="t('purchaseInspection.table.column.status')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.inspection_status)">
            {{ getStatusText(row.inspection_status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="inspection_result"
        :label="t('purchaseInspection.table.column.result')"
        width="100"
        align="center"
      >
        <template #default="{ row }">
          <el-tag v-if="row.inspection_result" :type="getResultType(row.inspection_result)">
            {{ getResultText(row.inspection_result) }}
          </el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column
        prop="notes"
        :label="t('purchaseInspection.table.column.remark')"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('purchaseInspection.table.column.action')"
        width="200"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button size="small" @click="emit('view', row as PurchaseInspection)">{{
            t('purchaseInspection.table.button.view')
          }}</el-button>
          <el-button
            v-if="row.inspection_status === PURCHASE_INSPECTION_STATUS.PENDING"
            size="small"
            type="primary"
            @click="emit('edit', row as PurchaseInspection)"
          >
            {{ t('purchaseInspection.table.button.edit') }}
          </el-button>
          <el-button
            v-if="row.inspection_status === PURCHASE_INSPECTION_STATUS.PENDING"
            size="small"
            type="success"
            @click="emit('complete', row as PurchaseInspection)"
          >
            {{ t('purchaseInspection.table.button.complete') }}
          </el-button>
          <el-button
            v-if="canGenerateReturn(row)"
            size="small"
            type="warning"
            @click="emit('createReturn', row as PurchaseInspection)"
          >
            {{ t('purchaseInspection.table.button.generateReturn') }}
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
      :aria-label="t('purchaseInspection.table.ariaLabelPagination')"
      @update:current-page="(v: number) => emit('update:page', v)"
      @update:page-size="(v: number) => emit('update:page-size', v)"
    />
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStatusType, getStatusText, getResultType, getResultText } from '../composables/piFmts';
// 行内操作按钮的状态门槛以写入侧原值为比较对象（后端 purchase_inspection.inspection_status：pending/completed）
import { PURCHASE_INSPECTION_STATUS } from '@/utils/purchase-inspection-status';
// 「生成退货」门控取值取本域权威词表常量（后端 purchase_inspection_result，禁止手写第二套）
import { PURCHASE_INSPECTION_RESULT } from '@/utils/purchase-inspection-result';
import type { PurchaseInspection } from '@/api/purchase-inspection';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 列表组件（批次 286：page/pageSize props + v-model 绑定分页）
 */
defineProps<{
  // 列表数据
  data: PurchaseInspection[];
  // 总数
  total: number;
  // 加载状态
  loading: boolean;
  // 当前页
  page: number;
  // 每页条数
  pageSize: number;
}>();

const emit = defineEmits<{
  view: [row: PurchaseInspection];
  edit: [row: PurchaseInspection];
  complete: [row: PurchaseInspection];
  createReturn: [row: PurchaseInspection];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

/** 仅 completed 且结果为 fail/partial 时可发起退货（partial 的不合格部分与 fail 同走退货路径） */
const RETURN_ELIGIBLE_RESULTS = new Set<string>([
  PURCHASE_INSPECTION_RESULT.FAIL,
  PURCHASE_INSPECTION_RESULT.PARTIAL,
]);
function canGenerateReturn(row: PurchaseInspection): boolean {
  return (
    row.inspection_status === PURCHASE_INSPECTION_STATUS.COMPLETED &&
    RETURN_ELIGIBLE_RESULTS.has(row.inspection_result ?? '')
  );
}
</script>

<style scoped>
.table-card {
  margin-bottom: 20px;
}
.inspection-mobile {
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
.el-pagination {
  margin-top: 20px;
  justify-content: flex-end;
}
</style>
