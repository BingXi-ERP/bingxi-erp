//! 事件总线 Kafka 后端实现（P11-H2 高风险任务）
//!
//! 责任：
//! - 通过 `rskafka` 客户端连接 Kafka broker；
//! - 启动时自动创建 topic（失败时容忍：可能已存在）；
//! - `publish` 把 `BusinessEvent` 序列化为 JSON 投递到 Kafka；
//! - `subscribe` 启动后台消费任务并把记录反序列化为 `BusinessEvent` 推送到
//!   `tokio::sync::mpsc` 通道，调用方从流中读取。
//!
//! 设计取舍：
//! - rskafka 0.5 是纯 Rust 实现，无 C/C++ 依赖，CI 不需要 librdkafka；
//! - 启动时连接超时 5s（避免启动卡死）；
//! - 启动失败 → 返回 `Err`，由上层 `event_bus` 自动降级到本地 `broadcast::Sender`（批次 120 P2-10 修复后已无 BroadcastBackend 抽象，仅保留 `local_tx: broadcast::Sender`）；
//! - publish/subscribe 全部使用 `tracing::error!` 记录中文日志，CI 抓得到。

use std::collections::BTreeMap;
use std::panic::AssertUnwindSafe;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use futures::FutureExt;
use futures::stream::Stream;
use rskafka::client::partition::{Compression, OffsetAt, PartitionClient, UnknownTopicHandling};
use rskafka::client::{Client, ClientBuilder};
use rskafka::record::{Record, RecordAndOffset};
// 批次 357 v13 复审 baseline 清零：移除 unused import（Deserialize, Serialize 编译器报未使用）
use tokio::sync::mpsc;

use super::event_kafka_payload::EventPayload;
use crate::config::settings::KafkaSettings;
use crate::services::event_bus::BusinessEvent;

/// Kafka 后端错误类型（实际消息以中文描述，便于运维排查；调用方拿到后选择降级还是中断。）
#[derive(Debug, Clone)]
pub struct KafkaError(pub String);

impl std::fmt::Display for KafkaError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for KafkaError {}

