//! 流转卡投纱明细建表：创建 `flow_card_materials`，承载"这块布用的是什么纱、纱的编号、
//! 什么批次、投了多少"的落库事实。
//!
//! ## 用途
//! 厂里不自纺纱，只买成品纱线；纱种与批次事实在生产流转卡上就已明确，不需要 BOM 那套
//! 多级配方与单耗展开。本域为流转卡补一张投纱明细子表，把完工扣料的数据来源从
//! `boms`/`bom_items` 换成本表。
//!
//! ## 语义与幂等
//! - 只建一张新表并挂两条检索索引，不改动任何既有表、不回填、不 UPDATE、不 DELETE。
//! - `CREATE TABLE IF NOT EXISTS` + 具名约束与具名索引，重跑等价。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入 production 或 v15 域：并入已应用的域会在复用库上因台账已记账
//! 而被整体跳过，建表永不执行。依赖 `production_flow_card`（v15 域建）与 `products`
//! （system 域建），两者均早于本域。

use sea_orm_migration::prelude::*;

mod m0131_create_flow_card_materials;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_flow_card_material_input"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0131_create_flow_card_materials::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0131_create_flow_card_materials::Migration
            .down(manager)
            .await
    }
}
