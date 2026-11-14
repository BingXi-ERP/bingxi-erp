//! 统一任务调度框架 trait + 注册中心 + 执行历史
//!
//! A.6.1：项目存在多个独立 scheduler/worker，各自为政，样板重复。
//! 本 trait 提供统一接口，各 scheduler 适配后统一注册、启动、停止；
//! 注册中心持有全局单例供手动触发端点按名执行。
//!
//! 执行历史：[`run_once_recorded`] 在每轮执行前后写 `scheduler_job_runs`
//! （迁移 m0141）——先插 status='running' 占位行，执行完回填
//! success/failed 与影响行数/错误摘要。定时循环与手动触发共用此包装层，
//! trigger 列区分两种来源。执行历史写入失败只记日志，不吞业务执行结果。
//!
//! 使用方式：
//! ```
//! use crate::utils::scheduler_framework::{Scheduler, SchedulerRegistry};
//!
//! struct MyScheduler;
//! #[async_trait::async_trait]
//! impl Scheduler for MyScheduler {
//!     fn name(&self) -> &str { "my-scheduler" }
//!     fn interval_secs(&self) -> u64 { 3600 }
//!     async fn run_once(&self) -> Result<(), String> {
//!         Ok(())
//!     }
//! }
//! ```

use std::sync::{Arc, OnceLock};

use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, Set};
use tokio_util::sync::CancellationToken;

use crate::models::scheduler_job_run;

/// 执行历史错误摘要的最大保留长度（超长截断，防错误风暴灌表）
const ERROR_MESSAGE_MAX_LEN: usize = 2000;

/// 失败摘要截断：超长错误按字符截到保留上限，防错误风暴灌表
fn error_summary(e: String) -> String {
    if e.chars().count() > ERROR_MESSAGE_MAX_LEN {
        e.chars().take(ERROR_MESSAGE_MAX_LEN).collect()
    } else {
        e
    }
}

/// 定时触发词表（scheduler_job_runs.trigger）
pub const TRIGGER_SCHEDULE: &str = "schedule";

/// 手动触发词表（scheduler_job_runs.trigger）
pub const TRIGGER_MANUAL: &str = "manual";

/// 状态词表（scheduler_job_runs.status）
pub const STATUS_RUNNING: &str = "running";
pub const STATUS_SUCCESS: &str = "success";
pub const STATUS_FAILED: &str = "failed";

/// 执行一次并落执行历史。
///
/// 语义：插入占位行（running）→ 调用方 run_once → 回填终态。affected 由
/// 任务实现通过本 trait 的 [`Scheduler::run_once_with_count`] 提供（默认无计数）。
/// 历史写入失败不影响业务执行与返回值，只记日志（可观测是旁路不是门槛）。
async fn run_once_recorded(
    scheduler: &dyn Scheduler,
    db: Option<&Arc<DatabaseConnection>>,
    trigger: &str,
) -> Result<(), String> {
    let run_id: Option<i32> = match db {
        Some(db) => {
            let placeholder = scheduler_job_run::ActiveModel {
                scheduler_name: Set(scheduler.name().to_string()),
                trigger: Set(trigger.to_string()),
                started_at: Set(chrono::Utc::now()),
                finished_at: Set(None),
                status: Set(STATUS_RUNNING.to_string()),
                affected: Set(None),
                error_message: Set(None),
            };
            match placeholder.insert(db.as_ref()).await {
                Ok(m) => Some(m.id),
                Err(e) => {
                    tracing::warn!(scheduler = scheduler.name(), error = %e, "执行历史占位行写入失败，本轮无历史记录");
                    None
                }
            }
        }
        None => None,
    };

    let started = std::time::Instant::now();
    let (result, affected) = scheduler.run_once_counted().await;
    let elapsed = started.elapsed();

    if let (Some(db), Some(id)) = (db, run_id) {
        let mut active: scheduler_job_run::ActiveModel = Default::default();
        active.id = Set(id);
        active.finished_at = Set(Some(chrono::Utc::now()));
        match &result {
            Ok(()) => {
                active.status = Set(STATUS_SUCCESS.to_string());
                active.affected = Set(affected);
                active.error_message = Set(None);
            }
            Err(e) => {
                active.status = Set(STATUS_FAILED.to_string());
                active.error_message = Set(Some(error_summary(e)));
            }
        }
        if let Err(e) = active.update(db.as_ref()).await {
            tracing::warn!(scheduler = scheduler.name(), run_id = id, error = %e, "执行历史终态回填失败");
        }
    }

    match &result {
        Ok(()) => tracing::info!(
            scheduler = scheduler.name(),
            trigger = trigger,
            elapsed_ms = elapsed.as_millis() as u64,
            affected = affected.unwrap_or(0),
            "调度器本轮执行成功"
        ),
        Err(e) => {
            tracing::warn!(scheduler = scheduler.name(), trigger = trigger, error = %e, "调度器本轮执行失败")
        }
    }
    result
}

