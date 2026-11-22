use crate::models::status::inventory_adjustment as adjustment_status;
use crate::models::{
    inventory_adjustment, inventory_adjustment_item, inventory_stock, user, warehouse,
};
use crate::services::event_bus::{BusinessEvent, EVENT_BUS};
// V15 P0-S01：行级数据权限工具
use crate::utils::data_scope::{
    DataScopeContext, apply_data_scope, check_resource_owner_by_member_scope,
};
use crate::utils::error::AppError;
// 批次 260 修复：接入 paginate_with_total 统一分页逻辑
use crate::utils::pagination::paginate_with_total;
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sea_orm::DatabaseConnection;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, ExprTrait, FromQueryResult, IntoActiveModel,
    JoinType, Order, PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, RelationDef,
    RelationTrait, Set, TransactionTrait,
};
use std::sync::Arc;

/// 创建库存调整单请求
#[derive(Debug, Clone)]
pub struct CreateAdjustmentRequest {
    pub warehouse_id: i32,
    pub adjustment_date: DateTime<Utc>,
    pub adjustment_type: String,
    pub reason_type: String,
    pub reason_description: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<i32>,
    pub items: Vec<AdjustmentItemRequest>,
}

/// 更新库存调整单请求
///
/// 字段三态语义（对齐 RFC 7386 JSON Merge Patch，与 handlers::inventory_adjustment_handler
/// 的 UpdateAdjustmentRequestPayload 同源）：
/// None（键缺席）=保持原值、Some(None)（显式 null）=置 NULL（仅 DB 可空列）、Some(Some(v))=覆盖。
#[derive(Debug, Clone, Default)]
pub struct UpdateAdjustmentRequest {
    /// NOT NULL 列 warehouse_id（m0010 DDL）——显式 null 由 update 拒绝
    pub warehouse_id: Option<Option<i32>>,
    /// NOT NULL 列 adjustment_date（m0010 DDL）——显式 null 由 update 拒绝
    pub adjustment_date: Option<Option<DateTime<Utc>>>,
    /// NOT NULL 列 adjustment_type（m0010 DDL）——显式 null 由 update 拒绝
    pub adjustment_type: Option<Option<String>>,
    /// NOT NULL 列 reason_type（m0010 DDL）——显式 null 由 update 拒绝
    pub reason_type: Option<Option<String>>,
    /// DB 可空列 reason_description TEXT（m0010 DDL）——显式 null 清空
    pub reason_description: Option<Option<String>>,
    /// DB 可空列 notes TEXT（m0010 DDL）——显式 null 清空
    pub notes: Option<Option<String>>,
}

/// 调整明细项请求
#[derive(Debug, Clone)]
pub struct AdjustmentItemRequest {
    pub stock_id: i32,
    pub quantity: Decimal,
    pub unit_cost: Option<Decimal>,
    pub notes: Option<String>,
}

/// 库存调整单详情
#[derive(Debug, Clone)]
pub struct AdjustmentDetail {
    pub adjustment: inventory_adjustment::Model,
    pub items: Vec<inventory_adjustment_item::Model>,
}

