//! purchase 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order, QueryFilter, QueryOrder, QuerySelect, RelationTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 采购订单打印数据：订单主表 + 供应商 + 仓库 + 明细项（含产品）
    async fn get_purchase_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    async fn get_purchase_receipt_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    async fn get_purchase_return_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    async fn get_purchase_contract_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    async fn get_purchase_inspection_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    async fn get_supplier_evaluation_record_print_data(
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
