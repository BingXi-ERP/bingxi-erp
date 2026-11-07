//! 报价超折扣阈值配置面补授键的存量库通道聚合迁移域。
//!
//! 本域只落一条授权数据迁移台账，登记为新的顶层域而非并入任何已应用域：已应用域在复用库上
//! 台账已记账、整体跳过，嵌在其中的补授在存量库永远不会执行。链尾新域名在复用库上属 pending，
//! 必然执行。
//! - m0134_grant_quotation_discount_config_keys: 按 roles.code 反查 id，为读面四岗补
//!   `quotation-discount-config:read`、为写面两岗补 `:update`，与 init 矩阵授予逐字符同源；
//!   NOT EXISTS 守卫使重跑等价，命中 0 个角色时以 NOTICE 报出不静默通过。
//!
//! 依赖关系：roles 与 role_permissions 建表（system 域）与 m0129 的配置表与提交人列均早于本域；
//! 资源名 `quotation-discount-config` 登记在
//! `src/services/init_service.rs::PERMISSION_RESOURCES`，矩阵授予在
//! `src/services/init_service_ops/permission.rs` 的高管/销售/系统分组，本域只走存量库通道，
//! 不新增资源键、不动矩阵。
//!
//! down 只按本域角色码回收该资源的两枚动作行，可独立回退，不回收人工另行授予的任何权限。

use sea_orm_migration::prelude::*;

mod m0134_grant_quotation_discount_config_keys;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_quotation_discount_config_grant"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0134_grant_quotation_discount_config_keys::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0134_grant_quotation_discount_config_keys::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
