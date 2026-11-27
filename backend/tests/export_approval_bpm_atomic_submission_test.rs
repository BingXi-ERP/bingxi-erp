//! 导出审批申请、BPM 实例/首任务与实例关联必须同一事务提交。
//!
//! 取号阻塞用例从另一连接观察事务提交边界：申请必须与 BPM 一起可见。
//! 回写失败用例用 PostgreSQL 触发器强制 bpm_instance_id UPDATE 失败，验证申请、
//! 实例、首任务与通知全部回滚，不保留孤儿流程。

mod test_common;

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use std::time::Duration;

use chrono::{Duration as ChronoDuration, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseBackend, DatabaseConnection, DbBackend,
    EntityTrait, QueryFilter, Set, Statement, TransactionTrait,
};
use serde_json::json;
use tokio::spawn;
use tokio::time::{Instant, sleep};

use bingxi_backend::models::bpm_process_definition;
use bingxi_backend::models::bpm_process_instance;
use bingxi_backend::models::export_approval_request::{ApprovalStatus, Entity as ExportEntity};
use bingxi_backend::models::{bpm_task, notification, user};
use bingxi_backend::services::export_approval_service::{
    BPM_BUSINESS_TYPE_EXPORT_APPROVAL, CreateApprovalRequest, ExportApprovalService,
};

const LINK_FAILURE_TRIGGER: &str = "export_atomic_test_reject_bpm_link";
const LINK_FAILURE_FUNCTION: &str = "export_atomic_test_reject_bpm_link_fn";

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_nanos_opt()
        .expect("测试造数取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间，None 不可达")
}

