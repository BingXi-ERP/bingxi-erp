/**
 * 报价试算极值出参：0.0001 与百万数量下的定点字符串与分位收敛
 *
 * 六要素
 * - 功能：验证 POST /quotations/calculate-price 在极小量与百万量下不输出科学计数法、
 *   不溢出，且金额按分位收敛并落在 DECIMAL(18,2) 上界内。
 * - 调用方：Playwright E2E（diagnose-fixture），仅调用 /api/v1/erp 纯 API，不打开业务页面。
 * - 入参：NORMAL 客户、税率 0、四位小数基价 12.3456，quantity 分别为 0.0001 与 1000000。
 * - 传给谁：POST /color-prices 落色号价；POST /quotations/calculate-price 走试算，不建单。
 * - 存什么：出参 final_amount/unit_price/discount_applied 的十进制字符串与分位值。
 * - 存哪里：只在用例进程内以 BigInt 分位比较，不写文件；色号价实体由公共夹具清理。
 *
 * 唯一事实源：backend/src/services/quotation_pricing_service.rs 的 calculate 链：
 *   discount_amount=(tier.unit_price × discount_rate).round_dp(2)、
 *   unit_price=(tier.unit_price - discount_amount).round_dp(2)、
 *   final_amount=(unit_price × quantity).round_dp(2)。NORMAL 折扣率为 0，故 12.3456
 *   先收敛到 12.35；0.0001 × 12.35 = 0.001235 收敛到 0.00，
 *   1000000 × 12.35 = 12350000.00，远低于 DECIMAL(18,2) 的 9999999999999999.99。
 * 0.0001 超过明细 quantity 列的 2 位刻度，只走试算端点，不用于建单。
 * 金额出参是定点数字符串，统一转 BigInt 分位比较，禁止 Number() 精确相等。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCallRaw, ensureTestEntities, genCode, getCtx, loginViaUI } from './helpers';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRow(value: unknown, label: string): Row {
  if (!isRow(value)) {
    throw new Error(`${label} 必须是 JSON 对象，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function str(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} 必须是字符串，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function int(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/** 十进制字符串转 BigInt 分：负号保留，不足两位补零，超出分位的尾数必须全零。 */
function toCents(value: string): bigint {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new Error(`金额必须是十进制字符串，实际 ${JSON.stringify(value)}`);
  }
  const negative = value.startsWith('-');
  const body = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = body.split('.');
  const centsText = `${fraction}00`.slice(0, 2);
  if (/[1-9]/.test(fraction.slice(2))) {
    throw new Error(`金额超出分位刻度，实际 ${JSON.stringify(value)}`);
  }
  const cents = BigInt(whole) * 100n + BigInt(centsText);
  return negative ? -cents : cents;
}

function formatCents(cents: bigint): string {
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

function ymd(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

const BASE_PRICE = '12.3456';
const DECIMAL_18_2_MAX_CENTS = 999999999999999900n;
const DECIMAL_TEXT = /^-?\d+(?:\.\d{1,2})?$/;

async function seedPrecisionPrice(
  page: Page,
  productId: number,
  colorId: number,
  basePrice: string,
  tag: string
): Promise<void> {
  const created = requireRow(
    await apiCallRaw<unknown>(page, 'POST', '/color-prices', {
      product_id: productId,
      color_id: colorId,
      currency: 'CNY',
      base_price: basePrice,
      effective_from: ymd(0),
      notes: `594精度极值宿主${tag}`,
    }),
    '建色号价出参'
  );
  const priceId = int(created.id, '建色号价返回主键');
  expect(priceId > 0, `建色号价必须返回真实主键，实际 ${priceId}`).toBe(true);
}

function priceBody(
  customerId: number,
  productId: number,
  colorId: number,
  quantity: string,
  taxRate: string
): Row {
  return {
    customer_id: customerId,
    customer_level: 'NORMAL',
    product_id: productId,
    color_id: colorId,
    quantity,
    currency: 'CNY',
    quotation_date: ymd(0),
    tax_rate: taxRate,
  };
}

function assertDecimalText(value: unknown, label: string): string {
  const text = str(value, label);
  expect(DECIMAL_TEXT.test(text), `${label} 必须是定点小数字符串，实际 ${text}`).toBe(true);
  expect(/[eE]|Infinity|NaN/.test(text), `${label} 不得含科学计数法或非有限值，实际 ${text}`).toBe(
    false
  );
  return text;
}

test.describe.serial('594 报价试算极值出参', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('594-01 0.0001 与百万数量试算均出定点字符串且按分位收敛不越界', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const colorId = ctx.quotationProductColorId;
    const customerId = ctx.customerId;
    if (productId === undefined || colorId === undefined || customerId === undefined) {
      throw new Error('ensureTestEntities 未产出报价产品/色号/客户，试算极值前置不成立');
    }
    const tag = genCode('594P');
    await seedPrecisionPrice(page, productId, colorId, BASE_PRICE, tag);

    const tiny = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, productId, colorId, '0.0001', '0')
      ),
      '极小量试算出参'
    );
    const tinyFinal = assertDecimalText(tiny.final_amount, '极小量 final_amount');
    const tinyUnitPrice = assertDecimalText(tiny.unit_price, '极小量 unit_price');
    const tinyDiscount = assertDecimalText(tiny.discount_applied, '极小量 discount_applied');
    expect(formatCents(toCents(tinyFinal)), '0.0001 × 12.35 = 0.001235 应收敛为 0.00').toBe('0.00');
    expect(formatCents(toCents(tinyUnitPrice)), '四位基价应先收敛为 12.35').toBe('12.35');
    expect(formatCents(toCents(tinyDiscount)), 'NORMAL 折扣应为 0.00').toBe('0.00');

    const huge = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, productId, colorId, '1000000', '0')
      ),
      '百万量试算出参'
    );
    const hugeFinal = assertDecimalText(huge.final_amount, '百万量 final_amount');
    const hugeUnitPrice = assertDecimalText(huge.unit_price, '百万量 unit_price');
    const hugeDiscount = assertDecimalText(huge.discount_applied, '百万量 discount_applied');
    expect(formatCents(toCents(hugeUnitPrice)), '四位基价应先收敛为 12.35').toBe('12.35');
    expect(formatCents(toCents(hugeDiscount)), 'NORMAL 折扣应为 0.00').toBe('0.00');
    expect(
      formatCents(toCents(hugeFinal)),
      '1000000 × 12.35 = 12350000.00，四位基价按分位收敛后不得提前截断'
    ).toBe('12350000.00');
    expect(toCents(hugeFinal) <= DECIMAL_18_2_MAX_CENTS, '百万量不得越过 DECIMAL(18,2) 上界').toBe(
      true
    );
  });
});
