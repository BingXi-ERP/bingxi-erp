import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../src/features/orders/services/orders', () => ({
  orderService: { create },
}))

import { useOrderDraft } from '../../src/features/orders/composables/useOrderDraft'

describe('useOrderDraft', () => {
  beforeEach(() => create.mockReset())

  it('calculates exact line and order totals', () => {
    const draft = useOrderDraft()
    draft.addItem({ product_id: 1, quantity: '12.345', unit_price: '7.890' })
    draft.addItem({ product_id: 2, quantity: '2', unit_price: '10.00' })

    expect(draft.subtotal.value).toBe('117.40205')
    expect(draft.items.value).toHaveLength(2)
  })

  it('rejects zero quantity and zero price rows', () => {
    const draft = useOrderDraft()
    draft.addItem({ product_id: 1, quantity: '0', unit_price: '10' })
    draft.addItem({ product_id: 2, quantity: '1', unit_price: '0' })

    expect(draft.errors.value.length).toBeGreaterThan(0)
    expect(draft.canSubmit.value).toBe(false)
  })

  it('submits a valid draft once and blocks duplicate submission', async () => {
    create.mockResolvedValue({ id: 1 })
    const draft = useOrderDraft()
    draft.setCustomer(7, { contact_person: '张三', contact_phone: '13800000000', address: '地址' })
    draft.addItem({ product_id: 3, quantity: '4', unit_price: '25' })

    await draft.submit()
    await draft.submit()

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      customer_id: 7,
      contact_person: '张三',
      items: [{ product_id: 3, quantity: '4', unit_price: '25' }],
    })
  })
})
