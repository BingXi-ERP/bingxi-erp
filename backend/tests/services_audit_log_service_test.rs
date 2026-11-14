use bingxi_backend::middleware::audit_context::AuditContext;
use bingxi_backend::models::audit_log::{OperationType, Severity};
use bingxi_backend::services::audit_log_service::{AuditEvent, build_active_model};
use sea_orm::ActiveValue;
use serde_json::json;

/// AuditEvent::new 默认值正确
#[test]
fn test_audit_event_new_defaults() {
    let event = AuditEvent::new(OperationType::Login, "auth");
    assert_eq!(event.operation_type, OperationType::Login);
    assert_eq!(event.resource_type, Some("auth".to_string()));
    assert_eq!(event.severity, Severity::Info);
    assert!(event.user_id.is_none());
}

/// 无 ctx 时请求上下文字段全部为空
#[test]
fn test_build_active_model_without_ctx() {
    let event = AuditEvent {
        user_id: Some(42),
        username: Some("alice".to_string()),
        operation_type: OperationType::Update,
        severity: Severity::Warn,
        resource_type: Some("order".to_string()),
        resource_id: Some("1001".to_string()),
        resource_name: Some("订单 A".to_string()),
        description: Some("修改订单金额".to_string()),
        request_method: Some("PUT".to_string()),
        request_path: Some("/api/v1/erp/orders/1001".to_string()),
        before_snapshot: Some(json!({"amount": 100})),
        after_snapshot: Some(json!({"amount": 200})),
    };
    let model = build_active_model(&event, None);
    // 关键字段透传
    if let ActiveValue::Set(s) = model.severity {
        assert_eq!(s, Some("WARN".to_string()));
    } else {
        panic!("severity 应为 Set");
    }
    if let ActiveValue::Set(o) = model.operation_type {
        assert_eq!(o, Some("UPDATE".to_string()));
    } else {
        panic!("operation_type 应为 Set");
    }
    // 无 ctx 时请求上下文为 None
    if let ActiveValue::Set(ip) = model.ip_address {
        assert!(ip.is_none(), "无 ctx 时 ip_address 应为 None");
    }
    if let ActiveValue::Set(rid) = model.request_id {
        assert!(rid.is_none(), "无 ctx 时 request_id 应为 None");
    }
}

/// 有 ctx 时请求上下文字段正确填充
#[test]
fn test_build_active_model_with_ctx() {
    let event = AuditEvent::new(OperationType::Login, "auth");
    // 其余定位维度按 empty() 缺省（终端 UNKNOWN 与其余 None），本用例只锁 request_id 与 ip
    let ctx = AuditContext {
        request_id: "req-123".to_string(),
        ip_address: "192.168.1.1".to_string(),
        user_agent: "Mozilla/5.0".to_string(),
        ..AuditContext::empty()
    };
    let model = build_active_model(&event, Some(&ctx));
    if let ActiveValue::Set(rid) = model.request_id {
        assert_eq!(rid, Some("req-123".to_string()));
    } else {
        panic!("request_id 应为 Set");
    }
    if let ActiveValue::Set(ip) = model.ip_address {
        assert_eq!(ip, Some("192.168.1.1".to_string()));
    } else {
        panic!("ip_address 应为 Set");
    }
}

/// 写入单点把会话角色码原样传给 ActiveModel：上下文带角色码时该列必须是 Set(Some(码))，
/// 不带时必须是 Set(None)——落 NULL 而不是空串或任何占位角色，缺值不许冒充有值。
#[test]
fn test_build_active_model_carries_session_role_code_or_leaves_null() {
    let event = AuditEvent::new(OperationType::Update, "order");

    let with_role = AuditContext {
        role_code: Some("finance".to_string()),
        ..AuditContext::empty()
    };
    let model_with_role = build_active_model(&event, Some(&with_role));
    if let ActiveValue::Set(code) = model_with_role.role_code {
        assert_eq!(
            code.as_deref(),
            Some("finance"),
            "上下文带会话角色码时写入单点必须原样落该码"
        );
    } else {
        panic!("role_code 应为 Set");
    }

    let without_role = AuditContext::empty();
    let model_without_role = build_active_model(&event, Some(&without_role));
    if let ActiveValue::Set(code) = model_without_role.role_code {
        assert!(
            code.is_none(),
            "上下文无角色码时该列必须落 NULL，不得兜底成空串或占位角色，实际 {code:?}"
        );
    } else {
        panic!("role_code 应为 Set");
    }

    let model_no_ctx = build_active_model(&event, None);
    if let ActiveValue::Set(code) = model_no_ctx.role_code {
        assert!(
            code.is_none(),
            "完全没有上下文时该列同样落 NULL，实际 {code:?}"
        );
    } else {
        panic!("role_code 应为 Set");
    }
}

/// 不同 OperationType 序列化正确
#[test]
fn test_operation_type_serialization() {
    assert_eq!(OperationType::Login.to_string(), "LOGIN");
    assert_eq!(OperationType::Create.to_string(), "CREATE");
    assert_eq!(OperationType::Update.to_string(), "UPDATE");
    assert_eq!(OperationType::Delete.to_string(), "DELETE");
}

/// 不同 Severity 序列化正确
#[test]
fn test_severity_serialization() {
    assert_eq!(Severity::Info.to_string(), "INFO");
    assert_eq!(Severity::Warn.to_string(), "WARN");
    assert_eq!(Severity::Error.to_string(), "ERROR");
    assert_eq!(Severity::Critical.to_string(), "CRITICAL");
}

/// shutdown 真实生效的确定性断言：
/// 首次 shutdown 必须取出全局消费者 JoinHandle；abort 后 await 该句柄得到
/// `JoinError::is_cancelled()`，即消费者 task 确已被运行时终止——
/// await 只有在 task 真正结束后才返回，不靠 sleep 猜时序。
/// 幂等：句柄被 take 后置空，第二次 shutdown 返回 None，不会再触发 abort。
/// 注意：本用例会初始化/消费本测试二进制内的全局单例（AUDIT_SENDER 与
/// AUDIT_CONSUMER_HANDLE）；同文件其余用例只测纯函数，不依赖活跃消费者，不受影响。
#[tokio::test]
async fn test_shutdown_aborts_consumer_and_is_idempotent() {
    use bingxi_backend::services::audit_log_service::AuditLogService;
    use std::sync::Arc;

    // 惰性连接池（ConnectOptions::connect_lazy(true)，走 sqlx connect_lazy_with）：
    // 只解析 URL 建池、不实际拨号；消费者全程空转 recv，不会触发任何落库查询。
    let mut opt = sea_orm::ConnectOptions::new("postgres://127.0.0.1:1/audit_lifecycle_unused");
    opt.connect_lazy(true);
    let db = Arc::new(
        sea_orm::Database::connect(opt)
            .await
            .expect("惰性池构建只解析 URL，不应发起真实连接"),
    );
    let svc = AuditLogService::new(db);

    let handle = svc
        .shutdown()
        .expect("首次 shutdown 必须取出全局消费者 JoinHandle（真实 abort 的前提）");
    let err = handle
        .await
        .expect_err("abort 后消费者 task 必须以 JoinError 结束，而非正常返回");
    assert!(
        err.is_cancelled(),
        "消费者 task 在 abort 后应处于 cancelled 状态，实际: {err}"
    );

    assert!(
        svc.shutdown().is_none(),
        "第二次 shutdown 句柄已置空，必须返回 None（防二次 abort，幂等）"
    );
}
