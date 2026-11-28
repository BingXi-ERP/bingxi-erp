import { fileURLToPath } from 'node:url'
import { defineManifestConfig } from '@uni-helper/vite-plugin-uni-manifest'
import { loadEnv } from 'vite'
import { zhCN } from './shared/i18n/zh-CN'

/** 微信官方测试号 AppID：未注入正式 AppID 时用它产出可打开的项目，正式值由 CI 以 VITE_APP_ID 注入。 */
const TEST_APP_ID = 'touristappid'

// manifest 在 Node 侧生成，读不到 import.meta.env，这里直接取构建环境的 VITE_* 变量（含 .env 文件与进程环境变量）。
const buildEnv = loadEnv(
  process.env.NODE_ENV ?? 'development',
  fileURLToPath(new URL('../', import.meta.url)),
  'VITE_',
)
const appId = buildEnv.VITE_APP_ID?.trim() ?? ''
if (appId === '') {
  console.warn(
    `[miniapp] manifest: VITE_APP_ID is missing; using the WeChat test AppID ${TEST_APP_ID}`,
  )
}

export default defineManifestConfig({
  name: zhCN.app.name,
  appid: '',
  description: zhCN.app.description,
  versionName: '1.0.0',
  versionCode: '100',
  transformPx: false,
  'mp-weixin': {
    appid: appId === '' ? TEST_APP_ID : appId,
    setting: {
      urlCheck: false,
    },
    usingComponents: true,
  },
  uniStatistics: {
    enable: false,
  },
  vueVersion: '3',
})
