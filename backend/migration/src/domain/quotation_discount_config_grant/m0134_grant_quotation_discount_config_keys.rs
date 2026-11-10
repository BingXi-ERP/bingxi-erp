//! 报价超折扣阈值配置面补授 `quotation-discount-config` 键（存量库通道）
//!
//! ## 六要素
//! - **功能**：给 `role_permissions` 补 `(目标角色码 × quotation-discount-config × read/update)`
//!   行，让非超管岗位能读阈值（明细行折扣标记的真值来源）、管理岗能改阈值。
//! - **调用方**：顶层域 quotation_discount_config_grant（台账名 m_quotation_discount_config_grant）
//!   的链尾聚合迁移调用；roles/role_permissions 由 system 域先建，早于本域。立为顶层域而不并入
//!   任何已应用域：已应用域在复用库上台账已记账、整域跳过，嵌入其中的补授在存量库永远不执行。
//! - **入参**：无。角色码、资源键与动作码都是本文件的编译期常量，无外部输入拼接。
//! - **传给谁**：`SchemaManager` 的裸 SQL 连接。运行期判权键由
//!   `backend/src/middleware/permission.rs::extract_resource_info` 从
//!   `GET|PUT /api/v1/erp/quotations/discount-config` 取模块前缀下的第四段 `discount-config`，
//!   经 `utils/path_utils.rs::RESOURCE_NAME_MAP` 消歧为权威资源名 `quotation-discount-config`，
//!   动作按方法派生（GET→read、PUT→update），合成键 `quotation-discount-config:read` 与
//!   `:update`。
//! - **存什么**：只写 `role_permissions` 的 (role_id × 'quotation-discount-config' × 动作) 行。
//! - **存哪里**：PostgreSQL `public.role_permissions`。
//!
//! ## 受授集合取值依据
//! - read 授 `sales_rep` / `sales_manager` / `gm` / `system_admin`：报价明细行要显示「本行折扣
//!   是否超阈」，阈值是业务员提交前与经理审批时必须看到的规则值；建单岗（sales_rep）与审批岗
//!   （sales_manager、总经理）都是读取方。
//! - update 只授 `gm` 与 `system_admin`：阈值决定「多少折扣要经主管审批」，属管理侧政策参数，
//!   给建单或审批的执行岗写权等于让他们自行放宽约束自己的门。
//! 三通道逐字符同源：通道① 矩阵授予在 `init_service_ops/permission.rs` 的高管/销售/系统分组，
//! 通道② 资源名登记在 `init_service.rs::PERMISSION_RESOURCES`，通道③ 即本域存量库补授。
//!
//! ## 幂等与安全
//! `NOT EXISTS` 守卫使重跑等价；命中 0 个角色时以 NOTICE 报出而不静默通过
//! （新装库里迁移早于系统初始化建角色属合法时序）。down 只按本迁移的角色码与键配对回收，
//! 不动人工另行授予的其它权限。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

/// 阈值读取岗（与 init 矩阵分组同码）
const READ_ROLE_CODES: &[&str] = &["sales_rep", "sales_manager", "gm", "system_admin"];

/// 阈值写入岗（管理侧政策参数，建单岗与执行审批岗不授）
const UPDATE_ROLE_CODES: &[&str] = &["gm", "system_admin"];

/// 资源键（与 PERMISSION_RESOURCES 登记的权威名逐字符一致）
const RESOURCE: &str = "quotation-discount-config";

/// 把角色码写成 SQL 数组字面量（全部为本文件编译期常量，无外部输入拼接）
fn sql_array(codes: &[&str]) -> String {
    let items: Vec<String> = codes.iter().map(|c| format!("'{c}'")).collect();
    format!("ARRAY[{}]::text[]", items.join(", "))
}

/// 生成一对（角色码集合 × 动作）的幂等授予语句
fn grant_sql(codes: &[&str], action: &str) -> String {
    let arr = sql_array(codes);
    format!(
        r#"INSERT INTO "role_permissions" ("role_id", "resource_type", "action", "allowed", "created_at", "updated_at")
SELECT r."id", '{RESOURCE}', '{action}', true, NOW(), NOW()
  FROM "roles" r
 WHERE r."code" = ANY({arr})
   AND NOT EXISTS (
        SELECT 1 FROM "role_permissions" x
         WHERE x."role_id" = r."id" AND x."resource_type" = '{RESOURCE}' AND x."action" = '{action}'
   );"#,
        arr = arr,
    )
}

/// 生成一对（角色码集合 × 动作）的回收语句
fn revoke_sql(codes: &[&str], action: &str) -> String {
    let arr = sql_array(codes);
    format!(
        r#"DELETE FROM "role_permissions" rp
 USING "roles" r
 WHERE r."id" = rp."role_id"
   AND rp."resource_type" = '{RESOURCE}'
   AND rp."action" = '{action}'
   AND r."code" = ANY({arr});"#,
        arr = arr,
    )
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let read_arr = sql_array(READ_ROLE_CODES);
        let update_arr = sql_array(UPDATE_ROLE_CODES);
        let sql = format!(
            r#"
DO $$
DECLARE
    hit INTEGER;
    miss TEXT;
BEGIN
    SELECT COUNT(*) INTO hit FROM "roles" WHERE "code" = ANY({read_arr});
    SELECT string_agg(t, ', ' ORDER BY t)
      INTO miss
      FROM (
        SELECT a AS t FROM unnest({read_arr}) a
         WHERE NOT EXISTS (SELECT 1 FROM "roles" r WHERE r."code" = a)
      ) m;
    IF hit = 0 THEN
        RAISE NOTICE 'm0134：quotation-discount-config:read 的目标受授角色在当前库中一个都不存在，本次未授予任何权限。若是迁移早于系统初始化建角色的新装库属正常时序（init 角色矩阵按同口径授予），否则请核对 roles.code 是否被改名。';
    ELSE
        RAISE NOTICE 'm0134：quotation-discount-config:read 授予命中 % 个角色；当前库不存在的角色码：%（自动跳过）', hit, COALESCE(miss, '无');
    END IF;

    SELECT COUNT(*) INTO hit FROM "roles" WHERE "code" = ANY({update_arr});
    IF hit = 0 THEN
        RAISE NOTICE 'm0134：quotation-discount-config:update 的目标受授角色在当前库中一个都不存在，阈值写入面对非超管不可用，请核对初始化角色是否落齐。';
    ELSE
        RAISE NOTICE 'm0134：quotation-discount-config:update 授予命中 % 个角色', hit;
    END IF;
END
$$;

{read_grant}

{update_grant}
"#,
            read_arr = read_arr,
            update_arr = update_arr,
            read_grant = grant_sql(READ_ROLE_CODES, "read"),
            update_grant = grant_sql(UPDATE_ROLE_CODES, "update"),
        );
        manager.get_connection().execute_unprepared(&sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = format!(
            r#"
-- 只回收本迁移按角色码授予的 quotation-discount-config 行；人工另授的其它键不动。
{read_revoke}

{update_revoke}
"#,
            read_revoke = revoke_sql(READ_ROLE_CODES, "read"),
            update_revoke = revoke_sql(UPDATE_ROLE_CODES, "update"),
        );
        manager.get_connection().execute_unprepared(&sql).await?;
        Ok(())
    }
}
