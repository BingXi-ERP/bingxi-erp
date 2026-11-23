/**
 * 折扣阈值取值域两端：阈值 0 与 100 的严格大于判定
 *
 * 配置域事实：backend/src/services/quotation_discount_service.rs:37/42 定义
 *   THRESHOLD_MIN=0、THRESHOLD_MAX=100，:208 拒绝域外值；两位小数刻度同列型 DECIMAL(5,2)。
 * 判定事实：同文件 over_threshold = max_discount_pct > threshold_pct（严格大于）。
 * 故阈值 0 时折扣 0 不超阈、0.01 超阈；阈值 100 时折扣 100 亦不超阈。
 * 金额恒为 1 元（远低于 10 万自批档），分支变量只有折扣判定一个。
 * 状态词表：quotation_ext 小写 pending_approval / approved。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

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

  const code = genCode('E2E-THR2-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E阈值两端产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product?.id);
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = String(detail?.unit ?? '');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-THR2-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = Number(customer?.id);
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `阈值两端客户 ${customerName}` });

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

test.describe.serial('589 折扣阈值取值域两端', () => {
  test('589-01 阈值 0：折扣 0 不超阈自批，折扣 0.01 超阈进审批', async ({ page }) => {
    await loginViaUI(page);
    const original = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    const originalThreshold = Number(original.over_discount_threshold_pct);
    const ctx = await seed(page);

    try {
      const configured = await apiCall<Row>(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: '0.00',
      });
      expect(
        Number(configured.data?.over_discount_threshold_pct),
        '阈值下界 0.00 应被接受并回读'
      ).toBe(0);

      const zero = await submitAtRate(page, ctx, '0', 'E2E-589-阈值零折扣零');
      expect(zero.status, '阈值 0、折扣 0 不满足严格大于，应自批 approved').toBe('approved');
      expect(Number(zero.approved_by), '自批 approved_by 应为当前操作人').toBe(ctx.meId);

      const positive = await submitAtRate(page, ctx, '0.01', 'E2E-589-阈值零折扣正');
      expect(positive.status, '阈值 0、折扣 0.01 严格大于触发超折扣门，应 pending_approval').toBe(
        'pending_approval'
      );
      expect(Number(positive.submitted_by), '进审批的 submitted_by 应留痕').toBe(ctx.meId);
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

  test('589-02 阈值 100：折扣 100 等值不超阈自批', async ({ page }) => {
    await loginViaUI(page);
    const original = await apiCallRaw<Row>(page, 'GET', '/quotations/discount-config');
    const originalThreshold = Number(original.over_discount_threshold_pct);
    const ctx = await seed(page);

    try {
      const configured = await apiCall<Row>(page, 'PUT', '/quotations/discount-config', {
        over_discount_threshold_pct: '100.00',
      });
      expect(
        Number(configured.data?.over_discount_threshold_pct),
        '阈值上界 100.00 应被接受并回读'
      ).toBe(100);

      const atMax = await submitAtRate(page, ctx, '100', 'E2E-589-阈值上限等值');
      expect(atMax.status, '阈值 100、折扣 100 等值不满足严格大于，应自批 approved').toBe(
        'approved'
      );
      expect(Number(atMax.approved_by), '自批 approved_by 应为当前操作人').toBe(ctx.meId);
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
