# Bingxi Miniapp

`miniapp/` 是秉羲纺织 ERP 的新一代微信小程序工程，使用 uni-app、Vue 3、TypeScript、Pinia、Wot Design Uni、Zod 与 Vitest。当前仅完成 Phase 1 平台底座：登录、会话、权限、契约 API、工作台、静态门与运行时 E2E 骨架；不是可发布的全量业务版本。

旧 `miniprogram/` 在 Phase 4 切换前必须保持不变。新应用只允许调用真实 `/api/v1/erp` 端点，禁止 `/app-api`、`/oauth-api`、假数据、404 占位和静默兜底。

## 1. 当前验收状态

- Phase 1 状态：**BLOCKED / NOT ACCEPTED**，不可合并 main、不可发布。
- 最终复审 8 项 findings 已完成本地修复；完整 Vitest 为 18 files / 305 tests，typecheck、lint、Prettier、契约/页面、架构/源码扫描与静态自证均通过，但仍等待 scoped 复审。
- npm 审计门按设计失败：生产依赖 `productionBlockers=0`，dev critical=0，dev high=1；`vite@5.2.8` 的 Windows dev-server 风险接受仍为 `pending`。
- Windows GitHub Actions、uni-app 微信构建、automator 运行时 E2E 未实跑；真实微信手机号登录是人工发布门。
- 不伪造 CI 全绿、不代签风险接受、不在未获授权时提交或推送。

验收清单、最终复审 findings、证据边界、CI 登记和 Phase 2 交接见 [Phase 1 Acceptance](../docs/plans/miniapp-phase1-acceptance.md)；逐项修复明细见 [final-fix-report.md](../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/final-fix-report.md)，原始输出见 [final-fix-evidence.txt](../.superpowers/sdd/2026-11-27-miniapp-phase1-foundation/final-fix-evidence.txt)。

## 2. 工程结构

```text
miniapp/
├─ src/
│  ├─ App.vue                    # 应用生命周期
│  ├─ app.ts                     # 应用装配
│  ├─ main.ts                    # 入口
│  ├─ pages.json                 # 页面与 tabBar 声明
│  ├─ manifest.config.ts        # 微信 AppID 与构建期清单
│  ├─ env.d.ts                  # ImportMetaEnv 类型
│  ├─ features/
│  │  ├─ auth/                  # 登录服务、会话 store、守卫、composable；唯一公开入口 index.ts
│  │  └─ workspace/             # Phase 1 工作台；对外仅暴露公开入口
│  ├─ shared/
│  │  ├─ api/                   # 唯一网络出口、契约、CSRF、错误、日志
│  │  ├─ config/runtime.ts      # 构建期运行时配置校验
│  │  ├─ design/tokens.css      # 设计令牌
│  │  ├─ i18n/                  # 集中文案
│  │  ├─ stores/permissions.ts  # 权限判定
│  │  └─ ui/                    # Wot 封装、权限按钮、页面模板
│  ├─ static/                    # 静态资源
│  └─ styles/                    # 全局样式
├─ tests/
│  ├─ unit/                     # API、CSRF、会话、权限、页面与组件单测
│  ├─ contract/                 # 契约门、缺口盘点、Wot 与设计令牌契约
│  └─ e2e/                      # automator 运行时用例与 runner
├─ .env.example                 # 占位环境变量，不入库真实值
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
└─ vitest.e2e.config.ts
```

相关仓库级文件：

