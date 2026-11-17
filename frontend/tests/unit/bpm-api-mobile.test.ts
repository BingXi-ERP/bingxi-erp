import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import ElementPlus, { ElDialog, ElForm, ElMessage, ElMessageBox, ElPagination } from 'element-plus';
import BpmDefinitionTable from '@/views/bpm/definitions/components/BpmDefinitionTable.vue';
import BpmTemplates from '@/views/bpm/templates.vue';
import ApiEndpointTab from '@/views/api-gateway/tabs/ApiEndpointTab.vue';
import FailoverEventList from '@/views/admin/components/FailoverEventList.vue';
import { permission } from '@/directives/permission';
import { PERMISSIONS } from '@/constants/permissions';
import { request } from '@/api/request';
import type { ProcessDefinition, ProcessTemplate } from '@/api/bpm-enhanced';
import type { ApiEndpoint } from '@/api/api-gateway';
import type { FailoverEventDto } from '@/api/failover';
import zhCN from '@/locales/zh-CN';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bpmApi = vi.hoisted(() => ({
  getBpmTemplateById: vi.fn(),
  createBpmFromTemplate: vi.fn(),
  deleteBpmTemplate: vi.fn(),
}));
vi.mock('@/api/bpm-enhanced', () => bpmApi);

const user = vi.hoisted(() => ({ userInfo: { permissions: [] as string[] } }));
vi.mock('@/store/user', () => ({ useUserStore: () => user }));

const widths = [320, 767, 768, 1280] as const;
const phoneWidth =
  'calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))';
const defLabels = zhCN.bpm.definitions.table;
const defStatus = zhCN.bpm.definitions.status;
const defCategory = zhCN.bpm.definitions.category;
const tplLabels = zhCN.bpm.templates;
const epLabels = zhCN.apiGateway.endpointTab;
const fpLabels = zhCN.adminFailover;
const grants = [
  PERMISSIONS.BPM_DEFINITION_UPDATE,
  PERMISSIONS.BPM_DEFINITION_DELETE,
  'api_endpoint:update',
  'api_endpoint:delete',
];

const initialWidth = window.innerWidth;
const wrappers: VueWrapper[] = [];
const hosts: HTMLElement[] = [];
let requestGet: ReturnType<typeof vi.spyOn>;

function definition(id: number, over: Partial<ProcessDefinition> = {}): ProcessDefinition {
  return {
    id,
    code: `CODE-${id}`,
    name: `Definition ${id}`,
    process_key: `process_key_${id}`,
    process_name: `Definition ${id}`,
    status: id === 1 ? 'active' : 'draft',
    category: id === 1 ? 'finance' : 'custom-category',
    version: `v${id}`,
    description: id === 1 ? 'Description one' : '',
    created_at: `2026-11-1${id}T10:00:00Z`,
    updated_at: `2026-11-1${id}T11:00:00Z`,
    ...over,
  };
}
const definitions = [definition(1), definition(2)];

function template(id: number): ProcessTemplate {
  return definition(id, {
    description: id === 1 ? 'Template description' : '',
    nodes: [
      {
        id: id * 10,
        type: 'start_event',
        name: 'Start node',
        assignee_type: 'user',
        assignee_value: 'alice',
      },
    ],
  });
}
const templates = [template(1), template(2)];

function endpoint(id: number): ApiEndpoint {
  return {
    id,
    path: id === 1 ? '/api/v1/erp/sales/very-long-resource-path/with/many/segments' : '/short',
    method: id === 1 ? 'GET' : 'DELETE',
    description: id === 1 ? 'Endpoint description' : '',
    module: 'sales',
    status: id === 1 ? 'active' : 'deprecated',
    rate_limit: id === 1 ? 100 : 0,
    timeout: 30,
    authentication: true,
    authorization: [],
    request_schema: {},
    response_schema: {},
    version: `v${id}`,
    deprecated_at: null,
    sunset_at: null,
    deprecation_note: '',
    created_at: `2026-11-1${id}T08:00:00Z`,
    updated_at: `2026-11-1${id}T09:00:00Z`,
  };
}
const endpoints = [endpoint(1), endpoint(2)];