/// 调度器统一接口（A.6.1）
///
/// 各域 scheduler 适配此 trait 后，统一注册到 [`SchedulerRegistry`]，
/// 由注册中心统一管理启动、停止和生命周期。循环语义与历史自循环逐点对齐：
/// 初始延迟（避免与启动初始化争抢 DB）→ 先执行后等待间隔（首轮时点=延迟到期即刻）。
/// 启用门与间隔覆盖的读取由各实现方负责（env 门/配置段两种来源并存）。
#[async_trait::async_trait]
pub trait Scheduler: Send + Sync {
    /// 调度器名称（用于日志、监控与手动触发寻址）
    fn name(&self) -> &str;

    /// 执行间隔（秒）。实现方返回应用 env 覆盖后的真实间隔（无覆盖时为默认常量）
    fn interval_secs(&self) -> u64;

    /// 启动前初始延迟（秒），默认 0。历史任务用 30~300 秒错开启动初始化
    fn initial_delay_secs(&self) -> u64 {
        0
    }

    /// 是否启用。实现方返回应用 env 门/配置段后的真实开关，默认启用
    fn enabled(&self) -> bool {
        true
    }

    /// 执行一次调度任务
    ///
    /// 实现方负责具体业务逻辑，返回 Err 时记录日志但不中断调度循环。
    async fn run_once(&self) -> Result<(), String>;

    /// 执行一次并返回处理条数（执行历史 affected 列来源）。
    /// 默认转发 [`Scheduler::run_once`] 无计数；任务语义是"处理条数"的
    /// 实现方覆写此方法把条数上抛，包装层落 affected 列。
    async fn run_once_counted(&self) -> (Result<(), String>, Option<i64>) {
        (self.run_once().await, None)
    }
}

/// 调度器注册中心（A.6.1）
///
/// 统一管理所有调度器的注册、启动和停止。
/// 替代各 service 中各自 tokio::spawn 的样板代码。
/// 注册完成后通过 [`SchedulerRegistry::install_global`] 暴露全局单例，
/// 手动触发端点按任务名寻址执行。
pub struct SchedulerRegistry {
    schedulers: Vec<Arc<dyn Scheduler>>,
    db: Option<Arc<DatabaseConnection>>,
}

static GLOBAL_REGISTRY: OnceLock<Arc<SchedulerRegistryHandle>> = OnceLock::new();

/// 全局注册中心句柄（手动触发端点消费）
pub struct SchedulerRegistryHandle {
    inner: tokio::sync::RwLock<Vec<Arc<dyn Scheduler>>>,
    db: Option<Arc<DatabaseConnection>>,
}

impl SchedulerRegistryHandle {
    /// 已注册任务清单（名称/间隔/初始延迟/启用态）
    pub async fn job_summaries(&self) -> Vec<SchedulerJobSummary> {
        let guard = self.inner.read().await;
        guard
            .iter()
            .map(|s| SchedulerJobSummary {
                name: s.name().to_string(),
                interval_secs: s.interval_secs(),
                initial_delay_secs: s.initial_delay_secs(),
                enabled: s.enabled(),
            })
            .collect()
    }

    /// 按任务名取调度器
    pub async fn find(&self, name: &str) -> Option<Arc<dyn Scheduler>> {
        let guard = self.inner.read().await;
        guard.iter().find(|s| s.name() == name).cloned()
    }

    /// 执行历史连接（手动触发的落库走同一连接）
    pub fn db(&self) -> Option<&Arc<DatabaseConnection>> {
        self.db.as_ref()
    }
}

/// 任务清单项（GET /scheduler/jobs 出参单项）
#[derive(Debug, serde::Serialize)]
pub struct SchedulerJobSummary {
    /// 任务名（Scheduler::name()）
    pub name: String,
    /// 执行间隔（秒）
    pub interval_secs: u64,
    /// 启动初始延迟（秒）
    pub initial_delay_secs: u64,
    /// 启用态
    pub enabled: bool,
}

