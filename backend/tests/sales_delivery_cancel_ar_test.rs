//! 取消送货单与应收红冲的真实 PostgreSQL 回归。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::ar_invoice;
use bingxi_backend::models::ar_reconciliation;
use bingxi_backend::models::ar_reconciliation_item;
use bingxi_backend::models::audit_log;
use bingxi_backend::models::bad_debt_dto::CreateWriteoffRequest;
use bingxi_backend::models::bad_debt_writeoff;
use bingxi_backend::models::customer;
use bingxi_backend::models::inventory_stock;
use bingxi_backend::models::product;
use bingxi_backend::models::sales_delivery;
use bingxi_backend::models::sales_order;
use bingxi_backend::models::sales_order_item;
use bingxi_backend::models::status::ar as ar_status;
use bingxi_backend::models::status::common;
use bingxi_backend::models::status::master_data;
use bingxi_backend::models::status::payment;
use bingxi_backend::models::status::sales_delivery as delivery_status;
use bingxi_backend::models::status::sales_order as so_status;
use bingxi_backend::models::{user, warehouse};
use bingxi_backend::search::{ElasticClient, SearchClient};
use bingxi_backend::services::ar::ArReconciliationService;
use bingxi_backend::services::bad_debt_service::BadDebtService;
use bingxi_backend::services::so::delivery::{ShipOrderItemRequest, ShipOrderRequest};
use bingxi_backend::services::so::order::SalesService;
use bingxi_backend::services::test_common::setup_test_db;
use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};

const OPERATOR_ID: i32 = 22101;
const ORDER_QUANTITY: Decimal = Decimal::from_parts(10, 0, 0, false, 0);
const ORDER_AMOUNT: Decimal = Decimal::from_parts(1_000, 0, 0, false, 0);

fn now() -> chrono::DateTime<chrono::Utc> {
    Utc::now()
}

fn unique_tag() -> i64 {
    now()
        .timestamp_nanos_opt()
        .expect("测试取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间")
}

