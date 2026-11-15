//! flow_card_materials 表建表迁移（m0131）
//!
//! ## 六要素
//! - **功能**：创建流转卡投纱明细表 `flow_card_materials`，登记一张流转卡实际投入的
//!   成品纱线（纱线即产品档案的一条）及其数量与纱批次。
//! - **调用方**：SeaORM migrator 链，经 `domain/flow_card_material_input` 域注册为顶层链尾
//!   条目；实体映射见 `models/flow_card_material.rs`。
//! - **入参**：无（纯 DDL 迁移）。
//! - **传给谁**：无应用层直调；读写路径是流转卡投纱明细的增删改查端点与生产订单完工
//!   扣料聚合。
//! - **存什么**：所属流转卡、投放仓库、纱线产品 ID、与库存行同构的四维（纱批次、色号、
//!   缸号、等级）、投入数量 DECIMAL(14,4)、计量单位、备注、软删标记、建单人与两侧时间戳；
//!   纱的编号不落副本，读侧按 material_id 回 products.code。
//! - **存哪里**：PostgreSQL `public.flow_card_materials`，外键指向
//!   `production_flow_card(id)`（随卡删除级联）、`warehouses(id)` 与 `products(id)`
//!   （后两者被引用时拒绝删除）。
//!
//! ## 形态说明
//! - 数量口径是绝对投入量而非单耗：完工扣料按本表跨卡聚合后直接扣减，不再乘生产数量，
//!   故与委外发料明细 `outsourcing_order_item.quantity` 取同一个 DECIMAL(14,4)。
//! - 四维（batch_no、color_no、dye_lot_no、grade）与 `inventory_stock` 的库存行区分维度逐列
//!   同构且同为"字符串非空即参与匹配"，dye_lot_no 跟随库存侧可空；扣料按这四维加仓库与
//!   物料精确命中唯一库存行，不再只按物料 ID 取任意一行，因此批次追溯记的是操作者声明的
//!   事实而不是查询返回顺序。
//! - `unit` 受控为 kg 与 m 两值并与库存侧的公斤列与米数列一一对应：其它计量（码）不参与
//!   换算也不静默折算，落库即拒，避免出现"按米扣一个按公斤买的东西"的口径错位。
//! - `quantity` 不设默认值：投入量是该行的语义核心，缺值必须由建单失败暴露而不是被 0 掩盖。
//! - `CREATE TABLE IF NOT EXISTS` + 具名约束与具名索引：全新库直接建表，复用库上本域作为
//!   链尾新顶层条目必然执行，幂等可重放；本迁移不写入任何业务行，也不触碰其它表。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS "flow_card_materials" (
    "id" SERIAL PRIMARY KEY,
    "flow_card_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "material_id" INTEGER NOT NULL,
    "batch_no" VARCHAR(64) NOT NULL DEFAULT '',
    "color_no" VARCHAR(64) NOT NULL DEFAULT '',
    "dye_lot_no" VARCHAR(64),
    "grade" VARCHAR(16) NOT NULL DEFAULT '',
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" VARCHAR(8) NOT NULL,
    "remark" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_flow_card_materials_card FOREIGN KEY (flow_card_id)
        REFERENCES production_flow_card (id) ON DELETE CASCADE,
    CONSTRAINT fk_flow_card_materials_warehouse FOREIGN KEY (warehouse_id)
        REFERENCES warehouses (id) ON DELETE RESTRICT,
    CONSTRAINT fk_flow_card_materials_product FOREIGN KEY (material_id)
        REFERENCES products (id) ON DELETE RESTRICT,
    CONSTRAINT chk_flow_card_materials_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_flow_card_materials_unit CHECK (unit IN ('kg', 'm'))
);
COMMENT ON TABLE "flow_card_materials" IS '流转卡投纱明细:一张流转卡实际投入的成品纱线及其批次与投入量';
COMMENT ON COLUMN "flow_card_materials"."warehouse_id" IS '投放仓库 ID,与物料及四维共同定位被扣减的库存行';
COMMENT ON COLUMN "flow_card_materials"."material_id" IS '投入的纱线产品 ID,纱的编号按本列回 products.code 取,本表不存副本';
COMMENT ON COLUMN "flow_card_materials"."batch_no" IS '纱批次号,采购成品纱的批次;无批次时为空串,与库存侧同构';
COMMENT ON COLUMN "flow_card_materials"."color_no" IS '纱色号,与库存行四维之一,缺它则同种纱多色无法唯一命中库存行';
COMMENT ON COLUMN "flow_card_materials"."dye_lot_no" IS '缸号,跟随库存侧可空';
COMMENT ON COLUMN "flow_card_materials"."grade" IS '纱等级,一等二等等外价差大,缺它会扣错等外品';
COMMENT ON COLUMN "flow_card_materials"."quantity" IS '投入数量(绝对量,非单耗),按 unit 决定扣库存的公斤列还是米数列';
COMMENT ON COLUMN "flow_card_materials"."unit" IS '计量单位,受控两值 kg 与 m,其它单位落库即拒';
CREATE INDEX IF NOT EXISTS idx_flow_card_materials_card ON flow_card_materials (flow_card_id);
CREATE INDEX IF NOT EXISTS idx_flow_card_materials_stock ON flow_card_materials (warehouse_id, material_id);
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
DROP INDEX IF EXISTS idx_flow_card_materials_stock;
DROP INDEX IF EXISTS idx_flow_card_materials_card;
DROP TABLE IF EXISTS "flow_card_materials";
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
