//! 编码规则管理面 DTO。
//!
//! 功能 定义更新、回滚请求与详情出参；version 是调用方读取到的当前版本，
//!   服务层在行锁内复核，过期请求不覆盖新配置。
//! 调用方 `handlers/system_number_rule_handler.rs` 反序列化请求并交给服务层。
//! 入参 前缀、流水位数、重置周期与变更原因；回滚额外指定历史 revision ID。
//! 传给谁 `services/system_number_rule_service.rs`。
//! 存什么 请求本身不落库；服务层把规则快照写入 `system_number_rule_revisions`。
//! 存哪里 PostgreSQL 的规则主表与追加版本快照表。

use crate::models::system_number_rule::Model as RuleModel;
use crate::models::system_number_rule_revision::Model as RevisionModel;
use serde::{Deserialize, Serialize};

/// 版本快照的唯一结构化形状；拒绝未知字段，防止历史快照被误读为另一套配置。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NumberRuleConfigSnapshot {
    pub prefix: String,
    pub seq_width: i32,
    pub reset_mode: String,
}

/// 更新当前规则；rule_key 与 name 是稳定身份，不开放覆盖。
#[derive(Debug, Clone, Deserialize)]
pub struct UpdateNumberRuleRequest {
    pub prefix: String,
    pub seq_width: i32,
    pub reset_mode: String,
    pub version: i32,
    pub change_reason: String,
}

/// 回滚到指定历史快照；原快照不删除，回滚动作本身追加为新版本。
#[derive(Debug, Clone, Deserialize)]
pub struct RollbackNumberRuleRequest {
    pub revision_id: i32,
    pub version: i32,
    pub change_reason: String,
}

/// 规则详情由当前主记录与按版本倒序排列的完整历史组成。
#[derive(Debug, Clone, Serialize)]
pub struct RuleDetailDto {
    pub rule: RuleModel,
    pub revisions: Vec<RevisionModel>,
}
