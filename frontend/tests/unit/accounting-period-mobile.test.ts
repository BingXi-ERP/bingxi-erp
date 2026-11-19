import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, {
  ElDialog,
  ElForm,
  ElMessage,
  ElMessageBox,
  ElTable,
  ElTableColumn,
} from 'element-plus';
import PeriodListTab from '@/views/accounting-period/tabs/PeriodListTab.vue';
import * as api from '@/api/accounting-period';
import type { AccountingPeriodDetail } from '@/api/accounting-period';
import zhCN from '@/locales/zh-CN';

vi.mock('@/api/accounting-period', () => ({
  getAccountingPeriodList: vi.fn(),
  createAccountingPeriod: vi.fn(),
  updateAccountingPeriod: vi.fn(),
  deleteAccountingPeriod: vi.fn(),
  closePeriod: vi.fn(),
  reopenPeriod: vi.fn(),
}));

const labels = zhCN.accountingPeriod;
const initialWidth = window.innerWidth;
const wrappers: ReturnType<typeof mountPeriods>[] = [];
const hosts: HTMLElement[] = [];
const writes = [
  api.createAccountingPeriod,
  api.updateAccountingPeriod,
  api.deleteAccountingPeriod,
  api.closePeriod,
  api.reopenPeriod,
];

function period(status: 'OPEN' | 'CLOSING' | 'CLOSED', index = 1): AccountingPeriodDetail {
  const year = new Date().getFullYear();
  return {
    id: index,
    year,
    period: index,
    period_name: `Accounting-period-${status}-${'long-name-'.repeat(12)}`,
    start_date: `${year}-${String(index).padStart(2, '0')}-01`,
    end_date: `${year}-${String(index).padStart(2, '0')}-28`,
    status,
    closed_at: status === 'CLOSED' ? `${year}-04-02T09:00:00Z` : null,
    closed_by: status === 'CLOSED' ? 7 : null,
    created_at: `${year}-01-01T00:00:00Z`,
  };
}

async function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  await nextTick();
}

function mountPeriods() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(PeriodListTab, {
    attachTo: host,
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonIn(container: DOMWrapper<Element>, label: string) {
  const buttons = container.findAll('button').filter(button => button.text() === label);
  expect(buttons).toHaveLength(1);
  return buttons[0];
}

function messageBox() {
  const boxes = document.querySelectorAll('.el-message-box');
  expect(boxes.length).toBeGreaterThan(0);
  return new DOMWrapper(boxes[boxes.length - 1]);
}

function expectNoWrites() {
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getAccountingPeriodList).mockResolvedValue({ code: 200, data: [] });
  for (const write of writes) vi.mocked(write).mockResolvedValue({ code: 200, data: null });
});

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  ElMessageBox.close();
  ElMessage.closeAll();
  await flushPromises();
  await resize(initialWidth);
});