/// 库存调整单列表行读模型（单次 JOIN 富化的查询结果）。
///
/// 表头实体列按 `inventory_adjustment` 的 NOT NULL 约束保持非空；
/// `warehouse_name` / `created_by_name` 由 LEFT JOIN 派生，故为 `Option<String>`。
#[derive(Debug, Clone, FromQueryResult)]
pub struct AdjustmentListRow {
    pub id: i32,
    pub adjustment_no: String,
    pub warehouse_id: i32,
    pub adjustment_type: String,
    pub reason_type: String,
    pub status: String,
    pub total_quantity: Decimal,
    pub created_at: DateTime<Utc>,
    pub adjustment_date: DateTime<Utc>,
    pub reason_description: Option<String>,
    pub warehouse_name: Option<String>,
    pub created_by_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct InventoryAdjustmentService {
    db: Arc<DatabaseConnection>,
}

fn validate_stock_warehouse(
    stock_warehouse_id: i32,
    adjustment_warehouse_id: i32,
) -> Result<(), AppError> {
    if stock_warehouse_id != adjustment_warehouse_id {
        tracing::warn!(
            stock_warehouse_id,
            adjustment_warehouse_id,
            "库存调整仓库校验失败：库存所属仓库与调整单仓库不一致"
        );
        return Err(AppError::validation_displayable(
            "库存所属仓库与调整单仓库不一致，请重新选择库存",
        ));
    }
    tracing::debug!(
        stock_warehouse_id,
        adjustment_warehouse_id,
        "库存调整仓库校验通过"
    );
    Ok(())
}

fn calculate_quantity_after(
    adjustment_type: &str,
    quantity_before: Decimal,
    quantity: Decimal,
) -> Result<Decimal, AppError> {
    if quantity <= Decimal::ZERO {
        tracing::warn!("库存调整数量校验失败：调整数量必须大于零");
        return Err(AppError::validation_displayable("调整数量必须大于零"));
    }
    let quantity_after = match adjustment_type {
        "increase" => quantity_before.checked_add(quantity),
        "decrease" => quantity_before.checked_sub(quantity),
        _ => {
            tracing::warn!("库存调整数量校验失败：调整类型无效");
            return Err(AppError::validation_displayable(
                "调整类型只能为 increase（增加）或 decrease（减少）",
            ));
        }
    }
    .ok_or_else(|| {
        tracing::warn!("库存调整数量校验失败：数量计算超出范围");
        AppError::validation_displayable("调整数量计算超出范围，请减少调整数量后重试")
    })?;
    if quantity_after < Decimal::ZERO {
        tracing::warn!("库存调整数量校验失败：调整后库存不能为负数");
        return Err(AppError::validation_displayable(
            "调整后库存不能为负数，请重新核对库存和调整数量",
        ));
    }
    tracing::debug!("库存调整数量校验通过");
    Ok(quantity_after)
}

fn validate_quantity_snapshot(
    adjustment_type: &str,
    quantity_before: Decimal,
    quantity: Decimal,
    quantity_after: Decimal,
    current_quantity: Decimal,
) -> Result<(), AppError> {
    let expected_after = calculate_quantity_after(adjustment_type, quantity_before, quantity)?;
    if expected_after != quantity_after {
        tracing::warn!("库存调整审核校验失败：明细数量快照与调整方向不一致");
        return Err(AppError::business_displayable(
            "明细数量与调整方向不一致，请重新核对并更新调整明细后再审核",
        ));
    }
    if current_quantity != quantity_before {
        tracing::warn!("库存调整审核校验失败：库存数量已变化");
        return Err(AppError::business_displayable(
            "库存数量已变化，请重新核对并更新调整明细后再审核",
        ));
    }
    tracing::debug!("库存调整审核数量快照校验通过");
    Ok(())
}

fn calculate_total_quantity(
    quantities: impl IntoIterator<Item = Decimal>,
) -> Result<Decimal, AppError> {
    let total = quantities
        .into_iter()
        .try_fold(Decimal::ZERO, |total, quantity| {
            total.checked_add(quantity).ok_or_else(|| {
                tracing::warn!("库存调整总量计算失败：合计数量超出范围");
                AppError::validation_displayable("调整合计数量超出范围，请减少明细数量后重试")
            })
        })?;
    tracing::debug!("库存调整总量计算成功");
    Ok(total)
}

fn calculate_adjustment_amount(
    unit_cost: Option<Decimal>,
    quantity: Decimal,
) -> Result<Option<Decimal>, AppError> {
    let amount = unit_cost
        .map(|cost| {
            cost.checked_mul(quantity)
                .map(|amount| amount.round_dp(2))
                .ok_or_else(|| {
                    tracing::warn!("库存调整金额计算失败：成本与数量乘积超出范围");
                    AppError::validation_displayable("调整金额超出范围，请核对数量与单位成本后重试")
                })
        })
        .transpose()?;
    tracing::debug!("库存调整金额计算成功");
    Ok(amount)
}

/// 计算调整后的可用库存：可用量按本次账面增减量同步增减，预留量不参与调整。
/// 当库存存在预留（quantity_reserved > 0）时，可用量 ≠ 账面量，
/// 直接把可用量写成 quantity_after 会把已占用量重新放开。
fn compute_available_after(
    current_available: Decimal,
    quantity_before: Decimal,
    quantity_after: Decimal,
) -> Result<Decimal, AppError> {
    let quantity_delta = quantity_after.checked_sub(quantity_before).ok_or_else(|| {
        tracing::warn!("库存调整可用量计算失败：调整增减量超出范围");
        AppError::validation_displayable("调整数量计算超出范围，请减少调整数量后重试")
    })?;
    let available_after = current_available
        .checked_add(quantity_delta)
        .ok_or_else(|| {
            tracing::warn!("库存调整可用量计算失败：可用量超出范围");
            AppError::validation_displayable("调整数量计算超出范围，请减少调整数量后重试")
        })?;
    if available_after < Decimal::ZERO {
        tracing::warn!(
            current_available = %current_available,
            quantity_before = %quantity_before,
            quantity_after = %quantity_after,
            "库存调整可用量校验失败：调整后可用量为负数"
        );
        return Err(AppError::validation_displayable(
            "调整后可用库存不能为负数，请先核对预留数量",
        ));
    }
    Ok(available_after)
}

// 与 NUMERIC 列的中点舍入一致，让事件与落库公斤差使用同一个值。
fn compute_new_kg(
    current_kg: Decimal,
    quantity_before: Decimal,
    quantity_after: Decimal,
) -> Decimal {
    let new_kg = if quantity_before > Decimal::ZERO {
        let kg_ratio = current_kg / quantity_before;
        quantity_after * kg_ratio
    } else {
        current_kg
    };
    new_kg.round_dp_with_strategy(2, rust_decimal::RoundingStrategy::MidpointAwayFromZero)
}

impl InventoryAdjustmentService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 创建库存调整单（带事务）
    /// D08 Tier 4 子批次2：拆分为 ≤50 行主函数 + 3 个 helper（build_adjustment_active_model / fetch_stocks_map / create_adjustment_items）
    pub async fn create_adjustment(
        &self,
        request: CreateAdjustmentRequest,
    ) -> Result<AdjustmentDetail, AppError> {
        let txn = (*self.db).begin().await?;
        // 在调整事务内取号，锁随本事务提交才释放，与下方 adjustment.insert(&txn) 同临界区
        let adjustment_no = self.generate_adjustment_no(&txn).await?;
        let total_quantity =
            calculate_total_quantity(request.items.iter().map(|item| item.quantity))?;
        let adjustment_type = request.adjustment_type.clone();
        let adjustment =
            Self::build_adjustment_active_model(&request, adjustment_no, total_quantity);
        let adjustment_model = adjustment.insert(&txn).await?;
        let stock_ids: Vec<i32> = request.items.iter().map(|item| item.stock_id).collect();
        let stock_map = Self::fetch_stocks_map(&txn, stock_ids).await?;
        let item_models = Self::create_adjustment_items(
            &txn,
            request.items,
            adjustment_model.id,
            &stock_map,
            &adjustment_type,
            adjustment_model.warehouse_id,
        )
        .await?;
        txn.commit().await?;
        Ok(AdjustmentDetail {
            adjustment: adjustment_model,
            items: item_models,
        })
    }

