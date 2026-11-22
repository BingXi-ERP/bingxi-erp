import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, {
  ElDialog,
  ElDescriptions,
  ElDrawer,
  ElForm,
  ElMessage,
  ElMessageBox,
  ElPagination,
  ElTable,
} from 'element-plus';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AiOverview from '@/views/ai-extend/index.vue';
import ProcessDetail from '@/views/ai-extend/process-detail.vue';
import ProcessOptimization from '@/views/ai-extend/process-optimization.vue';
import QualityPrediction from '@/views/ai-extend/quality-prediction.vue';
import { permission } from '@/directives/permission';
import { request } from '@/api/request';

vi.unmock('vue-router');
vi.unmock('pinia');
vi.unmock('element-plus');
vi.unmock('axios');
import zhCN from '@/locales/zh-CN';
import type {
  AiProcessOptimization,
  AiQualityPrediction,
  AiSummary,
  ProcessOptCandidate,
} from '@/api/ai-extend';

const routerState = vi.hoisted(() => ({
  params: { id: '7' } as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
}));

const userState = vi.hoisted(() => ({
  userInfo: { permissions: [] as string[] },
}));

const aiApi = vi.hoisted(() => ({
  getAiSummary: vi.fn(),
  getAiHealth: vi.fn(),
  getProcessOptimization: vi.fn(),
  deleteProcessOptimization: vi.fn(),
  applyProcessOptimization: vi.fn(),
  getProcessOptimizationListByColor: vi.fn(),
  createProcessOptimization: vi.fn(),
  batchCreateProcessOptimizations: vi.fn(),
  createQualityPrediction: vi.fn(),
  acknowledgeQualityPrediction: vi.fn(),
  deleteQualityPrediction: vi.fn(),
  getQualityPrediction: vi.fn(),
  getQualityPredictionListByProduct: vi.fn(),
  batchCreateQualityPredictions: vi.fn(),
}));

vi.mock('vue-router', () => {
  const instance = {
    push: routerState.push,
    replace: routerState.replace,
    back: routerState.back,
    go: vi.fn(),
    forward: vi.fn(),
    beforeEach: vi.fn(),
    afterEach: vi.fn(),
    beforeResolve: vi.fn(),
    currentRoute: { value: { path: '/', query: {}, params: {}, meta: {} } },
  };
  return {
    useRouter: () => instance,
    useRoute: () => ({
      path: '/ai-extend/process-detail/7',
      query: {},
      params: routerState.params,
      meta: {},
    }),
    createRouter: vi.fn().mockReturnValue(instance),
    createWebHistory: vi.fn(),
  };
});

vi.mock('@/store/user', () => ({ useUserStore: () => userState }));

vi.mock('@/api/ai-extend', async importOriginal => {
  const actual = await importOriginal<typeof import('@/api/ai-extend')>();
  return { ...actual, ...aiApi };
});

const labels = zhCN.aiExtend;
const widths = [320, 767, 768, 1280];
const initialWidth = window.innerWidth;
const phoneWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';
const grants = [
  'ai-process-opt:delete',
  'ai-quality-pred:approve',
  'ai-quality-pred:delete',
  '*:*',
];
const rawTime = '2026-11-16T02:00:00Z';
const wrappers: VueWrapper[] = [];
const hosts: HTMLElement[] = [];
let requestGet: ReturnType<typeof vi.spyOn> | undefined;

