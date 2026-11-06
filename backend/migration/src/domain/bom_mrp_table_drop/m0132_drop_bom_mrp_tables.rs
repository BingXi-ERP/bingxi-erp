//! boms/bom_items/mrp_results 三表的下线迁移（m0132）
//!
//! ## 六要素
//! - **功能**：DROP 掉 BOM 与 MRP 整族功能落库的三张表 `bom_items`、`boms`、`mrp_results`，
//!   并把它们从 schema 中摘除。
//! - **调用方**：SeaORM migrator 链，经 `domain/bom_mrp_table_drop` 域注册为链尾新顶层条目；
//!   应用侧对这三表的读写面（models/handlers/services/routes）由同批次的代码面下线一并摘除。
//! - **入参**：无（纯 DDL 迁移）。
//! - **传给谁**：无应用层直调；本迁移执行后这三张表不再存在，任何仍引用它们的 SQL 都会报错，
//!   故代码面必须先完成下线再落本迁移（先改代码，再收表形态）。
//! - **存什么**：不存任何数据；本迁移只做表结构删除，不搬运、不导出、不备份任何行。
//! - **存哪里**：无落库目标；被删除的三表原位于 PostgreSQL `public` schema。
//!
//! ## 承载位置说明
//! 本迁移 DROP 的是 BOM 与 MRP 的表。厂里不纺纱、只采购成品纱线再织染，纱种/纱编号/纱批次
//! 这类纱批事实的承载位置是流转卡投纱明细 `flow_card_materials`（见
//! `domain/flow_card_material_input`，实体 `models/flow_card_material.rs`），生产订单完工扣料
//! 已改为按投纱逐行扣减，不再依赖 BOM 多级配方与单耗展开。缺料预警两表
//! （`material_shortage_alerts`、`material_shortage_threshold_configs`）不在本迁移范围，保留。
//!
//! ## DROP 次序与不用 CASCADE 的理由
//! 实测三表的入向外键只有一处：`business` 域建 `bom_items` 时的具名约束
//! `fk_bom_items_bom`（bom_items.bom_id → boms.id）；`bom_items` 与 `mrp_results` 无任何
//! 入向外键。故按 `bom_items → boms → mrp_results` 逐表 DROP：先删引用方再删被引用方，
//! 无依赖阻塞，无需 CASCADE。禁止 CASCADE——它会静默带走将来可能新增的引用者，掩盖真实
//! 依赖面；一旦有未知引用者存在，本迁移宁可报错中止也不悄悄级联删除。
//!
//! ## 幂等
//! 三句均为 `DROP TABLE IF EXISTS`，重跑或该库本无这三表时命中 0，等价可重放。
//!
//! ## down 不完全可逆（如实说明，不假装可回滚）
//! down 只按建表时的列定义与具名索引重建三张**空表结构**（与 `business` 域对这三表的建表语句
//! 对称），**不恢复任何历史数据行**：up 的 DROP 已随表删除 BOM 配方明细与 MRP 计算结果，
//! 回滚只回骨架、不回数据。这是本迁移刻意接受的不对称——BOM/MRP 下线是功能级删除，
//! 回退场景只用于紧急恢复 schema 形状，真实业务数据须由上线 runbook 的备份单独处置，
//! 不在迁移内做数据搬运。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 次序固定：bom_items(引用方) → boms(被引用方) → mrp_results(独立)。逐条精确 DROP，
        // 不使用 CASCADE。
        let sql = r#"
DROP TABLE IF EXISTS "bom_items";
DROP TABLE IF EXISTS "boms";
DROP TABLE IF EXISTS "mrp_results";
COMMENT ON COLUMN "inventory_stocks"."replenishment_strategy" IS '补货策略：reorder_point/eoq';
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 只回空表结构，不回数据：boms 先建（bom_items 的具名外键引用它），再建 bom_items，
        // mrp_results 独立最后。列定义与索引名逐字对齐建表时的原始 DDL。
        let sql = r#"
CREATE TABLE IF NOT EXISTS "boms" (
    "id" SERIAL PRIMARY KEY,
    "product_id" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "remarks" TEXT,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_boms_product" ON "boms" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_boms_status" ON "boms" ("status");
COMMENT ON TABLE "boms" IS 'BOM物料清单表 - 存储产品物料清单';
CREATE TABLE IF NOT EXISTS "bom_items" (
    "id" SERIAL PRIMARY KEY,
    "bom_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "quantity" DECIMAL(12, 4) NOT NULL,
    "unit" VARCHAR(20),
    "scrap_rate" DECIMAL(5, 4) DEFAULT 0,
    "sort_order" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fk_bom_items_bom" FOREIGN KEY ("bom_id") REFERENCES "boms" ("id")
);
CREATE INDEX IF NOT EXISTS "idx_bom_items_bom" ON "bom_items" ("bom_id");
CREATE INDEX IF NOT EXISTS "idx_bom_items_material" ON "bom_items" ("material_id");
COMMENT ON TABLE "bom_items" IS 'BOM明细表 - 存储物料清单明细';
CREATE TABLE IF NOT EXISTS "mrp_results" (
    "id" SERIAL PRIMARY KEY,
    "calculation_no" VARCHAR(50) NOT NULL UNIQUE,
    "product_id" INTEGER NOT NULL,
    "required_quantity" DECIMAL(12, 2) NOT NULL,
    "required_date" DATE,
    "source_type" VARCHAR(20) NOT NULL,
    "source_id" INTEGER,
    "planned_order_quantity" DECIMAL(12, 2),
    "planned_order_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    "remarks" TEXT,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "idx_mrp_results_product" ON "mrp_results" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_mrp_results_status" ON "mrp_results" ("status");
CREATE INDEX IF NOT EXISTS "idx_mrp_results_date" ON "mrp_results" ("required_date");
COMMENT ON TABLE "mrp_results" IS 'MRP计算结果表 - 存储物料需求计划计算结果';
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
