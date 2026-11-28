import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get, post } }))

import { ORDER_DETAIL_PATH, ORDER_SUBMIT_PATH, ORDERS_PATH } from '../../src/shared/api/contracts'
import { orderService } from '../../src/features/orders/services/orders'

const order = {
  id: 11,
  order_no: 'SO-2026-0011',
  customer_id: 7,
  customer_name: '测试客户',
  opportunity_id: null,
  order_date: '2026-11-28T00:00:00Z',
  required_date: null,
  ship_date: null,
  status: 'draft',
  subtotal: '100.00',
  tax_amount: '0.00',
  discount_amount: '0.00',
  shipping_cost: '0.00',
  total_amount: '100.00',
  paid_amount: '0.00',
  balance_amount: '100.00',
  shipping_address: '测试地址',
  billing_address: null,
  notes: null,
  batch_no: null,
  color_no: null,
  dye_lot_no: null,
  grade: null,
  packaging_requirement: null,
  quality_standard: null,
  created_by: 1,
  creator_name: '管理员',
  contact_person: '张三',
  contact_phone: '138****0000',
  approved_by: null,
  approved_at: null,
  approval_reason: null,
  rejected_reason: null,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
  items: [
    {
      id: 21,
      order_id: 11,
      product_id: 3,
      product_code: 'P-0003',
      product_name: '全棉坯布',
      quantity: '4.00',
      unit_price: '25.00',
      discount_percent: '0.00',
      tax_percent: '0.00',
      subtotal: '100.00',
      tax_amount: '0.00',
      discount_amount: '0.00',
      total_amount: '100.00',
      shipped_quantity: '0.00',
      notes: null,
      created_at: '2026-11-28T00:00:00Z',
      updated_at: '2026-11-28T00:00:00Z',
      color_no: '黑色',
      color_name: '黑色',
      pantone_code: null,
      grade_required: null,
      quantity_meters: '4.00',
      quantity_kg: '0.72',
      gram_weight: '180.00',
      width: '160.00',
      paper_tube_weight: null,
      is_net_weight: null,
      batch_requirement: null,
      dye_lot_requirement: null,
      base_price: null,
      color_extra_cost: '0.00',
      grade_price_diff: '0.00',
      final_price: null,
      shipped_quantity_meters: '0.00',
      shipped_quantity_kg: '0.00',
      quantity_tolerance_pct: null,
      fulfillment_source: null,
    },
  ],
}

describe('orderService', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
  })

  it('loads a standard order page with filters', async () => {
    get.mockResolvedValue({ items: [order], total: 1, page: 1, page_size: 10 })

    await expect(orderService.list({ page: 1, page_size: 10, status: 'draft' })).resolves.toEqual({
      items: [order],
      total: 1,
      page: 1,
      page_size: 10,
    })
    expect(get).toHaveBeenCalledWith(ORDERS_PATH, { page: 1, page_size: 10, status: 'draft' })
  })

  it('loads order detail through a resolved id', async () => {
    get.mockResolvedValue(order)

    await expect(orderService.detail(11)).resolves.toEqual(order)
    expect(get).toHaveBeenCalledWith(ORDER_DETAIL_PATH, undefined, { pathParams: { id: 11 } })
  })

  it('creates an order with exact decimal strings', async () => {
    post.mockResolvedValue(order)

    await orderService.create({
      customer_id: 7,
      contact_person: '张三',
      contact_phone: '13800000000',
      shipping_address: '测试地址',
      items: [{ product_id: 3, quantity: '4.00', unit_price: '25.00', color_no: '黑色' }],
    })

    expect(post).toHaveBeenCalledWith(ORDERS_PATH, {
      customer_id: 7,
      contact_person: '张三',
      contact_phone: '13800000000',
      shipping_address: '测试地址',
      items: [{ product_id: 3, quantity: '4.00', unit_price: '25.00', color_no: '黑色' }],
    })
  })

  it('posts submit to the registered action path', async () => {
    post.mockResolvedValue({ ...order, status: 'pending' })

    await expect(orderService.submit(11)).resolves.toMatchObject({ status: 'pending' })
    expect(post).toHaveBeenCalledWith(ORDER_SUBMIT_PATH, undefined, { pathParams: { id: 11 } })
  })

  it('rejects unknown order status tokens', async () => {
    get.mockResolvedValue({ ...order, status: 'DRAFT' })

    await expect(orderService.detail(11)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
