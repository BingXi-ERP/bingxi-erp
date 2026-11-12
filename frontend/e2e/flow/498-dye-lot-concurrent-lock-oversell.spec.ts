// 染色缸号并发锁库超卖拦截与并发建单单据号唯一性（接口级真实落库用例）
//
// 功能，覆盖并发与多端一致性的两条判据。一、两笔订单对同一缸号的同一库存行并发出库，
// 出库量合计大于可用量时，服务端必须只放行一笔、拒掉另一笔，库存不得被扣成负数；
// 拦截点在 服务端实现 的 reduce_inventory_four_dim
// （FOR UPDATE 行锁 + plan_deduction 四维规划），拒绝出参为 HTTP 400 + BUSINESS_ERROR，
// 染色布拒绝文案含「小于出库数量」（insufficient_error 的染色分支原文）。
// 二、同一订单同一产品并发创建两笔库存预留（quantity 各 60，合计超过任何可用量）时，
// 服务端当前实现 服务端实现 的 create_reservation 只做
// 订单/产品/仓库三个外键存在性预检，不做任何库存数量门、不扣减 inventory_stocks——
// 本用例把这一真实行为逐条钉住（两笔均 200 落 pending、库存快照零变化），
// 作为「预留侧无超卖拦截」的功能缺失取证，真实拦截口径由第一条用例在出库扣减侧钉死。
// 三、五笔销售订单并发创建，单据号由 服务端实现 的 DocumentNumberGenerator
// 以 pg_advisory_xact_lock 同前缀同日串行取号 + insert_with_no_retry 兜底，
// 判据为：号两两不同、无复用，且逐单读回落库恰各一张（重复/漏单在此判据下必红）。
// 调用方，frontend e2e flow 分片；打真实端点 POST /sales/orders/{id}/ship、
// POST /inventory/reservations、POST /sales/orders 与 GET 读回，不 mock 响应。
// 入参，登录态与产品/客户/仓库由 worker fixture 与 ensureTestEntities 提供；
// 缸号/色号/批次/匹号一律本用例自建（seedDyedOutboundBundle 真实委外染色链产匹），
// 维度取值全部带唯一 tag，共享库其他用例不可能命中同一 tuple。
// 传给谁，断言结果只进 Playwright 报告；「预留侧无数量门」的行为差异同步进车道交付报告。
// 存什么，sales_orders / sales_order_items / sales_deliveries / inventory_stocks /
// inventory_pieces / inventory_reservations 六处的真实行与列值；库存扣减后
// quantity_available 必须等于 100-60=40（不为负、不双扣）才算账实一致。
// 存哪里，以上表均在测试库本体；本用例自建数据收尾清理——预留 DELETE 后按
// product+warehouse 列表读回确认 id 消失，草稿订单 DELETE 后按 id 读回 404；
// 已发货终态单据与真实染色匹按状态机门保留（强删会伪造审计链），其归属由
// 缸号/批次/匹号自带的唯一 tag 提供等价可追溯证据。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  tryCleanup,
  getCtx,
  genCode,
  APP_ERROR_CODES,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  readDyedPieceByNo,
  type DyedSeedPiece,
} from './helpers';
import { pickListArray } from './ui-helpers';

/** 读回响应里的一个键并转成数字，键缺席或非有限值直接抛错，不以默认值掩盖缺键。 */
function readNumber(obj: Record<string, unknown>, key: string, label: string): number {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`${label} 响应缺少后端真实键 ${key}，实际键=${Object.keys(obj).join(',')}`);
  }
  const value = Number(obj[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 键 ${key} 不可解析为有限数字，raw=${String(obj[key])}`);
  }
  return value;
}

/** 数量按业务精度比较（容差 0.01），失败信息带期望与实际。 */
function expectQuantity(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}，期望=${expected} 实际=${actual}`).toBeLessThan(
    0.01
  );
}

/** 状态逐字符断言，先 String 化再 toBe，不做大小写归一。 */
function expectStatusChar(actual: unknown, expected: string, label: string): void {
  expect(
    String(actual),
    `${label}应逐字符等于写入方词表值 ${expected}，实际 ${String(actual)}`
  ).toBe(expected);
}

