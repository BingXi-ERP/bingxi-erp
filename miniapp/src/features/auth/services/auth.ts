import { z } from 'zod'
import { apiClient } from '../../../shared/api/client'
import {
  AUTH_LOGIN_PATH,
  AUTH_LOGOUT_PATH,
  AUTH_ME_PATH,
  MINIAPP_LOGIN_PATH,
} from '../../../shared/api/contracts'
import { AppError } from '../../../shared/api/response'
import { userInfoSchema, type UserInfo } from '../../../shared/types/user'

const loginResponseSchema = z.strictObject({
  csrf_token: z.string().min(1),
  user: userInfoSchema,
  permissions: z.array(z.string().min(1)),
  password_expired: z.boolean(),
})

export type LoginResponse = z.infer<typeof loginResponseSchema>

export interface PasswordLoginPayload {
  username: string
  password: string
  totp_token?: string
  recovery_code?: string
}

export interface MiniappLoginPayload {
  code: string
  phone_code: string
}

function parseResponse<T>(schema: z.ZodType<T>, value: unknown, path: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const fields = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}:${issue.code}`)
      .join(', ')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid auth response from ${path}: ${fields}`,
    })
  }
  return result.data
}

export const authService = {
  getCurrentUser(): Promise<UserInfo> {
    return apiClient
      .get<unknown>(AUTH_ME_PATH)
      .then((value) => parseResponse(userInfoSchema, value, AUTH_ME_PATH))
  },

  loginWithPassword(payload: PasswordLoginPayload): Promise<LoginResponse> {
    return apiClient
      .post<unknown>(AUTH_LOGIN_PATH, payload)
      .then((value) => parseResponse(loginResponseSchema, value, AUTH_LOGIN_PATH))
  },

  loginWithMiniapp(payload: MiniappLoginPayload): Promise<LoginResponse> {
    return apiClient
      .post<unknown>(MINIAPP_LOGIN_PATH, payload)
      .then((value) => parseResponse(loginResponseSchema, value, MINIAPP_LOGIN_PATH))
  },

  async logout(): Promise<void> {
    const value = await apiClient.post<unknown>(AUTH_LOGOUT_PATH)
    parseResponse(z.object({ success: z.literal(true) }), value, AUTH_LOGOUT_PATH)
  },
}
