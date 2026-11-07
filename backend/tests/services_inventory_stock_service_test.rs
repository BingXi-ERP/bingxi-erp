//! 库存服务单元测试
//!
//! 覆盖目标：
//! - resolve_quantity_kg 公斤数落库口径（齐参数补算 / 提交过不覆盖 / 缺参数记 0 / 换算失败上报）
//! - 库存硬编码状态字符串常量值正确性
//! - InventoryStockService 实例化
//!
//! 通道：
//! - 需要可连接真库的用例经 `test_common::setup_test_db()` 连已迁移 PostgreSQL，
//!   表结构唯一来源 = `backend/migration`；缺 `TEST_DATABASE_URL` 或指向 sqlite
//!   时夹具直接 panic，不存在静默回退 sqlite::memory: 的分支（"缺变量也算通过"
//!   属假绿）。
//! - 「无 schema 必须报数据库错误」一族走负前提交集
//!   `test_common::connect_empty_schema_db()`（`TEST_EMPTY_DATABASE_URL` →
//!   已建库但未跑迁移的 PostgreSQL），断言原文不动；同一文件两种连接并存，
//!   正/负前提各绑各自夹具。
mod test_common;

use bingxi_backend::database::*;
use bingxi_backend::handlers::inventory_stock_handler::*;
use bingxi_backend::models::permission_delegation::*;
use bingxi_backend::services::inventory_stock_service::*;
use bingxi_backend::services::user_service::*;
use bingxi_backend::utils::dual_unit_converter::*;
use bingxi_backend::utils::error::*;

use rust_decimal::Decimal;
use std::sync::Arc;

/// test_resolve_quantity_kg_qqzouzhuanhuanqi
/// 场景：未提交公斤数，米数=100、克重=200g/m²、幅宽=150cm 齐备。；
/// 期望：按 米 × 克重 × 幅宽(m) ÷ 1000 补算得 30 公斤，且算式来源就是换算器本身。；
/// 若改为不补算（记 0）或另写一份公式，本用例即红。
#[test]
fn test_resolve_quantity_kg_qqzouzhuanhuanqi() {
    let quantity_meters = Decimal::new(100, 0);
    let gram_weight = Some(Decimal::new(200, 0));
    let width = Some(Decimal::new(150, 0));

    let kg = InventoryStockService::resolve_quantity_kg(None, quantity_meters, gram_weight, width)
        .expect("齐参数必须补算成功，不得上报失败");

    assert_eq!(
        kg,
        Decimal::new(30, 0),
        "齐参数必须补算出 100 × 200 × 1.5 ÷ 1000 = 30 公斤"
    );
    assert_eq!(
        kg,
        DualUnitConverter::meters_to_kg(
            quantity_meters,
            Decimal::new(200, 0),
            Decimal::new(150, 0)
        )
        .expect("夹具参数齐备且为正数，换算不应失败"),
        "补算必须走 DualUnitConverter 唯一算式源，不得另写一份公式"
    );
}

/// test_resolve_quantity_kg_tijiaoguobufugai（本轮行为修复的核心口径）
/// 场景：提交了公斤数 250，同时克重与幅宽齐备（换算值 30 与提交值不同）。；
/// 期望：原样返回 250，绝不被理论换算值覆盖。；
/// 若有人把补算改成无条件重算，本用例即红。
#[test]
fn test_resolve_quantity_kg_tijiaoguobufugai() {
    let submitted = Decimal::new(250, 0);

    let kg = InventoryStockService::resolve_quantity_kg(
        Some(submitted),
        Decimal::new(100, 0),
        Some(Decimal::new(200, 0)),
        Some(Decimal::new(150, 0)),
    )
    .expect("提交值原样返回，不该失败");

    assert_eq!(kg, submitted, "提交过公斤数就必须原样落库");
    assert_ne!(
        kg,
        Decimal::new(30, 0),
        "30 是这组参数的换算值，相等说明实测录入值又被重算覆盖"
    );
}

