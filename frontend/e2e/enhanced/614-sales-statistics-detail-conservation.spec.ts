// 4.23 报表口径 + 4.16 汇总守恒：销售订单统计端点与订单明细同源，同一过滤条件下
//   total_orders 等于明细行数、total_amount 等于明细 total_amount 之和，金额按 scaled BigInt 比较。
// 后端判据：routes/sales.rs:80-81 挂 GET /sales/orders/statistics 与 GET /sales/orders；
//   handlers/sales_order_handler.rs:975-1004 用 typed DTO 收 start_date/end_date/customer_id，
//   customer_id 以 Value::Number 重建交 service（避免 urlencoded 值被 as_i64 丢掉）；
//   services/so/order_query.rs:555-561 count(id)+sum(total_amount) 且 customer_id 过滤，
//   :564-581 order_date >= 起始日 00:00 且 < 截止日次日 00:00；出参 total_orders/total_amount。
// 权限口径：列表端点 handler :50/66 带 data_scope（owner=CreatedBy），统计端点 :981 首参 _auth 无 scope；
//   e2e worker 账号属 admin 角色（init_service_ops/role.rs:55-61 data_scope=all），两端同会话比对不串口径。
// 状态词表：统计 sum(total_amount) 无状态过滤、列表亦无默认 status 过滤，两侧均含全部状态；
//   不写"业务员只见自己"断言——聚合端点无行级权限下推属功能缺口，另在 E2E 报告遗留风险登记。
// 与既有覆盖分工：455 验统计端点的日期区间下推与非法格式拒绝，02-bi-aggregate 验 CRM summary 与
//   列表金额交叉；本例只锁 statistics 与 /sales/orders 列表在同一自建客户+日期下的同源守恒。
// 检测力：统计与明细一旦口径漂移（客户/日期过滤不一致、金额算法不一致），分位 BigInt 之和即判红。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  apiCallRaw,
  ensureTestEntities,
  getCtx,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface CleanupEntry {
  path: string;
  label: string;
}

const CLEANUP: CleanupEntry[] = [];

interface Stats {
  total_orders: number;
  total_amount: string;
}

interface OrderRow {
  id: number;
  customer_id: number;
  order_date: string;
  total_amount: string;
}

interface OrderPage {
  items: OrderRow[];
  total: number;
  page: number;
  page_size: number;
}

/** Decimal 出参按两位小数放大为 BigInt，禁止用 Number 相等比较金额。 */
function toScaled(v: unknown, label: string): bigint {
  const s = String(v);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw=${s}`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.replace(/0+$/, '').length > 2) {
    throw new Error(`${label}：出参精度超过 2 位，raw="${s}"`);
  }
  const scaled = BigInt(intPart + frac.padEnd(2, '0').slice(0, 2));
  return sign === '-' ? -scaled : scaled;
}

test.describe('4.23 销售统计与明细同源守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
    CLEANUP.length = 0;
  });

  test('614-01 统计端点 count/total_amount 与同条件订单明细聚合守恒', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    expect(productId, '[614] 前置：需至少一个产品用于订单明细').toBeTruthy();

    const customer = await apiCallRaw<{ id?: number }>(page, 'POST', '/crm/customers', {
      customer_name: `E2E614守恒客户${genCode('C')}`,
    });
    const customerId = Number(customer?.id);
    expect(
      Number.isInteger(customerId) && customerId > 0,
      `[614] 建客户失败：${JSON.stringify(customer)}`
    ).toBe(true);
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: 'customer' });

    // 三张自建订单落在同一自然日，unit_price 两位小数保证 total_amount 可被分位精确比较
    const orderDate = '2026-01-15T08:00:00.000Z';
    const seedSpecs: Array<[string, string]> = [
      ['5', '100.00'],
      ['3', '250.50'],
      ['2', '10.25'],
    ];
    let expectedAmount = 0n;
    for (const [quantity, unitPrice] of seedSpecs) {
      const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/sales/orders', {
        customer_id: customerId,
        order_date: orderDate,
        items: [
          {
            product_id: productId,
            quantity,
            unit_price: unitPrice,
            tax_percent: '0',
            quantity_tolerance_pct: '0',
          },
        ],
        notes: `E2E614守恒-${genCode('S')}`,
      });
      const id = Number(created?.id);
      expect(
        Number.isInteger(id) && id > 0,
        `[614] 建销售订单失败：${JSON.stringify(created)}`
      ).toBe(true);
      CLEANUP.push({ path: `/sales/orders/${id}`, label: 'sales_order' });
      // tax_percent=0 时 total_amount = quantity × unit_price，与后端落库口径一致
      expectedAmount += toScaled(unitPrice, 'seed.unit_price') * BigInt(quantity);
    }

    const scope = `customer_id=${customerId}&start_date=2026-01-15&end_date=2026-01-15`;
    const stats = await apiCallRaw<Stats>(page, 'GET', `/sales/orders/statistics?${scope}`);
    const list = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?${scope}&page=1&page_size=100`
    );

    expect(Array.isArray(list.items), '[614] 销售订单列表缺 items 数组').toBe(true);
    expect(list.items.length, '[614] 明细行数须等于自建订单数').toBe(seedSpecs.length);
    expect(list.total, '[614] 分页 total 须等于自建订单数（过滤收敛无其它单据混入）').toBe(
      seedSpecs.length
    );
    expect(stats.total_orders, '[614] 统计 count 须等于同条件明细行数').toBe(list.items.length);

    const detailSum = list.items.reduce(
      (acc, row) => acc + toScaled(row.total_amount, 'list.total_amount'),
      0n
    );
    expect(detailSum, '[614] 明细 total_amount 分位和须等于 seed 金额汇总').toBe(expectedAmount);
    expect(
      toScaled(stats.total_amount, 'statistics.total_amount'),
      '[614] 统计 total_amount 分位值须等于明细分位和'
    ).toBe(detailSum);
  });
});
