import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get, post } }))

import { PAYMENT_CONFIRM_PATH, PAYMENTS_PATH } from '../../src/shared/api/contracts'
import {
  paymentService,
  validatePaymentAmount,
} from '../../src/features/payments/services/payments'

const payment = {
  id: 5,
  payment_no: 'PAY-5',
  collection_no: 'PAY-5',
  payment_date: '2026-11-28',
  collection_date: '2026-11-28',
  customer_id: 7,
  customer_name: '测试客户',
  amount: '100.00',
  collection_amount: '100.00',
  payment_method: 'cash',
  collection_method: 'cash',
  bank_account: null,
  check_no: null,
  remark: null,
  status: 'pending',
  confirmed_by: null,
  confirmed_at: null,
  created_by: 1,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
}

describe('paymentService', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('reads the AR list envelope instead of standard items', async () => {
    get.mockResolvedValue({ list: [payment], total: 1, page: 1, page_size: 10 })

    await expect(paymentService.list({ page: 1, page_size: 10 })).resolves.toEqual({
      list: [payment],
      total: 1,
      page: 1,
      page_size: 10,
    })
    expect(get).toHaveBeenCalledWith(PAYMENTS_PATH, { page: 1, page_size: 10 })
  })

  it('creates a payment with a decimal string amount', async () => {
    post.mockResolvedValue(payment)

    await paymentService.create({
      customer_id: 7,
      amount: '100.00',
      payment_method: 'cash',
      payment_date: '2026-11-28',
    })

    expect(post).toHaveBeenCalledWith(PAYMENTS_PATH, {
      customer_id: 7,
      amount: '100.00',
      payment_method: 'cash',
      payment_date: '2026-11-28',
    })
  })

  it('confirms a payment through the registered action path', async () => {
    post.mockResolvedValue({ ...payment, status: 'confirmed' })

    await expect(paymentService.confirm(5)).resolves.toMatchObject({ status: 'confirmed' })
    expect(post).toHaveBeenCalledWith(PAYMENT_CONFIRM_PATH, undefined, { pathParams: { id: 5 } })
  })
})

describe('validatePaymentAmount', () => {
  it('accepts positive amounts with at most two decimal places', () => {
    expect(validatePaymentAmount('0.01', '100.00')).toBe('0.01')
    expect(validatePaymentAmount('100.00', '100.00')).toBe('100.00')
  })

  it('rejects zero negative and over-precise amounts', () => {
    expect(() => validatePaymentAmount('0', '100')).toThrow('PAYMENT_AMOUNT_NOT_POSITIVE')
    expect(() => validatePaymentAmount('-1', '100')).toThrow('PAYMENT_AMOUNT_NOT_POSITIVE')
    expect(() => validatePaymentAmount('1.001', '100')).toThrow('PAYMENT_AMOUNT_PRECISION')
  })

  it('rejects amounts above the outstanding balance', () => {
    expect(() => validatePaymentAmount('100.01', '100.00')).toThrow(
      'PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING',
    )
  })
})
