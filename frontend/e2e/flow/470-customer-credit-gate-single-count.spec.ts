// 本文件锁定 D-49：信用额度门在任何环境无条件生效，以及同一笔金额只被占用一次（不再双重计数）。
// 五枚用例打真腿：建单侧门控（超额拒/额度内放）、提交占用唯一性（读回 used_credit 精确等于
// 本单金额而非两倍）、取消释放、拒绝释放。断言响应键名以 CustomerCreditView/DTO 的 snake_case 为准；
// 状态词值与 backend/src/models/status/sales.rs sales_order 模块逐字符同源（小写）。
// 金额由后端序列化为 DECIMAL(10,2) 字符串，本项目未开 serde-with-float。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';

type Row = Record<string, unknown>;

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：未返回有效 id，raw=${JSON.stringify(v)}`);
  return n;
}

/**
 * 将后端序列化的 DECIMAL(10,2) 字符串转为整数分（×100 去小数点），
 * 供精确比较；禁止用浮点除法。
 */
function cents(v: unknown, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s === '')
    throw new Error(
      `${label}：DECIMAL(10,2) 出参必须是字符串，实际类型=${typeof v} raw=${JSON.stringify(v)}`
    );
  const m = /^(-?)(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) throw new Error(`${label}：DECIMAL 字符串形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  const padded = (intPart + frac).padEnd(intPart.length + 2, '0').slice(0, intPart.length + 2);
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 失败信封基础校验：400 + 字符串 code + 非空 message + trace_id + timestamp */
function expectAppError(res: import('./helpers').ApiFailureResult, label: string): void {
  expect(res.status, `${label}：应回 HTTP 400，实际 ${res.status}`).toBe(400);
  const code = failureCode(res);
  expect(typeof code, `${label}：机器码为字符串`).toBe('string');
  expect((res.message ?? '').trim().length, `${label}：拒绝文案非空`).toBeGreaterThan(0);
  expect(typeof res.trace_id, `${label}：trace_id 存在`).toBe('string');
}

/** 读回客户信用视图 */
async function readCredit(page: import('@playwright/test').Page, customerId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/crm/customers/${customerId}/credit`);
}

/** 建一个独占客户并返回 id */
async function seedCustomer(page: import('@playwright/test').Page): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E2E-D49-信用门客户 ${genCode('C')}`,
    status: 'active',
  });
  const id = requireId(created.id, '建客户');
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `customer#${id}` });
  return id;
}

/**
 * 为客户设定信用额度。
 * POST /crm/customer-credits（body 带 customer_id）。
 */
async function seedCreditRating(
  page: import('@playwright/test').Page,
  customerId: number,
  creditLimit: string
): Promise<void> {
  await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
    customer_id: customerId,
    credit_level: 'E2E-D49',
    credit_limit: creditLimit,
    credit_days: 30,
  });
  CLEANUP.push({ path: `/crm/customer-credits/${customerId}`, label: `credit#${customerId}` });
}

/**
 * 建一张挂指定客户的销售订单（单行），返回 {id, status, total_amount}。
 * 传入金额参数使 total_amount 精确可控。
 */
async function seedOrder(
  page: import('@playwright/test').Page,
  args: { customerId: number; productId: number; quantity: string; unitPrice: string }
): Promise<{ id: number; status: string; totalAmount: string }> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: args.customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: args.productId,
        quantity: args.quantity,
        unit_price: args.unitPrice,
        tax_percent: '0',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E2E-D49-${genCode('S')}`,
  });
  const id = requireId(created.id, '建订单');
  CLEANUP.push({ path: `/sales/orders/${id}`, label: `so#${id}` });
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  return {
    id,
    status: String(detail.status),
    totalAmount: String(detail.total_amount),
  };
}

