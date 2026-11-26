# 审批超时自动转交 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **执行状态（2026-11-26）：** 实现、真实 PostgreSQL 回归、浏览器 E2E 与本地静态门已完成；运行期 GREEN、独立复审和 PR/CI 收口待完成。独立复审通道返回 403、零工具调用，不计作通过。项目禁止本地 Cargo/Playwright 实跑，原 RED 步骤不再补做，改由当前 head 的完整 CI 同时证明编译与运行期行为。

**Goal:** 为 BPM `user_task` 节点增加可配置的超时策略，任务到期后在同一事务内自动转交给指定用户，并保留审计、通知和会签/或签轨迹。

**Architecture:** 超时策略在流程节点 `config.nodes[]` 中声明，建单时校验并快照到 `bpm_task.task_variables`，同时写入已有 `due_date` 列。统一 Scheduler 每分钟扫描到期待办，逐任务行锁复查后更新处理人、清空到期时间并写审计；提交后再通知新处理人。不新增表或 CI job。

**Tech Stack:** Rust 2024、SeaORM 2、PostgreSQL、Tokio、Vue 3/TypeScript、Playwright。

**Spec:** `.monkeycode/docs/defect-closure-board-2026-11-19.md` 的 DC-011，以及目标 4.6、4.21、4.30、4.41。

## Global Constraints

- 禁止本地 `cargo build/test`、禁止启动 dev server、禁止本地实际运行 Playwright。
- 所有编译与运行期验证走完整 CI；本地只运行允许的格式、lint、类型、路由与用例发现检查。
- E2E 必须使用真实后端和真实 PostgreSQL，禁止 mock、网络拦截和假响应。
- 禁止兜底默认值掩盖缺键、非法配置或失败；成功与失败均需明确日志。
- 状态词表以写入方为准：`pending/completed/rejected/cancelled` 均小写。
- 不修改 `.github/workflows/ci-cd.yml` 或其他 workflow。
- 每个独立根因一笔 Conventional Commit，scope 必填，显式路径暂存。
- 基线树已核对为 `263ae2e7ba46b93e10b184f1517bf68b196c90f0`，与主线合并提交 `d9a61f635b4ab48b652974fe97c26f8aab40bb8a` 完全一致。

---

### Task 1: 节点超时策略与建单到期快照

**Files:**

- Create: `backend/src/services/bpm_ops/timeout.rs`
- Modify: `backend/src/services/bpm_ops/mod.rs`
- Modify: `backend/src/services/bpm_ops/instance.rs:121-215`
- Modify: `backend/src/services/bpm_ops/task.rs:600-691`
- Modify: `frontend/src/api/bpm-enhanced.ts:31-64`
- Create: `backend/tests/bpm_timeout_policy_test.rs`

**Interfaces:**

- Produces:
  ```rust
  pub(crate) struct TimeoutPolicy {
      pub after_seconds: i64,
      pub transfer_to_user_id: i32,
  }
  pub(crate) fn node_timeout_policy(
      node: &serde_json::Value,
  ) -> Result<Option<TimeoutPolicy>, AppError>;
  pub(crate) fn apply_timeout_snapshot(
      variables: serde_json::Value,
      policy: Option<&TimeoutPolicy>,
      now: chrono::DateTime<chrono::Utc>,
  ) -> Result<(serde_json::Value, Option<chrono::DateTime<chrono::Utc>>), AppError>;
  pub(crate) async fn validate_timeout_target(
      txn: &sea_orm::DatabaseTransaction,
      policy: &TimeoutPolicy,
  ) -> Result<(), AppError>;
  ```
- 节点配置形状：
  ```json
  {
    "id": "manager",
    "type": "user_task",
    "name": "主管审批",
    "assignee_value": 12,
    "timeout": {
      "after_seconds": 3600,
      "transfer_to_user_id": 18
    }
  }
  ```

- [x] **Step 1: 写真实 PostgreSQL 失败回归**

创建 `bpm_timeout_policy_test.rs`，复用 `test_common::setup_test_db()`。至少覆盖：

