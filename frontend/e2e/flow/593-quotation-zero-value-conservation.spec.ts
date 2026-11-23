/**
 * 报价零值守恒：0 数量、0 不含税单价、0 含税单价均建单成功且三金额全零
 *
 * 六要素
 * - 功能：验证零值入参不触发建单拒绝，且行额、列表金额与详情三金额逐分守恒为 0。
 * - 调用方：Playwright E2E（diagnose-fixture），仅调用 /api/v1/erp 纯 API，不打开业务页面。
 * - 入参：三张单分别取 quantity='0'、unit_price='0'、unit_price_with_tax='0'，税率 13，
 *   不含税与含税口径各覆盖；其余建单字段取合法常量。
 * - 传给谁：POST /quotations 建单、GET /quotations 按客户过滤、GET /quotations/{id} 回读。
 * - 存什么：行 amount/amount_with_tax 与表头 subtotal/tax_amount/total_amount 的分位值。
 * - 存哪里：只在用例进程内以 BigInt 分位比较，不写文件；客户与产品由清理队列删除。
 *
 * 唯一事实源：backend/src/models/quotation_create_dto.rs 对数量/单价/税率只有裸 Decimal 类型，
 *   无正值或小数位校验；calc.rs 的 calculate_totals 对零值按同一公式收敛为 0；
 *   crud.rs 的 insert_new_quotation_items 同样按 (quantity × unit_price).round_dp(2) 落行额。
 * 列表端点 ListQuotationsQuery 无 id 查询参数，故先按 customer_id 收窄再在用例内按 id 定位；
 *   列表行与详情同为 QuotationResponseDto，三金额可直接逐分比对。
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

interface ZeroCase {
  label: string;
  quantity: string;
  unitPrice: string;
  unitPriceWithTax: string;
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

  const code = genCode('E2E-593-P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E零值守恒产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = int(product.id, '建产品 id');
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/products/${productId}`, label: `零值守恒产品 ${code}` });
  const productDetail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = str(productDetail.unit, '产品回读单位');
  expect(productUnit, '产品回读应有交易单位供报价行取值').toBeTruthy();

  const customerName = genCode('E2E-593-C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = int(customer.id, '建客户 id');
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `零值守恒客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

test.describe.serial('593 报价零值守恒', () => {
  test('593-01 三张零值单建单成功，行额与列表/详情三金额逐分为 0n', async ({ page }) => {
    await loginViaUI(page);
    const ctx = await seed(page);
    const cases: ZeroCase[] = [
      {
        label: '数量为 0',
        quantity: '0',
        unitPrice: '1.00',
        unitPriceWithTax: '1.13',
        taxInclusive: false,
      },
      {
        label: '不含税单价为 0',
        quantity: '1',
        unitPrice: '0',
        unitPriceWithTax: '0',
        taxInclusive: false,
      },
      {
        label: '含税单价为 0',
        quantity: '1',
        unitPrice: '0',
        unitPriceWithTax: '0',
        taxInclusive: true,
      },
    ];

    for (const [index, item] of cases.entries()) {
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
            quantity: item.quantity,
            unit_price: item.unitPrice,
            unit_price_with_tax: item.unitPriceWithTax,
            discount_rate: '0',
          },
        ],
        notes: `E2E-593-${index}-零值守恒`,
      });
      const quotationId = int(created.data?.id ?? NaN, `${item.label} 建单 id`);
      expect(quotationId, `${item.label} 建单不应被拒，应返回有效 id`).toBeGreaterThan(0);

      const detail = requireRow(
        await apiCallRaw<unknown>(page, 'GET', `/quotations/${quotationId}`),
        `${item.label} 详情`
      );
      const detailItems = rows(detail.items, `${item.label} 明细`);
      expect(detailItems.length, `${item.label} 明细应恰有一行`).toBe(1);
      for (const key of ['amount', 'amount_with_tax']) {
        expect(
          formatCents(toCents(str(detailItems[0][key], `${item.label} 行 ${key}`))),
          `${item.label} 行 ${key} 应为 0.00`
        ).toBe('0.00');
      }
      for (const key of ['subtotal', 'tax_amount', 'total_amount']) {
        expect(
          formatCents(toCents(str(detail[key], `${item.label} 详情 ${key}`))),
          `${item.label} 详情 ${key} 应为 0.00`
        ).toBe('0.00');
      }

      const listing = requireRow(
        await apiCallRaw<unknown>(
          page,
          'GET',
          `/quotations?customer_id=${ctx.customerId}&page_size=100`
        ),
        `${item.label} 列表`
      );
      const listRow = rows(listing.list, `${item.label} 列表行`).find(
        row => int(row.id, `${item.label} 列表行 id`) === quotationId
      );
      expect(listRow, `${item.label} 列表应能按建单 id 找到该单`).toBeTruthy();
      const matched = requireRow(listRow, `${item.label} 命中的列表行`);
      for (const key of ['subtotal', 'tax_amount', 'total_amount']) {
        const diff =
          toCents(str(matched[key], `${item.label} 列表 ${key}`)) -
          toCents(str(detail[key], `${item.label} 详情 ${key}`));
        expect(diff, `${item.label} 列表与详情 ${key} 差额应为 0n`).toBe(0n);
      }
    }
  });
});
