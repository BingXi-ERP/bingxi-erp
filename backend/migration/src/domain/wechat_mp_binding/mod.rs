//! 微信公众号通知腿绑定关系域
//!
//! 本域只落用户与公众号 openid 的绑定关系表 `user_wechat_mp_binding`,登记为一条顶层迁移台账:
//! - m0128_bind_wechat_openid: 绑定表 `user_wechat_mp_binding`(`user_id` 外键引用 `users(id)`
//!   并级联回收;`openid` 以具名唯一索引 `uq_uwmp_binding_openid` 固化一个 openid 只绑一个用户;
//!   `unionid` 可空,`bind_source` 记录绑定来源通道;`bound_at`/`updated_at` 为时间审计列)。
//!   域内不播种数据行——`users` 的初始用户由 init 阶段写入且晚于 migrate,迁移内插绑定行在
//!   干净库上恒命中 0 影响,绑定关系一律由应用侧写入。
//!
//! 注册位置:全链尾。作为新的顶层域而非并入既有域——并入已应用的域在复用库上会因台账已记账
//! 而被整体跳过,导致该表缺席;链尾新域名在复用库上属 pending,必然执行。
//! `down` 精确 DROP 本表并显式 DROP 两条索引,无外部引用方,可完整回退。

mod m0128_bind_wechat_openid;

use sea_orm_migration::prelude::*;

pub struct Migration;

impl MigrationName for Migration {
    fn name(&self) -> &'static str {
        "m_wechat_mp_binding"
    }
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0128_bind_wechat_openid::Migration.up(manager).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        m0128_bind_wechat_openid::Migration.down(manager).await?;
        Ok(())
    }
}
