//! 编码规则与追加版本快照独立迁移域。
//!
//! 该域必须作为顶层迁移登记：已应用的 system 域会整域跳过，挂入其子链的
//! 新表在复用库上不会执行。规则键保持历史前缀语义，版本快照只追加不修改。
use sea_orm_migration::prelude::*;

mod m0147_add_system_number_rules;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_system_number_rules"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0147_add_system_number_rules::Migration.up(manager).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0147_add_system_number_rules::Migration.down(manager).await
    }
}
