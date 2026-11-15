//! 跨域状态门族一致性契约测（先例形态：contract_wave2_reservation_error_mapping_test.rs）
//!
//! 锁两例 + 一道防回潮源码扫描：
//! 1. 报价单非可转/可操作状态（`ServiceError::InvalidState`）——走 handler 的真实
//!    `From<ServiceError> for AppError` 装配点，断言同归 BUSINESS_ERROR 且文案外显。
//! 2. 反向对照：枚举取值非法（色卡类型白名单）仍必须出 VALIDATION_ERROR，
//!    证明本轮没有把拒绝"一刀切"成 BUSINESS_ERROR。
//! 3. 源码扫描防回潮锁：状态门文案池（各域状态机/审批/取消/删除前置）所在文件里，
//!    状态门文案行附近不得再出现校验族构造器（`validation_displayable(` /
//!    `AppError::validation(` / `AppError::bad_request(`）。
//!
//! 判据（用户拍板）：
//! - 业务状态门（当前状态不允许此操作 / 前置状态未满足 / 已处于某态不可重复动作 / 唯一性冲突）
//!   → `AppError::business_displayable`（HTTP 400 + code=BUSINESS_ERROR + 真实文案）
//! - 输入校验（必填缺失 / 枚举取值非法 / 长度范围精度格式）→ 校验族
//! - 文案含内部记录 ID / 库存余额数字 / 状态 token 时保持脱敏 `business`，不得外显

use bingxi_backend::handlers::color_card::error_map::crud_err;
use bingxi_backend::services::color_card_crud_service::CrudError;
use bingxi_backend::services::quotation_service::ServiceError;
use bingxi_backend::utils::error::AppError;

/// 例 1：报价单状态门（ServiceError::InvalidState）经 handler 真实 From 装配点 → BUSINESS_ERROR
#[test]
fn quotation_state_gate_maps_to_business_error_via_real_from_impl() {
    let err = AppError::from(ServiceError::InvalidState);
    assert_eq!(err.error_code(), "BUSINESS_ERROR");
    assert!(matches!(err, AppError::BusinessErrorDisplayable(_)));
    assert_eq!(err.to_response().message, "当前状态不允许此操作");
}

/// 例 2（反向对照，防一刀切）：枚举取值非法仍必须 VALIDATION_ERROR
#[test]
fn illegal_enum_value_still_maps_to_validation_error() {
    let err = crud_err(CrudError::Validation(
        "无效的色卡类型: PANTONE_X（允许: PANTONE / CNCS / CUSTOM）".to_string(),
    ));
    assert_eq!(
        err.error_code(),
        "VALIDATION_ERROR",
        "提交字段的枚举取值非法属输入校验，族不得被并入 BUSINESS_ERROR"
    );
    assert!(matches!(err, AppError::ValidationErrorDisplayable(_)));
    assert!(err.to_response().message.contains("允许: PANTONE"));
}

/// 例 3（防回潮源码扫描锁）：状态门文案所在构造点不得再挂校验族构造器。
/// 覆盖本轮收口的域文件；命中"状态门语义词"的行，其上文 3 行内不得出现
/// `validation_displayable(` / `AppError::validation(` / `AppError::bad_request(`。
#[test]
fn source_scan_state_gate_messages_never_use_validation_family() {
    let files = [
        "src/services/quotation_ops/lifecycle.rs",
        "src/services/quotation_ops/update.rs",
        "src/services/cost_collection_service.rs",
        "src/services/customer_credit_limit.rs",
        "src/services/crm/customer_transfer_approval_service.rs",
        "src/services/crm/assign.rs",
        "src/services/bpm_ops/instance.rs",
        "src/services/bpm_ops/task.rs",
        "src/services/voucher_ops/workflow.rs",
        "src/services/voucher_ops/crud.rs",
        "src/services/ar_invoice_service.rs",
        "src/services/purchase_contract_service.rs",
        "src/services/sales_contract_service.rs",
        "src/services/fixed_asset_service.rs",
        "src/services/budget_management_service.rs",
    ];
    // 状态门/唯一性冲突语义词（判据口径，不含输入校验词）
    let gate_words = [
        "已处于",
        "不允许此操作",
        "只能",
        "只有",
        "状态不允许",
        "非草稿",
        "流程已结束",
        "尚未完成",
        "已存在",
        "禁止重复",
        "不能重复",
        "无法审批",
        "无法停用",
        "无法删除",
        "无法撤回",
    ];
    let forbidden = [
        "validation_displayable(",
        "AppError::validation(",
        "AppError::bad_request(",
    ];

    for f in files {
        let src = std::fs::read_to_string(f).unwrap_or_else(|e| panic!("读取 {f} 失败：{e}"));
        let lines: Vec<&str> = src.lines().collect();
        for (i, line) in lines.iter().enumerate() {
            let trimmed = line.trim();
            // 注释行不参与判定（本文件的判据说明里就会出现这些词）
            if trimmed.starts_with("//") || trimmed.starts_with("//!") {
                continue;
            }
            if !gate_words.iter().any(|w| trimmed.contains(w)) {
                continue;
            }
            let lo = i.saturating_sub(3);
            let window = lines[lo..=i].join("\n");
            for ctor in forbidden {
                assert!(
                    !window.contains(ctor),
                    "{f}:{} 状态门文案仍挂校验族构造器 {ctor:?}，违反状态门统一口径：{}",
                    i + 1,
                    trimmed
                );
            }
        }
    }
}
