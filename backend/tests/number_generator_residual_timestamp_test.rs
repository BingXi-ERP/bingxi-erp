//! 契约锁：残余手写时间戳拼号收口到 `DocumentNumberGenerator`。
//!
//! 覆盖点位（前缀常量 → 落库列 → UNIQUE 证据）：
//! - `services/warehouse_service.rs`：`WH` → `warehouses.warehouse_code`
//!   UNIQUE（migration/src/domain/system/m0001_initial_schema.rs:281），
//!   人工传入码原样保留、仅缺省自动取号；
//! - `services/scheduling_auto.rs`：`SCH` → `scheduling_result.batch_no`
//!   无 UNIQUE（m0007_...rs:129 NOT NULL、:148 普通索引），事务内取号防同号。
//!
//! 分层策略（对齐既有先例）：
//! 1. 静态源码契约（无需 DB，必跑）：时间戳/随机数拼号已消失、取号与 INSERT
//!    同事务的标记在场、失败路径为 business_displayable 且不得退化为时间戳兜底、
//!    前缀常量与原业务前缀同源、UNIQUE 新列已登记 `is_document_no_taken`；
//! 2. 活库行为层（`#[ignore]`，由 ci-test-rust-ignored 专用 job 在已迁移 PG 上
//!    以 `--run-ignored only` 执行，需 `TEST_DATABASE_URL`）：真实表真实列上
//!    事务内取号 + 派生子行不撞 UNIQUE、仓库服务自动/人工两条路径行为、
//!    排程批次号取号格式。sqlite::memory: 无法承载 `pg_advisory_xact_lock`，
//!    取号机制本身的行为契约由 number_generator_*_test.rs 在活库覆盖。

use bingxi_backend::services::scheduling_auto::SCHEDULE_BATCH_NO_PREFIX;
use bingxi_backend::services::warehouse_service::WAREHOUSE_CODE_NO_PREFIX;
use std::path::PathBuf;

fn read(rel: &str) -> String {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push(rel);
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("读取 {} 失败: {e}", p.display()))
}

/// 取字符串开头的连续大写字母段（对齐 contract_wave2_dye_number_generation_test.rs）
fn leading_alpha(s: &str) -> String {
    s.chars().take_while(|c| c.is_ascii_uppercase()).collect()
}

const WHS: &str = "src/services/warehouse_service.rs";
const SCH_AUTO: &str = "src/services/scheduling_auto.rs";
const GEN: &str = "src/utils/number_generator.rs";

// =========================================================
// 静态层 1：时间戳拼号形态必须已消失，且取号在调用方事务内
// =========================================================

#[test]
fn warehouse_code_no_longer_concatenates_timestamp_and_keeps_manual_code() {
    let src = read(WHS);
    assert!(
        !src.contains("timestamp_millis") && !src.contains("random_4_digit"),
        "warehouse_service.rs 仍残留时间戳+随机数拼码"
    );
    // UNIQUE 列单行单据 → insert_with_no_retry（SAVEPOINT 重试），且在同一事务内
    assert!(
        src.contains("(*self.db).begin()")
            && src.contains("DocumentNumberGenerator::insert_with_no_retry("),
        "仓库自动编码必须走 insert_with_no_retry 且与 INSERT 同事务"
    );
    // 人工传入码原样保留（对齐 fixed_asset/quality_standard 分支形态），且不得被重试改名
    assert!(
        src.contains("req.code.clone().filter(|c| !c.is_empty())")
            && src.contains("Some(code) =>")
            && src.contains("Self::build_warehouse_active_model(code, &req, manager_id)"),
        "人工传入仓库编码必须原样直插，不允许进入重新取号路径"
    );
    assert!(
        src.contains("AppError::business_displayable(\"仓库编码生成失败，请稍后重试\")"),
        "仓库编码取号失败必须 business_displayable 外显"
    );
}

