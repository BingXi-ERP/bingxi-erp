//! 调样单 CRUD Handler（/sample-dispatches 列表/详情/创建/更新/删除）
//!
//! 职责：入参解包 → 行级归属门 → 调 services/sample_dispatch_service.rs →
//! 统一信封出参（成功 `ApiResponse`，失败 `AppError`）。单号由后端取号
//! （BX-DY 年月号段），创建/更新请求体不接收 document_no。
//! 行级归属门镜像 `ar_reconciliation_handler::ensure_reconciliation_customer_access`：
//! 调样单无自身部门列，归属继承父客户（customers 为 m_rls_dept_domain RLS 表，
//! 归属列 `owner_id`、冗余部门列 `department_id`），读/写前取父客户走
//! `data_scope::check_resource_owner` 同一权威判定——列表可见 ⇔ 详情可读。

use axum::{
    extract::{Path, Query, State},
    Json,
};
use sea_orm::EntityTrait;

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::services::sample_dispatch_service::{
    CreateSampleDispatchRequest, SampleDispatchQuery, SampleDispatchService,
    UpdateSampleDispatchRequest,
};
use crate::utils::data_scope::DataScopeContext;
use crate::utils::error::AppError;
use crate::utils::response::{ApiResponse, PaginatedResponse};

/// 行级归属门（调样单族）：归属继承父客户，判定器与列表/详情/写腿同源。
/// 客户不存在→404；不可见→403 固定脱敏文案（不含对账单/客户 ID）。
async fn ensure_customer_access(
    db: &sea_orm::DatabaseConnection,
    ctx: &DataScopeContext,
    customer_id: i32,
) -> Result<(), AppError> {
    let parent = crate::models::customer::Entity::find_by_id(customer_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found("客户不存在".to_string()))?;
    if !crate::utils::data_scope::check_resource_owner(
        ctx,
        Some(parent.owner_id),
        parent.department_id,
    ) {
        tracing::warn!(customer_id, "调样单归属门拒绝（数据范围限制）");
        return Err(AppError::permission_denied(
            "无权访问调样单（数据范围限制）".to_string(),
        ));
    }
    Ok(())
}

/// 调样单列表（分页信封 PaginatedResponse{items,total,page,page_size}）
pub async fn list_sample_dispatches(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<SampleDispatchQuery>,
) -> Result<
    Json<ApiResponse<PaginatedResponse<crate::models::sample_dispatch_order::Model>>>,
    AppError,
> {
    let scope_ctx = auth.to_data_scope_context();
    let service = SampleDispatchService::new(state.db.clone());
    let page = service.list(query, Some(&scope_ctx)).await?;
    tracing::info!(total = page.total, page = page.page, "调样单列表查询成功");
    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        page.items,
        page.total,
        page.page,
        page.page_size,
    ))))
}

/// 调样单详情（主表 + 客户名称 + 行级明细）
pub async fn get_sample_dispatch(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(id): Path<i32>,
) -> Result<
    Json<ApiResponse<crate::services::sample_dispatch_service::SampleDispatchDetail>>,
    AppError,
> {
    let scope_ctx = auth.to_data_scope_context();
    let service = SampleDispatchService::new(state.db.clone());
    let detail = service.get_detail(id).await?;
    ensure_customer_access(&state.db, &scope_ctx, detail.order.customer_id).await?;
    Ok(Json(ApiResponse::success(detail)))
}

/// 创建调样单（单号后端取号 BX-DY 年月号段；明细至少一行；账务四列照实写入）
pub async fn create_sample_dispatch(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<CreateSampleDispatchRequest>,
) -> Result<
    Json<ApiResponse<crate::services::sample_dispatch_service::SampleDispatchDetail>>,
    AppError,
> {
    let scope_ctx = auth.to_data_scope_context();
    ensure_customer_access(&state.db, &scope_ctx, req.customer_id).await?;
    let service = SampleDispatchService::new(state.db.clone());
    let detail = service.create(req, auth.user_id).await?;
    Ok(Json(ApiResponse::success_with_message(detail, "创建成功")))
}

/// 更新调样单（主表字段全量替换 + 明细整单替换；单号保持原值不重取）
pub async fn update_sample_dispatch(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(id): Path<i32>,
    Json(req): Json<UpdateSampleDispatchRequest>,
) -> Result<
    Json<ApiResponse<crate::services::sample_dispatch_service::SampleDispatchDetail>>,
    AppError,
> {
    let scope_ctx = auth.to_data_scope_context();
    let service = SampleDispatchService::new(state.db.clone());
    let existing = service.get_detail(id).await?;
    ensure_customer_access(&state.db, &scope_ctx, existing.order.customer_id).await?;
    ensure_customer_access(&state.db, &scope_ctx, req.customer_id).await?;
    let detail = service.update(id, req).await?;
    Ok(Json(ApiResponse::success_with_message(detail, "更新成功")))
}

/// 删除调样单（物理删除：先明细后主行，同事务；模型无状态列，无作废词表承载）
pub async fn delete_sample_dispatch(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let scope_ctx = auth.to_data_scope_context();
    let service = SampleDispatchService::new(state.db.clone());
    // 归属门需先取主行定位归属客户：service.delete 内部也查一次存在性，
    // 这里为门控先读，删除路径保持单一通路。
    let detail = service.get_detail(id).await?;
    ensure_customer_access(&state.db, &scope_ctx, detail.order.customer_id).await?;
    service.delete(id).await?;
    Ok(Json(ApiResponse::success_with_message((), "删除成功")))
}
