<!--
  sales-analysis/index.vue - 销售分析（拆分重构版）
  任务编号: P14 批 2 I-3 第 6 批
  拆分：535 行 → ~110 行 + 5 子组件 + 3 composable + 1 工具
  行为完全保持一致（仅结构重构）
-->
<template>
  <div class="sales-analysis-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">{{ t('salesAnalysis.index.pageTitle') }}</h1>
        <el-breadcrumb separator="/">
          <el-breadcrumb-item :to="{ path: '/' }">{{
            t('salesAnalysis.index.breadcrumbHome')
          }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{ t('salesAnalysis.index.breadcrumbSales') }}</el-breadcrumb-item>
          <el-breadcrumb-item>{{
            t('salesAnalysis.index.breadcrumbSalesAnalysis')
          }}</el-breadcrumb-item>
        </el-breadcrumb>
      </div>
      <div class="header-actions">
        <el-button @click="saProc.handleExport">
          <el-icon><Download /></el-icon>
          {{ t('salesAnalysis.index.buttonExport') }}
        </el-button>
      </div>
    </div>

    <!-- 经营分析（原 /sales-analysis）与多维分析（原 /bi/sales-analysis）合并为单入口双页签；
         旧地址由路由重定向到 ?tab=bi，页面以 query 为页签唯一状态源。 -->
    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane :label="t('salesAnalysis.index.tabOverview')" name="overview">
        <SalesAnalysisStatistics :stats="sa.stats" />

        <SalesAnalysisTrend
          :granularity="sa.trendGranularity"
          :data="sa.trendData"
          :composition="sa.productRanking"
          @update:granularity="(v: SalesTrendGranularity) => (sa.trendGranularity = v)"
        />

        <!-- 手机卡片（<768）：排名与目标改单列卡片，字段/按钮键与桌面列同源；桌面表格整体退场 -->
        <section
          v-if="isPhone"
          class="sales-analysis-mobile"
          :aria-label="t('salesAnalysis.index.mobileCardAria')"
        >
          <div class="sa-group">
            <div class="sa-group-header">
              <span>{{ t('salesAnalysis.productRank.cardTitle') }}</span>
              <el-select
                :model-value="sa.productRankType"
                size="small"
                style="width: 100px"
                @update:model-value="onProductRankType"
              >
                <el-option :label="t('salesAnalysis.productRank.optionByAmount')" value="amount" />
                <el-option
                  :label="t('salesAnalysis.productRank.optionByQuantity')"
                  value="quantity"
                />
              </el-select>
            </div>
            <ul class="order-list">
              <li
                v-for="(row, index) in sa.productRanking"
                :key="row.product_name"
                class="order-card"
              >
                <dl class="order-fields">
                  <div class="order-number">
                    <dt>{{ t('salesAnalysis.productRank.columnRank') }}</dt>
                    <dd>{{ index + 1 }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.productRank.columnProductName') }}</dt>
                    <dd>{{ row.product_name }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.productRank.columnAmount') }}</dt>
                    <dd>{{ formatCurrency(row.amount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.productRank.columnQuantity') }}</dt>
                    <dd>{{ row.quantity }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.productRank.columnPercentage') }}</dt>
                    <dd>{{ row.percentage }}%</dd>
                  </div>
                </dl>
              </li>
            </ul>
          </div>

          <div class="sa-group">
            <div class="sa-group-header">
              <span>{{ t('salesAnalysis.customerRank.cardTitle') }}</span>
              <el-select
                :model-value="sa.customerRankType"
                size="small"
                style="width: 100px"
                @update:model-value="onCustomerRankType"
              >
                <el-option :label="t('salesAnalysis.customerRank.optionByAmount')" value="amount" />
                <el-option :label="t('salesAnalysis.customerRank.optionByOrders')" value="orders" />
              </el-select>
            </div>
            <ul class="order-list">
              <li
                v-for="(row, index) in sa.customerRanking"
                :key="row.customer_name"
                class="order-card"
              >
                <dl class="order-fields">
                  <div class="order-number">
                    <dt>{{ t('salesAnalysis.customerRank.columnRank') }}</dt>
                    <dd>{{ index + 1 }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.customerRank.columnCustomerName') }}</dt>
                    <dd>{{ row.customer_name }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.customerRank.columnAmount') }}</dt>
                    <dd>{{ formatCurrency(row.amount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.customerRank.columnOrderCount') }}</dt>
                    <dd>{{ row.order_count }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.customerRank.columnPercentage') }}</dt>
                    <dd>{{ row.percentage }}%</dd>
                  </div>
                </dl>
              </li>
            </ul>
          </div>

          <div class="sa-group">
            <div class="sa-group-header">
              <span>{{ t('salesAnalysis.target.cardTitle') }}</span>
              <el-button type="primary" size="small" @click="saProc.handleEditTarget">
                <el-icon><Edit /></el-icon>
                {{ t('salesAnalysis.target.buttonEdit') }}
              </el-button>
            </div>
            <ul class="order-list">
              <li v-for="row in sa.salesTargets" :key="row.period" class="order-card">
                <dl class="order-fields">
                  <div class="order-number">
                    <dt>{{ t('salesAnalysis.target.columnPeriod') }}</dt>
                    <dd>{{ row.period }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.target.columnTargetAmount') }}</dt>
                    <dd>{{ formatCurrency(row.target_amount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.target.columnActualAmount') }}</dt>
                    <dd>{{ formatCurrency(row.actual_amount) }}</dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.target.columnCompletionRate') }}</dt>
                    <dd>
                      <el-progress
                        v-if="row.completion_rate !== null"
                        :percentage="Number(row.completion_rate)"
                        :color="getProgressColor(row.completion_rate)"
                      />
                      <span v-else>{{ t('common.valueMissing') }}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.target.columnVariance') }}</dt>
                    <dd>
                      <span v-if="row.variance === null">{{ t('common.valueMissing') }}</span>
                      <span
                        v-else
                        :class="Number(row.variance) >= 0 ? 'text-success' : 'text-danger'"
                      >
                        {{ Number(row.variance) >= 0 ? '+' : '' }}{{ formatCurrency(row.variance) }}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>{{ t('salesAnalysis.target.columnStatus') }}</dt>
                    <dd>
                      <el-tag :type="getTargetStatusType(row.status)">
                        {{ getTargetStatusLabel(row.status) }}
                      </el-tag>
                    </dd>
                  </div>
                </dl>
              </li>
            </ul>
          </div>
        </section>
        <template v-else>
          <el-row :gutter="20" class="ranking-row">
            <el-col :xs="24" :lg="12">
              <SalesAnalysisProductRank
                :data="sa.productRanking"
                :type="sa.productRankType"
                @update:type="(v: string) => saProc.handleProductRankTypeChange(v, sa)"
              />
            </el-col>
            <el-col :xs="24" :lg="12">
              <SalesAnalysisCustomerRank
                :data="sa.customerRanking"
                :type="sa.customerRankType"
                @update:type="(v: string) => saProc.handleCustomerRankTypeChange(v, sa)"
              />
            </el-col>
          </el-row>

          <SalesAnalysisTarget :data="sa.salesTargets" @edit-target="saProc.handleEditTarget" />
        </template>
      </el-tab-pane>
      <el-tab-pane :label="t('salesAnalysis.index.tabBi')" name="bi" lazy>
        <BiSalesAnalysis />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Download, Edit } from '@element-plus/icons-vue';
import type { SalesTrendGranularity } from '@/api/sales-analysis';
import BiSalesAnalysis from '@/views/bi/SalesAnalysis.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { useSa } from './composables/useSa';
import { useSaProc } from './composables/useSaProc';
import SalesAnalysisStatistics from './components/SalesAnalysisStatistics.vue';
import SalesAnalysisTrend from './components/SalesAnalysisTrend.vue';
import SalesAnalysisProductRank from './components/SalesAnalysisProductRank.vue';
import SalesAnalysisCustomerRank from './components/SalesAnalysisCustomerRank.vue';
import SalesAnalysisTarget from './components/SalesAnalysisTarget.vue';
import { formatCurrency, getProgressColor, getTargetStatusType } from './composables/saFmts';

const { t } = useI18n({ useScope: 'global' });

const route = useRoute();
const router = useRouter();
const activeTab = ref(route.query.tab === 'bi' ? 'bi' : 'overview');

watch(
  () => route.query.tab,
  tab => {
    activeTab.value = tab === 'bi' ? 'bi' : 'overview';
  }
);

const handleTabChange = (tab: string | number) => {
  router.replace({ query: { ...route.query, tab: String(tab) } });
};

// 业务状态
const sa = useSa();
const saProc = useSaProc();

const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

const onProductRankType = (v: string) => saProc.handleProductRankTypeChange(v, sa);
const onCustomerRankType = (v: string) => saProc.handleCustomerRankTypeChange(v, sa);

/** 销售目标状态码 → i18n 标签（与桌面目标表同源的键，语言切换响应） */
const getTargetStatusLabel = (status: string): string => {
  switch (status) {
    case 'COMPLETED':
      return t('salesAnalysis.target.statusCompleted');
    case 'IN_PROGRESS':
      return t('salesAnalysis.target.statusInProgress');
    case 'PARTIAL':
      return t('salesAnalysis.target.statusPartial');
    case 'NOT_STARTED':
      return t('salesAnalysis.target.statusNotStarted');
    default:
      return status;
  }
};

onMounted(() => {
  sa.getStats();
  sa.getProductRanking();
  sa.getCustomerRanking();
  sa.getSalesTargets();
  sa.getTrendData();
});
</script>

<style scoped>
.sales-analysis-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.page-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 10px;
}

.ranking-row {
  margin-bottom: 20px;
}

@media (max-width: 767px) {
  .sales-analysis-page {
    padding: 12px;
  }
}

.sales-analysis-mobile {
  min-width: 0;
}
.sa-group {
  margin-bottom: 20px;
}
.sa-group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-bottom: 8px;
  font-weight: 600;
}
.order-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.order-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--el-border-color);
  border-radius: var(--el-border-radius-base);
  background: var(--el-bg-color);
}
.order-fields {
  display: grid;
  gap: 12px;
  margin: 0;
}
.order-fields > div {
  min-width: 0;
}
.order-fields dt {
  color: var(--el-text-color-regular);
  font-size: 14px;
  line-height: 1.5;
}
.order-fields dd {
  margin: 4px 0 0;
  color: var(--el-text-color-primary);
  font-size: 16px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.order-number dd {
  font-weight: 600;
}
.text-success {
  color: #67c23a;
}
.text-danger {
  color: #f56c6c;
}
</style>
