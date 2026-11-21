import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  seedFourDimStockIn,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';

/**
 * 缸号篡改守卫，规则来源必须区分“非法改写”与业务允许的跨缸回退：
 * - 两条库存直建口均委托 admit_stock_fabric_trace → validate_fabric_trace：有色必有缸，
 *   批次不可为空；“本白”仍是染色布。白坯空色号免缸号是合法对照，不得一刀切拒绝。
 * - PUT stock 不开放缸号/色号/批次/等级编辑。原 DTO 静默忽略这些键、仍递增版本并报成功，
 *   属假保存源码缺口，而非已证明可以改写身份。拒绝必须发生在任何库存 UPDATE 之前，
 *   同请求夹带的合法货位修改也不得半写；显式 null 同样不能绕过。
 * - inv::stock 建单预检与 inv::batch 发运 CAS 要求真实可用匹的缸/批/仓匹配；
 *   inv::batch 明确允许记录实际缸的跨缸回退，故不把一切缸号差异断为非法；
 *   inv::batch 发运服务在已发货/已完成态锁明细编辑：审批态编辑的事务状态门仍需独立修复，
 *   本文件不以条件断言把该缺口蒙绿。
 * - piece_split_handler::build_new_piece 继承缸/色/批，收货按同一追溯组合落库。
 *
 * 覆盖：直建缺缸/空批、合法染色/白坯、库存身份篡改与零副作用、真实匹跨缸冒用拒绝、
 * 拆匹继承及正确缸号调拨发出/收货对照。各负例先独立回读副作用，
 * 再断 HTTP/机器码/拒因。
 * 未覆盖：docx 标签内容（这里的 JSON 回读不能冒充文件验证）；预留专缸锁定（当前请求及
 * 模型只含产品/仓库，lock_reservation 只更新预留状态，不改变库存或锁定指定缸，需独立修复）。
 * 仅静态门禁通过不代表真实业务链已经通过。
 */
type Row = Record<string, unknown>;
interface ListEnvelope {
  items: Row[];
  total: number;
  page: number;
  page_size: number;
}
interface TraceFixture {
  productId: number;
  warehouseId: number;
  batchNo: string;
  colorNo: string;
  dyeLotNo: string;
}
const cleanup: Array<{ path: string; label: string }> = [];

function num(row: Row, key: string): number {
  const value = row[key];
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`[470] ${key} 不是数字：${JSON.stringify(value)}`);
  }
  if (String(value).trim().length === 0 || !Number.isFinite(Number(value))) {
    throw new Error(`[470] ${key} 不是有限十进制值：${JSON.stringify(value)}`);
  }
  return Number(value);
}

function positiveId(row: Row): number {
  const id = num(row, 'id');
  expect(Number.isInteger(id) && id > 0, '真实 API 造数必须返回正整数 id').toBe(true);
  return id;
}

function traceFixture(): TraceFixture {
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  const warehouseId = ctx.warehouseIds[0];
  expect(Number.isInteger(productId) && productId > 0, '产品前置不得缺失').toBe(true);
  expect(Number.isInteger(warehouseId) && warehouseId > 0, '仓库前置不得缺失').toBe(true);
  return {
    productId,
    warehouseId,
    batchNo: genCode('470-B'),
    colorNo: genCode('470-C'),
    dyeLotNo: genCode('470-D'),
  };
}

async function readStocks(page: Page, fixture: TraceFixture): Promise<Row[]> {
  const result = await apiCallRaw<ListEnvelope>(
    page,
    'GET',
    `/inventory/stock?product_id=${fixture.productId}&warehouse_id=${fixture.warehouseId}` +
      `&batch_no=${encodeURIComponent(fixture.batchNo)}` +
      `&color_no=${encodeURIComponent(fixture.colorNo)}&page=1&page_size=100`
  );
  expect(Array.isArray(result.items), '库存列表必须含 items 数组').toBe(true);
  expect(result.items.length, '专属批次必须完整回读，不能比较截断首页').toBe(result.total);
  return result.items;
}

async function readLedger(page: Page, fixture: TraceFixture): Promise<Row[]> {
  const result = await apiCallRaw<ListEnvelope>(
    page,
    'GET',
    `/inventory/stock/transactions?product_id=${fixture.productId}` +
      `&warehouse_id=${fixture.warehouseId}&batch_no=${encodeURIComponent(fixture.batchNo)}` +
      `&color_no=${encodeURIComponent(fixture.colorNo)}&page=1&page_size=100`
  );
  expect(Array.isArray(result.items), '流水列表必须含 items 数组').toBe(true);
  expect(result.items.length, '流水必须完整回读').toBe(result.total);
  return result.items;
}

