<template>
  <div class="page">
    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('wage.tabs.records')" name="records">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ t('wage.title') }}</span>
              <el-button type="primary" @click="dialogVisible = true">
                {{ t('wage.actions.newRecord') }}
              </el-button>
            </div>
          </template>
          <el-table v-loading="loading" :data="records" border>
            <el-table-column prop="id" label="ID" width="70" />
            <el-table-column :label="t('wage.fields.status')" width="110">
              <template #default="{ row }">
                <el-tag :type="statusTag(row.status)">{{ recordStatusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="period_start"
              :label="t('wage.fields.periodStart')"
              width="120"
            />
            <el-table-column prop="period_end" :label="t('wage.fields.periodEnd')" width="120" />
            <el-table-column
              prop="workshop"
              :label="t('wage.fields.workshop')"
              min-width="120"
              show-overflow-tooltip
            />
            <el-table-column
              prop="remarks"
              :label="t('wage.fields.remarks')"
              min-width="140"
              show-overflow-tooltip
            />
            <el-table-column :label="t('common.operation')" width="330" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="canCalculateWageRecord(row.status)"
                  size="small"
                  type="primary"
                  @click="onCalculate(row)"
                  >{{ t('wage.actions.calculate') }}</el-button
                >
                <el-button
                  v-if="canConfirmWageRecord(row.status)"
                  size="small"
                  type="success"
                  @click="onConfirm(row)"
                  >{{ t('wage.actions.confirm') }}</el-button
                >
                <el-button
                  v-if="canPayWageRecord(row.status)"
                  size="small"
                  type="success"
                  plain
                  @click="onPay(row)"
                  >{{ t('wage.actions.pay') }}</el-button
                >
                <el-button
                  v-if="canCancelWageRecord(row.status)"
                  size="small"
                  type="danger"
                  plain
                  @click="onCancel(row)"
                  >{{ t('wage.actions.cancel') }}</el-button
                >
                <el-button
                  v-if="canEditWageRecord(row.status)"
                  size="small"
                  type="warning"
                  plain
                  @click="onEditRecord(row)"
                  >{{ t('wage.actions.edit') }}</el-button
                >
                <el-button
                  v-if="canDeleteWageRecord(row.status)"
                  size="small"
                  type="danger"
                  @click="onDeleteRecord(row)"
                  >{{ t('wage.actions.delete') }}</el-button
                >
                <el-button size="small" @click="onDetails(row)">
                  {{ t('wage.actions.details') }}
                </el-button>
                <el-button size="small" type="success" plain @click="onExportDetails(row)">
                  {{ t('wage.actions.export') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane :label="t('wage.tabs.rates')" name="rates">
        <div class="card-header" style="margin-bottom: 12px">
          <el-button type="primary" @click="openRateDialog()">
            {{ t('wage.actions.newRate') }}
          </el-button>
          <el-button plain @click="effectiveVisible = true">
            {{ t('wage.actions.effectiveQuery') }}
          </el-button>
        </div>
        <el-table v-loading="rateLoading" :data="wageRates" border>
          <el-table-column prop="rate_no" :label="t('wage.fields.rateNo')" min-width="170" />
          <el-table-column
            prop="process_route_id"
            :label="t('wage.fields.processRouteId')"
            width="120"
          />
          <el-table-column prop="route_name" :label="t('wage.fields.routeName')" min-width="130" />
          <el-table-column :label="t('wage.fields.wageType')" width="100">
            <template #default="{ row }">{{ wageTypeLabel(row.wage_type) }}</template>
          </el-table-column>
          <el-table-column :label="t('wage.fields.prices')" width="150">
            <template #default="{ row }">
              {{ Number(row.piece_price).toLocaleString() }} /
              {{ Number(row.time_price).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column
            prop="effective_date"
            :label="t('wage.fields.effectiveDate')"
            width="120"
          />
          <el-table-column :label="t('wage.fields.status')" width="100">
            <template #default="{ row }">
              <el-tag :type="rateStatusTag(row.status)" size="small">
                {{ rateStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.operation')" width="250" fixed="right">
            <template #default="{ row }">
              <el-button v-if="canEditWageRate(row.status)" size="small" @click="onEditRate(row)">
                {{ t('wage.actions.edit') }}
              </el-button>
              <el-button
                v-if="canActivateWageRate(row.status)"
                size="small"
                type="success"
                @click="onActivateRate(row)"
              >
                {{ t('wage.actions.activate') }}
              </el-button>
              <el-button
                v-if="canDisableWageRate(row.status)"
                size="small"
                type="warning"
                @click="onDisableRate(row)"
              >
                {{ t('wage.actions.disable') }}
              </el-button>
              <el-button
                v-if="canDeleteWageRate(row.status)"
                size="small"
                type="danger"
                plain
                @click="onDeleteRate(row)"
              >
                {{ t('wage.actions.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialogVisible" :title="t('wage.actions.newRecord')" width="480">
      <el-form :model="form" label-width="100px" :label-position="isPhone ? 'top' : 'right'">
        <el-form-item :label="t('wage.fields.periodStart')" required>
          <el-date-picker
            v-model="form.period_start"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.periodEnd')" required>
          <el-date-picker
            v-model="form.period_end"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.workshop')">
          <el-input v-model="form.workshop" />
        </el-form-item>
        <el-form-item :label="t('wage.fields.remarks')">
          <el-input v-model="form.remarks" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="onCreate">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailsVisible" :title="t('wage.detailsTitle')" width="720">
      <div class="toolbar" style="margin-bottom: 8px">
        <el-input
          v-model="workerIdField.text"
          :placeholder="t('wage.workerId')"
          style="width: 140px"
          @blur="workerIdField.normalize()"
        />
        <el-button type="primary" plain :loading="workerLoading" @click="onWorkerDetails">
          {{ t('wage.queryWorkerHistory') }}
        </el-button>
      </div>
      <el-table :data="details" border max-height="420">
        <el-table-column
          v-for="col in detailCols"
          :key="col"
          :prop="col"
          :label="col.replace(/_/g, ' ')"
          min-width="120"
          show-overflow-tooltip
        />
      </el-table>
    </el-dialog>

    <!-- 编辑工资单（updateWageRecord：draft 态修改车间/备注） -->
    <el-dialog v-model="recordEditVisible" :title="t('wage.editRecordTitle')" width="480">
      <el-form
        :model="recordEditForm"
        label-width="90px"
        :label-position="isPhone ? 'top' : 'right'"
      >
        <el-form-item :label="t('wage.fields.workshop')">
          <el-input v-model="recordEditForm.workshop" />
        </el-form-item>
        <el-form-item :label="t('wage.fields.remarks')">
          <el-input v-model="recordEditForm.remarks" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordEditVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="recordSaving" @click="onSaveRecord">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 生效费率查询（getEffectiveWageRate） -->
    <el-dialog
      v-model="effectiveVisible"
      :title="t('wage.messages.effectiveQueryTitle')"
      width="440"
    >
      <div class="toolbar" style="margin-bottom: 8px">
        <el-select
          v-model="effectiveForm.process_route_id"
          filterable
          :placeholder="t('wage.fields.processRoute')"
          style="width: 180px"
        >
          <el-option
            v-for="route in processRoutes"
            :key="route.id"
            :label="`${route.route_code} ${route.route_name}`"
            :value="route.id"
          />
        </el-select>
        <el-date-picker
          v-model="effectiveForm.date"
          type="date"
          value-format="YYYY-MM-DD"
          :placeholder="t('wage.messages.effectiveDatePlaceholder')"
          style="width: 160px"
        />
        <el-button type="primary" :loading="effectiveLoading" @click="onQueryEffective">
          {{ t('wage.actions.query') }}
        </el-button>
      </div>
      <pre v-if="effectiveResult" class="effective-result">{{ effectiveResult }}</pre>
    </el-dialog>

    <!-- 工资费率新建/编辑（createWageRate/updateWageRate） -->
    <el-dialog v-model="rateDialogVisible" :title="t('wage.messages.rateTitle')" width="520">
      <el-form :model="rateForm" label-width="110px" :label-position="isPhone ? 'top' : 'right'">
        <el-form-item :label="t('wage.fields.processRoute')" required>
          <el-select
            v-model="rateForm.process_route_id"
            filterable
            :disabled="editingRateId !== null"
            :placeholder="t('wage.fields.processRoute')"
            class="w-full"
          >
            <el-option
              v-for="route in processRoutes"
              :key="route.id"
              :label="`${route.route_code} ${route.route_name}`"
              :value="route.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('wage.fields.wageType')" required>
          <el-select v-model="rateForm.wage_type" class="w-full">
            <el-option :label="t('wage.types.piece')" value="piece" />
            <el-option :label="t('wage.types.time')" value="time" />
            <el-option :label="t('wage.types.mixed')" value="mixed" />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="rateForm.wage_type !== 'time'"
          :label="t('wage.fields.piecePrice')"
          required
        >
          <el-input
            v-model="piecePriceField.text"
            inputmode="decimal"
            class="w-full"
            @blur="piecePriceField.normalize"
          />
        </el-form-item>
        <el-form-item
          v-if="rateForm.wage_type !== 'piece'"
          :label="t('wage.fields.timePrice')"
          required
        >
          <el-input
            v-model="timePriceField.text"
            inputmode="decimal"
            class="w-full"
            @blur="timePriceField.normalize"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.gradeARatio')">
          <el-input
            v-model="gradeAField.text"
            inputmode="decimal"
            class="w-full"
            @blur="gradeAField.normalize"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.gradeBRatio')">
          <el-input
            v-model="gradeBField.text"
            inputmode="decimal"
            class="w-full"
            @blur="gradeBField.normalize"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.gradeCRatio')">
          <el-input
            v-model="gradeCField.text"
            inputmode="decimal"
            class="w-full"
            @blur="gradeCField.normalize"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.effectiveDate')" required>
          <el-date-picker
            v-model="rateForm.effective_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.expiryDate')">
          <el-date-picker
            v-model="rateForm.expiry_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="w-full"
          />
        </el-form-item>
        <el-form-item :label="t('wage.fields.workshop')">
          <el-input v-model="rateForm.workshop" />
        </el-form-item>
        <el-form-item :label="t('wage.fields.remarks')">
          <el-input v-model="rateForm.remarks" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rateDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="rateSaving" @click="onSaveRate">
          {{ t('wage.actions.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  useNumberField,
  validateNumberValue,
  type NumberFieldSpec,
} from '@/composables/useNumberField';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import { logAuxLoadFailure } from '@/utils/logger';
import {
  calculateWageRecord,
  cancelWageRecord,
  confirmWageRecord,
  createWageRecord,
  getWageRecordDetails,
  getWageRecordList,
  payWageRecord,
  getWageRateList,
  createWageRate,
  updateWageRate,
  deleteWageRate,
  activateWageRate,
  disableWageRate,
  updateWageRecord,
  deleteWageRecord,
  exportWageRecordDetails,
  getWageDetailsByWorker,
  getEffectiveWageRate,
  type WageRecord,
  type WageRecordStatus,
  type WageRate,
  type WageRateStatus,
  type WageType,
} from '@/api/wage';
import { listProcessRoutes, type ProcessRoute } from '@/api/flow-card';
import {
  canCalculateWageRecord,
  canCancelWageRecord,
  canConfirmWageRecord,
  canDeleteWageRecord,
  canEditWageRecord,
  canPayWageRecord,
} from '@/utils/wage-record';
import {
  buildCreateWageRatePayload,
  buildUpdateWageRatePayload,
  canActivateWageRate,
  canDeleteWageRate,
  canDisableWageRate,
  canEditWageRate,
  type WageRateFormValues,
} from '@/utils/wage-rate';
const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const records = ref<WageRecord[]>([]);
const details = ref<Array<Record<string, unknown>>>([]);
const loading = ref(false);
const saving = ref(false);
const dialogVisible = ref(false);
const detailsVisible = ref(false);
const detailCols = ref<string[]>([]);

const form = reactive({ period_start: '', period_end: '', workshop: '', remarks: '' });

const unwrapList = <T,>(p: unknown): T[] => (p as { data: { items: T[] } }).data.items;

const statusTag = (s: WageRecordStatus) => {
  const tags: Record<WageRecordStatus, 'info' | 'primary' | 'success' | 'danger'> = {
    draft: 'info',
    confirmed: 'success',
    paid: 'primary',
    cancelled: 'danger',
  };
  return tags[s];
};

const recordStatusLabel = (status: WageRecordStatus) => {
  const labels: Record<WageRecordStatus, string> = {
    draft: t('wage.recordStatus.draft'),
    confirmed: t('wage.recordStatus.confirmed'),
    paid: t('wage.recordStatus.paid'),
    cancelled: t('wage.recordStatus.cancelled'),
  };
  return labels[status];
};

async function load() {
  loading.value = true;
  try {
    records.value = unwrapList(await getWageRecordList());
  } catch (e: unknown) {
    logAuxLoadFailure(t('wage.messages.loadRecordsFailed'), e);
  } finally {
    loading.value = false;
  }
}

async function onCreate() {
  if (!form.period_start || !form.period_end) {
    ElMessage.warning(t('wage.validation.periodRequired'));
    return;
  }
  saving.value = true;
  try {
    await createWageRecord({
      period_start: form.period_start,
      period_end: form.period_end,
      workshop: form.workshop || undefined,
      remarks: form.remarks || undefined,
    });
    ElMessage.success(t('wage.messages.created'));
    dialogVisible.value = false;
    await load();
  } catch (e) {
    logAuxLoadFailure(t('wage.messages.createFailed'), e);
    ElMessage.error((e as Error).message || t('wage.messages.createFailed'));
  } finally {
    saving.value = false;
  }
}

const act = async (row: WageRecord, fn: (id: number) => Promise<unknown>, action: string) => {
  await ElMessageBox.confirm(
    t('wage.messages.actionConfirm', { action }),
    t('common.confirmTitle')
  );
  await fn(row.id);
  ElMessage.success(t('wage.messages.actionSuccess', { action }));
  await load();
};

const onCalculate = (row: WageRecord) =>
  act(row, id => calculateWageRecord(id), t('wage.actions.calculate'));
const onConfirm = (row: WageRecord) => act(row, confirmWageRecord, t('wage.actions.confirm'));
const onPay = (row: WageRecord) => act(row, payWageRecord, t('wage.actions.pay'));
const onCancel = (row: WageRecord) => act(row, cancelWageRecord, t('wage.actions.cancel'));

async function onDetails(row: WageRecord) {
  const payload = await getWageRecordDetails(row.id);
  details.value = unwrapList(payload);
  detailCols.value = details.value.length ? Object.keys(details.value[0]).slice(0, 8) : [];
  detailsVisible.value = true;
}

// ===== 编辑/删除工资单（draft 态） =====
const recordEditVisible = ref(false);
const recordSaving = ref(false);
const recordEditForm = reactive({ id: 0, workshop: '', remarks: '' });

function onEditRecord(row: WageRecord) {
  recordEditForm.id = row.id;
  recordEditForm.workshop = (row as Record<string, unknown>).workshop as string;
  recordEditForm.remarks = (row as Record<string, unknown>).remarks as string;
  recordEditVisible.value = true;
}

async function onSaveRecord() {
  recordSaving.value = true;
  try {
    await updateWageRecord(recordEditForm.id, {
      workshop: recordEditForm.workshop || undefined,
      remarks: recordEditForm.remarks || undefined,
    });
    ElMessage.success(t('wage.messages.updated'));
    recordEditVisible.value = false;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.updateFailed'));
  } finally {
    recordSaving.value = false;
  }
}

async function onDeleteRecord(row: WageRecord) {
  try {
    await ElMessageBox.confirm(
      t('wage.messages.deleteRecordConfirm', { id: row.id }),
      t('common.confirmTitle'),
      { type: 'warning' }
    );
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('wage.onDeleteRecord', error);
  }
  try {
    await deleteWageRecord(row.id);
    ElMessage.success(t('wage.messages.deleted'));
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.deleteFailed'));
  }
}

// ===== 导出工资明细（xlsx blob 下载） =====
async function onExportDetails(row: WageRecord) {
  try {
    const blob = await exportWageRecordDetails(row.id);
    const url = URL.createObjectURL(blob as unknown as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wage_details_${row.id}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    ElMessage.success(t('wage.messages.exported'));
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.exportFailed'));
  }
}

// ===== 按工人查询工资历史（getWageDetailsByWorker） =====
const workerId = ref(1);
const workerLoading = ref(false);

// 数值手输桥 范围与精度由单源校验器裁决（全项目禁步进控件）
const workerIdSpec: NumberFieldSpec = {
  label: t('wage.workerId'),
  required: true,
  min: 1,
  precision: 0,
};
const workerIdField = useNumberField(workerId, workerIdSpec);

async function onWorkerDetails() {
  const invalid = validateNumberValue(workerId.value, workerIdSpec);
  if (invalid) {
    ElMessage.warning(invalid);
    return;
  }
  workerLoading.value = true;
  try {
    const payload = await getWageDetailsByWorker(workerId.value);
    details.value = unwrapList(payload);
    detailCols.value = details.value.length ? Object.keys(details.value[0]).slice(0, 8) : [];
    if (details.value.length) ElMessage.success(t('common.success'));
    else ElMessage.success(t('wage.messages.noWorkerHistory'));
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.queryFailed'));
  } finally {
    workerLoading.value = false;
  }
}

// ===== 生效费率查询（getEffectiveWageRate） =====
const effectiveVisible = ref(false);
const effectiveLoading = ref(false);
const effectiveResult = ref('');
const effectiveForm = reactive({ process_route_id: 0, date: '' });
const processRoutes = ref<ProcessRoute[]>([]);

async function onQueryEffective() {
  if (!effectiveForm.process_route_id) {
    ElMessage.warning(t('wage.validation.routeRequired'));
    return;
  }
  if (!effectiveForm.date) {
    ElMessage.warning(t('wage.validation.effectiveDateRequired'));
    return;
  }
  effectiveLoading.value = true;
  try {
    const res = await getEffectiveWageRate(effectiveForm.process_route_id, effectiveForm.date);
    effectiveResult.value = res.data
      ? JSON.stringify(res.data, null, 2)
      : t('wage.messages.effectiveNone');
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.queryFailed'));
  } finally {
    effectiveLoading.value = false;
  }
}

async function loadProcessRoutes() {
  try {
    const res = await listProcessRoutes();
    processRoutes.value = res.data;
  } catch (e) {
    logAuxLoadFailure(t('wage.messages.loadRoutesFailed'), e);
    ElMessage.error((e as Error).message || t('wage.messages.loadRoutesFailed'));
  }
}

onMounted(() => {
  void load();
  void loadProcessRoutes();
  void loadRates();
});

// ==================== 工资费率管理（wage-rates） ====================
const activeTab = ref('records');
const wageRates = ref<WageRate[]>([]);
const rateLoading = ref(false);
const rateDialogVisible = ref(false);
const rateSaving = ref(false);
const editingRateId = ref<number | null>(null);

function emptyRateForm(): WageRateFormValues {
  return {
    process_route_id: 0,
    wage_type: 'piece',
    piece_price: 0,
    time_price: 0,
    grade_a_ratio: 1,
    grade_b_ratio: 0.8,
    grade_c_ratio: 0,
    effective_date: new Date().toISOString().split('T')[0],
    expiry_date: '',
    workshop: '',
    remarks: '',
  };
}

const rateForm = reactive<WageRateFormValues>(emptyRateForm());

// 数值手输桥 范围与精度由单源校验器裁决（全项目禁步进控件）
const priceSpec: NumberFieldSpec = { label: t('wage.fields.piecePrice'), min: 0, precision: 4 };
const ratioSpec: NumberFieldSpec = {
  label: t('wage.fields.gradeARatio'),
  min: 0,
  max: 1,
  precision: 4,
};
const piecePriceField = useNumberField(toRef(rateForm, 'piece_price'), priceSpec);
const timePriceField = useNumberField(toRef(rateForm, 'time_price'), {
  ...priceSpec,
  label: t('wage.fields.timePrice'),
});
const gradeAField = useNumberField(toRef(rateForm, 'grade_a_ratio'), ratioSpec);
const gradeBField = useNumberField(toRef(rateForm, 'grade_b_ratio'), {
  ...ratioSpec,
  label: t('wage.fields.gradeBRatio'),
});
const gradeCField = useNumberField(toRef(rateForm, 'grade_c_ratio'), {
  ...ratioSpec,
  label: t('wage.fields.gradeCRatio'),
});

const wageTypeLabel = (type: WageType) => {
  const labels: Record<WageType, string> = {
    piece: t('wage.types.piece'),
    time: t('wage.types.time'),
    mixed: t('wage.types.mixed'),
  };
  const label = labels[type];
  if (!label) throw new Error(`unknown wage type: ${type}`);
  return label;
};
const rateStatusLabel = (status: WageRateStatus) => {
  const labels: Record<WageRateStatus, string> = {
    draft: t('wage.status.draft'),
    active: t('wage.status.active'),
    disabled: t('wage.status.disabled'),
  };
  const label = labels[status];
  if (!label) throw new Error(`unknown wage rate status: ${status}`);
  return label;
};
const rateStatusTag = (status: WageRateStatus) => {
  const tags: Record<WageRateStatus, 'success' | 'info' | 'warning'> = {
    draft: 'warning',
    active: 'success',
    disabled: 'info',
  };
  const tag = tags[status];
  if (!tag) throw new Error(`unknown wage rate status: ${status}`);
  return tag;
};

const loadRates = async () => {
  rateLoading.value = true;
  try {
    const res = await getWageRateList({ page: 1, page_size: 100 });
    wageRates.value = res.data.items;
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.loadRatesFailed'));
  } finally {
    rateLoading.value = false;
  }
};

function validateRateForm(): string | null {
  if (!rateForm.process_route_id) return t('wage.validation.routeRequired');
  if (!rateForm.effective_date) return t('wage.validation.effectiveDateRequired');
  if (rateForm.wage_type === 'piece' && rateForm.piece_price <= 0) {
    return t('wage.validation.piecePriceRequired');
  }
  if (rateForm.wage_type === 'time' && rateForm.time_price <= 0) {
    return t('wage.validation.timePriceRequired');
  }
  if (rateForm.wage_type === 'mixed' && rateForm.piece_price <= 0 && rateForm.time_price <= 0) {
    return t('wage.validation.mixedPriceRequired');
  }
  for (const value of [rateForm.piece_price, rateForm.time_price]) {
    if (!Number.isFinite(value) || value < 0) return t('wage.validation.priceNonNegative');
  }
  for (const value of [rateForm.grade_a_ratio, rateForm.grade_b_ratio, rateForm.grade_c_ratio]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      return t('wage.validation.ratioRange');
    }
  }
  if (rateForm.expiry_date && rateForm.expiry_date <= rateForm.effective_date) {
    return t('wage.validation.expiryAfterEffective');
  }
  return null;
}

const onSaveRate = async () => {
  const invalid = validateRateForm();
  if (invalid) {
    ElMessage.warning(invalid);
    return;
  }
  rateSaving.value = true;
  try {
    if (editingRateId.value) {
      await updateWageRate(editingRateId.value, buildUpdateWageRatePayload(rateForm));
    } else {
      await createWageRate(buildCreateWageRatePayload(rateForm));
    }
    ElMessage.success(t('wage.messages.rateSaved'));
    rateDialogVisible.value = false;
    await loadRates();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.saveRateFailed'));
  } finally {
    rateSaving.value = false;
  }
};

function openRateDialog(row?: WageRate) {
  editingRateId.value = row?.id ?? null;
  Object.assign(rateForm, row ? wageRateToForm(row) : emptyRateForm());
  rateDialogVisible.value = true;
}

function wageRateToForm(row: WageRate): WageRateFormValues {
  return {
    process_route_id: row.process_route_id,
    wage_type: row.wage_type,
    piece_price: Number(row.piece_price),
    time_price: Number(row.time_price),
    grade_a_ratio: Number(row.grade_a_ratio),
    grade_b_ratio: Number(row.grade_b_ratio),
    grade_c_ratio: Number(row.grade_c_ratio),
    effective_date: row.effective_date,
    expiry_date: row.expiry_date ?? '',
    workshop: row.workshop ?? '',
    remarks: row.remarks ?? '',
  };
}

const onEditRate = (row: WageRate) => openRateDialog(row);

const onActivateRate = async (row: WageRate) => {
  try {
    await activateWageRate(row.id);
    ElMessage.success(t('wage.messages.activated'));
    await loadRates();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.activateFailed'));
  }
};

const onDisableRate = async (row: WageRate) => {
  try {
    await disableWageRate(row.id);
    ElMessage.success(t('wage.messages.disabled'));
    await loadRates();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.disableFailed'));
  }
};

const onDeleteRate = async (row: WageRate) => {
  try {
    await ElMessageBox.confirm(
      t('wage.messages.deleteRateConfirm', { id: row.id }),
      t('common.confirmTitle'),
      {
        type: 'warning',
      }
    );
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('wage.onDeleteRate', error);
  }
  try {
    await deleteWageRate(row.id);
    ElMessage.success(t('wage.messages.deleted'));
    await loadRates();
  } catch (e) {
    ElMessage.error((e as Error).message || t('wage.messages.deleteRateFailed'));
  }
};
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.w-full {
  width: 100%;
}
.effective-result {
  background: var(--el-fill-color-light);
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  margin: 0;
}
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
