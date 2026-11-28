import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  CUSTOMER_DETAIL_PATH,
  CUSTOMER_SELECT_PATH,
  CUSTOMERS_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import { customerSchema, type Customer, type CustomerInput, type CustomerListQuery } from '../types'

const customerPageSchema = z.strictObject({
  items: z.array(customerSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

const customerSelectSchema = z.strictObject({ items: z.array(customerSchema) })

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid customer response from ${path}: ${fields}`,
    })
  }
  return result.data
}

export const customerService = {
  async list(query: CustomerListQuery) {
    const value = await apiClient.get<unknown>(CUSTOMERS_PATH, { ...query })
    return parse(customerPageSchema, value, CUSTOMERS_PATH)
  },

  async detail(id: number): Promise<Customer> {
    if (!Number.isInteger(id) || id < 1) throw new Error('Customer id must be a positive integer')
    const value = await apiClient.get<unknown>(CUSTOMER_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(customerSchema, value, CUSTOMER_DETAIL_PATH)
  },

  async create(payload: CustomerInput): Promise<Customer> {
    const value = await apiClient.post<unknown>(CUSTOMERS_PATH, payload)
    return parse(customerSchema, value, CUSTOMERS_PATH)
  },

  async update(id: number, payload: Partial<CustomerInput>): Promise<Customer> {
    if (!Number.isInteger(id) || id < 1) throw new Error('Customer id must be a positive integer')
    const value = await apiClient.put<unknown>(CUSTOMER_DETAIL_PATH, payload, {
      pathParams: { id },
    })
    return parse(customerSchema, value, CUSTOMER_DETAIL_PATH)
  },

  async select(keyword?: string): Promise<Customer[]> {
    const value = await apiClient.get<unknown>(CUSTOMER_SELECT_PATH, { keyword })
    return parse(customerSelectSchema, value, CUSTOMER_SELECT_PATH).items
  },
}
