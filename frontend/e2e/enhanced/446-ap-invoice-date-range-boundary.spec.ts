// 4.14 日期区间筛选 + 4.30 跨年边界：应付单列表 start_date/end_date 闭区间。
// 后端判据：handlers/ap_invoice_handler.rs:29-37 收 start_date/end_date（NaiveDate），
//   :55-68 下推 get_list，:72-75 出参 PaginatedResponse{items,total,page,page_size}；
//   services/ap_invoice_ops/crud.rs:485-490 用 gte(start_date)/lte(end_date) 闭区间，
//   :494 按 created_at 倒序。出参列 models/ap_invoice.rs:27(id)、:34(supplier_id)、
//   :47(invoice_date)。建单 POST /ap/invoices（routes/finance.rs:637-638），
//   六必填 supplier_id/invoice_type/invoice_date/due_date/amount/tax_amount
//   （services/ap_invoice_ops/types.rs:24-70），返回整行含 id（handler:122-125）。
// 用例意图：建 2025-12-31 与 2026-01-01 两张应付单，用同一日期作起止的「同日区间」
//   只命中首票，跨年区间两票均命中，区间外的第三票恒不命中——钉住端点包含与
//   跨年归属。if 后端误用开区间或漏掉其中一端，同日区间会漏命中即红。
// 与既有覆盖分工：160 只验 AP 建单余额/账龄报表，461 只按 supplier_id 取整族
//   不按日期筛，15-report-export 只验 xlsx；无任何 spec 用 start_date/end_date 查询。
// 检测力：闭区间漏一端则同日区间命中数不足；起止颠倒成 OR 则区间外票混入即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCallRaw,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface ApInvoiceRow {
  id: number;
  supplier_id?: number;
  invoice_date?: string;
  notes?: string;
}

interface ApPaged {
  items?: ApInvoiceRow[];
  total?: number;
  page?: number;
  page_size?: number;
}

const DAY_BEFORE = '2025-12-31';
const DAY_AFTER = '2026-01-01';
const DAY_OUT = '2026-06-15';

async function seedInvoice(
  page: Page,
  supplierId: number,
  invoiceDate: string,
  tag: string
): Promise<number> {
  const notes = `${tag}-${invoiceDate}-${genCode('AP')}`;
  const created = await apiCallRaw<{ id?: number }>(page, 'POST', '/ap/invoices', {
    supplier_id: supplierId,
    invoice_type: 'PURCHASE',
    invoice_date: invoiceDate,
    due_date: invoiceDate,
    amount: '1000.00',
    tax_amount: '0',
    payment_terms: 0,
    currency: 'CNY',
    exchange_rate: '1',
    notes,
  });
  const id = Number(created.id);
  expect(
    id,
    `[446] 建应付单（${invoiceDate}）须返回正整数主键，实际 ${JSON.stringify(created)}`
  ).toBeGreaterThan(0);
  return id;
}

async function readRange(
  page: Page,
  supplierId: number,
  start: string,
  end: string
): Promise<ApInvoiceRow[]> {
  const path = `/ap/invoices?supplier_id=${supplierId}&start_date=${start}&end_date=${end}&page=1&page_size=100`;
  const data = await apiCallRaw<ApPaged>(page, 'GET', path);
  expect(
    Array.isArray(data.items),
    `[446] 应付单列表缺 items 数组，实际 ${JSON.stringify(data)}`
  ).toBe(true);
  expect(
    typeof data.total === 'number' &&
      typeof data.page === 'number' &&
      typeof data.page_size === 'number',
    `[446] 分页信封 total/page/page_size 须为数字，实际 ${JSON.stringify(data)}`
  ).toBe(true);
  return data.items!;
}

function hasId(rows: ApInvoiceRow[], id: number): boolean {
  return rows.some(r => r.id === id);
}

test('446-01 应付单列表日期区间闭区间：同日只命中本日、跨年均命中、区间外不命中', async ({
  page,
}) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (!ctx.supplierId) throw new Error('[446] 前置缺失：ctx.supplierId 未就绪');

  const ids: number[] = [];
  try {
    const beforeId = await seedInvoice(page, ctx.supplierId, DAY_BEFORE, '446-cross-year-before');
    ids.push(beforeId);
    const afterId = await seedInvoice(page, ctx.supplierId, DAY_AFTER, '446-cross-year-after');
    ids.push(afterId);
    const outId = await seedInvoice(page, ctx.supplierId, DAY_OUT, '446-out-of-range');
    ids.push(outId);

    // 同日闭区间：起止同为 2025-12-31，只应命中前票。
    const sameDay = await readRange(page, ctx.supplierId, DAY_BEFORE, DAY_BEFORE);
    expect(
      hasId(sameDay, beforeId),
      `[446] 同日区间 start=end=${DAY_BEFORE} 应含端点当日应付单 id=${beforeId}`
    ).toBe(true);
    expect(
      hasId(sameDay, afterId),
      `[446] 同日区间 ${DAY_BEFORE} 不应含次日应付单 id=${afterId}`
    ).toBe(false);
    expect(
      hasId(sameDay, outId),
      `[446] 同日区间 ${DAY_BEFORE} 不应含区间外应付单 id=${outId}`
    ).toBe(false);

    // 跨年闭区间：12-31 至 01-01 两端都含，区间外仍排除。
    const crossYear = await readRange(page, ctx.supplierId, DAY_BEFORE, DAY_AFTER);
    expect(
      hasId(crossYear, beforeId) && hasId(crossYear, afterId),
      `[446] 跨年区间 ${DAY_BEFORE}~${DAY_AFTER} 应同时含两端应付单，实际 ${JSON.stringify(crossYear.map(r => r.id))}`
    ).toBe(true);
    expect(hasId(crossYear, outId), `[446] 跨年区间不应含区间外应付单 id=${outId}`).toBe(false);

    // 另一端的同日闭区间：2026-01-01 只命中后票，反向证明端点包含时区间归属不串。
    const afterDay = await readRange(page, ctx.supplierId, DAY_AFTER, DAY_AFTER);
    expect(
      hasId(afterDay, afterId),
      `[446] 同日区间 ${DAY_AFTER} 应含端点当日应付单 id=${afterId}`
    ).toBe(true);
    expect(
      hasId(afterDay, beforeId),
      `[446] 同日区间 ${DAY_AFTER} 不应含前一日应付单 id=${beforeId}`
    ).toBe(false);
  } finally {
    for (const id of ids) {
      await tryCleanup(page, 'DELETE', `/ap/invoices/${id}`, `446 应付单 ${id}`);
    }
  }
});
