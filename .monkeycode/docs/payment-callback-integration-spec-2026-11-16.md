# 支付回调集成最小实现规格 2026-11-16

桌面方案 4.26 要求「微信/支付宝支付：支付成功、取消、超时、重复支付回调、退款回调幂等；第三方回调失败不阻塞本地流程」。经只读取证判定为**完全功能缺失**（现有 `POST /webhooks/integrations/callback` 仅验签回执壳，零业务状态写入；无支付通知端点、无第三方交易号字段、无回调状态机）。本文给出最小可执行规格，作为后续接入的依据；**本轮不实现**——接入需商户凭证与渠道 SDK，属外部依赖。

## 现状取证（origin/main）
- `handlers/webhook_integration_handler.rs::handle_generic_callback`：公开路由，校验 `X-Webhook-Signature`，解析 `{event_type, payload}`，只记摘要（`payload_size`/`payload_keys`）后返回 `received`/`processed_at`，**不写任何业务状态**。
- `middleware/idempotency.rs`：请求级幂等依赖 `AuthContext`（登录账号+键），第三方回调无登录态，**不适用**。
- `models/http_request_dedupe.rs(user_id, idem_key)` 同上；`models/processed_event.rs(consumer_id, event_key)` 仅供内部事件消费。
- `models/finance_payment.rs`：`payment_no/status/amount/payment_date`，状态词表仅 `PENDING`；无外部交易号/第三方单号列。
- `ar_collection.status = pending/confirmed/cancelled`（人工 confirm/cancel）；`status::payment = REGISTERED/CONFIRMED/PAID/PARTIAL_PAID`。
- 无微信/支付宝商户配置、无渠道 SDK；`webhook_secret` 是通用 webhook 密钥。

## 最小实现规格（五层）

### 1. 数据层（迁移）
- 新增 `payment_callback_events` 表：`id`、`channel`（wechat/alipay）、`external_trx_no`（第三方交易号）、`event_type`（PAY_SUCCESS/PAY_CANCEL/PAY_TIMEOUT/REFUND）、`raw_payload`（JSONB）、`signature_valid`（bool）、`status`（received/processed/failed）、`created_at`、`processed_at`。
- **唯一键 `(channel, external_trx_no, event_type)`** —— 这是回调幂等的基石（不是登录态幂等键）。
- `finance_payment` 增列 `external_trx_no`（可空，索引）关联回调来源。

### 2. 状态机（写入方权威，扩展 status/finance.rs）
- `finance_payment` 支付状态扩展：`PENDING → PAID / FAILED / REFUNDED / CANCELLED`，全部小写（与财务状态统一小写规范一致）。
- 迁移只加新值不删旧值；CHECK 约束同步扩。状态常量引用本模块，禁字面量。

### 3. 端点层（公开路由 + 独立验签）
- 新增 `POST /payments/callback/{channel}`（channel=wechat|alipay），列入 `public_routes.rs`（无登录态）。
- 验签：渠道独立密钥（`wechat_pay_secret` / `alipay_pay_secret`，与通用 webhook_secret 分离），走各自渠道签名算法；验签失败 401 且不落库。
- 幂等：先按唯一键占位；重复事件返回首次处理结果（同响应体），不重复推进业务状态。
- 失败隔离：回调处理异常只记 `status=failed` + error 日志 + 告警，**返回可重试的 5xx 或明确失败响应，但不回滚已成功的本地主流程**；提供人工补偿入口（重试处理 `status=failed` 的事件）。

### 4. 业务联动（按 event_type 分派）
- PAY_SUCCESS：`finance_payment.status → PAID`，联动 AR 收款确认（若关联 invoice）；已 PAID 的重复回调走幂等直接返回。
- PAY_CANCEL / PAY_TIMEOUT：状态 → CANCELLED / FAILED，不动已确认的收款。
- REFUND：状态 → REFUNDED，生成红字应收单（复用 `create_credit_memo` 幂等）或走 `cancel_verification` 解绑，与 4.41 红字核销口径一致。
- 乱序保护：以 `external_trx_no` 最新事件为准或按状态机单向跃迁（终态不可逆），具体在状态机层钉死。

### 5. 测试（TDD 切片）
- backend contract test：验签失败 401、重复回调只生效一次、乱序事件状态机拒绝、退款生成红字幂等、回调失败留 `status=failed` 可查。
- e2e（flow）：新增 `5xx-payment-callback-idempotency.spec.ts`（号段待占），用 mock 渠道密钥+夹具载荷驱动，断言重复/退款/取消按上述状态机推进。
- 注释禁批次号/PR号/行号引用（R1/R2/R5 门禁）。

## 外部依赖（阻塞项，需业务补齐）
1. 微信支付/支付宝商户号与 API 密钥、回调地址公网可达性。
2. 渠道 SDK 或自研签名验签（支付宝 RSA2、微信 V3 签名）。
3. saas 多租户下 `external_trx_no` 是否需带租户前缀（当前仓库无组织/租户维度，见 4.40 裁定）。

## 边界声明
- 本文是设计规格不是实现；未写任何代码、未改路由/迁移/状态词表。
- 一旦凭证到位，可按五层规格直接开工；幂等键设计（唯一键）与 `public_routes` 验签是本方案相对通用中间件的关键差异点。
- 若决定不接入真实支付（仅做本地 mocked 收款流），可只实现第 1/3/5 层的 mock 渠道，跳过渠道 SDK。
