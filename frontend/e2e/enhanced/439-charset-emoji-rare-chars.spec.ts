// 4.39 字符集边界 E2E — enhanced/439-charset-emoji-rare-chars
// 前置说明：474 个 spec 中 emoji 与生僻字入库回读零覆盖；flow/18 的 hostile 串
//   只含 ASCII 特殊字符与 SQL/XSS payload，不证明多字节字符逐字保真。
// 后端判据：POST /products 经 create_product 落库（crud.rs:165-193），
//   GET /products/{id} 原值回读，链路无转码或截断环节。若任一环节按单字节截断、
//   错误转义或前端提交前吞字，逐字 toBe 比对即判红，不做空断言假绿。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface ProductRow {
  id: number;
  name?: string;
  code?: string;
}

async function seedCategoryId(page: Page): Promise<number> {
  const cats = await apiCallRaw<{ items?: Array<{ id?: unknown }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(cats?.items?.[0]?.id);
  expect(id, '[439] 须有已种入的分类作建档必填来源').toBeGreaterThan(0);
  return id;
}

test('439-01 emoji 生僻字全角半角混排入库逐字回读不乱码不截断', async ({ page }) => {
  const categoryId = await seedCategoryId(page);
  const code = genCode('E439A');
  const name = '439字符集😀🎉龘靐龗ＡＢ全角abc半角"引号\'反斜杠\\';
  const created = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code,
    name,
    category_id: categoryId,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = Number(created?.id);
  expect(id, '[439] 建品须返回正整数主键').toBeGreaterThan(0);

  try {
    const row = await apiCallRaw<ProductRow>(page, 'GET', `/products/${id}`);
    expect(row.name, '[439] 回读 name 须与入库逐字相等，不得乱码/截断/转义改写').toBe(name);
    expect(String(row.code), '[439] 回读 code 须原样保留').toBe(code);
  } finally {
    await tryCleanup(page, 'DELETE', `/products/${id}`, `439-01 产品 ${id}`);
  }
});
