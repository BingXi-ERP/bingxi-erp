//! 后台支付通道配置：仅保存标记，不联通支付网关。
use axum::{
    Json,
    extract::{Path, State},
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, FromQueryResult, IntoActiveModel, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};

use crate::{
    container::AppState,
    middleware::auth_context::AuthContext,
    models::payment_channel_config,
    utils::{error::AppError, payment_channel_crypto, response::ApiResponse},
};

/// 未提供的字段保留原值；空密钥或脱敏占位符不覆盖已有密钥。
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdatePaymentChannelRequest {
    pub channel_name: Option<String>,
    pub enabled: Option<bool>,
    pub sandbox_mode: Option<bool>,
    pub app_id: Option<String>,
    pub mch_id: Option<String>,
    pub api_key: Option<String>,
    pub callback_url: Option<String>,
}

/// 付款申请下拉选项不包含商户配置或凭证。
#[derive(Debug, Serialize, FromQueryResult)]
pub struct PaymentChannelOption {
    pub channel_code: String,
    pub channel_name: String,
}

pub async fn list_payment_channel_options(
    State(state): State<AppState>,
    _auth: AuthContext,
) -> Result<Json<ApiResponse<Vec<PaymentChannelOption>>>, AppError> {
    let channels = payment_channel_config::Entity::find()
        .select_only()
        .column(payment_channel_config::Column::ChannelCode)
        .column(payment_channel_config::Column::ChannelName)
        .filter(payment_channel_config::Column::Enabled.eq(true))
        .filter(payment_channel_config::Column::ChannelCode.is_in(["wechat_pay", "alipay"]))
        .order_by_asc(payment_channel_config::Column::Id)
        .into_model::<PaymentChannelOption>()
        .all(state.db.as_ref())
        .await?;
    tracing::info!(count = channels.len(), "Payment channel options listed");
    Ok(Json(ApiResponse::success(channels)))
}

pub async fn list_payment_channels(
    State(state): State<AppState>,
    _auth: AuthContext,
) -> Result<Json<ApiResponse<Vec<payment_channel_config::Model>>>, AppError> {
    let channels = payment_channel_config::Entity::find()
        .order_by_asc(payment_channel_config::Column::Id)
        .all(state.db.as_ref())
        .await?;
    tracing::info!(
        count = channels.len(),
        "Payment channel configurations listed"
    );
    Ok(Json(ApiResponse::success(channels)))
}

pub async fn get_payment_channel(
    State(state): State<AppState>,
    _auth: AuthContext,
    Path(channel_code): Path<String>,
) -> Result<Json<ApiResponse<payment_channel_config::Model>>, AppError> {
    let channel = find_channel(state.db.as_ref(), &channel_code).await?;
    tracing::info!(%channel_code, "Payment channel configuration retrieved");
    Ok(Json(ApiResponse::success(channel)))
}

async fn find_channel(
    db: &sea_orm::DatabaseConnection,
    channel_code: &str,
) -> Result<payment_channel_config::Model, AppError> {
    payment_channel_config::Entity::find()
        .filter(payment_channel_config::Column::ChannelCode.eq(channel_code))
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("Payment channel not found"))
}

pub async fn update_payment_channel(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(channel_code): Path<String>,
    Json(req): Json<UpdatePaymentChannelRequest>,
) -> Result<Json<ApiResponse<payment_channel_config::Model>>, AppError> {
    validate_request(&req)?;
    let channel = find_channel(state.db.as_ref(), &channel_code).await?;
    let encrypted_key = prepare_key(req.api_key.as_deref(), |value| {
        payment_channel_crypto::encrypt_for_storage(&channel.channel_code, value)
    })?;
    let mut active = channel.into_active_model();
    if let Some(value) = req.channel_name {
        active.channel_name = Set(value);
    }
    if let Some(value) = req.enabled {
        active.enabled = Set(value);
    }
    if let Some(value) = req.sandbox_mode {
        active.sandbox_mode = Set(value);
    }
    if let Some(value) = req.app_id {
        active.app_id = Set(value);
    }
    if let Some(value) = req.mch_id {
        active.mch_id = Set(value);
    }
    if let Some(ciphertext) = encrypted_key {
        active.api_key = Set(ciphertext);
    }
    if let Some(value) = req.callback_url {
        active.callback_url = Set(value);
    }
    active.updated_at = Set(chrono::Utc::now().fixed_offset());
    let updated = active.update(state.db.as_ref()).await?;
    tracing::info!(%channel_code, user_id = auth.user_id, "Payment channel configuration updated");
    Ok(Json(ApiResponse::success(updated)))
}

