// 小程序跨客户行级零可见防回退 — payments / reconciliations / color-cards 三面
// 功能：绑定 customer 账号经门户读面（/customer-portal/*）只能看到 users.customer_id
//       绑定客户的行。三面各造双客户数据（收款 ar_collections、应收对账单
//       ar_reconciliations、色卡发放 color_card_issues status=issued），断言：
//       1) 全量列表 page_size=100 不含他户行、含本户行；
//       2) 按他户单号/卡名关键字过滤恒 0 行（付款面 payment_no、色卡面 keyword）；
//       3) 三面响应递归键不含 FORBIDDEN_KEYS（520 口径：审批链/内部人员/银行账号）。
//       products 面不在此列：handlers/customer_portal.rs list_portal_products 不带
//       customer 过滤（商品档案全局共享，行级"跨客户零可见"对其不适用），其脱敏由
//       520 的 FORBIDDEN_KEYS 全面断言覆盖，本 spec 不重复。
// 调用方：Playwright 分片（frontend/playwright.config.ts），与 flow 其它用例共享后端账号池。
// 入参：无测试参数；前置由管理员会话造双客户 + 双收款 + 双对账单 + 双色卡发放。
// 传给谁：apiCallRaw/apiCallExpectFail 走统一信封与 CSRF 恢复 helper。
// 存什么：列表归属、过滤 0 行、键集合断言；不落库。
// 存哪里：Actions 日志与 Playwright 报告。
import { test, expect } from '../diagnose-fixture';
import {
  apiCallRaw,
  ensureTestEntities,
  genCode,
  loginInIsolatedContext,
  seedColorCardArchive,
  testPassword,
} from './helpers';

type Row = Record<string, unknown>;
type Page = Parameters<typeof apiCallRaw>[0];

interface PortalList<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// 520 口径：门户白名单外的内部/成本字段，出现在任何门户响应即判红
const FORBIDDEN_KEYS = [
  'approval_reason',
  'rejected_reason',
  'approved_by',
  'reject_reason',
  'created_by',
  'creator_name',
  'dept_id',
  'bank_account',
  'check_no',
  'confirmed_by',
  'cost_price',
  'purchase_price',
  'gross_profit',
  'profit_margin',
];

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, out);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
}

function expectNoForbiddenKeys(payload: unknown, label: string): void {
  const keys = new Set<string>();
  collectKeys(payload, keys);
  for (const key of FORBIDDEN_KEYS) {
    expect(keys.has(key), `${label} 响应体不得含 ${key}`).toBe(false);
  }
}

function positiveId(id: unknown, subject: string): number {
  const num = Number(id);
  expect(Number.isSafeInteger(num) && num > 0, `${subject} 应返回正整数 id`).toBe(true);
  return num;
}

async function findRoleId(admin: Page, code: string): Promise<number> {
  const resp = await apiCallRaw<{ roles?: Array<Row & { code?: string }> }>(
    admin,
    'GET',
    '/roles?page=1&page_size=100'
  );
  expect(Array.isArray(resp.roles), '角色列表必须返回 data.roles').toBe(true);
  const hit = resp.roles!.find(r => r.code === code);
  expect(hit, `${code} 角色应存在——后端种子或 global-setup 幂等补建`).toBeTruthy();
  return positiveId(hit?.id, `${code} 角色行`);
}

async function listAll(page: Page, path: string): Promise<PortalList<Row>> {
  const resp = await apiCallRaw<PortalList<Row>>(page, 'GET', `${path}?page=1&page_size=100`);
  expect(Array.isArray(resp.items), `${path} 全量列表应返回 items 数组`).toBe(true);
  return resp;
}

