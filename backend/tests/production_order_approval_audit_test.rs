mod test_common;

use std::sync::Arc;

use bingxi_backend::models::audit_log;
use bingxi_backend::models::production_order::Model as ProductionOrderModel;
use bingxi_backend::models::status::{common, production};
use bingxi_backend::services::production_order_service::{
    CreateProductionOrderRequest, ProductionOrderService, UpdateProductionOrderRequest,
};
use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DbBackend, EntityTrait, QueryFilter, QueryOrder, Statement,
};
use test_common::setup_test_db;

const OPERATOR_ID: i32 = 9871;
const STATUS_OPERATOR_ID: i32 = 9872;
const PRODUCT_ID: i32 = 987_101;
const WORK_CENTER_ID: i32 = 987_201;
const ORIGINAL_BATCH_ID: i32 = 987_301;

async fn seed_fixture(db: &sea_orm::DatabaseConnection) {
    let now = Utc::now();
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "INSERT INTO users (id, username, password_hash, real_name, is_active, is_totp_enabled, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, true, false, $5, $5)",
        vec![
            OPERATOR_ID.into(),
            "production_approval_auditor".to_string().into(),
            "test-only-not-a-real-hash".to_string().into(),
            "生产审批审计测试人".to_string().into(),
            now.into(),
        ],
    ))
    .await
    .expect("种子操作人插入失败");

    for (sql, what) in [
        (
            "INSERT INTO products (id, code, name, unit, status, product_type) \
             VALUES ($1, 'P-PO-AUDIT', '生产审批审计测试面料', '米', 'active', '成品布')",
            "products 父行",
        ),
        (
            "INSERT INTO work_centers (id, code, name) \
             VALUES ($1, 'WC-PO-AUDIT', '生产审批审计测试工作中心')",
            "work_centers 父行",
        ),
        (
            r#"INSERT INTO bpm_process_definition (name, code, category, config, status)
               VALUES ('生产订单审计测试审批流', 'production_order_approval', 'production',
                       '{"nodes":[{"id":"start","type":"start_event","name":"提交审批"},
                                 {"id":"approve_task","type":"user_task","name":"生产订单审批","assignee_value":"9871"},
                                 {"id":"end","type":"end_event","name":"完成"}],
                        "edges":[{"source":"start","target":"approve_task"},
                                 {"source":"approve_task","target":"end"}]}'::jsonb,
                       'ACTIVE')"#,
            "bpm_process_definition ACTIVE 定义",
        ),
    ] {
        let values = if sql.contains("products") || sql.contains("work_centers") {
            vec![if sql.contains("products") {
                PRODUCT_ID.into()
            } else {
                WORK_CENTER_ID.into()
            }]
        } else {
            Vec::<sea_orm::Value>::new()
        };
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            sql,
            values,
        ))
        .await
        .unwrap_or_else(|error| panic!("种子 {what} 写入失败: {error}"));
    }
}

fn create_request() -> CreateProductionOrderRequest {
    CreateProductionOrderRequest {
        sales_order_id: None,
        product_id: PRODUCT_ID,
        planned_quantity: Decimal::new(1000, 0),
        planned_start_date: None,
        planned_end_date: None,
        priority: Some(1),
        work_center_id: Some(WORK_CENTER_ID),
        remarks: None,
    }
}

async fn audit_rows(db: &sea_orm::DatabaseConnection, order_id: i32) -> Vec<audit_log::Model> {
    audit_log::Entity::find()
        .filter(audit_log::Column::ResourceType.eq("production_order"))
        .filter(audit_log::Column::ResourceId.eq(order_id.to_string()))
        .order_by_asc(audit_log::Column::Id)
        .all(db)
        .await
        .expect("回读生产订单审计日志失败")
}

fn snapshot_status(snapshot: &Option<audit_log::AuditValue>) -> Option<&str> {
    snapshot
        .as_ref()
        .and_then(|value| value.0.get("status"))
        .and_then(|status| status.as_str())
}

