<!--
  LogisticsTable.vue - 物流管理运单表
  拆分自 logistics/index.vue（P14 批 2 I-3 第 4 批）
  批次 287：page/pageSize props + v-model 绑定分页
  迁移至 V2Table 虚拟滚动表格（行为完全保持一致，仅结构重构）
-->
<template>
  <el-card class="table-card">
    <!-- 手机卡片（<768 与采购域表格同断点同范式） -->
    <section v-if="isPhone" v-loading="loading" class="logistics-mobile">
      <ul
        v-if="data.length > 0"
        class="order-list"
        :aria-label="t('logistics.table.mobileCardAria')"
      >
        <li v-for="row in data" :key="row.id" class="order-card">
          <dl class="order-fields">
            <div>
              <dt>{{ t('logistics.table.column.relatedOrder') }}</dt>
              <dd>{{ row.order_no }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.logisticsCompany') }}</dt>
              <dd>{{ row.logistics_company }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.trackingNumber') }}</dt>
              <dd>{{ row.tracking_number }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.driverName') }}</dt>
              <dd>{{ row.driver_name }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.driverPhone') }}</dt>
              <dd>{{ row.driver_phone }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.freight') }}</dt>
              <dd>{{ formatFreight(row.freight_fee) }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.expectedArrival') }}</dt>
              <dd>{{ row.expected_arrival }}</dd>
            </div>
            <div>
              <dt>{{ t('logistics.table.column.status') }}</dt>
              <dd>
                <el-tag :type="getStatusType(row.status)">
                  {{ getStatusText(row.status) }}
                </el-tag>
              </dd>
            </div>
          </dl>
          <div class="order-actions">
            <el-button size="small" @click="emit('view', row)">
              {{ t('logistics.table.action.view') }}
            </el-button>
            <el-button
              v-if="row.status === WAYBILL_STATUS.inTransit"
              size="small"
              type="primary"
              @click="emit('edit', row)"
            >
              {{ t('logistics.table.action.edit') }}
            </el-button>
            <el-button
              v-if="row.status === WAYBILL_STATUS.inTransit"
              size="small"
              type="warning"
              @click="emit('update-status', row)"
            >
              {{ t('logistics.table.action.deliver') }}
            </el-button>
            <el-button
              v-if="row.status === WAYBILL_STATUS.inTransit"
              size="small"
              type="danger"
              @click="emit('delete', row)"
            >
              {{ t('logistics.table.action.delete') }}
            </el-button>
            <el-button
              v-if="row.status === WAYBILL_STATUS.delivered"
              size="small"
              type="success"
              @click="emit('sign', row)"
            >
              {{ t('logistics.table.action.sign') }}
            </el-button>
          </div>
        </li>
      </ul>
      <el-empty v-else :description="t('logistics.table.mobileEmpty')" />
    </section>

    <V2Table
      v-else
      :columns="columns"
      :data="data"
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
import { h, computed } from 'vue';
import { ElButton, ElTag } from 'element-plus';
import { useI18n } from 'vue-i18n';
import V2Table from '@/components/V2Table/index.vue';
import type { ColumnDef } from '@/components/V2Table/types';
import type { LogisticsWaybill } from '@/api/logistics';
import { WAYBILL_STATUS } from '@/constants/waybill-status';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getStatusText, getStatusType, formatFreight } from '../composables/lgsFmts';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

/**
 * 物流运单列表组件（批次 287：page/pageSize props + v-model 绑定分页）
 * 迁移至 V2Table 虚拟滚动表格，保留原 props/emits 签名以维持父组件兼容
 */
defineProps<{
  // 列表数据
  data: LogisticsWaybill[];
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
  view: [row: LogisticsWaybill];
  edit: [row: LogisticsWaybill];
  'update-status': [row: LogisticsWaybill];
  sign: [row: LogisticsWaybill];
  delete: [row: LogisticsWaybill];
  'update:page': [v: number];
  'update:page-size': [v: number];
}>();

/** 列定义：保持与原 el-table 列完全一致；computed 确保 locale 切换时表头响应式更新 */
const columns = computed<ColumnDef<LogisticsWaybill>[]>(() => [
  {
    // 关联销售订单号：运单表只存 order_id，由列表接口回查补齐
    key: 'order_no',
    title: t('logistics.table.column.relatedOrder'),
    width: 140,
  },
  { key: 'logistics_company', title: t('logistics.table.column.logisticsCompany'), width: 120 },
  { key: 'tracking_number', title: t('logistics.table.column.trackingNumber'), width: 150 },
  { key: 'driver_name', title: t('logistics.table.column.driverName'), width: 100 },
  { key: 'driver_phone', title: t('logistics.table.column.driverPhone'), width: 120 },
  {
    // 运费列：格式化为 ¥ 前缀字符串
    key: 'freight_fee',
    title: t('logistics.table.column.freight'),
    width: 100,
    formatter: row => formatFreight(row.freight_fee),
  },
  { key: 'expected_arrival', title: t('logistics.table.column.expectedArrival'), width: 120 },
  {
    // 状态列：渲染 el-tag，颜色与文本由状态映射决定
    key: 'status',
    title: t('logistics.table.column.status'),
    width: 100,
    align: 'center',
    renderCell: row =>
      h(ElTag, { type: getStatusType(row.status) }, { default: () => getStatusText(row.status) }),
  },
  {
    // 操作列：按状态机给出当前阶段可执行的动作
    key: '__actions__',
    title: t('logistics.table.column.action'),
    width: 250,
    fixed: 'right',
    renderCell: row => {
      const buttons = [
        h(
          ElButton,
          { size: 'small', onClick: () => emit('view', row) },
          { default: () => t('logistics.table.action.view') }
        ),
      ];
      // 运输中：运单信息仍可订正，且可登记送达 / 撤销误建运单
      if (row.status === WAYBILL_STATUS.inTransit) {
        buttons.push(
          h(
            ElButton,
            { size: 'small', type: 'primary', onClick: () => emit('edit', row) },
            { default: () => t('logistics.table.action.edit') }
          ),
          h(
            ElButton,
            { size: 'small', type: 'warning', onClick: () => emit('update-status', row) },
            { default: () => t('logistics.table.action.deliver') }
          ),
          h(
            ElButton,
            { size: 'small', type: 'danger', onClick: () => emit('delete', row) },
            { default: () => t('logistics.table.action.delete') }
          )
        );
      }
      // 已送达：进入电子签收（签收同时确认应收）
      if (row.status === WAYBILL_STATUS.delivered) {
        buttons.push(
          h(
            ElButton,
            { size: 'small', type: 'success', onClick: () => emit('sign', row) },
            { default: () => t('logistics.table.action.sign') }
          )
        );
      }
      return h('div', { class: 'action-cell' }, buttons);
    },
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
}
.logistics-mobile {
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
</style>
