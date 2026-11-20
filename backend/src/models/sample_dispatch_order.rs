#![allow(dead_code)]
//! 调样单主表 Model
//!
//! 真实业务单据（WPS 表格取证）：行级明细在 `sample_dispatch_item`，
//! 主表承载单据号/客户/制单部门/调样日期与四个账务汇总列
//! （opening_balance=上单结余 / total_amount=货款总计即应收 /
//!   total_collections=实收 / closing_balance=上期欠款，与
//! `ar_reconciliation.rs` 一一对应；开单时由调用方写入）。
//! 表由 `migration/src/domain/sample_dispatch` 域 m0142 建立；
//! 单号格式 `{前缀}{YYMM}-{3位流水}`（样例 BX-DY2607-1356），由开单方按该号段写入。

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 调样单主表 Entity
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "sample_dispatch_orders")]
pub struct Model {
    /// 调样单 ID（主键）
    #[sea_orm(primary_key)]
    pub id: i32,

    /// 单据号（{前缀}{YYMM}-{3位流水}，样例 BX-DY2607-1356；列带唯一索引）
    pub document_no: String,

    /// 客户 ID（customers.id）
    pub customer_id: i32,

    /// 制单部门
    pub department: String,

    /// 调样日期
    pub dispatch_date: NaiveDate,

    /// 上单结余（与 ar_reconciliations.opening_balance 同语义）
    pub opening_balance: Decimal,

    /// 货款总计=应收（与 ar_reconciliations.total_invoices 同语义位）
    pub total_amount: Decimal,

    /// 实收（与 ar_reconciliations.total_collections 同语义）
    pub total_collections: Decimal,

    /// 上期欠款（与 ar_reconciliations.closing_balance 同语义位）
    pub closing_balance: Decimal,

    /// 备注
    pub remarks: Option<String>,

    /// 制单人（users.id）
    pub created_by: Option<i32>,

    /// 创建时间
    pub created_at: DateTime<Utc>,

    /// 更新时间
    pub updated_at: DateTime<Utc>,
}

/// 调样单主表关联关系
#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    /// 调样单 - 客户（多对一）
    #[sea_orm(
        belongs_to = "super::customer::Entity",
        from = "Column::CustomerId",
        to = "super::customer::Column::Id"
    )]
    Customer,
}

impl Related<super::customer::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Customer.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
