//! DOCX 生成与信头（自 print_service.rs 拆分）

use crate::utils::error::AppError;
use sea_orm::{
    ColumnTrait, DatabaseConnection, EntityTrait, JoinType, LoaderTrait, ModelTrait, Order,
    QueryFilter, QueryOrder, QuerySelect, RelationTrait,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

use super::{PrintData, PrintService};

impl PrintService {
    pub async fn generate_docx(
        &self,
        print_data: &PrintData,
        layout: &crate::utils::docx_export::DocxPageLayout,
    ) -> Result<Vec<u8>, AppError> {
        let title = match print_data.template.as_str() {
            "sales_order" => "销售订单",
            "sales_contract" => "销售合同",
            "purchase_order" => "采购订单",
            "purchase_receipt" => "采购收货单",
            "inventory_transfer" => "库存调拨单",
            "voucher" => "会计凭证",
            "production_flow_card" => "生产流转卡",
            "fabric_inspection" => "验布记录",
            "dye_batch_card" => "染色批次卡",
            "color_card_issue" => "色卡发放单",
            "bulk_color_approval" => "大货色审批单",
            "lab_dip_request" => "打样申请单",
            "production_order" => "生产工单",
            "production_recipe" => "生产配方",
            "quality_inspection_record" => "质检记录",
            "sales_delivery" => "销售发货单",
            "ar_collection" => "应收账款收款单",
            "ap_payment" => "应付账款付款单",
            "ap_invoice" => "应付发票",
            "sales_quotation" => "销售报价单",
            "sales_return" => "销售退货单",
            "purchase_return" => "采购退货单",
            "outsourcing_order" => "委外加工单",
            "outsourcing_receipt" => "委外收货单",
            "logistics_waybill" => "物流运单",
            "certificate_of_origin" => "原产地证明",
            "export_customs_declaration" => "出口报关单",
            "solid_waste_disposal" => "固废处置单",
            "unqualified_product" => "不合格品处理单",
            "chemical_requisition" => "化工料领用单",
            "export_inspection" => "出口检验单",
            "ap_payment_request" => "付款申请单",
            "ap_reconciliation" => "应付对账单",
            "purchase_inspection" => "采购质检单",
            "inventory_adjustment" => "库存调整单",
            "material_shortage" => "物料缺料预警",
            "quality_8d_report" => "8D质量报告",
            "labor_contract" => "劳动合同",
            "wage_record" => "工资记录",
            "energy_consumption_record" => "能耗记录",
            "purchase_contract" => "采购合同",
            "supplier_evaluation_record" => "供应商评价记录",
            "safety_accident_report" => "安全事故报告",
            "occupational_hazard_monitoring" => "职业病危害监测",
            "pollution_permit" => "排污许可证",
            "process_route" => "工艺路线",
            "foreign_exchange_verification" => "外汇核销单",
            "export_refund_declaration" => "出口退税申报单",
            "fixed_asset" => "固定资产卡片",
            "scheduling_result" => "排程结果",
            "inventory_write_down" => "存货跌价准备",
            "fixed_asset_count" => "固定资产盘点单",
            "social_insurance_record" => "社保缴纳记录",
            "occupational_health_exam" => "职业健康体检",
            "dye_batch_rework" => "染色返工单",
            "bad_debt_writeoff" => "坏账核销单",
            "custom_order" => "定制订单",
            "ppe_distribution" => "劳保用品发放记录",
            "customer_credit" => "客户信用额度",
            "after_sales" => "售后服务单",
            "quality_issue" => "质量问题单",
            "ar_reconciliation" => "应收对账单",
            "inventory_piece_label" => "成品布入库标签",
            other => other,
        };

        // 主表键值对：data 是 HashMap，迭代次序不固定，同一单据两次打印会栏次漂移，
        // 渲染前按键排序出稳定次序
        let mut ordered: Vec<(&String, &serde_json::Value)> = print_data.data.iter().collect();
        ordered.sort_unstable_by(|(left, _), (right, _)| left.cmp(right));
        let mut keys = Vec::with_capacity(ordered.len());
        let mut values = Vec::with_capacity(ordered.len());
        for (k, v) in ordered {
            keys.push(k.clone());
            let v_str = match v {
                serde_json::Value::String(s) => s.clone(),
                _ => v.to_string(),
            };
            values.push(v_str);
        }
        let kv = crate::utils::docx_export::DocxKeyValue { keys, values };

        // 明细表头与行：若 items 为空，则不输出明细表；表头次序同主表按列名排序固定
        let detail_headers: Vec<String> = if print_data.items.is_empty() {
            Vec::new()
        } else {
            let mut headers: Vec<String> = print_data
                .items
                .first()
                .map(|first| first.keys().cloned().collect())
                .unwrap_or_default();
            headers.sort();
            headers
        };
        let detail_rows: Vec<Vec<String>> = print_data
            .items
            .iter()
            .map(|row| {
                detail_headers
                    .iter()
                    .map(|h| {
                        row.get(h)
                            .map(|v| match v {
                                serde_json::Value::String(s) => s.clone(),
                                _ => v.to_string(),
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .collect();

        // 条码图仅在模板启用条码时嵌入；关闭时其余正文照常渲染，只是不内嵌该图。
        let image = if layout.barcode_enabled {
            print_data.image.as_ref()
        } else {
            None
        };

        // 页眉 letterhead 单点装配:公司档案缺席/损坏按 AppError 外显，不静默降级为无抬头。
        let letterhead = self.load_letterhead().await?;
        let letterhead_arg = letterhead
            .as_ref()
            .map(|(img, name)| (img.as_ref(), name.as_str()));

        crate::utils::docx_export::build_docx_with_kv_and_image(
            title,
            &kv,
            &detail_headers,
            &detail_rows,
            image,
            layout,
            letterhead_arg,
        )
    }

    /// 从 `company_profile` 单例行装配打印页眉 `(可选 logo DocxImage, 公司名)`。
    ///
    /// - 行缺席:迁移播种行必然存在，缺席即数据完整性事故，点名报错（不回落"无抬头"假绿）。
    /// - `name` 为空且 `logo` 为空:从未配置档案，返回 `None` 不渲染抬头（合法初始态，
    ///   非异常——播种行的空名占位就是"未配置"的真实表达）。
    /// - `logo` 存在:base64+PNG 校验解码（与写入口同一 [`decode_logo_png`] 判据），
    ///     IHDR 取原尺寸并按固定上限宽 120px 等比缩放，坏数据点名报错。
    async fn load_letterhead(
        &self,
    ) -> Result<Option<(Option<crate::utils::docx_export::DocxImage>, String)>, AppError> {
        use crate::services::company_profile_service::{
            COMPANY_PROFILE_ID, LETTERHEAD_LOGO_WIDTH_PX, decode_logo_png, png_dimensions,
        };

        let profile = crate::models::company_profile::Entity::find_by_id(COMPANY_PROFILE_ID)
            .one(&*self.db)
            .await?
            .ok_or_else(|| {
                AppError::internal(
                    "公司档案数据缺失(company_profile 单例行不存在,迁移播种异常或被误删)",
                )
            })?;

        if profile.name.trim().is_empty() && profile.logo.is_none() {
            return Ok(None);
        }

        let logo_img = match profile.logo.as_deref() {
            None => None,
            Some(raw) => {
                let png = decode_logo_png(raw).map_err(|e| {
                    tracing::warn!(error = %e, "打印页眉 logo 解码失败");
                    e
                })?;
                let (w, h) = png_dimensions(&png).ok_or_else(|| {
                    tracing::warn!("打印页眉 logo PNG IHDR 尺寸缺失或非法");
                    AppError::internal("公司档案 logo PNG 缺少合法 IHDR 尺寸头")
                })?;
                let (disp_w, disp_h) = if w > LETTERHEAD_LOGO_WIDTH_PX {
                    let scaled =
                        ((h as u64 * LETTERHEAD_LOGO_WIDTH_PX as u64) / w as u64).max(1) as u32;
                    (LETTERHEAD_LOGO_WIDTH_PX, scaled)
                } else {
                    (w, h)
                };
                Some(crate::utils::docx_export::DocxImage {
                    png,
                    width_px: disp_w,
                    height_px: disp_h,
                })
            }
        };

        Ok(Some((logo_img, profile.name)))
    }
}
