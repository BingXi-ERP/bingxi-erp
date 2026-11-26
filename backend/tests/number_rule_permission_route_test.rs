//! 编码规则回滚路由不得改变既有系统更新回滚的权限派生。

use axum::http::Method;
use bingxi_backend::middleware::permission::{
    extract_action_from_path, extract_resource_info, method_to_action,
};

#[test]
fn number_rule_rollback_uses_post_update_without_global_action_override() {
    let path = "/api/v1/erp/system/number-rules/42/rollback";
    assert_eq!(extract_action_from_path(path), Some("update".to_string()));
    assert_eq!(
        extract_resource_info(path),
        ("number-rules".to_string(), Some(42))
    );
    assert_eq!(method_to_action(&Method::POST), "create");
}

#[test]
fn existing_system_update_rollback_keeps_post_create_permission() {
    let path = "/api/v1/erp/system-update/rollback";
    assert_eq!(extract_action_from_path(path), None);
    assert_eq!(
        extract_resource_info(path),
        ("system-update-rollback".to_string(), None)
    );
    assert_eq!(method_to_action(&Method::POST), "create");
}
