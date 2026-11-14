//! 列表模糊查询列补 pg_trgm GIN 索引
//!
//! ## 六要素
//! - **功能**：对全仓 services 层 `like(...)` 模糊过滤落到的高频列表查询列建
//!   `gin (col gin_trgm_ops)` 索引。这些查询全部经 `safe_like_pattern` 包成
//!   `%关键字%` 前导通配形态，B-tree 对该形态完全失效，列表页关键字筛选在
//!   数据量上来后是逐行扫描；trigram GIN 索引对 `%xx%` 形态可直接走索引。
//! - **调用方**：SeaORM migrator 链，经 `domain/like_acceleration` 域注册，置于
//!   全链尾。读面是各业务 service 的列表查询（customer_ops/so/order_query/
//!   product_ops/crm/lead 等约 30 处 like 过滤点），查询语句零改动即可受益。
//! - **入参**：无。表名与列名是本文件编译期常量，逐一对照
//!   `backend/src/models/*.rs` 的 `table_name` 与字段名核实，无外部输入拼接。
//! - **传给谁**：`SchemaManager` 的裸 SQL 连接。索引只被 PG 查询规划器消费。
//! - **存什么**：`pg_extension` 里一行 `pg_trgm` 扩展与 `pg_indexes` 里每表
//!   一行 GIN 索引。不改任何表结构与数据行。
//! - **存哪里**：PostgreSQL `public` 模式业务表上的二级索引。
//!
//! ## 收录口径（为何是这批列）
//! 只收真实读面用 `like()` 过滤的列（全仓 grep `.like(` 逐调用点核对），按
//! `表.列` 去重后 14 对。未收的列要么无 like 过滤点、要么已收。CRM 线索的
//! 四列（company_name/contact_name/mobile_phone/email）虽是线索域，但线索
//! 列表按关键字筛选是高频操作，一并收录。
//!
//! ## 幂等与安全
//! 扩展用 `CREATE EXTENSION IF NOT EXISTS`，索引全部 `CREATE INDEX IF NOT
//! EXISTS`，重跑等价。`down` 精确 DROP 本域建的索引；pg_trgm 扩展不卸载
//! （卸载扩展会连带殃及库内可能存在的其它 trgm 索引，且扩展本身无运行时代价）。
//! BOM/MRP 表已在 m0132 下线，本清单不含其列。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// (表名, 列名) 清单，逐一对照 backend/src/models/*.rs 的 table_name 与字段名
const TRGM_COLUMNS: &[(&str, &str)] = &[
    ("customers", "customer_name"),
    ("products", "name"),
    ("products", "code"),
    ("sales_orders", "order_no"),
    ("sales_quotations", "quotation_no"),
    ("sales_contracts", "contract_name"),
    ("suppliers", "supplier_name"),
    ("warehouses", "warehouse_code"),
    ("product_colors", "color_no"),
    ("product_colors", "color_name"),
    ("color_cards", "card_name"),
    ("crm_lead", "company_name"),
    ("crm_lead", "contact_name"),
    ("crm_lead", "mobile_phone"),
    ("crm_lead", "email"),
    ("purchase_receipt", "receipt_no"),
    ("purchase_return", "return_no"),
    ("purchase_contracts", "contract_name"),
    ("production_orders", "order_no"),
    ("custom_orders", "order_no"),
    ("inventory_stocks", "batch_no"),
    ("inventory_stocks", "color_no"),
    ("quality_inspection_records", "batch_no"),
    ("fabric_inspection_record", "inspection_no"),
    ("wage_record", "record_no"),
    ("cost_collections", "collection_no"),
    ("fixed_assets", "asset_name"),
    ("account_subjects", "name"),
    ("product_categories", "name"),
    ("departments", "name"),
    ("departments", "description"),
];

fn index_name(table: &str, col: &str) -> String {
    format!("idx_{table}_{col}_trgm")
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        conn.execute_unprepared("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
            .await?;
        for (table, col) in TRGM_COLUMNS {
            let sql = format!(
                "CREATE INDEX IF NOT EXISTS {} ON {} USING gin ({} gin_trgm_ops);",
                index_name(table, col),
                table,
                col
            );
            conn.execute_unprepared(&sql).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        for (table, col) in TRGM_COLUMNS {
            let sql = format!("DROP INDEX IF EXISTS {};", index_name(table, col));
            conn.execute_unprepared(&sql).await?;
        }
        Ok(())
    }
}
