//! 撤销 `boms` 与 `mrp` 两枚权限资源的全岗位历史授权（m0133）
//!
//! ## 六要素
//! - **功能**：从 `role_permissions` 删除 `resource_type` 为 `boms` 与 `mrp` 的所有授权行，
//!   撤销这两枚键在**所有岗位**上的历史授予。
//! - **调用方**：SeaORM migrator 链，经 `domain/bom_mrp_permission_withdrawal` 域注册为链尾
//!   新顶层条目。
//! - **入参**：无。删除目标资源名是本文件的编译期常量，无外部输入拼接。
//! - **传给谁**：判权中间件按 URL 段派生 `resource_type:action` 比对 `role_permissions`；
//!   本迁移执行后，`/boms`、`/mrp` 端点对除通配超管外的任何岗位都不再命中授权行（端点本身
//!   是否还存在由代码面下线决定）。
//! - **存什么**：只删 `role_permissions` 的授权行，不改表结构、不改约束、不碰其它资源键。
//! - **存哪里**：PostgreSQL `public.role_permissions`。
//!
//! ## 为什么按资源名删、不按角色硬编码单行
//! `boms:read` 有一枚是 `business` 域 `m0092_grant_boms_read_production_manager` 单独授给
//! 生产经理的；`mrp` 的授权则来自出厂初始化矩阵（`services/init_service_ops/permission.rs`
//! 的生产核心域分组）落到 `role_permissions` 的行，且历史上可能被管理界面再授给别的岗位。
//! 若只按 (角色 × 键) 硬编码删单行，会漏掉非生产经理岗位上这两枚键的既有授予。故按
//! `resource_type IN ('boms','mrp')` 删除，一次性覆盖所有岗位上这两枚键的历史授权。
//!
//! ## 与初始化矩阵的第二写点同源（跨实例依赖）
//! BOM/MRP 下线在授权面有两处同源写点：本迁移删的是**存量库已落库的授权行**；
//! `services/init_service_ops/permission.rs` 矩阵里 `("boms","read")` 与 `("mrp","*")` 两枚
//! 授予项的摘除、以及 `services/init_service.rs` 的 `PERMISSION_RESOURCES` 中 `boms`/`mrp`
//! 资源名登记的摘除，属同批次代码面下线的另一写点（由并发的代码面实例负责，不在本作用域）。
//! 两处必须同源，否则复用库删了行、新装库矩阵又种回来。主编排须确认两处一致。
//! 注：`mrp-history` 是另一枚独立资源键（属缺省占位路由族），不在本次下线范围，不删。
//!
//! ## 幂等
//! up 按资源名删除并以 RAISE NOTICE 外显命中行数；命中 0 行（该库本就无这两枚键，或本迁移已
//! 跑过一次）属正常结果，不静默放过、以 NOTICE 点名。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
DO $$
DECLARE
    hit INTEGER;
BEGIN
    DELETE FROM "role_permissions" WHERE "resource_type" IN ('boms', 'mrp');
    GET DIAGNOSTICS hit = ROW_COUNT;
    RAISE NOTICE 'm_bom_mrp_permission_withdrawal：撤销 boms 与 mrp 两枚资源的全岗位历史授权，role_permissions 命中删除 % 行（0 行=该库本就无这两枚键或已撤过，重跑等价）', hit;
END
$$;
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 回退 = 按出厂初始化矩阵的基线持有人（生产经理）回插这两枚键；冲突目标用真实唯一
        // 索引列集合 (role_id, resource_type, action) 保证重复回退不撞。down 不完全可逆：
        // 只回基线授予，历史上由管理界面再授给其它岗位的这两枚键行无法从本迁移恢复。
        let sql = r#"
DO $$
DECLARE
    hit INTEGER;
BEGIN
    INSERT INTO "role_permissions" ("role_id", "resource_type", "action", "allowed", "created_at", "updated_at")
    SELECT r."id", k.rt, k.act, true, NOW(), NOW()
      FROM "roles" r
     CROSS JOIN (VALUES ('boms', 'read'), ('mrp', '*')) AS k(rt, act)
     WHERE r."code" = 'production_manager'
    ON CONFLICT ("role_id", "resource_type", "action") DO NOTHING;
    GET DIAGNOSTICS hit = ROW_COUNT;
    RAISE NOTICE 'm_bom_mrp_permission_withdrawal down：向 production_manager 回插 boms:read 与 mrp:* 两枚基线授权，实际写入 % 行（0 行=已存在，重复回退等价）', hit;
END
$$;
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
