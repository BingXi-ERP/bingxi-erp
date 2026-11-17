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
            serde_json::json!(record
                .expected_payment_date
                .map(|d| d.format("%Y-%m-%d").to_string())
                .unwrap_or_default()),
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

    /// 应收对账单 xlsx 导出（规整表格版；缸号块合并版式待 xlsx 引擎富表格合并入干后升级）。
    /// 存什么：主表四账务字段与单据头 + 明细行（ar_reconciliation_items 全量）。
    /// 数据从哪来：复用 get_ar_reconciliation_print_data 的行级归属门取数（英文键），
    /// 明细由本函数按 reconciliation_id 全量补查。
    pub async fn build_ar_reconciliation_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ar_reconciliation_print_data(id).await?;
        use crate::models::ar_reconciliation_item;
        let items = ar_reconciliation_item::Entity::find()
            .filter(ar_reconciliation_item::Column::ReconciliationId.eq(id))
            .order_by_asc(ar_reconciliation_item::Column::Id)
            .all(&*self.db)
            .await?;

        let table = build_recon_xlsx_table(&print_data.data, &items, None);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 会计凭证 xlsx 导出。存什么：凭证头（类型/日期/状态/来源/车间）+ 分录明细行
    /// + 借贷合计 + 签审占位。数据从哪来：复用 get_voucher_print_data 既有装配
    /// （键名与 models/voucher*.rs 字段同名，金额为序列化字符串）。
    pub async fn build_voucher_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_voucher_print_data(id).await?;
        let table = build_voucher_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 应收账款收款单 xlsx 导出。存什么：收款头四要素（单号/日期/客户/金额）
    /// + 收款方式与银行账户 + 状态。数据从哪来：复用 get_ar_collection_print_data
    /// 既有装配（行级归属门在 get_print_data 入口由 handler 先行过门）。
    pub async fn build_ar_collection_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ar_collection_print_data(id).await?;
        let table = build_ar_collection_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 应付账款付款单 xlsx 导出。存什么：付款头（单号/日期/供应商/金额/币种）
    /// + 付款状态与交易流水号 + 收款行信息。数据从哪来：复用 get_ap_payment_print_data
    /// 既有装配。
    pub async fn build_ap_payment_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ap_payment_print_data(id).await?;
        let table = build_ap_payment_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 应付发票 xlsx 导出。存什么：发票头（单号/类型/日期/供应商）+ 三金额段
    /// （总额/已付/未付）与税额 + 发票状态。数据从哪来：复用
    /// get_ap_invoice_print_data 既有装配。
    pub async fn build_ap_invoice_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ap_invoice_print_data(id).await?;
        let table = build_ap_invoice_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 付款申请单 xlsx 导出。存什么：申请头（单号/日期/供应商/金额/币种/期望日期）
    /// + 关联发票明细（发票ID/申请金额）。数据从哪来：复用
    /// get_ap_payment_request_print_data 既有装配（明细随 PrintData.items 带出）。
    pub async fn build_ap_payment_request_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ap_payment_request_print_data(id).await?;
        let table = build_ap_payment_request_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 应付对账单 xlsx 导出。存什么：对账头（单号/期间/供应商）+ 四账务字段
    /// （期初/本期发票/本期付款/期末）+ 状态。数据从哪来：复用
    /// get_ap_reconciliation_print_data 既有装配。
    pub async fn build_ap_reconciliation_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ap_reconciliation_print_data(id).await?;
        let table = build_ap_reconciliation_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 坏账核销单 xlsx 导出。存什么：核销头（编号/客户/关联发票/金额）+ 核销原因
    /// + 两级审批意见。数据从哪来：复用 get_bad_debt_writeoff_print_data 既有装配；
    /// 该单据取数腿无单据号字段，标题编号由服务层按主键注入。
    pub async fn build_bad_debt_writeoff_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_bad_debt_writeoff_print_data(id).await?;
        let table = build_bad_debt_writeoff_xlsx_table(&print_data, &id.to_string());
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 外汇核销单 xlsx 导出。存什么：核销头（单号/日期/关联报关单与销售订单）
    /// + 外币/人民币/汇率三金额段 + 状态。数据从哪来：复用
    /// get_foreign_exchange_verification_print_data 既有装配。
    pub async fn build_foreign_exchange_verification_xlsx(
        &self,
        id: i32,
    ) -> Result<Vec<u8>, AppError> {
        let print_data = self
            .get_foreign_exchange_verification_print_data(id)
            .await?;
        let table = build_foreign_exchange_verification_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }

    /// 出口退税申报单 xlsx 导出。存什么：申报头（单号/期间/日期）+ 三税额段
    /// （出口销售额/应退增值税/实际退税额）与退税率 + 状态。数据从哪来：复用
    /// get_export_refund_declaration_print_data 既有装配。
    pub async fn build_export_refund_declaration_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_export_refund_declaration_print_data(id).await?;
        let table = build_export_refund_declaration_xlsx_table(&print_data);
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }
}

/// 对账明细 item_type 中文案（写入方词表见 models/ar_reconciliation_item.rs ItemType）。
fn recon_item_label(item_type: &str) -> &'static str {
    match item_type {
        "OPENING" => "期初余额",
        "INVOICE" => "销售发票",
        "RECEIPT" => "收款单",
        "ADJUSTMENT" => "调整",
        "DISPUTE" => "争议",
        _ => "其他",
    }
}

/// 匹配状态中文案（写入方词表 MatchStatus）。
fn recon_match_label(match_status: &str) -> &'static str {
    match match_status {
        "UNMATCHED" => "未匹配",
        "MATCHED" => "已匹配",
        "PARTIAL" => "部分匹配",
        "DISPUTED" => "争议中",
        "CANCELLED" => "已取消",
        _ => "其他",
    }
}

