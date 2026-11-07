//! 审计定位维度契约锁 终端类型与操作页面与单据编号与变更原因与风险标记与操作角色
//!
//! 锁定的真实行为
//! 一 三端各自发起同一写操作 审计行的终端类型与操作页面与单据编号与变更原因都如实落库
//!    真实发 HTTP 请求 三端用不同 User-Agent 与自定义头 走生产 audit_context 中间件判定
//!    终端与页面 走生产 AuditLogService 写入单点落库 再真实回读 audit_logs 表
//! 二 高风险操作可被单独筛出 删除经生产 delete_with_audit 自动落 DELETE 标记
//!    红冲与作废经 mark_audit_high_risk 登记 读取侧按 risk_flag 过滤只回高风险行
//! 三 按单据编号能追溯回同一张单的全链路操作且顺序正确 读取侧 doc_no 精确过滤
//!    结果按 created_at 倒序 最近一次操作排在最前
//! 四 操作人角色码来自会话已加载的角色行 经生产 audit_context 中间件带进审计上下文并如实
//!    落库 读取侧出参带该键且 role_code 过滤走等值（前缀不命中即不是 LIKE）
//!    会话没带角色行时该列落 NULL 不兜底
//! 五 生产业务端点自己把定位维度写进审计行（不借道测试自造的写端点）
//!    作废腿 真打 POST /sales/orders/:id/cancel 单据编号取 sales_orders.order_no 原值
//!    风险标记落 VOID；该端点请求体不承载原因 故 change_reason 断言仍为 NULL
//!    红冲腿 真打 POST /sales/orders/:id/deliveries/:delivery_id/cancel 单据编号取
//!    sales_delivery.delivery_no 原值 风险标记落 REVERSE 原因取请求体原样落库
//!    两腿都再经生产列表端点按真实单号回读 出参键与库内同源
//!
//! 反向钉 无终端头且无可用 UA 时 终端记 UNKNOWN 而不是猜成 PC
//!
//! 隔离 setup_test_db 每次清空业务表 含 audit_logs 与 warehouse 由夹具保证零残留
//! 集成测试整体在 nextest 的 db-integration 串行组内跑 彼此不并发

mod test_common;
use test_common::setup_test_db;

use axum::{
    Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, Request, StatusCode},
    middleware::{Next, from_fn, from_fn_with_state},
    response::{IntoResponse, Response},
};
use bingxi_backend::constants::customer_type;
use bingxi_backend::container::AppState;
use bingxi_backend::handlers::{audit_log_handler, sales_order_handler};
use bingxi_backend::middleware::audit_context::{
    RISK_DELETE, RISK_REVERSE, RISK_VOID, TERMINAL_H5, TERMINAL_MINIPROGRAM, TERMINAL_PC,
    TERMINAL_UNKNOWN, audit_context_middleware, detect_operation_page, mark_audit_high_risk,
    set_audit_change_reason, set_audit_doc_no,
};
use bingxi_backend::middleware::auth_context::{AuthContext, SessionRoleCode};
use bingxi_backend::models::audit_log::{OperationType, Severity};
use bingxi_backend::models::status::sales_delivery as delivery_status;
use bingxi_backend::models::status::sales_order as so_status;
use bingxi_backend::models::{audit_log, customer, role, sales_delivery, sales_order, warehouse};
use bingxi_backend::services::audit_log_service::{AuditEvent, AuditLogService, flush};
use bingxi_backend::utils::error::AppError;
use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::ActiveValue::{NotSet, Set};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter};
use serde_json::{Value, json};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tower::ServiceExt;

/// 写端点 供测试发起一次经生产写入单点的审计落库
/// 在请求作用域内先用 set_audit_doc_no 与 set_audit_change_reason 与 mark_audit_high_risk
/// 把单号与原因与风险登记进活上下文 再经生产 record_async 发送 由写入单点从上下文取五维
async fn write_event_handler(
    State(state): State<AppState>,
    payload: axum::extract::Json<Value>,
) -> Result<Response, AppError> {
    let body = payload.0;
    let op = match body.get("operation").and_then(|v| v.as_str()) {
        Some("CREATE") => OperationType::Create,
        Some("DELETE") => OperationType::Delete,
        _ => OperationType::Update,
    };
    if let Some(d) = body.get("doc_no").and_then(|v| v.as_str()) {
        set_audit_doc_no(Some(d.to_string()));
    }
    if let Some(r) = body.get("change_reason").and_then(|v| v.as_str()) {
        set_audit_change_reason(Some(r.to_string()));
    }
    if let Some(f) = body.get("risk_flag").and_then(|v| v.as_str()) {
        mark_audit_high_risk(f);
    }
    let rid = body
        .get("resource_id")
        .and_then(|v| v.as_str())
        .unwrap_or("r")
        .to_string();
    let event = AuditEvent {
        user_id: Some(100),
        username: Some("audit_terminal_test".to_string()),
        operation_type: op,
        severity: Severity::Info,
        resource_type: Some("audit_terminal_test".to_string()),
        resource_id: Some(rid),
        resource_name: None,
        description: Some("契约定位用例".to_string()),
        request_method: Some("POST".to_string()),
        request_path: Some("/term-write".to_string()),
        before_snapshot: None,
        after_snapshot: None,
    };
    Arc::new(AuditLogService::new(state.db.clone())).record_async(event, None);
    Ok(json_response(json!({"ok": true})))
}

