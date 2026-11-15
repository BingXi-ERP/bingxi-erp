//! export_trade 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::EntityTrait;
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 原产地证明打印数据
    pub(super) async fn get_certificate_of_origin_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::certificate_of_origin;

        let record = certificate_of_origin::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("原产地证明 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "certificate_no".to_string(),
            serde_json::json!(record.certificate_no.clone()),
        );
        data.insert(
            "product_name".to_string(),
            serde_json::json!(record.product_name.clone()),
        );
        data.insert(
            "hs_code".to_string(),
            serde_json::json!(record.hs_code.clone()),
        );
        data.insert(
            "origin_country".to_string(),
            serde_json::json!(record.origin_country.clone()),
        );
        data.insert(
            "destination_country".to_string(),
            serde_json::json!(record.destination_country.clone()),
        );
        data.insert(
            "quantity".to_string(),
            serde_json::json!(record.quantity.to_string()),
        );
        data.insert("unit".to_string(), serde_json::json!(record.unit.clone()));
        data.insert(
            "certificate_type".to_string(),
            serde_json::json!(record.certificate_type.clone()),
        );
        data.insert(
            "issue_date".to_string(),
            serde_json::json!(record.issue_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "certificate_of_origin".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 出口报关单打印数据
    pub(super) async fn get_export_customs_declaration_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::export_customs_declaration;

        let record = export_customs_declaration::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("出口报关单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "declaration_no".to_string(),
            serde_json::json!(record.declaration_no.clone()),
        );
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "export_date".to_string(),
            serde_json::json!(record.export_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "destination_country".to_string(),
            serde_json::json!(record.destination_country.clone().unwrap_or_default()),
        );
        data.insert(
            "total_amount".to_string(),
            serde_json::json!(record.total_amount.to_string()),
        );
        data.insert(
            "customs_code".to_string(),
            serde_json::json!(record.customs_code.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "export_customs_declaration".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 出口检验单打印数据
    pub(super) async fn get_export_inspection_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::export_inspection;

        let record = export_inspection::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("出口检验单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "inspection_no".to_string(),
            serde_json::json!(record.inspection_no.clone()),
        );
        data.insert(
            "sales_order_id".to_string(),
            serde_json::json!(record.sales_order_id),
        );
        data.insert(
            "product_name".to_string(),
            serde_json::json!(record.product_name.clone()),
        );
        data.insert(
            "hs_code".to_string(),
            serde_json::json!(record.hs_code.clone()),
        );
        data.insert(
            "inspection_type".to_string(),
            serde_json::json!(record.inspection_type.clone()),
        );
        data.insert(
            "inspection_agency".to_string(),
            serde_json::json!(record.inspection_agency.clone()),
        );
        data.insert(
            "inspection_date".to_string(),
            serde_json::json!(record.inspection_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "result".to_string(),
            serde_json::json!(record.result.clone()),
        );
        data.insert(
            "certificate_no".to_string(),
            serde_json::json!(record.certificate_no.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "export_inspection".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }
}
