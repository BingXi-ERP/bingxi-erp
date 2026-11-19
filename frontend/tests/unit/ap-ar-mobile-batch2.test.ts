import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import ElementPlus, {
  ElDescriptions,
  ElDialog,
  ElForm,
  ElMessage,
  ElMessageBox,
  ElPagination,
} from 'element-plus';
import ReconciliationTab from '@/views/ar/tabs/ReconciliationTab.vue';
import VerificationTab from '@/views/ar/tabs/VerificationTab.vue';
import FundTab from '@/views/ar/tabs/FundTab.vue';
import ApReportTab from '@/views/ap/tabs/ApReportTab.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import zhCN from '@/locales/zh-CN';

const api = vi.hoisted(() => ({
  getARReconciliationList: vi.fn(),
  createARReconciliation: vi.fn(),
  updateARReconciliationStatus: vi.fn(),
  getARVerificationList: vi.fn(),
  getARVerification: vi.fn(),
  autoVerifyAR: vi.fn(),
  manualVerifyAR: vi.fn(),
  cancelARVerification: vi.fn(),
  getUnverifiedARInvoices: vi.fn(),
  getUnverifiedARPayments: vi.fn(),
  getFundAccountList: vi.fn(),
  createFundAccount: vi.fn(),
  depositFund: vi.fn(),
  withdrawFund: vi.fn(),
  freezeFund: vi.fn(),
  getAPStatisticsReport: vi.fn(),
  getAPDailyReport: vi.fn(),
  getAPMonthlyReport: vi.fn(),
  getAPAgingReport: vi.fn(),
}));
vi.mock('@/api/ar', () => api);
vi.mock('@/api/fund', () => api);
vi.mock('@/api/ap', () => api);
vi.mock('@/composables/useBreakpoint', async () => {
  const { ref } = await import('vue');
  const width = ref(320);
  return { useBreakpoint: () => ({ width }) };
});

const common = zhCN.common;
const ar = zhCN.arModule;
const phoneWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';

type TabComponent =
  typeof ReconciliationTab | typeof VerificationTab | typeof FundTab | typeof ApReportTab;

const reconciliations = [
  {
    id: 1,
    reconciliation_no: 'REC-1',
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
    reconciliation_no: 'REC-2',
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
  {
    id: 3,
    reconciliation_no: 'REC-3',
    customer_id: 9,
    customer_name: 'Customer C',
    period_start: '2026-11-03',
    period_end: '2026-11-17',
    opening_balance: '0.00',
    total_invoices: '100.00',
    total_collections: '0.00',
    closing_balance: '100.00',
    reconciliation_status: 'disputed',
    created_at: '2026-11-18T10:00:00Z',
  },
];

const verifications = [
  {
    id: 1,
    verification_no: 'VER-1',
    invoice_no: 'INV-1',
    payment_no: 'PAY-1',
    verification_amount: '1234.50',
    verification_date: '2026-11-16',
    status: 'active',
    created_at: '2026-11-16T10:00:00Z',
  },
  {
    id: 2,
    verification_no: 'VER-2',
    invoice_no: 'INV-2',
    verification_amount: '0.00',
    verification_date: '2026-11-17',
    status: 'cancelled',
    created_at: '',
  },
];

const funds = [
  {
    id: 1,
    account_code: 'ACC-1',
    account_name: 'Main account',
    account_type: 'bank',
    balance: 1234.5,
    frozen_balance: 0,
    available_balance: 1234.5,
    bank_name: 'Bank A',
    bank_account: 'BA-1',
    status: 'active',
  },
  {
    id: 2,
    account_code: 'ACC-2',
    account_name: 'Petty cash',
    account_type: 'cash',
    balance: 0,
    frozen_balance: 50,
    available_balance: 50,
    status: 'frozen',
  },
];

const reportRows = [
  {
    period: '2026-11',
    invoice_count: 12,
    invoice_amount: 1234.5,
    paid_amount: '900.00',
    unpaid_amount: null,
    overdue_amount: 0,
  },
];

const wrappers: VueWrapper[] = [];

function setWidth(value: number) {
  useBreakpoint().width.value = value;
}

function currentWidth(): number {
  return useBreakpoint().width.value;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getARReconciliationList.mockResolvedValue({
    data: { items: reconciliations, total: reconciliations.length, page: 1, page_size: 10 },
  });
  api.getARVerificationList.mockResolvedValue({ data: { list: verifications } });
  api.getARVerification.mockImplementation(async (id: number) => ({
    data: verifications.find(item => item.id === id) ?? verifications[0],
  }));
  api.getFundAccountList.mockResolvedValue({ data: funds });
  api.getAPStatisticsReport.mockResolvedValue({ data: { list: reportRows } });
  api.getAPDailyReport.mockResolvedValue({ data: { list: reportRows } });
  api.getAPMonthlyReport.mockResolvedValue({ data: { list: reportRows } });
  api.getAPAgingReport.mockResolvedValue({ data: { list: reportRows } });
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  ElMessageBox.close();
  ElMessage.closeAll();
  vi.restoreAllMocks();
});

