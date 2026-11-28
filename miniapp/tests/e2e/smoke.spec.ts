import automator from 'miniprogram-automator'
import { describe, expect, it } from 'vitest'
import { openLoginPage, readWorkspaceUsername, requiredEnv, withMiniProgram } from './automator'

describe('miniapp smoke', () => {
  it('opens login page and reaches workspace after real password login', async () => {
    const username = requiredEnv('E2E_USERNAME')
    const password = requiredEnv('E2E_PASSWORD')

    await withMiniProgram(async (miniProgram) => {
      await openLoginPage(miniProgram)
      const page = await miniProgram.currentPage()
      if (!page) {
        throw new Error('登录页不存在')
      }

      const usernameInput = await page.$('input[name="username"]')
      const passwordInput = await page.$('input[name="password"]')
      if (!(usernameInput instanceof automator.InputElement)) {
        throw new Error('用户名输入框不可用')
      }
      if (!(passwordInput instanceof automator.InputElement)) {
        throw new Error('密码输入框不可用')
      }

      console.info('MINIAPP_E2E_PASSWORD_LOGIN_INPUT')
      await usernameInput.input(username)
      await passwordInput.input(password)
      console.info('MINIAPP_E2E_PASSWORD_LOGIN_SUBMIT')
      await page.callMethod('onSubmit')
      await page.waitFor('/features/workspace/pages/index/index')

      const displayedUsername = await readWorkspaceUsername(miniProgram)
      console.info('MINIAPP_E2E_PASSWORD_LOGIN_RESULT', {
        route: '/features/workspace/pages/index/index',
        usernameMatches: displayedUsername === username,
      })
      expect(displayedUsername).toBe(username)
    })
  })
})
