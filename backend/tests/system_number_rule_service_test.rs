//! 编码规则管理服务的真实 PostgreSQL 回归。
//!
//! 功能 验证种子规则读取、乐观锁更新、过期版本拒绝、历史回滚、审计同事务与取号器即时生效。
//! 调用方 集成测试 crate；CI 在已迁移 PostgreSQL 上执行。
//! 入参 `setup_test_db` 提供的真实连接；测试只修改专用规则并在断言前恢复初始配置。
//! 传给谁 `SystemNumberRuleService`、`DocumentNumberGenerator` 与真实审计表。
//! 存什么 规则新版本与追加历史；历史不删除，当前配置恢复原值。
//! 存哪里 PostgreSQL `system_number_rules`、`system_number_rule_revisions`、`audit_logs`。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::{audit_log, system_number_rule, system_number_rule_revision};
use bingxi_backend::services::system_number_rule_dto::{
    RollbackNumberRuleRequest, UpdateNumberRuleRequest,
};
use bingxi_backend::services::system_number_rule_service::SystemNumberRuleService;
use bingxi_backend::utils::error::AppError;
use bingxi_backend::utils::number_generator::DocumentNumberGenerator;
use chrono::{TimeZone, Utc};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, Set,
    TransactionTrait,
};

#[tokio::test]
async fn update_conflict_rollback_audit_and_generator_are_consistent() {
    let db = Arc::new(test_common::setup_test_db().await);
    let service = SystemNumberRuleService::new(db.clone());

    let page = service.list(1, 100).await.expect("读取规则列表失败");
    for key in ["SO", "PO", "QT", "PR", "DN", "LD"] {
        assert!(
            page.items.iter().any(|rule| rule.rule_key == key),
            "迁移必须播种 {key} 规则"
        );
    }

    let rule_key = format!("NRSVC{}", Utc::now().timestamp_millis());
    let now = Utc::now();
    let seeded = system_number_rule::ActiveModel {
        rule_key: Set(rule_key.clone()),
        name: Set("编码规则服务回归专用规则".to_string()),
        prefix: Set("NX".to_string()),
        seq_width: Set(5),
        reset_mode: Set("month".to_string()),
        version: Set(1),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db.as_ref())
    .await
    .expect("创建服务回归专用规则失败");
    system_number_rule_revision::ActiveModel {
        rule_id: Set(seeded.id),
        version: Set(1),
        config: Set(serde_json::json!({
            "prefix": "NX",
            "seq_width": 5,
            "reset_mode": "month"
        })),
        change_reason: Set("初始化服务回归专用规则".to_string()),
        changed_by: Set(0),
        created_at: Set(now),
        ..Default::default()
    }
    .insert(db.as_ref())
    .await
    .expect("创建服务回归专用规则初始快照失败");

    let initial = service.get(seeded.id).await.expect("读取专用规则失败");
    let rule_id = initial.rule.id;
    let initial_revision_id = initial
        .revisions
        .iter()
        .find(|revision| revision.version == initial.rule.version)
        .map(|revision| revision.id)
        .expect("当前版本必须有对应历史快照");
    let audit_before = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceType.eq("system_number_rules"))
        .filter(audit_log::Column::ResourceId.eq(rule_id.to_string()))
        .count(db.as_ref())
        .await
        .expect("读取更新前审计计数失败");

    let changed_prefix = if initial.rule.prefix == "NX" {
        "NY"
    } else {
        "NX"
    };
    let changed_width = if initial.rule.seq_width == 5 { 6 } else { 5 };
    let changed_mode = if initial.rule.reset_mode == "month" {
        "never"
    } else {
        "month"
    };
    let updated = service
        .update(
            rule_id,
            UpdateNumberRuleRequest {
                prefix: changed_prefix.to_string(),
                seq_width: changed_width,
                reset_mode: changed_mode.to_string(),
                version: initial.rule.version,
                change_reason: "验证规则更新与回滚".to_string(),
            },
            0,
        )
        .await
        .expect("更新规则失败");
    assert_eq!(updated.rule.version, initial.rule.version + 1);
    assert_eq!(updated.rule.prefix, changed_prefix);
    assert_eq!(updated.rule.seq_width, changed_width);
    assert_eq!(updated.rule.reset_mode, changed_mode);
    assert_eq!(updated.revisions[0].version, updated.rule.version);
    assert_eq!(updated.revisions[0].change_reason, "验证规则更新与回滚");

    let stale = service
        .update(
            rule_id,
            UpdateNumberRuleRequest {
                prefix: "STALE".to_string(),
                seq_width: 3,
                reset_mode: "day".to_string(),
                version: initial.rule.version,
                change_reason: "过期版本必须被拒绝".to_string(),
            },
            0,
        )
        .await
        .expect_err("过期版本不得覆盖新规则");
    assert!(matches!(stale, AppError::BusinessErrorDisplayable(_)));

    let restored = service
        .rollback(
            rule_id,
            RollbackNumberRuleRequest {
                revision_id: initial_revision_id,
                version: updated.rule.version,
                change_reason: "恢复测试前配置".to_string(),
            },
            0,
        )
        .await
        .expect("回滚专用规则失败");

    assert_eq!(restored.rule.version, initial.rule.version + 2);
    assert_eq!(restored.rule.prefix, initial.rule.prefix);
    assert_eq!(restored.rule.seq_width, initial.rule.seq_width);
    assert_eq!(restored.rule.reset_mode, initial.rule.reset_mode);
    assert_eq!(restored.revisions[0].version, restored.rule.version);
    assert_eq!(restored.revisions[0].change_reason, "恢复测试前配置");
    assert!(
        restored
            .revisions
            .iter()
            .any(|revision| revision.id == initial_revision_id)
    );

    let audit_after = audit_log::Entity::find()
        .filter(audit_log::Column::ResourceType.eq("system_number_rules"))
        .filter(audit_log::Column::ResourceId.eq(rule_id.to_string()))
        .count(db.as_ref())
        .await
        .expect("读取更新后审计计数失败");
    assert_eq!(
        audit_after,
        audit_before + 2,
        "更新与回滚各写一条审计，过期请求不写"
    );

    let now = Utc.with_ymd_and_hms(2026, 11, 26, 12, 0, 0).unwrap();
    let resolved = DocumentNumberGenerator::resolve_rule(db.as_ref(), &rule_key, 3, now)
        .await
        .expect("取号器必须即时读取恢复后的专用规则");
    let expected_period = match initial.rule.reset_mode.as_str() {
        "day" => "20261126".to_string(),
        "month" => "202611".to_string(),
        "never" => String::new(),
        other => panic!("测试前规则周期非法: {other}"),
    };
    assert_eq!(
        resolved.output_prefix,
        format!("{}{expected_period}", initial.rule.prefix)
    );
    assert_eq!(resolved.period, expected_period);
    assert_eq!(resolved.seq_width, initial.rule.seq_width as usize);

    let missing = system_number_rule::Entity::find_by_id(i32::MAX)
        .one(db.as_ref())
        .await
        .expect("查询不存在规则失败");
    assert!(missing.is_none());

    let cleanup_txn = db.begin().await.expect("开启专用规则测试清理事务失败");
    cleanup_txn
        .execute_unprepared("SET LOCAL app.audit_purge = 'on'")
        .await
        .expect("声明专用规则测试审计清理通道失败");
    audit_log::Entity::delete_many()
        .filter(audit_log::Column::ResourceType.eq("system_number_rules"))
        .filter(audit_log::Column::ResourceId.eq(rule_id.to_string()))
        .exec(&cleanup_txn)
        .await
        .expect("清理专用规则测试审计失败");
    cleanup_txn
        .commit()
        .await
        .expect("提交专用规则测试清理事务失败");
    system_number_rule::Entity::delete_by_id(rule_id)
        .exec(db.as_ref())
        .await
        .expect("清理专用规则及级联快照失败");
}
