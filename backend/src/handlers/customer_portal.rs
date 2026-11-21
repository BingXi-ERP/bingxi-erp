//! 小程序客户门户读端点（/customer-portal/*）。
//!
//! ## 六要素
//! - **功能**：客户外部账号（customer 角色）经显式绑定（users.customer_id）以只读方式
//!   访问自己的订单列表与详情、退货单、收款记录、对账单、商品档案、授权色卡与汇总。
//! - **调用方**：小程序客户业务页（apiGateway 走 /api/v1/erp 前缀）。
//! - **入参**：分页与各域安全筛选字段（状态/单号/日期）。**不收 customer_id 入参**——
//!   归属唯一来源是 require_portal_customer 解析出的绑定，请求侧无任何途径指定他人客户。
//! - **传给谁**：订单/退货/对账单复用各域既有列表 service（so::order / sales_return_service /
//!   ar/recon），收款直接查 ar_collection 实体；所有查询强制 customer_id = 绑定值，
//!   data_scope 传 None。出参逐字段映射本模块定义的门户白名单 DTO，不直出内部响应结构。
//! - **存什么**：不写库，只读各域列表。
//! - **存哪里**：不适用（只读端点）。
//!
//! ## 为什么 data_scope 传 None 是安全的（对照 ar/recon_ops/crud.rs "唯一通路"警告）
//! 员工行级 scope（created_by/dept owner）是"员工归属"维度，对客户账号恒产生空集或错误集；
//! 本端点的行级门是 require_portal_customer 的绑定 + 各域 customer_id 等值过滤，比员工
//! scope 更窄（客户只能看到自己那一个 customer_id 的行）。因此 None 不是绕过，而是把
//! 员工维度让位给客户维度；列表 total 与可见集一致。
//!
//! ## 权限
//! 第一道 RBAC 门按 URL 派生 `customer-portal:read`（resource = seg3，GET→read）；
//! 该码在 PERMISSION_RESOURCES 在册、只授予 customer 角色，员工岗位不授（门户与内部
//! 读面互不越界）；admin 经通配可达。

use axum::{
    Json,
    extract::{Path, Query, State},
};
use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use sea_orm::{
    ColumnTrait, EntityTrait, ExprTrait, JoinType, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, RelationTrait, sea_query::Expr,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::ar_collection;
use crate::models::ar_reconciliation;
use crate::models::color_card;
use crate::models::color_card_issue;
use crate::models::dto::PageRequest;
use crate::models::product;
use crate::models::sales_order;
use crate::models::status::sales::sales_order as so_status;
use crate::services::ar::ArReconciliationService;
use crate::services::color_card_issue_service::IssueStatus;
use crate::services::customer_portal_service::require_portal_customer;
use crate::services::product_service::ProductService;
use crate::services::sales_return_service::{SalesReturnService, SalesReturnView};
use crate::services::so::SalesOrderDetail;
use crate::services::so::order::SalesService;
use crate::utils::error::AppError;
use crate::utils::response::{ApiResponse, PaginatedResponse};
use crate::utils::sql_escape::safe_like_pattern;

/// 分页 clamp 口径与内部列表端点一致（防 DoS）
fn clamp_page(page: Option<u64>) -> u64 {
    page.unwrap_or(1).clamp(1, 1000)
}

fn clamp_page_size(page_size: Option<u64>) -> u64 {
    page_size.unwrap_or(20).clamp(1, 100)
}

/// 客户门户订单列表查询（不收 customer_id：归属只来自账号绑定）
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalOrderListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub order_no: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
}

/// 客户门户退货单列表查询
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalReturnListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub return_no: Option<String>,
}

/// 客户门户收款记录列表查询
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalPaymentListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub payment_no: Option<String>,
}

/// 客户门户对账单列表查询
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalReconciliationListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
}

