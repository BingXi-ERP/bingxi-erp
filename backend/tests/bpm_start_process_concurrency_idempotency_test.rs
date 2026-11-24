//! BPM 发起流程的并发幂等契约锁
//!
//! 同一业务单据的并发提交只能生成一个在途实例和一条首任务，后到请求复用先到
//! 请求的实例与任务。夹具先用 PostgreSQL 咨询锁挡住取号阶段，确保两个请求都
//! 进入临界区后再放行，避免靠并发时序碰运气；旧实现会在取号后再次建单而红。

mod test_common;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DbBackend, EntityTrait,
    QueryFilter, QueryOrder, Set, Statement, TransactionTrait,
};
use serde_json::json;
use tokio::sync::Barrier;
use tokio::time::{Instant, sleep};

use bingxi_backend::models::dto::bpm_dto::StartProcessRequest;
use bingxi_backend::models::status::bpm_instance as instance_status;
use bingxi_backend::models::status::bpm_task as task_status;
use bingxi_backend::models::{bpm_process_definition, bpm_process_instance, bpm_task, user};
use bingxi_backend::services::bpm_service::BpmService;

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_nanos_opt()
        .expect("测试造数取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间，None 不可达")
}

async fn seed_user(db: &sea_orm::DatabaseConnection, role: &str) -> i32 {
    let now = Utc::now();
    let name = format!("bpm-concurrent-{role}-{}", unique_tag());
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
    .unwrap()
    .id
}

async fn seed_definition(db: &sea_orm::DatabaseConnection, code: &str, approver_id: i32) {
    let now = Utc::now();
    bpm_process_definition::ActiveModel {
        name: Set(format!("{code}-并发幂等契约锁")),
        code: Set(code.to_string()),
        config: Set(Some(json!({
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
        }))),
        status: Set("ACTIVE".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子流程定义插入失败");
}

fn start_req(code: &str, business_id: i64, initiator_id: i32) -> StartProcessRequest {
    StartProcessRequest {
        process_key: code.to_string(),
        business_type: "quotation".to_string(),
        business_id,
        title: "并发发起幂等契约锁".to_string(),
        initiator_id,
        initiator_name: String::new(),
        initiator_department_id: None,
        priority: None,
        form_data: None,
        variables: None,
    }
}

/// 与单据取号器使用同一哈希口径，测试只负责在取号临界区前放置可观测的阻塞点。
fn bpm_number_lock_key(date: &str) -> i64 {
    let mut hasher = DefaultHasher::new();
    "BPM".hash(&mut hasher);
    date.hash(&mut hasher);
    hasher.finish() as i64
}

async fn advisory_waiter_count(db: &sea_orm::DatabaseConnection) -> i64 {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Postgres,
            "SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
            [],
        ))
        .await
        .expect("读取 PostgreSQL 咨询锁等待数失败")
        .expect("咨询锁等待数查询必须返回一行");
    row.try_get_by_index::<i64>(0)
        .expect("咨询锁等待数解码失败")
}

async fn wait_for_two_advisory_waiters(db: &sea_orm::DatabaseConnection) {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        if advisory_waiter_count(db).await >= 2 {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "两个并发发起请求未在取号或业务临界区形成可观测等待，无法证明竞态已被覆盖"
        );
        sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn concurrent_start_process_reuses_single_instance_and_task() {
    let db = Arc::new(test_common::setup_test_db().await);
    let initiator = seed_user(&db, "initiator").await;
    let approver = seed_user(&db, "approver").await;
    let code = format!("bpm_concurrent_{}", unique_tag());
    seed_definition(&db, &code, approver).await;
    let business_id = unique_tag();

    // 同时锁住今天与明天的取号键，覆盖测试跨 UTC 零点的极端边界。
    let blocker = db.begin().await.expect("创建取号阻塞事务失败");
    let today = Utc::now().format("%Y%m%d").to_string();
    let tomorrow = (Utc::now() + ChronoDuration::days(1))
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

    let barrier = Arc::new(Barrier::new(3));
    let mut tasks = Vec::new();
    for _ in 0..2 {
        let db = Arc::clone(&db);
        let code = code.clone();
        let barrier = Arc::clone(&barrier);
        tasks.push(tokio::spawn(async move {
            barrier.wait().await;
            BpmService::new(db)
                .start_process(start_req(&code, business_id, initiator))
                .await
        }));
    }
    barrier.wait().await;
    wait_for_two_advisory_waiters(&db).await;
    blocker.commit().await.expect("释放取号阻塞事务失败");

    let first = tasks
        .remove(0)
        .await
        .expect("第一个并发发起任务不得 panic")
        .expect("第一个并发发起请求必须成功");
    let second = tasks
        .remove(0)
        .await
        .expect("第二个并发发起任务不得 panic")
        .expect("第二个并发发起请求必须复用已有实例并成功");

    assert_eq!(
        first.instance_id, second.instance_id,
        "并发请求必须复用同一实例"
    );
    assert_eq!(
        first.instance_no, second.instance_no,
        "复用实例时必须返回同一实例号"
    );
    assert_eq!(
        first.task_ids, second.task_ids,
        "复用实例时必须返回同一首任务"
    );
    assert_eq!(first.task_ids.len(), 1, "一个业务单据只能有一条首任务");

    let instances = bpm_process_instance::Entity::find()
        .filter(bpm_process_instance::Column::BusinessType.eq("quotation"))
        .filter(bpm_process_instance::Column::BusinessId.eq(business_id))
        .order_by_asc(bpm_process_instance::Column::Id)
        .all(&*db)
        .await
        .expect("回读并发发起的流程实例失败");
    assert_eq!(instances.len(), 1, "并发发起不得落下第二个在途实例");
    assert_eq!(instances[0].id, first.instance_id);
    assert_eq!(
        instances[0].status.as_deref(),
        Some(instance_status::PROCESSING)
    );

    let tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.eq(first.instance_id))
        .order_by_asc(bpm_task::Column::Id)
        .all(&*db)
        .await
        .expect("回读并发发起的首任务失败");
    assert_eq!(tasks.len(), 1, "并发发起不得落下第二条首任务");
    assert_eq!(tasks[0].id, first.task_ids[0]);
    assert_eq!(tasks[0].status.as_deref(), Some(task_status::PENDING));
    assert_eq!(tasks[0].actual_handler_id, Some(approver));

    let repeated = BpmService::new(Arc::clone(&db))
        .start_process(start_req(&code, business_id, initiator))
        .await
        .expect("顺序重提也必须复用已有实例");
    assert_eq!(repeated.instance_id, first.instance_id);
    assert_eq!(repeated.task_ids, first.task_ids);
}
