// 4.39 字符集与超长 E2E — flow/573-customer-charset-and-length
// 功能：emoji/生僻字在客户主档写入后逐字回读不乱码、不被静默截断；超长文本被 validator 拦截而非截断。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；客户用唯一 code 自建。
// 传给谁：POST /crm/customers 写入多字节字段 → GET /crm/customers/{id} 详情逐字回读 →
//   GET /crm/customers?keyword= 验证列表搜索命中含 emoji/生僻字的名字 →
//   POST 超长 customer_name 断言校验拒绝 → GET 列表验证零新增行。
// 存什么：customers 一行（customer_code/customer_name/contact_person/address 多字节原样）。
// 存哪里：customers 表。
// 口径说明：enhanced/439-charset 已覆盖产品域 emoji/生僻字逐字回读；enhanced/439-customer-field-length
//   已覆盖客户各字段超长被拒。本例按报告建议补"客户写面多字节逐字回读 + 列表搜索命中"这一空缺面，
//   并复验超长 customer_name 拒绝且零落库，不重复产品域用例。
//   后端判据：customer_handler.rs:24-71 CreateCustomerRequest 各字段 length 校验、:84-113 Update 校验；
//   应用字符串为 Rust String/JSON 无转码层，PG 超长报错而非静默截断。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  expectStateGateRejection,
  genCode,
  tryCleanup,
} from './helpers';

interface CustomerRow {
  id: number;
  customer_code?: string;
  customer_name?: string;
  contact_person?: string;
  address?: string;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test('573-01 emoji与生僻字逐字回读且列表搜索命中，超长名被拒零落库', async ({
  page,
}: {
  page: Page;
}) => {
  const tag = genCode('573A');
  const code = `C${tag}`;
  // 含 emoji（四字节）、生僻字（𰀀/𠀋）、常规中文与全角标点，覆盖多字节 utf8 逐字保真。
  const name = `客户${tag}🙂𰀀𠀋（测试）`;
  const contact = `联🙂系人${tag}`;
  const address = `地址${tag}区𠀋弄🙂号`;

  const created = await apiCall<CustomerRow>(page, 'POST', '/crm/customers', {
    customer_code: code,
    customer_name: name,
    contact_person: contact,
    contact_phone: `139${String(Date.now()).slice(-8)}`,
    address,
    customer_type: 'retail',
    status: 'active',
  });
  const id = Number(created.data?.id);
  expect(id, '建档须返回正整数主键').toBeGreaterThan(0);
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `573 多字节客户 ${id}` });

  // 详情逐字回读：toStrictEqual 式逐一比对，任一环节转码/截断即红。
  const detail = await apiCallRaw<CustomerRow>(page, 'GET', `/crm/customers/${id}`);
  expect(detail.customer_name, 'customer_name 须逐字保留 emoji 与生僻字').toBe(name);
  expect(detail.customer_code, 'customer_code 须原样保留').toBe(code);
  expect(detail.contact_person, 'contact_person 须逐字保留多字节字符').toBe(contact);
  expect(detail.address, 'address 须逐字保留多字节字符').toBe(address);
  expect(
    Array.from(detail.customer_name ?? '').length,
    '回读名字长度须与写入一致（不被截断）'
  ).toBe(Array.from(name).length);

  // 列表搜索命中：keyword 走 customer_name / customer_code 的 contains，多字节片段须可命中。
  const searchFrag = `🙂𰀀`;
  const list = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    `/crm/customers?keyword=${encodeURIComponent(searchFrag)}&page=1&page_size=100`
  );
  expect(
    (list.items ?? []).some(r => Number(r.id) === id),
    '按多字节片段搜索须命中该客户，证明入库编码可检索'
  ).toBe(true);

  // 超长客户名：validator 上限 200，201 字须被拒且不落库。
  const overTag = genCode('573B');
  const overCode = `C${overTag}`;
  const rejected = await apiCallExpectFail(page, 'POST', '/crm/customers', {
    customer_code: overCode,
    customer_name: '客'.repeat(201),
    customer_type: 'retail',
    status: 'active',
  });
  expectStateGateRejection(rejected, '客户名 201 字建档');

  const afterList = await apiCallRaw<{ items: CustomerRow[] }>(
    page,
    'GET',
    `/crm/customers?keyword=${encodeURIComponent(overCode)}&page=1&page_size=100`
  );
  expect(
    (afterList.items ?? []).some(r => r.customer_code === overCode),
    '超长名被拒后该 code 不得落库（零新增行），不得静默截断成合法长度入库'
  ).toBe(false);
});
