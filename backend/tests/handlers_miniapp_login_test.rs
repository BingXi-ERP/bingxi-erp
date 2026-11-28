mod test_common;

use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
    routing::post,
};
use bingxi_backend::config::settings::MiniappConfig;
use bingxi_backend::container::AppState;
use bingxi_backend::docs::ApiDoc;
use bingxi_backend::handlers::auth_handler::miniapp_login;
use bingxi_backend::middleware::public_routes::{is_auth_only_path, is_public_path};
use bingxi_backend::models::miniapp_identity::{self, ActiveModel as IdentityActiveModel};
use bingxi_backend::models::user::{self, ActiveModel as UserActiveModel};
use bingxi_backend::services::wechat_miniapp_service::WechatMiniappService;
use bingxi_backend::utils::cache::AppCache;
use chrono::Utc;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, EntityTrait};
use serde_json::{Value, json};
use tower::ServiceExt;
use utoipa::OpenApi;
use uuid::Uuid;
use validator::Validate;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

const LOGIN_PATH: &str = "/api/v1/erp/auth/miniapp/login";
const EXISTING_PHONE: &str = "13900000000";
const OTHER_PHONE: &str = "13800000000";

struct TestWechat {
    state: AppState,
    appid: String,
    _server: MockServer,
}

impl TestWechat {
    async fn start(openid: &str, phone: &str) -> Self {
        let server = MockServer::start().await;
        let appid = format!("test-appid-{}", Uuid::new_v4());
        Mock::given(method("GET"))
            .and(path("/sns/jscode2session"))
            .respond_with(ResponseTemplate::new(200).set_body_json(json!({
                "openid": openid,
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
                "phone_info": { "purePhoneNumber": phone }
            })))
            .mount(&server)
            .await;

        let state = AppState {
            db: Arc::new(test_common::setup_test_db().await),
            miniapp: MiniappConfig {
                appid: Some(appid.clone()),
                secret: Some("test-secret".to_string()),
                api_base_url: server.uri(),
            },
            ..Default::default()
        };
        Self {
            state,
            appid,
            _server: server,
        }
    }

    fn app(&self) -> Router {
        Router::new()
            .route(LOGIN_PATH, post(miniapp_login))
            .with_state(self.state.clone())
    }
}

async fn insert_user_with_flags(
    username: &str,
    phone: &str,
    is_active: bool,
    is_totp_enabled: bool,
) -> user::Model {
    let db = test_common::connect_live_db().await;
    UserActiveModel {
        username: Set(username.to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(phone.to_string())),
        is_active: Set(is_active),
        is_totp_enabled: Set(is_totp_enabled),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap()
}

async fn login_request(app: &Router, code: &str, phone_code: &str) -> axum::response::Response {
    app.clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(LOGIN_PATH)
                .header("content-type", "application/json")
                .header("x-requested-with", "XMLHttpRequest")
                .header("x-real-ip", "203.0.113.10")
                .header("user-agent", "miniapp-test")
                .body(Body::from(
                    json!({ "code": code, "phone_code": phone_code }).to_string(),
                ))
                .unwrap(),
        )
        .await
        .unwrap()
}