function localTime(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function processRow(id: number, over: Partial<AiProcessOptimization> = {}): AiProcessOptimization {
  return {
    id,
    request_id: `req-${id}`,
    color_no: `C-${id}`,
    color_name: id === 7 ? null : '深蓝',
    fabric_type: '棉',
    dye_type: id === 7 ? 'reactive' : null,
    recommended_temperature: '130.0',
    recommended_time_minutes: 45,
    recommended_ph_value: '4.50',
    recommended_liquor_ratio: '1.5',
    similar_cases: 12,
    confidence: id === 7 ? '0.8600' : '0.4200',
    source: id === 7 ? 'knn' : 'fallback',
    reason: null,
    candidates_json: [],
    is_applied: id === 7,
    applied_at: id === 7 ? rawTime : null,
    applied_by: id === 7 ? 1 : null,
    feedback_score: id === 7 ? null : 4,
    feedback_remark: null,
    created_by: 1,
    created_at: rawTime,
    updated_at: rawTime,
    ...over,
  };
}

const processRows = [processRow(7), processRow(8)];

function qualityRow(id: number, over: Partial<AiQualityPrediction> = {}): AiQualityPrediction {
  return {
    id,
    request_id: `qr-${id}`,
    product_id: id === 11 ? null : 23,
    inspection_type: id === 11 ? 'final' : 'incoming',
    window_days: 90,
    total_inspections: 120,
    avg_qualification_rate: id === 11 ? '92.34' : '88.00',
    trend: id === 11 ? 'up' : 'down',
    trend_rate: id === 11 ? '1.2' : '-0.5',
    risk_score: id === 11 ? 64 : 81,
    risk_level: id === 11 ? 'medium' : 'high',
    confidence: id === 11 ? '0.9100' : '0.7800',
    top_issues_json: [],
    recommendations_json: [],
    period_breakdown_json: [],
    source: id === 11 ? 'history' : 'degraded',
    is_acknowledged: id !== 11,
    acknowledged_at: id === 11 ? null : rawTime,
    acknowledged_by: id === 11 ? null : 1,
    created_by: 1,
    created_at: rawTime,
    updated_at: rawTime,
    ...over,
  };
}

const qualityRows = [qualityRow(11), qualityRow(12)];

const candidates: ProcessOptCandidate[] = [
  {
    case_id: 101,
    color_no: 'C-7',
    fabric_type: '棉',
    similarity: 0.88,
    temperature: 130,
    time_minutes: 45,
    ph_value: 4.5,
    liquor_ratio: 1.5,
  },
];

function summary(over: Partial<AiSummary> = {}): AiSummary {
  return {
    process_optimization: { total: 2, applied: 1, knn_recommended: 1, apply_rate: 0.5 },
    quality_prediction: { total: 2, high_risk: 1, unacknowledged: 1 },
    latest_process_optimizations: processRows,
    latest_quality_predictions: qualityRows,
    ...over,
  };
}

async function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  await nextTick();
}

