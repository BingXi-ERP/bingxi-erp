#![allow(dead_code)]
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "quality_standards")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub standard_name: String,
    pub standard_code: String,
    pub standard_type: String,
    pub product_id: Option<i32>,
    pub product_category_id: Option<i32>,
    pub version: String,
    pub previous_version_id: Option<i32>,
    pub content: String,
    pub technical_requirements: Option<String>,
    pub testing_methods: Option<String>,
    pub acceptance_criteria: Option<String>,
    /// 允差取值来源：product_standard（产品标准）/ order_agreement（订单约定）/ confirmed_sample（确认样）
    pub tolerance_source: Option<String>,
    /// 允差检测方法依据（ISO/GB 方法号，如 ISO 5084 / GB/T 3813.1）
    pub detection_method: Option<String>,
    /// 色差允差 ΔE
    #[sea_orm(column_type = "Decimal(Some((8, 2)))")]
    pub delta_e_tolerance: Option<Decimal>,
    /// 克重允差（g/m²）
    #[sea_orm(column_type = "Decimal(Some((8, 2)))")]
    pub weight_tolerance: Option<Decimal>,
    /// 门幅允差（cm）
    #[sea_orm(column_type = "Decimal(Some((8, 2)))")]
    pub width_tolerance: Option<Decimal>,
    #[sea_orm(column_type = "Date")]
    pub effective_date: NaiveDate,
    pub expiry_date: Option<NaiveDate>,
    pub status: String,
    pub approved_by: Option<i32>,
    pub approved_at: Option<DateTime<Utc>>,
    pub created_by: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
