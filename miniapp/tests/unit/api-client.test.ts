// miniapp/tests/unit/api-client.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
const storage = new Map<string, unknown>()
vi.stubGlobal('uni', {
  request,
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
})

import { apiClient } from '../../src/shared/api/client'
import { logger } from '../../src/shared/api/logger'

/** 合法后端失败信封（四字段齐全），按用例覆写 code */
function errorEnvelope(code: string, traceId = 'trace-x'): Record<string, unknown> {
  return { code, message: '后端提示文案', trace_id: traceId, timestamp: 1700000000 }
}

function okEnvelope(data: unknown): Record<string, unknown> {
  return { code: 200, data }
}

/** 取第 i 次 uni.request 调用的入参（noUncheckedIndexedAccess 下统一走这里收窄类型） */
interface SentOptions {
  url: string
  method: string
  header: Record<string, string>
}
function sentOptions(i: number): SentOptions | undefined {
  return request.mock.calls[i]?.[0] as SentOptions | undefined
}

describe('apiClient', () => {
  beforeEach(() => {
    request.mockReset()
    storage.clear()
    uni.setStorageSync('bingxiCsrf', 'csrf-1')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends GET with normalized query and returns data', async () => {
    request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, data: { items: [] } },
      header: {},
    })
    await expect(
      apiClient.get('/api/v1/erp/products', { page: 1, page_size: 10, keyword: '', empty: null }),
    ).resolves.toEqual({ items: [] })
    const first = sentOptions(0)
    expect(first).toMatchObject({
      method: 'GET',
      header: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    // 空串与 null 筛选双侧剔除（与 frontend request.ts / 后端 normalize_empty_query_params 对齐）
    expect(first?.url).toBe('https://erp.example.test/api/v1/erp/products?page=1&page_size=10')
  })

  it('resolves path parameters before sending the request', async () => {
    request.mockResolvedValue({
      statusCode: 200,
      data: okEnvelope([]),
      header: {},
    })

    await apiClient.get('/api/v1/erp/products/{id}/colors', undefined, {
      pathParams: { id: 42 },
    })

    expect(sentOptions(0)?.url).toBe('https://erp.example.test/api/v1/erp/products/42/colors')
  })

  it('replays once with the recovered CSRF token', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 403,
        data: {
          code: 'CSRF_TOKEN_INVALID',
          message: 'CSRF Token 无效',
          trace_id: 'trace-1',
          timestamp: 1,
        },
        header: { 'x-new-csrf-token': 'csrf-2' },
      })
      .mockResolvedValueOnce({
        statusCode: 200,
        data: { code: 200, data: { id: 1 } },
        header: {},
      })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 1 })
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-2')
    // 重放请求必须携带恢复令牌，且首次请求携带的是消费掉的一次性令牌
    expect(sentOptions(0)?.header['x-csrf-token']).toBe('csrf-1')
    expect(sentOptions(1)?.header['x-csrf-token']).toBe('csrf-2')
  })

  it('does not replay CSRF binding mismatch', async () => {
    request.mockResolvedValue({
      statusCode: 403,
      data: {
        code: 'CSRF_TOKEN_BINDING_MISMATCH',
        message: '安全令牌不匹配',
        trace_id: 'trace-2',
        timestamp: 1,
      },
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'CSRF_TOKEN_BINDING_MISMATCH',
      traceId: 'trace-2',
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it('replays a 403-bearing request at most once', async () => {
    request.mockResolvedValue({
      statusCode: 403,
      data: errorEnvelope('CSRF_TOKEN_INVALID', 'trace-loop'),
      header: { 'x-new-csrf-token': 'csrf-next' },
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'CSRF_TOKEN_INVALID',
      httpStatus: 403,
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('replays CSRF_TOKEN_MISSING with its recovery token', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 403,
        data: errorEnvelope('CSRF_TOKEN_MISSING', 'trace-missing'),
        header: { 'x-new-csrf-token': 'csrf-2' },
      })
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 2 }), header: {} })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 2 })
    expect(request).toHaveBeenCalledTimes(2)
    expect(sentOptions(1)?.header['x-csrf-token']).toBe('csrf-2')
  })

  it('does not replay a plain FORBIDDEN 403 even when a recovery token header is present', async () => {
    request.mockResolvedValue({
      statusCode: 403,
      data: errorEnvelope('FORBIDDEN', 'trace-fbd'),
      header: { 'x-new-csrf-token': 'csrf-ghost' },
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it('does not replay a non-object 403 carrying a token header, and warns instead', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    request.mockResolvedValue({
      statusCode: 403,
      data: '<html>Blocked by proxy</html>',
      header: { 'x-new-csrf-token': 'csrf-ghost' },
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      httpStatus: 403,
    })
    expect(request).toHaveBeenCalledOnce()
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(messages).toContain('csrf.replay_not_eligible')
    // 畸形 403 下发的令牌不落盘：违约代理的 ghost 令牌不得污染 storage
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })

  it('does not persist the recovery token carried by a non-replayable 403', async () => {
    request.mockResolvedValue({
      statusCode: 403,
      data: errorEnvelope('FORBIDDEN', 'trace-ghost2'),
      header: { 'x-new-csrf-token': 'csrf-ghost' },
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
      httpStatus: 403,
    })
    // 授权语义的 403 即使带合法信封与令牌也不得落盘（队列已消费入队令牌，storage 应维持空）
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })

  it('warns on a non-replayable 403 even when no recovery token is issued', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    request.mockResolvedValue({
      statusCode: 403,
      data: errorEnvelope('FORBIDDEN', 'trace-notoken'),
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(messages).toContain('csrf.replay_not_eligible')
  })

  it('warns when a replayable CSRF 403 arrives without a recovery token', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    request.mockResolvedValue({
      statusCode: 403,
      data: errorEnvelope('CSRF_TOKEN_INVALID', 'trace-notoken-csrf'),
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'CSRF_TOKEN_INVALID',
    })
    expect(request).toHaveBeenCalledOnce()
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(messages).toContain('csrf.replay_not_eligible')
  })

  it('consumes the stored token once per queued request and sends it as x-csrf-token', async () => {
    request.mockResolvedValue({ statusCode: 200, data: okEnvelope({ id: 5 }), header: {} })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 5 })
    expect(sentOptions(0)?.header['x-csrf-token']).toBe('csrf-1')
    // 一次性取用：入队令牌已被消费，落盘不再有残留
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })

  it('persists the rotated token carried by a success response', async () => {
    request.mockResolvedValue({
      statusCode: 200,
      data: okEnvelope({ id: 6 }),
      header: { 'x-new-csrf-token': 'csrf-rotated' },
    })
    await apiClient.post('/api/v1/erp/sales/orders', {})
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-rotated')
  })

  it('falls back to the csrf_token cookie when no recovery header is present', async () => {
    request.mockResolvedValue({
      statusCode: 200,
      data: okEnvelope({ id: 7 }),
      header: {},
      cookies: ['csrf_token=cookie-token; Path=/; HttpOnly'],
    })
    await apiClient.post('/api/v1/erp/sales/orders', {})
    expect(uni.getStorageSync('bingxiCsrf')).toBe('cookie-token')
  })

  it('retries a 401 once after the session read-back confirms the session is alive', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 401,
        data: errorEnvelope('UNAUTHORIZED', 'trace-401'),
        header: {},
      })
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 1 }), header: {} }) // /auth/me 回读
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 8 }), header: {} }) // 重试
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 8 })
    expect(request).toHaveBeenCalledTimes(3)
    expect(sentOptions(1)?.url).toBe('https://erp.example.test/api/v1/erp/auth/me')
    expect(sentOptions(1)?.method).toBe('GET')
  })

  it('does not retry a 401 when the session read-back says the session is dead', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 401,
        data: errorEnvelope('UNAUTHORIZED', 'trace-dead'),
        header: {},
      })
      .mockResolvedValueOnce({
        statusCode: 401,
        data: errorEnvelope('UNAUTHORIZED', 'trace-me'),
        header: {},
      })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      traceId: 'trace-dead',
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('retries a 401 carrying the fresh token issued with the 401 response', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 401,
        data: errorEnvelope('UNAUTHORIZED', 'trace-401t'),
        header: { 'x-new-csrf-token': 'csrf-9' },
      })
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 1 }), header: {} }) // /auth/me 回读
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 9 }), header: {} }) // 重试
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 9 })
    expect(request).toHaveBeenCalledTimes(3)
    expect(sentOptions(2)?.header['x-csrf-token']).toBe('csrf-9')
  })

  it('keeps both budgets working: CSRF 403 replay followed by a 401 session retry', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 403,
        data: errorEnvelope('CSRF_TOKEN_INVALID', 'trace-c1'),
        header: { 'x-new-csrf-token': 'csrf-2' },
      })
      .mockResolvedValueOnce({
        statusCode: 401,
        data: errorEnvelope('UNAUTHORIZED', 'trace-a1'),
        header: {},
      })
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 1 }), header: {} }) // /auth/me 回读
      .mockResolvedValueOnce({ statusCode: 200, data: okEnvelope({ id: 10 }), header: {} }) // 最终重试
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 10 })
    expect(request).toHaveBeenCalledTimes(4)
    // 403 重放携带恢复令牌；401 后的重试沿用同一枚当前令牌，不回退到已消费旧值
    expect(sentOptions(1)?.header['x-csrf-token']).toBe('csrf-2')
    expect(sentOptions(3)?.header['x-csrf-token']).toBe('csrf-2')
  })

  it('never replays on 5xx and keeps the backend trace id', async () => {
    request.mockResolvedValue({
      statusCode: 500,
      data: errorEnvelope('DATABASE_ERROR', 'trace-500'),
      header: { 'x-new-csrf-token': 'csrf-x' },
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'DATABASE_ERROR',
      traceId: 'trace-500',
      httpStatus: 500,
    })
    expect(request).toHaveBeenCalledOnce()
  })

  it('warns and fails closed on a malformed failure envelope instead of masking it', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    request.mockResolvedValue({
      statusCode: 403,
      // 缺 message/trace_id/timestamp → normalizeError 抛 INVALID_RESPONSE
      data: { code: 'CSRF_TOKEN_INVALID' },
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 403,
    })
    expect(request).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalled()
    const message = warn.mock.calls[0]?.[0] as string | undefined
    expect(String(message)).toContain('malformed')
  })

  it('warns and fails closed on a malformed success envelope (HTTP 200 but no data)', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined)
    request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200 },
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      httpStatus: 200,
    })
    expect(warn).toHaveBeenCalled()
  })

  it('classifies transport failures as NETWORK_ERROR AppErrors', async () => {
    request.mockRejectedValue({ errMsg: 'request:fail timeout' })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('converts a synchronous uni.request throw into a NETWORK_ERROR AppError', async () => {
    request.mockImplementationOnce(() => {
      throw new Error('sync boot failure')
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('classifies a non-object thenable rejection as NETWORK_ERROR', async () => {
    request.mockReturnValueOnce(Promise.reject('bare string reason'))
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: 'Network request failed: bare string reason',
    })
  })

  it('settles as NETWORK_ERROR when subscribing to the returned thenable throws', async () => {
    request.mockReturnValueOnce({
      then: () => {
        throw new Error('hostile thenable')
      },
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('settles as NETWORK_ERROR when reading the then property itself throws', async () => {
    // 宿主把 then 做成抛错 getter：属性读取也必须落在 try 内并归一为 NETWORK_ERROR，
    // 否则 Promise 以原始 Error 落定，调用方 isAppError 守卫会漏。
    request.mockReturnValueOnce({
      get then(): unknown {
        throw new Error('hostile then getter')
      },
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('settles as NETWORK_ERROR when an async then rejects internally', async () => {
    // async then 内部抛错 → then() 返回 rejected Promise，succeed/networkFail 双双不被调用；
    // 该 rejection 必须被消费并交给 networkFail，否则外层永久 pending 且留下未处理拒绝。
    request.mockReturnValueOnce({
      then: async (_resolve: (res: unknown) => void, _reject: (err: unknown) => void) => {
        throw new Error('async then boom')
      },
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('settles as NETWORK_ERROR when an async then rejects with a null-prototype object', async () => {
    // 修复轮 3 回归：String(Object.create(null)) 在 ToPrimitive 期抛 TypeError（无 toString/valueOf）。
    // 若 detail 提取在 settled 置位后、reject 执行前抛出，外层永久 pending 并留下未处理拒绝；
    // networkFail 必须对任意 rejection reason 都落到 reject(new AppError('NETWORK_ERROR'))。
    request.mockReturnValueOnce({
      then: async (_resolve: (res: unknown) => void, _reject: (err: unknown) => void) => {
        throw Object.create(null)
      },
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('settles as NETWORK_ERROR when the fail callback receives a null-prototype object', async () => {
    // 同一条异常安全判据覆盖回调面：uni.request 的 fail 携畸形 null 原型对象时同样不得挂起。
    request.mockImplementationOnce((options: { fail?: (err: unknown) => void }) => {
      options.fail?.(Object.create(null))
    })
    await expect(apiClient.get('/api/v1/erp/products')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    })
  })

  it('types the resolved payload through request generics', async () => {
    interface OrderDto {
      id: number
      name: string
    }
    request.mockResolvedValue({
      statusCode: 200,
      data: okEnvelope({ id: 42, name: 'order-42' }),
      header: {},
    })
    const order: OrderDto = await apiClient.post<OrderDto>('/api/v1/erp/sales/orders', {})
    expect(order.id).toBe(42)
    expect(order.name).toBe('order-42')
  })
})

describe('apiBaseUrl fail-closed boundary', () => {
  const CASES: [string, string][] = [
    ['empty string', ''],
    ['non-http scheme', 'ftp://erp.example.test'],
    ['bare host without scheme', 'erp.example.test/path'],
    ['double slash left by runtime normalization', 'https://erp.example.test//'],
    ['single trailing slash would join into a double slash', 'https://erp.example.test/'],
    ['empty host', 'https://'],
    ['query string on the base', 'https://erp.example.test/?next=/login'],
    ['fragment on the base', 'https://erp.example.test#/app'],
    ['credentials in the authority', 'https://user:pw@erp.example.test'],
    ['non-numeric port', 'https://erp.example.test:notaport'],
    ['out-of-range port', 'https://erp.example.test:99999'],
    ['path segment on the base', 'https://erp.example.test/api/v1'],
  ]

  it.each(CASES)('refuses to load the client when apiBaseUrl is %s', async (_label, value) => {
    vi.resetModules()
    vi.doMock('../../src/shared/config/runtime', () => ({
      runtimeConfig: {
        apiBaseUrl: value,
        appId: 'touristappid',
        envName: 'test',
        terminalSource: 81,
      },
    }))
    await expect(import('../../src/shared/api/client')).rejects.toThrow('Invalid API base URL')
  })

  it('accepts a base URL with an explicit numeric port', async () => {
    vi.resetModules()
    vi.doMock('../../src/shared/config/runtime', () => ({
      runtimeConfig: {
        apiBaseUrl: 'https://erp.example.test:8443',
        appId: 'touristappid',
        envName: 'test',
        terminalSource: 81,
      },
    }))
    const mod = await import('../../src/shared/api/client')
    expect(mod).toBeTruthy()
    // 端口必须进入拼出的请求 URL（解析器要保留非默认端口，语义对齐 WHATWG origin）
    request.mockReset()
    request.mockResolvedValue({ statusCode: 200, data: okEnvelope({ id: 1 }), header: {} })
    await mod.apiClient.get('/api/v1/erp/products')
    expect(sentOptions(0)?.url).toBe('https://erp.example.test:8443/api/v1/erp/products')
  })

  it('accepts a clean https base URL after restoring the real runtime config', async () => {
    vi.resetModules()
    vi.doUnmock('../../src/shared/config/runtime')
    await expect(import('../../src/shared/api/client')).resolves.toBeTruthy()
  })

  it('loads the client without the WHATWG URL global (mp-weixin JSCore regression)', async () => {
    // mp-weixin 的 JSCore 不保证注入 URL：模块加载路径若引用 new URL，真机上客户端直接拒载。
    // 把全局 URL 置为不可用后重新加载，必须照常通过（解析器不依赖任何浏览器全局）。
    vi.resetModules()
    vi.doUnmock('../../src/shared/config/runtime')
    const originalURL = globalThis.URL
    ;(globalThis as { URL?: unknown }).URL = undefined
    try {
      await expect(import('../../src/shared/api/client')).resolves.toBeTruthy()
    } finally {
      ;(globalThis as { URL?: unknown }).URL = originalURL
    }
  })
})
