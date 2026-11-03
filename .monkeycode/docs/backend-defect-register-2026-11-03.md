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
