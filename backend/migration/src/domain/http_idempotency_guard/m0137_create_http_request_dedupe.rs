//! http_request_dedupe 请求级幂等去重表迁移
//!
//! 建表时间: 2026-11-12
//! 关联缺口：补测专项 4.2「并发创建单据不重复」「并发审批状态只流转一次」与 4.1 H 段
//! 「浏览器多标签页同时点保存仅一条落库」在 HTTP 面上没有任何防线，抓包重放同一请求体
//! 会各生成一条单据、各扣一次库存。事件侧已有 processed_events 去重表，但语义绑定事件
//! 消费（consumer_id 是消费者标识），不承担请求级去重，故另立一张表而不是复用。
//!
//! 主键 (user_id, idem_key) 的取值口径：幂等键的命名空间属于发起请求的用户，
//! 不带用户维度的全局唯一键会让两个用户互相占用同一个键名（客户端普遍用 UUID，
//! 但撞名一旦发生就变成跨用户拒绝，属可用性缺陷）。
//!
//! request_hash 存方法、路径与请求体的 SHA-256 十六进制：同一键第二次带同样的
//! 请求体是重放，带不同请求体是键复用，两种情形拒因不同，必须都能分辨，
//! 因此只存键不存指纹不够。
//!
//! status 列记录占位态，词表与写入方逐字符相同：claimed 表示请求已进门但结果未知，
//! completed 表示下游已受理（2xx 与 3xx），failed 表示未被受理（4xx 与 5xx）。
//! 未受理的占位改写为 failed 而不是删除，同一把键改完内容即可重试；claimed 超过保留
//! 窗口视为被放弃，由后续请求接管，避免进程被杀后键被永久锁死。
//!
//! 不加外键：users 表不由迁移创建（初始化服务晚于 migrate 建用户），给 user_id 加
//! FK 会让存量库上的建表直接失败，这是仓内既有的同一口径。
//!
//! down 只回收本表与其索引，不碰其他表。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS http_request_dedupe (
    user_id      INTEGER NOT NULL,
    idem_key     VARCHAR(200) NOT NULL,
    method       VARCHAR(10) NOT NULL,
    path         VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'claimed',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, idem_key)
);

CREATE INDEX IF NOT EXISTS idx_http_request_dedupe_created_at
    ON http_request_dedupe(created_at);
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared("DROP TABLE IF EXISTS http_request_dedupe;")
            .await?;
        Ok(())
    }
}