/// 删除端点 走生产 delete_with_audit 验证删除自动落高风险标记
/// doc_no 从查询参数带入 在删除前登记进活上下文 便于把该删除行归到同一张单追溯
async fn delete_event_handler(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    Query(q): Query<HashMap<String, String>>,
) -> Result<Response, AppError> {
    if let Some(d) = q.get("doc_no") {
        set_audit_doc_no(Some(d.clone()));
    }
    if let Some(r) = q.get("change_reason") {
        set_audit_change_reason(Some(r.clone()));
    }
    AuditLogService::delete_with_audit::<warehouse::Entity, _>(
        state.db.as_ref(),
        "warehouse",
        id,
        Some(100),
    )
    .await?;
    Ok(json_response(json!({"ok": true})))
}

fn json_response(v: Value) -> Response {
    axum::Json(v).into_response()
}

/// 测试路由 生产 audit_context 中间件在外层 负责终端与页面判定并绑定活上下文
/// 再叠 inject_auth 提供 admin 会话 供 list 端点的角色门通过
async fn inject_auth(
    State(auth): State<AuthContext>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    request.extensions_mut().insert(auth);
    next.run(request).await
}

async fn admin_role_id(db: &sea_orm::DatabaseConnection) -> i32 {
    role::Entity::find()
        .filter(role::Column::Code.eq("admin"))
        .one(db)
        .await
        .expect("读取 admin 角色失败")
        .expect("迁移应已种入 admin 角色")
        .id
}

fn auth_for(role_id: i32) -> AuthContext {
    AuthContext {
        user_id: 100,
        username: "audit_terminal_admin".to_string(),
        role_id: Some(role_id),
        department_id: Some(1),
        data_scope: Some("all".to_string()),
        dept_ids: None,
        dept_member_user_ids: None,
    }
}

fn build_app(db: sea_orm::DatabaseConnection, role_id: i32) -> Router {
    let state = AppState {
        db: Arc::new(db),
        ..Default::default()
    };
    Router::new()
        .route("/term-write", axum::routing::post(write_event_handler))
        .route(
            "/term-delete/{id}",
            axum::routing::delete(delete_event_handler),
        )
        .route(
            "/audit-logs",
            axum::routing::get(audit_log_handler::list_audit_logs),
        )
        .with_state(state)
        .layer(from_fn_with_state(auth_for(role_id), inject_auth))
        .layer(from_fn(audit_context_middleware))
}

/// 会话角色码注入腿：复刻生产里 auth 把已加载角色行的 roles.code 作为 SessionRoleCode
/// 扩展注入请求的这一步。传 None 时不注入，对应未认证与角色行缺失的真实情形。
async fn inject_session_role(
    State(role_code): State<Option<String>>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    if let Some(code) = role_code {
        request.extensions_mut().insert(SessionRoleCode::new(code));
    }
    next.run(request).await
}

/// 只多挂会话角色码一路的路由，其余端点与 `build_app` 一致。
/// 层序按 axum 语义「后注册者在更外层」排：`inject_session_role` 必须比
/// `audit_context_middleware` 更外，扩展才对内层构造的审计上下文可见（与生产
/// auth 在 audit_context 外层注入同一可见性）；`inject_auth` 只服务 list 端点的
/// admin 角色门，与角色码取值无关。
fn build_app_with_session_role(
    db: sea_orm::DatabaseConnection,
    role_id: i32,
    session_role_code: Option<&str>,
) -> Router {
    let state = AppState {
        db: Arc::new(db),
        ..Default::default()
    };
    Router::new()
        .route("/term-write", axum::routing::post(write_event_handler))
        .route(
            "/audit-logs",
            axum::routing::get(audit_log_handler::list_audit_logs),
        )
        .with_state(state)
        .layer(from_fn_with_state(auth_for(role_id), inject_auth))
        .layer(from_fn(audit_context_middleware))
        .layer(from_fn_with_state(
            session_role_code.map(|s| s.to_string()),
            inject_session_role,
        ))
}

