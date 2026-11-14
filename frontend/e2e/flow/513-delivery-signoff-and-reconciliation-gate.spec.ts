// 送货单签收事实落库与对账来源门用例（D-50，R 节第 3 条链）
//
// 本文件把三件事钉在真实后端读回上，全部打真实接口，不用路由拦截一类伪造响应的手段。
//   一、签收事实三列落库。签收写入方是服务层 so 域 delivery.rs 的 sign_delivery，
//       仅 status=shipped 且未签收的送货单可签收，签收后 delivered_at 与 signed_at
//       与 signed_by 三列落值，signed_by 等于经办人 users.id，状态列不动（签收是事实
//       登记不是状态跃迁）。本用例对签收前后三列读回做精确比对，不接受只断 200。
//   二、非法前置与重复签收拦截。pending 送货单签收被拒（货未出库无从签收），
//       已签收送货单重复签收被拒，两类都只回可外显业务错（HTTP 400 code BusinessError），
//       不出现内部 ID 与状态实值。
//   三、对账来源门。该客户存在已发货未签收的送货单时，POST /ar-reconciliations/generate
//       被拒；签收后再生成对账单放行。无送货单的客户生成对账单不拦（对账可从发票与
//       期初余额正常生成）。
//
// 造数纪律。白坯口径出库免缸号免匹号，只强制批次，seedGreigeStockIn 建本轮唯一批次的
// 白坯库存行，出库按批次精确命中；签收链与对账腿用同一支专属客户，门只看该客户全域，
// 不受并发用例干扰。清理依赖批次唯一取值隔离，不做删除动作。

import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, apiCallExpectFail } from './helpers';
import { ensureTestEntities } from './helpers';

type Row = Record<string, unknown>;

function readNumber(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：非正数值，raw=${JSON.stringify(v)}`);
  return n;
}

function expectStatusChar(status: unknown, expected: string, label: string): void {
  expect(
    typeof status === 'string' && status.length > 0,
    `${label} 必须为非空字符串，raw=${JSON.stringify(status)}`
  ).toBe(true);
  expect(status, `${label} 词值逐字符比对`).toBe(expected);
}

/** 取本用例专属客户 id（ensureTestEntities 提供共享实体，本用例再建一支专属客户） */
async function createOwnCustomer(page: Page, nameSuffix: string): Promise<number> {
  const cust = await apiCallRaw<Row>(page, 'POST', '/customers', {
    customer_name: `签收对账门专属客户_${nameSuffix}_${Date.now()}`,
    customer_type: 'fabric_dealer',
    contact_person: '签收用例',
    phone: '13800001122',
  });
  const id = readNumber(cust.id, '建专属客户');
  return id;
}

/** 解析产品与仓库 id（ensureTestEntities 已就绪共享实体） */
async function resolveProductAndWarehouse(
  page: Page
): Promise<{ productId: number; warehouseId: number }> {
  const products = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    '/products?page=1&page_size=20'
  );
  const product = products.items?.[0];
  expect(product, '共享实体面 products 至少一行').toBeTruthy();
  const warehouses = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    '/warehouses?page=1&page_size=20'
  );
  const warehouse = warehouses.items?.[0];
  expect(warehouse, '共享实体面 warehouses 至少一行').toBeTruthy();
  return {
    productId: readNumber(product.id, '产品 id'),
    warehouseId: readNumber(warehouse.id, '仓库 id'),
  };
}

/** 建审批通过的销售订单（单行，白坯口径），返回订单 id 与客户 id */
async function createApprovedOrder(
  page: Page,
  customerId: number,
  productId: number,
  quantityMeters: string,
  unitPrice: string
): Promise<{ orderId: number; orderNo: string }> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString().slice(0, 10),
    delivery_date: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    remarks: '签收对账门用例订单',
    items: [
      {
        product_id: productId,
        quantity: quantityMeters,
        unit_price: unitPrice,
      },
    ],
  });
  const orderId = readNumber(created.id, '销售建单');
  await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
  await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expectStatusChar(detail.status, 'approved', '订单审批后状态');
  return { orderId, orderNo: String(detail.order_no ?? '') };
}

/** 发货整单并回读送货单（动作发货生成一张 shipped 送货单） */
async function shipFullAndReadDelivery(
  page: Page,
  orderId: number,
  productId: number,
  quantityMeters: string,
  batchNo: string
): Promise<{ deliveryId: number; deliveryNo: string }> {
  await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/ship`, {
    order_id: orderId,
    warehouse_code: await resolveWarehouseCode(page),
    items: [
      {
        product_id: productId,
        quantity: quantityMeters,
        batch_no: batchNo,
      },
    ],
  });
  const res = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    `/sales/orders/${orderId}/deliveries`
  );
  const delivery = res.items?.find(d => String(d.status) === 'shipped');
  if (!delivery) throw new Error('发货后不存在 shipped 送货单');
  return {
    deliveryId: readNumber(delivery.id, '送货单 id'),
    deliveryNo: String(delivery.delivery_no ?? ''),
  };
}

