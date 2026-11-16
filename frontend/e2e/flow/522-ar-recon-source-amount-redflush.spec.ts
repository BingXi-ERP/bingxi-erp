import { test, expect } from '../diagnose-fixture';
import { loginViaUI, apiCall, apiCallRaw, getCtx, ensureTestEntities, tryCleanup } from './helpers';

/**
 * 522 应收对账三项账务口径：发票聚合唯一性、金额守恒、红字对冲
 *
 * 守的是什么：对账生成服务（ar/vfy_ops/reconciliation）按客户+日期范围聚合
 * 「非取消发票 + 已确认收款」落 ar_reconciliation_item 明细行，并汇总
 * total_invoices/total_collections/closing_balance。三条用例分别钉住三个口径，
 * 全部判据来自服务层与模型源码实核：
 *
 * 一、发票聚合唯一性
 *   - POST /ar-reconciliations-enhanced/generate（ar_reconciliation_handler，
 *     与 base 面同源服务 ArReconciliationService::generate_reconciliation）
 *     按 customer_id + start_date/end_date 聚合 ar_invoice 中 status != CANCELLED
 *     的行，逐行 INSERT ar_reconciliation_item（item_type=INVOICE、
 *     document_type=SALES_INVOICE、document_id=发票主键、amount=invoice_amount）。
 *   - GET /ar-reconciliations-enhanced/{id}/details 回读 ReconciliationWithDetails
 *     （reconciliation + details[]），断言 details 中存在 INVOICE 行且
 *     document_id 恰为所建发票 id、amount 逐字等于发票 invoice_amount。
 *
 * 二、金额守恒
 *   - 同一客户建发票（金额 A）+ 收款（金额 B）并确认（status=confirmed），
 *     生成对账后断言 total_invoices=A、total_collections=B、
 *     closing_balance=opening_balance + A - B。
 *   - opening_balance 取该客户 start_date 之前所有非取消发票的 unpaid_amount 之和；
 *     新建客户无历史发票，opening_balance=0，故 closing_balance=A-B。
 *   - 收款须先经 POST /ar/payments/{id}/confirm 置 confirmed 才会被聚合
 *     （fetch_collections_for_reconciliation 仅取 status=COLLECTION_CONFIRMED）。
 *
 * 三、红字对冲
 *   - 销售退货审批（POST /sales/sales-returns/{id}/approve）在事务内调用
 *     create_credit_memo 生成红字应收单：source_type=SALES_RETURN、
 *     source_bill_id=退货单主键、invoice_amount=-退货单 total_amount（负金额）。
 *   - 红字应收单 status=DRAFT（非 CANCELLED），落入对账聚合范围；
 *     对账明细中必有一行 INVOICE，其 amount 为负且等于红字发票 invoice_amount。
 *
 * 金额列为 DECIMAL 线格式（出参字符串），断言用 Number() 归一后做数值比较，
 * 不做字符串逐字再造。三条用例各自新建独立客户隔离账务数据，避免跨用例串账；
 * 用例尾部 best-effort 清理自建客户，对账单与红字发票无删除端点，留存不判红。
 */

/** 对账单行（generate 回读，DECIMAL 列出参为字符串） */
type ReconciliationRow = {
  id: number;
  reconciliation_no: string;
  customer_id: number;
  period_start: string;
  period_end: string;
  reconciliation_status: string | null;
  opening_balance: string | number;
  total_invoices: string | number;
  total_collections: string | number;
  closing_balance: string | number;
};

/** 对账明细行（ReconciliationDetail，amount 为 DECIMAL 字符串） */
type ReconciliationDetail = {
  id: number;
  reconciliation_id: number;
  item_type: string;
  document_type: string | null;
  document_id: number | null;
  document_no: string | null;
  amount: string | number;
  match_status: string;
};

type DetailsBody = {
  reconciliation: ReconciliationRow;
  details: ReconciliationDetail[];
};

/** 应收发票（ar_invoice::Model 序列化，invoice_amount 为 DECIMAL 字符串） */
type ArInvoiceRow = {
  id: number;
  invoice_no: string;
  invoice_date: string;
  customer_id: number;
  invoice_amount: string | number;
  source_type: string | null;
  source_bill_id: number | null;
  source_bill_no: string | null;
  status: string;
};

/** 应收收款（collection_to_json，amount/collection_amount 为 DECIMAL 字符串） */
type ArPaymentRow = {
  id: number;
  payment_no: string;
  collection_no: string;
  customer_id: number;
  amount: string | number;
  collection_amount: string | number;
  status: string;
};

/** 退货单读模型（SalesReturnView，total_amount 为 DECIMAL） */
type SalesReturnRow = {
  id: number;
  return_no: string;
  customer_id: number;
  status: string;
  total_amount: string | number;
};

const PERIOD_START = '2026-01-01';
const PERIOD_END = '2026-12-31';
// 凭证日期取当天：AR 发票与收款过账都要求落在开放会计期间内，
// 硬编码历史日期会撞「日期不在任何已设置的会计期间内」的门（init_first_period 只开当月）。
const TODAY = new Date().toISOString().slice(0, 10);
const INVOICE_DATE = TODAY;
const PAYMENT_DATE = TODAY;

