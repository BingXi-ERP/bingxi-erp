//! HTTP 请求级幂等去重域（防重放与重复提交）。
//!
//! 本域只落一条台账，登记为新的顶层域而非并入已应用域：已应用域在复用库上台账已记账、
//! 整体跳过，嵌在其中的建表语句在存量库永远不会执行（与 audit_append_only_guard 立为顶层域
//! 的同一口径）。链尾新域名在复用库上属 pending，必然执行。
//! - m0137_create_http_request_dedupe: 建 http_request_dedupe 表，主键 (user_id, idem_key)，
//!   带方法、路径、请求体指纹与占位态，供请求级幂等中间件原子占位与失败释放。
//!
//! 依赖关系：本表不给 user_id 加外键，users 表不由迁移创建（初始化服务晚于 migrate），
//! 加 FK 会让存量库建表直接失败。除本表外无其他表依赖，也不被任何既有表依赖。
//! 与写腿的关系：唯一写腿是 src/middleware/idempotency.rs 的请求级中间件，
//! 事件消费侧的去重仍走 processed_events，两张表互不越界。
//!
//! down 只回收本域建的表与其索引。

mod m0137_create_http_request_dedupe;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_http_idempotency_guard"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0137_create_http_request_dedupe::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0137_create_http_request_dedupe::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
