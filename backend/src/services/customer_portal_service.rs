//! 小程序客户门户读面服务。
//!
//! ## 六要素
//! - **功能**：解析登录账号与 CRM 客户档案的显式绑定（users.customer_id，见迁移
//!   m_customer_portal_binding），为 /customer-portal/* 读端点提供唯一的数据范围依据。
//! - **调用方**：handlers/customer_portal 的八个列表/详情/汇总端点。
//! - **入参**：数据库连接、当前用户 ID 与角色 ID（来自 AuthContext）。
//! - **传给谁**：返回绑定的 customers::Model（含客户名），供门户端点做归属过滤与展示。
//! - **存什么**：不写库，只读 users.customer_id、roles.code 与 customers 行存在性。
//! - **存哪里**：PostgreSQL public.users / public.roles / public.customers。
//!
//! ## 角色硬门（不依赖权限码种子）
//! 门户 GET 走 `is_customer_portal_read_path` 的精确认证豁免，不经 RBAC；
//! 因此本函数必须显式确认 `role.code == "customer"`，否则任意持有效会话的员工
//! 都能命中门户。角色解析失败、未分配角色、非 customer 一律 403（fail-closed）。
//!
//! ## fail-closed 语义（本模块唯一判据）
//! 绑定缺失（customer_id 为 NULL）与绑定失效（指向的 customers 行不存在）一律
//! `permission_denied` 403，绝不静默回落成"不过滤"。门户端点的行级过滤完全依赖
//! 本函数的返回值：拿不到绑定就拿不到数据，不存在"无绑定即全量"的旁路。

use sea_orm::{DatabaseConnection, EntityTrait};

use crate::models::customer;
use crate::utils::admin_checker::get_role_code;
use crate::utils::error::AppError;

/// 解析当前账号绑定的客户档案；未绑定/绑定失效一律 403，不回落全量。
pub async fn require_portal_customer(
    db: &DatabaseConnection,
    user_id: i32,
    role_id: Option<i32>,
) -> Result<customer::Model, AppError> {
    let role_id =
        role_id.ok_or_else(|| AppError::permission_denied("客户门户仅向 customer 角色开放"))?;
    let role_code = get_role_code(db, role_id)
        .await
        .filter(|code| code.as_str() == "customer")
        .ok_or_else(|| AppError::permission_denied("客户门户仅向 customer 角色开放"))?;
    tracing::debug!(
        "客户门户角色门通过: user_id={}, role_code={}",
        user_id,
        role_code
    );
    let user = crate::models::user::Entity::find_by_id(user_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::not_found(format!("用户 ID {} 不存在", user_id)))?;
    let customer_id = user
        .customer_id
        .ok_or_else(|| AppError::permission_denied("该账号未绑定客户档案，无法访问客户门户数据"))?;
    // 迁移列无外键，客户档案删除不被绑定行阻塞；此处把悬空绑定显式判 403，不猜不回落
    customer::Entity::find_by_id(customer_id)
        .one(db)
        .await?
        .ok_or_else(|| AppError::permission_denied("绑定的客户档案已失效，请联系管理员重新绑定"))
}
