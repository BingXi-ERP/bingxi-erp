# 缺陷与功能补齐闭环看板（2026-11-19）

口径来源：本看板按目标第七、八章建立，是当前缺陷/功能补齐工单的唯一可视化入口。每条工单标注类型（Bug 缺陷 / 功能补齐）、优先级（P0/P1/P2）、状态、准入证据、关联 E2E 用例或 PR。状态流转遵循 7.3：新建 → 待评估 → 待开发 → 开发中 → 待测试 → 验证中 → 已关闭 / 搁置，不允许跳步。事实以本仓与远端 PR 现状为准，凡与早期报告冲突以本看板实量结论为准。

## 一、状态看板（P0 置顶）

### 验证中

| 编号 | 类型 | 优先级 | 标题 | 准入证据 | 关联用例 / PR | 负责人 |
|------|------|--------|------|----------|---------------|--------|
| DC-001 | 功能补齐 | P1 | 小程序接口层客户越权 E2E 用例集 | miniprogram/ 有工程但 6 条独有链路零 E2E，仅 7 道静态门（completion audit 实量） | `frontend/e2e/miniprogram/01-customer-access.spec.ts` / PR #1320 | 测试 |
| DC-002（第一批） | 功能补齐 | P1 | 写操作参数篡改 IDOR（目标 4.1-P / 3.6） | 现有 data-scope-isolation 仅覆盖读越权；换他人 ID 改金额 0.01、DELETE 他人单据的写越权为真实缺口 | `frontend/e2e/miniprogram/02-write-idor.spec.ts` / PR #1320（head fcff7e120） | 测试 |
| DC-003 | 功能补齐 | P1 | 统一测试数据工厂 builder API | 代码已交付：`frontend/e2e/factory/test-data-factory.ts` 聚合客户/线索/色卡原子造数、自动追踪 id、LIFO 统一回收；`data-factory.spec.ts` 为真实消费者（造数→按 id 回读→cleanup）。字段照抄已验证端点，不自造键 | 载体分支 `test/data-factory-1119`（commit `114e0fb`）已推送保工；本地 prettier/eslint/`playwright --list`、配对门 `PAIRING_GREEN`、api-paths 门均绿；待 CI 队列消化后开 PR、全量绿且合入 main 再关单 | 测试 |

验收标准（7.4）：客户角色越权访问 5 个内部单据端点（sales/orders、products、ar-reconciliations、crm/customers、purchase/orders）由后端返回 401/403；CI 全量面绿；不依赖前端按钮隐藏。事实核对已记入 PR #1320 描述（端点在 route-snapshot、权限码在册、不在 AUTH_ONLY、customer 可登录）。

DC-002 第一批验收标准（7.4）：两个不同 user_id 的 self 角色，跨 owner PUT 把他人线索金额改成 0.01、DELETE 他人线索，后端返回 403 固定脱敏信封并带字符串机器码；owner 回读金额仍为原值、记录仍在（实证未篡改）。后端承载体为 `update_lead`/`delete_lead` 的 `ensure_cross_owner_write_allowed` 写门（crm_handler.rs:719/753）。本地静态检查 prettier/eslint/playwright --list 全绿；CI run 44601446625（CI/CD）+ 44601446715（配对门）在新 head 物化 pending，待终态方可关闭。

### 待开发