/** 并发请求的单路结果：成功带数据，失败带状态码与原始错误文本，不吞任何一路。 */
type SettledCall =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number | undefined; text: string };

async function settleCall(
  page: import('@playwright/test').Page,
  method: 'POST' | 'DELETE',
  path: string,
  body: Record<string, unknown>
): Promise<SettledCall> {
  try {
    const data = await apiCallRaw<Record<string, unknown>>(page, method, path, body);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, status: err.status, text: err.message };
  }
}

/** 建一张本用例专属销售订单并推到 approved（订单行数量=拟发货量，全额发货语义）。 */
async function createApprovedOrder(
  page: import('@playwright/test').Page,
  opts: { customerId: number; productId: number; qty: number; marker: string }
): Promise<{ orderId: number; orderNo: string }> {
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/sales/orders', {
    customer_id: opts.customerId,
    items: [{ product_id: opts.productId, quantity: opts.qty, unit_price: 25.5 }],
    remarks: `E2E 并发锁缸 ${opts.marker}`,
  });
  const orderId = readNumber(created, 'id', '销售建单');
  const orderNo = String(created.order_no);
  if (orderNo.trim() === '' || orderNo === 'undefined') {
    throw new Error(`建单响应缺真实订单号 order_no，实际键=${Object.keys(created).join(',')}`);
  }
  await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/submit`);
  await apiCallRaw(page, 'POST', `/sales/orders/${orderId}/approve`);
  const approved = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/sales/orders/${orderId}`
  );
  expectStatusChar(approved.status, 'approved', '审批后订单状态');
  CLEANUP_ORDERS.push(orderId);
  return { orderId, orderNo };
}

