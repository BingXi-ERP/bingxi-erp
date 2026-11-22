// 4.99 报价试算：VIP 95 折命中专用价、通用价回退、13% 百分数口径的价税守恒。
// 后端判据：handlers/quotation_handler.rs:579-589 只读收 Json<PricingContext>；
// services/quotation_pricing_service.rs:23-24 客户等级只认大写 VIP/NORMAL，
// :32-39 VIP 折扣率 0.05、NORMAL 为 0，:125-157 先查 VIP 专用价再回退 customer_level IS NULL，
// :171-193 阶梯/折扣/金额逐字段 round_dp(2) 并输出 PricingResult 六键，
// :226-232 NORMAL 不走专用价查询；utils/tax.rs:60-63 含税单价按百分数税率换算；
// :159-166 缺价 AppError::not_found → utils/error.rs:817 NOT_FOUND / 404。
// 出参键以 PricingResult (:75-90) 为准；金额以整数分比较，不使用浮点精确相等。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from '../flow/helpers';

const PATH = '/quotations/calculate-price';
const QUANTITY = 100;
const MIN_QUANTITY_CENTS = 10_000;
/** tax_rate 为百分数口径：13% = 1300 bp；含税系数为 113%。 */
const TAX_BASIS_POINTS = 1_300;
const WITH_TAX_BASIS_POINTS = 11_300;
/** 后端 VIP 折扣率 Decimal::new(5,2) = 5%，NORMAL 为 0。 */
const VIP_DISCOUNT_BASIS_POINTS = 500;
const NORMAL_DISCOUNT_BASIS_POINTS = 0;
const VIP_BASE_CENTS = 100_000;
const GENERIC_BASE_CENTS = 50_000;
const FALLBACK_GENERIC_BASE_CENTS = 80_000;

interface Row {
  id?: unknown;
}

interface Host {
  productId: number;
  colorId: number;
}

interface TierPrice {
  min_quantity?: unknown;
  max_quantity?: unknown;
  unit_price?: unknown;
}

interface PricingResult {
  unit_price?: unknown;
  unit_price_with_tax?: unknown;
  tier_breakdown?: unknown;
  discount_applied?: unknown;
  final_amount?: unknown;
  price_source?: unknown;
}

interface ExpectedPricing {
  label: string;
  baseCents: number;
  discountBasisPoints: number;
}

type CustomerLevel = 'VIP' | 'NORMAL';

type PricingBody = {
  customer_id: number;
  customer_level: CustomerLevel;
  product_id: number;
  color_id: number;
  quantity: string;
  currency: string;
  quotation_date: string;
  tax_rate: string;
};