function render(component: TabComponent): VueWrapper {
  // 仅隔离 Element Plus 下拉在 jsdom 中的递归渲染；页面字段与业务动作仍走真实组件。
  const wrapper = mount(component, {
    global: {
      plugins: [ElementPlus],
      stubs: { teleport: true, ElSelect: true },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

async function loaded(component: TabComponent): Promise<VueWrapper> {
  const wrapper = render(component);
  await flushPromises();
  return wrapper;
}

function surface(wrapper: VueWrapper, mobileClass: string) {
  const phone = currentWidth() < 768;
  expect(wrapper.find(`.${mobileClass}`).exists(), `${mobileClass} surface`).toBe(phone);
  expect(wrapper.find('.el-table').exists(), 'desktop table surface').toBe(!phone);
  expect(wrapper.findComponent(ElPagination).exists(), 'extra pagination').toBe(false);
  return phone
    ? wrapper.findAll(`.${mobileClass} .card-item`)
    : wrapper.findAll('.el-table__body-wrapper .el-table__row');
}

function field(row: DOMWrapper<Element> | VueWrapper, label: string, column: number) {
  if (currentWidth() >= 768) return (row as DOMWrapper<Element>).findAll('td')[column];
  const group = (row as DOMWrapper<Element>)
    .findAll('.card-fields > div')
    .find(item => item.get('dt').text() === label);
  expect(group, `field ${label}`).toBeDefined();
  return group!.get('dd');
}

function buttonIn(container: DOMWrapper<Element> | VueWrapper, label: string) {
  const buttons = container.findAll('button').filter(item => item.text() === label);
  expect(buttons.length, `button ${label}`).toBeGreaterThan(0);
  return buttons[0];
}

function actionLabels(row: DOMWrapper<Element> | VueWrapper): string[] {
  return row.findAll('button').map(button => button.text());
}

for (const breakpoint of [320, 767, 768, 1280]) {
  describe(`AP/AR responsive parity at ${breakpoint}px`, () => {
    beforeEach(() => {
      setWidth(breakpoint);
    });

    it('AR reconciliation keeps every field, decimal format and draft-only action', async () => {
      const wrapper = await loaded(ReconciliationTab);
      const list = surface(wrapper, 'ar-reconciliation-mobile');
      expect(list).toHaveLength(reconciliations.length);
      expect(field(list[0], ar.reconciliation.reconciliationNo, 0).text()).toBe('REC-1');
      expect(field(list[0], ar.reconciliation.customer, 1).text()).toBe('Customer A');
      expect(field(list[0], ar.reconciliation.reconciliationDate, 2).text()).toBe(
        '2026-11-01 ~ 2026-11-15'
      );
      expect(field(list[0], ar.reconciliation.invoiceAmount, 3).text()).toBe('1,000.00');
      expect(field(list[0], ar.reconciliation.paymentAmount, 4).text()).toBe('1,000.00');
      expect(field(list[0], ar.reconciliation.difference, 5).text()).toBe('0.00');
      expect(field(list[0], common.status, 6).text()).toBe(ar.reconciliation.statusDraft);
      expect(field(list[0], ar.reconciliation.confirmedAt, 7).text()).toBe('2026-11-16T10:00:00Z');
      expect(field(list[1], ar.reconciliation.customer, 1).text()).toBe('');
      expect(field(list[1], ar.reconciliation.paymentAmount, 4).text()).toBe('887.50');
      expect(field(list[1], ar.reconciliation.confirmedAt, 7).text()).toBe('');
      expect(field(list[1], common.status, 6).text()).toBe(ar.reconciliation.statusConfirmed);
      expect(field(list[2], common.status, 6).text()).toBe(ar.reconciliation.statusDisputed);
      const difference = field(list[1], ar.reconciliation.difference, 5);
      expect(
        currentWidth() < 768
          ? difference.classes().includes('text-red')
          : difference.find('.text-red').exists()
      ).toBe(true);
      expect(actionLabels(list[0])).toEqual([ar.reconciliation.confirm]);
      expect(actionLabels(list[1])).toEqual([]);
      expect(actionLabels(list[2])).toEqual([]);
    });

    it('AR verification keeps every field, raw status and active-only action', async () => {
      const wrapper = await loaded(VerificationTab);
      const list = surface(wrapper, 'ar-verification-mobile');
      expect(list).toHaveLength(verifications.length);
      expect(field(list[0], 'ID', 0).text()).toBe('1');
      expect(field(list[0], ar.verification.invoiceNo, 1).text()).toBe('INV-1');
      expect(field(list[0], ar.verification.paymentNo, 2).text()).toBe('PAY-1');
      expect(field(list[0], ar.verification.date, 3).text()).toBe('2026-11-16');
      expect(field(list[0], ar.verification.amount, 4).text()).toBe('1,234.50');
      expect(field(list[0], common.status, 5).text()).toBe('active');
      expect(field(list[1], ar.verification.paymentNo, 2).text()).toBe('');
      expect(field(list[1], ar.verification.amount, 4).text()).toBe('0.00');
      expect(field(list[1], common.status, 5).text()).toBe('cancelled');
      expect(actionLabels(list[0])).toEqual([common.detail, ar.verification.cancel]);
      expect(actionLabels(list[1])).toEqual([common.detail]);
    });

    it('fund keeps summary, every account field and all three operations', async () => {
      const wrapper = await loaded(FundTab);
      const summary = wrapper.findAll('.summary-value').map(item => item.text());
      expect(summary).toEqual(['1,234.50', '50.00', '1,284.50', '2']);
      const list = surface(wrapper, 'ar-fund-mobile');
      expect(list).toHaveLength(funds.length);
      expect(field(list[0], ar.fund.accountCode, 0).text()).toBe('ACC-1');
      expect(field(list[0], ar.fund.accountName, 1).text()).toBe('Main account');
      expect(field(list[0], ar.fund.accountType, 2).text()).toBe(ar.fund.typeBank);
      expect(field(list[0], ar.fund.balance, 3).text()).toBe('1,234.50');
      expect(field(list[0], ar.fund.frozenBalance, 4).text()).toBe('0.00');
      expect(field(list[0], ar.fund.availableBalance, 5).text()).toBe('1,234.50');
      expect(field(list[0], ar.fund.bankName, 6).text()).toBe('Bank A');
      expect(field(list[0], ar.fund.bankAccount, 7).text()).toBe('BA-1');
      expect(field(list[0], common.status, 8).text()).toBe(ar.fund.statusActive);
      expect(field(list[1], ar.fund.balance, 3).text()).toBe('0.00');
      expect(field(list[1], ar.fund.bankName, 6).text()).toBe('');
      expect(field(list[1], ar.fund.bankAccount, 7).text()).toBe('');
      expect(field(list[1], common.status, 8).text()).toBe(ar.fund.statusFrozen);
      for (const row of list) {
        expect(actionLabels(row)).toEqual([ar.fund.deposit, ar.fund.withdraw, ar.fund.freeze]);
      }
    });

    it('AP report keeps every dynamic column and its exact numeric format', async () => {
      const wrapper = await loaded(ApReportTab);
      await buttonIn(wrapper, common.search).trigger('click');
      await flushPromises();
      expect(api.getAPStatisticsReport).toHaveBeenCalledTimes(1);
      const list = surface(wrapper, 'ap-report-mobile');
      expect(list).toHaveLength(reportRows.length);
      const expected = ['2026-11', '12', '1,234.5', '900.00', '-', '0'];
      const columns = Object.keys(reportRows[0]);
      expect(columns).toHaveLength(expected.length);
      for (const [index, column] of columns.entries()) {
        expect(field(list[0], column, index).text()).toBe(expected[index]);
      }
    });

    it('shows the empty state only on the active surface for all four pages', async () => {
      api.getARReconciliationList.mockResolvedValue({ data: { items: [] } });
      api.getARVerificationList.mockResolvedValue({ data: { list: [] } });
      api.getFundAccountList.mockResolvedValue({ data: [] });
      api.getAPStatisticsReport.mockResolvedValue({ data: { list: [] } });
      const cases = [
        [await loaded(ReconciliationTab), 'ar-reconciliation-mobile'],
        [await loaded(VerificationTab), 'ar-verification-mobile'],
        [await loaded(FundTab), 'ar-fund-mobile'],
      ] as const;
      const report = await loaded(ApReportTab);
      await buttonIn(report, common.search).trigger('click');
      await flushPromises();
      for (const [wrapper, mobileClass] of cases) {
        const phone = currentWidth() < 768;
        expect(wrapper.find(`.${mobileClass}`).exists()).toBe(phone);
        expect(wrapper.findComponent(ElPagination).exists()).toBe(false);
        expect(
          phone
            ? wrapper.findAll(`.${mobileClass} .card-item`)
            : wrapper.findAll('.el-table__body-wrapper .el-table__row')
        ).toHaveLength(0);
        expect(
          currentWidth() < 768
            ? wrapper.find(`.${mobileClass} .el-empty`).exists()
            : wrapper.find('.el-table__empty-text').exists()
        ).toBe(true);
      }
      const reportPhone = currentWidth() < 768;
      expect(report.find('.ap-report-mobile').exists()).toBe(reportPhone);
      expect(
        reportPhone
          ? report.findAll('.ap-report-mobile .card-item')
          : report.findAll('.el-table__body-wrapper .el-table__row')
      ).toHaveLength(0);
      expect(report.find('.el-empty').exists()).toBe(true);
    });
  });
}

describe('AP/AR responsive dialogs and original actions', () => {
  it.each([320, 768])('keeps reconciliation form and confirm action at %ipx', async widthValue => {
    setWidth(widthValue);
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = await loaded(ReconciliationTab);
    await buttonIn(wrapper, ar.reconciliation.create).trigger('click');
    const dialog = wrapper.getComponent(ElDialog);
    expect(dialog.props('width')).toBe(widthValue < 768 ? phoneWidth : '500px');
    expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(
      widthValue < 768 ? 'top' : 'right'
    );
    expect(wrapper.get('.reconciliation-dialog').classes('reconciliation-dialog--phone')).toBe(
      widthValue < 768
    );
    await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');

    await buttonIn(
      surface(wrapper, 'ar-reconciliation-mobile')[0],
      ar.reconciliation.confirm
    ).trigger('click');
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(api.updateARReconciliationStatus).toHaveBeenCalledWith(1, 'confirmed');
  });

  it.each([320, 1280])('keeps verification dialogs and cancel action at %ipx', async widthValue => {
    setWidth(widthValue);
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const wrapper = await loaded(VerificationTab);
    await buttonIn(wrapper, ar.verification.manual).trigger('click');
    const manual = wrapper.getComponent(ElDialog);
    expect(manual.props('width')).toBe(widthValue < 768 ? phoneWidth : '560px');
    expect(manual.getComponent(ElForm).props('labelPosition')).toBe(
      widthValue < 768 ? 'top' : 'right'
    );
    expect(wrapper.get('.ar-verification-dialog').classes('ar-verification-dialog--phone')).toBe(
      widthValue < 768
    );
    await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');

    await buttonIn(surface(wrapper, 'ar-verification-mobile')[0], common.detail).trigger('click');
    await flushPromises();
    const detail = wrapper.findAllComponents(ElDialog)[1];
    expect(detail.props('width')).toBe(widthValue < 768 ? phoneWidth : '600px');
    expect(detail.getComponent(ElDescriptions).props('column')).toBe(widthValue < 768 ? 1 : 2);
    expect(
      wrapper.get('.ar-verification-detail-dialog').classes('ar-verification-detail-dialog--phone')
    ).toBe(widthValue < 768);
    await detail.get('.el-dialog__headerbtn').trigger('click');

    await buttonIn(surface(wrapper, 'ar-verification-mobile')[0], ar.verification.cancel).trigger(
      'click'
    );
    await flushPromises();
    expect(api.cancelARVerification).toHaveBeenCalledWith(1);
  });

  it.each([767, 1280])('keeps fund dialogs and deposit entry at %ipx', async widthValue => {
    setWidth(widthValue);
    const wrapper = await loaded(FundTab);
    await buttonIn(wrapper, ar.fund.create).trigger('click');
    const create = wrapper.getComponent(ElDialog);
    expect(create.props('width')).toBe(widthValue < 768 ? phoneWidth : '500px');
    expect(create.getComponent(ElForm).props('labelPosition')).toBe(
      widthValue < 768 ? 'top' : 'right'
    );
    expect(wrapper.get('.fund-dialog').classes('fund-dialog--phone')).toBe(widthValue < 768);
    await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');

    await buttonIn(surface(wrapper, 'ar-fund-mobile')[0], ar.fund.deposit).trigger('click');
    const operation = wrapper.findAllComponents(ElDialog)[1];
    expect(operation.props('width')).toBe(widthValue < 768 ? phoneWidth : '400px');
    expect(operation.getComponent(ElForm).props('labelPosition')).toBe(
      widthValue < 768 ? 'top' : 'right'
    );
    expect(wrapper.get('.fund-operation-dialog').classes('fund-operation-dialog--phone')).toBe(
      widthValue < 768
    );
    await buttonIn(operation, common.cancel).trigger('click');
    expect(api.depositFund).not.toHaveBeenCalled();
  });

  it('switches surfaces without refetching or duplicating mounted actions', async () => {
    setWidth(320);
    const reconciliation = await loaded(ReconciliationTab);
    const verification = await loaded(VerificationTab);
    const fund = await loaded(FundTab);
    const report = await loaded(ApReportTab);
    await buttonIn(report, common.search).trigger('click');
    await flushPromises();
    const initialCalls = [
      api.getARReconciliationList.mock.calls.length,
      api.getARVerificationList.mock.calls.length,
      api.getFundAccountList.mock.calls.length,
      api.getAPStatisticsReport.mock.calls.length,
    ];
    for (const widthValue of [767, 768, 320, 1280]) {
      setWidth(widthValue);
      await flushPromises();
      expect(surface(reconciliation, 'ar-reconciliation-mobile')).toHaveLength(3);
      expect(surface(verification, 'ar-verification-mobile')).toHaveLength(2);
      expect(surface(fund, 'ar-fund-mobile')).toHaveLength(2);
      expect(surface(report, 'ap-report-mobile')).toHaveLength(1);
    }
    expect([
      api.getARReconciliationList.mock.calls.length,
      api.getARVerificationList.mock.calls.length,
      api.getFundAccountList.mock.calls.length,
      api.getAPStatisticsReport.mock.calls.length,
    ]).toEqual(initialCalls);
  });
});
