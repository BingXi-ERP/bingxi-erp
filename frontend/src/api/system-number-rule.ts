import { request } from './request';
import type { ApiResponse, PaginatedResponse } from '@/types/api-response';

export type NumberRuleResetMode = 'day' | 'month' | 'never';

export interface NumberRuleConfig {
  prefix: string;
  seq_width: number;
  reset_mode: NumberRuleResetMode;
}

export interface NumberRule extends NumberRuleConfig {
  id: number;
  rule_key: string;
  name: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface NumberRuleRevision {
  id: number;
  rule_id: number;
  version: number;
  config: NumberRuleConfig;
  change_reason: string;
  changed_by: number;
  created_at: string;
}

export interface NumberRuleDetail {
  rule: NumberRule;
  revisions: NumberRuleRevision[];
}

export interface UpdateNumberRulePayload extends NumberRuleConfig {
  version: number;
  change_reason: string;
}

export interface RollbackNumberRulePayload {
  revision_id: number;
  version: number;
  change_reason: string;
}

export function getNumberRules(params: { page: number; page_size: number }) {
  return request.get<ApiResponse<PaginatedResponse<NumberRule>>>('/system/number-rules', {
    params,
  });
}

export function getNumberRule(id: number) {
  return request.get<ApiResponse<NumberRuleDetail>>(`/system/number-rules/${id}`);
}

export function updateNumberRule(id: number, data: UpdateNumberRulePayload) {
  return request.put<ApiResponse<NumberRuleDetail>>(`/system/number-rules/${id}`, data);
}

export function rollbackNumberRule(id: number, data: RollbackNumberRulePayload) {
  return request.post<ApiResponse<NumberRuleDetail>>(`/system/number-rules/${id}/rollback`, data);
}
