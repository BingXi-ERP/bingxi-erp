//! 审批节点超时策略回归：建单时校验配置、快照 timeout 并写入 due_date。
//!
//! 使用真实 PostgreSQL；本文件只有一个活库用例，避免 setup_test_db 清库互相干扰。

mod test_common;

use std::sync::Arc;

use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, Set};
use serde_json::{Value, json};

use bingxi_backend::models::dto::bpm_dto::{ApproveTaskRequest, StartProcessRequest};
use bingxi_backend::models::status::bpm_task as task_status;
use bingxi_backend::models::{bpm_process_definition, bpm_process_instance, bpm_task, user};
use bingxi_backend::services::bpm_service::BpmService;
use bingxi_backend::utils::error::AppError;
use sea_orm::DatabaseConnection;

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_millis()
        .expect("测试造数取当前时刻毫秒：Utc::now 必落在 chrono 毫秒可表示区间")
}

async fn seed_user(db: &DatabaseConnection, active: bool) -> i32 {
    let now = Utc::now();
    let name = format!("bpm-timeout-user-{}-{}", active, unique_tag());
    user::ActiveModel {
        username: Set(name.clone()),
        password_hash: Set("x".repeat(60)),
        real_name: Set(Some(name)),
        is_active: Set(active),
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

async fn seed_definition(db: &DatabaseConnection, code: &str, config: Value) -> i32 {
    let now = Utc::now();
    bpm_process_definition::ActiveModel {
        name: Set(format!("{code}-超时策略流程")),
        code: Set(code.to_string()),
        config: Set(Some(config)),
        status: Set("ACTIVE".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .unwrap()
    .id
}

fn start_req(code: &str, business_id: i64, initiator_id: i32) -> StartProcessRequest {
    StartProcessRequest {
        process_key: code.to_string(),
        business_type: "quotation".to_string(),
        business_id,
        title: "审批超时策略契约锁".to_string(),
        initiator_id,
        initiator_name: String::new(),
        initiator_department_id: None,
        priority: None,
        form_data: None,
        variables: None,
    }
}

fn single_node(id: &str, approver_id: i32, timeout: Value) -> Value {
    json!({
        "id": id,
        "type": "user_task",
        "name": id,
        "assignee_value": approver_id.to_string(),
        "timeout": timeout,
    })
}

fn config_with_nodes(nodes: Vec<Value>, edges: Vec<Value>) -> Value {
    let mut all_nodes = vec![json!({ "id": "start", "type": "start_event", "name": "开始" })];
    all_nodes.extend(nodes);
    all_nodes.push(json!({ "id": "end", "type": "end_event", "name": "结束" }));
    json!({
        "nodes": all_nodes,
        "edges": edges,
    })
}

async fn task_by_instance(
    db: &DatabaseConnection,
    instance_id: i32,
    node_id: &str,
) -> bpm_task::Model {
    bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.eq(instance_id))
        .filter(bpm_task::Column::NodeId.eq(node_id))
        .one(db)
        .await
        .unwrap()
        .unwrap_or_else(|| panic!("节点 {node_id} 的工单必须存在"))
}

fn assert_timeout_snapshot(task: &bpm_task::Model, fallback_id: i32) {
    let variables = task
        .task_variables
        .as_ref()
        .expect("配置超时后必须写入变量快照");
    assert_eq!(variables["timeout"]["after_seconds"], 3600);
    assert_eq!(variables["timeout"]["transfer_to_user_id"], fallback_id);
    assert_eq!(variables["timeout"]["transfer_count"], 0);
    assert!(task.due_date.is_some(), "配置超时后必须写入 due_date");
}

async fn assert_start_rejected_without_residue(
    db: &DatabaseConnection,
    svc: &BpmService,
    initiator_id: i32,
    code: &str,
    definition_id: i32,
) {
    let business_id = unique_tag();
    let error = svc
        .start_process(start_req(code, business_id, initiator_id))
        .await
        .expect_err("非法超时配置必须拒绝发起");
    assert!(
        matches!(error, AppError::ValidationErrorDisplayable(_)),
        "非法超时配置必须返回可外显校验错误，实得: {error:?}"
    );
    let instances = bpm_process_instance::Entity::find()
        .filter(bpm_process_instance::Column::BusinessId.eq(business_id))
        .count(db)
        .await
        .unwrap();
    let tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::ProcessDefinitionId.eq(definition_id))
        .count(db)
        .await
        .unwrap();
    assert_eq!(instances, 0, "拒绝发起不得残留实例");
    assert_eq!(tasks, 0, "拒绝发起不得残留工单");
}

#[tokio::test]
async fn timeout_policy_is_validated_and_snapshotted_for_first_and_next_tasks() {
    let db = Arc::new(test_common::setup_test_db().await);
    let initiator = seed_user(&db, true).await;
    let approver = seed_user(&db, true).await;
    let fallback = seed_user(&db, true).await;
    let inactive = seed_user(&db, false).await;
    let svc = BpmService::new(db.clone());

    let first_code = format!("bpm_timeout_first_{}", unique_tag());
    let first_config = config_with_nodes(
        vec![single_node(
            "t1",
            approver,
            json!({
                "after_seconds": 3600,
                "transfer_to_user_id": fallback,
            }),
        )],
        vec![
            json!({ "source": "start", "target": "t1" }),
            json!({ "source": "t1", "target": "end" }),
        ],
    );
    let first_definition = seed_definition(&db, &first_code, first_config).await;
    let before = Utc::now();
    let started = svc
        .start_process(start_req(&first_code, unique_tag(), initiator))
        .await
        .expect("合法超时配置必须允许发起");
    let after = Utc::now();
    let first_task = task_by_instance(&db, started.instance_id, "t1").await;
    assert_timeout_snapshot(&first_task, fallback);
    let due = first_task.due_date.unwrap();
    assert!(due >= before + Duration::seconds(3599));
    assert!(due <= after + Duration::seconds(3601));

    let next_code = format!("bpm_timeout_next_{}", unique_tag());
    let next_config = config_with_nodes(
        vec![
            json!({
                "id": "t1",
                "type": "user_task",
                "name": "初审",
                "assignee_value": approver.to_string(),
            }),
            single_node(
                "t2",
                approver,
                json!({
                    "after_seconds": 3600,
                    "transfer_to_user_id": fallback,
                }),
            ),
        ],
        vec![
            json!({ "source": "start", "target": "t1" }),
            json!({ "source": "t1", "target": "t2" }),
            json!({ "source": "t2", "target": "end" }),
        ],
    );
    seed_definition(&db, &next_code, next_config).await;
    let started = svc
        .start_process(start_req(&next_code, unique_tag(), initiator))
        .await
        .expect("首节点无超时、次节点有超时的定义必须允许发起");
    let first_task = task_by_instance(&db, started.instance_id, "t1").await;
    assert!(
        first_task.due_date.is_none(),
        "未配置超时的首节点不得写 due_date"
    );
    assert!(
        first_task.task_variables.is_none(),
        "单人无超时节点保持原变量形状"
    );
    svc.approve_task(
        ApproveTaskRequest {
            task_id: first_task.id,
            handler_id: approver,
            handler_name: String::new(),
            action: "approve".to_string(),
            approval_opinion: None,
            attachment_urls: None,
        },
        Some(approver),
    )
    .await
    .expect("首节点通过后应创建带超时策略的次节点");
    let next_task = task_by_instance(&db, started.instance_id, "t2").await;
    assert_timeout_snapshot(&next_task, fallback);
    assert_eq!(next_task.status.as_deref(), Some(task_status::PENDING));

    let invalid_cases = vec![
        (
            "zero",
            json!({ "after_seconds": 0, "transfer_to_user_id": fallback }),
        ),
        (
            "negative",
            json!({ "after_seconds": -1, "transfer_to_user_id": fallback }),
        ),
        (
            "overflow",
            json!({ "after_seconds": 31_536_001, "transfer_to_user_id": fallback }),
        ),
        (
            "missing_target",
            json!({ "after_seconds": 3600, "transfer_to_user_id": i32::MAX }),
        ),
        (
            "inactive_target",
            json!({ "after_seconds": 3600, "transfer_to_user_id": inactive }),
        ),
    ];
    for (label, timeout) in invalid_cases {
        let code = format!("bpm_timeout_invalid_{label}_{}", unique_tag());
        let config = config_with_nodes(
            vec![single_node("t1", approver, timeout)],
            vec![
                json!({ "source": "start", "target": "t1" }),
                json!({ "source": "t1", "target": "end" }),
            ],
        );
        let definition_id = seed_definition(&db, &code, config).await;
        assert_start_rejected_without_residue(&db, &svc, initiator, &code, definition_id).await;
    }

    assert!(
        bpm_task::Entity::find()
            .filter(bpm_task::Column::ProcessDefinitionId.eq(first_definition))
            .count(&*db)
            .await
            .unwrap()
            == 1,
        "合法首节点定义只应生成一枚工单"
    );
}
