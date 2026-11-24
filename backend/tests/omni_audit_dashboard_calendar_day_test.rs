//! 审计看板“今日”统计的数据库自然日边界回归。
//!
//! 调用方：CI backend job 的真实 PostgreSQL 集成测试。
//! 入参：数据库时区下今日零点、当前时刻、昨日近 24 小时及明日零点的审计探针行。
//! 传给谁：omni_audit_query_service::query_dashboard_stats 的生产统计查询。
//! 存什么/存哪里：探针只写在不提交的事务内，断言后整体回滚，不污染共享库。

mod test_common;

use bingxi_backend::services::omni_audit_query_service::query_dashboard_stats;
use sea_orm::{ConnectionTrait, Statement, TransactionTrait, Value};
use test_common::setup_test_db;

async fn insert_probe<C: ConnectionTrait>(
    conn: &C,
    marker: &str,
    created_at_sql: &str,
    request_method: Option<&str>,
    response_status: i32,
) {
    let sql = format!(
        "INSERT INTO omni_audit_logs (trace_id, request_method, response_status, created_at) \
         VALUES ($1, $2, $3, {created_at_sql})"
    );
    let values: Vec<Value> = vec![
        marker.to_string().into(),
        request_method.map(|value| value.to_string()).into(),
        response_status.into(),
    ];
    conn.execute_raw(Statement::from_sql_and_values(
        sea_orm::DbBackend::Postgres,
        sql,
        values,
    ))
    .await
    .unwrap_or_else(|e| panic!("插入审计看板探针 {marker} 失败：{e}"));
}

#[tokio::test]
async fn dashboard_today_metrics_use_database_calendar_day_boundaries() {
    let db = setup_test_db().await;
    let txn = db.begin().await.expect("开启审计看板探针事务失败");
    txn.execute_unprepared("SET LOCAL TIME ZONE 'Asia/Shanghai'")
        .await
        .expect("设置数据库会话时区失败");

    insert_probe(
        &txn,
        "today-start-ui",
        "date_trunc('day', CURRENT_TIMESTAMP)",
        None,
        200,
    )
    .await;
    insert_probe(&txn, "today-api", "CURRENT_TIMESTAMP", Some("GET"), 200).await;
    insert_probe(&txn, "today-alert", "CURRENT_TIMESTAMP", Some("POST"), 403).await;
    insert_probe(
        &txn,
        "yesterday-recent-ui",
        "date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '1 second'",
        None,
        200,
    )
    .await;
    insert_probe(
        &txn,
        "yesterday-recent-api-alert",
        "date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '1 second'",
        Some("GET"),
        500,
    )
    .await;
    insert_probe(
        &txn,
        "tomorrow-start-api",
        "date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '1 day'",
        Some("GET"),
        200,
    )
    .await;

    let stats = query_dashboard_stats(&txn)
        .await
        .expect("审计看板自然日统计查询失败");

    assert_eq!(stats.total_events_today, 3, "只统计今日零点至明日零点");
    assert_eq!(stats.ui_clicks_today, 1, "今日零点界面操作必须计入");
    assert_eq!(stats.api_calls_today, 2, "今日普通接口与告警接口均计入");
    assert_eq!(stats.security_alerts_today, 1, "只统计今日 403/5xx 告警");

    txn.rollback().await.expect("回滚审计看板探针事务失败");
}