#[test]
fn scheduling_batch_no_longer_concatenates_timestamp_second_format() {
    let src = read(SCH_AUTO);
    assert!(
        !src.contains("random_6_digit") && !src.contains("%Y%m%d%H%M%S"),
        "scheduling_auto.rs 仍残留秒级时间戳+随机数拼号"
    );
    // batch_no 无 UNIQUE：事务内 generate_no_with_txn（advisory lock 串行化），不走 retry
    assert!(
        src.contains("(*self.db).begin()")
            && src.contains("DocumentNumberGenerator::generate_no_with_txn("),
        "排程批次号必须事务内取号（无约束列走 generate_no_with_txn 形态）"
    );
    assert!(
        !src.contains("insert_with_no_retry("),
        "scheduling_result.batch_no 无 UNIQUE，不应误用 retry 路径（应锁在取号侧防同号）"
    );
    assert!(
        src.contains("AppError::business_displayable(\"排程批次号生成失败，请稍后重试\")"),
        "排程批次号取号失败必须 business_displayable 外显"
    );
}

// =========================================================
// 静态层 2：前缀常量与原业务前缀同源、互不套叠、登记集中
// =========================================================

#[test]
fn prefix_constants_are_pure_uppercase_and_match_legacy_prefixes() {
    for prefix in [WAREHOUSE_CODE_NO_PREFIX, SCHEDULE_BATCH_NO_PREFIX] {
        assert!(!prefix.is_empty(), "前缀常量不得为空");
        assert!(
            leading_alpha(prefix) == prefix,
            "前缀 {prefix} 必须是纯大写字母（生成器格式不允许分隔符）"
        );
    }
    // 业务识别键不许改名（原手写格式即以这些字母段开头）
    assert_eq!(WAREHOUSE_CODE_NO_PREFIX, "WH");
    assert_eq!(SCHEDULE_BATCH_NO_PREFIX, "SCH");
}

#[test]
fn registry_registers_new_unique_document_no_columns() {
    let src = read(GEN);
    let (doc_type, col_expr) = ("warehouse", "warehouse::Column::WarehouseCode.eq(no)");
    assert!(
        src.contains(&format!("\"{doc_type}\" =>")),
        "带 UNIQUE 的新收口单据号列必须登记 is_document_no_taken：缺 {doc_type}"
    );
    assert!(
        src.contains(col_expr),
        "注册表 {doc_type} 必须指向真实实体真实列 {col_expr}"
    );
}

// =========================================================
// 静态层 3：DDL UNIQUE 证据锚定（迁移文件是"有无 UNIQUE"的唯一事实来源，
// 判定文案若与迁移原文漂移，本测试变红逼两边同步）
// =========================================================

#[test]
fn ddl_evidence_for_unique_and_non_unique_columns_unchanged() {
    let m0007_ddl = read("migration/src/domain/business/m0007_add_mrp_production_bom.rs");
    assert!(
        m0007_ddl.contains("\"batch_no\" VARCHAR(50) NOT NULL,"),
        "scheduling_result.batch_no 必须维持无 UNIQUE（m0007:129）；若迁移侧新增约束，\
        本测试变红并要求把取号路径升级为 insert_with_no_retry"
    );
    let wh_ddl = read("migration/src/domain/system/m0001_initial_schema.rs");
    assert!(
        wh_ddl.contains("\"warehouse_code\" VARCHAR(50) NOT NULL UNIQUE"),
        "warehouses.warehouse_code 的 UNIQUE 判定依据（m0001:281）与迁移原文不符"
    );
}

// =========================================================
// 行为层（活库 PG，#[ignore]，由 ci-test-rust-ignored 执行）：
// 真实表真实列上演练"事务内取号 + 派生子行 / 自动与人工两条路径"
// =========================================================

