import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ElementPlus, { ElPagination } from 'element-plus';
import { defineComponent, h } from 'vue';
import { useTableApi } from '@/composables/useTableApi';
import { request } from '@/api/request';

vi.mock('@/api/request');

enableAutoUnmount(afterEach);

function makeResponse(items: unknown[], total: number) {
  return { data: { data: items, total } };
}

function mountTable(initialTotal: number, initialPage: number, pageSize = 20) {
  const mockGet = vi.mocked(request.get);
  const calls: { page: number; page_size: number }[] = [];
  mockGet.mockImplementation((url: string, config?: { params?: Record<string, unknown> }) => {
    const p = config?.params ?? {};
    calls.push({ page: Number(p.page), page_size: Number(p.page_size) });
    return Promise.resolve(makeResponse([], initialTotal)) as never;
  });

  // setup 返回的 table 句柄通过模板外暴露：expose 使测试可在初始加载落定后
  // 再设置 page/pageSize（mount 期间设大页会被首次响应的 maxPage 判定拉回，
  // 使钳位断言失去前提）。
  let tableRef: ReturnType<typeof useTableApi> | undefined;
  const Host = defineComponent({
    setup(_props, { expose }) {
      const table = useTableApi<Record<string, unknown>>('/test/table');
      tableRef = table;
      expose({ getTable: () => table });
      return () =>
        h('div', { class: 'host' }, [
          h(ElPagination, {
            total: table.total.value,
            currentPage: table.page.value,
            pageSize: table.pageSize.value,
            'onUpdate:current-page': (v: number) => {
              table.page.value = v;
            },
            'onUpdate:page-size': (v: number) => {
              table.pageSize.value = v;
            },
          }),
        ]);
    },
  });

  const wrapper = mount(Host, { global: { plugins: [ElementPlus] } });
  const setPageAfterInitialLoad = async () => {
    await flushPromises();
    const table = tableRef;
    if (!table) throw new Error('useTableApi 句柄未就绪，无法构造钳位前提');
    table.page.value = initialPage;
    table.pageSize.value = pageSize;
    await flushPromises();
    await nextTick();
  };
  return { wrapper, calls, mockGet, setPageAfterInitialLoad };
}

describe('useTableApi pagination clamp on total decrease', () => {
  it('does not clamp when page is within range of total', async () => {
    const { calls, mockGet, setPageAfterInitialLoad } = mountTable(60, 2);
    await setPageAfterInitialLoad();
    expect(mockGet).toHaveBeenCalled();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[calls.length - 1].page).toBe(2);
    // 页内页不被钳位：page=2 稳定保留（total=60/page_size=20 maxPage=3）
    await flushPromises();
    await nextTick();
    expect(calls.filter(c => c.page === 2).length).toBeGreaterThanOrEqual(1);
  });

  it('clamps page to maxPage when total drops below current page boundary', async () => {
    // total=60/page_size=20 ⇒ maxPage=3，page=3 是页内页不被钳位；
    // 之后 total 降到 20 ⇒ maxPage=1，page 3 越界被钳回 1 并重取。
    const { calls, mockGet, wrapper, setPageAfterInitialLoad } = mountTable(60, 3, 20);
    await setPageAfterInitialLoad();
    expect(calls[calls.length - 1].page).toBe(3);

    mockGet.mockResolvedValueOnce(makeResponse([], 20) as never);
    const pagination = wrapper.getComponent(ElPagination);
    pagination.vm.$emit('update:current-page', 3);
    await flushPromises();
    await nextTick();

    const correctedCall = calls.find(c => c.page === 1);
    expect(
      correctedCall,
      'total=20/page_size=20 maxPage=1, page 3 must clamp to 1 and re-fetch'
    ).toBeDefined();
  });

  it('clamps to page 1 when total becomes 0', async () => {
    // total=60 ⇒ maxPage=3，page=3 页内；随后 total=0 ⇒ maxPage=1 钳回首页。
    const { calls, mockGet, wrapper, setPageAfterInitialLoad } = mountTable(60, 3, 20);
    await setPageAfterInitialLoad();

    mockGet.mockResolvedValueOnce(makeResponse([], 0) as never);
    wrapper.getComponent(ElPagination).vm.$emit('update:current-page', 3);
    await flushPromises();
    await nextTick();

    const correctedCall = calls.find(c => c.page === 1);
    expect(correctedCall, 'total=0 must clamp to page 1').toBeDefined();
  });
});
