//! 编码规则管理面 HTTP 出口。
//!
//! 功能 暴露规则分页、详情、更新与历史回滚；写面操作人取自认证上下文。
//! 调用方 `routes/system.rs::number_rules`；权限中间件按 URL 派生 `number-rules:*`。
//! 入参 分页参数、规则 ID 与更新/回滚请求 DTO。
//! 传给谁 `services/system_number_rule_service.rs`，本层不直接访问数据库。
//! 存什么 由服务层写当前规则、追加版本快照与审计日志。
//! 存哪里 PostgreSQL；出参统一 `ApiResponse` 信封。

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::system_number_rule::Model as RuleModel;
use crate::services::system_number_rule_dto::{
    RollbackNumberRuleRequest, RuleDetailDto, UpdateNumberRuleRequest,
};
use crate::services::system_number_rule_service::SystemNumberRuleService;
use crate::utils::ApiResponse;
use crate::utils::error::AppError;
use crate::utils::response::PaginatedResponse;
use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct NumberRuleListQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

/// GET /api/v1/erp/system/number-rules
pub async fn list_number_rules(
    Query(params): Query<NumberRuleListQuery>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<PaginatedResponse<RuleModel>>>, AppError> {
    tracing::info!("用户 {} 查询编码规则列表", auth.user_id);
    let page = SystemNumberRuleService::new(state.db.clone())
        .list(params.page.unwrap_or(1), params.page_size.unwrap_or(20))
        .await?;
    Ok(Json(ApiResponse::success(page)))
}

/// GET /api/v1/erp/system/number-rules/{id}
pub async fn get_number_rule(
    Path(id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<RuleDetailDto>>, AppError> {
    tracing::info!("用户 {} 查询编码规则详情 id={id}", auth.user_id);
    let detail = SystemNumberRuleService::new(state.db.clone())
        .get(id)
        .await?;
    Ok(Json(ApiResponse::success(detail)))
}

/// PUT /api/v1/erp/system/number-rules/{id}
pub async fn update_number_rule(
    Path(id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<UpdateNumberRuleRequest>,
) -> Result<Json<ApiResponse<RuleDetailDto>>, AppError> {
    tracing::info!("用户 {} 更新编码规则 id={id}", auth.user_id);
    let detail = SystemNumberRuleService::new(state.db.clone())
        .update(id, req, auth.user_id)
        .await?;
    Ok(Json(ApiResponse::success(detail)))
}

/// POST /api/v1/erp/system/number-rules/{id}/rollback
pub async fn rollback_number_rule(
    Path(id): Path<i32>,
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<RollbackNumberRuleRequest>,
) -> Result<Json<ApiResponse<RuleDetailDto>>, AppError> {
    tracing::info!("用户 {} 回滚编码规则 id={id}", auth.user_id);
    let detail = SystemNumberRuleService::new(state.db.clone())
        .rollback(id, req, auth.user_id)
        .await?;
    Ok(Json(ApiResponse::success(detail)))
}
