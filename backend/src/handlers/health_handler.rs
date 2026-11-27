use axum::{Json, extract::State, http::StatusCode, response::IntoResponse};
use chrono::Utc;
use serde::Serialize;
use std::sync::OnceLock;
use std::time::Instant;
use sysinfo::{Disks, System};

use crate::container::AppState;
use crate::utils::redis_cache::{RedisRuntimeStatus, redis_runtime_status};

use utoipa::ToSchema;

/// 进程启动时间（OnceLock 保证只初始化一次）
static START_TIME: OnceLock<Instant> = OnceLock::new();

/// 初始化进程启动时间（main 入口调用一次）；OnceLock 首次写入即锁定，确保 uptime 反映真实的进程启动时间而非首次健康检查时间。
pub fn start_time_init() -> Instant {
    *START_TIME.get_or_init(Instant::now)
}

/// 获取进程启动时间（若未初始化则当场初始化）
fn start_time() -> Instant {
    start_time_init()
}

/// 健康状态响应
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize, ToSchema)]
pub struct HealthStatus {
    /// 服务状态 (healthy, unhealthy, degraded)
    pub status: String,
    /// 服务名称
    pub service: String,
    /// 当前时间
    #[schema(value_type = String, format = DateTime)]
    pub timestamp: chrono::DateTime<Utc>,
    /// 版本号
    pub version: String,
    /// 运行时长（秒）
    pub uptime_seconds: u64,
    /// 详细检查信息
    pub checks: HealthChecks,
}

/// 健康检查详情
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize, ToSchema)]
pub struct HealthChecks {
    /// 数据库连接状态
    pub database: HealthCheckItem,
    /// Redis 运行时状态
    pub redis: HealthCheckItem,
    /// 内存状态
    pub memory: HealthCheckItem,
    /// 磁盘状态
    pub disk: HealthCheckItem,
}

/// 单个健康检查项
#[allow(dead_code, reason = "序列化输出字段")]
#[derive(Debug, Serialize, ToSchema)]
pub struct HealthCheckItem {
    /// 状态 (healthy, degraded, unhealthy, not_configured, unreachable)
    pub status: String,
    /// 消息
    pub message: Option<String>,
    /// 响应时间（毫秒）
    pub response_time_ms: Option<u128>,
}