const RAW_TIME = '2026-11-16T02:00:00Z';
const events: FailoverEventDto[] = [
  {
    id: 1,
    function_name: 'database',
    event_type: 'switch_to_backup',
    from_state: 'primary',
    to_state: 'backup',
    reason: 'primary connection lost',
    latency_ms: 120,
    created_at: RAW_TIME,
  },
  {
    id: 2,
    function_name: 'cache',
    event_type: 'circuit_close',
    from_state: '',
    to_state: '',
    reason: '',
    latency_ms: undefined,
    created_at: RAW_TIME,
  },
];

const methodTypeMap: Record<string, string> = { GET: 'primary', DELETE: 'danger' };
const statusTypeMap: Record<string, string> = {
  active: 'success',
  inactive: 'info',
  deprecated: 'warning',
};

async function resize(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  window.dispatchEvent(new Event('resize'));
  await nextTick();
}

const ElDropdownStub = {
  name: 'ElDropdown',
  template:
    '<div class="el-dropdown"><slot /><div class="el-dropdown__popper"><slot name="dropdown" /></div></div>',
};
const ElDropdownMenuStub = {
  name: 'ElDropdownMenu',
  template: '<ul class="el-dropdown-menu"><slot /></ul>',
};
const ElDropdownItemStub = {
  name: 'ElDropdownItem',
  template: '<li class="el-dropdown-menu__item"><slot /></li>',
};

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
      stubs: {
        teleport: true,
        ElSelect: true,
        ElDropdown: ElDropdownStub,
        ElDropdownMenu: ElDropdownMenuStub,
        ElDropdownItem: ElDropdownItemStub,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function isPhone() {
  return window.innerWidth < 768;
}

function phoneFlag(wrapper: VueWrapper, rootClass: string) {
  expect(wrapper.classes(rootClass), `${rootClass} root`).toBe(true);
  expect(wrapper.classes(`${rootClass}--phone`), `${rootClass}--phone`).toBe(isPhone());
}

function surface(wrapper: VueWrapper, mobileClass: string, desktopSelector: string) {
  const phone = isPhone();
  expect(wrapper.find(`.${mobileClass}`).exists(), `${mobileClass} surface`).toBe(phone);
  expect(wrapper.find(desktopSelector).exists(), `desktop ${desktopSelector} surface`).toBe(!phone);
  return phone
    ? wrapper.findAll(`.${mobileClass} .card-item`)
    : wrapper.findAll('.el-table__body-wrapper .el-table__row');
}

function cardField(row: DOMWrapper<Element>, label: string) {
  const group = row.findAll('.card-fields > div').find(item => item.get('dt').text() === label);
  expect(group, `card field ${label}`).toBeDefined();
  return group!.get('dd');
}

function buttonIn(container: DOMWrapper<Element> | VueWrapper, label: string) {
  const buttons = container.findAll('button').filter(button => button.text() === label);
  expect(buttons.length, `button ${label}`).toBe(1);
  return buttons[0];
}

function actionLabels(container: DOMWrapper<Element> | VueWrapper) {
  return container.findAll('button').map(button => button.text());
}

function clickableByText(container: DOMWrapper<Element>, text: string) {
  const nodes = container.findAll('button, li').filter(node => node.text() === text);
  expect(nodes.length, `action ${text}`).toBeGreaterThan(0);
  return nodes[0];
}

function dialogByTitle(wrapper: VueWrapper, title: string): VueWrapper {
  const dialog = wrapper.findAllComponents(ElDialog).find(item => item.props('title') === title);
  expect(dialog, `dialog ${title}`).toBeDefined();
  return dialog as VueWrapper;
}

function source(relative: string) {
  return readFileSync(resolve(process.cwd(), relative), 'utf8').replace(/\r\n/g, '\n');
}

function setTemplateResponse(data: ProcessTemplate[] = templates) {
  requestGet.mockImplementation(async () => ({
    data: { items: data, total: data.length, page: 1, page_size: 12 },
  }));
}

async function mountTemplates(data: ProcessTemplate[] = templates) {
  setTemplateResponse(data);
  bpmApi.getBpmTemplateById.mockImplementation(async (id: number) => ({
    code: 200,
    data: data.find(item => item.id === id) ?? data[0],
  }));
  const wrapper = render(BpmTemplates);
  await flushPromises();
  return wrapper;
}

function definitionProps(data: ProcessDefinition[] = definitions) {
  return {
    props: {
      data,
      total: data.length,
      loading: false,
      page: 1,
      pageSize: 10,
    },
  };
}

function endpointProps(data: ApiEndpoint[] = endpoints) {
  return {
    props: {
      endpoints: data,
      loading: false,
      total: data.length,
      page: 1,
      pageSize: 10,
      queryParams: { keyword: '', method: '', status: '' },
      methodTypeMap,
      statusTypeMap,
      statusMap: { active: 'active', inactive: 'inactive', deprecated: 'deprecated' },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  user.userInfo.permissions = [...grants];
  requestGet = vi.spyOn(request, 'get');
  setTemplateResponse();
  bpmApi.getBpmTemplateById.mockImplementation(async (id: number) => ({
    code: 200,
    data: templates.find(item => item.id === id) ?? templates[0],
  }));
  bpmApi.createBpmFromTemplate.mockResolvedValue({ code: 200, data: null });
  bpmApi.deleteBpmTemplate.mockResolvedValue({ code: 200, data: null });
});

afterEach(async () => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const host of hosts.splice(0)) host.remove();
  ElMessageBox.close();
  ElMessage.closeAll();
  vi.restoreAllMocks();
  await resize(initialWidth);
});

