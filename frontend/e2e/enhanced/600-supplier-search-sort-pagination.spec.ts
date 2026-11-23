// 4.14 搜索×排序×分页 E2E — enhanced/600-supplier-search-sort-pagination
// 功能：供应商列表按名称片段检索、按 supplier_name 升降序、按 page/page_size 翻页不重不漏。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；21 条专属供应商与 1 条不匹配关键字的干扰行均自建唯一标识。
// 传给谁：POST /purchase/suppliers 建档 → GET /purchase/suppliers?keyword=&sort_by=&sort_order=&page=&page_size=
//   逐档读取 → DELETE /purchase/suppliers/{id} 清理。
// 存什么：suppliers 共 22 行，其中 21 行名称含中英混排与内部空格，1 行用于排除误命中。
// 存哪里：suppliers 表。
// 口径说明：keyword 覆盖名称/编码/信用代码，本例只在名称放独有中英片段；sort_order 必须大写，
//   当前实现仅把大写 ASC 视为升序。页码不钳上界，越界页 offset 取空但 total 保持全量。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';

interface SupplierRow {
  id: number;
  supplier_name: string;
}

interface SupplierPage {
  items: SupplierRow[];
  total: number;
  page: number;
  page_size: number;
}

const createdIds: number[] = [];

test.afterEach(async ({ page }) => {
  for (const id of createdIds.splice(0)) {
    await tryCleanup(page, 'DELETE', `/purchase/suppliers/${id}`, `600 供应商 ${id}`);
  }
});

async function readPage(page: Page, query: string): Promise<SupplierPage> {
  const data = await apiCallRaw<SupplierPage>(page, 'GET', `/purchase/suppliers?${query}`);
  expect(Array.isArray(data.items), '供应商列表 items 必须是数组').toBe(true);
  expect(Number.isSafeInteger(data.total), '供应商列表 total 必须是整数').toBe(true);
  expect(Number.isSafeInteger(data.page), '供应商列表 page 必须是整数').toBe(true);
  expect(Number.isSafeInteger(data.page_size), '供应商列表 page_size 必须是整数').toBe(true);
  for (const row of data.items) {
    expect(typeof row.supplier_name === 'string', '供应商名称必须是字符串').toBe(true);
    expect(row.supplier_name.length > 0, '供应商名称不得为空').toBe(true);
  }
  return data;
}

