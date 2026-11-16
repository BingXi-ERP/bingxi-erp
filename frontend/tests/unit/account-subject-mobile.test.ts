import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, {
  ElDialog,
  ElForm,
  ElMessage,
  ElMessageBox,
  ElRadioGroup,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTreeSelect,
} from 'element-plus';
import SubjectListTab from '@/views/account-subject/tabs/SubjectListTab.vue';
import * as api from '@/api/account-subject';
import type { AccountSubjectEntity } from '@/api/account-subject';
import { permission } from '@/directives/permission';
import { PERMISSIONS } from '@/constants/permissions';
import { exportFromBackend } from '@/utils/export';
import zhCN from '@/locales/zh-CN';

vi.mock('@/api/account-subject', () => ({
  getAccountSubjectList: vi.fn(),
  createAccountSubject: vi.fn(),
  updateAccountSubject: vi.fn(),
  deleteAccountSubject: vi.fn(),
}));
vi.mock('@/utils/export', () => ({ exportFromBackend: vi.fn() }));
vi.mock('@/components/Layout/MainLayout.vue', () => ({
  default: { name: 'MainLayoutStub', render: () => null },
}));
const user = vi.hoisted(() => ({ userInfo: { permissions: [] as string[] } }));
vi.mock('@/store/user', () => ({ useUserStore: () => user }));

interface SubjectNode extends AccountSubjectEntity {
  children: SubjectNode[];
}

const labels = zhCN.accountSubject;
const widths = [320, 767, 768, 1280];
const initialWidth = window.innerWidth;
const wrappers: ReturnType<typeof mountSubjects>[] = [];
const hosts: HTMLElement[] = [];
const writes = [api.createAccountSubject, api.updateAccountSubject, api.deleteAccountSubject];
const grants = [PERMISSIONS.SUBJECT_UPDATE, PERMISSIONS.SUBJECT_DELETE, PERMISSIONS.SUBJECT_EXPORT];

function subject(id: number, parent?: SubjectNode): SubjectNode {
  const timestamp = new Date().toISOString();
  return {
    id,
    code: parent ? `${parent.code}01` : String(1000 + id),
    name: `Subject-${id}-${'long-name-'.repeat(8)}`,
    level: parent ? parent.level + 1 : 1,
    parent_id: parent ? parent.id : null,
    full_code: null,
    balance_direction: id % 2 === 0 ? 'debit' : 'credit',
    initial_balance_debit: '0.00',
    initial_balance_credit: '0.00',
    current_period_debit: '0.00',
    current_period_credit: '0.00',
    ending_balance_debit: '0.00',
    ending_balance_credit: '0.00',
    assist_customer: true,
    assist_supplier: false,
    assist_department: false,
    assist_employee: false,
    assist_project: false,
    assist_batch: true,
    assist_color_no: false,
    assist_dye_lot: false,
    assist_grade: false,
    assist_workshop: false,
    enable_dual_unit: true,
    primary_unit: null,
    secondary_unit: null,
    is_cash_account: false,
    is_bank_account: false,
    allow_manual_entry: true,
    require_summary: false,
    status: id % 2 === 0 ? 'active' : 'inactive',
    created_at: timestamp,
    updated_at: timestamp,
    children: [],
  };
}

function subjectTree() {
  const root = subject(1);
  const child = subject(2, root);
  const leaf = subject(3, child);
  root.children.push(child);
  child.children.push(leaf);
  vi.mocked(api.getAccountSubjectList).mockResolvedValue({ code: 200, data: [root] });
  return [root, child, leaf];
}

async function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  await nextTick();
}