    /// 构建库存调整单 ActiveModel（不插入数据库）
    fn build_adjustment_active_model(
        request: &CreateAdjustmentRequest,
        adjustment_no: String,
        total_quantity: Decimal,
    ) -> inventory_adjustment::ActiveModel {
        inventory_adjustment::ActiveModel {
            id: Default::default(),
            adjustment_no: Set(adjustment_no),
            warehouse_id: Set(request.warehouse_id),
            adjustment_date: Set(request.adjustment_date),
            adjustment_type: Set(request.adjustment_type.clone()),
            reason_type: Set(request.reason_type.clone()),
            reason_description: Set(request.reason_description.clone()),
            total_quantity: Set(total_quantity),
            notes: Set(request.notes.clone()),
            created_by: Set(request.created_by),
            approved_by: Set(None),
            approved_at: Set(None),
            status: Set(adjustment_status::PENDING.to_string()),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        }
    }

    /// 批量查询库存记录并构建 stock_id → Model 映射
    async fn fetch_stocks_map(
        txn: &sea_orm::DatabaseTransaction,
        stock_ids: Vec<i32>,
    ) -> Result<std::collections::HashMap<i32, inventory_stock::Model>, AppError> {
        let stocks = if stock_ids.is_empty() {
            Vec::new()
        } else {
            inventory_stock::Entity::find()
                .filter(inventory_stock::Column::Id.is_in(stock_ids))
                .all(txn)
                .await?
        };
        Ok(stocks.into_iter().map(|s| (s.id, s)).collect())
    }

    /// 循环创建调整明细项（含数量计算 + 金额精度归一化）
    async fn create_adjustment_items(
        txn: &sea_orm::DatabaseTransaction,
        items: Vec<AdjustmentItemRequest>,
        adjustment_id: i32,
        stock_map: &std::collections::HashMap<i32, inventory_stock::Model>,
        adjustment_type: &str,
        warehouse_id: i32,
    ) -> Result<Vec<inventory_adjustment_item::Model>, AppError> {
        let mut item_models = Vec::new();
        for item_req in items {
            let stock = stock_map.get(&item_req.stock_id).ok_or_else(|| {
                AppError::not_found(format!("库存 ID {} 不存在", item_req.stock_id))
            })?;
            validate_stock_warehouse(stock.warehouse_id, warehouse_id)?;
            let quantity_before = stock.quantity_on_hand;
            let quantity_after =
                calculate_quantity_after(adjustment_type, quantity_before, item_req.quantity)?;
            let amount = calculate_adjustment_amount(item_req.unit_cost, item_req.quantity)?;
            let item = inventory_adjustment_item::ActiveModel {
                id: Default::default(),
                adjustment_id: Set(adjustment_id),
                stock_id: Set(item_req.stock_id),
                quantity: Set(item_req.quantity),
                quantity_before: Set(quantity_before),
                quantity_after: Set(quantity_after),
                unit_cost: Set(item_req.unit_cost),
                amount: Set(amount),
                notes: Set(item_req.notes),
                created_at: Set(Utc::now()),
                updated_at: Set(Utc::now()),
            };
            let item_model = item.insert(txn).await?;
            item_models.push(item_model);
        }
        Ok(item_models)
    }

    /// 审核库存调整单
    pub async fn approve_adjustment(
        &self,
        adjustment_id: i32,
        approved_by: i32,
    ) -> Result<inventory_adjustment::Model, AppError> {
        // 开启事务
        let txn = (*self.db).begin().await?;

        // 批次 26 v6 P1 修复：状态机 lock_exclusive 补全，串行化并发状态变更
        // 原状态门查询未加行锁，并发审核可能双写状态。
        let adjustment_model = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;

        // 检查状态
        if adjustment_model.status != adjustment_status::PENDING {
            return Err(AppError::business(
                "只有待审核状态的调整单可以审核".to_string(),
            ));
        }

        // 转换为 ActiveModel 用于更新
        let mut adjustment: inventory_adjustment::ActiveModel = adjustment_model.clone().into();

        // 更新状态
        adjustment.status = Set(adjustment_status::APPROVED.to_string());
        adjustment.approved_by = Set(Some(approved_by));
        adjustment.approved_at = Set(Some(Utc::now()));
        adjustment.updated_at = Set(Utc::now());

        let adjustment_model =
            crate::services::audit_log_service::AuditLogService::update_with_audit(
                &txn,
                "auto_audit",
                adjustment,
                // P1 1-1 修复（批次 59b）：原 Some(0) 占位符改为真实操作人 approved_by
                Some(approved_by),
            )
            .await?;

        // 获取调整明细项
        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .all(&txn)
            .await?;

        // 乐观锁更新库存 + 构建事件列表
        let transaction_events = Self::apply_stock_updates_for_adjustment(
            &txn,
            items,
            adjustment_id,
            &adjustment_model.adjustment_type,
            adjustment_model.adjustment_no.clone(),
            adjustment_model.warehouse_id,
            approved_by,
        )
        .await?;

        // 提交事务
        txn.commit().await?;

        // 事务提交后发布库存交易事件，触发财务凭证生成
        for event in transaction_events {
            EVENT_BUS.publish(event);
            tracing::info!(
                "库存调整审核通过，已发布库存交易事件触发财务凭证生成: 调整单号={}",
                adjustment_model.adjustment_no
            );
        }

        Ok(adjustment_model)
    }

    /// 乐观锁更新库存 + 构建事件列表
    /// D08 Tier 4 子批次2：拆分为 ≤50 行主函数 + 3 个 helper（fetch_stocks_for_adjustment / apply_single_stock_update / build_adjustment_event）
    async fn apply_stock_updates_for_adjustment(
        txn: &sea_orm::DatabaseTransaction,
        items: Vec<inventory_adjustment_item::Model>,
        adjustment_id: i32,
        adjustment_type: &str,
        adjustment_no: String,
        warehouse_id: i32,
        approved_by: i32,
    ) -> Result<Vec<BusinessEvent>, AppError> {
        let stock_map = Self::fetch_stocks_for_adjustment(txn, &items).await?;
        let mut transaction_events = Vec::new();
        for item in items {
            let stock_model = stock_map
                .get(&item.stock_id)
                .ok_or_else(|| AppError::not_found(format!("库存 ID {} 不存在", item.stock_id)))?;
            validate_stock_warehouse(stock_model.warehouse_id, warehouse_id)?;
            validate_quantity_snapshot(
                adjustment_type,
                item.quantity_before,
                item.quantity,
                item.quantity_after,
                stock_model.quantity_on_hand,
            )?;
            let new_quantity_kg = Self::apply_single_stock_update(txn, &item, stock_model).await?;
            transaction_events.push(Self::build_adjustment_event(
                &item,
                stock_model,
                new_quantity_kg,
                adjustment_id,
                &adjustment_no,
                warehouse_id,
                approved_by,
            ));
        }
        Ok(transaction_events)
    }