fn assert_transition(row: &audit_log::Model, order_id: i32, before: &str, after: &str) {
    assert_eq!(row.user_id, Some(OPERATOR_ID), "审计必须落真实操作人");
    assert_eq!(
        row.username.as_deref(),
        Some("production_approval_auditor"),
        "审计必须落操作人用户名"
    );
    assert_eq!(row.action, "UPDATE", "审批动作必须落 UPDATE 审计");
    assert_eq!(row.operation_type.as_deref(), Some("UPDATE"));
    assert_eq!(row.resource_type.as_deref(), Some("production_order"));
    assert_eq!(
        row.resource_id.as_deref(),
        Some(order_id.to_string().as_str())
    );
    assert_eq!(snapshot_status(&row.before_snapshot), Some(before));
    assert_eq!(snapshot_status(&row.after_snapshot), Some(after));
    assert_eq!(
        snapshot_status(&row.old_value),
        Some(before),
        "兼容旧字段也必须保留变更前快照"
    );
    assert_eq!(
        snapshot_status(&row.new_value),
        Some(after),
        "兼容旧字段也必须保留变更后快照"
    );
}

#[tokio::test]
async fn production_order_submit_and_approval_actions_write_audit_snapshots() {
    let db = Arc::new(setup_test_db().await);
    seed_fixture(&db).await;
    let service = ProductionOrderService::new(Arc::clone(&db));

    let approved_order = service
        .create(create_request(), OPERATOR_ID)
        .await
        .expect("创建待审批生产订单失败");
    assert_eq!(approved_order.status, common::STATUS_DRAFT);
    let approved_baseline = audit_rows(&db, approved_order.id).await.len();

    let submitted = service
        .submit_for_approval(approved_order.id, OPERATOR_ID, "生产审批审计测试人")
        .await
        .expect("提交生产订单审批失败");
    assert_eq!(submitted.status, production::PRODUCTION_PENDING_APPROVAL);
    let submitted_audit = audit_rows(&db, approved_order.id).await;
    assert_eq!(
        submitted_audit.len(),
        approved_baseline + 1,
        "提交必须恰好新增一条审计"
    );
    assert_transition(
        submitted_audit.last().expect("提交后必须存在审计记录"),
        approved_order.id,
        common::STATUS_DRAFT,
        production::PRODUCTION_PENDING_APPROVAL,
    );

    let approved = service
        .approve_order(
            approved_order.id,
            OPERATOR_ID,
            "生产审批审计测试人",
            true,
            None,
        )
        .await
        .expect("审批通过生产订单失败");
    assert_eq!(approved.status, common::STATUS_APPROVED);
    let approved_audit = audit_rows(&db, approved_order.id).await;
    assert_eq!(
        approved_audit.len(),
        approved_baseline + 2,
        "审批通过必须再新增一条审计"
    );
    assert_transition(
        approved_audit.last().expect("审批通过后必须存在审计记录"),
        approved_order.id,
        production::PRODUCTION_PENDING_APPROVAL,
        common::STATUS_APPROVED,
    );

    let rejected_order = service
        .create(create_request(), OPERATOR_ID)
        .await
        .expect("创建待驳回生产订单失败");
    let rejected_baseline = audit_rows(&db, rejected_order.id).await.len();
    service
        .submit_for_approval(rejected_order.id, OPERATOR_ID, "生产审批审计测试人")
        .await
        .expect("提交待驳回生产订单失败");
    let rejected = service
        .approve_order(
            rejected_order.id,
            OPERATOR_ID,
            "生产审批审计测试人",
            false,
            None,
        )
        .await
        .expect("驳回生产订单失败");
    assert_eq!(rejected.status, production::PRODUCTION_REJECTED);
    let rejected_audit = audit_rows(&db, rejected_order.id).await;
    assert_eq!(
        rejected_audit.len(),
        rejected_baseline + 2,
        "提交并驳回必须恰好新增两条审计"
    );
    assert_transition(
        rejected_audit.last().expect("驳回后必须存在审计记录"),
        rejected_order.id,
        production::PRODUCTION_PENDING_APPROVAL,
        production::PRODUCTION_REJECTED,
    );
}

fn snapshot_field<'a>(
    snapshot: &'a Option<audit_log::AuditValue>,
    key: &str,
) -> Option<&'a serde_json::Value> {
    snapshot.as_ref().and_then(|value| value.0.get(key))
}

