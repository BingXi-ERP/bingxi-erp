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

    /// 应收对账单 xlsx 导出（富表格版；带操作员/时间水印，金额大写按本期应收合计生成）。
    /// 存什么：主表四账务字段与单据头 + 明细行（ar_reconciliation_items 全量）。
    /// 数据从哪来：复用 get_ar_reconciliation_print_data 的行级归属门取数（英文键），
    /// 明细由本函数按 reconciliation_id 全量补查。
    pub async fn build_ar_reconciliation_xlsx(
        &self,
        id: i32,
        watermark: &crate::utils::xlsx_export::WatermarkConfig,
    ) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_ar_reconciliation_print_data(id).await?;
        use crate::models::ar_reconciliation_item;
        let items = ar_reconciliation_item::Entity::find()
            .filter(ar_reconciliation_item::Column::ReconciliationId.eq(id))
            .order_by_asc(ar_reconciliation_item::Column::Id)
            .all(&*self.db)
            .await?;

        let total_invoices = print_data
            .data
            .get("total_invoices")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::internal("应收对账单取数缺少 total_invoices"))?
            .parse::<rust_decimal::Decimal>()
            .map_err(|e| AppError::internal(format!("应收对账单货款总计解析失败: {e}")))?;
        let words = crate::utils::amount_in_words::amount_in_words(total_invoices);
        let table = build_recon_xlsx_table(&print_data.data, &items, Some(&words));
        crate::utils::xlsx_export::build_xlsx_rich_with_watermark(&table, watermark)
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
/// `amount_in_words`：大写金额文案由调用方注入，None 时该格留空，
/// 禁在本函数内造第二套大写实现。
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
