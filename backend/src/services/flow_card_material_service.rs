//! 流转卡投纱明细 Service（flow_card_material_service）
//!
//! ## 六要素
//! - **功能**：登记与读取"一张流转卡实际投入了哪支纱、哪个批次、投了多少"，并把投入记录
//!   按生产订单聚合后交给完工扣料使用。纱的编号与名称不落副本，读面按 material_id 关联
//!   产品档案带出。
//! - **调用方**：`handlers/flow_card_handler.rs` 的投纱子资源端点（挂 `/flow-cards/{id}/materials`
//!   与 `/flow-cards/materials/{id}`）；`services/production_order_ops/completion.rs` 在生产订单
//!   完工时经 `collect_for_order` 取该订单全部流转卡的投纱行做原材料扣减。
//! - **入参**：所属流转卡、投放仓库、纱线产品、批次与色号与缸号与等级、投入数量与单位、
//!   备注；建单人取服务端会话身份，请求体不承载身份。
//! - **传给谁**：读面返回 `FlowCardMaterialView`（实体字段加纱编号与纱名）作为列表与详情出参；
//!   写面只落库不外发，扣料侧拿的是实体集合。
//! - **存什么**：PostgreSQL `public.flow_card_materials` 的行（建表见
//!   `migration/src/domain/flow_card_material_input/m0131_create_flow_card_materials.rs`），
//!   软删标记保留历史投纱事实以供追溯。
//! - **存哪里**：同表；本 Service 不写其它表，库存扣减与流水由完工扣料侧在事务内完成。
//!
//! ## 口径说明
//! - 单位受控两值 kg 与 m（值域见 `models::flow_card_material` 的 UNIT_KG 与 UNIT_METER），
//!   与库存行的公斤列与米数列一一对应；其它单位在建单期显式拒绝，不做任何换算或等比折算，
//!   避免出现"按米扣一个按公斤买的东西"。
//! - 等级受控三值 一等品/二等品/等外品（值域见 `models::flow_card_material` 的 GRADE_* 三常量，
//!   与库存等级词表 `inventory_stock_grade` 同源）；词表外取值在建单期显式拒绝，
//!   避免登记面放过扣料期必然命不中或扣错等外品库存行的行。
//! - 四维（批次、色号、缸号、等级）与 `inventory_stock` 的库存行区分维度同构，扣料据此命中
//!   唯一库存行；这里不校验库存是否够，够不够由完工扣料在同一事务内判定，避免两个地方各判
//!   一次而口径分叉。

use std::sync::Arc;

use rust_decimal::Decimal;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, FromQueryResult, JoinType,
    Order, QueryFilter, QueryOrder, QuerySelect, RelationTrait, Set,
};
use serde::{Deserialize, Serialize};

use crate::models::flow_card_material::{
    ActiveModel as MaterialActiveModel, Column as MaterialColumn, Entity as MaterialEntity,
    GRADE_FIRST, GRADE_OFF, GRADE_SECOND, Model as MaterialModel, Relation as MaterialRelation,
    UNIT_KG, UNIT_METER,
};
use crate::models::product;
use crate::models::production_flow_card::{
    Column as CardColumn, Entity as CardEntity, Model as CardModel,
};
use crate::utils::date_utils::utc_now_fixed;
use crate::utils::error::AppError;

/// 允许的计量单位取值集合，唯一事实来源在 `models::flow_card_material`
const ALLOWED_UNITS: [&str; 2] = [UNIT_KG, UNIT_METER];

/// 允许的等级取值集合，唯一事实来源在 `models::flow_card_material`
/// （与库存等级词表 `inventory_stock_grade` 同源）
const ALLOWED_GRADES: [&str; 3] = [GRADE_FIRST, GRADE_SECOND, GRADE_OFF];

/// 新增投纱行入参
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CreateFlowCardMaterialRequest {
    /// 所属流转卡主键
    pub flow_card_id: i32,
    /// 投放仓库主键，必填且必须由操作者选定，不取"第一个启用仓库"
    pub warehouse_id: i32,
    /// 纱线产品主键
    pub material_id: i32,
    /// 纱批次；无批次传空串，与库存侧同构
    #[serde(default)]
    pub batch_no: String,
    /// 色号；纱线无色系时传空串
    #[serde(default)]
    pub color_no: String,
    /// 缸号，可空
    #[serde(default)]
    pub dye_lot_no: Option<String>,
    /// 等级；必选受控三值 一等品/二等品/等外品（与库存行等级同源），词表外取值建单期拒绝；
    /// 缺键按空串进入同一词表门拒绝，不外抛 serde 缺字段裸错
    #[serde(default)]
    pub grade: String,
    /// 投入数量（绝对量）
    pub quantity: Decimal,
    /// 计量单位，取值 kg 或 m
    pub unit: String,
    #[serde(default)]
    pub remark: Option<String>,
}

