import { logger } from '../../shared/api/logger'
import { useSessionStore } from './stores/session'

export type AuthNavigationMethod = 'navigateTo' | 'redirectTo' | 'switchTab' | 'reLaunch'

export interface AuthNavigationOptions {
  url: string
}

export type AuthGuard = (
  to: AuthNavigationOptions,
  method?: AuthNavigationMethod,
) => AuthNavigationOptions | false

const LOGIN_ROUTE = '/pages/login/index'

function isLoginRoute(url: string): boolean {
  const path = url.split('?')[0] ?? url
  return path === LOGIN_ROUTE || path.startsWith('/pages/login/')
}

function navigate(method: AuthNavigationMethod, options: AuthNavigationOptions): void {
  switch (method) {
    case 'navigateTo':
      uni.navigateTo(options)
      break
    case 'redirectTo':
      uni.redirectTo(options)
      break
    case 'switchTab':
      uni.switchTab(options)
      break
    case 'reLaunch':
      uni.reLaunch(options)
      break
  }
}

export const createAuthGuard = (): AuthGuard => {
  let loginRedirectPending = false
  const replayingOptions = new WeakSet<AuthNavigationOptions>()

  function redirectToLogin(): void {
    if (loginRedirectPending) return
    loginRedirectPending = true
    const release = () => {
      loginRedirectPending = false
    }
    try {
      uni.reLaunch({ url: LOGIN_ROUTE, complete: release, fail: release })
    } catch (error) {
      release()
      throw error
    }
  }

  function replay(method: AuthNavigationMethod, options: AuthNavigationOptions): void {
    replayingOptions.add(options)
    try {
      navigate(method, options)
      logger.info('auth.guard_replayed', { method })
    } finally {
      replayingOptions.delete(options)
    }
  }

  return (to, method = 'reLaunch') => {
    if (replayingOptions.has(to)) return to

    const session = useSessionStore()
    if (isLoginRoute(to.url)) return to

    if (session.state === 'none' || session.state === 'invalid') {
      redirectToLogin()
      return false
    }

    if (session.state === 'unverified') {
      void session.verify().then(
        (result) => {
          if (result === 'valid') {
            replay(method, to)
            return
          }
          logger.warn('auth.guard_verification_rejected', { method, result })
          redirectToLogin()
        },
        (error: unknown) => {
          logger.error('auth.guard_verification_failed', { method, error })
          redirectToLogin()
        },
      )
      return false
    }

    return to
  }
}
