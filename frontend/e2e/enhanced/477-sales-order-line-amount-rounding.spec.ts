// 4.16 数值精度：销售订单行「小计→折扣→折后→税→合计」逐步 round_dp(2)，表头四金额=逐行相加。
// 后端判据：services/so/amounts.rs:69-73 calculate_line_amounts：
//   subtotal=(qty*price).round_dp(2)；discount=(subtotal*pct/100).round_dp(2)；
//   after=(subtotal-discount).round_dp(2)；tax=(after*tax/100).round_dp(2)；
//   total=(after+tax).round_dp(2)；:88-96 sum_line_amounts 逐行累加表头；
//   order_crud.rs:432-436 落库表头四金额列。
// 与既有用例分工：71 只测无折扣行 qty×price 聚合、91 期望值从行动态推导、507 只读表头总额、
//   454 是报价行舍入（不同单据）；本例专补销售订单行带折扣带税的四金额固定期望零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, getCtx, loginViaUI, tryCleanup } from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface Line {
  unit_price?: string;
  quantity?: string;
  subtotal?: string;
  discount_amount?: string;
  tax_amount?: string;
  total_amount?: string;
}
interface Order {
  id?: number;
  items?: Line[];
  subtotal?: string;
  discount_amount?: string;
  tax_amount?: string;
  total_amount?: string;
}

function cents(raw: string | number | undefined, label: string): bigint {
  if (raw === undefined) throw new Error(`${label}：缺少后端真实金额字段`);
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(String(raw));
  if (!m) throw new Error(`${label}：无法解析金额 ${String(raw)}`);
  return BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0').slice(0, 2));
}

async function seedCustomer(page: Page): Promise<number> {
  const code = genCode('E477C');
  const res = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/crm/customers', {
    customer_code: code,
    customer_name: `477舍入客户_${code}`,
  });
  const id = Number(res.data?.id);
  expect(id, '[477] 建客户失败').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${id}`, label: 'customer' });
  return id;
}

test.describe('4.16 销售订单行金额舍入', () => {
  test('477-01 折扣税逐步 round_dp(2)，行四金额固定期望且表头=逐行之和', async ({ page }) => {
    await loginViaUI(page);
    const customerId = await seedCustomer(page);
    const productId = getCtx().productIds[0];
    expect(productId, '[477] 前置：ctx.productIds[0] 未就绪').toBeGreaterThan(0);

    // 行1：3 × 7.777 = 23.331→23.33；折扣15%→3.4995→3.50；折后 19.83；
    //   税13%→2.5779→2.58；合计 22.41。
    // 行2：2 × 5.555 = 11.11；无折扣无税→合计 11.11。
    const created = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      items: [
        {
          product_id: productId,
          quantity: '3',
          unit_price: '7.777',
          discount_percent: '15',
          tax_percent: '13',
        },
        {
          product_id: productId,
          quantity: '2',
          unit_price: '5.555',
          discount_percent: '0',
          tax_percent: '0',
        },
      ],
    });
    const id = Number(created.data?.id);
    expect(id, `[477] 建单失败：${JSON.stringify(created)}`).toBeGreaterThan(0);
    CLEANUP.push({ path: `/sales/orders/${id}`, label: 'sales_order' });

    const detail = await apiCallRaw<Order>(page, 'GET', `/sales/orders/${id}`);
    const lines = detail.items ?? [];
    expect(lines.length, '[477] 回读须有两行明细').toBe(2);
    const near = (raw: string | number | undefined, target: number) =>
      Math.abs(Number(raw) - target) < 0.0001;
    const l1 = lines.find(l => near(l.unit_price, 7.777));
    const l2 = lines.find(l => near(l.unit_price, 5.555));
    expect(l1 && l2, '[477] 两行须按单价 7.777/5.555 区分').toBe(true);

    expect(cents(l1!.subtotal, '行1小计'), '[477] 行1小计=23.33').toBe(2333n);
    expect(cents(l1!.discount_amount, '行1折扣'), '[477] 行1折扣=3.50').toBe(350n);
    expect(cents(l1!.tax_amount, '行1税'), '[477] 行1税=2.58').toBe(258n);
    expect(cents(l1!.total_amount, '行1合计'), '[477] 行1合计=22.41').toBe(2241n);

    expect(cents(l2!.subtotal, '行2小计'), '[477] 行2小计=11.11').toBe(1111n);
    expect(cents(l2!.discount_amount, '行2折扣'), '[477] 行2折扣=0').toBe(0n);
    expect(cents(l2!.tax_amount, '行2税'), '[477] 行2税=0').toBe(0n);
    expect(cents(l2!.total_amount, '行2合计'), '[477] 行2合计=11.11').toBe(1111n);

    // 表头四金额 = 逐行相加（23.33+11.11 / 3.50+0 / 2.58+0 / 22.41+11.11）
    expect(cents(detail.subtotal, '表头小计'), '[477] 表头小计=34.44').toBe(3444n);
    expect(cents(detail.discount_amount, '表头折扣'), '[477] 表头折扣=3.50').toBe(350n);
    expect(cents(detail.tax_amount, '表头税'), '[477] 表头税=2.58').toBe(258n);
    expect(cents(detail.total_amount, '表头合计'), '[477] 表头合计=33.52').toBe(3352n);
  });
});
