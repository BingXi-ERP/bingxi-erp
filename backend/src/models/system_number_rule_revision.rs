//! 编码规则追加版本快照；数据库触发器禁止修改与删除。
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "system_number_rule_revisions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub rule_id: i32,
    pub version: i32,
    pub config: Json,
    pub change_reason: String,
    pub changed_by: i32,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::system_number_rule::Entity",
        from = "Column::RuleId",
        to = "super::system_number_rule::Column::Id"
    )]
    Rule,
}

impl Related<super::system_number_rule::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Rule.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
