//! m0147：建立可配置单据号规则与追加版本快照。
//!
//! rule_key 是调用方传入的历史前缀，不随配置修改；prefix 是实际输出前缀。
//! revisions 通过数据库触发器禁止 UPDATE/DELETE，回滚只能追加新版本。
use sea_orm_migration::prelude::*;

mod sql;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0147_add_system_number_rules"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(sql::UP_SCHEMA_SQL).await?;
        conn.execute_unprepared(sql::UP_TRIGGER_SQL).await?;
        conn.execute_unprepared(sql::UP_SEED_SQL).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(sql::DOWN_SQL)
            .await?;
        Ok(())
    }
}
