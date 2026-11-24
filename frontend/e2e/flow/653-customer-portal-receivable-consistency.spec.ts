// 功能：锁定小程序客户门户订单已收/未收与应收汇总随真实 AR 收款、红冲、作废同步变化。
// 调用方：Playwright flow 分片；管理员造客户、订单、库存与绑定 customer 账号，客户会话只读门户。
// 入参：两笔本户 40 米订单、一户他户 40 米订单、三张染色匹、一笔 400 元部分收款；无 mock 或网络拦截。
// 传给谁：销售发货/取消、AR 审批/收款/取消与 customer-portal 订单列表/详情/汇总接口。
// 存什么：断言 Decimal 字符串折算整数分，列表与详情一致、汇总等于逐单未收之和。
// 存哪里：PostgreSQL 业务表与 Playwright 报告；收尾按收款、送货、应收、订单、用户与客户的真实反向链逐项回读。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  genName,
  getCtx,
  loginInIsolatedContext,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  testPassword,
} from './helpers';

type Row = Record<string, unknown>;

interface CustomerRow {
  id?: number;
}

interface OrderRow {
  id?: number;
  order_no?: string;
  total_amount?: number | string;
}

interface DeliveryRow {
  id?: number;
  status?: string;
  total_amount?: number | string;
}

interface ArRow {
  id?: number;
  sales_order_no?: string | null;
  source_type?: string | null;
  invoice_amount?: number | string;
  received_amount?: number | string;
  unpaid_amount?: number | string;
  status?: string;
}

interface PortalOrderRow {
  id?: number;
  customer_id?: number;
  paid_amount?: number | string;
  balance_amount?: number | string;
}

interface PortalDashboard {
  order_count?: number;
  receivable_balance?: number | string;
}

function positiveId(id: unknown, label: string): number {
  const value = Number(id);
  expect(Number.isSafeInteger(value) && value > 0, `${label} 应返回正整数 id`).toBe(true);
  return value;
}

