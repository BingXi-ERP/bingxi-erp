// miniapp/src/shared/api/client.ts
import { runtimeConfig } from '../config/runtime'
import { AUTH_ME_PATH } from './contracts'
import { CSRF_KEY, csrfQueue } from './csrf'
import { SAFE_METHODS } from './http-methods'
import { logger } from './logger'
import { resolveApiPath, type ApiPathParams } from './path'
import { AppError, isAppError, normalizeError, normalizeSuccess } from './response'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
type RequestResult = UniApp.RequestSuccessCallbackResult

interface RequestConfig {
  method: Method
  /** /api/v1/erp 全量形态的端点路径（契约常量或同名全量字面量），前导 '/' 必带 */
  path: string
  query?: Record<string, unknown>
  data?: unknown
  headers?: Record<string, string>
}

export interface RequestOptions {
  pathParams?: ApiPathParams
}

/**
 * 后端 csrf.rs 中仅有的两个「带恢复令牌即可重放」的失败码（MISSING/INVALID 会双通道下发
 * x-new-csrf-token）；BINDING_MISMATCH、FORBIDDEN 一类 403 属授权/绑定语义，重放无意义且只会加压。
 */
const REPLAYABLE_CSRF_CODES: ReadonlySet<string> = new Set([
  'CSRF_TOKEN_MISSING',
  'CSRF_TOKEN_INVALID',
])

/**
 * apiBaseUrl 边界校验（Task 1 遗留 minor 的 fail-closed 处置）：
 * runtimeConfig 的归一化只做 trim + 去一枚尾斜杠，坏配置会原样传到这里。本模块拒绝加载而不是
 * 替它修补，让坏配置在应用启动即暴露。
 * mp-weixin 的 JSCore 不保证注入 WHATWG URL 全局，模块级 `new URL` 会让客户端在真机直接拒载，
 * 因此这里用不依赖任何浏览器全局的窄解析器：只接受 scheme://authority 形态，逐段校验
 * protocol（限 http(s)）、userinfo（authority 含 '@' 即拒）、主机（非空且限 ASCII 字母数字
 * 与 '-'/.'/'_'，IDN 与 IPv6 字面量按 fail-closed 拒绝）、端口（纯数字且 1..65535）、
 * path/query/hash（scheme 后一律不得出现）。判定语义与 WHATWG 版逐条对齐：空主机、非数字端口、
 * 越界端口、带凭证、查询串、片段、非空路径全部拒载；另保留原始串判据——WHATWG 会把 'host//'
 * 与 'host/' 归一成 pathname '/' 而无法区分，空段/尾斜杠按原始串判拒（拼接会产生双斜杠）。
 * 返回值等价于 origin：scheme/主机小写、端口规范化并省略默认端口（https:443 / http:80）。
 */
