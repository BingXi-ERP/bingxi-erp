import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElDialog, ElForm, ElMessage, ElMessageBox } from 'element-plus';
import PaymentRequestTab from '@/views/ap/tabs/PaymentRequestTab.vue';
import PaymentTab from '@/views/ap/tabs/PaymentTab.vue';
import ReconciliationTab from '@/views/ap/tabs/ReconciliationTab.vue';
import { useBreakpoint } from '@/composables/useBreakpoint';
import { getSupplierList } from '@/api/supplier';
import zhCN from '@/locales/zh-CN';

const api = vi.hoisted(() => ({
  getAPPaymentRequestList: vi.fn(),
  getAPPaymentRequest: vi.fn(),
  createAPPaymentRequest: vi.fn(),
  updateAPPaymentRequest: vi.fn(),
  deleteAPPaymentRequest: vi.fn(),
  submitAPPaymentRequest: vi.fn(),
  approveAPPaymentRequest: vi.fn(),
  rejectAPPaymentRequest: vi.fn(),
  getUnverifiedAPInvoices: vi.fn(),
  getAPPaymentList: vi.fn(),
  createAPPayment: vi.fn(),
  updateAPPayment: vi.fn(),
  confirmAPPayment: vi.fn(),
  printAPPaymentDocx: vi.fn(),
  getAPReconciliationList: vi.fn(),
  getAPReconciliation: vi.fn(),
  autoReconcileAllAP: vi.fn(),
  generateAPReconciliation: vi.fn(),
  confirmAPReconciliation: vi.fn(),
  disputeAPReconciliation: vi.fn(),
}));
vi.mock('@/api/ap', () => api);
vi.mock('@/api/supplier', () => ({
  getSupplierList: vi.fn(),
}));
vi.mock('@/composables/useBreakpoint', async () => {
  const { ref } = await import('vue');
  const width = ref(320);
  return { useBreakpoint: () => ({ width }) };
});

const requests = ['DRAFT', 'REJECTED', 'APPROVING'].map((approval_status, index) => ({
  id: index + 11,
  request_no: `REQ-${approval_status}`,
  supplier_id: 51,
  request_date: '2026-11-15',
  payment_type: 'purchase',
  payment_method: 'bank_transfer',
  request_amount: '1234.56',
  currency: 'USD',
  approval_status,
  bank_name: 'Test bank',
  notes: `Notes ${approval_status}`,
}));
const payments = [
  {
    id: 21,
    payment_no: 'PAY-21',
    supplier_id: 51,
    payment_date: '2026-11-16',
    payment_amount: '2345.67',
    payment_method: 'bank_transfer',
    bank_account: 'BANK-ACCOUNT-21',
    created_at: '2026-11-16T08:12:34Z',
    payment_status: 'REGISTERED',
  },
  {
    id: 22,
    payment_no: 'PAY-22',
    supplier_id: 51,
    payment_date: '2026-11-17',
    payment_amount: '0.00',
    payment_method: 'cash',
    bank_account: null,
    created_at: '',
    payment_status: 'CONFIRMED',
  },
];
const reconciliations = ['0.00', '12.50', '-12.50'].map((difference_amount, index) => ({
  id: index + 31,
  reconciliation_no: `RECON-${index}`,
  supplier_name: 'Test supplier',
  start_date: '2026-11-01',
  end_date: '2026-11-18',
  total_invoice_amount: '3456.78',
  total_payment_amount: '3456.78',
  difference_amount,
  status: 'pending',
}));
const supplierOptions = [
  {
    id: 51,
    supplier_code: 'SUP-51',
    supplier_name: 'Test supplier',
    status: 'ACTIVE',
  },
];
const supplierListResponse = {
  code: 200,
  message: 'ok',
  data: { items: supplierOptions, total: supplierOptions.length },
};
const requestListResponse = { data: { items: requests } };
const paymentListResponse = { data: { items: payments } };
const reconciliationListResponse = { data: { items: reconciliations } };
const invoiceListResponse = { data: [] };
const wrappers: VueWrapper[] = [];
const common = zhCN.common;
const labels = zhCN.apModule;

beforeEach(() => {
  vi.clearAllMocks();
  api.getAPPaymentRequestList.mockResolvedValue(requestListResponse);
  api.getAPPaymentList.mockResolvedValue(paymentListResponse);
  api.getAPReconciliationList.mockResolvedValue(reconciliationListResponse);
  api.getUnverifiedAPInvoices.mockResolvedValue(invoiceListResponse);
  vi.mocked(getSupplierList).mockResolvedValue(supplierListResponse);
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  vi.restoreAllMocks();
});

