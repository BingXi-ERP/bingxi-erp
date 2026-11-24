//! 脏数据定期巡检与修复调度器（4.38/4.39/4.24 审计唯一功能缺口）。
//!
//! 调用方：bootstrap/service_bootstrap.rs 在统一注册中心注册本 Scheduler；
//! handlers/scheduler_handler.rs 的 GET /scheduler/data-integrity/report 按需同步巡检
//! 并回读同一份报告结构（定时与手动触发共用本服务的 scan）。
//!
//! 分工边界：
//! - 写时门（validator / 重复编码拒绝 / 库存不足拒绝）保持不变，本层只做存量巡检，
//!   不绕过任何业务写链路；
//! - 巡检四类：孤立明细、重复单据、负库存存量、金额为空。每类返回总量与有限样本，
//!   样本上限可配（sample_limit），不把全表脏数据拉进内存；
//! - 自动修复默认关闭（repair_enabled=false）：仅"孤儿明细删除"与"负库存归零"两类
//!   有确定修复口径，且必须显式开启配置才执行；重复单据无法判定权威版本、金额为空
//!   需业务补全，二者只报告不自动改数。修复前后以审计事件落 audit_logs，
//!   修复条数随执行历史 affected 列上报；
//! - 所有 SQL 为源码常量，动态片段只来自数据库读出的 i32 主键拼接，无用户输入入 SQL。
//!
//! 与 V2Table / 前端无关：本层是后端服务，报告端点挂在既有 scheduler 可观测面，
//! 不新增权限映射、不改路由鉴权口径。

use std::sync::Arc;
use std::sync::OnceLock;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use sea_orm::{ConnectionTrait, DatabaseBackend, DatabaseConnection, Statement, TransactionTrait};
use serde::Serialize;
use serde_json::json;
use tracing::{info, warn};

use crate::config::settings::DataIntegrityScanJob;
use crate::models::audit_log::{OperationType, Severity};
use crate::services::audit_log_service::{AuditEvent, AuditLogService};
use crate::utils::scheduler_framework::Scheduler;

/// 统一注册中心中的任务名（手动触发端点按此名寻址）
pub const SCHEDULER_NAME: &str = "data-integrity-scan";

/// 单次巡检每类最多回传的样本条数上限（与 CHECKS 的 LIMIT 20 常量对齐）
pub const MAX_SAMPLE_LIMIT: usize = 20;

#[derive(Debug, Clone, Copy)]
struct CheckDef {
    category: &'static str,
    entity: &'static str,
    count_sql: &'static str,
    sample_sql: &'static str,
    remediation: &'static str,
}

/// 四类存量巡检口径。表名按实体模型 table_name 原样写，不凭复数推断
/// （purchase_order_item 是单数表名）。
const CHECKS: &[CheckDef] = &[
    CheckDef {
        category: "orphan_detail",
        entity: "sales_order_items",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM sales_order_items i \
                    LEFT JOIN sales_orders o ON o.id = i.order_id WHERE o.id IS NULL",
        sample_sql: "SELECT i.id::text AS sample FROM sales_order_items i \
                     LEFT JOIN sales_orders o ON o.id = i.order_id \
                     WHERE o.id IS NULL ORDER BY i.id LIMIT 20",
        remediation: "明细无父单据：核对后删除孤儿行或补建父单据",
    },
    CheckDef {
        category: "orphan_detail",
        entity: "purchase_order_item",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM purchase_order_item i \
                    LEFT JOIN purchase_orders o ON o.id = i.order_id WHERE o.id IS NULL",
        sample_sql: "SELECT i.id::text AS sample FROM purchase_order_item i \
                     LEFT JOIN purchase_orders o ON o.id = i.order_id \
                     WHERE o.id IS NULL ORDER BY i.id LIMIT 20",
        remediation: "明细无父单据：核对后删除孤儿行或补建父单据",
    },
    CheckDef {
        category: "duplicate_document",
        entity: "sales_orders",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM \
                    (SELECT order_no FROM sales_orders GROUP BY order_no HAVING COUNT(*) > 1) d",
        sample_sql: "SELECT order_no AS sample FROM sales_orders GROUP BY order_no \
                     HAVING COUNT(*) > 1 ORDER BY order_no LIMIT 20",
        remediation: "单据号重复：人工比对后停用副本，禁止自动选主",
    },
    CheckDef {
        category: "duplicate_document",
        entity: "purchase_orders",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM \
                    (SELECT order_no FROM purchase_orders GROUP BY order_no HAVING COUNT(*) > 1) d",
        sample_sql: "SELECT order_no AS sample FROM purchase_orders GROUP BY order_no \
                     HAVING COUNT(*) > 1 ORDER BY order_no LIMIT 20",
        remediation: "单据号重复：人工比对后停用副本，禁止自动选主",
    },
    CheckDef {
        category: "negative_stock",
        entity: "inventory_stocks",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM inventory_stocks \
                    WHERE quantity_on_hand < 0 OR quantity_available < 0 OR quantity_reserved < 0",
        sample_sql: "SELECT id::text AS sample FROM inventory_stocks \
                     WHERE quantity_on_hand < 0 OR quantity_available < 0 OR quantity_reserved < 0 \
                     ORDER BY id LIMIT 20",
        remediation: "存量负数：核对库存流水后按审计留痕归零",
    },
    CheckDef {
        category: "empty_amount",
        entity: "custom_orders",
        count_sql: "SELECT COUNT(*)::bigint AS count FROM custom_orders WHERE total_amount IS NULL",
        sample_sql: "SELECT id::text AS sample FROM custom_orders WHERE total_amount IS NULL \
                     ORDER BY id LIMIT 20",
        remediation: "金额为空：由业务按明细重算或补录，禁止自动填零",
    },
];