```text
.github/workflows/miniapp-checks.yml       # 静态门、审计、单测、微信构建、体积
.github/workflows/miniapp-e2e.yml          # Windows 真实运行时 E2E
scripts/ci/miniapp-contract-check.mjs      # AST 契约门
scripts/ci/miniapp-contract-ast.mjs        # TypeScript AST 解析
scripts/ci/miniapp-check-pages.mjs         # 页面对账
scripts/ci/miniapp-check-size.mjs          # 包体积门
scripts/ci/miniapp-gap-inventory.mjs       # 195 页缺口台账
scripts/ci/miniapp-architecture-check.mjs  # feature 边界与公开入口门
scripts/ci/miniapp-source-scan.mjs         # 源码凭据、公网 IP、裸中文 token 门
scripts/ci/miniapp-write-step-summary.mjs  # 成功/失败路径的 Step Summary 证据
scripts/ci/miniapp-npm-audit.mjs           # 生产依赖硬门 + dev 风险接受
scripts/ci/install-wechat-devtools.ps1     # Windows 开发者工具安装
scripts/ci/start-miniapp-e2e-backend.sh    # 真实迁移、初始化与后端启动
scripts/ci/scan-miniapp-e2e-artifacts.mjs  # E2E 制品脱敏与敏感信息扫描
docs/plans/miniapp-backend-gap-ledger.md   # 后端能力缺口台账
docs/plans/miniapp-npm-audit.md            # npm 审计与 Vite 风险记录
docs/security/miniapp-dev-dependency-risk-acceptance.json
```

依赖规则：页面 → 本域 composable/service → `shared/api` → `uni.request` → `/api/v1/erp`。页面禁止直接拼 URL 或调用 `uni.request`；`shared` 不得反向依赖 `features`，跨 feature 只能引用对方的 `index.ts` 公开入口，不得复制请求层或引用内部模块。

## 3. 环境变量

### 3.1 小程序构建期变量

从 `miniapp/.env.example` 复制为本地 `.env`，或由 CI 注入。`.env` 不入库。

| 变量                   | 必填 | 说明                                                                           |
| ---------------------- | ---- | ------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL`    | 是   | ERP 主机地址，不含 `/api/v1/erp`；末尾斜杠会归一化                             |
| `VITE_APP_ID`          | 是   | 微信 AppID；CI 密码/拒绝路径 E2E 可用 `touristappid`，真机登录必须用真实测试号 |
| `VITE_ENV_NAME`        | 是   | 仅允许 `development`、`test`、`production`                                     |
| `VITE_TERMINAL_SOURCE` | 是   | 正整数渠道标识；CI 使用 `81`                                                   |

`manifest.config.ts` 在 AppID 缺失时可用官方 `touristappid` 生成可打开的本地项目，但运行时配置仍要求显式 `VITE_APP_ID`。`touristappid` 可用于本地静态/构建检查，以及 CI 的密码登录与微信授权拒绝路径；不能作为真实微信登录或发布证据。

### 3.2 后端微信小程序登录变量

在 `backend/.env` 或部署密钥管理系统中配置：

| 变量                   | 说明                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `MINIAPP_APPID`        | 小程序 AppID，必须与 `VITE_APP_ID` 一致                                  |
| `MINIAPP_SECRET`       | 小程序 AppSecret，只能由后端持有，禁止以 `VITE_` 前缀注入前端            |
| `MINIAPP_API_BASE_URL` | 默认 `https://api.weixin.qq.com`；测试/兼容环境可覆盖为合法 HTTP(S) 地址 |

小程序登录凭据与公众号模板通知的 `WECHAT_MP_APPID`、`WECHAT_MP_SECRET` 完全分离，不得复用。缺少小程序凭据时服务可启动，但登录端点必须显式返回不可用。

### 3.3 Windows 运行时 E2E 变量

工作流需要以下 GitHub Secrets：

| Secret                          | 用途                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `MINIAPP_TEST_APPID`            | CI 测试号：`touristappid` 或 `wx` + 16 位十六进制 AppID  |
| `MINIAPP_TEST_SECRET`           | 测试号 AppSecret；`touristappid` 模式使用随机 CI-only 值 |
| `WECHAT_DEVTOOLS_INSTALLER_URL` | 可信 HTTPS 开发者工具安装包地址                          |
| `WECHAT_DEVTOOLS_CLI`           | Windows runner 上开发者工具 CLI 可执行文件路径           |
| `MINIAPP_E2E_USERNAME`          | CI 专用初始化管理员用户名                                |
| `MINIAPP_E2E_PASSWORD`          | CI 专用初始化管理员密码                                  |

