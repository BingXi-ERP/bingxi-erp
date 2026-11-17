//! sales 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, LoaderTrait, ModelTrait, Order, QueryFilter,
    QueryOrder,
};
use std::collections::HashMap;
use std::sync::Arc;

use super::{PrintData, SalesDeliveryPrintRelations};

impl super::PrintService {
    /// 销售订单打印数据：订单主表 + 客户 + 明细项（含产品）
    pub(super) async fn get_sales_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_sales_contract_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_sales_quotation_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_sales_delivery_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_sales_return_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_after_sales_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_customer_credit_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
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
    pub(super) async fn get_custom_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
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

// ----------------------------------------------------------------------
// 销售域 xlsx 打印腿（第一批核心：销售订单 / 销售发货单）
// ----------------------------------------------------------------------

/// 销售域单据 xlsx 打印中间结构：与 [`crate::utils::xlsx_export::XlsxTable`] 解耦的版式描述。
///
/// 为什么不直接产 XlsxTable：用户真实单据（细码单/调样单/销售单）是 WPS 表格版式，
/// 缸号块合并等富版式待 xlsx 引擎增强车道（feat/xlsx-engine-merge）落地后升级；
/// 本结构把主表 KV、明细表头/行、汇总 KV、总金额与金额大写占位分字段保存，
/// 届时只需替换 [`SalesXlsxPrintDoc::to_xlsx_table`] 的铺排逻辑，取数构建器零改动。
/// 当前版式 = 单一规整表格（沿用 utils/xlsx_export.rs，只调用不改）：
/// 首行为明细表头（冻结行），数据区顶部为主表 KV 行（label/value 两列，其余列空串），
/// 空行分隔后接明细行，再空行接汇总 KV 行。
#[derive(Debug)]
pub(crate) struct SalesXlsxPrintDoc {
    /// 工作表名（如 "销售订单" / "销售发货单"）
    pub sheet_name: String,
    /// 下载文件名（不含扩展名，如 "销售订单_SO20260101001"）
    pub filename: String,
    /// 主表 KV 栏次（label, value）
    pub main_kv: Vec<(String, String)>,
    /// 明细表头
    pub headers: Vec<String>,
    /// 明细数据行（每行长度与 headers 一致）
    pub rows: Vec<Vec<String>>,
    /// 汇总 KV 栏次（label, value）
    pub summary_kv: Vec<(String, String)>,
    /// 单据总金额原始值（A 车道 feat/amount-in-words 注入大写的取值源）
    pub total_amount: rust_decimal::Decimal,
    /// 金额大写（A 车道产出后注入；本切片恒 None，转表时省略该行）
    pub total_amount_words: Option<String>,
}

impl SalesXlsxPrintDoc {
    /// KV 行铺排：前两列放 label/value，其余列空串补齐到表宽
    fn kv_row(label: &str, value: &str, width: usize) -> Vec<String> {
        let mut row = vec![String::new(); width];
        row[0] = label.to_string();
        if width > 1 {
            row[1] = value.to_string();
        }
        row
    }

    /// 铺排为现有规整表格（引擎增强车道合并后此处替换为缸号块合并版式）
    pub(crate) fn to_xlsx_table(&self) -> crate::utils::xlsx_export::XlsxTable {
        let width = self.headers.len();
        let mut rows = Vec::new();
        for (label, value) in &self.main_kv {
            rows.push(Self::kv_row(label, value, width));
        }
        if !self.main_kv.is_empty() {
            rows.push(vec![String::new(); width]);
        }
        rows.extend(self.rows.iter().cloned());
        if !self.summary_kv.is_empty() {
            rows.push(vec![String::new(); width]);
            for (label, value) in &self.summary_kv {
                rows.push(Self::kv_row(label, value, width));
            }
            if let Some(words) = &self.total_amount_words {
                rows.push(Self::kv_row("金额大写", words, width));
            }
        }
        crate::utils::xlsx_export::XlsxTable {
            sheet_name: self.sheet_name.clone(),
            headers: self.headers.clone(),
            rows,
        }
    }
}

impl super::PrintService {
    /// 销售订单 xlsx 打印取数：行级归属门（与 docx 打印同一判定器）后取关联并构建中间版式。
    /// 明细行缺失或产品档案缺席按 fail-closed 报错，不产空表假绿。
    pub async fn get_sales_order_xlsx_print_data(
        &self,
        ctx: &crate::utils::data_scope::DataScopeContext,
        id: i32,
    ) -> Result<SalesXlsxPrintDoc, AppError> {
        self.ensure_print_row_scope(ctx, "sales_order", id).await?;
        let (order, customer, items, products) =
            Self::fetch_sales_order_relations(&self.db, id).await?;
        Self::build_sales_order_xlsx(&order, customer.as_ref(), &items, &products)
    }

