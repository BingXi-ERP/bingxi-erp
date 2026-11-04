//! 账龄预警规则服务
//!
//! 提供预警规则的 CRUD 和查询功能

use crate::models::aging_alert_rule;
use crate::models::status::{aging_alert_bucket, aging_alert_level, aging_notify_method};
use crate::utils::error::AppError;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, Order, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, Set,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

/// 创建预警规则请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateAlertRuleRequest {
    pub rule_name: String,
    pub rule_code: String,
    pub aging_bucket: String,
    pub threshold_days: i32,
    pub threshold_amount: Option<rust_decimal::Decimal>,
    pub alert_level: String,
    pub notify_method: String,
    pub notify_roles: Option<Vec<String>>,
    pub is_active: Option<bool>,
    pub remarks: Option<String>,
}

/// 更新预警规则请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateAlertRuleRequest {
    pub rule_name: Option<String>,
    pub aging_bucket: Option<String>,
    pub threshold_days: Option<i32>,
    pub threshold_amount: Option<Option<rust_decimal::Decimal>>,
    pub alert_level: Option<String>,
    pub notify_method: Option<String>,
    pub notify_roles: Option<Option<Vec<String>>>,
    pub is_active: Option<bool>,
    pub remarks: Option<Option<String>>,
}

/// 查询参数
#[derive(Debug, Clone, Default)]
pub struct AlertRuleQueryParams {
    pub aging_bucket: Option<String>,
    pub alert_level: Option<String>,
    pub is_active: Option<bool>,
    pub page: u64,
    pub page_size: u64,
}

pub struct AgingAlertRuleService {
    db: Arc<DatabaseConnection>,
}

