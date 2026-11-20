//! 报表导出器服务（report/exp）
//!
//! 包含报表的成品文档导出：
//! - `export_report`   统一导出入口（xlsx / docx）
//! - `export_excel`   Excel 导出（xlsx）
//! - `export_docx`    Word 导出（docx）
//! - 公开：`*_bytes` 版本（无文件元信息，纯字节流）
//!
//! 拆分自原 `report_engine_service.rs` 的"报表导出"段。
use chrono::Utc;
use std::io::Write;
use tracing::info;
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

use crate::utils::error::AppError;
use crate::utils::xlsx_export::{XlsxTable, build_xlsx};

use super::{DocxExportResult, ExcelExportResult, ExportFormat, ReportData, ReportEngineService};

/// XLSX 命名空间
const XLSX_NS: &str = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

impl ReportEngineService {
    /// 统一报表导出入口
    pub async fn export_report(
        &self,
        data: &ReportData,
        format: &str,
        template_name: &str,
    ) -> Result<Vec<u8>, AppError> {
        let export_format: ExportFormat = format
            .parse()
            .map_err(|e: String| AppError::bad_request(e))?;

        match export_format {
            ExportFormat::Excel => {
                let result = self.export_excel(data, template_name).await?;
                Ok(result.content)
            }
            ExportFormat::Docx => {
                let result = self.export_docx(data, template_name).await?;
                Ok(result.content)
            }
        }
    }

    /// 导出 Excel
    pub async fn export_excel(
        &self,
        data: &ReportData,
        template_name: &str,
    ) -> Result<ExcelExportResult, AppError> {
        // 简化实现: 使用 zip 库手动构建 xlsx 文件
        let buffer = self.build_xlsx(data, template_name)?;
        let now = Utc::now().format("%Y%m%d_%H%M%S").to_string();

        info!(
            "Excel 导出成功: template={}, rows={}, size={}",
            template_name,
            data.total_rows,
            buffer.len()
        );

        Ok(ExcelExportResult {
            file_name: format!("{}_{}.xlsx", template_name, now),
            file_size: buffer.len() as u64,
            sheet_count: 1,
            row_count: data.total_rows,
            content: buffer,
        })
    }

    /// 构建 XLSX 文件（ZIP 容器）
    fn build_xlsx(&self, data: &ReportData, template_name: &str) -> Result<Vec<u8>, AppError> {
        let mut zip = ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .unix_permissions(0o644);

        Self::write_content_types_xml(&mut zip, options)?;
        Self::write_rels_xml(&mut zip, options)?;
        Self::write_workbook_rels_xml(&mut zip, options)?;
        Self::write_workbook_xml(&mut zip, options, template_name)?;
        Self::write_styles_xml(&mut zip, options)?;
        self.write_shared_strings_and_sheet_xml(&mut zip, options, data)?;

        let cursor = zip
            .finish()
            .map_err(|e| AppError::internal(format!("ZIP 结束失败: {}", e)))?;
        Ok(cursor.into_inner())
    }

