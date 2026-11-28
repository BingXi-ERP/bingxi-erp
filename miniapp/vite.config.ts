import { fileURLToPath } from 'node:url'
import UniManifest from '@uni-helper/vite-plugin-uni-manifest'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

/**
 * manifest.json 由 src/manifest.config.ts 生成（AppID 等按构建环境注入，不写死在仓库里）。
 * uni 自己的 config 钩子就会读 manifest.json，早于本插件的 configResolved，
 * 因此首次构建前必须显式 prepare 一次；生成的 manifest.json 不入库。
 * dotenv 关掉：环境变量由 manifest.config.ts 直接从工程根目录的 .env 与进程环境读取。
 */
const uniManifest = UniManifest({
  cwd: srcDir,
  outDir: '.',
  dotenv: false,
  indent: 2,
  insertFinalNewline: true,
})

export default defineConfig(async () => {
  await uniManifest.prepare()
  return {
    plugins: [uniManifest, uni()],
  }
})
