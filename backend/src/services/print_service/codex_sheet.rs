//! 面料细码单 xlsx 打印模板（缸号块匹列横排）
//!
//! 版式逐区块对齐用户真实细码单（WPS .ett 取证）：发货随货同行的每匹明细码单。
//! 引擎走 [`crate::utils::xlsx_export::XlsxRichTable`] / `build_xlsx_rich`
//! （横向合并 + 动态列 + 表级列宽），本模块不改引擎。
//!
//! 版式区块（自上而下）：
//! 1. 标题行（合并横跨）："{公司名} {单据名}"，如「秉羲-熙悦(帆和) 面 料 细 码 单」
//! 2. 公司信息两行：总部地址 / 办事处 + 电话占位
//! 3. 单号行：单号 / 客户名称 / 送货地址 / 部门 / 日期
//! 4. 明细表头：品名 | 缸号 | 颜色 | 1..N 匹列 | 条数 | 数量 | +- | 单价(元) | 金额(元)
//! 5. 明细行：每缸号一行，各匹米数横向铺入匹列（不足 N 匹的列留空），
//!    条数 = 非空匹列计数，数量 = Σ匹米数，金额 = 单价 × 数量
//! 6. 汇总区：货款总计(大写)（A 车道合并后接入，None 时填空串）| 上单结余 | 实收 | 应收
//! 7. 签单区：制单 | 上期欠款(元) | 此单总件数(匹) | 总重量(KG) | 备注 | 客户签收
//! 8. 条款行（合并横跨）
//!
//! 单号、大写金额、上单结余/实收/应收/上期欠款均为调用方注入的占位参数，
//! 本切片不接单据号生成器与大写金额转换器。

use crate::models::sales_delivery_item;
use crate::utils::error::AppError;
use crate::utils::xlsx_export::{XlsxRichCell, XlsxRichTable, build_xlsx_rich};
use rust_decimal::Decimal;
use std::collections::HashMap;

/// 细码单匹列上限（与真实模板 1~10 匹列一致，超出报 validation 错）
pub const MAX_PIECE_COLUMNS: usize = 10;

/// 部门默认值（真实单据取证：佛山事业部）
pub const DEFAULT_DEPARTMENT: &str = "佛山事业部";

/// 公司名占位（真实单据取证，调用方可覆盖）
pub const DEFAULT_COMPANY_NAME: &str = "秉羲-熙悦(帆和)";
/// 单据名占位（真实单据取证，字符间空格为原件样式）
pub const DEFAULT_DOC_NAME: &str = "面 料 细 码 单";
/// 总部地址占位（真实单据取证）
pub const DEFAULT_HQ_ADDRESS: &str = "成都市成华区建材路8号1栋104";
/// 办事处名占位（真实单据取证）
pub const DEFAULT_BRANCH_OFFICE_NAME: &str = "佛山办事处";
/// 办事处地址占位（真实单据取证）
pub const DEFAULT_BRANCH_OFFICE_ADDRESS: &str = "佛山市禅城区张槎街道清水二街19号";
/// 电话占位（本切片留空，接线后由调用方注入）
pub const DEFAULT_PHONE: &str = "";

/// 公司信息（模板抬头）
#[derive(Debug, Clone)]
pub struct CodexSheetCompanyInfo {
    /// 公司名（如「秉羲-熙悦(帆和)」）
    pub company_name: String,
    /// 单据名（如「面 料 细 码 单」）
    pub doc_name: String,
    /// 总部地址
    pub hq_address: String,
    /// 办事处名（如「佛山办事处」）
    pub branch_office_name: String,
    /// 办事处地址
    pub branch_office_address: String,
    /// 电话（占位，可空）
    pub phone: String,
}

/// 细码单明细行（每缸号一行）
#[derive(Debug, Clone)]
pub struct CodexSheetRow {
    /// 品名（产品档案名称）
    pub product_name: String,
    /// 缸号
    pub dye_lot_no: String,
    /// 色号
    pub color_no: String,
    /// 各匹米数（横向铺入匹列，匹列位次 = 该缸内明细出现顺序）
    pub piece_quantities: Vec<Decimal>,
    /// 单价（元）——同缸多匹单价取该缸首条明细的单价（同缸同价口径）
    pub unit_price: Decimal,
    /// 数量（Σ匹米数，聚合时算好，版式层直接落格）
    pub quantity: Decimal,
}

