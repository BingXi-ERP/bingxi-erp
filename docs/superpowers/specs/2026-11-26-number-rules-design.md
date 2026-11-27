# 编码规则参数化纵切设计

## 目标

让指定单据前缀的取号规则可配置、可审计、可回滚，同时保持现有 `DocumentNumberGenerator` 调用方签名与未配置前缀的既有行为不变。首个闭环覆盖销售订单 `SO`，迁移预置常用规则键，其他前缀继续走原生日重置、3 位流水逻辑。

## 方案选择

采用“规则表＋追加版本快照＋生成器按规则键解析”。不把规则塞进 `system_configs` JSON，因为需要行级乐观锁、历史快照和数据库约束；不重写所有业务调用方，因为现有前缀参数已经提供稳定规则键，改动面会失控。

## 数据模型

迁移 `m0147_add_system_number_rules` 新建独立顶层域 `domain/system_number_rules`，在 `domain/mod.rs` 与 `migration/src/lib.rs` 的迁移链尾注册。不能把子迁移挂进已应用的 `domain/system`：复用库会整域跳过，导致新表永不创建。

- `system_number_rules`：`id`、不可变 `rule_key`、`name`、`prefix`、`seq_width`、`reset_mode`、`version`、时间戳。`rule_key` 唯一；`seq_width` 约束 1 至 12；`reset_mode` 仅 `day/month/never`。
- `system_number_rule_revisions`：`id`、`rule_id`、`version`、`config` JSONB、`change_reason`、`changed_by`、`created_at`。`(rule_id, version)` 唯一；数据库触发器禁止 UPDATE/DELETE，保证追加只读。`config` 固定为 `{prefix, seq_width, reset_mode}` 嵌套对象。
- `system_number_sequences`：以 `rule_key + entity_table + column_name + output_prefix + period` 为号段键，持久化 `last_seq`；同一实际输出前缀与周期仍使用事务咨询锁串行。首次取号从 1 开始逐位探测真实占用，不把其他周期或宽度的历史单号当作基数。
- 首阶段预置 `SO/PO/QT/PR/DN/LD` 六枚规则键，初始配置与既有输出一致：同前缀、3 位、`day`。

`rule_key` 是调用方传入的历史前缀，不随配置修改；`prefix` 是实际输出前缀。这样无需改调用方即可调整前缀。

## 取号语义

- `day`：`{prefix}{YYYYMMDD}{seq}`，与既有格式一致。
- `month`：`{prefix}{YYYYMM}{seq}`，每月从 1 开始。
- `never`：`{prefix}{seq}`，永久递增。
- 序号由持久化号段分配，同一号段内递增；改变宽度不重置号段，切换周期后重新进入旧号段时续号。软删行继续占号，首次探测与唯一约束冲突重试都按真实占用判断。
- 号段计数更新与业务 INSERT 位于同一事务；`insert_with_no_retry` 的保存点回滚必须同步回滚本次计数增量。
- 事务咨询锁的键为“实际输出前缀＋周期”，确保不同规则键若配置成同一输出前缀也串行。
- 规则查询发生在取号事务内；未配置规则键显式走 legacy 默认，不使用缓存，配置提交后下一次取号立即生效。
- 既有 `generate_no`、`generate_no_with_txn`、`insert_with_no_retry` 和静态契约测试保持可用；显示宽度调用仍使用请求宽度，除非该宽度为默认 3 且规则存在，此时采用规则宽度。

## 管理接口

路由前缀 `/system/number-rules`：

- `GET /system/number-rules`：列表。
- `GET /system/number-rules/{id}`：规则与 revisions。
- `PUT /system/number-rules/{id}`：提交 `prefix/seq_width/reset_mode/version/change_reason`，版本不符返回可外显冲突，不覆盖。
- `POST /system/number-rules/{id}/rollback`：提交 `revision_id/version/change_reason`，将旧快照作为新版本应用，不删除历史。

权限由 URL 推导为 `system:number-rules:read/update`，前端使用同一权限码。所有写操作记录操作者、旧值、新值与原因。

## 前端

在系统设置新增“编码规则”页：规则列表、编辑弹窗、周期与示例预览、版本时间线、回滚确认。编辑弹窗的示例使用固定序号 1，仅随 `prefix/seq_width/reset_mode` 展示格式，不冒充真实取号结果。使用现有请求封装、`msg/logger`、权限指令和 i18n 双侧键。

## 测试与验收

- 真实 PostgreSQL 集成测试：三种周期、前缀与位数、历史号不改、版本冲突、回滚、revisions 不可变、并发唯一。
- Playwright：管理员配置 `SO`，普通角色越权拒绝，通过真实 `POST /sales/orders` 创建销售订单并回读 `order_no`；修改后新单立即用新规则，旧单号不变；通过真实 `POST /system/number-rules/{id}/rollback` 回滚后新单恢复。测试复用真实实体与清理 helper，禁止 mock、`page.route` 或假响应；`finally` 恢复并回读验证配置，订单按现有删除范式清理。
- 静态门：Rust 2024 rustfmt、前端 prettier/eslint/vue-tsc、Playwright 收集、仓库 i18n/契约/路由/API 门。
- 不修改 CI workflow；运行期只由完整 CI 证明。
