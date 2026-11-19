<!--
  ArReconciliationDetail.vue - AR 对账明细对话框
  拆分自 arReconciliation/enhanced.vue（P14 批 1 B3 I-2）
  行为完全保持一致（仅结构重构）
-->
<template>
  <div class="ar-reconciliation-detail">
    <el-dialog
      :model-value="visible"
      :title="$t('arReconciliationModule.detailTitle')"
      :width="isPhone ? phoneDialogWidth : '900px'"
      class="ar-reconciliation-detail-dialog"
      :class="{ 'ar-reconciliation-detail-dialog--phone': isPhone }"
      :aria-label="$t('arReconciliationModule.detailDialogAria')"
      @update:model-value="(v: boolean) => emit('update:visible', v)"
    >
      <div v-if="currentReconciliation" class="detail-header">
        <dl v-if="isPhone" class="card-fields">
          <div class="field-emphasis">
            <dt>{{ $t('arReconciliationModule.index.reconciliationNo') }}</dt>
            <dd>{{ currentReconciliation.reconciliation_no }}</dd>
          </div>
          <div>
            <dt>{{ $t('arReconciliationModule.customerName') }}</dt>
            <dd>{{ currentReconciliation.customer_name || '-' }}</dd>
          </div>
          <div>
            <dt>{{ $t('arReconciliationModule.invoiceAmount') }}</dt>
            <dd>{{ fmtNum(currentReconciliation.total_invoices) }}</dd>
          </div>
          <div>
            <dt>{{ $t('arReconciliationModule.paymentAmount') }}</dt>
            <dd>{{ fmtNum(currentReconciliation.total_collections) }}</dd>
          </div>
          <div>
            <dt>{{ $t('arReconciliationModule.index.balance') }}</dt>
            <dd>{{ fmtNum(currentReconciliation.closing_balance) }}</dd>
          </div>
          <div>
            <dt>{{ $t('common.status') }}</dt>
            <dd>
              <el-tag
                :type="
                  currentReconciliation.reconciliation_status === 'confirmed' ? 'success' : 'info'
                "
                size="small"
              >
                {{ statusLabel(currentReconciliation.reconciliation_status) }}
              </el-tag>
            </dd>
          </div>
        </dl>
        <el-descriptions v-else :column="4" border>
          <el-descriptions-item :label="$t('arReconciliationModule.index.reconciliationNo')">{{
            currentReconciliation.reconciliation_no
          }}</el-descriptions-item>
          <el-descriptions-item :label="$t('arReconciliationModule.customerName')">{{
            currentReconciliation.customer_name || '-'
          }}</el-descriptions-item>
          <el-descriptions-item :label="$t('arReconciliationModule.invoiceAmount')">{{
            fmtNum(currentReconciliation.total_invoices)
          }}</el-descriptions-item>
          <el-descriptions-item :label="$t('arReconciliationModule.paymentAmount')">{{
            fmtNum(currentReconciliation.total_collections)
          }}</el-descriptions-item>
          <el-descriptions-item :label="$t('arReconciliationModule.index.balance')">{{
            fmtNum(currentReconciliation.closing_balance)
          }}</el-descriptions-item>
          <el-descriptions-item :label="$t('common.status')">
            <el-tag
              :type="
                currentReconciliation.reconciliation_status === 'confirmed' ? 'success' : 'info'
              "
              size="small"
            >
              {{ statusLabel(currentReconciliation.reconciliation_status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <section v-if="isPhone" class="ar-detail-mobile">
        <ul
          v-if="detailData.length"
          class="card-list"
          :aria-label="$t('arReconciliationModule.detailTableAria')"
        >
          <li v-for="row in detailData" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('arReconciliationModule.type') }}</dt>
                <dd>
                  <el-tag
                    size="small"
                    :type="
                      String(row.item_type).toUpperCase() === 'INVOICE'
                        ? ''
                        : String(row.item_type).toUpperCase() === 'RECEIPT'
                          ? 'success'
                          : 'warning'
                    "
                  >
                    {{ row.item_type }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.sourceNo') }}</dt>
                <dd>{{ row.document_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.date') }}</dt>
                <dd>{{ row.document_date }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.amount') }}</dt>
                <dd>{{ fmtNum(row.amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.matchedAmount') }}</dt>
                <dd>{{ fmtNum(row.matched_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('common.status') }}</dt>
                <dd>
                  <el-tag size="small" :type="getMatchType(row.match_status)">
                    {{ $t(getMatchLabel(row.match_status)) }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('arReconciliationModule.remark') }}</dt>
                <dd>{{ row.remarks }}</dd>
              </div>
            </dl>
          </li>
        </ul>
        <el-empty v-else :description="$t('components.v2Table.empty')" />
      </section>
      <el-table
        v-else
        :data="detailData"
        border
        style="width: 100%; margin-top: 16px"
        :aria-label="$t('arReconciliationModule.detailTableAria')"
      >
        <el-table-column prop="item_type" :label="$t('arReconciliationModule.type')" width="120">
          <template #default="scope">
            <el-tag
              size="small"
              :type="
                String(scope.row.item_type).toUpperCase() === 'INVOICE'
                  ? ''
                  : String(scope.row.item_type).toUpperCase() === 'RECEIPT'
                    ? 'success'
                    : 'warning'
              "
            >
              {{ scope.row.item_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="document_no"
          :label="$t('arReconciliationModule.sourceNo')"
          width="150"
        />
        <el-table-column
          prop="document_date"
          :label="$t('arReconciliationModule.date')"
          width="120"
        />
        <el-table-column
          prop="amount"
          :label="$t('arReconciliationModule.amount')"
          width="120"
          align="right"
        >
          <template #default="scope">{{ fmtNum(scope.row.amount) }}</template>
        </el-table-column>
        <el-table-column
          prop="matched_amount"
          :label="$t('arReconciliationModule.matchedAmount')"
          width="120"
          align="right"
        >
          <template #default="scope">{{ fmtNum(scope.row.matched_amount) }}</template>
        </el-table-column>
        <el-table-column :label="$t('common.status')" width="120">
          <template #default="scope">
            <el-tag size="small" :type="getMatchType(scope.row.match_status)">
              {{ $t(getMatchLabel(scope.row.match_status)) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="remarks" :label="$t('arReconciliationModule.remark')" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type {
  AutoReconciliationResult,
  ReconciliationDetailItem,
} from '@/api/ar-reconciliation-enhanced';
import { getMatchLabel, getMatchType } from '../composables/arRecFmts';
import { useBreakpoint } from '@/composables/useBreakpoint';

const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

// 金额单元格统一转数字格式化（后端 Decimal 序列化为字符串，直接 toFixed 会崩溃）
const fmtNum = (v: unknown): string => Number(v ?? 0).toFixed(2);

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

// 对账状态词表写入方为后端 models/status/finance.rs 的 ar 段，
// 展示词键当前只覆盖 draft 与 confirmed，其余状态回显原值
const statusLabel = (v: string | null | undefined): string => {
  if (!v) return '-';
  if (v === 'draft') return t('arReconciliationModule.index.statusDraft');
  if (v === 'confirmed') return t('arReconciliationModule.index.statusConfirmed');
  return v;
};

/**
 * 对账明细对话框组件
 */
const props = defineProps<{
  visible: boolean;
  currentReconciliation: AutoReconciliationResult | null;
  detailData: ReconciliationDetailItem[];
}>();

const emit = defineEmits<{
  'update:visible': [v: boolean];
}>();

void props;
void emit;
</script>

<style scoped>
.detail-header {
  margin-bottom: 16px;
}
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
  margin: 0;
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
.ar-reconciliation-detail :deep(.ar-reconciliation-detail-dialog--phone) {
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
.ar-reconciliation-detail :deep(.ar-reconciliation-detail-dialog--phone .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}
</style>
