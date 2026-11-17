//! 调样单实体数据地基域
//!
//! 本域只建调样单两表 `sample_dispatch_orders` / `sample_dispatch_items`
//! （m0142），登记为一条顶层迁移台账：主表带单据号唯一索引（取号并发兜底）
//! 与客户外键，四个账务列与 ar_reconciliations 同语义位；明细表外键挂主表与
//! products，缸号/色号/成分/米数/单价/金额直接落列。
//!
//! 注册位置：全链尾。作为新的顶层域而非并入 business 域——并入已应用的域在
//! 复用库上台账已记账、整体跳过，建表语句在存量库永远不会执行。
//! `down` 先 DROP 明细表再 DROP 主表（引用方先删），不触碰其它对象。

mod m0142_add_sample_dispatch;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_sample_dispatch"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0142_add_sample_dispatch::Migration.up(manager).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0142_add_sample_dispatch::Migration.down(manager).await?;
        Ok(())
    }
}