async function readPieces(page: Page, fixture: TraceFixture): Promise<Row[]> {
  const result = await apiCallRaw<ListEnvelope>(
    page,
    'GET',
    `/inventory/pieces?product_id=${fixture.productId}&warehouse_id=${fixture.warehouseId}` +
      `&batch_no=${encodeURIComponent(fixture.batchNo)}&page=1&page_size=100`
  );
  expect(Array.isArray(result.items), '匹号列表必须含 items 数组').toBe(true);
  expect(result.items.length, '本批匹号必须完整回读').toBe(result.total);
  return result.items;
}

async function findTransfers(page: Page, marker: string): Promise<Row[]> {
  const matches: Row[] = [];
  for (let pageNo = 1; ; pageNo++) {
    const result = await apiCallRaw<ListEnvelope>(
      page,
      'GET',
      `/inventory/transfers?page=${pageNo}&page_size=100`
    );
    expect(Array.isArray(result.items), '调拨列表必须含 items 数组').toBe(true);
    expect(result.page).toBe(pageNo);
    expect(result.page_size).toBe(100);
    expect(Number.isInteger(result.total) && result.total >= 0).toBe(true);
    matches.push(...result.items.filter(row => row.notes === marker));
    if (pageNo * result.page_size >= result.total) return matches;
    if (pageNo === 1000) throw new Error('[470] 调拨列表超出分页上限，不能证明零落库');
  }
}

function reject(result: ApiFailureResult, code: string): void {
  expect.soft(result.status, '数量/维度守卫必须返回 400，不能接受 403/404/422/500').toBe(400);
  expect.soft(result.code, '必须命中已核实的业务机器码').toBe(code);
  expect
    .soft(typeof result.message === 'string' && result.message.trim().length > 0, '拒因不可为空')
    .toBe(true);
}

async function assertRejectedCreate(
  page: Page,
  endpoint: string,
  fixture: TraceFixture,
  patch: Record<string, string | null>,
  message: RegExp
): Promise<void> {
  const beforeStocks = await readStocks(page, fixture);
  const beforeLedger = await readLedger(page, fixture);
  expect(beforeStocks, '负例必须使用尚未存在的批次').toEqual([]);
  const result = await apiCallExpectFail(page, 'POST', endpoint, {
    warehouse_id: fixture.warehouseId,
    product_id: fixture.productId,
    batch_no: fixture.batchNo,
    color_no: fixture.colorNo,
    dye_lot_no: fixture.dyeLotNo,
    grade: '一等品',
    quantity_meters: '100',
    quantity_kg: '20',
    ...patch,
  });
  const afterStocks = await readStocks(page, fixture);
  for (const row of afterStocks) {
    cleanup.push({ path: `/inventory/stock/${positiveId(row)}`, label: '470 非法直建落库' });
  }
  expect.soft(afterStocks, '拒绝前后库存行必须相同').toEqual(beforeStocks);
  expect.soft(await readLedger(page, fixture), '被拒直建不得产生流水').toEqual(beforeLedger);
  reject(result, APP_ERROR_CODES.BUSINESS_ERROR);
  expect.soft(result.message).toMatch(message);
}