/// 组装应收对账单 xlsx 富表格（纯函数，可单测）。
/// 10 列基准，自由布局：标题 → 客户/日期 → 期间/部门 → 账务四字段 → 明细表头
/// → 明细行×N → 合计 → 大写金额 → 签收 → 质量条款。
/// `amount_in_words`：大写金额文案由调用方注入（金额大写工具车道合并后传 Some），
/// None 时该格留空，禁在本函数内造第二套大写实现。
fn build_recon_xlsx_table(
    data: &HashMap<String, serde_json::Value>,
    items: &[crate::models::ar_reconciliation_item::Model],
    amount_in_words: Option<&str>,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| {
        data.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    const COLS: u16 = 10;
    let title = format!("应收对账单 {}", get("reconciliation_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(vec![
        XlsxRichCell::merged(format!("客户名称：{}", get("customer_name")), 5),
        XlsxRichCell::merged(format!("对账日期：{}", get("reconciliation_date")), 5),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(
            format!("对账期间：{} ~ {}", get("period_start"), get("period_end")),
            5,
        ),
        XlsxRichCell::merged("部门：____________________", 5),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(format!("上单结余：{}", get("opening_balance")), 2).center(),
        XlsxRichCell::merged(format!("本期应收合计：{}", get("total_invoices")), 3).center(),
        XlsxRichCell::merged(format!("本期实收合计：{}", get("total_collections")), 3).center(),
        XlsxRichCell::merged(format!("期末欠款：{}", get("closing_balance")), 2).center(),
    ]);
    rows.push(vec![
        XlsxRichCell::new("类型").bold().center(),
        XlsxRichCell::new("单据号").bold().center(),
        XlsxRichCell::new("单据日期").bold().center(),
        XlsxRichCell::new("缸号").bold().center(),
        XlsxRichCell::new("色号").bold().center(),
        XlsxRichCell::new("匹号").bold().center(),
        XlsxRichCell::new("金额(元)").bold().center(),
        XlsxRichCell::new("已核销(元)").bold().center(),
        XlsxRichCell::new("匹配状态").bold().center(),
        XlsxRichCell::new("备注").bold().center(),
    ]);
    let mut total_amount = rust_decimal::Decimal::ZERO;
    let mut total_matched = rust_decimal::Decimal::ZERO;
    for item in items {
        total_amount += item.amount;
        total_matched += item.matched_amount.unwrap_or_default();
        rows.push(vec![
            XlsxRichCell::new(recon_item_label(&item.item_type)),
            XlsxRichCell::new(item.document_no.clone().unwrap_or_default()),
            XlsxRichCell::new(
                item.document_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default(),
            ),
            XlsxRichCell::new(item.dye_lot_no.clone().unwrap_or_default()),
            XlsxRichCell::new(item.color_no.clone().unwrap_or_default()),
            XlsxRichCell::new(item.piece_no.clone().unwrap_or_default()),
            XlsxRichCell::new(item.amount.to_string()),
            XlsxRichCell::new(
                item.matched_amount
                    .map(|m| m.to_string())
                    .unwrap_or_else(|| "0".to_string()),
            ),
            XlsxRichCell::new(recon_match_label(&item.match_status)),
            XlsxRichCell::new(item.remarks.clone().unwrap_or_default()),
        ]);
    }
    rows.push(vec![
        XlsxRichCell::merged("合计", 6).bold(),
        XlsxRichCell::new(total_amount.to_string()).bold(),
        XlsxRichCell::new(total_matched.to_string()).bold(),
        XlsxRichCell::merged("—", 2),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(
            format!("货款总计(大写)：{}", amount_in_words.unwrap_or_default()),
            5,
        ),
        XlsxRichCell::merged(format!("期末欠款(上期欠款)：{}", get("closing_balance")), 5),
    ]);
    rows.push(vec![
        XlsxRichCell::merged("制单：________________", 5),
        XlsxRichCell::merged("客户签收：________________", 5),
    ]);
    rows.push(vec![XlsxRichCell::merged(
        "注：请检查好本单货物，如发现质量问题请在三天内联系本行，逾期或裁剪，本布行恕不负责，谢谢合作!",
        COLS,
    )]);
    XlsxRichTable {
        sheet_name: "应收对账单".to_string(),
        rows,
        column_widths: Some(vec![
            12.0, 18.0, 12.0, 10.0, 10.0, 10.0, 12.0, 12.0, 10.0, 16.0,
        ]),
        column_count: Some(COLS),
        header_row: false,
    }
}

// ----------------------------------------------------------------------
// 表单类单据共用版式辅助（键值对四列网格）
// ----------------------------------------------------------------------

/// 从 PrintData 的字段映射取字符串值：字符串原样、标量 to_string、缺失/空为空串。
/// 键由本域取数腿装配（键名与 models 字段同名），缺键属取数腿缺陷、由取数腿自身
/// 保障，本函数不造第二份字段名也不填默认值。
fn cell_str(map: &HashMap<String, serde_json::Value>, key: &str) -> String {
    match map.get(key) {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(v) if !v.is_null() => v.to_string(),
        _ => String::new(),
    }
}

/// 四列表单行：标签列加粗居中，值列左对齐
fn form_row(
    label1: &str,
    value1: String,
    label2: &str,
    value2: String,
) -> Vec<crate::utils::xlsx_export::XlsxRichCell> {
    use crate::utils::xlsx_export::XlsxRichCell;
    vec![
        XlsxRichCell::new(label1).bold().center(),
        XlsxRichCell::new(value1),
        XlsxRichCell::new(label2).bold().center(),
        XlsxRichCell::new(value2),
    ]
}

/// 四列表单行（宽值）：标签 + 值合并横跨 3 列（长文本字段用）
fn form_row_wide(label: &str, value: String) -> Vec<crate::utils::xlsx_export::XlsxRichCell> {
    use crate::utils::xlsx_export::XlsxRichCell;
    vec![
        XlsxRichCell::new(label).bold().center(),
        XlsxRichCell::merged(value, 3),
    ]
}

/// 表单尾部签审占位行（合并横跨全列，无内容参与权限与合计，仅打印留痕）
fn form_sign_row(text: &str, cols: u16) -> Vec<crate::utils::xlsx_export::XlsxRichCell> {
    vec![crate::utils::xlsx_export::XlsxRichCell::merged(text, cols)]
}

// ----------------------------------------------------------------------
// 状态/类型词表中文案（写入方唯一事实来源见各函数注释，逐字符照抄）
// ----------------------------------------------------------------------

/// 凭证类型中文案（写入方词表见 services/voucher_ops/crud.rs available_voucher_types）。
fn voucher_type_label(voucher_type: &str) -> &'static str {
    match voucher_type {
        "记" => "记账凭证",
        "收" => "收款凭证",
        "付" => "付款凭证",
        "转" => "转账凭证",
        _ => "其他",
    }
}

/// 凭证状态中文案（写入方词表 models/status/finance.rs voucher 模块，小写值）。
fn voucher_status_label(status: &str) -> &'static str {
    match status {
        "draft" => "草稿",
        "submitted" => "已提交",
        "reviewed" => "已审核",
        "posted" => "已过账",
        _ => "其他",
    }
}

/// 收款单状态中文案（写入方词表 models/status/finance.rs ar 模块，小写值）。
fn collection_status_label(status: &str) -> &'static str {
    match status {
        "pending" => "待确认",
        "confirmed" => "已确认",
        "cancelled" => "已取消",
        _ => "其他",
    }
}

/// 付款单状态中文案（写入方词表 models/status/general.rs payment 模块，大写值）。
fn payment_status_label(status: &str) -> &'static str {
    match status {
        "REGISTERED" => "已登记",
        "CONFIRMED" => "已确认",
        "PAID" => "已付款",
        "PARTIAL_PAID" => "部分付款",
        _ => "其他",
    }
}

/// 应付发票状态中文案（DRAFT/CANCELLED 写入方为 models/status/general.rs common，
/// AUDITED 为 models/status/finance.rs ap_invoice 模块，PAID/PARTIAL_PAID 为 payment 模块）。
fn invoice_status_label(status: &str) -> &'static str {
    match status {
        "DRAFT" => "草稿",
        "AUDITED" => "已审核",
        "PAID" => "已付款",
        "PARTIAL_PAID" => "部分付款",
        "CANCELLED" => "已取消",
        _ => "其他",
    }
}

/// 应付对账单状态中文案（写入方词表 models/status/finance.rs ap_reconciliation 模块，大写值）。
fn ap_recon_status_label(status: &str) -> &'static str {
    match status {
        "PENDING" => "待处理",
        "CONFIRMED" => "已确认",
        "DISPUTED" => "有争议",
        _ => "其他",
    }
}