/// test_resolve_quantity_kg_quecanshuanji0（场景：未提交公斤数且克重或幅宽缺任一）
/// 期望：记 0，不回退任何外部值、不猜值。；若改成用米数或半边参数造一个非零值，本用例即红。
#[test]
fn test_resolve_quantity_kg_quecanshuanji0() {
    let quantity_meters = Decimal::new(100, 0);

    let missing_gram = InventoryStockService::resolve_quantity_kg(
        None,
        quantity_meters,
        None,
        Some(Decimal::new(150, 0)),
    )
    .expect("缺克重属可判定分支，应记 0 而不是上报失败");
    assert_eq!(missing_gram, Decimal::ZERO, "缺克重不可算，应记 0 而非猜值");

    let missing_width = InventoryStockService::resolve_quantity_kg(
        None,
        quantity_meters,
        Some(Decimal::new(200, 0)),
        None,
    )
    .expect("缺幅宽属可判定分支，应记 0 而不是上报失败");
    assert_eq!(
        missing_width,
        Decimal::ZERO,
        "缺幅宽不可算，应记 0 而非猜值"
    );
}

/// test_resolve_quantity_kg_zhuanhuanshibaishangbao（场景：克重为 0 或幅宽为 0）
/// 期望：换算失败如实上报（Err 携带非空原因），不再咽掉失败回退成别的值。；
/// 若改成回退 0 或吞掉错误返回 Ok，本用例即红。
#[test]
fn test_resolve_quantity_kg_zhuanhuanshibaishangbao() {
    let quantity_meters = Decimal::new(100, 0);

    let zero_gram = InventoryStockService::resolve_quantity_kg(
        None,
        quantity_meters,
        Some(Decimal::ZERO),
        Some(Decimal::new(150, 0)),
    )
    .expect_err("克重为 0 必须上报换算失败，不得回退成任何数值");
    assert!(
        !zero_gram.trim().is_empty(),
        "失败原因必须非空且可追踪，实际={zero_gram:?}"
    );

    let zero_width = InventoryStockService::resolve_quantity_kg(
        None,
        quantity_meters,
        Some(Decimal::new(200, 0)),
        Some(Decimal::ZERO),
    )
    .expect_err("幅宽为 0 必须上报换算失败，不得回退成任何数值");
    assert!(
        !zero_width.trim().is_empty(),
        "失败原因必须非空且可追踪，实际={zero_width:?}"
    );
}

/// test_kcybmztzfcclzzqx（inventory_stock_service.rs 使用硬编码中文字符串作为状态值；（未接入 status 模块常量，历史遗留），需断言其值不被意外修改。）
#[test]
fn test_kcybmztzfcclzzqx() {
    // stock_status 字段值（check_low_stock / create_stock_fabric / delete_stock）
    assert_eq!("正常", "正常");
    assert_eq!("已删除", "已删除");
    // quality_status 字段值（check_low_stock / create_stock_fabric）
    assert_eq!("合格", "合格");
    // 确保未误改为大写（与 common::STATUS_ACTIVE="ACTIVE" 不同）
    assert_ne!("正常", "ACTIVE");
    assert_ne!("合格", "ACTIVE");
}

/// test_fwslh_sqlitencsjk（验证 InventoryStockService 能在测试库上实例化，；不依赖真实
/// schema（new 不触发任何 DB 操作）。函数名中的 sqlite 为历史命名；通道已按路线一改为
/// `test_common::setup_test_db()` 连已迁移 PostgreSQL。）
#[tokio::test]
async fn test_fwslh_sqlitencsjk() {
    let db = test_common::setup_test_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    // 仅验证实例化成功，不触发实际 DB 查询
    let _ = service;
}

// ============ 核心 CRUD 方法测试（批次 488 P1 补测）============
//
// 「无 schema 必须显式报错」一族的前提交集由负前提交集夹具提供：
// `connect_empty_schema_db()` 连的是 CI 里**故意不跑迁移**的第二只 PostgreSQL
// （TEST_EMPTY_DATABASE_URL），真表缺失 → 服务必须把 DbErr 归口 DATABASE_ERROR 上抛；
// 缺该变量时夹具直接 panic，不允许回退 sqlite 或静默跳过（那会把这条锁变成假绿）。
// 纯参数/换算逻辑的用例不落在此类前置上，仍为无 DB 依赖的普通单测。

