//! finance 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, EntityTrait, Order, QueryFilter, QueryOrder};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 会计凭证打印数据：凭证主表 + 分录明细
    pub(super) async fn get_voucher_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::{voucher, voucher_item};

        let voucher = voucher::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("凭证 {} 未找到", id)))?;

        let items = voucher_item::Entity::find()
            .filter(voucher_item::Column::VoucherId.eq(id))
            .order_by(voucher_item::Column::LineNo, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "voucher_no".to_string(),
            serde_json::json!(voucher.voucher_no),
        );
        data.insert(
            "voucher_type".to_string(),
            serde_json::json!(voucher.voucher_type),
        );
        data.insert(
            "voucher_date".to_string(),
            serde_json::json!(voucher.voucher_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "source_module".to_string(),
            serde_json::json!(voucher.source_module.unwrap_or_default()),
        );
        data.insert(
            "source_bill_no".to_string(),
            serde_json::json!(voucher.source_bill_no.unwrap_or_default()),
        );
        data.insert("status".to_string(), serde_json::json!(voucher.status));
        data.insert(
            "workshop".to_string(),
            serde_json::json!(voucher.workshop.unwrap_or_default()),
        );

        let mut total_debit = rust_decimal::Decimal::ZERO;
        let mut total_credit = rust_decimal::Decimal::ZERO;
        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            total_debit += item.debit;
            total_credit += item.credit;
            let mut row = HashMap::new();
            row.insert(
                "line_no".to_string(),
                serde_json::json!(item.line_no.to_string()),
            );
            row.insert(
                "subject_code".to_string(),
                serde_json::json!(item.subject_code),
            );
            row.insert(
                "subject_name".to_string(),
                serde_json::json!(item.subject_name),
            );
            row.insert(
                "debit".to_string(),
                serde_json::json!(item.debit.to_string()),
            );
            row.insert(
                "credit".to_string(),
                serde_json::json!(item.credit.to_string()),
            );
            row.insert(
                "summary".to_string(),
                serde_json::json!(item.summary.unwrap_or_default()),
            );
            item_list.push(row);
        }
        data.insert(
            "total_debit".to_string(),
            serde_json::json!(total_debit.to_string()),
        );
        data.insert(
            "total_credit".to_string(),
            serde_json::json!(total_credit.to_string()),
        );

        Ok(PrintData {
            template: "voucher".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 应收账款收款单打印数据
    pub(super) async fn get_ar_collection_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::ar_collection;

        let record = ar_collection::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("应收账款收款单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "collection_no".to_string(),
            serde_json::json!(record.collection_no.clone()),
        );
        data.insert(
            "collection_date".to_string(),
            serde_json::json!(record.collection_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "customer_name".to_string(),
            serde_json::json!(record.customer_name.clone().unwrap_or_default()),
        );
        data.insert(
            "collection_amount".to_string(),
            serde_json::json!(record.collection_amount.to_string()),
        );
        data.insert(
            "collection_method".to_string(),
            serde_json::json!(record.collection_method.clone().unwrap_or_default()),
        );
        data.insert(
            "bank_account".to_string(),
            serde_json::json!(record.bank_account.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "ar_collection".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 应付账款付款单打印数据
    pub(super) async fn get_ap_payment_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::ap_payment;

        let record = ap_payment::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("应付账款付款单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "payment_no".to_string(),
            serde_json::json!(record.payment_no.clone()),
        );
        data.insert(
            "payment_date".to_string(),
            serde_json::json!(record.payment_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "payment_method".to_string(),
            serde_json::json!(record.payment_method.clone()),
        );
        data.insert(
            "payment_amount".to_string(),
            serde_json::json!(record.payment_amount.to_string()),
        );
        data.insert(
            "payment_status".to_string(),
            serde_json::json!(record.payment_status.clone()),
        );
        data.insert(
            "currency".to_string(),
            serde_json::json!(record.currency.clone()),
        );
        data.insert(
            "bank_name".to_string(),
            serde_json::json!(record.bank_name.clone().unwrap_or_default()),
        );
        data.insert(
            "bank_account".to_string(),
            serde_json::json!(record.bank_account.clone().unwrap_or_default()),
        );
        data.insert(
            "transaction_no".to_string(),
            serde_json::json!(record.transaction_no.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "ap_payment".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 应付发票打印数据
    pub(super) async fn get_ap_invoice_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::ap_invoice;

        let record = ap_invoice::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("应付发票 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "invoice_no".to_string(),
            serde_json::json!(record.invoice_no.clone()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "invoice_type".to_string(),
            serde_json::json!(record.invoice_type.clone()),
        );
        data.insert(
            "invoice_date".to_string(),
            serde_json::json!(record.invoice_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "due_date".to_string(),
            serde_json::json!(record.due_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "amount".to_string(),
            serde_json::json!(record.amount.to_string()),
        );
        data.insert(
            "paid_amount".to_string(),
            serde_json::json!(record.paid_amount.to_string()),
        );
        data.insert(
            "unpaid_amount".to_string(),
            serde_json::json!(record.unpaid_amount.to_string()),
        );
        data.insert(
            "invoice_status".to_string(),
            serde_json::json!(record.invoice_status.clone()),
        );
        data.insert(
            "currency".to_string(),
            serde_json::json!(record.currency.clone()),
        );
        data.insert(
            "tax_amount".to_string(),
            serde_json::json!(record.tax_amount.to_string()),
        );

        Ok(PrintData {
            template: "ap_invoice".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 付款申请单打印数据
    pub(super) async fn get_ap_payment_request_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::ap_payment_request;

        use crate::models::ap_payment_request_item;

        let record = ap_payment_request::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("付款申请单 {} 未找到", id)))?;

        let items = ap_payment_request_item::Entity::find()
            .filter(ap_payment_request_item::Column::RequestId.eq(id))
            .order_by(ap_payment_request_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "request_no".to_string(),
            serde_json::json!(record.request_no.clone()),
        );
        data.insert(
            "request_date".to_string(),
            serde_json::json!(record.request_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "payment_type".to_string(),
            serde_json::json!(record.payment_type.clone()),
        );
        data.insert(
            "payment_method".to_string(),
            serde_json::json!(record.payment_method.clone()),
        );
        data.insert(
            "request_amount".to_string(),
            serde_json::json!(record.request_amount.to_string()),
        );
        data.insert(
            "currency".to_string(),
            serde_json::json!(record.currency.clone()),
        );
        data.insert(
            "expected_payment_date".to_string(),
            serde_json::json!(
                record
                    .expected_payment_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "bank_name".to_string(),
            serde_json::json!(record.bank_name.clone().unwrap_or_default()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("invoice_id".to_string(), serde_json::json!(item.invoice_id));
            row.insert(
                "apply_amount".to_string(),
                serde_json::json!(item.apply_amount.to_string()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "ap_payment_request".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 应付对账单打印数据
    pub(super) async fn get_ap_reconciliation_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::ap_reconciliation;

        let record = ap_reconciliation::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("应付对账单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "reconciliation_no".to_string(),
            serde_json::json!(record.reconciliation_no.clone()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "start_date".to_string(),
            serde_json::json!(record.start_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "end_date".to_string(),
            serde_json::json!(record.end_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "opening_balance".to_string(),
            serde_json::json!(record.opening_balance.to_string()),
        );
        data.insert(
            "total_invoice".to_string(),
            serde_json::json!(record.total_invoice.to_string()),
        );
        data.insert(
            "total_payment".to_string(),
            serde_json::json!(record.total_payment.to_string()),
        );
        data.insert(
            "closing_balance".to_string(),
            serde_json::json!(record.closing_balance.to_string()),
        );
        data.insert(
            "reconciliation_status".to_string(),
            serde_json::json!(record.reconciliation_status.clone()),
        );

        Ok(PrintData {
            template: "ap_reconciliation".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 应收对账单打印数据
    pub(super) async fn get_ar_reconciliation_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::ar_reconciliation;

        let record = ar_reconciliation::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("应收对账单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "reconciliation_no".to_string(),
            serde_json::json!(record.reconciliation_no.clone()),
        );
        data.insert(
            "reconciliation_date".to_string(),
            serde_json::json!(record.reconciliation_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "period_start".to_string(),
            serde_json::json!(record.period_start.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "period_end".to_string(),
            serde_json::json!(record.period_end.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "customer_name".to_string(),
            serde_json::json!(record.customer_name.clone().unwrap_or_default()),
        );
        data.insert(
            "opening_balance".to_string(),
            serde_json::json!(record.opening_balance.to_string()),
        );
        data.insert(
            "total_invoices".to_string(),
            serde_json::json!(record.total_invoices.to_string()),
        );
        data.insert(
            "total_collections".to_string(),
            serde_json::json!(record.total_collections.to_string()),
        );
        data.insert(
            "closing_balance".to_string(),
            serde_json::json!(record.closing_balance.to_string()),
        );
        data.insert(
            "reconciliation_status".to_string(),
            serde_json::json!(record.reconciliation_status.clone()),
        );

        Ok(PrintData {
            template: "ar_reconciliation".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 坏账核销单打印数据
    pub(super) async fn get_bad_debt_writeoff_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::bad_debt_writeoff;

        let record = bad_debt_writeoff::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("坏账核销单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "ar_invoice_id".to_string(),
            serde_json::json!(record.ar_invoice_id),
        );
        data.insert(
            "writeoff_amount".to_string(),
            serde_json::json!(record.writeoff_amount.to_string()),
        );
        data.insert(
            "reason".to_string(),
            serde_json::json!(record.reason.clone()),
        );
        data.insert(
            "applicant_username".to_string(),
            serde_json::json!(record.applicant_username.clone()),
        );
        data.insert(
            "applicant_at".to_string(),
            serde_json::json!(record.applicant_at.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "approval_status".to_string(),
            serde_json::json!(record.approval_status.clone()),
        );
        data.insert(
            "finance_manager_comment".to_string(),
            serde_json::json!(record.finance_manager_comment.clone().unwrap_or_default()),
        );
        data.insert(
            "general_manager_comment".to_string(),
            serde_json::json!(record.general_manager_comment.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "bad_debt_writeoff".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 外汇核销单打印数据
    pub(super) async fn get_foreign_exchange_verification_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::foreign_exchange_verification;

        let record = foreign_exchange_verification::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("外汇核销单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "verification_no".to_string(),
            serde_json::json!(record.verification_no.clone()),
        );
        data.insert(
            "customs_declaration_id".to_string(),
            serde_json::json!(record.customs_declaration_id),
        );
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "verification_date".to_string(),
            serde_json::json!(record.verification_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "foreign_currency_amount".to_string(),
            serde_json::json!(record.foreign_currency_amount.to_string()),
        );
        data.insert(
            "rmb_amount".to_string(),
            serde_json::json!(record.rmb_amount.to_string()),
        );
        data.insert(
            "exchange_rate".to_string(),
            serde_json::json!(record.exchange_rate.to_string()),
        );
        data.insert(
            "bank_code".to_string(),
            serde_json::json!(record.bank_code.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "foreign_exchange_verification".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 出口退税申报单打印数据
    pub(super) async fn get_export_refund_declaration_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::export_refund_declaration;

        let record = export_refund_declaration::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("出口退税申报单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "declaration_no".to_string(),
            serde_json::json!(record.declaration_no.clone()),
        );
        data.insert(
            "period_year".to_string(),
            serde_json::json!(record.period_year),
        );
        data.insert(
            "period_month".to_string(),
            serde_json::json!(record.period_month),
        );
        data.insert(
            "declaration_date".to_string(),
            serde_json::json!(record.declaration_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "export_sales_amount".to_string(),
            serde_json::json!(record.export_sales_amount.to_string()),
        );
        data.insert(
            "refundable_vat_amount".to_string(),
            serde_json::json!(record.refundable_vat_amount.to_string()),
        );
        data.insert(
            "actual_refund_amount".to_string(),
            serde_json::json!(record.actual_refund_amount.to_string()),
        );
        data.insert(
            "refund_rate".to_string(),
            serde_json::json!(record.refund_rate.to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "export_refund_declaration".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }
}