/// 坏账核销审批状态中文案（写入方词表 models/status/finance.rs
/// bad_debt_writeoff_status 模块，小写值）。
fn bad_debt_approval_label(status: &str) -> &'static str {
    match status {
        "pending" => "待审",
        "finance_approved" => "财务经理已通过",
        "approved" => "已批准",
        "rejected" => "已拒绝",
        "cancelled" => "已取消",
        _ => "其他",
    }
}

/// 外汇核销单状态中文案（写入方词表见 models/foreign_exchange_verification.rs
/// status 列注释，小写值）。
fn fx_status_label(status: &str) -> &'static str {
    match status {
        "pending" => "待核销",
        "verified" => "已核销",
        "cancelled" => "已撤销",
        _ => "其他",
    }
}

/// 出口退税申报单状态中文案（写入方词表见 models/export_refund_declaration.rs
/// status 列注释，小写值）。
fn refund_status_label(status: &str) -> &'static str {
    match status {
        "draft" => "草稿",
        "submitted" => "已申报",
        "approved" => "已审批",
        "rejected" => "已退回",
        _ => "其他",
    }
}

// ----------------------------------------------------------------------
// 表单类单据 xlsx 构建器（纯函数，可单测；版式统一为标题 + 键值网格 + 签审行）
// ----------------------------------------------------------------------

