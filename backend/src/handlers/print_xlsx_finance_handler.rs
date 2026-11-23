//! finance 域单据 xlsx 打印腿 Handler（应收对账单 + 批二财务单据全量）
//!
//! 独立文件放置原因：`print_handler.rs` 是多车道共享热点（sales/purchase xlsx 腿同批在改），
//! finance 域新增 xlsx 端点集中在本文件以降低合并冲突面。鉴权与取数完全镜像 docx 版：
//! 先走同一 [`PrintService::get_print_data`] 入口（行级归属门、字段缺失/业务门控同一形态），
//! 再由 `build_ar_reconciliation_xlsx` 产出富表格字节流。
//! 权限键：`middleware/permission.rs` 的 `PATH_ACTION_SEGMENT_MAP` 将 `print-xlsx` 末段
//! 映射为与 docx 版相同的 `print` 动作（动作码不容连字符，显式映射，非方法派生 read 兜底）。
//!
//! 版式：XlsxRichTable（feat/xlsx-engine-merge 引擎）——标题合并/账务四字段/明细/大写占位。
//! 大写金额文案由金额大写工具按本期应收合计注入，水印记录操作员与导出时间。

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
use crate::utils::xlsx_export::{WatermarkConfig, xlsx_response};

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
    let watermark = WatermarkConfig {
        operator: Some(auth.username.clone()),
        ip_address: None,
        exported_at: Some(chrono::Utc::now().to_rfc3339()),
        extra: Some("应收对账单打印".to_string()),
    };
    let bytes = service
        .build_ar_reconciliation_xlsx(doc_id, &watermark)
        .await?;
    record_print_audit(&state, &auth, "ar_reconciliation", doc_id);
    Ok(xlsx_response(bytes, &format!("ar_reconciliation_{doc_id}")))
}

/// 会计凭证 xlsx 打印（镜像 voucher_print_docx 鉴权与参数）
pub async fn voucher_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "voucher", doc_id)
        .await?;
    let bytes = service.build_voucher_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "voucher", doc_id);
    Ok(xlsx_response(bytes, &format!("voucher_{doc_id}")))
}

/// 应收账款收款单 xlsx 打印（镜像 ar_collection_print_docx 鉴权与参数）
pub async fn ar_collection_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ar_collection", doc_id)
        .await?;
    let bytes = service.build_ar_collection_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ar_collection", doc_id);
    Ok(xlsx_response(bytes, &format!("ar_collection_{doc_id}")))
}

/// 应付账款付款单 xlsx 打印（镜像 ap_payment_print_docx 鉴权与参数）
pub async fn ap_payment_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ap_payment", doc_id)
        .await?;
    let bytes = service.build_ap_payment_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ap_payment", doc_id);
    Ok(xlsx_response(bytes, &format!("ap_payment_{doc_id}")))
}

/// 应付发票 xlsx 打印（镜像 ap_invoice_print_docx 鉴权与参数）
pub async fn ap_invoice_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ap_invoice", doc_id)
        .await?;
    let bytes = service.build_ap_invoice_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ap_invoice", doc_id);
    Ok(xlsx_response(bytes, &format!("ap_invoice_{doc_id}")))
}

/// 付款申请单 xlsx 打印（镜像 ap_payment_request_print_docx 鉴权与参数）
pub async fn ap_payment_request_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ap_payment_request", doc_id)
        .await?;
    let bytes = service.build_ap_payment_request_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ap_payment_request", doc_id);
    Ok(xlsx_response(
        bytes,
        &format!("ap_payment_request_{doc_id}"),
    ))
}

/// 应付对账单 xlsx 打印（镜像 ap_reconciliation_print_docx 鉴权与参数）
pub async fn ap_reconciliation_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "ap_reconciliation", doc_id)
        .await?;
    let bytes = service.build_ap_reconciliation_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "ap_reconciliation", doc_id);
    Ok(xlsx_response(bytes, &format!("ap_reconciliation_{doc_id}")))
}

/// 坏账核销单 xlsx 打印（镜像 bad_debt_writeoff_print_docx 鉴权与参数；
/// docx 版路径参数为 i64，本腿保持同一形态后按主键窄化为 i32）
pub async fn bad_debt_writeoff_print_xlsx(
    Path(doc_id): Path<i64>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "bad_debt_writeoff", doc_id as i32)
        .await?;
    let bytes = service.build_bad_debt_writeoff_xlsx(doc_id as i32).await?;
    record_print_audit(&state, &auth, "bad_debt_writeoff", doc_id as i32);
    Ok(xlsx_response(bytes, &format!("bad_debt_writeoff_{doc_id}")))
}

/// 外汇核销单 xlsx 打印（镜像 foreign_exchange_verification_print_docx 鉴权与参数）
pub async fn foreign_exchange_verification_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "foreign_exchange_verification", doc_id)
        .await?;
    let bytes = service
        .build_foreign_exchange_verification_xlsx(doc_id)
        .await?;
    record_print_audit(&state, &auth, "foreign_exchange_verification", doc_id);
    Ok(xlsx_response(
        bytes,
        &format!("foreign_exchange_verification_{doc_id}"),
    ))
}

/// 出口退税申报单 xlsx 打印（镜像 export_refund_declaration_print_docx 鉴权与参数）
pub async fn export_refund_declaration_print_xlsx(
    Path(doc_id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Response, AppError> {
    let service = PrintService::new(state.db.clone());
    let scope_ctx = auth.to_data_scope_context();
    service
        .get_print_data(&scope_ctx, "export_refund_declaration", doc_id)
        .await?;
    let bytes = service.build_export_refund_declaration_xlsx(doc_id).await?;
    record_print_audit(&state, &auth, "export_refund_declaration", doc_id);
    Ok(xlsx_response(
        bytes,
        &format!("export_refund_declaration_{doc_id}"),
    ))
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
