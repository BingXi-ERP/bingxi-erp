// 两笔现货订单并提交锁同一库存行的单赢家与账实守恒（接口级真实落库用例）。
//
// 功能，覆盖并发与多端一致性中「同一库存行并发 submit 只放行一笔」的判据。两笔
// fulfillment_source=stock 销售订单指向同 product+color+batch+dye_lot+warehouse
// 的同一库存行，可用量只够一笔；并发出库时服务端必须恰好放行一笔、拒掉另一笔，
// 拒绝出参为 HTTP 400 + BUSINESS_ERROR。拦截点在 order_stock_lock.rs 的
// version 乐观锁：available-=q / reserved+=q 同事务条件更新，不足整单拒绝。
// 与 566 的分工：566 钉单笔 submit 的锁缸与改量差量回缸，本例只钉并发 submit
// 争用同一行时的单赢家与库存三列精确一扣，不重复 566 的串行改量链。
// 调用方，frontend e2e flow 分片；打真实端点 POST /sales/orders、
// POST /sales/orders/{id}/submit 与 GET /inventory/stock 读回，不 mock 响应。
// 入参，登录态与客户/仓库/产品由 worker fixture 与 ensureTestEntities 提供；
// 色号/批次/缸号一律本用例自建并带唯一 tag，库存可用量播种为单份，确保两单合计
// 需求必然超过可用量，共享库其他用例不可能命中同一 tuple。
// 传给谁，断言结果只进 Playwright 报告；两路响应全部保留判读，不因单路抛错吞掉
// 另一路，恰好一 200 一失败才算并发判据成立。
// 存什么，sales_orders 两行与 inventory_stocks 一行的真实列值；成功单提交后
// available 从 30 精确减到 0、reserved 从 0 增到 30，失败单不改变库存，
// 三列均不得为负，双扣或空扣在此判据下必红。
// 存哪里，以上表均在测试库本体；本用例自建的两笔订单收尾按 id 显式 DELETE，
// 库存行随订单回缸由服务层事务保证，不伪造审计链。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  seedFourDimStockIn,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
const ORDERS: number[] = [];

interface SettledCall {
  ok: boolean;
  status?: number;
  text?: string;
  data?: Record<string, unknown>;
}

function num(v: unknown, label: string): number {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  expect(Number.isFinite(n), `${label} 须是有效数字，实际 ${JSON.stringify(v)}`).toBe(true);
  return n;
}

/** 单路结果全保留：并发两路不得因一路抛 Promise.all 的 fail-fast 吞掉另一路判读。 */
async function settleCall(
  page: Page,
  method: 'POST' | 'DELETE',
  path: string,
  body?: Record<string, unknown>
): Promise<SettledCall> {
  try {
    const data = await apiCallRaw<Record<string, unknown>>(page, method, path, body);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, status: err.status, text: err.message };
  }
}

async function createStockOrder(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    remarks: `663并发锁缸${tag}`,
    items: [
      {
        product_id: getCtx().productIds[0],
        quantity: '30',
        unit_price: '25.50',
        color_no: `${tag}-C`,
        batch_requirement: `${tag}-B`,
        dye_lot_requirement: `${tag}-LOT`,
        fulfillment_source: 'stock',
      },
    ],
  });
  const id = num(created.id, '[663] 建单 id');
  expect(Number.isInteger(id) && id > 0, '[663] 建单未回真实主键').toBe(true);
  ORDERS.push(id);
  return id;
}

async function readStockRow(
  page: Page,
  productId: number,
  colorNo: string,
  batchNo: string
): Promise<Row> {
  const listed = await apiCallRaw<{ items?: Row[] }>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&color_no=${encodeURIComponent(colorNo)}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
  );
  const row = listed.items?.find(r => String(r.batch_no) === batchNo);
  expect(row, `[663] 库存行未回读：product=${productId} batch=${batchNo}`).toBeTruthy();
  return row as Row;
}

test.describe('663 现货订单并发提交锁缸单赢家', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });
  test.afterEach(async ({ page }) => {
    for (const id of ORDERS.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `[663] 订单 ${id}`);
    }
  });

  test('663-01 两笔 stock 订单并发 submit 同缸行，仅一笔成功、库存精确一扣', async ({ page }) => {
    const tag = genCode('663');
    const productId = getCtx().productIds[0]!;
    const warehouseId = getCtx().warehouseIds[0]!;
    const colorNo = `${tag}-C`;
    const batchNo = `${tag}-B`;
    const dyeLotNo = `${tag}-LOT`;
    // 播种单份可用量 30：两单各要 30，合计 60 必然超过可用，正确实现只能放行一笔。
    await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '30',
    });

    const before = await readStockRow(page, productId, colorNo, batchNo);
    expect(num(before.quantity_available, '[663] 播种 available'), '播种可用量').toBe(30);
    expect(num(before.quantity_reserved, '[663] 播种 reserved'), '播种预留量').toBe(0);

    const orderA = await createStockOrder(page, 'A');
    const orderB = await createStockOrder(page, 'B');

    // 两路真并发 submit：Promise.all 同拍发出，服务端行锁/乐观锁决定唯一赢家。
    const [resA, resB] = await Promise.all([
      settleCall(page, 'POST', `/sales/orders/${orderA}/submit`),
      settleCall(page, 'POST', `/sales/orders/${orderB}/submit`),
    ]);
    expect(resA.ok && resB.ok, '[663] 并发 submit 不得两路都成功（双扣超卖）').toBe(false);
    expect(!resA.ok && !resB.ok, '[663] 并发 submit 不得两路都失败（无赢家）').toBe(false);
    const winners = [resA, resB].filter(r => r.ok);
    const losers = [resA, resB].filter(r => !r.ok);
    expect(winners.length, '[663] 恰好一笔成功').toBe(1);
    expect(losers.length, '[663] 恰好一笔失败').toBe(1);
    const loser = losers[0]!;
    expect(loser.status, `[663] 拒单应为 400，实际 ${loser.status}：${loser.text}`).toBe(400);
    expect(
      loser.text ?? '',
      `[663] 拒单须为业务族机器码 BUSINESS_ERROR，实际 ${loser.text}`
    ).toContain(`code=${APP_ERROR_CODES.BUSINESS_ERROR}`);

    // 库存三列：成功单精确一扣（30→0 / 0→30），失败单零副作用；不得双扣、空扣或为负。
    const after = await readStockRow(page, productId, colorNo, batchNo);
    expect(num(after.quantity_available, '[663] 提交后 available'), '可用量精确一扣').toBe(0);
    expect(num(after.quantity_reserved, '[663] 提交后 reserved'), '预留量精确一增').toBe(30);
    expect(
      num(after.quantity_available, '[663] available 非负'),
      '可用量不得为负'
    ).toBeGreaterThanOrEqual(0);
    expect(
      num(after.quantity_reserved, '[663] reserved 非负'),
      '预留量不得为负'
    ).toBeGreaterThanOrEqual(0);
  });
});
