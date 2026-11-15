//! 微信公众号通知重试队列 Service
//!
//! 直发失败的模板消息落本表,后台 worker 周期扫描 PENDING 并按指数退避重投。

use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use std::sync::Arc;

use crate::models::wechat_mp_notification_outbox::{
    ActiveModel, Column, Entity, Model as OutboxModel,
};
use crate::utils::error::AppError;

/// 最大重试次数（与邮件腿同口径,超过转 FAILED 死信）
pub const OUTBOX_MAX_RETRY_COUNT: i32 = 3;

/// 指数退避间隔（秒）— 与邮件腿同口径:第 1 次 60s / 第 2 次 300s / 第 3 次 1800s
const BACKOFF_INTERVAL_SECS: &[i64] = &[60, 300, 1800];

/// 单次扫描最多处理的队列行数量 — 防止极端积压场景下长时间占用 DB
const MAX_ROWS_PER_SCAN: u64 = 50;

/// 入队请求
#[derive(Debug, Clone)]
pub struct EnqueueRequest {
    pub user_id: i32,
    /// 事件类型稳定 ASCII 标识（WechatMpTemplateKind::code()）
    pub kind: String,
    pub openid: String,
    pub business_key: String,
    pub jump_url: Option<String>,
    /// 模板字段数组 [{key,value}]
    pub fields: serde_json::Value,
}

/// 重试队列 Service
pub struct WechatMpNotificationOutboxService {
    db: Arc<DatabaseConnection>,
}

