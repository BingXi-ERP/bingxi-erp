//! xlsx 导出工具模块（v11 批次 142 新增）
//!
//! 规则 3 强制要求：所有数据导出功能必须使用 .xlsx 格式（Excel），
//! 禁止使用 CSV 作为最终交付格式。
//!
//! 本模块封装 rust_xlsxwriter 提供统一的导出接口：
//! - `build_xlsx`：从二维数据构建 xlsx 字节流
//! - `xlsx_response`：构造 axum Response（含正确 Content-Type 和 Content-Disposition）
//! - `build_xlsx_with_watermark`：V15 P0-S15 新增，水印版导出（操作员/IP/时间戳/防篡改）
//!
//! V15 P0-S15 修复（Batch 474）：导出文件无水印问题。新增 `WatermarkConfig`
//! 结构体与 `build_xlsx_with_watermark` 函数，在 xlsx 标题行上方插入水印行，
//! 记录操作员、客户端 IP、导出时间戳，作为合规审计与防篡改证据。
//! 设计采用"新增函数 + 保留原 build_xlsx 不变"的向后兼容方案，避免影响 19 个
//! 已有 XlsxTable 构造点（详见规则 13 步骤 4 自审）。
//!
//! 富表格扩展：`XlsxRichTable` / `build_xlsx_rich` 支持横向合并单元格（缸号块
//! 下按匹数横向展开列）、动态列数、逐格加粗/对齐/边框开关与表级列宽。
//! 原 `XlsxTable` / `build_xlsx` 行为不变，两者互不影响。

use crate::utils::error::AppError;
use axum::http::{HeaderValue, header};
use axum::response::Response;
use rust_xlsxwriter::{Format, FormatAlign, FormatBorder, Workbook, Worksheet};

/// xlsx 表格数据（标题行 + 数据行）
pub struct XlsxTable {
    /// 工作表名称（如 "线索列表" / "商机列表"）
    pub sheet_name: String,
    /// 标题行（第一行）
    pub headers: Vec<String>,
    /// 数据行（每行一个 Vec<String>，长度应与 headers 一致）
    pub rows: Vec<Vec<String>>,
}

/// 导出水印配置（合规审计与防篡改），字段全为 Option，任一为 None 则省略该维度
#[derive(Debug, Clone, Default)]
pub struct WatermarkConfig {
    /// 操作员用户名（来自 AuthContext.username）
    pub operator: Option<String>,
    /// 客户端 IP（来自请求 x-forwarded-for 或 socket_addr）
    pub ip_address: Option<String>,
    /// 导出时间戳（ISO8601 字符串，建议 chrono::Utc::now().to_rfc3339()）
    pub exported_at: Option<String>,
    /// 额外信息（如资源类型说明，可选）
    pub extra: Option<String>,
}

impl WatermarkConfig {
    /// 渲染为单行水印文本（用 4 空格分隔各维度），全为 None 时返回 None
    pub fn render(&self) -> Option<String> {
        let mut parts: Vec<String> = Vec::new();
        if let Some(op) = &self.operator {
            parts.push(format!("操作员:{}", op));
        }
        if let Some(ip) = &self.ip_address {
            parts.push(format!("导出IP:{}", ip));
        }
        if let Some(ts) = &self.exported_at {
            parts.push(format!("导出时间:{}", ts));
        }
        if let Some(ex) = &self.extra {
            parts.push(ex.to_string());
        }
        if parts.is_empty() {
            None
        } else {
            Some(parts.join("    "))
        }
    }
}

/// 从 XlsxTable 构建 xlsx 字节流（标题加粗+冻结首行+列宽自适应+全表边框）
pub fn build_xlsx(table: &XlsxTable) -> Result<Vec<u8>, AppError> {
    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name(&table.sheet_name)
        .map_err(|e| AppError::internal(format!("xlsx 工作表名称错误: {}", e)))?;

    let header_format = make_header_format();
    let data_format = make_data_format();

    write_header_row(worksheet, 0, &table.headers, &header_format)?;
    write_data_rows(worksheet, 1, &table.rows, &data_format)?;

    worksheet
        .set_freeze_panes(1, 0)
        .map_err(|e| AppError::internal(format!("xlsx 冻结首行失败: {}", e)))?;

    set_column_widths(worksheet, &table.headers, &table.rows)?;

    let bytes = workbook
        .save_to_buffer()
        .map_err(|e| AppError::internal(format!("xlsx 保存失败: {}", e)))?;
    Ok(bytes)
}

