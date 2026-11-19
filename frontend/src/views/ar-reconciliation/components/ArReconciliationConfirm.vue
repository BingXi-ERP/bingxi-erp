<!--
  ArReconciliationConfirm.vue - AR 对账客户确认记录对话框
  拆分自 arReconciliation/enhanced.vue（P14 批 1 B3 I-2）
  行为完全保持一致（仅结构重构）
-->
<template>
  <div class="ar-reconciliation-confirm">
    <el-dialog
      :model-value="visible"
      :title="$t('arReconciliationModule.confirmationRecords')"
      :width="isPhone ? phoneDialogWidth : '900px'"
      class="ar-reconciliation-confirm-dialog"
      :class="{ 'ar-reconciliation-confirm-dialog--phone': isPhone }"
      :aria-label="$t('arReconciliationModule.confirmationDialogAria')"
      @update:model-value="(v: boolean) => emit('update:visible', v)"
    >
      <section v-if="isPhone" class="ar-confirm-mobile">
        <ul
          v-if="data.length"
          class="card-list"
          :aria-label="$t('arReconciliationModule.confirmationListAria')"
        >
          <li v-for="row in data" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('arReconciliationModule.customerName') }}</dt>
                <dd>{{ row.customer_name }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.confirmStatus') }}</dt>
                <dd>
                  <el-tag size="small" :type="getConfirmType(row.confirm_status)">
                    {{ $t(getConfirmLabel(row.confirm_status)) }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.confirmAmount') }}</dt>
                <dd>{{ Number(row.confirm_amount ?? 0).toFixed(2) }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.disputeAmount') }}</dt>
                <dd>{{ fmtNum(row.disputed_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.confirmTime') }}</dt>
                <dd>{{ row.confirmed_at }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.remark') }}</dt>
                <dd>{{ row.remark }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button
                v-if="row.confirm_status === 'pending'"
                size="small"
                type="success"
                @click="emit('confirm-status', row, 'confirmed')"
              >
                <el-icon><CircleCheck /></el-icon> {{ $t('common.confirm') }}
              </el-button>
              <el-button
                v-if="row.confirm_status === 'pending'"
                size="small"
                type="danger"
                @click="emit('confirm-status', row, 'disputed')"
              >
                <el-icon><CircleClose /></el-icon> {{ $t('arReconciliationModule.dispute') }}
              </el-button>
            </div>
          </li>
        </ul>
        <el-empty v-else :description="$t('components.v2Table.empty')" />
      </section>
      <el-table
        v-else
        :data="data"
        border
        style="width: 100%"
        :aria-label="$t('arReconciliationModule.confirmationListAria')"
      >
        <el-table-column
          prop="customer_name"
          :label="$t('arReconciliationModule.customerName')"
          width="160"
        />
        <el-table-column :label="$t('arReconciliationModule.confirmStatus')" width="100">
          <template #default="scope">
            <el-tag size="small" :type="getConfirmType(scope.row.confirm_status)">
              {{ $t(getConfirmLabel(scope.row.confirm_status)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="confirm_amount"
          :label="$t('arReconciliationModule.confirmAmount')"
          width="120"
          align="right"
        >
          <template #default="scope">{{
            Number(scope.row.confirm_amount ?? 0).toFixed(2)
          }}</template>
        </el-table-column>
        <el-table-column
          prop="disputed_amount"
          :label="$t('arReconciliationModule.disputeAmount')"
          width="120"
          align="right"
        >
          <template #default="scope">{{ fmtNum(scope.row.disputed_amount) }}</template>
        </el-table-column>
        <el-table-column
          prop="confirmed_at"
          :label="$t('arReconciliationModule.confirmTime')"
          width="160"
        />
        <el-table-column prop="remark" :label="$t('arReconciliationModule.remark')" />
        <el-table-column :label="$t('common.operation')" width="180" align="center">
          <template #default="scope">
            <el-button
              v-if="scope.row.confirm_status === 'pending'"
              size="small"
              type="success"
              @click="emit('confirm-status', scope.row, 'confirmed')"
            >
              <el-icon><CircleCheck /></el-icon> {{ $t('common.confirm') }}
            </el-button>
            <el-button
              v-if="scope.row.confirm_status === 'pending'"
              size="small"
              type="danger"
              @click="emit('confirm-status', scope.row, 'disputed')"
            >
              <el-icon><CircleClose /></el-icon> {{ $t('arReconciliationModule.dispute') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { CircleCheck, CircleClose } from '@element-plus/icons-vue';
import type { CustomerConfirmation } from '@/api/ar-reconciliation-enhanced';
import { getConfirmLabel, getConfirmType } from '../composables/arRecFmts';
import { useBreakpoint } from '@/composables/useBreakpoint';

const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

// 金额单元格统一转数字格式化（后端 Decimal 序列化为字符串，直接 toFixed 会崩溃）
const fmtNum = (v: unknown): string => Number(v ?? 0).toFixed(2);

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
void t;

/**
 * 客户确认记录对话框组件
 */
const props = defineProps<{
  visible: boolean;
  data: CustomerConfirmation[];
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
  'confirm-status': [row: CustomerConfirmation, status: 'confirmed' | 'disputed'];
}>();

void props;
</script>

<style scoped>
.card-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.card-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.card-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 16px;
}
.card-fields > div {
  min-width: 0;
}
.field-emphasis {
  grid-column: 1 / -1;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 12px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.field-emphasis dd {
  font-weight: 600;
}
.card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.card-actions .el-button {
  min-height: 44px;
  min-width: 44px;
  height: auto;
  margin: 0;
  padding: 8px;
  white-space: normal;
}
.ar-reconciliation-confirm :deep(.ar-reconciliation-confirm-dialog--phone) {
  display: flex;
  flex-direction: column;
  width: calc(
    100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
  ) !important;
  max-width: calc(
    100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)
  ) !important;
  max-height: calc(
    100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  margin: calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px))
    calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px)) !important;
  box-sizing: border-box;
}
.ar-reconciliation-confirm :deep(.ar-reconciliation-confirm-dialog--phone .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}
</style>
