//! 现货订单提交锁缸 ledger（#78 功能补齐）。
//!
//! 唯一口径：只有 `sales_order_item.fulfillment_source = stock` 的明细在 submit 时锁缸；
//! production / purchase 行不参与（避免大面积影响既有 E2E 与生产/采购链）。
//! 锁缸落点是 `inventory_stocks.quantity_available -= q` / `quantity_reserved += q`，
//! 与订单提交/改量/作废在同一事务内，带 `version` 乐观锁；库存不足整单拒绝（事务回滚）。
//!
//! 恢复依据复用 `inventory_reservations` 行作为 ledger：status ∈ {pending, locked} 且
//! `notes` 以 `SO78|` 开头（JSON 记 `{stock_id,item_id}`）。`POST /inventory/reservations`
//! 原有行为不变（只插行不写库存量），本模块只在订单工作流内动库存三列，互不串扰。
//! ledger 行随主单硬删除由 order_crud 的既有清理删除，软删除/取消释放后转 released。
//!
//! 匹配：product_id + color_no + 非空 batch_requirement/dye_lot_requirement 精确匹配，
//! 仅正常/合格且在库可用行；FIFO（created_at 升序、同刻 id 升序），不做跨缸回退
//! （本场景「按缸匹配」优先于出库侧的跨缸兜底口径）。

use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::sea_query::{BinOper, Expr};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseTransaction, EntityTrait, QueryFilter, QueryOrder, Set,
    UpdateResult,
};

use crate::models::status::inventory_reservation as reservation_status;
use crate::models::status::inventory_stock_quality_status as quality_status;
use crate::models::status::inventory_stock_status as stock_status;
use crate::models::status::sales::fulfillment_source;
use crate::models::{inventory_reservation, inventory_stock, sales_order_item};
use crate::utils::error::AppError;

const LEDGER_PREFIX: &str = "SO78|";

#[derive(serde::Serialize, serde::Deserialize)]
struct LedgerMeta {
    stock_id: i32,
    item_id: i32,
}

/// 从 ledger 备注解析库存行主键；非本模块写入的行返回 None。
fn ledger_stock_id(notes: Option<&str>) -> Option<i32> {
    let raw = notes?.strip_prefix(LEDGER_PREFIX)?;
    serde_json::from_str::<LedgerMeta>(raw)
        .ok()
        .map(|m| m.stock_id)
}

fn insufficient() -> AppError {
    AppError::business_displayable("现货库存不足，订单无法提交")
}

fn version_conflict() -> AppError {
    AppError::business_displayable("库存已被其他操作修改，请重试")
}

fn check_affected(result: UpdateResult) -> Result<(), AppError> {
    if result.rows_affected == 0 {
        Err(version_conflict())
    } else {
        Ok(())
    }
}

/// 按 FIFO 规划单行现货明细的扣缸分配；严格匹配需求维度，不做跨缸回退。
fn allocate(
    candidates: &[inventory_stock::Model],
    item: &sales_order_item::Model,
) -> Result<Vec<(i32, Decimal, i32)>, AppError> {
    let required_batch = item
        .batch_requirement
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let required_lot = item
        .dye_lot_requirement
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let mut rows: Vec<&inventory_stock::Model> = candidates
        .iter()
        .filter(|s| s.quantity_available > Decimal::ZERO)
        .filter(|s| required_batch.is_none_or(|b| s.batch_no == b))
        .filter(|s| required_lot.is_none_or(|l| s.dye_lot_no.as_deref() == Some(l)))
        .collect();
    rows.sort_by(|a, b| {
        a.created_at
            .cmp(&b.created_at)
            .then_with(|| a.id.cmp(&b.id))
    });

    let mut remaining = item.quantity;
    let mut plan = Vec::new();
    for row in rows {
        if remaining <= Decimal::ZERO {
            break;
        }
        let take = remaining.min(row.quantity_available);
        plan.push((row.id, take, row.version));
        remaining -= take;
    }
    if remaining > Decimal::ZERO {
        return Err(insufficient());
    }
    Ok(plan)
}

/// 扣缸：available -= q / reserved += q / version += 1，同事务 + 乐观锁。
async fn debit(
    txn: &DatabaseTransaction,
    stock_id: i32,
    qty: Decimal,
    version: i32,
) -> Result<(), AppError> {
    let result = inventory_stock::Entity::update_many()
        .col_expr(
            inventory_stock::Column::QuantityAvailable,
            Expr::col(inventory_stock::Column::QuantityAvailable)
                .binary(BinOper::Sub, Expr::val(qty)),
        )
        .col_expr(
            inventory_stock::Column::QuantityReserved,
            Expr::col(inventory_stock::Column::QuantityReserved)
                .binary(BinOper::Add, Expr::val(qty)),
        )
        .col_expr(
            inventory_stock::Column::Version,
            Expr::col(inventory_stock::Column::Version).binary(BinOper::Add, Expr::val(1)),
        )
        .col_expr(inventory_stock::Column::UpdatedAt, Expr::val(Utc::now()))
        .filter(inventory_stock::Column::Id.eq(stock_id))
        .filter(inventory_stock::Column::Version.eq(version))
        .exec(txn)
        .await?;
    check_affected(result)
}