/// 手动触发一轮执行：走与定时循环同一包装层，trigger=manual。
/// 任务不存在返回 None 供端点转 404；任务存在即执行并返回执行结果。
pub async fn trigger_job_once(name: &str) -> Result<Result<(), String>, &'static str> {
    let handle = GLOBAL_REGISTRY.get().ok_or("调度器注册中心尚未初始化")?;
    let scheduler = handle.find(name).await.ok_or("调度器不存在")?;
    let result = run_once_recorded(scheduler.as_ref(), handle.db(), TRIGGER_MANUAL).await;
    Ok(result)
}

/// 全局注册中心句柄引用（启动链 install 后可取）
pub fn global_registry() -> Option<&'static Arc<SchedulerRegistryHandle>> {
    GLOBAL_REGISTRY.get()
}

impl SchedulerRegistry {
    /// 创建空注册中心（db 用于执行历史写入，None 则不落历史）
    pub fn new(db: Option<Arc<DatabaseConnection>>) -> Self {
        Self {
            schedulers: Vec::new(),
            db,
        }
    }

    /// 注册调度器
    pub fn register(&mut self, scheduler: Arc<dyn Scheduler>) {
        tracing::info!(
            scheduler = scheduler.name(),
            interval_secs = scheduler.interval_secs(),
            "调度器已注册"
        );
        self.schedulers.push(scheduler);
    }

    /// 启动所有调度器（各自独立的 tokio::spawn 循环，受 CancellationToken 控制）
    ///
    /// 返回所有 spawn 的 JoinHandle，供 graceful shutdown 时 abort。
    /// 循环体先执行后等待：首轮在初始延迟到期后即刻执行，与历史自循环语义一致。
    /// 每轮执行经 [`run_once_recorded`] 包装落执行历史。
    /// 同时把本注册中心安装为全局单例，供手动触发端点按名寻址。
    pub async fn start_all(&self, cancel: CancellationToken) -> Vec<tokio::task::JoinHandle<()>> {
        let handle = Arc::new(SchedulerRegistryHandle {
            inner: tokio::sync::RwLock::new(self.schedulers.clone()),
            db: self.db.clone(),
        });
        let _ = GLOBAL_REGISTRY.set(handle);

        let mut handles = Vec::new();
        for scheduler in &self.schedulers {
            if !scheduler.enabled() {
                tracing::info!(scheduler = scheduler.name(), "调度器已禁用，跳过启动");
                continue;
            }
            let s = scheduler.clone();
            let token = cancel.clone();
            let name = s.name().to_string();
            let interval = std::time::Duration::from_secs(s.interval_secs());
            let initial_delay = std::time::Duration::from_secs(s.initial_delay_secs());
            let db = self.db.clone();

            let handle = tokio::spawn(async move {
                tokio::time::sleep(initial_delay).await;
                tracing::info!(scheduler = %name, "调度器启动");
                loop {
                    let _ = run_once_recorded(s.as_ref(), db.as_ref(), TRIGGER_SCHEDULE).await;
                    tokio::select! {
                        _ = tokio::time::sleep(interval) => {}
                        _ = token.cancelled() => {
                            tracing::info!(scheduler = %name, "调度器收到取消信号，优雅退出");
                            break;
                        }
                    }
                }
            });
            handles.push(handle);
        }
        handles
    }

    /// 已注册调度器数量
    pub fn count(&self) -> usize {
        self.schedulers.len()
    }
}

impl Default for SchedulerRegistry {
    fn default() -> Self {
        Self::new(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 短错误原样保留
    #[test]
    fn error_summary_short_passthrough() {
        assert_eq!(error_summary("短错误".to_string()), "短错误");
    }

    /// 超长错误按字符截到上限（中文按字符数不按字节，多字节不截半字）
    #[test]
    fn error_summary_truncates_long_multibyte() {
        let long = "错".repeat(ERROR_MESSAGE_MAX_LEN + 100);
        let out = error_summary(long);
        assert_eq!(out.chars().count(), ERROR_MESSAGE_MAX_LEN);
        assert!(out.starts_with("错"));
    }

    /// 恰在上限的长度不截
    #[test]
    fn error_summary_exact_limit_untouched() {
        let exact = "a".repeat(ERROR_MESSAGE_MAX_LEN);
        assert_eq!(error_summary(exact.clone()), exact);
    }

    /// 词表常量与迁移列注释口径逐字符一致
    #[test]
    fn trigger_and_status_vocab_constants() {
        assert_eq!(TRIGGER_SCHEDULE, "schedule");
        assert_eq!(TRIGGER_MANUAL, "manual");
        assert_eq!(STATUS_RUNNING, "running");
        assert_eq!(STATUS_SUCCESS, "success");
        assert_eq!(STATUS_FAILED, "failed");
    }
}
