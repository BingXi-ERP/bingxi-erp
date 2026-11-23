//! 验布修边实测列域：fabric_inspection_record 补修边长度/重量两列。
//!
//! 打卷时布边修剪量是成品净重与标签重量的差异来源，原表没有承载列，
//! 打卷请求里的修边实测值因此无处落库、追溯链断在验布单。本域在链尾
//! 加两列可空 NUMERIC(12,2)，写入方为 fabric_inspection_service 的打卷端点。
//!
//! 作为新顶层域注册而非并入 v15：存量库上 v15 已记账会被整体跳过，
//! 并入后两列在复用库永远不会执行。down 只删这两列，不动任何业务数据。

mod m0143_add_fabric_inspection_edge_trim;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_fabric_inspection_edge_trim"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0143_add_fabric_inspection_edge_trim::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0143_add_fabric_inspection_edge_trim::Migration
            .down(manager)
            .await
    }
}
