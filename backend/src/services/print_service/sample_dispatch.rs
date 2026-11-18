//! 调样单 xlsx 打印腿（doc_type `sample_dispatch`）
//!
//! 版式照真实调样单（WPS 表格取证）：标题＋单号（BX-DY…）＋客户/日期/部门
//! ＋账务四列（上单结余/应收/实收/上期欠款）＋行级明细（品名/缸号/色号/成分/
//! 米数/单价/金额）＋合计＋货款大写＋制单/客户签收＋质量条款。
//! 构建器范式照 `print_service/codex_sheet.rs` 与 `finance.rs` 的
//! `build_ar_reconciliation_xlsx`：取数腿复用 [`PrintService::get_sample_dispatch_print_data`]
//! 的行级归属门，构建器为纯函数（可单测，calamine 读回自证）。
//! 大写金额由 `utils/amount_in_words.rs` 注入（只调用，不造第二套实现）。

use sea_orm::{
    ColumnTrait, EntityTrait, JoinType, QueryFilter, QueryOrder, QuerySelect, RelationTrait,
};
use serde_json::Value as JsonValue;
use std::collections::HashMap;

use crate::models::product;
use crate::models::sample_dispatch_item;
use crate::models::sample_dispatch_order;
use crate::services::print_service::PrintData;
use crate::utils::error::AppError;

/// 明细行视图（明细 + 产品品名 LEFT JOIN 富化，单次查询无 N+1）。
/// 品名缺失（产品被物理删除但明细仍在）出参为 NULL，渲染为空串并显式留痕，不造假名。
#[derive(sea_orm::FromQueryResult, Debug)]
pub(crate) struct DispatchItemRow {
    pub id: i32,
    pub product_id: i32,
    pub dye_lot_no: String,
    pub color_no: String,
    pub composition: String,
    pub quantity_meters: rust_decimal::Decimal,
    pub unit_price: rust_decimal::Decimal,
    pub amount: rust_decimal::Decimal,
    pub remarks: Option<String>,
    pub sort_order: i32,
    pub product_name: Option<String>,
}

impl super::PrintService {
    /// 调样单打印取数（get_print_data 的 `sample_dispatch` 分支）。
    /// 出参英文键与既有打印数据族同风格；主行缺失 404。
    pub(super) async fn get_sample_dispatch_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        let record = sample_dispatch_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调样单 {} 未找到", id)))?;
        let customer_name = crate::models::customer::Entity::find_by_id(record.customer_id)
            .one(&*self.db)
            .await?
            .map(|c| c.customer_name)
            .unwrap_or_default();
        tracing::debug!(dispatch_id = id, "调样单打印取数完成");

