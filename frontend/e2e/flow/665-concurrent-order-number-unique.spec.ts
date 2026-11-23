// N 路并发创建采购单的单号唯一与当日号段连续（接口级真实落库用例）。
//
// 功能，覆盖并发与多端一致性中「并发取号不重复不跳号」的判据。N 路真并发
// POST /purchase/orders，断言每路都成功、单号两两不同、逐单 GET 读回恰一张，
// 且新号在本用例自建的当日基线最大号之上严格连续（MAX+1 探测 + UNIQUE 兜底
// 无跳号）。取号实现在 number_generator.rs:255-300：pg_advisory_xact_lock
// 同前缀同日串行取号，insert_with_no_retry 对 23505 做保存点重试；PO 前缀
// 由 po/order_ops/crud.rs 的 generate_order_no_with_txn 固定为 "PO"。
// 与 498 的分工：498 只覆盖 SO 前缀并发建单号唯一（且不断连续），本例走 PO
// 前缀并加基线连续判据，补住采购侧并发取号无跳号的空白。
// 调用方，frontend e2e flow 分片；打真实端点 POST /purchase/orders 与
// GET /purchase/orders/{id}，不 mock 响应，不读生成器内部状态。
// 入参，登录态与供应商/仓库/部门/产品由 worker fixture 与 ensureTestEntities
// 提供；先串行建一张基线单读出当日基线最大流水，再并发建 N 张，全部草稿单按 id
// 清理，避免污染共享当日号段。
// 传给谁，断言结果只进 Playwright 报告；N 路响应全部保留判读，任一路被误拒或
// 号段跳号、重复都判红。
// 存什么，purchase_orders 的 order_no/id 真实列值；号格式为 PO+YYYYMMDD+流水，
// 各路流水须等于基线+1、基线+2……严格连续，重复或跳号在此判据下必红。
// 存哪里，以上表均在测试库本体；本用例自建的基线单与 N 张草稿单收尾按 id 显式
// DELETE，逐单读回确认删后 404，不伪造审计链。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, ensureTestEntities, genCode, getCtx, loginViaUI, tryCleanup } from './helpers';

type Row = Record<string, unknown>;
const ORDERS: number[] = [];
const N = 6;

interface SettledCall {
  ok: boolean;
  status?: number;
  text?: string;
  data?: Row;
}

async function settleCall(
  page: Page,
  method: 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<SettledCall> {
  try {
    const data = await apiCallRaw<Row>(page, method, path, body);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, status: err.status, text: err.message };
  }
}

function poBody(tag: string): Record<string, unknown> {
  const ctx = getCtx();
  return {
    supplier_id: ctx.supplierId,
    warehouse_id: ctx.warehouseIds[0],
    department_id: ctx.departmentIds[0],
    order_date: new Date().toISOString().slice(0, 10),
    remarks: `665并发取号${tag}`,
    items: [
      {
        material_id: ctx.productIds[0],
        quantity_ordered: '2',
        unit_price: '1',
        tax_rate: 13,
      },
    ],
  };
}

/** 解析 PO 单号为 {date, seq}，格式不符直接抛错，不用默认值掩盖。 */
function parsePoNo(no: string): { date: string; seq: number } {
  const m = /^PO(\d{8})(\d+)$/.exec(no);
  if (!m) {
    throw new Error(`采购单号不符合生成器格式 PO+YYYYMMDD+流水，实际 ${no}`);
  }
  return { date: m[1]!, seq: Number(m[2]!) };
}

async function createOne(page: Page, tag: string): Promise<{ id: number; orderNo: string }> {
  const res = await settleCall(page, 'POST', '/purchase/orders', poBody(tag));
  expect(res.ok, `[665] 建单失败：status=${res.status} text=${res.text}`).toBe(true);
  const id = Number(res.data?.id);
  const orderNo = String(res.data?.order_no ?? '');
  expect(Number.isInteger(id) && id > 0, '[665] 建单未回真实主键').toBe(true);
  expect(orderNo, '[665] 建单未回单号').not.toBe('');
  ORDERS.push(id);
  return { id, orderNo };
}

test.describe('665 并发创建采购单单号唯一无跳号', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });
  test.afterEach(async ({ page }) => {
    for (const id of ORDERS.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/purchase/orders/${id}`, `[665] 采购单 ${id}`);
    }
  });

  test('665-01 N 路并发建采购单，号两两不同且当日号段连续、逐单可读', async ({ page }) => {
    const tag = genCode('665');
    // 基线单：串行建一张，读出当日最大流水作为连续性起点，随后纳入统一清理。
    const baseline = await createOne(page, `${tag}-BASE`);
    const base = parsePoNo(baseline.orderNo);

    // N 路真并发建单：Promise.all 同拍发出，取号器必须串行分配唯一且连续流水。
    const calls = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        settleCall(page, 'POST', '/purchase/orders', poBody(`${tag}-${i}`))
      )
    );
    const failures = calls.filter(r => !r.ok);
    expect(
      failures.map(f => `status=${f.status} text=${f.text}`).join(' | '),
      '[665] 并发建采购单不应有任何一路失败（取号冲突误拒即判红）'
    ).toBe('');
    expect(calls.length, '[665] 全部路都应返回响应').toBe(N);

    const created = calls.map((r, i) => {
      expect(r.ok, `[665] 第 ${i} 路应成功`).toBe(true);
      const id = Number(r.data?.id);
      const orderNo = String(r.data?.order_no ?? '');
      expect(Number.isInteger(id) && id > 0, `[665] 第 ${i} 路未回主键`).toBe(true);
      ORDERS.push(id);
      return { id, orderNo };
    });

    const parsed = created.map(c => parsePoNo(c.orderNo));
    // 号两两不同（唯一），且都落在与基线同一天，杜绝跨日号段混入。
    expect(new Set(created.map(c => c.orderNo)).size, '[665] 并发单号出现重复').toBe(N);
    for (const p of parsed) {
      expect(p.date, '[665] 并发单号须与基线同一自然日').toBe(base.date);
    }
    // 当日号段严格连续：基线之后应恰好是 base+1……base+N，无跳号。
    const seqs = parsed.map(p => p.seq).sort((a, b) => a - b);
    const expected = Array.from({ length: N }, (_, i) => base.seq + i + 1);
    expect(seqs, `[665] 当日号段应连续无跳号，基线=${base.seq} 实际=${seqs.join(',')}`).toEqual(
      expected
    );

    // 逐单 GET 读回：每个号在库中恰对应一张采购单（双落/漏落在读回里判红）。
    for (const c of created) {
      const detail = await apiCallRaw<Row>(page, 'GET', `/purchase/orders/${c.id}`);
      expect(String(detail.order_no), `[665] 采购单 ${c.id} 读回单号须逐字符一致`).toBe(c.orderNo);
    }
  });
});
