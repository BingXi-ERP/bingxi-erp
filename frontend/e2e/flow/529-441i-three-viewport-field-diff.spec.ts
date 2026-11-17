import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  BASE_URL,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  failureCode,
  genCode,
  loginViaUI,
  tryCleanup,
} from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

/**
 * 方案 4.41 I 的可落地切片：宽视口建单、窄视口同端点逐字段读回、宽视口删除后窄视口回读。
 * 无独立 H5 前端，窄视口就是同一 SPA 切宽度；字段真值取 SalesOrderDetail / SalesOrderItemDetail，
 * DECIMAL 出参是字符串，所有金额与数量先 Number() 归一再逐字符/数值比对。
 * 前置客户与两件产品全部本用例自建，不读库里既有行；结束按 id 尽力清理。
 */
type Row = Record<string, unknown>;

const WIDE_VIEWPORT = { width: 1440, height: 900 };
const NARROW_VIEWPORT = { width: 390, height: 844 };
const EXPECTED_TOTAL = 243.75;
const EXPECTED_QTY_A = 12;
const EXPECTED_QTY_B = 3;
const EXPECTED_LINE_A = 222;
const EXPECTED_LINE_B = 21.75;

function requireKey(obj: Row, key: string, label: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`${label}: missing key ${key}; actual keys=${Object.keys(obj).join(',')}`);
  }
  return obj[key];
}

function requireNumber(obj: Row, key: string, label: string): number {
  const value = Number(requireKey(obj, key, label));
  if (!Number.isFinite(value)) {
    throw new Error(`${label}: key ${key} is not finite; raw=${String(obj[key])}`);
  }
  return value;
}

function requireString(obj: Row, key: string, label: string): string {
  const value = String(requireKey(obj, key, label));
  if (value.length === 0 || value === 'undefined' || value === 'null') {
    throw new Error(`${label}: key ${key} is empty; raw=${value}`);
  }
  return value;
}

function readItems(detail: Row, label: string): Row[] {
  const raw = requireKey(detail, 'items', label);
  if (!Array.isArray(raw)) {
    throw new Error(`${label}: key items is not an array; raw=${String(raw)}`);
  }
  return raw as Row[];
}

function pickItem(items: Row[], productId: number, label: string): Row {
  const hits = items.filter(item => requireNumber(item, 'product_id', label) === productId);
  if (hits.length !== 1) {
    throw new Error(
      `${label}: expected exactly one line for product ${productId}, got ${hits.length}`
    );
  }
  return hits[0]!;
}

function expectNumber(actual: number, expected: number, label: string): void {
  expect(actual, `${label}: expected ${expected}, got ${actual}`).toBe(expected);
}

function expectText(actual: string, expected: string, label: string): void {
  expect(actual, `${label}: expected ${expected}, got ${actual}`).toBe(expected);
}

async function readOrderDetail(page: Page, orderId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
}

async function enterSalesList(page: Page): Promise<void> {
  const listResponse = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      response.status() === 200 &&
      response.url().includes('/api/v1/erp/sales/orders') &&
      !/\/api\/v1\/erp\/sales\/orders\/\d/.test(response.url()),
    { timeout: 30_000 }
  );
  await page.goto(`${BASE_URL}/sales`, { waitUntil: 'domcontentloaded' });
  await listResponse;
}

