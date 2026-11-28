import { createAuthGuard, type AuthNavigationOptions } from './features/auth'
import { logger } from './shared/api/logger'
import { runtimeConfig } from './shared/config/runtime'
import { t } from './shared/i18n'

/** 应用对外显示名，页面标题与启动日志共用同一来源。 */
export const APP_NAME = t('app.name')

export function installAuthGuard(): void {
  const guard = createAuthGuard()
  const navigationMethods = ['navigateTo', 'redirectTo', 'switchTab', 'reLaunch'] as const

  for (const method of navigationMethods) {
    uni.addInterceptor(method, {
      invoke: (options: AuthNavigationOptions) => guard(options, method),
    })
  }
}

/**
 * 应用启动装配：由 App.vue 的 onLaunch 调用一次。
 * 运行时配置在应用启动时就完成校验，缺失项一次性全部报出，不带着半套配置进入页面。
 * 日志只输出环境名与终端来源，不输出主机地址与 AppID。
 */
export function bootstrapApp(): void {
  installAuthGuard()
  logger.info('app.started', {
    name: APP_NAME,
    env: runtimeConfig.envName,
    terminalSource: runtimeConfig.terminalSource,
  })
}
