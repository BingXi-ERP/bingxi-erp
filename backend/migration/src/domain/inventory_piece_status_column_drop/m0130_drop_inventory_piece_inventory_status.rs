//! 裁片库存状态死列探测式下线（m0130）
//!
//! 功能 下线 inventory_piece.inventory_status 死列的列形态。本列不参与出库与入库
//! 任一腿的判定，全库无读取方，细码状态一律以同表 status 列为权威（词表见
//! models/status/purchase_inventory.rs 的 inventory_piece 模块，大写六值）。代码面的
//! 读写点与实体字段已在本支同步摘除（services/piece_domain_service.rs、
//! services/scan_inbound.rs、services/fabric_inspection_service.rs、
//! services/bulk_color_approval_service.rs、handlers/piece_split_handler.rs、
//! models/inventory_piece.rs），先改代码、后收列形态，本迁移收尾。
//!
//! 先探测后下线的失败可见形态。DROP 前探测两件事。其一，列上若挂着索引或约束
//! （外键、唯一、CHECK），删列会级联静默带走它们，属需要人工裁定的依赖对象，
//! 立即 RAISE EXCEPTION 点名中止，绝不静默破坏。其二，列上若仍有默认值，同样
//! 点名报告，默认值随列消失但写入方已不再消费本列。残留非空值与词表外脏值不阻断
//! 下线，只逐值点名报告。死列滞后于权威列正是它不再随写的事实表现，权威值始终在
//! status 列，本列的值在下线前整表备份进专属备份表。
//!
//! 备份语义。下线前把本列非空行的行主键与原值写入
//! m_inventory_piece_inventory_status_drop_backup 表，NOT EXISTS 守卫保证重跑不
//! 重复插行。down 加回可空列后按备份逐行还原原值并删除备份表，实现精确回退。
//! up 自身绝不 UPDATE、绝不 DELETE 任何业务表数据，业务行只读。
//!
//! 幂等。列不存在（已下线，或该库从未跑过加列语句）时打印 NOTICE 直接跳过，
//! 可任意重跑。备份表创建用 IF NOT EXISTS，还原与清理用存在性守卫。
//!
//! 依赖。目标表 inventory_piece 由既有域先建，本列由 business 域与 production 域
//! 的加列语句以 IF NOT EXISTS 形态添加，v15 域做过小写值归一，均早于本域。本域排
//! lib.rs 迁移链尾为新的顶层条目，复用库上属 pending 必然执行。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// 建备份表。存什么 本列非空行的行主键与原值。存哪里 public 下专属备份表。
const CREATE_BACKUP_TABLE_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS "m_inventory_piece_inventory_status_drop_backup" (
    "piece_id" INTEGER PRIMARY KEY,
    "old_inventory_status" VARCHAR(255)
);
"#;

