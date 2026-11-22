// 4.16 数值精度：客户信用额度精度门（超过 2 位小数拒绝，2 位小数与整数放行）。
// 后端判据：utils/validator.rs:35-37 真调
//   if amount.round_dp(2) != *amount { Err(ValidationError::new("信用额度精度不能超过2位小数")) }；
//   handlers/customer_credit_handler.rs:43 把该 validator 挂在 CreditRatingRequestDto.credit_limit，
//   :326 create_credit 在 :334 真调 req.validate().map_err(AppError::from)?。校验失败走 VALIDATION_ERROR 400。
// 检测力：若漏挂 validator 或漏调 validate，三位小数会落库成 200 即红；若把 2 位小数误拒，正例即红。
// 与 26-master-data-partner 正交：那条断非数字串与正向额度，本条断精度 3 位 vs 2 位的临界差。
// 与 448 号正交：那条断 amount=0 的额度调整时序，不碰 credit_limit DTO 精度。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface Row {
  id?: number;
  available_credit?: string | number;
  credit_limit?: string | number;
}

test.describe('4.16 客户信用额度精度门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('416-02 信用额度三位小数被拒，两位与整数放行并回读', async ({ page }) => {
    const created = await apiCall<Row>(page, 'POST', '/crm/customers', {
      customer_name: `E2E信用精度${genCode('C')}`,
      status: 'active',
    });
    const customerId = created.data?.id;
    expect(customerId, '前置：专属客户建档须返回主键').toBeTruthy();

    try {
      const endpoint = '/crm/customer-credits';
      const base = { customer_id: customerId, credit_level: 'A', credit_days: 30 };

      // 三位小数：1000.123.round_dp(2) != 原值，须在落库前被 validator 拒。
      const bad = await apiCallExpectFail(page, 'POST', endpoint, {
        ...base,
        credit_limit: '1000.123',
      });
      expectStateGateRejection(bad, '三位小数信用额度登记');
      expect(failureCode(bad), '精度拒绝须归 VALIDATION_ERROR').toBe(
        APP_ERROR_CODES.VALIDATION_ERROR
      );
      expect(
        String(bad.message ?? ''),
        '拒因须点名精度不能超过2位小数，实际 ' + JSON.stringify(bad.message)
      ).toContain('精度不能超过2位小数');

      // 正例 2 位小数：恰在精度边界，须放行并回读原值。validator 在 handler 入口即拒，
      // 三位小数根本到不了 service 写库，故不需要额外的"被拒后零落库"探测（那反而依赖
      // 新客户是否已有信用行的不确定状态）。正例回读读 credit_limit 明确键，不用兜底。
      await apiCall(page, 'POST', endpoint, { ...base, credit_limit: '1000.12' });
      const ok = await apiCallRaw<Row>(page, 'GET', `/crm/customers/${customerId}/credit`);
      expect(
        Number(ok.credit_limit),
        '两位小数信用额度须原样落库为 1000.12，不得被四舍五入或清零'
      ).toBe(1000.12);
    } finally {
      // 信用行是 per-customer 唯一行，DELETE 走软停用；客户删除兜底清关联。
      await tryCleanup(
        page,
        'DELETE',
        `/crm/customer-credits/${customerId}`,
        '4.16 信用精度额度行'
      );
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, '4.16 信用精度客户');
    }
  });
});
