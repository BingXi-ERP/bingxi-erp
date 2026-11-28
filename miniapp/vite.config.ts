import { fileURLToPath } from 'node:url'
import UniManifest from '@uni-helper/vite-plugin-uni-manifest'
import uni from '@dcloudio/vite-plugin-uni'
import { defineConfig } from 'vite'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

const uniManifest = UniManifest({
  cwd: srcDir,
  outDir: '.',
  dotenv: false,
  indent: 2,
  insertFinalNewline: true,
})

const createUniPlugin = (uni as unknown as { default?: typeof uni }).default ?? uni

export default defineConfig({
  plugins: [uniManifest, createUniPlugin()],
})