        let mut data = HashMap::new();
        data.insert(
            "document_no".to_string(),
            JsonValue::String(record.document_no.clone()),
        );
        data.insert(
            "dispatch_date".to_string(),
            JsonValue::String(record.dispatch_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "department".to_string(),
            JsonValue::String(record.department.clone()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "customer_name".to_string(),
            JsonValue::String(customer_name),
        );
        data.insert(
            "opening_balance".to_string(),
            JsonValue::String(record.opening_balance.to_string()),
        );
        data.insert(
            "total_amount".to_string(),
            JsonValue::String(record.total_amount.to_string()),
        );
        data.insert(
            "total_collections".to_string(),
            JsonValue::String(record.total_collections.to_string()),
        );
        data.insert(
            "closing_balance".to_string(),
            JsonValue::String(record.closing_balance.to_string()),
        );
        data.insert(
            "remarks".to_string(),
            JsonValue::String(record.remarks.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "sample_dispatch".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 明细行取数：明细 LEFT JOIN products 单次查询富化品名（照 PurchaseOrderDto 范式）
    pub(crate) async fn get_sample_dispatch_item_rows(
        &self,
        dispatch_order_id: i32,
    ) -> Result<Vec<DispatchItemRow>, AppError> {
        let rows = sample_dispatch_item::Entity::find()
            .filter(sample_dispatch_item::Column::DispatchOrderId.eq(dispatch_order_id))
            .join(
                JoinType::LeftJoin,
                sample_dispatch_item::Relation::Product.def(),
            )
            .column_as(product::Column::Name, "product_name")
            .order_by_asc(sample_dispatch_item::Column::SortOrder)
            .order_by_asc(sample_dispatch_item::Column::Id)
            .into_model::<DispatchItemRow>()
            .all(&*self.db)
            .await?;
        tracing::debug!(
            dispatch_order_id,
            rows = rows.len(),
            "调样单打印明细取数完成"
        );
        Ok(rows)
    }

    /// 调样单 xlsx 导出：取数（复用归属门取数腿）→ 纯函数组装 → 富表格字节流。
    /// 大写金额取主表 total_amount（货款总计=应收口径）经 amount_in_words 换算。
    pub async fn build_sample_dispatch_xlsx(&self, id: i32) -> Result<Vec<u8>, AppError> {
        let print_data = self.get_sample_dispatch_print_data(id).await?;
        let rows = self.get_sample_dispatch_item_rows(id).await?;
        let total_amount = print_data
            .data
            .get("total_amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse::<rust_decimal::Decimal>().ok())
            .ok_or_else(|| {
                AppError::internal("调样单打印数据缺 total_amount 或格式非法，拒绝产文件")
            })?;
        let amount_words = crate::utils::amount_in_words::amount_in_words(total_amount);
        let table = build_sample_dispatch_xlsx_table(&print_data.data, &rows, Some(&amount_words));
        crate::utils::xlsx_export::build_xlsx_rich(&table)
    }
}

/// 组装调样单 xlsx 富表格（纯函数，可单测）。
/// 8 列基准：标题 → 客户/日期 → 部门/备注 → 账务四列 → 明细表头
/// → 明细行×N → 合计 → 货款大写 → 制单/客户签收 → 质量条款。
/// `amount_in_words`：大写金额文案由调用方注入（utils/amount_in_words 换算），
/// None 时该格留空，禁在本函数内造第二套大写实现。
fn build_sample_dispatch_xlsx_table(
    data: &HashMap<String, JsonValue>,
    items: &[DispatchItemRow],
    amount_in_words: Option<&str>,
) -> crate::utils::xlsx_export::XlsxRichTable {
    use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable};
    let get = |key: &str| {
        data.get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    const COLS: u16 = 8;
    let title = format!("调样单 {}", get("document_no"));
    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();
    rows.push(vec![XlsxRichCell::merged(title, COLS).bold().center()]);
    rows.push(vec![
        XlsxRichCell::merged(format!("客户名称：{}", get("customer_name")), 4),
        XlsxRichCell::merged(format!("调样日期：{}", get("dispatch_date")), 4),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(format!("制单部门：{}", get("department")), 4),
        XlsxRichCell::merged(format!("备注：{}", get("remarks")), 4),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(format!("上单结余：{}", get("opening_balance")), 2).center(),
        XlsxRichCell::merged(format!("应收（货款总计）：{}", get("total_amount")), 2).center(),
        XlsxRichCell::merged(format!("实收：{}", get("total_collections")), 2).center(),
        XlsxRichCell::merged(format!("上期欠款：{}", get("closing_balance")), 2).center(),
    ]);
    rows.push(vec![
        XlsxRichCell::new("序号").bold().center(),
        XlsxRichCell::new("品名").bold().center(),
        XlsxRichCell::new("缸号").bold().center(),
        XlsxRichCell::new("色号").bold().center(),
        XlsxRichCell::new("成分").bold().center(),
        XlsxRichCell::new("米数").bold().center(),
        XlsxRichCell::new("单价(元)").bold().center(),
        XlsxRichCell::new("金额(元)").bold().center(),
    ]);
    let mut total_meters = rust_decimal::Decimal::ZERO;
    let mut total_amount = rust_decimal::Decimal::ZERO;
    for (idx, item) in items.iter().enumerate() {
        total_meters += item.quantity_meters;
        total_amount += item.amount;
        rows.push(vec![
            XlsxRichCell::new((idx + 1).to_string()),
            // 品名缺失（产品行已不存在）渲染空串并留痕，不造假名
            XlsxRichCell::new(item.product_name.clone().unwrap_or_default()),
            XlsxRichCell::new(item.dye_lot_no.clone()),
            XlsxRichCell::new(item.color_no.clone()),
            XlsxRichCell::new(item.composition.clone()),
            XlsxRichCell::new(item.quantity_meters.to_string()),
            XlsxRichCell::new(item.unit_price.to_string()),
            XlsxRichCell::new(item.amount.to_string()),
        ]);
    }
    for item in items.iter().filter(|i| i.product_name.is_none()) {
        tracing::warn!(
            product_id = item.product_id,
            "调样单打印明细产品行缺失，品名留空（不造假名）"
        );
    }
    rows.push(vec![
        XlsxRichCell::merged("合计", 5).bold(),
        XlsxRichCell::new(total_meters.to_string()).bold(),
        XlsxRichCell::new(""),
        XlsxRichCell::new(total_amount.to_string()).bold(),
    ]);
    rows.push(vec![XlsxRichCell::merged(
        format!("货款总计(大写)：{}", amount_in_words.unwrap_or_default()),
        COLS,
    )]);
    rows.push(vec![
        XlsxRichCell::merged("制单：________________", 4),
        XlsxRichCell::merged("客户签收：________________", 4),
    ]);
    rows.push(vec![XlsxRichCell::merged(
        "注：请检查好本单货物，如发现质量问题请在三天内联系本行，逾期或裁剪，本布行恕不负责，谢谢合作!",
        COLS,
    )]);
    XlsxRichTable {
        sheet_name: "调样单".to_string(),
        rows,
        column_widths: Some(vec![6.0, 18.0, 14.0, 12.0, 14.0, 10.0, 12.0, 14.0]),
        column_count: Some(COLS),
        header_row: false,
    }
}

#[cfg(test)]
mod sample_dispatch_xlsx_tests {
    use super::{build_sample_dispatch_xlsx_table, DispatchItemRow};
    use rust_decimal_macros::dec;
    use serde_json::Value as JsonValue;
    use std::collections::HashMap;

    /// 明细行样例（与 DispatchItemRow 字段一一对应）
    fn item_row(
        product_name: Option<&str>,
        dye: &str,
        color: &str,
        meters: rust_decimal::Decimal,
        price: rust_decimal::Decimal,
    ) -> DispatchItemRow {
        DispatchItemRow {
            id: 0,
            product_id: 1,
            dye_lot_no: dye.to_string(),
            color_no: color.to_string(),
            composition: "天丝麻".to_string(),
            quantity_meters: meters,
            unit_price: price,
            amount: meters * price,
            remarks: None,
            sort_order: 0,
            product_name: product_name.map(|s| s.to_string()),
        }
    }

    /// 主表数据样例（键名与 get_sample_dispatch_print_data 出参一致）
    fn sample_data() -> HashMap<String, JsonValue> {
        let mut data = HashMap::new();
        data.insert(
            "document_no".to_string(),
            JsonValue::String("BX-DY2607-1356".to_string()),
        );
        data.insert(
            "dispatch_date".to_string(),
            JsonValue::String("2026-07-15".to_string()),
        );
        data.insert(
            "department".to_string(),
            JsonValue::String("佛山事业部".to_string()),
        );
        data.insert(
            "customer_name".to_string(),
            JsonValue::String("佛山某某服装厂".to_string()),
        );
        data.insert(
            "opening_balance".to_string(),
            JsonValue::String("100.00".to_string()),
        );
        data.insert(
            "total_amount".to_string(),
            JsonValue::String("5545.35".to_string()),
        );
        data.insert(
            "total_collections".to_string(),
            JsonValue::String("500.00".to_string()),
        );
        data.insert(
            "closing_balance".to_string(),
            JsonValue::String("5145.35".to_string()),
        );
        data.insert("remarks".to_string(), JsonValue::String(String::new()));
        data
    }

    /// 读回 xlsx：返回 (单元格文本, 合并区 (首行,首列,末行,末列) 集合)
    fn read_back(bytes: &[u8]) -> (calamine::Range<calamine::Data>, Vec<(u32, u32, u32, u32)>) {
        use calamine::{Reader, Xlsx};
        let cursor = std::io::Cursor::new(bytes.to_vec());
        let mut workbook = Xlsx::new(cursor).expect("读回 xlsx 应成功");
        let range = workbook
            .worksheet_range("调样单")
            .expect("读回工作表应成功");
        let merged = workbook
            .merge_cells_by_sheet_name("调样单")
            .expect("读回合并区应成功")
            .into_iter()
            .map(|dims| (dims.start.0, dims.start.1, dims.end.0, dims.end.1))
            .collect();
        (range, merged)
    }

    /// 0-based (行, 列) 绝对坐标取文本（calamine Dimensions 以 (0,0)=A1 起）；空格返回空串
    fn cell_text(range: &calamine::Range<calamine::Data>, row: u32, col: u32) -> String {
        match range.get_value((row, col)) {
            Some(calamine::Data::String(s)) => s.clone(),
            Some(other) => other.to_string(),
            None => String::new(),
        }
    }

    fn build_bytes(items: &[DispatchItemRow], words: Option<&str>) -> Vec<u8> {
        let table = build_sample_dispatch_xlsx_table(&sample_data(), items, words);
        crate::utils::xlsx_export::build_xlsx_rich(&table).expect("构建应成功")
    }

    #[test]
    fn layout_title_text_and_merge_span() {
        let items = vec![item_row(
            Some("天丝麻印花布"),
            "G1",
            "大红",
            dec!(10.5),
            dec!(2.5),
        )];
        let bytes = build_bytes(&items, Some("伍仟伍佰肆拾伍元叁角伍分"));
        let (range, merged) = read_back(&bytes);
        assert_eq!(cell_text(&range, 0, 0), "调样单 BX-DY2607-1356");
        assert!(
            merged.contains(&(0, 0, 0, 7)),
            "标题合并区应横跨 1~8 列: {merged:?}"
        );
    }

    #[test]
    fn layout_customer_and_account_rows() {
        let items = vec![item_row(
            Some("天丝麻印花布"),
            "G1",
            "大红",
            dec!(10.5),
            dec!(2.5),
        )];
        let bytes = build_bytes(&items, None);
        let (range, _merged) = read_back(&bytes);
        let row1: String = (0..8).map(|c| cell_text(&range, 1, c)).collect();
        assert!(row1.contains("客户名称：佛山某某服装厂"), "{row1}");
        assert!(row1.contains("调样日期：2026-07-15"), "{row1}");
        let row3: String = (0..8).map(|c| cell_text(&range, 3, c)).collect();
        assert!(row3.contains("上单结余：100.00"), "{row3}");
        assert!(row3.contains("应收（货款总计）：5545.35"), "{row3}");
        assert!(row3.contains("实收：500.00"), "{row3}");
        assert!(row3.contains("上期欠款：5145.35"), "{row3}");
    }

    #[test]
    fn layout_header_and_item_rows() {
        let items = vec![
            item_row(Some("天丝麻印花布"), "G1", "大红", dec!(10.5), dec!(2.5)),
            item_row(Some("全棉平纹布"), "G2", "藏青", dec!(8), dec!(3)),
        ];
        let bytes = build_bytes(&items, None);
        let (range, _merged) = read_back(&bytes);
        let header: Vec<String> = (0..8).map(|c| cell_text(&range, 4, c)).collect();
        assert_eq!(
            header,
            vec![
                "序号".to_string(),
                "品名".to_string(),
                "缸号".to_string(),
                "色号".to_string(),
                "成分".to_string(),
                "米数".to_string(),
                "单价(元)".to_string(),
                "金额(元)".to_string(),
            ]
        );
        assert_eq!(cell_text(&range, 5, 0), "1");
        assert_eq!(cell_text(&range, 5, 1), "天丝麻印花布");
        assert_eq!(cell_text(&range, 5, 2), "G1");
        assert_eq!(cell_text(&range, 6, 3), "藏青");
        // 行级金额 = 米数×单价（后端计算口径）
        assert_eq!(cell_text(&range, 5, 7), "26.25");
    }

    #[test]
    fn layout_total_and_words_and_sign_rows() {
        let items = vec![
            item_row(Some("天丝麻印花布"), "G1", "大红", dec!(10.5), dec!(2.5)),
            item_row(Some("全棉平纹布"), "G2", "藏青", dec!(8), dec!(3)),
        ];
        let bytes = build_bytes(&items, Some("伍仟伍佰肆拾伍元叁角伍分"));
        let (range, _merged) = read_back(&bytes);
        // 明细两行后：行 7 = 合计（米数 18.5 / 金额 50.25）
        let total_row: String = (0..8).map(|c| cell_text(&range, 7, c)).collect();
        assert!(total_row.contains("合计"), "{total_row}");
        assert!(total_row.contains("18.5"), "{total_row}");
        assert!(total_row.contains("50.25"), "{total_row}");
        // 行 8 = 大写；行 9 = 制单/客户签收；行 10 = 条款
        assert_eq!(
            cell_text(&range, 8, 0),
            "货款总计(大写)：伍仟伍佰肆拾伍元叁角伍分"
        );
        let sign_row: String = (0..8).map(|c| cell_text(&range, 9, c)).collect();
        assert!(sign_row.contains("制单：________________"), "{sign_row}");
        assert!(
            sign_row.contains("客户签收：________________"),
            "{sign_row}"
        );
        let clause = cell_text(&range, 10, 0);
        assert!(clause.contains("质量"), "条款行应包含质量条款: {clause}");
    }

    #[test]
    fn layout_missing_product_name_renders_empty_not_fake() {
        let items = vec![item_row(None, "G3", "枣红", dec!(1), dec!(1))];
        let bytes = build_bytes(&items, None);
        let (range, _merged) = read_back(&bytes);
        assert_eq!(
            cell_text(&range, 5, 1),
            "",
            "产品缺失时品名应留空（禁造假名）"
        );
        assert_eq!(cell_text(&range, 5, 2), "G3");
    }

    #[test]
    fn layout_words_none_renders_empty_suffix() {
        let items = vec![item_row(
            Some("天丝麻印花布"),
            "G1",
            "大红",
            dec!(1),
            dec!(1),
        )];
        let bytes = build_bytes(&items, None);
        let (range, _merged) = read_back(&bytes);
        // 单条明细：标题(0)/客户(1)/部门备注(2)/账务(3)/表头(4)/明细(5)/合计(6)/大写(7)
        let words_row: String = (0..8).map(|c| cell_text(&range, 7, c)).collect();
        assert!(
            words_row.starts_with("货款总计(大写)："),
            "大写占位格键名应在: {words_row}"
        );
        // None 注入时大写文案留空，签收行紧随其后（第 8 行）
        assert_eq!(words_row, "货款总计(大写)：");
        let sign_row: String = (0..8).map(|c| cell_text(&range, 8, c)).collect();
        assert!(sign_row.contains("客户签收："), "{sign_row}");
    }
}
