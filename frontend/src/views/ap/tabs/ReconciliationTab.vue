<!--
  ReconciliationTab.vue - 对账管理 Tab
  来源：原 ap/index.vue 中 对账管理 tab 内容
  拆分日期：2026-06-15 B3-1
-->
<template>
  <div class="reconciliation-tab">
    <div class="page-header">
      <h2 class="page-title">{{ $t('apModule.reconciliation.title') }}</h2>
      <div class="header-actions">
        <el-button type="primary" @click="generateReconciliation()">
          <el-icon><Plus /></el-icon> {{ $t('apModule.reconciliation.generate') }}
        </el-button>
        <el-button :loading="autoReconciling" @click="handleAutoReconcile">
          {{ $t('apModule.reconciliation.autoReconcile') }}
        </el-button>
        <el-button @click="showSummary">{{ $t('apModule.reconciliation.summary') }}</el-button>
      </div>
    </div>

    <el-card shadow="hover">
      <!-- 手机卡片（与 BPM 审批手机卡片同断点同范式） -->
      <section v-if="isPhone" v-loading="reconciliationLoading" class="ap-recon-mobile">
        <ul class="card-list" :aria-label="$t('apModule.reconciliation.listAria')">
          <li v-for="row in reconciliations" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div class="field-emphasis">
                <dt>{{ $t('apModule.reconciliation.reconciliationNo') }}</dt>
                <dd>{{ row.reconciliation_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.reconciliation.supplier') }}</dt>
                <dd>{{ row.supplier_name ?? '-' }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.reconciliation.invoiceAmount') }}</dt>
                <dd>{{ formatMoney(row.total_invoice_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.reconciliation.paymentAmount') }}</dt>
                <dd>{{ formatMoney(row.total_payment_amount) }}</dd>
              </div>
              <div>
                <dt>{{ $t('apModule.reconciliation.difference') }}</dt>
                <dd :class="{ 'text-red': Number(row.difference_amount) !== 0 }">
                  {{ formatMoney(row.difference_amount) }}
                </dd>
              </div>
              <div>
                <dt>{{ $t('common.status') }}</dt>
                <dd>
                  <el-tag :type="getReconciliationStatusType(row.status)" size="small">
                    {{ getReconciliationStatusLabel(row.status) }}
                  </el-tag>
                </dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button
                v-if="row.status === 'pending'"
                type="success"
                @click="confirmReconciliation(row as unknown as APReconciliation)"
              >
                {{ $t('apModule.reconciliation.confirm') }}
              </el-button>
              <el-button
                v-if="row.status === 'pending'"
                type="warning"
                @click="disputeReconciliation(row as unknown as APReconciliation)"
              >
                {{ $t('apModule.reconciliation.dispute') }}
              </el-button>
              <el-button @click="showReconciliationDetail(row as APReconciliation)">
                {{ $t('common.detail') }}
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
        :aria-label="$t('apModule.reconciliation.listAria')"
      >
        <el-table-column
          prop="reconciliation_no"
          :label="$t('apModule.reconciliation.reconciliationNo')"
          width="140"
        />
        <el-table-column
          prop="supplier_name"
          :label="$t('apModule.reconciliation.supplier')"
          width="150"
        />
        <el-table-column
          prop="reconciliation_date"
          :label="$t('apModule.reconciliation.reconciliationDate')"
          width="120"
        />
        <el-table-column
          :label="$t('apModule.reconciliation.invoiceAmount')"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatMoney(row.total_invoice_amount) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('apModule.reconciliation.paymentAmount')"
          width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatMoney(row.total_payment_amount) }}
          </template>
        </el-table-column>
        <el-table-column
          :label="$t('apModule.reconciliation.difference')"
          width="100"
          align="right"
        >
          <template #default="{ row }">
            <span :class="{ 'text-red': row.difference_amount !== 0 }">
              {{ formatMoney(row.difference_amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="status" :label="$t('common.status')" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="getReconciliationStatusType(row.status)" size="small">
              {{ getReconciliationStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="$t('common.operation')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              type="success"
              link
              size="small"
              @click="confirmReconciliation(row as unknown as APReconciliation)"
              >{{ $t('apModule.reconciliation.confirm') }}</el-button
            >
            <el-button
              v-if="row.status === 'pending'"
              type="warning"
              link
              size="small"
              @click="disputeReconciliation(row as unknown as APReconciliation)"
              >{{ $t('apModule.reconciliation.dispute') }}</el-button
            >
            <el-button size="small" link @click="showReconciliationDetail(row as APReconciliation)">
              {{ $t('common.detail') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="reconciliationDialogVisible"
      :title="$t('apModule.reconciliation.generateTitle')"
      width="500px"
      :aria-label="$t('apModule.reconciliation.generateAria')"
    >
      <el-form
        :model="reconciliationForm"
        label-width="100px"
        :aria-label="$t('apModule.reconciliation.generateFormAria')"
      >
        <el-form-item :label="$t('apModule.reconciliation.supplier')" required>
          <el-select
            v-model="reconciliationForm.supplier_id"
            :placeholder="$t('apModule.reconciliation.supplierPlaceholder')"
            style="width: 100%"
          >
            <el-option v-for="s in suppliers" :key="s.id" :label="s.supplier_name" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('apModule.reconciliation.startDate')" required>
          <el-date-picker
            v-model="reconciliationForm.start_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="$t('apModule.reconciliation.endDate')" required>
          <el-date-picker
            v-model="reconciliationForm.end_date"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="reconciliationDialogVisible = false">{{
          $t('common.cancel')
        }}</el-button>
        <el-button type="primary" @click="submitReconciliation">{{
          $t('apModule.reconciliation.generate')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 自动对账汇总弹窗 -->
    <el-dialog
      v-model="summaryVisible"
      :title="$t('apModule.reconciliation.summary')"
      width="560px"
    >
      <el-descriptions v-if="summaryRow" :column="2" border>
        <el-descriptions-item label="对账单总数">{{ summaryRow.total ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="已确认">{{ summaryRow.confirmed ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="待确认">{{ summaryRow.pending ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="争议">{{ summaryRow.disputed ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="发票总额" :span="2">
          {{
            Number(summaryRow.total_invoice_amount ?? 0).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
            })
          }}
        </el-descriptions-item>
        <el-descriptions-item label="付款总额" :span="2">
          {{
            Number(summaryRow.total_payment_amount ?? 0).toLocaleString('zh-CN', {
              minimumFractionDigits: 2,
            })
          }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { logger } from '@/utils/logger';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElEmpty } from 'element-plus';
import { isDialogDismissal, rethrowNonDismissal } from '@/utils/monitor';
import { Plus } from '@element-plus/icons-vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  getAPReconciliationList,
  getAPReconciliation,
  autoReconcileAllAP,
  generateAPReconciliation,
  confirmAPReconciliation,
  disputeAPReconciliation,
  type APReconciliation,
} from '@/api/ap-reconciliation';
import type { Supplier } from '@/api/supplier';

const { t } = useI18n({ useScope: 'global' });

// 手机卡片断点（与 BPM 审批手机卡片同断点）
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const reconciliations = ref<APReconciliation[]>([]);
const reconciliationLoading = ref(false);
const suppliers = ref<Supplier[]>([]);

const formatMoney = (amount: number | string | undefined) => {
  const v = typeof amount === 'string' ? Number(amount) : amount;
  return v?.toLocaleString('zh-CN', { minimumFractionDigits: 2 }) || '0.00';
};

const getReconciliationStatusType = (status: string) => {
  const map: Record<string, string> = {
    pending: 'warning',
    confirmed: 'success',
    disputed: 'danger',
  };
  return map[status] || 'info';
};

const getReconciliationStatusLabel = (status: string) => {
  const keyMap: Record<string, string> = {
    pending: 'apModule.reconciliation.statusPending',
    confirmed: 'apModule.reconciliation.statusConfirmed',
    disputed: 'apModule.reconciliation.statusDisputed',
  };
  const key = keyMap[status];
  return key ? t(key) : status;
};

const fetchReconciliations = async () => {
  reconciliationLoading.value = true;
  try {
    const res = await getAPReconciliationList();
    const d = res.data as
      { list?: APReconciliation[]; items?: APReconciliation[] } | APReconciliation[] | undefined;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      reconciliations.value = d.list || d.items || [];
    } else {
      reconciliations.value = (d as APReconciliation[]) || [];
    }
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('apModule.reconciliation.fetchListFailed'));
  } finally {
    reconciliationLoading.value = false;
  }
};

const reconciliationDialogVisible = ref(false);
const reconciliationForm = reactive({
  supplier_id: undefined as number | undefined,
  start_date: '',
  end_date: '',
});

const generateReconciliation = () => {
  reconciliationForm.supplier_id = undefined;
  reconciliationForm.start_date = '';
  reconciliationForm.end_date = '';
  reconciliationDialogVisible.value = true;
};

const submitReconciliation = async () => {
  if (
    !reconciliationForm.supplier_id ||
    !reconciliationForm.start_date ||
    !reconciliationForm.end_date
  ) {
    ElMessage.warning(t('apModule.reconciliation.pleaseFillComplete'));
    return;
  }
  try {
    await generateAPReconciliation({
      supplier_id: reconciliationForm.supplier_id,
      start_date: reconciliationForm.start_date,
      end_date: reconciliationForm.end_date,
    });
    ElMessage.success(t('apModule.reconciliation.generateSuccess'));
    reconciliationDialogVisible.value = false;
    fetchReconciliations();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('apModule.reconciliation.generateFailed'));
  }
};

const confirmReconciliation = async (row: APReconciliation) => {
  try {
    await ElMessageBox.confirm(
      t('apModule.reconciliation.confirmConfirm'),
      t('apModule.reconciliation.confirmTitle'),
      { type: 'info' }
    );
    await confirmAPReconciliation(row.id);
    ElMessage.success(t('apModule.reconciliation.confirmSuccess'));
    fetchReconciliations();
  } catch (e) {
    if (!isDialogDismissal(e)) {
      const err = e as { message?: string };
      ElMessage.error(err.message || t('common.failed'));
    }
  }
};

const disputeReconciliation = async (row: APReconciliation) => {
  try {
    const { value } = await ElMessageBox.prompt(
      t('apModule.reconciliation.disputePrompt'),
      t('apModule.reconciliation.disputeTitle'),
      {
        inputPattern: /.+/,
        inputErrorMessage: t('apModule.reconciliation.disputePrompt'),
      }
    );
    await disputeAPReconciliation(row.id, value);
    ElMessage.success(t('apModule.reconciliation.disputeSubmitted'));
    fetchReconciliations();
  } catch (e) {
    if (!isDialogDismissal(e)) {
      const err = e as { message?: string };
      ElMessage.error(err.message || t('common.failed'));
    }
  }
};

// 自动对账：后端匹配发票与付款生成对账单
const autoReconciling = ref(false);
const handleAutoReconcile = async () => {
  try {
    await ElMessageBox.confirm(
      t('apModule.reconciliation.autoReconcileConfirm'),
      t('apModule.reconciliation.autoReconcile'),
      { type: 'info' }
    );
  } catch (error: unknown) {
    if (isDialogDismissal(error)) return;
    rethrowNonDismissal('ap.ReconciliationTab.handleAutoReconcile', error);
  }
  autoReconciling.value = true;
  try {
    // 后端契约：/ap/reconciliations/auto 需要日期范围，默认覆盖近 90 天
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    await autoReconcileAllAP({
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0],
    });
    ElMessage.success(t('apModule.reconciliation.autoReconcileSuccess'));
    fetchReconciliations();
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
  } finally {
    autoReconciling.value = false;
  }
};

// 对账汇总统计
const summaryVisible = ref(false);
const summaryRow = ref<Record<string, number> | null>(null);
const showSummary = async () => {
  try {
    // 后端汇总接口按供应商维度返回，这里按对账单状态在客户端聚合展示
    if (reconciliations.value.length === 0) await fetchReconciliations();
    const list = reconciliations.value;
    summaryRow.value = {
      total: list.length,
      confirmed: list.filter(r => r.status === 'confirmed').length,
      pending: list.filter(r => r.status === 'pending').length,
      disputed: list.filter(r => r.status === 'disputed').length,
      total_invoice_amount: list.reduce((s, r) => s + Number(r.total_invoice_amount ?? 0), 0),
      total_payment_amount: list.reduce((s, r) => s + Number(r.total_payment_amount ?? 0), 0),
    };
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
    return;
  }
  summaryVisible.value = true;
};

// 对账详情（行操作调用，弹窗展示）
const detailVisible = ref(false);
const detailRow = ref<APReconciliation | null>(null);
const showReconciliationDetail = async (row: APReconciliation) => {
  try {
    const res = await getAPReconciliation(row.id);
    detailRow.value = (res.data as APReconciliation) || row;
  } catch (error) {
    logger.error(t('apModule.reconciliation.detailFailed'), error);
    detailRow.value = row;
  }
  detailVisible.value = true;
};

defineExpose({ refresh: fetchReconciliations });

onMounted(() => {
  fetchReconciliations();
  suppliers.value = [];
});
</script>

<style scoped>
/* 手机卡片（范式与 BPM 审批手机卡片一致） */
.ap-recon-mobile {
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

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  margin: 0;
}
.text-red {
  color: #f56c6c;
}
</style>
