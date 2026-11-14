//! 微信公众号通知重试队列表建表迁移
//!
//! ## 六要素
//! - **功能**:创建公众号模板消息失败重试队列 `wechat_mp_notification_outbox`。业务事件侧直发
//!   失败的模板消息落此表,后台 worker 按指数退避重试,重试耗尽转 FAILED 死信,保证"发送失败
//!   的通知不静默丢失"。
//! - **调用方**:SeaORM migrator 链,经 `domain/wechat_mp_notification_outbox` 域注册,置于全链
//!   尾。写入面为 `services/event_notification_service::send_wechat_notification` 的发送失败
//!   分支(入队);读取面为 `services/wechat_mp_notification_outbox_worker` 的周期扫描与重试。
//! - **入参**:无(纯 DDL 迁移,不播种数据行)。
//! - **传给谁**:`user_id` 记录目标用户(通知腿是业务旁路,不加外键,用户删除时队列行由
//!   worker 死信自然终结,不阻塞用户删除);`openid` 是公众号收件人标识,入队时已由绑定表
//!   反查得出,重试时直接使用不再反查(绑定关系可能在重试窗口内被解绑,按入队时点快照投递)。
//! - **存什么**:`user_id`(INTEGER NOT NULL)、`kind`(VARCHAR(64) NOT NULL,事件类型稳定
//!   ASCII 标识,与 `processed_events.event_type` 同词表)、`openid`(VARCHAR(64) NOT NULL)、
//!   `business_key`(VARCHAR(128) NOT NULL,去重业务对象标识)、`jump_url`(VARCHAR(512) 可空)、
//!   `fields`(JSONB NOT NULL,模板字段数组 [{key,value}])、`status`(VARCHAR(20) NOT NULL
//!   DEFAULT 'PENDING',词表 PENDING/SENDING/SENT/FAILED)、`error_message`(TEXT 可空)、
//!   `retry_count`(INTEGER NOT NULL DEFAULT 0)、`next_retry_at`(TIMESTAMPTZ 可空,NULL 表示
//!   立即可重试)、`sent_at`(TIMESTAMPTZ 可空)、`created_at`/`updated_at`(TIMESTAMPTZ NOT
//!   NULL DEFAULT now())。
//! - **存哪里**:PostgreSQL `public.wechat_mp_notification_outbox`。
//!
//! ## 形态说明
//! - 建表与索引一律 `IF NOT EXISTS`,幂等可重放:复用库上重复执行不报错,新库上一次成型。
//! - 域内不 INSERT 任何数据行:队列行只由应用侧在真实发送失败后写入,迁移内插队列行在干净库上
//!   恒命中 0 影响,且伪造的失败记录会把无中生有的重试写进台账。
//! - `down` 精确 DROP 本表与扫描索引,无其他表外键引用本表,回退不波及其他域。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS "wechat_mp_notification_outbox" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    kind VARCHAR(64) NOT NULL,
    openid VARCHAR(64) NOT NULL,
    business_key VARCHAR(128) NOT NULL,
    jump_url VARCHAR(512),
    fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_wmp_outbox_status_retry" ON "wechat_mp_notification_outbox"("status", "next_retry_at");
COMMENT ON TABLE "wechat_mp_notification_outbox" IS '公众号模板消息失败重试队列:直发失败落此表由后台 worker 按指数退避重试,耗尽转死信';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."user_id" IS '目标 ERP 用户 ID,通知腿旁路不加外键,用户删除不阻塞本表';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."kind" IS '事件类型稳定 ASCII 标识,与 processed_events.event_type 同词表,出队按它反解模板';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."openid" IS '公众号收件人标识,入队时点按绑定表快照投递,重试不再反查';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."business_key" IS '去重业务对象标识(如报价单号),与首次直发共用同一标识';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."jump_url" IS '模板消息跳转目标,可空';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."fields" IS '模板字段数组 [{key,value}],JSONB,出队时反序列化还原占位符';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."status" IS '队列状态:PENDING 待发送/SENDING 发送中/SENT 已发送/FAILED 死信';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."error_message" IS '最近一次发送失败原因';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."retry_count" IS '已重试次数,达到上限转 FAILED 死信不再重试';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."next_retry_at" IS '下次重试时间,指数退避,NULL 表示立即可重试';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."sent_at" IS '最终发送成功时间';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."created_at" IS '入队时间(TIMESTAMPTZ,建表默认 now())';
COMMENT ON COLUMN "wechat_mp_notification_outbox"."updated_at" IS '队列行最后变更时间(TIMESTAMPTZ,默认 now())';
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
DROP INDEX IF EXISTS "idx_wmp_outbox_status_retry";
DROP TABLE IF EXISTS "wechat_mp_notification_outbox";
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
