// miniapp/src/shared/api/errors.ts

/**
 * 后端失败响应的统一错误模型，对应 backend AppError 形态：字符串 code + message + trace_id + timestamp。
 * httpStatus 保留真实 HTTP 状态码，供会话与鉴权分支消费；recoveryToken 承载后端给出的可恢复操作凭证，
 * 缺省即 undefined，不用默认值兜底掩盖字段缺失。
 */
export class AppError extends Error {
  readonly code: string
  readonly traceId?: string
  readonly timestamp?: number
  readonly httpStatus?: number
  readonly recoveryToken?: string

  constructor(input: {
    code: string
    message: string
    traceId?: string
    timestamp?: number
    httpStatus?: number
    recoveryToken?: string
  }) {
    super(input.message)
    this.name = 'AppError'
    this.code = input.code
    this.traceId = input.traceId
    this.timestamp = input.timestamp
    this.httpStatus = input.httpStatus
    this.recoveryToken = input.recoveryToken
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}
