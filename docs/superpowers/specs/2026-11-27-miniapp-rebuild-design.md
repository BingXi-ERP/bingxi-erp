# 小程序全量重建设计规格

- 日期：2026-11-27
- 状态：设计已确认，待评审后进入实施计划
- 适用仓库：`E:/work/bingxi/repo1`
- 新工程目录：`miniapp/`
- 旧工程目录：`miniprogram/`

## 1. 目标

使用 uni-app + Vue 3 + TypeScript 重建微信小程序，采用 Wot Design Uni 设计体系，对现有 195 个页面、全部后端缺口、运行时 E2E 和 CI 门禁进行系统性重构。

重构必须同时满足：

1. 新小程序只调用真实存在的 `/api/v1/erp` 能力，不使用假数据、404 占位或旧 `/app-api` 路径。
2. 现有 195 个页面涉及的后端能力全部盘点并补齐；只做增量扩展，不改变现有 Web 与旧小程序依赖的 API 响应形状。
3. 修复现有源码中的契约漂移、分页形状错误、用户档案字段错误、重复实现、反编译残留和静默失败。
4. 新应用通过全量验收后，在同一切换窗口删除旧 `miniprogram/`、旧静态门和旧发布入口，不做长期双轨。
5. 新应用开发与 CI 暂用测试号；正式新 AppID 在上线前配置并验收。

## 2. 非目标

- 不把现有反编译源码逐文件机械翻译为 Vue。
- 不保留 `/app-api` 或 `/oauth-api` 旧路径。
- 不为无后端能力的页面提供模拟成功或占位入口。
- 不修改现有 `/api/v1/erp` 端点的响应形状、状态词表、分页信封和错误信封。
- 不在本任务中推送代码、合并 PR 或发布到微信正式环境。
- 不直接修改高敏感的 `.github/workflows/ci-cd.yml`；新工程使用独立工作流。

## 3. 现状事实

- 现有 `miniprogram/` 是授权反编译还原产物，共 314 个 JS、195 个声明页、175 个磁盘识别页。
- 现有静态门为七道：JS 语法、包体积、页面对账、端点对账、依赖声明、暴露面、路由对账。
- 现有源码保留 375 处 `/app-api` 旧路径字面量、253 条去重路径；后端与权威路由快照中均不存在这些路径。
- 现有端点门只校验 `/api/v1/erp`，对旧路径仅报告不判红，存在“静态门全绿但功能 404”的假绿。
- 60 个 JS 文件仍读取旧分页键 `content/pageNo/totalPage/hasNextPage/isLastPage`，后端统一分页为 `{items,total,page,page_size}`。
- `login.getUserInfo()` 将 `app.globalData.userInfo` 覆盖为后端原始 `UserInfo`，但页面仍读取 `nickName/fullName/mobile/type/companyName` 等不存在的字段。
- 主包、`packageA`、`packageB` 各有一份请求层，九组业务服务副本已发生语义漂移。
- 后端目前只有账号密码登录，没有微信小程序登录链路；现有 `WECHAT_MP_APPID/WECHAT_MP_SECRET` 仅用于公众号模板通知。
- 后端 OpenAPI 仅在 `swagger` feature 下挂载，当前只覆盖少量端点，不能直接生成全量 SDK。
- 仓库没有现成 uni-app/Taro 工程，也没有 JavaScript workspace。

## 4. 已确认决策

| 决策项 | 结论 |
|---|---|
| 目标框架 | uni-app + Vue 3 + TypeScript |
| UI 组件 | Wot Design Uni |
| UI 口径 | 保留业务流程，视觉与交互全面重构 |
| 接口策略 | 严格使用真实 `/api/v1/erp`；缺能力评估后补后端并真实接入 |
| 后端范围 | 195 页涉及的后端缺口全部补齐 |
| 后端兼容 | 只做增量扩展，不改变现有 API 契约 |
| 工程边界 | 新建 `miniapp/`，旧 `miniprogram/` 验收前保留 |
| 架构 | 功能域模块化单体 |
| API 层 | 契约驱动，类型与运行时 Schema 双重校验 |
| 环境配置 | 构建期环境变量与 CI Secrets |
| AppID | 暂用测试号，正式新 AppID 上线前切换 |
| 验收 | 静态门 + 契约测试 + CI 构建 + 运行时 E2E |
| E2E 运行器 | GitHub Windows runner，job 内安装微信开发者工具 |
| 实施顺序 | 平台底座 → 核心交易链路 → 剩余业务域 |
| 旧版下线 | 新应用全量验收后统一下线并删除旧源码与旧门禁 |