工作流还在同 job 内设置本机后端地址、独立 CI 密钥、PostgreSQL 连接和 automator WebSocket。数据库密码与 JWT/Cookie/Webhook/Audit/Init 密钥均为 CI-only 值，不得复制到生产或仓库。

真实微信手机号登录的人工验收要求：测试微信号授权手机号必须已经存在于 ERP `users.phone`。后端不会自动创建 ERP 用户；未匹配手机号必须登录失败。

## 4. 本地静态与定向验证

常规开发以 GitHub Actions 为最终证据。以下命令不启动服务、不执行 uni-app 构建或 automator：

```bash
# 在仓库根目录执行；Node >= 22
# 首次运行或锁文件变化后先清洁安装，后续命令复用同一套依赖
npm --prefix miniapp ci
npm --prefix miniapp run typecheck
npm --prefix miniapp run lint
# 与 CI 的范围一致；miniapp/*.ts 已覆盖 shims-uni.d.ts，这里显式列出便于核对
npm --prefix miniapp exec -- prettier --check miniapp/src miniapp/tests miniapp/*.ts miniapp/*.json miniapp/shims-uni.d.ts

# 契约门与反向自证
npm --prefix miniapp run contract:self-test
npm --prefix miniapp run contract:check

# 页面声明对账
node scripts/ci/miniapp-check-pages.mjs miniapp/src

# 架构边界与源码安全扫描：先反向自证，再检查真实源码
node scripts/ci/miniapp-architecture-check.mjs --self-test
node scripts/ci/miniapp-architecture-check.mjs
node scripts/ci/miniapp-source-scan.mjs --self-test
node scripts/ci/miniapp-source-scan.mjs

# 静态判定器反向自证（不构建真实产物）
npm --prefix miniapp run check:self-test

# action 固定性
node scripts/ci/check-action-pinning.mjs
```

定向 Vitest（Task 12 曾获用户明确授权运行完整 Vitest；常规仍以 CI 为准）：

```bash
# 指定文件
npm --prefix miniapp run test:run -- tests/unit/csrf-queue.test.ts

# 完整套件：18 files / 305 tests
npm --prefix miniapp run test:run
```

生成并核对 195 页后端缺口台账：

```bash
# 直接更新台账
node scripts/ci/miniapp-gap-inventory.mjs \
  --legacy-root miniprogram \
  --output docs/plans/miniapp-backend-gap-ledger.md \
  --snapshot frontend/scripts/route-snapshot.txt

# 只验证确定性时，输出到仓库外再 cmp
node scripts/ci/miniapp-gap-inventory.mjs \
  --legacy-root miniprogram \
  --output C:/Users/57231/miniapp-gap-check.md
cmp docs/plans/miniapp-backend-gap-ledger.md C:/Users/57231/miniapp-gap-check.md
```

当前台账：195 页、4381 行；`existing=1490`、`missing=7`、`legacy=2623`、`manual-review=261`。`legacy` 不代表新后端已有等价能力；进入 Phase 2 时必须按业务域人工评审请求字段、响应字段、权限和状态词表。

## 5. npm 审计门

```bash
# 判定器反向自证
node scripts/ci/miniapp-npm-audit.mjs --self-test

# 真实审计与分类报告
node scripts/ci/miniapp-npm-audit.mjs \
  --markdown-output miniapp/test-results/miniapp-npm-audit.md \
  --json-output miniapp/test-results/miniapp-npm-audit.json
```

判定规则：

- 生产依赖树出现 critical/high：硬失败，不接受风险。
- dev/build/test 树出现 critical/high：只有有效、未过期、精确覆盖全部风险记录的接受才能放行；匹配元组包含包名、版本、安装节点、advisory URL/range/severity 与 scope，新增或多余记录都会失败关闭。
- `pending`、缺失、无效或过期：失败关闭。
- moderate/low：记录并按计划治理，不作为伪造 critical/high 清零的理由。

当前真实结果为退出码 1：`productionBlockers=0`、`devBlockers=1`、`devRiskStatus=pending`。唯一 dev high 由 `vite@5.2.8` 聚合报告，涉及 Windows dev-server 的 `launch-editor`；Vite 版本受 uni-app 精确 peer 约束，不能单独升级或 override。详见 [npm audit 报告](../docs/plans/miniapp-npm-audit.md)。

