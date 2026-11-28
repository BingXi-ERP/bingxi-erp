import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const miniappRoot = fileURLToPath(new URL('../../', import.meta.url))
const resultsDir = fileURLToPath(new URL('../../test-results/', import.meta.url))
const vitestBin = fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url))
const vitestConfig = fileURLToPath(new URL('../../vitest.e2e.config.ts', import.meta.url))
const weixinBuild = fileURLToPath(new URL('../../dist/build/mp-weixin/', import.meta.url))

mkdirSync(resultsDir, { recursive: true })
const exitCodeFile = join(resultsDir, 'exit-code.txt')
const jsonResultFile = join(resultsDir, 'e2e.json')
rmSync(exitCodeFile, { force: true })
rmSync(jsonResultFile, { force: true })

function finish(code) {
  mkdirSync(resultsDir, { recursive: true })
  writeFileSync(exitCodeFile, `${code}\n`, 'utf8')
  process.exit(code)
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`MINIAPP_E2E_CONFIG_ERROR missing=${name}`)
    finish(1)
  }
  return value
}

async function checkBackend(baseUrl) {
  const readinessUrl = new URL('/health/readiness', baseUrl)
  const response = await fetch(readinessUrl, { signal: AbortSignal.timeout(10_000) })
  if (!response.ok) {
    throw new Error(`后端就绪检查 HTTP ${response.status}`)
  }
  const body = await response.json()
  if (body.status !== 'healthy') {
    throw new Error('后端就绪检查未返回 healthy')
  }
  console.info('MINIAPP_E2E_BACKEND_READY status=healthy')
}

let child
try {
  const automatorWs = requireEnv('MINIAPP_AUTOMATOR_WS')
  const backendUrl = requireEnv('E2E_BASE_URL')
  requireEnv('E2E_USERNAME')
  requireEnv('E2E_PASSWORD')

  const parsedAutomatorWs = new URL(automatorWs)
  if (parsedAutomatorWs.protocol !== 'ws:') {
    throw new Error('MINIAPP_AUTOMATOR_WS 必须是 ws:// 地址')
  }
  const parsedBackendUrl = new URL(backendUrl)
  if (parsedBackendUrl.protocol !== 'http:') {
    throw new Error('E2E_BASE_URL 必须是本机 CI 的 http:// 地址')
  }
  if (!existsSync(vitestBin)) {
    throw new Error('Vitest 未安装，请先执行 npm --prefix miniapp ci')
  }
  if (!existsSync(`${weixinBuild}app.json`) || !existsSync(`${weixinBuild}app.js`)) {
    throw new Error('缺少 miniapp/dist/build/mp-weixin 构建产物')
  }

  await checkBackend(backendUrl)

  console.info('MINIAPP_E2E_VITEST_START')
  child = spawn(process.execPath, [vitestBin, 'run', '--config', vitestConfig], {
    cwd: miniappRoot,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('error', (error) => {
    console.error('MINIAPP_E2E_VITEST_SPAWN_ERROR', error)
    finish(1)
  })
  child.on('close', (code, signal) => {
    console.info('MINIAPP_E2E_VITEST_EXIT', { code, signal })
    finish(code ?? 1)
  })
} catch (error) {
  console.error('MINIAPP_E2E_RUNNER_ERROR', error)
  finish(1)
}
