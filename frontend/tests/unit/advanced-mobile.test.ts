import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick, type Component } from 'vue';
import ElementPlus, {
  ElDescriptions,
  ElDialog,
  ElSelect,
  ElTable,
  ElTableColumn,
} from 'element-plus';
import AdvancedAiPanel from '@/views/advanced/components/AdvancedAiPanel.vue';
import AdvancedQualityPanel from '@/views/advanced/components/AdvancedQualityPanel.vue';
import AdvancedRecipePanel from '@/views/advanced/components/AdvancedRecipePanel.vue';
import AdvancedReportPanel from '@/views/advanced/components/AdvancedReportPanel.vue';
import SubscriptionPanel from '@/views/advanced/components/SubscriptionPanel.vue';
import * as subscriptionApi from '@/api/report-enhanced';
import zhCN from '@/locales/zh-CN';
import type {
  AnomalyItem,
  ForecastResult,
  InventoryResult,
  RecommendationItem,
} from '@/views/advanced/composables/useAi';
import type { QualityResult } from '@/views/advanced/composables/useQlt';
import type { RecipeResult } from '@/views/advanced/composables/useRcp';
import type { ReportColumn, ReportTemplate } from '@/views/advanced/composables/useRpt';
import type { ReportSubscription } from '@/api/report-enhanced';

vi.mock('@/api/report-enhanced', () => ({
  getSubscriptionList: vi.fn(),
  createSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  toggleSubscription: vi.fn(),
  sendSubscriptionNow: vi.fn(),
  getAvailableFields: vi.fn(),
  previewReport: vi.fn(),
}));

const labels = zhCN.advancedModule;
const widths = [320, 767, 768, 1280];
const initialWidth = window.innerWidth;
const wrappers: Array<ReturnType<typeof mountPanel>> = [];
const hosts: HTMLElement[] = [];

type Findable = { findAll(selector: string): DOMWrapper<Element>[] };

async function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  await nextTick();
}

