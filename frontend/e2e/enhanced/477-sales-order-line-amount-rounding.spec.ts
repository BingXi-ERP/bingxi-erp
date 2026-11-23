// 4.16 数值精度：销售订单行「小计→折扣→折后→税→合计」逐步 round_dp(2)，表头四金额=逐行相加。
// 后端判据：services/so/amounts.rs:69-73 calculate_line_amounts：
//   subtotal=(qty*price).round_dp(2)；discount=(subtotal*pct/100).round_dp(2)；
//   after=(subtotal-discount).round_dp(2)；tax=(after*tax/100).round_dp(2)；
//   total=(after+tax).round_dp(2)；:88-96 sum_line_amounts 逐行累加表头；
//   order_crud.rs:432-436 落库表头四金额列。
// 取值约束：unit_price 列 DECIMAL(12,2)（migration/src/domain/system/m0001_initial_schema.rs，
//   无改宽迁移），三位小数单价落库即被舍入、回读分行与金额期望都不可靠；
//   quantity 列 NUMERIC(20,4) 可精确承载两位小数——用「2位×2位出4位」的乘积保住
//   subtotal 舍入检测力（3.33×7.77=25.8741→25.87），折扣/税腿另出三位舍入点。
// 与既有用例分工：71 只测无折扣行 qty×price 聚合、91 期望值从行动态推导、507 只读表头总额、
//   454 是报价行舍入（不同单据）；本例专补销售订单行带折扣带税的四金额固定期望零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

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
  const res = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
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
    // ctx.productIds 由共享前置产出：不跑 ensureTestEntities 就读 ctx 是 undefined，
    // 前置断言会以 matcher 错误（received undefined）爆掉而非真实业务断言。
    await ensureTestEntities(page);
    const customerId = await seedCustomer(page);
    const productId = getCtx().productIds[0];
    expect(productId, '[477] 前置：ctx.productIds[0] 未就绪').toBeGreaterThan(0);

    // 行1：3.33 × 7.77 = 25.8741→25.87；折扣15%→3.8805→3.88；折后 21.99；
    //   税13%→2.8587→2.86；合计 24.85。
    // 行2：2 × 5.55 = 11.10 恰两位；无折扣无税→合计 11.10。
    const created = await apiCall<{ id?: number }>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      items: [
        {
          product_id: productId,
          quantity: '3.33',
          unit_price: '7.77',
          discount_percent: '15',
          tax_percent: '13',
        },
        {
          product_id: productId,
          quantity: '2',
          unit_price: '5.55',
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
    const l1 = lines.find(l => near(l.unit_price, 7.77));
    const l2 = lines.find(l => near(l.unit_price, 5.55));
    expect(l1 && l2, '[477] 两行须按单价 7.77/5.55 区分').toBe(true);

    expect(cents(l1!.subtotal, '行1小计'), '[477] 行1小计=25.87').toBe(2587n);
    expect(cents(l1!.discount_amount, '行1折扣'), '[477] 行1折扣=3.88').toBe(388n);
    expect(cents(l1!.tax_amount, '行1税'), '[477] 行1税=2.86').toBe(286n);
    expect(cents(l1!.total_amount, '行1合计'), '[477] 行1合计=24.85').toBe(2485n);

    expect(cents(l2!.subtotal, '行2小计'), '[477] 行2小计=11.10').toBe(1110n);
    expect(cents(l2!.discount_amount, '行2折扣'), '[477] 行2折扣=0').toBe(0n);
    expect(cents(l2!.tax_amount, '行2税'), '[477] 行2税=0').toBe(0n);
    expect(cents(l2!.total_amount, '行2合计'), '[477] 行2合计=11.10').toBe(1110n);

    // 表头四金额 = 逐行相加（25.87+11.10 / 3.88+0 / 2.86+0 / 24.85+11.10）
    expect(cents(detail.subtotal, '表头小计'), '[477] 表头小计=36.97').toBe(3697n);
    expect(cents(detail.discount_amount, '表头折扣'), '[477] 表头折扣=3.88').toBe(388n);
    expect(cents(detail.tax_amount, '表头税'), '[477] 表头税=2.86').toBe(286n);
    expect(cents(detail.total_amount, '表头合计'), '[477] 表头合计=35.95').toBe(3595n);
  });
});
