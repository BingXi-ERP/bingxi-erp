//! 期末调整自动确认失败必须中止结账回归测试（B05-P2-10）
//!
//! 场景：期间为 OPEN、存在一条 draft 期末调整；用 PostgreSQL 触发器注入"确认更新必失败"。
//! 预期：close_period 返回 Err（调整确认失败上抛），期间停留在 OPEN、调整停留在 draft，
//! 而不是带着未确认的暂估/摊销/预提凭证继续结账（期间关闭后这些凭证永久漏账）。

use bingxi_backend::models::{accounting_period, period_adjustment_record};
use bingxi_backend::services::accounting_period_service::AccountingPeriodService;
use bingxi_backend::services::period_adjustment_service::period_adjustment_status;
use bingxi_backend::services::test_common::setup_test_db;
use chrono::{TimeZone, Utc};
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbBackend, EntityTrait, QueryFilter, Set,
    Statement,
};
use std::sync::Arc;

const TEST_ADJUSTMENT_NO: &str = "PA-TEST-CONFIRM-BLOCK";

/// 测试注入：对该调整行的任何 UPDATE 一律报错，模拟"确认"这一步的数据库层失败
async fn install_confirm_block_trigger(db: &sea_orm::DatabaseConnection) {
    db.execute_raw(Statement::from_string(
        DbBackend::Postgres,
        "CREATE OR REPLACE FUNCTION raise_test_confirm_block() RETURNS trigger \
         LANGUAGE plpgsql AS $$ \
         BEGIN RAISE EXCEPTION '测试注入：期末调整确认更新失败'; END; $$;",
    ))
    .await
    .expect("测试注入：创建触发器函数失败");
    db.execute_raw(Statement::from_string(
        DbBackend::Postgres,
        format!(
            "CREATE TRIGGER trg_test_adjust_confirm_block \
             BEFORE UPDATE ON period_adjustment_record \
             FOR EACH ROW WHEN (OLD.adjustment_no = '{TEST_ADJUSTMENT_NO}') \
             EXECUTE FUNCTION raise_test_confirm_block();"
        ),
    ))
    .await
    .expect("测试注入：创建触发器失败");
}

/// 测试清理：无论断言走向如何都先拆触发器，避免毒化同库的后续用例
async fn remove_confirm_block_trigger(db: &sea_orm::DatabaseConnection) {
    let _ = db
        .execute_raw(Statement::from_string(
            DbBackend::Postgres,
            "DROP TRIGGER IF EXISTS trg_test_adjust_confirm_block ON period_adjustment_record;"
                .to_string(),
        ))
        .await;
    let _ = db
        .execute_raw(Statement::from_string(
            DbBackend::Postgres,
            "DROP FUNCTION IF EXISTS raise_test_confirm_block();".to_string(),
        ))
        .await;
}

#[tokio::test]
async fn period_adjustment_confirm_failure_aborts_close_and_keeps_period_open() {
    let db = Arc::new(setup_test_db().await);

    // 2099-01 期间（OPEN，远离真实业务期间，避免与种子/夹具数据撞车）
    let period = accounting_period::ActiveModel {
        year: Set(2099),
        period: Set(1),
        period_name: Set("2099 年 01 月".to_string()),
        start_date: Set(Utc.with_ymd_and_hms(2099, 1, 1, 0, 0, 0).unwrap()),
        end_date: Set(Utc.with_ymd_and_hms(2099, 1, 31, 23, 59, 59).unwrap()),
        status: Set(bingxi_backend::models::status::accounting_period::OPEN.to_string()),
        created_at: Set(Utc::now()),
        ..Default::default()
    }
    .insert(&*db)
    .await
    .expect("插入测试期间失败");

    // 该期间下的一条 draft 期末调整（暂估），确认时会被触发器打断
    period_adjustment_record::ActiveModel {
        adjustment_no: Set(TEST_ADJUSTMENT_NO.to_string()),
        adjustment_type: Set("estimate".to_string()),
        period: Set("2099-01".to_string()),
        description: Set("结账中止回归测试用暂估调整".to_string()),
        debit_subject_code: Set("ZZZ_TEST_A".to_string()),
        debit_subject_name: Set("测试用借方科目".to_string()),
        credit_subject_code: Set("ZZZ_TEST_B".to_string()),
        credit_subject_name: Set("测试用贷方科目".to_string()),
        amount: Set(Decimal::from(100)),
        status: Set(period_adjustment_status::DRAFT.to_string()),
        is_deleted: Set(false),
        created_by: Set(Some(1)),
        created_at: Set(Utc::now().into()),
        updated_at: Set(Utc::now().into()),
        ..Default::default()
    }
    .insert(&*db)
    .await
    .expect("插入测试期末调整失败");

    install_confirm_block_trigger(&db).await;
    let result = AccountingPeriodService::new(db.clone())
        .close_period(period.id, 1)
        .await;
    remove_confirm_block_trigger(&db).await;

    let err = result.expect_err("期末调整确认失败必须中止结账");
    assert!(
        !err.to_string().is_empty(),
        "中止结账的错误必须可读（供前端与日志判责）"
    );

    // 期间未进入 CLOSING/CLOSED：结账在最前置的调整确认腿被拦下
    let period_after = accounting_period::Entity::find_by_id(period.id)
        .one(&*db)
        .await
        .expect("期间查询失败")
        .expect("期间记录不应被删除");
    assert_eq!(
        period_after.status,
        bingxi_backend::models::status::accounting_period::OPEN,
        "调整确认失败后期间必须停留在 OPEN"
    );
    assert!(period_after.closed_at.is_none(), "closed_at 不应被写入");

    // 调整未被确认（更新被注入打断，且确认失败不再吞错）
    let adj_after = period_adjustment_record::Entity::find()
        .filter(period_adjustment_record::Column::AdjustmentNo.eq(TEST_ADJUSTMENT_NO))
        .one(&*db)
        .await
        .expect("调整记录查询失败")
        .expect("调整记录不应被删除");
    assert_eq!(adj_after.status, period_adjustment_status::DRAFT);
    assert!(adj_after.confirmed_at.is_none(), "确认时间不应被写入");
}