impl AgingAlertRuleService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 校验受控词表列的提交值：键缺席（None）跳过，越界值一律拒绝
    ///
    /// 调用方：create 与 update 两条写腿，入参 aging_bucket / alert_level / notify_method 三列。
    /// 入参：field 是要点名的列名、value 是本次提交值（None 表示本列未提交，更新腿保持原值）、
    /// allowed 是该列在 status 侧登记的词表全集。
    /// 传给谁：越界值产出 AppError（HTTP 400、code=VALIDATION_ERROR）沿请求链上抛，文案点名
    /// 列名、提交值与合法取值范围，不含记录 ID；合法值原样返回 Ok 交给写腿落库，本函数不改值。
    /// 存什么/存哪里：本函数不写库；三列在库侧均无 CHECK 约束，这里是非法值入库前的唯一准入门。
    fn ensure_token_allowed(
        field: &str,
        value: Option<&str>,
        allowed: &[&str],
    ) -> Result<(), AppError> {
        match value {
            Some(v) if allowed.contains(&v) => Ok(()),
            Some(v) => Err(AppError::validation_displayable(format!(
                "非法 {}: {}，合法值：{}",
                field,
                v,
                allowed.join("/")
            ))),
            None => Ok(()),
        }
    }

    /// 创建预警规则
    pub async fn create(
        &self,
        req: CreateAlertRuleRequest,
        user_id: i32,
    ) -> Result<aging_alert_rule::Model, AppError> {
        info!("用户 {} 正在创建账龄预警规则：{}", user_id, req.rule_name);

        Self::ensure_token_allowed(
            "aging_bucket",
            Some(req.aging_bucket.as_str()),
            aging_alert_bucket::ALL,
        )?;
        Self::ensure_token_allowed(
            "alert_level",
            Some(req.alert_level.as_str()),
            aging_alert_level::ALL,
        )?;
        Self::ensure_token_allowed(
            "notify_method",
            Some(req.notify_method.as_str()),
            aging_notify_method::ALL,
        )?;

        let now = Utc::now();
        let active = aging_alert_rule::ActiveModel {
            rule_name: Set(req.rule_name),
            rule_code: Set(req.rule_code),
            aging_bucket: Set(req.aging_bucket),
            threshold_days: Set(req.threshold_days),
            threshold_amount: Set(req.threshold_amount),
            alert_level: Set(req.alert_level),
            notify_method: Set(req.notify_method),
            notify_roles: Set(req.notify_roles.map(aging_alert_rule::NotifyRoles)),
            is_active: Set(req.is_active.unwrap_or(true)),
            remarks: Set(req.remarks),
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        };

        let rule = active.insert(&*self.db).await?;
        info!("账龄预警规则创建成功：ID {}", rule.id);
        Ok(rule)
    }

    /// 查询规则列表
    pub async fn list(
        &self,
        params: AlertRuleQueryParams,
    ) -> Result<(Vec<aging_alert_rule::Model>, u64), AppError> {
        let mut query = aging_alert_rule::Entity::find();

        if let Some(ref bucket) = params.aging_bucket {
            query = query.filter(aging_alert_rule::Column::AgingBucket.eq(bucket.as_str()));
        }
        if let Some(ref level) = params.alert_level {
            query = query.filter(aging_alert_rule::Column::AlertLevel.eq(level.as_str()));
        }
        if let Some(is_active) = params.is_active {
            query = query.filter(aging_alert_rule::Column::IsActive.eq(is_active));
        }

        let total = query.clone().count(&*self.db).await?;

        let rules = query
            .order_by(aging_alert_rule::Column::Id, Order::Desc)
            .offset(params.page * params.page_size)
            .limit(params.page_size)
            .all(&*self.db)
            .await?;

        Ok((rules, total))
    }

    /// 获取规则详情
    pub async fn get_by_id(&self, id: i32) -> Result<aging_alert_rule::Model, AppError> {
        let rule = aging_alert_rule::Entity::find_by_id(id)
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found(format!("账龄预警规则不存在：{}", id)))?;
        Ok(rule)
    }

    /// 更新规则
    pub async fn update(
        &self,
        id: i32,
        req: UpdateAlertRuleRequest,
    ) -> Result<aging_alert_rule::Model, AppError> {
        Self::ensure_token_allowed(
            "aging_bucket",
            req.aging_bucket.as_deref(),
            aging_alert_bucket::ALL,
        )?;
        Self::ensure_token_allowed(
            "alert_level",
            req.alert_level.as_deref(),
            aging_alert_level::ALL,
        )?;
        Self::ensure_token_allowed(
            "notify_method",
            req.notify_method.as_deref(),
            aging_notify_method::ALL,
        )?;

        let rule = self.get_by_id(id).await?;

        let mut active: aging_alert_rule::ActiveModel = rule.into();

        if let Some(v) = req.rule_name {
            active.rule_name = Set(v);
        }
        if let Some(v) = req.aging_bucket {
            active.aging_bucket = Set(v);
        }
        if let Some(v) = req.threshold_days {
            active.threshold_days = Set(v);
        }
        if let Some(v) = req.threshold_amount {
            active.threshold_amount = Set(v);
        }
        if let Some(v) = req.alert_level {
            active.alert_level = Set(v);
        }
        if let Some(v) = req.notify_method {
            active.notify_method = Set(v);
        }
        if let Some(v) = req.notify_roles {
            active.notify_roles = Set(v.map(aging_alert_rule::NotifyRoles));
        }
        if let Some(v) = req.is_active {
            active.is_active = Set(v);
        }
        if let Some(v) = req.remarks {
            active.remarks = Set(v);
        }
        active.updated_at = Set(Utc::now());

        let updated = active.update(&*self.db).await?;
        Ok(updated)
    }

    /// 删除规则
    pub async fn delete(&self, id: i32) -> Result<(), AppError> {
        let rule = self.get_by_id(id).await?;

        let active: aging_alert_rule::ActiveModel = rule.into();
        active.delete(&*self.db).await?;

        info!("账龄预警规则 {} 已删除", id);
        Ok(())
    }
}
