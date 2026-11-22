<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import NumericInput from '@/components/NumericInput.vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createProcessOptimization,
  deleteProcessOptimization,
  batchCreateProcessOptimizations,
  SOURCE_LABELS,
  type AiProcessOptimization,
  type ProcessOptRequest,
} from '@/api/ai-extend';
import { DYE_TYPE_LABEL_KEY, DYE_TYPE_VALUES, isDyeType } from '@/constants/dye-type';
import { useTableApi } from '@/composables/useTableApi';
const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);
const phoneDialogWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

// 染料类型下拉：提交后端白名单里的稳定码（此前 value 取译文，任何选择都会被 422 拒绝）
const dyeTypeOptions = computed(() =>
  DYE_TYPE_VALUES.map(value => ({
    value,
    label: t(DYE_TYPE_LABEL_KEY[value]),
  }))
);

// 列表展示：词表内转文案，词表外的存量值原样展示（不猜测其含义）
const dyeTypeText = (value: string | null): string | null =>
  value !== null && isDyeType(value) ? t(DYE_TYPE_LABEL_KEY[value]) : value;

const router = useRouter();
const filter = reactive({
  color_no: '',
  fabric_type: '',
  is_applied: undefined as boolean | undefined,
  source: undefined as string | undefined,
});
// 后端 ai_extend_handler::list_process_optimizations 以 json!({items,total,page,page_size}) 返回，
// 显式钉 listKey='items'，不依赖 detectList 的顺序探测（否则信封漂移会被静默吞掉）。
const {
  data: items,
  loading,
  page,
  pageSize,
  total,
  refresh: load,
  setQueryParam,
} = useTableApi<AiProcessOptimization>({
  url: '/ai/process-optimizations',
  listKey: 'items',
  onError: () => ElMessage.error(t('message.loadFailed')),
});

const dialogVisible = ref(false);
const form = reactive<ProcessOptRequest>({
  color_no: '',
  color_name: '',
  fabric_type: '',
  dye_type: '',
  k: 5,
});
const submitting = ref(false);
function syncQueryParams() {
  setQueryParam('color_no', filter.color_no || undefined);
  setQueryParam('fabric_type', filter.fabric_type || undefined);
  setQueryParam('is_applied', filter.is_applied);
  setQueryParam('source', filter.source);
}
function handleSearch() {
  syncQueryParams();
  page.value = 1;
  load();
}

function openCreate() {
  form.color_no = '';
  form.color_name = '';
  form.fabric_type = '';
  form.dye_type = '';
  form.k = 5;
  dialogVisible.value = true;
}

// ===== 批量创建（batchCreateProcessOptimizations） =====
const batchVisible = ref(false);
const batchSaving = ref(false);
const batchText = ref('');

async function handleBatchCreate() {
  let requests: unknown;
  try {
    requests = JSON.parse(batchText.value || '[]');
  } catch {
    ElMessage.warning('JSON 格式有误');
    return;
  }
  if (!Array.isArray(requests) || requests.length === 0) {
    ElMessage.warning('请填写请求数组');
    return;
  }
  batchSaving.value = true;
  try {
    const res = await batchCreateProcessOptimizations(requests as never[]);
    ElMessage.success(`批量完成：成功 ${res.succeeded} / 失败 ${res.failed} / 共 ${res.total}`);
    batchVisible.value = false;
    batchText.value = '';
    page.value = 1;
    await load();
  } catch (e) {
    ElMessage.error((e as Error).message || '批量创建失败');
  } finally {
    batchSaving.value = false;
  }
}

