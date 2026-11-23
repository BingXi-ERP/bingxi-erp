// 596 半分边界四舍五入：x.xx5 离零进位、x.xx4 舍去、行腿与表头同源逐字符守恒
//
// 功能：报价金额链在 R-596 落地后统一走 round_money（round_dp_with_strategy(2,
//   MidpointAwayFromZero) 四舍五入离零进位）。本例用最小可判别单价组合钉住
//   半分边界，证明 1.005→1.01（进位）而 1.004→1.00（舍去）、2.005→2.01，
//   并断言行腿 amount 与表头 total_amount 逐字符一致（两处同源，无分差）。
// 调用方：Playwright E2E（diagnose-fixture），仅调用 /api/v1/erp 纯 API。
// 入参：三张小额不含税报价单（quantity=1 × unit_price 分别 1.005/1.004/2.005，
//   discount_rate=0、tax_rate=0）。
// 传给谁：POST /quotations 建单、GET /quotations/{id} 回读详情、DELETE 清理客户。
// 存什么：断言行腿与表头金额字符串；后端落 sales_quotations 主表与明细表。
// 存哪里：只在用例进程内断言，不写文件。
//
// 唯一事实源：backend/src/services/quotation_ops/calc.rs 的 round_money 与
//   calculate_totals（含税前行腿 Σround_money(qty×unit_price) 再 round_money）；
//   crud.rs/update.rs 行腿 amount 同用 round_money。rust_decimal 的
//   MidpointAwayFromZero 对正数即四舍五入：1.005→1.01、1.004→1.00、2.005→2.01。
// 检测力：若实现回退 bank 舍入（MidpointNearestEven），1.005 与 2.005 会进到
//   1.00 / 2.00，本例即红；若行腿与表头各用一处舍入，逐字符断言也会红。
// 前置约束：unit_price 为 DECIMAL(18,6)，1.005/1.004/2.005 均合法；
//   quantity=1 为整数两位内合法（R-598 数量刻度门不拦）。
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

  const code = genCode('E2E596P');
  const product = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E半分边界产品${code}`,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const productId = Number(product?.id);
  expect(productId, '建产品应返回有效 id').toBeGreaterThan(0);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  const productUnit = String(detail?.unit ?? '');

  const customerName = genCode('E2E596C');
  const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: customerName,
    contact_phone: '13800000000',
  });
  const customerId = Number(customer?.id);
  expect(customerId, '建客户应返回有效 id').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `半分边界客户 ${customerName}` });

  return { customerId, productId, productUnit, meId };
}

/** 建一张单行不含税报价单并回读详情，返回详情出参 */
async function createAndRead(
  page: import('@playwright/test').Page,
  ctx: Seed,
  unitPrice: string,
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
        unit_price: unitPrice,
        unit_price_with_tax: unitPrice,
        discount_rate: '0',
      },
    ],
    notes,
  });
  const id = Number(created.data?.id);
  expect(id, '建报价单应返回有效 id').toBeGreaterThan(0);
  return apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
}

test.describe.serial('596 半分边界四舍五入', () => {
  test('596-01 1.005 进位 1.01、1.004 舍去 1.00、2.005 进位 2.01，行腿与表头逐字符一致', async ({
    page,
  }) => {
    await loginViaUI(page);
    const ctx = await seed(page);

    const cases: Array<{ price: string; expected: string; label: string }> = [
      { price: '1.005', expected: '1.01', label: '第三位 5 进位' },
      { price: '1.004', expected: '1.00', label: '第三位 4 舍去' },
      { price: '2.005', expected: '2.01', label: '第三位 5 跨整数进位' },
    ];
    for (const c of cases) {
      const row = await createAndRead(page, ctx, c.price, `E2E-596-${c.label}`);
      const detailItems = Array.isArray((row as { items?: unknown[] }).items)
        ? (row as { items: Row[] }).items
        : [];
      expect(detailItems.length, `单价 ${c.price} 应恰有一行明细`).toBe(1);
      const itemAmount = String(detailItems[0]?.amount ?? '');
      const totalAmount = String(row.total_amount ?? '');
      expect(itemAmount, `单价 ${c.price} 行腿 amount 应为 ${c.expected}（${c.label}）`).toBe(
        c.expected
      );
      expect(
        totalAmount,
        `单价 ${c.price} 表头 total_amount 应为 ${c.expected}（${c.label}）`
      ).toBe(c.expected);
      expect(
        itemAmount === totalAmount,
        `单价 ${c.price} 行腿与表头须逐字符同源，实际行=${itemAmount} 头=${totalAmount}`
      ).toBe(true);
    }
  });
});
