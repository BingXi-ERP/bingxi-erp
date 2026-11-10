// 目标文件：frontend/e2e/flow/468-ar-invoice-precheck-statement-confirmed.spec.ts
// 开票前置门（客户未确认对账单不得开票）与对账单确认态防伪造 E2E — 468
//
// 功能：把「该客户存在覆盖本次开票日期且尚未取得客户确认的对账单时，开票必须被显式拒绝」
// 这条前置门钉成真实契约，并把「确认态不可经旁路伪造」一并钉住。每条腿都真建客户、真建对账单、
// 真推到目标状态、真开票、真回读，拒绝一律钉成「HTTP 码 + 机器码 + 点名阻塞单号的文案 +
// 该客户应收单行数不变」四件，而不是只判一个状态码。
// 具体钉住的规则（判据全部来自写入方源码实核）：
// - 门只读 ar_reconciliations 的 reconciliation_status 与 confirmed_by_customer 两列，
//   取该客户期间覆盖本次开票日期的对账单（services/ar/vfy_ops/confirm.rs）。
// - 阻塞三态：sent（已发出待客户确认）、disputed（客户已提异议）、以及状态词已是 confirmed
//   但 confirmed_by_customer 非真。放行四态：draft（尚未送客户，未进入确认环节）、closed 与
//   cancelled（该期已终结，不再等客户回执）、以及无覆盖本期的对账单。
// - 期间覆盖是闭区间：period_start <= invoice_date <= period_end，两端点都算覆盖。
// - 门用的日期与落库的日期同源：手工开票腿取请求 invoice_date，缺省才取当日
//   （services/ar_invoice_service.rs），因此本文件绝大多数用例显式传 invoice_date 以消除时区漂移，
//   另有一条专门覆盖「缺省日期同样过门」。
// - 拒绝走 business_displayable，出参 message 携带真实文案并点名阻塞的对账单号
//   （utils/error.rs 对 Displayable 变体返回真实文案，机器码 BUSINESS_ERROR，HTTP 400）。
// - 拒绝时取号与插入都不执行，事务随拒绝回滚，故该客户应收单 total 前后必须逐值相等。
// - 通用改状态腿先过取值白名单再过迁移白名单，落 confirmed 时同批写确认三列
//   （services/ar/recon_ops/lifecycle.rs），因此不存在「状态词已 confirmed 而确认标记为空」的旁路；
//   closed 与 cancelled 是终态无出边，自跃迁按非法拒。
// - 客户确认别名腿 POST /ar-reconciliations-enhanced/confirmations 与 /{id}/confirm 同口径，
//   先按主键取行再过父客户归属门，行不存在即 404 且不触达 service
//   （handlers/ar_reconciliation_handler.rs）。
//
// 调用方：被测端点注册于 backend/src/routes/finance.rs 的 ar_invoice_routes 与 ar_reconciliations、
// ar_reconciliations_enhanced 三个挂载；handler 为 ar_invoice_handler 的 create_ar_invoice 与
// list_ar_invoices，以及 ar_reconciliation_handler 的 create_reconciliation / get_reconciliation /
// send_reconciliation / confirm_reconciliation / dispute_reconciliation / close_reconciliation /
// update_reconciliation_status / create_confirmation。载体腿（建客户）走 crm/customers 的 POST 与 DELETE。
// 入参：建对账单取 reconciliation_no（必填字符串，原样落库）、customer_id（必填 i32）、
// period_start / period_end（必填纯日期 YYYY-MM-DD）、opening_balance / total_invoices /
// total_collections（必填 Decimal）；改状态取 status（必填字符串，本域词表全小写）；
// 争议取 reason（必填字符串）；确认与发送与关闭三腿允许缺体；别名腿取 reconciliation_id（必填 i32）；
// 开票取 customer_id 与 invoice_amount（均必填，金额必须大于零且最多两位小数）、invoice_date（可空纯日期）。
// 金额一律取二进制可精确表示的数（.5/.25 族），避免用浮点等值掩盖真实分差。
// 传给谁：service 层 ArInvoiceService 与 ArReconciliationService（recon_ops 与 vfy_ops）→ SeaORM 事务；
// 门的连接按泛型收 ConnectionTrait，与调用方事务同源，不在门内另开事务也不做后置过滤。
// 存什么：ar_reconciliations 落单据号、客户、期间、三笔金额、重算的期末余额、状态词与确认三列；
// ar_invoices 落取号生成的 invoice_no、invoice_date、due_date、customer_id、invoice_amount 与状态。
// 出参键名以各自序列化点为准：对账单读单行与列表腿是 ReconciliationResponse（不含确认三列），
// 确认腿与争议腿直接序列化整行 Model（含 confirmed_by_customer / confirmed_by / confirmed_at），
// 应收单腿序列化 ar_invoice 的 Model；金额列为 DECIMAL 线格式即字符串。本文件按各自真实出参面断言，
// 不跨面借键。
// 存哪里：表 ar_reconciliations 与 ar_invoices；列表信封 PaginatedResponse{items,total,page,page_size}
// （utils/response.rs）；失败信封 {code,message,trace_id,timestamp} 四键且 code 为字符串机器码。
// 对账状态词表逐字符引用写入方常量（models/status/finance.rs 的 ar 组）：
// draft / sent / confirmed / disputed / closed / cancelled，大小写与拼写不得改写。
// 隔离与清理：每个用例自建专属客户，故阻塞态对账单只影响本用例自己的开票腿，不污染同分片其它用例；
// 删除门只放草稿，非草稿对账单删不掉属预期，清理腿登记原文不判负，真判据写在用例正文里。

