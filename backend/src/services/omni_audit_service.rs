use chrono::Utc;
use futures::FutureExt;
use sea_orm::{ActiveModelTrait, ActiveValue, DatabaseConnection, EntityTrait, Set};
use serde_json::Value;
use std::panic::AssertUnwindSafe;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::mpsc;

use crate::models::{event_dead_letter, omni_audit_log};

/// 审计写入失败补偿任务的尝试次数（独立 task 内执行，不计入消费循环等待）
const COMPENSATION_RETRY_ATTEMPTS: i32 = 3;
/// 补偿重试基础间隔毫秒数，第 n 次重试等待 base * n（线性递增退避）
const COMPENSATION_RETRY_BASE_DELAY_MS: u64 = 200;

/// 审计日志成功写入计数（进程级累计，含首次写入与补偿重试写入；无指标端点，供日志/诊断读取）
static INSERT_WRITTEN_COUNT: OnceLock<AtomicU64> = OnceLock::new();
/// 审计写入失败计数（首次 insert 失败即累加，不等补偿结果；进程级累计）
static INSERT_DISCARD_COUNT: OnceLock<AtomicU64> = OnceLock::new();

fn written_counter() -> &'static AtomicU64 {
    INSERT_WRITTEN_COUNT.get_or_init(AtomicU64::new)
}

fn discard_counter() -> &'static AtomicU64 {
    INSERT_DISCARD_COUNT.get_or_init(AtomicU64::new)
}

/// 读取审计写入/丢弃累计计数（写入=成功 insert 总数，丢弃=首次写入失败总数）。
/// 调用方：诊断日志与后续观测面；不做指标端点。
pub fn audit_write_counters() -> (u64, u64) {
    (
        written_counter().load(Ordering::Relaxed),
        discard_counter().load(Ordering::Relaxed),
    )
}

#[derive(Debug, Clone)]
pub struct OmniAuditMessage {
    pub trace_id: String,
    /// 用户 ID；未登录/匿名场景下为 None（避免脏数据归到 user_id=0 系统用户）
    pub user_id: Option<i32>,
    pub username: Option<String>,
    pub event_type: String,
    pub event_name: String,
    pub resource: String,
    pub action: String,
    pub resource_type: Option<String>,
    pub resource_id: Option<String>,
    pub resource_name: Option<String>,
    pub description: Option<String>,
    pub payload: Option<Value>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub request_method: Option<String>,
    pub request_path: Option<String>,
    pub request_body: Option<String>,
    pub duration_ms: i32,
    pub status: String,
    pub error_msg: Option<String>,
    pub old_value: Option<Value>,
    pub new_value: Option<Value>,
    /// 请求条件/查询条件（query string）
    /// V15 P0-S19 补齐：从请求 URL query string 提取，用于审计日志快速筛选
    pub condition: Option<String>,
}

