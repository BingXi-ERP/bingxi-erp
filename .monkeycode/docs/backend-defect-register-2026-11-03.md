# 后端与门禁缺陷台账 2026-11-03

本文件承接 backend-defect-register-2026-11-02.md 的编号继续记。两条都来自 CI 红面取证，证据是 job 面失败清单与落盘日志，不是推测。

## D-38 e2e 失败信封判定器自己丢键，把服务端已回填的 trace_id 判成缺失

取证面：PR #1166 run 41493826763 的 flow 分片 13 到 20，job 面 39 枚失败用例，其中一类断言原文反复出现"trace_id 必须是字符串（统一信封）实际 undefined"与"403 失败体应含非空 trace_id，实际=undefined"，命中 448、447、450 等 17 枚 spec 里含 trace_id 断言的文件。

根因在测试工装侧，不在服务侧。frontend e2e flow 目录的 helpers.ts 里 apiCallExpectFail 的返回是手挑三键构造的对象，只带 status、code、message，把后端统一信封真实回填的 trace_id 与 timestamp 丢掉；而 backend 的 utils error.rs 与 utils/response.rs 的 unified_error_response 两条出参路径都无条件写这两个键（同源取 TRACE_ID task-local，并有单测锁住响应头与响应体同值）。所以断言拿到的 undefined 是判定器没把字段递过来，不是服务端没回填。

危害的具体形态是误导归因：这类红看起来像"后端错误信封缺字段"，会把人推去改后端，而后端改不动；同时它把 448 这类时序门控用例整体压红，使真正的后端缺陷被淹没在这片噪声里看不出来。

整改：apiCallExpectFail 改为把解析出的失败体整体透传并附 HTTP 状态码，判定器不再挑键；单测不变，服务侧零改动。修复在车道 wt-e2e-env 提交 a56c33868。

## D-39 报价单建单把日期发成完整 ISO 时间戳，被 NaiveDate 反序列化拒掉

取证面：同一批分片日志里反复出现"API POST /quotations failed: code=VALIDATION_ERROR message=请求格式不正确：请求体或查询参数存在缺失的必填字段、字段类型错误或内容类型错误"，448 的建单辅助函数被多条用例复用，一枚建单红会带出该文件整片断言红。

根因是测试侧载荷口径。backend 的 models/quotation_create_dto.rs 里 quotation_date 是 chrono 的 NaiveDate，反序列化只接受 YYYY-MM-DD；448 的辅助函数把 quotation_date 写成 new Date 的完整 toISOString 输出，带 T 与时区后缀，必然被拒。同一文件里 valid_until 用的是正确的日期切片写法，全仓扫下来 quotation_date 的其它 14 处也都用了 slice 或 split 后的日期形态，只有 448 这一处不合口径，属孤例而非系统性问题。

公开文案不外显字段名是既有契约（空值必填键在中间件层被提前剔除，错误只给固定公开文案），所以这类错只能靠对着 DTO 逐字段核出来，不能指望错误消息自报是哪个字段。

整改：该处改为按 NaiveDate 口径发日期，并就地留一行说明为什么不能用完整时间戳。修复在车道 wt-e2e-env 提交 1c1dd55b。

## 尚未闭环的第三类

同一批红里另有五处不像工装问题的形态，按"源码错改源码"处理，逐处需要活库与编译证据，交 CI 验：销售退货审批端点返回 DATABASE_ERROR；盘盈差异流水按缸号与批次追溯命中 0 条；公斤数 999.99 落库后被折算覆盖成 9.05；匹行米数 190.48 与收回单出参 190.4750 存在分差不对平；超 0.5% 允差阈值的判定结果与阈值口径不符。这五处已在任务看板第 18 号挂账。

## D-40 一枚 E0063 造出 55 枚连带红，面纱是 Rust 测试预编译

取证面：载体支 1171 第二轮之前的整轮红面是 failing=55/79，smoke 五档、traversal 五档、flow 多档、extras 全族、角色权限矩阵六组、Setup 向导真实链路一起红。逐枚去拉断言原文会白做几十次，真正的第一手证据只有一行：

```
error[E0063]: missing fields `layer_no` and `shelf_no` in initializer of `StockResponse`
  --> tests/contract_wave2_stock_version_roundtrip_test.rs:34:5
##[error]Process completed with exit code 101.
```

