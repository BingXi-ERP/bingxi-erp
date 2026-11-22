//! 质量标准允差配置域：为 `quality_standards` 补允差取值来源、检测方法与
//! 色差/克重/门幅三项允差列。
//!
//! ## 用途
//! 面料业务不设跨品类统一 ΔE/克重/门幅阈值；每条质量标准按业务约定单独配置
//! 允差取值来源（产品标准/订单约定/确认样）与 ISO/GB 检测方法，判定留痕由
//! 质检/验布记录承载。写入方 services/quality_standard_service.rs；
//! 读取方为质量标准 CRUD 与后续允差判定链路。
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
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0144_add_quality_standard_tolerance::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
