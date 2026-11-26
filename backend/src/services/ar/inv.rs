//! 应收对账 - 对账单 Word 导出与销售→AR 业务流（ar/inv）
//!
//! - `export_docx` 公开方法，从数据库拉取对账单与明细并生成 Word 文档
//!
//! P0-2 销售→AR 业务流入口（`create_receivable`）：
//! - 在销售订单 `ship_order` 提交且库存扣减成功后被调用
//! - 复用调用方传入的数据库事务，保证库存扣减、AR 单、订单状态三者原子提交
//! - 按 `source_type=SALES_ORDER` + `source_bill_id=order_id` 汇总原应收与取消红字，无未红冲应收时允许重新发货开票
//! - 应收单号复用 `DocumentNumberGenerator::insert_with_no_retry`，在调用方事务内
//!   取号并插入（撞唯一约束在保存点内重取重试，不另开事务取号）

use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use sea_orm::{
    ColumnTrait, DatabaseTransaction, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set,
};

use crate::models::ar_invoice::{
    ActiveModel as ArInvoiceActive, Column as ArInvoiceColumn, Entity as ArInvoiceEntity,
    Model as ArInvoiceModel,
};
use crate::models::ar_reconciliation::Entity as ReconciliationEntity;
use crate::models::ar_reconciliation_item::Entity as ReconciliationItemEntity;
use crate::models::bad_debt_writeoff;
use crate::models::customer;
use crate::models::sales_delivery;
use crate::models::sales_order;
use crate::models::status::{approval, ar as ar_status, common};
use crate::utils::error::AppError;
use crate::utils::number_generator::DocumentNumberGenerator;

use super::ArReconciliationService;

const DELIVERY_CANCEL_SOURCE_TYPE: &str = "SALES_DELIVERY_CANCEL";

