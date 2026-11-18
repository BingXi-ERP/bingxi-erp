//! 调样单域 xlsx 打印腿 Handler（sample_dispatch）
//!
//! 独立文件放置原因：`print_handler.rs` 是多车道共享热点，调样域新增 xlsx 端点
//! 集中在本文件以降低合并冲突面。鉴权与取数完全镜像 docx 族：先走同一
//! [`PrintService::get_print_data`] 入口（行级归属门、字段缺失/业务门控同一形态），
//! 再由 `build_sample_dispatch_xlsx` 产出富表格字节流。
//! 权限键：`middleware/permission.rs` 的 `PATH_ACTION_SEGMENT_MAP` 将 `print-xlsx`
//! 末段映射为与 docx 版相同的 `print` 动作（动作码不容连字符，显式映射，
//! 非方法派生 read 兜底）。
//!
//! 版式：XlsxRichTable（xlsx 富表格引擎）——标题合并/客户与日期/账务四字段/
//! 明细/合计/大写/签收/条款。

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    response::Response,
};

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::audit_log::{OperationType, Severity};
use crate::services::audit_log_service::{AuditEvent, AuditLogService};
use crate::services::print_service::PrintService;
use crate::utils::error::AppError;
use crate::utils::xlsx_export::xlsx_response;

/// 调样单 xlsx 打印：先走 get_print_data 的行级归属门/业务门控（未通过即报错，
/// 不产文件），通过后再装配富表格字节流。
pub async fn sample_dispatch_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "sample_dispatch", doc_id)
        .await?;
    let bytes = service.build_sample_dispatch_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "sample_dispatch", doc_id);
    Ok(xlsx_response(bytes, &format!("sample_dispatch_{doc_id}")))
}

/// xlsx 打印操作审计（镜像 `print_handler::record_print_audit`，格式字段区分 xlsx 腿）
fn record_print_audit(state: &AppState, auth: &AuthContext, doc_type: &str, doc_id: i32) {
    let event = AuditEvent {
        user_id: Some(auth.user_id),
        username: Some(auth.username.clone()),
        operation_type: OperationType::Print,
        severity: Severity::Info,
        resource_type: Some(doc_type.to_string()),
        resource_id: Some(doc_id.to_string()),
        resource_name: Some(format!("{}_print.xlsx", doc_type)),
        description: Some(format!(
            "用户 {} 打印 {} #{} (xlsx)",
            auth.username, doc_type, doc_id
        )),
        request_method: Some("GET".to_string()),
        request_path: Some(format!("/api/v1/erp/{}/{}", doc_type, doc_id)),
        before_snapshot: None,
        after_snapshot: Some(serde_json::json!({
            "doc_type": doc_type,
            "doc_id": doc_id,
            "format": "xlsx",
        })),
    };
    let svc = Arc::new(AuditLogService::new(state.db.clone()));
    svc.record_async(event, None);
}
