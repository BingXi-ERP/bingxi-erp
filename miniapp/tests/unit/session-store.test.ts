import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../../src/features/auth/composables/useSession'
import { createAuthGuard } from '../../src/features/auth/guards'
import { authService } from '../../src/features/auth/services/auth'
import { useSessionStore } from '../../src/features/auth/stores/session'
import { AppError } from '../../src/shared/api/errors'

const { api, reLaunch } = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  reLaunch: vi.fn(),
}))

vi.mock('../../src/shared/api/client', () => ({ apiClient: api }))

const storage = new Map<string, unknown>()
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
  reLaunch,
})

function userFixture(permissions = ['orders:read']) {
  return {
    id: 1,
    username: 'alice',
    email: 'alice@example.test',
    role_id: 2,
    role_name: 'operator',
    permissions,
    phone: '13800000000',
    department_id: 3,
    department_name: 'production',
    is_totp_enabled: false,
    real_name: null,
    avatar: null,
    agreed_to_terms_at: null,
  }
}

function loginFixture(user = userFixture()) {
  return {
    csrf_token: 'csrf-1',
    user,
    permissions: ['products:delete'],
    password_expired: false,
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  setActivePinia(createPinia())
  api.get.mockReset()
  api.post.mockReset()
  reLaunch.mockReset()
  storage.clear()
})

