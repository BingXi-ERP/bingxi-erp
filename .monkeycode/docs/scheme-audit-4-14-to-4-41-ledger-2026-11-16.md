# 方案 4.14—4.41 逐节承载审计台账 2026-11-16

本文对桌面方案《面料行业项目｜测试与缺陷闭环整体方案（终版）》4.14—4.41 共 28 节建立逐节承载台账，把此前「只写补测专项 4.1—4.13、对 4.14—4.41 零逐节判定」的空白补齐。证据均取自 `origin/main` 树上的 e2e spec（`frontend/e2e/{flow,fullflow,finance}/`）与 backend contract test，以真实可失败断言（`toBe`/`toEqual`/机器码/魔数）为承载判据，排除仅 `toBeVisible` 的空壳。

判定口径：
- **已闭合**：有可失败断言承载，且无口径待定。
- **有承载·口径待定**：有断言，但方案所述纵深口径（阈值/时区/红冲计入等）尚未由用户拍板或未被该断言覆盖。
- **缺承载**：无合格断言或仅静态/手工/环境依赖。

「有承载」= 源码与断言存在，不等于该 spec 在任一 CI run 全绿；运行结论以对应 PR run 为准。

## 一、4.14—4.27

| 节 | 主题 | 承载 spec | 关键断言 | 判定 |
|---|---|---|---|---|
| 4.14 | 搜索/筛选/排序/分页 | 16-list-interaction、518-search-doc-types-surface | `data?.total).toBe(0)`；`toEqual([...DOC_TYPES].sort())` | 已闭合（分页越界钳位另见 #1248） |
| 4.15 | 表单字段联动 | 15-form-validation、106-product-yardage-clear、472-flow-card-material-validation-gates | `meters_per_piece).toBe(60)`；`quantity_kg).toBe(500)` | 已闭合 |
| 4.16 | 自动计算与数值精度 | 452-meterage-shrinkage-unit-conversion-conservation、finance/06-voucher-balance-reject | `roundTripDelta).toBe(0)`；`fail.status).toBe(400)` | 有承载·口径待定（分以下舍入/中间不提前/汇率锁价待拍） |
| 4.17 | 列表渲染与数据展示 | 20-status-display、10e-extended-status-i18n、16-list-interaction | `raw).not.toBe('')`；`orderNo)).toBe(3)` | 已闭合（状态-颜色视觉错配为近似覆盖） |
| 4.18 | 附件与文件管理 | 453-attachment-upload-preview-download-chain、456-attachment-flow-and-print-data-chain | `bytes[0]).toBe(0x25)`；`up.code).toBe(200)` | 已闭合（红冲作废后附件去留待拍） |
| 4.19 | 打印与导出格式 | 447-print-template-export-masking-and-dead-endpoint、fullflow/15-report-export、38-print-templates-api | `bytes[0]).toBe(0x50)`；`toBe('PK')` | 已闭合 |
| 4.20 | 登录态/会话/账号安全 | 31-login-waterfall、495-login-lockout-unlock-face、35-2fa-totp | `refreshCalls.length).toBe(0)`；`res.status).toBe(401)` | 已闭合（多端互踢或并存待拍） |
| 4.21 | 审批分支矩阵 | 469-quotation-over-discount-approval-gate、fullflow/28-bpm-approval-chain、41b-approval-specialized | `over100.status).toBe(400)`；`def.status).toBe('DRAFT')` | 有承载·口径待定（三档阈值/会签或签/超折扣待拍） |
| 4.22 | 主数据引用完整性 | 45-deletion-guards、505-master-data-uniqueness-face、fullflow/26-master-data-partner | `hits.length).toBe(1)`；`dup.status).toBe(400)` | 有承载·口径待定（改名快照 vs 同步/历史价回溯待拍） |
| 4.23 | 报表口径与统计准确性 | 71-bi-sales-aggregation-truth、finance/10-finance-reports、58-dashboard-stats-contract | `ending_credit).toBe('0.00')`；`customer_count).toBe('number')` | 有承载·口径待定（同比环比/跨期/红冲计入/实时vsT+1待拍） |
| 4.24 | 系统配置与参数化 | fullflow/30-system-config-chain、26-system-full、05-system | `dup.status).toBe(400)`；`parent_id).toBe(parentId)` | 已闭合 |
| 4.25 | 错误码与提示文案 | 67-submit-rejection-message-visible、66-submit-contract-regression | `msg).not.toBe('请求参数验证失败')`；`used_credit).toBe(1200.5)` | 已闭合 |
| 4.26 | 第三方集成与外部接口 | 124-webhooks-core-integrations-contract、87-api-gateway-endpoints-crud-readback | `ftp.status).toBe(400)`；`created.data.method).toBe('POST')` | 缺承载（支付回调幂等/退款回调值断言缺；支付 spec 几乎全 `toBeVisible`） |
| 4.27 | 缓存一致性与数据同步 | 56-read-after-write、30-persistence、473-concurrent-edit-conflict-version | `found!.code).toBe(code)`；`failureCode(conflict)).toBe(...)` | 已闭合（多节点缓存未本地覆盖） |