import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  loginViaUI,
  tryCleanup,
} from './helpers';

/** 对账单读单行与列表腿的出参形状（handlers/ar_reconciliation_handler.rs ReconciliationResponse） */
type ReconRow = {
  id: number;
  reconciliation_no: string;
  customer_id: number;
  period_start: string;
  period_end: string;
  closing_balance: string;
  reconciliation_status: string | null;
  dispute_reason: string | null;
};

/** 确认腿与争议腿直接序列化整行 Model，多出确认三列（models/ar_reconciliation.rs） */
type ReconModelRow = ReconRow & {
  confirmed_by_customer: boolean | null;
  confirmed_by: number | null;
  confirmed_at: string | null;
};

/** 应收单出参形状（models/ar_invoice.rs Model，金额与日期按线格式） */
type InvoiceRow = {
  id: number;
  invoice_no: string;
  invoice_date: string;
  customer_id: number;
  invoice_amount: string;
  status: string;
};

type InvoicePage = {
  items: InvoiceRow[];
  total: number;
  page: number;
  page_size: number;
};

/** 显式开票日期：门与落库同源使用它，避免用例依赖执行机时区 */
const INVOICE_DATE = '2026-05-15';
const PERIOD_START = '2026-05-01';
const PERIOD_END = '2026-05-31';
/** 覆盖任意「当日」的宽期间，专用于缺省 invoice_date 那条腿 */
const WIDE_START = '2000-01-01';
const WIDE_END = '2099-12-31';
/** 库中不存在的对账单主键，用于证伪别名腿先取行再判定这一 404 前置 */
const GHOST_RECON_ID = 999999999;
const INVOICE_AMOUNT = 100.5;

