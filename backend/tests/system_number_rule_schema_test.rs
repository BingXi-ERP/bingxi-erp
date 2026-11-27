//! 编码规则表、版本快照与 append-only 触发器的真实 PostgreSQL 回归。
//!
//! SQL 常量从 migration crate 同源导出，避免测试侧另抄 DDL；本用例显式 `#[ignore]`，由
//! `ci-test-rust-ignored` 在已迁移 PostgreSQL 上执行。所有 DDL 与写入均包在
//! 外层事务中，结束统一回滚，不污染共用测试库。

mod test_common;

use migration::domain::system_number_rules::{UP_SCHEMA_SQL, UP_SEED_SQL, UP_TRIGGER_SQL};

use sea_orm::{
    ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, QueryResult, Statement,
    TransactionTrait,
};

async fn require_postgres(db: &DatabaseConnection) {
    let url = std::env::var("TEST_DATABASE_URL");
    assert!(
        matches!(&url, Ok(value) if value.starts_with("postgres")),
        "编码规则 schema 回归必须使用真实 PostgreSQL，当前 TEST_DATABASE_URL={url:?}"
    );
    assert_eq!(db.get_database_backend(), DbBackend::Postgres);
}

async fn exec(txn: &DatabaseTransaction, sql: &str) {
    txn.execute_unprepared(sql)
        .await
        .unwrap_or_else(|error| panic!("编码规则 SQL 执行失败: {error}\nSQL: {sql}"));
}

async fn scalar(txn: &DatabaseTransaction, sql: &str) -> i64 {
    let row: Option<QueryResult> = txn
        .query_one_raw(Statement::from_string(DbBackend::Postgres, sql.to_string()))
        .await
        .expect("编码规则标量查询失败");
    row.and_then(|row| {
        row.try_get_by_index::<i64>(0)
            .or_else(|_| row.try_get_by_index::<i32>(0).map(i64::from))
            .ok()
    })
    .unwrap_or_else(|| panic!("编码规则标量查询未返回整数: {sql}"))
}

async fn expect_rejected(txn: &DatabaseTransaction, sql: &str, expected: &str) {
    let savepoint = txn.begin().await.expect("创建约束负例保存点失败");
    let result = savepoint.execute_unprepared(sql).await;
    assert!(result.is_err(), "数据库应拒绝非法写入: {sql}");
    let message = format!("{}", result.unwrap_err());
    assert!(
        message.contains(expected),
        "拒绝原因应包含 {expected}，实际: {message}"
    );
    savepoint.rollback().await.expect("回滚约束负例保存点失败");
}