/// 巡检报告（报告端点与 Scheduler 共用同一结构）
#[derive(Debug, Clone, Serialize)]
pub struct DataIntegrityReport {
    pub generated_at: DateTime<Utc>,
    pub scheduler_name: &'static str,
    pub findings: Vec<FindingGroup>,
    pub total_count: i64,
    pub sample_limit: usize,
    pub repair_enabled: bool,
    pub repairs_applied: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FindingGroup {
    pub category: &'static str,
    pub entity: &'static str,
    pub count: i64,
    pub sample: Vec<String>,
    pub remediation: &'static str,
}

/// 已注册巡检服务单例：报告端点复用调度器身上的配置，避免两处口径漂移。
/// 注册前（如纯单元测试直接调报告处理函数）回退默认配置服务。
static ACTIVE_SERVICE: OnceLock<Arc<DataIntegrityScanService>> = OnceLock::new();

pub fn install_global(service: Arc<DataIntegrityScanService>) {
    let _ = ACTIVE_SERVICE.set(service);
}

pub fn global_or_default(
    db: Arc<DatabaseConnection>,
    audit_log: Arc<AuditLogService>,
) -> Arc<DataIntegrityScanService> {
    ACTIVE_SERVICE.get().cloned().unwrap_or_else(|| {
        Arc::new(DataIntegrityScanService::new(
            db,
            audit_log,
            DataIntegrityScanJob::default(),
        ))
    })
}

/// 脏数据巡检服务。实现 Scheduler 供统一注册中心纳管；报告端点直接调 scan。
pub struct DataIntegrityScanService {
    db: Arc<DatabaseConnection>,
    audit_log: Arc<AuditLogService>,
    config: DataIntegrityScanJob,
}

impl DataIntegrityScanService {
    pub fn new(
        db: Arc<DatabaseConnection>,
        audit_log: Arc<AuditLogService>,
        config: DataIntegrityScanJob,
    ) -> Self {
        Self {
            db,
            audit_log,
            config,
        }
    }

    /// 同步执行一次全类巡检（报告端点与定时/手动触发共用）
    pub async fn scan(&self) -> Result<DataIntegrityReport, String> {
        let limit = self.config.sample_limit.clamp(1, MAX_SAMPLE_LIMIT);
        let mut findings = Vec::with_capacity(CHECKS.len());
        let mut total_count = 0_i64;
        for check in CHECKS {
            let count = self.query_count(check.count_sql).await?;
            total_count += count;
            // 样本 SQL 常数写死 LIMIT 20；配置上限更小时截断，避免返回超出承诺的条数。
            let sample = if count == 0 {
                Vec::new()
            } else {
                let mut rows = self.query_column(check.sample_sql, "sample").await?;
                rows.truncate(limit.min(rows.len()));
                rows
            };
            findings.push(FindingGroup {
                category: check.category,
                entity: check.entity,
                count,
                sample,
                remediation: check.remediation,
            });
        }
        Ok(DataIntegrityReport {
            generated_at: Utc::now(),
            scheduler_name: SCHEDULER_NAME,
            findings,
            total_count,
            sample_limit: limit,
            repair_enabled: self.config.repair_enabled,
            repairs_applied: 0,
        })
    }

