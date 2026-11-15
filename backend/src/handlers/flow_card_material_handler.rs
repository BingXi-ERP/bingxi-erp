//! 流转卡投纱明细 Handler
//!
//! ## 六要素
//! - **功能**：对外暴露流转卡投纱明细的列出、登记、修改、作废与单行读取。
//! - **调用方**：前端流转卡页面的投纱区（`frontend/src/views/flow-cards/index.vue` 经
//!   `frontend/src/api/flow-card.ts` 调用）；e2e 的 470 与 471 号用例走同一批端点。
//! - **入参**：路径参数为流转卡主键或投纱行主键；请求体见
//!   `services::flow_card_material_service` 的两个请求结构；写操作取 `AuthContext` 的会话
//!   身份作为建单人与日志归属，请求体不承载身份。
//! - **传给谁**：全部转 `FlowCardMaterialService`，本层只做参数拆装与信封包装。
//! - **存什么**：本层不落库。
//! - **存哪里**：无。
//!
//! 路由形态与同域的工序流转（`/flow-cards/{flow_card_id}/steps`）和质量反馈
//!（`/flow-cards/feedbacks`）保持同族，权限键由 URL 段推导，因此不新增资源名。

use axum::{
    Json,
    extract::{Path, State},
};

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::flow_card_material::Model as MaterialModel;
use crate::services::flow_card_material_service::{
    CreateFlowCardMaterialRequest, FlowCardMaterialService, FlowCardMaterialView,
    UpdateFlowCardMaterialRequest,
};
use crate::utils::error::AppError;
use crate::utils::response::ApiResponse;

fn material_service(state: &AppState) -> FlowCardMaterialService {
    FlowCardMaterialService::new(state.db.clone())
}

/// GET /api/v1/erp/flow-cards/{flow_card_id}/materials - 列出该卡的投纱明细
pub async fn list_materials_by_card(
    State(state): State<AppState>,
    Path(flow_card_id): Path<i32>,
) -> Result<Json<ApiResponse<Vec<FlowCardMaterialView>>>, AppError> {
    let rows = material_service(&state).list_by_card(flow_card_id).await?;
    Ok(Json(ApiResponse::success(rows)))
}

/// POST /api/v1/erp/flow-cards/materials - 登记一条投纱
pub async fn create_material(
    State(state): State<AppState>,
    auth: AuthContext,
    Json(req): Json<CreateFlowCardMaterialRequest>,
) -> Result<Json<ApiResponse<MaterialModel>>, AppError> {
    let model = material_service(&state).create(req, auth.user_id).await?;
    Ok(Json(ApiResponse::success(model)))
}

/// GET /api/v1/erp/flow-cards/materials/{id} - 读取单条投纱
pub async fn get_material(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<ApiResponse<MaterialModel>>, AppError> {
    let model = material_service(&state).get_by_id(id).await?;
    Ok(Json(ApiResponse::success(model)))
}

/// PUT /api/v1/erp/flow-cards/materials/{id} - 修改单条投纱
pub async fn update_material(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    auth: AuthContext,
    Json(req): Json<UpdateFlowCardMaterialRequest>,
) -> Result<Json<ApiResponse<MaterialModel>>, AppError> {
    let model = material_service(&state)
        .update(id, req, auth.user_id)
        .await?;
    Ok(Json(ApiResponse::success(model)))
}

/// DELETE /api/v1/erp/flow-cards/materials/{id} - 作废单条投纱
pub async fn delete_material(
    State(state): State<AppState>,
    Path(id): Path<i32>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<MaterialModel>>, AppError> {
    let model = material_service(&state).delete(id, auth.user_id).await?;
    Ok(Json(ApiResponse::success(model)))
}
