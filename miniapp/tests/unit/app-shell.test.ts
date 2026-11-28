import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapApp, installAuthGuard } from '../../src/app'
import AppTabBar from '../../src/shared/ui/AppTabBar.vue'
import PermissionButton from '../../src/shared/ui/PermissionButton.vue'
import UserPicker from '../../src/shared/ui/UserPicker.vue'
import type { UserInfo } from '../../src/shared/types/user'

const { addInterceptor, guard } = vi.hoisted(() => ({
  addInterceptor: vi.fn(),
  guard: vi.fn(),
}))

vi.stubGlobal('uni', { addInterceptor })
vi.mock('../../src/features/auth/guards', () => ({
  createAuthGuard: () => guard,
}))

const global = {
  stubs: {
    'wd-button': {
      inheritAttrs: true,
      emits: ['click'],
      props: ['disabled', 'loading', 'type'],
      template: '<button :disabled="disabled || loading"><slot /></button>',
    },
    'wd-picker': {
      inheritAttrs: true,
      emits: ['update:modelValue'],
      props: ['columns', 'modelValue'],
      template: '<picker :value="modelValue" />',
    },
  },
}

const user: UserInfo = {
  id: 7,
  username: 'alice',
  email: null,
  role_id: 2,
  role_name: 'Sales',
  permissions: ['orders:read'],
  phone: null,
  department_id: null,
  department_name: null,
  is_totp_enabled: false,
  real_name: 'Alice',
  avatar: null,
  agreed_to_terms_at: null,
}

describe('application shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs the same auth guard on every protected navigation API during bootstrap', () => {
    bootstrapApp()

    expect(addInterceptor.mock.calls.map(([method]) => method)).toEqual([
      'navigateTo',
      'redirectTo',
      'switchTab',
      'reLaunch',
    ])
    for (const [, options] of addInterceptor.mock.calls) {
      expect(options.invoke).toBeTypeOf('function')
    }
  })

  it('returns the original navigation options from every registered interceptor', () => {
    installAuthGuard()
    const options = { url: '/features/workspace/pages/index/index', events: { succeed: vi.fn() } }
    guard.mockImplementation((navigation: typeof options) => navigation)

    for (const [method, interceptor] of addInterceptor.mock.calls) {
      expect(interceptor.invoke(options)).toBe(options)
      expect(guard).toHaveBeenCalledWith(options, method)
    }
  })

  it('returns false without replacing the rejected navigation options', () => {
    installAuthGuard()
    const options = { url: '/features/workspace/pages/index/index' }
    guard.mockReturnValue(false)

    const interceptor = addInterceptor.mock.calls[0]?.[1] as {
      invoke: (args: typeof options) => boolean
    }

    expect(interceptor.invoke(options)).toBe(false)
    expect(guard).toHaveBeenCalledWith(options, 'navigateTo')
  })

  it('asks an explicit permission port to evaluate array permissions', () => {
    const can = vi.fn().mockReturnValue(true)

    const wrapper = mount(PermissionButton, {
      props: { permission: ['orders:read', 'orders:create'], can },
      slots: { default: 'Orders' },
      global,
    })

    expect(can).toHaveBeenCalledWith(['orders:read', 'orders:create'])
    expect(wrapper.text()).toBe('Orders')
  })

  it('hides the button when the explicit permission port denies access', () => {
    const wrapper = mount(PermissionButton, {
      props: { permission: 'orders:read', can: () => false },
      slots: { default: 'Orders' },
      global,
    })

    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('uses the real user name in picker options and emits the selected id', async () => {
    const wrapper = mount(UserPicker, {
      props: { users: [user] },
      global,
    })
    const picker = wrapper.findComponent({ name: 'WSelect' })

    expect(picker.props('options')).toEqual([{ value: 7, label: 'Alice' }])

    picker.vm.$emit('update:modelValue', 7)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:modelValue')).toEqual([[7]])
  })

  it('does not offer placeholder routes in the phase-one tab bar', () => {
    const wrapper = mount(AppTabBar, { global })

    expect(wrapper.findAll('.app-tab-bar__item')).toHaveLength(1)
    expect(wrapper.find('.app-tab-bar__item').attributes('data-route')).toBe(
      '/features/workspace/pages/index/index',
    )
  })
})