    /// 批量查询调整明细涉及的库存（避免循环内 N+1 查询）
    async fn fetch_stocks_for_adjustment(
        txn: &sea_orm::DatabaseTransaction,
        items: &[inventory_adjustment_item::Model],
    ) -> Result<std::collections::HashMap<i32, inventory_stock::Model>, AppError> {
        let stock_ids: Vec<i32> = items.iter().map(|item| item.stock_id).collect();
        let stocks = if stock_ids.is_empty() {
            Vec::new()
        } else {
            inventory_stock::Entity::find()
                .filter(inventory_stock::Column::Id.is_in(stock_ids))
                .all(txn)
                .await?
        };
        Ok(stocks.into_iter().map(|s| (s.id, s)).collect())
    }

    /// 单条库存乐观锁更新（version 条件 + rows_affected 检查），返回调整后的公斤数供事件计算公斤差
    async fn apply_single_stock_update(
        txn: &sea_orm::DatabaseTransaction,
        item: &inventory_adjustment_item::Model,
        stock_model: &inventory_stock::Model,
    ) -> Result<Decimal, AppError> {
        let quantity_before = stock_model.quantity_on_hand;
        let expected_version = stock_model.version;
        // 可用量按账面增减量同步增减，预留量列不写（本操作不占用/释放预留）
        let available_after = compute_available_after(
            stock_model.quantity_available,
            quantity_before,
            item.quantity_after,
        )?;
        let new_quantity_kg = compute_new_kg(
            stock_model.quantity_kg,
            quantity_before,
            item.quantity_after,
        );
        let update_result = inventory_stock::Entity::update_many()
            .col_expr(
                inventory_stock::Column::QuantityOnHand,
                sea_orm::sea_query::Expr::val(item.quantity_after),
            )
            .col_expr(
                inventory_stock::Column::QuantityAvailable,
                sea_orm::sea_query::Expr::val(available_after),
            )
            .col_expr(
                inventory_stock::Column::QuantityMeters,
                sea_orm::sea_query::Expr::val(item.quantity_after),
            )
            .col_expr(
                inventory_stock::Column::QuantityKg,
                sea_orm::sea_query::Expr::val(new_quantity_kg),
            )
            .col_expr(
                inventory_stock::Column::Version,
                sea_orm::sea_query::Expr::col(inventory_stock::Column::Version).add(1),
            )
            .col_expr(
                inventory_stock::Column::UpdatedAt,
                sea_orm::sea_query::Expr::val(Utc::now()),
            )
            .filter(inventory_stock::Column::Id.eq(item.stock_id))
            .filter(inventory_stock::Column::Version.eq(expected_version))
            .exec(txn)
            .await?;
        if update_result.rows_affected == 0 {
            return Err(AppError::business(format!(
                "库存 ID {} 已被其他用户修改，请重试",
                item.stock_id
            )));
        }
        Ok(new_quantity_kg)
    }

    /// 构建库存调整交易事件（quantity_change 基于更新前数量计算，公斤差基于实际持久化公斤值）
    fn build_adjustment_event(
        item: &inventory_adjustment_item::Model,
        stock_model: &inventory_stock::Model,
        new_quantity_kg: Decimal,
        adjustment_id: i32,
        adjustment_no: &str,
        warehouse_id: i32,
        approved_by: i32,
    ) -> BusinessEvent {
        let quantity_change = item.quantity_after - stock_model.quantity_on_hand;
        let quantity_kg_change = new_quantity_kg - stock_model.quantity_kg;
        BusinessEvent::InventoryTransactionCreated {
            transaction_id: adjustment_id,
            transaction_type: "INVENTORY_ADJUSTMENT".to_string(),
            product_id: stock_model.product_id,
            warehouse_id,
            quantity_meters: quantity_change,
            quantity_kg: quantity_kg_change,
            source_bill_type: Some("inventory_adjustment".to_string()),
            source_bill_no: Some(adjustment_no.to_string()),
            source_bill_id: Some(i64::from(adjustment_id)),
            batch_no: stock_model.batch_no.clone(),
            color_no: stock_model.color_no.clone(),
            created_by: Some(approved_by),
        }
    }

    /// 驳回库存调整单
    pub async fn reject_adjustment(
        &self,
        adjustment_id: i32,
    ) -> Result<inventory_adjustment::Model, AppError> {
        // 批次 26 v6 P1 修复：状态机 lock_exclusive 补全，串行化并发状态变更
        // 原状态门查询用 &*self.db 裸查询无行锁，且 update 也用裸连接，无事务保护。
        // 改为在事务内用 find_by_id(id).lock_exclusive() 串行化并发状态变更，update 一并纳入事务。
        let txn = (*self.db).begin().await?;

        let adjustment_model = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;

        // 检查状态
        if adjustment_model.status != adjustment_status::PENDING {
            return Err(AppError::business(
                "只有待审核状态的调整单可以驳回".to_string(),
            ));
        }

        let mut adjustment: inventory_adjustment::ActiveModel = adjustment_model.into();

        adjustment.status = Set(adjustment_status::REJECTED.to_string());
        adjustment.updated_at = Set(Utc::now());

        let updated = adjustment.update(&txn).await.map_err(AppError::from)?;
        txn.commit().await?;
        Ok(updated)
    }

