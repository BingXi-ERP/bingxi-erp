//! 运单多态订单列遗留单表外键下线：收掉 `logistics_waybills.order_id` 上只指向
//! `sales_orders` 的外键 `fk_logistics_waybills_order`。
//!
//! ## 用途
//! order_id 是多态引用列，指向哪张单据表由 order_type 决定（词表
//! sales_order/purchase_order/transfer_order，见 logistics_waybill.rs 实体注释与
//! v15 域加列注释）。建表域 m0011_add_sales_and_logistics_extensions.rs 在 order_id
//! 尚只指销售订单的年代给它挂了单表外键；关联采购单链路（logistics_service.rs 的
//! link_purchase_order）把采购单主键写进 order_id 并置 order_type='purchase_order'，
//! 采购单主键不在 sales_orders 里，UPDATE 被该外键拒绝，整个关联动作落不了库。
//! 多态列无法用单表外键表达，参照完整性由两条写入路径在事务内回查保证：
//! 建单侧 logistics_handler.rs 回查 sales_order 存在才插运单，关联侧
//! logistics_service.rs 回查 purchase_order 存在才改写 order_id。本域把与写入语义
//! 冲突的遗留外键收掉，并给 order_id 补上多态语义的列注释。
//!
//! ## 语义与幂等
//! - up 先查 pg_constraint：外键不存在（已下线）时打 NOTICE 跳过，可任意重跑；
//!   存在才 DROP CONSTRAINT。DROP 外键不触碰任何业务数据行。
//! - down 恢复外键前先探测孤儿行：凡 order_id 不在 sales_orders 的运单行（含合法
//!   的采购单关联行）都使 ADD CONSTRAINT 无法通过校验，立即 RAISE EXCEPTION 点名
//!   行数与样例运单 id 并中止，交人工对账后重跑，绝不静默删行或 NOT VALID 绕过；
//!   外键已存在时打 NOTICE 跳过。down 同时撤掉 up 补的列注释，恢复建表时的无注释形态。
//!
//! ## 注册位置
//! 作为链尾新顶层域而非并入既有域：并入已应用的域会在复用库上因台账已记账而被
//! 整体跳过，DROP 永不执行；链尾新域名在复用库属 pending，必然执行。新库上建表域
//! 先建出外键、本域随后收掉，两种库形态收敛到同一终态。依赖 logistics_waybills
//! 建表（business 域）与 order_type 加列（v15 域），二者均早于本域完成。

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_logistics_waybill_order_fk_drop"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"DO $waybill_order_fk_drop$
DECLARE
    v_fk_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_logistics_waybills_order'
          AND conrelid = '"logistics_waybills"'::regclass
    ) INTO v_fk_exists;

    IF NOT v_fk_exists THEN
        RAISE NOTICE '跳过：logistics_waybills 上不存在外键 fk_logistics_waybills_order（已下线）';
        RETURN;
    END IF;

    EXECUTE 'ALTER TABLE "logistics_waybills" DROP CONSTRAINT "fk_logistics_waybills_order"';
    RAISE NOTICE '已下线 logistics_waybills.order_id 的遗留单表外键 fk_logistics_waybills_order';
END
$waybill_order_fk_drop$;

COMMENT ON COLUMN "logistics_waybills"."order_id" IS '来源单据主键（多态引用）：由 order_type 决定指向哪张单据表（词表 sales_order/purchase_order/transfer_order）。参照完整性由写入方在事务内回查对应单据存在保证（建单回查 sales_orders，关联采购单回查 purchase_orders），库层不设单表外键';"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"DO $waybill_order_fk_restore$
DECLARE
    v_fk_exists boolean;
    v_orphan_count bigint;
    v_sample_ids text;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_logistics_waybills_order'
          AND conrelid = '"logistics_waybills"'::regclass
    ) INTO v_fk_exists;

    IF v_fk_exists THEN
        RAISE NOTICE '跳过回退：外键 fk_logistics_waybills_order 已存在';
        RETURN;
    END IF;

    SELECT COUNT(*) INTO v_orphan_count
    FROM "logistics_waybills" w
    WHERE NOT EXISTS (
        SELECT 1 FROM "sales_orders" s WHERE s."id" = w."order_id"
    );

    IF v_orphan_count > 0 THEN
        SELECT string_agg(dirty."id"::text, ', ') INTO v_sample_ids
        FROM (
            SELECT w."id" FROM "logistics_waybills" w
            WHERE NOT EXISTS (
                SELECT 1 FROM "sales_orders" s WHERE s."id" = w."order_id"
            )
            ORDER BY w."id"
            LIMIT 20
        ) dirty;
        RAISE EXCEPTION
            '拒绝恢复 fk_logistics_waybills_order：% 行运单的 order_id 不在 sales_orders（样例运单 id：%）。多态关联行须先人工对账处置后重跑', v_orphan_count, v_sample_ids;
    END IF;

    EXECUTE 'ALTER TABLE "logistics_waybills" ADD CONSTRAINT "fk_logistics_waybills_order" FOREIGN KEY ("order_id") REFERENCES "sales_orders" ("id")';
END
$waybill_order_fk_restore$;

COMMENT ON COLUMN "logistics_waybills"."order_id" IS NULL;"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
