//! 小程序客户门户路由（客户可见读面）。
//!
//! 10 个端点（全部 GET；设计口径路径 + 兼容别名；行级门 = 账号绑定客户档案）：
//! - GET /orders                  我的销售订单列表
//! - GET /sales-orders            我的销售订单列表（设计口径别名）
//! - GET /sales-orders/{id}       我的订单详情（非本客户 404）
//! - GET /sales-returns           我的退货单列表
//! - GET /payments                我的收款记录列表
//! - GET /reconciliations         我的应收对账单列表
//! - GET /ar-reconciliations      我的应收对账单列表（设计口径别名）
//! - GET /products                客户可见商品档案
//! - GET /color-cards             已发放给绑定客户的色卡
//! - GET /dashboard               客户视角订单数与应收汇总
//!
//! 权限边界：这十条 GET 由 `is_customer_portal_read_path` 精确豁免 RBAC；
//! 每个 handler 都必须经 `require_portal_customer` 校验 `role.code == "customer"`
//! 与 `users.customer_id` 绑定。任何写方法都不在豁免清单内。

use axum::{Router, routing::get};

use crate::container::AppState;
use crate::handlers::customer_portal;

/// 客户门户路由（nest 到 /api/v1/erp/customer-portal）
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/orders", get(customer_portal::list_portal_orders))
        .route("/sales-orders", get(customer_portal::list_portal_orders))
        .route("/sales-orders/{id}", get(customer_portal::get_portal_order))
        .route("/sales-returns", get(customer_portal::list_portal_returns))
        .route("/payments", get(customer_portal::list_portal_payments))
        .route(
            "/reconciliations",
            get(customer_portal::list_portal_reconciliations),
        )
        .route(
            "/ar-reconciliations",
            get(customer_portal::list_portal_reconciliations),
        )
        .route("/products", get(customer_portal::list_portal_products))
        .route(
            "/color-cards",
            get(customer_portal::list_portal_color_cards),
        )
        .route("/dashboard", get(customer_portal::get_portal_dashboard))
}