    /// 销售发货单 xlsx 打印取数：行级归属门（与 docx 打印同一判定器）后取关联并构建中间版式。
    /// 明细行缺失按 fail-closed 报错，不产空表假绿。
    pub async fn get_sales_delivery_xlsx_print_data(
        &self,
        ctx: &crate::utils::data_scope::DataScopeContext,
        id: i32,
    ) -> Result<SalesXlsxPrintDoc, AppError> {
        self.ensure_print_row_scope(ctx, "sales_delivery", id)
            .await?;
        let relations = Self::fetch_sales_delivery_relations(&self.db, id).await?;
        Self::build_sales_delivery_xlsx(&relations)
    }

    /// 销售订单 xlsx 构建：主表 KV + 行级明细 + 汇总。
    ///
    /// 明细列 = 序号/品名/编号/色号/匹号(条件)/数量/单价/金额。sales_order_item 模型只有
    /// `piece_no` 列、没有缸号 `dye_lot_no` 列（仅 `dye_lot_requirement` 要求文本，不是
    /// 已分配事实，不得造列填充），故缸号列不产出、匹号列在任一行有值时才输出。
    /// 金额大写本切片不产出（A 车道 feat/amount-in-words 在 utils 开发中，产出后由
    /// handler 注入 `total_amount_words`）。
    fn build_sales_order_xlsx(
        order: &crate::models::sales_order::Model,
        customer: Option<&crate::models::customer::Model>,
        items: &[crate::models::sales_order_item::Model],
        products: &[Option<crate::models::product::Model>],
    ) -> Result<SalesXlsxPrintDoc, AppError> {
        if items.is_empty() {
            return Err(AppError::business(format!(
                "销售订单 {} 无明细行，拒绝生成空表 xlsx",
                order.order_no
            )));
        }
        if products.len() != items.len() {
            return Err(AppError::internal(format!(
                "销售订单 {} 明细行数({})与产品档案行数({})不一致",
                order.order_no,
                items.len(),
                products.len()
            )));
        }

        let main_kv = vec![
            ("单号".to_string(), order.order_no.clone()),
            (
                "客户".to_string(),
                customer
                    .map(|c| c.customer_name.clone())
                    .unwrap_or_default(),
            ),
            (
                "送货地址".to_string(),
                order.shipping_address.clone().unwrap_or_default(),
            ),
            (
                "开单时间".to_string(),
                order.order_date.format("%Y-%m-%d %H:%M:%S").to_string(),
            ),
            ("总金额(元)".to_string(), order.total_amount.to_string()),
        ];

        let has_piece_no = items.iter().any(|item| item.piece_no.is_some());
        let mut headers = vec![
            "序号".to_string(),
            "品名".to_string(),
            "编号".to_string(),
            "色号".to_string(),
        ];
        if has_piece_no {
            headers.push("匹号".to_string());
        }
        headers.push("数量".to_string());
        headers.push("单价(元)".to_string());
        headers.push("金额(元)".to_string());

        let mut rows = Vec::with_capacity(items.len());
        let mut total_quantity = rust_decimal::Decimal::ZERO;
        let mut piece_count = 0usize;
        for (i, item) in items.iter().enumerate() {
            let product = products[i].as_ref().ok_or_else(|| {
                AppError::not_found(format!(
                    "销售订单 {} 的明细产品档案(ID={})缺失",
                    order.id, item.product_id
                ))
            })?;
            let mut row = Vec::with_capacity(headers.len());
            row.push((i + 1).to_string());
            row.push(product.name.clone());
            row.push(product.code.clone());
            row.push(item.color_no.clone());
            if has_piece_no {
                row.push(item.piece_no.clone().unwrap_or_default());
            }
            row.push(item.quantity.to_string());
            row.push(item.unit_price.to_string());
            row.push(item.total_amount.to_string());
            rows.push(row);
            total_quantity += item.quantity;
            if item.piece_no.is_some() {
                piece_count += 1;
            }
        }

        let summary_kv = vec![
            ("总数量".to_string(), total_quantity.to_string()),
            ("总匹数".to_string(), piece_count.to_string()),
            ("总金额(元)".to_string(), order.total_amount.to_string()),
        ];

        Ok(SalesXlsxPrintDoc {
            sheet_name: "销售订单".to_string(),
            filename: format!("销售订单_{}", order.order_no),
            main_kv,
            headers,
            rows,
            summary_kv,
            total_amount: order.total_amount,
            total_amount_words: None,
        })
    }

