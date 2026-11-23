/**
 * 功能：锁定「AR 统计汇总 ↔ 逐单明细累加」同源互证，杜绝报表聚合与明细漂移。
 *
 * 六要素：
 * - 调用方：本 spec 自建专属客户（statistics 的 60 秒缓存键含 customer_id，专属键免被共享造数污染），
 *   建五张应收单：三张草稿后审批入账（其一到期日已过构成逾期）、一张停留草稿、一张审批后取消。
 * - 入参：金额 200.00 / 350.75 / 88.20（逾期单）/ 99.99（草稿）/ 60.00（取消），手工建单口径，
 *   到期日一张取昨日（逾期）、其余取 30 天后。
 * - 传给谁：POST /crm/customers、/ar/invoices、/ar/invoices/{id}/approve|cancel；
 *   GET /ar/reports/statistics?customer_id=、/ar/invoices?customer_id= 逐页。
 * - 存什么：统计由 ar_ops/report.rs:75-112 参数化 SQL 聚合——排除 status IN (CANCELLED,DRAFT)、
 *   按 invoice_date 界定期间、逾期口径为 due_date<今天且 unpaid>0；响应键
 *   total_invoices/total_amount/paid_amount/unpaid_amount/overdue_count/overdue_amount/collection_rate。
 * - 断言什么：逐页明细累加（排除 DRAFT/CANCELLED，与 SQL 排除集合逐字同源）与统计六口逐分相等；
 *   逾期单数与逾期额只含昨日到期那张；发票明细侧 paid+unpaid==amount；全部 BigInt 分位比较。
 * - 前置：ctx 基础实体就绪；只做同源互证，不做「端点返回 200」的假绿断言。
 * - 不重复：既有 AR 用例钉发货自动应收与收款链，本例首次钉统计出口与明细的口径一致性。
 */
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  apiCallRaw,
  ensureTestEntities,
  genCode,
  genName,
  getCtx,
  loginViaUI,
  pickListArray,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

/** 两位小数定标：Decimal 出参转 BigInt 分位，标度外尾数非零直接抛错（静默截断即假绿）。 */
function toCents(v: unknown, label: string): bigint {
  const raw = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  const m = /^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(raw);
  if (!m) throw new Error(`[651] ${label} Decimal 出参形态非法：${JSON.stringify(v)}`);
  const [, sign, int, frac = ''] = m;
  if (frac.length > 2 && frac.slice(2).replace(/0+$/, '') !== '') {
    throw new Error(`[651] ${label} 标度超过 2 位且尾数非零：${raw}`);
  }
  const cents = BigInt(int) * 100n + BigInt((frac + '00').slice(0, 2));
  return sign === '-' ? -cents : cents;
}