/// 回缸：available += q / reserved -= q / version += 1。
async fn credit(
    txn: &DatabaseTransaction,
    stock_id: i32,
    qty: Decimal,
    version: i32,
) -> Result<(), AppError> {
    let result = inventory_stock::Entity::update_many()
        .col_expr(
            inventory_stock::Column::QuantityAvailable,
            Expr::col(inventory_stock::Column::QuantityAvailable)
                .binary(BinOper::Add, Expr::val(qty)),
        )
        .col_expr(
            inventory_stock::Column::QuantityReserved,
            Expr::col(inventory_stock::Column::QuantityReserved)
                .binary(BinOper::Sub, Expr::val(qty)),
        )
        .col_expr(
            inventory_stock::Column::Version,
            Expr::col(inventory_stock::Column::Version).binary(BinOper::Add, Expr::val(1)),
        )
        .col_expr(inventory_stock::Column::UpdatedAt, Expr::val(Utc::now()))
        .filter(inventory_stock::Column::Id.eq(stock_id))
        .filter(inventory_stock::Column::Version.eq(version))
        .exec(txn)
        .await?;
    check_affected(result)
}

/// 列出本模块写入且仍生效的 ledger 行。
async fn active_ledger(
    txn: &DatabaseTransaction,
    order_id: i32,
) -> Result<Vec<inventory_reservation::Model>, AppError> {
    let rows = inventory_reservation::Entity::find()
        .filter(inventory_reservation::Column::OrderId.eq(order_id))
        .filter(
            inventory_reservation::Column::Status
                .is_in([reservation_status::PENDING, reservation_status::LOCKED]),
        )
        .all(txn)
        .await?;
    Ok(rows
        .into_iter()
        .filter(|r| ledger_stock_id(r.notes.as_deref()).is_some())
        .collect())
}

/// 提交锁缸；仅 stock 明细，FIFO、严格维度匹配；任一腿不足即整单失败。
pub async fn lock_on_submit(
    txn: &DatabaseTransaction,
    order_id: i32,
    user_id: i32,
) -> Result<(), AppError> {
    let items = sales_order_item::Entity::find()
        .filter(sales_order_item::Column::OrderId.eq(order_id))
        .all(txn)
        .await?;

    for item in items
        .iter()
        .filter(|i| i.fulfillment_source.as_deref() == Some(fulfillment_source::STOCK))
    {
        let candidates = inventory_stock::Entity::find()
            .filter(inventory_stock::Column::ProductId.eq(item.product_id))
            .filter(inventory_stock::Column::ColorNo.eq(item.color_no.clone()))
            .filter(inventory_stock::Column::StockStatus.eq(stock_status::NORMAL))
            .filter(inventory_stock::Column::QualityStatus.eq(quality_status::PASS))
            .filter(inventory_stock::Column::QuantityAvailable.gt(Decimal::ZERO))
            .all(txn)
            .await?;
        let plan = allocate(&candidates, item)?;
        for (stock_id, qty, version) in plan {
            let stock = inventory_stock::Entity::find_by_id(stock_id)
                .one(txn)
                .await?
                .ok_or_else(insufficient)?;
            debit(txn, stock_id, qty, version).await?;
            let notes = serde_json::json!({
                "stock_id": stock_id,
                "item_id": item.id,
            })
            .to_string();
            inventory_reservation::ActiveModel {
                id: Default::default(),
                order_id: Set(order_id),
                product_id: Set(stock.product_id),
                warehouse_id: Set(stock.warehouse_id),
                quantity: Set(qty),
                status: Set(reservation_status::LOCKED.to_string()),
                reserved_at: Set(Utc::now()),
                released_at: Set(None),
                notes: Set(Some(format!("{LEDGER_PREFIX}{notes}"))),
                created_by: Set(Some(user_id)),
                created_at: Set(Utc::now()),
                updated_at: Set(Utc::now()),
            }
            .insert(txn)
            .await?;
        }
    }
    Ok(())
}

/// 释放本订单全部生效锁缸 ledger 行（作废/改量共用）。
/// `tolerate_missing_stock` 仅供硬删除路径：库存行已不存在时不阻断删单。
async fn release_all(
    txn: &DatabaseTransaction,
    order_id: i32,
    tolerate_missing_stock: bool,
) -> Result<(), AppError> {
    for row in active_ledger(txn, order_id).await? {
        let Some(stock_id) = ledger_stock_id(row.notes.as_deref()) else {
            continue;
        };
        let stock = inventory_stock::Entity::find_by_id(stock_id)
            .one(txn)
            .await?;
        let Some(stock) = stock else {
            if tolerate_missing_stock {
                continue;
            }
            return Err(version_conflict());
        };
        credit(txn, stock_id, row.quantity, stock.version).await?;
        let mut active: inventory_reservation::ActiveModel = row.into();
        active.status = Set(reservation_status::RELEASED.to_string());
        active.released_at = Set(Some(Utc::now()));
        active.updated_at = Set(Utc::now());
        active.update(txn).await?;
    }
    Ok(())
}

/// 作废释放：与取消订单同事务调用。
pub async fn release_on_cancel(txn: &DatabaseTransaction, order_id: i32) -> Result<(), AppError> {
    release_all(txn, order_id, false).await
}

/// 硬删除前释放：库存行缺失不阻断删单（主表清理仍由 order_crud 负责）。
pub async fn release_on_delete(txn: &DatabaseTransaction, order_id: i32) -> Result<(), AppError> {
    release_all(txn, order_id, true).await
}

/// 改量差量同步：先回退旧锁再按新明细重锁，全部在同一事务内。
/// 净效果＝数量差量（新增行锁差量、减少行回差量、删行全回）；任一步失败整体回滚。
/// 草稿态未 submit，无锁可回也不新锁；已提交态（PENDING 及以后）才重建锁。
pub async fn sync_on_items_replaced(
    txn: &DatabaseTransaction,
    order_id: i32,
    user_id: i32,
    was_submitted: bool,
) -> Result<(), AppError> {
    release_all(txn, order_id, false).await?;
    if was_submitted {
        lock_on_submit(txn, order_id, user_id).await?;
    }
    Ok(())
}
