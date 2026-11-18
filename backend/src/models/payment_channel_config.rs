//! 支付通道配置；种子由系统创建，created_by 为 NULL。
use sea_orm::entity::prelude::*;
use serde::Serialize;

#[derive(Clone, PartialEq, DeriveEntityModel, Serialize)]
#[sea_orm(table_name = "payment_channel_configs")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub channel_code: String,
    pub channel_name: String,
    pub enabled: bool,
    pub sandbox_mode: bool,
    pub app_id: String,
    pub mch_id: String,
    #[serde(serialize_with = "serialize_masked_key")]
    pub api_key: String,
    pub callback_url: String,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    pub created_by: Option<i32>,
}

impl std::fmt::Debug for Model {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PaymentChannelConfig")
            .field("id", &self.id)
            .field("api_key", &"***")
            .finish_non_exhaustive()
    }
}

fn serialize_masked_key<S: serde::Serializer>(_: &str, serializer: S) -> Result<S::Ok, S::Error> {
    serializer.serialize_str("***")
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::CreatedBy",
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serialization_never_exposes_api_key() {
        let now = chrono::Utc::now().fixed_offset();
        let mut model = Model {
            id: 1,
            channel_code: "wechat_pay".into(),
            channel_name: "WeChat Pay".into(),
            enabled: false,
            sandbox_mode: true,
            app_id: String::new(),
            mch_id: String::new(),
            api_key: "private-test-key".into(),
            callback_url: String::new(),
            created_at: now,
            updated_at: now,
            created_by: None,
        };
        let json = serde_json::to_value(&model).unwrap();
        assert_eq!(json["api_key"], "***");
        assert!(!json.to_string().contains("private-test-key"));
        assert!(!format!("{model:?}").contains("private-test-key"));
        model.api_key = "pc:v1:ciphertext-test-value".into();
        assert!(!format!("{model:?}").contains(&model.api_key));
        assert!(
            !serde_json::to_string(&model)
                .unwrap()
                .contains(&model.api_key)
        );
        model.api_key.clear();
        assert_eq!(serde_json::to_value(&model).unwrap()["api_key"], "***");
    }
}