function toCents(value: unknown, label: string): bigint {
  const raw =
    typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  const match = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if (!match) {
    throw new Error(`${label}：Decimal 出参形态非法，实际 ${JSON.stringify(value)}`);
  }
  const [, sign, integer, fraction = ''] = match;
  if (fraction.length > 2 && fraction.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：标度超过 2 位且尾数非零，实际 ${raw}`);
  }
  const cents = BigInt(integer) * 100n + BigInt((fraction + '00').slice(0, 2));
  return sign === '-' ? -cents : cents;
}

async function findRoleId(page: Page, code: string): Promise<number> {
  const response = await apiCallRaw<{ roles?: Array<Row & { code?: string }> }>(
    page,
    'GET',
    '/roles?page=1&page_size=100'
  );
  expect(Array.isArray(response.roles), '角色列表必须返回 data.roles').toBe(true);
  const role = response.roles!.find(item => item.code === code);
  expect(role, `${code} 角色应存在`).toBeTruthy();
  return positiveId(role?.id, `${code} 角色`);
}

async function findArByOrderNo(page: Page, customerId: number, orderNo: string): Promise<ArRow[]> {
  const rows: ArRow[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const response = await apiCallRaw<{ items?: ArRow[]; total?: number }>(
      page,
      'GET',
      `/ar/invoices?customer_id=${customerId}&page=${pageNo}&page_size=100`
    );
    expect(Array.isArray(response.items), `AR 列表第 ${pageNo} 页必须返回 items`).toBe(true);
    rows.push(...response.items!.filter(item => String(item.sales_order_no ?? '') === orderNo));
    if (pageNo * 100 >= Number(response.total ?? 0)) break;
  }
  return rows;
}

async function readPortalOrderList(page: Page): Promise<PortalOrderRow[]> {
  const response = await apiCallRaw<{ items?: PortalOrderRow[]; total?: number }>(
    page,
    'GET',
    '/customer-portal/orders?page=1&page_size=100'
  );
  expect(Array.isArray(response.items), '门户订单列表必须返回 items').toBe(true);
  return response.items!;
}

async function readPortalOrder(page: Page, orderId: number): Promise<PortalOrderRow> {
  const detail = await apiCallRaw<PortalOrderRow>(
    page,
    'GET',
    `/customer-portal/sales-orders/${orderId}`
  );
  const list = await readPortalOrderList(page);
  const listed = list.find(item => Number(item.id) === orderId);
  expect(listed, `门户列表必须包含订单 ${orderId}`).toBeTruthy();
  expect(toCents(listed!.paid_amount, '列表已收'), '列表与详情已收必须一致').toBe(
    toCents(detail.paid_amount, '详情已收')
  );
  expect(toCents(listed!.balance_amount, '列表未收'), '列表与详情未收必须一致').toBe(
    toCents(detail.balance_amount, '详情未收')
  );
  return detail;
}

async function expectPortalReceivable(
  page: Page,
  orderId: number,
  paid: bigint,
  unpaid: bigint
): Promise<void> {
  const detail = await readPortalOrder(page, orderId);
  expect(toCents(detail.paid_amount, '门户订单已收'), `订单 ${orderId} 已收金额错误`).toBe(paid);
  expect(toCents(detail.balance_amount, '门户订单未收'), `订单 ${orderId} 未收金额错误`).toBe(
    unpaid
  );
}

async function expectDashboardReceivable(page: Page, unpaid: bigint): Promise<void> {
  const dashboard = await apiCallRaw<PortalDashboard>(page, 'GET', '/customer-portal/dashboard');
  expect(
    toCents(dashboard.receivable_balance, '门户应收汇总'),
    '门户应收汇总必须等于有效 AR 未收净额'
  ).toBe(unpaid);
}

async function expectPortalCustomerIsolation(
  page: Page,
  customerId: number,
  ownOrderIds: number[],
  foreignOrderId: number,
  unpaid: bigint
): Promise<void> {
  const seenOrderIds: number[] = [];
  let total = 0;
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const response = await apiCallRaw<{ items?: PortalOrderRow[]; total?: number }>(
      page,
      'GET',
      `/customer-portal/orders?page=${pageNo}&page_size=1`
    );
    expect(Array.isArray(response.items), `门户订单第 ${pageNo} 页必须返回 items`).toBe(true);
    expect(response.items!.length, '每页一条时不得返回超过一条订单').toBeLessThanOrEqual(1);
    total = Number(response.total ?? 0);
    for (const item of response.items!) {
      seenOrderIds.push(positiveId(item.id, '门户订单'));
      expect(Number(item.customer_id), '门户订单必须属于绑定客户').toBe(customerId);
    }
    if (pageNo >= total) break;
  }
  expect(total, '门户订单总数不得计入他户订单').toBe(ownOrderIds.length);
  expect(new Set(seenOrderIds), '逐页订单集合不得串户或重复').toEqual(new Set(ownOrderIds));
  const foreignOrder = await apiCallExpectFail(
    page,
    'GET',
    `/customer-portal/sales-orders/${foreignOrderId}`
  );
  expect(foreignOrder.status, '他户订单详情必须返回 404').toBe(404);
  await expectDashboardReceivable(page, unpaid);
}

async function createOrder(
  page: Page,
  customerId: number,
  productId: number,
  unitPrice = '25.00'
): Promise<OrderRow> {
  const order = await apiCallRaw<OrderRow>(page, 'POST', '/sales/orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity: '40',
        unit_price: unitPrice,
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E2E-653-${genCode('AR')}`,
  });
  positiveId(order.id, '销售订单');
  expect(String(order.order_no ?? '').length, '销售订单必须返回 order_no').toBeGreaterThan(0);
  return order;
}

