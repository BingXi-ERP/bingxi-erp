mod test_common;

use std::sync::Arc;

use bingxi_backend::models::{product, production_order, user};
use bingxi_backend::services::capacity_service::{
    CapacityService, CapacityTrendQuery, CreateWorkCenterInput,
};
use bingxi_backend::services::test_common::setup_test_db;
use chrono::{Duration, Utc};
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, EntityTrait, Set};

async fn seed_order(
    db: &sea_orm::DatabaseConnection,
    id: i32,
    product_id: i32,
    work_center_id: i32,
    created_by: i32,
    status: &str,
    planned_quantity: i64,
    planned_start_date: Option<chrono::NaiveDate>,
    actual_quantity: Option<i64>,
    actual_end_date: Option<chrono::NaiveDate>,
) {
    let now = Utc::now();
    production_order::ActiveModel {
        id: Set(id),
        order_no: Set(format!("PO-CAPACITY-TREND-{id}")),
        product_id: Set(product_id),
        planned_quantity: Set(Decimal::from(planned_quantity)),
        actual_quantity: Set(actual_quantity.map(Decimal::from)),
        planned_start_date: Set(planned_start_date),
        planned_end_date: Set(planned_start_date),
        actual_end_date: Set(actual_end_date),
        status: Set(status.to_string()),
        priority: Set(5),
        work_center_id: Set(Some(work_center_id)),
        color_no: Set(String::new()),
        dye_lot_no: Set(String::new()),
        batch_no: Set(String::new()),
        order_type: Set("normal".to_string()),
        created_by: Set(created_by),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("趋势测试生产订单写入失败");
}

#[tokio::test]
async fn capacity_trend_returns_real_daily_quantity_series_from_postgres() {
    let db = Arc::new(setup_test_db().await);
    let now = Utc::now();
    user::ActiveModel {
        id: Set(23101),
        username: Set(format!(
            "capacity-trend-{}",
            now.timestamp_nanos_opt().unwrap()
        )),
        password_hash: Set("test-only-not-a-real-hash".to_string()),
        real_name: Set(Some("产能趋势回归操作人".to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&*db)
    .await
    .expect("趋势测试操作人插入失败");

    let product_id = product::ActiveModel {
        name: Set("产能趋势测试产品".to_string()),
        code: Set(format!("PRD-TREND-{}", now.timestamp_nanos_opt().unwrap())),
        unit: Set("米".to_string()),
        status: Set("active".to_string()),
        is_deleted: Set(false),
        product_type: Set("fabric".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&*db)
    .await
    .expect("趋势测试产品插入失败")
    .id;

    let service = CapacityService::without_notification(db.clone());
    let work_center = service
        .create_work_center(CreateWorkCenterInput {
            code: Some(format!("WC-TREND-{}", now.timestamp())),
            name: "产能趋势测试工作中心".to_string(),
            work_center_type: Some("weaving".to_string()),
            daily_capacity: Some(Decimal::from(100)),
            capacity_unit: Some("米".to_string()),
            status: Some("ACTIVE".to_string()),
            remarks: None,
        })
        .await
        .expect("创建工作中心失败");

    let today = Utc::now().date_naive();
    let day1 = today - Duration::days(2);
    let day2 = today - Duration::days(1);
    for (id, status, planned, start, actual, actual_end) in [
        (1, "APPROVED", 10, Some(day1), None, None),
        (2, "SCHEDULED", 20, Some(day2), None, None),
        (3, "IN_PROGRESS", 30, Some(today), Some(15), None),
        (4, "COMPLETED", 40, Some(day2), Some(35), Some(today)),
        (5, "COMPLETED", 10, Some(today), None, Some(today)),
        (6, "DRAFT", 999, Some(today), None, None),
        (7, "CANCELLED", 999, Some(today), None, None),
    ] {
        seed_order(
            &db,
            id,
            product_id,
            work_center.id,
            23101,
            status,
            planned,
            start,
            actual,
            actual_end,
        )
        .await;
    }

    let points = service
        .trend(CapacityTrendQuery {
            date_from: Some(day1),
            date_to: Some(today),
            work_center_id: Some(work_center.id),
        })
        .await
        .expect("查询产能趋势失败");

    assert_eq!(points.len(), 3);
    assert_eq!(points[0].date, day1);
    assert_eq!(points[0].planned_quantity, Decimal::from(10));
    assert_eq!(points[0].actual_quantity, Decimal::ZERO);
    assert_eq!(points[1].date, day2);
    assert_eq!(points[1].planned_quantity, Decimal::from(60));
    assert_eq!(points[1].actual_quantity, Decimal::ZERO);
    assert_eq!(points[2].date, today);
    assert_eq!(points[2].planned_quantity, Decimal::from(40));
    assert_eq!(points[2].actual_quantity, Decimal::from(35));
    for point in points {
        assert_eq!(point.capacity_quantity, Decimal::from(100));
        assert_eq!(point.capacity_unit.as_deref(), Some("米"));
    }

    assert!(
        service
            .trend(CapacityTrendQuery {
                date_from: Some(day1),
                date_to: Some(today),
                work_center_id: Some(i32::MAX),
            })
            .await
            .is_err()
    );

    let mut missing_capacity: bingxi_backend::models::work_center::ActiveModel =
        bingxi_backend::models::work_center::Entity::find_by_id(work_center.id)
            .one(&*db)
            .await
            .expect("回读工作中心失败")
            .expect("工作中心应存在")
            .into();
    missing_capacity.daily_capacity = Set(None);
    missing_capacity.update(&*db).await.expect("清空日产能失败");
    assert!(
        service
            .trend(CapacityTrendQuery {
                date_from: Some(day1),
                date_to: Some(today),
                work_center_id: Some(work_center.id),
            })
            .await
            .is_err()
    );
}