impl From<String> for KafkaError {
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for KafkaError {
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

/// 返回 `BusinessEvent` 对应的事件类型字符串
/// 批次 121 v8 复审修复：删除 KafkaEventEnvelope struct + from_event + into_event；（零业务调用方，KafkaBackend.publish/subscribe 使用 EventPayload 而非信封结构）。；保留 event_type_name 供测试断言使用，标记 #[cfg(test)] 避免非测试编译时 dead_code。
pub fn event_type_name(event: &BusinessEvent) -> &'static str {
    match event {
        BusinessEvent::PurchaseReceiptCompleted { .. } => "PurchaseReceiptCompleted",
        BusinessEvent::SalesOrderShipped { .. } => "SalesOrderShipped",
        BusinessEvent::SalesOrderSubmitted { .. } => "SalesOrderSubmitted",
        BusinessEvent::SalesOrderApproved { .. } => "SalesOrderApproved",
        BusinessEvent::SalesOrderCompleted { .. } => "SalesOrderCompleted",
        BusinessEvent::SalesOrderCancelled { .. } => "SalesOrderCancelled",
        BusinessEvent::SalesOrderRejected { .. } => "SalesOrderRejected",
        BusinessEvent::PaymentCompleted { .. } => "PaymentCompleted",
        BusinessEvent::CollectionCompleted { .. } => "CollectionCompleted",
        BusinessEvent::PurchaseOrderApproved { .. } => "PurchaseOrderApproved",
        BusinessEvent::InventoryCountCompleted { .. } => "InventoryCountCompleted",
        BusinessEvent::BpmProcessFinished { .. } => "BpmProcessFinished",
        BusinessEvent::LowStockAlert { .. } => "LowStockAlert",
        BusinessEvent::FinancialIndicatorUpdate { .. } => "FinancialIndicatorUpdate",
        BusinessEvent::MaterialShortageAlert { .. } => "MaterialShortageAlert",
        BusinessEvent::InventoryTransactionCreated { .. } => "InventoryTransactionCreated",
        // 批次 415：补全 CustomerUpdated/SupplierUpdated 分支，消除 non-exhaustive patterns 编译错误
        BusinessEvent::CustomerUpdated { .. } => "CustomerUpdated",
        BusinessEvent::SupplierUpdated { .. } => "SupplierUpdated",
        // v14 批次 420 修复 T-P1-3：染色完成/质检完成事件
        BusinessEvent::DyeBatchCompleted { .. } => "DyeBatchCompleted",
        BusinessEvent::QualityInspectionCompleted { .. } => "QualityInspectionCompleted",
        // V15 Batch05-P1-3：面料行业 6 个核心业务事件
        BusinessEvent::ProcessStepReported { .. } => "ProcessStepReported",
        BusinessEvent::DyeBatchStatusChanged { .. } => "DyeBatchStatusChanged",
        BusinessEvent::FabricInspectionGraded { .. } => "FabricInspectionGraded",
        BusinessEvent::ProductionQuantityReported { .. } => "ProductionQuantityReported",
        BusinessEvent::EnergyConsumptionRecorded { .. } => "EnergyConsumptionRecorded",
        BusinessEvent::ColorCardIssued { .. } => "ColorCardIssued",
        // V15 Batch04-P1-5/P1-6：工资/委外/业务模式切换事件
        BusinessEvent::WageConfirmed { .. } => "WageConfirmed",
        BusinessEvent::WagePaid { .. } => "WagePaid",
        BusinessEvent::OutsourcingMaterialIssued { .. } => "OutsourcingMaterialIssued",
        BusinessEvent::OutsourcingProcessingRecorded { .. } => "OutsourcingProcessingRecorded",
        BusinessEvent::OutsourcingOrderSettled { .. } => "OutsourcingOrderSettled",
        BusinessEvent::OutsourcingOrderCompleted { .. } => "OutsourcingOrderCompleted",
        BusinessEvent::BusinessModeChanged { .. } => "BusinessModeChanged",
        BusinessEvent::OrderBusinessModeLinked { .. } => "OrderBusinessModeLinked",
    }
}

/// Kafka 后端实现（通过 `Arc<KafkaBackendInner>` 共享内部状态；`publish` / `subscribe`；都是 clone 后调用，开销可控。）
#[derive(Clone)]
pub struct KafkaBackend {
    inner: Arc<KafkaBackendInner>,
}

struct KafkaBackendInner {
    client: Arc<Client>,
    config: KafkaSettings,
    /// 轮询用：下一次投递使用的 partition
    next_partition: AtomicU64,
}

impl KafkaBackend {
    /// 尝试创建 Kafka 后端
    /// 行为：1. 解析 `brokers`（逗号分隔）；2. 使用 `connect_timeout_ms` 限制连接总耗时；3. 若 `auto_create_topic=true`，启动时调用 `create_topic`（已存在时容忍）；4. 任意失败 → 返回 `Err` 让上层降级。
    pub async fn try_new(config: &KafkaSettings) -> Result<Self, KafkaError> {
        let brokers: Vec<String> = config
            .brokers
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();

        if brokers.is_empty() {
            return Err(KafkaError(
                "Kafka brokers 配置为空，无法创建客户端".to_string(),
            ));
        }

        // 5s 超时连接，超时立即报错（避免启动卡死）
        let connect_fut = ClientBuilder::new(brokers).build();
        let client = match tokio::time::timeout(
            Duration::from_millis(config.connect_timeout_ms),
            connect_fut,
        )
        .await
        {
            Ok(Ok(c)) => c,
            Ok(Err(e)) => {
                return Err(KafkaError(format!(
                    "连接 Kafka 失败（brokers={}）: {}",
                    config.brokers, e
                )));
            }
            Err(_) => {
                return Err(KafkaError(format!(
                    "连接 Kafka 超时（{}ms, brokers={}）",
                    config.connect_timeout_ms, config.brokers
                )));
            }
        };

        // 自动创建 topic（已存在时 rskafka 会返回错误，但不影响主流程）
        if config.auto_create_topic {
            if let Err(e) = client
                .controller_client()
                .map_err(|e| KafkaError(format!("获取 controller 客户端失败: {}", e)))?
                .create_topic(
                    config.topic.clone(),
                    config.partitions,
                    config.replication_factor,
                    5_000,
                )
                .await
            {
                tracing::warn!(
                    "Kafka 自动创建 topic {} 失败（可能已存在）: {}",
                    config.topic,
                    e
                );
            }
        }

        Ok(Self {
            inner: Arc::new(KafkaBackendInner {
                client: Arc::new(client),
                config: config.clone(),
                next_partition: AtomicU64::new(0),
            }),
        })
    }

