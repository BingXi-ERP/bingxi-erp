import { request } from './request';
import type { ApiResponse, PaginatedResponse } from '@/types/api';

export type WageRateStatus = 'draft' | 'active' | 'disabled';
export type WageType = 'piece' | 'time' | 'mixed';
export type WageRecordStatus = 'draft' | 'confirmed' | 'paid' | 'cancelled';

export interface WageRate {
  id: number;
  rate_no: string;
  process_route_id: number;
  route_code: string;
  route_name: string;
  wage_type: WageType;
  piece_price: string;
  time_price: string;
  grade_a_ratio: string;
  grade_b_ratio: string;
  grade_c_ratio: string;
  effective_date: string;
  expiry_date: string | null;
  workshop: string | null;
  status: WageRateStatus;
  remarks: string | null;
  is_deleted: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface WageRateQuery {
  page?: number;
  page_size?: number;
  route_code?: string;
  process_route_id?: number;
  workshop?: string;
  status?: WageRateStatus;
}

export interface WageRecord {
  id: number;
  status: WageRecordStatus;
  [key: string]: unknown;
}

export interface CreateWageRatePayload {
  process_route_id: number;
  wage_type?: WageType;
  piece_price?: number;
  time_price?: number;
  grade_a_ratio?: number;
  grade_b_ratio?: number;
  grade_c_ratio?: number;
  effective_date: string;
  expiry_date?: string;
  workshop?: string;
  remarks?: string;
}

export type UpdateWageRatePayload = Partial<Omit<CreateWageRatePayload, 'process_route_id'>>;

export function getWageRateList(
  params?: WageRateQuery
): Promise<ApiResponse<PaginatedResponse<WageRate>>> {
  return request.get('/production/wage-rates', { params });
}

export function createWageRate(data: CreateWageRatePayload): Promise<ApiResponse<WageRate>> {
  return request.post('/production/wage-rates', data);
}

export function updateWageRate(
  id: number,
  data: UpdateWageRatePayload
): Promise<ApiResponse<WageRate>> {
  return request.put(`/production/wage-rates/${id}`, data);
}

export function deleteWageRate(id: number): Promise<ApiResponse<void>> {
  return request.delete(`/production/wage-rates/${id}`);
}

export function activateWageRate(id: number): Promise<ApiResponse<WageRate>> {
  return request.post(`/production/wage-rates/${id}/activate`);
}

export function disableWageRate(id: number): Promise<ApiResponse<WageRate>> {
  return request.post(`/production/wage-rates/${id}/disable`);
}

export function getEffectiveWageRate(
  routeId: number,
  date: string
): Promise<ApiResponse<WageRate | null>> {
  const onDate = new Date(`${date}T00:00:00.000Z`).toISOString();
  return request.get(`/production/wage-rates/effective/${routeId}`, {
    params: { on_date: onDate },
  });
}

export interface CreateWageRecordPayload {
  period_start: string;
  period_end: string;
  workshop?: string;
  remarks?: string;
}

export function getWageRecordList(params?: Record<string, unknown>) {
  return request.get('/production/wage-records', { params });
}

export function createWageRecord(data: CreateWageRecordPayload) {
  return request.post('/production/wage-records', data);
}

export function updateWageRecord(id: number, data: { workshop?: string; remarks?: string }) {
  return request.put(`/production/wage-records/${id}`, data);
}

export function deleteWageRecord(id: number) {
  return request.delete(`/production/wage-records/${id}`);
}

export function calculateWageRecord(id: number, data?: Record<string, unknown>) {
  return request.post(`/production/wage-records/${id}/calculate`, data ?? {});
}

export function confirmWageRecord(id: number) {
  return request.post(`/production/wage-records/${id}/confirm`);
}

export function payWageRecord(id: number) {
  return request.post(`/production/wage-records/${id}/pay`);
}

export function cancelWageRecord(id: number) {
  return request.post(`/production/wage-records/${id}/cancel`);
}

export function getWageRecordDetails(id: number) {
  return request.get(`/production/wage-records/${id}/details`);
}

export function exportWageRecordDetails(id: number) {
  return request.get(`/production/wage-records/${id}/details/export`, { responseType: 'blob' });
}

export function getWageDetailsByWorker(workerId: number) {
  return request.get(`/production/wage-details/by-worker/${workerId}`);
}