#[tokio::test]
#[ignore = "需真实已迁移 PostgreSQL（TEST_DATABASE_URL），由 ci-test-rust-ignored 选中"]
async fn system_number_rule_schema_constraints_and_replay_are_enforced() {
    let db = test_common::connect_live_db().await;
    require_postgres(&db).await;
    let txn = db.begin().await.expect("开启编码规则 schema 回归事务失败");

    exec(&txn, UP_SCHEMA_SQL).await;
    exec(&txn, UP_TRIGGER_SQL).await;
    exec(&txn, UP_SEED_SQL).await;
    exec(&txn, UP_SCHEMA_SQL).await;
    exec(&txn, UP_TRIGGER_SQL).await;
    exec(&txn, UP_SEED_SQL).await;

    for key in ["SO", "PO", "QT", "PR", "DN", "LD"] {
        assert_eq!(
            scalar(
                &txn,
                &format!("SELECT COUNT(*) FROM system_number_rules WHERE rule_key = '{key}'"),
            )
            .await,
            1,
            "迁移重放不得重复播种 {key}"
        );
    }

    exec(
        &txn,
        "INSERT INTO system_number_rules (rule_key, name, prefix, seq_width, reset_mode) VALUES \
         ('SCHEMA_DAY', '日重置', 'DAY', 1, 'day'), \
         ('SCHEMA_MONTH', '月重置', 'MONTH', 12, 'month'), \
         ('SCHEMA_NEVER', '永不重置', 'NEVER', 6, 'never')",
    )
    .await;
    assert_eq!(
        scalar(
            &txn,
            "SELECT COUNT(*) FROM system_number_rules WHERE rule_key LIKE 'SCHEMA_%'"
        )
        .await,
        3,
        "三种 reset_mode 必须均可写入"
    );

    expect_rejected(
        &txn,
        "INSERT INTO system_number_rules (rule_key, name, prefix, seq_width, reset_mode) VALUES ('SO', '重复键', 'DUP', 3, 'day')",
        "system_number_rules_rule_key_key",
    )
    .await;
    for width in [0, 13] {
        expect_rejected(
            &txn,
            &format!(
                "INSERT INTO system_number_rules (rule_key, name, prefix, seq_width, reset_mode) VALUES ('SCHEMA_WIDTH_{width}', '非法位数', 'W', {width}, 'day')"
            ),
            "system_number_rules_seq_width_check",
        )
        .await;
    }
    expect_rejected(
        &txn,
        "INSERT INTO system_number_rules (rule_key, name, prefix, seq_width, reset_mode) VALUES ('SCHEMA_BAD_MODE', '非法周期', 'M', 3, 'year')",
        "system_number_rules_reset_mode_check",
    )
    .await;
    expect_rejected(
        &txn,
        "INSERT INTO system_number_rules (rule_key, name, prefix, seq_width, reset_mode) VALUES ('SCHEMA_EMPTY', '空前缀', '   ', 3, 'day')",
        "system_number_rules_prefix_check",
    )
    .await;

    let rule_id = scalar(
        &txn,
        "SELECT id FROM system_number_rules WHERE rule_key = 'SO'",
    )
    .await;
    expect_rejected(
        &txn,
        &format!(
            "INSERT INTO system_number_rule_revisions (rule_id, version, config, change_reason, changed_by) VALUES ({rule_id}, 1, '{{}}', '重复版本', 1)"
        ),
        "system_number_rule_revisions_rule_id_version_key",
    )
    .await;
    exec(
        &txn,
        "INSERT INTO system_number_sequences (rule_key, entity_table, column_name, output_prefix, period, last_seq) \
         VALUES ('SO', 'sales_orders', 'order_no', 'SO202611', '202611', 7)",
    )
    .await;
    assert_eq!(
        scalar(
            &txn,
            "SELECT last_seq FROM system_number_sequences WHERE rule_key = 'SO' AND entity_table = 'sales_orders' AND output_prefix = 'SO202611'"
        )
        .await,
        7,
        "号段计数必须持久化并可回读"
    );
    expect_rejected(
        &txn,
        "INSERT INTO system_number_sequences (rule_key, entity_table, column_name, output_prefix, period, last_seq) \
         VALUES ('SO', 'sales_orders', 'order_no', 'SO202611', '202611', 8)",
        "uq_system_number_sequences_namespace",
    )
    .await;
    expect_rejected(
        &txn,
        "INSERT INTO system_number_sequences (rule_key, entity_table, column_name, output_prefix, period, last_seq) \
         VALUES ('SO', 'sales_orders', 'order_no', 'SO202611', '202611', -1)",
        "system_number_sequences_last_seq_check",
    )
    .await;
    expect_rejected(
        &txn,
        &format!(
            "UPDATE system_number_rule_revisions SET change_reason = '篡改历史' WHERE rule_id = {rule_id} AND version = 1"
        ),
        "system_number_rule_revisions is append-only",
    )
    .await;
    expect_rejected(
        &txn,
        &format!(
            "DELETE FROM system_number_rule_revisions WHERE rule_id = {rule_id} AND version = 1"
        ),
        "system_number_rule_revisions is append-only",
    )
    .await;

    let cascade_rule_id = scalar(
        &txn,
        "SELECT id FROM system_number_rules WHERE rule_key = 'SCHEMA_DAY'",
    )
    .await;
    exec(
        &txn,
        &format!(
            "INSERT INTO system_number_rule_revisions (rule_id, version, config, change_reason, changed_by) \
             VALUES ({cascade_rule_id}, 1, '{{}}', '级联清理回归', 1)"
        ),
    )
    .await;
    exec(
        &txn,
        &format!("DELETE FROM system_number_rules WHERE id = {cascade_rule_id}"),
    )
    .await;
    assert_eq!(
        scalar(
            &txn,
            &format!(
                "SELECT COUNT(*) FROM system_number_rule_revisions WHERE rule_id = {cascade_rule_id}"
            ),
        )
        .await,
        0,
        "父规则删除必须允许 ON DELETE CASCADE 清理快照"
    );

    txn.rollback()
        .await
        .expect("回滚编码规则 schema 回归事务失败");
}