test('600-01 供应商搜索命中中英片段与内部空格，单字段排序和翻页不重不漏', async ({
  page,
}: {
  page: Page;
}) => {
  await loginViaUI(page);

  const tag = genCode('S600').replace(/-/g, '');
  const creditPrefix = `91${Date.now().toString().slice(-12)}`;
  const creditTail = tag.slice(-2);
  const created: SupplierRow[] = [];
  for (let i = 0; i < 21; i += 1) {
    const seq = String(i).padStart(2, '0');
    const supplierName = `${tag} ABC 蓝色面料-${seq}`;
    const row = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', {
      supplier_name: supplierName,
      supplier_short_name: `S600-${seq}`,
      contact_phone: '13800000000',
      credit_code: `${creditPrefix}${seq}${creditTail}`,
    });
    expect(Number.isSafeInteger(row.id) && row.id > 0, '建档必须返回正整数主键').toBe(true);
    expect(row.supplier_name === supplierName, '建档回显名称必须与提交一致').toBe(true);
    createdIds.push(row.id);
    created.push(row);
  }
  const decoy = await apiCallRaw<SupplierRow>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `干扰行红色面料-${tag.slice(0, 6)}`,
    supplier_short_name: `D600-${tag.slice(0, 4)}`,
    contact_phone: '13800000000',
    credit_code: `${creditPrefix}99${creditTail}`,
  });
  expect(Number.isSafeInteger(decoy.id) && decoy.id > 0, '干扰行建档必须返回正整数主键').toBe(true);
  createdIds.push(decoy.id);
  console.warn('[600] 已建 21 条专属供应商与 1 条干扰行', { tag });

  const batchIds = created.map(row => row.id);
  for (const keyword of ['蓝色面料', 'ABC', 'ABC 蓝色']) {
    const hit = await readPage(page, `keyword=${encodeURIComponent(keyword)}&page=1&page_size=100`);
    const hitIds = new Set(hit.items.map(row => row.id));
    expect(
      batchIds.every(id => hitIds.has(id)),
      '每个关键字都必须命中本批全部供应商'
    ).toBe(true);
    expect(hitIds.has(decoy.id), '关键字搜索不得命中不匹配名称的干扰行').toBe(false);
    console.warn('[600] 关键字检索完成', { keyword, total: hit.total });
  }

  const full = await readPage(page, `keyword=${tag}&page=1&page_size=100`);
  expect(full.total === 21, '专属前缀全量总数必须是 21').toBe(true);
  expect(full.items.length === 21, '专属前缀全量行数必须是 21').toBe(true);
  const fullIds = full.items.map(row => row.id).sort((a, b) => a - b);
  expect(new Set(fullIds).size === 21, '全量结果 ID 必须互不重复').toBe(true);
  expect(
    fullIds.every(id => batchIds.includes(id)),
    '全量结果必须等于本批创建的 21 个主键'
  ).toBe(true);

  const pagedIds: number[] = [];
  for (const [pageNo, expectedSize] of [
    [1, 10],
    [2, 10],
    [3, 1],
  ]) {
    const one = await readPage(page, `keyword=${tag}&page=${pageNo}&page_size=10`);
    expect(one.items.length === expectedSize, '每页行数必须符合 10/10/1 的切分').toBe(true);
    expect(one.page === pageNo, '分页回显页码必须等于请求页码').toBe(true);
    expect(one.page_size === 10, '分页回显页宽必须等于请求页宽').toBe(true);
    expect(one.total === 21, '分页不得改写全量总数').toBe(true);
    pagedIds.push(...one.items.map(row => row.id));
  }
  expect(new Set(pagedIds).size === 21, '三页拼接不得出现重复 ID').toBe(true);
  expect(
    pagedIds.sort((a, b) => a - b).every((id, index) => id === fullIds[index]),
    '三页拼接的 ID 集合必须等于全量结果'
  ).toBe(true);

  for (const [size, expectedSize] of [
    [20, 20],
    [100, 21],
  ]) {
    const one = await readPage(page, `keyword=${tag}&page=1&page_size=${size}`);
    expect(one.items.length === expectedSize, '页宽 20/100 的行数必须分别为 20/21').toBe(true);
    expect(one.page_size === size, '页宽回显必须等于请求值').toBe(true);
  }

  const sortedNames: string[][] = [];
  for (const order of ['ASC', 'DESC']) {
    const names: string[] = [];
    for (const pageNo of [1, 2]) {
      const one = await readPage(
        page,
        `keyword=${tag}&sort_by=supplier_name&sort_order=${order}&page=${pageNo}&page_size=20`
      );
      names.push(...one.items.map(row => row.supplier_name));
    }
    expect(names.length === 21, '排序后两页拼接必须覆盖本批全部供应商').toBe(true);
    for (let i = 1; i < names.length; i += 1) {
      if (order === 'ASC') {
        expect(names[i - 1] <= names[i], '升序结果拼接后名称必须非降').toBe(true);
      } else {
        expect(names[i - 1] >= names[i], '降序结果拼接后名称必须非升').toBe(true);
      }
    }
    sortedNames.push(names);
  }
  expect(
    sortedNames[0][0] === sortedNames[1][sortedNames[1].length - 1],
    '同一批供应商的升序首项必须等于降序末项'
  ).toBe(true);

  const far = await readPage(
    page,
    `keyword=${tag}&sort_by=supplier_name&sort_order=ASC&page=999&page_size=10`
  );
  expect(far.items.length === 0, '远超总数的页码必须返回空页').toBe(true);
  expect(far.page === 999, '越界页码必须原样回显').toBe(true);
  expect(far.total === 21, '越界页不得改写全量总数').toBe(true);
  console.warn('[600] 搜索、排序、分页断言全部完成', { tag });
});
