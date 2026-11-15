//! 通用打印服务（域子模块拆分入口）
//!
//! V15 P0-S17 修复（Batch 476）：6 个 get_*_print_data 方法从硬编码占位数据
//! 改为真实查询数据库（主表 + 关联客户/供应商/仓库 + 明细项）。
//! 2026-11-15 拆分：方法按业务域下沉到本目录子模块，签名与外部路径零改动。

use crate::utils::error::AppError;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order,
    QueryFilter, QueryOrder, QuerySelect, RelationTrait,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

/// 打印数据类型
#[derive(Debug, Serialize, Deserialize)]
pub struct PrintData {
    pub template: String,
    pub data: HashMap<String, serde_json::Value>,
    pub items: Vec<HashMap<String, serde_json::Value>>,
    /// 可选嵌入位图（当前唯一消费方： 成品布入库标签的 Code128 条码图）。
    /// `#[serde(skip)]`：打印数据 JSON 出参形态不因图形新增而变化（不破坏既有前端契约），
    /// 字节只走 generate_docx → docx-rs media 打包这一条渲染线。
    #[serde(skip)]
    pub image: Option<crate::utils::docx_export::DocxImage>,
}

/// 销售发货单打印上下文：聚合单据主体、客户/仓库/来源订单/制单人四个档案、
/// 明细行、按行下标对齐的产品档案，以及 (产品编号, 色号) 到色号名称的字典
pub(crate) struct SalesDeliveryPrintRelations {
    record: crate::models::sales_delivery::Model,
    customer: crate::models::customer::Model,
    warehouse: crate::models::warehouse::Model,
    order: crate::models::sales_order::Model,
    creator: crate::models::user::Model,
    items: Vec<crate::models::sales_delivery_item::Model>,
    products: Vec<crate::models::product::Model>,
    color_names: HashMap<(i32, String), String>,
}

/// 打印服务（V15 P0-S17：持有数据库连接，6 个 get_*_print_data 方法真实查询数据库）
pub struct PrintService {
    db: Arc<DatabaseConnection>,
}

/// 库存调拨打印上下文：聚合主表、调出/调入仓库、明细及产品映射
pub(crate) struct TransferPrintContext {
    transfer: crate::models::inventory_transfer::Model,
    from_warehouse: Option<crate::models::warehouse::Model>,
    to_warehouse: Option<crate::models::warehouse::Model>,
    items: Vec<crate::models::inventory_transfer_item::Model>,
    product_map: HashMap<i32, crate::models::product::Model>,
}

/// 成品布入库标签视图（doc_type `inventory_piece_label`）
/// inventory_piece 单行 + LEFT JOIN products 富化款号(product.code)/品名(product.name)，
/// 单次查询范式同 PurchaseOrderDto（column_as + LeftJoin + into_model，禁止逐字段再查）。
/// 字段全部取该匹自身行实测值（决策 §2：匹行才是交易事实，不回落产品主数据）；
/// supplier_piece_no / 供应商侧编码 / 成本列（unit_cost/total_cost）**不得**进入本结构（决策 §6 保密口径）。
#[derive(Debug, Clone, sea_orm::FromQueryResult)]
pub(crate) struct PieceLabelView {
    id: i32,
    piece_no: String,
    piece_type: String,
    status: String,
    dye_lot_no: String,
    color_no: String,
    batch_no: String,
    length: rust_decimal::Decimal,
    weight: Option<rust_decimal::Decimal>,
    width: Option<rust_decimal::Decimal>,
    gram_weight: Option<rust_decimal::Decimal>,
    quality_status: Option<String>,
    barcode: Option<String>,
    warehouse_in_at: Option<chrono::DateTime<chrono::Utc>>,
    product_code: Option<String>,
    product_name: Option<String>,
}