function ymd(daysFromToday: number): string {
  return new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

/** 把整数分格式化为两位小数的 Decimal 字符串，避免 JS 浮点参与金额算术。 */
function decimalOf(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new Error(`[499] 金额分必须为安全整数，实际 ${String(cents)}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * 解析后端 Decimal 出参到整数分。超过两位且非零即失败，绝不静默截断。
 * 入参 value 是出参原值，label 用于失败时点名字段。
 */
function centsOf(value: unknown, label: string): number {
  const raw = typeof value === 'string' ? value : String(value);
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (matched === null) {
    throw new Error(`[499] ${label} 必须是 Decimal 字符串，实际 ${JSON.stringify(value)}`);
  }
  const fraction = matched[3] ?? '';
  if (/[1-9]/.test(fraction.slice(2))) {
    throw new Error(`[499] ${label} 精确到分，实际 ${raw}`);
  }
  const whole = Number(matched[2]);
  const cents = whole * 100 + Number(fraction.slice(0, 2).padEnd(2, '0'));
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(cents)) {
    throw new Error(`[499] ${label} 超出安全整数范围，实际 ${raw}`);
  }
  return matched[1] === '-' ? -cents : cents;
}

/** 按 basisPoints 换算并收敛到分，对应 rust_decimal 的 round_dp(2)。 */
function applyBasisPoints(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10_000);
}

function positiveId(row: Row, label: string): number {
  const id = Number(row.id);
  expect(
    Number.isSafeInteger(id) && id > 0,
    `[499] ${label} 必须返回真实主键，实际 ${JSON.stringify(row)}`
  ).toBe(true);
  return id;
}

function ctxCustomerId(): number {
  const ctx = getCtx();
  const id = Number(ctx.customerId);
  expect(
    Number.isSafeInteger(id) && id > 0,
    `[499] getCtx().customerId 未就绪，实际 ${JSON.stringify(ctx.customerId)}`
  ).toBe(true);
  return id;
}

/**
 * 为本用例独占创建产品与色号。入参 tag 由 genCode 生成，传给分类/产品/色号三个写口。
 * 存什么：三行 code/color_no 均带 tag；存哪里：categories/products/product_colors。
 */
async function seedHost(page: Page, tag: string): Promise<Host> {
  const category = await apiCallRaw<Row>(page, 'POST', '/categories', {
    name: `499分类${tag}`,
    code: `499CAT${tag}`,
  });
  const categoryId = positiveId(category, '分类');

  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    name: `499产品${tag}`,
    code: `499P${tag}`,
    category_id: categoryId,
    unit: 'm',
    // 色价链按色号计价，不做米↔公斤换算，取非面料类型免带面料三键。
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = positiveId(product, '产品');

  const color = await apiCallRaw<Row>(page, 'POST', `/products/${productId}/colors`, {
    color_no: `499CN${tag}`,
    color_name: `499色号${tag}`,
    color_type: 'STANDARD',
    extra_cost: 0,
  });
  const colorId = positiveId(color, '色号');

  return { productId, colorId };
}

/**
 * 建一条色号价格。customer_level 为 'VIP' 是专用价，null 才是通用价；
 * min_quantity=100 命中阶梯，max_quantity 仅作 DTO 字段覆盖，不参与定价服务匹配。
 */
async function seedPrice(
  page: Page,
  host: Host,
  baseCents: number,
  customerLevel: 'VIP' | null,
  tag: string,
  effectiveFrom: string
): Promise<void> {
  const row = await apiCallRaw<Row>(page, 'POST', '/color-prices', {
    product_id: host.productId,
    color_id: host.colorId,
    currency: 'CNY',
    base_price: decimalOf(baseCents),
    effective_from: effectiveFrom,
    effective_to: null,
    customer_level: customerLevel,
    min_quantity: String(QUANTITY),
    max_quantity: '1000',
    customer_id: null,
    season: null,
    notes: `499价格${tag}`,
  });
  positiveId(row, '色号价格');
}

function bodyFor(
  customerId: number,
  host: Host,
  customerLevel: CustomerLevel,
  quotationDate: string
): PricingBody {
  return {
    customer_id: customerId,
    customer_level: customerLevel,
    product_id: host.productId,
    color_id: host.colorId,
    quantity: String(QUANTITY),
    currency: 'CNY',
    quotation_date: quotationDate,
    // PricingContext.tax_rate 是百分数口径；13 表示 13%，0.13 会被当作 0.13%。
    tax_rate: '13',
  };
}

async function calculate(page: Page, body: PricingBody): Promise<PricingResult> {
  const data = await apiCallRaw<unknown>(page, 'POST', PATH, body);
  expect(
    data !== null && typeof data === 'object' && !Array.isArray(data),
    `[499] ${PATH} 必须返回 PricingResult 对象，实际 ${JSON.stringify(data)}`
  ).toBe(true);
  return data as PricingResult;
}

/** 出参键以 PricingResult 实体为准，逐字段核对，禁止 net/tax/gross 自造键。 */
function assertPricing(result: PricingResult, expected: ExpectedPricing): void {
  const { label, baseCents, discountBasisPoints } = expected;
  expect(
    result.price_source,
    `[499] ${label} price_source 必须为 color_price，实际 ${JSON.stringify(result.price_source)}`
  ).toBe('color_price');

  const tiers = result.tier_breakdown;
  expect(
    Array.isArray(tiers),
    `[499] ${label} tier_breakdown 必须是数组，实际 ${JSON.stringify(tiers)}`
  ).toBe(true);
  expect((tiers as TierPrice[]).length, `[499] ${label} 只应命中一个阶梯`).toBe(1);
  const tier = (tiers as TierPrice[])[0];
  expect(
    centsOf(tier.min_quantity, `${label} tier_breakdown[0].min_quantity`),
    `[499] ${label} 阶梯起点须等于提交的数量下限，实际 ${JSON.stringify(tier.min_quantity)}`
  ).toBe(MIN_QUANTITY_CENTS);
  expect(
    tier.max_quantity,
    `[499] ${label} min_quantity <= quantity 命中后 max_quantity 必须为 null，实际 ${JSON.stringify(tier.max_quantity)}`
  ).toBeNull();
  expect(
    centsOf(tier.unit_price, `${label} tier_breakdown[0].unit_price`),
    `[499] ${label} 阶梯单价须等于色价 base_price，实际 ${JSON.stringify(tier.unit_price)}`
  ).toBe(baseCents);

  const expectedDiscountCents = applyBasisPoints(baseCents, discountBasisPoints);
  const expectedUnitCents = baseCents - expectedDiscountCents;
  const expectedUnitWithTaxCents = applyBasisPoints(expectedUnitCents, WITH_TAX_BASIS_POINTS);
  const expectedFinalCents = expectedUnitCents * QUANTITY;

  expect(
    centsOf(result.discount_applied, `${label} discount_applied`),
    `[499] ${label} 每单位折扣额须为 ${decimalOf(expectedDiscountCents)}，实际 ${JSON.stringify(result.discount_applied)}`
  ).toBe(expectedDiscountCents);
  expect(
    centsOf(result.unit_price, `${label} unit_price`),
    `[499] ${label} 折后单价须为 ${decimalOf(expectedUnitCents)}，实际 ${JSON.stringify(result.unit_price)}`
  ).toBe(expectedUnitCents);
  expect(
    centsOf(result.unit_price_with_tax, `${label} unit_price_with_tax`),
    `[499] ${label} 含税单价须按 13% 得 ${decimalOf(expectedUnitWithTaxCents)}，实际 ${JSON.stringify(result.unit_price_with_tax)}`
  ).toBe(expectedUnitWithTaxCents);
  expect(
    centsOf(result.final_amount, `${label} final_amount`),
    `[499] ${label} 不含税总额须为折后单价×${QUANTITY}=${decimalOf(expectedFinalCents)}，实际 ${JSON.stringify(result.final_amount)}`
  ).toBe(expectedFinalCents);

  const finalCents = centsOf(result.final_amount, `${label} final_amount`);
  const taxCents = applyBasisPoints(finalCents, TAX_BASIS_POINTS);
  expect(taxCents, `[499] ${label} 按百分数税率 13% 计算的税额须为 ${decimalOf(taxCents)}`).toBe(
    applyBasisPoints(expectedFinalCents, TAX_BASIS_POINTS)
  );
  expect(
    finalCents + taxCents,
    `[499] ${label} 价税守恒：final_amount + tax 必须等于含税单价×数量，实得 ${decimalOf(finalCents + taxCents)}`
  ).toBe(centsOf(result.unit_price_with_tax, `${label} unit_price_with_tax`) * QUANTITY);
}

test.describe('报价试算 VIP 折扣与百分数价税守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('499-01 VIP 专用价优先于通用价，95 折与 13% 逐字段守恒', async ({ page }) => {
    const customerId = ctxCustomerId();
    const tag = genCode('499VIP');
    const host = await seedHost(page, tag);
    await seedPrice(page, host, VIP_BASE_CENTS, 'VIP', `${tag}-VIP`, ymd(-1));
    await seedPrice(page, host, GENERIC_BASE_CENTS, null, `${tag}-GENERIC`, ymd(-1));

    const vip = await calculate(page, bodyFor(customerId, host, 'VIP', ymd(0)));
    assertPricing(vip, {
      label: 'VIP 专用价',
      baseCents: VIP_BASE_CENTS,
      discountBasisPoints: VIP_DISCOUNT_BASIS_POINTS,
    });

    // NORMAL 的 customer_level_opt() 返回 None，只查 customer_level IS NULL 的通用行。
    const normal = await calculate(page, bodyFor(customerId, host, 'NORMAL', ymd(0)));
    assertPricing(normal, {
      label: 'NORMAL 通用价',
      baseCents: GENERIC_BASE_CENTS,
      discountBasisPoints: NORMAL_DISCOUNT_BASIS_POINTS,
    });
  });

  test('499-02 VIP 无专用价回退通用价，生效日前询价为 NOT_FOUND', async ({ page }) => {
    const customerId = ctxCustomerId();
    const tag = genCode('499FB');
    const host = await seedHost(page, tag);
    const effectiveFrom = ymd(-1);
    await seedPrice(page, host, FALLBACK_GENERIC_BASE_CENTS, null, `${tag}-GENERIC`, effectiveFrom);

    const vip = await calculate(page, bodyFor(customerId, host, 'VIP', ymd(0)));
    assertPricing(vip, {
      label: 'VIP 回退通用价',
      baseCents: FALLBACK_GENERIC_BASE_CENTS,
      discountBasisPoints: VIP_DISCOUNT_BASIS_POINTS,
    });

    const missing = await apiCallExpectFail(
      page,
      'POST',
      PATH,
      bodyFor(customerId, host, 'VIP', ymd(-3))
    );
    expect(
      missing.status,
      `[499] 询价日早于色价生效日必须 404，实际 ${missing.status} ${JSON.stringify(missing)}`
    ).toBe(404);
    expect(
      failureCode(missing),
      `[499] 缺价失败码必须为 NOT_FOUND，实际 ${JSON.stringify(missing)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
  });
});
