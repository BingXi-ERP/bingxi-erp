// 4.14 模糊搜索：产品列表 search 同时覆盖名称/编码/条码三列（OR 命中任一列即入结果）。
// 后端判据：handlers/product_handler.rs:26-32 ListProductsQuery.search 透传；
//   services/product_ops/crud.rs:53-57 PRODUCT_KEYWORD_COLUMNS=[Name, Code, Barcode]；
//   :94-97 safe_like_pattern 后 build_product_keyword_condition 对三列 Condition::any() OR LIKE。
// 与 414d 分工：414d 验销售订单 customer_name 的 %/_ 字面化转义（不同端点不同列）；
//   本例专补产品「三列任一命中」这一零覆盖维度，条码扫码取数是面料行业常规入口。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface ProductRow {
  id: number;
  name?: string;
  code?: string;
  barcode?: string | null;
}
interface ProductPage {
  items?: ProductRow[];
  total?: number;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

async function seedCategoryId(page: Page): Promise<number> {
  const cats = await apiCallRaw<{ items?: Array<{ id?: number }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(cats?.items?.[0]?.id);
  expect(id, '[466] 须有已种入的分类作建档必填来源').toBeGreaterThan(0);
  return id;
}

async function search(page: Page, term: string): Promise<ProductPage> {
  return apiCallRaw<ProductPage>(
    page,
    'GET',
    `/products?search=${encodeURIComponent(term)}&page=1&page_size=100`
  );
}

function hasTarget(page: ProductPage, id: number): boolean {
  return (page.items ?? []).some(r => Number(r.id) === id);
}

test.describe('4.14 产品三列模糊搜索', () => {
  test('466-01 名称/编码/条码三列任一命中即入结果，不存在片段返回空', async ({ page }) => {
    await loginViaUI(page);
    const categoryId = await seedCategoryId(page);

    const token = genCode('P466');
    // 三个独有片段分别只落在一列：名称腿只在 name、编码腿只在 code、条码腿只在 barcode。
    const nameOnly = `${token}名称腿`;
    const codeOnly = `${token}编码腿`;
    const barcodeOnly = `${token}条码腿`;
    const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
      name: nameOnly,
      code: codeOnly,
      barcode: barcodeOnly,
      category_id: categoryId,
      unit: '米',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    const id = Number(created?.id);
    expect(Number.isInteger(id) && id > 0, `[466] 建产品失败：${JSON.stringify(created)}`).toBe(
      true
    );
    CLEANUP.push({ path: `/products/${id}`, label: 'product' });

    // 名称列命中
    const byName = await search(page, nameOnly);
    expect(hasTarget(byName, id), '[466] 名称片段须命中本产品（Name 列参与 OR）').toBe(true);
    for (const row of byName.items ?? []) {
      const hit = [row.name, row.code, row.barcode].some(v => String(v ?? '').includes(nameOnly));
      expect(hit, `[466] 名称搜索每行须至少一列字面命中 ${nameOnly}`).toBe(true);
    }

    // 编码列命中
    const byCode = await search(page, codeOnly);
    expect(hasTarget(byCode, id), '[466] 编码片段须命中本产品（Code 列参与 OR）').toBe(true);

    // 条码列命中（关键：扫码取数入口，条码须与名称/编码同层参与）
    const byBarcode = await search(page, barcodeOnly);
    expect(hasTarget(byBarcode, id), '[466] 条码片段须命中本产品（Barcode 列参与 OR）').toBe(true);
    for (const row of byBarcode.items ?? []) {
      const hit = [row.name, row.code, row.barcode].some(v =>
        String(v ?? '').includes(barcodeOnly)
      );
      expect(hit, `[466] 条码搜索每行须至少一列字面命中 ${barcodeOnly}`).toBe(true);
    }

    // 不存在片段：total=0 且 items 空，不残留上一次筛选结果
    const miss = await search(page, `${token}不存在片段`);
    expect(Number(miss.total), '[466] 不存在片段 total 须为 0').toBe(0);
    expect((miss.items ?? []).length, '[466] 不存在片段 items 须为空').toBe(0);
  });
});
