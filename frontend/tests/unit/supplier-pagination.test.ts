import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElPagination, ElSelect } from 'element-plus';
import type { SupplierQueryParams } from '@/api/supplier';
import SupplierList from '@/views/supplier/SupplierList.vue';
import SupplierPage from '@/views/supplier/index.vue';
import { useTableApi } from '@/composables/useTableApi';

vi.mock('@/composables/useTableApi', () => ({ useTableApi: vi.fn() }));

enableAutoUnmount(afterEach);

function mountList(queryParams: SupplierQueryParams = {}) {
  return mount(SupplierList, {
    attachTo: document.body,
    props: {
      suppliers: [],
      total: 200,
      loading: false,
      dialogMode: 'list',
      queryParams: {
        page: 1,
        page_size: 20,
        keyword: 'cotton',
        grade: 'A',
        status: 'active',
        is_processor: false,
        ...queryParams,
      },
    },
    global: { plugins: [ElementPlus] },
  });
}

// 仅验证父子分页接线；数据边界不执行请求或分页 watcher，不证明 HTTP 次数。
function mountPage() {
  const table = {
    data: ref([]),
    total: ref(200),
    loading: ref(false),
    page: ref(1),
    pageSize: ref(20),
    queryParams: ref<Record<string, unknown>>({}),
    refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    reset: vi.fn(),
    setQueryParam: vi.fn(),
  };
  vi.mocked(useTableApi).mockReturnValue(table);
  const wrapper = mount(SupplierPage, {
    attachTo: document.body,
    global: {
      plugins: [ElementPlus],
      directives: { permission: {} },
    },
  });
  return { wrapper, table, pagination: wrapper.getComponent(ElPagination) };
}

describe('Supplier page pagination wiring', () => {
  it('renders 20 rows per page and a last page of 10 for total 200', async () => {
    const { wrapper, table, pagination } = mountPage();
    await flushPromises();

    expect(table.pageSize.value).toBe(20);
    expect(wrapper.getComponent(SupplierList).props('queryParams')).toMatchObject({
      page: 1,
      page_size: 20,
    });
    expect(pagination.props('pageSize')).toBe(20);
    expect(pagination.props('total')).toBe(200);
    expect(pagination.get('.el-pager li.number:last-child').text()).toBe('10');
  });

  it('updates the supplied page ref to 2 without resetting it through search', async () => {
    const { wrapper, table, pagination } = mountPage();
    const page = table.page;
    await pagination.get('.el-pager li.number:nth-child(2)').trigger('click');
    await flushPromises();

    expect(page.value).toBe(2);
    expect(pagination.props('currentPage')).toBe(2);
    expect(pagination.get('.el-pager li.is-active').text()).toBe('2');
    expect(wrapper.getComponent(SupplierList).emitted('search')).toBeUndefined();
  });

  it('synchronizes parent page and pageSize refs back to the real pagination', async () => {
    const { table, pagination } = mountPage();
    table.page.value = 3;
    await nextTick();
    expect(pagination.props('currentPage')).toBe(3);
    expect(pagination.get('.el-pager li.is-active').text()).toBe('3');

    table.pageSize.value = 50;
    await flushPromises();
    expect(pagination.props('pageSize')).toBe(50);
    expect(pagination.get('.el-pager li.number:last-child').text()).toBe('4');
    expect(pagination.props('currentPage')).toBe(3);
    expect(table.page.value).toBe(3);
  });
});

describe('SupplierList pagination', () => {
  it('emits page 2 without searching when the second page is clicked', async () => {
    const wrapper = mountList();

    await wrapper.get('.el-pager li.number:nth-child(2)').trigger('click');

    expect(wrapper.emitted('update:queryParams')).toEqual([
      [
        {
          page: 2,
          page_size: 20,
          keyword: 'cotton',
          grade: 'A',
          status: 'active',
          is_processor: false,
        },
      ],
    ]);
    expect(wrapper.emitted('search')).toBeUndefined();
    expect(wrapper.getComponent(ElPagination).props('currentPage')).toBe(2);
  });

  it('resets to page 1 and retains filters when the page size changes', async () => {
    const wrapper = mountList({ page: 3 });
    const pagination = wrapper.getComponent(ElPagination);
    const sizes = pagination.getComponent(ElSelect);
    await sizes.get('.el-select__wrapper').trigger('click');
    await flushPromises();
    const listboxId = sizes.get('[role="combobox"]').attributes('aria-controls');
    expect(listboxId).toBeTruthy();
    const listbox = document.getElementById(listboxId);
    expect(listbox).not.toBeNull();
    const option = listbox!.querySelector<HTMLElement>('.el-select-dropdown__item:nth-child(3)');
    expect(option).not.toBeNull();
    expect(option!.textContent).toContain('50');
    option!.click();
    await flushPromises();

    expect(wrapper.emitted('update:queryParams')).toEqual([
      [
        {
          page: 1,
          page_size: 50,
          keyword: 'cotton',
          grade: 'A',
          status: 'active',
          is_processor: false,
        },
      ],
    ]);
    expect(wrapper.emitted('search')).toBeUndefined();
    expect(pagination.props('currentPage')).toBe(1);
    expect(pagination.props('pageSize')).toBe(50);
  });

  it('searches from page 1 with the edited keyword', async () => {
    const wrapper = mountList({ page: 3 });
    await wrapper.get('.filter-form input').setValue('linen');
    await wrapper.get('.filter-form button.el-button--primary').trigger('click');

    expect(wrapper.emitted('update:queryParams')).toEqual([
      [
        {
          page: 1,
          page_size: 20,
          keyword: 'linen',
          grade: 'A',
          status: 'active',
          is_processor: false,
        },
      ],
    ]);
    expect(wrapper.emitted('search')).toEqual([[]]);
  });

  it('retains externally synchronized filters on the next page change', async () => {
    const wrapper = mountList();
    await wrapper.setProps({
      queryParams: {
        page: 1,
        page_size: 10,
        keyword: 'silk',
        grade: 'B',
        status: 'inactive',
        is_processor: true,
      },
    });
    await wrapper.get('.el-pager li.number:nth-child(2)').trigger('click');

    expect(wrapper.emitted('update:queryParams')).toEqual([
      [
        {
          page: 2,
          page_size: 10,
          keyword: 'silk',
          grade: 'B',
          status: 'inactive',
          is_processor: true,
        },
      ],
    ]);
    expect(wrapper.emitted('search')).toBeUndefined();
  });

  it('keeps reset clearing filters and searching from the default pagination', async () => {
    const wrapper = mountList({ page: 3, page_size: 50, is_processor: true });
    await wrapper.get('.filter-form button.el-button:not(.el-button--primary)').trigger('click');

    expect(wrapper.emitted('update:queryParams')).toEqual([
      [
        {
          page: 1,
          page_size: 20,
          keyword: '',
          grade: '',
          status: '',
          is_processor: undefined,
        },
      ],
    ]);
    expect(wrapper.emitted('search')).toEqual([[]]);
  });
});
