//! 库存匹冗余库存状态列下线：收掉 `inventory_piece.inventory_status` 这一列形态。
//!
//! ## 用途
//! 该列是真相列 `status` 的照抄副本，全仓零读取方（扫码、台账、外发准入与 CAS 流转只比 `status`，
//! 前端与移动端零消费），历史写入方还漂成三种形态（大写常量、小写字面量、拆匹子卷留空）。
//! 代码侧已停止读写该列并从实体摘除字段，本域把库侧列形态一并收掉，
//! 与 purchase_orders 双状态列收口到 order_status 是同一口径。
//!
//! ## 语义与幂等
//! - DROP 前先探测：若存在该列非空且与 `status` 不同值的行，说明列携带过独立信息，
//!   立即 RAISE EXCEPTION 点名行数与样例 id 并中止，交人工并入 `status` 后重跑；
//!   探测通过（不等的非空行为 0）才 DROP。本域绝不 UPDATE、绝不 DELETE 业务数据。
//! - 列不存在时打 NOTICE 跳过，可任意重跑；down 只加回可空列恢复形态，不伪造数据。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域会在复用库上因台账已记账而被整体跳过，
//! DROP 永不执行。链尾新域在复用库属 pending，必然执行。依赖 inventory_piece 建表与加列
//! （business 与 production 两域），二者均早于本域完成。

use sea_orm_migration::prelude::*;

mod m0127_drop_inventory_piece_inventory_status;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_piece_inventory_status_drop"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0127_drop_inventory_piece_inventory_status::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0127_drop_inventory_piece_inventory_status::Migration
            .down(manager)
            .await
    }
}