async function shipOrder(
  page: Page,
  order: OrderRow,
  warehouseCode: string,
  productId: number,
  pieceNo: string,
  dyeLotNo: string,
  colorNo: string
): Promise<DeliveryRow> {
  const orderId = positiveId(order.id, '销售订单');
  await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
    order_id: orderId,
    warehouse_code: warehouseCode,
    items: [
      {
        product_id: productId,
        quantity: '40',
        batch_no: dyeLotNo,
        color_no: colorNo,
        dye_lot_no: dyeLotNo,
        piece_no: pieceNo,
      },
    ],
  });
  const deliveries = await apiCallRaw<{ list?: DeliveryRow[]; total?: number }>(
    page,
    'GET',
    `/sales/orders/${orderId}/deliveries`
  );
  expect(Array.isArray(deliveries.list), '发货回读必须返回 list').toBe(true);
  const shipped = deliveries.list!.find(item => item.status === 'shipped');
  expect(shipped, '发货后必须存在 shipped 发货单').toBeTruthy();
  positiveId(shipped!.id, '发货单');
  return shipped!;
}

async function readDeliveries(page: Page, orderId: number): Promise<DeliveryRow[]> {
  const response = await apiCallRaw<{ list?: DeliveryRow[]; total?: number }>(
    page,
    'GET',
    `/sales/orders/${orderId}/deliveries`
  );
  expect(Array.isArray(response.list), '发货单列表必须返回 list').toBe(true);
  return response.list!;
}

async function cleanupOrder(
  page: Page,
  orderId: number,
  customerId: number,
  orderNo: string
): Promise<void> {
  if (orderId <= 0) return;

  const deliveries = await readDeliveries(page, orderId);
  const shipped = deliveries.filter(item => item.status === 'shipped');
  for (const delivery of shipped) {
    await apiCall(
      page,
      'POST',
      `/sales/orders/${orderId}/deliveries/${positiveId(delivery.id, '待取消发货单')}/cancel`,
      { reason: 'E2E-653 清理取消发货' }
    );
  }
  const afterDeliveryCancel = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  if (shipped.length > 0) {
    expect(afterDeliveryCancel.status, '取消全部发货后订单必须回退 approved').toBe('approved');
  }

  let invoices = await findArByOrderNo(page, customerId, orderNo);
  for (const invoice of invoices.filter(item => item.status === 'DRAFT')) {
    await apiCall(page, 'DELETE', `/ar/invoices/${positiveId(invoice.id, '待删除草稿应收')}`);
  }
  invoices = await findArByOrderNo(page, customerId, orderNo);
  for (const invoice of invoices.filter(item => item.status !== 'CANCELLED')) {
    await apiCall(page, 'POST', `/ar/invoices/${positiveId(invoice.id, '待作废应收')}/cancel`, {
      reason: 'E2E-653 清理作废应收',
    });
  }
  const remainingInvoices = await findArByOrderNo(page, customerId, orderNo);
  expect(
    remainingInvoices.every(item => item.status === 'CANCELLED'),
    '清理后不得残留有效应收单'
  ).toBe(true);

  const beforeOrderCancel = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  if (beforeOrderCancel.status !== 'cancelled') {
    await apiCall(page, 'POST', `/sales/orders/${orderId}/cancel`);
  }
  const cancelledOrder = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(cancelledOrder.status, '清理后订单必须处于 cancelled').toBe('cancelled');
  const remainingDeliveries = await readDeliveries(page, orderId);
  expect(
    remainingDeliveries.every(item => item.status === 'cancelled'),
    '清理后不得残留 shipped 发货单'
  ).toBe(true);
}

