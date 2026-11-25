//! 审计看板“今日”指标的滚动二十四小时边界回归。
//!
//! 调用方：CI backend job 的真实 PostgreSQL 集成测试。
//! 入参：滚动窗口下界、下界前一微秒、当前时刻、未来一微秒及窗口外告警探针。
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

async fn assert_rolling_window<C: ConnectionTrait>(conn: &C) {
    let stats = query_dashboard_stats(conn)
        .await
        .expect("审计看板滚动二十四小时统计查询失败");

    assert_eq!(stats.total_events_today, 4, "只统计滚动窗口内四条探针");
    assert_eq!(stats.ui_clicks_today, 1, "滚动窗口下界界面操作必须计入");
    assert_eq!(
        stats.api_calls_today, 3,
        "当前时刻普通接口与两类告警接口均计入"
    );
    assert_eq!(
        stats.security_alerts_today, 2,
        "滚动窗口内 403 与 500 告警均计入"
    );
}

#[tokio::test]
async fn dashboard_today_metrics_use_rolling_twenty_four_hour_boundaries() {
    let db = setup_test_db().await;
    let txn = db.begin().await.expect("开启审计看板探针事务失败");
    txn.execute_unprepared("SET LOCAL TIME ZONE 'Asia/Shanghai'")
        .await
        .expect("设置数据库会话时区失败");

    insert_probe(
        &txn,
        "rolling-lower-ui",
        "NOW() - INTERVAL '24 hours'",
        None,
        200,
    )
    .await;
    insert_probe(
        &txn,
        "before-lower-ui",
        "NOW() - INTERVAL '24 hours' - INTERVAL '1 microsecond'",
        None,
        200,
    )
    .await;
    insert_probe(&txn, "rolling-now-api", "NOW()", Some("GET"), 200).await;
    insert_probe(&txn, "rolling-now-alert", "NOW()", Some("POST"), 403).await;
    insert_probe(&txn, "rolling-now-server-error", "NOW()", Some("GET"), 500).await;
    insert_probe(
        &txn,
        "before-lower-alert",
        "NOW() - INTERVAL '24 hours' - INTERVAL '1 microsecond'",
        Some("GET"),
        500,
    )
    .await;
    insert_probe(
        &txn,
        "future-api",
        "NOW() + INTERVAL '1 microsecond'",
        Some("GET"),
        200,
    )
    .await;

    assert_rolling_window(&txn).await;

    txn.execute_unprepared("SET LOCAL TIME ZONE 'UTC'")
        .await
        .expect("切换数据库会话时区失败");
    assert_rolling_window(&txn).await;

    txn.rollback().await.expect("回滚审计看板探针事务失败");
}
