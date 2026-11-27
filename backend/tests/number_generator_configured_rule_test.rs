//! 可配置编码规则的 PostgreSQL 真实取号回归。
//!
//! 功能 验证日/月/永久重置、前缀与流水宽度变更、跨周期计数隔离、切回原配置续号、
//!   并发唯一以及外层事务回滚后号位复用；所有单号都写入真实 customers 唯一列。
//! 调用方 集成测试 crate；CI 在已迁移 PostgreSQL 上执行。
//! 入参 测试夹具清空后的真实数据库与唯一测试规则键；不修改迁移播种的共享规则。
//! 传给谁 `SystemNumberRuleService`、`DocumentNumberGenerator` 与真实客户表。
//! 存什么 专用规则及追加版本、持久化号段计数和带唯一单号的测试客户。
//! 存哪里 PostgreSQL `system_number_rules`、`system_number_rule_revisions`、
//!   `system_number_sequences`、`customers`、`audit_logs`；断言后按测试前缀清理。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::{
    audit_log, customer, system_number_rule, system_number_rule_revision,
};
use bingxi_backend::services::system_number_rule_dto::{
    RollbackNumberRuleRequest, UpdateNumberRuleRequest,
};
use bingxi_backend::services::system_number_rule_service::SystemNumberRuleService;
use bingxi_backend::utils::number_generator::DocumentNumberGenerator;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    Set, TransactionTrait,
};