describe('Accounting period responsive presentation', () => {
  it.each([320, 767, 768, 1280])(
    'preserves seven fields and the status action matrix at %ipx',
    async width => {
      await resize(width);
      const periods = [period('OPEN'), period('CLOSING', 2), period('CLOSED', 3)];
      vi.mocked(api.getAccountingPeriodList).mockResolvedValue({ code: 200, data: periods });
      const wrapper = mountPeriods();
      await flushPromises();

      const phone = width < 768;
      expect(wrapper.classes('period-list-tab--phone')).toBe(phone);
      expect(wrapper.findAllComponents(ElTable)).toHaveLength(1);
      const table = wrapper.getComponent(ElTable);
      expect(table.props('scrollbarTabindex')).toBe(phone ? 0 : undefined);
      expect(table.props('scrollbarAlwaysOn')).toBe(phone);
      expect(table.attributes('aria-label')).toBe(labels.table.ariaLabel);
      expect(table.attributes('role')).toBe(phone ? 'region' : undefined);
      const columns = wrapper.findAllComponents(ElTableColumn);
      expect(columns.map(column => column.props('prop'))).toEqual([
        'period_name',
        'year',
        'period',
        'start_date',
        'end_date',
        'status',
        'closed_at',
        undefined,
      ]);
      expect(columns[7].props('fixed')).toBe(phone ? false : 'right');
      expect(columns.map(column => column.props('width'))).toEqual([
        '160',
        '80',
        '80',
        '160',
        '160',
        '100',
        '180',
        '200',
      ]);
      const rows = wrapper.findAll('.el-table__body .el-table__row');
      expect(rows).toHaveLength(3);
      const statuses = [labels.status.open, labels.status.closing, labels.status.closed];
      const actions = [
        [labels.table.edit, labels.table.close, labels.table.delete],
        [labels.table.edit, labels.table.delete],
        [labels.table.edit, labels.table.reopen],
      ];
      for (const [index, row] of rows.entries()) {
        const item = periods[index];
        const cells = row.findAll('td .cell');
        expect(cells.slice(0, 7).map(cell => cell.text())).toEqual([
          item.period_name,
          String(item.year),
          String(item.period),
          item.start_date,
          item.end_date,
          statuses[index],
          item.closed_at ? item.closed_at.slice(0, 10) : '-',
        ]);
        expect(row.findAll('button').map(button => button.text())).toEqual(actions[index]);
        await buttonIn(row, labels.table.edit).trigger('click');
        await flushPromises();
        const dialog = wrapper.getComponent(ElDialog);
        expect(dialog.props('modelValue')).toBe(true);
        expect(dialog.props('width')).toBe(
          phone
            ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
            : '500px'
        );
        expect(wrapper.get('.period-dialog').classes('period-dialog--phone')).toBe(phone);
        expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(phone ? 'top' : 'right');
        expect(dialog.get('input').element.value).toBe(item.period_name);
        await buttonIn(wrapper.get('.el-dialog'), labels.dialog.cancel).trigger('click');
      }
      expect(api.getAccountingPeriodList).toHaveBeenCalledTimes(1);
      expectNoWrites();
    }
  );

  it('keeps empty data and a single table across live breakpoint changes', async () => {
    const wrapper = mountPeriods();
    await flushPromises();
    for (const width of [320, 767, 768, 1280, 320]) {
      await resize(width);
      expect(wrapper.classes('period-list-tab--phone')).toBe(width < 768);
      expect(wrapper.findAllComponents(ElTable)).toHaveLength(1);
      expect(wrapper.findAll('.el-table__row')).toHaveLength(0);
      expect(wrapper.get('.el-table__empty-text').text()).not.toBe('');
      const filter = wrapper.getComponent(ElForm);
      expect(filter.props('inline')).toBe(width >= 768);
      expect(filter.props('labelPosition')).toBe(width < 768 ? 'top' : 'right');
    }
    expect(api.getAccountingPeriodList).toHaveBeenCalledTimes(1);
  });

  it('retains entered creation values while resizing an open dialog', async () => {
    await resize(320);
    const wrapper = mountPeriods();
    await flushPromises();
    await buttonIn(wrapper.get('.period-header-actions'), labels.create).trigger('click');
    const dialog = wrapper.getComponent(ElDialog);
    await flushPromises();
    const inputs = dialog.findAll('input');
    expect(inputs).toHaveLength(4);
    await inputs[0].setValue('2028');
    await inputs[1].setValue('2');
    expect(inputs[2].attributes('disabled')).toBeDefined();
    expect(inputs[3].attributes('disabled')).toBeDefined();
    for (const width of [767, 768, 1280, 320]) {
      await resize(width);
      expect(dialog.props('width')).toBe(
        width < 768
          ? 'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))'
          : '500px'
      );
      expect(wrapper.get('.period-dialog').classes('period-dialog--phone')).toBe(width < 768);
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(
        width < 768 ? 'top' : 'right'
      );
      expect(
        dialog
          .findAll('input')
          .map(input => input.element.value)
          .slice(0, 2)
      ).toEqual(['2028', '2']);
    }
    await buttonIn(wrapper.get('.el-dialog'), labels.dialog.confirm).trigger('click');
    await flushPromises();
    expect(api.createAccountingPeriod).toHaveBeenCalledExactlyOnceWith({ year: 2028, period: 2 });
    expect(dialog.props('modelValue')).toBe(false);
  });
});