```rust
#[tokio::test]
async fn start_process_snapshots_timeout_and_due_date() {
    // 造 start -> user_task(timeout=3600, transfer_to_user_id=fallback) -> end
    // start_process 成功后查询唯一 task：
    // assert due_date.is_some()
    // assert task_variables["timeout"]["after_seconds"] == 3600
    // assert task_variables["timeout"]["transfer_to_user_id"] == fallback_id
    // assert task_variables["timeout"]["transfer_count"] == 0
}

#[tokio::test]
async fn start_process_rejects_invalid_timeout_without_residue() {
    // after_seconds=0、负数、超过 31536000、transfer_to_user_id 不存在或停用，
    // 均返回 ValidationErrorDisplayable，并断言实例、任务、审计、通知零新增。
}
```

- [ ] **Step 2: 在 CI 验证 RED**

运行完整 CI 中的该集成测试分片。预期因 `timeout` 模块/接口不存在或 `due_date` 未写入而失败；记录失败 job、断言原文和 head SHA。本地禁止运行 Cargo 测试。

- [x] **Step 3: 实现策略解析与快照**

`timeout.rs` 只允许正整数 `after_seconds`，上限 `31_536_000`；`transfer_to_user_id` 必须为正整数。`apply_timeout_snapshot` 保留已有 `sign_mode/signatures/add_signs`，写入：

```json
{
  "timeout": {
    "after_seconds": 3600,
    "transfer_to_user_id": 18,
    "transfer_count": 0
  }
}
```

使用 `now.checked_add_signed(chrono::Duration::seconds(...))`，溢出返回可外显校验错误。无 `timeout` 时保持原变量形状与 `due_date=None`。

- [x] **Step 4: 首任务和下一节点任务共用快照**

在 `create_first_task` 与 `create_next_user_task` 中，先调用 `node_timeout_policy`；配置存在时调用 `validate_timeout_target` 核验目标用户存在且启用，再对每个处理人的变量调用 `apply_timeout_snapshot`；`due_date` 写返回值。会签/或签每枚工单独立快照，签署轨迹不得被覆盖。

- [x] **Step 5: 前端契约补齐**

`frontend/src/api/bpm-enhanced.ts` 增加：

```ts
export interface ProcessNodeTimeout {
  after_seconds: number;
  transfer_to_user_id: number;
}
export interface ProcessNode {
  // 现有字段保持不变
  timeout?: ProcessNodeTimeout;
}
```

- [ ] **Step 6: CI 验证 GREEN 并提交**

确认两个集成测试通过、原有 BPM 发起与推进用例不回归。提交：

```bash
git add backend/src/services/bpm_ops/timeout.rs backend/src/services/bpm_ops/mod.rs \
  backend/src/services/bpm_ops/instance.rs backend/src/services/bpm_ops/task.rs \
  backend/tests/bpm_timeout_policy_test.rs frontend/src/api/bpm-enhanced.ts \
  docs/superpowers/plans/2026-11-26-approval-timeout-transfer.md
git commit -m "feat(bpm): 快照审批节点超时策略"
```

### Task 2: 事务化超时转交、审计、通知与 Scheduler

**Files:**

- Create: `backend/src/services/bpm_timeout_scheduler.rs`
- Modify: `backend/src/services/bpm_ops/mod.rs`
- Modify: `backend/src/services/bpm_ops/mod.rs:435-484`
- Modify: `backend/src/bootstrap/service_bootstrap.rs:876-990`
- Create: `backend/tests/bpm_timeout_transfer_test.rs`

**Interfaces:**

- Produces:
  ```rust
  pub struct ApprovalTimeoutScheduler {
      db: std::sync::Arc<sea_orm::DatabaseConnection>,
  }
  impl ApprovalTimeoutScheduler {
      pub fn new(db: std::sync::Arc<sea_orm::DatabaseConnection>) -> Self;
      pub async fn transfer_due_tasks(&self) -> Result<i64, crate::utils::error::AppError>;
  }
  ```
