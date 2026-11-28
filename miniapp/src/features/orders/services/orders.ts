import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  ORDER_APPROVE_PATH,
  ORDER_CANCEL_PATH,
  ORDER_COMPLETE_PATH,
  ORDER_DETAIL_PATH,
  ORDER_REJECT_PATH,
  ORDER_SHIP_PATH,
  ORDER_SUBMIT_PATH,
  ORDERS_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import {
  createOrderSchema,
  salesOrderSchema,
  type CreateOrderPayload,
  type SalesOrder,
} from '../types'

const orderPageSchema = z.strictObject({
  items: z.array(salesOrderSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export interface OrderListQuery {
  page?: number
  page_size?: number
  status?: SalesOrder['status']
  customer_id?: number
  order_no?: string
  customer_name?: string
  start_date?: string
  end_date?: string
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid order response from ${path}: ${fields}`,
    })
  }
  return result.data
}

function requireOrderId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Order id must be a positive integer')
}

export const orderService = {
  async list(query: OrderListQuery) {
    const value = await apiClient.get<unknown>(ORDERS_PATH, { ...query })
    return parse(orderPageSchema, value, ORDERS_PATH)
  },

  async detail(id: number): Promise<SalesOrder> {
    requireOrderId(id)
    const value = await apiClient.get<unknown>(ORDER_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(salesOrderSchema, value, ORDER_DETAIL_PATH)
  },

  async create(payload: CreateOrderPayload): Promise<SalesOrder> {
    const validated = createOrderSchema.safeParse(payload)
    if (!validated.success) {
      const fields = validated.error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
        .join(', ')
      throw new AppError({
        code: 'VALIDATION_ERROR',
        message: `Invalid order payload: ${fields}`,
      })
    }
    const value = await apiClient.post<unknown>(ORDERS_PATH, validated.data)
    return parse(salesOrderSchema, value, ORDERS_PATH)
  },

  async submit(id: number): Promise<SalesOrder> {
    requireOrderId(id)
    const value = await apiClient.post<unknown>(ORDER_SUBMIT_PATH, undefined, {
      pathParams: { id },
    })
    return parse(salesOrderSchema, value, ORDER_SUBMIT_PATH)
  },

  approve(id: number, reason?: string) {
    return apiClient
      .post<unknown>(ORDER_APPROVE_PATH, reason === undefined ? undefined : { reason }, {
        pathParams: { id },
      })
      .then((value) => parse(salesOrderSchema, value, ORDER_APPROVE_PATH))
  },

  reject(id: number, reason: string) {
    return apiClient
      .post<unknown>(ORDER_REJECT_PATH, { reason }, { pathParams: { id } })
      .then((value) => parse(salesOrderSchema, value, ORDER_REJECT_PATH))
  },

  async cancel(id: number): Promise<SalesOrder> {
    requireOrderId(id)
    const value = await apiClient.post<unknown>(ORDER_CANCEL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(salesOrderSchema, value, ORDER_CANCEL_PATH)
  },

  ship(id: number, payload: unknown) {
    return apiClient
      .post<unknown>(ORDER_SHIP_PATH, payload, { pathParams: { id } })
      .then((value) => parse(salesOrderSchema, value, ORDER_SHIP_PATH))
  },

  async complete(id: number): Promise<SalesOrder> {
    requireOrderId(id)
    const value = await apiClient.post<unknown>(ORDER_COMPLETE_PATH, undefined, {
      pathParams: { id },
    })
    return parse(salesOrderSchema, value, ORDER_COMPLETE_PATH)
  },
}
