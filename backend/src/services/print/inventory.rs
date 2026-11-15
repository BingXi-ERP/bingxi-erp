//! inventory 域打印取数（自 print_service.rs 拆分，方法签名零改动）

use crate::utils::error::AppError;
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order, QueryFilter, QueryOrder, QuerySelect, RelationTrait};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::PrintData;

impl super::PrintService {
    /// 库存调拨单打印数据：调拨主表 + 调出/调入仓库 + 明细项（含产品）
    async fn get_inventory_transfer_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        let ctx = self.fetch_transfer_print_context(id).await?;
        let data = Self::build_transfer_main_data(&ctx);
        let item_list = Self::build_transfer_item_list(&ctx);
        Ok(PrintData {
            template: "inventory_transfer".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 查询调拨单所有关联数据：主表、调出/调入仓库、明细、产品映射
    async fn fetch_transfer_print_context(
        &self,
        id: i32,
    ) -> Result<TransferPrintContext, AppError> {
        use crate::models::{inventory_transfer, inventory_transfer_item, product, warehouse};

        let transfer = inventory_transfer::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("库存调拨单 {} 未找到", id)))?;

        let from_warehouse = warehouse::Entity::find_by_id(transfer.from_warehouse_id)
            .one(&*self.db)
            .await?;
        let to_warehouse = warehouse::Entity::find_by_id(transfer.to_warehouse_id)
            .one(&*self.db)
            .await?;

        let items = inventory_transfer_item::Entity::find()
            .filter(inventory_transfer_item::Column::TransferId.eq(id))
            .order_by(inventory_transfer_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let product_ids: Vec<i32> = items.iter().map(|i| i.product_id).collect();
        let products = product::Entity::find()
            .filter(product::Column::Id.is_in(product_ids))
            .all(&*self.db)
            .await?;
        let product_map: HashMap<i32, product::Model> =
            products.into_iter().map(|p| (p.id, p)).collect();

        Ok(TransferPrintContext {
            transfer,
            from_warehouse,
            to_warehouse,
            items,
            product_map,
        })
    }


    /// 构建调拨单主表数据 HashMap
    fn build_transfer_main_data(ctx: &TransferPrintContext) -> HashMap<String, serde_json::Value> {
        let mut data = HashMap::new();
        data.insert(
            "transfer_no".to_string(),
            serde_json::json!(ctx.transfer.transfer_no.clone()),
        );
        data.insert(
            "from_warehouse_name".to_string(),
            serde_json::json!(
                ctx.from_warehouse
                    .as_ref()
                    .map(|w| w.name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "to_warehouse_name".to_string(),
            serde_json::json!(
                ctx.to_warehouse
                    .as_ref()
                    .map(|w| w.name.clone())
                    .unwrap_or_default()
            ),
        );
        data.insert(
            "transfer_date".to_string(),
            serde_json::json!(
                ctx.transfer
                    .transfer_date
                    .format("%Y-%m-%d %H:%M")
                    .to_string()
            ),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(ctx.transfer.status.clone()),
        );
        data.insert(
            "total_quantity".to_string(),
            serde_json::json!(ctx.transfer.total_quantity.to_string()),
        );
        data.insert(
            "notes".to_string(),
            serde_json::json!(ctx.transfer.notes.clone().unwrap_or_default()),
        );
        data
    }


    /// 构建调拨单明细项列表
    fn build_transfer_item_list(
        ctx: &TransferPrintContext,
    ) -> Vec<HashMap<String, serde_json::Value>> {
        let mut item_list = Vec::with_capacity(ctx.items.len());
        for (i, item) in ctx.items.iter().enumerate() {
            let product = ctx.product_map.get(&item.product_id);
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
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "shipped_quantity".to_string(),
                serde_json::json!(item.shipped_quantity.to_string()),
            );
            row.insert(
                "received_quantity".to_string(),
                serde_json::json!(item.received_quantity.to_string()),
            );
            row.insert(
                "unit_cost".to_string(),
                serde_json::json!(item.unit_cost.map(|c| c.to_string()).unwrap_or_default()),
            );
            item_list.push(row);
        }
        item_list
    }


    /// 库存调整单打印数据
    async fn get_inventory_adjustment_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::inventory_adjustment;

        use crate::models::inventory_adjustment_item;

        let record = inventory_adjustment::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("库存调整单 {} 未找到", id)))?;

        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(id))
            .order_by(inventory_adjustment_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        let mut data = HashMap::new();
        data.insert(
            "adjustment_no".to_string(),
            serde_json::json!(record.adjustment_no.clone()),
        );
        data.insert(
            "warehouse_id".to_string(),
            serde_json::json!(record.warehouse_id),
        );
        data.insert(
            "adjustment_date".to_string(),
            serde_json::json!(record.adjustment_date.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "adjustment_type".to_string(),
            serde_json::json!(record.adjustment_type.clone()),
        );
        data.insert(
            "reason_type".to_string(),
            serde_json::json!(record.reason_type.clone()),
        );
        data.insert(
            "total_quantity".to_string(),
            serde_json::json!(record.total_quantity.to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        let mut item_list = Vec::with_capacity(items.len());
        for item in items {
            let mut row = HashMap::new();
            row.insert("stock_id".to_string(), serde_json::json!(item.stock_id));
            row.insert(
                "quantity".to_string(),
                serde_json::json!(item.quantity.to_string()),
            );
            row.insert(
                "quantity_before".to_string(),
                serde_json::json!(item.quantity_before.to_string()),
            );
            row.insert(
                "quantity_after".to_string(),
                serde_json::json!(item.quantity_after.to_string()),
            );
            row.insert(
                "unit_cost".to_string(),
                serde_json::json!(item.unit_cost.map(|v| v.to_string()).unwrap_or_default()),
            );
            row.insert(
                "amount".to_string(),
                serde_json::json!(item.amount.map(|v| v.to_string()).unwrap_or_default()),
            );
            item_list.push(row);
        }

        Ok(PrintData {
            template: "inventory_adjustment".to_string(),
            data,
            items: item_list,
            image: None,
        })
    }


    /// 存货跌价准备打印数据
    async fn get_inventory_write_down_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::inventory_write_down;

        let record = inventory_write_down::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("存货跌价准备 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "product_id".to_string(),
            serde_json::json!(record.product_id),
        );
        data.insert(
            "write_down_type".to_string(),
            serde_json::json!(record.write_down_type.clone()),
        );
        data.insert(
            "original_cost".to_string(),
            serde_json::json!(record.original_cost.to_string()),
        );
        data.insert(
            "net_realizable_value".to_string(),
            serde_json::json!(record.net_realizable_value.to_string()),
        );
        data.insert(
            "write_down_amount".to_string(),
            serde_json::json!(record.write_down_amount.to_string()),
        );
        data.insert(
            "reason".to_string(),
            serde_json::json!(record.reason.clone().unwrap_or_default()),
        );
        data.insert(
            "period".to_string(),
            serde_json::json!(record.period.format("%Y-%m-%d").to_string()),
        );
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );

        Ok(PrintData {
            template: "inventory_write_down".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 成品布入库标签数据装配（doc_type `inventory_piece_label`）
    /// 1. 单次查询该匹行 + LEFT JOIN products（款号=product.code、品名=product.name，
    ///    PurchaseOrderDto 范式，禁止逐行再查/造假名）；
    /// 2. 状态门控（BUSINESS_ERROR 族）：样布(SAMPLE)与非染色匹(≠dyed)按业务错误拒绝；
    /// 3. fail-closed（VALIDATION_ERROR 族/400）：缸号/色号/批次/匹号/米数/重量/幅宽/克重
    ///    八个必填字段与条码任一为空即拒绝打印，错误逐字段点名缺哪一列；
    ///    文案只回显公开规则与该匹匹号（操作员点选的用户可见值），不含内部 ID/表名/SQL；
    /// 4. 条码图形：校验通过的 `barcode` 码值经 utils::barcode 渲成 Code128 PNG，
    ///    随 PrintData.image 进 docx（文本码值行与图形同源同值）；
    /// 5. 保密口径：标签绝不出现 supplier_piece_no、供应商侧商品/色号编码、供应商名称、成本单价。
    async fn get_inventory_piece_label_print_data(
        &self,
        piece_id: i32,
    ) -> Result<PrintData, AppError> {
        use crate::models::inventory_piece;
        use crate::models::product;
        use crate::models::status::inventory_piece as piece_status;
        use crate::services::piece_domain_service::PIECE_TYPE_DYED;

        let view = inventory_piece::Entity::find_by_id(piece_id)
            .column_as(product::Column::Code, "product_code")
            .column_as(product::Column::Name, "product_name")
            .join(JoinType::LeftJoin, inventory_piece::Relation::Product.def())
            .into_model::<PieceLabelView>()
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("库存匹 {} 未找到", piece_id)))?;

        // —— 状态门控：样布与生产匹（greige 等非 dyed）不打入库卷唛，业务族拒绝（真实原因进日志）——
        if view.status == piece_status::SAMPLE {
            tracing::warn!(
                piece_id = view.id,
                piece_no = %view.piece_no,
                "样布匹拒绝打印成品布入库标签（SAMPLE 不参与入库打签）"
            );
            return Err(AppError::business(format!(
                "样布匹不允许打印成品布入库标签，匹号 {}",
                view.piece_no
            )));
        }
        if view.piece_type != PIECE_TYPE_DYED {
            tracing::warn!(
                piece_id = view.id,
                piece_no = %view.piece_no,
                piece_type = %view.piece_type,
                "非染色匹拒绝打印成品布入库标签（仅 piece_type=dyed 可打签）"
            );
            return Err(AppError::business(format!(
                "仅染色匹(dyed)允许打印成品布入库标签，匹号 {}",
                view.piece_no
            )));
        }

        // —— fail-closed：8 必填字段 + 条码，任一缺值即拒打并逐字段点名（绝不把缺值印成 0/空串）——
        let mut missing: Vec<&'static str> = Vec::new();
        if view.dye_lot_no.trim().is_empty() {
            missing.push("缸号(dye_lot_no)");
        }
        if view.color_no.trim().is_empty() {
            missing.push("色号(color_no)");
        }
        if view.batch_no.trim().is_empty() {
            missing.push("批次(batch_no)");
        }
        if view.piece_no.trim().is_empty() {
            missing.push("匹号(piece_no)");
        }
        // 米数为 NOT NULL 列，≤0 视同无实测依据（宁可拒绝，不印假值）
        if view.length <= rust_decimal::Decimal::ZERO {
            missing.push("米数(length)");
        }
        if view.weight.is_none() {
            missing.push("重量(weight)");
        }
        if view.width.is_none() {
            missing.push("幅宽(width)");
        }
        if view.gram_weight.is_none() {
            missing.push("克重(gram_weight)");
        }
        // 条码缺值口径（决策 §2 原文含空串）：NULL 与 Some(空白串) 同为「无码可打」；
        // 放宽成只判 is_none 会让空条码静默出一张扫不出的空白图形，fail-closed 不允许。
        if view
            .barcode
            .as_deref()
            .unwrap_or_default()
            .trim()
            .is_empty()
        {
            missing.push("条码(barcode)");
        }
        if !missing.is_empty() {
            tracing::warn!(
                piece_id = view.id,
                piece_no = %view.piece_no,
                missing = %missing.join("、"),
                "成品布标签缺必填字段，拒绝打印（fail-closed）"
            );
            return Err(AppError::validation_displayable(format!(
                "匹号 {} 缺少成品布入库标签必填信息：{}；请先补录打卷实测值后再打印",
                view.piece_no,
                missing.join("、")
            )));
        }

        // 必填性已由上方 fail-closed 逐列校验保证，以下解构仅收敛类型；
        // 若未来有人放宽上方校验走到 expect panic，那是"校验与装配漂移"的真实缺陷信号，
        // 绝不允许改回 unwrap_or 把缺值静默印成 0/空串。
        let weight = view
            .weight
            .expect("fail-closed 校验已保证重量非空，此处不可达");
        let width = view
            .width
            .expect("fail-closed 校验已保证幅宽非空，此处不可达");
        let gram_weight = view
            .gram_weight
            .expect("fail-closed 校验已保证克重非空，此处不可达");
        let barcode = view
            .barcode
            .clone()
            .expect("fail-closed 校验已保证条码非空，此处不可达");

        // Code128 图形：编码内容=上面已校验的 `barcode` 列码值本身（口径：三处写入点
        // 均等于 piece_no，扫码出库按该列查匹；不另造语义、不放行空值——空值已在上文拒打）。
        // 编码器（子集切换+校验位）来自 code128 crate；渲染见 utils::barcode。
        let barcode_image = crate::utils::barcode::render_code128_png(&barcode)?;

        let fmt_dec = |d: rust_decimal::Decimal| d.normalize().to_string();
        let fields: Vec<(&str, serde_json::Value)> = vec![
            (
                "款号",
                serde_json::json!(view.product_code.clone().unwrap_or_default()),
            ),
            (
                "品名",
                serde_json::json!(view.product_name.clone().unwrap_or_default()),
            ),
            ("缸号", serde_json::json!(view.dye_lot_no.clone())),
            ("色号", serde_json::json!(view.color_no.clone())),
            ("批次", serde_json::json!(view.batch_no.clone())),
            ("匹号", serde_json::json!(view.piece_no.clone())),
            ("米数(米)", serde_json::json!(fmt_dec(view.length))),
            ("重量(kg)", serde_json::json!(fmt_dec(weight))),
            ("幅宽(cm)", serde_json::json!(fmt_dec(width))),
            ("克重(g/m²)", serde_json::json!(fmt_dec(gram_weight))),
            (
                "等级",
                serde_json::json!(view.quality_status.clone().unwrap_or_default()),
            ),
            ("条码", serde_json::json!(barcode)),
            (
                "入库时间",
                serde_json::json!(
                    view.warehouse_in_at
                        .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
                        .unwrap_or_default()
                ),
            ),
        ];
        let data: HashMap<String, serde_json::Value> = fields
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect();

        Ok(PrintData {
            template: "inventory_piece_label".to_string(),
            data,
            items: Vec::new(),
            image: Some(barcode_image),
        })
    }


    /// 物料缺料预警打印数据
    async fn get_material_shortage_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::material_shortage;

        let record = material_shortage::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("物料缺料预警 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "alert_no".to_string(),
            serde_json::json!(record.alert_no.clone()),
        );
        data.insert(
            "material_id".to_string(),
            serde_json::json!(record.material_id),
        );
        data.insert(
            "material_name".to_string(),
            serde_json::json!(record.material_name.clone()),
        );
        data.insert(
            "material_code".to_string(),
            serde_json::json!(record.material_code.clone()),
        );
        data.insert(
            "required_quantity".to_string(),
            serde_json::json!(record.required_quantity.to_string()),
        );
        data.insert(
            "available_quantity".to_string(),
            serde_json::json!(record.available_quantity.to_string()),
        );
        data.insert(
            "shortage_quantity".to_string(),
            serde_json::json!(record.shortage_quantity.to_string()),
        );
        data.insert(
            "deficit_rate".to_string(),
            serde_json::json!(record.deficit_rate.to_string()),
        );
        data.insert("level".to_string(), serde_json::json!(record.level.clone()));
        data.insert(
            "status".to_string(),
            serde_json::json!(record.status.clone()),
        );
        data.insert(
            "affected_orders_count".to_string(),
            serde_json::json!(record.affected_orders_count),
        );
        data.insert("unit".to_string(), serde_json::json!(record.unit.clone()));

        Ok(PrintData {
            template: "material_shortage".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }


    /// 不合格品处理单打印数据
    async fn get_unqualified_product_print_data(&self, id: i32) -> Result<PrintData, AppError> {
        use crate::models::unqualified_product;

        let record = unqualified_product::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("不合格品处理单 {} 未找到", id)))?;

        let mut data = HashMap::new();
        data.insert(
            "unqualified_no".to_string(),
            serde_json::json!(record.unqualified_no.clone()),
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
            "unqualified_qty".to_string(),
            serde_json::json!(record.unqualified_qty.to_string()),
        );
        data.insert(
            "unqualified_reason".to_string(),
            serde_json::json!(record.unqualified_reason.clone()),
        );
        data.insert(
            "handling_method".to_string(),
            serde_json::json!(record.handling_method.clone()),
        );
        data.insert(
            "handling_status".to_string(),
            serde_json::json!(record.handling_status.clone()),
        );
        data.insert(
            "grade".to_string(),
            serde_json::json!(record.grade.clone().unwrap_or_default()),
        );
        data.insert(
            "handling_result".to_string(),
            serde_json::json!(record.handling_result.clone().unwrap_or_default()),
        );

        Ok(PrintData {
            template: "unqualified_product".to_string(),
            data,
            items: Vec::new(),
            image: None,
        })
    }

}
