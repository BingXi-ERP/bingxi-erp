// 442 应收对账 → 客户确认 → 收款/开票 → 红冲作废 的正反两链与联动回滚
//
// 本文件守的缺陷族：
// 1. 对账单只写单头不写明细、明细合计与单头合计有分差、期末余额不随发票/收款汇总；
// 2. 状态机门形同虚设（草稿可直接关闭、重复确认二次覆盖 confirmed_by/confirmed_at、
//    白名单外状态值能落 reconciliation_status）；
// 3. 红冲（作废）只改单据自身状态，不回收资金账本——核销取消后发票已收/未收不回滚、
//    红冲后的发票仍被新生成的对账单汇总进去（vfy_ops/reconciliation 的 status != CANCELLED
//    过滤一旦丢失，虚增应收就永久留在台账里）；
// 4. 越权放行与脱敏缺失：业务员岗持不到 ar-invoices 红冲键却被放行、财务对账出参泄漏
//    成本/进价类键；
// 5. 含税口径被乘法再造（本仓红线：含税是录入事实，净额=含税÷(1+税率)、税额取差额），
//    以及多币种下汇率与换算不同源；
// 6. 同一行在 base 面与 enhanced 面、列表与详情、两个独立会话之间读数漂移。
//
// 判据全部来自源码实核（backend/src/services/ar/**、handlers/ar_*.rs、utils/tax.rs）：
// - 状态词表逐字符照写入方 models/status/finance.rs 的 ar 分组：
//   ar_reconciliation.reconciliation_status 小写 draft/sent/confirmed/disputed/closed/cancelled；
//   ar_collection.status 小写 pending/confirmed/cancelled；
//   ar_reconciliation_item.match_status 大写 MATCHED/UNMATCHED/PARTIAL/DISPUTED/CANCELLED；
//   ar_invoice.status 大写 DRAFT/APPROVED/PARTIAL_PAID/PAID/CANCELLED（models/status/general.rs）。
// - 期末余额权威判据 compute_closing_balance = opening + total_invoices − total_collections。
// - 对账明细记法：INVOICE 行 amount 取发票 invoice_amount（正），RECEIPT 行 amount
//   取 −collection_amount（负）、document_type='COLLECTION'、match_status='UNMATCHED'
//   （vfy_ops/reconciliation.rs::insert_collection_items）。
// - 汇总口径：发票 status != 'CANCELLED' 且 invoice_date 落期间内；收款 status == 'confirmed'
//   且 collection_date 落期间内（同文件两条 fetch_*_for_reconciliation）。
// - 红冲腿的真实语义与拒绝码族：
//   POST /ar/invoices/{id}/cancel → ar_invoice_service::cancel，已 PAID 拒 400、已 CANCELLED 再拒 400；
//   POST /ar/payments/{id}/cancel → cancel_collection 仅 pending 可取消，confirmed 拒 400 BAD_REQUEST
//   并点名「仅 pending 状态可直接取消」；
//   POST /ar/verifications/{id}/cancel → 回滚发票 received/unpaid 与状态词值。
// - 客户确认门 check_customer_confirm_status：confirmed 再确认拒 400 BUSINESS_ERROR；
//   发送门 send：非 draft 拒 400「只有草稿状态的对账单可以发送」；
//   关闭门 validate_close_status：仅 confirmed/disputed 可关闭；
//   update_status 白名单六值，白名单外（含 resolve_dispute 缺省 'resolved'）拒 400。
// - 出参键名以实体/DTO 为准（snake_case）：base 面列表是 PaginatedResponse{items,total,page,page_size}，
//   enhanced 面 list_results/confirmations/disputes 是 {list,total,page,page_size}，
//   /exchange-rates 列表是裸数组，/{id}/details 是 {reconciliation, details}。
// - 金额列 DECIMAL 线格式（出参字符串），断言一律折分位后按整数比分，不在测试内再造舍入方向。
//
// 关于「三类关联数同步回滚」的诚实边界：应收对账域的出参键集合里没有库存列、也没有成本列
// （442-04 逐枚枚举真实键集合钉住这一点），红冲在本域真实能回滚的是两类关联数——
// 发票侧应收余额（received/unpaid/状态词值）与核销账本（closed→cancelled、退出有效核销集合）。
// 第三类凭证生成只在 close 腿（recon_ops/lifecycle::create_close_voucher，失败仅 warn 不阻断），
// 属不可判定的旁路，故本文件不对凭证行数下断言，避免把旁路波动写成本支缺陷。
//
// 登记的后端疑点（只登记、不在测试侧迁就，见交付回报）：
// A. POST /ar-reconciliations/generate 不做行级归属门（同族的 get/update/confirm 都过
//    ensure_reconciliation_customer_access），任意持 ar-reconciliations:create 者可为他人客户建对账单；
// B. check_customer_confirm_status 对 cancelled 态放行（cancelled → confirmed 可流转），
//    与本文件对账关闭/删除腿的终态语义不一致；
// C. create_payment 无幂等键，字面重复提交落两条收款单（单号 UNIQUE 兜底，不会重复单号）；
// D. PUT /ar-reconciliations-enhanced/disputes/{id}/resolve 缺省 target_status='resolved'
//    不在 update_status 白名单内，缺省调用必 400。
import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

/** DECIMAL 线格式（字符串/数字）折成整数分位；宽于 scale 的尾数必须全为零才截，出现非零即判红，不静默丢精度 */
function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出分位精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac.slice(0, scale)).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 字面金额串 → 分 */
function cents(want: string): bigint {
  return toScaled(want, 2, `期望金额 ${want}`);
}

function eqAmount(actual: unknown, expectedCents: bigint, label: string): void {
  expect(
    toScaled(actual, 2, label),
    `${label}：期望(分)=${expectedCents} 实际=${JSON.stringify(actual)}`
  ).toBe(expectedCents);
}

function requireNum(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：无有效数值，raw=${JSON.stringify(v)}`);
  return n;
}

function requireStr(v: unknown, label: string): string {
  if (typeof v !== 'string' || v === '')
    throw new Error(`${label}：出参非非空字符串，raw=${JSON.stringify(v)}`);
  return v;
}

/** 本用例族统一的业务日期锚点：期间取「远早于建单日 → 明日」，覆盖本次建出的全部发票与收款 */
function periodStart(): string {
  return '2000-01-01';
}

function periodEnd(): string {
  return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** base 面单行读回（ReconciliationResponse：不含 confirmed_by_customer，含 notes/dispute_reason） */
async function readRecon(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar-reconciliations/${id}`);
}

/** 单头 + 明细同读（GET /ar-reconciliations-enhanced/{id}/details → {reconciliation, details}） */
async function readReconDetails(
  page: import('@playwright/test').Page,
  id: number
): Promise<{ head: Row; details: Row[] }> {
  const body = await apiCallRaw<Row>(page, 'GET', `/ar-reconciliations-enhanced/${id}/details`);
  const head = body.reconciliation as Row;
  const details = body.details as Row[];
  expect(head, `对账单 ${id} 的 details 出参缺 reconciliation 子对象`).toBeTruthy();
  expect(Array.isArray(details), `对账单 ${id} 的 details 必须为数组`).toBe(true);
  return { head, details };
}

