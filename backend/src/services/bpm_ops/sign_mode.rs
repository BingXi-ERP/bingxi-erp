//! BPM 审批分支模式：会签 / 或签 / 默认单人 + 加签留痕。
//!
//! 唯一模式源是流程定义 `bpm_process_definition.config` 的顶层 `node_modes` 对象：
//! `node_id -> "countersign" | "orsign"`；键缺失或值为 `"single"` 一律走原单人语义。
//! 词表外取值 fail-closed 报validation_displayable，禁止按单人静默放行。
//!
//! 多处理人来源为节点 `assignee_ids`（正整数 JSON 数组），每位处理人各有一枚
//! `bpm_task`（同一 instance + node_id）；签名轨迹落在该任务 `task_variables`：
//! `{"sign_mode":"...","signatures":[{"user_id":..,"user_name":..,"action":..,...}],
//!   "add_signs":[{"actor_id":..,"added_ids":[..],"reason":..,"at":..}]}`。
//! 不新增表/列、不改 approve 动作词表（delegate/transfer 仍非法）。

use sea_orm::{DatabaseTransaction, EntityTrait};

use crate::models::user;
use crate::utils::error::AppError;

pub(crate) const COUNTERSIGN: &str = "countersign";
pub(crate) const ORSIGN: &str = "orsign";
pub(crate) const SINGLE: &str = "single";

/// 从流程定义 config 读取节点的签署模式；配置缺失/对象形状错误 fail-closed。
pub(crate) fn node_sign_mode(
    config: Option<&serde_json::Value>,
    node_id: &str,
) -> Result<String, AppError> {
    let Some(config) = config else {
        return Ok(SINGLE.to_string());
    };
    let Some(modes) = config.get("node_modes") else {
        return Ok(SINGLE.to_string());
    };
    if modes.is_null() {
        return Ok(SINGLE.to_string());
    }
    let Some(obj) = modes.as_object() else {
        return Err(AppError::validation_displayable(
            "流程配置的节点签署模式必须是「节点ID → 模式」对象",
        ));
    };
    let Some(mode) = obj.get(node_id) else {
        return Ok(SINGLE.to_string());
    };
    let Some(mode) = mode.as_str() else {
        return Err(AppError::validation_displayable(format!(
            "节点 {node_id} 的签署模式必须是字符串"
        )));
    };
    match mode {
        COUNTERSIGN | ORSIGN | SINGLE => Ok(mode.to_string()),
        _ => Err(AppError::validation_displayable(format!(
            "节点 {node_id} 的签署模式 {mode} 不在允许取值内（countersign / orsign / single）"
        ))),
    }
}

