import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, {
  ElDescriptions,
  ElDialog,
  ElForm,
  ElMessage,
  ElPagination,
} from 'element-plus';
import ArReconciliationTable from '@/views/ar-reconciliation/components/ArReconciliationTable.vue';
import ArReconciliationConfirm from '@/views/ar-reconciliation/components/ArReconciliationConfirm.vue';
import ArReconciliationDetail from '@/views/ar-reconciliation/components/ArReconciliationDetail.vue';
import ArReconciliationDispute from '@/views/ar-reconciliation/components/ArReconciliationDispute.vue';
import BudgetPlanTab from '@/views/budget/tabs/BudgetPlanTab.vue';
import BudgetItemTab from '@/views/budget/tabs/BudgetItemTab.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { permission } from '@/directives/permission';
import { PERMISSIONS } from '@/constants/permissions';
import { request } from '@/api/request';
import type { BudgetItem, BudgetPlan } from '@/api/budget';
import type {
  AutoReconciliationResult,
  CustomerConfirmation,
  DisputeRecord,
  ReconciliationDetailItem,
} from '@/api/ar-reconciliation-enhanced';
import zhCN from '@/locales/zh-CN';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/composables/useBreakpoint', async () => {
  const { ref } = await import('vue');
  const width = ref(320);
  return { useBreakpoint: () => ({ width }) };
});

const budget = vi.hoisted(() => ({
  getBudgetPlanList: vi.fn(),
  createBudgetPlan: vi.fn(),
  approveBudgetPlan: vi.fn(),
  rejectBudgetPlan: vi.fn(),
  getBudgetDetail: vi.fn(),
  createBudgetItem: vi.fn(),
  updateBudgetItem: vi.fn(),
  adjustBudget: vi.fn(),
  deleteBudget: vi.fn(),
}));
vi.mock('@/api/budget', () => budget);

const user = vi.hoisted(() => ({ userInfo: { permissions: [] as string[] } }));
vi.mock('@/store/user', () => ({ useUserStore: () => user }));

const widths = [320, 767, 768, 1280] as const;
const phoneWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';
const common = zhCN.common;
const ar = zhCN.arReconciliationModule;
const budgetLabels = zhCN.budget;
const grants = [
  PERMISSIONS.BUDGET_CREATE,
  PERMISSIONS.BUDGET_READ,
  PERMISSIONS.BUDGET_APPROVE,
  PERMISSIONS.BUDGET_UPDATE,
  PERMISSIONS.BUDGET_DELETE,
];

const results: AutoReconciliationResult[] = [
  {
    id: 1,
    reconciliation_no: 'AR-1',
    customer_id: 7,
    customer_name: 'Customer A',
    period_start: '2026-11-01',
    period_end: '2026-11-15',
    opening_balance: '0.00',
    total_invoices: '1000.00',
    total_collections: '1000.00',
    closing_balance: '0.00',
    reconciliation_status: 'draft',
    created_at: '2026-11-16T10:00:00Z',
  },
  {
    id: 2,
    reconciliation_no: 'AR-2',
    customer_id: 8,
    customer_name: null,
    period_start: '2026-11-02',
    period_end: '2026-11-16',
    opening_balance: '0.00',
    total_invoices: '900.00',
    total_collections: '887.50',
    closing_balance: '-12.50',
    reconciliation_status: 'confirmed',
    created_at: '',
  },
];

const confirmations: CustomerConfirmation[] = [
  {
    id: 1,
    reconciliation_id: 1,
    customer_id: 7,
    customer_name: 'Customer A',
    confirm_status: 'pending',
    confirm_amount: 1000,
    disputed_amount: 0,
  },
  {
    id: 2,
    reconciliation_id: 2,
    customer_id: 8,
    customer_name: 'Customer B',
    confirm_status: 'confirmed',
    confirm_amount: 900,
    disputed_amount: 12.5,
    confirmed_at: '2026-11-17T09:00:00Z',
  },
];