for (const width of widths) {
  describe(`BPM / API / admin at ${width}px`, () => {
    beforeEach(async () => {
      await resize(width);
    });

    it('BpmDefinitionTable keeps all fields, status labels, four emits and controlled pagination', async () => {
      const wrapper = render(BpmDefinitionTable, definitionProps());
      await nextTick();
      await flushPromises();
      phoneFlag(wrapper, 'bpm-definition-table');
      const rows = surface(wrapper, 'bpm-definition-mobile', '.el-table');
      expect(rows).toHaveLength(2);
      const labels = [
        defLabels.processKey,
        defLabels.processName,
        defLabels.category,
        defLabels.version,
        defLabels.status,
        defLabels.description,
        defLabels.createdAt,
      ];
      for (const [rowIndex, row] of rows.entries()) {
        const item = definitions[rowIndex];
        const status = item.status === 'active' ? defStatus.active : defStatus.draft;
        const category = item.category === 'finance' ? defCategory.finance : 'custom-category';
        if (isPhone()) {
          expect(cardField(row, labels[0]).text()).toBe(item.process_key);
          expect(cardField(row, labels[1]).text()).toBe(item.process_name);
          expect(cardField(row, labels[2]).text()).toBe(category);
          expect(cardField(row, labels[3]).text()).toBe(item.version);
          expect(cardField(row, labels[4]).text()).toBe(status);
          expect(cardField(row, labels[5]).text()).toBe(item.description ?? '');
          expect(cardField(row, labels[6]).text()).toBe(item.created_at);
        } else {
          const cells = row
            .findAll('td .cell')
            .slice(0, 7)
            .map(cell => cell.text());
          expect(cells).toEqual([
            item.process_key,
            item.process_name,
            category,
            item.version,
            status,
            item.description ?? '',
            item.created_at,
          ]);
        }
        expect(actionLabels(row)).toEqual([
          defLabels.edit,
          defLabels.versions,
          defLabels.saveAsTemplate,
          defLabels.delete,
        ]);
        await buttonIn(row, defLabels.edit).trigger('click');
        await buttonIn(row, defLabels.versions).trigger('click');
        await buttonIn(row, defLabels.saveAsTemplate).trigger('click');
        await buttonIn(row, defLabels.delete).trigger('click');
      }
      for (const event of ['edit', 'versions', 'save-as-template', 'delete']) {
        expect(wrapper.emitted(event)).toEqual([[definitions[0]], [definitions[1]]]);
      }
      const pagination = wrapper.getComponent(ElPagination);
      expect(pagination.props('currentPage')).toBe(1);
      expect(pagination.props('pageSize')).toBe(10);
      expect(pagination.props('total')).toBe(2);
      pagination.vm.$emit('update:current-page', 2);
      pagination.vm.$emit('update:page-size', 20);
      await nextTick();
      expect(wrapper.emitted('update:page')).toEqual([[2]]);
      expect(wrapper.emitted('update:page-size')).toEqual([[20]]);
    });

    it('Bpm templates keeps card fields, dialogs and mobile pagination', async () => {
      const wrapper = await mountTemplates();
      phoneFlag(wrapper, 'bpm-templates-page');
      const phone = isPhone();
      expect(wrapper.find('.bpm-templates-mobile').exists()).toBe(phone);
      expect(wrapper.findAll('.template-col')).toHaveLength(phone ? 0 : 2);
      const cards = phone
        ? wrapper.findAll('.bpm-templates-mobile .card-item')
        : wrapper.findAll('.template-card');
      expect(cards).toHaveLength(2);
      const detailTitle = tplLabels.detailDialog.title;
      const createTitle = tplLabels.createDialog.title;
      for (const [index, card] of cards.entries()) {
        const item = templates[index];
        const description = item.description || tplLabels.card.noDescription;
        if (phone) {
          expect(cardField(card, tplLabels.detailDialog.templateName).text()).toBe(
            item.process_name
          );
          expect(cardField(card, tplLabels.detailDialog.templateKey).text()).toBe(item.code);
          expect(cardField(card, tplLabels.detailDialog.createdAt).text()).toBe(item.created_at);
          expect(cardField(card, tplLabels.detailDialog.description).text()).toBe(description);
          expect(cardField(card, defLabels.version).text()).toBe(`v${item.version || '1'}`);
        } else {
          expect(card.get('.template-name').text()).toBe(item.process_name);
          expect(card.get('.template-desc').text()).toBe(description);
          expect(card.get('.template-time').text()).toBe(item.created_at);
          expect(card.get('.template-meta').text()).toContain(`v${item.version || '1'}`);
        }
        expect(
          card
            .findAll('button')
            .map(button => button.text())
            .includes(tplLabels.card.useThisTemplate)
        ).toBe(!phone);
      }
      const pagination = wrapper.getComponent(ElPagination);
      expect(pagination.props('layout')).toBe(
        phone ? 'total, sizes, prev, next' : 'total, sizes, prev, pager, next'
      );
      pagination.vm.$emit('size-change', 16);
      await nextTick();
      expect(pagination.props('pageSize')).toBe(16);
      expect(pagination.props('currentPage')).toBe(1);
      pagination.vm.$emit('current-change', 2);
      await nextTick();
      expect(pagination.props('currentPage')).toBe(2);

      const viewButton = clickableByText(cards[0], tplLabels.card.viewDetail);
      await viewButton.trigger('click');
      await flushPromises();
      const detail = dialogByTitle(wrapper, detailTitle);
      expect(detail.props('modelValue')).toBe(true);
      expect(detail.props('width')).toBe(phone ? phoneWidth : '700px');
      expect(
        wrapper.get('.bpm-template-detail-dialog').classes('bpm-template-detail-dialog--phone')
      ).toBe(phone);
      expect(detail.text()).toContain('Start node');
      expect(detail.text()).toContain(tplLabels.nodeType.startEvent);
      await buttonIn(detail, tplLabels.detailDialog.close).trigger('click');

      const createButton = clickableByText(cards[0], tplLabels.card.createFromTemplate);
      await createButton.trigger('click');
      await nextTick();
      const createDialog = dialogByTitle(wrapper, createTitle);
      expect(createDialog.props('modelValue')).toBe(true);
      expect(createDialog.props('width')).toBe(phone ? phoneWidth : '500px');
      expect(
        wrapper.get('.bpm-template-create-dialog').classes('bpm-template-create-dialog--phone')
      ).toBe(phone);
      expect(createDialog.getComponent(ElForm).props('labelPosition')).toBe(
        phone ? 'top' : 'right'
      );
      const inputs = createDialog.findAll('input');
      expect(inputs[0].element.value).toBe(templates[0].code);
      expect(inputs[1].element.value).toBe(templates[0].process_name);
    });

    it('ApiEndpointTab keeps method/status tags, long URLs and guarded emits', async () => {
      const wrapper = render(ApiEndpointTab, endpointProps());
      await nextTick();
      await flushPromises();
      phoneFlag(wrapper, 'api-endpoint-tab');
      const rows = surface(wrapper, 'api-endpoint-mobile', '.el-table');
      expect(rows).toHaveLength(2);
      for (const [index, row] of rows.entries()) {
        const item = endpoints[index];
        const status = item.status === 'active' ? epLabels.statusActive : epLabels.statusDeprecated;
        if (isPhone()) {
          expect(cardField(row, epLabels.columnPath).text()).toBe(item.path);
          expect(cardField(row, epLabels.columnMethod).text()).toBe(item.method);
          expect(cardField(row, epLabels.columnDescription).text()).toBe(item.description);
          expect(cardField(row, epLabels.columnVersion).text()).toBe(item.version);
          expect(cardField(row, epLabels.columnRateLimit).text()).toBe(String(item.rate_limit));
          expect(cardField(row, epLabels.columnStatus).text()).toBe(status);
          expect(cardField(row, epLabels.columnPath).classes('api-endpoint-long-text')).toBe(true);
          expect(cardField(row, epLabels.columnMethod).classes('api-endpoint-long-text')).toBe(
            true
          );
        } else {
          const cells = row
            .findAll('td .cell')
            .slice(0, 6)
            .map(cell => cell.text());
          expect(cells).toEqual([
            item.path,
            item.method,
            item.description,
            item.version,
            String(item.rate_limit),
            status,
          ]);
        }
        expect(actionLabels(row)).toEqual([epLabels.edit, epLabels.delete]);
        await buttonIn(row, epLabels.edit).trigger('click');
        await buttonIn(row, epLabels.delete).trigger('click');
      }
      expect(wrapper.emitted('edit-endpoint')).toEqual([[endpoints[0]], [endpoints[1]]]);
      expect(wrapper.emitted('delete-endpoint')).toEqual([[endpoints[0]], [endpoints[1]]]);
      const pagination = wrapper.getComponent(ElPagination);
      expect(pagination.props('layout')).toBe('total, sizes, prev, pager, next, jumper');
      pagination.vm.$emit('current-change', 2);
      pagination.vm.$emit('size-change', 20);
      await nextTick();
      expect(wrapper.emitted('update:page')).toEqual([[2]]);
      expect(wrapper.emitted('update:page-size')).toEqual([[20]]);
    });

    it('FailoverEventList is read-only and keeps every field and the time format', async () => {
      const wrapper = render(FailoverEventList, { props: { events, loading: false } });
      await nextTick();
      await flushPromises();
      phoneFlag(wrapper, 'failover-event-list');
      const rows = surface(wrapper, 'failover-event-mobile', '.el-table');
      expect(rows).toHaveLength(2);
      await flushPromises();
      const formattedTime = new Date(RAW_TIME).toLocaleString('zh-CN');
      expect(formattedTime).not.toBe(RAW_TIME);
      const expectations = [
        {
          time: formattedTime,
          func: fpLabels.funcDatabase,
          event: fpLabels.eventSwitchToBackup,
          state: 'primary → backup',
          reason: 'primary connection lost',
          latency: '120',
        },
        {
          time: formattedTime,
          func: fpLabels.funcCache,
          event: fpLabels.eventCircuitClose,
          state: '-',
          reason: '-',
          latency: '-',
        },
      ];
      for (const [index, row] of rows.entries()) {
        const expected = expectations[index];
        if (isPhone()) {
          expect(cardField(row, fpLabels.colTime).text()).toBe(expected.time);
          expect(cardField(row, fpLabels.colFunction).text()).toBe(expected.func);
          expect(cardField(row, fpLabels.colEventType).text()).toBe(expected.event);
          expect(cardField(row, fpLabels.colStateChange).text()).toBe(expected.state);
          expect(cardField(row, fpLabels.colReason).text()).toBe(expected.reason);
          expect(cardField(row, fpLabels.colLatency).text()).toBe(expected.latency);
        } else {
          const cells = row.findAll('td .cell').map(cell => cell.text());
          expect(cells).toEqual([
            expected.time,
            expected.func,
            expected.event,
            expected.state,
            expected.reason,
            expected.latency,
          ]);
        }
        expect(row.findAll('button')).toHaveLength(0);
      }
    });
  });
}

