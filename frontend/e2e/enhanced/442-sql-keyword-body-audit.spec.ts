// 4.8 接口安全 / 4.11 OWASP：请求体字面 SQL 关键字命中全局审计门，返回 400 BAD_REQUEST。
// 后端判据：middleware/sql_injection_audit.rs:32-110 DANGEROUS_PATTERNS 含 "'; DROP TABLE"(:43)
//   与 "-- "(:57)；:114-157 中间件在 create_router 最外层全局挂载（routes/mod.rs:592-594），
//   对 Content-Type 为 application/json 且 <=1MB 的请求体逐模式扫描，命中即
//   AppError::BadRequest("请求包含非法字符")；utils/error.rs:819 映射机器码 BAD_REQUEST、HTTP 400。
// 与既有覆盖分工：enhanced/sql-injection-negative.spec.ts 用 encodeURIComponent 把 payload
//   放进 URL query，审计读到的是编码后字面串（%27%3B... 不含明文关键字），它测的是
//   sea-orm 参数化查询"恒真 payload 不绕过"；本例专钉 JSON body 明文危险串被审计门
//   前置拒绝（到不了 handler、不落库），两条门正交。
// 检测力：正向对照先证明端点与账号权限有效；若审计中间件被摘除或 body 审计失效，
//   负例会落库返回 200 → 红。断言恰为 400 + BAD_REQUEST，403（CSRF/权限）与 404 都不算通过。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

async function seedCategoryId(page: Page): Promise<number> {
  const cats = await apiCallRaw<{ items?: Array<{ id?: unknown }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(cats?.items?.[0]?.id);
  expect(id, '[442] 须有已种入的分类作建档必填来源').toBeGreaterThan(0);
  return id;
}

test('442-01 SQL 关键字在 JSON body 命中审计门被 400 BAD_REQUEST 拒绝，正常建档不受影响', async ({
  page,
}) => {
  const categoryId = await seedCategoryId(page);

  // 正向对照：同端点用正常 name 可建单成功，证明端点已挂载、账号有权限、字段结构合法。
  const goodCode = genCode('E442OK');
  const good = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code: goodCode,
    name: `442正常品${goodCode}`,
    category_id: categoryId,
    unit: '米',
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const goodId = Number(good.data?.id);
  expect(goodId, '[442] 正向对照须建单成功，否则负例 400 可能只是端点/权限问题').toBeGreaterThan(0);

  try {
    // 负例：name 含明文 "'; DROP TABLE products; --"，命中审计门，到不了 handler。
    const badCode = genCode('E442SQL');
    const rejected = await apiCallExpectFail(page, 'POST', '/products', {
      code: badCode,
      name: "'; DROP TABLE products; --",
      category_id: categoryId,
      unit: '米',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    expect(
      rejected.status,
      `[442] 明文 SQL 关键字请求体须被审计门拒绝 400，实际 status=${rejected.status}` +
        ` code=${JSON.stringify(rejected.code)}（403=CSRF/权限门，404=端点漂移，均不算审计门生效）`
    ).toBe(400);
    expect(
      failureCode(rejected),
      `[442] 拒绝码须为 BAD_REQUEST，实际 ${JSON.stringify(rejected.code)}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);
  } finally {
    await tryCleanup(page, 'DELETE', `/products/${goodId}`, `442-01 正向对照产品 ${goodId}`);
  }
});
