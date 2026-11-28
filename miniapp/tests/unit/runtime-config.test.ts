// miniapp/tests/unit/runtime-config.test.ts
import { describe, expect, it } from 'vitest'
import { loadRuntimeConfig } from '../../src/shared/config/runtime'

describe('loadRuntimeConfig', () => {
  it('requires an explicit API base URL', () => {
    expect(() => loadRuntimeConfig({} as ImportMetaEnv)).toThrow('VITE_API_BASE_URL')
  })

  it('loads the test environment without embedding secrets', () => {
    const config = loadRuntimeConfig({
      VITE_API_BASE_URL: 'https://erp.example.test',
      VITE_APP_ID: 'touristappid',
      VITE_ENV_NAME: 'test',
      VITE_TERMINAL_SOURCE: '81',
    } as ImportMetaEnv)

    expect(config).toEqual({
      apiBaseUrl: 'https://erp.example.test',
      appId: 'touristappid',
      envName: 'test',
      terminalSource: 81,
    })
  })
})
