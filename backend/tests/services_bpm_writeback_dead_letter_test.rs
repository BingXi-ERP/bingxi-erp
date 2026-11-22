//! BPM 审批结果回写失败死信补偿回归测试
//!
//! 场景：BPM 侧已终审，回写采购订单 approve 失败（订单不存在）时，必须落一条
//! event_dead_letters 死信补偿记录（status=DEAD，payload 携带可重放回写指令四元组），
//! 而不是只留一条滚动 error 日志、单据永久卡在待审批。

use bingxi_backend::models::event_dead_letter;
use bingxi_backend::services::event_bus_ops::listener::handle_bpm_purchase_order;
use bingxi_backend::services::test_common::setup_test_db;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use std::sync::Arc;

#[tokio::test]
async fn bpm采购订单审批回写失败落死信补偿记录() {
    let db = Arc::new(setup_test_db().await);
    let missing_order_id: i64 = 2_000_000_001;

    handle_bpm_purchase_order(db.clone(), missing_order_id, true, 1).await;

    let rows = event_dead_letter::Entity::find()
        .filter(event_dead_letter::Column::EventType.eq("BpmProcessFinished"))
        .all(&*db)
        .await
        .expect("死信表查询失败");
    assert_eq!(
        rows.len(),
        1,
        "BPM 回写失败必须恰好落一条死信补偿记录（幂等检查不经过本函数）"
    );
    let row = &rows[0];
    assert_eq!(row.status, "DEAD", "首次失败即入死信（无重放调度器）");
    assert_eq!(row.event_payload["business_type"], "purchase_order");
    assert_eq!(row.event_payload["business_id"], missing_order_id);
    assert_eq!(row.event_payload["approved"], true);
    assert_eq!(row.event_payload["approver_id"], 1);
    let last_error = row.last_error.as_deref().unwrap_or("");
    assert!(
        !last_error.is_empty(),
        "完整错误必须留痕，否则死信无法判责重放"
    );
}
