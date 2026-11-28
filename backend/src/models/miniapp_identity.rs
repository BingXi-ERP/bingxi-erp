//! 微信小程序身份与 ERP 用户的绑定关系实体。
//!
//! 唯一键 `(appid, openid)` 区分同一微信用户在不同小程序应用下的身份；
//! `user_id` 外键保证绑定目标始终是现有用户，用户删除时绑定随级联回收。

use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "miniapp_identity")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub appid: String,
    pub openid: String,
    pub user_id: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
