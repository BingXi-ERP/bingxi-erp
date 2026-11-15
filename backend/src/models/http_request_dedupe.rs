#![allow(dead_code)]
//! HTTP 请求级幂等去重 Entity
//!
//! 对应数据库表：http_request_dedupe
//!
//! 用于中间件在分发前占位，拦截同一操作者对同一幂等键的重复提交（前端重复点击、
//! 网络重试、抓包重放）。主键 (user_id, idem_key) 保证同一账号下同一键只落一行；
//! method 与 path 记录占位挂在哪个接口上，request_hash 记录该次提交的内容指纹，
//! 用于区分「同键重放」与「同键换了内容」。status 取值 claimed / completed / failed：
//! claimed 是刚占位尚未出结果，completed 是已受理，failed 是服务端未受理、允许重试。

use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 占位状态：已占位、尚未有处理结果
pub const DEDUPE_STATUS_CLAIMED: &str = "claimed";
/// 占位状态：请求已被下游处理完（含业务拒绝，都不该再重放一次）
pub const DEDUPE_STATUS_COMPLETED: &str = "completed";
/// 占位状态：服务端 5xx，没有真正受理，同一键允许重新尝试
pub const DEDUPE_STATUS_FAILED: &str = "failed";

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "http_request_dedupe")]
pub struct Model {
    /// 操作者账号主键，键的作用域限定在该账号内，不同账号同键互不影响
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: i32,
    /// 客户端在 Idempotency-Key 请求头里带的幂等键
    #[sea_orm(primary_key, auto_increment = false)]
    pub idem_key: String,
    /// HTTP 方法（大写原文）
    pub method: String,
    /// 请求路径（不含查询串）
    pub path: String,
    /// 请求体指纹，用于识别同键换内容
    pub request_hash: String,
    /// claimed / completed / failed 三态之一
    pub status: String,
    /// 占位时间，同时也是清理过期行的依据
    pub created_at: DateTime<Utc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
