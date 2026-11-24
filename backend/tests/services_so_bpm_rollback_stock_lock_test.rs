mod test_common;

use bingxi_backend::models::audit_log;
use bingxi_backend::models::bpm_process_instance;
use bingxi_backend::models::customer;
use bingxi_backend::models::customer_credit;
use bingxi_backend::models::inventory_reservation;
use bingxi_backend::models::inventory_stock;
use bingxi_backend::models::sales_order;
use bingxi_backend::models::status::master_data;
use bingxi_backend::models::status::purchase_inventory::{
    inventory_reservation as reservation_status, inventory_stock_quality_status,
    inventory_stock_status,
};
use bingxi_backend::models::status::sales::fulfillment_source;
use bingxi_backend::models::status::sales_order as so_status;
use bingxi_backend::models::user;
use bingxi_backend::models::warehouse;
use bingxi_backend::models::{bpm_task, notification};
use bingxi_backend::search::{ElasticClient, SearchClient};
use bingxi_backend::services::so::order::SalesService;
use bingxi_backend::services::so::{CreateSalesOrderRequest, SalesOrderItemRequest};
use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbBackend, EntityTrait, Set, Statement,
};
use std::sync::Arc;
use test_common::setup_test_db;

const OPERATOR_ID: i32 = 9861;
const PRODUCT_ID: i32 = 986_101;
const CREDIT_LIMIT: Decimal = Decimal::from_parts(1000, 0, 0, 0, 0);
const ORDER_AMOUNT: Decimal = Decimal::from_parts(300, 0, 0, 0, 0);

