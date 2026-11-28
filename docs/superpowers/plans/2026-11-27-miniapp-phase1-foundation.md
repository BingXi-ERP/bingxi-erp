# Miniapp Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成可独立验收的 uni-app 小程序平台底座，包括工程骨架、设计系统、契约驱动 API、会话权限、后端微信登录、静态门与真实运行时 E2E。

**Architecture:** 新建 `miniapp/`，采用功能域模块化单体；`shared/api` 是唯一网络出口，Pinia 只保存跨页状态；后端仅做增量扩展，新增小程序登录与身份绑定，不改变现有 API 契约。

**Tech Stack:** uni-app、Vue 3、TypeScript、Pinia、Wot Design Uni、Zod、Vitest、Vue Test Utils、miniprogram-automator、Rust/Axum/SeaORM/PostgreSQL。

**Spec:** `docs/superpowers/specs/2026-11-27-miniapp-rebuild-design.md`

## Global Constraints

- 新工程目录固定为 `miniapp/`；旧 `miniprogram/` 在新应用全量验收前不得修改、删除或改名。
- 新小程序只能调用真实 `/api/v1/erp` 端点；禁止 `/app-api`、`/oauth-api`、假数据、404 占位和静默兜底。
- 后端只做增量扩展；不得改变现有 `/api/v1/erp` 响应形状、分页信封、状态词表或错误信封。
- 分页只接受 `{items,total,page,page_size}`；错误只接受 `AppError{code,message,trace_id,timestamp}`。
- Decimal 在 API 边界保持字符串；状态 token 以 `backend/src/models/status/` 为唯一事实源。
- 本地只允许静态检查：`vue-tsc -b --force`、ESLint、Prettier、`bash -n` 和仓库门禁；禁止本地运行 uni-app 构建、Vitest、Playwright、miniprogram-automator 或后端编译测试。
- 所有构建、单元测试、契约测试和运行时 E2E 只在 GitHub Actions 执行。
- 不直接修改 `.github/workflows/ci-cd.yml`；新工程使用独立工作流。
- 不在仓库提交真实 AppID/Secret、主机地址、Cookie 或 token。
- 每项修复一个 commit，Conventional Commits 且 scope 必填；仅使用显式路径暂存。
- 未获得用户明确授权前，不提交、不推送、不合并、不发布。
- 计划中的 commit 步骤只在用户授权后执行；未授权时保留工作树改动。

---

## File Structure

### 新小程序

```text
miniapp/
├─ .env.example
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ src/
│  ├─ App.vue
│  ├─ app.ts
│  ├─ main.ts
│  ├─ pages.json
│  ├─ manifest.config.ts
│  ├─ env.d.ts
│  ├─ features/
│  │  ├─ auth/
│  │  │  ├─ guards.ts
│  │  │  ├─ composables/useSession.ts
│  │  │  ├─ services/auth.ts
│  │  │  └─ stores/session.ts
│  │  └─ workspace/
│  │     └─ pages/index/index.vue
│  ├─ shared/
│  │  ├─ api/
│  │  │  ├─ client.ts
│  │  │  ├─ contracts.ts
│  │  │  ├─ csrf.ts
│  │  │  ├─ errors.ts
│  │  │  ├─ logger.ts
│  │  │  └─ response.ts
│  │  ├─ config/runtime.ts
│  │  ├─ design/tokens.css
│  │  ├─ stores/permissions.ts
│  │  ├─ ui/
│  │  │  ├─ templates/
│  │  │  └─ wot/
│  │  └─ validation/
│  └─ styles/index.scss
└─ tests/
   ├─ unit/
   ├─ contract/
   └─ e2e/
```

### 后端

```text
backend/
├─ Cargo.toml
├─ migration/src/domain/miniapp_identity/
│  ├─ mod.rs
│  └─ m0001_create_miniapp_identity.rs
├─ src/
│  ├─ config/settings.rs
│  ├─ handlers/auth_handler.rs
│  ├─ middleware/public_routes.rs
│  ├─ models/miniapp_identity.rs
│  ├─ routes/auth.rs
│  └─ services/wechat_miniapp_service.rs
└─ tests/handlers_miniapp_login_test.rs
```

### CI 与台账

```text
.github/workflows/miniapp-checks.yml
.github/workflows/miniapp-e2e.yml
scripts/ci/miniapp-contract-check.mjs
scripts/ci/miniapp-gap-inventory.mjs
scripts/ci/install-wechat-devtools.ps1
docs/plans/miniapp-backend-gap-ledger.md
docs/plans/miniapp-phase1-acceptance.md
```

---

### Task 1: Bootstrap uni-app Project and Runtime Configuration

**Files:**
- Create: `miniapp/package.json`
- Create: `miniapp/package-lock.json`
- Create: `miniapp/tsconfig.json`
- Create: `miniapp/vite.config.ts`
- Create: `miniapp/vitest.config.ts`
- Create: `miniapp/src/pages.json`
- Create: `miniapp/src/manifest.config.ts`
- Create: `miniapp/src/env.d.ts`
- Create: `miniapp/src/main.ts`
- Create: `miniapp/src/App.vue`
- Create: `miniapp/src/app.ts`
- Create: `miniapp/src/shared/config/runtime.ts`
- Create: `miniapp/tests/unit/runtime-config.test.ts`
- Create: `miniapp/.env.example`
- Create: `miniapp/.gitignore`

**Interfaces:**
- Produces: `loadRuntimeConfig(env: ImportMetaEnv): RuntimeConfig`
- Produces: `RuntimeConfig { apiBaseUrl: string; appId: string; envName: 'development' | 'test' | 'production'; terminalSource: number }`
- Produces: npm scripts `dev:mp-weixin`, `build:mp-weixin`, `typecheck`, `lint`, `format`, `test:run`, `test:e2e`.

- [ ] **Step 1: Write the failing runtime configuration test**

```ts
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
```

- [ ] **Step 2: Verify the test fails in CI**

Run in GitHub Actions after the workflow from Task 10 exists:

```bash
npm --prefix miniapp run test:run -- tests/unit/runtime-config.test.ts
```

Expected: FAIL because `src/shared/config/runtime.ts` does not exist.

- [ ] **Step 3: Scaffold the official uni-app Vue 3 Vite TypeScript preset**

```bash
npx degit dcloudio/uni-preset-vue#vite-ts miniapp
npm --prefix miniapp install
npm --prefix miniapp install pinia wot-design-uni zod
npm --prefix miniapp install -D typescript vue-tsc vite @vitejs/plugin-vue eslint @eslint/js typescript-eslint eslint-plugin-vue globals prettier vitest @vue/test-utils jsdom @types/node
```

- [ ] **Step 4: Configure package scripts and TypeScript**

```json
{
  "scripts": {
    "dev:mp-weixin": "uni -p mp-weixin",
    "build:mp-weixin": "uni build -p mp-weixin",
    "typecheck": "vue-tsc -b --force",
    "lint": "eslint src tests",
    "format": "prettier --write src tests",
    "test:run": "vitest run",
    "test:e2e": "node tests/e2e/run.mjs"
  }
}
```

```ts
// miniapp/tsconfig.json
{
  "extends": "@dcloudio/uni-app/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "noImplicitAny": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vite/client", "node"]
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts", "*.ts"]
}
```

- [ ] **Step 5: Implement runtime configuration**

```ts
// miniapp/src/shared/config/runtime.ts
export type RuntimeEnvName = 'development' | 'test' | 'production'

export interface RuntimeConfig {
  apiBaseUrl: string
  appId: string
  envName: RuntimeEnvName
  terminalSource: number
}

function requiredEnv(env: ImportMetaEnv, key: keyof ImportMetaEnv): string {
  const value = env[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`缺少必需环境变量：${key}`)
  }
  return value.trim().replace(/\/$/, '')
}

export function loadRuntimeConfig(env: ImportMetaEnv): RuntimeConfig {
  const envName = requiredEnv(env, 'VITE_ENV_NAME')
  if (!['development', 'test', 'production'].includes(envName)) {
    throw new Error(`非法 VITE_ENV_NAME：${envName}`)
  }
  const terminalSource = Number(requiredEnv(env, 'VITE_TERMINAL_SOURCE'))
  if (!Number.isInteger(terminalSource) || terminalSource <= 0) {
    throw new Error('VITE_TERMINAL_SOURCE 必须是正整数')
  }
  return {
    apiBaseUrl: requiredEnv(env, 'VITE_API_BASE_URL'),
    appId: requiredEnv(env, 'VITE_APP_ID'),
    envName: envName as RuntimeEnvName,
    terminalSource,
  }
}

export const runtimeConfig = loadRuntimeConfig(import.meta.env)
```

- [ ] **Step 6: Add environment template and ignore rules**

```dotenv
# miniapp/.env.example
VITE_API_BASE_URL=https://your-erp-host.example
VITE_APP_ID=touristappid
VITE_ENV_NAME=development
VITE_TERMINAL_SOURCE=81
```

```gitignore
# miniapp/.gitignore
node_modules/
dist/
unpackage/
.env
.env.*
!.env.example
coverage/
test-results/
playwright-report/
```

- [ ] **Step 7: Run local static checks and CI tests**

Local static checks only:

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src miniapp/tests miniapp/*.ts miniapp/*.json
```

CI test command:

```bash
npm --prefix miniapp run test:run -- tests/unit/runtime-config.test.ts
npm --prefix miniapp run build:mp-weixin
```

Expected: typecheck, lint, unit test and WeChat build all pass.

- [ ] **Step 8: Commit when authorized**

```bash
git add miniapp/package.json miniapp/package-lock.json miniapp/tsconfig.json miniapp/vite.config.ts miniapp/vitest.config.ts miniapp/src miniapp/tests/unit/runtime-config.test.ts miniapp/.env.example miniapp/.gitignore
git commit -m "feat(miniapp): bootstrap uni-app vue3 typescript foundation"
```

---

### Task 2: Design Tokens, Wot Wrappers, and Page Templates

**Files:**
- Create: `miniapp/src/shared/design/tokens.css`
- Create: `miniapp/src/shared/ui/wot/WButton.vue`
- Create: `miniapp/src/shared/ui/wot/WInput.vue`
- Create: `miniapp/src/shared/ui/wot/WSelect.vue`
- Create: `miniapp/src/shared/ui/wot/WDialog.vue`
- Create: `miniapp/src/shared/ui/wot/WToast.vue`
- Create: `miniapp/src/shared/ui/StateView.vue`
- Create: `miniapp/src/shared/ui/templates/ListPageTemplate.vue`
- Create: `miniapp/src/shared/ui/templates/FormPageTemplate.vue`
- Create: `miniapp/src/shared/ui/templates/DetailPageTemplate.vue`
- Create: `miniapp/src/styles/index.scss`
- Modify: `miniapp/src/App.vue`
- Create: `miniapp/tests/unit/state-view.test.ts`
- Create: `miniapp/tests/unit/page-templates.test.ts`

**Interfaces:**
- Produces: `StateView` props `{ status: 'loading' | 'empty' | 'error' | 'success'; message?: string; retry?: () => void }`.
- Produces: `ListPageTemplate` slots `filter`, `default`, `footer`.
- Produces: `FormPageTemplate` slots `default`, `footer`.
- Produces: `DetailPageTemplate` slots `default`, `footer`.

- [ ] **Step 1: Write failing component tests**

```ts
// miniapp/tests/unit/state-view.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import StateView from '../../src/shared/ui/StateView.vue'

describe('StateView', () => {
  it('renders empty state and calls retry only from error state', async () => {
    const wrapper = mount(StateView, { props: { status: 'empty', message: '暂无数据' } })
    expect(wrapper.text()).toContain('暂无数据')
    expect(wrapper.find('button').exists()).toBe(false)

    const retry = vi.fn()
    await wrapper.setProps({ status: 'error', message: '加载失败', retry })
    await wrapper.find('button').trigger('click')
    expect(retry).toHaveBeenCalledOnce()
  })
})
```

```ts
// miniapp/tests/unit/page-templates.test.ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ListPageTemplate from '../../src/shared/ui/templates/ListPageTemplate.vue'

describe('ListPageTemplate', () => {
  it('renders filter, content and footer slots', () => {
    const wrapper = mount(ListPageTemplate, {
      slots: {
        filter: '<view data-test="filter">筛选</view>',
        default: '<view data-test="content">列表</view>',
        footer: '<view data-test="footer">底部</view>',
      },
    })
    expect(wrapper.find('[data-test="filter"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="content"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="footer"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/unit/state-view.test.ts tests/unit/page-templates.test.ts
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement design tokens**

```css
/* miniapp/src/shared/design/tokens.css */
:root {
  --color-primary: #176b87;
  --color-primary-light: #e8f4f8;
  --color-success: #2f855a;
  --color-warning: #b7791f;
  --color-danger: #c53030;
  --color-text: #1a202c;
  --color-text-secondary: #4a5568;
  --color-border: #e2e8f0;
  --color-surface: #ffffff;
  --color-background: #f7fafc;
  --space-1: 8rpx;
  --space-2: 16rpx;
  --space-3: 24rpx;
  --space-4: 32rpx;
  --radius-sm: 8rpx;
  --radius-md: 16rpx;
  --radius-lg: 24rpx;
  --font-sm: 24rpx;
  --font-md: 28rpx;
  --font-lg: 32rpx;
  --shadow-card: 0 8rpx 24rpx rgba(15, 23, 42, 0.06);
}
```

- [ ] **Step 4: Implement StateView and page templates**

```vue
<!-- miniapp/src/shared/ui/StateView.vue -->
<template>
  <view class="state-view">
    <view v-if="status === 'loading'" class="state-view__text">加载中...</view>
    <view v-else-if="status === 'empty'" class="state-view__text">{{ message || '暂无数据' }}</view>
    <view v-else-if="status === 'error'" class="state-view__error">
      <text>{{ message || '加载失败，请重试' }}</text>
      <button v-if="retry" size="mini" @click="retry">重试</button>
    </view>
    <slot v-else />
  </view>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ status: 'loading' | 'empty' | 'error' | 'success'; message?: string; retry?: () => void }>(), {
  status: 'success',
})
</script>
```

```vue
<!-- miniapp/src/shared/ui/templates/ListPageTemplate.vue -->
<template>
  <view class="page list-page">
    <view class="list-page__filter"><slot name="filter" /></view>
    <view class="list-page__content"><slot /></view>
    <view class="list-page__footer"><slot name="footer" /></view>
  </view>
