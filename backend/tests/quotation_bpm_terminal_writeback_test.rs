//! BPM 终审必须回写报价终态，撤回不得被误判为审批拒绝。

mod test_common;

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use serde_json::json;
use tokio::time::{Instant, sleep};

use bingxi_backend::models::dto::bpm_dto::{ApproveTaskRequest, StartProcessRequest};
use bingxi_backend::models::status::bpm_instance as instance_status;
use bingxi_backend::models::status::master_data;
use bingxi_backend::models::status::quotation as quotation_status;
use bingxi_backend::models::status::quotation_ext;
use bingxi_backend::models::{
    bpm_process_definition, bpm_process_instance, bpm_task, customer, sales_quotation, user,
};
use bingxi_backend::search::{ElasticClient, SearchClient};
use bingxi_backend::services::bpm_service::BpmService;
use bingxi_backend::services::event_bus::{shutdown_event_bus, start_event_listener};

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_nanos_opt()
        .expect("测试造数取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间，None 不可达")
}

async fn seed_user(db: &sea_orm::DatabaseConnection, role: &str) -> i32 {
    let now = Utc::now();
    let name = format!("quotation-terminal-{role}-{}", unique_tag());
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

async fn seed_customer(db: &sea_orm::DatabaseConnection, owner_id: i32) -> i32 {
    let now = Utc::now();
    customer::ActiveModel {
        customer_code: Set(format!("CUS-QT-{}", unique_tag())),
        customer_name: Set("报价终审回写契约锁客户".to_string()),
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

async fn seed_definition(db: &sea_orm::DatabaseConnection, code: &str, approver_id: i32) {
    let now = Utc::now();
    bpm_process_definition::ActiveModel {
        name: Set("报价终审回写契约锁流程".to_string()),
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
    .expect("种子报价审批流程定义插入失败");
}

async fn seed_pending_quotation(
    db: &sea_orm::DatabaseConnection,
    customer_id: i32,
    initiator_id: i32,
) -> sales_quotation::Model {
    let now = Utc::now();
    let today = now.date_naive();
    sales_quotation::ActiveModel {
        quotation_no: Set(format!("QT-TERMINAL-{}", unique_tag())),
        customer_id: Set(customer_id),
        sales_user_id: Set(initiator_id as i64),
        quotation_date: Set(today),
        valid_until: Set(today),
        price_terms: Set("FOB".to_string()),
        subtotal: Set(Decimal::from(300_000)),
        tax_amount: Set(Decimal::ZERO),
        total_amount: Set(Decimal::from(300_000)),
        status: Set(quotation_ext::PENDING_APPROVAL.to_string()),
        created_by: Set(initiator_id as i64),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("种子待审批报价插入失败")
}

async fn start_quotation_process(
    db: &Arc<sea_orm::DatabaseConnection>,
    code: &str,
    quotation: &sales_quotation::Model,
    initiator_id: i32,
) -> i32 {
    let started = BpmService::new(Arc::clone(db))
        .start_process(StartProcessRequest {
            process_key: code.to_string(),
            business_type: "quotation".to_string(),
            business_id: quotation.id,
            title: format!("报价终审回写契约锁-{}", quotation.quotation_no),
            initiator_id,
            initiator_name: String::new(),
            initiator_department_id: None,
            priority: None,
            form_data: None,
            variables: None,
        })
        .await
        .expect("发起报价审批流程失败");
    assert_eq!(started.task_ids.len(), 1, "报价审批只能有一条首任务");

    let mut active: sales_quotation::ActiveModel = quotation.clone().into();
    active.approval_instance_id = Set(Some(started.instance_id as i64));
    active.submitted_by = Set(Some(initiator_id as i64));
    active.updated_at = Set(Utc::now());
    active
        .update(db.as_ref())
        .await
        .expect("回写报价审批实例关联失败");
    started.task_ids[0]
}

fn task_request(task_id: i32, approver_id: i32, action: &str, opinion: &str) -> ApproveTaskRequest {
    ApproveTaskRequest {
        task_id,
        handler_id: approver_id,
        handler_name: String::new(),
        action: action.to_string(),
        approval_opinion: Some(opinion.to_string()),
        attachment_urls: None,
    }
}

async fn wait_for_quotation_status(
    db: &sea_orm::DatabaseConnection,
    quotation_id: i64,
    expected: &str,
) -> sales_quotation::Model {
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        let quotation = sales_quotation::Entity::find_by_id(quotation_id)
            .one(db)
            .await
            .expect("回读报价终态失败")
            .expect("报价行必须存在");
        if quotation.status == expected {
            return quotation;
        }
        assert!(
            Instant::now() < deadline,
            "BPM 终审后报价未进入 {expected}，实际状态={}",
            quotation.status
        );
        sleep(Duration::from_millis(20)).await;
    }
}

#[tokio::test]
async fn bpm_terminal_decision_writes_back_quotation_status_and_opinion() {
    let db = Arc::new(test_common::setup_test_db().await);
    let initiator = seed_user(&db, "initiator").await;
    let approver = seed_user(&db, "approver").await;
    let customer_id = seed_customer(&db, initiator).await;
    let code = format!("quotation_terminal_{}", unique_tag());
    seed_definition(&db, &code, approver).await;

    let approved_quotation = seed_pending_quotation(&db, customer_id, initiator).await;
    let rejected_quotation = seed_pending_quotation(&db, customer_id, initiator).await;
    let withdrawn_quotation = seed_pending_quotation(&db, customer_id, initiator).await;
    let approved_task = start_quotation_process(&db, &code, &approved_quotation, initiator).await;
    let rejected_task = start_quotation_process(&db, &code, &rejected_quotation, initiator).await;
    let withdrawn_task = start_quotation_process(&db, &code, &withdrawn_quotation, initiator).await;

    let search_client: Arc<dyn SearchClient> = Arc::new(ElasticClient::mock());
    start_event_listener(Arc::clone(&db), search_client).await;

    BpmService::new(Arc::clone(&db))
        .approve_task(
            task_request(approved_task, approver, "approve", "同意报价"),
            Some(approver),
        )
        .await
        .expect("BPM 批准任务失败");
    BpmService::new(Arc::clone(&db))
        .approve_task(
            task_request(rejected_task, approver, "reject", "价格需调整"),
            Some(approver),
        )
        .await
        .expect("BPM 拒绝任务失败");

    let approved =
        wait_for_quotation_status(&db, approved_quotation.id, quotation_status::APPROVED).await;
    let rejected =
        wait_for_quotation_status(&db, rejected_quotation.id, quotation_status::REJECTED).await;

    assert_eq!(approved.approved_by, Some(approver as i64));
    assert!(approved.approved_at.is_some(), "批准时间必须落库");
    assert_eq!(approved.approval_reason.as_deref(), Some("同意报价"));
    assert_eq!(rejected.approved_by, Some(approver as i64));
    assert!(rejected.approved_at.is_some(), "拒绝时间必须落库");
    assert_eq!(rejected.rejection_reason.as_deref(), Some("价格需调整"));

    let withdrawn_instance_id = bpm_task::Entity::find_by_id(withdrawn_task)
        .one(&*db)
        .await
        .expect("回读待撤回报价任务失败")
        .expect("待撤回报价任务必须存在")
        .instance_id;
    BpmService::new(Arc::clone(&db))
        .cancel_instance(
            withdrawn_instance_id,
            Some(initiator),
            Some("报价内容需调整".to_string()),
        )
        .await
        .expect("撤回报价审批失败");
    let withdrawn =
        wait_for_quotation_status(&db, withdrawn_quotation.id, quotation_status::DRAFT).await;

    assert_eq!(withdrawn.approval_instance_id, None);
    assert_eq!(withdrawn.submitted_by, None);
    assert_eq!(
        withdrawn.rejection_reason.as_deref(),
        Some("报价内容需调整")
    );

    let approved_instance = bpm_process_instance::Entity::find_by_id(
        approved
            .approval_instance_id
            .expect("批准报价必须保留实例关联") as i32,
    )
    .one(&*db)
    .await
    .expect("回读批准流程实例失败")
    .expect("批准流程实例必须存在");
    assert_eq!(
        approved_instance.status.as_deref(),
        Some(instance_status::COMPLETED)
    );
    let rejected_instance = bpm_process_instance::Entity::find_by_id(
        rejected
            .approval_instance_id
            .expect("拒绝报价必须保留实例关联") as i32,
    )
    .one(&*db)
    .await
    .expect("回读拒绝流程实例失败")
    .expect("拒绝流程实例必须存在");
    assert_eq!(
        rejected_instance.status.as_deref(),
        Some(instance_status::TERMINATED)
    );

    let tasks = bpm_task::Entity::find()
        .filter(bpm_task::Column::InstanceId.is_in([approved_instance.id, rejected_instance.id]))
        .order_by_asc(bpm_task::Column::Id)
        .all(&*db)
        .await
        .expect("回读终审任务失败");
    assert_eq!(tasks.len(), 2, "两张报价各应有一条终审任务");
    assert!(tasks.iter().any(|task| {
        task.instance_id == approved_instance.id
            && task.status.as_deref() == Some("completed")
            && task.approval_opinion.as_deref() == Some("同意报价")
    }));
    assert!(tasks.iter().any(|task| {
        task.instance_id == rejected_instance.id
            && task.status.as_deref() == Some("rejected")
            && task.approval_opinion.as_deref() == Some("价格需调整")
    }));
    shutdown_event_bus();
}