async fn call(
    app: &Router,
    method: Method,
    uri: &str,
    headers: &[(&str, &str)],
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method.clone()).uri(uri);
    for (k, v) in headers {
        builder = builder.header(
            HeaderName::from_lowercase(k.to_ascii_lowercase().as_bytes()).unwrap(),
            HeaderValue::from_str(v).unwrap(),
        );
    }
    let req = match body {
        Some(v) => {
            builder = builder.header("content-type", HeaderValue::from_static("application/json"));
            builder.body(Body::from(v.to_string())).unwrap()
        }
        None => builder.body(Body::empty()).unwrap(),
    };
    let resp = app.clone().oneshot(req).await.unwrap();
    let status = resp.status();
    let bytes = axum::body::to_bytes(resp.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

/// 种一条可删仓库 warehouse 为业务表 夹具每用例清空 固定 id 合法
async fn seed_warehouse(db: &sea_orm::DatabaseConnection, id: i32) {
    warehouse::ActiveModel {
        id: Set(id),
        warehouse_code: Set(format!("WH-AUDIT-{id:04}")),
        name: Set(format!("审计定位仓库-{id}")),
        is_default: Set(false),
        is_active: Set(true),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .unwrap();
}

/// 等异步审计总线把 record_async 的事件落库
async fn drain_bus() {
    let counts = flush(Duration::from_secs(10)).await;
    assert_eq!(
        counts.pending, 0,
        "审计总线应已排空 实际未处理 {} 条",
        counts.pending
    );
}

// ============================================================
// 一枚 三端真实 HTTP 同一写操作 终端与页面与单号与原因如实落库
// ============================================================

#[tokio::test]
async fn three_terminals_same_write_record_terminal_page_docno_reason_faithfully() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_app(db.clone(), role_id);

    let doc = "SO-TERM-20260001";
    let reason = "改单价因汇率调整";

    // PC 桌面浏览器 UA 无小程序自定义头 无页面头 回退 Referer 的路径
    let (s_pc, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[
            (
                "user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            ),
            ("referer", "https://erp.example.com/sales/orders"),
        ],
        Some(json!({
            "operation": "UPDATE",
            "resource_id": "TERM-PC",
            "doc_no": doc,
            "change_reason": reason,
        })),
    )
    .await;
    assert_eq!(s_pc, StatusCode::OK, "PC 写请求应 200");

    // H5 移动端浏览器 UA 带显式页面头
    let (s_h5, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[
            (
                "user-agent",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
            ),
            ("x-page-path", "/h5/sales/order-detail"),
        ],
        Some(json!({
            "operation": "UPDATE",
            "resource_id": "TERM-H5",
            "doc_no": doc,
            "change_reason": reason,
        })),
    )
    .await;
    assert_eq!(s_h5, StatusCode::OK, "H5 写请求应 200");

    // 小程序端 带三枚小程序自定义头 页面头给真实页面路径
    let (s_mp, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[
            ("terminalsource", "6"),
            ("terminalsourcev2", "81"),
            ("app-user-agent", "wx-miniprogram/1.0"),
            ("x-page-path", "/pages/order/detail"),
        ],
        Some(json!({
            "operation": "UPDATE",
            "resource_id": "TERM-MP",
            "doc_no": doc,
            "change_reason": reason,
        })),
    )
    .await;
    assert_eq!(s_mp, StatusCode::OK, "小程序写请求应 200");

    drain_bus().await;

    // 逐端回读断言终端与页面与单号与原因都如实落库
    let pc = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("TERM-PC"))
        .one(&db)
        .await
        .unwrap()
        .expect("PC 审计行应落库");
    assert_eq!(
        pc.terminal_type.as_deref(),
        Some(TERMINAL_PC),
        "PC 桌面 UA 应判 PC 实际 {:?}",
        pc.terminal_type
    );
    assert_eq!(
        pc.operation_page.as_deref(),
        Some("/sales/orders"),
        "PC 无页面头应回退 Referer 路径 实际 {:?}",
        pc.operation_page
    );
    assert_eq!(pc.doc_no.as_deref(), Some(doc), "PC 单号应如实落库");
    assert_eq!(
        pc.change_reason.as_deref(),
        Some(reason),
        "PC 变更原因应如实落库"
    );

    let h5 = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("TERM-H5"))
        .one(&db)
        .await
        .unwrap()
        .expect("H5 审计行应落库");
    assert_eq!(
        h5.terminal_type.as_deref(),
        Some(TERMINAL_H5),
        "移动端 UA 应判 H5 实际 {:?}",
        h5.terminal_type
    );
    assert_eq!(
        h5.operation_page.as_deref(),
        Some("/h5/sales/order-detail"),
        "H5 显式页面头应优先落库 实际 {:?}",
        h5.operation_page
    );
    assert_eq!(h5.doc_no.as_deref(), Some(doc), "H5 单号应如实落库");
    assert_eq!(
        h5.change_reason.as_deref(),
        Some(reason),
        "H5 变更原因应如实落库"
    );

    let mp = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("TERM-MP"))
        .one(&db)
        .await
        .unwrap()
        .expect("小程序审计行应落库");
    assert_eq!(
        mp.terminal_type.as_deref(),
        Some(TERMINAL_MINIPROGRAM),
        "带小程序自定义头应判 MINIPROGRAM 实际 {:?}",
        mp.terminal_type
    );
    assert_eq!(
        mp.operation_page.as_deref(),
        Some("/pages/order/detail"),
        "小程序页面头应落库 实际 {:?}",
        mp.operation_page
    );
    assert_eq!(mp.doc_no.as_deref(), Some(doc), "小程序单号应如实落库");
    assert_eq!(
        mp.change_reason.as_deref(),
        Some(reason),
        "小程序变更原因应如实落库"
    );
}

/// 反向 无终端头无可用 UA 时 终端记 UNKNOWN 绝不猜成 PC
#[tokio::test]
async fn unknown_terminal_is_recorded_as_unknown_not_guessed_pc() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_app(db.clone(), role_id);

    // 只给 content-type 不给 user-agent 不给任何终端头也不给 referer 与页面头
    let (s, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("content-type", "application/json")],
        Some(json!({
            "operation": "UPDATE",
            "resource_id": "TERM-UNKNOWN",
        })),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "无终端头写请求应仍 200");
    drain_bus().await;

    let row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("TERM-UNKNOWN"))
        .one(&db)
        .await
        .unwrap()
        .expect("未知终端审计行应落库");
    assert_eq!(
        row.terminal_type.as_deref(),
        Some(TERMINAL_UNKNOWN),
        "取不到终端应记 UNKNOWN 而不是默认 PC 实际 {:?}",
        row.terminal_type
    );
    assert_eq!(row.operation_page, None, "取不到页面应记 NULL 不臆造");
    assert_eq!(row.doc_no, None, "调用方未给单号应记 NULL");
    assert_eq!(
        row.change_reason, None,
        "调用方未给原因应记 NULL 不用默认文案"
    );
}

// ============================================================
// 二枚 高风险操作可被单独筛出
// ============================================================

