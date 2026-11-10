//! 应收对账 - 客户确认/争议（ar/vfy_ops/confirm）
//!
//! 批次 490 D10-4b 拆分自原 `ar/vfy.rs` 的 `customer_confirm` / `customer_dispute` 方法。
//! 职责：带状态机校验（lock_exclusive 串行化并发）的客户对账单确认与争议提交，
//! 审计日志经 `AuditLogService::update_with_audit` 写入；另提供开票前置门
//! `ensure_customer_statement_confirmed`（确认态由本模块写入，判定也归本模块，供开票各腿共用）。
//! 本模块扩展 `ArReconciliationService` 的 `customer_confirm`、`customer_dispute` 与
//! `ensure_customer_statement_confirmed` 公开方法。

use chrono::{NaiveDate, Utc};
use sea_orm::{
    ColumnTrait, Condition, ConnectionTrait, EntityTrait, QueryFilter, QuerySelect, Set,
    TransactionTrait,
};
use tracing::{info, warn};

use crate::models::ar_reconciliation::{
    ActiveModel, Column as ReconciliationColumn, Entity as ReconciliationEntity,
};
use crate::models::status::ar as ar_status;
use crate::utils::error::AppError;

use super::super::ArReconciliationService;

impl ArReconciliationService {
    /// 客户确认对账单（带状态校验）
    /// 批次 27 v7 P0 修复：状态机 lock_exclusive 补全，串行化并发状态变更；原实现完全无 txn 无 lock，两并发 customer_confirm 同时通过状态门后基于过期状态写入，；导致 confirmed_by/confirmed_at 被覆盖、审计日志完全丢失（未走 update_with_audit）。
    pub async fn customer_confirm(
        &self,
        id: i32,
        user_id: i32,
    ) -> Result<crate::models::ar_reconciliation::Model, AppError> {
        let txn = (*self.db).begin().await?;

        let model = ReconciliationEntity::find_by_id(id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("对账单不存在"))?;

        let status = model
            .reconciliation_status
            .as_deref()
            .unwrap_or(ar_status::RECONCILIATION_DRAFT);
        let target_status = Self::check_customer_confirm_status(status)?;

        let mut active_model: ActiveModel = model.into();
        active_model.reconciliation_status = Set(Some(target_status.to_string()));
        active_model.confirmed_by_customer = Set(Some(true));
        active_model.confirmed_by = Set(Some(user_id));
        active_model.confirmed_at = Set(Some(Utc::now()));
        active_model.updated_at = Set(Utc::now());

        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            active_model,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;

        info!("客户确认对账单成功：id={}", id);
        Ok(updated)
    }

    /// 客户提出争议（带状态校验）
    /// 批次 27 v7 P0 修复：状态机 lock_exclusive 补全，串行化并发状态变更；原实现完全无 txn 无 lock，两并发 customer_dispute 同时通过状态门后基于过期状态写入，；导致 dispute_reason 被覆盖、审计日志完全丢失（未走 update_with_audit）。
    pub async fn customer_dispute(
        &self,
        id: i32,
        reason: String,
        user_id: i32,
    ) -> Result<crate::models::ar_reconciliation::Model, AppError> {
        let txn = (*self.db).begin().await?;

        let model = ReconciliationEntity::find_by_id(id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("对账单不存在"))?;

        let status = model
            .reconciliation_status
            .as_deref()
            .unwrap_or(ar_status::RECONCILIATION_DRAFT);
        let target_status = Self::check_customer_dispute_status(status)?;

        let mut active_model: ActiveModel = model.into();
        active_model.reconciliation_status = Set(Some(target_status.to_string()));
        active_model.dispute_reason = Set(Some(reason.clone()));
        active_model.updated_at = Set(Utc::now());

        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            active_model,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;

        info!("客户对账单提出争议：id={}, reason={}", id, reason);
        Ok(updated)
    }