async fn seed_operator(db: &DatabaseConnection) {
    let now = Utc::now();
    user::ActiveModel {
        id: Set(OPERATOR_ID),
        username: Set("so_bpm_rollback_operator".to_string()),
        password_hash: Set("test-only-not-a-real-hash".to_string()),
        real_name: Set("销售审批回滚夹具操作人".to_string()),
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

async fn seed_customer_and_credit(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    let customer_id = customer::ActiveModel {
        customer_code: Set("CUS-SO-BPM-ROLLBACK".to_string()),
        customer_name: Set("销售审批回滚夹具客户".to_string()),
        credit_limit: Set(CREDIT_LIMIT),
        payment_terms: Set(30),
        status: Set(master_data::ACTIVE.to_string()),
        customer_type: Set("other".to_string()),
        owner_id: Set(OPERATOR_ID),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子客户插入失败")
    .id;

    customer_credit::ActiveModel {
        customer_id: Set(customer_id),
        credit_limit: Set(CREDIT_LIMIT),
        used_credit: Set(Decimal::ZERO),
        available_credit: Set(CREDIT_LIMIT),
        status: Set(master_data::ACTIVE.to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子客户信用插入失败");

    customer_id
}

async fn seed_warehouse(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    warehouse::ActiveModel {
        warehouse_code: Set("WH-SO-BPM-ROLLBACK".to_string()),
        name: Set("销售审批回滚夹具仓".to_string()),
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

async fn seed_product_and_stock(db: &DatabaseConnection, warehouse_id: i32) {
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "INSERT INTO products (id, code, name, unit, status, product_type) \
         VALUES ($1, $2, $3, $4, $5, $6)",
        vec![
            PRODUCT_ID.into(),
            "P-SO-BPM-ROLLBACK".into(),
            "销售审批回滚夹具面料".into(),
            "米".into(),
            master_data::ACTIVE.into(),
            "fabric".into(),
        ],
    ))
    .await
    .expect("种子产品插入失败");

    let now = Utc::now();
    inventory_stock::ActiveModel {
        warehouse_id: Set(warehouse_id),
        product_id: Set(PRODUCT_ID),
        quantity_on_hand: Set(Decimal::from(100)),
        quantity_available: Set(Decimal::from(100)),
        quantity_reserved: Set(Decimal::ZERO),
        quantity_shipped: Set(Decimal::ZERO),
        quantity_incoming: Set(Decimal::ZERO),
        reorder_point: Set(Decimal::ZERO),
        max_stock_point: Set(Decimal::ZERO),
        reorder_quantity: Set(Decimal::ZERO),
        bin_location: Set(None),
        last_count_date: Set(None),
        last_movement_date: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        batch_no: Set("BATCH-SO-BPM-ROLLBACK".to_string()),
        color_no: Set("COLOR-SO-BPM-ROLLBACK".to_string()),
        dye_lot_no: Set(Some("LOT-SO-BPM-ROLLBACK".to_string())),
        grade: Set("一等品".to_string()),
        production_date: Set(None),
        expiry_date: Set(None),
        quantity_meters: Set(Decimal::from(100)),
        quantity_kg: Set(Decimal::from(50)),
        gram_weight: Set(None),
        width: Set(None),
        location_id: Set(None),
        shelf_no: Set(None),
        layer_no: Set(None),
        stock_status: Set(inventory_stock_status::NORMAL.to_string()),
        quality_status: Set(inventory_stock_quality_status::PASS.to_string()),
        version: Set(1),
        replenishment_strategy: Set("reorder_point".to_string()),
    }
    .insert(db)
    .await
    .expect("种子库存插入失败");
}

fn create_request(customer_id: i32) -> CreateSalesOrderRequest {
    CreateSalesOrderRequest {
        customer_id,
        opportunity_id: None,
        order_date: None,
        contact_person: None,
        contact_phone: None,
        required_date: None,
        status: None,
        shipping_address: None,
        billing_address: None,
        notes: None,
        items: vec![SalesOrderItemRequest {
            product_id: PRODUCT_ID,
            quantity: Decimal::from(30),
            unit_price: Decimal::from(10),
            discount_percent: None,
            tax_percent: None,
            notes: None,
            color_no: Some("COLOR-SO-BPM-ROLLBACK".to_string()),
            color_name: None,
            pantone_code: None,
            grade_required: None,
            quantity_meters: None,
            quantity_kg: None,
            gram_weight: None,
            width: None,
            paper_tube_weight: None,
            is_net_weight: None,
            batch_requirement: Some("BATCH-SO-BPM-ROLLBACK".to_string()),
            dye_lot_requirement: Some("LOT-SO-BPM-ROLLBACK".to_string()),
            base_price: None,
            color_extra_cost: None,
            grade_price_diff: None,
            final_price: None,
            piece_no: None,
            quantity_tolerance_pct: None,
            fulfillment_source: Some(fulfillment_source::STOCK.to_string()),
        }],
        payment_terms: None,
        remarks: None,
        batch_no: None,
        color_no: None,
        dye_lot_no: None,
        grade: None,
        packaging_requirement: None,
        quality_standard: None,
    }
}

async fn seed_sales_order_approval(db: &DatabaseConnection) {
    db.execute_raw(Statement::from_string(
        DbBackend::Postgres,
        r#"INSERT INTO bpm_process_definition (name, code, category, config, status)
           VALUES ('销售订单审批流程回滚夹具', 'sales_order_approval', 'sales',
                   '{"nodes":[{"id":"start","type":"start_event","name":"提交审批"},
                             {"id":"approve_task","type":"user_task","name":"销售订单审批","assignee_value":"9861"},
                             {"id":"end","type":"end_event","name":"完成"}],
                    "edges":[{"source":"start","target":"approve_task"},
                             {"source":"approve_task","target":"end"}]}'::jsonb,
                   'ACTIVE')"#
            .to_string(),
    ))
    .await
    .expect("种子销售订单审批定义插入失败");
}

async fn reservations_for_order(
    db: &DatabaseConnection,
    order_id: i32,
) -> Vec<inventory_reservation::Model> {
    inventory_reservation::Entity::find()
        .filter(inventory_reservation::Column::OrderId.eq(order_id))
        .all(db)
        .await
        .expect("回读订单预留台账失败")
}

#[tokio::test]
async fn bpm_start_failure_leaves_no_stock_credit_or_process_before_clean_resubmit() {
    let db = setup_test_db().await;
    seed_operator(&db).await;
    let customer_id = seed_customer_and_credit(&db).await;
    let warehouse_id = seed_warehouse(&db).await;
    seed_product_and_stock(&db, warehouse_id).await;

    let search_client: Arc<dyn SearchClient> = Arc::new(ElasticClient::mock());
    let service = SalesService::new(Arc::new(db.clone()), search_client);
    let order = service
        .create_order(create_request(customer_id), OPERATOR_ID)
        .await
        .expect("销售订单建单失败");
    let audit_baseline = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceType.eq("sales_orders"))
        .filter(audit_log::Column::ResourceId.eq(order.id.to_string()))
        .all(&db)
        .await
        .expect("回读销售订单建单审计失败")
        .len();

    let err = service
        .submit_order(order.id, OPERATOR_ID)
        .await
        .expect_err("缺少销售订单审批定义时提交必须失败");
    assert_eq!(err.error_code(), "BUSINESS_ERROR");
    assert!(
        err.to_string().contains("订单未提交"),
        "BPM 启动失败必须明确告知订单未提交，实际: {err}"
    );

    let rolled_back = sales_order::Entity::find_by_id(order.id)
        .one(&db)
        .await
        .expect("回读补偿回滚订单失败")
        .expect("补偿回滚订单必须仍存在");
    assert_eq!(rolled_back.status, so_status::DRAFT);
    assert_eq!(rolled_back.total_amount, ORDER_AMOUNT);

    let stock = inventory_stock::Entity::find()
        .filter(inventory_stock::Column::ProductId.eq(PRODUCT_ID))
        .one(&db)
        .await
        .expect("回读补偿回滚库存失败")
        .expect("补偿回滚库存必须仍存在");
    assert_eq!(stock.quantity_available, Decimal::from(100));
    assert_eq!(stock.quantity_reserved, Decimal::ZERO);

    let credit = customer_credit::Entity::find()
        .filter(customer_credit::Column::CustomerId.eq(customer_id))
        .one(&db)
        .await
        .expect("回读补偿回滚信用失败")
        .expect("补偿回滚信用必须仍存在");
    assert_eq!(credit.used_credit, Decimal::ZERO);
    assert_eq!(credit.available_credit, CREDIT_LIMIT);

    let rolled_back_reservations = reservations_for_order(&db, order.id).await;
    assert!(
        rolled_back_reservations.is_empty(),
        "提交事务回滚后不得留下已释放的锁缸台账"
    );
    assert_eq!(
        audit_log::Entity::find()
            .filter(audit_log::Column::ResourceType.eq("sales_orders"))
            .filter(audit_log::Column::ResourceId.eq(order.id.to_string()))
            .all(&db)
            .await
            .expect("回读销售订单提交审计失败")
            .len(),
        audit_baseline,
        "BPM 启动失败不得留下提交与补偿两条审计"
    );
    assert!(
        bpm_process_instance::Entity::find()
            .filter(bpm_process_instance::Column::BusinessType.eq("sales_order"))
            .all(&db)
            .await
            .expect("回读销售审批实例失败")
            .is_empty()
    );
    assert!(
        bpm_task::Entity::find()
            .all(&db)
            .await
            .expect("回读销售审批任务失败")
            .is_empty()
    );
    assert!(
        notification::Entity::find()
            .all(&db)
            .await
            .expect("回读销售审批通知失败")
            .is_empty()
    );

    seed_sales_order_approval(&db).await;
    service
        .submit_order(order.id, OPERATOR_ID)
        .await
        .expect("补齐审批定义后重提必须成功");

    let resubmitted_stock = inventory_stock::Entity::find_by_id(stock.id)
        .one(&db)
        .await
        .expect("回读重提库存失败")
        .expect("重提库存必须仍存在");
    assert_eq!(resubmitted_stock.quantity_available, Decimal::from(70));
    assert_eq!(resubmitted_stock.quantity_reserved, Decimal::from(30));

    let resubmitted_order = sales_order::Entity::find_by_id(order.id)
        .one(&db)
        .await
        .expect("回读重提订单失败")
        .expect("重提订单必须仍存在");
    assert_eq!(resubmitted_order.status, so_status::PENDING);

    let resubmitted_credit = customer_credit::Entity::find()
        .filter(customer_credit::Column::CustomerId.eq(customer_id))
        .one(&db)
        .await
        .expect("回读重提信用失败")
        .expect("重提信用必须仍存在");
    assert_eq!(resubmitted_credit.used_credit, ORDER_AMOUNT);
    assert_eq!(
        resubmitted_credit.available_credit,
        CREDIT_LIMIT - ORDER_AMOUNT
    );

    let resubmitted_reservations = reservations_for_order(&db, order.id).await;
    assert_eq!(resubmitted_reservations.len(), 1);
    assert_eq!(
        resubmitted_reservations
            .iter()
            .filter(|row| row.status == reservation_status::RELEASED)
            .count(),
        0,
        "失败提交不得留下释放台账"
    );
    assert_eq!(
        resubmitted_reservations
            .iter()
            .filter(|row| row.status == reservation_status::LOCKED)
            .count(),
        1,
        "重提只能新建一条生效锁缸台账"
    );
}