/// 细码单输入（单号/大写/结余类金额均为占位参数，调用方注入）
#[derive(Debug, Clone)]
pub struct CodexSheetInput {
    /// 单号（本切片占位参数传入，不接生成器，如 "XY2505-001"）
    pub sheet_no: String,
    /// 客户名称
    pub customer_name: String,
    /// 送货地址
    pub delivery_address: String,
    /// 部门
    pub department: String,
    /// 日期
    pub sheet_date: String,
    /// 明细行（每缸号一行，由 [`group_items_by_dye_lot`] 聚合产出）
    pub rows: Vec<CodexSheetRow>,
    /// 上单结余（元，占位）
    pub previous_balance: Decimal,
    /// 实收（元，占位）
    pub received_amount: Decimal,
    /// 应收（元，占位）
    pub receivable_amount: Decimal,
    /// 上期欠款（元，占位）
    pub previous_debt: Decimal,
    /// 制单
    pub prepared_by: String,
    /// 备注
    pub remark: String,
    /// 公司信息
    pub company: CodexSheetCompanyInfo,
}

/// 发货明细逐匹成行聚合为细码单明细行：同一缸号 `dye_lot_no` 的多匹聚合为一行、
/// 各匹米数按该缸内出现顺序横向铺进匹列。
///
/// 入参 `product_names` 与 `items` 按下标对齐（调用方以 LoaderTrait `load_one`
/// 范式按明细行序取回产品名称）；长度不一致或名称缺失一律 validation 报错，不造兜底名。
/// 缸内首条明细的单价作为该行单价；匹数超过 [`MAX_PIECE_COLUMNS`] 报 validation 错。
/// 行序 = 缸号首见顺序（明细调用方按 id 升序查询）。
pub fn group_items_by_dye_lot(
    items: &[sales_delivery_item::Model],
    product_names: &[String],
) -> Result<Vec<CodexSheetRow>, AppError> {
    if product_names.len() < items.len() {
        return Err(AppError::validation(format!(
            "细码单聚合失败: 产品名称 {} 条与发货明细 {} 行未按下标对齐，拒绝造兜底品名",
            product_names.len(),
            items.len()
        )));
    }

    let mut lot_order: Vec<String> = Vec::new();
    let mut lot_rows: HashMap<String, CodexSheetRow> = HashMap::new();
    for (idx, item) in items.iter().enumerate() {
        let name = product_names
            .get(idx)
            .ok_or_else(|| {
                AppError::validation(format!(
                    "细码单聚合失败: 第 {} 行产品名称缺失（产品 ID={}）",
                    idx, item.product_id
                ))
            })?
            .clone();
        let row = lot_rows.entry(item.dye_lot_no.clone()).or_insert_with(|| {
            lot_order.push(item.dye_lot_no.clone());
            CodexSheetRow {
                product_name: name,
                dye_lot_no: item.dye_lot_no.clone(),
                color_no: item.color_no.clone(),
                piece_quantities: Vec::new(),
                unit_price: item.unit_price,
                quantity: Decimal::ZERO,
            }
        });
        row.piece_quantities.push(item.quantity);
        row.quantity += item.quantity;
    }

    let mut rows = Vec::with_capacity(lot_order.len());
    for lot in lot_order {
        let row = lot_rows.remove(&lot).ok_or_else(|| {
            AppError::validation(format!(
                "细码单聚合失败: 缸号 {} 聚合索引缺失（内部状态不一致）",
                lot
            ))
        })?;
        if row.piece_quantities.len() > MAX_PIECE_COLUMNS {
            return Err(AppError::validation(format!(
                "细码单聚合失败: 缸号 {} 有 {} 匹，超过细码单匹列上限 {} 列",
                lot,
                row.piece_quantities.len(),
                MAX_PIECE_COLUMNS
            )));
        }
        rows.push(row);
    }
    Ok(rows)
}

