//! 事件重试与死信队列服务
//!
//! B-P1-7 修复（批次 384 v13 复审）：
//! 事件处理失败后采用指数退避重试，超过最大重试次数后入死信队列并告警。
//! 复用现有 EventIdempotencyService 进行幂等去重，避免重试导致重复副作用。

use crate::models::event_dead_letter;
use crate::utils::error::AppError;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, QuerySelect, Set,
};
use std::sync::Arc;
use std::time::Duration;

/// 最大重试次数（超过后入死信队列）
pub const MAX_RETRY_COUNT: i32 = 5;

/// 指数退避基础延迟（秒），实际延迟 = BASE_DELAY * 2^retry_count
const BASE_DELAY_SECS: u64 = 1;

/// 事件重试与死信服务
pub struct EventRetryService {
    db: Arc<DatabaseConnection>,
}

impl EventRetryService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 处理事件失败：记录失败信息，超过最大重试次数后入死信队列
    /// 参数：`event_type`: 事件类型（BusinessEvent 变体名）；`event_payload`: 事件 payload 的 JSON 序列化；`failure_reason`: 失败原因摘要；`full_error`: 完整错误信息；`retry_count`: 当前已重试次数（从 0 开始）；返回值：是否已入死信队列（true 表示已入死信，不再重试）
    pub async fn handle_failure(
        &self,
        event_type: &str,
        event_payload: serde_json::Value,
        failure_reason: &str,
        full_error: &str,
        retry_count: i32,
    ) -> Result<bool, AppError> {
        if retry_count >= MAX_RETRY_COUNT {
            // 超过最大重试次数，入死信队列
            self.write_to_dead_letter(
                event_type,
                event_payload,
                failure_reason,
                full_error,
                retry_count,
            )
            .await?;
            // 告警（日志级别 error，便于监控系统采集）
            tracing::error!(
                "事件已入死信队列：type={}, retry_count={}, reason={}",
                event_type,
                retry_count,
                failure_reason
            );
            Ok(true)
        } else {
            // 未超过最大重试次数，记录 warn 日志
            tracing::warn!(
                "事件处理失败（将重试）：type={}, retry_count={}/{}, reason={}",
                event_type,
                retry_count,
                MAX_RETRY_COUNT,
                failure_reason
            );
            Ok(false)
        }
    }

    /// 计算指数退避延迟（公式：delay = BASE_DELAY * 2^retry_count，上限 60 秒）
    pub fn calculate_backoff_delay(retry_count: i32) -> Duration {
        let exponent = retry_count.max(0) as u32;
        let delay_secs = BASE_DELAY_SECS
            .saturating_mul(2u64.saturating_pow(exponent))
            .min(60);
        Duration::from_secs(delay_secs)
    }

    /// 单次性补偿腿失败直接落死信（无重试循环场景）。
    ///
    /// 与 `handle_failure` 的差异：不经过重试阈值判定，调用即持久化一行
    /// `status=DEAD`、`retry_count=0` 的死信记录，供人工排查或后台补偿。
    /// 适用于入库确认后应付生成、染缸占用等事务外的"失败仅告警"腿。
    pub async fn record_dead_letter(
        &self,
        event_type: &str,
        event_payload: serde_json::Value,
        failure_reason: &str,
        full_error: &str,
    ) -> Result<(), AppError> {
        self.write_to_dead_letter(event_type, event_payload, failure_reason, full_error, 0)
            .await
    }

    /// 立即落死信：commit 后联动腿专用
    ///
    /// 功能：主事务已提交、失败无法靠回滚挽回的联动腿（BPM 审批回写、凭证补生成等），
    /// 首次失败即写入死信表作为可重放的补偿记录。与 [`Self::handle_failure`] 的区别：
    /// `handle_failure` 依赖外部重试调度递增 retry_count、未达上限时只留 warn 零持久化，
    /// 而事件总线对这类 commit 后联动腿没有重放调度器，必须首次失败即落死信，
    /// 否则失败痕迹只存在于滚动日志里，进程重启后无从补录。
    /// 调用方：`event_bus_ops/listener`（BPM 回写失败登记）、本文件
    /// [`Self::record_voucher_generation_failure`]（凭证生成失败登记）。
    /// 入参：`event_type` 事件类型、`event_payload` 重放所需业务要素 JSON、
    /// `failure_reason` 失败原因摘要、`full_error` 完整错误信息。
    /// 传给谁：[`Self::write_to_dead_letter`]。
    /// 存什么：重放所需业务要素 + 失败原因摘要 + 完整错误，retry_count 记为 MAX_RETRY_COUNT。
    /// 存哪里：`event_dead_letters` 表，status=DEAD（待人工/补偿任务处理）。
    pub async fn dead_letter_now(
        &self,
        event_type: &str,
        event_payload: serde_json::Value,
        failure_reason: &str,
        full_error: &str,
    ) -> Result<(), AppError> {
        self.write_to_dead_letter(
            event_type,
            event_payload,
            failure_reason,
            full_error,
            MAX_RETRY_COUNT,
        )
        .await
    }

    /// 凭证生成失败死信登记（commit 后联动腿共享入口）
    ///
    /// 功能：单据主流程已 commit（付款/收款确认、发货、对账关闭、能耗分摊、工资发放等），
    /// 后续 `VoucherService::create_and_post` 失败时把可重放的凭证来源四要素写入死信表，
    /// 供人工或补偿任务按 payload 补生成凭证；总账不再静默缺凭证。
    /// 调用方：ap_payment_service、ar_ops/collection、so/delivery_ops/ship、
    /// ap_invoice_ops/receipt、ar/recon_ops/lifecycle、ap_reconciliation_ops/confirm、
    /// energy_ops/allocation_record、wage_ops/record。
    /// 入参：`db` 连接、`source_module`/`source_type`/`source_bill_id`/`source_bill_no`
    /// 凭证来源四要素（与 CreateVoucherRequest 同口径）、`failure` 失败错误。
    /// 传给谁：[`Self::dead_letter_now`]。
    /// 存什么：凭证来源四要素 JSON + 失败原因摘要 + 完整错误。
    /// 存哪里：`event_dead_letters` 表，event_type=VoucherGenerationFailed，status=DEAD。
    pub async fn record_voucher_generation_failure(
        db: Arc<DatabaseConnection>,
        source_module: &str,
        source_type: &str,
        source_bill_id: i64,
        source_bill_no: &str,
        failure: impl std::fmt::Display,
    ) {
        let failure_str = failure.to_string();
        let payload = voucher_generation_failure_payload(
            source_module,
            source_type,
            source_bill_id,
            source_bill_no,
        );
        let reason = format!(
            "单据 {source_bill_no}（{source_module}/{source_type} #{source_bill_id}）主流程已 commit，\
             凭证生成失败：{failure_str}；需按 payload 重放 create_and_post 补生成凭证"
        );
        let retry_service = EventRetryService::new(db);
        if let Err(e) = retry_service
            .dead_letter_now("VoucherGenerationFailed", payload, &reason, &failure_str)
            .await
        {
            tracing::error!(
                source_bill_no,
                source_module,
                source_type,
                source_bill_id,
                error = %e,
                "凭证生成失败的死信登记也失败（原始错误：{failure_str}），\
                 请人工核查该单据并补生成凭证"
            );
        }
    }

    /// 将失败事件写入死信队列表
    async fn write_to_dead_letter(
        &self,
        event_type: &str,
        event_payload: serde_json::Value,
        failure_reason: &str,
        full_error: &str,
        retry_count: i32,
    ) -> Result<(), AppError> {
        let dead_letter = build_dead_letter_active_model(
            event_type,
            event_payload,
            failure_reason,
            full_error,
            retry_count,
        );
        dead_letter.insert(&*self.db).await?;
        Ok(())
    }

    /// 查询死信队列（分页）
    pub async fn list_dead_letters(
        &self,
        status_filter: Option<&str>,
        limit: u64,
    ) -> Result<Vec<event_dead_letter::Model>, AppError> {
        let mut query = event_dead_letter::Entity::find()
            .order_by_desc(event_dead_letter::Column::CreatedAt)
            .limit(limit);
        if let Some(status) = status_filter {
            query = query.filter(event_dead_letter::Column::Status.eq(status));
        }
        let result = query.all(&*self.db).await?;
        Ok(result)
    }

    /// 标记死信为已处理
    pub async fn resolve_dead_letter(
        &self,
        dead_letter_id: i32,
        resolved_by: i32,
    ) -> Result<event_dead_letter::Model, AppError> {
        let dead_letter = event_dead_letter::Entity::find_by_id(dead_letter_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("死信记录 {}", dead_letter_id)))?;

        let mut active: event_dead_letter::ActiveModel = dead_letter.into();
        active.status = Set(event_dead_letter::status::RESOLVED.to_string());
        active.resolved_at = Set(Some(chrono::Utc::now()));
        active.resolved_by = Set(Some(resolved_by));
        active.updated_at = Set(chrono::Utc::now());
        let updated = active.update(&*self.db).await?;
        Ok(updated)
    }

    /// 统计死信队列数量（按状态）
    pub async fn count_by_status(&self, status_filter: Option<&str>) -> Result<u64, AppError> {
        let mut query = event_dead_letter::Entity::find();
        if let Some(status) = status_filter {
            query = query.filter(event_dead_letter::Column::Status.eq(status));
        }
        let count = query.count(&*self.db).await?;
        Ok(count)
    }
}