/// 构造 xlsx 下载响应（含 Content-Type 和 Content-Disposition 头）
pub fn xlsx_response(bytes: Vec<u8>, filename: &str) -> Response {
    let mut response = Response::new(bytes.into());
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    );
    let disposition = format!("attachment; filename=\"{}.xlsx\"", filename);
    if let Ok(value) = HeaderValue::from_str(&disposition) {
        headers.insert(header::CONTENT_DISPOSITION, value);
    }
    response
}

/// 一站式：从 XlsxTable 直接构造 axum Response
pub fn build_xlsx_response(table: &XlsxTable, filename: &str) -> Result<Response, AppError> {
    let bytes = build_xlsx(table)?;
    Ok(xlsx_response(bytes, filename))
}

/// 带水印的 xlsx 构建：标题行上方插入水印行，render() 为 None 时退化为 build_xlsx
pub fn build_xlsx_with_watermark(
    table: &XlsxTable,
    watermark: &WatermarkConfig,
) -> Result<Vec<u8>, AppError> {
    let watermark_text = match watermark.render() {
        Some(t) => t,
        None => return build_xlsx(table),
    };

    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name(&table.sheet_name)
        .map_err(|e| AppError::internal(format!("xlsx 工作表名称错误: {}", e)))?;

    let watermark_format = make_watermark_format();
    let header_format = make_header_format();
    let data_format = make_data_format();

    write_watermark_row(
        worksheet,
        &watermark_text,
        table.headers.len(),
        &watermark_format,
    )?;
    write_header_row(worksheet, 1, &table.headers, &header_format)?;
    write_data_rows(worksheet, 2, &table.rows, &data_format)?;

    worksheet
        .set_freeze_panes(2, 0)
        .map_err(|e| AppError::internal(format!("xlsx 冻结前 2 行失败: {}", e)))?;

    set_watermark_column_widths(worksheet, &table.headers, &table.rows, &watermark_text)?;

    let bytes = workbook
        .save_to_buffer()
        .map_err(|e| AppError::internal(format!("xlsx 保存失败: {}", e)))?;
    Ok(bytes)
}

/// 带水印的 xlsx 一站式响应构造（等价于 build_xlsx_with_watermark + xlsx_response）
pub fn build_xlsx_response_with_watermark(
    table: &XlsxTable,
    filename: &str,
    watermark: &WatermarkConfig,
) -> Result<Response, AppError> {
    let bytes = build_xlsx_with_watermark(table, watermark)?;
    Ok(xlsx_response(bytes, filename))
}

// ----------------------------------------------------------------------
// 富表格（合并单元格 + 动态列）
// ----------------------------------------------------------------------

/// 富表格单元格：文本值 + 可选横向合并跨度 + 可选加粗/对齐/边框开关
pub struct XlsxRichCell {
    /// 单元格文本值
    pub text: String,
    /// 横向合并跨度，>=1；>1 时本单元格为合并区起点（占据 colspan 个列）
    pub colspan: u16,
    /// 是否加粗
    pub bold: bool,
    /// 水平对齐（None 时左对齐；标题行默认居中）
    pub align: Option<FormatAlign>,
    /// 是否画细边框
    pub border: bool,
}

impl XlsxRichCell {
    /// 普通单元格（跨度 1、带边框、不加粗、左对齐）
    pub fn new(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            colspan: 1,
            bold: false,
            align: None,
            border: true,
        }
    }

    /// 横向合并单元格（跨度 colspan，合并区起点；colspan<1 在构建时校验报错）
    pub fn merged(text: impl Into<String>, colspan: u16) -> Self {
        Self {
            colspan,
            ..Self::new(text)
        }
    }

    /// 加粗
    pub fn bold(mut self) -> Self {
        self.bold = true;
        self
    }

    /// 居中对齐
    pub fn center(mut self) -> Self {
        self.align = Some(FormatAlign::Center);
        self
    }
}

