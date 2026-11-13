//! 微信公众号通知重试队列后台 Worker
//!
//! 设计镜像邮件队列 Worker：每 60 秒扫描 PENDING 队列行（可配
//! `WECHAT_MP_OUTBOX_WORKER_INTERVAL_SECS`），乐观锁抢占后重投模板消息；
//! 成功转 SENT，失败按指数退避（60s/300s/1800s）调度重试，3 次后转 FAILED 死信。
//! 环境变量门控：`WECHAT_MP_OUTBOX_WORKER_ENABLED`（默认 true）。

use std::sync::Arc;

use chrono::Utc;
use sea_orm::DatabaseConnection;
use tracing::{info, warn};

use crate::config::settings::WechatMpTemplateKind;
use crate::models::wechat_mp_notification_outbox::Model as OutboxModel;
use crate::services::wechat_mp_notification_outbox_service::WechatMpNotificationOutboxService;
use crate::services::wechat_mp_service::{NotificationOutcome, TemplateField, WechatMpService};
use crate::utils::error::AppError;

/// 默认扫描间隔（秒）
const DEFAULT_INTERVAL_SECS: u64 = 60;

/// 启动初始延迟（秒）— 避免与启动初始化争抢数据库连接
const INITIAL_DELAY_SECS: u64 = 30;

/// 微信公众号通知重试 Worker
pub struct WechatMpNotificationOutboxWorker {
    db: Arc<DatabaseConnection>,
}

impl WechatMpNotificationOutboxWorker {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 执行一次扫描：查询到期队列行并逐条重投（返回本次处理的行数）。
    pub async fn run_once(&self) -> Result<u64, AppError> {
        let outbox = WechatMpNotificationOutboxService::new(self.db.clone());
        let rows = outbox.list_pending_for_retry().await?;
        if rows.is_empty() {
            return Ok(0);
        }

        let mut processed: u64 = 0;
        for row in rows {
            match self.process_one(&outbox, &row).await {
                Ok(true) => processed += 1,
                Ok(false) => {
                    // 乐观锁失败：被其他 worker 实例先处理了，跳过
                }
                Err(e) => {
                    warn!(
                        error = %e,
                        outbox_id = row.id,
                        "公众号通知重试 Worker：处理队列行失败，下次扫描继续"
                    );
                }
            }
        }
        Ok(processed)
    }