test.describe('470 信用额度门无条件生效且占用口径唯一', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('470-01 额度内建单并提交成功，used_credit 精确等于本单金额（非两倍）', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：productIds 为空');
    const customerId = await seedCustomer(page);
    // 额度 1000.00，下 500.00 的订单，应放行
    await seedCreditRating(page, customerId, '1000.00');

    const order = await seedOrder(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '5',
      unitPrice: '100.00',
    });
    expect(order.status, '新单起点 draft').toBe('draft');
    const orderCents = cents(order.totalAmount, 'order total_amount');
    expect(orderCents, '订单含税总额 500.00').toBe(50000n);

    // 提交
    const submitted = await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/submit`);
    expect(String(submitted.status), '提交后进入 pending').toBe('pending');

    // 读回信用视图：used_credit 应精确等于 500.00（只占用一次，不是 1000.00）
    const credit = await readCredit(page, customerId);
    const used = cents(credit.used_credit, 'used_credit');
    expect(used, '占用金额等于本单金额（非两倍）').toBe(50000n);
    const avail = cents(credit.available_credit, 'available_credit');
    expect(avail, '可用额度 = 总额度 - 占用').toBe(50000n);
  });

  test('470-02 超额度建单被拒（门在任何环境生效）', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：productIds 为空');
    const customerId = await seedCustomer(page);
    // 额度 10.00，下 500.00 的订单，建单即应被拦
    await seedCreditRating(page, customerId, '10.00');

    const fail = await apiCallExpectFail(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      items: [
        {
          product_id: ctx.productIds[0],
          quantity: '5',
          unit_price: '100.00',
          tax_percent: '0',
          quantity_tolerance_pct: '0',
        },
      ],
      notes: `E2E-D49-超额建单-${genCode('S')}`,
    });
    expectAppError(fail, '超额建单');
    expect(failureCode(fail), '机器码 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(String(fail.message), '拒绝文案点名信用不足').toContain('信用额度不足');
  });

  test('470-03 超额度提交被拒且原因可断言', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：productIds 为空');
    const customerId = await seedCustomer(page);
    // 额度 1000，先建两张单（建单侧门只查可用额度，尚未占用），再提交第一张占 900
    await seedCreditRating(page, customerId, '1000.00');

    const block = await seedOrder(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '9',
      unitPrice: '100.00',
    });
    const over = await seedOrder(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '2',
      unitPrice: '100.00',
    });
    // 提交第一张占住 900，使第二张提交时可用额度不足
    await apiCallRaw<Row>(page, 'POST', `/sales/orders/${block.id}/submit`);
    const fail = await apiCallExpectFail(page, 'POST', `/sales/orders/${over.id}/submit`);
    expectAppError(fail, '超额提交');
    expect(failureCode(fail), '机器码 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(String(fail.message), '拒绝文案含信用额度不足').toContain('信用额度不足');

    // 被拒后订单仍为 draft
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${over.id}`);
    expect(String(detail.status), '被拒后仍 draft').toBe('draft');
  });

  test('470-04 取消已提交的订单后信用占用完全释放', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：productIds 为空');
    const customerId = await seedCustomer(page);
    await seedCreditRating(page, customerId, '2000.00');

    const order = await seedOrder(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '6',
      unitPrice: '100.00',
    });
    // 提交 → 占用 600
    await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/submit`);
    const mid = await readCredit(page, customerId);
    expect(cents(mid.used_credit, '提交后 used_credit'), '提交后占用 600').toBe(60000n);

    // 取消 → 释放
    await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/cancel`);
    const after = await readCredit(page, customerId);
    expect(cents(after.used_credit, '取消后 used_credit'), '取消后占用归零').toBe(0n);
    expect(cents(after.available_credit, '取消后 available_credit'), '取消后可用恢复').toBe(
      200000n
    );

    // 清理：已取消的订单无需再 DELETE（CLEANUP 会尝试，tryCleanup 容错）
  });

  test('470-05 拒绝待审批订单后信用占用完全释放', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：productIds 为空');
    const customerId = await seedCustomer(page);
    await seedCreditRating(page, customerId, '1500.00');

    const order = await seedOrder(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '7',
      unitPrice: '100.00',
    });
    // 提交 → 占用 700
    await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/submit`);
    const mid = await readCredit(page, customerId);
    expect(cents(mid.used_credit, '提交后 used_credit'), '提交后占用 700').toBe(70000n);

    // 拒绝 → 释放
    await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/reject`, {
      reason: 'E2E-D49 拒绝释放验证',
    });
    const after = await readCredit(page, customerId);
    expect(cents(after.used_credit, '拒绝后 used_credit'), '拒绝后占用归零').toBe(0n);
    expect(cents(after.available_credit, '拒绝后 available_credit'), '拒绝后可用恢复').toBe(
      150000n
    );

    // 验证订单进入 rejected 状态
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    expect(String(detail.status), '拒绝后状态为 rejected').toBe('rejected');
  });
});