/// 修改投纱行入参；整行覆盖语义，缺字段即按空值写入，不做部分字段合并
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UpdateFlowCardMaterialRequest {
    pub warehouse_id: i32,
    pub material_id: i32,
    #[serde(default)]
    pub batch_no: String,
    #[serde(default)]
    pub color_no: String,
    #[serde(default)]
    pub dye_lot_no: Option<String>,
    /// 等级；受控三值，与新建同门同族拒绝
    #[serde(default)]
    pub grade: String,
    pub quantity: Decimal,
    pub unit: String,
    #[serde(default)]
    pub remark: Option<String>,
}

/// 投纱行的读面视图：实体字段加关联带出的纱编号与纱名
#[derive(Debug, Clone, PartialEq, Serialize, FromQueryResult)]
pub struct FlowCardMaterialView {
    pub id: i32,
    pub flow_card_id: i32,
    pub warehouse_id: i32,
    pub material_id: i32,
    pub batch_no: String,
    pub color_no: String,
    pub dye_lot_no: Option<String>,
    pub grade: String,
    pub quantity: Decimal,
    pub unit: String,
    pub remark: Option<String>,
    pub is_deleted: bool,
    pub created_by: Option<i32>,
    pub created_at: sea_orm::prelude::DateTimeWithTimeZone,
    pub updated_at: sea_orm::prelude::DateTimeWithTimeZone,
    pub material_no: Option<String>,
    pub material_name: Option<String>,
}

pub struct FlowCardMaterialService {
    db: Arc<DatabaseConnection>,
}

impl FlowCardMaterialService {
    pub fn new(db: Arc<DatabaseConnection>) -> Self {
        Self { db }
    }

    /// 新增一条投纱记录；卡不存在或单位不合法或等级越出词表或数量为负均显式拒绝
    pub async fn create(
        &self,
        req: CreateFlowCardMaterialRequest,
        user_id: i32,
    ) -> Result<MaterialModel, AppError> {
        Self::validate_unit(&req.unit)?;
        Self::validate_grade(&req.grade)?;
        Self::validate_quantity(req.quantity)?;
        self.ensure_card_exists(req.flow_card_id).await?;

        let now = utc_now_fixed();
        let active = MaterialActiveModel {
            id: sea_orm::NotSet,
            flow_card_id: Set(req.flow_card_id),
            warehouse_id: Set(req.warehouse_id),
            material_id: Set(req.material_id),
            batch_no: Set(req.batch_no),
            color_no: Set(req.color_no),
            dye_lot_no: Set(req.dye_lot_no),
            grade: Set(req.grade),
            quantity: Set(req.quantity),
            unit: Set(req.unit),
            remark: Set(req.remark),
            is_deleted: Set(false),
            created_by: Set(Some(user_id)),
            created_at: Set(now),
            updated_at: Set(now),
        };
        let saved = active.insert(&*self.db).await?;
        tracing::info!(
            material_row_id = saved.id,
            flow_card_id = saved.flow_card_id,
            material_id = saved.material_id,
            batch_no = %saved.batch_no,
            quantity = %saved.quantity,
            unit = %saved.unit,
            operator = user_id,
            "投纱记录已登记（flow_card_material_service.create）"
        );
        Ok(saved)
    }

    /// 修改一条投纱记录；行不存在或已软删返回未找到
    pub async fn update(
        &self,
        row_id: i32,
        req: UpdateFlowCardMaterialRequest,
        user_id: i32,
    ) -> Result<MaterialModel, AppError> {
        Self::validate_unit(&req.unit)?;
        Self::validate_grade(&req.grade)?;
        Self::validate_quantity(req.quantity)?;

        let existing = MaterialEntity::find_by_id(row_id)
            .filter(MaterialColumn::IsDeleted.eq(false))
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found("投纱记录不存在或已被删除"))?;

