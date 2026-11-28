import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../src/shared/api/client', () => ({ apiClient: { get } }))

import {
  COLOR_CARD_DETAIL_PATH,
  COLOR_CARDS_PATH,
  PRODUCT_COLORS_PATH,
  PRODUCT_DETAIL_PATH,
  PRODUCT_SELECT_PATH,
  PRODUCTS_PATH,
} from '../../src/shared/api/contracts'
import { colorCardService } from '../../src/features/catalog/services/colorCards'
import { productService } from '../../src/features/catalog/services/products'

const product = {
  id: 3,
  name: '全棉坯布',
  code: 'P-0003',
  barcode: null,
  category_id: 1,
  specification: '40S',
  unit: '米',
  standard_price: '25.50',
  cost_price: null,
  description: null,
  status: 'active',
  is_deleted: false,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
  product_type: '坯布',
  fabric_composition: '100%棉',
  yarn_count: '40S',
  density: '133x72',
  width: '160.00',
  gram_weight: '180.00',
  structure: '平纹',
  finish: null,
  width_needle_included_cm: null,
  weight_tolerance: null,
  spandex_percent: null,
  usage: '服装面料',
  min_order_quantity: '100.00',
  lead_time: 7,
  meters_per_piece: '50.0000',
  supplier_product_code: null,
  supplier_id: null,
  is_batch_managed: true,
  batch_level: 'four_level',
  execution_standard: null,
  factory_name: null,
  factory_address: null,
  product_grade: null,
  safety_category: null,
  product_name: '全棉坯布',
  product_code: 'P-0003',
  price: '25.50',
  is_active: true,
  meters_per_kg: '8.88',
  category_name: '坯布',
}

const color = {
  id: 5,
  product_id: 3,
  color_no: '黑色',
  color_name: '黑色',
  pantone_code: null,
  color_type: '常规色',
  dye_formula: null,
  extra_cost: '0.00',
  color_fastness_grade: null,
  is_active: true,
  created_at: '2026-11-28T00:00:00Z',
  updated_at: '2026-11-28T00:00:00Z',
}

const colorCard = {
  id: 9,
  card_no: 'CC-9',
  card_name: '秋季色卡',
  card_type: '样品',
  season: '秋季',
  brand: null,
  total_colors: 1,
  status: 'draft',
  cover_image_url: null,
  stock_quantity: 10,
  issued_quantity: 2,
  created_at: '2026-11-28T00:00:00Z',
}

describe('catalog services', () => {
  beforeEach(() => get.mockReset())

  it('loads a standard product page', async () => {
    get.mockResolvedValue({ items: [product], total: 1, page: 1, page_size: 10 })

    await expect(productService.list({ page: 1, page_size: 10, search: '棉' })).resolves.toEqual({
      items: [product],
      total: 1,
      page: 1,
      page_size: 10,
    })
    expect(get).toHaveBeenCalledWith(PRODUCTS_PATH, { page: 1, page_size: 10, search: '棉' })
  })

  it('loads product colors through resolved path parameters', async () => {
    get.mockResolvedValue([color])

    await expect(productService.colors(3)).resolves.toEqual([color])
    expect(get).toHaveBeenCalledWith(PRODUCT_COLORS_PATH, undefined, { pathParams: { id: 3 } })
  })

  it('loads product detail and selection results', async () => {
    get
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ items: [product], total: 1, page: 1, page_size: 10 })

    await expect(productService.detail(3)).resolves.toEqual(product)
    await expect(productService.select('棉')).resolves.toEqual([product])
    expect(get).toHaveBeenNthCalledWith(1, PRODUCT_DETAIL_PATH, undefined, {
      pathParams: { id: 3 },
    })
    expect(get).toHaveBeenNthCalledWith(2, PRODUCT_SELECT_PATH, { search: '棉' })
  })

  it('loads color cards and detail', async () => {
    get
      .mockResolvedValueOnce({ items: [colorCard], total: 1, page: 1, page_size: 20 })
      .mockResolvedValueOnce({
        ...colorCard,
        description: null,
        items: [],
        updated_at: colorCard.created_at,
      })

    await expect(colorCardService.list({ page: 1, page_size: 20 })).resolves.toEqual({
      items: [colorCard],
      total: 1,
      page: 1,
      page_size: 20,
    })
    await expect(colorCardService.detail(9)).resolves.toMatchObject({ id: 9, items: [] })
    expect(get).toHaveBeenNthCalledWith(1, COLOR_CARDS_PATH, { page: 1, page_size: 20 })
    expect(get).toHaveBeenNthCalledWith(2, COLOR_CARD_DETAIL_PATH, undefined, {
      pathParams: { id: 9 },
    })
  })

  it('rejects legacy active color-card status', async () => {
    get.mockResolvedValue({ ...colorCard, status: 'active' })

    await expect(colorCardService.detail(9)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
