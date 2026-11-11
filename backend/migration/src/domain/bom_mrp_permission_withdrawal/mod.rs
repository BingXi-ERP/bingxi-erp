//! BOM/MRP 撤权域：撤销 `boms` 与 `mrp` 两枚权限资源在所有岗位上的历史授权。
//!
//! ## 用途
//! 配合 BOM 与 MRP 整族功能下线（表结构由 `domain/bom_mrp_table_drop` 摘除），把这两枚键在
//! `role_permissions` 里的历史授权行一并撤回，避免存量库残留指向已下线资源的悬空授权。
//!
//! ## 语义与幂等
//! - up 按资源名删除 `boms`/`mrp` 两枚键的全部授权行；down 只回基线持有人（生产经理）的
//!   两枚键，属不完全可逆（详见子迁移头）。
//! - `DROP`/`DELETE` 命中 0 行均属正常，以 RAISE NOTICE 外显不静默。
//! - down 补授用 `ON CONFLICT` 命中真实唯一索引列集合，重复回退等价。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域会在复用库上因台账已记账被整体跳过，
//! 撤权动作永不执行。依赖 `roles` 与 `role_permissions` 建表（system 域）以及
//! `uq_role_permissions_role_resource_action` 唯一索引（v15 域），两者均早于本域。
//! 与初始化矩阵 `services/init_service_ops/permission.rs`、`services/init_service.rs` 的同源
//! 摘除为跨写点依赖，须由主编排确认两处一致（详见子迁移头）。

use sea_orm_migration::prelude::*;

mod m0133_withdraw_bom_mrp_permissions;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_bom_mrp_permission_withdrawal"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0133_withdraw_bom_mrp_permissions::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0133_withdraw_bom_mrp_permissions::Migration
            .down(manager)
            .await
    }
}
