import { z } from 'zod'

export const customerTypeSchema = z.enum([
  'retail',
  'wholesale',
  'distributor',
  'manufacturer',
  'other',
])

export const customerStatusSchema = z.enum(['active', 'inactive', 'merged', 'blacklist'])

export const customerSchema = z.strictObject({
  id: z.number().int(),
  customer_code: z.string(),
  customer_name: z.string().min(1),
  contact_person: z.string().nullable().optional(),
  contact_phone: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  credit_limit: z.string().optional(),
  payment_terms: z.number().int().optional(),
  tax_id: z.string().nullable().optional(),
  bank_name: z.string().nullable().optional(),
  bank_account: z.string().nullable().optional(),
  status: customerStatusSchema,
  customer_type: customerTypeSchema,
  tier: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_by: z.number().int().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  customer_industry: z.string().nullable().optional(),
  main_products: z.string().nullable().optional(),
  annual_purchase: z.string().nullable().optional(),
  quality_requirement: z.string().nullable().optional(),
  inspection_standard: z.string().nullable().optional(),
  owner_id: z.number().int().optional(),
  department_id: z.number().int().nullable().optional(),
  owner_assigned_at: z.string().nullable().optional(),
  special_process: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  pool_recycle_reason: z.string().nullable().optional(),
})

export type Customer = z.infer<typeof customerSchema>

export interface CustomerListQuery {
  page?: number
  page_size?: number
  status?: Customer['status']
  customer_type?: Customer['customer_type']
  keyword?: string
}

export interface CustomerInput {
  customer_code?: string
  customer_name: string
  contact_person?: string
  contact_phone?: string
  contact_email?: string
  address?: string
  city?: string
  province?: string
  country?: string
  postal_code?: string
  credit_limit?: string
  payment_terms?: number
  tax_id?: string
  bank_name?: string
  bank_account?: string
  customer_type?: Customer['customer_type']
  status?: 'active' | 'inactive'
  customer_industry?: string
  main_products?: string
  annual_purchase?: string
  quality_requirement?: string
  inspection_standard?: string
  notes?: string
}
