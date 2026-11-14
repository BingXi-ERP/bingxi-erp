use crate::utils::error::AppError;
use futures::FutureExt;
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement, TransactionTrait};
use std::panic::AssertUnwindSafe;
use std::sync::Arc;
use tokio::time::{Duration, interval};

pub struct AuditCleanupService {
    db: Arc<DatabaseConnection>,
    retention_days: i32,
    permission_audit_retention_days: i32,
    security_alert_retention_days: i32,
}

impl AuditCleanupService {
    pub fn new(db: Arc<DatabaseConnection>, retention_days: i32) -> Self {
        Self {
            db,
            retention_days,
            permission_audit_retention_days: 2555, // 7 年
            security_alert_retention_days: 2555,   // 7 年
        }
    }

    /// 清理过期的审计日志（分级保留）
    ///
    /// audit_logs 与 omni_audit_logs 上挂着只追加触发器，DELETE 默认被拒；
    /// 本函数是唯一的保留期清理通道：四张审计表的删除共处一个事务，事务内先
    /// SET LOCAL app.audit_purge = 'on' 声明通道，事务结束即失效，不外泄到连接池。
    /// 请求级幂等去重表 http_request_dedupe 随本任务一并做保留期清理：它是日周期
    /// 定时分支里已有的唯一按时间删除通道，复用而不另起一条调度，本表无只追加
    /// 触发器，声明通道对它不起作用（放行与否都删得掉）。
    /// 调用方为 start_cleanup_task 的日周期定时分支，返回值汇总进清理日志。
    pub async fn cleanup_expired_logs(&self) -> Result<u64, AppError> {
        let mut total_deleted = 0u64;
        let txn = (*self.db).begin().await?;
        txn.execute_unprepared("SET LOCAL app.audit_purge = 'on'")
            .await?;

        // omni_audit_logs: 保留 retention_days（默认 365 天）
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM omni_audit_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 day')",
            [self.retention_days.into()],
        );
        let result = txn.execute_raw(stmt).await?;
        let deleted_count = result.rows_affected();
        if deleted_count > 0 {
            tracing::info!(
                "已清理 {} 条过期 omni_audit_logs（保留 {} 天）",
                deleted_count,
                self.retention_days
            );
        }
        total_deleted += deleted_count;

