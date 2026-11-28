import { beforeEach, describe, expect, it, vi } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('../../src/features/payments/services/payments', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/features/payments/services/payments')>()
  return { ...actual, paymentService: { create } }
})

import { usePaymentForm } from '../../src/features/payments/composables/usePaymentForm'

describe('usePaymentForm', () => {
  beforeEach(() => create.mockReset())

  it('blocks amounts above the outstanding balance', async () => {
    const form = usePaymentForm()
    form.setCustomer(7, '100.00')
    form.amount.value = '100.01'

    await form.submit()

    expect(form.error.value).toContain('不得超过待收金额')
    expect(create).not.toHaveBeenCalled()
  })

  it('submits a valid payment once', async () => {
    create.mockResolvedValue({ id: 5 })
    const form = usePaymentForm()
    form.setCustomer(7, '100.00')
    form.amount.value = '25.50'
    form.method.value = 'cash'

    await form.submit()
    await form.submit()

    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toMatchObject({
      customer_id: 7,
      amount: '25.50',
      payment_method: 'cash',
    })
  })
})
