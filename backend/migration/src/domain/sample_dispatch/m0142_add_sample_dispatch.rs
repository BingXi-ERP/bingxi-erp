//! `sample_dispatch_orders` / `sample_dispatch_items`：调样单实体数据地基
//!
//! 真实业务单据（WPS 表格取证）：行级明细（品名/缸号/颜色/色号/成分/米/单价/金额），
//! 汇总（货款总计/上单结余/上期欠款/实收/应收），制单/客户签收；单号格式
//! `BX-DY2607-1356`（前缀 + YYMM + 横杠 + 3 位流水，由开单方按该号段写入）。
//!
//! 列语义（判据逐条对应）：
//! - `document_no`：单据号，`uq_sample_dispatch_orders_document_no` 唯一索引兜底
//!   取号并发（与 m0063 补齐九表 UNIQUE 的同一结构，供
//!   `insert_with_no_retry` 的 23505 保存点重试）；
//! - `customer_id`：客户（`customers.id`，同宽 INTEGER），外键默认 NO ACTION
//!   照 m0082 的 FK 形态；
//! - `opening_balance`/`total_amount`/`total_collections`/`closing_balance`：
//!   与 `models/ar_reconciliation.rs` 的四个账务列一一对应（上单结余/应收即
//!   货款总计/实收/上期欠款），列型照 m0012 的 DECIMAL(18,2) NOT NULL；
//!   开单时由调用方写入，本切片不做事务联动；
//! - 明细 `composition` 直接落列（免 product JOIN 的口径争议），其余字段族照
//!   `sales_delivery_item` 的类型写法（米数 DECIMAL(12,2)/单价 DECIMAL(18,6)/
//!   金额 DECIMAL(18,2)）。
//!
//! 幂等与回滚：up 全程 `IF NOT EXISTS`（建表/建索引/注释），重跑等价，并以
//! RAISE NOTICE 把「本次是新建还是已存在」可见化；建表后关键列自检缺失即
//! RAISE EXCEPTION。只新增两表，不改任何既有表、不回填。down 对称：
//! 先 DROP 明细表再 DROP 主表（引用方先删），不触碰其它对象。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
-- 建表前先记录在场状态，供建表后的 NOTICE 区分「本次新建」与「已存在，重跑等价」
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = current_schema() AND table_name = 'sample_dispatch_orders')
    THEN
        RAISE NOTICE 'm0142：sample_dispatch_orders 已存在，本次重跑等价（IF NOT EXISTS 不改变任何行）';
    ELSE
        RAISE NOTICE 'm0142：sample_dispatch_orders 不存在，本次新建';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "sample_dispatch_orders" (
    "id" SERIAL PRIMARY KEY,
    "document_no" VARCHAR(50) NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "department" VARCHAR(100) NOT NULL DEFAULT '',
    "dispatch_date" DATE NOT NULL,
    "opening_balance" DECIMAL(18, 2) NOT NULL,
    "total_amount" DECIMAL(18, 2) NOT NULL,
    "total_collections" DECIMAL(18, 2) NOT NULL,
    "closing_balance" DECIMAL(18, 2) NOT NULL,
    "remarks" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fk_sample_dispatch_orders_customer" FOREIGN KEY ("customer_id") REFERENCES "customers" ("id")
);

-- 单号并发兜底唯一门（照 m0063/m0082 的 uq_<表>_<列> 形态）
CREATE UNIQUE INDEX IF NOT EXISTS "uq_sample_dispatch_orders_document_no"
    ON "sample_dispatch_orders" ("document_no");
CREATE INDEX IF NOT EXISTS "idx_sample_dispatch_orders_customer"
    ON "sample_dispatch_orders" ("customer_id");

