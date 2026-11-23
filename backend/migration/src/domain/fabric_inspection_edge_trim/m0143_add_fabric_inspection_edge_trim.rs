//! m0143：fabric_inspection_record 补修边长度（米）与修边重量（千克）两列。
//! 列语义与写入方见同目录 mod.rs 头注释。
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0143_add_fabric_inspection_edge_trim"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_inspection_record" ADD COLUMN IF NOT EXISTS "edge_trim_length" NUMERIC(12,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_inspection_record" ADD COLUMN IF NOT EXISTS "edge_trim_weight" NUMERIC(12,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "fabric_inspection_record"."edge_trim_length" IS '打卷修边长度（米），实测采集，未修边为 NULL';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "fabric_inspection_record"."edge_trim_weight" IS '打卷修边重量（千克），实测采集，未修边为 NULL';"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_inspection_record" DROP COLUMN IF EXISTS "edge_trim_weight";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_inspection_record" DROP COLUMN IF EXISTS "edge_trim_length";"#,
        )
        .await?;
        Ok(())
    }
}
