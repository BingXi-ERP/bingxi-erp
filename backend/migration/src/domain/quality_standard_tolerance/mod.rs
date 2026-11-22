//! 质量标准允差配置域：为 `quality_standards` 补允差取值来源、检测方法与
//! 色差/克重/门幅三项允差列；为 `fabric_physical_test_record` 补判定留痕三列
//! （允差来源、检测方法、允差值）。
//!
//! ## 用途
//! 判定留痕口径：物理指标检测录入时显式携带允差值/来源/方法（写入方
//! services/fabric_inspection_service.rs），带允差按 |实测-标准| ≤ 允差 派生 pass/fail，
//! 未带允差维持 实测≥标准 即合格 的原规则；三列均可空，存量行语义不变。
//!
//! ## 语义与幂等
//! - 五列均可空：存量行语义 = 未配置允差，不回填、不改写任何存量值；
//! - `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` 幂等可重放。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域在复用库上会因台账已记账
//! 而被整体跳过，列永不补上。链尾新域名在复用库上属 pending，必然执行。
//! 依赖 `quality_standards` 建表（system 域），早于本域完成。

mod m0144_add_quality_standard_tolerance;
mod m0145_add_physical_test_tolerance;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_quality_standard_tolerance"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0144_add_quality_standard_tolerance::Migration
            .up(manager)
            .await?;
        m0145_add_physical_test_tolerance::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0145_add_physical_test_tolerance::Migration
            .down(manager)
            .await?;
        m0144_add_quality_standard_tolerance::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