#[cfg(test)]
mod live_pg {
    use super::{SCHEDULE_BATCH_NO_PREFIX, WAREHOUSE_CODE_NO_PREFIX};
    use bingxi_backend::handlers::warehouse_handler::CreateWarehouseRequest;
    use bingxi_backend::models::{scheduling_result, warehouse};
    use bingxi_backend::services::warehouse_service::WarehouseService;
    use bingxi_backend::utils::number_generator::DocumentNumberGenerator;
    use chrono::Utc;
    use sea_orm::{
        ActiveModelTrait, ColumnTrait, EntityTrait, ExprTrait, PaginatorTrait, QueryFilter, Set,
        TransactionTrait,
    };
    use std::sync::Arc;

    async fn live_db() -> sea_orm::DatabaseConnection {
        let url = std::env::var("TEST_DATABASE_URL")
            .expect("活库用例必须设置 TEST_DATABASE_URL（指向已跑完迁移的 PostgreSQL）");
        sea_orm::Database::connect(&url)
            .await
            .expect("测试夹具：活库连接失败")
    }

    fn today() -> String {
        Utc::now().format("%Y%m%d").to_string()
    }

    /// 结构校验：`{prefix}{YYYYMMDD}{3位数字流水}`
    fn assert_standard_format(no: &str, prefix: &str) {
        let rest = no
            .strip_prefix(prefix)
            .unwrap_or_else(|| panic!("{no} 应以 {prefix} 开头（新格式契约）"));
        let (date_part, seq_part) = rest.split_at(8);
        assert!(
            date_part.chars().all(|c| c.is_ascii_digit()) && date_part == today(),
            "{no} 日期段应为当日(UTC) 8 位数字，实际 {date_part}"
        );
        assert!(
            seq_part.len() == 3 && seq_part.chars().all(|c| c.is_ascii_digit()),
            "{no} 流水段应为 3 位数字，实际 {seq_part}"
        );
    }

    fn make_schedule_row(batch_no: String) -> scheduling_result::ActiveModel {
        let now = Utc::now();
        let today = now.date_naive();
        scheduling_result::ActiveModel {
            batch_no: Set(batch_no),
            strategy: Set("PRIORITY".to_string()),
            status: Set("DRAFT".to_string()),
            total_orders: Set(0),
            scheduled_orders: Set(0),
            unscheduled_orders: Set(0),
            conflict_count: Set(0),
            schedule_start_date: Set(today),
            schedule_end_date: Set(today),
            created_by: Set(1),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        }
    }

    /// SCH：无 UNIQUE 列上的事务内取号——同事务连续两次必须拿到连续不同号
    /// （advisory lock + 本事务可见性；这是"无约束列防同号"的机制本体）。
    #[tokio::test]
    #[ignore = "需已迁移 PG（pg_advisory_xact_lock），由 ci-test-rust-ignored 执行"]
    async fn live_pg_scheduling_batch_no_consecutive_in_one_txn() {
        let db = live_db().await;
        let txn = db.begin().await.expect("开启事务失败");
        let mut got = Vec::new();
        for round in 1..=2 {
            let no = DocumentNumberGenerator::generate_no_with_txn(
                &txn,
                SCHEDULE_BATCH_NO_PREFIX,
                scheduling_result::Entity,
                scheduling_result::Column::BatchNo,
            )
            .await
            .unwrap_or_else(|e| panic!("第 {round} 轮取号失败: {e:?}"));
            assert_standard_format(&no, SCHEDULE_BATCH_NO_PREFIX);
            make_schedule_row(no.clone())
                .insert(&txn)
                .await
                .unwrap_or_else(|e| panic!("插入 {no} 失败: {e}"));
            got.push(no);
        }
        assert_ne!(
            got[0], got[1],
            "同事务连续取号不得相同（探测需见本事务未提交插入）"
        );
        txn.rollback().await.expect("回滚失败");
    }

