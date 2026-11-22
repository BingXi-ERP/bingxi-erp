<script setup lang="ts">
import { isDialogDismissal } from '@/utils/monitor';
import { onMounted, ref, computed } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  getProcessOptimization,
  deleteProcessOptimization,
  applyProcessOptimization,
  getProcessOptimizationListByColor,
  SOURCE_LABELS,
  type AiProcessOptimization,
  type ProcessOptCandidate,
} from '@/api/ai-extend';
const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

const route = useRoute();
const router = useRouter();
const id = computed(() => Number(route.params.id));
const loading = ref(false);
const model = ref<AiProcessOptimization | null>(null);
const candidates = ref<ProcessOptCandidate[]>([]);

async function load() {
  if (!id.value || Number.isNaN(id.value)) {
    ElMessage.warning(t('aiExtend.process.invalidId'));
    return;
  }
  loading.value = true;
  try {
    const m = await getProcessOptimization(id.value);
    model.value = m;
    if (m.candidates_json) {
      const json = m.candidates_json;
      if (Array.isArray(json)) {
        candidates.value = json as ProcessOptCandidate[];
      }
    }
  } catch (e) {
    ElMessage.error(t('aiExtend.process.loadDetailFailed'));
  } finally {
    loading.value = false;
  }
}

async function handleDelete() {
  if (!model.value) return;
  await ElMessageBox.confirm(t('aiExtend.process.confirmDelete'), t('message.confirmTitle'), {
    type: 'warning',
  });
  try {
    await deleteProcessOptimization(model.value.id);
    ElMessage.success(t('aiExtend.process.deleted'));
    router.replace('/ai-extend/process-optimization');
  } catch (e) {
    ElMessage.error(t('message.deleteFailed'));
  }
}

// 应用工艺优化（登记反馈分与备注，后端落库 applied 状态）
const applying = ref(false);

async function handleApply() {
  if (!model.value) return;
  try {
    const { value } = await ElMessageBox.prompt(
      '反馈分（0-100，可留空）| 反馈备注（可留空），用 | 分隔',
      '应用工艺优化',
      { inputValidator: () => true }
    );
    const [score, remark] = value.split('|').map(s => s.trim());
    applying.value = true;
    await applyProcessOptimization(model.value.id, {
      feedback_score: score ? Number(score) : undefined,
      feedback_remark: remark || undefined,
    });
    ElMessage.success('已应用');
    await load();
  } catch (e) {
    if (!isDialogDismissal(e)) ElMessage.error((e as Error).message || '应用失败');
  } finally {
    applying.value = false;
  }
}

// 按色号 + 布类查询历史（列表模式 + 详情页联动查询）
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyItems = ref<AiProcessOptimization[]>([]);

