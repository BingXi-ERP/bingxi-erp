/**
 * 流转卡投纱计量单位（flow_card_materials.unit）取值清单。
 *
 * 功能：给投纱明细表单的单位下拉提供受控候选，值即落库真相（ASCII 小写 token）。
 * 调用方：views/flow-cards/index.vue 的投纱面板表单；提交值由本表消费，禁止在页面里另写一套。
 * 入参：无（纯常量）。
 * 传给谁：CreateFlowCardMaterialRequest / UpdateFlowCardMaterialRequest 的 unit 键，
 *        由后端 validate_unit 逐字符判定，取值域超出即 422。
 * 存什么：不存储，只固化 kg 与 m 两值。
 * 存哪里：无。
 *
 * 唯一事实来源是 backend/src/models/flow_card_material.rs 的 UNIT_KG 与 UNIT_METER：
 * 投纱量要么按公斤要么按米，与库存行的公斤列与米数列一一对应，其它单位后端显式拒绝，
 * 不做任何换算或等比折算。
 * 注意与 constants/quotation-unit.ts 分属两套取值域：那边是产品交易单位的中文 token
 * （米/公斤/…），本表是投纱与委外发料同口径的 ASCII 双值，禁止互相 import 或做并集。
 */
export const MATERIAL_UNIT = {
  kilogram: 'kg',
  meter: 'm',
} as const;

export type MaterialUnitValue = (typeof MATERIAL_UNIT)[keyof typeof MATERIAL_UNIT];

/** 全部单位候选，value 即落库 token，label 走 i18n */
export const MATERIAL_UNIT_VALUES: MaterialUnitValue[] = [
  MATERIAL_UNIT.kilogram,
  MATERIAL_UNIT.meter,
];

/** 单位 → i18n 文案键（完整键路径，check-i18n 校验其存在） */
export const MATERIAL_UNIT_LABEL_KEY: Record<MaterialUnitValue, string> = {
  [MATERIAL_UNIT.kilogram]: 'flowCards.materials.unitKg',
  [MATERIAL_UNIT.meter]: 'flowCards.materials.unitMeter',
};

/** 词表外的单位值原样展示、不猜测含义（读面兜底判定用，写面候选只出本表两值） */
export const isMaterialUnit = (value: string): value is MaterialUnitValue =>
  MATERIAL_UNIT_VALUES.includes(value as MaterialUnitValue);
