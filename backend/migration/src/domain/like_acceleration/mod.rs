//! 列表模糊查询加速域
//!
//! 本域只给 services 层 like 过滤落到的高频列表查询列建 pg_trgm GIN 索引，登记为
//! 一条顶层迁移台账：
//! - m0140_like_trgm_gin_indexes：pg_trgm 扩展与 30 枚列级 GIN 索引（收录口径与
//!   逐列核实见该文件头）。查询语句零改动，`%关键字%` 前导通配形态下 B-tree 失效
//!   的列由 trigram GIN 接管。
//!
//! 注册位置：全链尾。作为新的顶层域而非并入既有域——并入已应用的域在复用库上台账
//! 已记账、整体跳过，建索引语句在存量库永远不会执行；链尾新域名在复用库上属
//! pending，必然执行。`down` 精确 DROP 本域索引，不卸载 pg_trgm 扩展。

mod m0140_like_trgm_gin_indexes;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_like_acceleration"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0140_like_trgm_gin_indexes::Migration.up(manager).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0140_like_trgm_gin_indexes::Migration.down(manager).await?;
        Ok(())
    }
}
