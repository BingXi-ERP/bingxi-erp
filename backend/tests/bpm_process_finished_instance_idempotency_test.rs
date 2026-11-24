//! BPM 完成事件必须按流程实例幂等，同一业务单据的不同审批实例互不抑制。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::processed_event;
use bingxi_backend::search::{ElasticClient, SearchClient};
use bingxi_backend::services::event_bus_ops::listener::handle_bpm_process_finished;
use bingxi_backend::services::test_common::setup_test_db;
use chrono::Utc;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

fn unique_instance_id() -> i32 {
    let nanos = Utc::now()
        .timestamp_nanos_opt()
        .expect("测试取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间");
    (nanos.rem_euclid(2_000_000_000) as i32) + 1
}

#[tokio::test]
async fn bpm_finished_events_are_idempotent_per_instance() {
    let db = Arc::new(setup_test_db().await);
    let search_client: Arc<dyn SearchClient> = Arc::new(ElasticClient::mock());
    let business_type = "instance_idempotency_probe";
    let business_id = 9_001;
    let first_instance_id = unique_instance_id();
    let second_instance_id = first_instance_id + 1;

    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        first_instance_id,
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        second_instance_id,
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        first_instance_id,
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;

    let rows = processed_event::Entity::find()
        .filter(processed_event::Column::ConsumerId.eq("event_bus_main"))
        .filter(processed_event::Column::EventType.eq("BpmProcessFinished"))
        .order_by_asc(processed_event::Column::EventKey)
        .all(&*db)
        .await
        .expect("回读 BPM 完成事件幂等记录失败");

    assert_eq!(
        rows.len(),
        2,
        "同一业务单据的两个审批实例必须各处理一次，同实例重投不得新增记录"
    );
    assert_ne!(
        rows[0].event_key, rows[1].event_key,
        "不同审批实例必须生成不同幂等键"
    );
    let expected_keys = [
        format!("bpm:instance:{first_instance_id}:finished"),
        format!("bpm:instance:{second_instance_id}:finished"),
    ];
    assert_eq!(
        rows.iter()
            .map(|row| row.event_key.as_str())
            .collect::<std::collections::BTreeSet<_>>(),
        expected_keys
            .iter()
            .map(String::as_str)
            .collect::<std::collections::BTreeSet<_>>(),
        "幂等键必须且只能按两个流程实例分别生成"
    );
    assert!(
        rows.iter().all(
            |row| row.consumer_id == "event_bus_main" && row.event_type == "BpmProcessFinished"
        ),
        "幂等记录必须属于 BPM 完成事件的主消费者"
    );
}