| 编号 | 类型 | 优先级 | 标题 | 缺口证据 | 计划 | 负责人 |
|------|------|--------|------|----------|------|--------|
| DC-002（余项） | 功能补齐 | P1 | 询样/对账跨端互通与分享卡片可见性正向用例 | 第一批写 IDOR 已进验证中；远端树复核纠正假阴：`flow/431-customer-team-share-and-signature.spec.ts` 已覆盖 customer-shares 的 403+FORBIDDEN 统一机器码、by-user 通道只回读本人行且交叉互查不可见，在途 #1300 还有 531/532 小程序共享契约——"分享卡片越权负例空白"不成立，勿重复建设。真实余项收敛为询样提交/客户对账确认的**正向可见性**，受 DC-007 客户业务账号缺失约束 | 负例不重复建；正向待第一批 CI 终态且 DC-007 账号体系明确后同专支追加 | 测试 |
| DC-004 | 功能补齐 | P2 | 分环境预制脚本与独立库隔离 | `playwright.config.ts:48` baseURL 写死 localhost，CI 45 分片共用同库，仅靠账号前缀+时间戳唯一名隔离 | 与 DC-003 同域 | 测试 / 运维 |
| DC-008（重开） | 功能补齐 | P1 | 联动影响矩阵 PR 门禁（4.41.N）——原误判已关闭，抽检证实未落地 | 2026-11-20 复核：#1306 与 #1352 均 closed/merged=false，但当前 #1351 head `5b86db36` 逐文件承载 `e2e-linkage-gate.yml`、`check-e2e-linkage-gate.mjs`、`check-e2e-linkage-gate.test.mjs`、`frontend/scripts/e2e-linkage-matrix.json`；ci-cd.yml 原文仍有 `ci-e2e-linkage` job、`check-e2e-linkage-gate.mjs --json --specs-out` 调用与收尾聚合器引用；main 尚未合入，对应任务 #41/#47 仍 in_progress | 兑现载体已验证为 fail-closed，不再以 report-only 工具关单；待 #1351 当前 head 全量 CI success 并合并后，blob 回读 main 再关单 | 测试 / CI |

| DC-011 | 功能补齐 | P1 | 审批引擎多人协作动作（会签/或签/超时自动转交，4.21） | blob 级取证：services/bpm_ops/task.rs:39-49 审批动作取值域仅 approve/reject 两常量，validate_approve_action 对 transfer/delegate 一律拒；全仓 cosign/counter_sign/或签/超时转交在审批引擎零命中；monitor.rs:64 仅 overdue_tasks 统计、bulk_color_approval_service.rs:1388 仅超时提醒非转交。详见第五节十次更正。 | 产品立项多人会签/或签审批模式与超时自动转交引擎改造；实现后按 4.21 补字段级 E2E（会签逐人审批、或签一人即流转、超时后待办归属转移）并 CI 全量绿 | 产品 / 开发 / 测试 |
| DC-012 | 功能补齐 | P1 | 会话安全能力（扫码登录/会话超时自动登出/多端互踢或并存策略/异地提醒/记住登录/单点登录切换组织/停用账号强制下线，4.20） | handlers/auth*、services/auth、models 逐项取证零命中；已覆盖账号锁定解锁（495）、token 轮换与 logout 黑名单+JTI 吊销（19）、改密吊销旧会话（system/03）；锁定阈值 9 次(per-IP)/18 次(全局)与目标文档「5 次」口径差异待产品确认，非生产跳过锁定检查属防 CI 污染设计。详见第五节十一次更正。 | 产品立项会话安全能力建设；实现后按 4.20 补字段级 E2E（静置超时边界、互踢后旧会话 401、异地提醒触发、停用强制下线）并 CI 全量绿 | 产品 / 开发 / 测试 |
| DC-014 | 功能补齐 | P1 | 通用系统配置与参数化能力（4.24） | 2026-11-20 spec-to-code 映射：后端无通用 system_config 表/handler，仅两处单行配置可运行期改（`/quotations/discount-config` routes/quotations.rs:38-43、material-shortage threshold material_shortage_service.rs:930-984 直读 DB 无缓存）；前端 store/system.ts:49-55 `fetchSystemConfig` 调 `/api/v1/erp/system/config` 但后端零路由、无视图引用，属空壳；config/settings.rs 的 GLOBAL_UPDATE_CONFIG 是 OnceLock 启动期单例（仅更新器配置、非业务参数）。账本 scheme-audit...md:26 把 4.24 标「已闭合」并引 fullflow/30-system-config-chain，但该 spec:91-286 实为部门父子链/重名查重/单据号查重断言，与配置参数化无关——假闭环。真实覆盖仅 469 折扣阈值改值影响新报价审批态、410 阈值三键写读恢复；「改配置后历史单据不受影响」全库零断言。 | 产品立项通用配置能力：可配置编码规则（前缀/位数/日月重置）、仓库/币种/税率/预警阈值全局配置 + 失效/跨端同步、多组织配置隔离、变更记录与回滚、功能开关网关；实现后按 4.24 补字段级 E2E（新单据用新值/历史单据不变、阈值改后预警拦截变化），禁空壳断言 | 产品 / 开发 / 测试 |
| DC-015 | Bug 缺陷 | P1 | 小程序门户应收余额与订单收付款字段失真 | 2026-11-25 取证：`customer_portal.rs:133-175` 的订单列表/详情直接映射 `sales_orders.paid_amount/balance_amount`，`:636-643` dashboard 再聚合同一 `balance_amount`；这两列只在销售订单建单/改量时写入（`so/order_crud.rs:266-270,433-436`、`so/fabric_order.rs:478-482`），而收款与核销写的是 `ar_invoices.received_amount/unpaid_amount`（`ar_ops/collection.rs:375-379`、`ar_ops/verification_ops/manual.rs:377-383`），取消红冲也新增负金额应收（`ar/inv.rs:404-428`），不会回写订单。`flow/520-mp-customer-portal-access.spec.ts:264-271` 仅比较 dashboard 与订单列表这两个同源失真字段，无法发现该缺陷。 | 当前 PR #1397 CI 在途，按指令只登记、不改待推代码；待 #1397 收口后，门户订单按关联有效 `ar_invoices` 聚合 `received_amount/unpaid_amount`，dashboard 汇总绑定客户有效应收未收额，并补真实 PostgreSQL/API E2E（详见下方登记说明） | 后端 / 测试 |

