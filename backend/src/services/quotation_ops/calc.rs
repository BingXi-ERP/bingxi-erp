//! 报价单计算与校验 impl 子模块（quotation_ops/calc）
//!
//! D11 拆分：从原 `quotation_service.rs` 迁移计算与校验相关方法。
//! 包含 calculate_totals（金额计算）/ validate_create（业务校验）/ validate_price_terms（贸易术语校验）。

use rust_decimal::Decimal;

use crate::models::quotation_create_dto::{CreateQuotationDto, CreateQuotationItemDto};
use crate::services::quotation_service::{QuotationService, ServiceError};

/// 报价金额链统一的两位小数舍入口径（R-596 裁定：货币金额四舍五入离零进位，
/// 与人民银行会计口径一致；行腿与表头同源共用，杜绝两处各自舍入造成分差）
pub(crate) fn round_money(value: Decimal) -> Decimal {
    value.round_dp_with_strategy(2, rust_decimal::RoundingStrategy::MidpointAwayFromZero)
}

/// 报价明细数量刻度门（R-598 裁定）：数量列 DECIMAL(18,2)，超两位小数显式拒绝，
/// 不接受数据库静默舍入；create 与 update 两腿共用，保证入参与落库逐字一致。
pub(crate) fn validate_items_quantity_scale(
    items: &[CreateQuotationItemDto],
) -> Result<(), ServiceError> {
    for (idx, item) in items.iter().enumerate() {
        if item.quantity.scale() > 2 {
            return Err(ServiceError::Validation(format!(
                "报价明细第 {} 行数量最多支持 2 位小数，当前为 {}",
                idx + 1,
                item.quantity
            )));
        }
    }
    Ok(())
}

impl QuotationService {
    /// 计算小计/税额/总金额
    ///
    /// 调用方：quotation_ops/crud.rs 的 create_draft，结果写入 sales_quotations 的
    /// subtotal / tax_amount / total_amount 三列。
    /// 入参：CreateQuotationDto，消费其 items（数量、净单价、含税单价）、tax_inclusive、tax_rate。
    /// 含税态：含税总额是行腿录入事实（数量乘含税单价）的聚合，税额取含税总额减净额小计
    /// 的差额，保证单头三键与报价明细无分差；表达式与行腿落库口径同源。
    /// 不含税态：维持小计乘税率加计的既有口径。
    pub fn calculate_totals(
        &self,
        dto: &CreateQuotationDto,
    ) -> Result<(Decimal, Decimal, Decimal), ServiceError> {
        // 金额聚合按 round_money 精度归一化，与行腿落库口径一致
        let subtotal: Decimal = dto
            .items
            .iter()
            .map(|i: &CreateQuotationItemDto| round_money(i.quantity * i.unit_price))
            .sum::<Decimal>();
        let subtotal = round_money(subtotal);

        let (tax_amount, total_amount) = if dto.tax_inclusive {
            // 含税：总额聚合行腿含税事实，税额取差额，不用乘法造含税
            let total_with_tax: Decimal = dto
                .items
                .iter()
                .map(|i: &CreateQuotationItemDto| round_money(i.quantity * i.unit_price_with_tax))
                .sum::<Decimal>();
            let total_with_tax = round_money(total_with_tax);
            (round_money(total_with_tax - subtotal), total_with_tax)
        } else {
            // 不含税：税额 = 小计 * 税率，总额 = 小计 + 税额
            let tax = round_money(subtotal * dto.tax_rate / Decimal::from(100));
            (tax, round_money(subtotal + tax))
        };

        Ok((subtotal, tax_amount, total_amount))
    }

    /// 业务校验
    pub fn validate_create(&self, dto: &CreateQuotationDto) -> Result<(), ServiceError> {
        validate_items_quantity_scale(&dto.items)?;
        if dto.items.is_empty() {
            return Err(ServiceError::Validation("明细至少 1 条".to_string()));
        }
        if dto.valid_until < dto.quotation_date {
            return Err(ServiceError::Validation(
                "有效期截止必须不早于报价日期".to_string(),
            ));
        }
        // 批次 111 P1-2：接入 utils/incoterms.rs，用 Incoterms2020::from_code 解析+校验并记录业务元数据
        let incoterm = Self::validate_price_terms(&dto.price_terms)?;
        tracing::info!(
            incoterm_code = %dto.price_terms,
            incoterm_description = %incoterm.description(),
            includes_insurance = %incoterm.includes_insurance(),
            includes_freight = %incoterm.includes_freight(),
            requires_duty_paid = %incoterm.requires_duty_paid(),
            "报价单贸易术语已校验"
        );
        Ok(())
    }

    /// 校验价格条款（贸易术语）并返回解析后的 Incoterms2020 枚举
    /// 批次 111 P1-2：接入 utils/incoterms.rs，用 all()+code() 派生合法代码列表
    pub fn validate_price_terms(
        code: &str,
    ) -> Result<crate::utils::incoterms::Incoterms2020, ServiceError> {
        crate::utils::incoterms::Incoterms2020::from_code(code).map_err(|msg| {
            // 派生合法代码列表用于错误提示（同时使用 all() + code() 接入业务）
            let valid: Vec<&'static str> = crate::utils::incoterms::Incoterms2020::all()
                .iter()
                .map(|t| t.code())
                .collect();
            ServiceError::Validation(format!("{}（合法取值: {}）", msg, valid.join("/")))
        })
    }
}
