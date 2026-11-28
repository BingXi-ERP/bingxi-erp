import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get, post } }))

import { SALES_RETURN_ITEMS_PATH, SALES_RETURNS_PATH } from '../../src/shared/api/contracts'
import { salesReturnService } from '../../src/features/sales-returns/services/salesReturns'

const salesReturn = {
  id: 4,
  return_no: 'SR-4',
  sales_order_id: 11,
  customer_id: 7,
  return_date: '2026-11-28',
  warehouse_id: 2,
  reason: '质量问题: 瑕疵',
  status: 'DRAFT',
  total_amount: '100.00',
  remarks: null,
  approved_by: null,
  approved_at: null,
  rejected_reason: null,
  created_by: 1,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
  customer_name: '测试客户',
  sales_order_no: 'SO-11',
}

const item = {
  id: 8,
  return_id: 4,
  line_no: 1,
  product_id: 3,
  quantity: '4.00',
  quantity_alt: '0.72',
  unit_price: '25.00',
  unit_price_foreign: '0.00',
  discount_percent: '0.00',
  tax_percent: '13.00',
  subtotal: '100.00',
  tax_amount: '13.00',
  discount_amount: '0.00',
  total_amount: '113.00',
  notes: null,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
  color_no: '黑色',
  dye_lot_no: '缸-1',
  batch_no: '批-1',
  product_name: '全棉坯布',
  product_code: 'P-0003',
}

describe('salesReturnService', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('loads a standard sales return page', async () => {
    get.mockResolvedValue({ items: [salesReturn], total: 1, page: 1, page_size: 20 })

    await expect(salesReturnService.list({ page: 1, page_size: 20 })).resolves.toEqual({
      items: [salesReturn],
      total: 1,
      page: 1,
      page_size: 20,
    })
    expect(get).toHaveBeenCalledWith(SALES_RETURNS_PATH, { page: 1, page_size: 20 })
  })

  it('creates a header without embedded items', async () => {
    post.mockResolvedValue({
      id: 4,
      return_no: 'SR-4',
      sales_order_id: 11,
      customer_id: 7,
      return_date: '2026-11-28',
      warehouse_id: 2,
      reason: '质量问题: 瑕疵',
      status: 'DRAFT',
      total_amount: '0.00',
      remarks: null,
      approved_by: null,
      approved_at: null,
      rejected_reason: null,
      created_by: 1,
      created_at: '2026-11-28T00:00:00Z',
      updated_at: '2026-11-28T00:00:00Z',
    })

    await salesReturnService.createHeader({
      order_id: 11,
      customer_id: 7,
      return_date: '2026-11-28',
      warehouse_id: 2,
      reason_type: '质量问题',
      reason_detail: '瑕疵',
    })

    expect(post).toHaveBeenCalledWith(SALES_RETURNS_PATH, {
      order_id: 11,
      customer_id: 7,
      return_date: '2026-11-28',
      warehouse_id: 2,
      reason_type: '质量问题',
      reason_detail: '瑕疵',
    })
  })

  it('creates an item through the nested items endpoint', async () => {
    const createdItem = Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== 'product_name' && key !== 'product_code'),
    )
    post.mockResolvedValue(createdItem)

    await salesReturnService.createItem(4, {
      product_id: 3,
      quantity: '4.00',
      unit_price: '25.00',
      tax_percent: '13.00',
    })

    expect(post).toHaveBeenCalledWith(
      SALES_RETURN_ITEMS_PATH,
      { product_id: 3, quantity: '4.00', unit_price: '25.00', tax_percent: '13.00' },
      { pathParams: { id: 4 } },
    )
  })

  it('rejects lowercase return status tokens', async () => {
    get.mockResolvedValue({ ...salesReturn, status: 'draft' })

    await expect(salesReturnService.detail(4)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
