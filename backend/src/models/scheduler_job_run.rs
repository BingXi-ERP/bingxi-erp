//! 周期任务执行历史 Entity
//!
//! 对应数据库表：scheduler_job_runs（迁移 m0141）。
//!
//! 由 `utils/scheduler_framework.rs` 的包装层在每轮执行前后写入：
//! 先插一行 status='running'，执行完回填 finished_at/status/affected/error_message。
//! 手动触发的执行走同一写入层，trigger='manual' 与定时行可区分。
//! 读取面是 `handlers/scheduler_handler.rs` 的任务清单与执行历史查询端点。

use chrono::{DateTime, Utc};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "scheduler_job_runs")]
pub struct Model {
    /// 执行记录主键
    #[sea_orm(primary_key)]
    pub id: i32,
    /// 调度器名（Scheduler::name() 同源快照，非外键）
    pub scheduler_name: String,
    /// 触发方式：schedule 定时循环，manual 手动触发端点
    pub trigger: String,
    /// 本轮开始时间（插入占位行时即落值）
    pub started_at: DateTime<Utc>,
    /// 本轮结束时间（执行完成回填；崩溃残留行保持 NULL）
    pub finished_at: Option<DateTime<Utc>>,
    /// 本轮状态：running 执行中占位，success 成功，failed 失败
    pub status: String,
    /// 影响行数（任务语义是"处理条数"时落值；纯校验型任务可空）
    pub affected: Option<i64>,
    /// 失败摘要（Err(String) 原文截断到 2000 字符）
    pub error_message: Option<String>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
