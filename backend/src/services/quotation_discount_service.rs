//! 报价超折扣审批门服务（折扣侧单点）
//!
//! - **功能**：承载「超折扣报价必须主管审批后才能下发客户」这条时序约束的两半——
//!   ① 从单行配置表 `quotation_discount_approval_configs` 取「超折扣阈值百分比」，
//!   配置行缺席时 fail-closed 显式拒绝（不取任何默认值，代码侧不持有阈值常量）；
//!   ② 按报价单聚合行折扣率并与阈值做严格大于比较，产出可供状态跃迁门消费的判定值。
//!   折扣口径取 `sales_quotation_items.discount_rate`（百分点，与阈值同刻度可直接比较）；
//!   该口径由建单腿 `quotation_ops/crud.rs`、改单腿 `quotation_ops/update.rs` 的
//!   `quantity * unit_price * r / 100` 折让额表达式，以及转单腿把本列原样写入
//!   `sales_order_items.discount_percent` 三处共同钉住。行折扣率为 NULL 按 0 计
//!   （列 DEFAULT 0，语义「该行未记录折让」），判定值与阈值一并进日志，不留静默。
//! - **调用方**：`services/quotation_approval_service.rs` 的提交腿与自批腿（判定是否
//!   必须走主管审批）；`handlers/quotation_handler.rs` 的阈值读写端点
//!   （`GET|PUT /api/v1/erp/quotations/discount-config`）。
//! - **入参**：报价单 ID（i64）、阈值（Decimal，百分点）、操作人 user_id（i32）；
//!   全部由调用方传入，本服务不从请求体取数、不做身份判定。
//! - **传给谁**：查询走 SeaORM（泛型 `ConnectionTrait`，调用方可传事务内连接，使折扣
//!   与阈值在被锁定的单据上重算）；判定结果回给审批服务决定状态跃迁去向；阈值写入经
//!   审计单点 `AuditLogService::update_with_audit` 落 `audit_logs`。
//! - **存什么**：只写配置表单行的 `over_discount_threshold_pct` 与 `updated_at`；
//!   判定过程不落任何业务数据。
//! - **存哪里**：PostgreSQL `public.quotation_discount_approval_configs`（单行 id=1）
//!   与 `public.audit_logs`（阈值变更审计行）。

use rust_decimal::Decimal;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set};
use std::sync::Arc;

use crate::container::AppState;
use crate::models::quotation_discount_config::{
    self, ActiveModel as ConfigActive, Entity as ConfigEntity, SINGLE_ROW_ID,
};
use crate::models::sales_quotation_item::{Column as ItemColumn, Entity as ItemEntity};
use crate::utils::error::AppError;

/// 阈值取值域下界（百分点），与 DB CHECK `chk_qdac_threshold_pct_range` 同口径
const THRESHOLD_MIN: Decimal = Decimal::ZERO;

/// 阈值取值域上界（百分点），与 DB CHECK `chk_qdac_threshold_pct_range` 同口径。
/// `Decimal::new(100, 0)` 非 `const fn`，改用库内 `const fn from_parts`，
/// `(lo=100, mid=0, hi=0, negative=false, scale=0)` 与其内存表示逐位等价。
const THRESHOLD_MAX: Decimal = Decimal::from_parts(100, 0, 0, false, 0);

/// 阈值列刻度：与列型 DECIMAL(5,2) 的小数位一致（写入侧据此拒绝超精度入参，
/// 不接受被数据库静默舍入的值，保证出参与落库值逐字相同）
const THRESHOLD_SCALE: u32 = 2;

/// 一版折扣判定结果：阈值、实际最大行折扣率（均为百分点）、是否超阈
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiscountVerdict {
    /// 配置表读出的超折扣阈值（百分点）
    pub threshold_pct: Decimal,
    /// 该报价单各明细行里最大的折扣率（百分点，NULL 行按 0 计）
    pub max_discount_pct: Decimal,
    /// `max_discount_pct > threshold_pct`（严格大于，与阈值列注释的判定关系一致）
    pub over_threshold: bool,
}

/// 报价超折扣审批门服务
pub struct QuotationDiscountService {
    db: Arc<sea_orm::DatabaseConnection>,
}

