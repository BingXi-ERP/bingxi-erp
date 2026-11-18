//! Payment method options expose only enabled wallet codes and names.
//! Database coverage requires migrated PostgreSQL via TEST_DATABASE_URL in CI.
mod test_common;

use axum::{
    Extension, Router,
    body::Body,
    http::{Method, Request, StatusCode},
};
use bingxi_backend::{
    container::AppState,
    handlers::payment_channel_handler::PaymentChannelOption,
    middleware::{
        auth_context::AuthContext,
        permission::{extract_action_from_path, extract_resource_info, method_to_action},
        public_routes::{is_auth_only_path, is_public_path},
    },
    models::payment_channel_config,
    routes::finance,
    utils::response::ApiResponse,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use serde_json::{Value, json};
use std::sync::Arc;
use tower::ServiceExt;

const OPTIONS_PATH: &str = "/api/v1/erp/ap/payment-requests/payment-methods";

#[test]
fn option_serialization_contains_only_code_and_name() {
    let response = ApiResponse::success(vec![PaymentChannelOption {
        channel_code: "wechat_pay".into(),
        channel_name: "WeChat Pay".into(),
    }]);
    assert_eq!(
        serde_json::to_value(response).unwrap(),
        json!({"code": 200, "data": [{"channel_code": "wechat_pay", "channel_name": "WeChat Pay"}]})
    );
}

#[test]
fn options_use_existing_ap_payment_request_read_permission_without_bypass() {
    assert!(!is_public_path(OPTIONS_PATH));
    assert!(!is_auth_only_path(OPTIONS_PATH));
    assert_eq!(
        extract_resource_info(OPTIONS_PATH),
        ("ap-payment-requests".into(), None)
    );
    assert_eq!(extract_action_from_path(OPTIONS_PATH), None);
    assert_eq!(method_to_action(&Method::GET), "read");
}

async fn options(app: &Router) -> Value {
    let response = app
        .clone()
        .oneshot(Request::get(OPTIONS_PATH).body(Body::empty()).unwrap())
        .await
        .expect("options request must complete");
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), 64 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).expect("options response must be JSON")
}

#[tokio::test]
async fn options_exclude_disabled_and_regular_methods_and_never_expose_configuration() {
    let db = Arc::new(test_common::setup_test_db().await);
    let now = chrono::Utc::now().fixed_offset();
    for (code, name, enabled) in [
        ("wechat_pay", "WeChat Pay", true),
        ("alipay", "Alipay", false),
        ("bank_transfer", "Bank transfer", true),
    ] {
        payment_channel_config::ActiveModel {
            channel_code: Set(code.into()),
            channel_name: Set(name.into()),
            enabled: Set(enabled),
            sandbox_mode: Set(true),
            app_id: Set("private-app-id".into()),
            mch_id: Set("private-merchant-id".into()),
            api_key: Set("private-test-key".into()),
            callback_url: Set("https://example.com/private-callback".into()),
            created_at: Set(now),
            updated_at: Set(now),
            created_by: Set(None),
            ..Default::default()
        }
        .insert(db.as_ref())
        .await
        .expect("channel fixture must be inserted");
    }
    let state = AppState {
        db: db.clone(),
        ..Default::default()
    };
    let app = Router::new()
        .nest("/api/v1/erp", finance::ap())
        .with_state(state);
    let unauthenticated = app
        .clone()
        .oneshot(Request::get(OPTIONS_PATH).body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);
    let app = app.layer(Extension(AuthContext {
        user_id: 1,
        username: "payment-option-reader".into(),
        role_id: Some(2),
        department_id: None,
        data_scope: None,
        dept_ids: None,
        dept_member_user_ids: None,
    }));
    assert_eq!(
        options(&app).await,
        json!({"code": 200, "data": [{"channel_code": "wechat_pay", "channel_name": "WeChat Pay"}]})
    );

    payment_channel_config::Entity::update_many()
        .col_expr(
            payment_channel_config::Column::Enabled,
            sea_orm::sea_query::Expr::value(true),
        )
        .filter(payment_channel_config::Column::ChannelCode.eq("alipay"))
        .exec(db.as_ref())
        .await
        .unwrap();
    assert_eq!(
        options(&app).await,
        json!({"code": 200, "data": [
            {"channel_code": "wechat_pay", "channel_name": "WeChat Pay"},
            {"channel_code": "alipay", "channel_name": "Alipay"}
        ]})
    );

    payment_channel_config::Entity::update_many()
        .col_expr(
            payment_channel_config::Column::Enabled,
            sea_orm::sea_query::Expr::value(false),
        )
        .filter(payment_channel_config::Column::ChannelCode.is_in(["wechat_pay", "alipay"]))
        .exec(db.as_ref())
        .await
        .unwrap();
    assert_eq!(options(&app).await, json!({"code": 200, "data": []}));
}
