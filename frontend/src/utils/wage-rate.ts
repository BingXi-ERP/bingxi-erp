import type { CreateWageRatePayload, UpdateWageRatePayload, WageRateStatus } from '@/api/wage';

export type WageType = 'piece' | 'time' | 'mixed';

export interface WageRateFormValues {
  process_route_id: number;
  wage_type: WageType;
  piece_price: number;
  time_price: number;
  grade_a_ratio: number;
  grade_b_ratio: number;
  grade_c_ratio: number;
  effective_date: string;
  expiry_date: string;
  workshop: string;
  remarks: string;
}

function commonPayload(form: WageRateFormValues) {
  return {
    wage_type: form.wage_type,
    piece_price: form.piece_price,
    time_price: form.time_price,
    grade_a_ratio: form.grade_a_ratio,
    grade_b_ratio: form.grade_b_ratio,
    grade_c_ratio: form.grade_c_ratio,
    effective_date: form.effective_date,
    ...(form.expiry_date ? { expiry_date: form.expiry_date } : {}),
    ...(form.workshop ? { workshop: form.workshop } : {}),
    ...(form.remarks ? { remarks: form.remarks } : {}),
  };
}

export function buildCreateWageRatePayload(form: WageRateFormValues): CreateWageRatePayload {
  return {
    process_route_id: form.process_route_id,
    ...commonPayload(form),
  };
}

export function buildUpdateWageRatePayload(form: WageRateFormValues): UpdateWageRatePayload {
  return commonPayload(form);
}

export function canEditWageRate(status: WageRateStatus): boolean {
  return status === 'draft';
}

export function canDeleteWageRate(status: WageRateStatus): boolean {
  return status === 'draft';
}

export function canActivateWageRate(status: WageRateStatus): boolean {
  return status === 'draft';
}

export function canDisableWageRate(status: WageRateStatus): boolean {
  return status === 'active';
}