/// 渲染链路支持的单据类型全集（与 [`PrintService::get_print_data`] 的 match 分支一一对应）。
///
/// 打印模板的 `doc_type` 查找键、模板新建与编辑的合法取值都以此为准：写进模板表的单据类型
/// 若不在本集合内，受理打印任务时必然落到 get_print_data 的未知分支返回 404，表现为
/// "模板存在但永远打不出"。新增渲染分支必须同步在此登记，并由集成测试
/// print_doc_type_catalog_consistency_test 以源码解析锁定二者取值一致。
pub const SUPPORTED_DOC_TYPES: &[&str] = &[
    "sales_order",
    "sales_contract",
    "purchase_order",
    "purchase_receipt",
    "inventory_transfer",
    "voucher",
    "production_flow_card",
    "fabric_inspection",
    "dye_batch_card",
    "color_card_issue",
    "bulk_color_approval",
    "lab_dip_request",
    "production_order",
    "production_recipe",
    "quality_inspection_record",
    "sales_delivery",
    "ar_collection",
    "ap_payment",
    "ap_invoice",
    "sales_quotation",
    "sales_return",
    "purchase_return",
    "outsourcing_order",
    "outsourcing_receipt",
    "logistics_waybill",
    "certificate_of_origin",
    "export_customs_declaration",
    "solid_waste_disposal",
    "unqualified_product",
    "chemical_requisition",
    "export_inspection",
    "ap_payment_request",
    "ap_reconciliation",
    "purchase_inspection",
    "inventory_adjustment",
    "material_shortage",
    "quality_8d_report",
    "labor_contract",
    "wage_record",
    "energy_consumption_record",
    "purchase_contract",
    "supplier_evaluation_record",
    "safety_accident_report",
    "occupational_hazard_monitoring",
    "pollution_permit",
    "process_route",
    "foreign_exchange_verification",
    "export_refund_declaration",
    "fixed_asset",
    "scheduling_result",
    "inventory_write_down",
    "fixed_asset_count",
    "social_insurance_record",
    "occupational_health_exam",
    "dye_batch_rework",
    "bad_debt_writeoff",
    "custom_order",
    "ppe_distribution",
    "customer_credit",
    "after_sales",
    "quality_issue",
    "ar_reconciliation",
    "inventory_piece_label",
];

/// 已启用行级归属门的打印单据类型（本批＝财务域 7 枚，前七枚表模型均含 created_by）。
///
/// 判定逻辑：在 `get_print_data` 中，当 doc_type 属于本集合时，先按实体主键取 `created_by`
/// 列值，经 `check_resource_owner_by_member_scope` 做单行归属门——不在调用方数据范围内的单据
/// 返回 403（固定脱敏常量），不降级为空结果。后续工单扩展其他域只需在此登记 doc_type，
/// 由 `ensure_print_row_scope` 对三集合之外的 doc_type 留 error 痕点名，登记缺口从此可查。
pub const PRINT_SCOPE_GATED: &[&str] = &[
    "voucher",
    "ap_invoice",
    "ap_payment",
    "ap_payment_request",
    "ap_reconciliation",
    "ar_collection",
    "ar_reconciliation",
];

/// 永久无归属列的打印单据类型（豁免行级门，每条写清为什么无法过门）。
///
/// 这些单据的表模型不存在 `created_by` 或等效归属用户列（仅有 `created_at` 时间戳），
/// 无法通过 `check_resource_owner_by_member_scope` 判定行级归属，因此永久豁免行级门。
/// 若未来迁移补充了归属列，应将对应条目从本集合移至 `PRINT_SCOPE_GATED`。
pub const PRINT_SCOPE_NO_OWNER: &[&str] = &[
    // dye_batch 表无 created_by / user_id 列，仅有 created_at 时间戳
    "dye_batch_card",
    // color_card_issue 表无归属用户列
    "color_card_issue",
    // bulk_color_approval 表无归属用户列
    "bulk_color_approval",
    // quality_inspection_record 表无归属用户列
    "quality_inspection_record",
    // logistics_waybill 表无归属用户列
    "logistics_waybill",
    // unqualified_product 表无归属用户列
    "unqualified_product",
    // purchase_inspection 表无归属用户列
    "purchase_inspection",
    // material_shortage 表无归属用户列
    "material_shortage",
    // quality_8d_report 表无归属用户列（d5_action_owner 是文本描述非用户 ID）
    "quality_8d_report",
    // supplier_evaluation_record 表无归属用户列
    "supplier_evaluation_record",
    // safety_accident_report 表无归属用户列
    "safety_accident_report",
    // dye_batch_rework 表无归属用户列
    "dye_batch_rework",
    // bad_debt_writeoff 表无 created_by，归属语义由 applicant_user_id 承载（审批流申请人），
    // 与通用行级门口径不同源，待后续工单裁定是否以 applicant_user_id 建等效门
    "bad_debt_writeoff",
    // after_sales 表无归属用户列
    "after_sales",
    // quality_issue 表无 created_by（permanent_action_owner 是整改责任人非记录创建者）
    "quality_issue",
];

