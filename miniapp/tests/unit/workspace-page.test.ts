import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspacePage from '../../src/features/workspace/pages/index/index.vue'

const { reLaunch, session, switchTab } = vi.hoisted(() => {
  const session = {
    user: {
      id: 1,
      username: 'alice',
      email: null,
      role_id: 2,
      role_name: 'Sales',
      permissions: ['orders:read'],
      phone: null,
      department_id: null,
      department_name: null,
      is_totp_enabled: false,
      real_name: null,
      avatar: null,
      agreed_to_terms_at: null,
    },
    can: vi.fn((permission: string | string[]) => {
      const required = Array.isArray(permission) ? permission : [permission]
      return required.includes('orders:read')
    }),
    verify: vi.fn(),
  }
  return { reLaunch: vi.fn(), session, switchTab: vi.fn() }
})

vi.stubGlobal('uni', { reLaunch, switchTab })
vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => session,
}))

const global = {
  stubs: {
    'wd-button': {
      inheritAttrs: true,
      emits: ['click'],
      props: ['disabled', 'loading', 'type'],
      template:
        '<button :type="type" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>',
    },
  },
}

describe('WorkspacePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    session.verify.mockResolvedValue('valid')
  })

  it('shows the authenticated user and only permission-controlled entries', async () => {
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(wrapper.text()).toContain('alice')
    expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(true)
    expect(wrapper.find('[data-permission="orders:create"]').exists()).toBe(false)
    expect(wrapper.find('.app-tab-bar__item').text()).not.toBe('')
  })

  it('opens the workspace tab through the registered tab route', async () => {
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    await wrapper.find('.app-tab-bar__item').trigger('click')

    expect(switchTab).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/features/workspace/pages/index/index' }),
    )
  })

  it.each(['none', 'invalid'] as const)(
    'returns to login when session verification is %s',
    async (result) => {
      session.verify.mockResolvedValue(result)
      const wrapper = mount(WorkspacePage, { global })
      await flushPromises()

      expect(reLaunch).toHaveBeenCalledWith({ url: '/pages/login/index' })
      expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(false)
    },
  )

  it('shows a retryable error when verification rejects', async () => {
    session.verify.mockRejectedValue(new Error('network unavailable'))
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    expect(wrapper.find('.state-view__retry').exists()).toBe(true)
    expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(false)
    expect(reLaunch).not.toHaveBeenCalled()
  })

  it('shows a retryable error when verification cannot complete', async () => {
    session.verify.mockResolvedValue('error')
    const wrapper = mount(WorkspacePage, { global })
    await flushPromises()

    const retry = wrapper.find('.state-view__retry')
    expect(retry.exists()).toBe(true)
    expect(wrapper.find('[data-test="workspace-user"]').exists()).toBe(false)

    session.verify.mockResolvedValue('valid')
    await retry.trigger('click')
    await flushPromises()

    expect(session.verify).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-test="workspace-user"]').exists()).toBe(true)
  })
})
