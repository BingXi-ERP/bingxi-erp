//! 慢查询审计 Handler（P13 批 1 B-慢查询审计）
//!
//! 提供：
//! - GET /api/v1/erp/slow-queries         分页 + 多维筛选（时间范围 / 最小执行时间 / 关键词）
//! - GET /api/v1/erp/slow-queries/stats   TOP 10 聚合统计
//! - POST /api/v1/erp/slow-queries/refresh 手动触发一次采集

use axum::{
    Json,
    extract::{Path, Query, State},
};
use chrono::{DateTime, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, Set, Statement,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::slow_query::{self, SlowQueryDto, SlowQueryStatDto};
use crate::services::slow_query_collector::SlowQueryCollector;
use crate::utils::error::AppError;
use crate::utils::response::ApiResponse;
use crate::utils::sql_escape::safe_like_pattern;

/// 列表查询参数（全部可选）
// P1-14 修复（2026-06-25）：路由已挂载至 system::routes()，函数标记已移除。
// 结构体字段经 serde Deserialize 派生使用。
#[allow(dead_code, reason = "反序列化输入字段")]
#[derive(Debug, Default, Deserialize)]
pub struct SlowQueryListParams {
    /// 起始时间（RFC3339 / ISO8601）
    pub start_time: Option<String>,
    /// 截止时间（RFC3339 / ISO8601）
    pub end_time: Option<String>,
    /// 最小执行时间（毫秒），仅返回 >= 此值的记录
    pub min_duration: Option<f64>,
    /// 关键词搜索（模糊匹配 query_text）
    pub keyword: Option<String>,
    /// 当前页（从 1 开始）
    pub page: Option<u64>,
    /// 每页条数
    pub page_size: Option<u64>,
}

fn parse_time_param(raw: &str, field: &str) -> Result<DateTime<Utc>, AppError> {
    DateTime::parse_from_rfc3339(raw)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| {
            AppError::validation_displayable(format!(
                "{field} 时间格式非法（应为 RFC 3339，如 2026-11-25T00:00:00Z）：{e}"
            ))
        })
}

