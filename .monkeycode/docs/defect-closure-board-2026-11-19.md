# 缺陷与功能补齐闭环看板（2026-11-19）

口径来源：本看板按目标第七、八章建立，是当前缺陷/功能补齐工单的唯一可视化入口。每条工单标注类型（Bug 缺陷 / 功能补齐）、优先级（P0/P1/P2）、状态、准入证据、关联 E2E 用例或 PR。状态流转遵循 7.3：新建 → 待评估 → 待开发 → 开发中 → 待测试 → 验证中 → 已关闭 / 搁置，不允许跳步。事实以本仓与远端 PR 现状为准，凡与早期报告冲突以本看板实量结论为准。

## 一、状态看板（P0 置顶）

### 验证中

| 编号 | 类型 | 优先级 | 标题 | 准入证据 | 关联用例 / PR | 负责人 |
|------|------|--------|------|----------|---------------|--------|
| DC-001 | 功能补齐 | P1 | 小程序接口层客户越权 E2E 用例集 | miniprogram/ 有工程但 6 条独有链路零 E2E，仅 7 道静态门（completion audit 实量） | `frontend/e2e/miniprogram/01-customer-access.spec.ts` / PR #1320 | 测试 |
| DC-002（第一批） | 功能补齐 | P1 | 写操作参数篡改 IDOR（目标 4.1-P / 3.6） | 现有 data-scope-isolation 仅覆盖读越权；换他人 ID 改金额 0.01、DELETE 他人单据的写越权为真实缺口 | `frontend/e2e/miniprogram/02-write-idor.spec.ts` / PR #1320（head fcff7e120） | 测试 |
| DC-003 | 功能补齐 | P1 | 统一测试数据工厂 builder API | 代码已交付：`frontend/e2e/factory/test-data-factory.ts` 聚合客户/线索/色卡原子造数、自动追踪 id、LIFO 统一回收；`data-factory.spec.ts` 为真实消费者（造数→按 id 回读→cleanup）。字段照抄已验证端点，不自造键 | 载体分支 `test/data-factory-1119`（commit `114e0fb`）已推送保工；本地 prettier/eslint/`playwright --list`、配对门 `PAIRING_GREEN`、api-paths 门均绿；待 CI 队列消化后开 PR、全量绿且合入 main 再关单 | 测试 |
| DC-015 | Bug 缺陷 | P1 | 小程序门户应收余额与订单收付款字段失真 | PR #1397 已把订单列表/详情改为按绑定客户与订单号聚合有效 AR 净额，dashboard 直接汇总绑定客户有效应收；`653-customer-portal-receivable-consistency.spec.ts` 覆盖部分收款、取消红冲、重新发货、作废、分页与他户隔离 | `frontend/e2e/flow/653-customer-portal-receivable-consistency.spec.ts` / PR #1397；当前全量 CI 验证中，以 PR 当前 head 为准 | 后端 / 测试 |

验收标准（7.4）：客户角色越权访问 5 个内部单据端点（sales/orders、products、ar-reconciliations、crm/customers、purchase/orders）由后端返回 401/403；CI 全量面绿；不依赖前端按钮隐藏。事实核对已记入 PR #1320 描述（端点在 route-snapshot、权限码在册、不在 AUTH_ONLY、customer 可登录）。

DC-002 第一批验收标准（7.4）：两个不同 user_id 的 self 角色，跨 owner PUT 把他人线索金额改成 0.01、DELETE 他人线索，后端返回 403 固定脱敏信封并带字符串机器码；owner 回读金额仍为原值、记录仍在（实证未篡改）。后端承载体为 `update_lead`/`delete_lead` 的 `ensure_cross_owner_write_allowed` 写门（crm_handler.rs:719/753）。本地静态检查 prettier/eslint/playwright --list 全绿；CI run 44601446625（CI/CD）+ 44601446715（配对门）在新 head 物化 pending，待终态方可关闭。

### 待开发

