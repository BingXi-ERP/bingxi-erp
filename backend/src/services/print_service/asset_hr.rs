//! asset_hr 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, EntityTrait, Order, QueryFilter, QueryOrder};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 物流运单打印数据
    pub(super) async fn get_logistics_waybill_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::logistics_waybill;

        let record = logistics_waybill::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("物流运单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert("order_id".to_string(), serde_json::json!(record.order_id));
        data.insert(
            "logistics_company".to_string(),
            serde_json::json!(record.logistics_company.clone()),
        );
        data.insert(
            "tracking_number".to_string(),
            serde_json::json!(record.tracking_number.clone()),
        );
        data.insert(
            "driver_name".to_string(),
            serde_json::json!(record.driver_name.clone().unwrap_or_default()),
        );
        data.insert(
            "freight_fee".to_string(),
            serde_json::json!(
                record
                    .freight_fee
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "total_weight".to_string(),
            serde_json::json!(
                record
                    .total_weight
                    .map(|v| v.to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "expected_arrival".to_string(),
            serde_json::json!(
                record
                    .expected_arrival
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "actual_arrival".to_string(),
            serde_json::json!(
                record
                    .actual_arrival
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );

        Ok(PrintData {
            template: "logistics_waybill".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 能耗记录打印数据
    pub(super) async fn get_energy_consumption_record_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::energy_consumption_record;

        let record = energy_consumption_record::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("能耗记录 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "record_no".to_string(),
            serde_json::json!(record.record_no.clone()),
        );
        data.insert(
            "meter_type".to_string(),
            serde_json::json!(record.meter_type.clone()),
        );
        data.insert(
            "workshop".to_string(),
            serde_json::json!(record.workshop.clone().unwrap_or_default()),
        );
        data.insert("unit".to_string(), serde_json::json!(record.unit.clone()));
        data.insert(
            "previous_reading".to_string(),
            serde_json::json!(record.previous_reading.to_string()),
        );
        data.insert(
            "current_reading".to_string(),
            serde_json::json!(record.current_reading.to_string()),
        );
        data.insert(
            "consumption".to_string(),
            serde_json::json!(record.consumption.to_string()),
        );
        data.insert(
            "unit_price".to_string(),
            serde_json::json!(record.unit_price.to_string()),
        );
        data.insert(
            "total_cost".to_string(),
            serde_json::json!(record.total_cost.to_string()),
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
            "dye_lot_no".to_string(),
            serde_json::json!(record.dye_lot_no.clone()),
        );
        data.insert(
            "equipment_name".to_string(),
            serde_json::json!(record.equipment_name.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "energy_consumption_record".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 固定资产卡片打印数据
    pub(super) async fn get_fixed_asset_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::fixed_asset;

        let record = fixed_asset::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("固定资产卡片 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "asset_no".to_string(),
            serde_json::json!(record.asset_no.clone()),
        );
        data.insert(
            "asset_name".to_string(),
            serde_json::json!(record.asset_name.clone()),
        );
        data.insert(
            "asset_category".to_string(),
            serde_json::json!(record.asset_category.clone().unwrap_or_default()),
        );
        data.insert(
            "specification".to_string(),
            serde_json::json!(record.specification.clone().unwrap_or_default()),
        );
        data.insert(
            "model".to_string(),
            serde_json::json!(record.model.clone().unwrap_or_default()),
        );
        data.insert(
            "original_value".to_string(),
            serde_json::json!(record.original_value.to_string()),
        );
        data.insert(
            "accumulated_depreciation".to_string(),
            serde_json::json!(record.accumulated_depreciation.to_string()),
        );
        data.insert(
            "net_value".to_string(),
            serde_json::json!(record.net_value.map(|v| v.to_string()).unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "purchase_date".to_string(),
            serde_json::json!(
                record
                    .purchase_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "in_service_date".to_string(),
            serde_json::json!(
                record
                    .in_service_date
                    .map(|d| d.format("%Y-%m-%d").to_string())
                    .unwrap_or_default()
            ),
        );

        Ok(PrintData {
            template: "fixed_asset".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

    /// 固定资产盘点单打印数据
    pub(super) async fn get_fixed_asset_count_print_data(
        &self,
        id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::fixed_asset_count;

        use crate::models::fixed_asset_count_item;

        let record = fixed_asset_count::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("固定资产盘点单 {} 未找到", id)))?;

        let items = fixed_asset_count_item::Entity::find()
            .filter(fixed_asset_count_item::Column::CountId.eq(id))
            .order_by(fixed_asset_count_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "count_no".to_string(),
            serde_json::json!(record.count_no.clone()),
        );
        data.insert(
            "plan_name".to_string(),
            serde_json::json!(record.plan_name.clone()),
        );
        data.insert(
            "count_date".to_string(),
            serde_json::json!(record.count_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "asset_category".to_string(),
            serde_json::json!(record.asset_category.clone().unwrap_or_default()),
        );
        data.insert(
            "use_location".to_string(),
            serde_json::json!(record.use_location.clone().unwrap_or_default()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "total_items".to_string(),
            serde_json::json!(record.total_items),
        );
        data.insert(
            "counted_items".to_string(),
            serde_json::json!(record.counted_items),
        );
        data.insert(
            "surplus_items".to_string(),
            serde_json::json!(record.surplus_items),
        );
        data.insert(
            "shortage_items".to_string(),
            serde_json::json!(record.shortage_items),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert(
                "asset_no".to_string(),
                serde_json::json!(item.asset_no.clone()),
            );
            row.insert(
                "asset_name".to_string(),
                serde_json::json!(item.asset_name.clone()),
            );
            row.insert(
                "book_original_value".to_string(),
                serde_json::json!(item.book_original_value.to_string()),
            );
            row.insert(
                "actual_original_value".to_string(),
                serde_json::json!(
                    item.actual_original_value
                        .map(|v| v.to_string())
                        .unwrap_or_default()
                ),
            );
            row.insert(
                "count_result".to_string(),
                serde_json::json!(item.count_result.clone().unwrap_or_default()),
            );
            row.insert(
                "variance_type".to_string(),
                serde_json::json!(item.variance_type.clone().unwrap_or_default()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "fixed_asset_count".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }
}