test('529 4.41 I 三视口字段级 diff：宽建单、窄回读、删后窄回读', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(WIDE_VIEWPORT);
  await loginViaUI(page);

  const tag = genCode('529TV');
  let customerId = -1;
  let productAId = -1;
  let productBId = -1;
  let orderId = -1;
  let orderDeleted = false;

  try {
    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_code: `E2E529C-${tag}`,
      customer_name: `E2E529C-${tag}`,
      customer_type: 'retail',
      status: 'active',
    });
    customerId = requireNumber(customer, 'id', 'customer create');
    expect(Number.isInteger(customerId)).toBe(true);
    expect(customerId > 0).toBe(true);

    const productA = await apiCallRaw<Row>(page, 'POST', '/products', {
      name: `E2E529A-${tag}`,
      code: `E2E529A-${tag}`,
      unit: 'M',
      status: 'active',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    productAId = requireNumber(productA, 'id', 'product A create');
    expect(Number.isInteger(productAId)).toBe(true);
    expect(productAId > 0).toBe(true);

    const productB = await apiCallRaw<Row>(page, 'POST', '/products', {
      name: `E2E529B-${tag}`,
      code: `E2E529B-${tag}`,
      unit: 'M',
      status: 'active',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    productBId = requireNumber(productB, 'id', 'product B create');
    expect(Number.isInteger(productBId)).toBe(true);
    expect(productBId > 0).toBe(true);

    const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      required_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      shipping_address: `E2E529-${tag}`,
      notes: `E2E529-${tag}`,
      items: [
        { product_id: productAId, quantity: '12.00', unit_price: '18.50' },
        { product_id: productBId, quantity: '3.00', unit_price: '7.25' },
      ],
    });
    orderId = requireNumber(created, 'id', 'order create');
    expect(Number.isInteger(orderId)).toBe(true);
    expect(orderId > 0).toBe(true);
    const orderNo = requireString(created, 'order_no', 'order create');
    expect(/^SO\d{11}$/.test(orderNo), `unexpected order_no ${orderNo}`).toBe(true);
    console.warn(`[529] wide create ok orderId=${orderId} orderNo=${orderNo}`);

    const wide = await readOrderDetail(page, orderId);
    expectNumber(requireNumber(wide, 'id', 'wide detail'), orderId, 'wide.id');
    expectText(requireString(wide, 'order_no', 'wide detail'), orderNo, 'wide.order_no');
    expectText(requireString(wide, 'status', 'wide detail'), 'draft', 'wide.status');
    expectNumber(
      Number(requireKey(wide, 'total_amount', 'wide detail')),
      EXPECTED_TOTAL,
      'wide.total_amount'
    );

    const wideItems = readItems(wide, 'wide detail');
    expect(wideItems.length, `wide.items: expected 2, got ${wideItems.length}`).toBe(2);
    const wideA = pickItem(wideItems, productAId, 'wide detail');
    const wideB = pickItem(wideItems, productBId, 'wide detail');
    expectNumber(
      Number(requireKey(wideA, 'quantity', 'wide line A')),
      EXPECTED_QTY_A,
      'wide line A quantity'
    );
    expectNumber(
      Number(requireKey(wideA, 'subtotal', 'wide line A')),
      EXPECTED_LINE_A,
      'wide line A subtotal'
    );
    expectNumber(
      Number(requireKey(wideA, 'total_amount', 'wide line A')),
      EXPECTED_LINE_A,
      'wide line A total_amount'
    );
    expectNumber(
      Number(requireKey(wideB, 'quantity', 'wide line B')),
      EXPECTED_QTY_B,
      'wide line B quantity'
    );
    expectNumber(
      Number(requireKey(wideB, 'subtotal', 'wide line B')),
      EXPECTED_LINE_B,
      'wide line B subtotal'
    );
    expectNumber(
      Number(requireKey(wideB, 'total_amount', 'wide line B')),
      EXPECTED_LINE_B,
      'wide line B total_amount'
    );
    console.warn(`[529] wide snapshot ok total=${EXPECTED_TOTAL} lines=${wideItems.length}`);

    await page.setViewportSize(NARROW_VIEWPORT);
    await enterSalesList(page);
    const narrow = await readOrderDetail(page, orderId);
    expectNumber(requireNumber(narrow, 'id', 'narrow detail'), orderId, 'narrow.id');
    expectText(requireString(narrow, 'order_no', 'narrow detail'), orderNo, 'narrow.order_no');
    expectText(
      requireString(narrow, 'status', 'narrow detail'),
      requireString(wide, 'status', 'wide detail'),
      'narrow.status vs wide.status'
    );
    expectNumber(
      Number(requireKey(narrow, 'total_amount', 'narrow detail')),
      Number(requireKey(wide, 'total_amount', 'wide detail')),
      'narrow.total_amount vs wide.total_amount'
    );

    const narrowItems = readItems(narrow, 'narrow detail');
    expect(
      narrowItems.length,
      `narrow.items: expected ${wideItems.length}, got ${narrowItems.length}`
    ).toBe(wideItems.length);
    const narrowA = pickItem(narrowItems, productAId, 'narrow detail');
    const narrowB = pickItem(narrowItems, productBId, 'narrow detail');
    for (const [key, label] of [
      ['quantity', 'quantity'],
      ['unit_price', 'unit_price'],
      ['subtotal', 'subtotal'],
      ['total_amount', 'total_amount'],
    ] as const) {
      expectNumber(
        Number(requireKey(narrowA, key, `narrow line A`)),
        Number(requireKey(wideA, key, `wide line A`)),
        `narrow line A ${label} vs wide`
      );
      expectNumber(
        Number(requireKey(narrowB, key, `narrow line B`)),
        Number(requireKey(wideB, key, `wide line B`)),
        `narrow line B ${label} vs wide`
      );
    }
    console.warn(`[529] narrow field diff ok orderId=${orderId}`);

    await page.setViewportSize(WIDE_VIEWPORT);
    await apiCall(page, 'DELETE', `/sales/orders/${orderId}`);
    orderDeleted = true;
    console.warn(`[529] wide delete ok orderId=${orderId}`);

    await page.setViewportSize(NARROW_VIEWPORT);
    await enterSalesList(page);
    const tableMain = page.locator('.el-table-v2__main').first();
    await expect(tableMain, 'sales list main table must render').toHaveCount(1);
    await expect(
      tableMain.locator('.el-table-v2__row').filter({ hasText: orderNo }),
      `deleted order ${orderNo} must have no list row`
    ).toHaveCount(0);
    const gone = await apiCallExpectFail(page, 'GET', `/sales/orders/${orderId}`);
    expect(gone.status, `deleted order readback: expected 404, got ${gone.status}`).toBe(404);
    expect(
      failureCode(gone),
      `deleted order readback code: expected ${APP_ERROR_CODES.NOT_FOUND}, got ${String(
        failureCode(gone)
      )}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    console.warn(`[529] narrow post-delete readback ok orderId=${orderId}`);
  } finally {
    if (orderDeleted === false && orderId > 0) {
      await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, '529 order');
    }
    if (productBId > 0) {
      await tryCleanup(page, 'DELETE', `/products/${productBId}`, '529 product B');
    }
    if (productAId > 0) {
      await tryCleanup(page, 'DELETE', `/products/${productAId}`, '529 product A');
    }
    if (customerId > 0) {
      await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, '529 customer');
    }
  }
});
