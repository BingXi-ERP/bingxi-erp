use bingxi_backend::models::{production_order, work_center};
use bingxi_backend::services::capacity_service::CapacityService;
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;

/// 无历史数据时置信度应较低
#[test]
fn test_confidence_no_history() {
    let confidence = CapacityService::calculate_forecast_confidence(0, 30, true);
    // 基础 0.30 + 当前负荷 0.05 = 0.35，期限因子 0.92 → 0.322
    assert!(
        confidence < 0.40,
        "无历史数据置信度应低于 0.40，实际: {}",
        confidence
    );
}

/// 历史数据丰富且短期预测时置信度应较高
#[test]
fn test_confidence_rich_history_short_horizon() {
    let confidence = CapacityService::calculate_forecast_confidence(100, 7, true);
    // 基础 0.85 + 当前负荷 0.05 = 0.90，期限因子 1.00 → 0.90
    assert!(
        confidence >= 0.85,
        "丰富历史+短期预测置信度应 >= 0.85，实际: {}",
        confidence
    );
}

/// 长期预测置信度应低于短期预测
#[test]
fn test_confidence_long_horizon_lower() {
    let short_confidence = CapacityService::calculate_forecast_confidence(30, 7, true);
    let long_confidence = CapacityService::calculate_forecast_confidence(30, 365, true);
    assert!(
        long_confidence < short_confidence,
        "长期预测置信度 ({}) 应低于短期 ({})",
        long_confidence,
        short_confidence
    );
}

/// 有当前负荷数据时置信度应高于无负荷数据
#[test]
fn test_confidence_current_load_bonus() {
    let with_load = CapacityService::calculate_forecast_confidence(10, 30, true);
    let without_load = CapacityService::calculate_forecast_confidence(10, 30, false);
    assert!(
        with_load > without_load,
        "有当前负荷数据置信度 ({}) 应高于无负荷 ({})",
        with_load,
        without_load
    );
}

/// 置信度应始终在 [0.10, 0.95] 区间内
#[test]
fn test_confidence_within_bounds() {
    // 最差情况：无历史 + 无负荷 + 超长期
    let min_confidence = CapacityService::calculate_forecast_confidence(0, 365, false);
    assert!(
        min_confidence >= 0.10,
        "置信度下限应 >= 0.10，实际: {}",
        min_confidence
    );

    // 最好情况：丰富历史 + 有负荷 + 短期
    let max_confidence = CapacityService::calculate_forecast_confidence(1000, 1, true);
    assert!(
        max_confidence <= 0.95,
        "置信度上限应 <= 0.95，实际: {}",
        max_confidence
    );
}

fn trend_work_center(daily_capacity: Option<Decimal>) -> work_center::Model {
    let now = Utc::now();
    work_center::Model {
        id: 1,
        code: "WC-TREND-UNIT".to_string(),
        name: "趋势单元测试工作中心".to_string(),
        work_center_type: Some("weaving".to_string()),
        daily_capacity,
        capacity_unit: Some("米".to_string()),
        status: "ACTIVE".to_string(),
        remarks: None,
        created_at: now,
        updated_at: now,
        standard_hours_per_unit: None,
        equipment_count: Some(1),
        worker_count: Some(1),
        shift_hours: Some(Decimal::from(8)),
        auto_reschedule_enabled: true,
    }
}

fn trend_order(
    id: i32,
    status: &str,
    planned_quantity: i64,
    planned_start_date: Option<NaiveDate>,
    actual_quantity: Option<i64>,
    actual_end_date: Option<NaiveDate>,
) -> production_order::Model {
    let now = Utc::now();
    production_order::Model {
        id,
        order_no: format!("PO-TREND-UNIT-{id}"),
        sales_order_id: None,
        product_id: 1,
        planned_quantity: Decimal::from(planned_quantity),
        actual_quantity: actual_quantity.map(Decimal::from),
        planned_start_date,
        planned_end_date: planned_start_date,
        actual_start_date: None,
        actual_end_date,
        status: status.to_string(),
        priority: 5,
        work_center_id: Some(1),
        remarks: None,
        color_no: String::new(),
        dye_lot_no: String::new(),
        batch_no: String::new(),
        order_type: "normal".to_string(),
        original_batch_id: None,
        schedule_batch_key: None,
        created_by: 1,
        created_at: now,
        updated_at: now,
    }
}

