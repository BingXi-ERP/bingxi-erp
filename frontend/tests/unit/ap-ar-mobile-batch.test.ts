import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDialog, ElForm, ElMessage, ElMessageBox, ElPagination } from 'element-plus';
import VerificationTab from '@/views/ap/tabs/VerificationTab.vue';
import InvoiceTab from '@/views/ar/tabs/InvoiceTab.vue';
import ArPaymentTab from '@/views/ar/tabs/PaymentTab.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { permission } from '@/directives/permission';
import { PERMISSIONS } from '@/constants/permissions';
import { getSupplierList } from '@/api/supplier';
import { getCustomerList } from '@/api/customer';
import zhCN from '@/locales/zh-CN';

const api = vi.hoisted(() => ({
  getAPVerificationList: vi.fn(),
  getAPVerification: vi.fn(),
  autoVerifyAP: vi.fn(),
  manualVerifyAP: vi.fn(),
  cancelAPVerification: vi.fn(),
  getUnverifiedAPInvoices: vi.fn(),
  getUnverifiedAPPayments: vi.fn(),
  getARInvoiceList: vi.fn(),
  getARInvoice: vi.fn(),
  createARInvoice: vi.fn(),
  approveARInvoice: vi.fn(),
  cancelARInvoice: vi.fn(),
  getARPaymentList: vi.fn(),
  getARPayment: vi.fn(),
  createARPayment: vi.fn(),
  updateARPayment: vi.fn(),
  confirmARPayment: vi.fn(),
  printARCollectionDocx: vi.fn(),
}));
vi.mock('@/api/ap-verification', () => api);
vi.mock('@/api/ar', () => api);
vi.mock('@/api/supplier', () => ({ getSupplierList: vi.fn() }));
vi.mock('@/api/customer', () => ({ getCustomerList: vi.fn() }));
vi.mock('@/utils/export', () => ({ exportFromBackend: vi.fn() }));
vi.mock('@/components/Layout/MainLayout.vue', () => ({
  default: { name: 'MainLayoutStub', render: () => null },
}));
const user = vi.hoisted(() => ({ userInfo: { permissions: [] as string[] } }));
vi.mock('@/store/user', () => ({ useUserStore: () => user }));
vi.mock('@/composables/useBreakpoint', async () => {
  const { ref } = await import('vue');
  const width = ref(320);
  return { useBreakpoint: () => ({ width }) };
});

const common = zhCN.common;
const ap = zhCN.apModule;
const ar = zhCN.arModule;
const phoneWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';
const grants = [PERMISSIONS.AR_INVOICE_READ, PERMISSIONS.AR_INVOICE_EXPORT];

type TabComponent = typeof VerificationTab | typeof InvoiceTab | typeof ArPaymentTab;

