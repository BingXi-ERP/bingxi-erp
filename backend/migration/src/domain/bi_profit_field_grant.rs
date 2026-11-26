//! BI 利润字段读权限的存量库通道。
//!
//! 主管、财务与数据分析岗默认读取成本、利润和毛利率；其他角色必须显式授予字段读权限。
//! 独立顶层域保证已应用旧域的复用库也会执行本补授。回滚只回收本迁移实际插入的授权行，
//! 不删除迁移前已存在或后续人工建立的同键配置。
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
CREATE TABLE IF NOT EXISTS "bi_profit_field_grant_records" (
    "field_permission_id" INTEGER,
    "role_permission_id" INTEGER,
    CONSTRAINT "ck_bi_profit_field_grant_record_target"
        CHECK ((field_permission_id IS NOT NULL)::integer + (role_permission_id IS NOT NULL)::integer = 1),
    CONSTRAINT "fk_bi_profit_field_grant_field_permission"
        FOREIGN KEY ("field_permission_id") REFERENCES "field_permissions" ("id") ON DELETE CASCADE,
    CONSTRAINT "fk_bi_profit_field_grant_role_permission"
        FOREIGN KEY ("role_permission_id") REFERENCES "role_permissions" ("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_bi_profit_field_grant_field_permission"
    ON "bi_profit_field_grant_records" ("field_permission_id")
    WHERE "field_permission_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bi_profit_field_grant_role_permission"
    ON "bi_profit_field_grant_records" ("role_permission_id")
    WHERE "role_permission_id" IS NOT NULL;

DO $$
DECLARE
    hit INTEGER;
BEGIN
    SELECT COUNT(*) INTO hit
      FROM roles
     WHERE code IN ('gm', 'deputy_gm', 'manager', 'sales_manager', 'sales_director',
                    'finance_manager', 'accountant', 'data_analyst');
    IF hit = 0 THEN
        RAISE NOTICE 'BI 利润字段默认授权未命中角色；新装库由初始化链在建角色后同口径补授';
    ELSE
        RAISE NOTICE 'BI 利润字段默认授权命中 % 个角色', hit;
    END IF;
END
$$;

WITH inserted AS (
    INSERT INTO field_permissions
        (role_id, resource_type, field_name, can_read, can_write, mask_strategy, is_enabled)
    SELECT r.id, 'bi-analysis', f.field_name, TRUE, FALSE, 'NONE', TRUE
    FROM roles r
    CROSS JOIN (
        VALUES ('total_cost'), ('total_profit'), ('gross_margin')
    ) AS f(field_name)
    WHERE r.code IN ('gm', 'deputy_gm', 'manager', 'sales_manager', 'sales_director',
                     'finance_manager', 'accountant', 'data_analyst')
      AND NOT EXISTS (
          SELECT 1 FROM field_permissions fp
           WHERE fp.role_id = r.id
             AND fp.resource_type = 'bi-analysis'
             AND fp.field_name = f.field_name
      )
    RETURNING id
)
INSERT INTO bi_profit_field_grant_records (field_permission_id, role_permission_id)
SELECT id, NULL FROM inserted
WHERE NOT EXISTS (
    SELECT 1 FROM bi_profit_field_grant_records existing
     WHERE existing.field_permission_id = inserted.id
);

WITH inserted AS (
    INSERT INTO role_permissions
        (role_id, resource_type, resource_id, action, allowed, created_at, updated_at)
    SELECT r.id, 'bi-analysis', NULL, 'read', TRUE, NOW(), NOW()
    FROM roles r
    WHERE r.code IN ('gm', 'deputy_gm', 'manager', 'sales_manager', 'sales_director',
                     'finance_manager', 'accountant', 'data_analyst')
      AND NOT EXISTS (
          SELECT 1 FROM role_permissions rp
           WHERE rp.role_id = r.id
             AND rp.resource_type = 'bi-analysis'
             AND rp.resource_id IS NULL
             AND rp.action = 'read'
      )
    RETURNING id
)
INSERT INTO bi_profit_field_grant_records (field_permission_id, role_permission_id)
SELECT NULL, id FROM inserted
WHERE NOT EXISTS (
    SELECT 1 FROM bi_profit_field_grant_records existing
     WHERE existing.role_permission_id = inserted.id
);
"#,
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
DELETE FROM field_permissions
 WHERE id IN (
     SELECT field_permission_id FROM bi_profit_field_grant_records
      WHERE field_permission_id IS NOT NULL
 );

DELETE FROM role_permissions
 WHERE id IN (
     SELECT role_permission_id FROM bi_profit_field_grant_records
      WHERE role_permission_id IS NOT NULL
 );

DROP TABLE "bi_profit_field_grant_records";
"#,
            )
            .await?;
        Ok(())
    }
}
