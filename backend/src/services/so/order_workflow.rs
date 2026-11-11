//! 销售订单工作流子模块（order_workflow）
//!
//! P9-2 拆分自原 `services/so/order.rs`。
//! 包含：cancel_order / submit_order / approve_order / complete_order
//!
//! ## 模块职责
//! - 销售订单审批流（草稿→待审→已审→已发货→已收款→已关闭）
//! - 状态机转换合法性校验
//! - 工作流日志（操作人/时间/原因）
//! - BPM 流程集成（提交/审批触发 BPM 服务）
//!
//! ## API 兼容
//! 通过 `crate::services::so::order::SalesService` 路径访问。

use super::SalesOrderDetail;
use super::order::SalesService;
use crate::middleware::audit_context::{RISK_VOID, mark_audit_high_risk, set_audit_doc_no};
use crate::models::sales_order;
use crate::models::sales_order::Entity as SalesOrderEntity;
use crate::models::status::sales_order as so_status;
// 批次 212 P2-5 修复（v12 复审）：硬编码 "active" 替换为 master_data 常量
use crate::models::status::master_data;
use crate::services::bpm_ops::{bpm_start_failure_error, process_key};
use crate::utils::error::AppError;
use sea_orm::{EntityTrait, QuerySelect, TransactionTrait};

impl SalesService {
    // cancel_order / submit_order / approve_order / complete_order
    // 内容来自原 order.rs L815-840 + L898-978 + L979-1013 + L1014-1029

    /// 取消销售订单，事务内释放已占用的信用额度。
    ///
    /// 功能：行锁读单→状态门→若 credit 已占用则事务内释放→写 CANCELLED→commit→发事件。
    /// 调用方：handlers/sales_order_handler.rs cancel 端点。
    /// 入参：order_id——待取消订单；user_id——操作人。
    /// 传给谁：拒绝经 AppError 透传；成功后发布 SalesOrderCancelled 事件。
    /// 存什么·存哪里：sales_orders.status→cancelled；customer_credit_ratings.used_credit/available_credit 归还。
    pub async fn cancel_order(
        &self,
        order_id: i32,
        user_id: i32,
    ) -> Result<SalesOrderDetail, AppError> {
        let txn = (*self.db).begin().await?;

        let order = SalesOrderEntity::find_by_id(order_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("订单不存在"))?;

        if ![
            so_status::DRAFT,
            so_status::PENDING,
            so_status::APPROVED,
            so_status::PARTIAL_SHIPPED,
        ]
        .contains(&order.status.as_str())
        {
            return Err(AppError::business_displayable(
                "当前状态不允许取消，只有草稿、待审批、已审批或部分发货状态的订单可以取消",
            ));
        }

        // 信用释放：仅 PENDING/APPROVED/PARTIAL_SHIPPED 有占用（占用发生在 submit）
        if order.status != so_status::DRAFT {
            let total_amount = order
                .total_amount
                .to_string()
                .parse::<rust_decimal::Decimal>()
                .unwrap_or_else(|_| rust_decimal::Decimal::from(0));
            let credit_service =
                crate::services::customer_credit_service::CustomerCreditService::new(
                    self.db.clone(),
                );
            credit_service
                .release_credit_txn(&txn, order.customer_id, total_amount, user_id)
                .await?;
        }

        // 更新订单状态（改用 update_with_audit 写入审计日志，传 &txn 纳入事务保证原子性）
        let customer_id = order.customer_id;
        // 审计定位维度登记：单号取本次真正被作废那张单的 sales_orders.order_no 列（就是上面
        // 行锁读出的这一行），不从路径 ID 反推、不用 ID 拼号。必须在 update_with_audit 之前调用
        // ——写入单点从 task-local 的活上下文取快照，本函数由 handlers/sales_order_handler.rs
        // 在同一请求 task 内 await（不经 tokio::spawn），故此处写入的值即落库时读到的值；
        // 一旦把落库挪进 spawn 子任务，task-local 不随任务传播，本登记会静默失效。
        set_audit_doc_no(Some(order.order_no.clone()));
        // 取消动作把订单写进 cancelled 终态，语义是作废而非删除，标 VOID
        mark_audit_high_risk(RISK_VOID);
        let mut order_update: sales_order::ActiveModel = order.into();
        order_update.status = sea_orm::ActiveValue::Set(so_status::CANCELLED.to_string());
        order_update.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());

        crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            order_update,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;

        crate::services::event_bus::EVENT_BUS.publish(
            crate::services::event_bus::BusinessEvent::SalesOrderCancelled {
                order_id,
                customer_id,
                user_id,
            },
        );

        self.get_order_detail(order_id, None).await
    }

    /// 提交销售订单（草稿→待审），信用额度校验与占用均在提交事务内完成。
    ///
    /// 功能：行锁读单→状态门→信用门检查→事务内占用→客户启用门→写状态→commit。
    /// 调用方：handlers/sales_order_handler.rs submit 端点。
    /// 入参：order_id——待提交订单；user_id——操作人。
    /// 传给谁：拒绝经 AppError 透传给出参；成功后触发 BPM 审批与提交事件。
    /// 存什么·存哪里：sales_orders.status→pending；customer_credit_ratings.used_credit/available_credit 更新。
    pub async fn submit_order(
        &self,
        order_id: i32,
        user_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        let txn = (*self.db).begin().await?;

        let order = self.lookup_order_for_submit(&txn, order_id).await?;
        self.validate_order_status(&order)?;

        let total_amount_decimal = order
            .total_amount
            .to_string()
            .parse::<rust_decimal::Decimal>()
            .unwrap_or_else(|_| rust_decimal::Decimal::from(0));
        self.validate_customer_credit(&txn, order.customer_id, total_amount_decimal)
            .await?;
        self.validate_customer_active(&txn, order.customer_id)
            .await?;

        let credit_service =
            crate::services::customer_credit_service::CustomerCreditService::new(self.db.clone());
        credit_service
            .occupy_credit_txn(&txn, order.customer_id, total_amount_decimal, user_id)
            .await?;

        let order = self.update_order_to_pending(&txn, order, user_id).await?;
        txn.commit().await?;

        self.check_credit_warning(order.customer_id).await;
        self.start_bpm_process(order_id, user_id, &order.order_no)
            .await?;
        self.publish_submitted_event(order_id, order.customer_id, user_id);

        Ok(order)
    }

    async fn lookup_order_for_submit(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        order_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        SalesOrderEntity::find_by_id(order_id)
            .lock_exclusive()
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售订单 {} 不存在", order_id)))
    }

    /// 提交前的订单状态门。
    ///
    /// 功能：仅草稿状态允许提交，其余状态拒绝并回显当前状态。
    /// 调用方：同文件 submit_order。
    /// 入参：order——已加行锁读出的销售订单行。
    /// 传给谁：拒绝错误经 submit_order 透传给 handlers/sales_order_handler.rs 出参。
    /// 存什么·存哪里：只读校验，不落数据。
    fn validate_order_status(&self, order: &sales_order::Model) -> Result<(), AppError> {
        if order.status != so_status::DRAFT {
            // 拒绝原因可外显：只回显本订单自身状态值，不含金额/数量/内部 ID，
            // 满足 utils/error.rs 安全边界；操作员需要知道为什么不能提交。
            return Err(AppError::business_displayable(format!(
                "订单状态为 {}，无法提交，只有草稿状态的订单可以提交",
                order.status
            )));
        }
        Ok(())
    }

    /// 提交前的客户信用额度门。
    ///
    /// 功能：在订单提交事务内检查该客户可用信用是否覆盖订单总额，不足则拒绝提交。
    /// 调用方：同文件 submit_order。
    /// 入参：txn——订单提交事务；customer_id——订单客户；total_amount——订单总额。
    /// 传给谁：查询交 CustomerCreditService::check_credit_available_txn（同事务读，
    ///       防 TOCTOU）；拒绝错误经 submit_order 透传给 handlers/sales_order_handler.rs。
    /// 存什么·存哪里：只读校验，不落数据。
    async fn validate_customer_credit(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        customer_id: i32,
        total_amount: rust_decimal::Decimal,
    ) -> Result<(), AppError> {
        let credit_service =
            crate::services::customer_credit_service::CustomerCreditService::new(self.db.clone());
        // 检查本身的失败（如库查询故障）原样透传：由责任族的 AppError 决定状态码与
        // 脱敏，不得压制成 business(400) 替数据库失败改口。
        let credit_available = credit_service
            .check_credit_available_txn(txn, customer_id, total_amount)
            .await?;
        if !credit_available {
            // 拒绝原因可外显：只陈述定性规则与下一步动作，不含额度数字、可用余额、
            // 未付金额或任何记录 ID（utils/error.rs 安全边界；同信用域先例
            // customer_credit_limit.rs 的"客户仍有占用额度，无法停用"）。
            return Err(AppError::business_displayable(
                "信用额度不足，无法提交订单，请先处理该客户的信用额度后重新提交",
            ));
        }
        Ok(())
    }

    /// 提交前的客户启用状态门。
    ///
    /// 功能：仅启用状态的客户允许提交订单。
    /// 调用方：同文件 submit_order。
    /// 入参：txn——订单提交事务；customer_id——订单客户。
    /// 传给谁：拒绝错误经 submit_order 透传给 handlers/sales_order_handler.rs 出参。
    /// 存什么·存哪里：只读校验，不落数据。
    async fn validate_customer_active(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        customer_id: i32,
    ) -> Result<(), AppError> {
        let customer = crate::models::customer::Entity::find_by_id(customer_id)
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found("客户不存在"))?;
        if customer.status != master_data::ACTIVE {
            // 拒绝原因可外显：只回显本客户状态值与动作指引，不含数量/金额/记录 ID，
            // 满足 utils/error.rs 安全边界。
            return Err(AppError::business_displayable(format!(
                "客户状态为 {}，不允许提交订单，请先将该客户恢复为启用状态",
                customer.status
            )));
        }
        Ok(())
    }

    async fn update_order_to_pending(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        order: sales_order::Model,
        user_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        let mut order_update: sales_order::ActiveModel = order.into();
        order_update.status = sea_orm::ActiveValue::Set(so_status::PENDING.to_string());
        order_update.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());

        crate::services::audit_log_service::AuditLogService::update_with_audit(
            txn,
            "auto_audit",
            order_update,
            Some(user_id),
        )
        .await
    }

    async fn start_bpm_process(
        &self,
        order_id: i32,
        user_id: i32,
        order_no: &str,
    ) -> Result<(), AppError> {
        let bpm_service = crate::services::bpm_service::BpmService::new(self.db.clone());
        if let Err(e) = bpm_service
            .start_process(crate::models::dto::bpm_dto::StartProcessRequest {
                process_key: process_key::SALES_ORDER_APPROVAL.to_string(),
                business_type: "sales_order".to_string(),
                // 来源主键 sales_order.id 为 i32，bpm business_id 已拓宽为 i64，无损加宽
                business_id: i64::from(order_id),
                title: format!("销售订单审批 - {}", order_no),
                initiator_id: user_id,
                initiator_name: String::new(),
                initiator_department_id: None,
                priority: None,
                form_data: None,
                variables: None,
            })
            .await
        {
            // 补偿回滚失败不得顶替 BPM 启动失败的出参文案（回滚错误多为脱敏族，
            // 直接上抛会让用户看不到根因指引、也看不到单据真实状态）；两条根因
            // 分别全量落 error 日志，出参陈述已确认的处置结果。
            let document_state = match self.rollback_order_to_draft(order_id, user_id).await {
                Ok(()) => "订单已退回草稿状态",
                Err(rb_err) => {
                    tracing::error!(
                        error = %rb_err,
                        order_id = order_id,
                        user_id = user_id,
                        process_key = process_key::SALES_ORDER_APPROVAL,
                        business_type = "sales_order",
                        business_id = order_id,
                        "销售订单审批 BPM 启动失败后的补偿回滚也失败，订单可能仍停留在待审批状态，需人工核对"
                    );
                    "订单状态回退失败，可能仍为待审批，请按订单当前状态核对处理"
                }
            };
            // 审批流引擎的真实失败原文可能含流程定义/SQL/内部路径细节，按
            // utils/error.rs 安全边界只进日志，不得拼进出参文案。
            tracing::error!(
                order_id = order_id,
                user_id = user_id,
                error = %e,
                process_key = process_key::SALES_ORDER_APPROVAL,
                business_type = "sales_order",
                business_id = order_id,
                "销售订单审批流程启动失败，根因如上，仅进日志不外显"
            );
            return Err(bpm_start_failure_error(
                process_key::SALES_ORDER_APPROVAL,
                document_state,
                &e,
            ));
        }
        Ok(())
    }

    async fn rollback_order_to_draft(&self, order_id: i32, user_id: i32) -> Result<(), AppError> {
        tracing::error!(
            order_id = order_id,
            "BPM 启动销售订单审批流程失败，开始补偿回滚订单状态与信用占用"
        );

        let compensating_txn = (*self.db).begin().await?;
        let order_for_rollback = SalesOrderEntity::find_by_id(order_id)
            .lock_exclusive()
            .one(&compensating_txn)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!("补偿回滚时销售订单 {} 不存在", order_id))
            })?;

        let customer_id = order_for_rollback.customer_id;
        let total_amount = order_for_rollback
            .total_amount
            .to_string()
            .parse::<rust_decimal::Decimal>()
            .unwrap_or_else(|_| rust_decimal::Decimal::from(0));

        let mut rollback_model: sales_order::ActiveModel = order_for_rollback.into();
        rollback_model.status = sea_orm::ActiveValue::Set(so_status::DRAFT.to_string());
        rollback_model.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());
        crate::services::audit_log_service::AuditLogService::update_with_audit(
            &compensating_txn,
            "auto_audit",
            rollback_model,
            Some(user_id),
        )
        .await?;

        let credit_service =
            crate::services::customer_credit_service::CustomerCreditService::new(self.db.clone());
        credit_service
            .release_credit_txn(&compensating_txn, customer_id, total_amount, user_id)
            .await?;

        compensating_txn.commit().await?;

        Ok(())
    }

    fn publish_submitted_event(&self, order_id: i32, customer_id: i32, user_id: i32) {
        crate::services::event_bus::EVENT_BUS.publish(
            crate::services::event_bus::BusinessEvent::SalesOrderSubmitted {
                order_id,
                customer_id,
                user_id,
            },
        );
    }

    /// 审核订单（无审批理由形态）：BPM 回调等不携带通过理由的调用走本门面，
    /// 委托 approve_order_with_reason 并传 None——approval_reason 列保持 NULL
    /// （未采集），不伪造成空串。
    pub async fn approve_order(
        &self,
        order_id: i32,
        user_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        self.approve_order_with_reason(order_id, user_id, None)
            .await
    }

    /// 审核订单：通过或拒绝（可携带选填通过理由）。
    /// 入参 reason 为 handler 归一后的选填理由：Some 才 Set 进 approval_reason
    /// 专列，None 不 Set（列保持 NULL=未采集）；空/纯空白归一在 handler 侧完成。
    /// 事务边界：begin → lock_exclusive 行锁读单 → 状态门 → update_with_audit
    /// 单条 UPDATE（状态三件套与理由同写一行）→ commit；理由写入失败即整体
    /// 回滚，不存在"已批准但理由缺失"的半程态。
    /// 调用方：sales_order_handler approve 端点（带理由）、approve_order 门面（无理由）。
    pub async fn approve_order_with_reason(
        &self,
        order_id: i32,
        user_id: i32,
        reason: Option<String>,
    ) -> Result<sales_order::Model, AppError> {
        // 事务包裹"查询 + 状态检查 + update_with_audit"，
        // 加 lock_exclusive 防止并发审批同一订单导致重复审批或字段覆盖
        let txn = (*self.db).begin().await?;

        let order = self.lookup_order_for_approval(&txn, order_id).await?;
        self.validate_order_for_approval(&order)?;
        let order = self
            .update_order_to_approved(&txn, order, user_id, reason)
            .await?;

        txn.commit().await?;

        // B-P1-4 修复（批次 361 v13 复审）：commit 后发布 SalesOrderApproved 事件
        self.publish_approval_event(order_id, order.customer_id, user_id);

        Ok(order)
    }

    async fn lookup_order_for_approval(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        order_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        SalesOrderEntity::find_by_id(order_id)
            .lock_exclusive()
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售订单 {} 不存在", order_id)))
    }

    /// 审核前的订单状态门。
    ///
    /// 功能：仅待审批状态允许审核，其余状态拒绝并说明单据要处于什么状态才能审核。
    /// 调用方：同文件 approve_order_with_reason。
    /// 入参：order——事务内行锁读出的销售订单行。
    /// 传给谁：拒绝错误经 approve_order_with_reason 透传给 handlers/sales_order_handler.rs 出参。
    /// 存什么·存哪里：只读校验，不落数据。
    fn validate_order_for_approval(&self, order: &sales_order::Model) -> Result<(), AppError> {
        if order.status != so_status::PENDING {
            // 拒绝原因可外显：只点名业务动作与允许审核的订单状态（公开业务规则），
            // 回显的是前端状态文案词表里的中文名，不含状态机英文取值、订单号、金额与
            // 任何记录 ID，满足 utils/error.rs 安全边界；口径与同文件提交门与取消门一致，
            // 操作员需要知道为什么不能审核、以及单据要处于什么状态才能审核。
            return Err(AppError::business_displayable(
                "当前状态不允许审核，只有待审批状态的订单可以审核",
            ));
        }
        Ok(())
    }

    /// 在已有事务 + 行锁内把订单写为已审核：status/approved_by/approved_at 三件套
    /// 与选填通过理由同一 ActiveModel 单条 UPDATE 落 sales_orders 表；reason 为
    /// Some 才 Set approval_reason 列（None 保持 NULL，不覆写为初值）。
    async fn update_order_to_approved(
        &self,
        txn: &sea_orm::DatabaseTransaction,
        order: sales_order::Model,
        user_id: i32,
        reason: Option<String>,
    ) -> Result<sales_order::Model, AppError> {
        let mut order_update: sales_order::ActiveModel = order.into();
        order_update.status = sea_orm::ActiveValue::Set(so_status::APPROVED.to_string());
        order_update.approved_by = sea_orm::ActiveValue::Set(Some(user_id));
        order_update.approved_at = sea_orm::ActiveValue::Set(Some(chrono::Utc::now()));
        order_update.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());
        if let Some(reason) = reason {
            order_update.approval_reason = sea_orm::ActiveValue::Set(Some(reason));
        }

        // P1-11 修复（2026-06-25 综合审计）：传入真实操作人 ID，
        // 原 Some(0) 硬编码导致审计日志无法追溯审批人。
        crate::services::audit_log_service::AuditLogService::update_with_audit(
            txn,
            "auto_audit",
            order_update,
            Some(user_id),
        )
        .await
    }

    fn publish_approval_event(&self, order_id: i32, customer_id: i32, user_id: i32) {
        crate::services::event_bus::EVENT_BUS.publish(
            crate::services::event_bus::BusinessEvent::SalesOrderApproved {
                order_id,
                customer_id,
                user_id,
            },
        );
    }

    /// 完成订单（P1-11 修复（2026-06-25 综合审计）：新增 user_id 参数，；原 Some(0) 硬编码导致审计日志无法追溯完成操作人。）
    pub async fn complete_order(
        &self,
        order_id: i32,
        user_id: i32,
    ) -> Result<sales_order::Model, AppError> {
        // 批次 12（2026-06-28）：事务包裹"查询 + 状态检查 + update_with_audit"，
        // 加 lock_exclusive 防止并发完成同一订单导致状态不一致
        let txn = (*self.db).begin().await?;

        let order = SalesOrderEntity::find_by_id(order_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售订单 {} 不存在", order_id)))?;

        if ![so_status::SHIPPED, so_status::PARTIAL_SHIPPED].contains(&order.status.as_str()) {
            // 拒绝原因可外显：只点名业务动作与允许完成的订单状态（公开业务规则），
            // 回显的是前端状态文案词表里的中文名，不含状态机英文取值、订单号、金额与
            // 任何记录 ID，满足 utils/error.rs 安全边界；口径与同文件提交门与取消门一致，
            // 操作员需要知道为什么不能完成、以及单据要处于什么状态才能完成。
            return Err(AppError::business_displayable(
                "当前状态不允许完成订单，只有已发货或部分发货状态的订单可以完成",
            ));
        }

        let mut order_update: sales_order::ActiveModel = order.into();
        order_update.status = sea_orm::ActiveValue::Set(so_status::COMPLETED.to_string());
        order_update.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now());

        // P1-11 修复：传入真实操作人 ID
        let order = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &txn,
            "auto_audit",
            order_update,
            Some(user_id),
        )
        .await?;

        txn.commit().await?;

        // B-P1-4 修复（批次 361 v13 复审）：commit 后发布 SalesOrderCompleted 事件
        crate::services::event_bus::EVENT_BUS.publish(
            crate::services::event_bus::BusinessEvent::SalesOrderCompleted {
                order_id,
                customer_id: order.customer_id,
                user_id,
            },
        );

        Ok(order)
    }
}
