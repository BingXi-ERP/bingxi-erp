use sea_orm::Statement;
use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// 给 sales_delivery 加签收事实三列，并把 DELIVERED 补进状态机语义。
///
/// 真实业务：送货单 shipped 后由客户签收，签收人与签收时间是下游对账
/// 来源门（生成对账单时校验送货单已签收）的事实承载。
/// 词表同步扩 DELIVERED（已签收），写入方在 services/so/delivery.rs 签收端点。
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager<'_>) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .add_column(ColumnDef::new(Alias::new("delivered_at")).timestamp_with_time_zone().null())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .add_column(ColumnDef::new(Alias::new("signed_by")).integer().null())
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .add_column(ColumnDef::new(Alias::new("signed_at")).timestamp_with_time_zone().null())
                    .to_owned(),
            )
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_sql_and_values(
                manager.get_database_backend(),
                r#"COMMENT ON COLUMN sales_delivery.delivered_at IS '送达时间（配送完成，签收前）'"#,
                [],
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_sql_and_values(
                manager.get_database_backend(),
                r#"COMMENT ON COLUMN sales_delivery.signed_by IS '签收人 ID（客户侧或会话用户，签收端点写）'"#,
                [],
            ))
            .await?;
        manager
            .get_connection()
            .execute(Statement::from_sql_and_values(
                manager.get_database_backend(),
                r#"COMMENT ON COLUMN sales_delivery.signed_at IS '签收时间（对账来源门依据）'"#,
                [],
            ))
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager<'_>) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .drop_column(Alias::new("delivered_at"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .drop_column(Alias::new("signed_by"))
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table(Alias::new("sales_delivery"))
                    .drop_column(Alias::new("signed_at"))
                    .to_owned(),
            )
            .await?;
        Ok(())
    }
}
