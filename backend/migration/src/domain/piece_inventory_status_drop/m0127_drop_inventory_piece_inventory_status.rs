//! 库存匹冗余库存状态列探测式下线（m0127）
//!
//! 裁定口径（库存匹第二套状态列收口工单）：inventory_piece 的状态真相列是 status，
//! inventory_status 是它的照抄副本，全仓零读取方（扫码、台账、外发准入与 CAS 流转只比 status，
//! 前端与移动端零消费），且历史写入方漂成三种形态（大写常量、小写字面量 available、拆匹子卷留空）。
//! 代码面已先停止读写本列并从实体摘除字段，本迁移负责把列形态收掉。迁移绝不 UPDATE、
//! 绝不 DELETE 业务数据。
//!
//! 先探测后约束的失败可见形态。DROP 前先探测：若库里存在 inventory_status 非空且与 status
//! 不同值的行，说明该列携带过 status 没有的信息（与「副本照抄真相列」的前提冲突），
//! 立即 RAISE EXCEPTION 点名行数与样例 id 并中止，绝不静默 DROP 掉有信息量的数据；
//! 这类行须由人工把正确值并入 status 后重跑本迁移。探测通过（不等的非空行数为 0，
//! 含本列全空、或与 status 全同值的所有形态）才执行 DROP。
//!
//! 大小写归一不属本迁移职责。v15 域第 7 节已把两列词表钉成大写并回填过历史小写行，
//! 本探测用精确等值比较，因此残留的小写形态会被当作“携带过独立信息”拦下而不是被忽略，
//! 这正是期望行为：宁可中止交人工核对，也不带着未对账的副本下线。
//!
//! 幂等。列不存在（已下线，或该库从未跑过加列迁移）时打印 NOTICE 直接跳过，可任意重跑；
//! down 加回可空列（IF NOT EXISTS），只恢复形态不伪造数据。
//!
//! 依赖。目标表 inventory_piece 由 business 域建表、本列由 business 与 production 两域各加一次
//! （ADD COLUMN IF NOT EXISTS 形态，只先跑的生效），均早于本域；本域排迁移链尾，晚于代码面下线
//! 无需迁移感知（列可空、无 CHECK、无默认值、无依赖对象，DROP 不牵连索引与约束）。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"DO $m0127$
DECLARE
    v_col_exists boolean;
    v_dirty_count bigint;
    v_sample_ids text;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_piece' AND column_name = 'inventory_status'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        RAISE NOTICE 'm0127 跳过：inventory_piece.inventory_status 列不存在（已下线或该库未跑过加列迁移）';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_dirty_count
    FROM inventory_piece
    WHERE inventory_status IS NOT NULL
      AND status IS DISTINCT FROM inventory_status;

    IF v_dirty_count > 0 THEN
        SELECT string_agg(id::text, ', ') INTO v_sample_ids
        FROM (
            SELECT id FROM inventory_piece
            WHERE inventory_status IS NOT NULL
              AND status IS DISTINCT FROM inventory_status
            ORDER BY id
            LIMIT 20
        ) dirty_rows;
        RAISE EXCEPTION
            'm0127 拒绝下线 inventory_status：探测到 % 行该列非空且与 status 不等，列携带过独立信息（样例 id：%）。本迁移不 UPDATE 业务数据，请先人工把正确值并入 status 后重跑', v_dirty_count, v_sample_ids;
    END IF;

    RAISE NOTICE 'm0127 探测通过（inventory_status 非空且与 status 不等的行为 0），下线 inventory_piece.inventory_status';
    EXECUTE 'ALTER TABLE "inventory_piece" DROP COLUMN "inventory_status"';
END
$m0127$;"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"ALTER TABLE "inventory_piece" ADD COLUMN IF NOT EXISTS "inventory_status" VARCHAR(255);
COMMENT ON COLUMN "inventory_piece"."inventory_status" IS '库存状态（已裁定废弃）：真相列是 status，本列历史形态是它的照抄副本；本列仅回退形态恢复空壳，不回填数据';"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