## 5. 工程结构

```text
miniapp/
├─ src/
│  ├─ app.ts
│  ├─ main.ts
│  ├─ pages.json
│  ├─ manifest.config.ts
│  ├─ env.d.ts
│  ├─ features/
│  │  ├─ auth/
│  │  ├─ workspace/
│  │  ├─ orders/
│  │  ├─ customers/
│  │  ├─ products/
│  │  ├─ color-cards/
│  │  ├─ sales-returns/
│  │  ├─ demand/
│  │  ├─ data-center/
│  │  ├─ marketing/
│  │  ├─ personal-center/
│  │  ├─ settings/
│  │  ├─ printing/
│  │  ├─ registration/
│  │  ├─ search/
│  │  ├─ notifications/
│  │  └─ devices/
│  ├─ shared/
│  │  ├─ api/
│  │  ├─ ui/
│  │  ├─ design/
│  │  ├─ composables/
│  │  ├─ stores/
│  │  ├─ validation/
│  │  ├─ i18n/
│  │  └─ testing/
│  ├─ static/
│  └─ styles/
├─ tests/
│  ├─ unit/
│  ├─ contract/
│  └─ e2e/
├─ scripts/
└─ package.json
```

### 5.1 功能域内部结构

每个功能域使用统一模板：

```text
features/<domain>/
├─ pages/
├─ components/
├─ composables/
├─ services/
├─ types.ts
└─ index.ts
```

- `pages/`：路由页面，只负责布局与交互编排。
- `components/`：仅本域复用组件。
- `composables/`：页面状态、请求、分页、提交、取消和缓存。
- `services/`：本域业务语义与端点封装。
- `types.ts`：本域 DTO、ViewModel 和状态类型。
- `index.ts`：对外公开入口。

### 5.2 依赖规则

- `features` 之间禁止直接引用内部文件，只能通过公开入口或 `shared`。
- 页面禁止直接拼接 URL 或调用 `uni.request`。
- `shared/api` 是唯一网络出口。
- `shared/ui` 只依赖 `shared/design` 与 Wot Design Uni，不依赖业务域。
- Pinia Store 不得反向依赖页面或功能域内部实现。
- 跨域复用组件必须上移到 `shared/ui`，不得复制到多个功能域。

## 6. 技术栈

- uni-app：Vue 3 版本，使用 Composition API 与 `<script setup lang="ts">`。
- TypeScript：严格模式，禁止 `any` 逃逸到业务层。
- 状态管理：Pinia。
- UI：Wot Design Uni。
- 表单：统一 composable + 运行时 Schema 校验。
- 测试：Vitest、Vue Test Utils、miniprogram-automator。
- 契约：TypeScript 类型 + 运行时 Schema + 后端路由快照对账。
- 包管理：使用仓库认可的锁文件机制，禁止提交生成目录和真实环境配置。

## 7. 数据流与请求模型

标准调用链：

```text
Vue 页面
  → 本域 composable
  → 本域 service
  → shared/api client
  → uni.request
  → /api/v1/erp
```

### 7.1 请求客户端职责

`shared/api/client` 统一负责：

- 基础地址与环境选择。
- httpOnly Cookie 会话维护。
- `X-Requested-With`、`App-User-Agent`、`terminalSource` 等固定头。
- 一次性 CSRF 令牌的读取、作废、串行、轮换与恢复重放。
- GET 查询参数序列化与空值剔除。
- 成功信封 `{code:200,data,message?}` 到内部成功模型转换。
- 失败信封 `{code,message,trace_id,timestamp}` 到 `AppError` 转换。
- 401 会话回读、403 分类、5xx 日志与重试策略。
- 请求、响应、业务关键步骤的结构化日志。

