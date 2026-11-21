/**
 * 功能：把「产品主数据被下游业务行引用时禁止删除」的删除守卫钉成真实 E2E。
 *
 * rule provenance：产品删除服务在同一事务内先锁父行，再逐表统计引用行；任一引用存在即以
 * business_displayable 返回 HTTP 400 / BUSINESS_ERROR，文案点名引用记录标签。
 * 本 spec 选销售价目行作引用面：建单端点 POST /sales/sales-prices 的必填字段仅产品、价格、
 * 单位与价目类型，其余列由服务端补默认值，造数前置最轻。
 *
 * 收紧假绿：删除拒绝用 expectBusinessRejection 钉死 HTTP=400 + 字符串业务机器码（非 5xx 家族）
 * + 非空 message，再逐字核对机器码与源码文案片段，禁止放宽成 >=400 蒙过；
 * 删除后按主键回读证产品仍在，不拿"删除请求失败"当守卫命中的猜测。对照组另建无引用产品，
 * 删除后按主键回读必须 404，证明门只挡被引用行、非永久锁死。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  expectBusinessRejection,
  failureCode,
  genCode,
  genName,
  loginViaUI,
  tryCleanup,
} from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

/** 先 push 产品、再 push 引用行；afterEach 逆序执行，先撤引用再删宿主。 */
const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe.serial('463 主数据引用完整性：被引用禁止删除', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('463-1 销售价目引用下删除产品必须 400 BUSINESS_ERROR 且产品不被删除', async ({ page }) => {
    // 宿主取非面料类「辅料」，避开面料类幅宽/克重/面料成分必录的服务层校验。
    const product = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
      name: genName('463REF'),
      code: genCode('463P'),
      unit: 'm',
      product_type: PRODUCT_TYPE.auxiliary,
      standard_price: '45.45',
    });
    const productId = product.id;
    if (typeof productId !== 'number' || productId <= 0) {
      throw new Error(`[463-1] 宿主产品创建失败：期望正整数 id，实际 ${JSON.stringify(product)}`);
    }
    CLEANUP.push({ path: `/products/${productId}`, label: '[463-1] 宿主产品' });

    // sales_price 行落库即构成 find_product_references 的阻塞面（label = 销售价目记录）。
    const price = await apiCallRaw<{ id?: number }>(page, 'POST', '/sales/sales-prices', {
      product_id: productId,
      price: '7788.100000',
      unit: 'meter',
      price_type: 'STANDARD',
    });
    const priceId = price.id;
    if (typeof priceId !== 'number' || priceId <= 0) {
      throw new Error(`[463-1] 销售价目记录创建失败：期望正整数 id，实际 ${JSON.stringify(price)}`);
    }
    CLEANUP.push({ path: `/sales/sales-prices/${priceId}`, label: '[463-1] 销售价目记录' });

    const del = await apiCallExpectFail(page, 'DELETE', `/products/${productId}`);
    expectBusinessRejection(del, `[463-1] 被销售价目记录引用的产品 ${productId} 删除必须业务拒绝`);
    expect(
      failureCode(del),
      `[463-1] 拒绝机器码必须是 BUSINESS_ERROR，实际 ${JSON.stringify(del.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const message = del.message;
    if (typeof message !== 'string') {
      throw new Error(`[463-1] 拒绝响应必须带字符串 message，实际 ${JSON.stringify(del)}`);
    }
    // 逐字对照删除守卫的 detail 文案：detail = "{count} 条{label}"，count=1、label=销售价目记录。
    expect(message).toContain('该产品已被');
    expect(message).toContain('1 条销售价目记录');
    expect(message).toContain('引用，无法删除，请先处理上述关联业务数据后再试');

    // 守卫必须真的挡住删除：按主键回读产品仍在，不靠"请求失败"猜。
    const stillThere = await apiCallRaw<{ id?: number }>(page, 'GET', `/products/${productId}`);
    expect(
      stillThere.id,
      `[463-1] 删除被拒后产品 ${productId} 必须仍可按主键读回，实际 ${JSON.stringify(stillThere)}`
    ).toBe(productId);
  });

  test('463-2 无引用产品删除必须真删成功（对照组）', async ({ page }) => {
    const product = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
      name: genName('463FREE'),
      code: genCode('463F'),
      unit: 'm',
      product_type: PRODUCT_TYPE.auxiliary,
      standard_price: '12.34',
    });
    const productId = product.id;
    if (typeof productId !== 'number' || productId <= 0) {
      throw new Error(`[463-2] 对照组产品创建失败：期望正整数 id，实际 ${JSON.stringify(product)}`);
    }
    CLEANUP.push({ path: `/products/${productId}`, label: '[463-2] 对照组产品' });

    await apiCallRaw<unknown>(page, 'DELETE', `/products/${productId}`);

    const gone = await apiCallExpectFail(page, 'GET', `/products/${productId}`);
    expect(gone.status, `[463-2] 无引用产品删除后按主键读回必须 404，实际 ${gone.status}`).toBe(
      404
    );
    expect(
      failureCode(gone),
      `[463-2] 404 机器码必须是 NOT_FOUND，实际 ${JSON.stringify(gone.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
  });
});
