// 4.14 日期区间边界 + 4.23 报表口径：销售订单统计端点按 start_date/end_date 过滤，
//   非法格式按公开规则拒绝，不再把筛选吞掉。
// 后端判据：routes/sales.rs:80-81 挂 GET /sales/orders/statistics；
//   handlers/sales_order_handler.rs:975-1004 用 typed DTO 收 start_date/end_date/customer_id，
//   以字符串原键重建后交 service；
//   services/so/order_query.rs:529-548 严格要求 YYYY-MM-DD，非法值走
//   AppError::validation_displayable("start_date 需为 YYYY-MM-DD 格式")；
//   :564-581 把日期下推为 order_date >= 起始日 00:00(UTC) 且 < 截止日次日 00:00(UTC)，
//   注释明示此前收下即丢导致统计日期筛选完全不生效；出参 total_orders/total_amount。
// 与既有覆盖分工：446 验 AP 发票列表日期闭区间，02-bi-aggregate-truth 验 dashboard 客户
//   汇总，05-assign-share-merge 验 CRM 客户合并后的 summary；全 e2e 无 /sales/orders/statistics
//   断言。本例专钉统计端点的日期下推与格式门。
// 检测力：日期被吞掉则未来区间 total_orders 不为 0 即红；截止日漏下推则同日统计漏单即红；
//   非法格式未被拒则负例红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
} from '../flow/helpers';

interface OrderRow {
  id: number;
  customer_id: number;
  order_no: string;
  order_date: string;
}

interface OrderPage {
  items?: OrderRow[];
  total?: number;
}

interface Stats {
  total_orders: number;
  total_amount: unknown;
}

const FUTURE_DAY = '2099-01-01';
const PAST_DAY = '1900-01-01';

async function dayOf(iso: string, label: string): Promise<string> {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  expect(m, `${label}：order_date 非预期形态 ${JSON.stringify(iso)}`).toBeTruthy();
  return m![1];
}

async function stats(page: Page, params: Record<string, string | number>): Promise<Stats> {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return apiCallRaw<Stats>(page, 'GET', `/sales/orders/statistics?${qs}`);
}

test.describe('4.14 销售订单统计日期区间', () => {
  test('455-01 同日区间命中当天订单，未来/过去区间归零', async ({ page }) => {
    await loginViaUI(page);

    const list = await apiCallRaw<OrderPage>(page, 'GET', '/sales/orders?page=1&page_size=100');
    expect(Array.isArray(list.items), '销售订单列表缺 items 数组').toBe(true);
    expect((list.items ?? []).length, '前置：须有已种入的销售订单供统计口径比对').toBeGreaterThan(
      0
    );
    const row = list.items![0];
    const day = await dayOf(row.order_date, '基准订单');

    const sameDay = await stats(page, { start_date: day, end_date: day });
    expect(
      Number(sameDay.total_orders),
      `同日区间 ${day} 须命中基准订单 ${row.order_no}，不得因日期被吞而全量或归零`
    ).toBeGreaterThanOrEqual(1);

    const future = await stats(page, { start_date: FUTURE_DAY, end_date: FUTURE_DAY });
    expect(
      Number(future.total_orders),
      '未来日期区间须 zero，若统计仍返回全量则日期筛选未下推'
    ).toBe(0);

    const past = await stats(page, { start_date: PAST_DAY, end_date: PAST_DAY });
    expect(Number(past.total_orders), '1900 年区间须 zero，证明起始端同样下推生效').toBe(0);

    const untilPast = await stats(page, { end_date: PAST_DAY });
    expect(
      Number(untilPast.total_orders),
      '截止端同样须下推：截止 1900 年须 zero，不得返回全量'
    ).toBe(0);

    const all = await stats(page, {});
    expect(
      Number(all.total_orders),
      '无日期参数的基线统计须为正，且与区间筛选形成对照'
    ).toBeGreaterThanOrEqual(Number(sameDay.total_orders));
  });

  test('455-02 同日区间叠加 customer_id 命中该客户订单，非法日期格式被拒', async ({ page }) => {
    await loginViaUI(page);

    const list = await apiCallRaw<OrderPage>(page, 'GET', '/sales/orders?page=1&page_size=100');
    const row = list.items?.[0];
    expect(row, '前置：须有已种入的销售订单').toBeTruthy();
    const day = await dayOf(row!.order_date, '基准订单');
    const customerId = Number(row!.customer_id);
    expect(customerId, '前置：基准订单须有正整数 customer_id').toBeGreaterThan(0);

    const scoped = await stats(page, {
      start_date: day,
      end_date: day,
      customer_id: customerId,
    });
    expect(
      Number(scoped.total_orders),
      `同日 + 客户 ${customerId} 须命中基准订单 ${row!.order_no}，customer_id 不得在透传中失效`
    ).toBeGreaterThanOrEqual(1);
    expect(
      Number(scoped.total_orders),
      '叠加客户筛选的结果不得大于同日全客户统计'
    ).toBeLessThanOrEqual(
      Number((await stats(page, { start_date: day, end_date: day })).total_orders)
    );

    const badStart = await apiCallExpectFail(
      page,
      'GET',
      '/sales/orders/statistics?start_date=2026%2F11%2F20'
    );
    expect(badStart.status, '非法 start_date 须 400').toBe(400);
    expect(
      failureCode(badStart),
      `非法 start_date 归 VALIDATION_ERROR 族，实际 ${JSON.stringify(badStart.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      String(badStart.message ?? ''),
      `拒因须外显字段名与格式规则，实际 ${JSON.stringify(badStart.message)}`
    ).toContain('start_date 需为 YYYY-MM-DD 格式');

    const badEnd = await apiCallExpectFail(
      page,
      'GET',
      '/sales/orders/statistics?end_date=20261120'
    );
    expect(badEnd.status, '非法 end_date 须 400').toBe(400);
    expect(
      failureCode(badEnd),
      `非法 end_date 归 VALIDATION_ERROR 族，实际 ${JSON.stringify(badEnd.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      String(badEnd.message ?? ''),
      `拒因须外显 end_date 格式规则，实际 ${JSON.stringify(badEnd.message)}`
    ).toContain('end_date 需为 YYYY-MM-DD 格式');
  });
});
