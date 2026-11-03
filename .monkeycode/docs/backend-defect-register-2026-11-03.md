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