function requireId(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(Number.isFinite(n) && n > 0, `[651] ${label} 须返回正整数 id，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function readAllInvoices(page: Page, customerId: number): Promise<Row[]> {
  const first = await apiCallRaw<{ items?: Row[]; total?: number }>(
    page,
    'GET',
    `/ar/invoices?customer_id=${customerId}&page=1&page_size=100`
  );
  const total = requireId(first.total, '应收列表 total');
  const rows = pickListArray({ items: first.items }, 'items', '[651] 应收首页');
  for (let p = 2; rows.length < total; p++) {
    const more = await apiCallRaw<{ items?: Row[] }>(
      page,
      'GET',
      `/ar/invoices?customer_id=${customerId}&page=${p}&page_size=100`
    );
    rows.push(...pickListArray({ items: more.items }, 'items', `[651] 应收第 ${p} 页`));
  }
  expect(rows.length, '[651] 逐页应收行数必须等于 total').toBe(total);
  return rows;
}

test.describe('651 AR 统计↔逐单互证', () => {
  test('651-1 统计六口与逐页明细累加逐分相等', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const tag = genCode('651');
    if (!ctx.warehouseIds[0]) throw new Error('[651] 前置缺失：ctx.warehouseIds[0] 未就绪');

    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: genName(`651统计客户${tag}`),
      contact_person: '651对账员',
      contact_phone: '{{PHONE_x7qh4sbk}}',
      credit_limit: '10000',
      payment_terms: 30,
      status: 'active',
    });
    const customerId = requireId(customer.id, '专属客户');
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `[651] 客户#${customerId}` });

    async function seedInvoice(amount: string, dueDate: string, notes: string): Promise<number> {
      const inv = await apiCallRaw<Row>(page, 'POST', '/ar/invoices', {
        customer_id: customerId,
        invoice_amount: amount,
        invoice_date: dateOffset(0),
        due_date: dueDate,
        notes,
      });
      const id = requireId(inv.id, `应收单 ${notes}`);
      CLEANUP.push({ path: `/ar/invoices/${id}`, label: `[651] 应收#${id}` });
      return id;
    }

    const invOverdue = await seedInvoice('88.20', dateOffset(-1), `E2E-651-OVERDUE-${tag}`);
    const invOpen = await seedInvoice('200.00', dateOffset(30), `E2E-651-OPEN-${tag}`);
    const invThird = await seedInvoice('350.75', dateOffset(30), `E2E-651-THIRD-${tag}`);
    for (const id of [invOverdue, invOpen, invThird]) {
      await apiCallRaw(page, 'POST', `/ar/invoices/${id}/approve`, {});
    }
    const invDraft = await seedInvoice('99.99', dateOffset(30), `E2E-651-DRAFT-${tag}`);
    expect(String((await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${invDraft}`)).status),
      '[651] 草稿单状态词值').toBe('DRAFT');
    const invCancel = await seedInvoice('60.00', dateOffset(30), `E2E-651-CANCEL-${tag}`);
    await apiCallRaw(page, 'POST', `/ar/invoices/${invCancel}/approve`, {});
    await apiCallRaw(page, 'POST', `/ar/invoices/${invCancel}/cancel`, { reason: 'E2E-651 统计排除口径' });

    // 口一：逐页明细累加，排除集合与 SQL 的 status NOT IN (CANCELLED,DRAFT) 逐字同源。
    const invoices = await readAllInvoices(page, customerId);
    const counted = invoices.filter(
      r => String(r.status) !== 'DRAFT' && String(r.status) !== 'CANCELLED'
    );
    expect(counted.length, '[651] 计入口径应收张数').toBe(3);
    const sumAmount = counted.reduce((acc, r) => acc + toCents(r.invoice_amount, 'invoice_amount'), 0n);
    const sumPaid = counted.reduce((acc, r) => acc + toCents(r.received_amount, 'received_amount'), 0n);
    const sumUnpaid = counted.reduce((acc, r) => acc + toCents(r.unpaid_amount, 'unpaid_amount'), 0n);
    expect(sumPaid + sumUnpaid - sumAmount, '[651] 已收+未收==应收（明细侧）').toBe(0n);

    // 口二：统计出口六口与明细侧逐分相等（含逾期单数与逾期额只含昨日到期单）。
    const stats = await apiCallRaw<Row>(
      page,
      'GET',
      `/ar/reports/statistics?customer_id=${customerId}`
    );
    expect(requireId(stats.total_invoices, 'total_invoices'), '[651] 统计张数==明细张数').toBe(counted.length);
    expect(toCents(stats.total_amount, 'total_amount'), '[651] 统计应收额==明细累加').toBe(sumAmount);
    expect(toCents(stats.paid_amount, 'paid_amount'), '[651] 统计已收额==明细累加').toBe(sumPaid);
    expect(toCents(stats.unpaid_amount, 'unpaid_amount'), '[651] 统计未收额==明细累加').toBe(sumUnpaid);
    expect(requireId(stats.overdue_count, 'overdue_count'), '[651] 逾期单数').toBe(1);
    expect(
      toCents(stats.overdue_amount, 'overdue_amount'),
      '[651] 逾期额==昨日到期单未收额'
    ).toBe(toCents((await apiCallRaw<Row>(page, 'GET', `/ar/invoices/${invOverdue}`)).unpaid_amount, '逾期单 unpaid'));
    expect(
      sumAmount - sumPaid - sumUnpaid,
      '[651] 三额差额分位为 0'
    ).toBe(0n);
  });
});
