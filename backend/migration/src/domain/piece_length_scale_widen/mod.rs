//! 库存匹米数列扩位：把 `inventory_piece.length` 的列型从 DECIMAL(12,2) 真正扩到 DECIMAL(18,4)。
//!
//! ## 用途
//! 收回数量腿 `outsourcing_receipt.return_quantity` 是 DECIMAL(14,4)，匹行米数腿
//! `inventory_piece.length` 实际仍是建表时的 DECIMAL(12,2)（production 域的
//! `ADD COLUMN IF NOT EXISTS "length" DECIMAL(18,4)` 对已存在列恒为 no-op，从未生效）。
//! 收回确认把 return_quantity 原值写入 length，两位列在库侧把 190.475 舍成 190.48，
//! 两腿逐分对不平。本域把 length 列型对齐计量口径到 (18,4)，两腿出参随之同为四位小数。
//!
//! ## 语义与幂等
//! - 扩位无损，不改动任何存量值；列已是 ≥4 位小数或列不存在时打 NOTICE 跳过，可任意重跑。
//! - down 收回列型前先探测小数位多于两位的行，命中即 RAISE EXCEPTION 点名中止不截断数据，
//!   无此类行才回退到 DECIMAL(12,2)。本域绝不 UPDATE、绝不 DELETE 业务数据。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域会在复用库上因台账已记账而被整体跳过，
//! 扩位永不执行。依赖 inventory_piece 建表与历史加列（business 与 production 两域），均早于本域。

use sea_orm_migration::prelude::*;

mod m0128_widen_inventory_piece_length_scale;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_piece_length_scale_widen"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0128_widen_inventory_piece_length_scale::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0128_widen_inventory_piece_length_scale::Migration
            .down(manager)
            .await
    }
}