    /// 查询所有调整单（分页，单次 JOIN 富化出仓库名与创建人名）
    pub async fn list_adjustments(
        &self,
        page: u64,
        page_size: u64,
        adjustment_no: Option<String>,
        status: Option<String>,
        data_scope: Option<&DataScopeContext>,
    ) -> Result<(Vec<AdjustmentListRow>, u64), AppError> {
        // 单次查询：warehouse 走实体声明的 Relation::Warehouse.def()；
        // created_by 无声明关系，用 belongs_to 构造一次性 RelationDef LEFT JOIN users.real_name。
        let created_by_rel: RelationDef = inventory_adjustment::Entity::belongs_to(user::Entity)
            .from(inventory_adjustment::Column::CreatedBy)
            .to(user::Column::Id)
            .into();
        let mut query = inventory_adjustment::Entity::find()
            .column_as(warehouse::Column::Name, "warehouse_name")
            .column_as(user::Column::RealName, "created_by_name")
            .join(
                JoinType::LeftJoin,
                inventory_adjustment::Relation::Warehouse.def(),
            )
            .join(JoinType::LeftJoin, created_by_rel);

        // V15 P0-S01：行级数据权限过滤
        // inventory_adjustment 表无 department_id，Dept 退化为 Self，使用 created_by（Option<i32>）。
        if let Some(ctx) = data_scope {
            query = apply_data_scope(
                query,
                ctx,
                inventory_adjustment::Column::CreatedBy,
                inventory_adjustment::Column::CreatedBy, // 无 department_id，Dept 退化为 Self，复用 created_by
            );
        }
        if let Some(no) = adjustment_no {
            query = query.filter(inventory_adjustment::Column::AdjustmentNo.contains(&no));
        }
        if let Some(s) = status {
            query = query.filter(inventory_adjustment::Column::Status.eq(s));
        }

        // 批次 260 修复：接入 paginate_with_total 统一分页逻辑（内部已处理 saturating_sub(1) 偏移）
        let paginator = query
            .order_by(inventory_adjustment::Column::CreatedAt, Order::Desc)
            .into_model::<AdjustmentListRow>()
            .paginate(&*self.db, page_size);

        let (adjustments, total) = paginate_with_total(paginator, page.clamp(1, 1000)).await?;
        Ok((adjustments, total))
    }

    /// 根据 ID 查询调整单
    pub async fn get_adjustment(
        &self,
        adjustment_id: i32,
        data_scope: Option<&DataScopeContext>,
    ) -> Result<AdjustmentDetail, AppError> {
        let adjustment = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;

        // 行级数据权限校验（IDOR 防护）
        // inventory_adjustment 表无 department_id 列，归属判定走成员集合语义
        // （与列表侧 apply_data_scope Dept 分支同源），created_by 为 Option<i32>。
        if let Some(ctx) = data_scope {
            if !check_resource_owner_by_member_scope(ctx, adjustment.created_by) {
                return Err(AppError::permission_denied(format!(
                    "无权访问调整单 {}（数据范围限制）",
                    adjustment_id
                )));
            }
        }

        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .all(&*self.db)
            .await?;

        Ok(AdjustmentDetail { adjustment, items })
    }

    // 生成调整单号（在调用方事务内取号，令 advisory_xact_lock 持有到建单事务提交，
    // 消除自开事务取号提交后到本事务 INSERT 之间的并发撞号窗口）
    crate::impl_generate_no!(
        generate_adjustment_no,
        "ADJ",
        inventory_adjustment::Entity,
        inventory_adjustment::Column::AdjustmentNo,
        txn
    );

    /// 更新调整单（仅 pending 状态可更新）
    pub async fn update_adjustment(
        &self,
        adjustment_id: i32,
        req: UpdateAdjustmentRequest,
    ) -> Result<inventory_adjustment::Model, AppError> {
        // NOT NULL 列门控（warehouse_id/adjustment_date/adjustment_type/reason_type，
        // m0010_add_inventory_extensions DDL）：显式 null 是调用方错误，不是"保持原值"；
        // 在任何 DB 访问之前拒绝，错误外显不脱敏（对齐 department_service 参照形态）。
        if matches!(req.warehouse_id, Some(None)) {
            return Err(AppError::business_displayable(
                "仓库不能清空：该字段为必填项",
            ));
        }
        if matches!(req.adjustment_date, Some(None)) {
            return Err(AppError::business_displayable(
                "调整日期不能清空：该字段为必填项",
            ));
        }
        if matches!(req.adjustment_type, Some(None)) {
            return Err(AppError::business_displayable(
                "调整类型不能清空：该字段为必填项",
            ));
        }
        if matches!(req.reason_type, Some(None)) {
            return Err(AppError::business_displayable(
                "原因类型不能清空：该字段为必填项",
            ));
        }

        // P1-11 修复（批次 79 v1 复审）：状态门 + update 移入单一事务，加 lock_exclusive 串行化
        // 原实现状态门查询在 self.db 上、update 也在 self.db 上，无事务边界，
        // 并发场景下可能在状态检查通过后、update 前发生状态变更，导致已审批/已驳回单被篡改。
        let txn = (*self.db).begin().await?;

        let adjustment_model = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;

        if adjustment_model.status != adjustment_status::PENDING {
            return Err(AppError::business(
                "只有待审核状态的调整单可以更新".to_string(),
            ));
        }

        let mut active: inventory_adjustment::ActiveModel = adjustment_model.into_active_model();

        // 三态写入规则：None=不 Set（列保持 Unset，UPDATE 不含该列，原值不动）；
        // Some(None)=Set(None) 置 NULL；Some(Some(v))=Set(v) 覆盖。
        // warehouse_id/adjustment_date/adjustment_type/reason_type 为 NOT NULL 列
        // （Some(None) 已在入口拒绝）：仅覆盖/保持
        if let Some(warehouse_id) = req.warehouse_id.flatten() {
            active.warehouse_id = Set(warehouse_id);
        }
        if let Some(adjustment_date) = req.adjustment_date.flatten() {
            active.adjustment_date = Set(adjustment_date);
        }
        if let Some(adjustment_type) = req.adjustment_type.flatten() {
            active.adjustment_type = Set(adjustment_type);
        }
        if let Some(reason_type) = req.reason_type.flatten() {
            active.reason_type = Set(reason_type);
        }
        // reason_description/notes 为 DB 可空列（m0010 DDL）：Some(inner)=Set(inner)，
        // 显式 null 直落 NULL，不得塌成"保持原值"
        if let Some(reason_description) = req.reason_description {
            active.reason_description = Set(reason_description);
        }
        if let Some(notes) = req.notes {
            active.notes = Set(notes);
        }
        active.updated_at = Set(Utc::now());

        let updated = active.update(&txn).await?;
        txn.commit().await?;
        Ok(updated)
    }