风险接受文件是 `docs/security/miniapp-dev-dependency-risk-acceptance.json`。只有安全负责人能签署；开发者不得把 `pending` 改成 `approved` 来让门禁变绿。

该文件已同时加入 `miniapp-checks.yml` 的 `pull_request.paths` 与 `push.paths`。签署提交会产生新的候选 HEAD，并在 PR 或推送到 `main` 时触发新的 npm 审计门；必须取得该新 HEAD 的 workflow run、job conclusion 与审计报告后才能判断放行，不能沿用签署前 HEAD 的旧结果。若同一提交只包含签署文件，新 run 仍从该 HEAD 检出并先执行审计；审计失败时后续步骤按工作流设计不会执行。

## 6. CI-only 命令

以下命令由 GitHub Actions 在干净 runner 执行，Task 12 未在本地运行：

```bash
# 清洁安装（miniapp-checks.yml）
npm --prefix miniapp ci

# 完整静态门：安装、类型、lint、格式、Vitest、契约、页面、架构/源码扫描、微信构建、体积
MINIAPP_SKIP_INSTALL=1 bash scripts/ci/miniapp-checks.sh

# uni-app 微信构建
npm --prefix miniapp run build:mp-weixin

# 真实包体积（CI 构建产物）
node scripts/ci/miniapp-check-size.mjs miniapp/dist/build/mp-weixin 2048

# Windows E2E：真实 PostgreSQL + Rust release 后端 + 微信开发者工具
cargo build --locked --release --bin server --bin bingxi
bash scripts/ci/start-miniapp-e2e-backend.sh
npm --prefix miniapp run test:e2e
```

不要用本地 `npm run check:static` 代替 CI：它包含 uni-app 构建，必须验证真实构建产物。不要为了绕过审计门删除工作流中的审计步骤或添加 `continue-on-error`。

### 6.1 工作流 Step Summary 证据

两条工作流都在最后增加 `if: always()` 的摘要步骤，成功、失败、跳过和取消路径都会尝试写入：

- 完整 40 位 `github.sha` 与 `job.status`；
- 静态门：npm audit 汇总与生产/dev 分类、架构扫描、源码扫描、声明页数、体积门结果；构建产物存在时按真实文件字节统计包体积，不存在时明确写 `not-generated`；
- E2E：步骤结论、`exit-code.txt`、Vitest JSON 的 total/passed/failed/pending/todo、测试结果、敏感信息扫描、制品名/白名单与上传结论；
- 审计报告缺失或畸形时明确写 `not-generated`/`report-parse-error`，不伪造通过结论。

摘要写入器为 `scripts/ci/miniapp-write-step-summary.mjs`，其 6 条单元测试覆盖静态成功、审计阻断、畸形报告、E2E 成功、E2E 失败和短 SHA 拒绝。工作流尚未实跑，因此这些只是待 CI 验证的证据机制，不是已取得的 run 结论。

## 7. 运行时 E2E

运行时链路必须全部真实：

1. GitHub Windows runner 启动 PostgreSQL 16 容器，并以 `pg_isready` 判就绪。
2. 同一 Windows job 构建 Rust `server` 与 `bingxi`。
3. 安装并校验微信开发者工具 CLI。
4. 构建 `miniapp/dist/build/mp-weixin`。
5. 执行真实 migration、初始化测试管理员、启动后端并检查 `/api/v1/erp/health/readiness`。
6. 启动 automator 并等待 `9420` 端口监听。
7. 运行真实密码登录与微信拒绝授权/缺码用例。
8. 无论测试成功或失败，都执行制品脱敏与敏感信息扫描；扫描失败不得上传制品。

当前源码定义 2 条运行时用例：

- `smoke.spec.ts`：真实密码登录 → `/auth/me` 会话验证 → 工作台用户名断言。
- `wechat-login.spec.ts`：微信按钮 `open-type=getPhoneNumber`；拒绝授权/缺码时显示错误并停留登录页。

