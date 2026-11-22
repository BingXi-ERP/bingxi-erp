//! 通道：夹具经 `test_common::setup_test_db()` 连已迁移
//! PostgreSQL，表结构唯一来源 = `backend/migration`；缺 `TEST_DATABASE_URL` 或指向
//! sqlite 时夹具直接 panic——不存在静默回退 sqlite::memory: 的分支，
//! 因为"没连上真库也算通过"属假绿。
//! 本文件用例锁的是"非法参数在触库前必须被拒"，因此断言与后端方言无关，
//! 但在真库通道上跑才有意义：若未来有人把校验挪到 SQL 之后，用例会显式变红。
mod test_common;

use bingxi_backend::database::*;
use bingxi_backend::handlers::bi_handler::*;
use bingxi_backend::services::bi_analysis_service::*;
use bingxi_backend::utils::error::AppError;
use chrono::NaiveDate;
use std::sync::Arc;

/// 测试辅助：构造连到测试库的 service 实例（参数校验测试仅调用 DB 查询前的校验路径）。
///
/// 连接经 `test_common::setup_test_db()`：失败或环境缺失即 panic，断言无条件执行，
/// 不做"连不上就跳过"的 Option 守卫——那是"没跑也算 PASS"的假绿形态。
async fn make_service() -> BiAnalysisService {
    let db = test_common::setup_test_db().await;
    BiAnalysisService::new(Arc::new(db))
}

#[tokio::test]
async fn test_drilldown_invalid_year() {
    let service = make_service().await;
    let result = service.drilldown_year_to_month(1800).await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "年份无效"),
        "年份 1800 越界必须被年份范围门拒绝（bi_analysis_ops/drilldown.rs:37）"
    );
}

#[tokio::test]
async fn test_slice_invalid_dimension() {
    let service = make_service().await;
    let result = service.slice("invalid_dim", &serde_json::json!({})).await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "不支持的维度: invalid_dim"),
        "非法切片维度必须被维度白名单拒绝（bi_analysis_ops/olap.rs:37）"
    );
}

#[tokio::test]
async fn test_sales_by_time_invalid_dates() {
    let service = make_service().await;
    let result = service
        .sales_by_time(
            chrono::NaiveDate::from_ymd_opt(2026, 12, 31).unwrap(),
            chrono::NaiveDate::from_ymd_opt(2026, 1, 1).unwrap(),
            "month",
        )
        .await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "结束日期不能早于开始日期"),
        "起止日期倒置必须被日期校验拒绝（bi_analysis_ops/sales.rs:39）"
    );
}

#[tokio::test]
async fn test_drilldown_invalid_month() {
    let service = make_service().await;
    let result = service.drilldown_month_to_day(2026, 13).await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "月份无效"),
        "月份 13 越界必须被月份范围门拒绝（bi_analysis_ops/drilldown.rs:128）"
    );
}

#[tokio::test]
async fn test_drilldown_customer_invalid_id() {
    let service = make_service().await;
    let result = service.drilldown_customer_to_order(0).await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "客户 ID 无效"),
        "客户 ID 0 必须被 ID 正数门拒绝（bi_analysis_ops/drilldown.rs:244）"
    );
}

#[tokio::test]
async fn test_drilldown_product_invalid_id() {
    let service = make_service().await;
    let result = service.drilldown_product_to_order(-1).await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "产品 ID 无效"),
        "产品 ID -1 必须被 ID 正数门拒绝（bi_analysis_ops/drilldown.rs:302）"
    );
}

#[tokio::test]
async fn test_rollup_invalid_level() {
    let service = make_service().await;
    let result = service.rollup("invalid", "month").await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "无效的粒度级别"),
        "非法上卷粒度必须被粒度白名单拒绝（bi_analysis_ops/olap.rs:98）"
    );
}

/// 透视矩阵参数校验测试
#[tokio::test]
async fn test_pivot_invalid_row_dim() {
    let service = make_service().await;
    let result = service.pivot("invalid", "customer", "total_amount").await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "不支持的行维度: invalid"),
        "非法行维度必须被行维度白名单拒绝（bi_analysis_ops/olap.rs:120）"
    );
}

#[tokio::test]
async fn test_pivot_invalid_col_dim() {
    let service = make_service().await;
    let result = service.pivot("customer", "invalid", "total_amount").await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "不支持的列维度: invalid"),
        "非法列维度必须被列维度白名单拒绝（bi_analysis_ops/olap.rs:126）"
    );
}

#[tokio::test]
async fn test_pivot_same_dim() {
    let service = make_service().await;
    let result = service.pivot("customer", "customer", "total_amount").await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "行维度与列维度不能相同"),
        "行列维度相同必须被去重门拒绝（bi_analysis_ops/olap.rs:132）"
    );
}

#[tokio::test]
async fn test_pivot_invalid_measure() {
    let service = make_service().await;
    let result = service
        .pivot("customer", "product", "invalid_measure")
        .await;
    assert!(result.is_err());
    assert!(
        matches!(result.unwrap_err(), AppError::ValidationErrorDisplayable(ref m) if m == "不支持的度量: invalid_measure"),
        "非法度量必须被度量白名单拒绝（bi_analysis_ops/olap.rs:137）"
    );
}

// ==================== dim_to_expr / measure_to_expr 单元测试 ====================
// 锁非法维度/度量入参返回错误而非 panic 崩溃

/// 测试 dim_to_expr 对所有合法维度返回 Ok
#[test]
fn test_dim_to_expr_valid_dims() {
    let valid_dims = ["customer", "product", "region", "category", "time"];
    for dim in valid_dims {
        assert!(dim_to_expr(dim).is_ok(), "维度 {} 应返回 Ok", dim);
    }
}

/// 测试 dim_to_expr 对非法维度返回 Err（原 unreachable!() 会 panic）
#[test]
fn test_dim_to_expr_invalid_dim_returns_error() {
    let result = dim_to_expr("invalid_dim");
    assert!(result.is_err(), "非法维度应返回错误而非 panic");
}

/// 测试 dim_to_expr 对空字符串返回 Err
#[test]
fn test_dim_to_expr_empty_string_returns_error() {
    let result = dim_to_expr("");
    assert!(result.is_err(), "空字符串维度应返回错误而非 panic");
}

/// 测试 measure_to_expr 对所有合法度量在项级和订单级均返回 Ok
#[test]
fn test_measure_to_expr_valid_measures() {
    let valid_measures = ["total_amount", "order_count", "quantity", "profit_amount"];
    for measure in valid_measures {
        assert!(
            measure_to_expr(measure, true).is_ok(),
            "度量 {} 项级聚合应返回 Ok",
            measure
        );
        assert!(
            measure_to_expr(measure, false).is_ok(),
            "度量 {} 订单级聚合应返回 Ok",
            measure
        );
    }
}

/// 测试 measure_to_expr 对非法度量返回 Err（原 unreachable!() 会 panic）
#[test]
fn test_measure_to_expr_invalid_measure_returns_error() {
    assert!(
        measure_to_expr("invalid_measure", true).is_err(),
        "非法度量项级聚合应返回错误而非 panic"
    );
    assert!(
        measure_to_expr("invalid_measure", false).is_err(),
        "非法度量订单级聚合应返回错误而非 panic"
    );
}
