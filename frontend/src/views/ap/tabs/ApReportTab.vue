<!--
  ApReportTab.vue - 应付报表中心
  四类报表查询：统计汇总 / 日报 / 月报 / 账龄分析
  数据源：/ap/reports/*（api/ap.ts 封装）
-->
<template>
  <div class="ap-report-tab" :class="{ 'ap-report-tab--phone': isPhone }">
    <el-card shadow="never">
      <template #header>
        <div class="report-header">
          <el-radio-group v-model="reportType">
            <el-radio-button value="statistics">{{
              t('apModule.report.statistics')
            }}</el-radio-button>
            <el-radio-button value="daily">{{ t('apModule.report.daily') }}</el-radio-button>
            <el-radio-button value="monthly">{{ t('apModule.report.monthly') }}</el-radio-button>
            <el-radio-button value="aging">{{ t('apModule.report.aging') }}</el-radio-button>
          </el-radio-group>
          <el-button type="primary" :loading="loading" @click="fetchReport">
            {{ t('common.search') }}
          </el-button>
        </div>
      </template>

      <section v-if="isPhone" class="ap-report-mobile" :aria-label="t('apModule.tabs.report')">
        <ul class="card-list">
          <li v-for="(row, index) in rows" :key="index" class="card-item">
            <dl class="card-fields">
              <div v-for="col in columns" :key="col">
                <dt>{{ col }}</dt>
                <dd>{{ formatCell(row[col]) }}</dd>
              </div>
            </dl>
          </li>
        </ul>
        <el-empty
          v-if="!loading && rows.length === 0"
          :description="t('apModule.report.emptyTip')"
        />
      </section>
      <el-table v-else-if="rows.length" :data="rows" border stripe max-height="480">
        <el-table-column
          v-for="col in columns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
          align="right"
        >
          <template #default="{ row }">
            {{ formatCell(row[col]) }}
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-else-if="!loading" :description="t('apModule.report.emptyTip')" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { useBreakpoint } from '@/composables/useBreakpoint';
import {
  getAPStatisticsReport,
  getAPDailyReport,
  getAPMonthlyReport,
  getAPAgingReport,
} from '@/api/ap';

const { t } = useI18n({ useScope: 'global' });

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const reportType = ref<'statistics' | 'daily' | 'monthly' | 'aging'>('statistics');
const loading = ref(false);
const rows = ref<Record<string, unknown>[]>([]);

const columns = computed(() => (rows.value.length ? Object.keys(rows.value[0]) : []));

const formatCell = (value: unknown) => {
  if (typeof value === 'number') {
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
  return value ?? '-';
};

const fetchers = {
  statistics: getAPStatisticsReport,
  daily: getAPDailyReport,
  monthly: getAPMonthlyReport,
  aging: getAPAgingReport,
};

const fetchReport = async () => {
  loading.value = true;
  try {
    const res =
      reportType.value === 'daily'
        ? await getAPDailyReport(new Date().toISOString().split('T')[0])
        : reportType.value === 'monthly'
          ? await getAPMonthlyReport(new Date().getFullYear(), new Date().getMonth() + 1)
          : await fetchers[reportType.value]();
    const d = res.data as unknown as
      | { list?: Record<string, unknown>[]; items?: Record<string, unknown>[] }
      | Record<string, unknown>[]
      | undefined;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      rows.value = d.list || d.items || [];
    } else {
      rows.value = (d as Record<string, unknown>[]) || [];
    }
  } catch (e) {
    const err = e as { message?: string };
    ElMessage.error(err.message || t('common.failed'));
    rows.value = [];
  } finally {
    loading.value = false;
  }
};

defineExpose({ refresh: fetchReport });
</script>

<style scoped>
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ap-report-mobile {
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
  margin: 0;
}
.card-fields > div {
  min-width: 0;
}
.card-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.card-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.ap-report-tab--phone .report-header {
  flex-wrap: wrap;
  gap: 8px;
  align-items: flex-start;
}
.ap-report-tab--phone :deep(.el-radio-group) {
  width: 100%;
  flex-wrap: wrap;
  gap: 8px;
}
.ap-report-tab--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
  margin-left: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}
</style>