COMMENT ON TABLE "sample_dispatch_orders" IS '调样单主表：行级明细见 sample_dispatch_items';
COMMENT ON COLUMN "sample_dispatch_orders"."document_no" IS '单据号（{前缀}{YYMM}-{3位流水}，样例 BX-DY2607-1356，开单方按该号段写入）';
COMMENT ON COLUMN "sample_dispatch_orders"."customer_id" IS '客户 ID（customers.id，同宽 INTEGER）';
COMMENT ON COLUMN "sample_dispatch_orders"."department" IS '制单部门';
COMMENT ON COLUMN "sample_dispatch_orders"."dispatch_date" IS '调样日期';
COMMENT ON COLUMN "sample_dispatch_orders"."opening_balance" IS '上单结余（与 ar_reconciliations.opening_balance 同语义）';
COMMENT ON COLUMN "sample_dispatch_orders"."total_amount" IS '货款总计=应收（与 ar_reconciliations.total_invoices 同语义位）';
COMMENT ON COLUMN "sample_dispatch_orders"."total_collections" IS '实收（与 ar_reconciliations.total_collections 同语义）';
COMMENT ON COLUMN "sample_dispatch_orders"."closing_balance" IS '上期欠款（与 ar_reconciliations.closing_balance 同语义位）';
COMMENT ON COLUMN "sample_dispatch_orders"."created_by" IS '制单人（users.id）';

CREATE TABLE IF NOT EXISTS "sample_dispatch_items" (
    "id" SERIAL PRIMARY KEY,
    "dispatch_order_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "dye_lot_no" VARCHAR(255) NOT NULL DEFAULT '',
    "color_no" VARCHAR(255) NOT NULL DEFAULT '',
    "composition" VARCHAR(255) NOT NULL DEFAULT '',
    "quantity_meters" DECIMAL(12, 2) NOT NULL,
    "unit_price" DECIMAL(18, 6) NOT NULL,
    "amount" DECIMAL(18, 2) NOT NULL,
    "remarks" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "fk_sample_dispatch_items_order" FOREIGN KEY ("dispatch_order_id") REFERENCES "sample_dispatch_orders" ("id"),
    CONSTRAINT "fk_sample_dispatch_items_product" FOREIGN KEY ("product_id") REFERENCES "products" ("id")
);

CREATE INDEX IF NOT EXISTS "idx_sample_dispatch_items_order"
    ON "sample_dispatch_items" ("dispatch_order_id");
CREATE INDEX IF NOT EXISTS "idx_sample_dispatch_items_product"
    ON "sample_dispatch_items" ("product_id");

COMMENT ON TABLE "sample_dispatch_items" IS '调样单行级明细：品名经 product_id 关联，缸号/颜色/色号/成分/米数/单价/金额直接落列';
COMMENT ON COLUMN "sample_dispatch_items"."dispatch_order_id" IS '所属调样单 ID（sample_dispatch_orders.id）';
COMMENT ON COLUMN "sample_dispatch_items"."dye_lot_no" IS '缸号（照 sales_delivery_item.v14 缸号字段族）';
COMMENT ON COLUMN "sample_dispatch_items"."color_no" IS '色号';
COMMENT ON COLUMN "sample_dispatch_items"."composition" IS '成分（直接落列，免 product JOIN 口径争议）';
COMMENT ON COLUMN "sample_dispatch_items"."quantity_meters" IS '米数（列型照 sales_delivery_item.quantity DECIMAL(12,2)）';
COMMENT ON COLUMN "sample_dispatch_items"."unit_price" IS '单价（照 sales_delivery_item.unit_price DECIMAL(18,6)）';
COMMENT ON COLUMN "sample_dispatch_items"."amount" IS '金额（照 sales_delivery_item.amount DECIMAL(18,2)）';
COMMENT ON COLUMN "sample_dispatch_items"."sort_order" IS '行序';

-- 建表后关键列自检：缺列即中止迁移链，禁止「表在但形状不对」静默过关
DO $$
BEGIN
    IF NOT (EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema()
                       AND table_name = 'sample_dispatch_orders' AND column_name = 'document_no')
          AND EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema()
                       AND table_name = 'sample_dispatch_orders' AND column_name = 'total_amount')
          AND EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema()
                       AND table_name = 'sample_dispatch_items' AND column_name = 'quantity_meters')
          AND EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = current_schema()
                       AND table_name = 'sample_dispatch_items' AND column_name = 'composition'))
    THEN
        RAISE EXCEPTION 'm0142：调样单两表关键列（document_no/total_amount/quantity_meters/composition）缺失，禁止静默放行';
    END IF;
END
$$;
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"DROP TABLE IF EXISTS "sample_dispatch_items";
DROP TABLE IF EXISTS "sample_dispatch_orders";"#,
            )
            .await?;
        Ok(())
    }
}