    /// 删除调整单（仅 pending 状态）
    pub async fn delete_adjustment(
        &self,
        adjustment_id: i32,
        user_id: i32,
    ) -> Result<(), AppError> {
        // P1-12 修复（批次 79 v1 复审）：状态门移入单一事务，加 lock_exclusive 串行化
        // 原实现状态门查询在 self.db 上、delete 在 txn 上，
        // 并发场景下可能在状态检查通过后、delete 前发生状态变更，导致已审批/已驳回单被误删。
        let txn = (*self.db).begin().await?;

        let adjustment_model = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;

        if adjustment_model.status != adjustment_status::PENDING {
            // 删除腿状态门：仅待审核可删除，前置状态未满足，归业务族；
            // 文案点名公开规则，不含标识，可外显
            return Err(AppError::business_displayable(
                "只有待审核状态的调整单可以删除".to_string(),
            ));
        }

        // 先删除明细
        inventory_adjustment_item::Entity::delete_many()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .exec(&txn)
            .await?;

        // 再删除主表（P0 8-3 修复：补审计日志）
        // 批次 94 P2-10：原 Some(0) 占位改为真实操作人 user_id，便于审计追踪
        crate::services::audit_log_service::AuditLogService::delete_with_audit::<
            inventory_adjustment::Entity,
            _,
        >(&txn, "inventory_adjustment", adjustment_id, Some(user_id))
        .await?;

        txn.commit().await?;
        Ok(())
    }

    /// 由明细项反查其所属调整单 ID（供 item 级端点做归属校验）。
    /// handler 路径仅有 item_id 而无父调整单 id 时（如 `PUT/DELETE /adjustments/items/{item_id}`），
    /// 先用此查询拿到 adjustment_id，再走 `get_adjustment(adjustment_id, Some(&ctx))` 的既有 data-scope 范式。
    /// 明细不存在返回 404（not_found）。不改 schema，仅复用既有实体查询。
    pub async fn get_adjustment_id_by_item(&self, item_id: i32) -> Result<i32, AppError> {
        let item = inventory_adjustment_item::Entity::find_by_id(item_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单明细 {} 不存在", item_id)))?;
        Ok(item.adjustment_id)
    }

    /// 列出调整单的所有明细项
    pub async fn list_items(
        &self,
        adjustment_id: i32,
    ) -> Result<Vec<inventory_adjustment_item::Model>, AppError> {
        // 确认主单存在
        // 批次 113 P1-8：移除 `let _ =` 显式丢弃，直接表达式语句校验存在性
        self.get_adjustment(adjustment_id, None).await?;

        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .order_by(inventory_adjustment_item::Column::Id, Order::Asc)
            .all(&*self.db)
            .await?;

        Ok(items)
    }

    /// 向调整单添加明细
    pub async fn add_item(
        &self,
        adjustment_id: i32,
        req: AdjustmentItemRequest,
    ) -> Result<inventory_adjustment_item::Model, AppError> {
        let txn = (*self.db).begin().await?;
        let adjustment = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("库存调整单不存在".to_string()))?;
        if adjustment.status != adjustment_status::PENDING {
            tracing::warn!(adjustment_id, "库存调整明细添加失败：单据不是待审核状态");
            return Err(AppError::business(
                "只有待审核状态的调整单可以添加明细".to_string(),
            ));
        }

        let stock = inventory_stock::Entity::find_by_id(req.stock_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("库存 ID {} 不存在", req.stock_id)))?;
        validate_stock_warehouse(stock.warehouse_id, adjustment.warehouse_id)?;
        let quantity_before = stock.quantity_on_hand;
        let quantity_after =
            calculate_quantity_after(&adjustment.adjustment_type, quantity_before, req.quantity)?;
        let amount = calculate_adjustment_amount(req.unit_cost, req.quantity)?;

        let item = inventory_adjustment_item::ActiveModel {
            id: Default::default(),
            adjustment_id: Set(adjustment_id),
            stock_id: Set(req.stock_id),
            quantity: Set(req.quantity),
            quantity_before: Set(quantity_before),
            quantity_after: Set(quantity_after),
            unit_cost: Set(req.unit_cost),
            amount: Set(amount),
            notes: Set(req.notes),
            created_at: Set(Utc::now()),
            updated_at: Set(Utc::now()),
        };

        let item_model = item.insert(&txn).await?;

        // 重新计算总数量
        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .all(&txn)
            .await?;
        let total_quantity = calculate_total_quantity(items.iter().map(|item| item.quantity))?;

        let mut adjustment: inventory_adjustment::ActiveModel = adjustment.into_active_model();
        adjustment.total_quantity = Set(total_quantity);
        adjustment.updated_at = Set(Utc::now());
        adjustment.update(&txn).await?;

        txn.commit().await?;

