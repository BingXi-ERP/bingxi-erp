import automator from 'miniprogram-automator'

export const LOGIN_ROUTE = '/pages/login/index'
export const WORKSPACE_ROUTE = '/features/workspace/pages/index/index'

type MiniProgram = Awaited<ReturnType<typeof automator.connect>>

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`缺少必需环境变量：${name}`)
  }
  return value
}

export async function withMiniProgram(
  run: (miniProgram: MiniProgram) => Promise<void>,
): Promise<void> {
  const wsEndpoint = requiredEnv('MINIAPP_AUTOMATOR_WS')
  console.info('MINIAPP_E2E_CONNECT', { wsEndpoint })
  const miniProgram = await automator.connect({ wsEndpoint })
  try {
    await run(miniProgram)
  } finally {
    console.info('MINIAPP_E2E_DISCONNECT')
    await miniProgram.disconnect()
  }
}

export async function openLoginPage(miniProgram: MiniProgram): Promise<void> {
  console.info('MINIAPP_E2E_OPEN_LOGIN')
  const page = await miniProgram.reLaunch(LOGIN_ROUTE)
  if (!page) {
    throw new Error(`无法打开登录页：${LOGIN_ROUTE}`)
  }
  await page.waitFor(LOGIN_ROUTE)
  await page.waitFor('input[name="username"]')
  await page.waitFor('input[name="password"]')
}

export async function readWorkspaceUsername(miniProgram: MiniProgram): Promise<string> {
  const page = await miniProgram.currentPage()
  if (!page) {
    throw new Error('工作台页面不存在')
  }
  await page.waitFor(WORKSPACE_ROUTE)
  await page.waitFor('[data-test="workspace-user"]')
  const username = await page.$('.workspace__user-name')
  if (!username) {
    throw new Error('工作台未渲染当前用户名')
  }
  return username.text()
}
