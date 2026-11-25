//! 定制订单状态门失败时的真实 PostgreSQL 原子性回归。
//!
//! 调用方：CI backend job 的 PostgreSQL 集成测试。
//! 入参：未确认打样、事务快照外才可见的报价，以及金额列不可解码的报价影子表。
//! 传给谁：CustomOrderStateService::advance 的生产状态门与事务写链。
//! 存什么/存哪里：断言失败后 custom_orders、process_nodes、process_logs 均无半成品。

mod test_common;

use std::sync::Arc;
use std::time::Duration;

use bingxi_backend::models::status::production::process_node as node_status;
use bingxi_backend::models::status::sales::{
    custom_order as co_status, quotation as quotation_status,
};
use bingxi_backend::models::{
    custom_order, customer, lab_dip_request, process_log, process_node, product, sales_quotation,
    user,
};
use bingxi_backend::services::custom_order_state_service::{CustomOrderStateService, StateError};
use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectOptions, ConnectionTrait, Database, DatabaseConnection,
    DbBackend, EntityTrait, QueryFilter, Set, Statement, TransactionTrait,
};

const SNAPSHOT_APP_NAME: &str = "custom-order-gate-snapshot";
static GATE_TEST_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

struct GateFixture {
    db: DatabaseConnection,
    actor_id: i32,
    customer_id: i32,
    order: custom_order::Model,
    current_node: process_node::Model,
    next_node: process_node::Model,
}