    /// 处理单条队列行：乐观锁抢占 → 反解模板与事件类型 → 重投 → 更新状态。
    /// 返回 true 表示本次处理（发送成功或失败都算处理），false 表示乐观锁失败被跳过。
    async fn process_one(
        &self,
        outbox: &WechatMpNotificationOutboxService,
        row: &OutboxModel,
    ) -> Result<bool, AppError> {
        let acquired = outbox.mark_as_sending(row.id).await?;
        if !acquired {
            return Ok(false);
        }

        let kind = match kind_from_code(&row.kind) {
            Some(k) => k,
            None => {
                // 未知事件类型无法反解模板,永远发不出,直接按死信调度终结
                let msg = format!("未知事件类型 code={}，无法反解模板，直接转死信", row.kind);
                warn!(outbox_id = row.id, "{}", msg);
                if let Err(e) = outbox.increment_retry(&row.id, &msg).await {
                    warn!(error = %e, outbox_id = row.id, "未知事件类型行转死信失败");
                }
                return Ok(true);
            }
        };

        // 反序列化模板字段
        let fields: Vec<crate::models::wechat_mp_notification_outbox::OutboxField> =
            match serde_json::from_value(row.fields.clone()) {
                Ok(f) => f,
                Err(e) => {
                    let msg = format!("模板字段反序列化失败：{}", e);
                    warn!(outbox_id = row.id, "{}", msg);
                    outbox.increment_retry(&row.id, &msg).await?;
                    return Ok(true);
                }
            };
        let template_fields: Vec<TemplateField> = fields
            .iter()
            .map(|f| TemplateField::new(&f.key, &f.value))
            .collect();

        // 反解跳转目标（行里存的 Option<String> 直接用）
        let jump_url = row.jump_url.clone();

        let wechat = WechatMpService::new(self.db.clone());
        match wechat
            .notify_template(
                kind,
                &row.openid,
                &row.business_key,
                jump_url.as_deref(),
                &template_fields,
            )
            .await
        {
            Ok(NotificationOutcome::Sent) => {
                outbox.mark_as_sent(row.id).await?;
                info!(
                    outbox_id = row.id,
                    user_id = row.user_id,
                    kind = %row.kind,
                    business_key = %row.business_key,
                    retry_count = row.retry_count,
                    "公众号通知重试 Worker：重投成功"
                );
            }
            Ok(NotificationOutcome::SkippedDuplicate) => {
                // 去重命中说明首次直发其实已成功占位（或已有别的通道送达），
                // 这条队列行不再重投，按成功终结防重复轰炸。
                outbox.mark_as_sent(row.id).await?;
                info!(
                    outbox_id = row.id,
                    business_key = %row.business_key,
                    "公众号通知重试 Worker：去重命中，按成功终结（首次直发已占位）"
                );
            }
            Err(e) => {
                let err_msg = e.to_string();
                warn!(
                    outbox_id = row.id,
                    error = %err_msg,
                    retry_count = row.retry_count,
                    "公众号通知重试 Worker：重投失败，调度退避重试"
                );
                if let Err(retry_err) = outbox.increment_retry(row.id, &err_msg).await {
                    warn!(
                        error = %retry_err,
                        outbox_id = row.id,
                        "公众号通知重试 Worker：increment_retry 失败（不影响本次失败处理）"
                    );
                }
            }
        }

        Ok(true)
    }

    /// 启动后台调度任务（镜像 email_queue_worker 模式）。
    pub fn start_background_task(self: Arc<Self>) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let enabled = std::env::var("WECHAT_MP_OUTBOX_WORKER_ENABLED")
                .map(|v| matches!(v.to_lowercase().as_str(), "true" | "1" | "yes" | "on"))
                .unwrap_or(true);
            if !enabled {
                info!("公众号通知重试 Worker：环境变量 WECHAT_MP_OUTBOX_WORKER_ENABLED=false，跳过启动");
                return;
            }

            let interval_secs = std::env::var("WECHAT_MP_OUTBOX_WORKER_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse::<u64>().ok())
                .filter(|&v| v > 0)
                .unwrap_or(DEFAULT_INTERVAL_SECS);

            tokio::time::sleep(std::time::Duration::from_secs(INITIAL_DELAY_SECS)).await;

            let interval = std::time::Duration::from_secs(interval_secs);
            info!(
                interval_secs,
                "公众号通知重试 Worker：后台任务已启动（每 {} 秒扫描一次 PENDING 队列行）",
                interval_secs
            );

            loop {
                let scan_start = Utc::now();
                match self.run_once().await {
                    Ok(count) if count > 0 => {
                        info!(
                            count,
                            elapsed_ms = (Utc::now() - scan_start).num_milliseconds(),
                            "公众号通知重试 Worker：本轮处理 {} 条队列行",
                            count
                        );
                    }
                    Ok(_) => {}
                    Err(e) => {
                        warn!(error = %e, "公众号通知重试 Worker：本轮扫描失败，下次循环继续");
                    }
                }
                tokio::time::sleep(interval).await;
            }
        })
    }
}

/// 按 code 反解事件类型（与 WechatMpTemplateKind::code() 词表一一对应）。
fn kind_from_code(code: &str) -> Option<WechatMpTemplateKind> {
    match code {
        "wechat_mp_pending_quotation" => Some(WechatMpTemplateKind::PendingQuotation),
        "wechat_mp_quotation_result" => Some(WechatMpTemplateKind::QuotationResult),
        "wechat_mp_pending_reconcile" => Some(WechatMpTemplateKind::PendingReconcile),
        _ => None,
    }
}