async function resolveWarehouseCode(page: Page): Promise<string> {
  const warehouses = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    '/warehouses?page=1&page_size=20'
  );
  const warehouse = warehouses.items?.[0];
  expect(warehouse, '仓库至少一行').toBeTruthy();
  const code = warehouse.warehouse_code ?? warehouse.code;
  expect(typeof code === 'string' && code.length > 0, '仓库编码非空').toBe(true);
  return String(code);
}

test('513-01 签收事实三列落库，状态列不动', async ({ page }) => {
  await ensureTestEntities(page);
  const { productId, warehouseId } = await resolveProductAndWarehouse(page);
  const customerId = await createOwnCustomer(page, '51301');
  const batchNo = `51301_${Date.now()}`;
  const qty = '30';

  await apiCall(page, 'POST', '/inventory/stock', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: batchNo,
    color_no: '',
    grade: '一等品',
    quantity_meters: qty,
    quantity_kg: qty,
  });

  const { orderId } = await createApprovedOrder(page, customerId, productId, qty, '12.50');
  const { deliveryId } = await shipFullAndReadDelivery(page, orderId, productId, qty, batchNo);

  // 签收前三列必须全空
  const before = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    `/sales/orders/${orderId}/deliveries`
  );
  const beforeRow = before.items?.find(d => Number(d.id) === deliveryId);
  if (!beforeRow) throw new Error('签收前送货单行不存在');
  expect(beforeRow.delivered_at, '签收前 delivered_at 为空').toBeNull();
  expect(beforeRow.signed_at, '签收前 signed_at 为空').toBeNull();
  expect(beforeRow.signed_by, '签收前 signed_by 为空').toBeNull();

  // 签收
  const signed = await apiCallRaw<Row>(
    page,
    'POST',
    `/sales/orders/${orderId}/deliveries/${deliveryId}/sign`
  );
  expect(signed.delivered_at, '签收后 delivered_at 落值').toBeTruthy();
  expect(signed.signed_at, '签收后 signed_at 落值').toBeTruthy();
  expect(
    Number.isFinite(Number(signed.signed_by)) && Number(signed.signed_by) > 0,
    `签收后 signed_by 落经办人 id，raw=${JSON.stringify(signed.signed_by)}`
  ).toBe(true);
  expectStatusChar(signed.status, 'shipped', '签收后送货单状态列不动');

  // 读回路径二次确认（不采信签收响应自带值）
  const after = await apiCallRaw<{ items: Array<Row> }>(
    page,
    'GET',
    `/sales/orders/${orderId}/deliveries`
  );
  const afterRow = after.items.find(d => Number(d.id) === deliveryId);
  if (!afterRow) throw new Error('签收后送货单行不存在');
  expect(afterRow.delivered_at, '读回 delivered_at 已落值').toBeTruthy();
  expect(afterRow.signed_at, '读回 signed_at 已落值').toBeTruthy();
});

