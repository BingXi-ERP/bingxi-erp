import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  SALES_RETURN_DETAIL_PATH,
  SALES_RETURN_ITEMS_PATH,
  SALES_RETURNS_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import {
  salesReturnEntitySchema,
  salesReturnItemEntitySchema,
  salesReturnItemSchema,
  salesReturnSchema,
  type CreateSalesReturnHeader,
  type CreateSalesReturnItem,
  type SalesReturn,
} from '../types'

const salesReturnPageSchema = z.strictObject({
  items: z.array(salesReturnSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export interface SalesReturnListQuery {
  page?: number
  page_size?: number
  return_no?: string
  status?: SalesReturn['status']
  customer_id?: number
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid sales return response from ${path}: ${fields}`,
    })
  }
  return result.data
}

function requireReturnId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Sales return id must be a positive integer')
}

export const salesReturnService = {
  async list(query: SalesReturnListQuery) {
    const value = await apiClient.get<unknown>(SALES_RETURNS_PATH, { ...query })
    return parse(salesReturnPageSchema, value, SALES_RETURNS_PATH)
  },

  async detail(id: number): Promise<SalesReturn> {
    requireReturnId(id)
    const value = await apiClient.get<unknown>(SALES_RETURN_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(salesReturnSchema, value, SALES_RETURN_DETAIL_PATH)
  },

  async items(id: number) {
    requireReturnId(id)
    const value = await apiClient.get<unknown>(SALES_RETURN_ITEMS_PATH, undefined, {
      pathParams: { id },
    })
    return parse(z.array(salesReturnItemSchema), value, SALES_RETURN_ITEMS_PATH)
  },

  async createHeader(payload: CreateSalesReturnHeader) {
    const value = await apiClient.post<unknown>(SALES_RETURNS_PATH, payload)
    return parse(salesReturnEntitySchema, value, SALES_RETURNS_PATH)
  },

  async createItem(id: number, payload: CreateSalesReturnItem) {
    requireReturnId(id)
    const value = await apiClient.post<unknown>(SALES_RETURN_ITEMS_PATH, payload, {
      pathParams: { id },
    })
    return parse(salesReturnItemEntitySchema, value, SALES_RETURN_ITEMS_PATH)
  },
}