const detailItems: ReconciliationDetailItem[] = [
  {
    id: 1,
    reconciliation_id: 1,
    item_type: 'invoice',
    document_type: 'invoice',
    document_id: 11,
    document_no: 'INV-1',
    document_date: '2026-11-02',
    amount: '1000.00',
    matched_amount: '900.00',
    match_status: 'partial',
    matched_item_id: null,
    remarks: null,
  },
  {
    id: 2,
    reconciliation_id: 1,
    item_type: 'receipt',
    document_type: 'payment',
    document_id: 12,
    document_no: null,
    document_date: '2026-11-03',
    amount: '100.00',
    matched_amount: '100.00',
    match_status: 'matched',
    matched_item_id: 13,
    remarks: 'settled',
  },
];

function dispute(id: number, status: string): DisputeRecord {
  return {
    id,
    reconciliation_no: `AR-${id}`,
    reconciliation_date: '2026-11-01',
    period_start: '2026-11-01',
    period_end: '2026-11-15',
    customer_id: 7,
    customer_name: 'Customer A',
    opening_balance: '0.00',
    total_invoices: '1000.00',
    total_collections: '900.00',
    closing_balance: '100.00',
    reconciliation_status: status,
    confirmed_by_customer: false,
    dispute_reason: id === 1 ? 'Amount mismatch' : null,
    confirmed_by: null,
    confirmed_at: null,
    created_by: null,
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
    notes: null,
  };
}

const disputes = [dispute(1, 'disputed'), dispute(2, 'resolved')];

const plans: BudgetPlan[] = [
  {
    id: 11,
    plan_no: 'PLAN-1',
    plan_name: 'Annual budget',
    budget_year: 2026,
    budget_type: 'annual',
    department_id: 3,
    total_amount: '1000.50',
    status: 'draft',
    prepared_by: null,
    approved_by: null,
    approved_at: null,
    remark: null,
    created_at: null,
    updated_at: null,
  },
  {
    id: 12,
    plan_no: 'PLAN-2',
    plan_name: 'Approved budget',
    budget_year: 2026,
    budget_type: 'annual',
    department_id: null,
    total_amount: '2000.00',
    status: 'approved',
    prepared_by: null,
    approved_by: null,
    approved_at: null,
    remark: null,
    created_at: null,
    updated_at: null,
  },
];

const items: BudgetItem[] = [
  {
    id: 21,
    item_code: '',
    item_name: 'Fabric',
    parent_id: null,
    item_type: '',
    level: 1,
    status: 'draft',
    plan_id: 11,
    budget_year: 2026,
    planned_amount: '1000.50',
    remark: null,
    account_subject_id: null,
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
  },
  {
    id: 22,
    item_code: 'ITEM-2',
    item_name: 'Dyeing',
    parent_id: null,
    item_type: 'expense',
    level: 1,
    status: 'active',
    plan_id: 11,
    budget_year: 2026,
    planned_amount: '2000.00',
    remark: 'ready',
    account_subject_id: null,
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T10:00:00Z',
  },
];

const plan: BudgetPlan = plans[0];
const wrappers: VueWrapper[] = [];
const hosts: HTMLElement[] = [];
let requestGet: ReturnType<typeof vi.spyOn>;

function setWidth(value: number) {
  useBreakpoint().width.value = value;
}

function isPhone() {
  return useBreakpoint().width.value < 768;
}