/// 门户订单白名单：只暴露客户自有单据的单号/状态/日期/金额/缸号批次。
/// 审批链（approved_by/approval_reason/rejected_reason）、内部人员（created_by/
/// creator_name/dept_id）、地址与备注均不在此列，内部 DTO 加字段不会波及此面。
#[derive(Debug, Clone, Serialize)]
pub struct PortalOrderView {
    pub id: i32,
    pub customer_id: i32,
    pub order_no: String,
    pub order_date: DateTime<Utc>,
    pub required_date: Option<DateTime<Utc>>,
    pub ship_date: Option<DateTime<Utc>>,
    pub status: String,
    pub subtotal: Decimal,
    pub tax_amount: Decimal,
    pub discount_amount: Decimal,
    pub shipping_cost: Decimal,
    pub total_amount: Decimal,
    pub paid_amount: Decimal,
    pub balance_amount: Decimal,
    pub batch_no: Option<String>,
    pub color_no: Option<String>,
    pub dye_lot_no: Option<String>,
    pub grade: Option<String>,
}

impl From<SalesOrderDetail> for PortalOrderView {
    fn from(order: SalesOrderDetail) -> Self {
        Self {
            id: order.id,
            customer_id: order.customer_id,
            order_no: order.order_no,
            order_date: order.order_date,
            required_date: order.required_date,
            ship_date: order.ship_date,
            status: order.status,
            subtotal: order.subtotal,
            tax_amount: order.tax_amount,
            discount_amount: order.discount_amount,
            shipping_cost: order.shipping_cost,
            total_amount: order.total_amount,
            paid_amount: order.paid_amount,
            balance_amount: order.balance_amount,
            batch_no: order.batch_no,
            color_no: order.color_no,
            dye_lot_no: order.dye_lot_no,
            grade: order.grade,
        }
    }
}

impl From<sales_order::Model> for PortalOrderView {
    fn from(order: sales_order::Model) -> Self {
        Self {
            id: order.id,
            customer_id: order.customer_id,
            order_no: order.order_no,
            order_date: order.order_date,
            required_date: order.required_date,
            ship_date: order.ship_date,
            status: order.status,
            subtotal: order.subtotal,
            tax_amount: order.tax_amount,
            discount_amount: order.discount_amount,
            shipping_cost: order.shipping_cost,
            total_amount: order.total_amount,
            paid_amount: order.paid_amount,
            balance_amount: order.balance_amount,
            batch_no: order.batch_no,
            color_no: order.color_no,
            dye_lot_no: order.dye_lot_no,
            grade: order.grade,
        }
    }
}

/// 门户退货单白名单：单据头业务字段 + 关联客户/来源单名，审批与仓库内部字段不出现。
#[derive(Debug, Clone, Serialize)]
pub struct PortalReturnView {
    pub id: i32,
    pub customer_id: i32,
    pub return_no: String,
    pub sales_order_id: Option<i32>,
    pub sales_order_no: Option<String>,
    pub customer_name: Option<String>,
    pub return_date: NaiveDate,
    pub reason: String,
    pub status: String,
    pub total_amount: Decimal,
    pub created_at: DateTime<Utc>,
}

impl From<SalesReturnView> for PortalReturnView {
    fn from(item: SalesReturnView) -> Self {
        Self {
            id: item.id,
            customer_id: item.customer_id,
            return_no: item.return_no,
            sales_order_id: item.sales_order_id,
            sales_order_no: item.sales_order_no,
            customer_name: item.customer_name,
            return_date: item.return_date,
            reason: item.reason,
            status: item.status,
            total_amount: item.total_amount,
            created_at: item.created_at,
        }
    }
}

/// 门户收款白名单：客户自有收款的单号/日期/金额/方式/状态，银行账户与支票号不出门。
#[derive(Debug, Clone, Serialize)]
pub struct PortalPaymentView {
    pub id: i32,
    pub customer_id: i32,
    pub collection_no: String,
    pub collection_date: NaiveDate,
    pub collection_amount: Decimal,
    pub collection_method: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
}

impl From<ar_collection::Model> for PortalPaymentView {
    fn from(item: ar_collection::Model) -> Self {
        Self {
            id: item.id,
            customer_id: item.customer_id,
            collection_no: item.collection_no,
            collection_date: item.collection_date,
            collection_amount: item.collection_amount,
            collection_method: item.collection_method,
            status: item.status,
            created_at: item.created_at,
        }
    }
}

