<!--
  BudgetPlanTab.vue - 预算方案头列表（一级）
  消费后端 /budgets/plans（budget_plans）：列表 + 新建 + 审批/驳回 + 进入明细行。
  方案与明细的关联通过 budget_items.plan_id（见 BudgetItemTab.vue）。
-->
<template>
  <div class="budget-plan-tab" :class="{ 'budget-plan-tab--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ $t('budget.plan.title') }}</h2>
      <div>
        <el-button v-permission="PERMISSIONS.BUDGET_CREATE" type="primary" @click="openDialog()">
          <el-icon><Plus /></el-icon>{{ $t('budget.plan.create') }}
        </el-button>
      </div>
    </div>

    <el-card shadow="hover">
      <section v-if="isPhone" v-loading="loading" class="budget-plan-mobile">
        <ul v-if="plans.length" class="card-list" :aria-label="$t('budget.plan.table.ariaLabel')">
          <li v-for="row in plans" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('budget.plan.table.planNo') }}</dt>
                <dd>{{ row.plan_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.planName') }}</dt>
                <dd>{{ row.plan_name }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.budgetYear') }}</dt>
                <dd>{{ row.budget_year }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.budgetType') }}</dt>
                <dd>{{ row.budget_type }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.departmentId') }}</dt>
                <dd>{{ row.department_id ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.totalAmount') }}</dt>
                <dd>¥{{ amountOf(row.total_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('budget.plan.table.status') }}</dt>
                <dd>
                  <el-tag :type="planTagType(row.status)">{{ planStatusLabel(row.status) }}</el-tag>
                </dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button size="small" type="primary" @click="emit('select', row)">
                {{ $t('budget.plan.viewItems') }}
              </el-button>
              <el-button
                v-if="row.status === 'draft'"
                v-permission="PERMISSIONS.BUDGET_APPROVE"
                size="small"
                type="success"
                @click="handleApprove(row)"
              >
                {{ $t('budget.plan.table.approve') }}
              </el-button>
              <el-button
                v-if="row.status === 'draft'"
                v-permission="PERMISSIONS.BUDGET_APPROVE"
                size="small"
                type="warning"
                @click="handleReject(row)"
              >
                {{ $t('budget.plan.table.reject') }}
              </el-button>
            </div>
          </li>
        </ul>
        <el-empty v-else :description="$t('components.v2Table.empty')" />
      </section>
      <el-table
        v-else
        v-loading="loading"
        :data="plans"
        stripe
        row-key="id"
        :aria-label="$t('budget.plan.table.ariaLabel')"
      >
        <el-table-column prop="plan_no" :label="$t('budget.plan.table.planNo')" min-width="140" />
        <el-table-column
          prop="plan_name"
          :label="$t('budget.plan.table.planName')"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column
          prop="budget_year"
          :label="$t('budget.plan.table.budgetYear')"
          width="110"
          align="center"
        />
        <el-table-column
          prop="budget_type"
          :label="$t('budget.plan.table.budgetType')"
          width="130"
        />
        <el-table-column :label="$t('budget.plan.table.departmentId')" width="110" align="center">
          <template #default="{ row }">{{ row.department_id ?? '-' }}</template>
        </el-table-column>
        <el-table-column :label="$t('budget.plan.table.totalAmount')" width="150" align="right">
          <template #default="{ row }">¥{{ amountOf(row.total_amount) }}</template>
        </el-table-column>
        <el-table-column :label="$t('budget.plan.table.status')" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="planTagType(row.status)">{{ planStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('budget.plan.table.operation')" width="240" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="emit('select', row)">
              {{ $t('budget.plan.viewItems') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              v-permission="PERMISSIONS.BUDGET_APPROVE"
              type="success"
              link
              size="small"
              @click="handleApprove(row)"
            >
              {{ $t('budget.plan.table.approve') }}
            </el-button>
            <el-button
              v-if="row.status === 'draft'"
              v-permission="PERMISSIONS.BUDGET_APPROVE"
              type="warning"
              link
              size="small"
              @click="handleReject(row)"
            >
              {{ $t('budget.plan.table.reject') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="$t('budget.plan.dialog.createTitle')"
      :width="isPhone ? phoneDialogWidth : '520px'"
      class="budget-plan-dialog"
      :class="{ 'budget-plan-dialog--phone': isPhone }"
      :aria-label="$t('budget.plan.dialog.formAriaLabel')"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
        :label-position="isPhone ? 'top' : 'right'"
        :aria-label="$t('budget.plan.dialog.formAriaLabel')"
      >
        <el-form-item :label="$t('budget.plan.dialog.planNo')" prop="plan_no">
          <el-input
            v-model="form.plan_no"
            :placeholder="$t('budget.plan.dialog.planNoPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.planName')" prop="plan_name">
          <el-input v-model="form.plan_name" />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.budgetYear')" prop="budget_year">
          <el-input
            v-model="budgetYearField.text"
            style="width: 100%"
            @blur="budgetYearField.normalize()"
          />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.budgetType')" prop="budget_type">
          <el-input
            v-model="form.budget_type"
            :placeholder="$t('budget.plan.dialog.budgetTypePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.departmentId')" prop="department_id">
          <el-input
            v-model="departmentIdField.text"
            style="width: 100%"
            @blur="departmentIdField.normalize()"
          />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.totalAmount')" prop="total_amount">
          <el-input
            v-model="totalAmountField.text"
            style="width: 100%"
            @blur="totalAmountField.normalize()"
          />
        </el-form-item>
        <el-form-item :label="$t('budget.plan.dialog.remark')" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('budget.plan.dialog.cancel') }}</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          {{ $t('budget.plan.dialog.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, toRef, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { useNumberField } from '@/composables/useNumberField';
import {
  getBudgetPlanList,
  createBudgetPlan,
  approveBudgetPlan,
  rejectBudgetPlan,
  type BudgetPlan,
} from '@/api/budget';
import { PERMISSIONS } from '@/constants/permissions';
import { isDialogDismissal } from '@/utils/monitor';
import { useBreakpoint } from '@/composables/useBreakpoint';

const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
const emit = defineEmits<{ (e: 'select', plan: BudgetPlan): void }>();

const loading = ref(false);
const plans = ref<BudgetPlan[]>([]);

const amountOf = (value: string | number | null | undefined): string =>
  Number(value ?? 0).toFixed(2);

const PLAN_STATUS_TYPE: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'primary'> = {
  draft: 'info',
  approved: 'success',
  rejected: 'danger',
  active: 'primary',
  closed: 'info',
};

const planTagType = (status: string | null) => (status && PLAN_STATUS_TYPE[status]) || 'info';
const planStatusLabel = (status: string | null) =>
  status ? t(`budget.plan.status.${status}`) : '-';

const loadPlans = async () => {
  loading.value = true;
  try {
    const res = await getBudgetPlanList({ page: 1, page_size: 100 });
    plans.value = Array.isArray(res.data) ? res.data : [];
  } catch (error) {
    ElMessage.error((error as Error)?.message || t('budget.plan.message.loadFailed'));
  } finally {
    loading.value = false;
  }
};
loadPlans();

// ===== 新建方案 =====
const dialogVisible = ref(false);
const submitLoading = ref(false);
const formRef = ref<FormInstance>();

const emptyForm = () => ({
  plan_no: '',
  plan_name: '',
  budget_year: new Date().getFullYear() as number,
  budget_type: '',
  department_id: undefined as number | undefined,
  total_amount: 0,
  remark: '',
});

const form = reactive(emptyForm());

// 数值手输桥 范围与精度由单源校验器裁决（全项目禁步进控件）
const budgetYearField = useNumberField(toRef(form, 'budget_year'), {
  label: t('budget.plan.dialog.budgetYear'),
  required: true,
  min: 2000,
  max: 2100,
  precision: 0,
  requiredMessage: t('budget.plan.validation.budgetYearRequired'),
});
const departmentIdField = useNumberField(
  toRef(form, 'department_id'),
  {
    label: t('budget.plan.dialog.departmentId'),
    required: true,
    min: 1,
    precision: 0,
    requiredMessage: t('budget.plan.validation.departmentRequired'),
  },
  'undefined'
);
const totalAmountField = useNumberField(toRef(form, 'total_amount'), {
  label: t('budget.plan.dialog.totalAmount'),
  min: 0,
  precision: 2,
});

const rules: FormRules = {
  plan_name: [
    { required: true, message: t('budget.plan.validation.planNameRequired'), trigger: 'blur' },
  ],
  budget_year: [budgetYearField.rule],
  department_id: [departmentIdField.rule],
  total_amount: [totalAmountField.rule],
};

const openDialog = () => {
  formRef.value?.resetFields();
  Object.assign(form, emptyForm());
  dialogVisible.value = true;
};

const handleSubmit = async () => {
  if (!formRef.value) return;
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  submitLoading.value = true;
  try {
    await createBudgetPlan({
      plan_no: form.plan_no || undefined,
      plan_name: form.plan_name,
      budget_year: form.budget_year,
      budget_type: form.budget_type || undefined,
      department_id: form.department_id as number,
      // 后端 CreateBudgetPlanRequest.total_amount 为 Option<rust_decimal>（serde-floats 未启用，
      // JSON 浮点字面量反序列化即拒）：视图态 number 转两位小数十进制字符串下发
      total_amount: form.total_amount.toFixed(2),
      remark: form.remark || undefined,
    });
    ElMessage.success(t('budget.plan.message.created'));
    dialogVisible.value = false;
    await loadPlans();
  } catch (error) {
    ElMessage.error((error as Error)?.message || t('budget.message.operationFailed'));
  } finally {
    submitLoading.value = false;
  }
};

// ===== 方案审批 / 驳回 =====
const handleApprove = async (row: BudgetPlan) => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('budget.plan.message.approveConfirm', { name: row.plan_name }),
      t('budget.plan.message.comment'),
      {
        confirmButtonText: t('budget.plan.dialog.confirm'),
        cancelButtonText: t('budget.plan.dialog.cancel'),
        inputPlaceholder: t('budget.plan.message.commentPlaceholder'),
      }
    );
    await approveBudgetPlan(row.id, value || undefined);
    ElMessage.success(t('budget.auditSuccess'));
    await loadPlans();
  } catch (error) {
    if (!isDialogDismissal(error)) {
      ElMessage.error((error as Error)?.message || t('budget.message.auditFailed'));
    }
  }
};

const handleReject = async (row: BudgetPlan) => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('budget.plan.message.rejectConfirm', { name: row.plan_name }),
      t('budget.plan.message.comment'),
      {
        confirmButtonText: t('budget.plan.dialog.confirm'),
        cancelButtonText: t('budget.plan.dialog.cancel'),
        inputPlaceholder: t('budget.plan.message.commentPlaceholder'),
      }
    );
    await rejectBudgetPlan(row.id, value || undefined);
    ElMessage.success(t('budget.auditSuccess'));
    await loadPlans();
  } catch (error) {
    if (!isDialogDismissal(error)) {
      ElMessage.error((error as Error)?.message || t('budget.message.auditFailed'));
    }
  }
};
</script>

<style scoped>
.budget-plan-tab {
  min-height: 100%;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  overflow-wrap: anywhere;
}
.budget-plan-tab--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
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
.budget-plan-tab :deep(.budget-plan-dialog--phone) {
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
.budget-plan-tab :deep(.budget-plan-dialog--phone .el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
}
</style>
