//! 凭证生成失败死信补偿回归测试
//!
//! 场景：单据主流程已 commit、凭证 create_and_post 失败时，补偿登记必须把
//! 可重放的凭证来源四要素落进 event_dead_letters（status=DEAD），
//! 总账缺凭证不能再只靠滚动日志发现。

use bingxi_backend::models::event_dead_letter;
use bingxi_backend::services::event_retry_service::EventRetryService;
use bingxi_backend::services::test_common::setup_test_db;
use bingxi_backend::services::voucher_service::{
    CreateVoucherRequest, VoucherItemRequest, VoucherService,
};
use rust_decimal::Decimal;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use std::sync::Arc;

#[tokio::test]
async fn 凭证生成失败落死信补偿记录() {
    let db = Arc::new(setup_test_db().await);

    // 模拟凭证生成失败：分录引用库里不存在的科目（借贷平衡，失败发生在科目存在性校验）
    let unknown_subject = "ZZZ_DEADLETTER_NOT_EXIST";
    let req = CreateVoucherRequest {
        voucher_type: "转".to_string(),
        voucher_date: chrono::Utc::now().date_naive(),
        source_type: Some("TEST_SOURCE".to_string()),
        source_module: Some("test".to_string()),
        source_bill_id: Some(42),
        source_bill_no: Some("TEST-VOUCHER-001".to_string()),
        batch_no: None,
        color_no: None,
        items: vec![
            VoucherItemRequest {
                line_no: Some(1),
                subject_id: None,
                subject_code: Some(unknown_subject.to_string()),
                subject_name: Some("测试用不存在科目-借".to_string()),
                debit: Decimal::from(100),
                credit: Decimal::from(0),
                summary: None,
                assist_customer_id: None,
                assist_supplier_id: None,
                assist_department_id: None,
                assist_employee_id: None,
                assist_project_id: None,
                assist_batch_id: None,
                assist_color_no_id: None,
                assist_dye_lot_id: None,
                assist_grade: None,
                assist_workshop_id: None,
                quantity_meters: None,
                quantity_kg: None,
                unit_price: None,
            },
            VoucherItemRequest {
                line_no: Some(2),
                subject_id: None,
                subject_code: Some(unknown_subject.to_string()),
                subject_name: Some("测试用不存在科目-贷".to_string()),
                debit: Decimal::from(0),
                credit: Decimal::from(100),
                summary: None,
                assist_customer_id: None,
                assist_supplier_id: None,
                assist_department_id: None,
                assist_employee_id: None,
                assist_project_id: None,
                assist_batch_id: None,
                assist_color_no_id: None,
                assist_dye_lot_id: None,
                assist_grade: None,
                assist_workshop_id: None,
                quantity_meters: None,
                quantity_kg: None,
                unit_price: None,
            },
        ],
    };
    let err = VoucherService::new(db.clone())
        .create_and_post(req, 1)
        .await
        .expect_err("引用不存在科目的凭证请求必须失败");

    EventRetryService::record_voucher_generation_failure(
        db.clone(),
        "test",
        "TEST_SOURCE",
        42,
        "TEST-VOUCHER-001",
        &err,
    )
    .await;

    let rows = event_dead_letter::Entity::find()
        .filter(event_dead_letter::Column::EventType.eq("VoucherGenerationFailed"))
        .all(&*db)
        .await
        .expect("死信表查询失败");
    assert_eq!(rows.len(), 1, "凭证生成失败必须恰好落一条死信补偿记录");
    let row = &rows[0];
    assert_eq!(row.status, "DEAD");
    assert_eq!(row.event_payload["source_module"], "test");
    assert_eq!(row.event_payload["source_type"], "TEST_SOURCE");
    assert_eq!(row.event_payload["source_bill_id"], 42);
    assert_eq!(row.event_payload["source_bill_no"], "TEST-VOUCHER-001");
    assert!(
        !row.failure_reason.is_empty(),
        "失败原因摘要必须留痕，补偿任务据此判责重放"
    );
}