- Scheduler 名称：`bpm_approval_timeout_transfer`；间隔 60 秒；初始延迟 30 秒；每批最多 100 条。

- [x] **Step 1: 写真实 PostgreSQL 失败回归**

覆盖以下独立用例：

```rust
#[tokio::test]
async fn due_pending_task_transfers_once_with_audit() { /* 到期转交、due_date 清空、transfer_count=1 */ }

#[tokio::test]
async fn future_task_is_not_transferred() { /* 未到期保持原处理人 */ }

#[tokio::test]
async fn repeated_scan_is_idempotent() { /* 连跑两次只有一次处理人变化与一条更新审计 */ }

#[tokio::test]
async fn completed_task_is_not_transferred() { /* 非 pending 不转 */ }

#[tokio::test]
async fn countersign_transfer_preserves_signatures() { /* 会签变量原样保留 */ }

#[tokio::test]
async fn inactive_transfer_target_rejects_without_partial_write() { /* 停用目标拒绝且任务原样 */ }
```

断言必须回读 `bpm_task` 与 `omni_audit_logs`：`old_value.actual_handler_id` 为原处理人，`new_value.actual_handler_id` 为目标处理人，`new_value.due_date` 为 `null`，`new_value.task_variables.timeout.transfer_count` 为 1。通知按 `user_id + dedup_key` 回读，且内容包含“超时转交”。同一文件多个用例共用会清库的 `setup_test_db()`，因此合并为一个顺序测试或使用测试级互斥锁，禁止并行清库。

- [ ] **Step 2: 在 CI 验证 RED**

预期 Scheduler 或服务不存在，测试编译失败；记录 job 与断言。确认失败原因是功能缺失，不是夹具或类型错误。

- [x] **Step 3: 实现逐任务事务转交**

扫描条件：

```rust
bpm_task::Column::Status.eq(task_status::PENDING),
bpm_task::Column::DueDate.lt(now),
```

每条任务单独事务，使用 `find_by_id(task_id).lock_exclusive().one(&txn)`，锁内再次校验 pending 与 `due_date <= now`。从 `task_variables.timeout` 读取快照；目标用户必须存在且 `is_active=true`。更新：

```rust
active.actual_handler_id = Set(Some(target.id));
active.actual_handler_name = Set(Some(target_name));
// 不改 assignee_ids/assignee_names：会签完成条件依赖原签署人集合，
// 转交只替换当前工单的实际处理人，不得把会签误判为一人通过。
active.approval_opinion = Set(Some(format!("[超时转交] 原处理人 {} 超时未处理", old_name)));
active.due_date = Set(None);
active.updated_at = Set(Some(now));
active.task_variables = Set(Some(vars_with_incremented_transfer_count));
AuditLogService::update_with_audit(&txn, "bpm_task", active, None).await?;
txn.commit().await?;
```

不写 `handled_at`，不改变任务状态。任何一步失败整体回滚并记录 `task_id/instance_id/error`。单条失败不吞掉：继续处理本批其余任务，累计错误后在 `run_once` 返回 `Err`， scheduler 执行历史可见失败。

- [x] **Step 4: 提交后通知**

扩展 `notify_task_pending` 的 dedup key：普通工单保持 `bpm_task:{id}:pending`；`transfer_count > 0` 使用 `bpm_task:{id}:pending:transfer:{count}`。转交原因传“审批超时自动转交”，避免五分钟去重窗口吞掉转交通知。

- [x] **Step 5: 注册统一 Scheduler**

在 `start_registered_schedulers` 注册：

```rust
registry.register(std::sync::Arc::new(
    crate::services::bpm_timeout_scheduler::ApprovalTimeoutScheduler::new(
        app_state.db.clone(),
    ),
) as std::sync::Arc<dyn Scheduler>);
```

`run_once_counted` 返回实际转交条数；不新增 workflow job。

- [ ] **Step 6: CI 验证 GREEN、独立复审并提交**