function mountSubjects() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const wrapper = mount(SubjectListTab, {
    attachTo: host,
    global: { plugins: [ElementPlus], directives: { permission } },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function buttonIn(container: DOMWrapper<Element>, label: string) {
  const buttons = container.findAll('button').filter(button => button.text() === label);
  expect(buttons).toHaveLength(1);
  return buttons[0];
}

function expectNoWrites() {
  for (const write of writes) expect(write).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  user.userInfo.permissions = [...grants];
  vi.mocked(api.getAccountSubjectList).mockResolvedValue({ code: 200, data: [] });
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

describe('Subject tree responsive presentation', () => {
  it.each(widths)('preserves fields, nested rows and expansion at %ipx', async width => {
    await resize(width);
    const subjects = subjectTree();
    const wrapper = mountSubjects();
    await flushPromises();
    const phone = width < 768;
    expect(wrapper.classes('subject-list-tab--phone')).toBe(phone);
    expect(wrapper.findAllComponents(ElTable)).toHaveLength(1);
    const table = wrapper.getComponent(ElTable);
    expect(table.props('rowKey')).toBe('id');
    expect(table.props('treeProps')).toEqual({ children: 'children' });
    expect(table.props('defaultExpandAll')).toBe(true);
    expect(table.props('scrollbarTabindex')).toBe(phone ? 0 : undefined);
    expect(table.props('scrollbarAlwaysOn')).toBe(phone);
    expect(table.attributes('role')).toBe(phone ? 'region' : undefined);
    expect(table.attributes('aria-label')).toBe(labels.table.ariaLabel);
    expect(table.get('.el-scrollbar__wrap').attributes('tabindex')).toBe(phone ? '0' : undefined);
    const columns = wrapper.findAllComponents(ElTableColumn);
    expect(columns.map(column => column.props('prop'))).toEqual([
      'code',
      'name',
      'balance_direction',
      'level',
      'status',
      undefined,
    ]);
    expect(columns.map(column => column.props('width'))).toEqual([
      '120',
      '',
      '100',
      '80',
      '80',
      '160',
    ]);
    expect(columns[1].props('minWidth')).toBe('200');
    expect(columns[5].props('fixed')).toBe(phone ? false : 'right');
    const filter = wrapper.getComponent(ElForm);
    expect(filter.props('inline')).toBe(!phone);
    expect(filter.props('labelPosition')).toBe(phone ? 'top' : 'right');
    const rows = table.findAll('.el-table__body .el-table__row');
    expect(rows).toHaveLength(3);
    for (const [index, row] of rows.entries()) {
      const item = subjects[index];
      expect(row.isVisible()).toBe(true);
      expect(
        row
          .findAll('td .cell')
          .slice(0, 5)
          .map(cell => cell.text())
      ).toEqual([
        item.code,
        item.name,
        item.balance_direction === 'debit' ? labels.balanceType.debit : labels.balanceType.credit,
        String(item.level),
        item.status === 'active' ? labels.status.enabled : labels.status.disabled,
      ]);
      expect(row.findAll('.subject-actions button').map(button => button.text())).toEqual([
        labels.table.edit,
        labels.table.delete,
      ]);
    }
    const rootToggle = rows[0].get('.el-table__expand-icon');
    expect(rootToggle.attributes('aria-expanded')).toBe('true');
    await rootToggle.trigger('click');
    expect(rootToggle.attributes('aria-expanded')).toBe('false');
    expect(rows[1].isVisible()).toBe(false);
    expect(rows[2].isVisible()).toBe(false);
    await rootToggle.trigger('click');
    expect(rows[1].isVisible()).toBe(true);
    expect(rows[2].isVisible()).toBe(true);
    await rows[1].get('.el-table__expand-icon').trigger('click');
    expect(rows[1].isVisible()).toBe(true);
    expect(rows[2].isVisible()).toBe(false);
    await rows[1].get('.el-table__expand-icon').trigger('click');
    expect(rows[2].isVisible()).toBe(true);
    expect(api.getAccountSubjectList).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it('keeps one mounted tree and collapsed state across live breakpoint changes', async () => {
    subjectTree();
    const wrapper = mountSubjects();
    await flushPromises();
    const table = wrapper.getComponent(ElTable);
    await table.get('.el-table__expand-icon').trigger('click');
    for (const width of [...widths, 320]) {
      await resize(width);
      expect(wrapper.findAllComponents(ElTable)).toHaveLength(1);
      expect(wrapper.getComponent(ElTable).vm).toBe(table.vm);
      expect(table.props('scrollbarTabindex')).toBe(width < 768 ? 0 : undefined);
      expect(wrapper.findAllComponents(ElTableColumn)[5].props('fixed')).toBe(
        width < 768 ? false : 'right'
      );
      expect(table.get('.el-table__expand-icon').attributes('aria-expanded')).toBe('false');
      expect(table.findAll('.el-table__row').filter(row => row.isVisible())).toHaveLength(1);
    }
    expect(api.getAccountSubjectList).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it.each(widths)(
    'opens the full creation form and cancels without writing at %ipx',
    async width => {
      await resize(width);
      subjectTree();
      const wrapper = mountSubjects();
      await flushPromises();
      await buttonIn(wrapper.get('.subject-header-actions'), labels.create).trigger('click');
      await flushPromises();
      const dialog = wrapper.getComponent(ElDialog);
      expect(dialog.props('modelValue')).toBe(true);
      expect(dialog.props('width')).toBe(width < 768 ? 'calc(100vw - 24px)' : '500px');
      expect(wrapper.get('.subject-dialog').classes('subject-dialog--phone')).toBe(width < 768);
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(
        width < 768 ? 'top' : 'right'
      );
      expect(dialog.getComponent(ElTreeSelect).props('checkStrictly')).toBe(true);
      expect(dialog.getComponent(ElTreeSelect).props('popperClass')).toBe(
        width < 768 ? 'subject-parent-popper--phone' : ''
      );
      expect(dialog.getComponent(ElRadioGroup).props('modelValue')).toBe('debit');
      expect(
        dialog.findAllComponents(ElSwitch).map(control => control.props('modelValue'))
      ).toEqual([false, false, false, false, false]);
      const inputs = dialog.findAll<HTMLInputElement>('.el-input__inner');
      expect(inputs).toHaveLength(2);
      await inputs[0].setValue('100101');
      await inputs[1].setValue('Unsaved subject');
      await dialog.findAllComponents(ElSwitch)[0].trigger('click');
      await buttonIn(wrapper.get('.subject-dialog'), labels.dialog.cancel).trigger('click');
      expect(dialog.props('modelValue')).toBe(false);
      expectNoWrites();
    }
  );
});

describe('Subject permissions and original actions', () => {
  it.each(widths)('removes denied edit, delete and export buttons at %ipx', async width => {
    await resize(width);
    subjectTree();
    user.userInfo.permissions = [];
    const wrapper = mountSubjects();
    await flushPromises();
    expect(wrapper.findAll('.el-table__row')).toHaveLength(3);
    expect(wrapper.findAll('.subject-actions button')).toHaveLength(0);
    expect(
      wrapper
        .get('.subject-header-actions')
        .findAll('button')
        .map(button => button.text())
    ).toEqual([labels.create]);
    for (const nextWidth of [1280, 320]) {
      await resize(nextWidth);
      expect(wrapper.findAll('.subject-actions button')).toHaveLength(0);
      expect(
        wrapper.findAll('button').filter(button => button.text() === labels.export)
      ).toHaveLength(0);
    }
    expect(exportFromBackend).not.toHaveBeenCalled();
    expectNoWrites();
  });

  it.each(grants)('retains only the specifically granted %s action', async grant => {
    await resize(320);
    subjectTree();
    user.userInfo.permissions = [grant];
    const wrapper = mountSubjects();
    await flushPromises();
    const cases = [
      [PERMISSIONS.SUBJECT_UPDATE, labels.table.edit, 3],
      [PERMISSIONS.SUBJECT_DELETE, labels.table.delete, 3],
      [PERMISSIONS.SUBJECT_EXPORT, labels.export, 1],
    ] as const;
    for (const [key, label, count] of cases) {
      expect(wrapper.findAll('button').filter(button => button.text() === label)).toHaveLength(
        key === grant ? count : 0
      );
    }
  });

  it('preserves edited child fields and all auxiliary values through resizing and saving', async () => {
    await resize(320);
    const [, , leaf] = subjectTree();
    const wrapper = mountSubjects();
    await flushPromises();
    await buttonIn(wrapper.findAll('.el-table__row')[2], labels.table.edit).trigger('click');
    await flushPromises();
    const dialog = wrapper.getComponent(ElDialog);
    const inputs = dialog.findAll<HTMLInputElement>('.el-input__inner');
    expect(inputs[0].element.value).toBe(leaf.code);
    expect(inputs[0].attributes('disabled')).toBeDefined();
    expect(inputs[1].element.value).toBe(leaf.name);
    expect(dialog.getComponent(ElTreeSelect).props('modelValue')).toBe(leaf.parent_id);
    expect(dialog.getComponent(ElRadioGroup).props('modelValue')).toBe(leaf.balance_direction);
    const switches = dialog.findAllComponents(ElSwitch);
    expect(switches.map(control => control.props('modelValue'))).toEqual([
      true,
      false,
      true,
      false,
      true,
      'inactive',
    ]);
    await inputs[1].setValue('Renamed child');
    await switches[1].trigger('click');
    for (const width of [...widths, 320]) {
      await resize(width);
      expect(wrapper.getComponent(ElDialog).vm).toBe(dialog.vm);
      expect(dialog.props('width')).toBe(width < 768 ? 'calc(100vw - 24px)' : '500px');
      expect(dialog.getComponent(ElForm).props('labelPosition')).toBe(
        width < 768 ? 'top' : 'right'
      );
      expect(inputs[1].element.value).toBe('Renamed child');
      expect(
        dialog.findAllComponents(ElSwitch).map(control => control.props('modelValue'))
      ).toEqual([true, true, true, false, true, 'inactive']);
    }
    await buttonIn(wrapper.get('.subject-dialog'), labels.dialog.confirm).trigger('click');
    await flushPromises();
    expect(api.updateAccountSubject).toHaveBeenCalledExactlyOnceWith(leaf.id, {
      name: 'Renamed child',
      balance_direction: leaf.balance_direction,
      assist_customer: true,
      assist_supplier: true,
      assist_batch: true,
      assist_color_no: false,
      enable_dual_unit: true,
      status: 'inactive',
    });
    expect(dialog.props('modelValue')).toBe(false);
    expect(api.getAccountSubjectList).toHaveBeenCalledTimes(2);
    expect(api.createAccountSubject).not.toHaveBeenCalled();
    expect(api.deleteAccountSubject).not.toHaveBeenCalled();
  });

  it.each([320, 1280])(
    'cancels an edited child without mutating data or writing at %ipx',
    async width => {
      await resize(width);
      const [, , leaf] = subjectTree();
      const original = structuredClone(leaf);
      const wrapper = mountSubjects();
      await flushPromises();
      const row = wrapper.findAll('.el-table__row')[2];
      await buttonIn(row, labels.table.edit).trigger('click');
      await flushPromises();
      const dialog = wrapper.getComponent(ElDialog);
      await dialog.findAll<HTMLInputElement>('.el-input__inner')[1].setValue('Discarded name');
      await dialog.findAllComponents(ElSwitch)[0].trigger('click');
      await buttonIn(wrapper.get('.subject-dialog'), labels.dialog.cancel).trigger('click');
      expect(dialog.props('modelValue')).toBe(false);
      expect(leaf).toEqual(original);
      expectNoWrites();
      await buttonIn(row, labels.table.edit).trigger('click');
      await flushPromises();
      expect(dialog.findAll<HTMLInputElement>('.el-input__inner')[1].element.value).toBe(leaf.name);
      expect(dialog.findAllComponents(ElSwitch)[0].props('modelValue')).toBe(true);
      await buttonIn(wrapper.get('.subject-dialog'), labels.dialog.cancel).trigger('click');
      expectNoWrites();
    }
  );

  it.each([false, true])(
    'handles child deletion confirmation=%s through the original API',
    async confirm => {
      await resize(320);
      const [, , leaf] = subjectTree();
      const wrapper = mountSubjects();
      await flushPromises();
      await buttonIn(wrapper.findAll('.el-table__row')[2], labels.table.delete).trigger('click');
      await flushPromises();
      const boxes = document.querySelectorAll('.el-message-box');
      expect(boxes.length).toBeGreaterThan(0);
      const box = new DOMWrapper(boxes[boxes.length - 1]);
      expect(box.text()).toContain(leaf.name);
      const buttons = box.findAll('.el-message-box__btns button');
      expect(buttons).toHaveLength(2);
      await buttons[confirm ? 1 : 0].trigger('click');
      await flushPromises();
      if (confirm) {
        expect(api.deleteAccountSubject).toHaveBeenCalledExactlyOnceWith(leaf.id);
        expect(api.getAccountSubjectList).toHaveBeenCalledTimes(2);
      } else {
        expectNoWrites();
        expect(api.getAccountSubjectList).toHaveBeenCalledTimes(1);
      }
      expect(api.createAccountSubject).not.toHaveBeenCalled();
      expect(api.updateAccountSubject).not.toHaveBeenCalled();
    }
  );

  it('exports with the existing endpoint and filename', async () => {
    await resize(320);
    const wrapper = mountSubjects();
    await flushPromises();
    await buttonIn(wrapper.get('.subject-header-actions'), labels.export).trigger('click');
    expect(exportFromBackend).toHaveBeenCalledExactlyOnceWith(
      '/subjects/export',
      {},
      labels.exportFile.filename
    );
    expectNoWrites();
  });
});