async fn response_json(response: axum::response::Response) -> Value {
    let bytes = axum::body::to_bytes(response.into_body(), 1024 * 1024)
        .await
        .unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

fn error_code(body: &Value) -> Option<&str> {
    body.get("code").and_then(Value::as_str)
}

#[tokio::test]
async fn miniapp_login_rejects_unknown_phone_without_creating_user() {
    let wechat = TestWechat::start("openid-unknown", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = response_json(response).await;
    assert_eq!(body["message"], "手机号未绑定 ERP 用户");
    assert_eq!(error_code(&body), Some("NOT_FOUND"));
    assert_eq!(user::Entity::find().all(&db).await.unwrap().len(), 0);
    assert_eq!(
        miniapp_identity::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .len(),
        0
    );
}

#[tokio::test]
async fn miniapp_login_binds_existing_phone_and_returns_login_envelope() {
    let wechat = TestWechat::start("openid-existing", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    let user = UserActiveModel {
        username: Set("existing-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(EXISTING_PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::OK);
    let mut response = response;
    let set_cookie = response.headers().get_all(axum::http::header::SET_COOKIE);
    assert!(set_cookie.iter().any(|value| {
        value
            .to_str()
            .is_ok_and(|raw| raw.starts_with("access_token=") && raw.contains("HttpOnly"))
    }));
    assert!(set_cookie.iter().any(|value| {
        value
            .to_str()
            .is_ok_and(|raw| raw.starts_with("refresh_token=") && raw.contains("HttpOnly"))
    }));
    let body = response_json(response).await;
    assert_eq!(body["data"]["user"]["id"], user.id);
    assert_eq!(body["data"]["user"]["phone"], EXISTING_PHONE);
    assert!(body["data"]["csrf_token"].as_str().is_some());
    assert!(body["data"]["permissions"].is_array());
    assert!(body["data"]["password_expired"].is_boolean());
    assert!(body.get("token").is_none());
    assert!(body.get("refresh_token").is_none());

    let bindings = miniapp_identity::Entity::find().all(&db).await.unwrap();
    assert_eq!(bindings.len(), 1);
    assert_eq!(bindings[0].user_id, user.id);
    assert_eq!(bindings[0].openid, "openid-existing");
    assert_eq!(bindings[0].appid, wechat.appid);
}

#[tokio::test]
async fn miniapp_login_reuses_identity_without_duplicate_binding() {
    let wechat = TestWechat::start("openid-repeat", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    let user = UserActiveModel {
        username: Set("repeat-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(EXISTING_PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();

    for _ in 0..2 {
        let response = login_request(&wechat.app(), "wx-code", "phone-code").await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(body["data"]["user"]["id"], user.id);
    }

    let bindings = miniapp_identity::Entity::find().all(&db).await.unwrap();
    assert_eq!(bindings.len(), 1);
    assert_eq!(bindings[0].user_id, user.id);
}

#[tokio::test]
async fn miniapp_login_rejects_duplicate_phone_without_binding() {
    let wechat = TestWechat::start("openid-duplicate-phone", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    for username in ["duplicate-user-a", "duplicate-user-b"] {
        UserActiveModel {
            username: Set(username.to_string()),
            password_hash: Set("unused-for-miniapp-login".to_string()),
            phone: Set(Some(EXISTING_PHONE.to_string())),
            is_active: Set(true),
            is_totp_enabled: Set(false),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
            ..Default::default()
        }
        .insert(&db)
        .await
        .unwrap();
    }

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(
        miniapp_identity::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .len(),
        0
    );
}

#[tokio::test]
async fn miniapp_identity_cannot_switch_to_another_existing_phone() {
    let wechat = TestWechat::start("openid-bound", OTHER_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    let bound_user = UserActiveModel {
        username: Set("bound-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(EXISTING_PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();
    UserActiveModel {
        username: Set("other-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(OTHER_PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();
    IdentityActiveModel {
        appid: Set(wechat.appid.clone()),
        openid: Set("openid-bound".to_string()),
        user_id: Set(bound_user.id),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let bindings = miniapp_identity::Entity::find().all(&db).await.unwrap();
    assert_eq!(bindings.len(), 1);
    assert_eq!(bindings[0].user_id, bound_user.id);
}

#[tokio::test]
async fn miniapp_login_rejects_inactive_user_without_creating_binding() {
    let wechat = TestWechat::start("openid-inactive", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    insert_user_with_flags("inactive-user", EXISTING_PHONE, false, false).await;

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        miniapp_identity::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .len(),
        0
    );
}

#[tokio::test]
async fn miniapp_login_does_not_bypass_totp() {
    let wechat = TestWechat::start("openid-totp", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    insert_user_with_flags("totp-user", EXISTING_PHONE, true, true).await;

    let response = login_request(&wechat.app(), "wx-code", "phone-code").await;

    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        miniapp_identity::Entity::find()
            .all(&db)
            .await
            .unwrap()
            .len(),
        0
    );
}

#[tokio::test]
async fn miniapp_identity_unique_key_and_user_foreign_key_are_enforced() {
    let wechat = TestWechat::start("openid-constraint", EXISTING_PHONE).await;
    let db = wechat.state.db.as_ref().clone();
    let user = UserActiveModel {
        username: Set("constraint-user".to_string()),
        password_hash: Set("unused-for-miniapp-login".to_string()),
        phone: Set(Some(EXISTING_PHONE.to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .unwrap();
    let identity = |user_id| IdentityActiveModel {
        appid: Set(wechat.appid.clone()),
        openid: Set("openid-constraint".to_string()),
        user_id: Set(user_id),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    };
    identity(user.id).insert(&db).await.unwrap();
    assert!(identity(user.id).insert(&db).await.is_err());
    assert!(identity(i32::MAX).insert(&db).await.is_err());
}

#[tokio::test]
async fn miniapp_access_token_is_reused_before_expiry() {
    let server = MockServer::start().await;
    let token_mock = Mock::given(method("GET"))
        .and(path("/cgi-bin/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "cached-token",
            "expires_in": 7200
        })))
        .expect(1)
        .mount_as_scoped(&server)
        .await;
    let phone_mock = Mock::given(method("POST"))
        .and(path("/wxa/business/getuserphonenumber"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "phone_info": { "purePhoneNumber": EXISTING_PHONE }
        })))
        .expect(2)
        .mount_as_scoped(&server)
        .await;
    let config = MiniappConfig {
        appid: Some(format!("cache-appid-{}", Uuid::new_v4())),
        secret: Some("test-secret".to_string()),
        api_base_url: server.uri(),
    };
    let cache = Arc::new(AppCache::new());
    let service = WechatMiniappService::with_cache(&config, cache.clone()).unwrap();
    let second_service = WechatMiniappService::with_cache(&config, cache).unwrap();

    assert_eq!(
        service.get_phone_number("phone-code-a").await.unwrap(),
        EXISTING_PHONE
    );
    assert_eq!(
        second_service
            .get_phone_number("phone-code-b")
            .await
            .unwrap(),
        EXISTING_PHONE
    );
    assert_eq!(token_mock.received_requests().await.len(), 1);
    assert_eq!(phone_mock.received_requests().await.len(), 2);
}

#[tokio::test]
async fn miniapp_access_token_refreshes_when_ttl_reaches_refresh_window() {
    let server = MockServer::start().await;
    let token_mock = Mock::given(method("GET"))
        .and(path("/cgi-bin/token"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "access_token": "short-lived-token",
            "expires_in": 1
        })))
        .expect(2)
        .mount_as_scoped(&server)
        .await;
    let _phone_mock = Mock::given(method("POST"))
        .and(path("/wxa/business/getuserphonenumber"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "phone_info": { "purePhoneNumber": EXISTING_PHONE }
        })))
        .expect(2)
        .mount_as_scoped(&server)
        .await;
    let config = MiniappConfig {
        appid: Some(format!("refresh-appid-{}", Uuid::new_v4())),
        secret: Some("test-secret".to_string()),
        api_base_url: server.uri(),
    };
    let service = WechatMiniappService::with_cache(&config, Arc::new(AppCache::new())).unwrap();

    service.get_phone_number("phone-code-a").await.unwrap();
    service.get_phone_number("phone-code-b").await.unwrap();
    assert_eq!(token_mock.received_requests().await.len(), 2);
    assert_eq!(_phone_mock.received_requests().await.len(), 2);
}

#[tokio::test]
async fn miniapp_service_rejects_wechat_error_responses() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/sns/jscode2session"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "errcode": 40029,
            "errmsg": "invalid code"
        })))
        .mount(&server)
        .await;
    let config = MiniappConfig {
        appid: Some(format!("error-appid-{}", Uuid::new_v4())),
        secret: Some("test-secret".to_string()),
        api_base_url: server.uri(),
    };
    let service = WechatMiniappService::with_cache(&config, Arc::new(AppCache::new())).unwrap();

    let error = service.code2session("invalid-code").await.unwrap_err();
    assert!(error.to_string().contains("code2session"));
}

#[tokio::test]
async fn miniapp_configuration_is_optional_and_debug_redacts_secret() {
    let config = MiniappConfig::default();
    assert_eq!(config.appid, None);
    assert_eq!(config.secret, None);
    assert_eq!(config.api_base_url, "https://api.weixin.qq.com");

    let configured = MiniappConfig {
        appid: Some("visible-appid".to_string()),
        secret: Some("must-not-appear".to_string()),
        api_base_url: "https://example.invalid".to_string(),
    };
    let debug = format!("{configured:?}");
    assert!(!debug.contains("must-not-appear"));
    assert!(debug.contains("secret_configured: true"));
}

#[test]
fn miniapp_route_is_public_but_not_auth_only_and_is_documented() {
    assert!(is_public_path(LOGIN_PATH));
    assert!(is_public_path(&format!("{LOGIN_PATH}?source=test")));
    assert!(!is_public_path(&format!("{LOGIN_PATH}/other")));
    assert!(!is_auth_only_path(LOGIN_PATH));

    let document = ApiDoc::openapi();
    assert!(document.paths.paths.contains_key(LOGIN_PATH));
    let schema = document
        .components
        .as_ref()
        .and_then(|components| components.schemas.get("MiniappLoginRequest"));
    assert!(schema.is_some(), "MiniappLoginRequest 必须注册进 OpenAPI");
}

#[test]
fn miniapp_login_rejects_blank_codes_before_calling_wechat() {
    let request: Result<bingxi_backend::handlers::auth_handler::MiniappLoginRequest, _> =
        serde_json::from_value(json!({ "code": " ", "phone_code": "" }));
    let request = request.expect("请求反序列化成功后才能执行字段校验");
    let error = request
        .validate()
        .expect_err("空白 code/phone_code 必须校验失败");
    assert!(error.field_errors().contains_key("code"));
    assert!(error.field_errors().contains_key("phone_code"));
}