/// 门户对账单白名单：期间与收付款余额业务字段，争议说明/备注/内部确认人不出现。
#[derive(Debug, Clone, Serialize)]
pub struct PortalReconciliationView {
    pub id: i32,
    pub customer_id: i32,
    pub reconciliation_no: String,
    pub period_start: NaiveDate,
    pub period_end: NaiveDate,
    pub opening_balance: Decimal,
    pub total_invoices: Decimal,
    pub total_collections: Decimal,
    pub closing_balance: Decimal,
    pub reconciliation_status: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl From<ar_reconciliation::Model> for PortalReconciliationView {
    fn from(item: ar_reconciliation::Model) -> Self {
        Self {
            id: item.id,
            customer_id: item.customer_id,
            reconciliation_no: item.reconciliation_no,
            period_start: item.period_start,
            period_end: item.period_end,
            opening_balance: item.opening_balance,
            total_invoices: item.total_invoices,
            total_collections: item.total_collections,
            closing_balance: item.closing_balance,
            reconciliation_status: item.reconciliation_status,
            created_at: item.created_at,
        }
    }
}

/// 门户商品白名单：仅商品化档案字段；成本价/标准价/供应商/工厂信息一律不出现。
#[derive(Debug, Clone, Serialize)]
pub struct PortalProductView {
    pub id: i32,
    pub code: String,
    pub name: String,
    pub specification: Option<String>,
    pub unit: String,
    pub product_type: String,
    pub fabric_composition: Option<String>,
    pub yarn_count: Option<String>,
    pub density: Option<String>,
    pub width: Option<Decimal>,
    pub gram_weight: Option<Decimal>,
    pub structure: Option<String>,
    pub finish: Option<String>,
    pub usage: Option<String>,
    pub product_grade: Option<String>,
    pub status: String,
    pub description: Option<String>,
}

impl From<product::Model> for PortalProductView {
    fn from(item: product::Model) -> Self {
        Self {
            id: item.id,
            code: item.code,
            name: item.name,
            specification: item.specification,
            unit: item.unit,
            product_type: item.product_type,
            fabric_composition: item.fabric_composition,
            yarn_count: item.yarn_count,
            density: item.density,
            width: item.width,
            gram_weight: item.gram_weight,
            structure: item.structure,
            finish: item.finish,
            usage: item.usage,
            product_grade: item.product_grade,
            status: item.status,
            description: item.description,
        }
    }
}

/// 门户色卡白名单：色卡号/名称/图片与工艺展示字段，发放记录的内部字段不出门。
#[derive(Debug, Clone, Serialize)]
pub struct PortalColorCardView {
    pub id: i64,
    pub card_no: String,
    pub card_name: String,
    pub card_type: String,
    pub season: Option<String>,
    pub brand: Option<String>,
    pub total_colors: i32,
    pub status: String,
    pub description: Option<String>,
    pub cover_image_url: Option<String>,
    pub dyeing_capability: Option<String>,
    pub printing_capability: Option<String>,
    pub color_fastness_grade: Option<String>,
}

impl From<color_card::Model> for PortalColorCardView {
    fn from(item: color_card::Model) -> Self {
        Self {
            id: item.id,
            card_no: item.card_no,
            card_name: item.card_name,
            card_type: item.card_type,
            season: item.season,
            brand: item.brand,
            total_colors: item.total_colors,
            status: item.status,
            description: item.description,
            cover_image_url: item.cover_image_url,
            dyeing_capability: item.dyeing_capability,
            printing_capability: item.printing_capability,
            color_fastness_grade: item.color_fastness_grade,
        }
    }
}

/// 门户汇总白名单：订单总数与在途数直接数绑定客户的销售订单，应收余额取同集合未收金额和。
/// 不复用内部 dashboard handler（其内部统计含全仓商品数、库存量等非客户视角指标）。
#[derive(Debug, Clone, Serialize)]
pub struct PortalDashboardView {
    pub order_count: u64,
    pub in_transit_count: u64,
    pub receivable_balance: Decimal,
}

/// 门户商品列表查询
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalProductListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub status: Option<String>,
    pub search: Option<String>,
}