describe('session store', () => {
  it('marks the session valid only after auth/me supplies the profile and permissions', async () => {
    const verifiedUser = userFixture(['orders:read'])
    api.post.mockResolvedValue(loginFixture(userFixture(['products:delete'])))
    api.get.mockResolvedValue(verifiedUser)
    const store = useSessionStore()

    expect(store.state).toBe('none')
    await expect(
      store.loginWithPassword({ username: 'alice', password: 'test-password' }),
    ).resolves.toBe('valid')

    expect(store.state).toBe('valid')
    expect(store.user).toEqual(verifiedUser)
    expect(store.permissions).toEqual(['orders:read'])
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-1')
  })

  it('keeps the verified snapshot on network error and accepts a later verification', async () => {
    const snapshot = userFixture(['orders:read'])
    const store = useSessionStore()
    store.state = 'unverified'
    store.user = snapshot
    api.get.mockRejectedValueOnce(new Error('network unavailable'))

    await expect(store.verify()).resolves.toBe('error')
    expect(store.state).toBe('unverified')
    expect(store.user).toEqual(snapshot)
    expect(store.permissions).toEqual(['orders:read'])

    api.get.mockResolvedValueOnce(userFixture(['orders:update']))
    await expect(store.verify()).resolves.toBe('valid')
    expect(store.state).toBe('valid')
    expect(store.permissions).toEqual(['orders:update'])
  })

  it('shares one auth/me request for concurrent verification calls', async () => {
    const pendingProfile = deferred<ReturnType<typeof userFixture>>()
    api.get.mockReturnValue(pendingProfile.promise)
    const store = useSessionStore()
    store.state = 'unverified'

    const first = store.verify()
    const second = store.verify()

    expect(api.get).toHaveBeenCalledTimes(1)
    pendingProfile.resolve(userFixture(['orders:update']))
    await expect(Promise.all([first, second])).resolves.toEqual(['valid', 'valid'])
    expect(store.permissions).toEqual(['orders:update'])
  })

  it('does not restore a cleared session when an in-flight verification succeeds', async () => {
    const pendingProfile = deferred<ReturnType<typeof userFixture>>()
    api.get.mockReturnValue(pendingProfile.promise)
    const store = useSessionStore()
    store.state = 'unverified'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')

    const verification = store.verify()
    store.clear()
    pendingProfile.resolve(userFixture(['orders:delete']))
    await verification

    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })

  it('does not let an older verification failure clear a newer login', async () => {
    const staleProfile = deferred<ReturnType<typeof userFixture>>()
    const currentProfile = userFixture(['orders:update'])
    api.get.mockReturnValueOnce(staleProfile.promise).mockResolvedValueOnce(currentProfile)
    api.post.mockResolvedValue(loginFixture())
    const store = useSessionStore()
    store.state = 'unverified'

    const staleVerification = store.verify()
    await expect(
      store.loginWithPassword({ username: 'alice', password: 'test-password' }),
    ).resolves.toBe('valid')
    staleProfile.reject(
      new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized', httpStatus: 401 }),
    )
    await staleVerification

    expect(store.state).toBe('valid')
    expect(store.user).toEqual(currentProfile)
    expect(store.permissions).toEqual(['orders:update'])
  })

  it('does not restore a cleared session when an older login response arrives', async () => {
    const pendingLogin = deferred<ReturnType<typeof loginFixture>>()
    api.post.mockReturnValue(pendingLogin.promise)
    const store = useSessionStore()

    const login = store.loginWithPassword({ username: 'alice', password: 'test-password' })
    store.clear()
    pendingLogin.resolve(loginFixture())
    await login

    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('does not let an older login overwrite a newer login', async () => {
    const staleLogin = deferred<ReturnType<typeof loginFixture>>()
    const currentLogin = deferred<ReturnType<typeof loginFixture>>()
    const currentProfile = userFixture(['orders:update'])
    api.post.mockReturnValueOnce(staleLogin.promise).mockReturnValueOnce(currentLogin.promise)
    api.get.mockResolvedValue(currentProfile)
    const store = useSessionStore()

    const first = store.loginWithPassword({ username: 'alice', password: 'test-password' })
    const second = store.loginWithPassword({ username: 'alice', password: 'test-password' })
    currentLogin.resolve({ ...loginFixture(), csrf_token: 'csrf-2' })
    await expect(second).resolves.toBe('valid')
    staleLogin.resolve(loginFixture())
    await first

    expect(store.state).toBe('valid')
    expect(store.user).toEqual(currentProfile)
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-2')
  })

  it('does not revive a logged-out session when an in-flight verification succeeds', async () => {
    const pendingProfile = deferred<ReturnType<typeof userFixture>>()
    api.get.mockReturnValue(pendingProfile.promise)
    api.post.mockResolvedValue({ success: true })
    const store = useSessionStore()
    store.state = 'unverified'
    store.user = userFixture()

    const verification = store.verify()
    await expect(store.logout()).resolves.toBe(true)
    pendingProfile.resolve(userFixture(['orders:delete']))
    await verification

    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
  })

  it('does not let an older logout clear a newer login', async () => {
    const pendingProfile = deferred<ReturnType<typeof userFixture>>()
    const pendingLogout = deferred<{ success: true }>()
    const currentProfile = userFixture(['orders:update'])
    api.get.mockReturnValueOnce(pendingProfile.promise).mockResolvedValueOnce(currentProfile)
    api.post.mockReturnValueOnce(pendingLogout.promise).mockResolvedValueOnce({
      ...loginFixture(),
      csrf_token: 'csrf-2',
    })
    const store = useSessionStore()
    store.state = 'valid'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')

    const staleVerification = store.verify()
    const logout = store.logout()
    await expect(
      store.loginWithPassword({ username: 'alice', password: 'test-password' }),
    ).resolves.toBe('valid')
    pendingProfile.resolve(userFixture(['orders:delete']))
    await staleVerification
    pendingLogout.resolve({ success: true })
    await expect(logout).resolves.toBe(true)

    expect(store.state).toBe('valid')
    expect(store.user).toEqual(currentProfile)
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-2')
  })

  it.each([401, 403])('clears the snapshot and tokens when auth/me returns %i', async (status) => {
    const store = useSessionStore()
    store.state = 'unverified'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')
    storage.set('bingxiSession', 'stale-session')
    api.get.mockRejectedValueOnce(
      new AppError({ code: 'UNAUTHORIZED', message: 'Unauthorized', httpStatus: status }),
    )

    await expect(store.verify()).resolves.toBe('invalid')
    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
    expect(uni.getStorageSync('bingxiSession')).toBeUndefined()
  })

  it('does not call auth/me before a login attempt', async () => {
    const store = useSessionStore()

    await expect(store.verify()).resolves.toBe('none')
    expect(store.state).toBe('none')
    expect(api.get).not.toHaveBeenCalled()
  })

  it('rejects a malformed auth/me profile without inventing missing UserInfo fields', async () => {
    const store = useSessionStore()
    store.state = 'unverified'
    api.get.mockResolvedValueOnce({ id: 1, username: 'alice' })

    await expect(store.verify()).resolves.toBe('error')
    expect(store.state).toBe('unverified')
    expect(store.user).toBeNull()
  })

  it('verifies a mini-program login through auth/me before granting permissions', async () => {
    const verifiedUser = userFixture(['orders:read'])
    api.post.mockResolvedValue(loginFixture())
    api.get.mockResolvedValue(verifiedUser)
    const store = useSessionStore()

    await expect(
      store.loginWithMiniapp({ code: 'wx-code', phone_code: 'phone-code' }),
    ).resolves.toBe('valid')
    expect(store.user).toEqual(verifiedUser)
    expect(store.permissions).toEqual(['orders:read'])
  })

  it('clears local session state and stored tokens', () => {
    const store = useSessionStore()
    store.state = 'valid'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')
    storage.set('bingxiSession', 'stale-session')

    store.clear()

    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
    expect(uni.getStorageSync('bingxiSession')).toBeUndefined()
  })

  it('logs out on the server and clears the local session', async () => {
    api.post.mockResolvedValue({ success: true })
    const store = useSessionStore()
    store.state = 'valid'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')

    await expect(store.logout()).resolves.toBe(true)
    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })

  it('clears the local session even when server logout fails', async () => {
    api.post.mockRejectedValue(
      new AppError({ code: 'NETWORK_ERROR', message: 'Offline', httpStatus: 503 }),
    )
    const store = useSessionStore()
    store.state = 'valid'
    store.user = userFixture()
    storage.set('bingxiCsrf', 'csrf-1')

    await expect(store.logout()).resolves.toBe(false)
    expect(store.state).toBe('invalid')
    expect(store.user).toBeNull()
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
  })
})

describe('useSession', () => {
  it('exposes reactive store state, profile, and permissions', () => {
    const session = useSession()
    session.store.state = 'valid'
    session.store.user = userFixture()

    expect(session.state.value).toBe('valid')
    expect(session.user.value?.username).toBe('alice')
    expect(session.permissions.value).toEqual(['orders:read'])

    session.store.user = userFixture(['orders:update'])
    expect(session.permissions.value).toEqual(['orders:update'])
  })
})

describe('createAuthGuard', () => {
  it('allows the login route without verifying a missing session', () => {
    const guard = createAuthGuard()
    const options = { url: '/pages/login/index' }

    expect(guard(options)).toBe(options)
    expect(api.get).not.toHaveBeenCalled()
    expect(reLaunch).not.toHaveBeenCalled()
  })

  it('redirects a missing session to login', () => {
    const guard = createAuthGuard()

    expect(guard({ url: '/pages/workspace/index' })).toBe(false)
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
  })

  it('verifies an unverified session before allowing protected navigation', async () => {
    const store = useSessionStore()
    store.state = 'unverified'
    api.get.mockResolvedValue(userFixture())
    const guard = createAuthGuard()
    const options = { url: '/pages/workspace/index' }

    expect(guard(options)).toBe(false)
    await expect(store.verify()).resolves.toBe('valid')
    expect(store.state).toBe('valid')
    expect(reLaunch).toHaveBeenCalledWith(options)
  })

  it('redirects when verification cannot establish a valid session', async () => {
    const store = useSessionStore()
    store.state = 'unverified'
    api.get.mockRejectedValue(new Error('network unavailable'))
    const guard = createAuthGuard()

    expect(guard({ url: '/pages/workspace/index' })).toBe(false)
    await expect(store.verify()).resolves.toBe('error')
    expect(store.state).toBe('unverified')
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
  })

  it('shares verification and redirects only once when concurrent guards fail', async () => {
    const pendingProfile = deferred<ReturnType<typeof userFixture>>()
    api.get.mockReturnValue(pendingProfile.promise)
    const store = useSessionStore()
    store.state = 'unverified'
    const guard = createAuthGuard()

    expect(guard({ url: '/pages/workspace/index' })).toBe(false)
    expect(guard({ url: '/pages/orders/index' })).toBe(false)
    expect(api.get).toHaveBeenCalledTimes(1)
    pendingProfile.reject(new Error('network unavailable'))
    await expect(store.verify()).resolves.toBe('error')

    expect(reLaunch).toHaveBeenCalledTimes(1)
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
  })

  it('redirects only once when concurrent guards have no session', () => {
    const guard = createAuthGuard()

    expect(guard({ url: '/pages/workspace/index' })).toBe(false)
    expect(guard({ url: '/pages/orders/index' })).toBe(false)
    expect(reLaunch).toHaveBeenCalledTimes(1)
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/login/index' }))
  })

  it('allows an already valid session without another auth/me request', () => {
    const store = useSessionStore()
    store.state = 'valid'
    store.user = userFixture()
    const guard = createAuthGuard()
    const options = { url: '/pages/workspace/index' }

    expect(guard(options)).toBe(options)
    expect(api.get).not.toHaveBeenCalled()
    expect(reLaunch).not.toHaveBeenCalled()
  })
})

describe('auth response validation', () => {
  it.each([
    {
      name: 'an unknown top-level login field',
      response: { ...loginFixture(), unexpected: true },
    },
    {
      name: 'an unknown nested user field',
      response: { ...loginFixture(), user: { ...userFixture(), unexpected: true } },
    },
    {
      name: 'an empty csrf token',
      response: { ...loginFixture(), csrf_token: '' },
    },
    {
      name: 'an empty username',
      response: { ...loginFixture(), user: { ...userFixture(), username: '' } },
    },
    {
      name: 'an empty login permission',
      response: { ...loginFixture(), permissions: [''] },
    },
    {
      name: 'an empty profile permission',
      response: { ...loginFixture(), user: { ...userFixture(), permissions: [''] } },
    },
  ])('rejects $name in a login response', async ({ response }) => {
    api.post.mockResolvedValue(response)
    const store = useSessionStore()

    await expect(
      store.loginWithPassword({ username: 'alice', password: 'test-password' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
    expect(store.state).toBe('none')
    expect(uni.getStorageSync('bingxiCsrf')).toBeUndefined()
    expect(api.get).not.toHaveBeenCalled()
  })

  it.each([
    {
      name: 'an unknown profile field',
      response: { ...userFixture(), unexpected: true },
    },
    {
      name: 'an empty username',
      response: { ...userFixture(), username: '' },
    },
    {
      name: 'an empty permission',
      response: { ...userFixture(), permissions: [''] },
    },
  ])('rejects $name in an auth/me response', async ({ response }) => {
    api.get.mockResolvedValue(response)
    const store = useSessionStore()
    store.state = 'unverified'

    await expect(store.verify()).resolves.toBe('error')
    expect(store.state).toBe('unverified')
    expect(store.user).toBeNull()
  })

  it('applies the same strict login schema to the mini-program login endpoint', async () => {
    api.post.mockResolvedValue({ ...loginFixture(), unexpected: true })

    await expect(
      authService.loginWithMiniapp({ code: 'wx-code', phone_code: 'phone-code' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
