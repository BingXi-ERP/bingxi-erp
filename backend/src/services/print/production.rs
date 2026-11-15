//! production 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order, QueryFilter, QueryOrder, QuerySelect, RelationTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// V15 P1 batch-08 缺陷 8：生成 docx 字节流（规则 3 强制要求合同/发票/报表支持 .docx）
    /// 将 PrintData 转为 Word 文档（标题 + 主表键值对 + 明细表格）。
    /// 生产流转卡打印数据
    async fn get_production_flow_card_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::production_flow_card;

        let record = production_flow_card::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("生产流转卡 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "card_no".to_string(),
            serde_json::json!(record.card_no.clone()),
        );
        data.insert(
            "barcode".to_string(),
            serde_json::json!(record.barcode.clone()),
        );
        data.insert(
            "production_order_id".to_string(),
            serde_json::json!(record.production_order_id),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "dyeing_requirements".to_string(),
            serde_json::json!(record.dyeing_requirements.clone().unwrap_or_default()),
        );
        data.insert(
            "planned_fabric_weight".to_string(),
            serde_json::json!(
                record
                    .planned_fabric_weight
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "actual_fabric_weight".to_string(),
            serde_json::json!(
                record
                    .actual_fabric_weight
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "current_step_seq".to_string(),
            serde_json::json!(record.current_step_seq),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "production_flow_card".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 生产工单打印数据
    async fn get_production_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::production_order;

        let record = production_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("生产工单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "order_no".to_string(),
            serde_json::json!(record.order_no.clone()),
        );
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "product_id".to_string(),
            serde_json::json!(record.product_id),
        );
        data.insert(
            "planned_quantity".to_string(),
            serde_json::json!(record.planned_quantity.to_string()),
        );
        data.insert(
            "actual_quantity".to_string(),
            serde_json::json!(
                record
                    .actual_quantity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "planned_start_date".to_string(),
            serde_json::json!(
                record
                    .planned_start_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "planned_end_date".to_string(),
            serde_json::json!(
                record
                    .planned_end_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert("priority".to_string(), serde_json::json!(record.priority));
        data.insert(
            "work_center_id".to_string(),
            serde_json::json!(record.work_center_id),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "order_type".to_string(),
            serde_json::json!(record.order_type.clone()),
        );

        Ok(PrintData {
            template: "production_order".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 生产配方打印数据
    async fn get_production_recipe_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::production_recipe;

        use crate::models::production_recipe_addition;

        let record = production_recipe::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("生产配方 {} 未找到", id)))?;

        let addition = production_recipe_addition::Entity::find()
            .filter(production_recipe_addition::Column::ProductionRecipeId.eq(id))
            .order_by(production_recipe_addition::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "recipe_no".to_string(),
            serde_json::json!(record.recipe_no.clone()),
        );
        data.insert(
            "work_order_id".to_string(),
            serde_json::json!(record.work_order_id),
        );
        data.insert(
            "dye_batch_id".to_string(),
            serde_json::json!(record.dye_batch_id),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "fabric_name".to_string(),
            serde_json::json!(record.fabric_name.clone().unwrap_or_default()),
        );
        data.insert(
            "fabric_spec".to_string(),
            serde_json::json!(record.fabric_spec.clone()),
        );
        data.insert(
            "fabric_weight".to_string(),
            serde_json::json!(record.fabric_weight.to_string()),
        );
        data.insert(
            "equipment_no".to_string(),
            serde_json::json!(record.equipment_no.clone().unwrap_or_default()),
        );

        let mut item_list = Vec::new();
        for addition_record in addition {
            if let Some(detail) = addition_record.addition_detail {
                for item in detail {
                    let mut row = HashMap::new();
                    row.insert(
                        "material_code".to_string(),
                        serde_json::json!(item.material_code),
                    );
                    row.insert(
                        "material_name".to_string(),
                        serde_json::json!(item.material_name),
                    );
                    row.insert(
                        "amount".to_string(),
                        serde_json::json!(item.amount.to_string()),
                    );
                    row.insert("unit".to_string(), serde_json::json!(item.unit));
                    row.insert("category".to_string(), serde_json::json!(item.category));
                    item_list.push(row);
                }
            }
        }

        Ok(PrintData {
            template: "production_recipe".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 工艺路线打印数据
    async fn get_process_route_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::process_route;

        let record = process_route::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("工艺路线 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "route_code".to_string(),
            serde_json::json!(record.route_code.clone()),
        );
        data.insert(
            "route_name".to_string(),
            serde_json::json!(record.route_name.clone()),
        );
        data.insert("seq".to_string(), serde_json::json!(record.seq));
        data.insert(
            "process_type".to_string(),
            serde_json::json!(record.process_type.clone()),
        );
        data.insert(
            "default_duration_minutes".to_string(),
            serde_json::json!(record.default_duration_minutes),
        );
        data.insert(
            "require_scan".to_string(),
            serde_json::json!(record.require_scan),
        );
        data.insert("is_active".to_string(), serde_json::json!(record.is_active));

        Ok(PrintData {
            template: "process_route".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 染色批次卡打印数据
    async fn get_dye_batch_card_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::dye_batch;

        let record = dye_batch::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("染色批次卡 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "planned_quantity".to_string(),
            serde_json::json!(
                record
                    .planned_quantity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "started_at".to_string(),
            serde_json::json!(
                record
                    .started_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "completed_at".to_string(),
            serde_json::json!(
                record
                    .completed_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );

        Ok(PrintData {
            template: "dye_batch_card".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 染色返工单打印数据
    async fn get_dye_batch_rework_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::dye_batch_rework;

        let record = dye_batch_rework::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("染色返工单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "original_batch_no".to_string(),
            serde_json::json!(record.original_batch_no.clone()),
        );
        data.insert(
            "rework_batch_no".to_string(),
            serde_json::json!(record.rework_batch_no.clone().unwrap_or_default()),
        );
        data.insert(
            "rework_type".to_string(),
            serde_json::json!(record.rework_type.clone()),
        );
        data.insert(
            "rework_reason".to_string(),
            serde_json::json!(record.rework_reason.clone()),
        );
        data.insert(
            "original_status".to_string(),
            serde_json::json!(record.original_status.clone()),
        );
        data.insert(
            "rework_cost".to_string(),
            serde_json::json!(
                record
                    .rework_cost
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "started_at".to_string(),
            serde_json::json!(
                record
                    .started_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "completed_at".to_string(),
            serde_json::json!(
                record
                    .completed_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );

        Ok(PrintData {
            template: "dye_batch_rework".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 打样申请单打印数据
    async fn get_lab_dip_request_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::lab_dip_request;

        use crate::models::lab_dip_sample;

        let record = lab_dip_request::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("打样申请单 {} 未找到", id)))?;

        let items = lab_dip_sample::Entity::find()
            .filter(lab_dip_sample::Column::RequestId.eq(id))
            .order_by(lab_dip_sample::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "request_no".to_string(),
            serde_json::json!(record.request_no.clone()),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "customer_color_no".to_string(),
            serde_json::json!(record.customer_color_no.clone()),
        );
        data.insert(
            "customer_color_name".to_string(),
            serde_json::json!(record.customer_color_name.clone()),
        );
        data.insert(
            "fabric_spec".to_string(),
            serde_json::json!(record.fabric_spec.clone()),
        );
        data.insert(
            "fabric_component".to_string(),
            serde_json::json!(record.fabric_component.clone()),
        );
        data.insert(
            "light_source".to_string(),
            serde_json::json!(record.light_source.clone()),
        );
        data.insert(
            "dye_category".to_string(),
            serde_json::json!(record.dye_category.clone()),
        );
        data.insert(
            "required_date".to_string(),
            serde_json::json!(record.required_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert(
                "version_label".to_string(),
                serde_json::json!(item.version_label.clone()),
            );
            row.insert(
                "recipe_no".to_string(),
                serde_json::json!(item.recipe_no.clone()),
            );
            row.insert(
                "formula".to_string(),
                serde_json::json!(item.formula.clone().unwrap_or_default()),
            );
            row.insert(
                "temperature".to_string(),
                serde_json::json!(item.temperature.map(|v| v.to_string()).unwrap_or_default()),
            );
            row.insert(
                "time_minutes".to_string(),
                serde_json::json!(item.time_minutes),
            );
            row.insert(
                "liquor_ratio".to_string(),
                serde_json::json!(item.liquor_ratio.clone()),
            );
            row.insert(
                "dyeing_method".to_string(),
                serde_json::json!(item.dyeing_method.clone().unwrap_or_default()),
            );
            row.insert(
                "result".to_string(),
                serde_json::json!(item.matching_result.clone()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "lab_dip_request".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 色卡发放单打印数据
    async fn get_color_card_issue_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::color_card_issue;

        let record = color_card_issue::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("色卡发放单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "color_card_id".to_string(),
            serde_json::json!(record.color_card_id),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert("issue_qty".to_string(), serde_json::json!(record.issue_qty));
        data.insert(
            "issued_at".to_string(),
            serde_json::json!(record.issued_at.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "expected_return_date".to_string(),
            serde_json::json!(
                record
                    .expected_return_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "purpose".to_string(),
            serde_json::json!(record.purpose.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );

        Ok(PrintData {
            template: "color_card_issue".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 大货色审批单打印数据
    async fn get_bulk_color_approval_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::bulk_color_approval;

        let record = bulk_color_approval::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("大货色审批单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "dye_batch_id".to_string(),
            serde_json::json!(record.dye_batch_id),
        );
        data.insert(
            "customer_id".to_string(),
            serde_json::json!(record.customer_id),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "sample_type".to_string(),
            serde_json::json!(record.sample_type.clone()),
        );
        data.insert(
            "approval_status".to_string(),
            serde_json::json!(record.approval_status.clone()),
        );
        data.insert(
            "approval_date".to_string(),
            serde_json::json!(
                record
                    .approval_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "customer_feedback".to_string(),
            serde_json::json!(record.customer_feedback.clone().unwrap_or_default()),
        );
        data.insert(
            "delta_e_value".to_string(),
            serde_json::json!(
                record
                    .delta_e_value
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "reject_reason".to_string(),
            serde_json::json!(record.reject_reason.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "bulk_color_approval".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 委外加工单打印数据
    async fn get_outsourcing_order_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::outsourcing_order;

        use crate::models::outsourcing_order_item;

        let record = outsourcing_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("委外加工单 {} 未找到", id)))?;

        let items = outsourcing_order_item::Entity::find()
            .filter(outsourcing_order_item::Column::OutsourcingOrderId.eq(id))
            .order_by(outsourcing_order_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "order_no".to_string(),
            serde_json::json!(record.order_no.clone()),
        );
        data.insert(
            "order_type".to_string(),
            serde_json::json!(record.order_type.clone()),
        );
        data.insert(
            "supplier_id".to_string(),
            serde_json::json!(record.supplier_id),
        );
        data.insert(
            "dye_batch_id".to_string(),
            serde_json::json!(record.dye_batch_id),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "issue_date".to_string(),
            serde_json::json!(record.issue_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "issue_quantity".to_string(),
            serde_json::json!(record.issue_quantity.to_string()),
        );
        data.insert(
            "return_quantity".to_string(),
            serde_json::json!(record.return_quantity.to_string()),
        );
        data.insert(
            "loss_quantity".to_string(),
            serde_json::json!(record.loss_quantity.to_string()),
        );
        data.insert(
            "material_cost".to_string(),
            serde_json::json!(record.material_cost.to_string()),
        );
        data.insert(
            "processing_fee".to_string(),
            serde_json::json!(record.processing_fee.to_string()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("product_id".to_string(), serde_json::json!(item.product_id));
            row.insert(
                "color_no".to_string(),
                serde_json::json!(item.color_no.clone()),
            );
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert("unit".to_string(), serde_json::json!(item.unit.clone()));
            row.insert(
                "unit_cost".to_string(),
                serde_json::json!(item.unit_cost.to_string()),
            );
            row.insert(
                "total_cost".to_string(),
                serde_json::json!(item.total_cost.to_string()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "outsourcing_order".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 委外收货单打印数据
    async fn get_outsourcing_receipt_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::outsourcing_receipt;
        use crate::models::status::outsourcing_receipt_quality_status;

        let record = outsourcing_receipt::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("委外收货单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "receipt_no".to_string(),
            serde_json::json!(record.receipt_no.clone()),
        );
        data.insert(
            "outsourcing_order_id".to_string(),
            serde_json::json!(record.outsourcing_order_id),
        );
        data.insert(
            "receipt_date".to_string(),
            serde_json::json!(record.receipt_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "return_quantity".to_string(),
            serde_json::json!(record.return_quantity.to_string()),
        );
        data.insert(
            "loss_quantity".to_string(),
            serde_json::json!(record.loss_quantity.to_string()),
        );
        data.insert(
            "loss_rate".to_string(),
            serde_json::json!(record.loss_rate.map(|v| v.to_string()).unwrap_or_default()),
        );
        data.insert(
            "unit_cost".to_string(),
            serde_json::json!(record.unit_cost.to_string()),
        );
        data.insert(
            "total_cost".to_string(),
            serde_json::json!(record.total_cost.to_string()),
        );
        data.insert(
            "quality_status".to_string(),
            // 打印件是给人签收的，不能只给英文码；词表外的存量值原样带出以便发现脏数据
            serde_json::json!(
                record
                    .quality_status
                    .as_deref()
                    .map(|code| outsourcing_receipt_quality_status::label(code).unwrap_or(code))
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "grade".to_string(),
            serde_json::json!(record.grade.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "outsourcing_receipt".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 排程结果打印数据
    async fn get_scheduling_result_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::scheduling_result;

        let record = scheduling_result::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("排程结果 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "strategy".to_string(),
            serde_json::json!(record.strategy.clone()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "total_orders".to_string(),
            serde_json::json!(record.total_orders),
        );
        data.insert(
            "scheduled_orders".to_string(),
            serde_json::json!(record.scheduled_orders),
        );
        data.insert(
            "unscheduled_orders".to_string(),
            serde_json::json!(record.unscheduled_orders),
        );
        data.insert(
            "conflict_count".to_string(),
            serde_json::json!(record.conflict_count),
        );
        data.insert(
            "schedule_start_date".to_string(),
            serde_json::json!(record.schedule_start_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "schedule_end_date".to_string(),
            serde_json::json!(record.schedule_end_date.format("%Y-%m-%d").to_string()),
        );

        Ok(PrintData {
            template: "scheduling_result".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 化工料领用单打印数据
    async fn get_chemical_requisition_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::chemical_requisition;

        let record = chemical_requisition::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("化工料领用单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "requisition_no".to_string(),
            serde_json::json!(record.requisition_no.clone()),
        );
        data.insert(
            "requisition_type".to_string(),
            serde_json::json!(record.requisition_type.clone()),
        );
        data.insert(
            "department_id".to_string(),
            serde_json::json!(record.department_id),
        );
        data.insert(
            "requisition_date".to_string(),
            serde_json::json!(record.requisition_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "required_date".to_string(),
            serde_json::json!(
                record
                    .required_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "dye_batch_id".to_string(),
            serde_json::json!(record.dye_batch_id),
        );
        data.insert(
            "production_order_id".to_string(),
            serde_json::json!(record.production_order_id),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(record.total_amount.to_string()),
        );

        Ok(PrintData {
            template: "chemical_requisition".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

}
