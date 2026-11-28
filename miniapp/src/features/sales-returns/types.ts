import { z } from 'zod'
import { compareDecimals, SALES_RETURN_STATUSES } from '../../shared/trade'

const decimalString = z.string().refine((value) => {
  try {
    compareDecimals(value, '0')
    return true
  } catch {
    return false
  }
}, 'Invalid decimal')

export const salesReturnStatusSchema = z.enum(SALES_RETURN_STATUSES)

export const salesReturnEntitySchema = z.strictObject({
  id: z.number().int(),
  return_no: z.string(),
  sales_order_id: z.number().int().nullable(),
  customer_id: z.number().int(),
  return_date: z.string(),
  warehouse_id: z.number().int(),
  reason: z.string(),
  status: salesReturnStatusSchema,
  total_amount: decimalString,
  remarks: z.string().nullable(),
  approved_by: z.number().int().nullable(),
  approved_at: z.string().nullable(),
  rejected_reason: z.string().nullable(),
  created_by: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const salesReturnSchema = salesReturnEntitySchema.extend({
  customer_name: z.string().nullable().optional(),
  sales_order_no: z.string().nullable().optional(),
})

export const salesReturnItemEntitySchema = z.strictObject({
  id: z.number().int(),
  return_id: z.number().int(),
  line_no: z.number().int(),
  product_id: z.number().int(),
  quantity: decimalString,
  quantity_alt: decimalString,
  unit_price: decimalString,
  unit_price_foreign: decimalString,
  discount_percent: decimalString,
  tax_percent: decimalString,
  subtotal: decimalString,
  tax_amount: decimalString,
  discount_amount: decimalString,
  total_amount: decimalString,
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  color_no: z.string(),
  dye_lot_no: z.string(),
  batch_no: z.string(),
})

export const salesReturnItemSchema = salesReturnItemEntitySchema.extend({
  product_name: z.string().nullable().optional(),
  product_code: z.string().nullable().optional(),
})

export type SalesReturn = z.infer<typeof salesReturnSchema>
export type SalesReturnItem = z.infer<typeof salesReturnItemSchema>

export interface CreateSalesReturnHeader {
  order_id?: number
  customer_id: number
  return_date: string
  warehouse_id: number
  reason_type: string
  reason_detail?: string
  notes?: string
}

export interface CreateSalesReturnItem {
  line_no?: number
  product_id: number
  quantity: string
  unit_price: string
  tax_percent?: string
  discount_percent?: string
  quantity_alt?: string
  reason?: string
}
