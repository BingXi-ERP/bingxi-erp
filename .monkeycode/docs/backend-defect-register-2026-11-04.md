# 后端缺陷登记 2026-11-04

## D-56 财务预警的站内信收件人被写死成触发人，定时扫描链路根本不推消息

现象：e2e 454-06（站内信条目本角色可见且另一角色不可见）在 flow 分片判红，红位落在前置断言"预警未回填 notification_id"。

根因（源码面，非用例面）：backend/src/services/finance_alert_service.rs 的 attach_notification 只把 CreateNotificationRequest.user_id 取作 triggered_by，且 triggered_by 为 None 时直接原样返回 Model，notification_id 保持 None。handlers/finance_alert_handler.rs 的出参只是把 m.notification_id 透传，models/finance_alert.rs 的 notification_id 是 Option i32。

由此两条独立后果：

1 定时扫描没有触发人（cron 路径不携带用户身份），该函数走提前返回分支，预警行落库但站内信永不生成，notification_id 恒空。这直接违反目标 4.6 的"账期预警与库存预警准时推送、推送对象正确"，属功能缺失，不是测试噪声。

2 手工触发扫描时，收件人被降级成"谁点扫描按钮就发给谁"，预警规则自身的 notify_roles 配置在这条路径上完全没被消费。这违反目标 4.7 的"消息不推错人"。按行业口径，预警的投递对象应由规则的接收角色决定，与谁点击扫描无关。

修法方向（待实现，需与账龄规则族同支收口）：attach_notification 的收件人集合改为按预警规则解析，规则无接收角色时按告警级别回落到该域默认岗位；定时扫描路径必须传规则而非 None；notify_roles 的取值面需要与既有词表对齐并补 CHECK 或仓内词表单点（当前该列全仓无词表也无约束，见 capability-gap-2026-11-03 的入参受控性缺口一族）。

验收判据：定时扫描产出的预警行 notification_id 非空，且站内信收件人等于规则配置的接收角色成员；手工扫描不得把收件人降级为点击者；454-06 的本角色可见与另一角色不可见两条断言各自成立且不靠放宽期望取得。
