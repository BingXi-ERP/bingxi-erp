//! 销售报价单审批服务
//!
//! 业务功能：
//! - 金额阶梯审批：
//!   - < 10万：销售员自行审批
//!   - 10万 ~ 50万：销售经理审批
//!   - > 50万：总经理审批
//! - 超折扣审批门（与金额阶梯并列的强制条件，取更严者）：任一明细行折扣率严格大于
//!   配置表阈值时，报价单**不得**由自批腿进入可下发状态，必须提交主管审批；阈值与实际
//!   折扣的读取与判定单点在 `services/quotation_discount_service.rs`
//! - BPM 集成（提交 / 完成审批实例）
//!
//! Week 2 任务 7 - 销售报价单模块
//! 创建时间: 2026-06-16
//! 关联计划: 2026-06-16-sales-quotation-plan.md Task 7

use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect, Set,
    TransactionTrait,
};
use std::sync::Arc;

use crate::container::AppState;
use crate::models::bpm_task;
use crate::models::dto::bpm_dto::StartProcessRequest;
use crate::models::event_dead_letter;
use crate::models::sales_quotation::{
    self, ActiveModel as QuotationActive, Entity as QuotationEntity,
};
use crate::models::status::bpm_task as task_status;
use crate::models::status::quotation as quotation_status;
use crate::models::status::quotation_ext as quotation_ext_status;
use crate::services::bpm_ops::task::{APPROVE_ACTION, REJECT_ACTION};
use crate::services::bpm_ops::{bpm_start_failure_error, process_key};
use crate::services::bpm_service::BpmService;
use crate::services::quotation_discount_service::QuotationDiscountService;
use crate::utils::error::AppError;

/// 金额阶梯常量
const AMOUNT_THRESHOLD_SELF: i64 = 100_000; // 10 万
const AMOUNT_THRESHOLD_MANAGER: i64 = 500_000; // 50 万

/// BPM 回写失败死信的事件类型（is_err 审计条目 16）。
/// 复用 event_dead_letters 表承载"业务状态已推进、BPM 待办未闭环"的补偿信号，
/// event_type 采用 BizEvent 命名式（非 BusinessEvent 变体，同步腿独立标注）。
const BPM_WRITEBACK_DEAD_LETTER_EVENT_TYPE: &str = "QuotationApprovalBpmWritebackFailed";

