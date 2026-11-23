/**
 * 报价 50 行舍入守恒：逐行金额之和、表头小计与含税总额分位零差额
 *
 * 六要素
 * - 功能：验证 50 行混合数量在两位小数四舍五入口径下逐行金额与表头金额守恒、明细序号连续；数量按 R-598 刻度门限两位小数。
 * - 调用方：Playwright E2E（diagnose-fixture），仅调用 /api/v1/erp 纯 API，不打开业务页面。
 * - 入参：50 行，数量 0.01 与 0.33 交替、单价 1.00，税率 0，不含税口径。
 * - 传给谁：POST /quotations 建单、GET /quotations/{id} 回读详情、DELETE 清理客户与产品。
 * - 存什么：行 amount 的分位和、表头 subtotal/tax_amount/total_amount 与明细 sequence。
 * - 存哪里：只在用例进程内以 BigInt 分位比较，不写文件；后端落报价主表与明细表。
 *
 * 唯一事实源：backend/src/services/quotation_ops/calc.rs 的 calculate_totals 以
 *   Σround_money(quantity × unit_price) 再 round_money 得 subtotal；税率 0 时
 *   tax=round_money(subtotal × 0 / 100)、total=round_money(subtotal + tax)。
 *   crud.rs 的 insert_new_quotation_items 以 round_money(quantity × unit_price) 落行 amount，
 *   sequence 取 enumerate 下标（从 0 连续）。
 * 0.33 与 0.01 均为两位小数合法造数（R-598 拒绝超两位小数），行金额不依赖半进位语义。
 * 金额出参是定点数字符串，统一转 BigInt 分位比较，禁止 Number() 精确相等。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, genCode, loginViaUI, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

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

function rows(value: unknown, label: string): Row[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 数组，实际 ${JSON.stringify(value)}`);
  }
  return value.map((item, index) => requireRow(item, `${label}[${index}]`));
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
  for (const item of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', item.path, item.label);
  }
  CLEANUP.length = 0;
});

async function seed(page: Page): Promise<Seed> {
  const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
  const meId = int(me.id, 'GET /auth/me 用户 id');
  expect(meId, 'GET /auth/me 应返回当前用户 id').toBeGreaterThan(0);

  const code = genCode('E2E-592-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E五十行舍入产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = int(product.id, '建产品 id');
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/products/${productId}`, label: `五十行舍入产品 ${code}` });
  const productDetail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = str(productDetail.unit, '产品回读单位');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-592-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = int(customer.id, '建客户 id');
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({
    path: `/crm/customers/${customerId}`,
    label: `五十行舍入客户 ${customerName}`,
  });

  return { customerId, productId, productUnit, meId };
}

test.describe.serial('592 报价 50 行舍入守恒', () => {
  test('592-01 逐行金额分位和与表头小计/总额零差额，明细序号从 0 连续', async ({ page }) => {
    await loginViaUI(page);
    const ctx = await seed(page);

    const items = Array.from({ length: 50 }, (_, index) => ({
      product_id: ctx.productId,
      unit: ctx.productUnit,
      quantity: index % 2 === 0 ? '0.01' : '0.33',
      unit_price: '1.00',
      unit_price_with_tax: '1.00',
      discount_rate: '0',
    }));
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
      items,
      notes: 'E2E-592-五十行舍入守恒',
    });
    const quotationId = int(created.data?.id ?? NaN, '建报价单 id');
    expect(quotationId, '建报价单应返回有效 id').toBeGreaterThan(0);

    const detail = requireRow(
      await apiCallRaw<unknown>(page, 'GET', `/quotations/${quotationId}`),
      '报价单详情'
    );
    const detailItems = rows(detail.items, '明细');
    expect(detailItems.length, '明细条数应等于建单行数').toBe(50);

    let lineSum = 0n;
    detailItems.forEach((item, index) => {
      expect(int(item.sequence, `明细[${index}].sequence`), 'sequence 应从 0 连续').toBe(index);
      lineSum += toCents(str(item.amount, `明细[${index}].amount`));
    });

    // 25 × 0.01 + 25 × 0.33 = 8.50；既校验自洽也校验绝对口径，避免同错守恒。
    expect(formatCents(lineSum), '逐行金额分位和应为 8.50').toBe('8.50');
    const subtotal = toCents(str(detail.subtotal, 'subtotal'));
    const total = toCents(str(detail.total_amount, 'total_amount'));
    const tax = toCents(str(detail.tax_amount, 'tax_amount'));
    expect(subtotal - lineSum, '表头小计与逐行金额之和差额应为 0n').toBe(0n);
    expect(total - lineSum, '税率 0 时总额与逐行金额之和差额应为 0n').toBe(0n);
    expect(formatCents(tax), '税率 0 时税额应为 0.00').toBe('0.00');
  });
});
