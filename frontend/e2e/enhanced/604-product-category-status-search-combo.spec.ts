// 4.14 组合筛选 E2E — enhanced/604-product-category-status-search-combo
// 功能：产品列表按分类、状态、搜索三键 AND 叠加收敛，任一键放宽后结果不得减少。
// 调用方：Playwright enhanced 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；分类取产品分类列表首项，两件产品的名称/编码片段均自建唯一值。
// 传给谁：GET /product-categories 取分类 → POST /products 建两件不同状态产品 →
//   GET /products?category_id=&status=&search=&page=1&page_size=100 逐组合读取 →
//   DELETE /products/{id} 清理。
// 存什么：products 两行，同分类、名称片段独有，状态分别为 active 与 inactive。
// 存哪里：products 表。
// 口径说明：列表服务层把 category_id/status 做等值过滤，search 对名称/编码/条码做 LIKE OR，
//   三者之间为 AND；状态取小写 active/inactive。空串键由服务端整体剔除，因此放宽腿用空串表达。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface ProductRow {
  id: number;
  name: string;
  code: string;
  category_id: number;
  status: string;
}

interface ProductPage {
  items: ProductRow[];
  total: number;
  page: number;
  page_size: number;
}

const createdIds: number[] = [];

test.afterEach(async ({ page }) => {
  for (const id of createdIds.splice(0)) {
    await tryCleanup(page, 'DELETE', `/products/${id}`, `604 产品 ${id}`);
  }
});

async function seedCategoryId(page: Page): Promise<number> {
  const data = await apiCallRaw<{ items: Array<{ id: number }> }>(
    page,
    'GET',
    '/product-categories'
  );
  expect(Array.isArray(data.items), '产品分类列表 items 必须是数组').toBe(true);
  const id = data.items[0].id;
  expect(Number.isSafeInteger(id) && id > 0, '须有已种入的分类作建档必填来源').toBe(true);
  return id;
}

async function readProducts(page: Page, query: string): Promise<ProductPage> {
  const data = await apiCallRaw<ProductPage>(page, 'GET', `/products?${query}`);
  expect(Array.isArray(data.items), '产品列表 items 必须是数组').toBe(true);
  expect(Number.isSafeInteger(data.total), '产品列表 total 必须是整数').toBe(true);
  expect(data.page === 1, '产品列表页码必须回显请求值 1').toBe(true);
  expect(data.page_size === 100, '产品列表页宽必须回显请求值 100').toBe(true);
  return data;
}

test('604-01 产品分类状态搜索叠加命中唯一目标且放宽任一键不得更少', async ({
  page,
}: {
  page: Page;
}) => {
  await loginViaUI(page);
  const categoryId = await seedCategoryId(page);

  const tag = genCode('P604').replace(/-/g, '');
  const segA = `${tag}-A棉布片段`;
  const segB = `${tag}-B棉布片段`;
  const seedProduct = async (name: string, suffix: string, status: string): Promise<ProductRow> => {
    const created = await apiCallRaw<ProductRow>(page, 'POST', '/products', {
      name,
      code: `${tag}-C${suffix}`,
      barcode: `${tag}-BC${suffix}`,
      category_id: categoryId,
      unit: '米',
      status,
      product_type: PRODUCT_TYPE.auxiliary,
    });
    expect(Number.isSafeInteger(created.id) && created.id > 0, '建产品必须返回正整数主键').toBe(
      true
    );
    expect(created.name === name, '建产品回显名称必须一致').toBe(true);
    expect(created.category_id === categoryId, '建产品回显分类必须与提交一致').toBe(true);
    expect(created.status === status, '建产品回显状态必须与提交一致').toBe(true);
    createdIds.push(created.id);
    return created;
  };

  const productA = await seedProduct(segA, 'A', 'active');
  const productB = await seedProduct(segB, 'B', 'inactive');
  console.warn('[604] 已建两件专属产品', {
    productAId: productA.id,
    productBId: productB.id,
    categoryId,
  });

  const combinedA = await readProducts(
    page,
    `category_id=${categoryId}&status=active&search=${encodeURIComponent(segA)}&page=1&page_size=100`
  );
  expect(combinedA.total === 1, '分类加状态加搜索叠加后总数必须为 1').toBe(true);
  expect(
    combinedA.items.some(row => row.id === productA.id),
    '叠加条件必须命中 A 产品'
  ).toBe(true);
  expect(
    combinedA.items.some(row => row.id === productB.id),
    '叠加条件不得命中 B 产品'
  ).toBe(false);

  const combinedB = await readProducts(
    page,
    `category_id=${categoryId}&status=inactive&search=${encodeURIComponent(segB)}&page=1&page_size=100`
  );
  expect(combinedB.total === 1, 'B 产品的叠加条件总数必须为 1').toBe(true);
  expect(
    combinedB.items.some(row => row.id === productB.id),
    'B 叠加条件必须命中 B 产品'
  ).toBe(true);
  expect(
    combinedB.items.some(row => row.id === productA.id),
    'B 叠加条件不得命中 A 产品'
  ).toBe(false);

  const wrongCategory = await readProducts(
    page,
    `category_id=99999999&status=active&search=${encodeURIComponent(segA)}&page=1&page_size=100`
  );
  expect(wrongCategory.items.length === 0, '错误分类叠加搜索必须零命中').toBe(true);
  expect(wrongCategory.total === 0, '错误分类叠加搜索总数必须为 0').toBe(true);

  const relaxed = [
    await readProducts(
      page,
      `category_id=&status=active&search=${encodeURIComponent(segA)}&page=1&page_size=100`
    ),
    await readProducts(
      page,
      `category_id=${categoryId}&status=&search=${encodeURIComponent(segA)}&page=1&page_size=100`
    ),
    await readProducts(
      page,
      `category_id=${categoryId}&status=active&search=&page=1&page_size=100`
    ),
  ];
  for (const one of relaxed) {
    expect(one.total >= combinedA.total, '放宽任一筛选键后总数不得减少').toBe(true);
    expect(
      one.items.some(row => row.id === productA.id),
      '放宽任一筛选键后仍须命中 A 产品'
    ).toBe(true);
  }
  console.warn('[604] 分类状态搜索叠加断言完成', { categoryId });
});
