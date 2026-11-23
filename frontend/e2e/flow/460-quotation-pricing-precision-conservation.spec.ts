import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from './helpers';

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

function canonicalDecimal(value: unknown, label: string): string {
  const text = str(value, label);
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) {
    throw new Error(`${label} 必须是定点小数字符串，实际 ${JSON.stringify(text)}`);
  }
  if (!text.includes('.')) return text;
  const trimmed = text.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '-0' ? '0' : trimmed;
}

function int(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`${label} 必须是整数，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

function ymd(daysFromToday = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

/**
 * 460 报价定价自动计算链：定点数精度、量级边界与词表边界
 *
 * 缺口来源：POST /quotations/calculate-price 已在 route-snapshot 在册，全仓 E2E 此前零命中；
 * 现有 451/455 只覆盖色号阶梯价命中与审批档位，未覆盖本端点的舍入链。
 * 后端写入方集中在报价定价服务，税率由统一税额工具收敛。
 *
 * 入参逐字段对照 PricingContext：
 * customer_id/customer_level/product_id/color_id/quantity/currency/quotation_date/tax_rate。
 * customer_level 是枚举，序列化为大写词；合法词只有 VIP 与 NORMAL，小写词在解码层被拒，
 * 并由统一错误收口为 HTTP 400 + VALIDATION_ERROR。
 * Decimal 字段用字符串提交，金额出参是定点数字符串；断言按数值守恒比对，允许固定标度尾部补零，
 * 不允许提前截断或换一套舍入规则重算。
 *
 * 出参逐字段对照 PricingResult：unit_price/unit_price_with_tax/tier_breakdown/
 * discount_applied/final_amount/price_source；tier_breakdown 元素键取 TierPrice 的
 * min_quantity/max_quantity/unit_price；price_source 是 snake_case 的 color_price。
 *
 * 前置：ensureTestEntities 自建带色号的报价专用产品，POST /color-prices 落一条四位小数通用价，
 * customer_level 不写，供 VIP/NORMAL 两路都回退到通用价。
 *
 * 数值真值：tier.unit_price 数值为 12.3456（出参可为固定标度的 12.345600）；
 * VIP 折扣率 0.05 → discount_applied 收敛到 0.62，unit_price 收敛到 11.73；
 * 税率 13 为百分数口径 → unit_price_with_tax 收敛到 13.25；final_amount 按数量收敛。
 * 数量 3、0.001、1000000 与免税分支各有独立守恒断言；NORMAL 折扣率为 0。
 */
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
      notes: `460精度宿主${tag}`,
    }),
    '建色号价出参'
  );
  const priceId = int(created.id, '建色号价返回主键');
  expect(priceId > 0, `建色号价必须返回真实主键，实际 ${priceId}`).toBe(true);
}

function priceBody(
  customerId: number,
  customerLevel: string,
  productId: number,
  colorId: number,
  quantity: string,
  taxRate: string
): Row {
  return {
    customer_id: customerId,
    customer_level: customerLevel,
    product_id: productId,
    color_id: colorId,
    quantity,
    currency: 'CNY',
    quotation_date: ymd(0),
    tax_rate: taxRate,
  };
}

test.describe.serial('460 报价定价自动计算的定点数精度守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('460-01 四位小数基价的 VIP 折扣-tax-金额链逐字段守恒，极小/百万量不越界，非法等级词点名拒绝', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    const colorId = ctx.quotationProductColorId;
    const customerId = ctx.customerId;
    if (productId === undefined || colorId === undefined || customerId === undefined) {
      throw new Error('ensureTestEntities 未产出报价产品/色号/客户，定价精度前置不成立');
    }
    const tag = genCode('460P');
    await seedPrecisionPrice(page, productId, colorId, '12.3456', tag);

    const vip = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, 'VIP', productId, colorId, '3', '13')
      ),
      'VIP 定价出参'
    );
    expect(str(vip.discount_applied, 'discount_applied'), '0.61728 必须两位收敛为 0.62').toBe(
      '0.62'
    );
    expect(str(vip.unit_price, 'unit_price'), '11.7256 必须两位收敛为 11.73').toBe('11.73');
    expect(
      str(vip.unit_price_with_tax, 'unit_price_with_tax'),
      '13 是百分数，11.73*1.13=13.2549 收敛为 13.25'
    ).toBe('13.25');
    expect(str(vip.final_amount, 'final_amount')).toBe('35.19');
    expect(str(vip.price_source, 'price_source')).toBe('color_price');
    const tiers = vip.tier_breakdown;
    if (!Array.isArray(tiers) || tiers.length !== 1) {
      throw new Error(`tier_breakdown 必须恰含一档，实际 ${JSON.stringify(tiers)}`);
    }
    const tier = requireRow(tiers[0], 'tier_breakdown[0]');
    expect(
      canonicalDecimal(tier.unit_price, 'tier.unit_price'),
      '四位小数基价不得被提前截断或改值'
    ).toBe('12.3456');
    expect(Number(str(tier.min_quantity, 'tier.min_quantity'))).toBe(1);
    expect(tier.max_quantity).toBeNull();

    const tiny = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, 'VIP', productId, colorId, '0.001', '13')
      ),
      '极小量定价出参'
    );
    expect(str(tiny.unit_price, 'tiny.unit_price')).toBe('11.73');
    expect(str(tiny.final_amount, 'tiny.final_amount'), '0.01173 必须收敛为 0.01').toBe('0.01');

    const huge = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, 'VIP', productId, colorId, '1000000', '0')
      ),
      '百万量定价出参'
    );
    expect(str(huge.final_amount, 'huge.final_amount'), '百万量不得溢出或丢分').toBe('11730000.00');
    expect(
      str(huge.unit_price_with_tax, 'huge.unit_price_with_tax'),
      'tax_rate=0 是免税声明，不得回落任何税率档位'
    ).toBe('11.73');

    const normal = requireRow(
      await apiCallRaw<unknown>(
        page,
        'POST',
        '/quotations/calculate-price',
        priceBody(customerId, 'NORMAL', productId, colorId, '3', '13')
      ),
      'NORMAL 定价出参'
    );
    expect(
      canonicalDecimal(normal.discount_applied, 'normal.discount_applied'),
      'NORMAL 档折扣为零，零值乘法走标度快速路径，按本 spec 声明的数值守恒口径比对'
    ).toBe('0');
    expect(str(normal.unit_price, 'normal.unit_price'), '12.3456 无折扣仍须两位收敛').toBe('12.35');
    expect(str(normal.unit_price_with_tax, 'normal.unit_price_with_tax')).toBe('13.96');
    expect(str(normal.final_amount, 'normal.final_amount')).toBe('37.05');

    const badLevel = await apiCallExpectFail(
      page,
      'POST',
      '/quotations/calculate-price',
      priceBody(customerId, 'vip', productId, colorId, '3', '13')
    );
    expect(badLevel.status, '小写 vip 必须被解码层拒绝').toBe(400);
    expect(failureCode(badLevel), '解码失败的机器码必须是 VALIDATION_ERROR').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
  });
});
