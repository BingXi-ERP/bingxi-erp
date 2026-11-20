<script setup lang="ts">
/**
 * AdvancedReportPanel - 报表引擎 tab 视图组件（纯展示）
 * 任务编号: P13 批 1 B3 I-1（拆分 advanced/index.vue 第 2 个 tab）
 * 包含：报表模板列表、执行报表、导出报表、报表结果展示弹窗
 * 数据与函数全部由父组件通过 props 传入
 */
// v11 批次 180 P2-1 修复：从 useRpt 导入具体类型替代 any
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBreakpoint } from '@/composables/useBreakpoint';
import type { ReportTemplate, ReportColumn } from '../composables/useRpt';

const { t } = useI18n({ useScope: 'global' });
const { width } = useBreakpoint();
const isPhone = computed(() => width.value < 768);

function reportCell(row: unknown, key: string): string {
  const value = (row as Record<string, unknown>)[key];
  return value == null || value === '' ? '' : String(value);
}

interface Props {
  reportTemplates: ReportTemplate[];
  reportLoading: boolean;
  reportResultVisible: boolean;
  reportData: unknown[];
  reportColumns: ReportColumn[];
  executeReport: (row: ReportTemplate) => Promise<void>;
  exportReport: (row: ReportTemplate, format: string) => Promise<void>;
}

defineProps<Props>();

/**
 * 关闭报表结果弹窗（通过 emit 通知父组件）
 */
const emit = defineEmits<{
  (e: 'update:report-result-visible', value: boolean): void;
}>();
const closeReportResult = () => emit('update:report-result-visible', false);
</script>

<template>
  <div class="advanced-report-panel" :class="{ 'advanced-report-panel--phone': isPhone }">
    <div class="page-header">
      <h2 class="page-title">{{ t('advancedModule.report.title') }}</h2>
    </div>

    <el-card shadow="hover">
      <section v-if="isPhone" class="report-mobile report-templates-mobile">
        <ul class="card-list" :aria-label="t('advancedModule.report.ariaTemplates')">
          <li
            v-for="(row, index) in reportTemplates"
            :key="row.template_code + '-' + index"
            class="card-item"
          >
            <dl class="card-fields">
              <div>
                <dt>{{ t('advancedModule.report.colName') }}</dt>
                <dd>{{ row.template_name }}</dd>
              </div>
              <div>
                <dt>{{ t('advancedModule.report.colCode') }}</dt>
                <dd>{{ row.template_code }}</dd>
              </div>
              <div>
                <dt>{{ t('advancedModule.report.colCategory') }}</dt>
                <dd>{{ row.category }}</dd>
              </div>
              <div>
                <dt>{{ t('advancedModule.report.colDesc') }}</dt>
                <dd>{{ row.description }}</dd>
              </div>
              <div>
                <dt>{{ t('advancedModule.report.colCreatedAt') }}</dt>
                <dd>{{ row.created_at }}</dd>
              </div>
            </dl>
            <div class="card-actions">
              <el-button type="primary" @click="executeReport(row as ReportTemplate)">{{
                t('advancedModule.report.execute')
              }}</el-button>
              <el-button type="success" @click="exportReport(row, 'excel')">{{
                t('advancedModule.report.exportExcel')
              }}</el-button>
              <el-button type="warning" @click="exportReport(row, 'docx')">{{
                t('advancedModule.report.exportWord')
              }}</el-button>
            </div>
          </li>
        </ul>
        <el-empty
          v-if="reportTemplates.length === 0"
          :description="t('advancedModule.report.empty')"
        />
      </section>
      <el-table
        v-else
        v-loading="reportLoading"
        :data="reportTemplates"
        stripe
        :aria-label="t('advancedModule.report.ariaTemplates')"
      >
        <el-table-column
          prop="template_name"
          :label="t('advancedModule.report.colName')"
          width="180"
        />
        <el-table-column
          prop="template_code"
          :label="t('advancedModule.report.colCode')"
          width="120"
        />
        <el-table-column
          prop="category"
          :label="t('advancedModule.report.colCategory')"
          width="120"
        />
        <el-table-column
          prop="description"
          :label="t('advancedModule.report.colDesc')"
          min-width="200"
        />
        <el-table-column
          prop="created_at"
          :label="t('advancedModule.report.colCreatedAt')"
          width="160"
        />
        <el-table-column :label="t('advancedModule.report.colAction')" width="200" fixed="right">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="executeReport(row as ReportTemplate)"
              >{{ t('advancedModule.report.execute') }}</el-button
            >
            <el-button type="success" link size="small" @click="exportReport(row, 'excel')">{{
              t('advancedModule.report.exportExcel')
            }}</el-button>
            <el-button type="warning" link size="small" @click="exportReport(row, 'docx')">{{
              t('advancedModule.report.exportWord')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      :model-value="reportResultVisible"
      :title="t('advancedModule.report.resultTitle')"
      :width="isPhone ? 'calc(100vw - 24px)' : '80%'"
      :aria-label="t('advancedModule.report.ariaResultDialog')"
      @update:model-value="(v: boolean) => emit('update:report-result-visible', v)"
    >
      <div class="report-result">
        <el-empty v-if="!reportData" :description="t('advancedModule.report.empty')" />
        <section v-else-if="isPhone" class="report-mobile report-result-mobile">
          <ul class="card-list" :aria-label="t('advancedModule.report.ariaResultTable')">
            <li v-for="(row, index) in reportData" :key="index" class="card-item">
              <dl class="card-fields">
                <div v-for="col in reportColumns" :key="col.key">
                  <dt>{{ col.label }}</dt>
                  <dd>{{ reportCell(row, col.key) }}</dd>
                </div>
              </dl>
            </li>
          </ul>
          <el-empty
            v-if="reportData.length === 0"
            :description="t('advancedModule.report.empty')"
          />
        </section>
        <el-table
          v-else
          :data="reportData"
          border
          stripe
          :aria-label="t('advancedModule.report.ariaResultTable')"
        >
          <el-table-column
            v-for="col in reportColumns"
            :key="col.key"
            :prop="col.key"
            :label="col.label"
          />
        </el-table>
      </div>
      <template #footer>
        <el-button @click="closeReportResult">{{ t('advancedModule.report.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.advanced-report-panel {
  min-width: 0;
  max-width: 100%;
}
.report-result {
  max-width: 100%;
  overflow-x: auto;
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
.advanced-report-panel--phone :deep(.el-button) {
  min-width: 44px;
  min-height: 44px;
}
</style>
