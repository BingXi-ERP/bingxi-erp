<!--
  CapacityTrend.vue - 产能数量趋势 ECharts 图（含 ECharts 实例生命周期管理）
  拆分自 capacity/index.vue（P14 批 2 I-3 第 6 批）
  当前按工作中心真实数量口径渲染计划量、实际量与日产能
-->
<template>
  <el-row :gutter="20" class="chart-row">
    <el-col :span="24">
      <el-card shadow="hover">
        <template #header>
          <div class="card-header">
            <span>{{ $t('capacityModule.trend.title') }}</span>
            <el-radio-group :model-value="days" size="small" @update:model-value="updateDays">
              <el-radio-button :value="7">{{
                $t('capacityModule.trend.last7Days')
              }}</el-radio-button>
              <el-radio-button :value="30">{{
                $t('capacityModule.trend.last30Days')
              }}</el-radio-button>
            </el-radio-group>
          </div>
        </template>
        <div ref="chartRef" class="chart-container"></div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { echarts } from '@/utils/echarts';
import type { ECharts } from '@/utils/echarts';
import type { CapacityTrend } from '@/api/capacity';

const { t } = useI18n({ useScope: 'global' });

// 趋势数据 + 天数（v-model 双向）
const props = defineProps<{ data: CapacityTrend[]; days: number }>();
const emit = defineEmits<{ 'update:days': [v: number] }>();

const updateDays = (v: number) => emit('update:days', v);

// ECharts 实例 + 容器 ref
const chartRef = ref<HTMLElement>();
let capacityChart: ECharts | null = null;
let resizeHandler: (() => void) | null = null;

// 渲染 ECharts 选项
const renderChart = (data: CapacityTrend[]) => {
  if (!chartRef.value) return;
  if (data.length === 0) {
    capacityChart?.clear();
    return;
  }
  if (!capacityChart) {
    capacityChart = echarts.init(chartRef.value);
    resizeHandler = () => capacityChart?.resize();
    window.addEventListener('resize', resizeHandler);
  }
  const plannedQuantityLabel = t('capacityModule.trend.plannedQuantity');
  const actualQuantityLabel = t('capacityModule.trend.actualQuantity');
  const capacityQuantityLabel = t('capacityModule.trend.capacityQuantity');
  const capacityUnit = data[0]?.capacity_unit || t('capacityModule.trend.quantityUnit');
  const option = {
    tooltip: { trigger: 'axis' },
    legend: { data: [plannedQuantityLabel, actualQuantityLabel, capacityQuantityLabel], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: '#909399' } },
    },
    yAxis: {
      type: 'value',
      name: capacityUnit,
      axisLine: { lineStyle: { color: '#909399' } },
      splitLine: { lineStyle: { color: '#ebeef5' } },
    },
    series: [
      {
        name: plannedQuantityLabel,
        type: 'line',
        data: data.map(d => Number(d.planned_quantity)),
        smooth: true,
        itemStyle: { color: '#409eff' },
        areaStyle: { color: 'rgba(64, 158, 255, 0.1)' },
      },
      {
        name: actualQuantityLabel,
        type: 'line',
        data: data.map(d => Number(d.actual_quantity)),
        smooth: true,
        itemStyle: { color: '#67c23a' },
      },
      {
        name: capacityQuantityLabel,
        type: 'line',
        data: data.map(d => Number(d.capacity_quantity)),
        smooth: true,
        itemStyle: { color: '#e6a23c' },
        lineStyle: { type: 'dashed' },
      },
    ],
  };
  capacityChart.setOption(option);
};

// 监听 data 变化 → 重新渲染 ECharts（空数组清空旧图，避免展示上一个筛选条件的数据）
watch(
  () => props.data,
  newData => {
    renderChart(newData);
  },
  { immediate: true, deep: true }
);

// 监听语言切换 → 重新渲染 ECharts（图例/y 轴名称随语言更新）
watch(
  () => t('capacityModule.trend.title'),
  () => {
    renderChart(props.data);
  }
);

// 挂载后初始化 ECharts
onMounted(() => {
  renderChart(props.data);
});

// 卸载前清理 ECharts
onBeforeUnmount(() => {
  capacityChart?.dispose();
  capacityChart = null;
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
});
</script>

<style scoped>
.chart-row {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header span {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.chart-container {
  height: 350px;
  width: 100%;
}
</style>
