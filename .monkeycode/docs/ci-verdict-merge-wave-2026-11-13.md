# CI 判红与合并波次 2026-11-13

## 一、五支在途 PR 实测状态（全量分页 check-runs 取证，head sha 口径）

| PR | head | base | mergeable_state | 全量面结论分布 | 定性 |
|---|---|---|---|---|---|
| #1207 | 007b33c2a | d5071f6d5 | clean | 88 格：85 success + 3 skipped | 全绿可合 |
| #1213 | 14ddd6d3b | a3378d3c | clean | 88 格：85 success + 3 skipped | 全绿可合 |
| #1216 | 36200478a | a3378d3c | clean | 88 格：85 success + 3 skipped | 全绿可合（功能面 HTTP 幂等，含迁移 m0137） |
| #1209 | 71e719391 | e7b3ef822（主干顶） | unstable | 收敛中，剩余红全为 runner 工装抖动 | 非本支代码红，待工装重跑 |
| #1214 | e822666a9 | a3378d3c | unstable | 收敛中，唯一红为安卓 APK 工装红 | 非本支代码红，待工装重跑 |

## 二、#1209 与 #1214 的红因逐条归因（带 job 日志原文）

#1209 三枚红：

1. `🏗️ Rust 后端构建`（job 131813731305）。日志尾部原文：2646 行已在编译 `bingxi_backend` 的 `src/lib.rs`（permission.rs 所在库目标），2647 行 `sccache: warning: The server looks like it shut down unexpectedly, compiling locally instead`，2650-2651 行 `sccache: error: Connection to server timed out ... kind: ConnectionRefused, tries: 11`，2652 与 2657 行分别 `error: could not compile bingxi-backend (bin "server")` 与 `(bin "bingxi")`，其 `Caused by` 均为 `process didn't exit successfully: sccache ... rustc ...`，2661 行 `Process completed with exit code 101`。全 2729 行日志无任何 `error[E0000]` 类型错，库目标在 sccache 崩溃前已通过。定性：sccache 守护进程崩溃导致 rustc 包装器不可达的 runner 工装瞬时抖动，非 permission.rs 造成的真编译错。
2. `🚨 E2E 真实性门禁`（job 131825053597）。构建红使下游门禁判负，属第 1 枚的连带，非独立缺陷。
3. `📱 安卓客户端 APK`（job 131813731365）。已知共享上游工装红（runner 镜像取包超时），与本支改动面无因果。

#1214 唯一红：

1. `📱 安卓客户端 APK`（job 131813692703）。同一枚共享上游工装红。该支 Rust 后端构建为绿，证明 4 枚源码改动（customer_ops/crud.rs、product_ops/color.rs、product_ops/crud.rs）编译通过。

## 三、505 与 501 两处测试面修法（本波已推，落绿判据）

- #1214 的 505 客户编码唯一性用例：删除回读由「断硬删 404」改为「断软删 status 落 inactive」，对齐 `customer_ops/crud.rs:194` 的 `delete_customer` 软删契约（status 置 master_data::INACTIVE，对象口仍 200 可读回）。
- #1209 的 501-03 审批超时提醒用例：`send-pending` 出参由 `number` 断言改为 `ReminderSendResult{sent_count, threshold_hours}` 对象断言，对齐 `bulk_color_approval_handler.rs:218` 与 `:742` 的真实返回类型；两腿各自校验对象形状后再取证。批色单回收的 404 回读保持不变（`bulk_color_approval_service.rs:491` 的 delete 是真实硬删）。

## 四、合并波次序建议（若执行）

次序 #1207 到 #1213 到 #1216：先落两枚纯测试面（单文件，互不交集），最后落会追加迁移链尾 m0137 的功能支 #1216，避免其前移主干后把仍在收敛的 #1209/#1214 再次顶成 dirty。#1209/#1214 待工装红重跑收敛到全绿后并入。

## 五、留待动作