/// 列表返回包装
// P1-14 修复（2026-06-25）：路由已挂载，字段经 serde Serialize 派生使用。
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct SlowQueryListResponse {
    pub items: Vec<SlowQueryDto>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

/// 统计接口返回包装
// P1-14 修复（2026-06-25）：路由已挂载，字段经 serde Serialize 派生使用。
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct SlowQueryStatsResponse {
    /// TOP 10 列表（按最大平均执行时间倒序）
    pub top10: Vec<SlowQueryStatDto>,
    /// 慢查询总条数
    pub total_count: u64,
    /// 采集时间范围描述（"近 7 天"等）
    pub time_range: String,
}

/// 手动刷新接口返回
// P1-14 修复（2026-06-25）：路由已挂载，字段经 serde Serialize 派生使用。
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct SlowQueryRefreshResponse {
    /// 本次采集写入条数
    pub inserted: usize,
    /// 提示信息
    pub message: String,
}

/// GET /api/v1/erp/slow-queries；分页 + 多维筛选（时间范围 / 最小执行时间 / 关键词）
pub async fn list_slow_queries(
    State(state): State<AppState>,
    _auth: AuthContext,
    Query(params): Query<SlowQueryListParams>,
) -> Result<Json<ApiResponse<SlowQueryListResponse>>, AppError> {
    // 防御式分页参数：unwrap_or(1).max(1) 显式调用 Ord::max 避免 ExprTrait 歧义
    let page = std::cmp::Ord::max(params.page.unwrap_or(1), 1);
    let page_size = params.page_size.unwrap_or(20).clamp(1, 100);

    let start_time = params
        .start_time
        .as_deref()
        .map(|raw| parse_time_param(raw, "start_time"))
        .transpose()?;
    let end_time = params
        .end_time
        .as_deref()
        .map(|raw| parse_time_param(raw, "end_time"))
        .transpose()?;
    if let (Some(start), Some(end)) = (start_time, end_time) {
        if start > end {
            return Err(AppError::validation_displayable(
                "起始时间不能晚于截止时间".to_string(),
            ));
        }
    }

    let mut q = slow_query::Entity::find();

    if let Some(start) = start_time {
        q = q.filter(slow_query::Column::CapturedAt.gte(start.naive_utc()));
    }
    if let Some(end) = end_time {
        q = q.filter(slow_query::Column::CapturedAt.lte(end.naive_utc()));
    }

    // 最小执行时间
    if let Some(min_dur) = params.min_duration {
        q = q.filter(slow_query::Column::ExecutionTimeMs.gte(min_dur));
    }

    // 关键词模糊搜索
    if let Some(kw) = &params.keyword {
        if !kw.trim().is_empty() {
            // 批次 94 P2-3 修复：LIKE 模式注入，转义 % _ \ 特殊字符
            let pattern = safe_like_pattern(kw);
            q = q.filter(slow_query::Column::QueryText.like(pattern));
        }
    }

    let paginator = q
        .order_by_desc(slow_query::Column::ExecutionTimeMs)
        .paginate(state.db.as_ref(), page_size);

    let total = paginator
        .num_items()
        .await
        .map_err(|e| AppError::database(format!("统计慢查询失败: {}", e)))?;
    let logs = paginator
        // 批次 98 P2-A 修复（v5 复审）：page clamp 防 DoS
        .fetch_page(page.clamp(1, 1000).saturating_sub(1))
        .await
        .map_err(|e| AppError::database(format!("查询慢查询失败: {}", e)))?;

    let items: Vec<SlowQueryDto> = logs.into_iter().map(Into::into).collect();
    Ok(Json(ApiResponse::success(SlowQueryListResponse {
        items,
        total,
        page,
        page_size,
    })))
}

/// GET /api/v1/erp/slow-queries/stats；聚合统计：按 query_text 分组，TOP 10（按最大平均执行时间倒序）
pub async fn get_slow_query_stats(
    State(state): State<AppState>,
    _auth: AuthContext,
) -> Result<Json<ApiResponse<SlowQueryStatsResponse>>, AppError> {
    // 使用原生 SQL 聚合：按 query_text 分组，取 max(execution_time_ms) / sum(calls) / avg(rows)
    // 仅取近 7 天数据，避免历史数据爆炸
    // B03-P2-5 修复：SQL 为静态常量，无用户输入拼接，from_string 安全（无注入风险）
    let sql = "SELECT query_text, \
                      MAX(execution_time_ms) as max_exec_time_ms, \
                      COALESCE(SUM(calls), 0)::bigint as total_calls, \
                      COALESCE(AVG(rows_examined), 0)::double precision as avg_rows, \
                      COUNT(*) as sample_count \
               FROM slow_query_log \
               WHERE captured_at >= NOW() - INTERVAL '7 days' \
               GROUP BY query_text \
               ORDER BY max_exec_time_ms DESC \
               LIMIT 10";

    let query_result = state
        .db
        .as_ref()
        .query_all_raw(Statement::from_string(
            sea_orm::DatabaseBackend::Postgres,
            sql.to_string(),
        ))
        .await
        .map_err(|e| AppError::database(format!("查询慢查询统计失败: {}", e)))?;

    let mut top10: Vec<SlowQueryStatDto> = Vec::with_capacity(query_result.len());
    for row in query_result {
        let query_text = row
            .try_get_by_index::<String>(0)
            .map_err(|e| AppError::database(format!("读取慢查询统计 SQL 文本失败: {}", e)))?;
        let max_exec_time_ms = row
            .try_get_by_index::<f64>(1)
            .map_err(|e| AppError::database(format!("读取慢查询统计最大耗时失败: {}", e)))?;
        let total_calls = row
            .try_get_by_index::<i64>(2)
            .map_err(|e| AppError::database(format!("读取慢查询统计调用次数失败: {}", e)))?;
        let avg_rows = row
            .try_get_by_index::<f64>(3)
            .map_err(|e| AppError::database(format!("读取慢查询统计平均扫描行失败: {}", e)))?;
        let sample_count = row
            .try_get_by_index::<i64>(4)
            .map_err(|e| AppError::database(format!("读取慢查询统计样本数失败: {}", e)))?;

        top10.push(SlowQueryStatDto {
            query_text,
            max_exec_time_ms,
            total_calls,
            avg_rows,
            sample_count,
        });
    }

    // 总条数（近 7 天）
    // B03-P2-5 修复：count_sql 为静态常量，无用户输入拼接，from_string 安全（无注入风险）
    let count_sql =
        "SELECT COUNT(*) FROM slow_query_log WHERE captured_at >= NOW() - INTERVAL '7 days'";
    let count_row = state
        .db
        .as_ref()
        .query_one_raw(Statement::from_string(
            sea_orm::DatabaseBackend::Postgres,
            count_sql.to_string(),
        ))
        .await
        .map_err(|e| AppError::database(format!("统计慢查询总数失败: {}", e)))?;
    let total_count = count_row
        .ok_or_else(|| AppError::database("统计慢查询总数未返回结果"))?
        .try_get_by_index::<i64>(0)
        .map_err(|e| AppError::database(format!("读取慢查询总数失败: {}", e)))?;

    Ok(Json(ApiResponse::success(SlowQueryStatsResponse {
        top10,
        // 显式调用 std::cmp::Ord::max 避免与 migration::ExprTrait::max 冲突
        total_count: std::cmp::Ord::max(total_count, 0) as u64,
        time_range: "近 7 天".to_string(),
    })))
}

/// 慢查询摘要查询参数
#[allow(dead_code, reason = "反序列化输入字段")]
#[derive(Debug, Deserialize)]
pub struct SlowQuerySummaryQuery {
    pub keyword: Option<String>,
}

/// batch-17 P3: 慢查询摘要数据
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct SlowQuerySummary {
    pub total_queries: i64,
    pub queries_today: i64,
    pub avg_execution_time: f64,
    pub max_execution_time: f64,
    pub most_frequent_query: Option<String>,
    pub optimization_status: OptimizationStatusSummary,
}

/// 优化状态摘要
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct OptimizationStatusSummary {
    pub pending: i64,
    pub in_progress: i64,
    pub optimized: i64,
    pub ignored: i64,
}

/// GET /api/v1/erp/slow-queries/summary - 慢查询摘要
pub async fn get_slow_query_summary(
    State(state): State<AppState>,
    _auth: AuthContext,
    Query(query): Query<SlowQuerySummaryQuery>,
) -> Result<Json<ApiResponse<SlowQuerySummary>>, AppError> {
    let keyword_pattern = query
        .keyword
        .as_deref()
        .map(str::trim)
        .filter(|keyword| !keyword.is_empty())
        .map(safe_like_pattern);
    let summary_sql = "SELECT \
        COUNT(*) AS total, \
        COUNT(*) FILTER (WHERE captured_at >= CURRENT_DATE) AS today, \
        COALESCE(AVG(execution_time_ms), 0)::double precision AS avg_time, \
        COALESCE(MAX(execution_time_ms), 0)::double precision AS max_time, \
        (SELECT query_text FROM slow_query_log WHERE ($1::text IS NULL OR query_text LIKE $1) GROUP BY query_text ORDER BY COUNT(*) DESC, query_text ASC LIMIT 1) AS most_frequent_query, \
        COUNT(*) FILTER (WHERE optimization_status IS NULL OR optimization_status = 'pending') AS pending, \
        COUNT(*) FILTER (WHERE optimization_status = 'in_progress') AS in_progress, \
        COUNT(*) FILTER (WHERE optimization_status = 'resolved') AS optimized, \
        COUNT(*) FILTER (WHERE optimization_status = 'wont_fix') AS ignored \
        FROM slow_query_log WHERE ($1::text IS NULL OR query_text LIKE $1)";
    let row = state
        .db
        .as_ref()
        .query_one_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            summary_sql.to_string(),
            [sea_orm::Value::String(keyword_pattern)],
        ))
        .await
        .map_err(|e| AppError::database(format!("查询慢查询摘要失败: {}", e)))?
        .ok_or_else(|| AppError::database("慢查询摘要查询未返回聚合行".to_string()))?;
    let total_queries = row
        .try_get::<i64>("", "total")
        .map_err(|e| AppError::database(format!("读取慢查询总数失败: {}", e)))?;
    let queries_today = row
        .try_get::<i64>("", "today")
        .map_err(|e| AppError::database(format!("读取今日慢查询数失败: {}", e)))?;
    let avg_execution_time = row
        .try_get::<f64>("", "avg_time")
        .map_err(|e| AppError::database(format!("读取平均执行时间失败: {}", e)))?;
    let max_execution_time = row
        .try_get::<f64>("", "max_time")
        .map_err(|e| AppError::database(format!("读取最大执行时间失败: {}", e)))?;
    let most_frequent_query = row
        .try_get::<Option<String>>("", "most_frequent_query")
        .map_err(|e| AppError::database(format!("读取最频繁查询失败: {}", e)))?;
    let optimization_status = OptimizationStatusSummary {
        pending: row
            .try_get::<i64>("", "pending")
            .map_err(|e| AppError::database(format!("读取待处理统计失败: {}", e)))?,
        in_progress: row
            .try_get::<i64>("", "in_progress")
            .map_err(|e| AppError::database(format!("读取处理中统计失败: {}", e)))?,
        optimized: row
            .try_get::<i64>("", "optimized")
            .map_err(|e| AppError::database(format!("读取已优化统计失败: {}", e)))?,
        ignored: row
            .try_get::<i64>("", "ignored")
            .map_err(|e| AppError::database(format!("读取不修复统计失败: {}", e)))?,
    };

    let summary = SlowQuerySummary {
        total_queries,
        queries_today,
        avg_execution_time,
        max_execution_time,
        most_frequent_query,
        optimization_status,
    };

    Ok(Json(ApiResponse::success(summary)))
}

