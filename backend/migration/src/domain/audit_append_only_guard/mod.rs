//! 审计日志表只追加约束域（DB 层防篡改）。
//!
//! 本域只落一条台账，登记为新的顶层域而非并入 system 或 v15 已应用域：已应用域在复用库上
//! 台账已记账、整体跳过，嵌在其中的建触发器语句在存量库永远不会执行（本仓有 m0102 由
//! business 域升为顶层域、m0121 立为 scan_receipt_grant 顶层域的同一先例）。
//! 链尾新域名在复用库上属 pending，必然执行。
//! - m0136_guard_audit_logs_append_only: 给 audit_logs 与 omni_audit_logs 各建
//!   BEFORE UPDATE 与 BEFORE DELETE 行级触发器，UPDATE 一律拒绝，DELETE 只认同一事务内
//!   显式声明 app.audit_purge = on 的保留期清理通道。
//!
//! 依赖关系：两张表分别由 system 域 m0001 与 m0005 先建，早于本域；表缺失时
//! CREATE TRIGGER 直接报错并打断链，不做静默兜底。
//! 与写腿的关系：唯一的合法删除写腿是 `src/services/audit_cleanup_service.rs` 的
//! 保留期清理，该通道在同一事务内声明开关；仓内没有任何对这两张表的 UPDATE 写腿。
//!
//! down 只回收本域建的 4 枚触发器与 1 枚函数，不碰任何数据行。

mod m0136_guard_audit_logs_append_only;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_audit_append_only_guard"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0136_guard_audit_logs_append_only::Migration
            .up(manager)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0136_guard_audit_logs_append_only::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
