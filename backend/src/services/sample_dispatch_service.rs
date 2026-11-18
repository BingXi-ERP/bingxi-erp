//! 调样单服务：主表 CRUD + 行级明细（sample_dispatch_orders / sample_dispatch_items）
//!
//! 单号：后端取号，前缀 `BX-DY`，年月格式 `{前缀}{YYMM}-{3位流水}`（真实样例
//! `BX-DY2607-1356`），取号方 `utils/number_generator.rs::generate_no_ym_with_txn`，
//! 走 `insert_with_no_retry_ym` 在调用方事务内「取号 + 插入」并对单号列 UNIQUE
//! 冲突(23505)做保存点级重试；不接收前端传号。
//! 账务四列（opening_balance=上单结余 / total_amount=货款总计即应收 /
//! total_collections=实收 / closing_balance=上期欠款）由调用方照实写入，
//! 本服务不与对账单做事务联动（口径见 models/sample_dispatch_order.rs）。
//! 行级金额 `amount` 由后端按 `quantity_meters × unit_price` 计算落列，
//! 不采信前端合计（防口径漂移）。

use std::collections::HashSet;
use std::sync::Arc;

use chrono::Utc;
use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DatabaseTransaction, EntityTrait,
    PaginatorTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};
use serde::{Deserialize, Serialize};

use crate::models::customer;
use crate::models::product;
use crate::models::sample_dispatch_item;
use crate::models::sample_dispatch_order;
use crate::utils::data_scope::{apply_department_scope, DataScope, DataScopeContext};
use crate::utils::error::AppError;
use crate::utils::number_generator::DocumentNumberGenerator;

/// 调样单号前缀（真实业务样例 BX-DY2607-1356）
pub const SAMPLE_DISPATCH_NO_PREFIX: &str = "BX-DY";

/// 创建调样单请求体
#[derive(Debug, Deserialize)]
pub struct CreateSampleDispatchRequest {
    /// 客户 ID（customers.id）
    pub customer_id: i32,
    /// 制单部门
    pub department: String,
    /// 调样日期
    pub dispatch_date: chrono::NaiveDate,
    /// 上单结余
    pub opening_balance: Decimal,
    /// 货款总计=应收
    pub total_amount: Decimal,
    /// 实收
    pub total_collections: Decimal,
    /// 上期欠款
    pub closing_balance: Decimal,
    /// 备注
    pub remarks: Option<String>,
    /// 行级明细（至少一行）
    pub items: Vec<CreateSampleDispatchItem>,
}

/// 创建调样单行级明细请求体
#[derive(Debug, Deserialize)]
pub struct CreateSampleDispatchItem {
    /// 产品 ID（products.id）
    pub product_id: i32,
    /// 缸号
    pub dye_lot_no: String,
    /// 色号
    pub color_no: String,
    /// 成分
    pub composition: String,
    /// 米数
    pub quantity_meters: Decimal,
    /// 单价
    pub unit_price: Decimal,
    /// 备注
    pub remarks: Option<String>,
    /// 行序（缺省按提交顺序从 0 递增）
    pub sort_order: Option<i32>,
}

/// 更新调样单请求体（主表字段全量替换 + 明细整单替换）
#[derive(Debug, Deserialize)]
pub struct UpdateSampleDispatchRequest {
    pub customer_id: i32,
    pub department: String,
    pub dispatch_date: chrono::NaiveDate,
    pub opening_balance: Decimal,
    pub total_amount: Decimal,
    pub total_collections: Decimal,
    pub closing_balance: Decimal,
    pub remarks: Option<String>,
    pub items: Vec<CreateSampleDispatchItem>,
}

/// 列表查询参数（分页键 page/page_size 与后端 Query<T> 同名）
#[derive(Debug, Deserialize)]
pub struct SampleDispatchQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    /// 按客户精确筛选
    pub customer_id: Option<i32>,
    /// 按单据号精确筛选
    pub document_no: Option<String>,
}

/// 调样单详情：主表 + 客户名称 + 行级明细
#[derive(Debug, Serialize)]
pub struct SampleDispatchDetail {
    /// 主表行（出参键 = models/sample_dispatch_order.rs 字段名，snake_case）
    pub order: sample_dispatch_order::Model,
    /// 客户名称（customers.customer_name，经归属客户行取真名，禁造假名）
    pub customer_name: String,
    /// 行级明细（按 sort_order、id 升序）
    pub items: Vec<sample_dispatch_item::Model>,
}