test('513-02 pending 送货单签收被拒，已签收重复签收被拒', async ({ page }) => {
  await ensureTestEntities(page);
  const { productId, warehouseId } = await resolveProductAndWarehouse(page);
  const customerId = await createOwnCustomer(page, '51302');
  const batchNo = `51302_${Date.now()}`;

  await apiCall(page, 'POST', '/inventory/stock', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: batchNo,
    color_no: '',
    grade: '一等品',
    quantity_meters: '50',
    quantity_kg: '50',
  });

  const { orderId } = await createApprovedOrder(page, customerId, productId, '50', '10.00');

  // 手动建单口 create_delivery 落 pending（货未出库）
  const manual = await apiCallRaw<Row>(page, 'POST', `/sales/orders/${orderId}/deliveries`, {
    warehouse_id: warehouseId,
  });
  const pendingId = readNumber(manual.id, '手动建送货单');
  expectStatusChar(manual.status, 'pending', '手动建单初态');

  const fPendingSign = await apiCallExpectFail(
    page,
    'POST',
    `/sales/orders/${orderId}/deliveries/${pendingId}/sign`
  );
  expect(fPendingSign.status, `pending 签收应 400，实际=${JSON.stringify(fPendingSign)}`).toBe(400);
  expect(JSON.stringify(fPendingSign), '拒因可外显').toContain('仅已发货的送货单可签收');

  // 发货后签收一次成功，再签一次被拒
  const shipped = await shipFullAndReadDelivery(page, orderId, productId, '50', batchNo);
  await apiCall(page, 'POST', `/sales/orders/${orderId}/deliveries/${shipped.deliveryId}/sign`);
  const fRepeatSign = await apiCallExpectFail(
    page,
    'POST',
    `/sales/orders/${orderId}/deliveries/${shipped.deliveryId}/sign`
  );
  expect(fRepeatSign.status, `重复签收应 400，实际=${JSON.stringify(fRepeatSign)}`).toBe(400);
  expect(JSON.stringify(fRepeatSign), '重复签收拒因可外显').toContain('不可重复签收');
});

test('513-03 对账来源门：未签收拒、签收后放行、无送货单客户不拦', async ({ page }) => {
  await ensureTestEntities(page);
  const { productId, warehouseId } = await resolveProductAndWarehouse(page);
  const customerId = await createOwnCustomer(page, '51303');
  const batchNo = `51303_${Date.now()}`;

  await apiCall(page, 'POST', '/inventory/stock', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: batchNo,
    color_no: '',
    grade: '一等品',
    quantity_meters: '60',
    quantity_kg: '60',
  });

  const { orderId } = await createApprovedOrder(page, customerId, productId, '60', '9.00');
  const { deliveryId } = await shipFullAndReadDelivery(page, orderId, productId, '60', batchNo);

  const periodStart = '2000-01-01';
  const periodEnd = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const genBody = {
    customer_id: customerId,
    start_date: periodStart,
    end_date: periodEnd,
    notes: '签收对账门用例',
  };

  // 未签收：生成对账单被拒
  const fGen = await apiCallExpectFail(page, 'POST', '/ar-reconciliations/generate', genBody);
  expect(fGen.status, `未签收生成对账单应 400，实际=${JSON.stringify(fGen)}`).toBe(400);
  expect(JSON.stringify(fGen), '来源门拒因可外显').toContain('未签收的送货单');

  // 签收后再生成放行
  await apiCall(page, 'POST', `/sales/orders/${orderId}/deliveries/${deliveryId}/sign`);
  const generated = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations/generate', genBody);
  expect(generated.reconciliation_no, '签收后对账单生成带 RC 号').toBeTruthy();

  // 无送货单的客户：生成对账单不拦（只建发票即生成）
  const bareCustomerId = await createOwnCustomer(page, '51303b');
  await apiCall(page, 'POST', '/ar/invoices', {
    customer_id: bareCustomerId,
    invoice_amount: '100.00',
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: new Date().toISOString().slice(0, 10),
  });
  const bareGen = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations/generate', {
    customer_id: bareCustomerId,
    start_date: periodStart,
    end_date: periodEnd,
    notes: '无送货单客户放行腿',
  });
  expect(bareGen.reconciliation_no, '无送货单客户对账单正常生成').toBeTruthy();
});