/// 富表格：行 x 单元格矩阵，支持横向合并、动态列数、表级列宽与标题行样式
pub struct XlsxRichTable {
    /// 工作表名称
    pub sheet_name: String,
    /// 数据行（每行单元格数可不同 = 动态列；合并跨度计入行宽）
    pub rows: Vec<Vec<XlsxRichCell>>,
    /// 显式列宽数组（按列序）；None 时按内容自适应（估算，10~50 字符宽）
    pub column_widths: Option<Vec<f64>>,
    /// 声明列数：Some(n) 时所有行的跨度累计不得越过第 n 列（越界报错）；
    /// None 时列数取各行跨度累计的最大值
    pub column_count: Option<u16>,
    /// 首行是否按标题行样式渲染（加粗 + 浅灰背景 + 居中 + 冻结首行）
    pub header_row: bool,
}

/// 从富表格构建 xlsx 字节流（支持横向合并单元格与动态列）
///
/// 校验失败（空表 / colspan=0 / 合并区重叠 / 跨度越界 / 显式列宽不足）返回
/// `AppError::validation`，不静默降级。
pub fn build_xlsx_rich(table: &XlsxRichTable) -> Result<Vec<u8>, AppError> {
    let max_cols = validate_rich_table(table)?;

    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name(&table.sheet_name)
        .map_err(|e| AppError::internal(format!("xlsx 工作表名称错误: {}", e)))?;

    write_rich_rows(worksheet, table, 0)?;

    set_rich_column_widths(worksheet, table, max_cols)?;

    if table.header_row {
        worksheet
            .set_freeze_panes(1, 0)
            .map_err(|e| AppError::internal(format!("xlsx 冻结首行失败: {}", e)))?;
    }

    workbook
        .save_to_buffer()
        .map_err(|e| AppError::internal(format!("xlsx 保存失败: {}", e)))
}

// ----------------------------------------------------------------------
// 富表格内部辅助函数
// ----------------------------------------------------------------------

/// 富表格前置校验：返回列数（显式声明或各行跨度累计的最大值）。
/// 空表 / colspan=0 / 跨度越界 / 合并区重叠均返回 AppError::validation。
fn validate_rich_table(table: &XlsxRichTable) -> Result<u16, AppError> {
    if table.rows.is_empty() {
        return Err(AppError::validation(
            "xlsx 富表格校验失败: 行数据为空，禁止导出空表",
        ));
    }

    let mut row_widths: Vec<u32> = Vec::with_capacity(table.rows.len());
    for (row_idx, row) in table.rows.iter().enumerate() {
        let mut width: u32 = 0;
        for (cell_idx, cell) in row.iter().enumerate() {
            if cell.colspan == 0 {
                return Err(AppError::validation(format!(
                    "xlsx 富表格校验失败: 第 {} 行第 {} 个单元格 colspan=0（必须 >=1）",
                    row_idx, cell_idx
                )));
            }
            width += cell.colspan as u32;
        }
        row_widths.push(width);
    }

    let max_cols: u16 = match table.column_count {
        Some(n) => n,
        None => row_widths
            .iter()
            .max()
            .copied()
            .unwrap_or(0)
            .try_into()
            .map_err(|_| {
                AppError::validation("xlsx 富表格校验失败: 列数超出 u16 上限，无法导出")
            })?,
    };

    for (row_idx, row) in table.rows.iter().enumerate() {
        let mut col: u16 = 0;
        for (cell_idx, cell) in row.iter().enumerate() {
            let end_col = col as u32 + cell.colspan as u32 - 1;
            if end_col >= max_cols as u32 {
                return Err(AppError::validation(format!(
                    "xlsx 富表格校验失败: 第 {} 行第 {} 个单元格的合并区越过最后一列（终点列 {}，表列数 {}）",
                    row_idx, cell_idx, end_col, max_cols
                )));
            }
            col += cell.colspan;
        }
    }

    // 行内单元格按跨度顺序铺开，合并区结构上不可能重叠；若未来写入模型变更
    // 导致重叠，merge_range 自身的 MergeRangeOverlaps 会在写入路径显式报错

    Ok(max_cols)
}

