//! 审批超时自动转交回归：到期转交、幂等、审计、通知与多人签署轨迹保留。
//!
//! 使用真实 PostgreSQL；本文件只有一个活库用例，避免 setup_test_db 清库互相干扰。

mod test_common;

use std::sync::Arc;

use chrono::{Duration, Utc};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, Set};
use serde_json::{Value, json};

use bingxi_backend::models::dto::bpm_dto::{AddSignRequest, StartProcessRequest};
use bingxi_backend::models::status::bpm_instance as instance_status;
use bingxi_backend::models::status::bpm_task as task_status;
use bingxi_backend::models::{
    bpm_process_definition, bpm_process_instance, bpm_task, notification, omni_audit_log, user,
};
use bingxi_backend::services::bpm_service::BpmService;
use bingxi_backend::services::bpm_timeout_scheduler::ApprovalTimeoutScheduler;
use sea_orm::DatabaseConnection;

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_millis()
        .expect("测试造数取当前时刻毫秒：Utc::now 必落在 chrono 毫秒可表示区间")
}

async fn seed_user(db: &DatabaseConnection, label: &str) -> i32 {
    let now = Utc::now();
    let name = format!("bpm-timeout-transfer-{label}-{}", unique_tag());
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

async fn seed_definition(db: &DatabaseConnection, code: &str, config: Value) -> i32 {
    let now = Utc::now();
    bpm_process_definition::ActiveModel {
        name: Set(format!("{code}-超时转交流程")),
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

fn start_req(code: &str, initiator_id: i32) -> StartProcessRequest {
    StartProcessRequest {
        process_key: code.to_string(),
        business_type: "quotation".to_string(),
        business_id: unique_tag(),
        title: "审批超时转交契约锁".to_string(),
        initiator_id,
        initiator_name: String::new(),
        initiator_department_id: None,
        priority: None,
        form_data: None,
        variables: None,
    }
}

fn single_config(approver_id: i32, fallback_id: i32) -> Value {
    json!({
        "nodes": [
            { "id": "start", "type": "start_event", "name": "开始" },
            {
                "id": "t1",
                "type": "user_task",
                "name": "审批",
                "assignee_value": approver_id.to_string(),
                "timeout": { "after_seconds": 3600, "transfer_to_user_id": fallback_id },
            },
            { "id": "end", "type": "end_event", "name": "结束" },
        ],
        "edges": [
            { "source": "start", "target": "t1" },
            { "source": "t1", "target": "end" },
        ],
    })
}

fn countersign_config(approvers: &[i32], fallback_id: i32) -> Value {
    json!({
        "nodes": [
            { "id": "start", "type": "start_event", "name": "开始" },
            {
                "id": "t1",
                "type": "user_task",
                "name": "会签",
                "assignee_ids": approvers,
                "timeout": { "after_seconds": 3600, "transfer_to_user_id": fallback_id },
            },
            { "id": "end", "type": "end_event", "name": "结束" },
        ],
        "edges": [
            { "source": "start", "target": "t1" },
            { "source": "t1", "target": "end" },
        ],
        "node_modes": { "t1": "countersign" },
    })
}

async fn start_single(
    db: &DatabaseConnection,
    svc: &BpmService,
    initiator_id: i32,
    approver_id: i32,
    fallback_id: i32,
) -> (i32, i32) {
    let code = format!("bpm_timeout_transfer_single_{}", unique_tag());
    seed_definition(db, &code, single_config(approver_id, fallback_id)).await;
    let started = svc
        .start_process(start_req(&code, initiator_id))
        .await
        .expect("合法超时转交配置必须允许发起");
    assert_eq!(started.task_ids.len(), 1);
    (started.instance_id, started.task_ids[0])
}

async fn task_by_id(db: &DatabaseConnection, task_id: i32) -> bpm_task::Model {
    bpm_task::Entity::find_by_id(task_id)
        .one(db)
        .await
        .unwrap()
        .unwrap_or_else(|| panic!("工单 {task_id} 必须存在"))
}

async fn set_due(db: &DatabaseConnection, task_id: i32, due_date: chrono::DateTime<Utc>) {
    let task = task_by_id(db, task_id).await;
    let mut active: bpm_task::ActiveModel = task.into();
    active.due_date = Set(Some(due_date));
    active.update(db).await.unwrap();
}

async fn set_status(db: &DatabaseConnection, task_id: i32, status: &str) {
    let task = task_by_id(db, task_id).await;
    let mut active: bpm_task::ActiveModel = task.into();
    active.status = Set(Some(status.to_string()));
    active.update(db).await.unwrap();
}

async fn audit_count(db: &DatabaseConnection, task_id: i32) -> u64 {
    omni_audit_log::Entity::find()
        .filter(omni_audit_log::Column::ResourceType.eq("bpm_task"))
        .filter(omni_audit_log::Column::ResourceId.eq(task_id.to_string()))
        .count(db)
        .await
        .unwrap()
}

#[tokio::test]
async fn due_tasks_transfer_once_with_audit_notification_and_signature_preservation() {
    let db = Arc::new(test_common::setup_test_db().await);
    let initiator = seed_user(&db, "initiator").await;
    let approver = seed_user(&db, "approver").await;
    let fallback = seed_user(&db, "fallback").await;
    let svc = BpmService::new(db.clone());
    let scheduler = ApprovalTimeoutScheduler::new(db.clone());

    let (_, due_task_id) = start_single(&db, &svc, initiator, approver, fallback).await;
    set_due(&db, due_task_id, Utc::now() - Duration::seconds(1)).await;
    let transferred = scheduler
        .transfer_due_tasks()
        .await
        .expect("到期待办必须成功转交");
    assert_eq!(transferred, 1, "首轮只应转交一枚到期待办");

    let due_task = task_by_id(&db, due_task_id).await;
    assert_eq!(due_task.status.as_deref(), Some(task_status::PENDING));
    assert_eq!(due_task.actual_handler_id, Some(fallback));
    assert!(
        due_task.due_date.is_none(),
        "转交后必须清空到期时间，保证幂等"
    );
    assert_eq!(
        due_task.task_variables.as_ref().unwrap()["timeout"]["transfer_count"],
        1
    );
    assert!(
        due_task
            .approval_opinion
            .as_deref()
            .unwrap()
            .contains("超时转交")
    );

    let audits = omni_audit_log::Entity::find()
        .filter(omni_audit_log::Column::ResourceType.eq("bpm_task"))
        .filter(omni_audit_log::Column::ResourceId.eq(due_task_id.to_string()))
        .all(&*db)
        .await
        .unwrap();
    let update_audit = audits
        .iter()
        .find(|audit| {
            audit
                .new_value
                .as_ref()
                .and_then(|v| v.get("actual_handler_id"))
                .and_then(Value::as_i64)
                == Some(fallback as i64)
        })
        .expect("必须存在转交更新审计");
    assert_eq!(
        update_audit
            .old_value
            .as_ref()
            .and_then(|v| v.get("actual_handler_id"))
            .and_then(Value::as_i64),
        Some(approver as i64)
    );
    assert!(
        update_audit
            .new_value
            .as_ref()
            .unwrap()
            .get("due_date")
            .unwrap()
            .is_null()
    );
    assert_eq!(
        update_audit.new_value.as_ref().unwrap()["task_variables"]["timeout"]["transfer_count"],
        1
    );

    let notices = notification::Entity::find()
        .filter(notification::Column::UserId.eq(fallback))
        .filter(
            notification::Column::DedupKey.eq(format!("bpm_task:{due_task_id}:pending:transfer:1")),
        )
        .all(&*db)
        .await
        .unwrap();
    assert_eq!(notices.len(), 1, "转交必须且只能通知新处理人一次");
    assert!(notices[0].content.contains("超时转交"));

    let audit_before = audit_count(&db, due_task_id).await;
    let transferred_again = scheduler
        .transfer_due_tasks()
        .await
        .expect("重复扫描不得报错");
    assert_eq!(transferred_again, 0, "重复扫描不得再次转交");
    assert_eq!(
        audit_count(&db, due_task_id).await,
        audit_before,
        "重复扫描不得新增审计"
    );

    let (_, future_task_id) = start_single(&db, &svc, initiator, approver, fallback).await;
    set_due(&db, future_task_id, Utc::now() + Duration::hours(1)).await;
    let (_, completed_task_id) = start_single(&db, &svc, initiator, approver, fallback).await;
    set_due(&db, completed_task_id, Utc::now() - Duration::seconds(1)).await;
    set_status(&db, completed_task_id, task_status::COMPLETED).await;
    let transferred_other = scheduler
        .transfer_due_tasks()
        .await
        .expect("未来与已完成任务不得影响扫描");
    assert_eq!(transferred_other, 0);
    assert_eq!(
        task_by_id(&db, future_task_id).await.actual_handler_id,
        Some(approver)
    );
    assert_eq!(
        task_by_id(&db, completed_task_id).await.actual_handler_id,
        Some(approver)
    );

    let second_approver = seed_user(&db, "second-approver").await;
    let code = format!("bpm_timeout_transfer_countersign_{}", unique_tag());
    seed_definition(
        &db,
        &code,
        countersign_config(&[approver, second_approver], fallback),
    )
    .await;
    let started = svc
        .start_process(start_req(&code, initiator))
        .await
        .expect("会签超时配置必须允许发起");
    assert_eq!(started.task_ids.len(), 2);
    let first_task_id = started.task_ids[0];
    let second_task_id = started.task_ids[1];
    let first_task = task_by_id(&db, first_task_id).await;
    let original_assignees = first_task.assignee_ids.clone();
    let add_signs = json!([{
        "actor_id": approver,
        "actor_name": "原审批人",
        "added_ids": [second_approver],
        "reason": "补充会签轨迹",
        "at": Utc::now().to_rfc3339(),
    }]);
    let mut first_active: bpm_task::ActiveModel = first_task.into();
    first_active.task_variables = Set(Some(json!({
        "sign_mode": "countersign",
        "signatures": [],
        "add_signs": add_signs,
        "timeout": {
            "after_seconds": 3600,
            "transfer_to_user_id": fallback,
            "transfer_count": 0,
        },
    })));
    first_active.update(&*db).await.unwrap();
    set_due(&db, first_task_id, Utc::now() - Duration::seconds(1)).await;
    let countersign_transferred = scheduler
        .transfer_due_tasks()
        .await
        .expect("会签到期任务必须转交");
    assert_eq!(countersign_transferred, 1);
    let first_after = task_by_id(&db, first_task_id).await;
    assert_eq!(first_after.actual_handler_id, Some(fallback));
    assert_eq!(
        first_after.assignee_ids, original_assignees,
        "会签完成条件依赖原签署人集合，转交不得改写"
    );
    assert_eq!(
        first_after.task_variables.as_ref().unwrap()["signatures"],
        json!([]),
        "转交不得清空既有签署轨迹"
    );
    assert_eq!(
        first_after.task_variables.as_ref().unwrap()["add_signs"],
        add_signs,
        "转交不得清空加签轨迹"
    );
    assert_eq!(
        first_after.task_variables.as_ref().unwrap()["delegated_from_user_id"],
        approver,
        "转交必须保留原签署席位，代理人的票才能计入会签完成条件"
    );

    svc.approve_task(
        ApproveTaskRequest {
            task_id: first_task_id,
            handler_id: fallback,
            handler_name: String::new(),
            action: "approve".to_string(),
            approval_opinion: Some("代理人代原签署席位同意".to_string()),
            attachment_urls: None,
        },
        Some(fallback),
    )
    .await
    .expect("超时转交后的代理人必须能够签署原席位");
    let instance = bpm_process_instance::Entity::find_by_id(first_after.instance_id)
        .one(&*db)
        .await
        .unwrap()
        .expect("会签实例必须存在");
    assert_eq!(
        instance.status.as_deref(),
        Some(instance_status::PROCESSING),
        "代理人计入原席位后仍应等待另一签署人，不得提前完成"
    );
    svc.approve_task(
        ApproveTaskRequest {
            task_id: second_task_id,
            handler_id: second_approver,
            handler_name: String::new(),
            action: "approve".to_string(),
            approval_opinion: Some("第二签署人同意".to_string()),
            attachment_urls: None,
        },
        Some(second_approver),
    )
    .await
    .expect("另一签署人同意后会签应完成");
    let instance = bpm_process_instance::Entity::find_by_id(first_after.instance_id)
        .one(&*db)
        .await
        .unwrap()
        .expect("会签实例必须存在");
    assert_eq!(instance.status.as_deref(), Some(instance_status::COMPLETED));

    let add_sign_code = format!("bpm_timeout_add_sign_{}", unique_tag());
    seed_definition(
        &db,
        &add_sign_code,
        countersign_config(&[approver], fallback),
    )
    .await;
    let add_sign_started = svc
        .start_process(start_req(&add_sign_code, initiator))
        .await
        .expect("带超时的会签节点必须允许加签");
    let add_sign_task_id = add_sign_started.task_ids[0];
    let original_due = task_by_id(&db, add_sign_task_id).await.due_date;
    svc.add_sign_task(
        AddSignRequest {
            task_id: add_sign_task_id,
            add_assignee_ids: vec![second_approver],
            reason: Some("验证加签工单继承节点截止时间".to_string()),
        },
        Some(approver),
    )
    .await
    .expect("会签任务加签必须成功");
    let add_sign_tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.eq(add_sign_started.instance_id))
        .all(&*db)
        .await
        .unwrap();
    assert_eq!(add_sign_tasks.len(), 2, "加签必须新增一枚同节点工单");
    for task in add_sign_tasks {
        assert_eq!(
            task.due_date, original_due,
            "加签工单必须继承节点统一的超时截止时间"
        );
        assert_eq!(
            task.task_variables.as_ref().unwrap()["timeout"]["transfer_count"],
            0
        );
        set_due(&db, task.id, Utc::now() - Duration::seconds(1)).await;
    }
    assert_eq!(
        scheduler
            .transfer_due_tasks()
            .await
            .expect("加签产生的到期待办也必须参与超时转交"),
        2,
        "原工单与加签工单都应各转交一次"
    );

    let manual_target = seed_user(&db, "manual-target").await;
    let (_, manual_task_id) = start_single(&db, &svc, initiator, approver, fallback).await;
    set_due(&db, manual_task_id, Utc::now() - Duration::seconds(1)).await;
    svc.transfer_task(manual_task_id, manual_target, "人工转办优先于超时")
        .await
        .expect("人工转办必须成功");
    let manual_task = task_by_id(&db, manual_task_id).await;
    assert_eq!(manual_task.actual_handler_id, Some(manual_target));
    assert!(
        manual_task.due_date.is_none(),
        "人工转办必须清除旧超时 deadline"
    );
    assert!(
        manual_task
            .actual_handler_name
            .as_deref()
            .is_some_and(|name| !name.trim().is_empty()),
        "人工转办必须落真实处理人姓名"
    );
    assert_eq!(
        scheduler
            .transfer_due_tasks()
            .await
            .expect("人工转办后的任务不得再被超时扫描转交"),
        0
    );
    assert_eq!(
        task_by_id(&db, manual_task_id).await.actual_handler_id,
        Some(manual_target),
        "超时调度器不得覆盖人工转办结果"
    );

    let inactive = seed_user(&db, "inactive").await;
    let (_, inactive_task_id) = start_single(&db, &svc, initiator, approver, inactive).await;
    set_due(&db, inactive_task_id, Utc::now() - Duration::seconds(1)).await;
    let mut inactive_active: user::ActiveModel = user::Entity::find_by_id(inactive)
        .one(&*db)
        .await
        .unwrap()
        .unwrap()
        .into();
    inactive_active.is_active = Set(false);
    inactive_active.update(&*db).await.unwrap();
    let inactive_result = scheduler.transfer_due_tasks().await;
    assert!(inactive_result.is_err(), "转交目标停用必须显式失败");
    let inactive_task = task_by_id(&db, inactive_task_id).await;
    assert_eq!(inactive_task.actual_handler_id, Some(approver));
    assert!(
        inactive_task.due_date.is_some(),
        "失败不得清空到期时间或留下半写状态"
    );

    let instances = bpm_process_instance::Entity::find()
        .filter(bpm_process_instance::Column::InitiatorId.eq(initiator))
        .count(&*db)
        .await
        .unwrap();
    assert!(instances >= 6, "测试必须真实创建多个流程实例覆盖各分支");
}