/// 构建报价单 BPM 回写失败死信行（纯函数，供 [`QuotationApprovalService::write_bpm_dead_letter`]
/// 与契约测试共用）。payload 契约键：quotation_id / approved / approver_id / reject_reason /
/// task_id / action——人工按 payload 中的 task_id 直达 PENDING 的 bpm_task 补闭环。
/// 状态直接落 DEAD（本信号无重试链，`retry_count=0` 记录"一次即入死信"）。
pub fn build_bpm_dead_letter_active(
    quotation_id: i64,
    approved: bool,
    approver_id: i32,
    reject_reason: Option<&str>,
    task_id: i32,
    action: &str,
    full_error: &str,
) -> event_dead_letter::ActiveModel {
    let now = Utc::now();
    event_dead_letter::ActiveModel {
        event_type: Set(BPM_WRITEBACK_DEAD_LETTER_EVENT_TYPE.to_string()),
        event_payload: Set(serde_json::json!({
            "quotation_id": quotation_id,
            "approved": approved,
            "approver_id": approver_id,
            "reject_reason": reject_reason,
            "task_id": task_id,
            "action": action,
        })),
        failure_reason: Set(format!(
            "报价单 {} 业务状态已推进但 BPM approve_task（task_id={}，action={}）失败，任务永久 PENDING",
            quotation_id, task_id, action
        )),
        last_error: Set(Some(full_error.to_string())),
        retry_count: Set(0),
        max_retries: Set(0),
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

/// 审批角色枚举
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApproverRole {
    /// 销售员自批（< 10 万）
    Salesperson,
    /// 销售经理审批（10-50 万）
    SalesManager,
    /// 总经理审批（> 50 万）
    GeneralManager,
}

impl ApproverRole {
    /// 从金额判定审批角色
    pub fn from_amount(amount: Decimal) -> Self {
        // BE-B-1/BE-F-6 修复（2026-06-25 第二次全面审计）：
        // 原实现 amount.to_string().parse::<f64>().unwrap_or(0.0) as i64 存在两个问题：
        // 1. f64 精度损失（大金额比较错误）
        // 2. unwrap_or(0.0) 解析失败时金额被视为 0 → 命中 < 10万 分支 → 销售员自批绕过审批
        // 修复：直接用 Decimal 比较，避免 f64 中转与解析失败降级。
        let threshold_self = Decimal::new(AMOUNT_THRESHOLD_SELF, 0);
        let threshold_manager = Decimal::new(AMOUNT_THRESHOLD_MANAGER, 0);
        if amount < threshold_self {
            ApproverRole::Salesperson
        } else if amount < threshold_manager {
            ApproverRole::SalesManager
        } else {
            ApproverRole::GeneralManager
        }
    }

    /// 角色代码
    pub fn code(&self) -> &'static str {
        match self {
            ApproverRole::Salesperson => "self",
            ApproverRole::SalesManager => "sales_manager",
            ApproverRole::GeneralManager => "general_manager",
        }
    }
}

/// 审批服务
pub struct QuotationApprovalService {
    db: Arc<DatabaseConnection>,
}

impl QuotationApprovalService {
    /// 从数据库连接直接构造
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 从 AppState 构造便捷方法
    pub fn from_state(state: &AppState) -> Self {
        Self {
            db: state.db.clone(),
        }
    }

    /// BPM 回写失败补偿信号落死信（is_err 审计条目 16，参照
    /// services/event_retry_service.rs::write_to_dead_letter 的写行范式）。
    /// 业务状态已在调用方事务内提交、不回改；死信写失败只以 error 级日志点名，
    /// 不向上抛（避免把"补偿信号写失败"伪装成业务失败二次改写已提交状态）。
    async fn write_bpm_dead_letter(
        &self,
        quotation_id: i64,
        approved: bool,
        approver_id: i32,
        reject_reason: Option<&str>,
        task_id: i32,
        action: &str,
        full_error: &str,
    ) {
        let active = build_bpm_dead_letter_active(
            quotation_id,
            approved,
            approver_id,
            reject_reason,
            task_id,
            action,
            full_error,
        );
        match active.insert(&*self.db).await {
            Ok(_) => {
                tracing::warn!(
                    business_type = "quotation",
                    business_id = quotation_id,
                    task_id,
                    event_type = BPM_WRITEBACK_DEAD_LETTER_EVENT_TYPE,
                    "BPM 回写失败已落 event_dead_letters 死信，待人工按 payload 补闭环"
                );
            }
            Err(dl_err) => {
                tracing::error!(
                    business_type = "quotation",
                    business_id = quotation_id,
                    task_id,
                    error = %dl_err,
                    "BPM 回写失败且死信写入失败：补偿信号未持久化，需人工核对 bpm_task PENDING 残留"
                );
            }
        }
    }

    /// 提交报价单进入审批流。
    ///
    /// 流程：1. 状态预检查（仅 draft / rejected 可提交）；2. 按金额定审批角色；
    /// 3. 读阈值并按行折扣率判超折扣门；4. 金额可自批**且**折扣未超阈 → 自批腿直接
    /// approved；其余任一情形 → 创建 BPM 流程实例并把状态写 pending_approval。
    ///
    /// 并发口径：本方法是事务外的预检查 + 路由决策；真正的状态变更各自在
    /// `self_approve` / `submit_to_bpm` 的事务内以 lock_exclusive 复查状态后完成，
    /// 超折扣的硬断言也在 `self_approve` 加锁后重算一次，最终一致性由子方法保证。
    pub async fn submit(
        &self,
        quotation_id: i64,
        user_id: i32,
    ) -> Result<sales_quotation::Model, AppError> {
        let quotation = QuotationEntity::find_by_id(quotation_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found("报价单不存在"))?;

        if ![quotation_status::DRAFT, quotation_status::REJECTED]
            .contains(&quotation.status.as_str())
        {
            // 提交腿状态门：仅草稿与被拒的可提交，拒绝点名行自身当前态供提交人自查；
            // 公开规则、不含标识，走可外显通道，机器码仍是 BUSINESS_ERROR
            return Err(AppError::business_displayable(format!(
                "报价单当前状态不允许提交：{}",
                quotation.status
            )));
        }

        let role = ApproverRole::from_amount(quotation.total_amount);

        // 超折扣门与金额阶梯门取更严者：折扣超阈时强制走主管审批腿，金额再小也不自批——
        // 自批腿写入的 approved 就是"可下发客户"的外部态，那正是本门要拦的去向。
        // 判定读的是单据明细已落库的折扣事实（discount_rate），阈值读单行配置表，缺行 fail-closed。
        let discount_service = QuotationDiscountService::new(self.db.clone());
        let verdict = discount_service.evaluate(&*self.db, quotation_id).await?;
        tracing::info!(
            quotation_id,
            approver_role = role.code(),
            threshold_pct = %verdict.threshold_pct,
            max_discount_pct = %verdict.max_discount_pct,
            over_threshold = verdict.over_threshold,
            "报价提交路由判定完成：按金额阶梯与超折扣门取更严者"
        );

        if role == ApproverRole::Salesperson && !verdict.over_threshold {
            // 小额自批：直接 approved
            self.self_approve(quotation_id, user_id).await
        } else {
            // 中大额，或折扣超阈：提交 BPM 走主管审批
            self.submit_to_bpm(quotation.id, user_id).await
        }
    }

    /// 自批：直接把状态标记为 approved（仅金额可自批**且**折扣未超阈时由 submit 路由到此）。
    ///
    /// 事务内先 lock_exclusive 再复查状态，避免 submit 预检查到加锁之间单据被并发改动
    /// （如已取消）后被本方法覆盖为 approved；随后在锁内重算超折扣门作硬断言——
    /// approved 是"可下发客户"的外部态且全仓只此一处写入点，超阈一律拒绝。
    async fn self_approve(
        &self,
        quotation_id: i64,
        user_id: i32,
    ) -> Result<sales_quotation::Model, AppError> {
        // 批次 12（2026-06-28）：事务包裹"查询 + update_with_audit"，
        // 加 lock_exclusive 防止并发自批导致状态不一致；
        // update_with_audit 内部 2 次写入（实体 update + 审计 insert）非原子，事务包裹保证原子性。
        let txn = (*self.db).begin().await?;

        let quotation = QuotationEntity::find_by_id(quotation_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("报价单不存在"))?;

        // 状态检查（与 submit_to_bpm 一致）：仅 draft/rejected 可提交审批
        if ![quotation_status::DRAFT, quotation_status::REJECTED]
            .contains(&quotation.status.as_str())
        {
            return Err(AppError::business(format!(
                "报价单当前状态不允许审批：{}",
                quotation.status
            )));
        }

        // 超折扣硬断言：在已持有排他锁的事务内重算，折扣事实与阈值同快照读数。
        // submit 的路由决策已把超阈单据送去主管审批，还能走到这里说明行折扣率或阈值
        // 在预检查之后变过，锁内重算是唯一能钉住"未经审批不得进入可下发态"的位置。
        let verdict = QuotationDiscountService::new(self.db.clone())
            .evaluate(&txn, quotation_id)
            .await?;
        if verdict.over_threshold {
            tracing::warn!(
                quotation_id,
                operator_user_id = user_id,
                threshold_pct = %verdict.threshold_pct,
                max_discount_pct = %verdict.max_discount_pct,
                "报价自批被拒：折扣率超阈，状态未改动，必须改走主管审批"
            );
            return Err(AppError::business_displayable(format!(
                "报价折扣率 {} % 已超过超折扣审批阈值 {} %，须经主管审批通过后方可下发客户",
                verdict.max_discount_pct, verdict.threshold_pct
            )));
        }

        let mut active: QuotationActive = quotation.into();
        active.status = Set(quotation_status::APPROVED.to_string());
        active.approved_by = Set(Some(user_id as i64));
        active.approved_at = Set(Some(Utc::now()));
        active.updated_at = Set(Utc::now());

        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            active,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;
        Ok(updated)
    }

    /// 提交至 BPM 流程：报价状态、审批实例关联与提交留痕在同一事务内提交。
    async fn submit_to_bpm(
        &self,
        quotation_id: i64,
        user_id: i32,
    ) -> Result<sales_quotation::Model, AppError> {
        let txn = (*self.db).begin().await?;
        let latest = QuotationEntity::find_by_id(quotation_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("报价单不存在"))?;

        if ![quotation_status::DRAFT, quotation_status::REJECTED].contains(&latest.status.as_str())
        {
            return Err(AppError::business_displayable(format!(
                "报价单当前状态不允许提交：{}",
                latest.status
            )));
        }

        let bpm_service = BpmService::new(self.db.clone());
        let req = StartProcessRequest {
            process_key: process_key::QUOTATION_APPROVAL.to_string(),
            business_type: "quotation".to_string(),
            business_id: latest.id,
            title: format!("报价单审批 - {}", latest.quotation_no),
            initiator_id: user_id,
            initiator_name: format!("user_{}", user_id),
            initiator_department_id: None,
            priority: Some("NORMAL".to_string()),
            form_data: Some(serde_json::json!({
                "quotation_no": latest.quotation_no,
                "total_amount": latest.total_amount.to_string(),
                "currency": latest.currency,
            })),
            variables: None,
        };

        // BPM 与报价行共用事务，任一写入失败都回滚，避免审批实例脱离报价单独存在。
        let started = match bpm_service.start_process_in_txn(&txn, req).await {
            Ok(started) => started,
            Err(e) => {
                tracing::error!(
                    error = %e,
                    process_key = process_key::QUOTATION_APPROVAL,
                    business_type = "quotation",
                    business_id = quotation_id,
                    "报价提交启动 BPM 流程失败，已拒绝提交（未改动报价单状态），根因如上"
                );
                return Err(bpm_start_failure_error(
                    process_key::QUOTATION_APPROVAL,
                    "报价单未提交",
                    &e,
                ));
            }
        };

        let mut active: QuotationActive = latest.into();
        active.status = Set(quotation_ext_status::PENDING_APPROVAL.to_string());
        active.approval_instance_id = Set(Some(started.response.instance_id as i64));
        // 提交留痕：状态跃迁到待审批时记录提交人，与状态写入同一条 update_with_audit，
        // 审计行的 before/after 快照同时覆盖状态与提交人两列。
        active.submitted_by = Set(Some(user_id as i64));
        active.updated_at = Set(Utc::now());

        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            active,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;
        bpm_service.notify_started_process(&started).await;
        tracing::info!(
            quotation_id = updated.id,
            submitted_by = ?updated.submitted_by,
            approval_instance_id = ?updated.approval_instance_id,
            "报价单已提交审批：状态、审批实例关联与提交人留痕已同事务提交"
        );
        Ok(updated)
    }

    /// 锁定报价单并校验状态为待审批
    async fn lock_and_validate_quotation_for_approval_txn(
        &self,
        quotation_id: i64,
        txn: &sea_orm::DatabaseTransaction,
    ) -> Result<sales_quotation::Model, AppError> {
        let quotation = QuotationEntity::find_by_id(quotation_id)
            .lock_exclusive()
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found("报价单不存在"))?;
        if quotation.status != quotation_ext_status::PENDING_APPROVAL {
            // 审批腿状态门：批准与拒绝的唯一前置都是待审批，拒绝点名行自身当前态；
            // 公开规则、不含标识，走可外显通道，机器码仍是 BUSINESS_ERROR
            return Err(AppError::business_displayable(format!(
                "报价单不在待审批状态：{}",
                quotation.status
            )));
        }
        Ok(quotation)
    }

    /// 构造审批通过的 ActiveModel
    ///
    /// 通过理由真实落 `approval_reason` 列（handler 侧已保证 trim 非空），不再只进日志。
    /// BPM 侧裁决意见的唯一载体仍是 `bpm_task.approval_opinion`，本列只承载业务侧裁量，
    /// 两端不互写（避免同一裁量双源）。
    fn build_approved_quotation_active_model(
        quotation: sales_quotation::Model,
        approver_id: i32,
        approval_reason: String,
    ) -> QuotationActive {
        let mut active: QuotationActive = quotation.into();
        active.status = Set(quotation_status::APPROVED.to_string());
        active.approved_by = Set(Some(approver_id as i64));
        active.approved_at = Set(Some(Utc::now()));
        active.approval_reason = Set(Some(approval_reason));
        active.updated_at = Set(Utc::now());
        active
    }

    /// 提交事务后完成 BPM 审批任务（容错：失败只记日志，不回滚业务侧已提交的审批结果）
    ///
    /// 定位口径：先按 business_type+business_id 定位流程实例，再按
    /// `instance_id + 写入方同源常量 bpm_task::PENDING` 定位**本单据**的待办任务，
    /// 只回写这些任务。旧形态「按办理人查用户待办分页」有两个结构性缺陷：
    /// 过滤值用大写 `"PENDING"` 字面量，与写入方小写词表（instance.rs/task.rs 写
    /// `bpm_task::PENDING="pending"`，DB CHECK 钉小写集）永不相等，回写循环恒空转；
    /// 且办理人过滤+分页上限 10 会在待办多于 10 条时漏查本单据任务，故一并弃用。
    async fn handle_bpm_quotation_approval_after_commit(
        &self,
        quotation_id: i64,
        approver_id: i32,
    ) {
        let bpm_service = BpmService::new(self.db.clone());
        let instance = match bpm_service
            .get_process_by_business("quotation", quotation_id)
            .await
        {
            Ok(Some(instance)) => instance,
            Ok(None) => {
                tracing::warn!(
                    business_type = "quotation",
                    business_id = quotation_id,
                    "报价审批 BPM 回写：未找到该单据的流程实例，待办任务无法闭环，需人工对账"
                );
                return;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    business_type = "quotation",
                    business_id = quotation_id,
                    "报价审批 BPM 回写：查询流程实例失败，待办任务未闭环"
                );
                return;
            }
        };
        let tasks = match bpm_task::Entity::find()
            .filter(bpm_task::Column::InstanceId.eq(instance.id))
            .filter(bpm_task::Column::Status.eq(task_status::PENDING))
            .all(&*self.db)
            .await
        {
            Ok(tasks) => tasks,
            Err(e) => {
                tracing::error!(
                    error = %e,
                    business_type = "quotation",
                    business_id = quotation_id,
                    instance_id = instance.id,
                    "报价审批 BPM 回写：查询待办任务失败，任务未闭环"
                );
                return;
            }
        };
        if tasks.is_empty() {
            tracing::warn!(
                business_type = "quotation",
                business_id = quotation_id,
                instance_id = instance.id,
                expected_task_status = task_status::PENDING,
                "报价审批 BPM 回写：该实例下无状态为待处理的 bpm_task，任务未闭环，需人工对账"
            );
            return;
        }
        for task in tasks {
            // approve_task 的处理人取已认证操作人（user_id 参数，见 bpm_ops/task.rs），
            // req.handler_id/handler_name 在当前签名下不被消费，仅按 DTO 形状填充。
            if let Err(e) = bpm_service
                .approve_task(
                    crate::models::dto::bpm_dto::ApproveTaskRequest {
                        task_id: task.id,
                        handler_id: approver_id,
                        handler_name: String::new(),
                        action: APPROVE_ACTION.to_string(),
                        approval_opinion: None,
                        attachment_urls: None,
                    },
                    Some(approver_id),
                )
                .await
            {
                tracing::warn!(
                    error = %e,
                    task_id = task.id,
                    business_type = "quotation",
                    business_id = quotation_id,
                    "BPM 报价单审批通过任务失败（不阻断已提交的业务状态）"
                );
                // is_err 审计条目 16：业务状态已推进、BPM 任务将永久 PENDING，
                // 落死信持久化补偿信号（payload 带 quotation_id/approved/approver_id 等）。
                self.write_bpm_dead_letter(
                    quotation_id,
                    true,
                    approver_id,
                    None,
                    task.id,
                    APPROVE_ACTION,
                    &e.to_string(),
                )
                .await;
            } else {
                tracing::info!(
                    task_id = task.id,
                    business_id = quotation_id,
                    "报价审批通过 BPM 回写完成"
                );
            }
        }
    }

    /// 经理/总经理审批通过
    ///
    /// `approval_reason` 为业务侧通过理由（handler 已收口 trim 非空），真实落
    /// `approval_reason` 列；BPM 待办的裁决意见另由 `bpm_task.approval_opinion` 承载，
    /// 本方法不把业务理由回灌 BPM、也不从 BPM 反灌业务列（禁双写）。
    pub async fn approve(
        &self,
        quotation_id: i64,
        approver_id: i32,
        approval_reason: String,
    ) -> Result<sales_quotation::Model, AppError> {
        // 事务包裹查询+状态检查+审计更新，BPM 任务审批在事务外执行（容错）
        let txn = (*self.db).begin().await?;
        let quotation = self
            .lock_and_validate_quotation_for_approval_txn(quotation_id, &txn)
            .await?;
        let active =
            Self::build_approved_quotation_active_model(quotation, approver_id, approval_reason);
        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            active,
            Some(approver_id),
        )
        .await?;
        txn.commit().await?;
        // 完成 BPM 任务（事务外，容错）
        if updated.approval_instance_id.is_some() {
            self.handle_bpm_quotation_approval_after_commit(quotation_id, approver_id)
                .await;
        } else {
            // 状态已是 pending_approval 却无实例：提交时 BPM 启动失败或旧数据遗留，
            // 必须点名——这意味着 BPM 侧永无任务可闭环（静默跳过即二次空转）。
            tracing::warn!(
                business_type = "quotation",
                business_id = quotation_id,
                "报价审批通过 BPM 回写跳过：单据处于待审批状态但未关联 BPM 实例，BPM 侧无任务可闭环，需人工对账"
            );
        }
        Ok(updated)
    }

    /// 审批拒绝
    pub async fn reject(
        &self,
        quotation_id: i64,
        approver_id: i32,
        reason: String,
    ) -> Result<sales_quotation::Model, AppError> {
        // 事务包裹"查询 + 状态检查 + update_with_audit"，加 lock_exclusive 防并发；
        // BPM 任务审批在事务外执行（容错，失败不阻断已提交状态）
        let txn = (*self.db).begin().await?;
        let updated = self
            .reject_quotation_txn(quotation_id, approver_id, &reason, &txn)
            .await?;
        txn.commit().await?;
        // 完成 BPM 任务（事务外，容错）
        self.complete_rejection_bpm(&updated, approver_id, &reason)
            .await;
        Ok(updated)
    }

    /// 事务内执行拒绝：lock_exclusive + 状态校验 + 构建更新 + 审计更新
    async fn reject_quotation_txn(
        &self,
        quotation_id: i64,
        approver_id: i32,
        reason: &str,
        txn: &sea_orm::DatabaseTransaction,
    ) -> Result<sales_quotation::Model, AppError> {
        // 复用审批锁校验：lock_exclusive + 状态为待审批
        let quotation = self
            .lock_and_validate_quotation_for_approval_txn(quotation_id, txn)
            .await?;
        let mut active: QuotationActive = quotation.into();
        active.status = Set(quotation_status::REJECTED.to_string());
        active.rejection_reason = Set(Some(reason.to_string()));
        // 结论人/结论时间列口径与 approve 路径一致：本域只有 approved_by/approved_at
        // 一列套承载"审批结论"，结论性质由 status 区分，拒绝同样必须留决策时间与决策人。
        active.approved_by = Set(Some(approver_id as i64));
        active.approved_at = Set(Some(Utc::now()));
        active.updated_at = Set(Utc::now());
        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            txn,
            "auto_audit",
            active,
            Some(approver_id),
        )
        .await?;
        Ok(updated)
    }

    /// 事务外完成 BPM 拒绝任务（容错：失败只记日志，不回改业务侧已提交的拒绝结果）
    ///
    /// 定位口径与 `handle_bpm_quotation_approval_after_commit` 完全一致：
    /// business_type+business_id 定位实例，`instance_id + bpm_task::PENDING`（写入方
    /// 同源常量）定位本单据待办任务；拒绝理由只写 `bpm_task.approval_opinion`
    /// 这一 BPM 载体，不在业务表另建第二份理由列（业务表 `rejection_reason` 是
    /// 本域既有专列，维持原写入点不动）。
    async fn complete_rejection_bpm(
        &self,
        updated: &sales_quotation::Model,
        approver_id: i32,
        reason: &str,
    ) {
        if updated.approval_instance_id.is_none() {
            // 小额自批路径从未启动 BPM 流程，无任务可回写，属正常分支
            tracing::debug!(
                business_type = "quotation",
                business_id = updated.id,
                "报价拒绝 BPM 回写跳过：该单据未关联 BPM 实例（小额自批路径）"
            );
            return;
        }
        let bpm_service = BpmService::new(self.db.clone());
        let instance = match bpm_service
            .get_process_by_business("quotation", updated.id)
            .await
        {
            Ok(Some(instance)) => instance,
            Ok(None) => {
                tracing::warn!(
                    business_type = "quotation",
                    business_id = updated.id,
                    approval_instance_id = ?updated.approval_instance_id,
                    "报价拒绝 BPM 回写：业务单记录了实例 ID 但按单据查不到流程实例，拒绝理由未进 BPM，需人工对账"
                );
                return;
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    business_type = "quotation",
                    business_id = updated.id,
                    "报价拒绝 BPM 回写：查询流程实例失败，拒绝理由未进 BPM"
                );
                return;
            }
        };
        let tasks = match bpm_task::Entity::find()
            .filter(bpm_task::Column::InstanceId.eq(instance.id))
            .filter(bpm_task::Column::Status.eq(task_status::PENDING))
            .all(&*self.db)
            .await
        {
            Ok(tasks) => tasks,
            Err(e) => {
                tracing::error!(
                    error = %e,
                    business_type = "quotation",
                    business_id = updated.id,
                    instance_id = instance.id,
                    "报价拒绝 BPM 回写：查询待办任务失败，拒绝理由未进 BPM"
                );
                return;
            }
        };
        if tasks.is_empty() {
            tracing::warn!(
                business_type = "quotation",
                business_id = updated.id,
                instance_id = instance.id,
                expected_task_status = task_status::PENDING,
                "报价拒绝 BPM 回写：该实例下无状态为待处理的 bpm_task，拒绝理由未进 BPM，需人工对账"
            );
            return;
        }
        for task in tasks {
            // approve_task 的处理人取已认证操作人（user_id 参数），req.handler_* 不被消费
            if let Err(e) = bpm_service
                .approve_task(
                    crate::models::dto::bpm_dto::ApproveTaskRequest {
                        task_id: task.id,
                        handler_id: approver_id,
                        handler_name: String::new(),
                        action: REJECT_ACTION.to_string(),
                        approval_opinion: Some(reason.to_string()),
                        attachment_urls: None,
                    },
                    Some(approver_id),
                )
                .await
            {
                tracing::warn!(
                    error = %e,
                    task_id = task.id,
                    business_type = "quotation",
                    business_id = updated.id,
                    "BPM 报价单审批拒绝任务失败（不阻断已提交的业务状态）"
                );
                // is_err 审计条目 16：拒绝腿同款死信接入（payload 带拒绝理由）。
                self.write_bpm_dead_letter(
                    updated.id,
                    false,
                    approver_id,
                    Some(reason),
                    task.id,
                    REJECT_ACTION,
                    &e.to_string(),
                )
                .await;
            } else {
                tracing::info!(
                    task_id = task.id,
                    business_id = updated.id,
                    "报价拒绝 BPM 回写完成：任务已拒绝、理由已落 approval_opinion"
                );
            }
        }
    }
}
