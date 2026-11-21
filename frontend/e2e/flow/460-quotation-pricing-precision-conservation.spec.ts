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
 * 缺口来源。POST /quotations/calculate-price 在 frontend/scripts/route-snapshot.txt:1543 在册，
 * 全仓 E2E 此前零命中；后端写入方是 services/quotation_pricing_service.rs 的
 * QuotationPricingService::calculate（:123-194），税率经 utils/tax.rs:61 的 unit_price_with_tax
 * 统一收敛。现有 451/455 只覆盖色号阶梯价命中与审批档位，未覆盖本端点的舍入链。
 *
 * 入参逐字段对照 PricingContext（services/quotation_pricing_service.rs:51-65）：
 * customer_id/customer_level/product_id/color_id/quantity/currency/quotation_date/tax_rate。
 * customer_level 是枚举 CustomerLevel，serde(rename_all="UPPERCASE")（:23-30），
 * 故合法词只有 VIP 与 NORMAL；小写 vip 在提取器解码层被拒，经
 * middleware/trace_context.rs:279 收口为 HTTP 400 + code=VALIDATION_ERROR（APP_ERROR_CODES）。
 * Decimal 字段一律用字符串提交，金额出参是 DECIMAL 字符串，断言逐位比字符串不重算第二套舍入。
 *
 * 出参逐字段对照 PricingResult（:77-90）：unit_price/unit_price_with_tax/tier_breakdown/
 * discount_applied/final_amount/price_source；tier_breakdown 元素键取 TierPrice（:69-73）
 * 的 min_quantity/max_quantity/unit_price；price_source 是 snake_case 的 color_price（:95-102）。
 *
 * 前置。ensureTestEntities 自建带色号的报价专用产品，POST /color-prices 落一条
 * base_price=12.3456（product_color_prices.base_price 是 DECIMAL(18,4)）的通用价宿主，
 * customer_level 不写（数据库 NULL，供 VIP/NORMAL 两路都回退到通用价）。
 *
 * 数值真值（逐条来自 :171-184 与 utils/tax.rs:61-63）：
 * tier.unit_price=12.3456；VIP 折扣率 0.05（:36）→ discount_applied=(12.3456*0.05).round_dp(2)=0.62，
 * unit_price=(12.3456-0.62).round_dp(2)=11.73；税率 13 为百分数口径 →
 * unit_price_with_tax=(11.73*1.13).round_dp(2)=13.25；final_amount=(unit_price*quantity).round_dp(2)。
 * 数量 3→35.19；数量 0.001→0.01；数量 1000000 且免税→11730000.00、含税单价仍 11.73。
 * NORMAL 折扣率 0（:38）→ discount_applied=0.00、unit_price=12.35、含税 13.96、数量 3 总额 37.05。
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
    expect(str(tier.unit_price, 'tier.unit_price'), '四位小数基价不得被提前截断').toBe('12.3456');
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
    expect(str(normal.discount_applied, 'normal.discount_applied')).toBe('0.00');
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