fn validate_request(req: &UpdatePaymentChannelRequest) -> Result<(), AppError> {
    for (field, value, max) in [
        ("channel_name", req.channel_name.as_deref(), 100),
        ("app_id", req.app_id.as_deref(), 128),
        ("mch_id", req.mch_id.as_deref(), 128),
        ("callback_url", req.callback_url.as_deref(), 2048),
    ] {
        if value.is_some_and(|value| value.chars().count() > max) {
            return Err(AppError::validation_displayable(format!(
                "{field} must not exceed {max} characters"
            )));
        }
    }
    if let Some(value) = req
        .callback_url
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        let invalid = || {
            AppError::validation_displayable("callback_url must be an HTTPS URL without userinfo")
        };
        let url = url::Url::parse(value).map_err(|_| invalid())?;
        // 检查原始 authority，连空 userinfo（https://@host）也拒绝。
        let authority = value
            .split_once("://")
            .map(|(_, rest)| rest.split(['/', '?', '#']).next().unwrap_or(""));
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || authority.is_none_or(|value| value.contains('@'))
            || value.chars().any(|c| c.is_whitespace() || c == '\\')
        {
            return Err(invalid());
        }
    }
    Ok(())
}

fn prepare_key(
    value: Option<&str>,
    encrypt: impl FnOnce(&str) -> Result<String, AppError>,
) -> Result<Option<String>, AppError> {
    value
        .filter(|value| should_replace_key(value))
        .map(encrypt)
        .transpose()
}

fn should_replace_key(value: &str) -> bool {
    !value.is_empty() && value != "***"
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(field: &str, value: &str) -> UpdatePaymentChannelRequest {
        serde_json::from_value(serde_json::json!({field: value})).unwrap()
    }

    #[test]
    fn boundaries_and_callback_url_are_validated_without_network() {
        for (field, max) in [("channel_name", 100), ("app_id", 128), ("mch_id", 128)] {
            assert!(validate_request(&request(field, "")).is_ok());
            assert!(validate_request(&request(field, &"界".repeat(max))).is_ok());
            assert!(validate_request(&request(field, &"界".repeat(max + 1))).is_err());
        }
        let prefix = "https://example.com/";
        let maximum = format!("{prefix}{}", "a".repeat(2048 - prefix.len()));
        assert!(validate_request(&request("callback_url", &maximum)).is_ok());
        assert!(validate_request(&request("callback_url", &(maximum + "a"))).is_err());
        for value in ["", "https://example.com/callback?channel=one"] {
            assert!(validate_request(&request("callback_url", value)).is_ok());
        }
        for value in [
            "http://example.com",
            "not-a-url",
            "https://",
            "https://user:p@example.com",
            "https://user@example.com",
            "https://@example.com",
            "https://example.com\n",
            "https:example.com",
        ] {
            assert!(validate_request(&request("callback_url", value)).is_err());
        }
    }

    #[test]
    fn credential_preparation_is_lazy_and_fail_closed() {
        for value in [None, Some(""), Some("***")] {
            assert!(
                prepare_key(value, |_| panic!("must not load key"))
                    .unwrap()
                    .is_none()
            );
        }
        let result = prepare_key(Some("test-secret"), |_| {
            Err(AppError::ServiceUnavailable(
                "encryption unavailable".into(),
            ))
        });
        assert!(matches!(result, Err(AppError::ServiceUnavailable(_))));
        assert_eq!(
            prepare_key(Some("test-secret"), |value| {
                assert_eq!(value, "test-secret");
                Ok("encrypted-result".into())
            })
            .unwrap()
            .as_deref(),
            Some("encrypted-result")
        );
    }

    #[test]
    fn empty_and_masked_keys_preserve_credentials() {
        assert!(!should_replace_key(""));
        assert!(!should_replace_key("***"));
        assert!(should_replace_key("replacement-key"));
    }
}