impl QuotationDiscountService {
    /// 从数据库连接直接构造
    pub fn new(db: Arc<sea_orm::DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 从 AppState 构造便捷方法
    pub fn from_state(state: &AppState) -> Self {
        Self {
            db: state.db.clone(),
        }
    }

    /// 读取超折扣阈值（单行配置 id=1）。
    ///
    /// 入参 conn：查询连接（事务内调用请传事务连接，与状态门读取同快照）。
    /// 传给谁：结果只由本服务的 `evaluate` 与阈值配置面消费。
    /// 配置行缺席时 fail-closed：记 error 点名表与缺行事实，返回可外显的业务拒绝，
    /// 引导先到阈值配置面配置；绝不回落任何代码内默认阈值（阈值属管理侧政策参数，
    /// 用代码常量兜底等于把政策从配置面偷回代码里）。
    pub async fn load_threshold<C: ConnectionTrait>(&self, conn: &C) -> Result<Decimal, AppError> {
        let config = ConfigEntity::find_by_id(SINGLE_ROW_ID)
            .one(conn)
            .await?
            .ok_or_else(|| {
                tracing::error!(
                    table = "quotation_discount_approval_configs",
                    config_id = SINGLE_ROW_ID,
                    "超折扣审批阈值配置行缺失：报价提交与阈值读取一律 fail-closed 拒绝，不回落默认阈值"
                );
                AppError::business_displayable(
                    "超折扣审批阈值尚未配置，请先完成阈值配置后再提交报价".to_string(),
                )
            })?;
        tracing::info!(
            config_id = config.id,
            threshold_pct = %config.over_discount_threshold_pct,
            "超折扣审批阈值已读取"
        );
        Ok(config.over_discount_threshold_pct)
    }

    /// 取该报价单明细行的最大折扣率（百分点）。
    ///
    /// 入参 quotation_id：报价单 ID；conn：查询连接。
    /// 传给谁：本服务 `evaluate` 与阈值判定日志。
    /// 无明细行时最大折扣率为 0（无折让可判），不视为异常——明细非空由建单与改单腿的
    /// 校验门保证，本方法只如实聚合已有事实。
    pub async fn max_line_discount_pct<C: ConnectionTrait>(
        &self,
        conn: &C,
        quotation_id: i64,
    ) -> Result<Decimal, AppError> {
        let items = ItemEntity::find()
            .filter(ItemColumn::QuotationId.eq(quotation_id))
            .all(conn)
            .await?;
        let mut max_pct = Decimal::ZERO;
        let mut counted = 0usize;
        for item in &items {
            let rate = item.discount_rate.unwrap_or(Decimal::ZERO);
            if rate > max_pct {
                max_pct = rate;
            }
            counted += 1;
        }
        tracing::info!(
            quotation_id,
            item_count = counted,
            max_discount_pct = %max_pct,
            "报价明细行折扣率已聚合（百分点，NULL 行按 0 计）"
        );
        Ok(max_pct)
    }

    /// 折扣门判定：读阈值 + 聚合行折扣率，产出「是否超阈」。
    ///
    /// 入参 quotation_id：报价单 ID；conn：查询连接（状态跃迁腿请传持有排他锁的事务连接）。
    /// 传给谁：`quotation_approval_service.rs` 决定提交去向（自批还是进审批流）与
    /// 拒绝文案；不直接对外。
    /// 存什么/存哪里：不存储，判定结果只进日志与调用方的状态门。
    pub async fn evaluate<C: ConnectionTrait>(
        &self,
        conn: &C,
        quotation_id: i64,
    ) -> Result<DiscountVerdict, AppError> {
        let threshold_pct = self.load_threshold(conn).await?;
        let max_discount_pct = self.max_line_discount_pct(conn, quotation_id).await?;
        let over_threshold = max_discount_pct > threshold_pct;
        tracing::info!(
            quotation_id,
            threshold_pct = %threshold_pct,
            max_discount_pct = %max_discount_pct,
            over_threshold,
            "报价超折扣审批门判定完成"
        );
        Ok(DiscountVerdict {
            threshold_pct,
            max_discount_pct,
            over_threshold,
        })
    }

    /// 读阈值配置整行（配置面 GET 用）。
    ///
    /// 入参：无外部入参（按固定单行主键取）。
    /// 传给谁：`handlers/quotation_handler.rs` 的 GET 端点序列化为出参键。
    /// 存什么/存哪里：只读 `quotation_discount_approval_configs` 单行，不写任何数据。
    pub async fn get_config(&self) -> Result<quotation_discount_config::Model, AppError> {
        let config = ConfigEntity::find_by_id(SINGLE_ROW_ID)
            .one(&*self.db)
            .await?
            .ok_or_else(|| {
                tracing::error!(
                    table = "quotation_discount_approval_configs",
                    config_id = SINGLE_ROW_ID,
                    "超折扣审批阈值配置行缺失：阈值读取面 fail-closed 拒绝，不返回默认值"
                );
                AppError::business_displayable(
                    "超折扣审批阈值尚未配置，请先初始化阈值配置".to_string(),
                )
            })?;
        tracing::info!(
            config_id = config.id,
            threshold_pct = %config.over_discount_threshold_pct,
            "阈值配置面读取完成"
        );
        Ok(config)
    }

    /// 写阈值（配置面 PUT 用），经审计单点落 before/after 快照。
    ///
    /// 入参 threshold_pct：新阈值（百分点，取值域 0~100 与 DB CHECK 同源，且最多两位小数
    /// 与列型 DECIMAL(5,2) 同源）；越界或超精度在本方法内点名拒绝，不让它裸撞到约束变成
    /// 500，也不接受被数据库悄悄舍入的入参（出参必须与落库值逐字相同）。
    /// user_id：操作人（进审计行）。
    /// 传给谁：`AuditLogService::update_with_audit` 写 `audit_logs`；结果回给 handler 出参。
    /// 存什么：单行的 `over_discount_threshold_pct` 与 `updated_at`。
    /// 存哪里：`quotation_discount_approval_configs`（id=1 单行）。
    pub async fn save_threshold(
        &self,
        threshold_pct: Decimal,
        user_id: i32,
    ) -> Result<quotation_discount_config::Model, AppError> {
        if threshold_pct < THRESHOLD_MIN || threshold_pct > THRESHOLD_MAX {
            tracing::warn!(
                requested_threshold_pct = %threshold_pct,
                allowed_min = %THRESHOLD_MIN,
                allowed_max = %THRESHOLD_MAX,
                operator_user_id = user_id,
                "超折扣阈值写入被拒：越出 0~100 百分点取值域，未改动配置行"
            );
            return Err(AppError::validation_displayable(format!(
                "超折扣阈值必须在 {} 到 {} 个百分点之间",
                THRESHOLD_MIN, THRESHOLD_MAX
            )));
        }
        if threshold_pct != threshold_pct.round_dp(THRESHOLD_SCALE) {
            tracing::warn!(
                requested_threshold_pct = %threshold_pct,
                allowed_scale = THRESHOLD_SCALE,
                operator_user_id = user_id,
                "超折扣阈值写入被拒：超出列刻度（两位小数），未改动配置行、未做任何静默舍入"
            );
            return Err(AppError::validation_displayable(format!(
                "超折扣阈值最多保留 {} 位小数",
                THRESHOLD_SCALE
            )));
        }

        let row = self.get_config().await?;
        let before = row.over_discount_threshold_pct;
        let mut active: ConfigActive = row.into();
        active.over_discount_threshold_pct = Set(threshold_pct);
        active.updated_at = Set(chrono::Utc::now());

        let updated = crate::services::audit_log_service::AuditLogService::update_with_audit(
            &*self.db,
            crate::services::audit_log_service::RESOURCE_TYPE_PLACEHOLDER,
            active,
            Some(user_id),
        )
        .await?;
        tracing::info!(
            threshold_pct_before = %before,
            threshold_pct_after = %updated.over_discount_threshold_pct,
            operator_user_id = user_id,
            "超折扣审批阈值已更新（审计行含 before/after 快照）"
        );
        Ok(updated)
    }
}