    /// 暴露内部 client，便于测试构造 partition client。
    pub fn config(&self) -> &KafkaSettings {
        &self.inner.config
    }

    /// 选择下一个 partition（轮询）
    fn next_partition(&self, total: i32) -> i32 {
        if total <= 0 {
            return 0;
        }
        let idx = self.inner.next_partition.fetch_add(1, Ordering::Relaxed);
        (idx % total as u64) as i32
    }

    /// 异步发布事件到 Kafka
    pub async fn publish(&self, event: BusinessEvent) -> Result<(), KafkaError> {
        let payload = EventPayload::from(&event);
        let payload_json = serde_json::to_vec(&payload)
            .map_err(|e| KafkaError(format!("事件序列化失败: {}", e)))?;

        let partition = self.next_partition(self.inner.config.partitions);
        let partition_client: PartitionClient = self
            .inner
            .client
            .partition_client(
                self.inner.config.topic.clone(),
                partition,
                UnknownTopicHandling::Retry,
            )
            .await
            .map_err(|e| KafkaError(format!("获取 partition 客户端失败: {}", e)))?;

        // V15 P1 20.1-B 修复：注入 traceparent 到 Kafka 消息头，跨事件总线传递 trace 上下文
        let mut headers = BTreeMap::new();
        let traceparent = crate::observability::trace_context::traceparent_from_current_span();
        headers.insert(
            crate::observability::trace_context::TRACEPARENT_HEADER.to_string(),
            traceparent.into_bytes(),
        );

        let record = Record {
            key: None,
            value: Some(payload_json),
            headers,
            timestamp: chrono::Utc::now(),
        };

        partition_client
            .produce(vec![record], Compression::NoCompression)
            .await
            .map_err(|e| KafkaError(format!("Kafka produce 失败: {}", e)))?;
        Ok(())
    }