/** 建卡 → 补库存（建卡 stock_quantity=0，色卡词表 draft 直入发放）→ 发放给指定客户 */
async function issueCardTo(
  admin: Page,
  customerId: number,
  context: string
): Promise<{ cardId: number; colorCode: string; cardName: string }> {
  const seed = await seedColorCardArchive(admin, { context });
  const cardName = `E2E 档案前置色卡 ${seed.colorCode}`;
  await apiCallRaw(admin, 'PUT', `/color-cards/${seed.cardId}`, { stock_quantity: 10 });
  const issue = await apiCallRaw<Row>(admin, 'POST', '/color-cards/issues', {
    color_card_id: seed.cardId,
    customer_id: customerId,
    issue_qty: 1,
    purpose: `跨客户零可见回归 ${context}`,
  });
  positiveId(issue.id, `色卡发放记录建档（${context}）`);
  return { cardId: seed.cardId, colorCode: seed.colorCode, cardName };
}

test.describe.serial('580 跨客户行级零可见防回退', () => {
  const tagA = genCode('580A');
  const tagB = genCode('580B');
  const boundUsername = genCode('mp580bound');
  const sessions: Awaited<ReturnType<typeof loginInIsolatedContext>>[] = [];
  let customerIdA = 0;
  let customerNameA = '';
  let paymentNoA = '';
  let paymentNoB = '';
  let reconNoA = '';
  let reconNoB = '';
  let cardNameA = '';
  let cardNameB = '';

  test('造数：双客户 + 双收款 + 双对账单 + 双色卡发放', async ({ page, browser }) => {
    await ensureTestEntities(page);
    const createdA = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `零可见客户A${tagA}`,
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '1000',
    });
    customerIdA = positiveId(createdA.id, '零可见客户A建档');
    customerNameA = String(createdA.customer_name ?? '');
    const createdB = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `零可见客户B${tagB}`,
      customer_type: 'wholesale',
      status: 'active',
      credit_limit: '1000',
    });
    const customerIdB = positiveId(createdB.id, '零可见客户B建档');

    // 收款面：POST /ar/payments（ar_collections.customer_id，门户面逐字段白名单出参）
    const today = new Date().toISOString().slice(0, 10);
    const payA = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
      customer_id: customerIdA,
      amount: '120.50',
      payment_method: '银行转账',
      payment_date: today,
      remark: `零可见收款A ${tagA}`,
    });
    paymentNoA = String(payA.collection_no ?? '');
    expect(paymentNoA.length > 0, '客户A收款建档应返回 collection_no').toBe(true);
    const payB = await apiCallRaw<Row>(page, 'POST', '/ar/payments', {
      customer_id: customerIdB,
      amount: '220.50',
      payment_method: '银行转账',
      payment_date: today,
      remark: `零可见收款B ${tagB}`,
    });
    paymentNoB = String(payB.collection_no ?? '');
    expect(paymentNoB.length > 0, '客户B收款建档应返回 collection_no').toBe(true);

    // 对账单面：POST /ar-reconciliations（ar_reconciliations.customer_id）
    const monthStart = `${today.slice(0, 7)}-01`;
    const reconA = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: genCode('580RECA'),
      customer_id: customerIdA,
      customer_name: customerNameA,
      period_start: monthStart,
      period_end: today,
      opening_balance: '0',
      total_invoices: '120.50',
      total_collections: '120.50',
    });
    reconNoA = String(reconA.reconciliation_no ?? '');
    expect(reconNoA.length > 0, '客户A对账单建档应返回 reconciliation_no').toBe(true);
    const reconB = await apiCallRaw<Row>(page, 'POST', '/ar-reconciliations', {
      reconciliation_no: genCode('580RECB'),
      customer_id: customerIdB,
      period_start: monthStart,
      period_end: today,
      opening_balance: '0',
      total_invoices: '220.50',
      total_collections: '220.50',
    });
    reconNoB = String(reconB.reconciliation_no ?? '');
    expect(reconNoB.length > 0, '客户B对账单建档应返回 reconciliation_no').toBe(true);

    // 色卡面：双色卡各发一户（同卡发两户会让两户都能看见该卡，无法证明隔离）
    cardNameA = (await issueCardTo(page, customerIdA, tagA)).cardName;
    cardNameB = (await issueCardTo(page, customerIdB, tagB)).cardName;
    expect(cardNameA !== cardNameB, '两户色卡档案必须互异').toBe(true);

    // 绑定 customer 只绑 A：B 的行对 A 会话必须全部不可见
    const customerRoleId = await findRoleId(page, 'customer');
    const user = await apiCallRaw<Row>(page, 'POST', '/users', {
      username: boundUsername,
      password: testPassword(),
      role_id: customerRoleId,
      customer_id: customerIdA,
    });
    expect(Number(user.customer_id), '绑定归属写口回读').toBe(customerIdA);
    sessions.push(await loginInIsolatedContext(browser, boundUsername, testPassword()));
  });

  test('收款面：本户行可见，他户行全量与按单号过滤均零可见', async () => {
    const session = sessions[0];
    const all = await listAll(session.page, '/customer-portal/payments');
    expectNoForbiddenKeys(all, '门户收款列表');
    const nos = all.items.map(item => String(item.collection_no ?? ''));
    expect(nos).toContain(paymentNoA);
    expect(nos, '全量列表不得出现他户收款单号').not.toContain(paymentNoB);
    expect(
      all.items.every(item => Number(item.customer_id) === customerIdA),
      '每一行 customer_id 都必须等于绑定值'
    ).toBe(true);

    const filtered = await apiCallRaw<PortalList<Row>>(
      session.page,
      'GET',
      `/customer-portal/payments?payment_no=${encodeURIComponent(paymentNoB)}`
    );
    expect(filtered.total, '按他户收款单号过滤必须 0 行').toBe(0);
    const own = await apiCallRaw<PortalList<Row>>(
      session.page,
      'GET',
      `/customer-portal/payments?payment_no=${encodeURIComponent(paymentNoA)}`
    );
    expect(own.total, '按本户收款单号过滤必须命中（过滤链路活性哨兵）').toBe(1);
  });

  test('对账单面：本户行可见，他户行全量零可见', async () => {
    const session = sessions[0];
    const all = await listAll(session.page, '/customer-portal/reconciliations');
    expectNoForbiddenKeys(all, '门户对账单列表');
    const nos = all.items.map(item => String(item.reconciliation_no ?? ''));
    expect(nos).toContain(reconNoA);
    expect(nos, '全量列表不得出现他户对账单号').not.toContain(reconNoB);
    expect(
      all.items.every(item => Number(item.customer_id) === customerIdA),
      '每一行 customer_id 都必须等于绑定值'
    ).toBe(true);

    // 对账单面查询无单号过滤字段（PortalReconciliationListQuery 只有 status/日期），
    // 他户隔离以全量扫描排除为判据（与 520 订单全量断言同型）
    const hisPeriod = await apiCallRaw<PortalList<Row>>(
      session.page,
      'GET',
      '/customer-portal/reconciliations?start_date=2000-01-01&end_date=2999-12-31'
    );
    const wideNos = hisPeriod.items.map(item => String(item.reconciliation_no ?? ''));
    expect(wideNos, '全期窗过滤亦不得出现他户对账单').not.toContain(reconNoB);
    expect(wideNos, '全期窗过滤必须保留本户行（过滤链路活性哨兵）').toContain(reconNoA);
  });

  test('色卡面：本户发放卡可见，他户卡全量与按关键字过滤均零可见', async () => {
    const session = sessions[0];
    const all = await listAll(session.page, '/customer-portal/color-cards');
    expectNoForbiddenKeys(all, '门户色卡列表');
    const names = all.items.map(item => String(item.card_name ?? ''));
    expect(names).toContain(cardNameA);
    expect(names, '全量列表不得出现他户色卡').not.toContain(cardNameB);

    const filtered = await apiCallRaw<PortalList<Row>>(
      session.page,
      'GET',
      `/customer-portal/color-cards?keyword=${encodeURIComponent(tagB)}`
    );
    expect(filtered.total, '按他户卡名关键字过滤必须 0 行').toBe(0);
    const own = await apiCallRaw<PortalList<Row>>(
      session.page,
      'GET',
      `/customer-portal/color-cards?keyword=${encodeURIComponent(tagA)}`
    );
    expect(own.total, '按本户卡名关键字过滤必须命中（过滤链路活性哨兵）').toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    for (const session of sessions) {
      await session.close();
    }
  });
});