async function submitCreate() {
  if (!form.color_no.trim()) {
    ElMessage.warning(t('aiExtend.process.colorNoRequired'));
    return;
  }
  if (!form.fabric_type.trim()) {
    ElMessage.warning(t('aiExtend.process.fabricTypeRequired'));
    return;
  }
  submitting.value = true;
  try {
    // 创建结果从 ApiResponse.data 读取。
    // 尽管 POST 实际 200。必须经 resp.data 解包（与 useTableApi/bpm-enhanced 的信封约定一致）。
    const resp = await createProcessOptimization({ ...form });
    const created = resp.data;
    ElMessage.success(
      t('aiExtend.process.recommendSuccess', {
        source: SOURCE_LABELS[created.response.source],
        confidence: created.response.confidence.toFixed(2),
      })
    );
    dialogVisible.value = false;
    page.value = 1;
    await load();
    router.push(`/ai-extend/process-detail/${created.id}`);
  } catch (e) {
    ElMessage.error(t('message.createFailed'));
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(row: AiProcessOptimization) {
  await ElMessageBox.confirm(
    t('aiExtend.process.confirmDeleteRow', { name: row.color_no }),
    t('message.confirmTitle'),
    { type: 'warning' }
  );
  try {
    await deleteProcessOptimization(row.id);
    ElMessage.success(t('aiExtend.process.deleted'));
    await load();
  } catch (e) {
    ElMessage.error(t('message.deleteFailed'));
  }
}

function goDetail(row: AiProcessOptimization) {
  router.push(`/ai-extend/process-detail/${row.id}`);
}

function resetFilter() {
  filter.color_no = '';
  filter.fabric_type = '';
  filter.is_applied = undefined;
  filter.source = undefined;
  syncQueryParams();
  page.value = 1;
  load();
}

const sourceOptions = computed(() => [
  { value: '', label: t('aiExtend.process.sourceAll') },
  { value: 'knn', label: t('aiExtend.process.sourceKnn') },
  { value: 'fallback', label: t('aiExtend.process.sourceFallback') },
]);
const appliedOptions = computed(() => [
  { value: undefined, label: t('aiExtend.process.appliedAll') },
  { value: true, label: t('aiExtend.process.applied') },
  { value: false, label: t('aiExtend.process.notApplied') },
]);
</script>

<template>
  <div class="proc-page" :class="{ 'proc-page--phone': isPhone }">
    <div class="page-header">
      <h2>{{ $t('aiExtend.process.listTitle') }}</h2>
      <div class="header-right">
        <el-button type="primary" @click="openCreate">{{
          $t('aiExtend.process.newRecommend')
        }}</el-button>
        <el-button plain @click="batchVisible = true">批量创建</el-button>
      </div>
    </div>

    <el-card class="filter-card">
      <el-form
        :inline="!isPhone"
        :label-position="isPhone ? 'top' : 'right'"
        :model="filter"
        :aria-label="$t('aiExtend.process.filterAriaLabel')"
      >
        <el-form-item :label="$t('aiExtend.process.colColorNo')">
          <el-input
            v-model="filter.color_no"
            :placeholder="$t('aiExtend.process.colorNoPlaceholder')"
            clearable
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colFabricType')">
          <el-input
            v-model="filter.fabric_type"
            :placeholder="$t('aiExtend.process.fabricPlaceholder')"
            clearable
            style="width: 140px"
          />
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colSource')">
          <el-select v-model="filter.source" clearable style="width: 140px">
            <el-option
              v-for="o in sourceOptions"
              :key="o.value"
              :label="o.label"
              :value="o.value || undefined"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colApplyStatus')">
          <el-select v-model="filter.is_applied" clearable style="width: 140px">
            <el-option
              v-for="o in appliedOptions"
              :key="String(o.value)"
              :label="o.label"
              :value="o.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">{{
            $t('aiExtend.process.query')
          }}</el-button>
          <el-button @click="resetFilter">{{ $t('aiExtend.process.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="process-table-card">
      <section
        v-if="isPhone"
        v-loading="loading"
        class="ai-mobile process-list-mobile"
        :aria-label="$t('aiExtend.process.tableAriaLabel')"
      >
        <ul v-if="items.length" class="card-list">
          <li v-for="row in items" :key="row.id" class="card-item">
            <dl class="card-fields">
              <div>
                <dt>ID</dt>
                <dd>{{ row.id }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colColorNo') }}</dt>
                <dd>{{ row.color_no }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colColorName') }}</dt>
                <dd>{{ row.color_name }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colFabricType') }}</dt>
                <dd>{{ row.fabric_type }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colDyeType') }}</dt>
                <dd>{{ dyeTypeText(row.dye_type) }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colSource') }}</dt>
                <dd>{{ SOURCE_LABELS[row.source] || row.source }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colSimilar') }}</dt>
                <dd>{{ row.similar_cases }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colConfidence') }}</dt>
                <dd>{{ Number(row.confidence).toFixed(2) }}</dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colRecParams') }}</dt>
                <dd class="mono">
                  {{ row.recommended_temperature }}°C · {{ row.recommended_time_minutes }}min · pH
                  {{ row.recommended_ph_value }} · 1:{{ row.recommended_liquor_ratio }}
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colApplied') }}</dt>
                <dd>
                  <el-tag :type="row.is_applied ? 'success' : 'info'" size="small">
                    {{
                      row.is_applied
                        ? $t('aiExtend.process.applied')
                        : $t('aiExtend.process.notApplied')
                    }}
                  </el-tag>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colFeedback') }}</dt>
                <dd>
                  <el-rate
                    v-if="row.feedback_score"
                    :model-value="row.feedback_score"
                    disabled
                    :max="5"
                  />
                  <span v-else class="muted">—</span>
                </dd>
              </div>
              <div>
                <dt>{{ $t('aiExtend.process.colCreatedAt') }}</dt>
                <dd>{{ new Date(row.created_at).toLocaleString('zh-CN') }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button type="primary" size="small" @click="goDetail(row)">
                {{ $t('aiExtend.process.detail') }}
              </el-button>
              <el-button
                v-permission="'ai-process-opt:delete'"
                type="danger"
                size="small"
                @click="handleDelete(row)"
              >
                {{ $t('aiExtend.process.delete') }}
              </el-button>
            </div>
          </li>
        </ul>
        <el-empty v-else :description="$t('components.v2Table.empty')" />
      </section>
      <el-table
        v-else
        v-loading="loading"
        :data="items"
        stripe
        border
        :aria-label="$t('aiExtend.process.tableAriaLabel')"
      >
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="color_no" :label="$t('aiExtend.process.colColorNo')" width="100" />
        <el-table-column
          prop="color_name"
          :label="$t('aiExtend.process.colColorName')"
          width="120"
          show-overflow-tooltip
        />
        <el-table-column
          prop="fabric_type"
          :label="$t('aiExtend.process.colFabricType')"
          width="80"
        />
        <el-table-column prop="dye_type" :label="$t('aiExtend.process.colDyeType')" width="120">
          <template #default="{ row }">{{ dyeTypeText(row.dye_type) }}</template>
        </el-table-column>
        <el-table-column prop="source" :label="$t('aiExtend.process.colSource')" width="100">
          <template #default="{ row }">{{ SOURCE_LABELS[row.source] || row.source }}</template>
        </el-table-column>
        <el-table-column
          prop="similar_cases"
          :label="$t('aiExtend.process.colSimilar')"
          width="70"
          align="center"
        />
        <el-table-column
          prop="confidence"
          :label="$t('aiExtend.process.colConfidence')"
          width="100"
        >
          <template #default="{ row }">{{ Number(row.confidence).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column :label="$t('aiExtend.process.colRecParams')" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.recommended_temperature }}°C</span> ·
            <span class="mono">{{ row.recommended_time_minutes }}min</span> ·
            <span class="mono">pH {{ row.recommended_ph_value }}</span> ·
            <span class="mono">1:{{ row.recommended_liquor_ratio }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="is_applied" :label="$t('aiExtend.process.colApplied')" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_applied ? 'success' : 'info'" size="small">
              {{
                row.is_applied ? $t('aiExtend.process.applied') : $t('aiExtend.process.notApplied')
              }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="feedback_score"
          :label="$t('aiExtend.process.colFeedback')"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            <el-rate
              v-if="row.feedback_score"
              :model-value="row.feedback_score"
              disabled
              :max="5"
            />
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column
          prop="created_at"
          :label="$t('aiExtend.process.colCreatedAt')"
          min-width="160"
        >
          <template #default="{ row }">{{
            new Date(row.created_at).toLocaleString('zh-CN')
          }}</template>
        </el-table-column>
        <el-table-column :label="$t('aiExtend.process.colAction')" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="goDetail(row)">{{
              $t('aiExtend.process.detail')
            }}</el-button>
            <el-button
              v-permission="'ai-process-opt:delete'"
              type="danger"
              size="small"
              @click="handleDelete(row)"
              >{{ $t('aiExtend.process.delete') }}</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        style="margin-top: 16px; justify-content: flex-end"
        :aria-label="$t('aiExtend.process.paginationAriaLabel')"
      />
    </el-card>

    <!-- 创建弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="$t('aiExtend.process.createDialogTitle')"
      class="ai-dialog"
      :class="{ 'ai-dialog--phone': isPhone }"
      :width="isPhone ? phoneDialogWidth : '540px'"
      :aria-label="$t('aiExtend.process.createDialogAriaLabel')"
    >
      <el-form
        :model="form"
        label-width="100px"
        :label-position="isPhone ? 'top' : 'right'"
        :aria-label="$t('aiExtend.process.formAriaLabel')"
      >
        <el-form-item :label="$t('aiExtend.process.colColorNo')" required>
          <el-input
            v-model="form.color_no"
            :placeholder="$t('aiExtend.process.colorNoPlaceholder')"
            maxlength="64"
          />
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colColorName')">
          <el-input
            v-model="form.color_name"
            :placeholder="$t('aiExtend.process.colorNamePlaceholder')"
            maxlength="128"
          />
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colFabricType')" required>
          <el-input
            v-model="form.fabric_type"
            :placeholder="$t('aiExtend.process.fabricTypePlaceholder')"
            maxlength="64"
          />
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.colDyeType')">
          <el-select
            v-model="form.dye_type"
            :placeholder="$t('aiExtend.process.dyeTypePlaceholder')"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="item in dyeTypeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('aiExtend.process.knnKValue')">
          <NumericInput v-model="form.k" :min="1" :max="20" />
          <span class="hint">{{ $t('aiExtend.process.knnHint') }}</span>
        </el-form-item>
        <el-alert
          :title="$t('aiExtend.process.knnAlert')"
          type="info"
          :closable="false"
          show-icon
        />
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('aiExtend.process.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="submitCreate">{{
          $t('aiExtend.process.generate')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 批量创建（batchCreateProcessOptimizations） -->
    <el-dialog
      v-model="batchVisible"
      title="批量工艺优化（JSON 数组）"
      class="ai-dialog"
      :class="{ 'ai-dialog--phone': isPhone }"
      :width="isPhone ? phoneDialogWidth : '560px'"
    >
      <el-input
        v-model="batchText"
        type="textarea"
        :rows="7"
        placeholder='[{"color_no":"R001","fabric_type":"全棉","dye_type":"活性"},{"color_no":"R002","fabric_type":"涤棉"}]'
      />
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSaving" @click="handleBatchCreate">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.proc-page {
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
.filter-card {
  margin-bottom: 0;
}
.mono {
  font-family: 'SFMono-Regular', Consolas, monospace;
  color: #303133;
}
.muted {
  color: #c0c4cc;
}
.hint {
  margin-left: 8px;
  font-size: 12px;
  color: #909399;
}
.proc-page {
  min-width: 0;
  max-width: 100%;
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
.card-actions,
.proc-page--phone .header-right {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.proc-page--phone .page-header {
  align-items: stretch;
  flex-direction: column;
  gap: 12px;
}
.proc-page--phone :deep(.el-button),
.ai-dialog--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
.proc-page--phone .filter-card :deep(.el-input),
.proc-page--phone .filter-card :deep(.el-select) {
  width: 100% !important;
}
.proc-page--phone :deep(.el-input__wrapper),
.proc-page--phone :deep(.el-select__wrapper) {
  min-height: 44px;
}
.proc-page--phone :deep(.el-pagination) {
  flex-wrap: wrap;
  row-gap: 12px;
  justify-content: flex-start !important;
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
.ai-dialog--phone :deep(.el-dialog__footer) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.proc-page--phone .page-header {
  align-items: stretch;
  flex-direction: column;
  gap: 12px;
}
.proc-page--phone .header-right {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.proc-page--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
.proc-page--phone .filter-card :deep(.el-input),
.proc-page--phone .filter-card :deep(.el-select) {
  width: 100% !important;
}
.proc-page--phone :deep(.el-input__wrapper),
.proc-page--phone :deep(.el-select__wrapper) {
  min-height: 44px;
}
.proc-page--phone :deep(.el-pagination) {
  flex-wrap: wrap;
  row-gap: 12px;
  justify-content: flex-start !important;
}
.proc-page--phone :deep(.el-pagination button),
.proc-page--phone :deep(.el-pager li) {
  min-width: 44px;
  min-height: 44px;
}
.proc-page--phone .filter-card :deep(.el-form-item:last-child .el-form-item__content) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ai-dialog--phone :deep(.el-dialog__header),
.ai-dialog--phone :deep(.el-dialog__footer) {
  flex-shrink: 0;
}
</style>