#[tokio::test]
async fn high_risk_operations_are_filterable_separately() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_app(db.clone(), role_id);

    // 普通更新 无风险标记
    let (s_norm, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")],
        Some(json!({"operation": "UPDATE", "resource_id": "RISK-NORMAL"})),
    )
    .await;
    assert_eq!(s_norm, StatusCode::OK);

    // 作废 红冲类经 mark_audit_high_risk 登记 VOID
    let (s_void, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", "Mozilla/5.0 (iPhone; Mobile)")],
        Some(json!({"operation": "UPDATE", "resource_id": "RISK-VOID", "risk_flag": RISK_VOID})),
    )
    .await;
    assert_eq!(s_void, StatusCode::OK);

    // 删除 走生产 delete_with_audit 自动补 DELETE 标记
    seed_warehouse(&db, 7).await;
    let (s_del, _) = call(
        &app,
        Method::DELETE,
        "/term-delete/7?doc_no=DEL-001",
        &[("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")],
        None,
    )
    .await;
    assert_eq!(s_del, StatusCode::OK, "删除请求应 200");

    drain_bus().await;

    // 删除行应带 DELETE 标记 由写入单点自动补 业务未显式给也落
    let del_row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("7"))
        .filter(audit_log::Column::OperationType.eq("DELETE"))
        .one(&db)
        .await
        .unwrap()
        .expect("删除审计行应落库");
    assert_eq!(
        del_row.risk_flag.as_deref(),
        Some(RISK_DELETE),
        "删除应自动落高风险 DELETE 标记 实际 {:?}",
        del_row.risk_flag
    );

    // 读取侧 按 risk_flag 传 high 只回非空标记行 普通更新被排除
    let (s_list, v) = call(
        &app,
        Method::GET,
        "/audit-logs?risk_flag=high",
        &[("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")],
        None,
    )
    .await;
    assert_eq!(s_list, StatusCode::OK, "高风险筛选应 200 实际 {v}");
    let items = v["data"]["items"].as_array().cloned().unwrap_or_default();
    let flagged: Vec<String> = items
        .iter()
        .filter_map(|it| it["risk_flag"].as_str().map(|s| s.to_string()))
        .collect();
    assert!(
        flagged.iter().any(|f| f == RISK_DELETE),
        "risk_flag=high 结果应含 DELETE 行 实际 {flagged:?}"
    );
    assert!(
        flagged.iter().any(|f| f == RISK_VOID),
        "risk_flag=high 结果应含 VOID 行 实际 {flagged:?}"
    );

    // 精确按 DELETE 筛只回删除行 不含作废行
    let (s_del_only, v_del) = call(
        &app,
        Method::GET,
        "/audit-logs?risk_flag=DELETE",
        &[("user-agent", "Mozilla/5.0 (Windows NT 10.0) Chrome/120")],
        None,
    )
    .await;
    assert_eq!(s_del_only, StatusCode::OK);
    let del_items = v_del["data"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(!del_items.is_empty(), "按 DELETE 精筛应至少命中删除行");
    for it in &del_items {
        assert_eq!(
            it["risk_flag"].as_str(),
            Some(RISK_DELETE),
            "精筛 DELETE 的每行标记都应等于 DELETE 实际 {it}"
        );
    }
    // 普通更新未被任何 risk_flag 命中 即它是可被排除的独立态
    let normal_in_high = items
        .iter()
        .any(|it| it["resource_id"].as_str() == Some("RISK-NORMAL"));
    assert!(!normal_in_high, "无标记的普通更新不得出现在高风险结果里");
}

// ============================================================
// 三枚 按单据编号追溯回全链路且顺序正确
// ============================================================

#[tokio::test]
async fn trace_by_doc_no_returns_full_chain_in_time_order() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_app(db.clone(), role_id);

    let doc = "TRACE-ORDER-555";
    let ua_pc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
    let ua_h5 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148";

    // 同一张单按时间顺序发起四类操作 中间隔一拍保证时间戳可分且单调
    // 另发一张不同单号的干扰单 验证追溯不误带别单
    let (s1, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc), ("x-page-path", "/sales/orders/create")],
        Some(json!({"operation": "CREATE", "resource_id": "TR-C", "doc_no": doc, "change_reason": "建单"})),
    )
    .await;
    assert_eq!(s1, StatusCode::OK);
    tokio::time::sleep(Duration::from_millis(30)).await;

    let (s2, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_h5), ("x-page-path", "/h5/sales/orders/edit")],
        Some(json!({"operation": "UPDATE", "resource_id": "TR-U", "doc_no": doc, "change_reason": "改量"})),
    )
    .await;
    assert_eq!(s2, StatusCode::OK);
    tokio::time::sleep(Duration::from_millis(30)).await;

    // 干扰单 单号不同 不得被本单追溯命中
    let (s_noise, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc), ("x-page-path", "/other")],
        Some(json!({"operation": "UPDATE", "resource_id": "TR-NOISE", "doc_no": "OTHER-DOC"})),
    )
    .await;
    assert_eq!(s_noise, StatusCode::OK);
    tokio::time::sleep(Duration::from_millis(30)).await;

    // 作废登记 本单最后一次操作 应排在追溯结果最前
    let (s3, _) = call(
        &app,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc), ("x-page-path", "/sales/orders/void")],
        Some(json!({"operation": "UPDATE", "resource_id": "TR-V", "doc_no": doc, "change_reason": "作废", "risk_flag": RISK_VOID})),
    )
    .await;
    assert_eq!(s3, StatusCode::OK);
    drain_bus().await;

    let (s_list, v) = call(
        &app,
        Method::GET,
        "/audit-logs?doc_no=TRACE-ORDER-555",
        &[("user-agent", ua_pc)],
        None,
    )
    .await;
    assert_eq!(s_list, StatusCode::OK, "按单号追溯应 200 实际 {v}");
    let items = v["data"]["items"].as_array().cloned().unwrap_or_default();

    // 全链路覆盖本单三次操作 且不含干扰单
    let ids: Vec<&str> = items
        .iter()
        .filter_map(|it| it["resource_id"].as_str())
        .collect();
    assert!(ids.contains(&"TR-C"), "追溯应含建单 实际 {ids:?}");
    assert!(ids.contains(&"TR-U"), "追溯应含改量 实际 {ids:?}");
    assert!(ids.contains(&"TR-V"), "追溯应含作废 实际 {ids:?}");
    assert!(
        !ids.contains(&"TR-NOISE"),
        "追溯不得误带他单行 实际 {ids:?}"
    );
    assert_eq!(items.len(), 3, "本单追溯应恰好三行 实际 {}", items.len());

    // 每行单号都等于查询单号 且终端如实反映发起端
    for it in &items {
        assert_eq!(
            it["doc_no"].as_str(),
            Some(doc),
            "追溯每行单号都应是本单 实际 {it}"
        );
    }

    // 顺序正确 按时间倒序 最近一次 作废 排最前 且整体 created_at 单调不增
    assert_eq!(
        items[0]["resource_id"].as_str(),
        Some("TR-V"),
        "最后发起的作废应排在最前 实际 {:?}",
        items[0]
    );
    let times: Vec<&str> = items
        .iter()
        .filter_map(|it| it["created_at"].as_str())
        .collect();
    assert_eq!(times.len(), items.len(), "每行都应有 created_at");
    for w in times.windows(2) {
        assert!(
            w[0] >= w[1],
            "追溯结果应按 created_at 倒序 发现乱序 {} 早于 {}",
            w[0],
            w[1]
        );
    }
}

