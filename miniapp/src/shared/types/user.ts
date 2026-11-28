import { z } from 'zod'

/** 与 backend/src/handlers/auth_handler.rs UserInfo 逐字段对齐；可空 Rust 字段在 JSON 中仍恒为 null。 */
export const userInfoSchema = z.strictObject({
  id: z.number().int(),
  username: z.string().min(1),
  email: z.string().nullable(),
  role_id: z.number().int().nullable(),
  role_name: z.string().nullable(),
  permissions: z.array(z.string().min(1)),
  phone: z.string().nullable(),
  department_id: z.number().int().nullable(),
  department_name: z.string().nullable(),
  is_totp_enabled: z.boolean(),
  real_name: z.string().nullable(),
  avatar: z.string().nullable(),
  agreed_to_terms_at: z.string().nullable(),
})

export type UserInfo = z.infer<typeof userInfoSchema>