/// 健康检查接口
#[utoipa::path(
    get,
    path = "/api/v1/erp/init/health",
    responses(
        (status = 200, description = "服务完全健康", body = HealthStatus),
        (status = 206, description = "服务部分降级", body = HealthStatus),
        (status = 503, description = "服务不可用", body = HealthStatus)
    ),
    tag = "health"
)]
pub async fn health_check(State(state): State<AppState>) -> impl IntoResponse {
    let _start_time = std::time::Instant::now();

    // 确保启动时间已初始化（首次调用健康检查时记录）
    let _ = start_time();

    // 检查数据库连接
    let db_check = check_database(&state).await;

    // 检查 Redis 运行时状态
    let production = crate::utils::config::is_production();
    let redis_check = check_redis(production).await;

    // 检查内存
    let memory_check = check_memory();

    // 检查磁盘
    let disk_check = check_disk();

    // 计算整体状态
    let checks = HealthChecks {
        database: db_check,
        redis: redis_check,
        memory: memory_check,
        disk: disk_check,
    };
    let overall_status = overall_health_status(&checks, production);

    let health = HealthStatus {
        status: overall_status.to_string(),
        service: "Bingxi Management Platform".to_string(),
        timestamp: Utc::now(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: get_uptime(),
        checks,
    };

    let status_code = if overall_status == "healthy" {
        StatusCode::OK
    } else if overall_status == "degraded" {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (status_code, Json(health))
}

fn overall_health_status(checks: &HealthChecks, production: bool) -> &'static str {
    if checks.database.status == "unhealthy"
        || (production
            && matches!(
                checks.redis.status.as_str(),
                "unreachable" | "not_configured"
            ))
    {
        "unhealthy"
    } else if checks.database.status == "healthy"
        && checks.redis.status == "healthy"
        && checks.memory.status == "healthy"
        && checks.disk.status == "healthy"
    {
        "healthy"
    } else {
        "degraded"
    }
}

async fn check_redis(production: bool) -> HealthCheckItem {
    let start = Instant::now();
    let runtime_status = redis_runtime_status().await;
    let duration = start.elapsed().as_millis();

    let message = match (runtime_status, production) {
        (RedisRuntimeStatus::Healthy, _) => "Redis 连接正常",
        (RedisRuntimeStatus::NotConfigured, true) => "生产环境未配置 Redis",
        (RedisRuntimeStatus::NotConfigured, false) => "Redis 未配置，使用进程内降级",
        (RedisRuntimeStatus::Unreachable, true) => "Redis 不可达",
        (RedisRuntimeStatus::Unreachable, false) => "Redis 不可达，业务操作使用降级路径",
    };

    HealthCheckItem {
        status: runtime_status.as_str().to_string(),
        message: Some(message.to_string()),
        response_time_ms: Some(duration),
    }
}

/// 检查数据库连接
async fn check_database(state: &AppState) -> HealthCheckItem {
    let start = std::time::Instant::now();

    // 实际检查数据库连接池状态
    let is_connected = state.db.ping().await.is_ok();

    let duration = start.elapsed();

    if is_connected {
        HealthCheckItem {
            status: "healthy".to_string(),
            message: Some("数据库连接正常".to_string()),
            response_time_ms: Some(duration.as_millis()),
        }
    } else {
        HealthCheckItem {
            status: "unhealthy".to_string(),
            message: Some("数据库连接失败".to_string()),
            response_time_ms: Some(duration.as_millis()),
        }
    }
}

/// 检查内存使用；基于 sysinfo 读取真实内存数据： - used / total 比例 > 90% → unhealthy -
/// 比例 > 75% → degraded（但整体 status 只区分 healthy/unhealthy，故归 healthy）
fn check_memory() -> HealthCheckItem {
    let start = std::time::Instant::now();
    let mut sys = System::new_all();
    sys.refresh_memory();

    let total = sys.total_memory();
    let used = sys.used_memory();

    if total == 0 {
        return HealthCheckItem {
            status: "unhealthy".to_string(),
            message: Some("无法读取内存信息".to_string()),
            response_time_ms: Some(start.elapsed().as_millis()),
        };
    }

    let used_ratio = used as f64 / total as f64;
    let used_mb = used / 1024 / 1024;
    let total_mb = total / 1024 / 1024;
    let message = format!(
        "内存使用 {}/{} MB ({:.0}%)",
        used_mb,
        total_mb,
        used_ratio * 100.0
    );

    let status = if used_ratio > 0.90 {
        "unhealthy"
    } else {
        "healthy"
    };

    HealthCheckItem {
        status: status.to_string(),
        message: Some(message),
        response_time_ms: Some(start.elapsed().as_millis()),
    }
}

/// 检查磁盘空间；基于 sysinfo 读取根分区真实剩余空间： - used / total 比例 > 90% → unhealthy - 否则 → healthy
fn check_disk() -> HealthCheckItem {
    let start = std::time::Instant::now();
    let disks = Disks::new_with_refreshed_list();
    let root_disk = disks
        .list()
        .iter()
        .find(|d| d.mount_point() == std::path::Path::new("/"))
        .or_else(|| disks.list().first());

    let Some(disk) = root_disk else {
        return HealthCheckItem {
            status: "unhealthy".to_string(),
            message: Some("无法读取磁盘信息".to_string()),
            response_time_ms: Some(start.elapsed().as_millis()),
        };
    };

    let total = disk.total_space();
    let available = disk.available_space();
    if total == 0 {
        return HealthCheckItem {
            status: "unhealthy".to_string(),
            message: Some("磁盘总空间为 0".to_string()),
            response_time_ms: Some(start.elapsed().as_millis()),
        };
    }

    let used = total.saturating_sub(available);
    let used_ratio = used as f64 / total as f64;
    let used_gb = used / 1024 / 1024 / 1024;
    let total_gb = total / 1024 / 1024 / 1024;
    let message = format!(
        "磁盘使用 {}/{} GB ({:.0}%)",
        used_gb,
        total_gb,
        used_ratio * 100.0
    );

    let status = if used_ratio > 0.90 {
        "unhealthy"
    } else {
        "healthy"
    };

    HealthCheckItem {
        status: status.to_string(),
        message: Some(message),
        response_time_ms: Some(start.elapsed().as_millis()),
    }
}

/// 获取服务运行时长（秒）；基于 OnceLock 记录的进程启动时间计算真实 uptime。 首次调用（通常在 health_check 入口）会初始化 START_TIME。
fn get_uptime() -> u64 {
    start_time().elapsed().as_secs()
}

#[derive(Debug, PartialEq, Eq)]
enum ReadinessDecision {
    Healthy,
    Degraded,
    NotReady(&'static str),
}

fn readiness_decision(
    database_healthy: bool,
    redis_status: RedisRuntimeStatus,
    production: bool,
) -> ReadinessDecision {
    if !database_healthy {
        return ReadinessDecision::NotReady("数据库连接失败");
    }

    match (redis_status, production) {
        (RedisRuntimeStatus::Healthy, _) => ReadinessDecision::Healthy,
        (RedisRuntimeStatus::NotConfigured, true) => {
            ReadinessDecision::NotReady("生产环境未配置 Redis")
        }
        (RedisRuntimeStatus::NotConfigured, false) => ReadinessDecision::Degraded,
        (RedisRuntimeStatus::Unreachable, true) => ReadinessDecision::NotReady("Redis 不可用"),
        (RedisRuntimeStatus::Unreachable, false) => ReadinessDecision::Degraded,
    }
}

/// 就绪检查（检查所有依赖是否就绪）；本接口不使用业务 envelope，仅返回探针状态与固定原因。
pub async fn readiness_check(State(state): State<AppState>) -> impl IntoResponse {
    // 检查数据库是否可连接
    let db_status = check_database(&state).await;
    let redis_status = redis_runtime_status().await;
    let production = crate::utils::config::is_production();

    match readiness_decision(db_status.status == "healthy", redis_status, production) {
        ReadinessDecision::Healthy => (
            StatusCode::OK,
            Json(serde_json::json!({
                "status": "healthy"
            })),
        ),
        ReadinessDecision::Degraded => (
            StatusCode::OK,
            Json(serde_json::json!({
                "status": "degraded"
            })),
        ),
        ReadinessDecision::NotReady(reason) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "status": "not_ready",
                "reason": reason
            })),
        ),
    }
}

