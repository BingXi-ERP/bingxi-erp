//! 周期任务执行历史表建表
//!
//! ## 六要素
//! - **功能**：建 `scheduler_job_runs` 表，给 13 枚周期任务的每轮执行落一行
//!   历史（任务名/触发方式/开始结束时间/结果状态/影响行数/错误摘要），把
//!   "任务在跑"升级成"任务每轮跑成什么样"。此前调度面无任何执行历史，
//!   任务失败只散落在日志流里，无法回答"上次成功是什么时候"。
//! - **调用方**：SeaORM migrator 链，经 `domain/scheduler_observability` 域
//!   注册，置于全链尾。写入面是 `utils/scheduler_framework.rs` 的
//!   `run_once` 包装层（每轮执行前后落行）；读取面是手动触发端点
//!   `GET /scheduler/jobs` 与 `GET /scheduler/jobs/runs`（同一支）。
//! - **入参**：无。纯 DDL。
//! - **传给谁**：`SchemaManager` 的裸 SQL 连接。消费方是框架写入层与查询端点。
//! - **存什么**：id SERIAL 主键、scheduler_name（VARCHAR(128)，与
//!   Scheduler::name() 同源）、trigger（VARCHAR(16)，词表 schedule/manual）、
//!   started_at/finished_at（TIMESTAMPTZ）、status（VARCHAR(16)，词表
//!   success/failed/running）、affected（BIGINT 可空，任务语义是"处理条数"
//!   时落值）、error_message（TEXT 可空，失败摘要截断到 2000 字符）。
//! - **存哪里**：PostgreSQL `public.scheduler_job_runs`。
//!
//! ## 形态说明
//! - 建表与索引一律 `IF NOT EXISTS`，幂等可重放。
//! - 不加外键：scheduler_name 是任务名快照不是外键，任务改名后历史行仍可读。
//! - 词表三态以写入方为权威（框架包装层逐字符写入），status='running' 是
//!   写入前占位，崩溃残留行由查询端点按超窗显式标注而不伪造终结。
//! - `down` 精确 DROP 本表与索引，无其他表引用。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS scheduler_job_runs (
    id            SERIAL PRIMARY KEY,
    scheduler_name VARCHAR(128) NOT NULL,
    trigger       VARCHAR(16) NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    status        VARCHAR(16) NOT NULL DEFAULT 'running',
    affected      BIGINT,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduler_job_runs_name_time
    ON scheduler_job_runs(scheduler_name, started_at DESC);
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS scheduler_job_runs;")
            .await?;
        Ok(())
    }
}
