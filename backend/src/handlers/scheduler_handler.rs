//! 周期任务可观测端点（任务清单 / 执行历史 / 手动触发）
//!
//! 挂载在 `/api/v1/erp/scheduler`（routes/mod.rs）。三枚端点全部只读或
//! 幂等执行，不改动任何业务数据：
//! - GET /scheduler/jobs         已注册任务清单（名称/间隔/初始延迟/启用态）
//! - GET /scheduler/jobs/runs    执行历史（按任务名过滤，倒序分页）
//! - POST /scheduler/jobs/{name}/trigger  手动触发一轮执行（走与定时循环
//!   同一包装层，trigger=manual 落历史；任务不存在 404）
//!
//! 权限口径：与全仓"权限键由 URL 段推导"一致，admin 段由
//! middleware/permission.rs 按段名推导，此处不再自设角色门。

use axum::Json;
use axum::extract::{Path, Query, State};
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder, QuerySelect};

use crate::models::scheduler_job_run;
use crate::utils::error::AppError;
use crate::utils::response::ApiResponse;
use crate::utils::scheduler_framework::{global_registry, trigger_job_once};

/// 执行历史查询参数
#[derive(Debug, serde::Deserialize)]
pub struct JobRunsQuery {
    /// 按任务名过滤（可选）
    pub scheduler_name: Option<String>,
    /// 分页参数（与全仓 page/page_size 口径一致）
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

/// GET /scheduler/jobs：已注册任务清单
pub async fn list_jobs()
-> Result<Json<ApiResponse<Vec<crate::utils::scheduler_framework::SchedulerJobSummary>>>, AppError>
{
    let registry = global_registry()
        .ok_or_else(|| AppError::internal("调度器注册中心尚未初始化，任务清单不可用"))?;
    let jobs = registry.job_summaries().await;
    Ok(Json(ApiResponse::success(jobs)))
}

/// GET /scheduler/jobs/runs：执行历史倒序分页
pub async fn list_job_runs(
    State(state): State<crate::container::AppState>,
    Query(params): Query<JobRunsQuery>,
) -> Result<
    Json<ApiResponse<crate::utils::response::PaginatedResponse<scheduler_job_run::Model>>>,
    AppError,
> {
    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(20).clamp(1, 100);
    let mut select = scheduler_job_run::Entity::find()
        .order_by_desc(scheduler_job_run::Column::StartedAt)
        .order_by_desc(scheduler_job_run::Column::Id);
    if let Some(name) = &params.scheduler_name {
        select = select.filter(scheduler_job_run::Column::SchedulerName.eq(name.as_str()));
    }
    let (items, total) = crate::utils::pagination::paginate_with_total(
        select.paginate(state.db.as_ref(), page_size),
        page,
    )
    .await
    .map_err(|e| AppError::internal(format!("执行历史查询失败: {e}")))?;
    Ok(Json(ApiResponse::success(
        crate::utils::response::PaginatedResponse {
            items,
            total,
            page,
            page_size,
        },
    )))
}

/// POST /scheduler/jobs/{name}/trigger：手动触发一轮执行
pub async fn trigger_job(
    Path(name): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    match trigger_job_once(&name).await {
        Err(missing) => Err(AppError::not_found(format!("调度器不存在: {missing}"))),
        Ok(Ok(())) => Ok(Json(ApiResponse::success(serde_json::json!({
            "scheduler_name": name,
            "triggered": true,
        })))),
        Ok(Err(e)) => {
            // 任务执行了但失败：历史已落 failed 行，端点如实回业务错
            Err(AppError::business_displayable(format!(
                "任务 {name} 执行失败: {e}"
            )))
        }
    }
}
