import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/contract/**/*.test.ts'],
    /**
     * wot-design-uni 只发 .ts 源码（没有预编译产物，也没有 .d.ts）。
     * Vitest 默认把 node_modules 依赖外部化、直接交给 Node 解析，.ts 在 Node 侧加载不了，
     * tests/contract/wot-runtime-api.test.ts 就取不到真实导出，所以要让 Vite 参与它的转换。
     * @dcloudio/uni-cli-shared 是已编译的 CJS，保持外部化，由 Node 的 require 互操作处理。
     */
    server: {
      deps: {
        inline: ['wot-design-uni'],
      },
    },
    /**
     * 单元与契约测试不连真实后端：这里给一份只在测试进程生效的构建期变量，
     * 使被导入的业务模块在初始化运行配置时能通过校验（占位主机不对应任何真实环境）。
     * 运行时 E2E 使用 vitest.e2e.config.ts，由 CI 注入真实环境变量。
     */
    env: {
      VITE_API_BASE_URL: 'https://erp.example.test',
      VITE_APP_ID: 'touristappid',
      VITE_ENV_NAME: 'test',
      VITE_TERMINAL_SOURCE: '81',
    },
  },
})