## 二、4.28—4.41

| 节 | 主题 | 承载 spec | 关键断言 | 判定 |
|---|---|---|---|---|
| 4.28 | 异步任务与消息队列 | 501-scheduled-jobs-idempotency、504-notification-retry-dedup、519-scheduler-observability | 「重复触发后状态不应被改写」 | 已闭合 |
| 4.29 | 数据一致性对账勾稽 | 11-ap-ar-verification-reconciliation、522-ar-recon-source-amount-redflush、92-ar-verification-chain | 「B 全额核销后状态应为 PAID」；`closing=opening+A-B` | 已闭合（三账/应付勾稽见 finance/11） |
| 4.30 | 时间与时区边界 | 12-invoice-details、08-accounting-period-lock、509-customer-tier-and-year-end-closing | 「过账应被期间锁拒且恰为 400」 | 有承载·口径待定（23:59:59/00:00 归属、UTC/CST 基准待拍） |
| 4.31 | 数值与文本边界 | 52-boundary-chemical-notify、18-resilience-boundary、12-invoice-details | 「负金额建单应恰为 400」 | 已闭合 |
| 4.32 | 异常流程与容错降级 | 48-compensation-assertions、474-http-idempotency-replay-guard、18-resilience-boundary | 「收货确认后必须生成 AP 应付单」 | 已闭合 |
| 4.33 | 隐私脱敏与审计合规 | 462-audit-terminal-role-traceability、447-print-template-export-masking、12-invoice-details | 「非高风险操作 risk_flag 应为 NULL」 | 有承载·口径待定（留存期与高风险复核待拍） |
| 4.34 | 无障碍与可访问性 | — | 仅 getByRole/aria-label 定位，无键盘/焦点/对比度/读屏断言 | 缺承载（手工/审计性质，方案本身偏人工走查） |
| 4.35 | 微信小程序深度 | 510-quotation-approval-dual-channel-notification、124-webhooks-core-integrations-contract | 「审批通过应给创建人落一条站内信」 | 缺承载（仅通知/webhook 后端腿，小程序前端无专项；用户已主动推迟小程序推送面） |
| 4.36 | 二维码/条码与扫码识别 | 23-color-card-full、211-fabric-roll-detail、400-greige-lot-diff-and-remnant-persistence | 「扫码结果应命中本例自建色号」 | 已闭合 |
| 4.37 | 面料行业色差与计量深度 | 452-meterage-shrinkage-unit-conversion-conservation、210-lab-dip-color-difference、212-fabric-color-difference | 「米↔公斤 往返换算米数差必须为 0」 | 有承载·口径待定（ΔE 阈值/公差/缩水率/单位待拍） |
| 4.38 | 备份恢复与误操作回滚 | 117-report-enhanced-template-lifecycle-chain | 「回滚后 name 必须回到版本 1 旧名」 | 缺承载（仅报表模板版本回滚，无库备份/回收站/快照恢复） |
| 4.39 | 数据库层与脏数据 | 505-master-data-uniqueness-face、506-state-machine-illegal-transition、213-dye-lot-lock-oversell-guard | 「重复值应被拒且恰 400」 | 有承载·口径待定（脏数据巡检工具链未独立覆盖） |
| 4.40 | 多组织/多仓/多公司维度 | 450-inventory-transfer-and-count-variance、465-warehouse-location-master-and-adjustment、29-permission-data-scope | 「调出量与调入量必须相等」 | 有承载·口径待定（多公司隔离仅部分；权限交集并集/内部交易抵消待拍） |
| 4.41 | 模块功能联动 A—O | 见下方子项表 | `closing=opening+A-B` 等 | 部分闭合（E/F 已闭合；A—D/G—H/J—M/O 有承载；I/N 缺专属承载） |