根因在测试侧构造点。本支给 handlers/inventory_stock_handler_dto.rs 的 StockResponse 加了货架号与层位两枚真实列直映，同一支里的契约测试夹具没跟着补齐，cargo test --no-run 就构不出测试二进制，📦 Rust 测试预编译判红；所有需要后端执行体的作业随之成片红，红面看起来像几十个缺陷，实际是一枚类型错。同一份日志只报这一枚 error，库与 bin 都编译通过，说明 inventory_stocks 上确有这两列，正解是补构造点而不是改列。夹具判据是乐观锁版本号回环，库位两列不参与，取 None。

工序教训：大面积红先数一下有没有共同前置作业红（预编译、镜像构建、二进制产物这类），先消它再看剩下的红面，否则会把一枚类型错拆成几十次取证。

## D-41 审计跃迁判定打在列表出参上，而列表出参不承载变更前后两列

取证面：fullflow 40 号段的提交跃迁与批准跃迁两枚断言恒得 0 命中，消息形如"审计中应恰好一行 draft 到 pending_approval 的跃迁（报价 6），实际 0 行，本页共 2 行"。候选 2 行说明服务端按资源键筛是命中的，跃迁却判不出来。

根因在读面选错。models/audit_log.rs 的实体列是 old_value 与 new_value，写入侧 handlers/audit_log_handler.rs 的列表项结构体 AuditLogListItem 只交资源键、操作人、时间与严重度，不交前后快照；快照只在详情结构体 AuditLogDetailResponse 里以 before_snapshot 与 after_snapshot 承载，old_value 与 new_value 是同一详情的兼容别名。于是任何在列表响应上按快照判跃迁的写法都恒假，把"审计确实没写"与"读面结构不对"两种成因压成同一条红。

整改：判定改为列表按 resource_type 与 resource_id 等值筛拿候选行主键，再逐行 GET /audit-logs/{id} 读详情，用 before_snapshot.status 与 after_snapshot.status 精确匹配一次跃迁，主键非正整数直接抛错不静默跳过，判红时把每行详情读到的前后状态逐条点名。修复在载体支提交 d4f78bd5。

## D-42 内联 import 类型带泛型实参让 semgrep 只部分解析，挂住每一条从主干切出的支

取证面：主干 c6f0e61a 的每日漏洞扫描作业红，日志逐字给 errors=1 与 PartialParsing 的路径列区间，落在 flow/448-business-sequence-gate-and-credit-limit.spec.ts 第 90 行第 35 列到第 76 列，正是 res: import('./helpers').ApiResponse<string> 这一段。门体 .github/actions/vuln-scan/action.yml 按 errors 计数 fail-closed，凡未从主干改过这一行的支都同点红（实测四条支红、两条支绿）。

判据要收窄：同树里大量 page: import('@playwright/test').Page 形态不带泛型实参，semgrep 全部解析通过，所以不能把内联 import 写法一概判为风险形态，只有带尖括号实参的那一档会炸。修法是把该处改成具名导入后的 ApiResponse<string>，与树内通行写法一致，已随载体支 1171 一并落地，不另开支争同一行。配套加了只读静态门 ts_semgrep_parse_risk_check.sh，谓词是 import('...').标识符<泛型>，内置正向对照（同一个谓词必须抓到已知风险行）防恒零命中假绿。

## 在途支的文件面交集与合并次序

按各支相对 base c6f0e61a 的改动文件集合两两求交（实取 15:31）：

- 与载体支 1171 零交集：1146、1164、1165、1167。这四支的红全是共享主干红与 needs 随动，本支改动面不相撞，载体合并后并基重推即可。
- 与载体支 1171 各撞两枚文件：1169 撞 448 与 flow/helpers.ts，1168 撞 400 与 448。
- 1168 与 1169 之间还撞 448，形成三处争同一枚测试文件。

因此次序固定为：1171 先全绿并由用户合入主干，随后 1169 并基（448 取两侧意图并集，helpers.ts 以载体已收窄的失败信封透传为准），再 1168 并基（400 与 448 同理），1146 与 1165 与 1167 与 1164 无冲突可随时并基重推。1164 是主干验证载体，一次性目的已达成，其红面与主干共享红同源，收口动作待用户对合并次序裁定。

