//! 批色库存联动失败持久化待补标记域：为 `bulk_color_approval` 补两列
//! NOT NULL DEFAULT FALSE 的布尔标记 `stock_grade_sync_pending` / `stock_scrap_sync_pending`。
//!
//! ## 用途
//! 批色降级（approved→downgraded）/报废（approved|pending|sampled→scrapped）在状态
//! 转换提交后联动库存（inventory_stocks.grade 降级、stock_status/quality_status 报废），
//! 该联动此前失败只打 warn 日志——重启即失忆，库存等级/报废标记永久缺失且无库内信号。
//! 补列后：联动失败置 true（持久化待补标记），联动成功（含人工补执行后的清除）置 false。
//! 写入方 services/bulk_color_approval_service.rs；读取方为人工对账（对账扫描任务后续批次）。
//!
//! ## 语义与幂等
//! - 两列 NOT NULL DEFAULT FALSE：存量行语义 = "无待补"，不回填、不改写任何存量值；
//! - `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` 幂等可重放，无备份表需求。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域在复用库上会因台账已记账而被整体
//! 跳过，列永不补上。链尾新域名在复用库上属 pending，必然执行。依赖
//! `bulk_color_approval` 建表（finance 域），早于本域完成。

mod m0142_add_bulk_color_stock_sync_pending;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_bulk_color_stock_sync_pending"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0142_add_bulk_color_stock_sync_pending::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0142_add_bulk_color_stock_sync_pending::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
