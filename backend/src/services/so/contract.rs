//! 销售合同/审批工作流服务（so/contract）
//!
//! 包含销售订单的拒绝等审批工作流方法。
//! submit_order / approve_order / complete_order 已在 so/order.rs 中实现，
//! 这里仅补充合同专属业务（驳回、释放库存预留等）。
//!
//! 拆分自原 `sales_service.rs`。

use crate::models::status::sales_order as so_status;
use crate::models::{customer, sales_order};
use crate::services::so::order::SalesService;
use crate::utils::error::AppError;
use sea_orm::{EntityTrait, QuerySelect, Set, TransactionTrait};

impl SalesService {
    /// 拒绝销售订单（PENDING→REJECTED），事务内释放已占用的信用额度。
    ///
    /// 功能：行锁读单→状态门（仅 PENDING）→释放库存预留→释放信用→写 REJECTED→commit→发事件。
    /// 调用方：handlers/sales_order_handler.rs reject 端点。
    /// 入参：order_id——待拒绝订单；reason——拒绝理由；user_id——操作人。
    /// 传给谁：失败经 AppError 透传给出参；成功后发布 SalesOrderRejected 事件。
    /// 存什么·存哪里：sales_orders.status→rejected + rejected_reason；customer_credit_ratings 归还占用。
    pub async fn reject_order(
        &self,
        order_id: i32,
        reason: String,
        user_id: i32,
    ) -> Result<(), AppError> {
        let txn = (*self.db).begin().await?;

        let order = sales_order::Entity::find_by_id(order_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("订单不存在"))?;

        if order.status != so_status::PENDING {
            return Err(AppError::business(format!(
                "订单状态为{}，不允许拒绝",
                order.status
            )));
        }

        let _customer = customer::Entity::find_by_id(order.customer_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("客户不存在"))?;

        self.release_reservations(order_id, &txn).await?;

        let total_amount = order
            .total_amount
            .to_string()
            .parse::<rust_decimal::Decimal>()
            .unwrap_or_else(|_| rust_decimal::Decimal::from(0));
        let credit_service =
            crate::services::customer_credit_service::CustomerCreditService::new(self.db.clone());
        credit_service
            .release_credit_txn(&txn, order.customer_id, total_amount, user_id)
            .await?;

        let customer_id_for_event = order.customer_id;
        let mut order_update: sales_order::ActiveModel = order.into();
        order_update.status = Set(so_status::REJECTED.to_string());
        order_update.rejected_reason = Set(Some(reason));
        order_update.updated_at = Set(chrono::Utc::now());
        crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            order_update,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;

        crate::services::event_bus::EVENT_BUS.publish(
            crate::services::event_bus::BusinessEvent::SalesOrderRejected {
                order_id,
                customer_id: customer_id_for_event,
                user_id,
            },
        );

        Ok(())
    }
}
