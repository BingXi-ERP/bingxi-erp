<!--
  ReconciliationTab.vue - 应收对账 Tab
  来源：原 ar/index.vue 中 应收对账 tab 内容
  拆分日期：2026-06-15 B3-2
-->
<template>
  <div class="reconciliation-tab" :class="{ 'reconciliation-tab--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ $t('arModule.reconciliation.title') }}</h2>
      <el-button type="primary" @click="openReconciliationDialog()">
        <el-icon><Plus /></el-icon>
        {{ $t('arModule.reconciliation.create') }}
      </el-button>
    </div>

    <el-card shadow="hover">
      <section
        v-if="isPhone"
        v-loading="reconciliationLoading"
        class="ar-reconciliation-mobile"
        :aria-label="$t('arModule.reconciliation.listAria')"
      >
        <ul class="card-list">
          <li v-for="row in reconciliations" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('arModule.reconciliation.reconciliationNo') }}</dt>
                <dd>{{ row.reconciliation_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.customer') }}</dt>
                <dd>{{ row.customer_name }}</dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.reconciliationDate') }}</dt>
                <dd>{{ row.period_start }} ~ {{ row.period_end }}</dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.invoiceAmount') }}</dt>
                <dd>{{ formatMoney(row.total_invoices) }}</dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.paymentAmount') }}</dt>
                <dd>{{ formatMoney(row.total_collections) }}</dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.difference') }}</dt>
                <dd :class="{ 'text-red': Number(row.closing_balance) !== 0 }">
                  {{ formatMoney(row.closing_balance) }}
                </dd>
              </div>
              <div>
                <dt>{{ $t('common.status') }}</dt>
                <dd>
                  <el-tag
                    :type="getReconciliationStatusType(row.reconciliation_status)"
                    size="small"
                  >
                    {{ getReconciliationStatusLabel(row.reconciliation_status) }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('arModule.reconciliation.confirmedAt') }}</dt>
                <dd>{{ row.created_at }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button
                v-if="row.reconciliation_status === 'draft'"
                type="success"
                @click="confirmReconciliation(row)"
              >
                {{ $t('arModule.reconciliation.confirm') }}
              </el-button>
            </div>
          </li>
        </ul>
        <ElEmpty
          v-if="!reconciliationLoading && reconciliations.length === 0"
          :description="$t('components.v2Table.empty')"
        />
      </section>
      <el-table
        v-else
        v-loading="reconciliationLoading"
        :data="reconciliations"
        stripe
        :aria-label="$t('arModule.reconciliation.listAria')"
      >
        <el-table-column
          prop="reconciliation_no"
          :label="$t('arModule.reconciliation.reconciliationNo')"
          width="140"
        />
        <el-table-column
          prop="customer_name"
          :label="$t('arModule.reconciliation.customer')"
          width="150"
        />
        <el-table-column :label="$t('arModule.reconciliation.reconciliationDate')" width="200">
          <template #default="{ row }"> {{ row.period_start }} ~ {{ row.period_end }} </template>
        </el-table-column>
        <el-table-column
          :label="$t('arModule.reconciliation.invoiceAmount')"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatMoney(row.total_invoices) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('arModule.reconciliation.paymentAmount')"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatMoney(row.total_collections) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('arModule.reconciliation.difference')"
          width="100"
          align="right"
        >
          <template #default="{ row }">
            <span :class="{ 'text-red': Number(row.closing_balance) !== 0 }">
              {{ formatMoney(row.closing_balance) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          prop="reconciliation_status"
          :label="$t('common.status')"
          width="100"
          align="center"
        >
          <template #default="{ row }">
            <el-tag :type="getReconciliationStatusType(row.reconciliation_status)" size="small">
              {{ getReconciliationStatusLabel(row.reconciliation_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="created_at"
          :label="$t('arModule.reconciliation.confirmedAt')"
          width="160"
        />
        <el-table-column :label="$t('common.operation')" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.reconciliation_status === 'draft'"
              type="success"
              link
              size="small"
              @click="confirmReconciliation(row)"
              >{{ $t('arModule.reconciliation.confirm') }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="reconciliationDialogVisible"
      :title="$t('arModule.reconciliation.createTitle')"
      :width="
        isPhone
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '500px'
      "
      class="reconciliation-dialog"
      :class="{ 'reconciliation-dialog--phone': isPhone }"
      :aria-label="$t('arModule.reconciliation.createAria')"
    >
      <el-form
        ref="reconciliationFormRef"
        :model="reconciliationForm"
        label-width="80px"
        :label-position="isPhone ? 'top' : 'right'"
        :aria-label="$t('arModule.reconciliation.formAria')"
      >
        <el-form-item :label="$t('arModule.reconciliation.reconciliationNo')">
          <el-input
            v-model="reconciliationForm.reconciliation_no"
            :placeholder="$t('arModule.reconciliation.reconciliationNo')"
          />
        </el-form-item>
        <el-form-item :label="$t('arModule.reconciliation.customer')">
          <el-select
            v-model="reconciliationForm.customer_id"
            :placeholder="$t('arModule.reconciliation.customerPlaceholder')"
            style="width: 100%"
          >
            <el-option v-for="c in customers" :key="c.id" :label="c.customer_name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('arModule.reconciliation.reconciliationDate')">
          <el-date-picker
            v-model="periodRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            :start-placeholder="$t('arModule.reconciliation.datePlaceholder')"
            :end-placeholder="$t('arModule.reconciliation.datePlaceholder')"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="$t('arModule.reconciliation.invoiceAmount')">
          <el-input
            v-model="totalInvoicesField.text"
            style="width: 100%"
            @blur="totalInvoicesField.normalize()"
          />
        </el-form-item>
        <el-form-item :label="$t('arModule.reconciliation.paymentAmount')">
          <el-input
            v-model="totalCollectionsField.text"
            style="width: 100%"
            @blur="totalCollectionsField.normalize()"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reconciliationDialogVisible = false">{{
          $t('common.cancel')
        }}</el-button>
        <el-button
          type="primary"
          :loading="reconciliationSubmitLoading"
          @click="submitReconciliation"
          >{{ $t('common.confirm') }}</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, toRef, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElEmpty } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import type { FormInstance } from 'element-plus';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  useNumberField,
  validateNumberValue,
  type NumberFieldSpec,
} from '@/composables/useNumberField';
import {
  getARReconciliationList,
  createARReconciliation,
  updateARReconciliationStatus,
  type ARReconciliation,
} from '@/api/ar';
import type { Customer } from '@/api/customer';
import { isDialogDismissal } from '@/utils/monitor';

const { t } = useI18n({ useScope: 'global' });

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const reconciliations = ref<ARReconciliation[]>([]);
const customers = ref<Customer[]>([]);
const reconciliationLoading = ref(false);
const reconciliationSubmitLoading = ref(false);
const reconciliationDialogVisible = ref(false);
const reconciliationFormRef = ref<FormInstance>();
const periodRange = ref<[string, string] | null>(null);

const reconciliationForm = reactive({
  reconciliation_no: '',
  customer_id: undefined as number | undefined,
  opening_balance: 0,
  total_invoices: 0,
  total_collections: 0,
});

// 数值手输桥 范围由单源校验器裁决（全项目禁步进控件）
const totalInvoicesSpec: NumberFieldSpec = {
  label: t('arModule.reconciliation.invoiceAmount'),
  min: 0,
};
const totalCollectionsSpec: NumberFieldSpec = {
  label: t('arModule.reconciliation.paymentAmount'),
  min: 0,
};
const totalInvoicesField = useNumberField(
  toRef(reconciliationForm, 'total_invoices'),
  totalInvoicesSpec
);
const totalCollectionsField = useNumberField(
  toRef(reconciliationForm, 'total_collections'),
  totalCollectionsSpec
);

// 后端 ReconciliationResponse 金额字段为 Decimal.to_string()，前端按字符串接收后转数值格式化
const formatMoney = (amount: number | string | null | undefined) => {
  const n = Number(amount ?? 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
};

const getReconciliationStatusLabel = (status: string | null) => {
  // 真实 ar_reconciliation.reconciliation_status 值集（小写）：
  // draft/sent/confirmed/disputed/closed/cancelled（backend/src/models/status/finance.rs:22 起）
  const keyMap: Record<string, string> = {
    draft: 'arModule.reconciliation.statusDraft',
    confirmed: 'arModule.reconciliation.statusConfirmed',
    disputed: 'arModule.reconciliation.statusDisputed',
  };
  const key = status ? keyMap[status] : undefined;
  return key ? t(key) : status || '';
};

const getReconciliationStatusType = (status: string | null) => {
  const map: Record<string, string> = {
    draft: 'warning',
    confirmed: 'success',
    disputed: 'danger',
  };
  return (status && map[status]) || 'info';
};

const fetchReconciliations = async () => {
  reconciliationLoading.value = true;
  try {
    const res = await getARReconciliationList();
    reconciliations.value = res.data.items;
  } catch (error) {
    const err = error as Error;
    ElMessage.error(err.message || t('arModule.reconciliation.fetchListFailed'));
  } finally {
    reconciliationLoading.value = false;
  }
};

const openReconciliationDialog = () => {
  reconciliationForm.reconciliation_no = '';
  reconciliationForm.customer_id = undefined;
  reconciliationForm.opening_balance = 0;
  reconciliationForm.total_invoices = 0;
  reconciliationForm.total_collections = 0;
  const today = new Date().toISOString().split('T')[0];
  periodRange.value = [today, today];
  reconciliationDialogVisible.value = true;
};

const submitReconciliation = async () => {
  if (!reconciliationForm.customer_id || !periodRange.value) {
    ElMessage.warning(t('arModule.reconciliation.selectCustomer'));
    return;
  }
  const invoicesInvalid = validateNumberValue(reconciliationForm.total_invoices, totalInvoicesSpec);
  if (invoicesInvalid) {
    ElMessage.warning(invoicesInvalid);
    return;
  }
  const collectionsInvalid = validateNumberValue(
    reconciliationForm.total_collections,
    totalCollectionsSpec
  );
  if (collectionsInvalid) {
    ElMessage.warning(collectionsInvalid);
    return;
  }

  reconciliationSubmitLoading.value = true;
  try {
    await createARReconciliation({
      reconciliation_no: reconciliationForm.reconciliation_no,
      customer_id: reconciliationForm.customer_id,
      period_start: periodRange.value[0],
      period_end: periodRange.value[1],
      opening_balance: reconciliationForm.opening_balance,
      total_invoices: reconciliationForm.total_invoices,
      total_collections: reconciliationForm.total_collections,
    });
    ElMessage.success(t('common.message.createSuccess'));
    reconciliationDialogVisible.value = false;
    fetchReconciliations();
  } catch (error) {
    const err = error as Error;
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    reconciliationSubmitLoading.value = false;
  }
};

const confirmReconciliation = async (row: ARReconciliation) => {
  try {
    await ElMessageBox.confirm(
      t('arModule.reconciliation.confirmMessage'),
      t('arModule.reconciliation.confirmTitle'),
      { type: 'info' }
    );
    await updateARReconciliationStatus(row.id, 'confirmed');
    ElMessage.success(t('arModule.reconciliation.confirmSuccess'));
    fetchReconciliations();
  } catch (error) {
    if (!isDialogDismissal(error)) {
      const err = error as Error;
      ElMessage.error(err.message || t('common.failed'));
    }
  }
};

onMounted(() => {
  fetchReconciliations();
});
</script>

<style scoped>
.text-red {
  color: #f56c6c;
}

.ar-reconciliation-mobile {
  min-width: 0;
}
.card-list {
  display: grid;
  gap: 16px;
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
  gap: 12px;
  margin: 0 0 16px;
}
.card-fields > div {
  min-width: 0;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
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

.reconciliation-tab--phone .page-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.reconciliation-tab--phone .page-title {
  overflow-wrap: anywhere;
}
.reconciliation-tab--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.reconciliation-tab--phone :deep(.el-input__wrapper),
.reconciliation-tab--phone :deep(.el-select__wrapper) {
  min-height: 44px;
  box-sizing: border-box;
}
.reconciliation-tab--phone :deep(.el-form-item__content) {
  flex-wrap: wrap;
  gap: 8px;
}

.reconciliation-tab :deep(.reconciliation-dialog--phone) {
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
.reconciliation-tab :deep(.reconciliation-dialog--phone .el-dialog__header),
.reconciliation-tab :deep(.reconciliation-dialog--phone .el-dialog__footer) {
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.reconciliation-tab :deep(.reconciliation-dialog--phone .el-dialog__body) {
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}
.reconciliation-tab :deep(.reconciliation-dialog--phone .el-dialog__footer) {
  justify-content: flex-end;
}
.reconciliation-tab :deep(.reconciliation-dialog--phone .el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
</style>
