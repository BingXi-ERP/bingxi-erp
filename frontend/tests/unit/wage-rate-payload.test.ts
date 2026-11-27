import { describe, expect, it } from 'vitest';
import {
  buildCreateWageRatePayload,
  buildUpdateWageRatePayload,
  canActivateWageRate,
  canDeleteWageRate,
  canDisableWageRate,
  canEditWageRate,
  type WageRateFormValues,
} from '@/utils/wage-rate';
import {
  canCalculateWageRecord,
  canCancelWageRecord,
  canConfirmWageRecord,
  canDeleteWageRecord,
  canEditWageRecord,
  canPayWageRecord,
} from '@/utils/wage-record';

const form: WageRateFormValues = {
  process_route_id: 12,
  wage_type: 'mixed',
  piece_price: 1.25,
  time_price: 0.08,
  grade_a_ratio: 1,
  grade_b_ratio: 0.8,
  grade_c_ratio: 0,
  effective_date: '2026-11-26',
  expiry_date: '2026-12-31',
  workshop: '染整车间',
  remarks: '标准工价',
};

describe('工资费率载荷映射', () => {
  it('创建载荷只包含后端 DTO 字段并保留显式单价与日期', () => {
    expect(buildCreateWageRatePayload(form)).toEqual({
      process_route_id: 12,
      wage_type: 'mixed',
      piece_price: 1.25,
      time_price: 0.08,
      grade_a_ratio: 1,
      grade_b_ratio: 0.8,
      grade_c_ratio: 0,
      effective_date: '2026-11-26',
      expiry_date: '2026-12-31',
      workshop: '染整车间',
      remarks: '标准工价',
    });
  });

  it('创建载荷省略空白可选文本，不把状态或冗余名称发给后端', () => {
    expect(
      buildCreateWageRatePayload({
        ...form,
        expiry_date: '',
        workshop: '',
        remarks: '',
      })
    ).toEqual({
      process_route_id: 12,
      wage_type: 'mixed',
      piece_price: 1.25,
      time_price: 0.08,
      grade_a_ratio: 1,
      grade_b_ratio: 0.8,
      grade_c_ratio: 0,
      effective_date: '2026-11-26',
    });
  });

  it('更新载荷排除工序路线与状态，仅发送可编辑字段', () => {
    expect(buildUpdateWageRatePayload(form)).toEqual({
      wage_type: 'mixed',
      piece_price: 1.25,
      time_price: 0.08,
      grade_a_ratio: 1,
      grade_b_ratio: 0.8,
      grade_c_ratio: 0,
      effective_date: '2026-11-26',
      expiry_date: '2026-12-31',
      workshop: '染整车间',
      remarks: '标准工价',
    });
  });
});

describe('工资费率状态门', () => {
  it('仅草稿可编辑、删除或启用，仅启用可停用', () => {
    expect(canEditWageRate('draft')).toBe(true);
    expect(canDeleteWageRate('draft')).toBe(true);
    expect(canDeleteWageRate('active')).toBe(false);
    expect(canDeleteWageRate('disabled')).toBe(false);
    expect(canEditWageRate('active')).toBe(false);
    expect(canEditWageRate('disabled')).toBe(false);
    expect(canActivateWageRate('draft')).toBe(true);
    expect(canActivateWageRate('active')).toBe(false);
    expect(canActivateWageRate('disabled')).toBe(false);
    expect(canDisableWageRate('active')).toBe(true);
    expect(canDisableWageRate('draft')).toBe(false);
    expect(canDisableWageRate('disabled')).toBe(false);
  });
});

describe('工资记录状态门', () => {
  it('草稿可核算、确认、取消、编辑和删除，已确认可发放和取消', () => {
    expect(canCalculateWageRecord('draft')).toBe(true);
    expect(canConfirmWageRecord('draft')).toBe(true);
    expect(canCancelWageRecord('draft')).toBe(true);
    expect(canEditWageRecord('draft')).toBe(true);
    expect(canDeleteWageRecord('draft')).toBe(true);
    expect(canPayWageRecord('confirmed')).toBe(true);
    expect(canCancelWageRecord('confirmed')).toBe(true);
  });

  it('核算不产生 calculated 状态，终态不暴露非法流转', () => {
    expect(canCalculateWageRecord('confirmed')).toBe(false);
    expect(canConfirmWageRecord('confirmed')).toBe(false);
    expect(canPayWageRecord('draft')).toBe(false);
    expect(canCancelWageRecord('paid')).toBe(false);
    expect(canCancelWageRecord('cancelled')).toBe(false);
    expect(canEditWageRecord('confirmed')).toBe(false);
    expect(canDeleteWageRecord('confirmed')).toBe(false);
  });
});
