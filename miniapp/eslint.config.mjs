import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'unpackage/',
      'coverage/',
      'test-results/',
      'playwright-report/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // flat/essential 只取 Vue 的正确性与最佳实践规则，格式交给 Prettier，避免两套工具互相改写。
  ...pluginVue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, uni: 'readonly' },
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'error',
      'vue/require-explicit-emits': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // 小程序侧的启动与失败路径必须留痕，console.info/warn/error 是运行期唯一可用的日志出口。
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      'no-debugger': 'error',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
]
