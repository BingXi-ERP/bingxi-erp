import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { AUTH_ME_PATH } from '../../../shared/api/contracts'
import { CSRF_KEY } from '../../../shared/api/csrf'
import { logger } from '../../../shared/api/logger'
import { isAppError } from '../../../shared/api/response'
import { hasPermission } from '../../../shared/stores/permissions'
import type { UserInfo } from '../../../shared/types/user'
import {
  authService,
  type LoginResponse,
  type MiniappLoginPayload,
  type PasswordLoginPayload,
} from '../services/auth'

export type { UserInfo } from '../../../shared/types/user'

export type SessionState = 'none' | 'unverified' | 'valid' | 'invalid'
export type SessionVerification = 'none' | 'valid' | 'invalid' | 'error'

const SESSION_STORAGE_KEY = 'bingxiSession'

function errorContext(error: unknown): { code: string; httpStatus?: number; traceId?: string } {
  if (isAppError(error)) {
    return { code: error.code, httpStatus: error.httpStatus, traceId: error.traceId }
  }
  return { code: 'UNKNOWN_ERROR' }
}

export const useSessionStore = defineStore('session', () => {
  const state = ref<SessionState>('none')
  const user = ref<UserInfo | null>(null)
  const permissions = computed(() => (user.value === null ? [] : user.value.permissions))
  let authGeneration = 0
  let inFlightVerify: Promise<SessionVerification> | null = null

  function invalidateAuthOperations(): number {
    authGeneration += 1
    inFlightVerify = null
    return authGeneration
  }

  function clear(): void {
    invalidateAuthOperations()
    state.value = 'invalid'
    user.value = null
    uni.removeStorageSync(CSRF_KEY)
    uni.removeStorageSync(SESSION_STORAGE_KEY)
  }

  async function runVerification(requestId: number): Promise<SessionVerification> {
    try {
      const profile = await authService.getCurrentUser()
      if (requestId !== authGeneration) {
        logger.info('session.verification_stale', { path: AUTH_ME_PATH, requestId })
        return 'none'
      }
      user.value = profile
      state.value = 'valid'
      logger.info('session.verified', { path: AUTH_ME_PATH })
      return 'valid'
    } catch (error) {
      if (requestId !== authGeneration) {
        logger.info('session.verification_stale', {
          path: AUTH_ME_PATH,
          requestId,
          ...errorContext(error),
        })
        return 'none'
      }
      if (isAppError(error) && (error.httpStatus === 401 || error.httpStatus === 403)) {
        clear()
        logger.warn('session.invalid', { path: AUTH_ME_PATH, ...errorContext(error) })
        return 'invalid'
      }
      logger.error('session.verification_failed', { path: AUTH_ME_PATH, ...errorContext(error) })
      return 'error'
    }
  }

  function verify(): Promise<SessionVerification> {
    if (inFlightVerify !== null) return inFlightVerify
    if (state.value === 'none') return Promise.resolve('none')

    const requestId = authGeneration
    const promise = runVerification(requestId)
    inFlightVerify = promise
    void promise.then(
      () => {
        if (inFlightVerify === promise) inFlightVerify = null
      },
      () => {
        if (inFlightVerify === promise) inFlightVerify = null
      },
    )
    return promise
  }

  async function completeLogin(
    action: () => Promise<LoginResponse>,
    method: 'password' | 'miniapp',
  ): Promise<SessionVerification> {
    const requestId = invalidateAuthOperations()
    try {
      const result = await action()
      if (requestId !== authGeneration) {
        logger.info('session.login_stale', { method, requestId })
        return 'none'
      }
      uni.setStorageSync(CSRF_KEY, result.csrf_token)
      state.value = 'unverified'
      const verification = await verify()
      if (verification === 'valid' && requestId !== authGeneration) {
        logger.info('session.login_stale', { method, requestId })
        return 'none'
      }
      logger.info('session.login_completed', { method, result: verification })
      return verification
    } catch (error) {
      if (requestId !== authGeneration) {
        logger.info('session.login_stale', { method, requestId, ...errorContext(error) })
        return 'none'
      }
      logger.error('session.login_failed', { method, ...errorContext(error) })
      throw error
    }
  }

  function loginWithPassword(payload: PasswordLoginPayload): Promise<SessionVerification> {
    return completeLogin(() => authService.loginWithPassword(payload), 'password')
  }

  function loginWithMiniapp(payload: MiniappLoginPayload): Promise<SessionVerification> {
    return completeLogin(() => authService.loginWithMiniapp(payload), 'miniapp')
  }

  async function logout(): Promise<boolean> {
    const requestId = invalidateAuthOperations()
    try {
      await authService.logout()
      logger.info('session.logout_succeeded')
      return true
    } catch (error) {
      logger.error('session.logout_failed', errorContext(error))
      return false
    } finally {
      if (requestId === authGeneration) {
        clear()
        logger.info('session.local_cleared', { reason: 'logout' })
      } else {
        logger.info('session.logout_stale', { requestId })
      }
    }
  }

  function can(required: string | string[]): boolean {
    return hasPermission(required, permissions.value)
  }

  return {
    state,
    user,
    permissions,
    verify,
    loginWithPassword,
    loginWithMiniapp,
    logout,
    clear,
    can,
  }
})
