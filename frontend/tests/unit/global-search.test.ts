import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import GlobalSearch from '@/components/Layout/GlobalSearch.vue';
import { searchCustomers, searchProducts, searchSalesOrders } from '@/api/search';
import zhCN from '@/locales/zh-CN';

const { get, push, logError, logInfo } = vi.hoisted(() => ({
  get: vi.fn<(url: string, config?: unknown) => Promise<unknown>>(),
  push: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));
vi.mock('@/api/request', () => ({ request: { get } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/utils/logger', () => ({ logger: { error: logError, info: logInfo } }));

function customer() {
  return {
    id: Math.floor(Math.random() * 1000000) + 1,
    code: randomUUID(),
    name: `Customer-${randomUUID()}`,
    contact_person: null,
    phone: null,
    email: null,
    address: null,
    tier: 'A',
  };
}

function fixtures() {
  const cu = customer();
  const pr = {
    id: cu.id + 1,
    code: randomUUID(),
    name: `Product-${randomUUID()}`,
    category: null,
    spec: null,
    unit: 'm',
    color_no: null,
    pantone_code: null,
    price: 12.5,
  };
  const so = {
    order_no: `SO-${randomUUID()}`,
    customer_id: cu.id,
    customer_name: cu.name,
    total_amount: 25,
    status: 'draft',
    created_at: new Date().toISOString(),
    items: [],
  };
  return { cu, pr, so };
}

function envelope<T>(hits: T[]) {
  return { code: 200, message: 'success', data: { total: hits.length, took_ms: 1, hits } };
}

function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ComponentStub = defineComponent({
  name: 'ComponentStub',
  props: {
    remoteMethod: Function,
    loading: Boolean,
    modelValue: String,
    value: String,
    label: String,
    description: String,
  },
  emits: ['change', 'update:modelValue'],
  setup(props, { slots }) {
    return () => {
      if (props.description) return h('div', { class: 'empty-stub' }, props.description);
      if (props.value) {
        return h(
          'div',
          { class: 'option-stub', 'data-value': props.value, 'data-label': props.label },
          slots.default?.()
        );
      }
      if (props.label) return h('div', { class: 'option-group-stub' }, slots.default?.());
      return h('div', { class: 'select-stub' }, [slots.default?.(), slots.empty?.()]);
    };
  },
});

const wrappers: ReturnType<typeof mountSearch>[] = [];
function mountSearch() {
  return mount(GlobalSearch, {
    global: {
      stubs: {
        'el-select': ComponentStub,
        'el-option': ComponentStub,
        'el-option-group': ComponentStub,
        'el-empty': ComponentStub,
      },
    },
  });
}
function renderSearch() {
  const wrapper = mountSearch();
  wrappers.push(wrapper);
  return wrapper;
}
function query(wrapper: ReturnType<typeof mountSearch>, keyword: string) {
  const remoteMethod = wrapper.getComponent('.select-stub').props('remoteMethod');
  if (!remoteMethod) throw new Error('Search remote method is not connected');
  remoteMethod(keyword);
}
function values(wrapper: ReturnType<typeof mountSearch>) {
  return wrapper.findAll('.option-stub').map(option => option.attributes('data-value'));
}

beforeEach(() => {
  vi.resetAllMocks();
  get.mockResolvedValue(envelope([]));
});
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

const searches = [
  { search: searchSalesOrders, path: '/search/sales-orders', fixture: () => fixtures().so },
  { search: searchCustomers, path: '/search/customers', fixture: () => fixtures().cu },
  { search: searchProducts, path: '/search/products', fixture: () => fixtures().pr },
];
const invalidResponses = [
  { label: 'missing data', response: { code: 200 } },
  { label: 'null data', response: { code: 200, data: null } },
  { label: 'missing hits', response: { code: 200, data: { total: 0, took_ms: 1 } } },
  { label: 'null hits', response: { code: 200, data: { hits: null } } },
  { label: 'non-array hits', response: { code: 200, data: { hits: {} } } },
];

describe('search API response boundary', () => {
  for (const { search, path, fixture } of searches) {
    it(`${path} unwraps data and preserves query parameters`, async () => {
      const response = envelope([fixture()]);
      const keyword = randomUUID();
      get.mockResolvedValue(response);
      await expect(search(keyword, { from: 0, size: 5 })).resolves.toEqual(response.data);
      expect(get).toHaveBeenCalledWith(path, { params: { q: keyword, from: 0, size: 5 } });
    });
    it.each(invalidResponses)(`${path} rejects $label`, async ({ response }) => {
      get.mockResolvedValue(response);
      await expect(search(randomUUID())).rejects.toThrow();
    });
  }
});

describe('GlobalSearch with real API wrappers', () => {
  it('renders hits from all three ApiResponse.data payloads', async () => {
    const { so, cu, pr } = fixtures();
    get.mockImplementation(async url => {
      if (url === '/search/sales-orders') return envelope([so]);
      if (url === '/search/customers') return envelope([cu]);
      if (url === '/search/products') return envelope([pr]);
      throw new Error('Unexpected search endpoint');
    });
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    await flushPromises();
    expect(values(wrapper)).toEqual([
      `sales-order:${so.order_no}`,
      `customer:${cu.id}`,
      `product:${pr.id}`,
    ]);
    expect(wrapper.findAll('.option-stub').map(option => option.attributes('data-label'))).toEqual([
      so.order_no,
      cu.name,
      pr.name,
    ]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows no results only after valid empty responses', async () => {
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    await flushPromises();
    expect(wrapper.get('.empty-stub').text()).toBe(zhCN.layout.search.noResult);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it.each(invalidResponses)('shows an error, not no results, for $label', async ({ response }) => {
    get.mockResolvedValue(response);
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe(zhCN.layout.search.failed);
    expect(wrapper.find('.empty-stub').exists()).toBe(false);
    expect(logError).toHaveBeenCalled();
  });

  it.each([false, true])(
    'keeps failures visible with partial success=%s and logs no PII',
    async partial => {
      const cu = customer();
      const keyword = randomUUID();
      get.mockImplementation(async url => {
        if (partial && url === '/search/customers') return envelope([cu]);
        throw new Error(`${keyword} ${JSON.stringify(cu)}`);
      });
      const wrapper = renderSearch();
      query(wrapper, keyword);
      await flushPromises();
      expect(wrapper.get('[role="alert"]').text()).toBe(
        partial ? zhCN.layout.search.partialFailure : zhCN.layout.search.failed
      );
      expect(wrapper.find('.empty-stub').exists()).toBe(false);
      expect(values(wrapper)).toEqual(partial ? [`customer:${cu.id}`] : []);
      expect(logError).toHaveBeenCalled();
      const logs = JSON.stringify([...logError.mock.calls, ...logInfo.mock.calls]);
      for (const sensitive of [keyword, cu.name, cu.code]) expect(logs).not.toContain(sensitive);
      expect(wrapper.getComponent('.select-stub').props('loading')).toBe(false);
    }
  );

  it('does not let late old hits or failures overwrite newer results', async () => {
    const pending = [deferred(), deferred(), deferred()];
    for (const item of pending) get.mockImplementationOnce(() => item.promise);
    const cu = customer();
    get.mockImplementation(async url => envelope(url === '/search/customers' ? [cu] : []));
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    query(wrapper, randomUUID());
    await flushPromises();
    expect(values(wrapper)).toEqual([`customer:${cu.id}`]);
    pending[0].reject(new Error(randomUUID()));
    pending[1].resolve(envelope([customer()]));
    pending[2].resolve(envelope([]));
    await flushPromises();
    expect(values(wrapper)).toEqual([`customer:${cu.id}`]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.getComponent('.select-stub').props('loading')).toBe(false);
  });

  it.each(['', 'a', '  '])('invalidates pending requests after query becomes %j', async keyword => {
    const pending = deferred();
    get.mockReturnValue(pending.promise);
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    await flushPromises();
    expect(wrapper.getComponent('.select-stub').props('loading')).toBe(true);
    query(wrapper, keyword);
    await flushPromises();
    expect(wrapper.getComponent('.select-stub').props('loading')).toBe(false);
    pending.resolve(envelope([customer()]));
    await flushPromises();
    expect(values(wrapper)).toEqual([]);
    expect(wrapper.find('.empty-stub').exists()).toBe(false);
    expect(wrapper.text()).toContain(zhCN.layout.search.hint);
  });

  it('does not clear the newer loading state when an older request settles', async () => {
    const old = deferred();
    const current = deferred();
    for (let i = 0; i < 3; i++) get.mockReturnValueOnce(old.promise);
    get.mockReturnValue(current.promise);
    const wrapper = renderSearch();
    query(wrapper, randomUUID());
    query(wrapper, randomUUID());
    old.resolve(envelope([]));
    await flushPromises();
    expect(wrapper.getComponent('.select-stub').props('loading')).toBe(true);
    current.resolve(envelope([]));
    await flushPromises();
    expect(wrapper.getComponent('.select-stub').props('loading')).toBe(false);
  });

  it.each([
    { value: 'sales-order:SO-123', route: { path: '/sales', query: { order_no: 'SO-123' } } },
    { value: 'customer:123', route: { path: '/customer', query: { id: '123' } } },
    { value: 'product:456', route: { path: '/product', query: { id: '456' } } },
  ])('emits select and preserves navigation for $value', ({ value, route }) => {
    const wrapper = renderSearch();
    wrapper.getComponent('.select-stub').vm.$emit('change', value);
    expect(wrapper.emitted('select')).toEqual([[]]);
    expect(push).toHaveBeenCalledWith(route);
  });
});
