// 4.3 单据状态机 + 4.25 错误码：期末调整红字冲销的合法流转与非法跳转门。
// 后端判据：services/period_adjustment_service.rs:37-42 period_adjustment_status 四值小写
//   draft/confirmed/reversed/cancelled；
//   :186 confirm 仅 draft 可确认，否则 AppError::business("仅草稿(draft)状态可确认...")；
//   :219 reverse 仅 confirmed 可冲销，否则 AppError::business("仅已确认(confirmed)状态可冲销...")；
//   :231 reverse 成功置 reversed 并写 reversed_by/reversed_at/reverse_voucher_id；
//   utils/error.rs AppError::business → 400 + BUSINESS_ERROR，message 为脱敏常量（不点名字段），
//   故失败腿只断言 HTTP 码与机器码，真实拒因只在成功腿以状态不漂移反证。
// 与既有覆盖分工：flow/25 仅 health 探针、flow/46 仅页面可达、14-asset-tax 是 bad-debts reverse
//   不同域；本例专补期末调整 draft→confirmed→reversed 正向链与两处非法跳转零覆盖点。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
} from '../flow/helpers';

interface Adj {
  id?: number;
  status?: string;
  confirmed_by?: number | null;
  confirmed_at?: string | null;
  reversed_by?: number | null;
  reversed_at?: string | null;
  reverse_voucher_id?: number | null;
}

const base = {
  adjustment_type: 'estimate',
  period: '2026-11',
  debit_subject_code: '5001',
  debit_subject_name: '生产成本',
  credit_subject_code: '2202',
  credit_subject_name: '应付账款',
  amount: '100.00',
};

async function rejectBusiness(
  page: import('@playwright/test').Page,
  method: 'POST' | 'GET',
  path: string,
  tag: string
) {
  const r = await apiCallExpectFail(page, method, path);
  expect(r.status, `[483] ${tag} 须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[483] ${tag} 机器码须 BUSINESS_ERROR，实际=${failureCode(r)}`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
}

test.describe('4.3 期末调整红冲状态机', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('483-01 draft→confirmed→reversed 正向流转，非法跳转恰 400/BUSINESS_ERROR', async ({
    page,
  }) => {
    const created = await apiCallRaw<Adj>(page, 'POST', '/period-adjustments', {
      ...base,
      description: `483红冲状态机_${genCode('E483')}`,
    });
    const id = Number(created.id);
    expect(id, `[483] 建单须回真实主键：${JSON.stringify(created)}`).toBeGreaterThan(0);
    expect(created.status, '[483] 建单初态须 draft').toBe('draft');

    // draft 直接红冲须被拒，且状态不漂移。
    await rejectBusiness(page, 'POST', `/period-adjustments/${id}/reverse`, 'draft直接红冲');
    const afterDraftReject = await apiCallRaw<Adj>(page, 'GET', `/period-adjustments/${id}`);
    expect(afterDraftReject.status, '[483] draft 红冲被拒后状态须仍为 draft').toBe('draft');

    const confirmed = await apiCallRaw<Adj>(page, 'POST', `/period-adjustments/${id}/confirm`);
    expect(confirmed.status, '[483] 确认后状态须 confirmed').toBe('confirmed');
    expect(confirmed.confirmed_by, '[483] 确认后须写 confirmed_by').toBeGreaterThan(0);
    expect(confirmed.confirmed_at, '[483] 确认后须写 confirmed_at').toBeTruthy();

    // confirmed 重复确认须被拒。
    await rejectBusiness(page, 'POST', `/period-adjustments/${id}/confirm`, '重复确认');

    const reversed = await apiCallRaw<Adj>(page, 'POST', `/period-adjustments/${id}/reverse`);
    expect(reversed.status, '[483] 红冲后状态须 reversed').toBe('reversed');
    expect(reversed.reversed_by, '[483] 红冲后须写 reversed_by').toBeGreaterThan(0);
    expect(reversed.reversed_at, '[483] 红冲后须写 reversed_at').toBeTruthy();

    // reversed 再红冲须被拒，且状态不漂移。
    await rejectBusiness(page, 'POST', `/period-adjustments/${id}/reverse`, 'reversed再红冲');
    const afterReverseReject = await apiCallRaw<Adj>(page, 'GET', `/period-adjustments/${id}`);
    expect(afterReverseReject.status, '[483] reversed 再红冲被拒后状态须仍为 reversed').toBe(
      'reversed'
    );
  });
});
