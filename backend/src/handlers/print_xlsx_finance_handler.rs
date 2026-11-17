//! finance 域单据 xlsx 打印腿 Handler（ar_reconciliation 应收对账单）
//!
//! 独立文件放置原因：`print_handler.rs` 是多车道共享热点（sales/purchase xlsx 腿同批在改），
//! finance 域新增 xlsx 端点集中在本文件以降低合并冲突面。鉴权与取数完全镜像 docx 版：
//! 先走同一 [`PrintService::get_print_data`] 入口（行级归属门、字段缺失/业务门控同一形态），
//! 再由 `build_ar_reconciliation_xlsx` 产出富表格字节流。
//! 权限键：`middleware/permission.rs` 的 `PATH_ACTION_SEGMENT_MAP` 将 `print-xlsx` 末段
//! 映射为与 docx 版相同的 `print` 动作（动作码不容连字符，显式映射，非方法派生 read 兜底）。
//!
//! 版式：XlsxRichTable（feat/xlsx-engine-merge 引擎）——标题合并/账务四字段/明细/大写占位。
//! 大写金额文案由 `feat/amount-in-words` 车道的工具注入（当前 None 占位，合并后接入）。

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

/// 应收对账单 xlsx 打印（镜像 ar_reconciliation_print_docx 鉴权与参数）：
/// 先走 get_print_data 的行级归属门/业务门控（未通过即报错，不产文件），
/// 通过后再装配富表格字节流。
pub async fn ar_reconciliation_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ar_reconciliation", doc_id)
        .await?;
    let bytes = service.build_ar_reconciliation_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ar_reconciliation", doc_id);
    Ok(xlsx_response(bytes, &format!("ar_reconciliation_{doc_id}")))
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
