/**
 * 功能：锁定「销售订单全额发货同事务生成自动应收，三额严格守恒」的对账链。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属客户、四维染色布库存与真实染色匹，建销售订单后 submit+approve，全额发货；
 *   不复用共享夹具的 AR/订单行。
 * - 入参：客户 payment_terms=30、credit_limit=10000，产品取 worker 专属报价产品，四维库存与匹由
 *   seedDyedOutboundBundle 真链产出；订单 40×25=1000，发货只按订单行数量 40 一次发满（不走容差超发）。
 * - 传给谁：POST /crm/customers、POST /sales/orders、POST /sales/orders/{id}/submit、
 *   POST /sales/orders/{id}/approve、POST /sales/orders/{id}/ship、GET /sales/orders/{id}、
 *   GET /sales/orders/{id}/deliveries、GET /ar/invoices。
 * - 存什么：断言落在订单 total_amount、发货单 total_amount 合计与自动应收 invoice_amount 三额等值，
 *   unpaid_amount=invoice_amount、received_amount=0、同 source_bill_no 仅一张应收。
 * - 存哪里：customers/sales_orders/sales_deliveries/ar_invoices；收尾逆序尽力清理订单与客户。
 *
 * 源码判据：services/so/delivery_ops/ship.rs 全额发货同事务调 create_receivable；
 *   services/ar/inv.rs 应收 source_type=SALES_ORDER、source_module=SO、source_bill_no=订单号、
 *   invoice_amount=ctx.order.total_amount、received_amount=0、unpaid_amount=invoice_amount；
 *   inv.rs 同订单幂等门；handlers/ar_invoice_handler.rs 列表无 source_bill_no 过滤，
 *   故按 customer_id 分页扫描 items 精确锚定。发货信封键为 {list,total}
 *   （handlers/sales_order_handler.rs）。
 */
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genName,
  getCtx,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  tryCleanup,
} from './helpers';

interface CustomerRow {
  id?: number;
}

interface OrderRow {
  id?: number;
  order_no?: string;
  total_amount?: number | string;
}

interface DeliveryRow {
  total_amount?: number | string;
}

interface ArRow {
  id?: number;
  source_bill_no?: string | null;
  invoice_amount?: number | string;
  received_amount?: number | string;
  unpaid_amount?: number | string;
}

/** Decimal 出参为字符串，按最小两位小数放大成整数比较，禁浮点误差。 */
function toScaled(v: unknown, label: string): bigint {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(raw);
  if (!m) throw new Error(`${label}：Decimal 出参必须为至多三位小数，实际 ${JSON.stringify(v)}`);
  const [, sign, int, frac = ''] = m;
  return BigInt((sign === '-' ? '-' : '') + int + frac.padEnd(3, '0'));
}

/** 分页扫描本客户 AR 列表并按 source_bill_no 精确锚定；列表无该过滤，page_size≤100。 */
async function findArByOrderNo(page: Page, customerId: number, orderNo: string): Promise<ArRow[]> {
  const hits: ArRow[] = [];
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const res = await apiCallRaw<{ items?: ArRow[]; total?: number }>(
      page,
      'GET',
      `/ar/invoices?customer_id=${customerId}&page=${pageNo}&page_size=100`
    );
    if (!Array.isArray(res.items)) {
      throw new Error(`[647] /ar/invoices 未返回 items 数组：第 ${pageNo} 页`);
    }
    hits.push(...res.items.filter(row => String(row.source_bill_no ?? '') === orderNo));
    const total = Number(res.total ?? 0);
    if (pageNo * 100 >= total) break;
  }
  return hits;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

test.describe.serial('647 订单→全额发货→自动应收三额差额归零', () => {
  test('647-1 订单总额==发货合计==自动应收金额，且同订单仅一张 AR', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.quotationProductId) {
      throw new Error('[647] 前置缺失：ctx.quotationProductId 未就绪');
    }

    const customerName = genName('647自动应收客户');
    const customer = await apiCallRaw<CustomerRow>(page, 'POST', '/crm/customers', {
      customer_name: customerName,
      contact_person: '647对账员',
      contact_phone: '{{PHONE_x7qh4sbk}}',
      credit_limit: '10000',
      payment_terms: 30,
      status: 'active',
    });
    const customerId = Number(customer?.id);
    expect(customerId, '[647-1] 自建客户必须返回正整数主键').toBeGreaterThan(0);
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: '[647-1] 自建客户' });

    const target = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId: ctx.quotationProductId,
      warehouseId: target.id,
      quantityMeters: '40',
      pieceCount: 1,
      context: 'E647',
    });
    if (bundle.pieces.length !== 1) {
      throw new Error(
        `[647] 前置失败：真实链未产出 1 匹可出库染色匹（实际 ${bundle.pieces.length}）`
      );
    }

    const created = await apiCallRaw<OrderRow>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          product_id: ctx.quotationProductId,
          quantity: '40',
          unit_price: '25.00',
          tax_percent: '0',
          quantity_tolerance_pct: '0',
        },
      ],
      notes: `E2E-647-${customerName}`,
    });
    const orderId = Number(created?.id);
    expect(orderId, '[647-1] 销售订单必须返回正整数主键').toBeGreaterThan(0);
    expect(
      Number.isFinite(Number(created?.order_no)) || String(created?.order_no ?? '').length > 0,
      '[647-1] 建单响应必须携带 order_no'
    ).toBe(true);
    const orderNo = String(created?.order_no ?? '');
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: '[647-1] 销售订单' });

    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);

    await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
      order_id: orderId,
      warehouse_code: target.code,
      items: [
        {
          product_id: ctx.quotationProductId,
          quantity: '40',
          batch_no: bundle.dyeLotNo,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          piece_no: bundle.pieces[0].piece_no,
        },
      ],
    });

    const order = await apiCallRaw<OrderRow>(page, 'GET', `/sales/orders/${orderId}`);
    expect(order.order_no, '[647-1] 订单号必须为建单回读值').toBe(orderNo);
    const orderAmount = toScaled(order.total_amount, '[647-1] 订单 total_amount');

    const deliveries = await apiCallRaw<{ list?: DeliveryRow[]; total?: number }>(
      page,
      'GET',
      `/sales/orders/${orderId}/deliveries`
    );
    expect(Array.isArray(deliveries.list), '[647-1] 发货回读必须为 {list,total} 信封').toBe(true);
    expect(deliveries.total, '[647-1] 全额一次发货应恰有 1 张发货单').toBe(1);
    const deliverySum = (deliveries.list ?? []).reduce(
      (acc, row) => acc + toScaled(row.total_amount, '[647-1] 发货单 total_amount'),
      0n
    );

    const arRows = await findArByOrderNo(page, customerId, orderNo);
    expect(arRows.length, '[647-1] 同 source_bill_no 必须恰有 1 张自动应收').toBe(1);
    const ar = arRows[0];
    const arAmount = toScaled(ar.invoice_amount, '[647-1] AR invoice_amount');
    expect(arAmount - orderAmount, '[647-1] AR金额-订单总额差额必须为 0 分').toBe(0n);
    expect(deliverySum - orderAmount, '[647-1] 发货合计-订单总额差额必须为 0 分').toBe(0n);
    expect(
      toScaled(ar.received_amount, '[647-1] AR received_amount'),
      '[647-1] 自动应收初始收款必须为 0'
    ).toBe(0n);
    expect(
      arAmount - toScaled(ar.unpaid_amount, '[647-1] AR unpaid_amount'),
      '[647-1] invoice_amount-unpaid_amount 差额必须为 0 分'
    ).toBe(0n);
  });
});
