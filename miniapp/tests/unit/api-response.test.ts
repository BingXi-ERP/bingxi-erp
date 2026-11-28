// miniapp/tests/unit/api-response.test.ts
import { describe, expect, it } from 'vitest'
import {
  AppError,
  isAppError,
  normalizeError,
  normalizeSuccess,
} from '../../src/shared/api/response'

/**
 * 后端失败码全量词表 × HTTP 状态码，来源：
 * backend/src/utils/error.rs 的 error_code() 与 error_status_and_type()（TIMEOUT=408、NOT_IMPLEMENTED=501），
 * backend/src/middleware/csrf.rs:411（三个 CSRF 常量统一 FORBIDDEN=403）。
 */
const BACKEND_ERROR_HTTP: [string, number][] = [
  ['BAD_REQUEST', 400],
  ['VALIDATION_ERROR', 400],
  ['BUSINESS_ERROR', 400],
  ['UNAUTHORIZED', 401],
  ['FORBIDDEN', 403],
  ['CSRF_TOKEN_MISSING', 403],
  ['CSRF_TOKEN_INVALID', 403],
  ['CSRF_TOKEN_BINDING_MISMATCH', 403],
  ['DATABASE_ERROR', 500],
  ['INTERNAL_ERROR', 500],
  ['NOT_FOUND', 404],
  ['NOT_IMPLEMENTED', 501],
  ['TOO_MANY_REQUESTS', 429],
  ['TIMEOUT', 408],
  ['SERVICE_UNAVAILABLE', 503],
]

/** 四字段齐备且类型正确的合法信封（对齐 backend ErrorResponse { code, message, trace_id, timestamp }） */
function envelope(code: string): Record<string, unknown> {
  return { code, message: '后端提示文案', trace_id: 'trace-abc', timestamp: 1700000000 }
}

/** 断言被检函数必须抛出，返回抛出的值供逐字段检查；未抛出即测试失败，不吞异常 */
function captureThrown(run: () => unknown): unknown {
  try {
    run()
  } catch (caught) {
    return caught
  }
  throw new Error('期望 normalizeError 抛出异常，但它正常返回了')
}

describe('API response normalization', () => {
  it('normalizes the backend success envelope without changing data', () => {
    expect(normalizeSuccess({ code: 200, data: { items: [], total: 0 }, total: 0 })).toEqual({
      items: [],
      total: 0,
    })
  })

  it('normalizes string error codes and keeps trace id', () => {
    const error = normalizeError(
      {
        code: 'VALIDATION_ERROR',
        message: '字段校验失败',
        trace_id: 'trace-123',
        timestamp: 100,
      },
      400,
    )
    expect(isAppError(error)).toBe(true)
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '字段校验失败',
      traceId: 'trace-123',
      timestamp: 100,
      httpStatus: 400,
    })
  })

  it('rejects malformed responses instead of masking them', () => {
    expect(() => normalizeSuccess({ data: {} })).toThrow(/missing code/i)
  })
})

describe('error code → httpStatus fallback table', () => {
  it.each(BACKEND_ERROR_HTTP)(
    'maps %s to %i when the transport status is absent',
    (code, status) => {
      const error = normalizeError(envelope(code))
      expect(error.code).toBe(code)
      expect(error.httpStatus).toBe(status)
    },
  )

  it('prefers the transport status over the fallback table', () => {
    // 网关改写后传输层状态码与 code 回退值不一致时，必须取真实传输状态码
    const error = normalizeError(envelope('TIMEOUT'), 502)
    expect(error.httpStatus).toBe(502)
  })

  it('leaves httpStatus undefined for unknown codes without a transport status', () => {
    const error = normalizeError(envelope('SOME_FUTURE_CODE'))
    expect(error.httpStatus).toBeUndefined()
  })

  it.each(['toString', 'constructor', 'hasOwnProperty', 'valueOf', '__proto__'])(
    'never resolves the inherited key %s from the fallback table',
    (code) => {
      const error = normalizeError(envelope(code))
      expect(error.code).toBe(code)
      expect(error.httpStatus).toBeUndefined()
    },
  )
})

describe('malformed failure envelopes are rejected, not masked', () => {
  it('classifies non-object bodies as NETWORK_ERROR', () => {
    const error = normalizeError('<html>502 Bad Gateway</html>', 502)
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe('NETWORK_ERROR')
    expect(error.httpStatus).toBe(502)
  })

  it.each([
    ['code entirely missing', { message: 'm', trace_id: 't', timestamp: 1 }],
    ['code is a number', { code: 500, message: 'm', trace_id: 't', timestamp: 1 }],
    ['code is null', { code: null, message: 'm', trace_id: 't', timestamp: 1 }],
  ] as [string, Record<string, unknown>][])(
    'throws UNKNOWN_ERROR when the envelope has %s',
    (_label, raw) => {
      const caught = captureThrown(() => normalizeError(raw, 500))
      expect(caught).toBeInstanceOf(AppError)
      const error = caught as AppError
      expect(error.code).toBe('UNKNOWN_ERROR')
      expect(error.httpStatus).toBe(500)
      expect(isAppError(error)).toBe(true)
    },
  )

  it.each([
    ['message missing', { code: 'BAD_REQUEST', trace_id: 't', timestamp: 1 }],
    ['message wrong type', { code: 'BAD_REQUEST', message: 7, trace_id: 't', timestamp: 1 }],
    ['trace_id missing', { code: 'BAD_REQUEST', message: 'm', timestamp: 1 }],
    ['trace_id wrong type', { code: 'BAD_REQUEST', message: 'm', trace_id: null, timestamp: 1 }],
    ['timestamp missing', { code: 'BAD_REQUEST', message: 'm', trace_id: 't' }],
    ['timestamp wrong type', { code: 'BAD_REQUEST', message: 'm', trace_id: 't', timestamp: '1' }],
  ] as [string, Record<string, unknown>][])(
    'throws INVALID_RESPONSE when the envelope has %s',
    (label, raw) => {
      const caught = captureThrown(() => normalizeError(raw, 400))
      expect(caught).toBeInstanceOf(AppError)
      const error = caught as AppError
      expect(error.code).toBe('INVALID_RESPONSE')
      expect(error.httpStatus).toBe(400)
      // 抛出的错误必须点名是哪一字段坏了（message → 'message'，trace_id → 'trace_id'，timestamp → 'timestamp'）
      const field = label.split(' ')[0]
      expect(error.message).toContain(field)
      expect(error.message).toContain('BAD_REQUEST')
    },
  )

  it('does not mask a valid envelope with extra unknown fields', () => {
    const error = normalizeError({ ...envelope('NOT_FOUND'), extra: true }, 404)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.httpStatus).toBe(404)
  })
})
