<script setup lang="ts">
// 合格率单元格统一转数字格式化（后端 Decimal 序列化为字符串，直接 toFixed 会崩溃）
import NumericInput from '@/components/NumericInput.vue';
const fmtRate = (v: unknown): string => `${Number(v ?? 0).toFixed(2)}%`;

/**
 * AdvancedQualityPanel - 质量预测 tab 视图组件
 * 任务编号: P13 批 1 B3 I-1（拆分 advanced/index.vue 第 5 个 tab）
 * 质量预测（A2-2）：基于历史检验记录
 * 数据与函数全部由父组件通过 props 传入
 * P9-3 批次 F 重构：移除 vue/no-mutating-props 抑制，改用本地 ref 镜像 + watch 防循环
 */
import { computed, ref, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  QUALITY_INSPECTION_TYPE_LABEL_KEY,
  QUALITY_INSPECTION_TYPE_VALUES,
} from '@/constants/quality-inspection-type';
import type { QualityFormData, QualityResult } from '../composables/useQlt';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

// 检验类型下拉：提交库里落地的稳定码，文案才走 i18n
const inspectionTypeOptions = computed(() =>
  QUALITY_INSPECTION_TYPE_VALUES.map(value => ({
    value,
    label: t(QUALITY_INSPECTION_TYPE_LABEL_KEY[value]),
  }))
);

const props = defineProps<{
  // 质量预测表单（由父组件管理，子组件通过 emit('update:qualityForm') 回写）
  qualityForm: QualityFormData;
  qualityLoading: boolean;
  qualityResult: QualityResult | null;
  runQualityPrediction: () => Promise<void>;
}>();

const emit = defineEmits<{
  // 整体回写表单
  (e: 'update:qualityForm', form: QualityFormData): void;
}>();

// 本地镜像：避免直接修改 prop 触发 vue/no-mutating-props
const localForm = ref<QualityFormData>({ ...props.qualityForm });

// 同步标志位：防止 prop → local 与 local → emit 形成循环
let syncing = false;