/// POST /api/v1/erp/slow-queries/refresh；手动触发一次慢查询采集（用于前端"刷新"按钮）；返回：插入条数 + 提示信息
pub async fn refresh_slow_queries(
    State(state): State<AppState>,
    _auth: AuthContext,
) -> Result<Json<ApiResponse<SlowQueryRefreshResponse>>, AppError> {
    // batch-17 P3: 使用默认阈值配置（100ms / 100 rows）
    // TODO: 从 AppState.settings 读取配置，需要将 settings 存入 AppState
    let collector = Arc::new(SlowQueryCollector::new(state.db.clone(), 100.0, 100));

    // 扩展缺失由 collector 返回 None，端点明确降级为零条；其他采集错误原样透传。
    // 采集失败的排障详情由 collector 侧的 ERROR 日志承载（不在此脱敏重包）。
    let (inserted, message) = match collector.collect_once().await? {
        Some(0) => (
            0,
            "本次未发现新的慢查询（最近 5 分钟内无 mean_exec_time > 100ms 的查询）".to_string(),
        ),
        Some(inserted) => (inserted, format!("本次采集写入 {} 条慢查询记录", inserted)),
        None => (
            0,
            "慢查询采集暂不可用，请联系管理员启用性能统计扩展".to_string(),
        ),
    };

    Ok(Json(ApiResponse::success(SlowQueryRefreshResponse {
        inserted,
        message,
    })))
}

