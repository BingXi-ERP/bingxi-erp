//! Redis 分布式缓存工具（P0-D03/D04 / Batch 488）
//!
//! 提供 Redis 作为分布式缓存后端的薄封装，支持：
//! - JSON 序列化的 get/set/del 操作
//! - 按前缀批量删除
//! - 优雅降级：未配置 `REDIS_URL` 时所有操作返回 None/no-op，已配置但不可达时按冷却重试
//!
//! ## 设计要点
//!
//! - **全局静态懒加载**：通过带冷却的共享状态在首次使用时初始化，连接失败不会永久禁用后续重试
//! - **ConnectionManager**：redis 1.6 的连接管理器，自动重连，适合多 tokio task 共享
//! - **双缓存策略**：本模块作为 L2（分布式），配合 `cache_service.rs` 的 moka L1（进程内）
//!
//! ## 使用示例
//!
//! ```ignore
//! use crate::utils::redis_cache::redis_cache_get_json;
//!
//! // 读缓存
//! if let Some(cached) = redis_cache_get_json::<UserModel>("user:42").await {
//!     return Ok(cached);
//! }
//! // 缓存未命中 → 查询 DB → 写入缓存
//! let user = UserEntity::find_by_id(42).one(&db).await?;
//! redis_cache_set_json("user:42", &user, 300).await; // 5 分钟 TTL
//! ```

use redis::AsyncCommands;
use redis::aio::{ConnectionManager, ConnectionManagerConfig};
use serde::{Serialize, de::DeserializeOwned};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use tokio::time::{timeout, timeout_at};

const REDIS_PROBE_TIMEOUT: Duration = Duration::from_secs(1);
const REDIS_RETRY_COOLDOWN: Duration = Duration::from_secs(5);

/// Redis 运行时状态；未配置与已配置但不可达需要不同的健康/就绪判定。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RedisRuntimeStatus {
    NotConfigured,
    Healthy,
    Unreachable,
}

impl RedisRuntimeStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotConfigured => "not_configured",
            Self::Healthy => "healthy",
            Self::Unreachable => "unreachable",
        }
    }
}

struct RedisRuntimeState {
    connection: Option<ConnectionManager>,
    status: RedisRuntimeStatus,
    retry_at: Option<Instant>,
    next_probe_at: Option<Instant>,
}

impl RedisRuntimeState {
    const fn new() -> Self {
        Self {
            connection: None,
            status: RedisRuntimeStatus::NotConfigured,
            retry_at: None,
            next_probe_at: None,
        }
    }

    fn allows_connection_attempt(&self, now: Instant) -> bool {
        self.connection.is_some() || self.retry_at.is_none_or(|retry_at| now >= retry_at)
    }

    fn allows_probe(&self, now: Instant) -> bool {
        self.next_probe_at.is_none_or(|probe_at| now >= probe_at)
    }

    fn record_success(&mut self) {
        self.status = RedisRuntimeStatus::Healthy;
        self.retry_at = None;
    }

    fn record_failure(&mut self, now: Instant) {
        self.status = RedisRuntimeStatus::Unreachable;
        self.retry_at = Some(now + REDIS_RETRY_COOLDOWN);
    }

    fn record_probe_success(&mut self, now: Instant) {
        self.record_success();
        self.next_probe_at = Some(now + REDIS_RETRY_COOLDOWN);
    }

    fn record_probe_failure(&mut self, now: Instant) {
        self.record_failure(now);
        self.next_probe_at = Some(now + REDIS_RETRY_COOLDOWN);
    }

    fn record_not_configured(&mut self) {
        self.connection = None;
        self.status = RedisRuntimeStatus::NotConfigured;
        self.retry_at = None;
        self.next_probe_at = None;
    }
}

static REDIS_STATE: Mutex<RedisRuntimeState> = Mutex::const_new(RedisRuntimeState::new());

async fn connect_redis(url: &str) -> Result<ConnectionManager, redis::RedisError> {
    let client = redis::Client::open(url)?;
    let config = ConnectionManagerConfig::new()
        .set_connection_timeout(Some(REDIS_PROBE_TIMEOUT))
        .set_response_timeout(Some(REDIS_PROBE_TIMEOUT))
        .set_number_of_retries(0);
    ConnectionManager::new_with_config(client, config).await
}