/// 解析节点 `assignee_ids`；非多人模式返回空列表（调用方按单人路径处理）。
pub(crate) fn node_assignee_ids(node: &serde_json::Value) -> Result<Vec<i32>, AppError> {
    let Some(raw) = node.get("assignee_ids") else {
        return Ok(Vec::new());
    };
    let Some(array) = raw.as_array() else {
        return Err(AppError::validation_displayable(
            "多人签署节点的 assignee_ids 必须是用户 ID 数组",
        ));
    };
    let mut ids = Vec::new();
    for value in array {
        let Some(id) = value.as_i64() else {
            return Err(AppError::validation_displayable(
                "多人签署节点的 assignee_ids 必须为整数用户 ID",
            ));
        };
        if id <= 0 || id > i32::MAX as i64 {
            return Err(AppError::validation_displayable(
                "多人签署节点的 assignee_ids 必须为正整数用户 ID",
            ));
        }
        let id = id as i32;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    Ok(ids)
}

/// 逐用户核真实性并取姓名（real_name 优先空则 username），不造占位名。
pub(crate) async fn resolve_assignees(
    txn: &DatabaseTransaction,
    ids: &[i32],
) -> Result<Vec<(i32, String)>, AppError> {
    let mut resolved = Vec::new();
    for id in ids {
        let Some(row) = user::Entity::find_by_id(*id).one(txn).await? else {
            return Err(AppError::validation_displayable(format!(
                "审批人用户 ID {id} 不存在，无法创建会签/或签任务"
            )));
        };
        let name = row
            .real_name
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .unwrap_or(row.username.clone());
        if name.is_empty() {
            return Err(AppError::validation_displayable(format!(
                "审批人用户 ID {id} 无有效姓名，无法创建会签/或签任务"
            )));
        }
        resolved.push((*id, name));
    }
    Ok(resolved)
}

fn root_object(vars: Option<&serde_json::Value>) -> serde_json::Map<String, serde_json::Value> {
    vars.and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

/// 初始化多签署任务的 task_variables（含模式、空签名与加签轨迹）。
pub(crate) fn init_variables(mode: &str) -> serde_json::Value {
    serde_json::json!({
        "sign_mode": mode,
        "signatures": [],
        "add_signs": [],
    })
}

/// 追记一次签署；同一 user_id 的重复动作返回 false（调用方据此判幂等拒绝）。
pub(crate) fn append_signature(
    vars: Option<&serde_json::Value>,
    user_id: i32,
    user_name: &str,
    action: &str,
    opinion: Option<&str>,
) -> (serde_json::Value, bool) {
    let mut root = root_object(vars);
    let mut signatures = root
        .get("signatures")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if signatures.iter().any(|s| {
        s.get("user_id").and_then(|v| v.as_i64()) == Some(user_id as i64)
            && s.get("action").and_then(|v| v.as_str()) == Some(action)
    }) {
        return (serde_json::Value::Object(root), false);
    }
    signatures.push(serde_json::json!({
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "opinion": opinion.unwrap_or(""),
        "at": chrono::Utc::now().to_rfc3339(),
    }));
    root.insert(
        "signatures".to_string(),
        serde_json::Value::Array(signatures),
    );
    (serde_json::Value::Object(root), true)
}

/// 统计某节点已完成指定动作的签署人集合（跨该节点各处理人任务合并去重）。
/// 超时或人工转交后的代理人票按 `delegated_from_user_id` 计入原签署席位，
/// 避免保留原 assignee_ids 后代理人永远无法满足会签/或签完成条件。
pub(crate) fn signed_user_ids(
    variables: impl IntoIterator<Item = Option<serde_json::Value>>,
    action: &str,
) -> Vec<i32> {
    let mut ids = Vec::new();
    for vars in variables {
        let Some(vars) = vars else { continue };
        let Some(signatures) = vars.get("signatures").and_then(|v| v.as_array()) else {
            continue;
        };
        let delegated_from = vars
            .get("delegated_from_user_id")
            .and_then(serde_json::Value::as_i64)
            .and_then(|id| i32::try_from(id).ok())
            .filter(|id| *id > 0);
        for sig in signatures {
            if sig.get("action").and_then(|v| v.as_str()) != Some(action) {
                continue;
            }
            let Some(signer_id) = sig.get("user_id").and_then(|v| v.as_i64()) else {
                continue;
            };
            let id = if let Some(original_id) = delegated_from {
                original_id
            } else {
                match i32::try_from(signer_id) {
                    Ok(id) if id > 0 => id,
                    _ => continue,
                }
            };
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    ids
}

/// 追记一次加签（谁、加了谁、原因、时间），供任务详情与审计双向回读。
pub(crate) fn append_add_sign(
    vars: Option<&serde_json::Value>,
    actor_id: i32,
    actor_name: &str,
    added_ids: &[i32],
    reason: Option<&str>,
) -> serde_json::Value {
    let mut root = root_object(vars);
    let mut traces = root
        .get("add_signs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    traces.push(serde_json::json!({
        "actor_id": actor_id,
        "actor_name": actor_name,
        "added_ids": added_ids,
        "reason": reason.unwrap_or(""),
        "at": chrono::Utc::now().to_rfc3339(),
    }));
    root.insert("add_signs".to_string(), serde_json::Value::Array(traces));
    serde_json::Value::Object(root)
}

/// 在已有处理人集合上去重追加新 ID；空/重复返回空列表。
pub(crate) fn merge_assignees(existing: &[i32], added: &[i32]) -> Vec<i32> {
    let mut result = existing.to_vec();
    for id in added {
        if *id > 0 && !result.contains(id) {
            result.push(*id);
        }
    }
    result
}