/// 从指定行起写入富表格各行（合并单元格走 merge_range，其余走普通写入）
fn write_rich_rows(
    worksheet: &mut Worksheet,
    table: &XlsxRichTable,
    start_row: u32,
) -> Result<(), AppError> {
    for (row_idx, row) in table.rows.iter().enumerate() {
        let sheet_row = start_row + row_idx as u32;
        let is_header = table.header_row && row_idx == 0;
        let mut col: u16 = 0;
        for (cell_idx, cell) in row.iter().enumerate() {
            let format = make_rich_cell_format(cell, is_header);
            if cell.colspan > 1 {
                worksheet
                    .merge_range(
                        sheet_row,
                        col,
                        sheet_row,
                        col + cell.colspan - 1,
                        &cell.text,
                        &format,
                    )
                    .map_err(|e| {
                        AppError::internal(format!(
                            "xlsx 合并单元格失败（第 {} 行第 {} 个单元格）: {}",
                            row_idx, cell_idx, e
                        ))
                    })?;
            } else {
                worksheet
                    .write_with_format(sheet_row, col, &cell.text, &format)
                    .map_err(|e| {
                        AppError::internal(format!(
                            "xlsx 写入富表格单元格失败（第 {} 行第 {} 个单元格）: {}",
                            row_idx, cell_idx, e
                        ))
                    })?;
            }
            col += cell.colspan;
        }
    }
    Ok(())
}

/// 构建富表格单元格格式：逐格开关组合（加粗/对齐/边框）+ 标题行样式
fn make_rich_cell_format(cell: &XlsxRichCell, is_header: bool) -> Format {
    let mut format = Format::new();
    if is_header || cell.border {
        format = format.set_border(FormatBorder::Thin);
    }
    if cell.bold || is_header {
        format = format.set_bold();
    }
    if is_header {
        format = format.set_background_color("#E0E0E0");
    }
    match (cell.align, is_header) {
        (Some(a), _) => format.set_align(a),
        (None, true) => format.set_align(FormatAlign::Center),
        (None, false) => format,
    }
    .set_align(FormatAlign::VerticalCenter)
}

/// 设置富表格列宽：显式数组优先（不足即报错），否则按内容自适应
fn set_rich_column_widths(
    worksheet: &mut Worksheet,
    table: &XlsxRichTable,
    max_cols: u16,
) -> Result<(), AppError> {
    let widths = match &table.column_widths {
        Some(w) => {
            if w.len() < max_cols as usize {
                return Err(AppError::validation(format!(
                    "xlsx 富表格校验失败: 显式列宽数组长度 {} 少于表列数 {}，拒绝静默补齐",
                    w.len(),
                    max_cols
                )));
            }
            w.clone()
        }
        None => fit_rich_column_widths(table, max_cols),
    };
    for (col, width) in widths.iter().enumerate() {
        worksheet
            .set_column_width(col as u16, *width)
            .map_err(|e| AppError::internal(format!("xlsx 设置列宽失败: {}", e)))?;
    }
    Ok(())
}

/// 按内容估算列宽：合并区起点列按全文长计，被并入列按均摊长度计；
/// 与既有 set_column_widths 同一公式（字符数 * 1.2 + 2，夹取 10~50）
fn fit_rich_column_widths(table: &XlsxRichTable, max_cols: u16) -> Vec<f64> {
    let mut lens = vec![0usize; max_cols as usize];
    for row in &table.rows {
        let mut col: usize = 0;
        for cell in row {
            let span = cell.colspan as usize;
            let len = cell.text.chars().count();
            if col < lens.len() {
                lens[col] = lens[col].max(len);
            }
            for c in (col + 1)..(col + span).min(lens.len()) {
                lens[c] = lens[c].max(len / span.max(1));
            }
            col += span;
        }
    }
    lens.iter()
        .map(|&len| ((len as f64) * 1.2 + 2.0).clamp(10.0, 50.0))
        .collect()
}

// ----------------------------------------------------------------------
// 内部辅助函数
// ----------------------------------------------------------------------

/// 构建标题行格式（加粗 + 浅灰背景 + 边框 + 居中）
fn make_header_format() -> Format {
    Format::new()
        .set_bold()
        .set_background_color("#E0E0E0")
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
}

/// 构建数据行格式（边框 + 垂直居中）
fn make_data_format() -> Format {
    Format::new()
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::VerticalCenter)
}

/// 构建水印行格式（浅黄背景 + 红色字体 + 居中 + 加粗 + 边框）
fn make_watermark_format() -> Format {
    Format::new()
        .set_bold()
        .set_font_color("#CC0000")
        .set_background_color("#FFF7CC")
        .set_border(FormatBorder::Thin)
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
}