fn assert_create_audit(row: &audit_log::Model, order: &ProductionOrderModel) {
    assert_eq!(row.user_id, Some(OPERATOR_ID));
    assert_eq!(row.username.as_deref(), Some("production_approval_auditor"));
    assert_eq!(row.action, "CREATE");
    assert_eq!(row.operation_type.as_deref(), Some("CREATE"));
    assert_eq!(row.severity.as_deref(), Some("INFO"));
    assert_eq!(row.resource_type.as_deref(), Some("production_order"));
    assert_eq!(
        row.resource_id.as_deref(),
        Some(order.id.to_string().as_str())
    );
    assert!(row.before_snapshot.is_none(), "创建不存在变更前快照");
    assert!(row.old_value.is_none(), "创建不存在变更前旧字段");

    for after in [&row.after_snapshot, &row.new_value] {
        assert_eq!(snapshot_status(after), Some(common::STATUS_DRAFT));
        assert_eq!(
            snapshot_field(after, "order_no").and_then(|value| value.as_str()),
            Some(order.order_no.as_str())
        );
        assert_eq!(
            snapshot_field(after, "product_id").and_then(|value| value.as_i64()),
            Some(i64::from(order.product_id))
        );
        assert_eq!(
            snapshot_field(after, "planned_quantity").and_then(|value| value.as_str()),
            Some(order.planned_quantity.to_string().as_str())
        );
        assert_eq!(
            snapshot_field(after, "created_by").and_then(|value| value.as_i64()),
            Some(i64::from(order.created_by))
        );
        assert_eq!(
            snapshot_field(after, "order_type").and_then(|value| value.as_str()),
            Some(order.order_type.as_str())
        );
        assert_eq!(
            snapshot_field(after, "original_batch_id").and_then(|value| value.as_i64()),
            order.original_batch_id.map(i64::from)
        );
    }
}

#[tokio::test]
async fn production_order_create_writes_create_audit_snapshot() {
    let db = Arc::new(setup_test_db().await);
    seed_fixture(&db).await;
    let service = ProductionOrderService::new(Arc::clone(&db));

    let order = service
        .create(create_request(), OPERATOR_ID)
        .await
        .expect("创建生产订单失败");
    let rows = audit_rows(&db, order.id).await;
    assert_eq!(rows.len(), 1, "建单必须恰好新增一条创建审计");
    assert_create_audit(rows.first().expect("建单后必须存在创建审计"), &order);
}

#[tokio::test]
async fn production_order_rework_create_writes_create_audit_snapshot() {
    let db = Arc::new(setup_test_db().await);
    seed_fixture(&db).await;
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "INSERT INTO dye_batch (id, batch_no, color_code, color_name, created_by) \
         VALUES ($1, 'BATCH-PO-AUDIT', 'C-PO-AUDIT', '生产订单返工审计测试缸号', $2)",
        vec![ORIGINAL_BATCH_ID.into(), OPERATOR_ID.into()],
    ))
    .await
    .expect("种子返工来源缸号插入失败");
    let service = ProductionOrderService::new(Arc::clone(&db));

    let order = service
        .create_rework_order(
            PRODUCT_ID,
            ORIGINAL_BATCH_ID,
            None,
            OPERATOR_ID,
            Some("返工建单审计验证".to_string()),
        )
        .await
        .expect("创建返工生产订单失败");
    assert_eq!(order.order_type, "rework");
    assert_eq!(order.original_batch_id, Some(ORIGINAL_BATCH_ID));
    assert!(order.order_no.starts_with("RW"));

    let rows = audit_rows(&db, order.id).await;
    assert_eq!(rows.len(), 1, "返工建单必须恰好新增一条创建审计");
    assert_create_audit(rows.first().expect("返工建单后必须存在创建审计"), &order);
    let row = rows.first().expect("返工建单后必须存在创建审计");
    assert_eq!(
        snapshot_field(&row.after_snapshot, "remarks").and_then(|value| value.as_str()),
        Some("返工建单审计验证")
    );
    assert_eq!(
        snapshot_field(&row.new_value, "remarks").and_then(|value| value.as_str()),
        Some("返工建单审计验证")
    );
}