### 待评估

| 编号 | 类型 | 优先级 | 标题 | 判定要点 | 卡点 |
|------|------|--------|------|----------|------|

### DC-015 登记说明（2026-11-25）

- 根因：门户把销售订单的 `paid_amount/balance_amount` 当作应收事实源，但这两列不是 AR 流水投影。收款、核销及取消核销只更新 `ar_invoices.received_amount/unpaid_amount/status`；送货取消生成 `SALES_DELIVERY_CANCEL` 红字应收，也不更新 `sales_orders`。因此部分收款后门户仍显示零已收，取消红冲后仍显示原余额，dashboard 同步失真。
- 关联口径：原应收使用 `source_type=SALES_ORDER` + `source_bill_id=order.id`；取消红字使用 `source_type=SALES_DELIVERY_CANCEL` + `customer_id` + `sales_order_no=order.order_no`（`services/ar/inv.rs:248-259,293-306`）。门户聚合必须同时覆盖两类关联，并再次以绑定客户 ID 约束，不能仅凭订单号或来源 ID 跨客户取值。
- 修复边界：订单列表/详情按当前页订单批量聚合有效 `ar_invoices` 的 `received_amount/unpaid_amount`；有效状态排除 `DRAFT/CANCELLED`，负金额红字按原符号参与轧差。dashboard 直接汇总绑定客户全部有效 `ar_invoices.unpaid_amount`，不复用订单分页结果，也不再把 `sales_orders.balance_amount` 当应收事实源。保持现有 JSON 键 `paid_amount/balance_amount/receivable_balance` 及 Decimal 字符串契约，避免无关前端契约变更。
- 回归设计：使用真实 PostgreSQL 与门户 API，双客户造数；本户走“发货生成应收→应收审核→部分收款→取消红冲→重新发货”，每个节点回读订单列表、订单详情与 dashboard，断言已收/未收精确轧差；他户使用显著不同金额，断言门户列表、详情 404、dashboard 均不包含他户金额。补 `DRAFT/CANCELLED` 不计入、负红字计入、分页不改变 dashboard 口径的边界断言。
- 已知阻断：当前取消送货单门明确拒绝已收款应收（`services/ar/inv.rs:337-346`，`tests/sales_delivery_cancel_ar_test.rs:425-475` 已有真实回归）。因此“部分收款后直接取消红冲”按现状不能跑通；实施时须先按既有业务门取消核销/资金回退至 `received_amount=0` 再红冲，或由产品另行批准取消策略，不能通过改测试或放宽门户聚合来掩盖。
- 本轮处置：PR #1397 CI 在途，按指令仅登记 DC-015；未修改待推源码或测试，未运行 Cargo/Playwright，未处理 CI，未推送。