// 外部 prop 变化时同步到 local
watch(
  () => props.qualityForm,
  newForm => {
    if (syncing) return;
    syncing = true;
    localForm.value = { ...newForm };
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);

// 本地变化时通知父组件
watch(
  localForm,
  newForm => {
    if (syncing) return;
    syncing = true;
    emit('update:qualityForm', { ...newForm });
    nextTick(() => {
      syncing = false;
    });
  },
  { deep: true }
);
</script>

<template>
  <div class="advanced-quality-panel" :class="{ 'advanced-quality-panel--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ t('advancedModule.quality.title') }}</h2>
    </div>

    <el-row :gutter="isPhone ? 0 : 20">
      <el-col :span="isPhone ? 24 : 8">
        <el-card shadow="hover" class="mb-20">
          <template #header
            ><div class="card-header">{{ t('advancedModule.quality.conditions') }}</div></template
          >
          <el-form
            :model="localForm"
            label-width="100px"
            :aria-label="t('advancedModule.quality.ariaConditions')"
          >
            <el-form-item :label="t('advancedModule.quality.productId')">
              <NumericInput
                v-model="localForm.product_id"
                :placeholder="t('advancedModule.quality.productIdPlaceholder')"
                style="width: 100%"
                :min="0"
              />
            </el-form-item>
            <el-form-item :label="t('advancedModule.quality.inspectionType')">
              <el-select
                v-model="localForm.inspection_type"
                :placeholder="t('advancedModule.quality.inspectionTypePlaceholder')"
                clearable
                style="width: 100%"
              >
                <el-option :label="t('advancedModule.quality.typeAll')" value="" />
                <el-option
                  v-for="item in inspectionTypeOptions"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('advancedModule.quality.timeWindow')">
              <NumericInput
                v-model="localForm.window_days"
                style="width: 100%"
                :min="1"
                :max="365"
              />
              <span class="form-hint">{{ t('advancedModule.quality.timeWindowHint') }}</span>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="qualityLoading" @click="runQualityPrediction">{{
                t('advancedModule.quality.startPredict')
              }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="isPhone ? 24 : 16">
        <el-card shadow="hover" class="mb-20">
          <template #header>
            <div class="card-header">{{ t('advancedModule.quality.result') }}</div>
          </template>
          <el-empty v-if="!qualityResult" :description="t('advancedModule.quality.empty')" />
          <div v-else>
            <el-row :gutter="12" class="mb-12">
              <el-col :span="isPhone ? 12 : 6">
                <el-statistic
                  :title="t('advancedModule.quality.totalInspections')"
                  :value="qualityResult.total_inspections"
                />
              </el-col>
              <el-col :span="isPhone ? 12 : 6">
                <el-statistic
                  :title="t('advancedModule.quality.avgQualificationRate')"
                  :value="qualityResult.avg_qualification_rate"
                  :precision="2"
                  suffix="%"
                />
                <el-progress
                  :percentage="qualityResult.avg_qualification_rate"
                  :stroke-width="6"
                  :show-text="false"
                  :status="
                    qualityResult.avg_qualification_rate >= 95
                      ? 'success'
                      : qualityResult.avg_qualification_rate >= 85
                        ? 'warning'
                        : 'exception'
                  "
                  style="margin-top: 4px"
                />
              </el-col>
              <el-col :span="isPhone ? 12 : 6">
                <div class="metric-label">{{ t('advancedModule.quality.trend') }}</div>
                <el-tag
                  :type="
                    qualityResult.trend === t('advancedModule.quality.trendUp')
                      ? 'success'
                      : qualityResult.trend === t('advancedModule.quality.trendDown')
                        ? 'danger'
                        : qualityResult.trend === t('advancedModule.quality.trendStable')
                          ? 'info'
                          : 'warning'
                  "
                  size="large"
                >
                  {{ qualityResult.trend }}
                  <span
                    v-if="
                      qualityResult.trend_rate !== 0 &&
                      qualityResult.trend !== t('advancedModule.quality.trendNoData')
                    "
                    style="margin-left: 4px"
                  >
                    ({{ qualityResult.trend_rate > 0 ? '+' : '' }}{{ qualityResult.trend_rate }}pp)
                  </span>
                </el-tag>
              </el-col>
              <el-col :span="isPhone ? 12 : 6">
                <div class="metric-label">{{ t('advancedModule.quality.riskLevel') }}</div>
                <el-tag
                  :type="
                    qualityResult.risk_level === t('advancedModule.quality.riskHigh')
                      ? 'danger'
                      : qualityResult.risk_level === t('advancedModule.quality.riskMedium')
                        ? 'warning'
                        : 'success'
                  "
                  size="large"
                >
                  {{ qualityResult.risk_level }}（{{ qualityResult.risk_score }}）
                </el-tag>
                <div class="metric-sub">
                  {{ t('advancedModule.quality.confidence') }}
                  {{ Math.round(qualityResult.confidence * 100) }}%
                </div>
              </el-col>
            </el-row>

            <h4 class="mb-10" style="margin-top: 8px">
              {{ t('advancedModule.quality.topIssues') }}
            </h4>
            <template v-if="qualityResult.top_issues && qualityResult.top_issues.length > 0">
              <section v-if="isPhone" class="quality-mobile quality-issues-mobile">
                <ul class="card-list" :aria-label="t('advancedModule.quality.ariaTopIssues')">
                  <li
                    v-for="(row, index) in qualityResult.top_issues"
                    :key="row.issue_type + '-' + index"
                    class="card-item"
                  >
                    <dl class="card-fields">
                      <div>
                        <dt>{{ t('advancedModule.quality.colIssueType') }}</dt>
                        <dd>{{ row.issue_type }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('advancedModule.quality.colOccurrences') }}</dt>
                        <dd>{{ row.occurrences }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('advancedModule.quality.colPercentage') }}</dt>
                        <dd>
                          <el-progress
                            :percentage="row.percentage"
                            :stroke-width="8"
                            :show-text="true"
                          />
                        </dd>
                      </div>
                    </dl>
                  </li>
                </ul>
              </section>
              <el-table
                v-else
                :data="qualityResult.top_issues"
                stripe
                size="small"
                border
                :aria-label="t('advancedModule.quality.ariaTopIssues')"
              >
                <el-table-column
                  prop="issue_type"
                  :label="t('advancedModule.quality.colIssueType')"
                  min-width="160"
                />
                <el-table-column
                  prop="occurrences"
                  :label="t('advancedModule.quality.colOccurrences')"
                  width="120"
                  align="right"
                />
                <el-table-column :label="t('advancedModule.quality.colPercentage')" width="200">
                  <template #default="{ row }">
                    <el-progress :percentage="row.percentage" :stroke-width="8" :show-text="true" />
                  </template>
                </el-table-column>
              </el-table>
            </template>
            <el-empty
              v-else
              :description="t('advancedModule.quality.emptyNoRecords')"
              :image-size="60"
            />

            <h4 class="mb-10" style="margin-top: 16px">
              {{ t('advancedModule.quality.recommendations') }}
            </h4>
            <ul class="rec-list">
              <li v-for="(r, i) in qualityResult.recommendations" :key="i">
                <el-alert :title="r" type="info" :closable="false" show-icon />
              </li>
            </ul>

            <h4 class="mb-10" style="margin-top: 16px">
              {{ t('advancedModule.quality.periodBreakdown') }}
            </h4>
            <template
              v-if="qualityResult.period_breakdown && qualityResult.period_breakdown.length > 0"
            >
              <section v-if="isPhone" class="quality-mobile quality-period-mobile">
                <ul class="card-list" :aria-label="t('advancedModule.quality.ariaPeriodBreakdown')">
                  <li
                    v-for="(row, index) in qualityResult.period_breakdown"
                    :key="row.period + '-' + index"
                    class="card-item"
                  >
                    <dl class="card-fields">
                      <div>
                        <dt>{{ t('advancedModule.quality.colPeriod') }}</dt>
                        <dd>{{ row.period }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('advancedModule.quality.colInspections') }}</dt>
                        <dd>{{ row.inspections }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('advancedModule.quality.colAvgRate') }}</dt>
                        <dd>{{ fmtRate(row.avg_qualification_rate) }}</dd>
                      </div>
                    </dl>
                  </li>
                </ul>
              </section>
              <el-table
                v-else
                :data="qualityResult.period_breakdown"
                stripe
                size="small"
                border
                :aria-label="t('advancedModule.quality.ariaPeriodBreakdown')"
              >
                <el-table-column
                  prop="period"
                  :label="t('advancedModule.quality.colPeriod')"
                  width="120"
                />
                <el-table-column
                  prop="inspections"
                  :label="t('advancedModule.quality.colInspections')"
                  width="120"
                  align="right"
                />
                <el-table-column :label="t('advancedModule.quality.colAvgRate')" min-width="200">
                  <template #default="{ row }">
                    {{ fmtRate(row.avg_qualification_rate) }}
                  </template>
                </el-table-column>
              </el-table>
            </template>
            <el-empty
              v-else
              :description="t('advancedModule.quality.emptyNoPeriod')"
              :image-size="60"
            />

            <el-alert
              class="mt-12"
              :title="
                qualityResult.source === 'history'
                  ? t('advancedModule.quality.dataSourceHistory')
                  : t('advancedModule.quality.dataSourceFallback')
              "
              :type="qualityResult.source === 'history' ? 'success' : 'warning'"
              :closable="false"
              show-icon
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.advanced-quality-panel {
  min-width: 0;
  max-width: 100%;
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
.advanced-quality-panel--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
}
.advanced-quality-panel--phone :deep(.el-select__wrapper),
.advanced-quality-panel--phone :deep(.el-input__wrapper) {
  min-height: 44px;
}
.advanced-quality-panel--phone :deep(.el-form-item__content) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