async function handleHistoryQuery() {
  if (!model.value?.color_no) {
    ElMessage.warning('当前记录无色号，无法查询');
    return;
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入布类', '按色号查询历史', {
      inputValue: model.value.fabric_type || '',
      inputValidator: v => !!v.trim() || '布类必填',
    });
    historyLoading.value = true;
    historyVisible.value = true;
    const res = await getProcessOptimizationListByColor({
      color_no: model.value.color_no,
      fabric_type: value.trim(),
      limit: 20,
    });
    historyItems.value = res.items ?? [];
  } catch (e) {
    if (!isDialogDismissal(e)) ElMessage.error((e as Error).message || '查询历史失败');
  } finally {
    historyLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="proc-detail" :class="{ 'proc-detail--phone': isPhone }">
    <div class="page-header">
      <h2>{{ $t('aiExtend.process.detailTitle') }}</h2>
      <div class="header-right">
        <el-button @click="router.back()">{{ $t('aiExtend.process.back') }}</el-button>
        <el-button v-if="model" type="primary" :loading="applying" @click="handleApply"
          >应用</el-button
        >
        <el-button v-if="model" plain @click="handleHistoryQuery">按色号查历史</el-button>
        <el-button
          v-if="model"
          v-permission="'ai-process-opt:delete'"
          type="danger"
          @click="handleDelete"
          >{{ $t('aiExtend.process.deleteRecord') }}</el-button
        >
      </div>
    </div>
    <!-- 空态：记录不存在或加载失败时给出可见提示（避免整页空白） -->
    <el-empty v-if="!loading && !model" :description="$t('aiExtend.process.recordNotFound')" />

    <template v-if="model">
      <el-row :gutter="isPhone ? 0 : 16">
        <el-col :span="isPhone ? 24 : 14">
          <el-card class="process-detail-card">
            <template #header>
              <div class="card-header">{{ $t('aiExtend.process.recommendParams') }}</div>
            </template>
            <dl v-if="isPhone" class="card-fields">
              <div>
                <dt>{{ $t('aiExtend.process.colColorNo') }}</dt>
                <dd>{{ model.color_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colColorName') }}</dt>
                <dd>{{ model.color_name || '—' }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colFabricType') }}</dt>
                <dd>{{ model.fabric_type }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colDyeType') }}</dt>
                <dd>{{ model.dye_type || '—' }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.recTemperature') }}</dt>
                <dd>
                  <span class="primary-value">{{ model.recommended_temperature }} °C</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.recTime') }}</dt>
                <dd>
                  <span class="primary-value"
                    >{{ model.recommended_time_minutes }}
                    {{ $t('aiExtend.process.unitMinutes') }}</span
                  >
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.recPh') }}</dt>
                <dd>
                  <span class="primary-value">{{ model.recommended_ph_value }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.recLiquorRatio') }}</dt>
                <dd>
                  <span class="primary-value">1 : {{ model.recommended_liquor_ratio }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.recSource') }}</dt>
                <dd>
                  <el-tag>{{ SOURCE_LABELS[model.source] || model.source }}</el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.confidence') }}</dt>
                <dd>
                  <el-progress
                    :percentage="Math.round(Number(model.confidence) * 100)"
                    :stroke-width="10"
                  />
                </dd>
              </div>
            </dl>
            <el-descriptions v-else :column="2" border>
              <el-descriptions-item :label="$t('aiExtend.process.colColorNo')">{{
                model.color_no
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.colColorName')">{{
                model.color_name || '—'
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.colFabricType')">{{
                model.fabric_type
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.colDyeType')">{{
                model.dye_type || '—'
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.recTemperature')">
                <span class="primary-value">{{ model.recommended_temperature }} °C</span>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.recTime')">
                <span class="primary-value"
                  >{{ model.recommended_time_minutes }}
                  {{ $t('aiExtend.process.unitMinutes') }}</span
                >
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.recPh')">
                <span class="primary-value">{{ model.recommended_ph_value }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.recLiquorRatio')">
                <span class="primary-value">1 : {{ model.recommended_liquor_ratio }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.recSource')">
                <el-tag>{{ SOURCE_LABELS[model.source] || model.source }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.confidence')">
                <el-progress
                  :percentage="Math.round(Number(model.confidence) * 100)"
                  :stroke-width="10"
                />
              </el-descriptions-item>
            </el-descriptions>

            <el-alert
              v-if="model.reason"
              :title="model.reason"
              type="info"
              :closable="false"
              show-icon
              style="margin-top: 12px"
            />
          </el-card>
        </el-col>

        <el-col :span="isPhone ? 24 : 10">
          <el-card class="process-feedback-card">
            <template #header>
              <div class="card-header">{{ $t('aiExtend.process.appAndFeedback') }}</div>
            </template>
            <dl v-if="isPhone" class="card-fields">
              <div>
                <dt>{{ $t('aiExtend.process.applyStatus') }}</dt>
                <dd>
                  <el-tag :type="model.is_applied ? 'success' : 'info'">
                    {{
                      model.is_applied
                        ? $t('aiExtend.process.applied')
                        : $t('aiExtend.process.notApplied')
                    }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.applyTime') }}</dt>
                <dd>
                  {{ model.applied_at ? new Date(model.applied_at).toLocaleString('zh-CN') : '—' }}
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.feedbackScore') }}</dt>
                <dd>
                  <el-rate
                    v-if="model.feedback_score"
                    :model-value="model.feedback_score"
                    disabled
                    :max="5"
                  />
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.feedbackRemark') }}</dt>
                <dd>{{ model.feedback_remark || '—' }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.similarCases') }}</dt>
                <dd>{{ model.similar_cases }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.requestId') }}</dt>
                <dd>
                  <span class="mono">{{ model.request_id }}</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.createdAt') }}</dt>
                <dd>
                  {{ new Date(model.created_at).toLocaleString('zh-CN') }}
                </dd>
              </div>
            </dl>
            <el-descriptions v-else :column="1" border>
              <el-descriptions-item :label="$t('aiExtend.process.applyStatus')">
                <el-tag :type="model.is_applied ? 'success' : 'info'">
                  {{
                    model.is_applied
                      ? $t('aiExtend.process.applied')
                      : $t('aiExtend.process.notApplied')
                  }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.applyTime')">
                {{ model.applied_at ? new Date(model.applied_at).toLocaleString('zh-CN') : '—' }}
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.feedbackScore')">
                <el-rate
                  v-if="model.feedback_score"
                  :model-value="model.feedback_score"
                  disabled
                  :max="5"
                />
                <span v-else>—</span>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.feedbackRemark')">{{
                model.feedback_remark || '—'
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.similarCases')">{{
                model.similar_cases
              }}</el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.requestId')">
                <span class="mono">{{ model.request_id }}</span>
              </el-descriptions-item>
              <el-descriptions-item :label="$t('aiExtend.process.createdAt')">
                {{ new Date(model.created_at).toLocaleString('zh-CN') }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>

      <el-card v-if="candidates.length" class="process-candidates-card">
        <template #header>
          <div class="card-header">{{ $t('aiExtend.process.similarHistory') }}</div>
        </template>
        <section v-if="isPhone" class="ai-mobile process-candidates-mobile">
          <ul v-if="candidates.length" class="card-list">
            <li v-for="(row, index) in candidates" :key="index" class="card-item">
              <dl class="card-fields">
                <div>
                  <dt>{{ $t('aiExtend.process.colCaseId') }}</dt>
                  <dd>{{ row.case_id }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colColorNo') }}</dt>
                  <dd>{{ row.color_no }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colFabricType') }}</dt>
                  <dd>{{ row.fabric_type }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colSimilarity') }}</dt>
                  <dd>
                    <el-progress :percentage="Math.round(row.similarity * 100)" :stroke-width="8" />
                  </dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colTemperature') }}</dt>
                  <dd>{{ row.temperature }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colTime') }}</dt>
                  <dd>{{ row.time_minutes }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colPh') }}</dt>
                  <dd>{{ row.ph_value }}</dd>
                </div>
                <div>
                  <dt>{{ $t('aiExtend.process.colLiquorRatio') }}</dt>
                  <dd>{{ row.liquor_ratio }}</dd>
                </div>
              </dl>
            </li>
          </ul>
          <el-empty v-else :description="t('components.v2Table.empty')" />
        </section>
        <el-table
          v-else
          :data="candidates"
          size="small"
          border
          :aria-label="t('aiExtend.process.ariaSimilarHistory')"
        >
          <el-table-column prop="case_id" :label="$t('aiExtend.process.colCaseId')" width="100" />
          <el-table-column prop="color_no" :label="$t('aiExtend.process.colColorNo')" width="120" />
          <el-table-column
            prop="fabric_type"
            :label="$t('aiExtend.process.colFabricType')"
            width="100"
          />
          <el-table-column
            prop="similarity"
            :label="$t('aiExtend.process.colSimilarity')"
            width="200"
          >
            <template #default="{ row }">
              <el-progress :percentage="Math.round(row.similarity * 100)" :stroke-width="8" />
            </template>
          </el-table-column>
          <el-table-column
            prop="temperature"
            :label="$t('aiExtend.process.colTemperature')"
            width="80"
          />
          <el-table-column prop="time_minutes" :label="$t('aiExtend.process.colTime')" width="80" />
          <el-table-column prop="ph_value" :label="$t('aiExtend.process.colPh')" width="80" />
          <el-table-column prop="liquor_ratio" :label="$t('aiExtend.process.colLiquorRatio')" />
        </el-table>
      </el-card>
    </template>

    <el-dialog
      v-model="historyVisible"
      v-loading="historyLoading"
      title="同色号历史记录"
      class="ai-dialog"
      :class="{ 'ai-dialog--phone': isPhone }"
      :width="isPhone ? phoneDialogWidth : '720px'"
    >
      <section v-if="isPhone" class="ai-mobile process-history-mobile">
        <ul v-if="historyItems.length" class="card-list">
          <li v-for="(row, index) in historyItems" :key="index" class="card-item">
            <dl class="card-fields">
              <div>
                <dt>ID</dt>
                <dd>{{ row.id }}</dd>
              </div>
              <div>
                <dt>色号</dt>
                <dd>{{ row.color_no }}</dd>
              </div>
              <div>
                <dt>布类</dt>
                <dd>{{ row.fabric_type }}</dd>
              </div>
              <div>
                <dt>染色类型</dt>
                <dd>{{ row.dye_type }}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd>{{ row.is_applied ? '已应用' : '未应用' }}</dd>
              </div>
              <div>
                <dt>应用时间</dt>
                <dd>{{ row.applied_at || '-' }}</dd>
              </div>
            </dl>
          </li>
        </ul>
        <el-empty v-else :description="t('components.v2Table.empty')" />
      </section>
      <el-table v-else :data="historyItems" border size="small" max-height="360">
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="color_no" label="色号" width="110" />
        <el-table-column prop="fabric_type" label="布类" width="110" />
        <el-table-column prop="dye_type" label="染色类型" width="110" />
        <el-table-column prop="status" label="状态" width="100" />
        <el-table-column prop="applied_at" label="应用时间" min-width="150">
          <template #default="{ row }">{{ row.applied_at || '-' }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="historyVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.proc-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
}
.header-right {
  display: flex;
  gap: 8px;
}
.primary-value {
  font-size: 18px;
  font-weight: 700;
  color: #409eff;
}
.mono {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 12px;
}
.card-header {
  font-weight: 600;
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
.card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ai-dialog--phone {
  display: flex;
  flex-direction: column;
  max-height: calc(
    100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
  );
  margin-top: calc(12px + env(safe-area-inset-top, 0px));
  margin-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.ai-dialog--phone :deep(.el-dialog__body) {
  min-height: 0;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
.ai-dialog--phone :deep(.el-dialog__header),
.ai-dialog--phone :deep(.el-dialog__footer) {
  flex-shrink: 0;
}
.ai-dialog--phone :deep(.el-dialog__footer) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.ai-dialog--phone :deep(.el-button),
.ai-drawer--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}

.proc-detail {
  min-width: 0;
  max-width: 100%;
}
.proc-detail--phone .page-header {
  align-items: stretch;
  flex-direction: column;
  gap: 12px;
}
.proc-detail--phone .header-right {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.proc-detail--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
.proc-detail--phone .filter-card :deep(.el-input),
.proc-detail--phone .filter-card :deep(.el-select) {
  width: 100% !important;
}
.proc-detail--phone :deep(.el-input__wrapper),
.proc-detail--phone :deep(.el-select__wrapper) {
  min-height: 44px;
}
.proc-detail--phone :deep(.el-pagination) {
  flex-wrap: wrap;
  row-gap: 12px;
  justify-content: flex-start !important;
}
.proc-detail--phone :deep(.el-pagination button),
.proc-detail--phone :deep(.el-pager li) {
  min-width: 44px;
  min-height: 44px;
}
.proc-detail--phone .filter-card :deep(.el-form-item:last-child .el-form-item__content) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.proc-detail--phone .el-col + .el-col {
  margin-top: 16px;
}
</style>
