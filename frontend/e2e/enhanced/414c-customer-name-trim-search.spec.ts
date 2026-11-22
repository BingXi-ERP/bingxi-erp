// 4.14 搜索筛选：客户名带前后空格须按 trim 后命中（空格归一化）。
// 后端判据：services/so/order_query.rs:167-168 对 customer_name 做
//   filter(|s| !s.trim().is_empty()) 后以 safe_like_pattern(name.trim()) 走 LEFT JOIN like。
// 检测力：若实现退化为不 trim，LIKE '% 客户名 %' 因前后多出的空格无法命中基准单，
//   正向断言即红；若退化为忽略该键则返回全量，负例 total=0 即红。两路互不重叠。
// 出参键 SalesOrderDetail 为 snake_case（services/so/mod.rs:47-77），customer_name 直接可读。
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface SalesOrderRow {
  id: number;
  order_no: string;
  customer_name: string | null;
}
interface OrderPage {
  items: SalesOrderRow[];
  total: number;
}

test.describe('4.14 客户名搜索空格归一化', () => {
  test('4.14-03 客户名带前后空格仍命中原单，绝不存在的加空格名返回 0', async ({ page }) => {
    await loginViaUI(page);

    const all = await apiCallRaw<OrderPage>(page, 'GET', '/sales/orders?page=1&page_size=100');
    expect(
      Array.isArray(all.items),
      `销售订单列表缺 items 数组：${JSON.stringify(all).slice(0, 200)}`
    ).toBe(true);
    const base = all.items.find(r => !!r.customer_name && r.customer_name.trim().length > 0);
    expect(
      base,
      `前置：列表须有客户名非空的订单：${JSON.stringify(all.items.slice(0, 3))}`
    ).toBeTruthy();

    const name = base!.customer_name!.trim();
    const padded = `  ${name}  `;
    const hit = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=100&customer_name=${encodeURIComponent(padded)}`
    );
    expect(Array.isArray(hit.items), '带空格搜索缺 items 数组').toBe(true);
    expect(
      hit.items.some(r => Number(r.id) === Number(base!.id)),
      `客户名带前后空格搜索须命中基准单 ${base!.order_no}（后端须 trim），实际命中 ${JSON.stringify(hit.items.map(r => r.order_no))}`
    ).toBe(true);
    for (const row of hit.items) {
      expect(
        !!row.customer_name && row.customer_name.includes(name),
        `带空格搜索结果行 ${row.order_no} 客户名须包含 trim 后的 ${name}，实际 ${row.customer_name}`
      ).toBe(true);
    }

    const noneName = `E2E-NOT-EXIST-${Date.now()}`;
    const negative = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=100&customer_name=${encodeURIComponent(`  ${noneName}  `)}`
    );
    expect(
      negative.total,
      `绝不存在的客户名带空格搜索 total 须为 0（证明 customer_name 键真参与过滤而非返回全量），实际 ${negative.total}`
    ).toBe(0);
  });
});