</template>
```

```vue
<!-- miniapp/src/shared/ui/templates/FormPageTemplate.vue -->
<template>
  <view class="page form-page">
    <view class="form-page__content"><slot /></view>
    <view class="form-page__footer"><slot name="footer" /></view>
  </view>
</template>
```

```vue
<!-- miniapp/src/shared/ui/templates/DetailPageTemplate.vue -->
<template>
  <view class="page detail-page">
    <view class="detail-page__content"><slot /></view>
    <view class="detail-page__footer"><slot name="footer" /></view>
  </view>
</template>
```

- [ ] **Step 5: Wrap Wot components behind stable project interfaces**

```vue
<!-- miniapp/src/shared/ui/wot/WButton.vue -->
<template>
  <wd-button v-bind="$attrs" :type="type" :disabled="disabled || loading" @click="onClick">
    <slot />
  </wd-button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ type?: 'primary' | 'success' | 'warning' | 'error' | 'info'; disabled?: boolean; loading?: boolean }>(), {
  type: 'primary',
  disabled: false,
  loading: false,
})
const emit = defineEmits<{ click: [event: MouseEvent] }>()
function onClick(event: MouseEvent) { emit('click', event) }
</script>
```

Create `WInput.vue`, `WSelect.vue`, `WDialog.vue`, and `WToast.vue` with the same rule: project code imports `shared/ui/wot/*`, never `wot-design-uni` directly.

- [ ] **Step 6: Wire global styles and Wot in the app entry**

```ts
// miniapp/src/main.ts
import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import WotDesignUni from 'wot-design-uni'
import App from './App.vue'
import './styles/index.scss'
import './shared/design/tokens.css'

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  app.use(WotDesignUni)
  return { app }
}
```

```scss
/* miniapp/src/styles/index.scss */
page {
  background: var(--color-background);
  color: var(--color-text);
  font-size: var(--font-md);
}
.view,
.text,
.button {
  box-sizing: border-box;
}
```

- [ ] **Step 7: Run local static checks and CI tests**

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src miniapp/tests
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/unit/state-view.test.ts tests/unit/page-templates.test.ts
npm --prefix miniapp run build:mp-weixin
```

Expected: all pass.

- [ ] **Step 8: Commit when authorized**

```bash
git add miniapp/src/shared/design miniapp/src/shared/ui miniapp/src/styles miniapp/src/App.vue miniapp/src/main.ts miniapp/tests/unit/state-view.test.ts miniapp/tests/unit/page-templates.test.ts
git commit -m "feat(miniapp): add design system and page templates"
```

---

### Task 3: Contract Gate for paths, Methods, and Forbidden Legacy Shapes

**Files:**
- Create: `scripts/ci/miniapp-contract-check.mjs`
- Create: `miniapp/tests/contract/contract-gate.test.ts`
- Create: `miniapp/src/shared/api/contracts.ts`
- Modify: `miniapp/package.json`

**Interfaces:**
- Produces: `apiClient.get(path, query?, config?)`, `apiClient.post(path, data?, config?)`, `apiClient.put(path, data?, config?)`, `apiClient.delete(path, data?, config?)`.
- Produces: CLI `node scripts/ci/miniapp-contract-check.mjs --root miniapp --snapshot frontend/scripts/route-snapshot.txt`.
- Produces: CLI `node scripts/ci/miniapp-contract-check.mjs --self-test`.

- [ ] **Step 1: Write the contract gate self-test**

```ts
// miniapp/tests/contract/contract-gate.test.ts
import { describe, expect, it } from 'vitest'
import { normalizeApiPath, findForbiddenLegacyTokens } from '../../../scripts/ci/miniapp-contract-check.mjs'

describe('miniapp contract gate', () => {
  it('normalizes dynamic path segments to wildcards', () => {
    expect(normalizeApiPath('/api/v1/erp/sales/orders/${id}/cancel')).toBe('/api/v1/erp/sales/orders/*/cancel')
  })

  it('detects legacy endpoints and legacy pagination keys', () => {
    const source = `
      apiClient.get('/app-api/goods/list')
      const rows = response.data.content
      const page = response.data.pageNo
    `
    expect(findForbiddenLegacyTokens(source)).toEqual([
      'legacy-endpoint:/app-api/',
      'legacy-pagination:data.content',
      'legacy-pagination:data.pageNo',
    ])
  })
})
```

- [ ] **Step 2: Verify the test fails in CI**

```bash
npm --prefix miniapp run test:run -- tests/contract/contract-gate.test.ts
```

Expected: FAIL because the checker module does not exist.

- [ ] **Step 3: Implement the contract checker**

```js
// scripts/ci/miniapp-contract-check.mjs
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const BASE_URL = '/api/v1/erp'

export function normalizeApiPath(value) {
  let path = String(value).split(/[?#]/)[0]
  path = path.replace(/\$\{[^}]+\}/g, '*').replace(/\{[^}]+\}/g, '*')
  path = path.replace(/\/{2,}/g, '/')
  if (!path.startsWith('/')) path = '/' + path
  return path.replace(/\/+$/, '') || '/'
}

export function findForbiddenLegacyTokens(source) {
  const hits = []
  if (source.includes('/app-api/')) hits.push('legacy-endpoint:/app-api/')
  if (source.includes('/oauth-api/')) hits.push('legacy-endpoint:/oauth-api/')
  for (const key of ['data.content', 'data.pageNo', 'data.totalPage', 'data.hasNextPage', 'data.isLastPage']) {
    if (source.includes(key)) hits.push(`legacy-pagination:${key}`)
  }
  return hits
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(ts|vue|js)$/.test(entry.name)) out.push(full)
  }
  return out
}

function loadSnapshot(path) {
  return new Set(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith('#'))
      .map((line) => {
        const [method, apiPath] = line.split('\t')
        return `${method.trim().toUpperCase()} ${normalizeApiPath(apiPath)}`
      }),
  )
}

function collectCalls(root) {
  const calls = []
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/apiClient\.(get|post|put|delete)\s*\(\s*(['"`])([^'"`]+)\2/g)) {
      calls.push({ file, method: match[1].toUpperCase(), path: normalizeApiPath(match[3]) })
    }
  }
  return calls
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'miniapp-contract-'))
  try {
    const fixture = join(dir, 'fixture.ts')
    writeFileSync(fixture, "apiClient.get('/app-api/goods/list')\nconst x = data.content\n")
    const hits = findForbiddenLegacyTokens(readFileSync(fixture, 'utf8'))
    if (!hits.includes('legacy-endpoint:/app-api/') || !hits.includes('legacy-pagination:data.content')) {
      throw new Error('DETECTOR_BLIND: legacy fixture was not detected')
    }
    console.log('MINIAPP_CONTRACT_SELFTEST_OK')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
if (args.includes('--self-test')) {
  selfTest()
  process.exit(0)
}

const root = resolve(args[args.indexOf('--root') + 1] || 'miniapp/src')
const snapshot = resolve(args[args.indexOf('--snapshot') + 1] || 'frontend/scripts/route-snapshot.txt')
const allowed = loadSnapshot(snapshot)
let failures = 0
for (const file of walk(root)) {
  const source = readFileSync(file, 'utf8')
  for (const hit of findForbiddenLegacyTokens(source)) {
    console.error(`FORBIDDEN ${hit} @ ${file}`)
    failures++
  }
}
const calls = collectCalls(root)
if (calls.length === 0) throw new Error('TOOL_BUG: no apiClient calls found')
for (const call of calls) {
  const key = `${call.method} ${call.path}`
  if (!allowed.has(key)) {
    console.error(`MISS ${key} @ ${call.file}`)
    failures++
  }
}
console.log(`MINIAPP_CONTRACT calls=${calls.length} failures=${failures}`)
process.exit(failures === 0 ? 0 : 1)
```

- [ ] **Step 4: Add shared contract constants**

```ts
// miniapp/src/shared/api/contracts.ts
export const API_BASE_PATH = '/api/v1/erp'
export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
export const AUTH_ME_PATH = `${API_BASE_PATH}/auth/me`
export const MINIAPP_LOGIN_PATH = `${API_BASE_PATH}/auth/miniapp/login`
```

- [ ] **Step 5: Run local static checks and CI contract tests**

```bash
node --check scripts/ci/miniapp-contract-check.mjs
node scripts/ci/miniapp-contract-check.mjs --self-test
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/contract/contract-gate.test.ts
node scripts/ci/miniapp-contract-check.mjs --root miniapp/src --snapshot frontend/scripts/route-snapshot.txt
```

Expected: self-test and contract gate pass.

- [ ] **Step 6: Commit when authorized**

```bash
git add scripts/ci/miniapp-contract-check.mjs miniapp/src/shared/api/contracts.ts miniapp/tests/contract/contract-gate.test.ts miniapp/package.json
git commit -m "feat(miniapp): add contract-driven endpoint gate"
```

---

### Task 4: Error Model and Response Normalization

**Files:**
- Create: `miniapp/src/shared/api/errors.ts`
- Create: `miniapp/src/shared/api/response.ts`
- Create: `miniapp/tests/unit/api-response.test.ts`

**Interfaces:**
- Produces: `class AppError extends Error` with `code`, `message`, `traceId?`, `timestamp?`, `httpStatus?`.
- Produces: `normalizeSuccess(raw: unknown): unknown`.
- Produces: `normalizeError(raw: unknown, httpStatus?: number): AppError`.
- Produces: `isAppError(value: unknown): value is AppError`.

- [ ] **Step 1: Write failing response tests**

```ts
// miniapp/tests/unit/api-response.test.ts
import { describe, expect, it } from 'vitest'
import { AppError, isAppError, normalizeError, normalizeSuccess } from '../../src/shared/api/response'

describe('API response normalization', () => {
  it('normalizes the backend success envelope without changing data', () => {
    expect(normalizeSuccess({ code: 200, data: { items: [], total: 0 }, total: 0 })).toEqual({
      items: [],
      total: 0,
    })
  })

  it('normalizes string error codes and keeps trace id', () => {
    const error = normalizeError({
      code: 'VALIDATION_ERROR',
      message: '字段校验失败',
      trace_id: 'trace-123',
      timestamp: 100,
    }, 400)
    expect(isAppError(error)).toBe(true)
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: '字段校验失败',
      traceId: 'trace-123',
      timestamp: 100,
      httpStatus: 400,
    })
  })

  it('rejects malformed responses instead of masking them', () => {
    expect(() => normalizeSuccess({ data: {} })).toThrow('响应信封缺少 code')
  })
})
```

- [ ] **Step 2: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/unit/api-response.test.ts
```

