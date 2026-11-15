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

  const Host = defineComponent({
    setup() {
      const table = useTableApi<Record<string, unknown>>('/test/table');
      table.page.value = initialPage;
      table.pageSize.value = pageSize;
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
  return { wrapper, calls, mockGet };
}

describe('useTableApi pagination clamp on total decrease', () => {
  it('does not clamp when page is within range of total', async () => {
    const { calls, mockGet } = mountTable(60, 2);
    await flushPromises();
    expect(mockGet).toHaveBeenCalled();
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0].page).toBe(2);
  });

  it('clamps page to maxPage when total drops below current page boundary', async () => {
    const { calls, mockGet, wrapper } = mountTable(40, 3, 20);
    await flushPromises();
    expect(calls[0].page).toBe(3);

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
    const { calls, mockGet, wrapper } = mountTable(40, 3, 20);
    await flushPromises();

    mockGet.mockResolvedValueOnce(makeResponse([], 0) as never);
    wrapper.getComponent(ElPagination).vm.$emit('update:current-page', 3);
    await flushPromises();
    await nextTick();

    const correctedCall = calls.find(c => c.page === 1);
    expect(correctedCall, 'total=0 must clamp to page 1').toBeDefined();
  });
});
