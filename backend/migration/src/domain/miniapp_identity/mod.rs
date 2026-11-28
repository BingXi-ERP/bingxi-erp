//! 微信小程序身份绑定表迁移域。
//!
//! 作为独立顶层域注册，复用库上也会执行；`users` 由 system 域先建，
//! 本域只新增绑定表，不创建用户、不播种绑定数据。

mod m0001_create_miniapp_identity;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_miniapp_identity"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0001_create_miniapp_identity::Migration.up(manager).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0001_create_miniapp_identity::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