    /// 显式开启配置后执行确定性修复；默认关闭时为零写入只读巡检。
    /// 修复条数进入执行历史 affected 列与报告 repairs_applied。
    pub async fn scan_and_repair(&self) -> Result<DataIntegrityReport, String> {
        let mut report = self.scan().await?;
        if !self.config.repair_enabled {
            return Ok(report);
        }
        let mut repairs = 0_i64;
        repairs += self
            .repair_orphans("sales_order_items", "sales_orders")
            .await?;
        repairs += self
            .repair_orphans("purchase_order_item", "purchase_orders")
            .await?;
        repairs += self.repair_negative_stock().await?;
        report.repairs_applied = repairs;
        if repairs > 0 {
            // 修复后回扫一次，保证报告与库内现状一致（孤儿/NULL 已消除时计数归零）。
            let mut fresh = self.scan().await?;
            fresh.repairs_applied = repairs;
            return Ok(fresh);
        }
        Ok(report)
    }

    async fn query_count(&self, sql: &str) -> Result<i64, String> {
        let rows = self
            .db
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Postgres,
                sql.to_owned(),
            ))
            .await
            .map_err(|e| format!("脏数据巡检计数查询失败: {e}"))?;
        Ok(rows
            .first()
            .and_then(|row| row.try_get::<i64>("", "count").ok())
            .unwrap_or(0))
    }

    async fn query_column(&self, sql: &str, column: &str) -> Result<Vec<String>, String> {
        let rows = self
            .db
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Postgres,
                sql.to_owned(),
            ))
            .await
            .map_err(|e| format!("脏数据巡检样本查询失败: {e}"))?;
        rows.iter()
            .map(|row| {
                row.try_get::<String>("", column)
                    .map_err(|e| format!("脏数据巡检样本列 {column} 解码失败: {e}"))
            })
            .collect()
    }

    /// 删除确有确定口径的孤儿明细。SQL 只拼 i32 主键（来自本服务读出的数据库值），
    /// 单批上限 config.repair_batch_size，避免一次事务锁太多行。
    async fn repair_orphans(&self, child_table: &str, parent_table: &str) -> Result<i64, String> {
        let sql = format!(
            "SELECT c.id::text AS sample FROM {child_table} c \
             LEFT JOIN {parent_table} p ON p.id = c.order_id \
             WHERE p.id IS NULL ORDER BY c.id LIMIT {}",
            self.config.repair_batch_size.max(1)
        );
        let ids = self.query_column(&sql, "sample").await?;
        if ids.is_empty() {
            return Ok(0);
        }
        let id_list = ids.join(", ");
        let txn = (*self.db)
            .begin()
            .await
            .map_err(|e| format!("孤儿明细修复开事务失败: {e}"))?;
        let delete_sql = format!("DELETE FROM {child_table} WHERE id IN ({id_list})");
        txn.execute_unprepared(&delete_sql)
            .await
            .map_err(|e| format!("孤儿明细修复删除失败: {e}"))?;
        txn.commit()
            .await
            .map_err(|e| format!("孤儿明细修复提交失败: {e}"))?;
        self.record_repair(
            "orphan_detail",
            child_table,
            &json!({ "deleted_ids": ids }),
            &json!({ "remaining": 0 }),
        )
        .await;
        Ok(ids.len() as i64)
    }

    /// 负库存归零：三个数量列统一 GREATEST(x, 0)，不引入任何业务单据状态变更；
    /// 修复前快照全量记入审计日志，业务侧仍可凭快照手工回补。
    async fn repair_negative_stock(&self) -> Result<i64, String> {
        let sql = format!(
            "SELECT id::text AS sample, quantity_on_hand::text AS qoh, \
             quantity_available::text AS qavail, quantity_reserved::text AS qres \
             FROM inventory_stocks \
             WHERE quantity_on_hand < 0 OR quantity_available < 0 OR quantity_reserved < 0 \
             ORDER BY id LIMIT {}",
            self.config.repair_batch_size.max(1)
        );
        let rows = self
            .db
            .query_all_raw(Statement::from_string(DatabaseBackend::Postgres, sql))
            .await
            .map_err(|e| format!("负库存修复样本查询失败: {e}"))?;
        if rows.is_empty() {
            return Ok(0);
        }
        let mut ids = Vec::with_capacity(rows.len());
        let mut snapshots = Vec::with_capacity(rows.len());
        for row in &rows {
            let id: String = row
                .try_get("", "sample")
                .map_err(|e| format!("负库存修复主键解码失败: {e}"))?;
            let qoh: String = row
                .try_get("", "qoh")
                .map_err(|e| format!("负库存修复数量列解码失败: {e}"))?;
            let qavail: String = row
                .try_get("", "qavail")
                .map_err(|e| format!("负库存修复数量列解码失败: {e}"))?;
            let qres: String = row
                .try_get("", "qres")
                .map_err(|e| format!("负库存修复数量列解码失败: {e}"))?;
            ids.push(id.clone());
            snapshots.push(json!({ "id": id, "quantity_on_hand": qoh,
                "quantity_available": qavail, "quantity_reserved": qres }));
        }
        let id_list = ids.join(", ");
        let update_sql = format!(
            "UPDATE inventory_stocks SET \
             quantity_on_hand = GREATEST(quantity_on_hand, 0), \
             quantity_available = GREATEST(quantity_available, 0), \
             quantity_reserved = GREATEST(quantity_reserved, 0), updated_at = NOW() \
             WHERE id IN ({id_list})"
        );
        let txn = (*self.db)
            .begin()
            .await
            .map_err(|e| format!("负库存修复开事务失败: {e}"))?;
        txn.execute_unprepared(&update_sql)
            .await
            .map_err(|e| format!("负库存修复更新失败: {e}"))?;
        txn.commit()
            .await
            .map_err(|e| format!("负库存修复提交失败: {e}"))?;
        self.record_repair(
            "negative_stock",
            "inventory_stocks",
            &json!({ "rows": snapshots }),
            &json!({ "clamped_to_zero": ids }),
        )
        .await;
        Ok(ids.len() as i64)
    }

    /// 修复留痕：审计写入失败只记 warn，不回滚已提交的修复（快照已随日志输出）。
    async fn record_repair(
        &self,
        category: &str,
        entity: &str,
        before: &serde_json::Value,
        after: &serde_json::Value,
    ) {
        let mut event = AuditEvent::new(OperationType::Other, "data-integrity-repair");
        event.severity = Severity::Warn;
        event.resource_name = Some(format!("{category}/{entity}"));
        event.description = Some(format!("脏数据巡检自动修复：{category}/{entity}"));
        event.request_method = Some("SCHEDULE".to_owned());
        event.request_path = Some(format!("/scheduler/{SCHEDULER_NAME}"));
        event.before_snapshot = Some(before.clone());
        event.after_snapshot = Some(after.clone());
        if let Err(e) = self.audit_log.record(event, None).await {
            warn!(error = %e, category, entity, "脏数据修复审计写入失败");
        }
    }
}