### 7.2 契约校验

- 以后端 Rust DTO、路由快照和可用的 OpenAPI 为事实源。
- 新后端端点必须补充 OpenAPI 注解。
- 对 OpenAPI 未覆盖的端点，使用路由快照加 DTO 字段扫描生成或校验类型。
- 所有跨边界响应必须通过运行时 Schema 校验。
- 缺键、类型不符、未知状态词表必须显式失败，禁止 `?? []`、`|| 默认值` 或空 catch 掩盖。

### 7.3 数据映射规则

- 后端字段保持 `snake_case`。
- Decimal 在 API 边界保持字符串，仅在展示或提交的明确转换点转为数值。
- 状态 token 必须与 `backend/src/models/status/` 写入方逐字符一致。
- 中文业务词表不得英文化。
- ViewModel 可以改为 camelCase，但必须集中在明确的映射层，不得散落页面。

## 8. 会话、登录与权限

### 8.1 小程序登录

后端当前没有小程序登录链路，必须新增：

- 端点：`POST /api/v1/erp/auth/miniapp/login`。
- 入参：微信登录 `code`、手机号授权所需字段、环境与渠道信息。
- 处理：通过微信 `code2session` 获取 `openid/session_key/unionid`，按产品口径处理手机号，建立与现有账密登录一致的会话。
- 建档策略：手机号必须命中现有 `users.phone` 才可登录；未命中进入注册或绑定流程，不自动创建 ERP 用户，不分配默认角色。
- 身份绑定：新增小程序身份表，唯一键 `(appid, openid)`，`user_id` 外键关联现有用户；首次手机号匹配成功后建立绑定，后续优先按绑定查询。
- 配置：新增小程序 AppID/Secret 环境变量与配置加载，不复用公众号模板通知凭据。
- 测试号阶段使用测试配置；正式新 AppID 上线前切换并完成真机验收。
- 新登录端点只新增，不修改现有 `/auth/login` 请求与响应。

### 8.2 会话回读

- 登录成功后必须调用 `GET /api/v1/erp/auth/me` 回读确认。
- 登录态三态：`valid`、`invalid`、`error`。
- `invalid` 清理会话、CSRF 令牌和用户档案缓存并回登录页。
- `error` 保留快照，不把网络抖动误判为登出。

### 8.3 CSRF

- 写请求使用一次性 `x-csrf-token`。
- 会消费令牌的请求串行执行。
- 403 的 `CSRF_TOKEN_MISSING/INVALID` 仅在响应带回恢复令牌时重放一次。
- `CSRF_TOKEN_BINDING_MISMATCH` 不自动恢复，按安全失败处理。

### 8.4 权限

- `/auth/me` 返回的 `permissions` 是唯一权限源。
- 路由守卫、菜单、按钮和操作入口共用同一权限判定模块。
- 权限码采用后端真实 `{resource}:{action}` 格式，不沿用旧厂商入口键作为最终判据。
- 无权限入口不渲染；无后端能力的入口不渲染。

## 9. 状态管理

- Pinia 仅保存跨页状态：会话、权限、用户档案、应用级缓存。
- 列表、详情、表单、分页、loading、错误态由功能域 composable 管理。
- 表单草稿使用明确键名的 storage，必须有过期与清理策略。
- 禁止把全部页面状态塞入全局 Store。
- 跨页传参优先使用路由参数和明确的页面服务，不使用隐式全局变量。

## 10. UI 设计系统

### 10.1 组件层

- Wot Design Uni 作为基础组件。
- `shared/ui/wot` 统一封装主题、弹窗、Toast、表单、上传和选择器。
- 业务组件包括：用户选择器、商品选择器、色卡选择器、订单状态标签、金额、日期时间、权限按钮、空态、错误态。
- 页面模板包括：`ListPageTemplate`、`DetailPageTemplate`、`FormPageTemplate`、`StateView`。

### 10.2 设计规则

