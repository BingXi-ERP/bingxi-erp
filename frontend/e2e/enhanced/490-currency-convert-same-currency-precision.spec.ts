// 4.24 系统配置 + 4.16 数值精度：同币种换算的恒等提前返回与 Decimal 原标度回显。
// 后端判据：services/currency_service.rs:227-244 convert_amount 先判 from_currency == to_currency，
//   :236-243 直接以 amount 原值、exchange_rate=1、显式日期返回；查汇率在 :247 之后，故零数据依赖。
//   跨币种分支 :275 round_dp(2)，同币种提前返回绕过该舍入，三位小数不得补零也不得四舍五入。
//   handlers/currency_handler.rs:229-249 五个金额/汇率字段均 Decimal::to_string 成字符串。
// 与既有覆盖分工：flow/442 只测跨币种乘汇率与两位金额，全 e2e 无同币种用例、无 exchange_rate='1'、
//   无三位小数与显式日期回显断言；本例纯 API 零造数，不触碰全局本位币或汇率表。
import { expect, test } from '../diagnose-fixture';
import { apiCall, loginViaUI } from '../flow/helpers';

interface ConversionResult {
  from_currency?: unknown;
  to_currency?: unknown;
  original_amount?: unknown;
  converted_amount?: unknown;
  exchange_rate?: unknown;
  conversion_date?: unknown;
}

const PATH = '/currencies/convert';

test.describe('4.24 同币种换算恒等与精度保留', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('490-01 同币种原额恒等、汇率为1、三位小数与显式日期逐字段回显', async ({ page }) => {
    const r = await apiCall<ConversionResult>(page, 'POST', PATH, {
      from_currency: 'USD',
      to_currency: 'USD',
      amount: '123.456',
      conversion_date: '2026-01-01',
    });
    expect(r.code, `[490] 同币种换算须 200，实际 code=${r.code}`).toBe(200);
    expect(String(r.data.from_currency), '[490] 源币码须逐字符回显').toBe('USD');
    expect(String(r.data.to_currency), '[490] 目标币码须逐字符回显').toBe('USD');
    expect(String(r.data.original_amount), '[490] 原始额须保留入参标度').toBe('123.456');
    expect(
      String(r.data.converted_amount),
      `[490] 同币种不得按跨币种口径舍入为两位，实际 ${String(r.data.converted_amount)}`
    ).toBe('123.456');
    expect(String(r.data.exchange_rate), '[490] 同币种汇率须恰为字符串 1').toBe('1');
    expect(String(r.data.conversion_date), '[490] 显式日期须逐字符回显').toBe('2026-01-01');

    const subUnit = await apiCall<ConversionResult>(page, 'POST', PATH, {
      from_currency: 'CNY',
      to_currency: 'CNY',
      amount: '0.005',
      conversion_date: '2025-12-31',
    });
    expect(subUnit.code, `[490] 分以下金额同币种须 200，实际 code=${subUnit.code}`).toBe(200);
    expect(
      String(subUnit.data.converted_amount),
      `[490] 分以下金额不得补零或舍入，实际 ${String(subUnit.data.converted_amount)}`
    ).toBe('0.005');
    expect(String(subUnit.data.exchange_rate), '[490] 分以下同币种汇率须为 1').toBe('1');
    expect(String(subUnit.data.conversion_date), '[490] 分以下显式日期须回显').toBe('2025-12-31');

    const noRate = await apiCall<ConversionResult>(page, 'POST', PATH, {
      from_currency: 'MTL',
      to_currency: 'MTL',
      amount: '10',
      conversion_date: '2020-02-29',
    });
    expect(noRate.code, `[490] 无汇率配置的同币种换算须 200，实际 code=${noRate.code}`).toBe(200);
    expect(
      String(noRate.data.converted_amount),
      `[490] 整数金额不得补两位小数，实际 ${String(noRate.data.converted_amount)}`
    ).toBe('10');
    expect(String(noRate.data.exchange_rate), '[490] 无汇率配置时汇率仍须为 1').toBe('1');
    expect(String(noRate.data.conversion_date), '[490] 闰日须逐字符回显').toBe('2020-02-29');
  });
});
