//! 采购域单据 xlsx 打印腿 Handler（purchase_receipt / purchase_order / outsourcing_receipt）
//!
//! 独立文件放置原因：`print_handler.rs` 是多车道共享热点（sales xlsx 腿同批在改），
//! 本域新增端点集中在本文件以降低合并冲突面。鉴权与取数完全镜像 docx 版：
//! 取数走同一 [`PrintService::get_print_data`] 入口（行级归属门、字段缺失/业务门控同一形态），
//! 权限键经 `PATH_ACTION_SEGMENT_MAP` 把 `print-xlsx` 末段映射为与 docx 版相同的 `print`
//! 动作（动作码不容连字符，显式映射，非方法派生 read 兜底）。
//!
//! 版式：现有规整表格 XlsxTable；缸号块合并版式待 feat/xlsx-engine-merge 车道合并后升级，
//! 构建器结构留升级接口（见 `services/print_service/purchase.rs` 模块注释）。

use std::sync::Arc;

use axum::{
    extract::{Path, State},
    response::Response,
};

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::audit_log::{OperationType, Severity};
use crate::services::audit_log_service::{AuditEvent, AuditLogService};
use crate::services::print_service::PrintData;
use crate::services::print_service::PrintService;
use crate::services::print_service::purchase::{
    build_outsource_receipt_xlsx, build_purchase_order_xlsx, build_purchase_receipt_xlsx,
};
use crate::utils::error::AppError;
use crate::utils::xlsx_export::{XlsxTable, build_xlsx_response};

/// 按单据类型分派到对应 xlsx 构建器（未接入 xlsx 腿的 doc_type 显式报错，不静默兜底）
fn build_xlsx_table(doc_type: &str, print_data: &PrintData) -> Result<XlsxTable, AppError> {
    match doc_type {
        "purchase_receipt" => build_purchase_receipt_xlsx(print_data),
        "purchase_order" => build_purchase_order_xlsx(print_data),
        "outsourcing_receipt" => build_outsource_receipt_xlsx(print_data),
        other => Err(AppError::not_implemented(format!(
            "单据类型 {other} 未接入 xlsx 打印腿"
        ))),
    }
}

/// xlsx 打印渲染：与 docx 版 `render_print_docx` 同一取数管线（数据范围上下文 →
/// 行级归属门/字段缺失/业务门控），仅渲染腿换成 xlsx 表格构建。
async fn render_print_xlsx(
    state: &AppState,
    auth: &AuthContext,
    doc_type: &str,
    doc_id: i32,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    let print_data = service.get_print_data(&scope_ctx, doc_type, doc_id).await?;
    let table = build_xlsx_table(doc_type, &print_data)?;
    let filename = format!("{}_{}", doc_type, doc_id);
    build_xlsx_response(&table, &filename)
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

/// 采购收货单 xlsx 打印（镜像 purchase_receipt_print_docx 鉴权与参数）
pub async fn purchase_receipt_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let resp = render_print_xlsx(&state, &auth, "purchase_receipt", doc_id).await?;
    record_print_audit(&state, &auth, "purchase_receipt", doc_id);
    Ok(resp)
}

/// 采购订单 xlsx 打印（镜像 purchase_order_print_docx 鉴权与参数）
pub async fn purchase_order_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let resp = render_print_xlsx(&state, &auth, "purchase_order", doc_id).await?;
    record_print_audit(&state, &auth, "purchase_order", doc_id);
    Ok(resp)
}

/// 委外收货单 xlsx 打印（镜像 outsourcing_receipt_print_docx 鉴权与参数）
pub async fn outsourcing_receipt_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let resp = render_print_xlsx(&state, &auth, "outsourcing_receipt", doc_id).await?;
    record_print_audit(&state, &auth, "outsourcing_receipt", doc_id);
    Ok(resp)
}
