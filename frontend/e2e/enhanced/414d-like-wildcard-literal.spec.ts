// 4.14 模糊搜索：LIKE 通配符 % / _ 须按字面值匹配，不得当作通配符命中全表。
// 后端判据：utils/sql_escape.rs:20 safe_like_pattern 先 escape_like_pattern 再包 %...%，
//   services/so/order_query.rs:168 的 customer_name 走该转义后 like。
// 与 SQL 注入负例正交：注入负例证明 payload 不恒真、不 500；本用例证明通配符被转义为字面量——
//   若去掉 escape，搜索 "%" 会变成 LIKE '%%%' 命中所有客户名，逐行断言即红。
// 出参 SalesOrderDetail 为 snake_case（services/so/mod.rs:47-77），customer_name 直接可读。
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

test.describe('4.14 LIKE 通配符字面化', () => {
  test('4.14-04 搜索 % 与 _ 只返回字面包含该字符的客户名，不命中全表', async ({ page }) => {
    await loginViaUI(page);

    const all = await apiCallRaw<OrderPage>(page, 'GET', '/sales/orders?page=1&page_size=100');
    expect(Array.isArray(all.items), '列表缺 items 数组').toBe(true);
    const withName = all.items.filter(r => !!r.customer_name && r.customer_name.trim().length > 0);
    expect(withName.length, '前置：列表须有客户名非空的订单').toBeGreaterThan(0);

    for (const wild of ['%', '_']) {
      const hit = await apiCallRaw<OrderPage>(
        page,
        'GET',
        `/sales/orders?page=1&page_size=100&customer_name=${encodeURIComponent(wild)}`
      );
      expect(Array.isArray(hit.items), `搜索 ${wild} 缺 items 数组`).toBe(true);
      for (const row of hit.items) {
        expect(
          !!row.customer_name && row.customer_name.includes(wild),
          `搜索通配符 ${wild} 的结果行 ${row.order_no} 客户名须字面包含 ${wild}（转义失效会命中全表），实际 ${row.customer_name}`
        ).toBe(true);
      }
      const literalCount = hit.items.filter(
        r => !!r.customer_name && r.customer_name.includes(wild)
      ).length;
      expect(literalCount, `本页命中 ${wild} 的行数应与逐行字面校验一致`).toBe(hit.items.length);
    }

    // 负例对照：常规前缀搜索仍按子串命中（证明转义没有把正常搜索也弄失效）
    const sample = withName[0].customer_name!.trim().slice(0, 1);
    expect(sample.length, '前置：客户名至少 1 字').toBe(1);
    const normal = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=100&customer_name=${encodeURIComponent(sample)}`
    );
    expect(
      normal.total,
      `正常单字前缀 ${sample} 搜索须命中至少 1 单（转义不得破坏常规模糊搜索）`
    ).toBeGreaterThan(0);
  });
});
