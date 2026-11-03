# 功能面缺口对账（2026-11-03）

口径来源：目标里的三、四、五节要求，逐条对仓库现状核。每条给取证面，凡与上游报告（含我自己派出的取证实例回报）冲突的，以本文件实量结论为准。

## 一、审计日志维度（目标第三节「记录账号、角色、终端、变更前后内容、时间、操作人，高危操作单独标记，支持缸号 / 订单 / 客户追溯」）

models/audit_log.rs 现有列直读结论：

- 账号与操作人：user_id 与 username，满足。
- 时间：created_at，满足。
- 变更前后内容：old_value 与 new_value，另有 before_snapshot 与 after_snapshot。**列表出参不带快照**，快照只在详情出参，所以任何跃迁类断言必须走 GET /audit-logs/{id}，拿列表断恒零命中（40 号段那枚红就是这么来的）。
- 高危单独标记：severity 四档 INFO/WARN/ERROR/CRITICAL，写点实测分布 68/22/9；另有 risk_flag 一列（DELETE/REVERSE/VOID）在 feat/audit-terminal-context-fields 支上补齐。
- 终端：user_agent 列存在，但 audit_log_service.rs 里约 461 与 579 行两处写入点把 user_agent 硬置 None，只有 build_active_model（约 637 行）那条路径从请求上下文取真值。terminal_type（PC/H5/MINIPROGRAM/UNKNOWN）在同一支补齐。
- 缸号 / 订单 / 客户追溯：keyword 筛选现实只 LIKE 三列（resource_id、resource_name、description），不含缸号与单号与客户编号；doc_no 一列在同一支补齐并带等值筛选。
- **角色：全缺**。主干侧 audit_logs 没有任何角色列，auth.rs 约 307-313 行已经把 roles 表那行查出来了（取 data_scope 用），落一列角色码不需要额外查询。这是目标要求里唯一还没承载体的一维，正在 feat/audit-terminal-context-fields 支上补。

## 二、前端与移动端能力面（对 gap-audit-frontend-mobile-1103.md 的逐条复核）

那份报告的三条头条结论经本仓实量后需要收窄，不能整条接：

- 「业务单据无乐观锁，last-write-wins」＝**不成立（至少对库存腿）**。handlers/inventory_stock_handler.rs:224 有 `stock.version != payload.version` 比对、:258 递增、:342 出参直映真值，且 tests/contract_wave2_stock_version_roundtrip_test.rs 逐条锁住该口径。该报告的 grep 口径是按 models 目录里的 `pub version` 扫的，漏掉了这张表的版本列。正确的说法是：**乐观锁只在个别表有**，其余单据面（销售、采购、财务）确实没有版本列，属分面缺口不是全局缺失。
- 「客户这类外部角色在本系统无任何可登录面」＝**口径错**。frontend/src/router/index.ts:1892-1893 的公开路由判定只免初始化检查，不是客户门户清单；仓内在册的客户自助腿（对账确认号段用例与 finance.rs 的 ar-reconciliations 族）是该报告没扫到的面。要不要给客户做独立门户是产品口径问题，不能记成「不存在承载体」。
- 「导出列按角色裁剪后端有、前端无从属」＝成立且有据：import_export_handler.rs:198-203 的 caller_can_see_cost_price 走 admin 判定，role_id 缺失按 fail-closed 处理。

经复核**确认为真**的缺口：

- 超折扣必须主管审批（目标 4.1 R 节明写）＝**两端皆无**。services/quotation_approval_service.rs 只有 AMOUNT_THRESHOLD_SELF=100000 与 AMOUNT_THRESHOLD_MANAGER=500000 两枚金额档位（约 43-44 行，判定在约 65-69 行），全仓没有折扣率阈值审批门；models/sales_quotation_item.rs:30 的 discount_rate 只被取值不参与判档。属业务链路缺失，不只是测试没写。
- 幂等键缺失（backend 全仓无 idempotent 承载）＝成立，与「乐观锁只在个别表」叠加，是 4.2 并发一致性那一节的真债。
- 无权限按钮直接 removeChild 而非灰化加说明（directives/permission.ts:45-47 与 :67-69）＝成立，与目标 4.1 O 节要求相反。
- 列表筛选、排序、分页不入 URL 也不入 store（composables/useTableApi.ts 全文无路由）＝成立，目标 4.1 B 与 F 两节判据无承载。
- 面料字段前端零面：余码（后端 inventory_piece.rs 的 original_length 与 parent_piece_id 有列，前端零引用）、打样逐版（后端 lab_dip 族有 version_label，前端只显枚数）、缸号补录写腿。属「后端有列或端点、前端缺半边」。

## 三、移动端与小程序（目标第五节）

实量为真的缺失：流式卡片布局仅 3 个视图用到 useBreakpoint、无图片灯箱预览、无手势放大、无压缩上传、无对外分享、无云打印（系统打印走安卓壳的 OS 打印对话框）、无弱网缓存与 serviceWorker、图片懒加载仅 1 处、移动端菜单未做轻量化裁剪、审批无卡片级快速同意驳回。

小程序侧另记：本支无小程序承载体，分包与订阅消息与客户自助页面按 H5 与安卓壳口径判；订阅消息只有企业微信 webhook，没有微信 openid 与 subscribe_msg 面。

## 四、排期约束

超折扣阈值审批门的落点是 services/quotation_approval_service.rs，该文件此刻在 fix/main-e2e-red-batch2-1103（PR #1171）里正被改（+9/-3）。同一枚 hub 文件不并行改，这枚补齐排在 #1171 合入之后，届时基于新主干顶点另开车道，并按配对门禁同时补 e2e。