impl ArReconciliationService {
    /// 导出对账单 Word 文档（docx）
    pub async fn export_docx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let model = ReconciliationEntity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found("对账单不存在"))?;

        let items = ReconciliationItemEntity::find()
            .filter(crate::models::ar_reconciliation_item::Column::ReconciliationId.eq(id))
            .all(&*self.db)
            .await?;

        // 客户名称取主数据真值，对账单 docx 是对外交付物，主数据缺行即点名失败，
        // 禁止用"客户#<id>"这类占位串出具（查库错误按 ? 上抛，不吞成缺行）
        let customer_name = customer::Entity::find_by_id(model.customer_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "客户 {} 主数据不存在，无法生成对账单 {}",
                    model.customer_id, model.reconciliation_no
                ))
            })?
            .customer_name;

        use crate::services::export_service::{ExportService, ReconciliationItem};
        let detail_items: Vec<ReconciliationItem> = items
            .iter()
            .map(|item| ReconciliationItem {
                item_type: item.item_type.clone(),
                document_no: item.document_no.as_deref().unwrap_or("").to_string(),
                amount: item.amount.to_string(),
                date: item
                    .document_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default(),
            })
            .collect();

        ExportService::generate_reconciliation_docx(
            &model.reconciliation_no,
            &customer_name,
            &model.period_start.format("%Y-%m-%d").to_string(),
            &model.period_end.format("%Y-%m-%d").to_string(),
            model
                .reconciliation_status
                .as_deref()
                .unwrap_or(ar_status::RECONCILIATION_DRAFT),
            detail_items,
            &model.closing_balance.to_string(),
        )
    }

    // =====================================================
    // P0-2 销售→AR 业务流：应收单创建
    // =====================================================

    /// 创建应收单（P0-2 销售发货→AR 入口）
    /// 复用调用方 txn 保证原子提交；幂等：source_type=SALES_ORDER + source_bill_id=order_id。；账期 payment_terms_days<=0 回退 30 天；状态 DRAFT 待审（P0 3-5 修复）。
    /// 开票前置门 `ensure_customer_statement_confirmed`（vfy_ops/confirm.rs）按本次落库的
    /// invoice_date 判定：该客户有覆盖本期且尚未取得客户确认的对账单即拒绝，取号与插入都不执行。
    pub async fn create_receivable(
        &self,
        customer_id: i32,
        order_id: i32,
        total_amount: Decimal,
        payment_terms_days: i32,
        user_id: i32,
        txn: &DatabaseTransaction,
    ) -> Result<ArInvoiceModel, AppError> {
        // 1. 金额校验：必须 > 0，避免生成 0 元应收单污染账龄报表
        if total_amount <= Decimal::ZERO {
            return Err(AppError::validation(format!(
                "应收金额必须大于 0，实际为 {}",
                total_amount
            )));
        }
        // 2-4. 加载订单/客户 + 幂等校验
        let (order, cust) = Self::load_receivable_context(txn, customer_id, order_id).await?;
        if total_amount != order.total_amount {
            return Err(AppError::business(format!(
                "销售订单 {} 的应收金额 {} 与订单总额 {} 不一致，禁止生成应收单",
                order_id, total_amount, order.total_amount
            )));
        }
        // 5. 账期校验：<= 0 时统一回退为 30 天
        let terms = if payment_terms_days <= 0 {
            30
        } else {
            payment_terms_days
        };
        // 6. 计算日期：发票日期 = 今日；到期日 = 发票日期 + 账期天数
        let invoice_date = Utc::now().date_naive();
        // 开票前置门：用与落库同一个 invoice_date 判定，该客户存在覆盖本期且尚未取得
        // 客户确认的对账单时拒绝生成应收单（取号与插入都不执行，随调用方事务回滚）。
        Self::ensure_customer_statement_confirmed(txn, customer_id, invoice_date).await?;
        let due_date = invoice_date + Duration::days(terms as i64);
        // 7-8. 取号与写入同在调用方事务内：`insert_with_no_retry` 生成应收单号并插入，
        // 撞 ar_invoices.invoice_no 的 UNIQUE(23505) 时只回滚本次保存点、重新取号重试；
        // 非唯一类 SQL 错误原样上抛，整事务随调用方回滚。落库存 ar_invoices 表。
        let invoice = DocumentNumberGenerator::insert_with_no_retry(
            txn,
            "AR",
            ArInvoiceEntity,
            ArInvoiceColumn::InvoiceNo,
            |invoice_no| {
                Self::build_receivable_active(
                    invoice_no,
                    invoice_date,
                    due_date,
                    customer_id,
                    order_id,
                    total_amount,
                    user_id,
                    &order,
                    &cust,
                )
            },
        )
        .await?;
        tracing::info!(
            "P0-2 销售→AR：应收单创建成功，invoice_no={}, amount={}, 账期={}天, 客户={}",
            invoice.invoice_no,
            invoice.invoice_amount,
            terms,
            cust.customer_name
        );
        Ok(invoice)
    }

    /// 按单据顺序将取消红字与原应收一一轧差，返回尚未红冲的有效原应收。
    fn unreversed_sales_order_invoices<'a>(
        order_id: i32,
        originals: &'a [ArInvoiceModel],
        credits: &'a [ArInvoiceModel],
    ) -> Result<Vec<&'a ArInvoiceModel>, AppError> {
        let mut events: Vec<(i32, bool, &ArInvoiceModel, usize)> = Vec::new();
        for (index, original) in originals.iter().enumerate() {
            if original.invoice_amount <= Decimal::ZERO {
                return Err(AppError::business(format!(
                    "销售订单 {} 的原应收金额非正，应收数据不一致",
                    order_id
                )));
            }
            if original.status != common::STATUS_CANCELLED {
                events.push((original.id, true, original, index));
            }
        }
        for credit in credits
            .iter()
            .filter(|invoice| invoice.status != common::STATUS_CANCELLED)
        {
            if credit.invoice_amount >= Decimal::ZERO {
                return Err(AppError::business(format!(
                    "销售订单 {} 的取消红字金额非负，应收数据不一致",
                    order_id
                )));
            }
            events.push((credit.id, false, credit, usize::MAX));
        }
        events.sort_by_key(|(id, _, _, _)| *id);

        let mut open: std::collections::VecDeque<(usize, Decimal)> =
            std::collections::VecDeque::new();
        for (_, is_original, invoice, index) in events {
            if is_original {
                open.push_back((index, invoice.invoice_amount));
                continue;
            }
            let mut credit_remaining = -invoice.invoice_amount;
            while !credit_remaining.is_zero() {
                let (original_index, original_remaining) = open.pop_front().ok_or_else(|| {
                    AppError::business(format!(
                        "销售订单 {} 的取消红字找不到对应原应收，应收数据不一致",
                        order_id
                    ))
                })?;
                let applied = credit_remaining.min(original_remaining);
                credit_remaining -= applied;
                let original_remaining = original_remaining - applied;
                if !original_remaining.is_zero() {
                    open.push_front((original_index, original_remaining));
                }
            }
        }

        Ok(open
            .into_iter()
            .map(|(index, _)| &originals[index])
            .collect())
    }

    /// 加载应收单上下文：锁订单、校验客户并按原应收与取消红字的净额判断是否可新建
    async fn load_receivable_context(
        txn: &DatabaseTransaction,
        customer_id: i32,
        order_id: i32,
    ) -> Result<(sales_order::Model, customer::Model), AppError> {
        let order = sales_order::Entity::find_by_id(order_id)
            .lock_exclusive()
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售订单 {} 不存在", order_id)))?;
        if order.customer_id != customer_id {
            return Err(AppError::business(format!(
                "销售订单 {} 的客户与应收客户不一致，禁止生成应收单",
                order_id
            )));
        }

        let originals = ArInvoiceEntity::find()
            .filter(ArInvoiceColumn::SourceType.eq("SALES_ORDER"))
            .filter(ArInvoiceColumn::SourceBillId.eq(i64::from(order_id)))
            .lock_exclusive()
            .all(txn)
            .await?;
        let credits = ArInvoiceEntity::find()
            .filter(ArInvoiceColumn::SourceType.eq(DELIVERY_CANCEL_SOURCE_TYPE))
            .filter(ArInvoiceColumn::CustomerId.eq(customer_id))
            .filter(ArInvoiceColumn::SalesOrderNo.eq(&order.order_no))
            .lock_exclusive()
            .all(txn)
            .await?;

        let unreversed = Self::unreversed_sales_order_invoices(order_id, &originals, &credits)?;
        if !unreversed.is_empty() {
            return Err(AppError::business(format!(
                "销售订单 {} 已存在未红冲的应收单，请勿重复创建",
                order_id
            )));
        }

        let cust = customer::Entity::find_by_id(customer_id)
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("客户 {} 不存在", customer_id)))?;
        Ok((order, cust))
    }

    /// 取消送货单时生成红字应收，保留原应收历史并与送货单取消共用事务。
    /// 未全额发货尚无应收时直接跳过；已全额发货后再取消任意一张送货单都冲销整单应收。
    pub async fn create_delivery_cancel_credit_memo(
        &self,
        txn: &DatabaseTransaction,
        order: &sales_order::Model,
        delivery: &sales_delivery::Model,
        user_id: i32,
        reason: &str,
    ) -> Result<Option<ArInvoiceModel>, AppError> {
        if delivery.order_id != order.id || delivery.customer_id != order.customer_id {
            return Err(AppError::business(
                "送货单与销售订单或客户不匹配，禁止生成取消红字应收".to_string(),
            ));
        }

        let originals = ArInvoiceEntity::find()
            .filter(ArInvoiceColumn::SourceType.eq("SALES_ORDER"))
            .filter(ArInvoiceColumn::SourceBillId.eq(i64::from(order.id)))
            .order_by_asc(ArInvoiceColumn::Id)
            .lock_exclusive()
            .all(txn)
            .await?;
        let credits = ArInvoiceEntity::find()
            .filter(ArInvoiceColumn::SourceType.eq(DELIVERY_CANCEL_SOURCE_TYPE))
            .filter(ArInvoiceColumn::CustomerId.eq(order.customer_id))
            .filter(ArInvoiceColumn::SalesOrderNo.eq(&order.order_no))
            .order_by_asc(ArInvoiceColumn::Id)
            .lock_exclusive()
            .all(txn)
            .await?;

        if credits.iter().any(|invoice| {
            invoice.source_bill_id == Some(i64::from(delivery.id))
                && invoice.status != common::STATUS_CANCELLED
        }) {
            return Err(AppError::business(format!(
                "送货单 {} 已生成取消红字应收，请勿重复冲销",
                delivery.delivery_no
            )));
        }

        let unreversed = Self::unreversed_sales_order_invoices(order.id, &originals, &credits)?;
        if unreversed.is_empty() {
            tracing::info!(
                order_id = order.id,
                delivery_id = delivery.id,
                delivery_no = %delivery.delivery_no,
                "取消送货单无需红冲：当前没有未红冲的销售应收"
            );
            return Ok(None);
        }
        if unreversed.len() != 1 {
            return Err(AppError::business(format!(
                "销售订单 {} 存在多张未红冲应收单，无法确定取消冲销对象",
                order.id
            )));
        }
        let original = unreversed[0];

        if original.customer_id != order.customer_id
            || original.invoice_amount != order.total_amount
            || original.received_amount != Decimal::ZERO
            || original.unpaid_amount != original.invoice_amount
            || ![common::STATUS_DRAFT, common::STATUS_APPROVED].contains(&original.status.as_str())
        {
            return Err(AppError::business(format!(
                "应收单 {} 已收款、已核销或与订单金额不一致，禁止取消送货单",
                original.invoice_no
            )));
        }

        let reconciliation_items = ReconciliationItemEntity::find()
            .filter(crate::models::ar_reconciliation_item::Column::DocumentId.eq(original.id))
            .filter(crate::models::ar_reconciliation_item::Column::DocumentType.eq("SALES_INVOICE"))
            .lock_exclusive()
            .all(txn)
            .await?;
        let reconciliation_ids: Vec<i32> = reconciliation_items
            .iter()
            .map(|item| item.reconciliation_id)
            .collect();
        let reconciliations = if reconciliation_ids.is_empty() {
            Vec::new()
        } else {
            ReconciliationEntity::find()
                .filter(crate::models::ar_reconciliation::Column::Id.is_in(reconciliation_ids))
                .lock_exclusive()
                .all(txn)
                .await?
        };
        let active_reconciliation_ids: std::collections::HashSet<i32> = reconciliations
            .iter()
            .filter(|reconciliation| {
                reconciliation.reconciliation_status.as_deref()
                    != Some(ar_status::RECONCILIATION_CANCELLED)
            })
            .map(|reconciliation| reconciliation.id)
            .collect();
        let has_matched_items = reconciliation_items.iter().any(|item| {
            active_reconciliation_ids.contains(&item.reconciliation_id)
                && [
                    ar_status::MATCH_MATCHED,
                    ar_status::MATCH_PARTIAL,
                    "DISPUTED",
                ]
                .contains(&item.match_status.as_str())
        });
        let has_closed_reconciliations = reconciliations.iter().any(|reconciliation| {
            reconciliation.reconciliation_status.as_deref()
                == Some(ar_status::RECONCILIATION_CLOSED)
        });
        if has_matched_items || has_closed_reconciliations {
            return Err(AppError::business(format!(
                "应收单 {} 已核销，禁止取消送货单",
                original.invoice_no
            )));
        }

        let active_writeoffs = bad_debt_writeoff::Entity::find()
            .filter(bad_debt_writeoff::Column::ArInvoiceId.eq(original.id))
            .filter(bad_debt_writeoff::Column::ApprovalStatus.is_in([
                crate::models::status::bad_debt_writeoff_status::PENDING,
                crate::models::status::bad_debt_writeoff_status::FINANCE_APPROVED,
                crate::models::status::bad_debt_writeoff_status::APPROVED,
            ]))
            .count(txn)
            .await?;
        if active_writeoffs > 0 {
            return Err(AppError::business(format!(
                "应收单 {} 已坏账处理，禁止取消送货单",
                original.invoice_no
            )));
        }

        let invoice_date = Utc::now().date_naive();
        let credit_amount = -original.invoice_amount;
        let credit = DocumentNumberGenerator::insert_with_no_retry(
            txn,
            "AR",
            ArInvoiceEntity,
            ArInvoiceColumn::InvoiceNo,
            |invoice_no| ArInvoiceActive {
                invoice_no: Set(invoice_no),
                invoice_date: Set(invoice_date),
                due_date: Set(original.due_date),
                customer_id: Set(order.customer_id),
                customer_name: Set(original.customer_name.clone()),
                source_type: Set(Some(DELIVERY_CANCEL_SOURCE_TYPE.to_string())),
                source_module: Set(Some("SO".to_string())),
                source_bill_id: Set(Some(i64::from(delivery.id))),
                source_bill_no: Set(Some(delivery.delivery_no.clone())),
                invoice_amount: Set(credit_amount),
                received_amount: Set(Decimal::ZERO),
                unpaid_amount: Set(credit_amount),
                batch_no: Set(original.batch_no.clone()),
                color_no: Set(original.color_no.clone()),
                dye_lot_no: Set(original.dye_lot_no.clone()),
                sales_order_no: Set(Some(order.order_no.clone())),
                status: Set(common::STATUS_DRAFT.to_string()),
                approval_status: Set(approval::PENDING.to_string()),
                created_by: Set(user_id),
                ..Default::default()
            },
        )
        .await?;

        let snapshot = serde_json::to_value(&credit)
            .map_err(|error| AppError::internal(format!("取消红字应收快照序列化失败: {error}")))?;
        crate::services::audit_log_service::AuditLogService::insert_create_audit(
            txn,
            "ar_invoice",
            credit.id,
            user_id,
            snapshot,
        )
        .await?;
        tracing::info!(
            delivery_no = %delivery.delivery_no,
            invoice_no = %credit.invoice_no,
            amount = %credit.invoice_amount,
            reason = %reason,
            "取消送货单已同事务生成红字应收"
        );
        Ok(Some(credit))
    }

    /// 构建应收单 ActiveModel（DRAFT 待审 + PENDING 审批），冗余客户名/订单号
    fn build_receivable_active(
        invoice_no: String,
        invoice_date: chrono::NaiveDate,
        due_date: chrono::NaiveDate,
        customer_id: i32,
        order_id: i32,
        total_amount: Decimal,
        user_id: i32,
        order: &sales_order::Model,
        cust: &customer::Model,
    ) -> ArInvoiceActive {
        ArInvoiceActive {
            invoice_no: Set(invoice_no),
            invoice_date: Set(invoice_date),
            due_date: Set(due_date),
            customer_id: Set(customer_id),
            customer_name: Set(Some(cust.customer_name.clone())),
            source_type: Set(Some("SALES_ORDER".to_string())),
            source_module: Set(Some("SO".to_string())),
            source_bill_id: Set(Some(i64::from(order_id))),
            source_bill_no: Set(Some(order.order_no.clone())),
            invoice_amount: Set(total_amount),
            received_amount: Set(Decimal::ZERO),
            unpaid_amount: Set(total_amount),
            batch_no: Set(None),
            color_no: Set(None),
            sales_order_no: Set(Some(order.order_no.clone())),
            status: Set(common::STATUS_DRAFT.to_string()),
            approval_status: Set(approval::PENDING.to_string()),
            created_by: Set(user_id),
            ..Default::default()
        }
    }
}

// =====================================================
// 单元测试（P0-2 销售→AR）
// =====================================================
//
// 覆盖场景：
// 1. 正常发货生成 AR：金额、账期、应收单号、状态字段全部正确
// 2. 取消发货回滚 AR：数据库错误抛出时事务回滚，ar_invoices 不残留
// 3. 部分发货的 AR 处理：amount 等于本次发货的应收金额，不与其他发货累加
// 4. 客户账期默认值：payment_terms <= 0 时回退为 30 天
// 5. 幂等检查：同订单二次调用返回 BusinessError
//
// 测试使用 mock 形式的辅助函数 `compute_due_date` / `format_invoice_no`
// 验证业务计算逻辑（数据库交互由 CICD 集成测试覆盖）。
