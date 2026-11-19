//! 静态锁：登出腿必须归类为"仅认证"豁免（AUTH_ONLY_PATHS），不得降级为匿名公开或回归 RBAC 权限码校验。
//!
//! 功能：锁死 `is_auth_only_path("/api/v1/erp/auth/logout")` 的判定结果，
//!       防止清单漂移后非特权角色登出重新 403（登出是自服务身份端点，
//!       handler 只吊销调用者自己的 token，任何已登录用户都必须可登出）。
//! 调用方：CI 的 Rust 集成测试任务（静态锁，不连库、不起服务）。
//! 入参：运行时豁免表 `AUTH_ONLY_PATHS` / `PUBLIC_PATHS` 的当前内容（生产常量，
//!       不复制名单副本，与 route whitelist 全量覆盖锁同源）。
//! 传给谁：判定全部走生产谓词 `is_auth_only_path` / `is_public_path` /
//!       `is_known_resource_segment`，测试不复制任何判定逻辑。
//! 存什么：不写任何数据，纯读。
//! 存哪里：不适用（无落库）。

use bingxi_backend::middleware::public_routes::{
    AUTH_ONLY_PATHS, is_auth_only_path, is_public_path,
};
use bingxi_backend::utils::path_utils::is_known_resource_segment;

const LOGOUT_PATH: &str = "/api/v1/erp/auth/logout";

#[test]
fn logout_is_auth_only() {
    // 判定器自证有检测力：反向探针确认清单非空、谓词会拒绝未登记路径。
    assert!(
        !AUTH_ONLY_PATHS.is_empty(),
        "AUTH_ONLY_PATHS 为空：豁免表被清空，本锁的判定通道失效"
    );
    assert!(
        !is_auth_only_path("/api/v1/erp/zzz-not-registered"),
        "auth-only 谓词对未登记路径返回了放行，判据已失效"
    );

    assert!(
        is_auth_only_path(LOGOUT_PATH),
        "登出腿必须登记在 AUTH_ONLY_PATHS：缺登记会让权限中间件按 URL 段派生 auth:logout 权限码，非特权角色登出必 403"
    );

    // 带查询串与尾斜杠之外的形态仍按精确匹配生效（与 is_auth_only_path 的清洗规则一致）。
    assert!(
        is_auth_only_path(&format!("{LOGOUT_PATH}?trace=1")),
        "登出腿带查询串时应仍命中 auth-only 精确匹配"
    );
}

#[test]
fn logout_stays_authenticated_not_public() {
    // 登出仍须持有有效 JWT：不得被降级进 PUBLIC_PATHS（匿名公开会允许未认证请求触发 token 吊销链路）。
    assert!(
        !is_public_path(LOGOUT_PATH),
        "登出腿不得进入匿名公开清单：登出必须携带有效 JWT，未认证请求不该触达 token 吊销链路"
    );
}

#[test]
fn auth_segment_stays_registered_for_whitelist_locks() {
    // route whitelist 全量覆盖锁按资源段豁免（PUBLIC ∪ AUTH_ONLY 的首段），
    // 登出腿加入 AUTH_ONLY 后 auth 段必须仍在生产资源段注册表中，
    // 否则豁免集与快照对照关系被本笔改动破坏。
    assert!(
        is_known_resource_segment("auth"),
        "auth 资源段未在生产资源段注册表中：登记登出腿会破坏 route whitelist 契约锁的豁免对照"
    );
}
