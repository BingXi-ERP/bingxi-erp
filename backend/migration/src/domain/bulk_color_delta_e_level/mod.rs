//! 批色 ΔE 判定等级域：为 `bulk_color_approval` 补两列——
//! `high_light_sensitive`（BOOLEAN NOT NULL DEFAULT FALSE）与 `delta_e_result`（VARCHAR(20) 可空）。
//!
//! ## 用途
//! 客户批色确认（customer_approve）此前把高光敏感参数写死 false：判定一律按普通料阈值
//! （ΔE≤1.2 通过 / ≤2.5 让步接收 / >2.5 拒绝），且 Pass 与 ConditionalAccept 一律落 approved、
//! 无判定等级留痕，高光敏感料的实际通过阈值（ΔE≤0.8）永不生效。补列后：
//! - `high_light_sensitive`：approve 请求携带并落库，判定改用该参数选阈值；
//! - `delta_e_result`：approved 时按 `evaluate_delta_e` 结果写 "pass" / "conditional_accept"
//!   （写入方 services/bulk_color_approval_service.rs::customer_approve；词表即这两个 token）；
//!   reject 不落 approved 无需该值，NULL 表示尚未采集。
//! 读取方为审批详情/列表出参（snake_case 原样带出）与审批历史快照。
//!
//! ## 语义与幂等
//! - `high_light_sensitive` NOT NULL DEFAULT FALSE：存量行语义 = "非高光敏感"，不回填；
//! - `delta_e_result` 可空：存量行未采集，保持 NULL；
//! - `ADD COLUMN IF NOT EXISTS` / `DROP COLUMN IF EXISTS` 幂等可重放，无备份表需求。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域在复用库上会因台账已记账而被整体
//! 跳过，列永不补上。链尾新域名在复用库上属 pending，必然执行。依赖
//! `bulk_color_approval` 建表（finance 域），早于本域完成。

mod m0143_add_bulk_color_delta_e_level;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_bulk_color_delta_e_level"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0143_add_bulk_color_delta_e_level::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0143_add_bulk_color_delta_e_level::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
