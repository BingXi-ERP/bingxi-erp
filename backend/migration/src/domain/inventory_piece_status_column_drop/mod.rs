//! 裁片库存状态死列下线迁移域。
//!
//! 本域只落一支结构迁移，登记为新的顶层域而非并入任何已应用域。并入复用库上台账
//! 已记账的域会被整体跳过，DROP 在存量库永不执行。链尾新域在复用库属 pending，
//! 必然执行。
//!
//! - m0130_drop_inventory_piece_inventory_status 按裁定口径下线
//!   inventory_piece.inventory_status。该列是死列，出库与入库腿均不以它为准，
//!   细码状态单源走同表 status 列（大写权威词表见 models/status/purchase_inventory.rs
//!   的 inventory_piece 模块），后端出参与判定均已同源收口，代码面读写点与实体字段
//!   随本支摘除，代码先改、库后收。
//!
//! 顺序依赖。代码面（models、services、handlers 五处写点）先停止读写该列，本迁移
//! 再探测并 DROP。迁移绝不 UPDATE、绝不 DELETE 业务表数据，删列前把非空原值整表
//! 备份进专属备份表，依赖索引或约束存在时点名判红中止，不存在静默 DROP 或静默
//! 破坏依赖对象的路径。
//!
//! down 加回可空列并按备份逐行还原原值，随后清理备份表，构成精确回退。

use sea_orm_migration::prelude::*;

mod m0130_drop_inventory_piece_inventory_status;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_inventory_piece_status_column_drop"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0130_drop_inventory_piece_inventory_status::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0130_drop_inventory_piece_inventory_status::Migration
            .down(manager)
            .await
    }
}