function assertApiBaseUrl(value: string): string {
  const base = value.trim()
  const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([\s\S]*)$/.exec(base)
  const rawScheme = schemeMatch?.[1]
  const afterScheme = schemeMatch?.[2]
  if (rawScheme === undefined || afterScheme === undefined) {
    throw new Error(`Invalid API base URL (expected an absolute URL with a scheme)：${value}`)
  }
  const scheme = rawScheme.toLowerCase()
  if (scheme !== 'https' && scheme !== 'http') {
    throw new Error(`Invalid API base URL (only http(s) schemes are allowed)：${value}`)
  }
  // 空段/尾斜杠必须按原始串判（见 doc 注）：'host//'、'host/' 归一后与合法形态无法区分
  if (afterScheme.includes('//') || afterScheme.endsWith('/')) {
    throw new Error(`Invalid API base URL (empty path segment or trailing slash)：${value}`)
  }
  const boundary = afterScheme.search(/[/?#]/)
  const authority = boundary === -1 ? afterScheme : afterScheme.slice(0, boundary)
  const tail = boundary === -1 ? '' : afterScheme.slice(boundary)
  if (authority.includes('@')) {
    throw new Error(`Invalid API base URL (authority must not contain credentials)：${value}`)
  }
  const colon = authority.lastIndexOf(':')
  const host = colon === -1 ? authority : authority.slice(0, colon)
  const port = colon === -1 ? '' : authority.slice(colon + 1)
  if (port !== '' && (!/^\d+$/.test(port) || Number(port) === 0 || Number(port) > 65535)) {
    throw new Error(`Invalid API base URL (port must be an integer from 1 to 65535)：${value}`)
  }
  if (host === '') {
    throw new Error(`Invalid API base URL (host is empty)：${value}`)
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(host)) {
    throw new Error(
      `Invalid API base URL (host contains unsupported characters; IDN and IPv6 literals are not allowed)：${value}`,
    )
  }
  if (tail.includes('?')) {
    throw new Error(`Invalid API base URL (query strings are not allowed)：${value}`)
  }
  if (tail.includes('#')) {
    throw new Error(`Invalid API base URL (fragments are not allowed)：${value}`)
  }
  if (tail !== '') {
    throw new Error(`Invalid API base URL (path segments are not allowed)：${value}`)
  }
  const canonicalPort = port === '' ? '' : String(Number(port))
  const defaultPort = scheme === 'https' ? '443' : '80'
  const originPort =
    canonicalPort === '' || canonicalPort === defaultPort ? '' : `:${canonicalPort}`
  return `${scheme}://${host.toLowerCase()}${originPort}`
}

const API_BASE_URL = assertApiBaseUrl(runtimeConfig.apiBaseUrl)

/** 组装请求 URL；空串/null/undefined 筛选值剔除（与后端 normalize_empty_query_params 对齐）。 */
function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = `${API_BASE_URL}${path}`
  if (!query) return url
  const search = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return search ? `${url}?${search}` : url
}

/** 从响应头（x-new-csrf-token，大小写两形态）或 Set-Cookie 的 csrf_token 项提取恢复令牌。 */
function extractCsrf(response: RequestResult): string {
  const header = (response.header ?? {}) as Record<string, unknown>
  const direct = header['x-new-csrf-token'] ?? header['X-New-Csrf-Token']
  if (direct !== undefined && direct !== null && direct !== '') {
    return String(direct)
  }
  for (const cookie of response.cookies ?? []) {
    const match = /(?:^|[;\s])csrf_token=([^;,]+)/.exec(String(cookie))
    const token = match ? match[1] : undefined
    if (token) return token
  }
  return ''
}

/**
 * 发起一次底层请求。兼容两种运行时形态：
 * 真机 uni.request 走 success/fail 回调；部分平台与测试替身返回 Promise 而不回调。
 * settled 门闩保证多条路只有首落定生效。thenable 面全部收敛进同一个 try/catch：
 * - `then` 属性读取本身可能是宿主埋的抛错 getter，读取必须与订阅调用同块受护；
 * - `then()` 同步抛错走 catch；
 * - async `then` 内部抛错时 then() 返回 rejected Promise 且不触发任何回调，
 *   必须另行消费该返回值的 rejection 交给 networkFail，否则外层永久 pending
 *   并产生未处理拒绝。以上任一异常都归一为可追踪的 NETWORK_ERROR AppError，
 *   不允许裸异常漏出 Promise。networkFail 自身同样异常安全：rejection reason
 *   可能是 String() 即抛的非法值（如 null 原型对象），detail 提取必须包在不抛出的
 *   try/catch 里，保证 settled 置位后 reject(new AppError(...)) 必然执行。
 */
function rawRequest(options: UniApp.RequestOptions): Promise<RequestResult> {
  return new Promise<RequestResult>((resolve, reject) => {
    let settled = false
    const succeed = (res: RequestResult) => {
      if (settled) return
      settled = true
      resolve(res)
    }
    const networkFail = (cause: unknown) => {
      if (settled) return
      settled = true
      // detail 提取本身必须异常安全：String(Object.create(null)) 一类非法 reason 会在
      // ToPrimitive 期抛 TypeError，而 settled 已置位——提取若先抛出，reject 永不执行，
      // 外层永久 pending 并留下未处理拒绝。任何 reason 都必须走到 reject(new AppError(...))。
      let detail: string
      try {
        detail =
          cause && typeof cause === 'object' && 'errMsg' in cause
            ? String((cause as { errMsg?: string }).errMsg ?? '')
            : String(cause)
      } catch {
        detail = 'Unserializable rejection reason'
      }
      reject(
        new AppError({
          code: 'NETWORK_ERROR',
          message: `Network request failed: ${detail === '' ? 'Unknown reason' : detail}`,
        }),
      )
    }
    let returned: unknown
    try {
      returned = uni.request({
        ...options,
        success: succeed,
        fail: (err: UniApp.GeneralCallbackResult) => networkFail(err),
      })
    } catch (cause) {
      networkFail(cause)
      return
    }
    try {
      const thenable = returned as PromiseLike<RequestResult> | undefined
      if (thenable && typeof thenable.then === 'function') {
        const subscribed = thenable.then(succeed, networkFail)
        if (subscribed && typeof subscribed.then === 'function') {
          subscribed.then(undefined, networkFail)
        }
      }
    } catch (cause) {
      networkFail(cause)
    }
  })
}

function persistCsrf(token: string): void {
  uni.setStorageSync(CSRF_KEY, token)
}

/**
 * 单程请求：组头 → 发送 → 留痕 → 归一化信封 → 按门槛落盘恢复令牌。
 * 失败信封畸形（normalizeError 抛出 INVALID_RESPONSE/UNKNOWN_ERROR）在这里显式接住：
 * WARN 留痕后原样上抛，不按普通失败重试，不给重放凭证——代理或后端违约时最不缺的就是重试压力。
 * 恢复令牌只在合法且可接受的响应上落盘，避免违约面污染 storage：
 * - 成功：信封经 normalizeSuccess 完整放行后才落盘（畸形成功信封不配留凭证）；
 * - 失败：信封合法且（code ∈ REPLAYABLE_CSRF_CODES 的 403，或 401 轮换窗口）才落盘；
 *   非可重放 403（FORBIDDEN/BINDING_MISMATCH 等授权语义）、畸形 403、其余 4xx/5xx 一律不落盘，
 *   令牌只经 AppError.recoveryToken 走内存链路（401 重试携带），不留 storage 残留。
 * 403 只要不会进入重放（码不可重放，或缺恢复令牌），无论是否下发令牌都记 WARN 留痕。
 */
async function send<T = unknown>(config: RequestConfig, token = ''): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'App-User-Agent': `Miniapp/${runtimeConfig.envName}`,
    terminalSource: String(runtimeConfig.terminalSource),
    ...config.headers,
  }
  if (!SAFE_METHODS.has(config.method) && token) {
    headers['x-csrf-token'] = token
  }
  const startedAt = Date.now()
  const response = await rawRequest({
    url: buildUrl(config.path, config.query),
    method: config.method,
    data: config.data as UniApp.RequestOptions['data'],
    header: headers,
  })
  const ctx = {
    method: config.method,
    path: config.path,
    status: response.statusCode,
    durationMs: Date.now() - startedAt,
  }
  logger.info('request.completed', ctx)
  const nextCsrfToken = extractCsrf(response)
  const hasRecoveryToken = nextCsrfToken !== ''
  if (response.statusCode >= 400) {
    let error: AppError
    try {
      error = normalizeError(response.data, response.statusCode)
    } catch (thrown) {
      logger.warn('response.malformed_failure_envelope', ctx)
      if (isAppError(thrown)) throw thrown
      throw new AppError({
        code: 'INVALID_RESPONSE',
        message: `Failure envelope parsing failed: ${String(thrown)}`,
        httpStatus: response.statusCode,
      })
    }
    const replayEligible =
      response.statusCode === 403 && hasRecoveryToken && REPLAYABLE_CSRF_CODES.has(error.code)
    if (hasRecoveryToken && (replayEligible || response.statusCode === 401)) {
      persistCsrf(nextCsrfToken)
    }
    if (response.statusCode === 403 && !replayEligible) {
      logger.warn('csrf.replay_not_eligible', { ...ctx, code: error.code, hasRecoveryToken })
    }
    throw new AppError({
      code: error.code,
      message: error.message,
      traceId: error.traceId,
      timestamp: error.timestamp,
      httpStatus: error.httpStatus,
      recoveryToken: nextCsrfToken || undefined,
    })
  }
  let payload: unknown
  try {
    payload = normalizeSuccess(response.data)
  } catch (thrown) {
    logger.warn('response.malformed_success_envelope', ctx)
    const message = thrown instanceof Error ? thrown.message : String(thrown)
    throw new AppError({
      code: 'INVALID_RESPONSE',
      message: `Invalid success envelope: ${message}`,
      httpStatus: response.statusCode,
    })
  }
  if (hasRecoveryToken) {
    persistCsrf(nextCsrfToken)
  }
  return payload as T
}