/// 列表页返回：items + 分页四元组（page/page_size 已 clamp 后回传）
pub struct SampleDispatchPage {
    pub items: Vec<sample_dispatch_order::Model>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

/// 持有数据库连接的调样单服务。
pub struct SampleDispatchService {
    db: Arc<DatabaseConnection>,
}

impl SampleDispatchService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 明细共同校验：非空 + 产品集中存在性预检（单查询取存在集，不等 DB FK 报错）。
    /// 缺失产品点名 ID 返回业务错误；通过则返回 ()。
    async fn validate_items(&self, items: &[CreateSampleDispatchItem]) -> Result<(), AppError> {
        if items.is_empty() {
            return Err(AppError::bad_request("调样单明细不能为空"));
        }
        let product_ids: Vec<i32> = items.iter().map(|i| i.product_id).collect();
        let found: HashSet<i32> = product::Entity::find()
            .filter(product::Column::Id.is_in(product_ids.clone()))
            .all(&*self.db)
            .await?
            .into_iter()
            .map(|p| p.id)
            .collect();
        let missing: Vec<i32> = product_ids
            .iter()
            .copied()
            .filter(|id| !found.contains(id))
            .collect();
        if !missing.is_empty() {
            tracing::error!(missing_products = ?missing, "调样单明细引用不存在的产品，拒绝落库");
            return Err(AppError::bad_request(format!(
                "调样单明细引用了不存在的产品：{:?}",
                missing
            )));
        }
        Ok(())
    }

    /// 行级金额：`quantity_meters × unit_price`（饱和检查，溢出显式报错不 panic）
    fn compute_amount(quantity_meters: Decimal, unit_price: Decimal) -> Result<Decimal, AppError> {
        quantity_meters
            .checked_mul(unit_price)
            .ok_or_else(|| AppError::bad_request("明细金额计算溢出（米数×单价超出精度上限）"))
    }

    /// 组装主表 ActiveModel（创建与更新共用一份字段装配，避免两处口径漂移）。
    /// document_no 为 Some 时注入取号结果（创建路径）；None 时保持 NotSet（更新路径单号不重取）。
    #[allow(clippy::too_many_arguments)]
    fn build_order_active_model(
        document_no: Option<String>,
        customer_id: i32,
        department: String,
        dispatch_date: chrono::NaiveDate,
        opening_balance: Decimal,
        total_amount: Decimal,
        total_collections: Decimal,
        closing_balance: Decimal,
        remarks: Option<String>,
        created_by: Option<i32>,
        now: chrono::DateTime<Utc>,
    ) -> sample_dispatch_order::ActiveModel {
        sample_dispatch_order::ActiveModel {
            id: Default::default(),
            document_no: document_no.map(Set).unwrap_or(sea_orm::ActiveValue::NotSet),
            customer_id: Set(customer_id),
            department: Set(department),
            dispatch_date: Set(dispatch_date),
            opening_balance: Set(opening_balance),
            total_amount: Set(total_amount),
            total_collections: Set(total_collections),
            closing_balance: Set(closing_balance),
            remarks: Set(remarks),
            created_by: Set(created_by),
            created_at: Set(now),
            updated_at: Set(now),
        }
    }

    /// 在事务内整批写入明细（行序缺省按提交顺序；金额后端计算）。
    /// 传入 txn：明细与主表取号/写入同事务，任一行失败整事务回滚。
    async fn insert_items_in_txn(
        txn: &DatabaseTransaction,
        order_id: i32,
        items: Vec<CreateSampleDispatchItem>,
    ) -> Result<Vec<sample_dispatch_item::Model>, AppError> {
        let mut models = Vec::with_capacity(items.len());
        for (idx, item) in items.into_iter().enumerate() {
            let amount = Self::compute_amount(item.quantity_meters, item.unit_price)?;
            let active = sample_dispatch_item::ActiveModel {
                id: Default::default(),
                dispatch_order_id: Set(order_id),
                product_id: Set(item.product_id),
                dye_lot_no: Set(item.dye_lot_no),
                color_no: Set(item.color_no),
                composition: Set(item.composition),
                quantity_meters: Set(item.quantity_meters),
                unit_price: Set(item.unit_price),
                amount: Set(amount),
                remarks: Set(item.remarks),
                sort_order: Set(item.sort_order.unwrap_or(idx as i32)),
            };
            models.push(active.insert(txn).await?);
        }
        Ok(models)
    }

