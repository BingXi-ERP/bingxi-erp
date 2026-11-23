//! 匹号（布卷）查询处理器
//!
//! 匹号领域四维追溯的最小查询闭环（设计文档 .monkeycode/docs/piece-number-domain-design.md）：
//! - 按产品/匹号/匹类型/仓库过滤分页列表
//! - 供前端追溯页与 E2E 四维追溯断言使用

use crate::container::AppState;
use crate::middleware::auth_context::AuthContext;
use crate::models::status::purchase_inventory::inventory_piece as piece_status;
use crate::models::{
    fabric_defect_record, fabric_inspection_record, fabric_physical_test_record, inventory_piece,
    quality_inspection_record, warehouse,
};
use crate::utils::data_scope::apply_data_scope;
use crate::utils::error::AppError;
use crate::utils::response::{ApiResponse, PaginatedResponse};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use sea_orm::{ColumnTrait, Condition, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder};
use serde::Deserialize;

/// 匹号列表查询参数
#[derive(Debug, Deserialize)]
pub struct ListPieceParams {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
    /// 匹号精确匹配
    pub piece_no: Option<String>,
    /// 匹类型：greige=生产匹 / dyed=染色匹
    pub piece_type: Option<String>,
    /// 产品 ID
    pub product_id: Option<i32>,
    /// 仓库 ID
    pub warehouse_id: Option<i32>,
    /// 批次号（生产匹 = 工艺单号；染色匹 = 缸号/染色批次号）
    pub batch_no: Option<String>,
    /// 染色批号
    pub dye_lot_no: Option<String>,
    /// 匹状态过滤（词表唯一来源 models/status/purchase_inventory.rs::inventory_piece，
    /// 如 AVAILABLE=可出库匹）。出库/调拨对话框的"该缸该批现存可用匹"选择器按此下推查询，
    /// 不接受前端自行推断——状态集合是后端权威语义，前端只透传词表值。
    pub status: Option<String>,
}

