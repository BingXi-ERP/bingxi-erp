//! m0146：bulk_color_approval 补批色 ΔE 判定地基两列（high_light_sensitive 布尔 NOT NULL
//! DEFAULT FALSE + delta_e_result 可空字符串）。
//! 列语义、写入方与回退口径见同目录 mod.rs 头注释。
use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m0146_add_bulk_color_delta_e_level"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" ADD COLUMN IF NOT EXISTS "high_light_sensitive" BOOLEAN NOT NULL DEFAULT FALSE;"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" ADD COLUMN IF NOT EXISTS "delta_e_result" VARCHAR(20);"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "bulk_color_approval"."high_light_sensitive" IS '高光敏感色判定标志：客户批色确认 approve 请求写入，true 时 ΔE 通过阈值取 0.8（普通料 1.2）';"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"COMMENT ON COLUMN "bulk_color_approval"."delta_e_result" IS '客户批色 ΔE 判定等级：pass / conditional_accept；reject 不落 approved 故无该值，NULL 表示尚未采集';"#,
        )
        .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" DROP COLUMN IF EXISTS "delta_e_result";"#,
        )
        .await?;
        conn.execute_unprepared(
            r#"ALTER TABLE "bulk_color_approval" DROP COLUMN IF EXISTS "high_light_sensitive";"#,
        )
        .await?;
        Ok(())
    }
}