        Ok(item_model)
    }

    /// 更新调整单明细
    pub async fn update_item(
        &self,
        item_id: i32,
        req: AdjustmentItemRequest,
    ) -> Result<inventory_adjustment_item::Model, AppError> {
        let txn = (*self.db).begin().await?;
        let adjustment_id = inventory_adjustment_item::Entity::find_by_id(item_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单明细 {} 不存在", item_id)))?
            .adjustment_id;
        let adjustment = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("库存调整单不存在".to_string()))?;
        if adjustment.status != adjustment_status::PENDING {
            tracing::warn!(
                adjustment_id,
                item_id,
                "库存调整明细修改失败：单据不是待审核状态"
            );
            return Err(AppError::business(
                "只有待审核状态的调整单可以修改明细".to_string(),
            ));
        }
        let item_model = inventory_adjustment_item::Entity::find_by_id(item_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单明细 {} 不存在", item_id)))?;
        let stock = inventory_stock::Entity::find_by_id(req.stock_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("库存 ID {} 不存在", req.stock_id)))?;
        validate_stock_warehouse(stock.warehouse_id, adjustment.warehouse_id)?;
        let quantity_before = stock.quantity_on_hand;
        let quantity_after =
            calculate_quantity_after(&adjustment.adjustment_type, quantity_before, req.quantity)?;
        let amount = calculate_adjustment_amount(req.unit_cost, req.quantity)?;

        let mut active: inventory_adjustment_item::ActiveModel = item_model.into_active_model();
        active.stock_id = Set(req.stock_id);
        active.quantity = Set(req.quantity);
        active.quantity_before = Set(quantity_before);
        active.quantity_after = Set(quantity_after);
        active.unit_cost = Set(req.unit_cost);
        active.amount = Set(amount);
        active.notes = Set(req.notes);
        active.updated_at = Set(Utc::now());
        let updated = active.update(&txn).await?;
        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(adjustment_id))
            .all(&txn)
            .await?;
        let total_quantity = calculate_total_quantity(items.iter().map(|item| item.quantity))?;
        let mut adjustment = adjustment.into_active_model();
        adjustment.total_quantity = Set(total_quantity);
        adjustment.updated_at = Set(Utc::now());
        adjustment.update(&txn).await?;
        txn.commit().await?;
        tracing::info!(adjustment_id, item_id, "库存调整明细修改成功");
        Ok(updated)
    }

    /// 删除调整单明细
    pub async fn delete_item(&self, item_id: i32) -> Result<(), AppError> {
        let txn = (*self.db).begin().await?;
        let adjustment_id = inventory_adjustment_item::Entity::find_by_id(item_id)
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单明细 {} 不存在", item_id)))?
            .adjustment_id;
        // 主单先于明细加锁，避免与审核、修改明细形成反向锁序。
        let adjustment_model = inventory_adjustment::Entity::find_by_id(adjustment_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单 {} 不存在", adjustment_id)))?;
        let item_model = inventory_adjustment_item::Entity::find_by_id(item_id)
            .lock_exclusive()
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调整单明细 {} 不存在", item_id)))?;

        if adjustment_model.status != adjustment_status::PENDING {
            // 删除腿状态门：仅待审核可删除明细，前置状态未满足，归业务族；
            // 文案点名公开规则，不含标识，可外显
            return Err(AppError::business_displayable(
                "只有待审核状态的调整单可以删除明细".to_string(),
            ));
        }

        inventory_adjustment_item::Entity::delete_by_id(item_id)
            .exec(&txn)
            .await?;

        // 重新计算总数量
        let items = inventory_adjustment_item::Entity::find()
            .filter(inventory_adjustment_item::Column::AdjustmentId.eq(item_model.adjustment_id))
            .all(&txn)
            .await?;
        let total_quantity = calculate_total_quantity(items.iter().map(|item| item.quantity))?;

        let mut adjustment: inventory_adjustment::ActiveModel =
            adjustment_model.into_active_model();
        adjustment.total_quantity = Set(total_quantity);
        adjustment.updated_at = Set(Utc::now());
        adjustment.update(&txn).await?;

        txn.commit().await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{
        calculate_adjustment_amount, calculate_quantity_after, calculate_total_quantity,
        compute_available_after, compute_new_kg, validate_quantity_snapshot,
        validate_stock_warehouse,
    };
    use crate::utils::error::AppError;
    use rust_decimal::Decimal;

    #[test]
    fn accept_stock_in_adjustment_warehouse() {
        assert!(validate_stock_warehouse(1, 1).is_ok());
    }

    #[test]
    fn reject_stock_in_another_warehouse_in_both_directions() {
        for (stock_warehouse_id, adjustment_warehouse_id) in [(1, 2), (2, 1)] {
            let error =
                validate_stock_warehouse(stock_warehouse_id, adjustment_warehouse_id).unwrap_err();
            assert!(matches!(
                error,
                AppError::ValidationErrorDisplayable(message)
                    if message == "库存所属仓库与调整单仓库不一致，请重新选择库存"
            ));
        }
    }

    #[test]
    fn sum_quantities_without_precision_loss() {
        assert_eq!(
            calculate_total_quantity([Decimal::new(1, 1), Decimal::new(2, 1)]).unwrap(),
            Decimal::new(3, 1)
        );
        assert_eq!(calculate_total_quantity([]).unwrap(), Decimal::ZERO);
    }

    #[test]
    fn reject_total_quantity_overflow() {
        assert!(calculate_total_quantity([Decimal::MAX, Decimal::ONE]).is_err());
    }

    #[test]
    fn preserve_optional_cost_and_round_amount_to_two_places() {
        assert_eq!(
            calculate_adjustment_amount(None, Decimal::TWO).unwrap(),
            None
        );
        assert_eq!(
            calculate_adjustment_amount(Some(Decimal::ZERO), Decimal::TWO).unwrap(),
            Some(Decimal::ZERO)
        );
        assert_eq!(
            calculate_adjustment_amount(Some(Decimal::new(1234, 3)), Decimal::TWO).unwrap(),
            Some(Decimal::new(247, 2))
        );
    }

    #[test]
    fn reject_amount_overflow_instead_of_dropping_amount() {
        assert!(calculate_adjustment_amount(Some(Decimal::MAX), Decimal::TWO).is_err());
    }

    #[test]
    fn available_after_follows_on_hand_delta_with_reserved_untouched() {
        // 预留 10，可用 40，账面 50：增加 50 → 100，可用同步增加 50
        assert_eq!(
            compute_available_after(
                Decimal::new(40, 0),
                Decimal::new(50, 0),
                Decimal::new(100, 0)
            )
            .unwrap(),
            Decimal::new(90, 0)
        );
        // 预留仍为 10，账面 100 → 50，可用 90 → 40
        assert_eq!(
            compute_available_after(
                Decimal::new(90, 0),
                Decimal::new(100, 0),
                Decimal::new(50, 0)
            )
            .unwrap(),
            Decimal::new(40, 0)
        );
    }

    #[test]
    fn available_after_zero_is_legal_floor() {
        // 可用恰好减到 0 合法（可用 20 + (-20)）
        assert_eq!(
            compute_available_after(
                Decimal::new(20, 0),
                Decimal::new(100, 0),
                Decimal::new(80, 0)
            )
            .unwrap(),
            Decimal::ZERO
        );
    }

    #[test]
    fn reject_negative_available_with_reserved_hint() {
        let error = compute_available_after(
            Decimal::new(20, 0),
            Decimal::new(100, 0),
            Decimal::new(60, 0),
        )
        .unwrap_err();
        assert!(matches!(
            error,
            AppError::ValidationErrorDisplayable(message)
                if message == "调整后可用库存不能为负数，请先核对预留数量"
        ));
    }

    #[test]
    fn scale_kg_by_meter_ratio_and_round_to_two_places() {
        // 20kg / 100m → 110m = 22.00kg
        assert_eq!(
            compute_new_kg(
                Decimal::new(20, 0),
                Decimal::new(100, 0),
                Decimal::new(110, 0)
            ),
            Decimal::new(22, 0)
        );
        // 无理比率结果按列精度保留 2 位小数（1kg/3m → 1m ≈ 0.33kg）
        assert_eq!(
            compute_new_kg(Decimal::ONE, Decimal::new(3, 0), Decimal::new(1, 0)),
            Decimal::new(33, 2)
        );
    }

    #[test]
    fn kg_midpoint_rounding_preserves_numeric_column_behavior() {
        assert_eq!(
            compute_new_kg(Decimal::new(5, 2), Decimal::TWO, Decimal::ONE),
            Decimal::new(3, 2)
        );
    }

    #[test]
    fn keep_kg_when_meters_undefined_ratio() {
        // 米数为 0 的行无从定义比率，公斤数保持原值
        assert_eq!(
            compute_new_kg(Decimal::new(75, 2), Decimal::ZERO, Decimal::new(42, 0)),
            Decimal::new(75, 2)
        );
    }

    #[test]
    fn negative_kg_delta_stays_negative_for_event() {
        // 12kg / 96m → 48m = 6.00kg，公斤差 = 6.00 - 12 = -6.00（负值供事件使用）
        let new_kg = compute_new_kg(
            Decimal::new(12, 0),
            Decimal::new(96, 0),
            Decimal::new(48, 0),
        );
        assert_eq!(new_kg, Decimal::new(6, 0));
        assert!(new_kg - Decimal::new(12, 0) < Decimal::ZERO);
    }

    #[test]
    fn calculate_positive_adjustments_and_decrease_to_zero() {
        let before = Decimal::new(100, 1);
        let quantity = Decimal::new(25, 1);
        assert_eq!(
            calculate_quantity_after("increase", before, quantity).unwrap(),
            Decimal::new(125, 1)
        );
        assert_eq!(
            calculate_quantity_after("decrease", before, quantity).unwrap(),
            Decimal::new(75, 1)
        );
        assert_eq!(
            calculate_quantity_after("decrease", before, before).unwrap(),
            Decimal::ZERO
        );
    }

    #[test]
    fn reject_nonpositive_quantities_for_both_directions() {
        for direction in ["increase", "decrease"] {
            for quantity in [Decimal::ZERO, -Decimal::ONE] {
                assert!(calculate_quantity_after(direction, Decimal::ONE, quantity).is_err());
            }
        }
    }

    #[test]
    fn reject_insufficient_stock_invalid_direction_and_overflow() {
        assert!(calculate_quantity_after("decrease", Decimal::ONE, Decimal::TWO).is_err());
        assert!(calculate_quantity_after("invalid", Decimal::ONE, Decimal::ONE).is_err());
        assert!(calculate_quantity_after("increase", Decimal::MAX, Decimal::ONE).is_err());
        assert!(calculate_quantity_after("decrease", Decimal::MIN, Decimal::ONE).is_err());
    }

    #[test]
    fn validate_unchanged_quantity_snapshot() {
        assert!(
            validate_quantity_snapshot(
                "decrease",
                Decimal::TWO,
                Decimal::ONE,
                Decimal::ONE,
                Decimal::TWO,
            )
            .is_ok()
        );
    }

    #[test]
    fn reject_stale_or_tampered_quantity_snapshots() {
        assert!(
            validate_quantity_snapshot(
                "decrease",
                Decimal::TWO,
                Decimal::ONE,
                Decimal::ONE,
                Decimal::ONE,
            )
            .is_err()
        );
        for direction in ["increase", "decrease"] {
            assert!(
                validate_quantity_snapshot(
                    direction,
                    Decimal::TWO,
                    Decimal::ONE,
                    Decimal::ZERO,
                    Decimal::TWO,
                )
                .is_err()
            );
        }
        assert!(
            validate_quantity_snapshot(
                "increase",
                Decimal::TWO,
                Decimal::ONE,
                Decimal::ONE,
                Decimal::TWO,
            )
            .is_err()
        );
    }
}