    /// 启动消费后台任务并返回事件流
    /// 后台任务对所有 partition 进行轮询 fetch：起始 offset = 各 partition 的 earliest；拉取间隔 200ms（避免 CPU 100%）；消费失败 → 重新连接（最多 3 次），仍失败则关闭流。
    pub async fn subscribe(
        &self,
    ) -> Result<Box<dyn Stream<Item = BusinessEvent> + Send + Unpin>, KafkaError> {
        let (tx, rx) = mpsc::channel::<BusinessEvent>(256);
        let config = self.inner.config.clone();
        let client = self.inner.client.clone();

        // 后台消费任务：拉取所有 partition，反序列化后推入 mpsc
        // 本 spawn 句柄未显式保存，依赖 mpsc channel 生命周期管理：
        // 当 subscribe() 返回的 rx 被 drop 时，tx.send 失败导致 run_consumer_loop 退出；
        // 进程退出时 tokio runtime drop 会回收该 task。仅在 Kafka 模式下启动（Redis 模式跳过）。
        tokio::spawn(async move {
            // 批次 8（2026-06-28）：间接长期循环任务 panic 隔离
            // run_consumer_loop 内部有 loop，panic 会导致 Kafka 消费永久停止。
            // spawn 块层面 catch_unwind：若 panic 则记录日志后 spawn 退出
            // （不是理想恢复，但至少不会 panic 传播到 tokio runtime）。
            let result = AssertUnwindSafe(async {
                if let Err(e) = run_consumer_loop(client, config, tx.clone()).await {
                    tracing::error!("Kafka 消费循环退出: {}", e);
                }
            })
            .catch_unwind()
            .await;
            if let Err(panic_payload) = result {
                let panic_msg = panic_payload
                    .downcast_ref::<String>()
                    .map(|s| s.as_str())
                    .or_else(|| panic_payload.downcast_ref::<&'static str>().copied())
                    .unwrap_or("<非字符串 panic payload>");
                tracing::error!(
                    panic = %panic_msg,
                    "⚠ Kafka 消费循环 spawn panic 已被隔离（跨进程事件消费停止）"
                );
            }
        });

        let stream = KafkaSubscribeStream { rx };
        Ok(Box::new(stream))
    }
}

/// 包装 `mpsc::Receiver` 为 `Stream`
pub struct KafkaSubscribeStream {
    rx: mpsc::Receiver<BusinessEvent>,
}

impl Stream for KafkaSubscribeStream {
    type Item = BusinessEvent;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        // `tokio::sync::mpsc::Receiver` 自身实现 `Stream`，直接代理
        self.rx.poll_recv(cx)
    }
}

/// Kafka 消费循环（独立函数，便于测试）
async fn run_consumer_loop(
    client: Arc<Client>,
    config: KafkaSettings,
    tx: mpsc::Sender<BusinessEvent>,
) -> Result<(), KafkaError> {
    let partitions = config.partitions.max(1);
    // 消费位点仅保存在当前进程内，不向 broker 提交；重启后从 earliest 重放。
    let mut last_offsets: Vec<i64> = vec![0; partitions as usize];
    let mut initialised = false;
    let mut consecutive_failures: u32 = 0;
    const MAX_FAILURES: u32 = 3;
    loop {
        for partition in 0..partitions {
            if consecutive_failures >= MAX_FAILURES {
                tracing::error!(
                    "Kafka 消费连续失败 {} 次，退出消费循环",
                    consecutive_failures
                );
                return Err(KafkaError("消费连续失败次数超过上限".to_string()));
            }
            let pc = match acquire_partition_client(&client, &config, partition).await {
                Ok(p) => p,
                Err(()) => {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    continue;
                }
            };
            if !initialised {
                if let Err(e) = init_partition_offset(&pc, partition, &mut last_offsets).await {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    tracing::error!(
                        "Kafka 拉取 partition {} earliest offset 失败: {}",
                        partition,
                        e
                    );
                    continue;
                }
            }
            initialised = true;
            let current_off = last_offsets[partition as usize];
            let fetch_result = pc
                .fetch_records(current_off, 1_048_576..1_048_576, 1_000)
                .await;
            match fetch_result {
                Ok((records, _)) => {
                    consecutive_failures = 0;
                    if process_fetched_records(records, &tx, &mut last_offsets, partition).await? {
                        return Ok(());
                    }
                }
                Err(e) => {
                    consecutive_failures = consecutive_failures.saturating_add(1);
                    tracing::error!("Kafka 拉取 partition {} 失败: {}", partition, e);
                }
            }
        }
        // 简单节流：200ms 拉一次
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

/// 获取 partition 客户端。失败时已记录日志，返回 Err(()) 由调用方累计失败次数。
async fn acquire_partition_client(
    client: &Arc<Client>,
    config: &KafkaSettings,
    partition: i32,
) -> Result<PartitionClient, ()> {
    client
        .partition_client(config.topic.clone(), partition, UnknownTopicHandling::Retry)
        .await
        .map_err(|e| {
            tracing::error!("Kafka 获取 partition {} 客户端失败: {}", partition, e);
        })
}

/// 首次启动时拉取 partition 的 earliest offset 并写入 last_offsets。
async fn init_partition_offset(
    pc: &PartitionClient,
    partition: i32,
    last_offsets: &mut [i64],
) -> Result<(), rskafka::client::error::Error> {
    let off = pc.get_offset(OffsetAt::Earliest).await?;
    last_offsets[partition as usize] = off;
    Ok(())
}

/// 逐条转发记录；只有成功转发后才推进该分区内存位点。
/// 返回 `Ok(true)` 表示消费通道已关闭；载荷错误返回 `Err` 并中止消费，失败位点不推进。
async fn process_fetched_records(
    records: Vec<RecordAndOffset>,
    tx: &mpsc::Sender<BusinessEvent>,
    last_offsets: &mut [i64],
    partition: i32,
) -> Result<bool, KafkaError> {
    for record_and_off in records {
        let next_offset = record_and_off.offset + 1;
        if process_kafka_record(record_and_off, tx).await? {
            return Ok(true);
        }
        last_offsets[partition as usize] = next_offset;
    }
    Ok(false)
}

/// 处理单条 Kafka 记录：反序列化为 EventPayload 并转换为 BusinessEvent 后转发。
/// 返回 `Ok(true)` 表示消费通道已关闭；缺失 value、畸形载荷或转换失败均返回 `Err`，不得静默跳过。
async fn process_kafka_record(
    record_and_off: RecordAndOffset,
    tx: &mpsc::Sender<BusinessEvent>,
) -> Result<bool, KafkaError> {
    let offset = record_and_off.offset;
    let bytes = record_and_off.record.value.ok_or_else(|| {
        KafkaError(format!(
            "Kafka 记录 offset {offset} 缺少 value，消费已中止，拒绝跳过该记录"
        ))
    })?;

    let trace_id = record_and_off
        .record
        .headers
        .get(crate::observability::trace_context::TRACEPARENT_HEADER)
        .and_then(|v| std::str::from_utf8(v).ok())
        .and_then(crate::observability::trace_context::TraceContext::from_traceparent)
        .map(|ctx| ctx.trace_id);
    if let Some(ref tid) = trace_id {
        tracing::debug!(
            trace_id = %tid,
            "Kafka 消费消息：关联生产方 trace 链路"
        );
    }

    let payload: EventPayload = serde_json::from_slice(&bytes).map_err(|e| {
        KafkaError(format!(
            "Kafka 事件反序列化失败，消费已中止（offset {offset}）: {e}"
        ))
    })?;
    let event = BusinessEvent::try_from(payload).map_err(|e| {
        KafkaError(format!(
            "Kafka 事件转换 BusinessEvent 失败，消费已中止（offset {offset}）: {e}"
        ))
    })?;
    if tx.send(event).await.is_err() {
        tracing::warn!("Kafka 消费通道已关闭，停止消费");
        return Ok(true);
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tokio::sync::mpsc::error::TryRecvError;

    fn record(value: serde_json::Value, offset: i64) -> RecordAndOffset {
        RecordAndOffset {
            record: Record {
                key: None,
                value: Some(serde_json::to_vec(&value).expect("测试事件序列化失败")),
                headers: BTreeMap::new(),
                timestamp: chrono::Utc::now(),
            },
            offset,
        }
    }

    #[tokio::test]
    async fn legacy_bpm_payload_is_forwarded_for_explicit_instance_resolution() {
        let (tx, mut rx) = mpsc::channel(4);
        let mut last_offsets = vec![10];
        let records = vec![
            record(
                json!({
                    "kind": "inventory_count_completed",
                    "count_id": 1,
                    "variance_count": 0
                }),
                10,
            ),
            record(
                json!({
                    "kind": "bpm_process_finished",
                    "business_type": "purchase_order",
                    "business_id": 42,
                    "approved": false,
                    "approver_id": 7
                }),
                11,
            ),
            record(
                json!({
                    "kind": "inventory_count_completed",
                    "count_id": 3,
                    "variance_count": 0
                }),
                12,
            ),
        ];

        let channel_closed = process_fetched_records(records, &tx, &mut last_offsets, 0)
            .await
            .expect("旧 BPM 载荷必须进入业务监听器的显式实例解析路径");
        assert!(!channel_closed, "测试消费通道保持打开");
        assert_eq!(last_offsets, vec![13], "成功转发的旧载荷不得被跳过");

        match rx.try_recv().expect("首条合法事件必须已转发") {
            BusinessEvent::InventoryCountCompleted { count_id, .. } => assert_eq!(count_id, 1),
            other => panic!("转发事件类型不符: {other:?}"),
        }
        match rx.try_recv().expect("旧 BPM 载荷必须已转发") {
            BusinessEvent::BpmProcessFinished {
                instance_id,
                business_id,
                approved,
                ..
            } => {
                assert_eq!(instance_id, None, "旧载荷缺失实例号时不得伪造");
                assert_eq!(business_id, 42);
                assert!(!approved);
            }
            other => panic!("转发事件类型不符: {other:?}"),
        }
        match rx.try_recv().expect("旧载荷后的合法事件必须继续转发") {
            BusinessEvent::InventoryCountCompleted { count_id, .. } => assert_eq!(count_id, 3),
            other => panic!("转发事件类型不符: {other:?}"),
        }
        assert_eq!(rx.try_recv().unwrap_err(), TryRecvError::Empty);
    }

    #[tokio::test]
    async fn malformed_payload_aborts_batch_without_skipping_offset() {
        let (tx, mut rx) = mpsc::channel(1);
        let mut last_offsets = vec![30];
        let records = vec![record(
            json!({
                "kind": "bpm_process_finished",
                "instance_id": 101,
                "business_type": "purchase_order",
                "approved": false,
                "approver_id": 7
            }),
            30,
        )];

        let err = process_fetched_records(records, &tx, &mut last_offsets, 0)
            .await
            .expect_err("真正畸形的载荷必须显式中止消费，不得静默跳过");
        let message = err.to_string();
        assert!(
            message.contains("offset 30") && message.contains("消费已中止"),
            "错误必须显式中止消费并定位失败 offset，实得 {message}"
        );
        assert_eq!(last_offsets, vec![30], "失败记录不得推进内存 offset");
        assert_eq!(rx.try_recv().unwrap_err(), TryRecvError::Empty);
    }

    #[tokio::test]
    async fn current_bpm_payload_advances_offset_after_forwarding() {
        let (tx, mut rx) = mpsc::channel(2);
        let mut last_offsets = vec![20];
        let records = vec![
            record(
                json!({
                    "kind": "inventory_count_completed",
                    "count_id": 1,
                    "variance_count": 0
                }),
                20,
            ),
            record(
                json!({
                    "kind": "bpm_process_finished",
                    "instance_id": 101,
                    "business_type": "purchase_order",
                    "business_id": 42,
                    "approved": false,
                    "approver_id": 7
                }),
                21,
            ),
        ];

        let channel_closed = process_fetched_records(records, &tx, &mut last_offsets, 0)
            .await
            .expect("合法 Kafka 记录必须成功转发");
        assert!(!channel_closed, "测试消费通道保持打开");
        assert_eq!(last_offsets, vec![22], "成功转发后才能推进内存 offset");

        match rx.try_recv().expect("首条合法事件必须已转发") {
            BusinessEvent::InventoryCountCompleted { count_id, .. } => assert_eq!(count_id, 1),
            other => panic!("转发事件类型不符: {other:?}"),
        }
        match rx.try_recv().expect("BPM 事件必须已转发") {
            BusinessEvent::BpmProcessFinished {
                instance_id,
                business_id,
                approved,
                ..
            } => {
                assert_eq!(instance_id, Some(101));
                assert_eq!(business_id, 42);
                assert!(!approved);
            }
            other => panic!("转发事件类型不符: {other:?}"),
        }
        assert_eq!(rx.try_recv().unwrap_err(), TryRecvError::Empty);
    }
}
