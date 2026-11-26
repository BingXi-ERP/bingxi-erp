//! 可配置单据号规则；rule_key 保持调用方传入的历史前缀语义。
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "system_number_rules")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub rule_key: String,
    pub name: String,
    pub prefix: String,
    pub seq_width: i32,
    pub reset_mode: String,
    pub version: i32,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::system_number_rule_revision::Entity> for Entity {
    fn to() -> RelationDef {
        super::system_number_rule_revision::Relation::Rule.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
