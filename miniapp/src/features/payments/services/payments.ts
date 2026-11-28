import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  PAYMENT_CANCEL_PATH,
  PAYMENT_CONFIRM_PATH,
  PAYMENT_DETAIL_PATH,
  PAYMENTS_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import { compareDecimals } from '../../../shared/trade'

const paymentSchema = z.strictObject({
  id: z.number().int(),
  payment_no: z.string(),
  collection_no: z.string(),
  payment_date: z.string(),
  collection_date: z.string(),
  customer_id: z.number().int(),
  customer_name: z.string().nullable(),
  amount: z.string(),
  collection_amount: z.string(),
  payment_method: z.string().nullable(),
  collection_method: z.string().nullable(),
  bank_account: z.string().nullable(),
  check_no: z.string().nullable(),
  remark: z.string().nullable(),
  status: z.enum(['pending', 'confirmed', 'cancelled']),
  confirmed_by: z.number().int().nullable(),
  confirmed_at: z.string().nullable(),
  created_by: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
})

const paymentPageSchema = z.strictObject({
  list: z.array(paymentSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

export type ArPayment = z.infer<typeof paymentSchema>

export interface PaymentListQuery {
  page?: number
  page_size?: number
  status?: ArPayment['status']
  customer_id?: number
  payment_no?: string
}

export interface CreatePaymentPayload {
  customer_id: number
  amount: string
  payment_method: string
  payment_date: string
  bank_account?: string
  remark?: string
  invoice_ids?: number[]
}

function parse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid payment response from ${path}: ${fields}`,
    })
  }
  return result.data
}

export function validatePaymentAmount(amount: string, outstanding: string): string {
  const value = amount.trim()
  try {
    compareDecimals(value, '0')
  } catch {
    throw new Error('PAYMENT_AMOUNT_INVALID')
  }
  if (compareDecimals(value, '0') <= 0) throw new Error('PAYMENT_AMOUNT_NOT_POSITIVE')
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('PAYMENT_AMOUNT_PRECISION')
  }
  if (compareDecimals(value, outstanding) > 0) throw new Error('PAYMENT_AMOUNT_EXCEEDS_OUTSTANDING')
  return value
}

function requirePaymentId(id: number) {
  if (!Number.isInteger(id) || id < 1) throw new Error('Payment id must be a positive integer')
}

export const paymentService = {
  async list(query: PaymentListQuery) {
    const value = await apiClient.get<unknown>(PAYMENTS_PATH, { ...query })
    return parse(paymentPageSchema, value, PAYMENTS_PATH)
  },

  async detail(id: number): Promise<ArPayment> {
    requirePaymentId(id)
    const value = await apiClient.get<unknown>(PAYMENT_DETAIL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(paymentSchema, value, PAYMENT_DETAIL_PATH)
  },

  async create(payload: CreatePaymentPayload): Promise<ArPayment> {
    const value = await apiClient.post<unknown>(PAYMENTS_PATH, payload)
    return parse(paymentSchema, value, PAYMENTS_PATH)
  },

  async confirm(id: number): Promise<ArPayment> {
    requirePaymentId(id)
    const value = await apiClient.post<unknown>(PAYMENT_CONFIRM_PATH, undefined, {
      pathParams: { id },
    })
    return parse(paymentSchema, value, PAYMENT_CONFIRM_PATH)
  },

  async cancel(id: number): Promise<ArPayment> {
    requirePaymentId(id)
    const value = await apiClient.post<unknown>(PAYMENT_CANCEL_PATH, undefined, {
      pathParams: { id },
    })
    return parse(paymentSchema, value, PAYMENT_CANCEL_PATH)
  },
}