Expected: FAIL because response module does not exist.

- [ ] **Step 3: Implement the error model**

```ts
// miniapp/src/shared/api/errors.ts
export class AppError extends Error {
  readonly code: string
  readonly traceId?: string
  readonly timestamp?: number
  readonly httpStatus?: number
  readonly recoveryToken?: string

  constructor(input: { code: string; message: string; traceId?: string; timestamp?: number; httpStatus?: number; recoveryToken?: string }) {
    super(input.message)
    this.name = 'AppError'
    this.code = input.code
    this.traceId = input.traceId
    this.timestamp = input.timestamp
    this.httpStatus = input.httpStatus
    this.recoveryToken = input.recoveryToken
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError
}
```

- [ ] **Step 4: Implement response normalization**

```ts
// miniapp/src/shared/api/response.ts
import { AppError } from './errors'

const ERROR_CODE_HTTP: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  BUSINESS_ERROR: 400,
  CSRF_TOKEN_MISSING: 403,
  CSRF_TOKEN_INVALID: 403,
  CSRF_TOKEN_BINDING_MISMATCH: 403,
  TOO_MANY_REQUESTS: 429,
  TIMEOUT: 504,
  SERVICE_UNAVAILABLE: 503,
  DATABASE_ERROR: 500,
  INTERNAL_ERROR: 500,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeSuccess(raw: unknown): unknown {
  if (!isRecord(raw)) throw new Error('响应不是对象')
  if (typeof raw.code !== 'number') throw new Error('响应信封缺少 code')
  if (raw.code !== 200) throw new Error(`非成功响应码：${raw.code}`)
  if (!('data' in raw)) throw new Error('成功响应缺少 data')
  return raw.data
}

export function normalizeError(raw: unknown, httpStatus?: number): AppError {
  if (!isRecord(raw)) return new AppError({ code: 'NETWORK_ERROR', message: '网络响应格式错误', httpStatus })
  if (typeof raw.code !== 'string') {
    return new AppError({ code: 'UNKNOWN_ERROR', message: '未知错误', httpStatus })
  }
  return new AppError({
    code: raw.code,
    message: typeof raw.message === 'string' ? raw.message : raw.code,
    traceId: typeof raw.trace_id === 'string' ? raw.trace_id : undefined,
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : undefined,
    httpStatus: httpStatus ?? ERROR_CODE_HTTP[raw.code],
  })
}
```

- [ ] **Step 5: Run local static checks and CI tests**

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src/shared/api miniapp/tests/unit/api-response.test.ts
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/unit/api-response.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit when authorized**

```bash
git add miniapp/src/shared/api/errors.ts miniapp/src/shared/api/response.ts miniapp/tests/unit/api-response.test.ts
git commit -m "feat(miniapp): add typed API error and response normalization"
```

---

### Task 5: HTTP Client, CSRF Queue, and Structured Logging

**Files:**
- Create: `miniapp/src/shared/api/csrf.ts`
- Create: `miniapp/src/shared/api/logger.ts`
- Create: `miniapp/src/shared/api/client.ts`
- Create: `miniapp/tests/unit/csrf-queue.test.ts`
- Create: `miniapp/tests/unit/api-client.test.ts`

**Interfaces:**
- Consumes: `normalizeSuccess`, `normalizeError`, `AppError` from Task 4.
- Produces: `CsrfTokenQueue` with `run<T>(task: (token: string) => Promise<T>): Promise<T>`.
- Produces: `apiClient.get/post/put/delete`.
- Produces: `logger.info/warn/error` with structured context.

- [ ] **Step 1: Write failing CSRF queue tests**

```ts
// miniapp/tests/unit/csrf-queue.test.ts
import { describe, expect, it } from 'vitest'
import { CsrfTokenQueue } from '../../src/shared/api/csrf'

describe('CsrfTokenQueue', () => {
  it('serializes one-time token consumption', async () => {
    let current = 'token-1'
    const queue = new CsrfTokenQueue({ read: () => current, remove: () => { current = '' } })
    const seen: string[] = []
    await Promise.all([
      queue.run(async (token) => { seen.push(token); current = 'token-2' }),
      queue.run(async (token) => { seen.push(token); current = 'token-3' }),
    ])
    expect(seen).toEqual(['token-1', 'token-2'])
    expect(current).toBe('token-3')
  })
})
```

- [ ] **Step 2: Write failing API client tests**

```ts
// miniapp/tests/unit/api-client.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()
const storage = new Map<string, unknown>()
vi.stubGlobal('uni', {
  request,
  getStorageSync: (key: string) => storage.get(key),
  setStorageSync: (key: string, value: unknown) => storage.set(key, value),
  removeStorageSync: (key: string) => storage.delete(key),
})

import { apiClient } from '../../src/shared/api/client'

describe('apiClient', () => {
  beforeEach(() => {
    request.mockReset()
    uni.setStorageSync('bingxiCsrf', 'csrf-1')
  })

  it('sends GET with normalized query and returns data', async () => {
    request.mockResolvedValue({ statusCode: 200, data: { code: 200, data: { items: [] } }, header: {} })
    await expect(apiClient.get('/api/v1/erp/products', { page: 1, page_size: 10 })).resolves.toEqual({ items: [] })
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      header: { 'X-Requested-With': 'XMLHttpRequest' },
    })
  })

  it('replays once with the recovered CSRF token', async () => {
    request
      .mockResolvedValueOnce({
        statusCode: 403,
        data: { code: 'CSRF_TOKEN_INVALID', message: 'CSRF Token 无效', trace_id: 'trace-1', timestamp: 1 },
        header: { 'x-new-csrf-token': 'csrf-2' },
      })
      .mockResolvedValueOnce({ statusCode: 200, data: { code: 200, data: { id: 1 } }, header: {} })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).resolves.toEqual({ id: 1 })
    expect(uni.getStorageSync('bingxiCsrf')).toBe('csrf-2')
  })

  it('does not replay CSRF binding mismatch', async () => {
    request.mockResolvedValue({
      statusCode: 403,
      data: { code: 'CSRF_TOKEN_BINDING_MISMATCH', message: '安全令牌不匹配', trace_id: 'trace-2', timestamp: 1 },
      header: {},
    })
    await expect(apiClient.post('/api/v1/erp/sales/orders', {})).rejects.toMatchObject({
      code: 'CSRF_TOKEN_BINDING_MISMATCH',
      traceId: 'trace-2',
    })
    expect(request).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 3: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/unit/csrf-queue.test.ts tests/unit/api-client.test.ts
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement CSRF serialization**

```ts
// miniapp/src/shared/api/csrf.ts
const CSRF_KEY = 'bingxiCsrf'

export class CsrfTokenQueue {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly store: { read: () => string; remove: () => void }) {}

  run<T>(task: (token: string) => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      const token = this.store.read()
      this.store.remove()
      return task(token)
    })
    this.tail = result.catch(() => undefined)
    return result
  }
}

export const csrfQueue = new CsrfTokenQueue({
  read: () => uni.getStorageSync(CSRF_KEY) || '',
  remove: () => uni.removeStorageSync(CSRF_KEY),
})
```

- [ ] **Step 5: Implement structured logger**

```ts
// miniapp/src/shared/api/logger.ts
type LogLevel = 'info' | 'warn' | 'error'
export interface LogContext { traceId?: string; method?: string; path?: string; status?: number; durationMs?: number; [key: string]: unknown }

export const logger = {
  info(message: string, context: LogContext = {}) { console.info(`[miniapp] ${message}`, context) },
  warn(message: string, context: LogContext = {}) { console.warn(`[miniapp] ${message}`, context) },
  error(message: string, context: LogContext = {}) { console.error(`[miniapp] ${message}`, context) },
}
```

- [ ] **Step 6: Implement HTTP client**

```ts
// miniapp/src/shared/api/client.ts
import { runtimeConfig } from '../config/runtime'
import { csrfQueue } from './csrf'
import { AppError } from './errors'
import { logger } from './logger'
import { normalizeError, normalizeSuccess } from './response'
import { AUTH_ME_PATH, SAFE_METHODS } from './contracts'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
interface RequestConfig { method: Method; path: string; query?: Record<string, unknown>; data?: unknown; headers?: Record<string, string>; skipAuthRetry?: boolean }

function buildUrl(path: string, query?: Record<string, unknown>) {
  const url = `${runtimeConfig.apiBaseUrl}${path}`
  if (!query) return url
  const search = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return search ? `${url}?${search}` : url
}

function extractCsrf(response: UniApp.RequestSuccessCallbackResult): string {
  const header = response.header['x-new-csrf-token'] || response.header['X-New-Csrf-Token']
  if (header) return String(header)
  const cookies = (response as UniApp.RequestSuccessCallbackResult & { cookies?: string[] }).cookies || []
  for (const cookie of cookies) {
    const match = /(?:^|[;\s])csrf_token=([^;,]+)/.exec(String(cookie))
    if (match) return match[1]
  }
  return ''
}

async function verifySession(): Promise<boolean> {
  const response = await new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    uni.request({ url: `${runtimeConfig.apiBaseUrl}${AUTH_ME_PATH}`, method: 'GET', header: { 'X-Requested-With': 'XMLHttpRequest' }, success: resolve, fail: reject })
  })
  return response.statusCode === 200
}

async function send(config: RequestConfig, token = ''): Promise<unknown> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'App-User-Agent': `Miniapp/${runtimeConfig.envName}`,
    terminalSource: String(runtimeConfig.terminalSource),
    ...config.headers,
  }
  if (!SAFE_METHODS.has(config.method) && token) headers['x-csrf-token'] = token
  const startedAt = Date.now()
  const response = await new Promise<UniApp.RequestSuccessCallbackResult>((resolve, reject) => {
    uni.request({ url: buildUrl(config.path, config.query), method: config.method, data: config.data, header: headers, success: resolve, fail: reject })
  })
  logger.info('request.completed', { method: config.method, path: config.path, status: response.statusCode, durationMs: Date.now() - startedAt })
  const nextCsrfToken = extractCsrf(response)
  if (response.statusCode >= 400) {
    const error = normalizeError(response.data, response.statusCode)
    throw new AppError({
      code: error.code,
      message: error.message,
      traceId: error.traceId,
      timestamp: error.timestamp,
      httpStatus: error.httpStatus,
      recoveryToken: nextCsrfToken || undefined,
    })
  }
  if (nextCsrfToken) uni.setStorageSync('bingxiCsrf', nextCsrfToken)
  return normalizeSuccess(response.data)
}

