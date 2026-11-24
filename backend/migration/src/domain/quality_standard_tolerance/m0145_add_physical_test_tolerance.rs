//! m0145：fabric_physical_test_record 补判定留痕三列——允差来源、检测方法、允差值。
//! 列语义、写入方与判定口径见同目录 mod.rs 头注释。
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0145_add_physical_test_tolerance"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" ADD COLUMN IF NOT EXISTS "tolerance_source" VARCHAR(50);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" ADD COLUMN IF NOT EXISTS "detection_method" VARCHAR(100);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" ADD COLUMN IF NOT EXISTS "tolerance_value" NUMERIC(8,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "fabric_physical_test_record"."tolerance_source" IS '判定采用的允差取值来源：product_standard=产品标准，order_agreement=订单约定，confirmed_sample=确认样，NULL=未按允差判定';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "fabric_physical_test_record"."detection_method" IS '判定采用的检测方法依据，ISO/GB 方法号原文';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "fabric_physical_test_record"."tolerance_value" IS '判定采用的允差上限，pass=|实测值-标准值|≤本值，NULL=未按允差判定';"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" DROP COLUMN IF EXISTS "tolerance_value";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" DROP COLUMN IF EXISTS "detection_method";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "fabric_physical_test_record" DROP COLUMN IF EXISTS "tolerance_source";"#,
        )
        .await?;
        Ok(())
    }
}
