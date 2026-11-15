import { request } from './request';
import type { ApiResponse, PaginatedResponse } from '@/types/api';

/**
 * 流转卡（production_flow_card）状态
 * 后端状态机：pending→scheduled→preparing→dyeing→dyed→inspecting→completed→shipped；terminated 为异常终止
 */
export type FlowCardStatus =
  | 'pending'
  | 'scheduled'
  | 'preparing'
  | 'dyeing'
  | 'dyed'
  | 'inspecting'
  | 'completed'
  | 'shipped'
  | 'terminated';

export interface FlowCard {
  id: number;
  card_no: string;
  barcode: string;
  production_order_id: number;
  dye_batch_id: number | null;
  dye_lot_no: string | null;
  process_route_id: number | null;
  customer_id: number | null;
  customer_name: string | null;
  order_no: string | null;
  product_id: number | null;
  product_name: string | null;
  color_no: string | null;
  dyeing_requirements: string | null;
  planned_fabric_weight: string | number | null;
  actual_fabric_weight: string | number | null;
  current_step_seq: number;
  status: FlowCardStatus;
  priority: number;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 创建流转卡请求（对齐后端 CreateFlowCardRequest，flow_card_dto.rs:44）。
 * production_order_id 必填：工艺卡必须挂在具体生产订单上；其余为可选。
 */
export interface CreateFlowCardPayload {
  production_order_id: number;
  dye_batch_id?: number;
  dye_lot_no?: string;
  process_route_id?: number;
  product_id?: number;
  product_name?: string;
  color_no?: string;
  dyeing_requirements?: string;
  planned_fabric_weight?: number;
  priority?: number;
  remarks?: string;
}

/**
 * 流转卡列表查询参数——严格对齐后端 flow_card_handler.rs::FlowCardListQuery。
 * 全部 Option 字段 → 可选；无 rename_all → 保持 snake_case。
 * 支持真实筛选：卡号 card_no、条码 barcode、缸号 dye_lot_no、生产订单、状态、客户。
 */
export interface FlowCardListQuery {
  page?: number;
  page_size?: number;
  card_no?: string;
  barcode?: string;
  dye_lot_no?: string;
  production_order_id?: number;
  status?: string;
  customer_id?: number;
}

export interface ScheduleFlowCardPayload {
  dye_batch_id?: number;
  dye_lot_no?: string;
}

/** 备布完成请求（对齐后端 CompletePreparingRequest，flow_card_handler.rs:239）：实际称重量 kg 必填 */
export interface CompletePreparingPayload {
  actual_fabric_weight: number;
}

export function getFlowCardList(
  params?: FlowCardListQuery
): Promise<ApiResponse<PaginatedResponse<FlowCard>>> {
  return request.get('/production/flow-cards', { params });
}

export function getFlowCard(id: number): Promise<ApiResponse<FlowCard>> {
  return request.get(`/production/flow-cards/${id}`);
}

export function createFlowCard(data: CreateFlowCardPayload): Promise<ApiResponse<FlowCard>> {
  return request.post('/production/flow-cards', data);
}

export function updateFlowCard(
  id: number,
  data: Partial<CreateFlowCardPayload>
): Promise<ApiResponse<FlowCard>> {
  return request.put(`/production/flow-cards/${id}`, data);
}

export function deleteFlowCard(id: number): Promise<ApiResponse<void>> {
  return request.delete(`/production/flow-cards/${id}`);
}

export function scheduleFlowCard(
  id: number,
  data?: ScheduleFlowCardPayload
): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/schedule`, data ?? {});
}

export function startPreparing(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/start-preparing`);
}

export function completePreparing(
  id: number,
  data: CompletePreparingPayload
): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/complete-preparing`, data);
}

export function startDyeing(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/start-dyeing`);
}

export function completeDyeing(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/complete-dyeing`);
}

export function startInspecting(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/start-inspecting`);
}

export function completeFlowCard(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/complete`);
}

export function shipFlowCard(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/ship`);
}