/** 按款号+仓库读回库存行集合（预留侧快照与扣减侧回读共用同一查询口径）。 */
async function readStockRows(
  page: import('@playwright/test').Page,
  productId: number,
  warehouseId: number
): Promise<Array<Record<string, unknown>>> {
  const path =
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&page=1&page_size=100`;
  const res = await apiCallRaw<Record<string, unknown>>(page, 'GET', path);
  return pickListArray<Record<string, unknown>>(res, 'items', '库存行回读 ' + path);
}

const CLEANUP_ORDERS: number[] = [];
test.afterEach(async ({ page }) => {
  // 草稿/未发货终态前订单尽力删除（已发货单被状态机门拒绝属预期，tryCleanup 容错记录）；
  // 预留与染色 bundle 的清理在各自用例内按真实端点删除并回读判据。
  for (const id of CLEANUP_ORDERS.splice(0).reverse()) {
    await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `sales-order-${id}`);
  }
});

test.describe('缸号并发锁库与并发单据号', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('两单并发对同一缸号出库，合计超可用量，只放行一笔且库存恰扣一次不为负', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const customerId = ctx.customerId;
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(customerId, '前置客户缺失').toBeTruthy();
    const warehouse = await pickDyeableWarehouse(page);

    // 本用例专属缸：库存行 100 米（batch=缸号），真实委外染色链产 2 匹 AVAILABLE 染色匹
    const bundle = await seedDyedOutboundBundle(page, {
      productId: productId!,
      warehouseId: warehouse.id,
      quantityMeters: '100',
      pieceCount: 2,
    });
    const pieces: DyedSeedPiece[] = bundle.pieces;
    expect(pieces.length, '染色 bundle 应真实产出两匹 AVAILABLE 染色匹').toBeGreaterThanOrEqual(2);

    const stockBefore = await readStockRows(page, productId!, warehouse.id);
    const rowBefore = stockBefore.find(
      r => String(r.dye_lot_no) === bundle.dyeLotNo && String(r.batch_no) === bundle.dyeLotNo
    );
    if (!rowBefore) {
      throw new Error(`按缸 ${bundle.dyeLotNo} 未命中本用例库存行，候选行数=${stockBefore.length}`);
    }
    const availableBefore = readNumber(rowBefore, 'quantity_available', '出库前可用量');
    expectQuantity(availableBefore, 100, '出库前可用量应为 seed 值 100');

    const orderA = await createApprovedOrder(page, {
      customerId: customerId!,
      productId: productId!,
      qty: 60,
      marker: bundle.dyeLotNo + 'A',
    });
    const orderB = await createApprovedOrder(page, {
      customerId: customerId!,
      productId: productId!,
      qty: 60,
      marker: bundle.dyeLotNo + 'B',
    });

    const shipBody = (orderId: number, piece: DyedSeedPiece) => ({
      order_id: orderId,
      warehouse_code: warehouse.code,
      items: [
        {
          product_id: productId,
          quantity: 60,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          batch_no: bundle.dyeLotNo,
          piece_no: piece.piece_no,
        },
      ],
      remarks: `E2E 并发出库 ${bundle.dyeLotNo}`,
    });

    // 两路并发出库，单路结果全部保留判读，不 Promise.all 直接抛错吞掉另一路
    const [shipA, shipB] = await Promise.all([
      settleCall(
        page,
        'POST',
        `/sales/orders/${orderA.orderId}/ship`,
        shipBody(orderA.orderId, pieces[0]!)
      ),
      settleCall(
        page,
        'POST',
        `/sales/orders/${orderB.orderId}/ship`,
        shipBody(orderB.orderId, pieces[1]!)
      ),
    ]);
    const okShips = [shipA, shipB].filter(r => r.ok);
    const failedShips = [shipA, shipB].filter(r => !r.ok) as Array<
      Extract<SettledCall, { ok: false }>
    >;

    expect(
      okShips.length,
      `同一缸并发出库必须恰好一笔成功，实际成功 ${okShips.length} 笔（双扣超卖）`
    ).toBe(1);
    expect(failedShips.length, `合计 120 > 可用 100，另一笔必须被服务端拒绝而不是静默放行`).toBe(1);

    const loser = failedShips[0]!;
    expect(loser.status, `超卖拒绝应为 400，实际 status=${loser.status}，原文=${loser.text}`).toBe(
      400
    );
    expect(loser.text, `超卖拒绝应带业务族机器码与四维不足文案，原文=${loser.text}`).toMatch(
      new RegExp(`code=${APP_ERROR_CODES.BUSINESS_ERROR}.*小于出库数量`)
    );

    const winnerOrder = shipA.ok ? orderA : orderB;
    const loserOrder = shipA.ok ? orderB : orderA;

    // 落库侧三点账实一致：可用量恰扣一次、已发量恰增一次、在库量不动
    const rowAfter = (await readStockRows(page, productId!, warehouse.id)).find(
      r => String(r.dye_lot_no) === bundle.dyeLotNo && String(r.batch_no) === bundle.dyeLotNo
    );
    if (!rowAfter) {
      throw new Error(`出库后按缸 ${bundle.dyeLotNo} 回读库存行消失，落库异常`);
    }
    expectQuantity(
      readNumber(rowAfter, 'quantity_available', '并发出库后可用量'),
      40,
      '可用量应只被成功的一笔扣减 60（100-60=40，负数或 20 都是超卖/双扣）'
    );
    expectQuantity(
      readNumber(rowAfter, 'quantity_shipped', '并发出库后已发量'),
      readNumber(rowBefore, 'quantity_shipped', '出库前已发量') + 60,
      '已发量应恰增 60'
    );
    expectQuantity(
      readNumber(rowAfter, 'quantity_on_hand', '并发出库后在库量'),
      readNumber(rowBefore, 'quantity_on_hand', '出库前在库量'),
      '出库只把可用转已发，在库量不得动'
    );

    const winnerDetail = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/sales/orders/${winnerOrder.orderId}`
    );
    expectStatusChar(winnerDetail.status, 'shipped', '成功订单全额发货后状态');
    const loserDetail = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/sales/orders/${loserOrder.orderId}`
    );
    expectStatusChar(loserDetail.status, 'approved', '被拒订单状态不得被部分提交');
    const loserDeliveries = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/sales/orders/${loserOrder.orderId}/deliveries`
    );
    expect(
      pickListArray<Record<string, unknown>>(loserDeliveries, 'list', '被拒订单发货单列表').length,
      '被拒订单不得留下发货单'
    ).toBe(0);

    // 匹号消耗侧：成功单指定的匹 AVAILABLE→SHIPPED，被拒单的匹保持 AVAILABLE（CAS 零副作用）
    const winnerPieceNo = winnerOrder === orderA ? pieces[0]!.piece_no : pieces[1]!.piece_no;
    const loserPieceNo = winnerOrder === orderA ? pieces[1]!.piece_no : pieces[0]!.piece_no;
    const pieceDims = {
      productId: productId!,
      warehouseId: warehouse.id,
      dyeLotNo: bundle.dyeLotNo,
      batchNo: bundle.dyeLotNo,
    };
    const winnerPiece = await readDyedPieceByNo(page, { ...pieceDims, pieceNo: winnerPieceNo });
    expect(winnerPiece, '成功出库的匹应仍可回读').not.toBeNull();
    expectStatusChar(winnerPiece!.status, 'SHIPPED', '成功出库匹状态');
    const loserPiece = await readDyedPieceByNo(page, { ...pieceDims, pieceNo: loserPieceNo });
    expect(loserPiece, '被拒出库的匹应仍可回读').not.toBeNull();
    expectStatusChar(loserPiece!.status, 'AVAILABLE', '被拒出库匹状态不得被消耗');
  });

  test('两单并发创建同产品同仓库存预留，服务端不做数量门且不动库存（当前实现真实行为钉住）', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const customerId = ctx.customerId;
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(customerId, '前置客户缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const orderA = await createApprovedOrder(page, {
      customerId: customerId!,
      productId: productId!,
      qty: 60,
      marker: genCode('RSLA'),
    });
    const orderB = await createApprovedOrder(page, {
      customerId: customerId!,
      productId: productId!,
      qty: 60,
      marker: genCode('RSLB'),
    });

    const stockBefore = await readStockRows(page, productId!, warehouseId!);
    const availableSumBefore = stockBefore.reduce(
      (acc, r) => acc + readNumber(r, 'quantity_available', '预留前快照可用量'),
      0
    );

    const [resA, resB] = await Promise.all([
      settleCall(page, 'POST', '/inventory/reservations', {
        order_id: orderA.orderId,
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: 60,
        notes: `E2E 并发预留 A ${orderA.orderNo}`,
      }),
      settleCall(page, 'POST', '/inventory/reservations', {
        order_id: orderB.orderId,
        product_id: productId,
        warehouse_id: warehouseId,
        quantity: 60,
        notes: `E2E 并发预留 B ${orderB.orderNo}`,
      }),
    ]);

    // 当前实现 服务端实现 的 create_reservation 只有
    // 订单/产品/仓库存在性预检，无库存数量门：两笔并发均应 200 落 pending——
    // 这一行为即「预留侧无超卖拦截」的取证判据，若后端补上数量门此断言会红并回派更新。
    expect(resA.ok, `并发预留 A 应如实落库（实际=${JSON.stringify(resA)}）`).toBe(true);
    expect(resB.ok, `并发预留 B 应如实落库（实际=${JSON.stringify(resB)}）`).toBe(true);
    const reservationA = (resA as { data: Record<string, unknown> }).data;
    const reservationB = (resB as { data: Record<string, unknown> }).data;
    const reservationIdA = readNumber(reservationA, 'id', '预留 A 建单响应');
    const reservationIdB = readNumber(reservationB, 'id', '预留 B 建单响应');
    expectStatusChar(reservationA.status, 'pending', '预留 A 初始状态');
    expectStatusChar(reservationB.status, 'pending', '预留 B 初始状态');

    const listed = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/inventory/reservations?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=100`
    );
    const rows = pickListArray<Record<string, unknown>>(listed, 'list', '预留列表回读');
    const mine = rows.filter(r => [reservationIdA, reservationIdB].includes(Number(r.id)));
    expect(mine.length, '两笔并发预留应均能在列表端点回读').toBe(2);

    const stockAfter = await readStockRows(page, productId!, warehouseId!);
    const availableSumAfter = stockAfter.reduce(
      (acc, r) => acc + readNumber(r, 'quantity_available', '预留后快照可用量'),
      0
    );
    expectQuantity(availableSumAfter, availableSumBefore, '预留创建不应改动任何库存行可用量');

    // 清理：pending 预留可经真实 DELETE 端点删除，删除后列表回读必须不再命中
    await apiCall(page, 'DELETE', `/inventory/reservations/${reservationIdA}`);
    await apiCall(page, 'DELETE', `/inventory/reservations/${reservationIdB}`);
    const listedAfter = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/inventory/reservations?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=100`
    );
    const rowsAfter = pickListArray<Record<string, unknown>>(
      listedAfter,
      'list',
      '预留删除后列表回读'
    );
    const lingering = rowsAfter.filter(r =>
      [reservationIdA, reservationIdB].includes(Number(r.id))
    );
    expect(lingering.length, `预留删除后列表仍命中 ${JSON.stringify(lingering)}`).toBe(0);
  });

  test('五笔销售订单并发创建，单据号两两不同无复用且逐单落库恰一张', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const customerId = ctx.customerId;
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(customerId, '前置客户缺失').toBeTruthy();

    const tag = genCode('CNO');
    const calls = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        settleCall(page, 'POST', '/sales/orders', {
          customer_id: customerId,
          items: [{ product_id: productId, quantity: 1, unit_price: 1 }],
          remarks: `E2E 并发单号 ${tag}-${i}`,
        })
      )
    );
    const successes = calls.filter(r => r.ok) as Array<Extract<SettledCall, { ok: true }>>;
    const failures = calls.filter(r => !r.ok) as Array<Extract<SettledCall, { ok: false }>>;
    // 并发建单五路必须全部成功：任何一路被误拒（如取号冲突裸报错）都判红
    expect(
      failures.map(f => `status=${f.status} text=${f.text}`).join(' | '),
      '并发创建销售订单不应有任何一路失败'
    ).toBe('');
    expect(successes.length, '五路并发建单应全部返回成功').toBe(5);

    const orderNos = successes.map(s => String(s.data.order_no));
    for (const no of orderNos) {
      if (!/^SO\d{8}\d+$/.test(no)) {
        throw new Error(`订单号不符合生成器格式 {{前缀}}{{YYYYMMDD}}{{流水}}，实际 ${no}`);
      }
    }
    expect(new Set(orderNos).size, `并发单据号出现重复/复用：${orderNos.join(',')}`).toBe(5);

    const seqs = orderNos.map(no => Number(no.slice(10))).sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]! > seqs[i - 1]!, `流水序列应严格递增无复用，实际=${seqs.join(',')}`).toBe(
        true
      );
    }

    // 逐单读回：每个号在库中恰对应一张订单（双落行/漏落在明细读回里判红）
    for (let i = 0; i < successes.length; i++) {
      const orderId = readNumber(successes[i]!.data, 'id', `并发建单第 ${i} 路响应`);
      const detail = await apiCallRaw<Record<string, unknown>>(
        page,
        'GET',
        `/sales/orders/${orderId}`
      );
      expect(String(detail.order_no), `订单 ${orderId} 读回单号应与建单响应逐字符一致`).toBe(
        orderNos[i]
      );
      expectStatusChar(detail.status, 'draft', '并发建单初始状态');
      const fail = await settleCall(page, 'DELETE', `/sales/orders/${orderId}`, {});
      expect(fail.ok, `草稿订单 ${orderId} 应可删除，实际=${JSON.stringify(fail)}`).toBe(true);
      const gone = await apiCallExpectFail(page, 'GET', `/sales/orders/${orderId}`);
      expect(gone.status, `删除后读回应为 404，实际 ${gone.status}`).toBe(404);
    }
  });
});
