// miniapp/src/shared/api/csrf.ts

/**
 * 后端签发的一次性 CSRF 令牌在本端 storage 里的键名。
 * 与旧 miniprogram/libs/utils/apiGateway.js 的既有键名一致（旧目录只读，不引用其代码）。
 */
export const CSRF_KEY = 'bingxiCsrf'

/** 令牌存取端口：测试注入内存实现，运行期由 uni storage 提供。 */
export interface CsrfTokenStore {
  read(): string
  remove(): void
}

/**
 * CSRF 令牌串行队列：同一时刻只允许一个"取令牌 → 立刻消费 → 发请求"的临界区在执行。
 *
 * 令牌是一次性的（后端 consume_csrf_token 消费即失效），并发请求若各自读同一枚令牌，
 * 第二个必然吃到 CSRF_TOKEN_INVALID。run 把任务排到链尾，出队时才读并立即 remove，
 * 保证每枚令牌只会被交给一个任务。
 * 任务失败沿 result 抛给调用方（调用方必须留痕）；链尾 catch 仅防止队列死锁，不吞调用方看到的错误。
 */
export class CsrfTokenQueue {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly store: CsrfTokenStore) {}

  run<T>(task: (token: string) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const token = this.store.read()
      this.store.remove()
      return task(token)
    })
    this.tail = result.catch(() => undefined)
    return result
  }
}

/** 运行期单例：令牌读写走 uni storage；storage 缺失值返回空串，由请求层带着空令牌发出去吃 403 恢复，而不是本地伪造令牌。 */
export const csrfQueue = new CsrfTokenQueue({
  read: () => {
    const raw = uni.getStorageSync(CSRF_KEY)
    return typeof raw === 'string' ? raw : ''
  },
  remove: () => uni.removeStorageSync(CSRF_KEY),
})