#[tokio::test]
async fn production_order_status_update_records_actual_operator() {
    let db = Arc::new(setup_test_db().await);
    seed_fixture(&db).await;
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "INSERT INTO users (id, username, password_hash, real_name, is_active, is_totp_enabled, created_at, updated_at) \
         VALUES ($1, 'production_status_operator', 'test-only-not-a-real-hash', '生产状态操作人', true, false, NOW(), NOW())",
        vec![STATUS_OPERATOR_ID.into()],
    ))
    .await
    .expect("种子状态操作人插入失败");
    let service = ProductionOrderService::new(Arc::clone(&db));
    let order = service
        .create(create_request(), OPERATOR_ID)
        .await
        .expect("创建待更新状态生产订单失败");
    let baseline = audit_rows(&db, order.id).await.len();

    let updated = service
        .update_status(
            order.id,
            common::STATUS_CANCELLED.to_string(),
            None,
            STATUS_OPERATOR_ID,
        )
        .await
        .expect("更新生产订单状态失败");
    assert_eq!(updated.status, common::STATUS_CANCELLED);

    let rows = audit_rows(&db, order.id).await;
    assert_eq!(rows.len(), baseline + 1, "状态更新必须恰好新增一条审计");
    let row = rows.last().expect("状态更新后必须存在审计记录");
    assert_eq!(row.user_id, Some(STATUS_OPERATOR_ID));
    assert_eq!(row.username.as_deref(), Some("production_status_operator"));
    assert_eq!(row.action, "UPDATE");
    assert_eq!(row.operation_type.as_deref(), Some("UPDATE"));
    assert_eq!(
        snapshot_status(&row.before_snapshot),
        Some(common::STATUS_DRAFT)
    );
    assert_eq!(
        snapshot_status(&row.after_snapshot),
        Some(common::STATUS_CANCELLED)
    );
    assert_eq!(snapshot_status(&row.old_value), Some(common::STATUS_DRAFT));
    assert_eq!(
        snapshot_status(&row.new_value),
        Some(common::STATUS_CANCELLED)
    );
}

#[tokio::test]
async fn production_order_update_writes_audit_snapshot() {
    let db = Arc::new(setup_test_db().await);
    seed_fixture(&db).await;
    let service = ProductionOrderService::new(Arc::clone(&db));
    let order = service
        .create(create_request(), OPERATOR_ID)
        .await
        .expect("创建待编辑生产订单失败");
    let baseline = audit_rows(&db, order.id).await.len();

    let updated = service
        .update(
            order.id,
            UpdateProductionOrderRequest {
                planned_quantity: Some(Some(Decimal::new(1200, 0))),
                planned_start_date: None,
                planned_end_date: None,
                priority: Some(Some(3)),
                work_center_id: None,
                remarks: Some(Some("编辑审计验证".to_string())),
            },
            OPERATOR_ID,
        )
        .await
        .expect("编辑生产订单失败");
    assert_eq!(updated.planned_quantity, Decimal::new(1200, 0));
    assert_eq!(updated.priority, 3);
    assert_eq!(updated.remarks.as_deref(), Some("编辑审计验证"));

    let rows = audit_rows(&db, order.id).await;
    assert_eq!(rows.len(), baseline + 1, "编辑必须恰好新增一条审计");
    let row = rows.last().expect("编辑后必须存在审计记录");
    assert_eq!(row.user_id, Some(OPERATOR_ID));
    assert_eq!(row.username.as_deref(), Some("production_approval_auditor"));
    assert_eq!(row.action, "UPDATE");
    assert_eq!(row.operation_type.as_deref(), Some("UPDATE"));
    assert_eq!(row.resource_type.as_deref(), Some("production_order"));
    assert_eq!(
        row.resource_id.as_deref(),
        Some(order.id.to_string().as_str())
    );

    for (before, after) in [
        (&row.before_snapshot, &row.after_snapshot),
        (&row.old_value, &row.new_value),
    ] {
        assert_eq!(
            snapshot_field(before, "planned_quantity").and_then(|v| v.as_str()),
            Some("1000")
        );
        assert_eq!(
            snapshot_field(after, "planned_quantity").and_then(|v| v.as_str()),
            Some("1200")
        );
        assert_eq!(
            snapshot_field(before, "priority").and_then(|v| v.as_u64()),
            Some(1)
        );
        assert_eq!(
            snapshot_field(after, "priority").and_then(|v| v.as_u64()),
            Some(3)
        );
        assert!(snapshot_field(before, "remarks").is_none_or(serde_json::Value::is_null));
        assert_eq!(
            snapshot_field(after, "remarks").and_then(|v| v.as_str()),
            Some("编辑审计验证")
        );
    }
}
