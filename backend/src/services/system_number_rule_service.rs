//! 编码规则管理服务。
//!
//! 功能 提供规则分页、详情、乐观锁更新与历史快照回滚。更新和回滚均在行锁事务内
//!   追加版本、更新当前规则并同步写审计；任一步失败全部回滚。
//! 调用方 `handlers/system_number_rule_handler.rs`；取号器只读规则主表，不依赖本服务缓存。
//! 入参 管理请求 DTO 与真实操作人 ID。
//! 传给谁 PostgreSQL 规则主表、追加版本快照表与统一审计服务。
//! 存什么 当前前缀、流水宽度、重置周期、版本号，以及不可变的历史配置快照。
//! 存哪里 `system_number_rules`、`system_number_rule_revisions`、`audit_logs`。

use std::sync::Arc;

use crate::models::system_number_rule::{
    ActiveModel as RuleActiveModel, Column as RuleColumn, Entity as RuleEntity, Model as RuleModel,
};
use crate::models::system_number_rule_revision::{
    ActiveModel as RevisionActiveModel, Column as RevisionColumn, Entity as RevisionEntity,
};
use crate::services::audit_log_service::AuditLogService;
use crate::services::system_number_rule_dto::{
    NumberRuleConfigSnapshot, RollbackNumberRuleRequest, RuleDetailDto, UpdateNumberRuleRequest,
};
use crate::utils::error::AppError;
use crate::utils::response::PaginatedResponse;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, Set, TransactionTrait,
};

/// 编码规则管理面服务；所有写操作以数据库行锁与版本复核为准。
pub struct SystemNumberRuleService {
    db: Arc<DatabaseConnection>,
}

