//! 库存核算性能基准测试（V15 Batch 487 P0-T07）
//!
//! 基准对象：InventoryStockService::resolve_quantity_kg（公斤数落库口径纯函数）
//! 业务场景：面料库存创建时，未提交公斤数则按 米数 + 克重 + 幅宽 补算公斤数
//! 性能要求：单次计算 < 1ms（大数据量批量创建时避免阻塞）

use criterion::{Criterion, black_box, criterion_group, criterion_main};
use rust_decimal::Decimal;
use std::str::FromStr;

use bingxi_backend::services::inventory_stock_service::InventoryStockService;

/// 基准：resolve_quantity_kg 未提交公斤数且克重幅宽齐全，走换算器补算分支
fn bench_resolve_quantity_kg_with_gram_weight(c: &mut Criterion) {
    let quantity_meters = Decimal::from_str("1000.5").unwrap();
    let gram_weight = Some(Decimal::from_str("250.0").unwrap());
    let width = Some(Decimal::from_str("1.5").unwrap());

    c.bench_function("resolve_quantity_kg_克重幅宽齐全", |b| {
        b.iter(|| {
            black_box(InventoryStockService::resolve_quantity_kg(
                black_box(None),
                black_box(quantity_meters),
                black_box(gram_weight),
                black_box(width),
            ))
        })
    });
}

/// 基准：resolve_quantity_kg 未提交公斤数且克重幅宽都缺失，走记 0 分支
fn bench_resolve_quantity_kg_missing_params(c: &mut Criterion) {
    let quantity_meters = Decimal::from_str("1000.5").unwrap();

    c.bench_function("resolve_quantity_kg_缺克重幅宽", |b| {
        b.iter(|| {
            black_box(InventoryStockService::resolve_quantity_kg(
                black_box(None),
                black_box(quantity_meters),
                black_box(None),
                black_box(None),
            ))
        })
    });
}

/// 基准：批量解析 1000 条库存记录的公斤数（模拟批量入库场景）
fn bench_batch_resolve_quantity_kg(c: &mut Criterion) {
    let records: Vec<(Decimal, Option<Decimal>, Option<Decimal>)> = (0..1000)
        .map(|i| {
            let meters = Decimal::from_str(&format!("{}.5", i + 1)).unwrap();
            let gram_weight = Some(Decimal::from_str("250.0").unwrap());
            let width = Some(Decimal::from_str("1.5").unwrap());
            (meters, gram_weight, width)
        })
        .collect();

    c.bench_function("批量解析1000条库存公斤数", |b| {
        b.iter(|| {
            let total: Decimal = black_box(records.iter())
                .map(|(m, g, w)| {
                    InventoryStockService::resolve_quantity_kg(None, *m, *g, *w)
                        .expect("夹具参数齐备且为正数，补算不应失败")
                })
                .sum();
            black_box(total)
        })
    });
}

criterion_group!(
    benches,
    bench_resolve_quantity_kg_with_gram_weight,
    bench_resolve_quantity_kg_missing_params,
    bench_batch_resolve_quantity_kg,
);
criterion_main!(benches);
