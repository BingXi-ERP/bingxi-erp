//! 编码规则管理 API 的真实权限门层回归。
//!
//! 功能 验证 GET 读取、PUT 更新与 POST 回滚分别命中 number-rules:read/update，零授权角色统一 403。
//! 调用方 集成测试 crate；装配真实 handler、真实 permission_middleware 与真实 PostgreSQL。
//! 入参 自建授权/零授权角色及操作人；不存在的规则 ID 用于区分“过门后 404”与“门前 403”。
//! 传给谁 `routes::system::number_rules` 与权限中间件。
//! 存什么 仅测试角色、授权与用户；响应收集后清理，不写规则业务数据。
//! 存哪里 PostgreSQL `roles`、`role_permissions`、`users`。

mod test_common;

use std::sync::Arc;

use axum::{
    Router,
    body::Body,
    http::{Method, Request, StatusCode},
    middleware::Next,
    response::Response,
};
use bingxi_backend::container::AppState;
use bingxi_backend::middleware::auth_context::AuthContext;
use bingxi_backend::middleware::permission::{invalidate_permission_cache, permission_middleware};
use bingxi_backend::models::{role, role_permission, user};
use bingxi_backend::routes::system;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde_json::Value;
use tower::ServiceExt;

const GRANTEE_ROLE: &str = "it_number_rules_grantee";
const READER_ROLE: &str = "it_number_rules_reader";
const STRANGER_ROLE: &str = "it_number_rules_stranger";
const ACTOR_ID: i32 = 9471;
const MISSING_RULE_ID: i32 = 947100;

fn now() -> chrono::DateTime<chrono::Utc> {
    chrono::Utc::now()
}

async fn reset_roles(db: &DatabaseConnection) {
    let ids: Vec<i32> = role::Entity::find()
        .filter(role::Column::Code.is_in([GRANTEE_ROLE, READER_ROLE, STRANGER_ROLE]))
        .all(db)
        .await
        .expect("读取测试角色失败")
        .into_iter()
        .map(|row| row.id)
        .collect();
    if !ids.is_empty() {
        role_permission::Entity::delete_many()
            .filter(role_permission::Column::RoleId.is_in(ids.clone()))
            .exec(db)
            .await
            .expect("清理测试授权失败");
    }
    role::Entity::delete_many()
        .filter(role::Column::Code.is_in([GRANTEE_ROLE, READER_ROLE, STRANGER_ROLE]))
        .exec(db)
        .await
        .expect("清理测试角色失败");
}

async fn seed_role(db: &DatabaseConnection, code: &str) -> i32 {
    role::ActiveModel {
        name: Set(format!("编码规则门锁角色 {code}")),
        code: Set(code.to_string()),
        is_system: Set(false),
        data_scope: Set("all".to_string()),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("创建测试角色失败")
    .id
}

async fn seed_grant(db: &DatabaseConnection, role_id: i32, action: &str) {
    role_permission::ActiveModel {
        role_id: Set(role_id),
        resource_type: Set("number-rules".to_string()),
        resource_id: Set(None),
        action: Set(action.to_string()),
        allowed: Set(true),
        permission_code: Set(None),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("创建测试授权失败");
}

fn app(db: Arc<DatabaseConnection>, role_id: i32) -> Router {
    let state = AppState {
        db,
        ..AppState::default()
    };
    async fn inject_auth(
        axum::extract::State(auth): axum::extract::State<AuthContext>,
        mut request: Request<Body>,
        next: Next,
    ) -> Response {
        request.extensions_mut().insert(auth);
        next.run(request).await
    }
    let auth = AuthContext {
        user_id: ACTOR_ID,
        username: "it_number_rules_actor".to_string(),
        role_id: Some(role_id),
        department_id: None,
        data_scope: Some("all".to_string()),
        dept_ids: None,
        dept_member_user_ids: None,
    };
    Router::new()
        .nest("/api/v1/erp", system::number_rules())
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            permission_middleware,
        ))
        .layer(axum::middleware::from_fn_with_state(auth, inject_auth))
        .with_state(state)
}

async fn call(app: &Router, method: Method, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let request = Request::builder()
        .method(method)
        .uri(uri)
        .header("content-type", "application/json")
        .body(match body {
            Some(value) => Body::from(value.to_string()),
            None => Body::empty(),
        })
        .unwrap();
    let response = app.clone().oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap();
    let text = String::from_utf8_lossy(&bytes).to_string();
    (
        status,
        serde_json::from_str(&text).unwrap_or(Value::String(text)),
    )
}