pub struct OmniAuditEngine {
    sender: mpsc::Sender<OmniAuditMessage>,
    /// HMAC 签名密钥；通过 secret_key_fingerprint 暴露指纹供运维校验
    secret_key: Vec<u8>,
    /// L-30 修复（批次 372 v13 复审）：异步引擎 spawn 句柄
    /// 保存句柄以便 shutdown 时 abort，避免 detached task 泄漏。；使用 Mutex<Option<...>> 实现幂等 shutdown（多次调用安全）。
    handle: std::sync::Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl OmniAuditEngine {
    pub fn new(db: Arc<DatabaseConnection>) -> Result<Self, String> {
        let secret_key = Self::resolve_secret_key()?;
        let (sender, receiver) = mpsc::channel::<OmniAuditMessage>(10000);
        // L-30 修复（批次 372 v13 复审）：保存 spawn 句柄供 shutdown 使用
        let handle = Self::spawn_audit_worker(db, secret_key.clone(), receiver);
        Ok(Self {
            sender,
            secret_key: secret_key.into_bytes(),
            handle: std::sync::Mutex::new(Some(handle)),
        })
    }

    /// 解析并校验审计签名密钥（生产环境必须显式设置 AUDIT_SECRET_KEY）
    fn resolve_secret_key() -> Result<String, String> {
        // v5 审计批次 21：测试环境专用默认密钥（含 "test" 关键词命中 validate_secret 黑名单，避免误用生产）
        // 仅在 cfg!(test) 或 ENV=test/development 时作为兜底默认密钥使用
        const TEST_DEFAULT_KEY: &str = "test-only-audit-secret-do-not-use-in-production-32b";

        // 批次 92 P3-7：用 match 替代 unwrap_or_else，生产缺失密钥时直接 return Err
        // （闭包内的 return 仅从闭包返回，无法跳出 new）
        let secret_key = match std::env::var("AUDIT_SECRET_KEY") {
            Ok(k) => k,
            Err(_) => {
                // 安全修复：未设置 AUDIT_SECRET_KEY 时，仅在测试/开发环境回退默认密钥
                // 生产环境必须设置 AUDIT_SECRET_KEY 环境变量，否则返回 Err 由调用方决定终止
                let env = std::env::var("ENV").unwrap_or_default();
                // cfg!(test) 覆盖单元测试场景；ENV=test/development 覆盖集成测试/开发场景
                if cfg!(test) || env == "test" || env == "development" {
                    tracing::warn!(
                        env = %env,
                        "安全警告: 未设置 AUDIT_SECRET_KEY 环境变量，测试/开发环境使用默认密钥。生产环境必须设置强密钥！"
                    );
                    TEST_DEFAULT_KEY.to_string()
                } else {
                    return Err(format!(
                        "未设置 AUDIT_SECRET_KEY 环境变量，生产环境必须设置强密钥（至少32字节）；当前 ENV={}",
                        env
                    ));
                }
            }
        };

        if secret_key.len() < 32 {
            return Err("AUDIT_SECRET_KEY 长度必须至少 32 字节".to_string());
        }
        Ok(secret_key)
    }

    /// 启动异步审计工作线程（单条消息 panic 隔离，确保引擎持续运行）
    fn spawn_audit_worker(
        db: Arc<DatabaseConnection>,
        secret_key: String,
        mut receiver: mpsc::Receiver<OmniAuditMessage>,
    ) -> tokio::task::JoinHandle<()> {
        let db_clone = db.clone();
        let secret_key_clone = secret_key.clone();
        // L-30 修复（批次 372 v13 复审）：保存 spawn 返回的 JoinHandle 供 shutdown() abort
        tokio::spawn(async move {
            tracing::info!("OmniAudit 异步收集引擎已启动");
            while let Some(msg) = receiver.recv().await {
                // 批次 7（2026-06-28）：单次消息处理 panic 隔离，确保单次 panic 不退出循环
                // 防御性 catch_unwind：避免调用链路未来 panic 导致整个审计引擎 spawn 死亡
                let result = AssertUnwindSafe(async {
                    Self::process_single_message(&db_clone, secret_key_clone.as_bytes(), msg).await;
                })
                .catch_unwind()
                .await;

                // 批次 7：panic 隔离后的结果处理
                if let Err(panic_payload) = result {
                    let panic_msg = panic_payload
                        .downcast_ref::<String>()
                        .map(|s| s.as_str())
                        .or_else(|| panic_payload.downcast_ref::<&'static str>().copied())
                        .unwrap_or("<非字符串 panic payload>");
                    tracing::error!(
                        panic = %panic_msg,
                        "⚠ OmniAudit spawn 任务内 panic 已被隔离，审计引擎继续运行（不退出循环）"
                    );
                }
            }
        })
    }

    /// 处理单条审计消息：签名、告警判定、构建模型并写入数据库。
    /// 调用方：spawn_audit_worker 消费循环（单消费者 channel，循环不可阻塞）。
    /// 入参 db 为共享连接（Arc 引用），首次 insert 失败时以 db 克隆派生独立补偿 task：
    /// 重试 3 次仍败则落 event_dead_letters 表，丢弃计数在首次失败时即累加，
    /// 保证消费循环立即继续处理后续消息、不受补偿任务进度影响。
    async fn process_single_message(
        db: &Arc<DatabaseConnection>,
        secret_key: &[u8],
        msg: OmniAuditMessage,
    ) {
        let signature = Self::compute_signature(secret_key, &msg);
        Self::log_alert_if_needed(&msg);
        let log = Self::build_audit_log_model(msg.clone(), signature);
        // 使用 exec_without_returning 避免 last_insert_id 解析问题
        match omni_audit_log::Entity::insert(log)
            .exec_without_returning(db.as_ref())
            .await
        {
            Ok(_) => {
                written_counter().fetch_add(1, Ordering::Relaxed);
                tracing::debug!("审计日志写入成功");
            }
            Err(e) => {
                // 丢弃计数在消息离开正常写入路径的时刻累加，不等补偿结果（消费循环立即继续）
                discard_counter().fetch_add(1, Ordering::Relaxed);
                tracing::error!(
                    trace_id = %msg.trace_id,
                    error = %e,
                    "写入综合审计日志失败，转入独立补偿任务重试（消费循环不阻塞）"
                );
                Self::spawn_write_compensation(db.clone(), secret_key.to_vec(), msg, e.to_string());
            }
        }
    }

    /// 审计写入失败的独立补偿任务：按递增间隔重试 3 次写 omni_audit_log，
    /// 三次仍败则把消息结构落 event_dead_letters 表（status=DEAD）供人工补录，
    /// 死信表写入自身失败时仅显式 error 日志（无更外层载体）。
    fn spawn_write_compensation(
        db: Arc<DatabaseConnection>,
        secret_key: Vec<u8>,
        msg: OmniAuditMessage,
        first_error: String,
    ) {
        tokio::spawn(async move {
            let mut last_error = first_error;
            for attempt in 1..=COMPENSATION_RETRY_ATTEMPTS {
                tokio::time::sleep(Duration::from_millis(
                    COMPENSATION_RETRY_BASE_DELAY_MS * attempt as u64,
                ))
                .await;
                let signature = Self::compute_signature(&secret_key, &msg);
                let log = Self::build_audit_log_model(msg.clone(), signature);
                match omni_audit_log::Entity::insert(log)
                    .exec_without_returning(db.as_ref())
                    .await
                {
                    Ok(_) => {
                        written_counter().fetch_add(1, Ordering::Relaxed);
                        tracing::info!(
                            trace_id = %msg.trace_id,
                            attempt,
                            "审计日志补偿重试成功（原失败条目已补写入）"
                        );
                        return;
                    }
                    Err(e) => {
                        last_error = e.to_string();
                        tracing::warn!(
                            trace_id = %msg.trace_id,
                            attempt,
                            error = %e,
                            "审计日志补偿重试失败"
                        );
                    }
                }
            }
            tracing::error!(
                trace_id = %msg.trace_id,
                attempts = COMPENSATION_RETRY_ATTEMPTS,
                last_error = %last_error,
                written = written_counter().load(Ordering::Relaxed),
                discarded = discard_counter().load(Ordering::Relaxed),
                "审计日志补偿重试全部失败，落 event_dead_letters 等待人工补录"
            );
            let dead_letter =
                Self::build_dead_letter_model(&msg, &last_error, COMPENSATION_RETRY_ATTEMPTS);
            if let Err(dl_err) = event_dead_letter::Entity::insert(dead_letter)
                .exec(db.as_ref())
                .await
            {
                tracing::error!(
                    trace_id = %msg.trace_id,
                    error = %dl_err,
                    "审计死信写入 event_dead_letters 失败，该审计条目永久丢失"
                );
            } else {
                tracing::info!(trace_id = %msg.trace_id, "审计死信已落 event_dead_letters");
            }
        });
    }

    /// 审计写失败死信的事件类型标识（写入方：omni_audit_service 补偿任务；消费方：死信人工处理）
    pub const DEAD_LETTER_EVENT_TYPE: &str = "OMNI_AUDIT_LOG_WRITE_FAILED";

    /// 构建审计写失败死信 payload（纯函数，供单测断言结构与补偿任务共用）。
    /// 存入 event_dead_letters.event_payload，携带补录审计行所需的最小字段集。
    fn build_dead_letter_payload(
        msg: &OmniAuditMessage,
        last_error: &str,
        retry_count: i32,
    ) -> Value {
        serde_json::json!({
            "trace_id": msg.trace_id,
            "user_id": msg.user_id,
            "username": msg.username,
            "event_type": msg.event_type,
            "event_name": msg.event_name,
            "resource": msg.resource,
            "action": msg.action,
            "resource_type": msg.resource_type,
            "resource_id": msg.resource_id,
            "status": msg.status,
            "duration_ms": msg.duration_ms,
            "retry_count": retry_count,
            "last_error": last_error,
        })
    }

    /// 由审计消息与最终错误构建 event_dead_letters ActiveModel（status=DEAD）。
    /// 调用方：spawn_write_compensation 在 3 次重试仍败后调用；event_type 固定为
    /// OMNI_AUDIT_LOG_WRITE_FAILED，retry_count/max_retries 记录实际补偿次数。
    fn build_dead_letter_model(
        msg: &OmniAuditMessage,
        last_error: &str,
        retry_count: i32,
    ) -> event_dead_letter::ActiveModel {
        let now = Utc::now();
        event_dead_letter::ActiveModel {
            event_type: Set(Self::DEAD_LETTER_EVENT_TYPE.to_string()),
            event_payload: Set(Self::build_dead_letter_payload(
                msg,
                last_error,
                retry_count,
            )),
            failure_reason: Set(
                "综合审计日志写入重试后仍失败，omni_audit_logs 缺行（待人工补录）".to_string(),
            ),
            last_error: Set(Some(last_error.to_string())),
            retry_count: Set(retry_count),
            max_retries: Set(retry_count),
            status: Set(event_dead_letter::status::DEAD.to_string()),
            first_failed_at: Set(now),
            last_retry_at: Set(Some(now)),
            resolved_at: Set(None),
            resolved_by: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
    }

    /// 计算审计消息 HMAC-SHA256 签名（失败时降级为空字符串，不阻断写入）
    fn compute_signature(secret_key: &[u8], msg: &OmniAuditMessage) -> String {
        let payload_str = msg
            .payload
            .as_ref()
            .map(|p| p.to_string())
            .unwrap_or_default();
        let sign_material = format!(
            "{}|{}|{}|{}",
            msg.trace_id, msg.event_type, msg.action, payload_str
        );
        // 使用 HMAC-SHA256 对关键字段签名；签名失败降级为空字符串不阻断写入
        // P0 8-2 修复（批次 53）：签名持久化至 signature 列实现防篡改
        match crate::utils::hash::hmac_sha256_hex(secret_key, sign_material.as_bytes()) {
            Ok(sig) => sig,
            Err(e) => {
                tracing::error!("HMAC 签名失败: {}（审计日志将不带签名）", e);
                String::new()
            }
        }
    }

    /// 失败/拒绝/安全告警事件输出告警日志
    fn log_alert_if_needed(msg: &OmniAuditMessage) {
        if msg.status == "FAILED" || msg.status == "DENIED" || msg.event_type == "SECURITY_ALERT" {
            tracing::warn!(
                "【审计告警】触发告警规则! 用户ID: {:?}, 事件: {}, 资源: {}, 状态: {}",
                msg.user_id,
                msg.event_name,
                msg.resource,
                msg.status
            );
        }
    }

    /// 由审计消息构建 omni_audit_log ActiveModel（含 HMAC 签名与时间戳）
    fn build_audit_log_model(
        msg: OmniAuditMessage,
        signature: String,
    ) -> omni_audit_log::ActiveModel {
        omni_audit_log::ActiveModel {
            id: ActiveValue::NotSet,
            trace_id: ActiveValue::Set(Some(msg.trace_id)),
            span_id: ActiveValue::Set(None),
            parent_span_id: ActiveValue::Set(None),
            user_id: ActiveValue::Set(msg.user_id),
            username: ActiveValue::Set(msg.username),
            module: ActiveValue::Set(Some(msg.event_type)),
            action: ActiveValue::Set(Some(msg.event_name)),
            resource_type: ActiveValue::Set(msg.resource_type),
            resource_id: ActiveValue::Set(msg.resource_id),
            resource_name: ActiveValue::Set(msg.resource_name),
            description: ActiveValue::Set(msg.description),
            ip_address: ActiveValue::Set(msg.ip_address),
            user_agent: ActiveValue::Set(msg.user_agent),
            request_method: ActiveValue::Set(msg.request_method),
            request_path: ActiveValue::Set(msg.request_path),
            request_body: ActiveValue::Set(msg.request_body),
            response_status: ActiveValue::Set(Some(msg.status.parse::<i32>().unwrap_or(
                match msg.status.as_str() {
                    "SUCCESS" => 200,
                    "FAILED" => 500,
                    "DENIED" => 403,
                    _ => 0,
                },
            ))),
            duration_ms: ActiveValue::Set(Some(msg.duration_ms)),
            old_value: ActiveValue::Set(msg.old_value),
            new_value: ActiveValue::Set(msg.new_value),
            // P0 修复（批次 5）：原 .expect() 改为 fixed_offset() 消除 panic 风险
            created_at: ActiveValue::Set(Some(Utc::now().fixed_offset())),
            // P0 8-2 修复（批次 53）：持久化 HMAC-SHA256 签名实现审计日志防篡改
            signature: ActiveValue::Set(Some(signature)),
            // V15 P0-S19 补齐：请求条件/查询条件写入审计日志
            condition: ActiveValue::Set(msg.condition),
            // V15 P2-Batch-03：审计日志导出审批字段
            operation_category: Default::default(),
            export_record_count: Default::default(),
            export_approval_token: Default::default(),
        }
    }

    pub fn log(&self, msg: OmniAuditMessage) {
        let sender = self.sender.clone();
        tokio::spawn(async move {
            // 批次 8（2026-06-28）：一次性 spawn panic 隔离
            let result = AssertUnwindSafe(async {
                if let Err(e) = sender.send(msg).await {
                    tracing::error!("投递审计日志至 Channel 失败: {}", e);
                }
            })
            .catch_unwind()
            .await;
            if let Err(panic_payload) = result {
                let panic_msg = panic_payload
                    .downcast_ref::<String>()
                    .map(|s| s.as_str())
                    .or_else(|| panic_payload.downcast_ref::<&'static str>().copied())
                    .unwrap_or("<非字符串 panic payload>");
                tracing::error!(
                    panic = %panic_msg,
                    "⚠ 审计日志投递 spawn panic 已被隔离"
                );
            }
        });
    }

    /// 返回 secret_key 的 SHA-256 指纹（前 16 hex 字符），用于运维验证密钥配置
    pub fn secret_key_fingerprint(&self) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(&self.secret_key);
        let hash = hasher.finalize();
        hash.iter().take(8).map(|b| format!("{:02x}", b)).collect()
    }

    /// L-30 修复（批次 372 v13 复审）：优雅关闭异步审计引擎
    /// abort 后台 spawn task，防止 detached task 泄漏。；幂等：多次调用安全，仅首次调用实际 abort（Mutex<Option> take 后为 None）。；# 调用时机；在进程收到 SIGTERM/SIGINT 优雅关闭后调用，确保审计引擎 task 不会；在 runtime drop 前继续尝试写入已关闭的数据库连接。；批次 403 修复：shutdown 路径禁止 panic。原 `lock().unwrap()` 在 Mutex；poisoned（持有锁的线程 panic）时会再次 panic，导致进程无法优雅退出。；改用 `unwrap_or_else(|e| e.into_inner())` 安全访问 poisoned lock 的内部数据。
    pub fn shutdown(&self) {
        if let Some(handle) = self.handle.lock().unwrap_or_else(|e| e.into_inner()).take() {
            handle.abort();
            tracing::info!("OmniAudit 异步收集引擎已关闭");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造全字段填充的审计消息样本（测试夹具）
    fn sample_message() -> OmniAuditMessage {
        OmniAuditMessage {
            trace_id: "trace-abc-123".to_string(),
            user_id: Some(42),
            username: Some("alice".to_string()),
            event_type: "BIZ".to_string(),
            event_name: "导出审计日志".to_string(),
            resource: "audit_logs".to_string(),
            action: "EXPORT".to_string(),
            resource_type: Some("audit_log".to_string()),
            resource_id: Some("77".to_string()),
            resource_name: Some("审计日志表".to_string()),
            description: Some("测试描述".to_string()),
            payload: None,
            ip_address: Some("10.0.0.8".to_string()),
            user_agent: Some("ua".to_string()),
            request_method: Some("GET".to_string()),
            request_path: Some("/api/v1/erp/audit-logs/export".to_string()),
            request_body: None,
            duration_ms: 120,
            status: "SUCCESS".to_string(),
            error_msg: None,
            old_value: None,
            new_value: None,
            condition: Some("page=1".to_string()),
        }
    }

    /// 死信 payload 必须携带补录审计行所需的最小字段集且取值与原消息逐字段一致，
    /// 缺键会导致死信人工补录时无法还原审计上下文。
    #[test]
    fn dead_letter_payload_structure_keeps_minimal_fields() {
        let msg = sample_message();
        let payload = OmniAuditEngine::build_dead_letter_payload(&msg, "db down", 3);

        assert_eq!(
            payload["trace_id"], "trace-abc-123",
            "trace_id 是死信回链业务上下文的唯一键，缺失即补录无从定位"
        );
        assert_eq!(payload["user_id"], 42);
        assert_eq!(payload["username"], "alice");
        assert_eq!(payload["event_type"], "BIZ");
        assert_eq!(payload["event_name"], "导出审计日志");
        assert_eq!(payload["resource"], "audit_logs");
        assert_eq!(payload["action"], "EXPORT");
        assert_eq!(payload["resource_id"], "77");
        assert_eq!(payload["status"], "SUCCESS");
        assert_eq!(payload["duration_ms"], 120);
        assert_eq!(
            payload["retry_count"], 3,
            "死信必须记录已重试次数供人工判断损耗"
        );
        assert_eq!(payload["last_error"], "db down");

        let obj = payload.as_object().expect("死信 payload 必须是 JSON 对象");
        for key in [
            "trace_id",
            "user_id",
            "username",
            "event_type",
            "event_name",
            "resource",
            "action",
            "resource_type",
            "resource_id",
            "status",
            "duration_ms",
            "retry_count",
            "last_error",
        ] {
            assert!(obj.contains_key(key), "死信 payload 缺少键: {}", key);
        }
    }

    /// 死信行模型必须落 status=DEAD 且 event_type 固定为写入方常量，
    /// 死信人工处理面按这两个字段扫描待补录条目。
    #[test]
    fn dead_letter_model_marks_dead_status_with_fixed_event_type() {
        let msg = sample_message();
        let model = OmniAuditEngine::build_dead_letter_model(&msg, "db down", 3);

        assert_eq!(
            model.event_type,
            ActiveValue::Set(OmniAuditEngine::DEAD_LETTER_EVENT_TYPE.to_string())
        );
        assert_eq!(
            model.status,
            ActiveValue::Set(event_dead_letter::status::DEAD.to_string())
        );
        assert_eq!(model.retry_count, ActiveValue::Set(3));
        assert_eq!(model.max_retries, ActiveValue::Set(3));
        assert_eq!(
            model.last_error,
            ActiveValue::Set(Some("db down".to_string()))
        );
        assert_eq!(model.resolved_at, ActiveValue::NotSet);
    }

    /// 计数器访问器在未初始化时应返回 0（OnceLock 惰性初始化）
    #[test]
    fn audit_write_counters_default_zero() {
        let (written, discarded) = audit_write_counters();
        assert_eq!(written, 0);
        assert_eq!(discarded, 0);
    }
}