describe('Accounting period original action wiring', () => {
  it.each([320, 1280])('saves only the edited name at %ipx', async width => {
    await resize(width);
    const item = period('OPEN');
    vi.mocked(api.getAccountingPeriodList).mockResolvedValue({ code: 200, data: [item] });
    const wrapper = mountPeriods();
    await flushPromises();
    await buttonIn(wrapper.get('.el-table__row'), labels.table.edit).trigger('click');
    await flushPromises();
    const dialog = wrapper.getComponent(ElDialog);
    await dialog.get('input').setValue('  Renamed period  ');
    await buttonIn(wrapper.get('.el-dialog'), labels.dialog.confirm).trigger('click');
    await flushPromises();
    expect(api.updateAccountingPeriod).toHaveBeenCalledExactlyOnceWith(item.id, {
      period_name: 'Renamed period',
    });
    expect(api.getAccountingPeriodList).toHaveBeenCalledTimes(2);
  });

  const cases = [
    { status: 'OPEN', label: labels.table.close, write: api.closePeriod },
    { status: 'CLOSING', label: labels.table.delete, write: api.deleteAccountingPeriod },
    { status: 'CLOSED', label: labels.table.reopen, write: api.reopenPeriod },
  ] as const;

  it.each(cases)('cancels $status/$label without a write API call', async ({ status, label }) => {
    await resize(320);
    vi.mocked(api.getAccountingPeriodList).mockResolvedValue({
      code: 200,
      data: [period(status)],
    });
    const wrapper = mountPeriods();
    await flushPromises();
    await buttonIn(wrapper.get('.el-table__row'), label).trigger('click');
    await flushPromises();
    const buttons = messageBox().findAll('.el-message-box__btns button');
    expect(buttons).toHaveLength(2);
    await buttons[0].trigger('click');
    await flushPromises();
    expectNoWrites();
    expect(api.getAccountingPeriodList).toHaveBeenCalledTimes(1);
  });

  it.each(cases)(
    'confirms $status/$label through the original API',
    async ({ status, label, write }) => {
      await resize(320);
      const item = period(status);
      vi.mocked(api.getAccountingPeriodList).mockResolvedValue({ code: 200, data: [item] });
      const wrapper = mountPeriods();
      await flushPromises();
      await buttonIn(wrapper.get('.el-table__row'), label).trigger('click');
      await flushPromises();
      const box = messageBox();
      if (status === 'CLOSED') await box.get('textarea').setValue('  Correct posting  ');
      const buttons = box.findAll('.el-message-box__btns button');
      expect(buttons).toHaveLength(2);
      await buttons[1].trigger('click');
      await flushPromises();
      const args = status === 'CLOSED' ? [item.id, 'Correct posting'] : [item.id];
      expect(write).toHaveBeenCalledExactlyOnceWith(...args);
      for (const other of writes.filter(candidate => candidate !== write)) {
        expect(other).not.toHaveBeenCalled();
      }
      expect(api.getAccountingPeriodList).toHaveBeenCalledTimes(2);
    }
  );

  it('rejects a blank reopening reason without a write', async () => {
    await resize(320);
    vi.mocked(api.getAccountingPeriodList).mockResolvedValue({
      code: 200,
      data: [period('CLOSED')],
    });
    const wrapper = mountPeriods();
    await flushPromises();
    await buttonIn(wrapper.get('.el-table__row'), labels.table.reopen).trigger('click');
    await flushPromises();
    const box = messageBox();
    await box.get('textarea').setValue('   ');
    const buttons = box.findAll('.el-message-box__btns button');
    expect(buttons).toHaveLength(2);
    await buttons[1].trigger('click');
    await flushPromises();
    expect(box.get('.el-message-box__errormsg').text()).toBe(labels.message.reopenReasonRequired);
    expectNoWrites();
    await buttons[0].trigger('click');
    await flushPromises();
  });

  it('cancels year initialization without creating periods', async () => {
    await resize(320);
    const wrapper = mountPeriods();
    await flushPromises();
    await buttonIn(wrapper.get('.period-header-actions'), labels.initYear).trigger('click');
    await flushPromises();
    const buttons = messageBox().findAll('.el-message-box__btns button');
    expect(buttons).toHaveLength(2);
    await buttons[0].trigger('click');
    await flushPromises();
    expectNoWrites();
  });
});
