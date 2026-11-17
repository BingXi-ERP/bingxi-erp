#![allow(dead_code)]
//! 调样单行级明细 Model
//!
//! 真实业务单据（WPS 表格取证）的行级明细：品名经 product_id 关联 products，
//! 缸号/颜色/色号/成分/米数/单价/金额直接落列（成分免 product JOIN 口径争议）。
//! 字段族与列型照 `sales_delivery_item.rs`（米数 DECIMAL(12,2)/单价
//! DECIMAL(18,6)/金额 DECIMAL(18,2)；缸号/色号 NOT NULL DEFAULT ''）。
//! 表由 `migration/src/domain/sample_dispatch` 域 m0142 建立。

use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 调样单行级明细 Entity
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "sample_dispatch_items")]
pub struct Model {
    /// 明细 ID（主键）
    #[sea_orm(primary_key)]
    pub id: i32,

    /// 所属调样单 ID（外键）
    pub dispatch_order_id: i32,

    /// 产品 ID（外键）
    pub product_id: i32,

    /// 缸号（照 sales_delivery_item v14 缸号字段族）
    pub dye_lot_no: String,

    /// 色号
    pub color_no: String,

    /// 成分（直接落列，免 product JOIN 口径争议）
    pub composition: String,

    /// 米数
    pub quantity_meters: Decimal,

    /// 单价
    pub unit_price: Decimal,

    /// 金额
    pub amount: Decimal,

    /// 备注
    pub remarks: Option<String>,

    /// 行序
    pub sort_order: i32,
}

/// 调样单行级明细关联关系
#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    /// 明细 - 调样单（多对一）
    #[sea_orm(
        belongs_to = "super::sample_dispatch_order::Entity",
        from = "Column::DispatchOrderId",
        to = "super::sample_dispatch_order::Column::Id"
    )]
    SampleDispatchOrder,

    /// 明细 - 产品（多对一）
    #[sea_orm(
        belongs_to = "super::product::Entity",
        from = "Column::ProductId",
        to = "super::product::Column::Id"
    )]
    Product,
}

impl Related<super::sample_dispatch_order::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::SampleDispatchOrder.def()
    }
}

impl Related<super::product::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Product.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
