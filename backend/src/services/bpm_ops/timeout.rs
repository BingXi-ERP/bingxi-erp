//! BPM 审批节点超时策略解析与工单快照。
//!
//! 策略来源是流程定义 `config.nodes[]` 的 `timeout` 对象；建单时校验并快照到
//! `bpm_task.task_variables.timeout`，到期时间写入已有 `due_date` 列。调度器只消费
//! 工单快照，流程定义后续修改不会改变在途工单的超时口径。

use chrono::{DateTime, Duration, Utc};
use sea_orm::{DatabaseTransaction, EntityTrait};
use serde_json::{Map, Value, json};

use crate::models::user;
use crate::utils::error::AppError;

const MAX_AFTER_SECONDS: i64 = 31_536_000;

/// 节点超时策略快照。字段与节点 JSON 键逐字一致。
pub(crate) struct TimeoutPolicy {
    pub after_seconds: i64,
    pub transfer_to_user_id: i32,
}

/// 读取节点 `timeout` 配置；缺键或 null 表示不启用超时，其余形状 fail-closed。
pub(crate) fn node_timeout_policy(node: &Value) -> Result<Option<TimeoutPolicy>, AppError> {
    let Some(raw) = node.get("timeout") else {
        return Ok(None);
    };
    if raw.is_null() {
        return Ok(None);
    }
    parse_timeout_policy(raw).map(Some)
}

/// 从工单变量快照读取超时策略，供定时转交使用；快照缺失表示历史任务不转交。
pub(crate) fn timeout_policy_from_snapshot(
    variables: Option<&Value>,
) -> Result<Option<TimeoutPolicy>, AppError> {
    let Some(raw) = variables.and_then(|value| value.get("timeout")) else {
        return Ok(None);
    };
    if raw.is_null() {
        return Ok(None);
    }
    parse_timeout_policy(raw).map(Some)
}

fn parse_timeout_policy(raw: &Value) -> Result<TimeoutPolicy, AppError> {
    let Some(object) = raw.as_object() else {
        return Err(AppError::validation_displayable(
            "审批节点的超时配置必须是对象，请配置超时秒数与转交用户",
        ));
    };
    let after_seconds = object
        .get("after_seconds")
        .and_then(Value::as_i64)
        .ok_or_else(|| {
            AppError::validation_displayable("审批节点的超时秒数必须是整数，不能使用字符串或小数")
        })?;
    if after_seconds <= 0 || after_seconds > MAX_AFTER_SECONDS {
        return Err(AppError::validation_displayable(format!(
            "审批节点的超时秒数必须在 1 至 {MAX_AFTER_SECONDS} 秒之间"
        )));
    }
    let transfer_to_user_id = object
        .get("transfer_to_user_id")
        .and_then(Value::as_i64)
        .and_then(|id| i32::try_from(id).ok())
        .filter(|id| *id > 0)
        .ok_or_else(|| {
            AppError::validation_displayable("审批节点的超时转交用户 ID 必须为正整数")
        })?;
    Ok(TimeoutPolicy {
        after_seconds,
        transfer_to_user_id,
    })
}

/// 建单事务内核验转交目标真实存在且启用，避免把不可用用户快照到在途工单。
pub(crate) async fn validate_timeout_target(
    txn: &DatabaseTransaction,
    policy: &TimeoutPolicy,
) -> Result<(), AppError> {
    let target = user::Entity::find_by_id(policy.transfer_to_user_id)
        .one(txn)
        .await?
        .ok_or_else(|| {
            AppError::validation_displayable(format!(
                "审批节点配置的超时转交用户 ID {} 不存在，请在流程定义中重新选择转交用户",
                policy.transfer_to_user_id
            ))
        })?;
    if !target.is_active {
        return Err(AppError::validation_displayable(format!(
            "审批节点配置的超时转交用户 {} 已停用，请在流程定义中改用启用用户后重新提交",
            policy.transfer_to_user_id
        )));
    }
    Ok(())
}

/// 把超时策略合并到工单变量并计算到期时间，保留会签/或签已有签名轨迹。
pub(crate) fn apply_timeout_snapshot(
    variables: Value,
    policy: Option<&TimeoutPolicy>,
    now: DateTime<Utc>,
) -> Result<(Value, Option<DateTime<Utc>>), AppError> {
    let Some(policy) = policy else {
        return Ok((variables, None));
    };
    if !variables.is_null() && !variables.is_object() {
        return Err(AppError::validation_displayable(
            "审批工单变量必须是对象，无法写入超时策略快照",
        ));
    }
    let mut root: Map<String, Value> = variables.as_object().cloned().unwrap_or_default();
    root.insert(
        "timeout".to_string(),
        json!({
            "after_seconds": policy.after_seconds,
            "transfer_to_user_id": policy.transfer_to_user_id,
            "transfer_count": 0,
        }),
    );
    let due_date = now
        .checked_add_signed(Duration::seconds(policy.after_seconds))
        .ok_or_else(|| {
            AppError::validation_displayable(
                "审批节点的超时时间超出系统可表示范围，请缩短超时秒数后重新提交",
            )
        })?;
    Ok((Value::Object(root), Some(due_date)))
}

/// 读取快照中的转交次数；缺省只用于兼容本功能上线前已有变量形状。
pub(crate) fn transfer_count(variables: Option<&Value>) -> i64 {
    variables
        .and_then(|value| value.get("timeout"))
        .and_then(|value| value.get("transfer_count"))
        .and_then(Value::as_i64)
        .unwrap_or(0)
}

/// 记录签署席位委托；首次转交保存原处理人，后续转交不覆盖原始席位。
pub(crate) fn delegate_signature_seat(
    root: &mut Map<String, Value>,
    previous_handler_id: i32,
) -> Result<(), AppError> {
    if previous_handler_id <= 0 {
        return Err(AppError::business_displayable(
            "转交工单缺少有效原处理人，无法保留签署席位",
        ));
    }
    root.entry("delegated_from_user_id".to_string())
        .or_insert_with(|| json!(previous_handler_id));
    Ok(())
}

/// 转交后递增次数并保留其余变量，供通知去重与审计回读。
pub(crate) fn increment_transfer_count(
    variables: &Value,
    previous_handler_id: i32,
) -> Result<Value, AppError> {
    let Some(root) = variables.as_object() else {
        return Err(AppError::business_displayable(
            "超时工单变量快照不是对象，无法记录转交次数",
        ));
    };
    let mut root = root.clone();
    let mut timeout = root
        .get("timeout")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| {
            AppError::business_displayable("超时工单缺少 timeout 策略快照，无法记录转交次数")
        })?;
    let next = transfer_count(Some(&Value::Object(root.clone())))
        .checked_add(1)
        .ok_or_else(|| AppError::business_displayable("审批超时转交次数溢出"))?;
    timeout.insert("transfer_count".to_string(), json!(next));
    root.insert("timeout".to_string(), Value::Object(timeout));
    delegate_signature_seat(&mut root, previous_handler_id)?;
    Ok(Value::Object(root))
}
