import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get, post, put } }))

import {
  CUSTOMER_DETAIL_PATH,
  CUSTOMER_SELECT_PATH,
  CUSTOMERS_PATH,
} from '../../src/shared/api/contracts'
import { customerService } from '../../src/features/customers/services/customers'

const customer = {
  id: 7,
  customer_code: 'C-0007',
  customer_name: '测试客户',
  contact_person: '张三',
  contact_phone: '138****0000',
  contact_email: null,
  address: null,
  city: null,
  province: null,
  country: '中国',
  postal_code: null,
  credit_limit: '10000.00',
  payment_terms: 30,
  tax_id: null,
  bank_name: null,
  bank_account: null,
  status: 'active',
  customer_type: 'wholesale',
  tier: null,
  notes: null,
  created_by: 1,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
  customer_industry: null,
  main_products: null,
  annual_purchase: null,
  quality_requirement: null,
  inspection_standard: null,
  owner_id: 1,
  department_id: null,
  owner_assigned_at: null,
  special_process: null,
  source: null,
  pool_recycle_reason: null,
}

describe('customerService', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    put.mockReset()
  })

  it('loads a standard paginated customer list', async () => {
    get.mockResolvedValue({ items: [customer], total: 1, page: 1, page_size: 20 })

    await expect(
      customerService.list({ page: 1, page_size: 20, keyword: '测试' }),
    ).resolves.toEqual({ items: [customer], total: 1, page: 1, page_size: 20 })
    expect(get).toHaveBeenCalledWith(CUSTOMERS_PATH, {
      page: 1,
      page_size: 20,
      keyword: '测试',
    })
  })

  it('uses a resolved customer id for detail requests', async () => {
    get.mockResolvedValue(customer)

    await expect(customerService.detail(7)).resolves.toEqual(customer)
    expect(get).toHaveBeenCalledWith(CUSTOMER_DETAIL_PATH, undefined, { pathParams: { id: 7 } })
  })

  it('sends credit_limit as a string when creating a customer', async () => {
    post.mockResolvedValue(customer)

    await customerService.create({ customer_name: '测试客户', credit_limit: '10000.00' })

    expect(post).toHaveBeenCalledWith(CUSTOMERS_PATH, {
      customer_name: '测试客户',
      credit_limit: '10000.00',
    })
  })

  it('loads the customer selection list', async () => {
    get.mockResolvedValue({ items: [customer] })

    await expect(customerService.select('测试')).resolves.toEqual([customer])
    expect(get).toHaveBeenCalledWith(CUSTOMER_SELECT_PATH, { keyword: '测试' })
  })

  it('rejects a customer response missing its name', async () => {
    const incomplete = Object.fromEntries(
      Object.entries(customer).filter(([key]) => key !== 'customer_name'),
    )
    get.mockResolvedValue(incomplete)

    await expect(customerService.detail(7)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
