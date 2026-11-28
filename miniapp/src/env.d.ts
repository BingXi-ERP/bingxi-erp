/// <reference types="vite/client" />

/**
 * 构建期注入的运行时环境变量。
 * 类型上保持可选：是否缺失由 shared/config/runtime 在启动时校验并报错，这里只声明可用键名。
 */
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_APP_ID?: string
  readonly VITE_ENV_NAME?: string
  readonly VITE_TERMINAL_SOURCE?: string
}