/// 存活检查（负载均衡器 / 监控探针使用）
pub async fn liveness_check() -> impl IntoResponse {
    // 简单的存活检查，只要服务能响应就返回成功
    StatusCode::OK
}

#[cfg(test)]
mod tests {
    use super::*;

    fn healthy_item() -> HealthCheckItem {
        HealthCheckItem {
            status: "healthy".to_string(),
            message: None,
            response_time_ms: Some(1),
        }
    }

    fn checks_with_redis(status: &str) -> HealthChecks {
        HealthChecks {
            database: healthy_item(),
            redis: HealthCheckItem {
                status: status.to_string(),
                message: None,
                response_time_ms: Some(1),
            },
            memory: healthy_item(),
            disk: healthy_item(),
        }
    }

    #[test]
    fn configured_redis_failure_prevents_overall_healthy_status() {
        let checks = checks_with_redis("unreachable");

        assert_eq!(overall_health_status(&checks, true), "unhealthy");
        assert_eq!(overall_health_status(&checks, false), "degraded");
    }

    #[test]
    fn development_redis_degradation_is_reflected_without_blocking_health() {
        let checks = checks_with_redis("not_configured");

        assert_eq!(overall_health_status(&checks, true), "unhealthy");
        assert_eq!(overall_health_status(&checks, false), "degraded");
    }

    #[test]
    fn all_healthy_dependencies_report_healthy() {
        let checks = checks_with_redis("healthy");

        assert_eq!(overall_health_status(&checks, true), "healthy");
    }

    #[test]
    fn readiness_blocks_unreachable_redis_only_in_production() {
        assert_eq!(
            readiness_decision(true, RedisRuntimeStatus::Unreachable, true),
            ReadinessDecision::NotReady("Redis 不可用")
        );
        assert_eq!(
            readiness_decision(true, RedisRuntimeStatus::Unreachable, false),
            ReadinessDecision::Degraded
        );
    }

    #[test]
    fn readiness_preserves_missing_redis_environment_semantics() {
        assert_eq!(
            readiness_decision(true, RedisRuntimeStatus::NotConfigured, true),
            ReadinessDecision::NotReady("生产环境未配置 Redis")
        );
        assert_eq!(
            readiness_decision(true, RedisRuntimeStatus::NotConfigured, false),
            ReadinessDecision::Degraded
        );
        assert_eq!(
            readiness_decision(true, RedisRuntimeStatus::Healthy, true),
            ReadinessDecision::Healthy
        );
    }

    #[test]
    fn database_failure_always_blocks_readiness() {
        assert_eq!(
            readiness_decision(false, RedisRuntimeStatus::Healthy, false),
            ReadinessDecision::NotReady("数据库连接失败")
        );
    }
}
