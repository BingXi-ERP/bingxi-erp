//! 周期任务执行可观测域
//!
//! 本域只建周期任务执行历史表 `scheduler_job_runs`，登记为一条顶层迁移台账：
//! - m0141_scheduler_job_runs：任务名/触发方式/起止时间/状态/影响行数/错误摘要
//!   六列一行一轮。写入方是 scheduler_framework 的 run_once 包装层与手动触发
//!   端点；读取方是 GET /scheduler/jobs 与 /scheduler/jobs/runs。
//!
//! 注册位置：全链尾。作为新的顶层域而非并入既有域——并入已应用的域在复用库上
//! 台账已记账、整体跳过，建表语句在存量库永远不会执行。`down` 精确 DROP 本表。

mod m0141_scheduler_job_runs;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_scheduler_observability"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0141_scheduler_job_runs::Migration.up(manager).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0141_scheduler_job_runs::Migration.down(manager).await?;
        Ok(())
    }
}
