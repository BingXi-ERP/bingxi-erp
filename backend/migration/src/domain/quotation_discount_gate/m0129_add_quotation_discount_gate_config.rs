//! 报价超折扣审批门数据地基（m0129）
//!
//! ## 六要素
//! - **功能**：为「超折扣报价必须主管审批」这条业务门落两份形态——
//!   ① 单行阈值配置表 `quotation_discount_approval_configs`（id 恒 1，列
//!   `over_discount_threshold_pct` 存「折扣率百分比阈值」，建表即播种默认行）；
//!   ② `sales_quotations.submitted_by` 可空列，存「最近一次把单据推进审批流的操作人」，
//!   是审批服务判定「审批人不得审批自己提交的单」的唯一可靠判据（与
//!   `bad_debt_writeoff.applicant_user_id` 承载同一语义的先例一致）。
//! - **调用方**：`sea_orm_migration` 迁移链尾新顶层域 quotation_discount_gate；
//!   sales_quotations 由 sales_crm 域建表、users 由 system 域建表，均早于本域。
//! - **入参**：无外部输入，全部是本文件的编译期字面量。
//! - **传给谁**：`SchemaManager` 的裸 SQL 连接。读侧消费方是
//!   `services/quotation_discount_service.rs`（提交腿取阈值算折扣）与
//!   `services/quotation_approval_service.rs`（审批腿比提交人）；写侧消费方是
//!   `handlers/quotation_handler.rs` 的阈值读写端点与提交腿写 submitted_by。
//! - **存什么**：配置表存阈值百分比与更新时间；主表新增列存提交人 user_id。
//!   阈值默认值 10.00 只在**建表播种**时落一次，之后由配置端点维护，代码侧不再持有常量。
//! - **存哪里**：PostgreSQL `public.quotation_discount_approval_configs`（单行）与
//!   `public.sales_quotations.submitted_by`。
//!
//! ## 为什么另立独立顶层域
//! 并入已应用域（sales_crm / production / v15）会在复用库上因台账已记账而被整域跳过，
//! 建表与加列在存量库永不落地。链尾新域在复用库属 pending，必然执行。
//!
//! ## 幂等与数据保护
//! - 建表、播种、加列全部 IF NOT EXISTS / ON CONFLICT DO NOTHING 形态，重跑等价；
//!   播种只补「行缺席」这一种形态，绝不覆盖已配置值（重跑把管理员改过的阈值打回默认
//!   等于静默改配置）。
//! - `submitted_by` 加列后**不回填**：历史行的提交人是未被记录过的事实，迁移内绝不
//!   UPDATE 造值（照抄 created_by 当提交人是伪造审计事实）。历史行保持 NULL，
//!   读侧把 NULL 当「无提交人记录」如实处理。
//! - 列型对齐：新列 BIGINT 与同表既有 `approved_by BIGINT REFERENCES users("id")` 同型，
//!   实体侧一律映射 i64；阈值列 DECIMAL(5,2) 与仓内其余百分比阈值列同型
//!   （material_shortage_threshold_configs 的三枚阈值即该型），取值域 0 到 100 由
//!   CHECK 钉住，防止配置端点写入越界值后判定式失真。
//! - down 只撤本域新建的表与列（DROP IF EXISTS），不触碰任何业务数据行。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS "quotation_discount_approval_configs" (
    "id" BIGINT PRIMARY KEY DEFAULT 1,
    -- 超折扣阈值（百分比）：报价行折扣率严格大于此值即「超折扣」，整单必须走主管审批
    "over_discount_threshold_pct" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "chk_qdac_config_id_fixed" CHECK ("id" = 1),
    CONSTRAINT "chk_qdac_threshold_pct_range" CHECK (
        "over_discount_threshold_pct" >= 0 AND "over_discount_threshold_pct" <= 100
    )
);

INSERT INTO "quotation_discount_approval_configs" (
    "id", "over_discount_threshold_pct", "updated_at"
) VALUES (1, 10.00, NOW())
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "sales_quotations"
    ADD COLUMN IF NOT EXISTS "submitted_by" BIGINT REFERENCES "users"("id");

COMMENT ON TABLE "quotation_discount_approval_configs" IS
    '报价超折扣审批阈值配置表（单行配置，id 恒 1，由 GET/PUT /quotations/discount-config 维护）';
COMMENT ON COLUMN "quotation_discount_approval_configs"."over_discount_threshold_pct" IS
    '超折扣阈值百分比：行折扣率 (基准价 - 成交单价) / 基准价 * 100 严格大于此值即需主管审批；默认 10.00';
COMMENT ON COLUMN "sales_quotations"."submitted_by" IS
    '最近一次提交进入审批流的操作人 user_id（自审拦截判据）；NULL = 本列上线前的历史行，提交人未被记录';
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
ALTER TABLE "sales_quotations" DROP COLUMN IF EXISTS "submitted_by";
DROP TABLE IF EXISTS "quotation_discount_approval_configs";
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
