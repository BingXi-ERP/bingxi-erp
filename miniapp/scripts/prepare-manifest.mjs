import { fileURLToPath } from 'node:url'
import UniManifest from '@uni-helper/vite-plugin-uni-manifest'

const cwd = fileURLToPath(new URL('../src/', import.meta.url))

await UniManifest({
  cwd,
  outDir: '.',
  dotenv: false,
  indent: 2,
  insertFinalNewline: true,
}).prepare()