async fn get_redis_conn(state: &mut RedisRuntimeState) -> Option<ConnectionManager> {
    let Some(url) = get_redis_url() else {
        state.record_not_configured();
        return None;
    };

    if state.connection.is_none() {
        if !state.allows_connection_attempt(Instant::now()) {
            return None;
        }

        match timeout(REDIS_PROBE_TIMEOUT, connect_redis(&url)).await {
            Ok(Ok(connection)) => {
                state.connection = Some(connection.clone());
                state.record_success();
                tracing::info!("分布式缓存已启用 Redis 后端");
            }
            Ok(Err(_)) => {
                state.record_failure(Instant::now());
                tracing::warn!("Redis 初始化失败，分布式缓存暂降级为 no-op");
                return None;
            }
            Err(_) => {
                state.record_failure(Instant::now());
                tracing::warn!("Redis 初始化超时，分布式缓存暂降级为 no-op");
                return None;
            }
        }
    }

    state.connection.clone()
}

/// 获取有界、带冷却的 Redis 运行时状态；响应只使用状态枚举，不暴露连接信息。
pub async fn redis_runtime_status() -> RedisRuntimeStatus {
    let deadline = tokio::time::Instant::now() + REDIS_PROBE_TIMEOUT;
    let (url, status, connection) = {
        let Ok(mut state) = timeout_at(deadline, REDIS_STATE.lock()).await else {
            tracing::warn!("Redis 健康检查等待连接状态锁超时");
            return RedisRuntimeStatus::Unreachable;
        };

        let Some(url) = get_redis_url() else {
            state.record_not_configured();
            return RedisRuntimeStatus::NotConfigured;
        };
        if !state.allows_probe(Instant::now()) {
            return state.status;
        }
        (url, state.status, state.connection.clone())
    };

    let mut connection = match connection {
        Some(connection) => connection,
        None => match timeout_at(deadline, connect_redis(&url)).await {
            Ok(Ok(connection)) => {
                let mut state = REDIS_STATE.lock().await;
                state.connection = Some(connection.clone());
                state.record_success();
                tracing::info!("Redis 健康检查已重新建立连接");
                connection
            }
            Ok(Err(_)) => {
                REDIS_STATE
                    .lock()
                    .await
                    .record_probe_failure(Instant::now());
                tracing::warn!("Redis 健康检查连接失败");
                return RedisRuntimeStatus::Unreachable;
            }
            Err(_) => {
                REDIS_STATE
                    .lock()
                    .await
                    .record_probe_failure(Instant::now());
                tracing::warn!("Redis 健康检查连接超时");
                return RedisRuntimeStatus::Unreachable;
            }
        },
    };

    let result = timeout_at(
        deadline,
        redis::cmd("PING").query_async::<String>(&mut connection),
    )
    .await;
    match result {
        Ok(Ok(_)) => {
            REDIS_STATE
                .lock()
                .await
                .record_probe_success(Instant::now());
            RedisRuntimeStatus::Healthy
        }
        Ok(Err(_)) => {
            REDIS_STATE
                .lock()
                .await
                .record_probe_failure(Instant::now());
            tracing::warn!(
                previous_status = status.as_str(),
                "Redis 健康检查 PING 失败"
            );
            RedisRuntimeStatus::Unreachable
        }
        Err(_) => {
            REDIS_STATE
                .lock()
                .await
                .record_probe_failure(Instant::now());
            tracing::warn!(
                previous_status = status.as_str(),
                "Redis 健康检查 PING 超时"
            );
            RedisRuntimeStatus::Unreachable
        }
    }
}

async fn record_command_success() {
    REDIS_STATE.lock().await.record_success();
}

async fn record_command_failure(error: &redis::RedisError) {
    REDIS_STATE.lock().await.record_failure(Instant::now());
    tracing::warn!(error = %error, "Redis 命令失败，相关业务操作降级");
}

