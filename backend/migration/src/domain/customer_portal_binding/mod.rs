//! 小程序客户门户的用户↔客户档案显式绑定列（users.customer_id）。
//!
//! ## 六要素
//! - 功能：给 users 增加可空列 customer_id INT NULL，把客户外部账号（customer 角色）与其在
//!   CRM 客户档案里的归属实体显式绑定。该绑定是客户门户读端点（/customer-portal/*）唯一的
//!   数据范围依据：门户端点一律按绑定值过滤，未绑定/绑定失效的客户账号一律 403，不存在
//!   "不传 customer_id 即全量"的旁路。
//! - 调用方：SeaORM migrator 链，注册在 domain/customer_portal_binding 独立域、
//!   migration/src/lib.rs 链尾新顶层条目（排在 scheduler_observability 之后）。
//!   列的读写面：管理员用户管理写口（user_handler create/update → user_service）维护该列；
//!   services/customer_portal_service 按 AuthContext.user_id 回读该列，不信任请求侧客户 ID。
//! - 入参：无（纯 DDL，不读取应用数据、不回填任何存量行）。
//! - 传给谁：写入口为管理员用户管理（require_admin_role 门内）；读入口为门户端点行级过滤。
//! - 存什么：新列本体与列注释；information_schema 里该列的存在性即本域的完成标志。
//! - 存哪里：PostgreSQL public.users.customer_id。
//!
//! ## 为什么必须新增顶层域
//! 加列打进已应用域（如 iam 相关建表域）在复用库上会因域台账已记账被整体跳过；
//! ADD COLUMN IF NOT EXISTS 打在已存在的列上还是静默 no-op。链尾新域名在复用库上
//! 属 pending，必然执行（与 customer_credit_remark_column 域的注册理由同型）。
//!
//! ## 语义与幂等
//! - up 先查 information_schema 再决定加列，两条路径都打印：新增成功 与 列已存在（幂等重放），
//!   并打印新列上非 NULL 的行数（本域新建时恒为 0，用来证明本域没有替存量造值）。
//! - 不建外键：客户档案删除/合并不应被账号绑定行阻塞，绑定失效由门户端点在读取时
//!   校验 customers 行存在性并 fail-closed 403（不猜、不静默回落全量）。
//! - 整支可重放：重跑走列已存在分支，不再执行 DDL。
//!
//! ## 回退
//! down 删除本列（DROP COLUMN IF EXISTS）并打印删除前后该列上非 NULL 的行数：绑定是管理员
//! 显式录入的归属关系，删列即丢弃这些绑定，这是回退掉一次加列的固有后果，因此在删除前把
//! 受影响行数点名，不静默吞掉。列之外的任何东西（用户、角色、客户档案）都不触碰。

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_customer_portal_binding"
    }
}

/// 加列（先查 information_schema 判定是否已存在，两条路径都打印，不静默 no-op）
const ADD_CUSTOMER_ID_COLUMN_SQL: &str = r#"
DO $$
DECLARE
    existed_before INTEGER;
    filled_rows    INTEGER;
BEGIN
    SELECT COUNT(*) INTO existed_before
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'users'
       AND column_name = 'customer_id';

    IF existed_before = 0 THEN
        ALTER TABLE "users" ADD COLUMN "customer_id" INT NULL;
        COMMENT ON COLUMN "users"."customer_id" IS '客户门户归属：绑定的 customers.id（NULL=未绑定，客户门户端点拒访）';
        RAISE NOTICE 'customer_portal_binding: users.customer_id 列已新增';
    ELSE
        RAISE NOTICE 'customer_portal_binding: users.customer_id 列已存在（幂等重放）';
    END IF;

    SELECT COUNT(*) INTO filled_rows FROM "users" WHERE "customer_id" IS NOT NULL;
    RAISE NOTICE 'customer_portal_binding: users.customer_id 非 NULL 行数=%（本域不回填存量）', filled_rows;
END $$;
"#;

/// 降列（删除前点名受影响行数，不静默吞掉绑定值）
const DROP_CUSTOMER_ID_COLUMN_SQL: &str = r#"
DO $$
DECLARE
    filled_rows INTEGER;
BEGIN
    SELECT COUNT(*) INTO filled_rows FROM "users" WHERE "customer_id" IS NOT NULL;
    RAISE NOTICE 'customer_portal_binding down: 即将丢弃 users.customer_id 非 NULL 绑定行数=%', filled_rows;
    ALTER TABLE "users" DROP COLUMN IF EXISTS "customer_id";
END $$;
"#;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(ADD_CUSTOMER_ID_COLUMN_SQL)
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(DROP_CUSTOMER_ID_COLUMN_SQL)
            .await?;
        Ok(())
    }
}
