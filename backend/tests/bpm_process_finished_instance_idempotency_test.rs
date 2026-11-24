//! BPM 完成事件必须按流程实例幂等，同一业务单据的不同审批实例互不抑制。

mod test_common;

use std::sync::Arc;

use bingxi_backend::models::event_dead_letter;
use bingxi_backend::models::status::bpm_instance as instance_status;
use bingxi_backend::models::{bpm_process_definition, bpm_process_instance, processed_event};
use bingxi_backend::search::{ElasticClient, SearchClient};
use bingxi_backend::services::event_bus_ops::listener::handle_bpm_process_finished;
use bingxi_backend::services::test_common::setup_test_db;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};

fn unique_tag() -> i64 {
    Utc::now()
        .timestamp_nanos_opt()
        .expect("测试取当前时刻纳秒：Utc::now 必落在 chrono 纳秒可表示区间")
}

fn unique_instance_id() -> i32 {
    (unique_tag().rem_euclid(2_000_000_000) as i32) + 1
}

async fn seed_definition(db: &DatabaseConnection) -> i32 {
    let now = Utc::now();
    bpm_process_definition::ActiveModel {
        name: Set("BPM 历史载荷解析测试流程".to_string()),
        code: Set(format!("bpm-legacy-payload-{}", unique_tag())),
        status: Set("ACTIVE".to_string()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("测试流程定义插入失败")
    .id
}

async fn seed_instance(
    db: &DatabaseConnection,
    definition_id: i32,
    business_type: &str,
    business_id: i64,
    status: &str,
) -> i32 {
    let now = Utc::now();
    bpm_process_instance::ActiveModel {
        instance_no: Set(format!("BPI-LEGACY-{}", unique_tag())),
        process_definition_id: Set(definition_id),
        business_type: Set(business_type.to_string()),
        business_id: Set(Some(business_id)),
        applicant_id: Set(7),
        title: Set("BPM 历史载荷解析测试实例".to_string()),
        status: Set(Some(status.to_string())),
        initiator_id: Set(7),
        initiator_name: Set("测试审批人".to_string()),
        started_at: Set(Some(now)),
        completed_at: Set(Some(now)),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
        ..Default::default()
    }
    .insert(db)
    .await
    .expect("测试流程实例插入失败")
    .id
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
        Some(first_instance_id),
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        Some(second_instance_id),
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        Some(first_instance_id),
        business_type.to_string(),
        business_id,
        true,
        7,
    )
    .await;

    let expected_keys = [
        format!("bpm:instance:{first_instance_id}:finished"),
        format!("bpm:instance:{second_instance_id}:finished"),
    ];
    let rows = processed_event::Entity::find()
        .filter(processed_event::Column::ConsumerId.eq("event_bus_main"))
        .filter(processed_event::Column::EventType.eq("BpmProcessFinished"))
        .filter(processed_event::Column::EventKey.is_in(expected_keys.clone()))
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

#[tokio::test]
async fn legacy_bpm_payload_resolves_unique_instance_and_dead_letters_ambiguity() {
    let db = Arc::new(setup_test_db().await);
    let search_client: Arc<dyn SearchClient> = Arc::new(ElasticClient::mock());
    let definition_id = seed_definition(&db).await;

    let unique_business_type = "legacy_bpm_unique_probe";
    let unique_business_id = unique_tag();
    let unique_instance_id = seed_instance(
        &db,
        definition_id,
        unique_business_type,
        unique_business_id,
        instance_status::COMPLETED,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        None,
        unique_business_type.to_string(),
        unique_business_id,
        true,
        7,
    )
    .await;

    let unique_marker = processed_event::Entity::find()
        .filter(processed_event::Column::ConsumerId.eq("event_bus_main"))
        .filter(
            processed_event::Column::EventKey
                .eq(format!("bpm:instance:{unique_instance_id}:finished")),
        )
        .one(&*db)
        .await
        .expect("回读历史载荷唯一实例幂等记录失败");
    assert!(
        unique_marker.is_some(),
        "唯一终态实例必须被显式解析并进入实例级幂等"
    );

    let ambiguous_business_type = "legacy_bpm_ambiguous_probe";
    let ambiguous_business_id = unique_tag();
    let first_ambiguous_id = seed_instance(
        &db,
        definition_id,
        ambiguous_business_type,
        ambiguous_business_id,
        instance_status::TERMINATED,
    )
    .await;
    let second_ambiguous_id = seed_instance(
        &db,
        definition_id,
        ambiguous_business_type,
        ambiguous_business_id,
        instance_status::TERMINATED,
    )
    .await;
    handle_bpm_process_finished(
        Arc::clone(&db),
        Arc::clone(&search_client),
        None,
        ambiguous_business_type.to_string(),
        ambiguous_business_id,
        false,
        7,
    )
    .await;

    for instance_id in [first_ambiguous_id, second_ambiguous_id] {
        let marker = processed_event::Entity::find()
            .filter(processed_event::Column::ConsumerId.eq("event_bus_main"))
            .filter(
                processed_event::Column::EventKey
                    .eq(format!("bpm:instance:{instance_id}:finished")),
            )
            .one(&*db)
            .await
            .expect("回读歧义历史载荷幂等记录失败");
        assert!(marker.is_none(), "歧义历史载荷不得猜测实例并写入幂等记录");
    }

    let dead_letters = event_dead_letter::Entity::find()
        .filter(event_dead_letter::Column::EventType.eq("BpmProcessFinished"))
        .all(&*db)
        .await
        .expect("回读历史载荷解析死信失败");
    assert!(
        dead_letters.iter().any(|row| {
            row.event_payload["business_type"] == ambiguous_business_type
                && row.event_payload["business_id"] == serde_json::json!(ambiguous_business_id)
        }),
        "歧义历史载荷必须落显式死信，不能静默丢弃"
    );
}