impl WechatMpNotificationOutboxService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 发送失败后入队（PENDING，立即可重试）。
    pub async fn enqueue(&self, req: EnqueueRequest) -> Result<OutboxModel, AppError> {
        let now = Utc::now();
        let active = ActiveModel {
            id: Default::default(),
            user_id: Set(req.user_id),
            kind: Set(req.kind),
            openid: Set(req.openid),
            business_key: Set(req.business_key),
            jump_url: Set(req.jump_url),
            fields: Set(req.fields),
            status: Set("PENDING".to_string()),
            error_message: Set(None),
            retry_count: Set(0),
            next_retry_at: Set(None),
            sent_at: Set(None),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let inserted = active.insert(self.db.as_ref()).await?;
        tracing::info!(
            outbox_id = inserted.id,
            user_id = inserted.user_id,
            kind = %inserted.kind,
            business_key = %inserted.business_key,
            "公众号模板消息发送失败,已入重试队列"
        );
        Ok(inserted)
    }

    /// 查询到期队列行（PENDING + next_retry_at 已到或为 NULL + retry_count < 上限）。
    pub async fn list_pending_for_retry(&self) -> Result<Vec<OutboxModel>, AppError> {
        let now = Utc::now();
        let rows = Entity::find()
            .filter(Column::Status.eq("PENDING"))
            .filter(Column::RetryCount.lt(OUTBOX_MAX_RETRY_COUNT))
            .filter(
                Condition::any()
                    .add(Column::NextRetryAt.is_null())
                    .add(Column::NextRetryAt.lte(now)),
            )
            .order_by_asc(Column::CreatedAt)
            .limit(MAX_ROWS_PER_SCAN)
            .all(self.db.as_ref())
            .await?;
        Ok(rows)
    }

    /// 乐观锁:仅当状态仍为 PENDING 时标记为 SENDING,防止多实例并发重投同一条。
    pub async fn mark_as_sending(&self, id: i32) -> Result<bool, AppError> {
        let now = Utc::now();
        let result = Entity::update_many()
            .filter(Column::Id.eq(id))
            .filter(Column::Status.eq("PENDING"))
            .col_expr(Column::Status, sea_orm::sea_query::Expr::value("SENDING"))
            .col_expr(
                Column::UpdatedAt,
                sea_orm::sea_query::Expr::value(now.to_rfc3339()),
            )
            .exec(self.db.as_ref())
            .await?;
        Ok(result.rows_affected > 0)
    }

    /// 标记发送成功（SENT + sent_at,清空错误信息）。
    pub async fn mark_as_sent(&self, id: i32) -> Result<(), AppError> {
        let now = Utc::now();
        Entity::update_many()
            .filter(Column::Id.eq(id))
            .filter(Column::Status.eq("SENDING"))
            .col_expr(Column::Status, sea_orm::sea_query::Expr::value("SENT"))
            .col_expr(
                Column::SentAt,
                sea_orm::sea_query::Expr::value(now.to_rfc3339()),
            )
            .col_expr(
                Column::ErrorMessage,
                sea_orm::sea_query::Expr::value(Option::<String>::None),
            )
            .col_expr(
                Column::UpdatedAt,
                sea_orm::sea_query::Expr::value(now.to_rfc3339()),
            )
            .exec(self.db.as_ref())
            .await?;
        Ok(())
    }

    /// 累加重试计数并按指数退避调度下次重试;达到上限转 FAILED 死信。
    /// `error_message` 记录最近一次失败原因。
    pub async fn increment_retry(&self, id: i32, error_message: &str) -> Result<(), AppError> {
        let model = Entity::find_by_id(id)
            .one(self.db.as_ref())
            .await?
            .ok_or_else(|| AppError::not_found("重试队列记录不存在"))?;

        let new_retry_count = model.retry_count + 1;
        let now = Utc::now();

        if new_retry_count >= OUTBOX_MAX_RETRY_COUNT {
            Entity::update_many()
                .filter(Column::Id.eq(id))
                .col_expr(
                    Column::RetryCount,
                    sea_orm::sea_query::Expr::value(new_retry_count),
                )
                .col_expr(Column::Status, sea_orm::sea_query::Expr::value("FAILED"))
                .col_expr(
                    Column::ErrorMessage,
                    sea_orm::sea_query::Expr::value(error_message.to_string()),
                )
                .col_expr(
                    Column::NextRetryAt,
                    sea_orm::sea_query::Expr::value(Option::<String>::None),
                )
                .col_expr(
                    Column::UpdatedAt,
                    sea_orm::sea_query::Expr::value(now.to_rfc3339()),
                )
                .exec(self.db.as_ref())
                .await?;
            tracing::warn!(
                outbox_id = id,
                retry_count = new_retry_count,
                max_retries = OUTBOX_MAX_RETRY_COUNT,
                "公众号通知重试次数已达上限,转入 FAILED 死信"
            );
            return Ok(());
        }

        let backoff_idx = (new_retry_count as usize)
            .saturating_sub(1)
            .min(BACKOFF_INTERVAL_SECS.len().saturating_sub(1));
        let backoff_secs = BACKOFF_INTERVAL_SECS[backoff_idx];
        let next_retry_at = now + chrono::Duration::seconds(backoff_secs);

        Entity::update_many()
            .filter(Column::Id.eq(id))
            .filter(Column::Status.eq("SENDING"))
            .col_expr(
                Column::RetryCount,
                sea_orm::sea_query::Expr::value(new_retry_count),
            )
            .col_expr(Column::Status, sea_orm::sea_query::Expr::value("PENDING"))
            .col_expr(
                Column::ErrorMessage,
                sea_orm::sea_query::Expr::value(error_message.to_string()),
            )
            .col_expr(
                Column::NextRetryAt,
                sea_orm::sea_query::Expr::value(next_retry_at.to_rfc3339()),
            )
            .col_expr(
                Column::UpdatedAt,
                sea_orm::sea_query::Expr::value(now.to_rfc3339()),
            )
            .exec(self.db.as_ref())
            .await?;
        tracing::info!(
            outbox_id = id,
            retry_count = new_retry_count,
            backoff_secs,
            next_retry_at = %next_retry_at,
            "公众号通知重试已调度"
        );
        Ok(())
    }
}