- 所有颜色、间距、圆角、字号、阴影来自 `shared/design/tokens`。
- 页面禁止硬编码视觉值。
- 移动端优先，兼容安全区、不同屏幕宽度和横竖屏。
- 保留现有业务流程，重做信息层级、列表密度、表单分组、筛选区和操作区。
- 状态色以后端状态词表为唯一来源。
- 中文为默认语言，文案集中管理，结构支持后续多语言。

## 11. 后端补齐

### 11.1 缺口台账

对旧小程序 195 页逐页建立能力台账，至少记录：

- 页面与业务动作。
- 端点、方法、请求字段、响应字段。
- 权限码、状态词表、数据范围。
- 上传、打印、订阅消息、微信登录等平台依赖。
- 后端承载状态：已有、需新增端点、需新增字段、需新增权限、无需后端。

### 11.2 实施原则

- 只做增量扩展，不改变现有 API 响应形状。
- 新端点必须同时补齐 handler、service、权限码、数据范围、审计、OpenAPI 注解和集成测试。
- 需要数据库变化时新增 migration，不修改历史迁移。
- 状态词表、Decimal、分页和错误信封遵循仓库现有事实源。
- 新能力上线前必须通过真实 PostgreSQL 集成测试。
- 无真实后端承载的页面不得进入新小程序。

## 12. 错误处理与可观测性

- 统一 `AppError{code,message,trace_id,timestamp}`。
- 401：回读会话并按结果重试或清退。
- 403：区分权限拒绝、CSRF 可恢复失败和绑定失败。
- 5xx：保留请求上下文与 `trace_id`，按策略重试或进入失败态。
- 页面必须提供 loading、空态、错误态和重试入口。
- 表单错误必须映射到字段或表单级错误，不得只弹 Toast。
- 禁止空 catch、静默失败、默认值掩盖缺键。
- 关键日志使用结构化字段，包含操作、端点、状态码、业务码、`trace_id` 和耗时，不记录凭据。

## 13. 测试策略

### 13.1 单元测试

- Pinia Store。
- composable 的状态流转。
- 表单校验。
- 状态映射、金额、日期、分页工具。

### 13.2 组件测试

- Wot 封装组件。
- 业务组件。
- 页面模板的 loading、空态、错误态和交互。

### 13.3 契约测试

- TypeScript 类型与后端 DTO 对账。
- 运行时 Schema 对真实或录制响应校验。
- 前端调用路径与后端路由快照对账。
- 请求字段与后端 `Query/Json` 字段对账。
- 禁止旧分页键、旧路径和自创响应键。

### 13.4 后端集成测试

- 新增端点使用真实 PostgreSQL。
- 覆盖成功、权限拒绝、非法状态、数据范围、审计和错误信封。
- 不在本地运行 `cargo build/test`，完整验证走 CI。

### 13.5 运行时 E2E

- 使用 `miniprogram-automator` 操作真实微信开发者工具。
- 连接真实后端与真实 PostgreSQL。
- 禁止 mock、route 拦截和假响应。
- 覆盖登录、工作台、订单、收款、客户、商品/色卡、退货核心链路。
- GitHub Windows runner 在 job 内安装微信开发者工具；安装或连接失败必须判失败，不得跳过。

## 14. CI 与静态门

新增独立工作流 `miniapp-checks.yml`，至少包含：

1. 依赖安装与锁文件校验。
2. TypeScript 类型检查。
3. ESLint。
4. Prettier。
5. Vitest 单元与组件测试。
6. 契约测试与路由/端点对账。
7. uni-app 微信小程序构建。
8. 包体积检查：主包不超过 2048KB，单分包不超过 2048KB，总包不超过仓库约定上限。
9. 页面声明与磁盘文件对账。
10. 旧路径、凭据、公网 IP、裸中文业务 token 扫描。
11. 微信开发者工具安装与自动化自检。
12. 真实后端 + PostgreSQL 运行时 E2E。
13. 结果写入 Step Summary，并绑定完整 head SHA。

门禁要求：

- 每道判定器必须有反向自证。
- 扫空、工具缺失、日志缺失、未执行和 skipped 不得判绿。
- 新工作流不直接接入 `ci-cd.yml`；后续如需进入主聚合门，必须另行获得明确授权。
- 旧 `miniprogram-checks.yml` 在新应用验收前继续保护旧源码。

