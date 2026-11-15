#![allow(dead_code)]
//! 微信公众号通知重试队列 Model
//!
//! 存储公众号模板消息发送失败的待重投记录

use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 队列状态（与 email_log 同形：PENDING 待发送 / SENDING 发送中 / SENT 已发送 / FAILED 死信）
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::N(20))")]
pub enum OutboxStatus {
    /// 待发送
    #[sea_orm(string_value = "PENDING")]
    Pending,
    /// 发送中
    #[sea_orm(string_value = "SENDING")]
    Sending,
    /// 已发送
    #[sea_orm(string_value = "SENT")]
    Sent,
    /// 重试耗尽死信
    #[sea_orm(string_value = "FAILED")]
    Failed,
}

/// 模板字段占位的持久化形态（出队时还原为 TemplateField）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboxField {
    /// 公众号模板占位符名（如 first、keyword1）
    pub key: String,
    /// 渲染文本
    pub value: String,
}

/// 微信公众号通知重试队列 Entity
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "wechat_mp_notification_outbox")]
pub struct Model {
    /// 记录 ID（主键）
    #[sea_orm(primary_key)]
    pub id: i32,

    /// 目标 ERP 用户 ID
    pub user_id: i32,

    /// 事件类型稳定 ASCII 标识（与 processed_events.event_type 同词表）
    pub kind: String,

    /// 公众号收件人 openid（入队时点快照）
    pub openid: String,

    /// 去重业务对象标识（如报价单号）
    pub business_key: String,

    /// 模板消息跳转目标
    pub jump_url: Option<String>,

    /// 模板字段数组 [{key,value}]
    pub fields: Json,

    /// 队列状态
    pub status: String,

    /// 最近一次发送失败原因
    pub error_message: Option<String>,

    /// 已重试次数
    pub retry_count: i32,

    /// 下次重试时间（NULL 表示立即可重试）
    pub next_retry_at: Option<DateTime<Utc>>,

    /// 最终发送成功时间
    pub sent_at: Option<DateTime<Utc>>,

    /// 入队时间
    pub created_at: DateTime<Utc>,

    /// 队列行最后变更时间
    pub updated_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
