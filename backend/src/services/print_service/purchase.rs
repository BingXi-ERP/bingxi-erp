//! purchase 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use crate::utils::xlsx_export::XlsxTable;
use rust_decimal::Decimal;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, Order, QueryFilter, QueryOrder};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 采购订单打印数据：订单主表 + 供应商 + 仓库 + 明细项（含产品）
    pub(super) async fn get_purchase_order_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        let (order, supplier, warehouse, items, product_map) =
            Self::fetch_purchase_order_relations(&self.db, id).await?;
        let data =
            Self::build_purchase_order_main_data(&order, supplier.as_ref(), warehouse.as_ref());
        let item_list = Self::build_purchase_order_item_list(items, &product_map);
        Ok(PrintData {
            template: "purchase_order".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 采购订单打印：批量查询订单 + 供应商 + 仓库 + 明细 + 产品
    async fn fetch_purchase_order_relations(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<
        (
            crate::models::purchase_order::Model,
            Option<crate::models::supplier::Model>,
            Option<crate::models::warehouse::Model>,
            Vec<crate::models::purchase_order_item::Model>,
            HashMap<i32, crate::models::product::Model>,
        ),
        AppError,
    > {
        use crate::models::{product, purchase_order, purchase_order_item, supplier, warehouse};
        let order = purchase_order::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("采购订单 {} 未找到", id)))?;
        let supplier = supplier::Entity::find_by_id(order.supplier_id)
            .one(db)
            .await?;
        let warehouse = warehouse::Entity::find_by_id(order.warehouse_id)
            .one(db)
            .await?;
        let items = purchase_order_item::Entity::find()
            .filter(purchase_order_item::Column::OrderId.eq(id))
            .order_by(purchase_order_item::Column::LineNo, Order::Asc)
            .all(db)
            .await?;
        let product_ids: Vec<i32> = items.iter().map(|i| i.product_id).collect();
        let products = product::Entity::find()
            .filter(product::Column::Id.is_in(product_ids))
            .all(db)
            .await?;
        let product_map: HashMap<i32, product::Model> =
            products.into_iter().map(|p| (p.id, p)).collect();
        Ok((order, supplier, warehouse, items, product_map))
    }

    /// 采购订单打印：构造主表 data
    fn build_purchase_order_main_data(
        order: &crate::models::purchase_order::Model,
        supplier: Option<&crate::models::supplier::Model>,
        warehouse: Option<&crate::models::warehouse::Model>,
    ) -> HashMap<String, serde_json::Value> {
        let mut data = HashMap::new();
        data.insert(
            "order_no".to_string(),
            serde_json::json!(order.order_no.clone()),
        );
        data.insert(
            "supplier_name".to_string(),
            serde_json::json!(
                supplier
                    .map(|s| s.supplier_name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "order_date".to_string(),
            serde_json::json!(order.order_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "expected_delivery_date".to_string(),
            serde_json::json!(
                order
                    .expected_delivery_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "actual_delivery_date".to_string(),
            serde_json::json!(
                order
                    .actual_delivery_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "warehouse_name".to_string(),
            serde_json::json!(warehouse.map(|w| w.name.clone()).unwrap_or_default()),
        );
        data.insert(
            "currency".to_string(),
            serde_json::json!(order.currency.clone()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(order.total_amount.to_string()),
        );
        data.insert(
            "total_quantity".to_string(),
            serde_json::json!(order.total_quantity.to_string()),
        );
        data.insert(
            "notes".to_string(),
            serde_json::json!(order.notes.clone().unwrap_or_default()),
        );
        data
    }

    /// 采购订单打印：构造明细行列表
    fn build_purchase_order_item_list(
        items: Vec<crate::models::purchase_order_item::Model>,
        product_map: &HashMap<i32, crate::models::product::Model>,
    ) -> Vec<HashMap<String, serde_json::Value>> {
        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let product = product_map.get(&item.product_id);
            let mut row = HashMap::new();
            row.insert(
                "line_no".to_string(),
                serde_json::json!(item.line_no.to_string()),
            );
            row.insert(
                "product_code".to_string(),
                serde_json::json!(product.map(|p| p.code.clone()).unwrap_or_default()),
            );
            row.insert(
                "product_name".to_string(),
                serde_json::json!(product.map(|p| p.name.clone()).unwrap_or_default()),
            );
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "unit_price".to_string(),
                serde_json::json!(item.unit_price.to_string()),
            );
            row.insert(
                "tax_percent".to_string(),
                serde_json::json!(item.tax_percent.to_string()),
            );
            row.insert(
                "total_amount".to_string(),
                serde_json::json!(item.total_amount.to_string()),
            );
            row.insert(
                "received_quantity".to_string(),
                serde_json::json!(item.received_quantity.to_string()),
            );
            item_list.push(row);
        }
        item_list
    }

    /// 采购收货单打印数据：收货主表 + 供应商 + 仓库 + 明细项
    pub(super) async fn get_purchase_receipt_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::{purchase_receipt, purchase_receipt_item, supplier, warehouse};

        let receipt = purchase_receipt::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("采购收货单 {} 未找到", id)))?;

        let supplier = supplier::Entity::find_by_id(receipt.supplier_id)
            .one(&*self.db)
            .await?;
        let warehouse = warehouse::Entity::find_by_id(receipt.warehouse_id)
            .one(&*self.db)
            .await?;

        let items = purchase_receipt_item::Entity::find()
            .filter(purchase_receipt_item::Column::ReceiptId.eq(id))
            .order_by(purchase_receipt_item::Column::LineNo, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "receipt_no".to_string(),
            serde_json::json!(receipt.receipt_no),
        );
        data.insert(
            "supplier_name".to_string(),
            serde_json::json!(
                supplier
                    .as_ref()
                    .map(|s| s.supplier_name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "warehouse_name".to_string(),
            serde_json::json!(
                warehouse
                    .as_ref()
                    .map(|w| w.name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "receipt_date".to_string(),
            serde_json::json!(receipt.receipt_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "inspection_status".to_string(),
            serde_json::json!(receipt.inspection_status),
        );
        data.insert(
            "receipt_status".to_string(),
            serde_json::json!(receipt.receipt_status),
        );
        data.insert(
            "total_quantity".to_string(),
            serde_json::json!(receipt.total_quantity.to_string()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(receipt.total_amount.to_string()),
        );
        data.insert(
            "notes".to_string(),
            serde_json::json!(receipt.notes.unwrap_or_default()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert(
                "line_no".to_string(),
                serde_json::json!(item.line_no.to_string()),
            );
            row.insert(
                "material_code".to_string(),
                serde_json::json!(item.material_code),
            );
            row.insert(
                "material_name".to_string(),
                serde_json::json!(item.material_name),
            );
            row.insert(
                "batch_no".to_string(),
                serde_json::json!(item.batch_no.unwrap_or_default()),
            );
            row.insert(
                "color_code".to_string(),
                serde_json::json!(item.color_code.unwrap_or_default()),
            );
            row.insert(
                "lot_no".to_string(),
                serde_json::json!(item.lot_no.unwrap_or_default()),
            );
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "unit_master".to_string(),
                serde_json::json!(item.unit_master),
            );
            row.insert(
                "unit_price".to_string(),
                serde_json::json!(item.unit_price.map(|p| p.to_string()).unwrap_or_default()),
            );
            row.insert(
                "amount".to_string(),
                serde_json::json!(item.amount.map(|a| a.to_string()).unwrap_or_default()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "purchase_receipt".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 采购退货单打印数据
    pub(super) async fn get_purchase_return_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::purchase_return;

        use crate::models::purchase_return_item;

        let record = purchase_return::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("采购退货单 {} 未找到", id)))?;

        let items = purchase_return_item::Entity::find()
            .filter(purchase_return_item::Column::ReturnId.eq(id))
            .order_by(purchase_return_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "return_no".to_string(),
            serde_json::json!(record.return_no.clone()),
        );
        data.insert(
            "receipt_id".to_string(),
            serde_json::json!(record.receipt_id),
        );
        data.insert("order_id".to_string(), serde_json::json!(record.order_id));
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "return_date".to_string(),
            serde_json::json!(record.return_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "reason_type".to_string(),
            serde_json::json!(record.reason_type.clone().unwrap_or_default()),
        );
        data.insert(
            "return_status".to_string(),
            serde_json::json!(record.return_status.clone()),
        );
        data.insert(
            "total_quantity".to_string(),
            serde_json::json!(
                record
                    .total_quantity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(
                record
                    .total_amount
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("product_id".to_string(), serde_json::json!(item.product_id));
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "unit_price".to_string(),
                serde_json::json!(item.unit_price.to_string()),
            );
            row.insert(
                "total_amount".to_string(),
                serde_json::json!(item.total_amount.to_string()),
            );
            row.insert(
                "color_no".to_string(),
                serde_json::json!(item.color_no.clone()),
            );
            row.insert(
                "dye_lot_no".to_string(),
                serde_json::json!(item.dye_lot_no.clone()),
            );
            row.insert(
                "batch_no".to_string(),
                serde_json::json!(item.batch_no.clone()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "purchase_return".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 采购合同打印数据
    pub(super) async fn get_purchase_contract_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::purchase_contract;

        let record = purchase_contract::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("采购合同 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "contract_no".to_string(),
            serde_json::json!(record.contract_no.clone()),
        );
        data.insert(
            "contract_name".to_string(),
            serde_json::json!(record.contract_name.clone()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(
                record
                    .total_amount
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "signed_date".to_string(),
            serde_json::json!(
                record
                    .signed_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "effective_date".to_string(),
            serde_json::json!(
                record
                    .effective_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "expiry_date".to_string(),
            serde_json::json!(
                record
                    .expiry_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "payment_terms".to_string(),
            serde_json::json!(record.payment_terms.clone().unwrap_or_default()),
        );
        data.insert(
            "delivery_date".to_string(),
            serde_json::json!(
                record
                    .delivery_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "purchase_contract".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 采购质检单打印数据
    pub(super) async fn get_purchase_inspection_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::purchase_inspection;

        use crate::models::purchase_inspection_item;

        let record = purchase_inspection::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("采购质检单 {} 未找到", id)))?;

        let items = purchase_inspection_item::Entity::find()
            .filter(purchase_inspection_item::Column::InspectionId.eq(id))
            .order_by(purchase_inspection_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "inspection_no".to_string(),
            serde_json::json!(record.inspection_no.clone()),
        );
        data.insert(
            "receipt_id".to_string(),
            serde_json::json!(record.receipt_id),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "inspection_date".to_string(),
            serde_json::json!(record.inspection_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "inspection_type".to_string(),
            serde_json::json!(record.inspection_type.clone()),
        );
        data.insert(
            "pass_quantity".to_string(),
            serde_json::json!(
                record
                    .pass_quantity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "reject_quantity".to_string(),
            serde_json::json!(
                record
                    .reject_quantity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "inspection_result".to_string(),
            serde_json::json!(record.inspection_result.clone()),
        );
        data.insert(
            "quality_score".to_string(),
            serde_json::json!(
                record
                    .quality_score
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("product_id".to_string(), serde_json::json!(item.product_id));
            row.insert(
                "item_name".to_string(),
                serde_json::json!(item.item_name.clone()),
            );
            row.insert(
                "qualified_quantity".to_string(),
                serde_json::json!(item.qualified_quantity.to_string()),
            );
            row.insert(
                "unqualified_quantity".to_string(),
                serde_json::json!(item.unqualified_quantity.to_string()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "purchase_inspection".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }

    /// 供应商评价记录打印数据
    pub(super) async fn get_supplier_evaluation_record_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::supplier_evaluation_record;

        let record = supplier_evaluation_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("供应商评价记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "evaluation_period".to_string(),
            serde_json::json!(record.evaluation_period.clone()),
        );
        data.insert(
            "indicator_id".to_string(),
            serde_json::json!(record.indicator_id),
        );
        data.insert(
            "score".to_string(),
            serde_json::json!(record.score.to_string()),
        );
        data.insert(
            "weighted_score".to_string(),
            serde_json::json!(
                record
                    .weighted_score
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "evaluation_date".to_string(),
            serde_json::json!(
                record
                    .evaluation_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "remark".to_string(),
            serde_json::json!(record.remark.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "supplier_evaluation_record".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }
}

// ==================== xlsx 打印腿构建器（纯函数，输入 get_print_data 产出的 PrintData） ====================
//
// 版式说明：本切片先用现有规整表格 XlsxTable（单工作表布局）。
// 缸号块合并版式（主表 KV 与明细分块、缸号/匹级列合并单元格）待 feat/xlsx-engine-merge
// 车道合并后在 XlsxTable 引擎上升级；构建器已把缸号（lot_no）组装为独立列，
// 明细行以 typed 结构（PurchaseReceiptXlsxRow 等）为升级接口，届时在其下挂匹/卷级子行即可，
// 取数面（get_print_data 与既有 docx 构建器）零改动。
//
// 数据可得性：
// - purchase_receipt_item 只有行级 lot_no，数据模型无匹/卷级明细表 ⇒ 缸号为行级列（非逐匹展开）。
// - purchase_order_item 无缸号要素 ⇒ 采购订单为纯行级表。
// - outsourcing_receipt 为单表记录（无明细行模型，items 恒空），打印数据无供应商档案字段
//   （仅 outsourcing_order_id）⇒ 委外收货以 KV 两列表呈现，供应商名称/明细行两项要素取不到。
// - 状态列（质检/收货状态）与 docx 版一致取原始 token，未做中文词表转换。

/// fail-closed 取打印数据字符串单元格：缺键或非字符串直接报错点名，禁静默兜底
fn xlsx_string_cell(
    data: &HashMap<String, serde_json::Value>,
    key: &str,
) -> Result<String, AppError> {
    match data.get(key) {
        Some(serde_json::Value::String(s)) => Ok(s.clone()),
        Some(other) => Err(AppError::validation(format!(
            "采购 xlsx 打印数据字段 {key} 不是字符串: {other}"
        ))),
        None => Err(AppError::validation(format!(
            "采购 xlsx 打印数据缺少字段: {key}"
        ))),
    }
}

/// 取打印数据展示单元格：字符串原样、数字转字符串（如委外订单 ID 是数值键），其余类型报错
fn xlsx_display_cell(
    data: &HashMap<String, serde_json::Value>,
    key: &str,
) -> Result<String, AppError> {
    match data.get(key) {
        Some(serde_json::Value::String(s)) => Ok(s.clone()),
        Some(serde_json::Value::Number(n)) => Ok(n.to_string()),
        Some(other) => Err(AppError::validation(format!(
            "采购 xlsx 打印数据字段 {key} 类型不支持: {other}"
        ))),
        None => Err(AppError::validation(format!(
            "采购 xlsx 打印数据缺少字段: {key}"
        ))),
    }
}

/// 解析数值单元格（打印数据里数值均为字符串化的 Decimal）
fn xlsx_decimal_cell(
    data: &HashMap<String, serde_json::Value>,
    key: &str,
) -> Result<Decimal, AppError> {
    let s = xlsx_string_cell(data, key)?;
    Decimal::from_str(&s).map_err(|e| {
        AppError::validation(format!("采购 xlsx 打印数据字段 {key} 数值非法: {s} ({e})"))
    })
}

/// 解析可空数值单元格：空串视为未填（返回 None，与 docx 版留空口径一致），非空必须合法
fn xlsx_optional_decimal_cell(
    data: &HashMap<String, serde_json::Value>,
    key: &str,
) -> Result<Option<Decimal>, AppError> {
    let s = xlsx_string_cell(data, key)?;
    if s.is_empty() {
        return Ok(None);
    }
    Decimal::from_str(&s).map(Some).map_err(|e| {
        AppError::validation(format!("采购 xlsx 打印数据字段 {key} 数值非法: {s} ({e})"))
    })
}

/// 主表 KV 行：标签占第 1 列、值占第 2 列，其余补空串对齐明细列宽
fn xlsx_kv_row(label: &str, value: &str, width: usize) -> Vec<String> {
    let mut row = vec![label.to_string(), value.to_string()];
    row.resize(width, String::new());
    row
}

/// 采购收货单 xlsx 明细行视图（升级接口：缸号块合并版式接入后在此结构下挂匹/卷级子行）
pub(crate) struct PurchaseReceiptXlsxRow {
    pub line_no: String,
    pub material_code: String,
    pub material_name: String,
    pub batch_no: String,
    pub color_code: String,
    /// 缸号（行级；数据模型无匹/卷级明细表）
    pub lot_no: String,
    pub quantity: Decimal,
    pub unit_master: String,
    /// 未定价单据为 None（渲染留空，与 docx 版口径一致）
    pub unit_price: Option<Decimal>,
    pub amount: Option<Decimal>,
}

const PURCHASE_RECEIPT_XLSX_HEADERS: [&str; 10] = [
    "序号", "物料编码", "物料名称", "批号", "色号", "缸号", "数量", "单位", "单价", "金额",
];

/// 渲染采购收货单 xlsx：主表 KV 行 → 分隔空行 → 明细行 → 合计行（数量 Σ 恒算；
/// 金额任一行未填则合计金额显式留空，与行级未定价口径一致，不猜 0）
fn render_purchase_receipt_xlsx(
    kv: &[(&'static str, String)],
    rows: &[PurchaseReceiptXlsxRow],
) -> XlsxTable {
    let width = PURCHASE_RECEIPT_XLSX_HEADERS.len();
    let mut table_rows = Vec::with_capacity(kv.len() + rows.len() + 2);
    for (label, value) in kv {
        table_rows.push(xlsx_kv_row(label, value, width));
    }
    table_rows.push(vec![String::new(); width]);
    let mut quantity_sum = Decimal::ZERO;
    let mut amount_sum = Decimal::ZERO;
    let mut amount_unset = false;
    for row in rows {
        quantity_sum += row.quantity;
        match row.amount {
            Some(v) => amount_sum += v,
            None => amount_unset = true,
        }
        table_rows.push(vec![
            row.line_no.clone(),
            row.material_code.clone(),
            row.material_name.clone(),
            row.batch_no.clone(),
            row.color_code.clone(),
            row.lot_no.clone(),
            row.quantity.to_string(),
            row.unit_master.clone(),
            row.unit_price.map(|p| p.to_string()).unwrap_or_default(),
            row.amount.map(|a| a.to_string()).unwrap_or_default(),
        ]);
    }
    table_rows.push(vec![
        "合计".to_string(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        String::new(),
        quantity_sum.to_string(),
        String::new(),
        String::new(),
        if amount_unset {
            String::new()
        } else {
            amount_sum.to_string()
        },
    ]);
    XlsxTable {
        sheet_name: "采购收货单".to_string(),
        headers: PURCHASE_RECEIPT_XLSX_HEADERS
            .iter()
            .map(|s| s.to_string())
            .collect(),
        rows: table_rows,
    }
}

/// 采购收货单 xlsx 打印构建器：主表 KV（单号/供应商/仓库/日期/状态/总额）+ 行级明细（含缸号）
pub(crate) fn build_purchase_receipt_xlsx(print_data: &PrintData) -> Result<XlsxTable, AppError> {
    let data = &print_data.data;
    let kv: Vec<(&'static str, String)> = vec![
        ("单据编号", xlsx_string_cell(data, "receipt_no")?),
        ("供应商", xlsx_string_cell(data, "supplier_name")?),
        ("仓库", xlsx_string_cell(data, "warehouse_name")?),
        ("收货日期", xlsx_string_cell(data, "receipt_date")?),
        ("质检状态", xlsx_string_cell(data, "inspection_status")?),
        ("收货状态", xlsx_string_cell(data, "receipt_status")?),
        ("总数量", xlsx_string_cell(data, "total_quantity")?),
        // 大写金额待 A 车道（feat/amount-in-words）utils 接入后在此追加"大写金额"行
        ("总金额", xlsx_string_cell(data, "total_amount")?),
        ("备注", xlsx_string_cell(data, "notes")?),
    ];
    let mut rows = Vec::with_capacity(print_data.items.len());
    for item in &print_data.items {
        rows.push(PurchaseReceiptXlsxRow {
            line_no: xlsx_string_cell(item, "line_no")?,
            material_code: xlsx_string_cell(item, "material_code")?,
            material_name: xlsx_string_cell(item, "material_name")?,
            batch_no: xlsx_string_cell(item, "batch_no")?,
            color_code: xlsx_string_cell(item, "color_code")?,
            lot_no: xlsx_string_cell(item, "lot_no")?,
            quantity: xlsx_decimal_cell(item, "quantity")?,
            unit_master: xlsx_string_cell(item, "unit_master")?,
            unit_price: xlsx_optional_decimal_cell(item, "unit_price")?,
            amount: xlsx_optional_decimal_cell(item, "amount")?,
        });
    }
    Ok(render_purchase_receipt_xlsx(&kv, &rows))
}

/// 采购订单 xlsx 明细行视图（行级；purchase_order_item 无缸号要素）
pub(crate) struct PurchaseOrderXlsxRow {
    pub line_no: String,
    pub product_code: String,
    pub product_name: String,
    pub quantity: Decimal,
    pub unit_price: Decimal,
    pub tax_percent: Decimal,
    pub total_amount: Decimal,
    pub received_quantity: Decimal,
}

const PURCHASE_ORDER_XLSX_HEADERS: [&str; 8] = [
    "序号", "产品编码", "产品名称", "数量", "单价", "税率%", "金额", "已收数量",
];

/// 渲染采购订单 xlsx：主表 KV 行 → 分隔空行 → 明细行 → 合计行（数量/金额 Σ 逐行累加）
fn render_purchase_order_xlsx(
    kv: &[(&'static str, String)],
    rows: &[PurchaseOrderXlsxRow],
) -> XlsxTable {
    let width = PURCHASE_ORDER_XLSX_HEADERS.len();
    let mut table_rows = Vec::with_capacity(kv.len() + rows.len() + 2);
    for (label, value) in kv {
        table_rows.push(xlsx_kv_row(label, value, width));
    }
    table_rows.push(vec![String::new(); width]);
    let mut quantity_sum = Decimal::ZERO;
    let mut amount_sum = Decimal::ZERO;
    for row in rows {
        quantity_sum += row.quantity;
        amount_sum += row.total_amount;
        table_rows.push(vec![
            row.line_no.clone(),
            row.product_code.clone(),
            row.product_name.clone(),
            row.quantity.to_string(),
            row.unit_price.to_string(),
            row.tax_percent.to_string(),
            row.total_amount.to_string(),
            row.received_quantity.to_string(),
        ]);
    }
    table_rows.push(vec![
        "合计".to_string(),
        String::new(),
        String::new(),
        quantity_sum.to_string(),
        String::new(),
        String::new(),
        amount_sum.to_string(),
        String::new(),
    ]);
    XlsxTable {
        sheet_name: "采购订单".to_string(),
        headers: PURCHASE_ORDER_XLSX_HEADERS
            .iter()
            .map(|s| s.to_string())
            .collect(),
        rows: table_rows,
    }
}

/// 采购订单 xlsx 打印构建器：主表 KV + 行级明细（无缸号要素，纯行级表）
pub(crate) fn build_purchase_order_xlsx(print_data: &PrintData) -> Result<XlsxTable, AppError> {
    let data = &print_data.data;
    let kv: Vec<(&'static str, String)> = vec![
        ("单据编号", xlsx_string_cell(data, "order_no")?),
        ("供应商", xlsx_string_cell(data, "supplier_name")?),
        ("下单日期", xlsx_string_cell(data, "order_date")?),
        ("期望交期", xlsx_string_cell(data, "expected_delivery_date")?),
        ("实际交货日期", xlsx_string_cell(data, "actual_delivery_date")?),
        ("仓库", xlsx_string_cell(data, "warehouse_name")?),
        ("币种", xlsx_string_cell(data, "currency")?),
        // 大写金额待 A 车道（feat/amount-in-words）utils 接入后在此追加"大写金额"行
        ("总金额", xlsx_string_cell(data, "total_amount")?),
        ("总数量", xlsx_string_cell(data, "total_quantity")?),
        ("备注", xlsx_string_cell(data, "notes")?),
    ];
    let mut rows = Vec::with_capacity(print_data.items.len());
    for item in &print_data.items {
        rows.push(PurchaseOrderXlsxRow {
            line_no: xlsx_string_cell(item, "line_no")?,
            product_code: xlsx_string_cell(item, "product_code")?,
            product_name: xlsx_string_cell(item, "product_name")?,
            quantity: xlsx_decimal_cell(item, "quantity")?,
            unit_price: xlsx_decimal_cell(item, "unit_price")?,
            tax_percent: xlsx_decimal_cell(item, "tax_percent")?,
            total_amount: xlsx_decimal_cell(item, "total_amount")?,
            received_quantity: xlsx_decimal_cell(item, "received_quantity")?,
        });
    }
    Ok(render_purchase_order_xlsx(&kv, &rows))
}

/// 委外收货单 xlsx 打印构建器（KV 两列表）：
/// outsourcing_receipt 为单表记录（无明细行模型，items 恒空），打印数据无供应商档案字段
/// （仅 outsourcing_order_id）⇒ 供应商名称与明细行两项要素取不到，注明不渲染。
/// dye_lot_no（缸号）行级可得；质检状态在取数面已转中文词表 label。
pub(crate) fn build_outsource_receipt_xlsx(print_data: &PrintData) -> Result<XlsxTable, AppError> {
    let data = &print_data.data;
    let pairs: Vec<(&'static str, String)> = vec![
        ("单据编号", xlsx_string_cell(data, "receipt_no")?),
        // 委外订单为数值 ID（打印数据无订单号/供应商名称字段，注明取不到）
        ("委外订单ID", xlsx_display_cell(data, "outsourcing_order_id")?),
        ("收货日期", xlsx_string_cell(data, "receipt_date")?),
        ("色号", xlsx_string_cell(data, "color_no")?),
        ("缸号", xlsx_string_cell(data, "dye_lot_no")?),
        ("批号", xlsx_string_cell(data, "batch_no")?),
        ("退货数量", xlsx_string_cell(data, "return_quantity")?),
        ("损耗数量", xlsx_string_cell(data, "loss_quantity")?),
        ("损耗率", xlsx_string_cell(data, "loss_rate")?),
        ("单位成本", xlsx_string_cell(data, "unit_cost")?),
        ("总成本", xlsx_string_cell(data, "total_cost")?),
        ("质检状态", xlsx_string_cell(data, "quality_status")?),
        ("等级", xlsx_string_cell(data, "grade")?),
    ];
    Ok(XlsxTable {
        sheet_name: "委外收货单".to_string(),
        headers: vec!["项目".to_string(), "内容".to_string()],
        rows: pairs
            .into_iter()
            .map(|(label, value)| vec![label.to_string(), value])
            .collect(),
    })
}

#[cfg(test)]
mod xlsx_builder_tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn kv_data(pairs: &[(&str, &str)]) -> HashMap<String, serde_json::Value> {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), serde_json::json!(v)))
            .collect()
    }

    fn receipt_print_data(items: Vec<HashMap<String, serde_json::Value>>) -> PrintData {
        PrintData {
            template: "purchase_receipt".to_string(),
            data: kv_data(&[
                ("receipt_no", "PR20260101001"),
                ("supplier_name", "华丰纺织"),
                ("warehouse_name", "一号仓"),
                ("receipt_date", "2026-01-01"),
                ("inspection_status", "pending"),
                ("receipt_status", "draft"),
                ("total_quantity", "30"),
                ("total_amount", "5700"),
                ("notes", "急单"),
            ]),
            items,
            image: None,
        }
    }

    fn receipt_item(
        line_no: &str,
        lot_no: &str,
        quantity: &str,
        amount: &str,
    ) -> HashMap<String, serde_json::Value> {
        kv_data(&[
            ("line_no", line_no),
            ("material_code", "M001"),
            ("material_name", "全棉帆布"),
            ("batch_no", "B20260001"),
            ("color_code", "C01"),
            ("lot_no", lot_no),
            ("quantity", quantity),
            ("unit_master", "米"),
            ("unit_price", "10.5"),
            ("amount", amount),
        ])
    }

    /// 明细行数逐行对：3 行明细 + KV 块 + 空行 + 合计行
    #[test]
    fn receipt_row_layout_counts() {
        let print_data = receipt_print_data(vec![
            receipt_item("1", "G001", "10", "105"),
            receipt_item("2", "G002", "10", "105"),
            receipt_item("3", "G003", "10", "105"),
        ]);
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        assert_eq!(table.sheet_name, "采购收货单");
        assert_eq!(table.headers.len(), 10);
        assert_eq!(table.rows.len(), 9 + 1 + 3 + 1);
    }

    /// 缸号逐行对：lot_no 独立列（第 6 列）与输入逐行一致
    #[test]
    fn receipt_lot_no_column_row_by_row() {
        let lots = ["G-A01", "G-B02", "G-C03"];
        let print_data = receipt_print_data(
            lots.iter()
                .enumerate()
                .map(|(i, lot)| receipt_item(&(i + 1).to_string(), lot, "10", "105"))
                .collect(),
        );
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        let detail_start = 9 + 1;
        for (i, lot) in lots.iter().enumerate() {
            assert_eq!(table.rows[detail_start + i][5], *lot);
        }
    }

    /// 汇总=Σ：合计行数量与金额为明细逐行累加
    #[test]
    fn receipt_total_is_sum_of_rows() {
        let print_data = receipt_print_data(vec![
            receipt_item("1", "G001", "10.5", "1000.5"),
            receipt_item("2", "G002", "20", "2000"),
            receipt_item("3", "G003", "30", "2699.5"),
        ]);
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        let total = &table.rows[table.rows.len() - 1];
        assert_eq!(total[0], "合计");
        assert_eq!(total[6].parse::<Decimal>().unwrap(), dec!(60.5));
        assert_eq!(total[9].parse::<Decimal>().unwrap(), dec!(5700));
    }

    /// 任一行金额未填 ⇒ 合计金额显式留空（与行级未定价口径一致，不猜 0）
    #[test]
    fn receipt_total_amount_blank_when_any_row_amount_unset() {
        let mut item = receipt_item("1", "G001", "10", "");
        item.insert("unit_price".to_string(), serde_json::json!(""));
        let print_data = receipt_print_data(vec![item, receipt_item("2", "G002", "10", "105")]);
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        let total = &table.rows[table.rows.len() - 1];
        assert_eq!(total[6], "20");
        assert_eq!(total[9], "");
    }

    /// 明细缺键 fail-closed：缺 lot_no 直接报错点名，不静默兜底
    #[test]
    fn receipt_missing_item_key_fails() {
        let mut item = receipt_item("1", "G001", "10", "105");
        item.remove("lot_no");
        let print_data = receipt_print_data(vec![item]);
        // XlsxTable 未实现 Debug（utils/xlsx_export.rs 归 B 车道，不可改），经 Option::err 取错误
        let err = build_purchase_receipt_xlsx(&print_data)
            .err()
            .expect("预期 fail-closed 报错");
        assert!(err.to_string().contains("lot_no"));
    }

    /// 主表缺键 fail-closed：缺 receipt_no 直接报错
    #[test]
    fn receipt_missing_main_key_fails() {
        let mut print_data = receipt_print_data(vec![]);
        print_data.data.remove("receipt_no");
        assert!(build_purchase_receipt_xlsx(&print_data).is_err());
    }

    /// 类型不符 fail-closed：receipt_no 非字符串直接报错
    #[test]
    fn receipt_non_string_cell_fails() {
        let mut print_data = receipt_print_data(vec![]);
        print_data
            .data
            .insert("receipt_no".to_string(), serde_json::json!(123));
        assert!(build_purchase_receipt_xlsx(&print_data).is_err());
    }

    /// 主表 KV 值逐项对：单据编号/供应商/总金额
    #[test]
    fn receipt_kv_pairs_carry_values() {
        let print_data = receipt_print_data(vec![receipt_item("1", "G001", "10", "105")]);
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        assert_eq!(table.rows[0][0], "单据编号");
        assert_eq!(table.rows[0][1], "PR20260101001");
        assert_eq!(table.rows[1][0], "供应商");
        assert_eq!(table.rows[1][1], "华丰纺织");
        assert_eq!(table.rows[7][0], "总金额");
        assert_eq!(table.rows[7][1], "5700");
    }

    /// 无明细行：合计行数量为 0，不报错（空明细是可表示的数据态）
    #[test]
    fn receipt_empty_items_total_zero() {
        let print_data = receipt_print_data(vec![]);
        let table = build_purchase_receipt_xlsx(&print_data).unwrap();
        let total = &table.rows[table.rows.len() - 1];
        assert_eq!(total[6].parse::<Decimal>().unwrap(), Decimal::ZERO);
    }

    fn order_print_data(items: Vec<HashMap<String, serde_json::Value>>) -> PrintData {
        PrintData {
            template: "purchase_order".to_string(),
            data: kv_data(&[
                ("order_no", "PO20260101001"),
                ("supplier_name", "华丰纺织"),
                ("order_date", "2026-01-01"),
                ("expected_delivery_date", "2026-01-10"),
                ("actual_delivery_date", ""),
                ("warehouse_name", "一号仓"),
                ("currency", "CNY"),
                ("total_amount", "2100"),
                ("total_quantity", "200"),
                ("notes", ""),
            ]),
            items,
            image: None,
        }
    }

    fn order_item(
        line_no: &str,
        quantity: &str,
        total_amount: &str,
    ) -> HashMap<String, serde_json::Value> {
        kv_data(&[
            ("line_no", line_no),
            ("product_code", "P001"),
            ("product_name", "全棉帆布 21S"),
            ("quantity", quantity),
            ("unit_price", "10.5"),
            ("tax_percent", "13"),
            ("total_amount", total_amount),
            ("received_quantity", "0"),
        ])
    }

    /// 订单明细行金额逐行对 + 汇总=Σ
    #[test]
    fn order_rows_and_total_sum() {
        let print_data = order_print_data(vec![
            order_item("1", "100", "1050"),
            order_item("2", "100", "1050"),
        ]);
        let table = build_purchase_order_xlsx(&print_data).unwrap();
        assert_eq!(table.sheet_name, "采购订单");
        assert_eq!(table.headers.len(), 8);
        // KV 10 行 + 空行 + 2 明细 + 合计
        assert_eq!(table.rows.len(), 10 + 1 + 2 + 1);
        assert_eq!(table.rows[11][1], "P001");
        assert_eq!(table.rows[11][6], "1050");
        assert_eq!(table.rows[12][6], "1050");
        let total = &table.rows[table.rows.len() - 1];
        assert_eq!(total[3].parse::<Decimal>().unwrap(), dec!(200));
        assert_eq!(total[6].parse::<Decimal>().unwrap(), dec!(2100));
    }

    /// 订单明细缺键 fail-closed：缺 product_name 直接报错
    #[test]
    fn order_missing_item_key_fails() {
        let mut item = order_item("1", "100", "1050");
        item.remove("product_name");
        let print_data = order_print_data(vec![item]);
        let err = build_purchase_order_xlsx(&print_data)
            .err()
            .expect("预期 fail-closed 报错");
        assert!(err.to_string().contains("product_name"));
    }

    /// 订单明细数值非法 fail-closed：金额非数值直接报错
    #[test]
    fn order_bad_numeric_cell_fails() {
        let item = order_item("1", "100", "abc");
        let print_data = order_print_data(vec![item]);
        assert!(build_purchase_order_xlsx(&print_data).is_err());
    }

    fn outsource_print_data() -> PrintData {
        PrintData {
            template: "outsourcing_receipt".to_string(),
            data: kv_data(&[
                ("receipt_no", "OR20260101001"),
                ("outsourcing_order_id", "42"),
                ("receipt_date", "2026-01-01"),
                ("color_no", "深蓝"),
                ("dye_lot_no", "D20260001"),
                ("batch_no", "B20260001"),
                ("return_quantity", "0"),
                ("loss_quantity", "2"),
                ("loss_rate", "0.02"),
                ("unit_cost", "8.5"),
                ("total_cost", "170"),
                ("quality_status", "合格"),
                ("grade", "一等品"),
            ]),
            items: Vec::new(),
            image: None,
        }
    }

    /// 委外收货 KV 两列表：缸号 dye_lot_no 与中文质检状态逐项对
    #[test]
    fn outsource_kv_pairs_and_dye_lot_no() {
        let table = build_outsource_receipt_xlsx(&outsource_print_data()).unwrap();
        assert_eq!(table.sheet_name, "委外收货单");
        assert_eq!(table.headers, vec!["项目".to_string(), "内容".to_string()]);
        assert_eq!(table.rows.len(), 13);
        let dye_lot = table.rows.iter().find(|r| r[0] == "缸号").unwrap();
        assert_eq!(dye_lot[1], "D20260001");
        let quality = table.rows.iter().find(|r| r[0] == "质检状态").unwrap();
        assert_eq!(quality[1], "合格");
    }

    /// 委外订单 ID 是数值键：display 单元格原样转字符串，不报错
    #[test]
    fn outsource_numeric_order_id_display() {
        let table = build_outsource_receipt_xlsx(&outsource_print_data()).unwrap();
        let order_id = table.rows.iter().find(|r| r[0] == "委外订单ID").unwrap();
        assert_eq!(order_id[1], "42");
    }

    /// 委外收货缺缸号 fail-closed：缺 dye_lot_no 直接报错
    #[test]
    fn outsource_missing_dye_lot_no_fails() {
        let mut print_data = outsource_print_data();
        print_data.data.remove("dye_lot_no");
        let err = build_outsource_receipt_xlsx(&print_data)
            .err()
            .expect("预期 fail-closed 报错");
        assert!(err.to_string().contains("dye_lot_no"));
    }
}