        // audit_logs: 保留 retention_days（默认 365 天）
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM audit_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 day')",
            [self.retention_days.into()],
        );
        let result = txn.execute_raw(stmt).await?;
        let deleted_count2 = result.rows_affected();
        if deleted_count2 > 0 {
            tracing::info!(
                "已清理 {} 条过期 audit_logs（保留 {} 天）",
                deleted_count2,
                self.retention_days
            );
        }
        total_deleted += deleted_count2;

        // permission_change_audits: 保留 7 年（2555 天）
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM permission_change_audits WHERE changed_at < NOW() - ($1 * INTERVAL '1 day')",
            [self.permission_audit_retention_days.into()],
        );
        let result = txn.execute_raw(stmt).await?;
        let deleted_count3 = result.rows_affected();
        if deleted_count3 > 0 {
            tracing::info!(
                "已清理 {} 条过期 permission_change_audits（保留 {} 天）",
                deleted_count3,
                self.permission_audit_retention_days
            );
        }
        total_deleted += deleted_count3;

        // security_alert_logs: 保留 7 年（2555 天）
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM security_alert_logs WHERE created_at < NOW() - ($1 * INTERVAL '1 day')",
            [self.security_alert_retention_days.into()],
        );
        let result = txn.execute_raw(stmt).await?;
        let deleted_count4 = result.rows_affected();
        if deleted_count4 > 0 {
            tracing::info!(
                "已清理 {} 条过期 security_alert_logs（保留 {} 天）",
                deleted_count4,
                self.security_alert_retention_days
            );
        }
        total_deleted += deleted_count4;

        // http_request_dedupe: 请求级幂等占位。键的判据价值只覆盖到 claimed 存活时限
        // 那个量级，保留 7 天足以拦住背靠背的重放与重试，再老的同名键复用属于新意图，
        // 由客户端换新键承担；不做保留期清理则该表随带键提交单调增长。
        const HTTP_DEDUPE_RETENTION_DAYS: u64 = 7;
        let stmt = Statement::from_sql_and_values(
            DatabaseBackend::Postgres,
            "DELETE FROM http_request_dedupe WHERE created_at < NOW() - ($1 * INTERVAL '1 day')",
            [HTTP_DEDUPE_RETENTION_DAYS.into()],
        );
        let result = txn.execute_raw(stmt).await?;
        let deleted_count5 = result.rows_affected();
        if deleted_count5 > 0 {
            tracing::info!(
                "已清理 {} 条过期 http_request_dedupe 幂等占位（保留 {} 天）",
                deleted_count5,
                HTTP_DEDUPE_RETENTION_DAYS
            );
        }
        total_deleted += deleted_count5;

        txn.commit().await?;
        tracing::info!(
            deleted = total_deleted,
            "审计日志保留期清理事务已提交（只追加触发器的声明通道放行）"
        );

        Ok(total_deleted)
    }

    /// 获取审计日志统计信息
    pub async fn get_stats(&self) -> Result<AuditStats, AppError> {
        let sql = "SELECT 
            (SELECT COUNT(*) FROM omni_audit_logs) as total_omni_logs,
            (SELECT COUNT(*) FROM audit_logs) as total_audit_logs,
            (SELECT COUNT(*) FROM omni_audit_logs WHERE created_at > NOW() - INTERVAL '24 hours') as today_omni_logs,
            (SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '24 hours') as today_audit_logs,
            (SELECT MIN(created_at) FROM omni_audit_logs) as oldest_omni_log,
            (SELECT MAX(created_at) FROM omni_audit_logs) as newest_omni_log";

        let result: Option<sea_orm::QueryResult> = self
            .db
            .as_ref()
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DatabaseBackend::Postgres,
                sql.to_string(),
            ))
            .await?;

        if let Some(row) = result {
            Ok(AuditStats {
                total_omni_logs: row.try_get::<i64>("", "total_omni_logs")?,
                total_audit_logs: row.try_get::<i64>("", "total_audit_logs")?,
                today_omni_logs: row.try_get::<i64>("", "today_omni_logs")?,
                today_audit_logs: row.try_get::<i64>("", "today_audit_logs")?,
                oldest_log: row.try_get::<String>("", "oldest_omni_log").ok(),
                newest_log: row.try_get::<String>("", "newest_omni_log").ok(),
            })
        } else {
            Ok(AuditStats::default())
        }
    }
}

#[derive(Debug, Default)]
pub struct AuditStats {
    pub total_omni_logs: i64,
    pub total_audit_logs: i64,
    pub today_omni_logs: i64,
    pub today_audit_logs: i64,
    pub oldest_log: Option<String>,
    pub newest_log: Option<String>,
}

/// 统一注册中心的调度器名
const AUDIT_CLEANUP_SCHEDULER_NAME: &str = "audit-cleanup-scheduler";

#[async_trait::async_trait]
impl crate::utils::scheduler_framework::Scheduler for AuditCleanupService {
    fn name(&self) -> &str {
        AUDIT_CLEANUP_SCHEDULER_NAME
    }

    fn interval_secs(&self) -> u64 {
        24 * 60 * 60
    }

    async fn run_once(&self) -> Result<(), String> {
        self.cleanup_expired_logs()
            .await
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    async fn run_once_counted(&self) -> (Result<(), String>, Option<i64>) {
        let r = self.cleanup_expired_logs().await.map_err(|e| e.to_string());
        match r {
            Ok(n) => (Ok(()), Some(n as i64)),
            Err(e) => (Err(e), None),
        }
    }
}
