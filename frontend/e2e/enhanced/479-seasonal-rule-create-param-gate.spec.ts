// 4.14 参数门 + 4.25 错误码：季节调价规则新建的三道业务参数校验边界门。
// 后端判据：services/color_price_seasonal_service.rs:91-93 create 在 insert 前依次校验
//   validate_season / validate_adjustment_type / validate_date_range；
//   :185-193 季节只允许 SS/AW/HOLIDAY；:195-203 调整方式只允许 percentage/fixed；
//   :205-214 valid_from 不得晚于 valid_until；
//   三者一律 SeasonalError::Validation，经 handlers/color_price_handler.rs:84-91 seasonal_err 转
//   AppError::validation_displayable（400 + VALIDATION_ERROR，文案点名字段与允许值）。
// 关键判据：校验全在 insert 之前，rule_name/数值均取合法值，故零造数即可触发；
//   三条变体各只改一个字段，互不串扰。
// 与既有覆盖分工：116 季节价链路只测正向建改，478 测色号价 create 五门，
//   均无季节规则这三门的 400 + VALIDATION_ERROR 断言；本例为零造数纯参数门。
import { test, expect } from '../diagnose-fixture';
import { APP_ERROR_CODES, apiCallExpectFail, failureCode, loginViaUI } from '../flow/helpers';

const PATH = '/color-prices/seasonal-rules';
const base = {
  rule_name: '479季节规则参数门',
  season: 'SS',
  adjustment_type: 'percentage',
  adjustment_value: '10.00',
  valid_from: '2026-01-01',
};

async function reject(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
  field: string,
  reason: string
) {
  const r = await apiCallExpectFail(page, 'POST', PATH, body);
  expect(r.status, `[479] ${field} 越界须 400，实际 ${r.status}`).toBe(400);
  expect(failureCode(r), `[479] ${field} 机器码须 VALIDATION_ERROR，实际=${failureCode(r)}`).toBe(
    APP_ERROR_CODES.VALIDATION_ERROR
  );
  expect(r.message ?? '', `[479] ${field} 拒因须点名 ${reason}`).toContain(reason);
}

test.describe('4.14 季节调价规则新建参数门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('479-01 三道参数越界恰 400/VALIDATION_ERROR 且文案点名字段', async ({ page }) => {
    await reject(page, { ...base, season: 'SPRING' }, 'season', '无效的季节');
    await reject(
      page,
      { ...base, adjustment_type: 'multiplier' },
      'adjustment_type',
      '无效的调整方式'
    );
    await reject(
      page,
      { ...base, valid_from: '2026-06-01', valid_until: '2026-01-01' },
      'date_range',
      'valid_from 必须早于 valid_until'
    );
  });
});
