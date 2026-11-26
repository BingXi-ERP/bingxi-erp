//! BPM 审批超时自动转交调度器。
//!
//! 每分钟扫描到期待办，逐任务事务加行锁复查后转交给节点配置的备份审批人；
//! 任务状态、处理人、到期时间、转交次数与审计同事务落库，提交后通知新处理人。

use std::sync::Arc;

use async_trait::async_trait;
use chrono::Utc;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, QuerySelect, Set,
    TransactionTrait,
};

use crate::models::status::bpm_task as task_status;
use crate::models::{bpm_process_instance, bpm_task, user};
use crate::services::audit_log_service::AuditLogService;
use crate::services::bpm_ops::{notify_task_pending, timeout};
use crate::utils::error::AppError;
use crate::utils::scheduler_framework::Scheduler;

const BATCH_SIZE: u64 = 100;

/// 审批超时转交任务，注册到统一 SchedulerRegistry。
pub struct ApprovalTimeoutScheduler {
    db: Arc<DatabaseConnection>,
}

impl ApprovalTimeoutScheduler {
    /// 创建调度器；数据库连接同时用于业务事务与提交后的站内通知。
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 扫描并转交当前到期的待办，返回本轮实际转交条数。
    ///
    /// 单条失败不会阻断本批其余任务，但会记录任务标识与错误并让本轮整体失败，
    /// 使执行历史与监控能显式暴露未闭环任务；失败任务保持原样，下一轮可重试。
    pub async fn transfer_due_tasks(&self) -> Result<i64, AppError> {
        let now = Utc::now();
        let due_tasks = bpm_task::Entity::find()
            .filter(bpm_task::Column::Status.eq(task_status::PENDING))
            .filter(bpm_task::Column::DueDate.lt(now))
            .order_by_asc(bpm_task::Column::DueDate)
            .limit(BATCH_SIZE)
            .all(&*self.db)
            .await?;

        let mut transferred = 0_i64;
        let mut failures = Vec::new();
        for task in due_tasks {
            let task_id = task.id;
            let instance_id = task.instance_id;
            match self.transfer_due_task(task_id, now).await {
                Ok(true) => transferred += 1,
                Ok(false) => {}
                Err(error) => {
                    tracing::error!(
                        task_id,
                        instance_id,
                        error = %error,
                        "审批超时转交失败，任务保持原样，等待下一轮重试"
                    );
                    failures.push(format!("task {task_id}: {error}"));
                }
            }
        }

        if failures.is_empty() {
            Ok(transferred)
        } else {
            Err(AppError::internal(format!(
                "审批超时转交本轮存在 {} 条失败：{}",
                failures.len(),
                failures.join("; ")
            )))
        }
    }

    /// 转交一枚任务；锁内状态或到期时间已变化时返回 false，保证并发幂等。
    async fn transfer_due_task(
        &self,
        task_id: i32,
        now: chrono::DateTime<Utc>,
    ) -> Result<bool, AppError> {
        let txn = self.db.begin().await?;
        let task = bpm_task::Entity::find_by_id(task_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("审批任务不存在"))?;
        if task.status.as_deref() != Some(task_status::PENDING) {
            return Ok(false);
        }
        let Some(due_date) = task.due_date else {
            return Ok(false);
        };
        if due_date > now {
            return Ok(false);
        }

        let policy = timeout::timeout_policy_from_snapshot(task.task_variables.as_ref())?
            .ok_or_else(|| AppError::business_displayable("审批任务缺少超时转交策略快照"))?;
        let target = user::Entity::find_by_id(policy.transfer_to_user_id)
            .one(&txn)
            .await?
            .ok_or_else(|| {
                AppError::validation_displayable(format!(
                    "审批任务配置的超时转交用户 ID {} 不存在，请在流程定义中重新选择转交用户",
                    policy.transfer_to_user_id
                ))
            })?;
        if !target.is_active {
            return Err(AppError::validation_displayable(format!(
                "审批任务配置的超时转交用户 {} 已停用，请在流程定义中改用启用用户后重新处理",
                policy.transfer_to_user_id
            )));
        }
        let target_name = target
            .real_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .unwrap_or(target.username.clone());
        if target_name.is_empty() {
            return Err(AppError::validation_displayable(
                "超时转交用户没有有效姓名，请在用户档案中补齐后重试",
            ));
        }

        let instance = bpm_process_instance::Entity::find_by_id(task.instance_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("审批流程实例不存在"))?;
        let previous_handler_id = task.actual_handler_id.ok_or_else(|| {
            AppError::business_displayable("到期待办缺少原处理人，无法执行超时转交")
        })?;
        let variables = task
            .task_variables
            .clone()
            .ok_or_else(|| AppError::business_displayable("审批任务缺少超时转交变量快照"))?;
        let variables = timeout::increment_transfer_count(&variables, previous_handler_id)?;
        let old_name = task
            .actual_handler_name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .unwrap_or("原审批人")
            .to_string();

        let mut active: bpm_task::ActiveModel = task.into();
        active.actual_handler_id = Set(Some(target.id));
        active.actual_handler_name = Set(Some(target_name));
        active.approval_opinion = Set(Some(format!("[超时转交] {old_name} 超时未处理")));
        active.due_date = Set(None);
        active.is_overdue = Set(Some(false));
        active.overdue_days = Set(Some(0));
        active.task_variables = Set(Some(variables));
        active.updated_at = Set(Some(now));
        let updated = AuditLogService::update_with_audit(&txn, "bpm_task", active, None).await?;
        txn.commit().await?;

        tracing::info!(
            task_id,
            instance_id = instance.id,
            previous_handler = %old_name,
            new_handler_id = target.id,
            "审批任务已超时自动转交"
        );
        notify_task_pending(&self.db, &updated, &instance, "审批超时自动转交").await;
        Ok(true)
    }
}

#[async_trait]
impl Scheduler for ApprovalTimeoutScheduler {
    fn name(&self) -> &str {
        "bpm_approval_timeout_transfer"
    }

    fn interval_secs(&self) -> u64 {
        60
    }

    fn initial_delay_secs(&self) -> u64 {
        30
    }

    async fn run_once(&self) -> Result<(), String> {
        self.transfer_due_tasks()
            .await
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    async fn run_once_counted(&self) -> (Result<(), String>, Option<i64>) {
        let result = self.transfer_due_tasks().await;
        let affected = result.as_ref().ok().copied();
        (
            result.map(|_| ()).map_err(|error| error.to_string()),
            affected,
        )
    }
}