test.describe('470 缸号篡改守卫', () => {
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

  for (const [index, endpoint] of ['/inventory/stock', '/inventory/stock/fabric'].entries()) {
    test(`470-0${index + 1} ${endpoint} 有色缺缸与空白批次必须拒绝，染色与白坯合法对照`, async ({
      page,
    }) => {
      for (const dyeLotNo of [null, '', '   ']) {
        const fixture = { ...traceFixture(), colorNo: '本白' };
        await assertRejectedCreate(
          page,
          endpoint,
          fixture,
          { dye_lot_no: dyeLotNo, color_no: '本白' },
          /染色布必须提供缸号/
        );
      }
      // 空白批次可能被查询归一层剔除，额外用本例唯一色号收窄库存/流水观察范围。
      const blankBatch = { ...traceFixture(), batchNo: '   ' };
      await assertRejectedCreate(page, endpoint, blankBatch, { batch_no: '   ' }, /批号|批次/);

      for (const dyed of [true, false]) {
        const fixture = traceFixture();
        const created = await apiCallRaw<Row>(page, 'POST', endpoint, {
          warehouse_id: fixture.warehouseId,
          product_id: fixture.productId,
          batch_no: ` ${fixture.batchNo} `,
          color_no: dyed ? ` ${fixture.colorNo} ` : '',
          dye_lot_no: dyed ? ` ${fixture.dyeLotNo} ` : null,
          grade: '一等品',
          quantity_meters: '100',
          quantity_kg: '20',
        });
        const id = positiveId(created);
        cleanup.push({ path: `/inventory/stock/${id}`, label: '470 合法直建对照' });
        const persisted = await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
        expect(persisted.batch_no).toBe(fixture.batchNo);
        expect(persisted.color_no).toBe(dyed ? fixture.colorNo : '');
        expect(persisted.dye_lot_no).toBe(dyed ? fixture.dyeLotNo : null);
        expect(persisted.grade).toBe('一等品');
        expect(num(persisted, 'quantity_on_hand')).toBe(100);
        expect(num(persisted, 'quantity_kg')).toBe(20);
      }
    });
  }

  test('470-03 库存 PUT 拒绝四类追溯字段（含 null），不得半写货位或版本', async ({ page }) => {
    const fixture = traceFixture();
    const seeded = await seedFourDimStockIn(page, { ...fixture, quantityMeters: '100' });
    const id = positiveId(seeded);
    cleanup.push({ path: `/inventory/stock/${id}`, label: '470 PUT 库存' });
    for (const key of ['dye_lot_no', 'color_no', 'batch_no', 'grade']) {
      for (const value of [genCode('FORGED'), null]) {
        const before = await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
        const beforeLedger = await readLedger(page, fixture);
        const result = await apiCallExpectFail(page, 'PUT', `/inventory/stock/${id}`, {
          version: num(before, 'version'),
          bin_location: genCode('470-SHOULD-NOT-WRITE'),
          [key]: value,
        });
        expect
          .soft(await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`), `${key} 不得半写`)
          .toEqual(before);
        expect.soft(await readLedger(page, fixture), `${key} 不得产生流水`).toEqual(beforeLedger);
        reject(result, APP_ERROR_CODES.VALIDATION_ERROR);
        expect.soft(result.message).toContain('不允许修改缸号、色号、批次或等级');
      }
    }
    const before = await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
    const bin = genCode('470-VALID-BIN');
    await apiCallRaw(page, 'PUT', `/inventory/stock/${id}`, {
      version: num(before, 'version'),
      bin_location: bin,
    });
    const after = await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
    expect(after.bin_location, '不能通过一刀切拒绝 PUT 蒙过追溯守卫').toBe(bin);
    expect(num(after, 'version')).toBe(num(before, 'version') + 1);
    for (const key of ['dye_lot_no', 'color_no', 'batch_no', 'grade']) {
      expect(after[key]).toBe(before[key]);
    }
  });

  test('470-04 真实染色匹不能冒用其他缸号，拆匹与正确调拨全链保留缸色批', async ({ page }) => {
    test.setTimeout(360_000);
    const productId = traceFixture().productId;
    const source = await pickDyeableWarehouse(page);
    const targetId = getCtx().warehouseIds.find(id => id !== source.id);
    if (targetId === undefined) throw new Error('[470] 缺少不同于调出仓的目标仓');
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: source.id,
      quantityMeters: '100',
      pieceCount: 1,
      context: '470 缸号与真实匹追溯',
    });
    const fixture: TraceFixture = {
      productId,
      warehouseId: source.id,
      batchNo: bundle.dyeLotNo,
      dyeLotNo: bundle.dyeLotNo,
      colorNo: bundle.colorNo,
    };
    const target = { ...fixture, warehouseId: targetId };
    const initialPieces = await readPieces(page, fixture);
    expect(initialPieces).toHaveLength(1);
    const parent = initialPieces[0];
    const parentId = positiveId(parent);
    const childNo = genCode('470-CHILD');
    await apiCallRaw(page, 'POST', '/inventory/piece-split', {
      parent_piece_id: parentId,
      cut_length: '20',
      cut_weight: '1',
      new_barcode: childNo,
    });
    const splitPieces = await readPieces(page, fixture);
    expect(splitPieces).toHaveLength(2);
    const child = splitPieces.find(row => row.piece_no === childNo);
    const remaining = splitPieces.find(row => row.id === parentId);
    if (child === undefined || remaining === undefined) {
      throw new Error('[470] 拆匹后查不到真实母匹/子匹，禁止用响应回显代替持久化');
    }
    expect(child.parent_piece_id).toBe(parentId);
    expect(child.dye_lot_no).toBe(fixture.dyeLotNo);
    expect(child.color_no).toBe(fixture.colorNo);
    expect(child.batch_no).toBe(fixture.batchNo);
    expect(num(child, 'length')).toBe(20);
    expect(num(remaining, 'length') + num(child, 'length')).toBe(num(parent, 'length'));

    const beforeStocks = await readStocks(page, fixture);
    const beforeTarget = await readStocks(page, target);
    const beforeLedger = await readLedger(page, fixture);
    const beforeTargetLedger = await readLedger(page, target);
    const marker = genCode('470-IMPERSONATE');
    expect(await findTransfers(page, marker)).toEqual([]);
    const forgedLot = genCode('470-WRONG-LOT');
    const request = {
      from_warehouse_id: source.id,
      to_warehouse_id: targetId,
      transfer_date: new Date().toISOString(),
      notes: marker,
      items: [
        {
          product_id: productId,
          quantity: '20',
          color_no: fixture.colorNo,
          dye_lot_no: forgedLot,
          batch_no: fixture.batchNo,
          piece_no: childNo,
        },
      ],
    };
    const result = await apiCallExpectFail(page, 'POST', '/inventory/transfers', request);
    const persisted = await findTransfers(page, marker);
    for (const row of persisted) {
      cleanup.push({ path: `/inventory/transfers/${positiveId(row)}`, label: '470 冒用调拨' });
    }
    expect.soft(persisted, '冒用缸号不得建调拨单').toEqual([]);
    expect.soft(await readStocks(page, fixture), '源仓库存不得变化').toEqual(beforeStocks);
    expect.soft(await readStocks(page, target), '目标仓不得串缸或增在途').toEqual(beforeTarget);
    expect.soft(await readLedger(page, fixture), '源仓流水零新增').toEqual(beforeLedger);
    expect.soft(await readLedger(page, target), '目标仓流水零新增').toEqual(beforeTargetLedger);
    expect.soft(await readPieces(page, fixture), '匹号不能被占用').toEqual(splitPieces);
    reject(result, APP_ERROR_CODES.BUSINESS_ERROR);

    // 同一真实子匹恢复正确缸号，证明拒绝不是无库存/匹号不存在/端点坏造成的假阳性。
    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/transfers', {
      ...request,
      notes: genCode('470-CORRECT'),
      items: [{ ...request.items[0], dye_lot_no: fixture.dyeLotNo }],
    });
    const transferId = positiveId(created);
    const itemsCreated = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/inventory/transfers/${transferId}/items`
    );
    expect(itemsCreated).toHaveLength(1);
    expect(itemsCreated[0].dye_lot_no).toBe(fixture.dyeLotNo);
    await apiCallRaw(page, 'POST', `/inventory/transfers/${transferId}/approve`, {
      approved: true,
    });
    const approvedRow = await apiCallRaw<Row>(page, 'GET', `/inventory/transfers/${transferId}`);
    expect(approvedRow.status).toBe('approved');
    await apiCallRaw(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    const shipped = await apiCallRaw<Row>(page, 'GET', `/inventory/transfers/${transferId}`);
    expect(shipped.status).toBe('shipped');
    const shippedPieces = await readPieces(page, fixture);
    const shippedChild = shippedPieces.find(row => row.id === child.id);
    if (shippedChild === undefined) throw new Error('[470] 发运后子匹消失');
    expect(shippedChild.status).toBe('SHIPPED');
    await apiCallRaw(page, 'POST', `/inventory/transfers/${transferId}/receive`);
    const completed = await apiCallRaw<Row>(page, 'GET', `/inventory/transfers/${transferId}`);
    expect(completed.status).toBe('completed');
    const received = await readStocks(page, target);
    expect(received).toHaveLength(1);
    expect(received[0].dye_lot_no).toBe(fixture.dyeLotNo);
    expect(received[0].color_no).toBe(fixture.colorNo);
    expect(received[0].batch_no).toBe(fixture.batchNo);
    expect(num(received[0], 'quantity_on_hand')).toBe(20);
    const sourceAfter = await readStocks(page, fixture);
    expect(sourceAfter).toHaveLength(1);
    expect(num(sourceAfter[0], 'quantity_on_hand')).toBe(
      num(beforeStocks[0], 'quantity_on_hand') - 20
    );
    const lotBInTarget = received.filter(row => row.dye_lot_no === forgedLot);
    expect(lotBInTarget, '不可把拒绝的伪造缸号带入目标仓').toEqual([]);
    // 此腿保留完整已完成业务链作为追溯证据，不尝试删除已完成单或仍有匹号引用的库存。
    process.stdout.write(
      `[470] 追溯证据 transfer=${transferId} parent=${parentId} child=${child.id}\n`
    );
  });
});
