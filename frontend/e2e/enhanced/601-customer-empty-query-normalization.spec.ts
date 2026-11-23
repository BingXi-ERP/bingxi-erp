// 4.14 空串归一化 E2E — enhanced/601-customer-empty-query-normalization
// 功能：客户列表把显式空串与纯空白筛选项整体剔除，结果与不带筛选条件的同页全量一致。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；客户编码与名称均自建唯一片段，避免与共享数据撞名。
// 传给谁：POST /crm/customers 建档 → GET /crm/customers?page=1&page_size=100 取基准 →
//   GET /crm/customers?status=&customer_type=&keyword=&keyword=%20%20&page=1&page_size=100 取对照 →
//   DELETE /crm/customers/{id} 清理。
// 存什么：customers 一行，带独有 customer_code 与 customer_name。
// 存哪里：customers 表。
// 口径说明：后端中间件把空串/纯空白 query 键整体剔除，缺失键与空串同义；这里直接发带原始空串的
//   URL，绕过前端请求层先剔除空键的逻辑，才能真正验证服务端归一化。不以整页 ID 数组作比较，
//   避免并行写入造成页码漂移；比较全量总数与本批标记行是否可见。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';

interface CustomerRow {
  id: number;
  customer_name: string;
}

interface CustomerPage {
  items: CustomerRow[];
  total: number;
  page: number;
  page_size: number;
}

const createdIds: number[] = [];

test.afterEach(async ({ page }) => {
  for (const id of createdIds.splice(0)) {
    await tryCleanup(page, 'DELETE', `/crm/customers/${id}`, `601 客户 ${id}`);
  }
});

async function readCustomers(page: Page, query: string): Promise<CustomerPage> {
  const data = await apiCallRaw<CustomerPage>(page, 'GET', `/crm/customers?${query}`);
  expect(Array.isArray(data.items), '客户列表 items 必须是数组').toBe(true);
  expect(Number.isSafeInteger(data.total), '客户列表 total 必须是整数').toBe(true);
  expect(data.page === 1, '客户列表页码必须回显请求值 1').toBe(true);
  expect(data.page_size === 100, '客户列表页宽必须回显请求值 100').toBe(true);
  return data;
}

test('601-01 显式空串与纯空白筛选项等价于无筛选条件', async ({ page }: { page: Page }) => {
  await loginViaUI(page);

  const tag = genCode('C601');
  const created = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_code: `C${tag}`,
    customer_name: `601空串客户-${tag}`,
    contact_person: `联系人-${tag}`,
    contact_phone: `139${String(Date.now()).slice(-8)}`,
    customer_type: 'retail',
    status: 'active',
  });
  expect(Number.isSafeInteger(created.id) && created.id > 0, '建档必须返回正整数主键').toBe(true);
  createdIds.push(created.id);
  console.warn('[601] 已建专属客户', { id: created.id, tag });

  const baseline = await readCustomers(page, 'page=1&page_size=100');
  const emptied = await readCustomers(
    page,
    'status=&customer_type=&keyword=&keyword=%20%20&page=1&page_size=100'
  );

  expect(baseline.total > 0, '基准查询不得返回空列表').toBe(true);
  expect(emptied.total > 0, '空串筛选不得把全量收敛成零行').toBe(true);
  expect(emptied.total === baseline.total, '空串筛选的总数必须等于基准总数').toBe(true);
  expect(
    baseline.items.some(row => row.id === created.id),
    '基准列表必须包含本例专属客户'
  ).toBe(true);
  expect(
    emptied.items.some(row => row.id === created.id),
    '带空串筛选项的列表必须包含本例专属客户'
  ).toBe(true);
  console.warn('[601] 空串归一化断言完成', { total: baseline.total, id: created.id });
});