- 合并到主干按本项目口径由用户在 UI 执行（squash 或 rebase，规则集 19616110 要求线性历史，零必需状态检查）。
- #1209/#1214 两支完整 88 格面此刻仍在收敛，不对其当前 head 发起 job 重跑，以免打断在跑的 run；待本轮 run 落定后据实际红位再决定是否只对工装 job 原地重跑。
- 本地 main 相对远端主干顶落后，需在任何主干侧动作前先并基核对。

## 六、下午实测更正与处置落定（13:07 到 13:16 取证）

### 6.1 开放面实测（认证 API 全量分页 check-runs）

上午文档写的五支只剩三支：#1207、#1213、#1216 已由用户合入，主干顶前进到
8ab81cf00（#1216 的 squash）。三支实测：

| PR | head | base | 面 | 定性 |
|---|---|---|---|---|
| #1217 | 0eefab1d2 | 8ab81cf00（主干顶） | 88 格 85 success 3 skipped，clean | 全绿可合 |
| #1214 | e822666a9 | a3378d3ca（旧） | 88 格 82 success 4 skipped 2 failure | 2 红均为非本支代码红 |
| #1209 | 71e719391 | e7b3ef822（旧） | 30 格 17 success 9 skipped 4 failure | 4 红均为非本支代码红或连带 |

#1209 只物化 30 格的原因是构建红使下游 E2E 分片整片 skipped，属快档形态，
不能据 fail 计数直接外推全量面。

### 6.2 红因更正：安卓 APK 红不是取包超时

上午记的「runner 镜像取包超时」被日志证伪。两支安卓 job 的真实拒因逐字相同：
Gradle configuration cache 序列化失败，`:app:processUniversalDebugNavigationResources`
任务的 `__runtimeDependenciesNavigationFiles__` 字段 error writing value，
`Configuration cache entry discarded due to serialization error`，两次内建重试同错。

判环境漂移瞬时故障而非配置或代码缺陷的证据链：同一主干配置下，#1216 的安卓
job 在 07:00 同样先撞序列化失败、内建重试第二次成功；#1217 的安卓 job 在
11:25 干净通过（Configuration cache entry stored）。三支的 mobile-app 与
workflow 文件在各自 base 与主干顶之间零改动（git log 按路径核实）。

#1209 的 Rust 构建红确认为 sccache 守护进程崩溃：日志 2648 行 server shut down
unexpectedly，2651 行 Connection refused 重试 11 次，2653 行起 bin 目标失败，
全程无任何 error[E0xxx] 类型错，库目标在崩溃前已通过。E2E 真实性门禁红是
ci-e2e 结论=skipped（E2E 根本没执行）的连带，收尾清理为聚合器。

### 6.3 已执行处置（按目标「CI 全绿后授权自动合并」「所有红标问题必须修复」）

- #1217 已按 88 格全绿面执行 squash 合并，PR state=closed merged=true，
  主干顶 8ab81cf00 → 8cf2e3b49（merge_commit 回读证实）。
- #1209 的 run 43403970774 已发 rerun-all（201 受理），attempt 2 in_progress。
  选全量重跑而非只重跑失败 job，因其面只物化 30 格，构建红让 E2E 整片 skipped，
  需要重铺全量面。
- #1214 的 run 43403966399 先发 rerun_failed_jobs 得 404，改发 rerun-all
  返回 502 但回读 run 已 in_progress attempt 2（网关抖动，操作实际已受理，
  未重发以免撞并发）。其面 88 格完整，仅安卓与聚合器两枚红。
- 两个旧 run 在重发时均为 completed 状态，无在跑 run 被挤。

### 6.4 后续判据

- 两 run attempt 2 收口后：全绿且 clean 即按目标授权合并；若安卓红复现且
  同错再现两次以上，升级为工装确定性缺陷，改走关 configuration cache 的
  主干侧最小解锁支，不再原地重跑。
- 判据与日志落盘 E:/logs/ci/2026-11-13/（六枚红 job 全量日志）。
