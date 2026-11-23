/**
 * 折扣等值边界：行折扣率恰好等于阈值时走自批，超出 0.01 个百分点时进强制审批
 *
 * 判定唯一来源：backend/src/services/quotation_discount_service.rs 的
 *   over_threshold = max_discount_pct > threshold_pct（严格大于，等值不算超阈）。
 * 阈值来源：单行配置 quotation_discount_approval_configs，经
 *   PUT/GET /quotations/discount-config 读写；测试结束恢复原值。
 * 金额侧保持 1 元（远低于 10 万自批档），确保分支变量只有折扣率一个。
 * 状态词表：quotation_ext 小写 pending_approval / approved（models/status/sales.rs）。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

const EQUAL_THRESHOLD = '5.00';
const EQUAL_RATE = '5';
const OVER_RATE = '5.01';

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

  const code = genCode('E2E-THR-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E折扣边界产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product?.id);
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = String(detail?.unit ?? '');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-THR-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = Number(customer?.id);
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `折扣边界客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

async function submitAtRate(
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
        quantity: '1',
        unit_price: '1',
        unit_price_with_tax: '1',
        discount_rate: discountRate,
      },
    ],
    notes,
  });
  const id = Number(created.data?.id);
  expect(id, '建报价单应返回有效 id').toBeGreaterThan(0);
  const submitted = await apiCall<Row>(page, 'POST', `/quotations/${id}/submit`);
  expect(submitted.data, '提交应返回报价单出参').toBeTruthy();
  return submitted.data as Row;
}

test.describe.serial('588 折扣等值边界', () => {
  test('588-01 等值不超阈自批 approved，超 0.01 个点进 pending_approval', async ({ page }) => {
    await loginViaUI(page);
    const original = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    const originalThreshold = Number(original.over_discount_threshold_pct);
    const ctx = await seed(page);

    try {
      const configured = await apiCall<Row>(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: EQUAL_THRESHOLD,
      });
      expect(Number(configured.data?.over_discount_threshold_pct), 'PUT 阈值应回读为 5.00').toBe(5);

      const equal = await submitAtRate(page, ctx, EQUAL_RATE, 'E2E-588-折扣等值');
      expect(equal.status, '折扣率 5 等于阈值 5 不超阈，金额可自批应 approved').toBe('approved');
      expect(Number(equal.approved_by), '自批 approved_by 应为当前操作人').toBe(ctx.meId);

      const over = await submitAtRate(page, ctx, OVER_RATE, 'E2E-588-折扣超阈');
      expect(
        over.status,
        '折扣率 5.01 严格大于阈值 5 触发超折扣门，金额再小也应 pending_approval'
      ).toBe('pending_approval');
      expect(Number(over.submitted_by), '进审批的 submitted_by 应留痕为当前操作人').toBe(ctx.meId);
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
