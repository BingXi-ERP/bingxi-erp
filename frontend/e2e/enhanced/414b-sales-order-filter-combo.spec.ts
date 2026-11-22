/**
 * 4.14 搜索筛选分页：销售订单多条件组合筛选须严格一致（客户名 + 状态 + 日期区间叠加）。
 *
 * 调用面：GET /api/v1/erp/sales/orders?status=&customer_name=&start_date=&end_date=
 *   handlers/sales_order_handler.rs:26-36 SalesOrderQuery 四筛选键；
 *   :50-78 list_orders 把四键装进 SalesOrderFilter 透传给 service。
 * 判据链（后端源码逐行核对）：
 *   services/so/order_query.rs:157-159 status 等值 filter；
 *   :167-170 customer_name 走 LEFT JOIN customers 的 customer_name LIKE（safe_like_pattern 转义通配符）；
 *   :176-188 start_date/end_date 把 NaiveDate 展开为 [当日00:00, 次日00:00) 的 UTC 区间，
 *   各条件逐项 AND 叠加——任一条件被忽略，返回行就会出现不满足该条件的记录。
 * 出参键：services/so/mod.rs:47-77 SalesOrderDetail 为 snake_case（customer_name/order_date/status），
 *   handler 用 serde_json::to_value 直出（:80），列名不经 camelCase 转换。
 * 真检测三重：
 *   ① 正向：取一条已有订单作基准，客户名+其状态+其日期(同日起止)三条件叠加，
 *      断言每行 status 相等、customer_name 包含、order_date 的 UTC 日期落在区间；
 *   ② 收敛：叠加 total 不得大于仅 status 单条件的 total（叠加必须收窄，不能忽略条件）；
 *   ③ 负例：status 换成绝不存在的 token，叠加须 total=0（证明 status 键真参与过滤）。
 * 前置：列表须有 customer_name 非空、order_date 可解析的订单；无则硬失败不 skip。
 * admin 视角（loginViaUI 默认）不过字段过滤/脱敏，能读到完整三字段。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCallRaw, loginViaUI } from '../flow/helpers';

interface SalesOrderRow {
  id: number;
  order_no: string;
  customer_name: string | null;
  order_date: string;
  status: string;
}
interface OrderPage {
  items: SalesOrderRow[];
  total: number;
  page: number;
  page_size: number;
}

test.describe('4.14 销售订单多条件组合筛选', () => {
  test('4.14-02 客户名+状态+日期区间叠加逐行严格一致且可收敛', async ({ page }) => {
    await loginViaUI(page);

    const all = await apiCallRaw<OrderPage>(page, 'GET', '/sales/orders?page=1&page_size=100');
    expect(
      Array.isArray(all.items),
      `销售订单列表缺 items 数组：${JSON.stringify(all).slice(0, 200)}`
    ).toBe(true);

    // 基准：取一条客户名非空、日期可解析的订单，避免自建订单的库存前置
    const base = all.items.find(
      r => !!r.customer_name && !!r.order_date && !Number.isNaN(Date.parse(r.order_date))
    );
    expect(
      base,
      `前置：列表须有客户名非空且日期可解析的订单：${JSON.stringify(all.items.slice(0, 3))}`
    ).toBeTruthy();
    const status = base!.status;
    const customerName = base!.customer_name!;
    const utcDate = new Date(base!.order_date).toISOString().slice(0, 10);
    console.log(
      `[4.14] 基准单 ${base!.order_no} status=${status} 客户=${customerName} 日期=${utcDate}`
    );

    const q = `status=${encodeURIComponent(status)}&customer_name=${encodeURIComponent(customerName)}&start_date=${utcDate}&end_date=${utcDate}`;
    const combo = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=100&${q}`
    );
    expect(Array.isArray(combo.items), '叠加筛选缺 items 数组').toBe(true);
    expect(combo.total, '基准单三条件叠加后 total 应至少 1').toBeGreaterThan(0);

    // ① 每行严格满足三条件
    for (const row of combo.items) {
      expect(row.status, `叠加结果行 ${row.order_no} 状态须等于筛选值 ${status}`).toBe(status);
      expect(
        row.customer_name && row.customer_name.includes(customerName),
        `叠加结果行 ${row.order_no} 客户名须包含筛选值 ${customerName}，实际 ${row.customer_name}`
      ).toBe(true);
      expect(
        new Date(row.order_date).toISOString().slice(0, 10),
        `叠加结果行 ${row.order_no} 的 UTC 日期须落在 [${utcDate}, ${utcDate}]`
      ).toBe(utcDate);
    }

    // ② 收敛：叠加不得比单条件更宽
    const onlyStatus = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=1&status=${encodeURIComponent(status)}`
    );
    expect(
      combo.total,
      `叠加 total(${combo.total}) 不得大于 status 单条件 total(${onlyStatus.total})`
    ).toBeLessThanOrEqual(onlyStatus.total);

    // ③ 负例：不可能的状态值叠加须空集
    const negative = await apiCallRaw<OrderPage>(
      page,
      'GET',
      `/sales/orders?page=1&page_size=10&status=__NO_SUCH_STATUS__&customer_name=${encodeURIComponent(customerName)}&start_date=${utcDate}&end_date=${utcDate}`
    );
    expect(negative.total, '不可能状态叠加后 total 须为 0（证明 status 键真参与过滤）').toBe(0);
    expect(negative.items.length, '不可能状态叠加后 items 须为空').toBe(0);
    console.log(
      `[4.14] 叠加 total=${combo.total} 单条件 total=${onlyStatus.total} 负例 total=${negative.total}`
    );
  });
});
