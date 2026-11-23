/**
 * 功能：锁定「主数据改名后，历史销售订单/报价详情名称实时跟随档案，明细 color_name 仍是快照」的口径。
 *
 * 六要素：
 * - 调用方：本 spec 自建客户与产品，建草稿订单与报价后 PUT 改名，再回读订单/报价详情。
 * - 入参：自建客户 customer_name、产品 name/code，订单与报价的最小建单体，两次 PUT 只改名称列。
 * - 传给谁：POST /crm/customers、POST /products、POST /sales/orders、POST /quotations、
 *   PUT /crm/customers/{id}、PUT /products/{id}、GET /sales/orders/{id}、GET /quotations/{id}。
 * - 存什么：断言落在订单详情 customer_name、明细 product_name 与 color_name，报价详情
 *   customer_name 与明细 product_name；全部以 models 的 snake_case 键回读。
 * - 存哪里：customers/products/sales_orders/quotations 各一行及其明细；收尾按依赖逆序清理。
 *
 * 源码判据（实时 join，非快照；与报告口径一致）：
 * - 订单详情 services/so/order_query.rs::get_order_detail 经 find_related(customer) 取
 *   customer_name（build_order_detail:334），明细 product_name 由 build_single_item_detail:486
 *   从 products 行实时映射——均无落库快照列。
 * - 报价详情 handlers/quotation_handler.rs::get_quotation 调 attach_names
 *   （quotation_ops/crud.rs:293-319 实时查 customers），明细 product_name 由
 *   quotation_handler get_quotation 的 LeftJoin products 富化（quotation_response_dto.rs:143）。
 * - sales_order_item.rs:28 color_name 是明细落库列：建单时写入的行级快照，改名不跟随。
 * 若验收要求历史单据名称冻结，属需求冲突需决策，不能靠放宽本断言落绿。
 */
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, genName, tryCleanup } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

interface QuotationItemRow {
  product_id: number;
  product_name: string | null;
}

interface QuotationDetail {
  id: number;
  customer_id: number;
  customer_name: string | null;
  items: QuotationItemRow[];
}

interface OrderItemRow {
  product_id: number;
  product_name: string | null;
  color_name: string | null;
}

interface OrderDetail {
  id: number;
  customer_id: number;
  customer_name: string | null;
  items: OrderItemRow[];
}

const isoDate = (daysFromToday: number): string =>
  new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);

test.describe.serial('611 主数据改名后历史单据名称跟随档案', () => {
  test('611-1 订单客户名/明细产品名跟随新名，明细 color_name 保持建单快照', async ({ page }) => {
    const tag = genCode('611');
    const originalCustomerName = `611改名前客户_${tag}`;
    const originalProductName = `611改名前产品_${tag}`;

    const customer = await apiCallRaw<{ id?: number }>(page, 'POST', '/crm/customers', {
      customer_name: originalCustomerName,
      contact_person: `611联系_${tag}`,
      contact_phone: `139${Date.now().toString().slice(-8)}`,
      customer_type: 'retail',
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[611-1] 自建客户必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: '[611-1] 自建客户' });

    const product = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
      name: originalProductName,
      code: genCode('611P'),
      unit: 'm',
      product_type: PRODUCT_TYPE.auxiliary,
    });
    const productId = Number(product?.id);
    expect(productId, '[611-1] 自建产品必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/products/${productId}`, label: '[611-1] 自建产品' });

    const snapshotColorName = `611快照原色_${tag}`;
    const order = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      items: [
        {
          product_id: productId,
          quantity: 10,
          unit_price: 25.5,
          color_name: snapshotColorName,
        },
      ],
    });
    const orderId = Number(order?.data?.id);
    expect(orderId, '[611-1] 草稿销售订单必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: '[611-1] 草稿订单' });

    const quotation = await apiCallRaw<{ id?: number }>(page, 'POST', '/quotations', {
      customer_id: customerId,
      sales_user_id: 1,
      quotation_date: isoDate(0),
      valid_until: isoDate(30),
      currency: 'CNY',
      exchange_rate: '1',
      base_currency: 'CNY',
      price_terms: 'FOB',
      tax_inclusive: true,
      tax_rate: '0',
      items: [
        {
          product_id: productId,
          unit: 'm',
          quantity: '500',
          unit_price: '250',
          unit_price_with_tax: '250',
        },
      ],
      notes: `611报价_${tag}`,
    });
    const quotationId = Number(quotation?.id);
    expect(quotationId, '[611-1] 草稿报价必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/quotations/${quotationId}`, label: '[611-1] 草稿报价' });

    const newCustomerName = `611改名后客户_${tag}`;
    await apiCall(page, 'PUT', `/crm/customers/${customerId}`, {
      customer_name: newCustomerName,
    });
    const newProductName = `611改名后产品_${tag}`;
    await apiCall(page, 'PUT', `/products/${productId}`, { name: newProductName });

    const orderAfter = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(
      String(orderAfter?.customer_name ?? ''),
      '[611-1] 订单详情 customer_name 必须实时跟随客户档案新名'
    ).toBe(newCustomerName);
    const orderItem = orderAfter?.items?.find(row => Number(row.product_id) === productId);
    expect(orderItem, '[611-1] 订单详情必须含引用自建产品的明细行').toBeTruthy();
    expect(
      String(orderItem?.product_name ?? ''),
      '[611-1] 订单明细 product_name 必须实时跟随产品档案新名'
    ).toBe(newProductName);
    expect(
      String(orderItem?.color_name ?? ''),
      '[611-1] 订单明细 color_name 是建单落库快照，改名后必须保持原值'
    ).toBe(snapshotColorName);

    const quotationAfter = await apiCallRaw<QuotationDetail>(
      page,
      'GET',
      `/quotations/${quotationId}`
    );
    expect(
      String(quotationAfter?.customer_name ?? ''),
      '[611-1] 报价详情 customer_name 必须实时跟随客户档案新名'
    ).toBe(newCustomerName);
    const quotationItem = quotationAfter?.items?.find(row => Number(row.product_id) === productId);
    expect(quotationItem, '[611-1] 报价详情必须含引用自建产品的明细行').toBeTruthy();
    expect(
      String(quotationItem?.product_name ?? ''),
      '[611-1] 报价明细 product_name 必须实时跟随产品档案新名'
    ).toBe(newProductName);
  });
});