/// 门户色卡列表查询
#[derive(Debug, Deserialize, ToSchema)]
pub struct PortalColorCardListQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    pub keyword: Option<String>,
}

/// GET /api/v1/erp/customer-portal/orders - 我的销售订单列表
pub async fn list_portal_orders(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalOrderListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalOrderView>>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let service = SalesService::new(state.db.clone(), state.search_client.clone());
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let orders = service
        .list_orders(
            PageRequest { page, page_size },
            crate::services::so::order_query::SalesOrderFilter {
                status: query.status,
                // 行级门：绑定客户的订单，其余客户（含全量）永不可见
                customer_id: Some(customer.id),
                order_no: query.order_no,
                // 客户账号不提供按客户名搜索的入口
                customer_name: None,
                start_date: query.start_date,
                end_date: query.end_date,
            },
            // 员工行级 scope 不适用客户账号，见模块级注释
            None,
        )
        .await?;
    let items: Vec<PortalOrderView> = orders
        .items
        .into_iter()
        .map(PortalOrderView::from)
        .collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items,
        orders.total,
        page,
        page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/sales-returns - 我的退货单列表
pub async fn list_portal_returns(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalReturnListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalReturnView>>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let service = SalesReturnService::new(state.db.clone());
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let (returns, total) = service
        .list_returns(
            query.return_no,
            query.status,
            // 行级门：绑定客户的退货单
            Some(customer.id),
            page,
            page_size,
            None,
        )
        .await?;
    let items: Vec<PortalReturnView> = returns.into_iter().map(PortalReturnView::from).collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/payments - 我的收款记录列表
///
/// 直接查 ar_collections 实体并逐字段映射门户 DTO：内部 list_payments 返回
/// 全实体 JSON（含 bank_account/check_no/confirmed_by/created_by），不可复用。
pub async fn list_portal_payments(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalPaymentListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalPaymentView>>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let mut select = ar_collection::Entity::find();
    // 行级门：绑定客户的收款记录，请求侧无 customer_id 入参
    select = select.filter(ar_collection::Column::CustomerId.eq(customer.id));
    if let Some(status) = query.status {
        select = select.filter(ar_collection::Column::Status.eq(status));
    }
    if let Some(no) = query.payment_no {
        select = select.filter(ar_collection::Column::CollectionNo.eq(no));
    }
    let paginator = select
        .order_by_desc(ar_collection::Column::CollectionDate)
        .paginate(db.as_ref(), page_size);
    let total = paginator.num_items().await?;
    let models = paginator.fetch_page(page.saturating_sub(1)).await?;
    let items: Vec<PortalPaymentView> = models.into_iter().map(PortalPaymentView::from).collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/reconciliations - 我的应收对账单列表
pub async fn list_portal_reconciliations(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalReconciliationListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalReconciliationView>>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let service = ArReconciliationService::new(state.db.clone());
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let req = crate::services::ar::ReconciliationQuery {
        status: query.status,
        // 行级门：绑定客户的对账单；data_scope=None 的安全性见模块级注释
        customer_id: Some(customer.id),
        page,
        page_size,
        start_date: query.start_date,
        end_date: query.end_date,
    };
    let (models, total) = service.list(req, None).await?;
    let items: Vec<PortalReconciliationView> = models
        .into_iter()
        .map(PortalReconciliationView::from)
        .collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/products - 客户可见的商品化档案
pub async fn list_portal_products(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalProductListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalProductView>>>, AppError> {
    let db = state.db.clone();
    let _customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let mut select = product::Entity::find();
    if let Some(status) = query.status {
        select = select.filter(product::Column::Status.eq(status));
    }
    if let Some(keyword) = query.search {
        let pattern = safe_like_pattern(&keyword);
        select = select.filter(ProductService::build_product_keyword_condition(&pattern));
    }
    let paginator = select
        .order_by(product::Column::Code, sea_orm::Order::Asc)
        .paginate(db.as_ref(), page_size);
    let total = paginator.num_items().await?;
    let models = paginator.fetch_page(page.saturating_sub(1)).await?;
    let items: Vec<PortalProductView> = models.into_iter().map(PortalProductView::from).collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/color-cards - 已发放给绑定客户的色卡
///
/// 只取发放记录状态为 issued 且未删除的色卡主表行；按色卡主表去重，避免同一客户
/// 多张发放记录造成重复行与 total 虚高。
pub async fn list_portal_color_cards(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(query): Query<PortalColorCardListQuery>,
) -> Result<Json<ApiResponse<PaginatedResponse<PortalColorCardView>>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let page = clamp_page(query.page);
    let page_size = clamp_page_size(query.page_size);

    let mut select = color_card::Entity::find()
        .distinct()
        .join(JoinType::InnerJoin, color_card::Relation::Issues.def())
        .filter(color_card_issue::Column::CustomerId.eq(i64::from(customer.id)))
        .filter(color_card_issue::Column::Status.eq(IssueStatus::Issued.as_str()))
        .filter(color_card_issue::Column::IsDeleted.eq(false));
    if let Some(keyword) = query.keyword {
        let pattern = safe_like_pattern(&keyword);
        select = select.filter(color_card::Column::CardName.like(pattern));
    }
    let paginator = select
        .order_by_desc(color_card::Column::CreatedAt)
        .paginate(db.as_ref(), page_size);
    let total = paginator.num_items().await?;
    let models = paginator.fetch_page(page.saturating_sub(1)).await?;
    let items: Vec<PortalColorCardView> =
        models.into_iter().map(PortalColorCardView::from).collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

/// GET /api/v1/erp/customer-portal/sales-orders/{id} - 我的订单详情
///
/// 明细查询同时带 customer_id = 绑定值：非本客户单据（含不存在的 ID）一律 404，
/// 不暴露"该单存在但不属于你"的事实；出参与列表同白名单口径。
pub async fn get_portal_order(
    State(state): State<AppState>,
    auth: AuthContext,
    Path(order_id): Path<i32>,
) -> Result<Json<ApiResponse<PortalOrderView>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let model = sales_order::Entity::find_by_id(order_id)
        .filter(sales_order::Column::CustomerId.eq(customer.id))
        .one(db.as_ref())
        .await?
        .ok_or_else(|| AppError::not_found("订单不存在或不属于当前绑定客户"))?;

    Ok(Json(ApiResponse::success(PortalOrderView::from(model))))
}

/// GET /api/v1/erp/customer-portal/dashboard - 客户视角汇总
///
/// 三个指标共用同一行级门（绑定客户）与同一张 sales_orders 集合：
/// 订单数=该客户全部单据，在途数=状态 partial_shipped/shipped（写入方词表见
/// models/status/sales.rs::sales_order），应收余额=balance_amount 之和。
pub async fn get_portal_dashboard(
    State(state): State<AppState>,
    auth: AuthContext,
) -> Result<Json<ApiResponse<PortalDashboardView>>, AppError> {
    let db = state.db.clone();
    let customer = require_portal_customer(&db, auth.user_id, auth.role_id).await?;
    let owned = sales_order::Entity::find().filter(sales_order::Column::CustomerId.eq(customer.id));

    let order_count = owned.clone().count(db.as_ref()).await?;
    let in_transit_count = owned
        .clone()
        .filter(sales_order::Column::Status.is_in([so_status::PARTIAL_SHIPPED, so_status::SHIPPED]))
        .count(db.as_ref())
        .await?;
    let receivable_balance = owned
        .select_only()
        .column_as(Expr::col(sales_order::Column::BalanceAmount).sum(), "total")
        .into_tuple::<Option<Decimal>>()
        .one(db.as_ref())
        .await?
        .flatten()
        .unwrap_or(Decimal::ZERO);

    Ok(Json(ApiResponse::success(PortalDashboardView {
        order_count,
        in_transit_count,
        receivable_balance,
    })))
}