运行完整 CI，确认六类回归和原有会签/或签/转办用例通过。独立复审重点查行锁、幂等、审计事务、通知去重和多人签署轨迹。提交：

```bash
git add backend/src/services/bpm_timeout_scheduler.rs backend/src/services/bpm_ops/mod.rs \
  backend/src/bootstrap/service_bootstrap.rs backend/tests/bpm_timeout_transfer_test.rs
git commit -m "feat(bpm): 定时转交超时审批任务"
```

### Task 3: 浏览器 E2E 与契约回归

**Files:**

- Create: `frontend/e2e/bpm/585-approval-timeout-transfer.spec.ts`
- Modify: `frontend/e2e/bpm/03-approval-e2e.spec.ts`（仅在现有契约断言需同步时修改）

**Interfaces:**

- 使用真实 API：`POST /bpm/definitions`、`POST /bpm/process/start`、`GET /bpm/tasks/pending`、`POST /bpm/tasks/approve`、`GET /bpm/instances/{id}/chain`。
- 通过 PostgreSQL 测试夹具把 `due_date` 设为已过期或未来，禁止页面等待真实小时。

- [x] **Step 1: 写 E2E 失败用例**

浏览器端到端主链路一条：自建会签处理人、第二签署人与超时转交目标，配置一秒超时，等待统一调度器真实转交；断言原任务席位不变、到期时间清空、转交次数与委托落库，代理人可进入审批页并签署，另一签署人同意后实例完成。未来任务、已完成任务、停用目标、加签继承截止时间和人工转办优先级由真实 PostgreSQL 回归覆盖。

所有造数按唯一业务号清理，失败行也执行清理；不使用 mock、页面路由拦截或假响应。

- [ ] **Step 2: CI 验证 RED 与 GREEN**

先推测试到 CI，确认因功能未实现而失败；实现后再次运行完整 CI，确认三条用例通过且未新增 E2E 类型棘轮错误。

- [x] **Step 3: 静态检查并提交**

```bash
npx prettier --check e2e/bpm/585-approval-timeout-transfer.spec.ts src/api/bpm-enhanced.ts
npx eslint e2e/bpm/585-approval-timeout-transfer.spec.ts src/api/bpm-enhanced.ts
npx vue-tsc -b --force
npx playwright test --list e2e/bpm/585-approval-timeout-transfer.spec.ts
node scripts/check-i18n.mjs
node scripts/check-contract.mjs
node scripts/check-api-paths.mjs
node scripts/check-api-envelope.mjs
node scripts/check-api-request.mjs
node scripts/check-route-mount.mjs
node scripts/route-snapshot.mjs --check
git diff --check
```

提交：

```bash
git add frontend/e2e/bpm/585-approval-timeout-transfer.spec.ts frontend/src/api/bpm-enhanced.ts
git commit -m "test(bpm): 覆盖审批超时自动转交"
```

### Task 4: 收口、PR 与 CI

- [x] 逐笔核对提交序列，确保每个根因独立、scope 必填、无 CI workflow 改动。
- [x] 跑 Rust 2024 `rustfmt --check`、前端静态门、`git diff --check`，记录输出。
- [ ] 更新 `.monkeycode/docs/defect-closure-board-2026-11-19.md`：DC-011 仅保留已验证闭环证据；若完整 CI 未终态成功，状态保持“验证中”。
- [ ] 普通推送到 `feat/approval-timeout-1126`，不 force；推送前更新 PR 正文，推送后双重回读。
- [ ] 完整 CI 终态成功且 88 岗无失败/取消后，才允许 squash 合并并删除分支。
- [ ] 合并后回读 `merge_commit_sha`、`main` 顶点、分支 404，并将 DC-011 的验证证据补入主线台账。

## Self-Review

- 策略解析、建单快照、扫描转交、审计通知、E2E、CI 收口均有对应任务。
- 未新增数据库列；复用已有 `due_date/task_variables`。
- 多人签署只改当前到期工单，不清空 `signatures/add_signs`。
- 运行期红绿由 CI 证明，本地不越过仓库禁止的构建与测试边界。