const verifications = [
  {
    id: 1,
    verification_no: 'VER-1',
    verification_date: '2026-11-16',
    total_amount: '1234.50',
    verification_status: 'COMPLETED',
    created_at: '2026-11-16T10:00:00Z',
  },
  {
    id: 2,
    verification_no: 'VER-2',
    verification_date: '2026-11-17',
    total_amount: '0.00',
    verification_status: 'CANCELLED',
    created_at: '',
  },
];
const invoices = [
  {
    id: 1,
    invoice_no: 'INV-1',
    customer_id: 7,
    customer_name: 'Customer A',
    invoice_date: '2026-11-01',
    invoice_amount: '2000.00',
    tax_amount: null,
    received_amount: '2000.00',
    unpaid_amount: '0.00',
    status: 'PAID',
    due_date: '2026-12-01',
    created_at: '2026-11-01T00:00:00Z',
  },
  {
    id: 2,
    invoice_no: 'INV-2',
    customer_id: 8,
    customer_name: 'Customer B',
    invoice_date: '2026-11-02',
    invoice_amount: '1000.00',
    tax_amount: '90.00',
    received_amount: '100.00',
    unpaid_amount: '900.00',
    status: 'DRAFT',
    due_date: '2026-12-02',
    created_at: '2026-11-02T00:00:00Z',
  },
  {
    id: 3,
    invoice_no: 'INV-3',
    customer_id: 9,
    customer_name: 'Customer C',
    invoice_date: '2026-11-03',
    invoice_amount: '500.00',
    tax_amount: '0.00',
    received_amount: '0.00',
    unpaid_amount: '500.00',
    status: 'APPROVED',
    due_date: '2026-12-03',
    created_at: '2026-11-03T00:00:00Z',
  },
];
const payments = [
  {
    id: 1,
    payment_no: 'PAY-1',
    customer_id: 7,
    customer_name: 'Customer A',
    payment_date: '2026-11-10',
    payment_method: 'bank_transfer',
    amount: '2345.67',
    collection_amount: '2345.67',
    status: 'draft',
    created_at: '2026-11-10T00:00:00Z',
  },
  {
    id: 2,
    payment_no: 'PAY-2',
    customer_id: 8,
    customer_name: 'Customer B',
    payment_date: '2026-11-11',
    payment_method: 'cash',
    amount: '100.00',
    collection_amount: '100.00',
    status: 'confirmed',
    created_at: '2026-11-11T00:00:00Z',
  },
  {
    id: 3,
    payment_no: 'PAY-3',
    customer_id: 9,
    customer_name: 'Customer C',
    payment_date: '2026-11-12',
    payment_method: 'check',
    amount: '50.00',
    collection_amount: '50.00',
    status: 'completed',
    created_at: '2026-11-12T00:00:00Z',
  },
];
const supplierListResponse = {
  code: 200,
  data: { items: [{ id: 51, supplier_name: 'Supplier 51' }], total: 1 },
};
const customerListResponse = {
  code: 200,
  data: { items: [{ id: 7, customer_name: 'Customer A' }], total: 1 },
};

const wrappers: VueWrapper[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  user.userInfo.permissions = [...grants];
  api.getAPVerificationList.mockResolvedValue({ data: { items: verifications } });
  api.getAPVerification.mockImplementation(async (id: number) => ({
    data: verifications.find(item => item.id === id) ?? verifications[0],
  }));
  api.getUnverifiedAPInvoices.mockResolvedValue({ data: [] });
  api.getUnverifiedAPPayments.mockResolvedValue({ data: [] });
  api.getARInvoiceList.mockResolvedValue({ data: { items: invoices, total: invoices.length } });
  api.getARInvoice.mockResolvedValue({ data: invoices[1] });
  api.getARPaymentList.mockResolvedValue({ data: { list: payments } });
  api.getARPayment.mockResolvedValue({ data: payments[0] });
  api.printARCollectionDocx.mockResolvedValue(new Blob(['x']));
  vi.mocked(getSupplierList).mockResolvedValue(supplierListResponse);
  vi.mocked(getCustomerList).mockResolvedValue(customerListResponse);
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  ElMessageBox.close();
  ElMessage.closeAll();
  vi.restoreAllMocks();
});

