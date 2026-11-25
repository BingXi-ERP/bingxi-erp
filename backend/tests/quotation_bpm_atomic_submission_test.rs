//! 报价提交与 BPM 发起必须同事务，并发取消不得留下孤儿审批实例。
//!
//! 夹具在 BPM 取号阶段放置可观测阻塞：旧实现先等取号、后锁报价，取消可先提交；
//! 放行后旧实现仍创建审批实例，再因报价已取消而拒绝提交。修复后先锁报价再等取号，
//! 取消只能排在提交之后，报价状态与审批实例关联同事务可见。

mod test_common;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection, DbBackend,
    EntityTrait, QueryFilter, Set, Statement, TransactionTrait,
};
use serde_json::json;
use tokio::spawn;
use tokio::time::{Instant, sleep};

use bingxi_backend::models::bpm_process_definition;
use bingxi_backend::models::bpm_process_instance;
use bingxi_backend::models::quotation_discount_config;
use bingxi_backend::models::status::bpm_task as task_status;
use bingxi_backend::models::status::{master_data, quotation, quotation_ext};
use bingxi_backend::models::{bpm_task, customer, sales_quotation, user};
use bingxi_backend::services::quotation_approval_service::QuotationApprovalService;

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_nanos_opt()
        .expect("测试造数取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间，None 不可达")
}

