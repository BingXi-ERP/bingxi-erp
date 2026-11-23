/**
 * 功能：把「产品被销售订单明细引用时禁止删除」的守卫钉成真实 API 回读证据。
 *
 * 六要素：
 * - 调用方：本 spec 独自调用产品建档、销售订单建单、产品删除与产品列表四口，不复用共享夹具的可变主档。
 * - 入参：自建辅料产品的唯一 code/name，夹具客户 id，以及引用该产品的订单明细行。
 * - 传给谁：POST /products、POST /sales/orders、DELETE /products/{id}、GET /products。
 * - 存什么：products 一行、sales_order_items 一行；断言写到响应码、业务机器码、拒因文案与列表计数。
 * - 存哪里：products 与 sales_order_items 表；测试退出时先撤订单行再撤产品行。
 *
 * 源码判据：services/product_ops/crud.rs::delete_product 在同一事务锁父行后调用
 * find_product_references；该函数把 sales_order_item 列为引用面，命中即
 * business_displayable「该产品已被销售订单明细引用，无法删除…」，映射 400 BUSINESS_ERROR。
 * 与 463（销售价目引用面）不重复：本用例走订单明细面，且增加删除前后列表计数对照，
 * 排除「删除请求失败但列表已经少行」的假绿。
 */
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectBusinessRejection,
  failureCode,
  genCode,
  genName,
  getCtx,
  tryCleanup,
} from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

/** 先 push 宿主产品、再 push 引用订单；afterEach 逆序执行，先撤引用再撤宿主。 */
const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

interface ProductListPage {
  items: Array<{ id: number }>;
  total: number;
}

test.describe.serial('607 产品被销售订单明细引用禁止删除', () => {
  test('607-1 订单明细引用下删产品必须 400 业务拒绝且列表计数不减', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();

    const code = genCode('607P');
    const name = genName('607REF');
    const product = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
      name,
      code,
      unit: 'm',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    const productId = Number(product?.id);
    expect(productId, '[607-1] 自建产品必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/products/${productId}`, label: '[607-1] 宿主产品' });

    const searchPath = `/products?page=1&page_size=100&search=${encodeURIComponent(code)}`;
    const listBefore = await apiCallRaw<ProductListPage>(page, 'GET', searchPath);
    expect(Array.isArray(listBefore.items), '[607-1] 删除前产品列表必须回 items 数组').toBe(true);
    expect(
      listBefore.total,
      `[607-1] 唯一编码 ${code} 删除前应恰有 1 行，实际 ${listBefore.total}`
    ).toBe(1);
    expect(
      listBefore.items.some(row => Number(row.id) === productId),
      '[607-1] 删除前列表必须含自建产品'
    ).toBe(true);

    const order = await apiCall<{ id?: number }>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      order_date: new Date().toISOString(),
      items: [
        {
          product_id: productId,
          quantity: 10,
          unit_price: 25.5,
          color_name: '607原色',
        },
      ],
    });
    const orderId = Number(order?.data?.id);
    expect(orderId, '[607-1] 引用产品的新建销售订单必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: '[607-1] 引用订单' });

    const del = await apiCallExpectFail(page, 'DELETE', `/products/${productId}`);
    expectBusinessRejection(del, `[607-1] 被订单明细引用的产品 ${productId} 删除必须业务拒绝`);
    expect(
      failureCode(del),
      `[607-1] 拒绝机器码必须是 BUSINESS_ERROR，实际 ${JSON.stringify(del.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(del.message ?? ''),
      '[607-1] 拒因必须点名销售订单明细这一引用面，否则无法定位 blocker'
    ).toContain('订单明细');

    // apiCallRaw 仅在 HTTP 2xx 且信封 code=200 时返回数据，非 2xx 直接抛错；
    // 用它回读即同时证明「GET 仍 200」与「主键仍是自建产品」。
    const detail = await apiCallRaw<{ id?: number }>(page, 'GET', `/products/${productId}`);
    expect(Number(detail?.id), '[607-1] 被拒删除后主键回读必须仍是自建产品（2xx）').toBe(productId);

    const listAfter = await apiCallRaw<ProductListPage>(page, 'GET', searchPath);
    expect(Array.isArray(listAfter.items), '[607-1] 删除后产品列表必须回 items 数组').toBe(true);
    expect(listAfter.total, '[607-1] 删除被拒后列表计数不得减少').toBe(listBefore.total);
    expect(
      listAfter.items.some(row => Number(row.id) === productId),
      '[607-1] 删除被拒后列表仍须含自建产品'
    ).toBe(true);
  });
});