describe('empty data and surface exclusivity', () => {
  it.each(widths)('shows the same empty semantics at %ipx', async width => {
    await resize(width);
    const table = render(BpmDefinitionTable, definitionProps([]));
    await nextTick();
    expect(table.find('.bpm-definition-mobile').exists()).toBe(isPhone());
    if (isPhone()) {
      expect(table.find('.bpm-definition-mobile .el-empty').text()).toContain(
        zhCN.components.v2Table.empty
      );
    } else {
      expect(table.get('.el-table__empty-text').text()).toBeTruthy();
    }

    const tpl = await mountTemplates([]);
    expect(tpl.find('.bpm-templates-mobile').exists()).toBe(isPhone());
    expect(tpl.get('.el-empty').text()).toContain(tplLabels.empty);
    expect(tpl.find('.pagination-wrapper').exists()).toBe(false);

    const api = render(ApiEndpointTab, endpointProps([]));
    await nextTick();
    expect(api.find('.api-endpoint-mobile').exists()).toBe(isPhone());
    if (isPhone()) {
      expect(api.find('.api-endpoint-mobile .el-empty').text()).toContain(
        zhCN.components.v2Table.empty
      );
    } else {
      expect(api.get('.el-table__empty-text').text()).toBeTruthy();
    }

    const failover = render(FailoverEventList, { props: { events: [], loading: false } });
    await nextTick();
    expect(failover.find('.failover-event-mobile').exists()).toBe(isPhone());
    if (isPhone()) {
      expect(failover.find('.failover-event-mobile .el-empty').text()).toContain(
        fpLabels.emptyEvents
      );
    } else {
      expect(failover.get('.el-table__empty-text').text()).toBe(fpLabels.emptyEvents);
    }
  });
});

