//! 调样单 CRUD 集成测试（真实 PostgreSQL，TEST_DATABASE_URL 门控）
//!
//! 覆盖：后端取号格式（BX-DY 年月号段）、明细金额后端计算、查重白名单登记、
//! 列表分页筛选、更新整单替换明细、删除后不可再读。
//! 夹具契约见 `services/test_common.rs`：TEST_DATABASE_URL 缺失直接 panic，
//! 不静默降级 sqlite（假绿禁形）。

use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use rust_decimal_macros::dec;
use sea_orm::{ActiveModelTrait, Set};

use bingxi_backend::models::customer;
use bingxi_backend::models::product;
use bingxi_backend::models::status::master_data;
use bingxi_backend::services::sample_dispatch_service::{
    CreateSampleDispatchItem, CreateSampleDispatchRequest, SampleDispatchQuery,
    SampleDispatchService, UpdateSampleDispatchRequest,
};
use bingxi_backend::services::test_common::setup_test_db;
use bingxi_backend::utils::number_generator::is_document_no_taken;

/// 自建客户行（归属门与 customer_name 断言的参照；字段装配照既有集成测试种子范式）
async fn seed_customer(db: &sea_orm::DatabaseConnection, name: &str) -> i32 {
    let now = Utc::now();
    let m = customer::ActiveModel {
        customer_code: Set(format!("E2E-DY-{}", unique_suffix())),
        customer_name: Set(name.to_string()),
        credit_limit: Set(Decimal::ZERO),
        payment_terms: Set(30),
        status: Set(master_data::ACTIVE.to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    m.insert(db)
        .await
        .unwrap_or_else(|e| panic!("种子客户 {name} 插入失败 {e}"))
        .id
}

/// 自建产品行
async fn seed_product(db: &sea_orm::DatabaseConnection, name: &str) -> i32 {
    let now = Utc::now();
    let m = product::ActiveModel {
        code: Set(format!("E2E-DYP-{}", unique_suffix())),
        name: Set(name.to_string()),
        unit: Set("米".to_string()),
        status: Set(master_data::ACTIVE.to_string()),
        product_type: Set("fabric".to_string()),
        is_deleted: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    m.insert(db)
        .await
        .unwrap_or_else(|e| panic!("种子产品 {name} 插入失败 {e}"))
        .id
}

/// 简单唯一后缀（毫秒时间戳，杜绝同批用例间的编码冲突）
fn unique_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn create_request(customer_id: i32, product_id: i32) -> CreateSampleDispatchRequest {
    CreateSampleDispatchRequest {
        customer_id,
        department: "测试事业部".to_string(),
        dispatch_date: NaiveDate::from_ymd_opt(2026, 7, 15).expect("日期合法"),
        opening_balance: dec!(100.00),
        total_amount: dec!(26.25),
        total_collections: dec!(5.00),
        closing_balance: dec!(121.25),
        remarks: Some("集成测试单".to_string()),
        items: vec![CreateSampleDispatchItem {
            product_id,
            dye_lot_no: "G1".to_string(),
            color_no: "大红".to_string(),
            composition: "天丝麻".to_string(),
            quantity_meters: dec!(10.5),
            unit_price: dec!(2.5),
            remarks: None,
            sort_order: None,
        }],
    }
}

/// 创建：单号 BX-DY 年月格式 + 明细金额后端计算 + 客户真名回显
#[tokio::test]
async fn create_generates_ym_no_and_computes_item_amount() {
    let db = std::sync::Arc::new(setup_test_db().await);
    let customer_id = seed_customer(&db, "调样集成客户").await;
    let product_id = seed_product(&db, "调样集成品").await;
    let service = SampleDispatchService::new(db.clone());
    let detail = service
        .create(create_request(customer_id, product_id), 1)
        .await
        .expect("创建调样单应成功");
    let no = &detail.order.document_no;
    assert!(
        no.starts_with("BX-DY")
            && no.len() == 13
            && no.as_bytes()[9] == b'-'
            && no[5..9].bytes().all(|b| b.is_ascii_digit())
            && no[10..13].bytes().all(|b| b.is_ascii_digit()),
        "单号应为 BX-DY2607-1356 形态（前缀+YYMM 4位+横杠+流水3位）：{no}"
    );
    assert_eq!(detail.order.total_amount, dec!(26.25), "账务四列照实写入");
    assert_eq!(detail.order.created_by, Some(1), "created_by 注入会话用户");
    assert_eq!(detail.customer_name, "调样集成客户", "客户名称取真名");
    assert_eq!(detail.items.len(), 1, "应有一行明细");
    assert_eq!(detail.items[0].amount, dec!(26.25), "金额 = 米数×单价");
}

/// 空明细拒绝（调样单必有行级明细）
#[tokio::test]
async fn create_rejects_empty_items() {
    let db = std::sync::Arc::new(setup_test_db().await);
    let customer_id = seed_customer(&db, "调样空明细客户").await;
    let product_id = seed_product(&db, "调样空明细品").await;
    let service = SampleDispatchService::new(db.clone());
    let mut req = create_request(customer_id, product_id);
    req.items.clear();
    let err = service.create(req, 1).await.expect_err("空明细必须拒绝");
    assert!(
        err.to_string().contains("明细不能为空"),
        "报错应点名明细为空: {err}"
    );
}

/// 查重白名单：登记后 is_document_no_taken("sample_dispatch", 单号) 命中真实行
#[tokio::test]
async fn is_document_no_taken_covers_sample_dispatch() {
    let db = std::sync::Arc::new(setup_test_db().await);
    let customer_id = seed_customer(&db, "调样查重客户").await;
    let product_id = seed_product(&db, "调样查重品").await;
    let service = SampleDispatchService::new(db.clone());
    let detail = service
        .create(create_request(customer_id, product_id), 1)
        .await
        .expect("创建调样单应成功");
    let taken = is_document_no_taken(db.as_ref(), "sample_dispatch", &detail.order.document_no)
        .await
        .expect("查重应成功");
    assert!(taken, "已落库单号必须命中查重白名单");
    let absent = is_document_no_taken(db.as_ref(), "sample_dispatch", "BX-DY000000-000")
        .await
        .expect("查重应成功");
    assert!(!absent, "未落库号不应命中");
    let unknown = is_document_no_taken(db.as_ref(), "no_such_doc_type", "X")
        .await
        .expect("未知 doc_type 应走 fail-closed 分支");
    assert!(!unknown, "未知 doc_type 恒 false（fail-closed）");
}

/// 列表：customer_id 精确筛选 + 分页四键回传
#[tokio::test]
async fn list_filters_by_customer_and_clamps_page() {
    let db = std::sync::Arc::new(setup_test_db().await);
    let customer_id = seed_customer(&db, "调样列表客户").await;
    let product_id = seed_product(&db, "调样列表品").await;
    let service = SampleDispatchService::new(db.clone());
    service
        .create(create_request(customer_id, product_id), 1)
        .await
        .expect("创建调样单应成功");
    let page = service
        .list(
            SampleDispatchQuery {
                page: Some(1),
                page_size: Some(20),
                customer_id: Some(customer_id),
                document_no: None,
            },
            None,
        )
        .await
        .expect("列表应成功");
    assert_eq!(page.total, 1, "该客户名下应恰好一行");
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.page, 1);
    assert_eq!(page.page_size, 20);
    let empty = service
        .list(
            SampleDispatchQuery {
                page: Some(1),
                page_size: Some(20),
                customer_id: Some(-1),
                document_no: None,
            },
            None,
        )
        .await
        .expect("列表应成功");
    assert_eq!(empty.total, 0, "不存在的客户应空表");
}

/// 更新：主表全量替换 + 明细整单替换 + 单号保持原值；删除后不可再读
#[tokio::test]
async fn update_replaces_items_and_delete_removes_rows() {
    let db = std::sync::Arc::new(setup_test_db().await);
    let customer_id = seed_customer(&db, "调样更新客户").await;
    let product_id = seed_product(&db, "调样更新品").await;
    let service = SampleDispatchService::new(db.clone());
    let created = service
        .create(create_request(customer_id, product_id), 1)
        .await
        .expect("创建调样单应成功");

    let updated = service
        .update(
            created.order.id,
            UpdateSampleDispatchRequest {
                customer_id,
                department: "测试事业部改".to_string(),
                dispatch_date: NaiveDate::from_ymd_opt(2026, 7, 16).expect("日期合法"),
                opening_balance: dec!(100.00),
                total_amount: dec!(24.00),
                total_collections: dec!(5.00),
                closing_balance: dec!(119.00),
                remarks: None,
                items: vec![CreateSampleDispatchItem {
                    product_id,
                    dye_lot_no: "G2".to_string(),
                    color_no: "藏青".to_string(),
                    composition: "天丝麻".to_string(),
                    quantity_meters: dec!(8),
                    unit_price: dec!(3),
                    remarks: None,
                    sort_order: None,
                }],
            },
        )
        .await
        .expect("更新应成功");
    assert_eq!(updated.order.department, "测试事业部改");
    assert_eq!(
        updated.order.document_no, created.order.document_no,
        "更新不应重取单号"
    );
    assert_eq!(updated.items.len(), 1, "更新后明细应整单替换");
    assert_eq!(updated.items[0].dye_lot_no, "G2");
    assert_eq!(updated.items[0].amount, dec!(24.00), "新明细金额后端计算");

    service.delete(created.order.id).await.expect("删除应成功");
    let err = service
        .get_detail(created.order.id)
        .await
        .expect_err("删除后详情必须 404");
    assert!(
        err.to_string().contains("不存在"),
        "404 应点名调样单不存在: {err}"
    );
}