/// V15 P2 20.5-C：更新慢查询优化状态请求
#[allow(dead_code, reason = "反序列化输入字段")]
#[derive(Debug, Deserialize)]
pub struct UpdateOptimizationRequest {
    /// 优化状态（pending/in_progress/resolved/wont_fix）
    pub optimization_status: Option<String>,
    /// 负责人
    pub assigned_to: Option<String>,
    /// Jira 工单号
    pub jira_ticket: Option<String>,
}

/// V15 P2 20.5-C：更新慢查询优化状态
///
/// PUT /api/v1/erp/slow-queries/:id/optimization
///
/// 允许管理员更新慢查询的优化状态、负责人和 Jira 工单号。
pub async fn update_slow_query_optimization(
    State(state): State<AppState>,
    _auth: AuthContext,
    Path(id): Path<i64>,
    Json(req): Json<UpdateOptimizationRequest>,
) -> Result<Json<ApiResponse<SlowQueryDto>>, AppError> {
    // 校验 optimization_status 合法性
    if let Some(status) = &req.optimization_status {
        let valid_statuses = ["pending", "in_progress", "resolved", "wont_fix"];
        if !valid_statuses.contains(&status.as_str()) {
            return Err(AppError::bad_request(format!(
                "optimization_status 必须是 {:?} 之一",
                valid_statuses
            )));
        }
    }

    // 查询现有记录
    let existing = slow_query::Entity::find_by_id(id)
        .one(state.db.as_ref())
        .await
        .map_err(|e| AppError::database(format!("查询慢查询记录失败: {}", e)))?
        .ok_or_else(|| AppError::not_found(format!("慢查询记录 {} 不存在", id)))?;

    // 更新字段
    let mut active: slow_query::ActiveModel = existing.into();
    if let Some(status) = req.optimization_status {
        active.optimization_status = Set(Some(status));
    }
    if let Some(assigned) = req.assigned_to {
        active.assigned_to = Set(Some(assigned));
    }
    if let Some(ticket) = req.jira_ticket {
        active.jira_ticket = Set(Some(ticket));
    }

    let updated = active
        .update(state.db.as_ref())
        .await
        .map_err(|e| AppError::database(format!("更新慢查询优化状态失败: {}", e)))?;

    Ok(Json(ApiResponse::success(updated.into())))
}