function render(component: unknown, options: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(component as never, {
    ...options,
    attachTo: host,
    global: {
      plugins: [ElementPlus],
      directives: { permission },
      // Select/Option popup layout is outside these page contracts; actions, tables and dialogs stay real.
      stubs: { teleport: true, ElSelect: true, ElOption: true },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function isPhone() {
  return window.innerWidth < 768;
}

function buttonByText(container: Pick<VueWrapper, 'findAll'>, text: string) {
  const buttons = container
    .findAll('button')
    .filter(button => button.text().replace(/\s+/g, ' ').trim() === text);
  expect(buttons, `button ${text}`).toHaveLength(1);
  return buttons[0];
}

function activeDialog(wrapper: VueWrapper) {
  const dialogs = wrapper.findAllComponents(ElDialog).filter(dialog => dialog.props('modelValue'));
  expect(dialogs).toHaveLength(1);
  return dialogs[0];
}

function tableFields(row: Pick<VueWrapper, 'findAll'>, count: number) {
  const cells = row.findAll('td .cell');
  expect(cells).toHaveLength(count + 1);
  expect(cells[count].findAll('button').length).toBeGreaterThan(0);
  return cells.slice(0, count).map(cell => cell.text().replace(/\s+/g, ' ').trim());
}

function fields(container: Pick<VueWrapper, 'findAll'>) {
  return container.findAll('dl.card-fields > div').map(div => ({
    label: div.get('dt').text().replace(/\s+/g, ' ').trim(),
    value: div.get('dd').text().replace(/\s+/g, ' ').trim(),
  }));
}

async function surfaceRows(wrapper: VueWrapper, mobileSelector: string, desktopSelector: string) {
  const phone = isPhone();
  expect(wrapper.find(mobileSelector).exists(), `${mobileSelector} surface`).toBe(phone);
  expect(wrapper.find(desktopSelector).exists(), `desktop ${desktopSelector}`).toBe(!phone);
  return phone ? wrapper.findAll(`${mobileSelector} .card-item`) : wrapper.findAll(desktopSelector);
}

function lastMessageBox() {
  const boxes = document.querySelectorAll('.el-message-box');
  expect(boxes.length).toBeGreaterThan(0);
  return new DOMWrapper(boxes[boxes.length - 1]);
}

async function confirmMessageBox(value?: string) {
  const box = lastMessageBox();
  if (value !== undefined) {
    await box.get('.el-message-box__input input').setValue(value);
  }
  const buttons = box.findAll('.el-message-box__btns button');
  expect(buttons).toHaveLength(2);
  await buttons[1].trigger('click');
  await flushPromises();
}

function listPayload(items: unknown[], total = items.length) {
  return {
    code: 200,
    message: '',
    data: { items, total, page: 1, page_size: 20 },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'matchMedia').mockImplementation(query => {
    const target = new EventTarget();
    return {
      matches: false,
      media: query,
      onchange: null,
      addListener: listener => target.addEventListener('change', listener),
      removeListener: listener => target.removeEventListener('change', listener),
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    };
  });
  userState.userInfo.permissions = [...grants];
  routerState.params.id = '7';
  requestGet = vi.spyOn(request, 'get');
  requestGet.mockResolvedValue(listPayload(processRows) as never);
  aiApi.getAiSummary.mockResolvedValue(summary());
  aiApi.getAiHealth.mockResolvedValue({ status: 'ok', version: '1.0.0' });
  aiApi.getProcessOptimization.mockResolvedValue(processRow(7, { candidates_json: candidates }));
  aiApi.getProcessOptimizationListByColor.mockResolvedValue({ items: processRows });
  aiApi.applyProcessOptimization.mockResolvedValue(processRow(7));
  aiApi.deleteProcessOptimization.mockResolvedValue({ deleted: true, id: 7 });
  aiApi.createProcessOptimization.mockResolvedValue({ data: { id: 9, response: {} } });
  aiApi.batchCreateProcessOptimizations.mockResolvedValue({
    total: 1,
    succeeded: 1,
    failed: 0,
    results: [],
  });
  aiApi.acknowledgeQualityPrediction.mockResolvedValue(qualityRow(11));
  aiApi.deleteQualityPrediction.mockResolvedValue({ deleted: true, id: 11 });
  aiApi.getQualityPrediction.mockResolvedValue(qualityRow(11));
  aiApi.getQualityPredictionListByProduct.mockResolvedValue({ items: qualityRows });
  aiApi.batchCreateQualityPredictions.mockResolvedValue({
    total: 1,
    succeeded: 1,
    failed: 0,
    results: [],
  });
});

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  ElMessageBox.close();
  ElMessage.closeAll();
  requestGet?.mockRestore();
  vi.mocked(window.matchMedia).mockRestore();
  requestGet = undefined;
  await flushPromises();
  await resize(initialWidth);
});

describe('AI overview responsive presentation', () => {
  it.each(widths)('keeps both latest lists on one surface at %ipx', async width => {
    await resize(width);
    const wrapper = render(AiOverview);
    await flushPromises();
    const phone = isPhone();
    expect(wrapper.classes('ai-overview--phone')).toBe(phone);

    const process = await surfaceRows(
      wrapper,
      '.overview-process-mobile',
      '.overview-process-card .el-table__body-wrapper .el-table__row'
    );
    const quality = await surfaceRows(
      wrapper,
      '.overview-quality-mobile',
      '.overview-quality-card .el-table__body-wrapper .el-table__row'
    );
    expect(process).toHaveLength(2);
    expect(quality).toHaveLength(2);

    if (phone) {
      expect(fields(process[0])).toEqual([
        { label: labels.overview.colColorNo, value: 'C-7' },
        { label: labels.overview.colFabricType, value: '棉' },
        { label: labels.overview.colSource, value: 'k-NN 加权' },
        { label: labels.overview.colConfidence, value: '0.86' },
        { label: labels.overview.colApplied, value: labels.overview.applied },
        { label: labels.overview.colTime, value: rawTime },
      ]);
      expect(fields(quality[0])).toEqual([
        { label: labels.overview.colProductId, value: '' },
        { label: labels.overview.colRisk, value: '中风险' },
        { label: labels.overview.colRiskScore, value: '64' },
        { label: labels.overview.colTrend, value: '上升' },
        { label: labels.overview.colAck, value: labels.overview.unacknowledged },
        { label: labels.overview.colTime, value: rawTime },
      ]);
    } else {
      expect(process[0].findAll('td .cell').map(cell => cell.text().trim())).toEqual([
        'C-7',
        '棉',
        'k-NN 加权',
        '0.86',
        labels.overview.applied,
        rawTime,
      ]);
      expect(quality[0].findAll('td .cell').map(cell => cell.text().trim())).toEqual([
        '',
        '中风险',
        '64',
        '上升',
        labels.overview.unacknowledged,
        rawTime,
      ]);
    }
    expect(aiApi.getAiSummary).toHaveBeenCalledTimes(1);
    expect(aiApi.getAiHealth).toHaveBeenCalledTimes(1);
  });

  it.each([320, 1280])('reuses refresh and navigation actions at %ipx', async width => {
    await resize(width);
    const wrapper = render(AiOverview);
    await flushPromises();
    await buttonByText(wrapper, labels.overview.refresh).trigger('click');
    await flushPromises();
    expect(aiApi.getAiSummary).toHaveBeenCalledTimes(2);

    const cards = wrapper.findAll('.action-card');
    expect(cards).toHaveLength(3);
    for (const card of cards) await card.trigger('click');
    expect(routerState.push.mock.calls.map(call => call[0])).toEqual([
      '/ai-extend/process-optimization',
      '/ai-extend/quality-prediction',
      '/ai-extend/process-detail/1',
    ]);
  });
});

describe('AI process detail responsive presentation', () => {
  it.each(widths)('keeps recommendation fields and candidate percentage at %ipx', async width => {
    await resize(width);
    const wrapper = render(ProcessDetail);
    await flushPromises();
    const phone = isPhone();
    expect(wrapper.classes('proc-detail--phone')).toBe(phone);
    expect(aiApi.getProcessOptimization).toHaveBeenCalledWith(7);

    const detail = wrapper.get('.process-detail-card');
    if (phone) {
      expect(fields(detail).slice(0, 10)).toEqual([
        { label: labels.process.colColorNo, value: 'C-7' },
        { label: labels.process.colColorName, value: '—' },
        { label: labels.process.colFabricType, value: '棉' },
        { label: labels.process.colDyeType, value: 'reactive' },
        { label: labels.process.recTemperature, value: '130.0 °C' },
        { label: labels.process.recTime, value: `45 ${labels.process.unitMinutes}` },
        { label: labels.process.recPh, value: '4.50' },
        { label: labels.process.recLiquorRatio, value: '1 : 1.5' },
        { label: labels.process.recSource, value: 'k-NN 加权' },
        { label: labels.process.confidence, value: '86%' },
      ]);
      expect(fields(wrapper.get('.process-feedback-card')).map(item => item.value)).toEqual([
        labels.process.applied,
        localTime(rawTime),
        '—',
        '—',
        '12',
        'req-7',
        localTime(rawTime),
      ]);
    } else {
      expect(detail.getComponent(ElDescriptions).props('column')).toBe(2);
      expect(detail.text()).toContain('130.0 °C');
      expect(detail.text()).toContain('1 : 1.5');
      expect(detail.text()).toContain('k-NN 加权');
      expect(wrapper.get('.process-feedback-card').text()).toContain(labels.process.applied);
    }

    const candidates = await surfaceRows(
      wrapper,
      '.process-candidates-mobile',
      '.process-candidates-card .el-table__body-wrapper .el-table__row'
    );
    expect(candidates).toHaveLength(1);
    if (phone) {
      expect(fields(candidates[0])).toEqual([
        { label: labels.process.colCaseId, value: '101' },
        { label: labels.process.colColorNo, value: 'C-7' },
        { label: labels.process.colFabricType, value: '棉' },
        { label: labels.process.colSimilarity, value: '88%' },
        { label: labels.process.colTemperature, value: '130' },
        { label: labels.process.colTime, value: '45' },
        { label: labels.process.colPh, value: '4.5' },
        { label: labels.process.colLiquorRatio, value: '1.5' },
      ]);
    } else {
      expect(candidates[0].findAll('td .cell')[3].text().trim()).toBe('88%');
    }
    expect(wrapper.findAll('button').map(button => button.text().trim())).toEqual(
      expect.arrayContaining(['返回', '应用', '按色号查历史', labels.process.deleteRecord])
    );
  });

  it.each([320, 1280])(
    'applies feedback through the existing detail action at %ipx',
    async width => {
      await resize(width);
      render(ProcessDetail);
      await flushPromises();
      await buttonByText(wrappers[wrappers.length - 1], '应用').trigger('click');
      await flushPromises();
      await confirmMessageBox('88 | 已确认');
      expect(aiApi.applyProcessOptimization).toHaveBeenCalledWith(7, {
        feedback_score: 88,
        feedback_remark: '已确认',
      });
    }
  );

  it.each([320, 1280])('queries history from the current record at %ipx', async width => {
    await resize(width);
    const wrapper = render(ProcessDetail);
    await flushPromises();
    await buttonByText(wrapper, '按色号查历史').trigger('click');
    await flushPromises();
    await confirmMessageBox('棉');
    expect(aiApi.getProcessOptimizationListByColor).toHaveBeenCalledWith({
      color_no: 'C-7',
      fabric_type: '棉',
      limit: 20,
    });
    expect(activeDialog(wrapper).props('width')).toBe(isPhone() ? phoneWidth : '720px');
  });

  it('keeps the delete entry under the original permission gate', async () => {
    await resize(320);
    userState.userInfo.permissions = [];
    const denied = render(ProcessDetail);
    await flushPromises();
    expect(denied.findAll('button').some(button => button.text().trim() === '删除记录')).toBe(
      false
    );

    userState.userInfo.permissions = [...grants];
    const allowed = render(ProcessDetail);
    await flushPromises();
    expect(buttonByText(allowed, '删除记录').exists()).toBe(true);
  });
});

describe('AI process optimization list responsive presentation', () => {
  beforeEach(() => {
    requestGet?.mockResolvedValue(listPayload(processRows) as never);
  });

  it.each(widths)('keeps all columns and pagination on one surface at %ipx', async width => {
    await resize(width);
    const wrapper = render(ProcessOptimization);
    await flushPromises();
    const phone = isPhone();
    expect(wrapper.classes('proc-page--phone')).toBe(phone);
    expect(wrapper.getComponent(ElForm).props('inline')).toBe(!phone);
    expect(wrapper.getComponent(ElForm).props('labelPosition')).toBe(phone ? 'top' : 'right');

    const rows = await surfaceRows(
      wrapper,
      '.process-list-mobile',
      '.process-table-card .el-table__body-wrapper .el-table__row'
    );
    expect(rows).toHaveLength(2);
    if (phone) {
      expect(fields(rows[0])).toEqual([
        { label: 'ID', value: '7' },
        { label: labels.process.colColorNo, value: 'C-7' },
        { label: labels.process.colColorName, value: '' },
        { label: labels.process.colFabricType, value: '棉' },
        { label: labels.process.colDyeType, value: labels.process.dyeReactive },
        { label: labels.process.colSource, value: 'k-NN 加权' },
        { label: labels.process.colSimilar, value: '12' },
        { label: labels.process.colConfidence, value: '0.86' },
        {
          label: labels.process.colRecParams,
          value: '130.0°C · 45min · pH 4.50 · 1:1.5',
        },
        { label: labels.process.colApplied, value: labels.process.applied },
        { label: labels.process.colFeedback, value: '—' },
        { label: labels.process.colCreatedAt, value: localTime(rawTime) },
      ]);
      expect(rows[0].find('.card-actions')?.classes()).toContain('card-actions');
    } else {
      expect(tableFields(rows[0], 12)).toEqual([
        '7',
        'C-7',
        '',
        '棉',
        labels.process.dyeReactive,
        'k-NN 加权',
        '12',
        '0.86',
        '130.0°C · 45min · pH 4.50 · 1:1.5',
        labels.process.applied,
        '—',
        localTime(rawTime),
      ]);
    }
    expect(rows[0].findAll('button').map(button => button.text().trim())).toEqual([
      labels.process.detail,
      labels.process.delete,
    ]);

    const pagination = wrapper.getComponent(ElPagination);
    expect(pagination.props('currentPage')).toBe(1);
    expect(pagination.props('pageSize')).toBe(20);
    expect(pagination.props('total')).toBe(2);
    expect(pagination.props('layout')).toBe('total, sizes, prev, pager, next, jumper');
    expect(requestGet).toHaveBeenCalledTimes(1);
    expect(requestGet).toHaveBeenCalledWith(
      '/ai/process-optimizations',
      expect.objectContaining({ params: expect.objectContaining({ page: 1, page_size: 20 }) })
    );
  });

  it.each([320, 1280])('wires detail and delete actions on both surfaces at %ipx', async width => {
    await resize(width);
    const wrapper = render(ProcessOptimization);
    await flushPromises();
    const rows = await surfaceRows(
      wrapper,
      '.process-list-mobile',
      '.process-table-card .el-table__body-wrapper .el-table__row'
    );
    await buttonByText(rows[0], labels.process.detail).trigger('click');
    expect(routerState.push).toHaveBeenCalledWith('/ai-extend/process-detail/7');

    await buttonByText(rows[0], labels.process.delete).trigger('click');
    await flushPromises();
    await confirmMessageBox();
    expect(aiApi.deleteProcessOptimization).toHaveBeenCalledWith(7);
  });

  it('removes only the guarded delete action when grants are revoked', async () => {
    await resize(320);
    userState.userInfo.permissions = [];
    const wrapper = render(ProcessOptimization);
    await flushPromises();
    const rows = wrapper.findAll('.process-list-mobile .card-item');
    expect(rows[0].findAll('button').map(button => button.text().trim())).toEqual([
      labels.process.detail,
    ]);
  });

  it.each([320, 1280])(
    'keeps create and batch dialogs within the phone viewport at %ipx',
    async width => {
      await resize(width);
      const wrapper = render(ProcessOptimization);
      await flushPromises();
      await buttonByText(wrapper, labels.process.newRecommend).trigger('click');
      await flushPromises();
      const create = activeDialog(wrapper);
      expect(create.props('width')).toBe(isPhone() ? phoneWidth : '540px');
      expect(create.getComponent(ElForm).props('labelPosition')).toBe(isPhone() ? 'top' : 'right');
      await buttonByText(activeDialog(wrapper), labels.process.cancel).trigger('click');

      await buttonByText(wrapper, '批量创建').trigger('click');
      await flushPromises();
      expect(activeDialog(wrapper).props('width')).toBe(isPhone() ? phoneWidth : '560px');
    }
  );
});

describe('AI quality prediction list responsive presentation', () => {
  beforeEach(() => {
    requestGet?.mockResolvedValue(listPayload(qualityRows) as never);
  });

  it.each(widths)('keeps percentages, grades and actions on one surface at %ipx', async width => {
    await resize(width);
    const wrapper = render(QualityPrediction);
    await flushPromises();
    const phone = isPhone();
    expect(wrapper.classes('qual-page--phone')).toBe(phone);
    expect(wrapper.getComponent(ElForm).props('inline')).toBe(!phone);
    expect(wrapper.getComponent(ElForm).props('labelPosition')).toBe(phone ? 'top' : 'right');

    const rows = await surfaceRows(
      wrapper,
      '.quality-list-mobile',
      '.quality-table-card .el-table__body-wrapper .el-table__row'
    );
    expect(rows).toHaveLength(2);
    if (phone) {
      expect(fields(rows[0])).toEqual([
        { label: 'ID', value: '11' },
        { label: labels.qualityPrediction.colProductId, value: labels.qualityPrediction.global },
        { label: labels.qualityPrediction.colInspectionType, value: '成品' },
        { label: labels.qualityPrediction.colTotalInspections, value: '120' },
        { label: labels.qualityPrediction.colAvgRate, value: '92.3%' },
        { label: labels.qualityPrediction.colRiskLevel, value: '中风险 · 64' },
        { label: labels.qualityPrediction.colTrend, value: '上升 (1.2pp)' },
        { label: labels.qualityPrediction.colConfidence, value: '0.91' },
        { label: labels.qualityPrediction.colSource, value: '历史趋势' },
        { label: labels.qualityPrediction.colAck, value: labels.qualityPrediction.ackPending },
        { label: labels.qualityPrediction.colTime, value: localTime(rawTime) },
      ]);
      expect(rows[0].find('.card-actions')?.classes()).toContain('card-actions');
    } else {
      expect(tableFields(rows[0], 11)).toEqual([
        '11',
        labels.qualityPrediction.global,
        '成品',
        '120',
        '92.3%',
        '中风险 · 64',
        '上升 (1.2pp)',
        '0.91',
        '历史趋势',
        labels.qualityPrediction.ackPending,
        localTime(rawTime),
      ]);
    }
    expect(rows[0].findAll('button').map(button => button.text().trim())).toEqual([
      labels.qualityPrediction.detail,
      labels.qualityPrediction.ack,
      labels.qualityPrediction.delete,
    ]);
    expect(rows[1].findAll('button').map(button => button.text().trim())).toEqual([
      labels.qualityPrediction.detail,
      labels.qualityPrediction.delete,
    ]);

    const pagination = wrapper.getComponent(ElPagination);
    expect(pagination.props('currentPage')).toBe(1);
    expect(pagination.props('pageSize')).toBe(20);
    expect(pagination.props('total')).toBe(2);
    expect(requestGet).toHaveBeenCalledWith(
      '/ai/quality-predictions',
      expect.objectContaining({ params: expect.objectContaining({ page: 1, page_size: 20 }) })
    );
  });

  it.each([320, 1280])(
    'wires detail, acknowledge and delete on both surfaces at %ipx',
    async width => {
      await resize(width);
      const wrapper = render(QualityPrediction);
      await flushPromises();
      const rows = await surfaceRows(
        wrapper,
        '.quality-list-mobile',
        '.quality-table-card .el-table__body-wrapper .el-table__row'
      );
      await buttonByText(rows[0], labels.qualityPrediction.ack).trigger('click');
      await flushPromises();
      expect(aiApi.acknowledgeQualityPrediction).toHaveBeenCalledWith(11);

      await buttonByText(rows[0], labels.qualityPrediction.detail).trigger('click');
      await flushPromises();
      expect(aiApi.getQualityPrediction).toHaveBeenCalledWith(11);
      const drawer = wrapper.getComponent(ElDrawer);
      expect(drawer.props('size')).toBe(isPhone() ? phoneWidth : '60%');
      expect(drawer.findComponent(ElDescriptions).exists()).toBe(!isPhone());
      if (isPhone()) {
        expect(fields(wrapper.get('.quality-detail-fields')).map(item => item.value)).toEqual([
          labels.qualityPrediction.global,
          '成品',
          `90 ${labels.qualityPrediction.detailUnitDays}`,
          '120',
          '92.3%',
          '91%',
          '中风险 · 64',
          '上升 (1.2pp)',
        ]);
      }

      await buttonByText(rows[1], labels.qualityPrediction.delete).trigger('click');
      await flushPromises();
      await confirmMessageBox();
      expect(aiApi.deleteQualityPrediction).toHaveBeenCalledWith(12);
    }
  );

  it('removes only guarded actions when grants are revoked', async () => {
    await resize(320);
    userState.userInfo.permissions = [];
    const wrapper = render(QualityPrediction);
    await flushPromises();
    const rows = wrapper.findAll('.quality-list-mobile .card-item');
    expect(rows[0].findAll('button').map(button => button.text().trim())).toEqual([
      labels.qualityPrediction.detail,
    ]);
  });

  it.each([320, 1280])('keeps create, batch and product dialogs usable at %ipx', async width => {
    await resize(width);
    const wrapper = render(QualityPrediction);
    await flushPromises();
    await buttonByText(wrapper, labels.qualityPrediction.newPredict).trigger('click');
    await flushPromises();
    const create = activeDialog(wrapper);
    expect(create.props('width')).toBe(isPhone() ? phoneWidth : '540px');
    expect(create.getComponent(ElForm).props('labelPosition')).toBe(isPhone() ? 'top' : 'right');
    await buttonByText(activeDialog(wrapper), labels.qualityPrediction.cancel).trigger('click');

    await buttonByText(wrapper, '批量预测').trigger('click');
    await flushPromises();
    expect(activeDialog(wrapper).props('width')).toBe(isPhone() ? phoneWidth : '560px');
    await buttonByText(activeDialog(wrapper), '取消').trigger('click');

    await buttonByText(wrapper, '按产品查询').trigger('click');
    await flushPromises();
    expect(activeDialog(wrapper).props('width')).toBe(isPhone() ? phoneWidth : '680px');
  });
});

describe('AI extend empty states', () => {
  it('shows one empty surface per list at 320 and 768', async () => {
    for (const width of [320, 768]) {
      await resize(width);
      const phone = isPhone();
      aiApi.getAiSummary.mockResolvedValue(
        summary({
          latest_process_optimizations: [],
          latest_quality_predictions: [],
        })
      );
      const overview = render(AiOverview);
      await flushPromises();
      expect(overview.find('.overview-process-mobile').exists()).toBe(phone);
      expect(overview.find('.overview-quality-mobile').exists()).toBe(phone);
      if (phone) {
        expect(overview.findAll('.overview-process-mobile .card-item')).toHaveLength(0);
        expect(overview.findAll('.overview-quality-mobile .card-item')).toHaveLength(0);
        expect(overview.findAll('.overview-process-mobile .el-empty')).toHaveLength(1);
        expect(overview.findAll('.overview-quality-mobile .el-empty')).toHaveLength(1);
      } else {
        expect(overview.findAll('.overview-process-card .el-table__empty-text')).toHaveLength(1);
        expect(overview.findAll('.overview-quality-card .el-table__empty-text')).toHaveLength(1);
      }

      routerState.params.id = '0';
      const detail = render(ProcessDetail);
      await flushPromises();
      expect(detail.get('.el-empty').text()).toContain(labels.process.recordNotFound);
      expect(aiApi.getProcessOptimization).not.toHaveBeenCalledWith(0);

      requestGet?.mockResolvedValue(listPayload([]) as never);
      const process = render(ProcessOptimization);
      await flushPromises();
      expect(process.find('.process-list-mobile').exists()).toBe(phone);
      expect(
        phone
          ? process.findAll('.process-list-mobile .card-item')
          : process.findAll('.process-table-card .el-table__row')
      ).toHaveLength(0);
      expect(
        phone
          ? process.findAll('.process-list-mobile .el-empty')
          : process.findAll('.process-table-card .el-table__empty-text')
      ).toHaveLength(1);

      const quality = render(QualityPrediction);
      await flushPromises();
      expect(quality.find('.quality-list-mobile').exists()).toBe(phone);
      expect(
        phone
          ? quality.findAll('.quality-list-mobile .card-item')
          : quality.findAll('.quality-table-card .el-table__row')
      ).toHaveLength(0);
      expect(
        phone
          ? quality.findAll('.quality-list-mobile .el-empty')
          : quality.findAll('.quality-table-card .el-table__empty-text')
      ).toHaveLength(1);
    }
  });
});

describe('AI extend responsive layout contracts', () => {
  const files = [
    'src/views/ai-extend/index.vue',
    'src/views/ai-extend/process-detail.vue',
    'src/views/ai-extend/process-optimization.vue',
    'src/views/ai-extend/quality-prediction.vue',
  ];

  function source(file: string) {
    return readFileSync(resolve(process.cwd(), file), 'utf8');
  }

  it('uses phone cards, 768 boundary and touch-sized two-column actions', () => {
    for (const file of files) {
      const text = source(file);
      expect(text, `${file} breakpoint`).toContain('width.value < 768');
      expect(text, `${file} description cards`).toContain('<dl class="card-fields"');
      expect(text, `${file} wrapping`).toContain('overflow-wrap: anywhere');
    }
    for (const file of files.slice(1)) {
      const text = source(file);
      expect(text, `${file} actions`).toContain('card-actions');
      expect(text, `${file} two columns`).toContain('repeat(2, minmax(0, 1fr))');
      expect(text, `${file} touch target`).toContain('min-height: 44px');
      expect(text, `${file} touch target`).toContain('min-width: 44px');
    }
  });

  it('keeps complex dialogs and drawers within the viewport', () => {
    for (const file of files.slice(1)) {
      const text = source(file);
      expect(text, `${file} height`).toContain('100dvh');
      expect(text, `${file} safe area`).toContain('env(safe-area-inset');
      expect(text, `${file} scrolling`).toContain('overflow-y: auto');
    }
    for (const file of files.slice(2)) {
      expect(source(file)).toContain(":label-position=\"isPhone ? 'top' : 'right'\"");
    }
  });
});
