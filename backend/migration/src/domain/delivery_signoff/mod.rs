//! 送货单签收事实域（对账来源门的事实承载）。
//!
//! 本域只落一条台账，登记为新的顶层域而非并入已应用域：已应用域在复用库上台账已记账、
//! 整体跳过，嵌在其中的加列语句在存量库永远不会执行（与 http_idempotency_guard 立为
//! 顶层域的同一口径）。链尾新域名在复用库上属 pending，必然执行。
//! - m0139_delivery_signoff_columns: sales_delivery 加 delivered_at 与 signed_by 与
//!   signed_at 三列，签收端点写签收人与签收时间，对账来源门以 signed_at 非空为依据。
//!
//! 依赖关系：sales_delivery 由 business 域的 m0011 建表且在所有库已存在，
//! 加列为可空列无回填需求。signed_by 不加外键（users 表不由迁移创建）。
//! 与写腿的关系：签收端点在 src/services/so/delivery.rs，对账来源门在
//! src/services/ar/vfy_ops/reconciliation.rs。
//!
//! down 只回收本域加的三列。

mod m0139_delivery_signoff_columns;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_delivery_signoff"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0139_delivery_signoff_columns::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0139_delivery_signoff_columns::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
