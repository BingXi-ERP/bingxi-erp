//! 用户与微信公众号 openid 绑定表建表迁移
//!
//! ## 六要素
//! - **功能**:创建绑定关系表 `user_wechat_mp_binding`,把一个 ERP 用户(`users.id`)与一个
//!   公众号粉丝身份(`openid`)固定配对,作为公众号模板消息出件时"发给谁"的唯一可靠判据。
//!   一个用户可持有多个 openid(多账号关注),一个 openid 只能绑一个用户。
//! - **调用方**:SeaORM migrator 链,经 `domain/wechat_mp_binding` 域注册,置于全链尾的新顶层
//!   域。读写面由 `services/wechat_mp_service` 的绑定查询与解绑维护,发送腿
//!   `services/wechat_mp_service::send_template_message` 按 `user_id` 反查 `openid` 取收件人;
//!   绑定写入面(扫码/菜单授权落库)由后续业务事件接入,本域只落数据地基不接调用点。
//! - **入参**:无(纯 DDL 迁移,不播种数据行)。
//! - **传给谁**:`user_id` 外键引用 `users(id)`(由 system 域 m0001 建表,链尾执行时必然已存在),
//!   `ON DELETE CASCADE` 使用户被删除时绑定行随之回收,不留指向已删用户的孤儿收件人;
//!   `openid` 唯一索引是发送腿"一人一 openid 不重复轰炸"的库侧兜底门。
//! - **存什么**:`user_id`(INTEGER NOT NULL,与 `users.id` 同宽 INTEGER)、`openid`
//!   (VARCHAR(64) NOT NULL 唯一,公众号内用户标识)、`unionid`(VARCHAR(64) 可空,开放平台跨
//!   应用标识,未接入开放平台时保持空值即"无 unionid"的判据,不设默认值)、`bind_source`
//!   (VARCHAR(32) NOT NULL,绑定来源标记,取值词表由后续业务事件接入方定义,本域不施加 CHECK
//!   以免把未定型的词表锁进约束)、`bound_at` 与 `updated_at`(TIMESTAMPTZ NOT NULL DEFAULT
//!   now(),绑定发生时间与绑定记录最后变更时间)。
//! - **存哪里**:PostgreSQL `public.user_wechat_mp_binding`。
//!
//! ## 形态说明
//! - 建表与两条索引一律 `IF NOT EXISTS`,唯一性走具名唯一索引而非列内 `UNIQUE`,使幂等可重放:
//!   复用库上重复执行不报错,新库上一次成型。
//! - 域内不 INSERT 任何数据行:`users` 的初始用户由 init 阶段播种且晚于 migrate,迁移内插入
//!   依赖具体用户的绑定行在干净库上恒命中 0 影响,既证明不了什么也会把不存在的用户 ID 写进
//!   约束里,故绑定关系一律由应用侧在用户与 openid 都确实存在后写入。
//! - `down` 精确 DROP 本表:无其他表外键引用本表,两条索引随表一并回收,回退不波及其他域。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
CREATE TABLE IF NOT EXISTS "user_wechat_mp_binding" (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    openid VARCHAR(64) NOT NULL,
    unionid VARCHAR(64),
    bind_source VARCHAR(32) NOT NULL,
    bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_uwmp_binding_user FOREIGN KEY (user_id) REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "uq_uwmp_binding_openid" ON "user_wechat_mp_binding"("openid");
CREATE INDEX IF NOT EXISTS "idx_uwmp_binding_user_id" ON "user_wechat_mp_binding"("user_id");
COMMENT ON TABLE "user_wechat_mp_binding" IS '用户与微信公众号 openid 的绑定关系:模板消息出件按 user_id 反查 openid 的唯一来源';
COMMENT ON COLUMN "user_wechat_mp_binding"."user_id" IS 'ERP 用户 ID,外键引用 users(id),用户删除时级联回收绑定行';
COMMENT ON COLUMN "user_wechat_mp_binding"."openid" IS '公众号内用户标识,uq_uwmp_binding_openid 固化一个 openid 只绑一个用户';
COMMENT ON COLUMN "user_wechat_mp_binding"."unionid" IS '开放平台跨应用用户标识,未接入开放平台时为 NULL';
COMMENT ON COLUMN "user_wechat_mp_binding"."bind_source" IS '绑定来源标记,区分绑定由哪条通道建立,取值词表由绑定写入面定义';
COMMENT ON COLUMN "user_wechat_mp_binding"."bound_at" IS '绑定发生时间(TIMESTAMPTZ,建表默认 now(),由写入侧显式覆盖)';
COMMENT ON COLUMN "user_wechat_mp_binding"."updated_at" IS '绑定记录最后变更时间(TIMESTAMPTZ,默认 now())';
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let sql = r#"
DROP INDEX IF EXISTS "idx_uwmp_binding_user_id";
DROP INDEX IF EXISTS "uq_uwmp_binding_openid";
DROP TABLE IF EXISTS "user_wechat_mp_binding";
"#;
        manager.get_connection().execute_unprepared(sql).await?;
        Ok(())
    }
}