// ============================================================
// 四枚 操作人角色码来自会话已加载的角色行 如实落库且读取侧按等值可筛
// ============================================================

/// 按角色码取 roles 表种子行的 id（admin 由初始 schema 种入，供角色门与断言互校）
async fn role_id_by_code(db: &sea_orm::DatabaseConnection, code: &str) -> i32 {
    role::Entity::find()
        .filter(role::Column::Code.eq(code))
        .one(db)
        .await
        .expect("读取角色行失败")
        .unwrap_or_else(|| panic!("迁移应已种入 {code} 角色"))
        .id
}

#[tokio::test]
async fn session_role_code_lands_in_audit_row_and_filters_by_equality() {
    let db = setup_test_db().await;
    let admin_id = admin_role_id(&db).await;
    assert_eq!(
        role_id_by_code(&db, "admin").await,
        admin_id,
        "种子角色 admin 应可按 code 取回"
    );
    // list 端点的角色门读 AuthContext.role_id（恒为 admin），落库的角色码读会话注入的
    // SessionRoleCode，二者各走各的：operator 那行的 role_id 仍是 admin，只有注入的角色码
    // 是 operator。这样钉住「该列取自会话已加载的角色行的 code」，不是由 role_id 反推或写死。
    let ua_pc = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";

    // 两个不同角色的会话各写一行，外加一行会话取不到角色
    let app_admin = build_app_with_session_role(db.clone(), admin_id, Some("admin"));
    let (s_admin, v_admin) = call(
        &app_admin,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc)],
        Some(json!({"operation": "UPDATE", "resource_id": "ROLE-ADMIN"})),
    )
    .await;
    assert_eq!(
        s_admin,
        StatusCode::OK,
        "admin 会话写请求应 200 实际 {v_admin}"
    );

    let app_operator = build_app_with_session_role(db.clone(), admin_id, Some("operator"));
    let (s_op, v_op) = call(
        &app_operator,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc)],
        Some(json!({"operation": "UPDATE", "resource_id": "ROLE-OPERATOR"})),
    )
    .await;
    assert_eq!(
        s_op,
        StatusCode::OK,
        "operator 会话写请求应 200 实际 {v_op}"
    );

    let app_no_role = build_app_with_session_role(db.clone(), admin_id, None);
    let (s_none, v_none) = call(
        &app_no_role,
        Method::POST,
        "/term-write",
        &[("user-agent", ua_pc)],
        Some(json!({"operation": "UPDATE", "resource_id": "ROLE-ABSENT"})),
    )
    .await;
    assert_eq!(
        s_none,
        StatusCode::OK,
        "无角色码会话写请求应仍 200 实际 {v_none}"
    );

    drain_bus().await;

    // 一 写入单点确实把会话角色码传到该列 两个角色各落各的
    let admin_row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("ROLE-ADMIN"))
        .one(&db)
        .await
        .unwrap()
        .expect("admin 会话审计行应落库");
    assert_eq!(
        admin_row.role_code.as_deref(),
        Some("admin"),
        "会话角色码是 admin 时该列必须落 admin 实际 {:?}",
        admin_row.role_code
    );

    let op_row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("ROLE-OPERATOR"))
        .one(&db)
        .await
        .unwrap()
        .expect("operator 会话审计行应落库");
    assert_eq!(
        op_row.role_code.as_deref(),
        Some("operator"),
        "会话角色码是 operator 时该列必须落 operator 而不是上一行的 admin 实际 {:?}",
        op_row.role_code
    );

    // 二 会话取不到角色行时落 NULL 不写空串也不写占位角色
    let absent_row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq("ROLE-ABSENT"))
        .one(&db)
        .await
        .unwrap()
        .expect("无角色码会话的审计行应落库");
    assert_eq!(
        absent_row.role_code, None,
        "会话无角色码时该列必须是 NULL 不得兜底 实际 {:?}",
        absent_row.role_code
    );

    // 三 列表出参带 role_code 键且与库内同源
    let (s_list, v) = call(
        &app_admin,
        Method::GET,
        "/audit-logs?role_code=admin",
        &[("user-agent", ua_pc)],
        None,
    )
    .await;
    assert_eq!(s_list, StatusCode::OK, "按角色码筛应 200 实际 {v}");
    let items = v["data"]["items"].as_array().cloned().unwrap_or_default();
    assert!(
        !items.is_empty(),
        "按 admin 筛应命中本用例写入的 admin 行 实际 {v}"
    );
    let admin_item = items
        .iter()
        .find(|it| it["resource_id"].as_str() == Some("ROLE-ADMIN"))
        .expect("结果里应有 ROLE-ADMIN 行");
    assert!(
        admin_item.get("role_code").is_some(),
        "列表出参必须带 role_code 键 实际 {admin_item}"
    );
    assert_eq!(
        admin_item["role_code"].as_str(),
        Some("admin"),
        "出参角色码应与库内同源 实际 {admin_item}"
    );

    // 四 等值筛选 另一角色行不得被带出
    for it in &items {
        assert_eq!(
            it["role_code"].as_str(),
            Some("admin"),
            "按 admin 筛出的每一行角色码都应是 admin 实际 {it}"
        );
    }
    let ids: Vec<&str> = items
        .iter()
        .filter_map(|it| it["resource_id"].as_str())
        .collect();
    assert!(
        !ids.contains(&"ROLE-OPERATOR"),
        "按 admin 等值筛不得带出 operator 行 实际 {ids:?}"
    );
    assert!(
        !ids.contains(&"ROLE-ABSENT"),
        "按 admin 等值筛不得带出角色缺失行 实际 {ids:?}"
    );

    // 五 前缀不命中 钉住该筛选走等值而不是 LIKE 或前缀匹配
    let (s_prefix, v_prefix) = call(
        &app_admin,
        Method::GET,
        "/audit-logs?role_code=admi",
        &[("user-agent", ua_pc)],
        None,
    )
    .await;
    assert_eq!(
        s_prefix,
        StatusCode::OK,
        "前缀筛选请求本身应仍 200 实际 {v_prefix}"
    );
    assert_eq!(
        v_prefix["data"]["total"].as_u64(),
        Some(0),
        "role_code=admi 不得命中任何行 一旦改成模糊匹配本断言必红 实际 {v_prefix}"
    );
}