/// 待启用行级归属门的打印单据类型（逐条点名，归属后续工单按域启用）。
///
/// 这些单据的表模型含有 `created_by` 列，技术上可以过行级门，但本批只对财务域启用，
/// 其余域须按业务裁定逐批纳入 `PRINT_SCOPE_GATED`。契约锁断言：任何不在 GATED 也不在
/// NO_OWNER 的 doc_type 必须在此集合中——不存在"未登记"状态的单据类型。
pub const PRINT_SCOPE_PENDING: &[&str] = &[
    "sales_order",
    "sales_contract",
    "purchase_order",
    "purchase_receipt",
    "inventory_transfer",
    "production_flow_card",
    "fabric_inspection",
    "lab_dip_request",
    "production_order",
    "production_recipe",
    "sales_delivery",
    "sales_quotation",
    "sales_return",
    "purchase_return",
    "outsourcing_order",
    "outsourcing_receipt",
    "certificate_of_origin",
    "export_customs_declaration",
    "solid_waste_disposal",
    "chemical_requisition",
    "export_inspection",
    "inventory_adjustment",
    "labor_contract",
    "wage_record",
    "energy_consumption_record",
    "purchase_contract",
    "occupational_hazard_monitoring",
    "pollution_permit",
    "process_route",
    "foreign_exchange_verification",
    "export_refund_declaration",
    "fixed_asset",
    "scheduling_result",
    "inventory_write_down",
    "fixed_asset_count",
    "social_insurance_record",
    "occupational_health_exam",
    "custom_order",
    "ppe_distribution",
    "customer_credit",
    "inventory_piece_label",
];


pub mod asset_hr;
pub mod docx;
pub mod export_trade;
pub mod finance;
pub mod inventory;
pub mod production;
pub mod purchase;
pub mod quality;
pub mod sales;