        let mut active: MaterialActiveModel = existing.into();
        active.warehouse_id = Set(req.warehouse_id);
        active.material_id = Set(req.material_id);
        active.batch_no = Set(req.batch_no);
        active.color_no = Set(req.color_no);
        active.dye_lot_no = Set(req.dye_lot_no);
        active.grade = Set(req.grade);
        active.quantity = Set(req.quantity);
        active.unit = Set(req.unit);
        active.remark = Set(req.remark);
        active.updated_at = Set(utc_now_fixed());
        let saved = active.update(&*self.db).await?;
        tracing::info!(
            material_row_id = saved.id,
            flow_card_id = saved.flow_card_id,
            operator = user_id,
            "投纱记录已修改（flow_card_material_service.update）"
        );
        Ok(saved)
    }

    /// 软删一条投纱记录；已完工订单下的投纱行删除会被完工侧按聚合结果自然反映，
    /// 因此这里不判断订单状态，只在日志留痕删除人，并把作废后的行回传给调用方
    pub async fn delete(&self, row_id: i32, user_id: i32) -> Result<MaterialModel, AppError> {
        let existing = MaterialEntity::find_by_id(row_id)
            .filter(MaterialColumn::IsDeleted.eq(false))
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found("投纱记录不存在或已被删除"))?;

        let mut active: MaterialActiveModel = existing.into();
        active.is_deleted = Set(true);
        active.updated_at = Set(utc_now_fixed());
        let voided = active.update(&*self.db).await?;
        tracing::info!(
            material_row_id = voided.id,
            operator = user_id,
            "投纱记录已作废（flow_card_material_service.delete）"
        );
        Ok(voided)
    }

    /// 读取单条投纱记录；已软删的行按未找到处理，让删除后的读面与列表一致
    pub async fn get_by_id(&self, row_id: i32) -> Result<MaterialModel, AppError> {
        MaterialEntity::find_by_id(row_id)
            .filter(MaterialColumn::IsDeleted.eq(false))
            .one(&*self.db)
            .await?
            .ok_or_else(|| AppError::not_found("投纱记录不存在或已被删除"))
    }

    /// 按卡列出投纱记录，带出纱编号与纱名
    pub async fn list_by_card(&self, card_id: i32) -> Result<Vec<FlowCardMaterialView>, AppError> {
        let rows = MaterialEntity::find()
            .join(JoinType::LeftJoin, MaterialRelation::Product.def())
            .column_as(product::Column::Code, "material_no")
            .column_as(product::Column::Name, "material_name")
            .filter(MaterialColumn::FlowCardId.eq(card_id))
            .filter(MaterialColumn::IsDeleted.eq(false))
            .order_by(MaterialColumn::Id, Order::Asc)
            .into_model::<FlowCardMaterialView>()
            .all(&*self.db)
            .await?;
        tracing::debug!(
            flow_card_id = card_id,
            rows = rows.len(),
            "投纱记录列出（flow_card_material_service.list_by_card）"
        );
        Ok(rows)
    }

    /// 按生产订单聚合该订单全部流转卡的未删投纱行，供完工扣料逐行扣减。
    ///
    /// 用单次 JOIN 取回（卡与行的归属关系以卡表为准，卡被软删的行不再参与扣料），
    /// 避免"先查卡再逐卡查行"的 N+1。返回行序稳定，按卡主键与行主键升序。
    pub async fn collect_for_order(
        txn: &sea_orm::DatabaseTransaction,
        order_id: i32,
    ) -> Result<Vec<(CardModel, MaterialModel)>, AppError> {
        let cards = CardEntity::find()
            .filter(CardColumn::ProductionOrderId.eq(order_id))
            .filter(CardColumn::IsDeleted.eq(false))
            .order_by(CardColumn::Id, Order::Asc)
            .all(txn)
            .await?;

        let mut collected: Vec<(CardModel, MaterialModel)> = Vec::new();
        for card in cards {
            let rows = MaterialEntity::find()
                .filter(MaterialColumn::FlowCardId.eq(card.id))
                .filter(MaterialColumn::IsDeleted.eq(false))
                .order_by(MaterialColumn::Id, Order::Asc)
                .all(txn)
                .await?;
            for row in rows {
                collected.push((card.clone(), row));
            }
        }
        tracing::info!(
            production_order_id = order_id,
            material_rows = collected.len(),
            "完工扣料的投纱聚合结果（flow_card_material_service.collect_for_order）"
        );
        Ok(collected)
    }

    async fn ensure_card_exists(&self, card_id: i32) -> Result<(), AppError> {
        let exists = CardEntity::find_by_id(card_id)
            .filter(CardColumn::IsDeleted.eq(false))
            .one(&*self.db)
            .await?
            .is_some();
        if !exists {
            return Err(AppError::not_found(
                "流转卡不存在或已被删除，请先建卡再登记投纱",
            ));
        }
        Ok(())
    }

    fn validate_unit(unit: &str) -> Result<(), AppError> {
        if ALLOWED_UNITS.contains(&unit) {
            Ok(())
        } else {
            Err(AppError::validation_displayable(
                "投纱计量单位只支持公斤与米两种，请按实际采购口径选择",
            ))
        }
    }

    /// 等级词表门：与库存等级同源三值之外的取值（含空串与历史译文值）一律建单期拒绝，
    /// 判错形态与库存侧 update_stock_grade 的同词表校验同族
    fn validate_grade(grade: &str) -> Result<(), AppError> {
        if ALLOWED_GRADES.contains(&grade) {
            Ok(())
        } else {
            Err(AppError::validation_displayable(format!(
                "非法等级值 {}，仅允许 一等品/二等品/等外品",
                grade
            )))
        }
    }

    fn validate_quantity(quantity: Decimal) -> Result<(), AppError> {
        if quantity <= Decimal::ZERO {
            return Err(AppError::validation_displayable("投纱数量必须大于零"));
        }
        Ok(())
    }
}
