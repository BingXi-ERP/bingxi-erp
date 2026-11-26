//! 产能分析 Service 单元测试

use chrono::NaiveDate;
use rust_decimal::Decimal;

#[test]
fn test_capacity_trend_point_serializes_decimal_quantities_as_strings() {
    let point = bingxi_backend::services::capacity_service::CapacityTrendPoint {
        date: NaiveDate::from_ymd_opt(2026, 11, 27).unwrap(),
        planned_quantity: Decimal::new(1250, 2),
        actual_quantity: Decimal::new(1000, 2),
        capacity_quantity: Decimal::new(50000, 2),
        capacity_unit: Some("米".to_string()),
    };

    let value = serde_json::to_value(point).expect("产能趋势 DTO 应可序列化");
    assert_eq!(value["date"], "2026-11-27");
    assert_eq!(value["planned_quantity"], "12.50");
    assert_eq!(value["actual_quantity"], "10.00");
    assert_eq!(value["capacity_quantity"], "500.00");
    assert_eq!(value["capacity_unit"], "米");
    assert!(value.get("planned_hours").is_none());
}

fn trend_params(
    days: Option<i32>,
    date_from: Option<&str>,
    date_to: Option<&str>,
    work_center_id: Option<i32>,
) -> bingxi_backend::handlers::capacity_handler::CapacityTrendParams {
    bingxi_backend::handlers::capacity_handler::CapacityTrendParams {
        days,
        date_from: date_from.map(str::to_string),
        date_to: date_to.map(str::to_string),
        work_center_id,
    }
}

#[test]
fn test_capacity_trend_query_defaults_to_inclusive_seven_days() {
    let today = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    let query = trend_params(None, None, None, Some(7))
        .into_query(today)
        .expect("默认趋势查询应合法");

    assert_eq!(
        query.date_from,
        Some(NaiveDate::from_ymd_opt(2026, 11, 21).unwrap())
    );
    assert_eq!(query.date_to, Some(today));
    assert_eq!(query.work_center_id, Some(7));
}

#[test]
fn test_capacity_trend_query_explicit_range_overrides_days() {
    let today = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    let query = trend_params(Some(30), Some("2026-11-20"), Some("2026-11-22"), Some(9))
        .into_query(today)
        .expect("显式日期区间应合法");

    assert_eq!(
        query.date_from,
        Some(NaiveDate::from_ymd_opt(2026, 11, 20).unwrap())
    );
    assert_eq!(
        query.date_to,
        Some(NaiveDate::from_ymd_opt(2026, 11, 22).unwrap())
    );
    assert_eq!(query.work_center_id, Some(9));
}

#[test]
fn test_capacity_trend_query_rejects_invalid_days_and_work_center() {
    let today = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    assert!(
        trend_params(Some(0), None, None, Some(1))
            .into_query(today)
            .is_err()
    );
    assert!(
        trend_params(Some(367), None, None, Some(1))
            .into_query(today)
            .is_err()
    );
    assert!(
        trend_params(None, None, None, None)
            .into_query(today)
            .is_err()
    );
}

#[test]
fn test_capacity_trend_query_rejects_malformed_partial_reversed_and_oversized_ranges() {
    let today = NaiveDate::from_ymd_opt(2026, 11, 27).unwrap();
    for (from, to) in [
        (Some("2026-11-20"), None),
        (None, Some("2026-11-20")),
        (Some("2026/11/20"), Some("2026-11-21")),
        (Some("2026-11-21"), Some("2026-11-20")),
        (Some("2025-01-01"), Some("2026-11-27")),
    ] {
        assert!(
            trend_params(None, from, to, Some(1))
                .into_query(today)
                .is_err(),
            "非法日期区间应被拒绝: {from:?}..={to:?}"
        );
    }
}

#[test]
fn test_work_center_capacity_creation() {
    // 测试工作中心产能信息创建
    let wc = bingxi_backend::services::capacity_service::WorkCenterCapacity {
        id: 1,
        code: "WC-001".to_string(),
        name: "染色车间".to_string(),
        work_center_type: Some("STANDARD".to_string()),
        daily_capacity: Decimal::from(100),
        capacity_unit: Some("米".to_string()),
        status: "ACTIVE".to_string(),
        shifts: vec![],
    };

    assert_eq!(wc.id, 1);
    assert_eq!(wc.code, "WC-001");
    assert_eq!(wc.daily_capacity, Decimal::from(100));
}

#[test]
fn test_shift_info_creation() {
    // 测试班次信息创建
    let shift = bingxi_backend::services::capacity_service::ShiftInfo {
        shift_name: "白班".to_string(),
        start_time: "08:00".to_string(),
        end_time: "17:00".to_string(),
        capacity_ratio: Decimal::from(100),
    };

    assert_eq!(shift.shift_name, "白班");
    assert_eq!(shift.capacity_ratio, Decimal::from(100));
}

#[test]
fn test_capacity_load_item_creation() {
    // 测试产能负荷项创建
    let item = bingxi_backend::services::capacity_service::CapacityLoadItem {
        work_center_id: 1,
        work_center_code: "WC-001".to_string(),
        work_center_name: "染色车间".to_string(),
        daily_capacity: Decimal::from(100),
        capacity_unit: Some("米".to_string()),
        planned_quantity: Decimal::from(80),
        in_progress_quantity: Decimal::from(20),
        total_demand: Decimal::from(100),
        load_rate: Decimal::from(100),
        status: "NORMAL".to_string(),
        gap_quantity: Decimal::ZERO,
        suggestions: Vec::new(),
    };

    assert_eq!(item.load_rate, Decimal::from(100));
    assert_eq!(item.status, "NORMAL");
}

#[test]
fn test_capacity_overview_creation() {
    // 测试产能概览创建
    let overview = bingxi_backend::services::capacity_service::CapacityOverview {
        total_work_centers: 5,
        active_work_centers: 4,
        total_daily_capacity: Decimal::from(500),
        total_planned_demand: Decimal::from(400),
        overall_load_rate: Decimal::from(80),
        bottleneck_work_centers: vec![],
        overloaded_count: 1,
        idle_count: 0,
    };

    assert_eq!(overview.total_work_centers, 5);
    assert_eq!(overview.overall_load_rate, Decimal::from(80));
}

#[test]
fn test_load_analysis_query_creation() {
    // 测试负荷分析查询参数创建
    let query = bingxi_backend::services::capacity_service::LoadAnalysisQuery {
        date_from: Some(NaiveDate::from_ymd_opt(2026, 5, 20).unwrap()),
        date_to: Some(NaiveDate::from_ymd_opt(2026, 5, 25).unwrap()),
        work_center_id: Some(1),
    };

    assert!(query.date_from.is_some());
    assert!(query.date_to.is_some());
    assert_eq!(query.work_center_id.unwrap(), 1);
}
