//! 导出服务
//!
//! 提供 Excel、Word 格式的导出功能
//! v11 批次 161 CI2：移除 CSV 导出，规则 3 要求 xlsx 交付
//! V15 P1 batch-08 缺陷 8：新增 docx 导出，规则 3 要求合同/发票/报表支持 .docx

use crate::utils::docx_export::{build_docx_with_kv_and_image, DocxKeyValue, DocxPageLayout};
use crate::utils::error::AppError;
use crate::utils::xlsx_export::{build_xlsx, XlsxTable};
use serde::{Deserialize, Serialize};

/// 导出数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportData {
    pub title: String,
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub summary: Option<Vec<(String, String)>>,
}

/// 导出服务
pub struct ExportService;

impl ExportService {
    /// 导出为 Excel 格式（xlsx）
    pub fn export_excel(data: &ExportData) -> Result<Vec<u8>, AppError> {
        // 规则 3：使用 rust_xlsxwriter 构建真正的 xlsx 文件
        let mut rows = data.rows.clone();
        // 追加汇总行（如有），与原 CSV 导出行为保持一致
        if let Some(summary) = &data.summary {
            rows.push(Vec::new()); // 空行分隔
            for (key, value) in summary {
                rows.push(vec![key.clone(), value.clone()]);
            }
        }
        let table = XlsxTable {
            sheet_name: data.title.clone(),
            headers: data.headers.clone(),
            rows,
        };
        build_xlsx(&table)
    }

    /// V15 P1 batch-08 缺陷 8：导出为 Word 格式（docx）
    /// 规则 3 强制要求所有报表/文档生成支持 .docx 格式（Word）。；布局：标题 → 主表键值对（summary）→ 明细表格（headers + rows）。
    pub fn export_docx(data: &ExportData) -> Result<Vec<u8>, AppError> {
        let kv = if let Some(summary) = &data.summary {
            let keys: Vec<String> = summary.iter().map(|(k, _)| k.clone()).collect();
            let values: Vec<String> = summary.iter().map(|(_, v)| v.clone()).collect();
            DocxKeyValue { keys, values }
        } else {
            DocxKeyValue {
                keys: vec![],
                values: vec![],
            }
        };

        build_docx_with_kv_and_image(
            &data.title,
            &kv,
            &data.headers,
            &data.rows,
            None,
            &DocxPageLayout::default_a4_export(),
            // 导出面是否加公司抬头待裁,本波不动观感:显式传 None。
            None,
        )
    }

    /// V15 P1 batch-08 缺陷 8：生成对账单 Word 文档（docx）（规则 3 强制要求合同/发票/报表支持 .docx 格式，禁止 .txt 作为成品文档。）
    pub fn generate_reconciliation_docx(
        reconciliation_no: &str,
        customer_name: &str,
        period_start: &str,
        period_end: &str,
        status: &str,
        items: Vec<ReconciliationItem>,
        closing_balance: &str,
    ) -> Result<Vec<u8>, AppError> {
        let kv = DocxKeyValue {
            keys: vec![
                "对账单号".to_string(),
                "客户名称".to_string(),
                "对账期间".to_string(),
                "状态".to_string(),
                "期末余额".to_string(),
            ],
            values: vec![
                reconciliation_no.to_string(),
                customer_name.to_string(),
                format!("{} 至 {}", period_start, period_end),
                status.to_string(),
                closing_balance.to_string(),
            ],
        };

        let detail_headers: Vec<String> = vec![
            "类型".to_string(),
            "单号".to_string(),
            "金额".to_string(),
            "日期".to_string(),
        ];
        let detail_rows: Vec<Vec<String>> = items
            .into_iter()
            .map(|item| vec![item.item_type, item.document_no, item.amount, item.date])
            .collect();

        build_docx_with_kv_and_image(
            "应收账款对账单",
            &kv,
            &detail_headers,
            &detail_rows,
            None,
            &DocxPageLayout::default_a4_export(),
            // 导出面不加公司抬头（是否加抬头属后续待裁，本波不动观感）。
            None,
        )
    }
}

/// 对账单明细项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationItem {
    pub item_type: String,
    pub document_no: String,
    pub amount: String,
    pub date: String,
}
