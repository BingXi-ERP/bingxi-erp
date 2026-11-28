import { z } from 'zod'

export const productStatusSchema = z.enum(['active', 'inactive'])

export const productSchema = z.strictObject({
  id: z.number().int(),
  name: z.string(),
  code: z.string(),
  barcode: z.string().nullable().optional(),
  category_id: z.number().int().nullable().optional(),
  specification: z.string().nullable().optional(),
  unit: z.string().optional(),
  standard_price: z.string().nullable().optional(),
  cost_price: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: productStatusSchema,
  is_deleted: z.boolean().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  product_type: z.string().optional(),
  fabric_composition: z.string().nullable().optional(),
  yarn_count: z.string().nullable().optional(),
  density: z.string().nullable().optional(),
  width: z.string().nullable().optional(),
  gram_weight: z.string().nullable().optional(),
  structure: z.string().nullable().optional(),
  finish: z.string().nullable().optional(),
  width_needle_included_cm: z.string().nullable().optional(),
  weight_tolerance: z.string().nullable().optional(),
  spandex_percent: z.string().nullable().optional(),
  usage: z.string().nullable().optional(),
  min_order_quantity: z.string().nullable().optional(),
  lead_time: z.number().int().nullable().optional(),
  meters_per_piece: z.string().nullable().optional(),
  supplier_product_code: z.string().nullable().optional(),
  supplier_id: z.number().int().nullable().optional(),
  is_batch_managed: z.boolean().nullable().optional(),
  batch_level: z.string().nullable().optional(),
  execution_standard: z.string().nullable().optional(),
  factory_name: z.string().nullable().optional(),
  factory_address: z.string().nullable().optional(),
  product_grade: z.string().nullable().optional(),
  safety_category: z.string().nullable().optional(),
  product_name: z.string().optional(),
  product_code: z.string().optional(),
  price: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  meters_per_kg: z.string().nullable().optional(),
  category_name: z.string().nullable().optional(),
})

export type Product = z.infer<typeof productSchema>

export const productColorSchema = z.strictObject({
  id: z.number().int(),
  product_id: z.number().int(),
  color_no: z.string(),
  color_name: z.string(),
  pantone_code: z.string().nullable().optional(),
  color_type: z.string(),
  dye_formula: z.string().nullable().optional(),
  extra_cost: z.string(),
  color_fastness_grade: z.string().nullable().optional(),
  is_active: z.boolean(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export type ProductColor = z.infer<typeof productColorSchema>

export const colorCardStatusSchema = z.enum([
  'draft',
  'issued',
  'received',
  'used',
  'expired',
  'archived',
  'lost',
])

export const colorCardItemSchema = z.strictObject({
  id: z.number().int(),
  color_card_id: z.number().int(),
  color_code: z.string(),
  color_name: z.string(),
  rgb_r: z.number().int(),
  rgb_g: z.number().int(),
  rgb_b: z.number().int(),
  cmyk_c: z.string().nullable().optional(),
  cmyk_m: z.string().nullable().optional(),
  cmyk_y: z.string().nullable().optional(),
  cmyk_k: z.string().nullable().optional(),
  lab_l: z.string().nullable().optional(),
  lab_a: z.string().nullable().optional(),
  lab_b: z.string().nullable().optional(),
  pantone_code: z.string().nullable().optional(),
  cncs_code: z.string().nullable().optional(),
  custom_code: z.string().nullable().optional(),
  hex_value: z.string(),
  dye_recipe_id: z.number().int().nullable().optional(),
  product_color_price_id: z.number().int().nullable().optional(),
  swatch_image_url: z.string().nullable().optional(),
  sequence: z.number().int(),
})

export const colorCardSchema = z.strictObject({
  id: z.number().int(),
  card_no: z.string(),
  card_name: z.string(),
  card_type: z.string(),
  season: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  total_colors: z.number().int(),
  status: colorCardStatusSchema,
  cover_image_url: z.string().nullable().optional(),
  stock_quantity: z.number().int(),
  issued_quantity: z.number().int(),
  created_at: z.string().optional(),
})

export const colorCardDetailSchema = colorCardSchema.extend({
  description: z.string().nullable().optional(),
  items: z.array(colorCardItemSchema),
  updated_at: z.string().optional(),
})

export type ColorCard = z.infer<typeof colorCardSchema>
export type ColorCardDetail = z.infer<typeof colorCardDetailSchema>
