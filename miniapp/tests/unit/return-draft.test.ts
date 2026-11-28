import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createHeader, createItem } = vi.hoisted(() => ({
  createHeader: vi.fn(),
  createItem: vi.fn(),
}))
vi.mock('../../src/features/sales-returns/services/salesReturns', () => ({
  salesReturnService: { createHeader, createItem },
}))

import { useReturnDraft } from '../../src/features/sales-returns/composables/useReturnDraft'

describe('useReturnDraft', () => {
  beforeEach(() => {
    createHeader.mockReset()
    createItem.mockReset()
  })

  it('rejects quantities above the original returnable amount', () => {
    const draft = useReturnDraft()
    draft.addItem({ product_id: 3, quantity: '11', unit_price: '25', maxQuantity: '10' })

    expect(draft.errors.value).toContain('quantity_exceeds_returnable')
    expect(draft.canSubmit.value).toBe(false)
  })

  it('creates the header and items once in sequence', async () => {
    createHeader.mockResolvedValue({ id: 4 })
    createItem.mockResolvedValue({ id: 8 })
    const draft = useReturnDraft()
    draft.setHeader({
      order_id: 11,
      customer_id: 7,
      return_date: '2026-11-28',
      warehouse_id: 2,
      reason_type: '质量问题',
    })
    draft.addItem({ product_id: 3, quantity: '4', unit_price: '25', maxQuantity: '10' })

    await draft.submit()
    await draft.submit()

    expect(createHeader).toHaveBeenCalledOnce()
    expect(createItem).toHaveBeenCalledOnce()
    expect(createItem.mock.calls[0]?.[0]).toBe(4)
    expect(createItem.mock.calls[0]?.[1]).toMatchObject({ product_id: 3, quantity: '4' })
  })
})
