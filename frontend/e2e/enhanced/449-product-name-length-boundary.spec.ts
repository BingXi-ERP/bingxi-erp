// 4.31 文本边界：产品主档 name 恰好 200 字放行并逐字回读、201 字被拒且不落库。
// 后端判据：handlers/product_handler.rs:37-39 CreateProductRequest.name 带
//   #[validate(length(max = 200, message = "产品名称长度不能超过200个字符"))]，
//   :464-472 create_product 真调 req.validate()；validator 错误经
//   utils/error.rs:719-738 readable_validation_errors 取本仓库自撰 message，
//   转 validation_displayable（HTTP 400 + VALIDATION_ERROR，文案可外显非脱敏常量）。
//   列宽 products.name VARCHAR(200)（migration m0001:221-224），回读字段
//   models/product.rs:14-18；路由 routes/catalog.rs POST/GET/DELETE products。
// 与既有覆盖分工：439-charset-emoji-rare-chars 同端点但短名，只断逐字回读不乱码，
//   未断 200/201 门；439-customer 只覆盖 CRM 客户字段长度。全 e2e 无产品 name
//   200/201 断言。本例专钉产品主档长度门。
// 假红规避：v15/mod.rs:3820 的 VARCHAR(255) 是 ADD COLUMN IF NOT EXISTS 兜底，
//   不据此断「数据库拒 201」，201 必在 validate 阶段被 400 拦下。
// 检测力：上限写成 201 则 201 字被误放即红；写成 199 则 200 字被误拒即红；
//   200 字入库被截断则回读 length 不足即红。
import { test, expect, type Page } from '../diagnose-fixture';
import { PRODUCT_TYPE } from '../../src/constants/product-type';
import {
  loginViaUI,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface ProductRow {
  id?: number;
  name?: string;
  code?: string;
}

function pad(prefix: string, ch: string, len: number): string {
  const head = `${prefix}`;
  return head + ch.repeat(len - head.length);
}

async function seedCategoryId(page: Page): Promise<number> {
  const cats = await apiCallRaw<{ items?: Array<{ id?: number }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(cats?.items?.[0]?.id);
  expect(id, '[449] 须有已种入的分类作建档必填来源').toBeGreaterThan(0);
  return id;
}

test('449-01 产品名 200 字放行并逐字回读，201 字被拒且零落库', async ({ page }) => {
  await loginViaUI(page);
  const categoryId = await seedCategoryId(page);
  const code = genCode('E449');

  // 上限值放行：200 字须建档成功并逐字回读，不被 VARCHAR(200) 静默截断。
  const okName = pad('449', '料', 200);
  const ok = await apiCall<ProductRow>(page, 'POST', '/products', {
    code,
    name: okName,
    category_id: categoryId,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = Number(ok.data?.id);
  expect(id, '[449] 产品名恰好 200 字须放行建档').toBeGreaterThan(0);
  try {
    const row = await apiCallRaw<ProductRow>(page, 'GET', `/products/${id}`);
    expect(row.name, '[449] 回读 name 须逐字等于 200 字原文，不得截断/转义改写').toBe(okName);
    expect(row.name?.length, '[449] 回读 name 长度须为 200').toBe(200);
  } finally {
    await tryCleanup(page, 'DELETE', `/products/${id}`, `449 上限产品 ${id}`);
  }

  // 超限拒绝：201 字在 validate 阶段被 400 + VALIDATION_ERROR 拦下，拒因点名上限。
  const overName = pad('449', '料', 201);
  const rejected = await apiCallExpectFail(page, 'POST', '/products', {
    code: genCode('E449O'),
    name: overName,
    category_id: categoryId,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  expectStateGateRejection(rejected, '产品名 201 字建档');
  expect(
    String(rejected.message ?? ''),
    `[449] 拒因须点名 200 字上限，实际 ${JSON.stringify(rejected.message)}`
  ).toContain('产品名称长度不能超过200个字符');
});
