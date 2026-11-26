import { describe, expect, it } from 'vitest';
import { readAccountSubjectList } from '@/utils/account-subject-list';
import type { AccountSubjectEntity } from '@/api/account-subject';

const subject = {
  id: 1,
  code: '1001',
  name: '库存现金',
  level: 1,
  initial_balance_debit: '0.00',
  initial_balance_credit: '0.00',
  current_period_debit: '0.00',
  current_period_credit: '0.00',
  ending_balance_debit: '0.00',
  ending_balance_credit: '0.00',
  assist_customer: false,
  assist_supplier: false,
  assist_department: false,
  assist_employee: false,
  assist_project: false,
  assist_batch: false,
  assist_color_no: false,
  assist_dye_lot: false,
  assist_grade: false,
  assist_workshop: false,
  enable_dual_unit: false,
  is_cash_account: true,
  is_bank_account: false,
  allow_manual_entry: true,
  require_summary: false,
  status: 'active',
  created_at: '2026-11-27T00:00:00Z',
  updated_at: '2026-11-27T00:00:00Z',
} satisfies AccountSubjectEntity;

describe('会计科目列表真实契约', () => {
  it('GET /subjects 的 data 裸数组原样返回', () => {
    expect(readAccountSubjectList({ data: [subject] })).toEqual([subject]);
  });

  it('data 不是数组时显式失败，不试探 items/data/list 多键', () => {
    expect(() => readAccountSubjectList({ data: { items: [subject] } })).toThrow(
      '会计科目列表响应 data 必须为数组'
    );
    expect(() => readAccountSubjectList({})).toThrow('会计科目列表响应 data 必须为数组');
  });
});