/** DECIMAL 出参归一为数值做比较（金额精度 ≤2 位，Number 安全） */
function dec(v: string | number): number {
  return Number(String(v));
}

function uniqTag(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

test.describe.serial('522 应收对账三项账务口径（聚合唯一性/金额守恒/红字对冲）', () => {
  const tag = uniqTag();
  const createdCustomerIds: number[] = [];

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    // 开放当月会计期间（幂等）：AR 发票与收款过账都要过 check_date_locked，
    // 本组凭证日期取当天，必须先确保对应期间存在。前置失败按真实缺陷判红，不吞错。
    await apiCall(page, 'POST', '/finance/accounting-periods/init', {});
  });

  test('一、发票聚合唯一性：对账明细 INVOICE 行 document_id 与 amount 逐源对齐', async ({
    page,
  }) => {
    // 自建客户隔离本用例账务（无历史发票 ⇒ opening_balance=0）
    const customer = await apiCallRaw<{ id: number }>(page, 'POST', '/crm/customers', {
      customer_name: `e2c-recon-uniq-${tag}`,
      status: 'active',
    });
    expect(customer.id).toBeGreaterThan(0);
    createdCustomerIds.push(customer.id);

    // 建应收发票：金额 100，开票日期落在对账期间内
    const invoiceAmount = '100';
    const invoice = await apiCallRaw<ArInvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      invoice_date: INVOICE_DATE,
      invoice_amount: invoiceAmount,
      source_type: 'MANUAL',
    });
    expect(invoice.id).toBeGreaterThan(0);
    expect(invoice.status).toBe('DRAFT');
    expect(dec(invoice.invoice_amount)).toBe(100);

    // 生成对账单（enhanced 面与 base 面同源服务）
    const rec = await apiCallRaw<ReconciliationRow>(
      page,
      'POST',
      '/ar-reconciliations-enhanced/generate',
      {
        customer_id: customer.id,
        start_date: PERIOD_START,
        end_date: PERIOD_END,
      }
    );
    expect(rec.id).toBeGreaterThan(0);
    expect(rec.reconciliation_status).toBe('draft');

    // 回读明细：必存在 INVOICE 行指向所建发票，amount 逐源对齐
    const details = await apiCallRaw<DetailsBody>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/${rec.id}/details`
    );
    expect(details.reconciliation.id).toBe(rec.id);
    const invoiceItems = details.details.filter(d => d.item_type === 'INVOICE');
    expect(invoiceItems.length).toBeGreaterThanOrEqual(1);
    const mine = invoiceItems.find(d => d.document_id === invoice.id);
    expect(mine, `对账明细应含 document_id=${invoice.id} 的 INVOICE 行`).toBeTruthy();
    expect(mine!.document_type).toBe('SALES_INVOICE');
    expect(dec(mine!.amount)).toBe(100);
  });

  test('二、金额守恒：total_invoices=A、total_collections=B、closing=opening+A-B', async ({
    page,
  }) => {
    const customer = await apiCallRaw<{ id: number }>(page, 'POST', '/crm/customers', {
      customer_name: `e2c-recon-balance-${tag}`,
      status: 'active',
    });
    expect(customer.id).toBeGreaterThan(0);
    createdCustomerIds.push(customer.id);

    const amountA = 150;
    const amountB = 80;

    // 发票金额 A，开票日期落在期间内
    const invoice = await apiCallRaw<ArInvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customer.id,
      invoice_date: INVOICE_DATE,
      invoice_amount: String(amountA),
      source_type: 'MANUAL',
    });
    expect(invoice.id).toBeGreaterThan(0);
    expect(dec(invoice.invoice_amount)).toBe(amountA);

    // 收款金额 B，收款日期落在期间内；创建后须确认才进聚合
    const payment = await apiCallRaw<ArPaymentRow>(page, 'POST', '/ar/payments', {
      customer_id: customer.id,
      amount: String(amountB),
      payment_method: '银行转账',
      payment_date: PAYMENT_DATE,
    });
    expect(payment.id).toBeGreaterThan(0);
    expect(dec(payment.amount)).toBe(amountB);

    const confirmed = await apiCallRaw<ArPaymentRow>(
      page,
      'POST',
      `/ar/payments/${payment.id}/confirm`
    );
    expect(confirmed.status).toBe('confirmed');

    const rec = await apiCallRaw<ReconciliationRow>(
      page,
      'POST',
      '/ar-reconciliations-enhanced/generate',
      {
        customer_id: customer.id,
        start_date: PERIOD_START,
        end_date: PERIOD_END,
      }
    );
    expect(rec.id).toBeGreaterThan(0);

    // 守恒判据：opening=0（新客户无期间前发票）、A 与 B 聚合、期末=期初+A-B
    expect(dec(rec.total_invoices)).toBe(amountA);
    expect(dec(rec.total_collections)).toBe(amountB);
    const opening = dec(rec.opening_balance);
    expect(opening).toBe(0);
    expect(dec(rec.closing_balance)).toBe(opening + amountA - amountB);
  });

  test('三、红字对冲：退货审批生成红字发票，对账明细含负金额 INVOICE 行', async ({ page }) => {
    // 本用例依赖仓库/产品等前置实体，ensureTestEntities 已建 ctx.customerId 与产品。
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(ctx.customerId, '[522] ensureTestEntities 应建客户').toBeGreaterThan(0);
    expect(ctx.warehouseIds[0], '[522] ensureTestEntities 应建仓库').toBeGreaterThan(0);
    expect(ctx.productIds[0], '[522] ensureTestEntities 应建产品').toBeGreaterThan(0);

    const productUnitPrice = 200;
    const productQuantity = '1';

    // 自建销售订单且明细唯一（仅 ctx.productIds[0] 一行）：退货明细回写追溯字段时，
    // 后端按销售订单+商品唯一定位订单明细取权威税率与追溯三列；复用夹具共享订单会
    // 因明细不唯一或商品不匹配而判 BUSINESS_ERROR。订单 submit+approve 即可，无需发货。
    const so = await apiCallRaw<{ id: number }>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      order_date: TODAY,
      items: [
        {
          product_id: ctx.productIds[0],
          quantity: productQuantity,
          unit_price: String(productUnitPrice),
        },
      ],
    });
    expect(so.id, '自建销售订单须返回主键').toBeGreaterThan(0);
    await apiCallRaw(page, 'POST', `/sales/orders/${so.id}/submit`);
    await apiCallRaw(page, 'POST', `/sales/orders/${so.id}/approve`);

    // 建退货单挂自建订单，退货明细引用同一商品；审批时按 total_amount 生成红字应收单
    const ret = await apiCallRaw<SalesReturnRow>(page, 'POST', '/sales/sales-returns', {
      customer_id: ctx.customerId,
      order_id: so.id,
      return_date: INVOICE_DATE,
      warehouse_id: ctx.warehouseIds[0],
      reason_type: '质量问题',
    });
    expect(ret.id).toBeGreaterThan(0);
    expect(ret.status).toBe('DRAFT');

    await apiCallRaw(page, 'POST', `/sales/sales-returns/${ret.id}/items`, {
      product_id: ctx.productIds[0],
      quantity: productQuantity,
      unit_price: String(productUnitPrice),
      tax_percent: '0',
      reason: '红字对冲验证退货',
    });

    const submitted = await apiCallRaw<SalesReturnRow>(
      page,
      'POST',
      `/sales/sales-returns/${ret.id}/submit`
    );
    expect(submitted.status).toBe('SUBMITTED');

    const approved = await apiCallRaw<SalesReturnRow>(
      page,
      'POST',
      `/sales/sales-returns/${ret.id}/approve`
    );
    expect(approved.status).toBe('APPROVED');

    // 读回退货单 total_amount 作为红字金额基准（C）
    const retDetail = await apiCallRaw<SalesReturnRow>(
      page,
      'GET',
      `/sales/sales-returns/${ret.id}`
    );
    const creditAmount = dec(retDetail.total_amount);
    expect(creditAmount).toBeGreaterThan(0);

    // 找到审批生成的红字应收单：source_type=SALES_RETURN + source_bill_id=退货单 id + 负金额
    const invoiceList = await apiCallRaw<{ items: ArInvoiceRow[] }>(
      page,
      'GET',
      `/ar/invoices?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const redInvoice = invoiceList.items.find(
      inv =>
        inv.source_type === 'SALES_RETURN' &&
        inv.source_bill_id === ret.id &&
        dec(inv.invoice_amount) < 0
    );
    expect(
      redInvoice,
      `应收发票列表应含 source_type=SALES_RETURN、source_bill_id=${ret.id} 的红字行`
    ).toBeTruthy();
    expect(dec(redInvoice!.invoice_amount)).toBe(-creditAmount);

    // 生成对账单：红字发票 status=DRAFT（非 CANCELLED）落入聚合
    const rec = await apiCallRaw<ReconciliationRow>(
      page,
      'POST',
      '/ar-reconciliations-enhanced/generate',
      {
        customer_id: ctx.customerId,
        start_date: PERIOD_START,
        end_date: PERIOD_END,
      }
    );
    expect(rec.id).toBeGreaterThan(0);

    const details = await apiCallRaw<DetailsBody>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/${rec.id}/details`
    );
    // 对账明细必有一行 INVOICE 指向红字发票，amount 为负且等于红字 invoice_amount
    const redItem = details.details.find(
      d => d.item_type === 'INVOICE' && d.document_id === redInvoice!.id
    );
    expect(
      redItem,
      `对账明细应含 document_id=${redInvoice!.id} 的 INVOICE 行（红字对冲）`
    ).toBeTruthy();
    expect(dec(redItem!.amount)).toBe(-creditAmount);
    expect(dec(redItem!.amount)).toBe(dec(redInvoice!.invoice_amount));
  });

  test('清理：best-effort 删除自建客户（对账单/红字发票无删除端点，留存不判红）', async ({
    page,
  }) => {
    for (const id of createdCustomerIds) {
      await tryCleanup(page, 'DELETE', `/crm/customers/${id}`, `522 客户 ${id}`);
    }
  });
});