test.describe.serial('653 小程序门户应收与真实 AR 净额一致', () => {
  test.setTimeout(240_000);

  test('部分收款、取消红冲、重新发货与作废逐笔同步门户金额', async ({ page, browser }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    expect(productId, 'ensureTestEntities 应备好报价专用产品').toBeTruthy();

    const customer = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
      customer_name: genName('653门户应收客户'),
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '10000',
      payment_terms: 30,
    });
    const customerId = positiveId(customer.id, '门户客户');
    const customerRoleId = await findRoleId(page, 'customer');
    const username = genCode('mp653bound');
    const user = await apiCallRaw<Row>(page, 'POST', '/users', {
      username,
      password: testPassword(),
      role_id: customerRoleId,
      customer_id: customerId,
    });
    const userId = positiveId(user.id, '门户绑定账号');
    expect(Number(user.customer_id), '账号创建回读必须保留客户绑定').toBe(customerId);
    let portal: Awaited<ReturnType<typeof loginInIsolatedContext>> | undefined;
    let orderAId = 0;
    let orderBId = 0;
    let orderCId = 0;
    let otherCustomerId = 0;
    let paymentId = 0;
    let orderANo = '';
    let orderBNo = '';
    let orderCNo = '';

    try {
      portal = await loginInIsolatedContext(browser, username, testPassword());
      const warehouse = await pickDyeableWarehouse(page);
      const bundle = await seedDyedOutboundBundle(page, {
        productId: productId!,
        warehouseId: warehouse.id,
        quantityMeters: '120',
        pieceCount: 3,
        context: 'E653',
      });
      expect(bundle.pieces.length, '真实库存链应产出三张染色匹').toBe(3);

      const otherCustomer = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
        customer_name: genName('653门户他户客户'),
        customer_type: 'wholesale',
        status: 'active',
        credit_limit: '10000',
        payment_terms: 30,
      });
      otherCustomerId = positiveId(otherCustomer.id, '他户客户');
      const orderA = await createOrder(page, customerId, productId!);
      const orderB = await createOrder(page, customerId, productId!);
      const orderC = await createOrder(page, otherCustomerId, productId!, '37.50');
      orderAId = positiveId(orderA.id, '订单 A');
      orderBId = positiveId(orderB.id, '订单 B');
      orderCId = positiveId(orderC.id, '他户订单');
      orderANo = String(orderA.order_no);
      orderBNo = String(orderB.order_no);
      orderCNo = String(orderC.order_no);
      await apiCall(page, 'POST', `/sales/orders/${orderAId}/submit`);
      await apiCall(page, 'POST', `/sales/orders/${orderAId}/approve`);
      await apiCall(page, 'POST', `/sales/orders/${orderBId}/submit`);
      await apiCall(page, 'POST', `/sales/orders/${orderBId}/approve`);
      await apiCall(page, 'POST', `/sales/orders/${orderCId}/submit`);
      await apiCall(page, 'POST', `/sales/orders/${orderCId}/approve`);

      const deliveryA = await shipOrder(
        page,
        orderA,
        warehouse.code,
        productId!,
        bundle.pieces[0].piece_no,
        bundle.dyeLotNo,
        bundle.colorNo
      );
      const deliveryB = await shipOrder(
        page,
        orderB,
        warehouse.code,
        productId!,
        bundle.pieces[1].piece_no,
        bundle.dyeLotNo,
        bundle.colorNo
      );
      await shipOrder(
        page,
        orderC,
        warehouse.code,
        productId!,
        bundle.pieces[2].piece_no,
        bundle.dyeLotNo,
        bundle.colorNo
      );
      const initialArA = await findArByOrderNo(page, customerId, orderANo);
      const initialArB = await findArByOrderNo(page, customerId, orderBNo);
      const initialArC = await findArByOrderNo(page, otherCustomerId, orderCNo);
      expect(initialArA.length, '订单 A 初始只能有一张自动应收').toBe(1);
      expect(initialArB.length, '订单 B 初始只能有一张自动应收').toBe(1);
      expect(initialArC.length, '他户订单初始只能有一张自动应收').toBe(1);
      const arAId = positiveId(initialArA[0].id, '订单 A 应收');
      const arBId = positiveId(initialArB[0].id, '订单 B 应收');
      const arCId = positiveId(initialArC[0].id, '他户订单应收');
      expect(initialArA[0].status, '自动应收初始必须为 DRAFT').toBe('DRAFT');
      expect(initialArB[0].status, '自动应收初始必须为 DRAFT').toBe('DRAFT');
      expect(initialArC[0].status, '他户自动应收初始必须为 DRAFT').toBe('DRAFT');
      expect(toCents(initialArC[0].invoice_amount, '他户应收金额'), '他户金额必须显著不同').toBe(
        150000n
      );

      await expectPortalReceivable(portal.page, orderAId, 0n, 0n);
      await expectPortalReceivable(portal.page, orderBId, 0n, 0n);
      await expectDashboardReceivable(portal.page, 0n);

      await apiCall(page, 'POST', `/ar/invoices/${arAId}/approve`);
      await apiCall(page, 'POST', `/ar/invoices/${arBId}/approve`);
      await apiCall(page, 'POST', `/ar/invoices/${arCId}/approve`);
      const approvedArC = await findArByOrderNo(page, otherCustomerId, orderCNo);
      expect(approvedArC.length, '他户应收审批后必须可回读').toBe(1);
      expect(approvedArC[0].status, '他户应收必须审批生效').toBe('APPROVED');
      expect(
        toCents(approvedArC[0].unpaid_amount, '他户应收未收金额'),
        '他户有效应收必须为 1500 元'
      ).toBe(150000n);
      await expectPortalReceivable(portal.page, orderAId, 0n, 100000n);
      await expectPortalReceivable(portal.page, orderBId, 0n, 100000n);
      await expectPortalCustomerIsolation(
        portal.page,
        customerId,
        [orderAId, orderBId],
        orderCId,
        200000n
      );

      const payment = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
        customer_id: customerId,
        amount: '400.00',
        payment_method: 'bank_transfer',
        payment_date: new Date().toISOString().slice(0, 10),
        invoice_ids: [arAId],
      });
      paymentId = positiveId(payment.id, '部分收款单');
      expect(payment.status, '新建收款单必须为 pending').toBe('pending');
      await expectPortalReceivable(portal.page, orderAId, 40000n, 60000n);
      await expectPortalReceivable(portal.page, orderBId, 0n, 100000n);
      await expectDashboardReceivable(portal.page, 160000n);

      const rejectedCancel = await apiCallExpectFail(
        page,
        'POST',
        `/sales/orders/${orderAId}/deliveries/${positiveId(deliveryA.id, '订单 A 发货单')}/cancel`,
        { reason: 'E2E-653 部分收款拒绝取消' }
      );
      expect(rejectedCancel.status, '部分收款发货单取消必须被拒绝').toBe(400);
      await expectPortalReceivable(portal.page, orderAId, 40000n, 60000n);
      expect(
        (await findArByOrderNo(page, customerId, orderANo)).length,
        '拒绝取消不得生成红字'
      ).toBe(1);

      await apiCall(
        page,
        'POST',
        `/sales/orders/${orderBId}/deliveries/${positiveId(deliveryB.id, '订单 B 发货单')}/cancel`,
        { reason: 'E2E-653 未收款取消生成红字' }
      );
      const afterCancel = await findArByOrderNo(page, customerId, orderBNo);
      expect(afterCancel.length, '取消只能新增一张红字应收').toBe(2);
      const credit = afterCancel.find(item => toCents(item.invoice_amount, '红字金额') < 0n);
      expect(credit, '取消必须留下负金额红字应收').toBeTruthy();
      expect(credit!.status, '取消红字初始必须为 DRAFT').toBe('DRAFT');
      await expectPortalReceivable(portal.page, orderBId, 0n, 100000n);

      const creditId = positiveId(credit!.id, '取消红字应收');
      await apiCall(page, 'POST', `/ar/invoices/${creditId}/approve`);
      await expectPortalReceivable(portal.page, orderBId, 0n, 0n);
      await expectDashboardReceivable(portal.page, 60000n);

      await shipOrder(
        page,
        orderB,
        warehouse.code,
        productId!,
        bundle.pieces[1].piece_no,
        bundle.dyeLotNo,
        bundle.colorNo
      );
      const afterReship = await findArByOrderNo(page, customerId, orderBNo);
      expect(afterReship.length, '重新发货只能新增一张原应收').toBe(3);
      const newReceivable = afterReship.find(
        item => Number(item.id) !== arBId && Number(item.id) !== creditId
      );
      expect(newReceivable, '重新发货必须生成新的原应收').toBeTruthy();
      expect(newReceivable!.status, '重新发货应收初始必须为 DRAFT').toBe('DRAFT');
      await expectPortalReceivable(portal.page, orderBId, 0n, 0n);

      const newReceivableId = positiveId(newReceivable!.id, '重新发货应收');
      await apiCall(page, 'POST', `/ar/invoices/${newReceivableId}/approve`);
      await expectPortalReceivable(portal.page, orderBId, 0n, 100000n);
      await expectDashboardReceivable(portal.page, 160000n);

      await apiCall(page, 'POST', `/ar/invoices/${newReceivableId}/cancel`, {
        reason: 'E2E-653 作废应收排除',
      });
      await expectPortalReceivable(portal.page, orderBId, 0n, 0n);
      await expectPortalReceivable(portal.page, orderAId, 40000n, 60000n);
      await expectPortalCustomerIsolation(
        portal.page,
        customerId,
        [orderAId, orderBId],
        orderCId,
        60000n
      );
    } finally {
      await portal?.close();
      if (paymentId > 0) {
        const paymentBeforeCancel = await apiCallRaw<Row>(page, 'GET', `/ar/payments/${paymentId}`);
        expect(paymentBeforeCancel.status, '清理前收款单必须仍为 pending').toBe('pending');
        await apiCall(page, 'POST', `/ar/payments/${paymentId}/cancel`);
        const cancelledPayment = await apiCallRaw<Row>(page, 'GET', `/ar/payments/${paymentId}`);
        expect(cancelledPayment.status, '收款单取消后必须回读 cancelled').toBe('cancelled');
        if (orderAId > 0 && orderANo) {
          const invoiceA = await findArByOrderNo(page, customerId, orderANo);
          expect(invoiceA.length, '取消收款后订单 A 原应收必须仍可回读').toBe(1);
          expect(toCents(invoiceA[0].received_amount, '取消收款后已收金额')).toBe(0n);
          expect(toCents(invoiceA[0].unpaid_amount, '取消收款后未收金额')).toBe(100000n);
        }
      }
      await cleanupOrder(page, orderCId, otherCustomerId, orderCNo);
      await cleanupOrder(page, orderBId, customerId, orderBNo);
      await cleanupOrder(page, orderAId, customerId, orderANo);
      await apiCall(page, 'DELETE', `/users/${userId}`);
      const deletedUser = await apiCallRaw<Row>(page, 'GET', `/users/${userId}`);
      expect(deletedUser.is_active, '账号软删除后必须回读 is_active=false').toBe(false);
      await apiCall(page, 'DELETE', `/crm/customers/${customerId}`);
      const deletedCustomer = await apiCallRaw<Row>(page, 'GET', `/crm/customers/${customerId}`);
      expect(deletedCustomer.status, '本户客户软删除后必须回读 inactive').toBe('inactive');
      if (otherCustomerId > 0) {
        await apiCall(page, 'DELETE', `/crm/customers/${otherCustomerId}`);
        const deletedOtherCustomer = await apiCallRaw<Row>(
          page,
          'GET',
          `/crm/customers/${otherCustomerId}`
        );
        expect(deletedOtherCustomer.status, '他户客户软删除后必须回读 inactive').toBe('inactive');
      }
    }
  });
});