impl PrintService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 打印取数面的行级归属门：对 `PRINT_SCOPE_GATED` 已接门的单据类型，按实体主键读取其
    /// `created_by` 归属值，交本仓统一判定器 `check_resource_owner_by_member_scope` 校验——
    /// 与列表腿、详情腿同一判定器，不另写第二套归属判定。
    ///
    /// 调用方：[`Self::get_print_data`]（渲染腿由 print_handler 传请求者上下文，任务受理腿与
    /// 后台执行腿由 print_task_handler 传受理者上下文）。
    /// 入参：`ctx` 为调用方数据范围上下文；`doc_type`/`doc_id` 定位单据主行。
    /// 传给谁：归属人 `Option<i32>` 交 `check_resource_owner_by_member_scope`，All 短路放行、
    /// Dept 按归属人 ∈ 可见部门成员集合、Self 仅本人；归属人为 NULL 在 Dept/Self 一律拒绝
    /// （判定器对 None 恒 false，fail-closed），不因脏数据留放行口子。
    /// 口径：单据行不存在时返回 Ok，404 文案仍由装配 match 单一来源给出（此处不造第二份
    /// not_found）；越权返回 403 固定脱敏文案，拒绝原因只进日志。不降级为空结果、不返回
    /// 可猜测占位数据、不吞错。本函数只读判定，不落库、不存任何数据。
    async fn ensure_print_row_scope(
        &self,
        ctx: &crate::utils::data_scope::DataScopeContext,
        doc_type: &str,
        doc_id: i32,
    ) -> Result<(), AppError> {
        if !PRINT_SCOPE_GATED.contains(&doc_type) {
            // 三集合之外的 doc_type 意味着这张单据的归属门状态从未被判定登记过，留 error 痕点名它。
            // 本批不改受理面结果（PENDING 与 NO_OWNER 与未登记同样放行），但登记缺口从此可查；
            // 改成硬拒要先核清全量 doc_type 已登记，否则会把未登记的存量单据打成 403。
            if !PRINT_SCOPE_PENDING.contains(&doc_type) && !PRINT_SCOPE_NO_OWNER.contains(&doc_type)
            {
                tracing::error!(doc_type, "打印归属门登记缺口，该单据类型未登记在任一集合");
            }
            return Ok(());
        }
        let db = self.db.as_ref();
        let owner = match doc_type {
            "voucher" => crate::models::voucher::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ap_invoice" => crate::models::ap_invoice::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ap_payment" => crate::models::ap_payment::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ap_payment_request" => crate::models::ap_payment_request::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ap_reconciliation" => crate::models::ap_reconciliation::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ar_collection" => crate::models::ar_collection::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| Some(row.created_by)),
            "ar_reconciliation" => crate::models::ar_reconciliation::Entity::find_by_id(doc_id)
                .one(db)
                .await?
                .map(|row| row.created_by),
            _ => {
                // GATED 已登记但本函数无对应取归属列分支＝登记漂移（契约锁禁止），
                // fail-closed 拒绝并留 error 痕，绝不静默放行。
                tracing::error!(doc_type, "打印归属门登记漂移：GATED 类型无归属取数分支");
                return Err(AppError::permission_denied(
                    "无权打印该单据（数据范围限制）".to_string(),
                ));
            }
        };
        let Some(owner) = owner else {
            return Ok(());
        };
        if crate::utils::data_scope::check_resource_owner_by_member_scope(ctx, owner) {
            return Ok(());
        }
        tracing::warn!(
            actor = ctx.user_id,
            scope = ctx.scope.as_str(),
            doc_type,
            doc_id,
            resource_owner = ?owner,
            "打印取数被拒：单据归属人不在调用方数据范围内"
        );
        Err(AppError::permission_denied(
            "无权打印该单据（数据范围限制）".to_string(),
        ))
    }

    /// 获取打印数据（渲染腿与任务腿统一入口）。
    ///
    /// 入参：`ctx` 调用方数据范围上下文，先经 [`Self::ensure_print_row_scope`] 行级归属门
    /// （仅对 `PRINT_SCOPE_GATED` 登记的类型生效），再进入按 doc_type 的装配分支。
    pub async fn get_print_data(
        &self,
        ctx: &crate::utils::data_scope::DataScopeContext,
        doc_type: &str,
        doc_id: i32,
    ) -> Result<PrintData, AppError> {
        self.ensure_print_row_scope(ctx, doc_type, doc_id).await?;
        match doc_type {
            "sales_order" => self.get_sales_order_print_data(doc_id).await,
            "sales_contract" => self.get_sales_contract_print_data(doc_id).await,
            "purchase_order" => self.get_purchase_order_print_data(doc_id).await,
            "purchase_receipt" => self.get_purchase_receipt_print_data(doc_id).await,
            "inventory_transfer" => self.get_inventory_transfer_print_data(doc_id).await,
            "voucher" => self.get_voucher_print_data(doc_id).await,
            "production_flow_card" => self.get_production_flow_card_print_data(doc_id).await,
            "fabric_inspection" => self.get_fabric_inspection_print_data(doc_id).await,
            "dye_batch_card" => self.get_dye_batch_card_print_data(doc_id).await,
            "color_card_issue" => self.get_color_card_issue_print_data(doc_id).await,
            "bulk_color_approval" => self.get_bulk_color_approval_print_data(doc_id).await,
            "lab_dip_request" => self.get_lab_dip_request_print_data(doc_id).await,
            "production_order" => self.get_production_order_print_data(doc_id).await,
            "production_recipe" => self.get_production_recipe_print_data(doc_id).await,
            "quality_inspection_record" => {
                self.get_quality_inspection_record_print_data(doc_id).await
            }
            "sales_delivery" => self.get_sales_delivery_print_data(doc_id).await,
            "ar_collection" => self.get_ar_collection_print_data(doc_id).await,
            "ap_payment" => self.get_ap_payment_print_data(doc_id).await,
            "ap_invoice" => self.get_ap_invoice_print_data(doc_id).await,
            "sales_quotation" => self.get_sales_quotation_print_data(doc_id).await,
            "sales_return" => self.get_sales_return_print_data(doc_id).await,
            "purchase_return" => self.get_purchase_return_print_data(doc_id).await,
            "outsourcing_order" => self.get_outsourcing_order_print_data(doc_id).await,
            "outsourcing_receipt" => self.get_outsourcing_receipt_print_data(doc_id).await,
            "logistics_waybill" => self.get_logistics_waybill_print_data(doc_id).await,
            "certificate_of_origin" => self.get_certificate_of_origin_print_data(doc_id).await,
            "export_customs_declaration" => {
                self.get_export_customs_declaration_print_data(doc_id).await
            }
            "solid_waste_disposal" => self.get_solid_waste_disposal_print_data(doc_id).await,
            "unqualified_product" => self.get_unqualified_product_print_data(doc_id).await,
            "chemical_requisition" => self.get_chemical_requisition_print_data(doc_id).await,
            "export_inspection" => self.get_export_inspection_print_data(doc_id).await,
            "ap_payment_request" => self.get_ap_payment_request_print_data(doc_id).await,
            "ap_reconciliation" => self.get_ap_reconciliation_print_data(doc_id).await,
            "purchase_inspection" => self.get_purchase_inspection_print_data(doc_id).await,
            "inventory_adjustment" => self.get_inventory_adjustment_print_data(doc_id).await,
            "material_shortage" => self.get_material_shortage_print_data(doc_id).await,
            "quality_8d_report" => self.get_quality_8d_report_print_data(doc_id).await,
            "labor_contract" => self.get_labor_contract_print_data(doc_id).await,
            "wage_record" => self.get_wage_record_print_data(doc_id).await,
            "energy_consumption_record" => {
                self.get_energy_consumption_record_print_data(doc_id).await
            }
            "purchase_contract" => self.get_purchase_contract_print_data(doc_id).await,
            "supplier_evaluation_record" => {
                self.get_supplier_evaluation_record_print_data(doc_id).await
            }
            "safety_accident_report" => self.get_safety_accident_report_print_data(doc_id).await,
            "occupational_hazard_monitoring" => {
                self.get_occupational_hazard_monitoring_print_data(doc_id)
                    .await
            }
            "pollution_permit" => self.get_pollution_permit_print_data(doc_id).await,
            "process_route" => self.get_process_route_print_data(doc_id).await,
            "foreign_exchange_verification" => {
                self.get_foreign_exchange_verification_print_data(doc_id)
                    .await
            }
            "export_refund_declaration" => {
                self.get_export_refund_declaration_print_data(doc_id).await
            }
            "fixed_asset" => self.get_fixed_asset_print_data(doc_id).await,
            "scheduling_result" => self.get_scheduling_result_print_data(doc_id).await,
            "inventory_write_down" => self.get_inventory_write_down_print_data(doc_id).await,
            "fixed_asset_count" => self.get_fixed_asset_count_print_data(doc_id).await,
            "social_insurance_record" => self.get_social_insurance_record_print_data(doc_id).await,
            "occupational_health_exam" => {
                self.get_occupational_health_exam_print_data(doc_id).await
            }
            "dye_batch_rework" => self.get_dye_batch_rework_print_data(doc_id).await,
            "bad_debt_writeoff" => self.get_bad_debt_writeoff_print_data(doc_id).await,
            "custom_order" => self.get_custom_order_print_data(doc_id).await,
            "ppe_distribution" => self.get_ppe_distribution_print_data(doc_id).await,
            "customer_credit" => self.get_customer_credit_print_data(doc_id).await,
            "after_sales" => self.get_after_sales_print_data(doc_id).await,
            "quality_issue" => self.get_quality_issue_print_data(doc_id).await,
            "ar_reconciliation" => self.get_ar_reconciliation_print_data(doc_id).await,
            "inventory_piece_label" => self.get_inventory_piece_label_print_data(doc_id).await,
            _ => Err(AppError::not_found(format!(
                "Unknown document type: {}",
                doc_type
            ))),
        }
    }

}