/// 构造死信 ActiveModel（纯函数，落库与无 DB 单测共用同一结构，保证测试断言即落库形状）。
/// 字段与 `models/event_dead_letter.rs` 的 Model 逐字段对应。
fn build_dead_letter_active_model(
    event_type: &str,
    event_payload: serde_json::Value,
    failure_reason: &str,
    full_error: &str,
    retry_count: i32,
) -> event_dead_letter::ActiveModel {
    let now = chrono::Utc::now();
    event_dead_letter::ActiveModel {
        event_type: Set(event_type.to_string()),
        event_payload: Set(event_payload),
        failure_reason: Set(failure_reason.to_string()),
        last_error: Set(Some(full_error.to_string())),
        retry_count: Set(retry_count),
        max_retries: Set(MAX_RETRY_COUNT),
        status: Set(event_dead_letter::status::DEAD.to_string()),
        first_failed_at: Set(now),
        last_retry_at: Set(Some(now)),
        resolved_at: Set(None),
        resolved_by: Set(None),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
}

/// 构造凭证生成失败死信的 payload（凭证来源四要素，与 CreateVoucherRequest 同口径，
/// 补偿任务按此重放 VoucherService::create_and_post）
fn voucher_generation_failure_payload(
    source_module: &str,
    source_type: &str,
    source_bill_id: i64,
    source_bill_no: &str,
) -> serde_json::Value {
    serde_json::json!({
        "source_module": source_module,
        "source_type": source_type,
        "source_bill_id": source_bill_id,
        "source_bill_no": source_bill_no,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 单次性补偿腿（record_dead_letter 路径，retry_count=0）的死信落库结构：
    /// status=DEAD、retry_count=0、max_retries=MAX_RETRY_COUNT、resolved_* 为空、
    /// event_type/payload/failure_reason/last_error 原样透传。
    #[test]
    fn dead_letter_active_model_one_shot_structure() {
        let payload = serde_json::json!({
            "receipt_id": 7,
            "receipt_no": "PR-20261117-0001",
            "user_id": 3,
        });
        let model = build_dead_letter_active_model(
            "purchase_receipt_ap_generate_failed",
            payload,
            "入库单确认后自动生成应付账单失败",
            "AP service unavailable",
            0,
        );

        assert_eq!(
            model.event_type.unwrap(),
            "purchase_receipt_ap_generate_failed".to_string()
        );
        assert_eq!(
            model.failure_reason.unwrap(),
            "入库单确认后自动生成应付账单失败".to_string()
        );
        assert_eq!(
            model.last_error.unwrap(),
            Some("AP service unavailable".to_string())
        );
        assert_eq!(model.retry_count.unwrap(), 0);
        assert_eq!(model.max_retries.unwrap(), MAX_RETRY_COUNT);
        assert_eq!(
            model.status.unwrap(),
            event_dead_letter::status::DEAD.to_string()
        );
        assert_eq!(model.resolved_at.unwrap(), None);
        assert_eq!(model.resolved_by.unwrap(), None);
        assert!(model.last_retry_at.into_value().is_some());
        assert!(model.first_failed_at.into_value().is_some());

        let stored_payload = model.event_payload.unwrap();
        assert_eq!(stored_payload["receipt_id"], 7);
        assert_eq!(stored_payload["receipt_no"], "PR-20261117-0001");
        assert_eq!(stored_payload["user_id"], 3);
    }

    /// 重试阈值路径（handle_failure 超限，retry_count=MAX_RETRY_COUNT）的死信落库结构：
    /// retry_count 原样透传，status 恒为 DEAD，max_retries 与常量一致。
    #[test]
    fn dead_letter_active_model_retry_exhausted_structure() {
        let model = build_dead_letter_active_model(
            "dye_vat_release_failed",
            serde_json::json!({"batch_id": 42, "batch_no": "BATCH-42", "direction": "release"}),
            "染缸释放失败",
            "deadlock detected",
            MAX_RETRY_COUNT,
        );

        assert_eq!(
            model.event_type.unwrap(),
            "dye_vat_release_failed".to_string()
        );
        assert_eq!(model.retry_count.unwrap(), MAX_RETRY_COUNT);
        assert_eq!(model.max_retries.unwrap(), MAX_RETRY_COUNT);
        assert_eq!(
            model.status.unwrap(),
            event_dead_letter::status::DEAD.to_string()
        );
        assert_eq!(model.resolved_at.unwrap(), None);
        assert_eq!(model.resolved_by.unwrap(), None);
    }

    #[test]
    fn 凭证死信payload携带可重放的四要素() {
        let payload = voucher_generation_failure_payload("ap", "AP_PAYMENT", 42, "FK-001");
        assert_eq!(payload["source_module"], "ap");
        assert_eq!(payload["source_type"], "AP_PAYMENT");
        assert_eq!(payload["source_bill_id"], 42);
        assert_eq!(payload["source_bill_no"], "FK-001");
    }

    #[test]
    fn 凭证死信payload是对象且四键齐全() {
        let payload = voucher_generation_failure_payload("sales", "SALES_DELIVERY", 7, "FH-002");
        let obj = payload.as_object().expect("payload 必须是 JSON 对象");
        assert_eq!(
            obj.len(),
            4,
            "payload 只允许四要素键，多余键会造成重放口径漂移"
        );
        for key in [
            "source_module",
            "source_type",
            "source_bill_id",
            "source_bill_no",
        ] {
            assert!(obj.contains_key(key), "缺键 {key}");
        }
    }
}