/// 从 Redis 读取 JSON 并反序列化（未配置 Redis 或 key 不存在时返回 None，优雅降级）
pub async fn redis_cache_get_json<T: DeserializeOwned>(key: &str) -> Option<T> {
    let mut connection = {
        let mut state = REDIS_STATE.lock().await;
        get_redis_conn(&mut state).await?
    };

    let result: redis::RedisResult<Option<String>> = connection.get(key).await;
    match result {
        Ok(Some(json_str)) => {
            record_command_success().await;
            match serde_json::from_str::<T>(&json_str) {
                Ok(value) => Some(value),
                Err(e) => {
                    tracing::warn!(key = %key, error = %e, "Redis 缓存反序列化失败，回退到 DB");
                    None
                }
            }
        }
        Ok(None) => {
            record_command_success().await;
            None
        }
        Err(e) => {
            record_command_failure(&e).await;
            tracing::warn!(key = %key, "Redis GET 失败，回退到 DB");
            None
        }
    }
}

/// 写入 JSON 到 Redis（带 TTL，未配置 Redis 时为 no-op）
pub async fn redis_cache_set_json<T: Serialize>(key: &str, value: &T, ttl_secs: u64) {
    let mut connection = {
        let mut state = REDIS_STATE.lock().await;
        let Some(connection) = get_redis_conn(&mut state).await else {
            return;
        };
        connection
    };

    let json_str = match serde_json::to_string(value) {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(key = %key, error = %e, "Redis 缓存序列化失败，跳过写入");
            return;
        }
    };

    if let Err(e) = connection.set_ex::<_, _, ()>(key, json_str, ttl_secs).await {
        record_command_failure(&e).await;
        tracing::warn!(key = %key, "Redis SET 失败");
    } else {
        record_command_success().await;
    }
}

/// 删除指定 key（未配置 Redis 时为 no-op）
pub async fn redis_cache_del(key: &str) {
    let mut connection = {
        let mut state = REDIS_STATE.lock().await;
        let Some(connection) = get_redis_conn(&mut state).await else {
            return;
        };
        connection
    };

    if let Err(e) = connection.del::<_, ()>(key).await {
        record_command_failure(&e).await;
        tracing::warn!(key = %key, "Redis DEL 失败");
    } else {
        record_command_success().await;
    }
}

/// 按前缀批量删除（使用 SCAN 避免阻塞 Redis，未配置 Redis 时为 no-op）
/// 注意：前缀匹配扫描 keys 大量 key 时影响性能，仅在创建/更新/删除时调用，不要在热点读路径使用
pub async fn redis_cache_del_prefix(prefix: &str) {
    let mut connection = {
        let mut state = REDIS_STATE.lock().await;
        let Some(connection) = get_redis_conn(&mut state).await else {
            return;
        };
        connection
    };

    // 使用 SCAN 模式遍历匹配的 key（生产环境友好，不阻塞 Redis）
    let pattern = format!("{}*", prefix);
    let mut cursor: u64 = 0;
    let mut command_failed = false;
    loop {
        let scan_result: redis::RedisResult<(u64, Vec<String>)> = redis::cmd("SCAN")
            .arg(cursor)
            .arg("MATCH")
            .arg(&pattern)
            .arg("COUNT")
            .arg(100)
            .query_async(&mut connection)
            .await;
        let (next_cursor, keys) = match scan_result {
            Ok(result) => result,
            Err(e) => {
                record_command_failure(&e).await;
                tracing::warn!(prefix = %prefix, "Redis SCAN 失败");
                return;
            }
        };

        if !keys.is_empty() {
            let delete_result: redis::RedisResult<()> = connection.del(&keys).await;
            if let Err(e) = delete_result {
                record_command_failure(&e).await;
                tracing::warn!(prefix = %prefix, "Redis 批量 DEL 失败");
                command_failed = true;
            }
        }

        if next_cursor == 0 {
            break;
        }
        cursor = next_cursor;
    }

    if !command_failed {
        record_command_success().await;
    }
}

/// 默认缓存 TTL（5 分钟）
pub const DEFAULT_CACHE_TTL_SECS: u64 = 300;

// V15 P2 B07-P2-5/B07-P2-6：差异化 TTL 常量（按数据波动率分级，替代统一 DEFAULT_CACHE_TTL_SECS）
// 调用方通过 redis_cache_set_json(key, value, XXX_CACHE_TTL_SECS) 选择对应 TTL。

/// 产品目录缓存 TTL（10 分钟，低波动率，产品资料/价格变更不频繁）
pub const PRODUCT_CACHE_TTL_SECS: u64 = 600;

/// 客户数据缓存 TTL（5 分钟，中低波动率，客户资料变更不频繁）
pub const CUSTOMER_CACHE_TTL_SECS: u64 = 300;