// ============================================================
// 五枚 生产业务端点自己把定位维度写进审计行（不借道测试自造的写端点）
//
// 路由直接挂生产 handler：作废腿 sales_order_handler::cancel_order，红冲腿
// sales_order_handler::cancel_delivery；外层套生产 audit_context_middleware 绑定 task-local
// 活上下文，落库走生产 service 内的 update_with_audit 单点，再直读 audit_logs 表并经生产
// 列表端点回读。
//
// 检测力（写腿被拿掉即红的点位）：
// - 删掉 service 里的 set_audit_doc_no → doc_no 落 NULL 本枚等值断言当场红；
// - 把单号改写成按主键拼的号（format!("SO#{id}") 之类）→ 与真实单号字面量不等 红；
//   末尾的反向钉（拿拼出来的号去筛必零命中）同时红；
// - 删掉或写错 mark_audit_high_risk → risk_flag 等值断言（逐字符 VOID / REVERSE）红；
// - 给无原因入参的腿硬塞一句默认文案 → change_reason IS NULL 断言红。
// ============================================================

/// 桌面 UA（本枚只关心单据维度，终端取值由上面几枚钉）
const LEG_UA_PC: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";

/// 挂生产业务端点的路由：作废腿一条、红冲腿一条，另挂生产列表端点做读侧回读。
/// 层序与 build_app 一致：audit_context_middleware 在外层绑定 task-local 活上下文，
/// inject_auth 在内层给 handler 提供会话（与真实权限中间件同走 extensions 注入）。
fn build_business_app(db: sea_orm::DatabaseConnection, role_id: i32) -> Router {
    let state = AppState {
        db: Arc::new(db),
        ..Default::default()
    };
    Router::new()
        .route(
            "/sales/orders/{id}/cancel",
            axum::routing::post(sales_order_handler::cancel_order),
        )
        .route(
            "/sales/orders/{order_id}/deliveries/{delivery_id}/cancel",
            axum::routing::post(sales_order_handler::cancel_delivery),
        )
        .route(
            "/audit-logs",
            axum::routing::get(audit_log_handler::list_audit_logs),
        )
        .with_state(state)
        .layer(from_fn_with_state(auth_for(role_id), inject_auth))
        .layer(from_fn(audit_context_middleware))
}

