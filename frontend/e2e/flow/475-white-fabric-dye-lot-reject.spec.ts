import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';

/**
 * 白坯布缸号准入守卫（2026-11-22 拍板）：白坯布不具缸号属性，色号为空时携带缸号
 * 入库是数据矛盾——出库规划对白坯只接受 dye_lot_no IS NULL 的行，带缸号落库即成
 * 永久提不出的死库存。两条库存直建口必须在任何写库前显式拒绝并外显原因，
 * 不做静默清空（假保存）也不做保留（死库存）。
 *
 * 覆盖：/inventory/stock 与 /inventory/stock/fabric 两条直建口的白坯带缸号拒绝
 * （色号空串与色号缺省两种形态）、拒前后库存/流水零漂移、白坯合法对照（证明拒绝
 * 不是端点坏或无库存造成的假阳性）。染色布路径与直建其余守卫见 470 spec。
 */
type Row = Record<string, unknown>;
interface ListEnvelope {
  items: Row[];
  total: number;
  page: number;
  page_size: number;
}
const cleanup: Array<{ path: string; label: string }> = [];

function reject(result: ApiFailureResult, code: string): void {
  expect.soft(result.status, '白坯带缸号必须返回 400，不能接受 403/404/500').toBe(400);
  expect.soft(result.code, '必须命中已核实的业务机器码').toBe(code);
  expect
    .soft(
      typeof result.message === 'string' && result.message.includes('白坯'),
      '拒因必须点明白坯缸号矛盾'
    )
    .toBe(true);
}

async function readStocks(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row[]> {
  const result = await apiCallRaw<ListEnvelope>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
      `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
  );
  expect(Array.isArray(result.items), '库存列表必须含 items 数组').toBe(true);
  expect(result.items.length, '专属批次必须完整回读').toBe(result.total);
  return result.items;
}

async function readLedger(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row[]> {
  const result = await apiCallRaw<ListEnvelope>(
    page,
    'GET',
    `/inventory/stock/transactions?product_id=${productId}` +
      `&warehouse_id=${warehouseId}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`
  );
  expect(Array.isArray(result.items), '流水列表必须含 items 数组').toBe(true);
  expect(result.items.length, '流水必须完整回读').toBe(result.total);
  return result.items;
}

test.describe('475 白坯布缸号准入守卫', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    for (const item of cleanup.reverse()) {
      await tryCleanup(page, 'DELETE', item.path, item.label);
    }
    cleanup.length = 0;
  });

  for (const endpoint of ['/inventory/stock', '/inventory/stock/fabric']) {
    test(`475-${endpoint === '/inventory/stock' ? '01' : '02'} ${endpoint} 白坯带缸号必须拒绝且零副作用，白坯合法对照`, async ({
      page,
    }) => {
      const ctx = getCtx();
      const productId = ctx.productIds[0];
      const warehouseId = ctx.warehouseIds[0];
      expect(Number.isInteger(productId) && productId > 0, '产品前置不得缺失').toBe(true);
      expect(Number.isInteger(warehouseId) && warehouseId > 0, '仓库前置不得缺失').toBe(true);
      const batchNo = genCode('475-B');

      // 前置：专属批次尚未落库，保证零漂移断言有干净基线
      const beforeStocks = await readStocks(page, productId, warehouseId, batchNo);
      const beforeLedger = await readLedger(page, productId, warehouseId, batchNo);
      expect(beforeStocks, '负例必须使用尚未存在的批次').toEqual([]);

      // 形态一：色号空串 + 非空缸号；形态二：色号键缺省（None）+ 非空缸号
      const blankColorBatch = genCode('475-B2');
      for (const [index, colorNo] of ['', undefined].entries()) {
        const result = await apiCallExpectFail(page, 'POST', endpoint, {
          warehouse_id: warehouseId,
          product_id: productId,
          batch_no: index === 0 ? batchNo : blankColorBatch,
          ...(colorNo === undefined ? {} : { color_no: colorNo }),
          dye_lot_no: genCode('475-FORBIDDEN-LOT'),
          grade: '一等品',
          quantity_meters: '100',
          quantity_kg: '20',
        });
        reject(result, APP_ERROR_CODES.VALIDATION_ERROR);
      }

      const afterStocks = await readStocks(page, productId, warehouseId, batchNo);
      expect.soft(afterStocks, '拒绝前后库存行必须相同').toEqual(beforeStocks);
      expect
        .soft(await readLedger(page, productId, warehouseId, batchNo), '被拒直建不得产生流水')
        .toEqual(beforeLedger);
      // 形态二用了独立批号，零漂移同样要回读，不能只盯形态一的批次
      expect(
        await readStocks(page, productId, warehouseId, blankColorBatch),
        '色号缺省形态必须零落库'
      ).toEqual([]);

      // 白坯合法对照：色号空 + 不带缸号必须成功，证明拒绝是口径生效而非端点坏
      const created = await apiCallRaw<Row & { id: number }>(page, 'POST', endpoint, {
        warehouse_id: warehouseId,
        product_id: productId,
        batch_no: genCode('475-B-OK'),
        color_no: '',
        grade: '一等品',
        quantity_meters: '100',
        quantity_kg: '20',
      });
      const id = created.id;
      expect(Number.isInteger(id) && id > 0, '白坯合法直建必须返回正整数 id').toBe(true);
      cleanup.push({ path: `/inventory/stock/${id}`, label: '475 白坯合法对照' });
      const persisted = await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
      expect(persisted.color_no, '白坯布色号落库为空串').toBe('');
      expect(persisted.dye_lot_no, '白坯布缸号必须为 null').toBeNull();
    });
  }
});
