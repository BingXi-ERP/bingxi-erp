mod test_common;

use std::sync::Arc;
use std::time::Duration;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
};
use bingxi_backend::config::settings::MiniappConfig;
use bingxi_backend::container::AppState;
use bingxi_backend::handlers::auth_handler::miniapp_login;
use bingxi_backend::models::audit_log;
use bingxi_backend::models::user::{self, ActiveModel as UserActiveModel};
use bingxi_backend::services::audit_log_service::flush;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use serde_json::json;
use tower::ServiceExt;
use uuid::Uuid;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const LOGIN_PATH: &str = "/api/v1/erp/auth/miniapp/login";
const PHONE: &str = "13900000000";

#[tokio::test]
async fn miniapp_login_persists_success_audit_log() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/sns/jscode2session"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "openid": "openid-audit",
            "session_key": "session-key"
        })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/cgi-bin/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "access-token",
            "expires_in": 7200
        })))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(path("/wxa/business/getuserphonenumber"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "phone_info": { "purePhoneNumber": PHONE }
        })))
        .mount(&server)
        .await;

    let db = Arc::new(test_common::setup_test_db().await);
    let state = AppState {
        db: db.clone(),
        miniapp: MiniappConfig {
            appid: Some(format!("audit-appid-{}", Uuid::new_v4())),
            secret: Some("test-secret".to_string()),
            api_base_url: server.uri(),
        },
        ..Default::default()
    };
    let user = UserActiveModel {
        username: Set("audit-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db.as_ref())
    .await
    .unwrap();
    let app = Router::new()
        .route(LOGIN_PATH, post(miniapp_login))
        .with_state(state);

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(LOGIN_PATH)
                .header("content-type", "application/json")
                .header("x-requested-with", "XMLHttpRequest")
                .header("x-real-ip", "203.0.113.10")
                .header("user-agent", "miniapp-test")
                .body(Body::from(
                    json!({ "code": "wx-code", "phone_code": "phone-code" }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let counts = flush(Duration::from_secs(5)).await;
    assert_eq!(counts.pending, 0, "审计总线未在超时前排空");
    assert_eq!(counts.failed, 0, "审计事件落库失败");
    assert_eq!(counts.panicked, 0, "审计消费者发生 panic");
    assert!(counts.inserted >= 1, "至少应落库一条审计事件");
    let login_audit = audit_log::Entity::find()
        .filter(audit_log::Column::OperationType.eq("LOGIN"))
        .filter(audit_log::Column::RequestPath.eq(LOGIN_PATH))
        .filter(audit_log::Column::UserId.eq(user.id))
        .one(db.as_ref())
        .await
        .unwrap();
    assert!(login_audit.is_some(), "小程序登录必须落审计日志");
}
