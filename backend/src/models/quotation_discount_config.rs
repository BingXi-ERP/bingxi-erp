//! 报价超折扣审批阈值配置 Entity
//!
//! - **功能**：映射单行配置表 `quotation_discount_approval_configs`，承载「超折扣阈值
//!   百分比」这一管理侧政策参数：报价行折扣率严格大于该值即必须经主管审批后才能下发客户。
//!   id 恒 1（DB 侧 `chk_qdac_config_id_fixed` 钉住），取值域 0~100（DB 侧
//!   `chk_qdac_threshold_pct_range` 钉住，列型 DECIMAL(5,2)）。
//! - **调用方**：`services/quotation_discount_service.rs`（提交腿读阈值、配置面读写阈值）。
//! - **入参**：无——本文件只声明列与类型，不接收外部输入。
//! - **传给谁**：SeaORM 查询构造（按 `SINGLE_ROW_ID` 取单行、按主键更新单行）。
//! - **存什么**：阈值百分比（百分点口径，与 `sales_quotations_items.discount_rate` 同刻度，
//!   可直接比较）与更新时间。
//! - **存哪里**：PostgreSQL `public.quotation_discount_approval_configs`（单行）。

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 报价超折扣审批阈值配置（单行）
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "quotation_discount_approval_configs")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    /// 超折扣阈值（百分点）：行折扣率严格大于此值即需主管审批
    pub over_discount_threshold_pct: Decimal,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

/// 单行配置的固定主键（表内只有这一行，DB CHECK 约束 `id = 1`）
pub const SINGLE_ROW_ID: i64 = 1;

impl ActiveModelBehavior for ActiveModel {}
