//! quality 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, EntityTrait, Order, QueryFilter, QueryOrder};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 质检记录打印数据
    pub(super) async fn get_quality_inspection_record_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::quality_inspection_record;

        let record = quality_inspection_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("质检记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "inspection_no".to_string(),
            serde_json::json!(record.inspection_no.clone()),
        );
        data.insert(
            "inspection_type".to_string(),
            serde_json::json!(record.inspection_type.clone()),
        );
        data.insert(
            "product_id".to_string(),
            serde_json::json!(record.product_id),
        );
        data.insert(
            "batch_no".to_string(),
            serde_json::json!(record.batch_no.clone()),
        );
        data.insert(
            "inspection_date".to_string(),
            serde_json::json!(record.inspection_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "total_qty".to_string(),
            serde_json::json!(record.total_qty.to_string()),
        );
        data.insert(
            "inspected_qty".to_string(),
            serde_json::json!(record.inspected_qty.to_string()),
        );
        data.insert(
            "qualified_qty".to_string(),
            serde_json::json!(
                record
                    .qualified_qty
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "unqualified_qty".to_string(),
            serde_json::json!(
                record
                    .unqualified_qty
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "qualification_rate".to_string(),
            serde_json::json!(
                record
                    .qualification_rate
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "inspection_result".to_string(),
            serde_json::json!(record.inspection_result.clone()),
        );
        data.insert(
            "grade".to_string(),
            serde_json::json!(record.grade.clone().unwrap_or_default()),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );

        Ok(PrintData {
            template: "quality_inspection_record".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 8D质量报告打印数据
    pub(super) async fn get_quality_8d_report_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::quality_8d_report;

        let record = quality_8d_report::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("8D质量报告 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "quality_issue_id".to_string(),
            serde_json::json!(record.quality_issue_id),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "d0_date".to_string(),
            serde_json::json!(
                record
                    .d0_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "d0_plan".to_string(),
            serde_json::json!(record.d0_plan.clone().unwrap_or_default()),
        );
        data.insert(
            "d1_team_members".to_string(),
            serde_json::json!(record.d1_team_members.clone().unwrap_or_default()),
        );
        data.insert(
            "d2_problem_description".to_string(),
            serde_json::json!(record.d2_problem_description.clone().unwrap_or_default()),
        );
        data.insert(
            "d3_interim_action".to_string(),
            serde_json::json!(record.d3_interim_action.clone().unwrap_or_default()),
        );
        data.insert(
            "d4_root_cause_summary".to_string(),
            serde_json::json!(record.d4_root_cause_summary.clone().unwrap_or_default()),
        );
        data.insert(
            "d5_permanent_action".to_string(),
            serde_json::json!(record.d5_permanent_action.clone().unwrap_or_default()),
        );
        data.insert(
            "d6_verification_result".to_string(),
            serde_json::json!(record.d6_verification_result.clone().unwrap_or_default()),
        );
        data.insert(
            "d7_prevention_action".to_string(),
            serde_json::json!(record.d7_prevention_action.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "quality_8d_report".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 质量问题单打印数据
    pub(super) async fn get_quality_issue_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::quality_issue;

        let record = quality_issue::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("质量问题单 {} 未找到", id)))?;

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
            "severity".to_string(),
            serde_json::json!(record.severity.clone()),
        );
        data.insert(
            "description".to_string(),
            serde_json::json!(record.description.clone()),
        );
        data.insert(
            "discovered_at".to_string(),
            serde_json::json!(record.discovered_at.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "resolved_at".to_string(),
            serde_json::json!(
                record
                    .resolved_at
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "resolution".to_string(),
            serde_json::json!(record.resolution.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "root_cause_method".to_string(),
            serde_json::json!(record.root_cause_method.clone().unwrap_or_default()),
        );
        data.insert(
            "root_cause_detail".to_string(),
            serde_json::json!(record.root_cause_detail.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "quality_issue".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 验布记录打印数据
    pub(super) async fn get_fabric_inspection_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::fabric_inspection_record;

        let record = fabric_inspection_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("验布记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "inspection_no".to_string(),
            serde_json::json!(record.inspection_no.clone()),
        );
        data.insert(
            "flow_card_id".to_string(),
            serde_json::json!(record.flow_card_id),
        );
        data.insert(
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "product_name".to_string(),
            serde_json::json!(record.product_name.clone().unwrap_or_default()),
        );
        data.insert(
            "color_no".to_string(),
            serde_json::json!(record.color_no.clone()),
        );
        data.insert(
            "inspection_date".to_string(),
            serde_json::json!(record.inspection_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "inspector_name".to_string(),
            serde_json::json!(record.inspector_name.clone().unwrap_or_default()),
        );
        data.insert(
            "machine_no".to_string(),
            serde_json::json!(record.machine_no.clone().unwrap_or_default()),
        );
        data.insert(
            "scoring_system".to_string(),
            serde_json::json!(record.scoring_system.clone()),
        );
        data.insert(
            "inspected_yards".to_string(),
            serde_json::json!(record.inspected_yards.to_string()),
        );
        data.insert(
            "total_defect_points".to_string(),
            serde_json::json!(record.total_defect_points),
        );
        data.insert(
            "grade".to_string(),
            serde_json::json!(record.grade.clone().unwrap_or_default()),
        );
        data.insert(
            "abc_grade".to_string(),
            serde_json::json!(record.abc_grade.clone().unwrap_or_default()),
        );
        data.insert(
            "total_rolls".to_string(),
            serde_json::json!(record.total_rolls),
        );

        Ok(PrintData {
            template: "fabric_inspection".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 安全事故报告打印数据
    pub(super) async fn get_safety_accident_report_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::safety_accident_report;

        let record = safety_accident_report::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("安全事故报告 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "accident_no".to_string(),
            serde_json::json!(record.accident_no.clone()),
        );
        data.insert(
            "accident_level".to_string(),
            serde_json::json!(record.accident_level.clone()),
        );
        data.insert(
            "accident_date".to_string(),
            serde_json::json!(record.accident_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "location".to_string(),
            serde_json::json!(record.location.clone().unwrap_or_default()),
        );
        data.insert(
            "description".to_string(),
            serde_json::json!(record.description.clone()),
        );
        data.insert(
            "casualties".to_string(),
            serde_json::json!(record.casualties),
        );
        data.insert(
            "direct_loss".to_string(),
            serde_json::json!(
                record
                    .direct_loss
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "cause".to_string(),
            serde_json::json!(record.cause.clone().unwrap_or_default()),
        );
        data.insert(
            "measures".to_string(),
            serde_json::json!(record.measures.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "safety_accident_report".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 职业病危害监测打印数据
    pub(super) async fn get_occupational_hazard_monitoring_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::occupational_hazard_monitoring;

        let record = occupational_hazard_monitoring::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("职业病危害监测 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "hazard_type".to_string(),
            serde_json::json!(record.hazard_type.clone()),
        );
        data.insert(
            "hazard_name".to_string(),
            serde_json::json!(record.hazard_name.clone()),
        );
        data.insert(
            "monitoring_point".to_string(),
            serde_json::json!(record.monitoring_point.clone()),
        );
        data.insert(
            "measured_value".to_string(),
            serde_json::json!(record.measured_value.to_string()),
        );
        data.insert("unit".to_string(), serde_json::json!(record.unit.clone()));
        data.insert(
            "limit_value".to_string(),
            serde_json::json!(record.limit_value.to_string()),
        );
        data.insert(
            "is_exceeding".to_string(),
            serde_json::json!(record.is_exceeding),
        );
        data.insert(
            "exceeding_ratio".to_string(),
            serde_json::json!(
                record
                    .exceeding_ratio
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "monitoring_date".to_string(),
            serde_json::json!(record.monitoring_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "monitoring_organization".to_string(),
            serde_json::json!(record.monitoring_organization.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "occupational_hazard_monitoring".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 排污许可证打印数据
    pub(super) async fn get_pollution_permit_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::pollution_permit;

        let record = pollution_permit::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("排污许可证 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "permit_no".to_string(),
            serde_json::json!(record.permit_no.clone()),
        );
        data.insert(
            "permit_type".to_string(),
            serde_json::json!(record.permit_type.clone()),
        );
        data.insert(
            "permit_category".to_string(),
            serde_json::json!(record.permit_category.clone().unwrap_or_default()),
        );
        data.insert(
            "issue_date".to_string(),
            serde_json::json!(record.issue_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "expiry_date".to_string(),
            serde_json::json!(record.expiry_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "issuing_authority".to_string(),
            serde_json::json!(record.issuing_authority.clone()),
        );
        data.insert(
            "permitted_capacity".to_string(),
            serde_json::json!(
                record
                    .permitted_capacity
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "capacity_unit".to_string(),
            serde_json::json!(record.capacity_unit.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "pollution_permit".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 固废处置单打印数据
    pub(super) async fn get_solid_waste_disposal_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::solid_waste_disposal_record;

        let record = solid_waste_disposal_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("固废处置单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "manifest_no".to_string(),
            serde_json::json!(record.manifest_no.clone()),
        );
        data.insert(
            "waste_type".to_string(),
            serde_json::json!(record.waste_type.clone()),
        );
        data.insert(
            "waste_category".to_string(),
            serde_json::json!(record.waste_category.clone()),
        );
        data.insert(
            "waste_amount".to_string(),
            serde_json::json!(record.waste_amount.to_string()),
        );
        data.insert(
            "waste_unit".to_string(),
            serde_json::json!(record.waste_unit.clone()),
        );
        data.insert(
            "generation_date".to_string(),
            serde_json::json!(record.generation_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "disposal_date".to_string(),
            serde_json::json!(
                record
                    .disposal_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "disposal_method".to_string(),
            serde_json::json!(record.disposal_method.clone()),
        );
        data.insert(
            "disposal_vendor_name".to_string(),
            serde_json::json!(record.disposal_vendor_name.clone().unwrap_or_default()),
        );
        data.insert(
            "transport_license_no".to_string(),
            serde_json::json!(record.transport_license_no.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "solid_waste_disposal".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 职业健康体检打印数据
    pub(super) async fn get_occupational_health_exam_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::occupational_health_exam;

        let record = occupational_health_exam::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("职业健康体检 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert("worker_id".to_string(), serde_json::json!(record.worker_id));
        data.insert(
            "exam_type".to_string(),
            serde_json::json!(record.exam_type.clone()),
        );
        data.insert(
            "exam_date".to_string(),
            serde_json::json!(record.exam_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "next_exam_date".to_string(),
            serde_json::json!(
                record
                    .next_exam_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "exam_organization".to_string(),
            serde_json::json!(record.exam_organization.clone().unwrap_or_default()),
        );
        data.insert(
            "exam_result".to_string(),
            serde_json::json!(record.exam_result.clone()),
        );
        data.insert(
            "contraindications".to_string(),
            serde_json::json!(record.contraindications.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "occupational_health_exam".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 劳保用品发放记录打印数据
    pub(super) async fn get_ppe_distribution_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::ppe_distribution_record;

        let record = ppe_distribution_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("劳保用品发放记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert("worker_id".to_string(), serde_json::json!(record.worker_id));
        data.insert(
            "ppe_name".to_string(),
            serde_json::json!(record.ppe_name.clone()),
        );
        data.insert(
            "ppe_type".to_string(),
            serde_json::json!(record.ppe_type.clone()),
        );
        data.insert(
            "specification".to_string(),
            serde_json::json!(record.specification.clone().unwrap_or_default()),
        );
        data.insert(
            "quantity".to_string(),
            serde_json::json!(record.quantity.to_string()),
        );
        data.insert(
            "distribution_date".to_string(),
            serde_json::json!(record.distribution_date.format("%Y-%m-%d").to_string()),
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
            "hazard_type".to_string(),
            serde_json::json!(record.hazard_type.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "ppe_distribution".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 社保缴纳记录打印数据
    pub(super) async fn get_social_insurance_record_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::social_insurance_record;

        let record = social_insurance_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("社保缴纳记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert("worker_id".to_string(), serde_json::json!(record.worker_id));
        data.insert(
            "period_year".to_string(),
            serde_json::json!(record.period_year),
        );
        data.insert(
            "period_month".to_string(),
            serde_json::json!(record.period_month),
        );
        data.insert(
            "base_amount".to_string(),
            serde_json::json!(record.base_amount.to_string()),
        );
        data.insert(
            "pension_employer".to_string(),
            serde_json::json!(record.pension_employer.to_string()),
        );
        data.insert(
            "pension_employee".to_string(),
            serde_json::json!(record.pension_employee.to_string()),
        );
        data.insert(
            "medical_employer".to_string(),
            serde_json::json!(record.medical_employer.to_string()),
        );
        data.insert(
            "medical_employee".to_string(),
            serde_json::json!(record.medical_employee.to_string()),
        );
        data.insert(
            "total_employer".to_string(),
            serde_json::json!(record.total_employer.to_string()),
        );
        data.insert(
            "total_employee".to_string(),
            serde_json::json!(record.total_employee.to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "social_insurance_record".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 劳动合同打印数据
    pub(super) async fn get_labor_contract_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::labor_contract;

        let record = labor_contract::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("劳动合同 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert("worker_id".to_string(), serde_json::json!(record.worker_id));
        data.insert(
            "contract_no".to_string(),
            serde_json::json!(record.contract_no.clone()),
        );
        data.insert(
            "contract_type".to_string(),
            serde_json::json!(record.contract_type.clone()),
        );
        data.insert(
            "start_date".to_string(),
            serde_json::json!(record.start_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "end_date".to_string(),
            serde_json::json!(
                record
                    .end_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "probation_salary".to_string(),
            serde_json::json!(record.probation_salary.to_string()),
        );
        data.insert(
            "regular_salary".to_string(),
            serde_json::json!(record.regular_salary.to_string()),
        );
        data.insert(
            "position".to_string(),
            serde_json::json!(record.position.clone().unwrap_or_default()),
        );
        data.insert(
            "department".to_string(),
            serde_json::json!(record.department.clone().unwrap_or_default()),
        );
        data.insert(
            "working_hours_system".to_string(),
            serde_json::json!(record.working_hours_system.clone()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "labor_contract".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 工资记录打印数据
    pub(super) async fn get_wage_record_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::wage_record;

        use crate::models::wage_record_detail;

        let record = wage_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("工资记录 {} 未找到", id)))?;

        let items = wage_record_detail::Entity::find()
            .filter(wage_record_detail::Column::WageRecordId.eq(id))
            .order_by(wage_record_detail::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "record_no".to_string(),
            serde_json::json!(record.record_no.clone()),
        );
        data.insert(
            "period_start".to_string(),
            serde_json::json!(record.period_start.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "period_end".to_string(),
            serde_json::json!(record.period_end.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "workshop".to_string(),
            serde_json::json!(record.workshop.clone().unwrap_or_default()),
        );
        data.insert(
            "total_workers".to_string(),
            serde_json::json!(record.total_workers),
        );
        data.insert(
            "total_qualified_quantity".to_string(),
            serde_json::json!(record.total_qualified_quantity.to_string()),
        );
        data.insert(
            "total_duration_minutes".to_string(),
            serde_json::json!(record.total_duration_minutes),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(record.total_amount.to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert(
                "worker_name".to_string(),
                serde_json::json!(item.worker_name.clone().unwrap_or_default()),
            );
            row.insert(
                "equipment_name".to_string(),
                serde_json::json!(item.equipment_name.clone().unwrap_or_default()),
            );
            row.insert(
                "wage_type".to_string(),
                serde_json::json!(item.wage_type.clone()),
            );
            row.insert("grade".to_string(), serde_json::json!(item.grade.clone()));
            row.insert(
                "actual_quantity".to_string(),
                serde_json::json!(item.actual_quantity.to_string()),
            );
            row.insert(
                "qualified_quantity".to_string(),
                serde_json::json!(item.qualified_quantity.to_string()),
            );
            row.insert(
                "piece_price".to_string(),
                serde_json::json!(item.piece_price.to_string()),
            );
            row.insert(
                "duration_minutes".to_string(),
                serde_json::json!(item.duration_minutes),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "wage_record".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }
}
