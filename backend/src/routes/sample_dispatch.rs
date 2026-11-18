//! 调样单路由（path 资源 /sample-dispatches）
//!
//! 相对路径注册（绝对前缀由 routes/mod.rs nest 一次）；权限键由 URL 段推导
//! （seg3 = sample-dispatches），`print-xlsx` 末段经 PATH_ACTION_SEGMENT_MAP
//! 映射为 `print` 动作。handlers/ 下不设 `pub fn router()`。

use axum::{routing::get, Router};

use crate::container::AppState;
use crate::handlers::{print_xlsx_sample_dispatch_handler, sample_dispatch_handler};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/sample-dispatches",
            get(sample_dispatch_handler::list_sample_dispatches)
                .post(sample_dispatch_handler::create_sample_dispatch),
        )
        .route(
            "/sample-dispatches/{id}",
            get(sample_dispatch_handler::get_sample_dispatch)
                .put(sample_dispatch_handler::update_sample_dispatch)
                .delete(sample_dispatch_handler::delete_sample_dispatch),
        )
        .route(
            "/sample-dispatches/{id}/print-xlsx",
            get(print_xlsx_sample_dispatch_handler::sample_dispatch_print_xlsx),
        )
}
