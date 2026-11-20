// 4.14 筛选参数门 + 4.25 错误码：销售价目列表 status 筛选只认词表白名单 pending/approved/rejected，
//   越界（含采购侧 inactive、大小写、超长、特殊字符）恰 400 + VALIDATION_ERROR，
//   合法值与空串/纯空白放行。
// 后端判据：handlers/sales_price_handler.rs:29-36 SalesPriceQuery.status；
//   :63-68 SALES_PRICE_STATUS_FILTER_ALLOWED=[PENDING, APPROVED, REJECTED]（采购侧 inactive 不在内）；
//   :74-84 validate_sales_price_status_param：trim 后空串放行，白名单外
//   AppError::validation_displayable("销售价格状态筛选值 {value} 不是合法取值，允许值：pending/approved/rejected")；
//   models/status/sales.rs:214-221 price_approval 词表值逐字小写；
//   list_prices 入参首行即校验该门，越界请求不触达 service。
// 与既有覆盖分工：flow/27 仅健康探针、44e 仅建/审批、451 阶梯价、507 审批写面；
//   均无 status 越界 400 与白名单允许值断言；本例为零造数纯参数门。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

const ALLOWED = 'pending/approved/rejected';

test.describe('4.14 销售价目 status 筛选白名单门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('467-01 采购侧 inactive 与越界状态恰 400/VALIDATION_ERROR 且点名允许值', async ({
    page,
  }) => {
    const illegal = ['inactive', 'APPROVED', 'draft', 'pending ', `${'x'.repeat(80)}`, 'pe%nding'];
    for (const value of illegal) {
      const result = await apiCallExpectFail(
        page,
        'GET',
        `/sales/sales-prices?status=${encodeURIComponent(value)}`
      );
      expect(
        result.status,
        `[467] status=${JSON.stringify(value)} 须被 400 拒绝，实际 status=${result.status}`
      ).toBe(400);
      expect(
        failureCode(result),
        `[467] status=${JSON.stringify(value)} 机器码须 VALIDATION_ERROR，实际=${failureCode(result)}`
      ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      expect(
        result.message ?? '',
        `[467] status=${JSON.stringify(value)} 文案须点名允许值，实际=${result.message ?? '(none)'}`
      ).toContain(ALLOWED);
    }
  });

  test('467-02 三个合法状态与空串/纯空白放行（200，出参为数组）', async ({ page }) => {
    for (const value of ['pending', 'approved', 'rejected', '', '   ']) {
      const rows = await apiCallRaw<unknown[]>(
        page,
        'GET',
        `/sales/sales-prices?status=${encodeURIComponent(value)}`
      );
      expect(
        Array.isArray(rows),
        `[467] status=${JSON.stringify(value)} 须放行且出参为数组，实际=${JSON.stringify(rows)}`
      ).toBe(true);
    }
  });
});