function uniqTag(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** 建本用例专属客户：阻塞态对账单只挂在自己客户上，杜绝跨用例互相阻塞 */
async function seedCustomer(
  page: Parameters<typeof apiCallRaw>[0],
  suffix: string
): Promise<number> {
  const customer = await apiCallRaw<{ id: number }>(page, 'POST', '/crm/customers', {
    customer_name: `e2c-inv468-${suffix}`,
  });
  expect(customer.id, `自建客户未返回主键：${JSON.stringify(customer)}`).toBeGreaterThan(0);
  return customer.id;
}

/** 建覆盖指定期间的对账单，初始态由写入方落 draft，金额取二进制可精确表示的值 */
async function seedStatement(
  page: Parameters<typeof apiCallRaw>[0],
  customerId: number,
  suffix: string,
  periodStart: string,
  periodEnd: string
): Promise<ReconRow> {
  const created = await apiCallRaw<ReconRow>(page, 'POST', '/ar-reconciliations', {
    reconciliation_no: `AR468-${suffix}`,
    customer_id: customerId,
    period_start: periodStart,
    period_end: periodEnd,
    opening_balance: 100.5,
    total_invoices: 200.25,
    total_collections: 50.25,
  });
  expect(created.id, `自建对账单未返回主键：${JSON.stringify(created)}`).toBeGreaterThan(0);
  expect(created.reconciliation_no, `对账单号未原样落库：实际 ${created.reconciliation_no}`).toBe(
    `AR468-${suffix}`
  );
  expect(
    created.reconciliation_status,
    `建单初始态应为写入方落的 draft：实际 ${created.reconciliation_status}`
  ).toBe('draft');
  return created;
}

/** 只读该客户应收单总数：用于钉住「被拒时取号与插入都没执行」 */
async function invoiceTotal(
  page: Parameters<typeof apiCallRaw>[0],
  customerId: number
): Promise<number> {
  const res = await apiCallRaw<InvoicePage>(
    page,
    'GET',
    `/ar/invoices?customer_id=${customerId}&page=1&page_size=1`
  );
  expect(Array.isArray(res.items), `应收单列表缺 items 数组：${JSON.stringify(res)}`).toBe(true);
  expect(typeof res.total, `应收单列表 total 非数值：${JSON.stringify(res)}`).toBe('number');
  return res.total;
}

async function readStatement(
  page: Parameters<typeof apiCallRaw>[0],
  id: number
): Promise<ReconRow> {
  return apiCallRaw<ReconRow>(page, 'GET', `/ar-reconciliations/${id}`);
}

/** 开票被门拒的四件判据：HTTP 400、机器码 BUSINESS_ERROR、文案点名阻塞单号、文案不含内部详情 */
function expectBlockedByStatement(
  res: { status: number; message?: string | null; code?: string | number },
  reconNo: string,
  label: string
): void {
  expect(res.status, `${label} 开票应被前置门拒为 HTTP 400，实际 ${res.status}`).toBe(400);
  expect(failureCode(res), `${label} 机器码应为 BUSINESS_ERROR`).toBe(
    APP_ERROR_CODES.BUSINESS_ERROR
  );
  const message = String(res.message ?? '');
  expect(message, `${label} 拒因必须点名阻塞的对账单号 ${reconNo}，实际文案=${message}`).toContain(
    reconNo
  );
  expect(message, `${label} 拒因应告知先完成客户确认，实际文案=${message}`).toContain(
    '尚未取得客户确认'
  );
}

test.describe.serial('468 开票前置门与对账单确认态防伪造', () => {
  const tag = uniqTag();

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('468-01 无对账单的客户可直接开票，门不是无脑拒，发票按请求日期落库并可回读', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-01`);
    const before = await invoiceTotal(page, customerId);
    expect(before, `[468-01] 新建客户不应已有应收单，实际 total=${before}`).toBe(0);

    const invoice = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(invoice.id, `[468-01] 开票未返回主键：${JSON.stringify(invoice)}`).toBeGreaterThan(0);
    expect(
      invoice.invoice_no,
      `[468-01] 放行腿必须真取号，invoice_no 为空说明只判了码没落库`
    ).not.toBe('');
    expect(invoice.customer_id, `[468-01] 发票客户归属漂移`).toBe(customerId);
    expect(
      String(invoice.invoice_date),
      `[468-01] 落库开票日期必须与门判用的请求日期同源，实际 ${String(invoice.invoice_date)}`
    ).toBe(INVOICE_DATE);
    expect(
      Number(invoice.invoice_amount),
      `[468-01] 发票金额应与入参逐值相等，实际 ${invoice.invoice_amount}`
    ).toBe(INVOICE_AMOUNT);

    const after = await invoiceTotal(page, customerId);
    expect(after, `[468-01] 放行后该客户应收单应恰好加一，前=${before} 后=${after}`).toBe(
      before + 1
    );
    const readback = await apiCallRaw<InvoiceRow>(page, 'GET', `/ar/invoices/${invoice.id}`);
    expect(readback.invoice_no, `[468-01] 按主键回读单号漂移`).toBe(invoice.invoice_no);

    await tryCleanup(page, 'DELETE', `/ar/invoices/${invoice.id}`, 'invoice_468_01');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_01');
  });

  test('468-02 草稿态对账单不阻塞开票：尚未送客户，未进入客户确认环节', async ({ page }) => {
    const customerId = await seedCustomer(page, `${tag}-02`);
    const rec = await seedStatement(page, customerId, `${tag}-02`, PERIOD_START, PERIOD_END);
    const before = await invoiceTotal(page, customerId);

    const invoice = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      invoice.id,
      `[468-02] draft 不构成阻塞，开票应放行，实际响应=${JSON.stringify(invoice)}`
    ).toBeGreaterThan(0);
    const after = await invoiceTotal(page, customerId);
    expect(after, `[468-02] 放行后应收单应加一，前=${before} 后=${after}`).toBe(before + 1);
    const still = await readStatement(page, rec.id);
    expect(
      still.reconciliation_status,
      `[468-02] 开票不得反向改写对账单状态，实际 ${still.reconciliation_status}`
    ).toBe('draft');

    await tryCleanup(page, 'DELETE', `/ar/invoices/${invoice.id}`, 'invoice_468_02');
    await tryCleanup(page, 'DELETE', `/ar-reconciliations/${rec.id}`, 'statement_draft_468_02');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_02');
  });

  test('468-03 已发出待确认的对账单阻塞开票：拒因点名单号且应收单行数不变', async ({ page }) => {
    const customerId = await seedCustomer(page, `${tag}-03`);
    const rec = await seedStatement(page, customerId, `${tag}-03`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);
    const sent = await readStatement(page, rec.id);
    expect(
      sent.reconciliation_status,
      `[468-03] 发送腿未把状态推到 sent，实际 ${sent.reconciliation_status}`
    ).toBe('sent');

    const before = await invoiceTotal(page, customerId);
    const reject = await apiCallExpectFail(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expectBlockedByStatement(reject, rec.reconciliation_no, '[468-03]');
    const after = await invoiceTotal(page, customerId);
    expect(
      after,
      `[468-03] 被拒时取号与插入都不得执行，应收单 total 前=${before} 后=${after}`
    ).toBe(before);

    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_03');
  });

  test('468-04 客户已提异议的对账单阻塞开票，争议原文落库且拒因仍点名同一张单', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-04`);
    const rec = await seedStatement(page, customerId, `${tag}-04`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);
    const reason = `e2e-468-异议-${tag}`;
    const disputed = await apiCallRaw<ReconModelRow>(
      page,
      'POST',
      `/ar-reconciliations/${rec.id}/dispute`,
      { reason }
    );
    expect(
      disputed.reconciliation_status,
      `[468-04] 争议腿未落 disputed，实际 ${disputed.reconciliation_status}`
    ).toBe('disputed');
    expect(disputed.dispute_reason, `[468-04] 争议原因未落原文`).toBe(reason);
    expect(
      disputed.confirmed_by_customer,
      `[468-04] 争议态不得带客户确认标记，实际 ${String(disputed.confirmed_by_customer)}`
    ).not.toBe(true);

    const before = await invoiceTotal(page, customerId);
    const reject = await apiCallExpectFail(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expectBlockedByStatement(reject, rec.reconciliation_no, '[468-04]');
    expect(
      await invoiceTotal(page, customerId),
      `[468-04] 争议态被拒后应收单行数不得变化，前=${before}`
    ).toBe(before);

    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_04');
  });

  test('468-05 客户确认腿写真确认标记后开票放行，标记从确认腿出参实读而非推测', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-05`);
    const rec = await seedStatement(page, customerId, `${tag}-05`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);
    const confirmed = await apiCallRaw<ReconModelRow>(
      page,
      'POST',
      `/ar-reconciliations/${rec.id}/confirm`
    );
    expect(
      confirmed.reconciliation_status,
      `[468-05] 确认腿未落 confirmed，实际 ${confirmed.reconciliation_status}`
    ).toBe('confirmed');
    expect(
      confirmed.confirmed_by_customer,
      `[468-05] 确认腿必须同批写 confirmed_by_customer=true，实际 ${String(confirmed.confirmed_by_customer)}`
    ).toBe(true);
    expect(
      confirmed.confirmed_at,
      `[468-05] 确认时间不得留空，实际 ${String(confirmed.confirmed_at)}`
    ).not.toBeNull();

    const before = await invoiceTotal(page, customerId);
    const invoice = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      invoice.id,
      `[468-05] 已取得客户确认必须放行开票，实际响应=${JSON.stringify(invoice)}`
    ).toBeGreaterThan(0);
    expect(await invoiceTotal(page, customerId), `[468-05] 放行后应收单应加一，前=${before}`).toBe(
      before + 1
    );

    await tryCleanup(page, 'DELETE', `/ar/invoices/${invoice.id}`, 'invoice_468_05');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_05');
  });

  test('468-06 通用改状态腿落 confirmed 后开票放行：该腿同批写确认标记，不留伪造旁路', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-06`);
    const rec = await seedStatement(page, customerId, `${tag}-06`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'PUT', `/ar-reconciliations/${rec.id}/status`, { status: 'confirmed' });
    const readback = await readStatement(page, rec.id);
    expect(
      readback.reconciliation_status,
      `[468-06] 通用改状态腿未落 confirmed，实际 ${readback.reconciliation_status}`
    ).toBe('confirmed');

    // 门读的唯一事实是 confirmed_by_customer，而读单行腿不出这一列；
    // 因此用「开票放行」这一行为后果证明该腿确实同批写了真标记：
    // 若只改状态词而留标记为空，门会按伪造确认态拒绝，本断言即判红。
    const invoice = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      invoice.id,
      `[468-06] 经通用腿到 confirmed 后开票应放行；被拒即说明该腿只改状态词没写确认标记，实际响应=${JSON.stringify(invoice)}`
    ).toBeGreaterThan(0);

    await tryCleanup(page, 'DELETE', `/ar/invoices/${invoice.id}`, 'invoice_468_06');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_06');
  });

  test('468-07 迁移白名单：非法边与自跃迁与终态出边一律拒，且拒绝后状态保持原值', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-07`);
    const recSent = await seedStatement(page, customerId, `${tag}-07S`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${recSent.id}/send`);

    const backToDraft = await apiCallExpectFail(
      page,
      'PUT',
      `/ar-reconciliations/${recSent.id}/status`,
      { status: 'draft' }
    );
    expect(backToDraft.status, `[468-07] sent 回 draft 不是合法边，应拒为 400`).toBe(400);
    expect(failureCode(backToDraft), `[468-07] 非法迁移机器码应为 BUSINESS_ERROR`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      String(backToDraft.message ?? ''),
      `[468-07] 拒因应点名前态 sent 与后态 draft，实际=${String(backToDraft.message ?? '')}`
    ).toContain('sent');
    expect(
      String(backToDraft.message ?? ''),
      `[468-07] 拒因应点名后态 draft，实际=${String(backToDraft.message ?? '')}`
    ).toContain('draft');
    expect(
      (await readStatement(page, recSent.id)).reconciliation_status,
      `[468-07] 非法迁移被拒后状态必须保持 sent`
    ).toBe('sent');

    const selfLoop = await apiCallExpectFail(
      page,
      'PUT',
      `/ar-reconciliations/${recSent.id}/status`,
      { status: 'sent' }
    );
    expect(selfLoop.status, `[468-07] 自跃迁不构成迁移，应拒为 400`).toBe(400);
    expect(
      (await readStatement(page, recSent.id)).reconciliation_status,
      `[468-07] 自跃迁被拒后状态仍为 sent`
    ).toBe('sent');

    // 终态行：confirmed 经关闭腿到 closed，另一行经通用腿到 cancelled
    const recClosed = await seedStatement(page, customerId, `${tag}-07C`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'PUT', `/ar-reconciliations/${recClosed.id}/status`, {
      status: 'confirmed',
    });
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${recClosed.id}/close`);
    expect(
      (await readStatement(page, recClosed.id)).reconciliation_status,
      `[468-07] 关闭腿未落 closed`
    ).toBe('closed');
    const closedOut = await apiCallExpectFail(
      page,
      'PUT',
      `/ar-reconciliations/${recClosed.id}/status`,
      { status: 'confirmed' }
    );
    expect(closedOut.status, `[468-07] closed 是终态无出边，应拒为 400`).toBe(400);
    expect(
      (await readStatement(page, recClosed.id)).reconciliation_status,
      `[468-07] 终态被拒后不得被改写成 confirmed`
    ).toBe('closed');

    const recCancelled = await seedStatement(
      page,
      customerId,
      `${tag}-07X`,
      PERIOD_START,
      PERIOD_END
    );
    await apiCallRaw(page, 'PUT', `/ar-reconciliations/${recCancelled.id}/status`, {
      status: 'cancelled',
    });
    const cancelledOut = await apiCallExpectFail(
      page,
      'PUT',
      `/ar-reconciliations/${recCancelled.id}/status`,
      { status: 'sent' }
    );
    expect(cancelledOut.status, `[468-07] cancelled 是终态无出边，应拒为 400`).toBe(400);
    expect(
      (await readStatement(page, recCancelled.id)).reconciliation_status,
      `[468-07] 终态被拒后不得被改写成 sent`
    ).toBe('cancelled');

    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_07');
  });

  test('468-08 期间覆盖是闭区间：止于开票日前一天与始于开票日后一天都不阻塞，两端点重合则阻塞', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-08`);

    const endedBefore = await seedStatement(
      page,
      customerId,
      `${tag}-08E`,
      '2026-05-01',
      '2026-05-14'
    );
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${endedBefore.id}/send`);
    const passEnded = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      passEnded.id,
      `[468-08] 期间止于开票日前一天不覆盖本期，应放行，实际响应=${JSON.stringify(passEnded)}`
    ).toBeGreaterThan(0);
    await tryCleanup(page, 'DELETE', `/ar/invoices/${passEnded.id}`, 'invoice_468_08E');

    const startsAfter = await seedStatement(
      page,
      customerId,
      `${tag}-08S`,
      '2026-05-16',
      '2026-05-31'
    );
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${startsAfter.id}/send`);
    const passStarts = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      passStarts.id,
      `[468-08] 期间始于开票日后一天不覆盖本期，应放行，实际响应=${JSON.stringify(passStarts)}`
    ).toBeGreaterThan(0);
    await tryCleanup(page, 'DELETE', `/ar/invoices/${passStarts.id}`, 'invoice_468_08S');

    // 两端点都与开票日期重合：闭区间两端都算覆盖，必须阻塞
    const exact = await seedStatement(page, customerId, `${tag}-08X`, INVOICE_DATE, INVOICE_DATE);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${exact.id}/send`);
    const reject = await apiCallExpectFail(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expectBlockedByStatement(reject, exact.reconciliation_no, '[468-08]');

    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_08');
  });

  test('468-09 已关闭与已取消的对账单不阻塞开票：该期已终结，不再等客户回执', async ({ page }) => {
    const customerId = await seedCustomer(page, `${tag}-09`);

    const recClosed = await seedStatement(page, customerId, `${tag}-09C`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'PUT', `/ar-reconciliations/${recClosed.id}/status`, {
      status: 'confirmed',
    });
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${recClosed.id}/close`);
    expect(
      (await readStatement(page, recClosed.id)).reconciliation_status,
      `[468-09] 前置未推到 closed`
    ).toBe('closed');
    const passClosed = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      passClosed.id,
      `[468-09] closed 不阻塞开票，实际响应=${JSON.stringify(passClosed)}`
    ).toBeGreaterThan(0);
    await tryCleanup(page, 'DELETE', `/ar/invoices/${passClosed.id}`, 'invoice_468_09C');

    const recCancelled = await seedStatement(
      page,
      customerId,
      `${tag}-09X`,
      PERIOD_START,
      PERIOD_END
    );
    await apiCallRaw(page, 'PUT', `/ar-reconciliations/${recCancelled.id}/status`, {
      status: 'cancelled',
    });
    expect(
      (await readStatement(page, recCancelled.id)).reconciliation_status,
      `[468-09] 前置未推到 cancelled`
    ).toBe('cancelled');
    const passCancelled = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      passCancelled.id,
      `[468-09] cancelled 不阻塞开票，实际响应=${JSON.stringify(passCancelled)}`
    ).toBeGreaterThan(0);

    await tryCleanup(page, 'DELETE', `/ar/invoices/${passCancelled.id}`, 'invoice_468_09X');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_09');
  });

  test('468-10 缺省开票日期同样过门：宽期间待确认单拦住按当日开票的腿', async ({ page }) => {
    const customerId = await seedCustomer(page, `${tag}-10`);
    const rec = await seedStatement(page, customerId, `${tag}-10`, WIDE_START, WIDE_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);

    const before = await invoiceTotal(page, customerId);
    const reject = await apiCallExpectFail(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
    });
    expectBlockedByStatement(reject, rec.reconciliation_no, '[468-10]');
    expect(
      await invoiceTotal(page, customerId),
      `[468-10] 缺省日期被拒后应收单行数不得变化，前=${before}`
    ).toBe(before);

    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_10');
  });

  test('468-11 客户确认别名腿先取行再判定：不存在的单 404 且不触达确认，自己的单确认后开票放行', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-11`);
    const rec = await seedStatement(page, customerId, `${tag}-11`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);

    const ghost = await apiCallExpectFail(
      page,
      'POST',
      '/ar-reconciliations-enhanced/confirmations',
      {
        reconciliation_id: GHOST_RECON_ID,
      }
    );
    expect(ghost.status, `[468-11] 别名腿对不存在的单应先取行判 404，实际 ${ghost.status}`).toBe(
      404
    );
    expect(failureCode(ghost), `[468-11] 机器码应为 NOT_FOUND`).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      (await readStatement(page, rec.id)).reconciliation_status,
      `[468-11] 别名腿的 404 前置不得顺带改写本用例自己的单`
    ).toBe('sent');
    const stillBlocked = await apiCallExpectFail(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expectBlockedByStatement(stillBlocked, rec.reconciliation_no, '[468-11] 别名腿 404 之后');

    const confirmed = await apiCallRaw<ReconModelRow>(
      page,
      'POST',
      '/ar-reconciliations-enhanced/confirmations',
      { reconciliation_id: rec.id }
    );
    expect(
      confirmed.reconciliation_status,
      `[468-11] 别名腿未落 confirmed，实际 ${confirmed.reconciliation_status}`
    ).toBe('confirmed');
    expect(
      confirmed.confirmed_by_customer,
      `[468-11] 别名腿必须与确认腿同口径写真标记，实际 ${String(confirmed.confirmed_by_customer)}`
    ).toBe(true);
    const invoice = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    });
    expect(
      invoice.id,
      `[468-11] 别名腿确认后开票应放行，实际响应=${JSON.stringify(invoice)}`
    ).toBeGreaterThan(0);

    await tryCleanup(page, 'DELETE', `/ar/invoices/${invoice.id}`, 'invoice_468_11');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_11');
  });

  test('468-12 门是活判定不是缓存：同一客户先被拒，完成客户确认后同一请求即放行', async ({
    page,
  }) => {
    const customerId = await seedCustomer(page, `${tag}-12`);
    const rec = await seedStatement(page, customerId, `${tag}-12`, PERIOD_START, PERIOD_END);
    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/send`);

    const body = {
      customer_id: customerId,
      invoice_amount: INVOICE_AMOUNT,
      invoice_date: INVOICE_DATE,
    };
    const before = await invoiceTotal(page, customerId);
    const first = await apiCallExpectFail(page, 'POST', '/ar/invoices', body);
    expectBlockedByStatement(first, rec.reconciliation_no, '[468-12] 确认前');
    const retry = await apiCallExpectFail(page, 'POST', '/ar/invoices', body);
    expectBlockedByStatement(retry, rec.reconciliation_no, '[468-12] 重复尝试');
    expect(
      await invoiceTotal(page, customerId),
      `[468-12] 两次被拒都不得留下应收单，前=${before}`
    ).toBe(before);

    await apiCallRaw(page, 'POST', `/ar-reconciliations/${rec.id}/confirm`);
    const passed = await apiCallRaw<InvoiceRow>(page, 'POST', '/ar/invoices', body);
    expect(
      passed.id,
      `[468-12] 完成客户确认后同一请求必须放行，实际响应=${JSON.stringify(passed)}`
    ).toBeGreaterThan(0);
    expect(
      await invoiceTotal(page, customerId),
      `[468-12] 放行后应收单应恰好加一，前=${before}`
    ).toBe(before + 1);

    await tryCleanup(page, 'DELETE', `/ar/invoices/${passed.id}`, 'invoice_468_12');
    await tryCleanup(page, 'DELETE', `/crm/customers/${customerId}`, 'carrier_customer_468_12');
  });
});