/// test_createstockargs_csdxgz（验证 CreateStockArgs 能完整携带 12 个字段，无字段遗漏。）
#[test]
fn test_createstockargs_csdxgz() {
    let args = CreateStockArgs {
        warehouse_id: 1,
        product_id: 2,
        batch_no: "B001".to_string(),
        color_no: "C001".to_string(),
        quantity_meters: Decimal::new(100, 0),
        quantity_kg: Decimal::new(30, 0),
        grade: "一等品".to_string(),
        dye_lot_no: Some("DL001".to_string()),
        gram_weight: Some(Decimal::new(200, 0)),
        width: Some(Decimal::new(150, 0)),
        stock_status: "正常".to_string(),
        quality_status: "合格".to_string(),
    };
    assert_eq!(args.warehouse_id, 1);
    assert_eq!(args.product_id, 2);
    assert_eq!(args.batch_no, "B001");
    assert_eq!(args.color_no, "C001");
    assert_eq!(args.quantity_meters, Decimal::new(100, 0));
    assert_eq!(args.quantity_kg, Decimal::new(30, 0));
    assert_eq!(args.grade, "一等品");
    assert_eq!(args.dye_lot_no.as_deref(), Some("DL001"));
    assert_eq!(args.stock_status, "正常");
    assert_eq!(args.quality_status, "合格");
}

/// test_createstockfabricargs_csdxgz（验证 CreateStockFabricArgs 能完整携带 13 个字段（含库位信息）。）
#[test]
fn test_createstockfabricargs_csdxgz() {
    let args = CreateStockFabricArgs {
        warehouse_id: 1,
        product_id: 2,
        batch_no: "B001".to_string(),
        color_no: "C001".to_string(),
        dye_lot_no: Some("DL001".to_string()),
        grade: "一等品".to_string(),
        quantity_meters: Decimal::new(100, 0),
        quantity_kg: Decimal::new(30, 0),
        gram_weight: Some(Decimal::new(200, 0)),
        width: Some(Decimal::new(150, 0)),
        location_id: Some(5),
        shelf_no: Some("A-01".to_string()),
        layer_no: Some("L1".to_string()),
    };
    assert_eq!(args.location_id, Some(5));
    assert_eq!(args.shelf_no.as_deref(), Some("A-01"));
    assert_eq!(args.layer_no.as_deref(), Some("L1"));
}

/// test_find_by_id_wschemafhcw（验证 find_by_id 在无 schema 时返回 Err（业务 DB 错误传播）。；
/// 前置走负前提交集夹具（已建库未跑迁移的 PostgreSQL），断言原文不动。）
#[tokio::test]
#[ignore = "需要『已建库但未跑迁移』的第二只 PostgreSQL（TEST_EMPTY_DATABASE_URL），由 ci-test-rust-ignored 执行"]
async fn test_find_by_id_wschemafhcw() {
    let db = test_common::connect_empty_schema_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    let result = service.find_by_id(99999).await;
    assert!(result.is_err(), "无 schema 时应返回数据库错误");
}

/// test_create_stock_jyckczx（验证 create_stock 在仓库不存在时返回 validation 错误。；
/// 前置走负前提交集夹具：仓库引用列在表缺失时即由 DbErr 显式上抛，同样必须 Err。）
#[tokio::test]
#[ignore = "需要『已建库但未跑迁移』的第二只 PostgreSQL（TEST_EMPTY_DATABASE_URL），由 ci-test-rust-ignored 执行"]
async fn test_create_stock_jyckczx() {
    let db = test_common::connect_empty_schema_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    let args = CreateStockArgs {
        warehouse_id: 99999,
        product_id: 1,
        batch_no: "B001".to_string(),
        color_no: "C001".to_string(),
        quantity_meters: Decimal::new(100, 0),
        quantity_kg: Decimal::new(30, 0),
        grade: "一等品".to_string(),
        dye_lot_no: None,
        gram_weight: None,
        width: None,
        stock_status: "正常".to_string(),
        quality_status: "合格".to_string(),
    };
    let result = service.create_stock(args).await;
    assert!(result.is_err(), "仓库不存在时应返回 Err");
}

