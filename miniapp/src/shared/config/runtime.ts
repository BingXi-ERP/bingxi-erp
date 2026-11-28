export type RuntimeEnvName = 'development' | 'test' | 'production'

export interface RuntimeConfig {
  apiBaseUrl: string
  appId: string
  envName: RuntimeEnvName
  terminalSource: number
}

const RUNTIME_ENV_NAMES = ['development', 'test', 'production'] as const

const REQUIRED_ENV_KEYS = [
  'VITE_API_BASE_URL',
  'VITE_APP_ID',
  'VITE_ENV_NAME',
  'VITE_TERMINAL_SOURCE',
] as const

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number]

function isPresent(env: ImportMetaEnv, key: RequiredEnvKey): boolean {
  const value = env[key]
  return typeof value === 'string' && value.trim() !== ''
}

/** 读取一个必需环境变量：缺失或为空白直接失败，不做任何默认值兜底；末尾斜杠统一剔除，避免拼接出双斜杠。 */
function readRequired(env: ImportMetaEnv, key: RequiredEnvKey): string {
  const value = env[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value.trim().replace(/\/$/, '')
}

function isRuntimeEnvName(value: string): value is RuntimeEnvName {
  return (RUNTIME_ENV_NAMES as readonly string[]).includes(value)
}

/**
 * 从构建期注入的环境变量装配运行时配置。
 * 一次报出全部缺失项，避免逐项试错；任何一项不合法都拒绝启动，而不是带着半套配置运行。
 */
export function loadRuntimeConfig(env: ImportMetaEnv): RuntimeConfig {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !isPresent(env, key))
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  const apiBaseUrl = readRequired(env, 'VITE_API_BASE_URL')
  const appId = readRequired(env, 'VITE_APP_ID')

  const envName = readRequired(env, 'VITE_ENV_NAME')
  if (!isRuntimeEnvName(envName)) {
    throw new Error(`Invalid VITE_ENV_NAME: ${envName}`)
  }

  const terminalSource = Number(readRequired(env, 'VITE_TERMINAL_SOURCE'))
  if (!Number.isInteger(terminalSource) || terminalSource <= 0) {
    throw new Error('VITE_TERMINAL_SOURCE must be a positive integer')
  }

  return { apiBaseUrl, appId, envName, terminalSource }
}

export const runtimeConfig: RuntimeConfig = loadRuntimeConfig(import.meta.env)
