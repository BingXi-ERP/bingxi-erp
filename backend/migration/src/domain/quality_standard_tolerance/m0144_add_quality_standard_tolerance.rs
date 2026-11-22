//! m0144：quality_standards 补允差来源、检测方法与色差/克重/门幅允差五列。
//! 列语义、写入方与校验口径见同目录 mod.rs 头注释。
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0144_add_quality_standard_tolerance"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" ADD COLUMN IF NOT EXISTS "tolerance_source" VARCHAR(50);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" ADD COLUMN IF NOT EXISTS "detection_method" VARCHAR(100);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" ADD COLUMN IF NOT EXISTS "delta_e_tolerance" NUMERIC(8,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" ADD COLUMN IF NOT EXISTS "weight_tolerance" NUMERIC(8,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" ADD COLUMN IF NOT EXISTS "width_tolerance" NUMERIC(8,2);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "quality_standards"."tolerance_source" IS '允差取值来源：product_standard=产品标准，order_agreement=订单约定，confirmed_sample=确认样';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "quality_standards"."detection_method" IS '允差检测方法依据，ISO/GB 方法号原文';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "quality_standards"."delta_e_tolerance" IS '色差允差 ΔE 上限，NULL=未配置';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "quality_standards"."weight_tolerance" IS '克重允差（g/m²），NULL=未配置';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "quality_standards"."width_tolerance" IS '门幅允差（cm），NULL=未配置';"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" DROP COLUMN IF EXISTS "width_tolerance";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" DROP COLUMN IF EXISTS "weight_tolerance";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" DROP COLUMN IF EXISTS "delta_e_tolerance";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" DROP COLUMN IF EXISTS "detection_method";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "quality_standards" DROP COLUMN IF EXISTS "tolerance_source";"#,
        )
        .await?;
        Ok(())
    }
}
