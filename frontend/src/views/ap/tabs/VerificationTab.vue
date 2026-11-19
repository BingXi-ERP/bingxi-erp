<!--
  VerificationTab.vue - 核销管理 Tab
  来源：原 ap/index.vue 中 核销管理 tab 内容
  拆分日期：2026-06-15 B3-1
-->
<template>
  <div class="verification-tab" :class="{ 'verification-tab--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ $t('apModule.verification.title') }}</h2>
      <div class="header-actions">
        <el-button type="primary" @click="openVerificationDialog()">
          <el-icon><Plus /></el-icon> {{ $t('apModule.verification.create') }}
        </el-button>
        <el-button :loading="autoVerifying" @click="handleAutoVerify">
          {{ $t('apModule.verification.autoVerify') }}
        </el-button>
      </div>
    </div>

    <el-card shadow="hover">
      <section v-if="isPhone" v-loading="verificationLoading" class="ap-verification-mobile">
        <ul class="card-list" :aria-label="$t('apModule.verification.listAria')">
          <li v-for="row in verifications" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('apModule.verification.verificationNo') }}</dt>
                <dd>{{ row.verification_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.verification.verificationDate') }}</dt>
                <dd>{{ row.verification_date }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.verification.verificationAmount') }}</dt>
                <dd>{{ formatMoney(row.total_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('common.status') }}</dt>
                <dd>
                  <el-tag
                    :type="row.verification_status === 'COMPLETED' ? 'success' : 'info'"
                    size="small"
                  >
                    {{
                      row.verification_status === 'COMPLETED'
                        ? $t('apModule.verification.statusCompleted')
                        : $t('apModule.verification.statusCancelled')
                    }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('common.createTime') }}</dt>
                <dd>{{ row.created_at }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button type="primary" @click="showVerificationDetail(row as APVerification)">
                {{ $t('common.detail') }}
              </el-button>
            </div>
          </li>
        </ul>
        <ElEmpty
          v-if="!verificationLoading && verifications.length === 0"
          :description="$t('components.v2Table.empty')"
        />
      </section>
      <el-table
        v-else
        v-loading="verificationLoading"
        :data="verifications"
        stripe
        :aria-label="$t('apModule.verification.listAria')"
      >
        <el-table-column
          prop="verification_no"
          :label="$t('apModule.verification.verificationNo')"
          width="140"
        />
        <el-table-column
          prop="verification_date"
          :label="$t('apModule.verification.verificationDate')"
          width="120"
        />
        <el-table-column
          :label="$t('apModule.verification.verificationAmount')"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatMoney(row.total_amount) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="verification_status"
          :label="$t('common.status')"
          width="90"
          align="center"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.verification_status === 'COMPLETED' ? 'success' : 'info'"
              size="small"
            >
              {{
                row.verification_status === 'COMPLETED'
                  ? $t('apModule.verification.statusCompleted')
                  : $t('apModule.verification.statusCancelled')
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" :label="$t('common.createTime')" width="160" />
        <el-table-column :label="$t('common.action')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="showVerificationDetail(row as APVerification)">
              {{ $t('common.detail') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="verificationDialogVisible"
      :title="$t('apModule.verification.createTitle')"
      :width="
        isPhone
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '600px'
      "
      class="verification-dialog"
      :class="{ 'verification-dialog--phone': isPhone }"
      :aria-label="$t('apModule.verification.createAria')"
    >
      <el-form
        ref="verificationFormRef"
        :model="verificationForm"
        :rules="verificationRules"
        label-width="100px"
        :label-position="isPhone ? 'top' : 'right'"
        :aria-label="$t('apModule.verification.formAria')"
      >
        <el-form-item :label="$t('apModule.verification.supplier')" prop="supplier_id">
          <el-select
            v-model="verificationForm.supplier_id"
            :placeholder="$t('apModule.verification.supplierPlaceholder')"
            style="width: 100%"
            @change="onSupplierChange"
          >
            <el-option v-for="s in suppliers" :key="s.id" :label="s.supplier_name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('apModule.verification.invoiceNo')" prop="invoice_id">
          <el-select
            v-model="verificationForm.invoice_id"
            :placeholder="$t('apModule.verification.invoicePlaceholder')"
            :disabled="!verificationForm.supplier_id"
            style="width: 100%"
          >
            <el-option
              v-for="inv in unverifiedInvoices"
              :key="inv.id"
              :label="
                $t('apModule.verification.invoiceOption', {
                  no: inv.invoice_no,
                  amount: formatMoney(inv.unpaid_amount),
                })
              "
              :value="inv.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('apModule.verification.paymentNo')" prop="payment_id">
          <el-select
            v-model="verificationForm.payment_id"
            :placeholder="$t('apModule.verification.paymentPlaceholder')"
            :disabled="!verificationForm.supplier_id"
            style="width: 100%"
          >
            <el-option
              v-for="pay in unverifiedPayments"
              :key="pay.id"
              :label="
                $t('apModule.verification.paymentOption', {
                  no: pay.payment_no,
                  amount: formatMoney(pay.payment_amount),
                })
              "
              :value="pay.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('apModule.verification.verificationAmount')" prop="amount">
          <el-input
            v-model="verificationAmountField.text"
            :disabled="!verificationForm.supplier_id"
            style="width: 100%"
            @blur="verificationAmountField.normalize()"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="verificationDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="verificationSubmitLoading"
          @click="submitVerification"
          >{{ $t('common.confirm') }}</el-button
        >
      </template>
    </el-dialog>

    <!-- 核销详情弹窗 -->
    <el-dialog
      v-model="detailVisible"
      :title="$t('apModule.verification.detail')"
      :width="
        isPhone
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '640px'
      "
      class="verification-detail-dialog"
      :class="{ 'verification-detail-dialog--phone': isPhone }"
    >
      <el-descriptions v-if="detailRow" :column="isPhone ? 1 : 2" border>
        <el-descriptions-item label="ID">{{ detailRow.id }}</el-descriptions-item>
        <el-descriptions-item :label="$t('common.status')">{{
          detailRow.verification_status === 'COMPLETED'
            ? $t('apModule.verification.statusCompleted')
            : $t('apModule.verification.statusCancelled')
        }}</el-descriptions-item>
        <el-descriptions-item :label="$t('apModule.verification.verificationNo')">
          {{ detailRow.verification_no }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('apModule.verification.verificationDate')">
          {{ detailRow.verification_date }}
        </el-descriptions-item>
        <el-descriptions-item :label="$t('apModule.verification.verificationAmount')" :span="2">
          {{
            Number(detailRow.total_amount ?? 0).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
            })
          }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button
          v-if="detailRow && detailRow.verification_status !== 'CANCELLED'"
          type="danger"
          :loading="cancelling"
          @click="handleCancelVerification(detailRow)"
        >
          {{ $t('apModule.verification.cancel') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, toRef, computed, onMounted } from 'vue';
import { useNumberField } from '@/composables/useNumberField';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { logger, logAuxLoadFailure } from '@/utils/logger';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElEmpty, type FormInstance, type FormRules } from 'element-plus';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import { Plus } from '@element-plus/icons-vue';
import { promptCancelReason } from '@/composables/useActionPrompts';
import { getSupplierList, type Supplier } from '@/api/supplier';
import {
  getAPVerificationList,
  getAPVerification,
  autoVerifyAP,
  cancelAPVerification,
  manualVerifyAP,
  getUnverifiedAPInvoices,
  getUnverifiedAPPayments,
  type APVerification,
} from '@/api/ap-verification';
import type { APInvoice } from '@/api/ap-invoice';
import type { APPayment } from '@/api/ap-payment';

const { t } = useI18n({ useScope: 'global' });

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const verifications = ref<APVerification[]>([]);
const verificationLoading = ref(false);
const unverifiedInvoices = ref<APInvoice[]>([]);
const unverifiedPayments = ref<APPayment[]>([]);
const suppliers = ref<Supplier[]>([]);

// 供应商列表：与发票/付款 tab 同款 getSupplierList，仅加载一次供核销弹窗下拉复用
const fetchSuppliers = async () => {
  try {
    const res = await getSupplierList({ page: 1, page_size: 1000 });
    suppliers.value = res.data?.items || [];
  } catch (e) {
    logAuxLoadFailure(t('apModule.verification.loadSuppliersFailed'), e);
  }
};

// 后端 rust_decimal（features=["serde"]）将金额序列化为字符串，number/string 双口径都要能显示
const formatMoney = (amount: number | string | undefined) => {
  if (amount === undefined || amount === '') return '0.00';
  const n = Number(amount);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
};

const fetchVerifications = async () => {
  verificationLoading.value = true;
  try {
    const res = await getAPVerificationList();
    const d = res.data as
      { list?: APVerification[]; items?: APVerification[] } | APVerification[] | undefined;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      verifications.value = d.list || d.items || [];
    } else {
      verifications.value = (d as APVerification[]) || [];
    }
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('apModule.verification.fetchListFailed'));
  } finally {
    verificationLoading.value = false;
  }
};

const verificationDialogVisible = ref(false);
const verificationSubmitLoading = ref(false);
const verificationFormRef = ref<FormInstance>();
const verificationForm = reactive({
  supplier_id: undefined as number | undefined,
  invoice_id: undefined as number | undefined,
  payment_id: undefined as number | undefined,
  amount: 0,
});

// 数值手输桥 范围与精度由单源校验器裁决（全项目禁步进控件）
const verificationAmountField = useNumberField(toRef(verificationForm, 'amount'), {
  label: t('apModule.verification.verificationAmount'),
  required: true,
  min: 0,
  precision: 2,
});

// supplier_id 为后端 ManualVerifyRequest 必填项（非 Option，直接落库），核销金额须 > 0
const verificationRules: FormRules = {
  supplier_id: [
    { required: true, message: t('apModule.verification.supplierRequired'), trigger: 'change' },
  ],
  invoice_id: [
    { required: true, message: t('apModule.verification.invoiceRequired'), trigger: 'change' },
  ],
  payment_id: [
    { required: true, message: t('apModule.verification.paymentRequired'), trigger: 'change' },
  ],
  amount: [
    verificationAmountField.rule,
    {
      // 核销金额须大于 0（后端 ManualVerifyRequest 同口径 必填且正数）
      validator: (_rule, value, callback) => {
        if (typeof value === 'number' && value > 0) callback();
        else callback(new Error(t('apModule.verification.amountRequired')));
      },
      trigger: 'blur',
    },
  ],
};

const loadUnverifiedForSupplier = async (supplierId: number) => {
  try {
    const [invRes, payRes] = await Promise.all([
      getUnverifiedAPInvoices(supplierId),
      getUnverifiedAPPayments(supplierId),
    ]);
    // 两端均返回裸数组（handlers/ap_verification_handler.rs:208/236 serde_json::to_value(Vec<...>)），
    // 无需多形状探测。
    // unpaid_amount 为 rust_decimal 出参十进制字符串，显式 Number 归一后再比较
    // （字符串与数字的 `>` 关系运算是隐式 coercion，契约要求逐点显式化）
    unverifiedInvoices.value = invRes.data.filter(i => Number(i.unpaid_amount) > 0);
    unverifiedPayments.value = payRes.data;
  } catch (e) {
    unverifiedInvoices.value = [];
    unverifiedPayments.value = [];
    logger.error(t('apModule.verification.unverifiedLoadFailed'), e);
  }
};

// 切换供应商：重置依赖供应商的已选发票/付款/金额，并按新供应商重新拉取未核销列表
const onSupplierChange = (supplierId: number | undefined) => {
  verificationForm.invoice_id = undefined;
  verificationForm.payment_id = undefined;
  verificationForm.amount = 0;
  if (supplierId) {
    void loadUnverifiedForSupplier(supplierId);
  } else {
    unverifiedInvoices.value = [];
    unverifiedPayments.value = [];
  }
};

const openVerificationDialog = () => {
  verificationFormRef.value?.clearValidate();
  verificationForm.supplier_id = undefined;
  verificationForm.invoice_id = undefined;
  verificationForm.payment_id = undefined;
  verificationForm.amount = 0;
  unverifiedInvoices.value = [];
  unverifiedPayments.value = [];
  verificationDialogVisible.value = true;
};

const submitVerification = async () => {
  const valid = await verificationFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  verificationSubmitLoading.value = true;
  try {
    await manualVerifyAP({
      supplier_id: verificationForm.supplier_id as number,
      items: [
        {
          invoice_id: verificationForm.invoice_id as number,
          payment_id: verificationForm.payment_id as number,
          // 后端 ApVerificationItemDto.verify_amount 为 rust_decimal（serde-floats 未启用，
          // JSON 浮点字面量反序列化即拒）：视图态 number 转两位小数十进制字符串下发
          verify_amount: verificationForm.amount.toFixed(2),
        },
      ],
    });
    ElMessage.success(t('apModule.verification.verifySuccess'));
    verificationDialogVisible.value = false;
    fetchVerifications();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    verificationSubmitLoading.value = false;
  }
};

// 自动核销：后端按到期发票与付款自动匹配核销
const autoVerifying = ref(false);
const handleAutoVerify = async () => {
  try {
    await ElMessageBox.confirm(
      t('apModule.verification.autoVerifyConfirm'),
      t('apModule.verification.autoVerify'),
      { type: 'info' }
    );
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('ap.VerificationTab.handleAutoVerify', error);
  }
  autoVerifying.value = true;
  try {
    // 后端契约：/ap/verifications/auto 需要供应商 ID
    const { value } = await ElMessageBox.prompt(
      t('apModule.verification.autoVerifyConfirm'),
      t('apModule.verification.autoVerify'),
      {
        type: 'info',
        inputValidator: v => {
          const n = Number(v);
          return Number.isInteger(n) && n > 0 ? true : '请输入有效的供应商 ID';
        },
      }
    );
    await autoVerifyAP({ supplier_id: Number(value) });
    ElMessage.success(t('apModule.verification.autoVerifySuccess'));
    fetchVerifications();
  } catch (e) {
    if (isDialogDismissal(e)) return;
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    autoVerifying.value = false;
  }
};

// 核销详情 + 取消核销
const detailVisible = ref(false);
const detailRow = ref<APVerification | null>(null);
const cancelling = ref(false);

const showVerificationDetail = async (row: APVerification) => {
  try {
    const res = await getAPVerification(row.id);
    detailRow.value = (res.data as APVerification) || row;
  } catch (error) {
    logger.error(t('apModule.verification.detailFailed'), error);
    detailRow.value = row;
  }
  detailVisible.value = true;
};

const handleCancelVerification = async (row: APVerification) => {
  // 后端 CancelVerificationRequest 必填 reason：真实采集取消原因，取消即中断。
  const reason = await promptCancelReason();
  if (!reason) return;
  cancelling.value = true;
  try {
    await cancelAPVerification(row.id, reason);
    ElMessage.success(t('common.success'));
    detailVisible.value = false;
    fetchVerifications();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    cancelling.value = false;
  }
};

defineExpose({ refresh: fetchVerifications });

onMounted(() => {
  fetchVerifications();
  fetchSuppliers();
});
</script>

<style scoped>
.ap-verification-mobile {
  min-width: 0;
}
.card-list {
  display: grid;
  gap: 16px;
  padding: 0;
  margin: 0 0 16px;
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

.verification-tab--phone .page-header,
.verification-tab--phone .header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.verification-tab--phone .page-header {
  align-items: flex-start;
}
.verification-tab--phone .page-title {
  overflow-wrap: anywhere;
}
.verification-tab--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
.verification-tab--phone :deep(.el-input__wrapper),
.verification-tab--phone :deep(.el-select__wrapper) {
  min-height: 44px;
  box-sizing: border-box;
}
.verification-tab--phone :deep(.el-form-item__content) {
  flex-wrap: wrap;
  gap: 8px;
}

.verification-tab :deep(.verification-dialog--phone),
.verification-tab :deep(.verification-detail-dialog--phone) {
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
.verification-tab :deep(.verification-dialog--phone .el-dialog__header),
.verification-tab :deep(.verification-dialog--phone .el-dialog__footer),
.verification-tab :deep(.verification-detail-dialog--phone .el-dialog__header),
.verification-tab :deep(.verification-detail-dialog--phone .el-dialog__footer) {
  flex-shrink: 0;
  overflow-wrap: anywhere;
}
.verification-tab :deep(.verification-dialog--phone .el-dialog__body),
.verification-tab :deep(.verification-detail-dialog--phone .el-dialog__body) {
  min-height: 0;
  max-height: none;
  overflow-y: auto;
}
.verification-tab :deep(.verification-dialog--phone .el-dialog__footer),
.verification-tab :deep(.verification-detail-dialog--phone .el-dialog__footer) {
  justify-content: flex-end;
}
.verification-tab :deep(.verification-dialog--phone .el-button),
.verification-tab :deep(.verification-detail-dialog--phone .el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
</style>