| 编号 | 类型 | 优先级 | 标题 | 缺口证据 | 计划 | 负责人 |
|------|------|--------|------|----------|------|--------|
| DC-002（余项） | 功能补齐 | P1 | 询样/对账跨端互通与分享卡片可见性正向用例 | 第一批写 IDOR 已进验证中；远端树复核纠正假阴：`flow/431-customer-team-share-and-signature.spec.ts` 已覆盖 customer-shares 的 403+FORBIDDEN 统一机器码、by-user 通道只回读本人行且交叉互查不可见，在途 #1300 还有 531/532 小程序共享契约——"分享卡片越权负例空白"不成立，勿重复建设。真实余项收敛为询样提交/客户对账确认的**正向可见性**，受 DC-007 客户业务账号缺失约束 | 负例不重复建；正向待第一批 CI 终态且 DC-007 账号体系明确后同专支追加 | 测试 |
| DC-004 | 功能补齐 | P2 | 分环境预制脚本与独立库隔离 | 2026-11-26 复核：`playwright.config.ts` 仍写死 localhost；但 CI 45 个矩阵 job 各有独立 PostgreSQL service，旧“共用同库”结论作废。现有 `setup-wizard-real-env.sh` 支持换库与端口，缺统一环境入口及防误连非测试库门 | 复用 setup 脚本与 globalSetup，增加 `E2E_BASE_URL` 配置和 test 库名校验；无需修改 ci-cd.yml | 测试 / 运维 |
| DC-008（重开） | 功能补齐 | P1 | 联动影响矩阵 PR 门禁（4.41.N）——原误判已关闭，抽检证实未落地 | 2026-11-20 复核：#1306 与 #1352 均 closed/merged=false，但当前 #1351 head `5b86db36` 逐文件承载 `e2e-linkage-gate.yml`、`check-e2e-linkage-gate.mjs`、`check-e2e-linkage-gate.test.mjs`、`frontend/scripts/e2e-linkage-matrix.json`；ci-cd.yml 原文仍有 `ci-e2e-linkage` job、`check-e2e-linkage-gate.mjs --json --specs-out` 调用与收尾聚合器引用；main 尚未合入，对应任务 #41/#47 仍 in_progress | 兑现载体已验证为 fail-closed，不再以 report-only 工具关单；待 #1351 当前 head 全量 CI success 并合并后，blob 回读 main 再关单 | 测试 / CI |

| DC-011 | 功能补齐 | P1 | 审批引擎多人协作动作（会签/或签/超时自动转交，4.21） | 2026-11-26 主干复核：会签与或签已由 `d053c3a73` 闭环，`services/bpm_ops/task.rs:223-271` 分别实现全票通过与首票通过，E2E 为 `bpm/583-countersign-flow.spec.ts`、`584-orsign-addsign.spec.ts`。剩余缺口仅为超时自动转交：`monitor.rs:62-99` 仍只统计逾期，`task.rs:909-932` 只有人工转办 | 仅补超时策略与后备处理人、事务化定时扫描转交及待办归属 E2E；会签/或签不再重复建设 | 产品 / 开发 / 测试 |
| DC-012 | 功能补齐 | P1 | 会话安全能力（扫码登录/会话超时自动登出/多端互踢或并存策略/异地提醒/记住登录/单点登录切换组织/停用账号强制下线，4.20） | 2026-11-26 主干复核：多端并存与停用强制下线已闭环，见 `flow/530-multidevice-coexist-session.spec.ts`、`enhanced/420b-user-disable-session-revocation.spec.ts`；Cookie-only 登出吊销由 `122c6d90d2` 补齐。仍未完成：扫码票据、静置超时、记住登录、OIDC/SAML 与组织切换；异地仅多 IP 告警且 `location=None`，未形成真实异地通知 | 按剩余缺口分别实现二维码一次性票据、会话 last_active 滑动过期、remember_me、OIDC 回调与组织声明校验、IP 归属地及通知，并补边界 E2E；已闭环能力不重复建设 | 产品 / 开发 / 测试 |
| DC-014 | 功能补齐 | P1 | 通用系统配置与参数化能力（4.24） | 2026-11-26 主干复核：后端仍无通用 `/system/config` 路由与 system_config 表，`store/system.ts` 仍是空壳；编码生成器仅支持固定前缀/宽度，日期重置与预警阈值未统一配置化。已有可复用件为 number_generator、material_shortage_service、AuditLogService、权限失效 Pub/Sub 和 business_mode_config。410/469/577 只覆盖单点阈值与回放旧值，fullflow/30 实为部门链，不能证明 4.24 闭环 | 先做编码规则纵切：org_id/version 迁移、审计、生成器消费、新旧单 E2E；再逐步接仓库/币种/税率/预警阈值、缓存失效、多组织隔离、回滚和功能开关，禁空壳断言 | 产品 / 开发 / 测试 |