/**
 * 生成对账单（POST /ar-reconciliations/generate）。
 * 出参是 ar_reconciliation::Model 全字段序列化（含 confirmed_by_customer），
 * 单号由后端生成（RC 前缀），初始状态必为小写 draft。
 */
async function generateRecon(
  page: import('@playwright/test').Page,
  customerId: number,
  notes: string
): Promise<Row> {
  const body = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations-enhanced/generate', {
    customer_id: customerId,
    start_date: periodStart(),
    end_date: periodEnd(),
    notes,
  });
  // 主键必须真实落库为正整数：调用方拿不到合法 id 时后续整条腿都是空跑，先在这里点名
  requireNum(body.id, `生成对账单 ${notes}`);
  expect(
    requireStr(body.reconciliation_no, '对账单号'),
    '对账单号必须由后端生成且带 RC 前缀'
  ).toMatch(/^RC/);
  expect(body.reconciliation_status, '新生成对账单初始状态小写 draft').toBe('draft');
  return body;
}

async function createApprovedInvoice(
  page: import('@playwright/test').Page,
  customerId: number,
  amount: string
): Promise<{ id: number; invoice_no: string }> {
  const d = today();
  const inv = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
    customer_id: customerId,
    invoice_amount: amount,
    invoice_date: d,
    due_date: d,
  });
  const id = requireNum(inv.id, `建应收 ${amount}`);
  await apiCall(page, 'POST', `/ar/invoices/${id}/approve`);
  const approved = await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${id}`);
  expect(approved.status, '应收审批回读大写 APPROVED').toBe('APPROVED');
  return { id, invoice_no: requireStr(approved.invoice_no, '发票号') };
}

async function createPayment(
  page: import('@playwright/test').Page,
  customerId: number,
  amount: string,
  remark: string
): Promise<{ id: number; collection_no: string }> {
  const p = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
    customer_id: customerId,
    amount,
    payment_method: '银行转账',
    payment_date: today(),
    remark,
  });
  const id = requireNum(p.id, `建收款 ${amount}`);
  return { id, collection_no: requireStr(p.collection_no, '收款单号') };
}

async function readPayment(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar/payments/${id}`);
}

