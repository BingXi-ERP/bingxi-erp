//! 可配置单据号的持久化号段计数；同一实际输出前缀与周期内单调递增。
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "system_number_sequences")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub rule_key: String,
    pub entity_table: String,
    pub column_name: String,
    pub output_prefix: String,
    pub period: String,
    pub last_seq: i64,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