/// 在指定行写入标题行
fn write_header_row(
    worksheet: &mut Worksheet,
    row: u32,
    headers: &[String],
    format: &Format,
) -> Result<(), AppError> {
    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_with_format(row, col as u16, header, format)
            .map_err(|e| AppError::internal(format!("xlsx 写入标题失败: {}", e)))?;
    }
    Ok(())
}

/// 从指定行起写入数据行
fn write_data_rows(
    worksheet: &mut Worksheet,
    start_row: u32,
    rows: &[Vec<String>],
    format: &Format,
) -> Result<(), AppError> {
    for (row_idx, row) in rows.iter().enumerate() {
        for (col, cell) in row.iter().enumerate() {
            worksheet
                .write_with_format(start_row + row_idx as u32, col as u16, cell, format)
                .map_err(|e| AppError::internal(format!("xlsx 写入数据失败: {}", e)))?;
        }
    }
    Ok(())
}

/// 写入水印行（含占位边框与合并单元格）
fn write_watermark_row(
    worksheet: &mut Worksheet,
    watermark_text: &str,
    headers_len: usize,
    format: &Format,
) -> Result<(), AppError> {
    worksheet
        .write_with_format(0, 0, watermark_text, format)
        .map_err(|e| AppError::internal(format!("xlsx 写入水印失败: {}", e)))?;
    for col in 1..headers_len {
        worksheet
            .write_with_format(0, col as u16, "", format)
            .map_err(|e| AppError::internal(format!("xlsx 写入水印占位失败: {}", e)))?;
    }
    if headers_len > 1 {
        worksheet
            .merge_range(0, 0, 0, (headers_len - 1) as u16, watermark_text, format)
            .map_err(|e| AppError::internal(format!("xlsx 合并水印行失败: {}", e)))?;
    }
    Ok(())
}

/// 设置列宽自适应（基于内容长度估算，最大 50，最小 10）
fn set_column_widths(
    worksheet: &mut Worksheet,
    headers: &[String],
    rows: &[Vec<String>],
) -> Result<(), AppError> {
    for col in 0..headers.len() {
        let max_len = rows
            .iter()
            .map(|row| row.get(col).map(|s| s.chars().count()).unwrap_or(0))
            .max()
            .unwrap_or(0);
        let header_len = headers.get(col).map(|s| s.chars().count()).unwrap_or(0);
        let width = ((max_len.max(header_len) as f64) * 1.2 + 2.0).clamp(10.0, 50.0);
        worksheet
            .set_column_width(col as u16, width)
            .map_err(|e| AppError::internal(format!("xlsx 设置列宽失败: {}", e)))?;
    }
    Ok(())
}

/// 设置列宽自适应（水印文本长度参与估算，避免水印行被截断）
fn set_watermark_column_widths(
    worksheet: &mut Worksheet,
    headers: &[String],
    rows: &[Vec<String>],
    watermark_text: &str,
) -> Result<(), AppError> {
    for col in 0..headers.len() {
        let max_len = rows
            .iter()
            .map(|row| row.get(col).map(|s| s.chars().count()).unwrap_or(0))
            .max()
            .unwrap_or(0);
        let header_len = headers.get(col).map(|s| s.chars().count()).unwrap_or(0);
        let watermark_len = watermark_text.chars().count() / headers.len().max(1);
        let width =
            ((max_len.max(header_len).max(watermark_len) as f64) * 1.2 + 2.0).clamp(10.0, 50.0);
        worksheet
            .set_column_width(col as u16, width)
            .map_err(|e| AppError::internal(format!("xlsx 设置列宽失败: {}", e)))?;
    }
    Ok(())
}

// ----------------------------------------------------------------------
// 单元测试（纯函数，本地可跑；含 calamine 读回验证）
// ----------------------------------------------------------------------

#[cfg(test)]
mod rich_table_tests {
    use super::*;
    use calamine::{Data, Reader, Xlsx};

    type Merges = Vec<(u32, u32, u32, u32)>;
    type ReadBack = (calamine::Range<Data>, Merges);