impl SystemNumberRuleService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 分页读取当前规则；排序稳定为 rule_key 升序。
    pub async fn list(
        &self,
        page: i64,
        page_size: i64,
    ) -> Result<PaginatedResponse<RuleModel>, AppError> {
        let page = page.clamp(1, 1000);
        let page_size = page_size.clamp(1, 100);
        let query = RuleEntity::find().order_by(RuleColumn::RuleKey, sea_orm::Order::Asc);
        let total = query.clone().count(&*self.db).await?;
        let items = query
            .offset(((page - 1) * page_size) as u64)
            .limit(page_size as u64)
            .all(&*self.db)
            .await?;
        Ok(PaginatedResponse::new(
            items,
            total,
            page as u64,
            page_size as u64,
        ))
    }

    /// 读取规则与完整历史；主记录不存在时显式返回 404。
    pub async fn get(&self, id: i32) -> Result<RuleDetailDto, AppError> {
        Self::load_detail(&*self.db, id).await
    }

    /// 以调用方版本更新当前规则，并追加同版本号的新快照。
    pub async fn update(
        &self,
        id: i32,
        req: UpdateNumberRuleRequest,
        actor_id: i32,
    ) -> Result<RuleDetailDto, AppError> {
        let config = Self::normalize_config(&req.prefix, req.seq_width, &req.reset_mode)?;
        let reason = Self::normalize_reason(&req.change_reason)?;
        let txn = (*self.db).begin().await?;
        let existing = Self::lock_rule(&txn, id).await?;
        Self::require_version(existing.version, req.version)?;
        let next_version = Self::next_version(existing.version)?;
        let now = Utc::now();

        Self::insert_revision(&txn, id, next_version, &config, &reason, actor_id, now).await?;
        let mut active: RuleActiveModel = existing.into();
        active.prefix = Set(config.prefix);
        active.seq_width = Set(config.seq_width);
        active.reset_mode = Set(config.reset_mode);
        active.version = Set(next_version);
        active.updated_at = Set(now);
        AuditLogService::update_with_audit(&txn, "system_number_rules", active, Some(actor_id))
            .await?;

        let detail = Self::load_detail(&txn, id).await?;
        txn.commit().await?;
        tracing::info!("用户 {actor_id} 更新编码规则 id={id} version={next_version}");
        Ok(detail)
    }

    /// 把指定历史快照作为新版本应用；不删除或改写目标快照。
    pub async fn rollback(
        &self,
        id: i32,
        req: RollbackNumberRuleRequest,
        actor_id: i32,
    ) -> Result<RuleDetailDto, AppError> {
        let reason = Self::normalize_reason(&req.change_reason)?;
        let txn = (*self.db).begin().await?;
        let existing = Self::lock_rule(&txn, id).await?;
        Self::require_version(existing.version, req.version)?;

        let target = RevisionEntity::find()
            .filter(RevisionColumn::Id.eq(req.revision_id))
            .filter(RevisionColumn::RuleId.eq(id))
            .one(&txn)
            .await?
            .ok_or_else(|| AppError::not_found("编码规则历史版本不存在或不属于当前规则"))?;
        if target.version >= existing.version {
            return Err(AppError::business_displayable(
                "只能回滚到早于当前版本的历史快照",
            ));
        }
        let config: NumberRuleConfigSnapshot = serde_json::from_value(target.config)
            .map_err(|error| AppError::database(format!("编码规则历史快照结构损坏: {error}")))?;
        let config = Self::normalize_config(&config.prefix, config.seq_width, &config.reset_mode)?;
        let next_version = Self::next_version(existing.version)?;
        let now = Utc::now();

        Self::insert_revision(&txn, id, next_version, &config, &reason, actor_id, now).await?;
        let mut active: RuleActiveModel = existing.into();
        active.prefix = Set(config.prefix);
        active.seq_width = Set(config.seq_width);
        active.reset_mode = Set(config.reset_mode);
        active.version = Set(next_version);
        active.updated_at = Set(now);
        AuditLogService::update_with_audit(&txn, "system_number_rules", active, Some(actor_id))
            .await?;

        let detail = Self::load_detail(&txn, id).await?;
        txn.commit().await?;
        tracing::info!(
            "用户 {actor_id} 回滚编码规则 id={id} source_revision={} version={next_version}",
            req.revision_id
        );
        Ok(detail)
    }

    async fn lock_rule(txn: &sea_orm::DatabaseTransaction, id: i32) -> Result<RuleModel, AppError> {
        RuleEntity::find_by_id(id)
            .lock_exclusive()
            .one(txn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("编码规则不存在（id {id}）")))
    }

    fn require_version(current: i32, requested: i32) -> Result<(), AppError> {
        if requested < 1 {
            return Err(AppError::validation_displayable("规则版本必须大于 0"));
        }
        if current != requested {
            return Err(AppError::business_displayable(
                "编码规则已被其他操作修改，请刷新后重试",
            ));
        }
        Ok(())
    }

    fn next_version(current: i32) -> Result<i32, AppError> {
        current
            .checked_add(1)
            .ok_or_else(|| AppError::business_displayable("编码规则版本已达到上限，无法继续变更"))
    }

    fn normalize_config(
        prefix: &str,
        seq_width: i32,
        reset_mode: &str,
    ) -> Result<NumberRuleConfigSnapshot, AppError> {
        let prefix = prefix.trim();
        if prefix.is_empty() || prefix.chars().count() > 50 {
            return Err(AppError::validation_displayable(
                "编码规则前缀必须为 1 至 50 个字符",
            ));
        }
        if !(1..=12).contains(&seq_width) {
            return Err(AppError::validation_displayable(
                "编码规则流水位数必须为 1 至 12",
            ));
        }
        if !matches!(reset_mode, "day" | "month" | "never") {
            return Err(AppError::validation_displayable(
                "编码规则重置周期仅支持 day、month 或 never",
            ));
        }
        Ok(NumberRuleConfigSnapshot {
            prefix: prefix.to_string(),
            seq_width,
            reset_mode: reset_mode.to_string(),
        })
    }

    fn normalize_reason(reason: &str) -> Result<String, AppError> {
        let reason = reason.trim();
        if reason.is_empty() || reason.chars().count() > 500 {
            return Err(AppError::validation_displayable(
                "变更原因必须为 1 至 500 个字符",
            ));
        }
        Ok(reason.to_string())
    }

    async fn insert_revision(
        txn: &sea_orm::DatabaseTransaction,
        rule_id: i32,
        version: i32,
        config: &NumberRuleConfigSnapshot,
        reason: &str,
        actor_id: i32,
        now: chrono::DateTime<Utc>,
    ) -> Result<(), AppError> {
        let config = serde_json::to_value(config)
            .map_err(|error| AppError::database(format!("编码规则快照序列化失败: {error}")))?;
        RevisionActiveModel {
            id: Default::default(),
            rule_id: Set(rule_id),
            version: Set(version),
            config: Set(config),
            change_reason: Set(reason.to_string()),
            changed_by: Set(actor_id),
            created_at: Set(now),
        }
        .insert(txn)
        .await?;
        Ok(())
    }

    async fn load_detail(conn: &impl ConnectionTrait, id: i32) -> Result<RuleDetailDto, AppError> {
        let rule = RuleEntity::find_by_id(id)
            .one(conn)
            .await?
            .ok_or_else(|| AppError::not_found(format!("编码规则不存在（id {id}）")))?;
        let revisions = RevisionEntity::find()
            .filter(RevisionColumn::RuleId.eq(id))
            .order_by(RevisionColumn::Version, sea_orm::Order::Desc)
            .all(conn)
            .await?;
        Ok(RuleDetailDto { rule, revisions })
    }
}

#[cfg(test)]
mod tests {
    use super::SystemNumberRuleService;

    #[test]
    fn config_validation_matches_database_constraints() {
        let valid = SystemNumberRuleService::normalize_config(" SO ", 3, "day").unwrap();
        assert_eq!(valid.prefix, "SO");
        assert_eq!(valid.seq_width, 3);
        assert_eq!(valid.reset_mode, "day");

        for (prefix, width, mode) in [
            ("   ", 3, "day"),
            ("SO", 0, "day"),
            ("SO", 13, "day"),
            ("SO", 3, "year"),
        ] {
            assert!(
                SystemNumberRuleService::normalize_config(prefix, width, mode).is_err(),
                "非法规则配置必须被拒绝: prefix={prefix:?}, width={width}, mode={mode}"
            );
        }
    }

    #[test]
    fn reason_validation_rejects_blank_and_overlong_values() {
        assert!(SystemNumberRuleService::normalize_reason(" 调整前缀 ").is_ok());
        assert!(SystemNumberRuleService::normalize_reason("   ").is_err());
        assert!(SystemNumberRuleService::normalize_reason(&"字".repeat(501)).is_err());
    }

    #[test]
    fn version_conflict_is_explicit() {
        assert!(SystemNumberRuleService::require_version(2, 2).is_ok());
        assert!(SystemNumberRuleService::require_version(2, 1).is_err());
        assert!(SystemNumberRuleService::require_version(2, 0).is_err());
    }
}