#[test]
fn test_capacity_trend_aggregates_real_quantities_and_fills_each_day() {
    let day1 = NaiveDate::from_ymd_opt(2026, 11, 25).unwrap();
    let day2 = NaiveDate::from_ymd_opt(2026, 11, 26).unwrap();
    let day3 = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    let planned = vec![
        trend_order(1, "APPROVED", 10, Some(day1), None, None),
        trend_order(2, "SCHEDULED", 20, Some(day2), None, None),
        trend_order(3, "IN_PROGRESS", 30, Some(day3), Some(15), None),
        trend_order(4, "COMPLETED", 40, Some(day2), Some(35), Some(day3)),
        trend_order(5, "DRAFT", 999, Some(day2), None, None),
        trend_order(6, "CANCELLED", 999, Some(day2), None, None),
        trend_order(
            7,
            "SCHEDULED",
            999,
            Some(NaiveDate::from_ymd_opt(2026, 11, 24).unwrap()),
            None,
            None,
        ),
    ];
    let actual = vec![
        trend_order(4, "COMPLETED", 40, Some(day2), Some(35), Some(day3)),
        trend_order(8, "COMPLETED", 20, Some(day1), None, Some(day3)),
        trend_order(9, "IN_PROGRESS", 20, Some(day1), Some(999), Some(day3)),
    ];

    let points = CapacityService::aggregate_capacity_trend(
        &trend_work_center(Some(Decimal::from(100))),
        &planned,
        &actual,
        day1,
        day3,
    )
    .expect("真实数量趋势聚合应成功");

    assert_eq!(points.len(), 3);
    assert_eq!(points[0].date, day1);
    assert_eq!(points[0].planned_quantity, Decimal::from(10));
    assert_eq!(points[0].actual_quantity, Decimal::ZERO);
    assert_eq!(points[1].planned_quantity, Decimal::from(60));
    assert_eq!(points[1].actual_quantity, Decimal::ZERO);
    assert_eq!(points[2].planned_quantity, Decimal::from(30));
    assert_eq!(points[2].actual_quantity, Decimal::from(35));
    for point in points {
        assert_eq!(point.capacity_quantity, Decimal::from(100));
        assert_eq!(point.capacity_unit.as_deref(), Some("米"));
    }
}

#[test]
fn test_capacity_trend_rejects_missing_negative_capacity_and_invalid_range() {
    let day = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    assert!(
        CapacityService::aggregate_capacity_trend(&trend_work_center(None), &[], &[], day, day,)
            .is_err(),
        "缺少日产能时不得伪造为零"
    );
    assert!(
        CapacityService::aggregate_capacity_trend(
            &trend_work_center(Some(Decimal::from(-1))),
            &[],
            &[],
            day,
            day,
        )
        .is_err(),
        "负日产能必须显式拒绝"
    );
    assert!(
        CapacityService::aggregate_capacity_trend(
            &trend_work_center(Some(Decimal::from(100))),
            &[],
            &[],
            day,
            day - chrono::Duration::days(1),
        )
        .is_err(),
        "倒序日期区间必须显式拒绝"
    );
    assert!(
        CapacityService::aggregate_capacity_trend(
            &trend_work_center(Some(Decimal::from(100))),
            &[],
            &[],
            day - chrono::Duration::days(366),
            day,
        )
        .is_err(),
        "超过 366 天的区间必须显式拒绝"
    );
}