export function terminateFlowCard(
  id: number,
  data?: { reason?: string }
): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/terminate`, data ?? {});
}

export function reactivateFlowCard(id: number): Promise<ApiResponse<FlowCard>> {
  return request.post(`/production/flow-cards/${id}/reactivate`);
}

/**
 * 投纱明细行（写面出参）——逐字段对齐 backend/src/models/flow_card_material.rs 的 Model
 * （列表与单行读面的实体部分、以及 POST/PUT/DELETE 的回传体都是这一形状）。
 * 键名即后端 serde 序列化名（snake_case，无 rename_all）。
 * NOT NULL 列（id/flow_card_id/warehouse_id/material_id/batch_no/color_no/grade/quantity/
 * unit/is_deleted 与两侧时间戳）不许标可选或可空；可空列（dye_lot_no/remark/created_by）
 * 以 null 表达"库里没值"。
 * quantity 为 DECIMAL(14,4)，后端 rust_decimal 序列化为字符串（如 "12.5000"），
 * 与全站 DECIMAL 出参同一口径，消费前按 number-input 或 Number() 归一。
 */
export interface FlowCardMaterial {
  id: number;
  flow_card_id: number;
  warehouse_id: number;
  material_id: number;
  batch_no: string;
  color_no: string;
  dye_lot_no: string | null;
  grade: string;
  quantity: string | number;
  unit: string;
  remark: string | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * 投纱列表读面视图——对齐 backend/src/services/flow_card_material_service.rs 的
 * FlowCardMaterialView：实体字段加 LEFT JOIN products 带出的 material_no 与 material_name。
 * 两枚富化键在序列化结构里恒存在（无 skip_serializing_if），关联不到产品时为 null。
 */
export interface FlowCardMaterialView extends FlowCardMaterial {
  material_no: string | null;
  material_name: string | null;
}

/**
 * 新增投纱行入参——对齐 CreateFlowCardMaterialRequest。
 * flow_card_id/warehouse_id/material_id/quantity/unit 必填；
 * batch_no/color_no/grade 后端 #[serde(default)] 落空串，dye_lot_no/remark 可空。
 * quantity 以 JSON number 提交（rust_decimal 反序列化接受数值）。
 */
export interface CreateFlowCardMaterialPayload {
  flow_card_id: number;
  warehouse_id: number;
  material_id: number;
  batch_no?: string;
  color_no?: string;
  dye_lot_no?: string | null;
  grade?: string;
  quantity: number;
  unit: string;
  remark?: string | null;
}

/**
 * 修改投纱行入参——对齐 UpdateFlowCardMaterialRequest：整行覆盖语义，缺字段即按空值写入，
 * 不做部分字段合并；flow_card_id 不在本契约（行归属不可改）。
 */
export interface UpdateFlowCardMaterialPayload {
  warehouse_id: number;
  material_id: number;
  batch_no?: string;
  color_no?: string;
  dye_lot_no?: string | null;
  grade?: string;
  quantity: number;
  unit: string;
  remark?: string | null;
}

/**
 * GET /production/flow-cards/{flow_card_id}/materials —— 按卡列出投纱明细。
 * 信封为 ApiResponse.data 裸数组（handler 直接 ApiResponse::success(Vec<View>)，
 * 不带 PaginatedResponse 包装），与 backend/src/handlers/flow_card_material_handler.rs 一致。
 */
export function listFlowCardMaterials(
  flowCardId: number
): Promise<ApiResponse<FlowCardMaterialView[]>> {
  return request.get(`/production/flow-cards/${flowCardId}/materials`);
}

/** POST /production/flow-cards/materials —— 登记一条投纱（卡主键随请求体提交） */
export function createFlowCardMaterial(
  data: CreateFlowCardMaterialPayload
): Promise<ApiResponse<FlowCardMaterial>> {
  return request.post('/production/flow-cards/materials', data);
}

/** GET /production/flow-cards/materials/{id} —— 读取单条投纱 */
export function getFlowCardMaterial(id: number): Promise<ApiResponse<FlowCardMaterial>> {
  return request.get(`/production/flow-cards/materials/${id}`);
}

/** PUT /production/flow-cards/materials/{id} —— 整行覆盖修改单条投纱 */
export function updateFlowCardMaterial(
  id: number,
  data: UpdateFlowCardMaterialPayload
): Promise<ApiResponse<FlowCardMaterial>> {
  return request.put(`/production/flow-cards/materials/${id}`, data);
}

/** DELETE /production/flow-cards/materials/{id} —— 作废单条投纱（后端软删并回传作废后的行） */
export function deleteFlowCardMaterial(id: number): Promise<ApiResponse<FlowCardMaterial>> {
  return request.delete(`/production/flow-cards/materials/${id}`);
}