#[tokio::test]
async fn read_update_and_rollback_permissions_are_enforced_independently() {
    let db = Arc::new(test_common::setup_test_db().await);
    reset_roles(db.as_ref()).await;
    if user::Entity::find_by_id(ACTOR_ID)
        .one(db.as_ref())
        .await
        .expect("查询测试操作人失败")
        .is_none()
    {
        user::ActiveModel {
            id: Set(ACTOR_ID),
            username: Set("it_number_rules_actor".to_string()),
            password_hash: Set("test-only-not-a-real-hash".to_string()),
            real_name: Set(Some("编码规则门锁操作人".to_string())),
            is_active: Set(true),
            is_totp_enabled: Set(false),
            created_at: Set(now()),
            updated_at: Set(now()),
            ..Default::default()
        }
        .insert(db.as_ref())
        .await
        .expect("创建测试操作人失败");
    }

    let grantee = seed_role(db.as_ref(), GRANTEE_ROLE).await;
    let reader = seed_role(db.as_ref(), READER_ROLE).await;
    let stranger = seed_role(db.as_ref(), STRANGER_ROLE).await;
    seed_grant(db.as_ref(), grantee, "read").await;
    seed_grant(db.as_ref(), grantee, "update").await;
    seed_grant(db.as_ref(), reader, "read").await;
    invalidate_permission_cache(grantee);
    invalidate_permission_cache(reader);
    invalidate_permission_cache(stranger);

    let grantee_app = app(db.clone(), grantee);
    let reader_app = app(db.clone(), reader);
    let stranger_app = app(db.clone(), stranger);
    let list_allowed = call(
        &grantee_app,
        Method::GET,
        "/api/v1/erp/system/number-rules",
        None,
    )
    .await;
    let list_denied = call(
        &stranger_app,
        Method::GET,
        "/api/v1/erp/system/number-rules",
        None,
    )
    .await;
    let update_body = serde_json::json!({
        "prefix": "NX", "seq_width": 5, "reset_mode": "month", "version": 1,
        "change_reason": "权限门锁探针"
    });
    let update_allowed = call(
        &grantee_app,
        Method::PUT,
        &format!("/api/v1/erp/system/number-rules/{MISSING_RULE_ID}"),
        Some(update_body),
    )
    .await;
    let update_denied = call(
        &stranger_app,
        Method::PUT,
        &format!("/api/v1/erp/system/number-rules/{MISSING_RULE_ID}"),
        Some(serde_json::json!({
            "prefix": "NX", "seq_width": 5, "reset_mode": "month", "version": 1,
            "change_reason": "权限门锁探针"
        })),
    )
    .await;
    let rollback_body = serde_json::json!({
        "revision_id": 1, "version": 2, "change_reason": "权限门锁探针"
    });
    let rollback_allowed = call(
        &grantee_app,
        Method::POST,
        &format!("/api/v1/erp/system/number-rules/{MISSING_RULE_ID}/rollback"),
        Some(rollback_body),
    )
    .await;
    let rollback_denied = call(
        &stranger_app,
        Method::POST,
        &format!("/api/v1/erp/system/number-rules/{MISSING_RULE_ID}/rollback"),
        Some(serde_json::json!({
            "revision_id": 1, "version": 2, "change_reason": "权限门锁探针"
        })),
    )
    .await;
    let rollback_query_downgrade_denied = call(
        &reader_app,
        Method::POST,
        &format!("/api/v1/erp/system/number-rules/{MISSING_RULE_ID}/rollback?action=print"),
        Some(serde_json::json!({
            "revision_id": 1, "version": 2, "change_reason": "只读角色不得借查询参数回滚"
        })),
    )
    .await;

    reset_roles(db.as_ref()).await;
    user::Entity::delete_by_id(ACTOR_ID)
        .exec(db.as_ref())
        .await
        .expect("清理测试操作人失败");
    invalidate_permission_cache(grantee);
    invalidate_permission_cache(reader);
    invalidate_permission_cache(stranger);

    assert_eq!(
        list_allowed.0,
        StatusCode::OK,
        "持 read 键应可读列表: {}",
        list_allowed.1
    );
    let items = list_allowed.1["data"]["items"]
        .as_array()
        .expect("列表信封应含 data.items");
    assert!(items.len() >= 6, "迁移播种的六枚规则必须可读");
    for (status, body) in [
        list_denied,
        update_denied,
        rollback_denied,
        rollback_query_downgrade_denied,
    ] {
        assert_eq!(
            status,
            StatusCode::FORBIDDEN,
            "缺少所需权限的角色必须被拒绝: {body}"
        );
        assert_eq!(
            body["code"].as_str(),
            Some("FORBIDDEN"),
            "拒绝必须使用统一机器码: {body}"
        );
    }
    for (status, body) in [update_allowed, rollback_allowed] {
        assert_eq!(
            status,
            StatusCode::NOT_FOUND,
            "持 update 键必须过门并落到不存在规则: {body}"
        );
        assert_eq!(
            body["code"].as_str(),
            Some("NOT_FOUND"),
            "过门后必须为业务 NOT_FOUND: {body}"
        );
    }
}
