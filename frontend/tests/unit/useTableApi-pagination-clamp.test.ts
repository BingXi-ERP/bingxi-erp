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
    // 初始 total=60（maxPage=3）加载完后 page=1；用户跳到第 3 页，该次取数应答 total=20
    // ⇒ maxPage=1，page 3 越界被钳回 1 并由分页 watch 重取。emit 须从 1 改到 3：
    // 同值赋值不触发 ref watch，预置 page=3 再 emit 3 会让请求一次都不发。
    const { mockGet, wrapper } = mountTable(60, 1, 20);
    await flushPromises();
    mockGet.mockClear();

    mockGet.mockResolvedValueOnce(makeResponse([], 20) as never);
    wrapper.getComponent(ElPagination).vm.$emit('update:current-page', 3);
    await flushPromises();
    await nextTick();
    await flushPromises();

    // 第 1 次是越界请求本身（page=3，应答 total=20），第 2 次是钳位回退后的重取（page=1）
    expect(mockGet.mock.calls.length, '跳页与钳位重取须各发一次请求').toBeGreaterThanOrEqual(2);
    expect(mockGet.mock.calls[0][1].params.page).toBe(3);
    expect(mockGet.mock.calls[1][1].params.page, 'maxPage=1, page 3 must clamp to 1').toBe(1);
  });

  it('clamps to page 1 when total becomes 0', async () => {
    // 跳第 3 页时应答 total=0 ⇒ maxPage=Math.max(1, ceil(0/20))=1，钳回首页并重取。
    const { mockGet, wrapper } = mountTable(60, 1, 20);
    await flushPromises();
    mockGet.mockClear();

    mockGet.mockResolvedValueOnce(makeResponse([], 0) as never);
    wrapper.getComponent(ElPagination).vm.$emit('update:current-page', 3);
    await flushPromises();
    await nextTick();
    await flushPromises();

    expect(mockGet.mock.calls.length, 'total=0 须触发钳位后的重取').toBeGreaterThanOrEqual(2);
    expect(mockGet.mock.calls[0][1].params.page).toBe(3);
    expect(mockGet.mock.calls[1][1].params.page, 'total=0 must clamp to page 1').toBe(1);
  });
});
