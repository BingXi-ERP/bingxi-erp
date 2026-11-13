//! audit_logs 与 omni_audit_logs 补 DB 层只追加约束（4.11 审计日志不可篡改）
//!
//! ## 六要素
//! - **功能**：给两张审计日志表建 BEFORE UPDATE 与 BEFORE DELETE 行级触发器，
//!   把"只能追加"从事务纪律升级成库侧硬约束，越权改写或删除在库层直接失败。
//! - **调用方**：顶层域 audit_append_only_guard（台账名 m_audit_append_only_guard）的链尾
//!   聚合迁移调用。立为顶层域而不并入 system 或 v15 已应用域：已应用域在复用库上台账
//!   已记账、整体跳过，嵌在其中的建触发器语句在存量库永远不会执行。
//! - **入参**：无。表名、函数名、触发器名与例外通道键都是本文件的编译期常量，
//!   无外部输入拼接。
//! - **传给谁**：`SchemaManager` 的裸 SQL 连接。写腿例外通道由
//!   `backend/src/services/audit_cleanup_service.rs` 的保留期清理在同一事务内
//!   `SET LOCAL app.audit_purge = 'on'` 显式声明，别的任何连接都拿不到这个开关。
//! - **存什么**：`pg_proc` 里一枚 plpgsql 触发器函数与 `pg_trigger` 里四行触发器
//!   （两张表各 UPDATE 与 DELETE 一枚）。不改任何数据行，不加任何列。
//! - **存哪里**：PostgreSQL `public` 模式下的系统目录，业务表数据零改动。
//!
//! ## 为什么删除要留一条声明式通道
//! 本仓的保留期清理是既有功能：`audit_cleanup_service.rs` 按 retention_days
//! 删过期审计行，且是定时任务链路上的正常写腿（4.6 定时任务）。若无条件禁 DELETE，
//! 加了这道门就把保留期清理打死，属真回归。因此删除侧只认同一事务内显式声明的
//! `app.audit_purge`，声明即留痕（该语句与 DELETE 同事务，回读事务日志可证），
//! 未声明的删除一律拒绝。UPDATE 没有任何合法写腿（全仓 grep 零命中），一律拒绝。
//!
//! ## 幂等与安全
//! 函数用 `CREATE OR REPLACE`，触发器先 `DROP ... IF EXISTS` 再 `CREATE`，重跑等价。
//! 两张表在 system 域 m0001 与 m0005 先建，晚于它们的本域不需要存在性兜底：
//! 表不在时 `CREATE TRIGGER` 直接报错并打断链，不静默跳过，避免"门没建上却报成功"。
//! 拒因文案带表名与通道名，错误码统一 check_violation，与既有
//! `fn_audit_log_export_log_immutable`（v15 域，audit_log_export_log 表）同一形态。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// 受约束的两张审计日志表（表名即库内实名）
const GUARDED_TABLES: &[&str] = &["audit_logs", "omni_audit_logs"];

/// 触发器函数名（两表共用一枚函数）
const GUARD_FUNCTION: &str = "fn_audit_logs_append_only";

/// 保留期清理通道的会话级开关名，值必须为 on
const PURGE_FLAG: &str = "app.audit_purge";

fn trigger_name(table: &str, op: &str) -> String {
    format!("trg_{table}_no_{op}")
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let mut stmts = String::new();

        stmts.push_str(&format!(
            r#"CREATE OR REPLACE FUNCTION "{GUARD_FUNCTION}"()
RETURNS TRIGGER AS $guard$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION '审计日志表 % 为只追加表，禁止 UPDATE', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE'
       AND COALESCE(current_setting('{PURGE_FLAG}', true), '') <> 'on' THEN
        RAISE EXCEPTION '审计日志表 % 禁止未声明保留期清理通道的 DELETE（须在同一事务内 SET LOCAL {PURGE_FLAG} = ''on''）', TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
END;
$guard$ LANGUAGE plpgsql;
"#
        ));

        for table in GUARDED_TABLES {
            for op in ["update", "delete"] {
                let trg = trigger_name(table, op);
                stmts.push_str(&format!(
                    r#"DROP TRIGGER IF EXISTS "{trg}" ON "{table}";
CREATE TRIGGER "{trg}"
    BEFORE {upper_op} ON "{table}"
    FOR EACH ROW
    EXECUTE FUNCTION "{GUARD_FUNCTION}"();
"#,
                    upper_op = op.to_uppercase()
                ));
            }
        }

        let sql = format!(
            r#"
-- 1) 先做非致命可见化：两张受管表在当前库是否存在、此前是否已有同名触发器
DO $$
DECLARE
    missing TEXT;
    already INTEGER;
BEGIN
    SELECT string_agg(t, ', ' ORDER BY t)
      INTO missing
      FROM (
        SELECT a AS t FROM unnest(ARRAY['audit_logs', 'omni_audit_logs']) a
         WHERE to_regclass(a) IS NULL
      ) m;
    SELECT COUNT(*) INTO already
      FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname IN ('trg_audit_logs_no_update', 'trg_audit_logs_no_delete',
                      'trg_omni_audit_logs_no_update', 'trg_omni_audit_logs_no_delete');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'm0136：受管审计表在当前库缺失（%），只追加约束不予静默跳过', missing;
    END IF;
    RAISE NOTICE 'm0136：审计只追加约束就位；此前已存在同名触发器 % 枚（0 枚属首次建门，4 枚属重跑等价）', already;
END $$;

-- 2) 函数与四枚触发器
{stmts}
-- 3) 收口自检：必须恰有 4 枚非内部触发器挂上，少一枚即判负，不靠"没报错"当通过
DO $$
DECLARE
    attached INTEGER;
BEGIN
    SELECT COUNT(*) INTO attached
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal
       AND c.relname IN ('audit_logs', 'omni_audit_logs')
       AND t.tgname IN ('trg_audit_logs_no_update', 'trg_audit_logs_no_delete',
                        'trg_omni_audit_logs_no_update', 'trg_omni_audit_logs_no_delete');
    IF attached <> 4 THEN
        RAISE EXCEPTION 'm0136：期望 4 枚只追加触发器就位，实际 % 枚', attached;
    END IF;
    RAISE NOTICE 'm0136：audit_logs 与 omni_audit_logs 的 UPDATE 与 DELETE 行级门均已就位（% 枚）', attached;
END $$;
"#,
            stmts = stmts
        );

        let conn = manager.get_connection();
        conn.execute_unprepared(&sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let mut stmts = String::new();
        for table in GUARDED_TABLES {
            for op in ["update", "delete"] {
                stmts.push_str(&format!(
                    "DROP TRIGGER IF EXISTS \"{}\" ON \"{}\";\n",
                    trigger_name(table, op),
                    table
                ));
            }
        }
        let sql = format!(
            r#"{stmts}
DROP FUNCTION IF EXISTS "{GUARD_FUNCTION}"();
"#,
            stmts = stmts
        );
        let conn = manager.get_connection();
        conn.execute_unprepared(&sql).await?;
        Ok(())
    }
}