### 4.41 A—O 子项映射（事实）
- A 主数据正向联动：451-tier-price-and-attachment-flow、116-color-price-seasonal-tier
- B 报价审批转单：123-role-biz-quotation-approval、455-quotation-tier-price-and-discount-approval
- C 订单库存采购委外：448-business-sequence-gate-and-credit-limit、444-lot-lock-oversell-guard-and-sales-return
- D 采购委外入库质检：461-purchase-receipt-to-ap-conservation、457-outsource-rework-and-rejection-deduction
- E 出库送货对账开票收款：**522-ar-recon-source-amount-redflush（已闭合，#1251）**
- F 打样报价大货：**517-convert-sample-gate（已闭合）**
- G 库存内部联动：450、443-inventory-fine-code-roll-and-count、400
- H 审批权限审计横向：462、473-concurrent-edit-conflict-version
- I 三端逐字段 diff：**缺专属承载**
- J 配置规则联动：117、454-scheduled-alert-and-notification-delivery-legs
- K 审批幂等：48、474
- L 规则缓存：501、504、474
- M 监控告警：519、454
- N 联动影响矩阵自动跑：**缺专属承载**
- O 断言自检钩子：72-assertion-contract-selfcheck

## 三、判定汇总
- 有可失败断言承载且无口径待定（可判已闭合）：4.14/15/17/18/19/20/24/25/27/28/29/31/32/36 + 4.41 E/F = 15 节 + 2 子项。
- 有承载但口径待用户拍板（实现与断言在，验收口径未定）：4.16/21/22/23/30/33/37/39/40 = 9 节。
- 缺承载（需新增用例或属人工/环境依赖）：4.26/34/35/38 + 4.41 I/N = 4 节 + 2 子项。

## 四、口径待拍清单（非技术问题，不擅动）
4.16 分以下舍入/中间不提前/汇率锁价/换算系数；4.18 红冲后附件去留；4.20 多端互踢或并存；4.21 三档阈值与超折扣；4.22 改名快照 vs 同步/历史价回溯；4.23 同比环比/跨期/红冲计入/实时vsT+1；4.30 UTC/CST 基准与零点归属；4.33 留存期与高风险复核；4.37 ΔE 阈值/公差/缩水率/单位；4.40 权限交集并集/内部交易抵消；4.41 转单快照/未审批重算/红字核销。

## 五、边界与声明
- 本台账以 `origin/main` 树为准，取证全程只读，未跑测试；「有承载」不等于某次 CI 全绿，运行结论按各 PR run。
- 4.26/34/35/38 与 4.41 I/N 为真实缺口，其中 4.34 无障碍、4.35 小程序前端、4.38 备份恢复属人工/环境/用户已推迟面，非纯代码可闭环；4.26 支付回调幂等、4.41 I 三端字段 diff、4.41 N 联动矩阵为可新增 E2E 的明确切片。
- 口径待拍项待用户裁定后再进入实现与断言固化，不在本台账阶段改动源码。