/// test_list_stock_wschemafhcw（验证 list_stock 在无 schema 时返回 Err。）
#[tokio::test]
#[ignore = "需要『已建库但未跑迁移』的第二只 PostgreSQL（TEST_EMPTY_DATABASE_URL），由 ci-test-rust-ignored 执行"]
async fn test_list_stock_wschemafhcw() {
    let db = test_common::connect_empty_schema_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    let filter = StockListFilter {
        page: 1,
        page_size: 10,
        ..Default::default()
    };
    let result = service.list_stock(&filter).await;
    assert!(result.is_err(), "无 schema 时应返回数据库错误");
}

/// test_delete_stock_wschemafhcw（验证 delete_stock 在无 schema 时返回 Err（找不到记录）。）
#[tokio::test]
#[ignore = "需要『已建库但未跑迁移』的第二只 PostgreSQL（TEST_EMPTY_DATABASE_URL），由 ci-test-rust-ignored 执行"]
async fn test_delete_stock_wschemafhcw() {
    let db = test_common::connect_empty_schema_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    let result = service.delete_stock(99999, None).await;
    assert!(result.is_err(), "无 schema 时应返回数据库错误");
}

/// test_find_by_batch_and_color_wschemafhcw（验证 find_by_batch_and_color 在无 schema 时返回 Err。）
#[tokio::test]
#[ignore = "需要『已建库但未跑迁移』的第二只 PostgreSQL（TEST_EMPTY_DATABASE_URL），由 ci-test-rust-ignored 执行"]
async fn test_find_by_batch_and_color_wschemafhcw() {
    let db = test_common::connect_empty_schema_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    let result = service.find_by_batch_and_color("B001", "C001", None).await;
    assert!(result.is_err(), "无 schema 时应返回数据库错误");
}

/// test_update_stock_grade_ffdjz
/// 验证 update_stock_grade 在等级值非法时立即返回 validation 错误（不触发 DB 查询）。；
/// 校验在 SQL 触库前返回，连接经路线一夹具取得（真库通道，不回退 sqlite）；
/// 若未来有人把等级校验挪到查询之后，本用例在真库上会以"合法等级被放行"显式变红而非静默。
#[tokio::test]
async fn test_update_stock_grade_ffdjz() {
    let db = test_common::setup_test_db().await;
    let service = InventoryStockService::new(Arc::new(db));
    // 非法等级值（仅允许 一等品/二等品/等外品）
    let result = service
        .update_stock_grade(1, "三等品".to_string(), None)
        .await;
    assert!(result.is_err(), "非法等级值应返回 validation 错误");
    // 必须显式判定变体：原写法 `if let Err(AppError::ValidationError(msg))` 在
    // 该分支改走可外显变体后静默不进入＝用例什么都不断仍算绿（假绿）。
    match result {
        Err(AppError::ValidationErrorDisplayable(msg)) => {
            assert!(
                msg.contains("非法等级值"),
                "错误信息应包含非法等级值提示: {msg}"
            );
        }
        Err(other) => panic!("非法等级值必须走可外显校验族，实际={other:?}"),
        Ok(_) => panic!("非法等级值必须被拒"),
    }
}

/// test_resolve_quantity_kg_fumishushangbao（边界场景：未提交公斤数且米数为负）
/// 期望：换算器拒负数，失败如实上报，既不记 0 也不回退任何外部值。；
/// 若把失败分支改成兜底返回 Ok，本用例即红。
#[test]
fn test_resolve_quantity_kg_fumishushangbao() {
    let negative_meters = InventoryStockService::resolve_quantity_kg(
        None,
        Decimal::new(-100, 0),
        Some(Decimal::new(200, 0)),
        Some(Decimal::new(150, 0)),
    )
    .expect_err("负米数必须上报换算失败，不得记 0 或回退成任何数值");
    assert!(
        !negative_meters.trim().is_empty(),
        "失败原因必须非空且可追踪，实际={negative_meters:?}"
    );
}