    /// 销售发货单 xlsx 构建：主表 KV + 逐匹明细（发货明细本身逐匹成行，直接取行级
    /// 缸号 dye_lot_no / 匹号 piece_no / 每行米数 quantity）+ 汇总（总匹数=行数、总米数=Σquantity）。
    fn build_sales_delivery_xlsx(
        relations: &SalesDeliveryPrintRelations,
    ) -> Result<SalesXlsxPrintDoc, AppError> {
        if relations.items.is_empty() {
            return Err(AppError::business(format!(
                "销售发货单 {} 无明细行，拒绝生成空表 xlsx",
                relations.record.delivery_no
            )));
        }

        let record = &relations.record;
        let main_kv = vec![
            ("单号".to_string(), record.delivery_no.clone()),
            (
                "送货日期".to_string(),
                record.delivery_date.format("%Y-%m-%d").to_string(),
            ),
            (
                "客户名称".to_string(),
                relations.customer.customer_name.clone(),
            ),
            (
                "送货地址".to_string(),
                relations.customer.address.clone().unwrap_or_default(),
            ),
            ("发货仓库".to_string(), relations.warehouse.name.clone()),
            (
                "来源销售订单号".to_string(),
                relations.order.order_no.clone(),
            ),
            ("状态".to_string(), record.status.clone()),
            (
                "制单人".to_string(),
                relations
                    .creator
                    .real_name
                    .clone()
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| relations.creator.username.clone()),
            ),
            (
                "备注".to_string(),
                record.remarks.clone().unwrap_or_default(),
            ),
        ];

        let headers = vec![
            "序号".to_string(),
            "品名".to_string(),
            "编号".to_string(),
            "规格".to_string(),
            "计量单位".to_string(),
            "批次".to_string(),
            "色号".to_string(),
            "颜色".to_string(),
            "缸号".to_string(),
            "匹号".to_string(),
            "数量(米)".to_string(),
            "单价(元)".to_string(),
            "金额(元)".to_string(),
            "备注".to_string(),
        ];

        let mut rows = Vec::with_capacity(relations.items.len());
        let mut total_meters = rust_decimal::Decimal::ZERO;
        for (i, (item, product)) in relations
            .items
            .iter()
            .zip(relations.products.iter())
            .enumerate()
        {
            rows.push(vec![
                (i + 1).to_string(),
                product.name.clone(),
                product.code.clone(),
                product.specification.clone().unwrap_or_default(),
                product.unit.clone(),
                item.batch_no.clone(),
                item.color_no.clone(),
                relations
                    .color_names
                    .get(&(item.product_id, item.color_no.clone()))
                    .cloned()
                    .unwrap_or_default(),
                item.dye_lot_no.clone(),
                item.piece_no.clone().unwrap_or_default(),
                item.quantity.to_string(),
                item.unit_price.to_string(),
                item.amount.to_string(),
                item.remarks.clone().unwrap_or_default(),
            ]);
            total_meters += item.quantity;
        }

        let summary_kv = vec![
            ("总匹数".to_string(), relations.items.len().to_string()),
            ("总米数".to_string(), total_meters.to_string()),
            ("总金额(元)".to_string(), record.total_amount.to_string()),
        ];

