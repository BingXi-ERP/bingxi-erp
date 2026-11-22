/**
 * 4.16 自动计算与数值精度：汇率换算额必须等于金额×汇率并做分以下 round_dp(2)。
 *
 * 调用面：POST /api/v1/erp/currencies/convert
 *   请求 ConvertAmountRequest{currency_handler.rs:220}：from_currency/to_currency/amount/conversion_date。
 *   出参 ConversionResultResponse{currency_handler.rs:229-236}：converted_amount 是 String，
 *   后端 services/currency_service.rs:246-279 取 rate 后算 (amount * rate).round_dp(2)
 *   （:273），再 to_string 出参（handler:244）。
 * 判据：自建币对写入已知 4 位标度汇率 → 查回确认 → 用带三位小数的金额换算 →
 *   converted_amount 须逐字符等于「金额×汇率按 bigint 精确相乘后分以下四舍五入到 2 位」。
 *   442-settlement 的换算腿只断言 exchange_rate/from/to/original_amount（442:876-885），
 *   全仓 e2e 对 converted_amount 零命中——后端若漏乘汇率、漏 round_dp(2) 或提前舍入，
 *   本断言即红，是真检测而非只断 200/有数据。
 * 精度：期望值用 bigint 定点算，不用 JS 浮点，避免 0.1+0.2 类误差误判。
 * 前置：币对与汇率按 442-settlement 官方范式构造（本位币由后端给、不自造币码）。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface Row {
  [key: string]: unknown;
  id?: number;
  code?: string;
  rate?: string;
  is_base?: boolean;
  is_active?: boolean;
  converted_amount?: string;
  exchange_rate?: string;
  original_amount?: string;
  from_currency?: string;
  to_currency?: string;
}

function requireStr(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim() === '')
    throw new Error(`${label} 缺失或非空串：${String(v)}`);
  return v;
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

/** 把十进制字符串放大 10^scale 成 bigint，保留符号；不足位的小数右补零，超位截断 */
function toScaled(v: string, scale: number): bigint {
  const neg = v.trim().startsWith('-');
  const body = v.trim().replace(/^[+-]/, '');
  const [int = '0', fracRaw = ''] = body.split('.');
  const frac = fracRaw.padEnd(scale, '0').slice(0, scale);
  const scaled = BigInt(int + frac);
  return neg ? -scaled : scaled;
}

/** 金额(amount)×汇率(rate) 精确相乘后四舍五入到 2 位，返回与后端 to_string 同形的字符串 */
function expectConverted(amount: string, rate: string): string {
  const SCALE = 6;
  const a = toScaled(amount, SCALE);
  const r = toScaled(rate, SCALE);
  const product = a * r; // 实际标度 = 2*SCALE
  // 从 2*SCALE 缩回 2 位：除以 10^(2*SCALE-2)，四舍五入（half-up，与 round_dp 一致）
  const drop = 10n ** BigInt(2 * SCALE - 2);
  const half = drop / 2n;
  const neg = product < 0n;
  const abs = neg ? -product : product;
  const rounded2 = (abs + half) / drop; // 放大 100 倍后的整数分
  const int = rounded2 / 100n;
  const frac = rounded2 % 100n;
  const body = `${int}.${frac.toString().padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

async function getCurrencies(page: Page): Promise<{ baseCode: string; quoteCode: string }> {
  const raw = await apiCallRaw<unknown>(page, 'GET', '/currencies');
  expect(Array.isArray(raw), '币种列表出参必须是裸数组').toBe(true);
  const list = raw as Row[];
  expect(list.length, '币种档案不得为空').toBeGreaterThan(0);
  const baseRow = list.find(c => c.is_base === true);
  expect(baseRow, '币种档案必须有一枚本位币（is_base=true）').toBeTruthy();
  const baseCode = requireStr(baseRow!.code, '本位币代码');
  const nonBase = list.find(
    c => requireStr(c.code, '币种代码') !== baseCode && c.is_active === true
  );
  expect(nonBase, '必须存在启用中的非本位币才能测换算').toBeTruthy();
  return { baseCode, quoteCode: requireStr(nonBase!.code, '非本位币代码') };
}

test.describe('4.16 汇率换算额数值精度', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('4.16-01 汇率换算额=金额×汇率且分以下 round_dp(2)', async ({ page }) => {
    const { baseCode, quoteCode } = await getCurrencies(page);

    // 写入已知 4 位标度汇率（442 官方范式），查询腿回读确认生效
    const rate = '7.3400';
    await apiCallRaw<Row>(page, 'POST', '/exchange-rates', {
      from_currency: quoteCode,
      to_currency: baseCode,
      rate,
      effective_date: today(),
    });
    const queried = await apiCallRaw<Row>(
      page,
      'GET',
      `/exchange-rates/query?from_currency=${quoteCode}&to_currency=${baseCode}`
    );
    const effectiveRate = requireStr(queried.rate, '查询腿生效汇率');

    // 三位小数金额触发分以下舍入：100.005 × 7.34 = 734.0367 → round_dp(2) = 734.04
    const amount = '100.005';
    const converted = await apiCallRaw<Row>(page, 'POST', '/currencies/convert', {
      from_currency: quoteCode,
      to_currency: baseCode,
      amount,
    });

    const got = requireStr(converted.converted_amount, '换算额 converted_amount');
    const expected = expectConverted(amount, effectiveRate);
    expect(got, `换算额须=金额×生效汇率按分以下四舍五入：${amount}×${effectiveRate}`).toBe(
      expected
    );
    expect(
      String(converted.exchange_rate),
      '换算所用汇率须与查询腿逐字符同源（防止用错汇率算出看似合理的额）'
    ).toBe(effectiveRate);
    expect(String(converted.original_amount), '原始额须如实回显入参').toBe(amount);
    expect(String(converted.from_currency), '源币种回显一致').toBe(quoteCode);
    expect(String(converted.to_currency), '目标币种回显一致').toBe(baseCode);

    console.log(`[4.16] ${amount}×${effectiveRate} → converted=${got} 期望=${expected}`);
  });
});