/// 用户数据缓存 TTL（5 分钟，中低波动率，用户资料变更不频繁）
#[allow(
    dead_code,
    reason = "缓存 TTL 常量：缓存层启用时消费（词表化统一口径）"
)]
pub const USER_CACHE_TTL_SECS: u64 = 300;

/// 权限数据缓存 TTL（2 分钟，安全敏感型，权限变更需快速生效）
#[allow(
    dead_code,
    reason = "缓存 TTL 常量：缓存层启用时消费（词表化统一口径）"
)]
pub const PERMISSION_CACHE_TTL_SECS: u64 = 120;

/// 配置/字典数据缓存 TTL（30 分钟，极低波动率，菜单/字典/系统配置极少变更）
#[allow(
    dead_code,
    reason = "缓存 TTL 常量：缓存层启用时消费（词表化统一口径）"
)]
pub const CONFIG_CACHE_TTL_SECS: u64 = 1800;

/// 生成标准化的缓存 key（格式 `{service}:{id}`，如 user:42/product:100/customer:555）
pub fn cache_key(service: &str, id: impl std::fmt::Display) -> String {
    format!("{}:{}", service, id)
}

/// V15 P1 20.3-B：获取 Redis URL（供 Pub/Sub 创建独立连接使用）
/// 未配置 Redis 时返回 None，调用方应降级为单实例本地广播。
pub fn get_redis_url() -> Option<String> {
    std::env::var("REDIS_URL")
        .or_else(|_| std::env::var("JTI_REDIS_URL"))
        .ok()
        .filter(|s| !s.is_empty())
}

/// V15 P1 20.3-B：发布消息到 Redis Pub/Sub 频道（多实例广播）
/// 未配置 Redis 时为 no-op，调用方应自行处理本地广播降级。
pub async fn publish_to_channel(channel: &str, message: &str) {
    let mut connection = {
        let mut state = REDIS_STATE.lock().await;
        let Some(connection) = get_redis_conn(&mut state).await else {
            return;
        };
        connection
    };
    // PUBLISH 命令：第一个参数是频道名，第二个是消息内容
    if let Err(e) = connection.publish::<_, _, ()>(channel, message).await {
        record_command_failure(&e).await;
        tracing::warn!(channel = %channel, "Redis PUBLISH 失败");
    } else {
        record_command_success().await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_initialization_blocks_retry_until_cooldown_expires() {
        let started_at = Instant::now();
        let mut state = RedisRuntimeState::new();

        assert!(state.allows_connection_attempt(started_at));
        state.record_failure(started_at);

        assert_eq!(state.status, RedisRuntimeStatus::Unreachable);
        assert!(!state.allows_connection_attempt(started_at + Duration::from_secs(4)));
        assert!(state.allows_connection_attempt(started_at + Duration::from_secs(5)));
    }

    #[test]
    fn successful_probe_recovers_runtime_after_cooldown() {
        let started_at = Instant::now();
        let mut state = RedisRuntimeState::new();

        state.record_failure(started_at);
        state.record_probe_success(started_at + Duration::from_secs(5));

        assert_eq!(state.status, RedisRuntimeStatus::Healthy);
        assert!(state.allows_connection_attempt(started_at + Duration::from_secs(5)));
        assert!(!state.allows_probe(started_at + Duration::from_secs(9)));
        assert!(state.allows_probe(started_at + Duration::from_secs(10)));
    }

    #[test]
    fn command_failure_marks_runtime_unreachable_and_renews_cooldown() {
        let started_at = Instant::now();
        let mut state = RedisRuntimeState::new();

        state.record_success();
        state.record_failure(started_at + Duration::from_secs(1));
        assert_eq!(state.status, RedisRuntimeStatus::Unreachable);

        state.record_failure(started_at + Duration::from_secs(4));
        assert!(!state.allows_connection_attempt(started_at + Duration::from_secs(8)));
        assert!(state.allows_connection_attempt(started_at + Duration::from_secs(9)));
    }

    #[test]
    fn not_configured_is_distinct_and_allows_later_configuration() {
        let started_at = Instant::now();
        let mut state = RedisRuntimeState::new();

        state.record_failure(started_at);
        state.record_not_configured();

        assert_eq!(state.status, RedisRuntimeStatus::NotConfigured);
        assert!(state.allows_connection_attempt(started_at));
    }
}