    /// 用 calamine 从内存字节读回 xlsx：返回 (值矩阵, 合并区列表)
    fn read_back(bytes: &[u8], sheet_name: &str) -> Result<ReadBack, String> {
        let mut workbook: Xlsx<std::io::Cursor<&[u8]>> =
            Xlsx::new(std::io::Cursor::new(bytes)).map_err(|e| e.to_string())?;
        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|e| e.to_string())?;
        let merges: Vec<(u32, u32, u32, u32)> = workbook
            .merge_cells_by_sheet_name(sheet_name)
            .map_err(|e| e.to_string())?
            .into_iter()
            .map(|d| (d.start.0, d.start.1, d.end.0, d.end.1))
            .collect();
        Ok((range, merges))
    }

    fn value_at(range: &calamine::Range<Data>, row: u32, col: u32) -> String {
        range
            .get_value((row, col))
            .map(|d| d.to_string())
            .unwrap_or_default()
    }

    #[test]
    fn single_cell_table_builds_ok() {
        let table = XlsxRichTable {
            sheet_name: "单格".to_string(),
            rows: vec![vec![XlsxRichCell::new("A")]],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let bytes = build_xlsx_rich(&table).expect("单格表应构建成功");
        assert!(!bytes.is_empty());
    }

    #[test]
    fn horizontal_merge_readback_via_calamine() {
        // 缸号块标题横向合并 3 列 + 匹数子列
        let table = XlsxRichTable {
            sheet_name: "细码单".to_string(),
            rows: vec![
                vec![
                    XlsxRichCell::merged("缸号 J-2026-001", 3).bold(),
                    XlsxRichCell::new("占位"),
                ],
                vec![
                    XlsxRichCell::new("匹1").center(),
                    XlsxRichCell::new("匹2").center(),
                    XlsxRichCell::new("匹3").center(),
                    XlsxRichCell::new("小计"),
                ],
            ],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let bytes = build_xlsx_rich(&table).expect("横向合并表应构建成功");
        let (range, merges) = read_back(&bytes, "细码单").expect("calamine 读回失败");
        assert_eq!(
            merges,
            vec![(0u32, 0u32, 0u32, 2u32)],
            "读回合并区应为 (0,0)-(0,2)"
        );
        assert_eq!(value_at(&range, 0, 0), "缸号 J-2026-001");
        assert_eq!(value_at(&range, 1, 2), "匹3");
        assert_eq!(value_at(&range, 1, 3), "小计");
    }

    #[test]
    fn two_non_overlapping_merges_readback() {
        let table = XlsxRichTable {
            sheet_name: "双合并".to_string(),
            rows: vec![vec![
                XlsxRichCell::merged("左区", 2),
                XlsxRichCell::merged("右区", 2),
            ]],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let bytes = build_xlsx_rich(&table).expect("不重叠双合并应构建成功");
        let (range, merges) = read_back(&bytes, "双合并").expect("calamine 读回失败");
        assert_eq!(merges.len(), 2, "应读回 2 个合并区");
        assert!(merges.contains(&(0, 0, 0, 1)));
        assert!(merges.contains(&(0, 2, 0, 3)));
        assert_eq!(value_at(&range, 0, 0), "左区");
        assert_eq!(value_at(&range, 0, 2), "右区");
    }

    #[test]
    fn merge_runs_exceeding_declared_columns_rejected() {
        // 同行两个相邻合并区累计 6 列，超出声明列数 4 → 越界报错
        let table = XlsxRichTable {
            sheet_name: "重叠".to_string(),
            rows: vec![vec![
                XlsxRichCell::merged("甲", 3),
                XlsxRichCell::merged("乙", 3),
            ]],
            column_widths: None,
            column_count: Some(4),
            header_row: false,
        };
        let err = build_xlsx_rich(&table).expect_err("合并区越过声明列数必须报错");
        assert!(
            err.to_string().contains("越过最后一列"),
            "错误信息应指明越界: {}",
            err
        );
    }

    #[test]
    fn merge_out_of_bounds_rejected_with_declared_column_count() {
        let table = XlsxRichTable {
            sheet_name: "越界".to_string(),
            rows: vec![vec![
                XlsxRichCell::new("A"),
                XlsxRichCell::new("B"),
                XlsxRichCell::new("C"),
                XlsxRichCell::merged("超宽", 2),
            ]],
            column_widths: None,
            column_count: Some(4),
            header_row: false,
        };
        let err = build_xlsx_rich(&table).expect_err("跨度越界必须报错");
        assert!(
            err.to_string().contains("越"),
            "错误信息应指明越界: {}",
            err
        );
    }

    #[test]
    fn colspan_zero_rejected() {
        let table = XlsxRichTable {
            sheet_name: "零跨度".to_string(),
            rows: vec![vec![XlsxRichCell {
                text: "坏格".to_string(),
                colspan: 0,
                bold: false,
                align: None,
                border: true,
            }]],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let err = build_xlsx_rich(&table).expect_err("colspan=0 必须报错");
        assert!(
            err.to_string().contains("colspan=0"),
            "错误信息应指明 colspan=0: {}",
            err
        );
    }

    #[test]
    fn empty_table_rejected() {
        let table = XlsxRichTable {
            sheet_name: "空表".to_string(),
            rows: Vec::new(),
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let err = build_xlsx_rich(&table).expect_err("空表必须报错");
        assert!(
            err.to_string().contains("行数据为空"),
            "错误信息应指明空表: {}",
            err
        );
    }

    #[test]
    fn dynamic_ragged_columns_readback() {
        // 各行列数不同：2 / 5 / 3 —— 列数取最大值 5
        let table = XlsxRichTable {
            sheet_name: "动态列".to_string(),
            rows: vec![
                vec![XlsxRichCell::new("r0c0"), XlsxRichCell::new("r0c1")],
                vec![
                    XlsxRichCell::new("r1c0"),
                    XlsxRichCell::new("r1c1"),
                    XlsxRichCell::new("r1c2"),
                    XlsxRichCell::new("r1c3"),
                    XlsxRichCell::new("r1c4"),
                ],
                vec![
                    XlsxRichCell::new("r2c0"),
                    XlsxRichCell::new("r2c1"),
                    XlsxRichCell::new("r2c2"),
                ],
            ],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let bytes = build_xlsx_rich(&table).expect("参差行列数应构建成功");
        let (range, merges) = read_back(&bytes, "动态列").expect("calamine 读回失败");
        assert!(merges.is_empty());
        let (end_row, end_col) = range.end().expect("动态列表应有数据范围");
        assert_eq!(end_col, 4, "动态列数应取最大行宽 5（末列下标 4）");
        assert_eq!(end_row, 2);
        assert_eq!(value_at(&range, 1, 4), "r1c4");
        assert_eq!(value_at(&range, 2, 0), "r2c0");
    }

    #[test]
    fn fit_rich_column_widths_clamped() {
        let long_text = "长".repeat(80);
        let table = XlsxRichTable {
            sheet_name: "列宽".to_string(),
            rows: vec![vec![XlsxRichCell::new("短"), XlsxRichCell::new(long_text)]],
            column_widths: None,
            column_count: None,
            header_row: false,
        };
        let widths = fit_rich_column_widths(&table, 2);
        assert_eq!(widths.len(), 2);
        assert_eq!(widths[0], 10.0, "短文本列宽应夹到下限 10");
        assert_eq!(widths[1], 50.0, "超长文本列宽应夹到上限 50");
    }

    #[test]
    fn explicit_column_widths_too_short_rejected() {
        let table = XlsxRichTable {
            sheet_name: "列宽不足".to_string(),
            rows: vec![vec![
                XlsxRichCell::new("A"),
                XlsxRichCell::new("B"),
                XlsxRichCell::new("C"),
            ]],
            column_widths: Some(vec![12.0, 18.0]),
            column_count: None,
            header_row: false,
        };
        let err = build_xlsx_rich(&table).expect_err("显式列宽不足必须报错");
        assert!(
            err.to_string().contains("列宽数组长度"),
            "错误信息应指明列宽不足: {}",
            err
        );
    }

    #[test]
    fn header_row_style_and_flags_build_ok() {
        let table = XlsxRichTable {
            sheet_name: "标题样式".to_string(),
            rows: vec![
                vec![
                    XlsxRichCell::new("缸号").center(),
                    XlsxRichCell::new("匹数").bold(),
                ],
                vec![XlsxRichCell::new("J-001"), XlsxRichCell::new("3")],
            ],
            column_widths: None,
            column_count: None,
            header_row: true,
        };
        let bytes = build_xlsx_rich(&table).expect("标题行样式表应构建成功");
        let (range, _) = read_back(&bytes, "标题样式").expect("calamine 读回失败");
        assert_eq!(value_at(&range, 0, 0), "缸号");
        assert_eq!(value_at(&range, 1, 1), "3");
    }
}
