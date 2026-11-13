//! 库存匹米数列扩到四位小数（m0128）
//!
//! inventory_piece.length 建表时是 DECIMAL(12,2)；production 域随后以
//! `ADD COLUMN IF NOT EXISTS "length" DECIMAL(18,4)` 想把它对齐计量口径，但该语句对
//! 已存在的列恒为 no-op，列型仍是 (12,2)。收回确认腿把收回数量原值送进本列
//! （outsourcing_ops/receipt.rs 透传 return_quantity → piece_domain_service.rs 的
//! length: Set(length_m)），两位列在库侧把 190.475 舍成 190.48，与收回单
//! outsourcing_receipt.return_quantity（DECIMAL(14,4)，存 190.4750）逐分对不上。
//!
//! 本域把 length 列型真正扩到 DECIMAL(18,4)，与收回数量的计量口径同源；出参序列化随之
//! 回到四位小数，收回数量腿与匹行米数腿逐分一致。扩位是无损变更，不改动任何存量值。
//! 域只改列型，绝不 UPDATE、绝不 DELETE 业务数据。
//!
//! 幂等：列已是 (18,4) 时打 NOTICE 跳过，可任意重跑；列不存在（该库未跑过建表/加列）
//! 同样跳过。down 收回列型到 DECIMAL(12,2) 前先探测是否存在小数位多于两位的行，
//! 命中即 RAISE EXCEPTION 点名中止，不截断已有四位精度数据；无此类行才回退列型。
//!
//! 依赖：目标表 inventory_piece 由 business 域建表、production 域补过 (18,4) 意图，
//! 均早于本域；本域排迁移链尾，在复用库属 pending 必然执行（并入已应用域会被台账跳过）。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"DO $m0128$
DECLARE
    v_col_exists boolean;
    v_numeric_scale int;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'inventory_piece' AND column_name = 'length'
    ) INTO v_col_exists;

    IF NOT v_col_exists THEN
        RAISE NOTICE 'm0128 跳过：inventory_piece.length 列不存在（该库未跑过建表/加列迁移）';
        RETURN;
    END IF;

    -- 列的定标口径取 information_schema.columns.numeric_scale——pg_attribute 里没有这一列
    -- （它只有 atttypmod，需 ((atttypmod - 4) & 65535) 反解），按 pg_attribute 直选 numeric_scale
    -- 会在运行期报 42703 column "numeric_scale" does not exist 并把整条迁移链打断。
    SELECT numeric_scale INTO v_numeric_scale
    FROM information_schema.columns
    WHERE table_name = 'inventory_piece'
      AND column_name = 'length'
      AND data_type = 'numeric';

    IF v_numeric_scale IS NOT NULL AND v_numeric_scale >= 4 THEN
        RAISE NOTICE 'm0128 跳过：inventory_piece.length 已是 % 位小数，无需扩到 4 位', v_numeric_scale;
        RETURN;
    END IF;

    RAISE NOTICE 'm0128 扩位：inventory_piece.length 由小数 % 位扩到 DECIMAL(18,4)（无损，不改存量值）', v_numeric_scale;
    EXECUTE 'ALTER TABLE "inventory_piece" ALTER COLUMN "length" TYPE DECIMAL(18, 4)';
END
$m0128$;"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"DO $m0128_down$
DECLARE
    v_frac_rows bigint;
    v_sample_ids text;
BEGIN
    SELECT COUNT(*) INTO v_frac_rows
    FROM inventory_piece
    WHERE length IS NOT NULL
      AND trim(trailing '0' from length::numeric::text) ~ '\.\d{3,}$';

    IF v_frac_rows > 0 THEN
        SELECT string_agg(id::text, ', ') INTO v_sample_ids
        FROM (
            SELECT id FROM inventory_piece
            WHERE length IS NOT NULL
              AND trim(trailing '0' from length::numeric::text) ~ '\.\d{3,}$'
            ORDER BY id
            LIMIT 20
        ) frac_rows;
        RAISE EXCEPTION
            'm0128 回退中止：探测到 % 行 length 小数位多于两位（样例 id：%），收回列型到 DECIMAL(12,2) 会截断四位精度数据。本迁移不 UPDATE 业务数据，不静默截断', v_frac_rows, v_sample_ids;
    END IF;

    EXECUTE 'ALTER TABLE "inventory_piece" ALTER COLUMN "length" TYPE DECIMAL(12, 2)';
END
$m0128_down$;"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