function render(component: TabComponent): VueWrapper {
  // 测试聚焦字段/动作等价，不验证 Element Plus 下拉在 jsdom 内部的选中态更新；
  // ElSelect 在 jsdom 有递归渲染噪声，按现有范式以测试桩隔离，业务动作仍走页面原函数。
  const wrapper = mount(component, {
    global: {
      plugins: [ElementPlus],
      directives: { permission },
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

function width(): number {
  return useBreakpoint().width.value;
}

function rows(wrapper: VueWrapper, mobileClass: string) {
  const phone = width() < 768;
  expect(wrapper.find(`.${mobileClass}`).exists(), `mobile ${mobileClass}`).toBe(phone);
  expect(wrapper.find('.el-table').exists(), 'desktop table').toBe(!phone);
  return phone
    ? wrapper.findAll(`.${mobileClass} .card-item`)
    : wrapper.findAll('.el-table__body-wrapper .el-table__row');
}

function field(row: DOMWrapper<Element> | VueWrapper, label: string, column: number) {
  if (width() >= 768) return (row as DOMWrapper<Element>).findAll('td')[column];
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

function hasButton(row: DOMWrapper<Element> | VueWrapper, label: string): boolean {
  return row.findAll('button').some(item => item.text() === label);
}

for (const breakpoint of [320, 767, 768, 1280]) {
  describe(`AP/AR mobile batch at ${breakpoint}px`, () => {
    beforeEach(() => {
      useBreakpoint().width.value = breakpoint;
    });

    it('verification keeps every field and the detail-only action', async () => {
      const wrapper = await loaded(VerificationTab);
      const list = rows(wrapper, 'ap-verification-mobile');
      expect(list).toHaveLength(verifications.length);
      expect(field(list[0], ap.verification.verificationNo, 0).text()).toBe('VER-1');
      expect(field(list[0], ap.verification.verificationDate, 1).text()).toBe('2026-11-16');
      expect(field(list[0], ap.verification.verificationAmount, 2).text()).toBe('1,234.50');
      expect(field(list[0], common.status, 3).text()).toBe(ap.verification.statusCompleted);
      expect(field(list[0], common.createTime, 4).text()).toBe(verifications[0].created_at);
      expect(field(list[1], ap.verification.verificationAmount, 2).text()).toBe('0.00');
      expect(field(list[1], common.status, 3).text()).toBe(ap.verification.statusCancelled);
      expect(field(list[1], common.createTime, 4).text()).toBe('');
      for (const row of list) {
        expect(row.findAll('button').map(item => item.text())).toEqual([common.detail]);
      }
    });

    it('invoice keeps all nine fields, status actions and the real pagination layout', async () => {
      const wrapper = await loaded(InvoiceTab);
      const list = rows(wrapper, 'ar-invoice-mobile');
      expect(list).toHaveLength(invoices.length);
      const filter = wrapper.getComponent(ElForm);
      expect(filter.props('inline')).toBe(breakpoint >= 768);
      expect(filter.props('labelPosition')).toBe(breakpoint < 768 ? 'top' : 'right');
      const pagination = wrapper.getComponent(ElPagination);
      expect(pagination.props('total')).toBe(invoices.length);
      expect(pagination.props('layout')).toBe(
        breakpoint < 768 ? 'total, sizes, prev, next' : 'total, sizes, prev, pager, next, jumper'
      );
      expect(field(list[0], ar.invoice.invoiceNo, 0).text()).toBe('INV-1');
      expect(field(list[0], ar.invoice.customer, 1).text()).toBe('Customer A');
      expect(field(list[0], ar.invoice.invoiceDate, 2).text()).toBe('2026-11-01');
      expect(field(list[0], ar.invoice.invoiceAmount, 3).text()).toBe('2,000.00');
      expect(field(list[0], ar.invoice.taxAmount, 4).text()).toBe('0.00');
      expect(field(list[0], ar.invoice.receivedAmount, 5).text()).toBe('2,000.00');
      expect(field(list[0], ar.invoice.unpaidAmount, 6).text()).toBe('0.00');
      expect(field(list[0], common.status, 7).text()).toBe(ar.invoice.statusPaid);
      expect(field(list[0], ar.invoice.dueDate, 8).text()).toBe('2026-12-01');
      expect(field(list[1], ar.invoice.taxAmount, 4).text()).toBe('90.00');
      expect(field(list[1], ar.invoice.unpaidAmount, 6).text()).toBe('900.00');
      const unpaid = field(list[1], ar.invoice.unpaidAmount, 6);
      expect(
        breakpoint < 768 ? unpaid.classes().includes('text-red') : unpaid.find('.text-red').exists()
      ).toBe(true);
      expect(field(list[1], common.status, 7).text()).toBe(ar.invoice.statusDraft);
      expect(field(list[2], common.status, 7).text()).toBe(ar.invoice.statusApproved);
      expect(list[0].findAll('button').map(item => item.text())).toEqual([common.detail]);
      expect(list[1].findAll('button').map(item => item.text())).toEqual([
        common.detail,
        ar.invoice.approve,
        common.cancel,
      ]);
      expect(list[2].findAll('button').map(item => item.text())).toEqual([common.detail]);
    });

    it('AR payment keeps every field and the status-gated action matrix', async () => {
      const wrapper = await loaded(ArPaymentTab);
      const list = rows(wrapper, 'ar-payment-mobile');
      expect(list).toHaveLength(payments.length);
      expect(field(list[0], 'ID', 0).text()).toBe('1');
      expect(field(list[0], ar.payment.paymentNo, 1).text()).toBe('PAY-1');
      expect(field(list[0], ar.payment.customer, 2).text()).toBe('7');
      expect(field(list[0], ar.payment.paymentDate, 3).text()).toBe('2026-11-10');
      expect(field(list[0], ar.payment.method, 4).text()).toBe('bank_transfer');
      expect(field(list[0], ar.payment.amount, 5).text()).toBe('2,345.67');
      expect(field(list[0], common.status, 6).text()).toBe('draft');
      expect(field(list[1], common.status, 6).text()).toBe('confirmed');
      expect(field(list[2], common.status, 6).text()).toBe('completed');
      expect(list[0].findAll('button').map(item => item.text())).toEqual([
        common.edit,
        ar.payment.confirm,
        common.detail,
        common.print,
      ]);
      expect(list[1].findAll('button').map(item => item.text())).toEqual([
        ar.payment.confirm,
        common.detail,
        common.print,
      ]);
      expect(list[2].findAll('button').map(item => item.text())).toEqual([
        common.detail,
        common.print,
      ]);
    });

    it('shows the empty state only on the active breakpoint surface', async () => {
      api.getAPVerificationList.mockResolvedValue({ data: { items: [] } });
      api.getARInvoiceList.mockResolvedValue({ data: { items: [], total: 0 } });
      api.getARPaymentList.mockResolvedValue({ data: { list: [] } });
      const verification = await loaded(VerificationTab);
      const invoice = await loaded(InvoiceTab);
      const payment = await loaded(ArPaymentTab);
      for (const [wrapper, mobileClass] of [
        [verification, 'ap-verification-mobile'],
        [invoice, 'ar-invoice-mobile'],
        [payment, 'ar-payment-mobile'],
      ] as const) {
        expect(rows(wrapper, mobileClass)).toHaveLength(0);
        if (breakpoint < 768) {
          expect(wrapper.find(`.${mobileClass} .el-empty`).exists()).toBe(true);
        } else {
          expect(wrapper.find('.el-table__empty-text').exists()).toBe(true);
        }
      }
    });
  });
}

describe('AP/AR responsive dialogs and action wiring', () => {
  it.each([320, 768])(
    'opens verification dialogs with the breakpoint width at %ipx',
    async widthValue => {
      useBreakpoint().width.value = widthValue;
      const wrapper = await loaded(VerificationTab);
      await buttonIn(wrapper, ap.verification.create).trigger('click');
      const create = wrapper.getComponent(ElDialog);
      expect(create.props('modelValue')).toBe(true);
      expect(create.props('width')).toBe(widthValue < 768 ? phoneWidth : '600px');
      expect(create.getComponent(ElForm).props('labelPosition')).toBe(
        widthValue < 768 ? 'top' : 'right'
      );
      expect(wrapper.get('.verification-dialog').classes('verification-dialog--phone')).toBe(
        widthValue < 768
      );
      await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');

      const detailButton = buttonIn(rows(wrapper, 'ap-verification-mobile')[0], common.detail);
      await detailButton.trigger('click');
      await flushPromises();
      expect(api.getAPVerification).toHaveBeenCalledWith(verifications[0].id);
      const detail = wrapper.findAllComponents(ElDialog)[1];
      expect(detail.props('modelValue')).toBe(true);
      expect(detail.props('width')).toBe(widthValue < 768 ? phoneWidth : '640px');
      expect(hasButton(detail, ap.verification.cancel)).toBe(true);
      await detail.get('.el-dialog__headerbtn').trigger('click');

      const cancelledRow = rows(wrapper, 'ap-verification-mobile')[1];
      await buttonIn(cancelledRow, common.detail).trigger('click');
      await flushPromises();
      expect(hasButton(wrapper.findAllComponents(ElDialog)[1], ap.verification.cancel)).toBe(false);
    }
  );

  it.each([320, 1280])(
    'keeps invoice create form single-column on phone at %ipx',
    async widthValue => {
      useBreakpoint().width.value = widthValue;
      const wrapper = await loaded(InvoiceTab);
      expect(wrapper.findAll('button').map(item => item.text())).toContain(common.print);
      expect(wrapper.findAll('button').map(item => item.text())).toContain(common.export);
      await buttonIn(wrapper, ar.invoice.create).trigger('click');
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('modelValue')).toBe(true);
      expect(dialog.props('width')).toBe(widthValue < 768 ? phoneWidth : '600px');
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(
        widthValue < 768 ? 'top' : 'right'
      );
      const cols = dialog.findAll('.el-col');
      expect(cols).toHaveLength(6);
      for (const col of cols) {
        expect(col.classes()).toContain(`el-col-${widthValue < 768 ? 24 : 12}`);
      }
      await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');
      expect(dialog.props('modelValue')).toBe(false);
    }
  );

  it.each([767, 1280])('opens AR payment edit and detail dialogs at %ipx', async widthValue => {
    useBreakpoint().width.value = widthValue;
    const wrapper = await loaded(ArPaymentTab);
    const list = rows(wrapper, 'ar-payment-mobile');
    await buttonIn(list[0], common.edit).trigger('click');
    const edit = wrapper.getComponent(ElDialog);
    expect(edit.props('title')).toBe(ar.payment.edit);
    expect(edit.props('width')).toBe(widthValue < 768 ? phoneWidth : '540px');
    expect(edit.getComponent(ElForm).props('labelPosition')).toBe(
      widthValue < 768 ? 'top' : 'right'
    );
    expect(wrapper.get('.ar-payment-dialog').classes('ar-payment-dialog--phone')).toBe(
      widthValue < 768
    );
    await buttonIn(wrapper.get('.el-dialog'), common.cancel).trigger('click');

    await buttonIn(list[1], common.detail).trigger('click');
    await flushPromises();
    expect(api.getARPayment).toHaveBeenCalledWith(payments[1].id);
    const detail = wrapper.findAllComponents(ElDialog)[1];
    expect(detail.props('width')).toBe(widthValue < 768 ? phoneWidth : '600px');
    expect(
      wrapper.get('.ar-payment-detail-dialog').classes('ar-payment-detail-dialog--phone')
    ).toBe(widthValue < 768);
  });

  it('calls the original invoice approve and AR payment confirm actions after confirmation', async () => {
    useBreakpoint().width.value = 320;
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm');
    const invoice = await loaded(InvoiceTab);
    await buttonIn(rows(invoice, 'ar-invoice-mobile')[1], ar.invoice.approve).trigger('click');
    await flushPromises();
    expect(api.approveARInvoice).toHaveBeenCalledExactlyOnceWith(invoices[1].id);
    const payment = await loaded(ArPaymentTab);
    await buttonIn(rows(payment, 'ar-payment-mobile')[0], ar.payment.confirm).trigger('click');
    await flushPromises();
    expect(api.confirmARPayment).toHaveBeenCalledExactlyOnceWith(payments[0].id);
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it.each(['cancel', 'close'])(
    'writes nothing when %s dismisses a confirmation',
    async dismissal => {
      useBreakpoint().width.value = 320;
      vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(dismissal);
      const error = vi.spyOn(ElMessage, 'error');
      const invoice = await loaded(InvoiceTab);
      await buttonIn(rows(invoice, 'ar-invoice-mobile')[1], ar.invoice.approve).trigger('click');
      await flushPromises();
      const payment = await loaded(ArPaymentTab);
      await buttonIn(rows(payment, 'ar-payment-mobile')[0], ar.payment.confirm).trigger('click');
      await flushPromises();
      expect(api.approveARInvoice).not.toHaveBeenCalled();
      expect(api.confirmARPayment).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );

  it('switches surfaces without extra requests when the breakpoint crosses 768', async () => {
    useBreakpoint().width.value = 320;
    const wrapper = await loaded(ArPaymentTab);
    for (const widthValue of [767, 768, 320, 1280]) {
      useBreakpoint().width.value = widthValue;
      await flushPromises();
      expect(wrapper.find('.ar-payment-mobile').exists()).toBe(widthValue < 768);
      expect(wrapper.find('.el-table').exists()).toBe(widthValue >= 768);
      expect(
        wrapper.findAll('.ar-payment-mobile .card-item, .el-table__body-wrapper .el-table__row')
      ).toHaveLength(payments.length);
    }
    expect(api.getARPaymentList).toHaveBeenCalledTimes(1);
  });
});
