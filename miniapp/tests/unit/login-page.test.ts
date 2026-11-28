import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/login/index.vue'

const { loginWithMiniapp, loginWithPassword, reLaunch, uniLogin } = vi.hoisted(() => ({
  loginWithMiniapp: vi.fn(),
  loginWithPassword: vi.fn(),
  reLaunch: vi.fn(),
  uniLogin: vi.fn(),
}))

vi.stubGlobal('uni', { login: uniLogin, reLaunch })
vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => ({ loginWithMiniapp, loginWithPassword }),
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

async function submitPassword(username: string, password: string) {
  const wrapper = mount(LoginPage, { global })
  await wrapper.find('input[name="username"]').setValue(username)
  await wrapper.find('input[name="password"]').setValue(password)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
  return wrapper
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loginWithPassword.mockResolvedValue('valid')
    loginWithMiniapp.mockResolvedValue('valid')
    uniLogin.mockResolvedValue({ code: 'wx-code' })
  })

  it('submits password credentials through the session store and opens the workspace', async () => {
    await submitPassword('alice', 'secret')

    expect(loginWithPassword).toHaveBeenCalledWith({ username: 'alice', password: 'secret' })
    expect(reLaunch).toHaveBeenCalledWith({
      url: '/features/workspace/pages/index/index',
    })
  })

  it.each(['none', 'invalid', 'error'] as const)(
    'does not open the workspace when password verification returns %s',
    async (result) => {
      loginWithPassword.mockResolvedValue(result)

      const wrapper = await submitPassword('alice', 'secret')

      expect(reLaunch).not.toHaveBeenCalled()
      expect(wrapper.find('[data-test="login-error"]').text()).not.toBe('')
    },
  )

  it('does not navigate or throw when password login rejects', async () => {
    loginWithPassword.mockRejectedValue(new Error('network unavailable'))

    const wrapper = await submitPassword('alice', 'secret')

    expect(reLaunch).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="login-error"]').text()).not.toBe('')
  })

  it('does not request a phone code after the user denies authorization', async () => {
    const wrapper = mount(LoginPage, { global })

    await wrapper.find('[data-action="wechat-login"]').trigger('getphonenumber', {
      detail: {},
    })
    await flushPromises()

    expect(uniLogin).not.toHaveBeenCalled()
    expect(loginWithMiniapp).not.toHaveBeenCalled()
  })

  it('exchanges both WeChat codes through the session store before opening the workspace', async () => {
    const wrapper = mount(LoginPage, { global })

    await wrapper.find('[data-action="wechat-login"]').trigger('getphonenumber', {
      detail: { code: 'phone-code' },
    })
    await flushPromises()

    expect(uniLogin).toHaveBeenCalledOnce()
    expect(loginWithMiniapp).toHaveBeenCalledWith({
      code: 'wx-code',
      phone_code: 'phone-code',
    })
    expect(reLaunch).toHaveBeenCalledWith({
      url: '/features/workspace/pages/index/index',
    })
  })

  it('does not submit an empty WeChat login code', async () => {
    uniLogin.mockResolvedValue({})
    const wrapper = mount(LoginPage, { global })

    await wrapper.find('[data-action="wechat-login"]').trigger('getphonenumber', {
      detail: { code: 'phone-code' },
    })
    await flushPromises()

    expect(loginWithMiniapp).not.toHaveBeenCalled()
    expect(reLaunch).not.toHaveBeenCalled()
    expect(wrapper.find('[data-test="login-error"]').text()).not.toBe('')
  })
})