async fn seed_user(db: &DatabaseConnection, role: &str) -> i32 {
    let now = Utc::now();
    let name = format!("quotation-atomic-{role}-{}", unique_tag());
    user::ActiveModel {
        username: Set(name.clone()),
        password_hash: Set("x".repeat(60)),
        real_name: Set(Some(name)),
        is_active: Set(true),
        is_totp_enabled: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子用户插入失败")
    .id
}

async fn seed_customer(db: &DatabaseConnection, owner_id: i32) -> i32 {
    let now = Utc::now();
    customer::ActiveModel {
        customer_code: Set(format!("CUS-QA-{}", unique_tag())),
        customer_name: Set("报价审批原子性契约锁客户".to_string()),
        credit_limit: Set(Decimal::ZERO),
        payment_terms: Set(30),
        status: Set(master_data::ACTIVE.to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(owner_id),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子客户插入失败")
    .id
}

async fn seed_discount_config(db: &DatabaseConnection) {
    let existing =
        quotation_discount_config::Entity::find_by_id(quotation_discount_config::SINGLE_ROW_ID)
            .one(db)
            .await
            .expect("读取超折扣阈值配置失败");
    if existing.is_none() {
        quotation_discount_config::ActiveModel {
            id: Set(quotation_discount_config::SINGLE_ROW_ID),
            over_discount_threshold_pct: Set(Decimal::from(10)),
            updated_at: Set(Utc::now()),
        }
        .insert(db)
        .await
        .expect("种子超折扣阈值配置插入失败");
    }
}

async fn seed_definition(db: &DatabaseConnection, approver_id: i32) {
    let now = Utc::now();
    let config = json!({
        "nodes": [
            { "id": "start", "type": "start_event", "name": "开始" },
            { "id": "approve_node", "type": "user_task", "name": "审批",
              "assignee_value": approver_id.to_string() },
            { "id": "end", "type": "end_event", "name": "结束" }
        ],
        "edges": [
            { "source": "start", "target": "approve_node" },
            { "source": "approve_node", "target": "end" }
        ]
    });
    bpm_process_definition::ActiveModel {
        name: Set("报价审批原子性契约锁流程".to_string()),
        code: Set("quotation_approval".to_string()),
        config: Set(Some(config)),
        status: Set("ACTIVE".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子报价审批流程定义插入失败");
}

async fn seed_quotation(db: &DatabaseConnection, customer_id: i32, user_id: i32) -> i64 {
    let now = Utc::now();
    let today = now.date_naive();
    sales_quotation::ActiveModel {
        quotation_no: Set(format!("QT-QA-{}", unique_tag())),
        customer_id: Set(customer_id),
        sales_user_id: Set(user_id as i64),
        quotation_date: Set(today),
        valid_until: Set(today),
        price_terms: Set("FOB".to_string()),
        subtotal: Set(Decimal::from(300_000)),
        tax_amount: Set(Decimal::ZERO),
        total_amount: Set(Decimal::from(300_000)),
        status: Set(quotation::DRAFT.to_string()),
        created_by: Set(user_id as i64),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子报价单插入失败")
    .id
}

fn bpm_number_lock_key(date: &str) -> i64 {
    let mut hasher = DefaultHasher::new();
    "BPM".hash(&mut hasher);
    date.hash(&mut hasher);
    hasher.finish() as i64
}

async fn scalar_i64(db: &DatabaseConnection, sql: &str, values: Vec<sea_orm::Value>) -> i64 {
    db.query_one_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        sql,
        values,
    ))
    .await
    .expect("执行 PostgreSQL 标量查询失败")
    .expect("PostgreSQL 标量查询必须返回一行")
    .try_get_by_index(0)
    .expect("PostgreSQL 标量查询结果解码失败")
}

async fn find_number_waiter_blocked_by(db: &DatabaseConnection, blocker_pid: i32) -> Option<i32> {
    db.query_one_raw(Statement::from_sql_and_values(
        DbBackend::Postgres,
        "SELECT waiter.pid FROM pg_locks waiter \
         WHERE waiter.locktype = 'advisory' \
         AND NOT waiter.granted \
         AND $1 = ANY(pg_blocking_pids(waiter.pid))",
        vec![blocker_pid.into()],
    ))
    .await
    .expect("读取 BPM 取号等待事务失败")
    .map(|row| {
        row.try_get_by_index(0)
            .expect("BPM 取号等待事务 PID 解码失败")
    })
}

async fn wait_for_cancel_commit_or_quotation_lock_wait(
    db: &DatabaseConnection,
    quotation_id: i64,
    submit_pid: i32,
) {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let status: String = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                "SELECT status FROM sales_quotations WHERE id = $1",
                [quotation_id.into()],
            ))
            .await
            .expect("读取并发报价状态失败")
            .expect("并发报价行必须存在")
            .try_get_by_index(0)
            .expect("并发报价状态解码失败");
        if status == quotation::CANCELLED {
            return;
        }

        let waiting_locks = scalar_i64(
            db,
            "SELECT COUNT(*) FROM pg_locks waiter \
             WHERE waiter.locktype = 'transactionid' \
             AND NOT waiter.granted \
             AND $1 = ANY(pg_blocking_pids(waiter.pid))",
            vec![submit_pid.into()],
        )
        .await;
        if waiting_locks > 0 {
            return;
        }

        assert!(
            Instant::now() < deadline,
            "取消任务既未提交也未形成可观测的报价行锁等待"
        );
        sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn concurrent_cancel_cannot_leave_orphan_bpm_instance() {
    let db = Arc::new(test_common::setup_test_db().await);
    let initiator = seed_user(&db, "initiator").await;
    let approver = seed_user(&db, "approver").await;
    let customer_id = seed_customer(&db, initiator).await;
    seed_discount_config(&db).await;
    seed_definition(&db, approver).await;
    let quotation_id = seed_quotation(&db, customer_id, initiator).await;

    // 同时锁住今天与明天的取号键，覆盖测试跨 UTC 零点的极端边界。
    let blocker = db.begin().await.expect("创建 BPM 取号阻塞事务失败");
    let blocker_pid: i32 = blocker
        .query_one_raw(Statement::from_string(
            DatabaseBackend::Postgres,
            "SELECT pg_backend_pid()".to_string(),
        ))
        .await
        .expect("读取 BPM 取号阻塞事务 PID 失败")
        .expect("PostgreSQL 当前后端 PID 必须返回一行")
        .try_get_by_index(0)
        .expect("BPM 取号阻塞事务 PID 解码失败");
    let lock_started_at = Utc::now();
    let today = lock_started_at.format("%Y%m%d").to_string();
    let tomorrow = (lock_started_at + ChronoDuration::days(1))
        .format("%Y%m%d")
        .to_string();
    for date in [&today, &tomorrow] {
        blocker
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT pg_advisory_xact_lock($1)",
                [bpm_number_lock_key(date).into()],
            ))
            .await
            .expect("放置 BPM 取号咨询锁失败");
    }

    let submit_db = Arc::clone(&db);
    let submit_task = spawn(async move {
        QuotationApprovalService::new(submit_db)
            .submit(quotation_id, initiator)
            .await
    });

    let deadline = Instant::now() + Duration::from_secs(15);
    let submit_pid = loop {
        if let Some(pid) = find_number_waiter_blocked_by(&db, blocker_pid).await {
            break pid;
        }
        assert!(
            Instant::now() < deadline,
            "报价提交未进入可观测的 BPM 取号等待"
        );
        sleep(Duration::from_millis(20)).await;
    };

    let cancel_db = Arc::clone(&db);
    let cancel_task = spawn(async move {
        sales_quotation::ActiveModel {
            id: Set(quotation_id),
            status: Set(quotation::CANCELLED.to_string()),
            updated_at: Set(Utc::now()),
            ..Default::default()
        }
        .update(cancel_db.as_ref())
        .await
        .expect("并发取消报价失败");
    });

    wait_for_cancel_commit_or_quotation_lock_wait(&db, quotation_id, submit_pid).await;
    blocker.commit().await.expect("释放 BPM 取号阻塞事务失败");

    let submitted = submit_task.await.expect("报价提交任务不得 panic");
    cancel_task.await.expect("报价取消任务不得 panic");

    let instances = bpm_process_instance::Entity::find()
        .filter(bpm_process_instance::Column::BusinessType.eq("quotation"))
        .filter(bpm_process_instance::Column::BusinessId.eq(quotation_id))
        .all(db.as_ref())
        .await
        .expect("回读报价审批实例失败");

    let quotation_row = sales_quotation::Entity::find_by_id(quotation_id)
        .one(db.as_ref())
        .await
        .expect("回读报价最终状态失败")
        .expect("报价最终行必须存在");
    assert_eq!(quotation_row.status, quotation::CANCELLED);

    assert!(
        submitted.is_ok(),
        "提交先取得报价行锁时必须成功；旧实现会先创建 BPM 再因取消拒绝提交。\
         提交结果={submitted:?}，孤儿实例数={}",
        instances.len()
    );
    let submitted = submitted.expect("报价提交必须成功");
    assert_eq!(submitted.status, quotation_ext::PENDING_APPROVAL);
    let instance_id = submitted
        .approval_instance_id
        .expect("提交成功必须同时写入审批实例关联");
    assert_eq!(instances.len(), 1, "一个报价只能有一个审批实例");
    assert_eq!(instances[0].id, instance_id as i32);
    assert_eq!(quotation_row.approval_instance_id, Some(instance_id));
    assert_eq!(quotation_row.submitted_by, Some(initiator as i64));

    let tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.eq(instance_id as i32))
        .all(db.as_ref())
        .await
        .expect("回读报价审批任务失败");
    assert_eq!(tasks.len(), 1, "一个报价只能有一条首任务");
    assert_eq!(tasks[0].status.as_deref(), Some(task_status::PENDING));
}