automator 不点击原生手机号授权框，因此这 2 条用例通过也不能替代真实微信登录人工验收。运行时禁止 mock、路由拦截和假响应；安装、连接、迁移、构建或测试失败必须判红，不得跳过。

预期制品名 `miniapp-e2e-results`，仅包含工作流白名单中的 8 个文件：`e2e.json`、`exit-code.txt`、`backend.log`、`backend.stderr.log`、`automator.stdout.log`、`automator.stderr.log`、`readiness.json`、`init-status.json`。审查时先确认制品扫描成功，再核对用例数、退出码和后端日志。

## 8. 测试号与人工微信验收

1. 在微信公众平台准备测试号，记录测试 AppID/AppSecret 到 CI Secrets，不写入仓库。
2. 确认小程序 `VITE_APP_ID` 与后端 `MINIAPP_APPID` 一致，Secret 属于同一测试号。
3. 用 CI 构建产物导入真实微信开发者工具；运行时禁止使用 `touristappid`。
4. 准备既有、启用、无 TOTP 阻断的 ERP 测试用户，其手机号与测试微信号真实授权手机号一致。
5. 真机同意手机号授权，确认进入工作台、用户名正确、`/auth/me` 成功。
6. 核对 `miniapp_identity` 只新增一条 `(appid,openid)` 绑定，ERP 用户总数不变。
7. 重复登录确认复用绑定；未匹配手机号确认失败且不建用户、不建绑定；拒绝授权确认停留登录页。
8. 保存脱敏证据：时间、AppID 标识、trace_id、用户/绑定数量与截图；禁止保存 Secret、Cookie、token 或手机号明文。

完整签署步骤见 [Phase 1 Acceptance](../docs/plans/miniapp-phase1-acceptance.md)。

## 9. 常见失败判责

| 现象                    | 处理                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| 契约门 `MISS`           | 对照 `frontend/scripts/route-snapshot.txt` 与后端真实路由；不得自造端点                          |
| 契约门 `UNRESOLVED`     | 把路径改成可解析字面量/常量，或修正作用域；不得加豁免                                            |
| 页面检查 `MISSING_PAGE` | 补齐磁盘页面或修正 `pages.json`；不得删除声明来掩盖缺失文件                                      |
| 架构扫描失败            | 将共享能力下沉到 `shared`，跨 feature 改走公开 `index.ts`；不得添加豁免                          |
| 源码扫描失败            | 移除真实凭据/公网主机值，将界面中文迁入 i18n；占位值必须明确且不得掩盖真实配置                   |
| npm 审计门失败          | 查看 `miniapp-npm-audit.json` 的生产/dev 分类；生产 critical/high 必须修复，dev 需安全负责人签署 |
| Windows E2E 配置失败    | 检查六个 Secrets、AppID 格式和 CLI 路径；不得改用 touristappid 或 mock                           |
| automator 连接失败      | 查看 `automator.stdout.log`、`automator.stderr.log` 与 9420 端口探活；不得跳过用例               |
| 后端 readiness 失败     | 查看 `backend.log`、`backend.stderr.log`、迁移与初始化日志；不得用假健康响应替代                 |
| E2E 制品未上传          | 先检查敏感信息扫描结论；扫描失败时修复泄露源，不得强行上传                                       |

## 10. 下一步

1. 对最终复审 8 项 findings 的执行范围进行 scoped 复审，并审查架构/源码扫描器的误报与漏报边界。
2. 安全负责人审阅并决定是否签署 Vite dev-only 风险接受；未签署前保持门禁关闭。
3. 获授权推送后运行两条独立工作流，记录最终 head SHA、run URL、job conclusion、真实包体积与 E2E 制品。
4. 在真实 PostgreSQL CI 中运行新增小程序登录集成测试。
5. 完成 Windows automator E2E 与真实微信手机号人工验收。
6. 将两条工作流设为 PR 必需检查；所有阻断解除前不得合并 main 或发布。
7. Phase 2 从订单、收款、客户、商品/色卡、销售退货开始，按缺口台账逐域补齐后端能力。
