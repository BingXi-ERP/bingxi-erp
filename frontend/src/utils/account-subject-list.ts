import type { AccountSubjectEntity } from '@/api/account-subject';

export function readAccountSubjectList(payload: { data?: unknown }): AccountSubjectEntity[] {
  if (!Array.isArray(payload.data)) {
    throw new Error('会计科目列表响应 data 必须为数组');
  }
  return payload.data as AccountSubjectEntity[];
}
