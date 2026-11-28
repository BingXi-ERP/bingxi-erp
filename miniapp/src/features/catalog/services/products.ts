import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  PRODUCT_COLORS_PATH,
  PRODUCT_DETAIL_PATH,
  PRODUCT_SELECT_PATH,
  PRODUCTS_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import { productColorSchema, productSchema, type Product, type ProductColor } from '../types'

const productPageSchema = z.strictObject({
  items: z.array(productSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export interface ProductListQuery {
  page?: number
  page_size?: number
  category_id?: number
  status?: Product['status']
  search?: string
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid product response from ${path}: ${fields}`,
    })
  }
  return result.data
}

function requireProductId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Product id must be a positive integer')
}

export const productService = {
  async list(query: ProductListQuery) {
    const value = await apiClient.get<unknown>(PRODUCTS_PATH, { ...query })
    return parse(productPageSchema, value, PRODUCTS_PATH)
  },

  async detail(id: number): Promise<Product> {
    requireProductId(id)
    const value = await apiClient.get<unknown>(PRODUCT_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(productSchema, value, PRODUCT_DETAIL_PATH)
  },

  async colors(id: number): Promise<ProductColor[]> {
    requireProductId(id)
    const value = await apiClient.get<unknown>(PRODUCT_COLORS_PATH, undefined, {
      pathParams: { id },
    })
    return parse(z.array(productColorSchema), value, PRODUCT_COLORS_PATH)
  },

  async select(search?: string): Promise<Product[]> {
    const value = await apiClient.get<unknown>(PRODUCT_SELECT_PATH, { search })
    return parse(productPageSchema, value, PRODUCT_SELECT_PATH).items
  },
}