/** 401 后的会话回读：会话仍在（登录态竞态/CSRF 轮换窗口）才值得重试一次。 */
async function verifySession(): Promise<boolean> {
  const startedAt = Date.now()
  const ctx = { method: 'GET' as const, path: AUTH_ME_PATH }
  try {
    const response = await rawRequest({
      url: buildUrl(AUTH_ME_PATH),
      method: 'GET',
      header: { 'X-Requested-With': 'XMLHttpRequest' },
    })
    logger.info('session.readback', {
      ...ctx,
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    })
    return response.statusCode === 200
  } catch {
    logger.warn('session.readback_failed', { ...ctx, durationMs: Date.now() - startedAt })
    return false
  }
}

/**
 * 请求编排：
 * - 安全方法（GET/HEAD/OPTIONS）不进 CSRF 队列，直接发送；
 * - 副作用方法经 CsrfTokenQueue 串行消费一次性令牌；
 * - 403 重放三门槛缺一不可：失败信封合法（normalizeError 完整放行，四字段齐全）、
 *   code ∈ REPLAYABLE_CSRF_CODES（MISSING/INVALID）、且带恢复令牌；普通 FORBIDDEN、
 *   非对象 403、畸形信封一律单发即抛（send 内已按 csrf.replay_not_eligible 留痕）；
 * - 401 且会话回读确认存活 → 重试一次；该响应若下发了新令牌（send 已落盘），
 *   内存 currentToken 同步跟进，重试不得再携已消费的旧令牌；
 * - 其余失败原样上抛，绝不重放。
 * 两类重放各自一次机会，用完后原始错误如实交给调用方（trace id 不丢）。
 */