async fn seed_operator(db: &DatabaseConnection) {
    user::ActiveModel {
        id: Set(OPERATOR_ID),
        username: Set(format!("delivery-ar-cancel-{}", unique_tag())),
        password_hash: Set("test-only-not-a-real-hash".to_string()),
        real_name: Set(Some("取消送货应收回归操作人".to_string())),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子操作人插入失败");
}

async fn seed_customer(db: &DatabaseConnection) -> i32 {
    customer::ActiveModel {
        customer_code: Set(format!("CUS-DELIVERY-AR-{}", unique_tag())),
        customer_name: Set("取消送货应收回归客户".to_string()),
        credit_limit: Set(Decimal::ZERO),
        payment_terms: Set(30),
        status: Set(master_data::ACTIVE.to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(OPERATOR_ID),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子客户插入失败")
    .id
}

async fn seed_product(db: &DatabaseConnection) -> i32 {
    product::ActiveModel {
        code: Set(format!("PRD-DELIVERY-AR-{}", unique_tag())),
        name: Set("取消送货应收回归白坯布".to_string()),
        unit: Set("米".to_string()),
        status: Set(master_data::ACTIVE.to_string()),
        is_deleted: Set(false),
        product_type: Set("greige".to_string()),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子产品插入失败")
    .id
}

async fn seed_warehouse(db: &DatabaseConnection) -> warehouse::Model {
    warehouse::ActiveModel {
        warehouse_code: Set(format!("WH-DELIVERY-AR-{}", unique_tag())),
        name: Set("取消送货应收回归仓".to_string()),
        is_default: Set(false),
        is_active: Set(true),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子仓库插入失败")
}

async fn seed_stock(db: &DatabaseConnection, warehouse_id: i32, product_id: i32) {
    inventory_stock::ActiveModel {
        warehouse_id: Set(warehouse_id),
        product_id: Set(product_id),
        quantity_on_hand: Set(Decimal::from(100)),
        quantity_available: Set(Decimal::from(100)),
        quantity_reserved: Set(Decimal::ZERO),
        quantity_shipped: Set(Decimal::ZERO),
        quantity_incoming: Set(Decimal::ZERO),
        reorder_point: Set(Decimal::ZERO),
        max_stock_point: Set(Decimal::ZERO),
        reorder_quantity: Set(Decimal::ZERO),
        created_at: Set(now()),
        updated_at: Set(now()),
        batch_no: Set("B1".to_string()),
        color_no: Set(String::new()),
        dye_lot_no: Set(None),
        grade: Set("一等品".to_string()),
        quantity_meters: Set(Decimal::from(100)),
        quantity_kg: Set(Decimal::ZERO),
        stock_status: Set("正常".to_string()),
        quality_status: Set("合格".to_string()),
        version: Set(0),
        replenishment_strategy: Set("reorder_point".to_string()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子库存行插入失败");
}

async fn seed_order(
    db: &DatabaseConnection,
    customer_id: i32,
    product_id: i32,
) -> sales_order::Model {
    let order = sales_order::ActiveModel {
        order_no: Set(format!("SO-DELIVERY-AR-{}", unique_tag())),
        customer_id: Set(customer_id),
        order_date: Set(now()),
        status: Set(so_status::APPROVED.to_string()),
        subtotal: Set(ORDER_AMOUNT),
        tax_amount: Set(Decimal::ZERO),
        discount_amount: Set(Decimal::ZERO),
        shipping_cost: Set(Decimal::ZERO),
        total_amount: Set(ORDER_AMOUNT),
        paid_amount: Set(Decimal::ZERO),
        balance_amount: Set(ORDER_AMOUNT),
        created_by: Set(Some(OPERATOR_ID)),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子销售订单插入失败");

    sales_order_item::ActiveModel {
        order_id: Set(order.id),
        product_id: Set(product_id),
        quantity: Set(ORDER_QUANTITY),
        unit_price: Set(Decimal::from(100)),
        discount_percent: Set(Decimal::ZERO),
        tax_percent: Set(Decimal::ZERO),
        subtotal: Set(ORDER_AMOUNT),
        tax_amount: Set(Decimal::ZERO),
        discount_amount: Set(Decimal::ZERO),
        total_amount: Set(ORDER_AMOUNT),
        shipped_quantity: Set(Decimal::ZERO),
        created_at: Set(now()),
        updated_at: Set(now()),
        color_no: Set(String::new()),
        quantity_meters: Set(ORDER_QUANTITY),
        quantity_kg: Set(Decimal::ZERO),
        color_extra_cost: Set(Decimal::ZERO),
        grade_price_diff: Set(Decimal::ZERO),
        shipped_quantity_meters: Set(Decimal::ZERO),
        shipped_quantity_kg: Set(Decimal::ZERO),
        quantity_tolerance_pct: Set(Some(Decimal::ZERO)),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子销售订单明细插入失败");

    order
}

struct SeededCase {
    db: Arc<DatabaseConnection>,
    service: SalesService,
    order: sales_order::Model,
    warehouse: warehouse::Model,
    product_id: i32,
}

async fn seeded_case() -> SeededCase {
    let db = Arc::new(setup_test_db().await);
    seed_operator(&db).await;
    let customer_id = seed_customer(&db).await;
    let product_id = seed_product(&db).await;
    let warehouse = seed_warehouse(&db).await;
    seed_stock(&db, warehouse.id, product_id).await;
    let order = seed_order(&db, customer_id, product_id).await;
    let search_client: Arc<dyn SearchClient> = Arc::new(ElasticClient::mock());
    let service = SalesService::new(Arc::clone(&db), search_client);
    SeededCase {
        db,
        service,
        order,
        warehouse,
        product_id,
    }
}

impl SeededCase {
    fn ship_request(&self) -> ShipOrderRequest {
        self.ship_request_with_quantity(ORDER_QUANTITY)
    }

    fn ship_request_with_quantity(&self, quantity: Decimal) -> ShipOrderRequest {
        ShipOrderRequest {
            order_id: self.order.id,
            warehouse_code: self.warehouse.warehouse_code.clone(),
            items: vec![ShipOrderItemRequest {
                product_id: self.product_id,
                quantity,
                batch_no: Some("B1".to_string()),
                color_no: Some(String::new()),
                dye_lot_no: None,
                piece_no: None,
            }],
            remarks: None,
        }
    }

    async fn ship(&self) -> sales_delivery::Model {
        self.ship_with_quantity(ORDER_QUANTITY).await
    }

    async fn ship_with_quantity(&self, quantity: Decimal) -> sales_delivery::Model {
        self.service
            .ship_order(self.ship_request_with_quantity(quantity), OPERATOR_ID)
            .await
            .expect("发货必须成功");
        sales_delivery::Entity::find()
            .filter(sales_delivery::Column::OrderId.eq(self.order.id))
            .order_by_asc(sales_delivery::Column::Id)
            .all(&*self.db)
            .await
            .expect("回读发货单失败")
            .into_iter()
            .next_back()
            .expect("发货必须生成发货单")
    }

    async fn invoices(&self) -> Vec<ar_invoice::Model> {
        ar_invoice::Entity::find()
            .filter(ar_invoice::Column::CustomerId.eq(self.order.customer_id))
            .order_by_asc(ar_invoice::Column::Id)
            .all(&*self.db)
            .await
            .expect("回读应收单失败")
    }
}

#[tokio::test]
async fn cancel_full_shipment_creates_one_credit_memo_and_reship_creates_one_net_receivable() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let invoices = case.invoices().await;
    assert_eq!(invoices.len(), 1, "全额发货只生成一张原应收单");
    let original = &invoices[0];
    assert_eq!(original.invoice_amount, ORDER_AMOUNT);
    assert_eq!(original.status, common::STATUS_DRAFT);

    case.service
        .cancel_delivery(delivery.id, "测试取消".to_string(), OPERATOR_ID)
        .await
        .expect("未核销的全额发货取消必须成功");

    let after_cancel = case.invoices().await;
    assert_eq!(after_cancel.len(), 2, "取消必须生成一张红字应收单");
    let original_after = ar_invoice::Entity::find_by_id(original.id)
        .one(&*case.db)
        .await
        .expect("回读取消后的原应收失败")
        .expect("原应收历史必须保留");
    assert_eq!(original_after.invoice_amount, ORDER_AMOUNT);
    assert_eq!(original_after.received_amount, Decimal::ZERO);
    assert_eq!(original_after.unpaid_amount, ORDER_AMOUNT);
    assert_eq!(original_after.status, common::STATUS_DRAFT);
    let credit = after_cancel
        .iter()
        .find(|invoice| invoice.invoice_amount < Decimal::ZERO)
        .expect("取消必须留下负金额红字应收单");
    assert_eq!(credit.invoice_amount, -ORDER_AMOUNT);
    assert_eq!(credit.received_amount, Decimal::ZERO);
    assert_eq!(credit.unpaid_amount, -ORDER_AMOUNT);
    assert_eq!(credit.source_type.as_deref(), Some("SALES_DELIVERY_CANCEL"));
    assert_eq!(credit.source_bill_id, Some(i64::from(delivery.id)));
    assert_eq!(
        credit.source_bill_no.as_deref(),
        Some(delivery.delivery_no.as_str())
    );
    assert_eq!(
        credit.sales_order_no.as_deref(),
        Some(case.order.order_no.as_str())
    );
    assert_eq!(credit.status, common::STATUS_DRAFT);
    let credit_audit = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceType.eq("ar_invoice"))
        .filter(audit_log::Column::ResourceId.eq(credit.id.to_string()))
        .filter(audit_log::Column::OperationType.eq("CREATE"))
        .one(&*case.db)
        .await
        .expect("查询取消红字应收创建审计失败")
        .expect("取消红字应收必须同步留下创建审计");
    assert_eq!(credit_audit.user_id, Some(OPERATOR_ID));
    let audit_snapshot = credit_audit
        .after_snapshot
        .expect("创建审计必须保存红字应收快照");
    assert_eq!(audit_snapshot.0["source_type"], "SALES_DELIVERY_CANCEL");
    assert_eq!(audit_snapshot.0["source_bill_id"], i64::from(delivery.id));
    assert_eq!(
        after_cancel
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        Decimal::ZERO,
        "原应收与红字应收必须净额为零"
    );

    let duplicate_cancel = case
        .service
        .cancel_delivery(delivery.id, "重复取消".to_string(), OPERATOR_ID)
        .await;
    assert!(duplicate_cancel.is_err(), "已取消发货单不得再次冲销应收");
    assert_eq!(
        case.invoices().await.len(),
        2,
        "重复取消不得生成第二张红字应收"
    );

    let second_delivery = case.ship().await;
    let after_reship = case.invoices().await;
    assert_eq!(after_reship.len(), 3, "重新发货只新增一张原应收单");
    assert_eq!(
        after_reship
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        ORDER_AMOUNT,
        "历史应收与红字轧差后只允许剩余一张有效应收"
    );
    assert_eq!(
        after_reship
            .iter()
            .filter(|invoice| invoice.source_type.as_deref() == Some("SALES_DELIVERY_CANCEL"))
            .count(),
        1,
        "同一轮取消只能有一张红字应收"
    );

    let txn = case.db.begin().await.expect("创建重复应收校验事务失败");
    let duplicate_ar = ArReconciliationService::new(Arc::clone(&case.db))
        .create_receivable(
            case.order.customer_id,
            case.order.id,
            ORDER_AMOUNT,
            30,
            OPERATOR_ID,
            &txn,
        )
        .await;
    assert!(duplicate_ar.is_err(), "已有净应收时不得重复生成应收");
    txn.rollback().await.expect("回滚重复应收校验事务失败");
    assert_eq!(case.invoices().await.len(), 3, "重复应收校验不得落库");

    case.service
        .cancel_delivery(second_delivery.id, "第二轮取消".to_string(), OPERATOR_ID)
        .await
        .expect("重新发货后的第二轮取消必须成功");
    let after_second_cancel = case.invoices().await;
    assert_eq!(after_second_cancel.len(), 4, "第二轮取消只新增一张红字应收");
    assert_eq!(
        after_second_cancel
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        Decimal::ZERO,
        "两轮原应收与红字应收必须净额为零"
    );
    assert_eq!(
        after_second_cancel
            .iter()
            .filter(|invoice| invoice.source_type.as_deref() == Some("SALES_DELIVERY_CANCEL"))
            .count(),
        2,
        "每轮取消只能有一张红字应收"
    );
}

#[tokio::test]
async fn cancel_full_shipment_rejects_paid_ar_without_partial_writes() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let original = case.invoices().await.remove(0);
    let mut original: ar_invoice::ActiveModel = original.into();
    original.status = Set(payment::PAYMENT_PARTIAL_PAID.to_string());
    original.received_amount = Set(Decimal::from(400));
    original.unpaid_amount = Set(Decimal::from(600));
    original.updated_at = Set(now());
    let original: ar_invoice::Model = original
        .update(&*case.db)
        .await
        .expect("更新部分收款应收失败");

    let result = case
        .service
        .cancel_delivery(delivery.id, "已收款不能取消".to_string(), OPERATOR_ID)
        .await;
    assert!(
        result.is_err(),
        "已有收款的应收必须先取消核销，不能直接红冲"
    );

    let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
        .one(&*case.db)
        .await
        .expect("回读发货单失败")
        .expect("发货单必须存在");
    assert_eq!(delivery_after.status, delivery_status::SHIPPED);
    let order_after = sales_order::Entity::find_by_id(case.order.id)
        .one(&*case.db)
        .await
        .expect("回读销售订单失败")
        .expect("销售订单必须存在");
    assert_eq!(order_after.status, so_status::SHIPPED);
    let stock_after = inventory_stock::Entity::find()
        .filter(inventory_stock::Column::WarehouseId.eq(case.warehouse.id))
        .filter(inventory_stock::Column::ProductId.eq(case.product_id))
        .one(&*case.db)
        .await
        .expect("回读库存失败")
        .expect("库存行必须存在");
    assert_eq!(stock_after.quantity_shipped, ORDER_QUANTITY);
    let invoices_after = case.invoices().await;
    assert_eq!(invoices_after.len(), 1, "拒绝取消不得生成红字应收");
    assert_eq!(invoices_after[0].received_amount, Decimal::from(400));
    assert_eq!(invoices_after[0].unpaid_amount, Decimal::from(600));
    assert_eq!(invoices_after[0].status, payment::PAYMENT_PARTIAL_PAID);
    assert_eq!(invoices_after[0].id, original.id);
}

#[tokio::test]
async fn cancel_full_shipment_rejects_closed_reconciliation_without_matched_items() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let original = case.invoices().await.remove(0);

    let reconciliation = ar_reconciliation::ActiveModel {
        reconciliation_no: Set(format!("AR-CLOSED-DELIVERY-{}", unique_tag())),
        reconciliation_date: Set(now().date_naive()),
        period_start: Set(now().date_naive()),
        period_end: Set(now().date_naive()),
        customer_id: Set(case.order.customer_id),
        opening_balance: Set(Decimal::ZERO),
        total_invoices: Set(ORDER_AMOUNT),
        total_collections: Set(Decimal::ZERO),
        closing_balance: Set(ORDER_AMOUNT),
        reconciliation_status: Set(Some(ar_status::RECONCILIATION_CLOSED.to_string())),
        created_by: Set(Some(OPERATOR_ID)),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(&*case.db)
    .await
    .expect("种子已关闭对账单失败");
    ar_reconciliation_item::ActiveModel {
        reconciliation_id: Set(reconciliation.id),
        item_type: Set("INVOICE".to_string()),
        document_type: Set(Some("SALES_INVOICE".to_string())),
        document_id: Set(Some(original.id)),
        document_no: Set(Some(original.invoice_no.clone())),
        document_date: Set(Some(original.invoice_date)),
        amount: Set(ORDER_AMOUNT),
        matched_amount: Set(None),
        match_status: Set(ar_status::MATCH_UNMATCHED.to_string()),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(&*case.db)
    .await
    .expect("种子未匹配发票明细失败");

    let result = case
        .service
        .cancel_delivery(delivery.id, "已关闭对账不能取消".to_string(), OPERATOR_ID)
        .await;
    assert!(
        result.is_err(),
        "只有未匹配发票明细的已关闭对账单也必须拒绝取消"
    );
    assert_eq!(case.invoices().await.len(), 1, "拒绝取消不得生成红字应收");
    let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
        .one(&*case.db)
        .await
        .expect("回读发货单失败")
        .expect("发货单必须存在");
    assert_eq!(delivery_after.status, delivery_status::SHIPPED);
}

#[tokio::test]
async fn cancel_full_shipment_rejects_matched_invoice_in_open_reconciliation() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let original = case.invoices().await.remove(0);

    let reconciliation = ar_reconciliation::ActiveModel {
        reconciliation_no: Set(format!("AR-MATCHED-DELIVERY-{}", unique_tag())),
        reconciliation_date: Set(now().date_naive()),
        period_start: Set(now().date_naive()),
        period_end: Set(now().date_naive()),
        customer_id: Set(case.order.customer_id),
        opening_balance: Set(Decimal::ZERO),
        total_invoices: Set(ORDER_AMOUNT),
        total_collections: Set(Decimal::ZERO),
        closing_balance: Set(ORDER_AMOUNT),
        reconciliation_status: Set(Some(ar_status::RECONCILIATION_DRAFT.to_string())),
        created_by: Set(Some(OPERATOR_ID)),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(&*case.db)
    .await
    .expect("种子草稿对账单失败");
    ar_reconciliation_item::ActiveModel {
        reconciliation_id: Set(reconciliation.id),
        item_type: Set("INVOICE".to_string()),
        document_type: Set(Some("SALES_INVOICE".to_string())),
        document_id: Set(Some(original.id)),
        document_no: Set(Some(original.invoice_no.clone())),
        document_date: Set(Some(original.invoice_date)),
        amount: Set(ORDER_AMOUNT),
        matched_amount: Set(Some(ORDER_AMOUNT)),
        match_status: Set(ar_status::MATCH_MATCHED.to_string()),
        created_at: Set(now()),
        updated_at: Set(now()),
        ..Default::default()
    }
    .insert(&*case.db)
    .await
    .expect("种子已匹配发票明细失败");

    let result = case
        .service
        .cancel_delivery(delivery.id, "已匹配不能取消".to_string(), OPERATOR_ID)
        .await;
    assert!(
        result.is_err(),
        "未关闭对账单中的已匹配发票明细也必须拒绝取消"
    );
    assert_eq!(case.invoices().await.len(), 1, "拒绝取消不得生成红字应收");
    let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
        .one(&*case.db)
        .await
        .expect("回读发货单失败")
        .expect("发货单必须存在");
    assert_eq!(delivery_after.status, delivery_status::SHIPPED);
}

#[tokio::test]
async fn cancel_one_delivery_after_full_shipment_reverses_ar_and_reship_restores_one_net_receivable()
 {
    let case = seeded_case().await;
    let first = case.ship_with_quantity(Decimal::from(4)).await;
    assert!(case.invoices().await.is_empty(), "部分发货不得提前生成应收");

    let second = case.ship_with_quantity(Decimal::from(6)).await;
    let original = case.invoices().await.remove(0);
    assert_eq!(original.invoice_amount, ORDER_AMOUNT);

    case.service
        .cancel_delivery(first.id, "取消首批发货".to_string(), OPERATOR_ID)
        .await
        .expect("全额发货后取消任意一张送货单必须成功");

    let after_cancel = case.invoices().await;
    assert_eq!(after_cancel.len(), 2, "取消后必须生成一张红字应收");
    assert_eq!(
        after_cancel
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        Decimal::ZERO,
        "整单应收必须被红字全额轧差"
    );
    let second_after = sales_delivery::Entity::find_by_id(second.id)
        .one(&*case.db)
        .await
        .expect("回读第二批发货单失败")
        .expect("第二批发货单必须存在");
    assert_eq!(second_after.status, delivery_status::SHIPPED);
    let order_after = sales_order::Entity::find_by_id(case.order.id)
        .one(&*case.db)
        .await
        .expect("回读销售订单失败")
        .expect("销售订单必须存在");
    assert_eq!(order_after.status, so_status::PARTIAL_SHIPPED);

    case.ship_with_quantity(Decimal::from(4)).await;
    let after_reship = case.invoices().await;
    assert_eq!(after_reship.len(), 3, "补发只新增一张原应收");
    assert_eq!(
        after_reship
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        ORDER_AMOUNT,
        "历史应收与红字轧差后只允许剩余一张有效应收"
    );

    let txn = case.db.begin().await.expect("创建重复应收校验事务失败");
    let duplicate = ArReconciliationService::new(Arc::clone(&case.db))
        .create_receivable(
            case.order.customer_id,
            case.order.id,
            ORDER_AMOUNT,
            30,
            OPERATOR_ID,
            &txn,
        )
        .await;
    assert!(duplicate.is_err(), "仍有活跃应收时不得重复生成");
    txn.rollback().await.expect("回滚重复应收校验事务失败");
}

#[tokio::test]
async fn cancel_full_shipment_rejects_pending_bad_debt_writeoff() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let mut original: ar_invoice::ActiveModel = case.invoices().await.remove(0).into();
    original.approval_status = Set(common::STATUS_APPROVED.to_string());
    original.updated_at = Set(now());
    let original = original
        .update(&*case.db)
        .await
        .expect("更新应收审批状态失败");

    let writeoff = BadDebtService::new(Arc::clone(&case.db))
        .create_writeoff(
            CreateWriteoffRequest {
                customer_id: i64::from(case.order.customer_id),
                ar_invoice_id: original.id,
                writeoff_amount: ORDER_AMOUNT,
                reason: "测试待审坏账核销".to_string(),
                remark: None,
            },
            OPERATOR_ID,
            "delivery-ar-cancel".to_string(),
        )
        .await
        .expect("创建待审坏账核销失败");
    assert_eq!(writeoff.approval_status, "pending");

    let result = case
        .service
        .cancel_delivery(delivery.id, "待审坏账不得取消".to_string(), OPERATOR_ID)
        .await;
    assert!(result.is_err(), "存在待审坏账核销时不得生成取消红字");
    assert_eq!(case.invoices().await.len(), 1, "拒绝取消不得生成红字应收");
    let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
        .one(&*case.db)
        .await
        .expect("回读发货单失败")
        .expect("发货单必须存在");
    assert_eq!(delivery_after.status, delivery_status::SHIPPED);
}

#[tokio::test]
async fn cancelled_delivery_blocks_new_bad_debt_writeoff() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let mut original: ar_invoice::ActiveModel = case.invoices().await.remove(0).into();
    original.approval_status = Set(common::STATUS_APPROVED.to_string());
    original.updated_at = Set(now());
    let original = original
        .update(&*case.db)
        .await
        .expect("更新应收审批状态失败");

    case.service
        .cancel_delivery(delivery.id, "取消后禁止坏账核销".to_string(), OPERATOR_ID)
        .await
        .expect("取消送货单失败");

    let result = BadDebtService::new(Arc::clone(&case.db))
        .create_writeoff(
            CreateWriteoffRequest {
                customer_id: i64::from(case.order.customer_id),
                ar_invoice_id: original.id,
                writeoff_amount: ORDER_AMOUNT,
                reason: "测试取消后坏账核销".to_string(),
                remark: None,
            },
            OPERATOR_ID,
            "delivery-ar-cancel".to_string(),
        )
        .await;
    assert!(result.is_err(), "已生成取消红字的原应收不得再申请坏账核销");
    assert_eq!(case.invoices().await.len(), 2, "坏账核销拒绝不得新增应收");
}

#[tokio::test]
async fn cancel_full_shipment_rejects_fully_paid_ar_without_partial_writes() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let mut original: ar_invoice::ActiveModel = case.invoices().await.remove(0).into();
    original.status = Set(payment::PAYMENT_PAID.to_string());
    original.received_amount = Set(ORDER_AMOUNT);
    original.unpaid_amount = Set(Decimal::ZERO);
    original.updated_at = Set(now());
    original
        .update(&*case.db)
        .await
        .expect("更新全收款应收失败");

    let result = case
        .service
        .cancel_delivery(delivery.id, "全收款不能取消".to_string(), OPERATOR_ID)
        .await;
    assert!(result.is_err(), "已全额收款的应收不得直接红冲");

    let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
        .one(&*case.db)
        .await
        .expect("回读发货单失败")
        .expect("发货单必须存在");
    assert_eq!(delivery_after.status, delivery_status::SHIPPED);
    let order_after = sales_order::Entity::find_by_id(case.order.id)
        .one(&*case.db)
        .await
        .expect("回读销售订单失败")
        .expect("销售订单必须存在");
    assert_eq!(order_after.status, so_status::SHIPPED);
    let stock_after = inventory_stock::Entity::find()
        .filter(inventory_stock::Column::WarehouseId.eq(case.warehouse.id))
        .filter(inventory_stock::Column::ProductId.eq(case.product_id))
        .one(&*case.db)
        .await
        .expect("回读库存失败")
        .expect("库存行必须存在");
    assert_eq!(stock_after.quantity_shipped, ORDER_QUANTITY);
    let invoices_after = case.invoices().await;
    assert_eq!(invoices_after.len(), 1, "拒绝取消不得生成红字应收");
    assert_eq!(invoices_after[0].status, payment::PAYMENT_PAID);
    assert_eq!(invoices_after[0].received_amount, ORDER_AMOUNT);
    assert_eq!(invoices_after[0].unpaid_amount, Decimal::ZERO);
}

#[tokio::test]
async fn cancel_full_shipment_rejects_finance_approved_and_approved_writeoffs() {
    for status in [
        bingxi_backend::models::status::bad_debt_writeoff_status::FINANCE_APPROVED,
        bingxi_backend::models::status::bad_debt_writeoff_status::APPROVED,
    ] {
        let case = seeded_case().await;
        let delivery = case.ship().await;
        let mut original: ar_invoice::ActiveModel = case.invoices().await.remove(0).into();
        original.approval_status = Set(common::STATUS_APPROVED.to_string());
        original.updated_at = Set(now());
        let original = original
            .update(&*case.db)
            .await
            .expect("更新应收审批状态失败");
        let writeoff = BadDebtService::new(Arc::clone(&case.db))
            .create_writeoff(
                CreateWriteoffRequest {
                    customer_id: i64::from(case.order.customer_id),
                    ar_invoice_id: original.id,
                    writeoff_amount: ORDER_AMOUNT,
                    reason: "测试坏账审批中间态".to_string(),
                    remark: None,
                },
                OPERATOR_ID,
                "delivery-ar-cancel".to_string(),
            )
            .await
            .expect("创建坏账核销失败");
        let mut writeoff: bad_debt_writeoff::ActiveModel = writeoff.into();
        writeoff.approval_status = Set(status.to_string());
        writeoff.updated_at = Set(now());
        writeoff
            .update(&*case.db)
            .await
            .expect("更新坏账核销审批状态失败");

        let result = case
            .service
            .cancel_delivery(delivery.id, "坏账审批中不得取消".to_string(), OPERATOR_ID)
            .await;
        assert!(result.is_err(), "坏账状态 {status} 必须阻止取消红冲");
        assert_eq!(case.invoices().await.len(), 1, "拒绝取消不得生成红字应收");
        let delivery_after = sales_delivery::Entity::find_by_id(delivery.id)
            .one(&*case.db)
            .await
            .expect("回读发货单失败")
            .expect("发货单必须存在");
        assert_eq!(delivery_after.status, delivery_status::SHIPPED);
    }
}

#[tokio::test]
async fn rejected_writeoff_does_not_block_delivery_cancellation() {
    let case = seeded_case().await;
    let delivery = case.ship().await;
    let mut original: ar_invoice::ActiveModel = case.invoices().await.remove(0).into();
    original.approval_status = Set(common::STATUS_APPROVED.to_string());
    original.updated_at = Set(now());
    let original = original
        .update(&*case.db)
        .await
        .expect("更新应收审批状态失败");
    let writeoff = BadDebtService::new(Arc::clone(&case.db))
        .create_writeoff(
            CreateWriteoffRequest {
                customer_id: i64::from(case.order.customer_id),
                ar_invoice_id: original.id,
                writeoff_amount: ORDER_AMOUNT,
                reason: "测试已拒绝坏账核销".to_string(),
                remark: None,
            },
            OPERATOR_ID,
            "delivery-ar-cancel".to_string(),
        )
        .await
        .expect("创建坏账核销失败");
    let mut writeoff: bad_debt_writeoff::ActiveModel = writeoff.into();
    writeoff.approval_status =
        Set(bingxi_backend::models::status::bad_debt_writeoff_status::REJECTED.to_string());
    writeoff.updated_at = Set(now());
    writeoff
        .update(&*case.db)
        .await
        .expect("更新坏账核销拒绝状态失败");

    case.service
        .cancel_delivery(delivery.id, "已拒绝坏账允许取消".to_string(), OPERATOR_ID)
        .await
        .expect("已拒绝的坏账核销不得阻止送货取消");
    let invoices_after = case.invoices().await;
    assert_eq!(invoices_after.len(), 2, "取消必须生成一张红字应收");
    assert_eq!(
        invoices_after
            .iter()
            .map(|invoice| invoice.invoice_amount)
            .sum::<Decimal>(),
        Decimal::ZERO
    );
}
