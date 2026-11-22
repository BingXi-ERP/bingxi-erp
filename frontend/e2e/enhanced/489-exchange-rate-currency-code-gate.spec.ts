// 4.24 系统配置 + 4.25 错误码：汇率写入口的 ISO 4217 币种码三道门。
// 后端判据：services/currency_service.rs:150-151 源币码与目标币码都过 validate_currency_code；
//   :441-459 依次校验字节长恰 3、全 ASCII 大写、SUPPORTED_CURRENCY_CODES 白名单；
//   三道门都在 :163 insert 前，AppError::business 在 utils/error.rs:850 脱敏为 400/BUSINESS_ERROR。
// 与既有覆盖分工：flow/47 只测 0 与 0.01 汇率值，flow/442 只测合法码写入、查询与列表回读，
//   全 e2e 无币码长度/大小写/白名单非法变体断言；本例用老日期稀有币对做正控，避免污染最新汇率。
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  failureCode,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/exchange-rates';
const BASE = {
  from_currency: 'USD',
  to_currency: 'CNY',
  rate: '7.25',
  effective_date: '2026-01-01',
};

interface ExchangeRate {
  id?: unknown;
  from_currency?: unknown;
  to_currency?: unknown;
  rate?: unknown;
  effective_date?: unknown;
}

async function reject(
  page: import('@playwright/test').Page,
  body: Record<string, unknown>,
  reason: string
): Promise<void> {
  const r = await apiCallExpectFail(page, 'POST', PATH, body);
  expect(r.status, `[489] ${reason} 须 400，实际 ${r.status}`).toBe(400);
  expect(
    failureCode(r),
    `[489] ${reason} 机器码须 BUSINESS_ERROR，实际 ${String(failureCode(r))}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(String(r.message), `[489] ${reason} 须走脱敏文案，实际 ${String(r.message)}`).toBe(
    '业务处理失败'
  );
}

test.describe('4.24 汇率币种码 ISO 4217 三道门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('489-01 源与目标币码的长度、大小写、白名单变体均前置拒绝且零落库', async ({ page }) => {
    await reject(page, { ...BASE, from_currency: 'usd' }, '源币码小写');
    await reject(page, { ...BASE, from_currency: 'ZZ' }, '源币码两字符');
    await reject(page, { ...BASE, from_currency: 'ZZZ' }, '源币码非白名单');
    await reject(page, { ...BASE, to_currency: 'usd' }, '目标币码小写');
    await reject(page, { ...BASE, to_currency: 'ZZ' }, '目标币码两字符');
    await reject(page, { ...BASE, to_currency: 'ZZZ' }, '目标币码非白名单');

    const absent = await apiCallExpectFail(
      page,
      'GET',
      '/exchange-rates/query?from_currency=ZZZ&to_currency=CNY'
    );
    expect(absent.status, `[489] 非白名单币码不得落库，查询须 404，实际 ${absent.status}`).toBe(
      404
    );
    expect(
      failureCode(absent),
      `[489] 零落库查询机器码须 NOT_FOUND，实际 ${String(failureCode(absent))}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      String(absent.message),
      `[489] 查询拒因须点名币种对，实际 ${String(absent.message)}`
    ).toContain('未找到 ZZZ -> CNY 的汇率记录');

    const created = await apiCall<ExchangeRate>(page, 'POST', PATH, {
      from_currency: 'HRK',
      to_currency: 'ISK',
      rate: '7.25',
      effective_date: '1999-01-01',
    });
    expect(created.code, `[489] 白名单币对须放行，实际 code=${created.code}`).toBe(200);
    expect(
      Number(created.data.id),
      `[489] 正控须回真实主键，实际 ${String(created.data.id)}`
    ).toBeGreaterThan(0);
    expect(String(created.data.from_currency), '[489] 源币码须逐字符回读').toBe('HRK');
    expect(String(created.data.to_currency), '[489] 目标币码须逐字符回读').toBe('ISK');
    expect(
      Number(created.data.rate),
      `[489] 汇率值须为 7.25，实际 ${String(created.data.rate)}`
    ).toBe(7.25);
    expect(
      String(created.data.effective_date),
      `[489] 生效日须逐字符回读，实际 ${String(created.data.effective_date)}`
    ).toBe('1999-01-01');
  });
});