/// 按细码单版式构建 xlsx 字节流。
///
/// `amount_in_words` 为货款总计大写金额；`None` 时大写格填空串。
/// 匹列数取明细最大匹数（下限 1 保住版式，上限 [`MAX_PIECE_COLUMNS`]，超出报 validation 错）。
pub fn build_codex_sheet_xlsx(
    input: &CodexSheetInput,
    amount_in_words: Option<&str>,
) -> Result<Vec<u8>, AppError> {
    let piece_cols = input
        .rows
        .iter()
        .map(|row| row.piece_quantities.len())
        .max()
        .unwrap_or(0)
        .max(1);
    if piece_cols > MAX_PIECE_COLUMNS {
        return Err(AppError::validation(format!(
            "细码单构建失败: 最大匹数 {} 超过匹列上限 {} 列",
            piece_cols, MAX_PIECE_COLUMNS
        )));
    }
    let piece_cols_u16 = piece_cols as u16;
    // 品名 + 缸号 + 颜色 + 匹列 + 条数 + 数量 + +- + 单价 + 金额
    let total_cols = 3 + piece_cols_u16 + 5;

    let mut rows: Vec<Vec<XlsxRichCell>> = Vec::new();

    // 1. 标题行（合并横跨，无框居中加粗）
    let title = format!("{} {}", input.company.company_name, input.company.doc_name);
    rows.push(vec![
        XlsxRichCell::merged(title, total_cols)
            .bold()
            .center()
            .no_border(),
    ]);

    // 2. 公司信息两行（合并横跨，无框左对齐）
    rows.push(vec![
        XlsxRichCell::merged(
            format!("总部地址：{}", input.company.hq_address),
            total_cols,
        )
        .no_border(),
    ]);
    rows.push(vec![
        XlsxRichCell::merged(
            format!(
                "{}：{}    电话：{}",
                input.company.branch_office_name,
                input.company.branch_office_address,
                input.company.phone
            ),
            total_cols,
        )
        .no_border(),
    ]);

    // 3. 单号行（五段合并，无框）
    let header_segments = [
        format!("单号：{}", input.sheet_no),
        format!("客户名称：{}", input.customer_name),
        format!("送货地址：{}", input.delivery_address),
        format!("部门：{}", input.department),
        format!("日期：{}", input.sheet_date),
    ];
    rows.push(merged_label_row(&header_segments, total_cols, false));

    // 4. 明细表头（带框居中加粗）
    let mut header_row: Vec<XlsxRichCell> = Vec::with_capacity(total_cols as usize);
    header_row.push(center_cell("品名", true));
    header_row.push(center_cell("缸号", true));
    header_row.push(center_cell("颜色", true));
    for piece in 1..=piece_cols {
        header_row.push(center_cell(piece.to_string(), true));
    }
    header_row.push(center_cell("条数", true));
    header_row.push(center_cell("数量", true));
    header_row.push(center_cell("+-", true));
    header_row.push(center_cell("单价(元)", true));
    header_row.push(center_cell("金额(元)", true));
    rows.push(header_row);

    // 5. 明细行：缸号下各匹米数铺入匹列，不足 piece_cols 的列留空
    let mut total_pieces: usize = 0;
    for row in &input.rows {
        let amount = row.unit_price.checked_mul(row.quantity).ok_or_else(|| {
            AppError::validation(format!(
                "细码单构建失败: 缸号 {} 金额计算溢出（单价 {} × 数量 {}）",
                row.dye_lot_no, row.unit_price, row.quantity
            ))
        })?;
        let mut cells: Vec<XlsxRichCell> = Vec::with_capacity(total_cols as usize);
        cells.push(center_cell(row.product_name.clone(), false));
        cells.push(center_cell(row.dye_lot_no.clone(), false));
        cells.push(center_cell(row.color_no.clone(), false));
        for piece_qty in &row.piece_quantities {
            cells.push(center_cell(fmt_decimal(piece_qty), false));
        }
        for _ in row.piece_quantities.len()..piece_cols {
            cells.push(center_cell("", false));
        }
        cells.push(center_cell(row.piece_quantities.len().to_string(), false));
        cells.push(center_cell(fmt_decimal(&row.quantity), false));
        cells.push(center_cell("", false));
        cells.push(center_cell(fmt_decimal(&row.unit_price), false));
        cells.push(center_cell(fmt_decimal(&amount), false));
        total_pieces += row.piece_quantities.len();
        rows.push(cells);
    }

    // 6. 汇总区（带框四段合并）
    let summary_segments = [
        format!("货款总计(大写)：{}", amount_in_words.unwrap_or_default()),
        format!("上单结余(元)：{}", fmt_decimal(&input.previous_balance)),
        format!("实收(元)：{}", fmt_decimal(&input.received_amount)),
        format!("应收：{}", fmt_decimal(&input.receivable_amount)),
    ];
    rows.push(merged_label_row(&summary_segments, total_cols, true));

    // 7. 签单区（无框六段合并；总重量本切片无数据源留空）
    let sign_segments = [
        format!("制单：{}", input.prepared_by),
        format!("上期欠款(元)：{}", fmt_decimal(&input.previous_debt)),
        format!("此单总件数(匹)：{}", total_pieces),
        "总重量(KG)：".to_string(),
        format!("备注：{}", input.remark),
        "客户签收：".to_string(),
    ];
    rows.push(merged_label_row(&sign_segments, total_cols, false));

    // 8. 条款行（合并横跨，无框）
    rows.push(vec![
        XlsxRichCell::merged(TERMS_LINE, total_cols).no_border(),
    ]);

    let table = XlsxRichTable {
        sheet_name: "细码单".to_string(),
        rows,
        column_widths: Some(column_widths(piece_cols)),
        column_count: Some(total_cols),
        header_row: false,
    };
    build_xlsx_rich(&table)
}

