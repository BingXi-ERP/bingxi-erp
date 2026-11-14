//! 微信公众号通知失败重试队列域
//!
//! 本域只落模板消息失败重试队列表 `wechat_mp_notification_outbox`,登记为一条顶层迁移台账:
//! - m0138_notification_outbox_table: 重试队列表(`user_id`/`kind`/`openid`/`business_key`/
//!   `jump_url`/`fields` 记录一次待重投的模板消息;`status` 词表 PENDING/SENDING/SENT/FAILED;
//!   `retry_count`/`next_retry_at` 承载指数退避;`sent_at` 记录最终成功)。
//!   域内不播种数据行——队列行只由应用侧在真实发送失败后写入,迁移内插队列行在干净库上恒
//!   命中 0 影响,且伪造的失败记录会把无中生有的重试写进台账。
//!
//! 注册位置:全链尾。作为新的顶层域而非并入既有域——并入已应用的域在复用库上会因台账已记账
//! 而被整体跳过,导致该表缺席;链尾新域名在复用库上属 pending,必然执行。
//! `down` 精确 DROP 本表并显式 DROP 扫描索引,无外部引用方,可完整回退。

mod m0138_notification_outbox_table;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_wechat_mp_notification_outbox"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0138_notification_outbox_table::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0138_notification_outbox_table::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