另记一条与审计支的撞面：feat/audit-terminal-context-fields（补终端与页面与单号与原因与风险与角色六维那条）与载体 1171 的文件面交集实测恰为两枚注册文件，backend/migration/src/domain/mod.rs 与 backend/migration/src/lib.rs —— 两支各往迁移链登记一枚域。这两枚是 hub 文件，只允许主编排在合并后串行改，解法是两侧条目都留（载体那条 m0128 与审计那条 m0126 互不冲突，只是同一段清单相邻追加）。审计支的角色列宽口径已复核为与 roles.code 同宽，system 域 m0001 建表处 code 列是 VARCHAR(50) NOT NULL UNIQUE。

## D-45 交货允差是假能力：列在、表单可填、范围有校验，收货时无人消费

起因是「尚未闭环的第三类」里那条「超 0.5% 允差阈值的判定结果与阈值口径不符」的候选后端缺陷。静态核完的结论不是阈值写错，而是这个判定门根本不存在，原先那条红的成因要改写。

两条互不依赖的口径：

- 全仓 grep quantity_tolerance_pct 共 55 处命中，比较类命中为零（判据：行内含 > >= < <= abs( .cmp 的行数）。命中面只有三类：purchase_order_item.rs 与 sales_order_item.rs 与 sales_contract_item.rs 的列声明，po/mod.rs 与 sales_contract_handler.rs 的 0 到 100 区间校验（validate_quantity_tolerance_pct，文案点名列名），以及 ap_invoice_ops/receipt.rs 与 po/order_ops/crud.rs 与 sales_contract_handler.rs 的字段拷贝。
- 收货侧真身文件（purchase_receipt_service.rs、purchase_receipt_ops 目录、po/receipt.rs）里没有任何按数量阈值判定的语句，也没有超量语义（over_receipt、超量、超收、exceed）的命中。

因此业务链路现实是：合同行与订单行允许录入交货允差百分比并做了合法域校验，但收货、开票、应付登记三条腿都不会因为超出允差而拦截或转审批。目标 4.1 R 与 4.3 那两节要求的「按行允差判定超量」属功能缺失，不是缺陷修复。

同时给用例侧一条纠正：把允差当成全局 0.5 常量是双重口径错——真值来源是行上的列（每行可不同，且为空时该判定的缺省口径本身待产品定），且当前根本无判定点。补这枚门时的验收要按行取列、显式定义 NULL 语义（禁止用 ?? 兜底掩盖），错误出参走可外显的业务错误并把行号与允差值与实际量一起点名。

## D-43 迁移里 plpgsql 体用了 // 注释记法，建库阶段抛 42601 把整条迁移链打断

取证面：PR #1171 第二轮 head d4f78bd57 出两枚红，🔐 角色权限矩阵的 sales 组（job 126025273552）与 production 组（job 126025273467）。两枚日志里矩阵断言一行都没有，失败点全在更早的一步：日志打出"开始执行数据库迁移..."七秒后即 Error: Exec(SqlxError(Database(PgDatabaseError { code: "42601", message: "syntax error at or near \"//\"", position: Some(Original(381)), file: Some("pl_scanner.c"), routine: Some("plpgsql_yyerror") })))，job 直接判负。

根因是本支新增的 backend/migration/src/domain/piece_length_scale_widen/m0128_widen_inventory_piece_length_scale.rs。它的 DO 块写在 r#"..."# 原始串里，串内三行说明按 Rust 习惯写成 // 开头。Rust 侧看不出问题（// 在字符串里没有语法含义，编译与 rustfmt 都过），但这三行是发给 PG 的 SQL 正文，plpgsql 词法器只认 -- 与 /* */，遇 // 即 42601。position 381 落在 BEGIN 之后第一段说明处。

这类形态的危险在于面纱方向与编译错相反：cargo test --no-run 抓不到，因为串内文本对 Rust 是透明的；只有真的连库执行才暴露，于是所有 needs 建库的作业（角色权限矩阵六档、e2e 各分片、真实性门禁与收尾清理两枚聚合器）一起红，而单看 Rust 面一切正常。判某枚红是不是这一类，看日志里 42601 与 pl_scanner.c 这对签名即可，不必逐枚读断言。

整改：三行注释记法改为 --，扩位逻辑一字未动，修复在载体提交 944fb46c0。同一谓词已扫全棵迁移树：解析每枚 .rs 的 r#" 与 "# 配对，只在串内状态为真时统计行首 //，正向对照用修复前的 m0128 副本命中 3 处，全树扫描命中 0 处，这一类在当前仓内已闭合。把它做成常驻门是下一批候选（需按新门三件套走：默认只报告加棘轮基线加工具故障归 unverified 加内置正向对照），本轮不新开 .github 面，避免与在跑载体撞门体文件。

## D-44 审计定位六维里三维结构性恒空：setter 有定义无调用点

取证面：feat/audit-terminal-context-fields 支给审计表补了定位维度（terminal_type、operation_page、doc_no、change_reason、risk_flag，加本轮在补的 role_code），读取侧出参与等值筛选已通。逐枚核写入面得到不对称结论：

- 会真落值的三维：terminal_type 由 middleware/audit_context.rs 的 detect_terminal_type 从请求头判；operation_page 由 detect_operation_page 从同源 Referer 取；risk_flag 在 audit_log_service.rs:540 有一条 DELETE 兜底派生（req_ctx.risk_flag 为空时落 RISK_DELETE）。
- 恒空的三维：doc_no 与 change_reason 在三处写入点（audit_log_service.rs 约 444 与 570 与 639 到 673 行）全部读 req_ctx 的同名字段，而唯一能写这两个字段的 set_audit_doc_no 与 set_audit_change_reason（audit_context.rs 约 118 与 123 行）在 backend/src 生产侧调用点为零（排除 middleware 自身与 tests 目录后 grep 无命中）；mark_audit_high_risk（约 128 行）同样零调用，使 risk_flag 的 REVERSE 与 VOID 两档永远打不上。

危害形态是假能力而不是崩溃：列在、索引在、筛选参数在、出参键在，前端与用例都能把这一维当可用能力写，但库侧永远 NULL。目标口径「支持缸号 / 订单 / 客户追溯」现实上不成立，且这种缺失不会以任何一条红暴露自己，所有门禁都绿。同族先例是单据号展示端点全为死端点与导入模板空转。

处置分两步：一是在持有单号的业务写入点接上 setter，候选面是销售订单流转、报价审批、委外收回、销售退货、盘点差异、财务红冲与作废这些已存在审计跃迁的 handler，红冲与作废端点同时接 mark_audit_high_risk 的 REVERSE 与 VOID；二是在接线的同一支里把 462 号段那枚用例从「断 NULL 的落值形态」升回「按真实单号等值筛命中本链」，该用例已留了单号等值与 keyword 模糊的语义对照腿防恒过，接线后把降级腿换回正向命中腿。本轮先如实登记，不在载体在跑时并行改这批 handler，避免与主干解锁支撞面。

## D-46 审计角色码存证列宽度窄于源列且注释声称同宽

取证面：复核 `feat/audit-terminal-context-fields` 那八笔角色维提交时逐列对宽度。存证列写作 `audit_logs.role_code VARCHAR(50)`，而列注释与迁移内的 RAISE NOTICE 都称"与 roles.code 同宽"。这条声称是假的：`backend/migration/src/domain/finance/mod.rs` 用 `ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "code" VARCHAR(255)` 建过该列，而 `VARCHAR(50)` 那种写法在本仓属于 `products.code` 等其它表（`system/m0001_initial_schema.rs` 与 `business/m0014` 的 CREATE TABLE 段），逐条核过后确认 roles 表根本没有 CREATE TABLE 语句（角色由 init 侧建，不由迁移建），迁移侧唯一一处 roles.code 定义就是 255。

危害方向与普通宽度不一致不同：PG 对超长值不截断而是报 22001，写审计的那条 INSERT 直接失败。审计写入点与业务写在同一请求链上，一旦角色码超 50 字符，表面看是"某单保存报错"，实际断的是存证腿——与 D-44 那类"列在建、值恒空"一样，都不会被 Rust 侧编译或格式门抓到，只有真发一条长码才暴露。

整改：存证列改为 VARCHAR(255)，同时删掉那句不实的"同宽"措辞（载体 `25ec370ac`）。宽度取值口径按源列较宽的一档，不是按当前数据实测最大值——当前所有角色码都远短于 50，按实测取宽等于把缺陷压到下一次改名。

## D-47 操作页面维度取自请求头与 Referer 但无长度上界

取证面：`backend/src/middleware/audit_context.rs` 的 `detect_operation_page` 依次取 `x-page-path` 与 `Referer`，两者长度都由客户端决定，解析后原样返回，存证列 `operation_page VARCHAR(500)`。这条腿的取值面比 D-46 更宽：请求头内容由调用方直接控制，不参与签名，任何一条带长头的请求都能命中 22001，无需业务侧配合。

同族核过一遍，其余四维不构成同类：`terminal_type VARCHAR(16)` 存的是四枚常量（PC 与 H5 与 MINIPROGRAM 与 UNKNOWN，最长 11 字符，由服务端判定不给外部输入开门）；`risk_flag VARCHAR(32)` 同理三枚常量；`doc_no VARCHAR(64)` 与业务表单据编号列同宽（本仓该列一律 64）；`user_agent` 是 TEXT，不存在定宽溢出。

整改：在边界处按存证列宽度判空并打 WARN（载体 `5d91bc4d3`），不做截断——截断会存下一个不存在的页面标识，等于造假存证；判空并在日志里给出实际字符数与上限，读的人能看出这条腿被丢过。这符合"只在系统边界校验输入"与"不许兜底掩盖"两条口径的交点。

## D-49 信用额度的建单侧门被部署环境短路，且同一笔金额被占用两次

取证面：判定 4.1 R-6「超客户信用额度，业务员不能提交订单」的源码面时实量到两处。

一处是门的存在性依赖部署环境：`backend/src/services/so/order_crud.rs:211-215` 写
`if !crate::utils::config::is_production() { return Ok(()) }`，而 CI 与 e2e 全支把 `APP_ENV` 置为
development（`.github/workflows/ci-cd.yml` 的 1929／3128／3601／3915 行与 `e2e-batch.yml:170`），
`utils/config.rs:38-42` 在未设置时的缺省也是 false。⇒ 建单侧的拒绝文案与错误族在任何自动化验证里
**恒不可达**，448-08/09 那两条用例只能验到提交侧。预发与灰度环境同样静默不校验。

另一处是重复占用：`order_crud.rs:127` → `:470` 在建单时已经 `occupy_credit(order_amount)`，
提交时 `so/order_workflow.rs:111` 又拿同一张单的 `total_amount` 去和「已经扣掉本单的 available_credit」
再比一次。同一笔金额计两遍，客户越接近额度越提不了单，且报错文案指向的是额度不足而非重复占用，
排查时会被引向错误方向。

处置分两层：环境短路属控制口径问题——信用控制是业务内控，按企业内部控制应用指引与行业通行做法，
它应当在**受理订单的每一条路径**生效，关掉它的开关应当是显式业务配置项（缺省开），而不是跟着部署环境走；
改法是把它换成 `credit_limit_enforced` 一类显式开关，缺省生效，同时给建单侧补上可验的负例锁。
双重占用属实现缺陷，正解是建单占用与提交校验共用同一份口径：要么提交时按「本单已占用」还原后再比，
要么把占用动作收口到状态跃迁的单一落点，禁止两处各自 occupy。
本轮不动这两处：`order_workflow.rs` 与 `order_crud.rs` 都在在途支的改动面上（写腿那路正在改
`so/order_workflow.rs`，载体分支已改 `so/*` 与 `quotation_*`），等 #1171 合入后单独开一支做，
并把上面两条一起裁定后再动手。

## E8 超折扣报价必须主管审批：判据输入都没落库，属整条功能缺失

取证面：4.1 R-7 要求「超折扣报价，必须主管审批才能下发客户」。三缺：源码面无任何折扣阈值判定
（`backend/src/services/quotation_approval_service.rs:43-44` 只有两枚金额阈值
`AMOUNT_THRESHOLD_SELF=100_000` 与 `AMOUNT_THRESHOLD_MANAGER=500_000`，第 65-69 行按金额分档决定层级，
全文无折扣相关判据）；前端无对应提示或按钮禁用；用例面无任何分支。

更深一层：这道门的**输入面本身没落库**——判定折扣需要"基准价"（标准价或最近成交价）与"实际报价"两个值，
而基准价在报价链路上从未入库，只有报价行上的成交价与折扣字段，所以连"折扣超过多少"都算不出来。
这与 D-44 那类"列在建、值恒空"不同，是判定所需的量根本没有供给，属于设计缺口而不是实现疏忽。

实现面前置两条裁定：一是折扣标度（按百分比还是小数、是否含税口径，与 D-49 (d) 的
`total_amount` 含税标度问题同源，必须一起定）；二是基准价来源（产品档案标准价、阶梯价首档、
还是该客户最近成交价），选谁就决定要不要新增列与回填策略。按国标与行业通行做法，阈值应做成
可配置项而非硬编码常量（现金额阈值就是硬编码，属同族债），且审批人不得审批自己提交的单。
落点在 `#1171` 合入后，与 D-49 同支或紧随其后一支，配套 e2e 号段 463 起。

## D-50 R 节第 3 条时序门整条缺失，且门的前提事实不在库里

矩阵要"送货单未签收，财务不能生成对账单"。取证结论是完全缺失，且缺的不是门而是判据：送货单实体没有签收列，
对账单的来源腿挂的是发票与收款，只在来源类型上排除 CANCELLED，DRAFT 直接放行。所以这条不能按"补一条断言"
处理——先要让"签收"成为一个落库事实（列、写入端点、状态词表），再让对账来源只引用已签收的明细。按纺织
行业通行做法，应收确认的触发点是到货确收，主体应落在送货单侧；若裁定仍留在发票腿，矩阵这条必须改述，
不许留成"看着有门其实无判据"的隐性漏测。取证全文 `E:/logs/ci/sequence-gate-r-remaining-2026-11-03.md` 第 3 节。

## D-51 R 节第 4 条开票前置门缺失，且确认态本身可被两处端点伪造

`confirmed_by_customer` 有列、有出参，读取点为零；开票三条腿（手工开票、财务发票登记、应收生成）都不查
对账确认态。同一条里还有一处更危险的：`create_confirmation` 缺行级归属门、`update_status` 无状态迁移白名单，
 ⇒ 即便把开票门加上，这两个端点仍能自由翻转确认态，门等于零。**次序要求**：先收口这两个端点，再补开票门。

## D-52 R 节第 2、5、6 条门都在但口径各不相同（三处成因不通用）

1. 第 2 条（未入库或库存不足不得出库）：主腿 `delivery_ops/ship.rs` 的 `load_ship_order_context` 门是齐的
   （状态门、可用量、行锁、CAS、超发容差），但可用量这个事实来源被入库腿打断——`services/inventory_stock_txn.rs:20`
   的 update 把 `quantity_available` 直接覆盖成账面量；另有零门旁路 `services/so/delivery.rs:123 create_delivery`
   （路由在册），而前端 `api/sales.ts:229 createSalesDelivery` 全仓零调用点，属 D-45 同族的假能力；出库候选
   `inventory.rs:396-401 load_four_dim_candidates` 不排除报废与已删除库存行，即判废实物仍可被拣走。
2. 第 5 条（客户未确认样不得转大货订单）：门在定制订单的推进腿 `validate_quotation_gate`，建单与转单四条腿
   零门 ⇒ 门位置与矩阵要求不符。补门时若不区分"本就没有打样单的常规大货单"，会误伤正常路径，需先定口径。
3. 第 6 条（已红冲单据不得被引用到新对账与新出库）：作废态 CANCELLED 的排除是真的（AR/AP 对账与核销都滤），
   但"红冲"在本仓不是一个可排除的状态——它没有对应状态词；且引用来源单据的查询与写入不做状态与存在性过滤：
   `services/ar_invoice_service.rs:148-153` 把 `source_type` 与 `source_bill_id` 原样落库，
   `services/finance_invoice_service.rs:70 create_invoice` 连来源都不挂（`order_id` 为 NotSet），
   销售退货不冲减 `sales_order_item.shipped_quantity`。⇒ 这一条要拆成两件事做：给红冲一个真实状态，
   以及给来源引用加过滤。**禁止**把 442-02（只锁作废退出对账）当成本条已闭环。

## D-53 4.2 并发与多端一致性六行三态（矩阵五条加一枚派生的重放）

取证全文 `E:/logs/ci/concurrency-consistency-audit-2026-11-03.md` 第 149 节汇总表。逐行结论：

1. 同账号多端并发编辑冲突控制 已有但口径错：乐观锁只覆盖 `inventory_stocks` 一表，其余单据靠
   `lock_exclusive` 串行化，属"同事务内互斥"而不是"跨请求版本冲突检测"，两标签页先后保存必然静默覆盖。
2. 多单并发锁同一缸号超卖 主链已有且正确（行锁加 `WHERE quantity_available >= x` 加 `rows_affected` 三重）
   / 旁路完全缺失（坯布出库、批次转移、大货剪样三腿先读后写，必超卖）。
3. 并发取号唯一无跳号 已有且正确（咨询锁 + 后缀探测 + UNIQUE 兜底 + 保存点重试），展示面存在同号窗口。
4. 并发审批重复拦截 主流水已有且正确 / 三处口径错（缸号完成、报废财务审批等不在正确族）。
5. 多仓库并发出库一致性 正向正确（四维行 + 仓库过滤 + 事务）/ 反向回滚口径错，且存在虚增缺口。
6. 重复提交与重放（4.1 H 与 P 节）HTTP 面完全缺失：全仓唯一幂等实现是内部事件 `processed_events`，
   中间件没有 `Idempotency-Key`、没有请求指纹，抓包重放审批与重放保存都不被拦。

配套用例已划号段（462 已占）：463 坯布并发出库、464 批次转移并发、465 大货剪样并发、466 缸号完成重复流转、
467 报废财务并发审批。**门先于用例**：第 2 行旁路与第 6 行的门没落地之前，对应 spec 只能写成"断言能力不存在"，
那是恒过假绿，不许交。

## D-54 入参浮点转 Decimal 用 retain 把二进制尾数搬进库，等额出库被判超量

载体第四轮五枚 e2e 红的头一枚根因。请求 DTO 把数值入参声明成 `f64`，落库前用
`Decimal::from_f64_retain` 还原：double 表示不了的十进制小数会把整段二进制尾数带进来，
12.8 变成 12.8000000000000007105…，而库里读回来的 `weight_kg` 是列刻度值 12.80，于是
`现有 - 本次 < 0` 对"恰好全出"这笔合法出库成立，报 BUSINESS_ERROR 出库重量不能大于现有重量。
同类现象在汇率腿表现为标度撑爆（`currencies.rate` 列刻度 8，落库值带 8 位小数）。
修法是在边界处换 `from_f64_rounded`（签名同为 `Option<Decimal>`，调用点机械替换），
按"由入参或复用点 f64 建 DECIMAL"的口径全仓一次改到 11 个文件 36 处。
遗留一条同类面未动：`services/ai/*` 与 `utils/unwrap_safe.rs` 的 retain 用在统计量与测试常量上，
不参与与库侧刻度的比较，改它属扩大范围，留作后续判断。

## D-55 e2e 金额分位助手只补位不截位，把宽标度出参折成放大整数，断言恒不成立

`toScaled(value, scale, label)` 在 5 枚 spec（92、93、160、161、442）里复制了同一份实现，
它对出参小数位宽于 `scale` 时先判"非零尾数即判红"，再直接 `padEnd` 拼整数——判红条件写对了，
但宽出来的零尾没有截，于是 "7.34000000" 按 4 位断言被折成 734000000 而不是 73400，
一个数值本已相等的用例恒判失败。这条属测试侧缺陷：断言想钉的是"数值等于 7.34 且精度不超出 4 位"，
不是"出参必须写成 4 位字符串"。修法是在零尾校验通过后再截到 `scale` 位，五处一次改全。
同族一条已修：448 建报价把 `quotation_date` 发成完整 ISO 时间戳被 `NaiveDate` 拒为缺必填字段
（与 D-39 同因，属新增用例回潮）。

## D-54 补记：首版修法是虚构 API，落地的修法换了

登记 D-54 时给的修法是"把 `Decimal::from_f64_retain` 机械换成 `Decimal::from_f64_rounded`，
两者签名同为 `Option<Decimal>`"。这个前提是**错的**：`Cargo.lock` 钉的是 rust_decimal 1.42.1，
本地 registry 源码 `src/decimal.rs` 里只有 `from_f64_retain`（1900 行）与 `round`（1462 行），
**没有 `from_f64_rounded`**。按那条口径改完 36 处，主干构建 job 当场报 39 条错——
`error[E0599] no function or associated item named 'from_f64_rounded' found for struct
rust_decimal::Decimal` 15 处点名，另 24 条是在其结果上做推断的站点级联 `E0282 type
annotations needed`（🏗️ Rust 后端构建与 📦 Rust 测试预编译同红）。

落地的修法：新建 `backend/src/utils/decimal.rs::from_f64`，内部
`Decimal::from_f64_retain(value).map(|d| d.round_dp(8).normalize())`，刻度取 8 位（全仓最宽的
业务 DECIMAL 是 `currencies.rate DECIMAL(20,8)`，比它更宽的小数位只可能是二进制尾数）；
`normalize` 只剥尾零、scale 停在 0 就停，不会把 100.00 折成科学计数法，因此不破坏出参线格式。
37 处站点（含 4 处 `and_then(Decimal::from_f64_rounded)` 函数引用形态与 1 处注释指涉）改为调它，
非有限值仍返回 `None`，不改调用方原有的坏值分支。

**这一版第一稿还错了一次**：写的是 `d.round(8)`，而 1.42.1 的 `round(&self)` 不收参数
（它折到整数位），收位宽的是 `round_dp(dp)`——财务多处金额归一用的正是 `round_dp(2)`，
仓内既有写法本可直接对照。CI 报 `error[E0061] this method takes 0 arguments but 1
argument was supplied` 一处，🏗️ Rust 后端构建与 📦 Rust 测试预编译两枚 job 同源同红。

**工具口径教训（同属"会造成本地支假红/假绿"一族）**：批量替换前必须先在**钉住的版本源码**里
grep 目标符号是否存在，不能凭对上游 API 的记忆动手；`cargo fmt --check` 只解析不类型检查，
这种错本地全绿、只有 CI 编译才暴露。核的时候**不能只核符号名存在，要核实参个数与返回值**——
同一份 registry 源码里 `round` 与 `round_dp` 都存在，只 grep 名字会双双通过，而 `round(&self)`
不收位宽；正解是把签名整行连同参数表一起读出来。仓内既有调用点也是免费的对照证据：
`round_dp(2)` 在财务多处已在使用，替换前先 grep 一遍用法就能对上。
另：等待器 `wait_pr.mjs` 参数是 `<pr> [max_polls] [interval_sec]`，
把 commit sha 当第二参传进去会让 `for(i<NaN)` 一轮不跑、输出文件 0 字节却退 0——
判定器零检测能力时的退出码不可信，读结论前先确认真的产出了行。

同族第四条（判据作用面，本轮实测）：`rustfmt_repo_check.sh` 的第一参是**车道绝对路径**，
缺省时回落 `lane_env` 的 `REPO_ROOT`。在车道目录里 `cd` 后不带参数执行，它检查的是主干根
而不是车道，打印的 `root=` 会自曝这一点——`FMT_REPO_OK files=1882` 完全可能是在替别的树担保。
**判法**：读门输出先核 `root=` 与文件数是否等于本车道，或直接把车道绝对路径作为第一参传进去。

同族第三条（本轮实测，方向与既有记载相反）：本地 `rustfmt_repo_check.sh` 报 `FMT_REPO_OK`
而 CI 的 🔧 Rust 格式检查 仍红。原因不是本地比 CI 新，而是**本地比 CI 旧**——CI 按
`rust-toolchain.toml` 用 1.94 自带 rustfmt，本地是 1.8.0-stable，两者对多参数宏
（`assert_ne!` / `assert_eq!`）的折行判定不同：新版会把能并的实参并到一行、把超
`fn_call_width` 的调用竖排，旧版对同一文件零输出。**判法**：新写 Rust 文件里的断言与调用
不要卡在宽度边界，先把长实参 `let` 绑定成短名再单行断言，这样两版判定一致；
本地格式门绿**不能**当作 CI 格式门绿的凭据。

## 附带一条工具口径（不算缺陷，会造成本地支假红）

本地 `rustfmt 1.8.0-stable` 对 `use axum::http::{Request, header}` 报"应改成 `{header, Request}`"，而这一行与 `origin/main` 逐字节相同且主干该 job 绿。CI 钉的是旧 toolchain，导入排序规则不同。**判法**：本地格式门点名时先 `git show origin/main:<path>` 比同一段，主干同一写法就不要"顺手修"——按本地版重排会把 CI 根本不要求的改动混进为消红那一笔，制造无关 churn。

