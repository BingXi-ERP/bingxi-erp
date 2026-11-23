/**
 * 报价三处金额一致：列表行、详情表头/明细、提交审批后回读逐分相等
 *
 * 六要素
 * - 功能：验证同一张报价单在列表行、详情 DTO 与提交后详情三处金额逐分一致。
 * - 调用方：Playwright E2E（diagnose-fixture），仅调用 /api/v1/erp 纯 API，不打开业务页面。
 * - 入参：含税与不含税各一张单，数量 1、单价 1.00、含税单价 1.13、税率 13、折扣 0。
 * - 传给谁：POST /quotations 建单、GET /quotations 按客户过滤、GET /quotations/{id} 回读、
 *   POST /quotations/{id}/submit 走小额自批。
 * - 存什么：列表行与详情的 subtotal/tax_amount/total_amount 及明细 amount 的分位值。
 * - 存哪里：只在用例进程内以 BigInt 分位比较，不写文件；客户与产品由清理队列删除。
 *
 * 唯一事实源：backend/src/handlers/quotation_handler.rs 的 list_quotations/get_quotation
 *   均返回 QuotationResponseDto，三金额键为 subtotal/tax_amount/total_amount，明细键为 items；
 *   approval_service.rs 的 submit 在金额小于 10 万且未超折扣门时直接写 approved，
 *   审批页 approval.vue 无独立读端点，其数据源就是这张详情 DTO，故只断言详情回读。
 * 列表端点 ListQuotationsQuery 无 id 查询参数，故先按 customer_id 收窄再在用例内按 id 定位。
 * 本例不读写折扣阈值配置，收尾无需恢复配置；小额与折扣 0 确保走自批路径。
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

function isoDate(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

interface Seed {
  customerId: number;
  productId: number;
  productUnit: string;
  meId: number;
}

interface QuoteCase {
  label: string;
  taxInclusive: boolean;
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

  const code = genCode('E2E-595-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E三处一致产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = int(product.id, '建产品 id');
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/products/${productId}`, label: `三处一致产品 ${code}` });
  const productDetail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = str(productDetail.unit, '产品回读单位');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-595-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = int(customer.id, '建客户 id');
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `三处一致客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

async function createQuote(page: Page, ctx: Seed, item: QuoteCase, index: number): Promise<number> {
  const created = await apiCall<Row>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: ctx.meId,
    quotation_date: isoDate(0),
    valid_until: isoDate(30),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: item.taxInclusive,
    tax_rate: '13',
    items: [
      {
        product_id: ctx.productId,
        unit: ctx.productUnit,
        quantity: '1',
        unit_price: '1.00',
        unit_price_with_tax: '1.13',
        discount_rate: '0',
      },
    ],
    notes: `E2E-595-${index}-${item.label}`,
  });
  const quotationId = int(created.data?.id ?? NaN, `${item.label} 建单 id`);
  expect(quotationId, `${item.label} 建单应返回有效 id`).toBeGreaterThan(0);
  return quotationId;
}

async function readDetail(page: Page, quotationId: number, label: string): Promise<Row> {
  return requireRow(
    await apiCallRaw<unknown>(page, 'GET', `/quotations/${quotationId}`),
    `${label} 详情`
  );
}

async function findListRow(
  page: Page,
  ctx: Seed,
  quotationId: number,
  label: string
): Promise<Row> {
  const listing = requireRow(
    await apiCallRaw<unknown>(
      page,
      'GET',
      `/quotations?customer_id=${ctx.customerId}&page_size=100`
    ),
    `${label} 列表`
  );
  const found = rows(listing.list, `${label} 列表行`).find(
    row => int(row.id, `${label} 列表行 id`) === quotationId
  );
  expect(found, `${label} 列表应能按建单 id 找到该单`).toBeTruthy();
  return requireRow(found, `${label} 命中的列表行`);
}

function assertThreeSourcesEqual(listRow: Row, detail: Row, label: string): void {
  for (const key of ['subtotal', 'tax_amount', 'total_amount']) {
    const diff =
      toCents(str(listRow[key], `${label} 列表 ${key}`)) -
      toCents(str(detail[key], `${label} 详情 ${key}`));
    expect(diff, `${label} 列表与详情 ${key} 差额应为 0n`).toBe(0n);
  }
  const detailItems = rows(detail.items, `${label} 明细`);
  expect(detailItems.length, `${label} 明细应恰有一行`).toBe(1);
  const line = toCents(str(detailItems[0].amount, `${label} 明细 amount`));
  expect(
    line - toCents(str(detail.subtotal, `${label} 详情 subtotal`)),
    `${label} 行额与表头小计差额应为 0n`
  ).toBe(0n);
}

test.describe.serial('595 报价三处金额一致', () => {
  test('595-01 含税/不含税单在提交前后列表与详情三金额逐分相等', async ({ page }) => {
    await loginViaUI(page);
    const ctx = await seed(page);
    const cases: QuoteCase[] = [
      { label: '不含税', taxInclusive: false },
      { label: '含税', taxInclusive: true },
    ];

    for (const [index, item] of cases.entries()) {
      const quotationId = await createQuote(page, ctx, item, index);
      const before = await readDetail(page, quotationId, `${item.label} 提交前`);
      assertThreeSourcesEqual(
        await findListRow(page, ctx, quotationId, `${item.label} 提交前`),
        before,
        `${item.label} 提交前`
      );

      const submitted = requireRow(
        (await apiCall<Row>(page, 'POST', `/quotations/${quotationId}/submit`)).data,
        `${item.label} 提交出参`
      );
      expect(submitted.status, `${item.label} 小额折扣 0 应走自批 approved`).toBe('approved');

      // 审批页无独立 API，其数据源就是详情 DTO；提交后同时回读列表与详情证明三处仍一致。
      const after = await readDetail(page, quotationId, `${item.label} 提交后`);
      assertThreeSourcesEqual(
        await findListRow(page, ctx, quotationId, `${item.label} 提交后`),
        after,
        `${item.label} 提交后`
      );
      expect(
        toCents(str(after.total_amount, `${item.label} 提交后 total_amount`)) -
          toCents(str(before.total_amount, `${item.label} 提交前 total_amount`)),
        `${item.label} 提交不应改动金额，前后差额应为 0n`
      ).toBe(0n);
    }
  });
});
