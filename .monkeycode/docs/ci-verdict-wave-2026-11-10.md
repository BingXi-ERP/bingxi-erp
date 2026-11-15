# 七支在途 CI 收口实测裁定 2026-11-10

本文更正 `main-unblock-wave-2026-11-10.md` 第六节与已终止监控任务 `b0yeff6eu` 输出里
「七支 run 长期 queued/pending、等待监控收口」的判断。只记实测事实与判责，不复述凭据。

## 一 结论先行

七支 run **已全部收口**，不是排队。四支 Success、三支 Failure。
旧监控输出 21 轮 `done=0/7` 属失效读数；GitHub 匿名 API 已 403 限流、
`gh` 在本环境不可用，本次结论改由 Actions run 网页逐个读取，每支均取到
Status、总时长、job 数与触发 PR，不是推测。

## 二 逐支实测

| PR | run | 分支 | 结论 | 时长 | ci-e2e 分片 |
| --- | --- | --- | --- | --- | --- |
| #1182 | 42730808237 | feat/audit-terminal-context-fields | Failure | 3h20m7s | 45 |
| #1183 | 42728956939 | feat/quotation-over-discount-approval-gate | Success | 3h29m36s | 45 |
| #1184 | 42728964104 | refactor/remove-bom-by-flow-card | Failure | 3h33m42s | 45 |
| #1186 | 42728971283 | fix/invoice-precheck-d51 | Success | 3h7m41s | 45 |
| #1188 | 42729324601 | test/e2e-logistics-waybill-pairing | Success | 3h31m54s | 45 |
| #1189 | 42729568166 | ci/e2e-pairing-scheduled-ratchet | Success | 3h23m3s | 45 |
| #1190 | 42737503523 | fix/notification-entry-permission-same-source | Failure | 2h41m56s | 45 |

## 三 三支红的判责

**共享上游红（#1182 #1184）**：两支栽在同一枚用例 ——
`frontend/e2e/flow/108-sales-shipment-collection-depth.spec.ts:818:3`
「销售发货到收款深度链路 › 发货单打印件按档案名称出栏，主键不外显，同一单据两次渲染栏次逐字符一致」，
同一分片 `e2e/flow(3/20)`，分别 `68 passed / 1 failed` 与 `61 passed / 1 failed`，栈行同为 `:939:7`。
两支分支域（审计定位维度 / BOM 下线）与销售发货打印件无交集，按
`main-unblock-wave-2026-11-10.md` 第六节口径判主干侧共享上游红，走「主干侧最小解锁」，
不改两支自身源码。#1182 另有 `ci-test-rust` 的 `Rust 测试 (3/10)` exit 1，
页面未给断言正文，需单独拉该 job 日志定性。

**本支真红（#1190）**：`role-permission-matrix` 多角色失败 ——
after_sales_manager、salesperson、sales_manager、department_manager、dyeing_master 等，
统一落在 `traversal-44-role-matrix-P-*-登录-全模块三分支断言-access-map-生成-chromium`。
该支改动正是「公告发送门与前端权限键同源」，与权限矩阵同源，不能判共享上游红。
另有 `e2e-authenticity-guard` failure 属上游传播。

**下游传播（三支共有）**：`E2E 真实性门禁：上游 E2E job 状态 failure（非 success）`
与 `收尾清理` 的 exit 1 都是上游失败的结果，不是独立缺陷，不要按三处分别修。

## 四 两条假绿/噪声风险（登记，本轮不改代码）

一，`UI 操作失败（操作失败 0 + 登录失败 0 + 超时 N）` 注解几乎每个分片都有，
Success 的 #1183 也有 53 处。它不判红，是软告警；把它当失败根因会误判。
真正判红的是具体用例 `1 failed` 与 role-permission-matrix 的 exit 1。

二，`E2E 真实性门禁` 里两条检查被记 SKIP：
「零断言用例点名记 SKIP（数据缺失）」「空片与用例总数对账记 SKIP（数据缺失）」。
跳过不等于通过（配对门 `e2e-pairing.yml` 第 112-115 行对自家门也是这个口径）。
该门当前存在数据缺失，应登记为存量漏测疑点，不能拿它的绿当真实性证明。

## 五 本地可闭环的遗留项

- **配对门已落地**：`.github/workflows/e2e-pairing.yml` 触发面覆盖 backend 路由/handler、
  `frontend/e2e`、路由快照、判定器与基线台账；先跑九道反向自证，基线只认分支起点提交，
  取不到起点时显式 notice「本道结论不算通过」。目标「新增功能必须配套 E2E 用例」已可执行。
- **覆盖缺口批一未推**：车道 `wt-inv-write-b1`（分支 `test/e2e-inventory-write-face-batch1`）
  工作树干净且 `ahead 2`，两枚 spec 实路径为
  `frontend/e2e/flow/483-inventory-batch-write-face.spec.ts`（5 test / 52 expect）与
  `frontend/e2e/flow/484-inventory-transfer-items-write-face.spec.ts`（4 test / 45 expect）。
  `git ls-remote --heads origin` 中无该分支，远端主线仍为 `9389e189c`（与分支基点一致，无需 rebase）。
  推成第八支 PR 的前置条件已具备。
- **小程序专项门禁未确认**：按关键词粗查 `.github/workflows/*.yml`，未见小程序专属的
  打包/依赖/语法/包大小四项校验（`ci-cd.yml` 仅 2819 行有「发布包大小」输出，
  `esbuild --bundle` 在 3686 行是 e2e 辅助脚本装配）。需逐文件复核后补齐，
  本轮不作「已落地」结论。

## 六 下一步判据

1. 三支红按判责分流：共享上游红走主干侧最小解锁，本支真红修 #1190 权限键同源。
2. 修复必须本地轻校验 + 推 CI 复跑全绿，再授权合并；合并仍只由用户在 UI 做。
3. 不要再以 `b0yeff6eu.output` 的 queued 读数判断在途状态；以 run 网页 Status 为准。