async function request(config: RequestConfig): Promise<unknown> {
  if (SAFE_METHODS.has(config.method)) return send(config)
  return csrfQueue.run(async (token) => {
    let currentToken = token
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await send(config, currentToken)
      } catch (error) {
        if (!(error instanceof AppError)) throw error
        if (error.recoveryToken) {
          currentToken = error.recoveryToken
          uni.setStorageSync('bingxiCsrf', currentToken)
          continue
        }
        if (error.httpStatus === 401 && await verifySession()) continue
        throw error
      }
    }
    throw new AppError({ code: 'REQUEST_RETRY_EXHAUSTED', message: '请求重试次数已用尽' })
  })
}

export const apiClient = {
  get: (path: string, query?: Record<string, unknown>) => request({ method: 'GET', path, query }),
  post: (path: string, data?: unknown) => request({ method: 'POST', path, data }),
  put: (path: string, data?: unknown) => request({ method: 'PUT', path, data }),
  delete: (path: string, data?: unknown) => request({ method: 'DELETE', path, data }),
}

export { AppError }
```

- [ ] **Step 7: Run local static checks and CI tests**

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src/shared/api miniapp/tests/unit/csrf-queue.test.ts miniapp/tests/unit/api-client.test.ts
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/unit/csrf-queue.test.ts tests/unit/api-client.test.ts
```

Expected: all pass.

- [ ] **Step 8: Commit when authorized**

```bash
git add miniapp/src/shared/api/csrf.ts miniapp/src/shared/api/logger.ts miniapp/src/shared/api/client.ts miniapp/tests/unit/csrf-queue.test.ts miniapp/tests/unit/api-client.test.ts
git commit -m "feat(miniapp): add contract HTTP client and CSRF queue"
```

---

### Task 6: Session Store, Auth Service, Route Guards, and Permissions

**Files:**
- Create: `miniapp/src/features/auth/services/auth.ts`
- Create: `miniapp/src/features/auth/stores/session.ts`
- Create: `miniapp/src/features/auth/composables/useSession.ts`
- Create: `miniapp/src/features/auth/guards.ts`
- Create: `miniapp/src/shared/stores/permissions.ts`
- Create: `miniapp/tests/unit/session-store.test.ts`
- Create: `miniapp/tests/unit/permissions.test.ts`

**Interfaces:**
- Consumes: `apiClient`, `AppError`, `AUTH_ME_PATH`, `MINIAPP_LOGIN_PATH`.
- Produces: `SessionState = 'none' | 'unverified' | 'valid' | 'invalid'`.
- Produces: `useSessionStore()` with `state`, `user`, `permissions`, `loginWithPassword`, `loginWithMiniapp`, `verify`, `logout`, `clear`.
- Produces: `hasPermission(required: string | string[]): boolean`.
- Produces: `createAuthGuard()`.

- [ ] **Step 1: Write failing session and permission tests**

```ts
// miniapp/tests/unit/session-store.test.ts
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '../../src/features/auth/stores/session'

const api = { get: vi.fn(), post: vi.fn() }
vi.mock('../../src/shared/api/client', () => ({ apiClient: api }))

describe('session store', () => {
  beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })

  it('marks session valid only after auth/me verification', async () => {
    api.post.mockResolvedValue({ csrf_token: 'csrf-1', user: { id: 1, username: 'alice' } })
    api.get.mockResolvedValue({ id: 1, username: 'alice', permissions: ['orders:read'] })
    const store = useSessionStore()
    await store.loginWithPassword({ username: 'alice', password: 'secret' })
    expect(store.state).toBe('valid')
    expect(store.permissions).toEqual(['orders:read'])
  })

  it('keeps snapshot on network error and clears on invalid', async () => {
    const store = useSessionStore()
    store.state = 'unverified'
    api.get.mockRejectedValueOnce(new Error('network'))
    await expect(store.verify()).resolves.toBe('error')
    expect(store.state).toBe('unverified')
    api.get.mockResolvedValueOnce({ id: 1, username: 'alice', permissions: [] })
    await store.verify()
    expect(store.state).toBe('valid')
  })
})
```

```ts
// miniapp/tests/unit/permissions.test.ts
import { describe, expect, it } from 'vitest'
import { hasPermission } from '../../src/shared/stores/permissions'

describe('hasPermission', () => {
  it('supports wildcard and action equivalence', () => {
    expect(hasPermission('orders:read', ['*:*'])).toBe(true)
    expect(hasPermission('orders:read', ['orders:view'])).toBe(true)
    expect(hasPermission(['orders:read', 'orders:update'], ['orders:edit'])).toBe(true)
    expect(hasPermission('orders:read', ['products:read'])).toBe(false)
  })
})
```

- [ ] **Step 2: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/unit/session-store.test.ts tests/unit/permissions.test.ts
```

Expected: FAIL because stores and guards do not exist.

- [ ] **Step 3: Implement permission matching**

```ts
// miniapp/src/shared/stores/permissions.ts
function split(code: string) {
  const index = code.indexOf(':')
  return index > 0 ? { resource: code.slice(0, index), action: code.slice(index + 1) } : { resource: code, action: '' }
}
function actionMatches(got: string, required: string) {
  return got === '*' || got === required || (got === 'read' && required === 'view') || (got === 'view' && required === 'read') || (got === 'update' && required === 'edit') || (got === 'edit' && required === 'update')
}
export function hasPermission(required: string | string[], permissions: string[]) {
  const list = Array.isArray(required) ? required : [required]
  return list.some((wanted) => {
    const req = split(wanted)
    return permissions.some((code) => {
      const got = split(code)
      return (got.resource === '*' || got.resource === req.resource) && actionMatches(got.action, req.action)
    })
  })
}
```

- [ ] **Step 4: Implement session store**

```ts
// miniapp/src/features/auth/stores/session.ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { apiClient } from '../../../shared/api/client'
import { AUTH_ME_PATH, MINIAPP_LOGIN_PATH } from '../../../shared/api/contracts'
import { hasPermission } from '../../../shared/stores/permissions'

export type SessionState = 'none' | 'unverified' | 'valid' | 'invalid'
interface UserInfo { id: number; username: string; phone?: string | null; real_name?: string | null; avatar?: string | null; department_id?: number | null; department_name?: string | null; role_name?: string | null; permissions: string[] }

export const useSessionStore = defineStore('session', () => {
  const state = ref<SessionState>('none')
  const user = ref<UserInfo | null>(null)
  const permissions = computed(() => user.value?.permissions ?? [])

  async function verify() {
    if (state.value === 'none') return 'none' as const
    try {
      const profile = await apiClient.get<UserInfo>(AUTH_ME_PATH)
      user.value = profile
      state.value = 'valid'
      return 'valid' as const
    } catch (error) {
      const status = (error as { httpStatus?: number }).httpStatus
      if (status === 401 || status === 403) { state.value = 'invalid'; user.value = null; return 'invalid' as const }
      return 'error' as const
    }
  }

  async function loginWithPassword(payload: { username: string; password: string; totp_token?: string; recovery_code?: string }) {
    const result = await apiClient.post<{ csrf_token: string; user: UserInfo }>('/api/v1/erp/auth/login', payload)
    uni.setStorageSync('bingxiCsrf', result.csrf_token)
    state.value = 'unverified'
    return verify()
  }

  async function loginWithMiniapp(payload: { code: string; phone_code: string }) {
    const result = await apiClient.post<{ csrf_token: string; user: UserInfo }>(MINIAPP_LOGIN_PATH, payload)
    uni.setStorageSync('bingxiCsrf', result.csrf_token)
    state.value = 'unverified'
    return verify()
  }

  function clear() {
    state.value = 'invalid'
    user.value = null
    uni.removeStorageSync('bingxiCsrf')
    uni.removeStorageSync('bingxiSession')
  }

  function can(required: string | string[]) { return hasPermission(required, permissions.value) }
  return { state, user, permissions, verify, loginWithPassword, loginWithMiniapp, clear, can }
})
```

- [ ] **Step 5: Implement auth service, composable, and guard**

```ts
// miniapp/src/features/auth/composables/useSession.ts
import { storeToRefs } from 'pinia'
import { useSessionStore } from '../stores/session'

export function useSession() {
  const store = useSessionStore()
  const { state, user, permissions } = storeToRefs(store)
  return { store, state, user, permissions }
}
```

```ts
// miniapp/src/features/auth/guards.ts
import { useSessionStore } from './stores/session'

export type AuthGuard = (to: { url: string }) => boolean | Promise<boolean>

