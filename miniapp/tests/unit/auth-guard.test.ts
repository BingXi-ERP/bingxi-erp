import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installAuthGuard } from '../../src/app'

const { session } = vi.hoisted(() => ({
  session: {
    state: 'valid' as 'none' | 'unverified' | 'valid' | 'invalid',
    verify: vi.fn(),
  },
}))

vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => session,
}))

type NavigationMethod = 'navigateTo' | 'redirectTo' | 'switchTab' | 'reLaunch'
type NavigationOptions = { url: string; events?: { succeed?: () => void } }
type Interceptor = { invoke: (options: NavigationOptions) => NavigationOptions | false }

const interceptors = new Map<NavigationMethod, Interceptor>()
const navigated: Array<{ method: NavigationMethod; options: NavigationOptions }> = []

function navigate(method: NavigationMethod, options: NavigationOptions): NavigationOptions | false {
  const decision = interceptors.get(method)?.invoke(options)
  if (decision !== false) navigated.push({ method, options })
  return decision ?? false
}

const reLaunch = vi.fn((options: NavigationOptions) => navigate('reLaunch', options))

vi.stubGlobal('uni', {
  addInterceptor: (method: NavigationMethod, interceptor: Interceptor) => {
    interceptors.set(method, interceptor)
  },
  navigateTo: (options: NavigationOptions) => navigate('navigateTo', options),
  redirectTo: (options: NavigationOptions) => navigate('redirectTo', options),
  switchTab: (options: NavigationOptions) => navigate('switchTab', options),
  reLaunch,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

beforeEach(() => {
  interceptors.clear()
  navigated.length = 0
  vi.clearAllMocks()
  session.state = 'valid'
  session.verify.mockReset()
  installAuthGuard()
})

describe('uni-app auth interceptor contract', () => {
  it.each(['navigateTo', 'redirectTo', 'switchTab', 'reLaunch'] as const)(
    'returns the identical options object synchronously for an allowed %s call',
    (method) => {
      const options: NavigationOptions = { url: '/features/workspace/pages/index/index' }

      const decision = navigate(method, options)

      expect(decision).toBe(options)
      expect(decision).not.toBeInstanceOf(Promise)
      expect(navigated).toEqual([{ method, options }])
    },
  )

  it('allows the login route with its original options', () => {
    const options: NavigationOptions = { url: '/pages/login/index?from=workspace' }

    expect(navigate('reLaunch', options)).toBe(options)
    expect(session.verify).not.toHaveBeenCalled()
  })

  it('cancels an unverified navigation and replays the original method and options after verification', async () => {
    const pending = deferred<'valid'>()
    session.state = 'unverified'
    session.verify.mockReturnValue(pending.promise)
    const options: NavigationOptions = {
      url: '/features/workspace/pages/index/index?tab=orders',
      events: { succeed: vi.fn() },
    }

    expect(navigate('reLaunch', options)).toBe(false)
    expect(navigated).toEqual([])
    expect(session.verify).toHaveBeenCalledOnce()

    pending.resolve('valid')
    await flushPromises()

    expect(reLaunch).toHaveBeenLastCalledWith(options)
    expect(reLaunch.mock.results.at(-1)?.value).toBe(options)
    expect(navigated).toEqual([{ method: 'reLaunch', options }])
    expect(session.verify).toHaveBeenCalledOnce()
  })

  it.each(['none', 'invalid'] as const)(
    'cancels the navigation and redirects once when verification returns %s',
    async (result) => {
      session.state = 'unverified'
      session.verify.mockResolvedValue(result)

      expect(navigate('redirectTo', { url: '/features/workspace/pages/index/index' })).toBe(false)
      await flushPromises()

      expect(reLaunch).toHaveBeenCalledOnce()
      expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
      expect(navigated).toHaveLength(1)
      expect(navigated[0]).toMatchObject({
        method: 'reLaunch',
        options: { url: '/pages/login/index' },
      })
    },
  )

  it('redirects to login when asynchronous verification rejects', async () => {
    session.state = 'unverified'
    session.verify.mockRejectedValue(new Error('network unavailable'))

    expect(navigate('navigateTo', { url: '/features/workspace/pages/index/index' })).toBe(false)
    await flushPromises()

    expect(reLaunch).toHaveBeenCalledOnce()
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
  })

  it('deduplicates login redirects until the previous reLaunch completes', () => {
    session.state = 'none'
    const guard = interceptors.get('navigateTo')
    expect(guard).toBeDefined()

    expect(guard?.invoke({ url: '/features/workspace/pages/index/index' })).toBe(false)
    expect(guard?.invoke({ url: '/features/workspace/pages/index/index' })).toBe(false)
    expect(reLaunch).toHaveBeenCalledOnce()

    const redirect = reLaunch.mock.calls[0]?.[0] as NavigationOptions & { complete?: () => void }
    redirect.complete?.()
    guard?.invoke({ url: '/features/workspace/pages/index/index' })

    expect(reLaunch).toHaveBeenCalledTimes(2)
  })
})
