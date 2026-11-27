# 编码规则参数化纵切实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让指定单据前缀的取号规则可配置、可审计、可回滚，并保持现有 `DocumentNumberGenerator` 调用方签名与未配置前缀行为不变。

**Architecture:** 新增独立顶层迁移域、SeaORM 规则/版本实体、系统管理服务与 `/system/number-rules` API；生成器在取号事务内按历史前缀解析规则，使用实际输出前缀与周期咨询锁。前端在系统设置新增编码规则页，复用现有请求、权限、i18n 与表格/弹窗范式。

**Tech Stack:** Rust edition 2024、SeaORM 2、PostgreSQL、Tokio、Vue 3、TypeScript、Element Plus、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-11-26-number-rules-design.md`

## Global Constraints

- 本地禁止 `cargo build/test`、禁止起 dev server、禁止本地跑 Playwright；运行期正确性只由完整 CI 证明。
- Rust 格式验证统一使用 `rustfmt --edition 2024 --config-path rustfmt.toml --check`。
- 不修改 `.github/workflows/ci-cd.yml` 或其他 workflow。
- E2E 必须使用真实后端与真实 PostgreSQL，禁止 mock、`page.route`、网络拦截和假响应。
- 新键必须同时写入 `frontend/src/locales/zh-CN.ts` 与 `frontend/src/locales/en-US.ts`。
- 权限码使用 `system:number-rules:read` 与 `system:number-rules:update`，后端不得依赖前端隐藏按钮。
- 规则键 `rule_key` 不可变；版本更新使用乐观锁；回滚追加新版本，不删除历史。
- 未配置 `rule_key` 显式走 legacy 日重置、3 位流水；配置查询在取号事务内完成，无缓存。
- 迁移必须是独立顶层域并注册在迁移链尾，不能挂入已应用的 `domain/system`。

---

### Task 1: 建立规则表、版本快照与不可变约束

**Files:**
- Create: `backend/migration/src/domain/system_number_rules/mod.rs`
- Create: `backend/migration/src/domain/system_number_rules/m0147_add_system_number_rules.rs`
- Modify: `backend/migration/src/domain/mod.rs`
- Modify: `backend/migration/src/lib.rs`
- Create: `backend/src/models/system_number_rule.rs`
- Create: `backend/src/models/system_number_rule_revision.rs`
- Modify: `backend/src/models/mod.rs`
- Test: `backend/tests/system_number_rule_schema_test.rs`

**Interfaces:**
- Produces: `system_number_rule::{Entity, Model, ActiveModel, Column}` 与 `system_number_rule_revision::{Entity, Model, ActiveModel, Column}`。
- Produces: `system_number_rule::Model { id: i32, rule_key: String, name: String, prefix: String, seq_width: i32, reset_mode: String, version: i32, created_at: DateTime<Utc>, updated_at: DateTime<Utc> }`。
- Produces: `system_number_rule_revision::Model { id: i32, rule_id: i32, version: i32, config: Json, change_reason: String, changed_by: i32, created_at: DateTime<Utc> }`。

- [ ] **Step 1: 写真实 PostgreSQL schema 回归**

在 `system_number_rule_schema_test.rs` 中覆盖：三种 `reset_mode` 可写入；`seq_width` 0/13 被数据库拒绝；重复 `rule_key` 被拒绝；重复 `(rule_id, version)` 被拒绝；revision 的 UPDATE/DELETE 被触发器拒绝；迁移幂等重放不重复播种。测试通过 `backend/tests/test_common.rs` 的真实连接入口执行，不在本地运行。

- [ ] **Step 2: 实现独立迁移域**

`m0147_add_system_number_rules.rs` 创建：

```sql
CREATE TABLE IF NOT EXISTS "system_number_rules" (
  "id" SERIAL PRIMARY KEY,
  "rule_key" VARCHAR(50) NOT NULL UNIQUE,
  "name" VARCHAR(100) NOT NULL,
  "prefix" VARCHAR(50) NOT NULL,
  "seq_width" INTEGER NOT NULL DEFAULT 3 CHECK ("seq_width" BETWEEN 1 AND 12),
  "reset_mode" VARCHAR(10) NOT NULL DEFAULT 'day' CHECK ("reset_mode" IN ('day','month','never')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS "system_number_rule_revisions" (
  "id" SERIAL PRIMARY KEY,
  "rule_id" INTEGER NOT NULL REFERENCES "system_number_rules"("id") ON DELETE CASCADE,
  "version" INTEGER NOT NULL CHECK ("version" >= 1),
  "config" JSONB NOT NULL,
  "change_reason" VARCHAR(500) NOT NULL,
  "changed_by" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("rule_id", "version")
);
```

创建 `prevent_system_number_rule_revision_mutation()` 触发器函数与 BEFORE UPDATE OR DELETE 触发器，命中即 `RAISE EXCEPTION`。`up` 使用 `INSERT ... ON CONFLICT (rule_key) DO NOTHING` 播种 `SO/PO/QT/PR/DN/LD` 六枚已核实的常用键，初始 `prefix=rule_key`、`seq_width=3`、`reset_mode=day`、`version=1`，同时为每枚规则写 version 1 revision，`change_reason='系统初始化'`、`changed_by=0`。`down` 先删触发器函数与两张表。

- [ ] **Step 3: 注册迁移链尾**

在 `domain/mod.rs` 增加 `pub mod system_number_rules;`，在 `lib.rs` 迁移向量末尾增加 `Box::new(domain::system_number_rules::Migration)`。记录 `MigrationName::name()` 为 `m_system_number_rules`，确保复用库 pending 可执行。

- [ ] **Step 4: 实现 SeaORM 实体**

按仓库现有实体风格实现两张表；时间列使用 `DateTimeWithTimeZone`，revision `config` 使用 `Json`。在 `models/mod.rs` 注册两个模块。

- [ ] **Step 5: 静态验证并提交**

运行迁移相关 Rust 文件的 edition 2024 rustfmt、`git diff --check`，提交 `feat(number-rules): 建立编码规则与版本快照地基`。

### Task 2: 实现规则解析、取号周期与咨询锁

**Files:**
- Modify: `backend/src/utils/number_generator.rs`
- Test: `backend/tests/number_generator_allocate_no_test.rs`
- Test: `backend/tests/number_generator_insert_with_no_retry_test.rs`

**Interfaces:**
- Produces: `ResolvedNumberRule { output_prefix: String, period: String, seq_width: usize }`。
- Produces: `DocumentNumberGenerator::resolve_rule(conn, rule_key, requested_width, now) -> Result<ResolvedNumberRule, AppError>`。
- Consumes: Task 1 的 `system_number_rule::Entity/Column/Model`。

- [ ] **Step 1: 写规则解析单测**

在 `number_generator.rs` 的 `#[cfg(test)] mod tests` 增加纯函数测试：`day -> YYYYMMDD`、`month -> YYYYMM`、`never -> 空周期`；默认请求宽度 3 在规则存在时采用规则宽度；显式非 3 宽度保持请求宽度；空前缀、非法周期与越界宽度返回显式错误。

- [ ] **Step 2: 实现规则解析**

新增 `ResolvedNumberRule` 与 `resolve_rule`。未查到规则时返回 legacy：`output_prefix=rule_key`、`period=YYYYMMDD`、`seq_width=max(requested_width,1)`。查到规则时校验非空 `prefix`、`seq_width 1..=12`、`reset_mode day|month|never`，按规则生成周期；`requested_width == 3` 时用规则宽度，否则保留请求宽度。任何数据库或配置错误均 `?` 上抛，不回落。

- [ ] **Step 3: 接入四个取号入口**

`generate_no_with_width` 与 `generate_no_with_width_txn` 在事务内调用 `resolve_rule`，使用 `output_prefix + period` 作为 `allocate_no` 的号段前缀，使用 `compute_advisory_lock_key(output_prefix, period)` 作为咨询锁。`insert_with_no_retry` 继续通过 `generate_no_with_width_txn` 间接受益，不改公开签名。

- [ ] **Step 4: 扩展真实 PostgreSQL 取号回归**

覆盖：日/月/永不重置；修改前缀后新号使用新前缀、旧号不变；规则位数生效；同输出前缀不同规则键共享咨询锁；软删号继续占号；并发生成不重复；未配置键仍输出旧格式。

- [ ] **Step 5: 静态验证并提交**

运行 Rust 2024 rustfmt 与 `git diff --check`，提交 `feat(number-rules): 按可配置周期生成唯一单据号`。

### Task 3: 实现规则管理服务、审计与乐观锁

**Files:**
- Create: `backend/src/services/system_number_rule_service.rs`
- Create: `backend/src/services/system_number_rule_dto.rs`
- Modify: `backend/src/services/mod.rs`
- Test: `backend/tests/system_number_rule_service_test.rs`

**Interfaces:**
- Produces: `SystemNumberRuleService::new(db: Arc<DatabaseConnection>) -> Self`。
- Produces: `list(page: i64, page_size: i64) -> Result<PaginatedResponse<Model>, AppError>`。
- Produces: `get(id: i32) -> Result<RuleDetailDto, AppError>`。
- Produces: `update(id: i32, req: UpdateNumberRuleRequest, actor_id: i32) -> Result<RuleDetailDto, AppError>`。
- Produces: `rollback(id: i32, req: RollbackNumberRuleRequest, actor_id: i32) -> Result<RuleDetailDto, AppError>`。
- Produces: `RuleDetailDto { rule: Model, revisions: Vec<RevisionModel> }`。

- [ ] **Step 1: 写服务层真实 PostgreSQL 回归**

覆盖：分页列表；详情含 revisions；version 冲突不改行；更新生成 `current+1` revision；回滚将选中 revision 的 `prefix/seq_width/reset_mode` 作为新版本应用；旧 revision 原样保留；非法配置拒绝；规则不存在显式 404。

- [ ] **Step 2: 实现 DTO 与配置校验**

`UpdateNumberRuleRequest { prefix: String, seq_width: i32, reset_mode: String, version: i32, change_reason: String }`；`RollbackNumberRuleRequest { revision_id: i32, version: i32, change_reason: String }`。校验前缀 trim 后非空且不超过 50 字符，位数 1..=12，周期三值，原因 trim 后非空且不超过 500 字符。

- [ ] **Step 3: 实现行锁与版本冲突**

更新/回滚均开启事务，`find_by_id(id).lock_exclusive().one(&txn)`；请求 `version` 与当前不等时返回 `AppError::business_displayable("编码规则已被其他用户修改，请刷新后重试")`。成功时 `version = current + 1`，先写新 revision，再通过 `AuditLogService::update_with_audit` 更新规则，最后提交。任一步失败整体回滚。

- [ ] **Step 4: 实现回滚语义**

按 `revision_id + rule_id` 查询目标快照，解析 `config` 为 `RuleConfig`，走同一更新函数；`change_reason` 使用请求原因，`changed_by=actor_id`。不删除、不修改目标历史 revision。

- [ ] **Step 5: 静态验证并提交**

运行 Rust 2024 rustfmt 与 `git diff --check`，提交 `feat(number-rules): 支持编码规则版本更新与回滚`。

### Task 4: 暴露管理 API 与权限键

**Files:**
- Create: `backend/src/handlers/system_number_rule_handler.rs`
- Modify: `backend/src/handlers/mod.rs`
- Modify: `backend/src/routes/system.rs`
- Modify: `backend/src/routes/mod.rs`（仅当系统域未统一 nest 时）
- Test: `backend/tests/system_number_rule_api_test.rs`

**Interfaces:**
- Produces: `GET /system/number-rules?page=&page_size=`。
- Produces: `GET /system/number-rules/{id}`。
- Produces: `PUT /system/number-rules/{id}`。
- Produces: `POST /system/number-rules/{id}/rollback`。
- Consumes: Task 3 的服务与 DTO。

- [ ] **Step 1: 写 API 契约测试**

断言统一 `ApiResponse` 信封与 `PaginatedResponse{items,total,page,page_size}`；GET 列表/详情、PUT 更新、POST 回滚；version 冲突返回可外显业务错误；未登录与无 `system:number-rules:read/update` 权限均拒绝。

- [ ] **Step 2: 实现 handler**

按现有 `Extension<AuthUser>` 与服务注入范式取 `actor_id`；handler 只做参数提取、调用服务与响应封装，不重复实现校验。路径参数使用 `Path<i32>`，列表查询使用 `Query<PaginationQuery>`。

- [ ] **Step 3: 注册相对路由**

在 `routes/system.rs` 新增 `pub fn number_rules() -> Router<AppState>`，只写相对路径 `/system/number-rules...`，并在 `routes()` 中 `.merge(number_rules())`。若 `routes/mod.rs` 已对 `system::routes()` 做统一 nest，则不再加绝对前缀。

- [ ] **Step 4: 校验权限推导**

确认 `middleware/permission.rs` 对路径推导出 `system:number-rules:read/update`；POST rollback 的 action 为 `update`。如现有 action 推导不覆盖 rollback，使用路由查询参数或现有 action 映射范式补齐，不新造鉴权旁路。

- [ ] **Step 5: 静态验证并提交**

运行 Rust 2024 rustfmt、`git diff --check` 与前端 `route-snapshot.mjs --check`，提交 `feat(number-rules): 暴露编码规则管理接口`。

### Task 5: 实现前端编码规则页

**Files:**
- Create: `frontend/src/api/system-number-rule.ts`
- Create: `frontend/src/views/system/number-rules/index.vue`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/constants/permissions.ts`
- Modify: `frontend/src/locales/zh-CN.ts`
- Modify: `frontend/src/locales/en-US.ts`
- Test: `frontend/e2e/system/586-number-rules.spec.ts`

**Interfaces:**
- Produces: `NumberRuleDto`、`NumberRuleRevisionDto`、`UpdateNumberRulePayload`、`RollbackNumberRulePayload`。
- Produces: `listNumberRules/getNumberRule/updateNumberRule/rollbackNumberRule` 四个请求函数。
- Consumes: Task 4 的 API。

- [ ] **Step 1: 写浏览器 E2E 骨架**

`586-number-rules.spec.ts` 使用真实登录与 PostgreSQL：管理员读取规则、修改 `SO` 前缀/位数/周期、创建销售订单读回新号；普通角色直接调用 API 被拒绝；回滚后新号恢复；旧单号保持不变。禁止 mock 与网络拦截。

- [ ] **Step 2: 实现 API 封装**

复用 `api/request.ts`；列表返回 `PaginatedResponse<NumberRuleDto>`，详情返回 `{ rule, revisions }`。路径只写 `/system/number-rules...`，不重复 `/api/v1/erp`。

- [ ] **Step 3: 实现页面**

使用现有系统设置页面容器与 `V2Table`/`ElDialog`/`ElForm` 范式：列表展示规则键、名称、前缀、位数、周期、版本、更新时间；编辑弹窗包含前缀、1..12 位数、三值周期、版本与原因；详情抽屉展示 revision 时间线；回滚使用 `ElMessageBox` 二次确认。保存成功后刷新列表与详情，失败不关闭弹窗。

- [ ] **Step 4: 接入路由、权限与 i18n**

路由 meta 使用 `system:number-rules:read`，编辑与回滚按钮使用 `v-permission="'system:number-rules:update'"`；在 `PERMISSIONS` 增加两枚常量。中英文案成对补齐，页面无裸中文字符串。

- [ ] **Step 5: 静态验证并提交**

运行 prettier、eslint、`vue-tsc -b --force`、Playwright `--list`、`check-i18n`、契约/API/路由门，提交 `feat(number-rules): 新增编码规则配置页`。

### Task 6: 全量静态复核与 CI 收口

**Files:**
- Modify: 本计划与设计文档中与实际实现不一致之处（仅事实校正，不写变更流水账）。

- [ ] **Step 1: 后端逐字段核对**

对照实体、迁移 DDL、DTO、handler 响应检查 snake_case 字段与可空性；确认无新增表列遗漏、无 `Option` 掩盖 NOT NULL、无缓存导致配置延迟。

- [ ] **Step 2: 前端全量静态门**

从 `frontend/` 运行 prettier、eslint、`vue-tsc -b --force`、Playwright 收集、`check-i18n`、`check-contract`、`check-api-paths`、`check-api-envelope`、`check-api-request`、`check-route-mount`、`route-snapshot --check`、`check-e2e-types`。

- [ ] **Step 3: 独立复审**

派只读复审专家核对：迁移链尾可执行、版本冲突、回滚追加、revision 不可变、生成器事务锁、权限键、E2E 真实性。未获得独立 Go 不计作通过。

- [ ] **Step 4: 推送并监控完整 CI**

更新 PR 正文后普通推送；只认当前 40 位 head 的 `CI/CD Pipeline - 严格构建验证 + 全面日志`。红项拉当前 head 日志、定根因、修复、静态验证后再推。

- [ ] **Step 5: 全绿合并与台账收口**

完整 CI 全绿后回读 run/jobs、PR head/ref、工作树与提交状态，squash 合并、删远端分支、回读主线证据，并把 DC-014 编码规则纵切标记为已闭环。