    /// 客户确认状态门（纯状态判定，不触 DB，生产与集成测试同源调用）：
    /// confirmed 拒绝重复确认，disputed 需先解决争议；其余状态放行并返回目标状态常量
    /// RECONCILIATION_CONFIRMED。两条拒绝都点名唯一可放行的前置（已确认行不可再确认、
    /// 争议行须先解争议），文案只述公开规则与行自身状态，不含标识，走
    /// `AppError::business_displayable` 外显，机器码仍是 BUSINESS_ERROR。
    pub fn check_customer_confirm_status(status: &str) -> Result<&'static str, AppError> {
        if status == ar_status::RECONCILIATION_CONFIRMED {
            return Err(AppError::business_displayable(
                "对账单已确认，不可重复确认".to_string(),
            ));
        }
        if status == ar_status::RECONCILIATION_DISPUTED {
            return Err(AppError::business_displayable(
                "对账单存在争议，请先解决争议后再确认".to_string(),
            ));
        }
        Ok(ar_status::RECONCILIATION_CONFIRMED)
    }

    /// 客户争议状态门（纯状态判定，不触 DB，生产与集成测试同源调用）：
    /// confirmed 不可提争议，closed 不可提争议；其余状态放行并返回目标状态常量
    /// RECONCILIATION_DISPUTED。两条拒绝各自点名不可提争议的前置状态，
    /// 文案只述公开规则与行自身状态，走 `AppError::business_displayable` 外显，
    /// 机器码仍是 BUSINESS_ERROR。
    pub fn check_customer_dispute_status(status: &str) -> Result<&'static str, AppError> {
        if status == ar_status::RECONCILIATION_CONFIRMED {
            return Err(AppError::business_displayable(
                "对账单已确认，不可提出争议".to_string(),
            ));
        }
        if status == ar_status::RECONCILIATION_CLOSED {
            return Err(AppError::business_displayable(
                "对账单已关闭，不可提出争议".to_string(),
            ));
        }
        Ok(ar_status::RECONCILIATION_DISPUTED)
    }

    /// 开票前置门：客户未确认对账单，财务不得开票。
    ///
    /// 入参 customer_id 为待开票客户，invoice_date 为即将落 ar_invoices 的开票日期；
    /// 调用方为 `services/ar_invoice_service::create`（手工开票腿）与
    /// `services/ar/inv.rs::create_receivable`（销售发货生成应收腿），两腿都在自己的事务内调用，
    /// 故连接按泛型收 `ConnectionTrait`（DatabaseConnection 与 DatabaseTransaction 同源复用），
    /// 不在门内另开事务、也不做后置过滤。
    ///
    /// 判定口径（只读 reconciliation_status 与 confirmed_by_customer 两列，两列的写入方都在本模块）：
    /// 取该客户期间覆盖本次开票日期的对账单，命中「已发出待客户确认（sent）」「客户已提异议
    /// （disputed）」「状态词已是 confirmed 但 confirmed_by_customer 非真（含 NULL，即伪造确认态）」
    /// 三者之一即拒绝。draft（尚未送客户，未进入客户确认环节）与 closed、cancelled
    /// （该期已终结，不再等客户回执）不构成阻塞；无覆盖本期的对账单即无待确认事项，放行。
    ///
    /// 拒绝走 `AppError::business_displayable`（BUSINESS_ERROR，文案可外显），点名阻塞的对账单号，
    /// 让操作人知道要去确认哪一张；不做 fail-open，不把缺行兜底成已确认或未确认。
    /// 成功与阻塞各打一条日志（阻塞为 warn，便于按客户回查未确认就开票的尝试）。
    pub async fn ensure_customer_statement_confirmed<C: ConnectionTrait>(
        conn: &C,
        customer_id: i32,
        invoice_date: NaiveDate,
    ) -> Result<(), AppError> {
        let blocking = ReconciliationEntity::find()
            .filter(ReconciliationColumn::CustomerId.eq(customer_id))
            .filter(ReconciliationColumn::PeriodStart.lte(invoice_date))
            .filter(ReconciliationColumn::PeriodEnd.gte(invoice_date))
            .filter(
                Condition::any()
                    .add(ReconciliationColumn::ReconciliationStatus.is_in([
                        ar_status::RECONCILIATION_SENT,
                        ar_status::RECONCILIATION_DISPUTED,
                    ]))
                    .add(
                        Condition::all()
                            .add(
                                ReconciliationColumn::ReconciliationStatus
                                    .eq(ar_status::RECONCILIATION_CONFIRMED),
                            )
                            // 确认标记为 false 或为 NULL 都算未取得客户确认：NULL 是三处初始化写入的
                            // 形态，直接写 ne(true) 会被 SQL 三值逻辑漏掉，故显式拆成两臂。
                            .add(
                                Condition::any()
                                    .add(ReconciliationColumn::ConfirmedByCustomer.eq(false))
                                    .add(ReconciliationColumn::ConfirmedByCustomer.is_null()),
                            ),
                    ),
            )
            .one(conn)
            .await?;

        if let Some(rec) = blocking {
            let status = rec
                .reconciliation_status
                .as_deref()
                .unwrap_or(ar_status::RECONCILIATION_DRAFT);
            warn!(
                "开票前置门拦截：客户 {} 的对账单 {}（期间 {} ~ {}）状态为 {}，尚未取得客户确认，拒绝开票（开票日期 {}）",
                customer_id,
                rec.reconciliation_no,
                rec.period_start,
                rec.period_end,
                status,
                invoice_date
            );
            return Err(AppError::business_displayable(format!(
                "对账单 {} 尚未取得客户确认，请先完成客户确认再开票",
                rec.reconciliation_no
            )));
        }

        info!(
            "开票前置门放行：客户 {} 无未经客户确认的覆盖期对账单（开票日期 {}）",
            customer_id, invoice_date
        );
        Ok(())
    }
}