    /// 写入 [Content_Types].xml
    fn write_content_types_xml(
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
    ) -> Result<(), AppError> {
        zip.start_file("[Content_Types].xml", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"#;
        zip.write_all(content_types.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 写入 _rels/.rels
    fn write_rels_xml(
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
    ) -> Result<(), AppError> {
        zip.start_file("_rels/.rels", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"#;
        zip.write_all(rels.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 写入 xl/_rels/workbook.xml.rels
    fn write_workbook_rels_xml(
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
    ) -> Result<(), AppError> {
        zip.start_file("xl/_rels/workbook.xml.rels", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        let wb_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;
        zip.write_all(wb_rels.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 写入 xl/workbook.xml
    fn write_workbook_xml(
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
        template_name: &str,
    ) -> Result<(), AppError> {
        zip.start_file("xl/workbook.xml", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        let workbook = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="{}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
<sheet name="{}" sheetId="1" r:id="rId1"/>
</sheets>
</workbook>"#,
            XLSX_NS, template_name
        );
        zip.write_all(workbook.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 写入 xl/styles.xml
    fn write_styles_xml(
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
    ) -> Result<(), AppError> {
        zip.start_file("xl/styles.xml", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        let styles = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"#;
        zip.write_all(styles.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 写入 xl/sharedStrings.xml + xl/worksheets/sheet1.xml
    fn write_shared_strings_and_sheet_xml(
        &self,
        zip: &mut ZipWriter<std::io::Cursor<Vec<u8>>>,
        options: SimpleFileOptions,
        data: &ReportData,
    ) -> Result<(), AppError> {
        let (shared_strings, string_lookup) = self.build_shared_strings_xml(data);
        zip.start_file("xl/sharedStrings.xml", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        zip.write_all(shared_strings.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;

        let sheet_xml = self.build_sheet_xml(data, &string_lookup);
        zip.start_file("xl/worksheets/sheet1.xml", options)
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        zip.write_all(sheet_xml.as_bytes())
            .map_err(|e| AppError::internal(format!("ZIP写入失败: {}", e)))?;
        Ok(())
    }

    /// 构建 sharedStrings.xml
    fn build_shared_strings_xml(
        &self,
        data: &ReportData,
    ) -> (String, std::collections::HashMap<String, usize>) {
        let mut strings = Vec::new();
        let mut lookup = std::collections::HashMap::new();

        // 添加列标签到共享字符串
        for column in &data.columns {
            let key = column.label.clone();
            lookup.insert(key.clone(), strings.len());
            strings.push(key);
        }

        // 添加所有行值到共享字符串
        for row in &data.rows {
            for column in &data.columns {
                let value = row
                    .get(&column.key)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        _ => v.to_string().trim_matches('"').to_string(),
                    })
                    .unwrap_or_default();
                if !value.is_empty() && !lookup.contains_key(&value) {
                    lookup.insert(value.clone(), strings.len());
                    strings.push(value);
                }
            }
        }

        let mut xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count=""#,
        );
        xml.push_str(&strings.len().to_string());
        xml.push_str(r#"" uniqueCount=""#);
        xml.push_str(&strings.len().to_string());
        xml.push_str(r#"">"#);

        for s in strings {
            xml.push_str("<si><t xml:space=\"preserve\">");
            xml.push_str(
                &s.replace('&', "&amp;")
                    .replace('<', "&lt;")
                    .replace('>', "&gt;"),
            );
            xml.push_str("</t></si>");
        }

        xml.push_str("</sst>");
        (xml, lookup)
    }

    /// 构建 sheet1.xml
    fn build_sheet_xml(
        &self,
        data: &ReportData,
        string_lookup: &std::collections::HashMap<String, usize>,
    ) -> String {
        let mut xml = Self::build_sheet_xml_opening();
        xml.push_str(&Self::build_sheet_header_row(data, string_lookup));
        xml.push_str(&Self::build_sheet_data_rows(data, string_lookup));
        xml.push_str("</sheetData></worksheet>");
        xml
    }

    /// 构建 sheet XML 开头（声明 + worksheet + sheetData）
    fn build_sheet_xml_opening() -> String {
        String::from(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>"#,
        )
    }

    /// 构建表头行 XML
    fn build_sheet_header_row(
        data: &ReportData,
        string_lookup: &std::collections::HashMap<String, usize>,
    ) -> String {
        let mut xml = String::from("<row r=\"1\">");
        for (idx, column) in data.columns.iter().enumerate() {
            let cell_ref = format!("{}{}", Self::column_letter(idx + 1), 1);
            let string_idx = string_lookup
                .get(&column.label)
                .copied()
                .unwrap_or_default();
            xml.push_str(&format!(
                r#"<c r="{}" t="s" s="1"><v>{}</v></c>"#,
                cell_ref, string_idx
            ));
        }
        xml.push_str("</row>");
        xml
    }

    /// 构建数据行 XML
    fn build_sheet_data_rows(
        data: &ReportData,
        string_lookup: &std::collections::HashMap<String, usize>,
    ) -> String {
        let mut xml = String::new();
        for (row_idx, row) in data.rows.iter().enumerate() {
            let row_num = row_idx + 2;
            xml.push_str(&format!("<row r=\"{}\">", row_num));
            for (col_idx, column) in data.columns.iter().enumerate() {
                let cell_ref = format!("{}{}", Self::column_letter(col_idx + 1), row_num);
                let value = row
                    .get(&column.key)
                    .map(|v| match v {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Number(n) => n.to_string(),
                        _ => v.to_string().trim_matches('"').to_string(),
                    })
                    .unwrap_or_default();
                if let Some(&string_idx) = string_lookup.get(&value) {
                    xml.push_str(&format!(
                        r#"<c r="{}" t="s"><v>{}</v></c>"#,
                        cell_ref, string_idx
                    ));
                } else {
                    xml.push_str(&format!(r#"<c r="{}"><v>{}</v></c>"#, cell_ref, value));
                }
            }
            xml.push_str("</row>");
        }
        xml
    }

    /// 数字转 Excel 列字母 (1->A, 26->Z, 27->AA)
    fn column_letter(col_num: usize) -> String {
        let mut result = String::new();
        let mut n = col_num;
        while n > 0 {
            let rem = (n - 1) % 26;
            result.insert(0, (b'A' + rem as u8) as char);
            n = (n - 1) / 26;
        }
        result
    }

    // 公开字节流版本（无元信息，便于 API 直接返回）
    // ==================================================

    /// 导出 Excel 字节流
    pub async fn export_excel_bytes(
        &self,
        data: &ReportData,
        template_name: &str,
    ) -> Result<Vec<u8>, AppError> {
        self.export_excel(data, template_name)
            .await
            .map(|r| r.content)
    }

    /// 导出 Word 文档（docx）
    pub async fn export_docx(
        &self,
        data: &ReportData,
        template_name: &str,
    ) -> Result<DocxExportResult, AppError> {
        let headers: Vec<String> = data.columns.iter().map(|c| c.label.clone()).collect();
        let rows: Vec<Vec<String>> = data
            .rows
            .iter()
            .map(|row| {
                data.columns
                    .iter()
                    .map(|c| {
                        row.get(&c.key)
                            .map(|v| match v {
                                serde_json::Value::String(s) => s.clone(),
                                serde_json::Value::Null => String::new(),
                                other => other.to_string(),
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .collect();
        let summary = data.summary.as_ref().map(|s| {
            s.as_object()
                .map(|obj| {
                    obj.iter()
                        .map(|(k, v)| {
                            let value = match v {
                                serde_json::Value::String(str) => str.clone(),
                                serde_json::Value::Null => String::new(),
                                other => other.to_string(),
                            };
                            (k.clone(), value)
                        })
                        .collect()
                })
                .unwrap_or_default()
        });
        let export_data = crate::services::export_service::ExportData {
            title: template_name.to_string(),
            headers,
            rows,
            summary,
        };
        let buffer = crate::services::export_service::ExportService::export_docx(&export_data)?;
        let now = Utc::now().format("%Y%m%d_%H%M%S").to_string();
        info!(
            "Word 导出成功: template={}, rows={}, size={}",
            template_name,
            data.total_rows,
            buffer.len()
        );
        Ok(DocxExportResult {
            file_name: format!("{}_{}.docx", template_name, now),
            file_size: buffer.len() as u64,
            content: buffer,
        })
    }

    /// 导出 Word 字节流
    pub async fn export_docx_bytes(
        &self,
        data: &ReportData,
        template_name: &str,
    ) -> Result<Vec<u8>, AppError> {
        self.export_docx(data, template_name)
            .await
            .map(|r| r.content)
    }
}
