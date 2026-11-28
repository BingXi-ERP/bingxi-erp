import { z } from 'zod'
import { compareDecimals, SALES_ORDER_STATUSES } from '../../shared/trade'

export const salesOrderStatusSchema = z.enum(SALES_ORDER_STATUSES)

const decimalString = z.string().refine((value) => {
  try {
    compareDecimals(value, '0')
    return true
  } catch {
    return false
  }
}, 'Invalid decimal')

const positiveDecimalString = decimalString.refine(
  (value) => compareDecimals(value, '0') > 0,
  'Must be greater than zero',
)

export const orderItemSchema = z.strictObject({
  id: z.number().int(),
  order_id: z.number().int(),
  product_id: z.number().int(),
  product_code: z.string().nullable().optional(),
  product_name: z.string().nullable().optional(),
  quantity: decimalString,
  unit_price: decimalString,
  discount_percent: decimalString.optional(),
  tax_percent: decimalString.optional(),
  subtotal: decimalString.optional(),
  tax_amount: decimalString.optional(),
  discount_amount: decimalString.optional(),
  total_amount: decimalString.optional(),
  shipped_quantity: decimalString.optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  color_no: z.string(),
  color_name: z.string().nullable().optional(),
  pantone_code: z.string().nullable().optional(),
  grade_required: z.string().nullable().optional(),
  quantity_meters: decimalString.optional(),
  quantity_kg: decimalString.optional(),
  gram_weight: decimalString.nullable().optional(),
  width: decimalString.nullable().optional(),
  paper_tube_weight: decimalString.nullable().optional(),
  is_net_weight: z.boolean().nullable().optional(),
  batch_requirement: z.string().nullable().optional(),
  dye_lot_requirement: z.string().nullable().optional(),
  base_price: decimalString.nullable().optional(),
  color_extra_cost: decimalString.optional(),
  grade_price_diff: decimalString.optional(),
  final_price: decimalString.nullable().optional(),
  shipped_quantity_meters: decimalString.optional(),
  shipped_quantity_kg: decimalString.optional(),
  quantity_tolerance_pct: decimalString.nullable().optional(),
  fulfillment_source: z.enum(['production', 'stock', 'purchase']).nullable().optional(),
})

export const salesOrderSchema = z.strictObject({
  id: z.number().int(),
  order_no: z.string(),
  customer_id: z.number().int(),
  customer_name: z.string().nullable().optional(),
  opportunity_id: z.number().int().nullable().optional(),
  order_date: z.string().optional(),
  required_date: z.string().nullable().optional(),
  ship_date: z.string().nullable().optional(),
  status: salesOrderStatusSchema,
  subtotal: decimalString.optional(),
  tax_amount: decimalString.optional(),
  discount_amount: decimalString.optional(),
  shipping_cost: decimalString.optional(),
  total_amount: decimalString.optional(),
  paid_amount: decimalString.optional(),
  balance_amount: decimalString.optional(),
  shipping_address: z.string().nullable().optional(),
  billing_address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  batch_no: z.string().nullable().optional(),
  color_no: z.string().nullable().optional(),
  dye_lot_no: z.string().nullable().optional(),
  grade: z.string().nullable().optional(),
  packaging_requirement: z.string().nullable().optional(),
  quality_standard: z.string().nullable().optional(),
  created_by: z.number().int().nullable().optional(),
  creator_name: z.string().nullable().optional(),
  contact_person: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  approved_by: z.number().int().nullable().optional(),
  approved_at: z.string().nullable().optional(),
  approval_reason: z.string().nullable().optional(),
  rejected_reason: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  items: z.array(orderItemSchema),
})

export type SalesOrder = z.infer<typeof salesOrderSchema>
export type SalesOrderItem = z.infer<typeof orderItemSchema>

export const createOrderItemSchema = z.strictObject({
  product_id: z.number().int().positive(),
  quantity: positiveDecimalString,
  unit_price: positiveDecimalString,
  discount_percent: decimalString.optional(),
  tax_percent: decimalString.optional(),
  notes: z.string().optional(),
  color_no: z.string().optional(),
  color_name: z.string().optional(),
  pantone_code: z.string().optional(),
  grade_required: z.string().optional(),
  quantity_meters: decimalString.optional(),
  quantity_kg: decimalString.optional(),
  gram_weight: decimalString.optional(),
  width: decimalString.optional(),
  paper_tube_weight: decimalString.optional(),
  is_net_weight: z.boolean().optional(),
  batch_requirement: z.string().optional(),
  dye_lot_requirement: z.string().optional(),
  base_price: decimalString.optional(),
  color_extra_cost: decimalString.optional(),
  grade_price_diff: decimalString.optional(),
  final_price: decimalString.optional(),
  piece_no: z.string().optional(),
  quantity_tolerance_pct: decimalString
    .refine((value) => {
      const normalized = Number(value)
      return normalized >= 0 && normalized <= 100
    }, 'Quantity tolerance must be between 0 and 100')
    .optional(),
  fulfillment_source: z.enum(['production', 'stock', 'purchase']).optional(),
})

export const createOrderSchema = z.strictObject({
  customer_id: z.number().int().positive(),
  opportunity_id: z.number().int().positive().optional(),
  order_date: z.string().optional(),
  contact_person: z.string().optional(),
  contact_phone: z.string().optional(),
  required_date: z.string().optional(),
  status: z.literal('draft').optional(),
  shipping_address: z.string().optional(),
  billing_address: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(createOrderItemSchema).min(1),
  payment_terms: z.string().optional(),
  remarks: z.string().optional(),
  batch_no: z.string().optional(),
  color_no: z.string().optional(),
  dye_lot_no: z.string().optional(),
  grade: z.string().optional(),
  packaging_requirement: z.string().optional(),
  quality_standard: z.string().optional(),
})

export type CreateOrderPayload = z.infer<typeof createOrderSchema>