async function render(
  component: typeof PaymentTab | typeof PaymentRequestTab | typeof ReconciliationTab
) {
  // 本测试锁字段与动作等价，不验证 Element Plus 下拉在 jsdom 的内部选中态更新
  const wrapper = mount(component, {
    global: { plugins: [ElementPlus], stubs: { teleport: true, ElSelect: true } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
function rows(wrapper: VueWrapper, width: number) {
  expect(wrapper.find('section').exists()).toBe(width < 768);
  expect(wrapper.find('.el-table').exists()).toBe(width >= 768);
  return wrapper.findAll(width < 768 ? '.card-item' : '.el-table__body-wrapper .el-table__row');
}
function button(row: DOMWrapper<Element> | VueWrapper, label: string) {
  const result = row.findAll('button').find(item => item.text() === label);
  expect(result, `button ${label}`).toBeDefined();
  return result!;
}
function field(row: DOMWrapper<Element>, width: number, label: string, column: number) {
  if (width >= 768) return row.findAll('td')[column];
  const group = row.findAll('.card-fields > div').find(item => item.get('dt').text() === label);
  expect(group, `field ${label}`).toBeDefined();
  return group!.get('dd');
}

for (const width of [320, 767, 768, 1280]) {
  describe(`AP parity at ${width}px`, () => {
    beforeEach(() => {
      useBreakpoint().width.value = width;
    });

    it('preserves request fields and opens the existing editor only for editable states', async () => {
      const wrapper = await render(PaymentRequestTab);
      const list = rows(wrapper, width);
      expect(list).toHaveLength(requests.length);
      for (const [index, row] of list.entries()) {
        expect(row.text()).toContain(requests[index].request_no);
        expect(field(row, width, labels.paymentRequest.requestDate, 3).text()).toBe('2026-11-15');
        expect(field(row, width, labels.payment.paymentMethod, 5).text()).toBe('bank_transfer');
        expect(field(row, width, labels.paymentRequest.requestAmount, 6).text()).toBe('1,234.56');
        expect(field(row, width, labels.paymentRequest.currencyLabel, 7).text()).toBe('USD');
      }
      for (const index of [0, 1]) {
        await button(list[index], common.edit).trigger('click');
        await flushPromises();
        const dialog = wrapper.findAllComponents(ElDialog)[0];
        expect(dialog.props('modelValue')).toBe(true);
        expect(dialog.props('title')).toBe(labels.paymentRequest.edit);
        expect(dialog.getComponent(ElForm).props('model')).toMatchObject({
          supplier_id: requests[index].supplier_id,
          request_date: requests[index].request_date,
          currency: requests[index].currency,
          request_amount: Number(requests[index].request_amount),
          notes: requests[index].notes,
        });
        await button(dialog, common.cancel).trigger('click');
        expect(dialog.props('modelValue')).toBe(false);
        await flushPromises();
      }
      expect(list[2].findAll('button').map(item => item.text())).not.toContain(common.edit);
      expect(api.createAPPaymentRequest).not.toHaveBeenCalled();
      expect(api.updateAPPaymentRequest).not.toHaveBeenCalled();
    });

    it('preserves payment bank/date/amount fields and their empty values', async () => {
      const wrapper = await render(PaymentTab);
      const list = rows(wrapper, width);
      expect(list).toHaveLength(payments.length);
      expect(field(list[0], width, labels.payment.bankAccount, 6).text()).toBe(
        payments[0].bank_account
      );
      expect(field(list[0], width, common.createTime, 7).text()).toBe(payments[0].created_at);
      expect(field(list[0], width, labels.payment.paymentDate, 2).text()).toBe(
        payments[0].payment_date
      );
      expect(field(list[0], width, labels.payment.paymentAmount, 3).text()).toBe('2,345.67');
      expect(field(list[1], width, labels.payment.bankAccount, 6).text()).toBe('');
      expect(field(list[1], width, common.createTime, 7).text()).toBe('');
      expect(list[1].findAll('button').map(item => item.text())).not.toContain(
        labels.payment.confirm
      );
    });

    it('preserves reconciliation fields and colors only nonzero decimal strings', async () => {
      const wrapper = await render(ReconciliationTab);
      const list = rows(wrapper, width);
      expect(list).toHaveLength(reconciliations.length);
      for (const [index, row] of list.entries()) {
        expect(field(row, width, labels.reconciliation.startDate, 2).text()).toBe(
          reconciliations[index].start_date
        );
        expect(field(row, width, labels.reconciliation.endDate, 3).text()).toBe(
          reconciliations[index].end_date
        );
        expect(field(row, width, labels.reconciliation.invoiceAmount, 4).text()).toBe('3,456.78');
        expect(field(row, width, labels.reconciliation.paymentAmount, 5).text()).toBe('3,456.78');
        const difference = field(row, width, labels.reconciliation.difference, 6);
        expect(difference.text()).toBe(reconciliations[index].difference_amount);
        const colored =
          width < 768
            ? difference.classes().includes('text-red')
            : difference.find('.text-red').exists();
        expect(colored).toBe(index !== 0);
      }
    });

    it.each(['cancel', 'close'])('does not write after confirmation %s', async dismissal => {
      const confirm = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue(dismissal);
      const error = vi.spyOn(ElMessage, 'error');
      const requestWrapper = await render(PaymentRequestTab);
      await button(rows(requestWrapper, width)[0], labels.paymentRequest.submit).trigger('click');
      await flushPromises();
      await button(rows(requestWrapper, width)[0], common.delete).trigger('click');
      await flushPromises();
      const paymentWrapper = await render(PaymentTab);
      await button(rows(paymentWrapper, width)[0], labels.payment.confirm).trigger('click');
      await flushPromises();
      const reconWrapper = await render(ReconciliationTab);
      await button(rows(reconWrapper, width)[0], labels.reconciliation.confirm).trigger('click');
      await flushPromises();
      expect(confirm).toHaveBeenCalledTimes(4);
      expect(api.submitAPPaymentRequest).not.toHaveBeenCalled();
      expect(api.deleteAPPaymentRequest).not.toHaveBeenCalled();
      expect(api.updateAPPayment).not.toHaveBeenCalled();
      expect(api.confirmAPPayment).not.toHaveBeenCalled();
      expect(api.confirmAPReconciliation).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    });
  });
}