/// 种一条最小客户行：sales_orders.customer_id 与 sales_delivery.customer_id 都有真外键
/// 指向 customers，没有父行则种子直接被拒。owner_id 取 0（本仓公海客户的既有取值）。
async fn seed_leg_customer(db: &sea_orm::DatabaseConnection) -> i32 {
    let ts = Utc::now().timestamp_nanos_opt().expect("nanos");
    let row = customer::ActiveModel {
        customer_code: Set(format!("CUST-LEG-{ts}")),
        customer_name: Set("审计写腿契约客户".to_string()),
        credit_limit: Set(Decimal::ZERO),
        payment_terms: Set(30),
        status: Set("active".to_string()),
        customer_type: Set(customer_type::OTHER.to_string()),
        owner_id: Set(0),
        created_by: Set(Some(100)),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子 customers 失败");
    row.id
}

/// 种一张销售订单（状态由调用方给权威词表常量，本函数不自己造取值）
async fn seed_leg_order(
    db: &sea_orm::DatabaseConnection,
    customer_id: i32,
    order_no: &str,
    status: &str,
) -> i32 {
    let row = sales_order::ActiveModel {
        order_no: Set(order_no.to_string()),
        customer_id: Set(customer_id),
        order_date: Set(Utc::now()),
        status: Set(status.to_string()),
        subtotal: Set(Decimal::ZERO),
        tax_amount: Set(Decimal::ZERO),
        discount_amount: Set(Decimal::ZERO),
        shipping_cost: Set(Decimal::ZERO),
        total_amount: Set(Decimal::ZERO),
        paid_amount: Set(Decimal::ZERO),
        balance_amount: Set(Decimal::ZERO),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .unwrap_or_else(|e| panic!("种子 sales_orders({order_no}) 失败: {e}"));
    row.id
}

/// 种一张已发货的发货单：状态取权威词表 sales_delivery::SHIPPED（取消门按该值逐字符比较）。
/// sales_delivery 的 ActiveModel 无缺省实现（模型未派生 Default），列全 13 个字段。
async fn seed_leg_delivery(
    db: &sea_orm::DatabaseConnection,
    order_id: i32,
    customer_id: i32,
    warehouse_id: i32,
    delivery_no: &str,
) -> i32 {
    let row = sales_delivery::ActiveModel {
        id: NotSet,
        delivery_no: Set(delivery_no.to_string()),
        order_id: Set(order_id),
        customer_id: Set(customer_id),
        warehouse_id: Set(warehouse_id),
        delivery_date: Set(Utc::now().date_naive()),
        status: Set(delivery_status::SHIPPED.to_string()),
        total_quantity: Set(Decimal::ZERO),
        total_amount: Set(Decimal::ZERO),
        remarks: Set(Some("审计写腿契约发货".to_string())),
        created_by: Set(100),
        created_at: Set(Utc::now()),
        updated_at: Set(Utc::now()),
    }
    .insert(db)
    .await
    .unwrap_or_else(|e| panic!("种子 sales_delivery({delivery_no}) 失败: {e}"));
    row.id
}

/// 作废腿：真打生产端点 POST /sales/orders/:id/cancel
#[tokio::test]
async fn production_void_endpoint_writes_real_doc_no_and_void_risk() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_business_app(db.clone(), role_id);

    let customer_id = seed_leg_customer(&db).await;
    // 真实单号：与主键拼出的任何字符串都不同，等值断言因此能区分「取的是编号列」
    let order_no = "SO-LEG-VOID-20261104-0007";
    let order_id = seed_leg_order(&db, customer_id, order_no, so_status::APPROVED).await;

    let (s, v) = call(
        &app,
        Method::POST,
        &format!("/sales/orders/{order_id}/cancel"),
        &[
            ("user-agent", LEG_UA_PC),
            ("x-page-path", "/sales/orders/detail"),
        ],
        None,
    )
    .await;
    assert_eq!(s, StatusCode::OK, "生产作废端点应 200 实际 {v}");

    // 业务效果先证真：请求不是空跑，状态确实被写进作废终态
    let order = sales_order::Entity::find_by_id(order_id)
        .one(&db)
        .await
        .unwrap()
        .expect("订单应仍在库");
    assert_eq!(
        order.status,
        so_status::CANCELLED,
        "作废应把订单写进 cancelled 终态 实际 {:?}",
        order.status
    );

    let rows = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq(order_id.to_string()))
        .all(&db)
        .await
        .unwrap();
    assert_eq!(rows.len(), 1, "作废应恰好落一条审计行 实际 {}", rows.len());
    let row = &rows[0];
    assert_eq!(
        row.doc_no.as_deref(),
        Some(order_no),
        "doc_no 必须是 sales_orders.order_no 原值 实际 {:?}",
        row.doc_no
    );
    assert_eq!(
        row.risk_flag.as_deref(),
        Some(RISK_VOID),
        "作废腿 risk_flag 必须逐字符等于 VOID 实际 {:?}",
        row.risk_flag
    );
    assert_eq!(
        row.change_reason, None,
        "本端点请求体不承载原因 该列必须如实 NULL 而不是兜底文案 实际 {:?}",
        row.change_reason
    );

    // 读侧：按真实单号筛得到，且出参键与库内同源
    let (s_list, v_list) = call(
        &app,
        Method::GET,
        &format!("/audit-logs?doc_no={order_no}&risk_flag=VOID"),
        &[("user-agent", LEG_UA_PC)],
        None,
    )
    .await;
    assert_eq!(s_list, StatusCode::OK, "按真实单号筛应 200 实际 {v_list}");
    let items = v_list["data"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert_eq!(
        items.len(),
        1,
        "按本单真实单号加 VOID 精筛应命中那一行 实际 {v_list}"
    );
    assert_eq!(items[0]["doc_no"].as_str(), Some(order_no));
    assert_eq!(items[0]["risk_flag"].as_str(), Some(RISK_VOID));
    assert!(
        items[0].get("change_reason").is_some(),
        "列表出参必须带 change_reason 键（NULL 也要显式在场）实际 {}",
        items[0]
    );
    assert_eq!(items[0]["change_reason"], Value::Null);

    // 反向钉：拿按主键拼号这类写法产生的键去筛必零命中——库里落的真是编号列而不是 id
    let fabricated = format!("SO#{order_id}");
    let (s_fake, v_fake) = call(
        &app,
        Method::GET,
        &format!("/audit-logs?doc_no={fabricated}"),
        &[("user-agent", LEG_UA_PC)],
        None,
    )
    .await;
    assert_eq!(s_fake, StatusCode::OK);
    assert_eq!(
        v_fake["data"]["total"].as_u64(),
        Some(0),
        "拼出来的号不得命中 一旦写腿改成用 id 造号本断言即失去判据 实际 {v_fake}"
    );
}

/// 红冲腿：真打生产端点 POST /sales/orders/:id/deliveries/:delivery_id/cancel（取消发货）
#[tokio::test]
async fn production_reverse_endpoint_writes_real_delivery_no_and_reason() {
    let db = setup_test_db().await;
    let role_id = admin_role_id(&db).await;
    let app = build_business_app(db.clone(), role_id);

    let customer_id = seed_leg_customer(&db).await;
    let order_no = "SO-LEG-REV-20261104-0008";
    // 订单停在 approved：本用例只钉发货单那一行的维度，避免订单状态回退行掺进来
    let order_id = seed_leg_order(&db, customer_id, order_no, so_status::APPROVED).await;
    seed_warehouse(&db, 9).await;
    let delivery_no = "DL-LEG-REV-20261104-0008";
    let delivery_id = seed_leg_delivery(&db, order_id, customer_id, 9, delivery_no).await;

    let reason = "客户要求整批改期 先冲销本批发货";
    let (s, v) = call(
        &app,
        Method::POST,
        &format!("/sales/orders/{order_id}/deliveries/{delivery_id}/cancel"),
        &[
            ("user-agent", LEG_UA_PC),
            ("x-page-path", "/sales/delivery/detail"),
        ],
        Some(json!({"reason": reason})),
    )
    .await;
    assert_eq!(s, StatusCode::OK, "生产红冲端点应 200 实际 {v}");

    let delivery = sales_delivery::Entity::find_by_id(delivery_id)
        .one(&db)
        .await
        .unwrap()
        .expect("发货单应仍在库");
    assert_eq!(
        delivery.status,
        delivery_status::CANCELLED,
        "红冲应把发货单写进 cancelled 终态 实际 {:?}",
        delivery.status
    );

    let row = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceId.eq(delivery_id.to_string()))
        .one(&db)
        .await
        .unwrap()
        .expect("红冲应落发货单审计行");
    assert_eq!(
        row.doc_no.as_deref(),
        Some(delivery_no),
        "doc_no 必须是被冲销发货单的 delivery_no 而不是父订单号也不是拼号 实际 {:?}",
        row.doc_no
    );
    assert_ne!(
        row.doc_no.as_deref(),
        Some(order_no),
        "红冲腿登记的是本次真正操作的那张单 不得错填父订单号"
    );
    assert_eq!(
        row.risk_flag.as_deref(),
        Some(RISK_REVERSE),
        "反向冲销腿 risk_flag 必须逐字符等于 REVERSE 实际 {:?}",
        row.risk_flag
    );
    assert_eq!(
        row.change_reason.as_deref(),
        Some(reason),
        "请求体带原因的腿要原样落库 不改写不截断 实际 {:?}",
        row.change_reason
    );

    // 读侧：按 REVERSE 精筛只回高风险行，且每行标记逐字符等于 REVERSE
    let (s_list, v_list) = call(
        &app,
        Method::GET,
        "/audit-logs?risk_flag=REVERSE",
        &[("user-agent", LEG_UA_PC)],
        None,
    )
    .await;
    assert_eq!(
        s_list,
        StatusCode::OK,
        "按 REVERSE 精筛应 200 实际 {v_list}"
    );
    let items = v_list["data"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(
        !items.is_empty(),
        "按 REVERSE 精筛应命中本用例的红冲行 实际 {v_list}"
    );
    for it in &items {
        assert_eq!(
            it["risk_flag"].as_str(),
            Some(RISK_REVERSE),
            "精筛 REVERSE 的每行标记都应等于 REVERSE 实际 {it}"
        );
    }
    let leg = items
        .iter()
        .find(|it| it["resource_id"].as_str() == Some(delivery_id.to_string().as_str()))
        .expect("结果里应有本次红冲行");
    assert_eq!(leg["doc_no"].as_str(), Some(delivery_no));
    assert_eq!(leg["change_reason"].as_str(), Some(reason));
}

// ============================================================
// detect_operation_page 的 Referer 回退口径：无页面头无 hash 时取 host 之后、
// ?query 之前的完整路径，而不是首段。纯函数逐条钉住，不发 HTTP 不碰库。
// ============================================================

fn referer_only(referer: &str) -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("referer", HeaderValue::from_str(referer).unwrap());
    headers
}

#[test]
fn detect_operation_page_referer_fallback_keeps_full_path_strips_query() {
    // 完整多段路径：不能截成首段 /sales
    assert_eq!(
        detect_operation_page(&referer_only("https://erp.example.com/sales/orders")).as_deref(),
        Some("/sales/orders"),
        "无页面头应回退 Referer 完整路径"
    );
    // 带 query：?query 之前的完整路径保留
    assert_eq!(
        detect_operation_page(&referer_only("https://erp.example.com/sales/orders?page=2"))
            .as_deref(),
        Some("/sales/orders"),
        "Referer 带 query 应剥掉查询段保留完整路径"
    );
    // 根路径：host 之后无路径段记 None
    assert_eq!(
        detect_operation_page(&referer_only("https://erp.example.com/")).as_deref(),
        None,
        "Referer 根路径应记 None"
    );
    // hash 路由优先于路径
    assert_eq!(
        detect_operation_page(&referer_only("https://erp.example.com/x#/sales/orders")).as_deref(),
        Some("/sales/orders"),
        "hash 片段应优先于路径部分"
    );
}