### 待评估

| 编号 | 类型 | 优先级 | 标题 | 判定要点 | 卡点 |
|------|------|--------|------|----------|------|

### DC-015 登记说明（2026-11-25）

- 根因：门户把销售订单的 `paid_amount/balance_amount` 当作应收事实源，但这两列不是 AR 流水投影。收款、核销及取消核销只更新 `ar_invoices.received_amount/unpaid_amount/status`；送货取消生成 `SALES_DELIVERY_CANCEL` 红字应收，也不更新 `sales_orders`。因此部分收款后门户仍显示零已收，取消红冲后仍显示原余额，dashboard 同步失真。
- 关联口径：原应收使用 `source_type=SALES_ORDER` + `source_bill_id=order.id`；取消红字使用 `source_type=SALES_DELIVERY_CANCEL` + `customer_id` + `sales_order_no=order.order_no`（`services/ar/inv.rs:248-259,293-306`）。门户聚合必须同时覆盖两类关联，并再次以绑定客户 ID 约束，不能仅凭订单号或来源 ID 跨客户取值。
- 修复边界：订单列表/详情按当前页订单批量聚合有效 `ar_invoices` 的 `received_amount/unpaid_amount`；有效状态排除 `DRAFT/CANCELLED`，负金额红字按原符号参与轧差。dashboard 直接汇总绑定客户全部有效 `ar_invoices.unpaid_amount`，不复用订单分页结果，也不再把 `sales_orders.balance_amount` 当应收事实源。保持现有 JSON 键 `paid_amount/balance_amount/receivable_balance` 及 Decimal 字符串契约，避免无关前端契约变更。
- 回归设计：使用真实 PostgreSQL 与门户 API，双客户造数；本户走“发货生成应收→应收审核→部分收款→取消红冲→重新发货”，每个节点回读订单列表、订单详情与 dashboard，断言已收/未收精确轧差；他户使用显著不同金额，断言门户列表、详情 404、dashboard 均不包含他户金额。补 `DRAFT/CANCELLED` 不计入、负红字计入、分页不改变 dashboard 口径的边界断言。
- 已知阻断：当前取消送货单门明确拒绝已收款应收（`services/ar/inv.rs:337-346`，`tests/sales_delivery_cancel_ar_test.rs:425-475` 已有真实回归）。因此“部分收款后直接取消红冲”按现状不能跑通；实施时须先按既有业务门取消核销/资金回退至 `received_amount=0` 再红冲，或由产品另行批准取消策略，不能通过改测试或放宽门户聚合来掩盖。
- 当前处置：PR #1397 已实现订单列表/详情按有效 AR 净额聚合、dashboard 按绑定客户汇总，并新增 `653-customer-portal-receivable-consistency.spec.ts` 真实 PostgreSQL/API 回归。状态按 7.3 流转为“验证中”；仅在 PR 当前 head 全量 CI 通过并合入主干后关闭，未以本地静态检查代替运行期结论。