    /// 详情装配：主行 + 客户真名 + 明细。
    /// 客户行由 FK 约束保证存在（NO ACTION），缺失即显式 404，不回落占位名。
    async fn assemble_detail(
        &self,
        order: sample_dispatch_order::Model,
    ) -> Result<SampleDispatchDetail, AppError> {
        let customer_name = self.customer_name_of(order.customer_id).await?;
        let items = sample_dispatch_item::Entity::find()
            .filter(sample_dispatch_item::Column::DispatchOrderId.eq(order.id))
            .order_by_asc(sample_dispatch_item::Column::SortOrder)
            .order_by_asc(sample_dispatch_item::Column::Id)
            .all(&*self.db)
            .await?;
        Ok(SampleDispatchDetail {
            customer_name,
            order,
            items,
        })
    }

    /// 归属客户真名（customers.customer_name）；客户行缺失显式 404，禁造假名
    async fn customer_name_of(&self, customer_id: i32) -> Result<String, AppError> {
        let customer_row = customer::Entity::find_by_id(customer_id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("客户 {} 不存在", customer_id)))?;
        Ok(customer_row.customer_name)
    }

    /// 创建调样单（取号 + 主表 + 明细同事务；单号由后端生成，不接收前端传号）
    pub async fn create(
        &self,
        req: CreateSampleDispatchRequest,
        user_id: i32,
    ) -> Result<SampleDispatchDetail, AppError> {
        self.validate_items(&req.items).await?;

        let txn = self.db.begin().await?;
        let now = Utc::now();
        // 取号 + 插入同事务（BX-DY 年月号段；23505 保存点重试；非唯一类 SQL 错误原样上抛）
        let order = DocumentNumberGenerator::insert_with_no_retry_ym(
            &txn,
            SAMPLE_DISPATCH_NO_PREFIX,
            sample_dispatch_order::Entity,
            sample_dispatch_order::Column::DocumentNo,
            |document_no| {
                Self::build_order_active_model(
                    Some(document_no),
                    req.customer_id,
                    req.department.clone(),
                    req.dispatch_date,
                    req.opening_balance,
                    req.total_amount,
                    req.total_collections,
                    req.closing_balance,
                    req.remarks.clone(),
                    Some(user_id),
                    now,
                )
            },
        )
        .await?;
        let items = Self::insert_items_in_txn(&txn, order.id, req.items).await?;
        txn.commit().await?;
        tracing::info!(
            order_id = order.id,
            document_no = %order.document_no,
            "调样单创建成功"
        );
        let customer_name = self.customer_name_of(order.customer_id).await?;
        Ok(SampleDispatchDetail {
            customer_name,
            order,
            items,
        })
    }

    /// 详情（主表 + 客户名称 + 行级明细）
    pub async fn get_detail(&self, id: i32) -> Result<SampleDispatchDetail, AppError> {
        let order = sample_dispatch_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调样单 {} 不存在", id)))?;
        self.assemble_detail(order).await
    }

    /// 列表（分页；customer_id/document_no 可选精确筛选；按创建时间倒序）。
    /// page/page_size clamp 到合法区间后回传，出参分页四键与入参一致。
    /// 行级数据权限：调样单主表无自身部门列，归属继承父客户（customers 为
    /// m_rls_dept_domain RLS 表，归属列 `owner_id`、冗余部门列 `department_id`）。
    /// `data_scope` 非 `All` 时先在 customers 上以 `apply_department_scope` 下推
    /// 得到可见客户 id 集合，再以 `customer_id IN` 收窄——非 handler 后置过滤，
    /// 保证分页 `total` 与可见集一致。`All` 用户跳过子查询避免全表 id 物化。
    /// 与单行门 `check_resource_owner`（handler 借父 customer 同两列判定）同源：
    /// 列表可见 ⇔ 详情可读。本方法是列表的唯一通路：不设"不带 scope 的平行版本"，
    /// 否则新增调用点漏传即静默全量可见。
    pub async fn list(
        &self,
        query: SampleDispatchQuery,
        data_scope: Option<&DataScopeContext>,
    ) -> Result<SampleDispatchPage, AppError> {
        let page = query.page.unwrap_or(1).clamp(1, 100_000);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let mut select = sample_dispatch_order::Entity::find();
        if let Some(ctx) = data_scope {
            if ctx.scope != DataScope::All {
                let visible_ids: Vec<i32> = apply_department_scope(
                    customer::Entity::find(),
                    ctx,
                    customer::Column::OwnerId,
                    customer::Column::DepartmentId,
                )
                .all(&*self.db)
                .await?
                .into_iter()
                .map(|c| c.id)
                .collect();
                // 可见集为空时 sea-query 把 `IN ()` 渲染为恒假（`1 = 2`），
                // 即"无可见客户即无可见调样单"。
                select =
                    select.filter(sample_dispatch_order::Column::CustomerId.is_in(visible_ids));
            }
        }
        if let Some(customer_id) = query.customer_id {
            select = select.filter(sample_dispatch_order::Column::CustomerId.eq(customer_id));
        }
        if let Some(document_no) = query.document_no {
            select = select.filter(sample_dispatch_order::Column::DocumentNo.eq(document_no));
        }
        let total = select.clone().count(&*self.db).await?;
        let items = select
            .order_by_desc(sample_dispatch_order::Column::CreatedAt)
            .order_by_desc(sample_dispatch_order::Column::Id)
            .paginate(&*self.db, page_size)
            .fetch_page(page.saturating_sub(1))
            .await?;
        Ok(SampleDispatchPage {
            items,
            total,
            page,
            page_size,
        })
    }

    /// 更新调样单（主表字段全量替换 + 明细整单替换；单号保持原值不重取）。
    /// 明细替换与主表更新同事务：先删后插，任一步失败整事务回滚。
    pub async fn update(
        &self,
        id: i32,
        req: UpdateSampleDispatchRequest,
    ) -> Result<SampleDispatchDetail, AppError> {
        self.validate_items(&req.items).await?;
        let existing = sample_dispatch_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调样单 {} 不存在", id)))?;

        let txn = self.db.begin().await?;
        let now = Utc::now();
        let mut active: sample_dispatch_order::ActiveModel = existing.into();
        active.customer_id = Set(req.customer_id);
        active.department = Set(req.department);
        active.dispatch_date = Set(req.dispatch_date);
        active.opening_balance = Set(req.opening_balance);
        active.total_amount = Set(req.total_amount);
        active.total_collections = Set(req.total_collections);
        active.closing_balance = Set(req.closing_balance);
        active.remarks = Set(req.remarks);
        active.updated_at = Set(now);
        let order = active.update(&txn).await?;

        sample_dispatch_item::Entity::delete_many()
            .filter(sample_dispatch_item::Column::DispatchOrderId.eq(order.id))
            .exec(&txn)
            .await?;
        // 明细整单替换：返回值由 assemble_detail 重查回读，此处只落库
        Self::insert_items_in_txn(&txn, order.id, req.items).await?;
        txn.commit().await?;
        tracing::info!(order_id = order.id, "调样单更新成功");
        self.assemble_detail(order).await
    }

    /// 删除调样单（物理删除：先删明细再删主行，同事务；模型无状态列，无作废词表可承载，
    /// 状态口径交回编排方裁定，本服务不造状态值）。
    pub async fn delete(&self, id: i32) -> Result<(), AppError> {
        let existing = sample_dispatch_order::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("调样单 {} 不存在", id)))?;
        let txn = self.db.begin().await?;
        sample_dispatch_item::Entity::delete_many()
            .filter(sample_dispatch_item::Column::DispatchOrderId.eq(existing.id))
            .exec(&txn)
            .await?;
        sample_dispatch_order::Entity::delete_by_id(existing.id)
            .exec(&txn)
            .await?;
        txn.commit().await?;
        tracing::info!(order_id = existing.id, "调样单删除成功");
        Ok(())
    }
}
