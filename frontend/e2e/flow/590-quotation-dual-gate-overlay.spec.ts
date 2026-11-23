/**
 * 金额门与超折扣门叠加：两门都命中时取更严者走 BPM，不自批、不短路
 *
 * 唯一事实源：backend/src/services/quotation_approval_service.rs 的 submit：
 *   role = ApproverRole::from_amount(total_amount)（<10万自批，10-50万经理档）；
 *   verdict = QuotationDiscountService::evaluate(...)；
 *   仅 role==Salesperson && !verdict.over_threshold 才自批 approved，其余一律
 *   写 pending_approval + submitted_by（submit_to_bpm，:319/:399）。
 * 本例构造 12 万（金额经理档）+ 行折扣 10>阈值 5（超折扣门）双命中，断言
 *   状态 pending_approval、approved_by 空、submitted_by 留痕；
 *   并以同金额折扣 0 的对照单证明金额门独立也能进审批（折扣门不短路金额门）。
 * 金额构造沿用 444：quantity=120000、unit_price=1.00，total_amount 回读须等于 12 万。
 * 状态词表：quotation_ext 小写 pending_approval / approved。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

const OVER_THRESHOLD = '5.00';
const OVER_RATE = '10';
const UNDER_RATE = '0';
const AMOUNT = '120000';

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

interface Seed {
  customerId: number;
  productId: number;
  productUnit: string;
  meId: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

async function seed(page: import('@playwright/test').Page): Promise<Seed> {
  const me = await apiCallRaw<{ id: number }>(page, 'GET', '/auth/me');
  const meId = Number(me?.id);
  expect(meId, 'GET /auth/me 应返回当前用户 id').toBeGreaterThan(0);

  const code = genCode('E2E-DGATE-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E双门叠加产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product?.id);
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = String(detail?.unit ?? '');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-DGATE-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = Number(customer?.id);
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `双门叠加客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

async function submitLargeAtRate(
  page: import('@playwright/test').Page,
  ctx: Seed,
  discountRate: string,
  notes: string
): Promise<Row> {
  const created = await apiCall<Row>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: ctx.meId,
    quotation_date: isoDate(0),
    valid_until: isoDate(30),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: false,
    tax_rate: '0',
    items: [
      {
        product_id: ctx.productId,
        unit: ctx.productUnit,
        quantity: AMOUNT,
        unit_price: '1.00',
        unit_price_with_tax: '1.00',
        discount_rate: discountRate,
      },
    ],
    notes,
  });
  const id = Number(created.data?.id);
  expect(id, '建报价单应返回有效 id').toBeGreaterThan(0);
  const stored = await apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
  expect(Number(stored.total_amount), '金额变量须回读为 120000，否则金额门分支不唯一').toBe(
    Number(AMOUNT)
  );

  const submitted = await apiCall<Row>(page, 'POST', `/quotations/${id}/submit`);
  expect(submitted.data, '提交应返回报价单出参').toBeTruthy();
  return submitted.data as Row;
}

test.describe.serial('590 金额门与超折扣门叠加', () => {
  test('590-01 大额叠加超折扣：取更严者进审批且 submitted_by 留痕', async ({ page }) => {
    await loginViaUI(page);
    const original = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    const originalThreshold = Number(original.over_discount_threshold_pct);
    const ctx = await seed(page);

    try {
      await apiCall(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: OVER_THRESHOLD,
      });

      const both = await submitLargeAtRate(page, ctx, OVER_RATE, 'E2E-590-双门叠加');
      expect(both.status, '金额 12 万经理档叠加折扣 10>5 超阈，应 pending_approval 不得自批').toBe(
        'pending_approval'
      );
      expect(Number(both.submitted_by), '进审批的 submitted_by 应留痕为当前操作人').toBe(ctx.meId);
      expect(
        both.approved_by == null || Number(both.approved_by) === 0,
        '双门叠加未走自批腿，approved_by 不得被写入操作人'
      ).toBe(true);

      const amountOnly = await submitLargeAtRate(page, ctx, UNDER_RATE, 'E2E-590-仅金额门');
      expect(
        amountOnly.status,
        '同金额但折扣 0 未超阈，金额门独立也应 pending_approval（折扣门不短路金额门）'
      ).toBe('pending_approval');
      expect(Number(amountOnly.submitted_by), '金额门进审批也应留痕 submitted_by').toBe(ctx.meId);
    } finally {
      await apiCall(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: String(originalThreshold),
      });
      const restored = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
      expect(Number(restored.over_discount_threshold_pct), '收尾阈值应恢复到原值').toBe(
        originalThreshold
      );
    }
  });
});