/// 组装会计凭证 xlsx 富表格（纯函数）。
/// 6 列：标题 → 类型/日期 → 状态/来源/车间 → 来源单据号 → 分录表头 →
/// 分录行×N → 借贷合计 → 签审行。金额为取数腿序列化字符串，本函数不再合计。
fn build_voucher_xlsx_table(data: &PrintData) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 6;
    let title = format!("会计凭证 {}", get("voucher_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(vec![
        XlsxRichCell::merged(
            format!("凭证类型：{}", voucher_type_label(&get("voucher_type"))),
            3,
        ),
        XlsxRichCell::merged(format!("凭证日期：{}", get("voucher_date")), 3),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(
            format!("单据状态：{}", voucher_status_label(&get("status"))),
            2,
        ),
        XlsxRichCell::merged(format!("来源模块：{}", get("source_module")), 2),
        XlsxRichCell::merged(format!("车间：{}", get("workshop")), 2),
    ]);
    rows.push(vec![XlsxRichCell::merged(
        format!("来源单据号：{}", get("source_bill_no")),
        COLS,
    )]);
    rows.push(vec![
        XlsxRichCell::new("行号").bold().center(),
        XlsxRichCell::new("科目编码").bold().center(),
        XlsxRichCell::new("科目名称").bold().center(),
        XlsxRichCell::new("摘要").bold().center(),
        XlsxRichCell::new("借方(元)").bold().center(),
        XlsxRichCell::new("贷方(元)").bold().center(),
    ]);
    for item in &data.items {
        rows.push(vec![
            XlsxRichCell::new(cell_str(item, "line_no")),
            XlsxRichCell::new(cell_str(item, "subject_code")),
            XlsxRichCell::new(cell_str(item, "subject_name")),
            XlsxRichCell::new(cell_str(item, "summary")),
            XlsxRichCell::new(cell_str(item, "debit")),
            XlsxRichCell::new(cell_str(item, "credit")),
        ]);
    }
    rows.push(vec![
        XlsxRichCell::merged("合计", 4).bold(),
        XlsxRichCell::new(get("total_debit")).bold(),
        XlsxRichCell::new(get("total_credit")).bold(),
    ]);
    rows.push(form_sign_row(
        "制单：__________  审核：__________  记账：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "会计凭证".to_string(),
        rows,
        column_widths: Some(vec![8.0, 14.0, 16.0, 24.0, 12.0, 12.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装应收账款收款单 xlsx 富表格（纯函数）。4 列键值网格。
fn build_ar_collection_xlsx_table(data: &PrintData) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("应收收款单 {}", get("collection_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "收款单号",
        get("collection_no"),
        "收款日期",
        get("collection_date"),
    ));
    rows.push(form_row(
        "客户ID",
        get("customer_id"),
        "客户名称",
        get("customer_name"),
    ));
    rows.push(form_row(
        "收款金额(元)",
        get("collection_amount"),
        "收款方式",
        get("collection_method"),
    ));
    rows.push(form_row(
        "银行账户",
        get("bank_account"),
        "单据状态",
        collection_status_label(&get("status")).to_string(),
    ));
    rows.push(form_sign_row(
        "经办人：__________  客户确认：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "应收收款单".to_string(),
        rows,
        column_widths: Some(vec![14.0, 20.0, 14.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装应付账款付款单 xlsx 富表格（纯函数）。4 列键值网格。
fn build_ap_payment_xlsx_table(data: &PrintData) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("付款单 {}", get("payment_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "付款单号",
        get("payment_no"),
        "付款日期",
        get("payment_date"),
    ));
    rows.push(form_row(
        "供应商ID",
        get("supplier_id"),
        "币种",
        get("currency"),
    ));
    rows.push(form_row(
        "付款金额",
        get("payment_amount"),
        "付款方式",
        get("payment_method"),
    ));
    rows.push(form_row(
        "付款状态",
        payment_status_label(&get("payment_status")).to_string(),
        "交易流水号",
        get("transaction_no"),
    ));
    rows.push(form_row_wide("开户行", get("bank_name")));
    rows.push(form_row_wide("银行账户", get("bank_account")));
    rows.push(form_sign_row(
        "经办人：__________  审批人：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "付款单".to_string(),
        rows,
        column_widths: Some(vec![14.0, 20.0, 14.0, 24.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装应付发票 xlsx 富表格（纯函数）。4 列键值网格。
fn build_ap_invoice_xlsx_table(data: &PrintData) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("应付发票 {}", get("invoice_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "发票号",
        get("invoice_no"),
        "发票类型",
        get("invoice_type"),
    ));
    rows.push(form_row(
        "供应商ID",
        get("supplier_id"),
        "开票日期",
        get("invoice_date"),
    ));
    rows.push(form_row("到期日", get("due_date"), "币种", get("currency")));
    rows.push(form_row(
        "发票金额",
        get("amount"),
        "税额",
        get("tax_amount"),
    ));
    rows.push(form_row(
        "已付金额",
        get("paid_amount"),
        "未付金额",
        get("unpaid_amount"),
    ));
    rows.push(form_row_wide(
        "发票状态",
        invoice_status_label(&get("invoice_status")).to_string(),
    ));
    rows.push(form_sign_row(
        "经办人：__________  审批人：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "应付发票".to_string(),
        rows,
        column_widths: Some(vec![14.0, 20.0, 14.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装付款申请单 xlsx 富表格（纯函数）。4 列键值网格 + 关联发票明细键值行。
fn build_ap_payment_request_xlsx_table(
    data: &PrintData,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("付款申请单 {}", get("request_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "申请单号",
        get("request_no"),
        "申请日期",
        get("request_date"),
    ));
    rows.push(form_row(
        "供应商ID",
        get("supplier_id"),
        "付款类型",
        get("payment_type"),
    ));
    rows.push(form_row(
        "付款方式",
        get("payment_method"),
        "币种",
        get("currency"),
    ));
    rows.push(form_row(
        "申请金额",
        get("request_amount"),
        "期望付款日期",
        get("expected_payment_date"),
    ));
    rows.push(form_row_wide("开户行", get("bank_name")));
    rows.push(vec![XlsxRichCell::merged("关联发票明细", COLS)
        .bold()
        .center()]);
    for item in &data.items {
        rows.push(form_row(
            "发票ID",
            cell_str(item, "invoice_id"),
            "申请金额",
            cell_str(item, "apply_amount"),
        ));
    }
    rows.push(form_sign_row(
        "申请人：__________  审批人：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "付款申请单".to_string(),
        rows,
        column_widths: Some(vec![14.0, 20.0, 14.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装应付对账单 xlsx 富表格（纯函数）。4 列键值网格，四账务字段
/// （期初/本期发票/本期付款/期末）为取数腿序列化字符串。
fn build_ap_reconciliation_xlsx_table(
    data: &PrintData,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("应付对账单 {}", get("reconciliation_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "对账单号",
        get("reconciliation_no"),
        "对账状态",
        ap_recon_status_label(&get("reconciliation_status")).to_string(),
    ));
    rows.push(form_row_wide(
        "对账期间",
        format!("{} ~ {}", get("start_date"), get("end_date")),
    ));
    rows.push(form_row(
        "供应商ID",
        get("supplier_id"),
        "期初余额",
        get("opening_balance"),
    ));
    rows.push(form_row(
        "本期发票合计",
        get("total_invoice"),
        "本期付款合计",
        get("total_payment"),
    ));
    rows.push(form_row_wide("期末余额", get("closing_balance")));
    rows.push(form_sign_row(
        "制单：__________  供应商确认：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "应付对账单".to_string(),
        rows,
        column_widths: Some(vec![16.0, 20.0, 16.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装坏账核销单 xlsx 富表格（纯函数）。4 列键值网格；取数腿无单据号字段，
/// `doc_no` 由服务层按主键注入（测试可注入任意编号验证标题渲染）。
fn build_bad_debt_writeoff_xlsx_table(
    data: &PrintData,
    doc_no: &str,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("坏账核销单 #{}", doc_no);
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "单据编号",
        format!("#{}", doc_no),
        "审批状态",
        bad_debt_approval_label(&get("approval_status")).to_string(),
    ));
    rows.push(form_row(
        "客户ID",
        get("customer_id"),
        "关联应收发票ID",
        get("ar_invoice_id"),
    ));
    rows.push(form_row(
        "核销金额",
        get("writeoff_amount"),
        "申请人",
        get("applicant_username"),
    ));
    rows.push(form_row_wide("申请日期", get("applicant_at")));
    rows.push(form_row_wide("核销原因", get("reason")));
    rows.push(form_row_wide(
        "财务经理意见",
        get("finance_manager_comment"),
    ));
    rows.push(form_row_wide("总经理意见", get("general_manager_comment")));
    rows.push(form_sign_row(
        "财务经理：__________  总经理：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "坏账核销单".to_string(),
        rows,
        column_widths: Some(vec![16.0, 20.0, 16.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装外汇核销单 xlsx 富表格（纯函数）。4 列键值网格。
fn build_foreign_exchange_verification_xlsx_table(
    data: &PrintData,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("外汇核销单 {}", get("verification_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "核销单号",
        get("verification_no"),
        "核销日期",
        get("verification_date"),
    ));
    rows.push(form_row(
        "报关单ID",
        get("customs_declaration_id"),
        "销售订单ID",
        get("sales_order_id"),
    ));
    rows.push(form_row(
        "外币金额",
        get("foreign_currency_amount"),
        "人民币金额",
        get("rmb_amount"),
    ));
    rows.push(form_row(
        "汇率",
        get("exchange_rate"),
        "银行编码",
        get("bank_code"),
    ));
    rows.push(form_row_wide(
        "单据状态",
        fx_status_label(&get("status")).to_string(),
    ));
    rows.push(form_sign_row(
        "经办人：__________  复核人：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "外汇核销单".to_string(),
        rows,
        column_widths: Some(vec![14.0, 20.0, 14.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

/// 组装出口退税申报单 xlsx 富表格（纯函数）。4 列键值网格。
fn build_export_refund_declaration_xlsx_table(
    data: &PrintData,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| cell_str(&data.data, key);
    const COLS: u16 = 4;
    let title = format!("出口退税申报单 {}", get("declaration_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(form_row(
        "申报单号",
        get("declaration_no"),
        "申报日期",
        get("declaration_date"),
    ));
    rows.push(form_row_wide(
        "所属期间",
        format!("{}年{}月", get("period_year"), get("period_month")),
    ));
    rows.push(form_row(
        "出口销售额",
        get("export_sales_amount"),
        "应退增值税",
        get("refundable_vat_amount"),
    ));
    rows.push(form_row(
        "实际退税额",
        get("actual_refund_amount"),
        "退税率",
        get("refund_rate"),
    ));
    rows.push(form_row_wide(
        "单据状态",
        refund_status_label(&get("status")).to_string(),
    ));
    rows.push(form_sign_row(
        "申报人：__________  复核人：__________",
        COLS,
    ));
    XlsxRichTable {
        sheet_name: "出口退税申报单".to_string(),
        rows,
        column_widths: Some(vec![16.0, 20.0, 16.0, 20.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

#[cfg(test)]
mod recon_xlsx_tests {
    use super::{build_recon_xlsx_table, recon_item_label, recon_match_label};
    use crate::models::ar_reconciliation_item;
    use rust_decimal::Decimal;
    use std::collections::HashMap;

    fn item(
        item_type: &str,
        doc_no: &str,
        dye: &str,
        amount: &str,
        matched: Option<&str>,
    ) -> ar_reconciliation_item::Model {
        ar_reconciliation_item::Model {
            id: 0,
            piece_no: Some("P-01".to_string()),
            batch_no: None,
            color_no: Some("33#浅蓝".to_string()),
            dye_lot_no: Some(dye.to_string()),
            reconciliation_id: 1,
            item_type: item_type.to_string(),
            document_type: None,
            document_id: None,
            document_no: Some(doc_no.to_string()),
            document_date: Some(chrono::NaiveDate::from_ymd_opt(2026, 3, 25).unwrap()),
            amount: Decimal::from_str_exact(amount).unwrap(),
            matched_amount: matched.map(|m| Decimal::from_str_exact(m).unwrap()),
            match_status: "UNMATCHED".to_string(),
            matched_item_id: None,
            remarks: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        }
    }

    fn data_map() -> HashMap<String, serde_json::Value> {
        let mut data = HashMap::new();
        for (k, v) in [
            ("reconciliation_no", "AR2603-001"),
            ("customer_name", "辉哥"),
            ("reconciliation_date", "2026-03-25"),
            ("period_start", "2026-03-01"),
            ("period_end", "2026-03-31"),
            ("opening_balance", "0"),
            ("total_invoices", "5545.35"),
            ("total_collections", "3000"),
            ("closing_balance", "2545.35"),
            ("reconciliation_status", "CONFIRMED"),
        ] {
            data.insert(k.to_string(), serde_json::json!(v));
        }
        data
    }

    #[test]
    fn item_type_label_covers_word_table() {
        assert_eq!(recon_item_label("OPENING"), "期初余额");
        assert_eq!(recon_item_label("INVOICE"), "销售发票");
        assert_eq!(recon_item_label("RECEIPT"), "收款单");
        assert_eq!(recon_item_label("ADJUSTMENT"), "调整");
        assert_eq!(recon_item_label("DISPUTE"), "争议");
        assert_eq!(recon_item_label("UNKNOWN_X"), "其他");
    }

    #[test]
    fn match_status_label_covers_word_table() {
        assert_eq!(recon_match_label("UNMATCHED"), "未匹配");
        assert_eq!(recon_match_label("MATCHED"), "已匹配");
        assert_eq!(recon_match_label("PARTIAL"), "部分匹配");
        assert_eq!(recon_match_label("DISPUTED"), "争议中");
        assert_eq!(recon_match_label("CANCELLED"), "已取消");
    }

    #[test]
    fn rich_table_layout_and_totals() {
        let items = vec![
            item("INVOICE", "XS2603-100", "9002", "963.75", None),
            item("RECEIPT", "SK2603-050", "3038", "3000", Some("3000")),
        ];
        let table = build_recon_xlsx_table(&data_map(), &items, Some("伍仟伍佰肆拾伍元叁角伍分"));
        assert_eq!(table.sheet_name, "应收对账单");
        // 标题+客户+期间+账务+表头+2明细+合计+大写+签收+条款 = 11 行
        assert_eq!(table.rows.len(), 11);
        // 标题合并整行且含单号
        assert_eq!(table.rows[0][0].colspan, 10);
        assert!(table.rows[0][0].text.contains("AR2603-001"));
        // 账务四字段行：合并格按起点索引存放（跨度计入列宽不入 Vec）
        assert!(table.rows[3][0].text.contains("上单结余：0"));
        assert!(table.rows[3][1].text.contains("本期应收合计：5545.35"));
        assert!(table.rows[3][2].text.contains("本期实收合计：3000"));
        assert!(table.rows[3][3].text.contains("期末欠款：2545.35"));
        // 明细行逐字段（第 5 行=表头后第一条明细）
        assert_eq!(table.rows[5][0].text, "销售发票");
        assert_eq!(table.rows[5][1].text, "XS2603-100");
        assert_eq!(table.rows[5][3].text, "9002");
        assert_eq!(table.rows[5][6].text, "963.75");
        assert_eq!(table.rows[6][0].text, "收款单");
        // 合计行：起点格 merged(6)="合计"，index 1=Σ金额=963.75+3000
        assert_eq!(table.rows[7][0].text, "合计");
        assert!(table.rows[7][1].text.contains("3963.75"));
        // 大写注入渲染（大写行 Vec 长 2：merged(5) 大写 + merged(5) 欠款）
        assert!(table.rows[8][0].text.contains("伍仟伍佰肆拾伍元叁角伍分"));
        // None 时大写格留空
        let empty = build_recon_xlsx_table(&data_map(), &items, None);
        assert_eq!(empty.rows[8][0].text, "货款总计(大写)：");
        // 条款行含三天条款
        assert!(table.rows[10][0].text.contains("三天内"));
    }

    #[test]
    fn empty_items_still_renders_summary() {
        let table = build_recon_xlsx_table(&data_map(), &[], None);
        // 标题/客户/期间/账务/表头/合计/大写/签收/条款 = 9 行（无明细行）
        assert_eq!(table.rows.len(), 9);
        // 无明细行：合计行前移至 rows[5]（标题/客户/期间/账务/表头/合计），大写 rows[6]
        assert_eq!(table.rows[5][0].text, "合计");
        assert!(table.rows[5][1].text.contains("0"));
        assert!(table.rows[5][2].text.contains("0"));
        assert_eq!(table.rows[6][0].text, "货款总计(大写)：");
    }
}

#[cfg(test)]
mod form_xlsx_tests {
    use super::*;
    use crate::utils::xlsx_export::build_xlsx_rich;
    use calamine::{Data, Reader, Xlsx};
    use std::collections::HashMap;

    /// 从内存字节用 calamine 读回工作表值矩阵
    fn read_back(bytes: &[u8], sheet_name: &str) -> calamine::Range<Data> {
        let mut workbook: Xlsx<std::io::Cursor<&[u8]>> =
            Xlsx::new(std::io::Cursor::new(bytes)).expect("calamine 打开字节流失败");
        workbook
            .worksheet_range(sheet_name)
            .expect("calamine 读回工作表失败")
    }

    fn value_at(range: &calamine::Range<Data>, row: u32, col: u32) -> String {
        range
            .get_value((row, col))
            .map(|d| d.to_string())
            .unwrap_or_default()
    }

    /// 构造表单类 PrintData：data 为键值对（全部字符串口径，与取数腿序列化输出一致）
    fn pdata(pairs: &[(&str, &str)]) -> PrintData {
        let mut data = HashMap::new();
        for (k, v) in pairs {
            data.insert(k.to_string(), serde_json::json!(v));
        }
        PrintData {
            template: "form_test".to_string(),
            data,
            items: Vec::new(),
            image: None,
        }
    }

    /// 构造明细行（字符串键值 + 可选数值键值，覆盖 invoice_id 这类数值键）
    fn item_row(
        pairs: &[(&str, &str)],
        nums: &[(&str, i64)],
    ) -> HashMap<String, serde_json::Value> {
        let mut row = HashMap::new();
        for (k, v) in pairs {
            row.insert(k.to_string(), serde_json::json!(v));
        }
        for (k, v) in nums {
            row.insert(k.to_string(), serde_json::json!(v));
        }
        row
    }

    // ---------------- 会计凭证 ----------------

    fn voucher_data() -> PrintData {
        let mut d = pdata(&[
            ("voucher_no", "JZ2604-001"),
            ("voucher_type", "记"),
            ("voucher_date", "2026-04-01"),
            ("source_module", "sales"),
            ("source_bill_no", "SO2604-010"),
            ("status", "reviewed"),
            ("workshop", "一车间"),
            ("total_debit", "963.75"),
            ("total_credit", "963.75"),
        ]);
        d.items = vec![
            item_row(
                &[
                    ("line_no", "1"),
                    ("subject_code", "1122"),
                    ("subject_name", "应收账款"),
                    ("debit", "963.75"),
                    ("credit", "0"),
                    ("summary", "赊销布款"),
                ],
                &[],
            ),
            item_row(
                &[
                    ("line_no", "2"),
                    ("subject_code", "6001"),
                    ("subject_name", "主营业务收入"),
                    ("debit", "0"),
                    ("credit", "963.75"),
                    ("summary", "赊销布款"),
                ],
                &[],
            ),
        ];
        d
    }

    #[test]
    fn voucher_table_layout_and_labels() {
        let table = build_voucher_xlsx_table(&voucher_data());
        assert_eq!(table.sheet_name, "会计凭证");
        // 标题+类型日期+状态来源车间+来源单据号+表头+2分录+合计+签审 = 9 行
        assert_eq!(table.rows.len(), 9);
        assert_eq!(table.rows[0][0].colspan, 6);
        assert!(table.rows[0][0].text.contains("JZ2604-001"));
        // 类型/状态词表逐字符映射
        assert!(table.rows[1][0].text.contains("凭证类型：记账凭证"));
        assert!(table.rows[2][0].text.contains("单据状态：已审核"));
        // 分录行逐字段（第 5 行=表头后第一条分录）
        assert_eq!(table.rows[5][1].text, "1122");
        assert_eq!(table.rows[5][4].text, "963.75");
        assert_eq!(table.rows[6][5].text, "963.75");
        // 合计行：起点格 merged(4)="合计"，借/贷合计为取数腿序列化字符串
        assert_eq!(table.rows[7][0].text, "合计");
        assert_eq!(table.rows[7][1].text, "963.75");
        assert_eq!(table.rows[7][2].text, "963.75");
        // 签审占位行合并整行
        assert_eq!(table.rows[8][0].colspan, 6);
    }

    #[test]
    fn voucher_xlsx_calamine_readback() {
        let table = build_voucher_xlsx_table(&voucher_data());
        let bytes = build_xlsx_rich(&table).expect("会计凭证 xlsx 构建失败");
        let range = read_back(&bytes, "会计凭证");
        assert_eq!(value_at(&range, 0, 0), "会计凭证 JZ2604-001");
        // 表头与关键分录单元格
        assert_eq!(value_at(&range, 4, 4), "借方(元)");
        assert_eq!(value_at(&range, 5, 2), "应收账款");
        assert_eq!(value_at(&range, 5, 4), "963.75");
        assert_eq!(value_at(&range, 6, 5), "963.75");
        assert_eq!(value_at(&range, 7, 0), "合计");
        // 合计行合并区占列 0-3，借/贷合计落列 4/5
        assert_eq!(value_at(&range, 7, 4), "963.75");
        assert_eq!(value_at(&range, 7, 5), "963.75");
    }

    // ---------------- 应收账款收款单 ----------------

    fn ar_collection_data(status: &str) -> PrintData {
        pdata(&[
            ("collection_no", "SK2604-002"),
            ("collection_date", "2026-04-02"),
            ("customer_id", "17"),
            ("customer_name", "辉哥布行"),
            ("collection_amount", "3000.50"),
            ("collection_method", "bank_transfer"),
            ("bank_account", "6222****0011"),
            ("status", status),
        ])
    }

    #[test]
    fn ar_collection_table_layout_and_labels() {
        let table = build_ar_collection_xlsx_table(&ar_collection_data("pending"));
        assert_eq!(table.sheet_name, "应收收款单");
        // 标题+四键值行+签审 = 6 行
        assert_eq!(table.rows.len(), 6);
        assert!(table.rows[0][0].text.contains("SK2604-002"));
        // 状态词表映射与金额序列化字符串原样呈现
        assert!(table.rows[4][0].text.contains("银行账户"));
        assert!(table.rows[4][3].text.contains("待确认"));
        assert_eq!(table.rows[3][1].text, "3000.50");
        assert!(table.rows[5][0].text.contains("客户确认"));
    }

    #[test]
    fn ar_collection_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_ar_collection_xlsx_table(&ar_collection_data(
            "confirmed",
        )))
        .expect("收款单 xlsx 构建失败");
        let range = read_back(&bytes, "应收收款单");
        assert_eq!(value_at(&range, 0, 0), "应收收款单 SK2604-002");
        assert_eq!(value_at(&range, 1, 0), "收款单号");
        assert_eq!(value_at(&range, 2, 3), "辉哥布行");
        assert_eq!(value_at(&range, 3, 1), "3000.50");
        assert_eq!(value_at(&range, 4, 3), "已确认");
    }

    // ---------------- 应付账款付款单 ----------------

    fn ap_payment_data() -> PrintData {
        pdata(&[
            ("payment_no", "FK2604-003"),
            ("payment_date", "2026-04-03"),
            ("supplier_id", "9"),
            ("payment_method", "bank_transfer"),
            ("payment_amount", "12000.00"),
            ("payment_status", "REGISTERED"),
            ("currency", "CNY"),
            ("bank_name", "工行城南支行"),
            ("bank_account", "6222****0022"),
            ("transaction_no", "TXN20260403"),
        ])
    }

    #[test]
    fn ap_payment_table_layout_and_labels() {
        let table = build_ap_payment_xlsx_table(&ap_payment_data());
        assert_eq!(table.sheet_name, "付款单");
        // 标题+四键值行+开户行+银行账户+签审 = 8 行
        assert_eq!(table.rows.len(), 8);
        assert!(table.rows[0][0].text.contains("FK2604-003"));
        // 状态词表映射（REGISTERED→已登记）
        assert!(table.rows[4][0].text.contains("付款状态"));
        assert!(table.rows[4][1].text.contains("已登记"));
        // 交易流水号在第 4 列
        assert_eq!(table.rows[4][3].text, "TXN20260403");
        // 金额为序列化字符串
        assert_eq!(table.rows[3][1].text, "12000.00");
        // 宽值行合并 3 列
        assert_eq!(table.rows[5][1].colspan, 3);
        assert!(table.rows[6][1].text.contains("6222****0022"));
    }

    #[test]
    fn ap_payment_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_ap_payment_xlsx_table(&ap_payment_data()))
            .expect("付款单 xlsx 构建失败");
        let range = read_back(&bytes, "付款单");
        assert_eq!(value_at(&range, 0, 0), "付款单 FK2604-003");
        assert_eq!(value_at(&range, 2, 0), "供应商ID");
        assert_eq!(value_at(&range, 3, 1), "12000.00");
        assert_eq!(value_at(&range, 4, 1), "已登记");
        assert_eq!(value_at(&range, 4, 3), "TXN20260403");
        assert_eq!(value_at(&range, 5, 1), "工行城南支行");
        assert_eq!(value_at(&range, 6, 1), "6222****0022");
    }

    // ---------------- 应付发票 ----------------

    fn ap_invoice_data() -> PrintData {
        pdata(&[
            ("invoice_no", "FP2604-004"),
            ("supplier_id", "9"),
            ("invoice_type", "special"),
            ("invoice_date", "2026-04-04"),
            ("due_date", "2026-05-04"),
            ("amount", "12000.00"),
            ("paid_amount", "5000.00"),
            ("unpaid_amount", "7000.00"),
            ("invoice_status", "PARTIAL_PAID"),
            ("currency", "CNY"),
            ("tax_amount", "1560.00"),
        ])
    }

    #[test]
    fn ap_invoice_table_layout_and_labels() {
        let table = build_ap_invoice_xlsx_table(&ap_invoice_data());
        assert_eq!(table.sheet_name, "应付发票");
        // 标题+五键值行+状态+签审 = 8 行
        assert_eq!(table.rows.len(), 8);
        assert!(table.rows[0][0].text.contains("FP2604-004"));
        // 三金额段序列化字符串
        assert_eq!(table.rows[4][1].text, "12000.00");
        assert_eq!(table.rows[4][3].text, "1560.00");
        assert_eq!(table.rows[5][1].text, "5000.00");
        assert_eq!(table.rows[5][3].text, "7000.00");
        // 状态词表映射（PARTIAL_PAID→部分付款）
        assert!(table.rows[6][1].text.contains("部分付款"));
    }

    #[test]
    fn ap_invoice_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_ap_invoice_xlsx_table(&ap_invoice_data()))
            .expect("应付发票 xlsx 构建失败");
        let range = read_back(&bytes, "应付发票");
        assert_eq!(value_at(&range, 0, 0), "应付发票 FP2604-004");
        assert_eq!(value_at(&range, 1, 3), "special");
        assert_eq!(value_at(&range, 3, 1), "2026-05-04");
        assert_eq!(value_at(&range, 4, 1), "12000.00");
        assert_eq!(value_at(&range, 6, 1), "部分付款");
    }

    // ---------------- 付款申请单 ----------------

    fn ap_payment_request_data() -> PrintData {
        let mut d = pdata(&[
            ("request_no", "SQ2604-005"),
            ("request_date", "2026-04-05"),
            ("supplier_id", "9"),
            ("payment_type", "material"),
            ("payment_method", "bank_transfer"),
            ("request_amount", "7000.00"),
            ("currency", "CNY"),
            ("expected_payment_date", "2026-04-10"),
            ("bank_name", "建行城北支行"),
        ]);
        d.items = vec![
            item_row(&[("apply_amount", "5000.00")], &[("invoice_id", 31)]),
            item_row(&[("apply_amount", "2000.00")], &[("invoice_id", 32)]),
        ];
        d
    }

    #[test]
    fn ap_payment_request_table_layout_and_items() {
        let table = build_ap_payment_request_xlsx_table(&ap_payment_request_data());
        assert_eq!(table.sheet_name, "付款申请单");
        // 标题+四键值行+开户行+明细节标题+2明细+签审 = 10 行
        assert_eq!(table.rows.len(), 10);
        assert!(table.rows[0][0].text.contains("SQ2604-005"));
        // 明细节标题合并整行
        assert_eq!(table.rows[6][0].colspan, 4);
        assert_eq!(table.rows[6][0].text, "关联发票明细");
        // 明细行：数值键 invoice_id（json 数字）经 cell_str 渲染为十进制文本
        assert_eq!(table.rows[7][1].text, "31");
        assert_eq!(table.rows[7][3].text, "5000.00");
        assert_eq!(table.rows[8][1].text, "32");
        assert_eq!(table.rows[8][3].text, "2000.00");
        // 申请金额为序列化字符串
        assert_eq!(table.rows[4][1].text, "7000.00");
    }

    #[test]
    fn ap_payment_request_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_ap_payment_request_xlsx_table(
            &ap_payment_request_data(),
        ))
        .expect("付款申请单 xlsx 构建失败");
        let range = read_back(&bytes, "付款申请单");
        assert_eq!(value_at(&range, 0, 0), "付款申请单 SQ2604-005");
        assert_eq!(value_at(&range, 6, 0), "关联发票明细");
        assert_eq!(value_at(&range, 7, 0), "发票ID");
        assert_eq!(value_at(&range, 7, 1), "31");
        assert_eq!(value_at(&range, 7, 3), "5000.00");
        assert_eq!(value_at(&range, 8, 1), "32");
        assert_eq!(value_at(&range, 4, 1), "7000.00");
    }

    // ---------------- 应付对账单 ----------------

    fn ap_recon_data() -> PrintData {
        pdata(&[
            ("reconciliation_no", "AD2604-006"),
            ("supplier_id", "9"),
            ("start_date", "2026-03-01"),
            ("end_date", "2026-03-31"),
            ("opening_balance", "0"),
            ("total_invoice", "12000.00"),
            ("total_payment", "5000.00"),
            ("closing_balance", "7000.00"),
            ("reconciliation_status", "DISPUTED"),
        ])
    }

    #[test]
    fn ap_reconciliation_table_layout_and_labels() {
        let table = build_ap_reconciliation_xlsx_table(&ap_recon_data());
        assert_eq!(table.sheet_name, "应付对账单");
        // 标题+单号状态+期间+供应商期初+两合计+期末+签审 = 7 行
        assert_eq!(table.rows.len(), 7);
        assert!(table.rows[0][0].text.contains("AD2604-006"));
        // 状态词表映射（DISPUTED→有争议）
        assert!(table.rows[1][3].text.contains("有争议"));
        // 四账务字段为序列化字符串
        assert_eq!(table.rows[3][3].text, "0");
        assert_eq!(table.rows[4][1].text, "12000.00");
        assert_eq!(table.rows[4][3].text, "5000.00");
        assert_eq!(table.rows[5][1].text, "7000.00");
        // 期间行合并 3 列
        assert_eq!(table.rows[2][1].colspan, 3);
        assert!(table.rows[2][1].text.contains("2026-03-01 ~ 2026-03-31"));
    }

    #[test]
    fn ap_reconciliation_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_ap_reconciliation_xlsx_table(&ap_recon_data()))
            .expect("应付对账单 xlsx 构建失败");
        let range = read_back(&bytes, "应付对账单");
        assert_eq!(value_at(&range, 0, 0), "应付对账单 AD2604-006");
        assert_eq!(value_at(&range, 1, 3), "有争议");
        assert_eq!(value_at(&range, 2, 1), "2026-03-01 ~ 2026-03-31");
        assert_eq!(value_at(&range, 4, 1), "12000.00");
        assert_eq!(value_at(&range, 4, 3), "5000.00");
        assert_eq!(value_at(&range, 5, 1), "7000.00");
    }

    // ---------------- 坏账核销单 ----------------

    fn bad_debt_data() -> PrintData {
        pdata(&[
            ("customer_id", "17"),
            ("ar_invoice_id", "88"),
            ("writeoff_amount", "2545.35"),
            ("reason", "客户失联超两年"),
            ("applicant_username", "zhangsan"),
            ("applicant_at", "2026-04-06"),
            ("approval_status", "finance_approved"),
            ("finance_manager_comment", "同意核销"),
            ("general_manager_comment", ""),
        ])
    }

    #[test]
    fn bad_debt_table_layout_and_labels() {
        let table = build_bad_debt_writeoff_xlsx_table(&bad_debt_data(), "12");
        assert_eq!(table.sheet_name, "坏账核销单");
        // 标题+编号状态+客户发票+金额申请人+日期+原因+两意见+签审 = 9 行
        assert_eq!(table.rows.len(), 9);
        // 标题与编号由服务层主键注入
        assert_eq!(table.rows[0][0].text, "坏账核销单 #12");
        assert!(table.rows[1][3].text.contains("财务经理已通过"));
        // 金额为序列化字符串
        assert_eq!(table.rows[3][1].text, "2545.35");
        // 意见宽值行合并 3 列
        assert_eq!(table.rows[6][1].colspan, 3);
        assert_eq!(table.rows[6][1].text, "同意核销");
    }

    #[test]
    fn bad_debt_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_bad_debt_writeoff_xlsx_table(&bad_debt_data(), "12"))
            .expect("坏账核销单 xlsx 构建失败");
        let range = read_back(&bytes, "坏账核销单");
        assert_eq!(value_at(&range, 0, 0), "坏账核销单 #12");
        assert_eq!(value_at(&range, 1, 3), "财务经理已通过");
        assert_eq!(value_at(&range, 2, 3), "88");
        assert_eq!(value_at(&range, 3, 1), "2545.35");
        assert_eq!(value_at(&range, 5, 1), "客户失联超两年");
    }

    // ---------------- 外汇核销单 ----------------

    fn fx_data() -> PrintData {
        pdata(&[
            ("verification_no", "WH2604-007"),
            ("customs_declaration_id", "55"),
            ("sales_order_id", "101"),
            ("verification_date", "2026-04-07"),
            ("foreign_currency_amount", "1800.00"),
            ("rmb_amount", "12960.00"),
            ("exchange_rate", "7.2000"),
            ("bank_code", "ICBKCNBJ"),
            ("status", "verified"),
        ])
    }

    #[test]
    fn fx_verification_table_layout_and_labels() {
        let table = build_foreign_exchange_verification_xlsx_table(&fx_data());
        assert_eq!(table.sheet_name, "外汇核销单");
        // 标题+单号日期+关联单据+双金额+汇率银行+状态+签审 = 7 行
        assert_eq!(table.rows.len(), 7);
        assert!(table.rows[0][0].text.contains("WH2604-007"));
        // 状态词表映射（verified→已核销）
        assert!(table.rows[5][1].text.contains("已核销"));
        // 三金额段为序列化字符串（汇率保留 4 位小数原样）
        assert_eq!(table.rows[3][1].text, "1800.00");
        assert_eq!(table.rows[3][3].text, "12960.00");
        assert_eq!(table.rows[4][1].text, "7.2000");
    }

    #[test]
    fn fx_verification_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_foreign_exchange_verification_xlsx_table(&fx_data()))
            .expect("外汇核销单 xlsx 构建失败");
        let range = read_back(&bytes, "外汇核销单");
        assert_eq!(value_at(&range, 0, 0), "外汇核销单 WH2604-007");
        assert_eq!(value_at(&range, 2, 1), "55");
        assert_eq!(value_at(&range, 2, 3), "101");
        assert_eq!(value_at(&range, 3, 3), "12960.00");
        assert_eq!(value_at(&range, 5, 1), "已核销");
    }

    // ---------------- 出口退税申报单 ----------------

    fn refund_data() -> PrintData {
        pdata(&[
            ("declaration_no", "TS2604-008"),
            ("period_year", "2026"),
            ("period_month", "3"),
            ("declaration_date", "2026-04-08"),
            ("export_sales_amount", "12960.00"),
            ("refundable_vat_amount", "1684.80"),
            ("actual_refund_amount", "1684.80"),
            ("refund_rate", "0.1300"),
            ("status", "draft"),
        ])
    }

    #[test]
    fn refund_declaration_table_layout_and_labels() {
        let table = build_export_refund_declaration_xlsx_table(&refund_data());
        assert_eq!(table.sheet_name, "出口退税申报单");
        // 标题+单号日期+期间+销售额应退+实际退税退税率+状态+签审 = 7 行
        assert_eq!(table.rows.len(), 7);
        assert!(table.rows[0][0].text.contains("TS2604-008"));
        // 期间拼接（年份/月份来自取数腿序列化字符串）
        assert_eq!(table.rows[2][1].text, "2026年3月");
        // 三税额段与退税率为序列化字符串
        assert_eq!(table.rows[3][1].text, "12960.00");
        assert_eq!(table.rows[3][3].text, "1684.80");
        assert_eq!(table.rows[4][3].text, "0.1300");
        // 状态词表映射（draft→草稿）
        assert!(table.rows[5][1].text.contains("草稿"));
    }

    #[test]
    fn refund_declaration_xlsx_calamine_readback() {
        let bytes = build_xlsx_rich(&build_export_refund_declaration_xlsx_table(&refund_data()))
            .expect("出口退税申报单 xlsx 构建失败");
        let range = read_back(&bytes, "出口退税申报单");
        assert_eq!(value_at(&range, 0, 0), "出口退税申报单 TS2604-008");
        assert_eq!(value_at(&range, 2, 1), "2026年3月");
        assert_eq!(value_at(&range, 3, 1), "12960.00");
        assert_eq!(value_at(&range, 3, 3), "1684.80");
        assert_eq!(value_at(&range, 4, 1), "1684.80");
        assert_eq!(value_at(&range, 5, 1), "草稿");
    }

    // ---------------- 词表全覆盖 ----------------

    #[test]
    fn status_label_functions_cover_word_tables() {
        // 凭证类型（services/voucher_ops/crud.rs available_voucher_types）
        assert_eq!(voucher_type_label("记"), "记账凭证");
        assert_eq!(voucher_type_label("收"), "收款凭证");
        assert_eq!(voucher_type_label("付"), "付款凭证");
        assert_eq!(voucher_type_label("转"), "转账凭证");
        // 凭证状态（models/status/finance.rs voucher 模块）
        assert_eq!(voucher_status_label("draft"), "草稿");
        assert_eq!(voucher_status_label("submitted"), "已提交");
        assert_eq!(voucher_status_label("reviewed"), "已审核");
        assert_eq!(voucher_status_label("posted"), "已过账");
        // 收款单状态（models/status/finance.rs ar 模块）
        assert_eq!(collection_status_label("pending"), "待确认");
        assert_eq!(collection_status_label("confirmed"), "已确认");
        assert_eq!(collection_status_label("cancelled"), "已取消");
        // 付款单状态（models/status/general.rs payment 模块）
        assert_eq!(payment_status_label("REGISTERED"), "已登记");
        assert_eq!(payment_status_label("CONFIRMED"), "已确认");
        assert_eq!(payment_status_label("PAID"), "已付款");
        assert_eq!(payment_status_label("PARTIAL_PAID"), "部分付款");
        // 应付发票状态（common + status/finance::ap_invoice + payment）
        assert_eq!(invoice_status_label("DRAFT"), "草稿");
        assert_eq!(invoice_status_label("AUDITED"), "已审核");
        assert_eq!(invoice_status_label("PAID"), "已付款");
        assert_eq!(invoice_status_label("PARTIAL_PAID"), "部分付款");
        assert_eq!(invoice_status_label("CANCELLED"), "已取消");
        // 应付对账状态（models/status/finance.rs ap_reconciliation 模块）
        assert_eq!(ap_recon_status_label("PENDING"), "待处理");
        assert_eq!(ap_recon_status_label("CONFIRMED"), "已确认");
        assert_eq!(ap_recon_status_label("DISPUTED"), "有争议");
        // 坏账核销审批状态（models/status/finance.rs bad_debt_writeoff_status 模块）
        assert_eq!(bad_debt_approval_label("pending"), "待审");
        assert_eq!(
            bad_debt_approval_label("finance_approved"),
            "财务经理已通过"
        );
        assert_eq!(bad_debt_approval_label("approved"), "已批准");
        assert_eq!(bad_debt_approval_label("rejected"), "已拒绝");
        assert_eq!(bad_debt_approval_label("cancelled"), "已取消");
        // 外汇核销状态（models/foreign_exchange_verification.rs 词表注释）
        assert_eq!(fx_status_label("pending"), "待核销");
        assert_eq!(fx_status_label("verified"), "已核销");
        assert_eq!(fx_status_label("cancelled"), "已撤销");
        // 出口退税状态（models/export_refund_declaration.rs 词表注释）
        assert_eq!(refund_status_label("draft"), "草稿");
        assert_eq!(refund_status_label("submitted"), "已申报");
        assert_eq!(refund_status_label("approved"), "已审批");
        assert_eq!(refund_status_label("rejected"), "已退回");
    }
}