describe('permission directive stays authoritative on both surfaces', () => {
  it('removes only the guarded actions when grants are revoked', async () => {
    await resize(320);
    user.userInfo.permissions = [];
    const table = render(BpmDefinitionTable, definitionProps());
    const api = render(ApiEndpointTab, endpointProps());
    await nextTick();
    expect(actionLabels(table.get('.bpm-definition-mobile .card-item'))).toEqual([
      defLabels.versions,
      defLabels.saveAsTemplate,
    ]);
    expect(actionLabels(api.get('.api-endpoint-mobile .card-item'))).toEqual([]);
    user.userInfo.permissions = [...grants];
  });
});

describe('responsive layout contracts in source', () => {
  it('uses two-column 44px actions and word wrapping on every surface', () => {
    const views = [
      'src/views/bpm/definitions/components/BpmDefinitionTable.vue',
      'src/views/bpm/templates.vue',
      'src/views/api-gateway/tabs/ApiEndpointTab.vue',
      'src/views/admin/components/FailoverEventList.vue',
    ];
    for (const file of views) {
      const text = source(file);
      expect(text, `${file} two columns`).toContain('repeat(2, minmax(0, 1fr))');
      expect(text, `${file} long text`).toContain('overflow-wrap: anywhere');
      expect(text, `${file} phone breakpoint`).toContain('width.value < 768');
    }
    for (const file of views.slice(0, 3)) {
      const text = source(file);
      expect(text, `${file} touch target`).toContain('min-height: 44px');
      expect(text, `${file} touch target`).toContain('min-width: 44px');
    }
    const endpointSource = source('src/views/api-gateway/tabs/ApiEndpointTab.vue');
    expect(endpointSource).toContain('api-endpoint-long-text');
  });

  it('keeps template dialogs within the viewport with top labels and scrolling body', () => {
    const text = source('src/views/bpm/templates.vue');
    expect(text).toContain('100dvh');
    expect(text).toContain('env(safe-area-inset');
    expect(text).toContain(":label-position=\"isPhone ? 'top' : 'right'\"");
    expect(text).toContain("'total, sizes, prev, next'");
    expect(text).toContain('overflow-y: auto');
    for (const dialog of ['bpm-template-detail-dialog', 'bpm-template-create-dialog']) {
      expect(text).toContain(dialog);
      expect(text).toContain(`${dialog}--phone`);
    }
  });
});
