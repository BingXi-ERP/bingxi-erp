//! BOM/MRP 表下线域：DROP 掉 `bom_items`、`boms`、`mrp_results` 三张表。
//!
//! ## 用途
//! 厂里不纺纱、只采购成品纱线再织染，BOM 与 MRP 整族功能下线；纱批事实由流转卡投纱明细
//! `flow_card_materials` 承载，完工扣料已改按投纱逐行扣减。本域把这三张已无读写方的表从
//! schema 中摘除。
//!
//! ## 语义与幂等
//! - 只 DROP 三张表，不动任何其它表；`material_shortage_alerts` 与
//!   `material_shortage_threshold_configs`（缺料预警）保留，不在本域范围。
//! - `DROP TABLE IF EXISTS`，重跑等价；不使用 CASCADE（详见子迁移头）。
//! - 同批把 `inventory_stocks.replenishment_strategy` 的列注释收回到 reorder_point 与 eoq：
//!   mrp 取值随 MRP 引擎一起摘除，注释若还列它就是误导后继读者的第二个事实来源。
//! - down 只回空表结构、不回数据，属刻意接受的不对称（详见子迁移头）。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入 `business`（这三表当年由 business 域建）：并入已应用的域会在
//! 复用库上因台账已记账被整体跳过，DROP 永不执行。本域不依赖任何链尾之后的对象，
//! 置于链尾即可；三表在更早的 `business` 域已建，DROP 时必然存在（或以 IF EXISTS 命中 0）。

use sea_orm_migration::prelude::*;

mod m0132_drop_bom_mrp_tables;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_bom_mrp_table_drop"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0132_drop_bom_mrp_tables::Migration.up(manager).await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0132_drop_bom_mrp_tables::Migration.down(manager).await
    }
}