async fn seed_user(db: &DatabaseConnection, purpose: &str) -> i32 {
    let now = Utc::now();
    let username = format!("export-atomic-{purpose}-{}", unique_tag());
    user::ActiveModel {
        username: Set(username.clone()),
        password_hash: Set("x".repeat(60)),
        real_name: Set(Some(username)),
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

async fn seed_definition(db: &DatabaseConnection, approver_id: i32) {
    let now = Utc::now();
    let config = json!({
        "nodes": [
            { "id": "start", "type": "start_event", "name": "开始" },
            {
                "id": "l1_approve",
                "type": "user_task",
                "name": "一级审批",
                "assignee_type": "user",
                "assignee_value": approver_id.to_string()
            },
            { "id": "end", "type": "end_event", "name": "结束" }
        ],
        "edges": [
            { "source": "start", "target": "l1_approve" },
            { "source": "l1_approve", "target": "end" }
        ]
    });
    bpm_process_definition::ActiveModel {
        name: Set("导出审批原子性回归流程".to_string()),
        code: Set("export_approval".to_string()),
        config: Set(Some(config)),
        status: Set("ACTIVE".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子导出审批流程定义插入失败");
}

fn create_request() -> CreateApprovalRequest {
    CreateApprovalRequest {
        resource_type: "customer".to_string(),
        export_params: json!({ "status": "active" }),
        estimated_rows: Some(10),
        file_format: Some("xlsx".to_string()),
    }
}

fn bpm_number_lock_key(date: &str) -> i64 {
    let mut hasher = DefaultHasher::new();
    format!("BPM{date}").hash(&mut hasher);
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

async fn wait_for_bpm_number_waiters(db: &DatabaseConnection) {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let waiters = scalar_i64(
            db,
            "SELECT COUNT(*) FROM pg_locks WHERE locktype = 'advisory' AND NOT granted",
            vec![],
        )
        .await;
        if waiters > 0 {
            return;
        }
        assert!(
            Instant::now() < deadline,
            "导出审批提交未进入可观测的 BPM 取号等待"
        );
        sleep(Duration::from_millis(20)).await;
    }
}

async fn persisted_counts(db: &DatabaseConnection) -> (usize, usize, usize, usize) {
    let requests = ExportEntity::find()
        .all(db)
        .await
        .expect("回读导出审批申请失败");
    let instances = bpm_process_instance::Entity::find()
        .filter(bpm_process_instance::Column::BusinessType.eq(BPM_BUSINESS_TYPE_EXPORT_APPROVAL))
        .all(db)
        .await
        .expect("回读导出审批实例失败");
    let tasks = bpm_task::Entity::find()
        .all(db)
        .await
        .expect("回读 BPM 首任务失败");
    let notifications = notification::Entity::find()
        .all(db)
        .await
        .expect("回读审批通知失败");
    (
        requests.len(),
        instances.len(),
        tasks.len(),
        notifications.len(),
    )
}

async fn install_link_failure_trigger(db: &DatabaseConnection) {
    for sql in [
        format!("DROP TRIGGER IF EXISTS {LINK_FAILURE_TRIGGER} ON export_approval_request"),
        format!("DROP FUNCTION IF EXISTS {LINK_FAILURE_FUNCTION}()"),
        format!(
            r#"CREATE FUNCTION {LINK_FAILURE_FUNCTION}() RETURNS trigger LANGUAGE plpgsql AS $$
             BEGIN
                 IF NEW.bpm_instance_id IS NOT NULL
                    AND OLD.bpm_instance_id IS DISTINCT FROM NEW.bpm_instance_id THEN
                     RAISE EXCEPTION 'forced export approval BPM link failure';
                 END IF;
                 RETURN NEW;
             END;
             $$"#
        ),
        format!(
            "CREATE TRIGGER {LINK_FAILURE_TRIGGER} \
             BEFORE UPDATE OF bpm_instance_id ON export_approval_request \
             FOR EACH ROW EXECUTE FUNCTION {LINK_FAILURE_FUNCTION}()"
        ),
    ] {
        db.execute_raw(Statement::from_string(DbBackend::Postgres, sql))
            .await
            .expect("安装导出审批实例回写失败触发器失败");
    }
}

async fn remove_link_failure_trigger(db: &DatabaseConnection) {
    for sql in [
        format!("DROP TRIGGER IF EXISTS {LINK_FAILURE_TRIGGER} ON export_approval_request"),
        format!("DROP FUNCTION IF EXISTS {LINK_FAILURE_FUNCTION}()"),
    ] {
        db.execute_raw(Statement::from_string(DbBackend::Postgres, sql))
            .await
            .expect("清理导出审批实例回写失败触发器失败");
    }
}

#[tokio::test]
async fn create_request_keeps_application_and_bpm_invisible_until_commit() {
    let db = Arc::new(test_common::setup_test_db().await);
    let applicant = seed_user(&db, "applicant").await;
    let approver = seed_user(&db, "approver").await;
    seed_definition(&db, approver).await;

    let blocker = db.begin().await.expect("创建 BPM 取号阻塞事务失败");
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

    let submit_db = Arc::clone(&db);
    let submit_task = spawn(async move {
        ExportApprovalService::new(submit_db)
            .create_request(
                applicant,
                "export-atomic-applicant".to_string(),
                None,
                None,
                create_request(),
            )
            .await
    });
    wait_for_bpm_number_waiters(&db).await;

    assert_eq!(
        persisted_counts(&db).await,
        (0, 0, 0, 0),
        "BPM 取号等待期间申请、实例、首任务与通知均不得跨事务可见"
    );

    blocker.commit().await.expect("释放 BPM 取号阻塞事务失败");
    let created = submit_task
        .await
        .expect("导出审批提交任务不得 panic")
        .expect("导出审批提交必须成功");

    assert_eq!(created.status, ApprovalStatus::Pending.as_str());
    let instance_id = created.bpm_instance_id.expect("申请必须回写 BPM 实例关联");
    let instance = bpm_process_instance::Entity::find_by_id(instance_id)
        .one(db.as_ref())
        .await
        .expect("回读导出审批实例失败")
        .expect("导出审批实例必须存在");
    assert_eq!(instance.business_type, BPM_BUSINESS_TYPE_EXPORT_APPROVAL);
    assert_eq!(instance.business_id, Some(created.id));
    let tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.eq(instance_id))
        .all(db.as_ref())
        .await
        .expect("回读导出审批首任务失败");
    assert_eq!(tasks.len(), 1, "一个导出申请只能有一条首任务");
    assert_eq!(tasks[0].actual_handler_id, Some(approver));
    assert_eq!(persisted_counts(&db).await, (1, 1, 1, 1));
}

#[tokio::test]
async fn bpm_link_write_failure_rolls_back_application_instance_task_and_notification() {
    let db = Arc::new(test_common::setup_test_db().await);
    let applicant = seed_user(&db, "applicant").await;
    let approver = seed_user(&db, "approver").await;
    seed_definition(&db, approver).await;
    install_link_failure_trigger(&db).await;

    let result = ExportApprovalService::new(Arc::clone(&db))
        .create_request(
            applicant,
            "export-atomic-applicant".to_string(),
            None,
            None,
            create_request(),
        )
        .await;
    remove_link_failure_trigger(&db).await;

    assert!(result.is_err(), "实例关联回写失败必须拒绝创建导出审批申请");
    assert_eq!(
        persisted_counts(&db).await,
        (0, 0, 0, 0),
        "关联回写失败必须回滚申请、BPM 实例、首任务与通知，不得留下孤儿"
    );
}