function render(
  component: typeof ArReconciliationTable,
  options?: Record<string, unknown>
): VueWrapper;
function render(
  component: typeof ArReconciliationConfirm,
  options?: Record<string, unknown>
): VueWrapper;
function render(
  component: typeof ArReconciliationDetail,
  options?: Record<string, unknown>
): VueWrapper;
function render(
  component: typeof ArReconciliationDispute,
  options?: Record<string, unknown>
): VueWrapper;
function render(component: typeof BudgetPlanTab, options?: Record<string, unknown>): VueWrapper;
function render(component: typeof BudgetItemTab, options?: Record<string, unknown>): VueWrapper;
function render(component: unknown, options: Record<string, unknown> = {}): VueWrapper {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(component as never, {
    ...options,
    attachTo: host,
    global: {
      plugins: [ElementPlus],
      directives: { permission },
      stubs: { teleport: true, ElSelect: true },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function tableProps(data: AutoReconciliationResult[] = results) {
  return {
    props: { data, loading: false, total: data.length, pagination: { page: 1, pageSize: 10 } },
  };
}

function confirmProps(data: CustomerConfirmation[] = confirmations) {
  return { props: { visible: true, data } };
}

function detailProps(data: ReconciliationDetailItem[] = detailItems) {
  return {
    props: {
      visible: true,
      currentReconciliation: results[0],
      detailData: data,
    },
  };
}

function disputeProps(data: DisputeRecord[] = disputes) {
  return {
    props: {
      visible: true,
      form: { reconciliation_id: 1, description: '' },
      disputes: data,
    },
  };
}

function setItemResponse(data: BudgetItem[] = items) {
  requestGet.mockImplementation(async () => ({
    data: { list: data, total: data.length, page: 1, page_size: 20 },
  }));
}

async function loadedPlan(data: BudgetPlan[] = plans) {
  budget.getBudgetPlanList.mockResolvedValue({ code: 200, data });
  const wrapper = render(BudgetPlanTab);
  await flushPromises();
  return wrapper;
}

async function loadedItems(data: BudgetItem[] = items) {
  setItemResponse(data);
  const wrapper = render(BudgetItemTab, { props: { plan } });
  await flushPromises();
  return wrapper;
}

function surface(wrapper: VueWrapper, mobileClass: string) {
  const phone = isPhone();
  expect(wrapper.find(`.${mobileClass}`).exists(), `${mobileClass} surface`).toBe(phone);
  expect(wrapper.find('.el-table').exists(), 'desktop table surface').toBe(!phone);
  return phone
    ? wrapper.findAll(`.${mobileClass} .card-item`)
    : wrapper.findAll('.el-table__body-wrapper .el-table__row');
}

function cardField(row: DOMWrapper<Element>, label: string) {
  const group = row.findAll('.card-fields > div').find(item => item.get('dt').text() === label);
  expect(group, `field ${label}`).toBeDefined();
  return group!.get('dd');
}

function fieldText(row: DOMWrapper<Element>, label: string, desktopIndex: number) {
  return isPhone() ? cardField(row, label).text() : row.findAll('td .cell')[desktopIndex].text();
}

function buttonsIn(container: DOMWrapper<Element> | VueWrapper, label: string) {
  return container.findAll('button').filter(button => button.text() === label);
}

function buttonIn(container: DOMWrapper<Element> | VueWrapper, label: string) {
  const buttons = buttonsIn(container, label);
  expect(buttons.length, `button ${label}`).toBe(1);
  return buttons[0];
}

function actionLabels(container: DOMWrapper<Element> | VueWrapper) {
  return container.findAll('button').map(button => button.text());
}

function dialogElementByClass(wrapper: VueWrapper, className: string) {
  const element = wrapper.findAll('.el-dialog').find(item => item.classes().includes(className));
  expect(element, `dialog ${className}`).toBeDefined();
  return element!;
}

function latest(wrapper: VueWrapper, event: string) {
  return wrapper.emitted(event)?.at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  user.userInfo.permissions = [...grants];
  requestGet = vi.spyOn(request, 'get');
  setItemResponse();
  budget.getBudgetPlanList.mockResolvedValue({ code: 200, data: plans });
  budget.getBudgetDetail.mockImplementation(async (id: number) => ({
    code: 200,
    data: { ...items.find(item => item.id === id)!, periods: [] },
  }));
  for (const write of [
    budget.createBudgetPlan,
    budget.approveBudgetPlan,
    budget.rejectBudgetPlan,
    budget.createBudgetItem,
    budget.updateBudgetItem,
    budget.adjustBudget,
    budget.deleteBudget,
  ]) {
    write.mockResolvedValue({ code: 200, data: null });
  }
});

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  ElMessage.closeAll();
  vi.restoreAllMocks();
  await nextTick();
});

for (const width of widths) {
  describe(`AR reconciliation and budget at ${width}px`, () => {
    beforeEach(() => setWidth(width));

    it('result table keeps every field, amount format and row emit', async () => {
      const wrapper = render(ArReconciliationTable, tableProps());
      await nextTick();
      await flushPromises();
      const rows = surface(wrapper, 'ar-recon-result-mobile');
      expect(rows).toHaveLength(2);
      const labels = [
        ar.index.reconciliationNo,
        ar.index.customerName,
        ar.index.reconciliationStart,
        ar.index.reconciliationEnd,
        ar.index.invoiceAmount,
        ar.index.paymentAmount,
        ar.index.balance,
        common.status,
        common.createTime,
      ];
      const expected = [
        [
          'AR-1',
          'Customer A',
          '2026-11-01',
          '2026-11-15',
          '1000.00',
          '1000.00',
          '0.00',
          ar.index.statusDraft,
          '2026-11-16T10:00:00Z',
        ],
        [
          'AR-2',
          '-',
          '2026-11-02',
          '2026-11-16',
          '900.00',
          '887.50',
          '-12.50',
          ar.index.statusConfirmed,
          '',
        ],
      ];
      for (const [rowIndex, row] of rows.entries()) {
        for (const [index, label] of labels.entries()) {
          expect(fieldText(row, label, index)).toBe(expected[rowIndex][index]);
        }
        expect(actionLabels(row)).toEqual([common.detail, common.confirm, ar.dispute]);
      }
      const balance = isPhone()
        ? cardField(rows[1], ar.index.balance)
        : rows[1].findAll('td .cell')[6].get('span');
      expect(balance.attributes('style')).toMatch(/#f56c6c|245, 108, 108/);
      await buttonIn(rows[0], common.detail).trigger('click');
      expect(latest(wrapper, 'view-detail')).toEqual([results[0]]);
      await buttonIn(rows[0], common.confirm).trigger('click');
      expect(latest(wrapper, 'send-confirmation')).toEqual([results[0]]);
      await buttonIn(rows[0], ar.dispute).trigger('click');
      expect(latest(wrapper, 'open-dispute')).toEqual([results[0]]);
      const pagination = wrapper.getComponent(ElPagination);
      pagination.vm.$emit('current-change', 2);
      pagination.vm.$emit('size-change', 20);
      await nextTick();
      expect(wrapper.emitted('page-change')).toEqual([[2]]);
      expect(wrapper.emitted('page-size-change')).toEqual([[20]]);
    });

    it('confirmation dialog keeps status labels and pending-only actions', async () => {
      const wrapper = render(ArReconciliationConfirm, confirmProps());
      await nextTick();
      await flushPromises();
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('width')).toBe(isPhone() ? phoneWidth : '900px');
      expect(
        wrapper
          .find('.ar-reconciliation-confirm-dialog')
          .classes('ar-reconciliation-confirm-dialog--phone')
      ).toBe(isPhone());
      const rows = surface(wrapper, 'ar-confirm-mobile');
      expect(rows).toHaveLength(2);
      expect(fieldText(rows[0], ar.customerName, 0)).toBe('Customer A');
      expect(fieldText(rows[0], ar.confirmStatus, 1)).toBe(ar.confirmStatusPending);
      expect(fieldText(rows[0], ar.confirmAmount, 2)).toBe('1000.00');
      expect(fieldText(rows[0], ar.disputeAmount, 3)).toBe('0.00');
      expect(fieldText(rows[0], ar.confirmTime, 4)).toBe('');
      expect(fieldText(rows[0], ar.remark, 5)).toBe('');
      expect(fieldText(rows[1], ar.disputeAmount, 3)).toBe('12.50');
      expect(fieldText(rows[1], ar.confirmStatus, 1)).toBe(ar.confirmStatusConfirmed);
      expect(actionLabels(rows[0])).toEqual([common.confirm, ar.dispute]);
      expect(actionLabels(rows[1])).toEqual([]);
      await buttonIn(rows[0], common.confirm).trigger('click');
      expect(latest(wrapper, 'confirm-status')).toEqual([confirmations[0], 'confirmed']);
      await buttonIn(rows[0], ar.dispute).trigger('click');
      expect(latest(wrapper, 'confirm-status')).toEqual([confirmations[0], 'disputed']);
    });

    it('detail dialog keeps summary and detail fields and the close emit', async () => {
      const wrapper = render(ArReconciliationDetail, detailProps());
      await nextTick();
      await flushPromises();
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('width')).toBe(isPhone() ? phoneWidth : '900px');
      expect(
        wrapper
          .find('.ar-reconciliation-detail-dialog')
          .classes('ar-reconciliation-detail-dialog--phone')
      ).toBe(isPhone());
      expect(wrapper.findComponent(ElDescriptions).exists()).toBe(!isPhone());
      const rows = surface(wrapper, 'ar-detail-mobile');
      expect(rows).toHaveLength(2);
      expect(fieldText(rows[0], ar.type, 0)).toBe('invoice');
      expect(fieldText(rows[0], ar.sourceNo, 1)).toBe('INV-1');
      expect(fieldText(rows[0], ar.date, 2)).toBe('2026-11-02');
      expect(fieldText(rows[0], ar.amount, 3)).toBe('1000.00');
      expect(fieldText(rows[0], ar.matchedAmount, 4)).toBe('900.00');
      expect(fieldText(rows[0], common.status, 5)).toBe(ar.matchStatusPartial);
      expect(fieldText(rows[0], ar.remark, 6)).toBe('');
      expect(fieldText(rows[1], ar.sourceNo, 1)).toBe('');
      expect(fieldText(rows[1], common.status, 5)).toBe(ar.matchStatusMatched);
      expect(rows[0].findAll('button')).toHaveLength(0);
      dialog.vm.$emit('update:modelValue', false);
      await nextTick();
      expect(wrapper.emitted('update:visible')).toEqual([[false]]);
    });

    it('dispute dialog keeps form wiring and status-gated resolve action', async () => {
      const wrapper = render(ArReconciliationDispute, disputeProps());
      await nextTick();
      await flushPromises();
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('width')).toBe(isPhone() ? phoneWidth : '900px');
      expect(
        wrapper
          .find('.ar-reconciliation-dispute-dialog')
          .classes('ar-reconciliation-dispute-dialog--phone')
      ).toBe(isPhone());
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(isPhone() ? 'top' : 'right');
      const rows = surface(wrapper, 'ar-dispute-mobile');
      expect(rows).toHaveLength(2);
      expect(fieldText(rows[0], ar.sourceNo, 0)).toBe('AR-1');
      expect(fieldText(rows[0], ar.reconciliationPeriod, 1)).toBe('2026-11-01 ~ 2026-11-15');
      expect(fieldText(rows[0], ar.disputeDescription, 2)).toBe('Amount mismatch');
      expect(fieldText(rows[0], common.createTime, 3)).toBe('2026-11-16T10:00:00Z');
      expect(fieldText(rows[1], ar.disputeDescription, 2)).toBe('');
      expect(actionLabels(rows[0])).toEqual([ar.resolve]);
      expect(actionLabels(rows[1])).toEqual([]);
      await wrapper.get('textarea').setValue('corrected');
      expect(latest(wrapper, 'update:form')).toEqual([
        { reconciliation_id: 1, description: 'corrected' },
      ]);
      await buttonIn(wrapper, ar.submitDispute).trigger('click');
      expect(wrapper.emitted('submit')).toHaveLength(1);
      await buttonIn(rows[0], ar.resolve).trigger('click');
      expect(latest(wrapper, 'resolve')).toEqual([disputes[0]]);
    });

    it('budget plan keeps fields, permission gates and select emit', async () => {
      const wrapper = await loadedPlan();
      const rows = surface(wrapper, 'budget-plan-mobile');
      expect(rows).toHaveLength(2);
      const labels = [
        budgetLabels.plan.table.planNo,
        budgetLabels.plan.table.planName,
        budgetLabels.plan.table.budgetYear,
        budgetLabels.plan.table.budgetType,
        budgetLabels.plan.table.departmentId,
        budgetLabels.plan.table.totalAmount,
        budgetLabels.plan.table.status,
      ];
      const expected = [
        [
          'PLAN-1',
          'Annual budget',
          '2026',
          'annual',
          '3',
          '¥1000.50',
          budgetLabels.plan.status.draft,
        ],
        [
          'PLAN-2',
          'Approved budget',
          '2026',
          'annual',
          '-',
          '¥2000.00',
          budgetLabels.plan.status.approved,
        ],
      ];
      for (const [rowIndex, row] of rows.entries()) {
        for (const [index, label] of labels.entries()) {
          expect(fieldText(row, label, index)).toBe(expected[rowIndex][index]);
        }
      }
      expect(actionLabels(rows[0])).toEqual([
        budgetLabels.plan.viewItems,
        budgetLabels.plan.table.approve,
        budgetLabels.plan.table.reject,
      ]);
      expect(actionLabels(rows[1])).toEqual([budgetLabels.plan.viewItems]);
      await buttonIn(rows[0], budgetLabels.plan.viewItems).trigger('click');
      expect(wrapper.emitted('select')).toEqual([[plans[0]]]);
      await buttonIn(wrapper, budgetLabels.plan.create).trigger('click');
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('width')).toBe(isPhone() ? phoneWidth : '520px');
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(isPhone() ? 'top' : 'right');
      await buttonIn(dialog, budgetLabels.plan.dialog.cancel).trigger('click');
    });

    it('budget item keeps fields, permission gates and the original edit entry', async () => {
      const wrapper = await loadedItems();
      expect(wrapper.getComponent(ElForm).props('inline')).toBe(!isPhone());
      expect(wrapper.getComponent(ElForm).props('labelPosition')).toBe(isPhone() ? 'top' : 'right');
      const rows = surface(wrapper, 'budget-item-mobile');
      expect(rows).toHaveLength(2);
      const labels = [
        budgetLabels.item.table.itemCode,
        budgetLabels.item.table.itemName,
        budgetLabels.item.table.itemType,
        budgetLabels.item.table.plannedAmount,
        budgetLabels.item.table.status,
        budgetLabels.item.table.remark,
      ];
      const expected = [
        ['-', 'Fabric', '-', '¥1000.50', budgetLabels.item.status.draft, ''],
        ['ITEM-2', 'Dyeing', 'expense', '¥2000.00', budgetLabels.item.status.active, 'ready'],
      ];
      for (const [rowIndex, row] of rows.entries()) {
        for (const [index, label] of labels.entries()) {
          expect(fieldText(row, label, index)).toBe(expected[rowIndex][index]);
        }
        expect(actionLabels(row)).toEqual([
          budgetLabels.item.table.edit,
          budgetLabels.item.table.adjust,
          budgetLabels.item.table.delete,
        ]);
      }
      await buttonIn(rows[0], budgetLabels.item.table.edit).trigger('click');
      await flushPromises();
      const editDialogElement = dialogElementByClass(wrapper, 'budget-item-dialog');
      const editDialog = wrapper.findAllComponents(ElDialog)[0];
      expect(editDialog.props('modelValue')).toBe(true);
      expect(editDialog.props('width')).toBe(isPhone() ? phoneWidth : '720px');
      expect(editDialog.getComponent(ElForm).props('labelPosition')).toBe(
        isPhone() ? 'top' : 'right'
      );
      await buttonIn(editDialogElement, budgetLabels.item.dialog.cancel).trigger('click');
      await nextTick();
      await buttonIn(rows[0], budgetLabels.item.table.adjust).trigger('click');
      await nextTick();
      dialogElementByClass(wrapper, 'budget-adjust-dialog');
      const adjustDialog = wrapper.findAllComponents(ElDialog)[1];
      expect(adjustDialog.props('modelValue')).toBe(true);
      expect(adjustDialog.props('width')).toBe(isPhone() ? phoneWidth : '460px');
    });
  });
}