export const createAuthGuard = (): AuthGuard => async (to) => {
  const session = useSessionStore()
  if (to.url.startsWith('/pages/login')) return true
  if (session.state === 'none' || session.state === 'invalid') {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  if (session.state === 'unverified') {
    const result = await session.verify()
    if (result !== 'valid') {
      uni.reLaunch({ url: '/pages/login/index' })
      return false
    }
  }
  return true
}
```

- [ ] **Step 6: Run local static checks and CI tests**

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src/features/auth miniapp/src/shared/stores/permissions.ts miniapp/tests/unit/session-store.test.ts miniapp/tests/unit/permissions.test.ts
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/unit/session-store.test.ts tests/unit/permissions.test.ts
```

Expected: all pass.

- [ ] **Step 7: Commit when authorized**

```bash
git add miniapp/src/features/auth miniapp/src/shared/stores/permissions.ts miniapp/tests/unit/session-store.test.ts miniapp/tests/unit/permissions.test.ts
git commit -m "feat(miniapp): add session permissions and auth guards"
```

---

### Task 7: Backend WeChat Mini Program Login and Identity Binding

**Files:**
- Modify: `backend/Cargo.toml`
- Modify: `backend/src/config/settings.rs`
- Modify: `backend/src/container/mod.rs`
- Modify: `backend/src/bootstrap/service_bootstrap.rs`
- Create: `backend/src/services/wechat_miniapp_service.rs`
- Modify: `backend/src/handlers/auth_handler.rs`
- Modify: `backend/src/routes/auth.rs`
- Modify: `backend/src/middleware/public_routes.rs`
- Create: `backend/src/models/miniapp_identity.rs`
- Create: `backend/migration/src/domain/miniapp_identity/mod.rs`
- Create: `backend/migration/src/domain/miniapp_identity/m0001_create_miniapp_identity.rs`
- Modify: `backend/migration/src/lib.rs`
- Create: `backend/tests/handlers_miniapp_login_test.rs`

**Interfaces:**
- Produces: `MiniappLoginRequest { code: String, phone_code: String }`.
- Produces: `POST /api/v1/erp/auth/miniapp/login`.
- Produces: `MiniappConfig { appid: Option<String>, secret: Option<String>, api_base_url: String }` loaded from `MINIAPP_APPID`, `MINIAPP_SECRET`, and optional `MINIAPP_API_BASE_URL`.
- Produces: `AppState.miniapp: MiniappConfig` and `AppStateParams.miniapp: MiniappConfig`.
- Produces: `miniapp_identity` table with unique `(appid, openid)` and `user_id` foreign key.
- Produces: `WechatMiniappService` with `code2session` and `getPhoneNumber`.

- [ ] **Step 1: Add failing backend tests**

```rust
// backend/tests/handlers_miniapp_login_test.rs
mod test_common;

use axum::{body::Body, http::{Request, StatusCode}, routing::post, Router};
use bingxi_backend::config::settings::MiniappConfig;
use bingxi_backend::container::AppState;
use bingxi_backend::handlers::auth_handler::miniapp_login;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait};
use serde_json::json;
use std::sync::Arc;
use tower::ServiceExt;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

async fn test_state(db: sea_orm::DatabaseConnection, api_base_url: String) -> AppState {
    AppState {
        db: Arc::new(db),
        miniapp: MiniappConfig {
            appid: Some("test-appid".to_string()),
            secret: Some("test-secret".to_string()),
            api_base_url,
        },
        ..Default::default()
    }
}

#[tokio::test]
async fn miniapp_login_rejects_unknown_phone_without_creating_user() {
    let db = test_common::setup_test_db().await;
    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/sns/jscode2session"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "openid": "openid-unknown", "session_key": "session-key"
        })))
        .mount(&mock)
        .await;
    Mock::given(method("GET"))
        .and(path("/cgi-bin/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "access-token", "expires_in": 7200
        })))
        .mount(&mock)
        .await;
    Mock::given(method("POST"))
        .and(path("/wxa/business/getuserphonenumber"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "phone_info": { "purePhoneNumber": "13900000000" }
        })))
        .mount(&mock)
        .await;

    let state = test_state(db.clone(), mock.uri()).await;
    let app = Router::new()
        .route("/api/v1/erp/auth/miniapp/login", post(miniapp_login))
        .with_state(state);

    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/erp/auth/miniapp/login")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-requested-with", "XMLHttpRequest")
                .body(Body::from(json!({ "code": "wx-code", "phone_code": "phone-code" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    assert_eq!(bingxi_backend::models::user::Entity::find().all(&db).await.unwrap().len(), 0);
    assert_eq!(bingxi_backend::models::miniapp_identity::Entity::find().all(&db).await.unwrap().len(), 0);
}
```

```rust
#[tokio::test]
async fn miniapp_login_binds_existing_phone_and_returns_login_envelope() {
    let db = test_common::setup_test_db().await;
    let user = bingxi_backend::models::user::ActiveModel {
        username: Set("existing-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some("13900000000".to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(chrono::Utc::now()),
        updated_at: Set(chrono::Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();

    let mock = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/sns/jscode2session"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "openid": "openid-existing", "session_key": "session-key"
        })))
        .mount(&mock)
        .await;
    Mock::given(method("GET"))
        .and(path("/cgi-bin/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "access-token", "expires_in": 7200
        })))
        .mount(&mock)
        .await;
    Mock::given(method("POST"))
        .and(path("/wxa/business/getuserphonenumber"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "phone_info": { "purePhoneNumber": "13900000000" }
        })))
        .mount(&mock)
        .await;

    let state = test_state(db.clone(), mock.uri()).await;
    let app = Router::new()
        .route("/api/v1/erp/auth/miniapp/login", post(miniapp_login))
        .with_state(state);
    let response = app
        .oneshot(
            Request::builder()
                .uri("/api/v1/erp/auth/miniapp/login")
                .method("POST")
                .header("content-type", "application/json")
                .header("x-requested-with", "XMLHttpRequest")
                .body(Body::from(json!({ "code": "wx-code", "phone_code": "phone-code" }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["user"]["id"], user.id);
    assert!(body["data"]["csrf_token"].as_str().is_some());
    assert!(body["data"]["permissions"].is_array());
    assert!(body["data"]["password_expired"].is_boolean());

    let bindings = bingxi_backend::models::miniapp_identity::Entity::find().all(&db).await.unwrap();
    assert_eq!(bindings.len(), 1);
    assert_eq!(bindings[0].user_id, user.id);
    assert_eq!(bindings[0].openid, "openid-existing");
}
```

- [ ] **Step 2: Verify backend tests fail in CI**

Run only in `ci-test-rust` or a dedicated backend integration job:

```bash
cargo test --test handlers_miniapp_login_test -- --test-threads=1
```

Expected: FAIL because route and handler do not exist.

- [ ] **Step 3: Add configuration, state wiring, test dependency, and migration**

Add `wiremock = "0.6"` to `[dev-dependencies]` in `backend/Cargo.toml`. Add `pub miniapp: MiniappConfig` to `AppState` and `AppStateParams`, set it in `construct_app_state`, and populate it from `settings.miniapp.clone()` in `bootstrap/service_bootstrap.rs::build_app_state`.

```rust
// backend/src/config/settings.rs
fn default_miniapp_api_base_url() -> String {
    "https://api.weixin.qq.com".to_string()
}

#[derive(Clone, Deserialize)]
#[serde(default)]
pub struct MiniappConfig {
    pub appid: Option<String>,
    pub secret: Option<String>,
    #[serde(default = "default_miniapp_api_base_url")]
    pub api_base_url: String,
}

impl Default for MiniappConfig {
    fn default() -> Self {
        Self {
            appid: None,
            secret: None,
            api_base_url: default_miniapp_api_base_url(),
        }
    }
}

impl std::fmt::Debug for MiniappConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MiniappConfig")
            .field("appid_configured", &self.appid.is_some())
            .field("secret_configured", &self.secret.is_some())
            .field("api_base_url_configured", &!self.api_base_url.is_empty())
            .finish()
    }
}
```

Register `pub miniapp: MiniappConfig` in `AppSettings` and load `MINIAPP_APPID`, `MINIAPP_SECRET`, and optional `MINIAPP_API_BASE_URL` with the same explicit environment pattern used by `load_wechat_mp_from_env`.

```rust
// backend/migration/src/domain/miniapp_identity/m0001_create_miniapp_identity.rs
pub fn up(&mut self, manager: &SchemaManager) -> Result<(), DbErr> {
    manager
        .create_table(
            Table::create()
                .table(MiniappIdentity::Table)
                .col(ColumnDef::new(MiniappIdentity::Id).big_integer().auto_increment().primary_key())
                .col(ColumnDef::new(MiniappIdentity::Appid).string().not_null())
                .col(ColumnDef::new(MiniappIdentity::Openid).string().not_null())
                .col(ColumnDef::new(MiniappIdentity::UserId).integer().not_null())
                .col(ColumnDef::new(MiniappIdentity::CreatedAt).date_time().default(SimpleExpr::current_timestamp()).not_null())
                .col(ColumnDef::new(MiniappIdentity::UpdatedAt).date_time().default(SimpleExpr::current_timestamp()).not_null())
                .foreign_key(ForeignKey::create().name("fk_miniapp_identity_user").from(MiniappIdentity::UserId).to(Users::Table, Users::Id).on_delete(ForeignKeyAction::Cascade))
                .index(Index::create().name("uq_miniapp_identity_appid_openid").unique().col(MiniappIdentity::Appid).col(MiniappIdentity::Openid))
                .to_owned(),
        )
}
```

Use the repository migration macro conventions and add the domain to `backend/migration/src/lib.rs`.

- [ ] **Step 4: Implement WeChat API service**

```rust
// backend/src/services/wechat_miniapp_service.rs
#[derive(Clone)]
pub struct WechatMiniappService {
    appid: String,
    secret: String,
    api_base_url: String,
    client: reqwest::Client,
}

impl WechatMiniappService {
    pub fn new(config: &crate::config::settings::MiniappConfig) -> Result<Self, crate::utils::error::AppError> {
        Ok(Self {
            appid: config.appid.clone().ok_or_else(|| crate::utils::error::AppError::internal("MINIAPP_APPID 未配置"))?,
            secret: config.secret.clone().ok_or_else(|| crate::utils::error::AppError::internal("MINIAPP_SECRET 未配置"))?,
            api_base_url: config.api_base_url.trim_end_matches('/').to_string(),
            client: reqwest::Client::new(),
        })
    }

    pub async fn code2session(&self, code: &str) -> Result<serde_json::Value, crate::utils::error::AppError> {
        let response = self.client
            .get(format!("{}/sns/jscode2session", self.api_base_url))
            .query(&[("appid", &self.appid), ("secret", &self.secret), ("js_code", &code.to_string()), ("grant_type", &"authorization_code".to_string())])
            .send()
            .await
            .map_err(|error| crate::utils::error::AppError::internal(format!("微信 code2session 请求失败：{error}")))?
            .error_for_status()
            .map_err(|error| crate::utils::error::AppError::internal(format!("微信 code2session HTTP 失败：{error}")))?
            .json::<serde_json::Value>()
            .await
            .map_err(|error| crate::utils::error::AppError::internal(format!("微信 code2session 响应解析失败：{error}")))?;
        if response.get("errcode").is_some() { return Err(crate::utils::error::AppError::internal("微信 code2session 返回错误")); }
        Ok(response)
    }

    pub async fn get_phone_number(&self, code: &str) -> Result<String, crate::utils::error::AppError> {
        let token_response = self.client
            .get(format!("{}/cgi-bin/token", self.api_base_url))
            .query(&[("grant_type", &"client_credential".to_string()), ("appid", &self.appid), ("secret", &self.secret)])
            .send().await.map_err(|error| crate::utils::error::AppError::internal(format!("微信 token 请求失败：{error}")))?
            .error_for_status().map_err(|error| crate::utils::error::AppError::internal(format!("微信 token HTTP 失败：{error}")))?
            .json::<serde_json::Value>().await.map_err(|error| crate::utils::error::AppError::internal(format!("微信 token 响应解析失败：{error}")))?;
        let access_token = token_response.get("access_token").and_then(serde_json::Value::as_str).ok_or_else(|| crate::utils::error::AppError::internal("微信 token 响应缺少 access_token"))?;
        let phone_response = self.client
            .post(format!("{}/wxa/business/getuserphonenumber", self.api_base_url))
            .query(&[("access_token", access_token)])
            .json(&serde_json::json!({ "code": code }))
            .send().await.map_err(|error| crate::utils::error::AppError::internal(format!("微信手机号请求失败：{error}")))?
            .error_for_status().map_err(|error| crate::utils::error::AppError::internal(format!("微信手机号 HTTP 失败：{error}")))?
            .json::<serde_json::Value>().await.map_err(|error| crate::utils::error::AppError::internal(format!("微信手机号响应解析失败：{error}")))?;
        phone_response.pointer("/phone_info/purePhoneNumber").and_then(serde_json::Value::as_str).map(str::to_owned).ok_or_else(|| crate::utils::error::AppError::internal("微信手机号响应缺少 purePhoneNumber"))
    }
}
```

The production implementation must cache `access_token` using the existing cache layer; the plan requires a unit test proving repeated calls do not request a new token before expiry.

- [ ] **Step 5: Extract shared login completion and add miniapp handler**

Refactor `handle_login_success` into:

```rust
pub(crate) async fn complete_login(
    state: &AppState,
    audit_ctx: &Option<Extension<AuditContext>>,
    jar: axum_extra::extract::PrivateCookieJar,
    headers: &HeaderMap,
    token: String,
    user: crate::models::user::Model,
    client_ip: &str,
    user_agent: &str,
) -> Result<axum::response::Response, AppError>
```

`handle_login_success` keeps its current signature and delegates to `complete_login` after password verification. Add:

```rust
#[derive(Debug, Deserialize, ToSchema)]
pub struct MiniappLoginRequest {
    pub code: String,
    pub phone_code: String,
}

pub async fn miniapp_login(
    State(state): State<AppState>,
    audit_ctx: Option<Extension<AuditContext>>,
    jar: axum_extra::extract::PrivateCookieJar,
    headers: HeaderMap,
    Json(payload): Json<MiniappLoginRequest>,
) -> Result<axum::response::Response, AppError> {
    let service = WechatMiniappService::new(&state.miniapp)?;
    let session = service.code2session(&payload.code).await?;
    let openid = session.get("openid").and_then(serde_json::Value::as_str).ok_or_else(|| AppError::unauthorized("微信会话缺少 openid"))?;
    let phone = service.get_phone_number(&payload.phone_code).await?;
    let appid = state.miniapp.appid.clone().ok_or_else(|| AppError::internal("MINIAPP_APPID 未配置"))?;
    let user = resolve_miniapp_user(&state, &appid, openid, &phone).await?;
    let auth_service = AuthService::new(state.db.clone(), state.jwt_secret.clone());
    let token = auth_service.generate_token(user.id, &user.username, user.role_id).map_err(|error| AppError::internal(format!("生成令牌失败：{error}")))?;
    let client_ip = extract_client_ip_from_headers(&headers, None);
    let user_agent = headers.get("user-agent").and_then(|value| value.to_str().ok()).unwrap_or("miniapp");
    complete_login(&state, &audit_ctx, jar, &headers, token, user, &client_ip, user_agent).await
}
```

Annotate `miniapp_login` with `#[utoipa::path(post, path = "/api/v1/erp/auth/miniapp/login", request_body = MiniappLoginRequest, responses((status = 200, body = ApiResponse<LoginResponse>), (status = 404, description = "手机号未绑定 ERP 用户")), tag = "auth")]` and register the schema in the OpenAPI documentation module.

`resolve_miniapp_user` must:

1. Query `miniapp_identity` by `(appid, openid)`; if found, load the bound user.
2. Normalize the WeChat phone to the same Mainland mobile format stored in `users.phone`.
3. Query `users` by normalized phone; if zero rows, return `AppError::not_found_displayable("手机号未绑定 ERP 用户")` and create no user.
4. If more than one user matches, return `AppError::internal` and create no binding; duplicate phone data must be fixed explicitly.
5. Insert the identity binding for the matched user.
6. Return the existing user model.

- [ ] **Step 6: Register route and public path**

```rust
// backend/src/routes/auth.rs
.route("/miniapp/login", post(auth_handler::miniapp_login))
```

```rust
// backend/src/middleware/public_routes.rs
"/api/v1/erp/auth/miniapp/login",
```

Do not add the path to `AUTH_ONLY_PATHS`; do not change `routes/mod.rs` nesting.

- [ ] **Step 7: Run formatting and CI tests**

Local static only:

```bash
cargo fmt --all -- --check
```

CI:

```bash
cargo test --test handlers_miniapp_login_test -- --test-threads=1
cargo test --test test_csrf_middleware -- --test-threads=1
```

Expected: migration, handler, public-path, CSRF and existing password-login tests pass.

- [ ] **Step 8: Commit when authorized**

```bash
git add backend/Cargo.toml backend/src/config/settings.rs backend/src/services/wechat_miniapp_service.rs backend/src/handlers/auth_handler.rs backend/src/routes/auth.rs backend/src/middleware/public_routes.rs backend/src/models/miniapp_identity.rs backend/migration/src/domain/miniapp_identity backend/migration/src/lib.rs backend/tests/handlers_miniapp_login_test.rs
git commit -m "feat(auth): add WeChat mini program login and identity binding"
```

---

### Task 8: Application Shell, Login Page, and Workspace Smoke Page

**Files:**
- Create: `miniapp/src/pages/login/index.vue`
- Create: `miniapp/src/features/workspace/pages/index/index.vue`
- Create: `miniapp/src/shared/ui/AppTabBar.vue`
- Create: `miniapp/src/shared/ui/PermissionButton.vue`
- Create: `miniapp/src/shared/ui/UserPicker.vue`
- Modify: `miniapp/src/pages.json`
- Modify: `miniapp/src/app.ts`
- Create: `miniapp/tests/unit/login-page.test.ts`
- Create: `miniapp/tests/unit/workspace-page.test.ts`

**Interfaces:**
- Consumes: `useSessionStore`, `createAuthGuard`, `ListPageTemplate`, `StateView`, `WButton`.
- Produces: `/pages/login/index` and `/pages/workspace/index` routes.
- Produces: `PermissionButton` props `{ permission: string | string[] }`.

- [ ] **Step 1: Write failing page tests**

```ts
// miniapp/tests/unit/login-page.test.ts
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '../../src/pages/login/index.vue'

const { login } = vi.hoisted(() => ({ login: vi.fn() }))
vi.stubGlobal('uni', { reLaunch: vi.fn() })
vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => ({ loginWithPassword: login }),
}))

describe('LoginPage', () => {
  beforeEach(() => { login.mockReset().mockResolvedValue('valid') })

  it('submits username and password through the session store', async () => {
    const wrapper = mount(LoginPage)
    await wrapper.find('input[name="username"]').setValue('alice')
    await wrapper.find('input[name="password"]').setValue('secret')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(login).toHaveBeenCalledWith({ username: 'alice', password: 'secret' })
  })
})
```

```ts
// miniapp/tests/unit/workspace-page.test.ts
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import WorkspacePage from '../../src/features/workspace/pages/index/index.vue'

const { session } = vi.hoisted(() => ({
  session: {
    user: { id: 1, username: 'alice', permissions: ['orders:read'] },
    can: (permission: string) => permission === 'orders:read',
    verify: vi.fn().mockResolvedValue('valid'),
  },
}))
vi.mock('../../src/features/auth/stores/session', () => ({
  useSessionStore: () => session,
}))

describe('WorkspacePage', () => {
  it('shows the authenticated user and permission-controlled entry', async () => {
    const wrapper = mount(WorkspacePage)
    await flushPromises()
    expect(wrapper.text()).toContain('alice')
    expect(wrapper.find('[data-permission="orders:read"]').exists()).toBe(true)
    expect(wrapper.find('[data-permission="orders:create"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/unit/login-page.test.ts tests/unit/workspace-page.test.ts
```

Expected: FAIL because pages do not exist.

- [ ] **Step 3: Implement PermissionButton and AppTabBar**

```vue
<!-- miniapp/src/shared/ui/PermissionButton.vue -->
<template>
  <WButton v-if="allowed" v-bind="$attrs" @click="$emit('click', $event)"><slot /></WButton>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../../features/auth/stores/session'
import WButton from './wot/WButton.vue'

const props = withDefaults(defineProps<{ permission: string | string[] }>(), {})
defineEmits<{ click: [event: MouseEvent] }>()
const session = useSessionStore()
const allowed = computed(() => session.can(props.permission))
</script>
```

```vue
<!-- miniapp/src/shared/ui/AppTabBar.vue -->
<template>
  <view class="app-tab-bar">
    <view v-for="item in items" :key="item.path" class="app-tab-bar__item" @click="navigate(item.path)">
      <text>{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
const items = [
  { path: '/pages/workspace/index', label: '工作台' },
]
function navigate(path: string) { uni.switchTab({ url: path }) }
</script>
```

- [ ] **Step 4: Implement login page**

```vue
<!-- miniapp/src/pages/login/index.vue -->
<template>
  <view class="login-page">
    <view class="login-page__title">秉羲工作台</view>
    <form @submit="onSubmit">
      <input v-model="username" name="username" placeholder="用户名" />
      <input v-model="password" name="password" password placeholder="密码" />
      <WButton native-type="submit" :loading="loading">登录</WButton>
    </form>
    <button open-type="getPhoneNumber" data-action="wechat-login" :loading="wechatLoading" @getphonenumber="onWeChatLogin">
      微信登录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../../features/auth/stores/session'
import WButton from '../../shared/ui/wot/WButton.vue'

const session = useSessionStore()
const username = ref('')
const password = ref('')
const loading = ref(false)
const wechatLoading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const result = await session.loginWithPassword({ username: username.value, password: password.value })
    if (result === 'valid') uni.reLaunch({ url: '/pages/workspace/index' })
  } finally {
    loading.value = false
  }
}

async function onWeChatLogin(event: { detail: { code?: string } }) {
  const phoneCode = event.detail.code
  if (!phoneCode) return
  wechatLoading.value = true
  try {
    const loginResult = await uni.login()
    if (!loginResult.code) return
    const result = await session.loginWithMiniapp({ code: loginResult.code, phone_code: phoneCode })
    if (result === 'valid') uni.reLaunch({ url: '/pages/workspace/index' })
  } finally {
    wechatLoading.value = false
  }
}
</script>
```

- [ ] **Step 5: Implement workspace smoke page**

```vue
<!-- miniapp/src/features/workspace/pages/index/index.vue -->
<template>
  <ListPageTemplate>
    <template #filter>
      <view class="workspace__header">工作台</view>
    </template>
    <StateView :status="status" :message="message" :retry="load">
      <view class="workspace__user">{{ session.user?.username }}</view>
      <PermissionButton permission="orders:read" data-permission="orders:read">订单管理</PermissionButton>
      <PermissionButton permission="orders:create" data-permission="orders:create">新建订单</PermissionButton>
    </StateView>
    <template #footer><AppTabBar /></template>
  </ListPageTemplate>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSessionStore } from '../../auth/stores/session'
import ListPageTemplate from '../../../shared/ui/templates/ListPageTemplate.vue'
import StateView from '../../../shared/ui/StateView.vue'
import PermissionButton from '../../../shared/ui/PermissionButton.vue'
import AppTabBar from '../../../shared/ui/AppTabBar.vue'

const session = useSessionStore()
const status = ref<'loading' | 'empty' | 'error' | 'success'>('loading')
const message = ref('')
async function load() {
  status.value = 'loading'
  const result = await session.verify()
  status.value = result === 'valid' ? 'success' : result === 'none' || result === 'invalid' ? 'empty' : 'error'
  message.value = result === 'error' ? '会话校验失败，请重试' : ''
}
onMounted(load)
</script>
```

- [ ] **Step 6: Register pages and guard**

```json
{
  "pages": [
    { "path": "pages/login/index", "style": { "navigationBarTitleText": "登录" } },
    { "path": "features/workspace/pages/index/index", "style": { "navigationBarTitleText": "工作台" } }
  ],
  "tabBar": {
    "custom": true,
    "list": [
      { "pagePath": "features/workspace/pages/index/index", "text": "工作台" }
    ]
  }
}
```

The order and profile tab targets are added in later domain tasks; Phase 1 must register placeholder-free routes only for pages that exist. Until then, the tab bar lists only the workspace page.

- [ ] **Step 7: Run local static checks and CI tests**

```bash
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src/pages/login miniapp/src/features/workspace miniapp/src/shared/ui miniapp/tests/unit/login-page.test.ts miniapp/tests/unit/workspace-page.test.ts
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/unit/login-page.test.ts tests/unit/workspace-page.test.ts
npm --prefix miniapp run build:mp-weixin
```

Expected: all pass.

- [ ] **Step 8: Commit when authorized**

```bash
git add miniapp/src/pages/login miniapp/src/features/workspace miniapp/src/shared/ui/PermissionButton.vue miniapp/src/shared/ui/AppTabBar.vue miniapp/src/pages.json miniapp/src/app.ts miniapp/tests/unit/login-page.test.ts miniapp/tests/unit/workspace-page.test.ts
git commit -m "feat(miniapp): add app shell login and workspace smoke pages"
```

---

### Task 9: Full Backend Gap Inventory and Ledger

**Files:**
- Create: `scripts/ci/miniapp-gap-inventory.mjs`
- Create: `miniapp/tests/contract/gap-inventory.test.ts`
- Create: `docs/plans/miniapp-backend-gap-ledger.md`

**Interfaces:**
- Consumes: `frontend/scripts/route-snapshot.txt`.
- Produces: ledger rows `{ page, action, method, path, requestFields, responseFields, permission, backendStatus, taskRef }`.
- Produces: CLI `node scripts/ci/miniapp-gap-inventory.mjs --legacy-root miniprogram --output docs/plans/miniapp-backend-gap-ledger.md`.

- [ ] **Step 1: Write failing inventory tests**

```ts
// miniapp/tests/contract/gap-inventory.test.ts
import { describe, expect, it } from 'vitest'
import { classifyBackendStatus, parseLegacyCall } from '../../../scripts/ci/miniapp-gap-inventory.mjs'

describe('gap inventory', () => {
  it('classifies existing and missing endpoints', () => {
    const snapshot = new Set(['GET /api/v1/erp/products'])
    expect(classifyBackendStatus('GET', '/api/v1/erp/products', snapshot)).toBe('existing')
    expect(classifyBackendStatus('POST', '/api/v1/erp/products/missing', snapshot)).toBe('missing')
  })

  it('parses legacy call sites without executing them', () => {
    expect(parseLegacyCall("request.GET(app.config.bingxiHost + '/app-api/goods/list')")).toEqual({
      method: 'GET',
      path: '/app-api/goods/list',
    })
  })
})
```

- [ ] **Step 2: Verify tests fail in CI**

```bash
npm --prefix miniapp run test:run -- tests/contract/gap-inventory.test.ts
```

Expected: FAIL because the inventory module does not exist.

- [ ] **Step 3: Implement inventory generator**

The script must:

1. Read `miniprogram/app.json` and enumerate all 195 declared pages.
2. Build a static `require()` graph from each page to its service modules.
3. Scan each reachable file for `request.<METHOD>` and direct `wx.request` calls.
4. Normalize paths with the same rules as `miniapp-contract-check.mjs`.
5. Classify each call as `existing`, `missing`, `legacy`, or `manual-review`.
6. Emit a Markdown ledger with one row per page/action and no empty cells.
7. Exit non-zero if any declared page is missing from the ledger.

```js
// scripts/ci/miniapp-gap-inventory.mjs
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const BASE = '/api/v1/erp'

export function normalizeApiPath(value) {
  let path = String(value).split(/[?#]/)[0].replace(/\$\{[^}]+\}/g, '*').replace(/\{[^}]+\}/g, '*').replace(/\/{2,}/g, '/')
  if (!path.startsWith('/')) path = '/' + path
  return path.replace(/\/+$/, '') || '/'
}

export function classifyBackendStatus(method, path, snapshot) {
  if (path.startsWith('/app-api/') || path.startsWith('/oauth-api/')) return 'legacy'
  if (method === 'UNKNOWN') return 'manual-review'
  return snapshot.has(`${method} ${normalizeApiPath(path)}`) ? 'existing' : 'missing'
}

export function parseLegacyCall(source) {
  const match = source.match(/request\.(GET|POST|PUT|DELETE|_POST)\s*\(\s*[^'"`]+['"`]([^'"`]+)['"`]/)
  if (!match) return null
  return { method: match[1] === '_POST' ? 'POST' : match[1], path: normalizeApiPath(match[2]) }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

function resolveRequire(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [base, `${base}.js`, join(base, 'index.js')]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

function reachableFiles(pageFile) {
  const seen = new Set()
  const queue = [pageFile]
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const next = resolveRequire(file, match[1])
      if (next) queue.push(next)
    }
  }
  return [...seen]
}

function collectCalls(files) {
  const calls = []
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      const parsed = parseLegacyCall(line)
      if (parsed) calls.push({ ...parsed, file, line: index + 1 })
      if (line.includes('wx.request')) calls.push({ method: 'UNKNOWN', path: '/manual-review', file, line: index + 1 })
    })
  }
  return calls
}

function loadSnapshot(path) {
  return new Set(readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.trim() && !line.startsWith('#')).map((line) => {
    const [method, apiPath] = line.split('\t')
    return `${method.trim().toUpperCase()} ${normalizeApiPath(apiPath)}`
  }))
}

function renderLedger(rows) {
  return [
    '# 小程序后端能力缺口台账',
    '',
    '| 页面 | 动作 | 方法 | 路径 | 来源 | 后端状态 |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.page} | ${row.action} | ${row.method} | ${row.path} | ${row.file}:${row.line} | ${row.status} |`),
    '',
  ].join('\n')
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), 'miniapp-gap-'))
  try {
    const file = join(dir, 'fixture.js')
    writeFileSync(file, "request.GET(app.config.bingxiHost + '/app-api/goods/list')\n")
    const parsed = parseLegacyCall(readFileSync(file, 'utf8'))
    if (!parsed || parsed.method !== 'GET' || parsed.path !== '/app-api/goods/list') throw new Error('DETECTOR_BLIND parseLegacyCall')
    if (classifyBackendStatus('GET', '/app-api/goods/list', new Set()) !== 'legacy') throw new Error('DETECTOR_BLIND legacy')
    console.log('MINIAPP_GAP_SELFTEST_OK')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const args = process.argv.slice(2)
if (args.includes('--self-test')) { selfTest(); process.exit(0) }
const legacyRoot = resolve(args[args.indexOf('--legacy-root') + 1] || 'miniprogram')
const output = resolve(args[args.indexOf('--output') + 1] || 'docs/plans/miniapp-backend-gap-ledger.md')
const snapshot = loadSnapshot(resolve('frontend/scripts/route-snapshot.txt'))
const appJson = JSON.parse(readFileSync(join(legacyRoot, 'app.json'), 'utf8'))
const pages = [
  ...appJson.pages,
  ...(appJson.subPackages || []).flatMap((sub) => sub.pages.map((page) => `${sub.root.replace(/\/$/, '')}/${page}`)),
]
const rows = []
for (const page of pages) {
  const pageFile = ['.js', '.wxml'].map((ext) => join(legacyRoot, page + ext)).find(existsSync)
  if (!pageFile) { rows.push({ page, action: 'page-entry', method: '-', path: '-', file: page, line: 0, status: 'manual-review' }); continue }
  const calls = collectCalls(reachableFiles(pageFile))
  if (calls.length === 0) rows.push({ page, action: 'no-static-call', method: '-', path: '-', file: pageFile, line: 0, status: 'manual-review' })
  for (const call of calls) rows.push({ page, action: 'api-call', method: call.method, path: call.path, file: call.file, line: call.line, status: classifyBackendStatus(call.method, call.path, snapshot) })
}
if (rows.length < pages.length) throw new Error('TOOL_BUG: ledger rows fewer than declared pages')
writeFileSync(output, renderLedger(rows))
console.log(`MINIAPP_GAP pages=${pages.length} rows=${rows.length} output=${output}`)
```

- [ ] **Step 4: Generate and review the ledger**

```bash
node scripts/ci/miniapp-gap-inventory.mjs --legacy-root miniprogram --output docs/plans/miniapp-backend-gap-ledger.md
```

Expected: 195 pages represented; every `/app-api` call classified as `legacy`; every `/api/v1/erp` call classified against the snapshot.

- [ ] **Step 5: Run local static checks and CI tests**

```bash
node --check scripts/ci/miniapp-gap-inventory.mjs
node scripts/ci/miniapp-gap-inventory.mjs --self-test
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
```

CI:

```bash
npm --prefix miniapp run test:run -- tests/contract/gap-inventory.test.ts
node scripts/ci/miniapp-gap-inventory.mjs --legacy-root miniprogram --output docs/plans/miniapp-backend-gap-ledger.md
```

Expected: all pass and the ledger is deterministic across two consecutive runs.

- [ ] **Step 6: Commit when authorized**

```bash
git add scripts/ci/miniapp-gap-inventory.mjs miniapp/tests/contract/gap-inventory.test.ts docs/plans/miniapp-backend-gap-ledger.md
git commit -m "docs(miniapp): add full backend capability gap ledger"
```

---

### Task 10: Static CI Workflow and Build Gate

**Files:**
- Create: `.github/workflows/miniapp-checks.yml`
- Create: `scripts/ci/miniapp-checks.sh`
- Create: `scripts/ci/miniapp-check-pages.mjs`
- Create: `scripts/ci/miniapp-check-size.mjs`
- Modify: `miniapp/package.json`

**Interfaces:**
- Produces: workflow `miniapp-checks.yml` triggered by `miniapp/**`, `scripts/ci/miniapp-*`, `backend/**`, migration changes, and the workflow file.
- Produces: `bash scripts/ci/miniapp-checks.sh --self-test`.
- Produces: `bash scripts/ci/miniapp-checks.sh`.

- [ ] **Step 1: Write failing shell self-test fixtures**

Create fixtures under `scripts/ci/fixtures/miniapp/`:

```text
valid/
  src/pages.json
  src/pages/index/index.vue
invalid-legacy/
  src/pages.json
  src/pages/index/index.vue   # contains /app-api/
invalid-page/
  src/pages.json              # declares missing page
  src/pages/index/index.vue
```

- [ ] **Step 2: Implement page and size checkers**

```js
// scripts/ci/miniapp-check-pages.mjs
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.argv[2] || 'miniapp/src')
const config = JSON.parse(readFileSync(join(root, 'pages.json'), 'utf8'))
const declared = config.pages.map((page) => page.path)
const missing = declared.filter((path) => !['.vue', '.ts', '.js'].some((ext) => existsSync(join(root, path + ext))))
if (missing.length) {
  for (const path of missing) console.error(`MISSING_PAGE ${path}`)
  process.exit(1)
}
console.log(`MINIAPP_PAGES declared=${declared.length} missing=0`)
```

```js
// scripts/ci/miniapp-check-size.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] || 'miniapp/dist/build/mp-weixin'
const limitKb = Number(process.argv[3] || 2048)
let bytes = 0
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else bytes += statSync(full).size
  }
}
walk(root)
const kb = Math.ceil(bytes / 1024)
console.log(`MINIAPP_SIZE totalKb=${kb} limitKb=${limitKb}`)
process.exit(kb > limitKb ? 1 : 0)
```

- [ ] **Step 3: Implement the static gate runner**

```bash
# scripts/ci/miniapp-checks.sh
#!/usr/bin/env bash
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ "${1:-}" == "--self-test" ]]; then
  node scripts/ci/miniapp-contract-check.mjs --self-test
  node scripts/ci/miniapp-gap-inventory.mjs --self-test
  if node scripts/ci/miniapp-check-pages.mjs scripts/ci/fixtures/miniapp/invalid-page; then
    echo "DETECTOR_BLIND invalid-page fixture passed"
    exit 9
  fi
  node scripts/ci/miniapp-check-pages.mjs scripts/ci/fixtures/miniapp/valid
  echo "MINIAPP_STATIC_SELFTEST_OK"
  exit 0
fi

npm --prefix miniapp ci
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src miniapp/tests miniapp/*.ts miniapp/*.json
npm --prefix miniapp run test:run
node scripts/ci/miniapp-contract-check.mjs --root miniapp/src --snapshot frontend/scripts/route-snapshot.txt
node scripts/ci/miniapp-check-pages.mjs miniapp/src
npm --prefix miniapp run build:mp-weixin
node scripts/ci/miniapp-check-size.mjs miniapp/dist/build/mp-weixin 2048
echo "MINIAPP_STATIC_GREEN"
```

- [ ] **Step 4: Create the workflow**

```yaml
# .github/workflows/miniapp-checks.yml
name: 新小程序静态门
on:
  pull_request:
    paths:
      - "miniapp/**"
      - "scripts/ci/miniapp-*"
      - "backend/**"
      - "frontend/scripts/route-snapshot.txt"
      - ".github/workflows/miniapp-checks.yml"
  push:
    branches: [main]
    paths:
      - "miniapp/**"
      - "scripts/ci/miniapp-*"
      - "backend/**"
      - "frontend/scripts/route-snapshot.txt"
      - ".github/workflows/miniapp-checks.yml"
  workflow_dispatch:

jobs:
  static:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: miniapp/package-lock.json
      - name: 判定器反向自证
        run: bash scripts/ci/miniapp-checks.sh --self-test
      - name: 静态门与微信构建
        run: bash scripts/ci/miniapp-checks.sh
```

- [ ] **Step 5: Run local static checks**

```bash
bash -n scripts/ci/miniapp-checks.sh
node --check scripts/ci/miniapp-check-pages.mjs
node --check scripts/ci/miniapp-check-size.mjs
bash scripts/ci/miniapp-checks.sh --self-test
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/src miniapp/tests .github/workflows/miniapp-checks.yml
```

- [ ] **Step 6: Verify the workflow in CI**

Expected: self-test, typecheck, lint, unit tests, contract gate, page check, WeChat build and size check all pass.

- [ ] **Step 7: Commit when authorized**

```bash
git add .github/workflows/miniapp-checks.yml scripts/ci/miniapp-checks.sh scripts/ci/miniapp-check-pages.mjs scripts/ci/miniapp-check-size.mjs scripts/ci/fixtures/miniapp miniapp/package.json
git commit -m "ci(miniapp): add static build and contract workflow"
```

---

### Task 11: Runtime E2E with WeChat DevTools on GitHub Windows

**Files:**
- Create: `scripts/ci/install-wechat-devtools.ps1`
- Create: `scripts/ci/start-miniapp-e2e-backend.sh`
- Create: `miniapp/tests/e2e/automator.ts`
- Create: `miniapp/tests/e2e/smoke.spec.ts`
- Create: `miniapp/tests/e2e/wechat-login.spec.ts`
- Create: `miniapp/tests/e2e/run.mjs`
- Create: `miniapp/vitest.e2e.config.ts`
- Create: `.github/workflows/miniapp-e2e.yml`
- Modify: `miniapp/package.json`

**Interfaces:**
- Consumes: built `miniapp/dist/build/mp-weixin`, running backend URL, test AppID.
- Produces: `npm --prefix miniapp run test:e2e`.
- Produces: JUnit or JSON results under `miniapp/test-results/`.

- [ ] **Step 1: Add the automator dependency and E2E scripts**

```bash
npm --prefix miniapp install -D miniprogram-automator
```

```json
{
  "scripts": {
    "test:e2e": "node tests/e2e/run.mjs"
  }
}
```

- [ ] **Step 2: Write the failing smoke test**

```ts
// miniapp/tests/e2e/smoke.spec.ts
import { automator } from 'miniprogram-automator'

describe('miniapp smoke', () => {
  it('opens login page and reaches workspace after real login', async () => {
    const miniProgram = await automator.connect({ wsEndpoint: process.env.MINIAPP_AUTOMATOR_WS! })
    try {
      const page = await miniProgram.reLaunch('/pages/login/index')
      await page.waitFor('input[name="username"]')
      await page.setData({ 'loginForm.username': process.env.E2E_USERNAME })
      await page.setData({ 'loginForm.password': process.env.E2E_PASSWORD })
      await page.callMethod('onSubmit')
      await page.waitFor('/pages/workspace/index')
      const username = await page.data('session.user.username')
      expect(username).toBe(process.env.E2E_USERNAME)
    } finally {
      await miniProgram.disconnect()
    }
  })
})
```

```ts
// miniapp/tests/e2e/wechat-login.spec.ts
import { automator } from 'miniprogram-automator'

describe('miniapp WeChat login', () => {
  it('logs in with a real test AppID and reaches workspace', async () => {
    const miniProgram = await automator.connect({ wsEndpoint: process.env.MINIAPP_AUTOMATOR_WS! })
    try {
      const page = await miniProgram.reLaunch('/pages/login/index')
      await page.waitFor('[data-action="wechat-login"]')
      await page.tap('[data-action="wechat-login"]')
      await page.waitFor('/pages/workspace/index')
      const userId = await page.data('session.user.id')
      expect(Number(userId)).toBeGreaterThan(0)
    } finally {
      await miniProgram.disconnect()
    }
  })
})
```

```ts
// miniapp/vitest.e2e.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/e2e/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['default', 'json'],
    outputFile: { json: 'test-results/e2e.json' },
  },
})
```

- [ ] **Step 3: Implement the runner**

```js
// miniapp/tests/e2e/run.mjs
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const root = new URL('../..', import.meta.url).pathname
const result = spawn('npx', ['vitest', 'run', '--config', 'vitest.e2e.config.ts'], { cwd: root, stdio: 'inherit', env: process.env })
result.on('exit', (code) => {
  mkdirSync(`${root}/test-results`, { recursive: true })
  writeFileSync(`${root}/test-results/exit-code.txt`, String(code ?? 1))
  process.exit(code ?? 1)
})
```

- [ ] **Step 4: Implement DevTools installation**

```powershell
# scripts/ci/install-wechat-devtools.ps1
$ErrorActionPreference = 'Stop'
$installer = Join-Path $env:RUNNER_TEMP 'wechat_devtools_installer.exe'
Invoke-WebRequest -Uri $env:WECHAT_DEVTOOLS_INSTALLER_URL -OutFile $installer
Start-Process -FilePath $installer -ArgumentList '/S' -Wait
if (-not (Test-Path $env:WECHAT_DEVTOOLS_CLI)) {
  throw "微信开发者工具 CLI 不存在：$env:WECHAT_DEVTOOLS_CLI"
}
& $env:WECHAT_DEVTOOLS_CLI --version
```

The workflow must fail if `WECHAT_DEVTOOLS_INSTALLER_URL`, `WECHAT_DEVTOOLS_CLI`, test AppID, backend URL, or test credentials are missing.

- [ ] **Step 5: Create the runtime E2E workflow**

```yaml
# .github/workflows/miniapp-e2e.yml
name: 新小程序运行时 E2E
on:
  pull_request:
    paths:
      - "miniapp/**"
      - "backend/**"
      - "scripts/ci/install-wechat-devtools.ps1"
      - "scripts/ci/start-miniapp-e2e-backend.sh"
      - ".github/workflows/miniapp-e2e.yml"
  workflow_dispatch:

jobs:
  e2e:
    runs-on: windows-latest
    timeout-minutes: 60
    env:
      VITE_API_BASE_URL: http://127.0.0.1:8082
      VITE_APP_ID: ${{ secrets.MINIAPP_TEST_APPID }}
      VITE_ENV_NAME: test
      VITE_TERMINAL_SOURCE: 81
      MINIAPP_APPID: ${{ secrets.MINIAPP_TEST_APPID }}
      MINIAPP_SECRET: ${{ secrets.MINIAPP_TEST_SECRET }}
      MINIAPP_API_BASE_URL: https://api.weixin.qq.com
      WECHAT_DEVTOOLS_INSTALLER_URL: ${{ secrets.WECHAT_DEVTOOLS_INSTALLER_URL }}
      WECHAT_DEVTOOLS_CLI: ${{ secrets.WECHAT_DEVTOOLS_CLI }}
      DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/bingxi_miniapp_test
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: miniapp/package-lock.json
      - uses: dtolnay/rust-toolchain@stable
      - name: 启动真实 PostgreSQL
        shell: pwsh
        run: |
          docker version
          docker run -d --name miniapp-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bingxi_miniapp_test -p 5432:5432 postgres:16
          $ready = $false
          for ($i = 0; $i -lt 30; $i++) {
            docker exec miniapp-postgres pg_isready -U postgres | Out-Host
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
            Start-Sleep -Seconds 2
          }
          if (-not $ready) { throw "PostgreSQL 未在 60 秒内就绪" }
      - name: 构建真实后端
        shell: bash
        run: cargo build --release --bin server
      - name: 安装微信开发者工具
        shell: pwsh
        run: ./scripts/ci/install-wechat-devtools.ps1
      - name: 构建小程序
        run: npm --prefix miniapp run build:mp-weixin
      - name: 启动真实后端与数据库
        shell: bash
        run: bash scripts/ci/start-miniapp-e2e-backend.sh
      - name: 启动 automator 服务
        shell: pwsh
        run: |
          $cli = $env:WECHAT_DEVTOOLS_CLI
          & $cli auto --project "$env:GITHUB_WORKSPACE\miniapp\dist\build\mp-weixin" --auto-port 9420
      - name: 运行真实运行时 E2E
        env:
          MINIAPP_AUTOMATOR_WS: ws://127.0.0.1:9420
          E2E_BASE_URL: http://127.0.0.1:8082
          E2E_USERNAME: ${{ secrets.MINIAPP_E2E_USERNAME }}
          E2E_PASSWORD: ${{ secrets.MINIAPP_E2E_PASSWORD }}
        run: npm --prefix miniapp run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: miniapp-e2e-results
          path: miniapp/test-results/
```

GitHub-hosted Windows runners do not support Linux `services:` containers, so PostgreSQL is started with an explicit `docker run` step and the backend is built for Windows in the same job. If Docker or the Windows Rust build is unavailable, the job must fail explicitly rather than fall back to mocks or skipped E2E.

`start-miniapp-e2e-backend.sh` must reuse the existing migration, environment-variable, health-check, and PostgreSQL startup pattern from `.github/actions/e2e-runtime/action.yml` and `.github/workflows/ci-cd.yml`, but must not edit `ci-cd.yml`.

- [ ] **Step 6: Run local static checks only**

```bash
bash -n scripts/ci/start-miniapp-e2e-backend.sh
node --check miniapp/tests/e2e/run.mjs
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
npx prettier --check miniapp/tests/e2e .github/workflows/miniapp-e2e.yml
```

- [ ] **Step 7: Verify runtime E2E in CI**

Expected: WeChat DevTools installs, automator connects, real backend and PostgreSQL start, login smoke passes, artifacts upload even on failure.

- [ ] **Step 8: Commit when authorized**

```bash
git add scripts/ci/install-wechat-devtools.ps1 scripts/ci/start-miniapp-e2e-backend.sh miniapp/tests/e2e miniapp/package.json .github/workflows/miniapp-e2e.yml
git commit -m "test(miniapp): add real runtime E2E on GitHub Windows"
```

---

### Task 12: Phase 1 Acceptance and Handoff

**Files:**
- Create: `docs/plans/miniapp-phase1-acceptance.md`
- Modify: `miniapp/README.md`

**Interfaces:**
- Produces: a signed-off checklist with links to the exact workflow runs and head SHA.
- Produces: a list of Phase 2 domains and the backend gaps that block them.

- [ ] **Step 1: Write the acceptance checklist**

```markdown
# Miniapp Phase 1 Acceptance

- [ ] `miniapp/` builds for WeChat in CI.
- [ ] TypeScript, ESLint, Prettier, unit tests and contract tests pass.
- [ ] Contract gate reports zero `/app-api`, `/oauth-api` and legacy pagination usage.
- [ ] Page check reports zero missing pages.
- [ ] Main package is <= 2048KB.
- [ ] Runtime E2E connects to real WeChat DevTools, real backend and real PostgreSQL.
- [ ] Password login and `/auth/me` verification pass.
- [ ] WeChat mini program login matches existing phone only and creates no ERP user.
- [ ] Identity binding unique constraint is verified by integration test.
- [ ] 195-page backend gap ledger is complete and deterministic.
- [ ] No secrets or real host values are tracked.
- [ ] Existing `miniprogram/` remains unchanged.
```

- [ ] **Step 2: Run all Phase 1 gates in CI and record evidence**

Record in `docs/plans/miniapp-phase1-acceptance.md`:

- full 40-character head SHA;
- workflow run URL;
- job names and conclusions;
- package size output;
- E2E test count and artifact path;
- known limitations that do not violate the spec.

- [ ] **Step 3: Update the miniapp README**

Document:

- local static-check commands;
- CI-only build and test commands;
- required environment variables;
- test AppID setup;
- backend WeChat configuration variables;
- how to run the gap inventory;
- how to read the acceptance report.

- [ ] **Step 4: Commit when authorized**

```bash
git add docs/plans/miniapp-phase1-acceptance.md miniapp/README.md
git commit -m "docs(miniapp): record phase 1 acceptance and handoff"
```

---

## Phase 1 Exit Criteria

Phase 1 is complete only when all of the following are true:

1. A clean checkout can run `miniapp-checks.yml` and `miniapp-e2e.yml` without manual steps.
2. The new app can log in with password and WeChat test credentials, verify `/auth/me`, and render the workspace shell.
3. The API client, CSRF queue, error model, permission model and session store have unit coverage.
4. The contract gate proves zero legacy endpoints and zero legacy pagination keys.
5. The 195-page backend gap ledger is complete and reviewed.
6. The backend miniapp login is additive, tested against PostgreSQL, and does not create users automatically.
7. Runtime E2E uses real WeChat DevTools, real backend and real PostgreSQL; no mocks or route interception.
8. The old `miniprogram/` remains untouched and deployable until Phase 4 cutover.
