<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { DataAnalysis, Document, MagicStick } from '@element-plus/icons-vue';
import {
  getAiSummary,
  getAiHealth,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_COLORS,
  TREND_LABELS,
  SOURCE_LABELS,
} from '@/api/ai-extend';
import type { AiSummary } from '@/api/ai-extend';
const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const router = useRouter();
const summary = ref<AiSummary | null>(null);
const loading = ref(false);
const health = ref<{ status: string; version: string } | null>(null);

async function load() {
  loading.value = true;
  try {
    const [s, h] = await Promise.all([getAiSummary(), getAiHealth()]);
    summary.value = s;
    health.value = h;
  } catch (e) {
    ElMessage.error(t('message.loadFailed'));
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const applyRateText = computed(() => {
  if (!summary.value) return '—';
  return `${((summary.value.process_optimization?.apply_rate ?? 0) * 100).toFixed(1)}%`;
});
const applyRateColor = computed(() => {
  if (!summary.value) return '#909399';
  const r = summary.value.process_optimization?.apply_rate ?? 0;
  if (r >= 0.6) return '#67c23a';
  if (r >= 0.3) return '#e6a23c';
  return '#f56c6c';
});
</script>

<template>
  <div class="ai-overview" :class="{ 'ai-overview--phone': isPhone }">
    <div class="page-header">
      <h2>{{ $t('aiExtend.overview.title') }}</h2>
      <div class="header-right">
        <el-tag v-if="health" :type="health.status === 'ok' ? 'success' : 'danger'" size="small">
          {{
            $t('aiExtend.overview.serviceStatus', {
              status:
                health.status === 'ok'
                  ? $t('aiExtend.overview.serviceOk')
                  : $t('aiExtend.overview.serviceError'),
              version: health.version,
            })
          }}
        </el-tag>
        <el-button :loading="loading" type="primary" plain @click="load">{{
          $t('aiExtend.overview.refresh')
        }}</el-button>
      </div>
    </div>

    <el-row v-if="summary" :gutter="isPhone ? 8 : 16" class="kpi-row">
      <el-col :span="isPhone ? 12 : 6">
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">{{ $t('aiExtend.overview.kpiProcessHistory') }}</div>
          <div class="kpi-value">{{ summary.process_optimization?.total ?? 0 }}</div>
          <div class="kpi-extra">
            {{
              $t('aiExtend.overview.kpiKnnRecommended', {
                n: summary.process_optimization?.knn_recommended ?? 0,
              })
            }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 12 : 6">
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">{{ $t('aiExtend.overview.kpiApplyRate') }}</div>
          <div class="kpi-value" :style="{ color: applyRateColor }">{{ applyRateText }}</div>
          <div class="kpi-extra">
            {{
              $t('aiExtend.overview.kpiApplied', { n: summary.process_optimization?.applied ?? 0 })
            }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 12 : 6">
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">{{ $t('aiExtend.overview.kpiQualityHistory') }}</div>
          <div class="kpi-value">{{ summary.quality_prediction?.total ?? 0 }}</div>
          <div class="kpi-extra">
            {{
              $t('aiExtend.overview.kpiHighRisk', { n: summary.quality_prediction?.high_risk ?? 0 })
            }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 12 : 6">
        <el-card shadow="hover" class="kpi-card">
          <div class="kpi-label">{{ $t('aiExtend.overview.kpiUnack') }}</div>
          <div
            class="kpi-value"
            :style="{
              color: (summary.quality_prediction?.unacknowledged ?? 0) > 0 ? '#f56c6c' : '#67c23a',
            }"
          >
            {{ summary.quality_prediction?.unacknowledged ?? 0 }}
          </div>
          <div class="kpi-extra">{{ $t('aiExtend.overview.kpiUnackHint') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="isPhone ? 8 : 16" class="actions-row">
      <el-col :span="isPhone ? 24 : 8">
        <el-card
          shadow="hover"
          class="action-card"
          @click="router.push('/ai-extend/process-optimization')"
        >
          <div class="action-icon" style="background: #ecf5ff; color: #409eff">
            <el-icon :size="32"><MagicStick /></el-icon>
          </div>
          <div class="action-body">
            <div class="action-title">{{ $t('aiExtend.overview.actionProcess') }}</div>
            <div class="action-desc">{{ $t('aiExtend.overview.actionProcessDesc') }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 24 : 8">
        <el-card
          shadow="hover"
          class="action-card"
          @click="router.push('/ai-extend/quality-prediction')"
        >
          <div class="action-icon" style="background: #fef0f0; color: #f56c6c">
            <el-icon :size="32"><DataAnalysis /></el-icon>
          </div>
          <div class="action-body">
            <div class="action-title">{{ $t('aiExtend.overview.actionQuality') }}</div>
            <div class="action-desc">{{ $t('aiExtend.overview.actionQualityDesc') }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 24 : 8">
        <el-card
          shadow="hover"
          class="action-card"
          @click="router.push('/ai-extend/process-detail/1')"
        >
          <div class="action-icon" style="background: #f0f9eb; color: #67c23a">
            <el-icon :size="32"><Document /></el-icon>
          </div>
          <div class="action-body">
            <div class="action-title">{{ $t('aiExtend.overview.actionHistory') }}</div>
            <div class="action-desc">{{ $t('aiExtend.overview.actionHistoryDesc') }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="summary" :gutter="isPhone ? 0 : 16" class="latest-row">
      <el-col :span="isPhone ? 24 : 12">
        <el-card shadow="hover" class="overview-process-card">
          <template #header>
            <div class="card-header">{{ $t('aiExtend.overview.latestProcess') }}</div>
          </template>
          <section
            v-if="isPhone"
            class="ai-mobile overview-process-mobile"
            :aria-label="t('aiExtend.overview.ariaLatestProcess')"
          >
            <ul class="card-list">
              <li
                v-for="row in summary.latest_process_optimizations"
                :key="row.id"
                class="card-item"
              >
                <dl class="card-fields">
                  <div>
                    <dt>{{ $t('aiExtend.overview.colColorNo') }}</dt>
                    <dd>{{ row.color_no }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colFabricType') }}</dt>
                    <dd>{{ row.fabric_type }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colSource') }}</dt>
                    <dd>{{ SOURCE_LABELS[row.source] || row.source }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colConfidence') }}</dt>
                    <dd>{{ Number(row.confidence).toFixed(2) }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colApplied') }}</dt>
                    <dd>
                      <el-tag :type="row.is_applied ? 'success' : 'info'" size="small">
                        {{
                          row.is_applied
                            ? $t('aiExtend.overview.applied')
                            : $t('aiExtend.overview.notApplied')
                        }}
                      </el-tag>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colTime') }}</dt>
                    <dd>{{ row.created_at }}</dd>
                  </div>
                </dl>
              </li>
            </ul>
            <el-empty
              v-if="summary.latest_process_optimizations.length === 0"
              :description="t('components.v2Table.empty')"
            />
          </section>
          <el-table
            v-else
            :data="summary.latest_process_optimizations"
            size="small"
            max-height="300"
            :aria-label="t('aiExtend.overview.ariaLatestProcess')"
          >
            <el-table-column
              prop="color_no"
              :label="$t('aiExtend.overview.colColorNo')"
              width="100"
            />
            <el-table-column
              prop="fabric_type"
              :label="$t('aiExtend.overview.colFabricType')"
              width="100"
            />
            <el-table-column prop="source" :label="$t('aiExtend.overview.colSource')" width="100">
              <template #default="{ row }">{{ SOURCE_LABELS[row.source] || row.source }}</template>
            </el-table-column>
            <el-table-column
              prop="confidence"
              :label="$t('aiExtend.overview.colConfidence')"
              width="100"
            >
              <template #default="{ row }">{{ Number(row.confidence).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column
              prop="is_applied"
              :label="$t('aiExtend.overview.colApplied')"
              width="70"
            >
              <template #default="{ row }">
                <el-tag :type="row.is_applied ? 'success' : 'info'" size="small">
                  {{
                    row.is_applied
                      ? $t('aiExtend.overview.applied')
                      : $t('aiExtend.overview.notApplied')
                  }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="created_at"
              :label="$t('aiExtend.overview.colTime')"
              min-width="160"
            />
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="isPhone ? 24 : 12">
        <el-card shadow="hover" class="overview-quality-card">
          <template #header>
            <div class="card-header">{{ $t('aiExtend.overview.latestQuality') }}</div>
          </template>
          <section
            v-if="isPhone"
            class="ai-mobile overview-quality-mobile"
            :aria-label="t('aiExtend.overview.ariaLatestQuality')"
          >
            <ul class="card-list">
              <li v-for="row in summary.latest_quality_predictions" :key="row.id" class="card-item">
                <dl class="card-fields">
                  <div>
                    <dt>{{ $t('aiExtend.overview.colProductId') }}</dt>
                    <dd>{{ row.product_id }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colRisk') }}</dt>
                    <dd>
                      <el-tag
                        :style="{
                          background: RISK_LEVEL_COLORS[row.risk_level],
                          color: '#fff',
                          border: 'none',
                        }"
                        size="small"
                      >
                        {{ RISK_LEVEL_LABELS[row.risk_level] }}
                      </el-tag>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colRiskScore') }}</dt>
                    <dd>{{ row.risk_score }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colTrend') }}</dt>
                    <dd>{{ TREND_LABELS[row.trend] || row.trend }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colAck') }}</dt>
                    <dd>
                      <el-tag :type="row.is_acknowledged ? 'success' : 'warning'" size="small">
                        {{
                          row.is_acknowledged
                            ? $t('aiExtend.overview.acknowledged')
                            : $t('aiExtend.overview.unacknowledged')
                        }}
                      </el-tag>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ $t('aiExtend.overview.colTime') }}</dt>
                    <dd>{{ row.created_at }}</dd>
                  </div>
                </dl>
              </li>
            </ul>
            <el-empty
              v-if="summary.latest_quality_predictions.length === 0"
              :description="t('components.v2Table.empty')"
            />
          </section>
          <el-table
            v-else
            :data="summary.latest_quality_predictions"
            size="small"
            max-height="300"
            :aria-label="t('aiExtend.overview.ariaLatestQuality')"
          >
            <el-table-column
              prop="product_id"
              :label="$t('aiExtend.overview.colProductId')"
              width="80"
            />
            <el-table-column prop="risk_level" :label="$t('aiExtend.overview.colRisk')" width="90">
              <template #default="{ row }">
                <el-tag
                  :style="{
                    background: RISK_LEVEL_COLORS[row.risk_level],
                    color: '#fff',
                    border: 'none',
                  }"
                  size="small"
                >
                  {{ RISK_LEVEL_LABELS[row.risk_level] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="risk_score"
              :label="$t('aiExtend.overview.colRiskScore')"
              width="70"
            />
            <el-table-column prop="trend" :label="$t('aiExtend.overview.colTrend')" width="80">
              <template #default="{ row }">{{ TREND_LABELS[row.trend] || row.trend }}</template>
            </el-table-column>
            <el-table-column
              prop="is_acknowledged"
              :label="$t('aiExtend.overview.colAck')"
              width="80"
            >
              <template #default="{ row }">
                <el-tag :type="row.is_acknowledged ? 'success' : 'warning'" size="small">
                  {{
                    row.is_acknowledged
                      ? $t('aiExtend.overview.acknowledged')
                      : $t('aiExtend.overview.unacknowledged')
                  }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column
              prop="created_at"
              :label="$t('aiExtend.overview.colTime')"
              min-width="160"
            />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.ai-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-width: 100%;
}
.ai-overview--phone .page-header {
  flex-wrap: wrap;
}
.ai-overview--phone :deep(.el-button) {
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
  gap: 10px;
  margin: 0;
}
.card-fields > div {
  min-width: 0;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 15px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-header h2 {
  margin: 0;
  font-size: 20px;
  color: #303133;
}
.header-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.kpi-row {
  margin-bottom: 0;
}
.kpi-card {
  text-align: center;
}
.kpi-label {
  font-size: 13px;
  color: #909399;
}
.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: #303133;
  margin: 8px 0;
}
.kpi-extra {
  font-size: 12px;
  color: #909399;
}
.actions-row {
  margin-bottom: 0;
}
.action-card {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: transform 0.2s;
}
.action-card:hover {
  transform: translateY(-2px);
}
.action-icon {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.action-body {
  flex: 1;
}
.action-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.action-desc {
  font-size: 12px;
  color: #909399;
}
.latest-row {
  margin-bottom: 0;
}
.card-header {
  font-weight: 600;
}
</style>