/// 探测、备份、点名报告并 DROP 的单一 DO 块。入参 无，全部从库内目录与表数据现查。
/// 传给谁 探测结论经 RAISE 通道交给迁移日志，脏值样例与计数供人工回读。
const PROBE_BACKUP_DROP_SQL: &str = r#"
DO $m0130$
DECLARE
    v_col_exists boolean;
    v_dep_names text;
    v_default_present boolean;
    v_nonnull_rows bigint;
    v_dirty_rows bigint;
    v_dirty_values text;
    v_backed_up bigint;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_piece' AND column_name = 'inventory_status'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        RAISE NOTICE 'm0130 跳过。inventory_piece.inventory_status 列不存在（已下线或该库从未执行过加列语句）';
        RETURN;
    END IF;

    SELECT string_agg(dep_name, ', ') INTO v_dep_names
    FROM (
        SELECT c.relname AS dep_name
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class c ON c.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (ix.indkey)
        WHERE t.relname = 'inventory_piece' AND a.attname = 'inventory_status'
        UNION ALL
        SELECT con.conname
        FROM pg_constraint con
        WHERE con.conrelid = 'inventory_piece'::regclass
          AND con.contype IN ('c', 'u', 'f')
          AND pg_get_constraintdef(con.oid) LIKE '%inventory_status%'
    ) deps;

    IF v_dep_names IS NOT NULL THEN
        RAISE EXCEPTION 'm0130 拒绝下线 inventory_status。探测到依赖本列的索引或约束（%），删列将级联静默带走它们，须人工先裁定依赖对象再去重跑本迁移', v_dep_names;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_attrdef d
        JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE a.attrelid = 'inventory_piece'::regclass AND a.attname = 'inventory_status'
    ) INTO v_default_present;

    IF v_default_present THEN
        RAISE NOTICE 'm0130 报告。inventory_status 列上存在默认值，随列一并消失；代码面写入方已全部摘除对本列的写，不再生效';
    END IF;

    INSERT INTO "m_inventory_piece_inventory_status_drop_backup" ("piece_id", "old_inventory_status")
    SELECT p."id", p."inventory_status"
      FROM "inventory_piece" p
     WHERE p."inventory_status" IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM "m_inventory_piece_inventory_status_drop_backup" b
           WHERE b."piece_id" = p."id"
       );
    GET DIAGNOSTICS v_backed_up = ROW_COUNT;

    SELECT COUNT(*) INTO v_nonnull_rows
    FROM inventory_piece
    WHERE inventory_status IS NOT NULL;

    SELECT COUNT(*) INTO v_dirty_rows
    FROM inventory_piece
    WHERE inventory_status IS NOT NULL
      AND inventory_status NOT IN ('AVAILABLE', 'UNAVAILABLE', 'RESERVED', 'SHIPPED', 'DEFECT', 'SAMPLE');

    IF v_dirty_rows > 0 THEN
        SELECT string_agg(DISTINCT inventory_status, ', ') INTO v_dirty_values
        FROM inventory_piece
        WHERE inventory_status IS NOT NULL
          AND inventory_status NOT IN ('AVAILABLE', 'UNAVAILABLE', 'RESERVED', 'SHIPPED', 'DEFECT', 'SAMPLE');
        RAISE NOTICE 'm0130 点名脏值。inventory_status 有 % 行取值在大写权威词表之外（值清单：%），原值已备份，不阻断下线', v_dirty_rows, v_dirty_values;
    END IF;

    RAISE NOTICE 'm0130 探测通过（无索引与约束依赖），inventory_status 非空 % 行已全部备份（本次新备 % 行），下线 inventory_piece.inventory_status', v_nonnull_rows, v_backed_up;
    EXECUTE 'ALTER TABLE "inventory_piece" DROP COLUMN "inventory_status"';
END
$m0130$;
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(CREATE_BACKUP_TABLE_SQL).await?;
        conn.execute_unprepared(PROBE_BACKUP_DROP_SQL).await?;
        Ok(())
    }

    /// down 语义 加回可空空壳列，随后按备份表逐行还原本列原值并清理备份表。
    /// 还原到本域 up 之前的快照；up 之后若有旁路写入不在本回退契约内。备份表
    /// 不在本库上时如实打印无可回退内容，不误报回退成功。
    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared(RESTORE_COLUMN_SQL).await?;
        conn.execute_unprepared(RESTORE_FROM_BACKUP_SQL).await?;
        Ok(())
    }
}

/// 加回可空列（IF NOT EXISTS），形态先于还原就位。
const RESTORE_COLUMN_SQL: &str = r#"
ALTER TABLE "inventory_piece" ADD COLUMN IF NOT EXISTS "inventory_status" VARCHAR(255);
"#;

/// 按备份逐行还原并删除备份表。单一 DO 块内完成，避免列在、备份不在的中间形态。
const RESTORE_FROM_BACKUP_SQL: &str = r#"
DO $m0130_down$
DECLARE
    v_restored bigint;
BEGIN
    IF to_regclass('public.m_inventory_piece_inventory_status_drop_backup') IS NULL THEN
        RAISE NOTICE 'm0130 down 跳过还原。备份表不在本库上（本域未在此库执行过 up 或非首次回退），列形态已就位，无值可回退';
        RETURN;
    END IF;
    UPDATE "inventory_piece" p
       SET "inventory_status" = b."old_inventory_status"
      FROM "m_inventory_piece_inventory_status_drop_backup" b
     WHERE b."piece_id" = p."id";
    GET DIAGNOSTICS v_restored = ROW_COUNT;
    RAISE NOTICE 'm0130 down 按备份逐行还原 inventory_status，回退 % 行', v_restored;
    DROP TABLE IF EXISTS "m_inventory_piece_inventory_status_drop_backup";
END
$m0130_down$;
"#;
