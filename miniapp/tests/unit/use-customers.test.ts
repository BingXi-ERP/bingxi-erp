import { beforeEach, describe, expect, it, vi } from 'vitest'

const { list } = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../../src/features/customers/services/customers', () => ({
  customerService: { list },
}))

import { useCustomers } from '../../src/features/customers/composables/useCustomers'

const first = {
  id: 1,
  customer_code: 'C-1',
  customer_name: '客户一',
  status: 'active' as const,
  customer_type: 'wholesale' as const,
}
const second = {
  id: 2,
  customer_code: 'C-2',
  customer_name: '客户二',
  status: 'active' as const,
  customer_type: 'retail' as const,
}

describe('useCustomers', () => {
  beforeEach(() => {
    list.mockReset()
  })

  it('loads the first page and exposes total', async () => {
    list.mockResolvedValue({ items: [first], total: 1, page: 1, page_size: 20 })
    const state = useCustomers()

    await state.load()

    expect(state.items.value).toEqual([first])
    expect(state.total.value).toBe(1)
    expect(state.status.value).toBe('success')
  })

  it('merges the next page without duplicating refreshed rows', async () => {
    list
      .mockResolvedValueOnce({ items: [first], total: 2, page: 1, page_size: 1 })
      .mockResolvedValueOnce({
        items: [{ ...first, customer_name: '客户一新' }, second],
        total: 2,
        page: 2,
        page_size: 1,
      })
    const state = useCustomers()

    await state.load()
    await state.loadMore()

    expect(state.items.value).toEqual([{ ...first, customer_name: '客户一新' }, second])
    expect(state.page.value).toBe(2)
  })

  it('exposes a retryable error state', async () => {
    list.mockRejectedValue(new Error('network'))
    const state = useCustomers()

    await state.load()

    expect(state.status.value).toBe('error')
    expect(state.message.value).not.toBe('')
  })
})