/// 匹号列表响应条目（含仓库名便于追溯展示）
#[derive(Debug, Clone, serde::Serialize)]
pub struct PieceResponse {
    pub id: i32,
    pub piece_no: String,
    pub piece_type: String,
    pub dye_lot_id: Option<i32>,
    pub dye_lot_no: Option<String>,
    pub machine_no: Option<String>,
    pub machine_operator: Option<String>,
    pub warehouse_in_at: Option<chrono::DateTime<chrono::Utc>>,
    pub length: rust_decimal::Decimal,
    pub weight: Option<rust_decimal::Decimal>,
    /// 幅宽（cm，实测值；DB 可空列 inventory_piece.width）—— 标签 fail-closed 的
    /// 点名列之一。职责划分按本仓锁定口径：前端标签选择对话框只**如实回显**该列
    /// （未录入显示"未补录"），能否打印的**判定权在服务端**
    /// （`print_service.rs:4999-5009` 逐列 `is_none` 即 400 点名，不做前端灰化替代校验）。
    pub width: Option<rust_decimal::Decimal>,
    /// 克重（g/m²，实测值；DB 可空列 inventory_piece.gram_weight）
    pub gram_weight: Option<rust_decimal::Decimal>,
    /// 条码（= piece_no 口径由产匹链路写入；可空 = 未生成 ⇒ 标签拒绝）
    pub barcode: Option<String>,
    pub batch_no: String,
    pub color_no: Option<String>,
    pub product_id: i32,
    pub warehouse_id: i32,
    pub warehouse_name: Option<String>,
    pub warehouse_type: Option<String>,
    pub parent_piece_id: Option<i32>,
    /// 来源验布记录 ID，打卷产匹回指验布单的跨环追溯锚点。调用方是本 handler 的 list_pieces
    /// 行投影，入参是 inventory_piece 表 inspection_id 列原值（该列 INTEGER 可空且无外键约束，
    /// 空性以建表 DDL 为准），传给匹号追溯页与成品布标签清单按同名字段消费。存的是验布记录主键，
    /// 生产报工与委外回仓产的匹没有验布单来源，如实投影 null，不省略键、不兜底成别的 id。
    pub inspection_id: Option<i32>,
    pub piece_seq: Option<i32>,
    pub status: String,
    pub quality_status: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// GET /api/v1/erp/inventory/pieces - 匹号分页列表（四维追溯查询）
///
/// 读侧行级数据权限下推：`inventory_piece` 有 `created_by` 归属列（models/
/// inventory_piece.rs::created_by）而无 `department_id` 列，故用 `apply_data_scope`
/// 的 owner 列成员集合语义（Dept 分支按「归属人 ∈ 可见部门成员集合」，与
/// `check_resource_owner_by_member_scope` 单行门同源），owner 与 dept 两列均传
/// `Column::CreatedBy`（本表无部门列，Dept 分支不使用 dept 列）。过滤在构造处下推，
/// `total` 取自同一已过滤 paginator，与 items 同口径，不出现「列表比 total 少」的错位。
pub async fn list_pieces(
    State(state): State<AppState>,
    auth: AuthContext,
    Query(params): Query<ListPieceParams>,
) -> Result<Json<ApiResponse<PaginatedResponse<PieceResponse>>>, AppError> {
    let page = params.page.unwrap_or(1).clamp(1, 1000);
    let page_size = params.page_size.unwrap_or(20).clamp(1, 100);
    let data_scope_ctx = auth.to_data_scope_context();

    let mut condition = Condition::all();
    if let Some(no) = &params.piece_no {
        condition = condition.add(inventory_piece::Column::PieceNo.eq(no));
    }
    if let Some(pt) = &params.piece_type {
        condition = condition.add(inventory_piece::Column::PieceType.eq(pt));
    }
    if let Some(pid) = params.product_id {
        condition = condition.add(inventory_piece::Column::ProductId.eq(pid));
    }
    if let Some(wid) = params.warehouse_id {
        condition = condition.add(inventory_piece::Column::WarehouseId.eq(wid));
    }
    if let Some(bn) = &params.batch_no {
        condition = condition.add(inventory_piece::Column::BatchNo.eq(bn));
    }
    if let Some(lot) = &params.dye_lot_no {
        condition = condition.add(inventory_piece::Column::DyeLotNo.eq(lot));
    }
    // 状态过滤取值域 = models/status/purchase_inventory.rs::inventory_piece 词表（唯一来源），
    // 词表外取值显式拒绝（400 VALIDATION_ERROR，公开规则文案可外显），不静默返回空集
    if let Some(st) = &params.status {
        const PIECE_STATUS_DOMAIN: &[&str] = &[
            piece_status::AVAILABLE,
            piece_status::RESERVED,
            piece_status::SHIPPED,
            piece_status::DEFECT,
            piece_status::UNAVAILABLE,
            piece_status::SAMPLE,
        ];
        if !PIECE_STATUS_DOMAIN.contains(&st.as_str()) {
            return Err(AppError::validation_displayable(format!(
                "非法匹状态过滤值：{st}（允许值：AVAILABLE/RESERVED/SHIPPED/DEFECT/UNAVAILABLE/SAMPLE）"
            )));
        }
        condition = condition.add(inventory_piece::Column::Status.eq(st));
    }

    let query = apply_data_scope(
        inventory_piece::Entity::find().filter(condition),
        &data_scope_ctx,
        inventory_piece::Column::CreatedBy,
        inventory_piece::Column::CreatedBy,
    );
    let paginator = query
        .order_by_desc(inventory_piece::Column::CreatedAt)
        .paginate(state.db.as_ref(), page_size);
    let total = paginator.num_items().await?;
    // SeaORM paginate 使用 0-based 页码
    let models: Vec<inventory_piece::Model> = paginator.fetch_page(page.saturating_sub(1)).await?;

    // 批量取仓库名（避免 N+1：逐条查询改为一次性收集仓库 ID 查询）
    let warehouse_ids: Vec<i32> = models.iter().map(|p| p.warehouse_id).collect();
    let warehouses: std::collections::HashMap<i32, warehouse::Model> = warehouse::Entity::find()
        .filter(warehouse::Column::Id.is_in(warehouse_ids))
        .all(state.db.as_ref())
        .await?
        .into_iter()
        .map(|w| (w.id, w))
        .collect();

    let items: Vec<PieceResponse> = models
        .into_iter()
        .map(|p| {
            let w = warehouses.get(&p.warehouse_id);
            PieceResponse {
                id: p.id,
                piece_no: p.piece_no,
                piece_type: p.piece_type,
                dye_lot_id: p.dye_lot_id,
                dye_lot_no: Some(p.dye_lot_no),
                machine_no: p.machine_no,
                machine_operator: p.machine_operator,
                warehouse_in_at: p.warehouse_in_at,
                length: p.length,
                weight: p.weight,
                // 三列实测值 + 条码原样回传（读键与后端输出同为 snake_case、与
                // models/inventory_piece.rs 列名逐字符同源）：NULL 就是"未补录"，
                // 不得在此 map_or(Decimal::ZERO) 或 unwrap_or_default 把缺值洗成 0，
                // 否则前端会误判"该匹可打标签"，与 print_service 的 fail-closed 口径分裂。
                width: p.width,
                gram_weight: p.gram_weight,
                barcode: p.barcode,
                batch_no: p.batch_no,
                color_no: Some(p.color_no),
                product_id: p.product_id,
                warehouse_id: p.warehouse_id,
                warehouse_name: w.map(|w| w.name.clone()),
                warehouse_type: w.and_then(|w| w.warehouse_type.clone()),
                parent_piece_id: p.parent_piece_id,
                // 回指验布单：列原值直传，打卷产匹是验布记录 id，其余来源匹是 null，
                // 不 map 不 unwrap_or_default（省略该键会让调用方拿到 undefined 而非 null）
                inspection_id: p.inspection_id,
                piece_seq: p.piece_seq,
                status: p.status,
                quality_status: p.quality_status,
                created_at: p.created_at,
            }
        })
        .collect();

    Ok(Json(ApiResponse::success(PaginatedResponse::new(
        items, total, page, page_size,
    ))))
}

// ============================================================================
// 匹级聚合追溯
// ============================================================================

/// 匹级聚合追溯响应：匹详情 + 来源验布单 + 物理测试 + 疵点 + 质检判定。
///
/// 各集合直接序列化实体 Model（出参键 = 实体列名 snake_case），不投影改名、
/// 不拼造假名；查询为固定次数的明确查询（匹 1 次、验布单 ≤1 次、物理测试/疵点/
/// 质检判定各 1 次），无逐行再查。匹无验布来源（生产报工/委外回仓产匹）时
/// inspection 为 null 且三个验布侧集合为空——这是真实语义，不是缺键兜底；
/// 而 inspection_id 有值但验布单查不到属于锚链损坏，fail-fast 404 点名。
#[derive(Debug, serde::Serialize)]
pub struct PieceTraceResponse {
    pub piece: inventory_piece::Model,
    pub inspection: Option<fabric_inspection_record::Model>,
    pub physical_tests: Vec<fabric_physical_test_record::Model>,
    pub defects: Vec<fabric_defect_record::Model>,
    pub quality_records: Vec<quality_inspection_record::Model>,
}

/// GET /api/v1/erp/inventory/pieces/:id/trace - 匹级聚合追溯
pub async fn get_piece_trace(
    State(state): State<AppState>,
    Path(piece_id): Path<i32>,
) -> Result<Json<ApiResponse<PieceTraceResponse>>, AppError> {
    let piece = inventory_piece::Entity::find_by_id(piece_id)
        .one(state.db.as_ref())
        .await?
        .ok_or_else(|| AppError::not_found(format!("匹不存在：{}", piece_id)))?;

    let inspection = match piece.inspection_id {
        Some(inspection_id) => Some(
            fabric_inspection_record::Entity::find_by_id(inspection_id)
                .one(state.db.as_ref())
                .await?
                .ok_or_else(|| {
                    AppError::not_found(format!(
                        "匹 {} 回指的验布单不存在：{}",
                        piece.piece_no, inspection_id
                    ))
                })?,
        ),
        None => None,
    };

    // 验布侧三个集合按匹回指的验布单拉取；无来源匹集合为空（真实语义）
    let physical_tests = match &inspection {
        Some(insp) => {
            fabric_physical_test_record::Entity::find()
                .filter(fabric_physical_test_record::Column::InspectionId.eq(insp.id))
                .order_by_asc(fabric_physical_test_record::Column::Id)
                .all(state.db.as_ref())
                .await?
        }
        None => Vec::new(),
    };
    let defects = match &inspection {
        Some(insp) => {
            fabric_defect_record::Entity::find()
                .filter(fabric_defect_record::Column::InspectionId.eq(insp.id))
                .order_by_asc(fabric_defect_record::Column::Id)
                .all(state.db.as_ref())
                .await?
        }
        None => Vec::new(),
    };

    // 质检判定按多态锚拉取：related_type=INVENTORY_PIECE + related_id=匹主键
    let quality_records = quality_inspection_record::Entity::find()
        .filter(
            quality_inspection_record::Column::RelatedType
                .eq(crate::services::quality_inspection_service::RELATED_TYPE_INVENTORY_PIECE),
        )
        .filter(quality_inspection_record::Column::RelatedId.eq(piece.id))
        .order_by_asc(quality_inspection_record::Column::Id)
        .all(state.db.as_ref())
        .await?;

    Ok(Json(ApiResponse::success(PieceTraceResponse {
        piece,
        inspection,
        physical_tests,
        defects,
        quality_records,
    })))
}
