//! 采购订单提交状态、提交审计与 BPM 实例/首任务必须同一事务提交。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::audit_log;
use bingxi_backend::models::bpm_process_instance;
use bingxi_backend::models::purchase_order;
use bingxi_backend::models::purchase_order_item;
use bingxi_backend::models::status::{master_data, purchase_order as purchase_order_status};
use bingxi_backend::models::{bpm_task, notification, product, supplier, user, warehouse};
use bingxi_backend::services::po::order::PurchaseOrderService;
use chrono::{NaiveDate, Utc};
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use test_common::setup_test_db;

const OPERATOR_ID: i32 = 9851;

async fn seed_user(db: &DatabaseConnection) {
    let now = Utc::now();
    user::ActiveModel {
        id: Set(OPERATOR_ID),
        username: Set("po_bpm_atomic_operator".to_string()),
        password_hash: Set("test-only-not-a-real-hash".to_string()),
        real_name: Set(Some("采购审批原子性测试人".to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子操作人插入失败");
}

async fn seed_supplier(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    supplier::ActiveModel {
        supplier_code: Set(format!(
            "SUP-PO-ATOMIC-{}",
            now.timestamp_nanos_opt().unwrap()
        )),
        supplier_name: Set("采购审批原子性供应商".to_string()),
        supplier_short_name: Set("原子性".to_string()),
        supplier_type: Set("面料供应商".to_string()),
        credit_code: Set("91330000TEST00001X".to_string()),
        registered_address: Set("测试注册地址".to_string()),
        legal_representative: Set("测试法人".to_string()),
        registered_capital: Set(Decimal::ZERO),
        establishment_date: Set(NaiveDate::from_ymd_opt(2020, 1, 1).unwrap()),
        taxpayer_type: Set("一般纳税人".to_string()),
        bank_name: Set("测试银行".to_string()),
        bank_account: Set("6222000000000001".to_string()),
        contact_phone: Set("13800000001".to_string()),
        status: Set(Some(master_data::ACTIVE.to_string())),
        created_at: Set(now.into()),
        updated_at: Set(now.into()),
        is_processor: Set(false),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子供应商插入失败")
    .id
}

async fn seed_warehouse(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    warehouse::ActiveModel {
        warehouse_code: Set("WH-PO-ATOMIC".to_string()),
        name: Set("采购审批原子性仓".to_string()),
        is_default: Set(false),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子仓库插入失败")
    .id
}

async fn seed_product(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    product::ActiveModel {
        code: Set("P-PO-ATOMIC".to_string()),
        name: Set("采购审批原子性面料".to_string()),
        unit: Set("米".to_string()),
        status: Set(master_data::ACTIVE.to_string()),
        product_type: Set("fabric".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子产品插入失败")
    .id
}

async fn seed_order_with_item(
    db: &DatabaseConnection,
    supplier_id: i32,
    warehouse_id: i32,
    product_id: i32,
) -> i32 {
    let now = Utc::now();
    let order = purchase_order::ActiveModel {
        order_no: Set("PO-ATOMIC-SUBMIT".to_string()),
        supplier_id: Set(supplier_id),
        order_date: Set(now.date_naive()),
        warehouse_id: Set(warehouse_id),
        department_id: Set(1),
        purchaser_id: Set(OPERATOR_ID),
        currency: Set("CNY".to_string()),
        exchange_rate: Set(Decimal::ONE),
        total_amount: Set(Decimal::from(10)),
        total_amount_foreign: Set(Decimal::from(10)),
        total_quantity: Set(Decimal::ONE),
        total_quantity_alt: Set(Decimal::ONE),
        order_status: Set(purchase_order_status::DRAFT.to_string()),
        created_by: Set(OPERATOR_ID),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子采购订单插入失败");

    purchase_order_item::ActiveModel {
        order_id: Set(order.id),
        line_no: Set(1),
        product_id: Set(product_id),
        quantity: Set(Decimal::ONE),
        quantity_alt: Set(Decimal::ONE),
        unit_price: Set(Decimal::from(10)),
        unit_price_foreign: Set(Decimal::from(10)),
        discount_percent: Set(Decimal::ZERO),
        tax_percent: Set(Decimal::ZERO),
        subtotal: Set(Decimal::from(10)),
        tax_amount: Set(Decimal::ZERO),
        discount_amount: Set(Decimal::ZERO),
        total_amount: Set(Decimal::from(10)),
        received_quantity: Set(Decimal::ZERO),
        received_quantity_alt: Set(Decimal::ZERO),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子采购订单明细插入失败");

    order.id
}

#[tokio::test]
async fn bpm_start_failure_leaves_no_status_audit_or_process() {
    let db = Arc::new(setup_test_db().await);
    seed_user(&db).await;
    let supplier_id = seed_supplier(&db).await;
    let warehouse_id = seed_warehouse(&db).await;
    let product_id = seed_product(&db).await;
    let order_id = seed_order_with_item(&db, supplier_id, warehouse_id, product_id).await;

    let err = PurchaseOrderService::new(Arc::clone(&db))
        .submit_order(order_id, OPERATOR_ID)
        .await
        .expect_err("缺少采购审批定义时提交必须失败");
    assert_eq!(err.error_code(), "BUSINESS_ERROR");

    let reloaded = purchase_order::Entity::find_by_id(order_id)
        .one(db.as_ref())
        .await
        .expect("回读采购订单失败")
        .expect("采购订单必须仍存在");
    assert_eq!(reloaded.order_status, purchase_order_status::DRAFT);
    assert!(
        audit_log::Entity::find()
            .filter(audit_log::Column::ResourceType.eq("purchase_order"))
            .filter(audit_log::Column::ResourceId.eq(order_id.to_string()))
            .all(db.as_ref())
            .await
            .expect("回读采购订单审计失败")
            .is_empty(),
        "BPM 启动失败不得留下提交与补偿两条审计"
    );
    assert!(
        bpm_process_instance::Entity::find()
            .filter(bpm_process_instance::Column::BusinessType.eq("purchase_order"))
            .all(db.as_ref())
            .await
            .expect("回读采购审批实例失败")
            .is_empty()
    );
    assert!(
        bpm_task::Entity::find()
            .all(db.as_ref())
            .await
            .expect("回读采购审批任务失败")
            .is_empty()
    );
    assert!(
        notification::Entity::find()
            .all(db.as_ref())
            .await
            .expect("回读采购审批通知失败")
            .is_empty()
    );
}