/// batch-17 P3: 慢查询周报查询参数
#[allow(dead_code, reason = "反序列化输入字段")]
#[derive(Debug, Deserialize)]
pub struct WeeklyReportQuery {
    pub weeks: Option<u32>,
    pub keyword: Option<String>,
}

/// batch-17 P3: 慢查询周报数据
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize)]
pub struct SlowQueryWeeklyReport {
    pub week_start: String,
    pub week_end: String,
    pub total_queries: i64,
    pub new_queries: i64,
    pub optimized_queries: i64,
    pub avg_execution_time: f64,
    pub top_queries: Vec<SlowQueryStatDto>,
}

/// GET /api/v1/erp/slow-queries/report/weekly - 慢查询周报
pub async fn get_weekly_report(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<WeeklyReportQuery>,
) -> Result<Json<ApiResponse<SlowQueryWeeklyReport>>, AppError> {
    tracing::debug!(user_id = auth.user_id, "慢查询周报查询");

    let weeks = query.weeks.unwrap_or(1);
    if !(1..=5200).contains(&weeks) {
        return Err(AppError::validation_displayable(
            "weeks 必须在 1 到 5200 之间".to_string(),
        ));
    }
    let keyword_pattern = query
        .keyword
        .as_deref()
        .map(str::trim)
        .filter(|keyword| !keyword.is_empty())
        .map(safe_like_pattern);
    let now = chrono::Utc::now();
    let week_start = now
        .checked_sub_signed(chrono::Duration::weeks(weeks as i64))
        .ok_or_else(|| AppError::validation_displayable("weeks 超出支持的时间范围".to_string()))?;

    // 查询本周慢查询统计
    let mut total_query =
        slow_query::Entity::find().filter(slow_query::Column::CapturedAt.gte(week_start));
    if let Some(pattern) = &keyword_pattern {
        total_query = total_query.filter(slow_query::Column::QueryText.like(pattern.clone()));
    }
    let total_queries = total_query
        .count(state.db.as_ref())
        .await
        .map_err(|e| AppError::database(format!("查询慢查询总数失败: {}", e)))?;

    // 查询新增慢查询（本周首次出现的）
    let mut new_query = slow_query::Entity::find()
        .filter(slow_query::Column::CapturedAt.gte(week_start))
        .filter(slow_query::Column::OptimizationStatus.is_null());
    if let Some(pattern) = &keyword_pattern {
        new_query = new_query.filter(slow_query::Column::QueryText.like(pattern.clone()));
    }
    let new_queries = new_query
        .count(state.db.as_ref())
        .await
        .map_err(|e| AppError::database(format!("查询新增慢查询失败: {}", e)))?;

    // 查询已优化的慢查询
    let mut optimized_query = slow_query::Entity::find()
        .filter(slow_query::Column::CapturedAt.gte(week_start))
        .filter(slow_query::Column::OptimizationStatus.eq("resolved"));
    if let Some(pattern) = &keyword_pattern {
        optimized_query =
            optimized_query.filter(slow_query::Column::QueryText.like(pattern.clone()));
    }
    let optimized_queries = optimized_query
        .count(state.db.as_ref())
        .await
        .map_err(|e| AppError::database(format!("查询已优化慢查询失败: {}", e)))?;

    // 查询平均执行时间
    let avg_sql = "SELECT COALESCE(AVG(execution_time_ms), 0)::double precision AS avg_time \
        FROM slow_query_log WHERE captured_at >= $1 AND ($2::text IS NULL OR query_text LIKE $2)";
    let avg_result = state
        .db
        .as_ref()
        .query_one_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            avg_sql.to_string(),
            [
                sea_orm::Value::ChronoDateTimeUtc(Some(week_start)),
                sea_orm::Value::String(keyword_pattern.clone()),
            ],
        ))
        .await
        .map_err(|e| AppError::database(format!("查询平均执行时间失败: {}", e)))?
        .ok_or_else(|| AppError::database("慢查询周报平均执行时间查询未返回聚合行".to_string()))?;
    let avg_execution_time = avg_result
        .try_get::<f64>("", "avg_time")
        .map_err(|e| AppError::database(format!("读取平均执行时间失败: {}", e)))?;

    // 查询 TOP 10 慢查询
    let top_sql = "SELECT query_text, \
        MAX(execution_time_ms)::double precision AS max_exec_time_ms, \
        COALESCE(SUM(calls), 0)::bigint AS total_calls, \
        COALESCE(AVG(rows_examined), 0)::double precision AS avg_rows, \
        COUNT(*)::bigint AS sample_count \
        FROM slow_query_log WHERE captured_at >= $1 AND ($2::text IS NULL OR query_text LIKE $2) \
        GROUP BY query_text ORDER BY max_exec_time_ms DESC, query_text ASC LIMIT 10";
    let top_rows = state
        .db
        .as_ref()
        .query_all_raw(Statement::from_sql_and_values(
            sea_orm::DatabaseBackend::Postgres,
            top_sql.to_string(),
            [
                sea_orm::Value::ChronoDateTimeUtc(Some(week_start)),
                sea_orm::Value::String(keyword_pattern.clone()),
            ],
        ))
        .await
        .map_err(|e| AppError::database(format!("查询 TOP 慢查询失败: {}", e)))?;
    let mut top_queries = Vec::with_capacity(top_rows.len());
    for row in top_rows {
        top_queries.push(SlowQueryStatDto {
            query_text: row
                .try_get::<String>("", "query_text")
                .map_err(|e| AppError::database(format!("读取 TOP 查询文本失败: {}", e)))?,
            max_exec_time_ms: row
                .try_get::<f64>("", "max_exec_time_ms")
                .map_err(|e| AppError::database(format!("读取 TOP 最大执行时间失败: {}", e)))?,
            total_calls: row
                .try_get::<i64>("", "total_calls")
                .map_err(|e| AppError::database(format!("读取 TOP 累计调用数失败: {}", e)))?,
            avg_rows: row
                .try_get::<f64>("", "avg_rows")
                .map_err(|e| AppError::database(format!("读取 TOP 平均扫描行数失败: {}", e)))?,
            sample_count: row
                .try_get::<i64>("", "sample_count")
                .map_err(|e| AppError::database(format!("读取 TOP 样本数失败: {}", e)))?,
        });
    }

    let report = SlowQueryWeeklyReport {
        week_start: week_start.format("%Y-%m-%d").to_string(),
        week_end: now.format("%Y-%m-%d").to_string(),
        total_queries: total_queries as i64,
        new_queries: new_queries as i64,
        optimized_queries: optimized_queries as i64,
        avg_execution_time,
        top_queries,
    };

    Ok(Json(ApiResponse::success(report)))
}
