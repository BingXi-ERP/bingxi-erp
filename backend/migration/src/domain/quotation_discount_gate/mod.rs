//! 报价超折扣审批门的数据地基域。
//!
//! ## 用途
//! 「超折扣报价必须主管审批」这条业务门需要两份持久化形态：可配置的折扣阈值，
//! 以及「谁提交了这张单」的记录（供审批腿判自审）。二者都在本域一次落齐。
//!
//! ## 语义与幂等
//! - `quotation_discount_approval_configs`：单行阈值配置表（id 恒 1 + CHECK 钉死），
//!   建表即播种默认阈值；播种语句是 `ON CONFLICT DO NOTHING`，重跑只补「行缺席」，
//!   绝不把管理员已改过的阈值打回默认。阈值取值域 0 到 100 由 CHECK 钉住。
//! - `sales_quotations.submitted_by`：可空列，只在新建表时不存在才加，重跑等价；
//!   **不回填**历史行——历史提交人是未被记录的事实，域内绝不 UPDATE 造值。
//!
//! ## 注册位置
//! 新建顶层域并置于链尾，而不并入 sales_crm / production / v15 等已应用域：已应用域在
//! 复用库上台账已记账、整域跳过，嵌在其中的建表与加列在存量库永远不执行。
//! 依赖 sales_crm 建的 sales_quotations 与 system 建的 users，二者均早于本域。
//! 本域只落形态，判定与读写全在业务代码侧（services/quotation_discount_service.rs）。

use sea_orm_migration::prelude::*;

mod m0129_add_quotation_discount_gate_config;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_quotation_discount_gate"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0129_add_quotation_discount_gate_config::Migration
            .up(manager)
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0129_add_quotation_discount_gate_config::Migration
            .down(manager)
            .await?;
        Ok(())
    }
}