describe('AR reconciliation and budget responsive invariants', () => {
  it('shows empty state only on the active surface for all six pages', async () => {
    setWidth(320);
    const cases: Array<[VueWrapper, string]> = [
      [render(ArReconciliationTable, tableProps([])), 'ar-recon-result-mobile'],
      [render(ArReconciliationConfirm, confirmProps([])), 'ar-confirm-mobile'],
      [render(ArReconciliationDetail, detailProps([])), 'ar-detail-mobile'],
      [render(ArReconciliationDispute, disputeProps([])), 'ar-dispute-mobile'],
      [await loadedPlan([]), 'budget-plan-mobile'],
      [await loadedItems([]), 'budget-item-mobile'],
    ];
    await nextTick();
    for (const [wrapper, mobileClass] of cases) {
      expect(surface(wrapper, mobileClass)).toHaveLength(0);
      expect(
        wrapper.find(isPhone() ? `.${mobileClass} .el-empty` : '.el-table__empty-text').exists()
      ).toBe(true);
    }
  });

  it('switches surfaces without refetching or duplicating actions', async () => {
    setWidth(320);
    const cases: Array<[VueWrapper, string, number]> = [
      [render(ArReconciliationTable, tableProps()), 'ar-recon-result-mobile', 2],
      [render(ArReconciliationConfirm, confirmProps()), 'ar-confirm-mobile', 2],
      [render(ArReconciliationDetail, detailProps()), 'ar-detail-mobile', 2],
      [render(ArReconciliationDispute, disputeProps()), 'ar-dispute-mobile', 2],
      [await loadedPlan(), 'budget-plan-mobile', 2],
      [await loadedItems(), 'budget-item-mobile', 2],
    ];
    await nextTick();
    const planCalls = budget.getBudgetPlanList.mock.calls.length;
    const itemCalls = requestGet.mock.calls.length;
    for (const widthValue of [767, 768, 1280, 320]) {
      setWidth(widthValue);
      await nextTick();
      for (const [wrapper, mobileClass, count] of cases) {
        expect(surface(wrapper, mobileClass)).toHaveLength(count);
      }
    }
    expect(budget.getBudgetPlanList.mock.calls.length).toBe(planCalls);
    expect(requestGet.mock.calls.length).toBe(itemCalls);
  });

  it.each([320, 768])(
    'keeps budget permissions as the only action gate at %ipx',
    async widthValue => {
      setWidth(widthValue);
      user.userInfo.permissions = [];
      const plan = await loadedPlan();
      const itemsWrapper = await loadedItems();
      expect(buttonsIn(plan, budgetLabels.plan.create)).toHaveLength(0);
      expect(buttonsIn(plan, budgetLabels.plan.table.approve)).toHaveLength(0);
      expect(buttonsIn(plan, budgetLabels.plan.table.reject)).toHaveLength(0);
      expect(buttonsIn(itemsWrapper, budgetLabels.item.create)).toHaveLength(0);
      expect(buttonsIn(itemsWrapper, budgetLabels.item.table.edit)).toHaveLength(0);
      expect(buttonsIn(itemsWrapper, budgetLabels.item.table.adjust)).toHaveLength(0);
      expect(buttonsIn(itemsWrapper, budgetLabels.item.table.delete)).toHaveLength(0);
      expect(
        buttonsIn(surface(plan, 'budget-plan-mobile')[0], budgetLabels.plan.viewItems)
      ).toHaveLength(1);
    }
  );

  it('keeps two-column touch actions, safe areas and scrolling bodies', () => {
    const views = resolve(process.cwd(), 'src/views');
    const files = [
      'ar-reconciliation/components/ArReconciliationTable.vue',
      'ar-reconciliation/components/ArReconciliationConfirm.vue',
      'ar-reconciliation/components/ArReconciliationDetail.vue',
      'ar-reconciliation/components/ArReconciliationDispute.vue',
      'budget/tabs/BudgetPlanTab.vue',
      'budget/tabs/BudgetItemTab.vue',
    ];
    for (const file of files) {
      const source = readFileSync(resolve(views, file), 'utf8').replace(/\r\n/g, '\n');
      expect(source, `${file} two-column actions`).toContain(
        'grid-template-columns: repeat(2, minmax(0, 1fr))'
      );
      if (source.includes('.card-actions')) {
        expect(source, `${file} touch target`).toContain('min-height: 44px');
      }
    }
    const dialogs = files.slice(1);
    for (const file of dialogs) {
      const source = readFileSync(resolve(views, file), 'utf8').replace(/\r\n/g, '\n');
      expect(source, `${file} viewport height`).toContain('100dvh');
      expect(source, `${file} safe area`).toContain('env(safe-area-inset');
      expect(source, `${file} scrolling body`).toContain('overflow-y: auto');
    }
  });
});
