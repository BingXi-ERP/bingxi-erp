//! 流转卡投纱明细模型（flow_card_materials 表）
//!
//! ## 六要素
//! - **功能**：登记一张生产流转卡实际投入的成品纱线（纱线本身是产品档案的一条）及其
//!   数量与纱批次，是"这块布用的是什么问题、什么编号、什么批次的纱"的唯一落库事实。
//! - **调用方**：`services/flow_card_ops/material.rs` 的增删改查与按卡列出；
//!   `services/production_order_ops/completion.rs` 完工扣料按生产订单聚合本表。
//! - **入参**：流转卡主键、投放仓库主键、纱线产品主键、与库存行同构的四维（纱批次、色号、
//!   缸号、等级）、投入数量与计量单位、备注。
//! - **传给谁**：读侧经 `column_as + LeftJoin + into_model::<Dto>()` 富化出纱名与纱编号后
//!   作为列表出参；写侧不落任何冗余名称。
//! - **存什么**：行主键、所属流转卡、投放仓库、纱线产品 ID、纱批次号、色号、缸号、等级、
//!   投入数量（DECIMAL(14,4)，与委外发料明细同口径）、计量单位（受控 kg 与 m 两值）、备注、
//!   软删标记、建单人与两侧时间戳。纱的编号不另存副本，出参时按 `material_id` 回
//!   `products.code` 取。
//! - **存哪里**：PostgreSQL `public.flow_card_materials`，外键指向
//!   `production_flow_card(id)`、`warehouses(id)` 与 `products(id)`。

use rust_decimal::Decimal;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// 计量单位取值：投入量要么按公斤要么按米，与库存侧双列一一对应，其它单位不落库
pub const UNIT_KG: &str = "kg";
pub const UNIT_METER: &str = "m";

/// 流转卡投纱明细（一行一种纱在一个批次上的投入；同一张卡可对同一支纱分批次多次投入，按行独立留痕）
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize, Default)]
#[sea_orm(table_name = "flow_card_materials")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,

    /// 所属流转卡 ID（外键 → production_flow_card.id）
    pub flow_card_id: i32,
    /// 投放仓库 ID（外键 → warehouses.id；与物料及四维共同定位被扣减的库存行）
    pub warehouse_id: i32,
    /// 投入的纱线产品 ID（外键 → products.id；纱的编号取 products.code，本表不另存副本）
    pub material_id: i32,
    /// 纱批次号（采购成品纱的批次；无批次为空串，与库存侧 batch_no 同为非空字符串）
    pub batch_no: String,
    /// 纱色号（库存行四维之一，缺则同种纱多色无法唯一命中库存行）
    pub color_no: String,
    /// 缸号（跟随库存侧可空）
    pub dye_lot_no: Option<String>,
    /// 纱等级（一等二等等外价差大，缺则会扣错等外品）
    pub grade: String,
    /// 投入数量（绝对量，非单耗；与委外发料明细同口径的 DECIMAL(14,4)）
    #[sea_orm(column_type = "Decimal(Some((14, 4)))")]
    pub quantity: Decimal,
    /// 计量单位，取值见本文件的 UNIT_KG 与 UNIT_METER
    pub unit: String,
    /// 备注
    pub remark: Option<String>,

    /// 软删标记
    pub is_deleted: bool,
    /// 建单人（服务端会话身份）
    pub created_by: Option<i32>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    /// 关联所属流转卡
    #[sea_orm(
        belongs_to = "super::production_flow_card::Entity",
        from = "Column::FlowCardId",
        to = "super::production_flow_card::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    FlowCard,
    /// 关联投放仓库（被投纱行引用的仓库不可删除，避免库存扣减指向不存在的仓）
    #[sea_orm(
        belongs_to = "super::warehouse::Entity",
        from = "Column::WarehouseId",
        to = "super::warehouse::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Warehouse,
    /// 关联投入的纱线（产品档案）
    #[sea_orm(
        belongs_to = "super::product::Entity",
        from = "Column::MaterialId",
        to = "super::product::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Product,
}

impl Related<super::production_flow_card::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::FlowCard.def()
    }
}

impl Related<super::warehouse::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Warehouse.def()
    }
}

impl Related<super::product::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Product.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
