import { describe, expect, it } from 'vitest'
import { LOGIN_ROUTE, openLoginPage, withMiniProgram } from './automator'

describe('miniapp WeChat login page runtime', () => {
  it('does not complete real WeChat phone login when authorization is denied', async () => {
    await withMiniProgram(async (miniProgram) => {
      await openLoginPage(miniProgram)
      const page = await miniProgram.currentPage()
      if (!page) {
        throw new Error('登录页不存在')
      }

      const wechatLogin = await page.$('[data-action="wechat-login"]')
      if (!wechatLogin) {
        throw new Error('微信登录按钮不存在')
      }
      const openType = await wechatLogin.attribute('open-type')
      expect(openType).toBe('getPhoneNumber')

      console.info('MINIAPP_E2E_WECHAT_DENIAL_EVENT', { route: LOGIN_ROUTE })
      await wechatLogin.trigger('getphonenumber', { detail: {} })
      await page.waitFor('[data-test="login-error"]')
      await page.waitFor(LOGIN_ROUTE)

      const currentPage = await miniProgram.currentPage()
      console.info('MINIAPP_E2E_WECHAT_DENIAL_RESULT', {
        route: currentPage?.path,
        submitted: false,
      })
      expect(currentPage?.path).toBe(LOGIN_ROUTE)
      expect(currentPage?.path).not.toBe('/features/workspace/pages/index/index')
    })
  })
})
