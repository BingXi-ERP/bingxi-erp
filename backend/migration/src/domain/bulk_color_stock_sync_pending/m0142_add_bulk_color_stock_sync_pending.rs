//! m0142：bulk_color_approval 补库存联动失败持久化待补标记两列（BOOLEAN NOT NULL DEFAULT FALSE）。
//! 列语义、写入方与回退口径见同目录 mod.rs 头注释。
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0142_add_bulk_color_stock_sync_pending"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" ADD COLUMN IF NOT EXISTS "stock_grade_sync_pending" BOOLEAN NOT NULL DEFAULT FALSE;"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" ADD COLUMN IF NOT EXISTS "stock_scrap_sync_pending" BOOLEAN NOT NULL DEFAULT FALSE;"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "bulk_color_approval"."stock_grade_sync_pending" IS '库存等级降级待补标记：downgraded 联动 inventory_stocks.grade 失败时置 true，补降成功后清回 false';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "bulk_color_approval"."stock_scrap_sync_pending" IS '库存报废标记待补标记：scrapped 联动库存报废失败时置 true，补执行成功后清回 false';"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" DROP COLUMN IF EXISTS "stock_scrap_sync_pending";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" DROP COLUMN IF EXISTS "stock_grade_sync_pending";"#,
        )
        .await?;
        Ok(())
    }
}
