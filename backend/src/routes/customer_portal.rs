//! 小程序客户门户路由（客户可见读面）。
//!
//! 4 端点（全部 GET，权限键 `customer-portal:read`，行级门 = 账号绑定客户档案）：
//! - GET /orders          我的销售订单列表
//! - GET /sales-returns   我的退货单列表
//! - GET /payments        我的收款记录列表
//! - GET /reconciliations 我的应收对账单列表
//!
//! 该前缀刻意不进 `path_utils` 的模块前缀表：`customer-portal` 保持叶子资源段，
//! 权限键稳定派生为 `customer-portal:read`，不与内部 `sales:*` / `ar:*` 码互串。

use axum::{Router, routing::get};

use crate::container::AppState;
use crate::handlers::customer_portal;

/// 客户门户路由（nest 到 /api/v1/erp/customer-portal）
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/orders", get(customer_portal::list_portal_orders))
        .route("/sales-returns", get(customer_portal::list_portal_returns))
        .route("/payments", get(customer_portal::list_portal_payments))
        .route(
            "/reconciliations",
            get(customer_portal::list_portal_reconciliations),
        )
}