    /// WH：服务两条路径——缺省自动取号命中标准格式；人工码原样保留且
    /// 重复人工码显式报错（不许静默改名/重新取号）。
    #[tokio::test]
    #[ignore = "需已迁移 PG（pg_advisory_xact_lock + warehouses UNIQUE），由 ci-test-rust-ignored 执行"]
    async fn live_pg_warehouse_create_auto_and_manual_paths() {
        let db = live_db().await;
        let svc = WarehouseService::new(Arc::new(db.clone()));
        let nanos = Utc::now().timestamp_nanos_opt().unwrap_or(0);
        let manual_code = format!("WH-MANUAL-{nanos}");

        // 1) 人工传入码：原样保留
        let created_manual = svc
            .create(make_req(Some(manual_code.clone())), 1)
            .await
            .expect("人工码创建应成功");
        assert_eq!(
            created_manual.warehouse_code, manual_code,
            "人工传入编码必须原样落库（fixed_asset/quality_standard 同型分支）"
        );

        // 2) 重复人工码：显式业务拒绝 + 零副作用。
        //    分类口径（warehouse_service.rs:106-153「同事务预校验 + 23505 归类」范式）：
        //    人工码已存在属**用户可自行修正的业务冲突** ⇒ BUSINESS_ERROR；
        //    真撞 warehouse_code UNIQUE 的并发兜底分支同样归口业务拒绝，
        //    只有非唯一类 DbErr 才原样上抛。旧前提"23505 必须以 DatabaseError 上抛"
        //    在预校验落地后已不可达（预校验先拦，根本走不到 23505），
        //    且 500 族分类与"业务拒绝→BUSINESS_ERROR"的裁定相违。
        //    断契约层（机器码 + HTTP 码）+ 真实行数，不锁 Rust 变体、不锁文案。
        let err = svc
            .create(make_req(Some(manual_code.clone())), 1)
            .await
            .expect_err("重复人工码必须显式失败，禁止静默改名/重新取号");
        assert_eq!(
            err.error_code(),
            "BUSINESS_ERROR",
            "重复人工码必须归业务拒绝族机器码，不得降级成 DATABASE/INTERNAL 500 族"
        );
        assert_eq!(
            <bingxi_backend::utils::error::AppError as axum::response::IntoResponse>::into_response(
                err
            )
            .status(),
            axum::http::StatusCode::BAD_REQUEST,
            "重复人工码的 HTTP 码必须是 400"
        );
        // 被拒不得产生任何新行：该编码在库里有且仅有一行，且编码原样未被改写
        let dup_rows = warehouse::Entity::find()
            .filter(warehouse::Column::WarehouseCode.eq(&manual_code))
            .count(&db)
            .await
            .expect("回读重复编码行数应成功");
        assert_eq!(
            dup_rows, 1,
            "重复人工码被拒后不得静默落第二行/改名落库（有且仅有原码一行）"
        );

        // 3) 缺省：生成器自动取号，格式 {WH}{YYYYMMDD}{3位流水}
        let created_auto = svc
            .create(make_req(None), 1)
            .await
            .expect("自动编码创建应成功");
        assert_standard_format(&created_auto.warehouse_code, WAREHOUSE_CODE_NO_PREFIX);

        // 清理：只删本用例明确创建的两行（不按 WH+日期 前缀扫删，
        // 避免共享活库上误删并发用例/存量当日的真实仓库）
        warehouse::Entity::delete_many()
            .filter(
                warehouse::Column::WarehouseCode
                    .eq(manual_code.clone())
                    .or(warehouse::Column::WarehouseCode.eq(created_auto.warehouse_code.clone())),
            )
            .exec(&db)
            .await
            .expect("清理仓库探针失败");
    }

    fn make_req(code: Option<String>) -> CreateWarehouseRequest {
        CreateWarehouseRequest {
            name: code.as_ref().map(|c| format!("取号契约仓 {c}")),
            code,
            address: None,
            manager: None,
            phone: None,
            contact_person: None,
            is_default: Some(false),
            capacity: None,
            description: None,
            warehouse_type: None,
        }
    }
}
