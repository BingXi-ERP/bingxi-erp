//! sales 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order, QueryFilter, QueryOrder, QuerySelect, RelationTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::{PrintData, SalesDeliveryPrintRelations};

impl super::PrintService {
    /// 销售订单打印数据：订单主表 + 客户 + 明细项（含产品）
    async fn get_sales_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        let (order, customer, items, products) =
            Self::fetch_sales_order_relations(&self.db, id).await?;
        let data = Self::build_sales_order_main_data(&order, customer.as_ref());
        let item_list = Self::build_sales_order_item_list(items, &products);
        Ok(PrintData {
            template: "sales_order".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 销售订单打印：批量查询订单 + 客户 + 明细 + 产品
    async fn fetch_sales_order_relations(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<
        (
            crate::models::sales_order::Model,
            Option<crate::models::customer::Model>,
            Vec<crate::models::sales_order_item::Model>,
            Vec<Option<crate::models::product::Model>>,
        ),
        AppError,
    > {
        use crate::models::{customer, product, sales_order, sales_order_item};
        let order = sales_order::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售订单 {} 未找到", id)))?;
        let customer = order.find_related(customer::Entity).one(db).await?;
        let items = order
            .find_related(sales_order_item::Entity)
            .order_by(sales_order_item::Column::Id, Order::Asc)
            .all(db)
            .await?;
        let products = items.load_one(product::Entity, db).await?;
        Ok((order, customer, items, products))
    }


    /// 销售订单打印：构造主表 data
    fn build_sales_order_main_data(
        order: &crate::models::sales_order::Model,
        customer: Option<&crate::models::customer::Model>,
    ) -> HashMap<String, serde_json::Value> {
        let mut data = HashMap::new();
        data.insert(
            "order_no".to_string(),
            serde_json::json!(order.order_no.clone()),
        );
        data.insert(
            "customer_name".to_string(),
            serde_json::json!(
                customer
                    .map(|c| c.customer_name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "customer_code".to_string(),
            serde_json::json!(
                customer
                    .map(|c| c.customer_code.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "order_date".to_string(),
            serde_json::json!(order.order_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "required_date".to_string(),
            serde_json::json!(
                order
                    .required_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
            ),
        );
        data.insert(
            "ship_date".to_string(),
            serde_json::json!(
                order
                    .ship_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(order.status.clone()),
        );
        data.insert(
            "subtotal".to_string(),
            serde_json::json!(order.subtotal.to_string()),
        );
        data.insert(
            "tax_amount".to_string(),
            serde_json::json!(order.tax_amount.to_string()),
        );
        data.insert(
            "discount_amount".to_string(),
            serde_json::json!(order.discount_amount.to_string()),
        );
        data.insert(
            "shipping_cost".to_string(),
            serde_json::json!(order.shipping_cost.to_string()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(order.total_amount.to_string()),
        );
        data.insert(
            "paid_amount".to_string(),
            serde_json::json!(order.paid_amount.to_string()),
        );
        data.insert(
            "balance_amount".to_string(),
            serde_json::json!(order.balance_amount.to_string()),
        );
        data.insert(
            "shipping_address".to_string(),
            serde_json::json!(order.shipping_address.clone().unwrap_or_default()),
        );
        data.insert(
            "billing_address".to_string(),
            serde_json::json!(order.billing_address.clone().unwrap_or_default()),
        );
        data.insert(
            "notes".to_string(),
            serde_json::json!(order.notes.clone().unwrap_or_default()),
        );
        data
    }


    /// 销售订单打印：构造明细行列表
    fn build_sales_order_item_list(
        items: Vec<crate::models::sales_order_item::Model>,
        products: &[Option<crate::models::product::Model>],
    ) -> Vec<HashMap<String, serde_json::Value>> {
        let mut item_list = Vec::with_capacity(items.len());
        for (i, item) in items.into_iter().enumerate() {
            let product = products[i].as_ref();
            let mut row = HashMap::new();
            row.insert(
                "line_no".to_string(),
                serde_json::json!((i + 1).to_string()),
            );
            row.insert(
                "product_code".to_string(),
                serde_json::json!(product.map(|p| p.code.clone()).unwrap_or_default()),
            );
            row.insert(
                "product_name".to_string(),
                serde_json::json!(product.map(|p| p.name.clone()).unwrap_or_default()),
            );
            row.insert("color_no".to_string(), serde_json::json!(item.color_no));
            row.insert(
                "color_name".to_string(),
                serde_json::json!(item.color_name.unwrap_or_default()),
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
                "final_price".to_string(),
                serde_json::json!(item.final_price.map(|p| p.to_string()).unwrap_or_default()),
            );
            row.insert(
                "subtotal".to_string(),
                serde_json::json!(item.subtotal.to_string()),
            );
            row.insert(
                "tax_amount".to_string(),
                serde_json::json!(item.tax_amount.to_string()),
            );
            row.insert(
                "total_amount".to_string(),
                serde_json::json!(item.total_amount.to_string()),
            );
            row.insert(
                "quantity_meters".to_string(),
                serde_json::json!(item.quantity_meters.to_string()),
            );
            row.insert(
                "quantity_kg".to_string(),
                serde_json::json!(item.quantity_kg.to_string()),
            );
            item_list.push(row);
        }
        item_list
    }


    /// 销售合同打印数据：合同主表 + 客户
    async fn get_sales_contract_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::{customer, sales_contract};

        let contract = sales_contract::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售合同 {} 未找到", id)))?;

        let customer = customer::Entity::find_by_id(contract.customer_id)
            .one(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "contract_no".to_string(),
            serde_json::json!(contract.contract_no),
        );
        data.insert(
            "contract_name".to_string(),
            serde_json::json!(contract.contract_name),
        );
        data.insert(
            "contract_type".to_string(),
            serde_json::json!(contract.contract_type.unwrap_or_default()),
        );
        data.insert(
            "customer_name".to_string(),
            serde_json::json!(contract.customer_name.clone().unwrap_or_else(|| {
                customer
                    .as_ref()
                    .map(|c| c.customer_name.clone())
                    .unwrap_or_default()
            })),
        );
        data.insert(
            "customer_code".to_string(),
            serde_json::json!(
                customer
                    .as_ref()
                    .map(|c| c.customer_code.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(
                contract
                    .total_amount
                    .map(|a| a.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "signed_date".to_string(),
            serde_json::json!(
                contract
                    .signed_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "effective_date".to_string(),
            serde_json::json!(
                contract
                    .effective_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "expiry_date".to_string(),
            serde_json::json!(
                contract
                    .expiry_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "payment_terms".to_string(),
            serde_json::json!(contract.payment_terms.unwrap_or_default()),
        );
        data.insert(
            "payment_method".to_string(),
            serde_json::json!(contract.payment_method.unwrap_or_default()),
        );
        data.insert(
            "delivery_date".to_string(),
            serde_json::json!(
                contract
                    .delivery_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "delivery_location".to_string(),
            serde_json::json!(contract.delivery_location.unwrap_or_default()),
        );
        data.insert("status".to_string(), serde_json::json!(contract.status));

        Ok(PrintData {
            template: "sales_contract".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 销售报价单打印数据
    async fn get_sales_quotation_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::sales_quotation;

        use crate::models::sales_quotation_item;

        let record = sales_quotation::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售报价单 {} 未找到", id)))?;

        let items = sales_quotation_item::Entity::find()
            .filter(sales_quotation_item::Column::QuotationId.eq(id))
            .order_by(sales_quotation_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "quotation_no".to_string(),
            serde_json::json!(record.quotation_no.clone()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "quotation_date".to_string(),
            serde_json::json!(record.quotation_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "valid_until".to_string(),
            serde_json::json!(record.valid_until.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "currency".to_string(),
            serde_json::json!(record.currency.clone()),
        );
        data.insert(
            "price_terms".to_string(),
            serde_json::json!(record.price_terms.clone()),
        );
        data.insert(
            "subtotal".to_string(),
            serde_json::json!(record.subtotal.to_string()),
        );
        data.insert(
            "tax_amount".to_string(),
            serde_json::json!(record.tax_amount.to_string()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(record.total_amount.to_string()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("product_id".to_string(), serde_json::json!(item.product_id));
            row.insert(
                "color_code".to_string(),
                serde_json::json!(item.color_code.clone().unwrap_or_default()),
            );
            row.insert(
                "specification".to_string(),
                serde_json::json!(item.specification.clone().unwrap_or_default()),
            );
            row.insert("unit".to_string(), serde_json::json!(item.unit.clone()));
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "unit_price".to_string(),
                serde_json::json!(item.unit_price.to_string()),
            );
            row.insert(
                "amount".to_string(),
                serde_json::json!(item.amount.to_string()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "sales_quotation".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 销售发货单打印数据
    ///
    /// 出参键即 docx 正文栏名与明细表头。主表取客户、仓库、来源销售订单、制单人四个档案，
    /// 明细取产品档案的名称编号规格与计量单位、色号档案的颜色名称；全部走批量关联查询，
    /// 无逐行再查，档案缺席一律点名报错而非留空
    async fn get_sales_delivery_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        let relations = Self::fetch_sales_delivery_relations(&self.db, id).await?;
        Ok(PrintData {
            template: "sales_delivery".to_string(),
            data: Self::build_sales_delivery_main_data(&relations),
            items: Self::build_sales_delivery_item_list(&relations),
            image: None,
        })
    }


    /// 销售发货单打印：一次性取单据主体、四个关联档案、明细行、产品与色号名称字典
    async fn fetch_sales_delivery_relations(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<SalesDeliveryPrintRelations, AppError> {
        use crate::models::{
            customer, sales_delivery, sales_delivery_item, sales_order, user, warehouse,
        };

        let record = sales_delivery::Entity::find_by_id(id)
            .one(db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售发货单 {} 未找到", id)))?;

        let customer = record
            .find_related(customer::Entity)
            .one(db)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "销售发货单 {} 的客户档案(ID={})缺失",
                    id, record.customer_id
                ))
            })?;

        let warehouse = record
            .find_related(warehouse::Entity)
            .one(db)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "销售发货单 {} 的仓库档案(ID={})缺失",
                    id, record.warehouse_id
                ))
            })?;

        let order = record
            .find_related(sales_order::Entity)
            .one(db)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "销售发货单 {} 的来源销售订单(ID={})缺失",
                    id, record.order_id
                ))
            })?;

        let creator = record
            .find_related(user::Entity)
            .one(db)
            .await?
            .ok_or_else(|| {
                AppError::not_found(format!(
                    "销售发货单 {} 的制单人账号(ID={})缺失",
                    id, record.created_by
                ))
            })?;

        let items = sales_delivery_item::Entity::find()
            .filter(sales_delivery_item::Column::DeliveryId.eq(id))
            .order_by(sales_delivery_item::Column::Id, Order::Asc)
            .all(db)
            .await?;

        let products = Self::load_delivery_products(db, &items, id).await?;
        let color_names = Self::load_delivery_color_names(db, &items).await?;

        Ok(SalesDeliveryPrintRelations {
            record,
            customer,
            warehouse,
            order,
            creator,
            items,
            products,
            color_names,
        })
    }


    /// 销售发货单打印：按明细行批量取产品档案，缺席行点名到具体产品编号
    async fn load_delivery_products(
        db: &DatabaseConnection,
        items: &[crate::models::sales_delivery_item::Model],
        id: i32,
    ) -> Result<Vec<crate::models::product::Model>, AppError> {
        use crate::models::product;

        let loaded = items.load_one(product::Entity, db).await?;
        let mut products = Vec::with_capacity(loaded.len());
        for (item, found) in items.iter().zip(loaded) {
            products.push(found.ok_or_else(|| {
                AppError::not_found(format!(
                    "销售发货单 {} 的明细产品档案(ID={})缺失",
                    id, item.product_id
                ))
            })?);
        }
        Ok(products)
    }


    /// 销售发货单打印：按明细行的产品与色号批量取色号档案名称，键为 (产品编号, 色号)
    /// 明细色号可以是色号档案之外的自由文本，未登记时该键缺席，出参留空由调用点如实体现
    async fn load_delivery_color_names(
        db: &DatabaseConnection,
        items: &[crate::models::sales_delivery_item::Model],
    ) -> Result<HashMap<(i32, String), String>, AppError> {
        use crate::models::product_color;

        let product_ids: Vec<i32> = items.iter().map(|item| item.product_id).collect();
        if product_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let colors = product_color::Entity::find()
            .filter(product_color::Column::ProductId.is_in(product_ids))
            .all(db)
            .await?;

        Ok(colors
            .into_iter()
            .map(|color| ((color.product_id, color.color_no), color.color_name))
            .collect())
    }


    /// 销售发货单打印：主表栏次；可空列按空串出参，非空档案缺席已在上游点名报错
    fn build_sales_delivery_main_data(
        relations: &SalesDeliveryPrintRelations,
    ) -> HashMap<String, serde_json::Value> {
        let record = &relations.record;
        let mut data = HashMap::new();
        data.insert(
            "单号".to_string(),
            serde_json::json!(record.delivery_no.clone()),
        );
        data.insert(
            "送货日期".to_string(),
            serde_json::json!(record.delivery_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "客户名称".to_string(),
            serde_json::json!(relations.customer.customer_name.clone()),
        );
        data.insert(
            "送货地址".to_string(),
            serde_json::json!(relations.customer.address.clone().unwrap_or_default()),
        );
        data.insert(
            "发货仓库".to_string(),
            serde_json::json!(relations.warehouse.name.clone()),
        );
        data.insert(
            "来源销售订单号".to_string(),
            serde_json::json!(relations.order.order_no.clone()),
        );
        data.insert("状态".to_string(), serde_json::json!(record.status.clone()));
        data.insert(
            "总数量".to_string(),
            serde_json::json!(record.total_quantity.to_string()),
        );
        data.insert(
            "总金额(元)".to_string(),
            serde_json::json!(record.total_amount.to_string()),
        );
        data.insert(
            "制单人".to_string(),
            serde_json::json!(
                relations
                    .creator
                    .real_name
                    .clone()
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| relations.creator.username.clone())
            ),
        );
        data.insert(
            "备注".to_string(),
            serde_json::json!(record.remarks.clone().unwrap_or_default()),
        );
        data
    }


    /// 销售发货单打印：明细栏次；产品与色号名称按行下标取自批量结果
    fn build_sales_delivery_item_list(
        relations: &SalesDeliveryPrintRelations,
    ) -> Vec<HashMap<String, serde_json::Value>> {
        let mut rows = Vec::with_capacity(relations.items.len());
        for (item, product) in relations.items.iter().zip(relations.products.iter()) {
            let mut row = HashMap::new();
            row.insert("品名".to_string(), serde_json::json!(product.name.clone()));
            row.insert("编号".to_string(), serde_json::json!(product.code.clone()));
            row.insert(
                "规格".to_string(),
                serde_json::json!(product.specification.clone().unwrap_or_default()),
            );
            row.insert(
                "计量单位".to_string(),
                serde_json::json!(product.unit.clone()),
            );
            row.insert("批次".to_string(), serde_json::json!(item.batch_no.clone()));
            row.insert("色号".to_string(), serde_json::json!(item.color_no.clone()));
            row.insert(
                "颜色".to_string(),
                serde_json::json!(
                    relations
                        .color_names
                        .get(&(item.product_id, item.color_no.clone()))
                        .cloned()
                        .unwrap_or_default()
                ),
            );
            row.insert(
                "缸号".to_string(),
                serde_json::json!(item.dye_lot_no.clone()),
            );
            row.insert(
                "卷号".to_string(),
                serde_json::json!(item.piece_no.clone().unwrap_or_default()),
            );
            row.insert(
                "数量".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "单价(元)".to_string(),
                serde_json::json!(item.unit_price.to_string()),
            );
            row.insert(
                "金额(元)".to_string(),
                serde_json::json!(item.amount.to_string()),
            );
            row.insert(
                "备注".to_string(),
                serde_json::json!(item.remarks.clone().unwrap_or_default()),
            );
            rows.push(row);
        }
        rows
    }


    /// 销售退货单打印数据
    async fn get_sales_return_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::sales_return;

        use crate::models::sales_return_item;

        let record = sales_return::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("销售退货单 {} 未找到", id)))?;

        let items = sales_return_item::Entity::find()
            .filter(sales_return_item::Column::ReturnId.eq(id))
            .order_by(sales_return_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "return_no".to_string(),
            serde_json::json!(record.return_no.clone()),
        );
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "return_date".to_string(),
            serde_json::json!(record.return_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "warehouse_id".to_string(),
            serde_json::json!(record.warehouse_id),
        );
        data.insert(
            "reason".to_string(),
            serde_json::json!(record.reason.clone()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(record.total_amount.to_string()),
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
                "amount".to_string(),
                serde_json::json!(item.total_amount.to_string()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "sales_return".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 售后服务单打印数据
    async fn get_after_sales_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::after_sales;

        let record = after_sales::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("售后服务单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "custom_order_id".to_string(),
            serde_json::json!(record.custom_order_id),
        );
        data.insert(
            "issue_type".to_string(),
            serde_json::json!(record.issue_type.clone()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "description".to_string(),
            serde_json::json!(record.description.clone()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "opened_at".to_string(),
            serde_json::json!(record.opened_at.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "closed_at".to_string(),
            serde_json::json!(
                record
                    .closed_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "resolution".to_string(),
            serde_json::json!(record.resolution.clone().unwrap_or_default()),
        );
        data.insert(
            "refund_amount".to_string(),
            serde_json::json!(
                record
                    .refund_amount
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "evaluation_score".to_string(),
            serde_json::json!(
                record
                    .evaluation_score
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "evaluation_comment".to_string(),
            serde_json::json!(record.evaluation_comment.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "after_sales".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 客户信用额度打印数据
    ///
    /// {id} 是 customer_credit_ratings.id 行主键（与 /customer-credits/{id} 系列
    /// 端点的客户自然键不同义）。客户名单次 LEFT JOIN 取 customers 真值，与列表/详情
    /// 同一条富化链路：本表冗余的 customer_name 列在写入路径从不赋值，直读它会把打印件
    /// 的客户名印成空白。
    async fn get_customer_credit_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::services::customer_credit_service::CustomerCreditService;

        let record = CustomerCreditService::new(self.db.clone())
            .get_view_by_row_id(id)
            .await?
            .ok_or_else(|| AppError::not_found(format!("客户信用额度 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "customer_name".to_string(),
            serde_json::json!(record.customer_name.clone().unwrap_or_default()),
        );
        data.insert(
            "credit_level".to_string(),
            serde_json::json!(record.credit_level.clone().unwrap_or_default()),
        );
        data.insert(
            "credit_score".to_string(),
            serde_json::json!(
                record
                    .credit_score
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "credit_limit".to_string(),
            serde_json::json!(record.credit_limit.to_string()),
        );
        data.insert(
            "used_credit".to_string(),
            serde_json::json!(record.used_credit.to_string()),
        );
        data.insert(
            "available_credit".to_string(),
            serde_json::json!(record.available_credit.to_string()),
        );
        data.insert(
            "credit_days".to_string(),
            serde_json::json!(record.credit_days),
        );
        data.insert(
            "last_assessment_date".to_string(),
            serde_json::json!(
                record
                    .last_assessment_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "customer_credit".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 定制订单打印数据
    async fn get_custom_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::custom_order;

        let record = custom_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("定制订单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "order_no".to_string(),
            serde_json::json!(record.order_no.clone()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "product_id".to_string(),
            serde_json::json!(record.product_id),
        );
        data.insert("color_id".to_string(), serde_json::json!(record.color_id));
        data.insert("spec".to_string(), serde_json::json!(record.spec.clone()));
        data.insert(
            "quantity".to_string(),
            serde_json::json!(record.quantity.to_string()),
        );
        data.insert("unit".to_string(), serde_json::json!(record.unit.clone()));
        data.insert(
            "custom_requirements".to_string(),
            serde_json::json!(record.custom_requirements.clone()),
        );
        data.insert(
            "yarn_spec".to_string(),
            serde_json::json!(record.yarn_spec.clone().unwrap_or_default()),
        );
        data.insert(
            "dye_method".to_string(),
            serde_json::json!(record.dye_method.clone().unwrap_or_default()),
        );
        data.insert(
            "finishing_method".to_string(),
            serde_json::json!(record.finishing_method.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "expected_delivery_date".to_string(),
            serde_json::json!(
                record
                    .expected_delivery_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
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
        data.insert(
            "currency".to_string(),
            serde_json::json!(record.currency.clone()),
        );

        Ok(PrintData {
            template: "custom_order".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

}