/// 真实单据条款行原文（逐字对齐 .ett 取证）
pub const TERMS_LINE: &str =
    "注：请检查好本单货物，如发现质量问题请在三天内联系本行，逾期或裁剪，本布行恕不负责，谢谢合作!";

/// 构造标签行：每段文本合并为一段连续列；`boxed` 控制是否画边框
fn merged_label_row(segments: &[String], total_cols: u16, boxed: bool) -> Vec<XlsxRichCell> {
    split_evenly(total_cols, segments.len() as u16)
        .into_iter()
        .zip(segments.iter())
        .map(|(span, text)| {
            let cell = XlsxRichCell::merged(text.clone(), span);
            if boxed { cell } else { cell.no_border() }
        })
        .collect()
}

/// 把 total 列均分为 parts 段（余数摊给前段，各段至少 1 列）
fn split_evenly(total: u16, parts: u16) -> Vec<u16> {
    let mut spans = vec![total / parts; parts as usize];
    // 余数摊给前段（每段至多 +1，保持列宽均匀）
    for span in spans.iter_mut().take((total % parts) as usize) {
        *span += 1;
    }
    spans
}

/// 数字单元格（居中；`bold` 控制表头行加粗）
fn center_cell(text: impl Into<String>, bold: bool) -> XlsxRichCell {
    let cell = XlsxRichCell::new(text).center();
    if bold { cell.bold() } else { cell }
}

/// Decimal 出格口径：去尾零（60.75 → "60.75"，60.00 → "60"），不用浮点
fn fmt_decimal(value: &Decimal) -> String {
    value.normalize().to_string()
}

/// 表级列宽：匹列窄列，金额/品名宽列
fn column_widths(piece_cols: usize) -> Vec<f64> {
    let mut widths = vec![14.0, 12.0, 10.0];
    widths.extend(std::iter::repeat(7.0).take(piece_cols));
    widths.extend([6.0, 10.0, 4.0, 10.0, 12.0]);
    widths
}