async function readInvoice(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/ar/invoices/${id}`);
}

/** 单头三键与明细汇总的对平判据：INVOICE 行相加=total_invoices，RECEIPT 行取负相加=total_collections */
function expectHeadMatchesDetails(head: Row, details: Row[], label: string): void {
  const invoiceRows = details.filter(d => d.item_type === 'INVOICE');
  const receiptRows = details.filter(d => d.item_type === 'RECEIPT');
  const otherRows = details.filter(d => d.item_type !== 'INVOICE' && d.item_type !== 'RECEIPT');
  expect(otherRows.length, `${label}：明细出现 INVOICE/RECEIPT 之外的未预期 item_type`).toBe(0);
  const sumInvoice = invoiceRows.reduce(
    (acc, r) => acc + toScaled(r.amount, 2, `${label} INVOICE 行金额`),
    0n
  );
  const sumReceipt = receiptRows.reduce(
    (acc, r) => acc + toScaled(r.amount, 2, `${label} RECEIPT 行金额`),
    0n
  );
  eqAmount(
    head.total_invoices,
    sumInvoice,
    `${label}：单头 total_invoices 必须等于 INVOICE 明细合计`
  );
  eqAmount(
    head.total_collections,
    -sumReceipt,
    `${label}：单头 total_collections 必须等于 RECEIPT 明细取负合计（收款行按记账方向存负额）`
  );
}

/** 期末余额恒等式（权威判据 compute_closing_balance） */
function expectClosingIdentity(row: Row, label: string): void {
  expect(
    toScaled(row.closing_balance, 2, `${label} 期末`),
    `${label}：期末=期初+发票合计−收款合计（分位恒等）`
  ).toBe(
    toScaled(row.opening_balance, 2, `${label} 期初`) +
      toScaled(row.total_invoices, 2, `${label} 发票合计`) -
      toScaled(row.total_collections, 2, `${label} 收款合计`)
  );
}

/** 脱敏负判据：真实枚举返回 JSON 的键集合，出现任一成本/进价/供应商侧键即判红 */
function expectNoCostLeakKeys(obj: Row, surface: string): void {
  const forbidden = [
    'cost_amount',
    'cost_price',
    'purchase_price',
    'unit_cost',
    'supplier_id',
    'supplier_name',
    'supplier_price',
    'input_tax_amount',
    'purchase_order_no',
  ];
  const keys = Object.keys(obj);
  expect(keys.length, `${surface}：出参键集合不得为空（空集合会让脱敏断言恒真）`).toBeGreaterThan(
    0
  );
  const hit = keys.filter(k => forbidden.includes(k));
  expect(hit, `${surface}：财务对账出参泄漏成本/进价/供应商侧键 ${JSON.stringify(hit)}`).toEqual(
    []
  );
}

test.describe('442 对账确认与红冲联动', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('442-01 生成对账单→金额与明细对平回读→发送→客户确认→收款核销扣减应收的链式持久化', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireNum(me.id, '当前用户');
    const tag = genCode('R442A');

    // 建一张已审批应收 1500.00 与一笔已确认收款 400.00，让汇总腿有真实素材
    const inv = await createApprovedInvoice(page, ctx.customerId, '1500.00');
    const pay = await createPayment(page, ctx.customerId, '400.00', `E2E-${tag}-P`);
    await apiCall(page, 'POST', `/ar/payments/${pay.id}/confirm`);
    const payConfirmed = await readPayment(page, pay.id);
    expect(payConfirmed.status, '收款确认回读小写 confirmed').toBe('confirmed');

    // 收款未核销前不动发票已收：链式持久化必须按真实出参口径而非按「有单据就扣」
    const invBefore = await readInvoice(page, inv.id);
    eqAmount(invBefore.received_amount, 0n, '未核销时发票已收必须为 0');

    const recon = await generateRecon(page, ctx.customerId, `E2E-${tag}`);
    const reconId = requireNum(recon.id, '对账单主键');

    // 生成腿逐字段落库回读：本次两张源单都必须进明细，且金额与源单逐字符同值
    const first = await readReconDetails(page, reconId);
    // 定位谓词必须「类型列 + document_id」双条件：document_id 是多态列（发票行存 ar_invoice.id、
    // 收款行存 ar_collection.id），两张表各自主键独立编号，同客户期间内他人单据又被本单如实汇总进来，
    // 单看 document_id 会命中数值相同的异类型行（跨表撞号），把别人的发票行冒充成本腿的收款行。
    const invRow = first.details.find(
      r => String(r.item_type) === 'INVOICE' && Number(r.document_id) === inv.id
    );
    expect(invRow, `对账明细必须含发票 ${inv.invoice_no} 行`).toBeTruthy();
    // 自建号双证：发票行的 document_no 必须等于本腿建的那张发票号，坐实定位到的就是本腿那一行
    expect(String(invRow!.document_no), 'INVOICE 行 document_no 必须等于发票号').toBe(
      inv.invoice_no
    );
    eqAmount(invRow!.amount, cents('1500.00'), 'INVOICE 行金额=发票 invoice_amount');
    const payRow = first.details.find(
      r => String(r.item_type) === 'RECEIPT' && Number(r.document_id) === pay.id
    );
    expect(payRow, `对账明细必须含收款 ${pay.collection_no} 行`).toBeTruthy();
    // 自建号双证：收款行 document_no 由 vfy_ops/reconciliation.rs 的 insert_collection_items
    // 写 coll.collection_no，与本腿建单出参逐字符相等才算定位到本腿那一行
    expect(String(payRow!.document_no), 'RECEIPT 行 document_no 必须等于收款单号').toBe(
      pay.collection_no
    );
    expect(String(payRow!.item_type), '收款行 item_type 为大写 RECEIPT').toBe('RECEIPT');
    expect(String(payRow!.document_type), '收款行 document_type 为 COLLECTION').toBe('COLLECTION');
    expect(String(payRow!.match_status), '新生成收款行匹配态大写 UNMATCHED').toBe('UNMATCHED');
    eqAmount(payRow!.amount, -cents('400.00'), 'RECEIPT 行按记账方向存负额');

    // 明细合计与单头合计对平 + 期末恒等式（分位无分差）
    expectClosingIdentity(first.head, '生成回读');
    expectHeadMatchesDetails(first.head, first.details, '生成回读');

    // 重新 GET 一次：链式持久化而非响应内自洽
    const again = await readReconDetails(page, reconId);
    expect(String(again.head.id), '二次读回必须是同一行').toBe(String(reconId));
    for (const key of [
      'reconciliation_no',
      'customer_id',
      'opening_balance',
      'total_invoices',
      'total_collections',
      'closing_balance',
      'reconciliation_status',
    ] as const) {
      expect(String(again.head[key]), `二次读回 ${key} 与首次不一致`).toBe(String(first.head[key]));
    }

    // 发送腿：draft → sent
    await apiCall(page, 'POST', `/ar-reconciliations/${reconId}/send`);
    const sent = await readRecon(page, reconId);
    expect(sent.reconciliation_status, '发送后小写 sent').toBe('sent');

    // 客户确认腿：sent → confirmed，确认人与确认时间真实落库
    await apiCall(page, 'POST', `/ar-reconciliations/${reconId}/confirm`);
    const confirmed = await readRecon(page, reconId);
    expect(confirmed.reconciliation_status, '确认后小写 confirmed').toBe('confirmed');
    const confirmedModel = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/${reconId}/details`
    );
    const headModel = confirmedModel.reconciliation as Row;
    expect(headModel.confirmed_by_customer, '客户确认标记必须置 true').toBe(true);
    expect(Number(headModel.confirmed_by), 'confirmed_by 落真实操作人').toBe(myId);
    expect(headModel.confirmed_at, 'confirmed_at 必须写入').toBeTruthy();
    expect(String(headModel.closing_balance), '确认后期末不得漂移').toBe(
      String(first.head.closing_balance)
    );

    // 收款登记腿：确认过的收款核销 1200.00 到发票 → 应收余额按出参 unpaid_amount 扣减
    const vfy = await apiCallRaw<Row>(page, 'POST', '/ar/verifications/manual', {
      invoice_id: inv.id,
      payment_id: pay.id,
      amount: '400.00',
      remark: `E2E-${tag}-V`,
    });
    expect(String(vfy.status), '核销即时状态小写 closed').toBe('closed');
    const invAfterVfy = await readInvoice(page, inv.id);
    eqAmount(invAfterVfy.received_amount, cents('400.00'), '核销后发票已收');
    eqAmount(invAfterVfy.unpaid_amount, cents('1100.00'), '应收余额按出参口径扣减到分');
    expect(invAfterVfy.status, '部分核销发票词值 PARTIAL_PAID').toBe('PARTIAL_PAID');
    expect(
      toScaled(invAfterVfy.invoice_amount, 2, '发票额') ===
        toScaled(invAfterVfy.received_amount, 2, '已收') +
          toScaled(invAfterVfy.unpaid_amount, 2, '未收'),
      '核销后发票恒等式 发票额=已收+未收 必须成立'
    ).toBe(true);
  });

  test('442-02 红冲联动：核销回收回滚应收、发票作废后退出新对账汇总，红冲腿重复与终态各拒一次', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('R442B');

    // 888.88 发票 + 300.00 已确认收款 + 全额核销 → 已收 300.00、未收 588.88
    const inv = await createApprovedInvoice(page, ctx.customerId, '888.88');
    const pay = await createPayment(page, ctx.customerId, '300.00', `E2E-${tag}-P`);
    await apiCall(page, 'POST', `/ar/payments/${pay.id}/confirm`);
    const vfy = await apiCallRaw<Row>(page, 'POST', '/ar/verifications/manual', {
      invoice_id: inv.id,
      payment_id: pay.id,
      amount: '300.00',
    });
    const vfyId = requireNum(vfy.id, '核销单');
    const invVerified = await readInvoice(page, inv.id);
    eqAmount(invVerified.received_amount, cents('300.00'), '红冲前已收');
    eqAmount(invVerified.unpaid_amount, cents('588.88'), '红冲前未收');

    // 红冲前的对账单：必须真的把这张发票与这笔收款都汇总进来（正向对照，防负例真空）
    const reconBefore = await generateRecon(page, ctx.customerId, `E2E-${tag}-BEFORE`);
    const idBefore = requireNum(reconBefore.id, '红冲前对账单');
    const before = await readReconDetails(page, idBefore);
    // 同 442-01 的定位口径：多态 document_id 必须与类型列成对，否则跨表撞号会把别人的
    // 收款行当成本腿发票行来打金额判据。
    const beforeInvRow = before.details.find(
      r => String(r.item_type) === 'INVOICE' && Number(r.document_id) === inv.id
    );
    expect(beforeInvRow, '红冲前发票必须在对账明细内').toBeTruthy();
    expect(
      String(beforeInvRow!.document_no),
      '红冲前 INVOICE 行 document_no 必须等于本腿发票号'
    ).toBe(inv.invoice_no);
    eqAmount(beforeInvRow!.amount, cents('888.88'), '红冲前明细按发票全额入汇总');
    expectHeadMatchesDetails(before.head, before.details, '红冲前');

    // 第一类关联数回滚：取消核销 → 发票已收清零、余额回全额、词值退回 APPROVED
    await apiCall(page, 'POST', `/ar/verifications/${vfyId}/cancel`);
    const invAfterVfyCancel = await readInvoice(page, inv.id);
    eqAmount(invAfterVfyCancel.received_amount, 0n, '核销取消必须把发票已收回滚为 0');
    eqAmount(invAfterVfyCancel.unpaid_amount, cents('888.88'), '核销取消必须把应收余额回全额');
    expect(invAfterVfyCancel.status, '回滚后发票词值退回 APPROVED（不得残留 PARTIAL_PAID）').toBe(
      'APPROVED'
    );
    const vfyAfterCancel = await apiCallRaw<Row>(page, 'GET', `/ar/verifications/${vfyId}`);
    expect(String(vfyAfterCancel.reconciliation_status), '核销单取消后小写 cancelled').toBe(
      'cancelled'
    );

    // 第二类关联数回滚：收款单作废（pending 腿已在 442-03 覆盖，这里是 confirmed 收款被
    // 核销回收后的直接作废门）+ 发票本体红冲
    const fPayCancelConfirmed = await apiCallExpectFail(
      page,
      'POST',
      `/ar/payments/${pay.id}/cancel`
    );
    expect(fPayCancelConfirmed.status, 'confirmed 收款直接作废应 400').toBe(400);
    expect(failureCode(fPayCancelConfirmed), '收款作废状态门机器码').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
    const payStill = await readPayment(page, pay.id);
    expect(payStill.status, '被拒作废后收款仍 confirmed').toBe('confirmed');

    await apiCall(page, 'POST', `/ar/invoices/${inv.id}/cancel`, { reason: `E2E-${tag}-红冲` });
    const invCancelled = await readInvoice(page, inv.id);
    expect(invCancelled.status, '红冲回读大写 CANCELLED').toBe('CANCELLED');
    eqAmount(invCancelled.received_amount, 0n, '红冲不得篡改已收');
    eqAmount(invCancelled.unpaid_amount, cents('888.88'), '红冲不得篡改未收');

    // 红冲后原单不得再被引用到新对账：同客户同期间再生成，发票额必须精确从汇总里退出
    const reconAfter = await generateRecon(page, ctx.customerId, `E2E-${tag}-AFTER`);
    const idAfter = requireNum(reconAfter.id, '红冲后对账单');
    const after = await readReconDetails(page, idAfter);
    expect(
      after.details.some(r => Number(r.document_id) === inv.id),
      '红冲后的发票不得再出现在新对账单明细'
    ).toBe(false);
    expect(
      after.details.some(r => String(r.document_no) === inv.invoice_no),
      '红冲后的发票号不得再被任何明细行引用'
    ).toBe(false);
    expect(
      after.head.total_invoices,
      '红冲腿必须把该发票额从新对账单的应收汇总中整段剔除'
    ).not.toBe(before.head.total_invoices);
    eqAmount(
      after.head.total_invoices,
      toScaled(before.head.total_invoices, 2, '红冲前发票合计') - cents('888.88'),
      '红冲后应收汇总=红冲前汇总−888.88（逐分）'
    );
    eqAmount(
      after.head.total_collections,
      toScaled(before.head.total_collections, 2, '红冲前收款合计'),
      '红冲发票不影响已确认收款汇总（收款腿未被牵连）'
    );
    expectClosingIdentity(after.head, '红冲后');
    expectHeadMatchesDetails(after.head, after.details, '红冲后');

    // 红冲后不得再被引用到新核销（负例钉 400 + 机器码族）
    const pay2 = await createPayment(page, ctx.customerId, '50.00', `E2E-${tag}-P2`);
    await apiCall(page, 'POST', `/ar/payments/${pay2.id}/confirm`);
    const fVerifyCancelled = await apiCallExpectFail(page, 'POST', '/ar/verifications/manual', {
      invoice_id: inv.id,
      payment_id: pay2.id,
      amount: '50.00',
    });
    expect(fVerifyCancelled.status, '已红冲发票被新核销引用应 400').toBe(400);
    expect(failureCode(fVerifyCancelled), '红冲发票核销机器码 BAD_REQUEST').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
    const invNoReeffect = await readInvoice(page, inv.id);
    eqAmount(invNoReeffect.received_amount, 0n, '被拒核销不得写入已红冲发票的已收');
    expect(invNoReeffect.status, '被拒核销后仍 CANCELLED 不回退').toBe('CANCELLED');

    // 重复红冲被拒且状态不二次流转
    const fReCancel = await apiCallExpectFail(page, 'POST', `/ar/invoices/${inv.id}/cancel`, {
      reason: `E2E-${tag}-重复`,
    });
    expect(fReCancel.status, '已红冲发票再红冲应 400').toBe(400);
    expect(failureCode(fReCancel), '重复红冲机器码 BAD_REQUEST').toBe(APP_ERROR_CODES.BAD_REQUEST);
    const pay2Confirmed = await readPayment(page, pay2.id);
    expect(pay2Confirmed.status, '收款仍 confirmed').toBe('confirmed');

    // 重复取消同一核销不得二次回滚
    const fReVfyCancel = await apiCallExpectFail(page, 'POST', `/ar/verifications/${vfyId}/cancel`);
    expect(fReVfyCancel.status, 'cancelled 核销单再取消应 400').toBe(400);
    expect(failureCode(fReVfyCancel), '重复取消核销机器码').toBe(APP_ERROR_CODES.BAD_REQUEST);
    const invNoDoubleRollback = await readInvoice(page, inv.id);
    eqAmount(invNoDoubleRollback.unpaid_amount, cents('888.88'), '重复取消不得把未收二次放大');
  });

  test('442-03 非法状态跳转与幂等：重复确认/重复发送/重复作废只流转一次，白名单外状态与草稿关闭被拒', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireNum(me.id, '当前用户');
    const tag = genCode('R442C');

    const recon = await generateRecon(page, ctx.customerId, `E2E-${tag}-IDEM`);
    const id = requireNum(recon.id, '对账单主键');

    // 非法跳转 1：草稿直接关闭（confirmed/disputed 才允许）
    const fCloseDraft = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${id}/close`);
    expect(fCloseDraft.status, 'draft 直接 close 应 400').toBe(400);
    expect(failureCode(fCloseDraft), '草稿关闭机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(fCloseDraft.message ?? ''), '拒绝应点名可关闭的前置状态').toContain('已确认');
    const stillDraft = await readRecon(page, id);
    expect(stillDraft.reconciliation_status, '被拒关闭后仍 draft').toBe('draft');

    // 非法跳转 2：状态白名单外的字面量必须被拒且不落库
    for (const bad of ['resolved', 'CONFIRMED', 'in_progress', '']) {
      const fBad = await apiCallExpectFail(page, 'PUT', `/ar-reconciliations/${id}/status`, {
        status: bad,
      });
      expect(fBad.status, `白名单外状态 "${bad}" 应 400`).toBe(400);
      expect(failureCode(fBad), `白名单外状态 "${bad}" 机器码`).toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      const afterBad = await readRecon(page, id);
      expect(afterBad.reconciliation_status, `"${bad}" 被拒后状态不得变化`).toBe('draft');
    }

    // 幂等 1：重复发送三次，只有第一次流转
    await apiCall(page, 'POST', `/ar-reconciliations/${id}/send`);
    const sentOnce = await readRecon(page, id);
    expect(sentOnce.reconciliation_status, '首次发送后 sent').toBe('sent');
    for (let i = 0; i < 2; i += 1) {
      const fSend = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${id}/send`);
      expect(fSend.status, `重复发送第 ${i + 1} 次应 400`).toBe(400);
      expect(failureCode(fSend), `重复发送第 ${i + 1} 次机器码`).toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      expect(String(fSend.message ?? ''), '重复发送拒绝应点名草稿门').toContain('草稿');
    }
    const sentStill = await readRecon(page, id);
    expect(sentStill.reconciliation_status, '三次发送腿后状态仍只流转过一次（sent）').toBe('sent');

    // 幂等 2：重复确认三次，confirmed_by 不被后者覆盖
    await apiCall(page, 'POST', `/ar-reconciliations/${id}/confirm`);
    const confirmedOnce = await readReconDetails(page, id);
    expect(confirmedOnce.head.reconciliation_status, '首次确认后 confirmed').toBe('confirmed');
    const firstConfirmedBy = Number(confirmedOnce.head.confirmed_by);
    const firstConfirmedAt = String(confirmedOnce.head.confirmed_at);
    expect(firstConfirmedBy, '确认人必须是真实当前用户').toBe(myId);
    for (let i = 0; i < 2; i += 1) {
      const fConfirm = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${id}/confirm`);
      expect(fConfirm.status, `重复确认第 ${i + 1} 次应 400`).toBe(400);
      expect(failureCode(fConfirm), `重复确认第 ${i + 1} 次机器码`).toBe(
        APP_ERROR_CODES.BUSINESS_ERROR
      );
      expect(String(fConfirm.message ?? ''), '重复确认拒绝应点名「不可重复确认」').toContain(
        '不可重复确认'
      );
    }
    const confirmedStill = await readReconDetails(page, id);
    expect(String(confirmedStill.head.confirmed_by), '确认人不得被重复请求覆盖').toBe(
      String(firstConfirmedBy)
    );
    expect(String(confirmedStill.head.confirmed_at), '确认时间不得被重复请求改写').toBe(
      firstConfirmedAt
    );
    expect(confirmedStill.head.reconciliation_status, '状态只流转一次（confirmed）').toBe(
      'confirmed'
    );

    // 确认记录列表（enhanced 面固定 status=confirmed 过滤）里本行恰出现一次：只落一条
    const confList = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/confirmations?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const confRows = pickListArray<Row>(confList, 'list', '客户确认记录列表');
    const hits = confRows.filter(r => Number(r.id) === id);
    expect(hits.length, '同一对账单在确认记录列表必须恰出现一次').toBe(1);
    expect(String(hits[0].reconciliation_status), '列表侧确认状态与详情一致').toBe('confirmed');

    // 别名确认腿（POST /confirmations 走同一 customer_confirm 门）对已 confirmed 行必 400
    const fAlias = await apiCallExpectFail(
      page,
      'POST',
      '/ar-reconciliations-enhanced/confirmations',
      {
        reconciliation_id: id,
      }
    );
    expect(fAlias.status, '别名确认腿对 confirmed 行应 400').toBe(400);
    expect(failureCode(fAlias), '别名确认腿机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 争议门与确认门的互斥：confirmed 不可提争议（只读回一次，状态不被污染）
    const fDispute = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${id}/dispute`, {
      reason: `E2E-${tag}-争议门`,
    });
    expect(fDispute.status, 'confirmed 提争议应 400').toBe(400);
    expect(failureCode(fDispute), 'confirmed 提争议机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const afterDispute = await readRecon(page, id);
    expect(afterDispute.reconciliation_status, '被拒争议不得把 confirmed 改成 disputed').toBe(
      'confirmed'
    );

    // 幂等 3：重复作废收款（pending 腿），只有第一次置 cancelled
    const pay = await createPayment(page, ctx.customerId, '66.60', `E2E-${tag}-CANCEL`);
    const payListBefore = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar/payments?customer_id=${ctx.customerId}&payment_no=${encodeURIComponent(pay.collection_no)}&page=1&page_size=20`
    );
    const rowsBefore = pickListArray<Row>(payListBefore, 'list', '按单号查收款');
    expect(rowsBefore.length, '新建收款按单号应恰命中一条').toBe(1);
    await apiCall(page, 'POST', `/ar/payments/${pay.id}/cancel`);
    const cancelled = await readPayment(page, pay.id);
    expect(cancelled.status, '作废回读小写 cancelled').toBe('cancelled');
    const fReCancel = await apiCallExpectFail(page, 'POST', `/ar/payments/${pay.id}/cancel`);
    expect(fReCancel.status, 'cancelled 再作废应 400').toBe(400);
    expect(failureCode(fReCancel), '重复作废机器码 BAD_REQUEST').toBe(APP_ERROR_CODES.BAD_REQUEST);
    const cancelStill = await readPayment(page, pay.id);
    expect(cancelStill.status, '重复作废不得二次流转').toBe('cancelled');
    eqAmount(cancelStill.amount, cents('66.60'), '重复作废不得改动收款金额');
    const payListAfter = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar/payments?customer_id=${ctx.customerId}&payment_no=${encodeURIComponent(pay.collection_no)}&page=1&page_size=20`
    );
    expect(
      pickListArray<Row>(payListAfter, 'list', '作废后按单号查收款').length,
      '作废不得复制出第二张同单号收款'
    ).toBe(1);

    // 现状钉桩（疑点 C）：POST /ar/payments 无幂等键，字面重复提交会落两条不同单号的收款。
    // 本用例不宣称「重复提交收款只落一条」（源码不成立），只钉住「单号唯一、两行互不覆盖」。
    const dupPayload = {
      customer_id: ctx.customerId,
      amount: '11.11',
      payment_method: '银行转账',
      payment_date: today(),
      remark: `E2E-${tag}-DUP`,
    };
    const dupA = await apiCallRaw<Row>(page, 'POST', '/ar/payments', dupPayload);
    const dupB = await apiCallRaw<Row>(page, 'POST', '/ar/payments', dupPayload);
    const dupAId = requireNum(dupA.id, '重复提交第一笔');
    const dupBId = requireNum(dupB.id, '重复提交第二笔');
    expect(dupAId === dupBId, '重复提交必须落两行（无幂等键，疑点 C）').toBe(false);
    expect(
      requireStr(dupA.collection_no, '第一笔单号') === requireStr(dupB.collection_no, '第二笔单号'),
      '两行的单号必须不同（collection_no UNIQUE 兜底）'
    ).toBe(false);
    const dupARead = await readPayment(page, dupAId);
    const dupBRead = await readPayment(page, dupBId);
    eqAmount(dupARead.amount, cents('11.11'), '重复提交第一笔金额未被第二笔覆盖');
    eqAmount(dupBRead.amount, cents('11.11'), '重复提交第二笔金额独立');

    // 关闭腿合法流转：confirmed → closed（状态第三次且唯一一次流转）
    await apiCall(page, 'POST', `/ar-reconciliations/${id}/close`);
    const closed = await readRecon(page, id);
    expect(closed.reconciliation_status, '已确认对账单关闭后小写 closed').toBe('closed');
    const fReClose = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${id}/close`);
    expect(fReClose.status, 'closed 再关闭应 400').toBe(400);
    expect(failureCode(fReClose), '重复关闭机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const closedStill = await readRecon(page, id);
    expect(closedStill.reconciliation_status, '重复关闭不得二次流转').toBe('closed');

    // 非草稿不可删除（删除门只放 draft），被拒后行仍在
    const fDelete = await apiCallExpectFail(page, 'DELETE', `/ar-reconciliations/${id}`);
    expect(fDelete.status, 'closed 删除应 400').toBe(400);
    expect(failureCode(fDelete), '删除状态门机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const afterDeleteFail = await readRecon(page, id);
    expect(String(afterDeleteFail.id), '被拒删除后行必须仍在').toBe(String(id));
  });

  test('442-04 角色不相容与脱敏：财务岗红冲可达、业务员岗 403 且库内零变更、对账出参键集合不含成本进价', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('R442D');

    // 财务侧（本 worker 管理员会话）红冲可达并真实落库
    const invFinance = await createApprovedInvoice(page, ctx.customerId, '120.00');
    await apiCall(page, 'POST', `/ar/invoices/${invFinance.id}/cancel`, {
      reason: `E2E-${tag}-财务`,
    });
    const invCancelled = await readInvoice(page, invFinance.id);
    expect(invCancelled.status, '财务岗红冲回读 CANCELLED').toBe('CANCELLED');

    // 业务员岗不持 ar-invoices 红冲键：同一动作必须 403，且目标单据零变更
    const invSales = await createApprovedInvoice(page, ctx.customerId, '130.00');
    await loginAsRole(page, 'salesperson');
    const fSales = await apiCallExpectFail(page, 'POST', `/ar/invoices/${invSales.id}/cancel`, {
      reason: `E2E-${tag}-业务员越权`,
    });
    expect(fSales.status, '业务员红冲应收单应被 RBAC 拒 403').toBe(403);
    expect(failureCode(fSales), '业务员红冲机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    const fSalesRead = await apiCallExpectFail(page, 'GET', `/ar-reconciliations`);
    expect(fSalesRead.status, '业务员读应收对账列表应 403（不持 ar-reconciliations 任一键）').toBe(
      403
    );
    expect(failureCode(fSalesRead), '业务员读对账机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 库内零变更必须用持键会话回读证明（403 会话自己读不到，不能拿它自证）
    await loginViaUI(page, testUsername(), testPassword(), true);
    const invSalesAfter = await readInvoice(page, invSales.id);
    expect(invSalesAfter.status, '越权红冲被拒后发票仍 APPROVED（RBAC 不得半改状态）').toBe(
      'APPROVED'
    );
    eqAmount(invSalesAfter.received_amount, 0n, '越权被拒不得写入已收');
    eqAmount(invSalesAfter.unpaid_amount, cents('130.00'), '越权被拒不得扣减未收');

    // 行级归属门：另一角色（数据范围 self）不得读到他人客户的对账单，且必须 403 而非部分返回
    const recon = await generateRecon(page, ctx.customerId, `E2E-${tag}-SCOPE`);
    const id = requireNum(recon.id, '对账单主键');
    await loginAsRole(page, 'finance_manager');
    const fScope = await apiCallExpectFail(page, 'GET', `/ar-reconciliations/${id}`);
    expect(fScope.status, 'finance_manager（data_scope=self）读他人客户对账单应 403').toBe(403);
    expect(failureCode(fScope), '归属门机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    const fScopeDetails = await apiCallExpectFail(
      page,
      'GET',
      `/ar-reconciliations-enhanced/${id}/details`
    );
    expect(fScopeDetails.status, '归属门同样覆盖明细腿（不得只封主键读）').toBe(403);

    // 脱敏：持键会话真实枚举对账三个出参面的键集合
    await loginViaUI(page, testUsername(), testPassword(), true);
    const baseResp = await readRecon(page, id);
    expectNoCostLeakKeys(baseResp, 'GET /ar-reconciliations/{id}');
    const { head, details } = await readReconDetails(page, id);
    expectNoCostLeakKeys(head, 'GET /ar-reconciliations-enhanced/{id}/details .reconciliation');
    expect(details.length, '脱敏检查必须有真实明细行，空数组会让负判据恒真').toBeGreaterThan(0);
    details.forEach((row, idx) => expectNoCostLeakKeys(row, `明细行[${idx}]`));

    // 列表面同样按同一 DTO 出参，逐行核键
    const listResp = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${ctx.customerId}&page=1&page_size=50`
    );
    const items = pickListArray<Row>(listResp, 'items', '对账单 base 列表');
    expect(items.length, '本客户必须已在对账列表内').toBeGreaterThan(0);
    items.forEach((row, idx) => expectNoCostLeakKeys(row, `对账列表行[${idx}]`));
    const mine = items.filter(r => Number(r.id) === id);
    expect(mine.length, '列表内本行恰出现一次').toBe(1);
    expect(String(mine[0].reconciliation_status), '列表状态与详情一致').toBe('draft');
  });

  test('442-05 多币种与含税口径：汇率三处同源、换算腿与查询腿逐字符一致、含税为录入事实且税额取差额勾稽', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    if (!ctx.productIds.length || !ctx.quotationProductUnit) {
      throw new Error('前置缺失：ctx.productIds / ctx.quotationProductUnit 未就绪');
    }
    const tag = genCode('R442E');
    const me = await apiCallRaw<Row>(page, 'GET', '/auth/me');
    const myId = requireNum(me.id, '当前用户');

    // 币种档案：本位币由后端给出，测试不自造币码（GET /currencies 的 data 是裸数组）
    const currenciesRaw = await apiCallRaw<unknown>(page, 'GET', '/currencies');
    expect(Array.isArray(currenciesRaw), '币种列表出参必须是裸数组').toBe(true);
    const currencies = currenciesRaw as Row[];
    expect(currencies.length, '币种档案不得为空').toBeGreaterThan(0);
    const baseRow = currencies.find(c => c.is_base === true);
    expect(baseRow, '币种档案必须有一枚本位币（is_base=true）').toBeTruthy();
    const baseCode = requireStr(baseRow!.code, '本位币代码');
    const baseBody = await apiCallRaw<Row>(page, 'GET', '/currencies/base');
    expect(String(baseBody.code), '/currencies/base 与列表腿的本位币必须同源').toBe(baseCode);
    const nonBase = currencies.find(
      c => requireStr(c.code, '币种代码') !== baseCode && c.is_active === true
    );
    expect(nonBase, '必须存在至少一个启用中的非本位币种才能测多币种腿').toBeTruthy();
    const quoteCode = requireStr(nonBase!.code, '报价币码');

    // 汇率写入 → 查询腿 → 列表腿 三处必须同源（跨面按字符串逐字符比，值按 4 位标度比）
    const RATE_SCALED = 73400n;
    const rate = '7.3400';
    const created = await apiCallRaw<Row>(page, 'POST', '/exchange-rates', {
      from_currency: quoteCode,
      to_currency: baseCode,
      rate,
      effective_date: today(),
    });
    const rateId = requireNum(created.id, '新建汇率');
    expect(toScaled(created.rate, 4, '创建响应汇率'), '创建汇率必须按 4 位标度落 7.3400').toBe(
      RATE_SCALED
    );
    const queried = await apiCallRaw<Row>(
      page,
      'GET',
      `/exchange-rates/query?from_currency=${quoteCode}&to_currency=${baseCode}`
    );
    expect(String(queried.rate), '查询腿汇率必须与创建腿逐字符一致').toBe(String(created.rate));
    expect(String(queried.from_currency), '查询腿币种对方向一致').toBe(quoteCode);
    expect(String(queried.to_currency), '查询腿目标币种一致').toBe(baseCode);
    const rateList = (await apiCallRaw<Row[]>(
      page,
      'GET',
      '/exchange-rates?page=1&page_size=100'
    )) as Row[] | unknown;
    expect(Array.isArray(rateList), '汇率列表出参必须是裸数组（非 PaginatedResponse）').toBe(true);
    const mine = (rateList as Row[]).filter(r => Number(r.id) === rateId);
    expect(mine.length, '汇率列表必须恰命中新建这条').toBe(1);
    expect(String(mine[0].rate), '列表腿汇率与查询腿一致').toBe(String(queried.rate));

    // 非法汇率各自点名拒绝且不落库
    const fZeroRate = await apiCallExpectFail(page, 'POST', '/exchange-rates', {
      from_currency: quoteCode,
      to_currency: baseCode,
      rate: '0',
      effective_date: today(),
    });
    expect(fZeroRate.status, '0 汇率应 400').toBe(400);
    expect(failureCode(fZeroRate), '0 汇率机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(String(fZeroRate.message ?? ''), '0 汇率拒绝应点名「大于0」').toContain('大于0');
    const fLegacyRate = await apiCallExpectFail(page, 'POST', '/exchange-rates', {
      from_currency: quoteCode,
      to_currency: baseCode,
      rate: '0.01',
      effective_date: today(),
    });
    expect(fLegacyRate.status, '历史缺陷值 0.01 应 400').toBe(400);
    expect(failureCode(fLegacyRate), '0.01 机器码 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const rateAfterRejects = await apiCallRaw<Row>(
      page,
      'GET',
      `/exchange-rates/query?from_currency=${quoteCode}&to_currency=${baseCode}`
    );
    expect(
      toScaled(rateAfterRejects.rate, 4, '两次被拒后的生效汇率'),
      '两次被拒后生效汇率仍是刚写入那条'
    ).toBe(RATE_SCALED);

    // 换算腿与查询腿的汇率必须同源自同一行（禁止各算一套）
    const converted = await apiCallRaw<Row>(page, 'POST', '/currencies/convert', {
      from_currency: quoteCode,
      to_currency: baseCode,
      amount: '100.00',
    });
    expect(String(converted.exchange_rate), '换算腿所用汇率与查询腿逐字符同源').toBe(
      String(queried.rate)
    );
    expect(String(converted.from_currency), '换算腿源币种回显一致').toBe(quoteCode);
    expect(String(converted.to_currency), '换算腿目标币种回显一致').toBe(baseCode);
    expect(String(converted.original_amount), '换算腿原始额如实回显入参').toBe('100.00');

    // 未知币种对：404 点名两枚币码，不得降级为空成功
    const fGhostPair = await apiCallExpectFail(
      page,
      'GET',
      '/exchange-rates/query?from_currency=XTN&to_currency=ZXC'
    );
    expect(fGhostPair.status, '不存在的汇率记录应 404').toBe(404);
    expect(failureCode(fGhostPair), '幽灵币对机器码 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(String(fGhostPair.message ?? ''), '404 文案应点名源币种').toContain('XTN');
    expect(String(fGhostPair.message ?? ''), '404 文案应点名目标币种').toContain('ZXC');

    // 含税腿：含税单价 113.00 是录入事实，数量 2 → 含税总额 226.00；
    // 净单价 100.00 → 净额 200.00（= 226.00 ÷ 1.13 的反算结果）；税额取差额 26.00。
    const quoteBody = (taxInclusive: boolean) => ({
      customer_id: ctx.customerId as number,
      sales_user_id: myId,
      quotation_date: today(),
      valid_until: periodEnd(),
      currency: quoteCode,
      exchange_rate: rate,
      base_currency: baseCode,
      price_terms: 'FOB',
      tax_inclusive: taxInclusive,
      tax_rate: '13',
      items: [
        {
          product_id: ctx.productIds[0],
          unit: ctx.quotationProductUnit,
          quantity: '2',
          unit_price: '100.00',
          unit_price_with_tax: '113.00',
        },
      ],
      notes: `E2E-${tag}-tax${taxInclusive}`,
    });

    const incl = await apiCallRaw<Row>(page, 'POST', '/quotations', quoteBody(true));
    const inclId = requireNum(incl.id, '含税报价单');
    eqAmount(incl.subtotal, cents('200.00'), '含税态净额=数量×净单价（200.00）');
    eqAmount(
      incl.total_amount,
      cents('226.00'),
      '含税态总额取行腿含税事实聚合（226.00），非乘法造出'
    );
    eqAmount(incl.tax_amount, cents('26.00'), '含税态税额=含税总额−净额（差额口径 26.00）');
    expect(
      toScaled(incl.total_amount, 2, '含税总额') ===
        toScaled(incl.subtotal, 2, '净额') + toScaled(incl.tax_amount, 2, '税额'),
      '含税三键必须勾稽：总额=净额+税额（分位无分差）'
    ).toBe(true);
    expect(incl.tax_inclusive, '含税标记如实持久化').toBe(true);
    expect(String(incl.currency), '报价币种回显为所选非本位币').toBe(quoteCode);
    expect(String(incl.base_currency), '本位币回显与币种档案同源').toBe(baseCode);
    expect(
      toScaled(incl.exchange_rate, 4, '报价单汇率列'),
      '汇率按录入值持久化不被换算（7.3400）'
    ).toBe(RATE_SCALED);

    // 落库回读：单头三键与二次读一致（不是响应内自洽）
    const inclRead = await apiCallRaw<Row>(page, 'GET', `/quotations/${inclId}`);
    for (const key of ['subtotal', 'tax_amount', 'total_amount', 'exchange_rate'] as const) {
      expect(String(inclRead[key]), `含税报价回读 ${key} 与创建腿一致`).toBe(String(incl[key]));
    }
    expectClosingIdentity(
      {
        opening_balance: inclRead.subtotal,
        total_invoices: inclRead.tax_amount,
        total_collections: '0',
        closing_balance: inclRead.total_amount,
      } as Row,
      '含税三键按「净额+税额=总额」同型恒等式复核'
    );

    // 不含税态同基数对照：后端乘算税额必须与含税态差额税额一分不差（两口径互校，不另写公式）
    const excl = await apiCallRaw<Row>(page, 'POST', '/quotations', quoteBody(false));
    const exclId = requireNum(excl.id, '不含税报价单');
    eqAmount(excl.subtotal, cents('200.00'), '不含税态净额同基');
    eqAmount(excl.tax_amount, toScaled(incl.tax_amount, 2, '含税态税额'), '两态税额必须等值');
    eqAmount(excl.total_amount, toScaled(incl.total_amount, 2, '含税态总额'), '两态总额必须等值');
    expect(excl.tax_inclusive, '不含税标记如实持久化').toBe(false);
    const exclRead = await apiCallRaw<Row>(page, 'GET', `/quotations/${exclId}`);
    expect(String(exclRead.quotation_no), '两张报价单单号必须不同（重复口径不得覆盖）').not.toBe(
      String(inclRead.quotation_no)
    );
    expect(String(exclRead.customer_id), '不含税单归属同一客户').toBe(String(inclRead.customer_id));

    // 非法税基：明细为空必须点名「至少 1 条」而不是 500 或空成功
    const fEmptyItems = await apiCallExpectFail(page, 'POST', '/quotations', {
      ...quoteBody(true),
      items: [],
    });
    expect(fEmptyItems.status, '空明细报价应 400').toBe(400);
    expect(String(fEmptyItems.message ?? ''), '空明细拒绝应点名明细条数').toContain('明细');
    // 文案逐字同源 backend/src/models/quotation_create_dto.rs 的明细长度校验 message。
    // 渲染口径见 utils/error.rs：字段级错误优先取仓库自撰 message，多条以全分号连接。
    expect(
      String(fEmptyItems.message ?? ''),
      '空明细拒绝必须外显明细条数规则文案，不得退化成字段名加校验代号'
    ).toContain('报价明细条数必须在1到100条之间');
  });

  test('442-06 跨端一致性：同一对账单在 base/enhanced 两挂载面、列表/详情两读面与两个独立会话之间逐字段一致', async ({
    page,
  }) => {
    const ctx = getCtx();
    if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
    const tag = genCode('R442F');

    const recon = await generateRecon(page, ctx.customerId, `E2E-${tag}-XR`);
    const id = requireNum(recon.id, '对账单主键');
    // 让这行有金额内容，否则「金额一致」退化成两个零恒等
    const inv = await createApprovedInvoice(page, ctx.customerId, '777.77');
    const reconWithMoney = await generateRecon(page, ctx.customerId, `E2E-${tag}-XR2`);
    const moneyId = requireNum(reconWithMoney.id, '含金额对账单');

    const cmpKeys = [
      'id',
      'reconciliation_no',
      'customer_id',
      'period_start',
      'period_end',
      'opening_balance',
      'total_invoices',
      'total_collections',
      'closing_balance',
      'reconciliation_status',
      'notes',
    ] as const;

    // 读面 1：base 面详情 DTO
    const detailBase = await readRecon(page, moneyId);
    // 读面 2：enhanced 面明细腿内嵌的 Model 子对象
    const detailEnhanced = await readReconDetails(page, moneyId);
    // 读面 3：base 面列表行
    const listBody = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const listRows = pickListArray<Row>(listBody, 'items', 'base 面列表');
    const myList = listRows.filter(r => Number(r.id) === moneyId);
    expect(myList.length, '列表内该对账单恰出现一次').toBe(1);
    // 读面 4：enhanced 面结果列表（别名分页信封 {list,...}）
    const resultsBody = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations-enhanced/auto-reconcile/results?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const myResult = pickListArray<Row>(resultsBody, 'list', 'enhanced 结果列表').filter(
      r => Number(r.id) === moneyId
    );
    expect(myResult.length, 'enhanced 结果列表内该对账单恰出现一次').toBe(1);

    for (const key of cmpKeys) {
      expect(String(detailEnhanced.head[key]), `${key}：enhanced 明细腿与 base 详情必须一致`).toBe(
        String(detailBase[key])
      );
      expect(String(myList[0][key]), `${key}：列表行与详情必须一致`).toBe(String(detailBase[key]));
      expect(String(myResult[0][key]), `${key}：enhanced 列表行与详情必须一致`).toBe(
        String(detailBase[key])
      );
    }
    // 金额按分位再核一次，避免 String() 掩盖标度漂移
    for (const [surface, row] of [
      ['base 详情', detailBase],
      ['enhanced 明细腿', detailEnhanced.head],
      ['base 列表', myList[0]],
      ['enhanced 列表', myResult[0]],
    ] as const) {
      expectClosingIdentity(row, surface);
      eqAmount(
        row.total_invoices,
        toScaled(detailBase.total_invoices, 2, '基准发票合计'),
        `${surface} 发票合计分位`
      );
    }
    // 本次素材必须真的进了这行的明细（跨面一致的金额非零对照）
    const moneyDetails = await readReconDetails(page, moneyId);
    expect(
      moneyDetails.details.some(r => Number(r.document_id) === inv.id),
      '新发票必须进入含金额对账单的明细'
    ).toBe(true);
    expectHeadMatchesDetails(moneyDetails.head, moneyDetails.details, '跨面基准');

    // 会话 1（本 worker 管理员）发送 → 会话 2（重新走一次完整登录，独立 token）确认 → 会话 1 读回
    await apiCall(page, 'POST', `/ar-reconciliations/${moneyId}/send`);
    const afterSend = await readRecon(page, moneyId);
    expect(afterSend.reconciliation_status, '会话 1 发送后 sent').toBe('sent');

    await loginViaUI(page, testUsername(), testPassword(), true);
    const session2 = await readRecon(page, moneyId);
    expect(
      String(session2.reconciliation_status),
      '会话 2 必须看到会话 1 的写入（非会话缓存）'
    ).toBe('sent');
    for (const key of cmpKeys) {
      expect(String(session2[key]), `会话 2 读回 ${key} 与会话 1 一致`).toBe(
        String(afterSend[key])
      );
    }
    await apiCall(page, 'POST', `/ar-reconciliations/${moneyId}/confirm`);

    await loginViaUI(page, testUsername(), testPassword(), true);
    const backToSession1 = await readRecon(page, moneyId);
    expect(backToSession1.reconciliation_status, '会话 2 的确认对会话 1 可见').toBe('confirmed');
    eqAmount(
      backToSession1.closing_balance,
      toScaled(detailBase.closing_balance, 2, '原始期末'),
      '状态流转不得改动期末余额（会话间金额一致）'
    );
    const session1Details = await readReconDetails(page, moneyId);
    expect(String(session1Details.head.confirmed_by_customer), '客户确认标记跨面可读').toBe('true');
    expect(session1Details.head.reconciliation_status, '跨面状态一致').toBe('confirmed');

    // 另一角色的 token 在同一行上必须被归属门拒掉，而不是读到部分字段（与 442-04 同判据的写侧延伸）
    await loginAsRole(page, 'finance_manager');
    const fForeign = await apiCallExpectFail(page, 'POST', `/ar-reconciliations/${moneyId}/send`);
    expect(fForeign.status, '他人客户的对账单不得被外岗会话写入').toBe(403);
    expect(failureCode(fForeign), '外岗写腿机器码 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
    const fForeignList = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar-reconciliations?customer_id=${ctx.customerId}&page=1&page_size=100`
    );
    const foreignRows = pickListArray<Row>(fForeignList, 'items', '外岗会话列表').filter(
      r => Number(r.id) === moneyId
    );
    expect(
      foreignRows.length,
      '外岗会话的列表不得出现他人客户的行（越权行既不进 items 也不进 total）'
    ).toBe(0);

    await loginViaUI(page, testUsername(), testPassword(), true);
    const untouched = await readRecon(page, id);
    expect(untouched.reconciliation_status, '同批另一行状态未被牵连').toBe('draft');
  });
});