async function request<T = unknown>(config: RequestConfig): Promise<T> {
  if (SAFE_METHODS.has(config.method)) {
    return send<T>(config)
  }
  return csrfQueue.run(async (token): Promise<T> => {
    let currentToken = token
    let csrfReplayed = false
    let authRetried = false
    for (;;) {
      try {
        return await send<T>(config, currentToken)
      } catch (error) {
        if (!isAppError(error)) throw error
        if (
          error.httpStatus === 403 &&
          error.recoveryToken &&
          REPLAYABLE_CSRF_CODES.has(error.code) &&
          !csrfReplayed
        ) {
          csrfReplayed = true
          currentToken = error.recoveryToken
          logger.warn('csrf.replay_with_recovery_token', {
            method: config.method,
            path: config.path,
            traceId: error.traceId,
          })
          continue
        }
        if (error.httpStatus === 401 && !authRetried && (await verifySession())) {
          authRetried = true
          if (error.recoveryToken) {
            currentToken = error.recoveryToken
          }
          logger.warn('session.retry_after_readback', {
            method: config.method,
            path: config.path,
            traceId: error.traceId,
          })
          continue
        }
        throw error
      }
    }
  })
}

export const apiClient = {
  get: <T = unknown>(path: string, query?: Record<string, unknown>, options?: RequestOptions) =>
    request<T>({ method: 'GET', path: resolveApiPath(path, options?.pathParams), query }),
  post: <T = unknown>(path: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ method: 'POST', path: resolveApiPath(path, options?.pathParams), data }),
  put: <T = unknown>(path: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ method: 'PUT', path: resolveApiPath(path, options?.pathParams), data }),
  delete: <T = unknown>(path: string, data?: unknown, options?: RequestOptions) =>
    request<T>({ method: 'DELETE', path: resolveApiPath(path, options?.pathParams), data }),
}

export { AppError }
