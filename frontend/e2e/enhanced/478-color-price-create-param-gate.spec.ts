// 4.14 筛选参数门 + 4.25 错误码：色号价格新建的五道业务参数校验边界门。
// 后端判据：services/color_price_crud_service.rs:65-69 create 在 insert 前依次校验
//   validate_currency / validate_season / validate_customer_level /
//   validate_quantity_range / validate_date_range；
//   :246-250 币种走 services/currency_service.rs:442-457 的 ISO 4217 三字母大写白名单（ZZZ 不在内）；
//   :254-263 季节只允许 SS/AW/HOLIDAY；:265-273 客户等级走 constants/customer_tier 大写词表；
//   :276-286 min_quantity 必须小于 max_quantity；:290-300 effective_from 必须早于 effective_to；
//   五者一律 CrudError::Validation，经 handlers/color_price_handler.rs:55 crud_err 转
//   AppError::validation_displayable（400 + VALIDATION_ERROR，文案点名字段与范围）。
// 关键判据：校验全在 :72 insert 主表之前，故用不存在的 product_id/color_id 即可触发，
//   无需真实面料与色号造数；五条变体各只改一个字段，互不串扰。
// 与既有覆盖分工：115/116 色彩价链路只测正向建改，451/455 测阶梯价与折扣审批，
//   均无这五道参数门的 400 + VALIDATION_ERROR 断言；本例为零造数纯参数门。
import { test, expect } from '../diagnose-fixture';
import { APP_ERROR_CODES, apiCallExpectFail, failureCode, loginViaUI } from '../flow/helpers';

const PATH = '/color-prices';
const base = {
  product_id: 999999,
  color_id: 999999,
  currency: 'CNY',
  base_price: '10.00',
  effective_from: '2026-01-01',
};

async function reject(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
  field: string,
  reason: string
) {
  const r = await apiCallExpectFail(page, 'POST', PATH, body);
  expect(r.status, `[478] ${field} 越界须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[478] ${field} 机器码须 VALIDATION_ERROR，实际=${failureCode(r)}`).toBe(
    APP_ERROR_CODES.VALIDATION_ERROR
  );
  expect(r.message ?? '', `[478] ${field} 拒因须点名 ${reason}`).toContain(reason);
}

test.describe('4.14 色号价格新建参数门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('478-01 五道参数越界恰 400/VALIDATION_ERROR 且文案点名字段', async ({ page }) => {
    await reject(page, { ...base, currency: 'ZZZ' }, 'currency', '无效的币种');
    await reject(page, { ...base, season: 'SPRING' }, 'season', '无效的季节');
    await reject(page, { ...base, customer_level: 'vip' }, 'customer_level', '无效的客户等级');
    await reject(
      page,
      { ...base, min_quantity: '100', max_quantity: '50' },
      'quantity_range',
      'min_quantity 必须小于 max_quantity'
    );
    await reject(
      page,
      { ...base, effective_from: '2026-06-01', effective_to: '2026-01-01' },
      'date_range',
      'effective_from 必须早于 effective_to'
    );
  });
});