## 15. 实施阶段

### 阶段 1：平台底座

- 新建 `miniapp/` 与功能域骨架。
- 设计系统、Wot 封装、页面模板。
- 会话、权限、CSRF、错误模型。
- 契约驱动 API 层。
- 后端小程序登录能力。
- 195 页后端缺口台账。
- 静态门、契约测试、CI 构建与运行时 E2E 骨架。

### 阶段 2：核心交易链路

- 工作台。
- 订单列表、详情、建单、收款、打印。
- 客户管理。
- 商品与色卡。
- 销售退货。
- 同步补齐所需后端端点、字段、权限和测试。

### 阶段 3：剩余业务域

- 需求、数据中心、营销、个人中心、设置、设备、搜索、注册等。
- 按旧主包、`packageA`、`packageB`、`packageC` 逐域迁移。
- 所有后端缺口真实接入。

### 阶段 4：全量验收与切换

- 195 页功能对照。
- 权限矩阵、异常态、包体积、性能与安全检查。
- 全量运行时 E2E 通过。
- 测试号验收。
- 正式新 AppID 配置与真机验收。
- 同一切换窗口删除旧 `miniprogram/`、旧静态门和旧发布入口。

## 16. 验收标准

### 16.1 架构验收

- 业务代码全部位于 `miniapp/src/features` 或 `miniapp/src/shared`。
- 页面无直接网络调用。
- 无跨功能域内部引用。
- 无重复请求层或重复业务服务事实源。

### 16.2 契约验收

- 新小程序无 `/app-api`、`/oauth-api` 调用。
- 无 `content/pageNo/totalPage` 等旧分页键。
- 所有响应通过运行时 Schema。
- 所有状态 token 与后端写入方一致。
- 所有新增端点有 OpenAPI、权限和集成测试。

### 16.3 质量验收

- TypeScript、ESLint、Prettier、单元测试、组件测试、契约测试全部通过。
- uni-app 微信构建通过。
- 包体积达标。
- 运行时 E2E 使用真实后端和 PostgreSQL，全部通过。
- 无未解释的 skipped、空日志或工具故障。

### 16.4 业务验收

- 195 页逐页确认：可达、权限正确、数据真实、操作成功、异常可恢复。
- 无 404 假入口、假保存、假删除、空成功提示。
- 用户档案、订单、客户、商品、色卡、退货字段与后端一致。
- 新应用验收前旧版保持可回退；验收后旧版统一下线。

## 17. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 全量范围导致周期失控 | 严格按 1→2→3 阶段验收，每阶段独立交付 |
| 微信开发者工具在 GitHub Windows 安装不稳定 | 固定版本、校验安装、失败即红；保留完整安装日志 |
| GitHub Windows 不支持 Linux `services:` 容器 | PostgreSQL 使用显式 `docker run`，后端在 Windows job 内构建；Docker 或构建不可用即失败，不降级为 mock |
| 新 AppID 与后端微信配置不一致 | 环境变量集中管理，测试号与正式号配置分离，上线前真机验收 |
| 后端缺口数量超出预期 | 阶段 1 先产出完整台账，按业务域排序，禁止未盘点先写页面 |
| 现有 API 契约被破坏 | 只做增量扩展，契约测试和现有 Web E2E 同步门禁 |
| 包体积超限 | 分包、按需加载、组件库裁剪、CI 体积门 |
| 运行时 E2E 不稳定 | 真实数据、显式日志、重试有上限、禁止 mock，失败保留 trace 与截图 |
| 旧版下线造成用户断档 | 新应用全量验收后同一切换窗口下线，准备好正式 AppID 与发布包 |

## 18. 交付物

- `miniapp/` 完整 uni-app 工程。
- 后端小程序登录与全量缺口能力。
- 数据库 migration（仅在确需新增表、字段、索引或约束时）。
- `miniapp-checks.yml` 与配套脚本。
- 单元、组件、契约、后端集成和运行时 E2E 测试。
- 195 页能力台账与迁移对照。
- 新应用验收报告与旧版下线清单。
