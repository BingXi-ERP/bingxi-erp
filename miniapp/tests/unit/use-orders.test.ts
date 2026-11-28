import { beforeEach, describe, expect, it, vi } from 'vitest'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../src/features/orders/services/orders', () => ({ orderService: { list } }))

import { useOrders } from '../../src/features/orders/composables/useOrders'

const first = {
  id: 1,
  order_no: 'SO-1',
  customer_id: 7,
  customer_name: '客户一',
  status: 'draft' as const,
  items: [],
}
const second = {
  id: 2,
  order_no: 'SO-2',
  customer_id: 8,
  customer_name: '客户二',
  status: 'pending' as const,
  items: [],
}

describe('useOrders', () => {
  beforeEach(() => list.mockReset())

  it('loads the first page and total', async () => {
    list.mockResolvedValue({ items: [first], total: 1, page: 1, page_size: 10 })
    const state = useOrders()

    await state.load()

    expect(state.items.value).toEqual([first])
    expect(state.total.value).toBe(1)
    expect(state.status.value).toBe('success')
  })

  it('merges pages without duplicate ids', async () => {
    list
      .mockResolvedValueOnce({ items: [first], total: 2, page: 1, page_size: 1 })
      .mockResolvedValueOnce({
        items: [{ ...first, status: 'pending' }, second],
        total: 2,
        page: 2,
        page_size: 1,
      })
    const state = useOrders()

    await state.load()
    await state.loadMore()

    expect(state.items.value).toEqual([{ ...first, status: 'pending' }, second])
  })
})