// ----------------------------------------------------------------------
// 单测（聚合纯函数 + calamine 读回版式断言）
// ----------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use rust_decimal_macros::dec;

    fn item(
        id: i32,
        dye_lot_no: &str,
        color_no: &str,
        qty: Decimal,
        price: Decimal,
    ) -> sales_delivery_item::Model {
        sales_delivery_item::Model {
            id,
            delivery_id: 1,
            product_id: 1,
            batch_no: "B2026".to_string(),
            color_no: color_no.to_string(),
            dye_lot_id: None,
            dye_lot_no: dye_lot_no.to_string(),
            piece_no: None,
            stock_id: None,
            is_cross_dye_lot: false,
            quantity: qty,
            unit_price: price,
            amount: qty * price,
            remarks: None,
            created_at: Utc::now(),
        }
    }

    fn names(count: usize) -> Vec<String> {
        vec!["全棉汗布".to_string(); count]
    }

    fn sample_input(rows: Vec<CodexSheetRow>) -> CodexSheetInput {
        CodexSheetInput {
            sheet_no: "XY2505-001".to_string(),
            customer_name: "佛山某某服装厂".to_string(),
            delivery_address: "佛山市禅城区".to_string(),
            department: DEFAULT_DEPARTMENT.to_string(),
            sheet_date: "2026-11-17".to_string(),
            rows,
            previous_balance: dec!(0),
            received_amount: dec!(0),
            receivable_amount: dec!(0),
            previous_debt: dec!(0),
            prepared_by: "张三".to_string(),
            remark: "".to_string(),
            company: CodexSheetCompanyInfo {
                company_name: DEFAULT_COMPANY_NAME.to_string(),
                doc_name: DEFAULT_DOC_NAME.to_string(),
                hq_address: DEFAULT_HQ_ADDRESS.to_string(),
                branch_office_name: DEFAULT_BRANCH_OFFICE_NAME.to_string(),
                branch_office_address: DEFAULT_BRANCH_OFFICE_ADDRESS.to_string(),
                phone: DEFAULT_PHONE.to_string(),
            },
        }
    }

    // ---------- 聚合函数 ----------

    #[test]
    fn group_multi_lots_multi_pieces() {
        let items = vec![
            item(1, "G1", "大红", dec!(10.5), dec!(2.5)),
            item(2, "G1", "大红", dec!(20.25), dec!(2.5)),
            item(3, "G2", "藏青", dec!(8), dec!(3)),
            item(4, "G2", "藏青", dec!(9), dec!(3)),
            item(5, "G2", "藏青", dec!(12.5), dec!(3)),
        ];
        let rows = group_items_by_dye_lot(&items, &names(5)).expect("聚合应成功");
        assert_eq!(rows.len(), 2, "两缸聚合为两行");
        assert_eq!(rows[0].dye_lot_no, "G1");
        assert_eq!(rows[0].piece_quantities, vec![dec!(10.5), dec!(20.25)]);
        assert_eq!(rows[0].quantity, dec!(30.75));
        assert_eq!(rows[1].dye_lot_no, "G2");
        assert_eq!(rows[1].piece_quantities.len(), 3);
        assert_eq!(rows[1].quantity, dec!(29.5));
    }

    #[test]
    fn group_single_lot_single_piece() {
        let items = vec![item(1, "G9", "宝蓝", dec!(42), dec!(5))];
        let rows = group_items_by_dye_lot(&items, &names(1)).expect("聚合应成功");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].piece_quantities, vec![dec!(42)]);
        assert_eq!(rows[0].unit_price, dec!(5));
        assert_eq!(rows[0].quantity, dec!(42));
    }

    #[test]
    fn group_keeps_first_seen_lot_order() {
        let items = vec![
            item(1, "G2", "藏青", dec!(1), dec!(1)),
            item(2, "G1", "大红", dec!(2), dec!(1)),
            item(3, "G2", "藏青", dec!(3), dec!(1)),
        ];
        let rows = group_items_by_dye_lot(&items, &names(3)).expect("聚合应成功");
        let order: Vec<&str> = rows.iter().map(|r| r.dye_lot_no.as_str()).collect();
        assert_eq!(order, vec!["G2", "G1"], "行序 = 缸号首见顺序");
    }

    #[test]
    fn group_rejects_over_ten_pieces() {
        let items: Vec<_> = (1..=11)
            .map(|i| item(i, "G1", "大红", dec!(1), dec!(1)))
            .collect();
        let err = group_items_by_dye_lot(&items, &names(11)).expect_err("超 10 匹必须报错");
        assert!(
            err.to_string().contains("超过细码单匹列上限"),
            "报错文案应点名匹列上限: {err}"
        );
    }

    #[test]
    fn group_allows_exactly_ten_pieces() {
        let items: Vec<_> = (1..=10)
            .map(|i| item(i, "G1", "大红", Decimal::from(i), dec!(1)))
            .collect();
        let rows = group_items_by_dye_lot(&items, &names(10)).expect("恰好 10 匹应成功");
        assert_eq!(rows[0].piece_quantities.len(), 10);
    }

    #[test]
    fn group_takes_first_item_unit_price() {
        let items = vec![
            item(1, "G1", "大红", dec!(10), dec!(2.5)),
            item(2, "G1", "大红", dec!(20), dec!(2.5)),
        ];
        let rows = group_items_by_dye_lot(&items, &names(2)).expect("聚合应成功");
        assert_eq!(rows[0].unit_price, dec!(2.5), "单价取该缸首条明细");
    }

    #[test]
    fn group_rejects_unaligned_product_names() {
        let items = vec![item(1, "G1", "大红", dec!(1), dec!(1))];
        let err = group_items_by_dye_lot(&items, &[]).expect_err("名称未对齐必须报错");
        assert!(
            err.to_string().contains("未按下标对齐"),
            "报错应点名对齐: {err}"
        );
    }

    #[test]
    fn group_carries_product_name_and_color() {
        let items = vec![item(1, "G1", "大红", dec!(1), dec!(1))];
        let rows =
            group_items_by_dye_lot(&items, &["天丝麻印花布".to_string()]).expect("聚合应成功");
        assert_eq!(rows[0].product_name, "天丝麻印花布");
        assert_eq!(rows[0].color_no, "大红");
    }

    // ---------- 版式（calamine 读回） ----------

    /// 读回 xlsx：返回 (单元格文本, 合并区 (首行,首列,末行,末列) 集合)
    fn read_back(bytes: &[u8]) -> (calamine::Range<calamine::Data>, Vec<(u32, u32, u32, u32)>) {
        use calamine::{Reader, Xlsx};
        let cursor = std::io::Cursor::new(bytes.to_vec());
        let mut workbook = Xlsx::new(cursor).expect("读回 xlsx 应成功");
        let range = workbook
            .worksheet_range("细码单")
            .expect("读回工作表应成功");
        let merged = workbook
            .merge_cells_by_sheet_name("细码单")
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

    /// 两缸样例：G1 三匹 / G2 一匹（匹列数 = 3，总列数 = 11）
    fn build_sample_bytes() -> (Vec<u8>, CodexSheetInput) {
        let items = vec![
            item(1, "G1", "大红", dec!(10.5), dec!(2.5)),
            item(2, "G1", "大红", dec!(20.25), dec!(2.5)),
            item(3, "G1", "大红", dec!(30), dec!(2.5)),
            item(4, "G2", "藏青", dec!(8), dec!(3)),
        ];
        let rows = group_items_by_dye_lot(&items, &names(4)).expect("聚合应成功");
        let input = sample_input(rows);
        let bytes =
            build_codex_sheet_xlsx(&input, Some("壹佰伍拾壹元捌角柒分")).expect("构建应成功");
        (bytes, input)
    }

    #[test]
    fn layout_title_text_and_merge_span() {
        let (bytes, _input) = build_sample_bytes();
        let (range, merged) = read_back(&bytes);
        let title = cell_text(&range, 0, 0);
        assert_eq!(title, "秉羲-熙悦(帆和) 面 料 细 码 单", "标题逐字对齐原件");
        // 标题合并横跨全部 11 列（第 1 行 第 A~K 列，calamine 合并区坐标 0 起）
        assert!(
            merged.contains(&(0, 0, 0, 10)),
            "标题合并区应横跨 1~11 列: {merged:?}"
        );
    }

    #[test]
    fn layout_company_info_rows() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        assert_eq!(
            cell_text(&range, 1, 0),
            "总部地址：成都市成华区建材路8号1栋104"
        );
        assert_eq!(
            cell_text(&range, 2, 0),
            "佛山办事处：佛山市禅城区张槎街道清水二街19号    电话："
        );
    }

    #[test]
    fn layout_sheet_no_row_fields() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        let sheet_no_row: Vec<String> = (0..11).map(|c| cell_text(&range, 3, c)).collect();
        let joined = sheet_no_row.join("|");
        assert!(joined.contains("单号：XY2505-001"), "{joined}");
        assert!(joined.contains("客户名称：佛山某某服装厂"), "{joined}");
        assert!(joined.contains("部门：佛山事业部"), "{joined}");
        assert!(joined.contains("日期：2026-11-17"), "{joined}");
    }

    #[test]
    fn layout_piece_column_headers_dynamic() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        for (offset, expect) in (1..=3).enumerate() {
            assert_eq!(
                cell_text(&range, 4, 3 + offset as u32),
                expect.to_string(),
                "匹列头应为 1..N 数字"
            );
        }
        assert_eq!(cell_text(&range, 4, 6), "条数");
        assert_eq!(cell_text(&range, 4, 7), "数量");
        assert_eq!(cell_text(&range, 4, 8), "+-");
        assert_eq!(cell_text(&range, 4, 9), "单价(元)");
        assert_eq!(cell_text(&range, 4, 10), "金额(元)");
    }

    #[test]
    fn layout_piece_values_landed_by_lot() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        // 第 6 行（0 起 idx 5）= G1 行：匹列落 10.5 / 20.25 / 30
        assert_eq!(cell_text(&range, 5, 3), "10.5");
        assert_eq!(cell_text(&range, 5, 4), "20.25");
        assert_eq!(cell_text(&range, 5, 5), "30");
        // 第 7 行（idx 6）= G2 行：只有 1 匹，匹列 3 = 8，4~5 留空
        assert_eq!(cell_text(&range, 6, 3), "8");
        assert_eq!(cell_text(&range, 6, 4), "");
        assert_eq!(cell_text(&range, 6, 5), "");
    }

    #[test]
    fn layout_piece_count_equals_nonempty_columns() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        assert_eq!(cell_text(&range, 5, 6), "3", "G1 条数 = 非空匹列计数");
        assert_eq!(cell_text(&range, 6, 6), "1", "G2 条数 = 非空匹列计数");
    }

    #[test]
    fn layout_quantity_equals_piece_sum() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        assert_eq!(cell_text(&range, 5, 7), "60.75", "G1 数量 = Σ匹米数");
        assert_eq!(cell_text(&range, 6, 7), "8", "G2 数量 = Σ匹米数");
    }

    #[test]
    fn layout_amount_equals_price_times_quantity() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        assert_eq!(
            cell_text(&range, 5, 10),
            "151.875",
            "G1 金额 = 单价 2.5 × 数量 60.75"
        );
        assert_eq!(cell_text(&range, 6, 10), "24", "G2 金额 = 单价 3 × 数量 8");
    }

    #[test]
    fn layout_amount_in_words_some_and_none() {
        let (_, input) = build_sample_bytes();
        let bytes = build_codex_sheet_xlsx(&input, None).expect("构建应成功");
        let (range, _merged) = read_back(&bytes);
        let words_row: String = (0..11).map(|c| cell_text(&range, 7, c)).collect();
        assert!(
            words_row.contains("货款总计(大写)：") && !words_row.contains("壹佰"),
            "None 时大写格填空串: {words_row}"
        );
        let (bytes2, _) = build_sample_bytes();
        let (range2, _merged2) = read_back(&bytes2);
        let words_row2: String = (0..11).map(|c| cell_text(&range2, 7, c)).collect();
        assert!(
            words_row2.contains("货款总计(大写)：壹佰伍拾壹元捌角柒分"),
            "Some 时大写注入: {words_row2}"
        );
    }

    #[test]
    fn layout_summary_and_sign_rows_present() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        let summary: String = (0..11).map(|c| cell_text(&range, 7, c)).collect();
        assert!(summary.contains("上单结余(元)："), "{summary}");
        assert!(summary.contains("实收(元)："), "{summary}");
        assert!(summary.contains("应收："), "{summary}");
        let sign: String = (0..11).map(|c| cell_text(&range, 8, c)).collect();
        assert!(sign.contains("制单：张三"), "{sign}");
        assert!(sign.contains("此单总件数(匹)：4"), "总件数 = 各行条数合计");
        assert!(sign.contains("总重量(KG)："), "{sign}");
        assert!(sign.contains("客户签收："), "{sign}");
    }

    #[test]
    fn layout_terms_line_present() {
        let (bytes, _input) = build_sample_bytes();
        let (range, _merged) = read_back(&bytes);
        // 条款行 = 末行（0 起 idx 9：标题/公司信息×2/单号/表头/明细×2/汇总/签单 + 1）
        let last = cell_text(&range, 9, 0);
        assert_eq!(last, TERMS_LINE, "条款行逐字对齐原件");
        assert!(last.contains("请检查好本单货物"));
    }

    #[test]
    fn layout_rejects_over_ten_piece_columns_on_direct_input() {
        // 绕过聚合函数直接构造 CodexSheetInput（防御性校验）
        let mut input = sample_input(vec![]);
        input.rows.push(CodexSheetRow {
            product_name: "全棉汗布".to_string(),
            dye_lot_no: "G1".to_string(),
            color_no: "大红".to_string(),
            piece_quantities: vec![dec!(1); 11],
            unit_price: dec!(1),
            quantity: dec!(11),
        });
        let err = build_codex_sheet_xlsx(&input, None).expect_err("匹列超限必须报错");
        assert!(
            err.to_string().contains("超过匹列上限"),
            "报错应点名匹列上限: {err}"
        );
    }
}