#[async_trait]
impl Scheduler for DataIntegrityScanService {
    fn name(&self) -> &str {
        SCHEDULER_NAME
    }

    fn interval_secs(&self) -> u64 {
        self.config.interval_secs
    }

    fn initial_delay_secs(&self) -> u64 {
        self.config.initial_delay_secs
    }

    fn enabled(&self) -> bool {
        self.config.enabled
    }

    async fn run_once(&self) -> Result<(), String> {
        let report = self.scan_and_repair().await?;
        if report.total_count > 0 {
            warn!(
                total_count = report.total_count,
                repairs_applied = report.repairs_applied,
                "脏数据巡检发现异常，详见 /scheduler/data-integrity/report"
            );
        } else {
            info!("脏数据巡检完成：四类口径均无异常");
        }
        Ok(())
    }

    async fn run_once_counted(&self) -> (Result<(), String>, Option<i64>) {
        match self.scan_and_repair().await {
            Ok(report) => {
                if report.total_count > 0 {
                    warn!(
                        total_count = report.total_count,
                        repairs_applied = report.repairs_applied,
                        "脏数据巡检发现异常，详见 /scheduler/data-integrity/report"
                    );
                }
                (Ok(()), Some(report.total_count))
            }
            Err(e) => (Err(e), None),
        }
    }
}