function mountPanel(component: Component, props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(component, {
    props,
    attachTo: host,
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonByText(container: Findable, text: string) {
  const buttons = container.findAll('button').filter(button => button.text().trim() === text);
  expect(buttons).toHaveLength(1);
  return buttons[0];
}

function cardFields(container: Findable) {
  return container.findAll('dl.card-fields > div').map(div => ({
    label: div.get('dt').text().trim(),
    value: div.get('dd').text().replace(/\s+/g, ' ').trim(),
  }));
}

function lastMessageBox() {
  const boxes = document.querySelectorAll('.el-message-box');
  expect(boxes.length).toBeGreaterThan(0);
  return new DOMWrapper(boxes[boxes.length - 1]);
}

async function confirmMessageBox() {
  const buttons = lastMessageBox().findAll('.el-message-box__btns button');
  expect(buttons).toHaveLength(2);
  await buttons[1].trigger('click');
  await flushPromises();
}

function subscription(enabled: boolean, id = 1): ReportSubscription {
  return {
    id,
    name: `subscription-${id}`,
    template_id: 9,
    frequency: enabled ? 'DAILY' : 'WEEKLY',
    recipients: ['a@example.com', 'b@example.com'],
    parameters: null,
    export_format: enabled ? 'xlsx' : 'excel',
    is_enabled: enabled,
    status: 'ACTIVE',
    next_run_at: null,
    last_run_at: enabled ? '2026-11-16T09:00:00Z' : null,
    last_run_status: null,
    last_run_error: null,
    run_count: 2,
    retry_count: 0,
    max_retries: 3,
    next_retry_at: null,
    created_by: 1,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  };
}

const forecast: ForecastResult = {
  sales_amount: 1250.5,
  order_count: 12,
  confidence: 87,
  trend: 'up',
};
const inventory: InventoryResult = {
  summary: 'summary',
  items: [
    { product_name: 'P-1', suggestion: 'restock', priority: 'high' },
    { product_name: 'P-2', suggestion: 'hold', priority: 'medium' },
  ],
};
const anomalies: AnomalyItem[] = [
  { item: 'A-1', type: 'inventory', description: 'below safety stock', severity: 'critical' },
];
const recommendations: RecommendationItem[] = [
  { type: 'suggestion', created_at: '2026-11-01 09:00', content: 'rebalance' },
];

const quality: QualityResult = {
  total_inspections: 120,
  avg_qualification_rate: 92.345,
  trend: labels.quality.trendUp,
  trend_rate: 1.2,
  risk_level: labels.quality.riskMedium,
  risk_score: 60,
  confidence: 0.9,
  top_issues: [{ issue_type: 'color', occurrences: 8, percentage: 66.7 }],
  recommendations: ['fix dosing'],
  period_breakdown: [{ period: '2026-11', inspections: 30, avg_qualification_rate: 91.234 }],
  source: 'history',
};

const recipe: RecipeResult = {
  recommended_params: { temperature: 130, time_minutes: 45, ph_value: 4.5, liquor_ratio: 1.5 },
  confidence: 0.88,
  similar_cases: 7,
  source: 'knn',
  reason: 'nearest neighbour',
  candidates: [
    {
      recipe_no: 'R-1',
      color_no: 'C-1',
      fabric_type: 'cotton',
      dye_type: 'D-1',
      temperature: 128,
      time_minutes: 40,
      ph_value: 4.6,
      liquor_ratio: 1.6,
      similarity: 0.9,
    },
    {
      recipe_no: 'R-2',
      color_no: 'C-2',
      fabric_type: 'silk',
      dye_type: null,
      temperature: null,
      time_minutes: null,
      ph_value: null,
      liquor_ratio: null,
      similarity: 0.5,
    },
  ],
};

const templates: ReportTemplate[] = [
  {
    template_code: 'T-1',
    template_name: 'Daily sales',
    category: 'sales',
    description: 'daily summary',
    created_at: '2026-11-01T09:00:00Z',
  },
];

const reportColumns: ReportColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'qty', label: 'Qty' },
];
const reportData = [
  { name: 'alpha', qty: 3 },
  { name: 'beta', qty: null },
];

function aiProps(overrides: Record<string, unknown> = {}) {
  return {
    forecastPeriod: '3m',
    forecastLoading: false,
    forecastResult: forecast,
    runSalesForecast: vi.fn().mockResolvedValue(undefined),
    inventoryLoading: false,
    inventoryResult: inventory,
    runInventoryOptimization: vi.fn().mockResolvedValue(undefined),
    anomalyType: 'sales',
    anomalyLoading: false,
    anomalyResult: anomalies,
    runAnomalyDetection: vi.fn().mockResolvedValue(undefined),
    recommendLoading: false,
    recommendationResult: recommendations,
    getRecommendations: vi.fn().mockResolvedValue(undefined),
    formatMoney: (amount: number) => `￥${amount.toFixed(2)}`,
    ...overrides,
  };
}

function qualityProps(overrides: Record<string, unknown> = {}) {
  return {
    qualityForm: { product_id: 1, inspection_type: '', window_days: 30 },
    qualityLoading: false,
    qualityResult: quality,
    runQualityPrediction: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function recipeProps(overrides: Record<string, unknown> = {}) {
  return {
    recipeForm: { color_no: 'C', fabric_type: 'cotton', dye_type: '', color_name: '', k: 1 },
    recipeLoading: false,
    recipeResult: recipe,
    runRecipeOptimization: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function reportProps(overrides: Record<string, unknown> = {}) {
  return {
    reportTemplates: templates,
    reportLoading: false,
    reportResultVisible: false,
    reportData: [],
    reportColumns: [],
    executeReport: vi.fn().mockResolvedValue(undefined),
    exportReport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(subscriptionApi.getSubscriptionList).mockResolvedValue({
    code: 200,
    message: '',
    data: { items: [subscription(true)], total: 1, page: 1, page_size: 50 },
  });
  vi.mocked(subscriptionApi.toggleSubscription).mockResolvedValue({
    code: 200,
    message: '',
    data: subscription(false),
  });
  vi.mocked(subscriptionApi.sendSubscriptionNow).mockResolvedValue({
    code: 200,
    message: '',
    data: { message: 'ok' },
  });
  vi.mocked(subscriptionApi.deleteSubscription).mockResolvedValue({
    code: 200,
    message: '',
    data: undefined as never,
  });
  vi.mocked(subscriptionApi.getAvailableFields).mockResolvedValue({
    code: 200,
    message: '',
    data: {
      template_type: 'sales',
      fields: [
        { key: 'f1', label: 'Field one', type: 'string', sortable: true },
        { key: 'f2', label: 'Field two', type: 'number', sortable: false },
      ],
    },
  });
  vi.mocked(subscriptionApi.previewReport).mockResolvedValue({
    code: 200,
    message: '',
    data: {
      template_id: 9,
      columns: ['Name', 'Qty'],
      data: [['alpha', '3']],
      total: 1,
      preview_rows: 1,
    },
  });
});

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  document.querySelectorAll('.el-message-box').forEach(box => box.remove());
  document.querySelectorAll('.el-overlay').forEach(overlay => overlay.remove());
  await flushPromises();
  await resize(initialWidth);
});

describe('Advanced AI panel mobile cards', () => {
  it.each(widths)('renders the same fields and hides the other layout at %ipx', async width => {
    await resize(width);
    const props = aiProps();
    const wrapper = mountPanel(AdvancedAiPanel, props);
    await flushPromises();
    const phone = width < 768;

    expect(wrapper.classes('advanced-ai-panel--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(phone ? 0 : 2);
    expect(wrapper.findAll('.card-list').length).toBe(phone ? 2 : 0);
    for (const label of [
      labels.ai.startForecast,
      labels.ai.generateSuggestion,
      labels.ai.detectAnomaly,
      labels.ai.getRecommendations,
    ]) {
      expect(buttonByText(wrapper, label).exists()).toBe(true);
    }

    if (phone) {
      expect(wrapper.findComponent(ElDescriptions).exists()).toBe(false);
      expect(cardFields(wrapper.get('.forecast-fields'))).toEqual([
        { label: labels.ai.forecastSales, value: '￥1250.50' },
        { label: labels.ai.forecastOrders, value: '12' },
        { label: labels.ai.confidence, value: '87%' },
        { label: labels.ai.forecastTrend, value: 'up' },
      ]);
      expect(cardFields(wrapper.get('.ai-inventory-mobile'))).toEqual([
        { label: labels.ai.colProduct, value: 'P-1' },
        { label: labels.ai.colSuggestion, value: 'restock' },
        { label: labels.ai.colPriority, value: labels.ai.priorityHigh },
        { label: labels.ai.colProduct, value: 'P-2' },
        { label: labels.ai.colSuggestion, value: 'hold' },
        { label: labels.ai.colPriority, value: labels.ai.priorityMedium },
      ]);
      expect(cardFields(wrapper.get('.ai-anomaly-mobile'))).toEqual([
        { label: labels.ai.colItem, value: 'A-1' },
        { label: labels.ai.colType, value: 'inventory' },
        { label: labels.ai.colDesc, value: 'below safety stock' },
        { label: labels.ai.colSeverity, value: 'critical' },
      ]);
    } else {
      expect(wrapper.findAllComponents(ElDescriptions)).toHaveLength(1);
      expect(cardFields(wrapper)).toHaveLength(0);
      const cells = wrapper
        .findAll('.el-table__body .el-table__row .cell')
        .map(cell => cell.text());
      expect(cells).toContain('P-1');
      expect(cells).toContain(labels.ai.priorityHigh);
      expect(cells).toContain('A-1');
      expect(cells).toContain('critical');
      expect(wrapper.findAllComponents(ElTableColumn).map(col => col.props('prop'))).toEqual([
        'product_name',
        'suggestion',
        'priority',
        'item',
        'type',
        'description',
        'severity',
      ]);
    }

    await buttonByText(wrapper, labels.ai.startForecast).trigger('click');
    await buttonByText(wrapper, labels.ai.generateSuggestion).trigger('click');
    await buttonByText(wrapper, labels.ai.detectAnomaly).trigger('click');
    await buttonByText(wrapper, labels.ai.getRecommendations).trigger('click');
    expect(props.runSalesForecast).toHaveBeenCalledTimes(1);
    expect(props.runInventoryOptimization).toHaveBeenCalledTimes(1);
    expect(props.runAnomalyDetection).toHaveBeenCalledTimes(1);
    expect(props.getRecommendations).toHaveBeenCalledTimes(1);
  });

  it('keeps empty semantics and select emits at both breakpoints', async () => {
    const empty = aiProps({
      forecastResult: null,
      inventoryResult: { summary: '', items: [] },
      anomalyResult: [],
      recommendationResult: null,
    });
    for (const width of [320, 768]) {
      await resize(width);
      const wrapper = mountPanel(AdvancedAiPanel, empty);
      await flushPromises();
      const phone = width < 768;
      expect(wrapper.findAll('.el-table__body .el-table__row')).toHaveLength(0);
      if (phone) {
        expect(wrapper.findAll('.card-item')).toHaveLength(0);
        expect(wrapper.findAll('.el-empty__description').length).toBeGreaterThanOrEqual(4);
      } else {
        expect(wrapper.find('.forecast-fields').exists()).toBe(false);
        expect(wrapper.find('.el-table__empty-text').exists()).toBe(true);
      }
    }
    await resize(320);
    const wrapper = mountPanel(AdvancedAiPanel, aiProps());
    await flushPromises();
    const selects = wrapper.findAllComponents(ElSelect);
    expect(selects).toHaveLength(2);
    await selects[0].vm.$emit('update:modelValue', '6m');
    await selects[1].vm.$emit('update:modelValue', 'inventory');
    expect(wrapper.emitted('update:forecastPeriod')).toEqual([['6m']]);
    expect(wrapper.emitted('update:anomalyType')).toEqual([['inventory']]);
  });
});

describe('Advanced quality panel mobile cards', () => {
  it.each(widths)('renders percentages and both tables as cards at %ipx', async width => {
    await resize(width);
    const props = qualityProps();
    const wrapper = mountPanel(AdvancedQualityPanel, props);
    await flushPromises();
    const phone = width < 768;

    expect(wrapper.classes('advanced-quality-panel--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(phone ? 0 : 2);
    expect(wrapper.findAll('.card-list').length).toBe(phone ? 2 : 0);
    expect(buttonByText(wrapper, labels.quality.startPredict).exists()).toBe(true);
    expect(wrapper.text()).toContain('92.34%');

    if (phone) {
      expect(cardFields(wrapper.get('.quality-issues-mobile'))).toEqual([
        { label: labels.quality.colIssueType, value: 'color' },
        { label: labels.quality.colOccurrences, value: '8' },
        { label: labels.quality.colPercentage, value: '66.7%' },
      ]);
      expect(cardFields(wrapper.get('.quality-period-mobile'))).toEqual([
        { label: labels.quality.colPeriod, value: '2026-11' },
        { label: labels.quality.colInspections, value: '30' },
        { label: labels.quality.colAvgRate, value: '91.23%' },
      ]);
    } else {
      const cells = wrapper
        .findAll('.el-table__body .el-table__row .cell')
        .map(cell => cell.text());
      expect(cells).toContain('color');
      expect(cells).toContain('91.23%');
      expect(wrapper.findAllComponents(ElTableColumn).map(col => col.props('prop'))).toEqual([
        'issue_type',
        'occurrences',
        undefined,
        'period',
        'inspections',
        undefined,
      ]);
    }

    await buttonByText(wrapper, labels.quality.startPredict).trigger('click');
    expect(props.runQualityPrediction).toHaveBeenCalledTimes(1);
  });

  it('shows both empty tables and hides them when there is no result', async () => {
    for (const width of [320, 1280]) {
      await resize(width);
      const wrapper = mountPanel(
        AdvancedQualityPanel,
        qualityProps({
          qualityResult: {
            ...quality,
            top_issues: [],
            period_breakdown: [],
          },
        })
      );
      await flushPromises();
      expect(wrapper.findAll('.card-item')).toHaveLength(0);
      expect(wrapper.text()).toContain(labels.quality.emptyNoRecords);
      expect(wrapper.text()).toContain(labels.quality.emptyNoPeriod);
    }
    await resize(320);
    const empty = mountPanel(AdvancedQualityPanel, qualityProps({ qualityResult: null }));
    await flushPromises();
    expect(empty.text()).toContain(labels.quality.empty);
    expect(empty.findAllComponents(ElTable)).toHaveLength(0);
  });
});

describe('Advanced recipe panel mobile cards', () => {
  it.each(widths)('renders temperature, null placeholders and candidates at %ipx', async width => {
    await resize(width);
    const props = recipeProps();
    const wrapper = mountPanel(AdvancedRecipePanel, props);
    await flushPromises();
    const phone = width < 768;

    expect(wrapper.classes('advanced-recipe-panel--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(phone ? 0 : 1);
    expect(wrapper.findAll('.card-list').length).toBe(phone ? 1 : 0);
    expect(buttonByText(wrapper, labels.recipe.generate).exists()).toBe(true);

    if (phone) {
      const detail = cardFields(wrapper.get('.recipe-detail-fields'));
      expect(detail[0]).toEqual({ label: labels.recipe.recTemperature, value: '130 °C' });
      expect(detail[1]).toEqual({ label: labels.recipe.recTime, value: '45 分钟' });
      expect(detail[2]).toEqual({ label: labels.recipe.recPh, value: '4.5' });
      expect(detail[3]).toEqual({ label: labels.recipe.recLiquorRatio, value: '1 : 1.5' });
      expect(detail[4]).toEqual({ label: labels.recipe.confidence, value: '88%' });
      expect(detail[6].value).toBe(labels.recipe.sourceKnn);
      const cards = wrapper.get('.recipe-candidates-mobile').findAll('.card-item');
      expect(cards).toHaveLength(2);
      expect(cardFields(cards[0])).toEqual([
        { label: labels.recipe.colRecipeNo, value: 'R-1' },
        { label: labels.recipe.colColorNo, value: 'C-1' },
        { label: labels.recipe.colFabricType, value: 'cotton' },
        { label: labels.recipe.colDyeType, value: 'D-1' },
        { label: labels.recipe.colTemperature, value: '128 °C' },
        { label: labels.recipe.colTime, value: '40 分' },
        { label: labels.recipe.colPh, value: '4.6' },
        { label: labels.recipe.colLiquorRatio, value: '1:1.6' },
        { label: labels.recipe.colSimilarity, value: '90%' },
      ]);
      const nullCard = cardFields(cards[1]);
      expect(nullCard[4].value).toBe('- °C');
      expect(nullCard[5].value).toBe('- 分');
      expect(nullCard[6].value).toBe('-');
      expect(nullCard[7].value).toBe('1:-');
    } else {
      expect(wrapper.findComponent(ElDescriptions).exists()).toBe(true);
      expect(wrapper.find('.recipe-detail-fields').exists()).toBe(false);
      const cells = wrapper
        .findAll('.el-table__body .el-table__row .cell')
        .map(cell => cell.text());
      expect(cells).toContain('128 °C');
      expect(cells).toContain('1:-');
      expect(wrapper.findAllComponents(ElTableColumn)).toHaveLength(9);
    }

    await buttonByText(wrapper, labels.recipe.generate).trigger('click');
    expect(props.runRecipeOptimization).toHaveBeenCalledTimes(1);
  });

  it('keeps empty candidates and empty result aligned', async () => {
    for (const width of [320, 1280]) {
      await resize(width);
      const wrapper = mountPanel(
        AdvancedRecipePanel,
        recipeProps({ recipeResult: { ...recipe, candidates: [] } })
      );
      await flushPromises();
      if (width < 768) {
        expect(wrapper.findAll('.card-item')).toHaveLength(0);
      } else {
        expect(wrapper.findAll('.el-table__body .el-table__row')).toHaveLength(0);
      }
      expect(wrapper.text()).toContain(labels.recipe.emptyNoCandidates);
    }
    await resize(320);
    const empty = mountPanel(AdvancedRecipePanel, recipeProps({ recipeResult: null }));
    await flushPromises();
    expect(empty.text()).toContain(labels.recipe.empty);
  });
});

describe('Advanced report panel mobile cards', () => {
  it.each(widths)('renders template fields and three actions at %ipx', async width => {
    await resize(width);
    const props = reportProps();
    const wrapper = mountPanel(AdvancedReportPanel, props);
    await flushPromises();
    const phone = width < 768;

    expect(wrapper.classes('advanced-report-panel--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(phone ? 0 : 1);
    expect(wrapper.findAll('.card-list').length).toBe(phone ? 1 : 0);

    if (phone) {
      expect(cardFields(wrapper.get('.report-templates-mobile'))).toEqual([
        { label: labels.report.colName, value: 'Daily sales' },
        { label: labels.report.colCode, value: 'T-1' },
        { label: labels.report.colCategory, value: 'sales' },
        { label: labels.report.colDesc, value: 'daily summary' },
        { label: labels.report.colCreatedAt, value: '2026-11-01T09:00:00Z' },
      ]);
      const actions = wrapper.get('.report-templates-mobile').findAll('.card-actions button');
      expect(actions.map(button => button.text().trim())).toEqual([
        labels.report.execute,
        labels.report.exportExcel,
        labels.report.exportWord,
      ]);
    } else {
      expect(wrapper.findAllComponents(ElTableColumn).map(col => col.props('prop'))).toEqual([
        'template_name',
        'template_code',
        'category',
        'description',
        'created_at',
        undefined,
      ]);
      const row = wrapper.get('.el-table__body .el-table__row');
      expect(row.findAll('button').map(button => button.text().trim())).toEqual([
        labels.report.execute,
        labels.report.exportExcel,
        labels.report.exportWord,
      ]);
    }

    const actions = phone
      ? wrapper.get('.report-templates-mobile').findAll('.card-actions button')
      : wrapper.get('.el-table__body .el-table__row').findAll('button');
    await actions[0].trigger('click');
    await actions[1].trigger('click');
    await actions[2].trigger('click');
    expect(props.executeReport).toHaveBeenCalledExactlyOnceWith(templates[0]);
    expect(props.exportReport).toHaveBeenCalledTimes(2);
    expect(props.exportReport).toHaveBeenNthCalledWith(1, templates[0], 'excel');
    expect(props.exportReport).toHaveBeenNthCalledWith(2, templates[0], 'docx');
  });

  it('keeps result rows and empty templates aligned across breakpoints', async () => {
    for (const width of [320, 1280]) {
      await resize(width);
      const wrapper = mountPanel(
        AdvancedReportPanel,
        reportProps({
          reportTemplates: [],
          reportResultVisible: true,
          reportData,
          reportColumns,
        })
      );
      await flushPromises();
      expect(wrapper.getComponent(ElDialog).props('width')).toBe(
        width < 768 ? 'calc(100vw - 24px)' : '80%'
      );
      if (width < 768) {
        expect(wrapper.find('.report-templates-mobile').exists()).toBe(true);
        expect(wrapper.findAll('.card-item')).toHaveLength(2);
        expect(cardFields(wrapper.get('.report-result-mobile'))).toEqual([
          { label: 'Name', value: 'alpha' },
          { label: 'Qty', value: '3' },
          { label: 'Name', value: 'beta' },
          { label: 'Qty', value: '' },
        ]);
        expect(wrapper.get('.report-templates-mobile').text()).toContain(labels.report.empty);
      } else {
        const tables = wrapper.findAllComponents(ElTable);
        expect(tables).toHaveLength(2);
        const resultTable = tables.find(table => (table.props('data') as unknown[]).length === 2);
        expect(resultTable).toBeDefined();
        const rows = resultTable!.findAll('.el-table__body .el-table__row');
        expect(rows[1].findAll('td .cell')[1].text()).toBe('');
        expect(wrapper.findAll('.card-list')).toHaveLength(0);
        expect(wrapper.get('.el-table__empty-text').text()).not.toBe('');
      }
    }
  });
});

describe('Subscription panel mobile cards', () => {
  it.each(widths)('renders subscription fields and status gated actions at %ipx', async width => {
    await resize(width);
    const wrapper = mountPanel(SubscriptionPanel, {});
    await flushPromises();
    const phone = width < 768;

    expect(wrapper.classes('subscription-panel--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(phone ? 0 : 1);
    expect(wrapper.findAll('.card-list').length).toBe(phone ? 1 : 0);
    expect(subscriptionApi.getSubscriptionList).toHaveBeenCalledExactlyOnceWith({
      page: 1,
      page_size: 50,
    });

    if (phone) {
      expect(cardFields(wrapper.get('.subscriptions-mobile'))).toEqual([
        { label: 'ID', value: '1' },
        { label: labels.subscription.name, value: 'subscription-1' },
        { label: labels.subscription.templateId, value: '9' },
        { label: labels.subscription.frequency, value: labels.subscription.daily },
        { label: '收件人', value: 'a@example.com；b@example.com' },
        { label: labels.subscription.exportFormat, value: 'xlsx' },
        { label: '状态', value: '启用' },
        { label: labels.subscription.lastRunAt, value: '2026-11-16T09:00:00Z' },
      ]);
      const buttons = wrapper.get('.subscriptions-mobile').findAll('.card-actions button');
      expect(buttons.map(button => button.text().trim())).toEqual([
        '编辑',
        labels.subscription.inactive,
        '立即发送',
        '删除',
      ]);
    } else {
      expect(wrapper.findAllComponents(ElTableColumn).map(col => col.props('label'))).toEqual([
        'ID',
        labels.subscription.name,
        labels.subscription.templateId,
        labels.subscription.frequency,
        '收件人',
        labels.subscription.exportFormat,
        '状态',
        labels.subscription.lastRunAt,
        '操作',
      ]);
      const row = wrapper.get('.el-table__body .el-table__row');
      expect(row.findAll('button').map(button => button.text().trim())).toEqual([
        '编辑',
        labels.subscription.inactive,
        '立即发送',
        '删除',
      ]);
    }
  });

  it.each([320, 1280])('wires all four row actions at %ipx', async width => {
    await resize(width);
    vi.mocked(subscriptionApi.getSubscriptionList).mockResolvedValue({
      code: 200,
      message: '',
      data: { items: [subscription(true)], total: 1, page: 1, page_size: 50 },
    });
    const wrapper = mountPanel(SubscriptionPanel, {});
    await flushPromises();
    const actions =
      width < 768
        ? wrapper.get('.subscriptions-mobile').findAll('.card-actions button')
        : wrapper.get('.el-table__body .el-table__row').findAll('button');

    await actions[0].trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(ElDialog).props('modelValue')).toBe(true);
    expect(wrapper.text()).toContain('编辑订阅');
    await buttonByText(wrapper, '取消').trigger('click');
    await flushPromises();

    await actions[1].trigger('click');
    await flushPromises();
    expect(subscriptionApi.toggleSubscription).toHaveBeenCalledExactlyOnceWith(1, false);

    await actions[2].trigger('click');
    await flushPromises();
    await confirmMessageBox();
    expect(subscriptionApi.sendSubscriptionNow).toHaveBeenCalledExactlyOnceWith(1);

    await actions[3].trigger('click');
    await flushPromises();
    await confirmMessageBox();
    expect(subscriptionApi.deleteSubscription).toHaveBeenCalledExactlyOnceWith(1);
    expect(subscriptionApi.getSubscriptionList).toHaveBeenCalledTimes(4);
  });

  it('keeps field/preview lists and empty states aligned across breakpoints', async () => {
    for (const width of [320, 1280]) {
      await resize(width);
      vi.mocked(subscriptionApi.previewReport).mockClear();
      const wrapper = mountPanel(SubscriptionPanel, {});
      await flushPromises();
      const tab = wrapper
        .findAll('.el-tabs__item')
        .find(item => item.text().trim() === '字段与预览');
      expect(tab).toBeDefined();
      await tab!.trigger('click');
      await flushPromises();

      await buttonByText(wrapper, '查询字段').trigger('click');
      await flushPromises();
      const idInput = wrapper.get('input[placeholder="模板 ID"]');
      await idInput.setValue('9');
      await buttonByText(wrapper, '预览').trigger('click');
      await flushPromises();
      expect(subscriptionApi.previewReport).toHaveBeenCalledExactlyOnceWith(9);

      if (width < 768) {
        expect(cardFields(wrapper.get('.fields-mobile'))).toEqual([
          { label: '字段键', value: 'f1' },
          { label: '名称', value: 'Field one' },
          { label: '类型', value: 'string' },
          { label: '可排序', value: '是' },
          { label: '字段键', value: 'f2' },
          { label: '名称', value: 'Field two' },
          { label: '类型', value: 'number' },
          { label: '可排序', value: '否' },
        ]);
        expect(cardFields(wrapper.get('.preview-mobile'))).toEqual([
          { label: 'Name', value: 'alpha' },
          { label: 'Qty', value: '3' },
        ]);
        expect(wrapper.text()).toContain('共 1 行');
      } else {
        expect(wrapper.findAllComponents(ElTable)).toHaveLength(3);
        expect(wrapper.findAll('.card-list')).toHaveLength(0);
      }
    }

    await resize(320);
    vi.mocked(subscriptionApi.getSubscriptionList).mockResolvedValue({
      code: 200,
      message: '',
      data: { items: [], total: 0, page: 1, page_size: 50 },
    });
    const empty = mountPanel(SubscriptionPanel, {});
    await flushPromises();
    expect(empty.findAll('.card-item')).toHaveLength(0);
    expect(empty.findAllComponents(ElTable)).toHaveLength(0);
    expect(empty.findAll('.el-empty__description').length).toBeGreaterThan(0);
  });
});