async fn seed_rule(db: &DatabaseConnection, rule_key: &str) -> (system_number_rule::Model, i32) {
    let now = Utc::now();
    let rule = system_number_rule::ActiveModel {
        rule_key: Set(rule_key.to_string()),
        name: Set("取号器周期回归专用规则".to_string()),
        prefix: Set(rule_key.to_string()),
        seq_width: Set(3),
        reset_mode: Set("day".to_string()),
        version: Set(1),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("创建测试编码规则失败");
    let revision = system_number_rule_revision::ActiveModel {
        rule_id: Set(rule.id),
        version: Set(1),
        config: Set(serde_json::json!({
            "prefix": rule_key,
            "seq_width": 3,
            "reset_mode": "day"
        })),
        change_reason: Set("初始化取号回归规则".to_string()),
        changed_by: Set(0),
        created_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("创建测试编码规则初始快照失败");
    (rule, revision.id)
}

async fn update_rule(
    service: &SystemNumberRuleService,
    rule_id: i32,
    version: i32,
    prefix: &str,
    seq_width: i32,
    reset_mode: &str,
) -> system_number_rule::Model {
    service
        .update(
            rule_id,
            UpdateNumberRuleRequest {
                prefix: prefix.to_string(),
                seq_width,
                reset_mode: reset_mode.to_string(),
                version,
                change_reason: "验证取号器即时应用新配置".to_string(),
            },
            0,
        )
        .await
        .expect("更新测试编码规则失败")
        .rule
}

async fn allocate_and_insert(db: &DatabaseConnection, rule_key: &str) -> customer::Model {
    let customer_code = DocumentNumberGenerator::generate_no(
        db,
        rule_key,
        customer::Entity,
        customer::Column::CustomerCode,
    )
    .await
    .expect("真实取号失败");
    let now = Utc::now();
    customer::ActiveModel {
        customer_code: Set(customer_code),
        customer_name: Set("编码规则真实取号回归客户".to_string()),
        credit_limit: Set(rust_decimal::Decimal::new(50_000, 0)),
        payment_terms: Set(30),
        status: Set(bingxi_backend::models::status::master_data::ACTIVE.to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("取号结果写入真实客户唯一列失败")
}

async fn cleanup(db: &DatabaseConnection, rule_id: i32, rule_key: &str) {
    let txn = db.begin().await.expect("开启编码规则测试清理事务失败");
    txn.execute_unprepared("SET LOCAL app.audit_purge = 'on'")
        .await
        .expect("声明编码规则测试审计清理通道失败");
    audit_log::Entity::delete_many()
        .filter(audit_log::Column::ResourceType.eq("system_number_rules"))
        .filter(audit_log::Column::ResourceId.eq(rule_id.to_string()))
        .exec(&txn)
        .await
        .expect("清理编码规则测试审计失败");
    txn.commit().await.expect("提交编码规则测试清理事务失败");
    customer::Entity::delete_many()
        .filter(customer::Column::CustomerCode.starts_with(rule_key))
        .exec(db)
        .await
        .expect("清理编码规则测试客户失败");
    system_number_rule::Entity::delete_by_id(rule_id)
        .exec(db)
        .await
        .expect("清理测试编码规则及级联快照失败");
}

#[tokio::test]
async fn configured_rule_allocates_unique_numbers_across_periods_and_concurrent_callers() {
    let db = Arc::new(test_common::setup_test_db().await);
    let service = SystemNumberRuleService::new(db.clone());
    let nonce = Utc::now().timestamp_millis();
    let rule_key = format!("NR{nonce}");
    let (mut rule, initial_revision_id) = seed_rule(db.as_ref(), &rule_key).await;

    let day_first = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    let day_second = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert!(day_first.starts_with(&rule_key));
    assert!(day_second.starts_with(&rule_key));
    assert!(
        day_first.ends_with("001"),
        "日重置首号应为 001: {day_first}"
    );
    assert!(
        day_second.ends_with("002"),
        "日重置次号应为 002: {day_second}"
    );
    assert_eq!(day_first.len(), rule_key.len() + 8 + 3);

    rule = update_rule(&service, rule.id, rule.version, &rule_key, 5, "month").await;
    let month_first = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert!(month_first.starts_with(&rule_key));
    assert!(
        month_first.ends_with("00001"),
        "月重置首号必须从 1 起: {month_first}"
    );
    assert_eq!(month_first.len(), rule_key.len() + 6 + 5);

    let month_prefix = format!("{rule_key}M");
    rule = update_rule(&service, rule.id, rule.version, &month_prefix, 5, "month").await;
    let changed_prefix_no = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert!(changed_prefix_no.starts_with(&month_prefix));
    assert!(changed_prefix_no.ends_with("00001"));
    assert_eq!(changed_prefix_no.len(), month_prefix.len() + 6 + 5);

    rule = update_rule(&service, rule.id, rule.version, &rule_key, 4, "never").await;
    let never_first = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    let never_second = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert_eq!(never_first, format!("{rule_key}0001"));
    assert_eq!(never_second, format!("{rule_key}0002"));

    rule = update_rule(&service, rule.id, rule.version, &rule_key, 3, "day").await;
    let day_resumed = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert!(day_resumed.starts_with(&rule_key));
    assert!(
        day_resumed.ends_with("003"),
        "切回日重置必须续用原号段: {day_resumed}"
    );

    rule = update_rule(&service, rule.id, rule.version, &rule_key, 5, "never").await;
    let mut tasks = Vec::new();
    for _ in 0..8 {
        let db = db.clone();
        let rule_key = rule_key.clone();
        tasks.push(tokio::spawn(async move {
            allocate_and_insert(db.as_ref(), &rule_key).await
        }));
    }
    let mut concurrent_numbers = Vec::new();
    for task in tasks {
        concurrent_numbers.push(task.await.expect("并发取号任务不得 panic").customer_code);
    }
    concurrent_numbers.sort();
    let expected = (3..=10)
        .map(|seq| format!("{rule_key}{seq:05}"))
        .collect::<Vec<_>>();
    assert_eq!(concurrent_numbers, expected, "并发取号必须连续且无跳号");
    assert_eq!(
        concurrent_numbers
            .iter()
            .collect::<std::collections::HashSet<_>>()
            .len(),
        8,
        "并发单号不得重复"
    );

    let txn = db.begin().await.expect("开启回滚取号事务失败");
    let rolled_back = DocumentNumberGenerator::generate_no(
        &txn,
        &rule_key,
        customer::Entity,
        customer::Column::CustomerCode,
    )
    .await
    .expect("事务内取号失败");
    txn.rollback().await.expect("回滚取号事务失败");
    let txn = db.begin().await.expect("开启复用取号事务失败");
    let reused = DocumentNumberGenerator::generate_no(
        &txn,
        &rule_key,
        customer::Entity,
        customer::Column::CustomerCode,
    )
    .await
    .expect("回滚后重新取号失败");
    txn.rollback().await.expect("回滚复用取号事务失败");
    assert_eq!(rolled_back, format!("{rule_key}00011"));
    assert_eq!(reused, rolled_back, "外层事务回滚必须撤销号段计数");

    let rolled_back_rule = service
        .rollback(
            rule.id,
            RollbackNumberRuleRequest {
                revision_id: initial_revision_id,
                version: rule.version,
                change_reason: "恢复初始日重置规则并验证续号".to_string(),
            },
            0,
        )
        .await
        .expect("回滚测试编码规则失败");
    assert_eq!(rolled_back_rule.rule.version, rule.version + 1);
    let after_rollback = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert!(after_rollback.starts_with(&rule_key));
    assert!(
        after_rollback.ends_with("004"),
        "配置回滚后必须恢复原日号段: {after_rollback}"
    );

    let unchanged = customer::Entity::find()
        .filter(customer::Column::CustomerCode.eq(day_first.clone()))
        .one(db.as_ref())
        .await
        .expect("回读历史单号失败")
        .expect("历史单号必须保留");
    assert_eq!(unchanged.customer_code, day_first);

    cleanup(db.as_ref(), rule.id, &rule_key).await;
}

#[tokio::test]
async fn configured_rule_never_fills_gap_below_historical_max() {
    let db = Arc::new(test_common::setup_test_db().await);
    let service = SystemNumberRuleService::new(db.clone());
    let nonce = Utc::now().timestamp_millis();
    let rule_key = format!("NRG{nonce}");
    let (mut rule, _) = seed_rule(db.as_ref(), &rule_key).await;
    rule = update_rule(&service, rule.id, rule.version, &rule_key, 4, "day").await;
    let today = Utc::now().format("%Y%m%d").to_string();
    let historical_code = format!("{rule_key}{today}0009");
    let now = Utc::now();
    customer::ActiveModel {
        customer_code: Set(historical_code.clone()),
        customer_name: Set("编码规则历史高位单号".to_string()),
        credit_limit: Set(rust_decimal::Decimal::ZERO),
        payment_terms: Set(30),
        status: Set(bingxi_backend::models::status::master_data::ACTIVE.to_string()),
        customer_type: Set("retail".to_string()),
        owner_id: Set(0),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db.as_ref())
    .await
    .expect("写入历史高位单号失败");

    let next = allocate_and_insert(db.as_ref(), &rule_key)
        .await
        .customer_code;
    assert_eq!(
        next,
        format!("{rule_key}{today}0010"),
        "历史最大流水为 9 时不得回填 1..8 的空洞"
    );

    cleanup(db.as_ref(), rule.id, &rule_key).await;
}