async fn seed_fixture(status: &str, approved_sample_id: Option<i32>) -> GateFixture {
    let db = test_common::setup_test_db().await;
    let now = Utc::now();
    let tag = now
        .timestamp_nanos_opt()
        .expect("测试造数取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间");

    let actor = user::ActiveModel {
        username: Set(format!("co-gate-{tag}")),
        password_hash: Set("test-only-not-a-real-hash".to_string()),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子用户插入失败");

    let customer = customer::ActiveModel {
        customer_code: Set(format!("CUS-CO-GATE-{tag}")),
        customer_name: Set("定制订单状态门回归客户".to_string()),
        credit_limit: Set(Decimal::ZERO),
        payment_terms: Set(30),
        status: Set("active".to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(actor.id),
        created_by: Set(Some(actor.id)),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子客户插入失败");

    let product = product::ActiveModel {
        code: Set(format!("PRD-CO-GATE-{tag}")),
        name: Set("定制订单状态门回归面料".to_string()),
        unit: Set("m".to_string()),
        product_type: Set("fabric".to_string()),
        status: Set("active".to_string()),
        is_deleted: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子面料插入失败");

    let lab_dip = lab_dip_request::ActiveModel {
        request_no: Set(format!("LD-CO-GATE-{tag}")),
        customer_id: Set(Some(customer.id)),
        light_source: Set("D65".to_string()),
        sample_versions: Set(4),
        required_date: Set(now.date_naive()),
        status: Set("approved".to_string()),
        approved_sample_id: Set(approved_sample_id),
        is_deleted: Set(false),
        created_by: Set(Some(actor.id)),
        created_at: Set(now.fixed_offset()),
        updated_at: Set(now.fixed_offset()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子打样通知单插入失败");

    let order = custom_order::ActiveModel {
        order_no: Set(format!("CO-CO-GATE-{tag}")),
        customer_id: Set(customer.id as i64),
        product_id: Set(product.id as i64),
        spec: Set("32S/1 克重 180 门幅 150".to_string()),
        quantity: Set(Decimal::from(100)),
        unit: Set("m".to_string()),
        custom_requirements: Set(serde_json::json!({})),
        status: Set(status.to_string()),
        total_amount: Set(Some(Decimal::from(77))),
        currency: Set("CNY".to_string()),
        lab_dip_request_id: Set(Some(lab_dip.id)),
        created_by: Set(Some(actor.id as i64)),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子定制订单插入失败");

    let current_node = process_node::ActiveModel {
        custom_order_id: Set(order.id),
        node_type: Set(co_status::DYEING.to_string()),
        node_name: Set("当前染色".to_string()),
        sequence: Set(1),
        status: Set(node_status::IN_PROGRESS.to_string()),
        operator_id: Set(Some(actor.id)),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子当前工艺节点插入失败");

    let next_node = process_node::ActiveModel {
        custom_order_id: Set(order.id),
        node_type: Set(co_status::YARN_PURCHASING.to_string()),
        node_name: Set("下一节点".to_string()),
        sequence: Set(2),
        status: Set(node_status::PENDING.to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(&db)
    .await
    .expect("种子下一工艺节点插入失败");

    GateFixture {
        db,
        actor_id: actor.id,
        customer_id: customer.id,
        order,
        current_node,
        next_node,
    }
}

async fn seed_quotation<C: ConnectionTrait>(
    conn: &C,
    customer_id: i32,
    actor_id: i32,
) -> sales_quotation::Model {
    let now = Utc::now();
    let tag = now
        .timestamp_nanos_opt()
        .expect("测试报价取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间");
    sales_quotation::ActiveModel {
        quotation_no: Set(format!("QT-CO-GATE-{tag}")),
        customer_id: Set(customer_id),
        sales_user_id: Set(actor_id as i64),
        quotation_date: Set(now.date_naive()),
        valid_until: Set(now.date_naive()),
        price_terms: Set("FOB".to_string()),
        subtotal: Set(Decimal::from(123456)),
        tax_amount: Set(Decimal::ZERO),
        total_amount: Set(Decimal::from(123456)),
        status: Set(quotation_status::APPROVED.to_string()),
        created_by: Set(actor_id as i64),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(conn)
    .await
    .expect("种子已审批报价插入失败")
}

async fn attach_quotation(fixture: &mut GateFixture, quotation_id: i64) {
    let mut active: custom_order::ActiveModel = fixture.order.clone().into();
    active.quotation_id = Set(Some(quotation_id));
    fixture.order = active
        .update(&fixture.db)
        .await
        .expect("夹具：定制订单关联报价失败");
}

async fn assert_no_partial_writes(fixture: &GateFixture) {
    let order = custom_order::Entity::find_by_id(fixture.order.id)
        .one(&fixture.db)
        .await
        .expect("回读定制订单失败")
        .expect("定制订单必须存在");
    assert_eq!(order.status, fixture.order.status, "失败不得推进订单状态");
    assert_eq!(
        order.total_amount, fixture.order.total_amount,
        "失败不得同步报价金额"
    );

    let current = process_node::Entity::find_by_id(fixture.current_node.id)
        .one(&fixture.db)
        .await
        .expect("回读当前节点失败")
        .expect("当前节点必须存在");
    assert_eq!(current.status, node_status::IN_PROGRESS);
    assert!(current.actual_end_date.is_none());

    let next = process_node::Entity::find_by_id(fixture.next_node.id)
        .one(&fixture.db)
        .await
        .expect("回读下一节点失败")
        .expect("下一节点必须存在");
    assert_eq!(next.status, node_status::PENDING);
    assert!(next.actual_start_date.is_none());
    assert_eq!(next.operator_id, None);

    let logs = process_log::Entity::find()
        .filter(process_log::Column::ProcessNodeId.eq(fixture.current_node.id))
        .all(&fixture.db)
        .await
        .expect("回读工艺日志失败");
    assert!(logs.is_empty(), "失败不得留下工艺日志半成品");
}

fn repeatable_read_url(url: &str) -> String {
    let separator = if url.contains('?') { '&' } else { '?' };
    format!("{url}{separator}options=-c%20default_transaction_isolation%3Drepeatable%20read")
}

async fn snapshot_service_db() -> Arc<DatabaseConnection> {
    let url = std::env::var("TEST_DATABASE_URL").expect("集成测试必须设置 TEST_DATABASE_URL");
    let mut options = ConnectOptions::new(repeatable_read_url(&url));
    options
        .set_application_name(SNAPSHOT_APP_NAME)
        .max_connections(2)
        .min_connections(1)
        .sqlx_logging(false);
    let db = Arc::new(
        Database::connect(options)
            .await
            .expect("快照回归连接池建立失败"),
    );
    let row = db
        .query_one_raw(Statement::from_string(
            DbBackend::Postgres,
            "SHOW default_transaction_isolation".to_string(),
        ))
        .await
        .expect("读取快照回归隔离级别失败")
        .expect("SHOW default_transaction_isolation 必须返回行");
    let isolation: String = row.try_get_by_index(0).expect("快照回归隔离级别解码失败");
    assert_eq!(isolation, "repeatable read", "快照回归必须真的启用 RR");
    db
}

async fn wait_for_snapshot_reader_blocked(txn: &sea_orm::DatabaseTransaction) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let row = txn
                .query_one_raw(Statement::from_sql_and_values(
                    DbBackend::Postgres,
                    "SELECT COUNT(*) AS cnt FROM pg_stat_activity \
                     WHERE application_name = $1 AND wait_event_type = 'Lock'",
                    [sea_orm::Value::from(SNAPSHOT_APP_NAME)],
                ))
                .await
                .expect("查询快照读会话锁等待失败")
                .expect("pg_stat_activity 聚合必须返回行");
            let blocked: i64 = row.try_get("", "cnt").expect("锁等待计数解码失败");
            if blocked > 0 {
                return;
            }
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("状态机未在订单行锁后进入可观察的锁等待态");
}

#[tokio::test]
async fn unconfirmed_lab_dip_rejects_without_partial_writes() {
    let _guard = GATE_TEST_LOCK.lock().await;
    let fixture = seed_fixture(co_status::LAB_DIP, None).await;
    let service = CustomOrderStateService::new(Arc::new(fixture.db.clone()));

    let error = service
        .advance(
            fixture.order.id,
            fixture.actor_id,
            Some("未确认 OK 样不得进入报价".to_string()),
            Some(co_status::QUOTATION),
        )
        .await
        .expect_err("未确认 OK 样必须被打样门拒绝");

    assert!(matches!(error, StateError::GateValidation(_)));
    assert_no_partial_writes(&fixture).await;
}

#[tokio::test]
async fn approved_quotation_advances_and_syncs_amount_with_node_and_log_writes() {
    let _guard = GATE_TEST_LOCK.lock().await;
    let mut fixture = seed_fixture(co_status::QUOTATION, Some(1)).await;
    let quotation = seed_quotation(&fixture.db, fixture.customer_id, fixture.actor_id).await;
    attach_quotation(&mut fixture, quotation.id).await;
    let service = CustomOrderStateService::new(Arc::new(fixture.db.clone()));

    let updated = service
        .advance(
            fixture.order.id,
            fixture.actor_id,
            Some("已审批报价允许推进生产".to_string()),
            Some(co_status::YARN_PURCHASING),
        )
        .await
        .expect("已审批报价应成功推进生产");

    assert_eq!(updated.status, co_status::YARN_PURCHASING);
    assert_eq!(updated.total_amount, Some(quotation.total_amount));

    let current = process_node::Entity::find_by_id(fixture.current_node.id)
        .one(&fixture.db)
        .await
        .expect("回读当前节点失败")
        .expect("当前节点必须存在");
    assert_eq!(current.status, node_status::COMPLETED);
    assert!(current.actual_end_date.is_some());

    let next = process_node::Entity::find_by_id(fixture.next_node.id)
        .one(&fixture.db)
        .await
        .expect("回读下一节点失败")
        .expect("下一节点必须存在");
    assert_eq!(next.status, node_status::IN_PROGRESS);
    assert!(next.actual_start_date.is_some());
    assert_eq!(next.operator_id, Some(fixture.actor_id));

    let logs = process_log::Entity::find()
        .filter(process_log::Column::ProcessNodeId.eq(fixture.current_node.id))
        .all(&fixture.db)
        .await
        .expect("回读工艺日志失败");
    assert_eq!(logs.len(), 1, "成功推进应且仅应写入一条完成日志");
    assert_eq!(logs[0].action, "complete");
    assert_eq!(
        logs[0].before_status.as_deref(),
        Some(node_status::IN_PROGRESS)
    );
    assert_eq!(
        logs[0].after_status.as_deref(),
        Some(node_status::COMPLETED)
    );
}

#[tokio::test]
async fn quotation_missing_after_gate_rolls_back_order_nodes_and_logs() {
    let _guard = GATE_TEST_LOCK.lock().await;
    let mut fixture = seed_fixture(co_status::QUOTATION, Some(1)).await;
    let quotation = seed_quotation(&fixture.db, fixture.customer_id, fixture.actor_id).await;
    attach_quotation(&mut fixture, quotation.id).await;
    sales_quotation::Entity::delete_by_id(quotation.id)
        .exec(&fixture.db)
        .await
        .expect("删除报价以构造事务快照缺失失败");
    let service_db = snapshot_service_db().await;
    let service = CustomOrderStateService::new(service_db);

    let lock_txn = fixture.db.begin().await.expect("开启订单行锁事务失败");
    lock_txn
        .execute_unprepared(&format!(
            "SELECT id FROM custom_orders WHERE id = {} FOR UPDATE",
            fixture.order.id
        ))
        .await
        .expect("锁定定制订单失败");

    let order_id = fixture.order.id;
    let actor_id = fixture.actor_id;
    let advance_task = tokio::spawn(async move {
        service
            .advance(
                order_id,
                actor_id,
                Some("快照外报价不得推进生产".to_string()),
                Some(co_status::YARN_PURCHASING),
            )
            .await
    });
    wait_for_snapshot_reader_blocked(&lock_txn).await;

    let mut quotation_active: sales_quotation::ActiveModel = quotation.clone().into();
    quotation_active.id = Set(quotation.id);
    quotation_active
        .insert(&lock_txn)
        .await
        .expect("快照外重新插入报价失败");
    lock_txn.commit().await.expect("提交快照外报价失败");

    let error = tokio::time::timeout(Duration::from_secs(5), advance_task)
        .await
        .expect("状态机应在报价缺失时快速失败")
        .expect("状态机任务不得 panic")
        .expect_err("事务快照内报价缺失必须显式失败，不得静默推进");

    assert!(matches!(error, StateError::QuotationNotFound(_)));
    assert_no_partial_writes(&fixture).await;
}

#[tokio::test]
async fn quotation_amount_read_failure_rolls_back_order_nodes_and_logs() {
    let _guard = GATE_TEST_LOCK.lock().await;
    let mut fixture = seed_fixture(co_status::QUOTATION, Some(1)).await;
    let quotation = seed_quotation(&fixture.db, fixture.customer_id, fixture.actor_id).await;
    attach_quotation(&mut fixture, quotation.id).await;

    let schema = format!(
        "co_gate_fault_{}",
        Utc::now()
            .timestamp_nanos_opt()
            .expect("测试 schema 取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间")
    );
    fixture
        .db
        .execute_unprepared(&format!("CREATE SCHEMA \"{schema}\""))
        .await
        .expect("创建报价故障影子 schema 失败");
    fixture
        .db
        .execute_unprepared(&format!(
            "CREATE TABLE \"{schema}\".\"sales_quotations\" \
             (LIKE public.sales_quotations INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES); \
             ALTER TABLE \"{schema}\".\"sales_quotations\" \
             ALTER COLUMN total_amount TYPE TEXT USING total_amount::text; \
             INSERT INTO \"{schema}\".\"sales_quotations\" \
             SELECT * FROM public.sales_quotations WHERE id = {}",
            quotation.id
        ))
        .await
        .expect("构造金额列不可解码的报价影子表失败");

    let url = std::env::var("TEST_DATABASE_URL").expect("集成测试必须设置 TEST_DATABASE_URL");
    let mut options = ConnectOptions::new(url);
    options
        .set_schema_search_path(format!("{schema},public"))
        .max_connections(2)
        .min_connections(1)
        .sqlx_logging(false);
    let service_db = Arc::new(
        Database::connect(options)
            .await
            .expect("报价故障影子 schema 连接池建立失败"),
    );
    let service = CustomOrderStateService::new(service_db);

    let result = service
        .advance(
            fixture.order.id,
            fixture.actor_id,
            Some("报价金额读取失败不得推进生产".to_string()),
            Some(co_status::YARN_PURCHASING),
        )
        .await;

    fixture
        .db
        .execute_unprepared(&format!("DROP SCHEMA \"{schema}\" CASCADE"))
        .await
        .expect("清理报价故障影子 schema 失败");

    let error = result.expect_err("报价金额读取失败必须显式返回数据库错误");
    assert!(matches!(error, StateError::Database(_)));
    assert_no_partial_writes(&fixture).await;
}