        Ok(SalesXlsxPrintDoc {
            sheet_name: "销售发货单".to_string(),
            filename: format!("销售发货单_{}", record.delivery_no),
            main_kv,
            headers,
            rows,
            summary_kv,
            total_amount: record.total_amount,
            total_amount_words: None,
        })
    }
}

// ----------------------------------------------------------------------
// 单元测试：构建器纯函数（无数据库依赖）
// ----------------------------------------------------------------------

#[cfg(test)]
mod xlsx_print_tests {
    use crate::models::{
        customer, product, sales_delivery, sales_delivery_item, sales_order, sales_order_item,
        user, warehouse,
    };
    use crate::services::print_service::{PrintService, SalesDeliveryPrintRelations};
    use chrono::{NaiveDate, Utc};
    use rust_decimal::Decimal;
    use std::collections::HashMap;

    fn dec(value: i64, scale: u32) -> Decimal {
        Decimal::new(value, scale)
    }

    fn now() -> chrono::DateTime<Utc> {
        Utc::now()
    }

    fn fixed_date() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 1, 15).expect("固定测试日期")
    }

    fn order_fixture() -> sales_order::Model {
        sales_order::Model {
            id: 1,
            order_no: "SO20260115001".to_string(),
            customer_id: 7,
            opportunity_id: None,
            order_date: now(),
            required_date: None,
            ship_date: None,
            status: "APPROVED".to_string(),
            subtotal: dec(1000, 0),
            tax_amount: dec(130, 0),
            discount_amount: dec(0, 0),
            shipping_cost: dec(0, 0),
            total_amount: dec(1130, 0),
            paid_amount: dec(0, 0),
            balance_amount: dec(1130, 0),
            shipping_address: Some("浙江绍兴柯桥".to_string()),
            contact_person: None,
            contact_phone: None,
            billing_address: None,
            notes: None,
            batch_no: None,
            color_no: None,
            dye_lot_no: None,
            grade: None,
            packaging_requirement: None,
            quality_standard: None,
            created_by: None,
            department_id: None,
            approved_by: None,
            approved_at: None,
            approval_reason: None,
            rejected_reason: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn order_item_fixture(
        order_id: i32,
        product_id: i32,
        quantity: Decimal,
        amount: Decimal,
        piece_no: Option<String>,
    ) -> sales_order_item::Model {
        sales_order_item::Model {
            id: 0,
            order_id,
            product_id,
            quantity,
            unit_price: dec(12, 0),
            discount_percent: dec(0, 0),
            tax_percent: dec(0, 0),
            subtotal: amount,
            tax_amount: dec(0, 0),
            discount_amount: dec(0, 0),
            total_amount: amount,
            shipped_quantity: dec(0, 0),
            notes: None,
            created_at: now(),
            updated_at: now(),
            color_no: "C001".to_string(),
            color_name: None,
            pantone_code: None,
            grade_required: None,
            quantity_meters: quantity,
            quantity_kg: dec(0, 0),
            gram_weight: None,
            width: None,
            batch_requirement: None,
            dye_lot_requirement: None,
            piece_no,
            base_price: None,
            color_extra_cost: dec(0, 0),
            grade_price_diff: dec(0, 0),
            final_price: None,
            shipped_quantity_meters: dec(0, 0),
            shipped_quantity_kg: dec(0, 0),
            paper_tube_weight: None,
            is_net_weight: None,
            quantity_tolerance_pct: None,
            fulfillment_source: None,
        }
    }

    fn product_fixture(id: i32, name: &str, code: &str) -> product::Model {
        product::Model {
            id,
            name: name.to_string(),
            code: code.to_string(),
            barcode: None,
            category_id: None,
            specification: Some("150cm".to_string()),
            unit: "米".to_string(),
            standard_price: None,
            cost_price: None,
            description: None,
            status: "active".to_string(),
            is_deleted: false,
            created_at: now(),
            updated_at: now(),
            product_type: "fabric".to_string(),
            fabric_composition: None,
            yarn_count: None,
            density: None,
            width: None,
            gram_weight: None,
            structure: None,
            finish: None,
            width_needle_included_cm: None,
            weight_tolerance: None,
            spandex_percent: None,
            usage: None,
            min_order_quantity: None,
            lead_time: None,
            meters_per_piece: None,
            supplier_product_code: None,
            supplier_id: None,
            is_batch_managed: None,
            batch_level: None,
            execution_standard: None,
            factory_name: None,
            factory_address: None,
            product_grade: None,
            safety_category: None,
        }
    }

    fn customer_fixture() -> customer::Model {
        customer::Model {
            id: 7,
            customer_code: "KH001".to_string(),
            customer_name: "绍兴某某针织".to_string(),
            contact_person: None,
            contact_phone: None,
            contact_email: None,
            address: Some("柯桥纺织城 8 号".to_string()),
            city: None,
            province: None,
            country: None,
            postal_code: None,
            credit_limit: dec(0, 0),
            payment_terms: 0,
            tax_id: None,
            bank_name: None,
            bank_account: None,
            status: "active".to_string(),
            customer_type: "normal".to_string(),
            tier: None,
            notes: None,
            created_by: None,
            created_at: now(),
            updated_at: now(),
            customer_industry: None,
            main_products: None,
            annual_purchase: None,
            quality_requirement: None,
            inspection_standard: None,
            owner_id: 1,
            department_id: None,
            owner_assigned_at: None,
            special_process: None,
            source: None,
            pool_recycle_reason: None,
        }
    }

    fn warehouse_fixture() -> warehouse::Model {
        warehouse::Model {
            id: 3,
            warehouse_code: "WH003".to_string(),
            name: "成品一仓".to_string(),
            address: None,
            city: None,
            province: None,
            country: None,
            postal_code: None,
            phone: None,
            contact_person: None,
            is_default: false,
            email: None,
            manager_id: None,
            is_active: true,
            notes: None,
            warehouse_type: None,
            capacity: None,
            created_at: now(),
            updated_at: now(),
        }
    }

    fn user_fixture() -> user::Model {
        user::Model {
            id: 5,
            username: "clerk01".to_string(),
            password_hash: "x".to_string(),
            real_name: Some("开单员甲".to_string()),
            avatar: None,
            email: None,
            phone: None,
            role_id: None,
            department_id: None,
            is_active: true,
            totp_secret: None,
            is_totp_enabled: false,
            totp_recovery_codes: None,
            last_login_at: None,
            password_changed_at: None,
            agreed_to_terms_at: None,
            created_at: now(),
            gender: None,
            birth_date: None,
            updated_at: now(),
        }
    }

    fn delivery_fixture() -> sales_delivery::Model {
        sales_delivery::Model {
            id: 11,
            delivery_no: "SH20260115001".to_string(),
            order_id: 1,
            customer_id: 7,
            delivery_date: fixed_date(),
            warehouse_id: 3,
            status: "shipped".to_string(),
            total_quantity: dec(105, 1),
            total_amount: dec(1260, 0),
            remarks: Some("急货".to_string()),
            created_by: 5,
            created_at: now(),
            updated_at: now(),
            delivered_at: None,
            signed_by: None,
            signed_at: None,
        }
    }

    fn delivery_item_fixture(
        delivery_id: i32,
        product_id: i32,
        dye_lot_no: &str,
        piece_no: Option<String>,
        quantity: Decimal,
    ) -> sales_delivery_item::Model {
        sales_delivery_item::Model {
            id: 0,
            delivery_id,
            product_id,
            batch_no: "B20260101".to_string(),
            color_no: "C001".to_string(),
            dye_lot_id: None,
            dye_lot_no: dye_lot_no.to_string(),
            piece_no,
            stock_id: None,
            is_cross_dye_lot: false,
            quantity,
            unit_price: dec(12, 0),
            amount: dec(12, 0) * quantity,
            remarks: None,
            created_at: now(),
        }
    }

    fn delivery_relations_fixture(
        record: sales_delivery::Model,
        items: Vec<sales_delivery_item::Model>,
    ) -> SalesDeliveryPrintRelations {
        let product_count = items.len();
        SalesDeliveryPrintRelations {
            products: (0..product_count)
                .map(|i| {
                    product_fixture(10 + i as i32, &format!("针织布{}", i), &format!("P{i:03}"))
                })
                .collect(),
            record,
            customer: customer_fixture(),
            warehouse: warehouse_fixture(),
            order: order_fixture(),
            creator: user_fixture(),
            items,
            color_names: HashMap::new(),
        }
    }

    // ---------------- 销售订单 xlsx 构建 ----------------

    #[test]
    fn order_xlsx_row_count_matches_items() {
        let order = order_fixture();
        let items = vec![
            order_item_fixture(1, 10, dec(35, 1), dec(420, 0), Some("R001".to_string())),
            order_item_fixture(1, 11, dec(40, 1), dec(480, 0), Some("R002".to_string())),
            order_item_fixture(1, 12, dec(25, 1), dec(230, 0), None),
        ];
        let products = vec![
            Some(product_fixture(10, "针织布A", "P010")),
            Some(product_fixture(11, "针织布B", "P011")),
            Some(product_fixture(12, "针织布C", "P012")),
        ];
        let doc = PrintService::build_sales_order_xlsx(&order, None, &items, &products)
            .expect("构建应成功");
        assert_eq!(doc.rows.len(), items.len());
        assert!(doc.rows.iter().all(|row| row.len() == doc.headers.len()));
    }

    #[test]
    fn order_xlsx_row_values_match_input() {
        let order = order_fixture();
        let items = vec![
            order_item_fixture(1, 10, dec(35, 1), dec(420, 0), Some("R001".to_string())),
            order_item_fixture(1, 11, dec(40, 1), dec(480, 0), None),
        ];
        let products = vec![
            Some(product_fixture(10, "针织布A", "P010")),
            Some(product_fixture(11, "针织布B", "P011")),
        ];
        let doc = PrintService::build_sales_order_xlsx(&order, None, &items, &products)
            .expect("构建应成功");
        for (i, (item, row)) in items.iter().zip(doc.rows.iter()).enumerate() {
            assert_eq!(row[0], (i + 1).to_string());
            assert_eq!(row[1], products[i].as_ref().expect("fixture").name);
            assert_eq!(row[2], products[i].as_ref().expect("fixture").code);
            assert_eq!(row[3], item.color_no);
            // 列序：序号/品名/编号/色号/匹号/数量/单价/金额
            assert_eq!(row[4], item.piece_no.clone().unwrap_or_default());
            assert_eq!(row[5], item.quantity.to_string());
            assert_eq!(row[6], item.unit_price.to_string());
            assert_eq!(row[7], item.total_amount.to_string());
        }
    }

    #[test]
    fn order_xlsx_summary_sums_match_input() {
        let order = order_fixture();
        let items = vec![
            order_item_fixture(1, 10, dec(35, 1), dec(420, 0), Some("R001".to_string())),
            order_item_fixture(1, 11, dec(40, 1), dec(480, 0), Some("R002".to_string())),
            order_item_fixture(1, 12, dec(25, 1), dec(230, 0), None),
        ];
        let products: Vec<Option<product::Model>> = (10..13)
            .map(|id| Some(product_fixture(id, "布", "P0")))
            .collect();
        let doc = PrintService::build_sales_order_xlsx(&order, None, &items, &products)
            .expect("构建应成功");
        let summary = |label: &str| {
            doc.summary_kv
                .iter()
                .find(|(k, _)| k == label)
                .map(|(_, v)| v.clone())
                .expect("汇总键存在")
        };
        let expect_total = items.iter().map(|item| item.quantity).sum::<Decimal>();
        assert_eq!(summary("总数量"), expect_total.to_string());
        assert_eq!(summary("总匹数"), "2");
        assert_eq!(summary("总金额(元)"), order.total_amount.to_string());
    }

    #[test]
    fn order_xlsx_piece_column_conditional() {
        let order = order_fixture();
        let with_piece = vec![order_item_fixture(
            1,
            10,
            dec(35, 1),
            dec(420, 0),
            Some("R001".to_string()),
        )];
        let products = vec![Some(product_fixture(10, "布A", "P010"))];
        let doc = PrintService::build_sales_order_xlsx(&order, None, &with_piece, &products)
            .expect("构建应成功");
        let piece_idx = doc
            .headers
            .iter()
            .position(|h| h == "匹号")
            .expect("有匹级行时应含匹号列");
        assert_eq!(piece_idx, 4);

        let without_piece = vec![order_item_fixture(1, 10, dec(35, 1), dec(420, 0), None)];
        let doc = PrintService::build_sales_order_xlsx(&order, None, &without_piece, &products)
            .expect("构建应成功");
        assert!(
            !doc.headers.iter().any(|h| h == "匹号"),
            "全部行无匹号时不得输出匹号列"
        );
    }

    #[test]
    fn order_xlsx_empty_items_fail_closed() {
        let order = order_fixture();
        let err = PrintService::build_sales_order_xlsx(&order, None, &[], &[])
            .expect_err("无明细行必须报错");
        assert!(
            err.to_string().contains("无明细行"),
            "错误应点名无明细行: {err}"
        );
    }

    #[test]
    fn order_xlsx_missing_product_fail_closed() {
        let order = order_fixture();
        let items = vec![order_item_fixture(1, 10, dec(35, 1), dec(420, 0), None)];
        let products = vec![None];
        let err = PrintService::build_sales_order_xlsx(&order, None, &items, &products)
            .expect_err("产品档案缺席必须报错");
        assert!(
            err.to_string().contains("产品档案"),
            "错误应点名产品档案缺失: {err}"
        );
    }

    #[test]
    fn order_xlsx_main_kv_and_amount_placeholder() {
        let order = order_fixture();
        let customer = customer_fixture();
        let items = vec![order_item_fixture(1, 10, dec(35, 1), dec(420, 0), None)];
        let products = vec![Some(product_fixture(10, "布A", "P010"))];
        let doc = PrintService::build_sales_order_xlsx(&order, Some(&customer), &items, &products)
            .expect("构建应成功");
        let kv = |label: &str| {
            doc.main_kv
                .iter()
                .find(|(k, _)| k == label)
                .map(|(_, v)| v.clone())
                .expect("主表键存在")
        };
        assert_eq!(kv("单号"), order.order_no);
        assert_eq!(kv("客户"), customer.customer_name);
        assert_eq!(
            kv("送货地址"),
            order.shipping_address.clone().expect("fixture")
        );
        assert_eq!(kv("总金额(元)"), order.total_amount.to_string());
        // A 车道 feat/amount-in-words 注入点：本切片占位为空
        assert_eq!(doc.total_amount, order.total_amount);
        assert!(doc.total_amount_words.is_none());
    }

    // ---------------- 销售发货单 xlsx 构建 ----------------

    #[test]
    fn delivery_xlsx_row_count_matches_items() {
        let record = delivery_fixture();
        let items = vec![
            delivery_item_fixture(11, 10, "G001", Some("R001".to_string()), dec(35, 1)),
            delivery_item_fixture(11, 10, "G001", Some("R002".to_string()), dec(35, 1)),
            delivery_item_fixture(11, 11, "G002", None, dec(35, 1)),
        ];
        let relations = delivery_relations_fixture(record, items.clone());
        let doc = PrintService::build_sales_delivery_xlsx(&relations).expect("构建应成功");
        assert_eq!(doc.rows.len(), items.len());
        assert!(doc.rows.iter().all(|row| row.len() == doc.headers.len()));
    }

    #[test]
    fn delivery_xlsx_lot_piece_meters_match_input() {
        let record = delivery_fixture();
        let items = vec![
            delivery_item_fixture(11, 10, "G001", Some("R001".to_string()), dec(35, 1)),
            delivery_item_fixture(11, 10, "G002", None, dec(40, 1)),
        ];
        let relations = delivery_relations_fixture(record, items.clone());
        let doc = PrintService::build_sales_delivery_xlsx(&relations).expect("构建应成功");
        let lot_idx = doc
            .headers
            .iter()
            .position(|h| h == "缸号")
            .expect("发货明细必含缸号列");
        let piece_idx = doc
            .headers
            .iter()
            .position(|h| h == "匹号")
            .expect("发货明细必含匹号列");
        let meters_idx = doc
            .headers
            .iter()
            .position(|h| h == "数量(米)")
            .expect("发货明细必含数量(米)列");
        for (item, row) in items.iter().zip(doc.rows.iter()) {
            assert_eq!(row[lot_idx], item.dye_lot_no);
            assert_eq!(row[piece_idx], item.piece_no.clone().unwrap_or_default());
            assert_eq!(row[meters_idx], item.quantity.to_string());
        }
    }

    #[test]
    fn delivery_xlsx_summary_pieces_and_meters() {
        let record = delivery_fixture();
        let items = vec![
            delivery_item_fixture(11, 10, "G001", Some("R001".to_string()), dec(35, 1)),
            delivery_item_fixture(11, 10, "G001", Some("R002".to_string()), dec(35, 1)),
            delivery_item_fixture(11, 11, "G002", None, dec(35, 1)),
        ];
        let relations = delivery_relations_fixture(record, items.clone());
        let doc = PrintService::build_sales_delivery_xlsx(&relations).expect("构建应成功");
        let summary = |label: &str| {
            doc.summary_kv
                .iter()
                .find(|(k, _)| k == label)
                .map(|(_, v)| v.clone())
                .expect("汇总键存在")
        };
        // 总匹数 = 行数（发货明细逐匹成行）
        assert_eq!(summary("总匹数"), items.len().to_string());
        let expect_meters = items.iter().map(|item| item.quantity).sum::<Decimal>();
        assert_eq!(summary("总米数"), expect_meters.to_string());
    }

    #[test]
    fn delivery_xlsx_main_kv_carries_archive_names() {
        let record = delivery_fixture();
        let items = vec![delivery_item_fixture(
            11,
            10,
            "G001",
            Some("R001".to_string()),
            dec(35, 1),
        )];
        let relations = delivery_relations_fixture(record, items);
        let doc = PrintService::build_sales_delivery_xlsx(&relations).expect("构建应成功");
        let kv = |label: &str| {
            doc.main_kv
                .iter()
                .find(|(k, _)| k == label)
                .map(|(_, v)| v.clone())
                .expect("主表键存在")
        };
        assert_eq!(kv("单号"), "SH20260115001");
        assert_eq!(kv("客户名称"), "绍兴某某针织");
        assert_eq!(kv("发货仓库"), "成品一仓");
        assert_eq!(kv("来源销售订单号"), "SO20260115001");
        assert_eq!(kv("制单人"), "开单员甲");
        // 总金额(元) 在汇总区而非主表区
        let total = doc
            .summary_kv
            .iter()
            .find(|(k, _)| k == "总金额(元)")
            .map(|(_, v)| v.clone())
            .expect("汇总键存在");
        assert_eq!(total, doc.total_amount.to_string());
    }

    #[test]
    fn delivery_xlsx_empty_items_fail_closed() {
        let record = delivery_fixture();
        let relations = delivery_relations_fixture(record, Vec::new());
        let err =
            PrintService::build_sales_delivery_xlsx(&relations).expect_err("无明细行必须报错");
        assert!(
            err.to_string().contains("无明细行"),
            "错误应点名无明细行: {err}"
        );
    }

    // ---------------- 中间结构 → XlsxTable 铺排 ----------------

    #[test]
    fn to_xlsx_table_layout_kv_items_summary() {
        let order = order_fixture();
        let items = vec![
            order_item_fixture(1, 10, dec(35, 1), dec(420, 0), Some("R001".to_string())),
            order_item_fixture(1, 11, dec(40, 1), dec(480, 0), None),
        ];
        let products = vec![
            Some(product_fixture(10, "布A", "P010")),
            Some(product_fixture(11, "布B", "P011")),
        ];
        let doc = PrintService::build_sales_order_xlsx(&order, None, &items, &products)
            .expect("构建应成功");
        let table = doc.to_xlsx_table();
        let width = doc.headers.len();
        // 布局：主表 KV 行 + 空行 + 明细行 + 空行 + 汇总 KV 行
        let expected_len = doc.main_kv.len() + 1 + doc.rows.len() + 1 + doc.summary_kv.len();
        assert_eq!(table.rows.len(), expected_len);
        assert!(table.rows.iter().all(|row| row.len() == width));
        assert_eq!(table.headers, doc.headers);
        assert_eq!(table.sheet_name, "销售订单");
        // 首块为主表 KV：label 在第 1 列、值在第 2 列
        assert_eq!(table.rows[0][0], "单号");
        assert_eq!(table.rows[0][1], order.order_no);
    }
}
