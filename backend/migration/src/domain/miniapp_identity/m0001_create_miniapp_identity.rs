//! 创建微信小程序身份绑定表。
//!
//! `(appid, openid)` 是身份唯一键，`user_id` 指向现有用户并随用户删除级联回收。
//! 时间列由数据库提供默认值，应用写入时仍显式设置，保持与实体模型一致。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(MiniappIdentity::Table)
                    .col(
                        ColumnDef::new(MiniappIdentity::Id)
                            .big_integer()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(MiniappIdentity::Appid).string().not_null())
                    .col(ColumnDef::new(MiniappIdentity::Openid).string().not_null())
                    .col(ColumnDef::new(MiniappIdentity::UserId).integer().not_null())
                    .col(
                        ColumnDef::new(MiniappIdentity::CreatedAt)
                            .date_time()
                            .default(SimpleExpr::current_timestamp())
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(MiniappIdentity::UpdatedAt)
                            .date_time()
                            .default(SimpleExpr::current_timestamp())
                            .not_null(),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_miniapp_identity_user")
                            .from(MiniappIdentity::Table, MiniappIdentity::UserId)
                            .to(Users::Table, Users::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .index(
                        Index::create()
                            .name("uq_miniapp_identity_appid_openid")
                            .unique()
                            .col(MiniappIdentity::Appid)
                            .col(MiniappIdentity::Openid),
                    )
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(MiniappIdentity::Table).to_owned())
            .await
    }
}

#[derive(DeriveIden)]
enum MiniappIdentity {
    Table,
    Id,
    Appid,
    Openid,
    UserId,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Users {
    Table,
    Id,
}
