//! 用户与微信公众号 openid 绑定关系实体
//!
//! ## 六要素
//! - **功能**:对 `user_wechat_mp_binding` 表的 SeaORM 只读面（发送腿按 user_id 反查 openid，
//!   一个用户可持有多个 openid，任取其一即为目标收件人）。
//! - **调用方**:`services/event_notification_service` 的微信出件腿；
//!   绑定写入面（扫码授权落库）由后续业务事件接入。
//! - **入参**:无（实体定义）。
//! - **传给谁**:SeaORM 查询结果交调用方遍历取 `openid`。
//! - **存什么**:user_id（外键引用 users.id）、openid（唯一）、unionid（可空）、
//!   bind_source（绑定来源标记）、bound_at 与 updated_at。
//! - **存哪里**:PostgreSQL `public.user_wechat_mp_binding`（建表迁移
//!   `migration/src/domain/wechat_mp_binding/m0128_bind_wechat_openid.rs`）。

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "user_wechat_mp_binding")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub user_id: i32,
    pub openid: String,
    pub unionid: Option<String>,
    pub bind_source: String,
    pub bound_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
