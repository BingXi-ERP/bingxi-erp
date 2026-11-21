//! 小程序客户门户读面服务。
//!
//! ## 六要素
//! - **功能**：解析登录账号与 CRM 客户档案的显式绑定（users.customer_id，见迁移
//!   m_customer_portal_binding），为 /customer-portal/* 读端点提供唯一的数据范围依据。
//! - **调用方**：handlers/customer_portal 的四个列表端点。
//! - **入参**：数据库连接与当前用户 ID（来自 AuthContext）。
//! - **传给谁**：返回绑定的 customers::Model（含客户名），供门户端点做归属过滤与展示。
//! - **存什么**：不写库，只读 users.customer_id 与 customers 行存在性。
//! - **存哪里**：PostgreSQL public.users / public.customers。
//!
//! ## fail-closed 语义（本模块唯一判据）
//! 绑定缺失（customer_id 为 NULL）与绑定失效（指向的 customers 行不存在）一律
//! `permission_denied` 403，绝不静默回落成"不过滤"。门户端点的行级过滤完全依赖
//! 本函数的返回值：拿不到绑定就拿不到数据，不存在"无绑定即全量"的旁路。

use sea_orm::{DatabaseConnection, EntityTrait};

use crate::models::customer;
use crate::utils::error::AppError;

/// 解析当前账号绑定的客户档案；未绑定/绑定失效一律 403，不回落全量。
pub async fn require_portal_customer(
    db: &DatabaseConnection,
    user_id: i32,
) -> Result<customer::Model, AppError> {
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
