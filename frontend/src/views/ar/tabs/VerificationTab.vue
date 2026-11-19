<!--
  VerificationTab.vue - 应收核销管理
  核销列表 + 自动核销 + 手动核销 + 详情 + 取消核销
  数据源：/ar/verifications（api/ar.ts 封装）
-->
<template>
  <div class="ar-verification-tab" :class="{ 'ar-verification-tab--phone': isPhone }">
    <div class="tab-toolbar">
      <el-button type="primary" @click="openManualDialog">
        {{ t('arModule.verification.manual') }}
      </el-button>
      <el-button :loading="autoVerifying" @click="handleAutoVerify">
        {{ t('arModule.verification.auto') }}
      </el-button>
      <el-button @click="fetchVerifications">{{ t('common.refresh') }}</el-button>
    </div>

    <section
      v-if="isPhone"
      v-loading="loading"
      class="ar-verification-mobile"
      :aria-label="t('arModule.tabs.verification')"
    >
      <ul class="card-list">
        <li v-for="row in verifications" :key="row.id" class="card-item">
          <dl class="card-fields">
            <div class="field-emphasis">
              <dt>ID</dt>
              <dd>{{ row.id }}</dd>
            </div>
            <div>
              <dt>{{ t('arModule.verification.invoiceNo') }}</dt>
              <dd>{{ row.invoice_no }}</dd>
            </div>
            <div>
              <dt>{{ t('arModule.verification.paymentNo') }}</dt>
              <dd>{{ row.payment_no }}</dd>
            </div>
            <div>
              <dt>{{ t('arModule.verification.date') }}</dt>
              <dd>{{ row.verification_date }}</dd>
            </div>
            <div>
              <dt>{{ t('arModule.verification.amount') }}</dt>
              <dd>{{ formatMoney(row.verification_amount) }}</dd>
            </div>
            <div>
              <dt>{{ t('common.status') }}</dt>
              <dd>
                <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
                  {{ row.status }}
                </el-tag>
              </dd>
            </div>
          </dl>
          <div class="card-actions">
            <el-button @click="showDetail(row)">
              {{ t('common.detail') }}
            </el-button>
            <el-button
              v-if="row.status === 'active'"
              type="danger"
              @click="cancelVerification(row)"
            >
              {{ t('arModule.verification.cancel') }}
            </el-button>
          </div>
        </li>
      </ul>
      <ElEmpty
        v-if="!loading && verifications.length === 0"
        :description="t('components.v2Table.empty')"
      />
    </section>

    <el-table v-else v-loading="loading" :data="verifications" border stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column
        prop="invoice_no"
        :label="t('arModule.verification.invoiceNo')"
        min-width="150"
      />
      <el-table-column
        prop="payment_no"
        :label="t('arModule.verification.paymentNo')"
        min-width="150"
      />
      <el-table-column
        prop="verification_date"
        :label="t('arModule.verification.date')"
        width="110"
      />
      <el-table-column
        prop="verification_amount"
        :label="t('arModule.verification.amount')"
        width="130"
        align="right"
      >
        <template #default="{ row }">{{ formatMoney(row.verification_amount) }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.action')" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link @click="showDetail(row)">
            {{ t('common.detail') }}
          </el-button>
          <el-button
            v-if="row.status === 'active'"
            size="small"
            type="danger"
            link
            @click="cancelVerification(row)"
          >
            {{ t('arModule.verification.cancel') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 手动核销对话框 -->
    <el-dialog
      v-model="manualVisible"
      :title="t('arModule.verification.manual')"
      :width="
        isPhone
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '560px'
      "
      class="ar-verification-dialog"
      :class="{ 'ar-verification-dialog--phone': isPhone }"
    >
      <el-form
        ref="manualFormRef"
        :model="manualForm"
        :rules="manualRules"
        label-width="110px"
        :label-position="isPhone ? 'top' : 'right'"
      >
        <el-form-item :label="t('arModule.verification.invoice')" prop="invoice_id">
          <el-select v-model="manualForm.invoice_id" filterable>
            <el-option
              v-for="inv in unverifiedInvoices"
              :key="inv.id"
              :label="`${inv.invoice_no}（未核销 ${formatMoney(inv.unpaid_amount)}）`"
              :value="inv.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('arModule.verification.payment')" prop="payment_id">
          <el-select v-model="manualForm.payment_id" filterable>
            <el-option
              v-for="pay in unverifiedPayments"
              :key="pay.id"
              :label="`${pay.payment_no}（${formatMoney(pay.amount)}）`"
              :value="pay.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('arModule.verification.amount')" prop="verification_amount">
          <el-input
            v-model="verificationAmountField.text"
            @blur="verificationAmountField.normalize()"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitManual">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 详情对话框 -->
    <el-dialog
      v-model="detailVisible"
      :title="t('arModule.verification.detailTitle')"
      :width="
        isPhone
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '600px'
      "
      class="ar-verification-detail-dialog"
      :class="{ 'ar-verification-detail-dialog--phone': isPhone }"
    >
      <el-descriptions v-if="detailRow" :column="isPhone ? 1 : 2" border>
        <el-descriptions-item label="ID">{{ detailRow.id }}</el-descriptions-item>
        <el-descriptions-item :label="t('common.status')">{{
          detailRow.status
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('arModule.verification.invoiceNo')">
          {{ detailRow.invoice_no }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('arModule.verification.paymentNo')">
          {{ detailRow.payment_no }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('arModule.verification.amount')">
          {{ formatMoney(detailRow.verification_amount) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('arModule.verification.date')">
          {{ detailRow.verification_date }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, toRef, computed, onMounted } from 'vue';
import { logger } from '@/utils/logger';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElEmpty } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import { useNumberField } from '@/composables/useNumberField';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  getARVerificationList,
  getARVerification,
  autoVerifyAR,
  manualVerifyAR,
  cancelARVerification,
  getUnverifiedARInvoices,
  getUnverifiedARPayments,
  type ARVerification,
  type ARInvoice,
  type ARPayment,
} from '@/api/ar';

const { t } = useI18n({ useScope: 'global' });

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const verifications = ref<ARVerification[]>([]);
const loading = ref(false);
const autoVerifying = ref(false);
const manualVisible = ref(false);
const detailVisible = ref(false);
const detailRow = ref<ARVerification | null>(null);
const submitting = ref(false);
const manualFormRef = ref<FormInstance>();
const unverifiedInvoices = ref<ARInvoice[]>([]);
const unverifiedPayments = ref<ARPayment[]>([]);

const formatMoney = (amount: number | string | undefined) => {
  const n = Number(amount ?? 0);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
};

const fetchVerifications = async () => {
  loading.value = true;
  try {
    const res = await getARVerificationList();
    // 后端 ar_verification_handler::list_verifications 载荷承载数组的键为 `list`
    verifications.value = res.data.list;
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    loading.value = false;
  }
};

const handleAutoVerify = async () => {
  try {
    await ElMessageBox.confirm(
      t('arModule.verification.autoConfirm'),
      t('arModule.verification.auto'),
      { type: 'info' }
    );
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('ar.VerificationTab.handleAutoVerify', error);
  }
  autoVerifying.value = true;
  try {
    await autoVerifyAR();
    ElMessage.success(t('arModule.verification.autoSuccess'));
    fetchVerifications();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    autoVerifying.value = false;
  }
};

const manualForm = reactive({
  invoice_id: undefined as number | undefined,
  payment_id: undefined as number | undefined,
  verification_amount: 0,
});

// 数值手输桥 范围与精度由单源校验器裁决（全项目禁步进控件）
const verificationAmountField = useNumberField(toRef(manualForm, 'verification_amount'), {
  label: t('arModule.verification.amount'),
  required: true,
  min: 0.01,
  precision: 2,
  requiredMessage: t('arModule.verification.amountRequired'),
});

const manualRules: FormRules = {
  invoice_id: [
    { required: true, message: t('arModule.verification.invoiceRequired'), trigger: 'change' },
  ],
  payment_id: [
    { required: true, message: t('arModule.verification.paymentRequired'), trigger: 'change' },
  ],
  verification_amount: [verificationAmountField.rule],
};

const openManualDialog = async () => {
  manualForm.invoice_id = undefined;
  manualForm.payment_id = undefined;
  manualForm.verification_amount = 0;
  manualVisible.value = true;
  try {
    const [invRes, payRes] = await Promise.all([
      getUnverifiedARInvoices(),
      getUnverifiedARPayments(),
    ]);
    // 后端 get_unverified_invoices/payments 直接返回裸数组
    unverifiedInvoices.value = invRes.data;
    unverifiedPayments.value = payRes.data;
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  }
};

const submitManual = async () => {
  const valid = await manualFormRef.value?.validate().catch(() => false);
  if (!valid || !manualForm.invoice_id || !manualForm.payment_id) return;
  submitting.value = true;
  try {
    await manualVerifyAR({
      invoice_id: manualForm.invoice_id,
      payment_id: manualForm.payment_id,
      amount: manualForm.verification_amount,
    });
    ElMessage.success(t('common.success'));
    manualVisible.value = false;
    fetchVerifications();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    submitting.value = false;
  }
};

const showDetail = async (row: ARVerification) => {
  try {
    const res = await getARVerification(row.id);
    detailRow.value = (res.data as ARVerification) || row;
  } catch (error) {
    logger.error(t('arModule.verification.detailFailed'), error);
    detailRow.value = row;
  }
  detailVisible.value = true;
};

const cancelVerification = async (row: ARVerification) => {
  try {
    await ElMessageBox.confirm(
      t('arModule.verification.cancelConfirm'),
      t('arModule.verification.cancel'),
      { type: 'warning' }
    );
    await cancelARVerification(row.id);
    ElMessage.success(t('common.success'));
    fetchVerifications();
  } catch (e) {
    if (!isDialogDismissal(e)) {
      const err = e as { message?: string };
      ElMessage.error(err.message || t('common.failed'));
    }
  }
};

defineExpose({ refresh: fetchVerifications });

onMounted(() => {
  fetchVerifications();
});
</script>

<style scoped>
.tab-toolbar {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.ar-verification-mobile {
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

.ar-verification-tab--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.ar-verification-tab--phone :deep(.el-input__wrapper),
.ar-verification-tab--phone :deep(.el-select__wrapper) {
  min-height: 44px;
  box-sizing: border-box;
}
.ar-verification-tab--phone :deep(.el-form-item__content) {
  flex-wrap: wrap;
  gap: 8px;
}

.ar-verification-tab :deep(.ar-verification-dialog--phone),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone) {
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
.ar-verification-tab :deep(.ar-verification-dialog--phone .el-dialog__header),
.ar-verification-tab :deep(.ar-verification-dialog--phone .el-dialog__footer),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone .el-dialog__header),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone .el-dialog__footer) {
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.ar-verification-tab :deep(.ar-verification-dialog--phone .el-dialog__body),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone .el-dialog__body) {
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}
.ar-verification-tab :deep(.ar-verification-dialog--phone .el-dialog__footer),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone .el-dialog__footer) {
  justify-content: flex-end;
}
.ar-verification-tab :deep(.ar-verification-dialog--phone .el-button),
.ar-verification-tab :deep(.ar-verification-detail-dialog--phone .el-button) {
  min-width: 44px;
  min-height: 44px;
  white-space: normal;
}
</style>
