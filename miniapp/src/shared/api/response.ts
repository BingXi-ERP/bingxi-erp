// miniapp/src/shared/api/response.ts
import { AppError } from './errors'

export { AppError, isAppError } from './errors'

/**
 * 错误码到 HTTP 状态码的回退映射：仅在响应本身没带传输层状态码时使用。
 * 键值与后端逐条对齐：backend/src/utils/error.rs 的 error_code() × error_status_and_type()
 * （TIMEOUT=408 REQUEST_TIMEOUT、NOT_IMPLEMENTED=501），
 * backend/src/middleware/csrf.rs 三个 CSRF 常量统一 403。
 * 用 Map 而非对象字面量，杜绝 code 命中原型链（constructor/toString 等）取到脏值。
 * 词表外的未知 code 不猜状态码（回退 undefined），消费方必须处理 undefined 分支。
 */
const ERROR_CODE_HTTP = new Map<string, number>([
  ['UNAUTHORIZED', 401],
  ['FORBIDDEN', 403],
  ['NOT_FOUND', 404],
  ['BAD_REQUEST', 400],
  ['VALIDATION_ERROR', 400],
  ['BUSINESS_ERROR', 400],
  ['CSRF_TOKEN_MISSING', 403],
  ['CSRF_TOKEN_INVALID', 403],
  ['CSRF_TOKEN_BINDING_MISMATCH', 403],
  ['TOO_MANY_REQUESTS', 429],
  ['TIMEOUT', 408],
  ['NOT_IMPLEMENTED', 501],
  ['SERVICE_UNAVAILABLE', 503],
  ['DATABASE_ERROR', 500],
  ['INTERNAL_ERROR', 500],
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 成功信封归一化：后端成功响应为 { code: 200, data, total? }。
 * 任何缺 code、code 非 200、缺 data 的畸形响应都显式抛错，不做静默兜底。
 */
export function normalizeSuccess(raw: unknown): unknown {
  if (!isRecord(raw)) throw new Error('Response body must be an object')
  if (typeof raw.code !== 'number') throw new Error('Response envelope is missing code')
  if (raw.code !== 200) throw new Error(`Unexpected success response code: ${raw.code}`)
  if (!('data' in raw)) throw new Error('Success response is missing data')
  return raw.data
}

/**
 * 失败响应归一化为 AppError。后端失败信封（utils/error.rs ErrorResponse）保证四字段
 * code/message/trace_id: string、timestamp: number 恒在且类型固定，任何缺失或类型错误
 * 都属于非预期响应，显式抛错而不是用 code 冒充 message、用 undefined 丢掉追踪链：
 * - 非对象响应体：返回 NETWORK_ERROR（无信封可校验，按传输层错误归类，保留 httpStatus）；
 * - 对象但 code 缺失或非字符串：抛 UNKNOWN_ERROR；
 * - code 合法但 message/trace_id/timestamp 缺失或类型错误：抛 INVALID_RESPONSE，错误文案点名坏字段。
 * httpStatus 优先取传输层真实状态码，缺省时按 ERROR_CODE_HTTP 回退，未知 code 留 undefined。
 */
export function normalizeError(raw: unknown, httpStatus?: number): AppError {
  if (!isRecord(raw)) {
    return new AppError({
      code: 'NETWORK_ERROR',
      message: 'Invalid network response format',
      httpStatus,
    })
  }
  if (typeof raw.code !== 'string') {
    throw new AppError({
      code: 'UNKNOWN_ERROR',
      message: 'Failure envelope is missing a valid code field',
      httpStatus,
    })
  }
  const code = raw.code
  const { message, trace_id: traceId, timestamp } = raw
  if (typeof message !== 'string' || typeof traceId !== 'string' || typeof timestamp !== 'number') {
    const invalidFields: string[] = []
    if (typeof message !== 'string') invalidFields.push('message')
    if (typeof traceId !== 'string') invalidFields.push('trace_id')
    if (typeof timestamp !== 'number') invalidFields.push('timestamp')
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Failure envelope fields are missing or invalid: ${invalidFields.join(', ')} (code=${code})`,
      httpStatus,
    })
  }
  return new AppError({
    code,
    message,
    traceId,
    timestamp,
    httpStatus: httpStatus ?? ERROR_CODE_HTTP.get(code),
  })
}
