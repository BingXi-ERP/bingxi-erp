import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectDenied,
  failureCode,
  fetchAvailableDyedPieces,
  getCtx,
  loginAsRole,
  loginViaUI,
  pickDyeableWarehouse,
  readDyedPieceByNo,
  seedDyedOutboundBundle,
  tryCleanup,
} from './helpers';

/**
 * 扫码出库 scan-to-ship E2E 用例（三枚 test）
 *
 * 功能。把"扫一个在册 AVAILABLE 卷码出库"钉成三组改前值、改后值、差值的对账断言
 * （T1）：本缸 AVAILABLE 匹数 2→1 差 −1、本缸 SHIPPED 匹数 0→1 差 +1、扫码统计
 * available_count 与 shipped_count 在前后各自静默窗内 −1 与 +1 且总数零变——出库的
 * 库存量口径真实落在 inventory_piece 的 status 列上；同腿把四维库存行钉成零写入不变量
 * （quantity_on_hand / quantity_available / quantity_reserved 三列改前等于改后，差 0），
 * 并在 console.warn 点名该端点不扣库存行也不校验订单的契约缺口。把"重复出库被状态门
 * 拒绝"钉成 400 + BAD_REQUEST 归因与拒绝后三列加匹状态零写入（T2）。把"扫不存在的码
 * 404 NOT_FOUND 点名"与出库面权限双向腿钉死（T3）：salesperson 与 warehouse_keeper
 * 直连 POST 都被 RBAC 403 拒绝且匹行与库存行逐列不动，管理员同一请求 200 放行且
 * status 真实落库为 SHIPPED——keeper 也被拒是当前授权面实况（该键未登记，见契约真相）。
 *
 * 调用方。Playwright E2E 串行链，写腿与回读腿走 worker 专属管理员会话；T3 先
 * loginAsRole 切 salesperson 打拒绝腿、再切 warehouse_keeper 打第二枚拒绝腿、
 * 每条拒绝腿后都 loginViaUI(force) 切回管理员做逐列回读与放行腿。前端调用点：
 * views/barcode-scanner/index.vue 出库表单经 api/barcode-scanner.ts:51 scanToShip
 * 打 POST /scanner/scan-to-ship。
 *
 * 入参。POST 体两个必键：barcode（真实委外染色链产匹的条码原文，写入方口径
 * barcode = piece_no）与 order_id（必键但服务端不消费，见契约真相；本文件传 1 仅作
 * 反序列化占位，不断它与任何单据的关联）。夹具产品与仓库取真实主键；四维库存行由
 * seedDyedOutboundBundle 以 batch=缸号 口径播种。
 *
 * 传给谁。播种腿打 helpers.seedDyedOutboundBundle（POST /inventory/stock/fabric 库存行
 * 加真实委外染色链产 AVAILABLE 匹）；被测腿打 POST /scanner/scan-to-ship
 * （handlers/barcode_scanner_handler.rs scan_to_ship_post 与 scan_to_ship_impl）；
 * 回读腿打 GET /scanner/scan-inventory（盘库投影 status 列）、GET /inventory/pieces
 * 按缸号与状态两路（匹行落库与池计数）、GET /scanner/scan-statistics（全表状态聚合）、
 * GET /inventory/stock/{id}（四维库存行三列）。
 *
 * 存什么。inventory_piece 行的 status 列（AVAILABLE→SHIPPED，词表大写）与
 * updated_at；inventory_stocks 行三列在本端点下恒零写入。米数与库存量出参是 DECIMAL
 * 字符串，数值判定一律 Number(String(v)) 归一，绝不做二次四舍五入。
 *
 * 存哪里。PostgreSQL inventory_piece 与 inventory_stocks。清理位点：库存行
 * DELETE /inventory/stock/{id} 删除并回读 404；匹行无 HTTP 删除口，未消耗的匹一律
 * POST /scanner/scan-to-ship 置 SHIPPED 终态离开 AVAILABLE 池，并按缸号回读归零。
 *
 * 契约真相（逐段读后端源，非推测）。
 * scan_to_ship_impl（barcode_scanner_handler.rs:86-115）在事务内按
 * inventory_piece.barcode 等值取一行：查不到产 AppError::not_found（404 NOT_FOUND）；
 * 命中行 status 已是 SHIPPED 产 AppError::bad_request（400 BAD_REQUEST，"该布卷已发货"
 * 的状态门）；否则把 status 写 SHIPPED 并推进 updated_at，提交后回显 barcode 与
 * piece_no。order_id 是请求体必键但形参名为 _order_id、全程不读取——扫码出库与
 * 销售订单在 HTTP 面无任何校验关联；本端点也不触碰 inventory_stocks 三列：扣减
 * 可用量的四维消耗只存在于销售出库面（services/so/delivery_ops/inventory.rs
 * reduce_inventory_four_dim），扫码出库仅翻匹行。T1 因此把"库存可用量与锁定量"的
 * 差值对账钉在两处真实落点：本缸匹池 AVAILABLE 与 SHIPPED 计数逐值 ±1（行级口径），
 * 以及 inventory_stocks 三列差 0 的零写入不变量（缺口点名见下）。
 * 权限面键派生（middleware/permission.rs extract_resource_info 默认分支 +
 * utils/path_utils.rs:57 scanner 为模块前缀）：POST /api/v1/erp/scanner/scan-to-ship
 * 派生 resource_type="scan-to-ship"、action="create"（末段不在动作关键字表，按方法
 * 派生），该路径不在公共面也不在自助豁免面（middleware/public_routes.rs 两清单均
 * 精确匹配），白名单层放行 seg3=scanner。scan-to-ship 未登记进 services/init_service.rs
 * 的 PERMISSION_RESOURCES（扫码族仅 scan-receipt 在册），init_service_ops/permission.rs
 * 对 warehouse_keeper 与 warehouse_manager 只授 scan-receipt:create，salesperson 种子
 * （orders/crm-leads/customers/pieces/export-inspections 各族）不含任何 scanner 域键，
 * e2e 补授通道 SEED_ROLE_EXTRA_PERMISSIONS 同样不写 scan-to-ship——故除通配超管外
 * 一律 403 FORBIDDEN，仓管反而不能扫码出库属授权面收窄缺口，已写进交付报告。
 * 403 归因权限面而非参数面：参数面 BAD_REQUEST 产 400、NOT_FOUND 产 404，均不产 403；
 * expectDenied 另钉该 403 的机器码不是 CSRF 家族。
 * 静默窗口说明：scan-statistics 是全表聚合，活库并发用例会改动计数，故 ±1 差值只在
 * "同一侧两次读数逐值相等方算取到静默窗"的采样基线上断，采不中即显式判红点名并发，
 * 不放宽；行级对账（按唯一缸号过滤）不受并发影响，是恒定的等值判据。
 *
 * 状态词表取值清单（逐字符取自 models/status/purchase_inventory.rs::inventory_piece）：
 * AVAILABLE / SHIPPED / DEFECT / UNAVAILABLE / RESERVED / SAMPLE
 */

type Row = Record<string, unknown>;

/** DECIMAL 与整数出参可能是字符串形态，数值判定一律先 Number(String(v)) 归一 */
const num = (v: unknown): number => Number(String(v));

/** scan-to-ship 请求体必键 order_id 的占位值：服务端不消费该字段（见契约真相） */
const ORDER_ID_NOT_CONSUMED = 1;

interface StatsSnapshot {
  available: number;
  shipped: number;
  total: number;
}

/**
 * 读一次扫码统计的三个本链关注列（GET /scanner/scan-statistics）。
 * 调用方：T1 差值对账基线。入参：page。
 * 传给谁：静默窗采样与 ±1 断言。存什么/存哪里：不持久化。
 */
async function readStatsTriple(page: Page): Promise<StatsSnapshot> {
  const data = await apiCallRaw<Row>(page, 'GET', '/scanner/scan-statistics');
  const snap: StatsSnapshot = {
    available: num(data.available_count),
    shipped: num(data.shipped_count),
    total: num(data.total_count),
  };
  for (const [col, val] of Object.entries(snap)) {
    expect(
      Number.isInteger(val) && val >= 0,
      `扫码统计列 ${col} 必须是非负整数，实际 ${JSON.stringify(data)}`
    ).toBe(true);
  }
  return snap;
}

/**
 * 采样直到取得静默窗（同一侧背靠背两次读数逐值相等）。
 * 调用方：T1 出库前后基线。入参：page + 点名用途。
 * 传给谁：±1 差值断言的锚点。存什么/存哪里：不持久化。
 * 连续采不中即判红点名并发写入，绝不放宽成区间估计或跳过。
 */
async function readStatsQuietWindow(page: Page, purpose: string): Promise<StatsSnapshot> {
  const MAX_SAMPLES = 10;
  let lastPair = '';
  for (let i = 0; i < MAX_SAMPLES; i++) {
    const a = await readStatsTriple(page);
    const b = await readStatsTriple(page);
    lastPair = `${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
    if (a.available === b.available && a.shipped === b.shipped && a.total === b.total) {
      return b;
    }
  }
  throw new Error(
    `${purpose}：连续 ${MAX_SAMPLES} 次都采不到扫码统计静默窗，最后对 ${lastPair}——` +
      '活库并发写入未停，行级之外的聚合差值无法确定性成立，显式判红不放宽'
  );
}

/** 按四维回读某缸号指定状态的匹数（GET /inventory/pieces 分页 total） */
async function readLotTotalByStatus(
  page: Page,
  productId: number,
  warehouseId: number,
  dyeLotNo: string,
  status: 'AVAILABLE' | 'SHIPPED'
): Promise<number> {
  const qs =
    `?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&dye_lot_no=${encodeURIComponent(dyeLotNo)}&status=${status}&page=1&page_size=50`;
  const res = await apiCallRaw<Row>(page, 'GET', `/inventory/pieces${qs}`);
  const total = num(res.total);
  expect(
    Number.isInteger(total) && total >= 0,
    `按缸号 ${dyeLotNo} 状态 ${status} 回读的 total 必须是非负整数，实际 ${JSON.stringify(res)}`
  ).toBe(true);
  return total;
}

/** 按主键回读四维库存行（GET /inventory/stock/{id}） */
async function readStockById(page: Page, id: number): Promise<Row> {
  return await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
}

/**
 * 管理员对指定条码打一次扫码出库（POST /scanner/scan-to-ship）。
 * 调用方：T1/T2 写腿与各腿清理。入参：page + 条码。
 * 传给谁：handlers/barcode_scanner_handler.rs scan_to_ship_post。
 * 存什么/存哪里：inventory_piece 行 status 列 AVAILABLE→SHIPPED。
 */
async function shipByBarcode(page: Page, barcode: string): Promise<Row> {
  return await apiCallRaw<Row>(page, 'POST', '/scanner/scan-to-ship', {
    barcode,
    order_id: ORDER_ID_NOT_CONSUMED,
  });
}

/**
 * 逐列断库存行三列零写入（改前值等于改后值，差 0）。
 * 调用方：T1/T2/T3 出库与拒绝腿后。入参：before/after 两快照 + 场景标签。
 * 传给谁：expect 断言。存什么/存哪里：不持久化，只判读。
 */
function assertStockColumnsUnchanged(before: Row, after: Row, label: string): void {
  for (const col of ['quantity_on_hand', 'quantity_available', 'quantity_reserved'] as const) {
    expect(
      num(after[col]),
      `${label}：库存列 ${col} 必须零写入（改前 ${JSON.stringify(before[col])} 改后必须同值），` +
        `实得 ${JSON.stringify(after[col])}`
    ).toBe(num(before[col]));
  }
}

test.describe.serial('扫码出库口径与权限链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 扫在册卷码出库 匹池±1与统计±1与库存行零写入三组差值对上', async ({ page }) => {
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `夹具缺产品，productIds=${ctx.productIds.length}`).toBe(true);
    const productId = ctx.productIds[0];
    const target = await pickDyeableWarehouse(page);

    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: target.id,
      quantityMeters: '200',
      pieceCount: 2,
      context: '246T1',
    });
    const dyeLotNo = bundle.dyeLotNo;
    const stockId = num(bundle.stockRow.id);
    const [p1, p2] = bundle.pieces;

    // 改前值：库存行三列 / 本缸匹池两状态计数 / 出库对象的行级状态与米数 / 统计静默窗基线
    const stockBefore = await readStockById(page, stockId);
    expect(num(stockBefore.quantity_available), `播种后可用量必须为 200`).toBe(200);
    expect(num(stockBefore.quantity_reserved), `播种后锁定量必须为 0`).toBe(0);
    const availBefore = await readLotTotalByStatus(
      page,
      productId,
      target.id,
      dyeLotNo,
      'AVAILABLE'
    );
    const shippedBefore = await readLotTotalByStatus(
      page,
      productId,
      target.id,
      dyeLotNo,
      'SHIPPED'
    );
    expect(availBefore, `播种后本缸 AVAILABLE 匹数应为 2`).toBe(2);
    expect(shippedBefore, `播种后本缸 SHIPPED 匹数应为 0`).toBe(0);
    const pieceRowBefore = await readDyedPieceByNo(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: p1.piece_no,
    });
    expect(pieceRowBefore, `应回读到本缸匹 ${p1.piece_no}`).not.toBeNull();
    const statsBase = await readStatsQuietWindow(page, '246 T1 出库前统计基线');

    // 被测写腿
    const shipRes = await shipByBarcode(page, p1.piece_no);
    expect(
      String(shipRes.barcode),
      `出库回显 barcode 必须等于提交的条码原文，实际 ${JSON.stringify(shipRes.barcode)}`
    ).toBe(p1.piece_no);
    expect(
      String(shipRes.piece_no),
      `出库回显 piece_no 必须等于落库匹号，实际 ${JSON.stringify(shipRes.piece_no)}`
    ).toBe(p1.piece_no);

    // 改后值与差值一：行级落库回读——p1 AVAILABLE→SHIPPED，米数与缸号不被出库改写
    const p1After = await readDyedPieceByNo(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: p1.piece_no,
    });
    expect(p1After, `出库后仍应能按四维回读到匹 ${p1.piece_no}`).not.toBeNull();
    expect(
      String((p1After as unknown as Row).status),
      `出库后 p1 落库状态必须是词表 SHIPPED，实得 ${JSON.stringify(
        (p1After as unknown as Row).status
      )}`
    ).toBe('SHIPPED');
    const scanAfter = await apiCallRaw<Row>(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${encodeURIComponent(p1.piece_no)}`
    );
    expect(
      String(scanAfter.status),
      `出库后再扫同一卷码，盘库状态必须同步为 SHIPPED（改前 AVAILABLE 改后 SHIPPED 差一次出库），实得 ${JSON.stringify(
        scanAfter.status
      )}`
    ).toBe('SHIPPED');
    expect(
      num(scanAfter.length),
      `出库不得改写米数，必须仍为建链写入的 100，实得 ${JSON.stringify(scanAfter.length)}`
    ).toBe(100);
    expect(String(scanAfter.batch_no), `出库不得改写缸号承载列，必须仍为 ${dyeLotNo}`).toBe(
      dyeLotNo
    );

    // 差值二：本缸匹池 AVAILABLE 2→1（−1）、SHIPPED 0→1（+1），同缸另一匹 p2 不受波及
    const availAfter = await readLotTotalByStatus(
      page,
      productId,
      target.id,
      dyeLotNo,
      'AVAILABLE'
    );
    const shippedAfter = await readLotTotalByStatus(
      page,
      productId,
      target.id,
      dyeLotNo,
      'SHIPPED'
    );
    expect(
      availAfter,
      `本缸 AVAILABLE 匹数改前 ${availBefore} 出库 1 匹后必须恰为 ${availBefore - 1}`
    ).toBe(availBefore - 1);
    expect(
      shippedAfter,
      `本缸 SHIPPED 匹数改前 ${shippedBefore} 出库 1 匹后必须恰为 ${shippedBefore + 1}`
    ).toBe(shippedBefore + 1);
    const p2After = await readDyedPieceByNo(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: p2.piece_no,
    });
    expect(
      String((p2After as unknown as Row).status),
      `出库同缸另一匹 p2 必须仍 AVAILABLE（不被连带消耗），实得 ${JSON.stringify(
        (p2After as unknown as Row).status
      )}`
    ).toBe('AVAILABLE');

    // 差值三：全表统计在前后静默窗基线上 available −1、shipped +1、总数零变
    const statsAfter = await readStatsQuietWindow(page, '246 T1 出库后统计基线');
    expect(
      statsAfter.shipped,
      `扫码统计 shipped_count 改前 ${statsBase.shipped}，出库 1 匹后必须恰为 +1，实得 ${statsAfter.shipped}`
    ).toBe(statsBase.shipped + 1);
    expect(
      statsAfter.available,
      `扫码统计 available_count 改前 ${statsBase.available}，出库 1 匹后必须恰为 −1，实得 ${statsAfter.available}`
    ).toBe(statsBase.available - 1);
    expect(
      statsAfter.total,
      `扫码统计 total_count 出库前后必须零变（匹行不被删除），实得 ${statsAfter.total}`
    ).toBe(statsBase.total);

    // 库存行零写入不变量（本端点契约真相：不扣 inventory_stocks）
    const stockAfter = await readStockById(page, stockId);
    assertStockColumnsUnchanged(stockBefore, stockAfter, 'T1 出库成功腿');
    console.warn(
      '246 T1 缺口点名：POST /scanner/scan-to-ship 只翻 inventory_piece.status，' +
        '不扣 inventory_stocks 的 quantity_available 与 quantity_reserved，也不校验 order_id 对应单据' +
        '（barcode_scanner_handler.rs:86-115 _order_id 不消费；扣减仅存在于销售出库面 ' +
        'so/delivery_ops/inventory.rs reduce_inventory_four_dim）。扫码出库与账面库存行脱钩，' +
        '需业务侧裁定是否补齐；本用例按既有契约如实钉零写入不变量。'
    );

    // 清理：消耗 p2 后按缸号回读 AVAILABLE 归零，再删库存行并回读 404
    await shipByBarcode(page, p2.piece_no);
    const left = await fetchAvailableDyedPieces(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
    });
    expect(left.length, `清理后本缸 ${dyeLotNo} 不应留 AVAILABLE 匹，实剩 ${left.length}`).toBe(0);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `246 T1 库存行 ${stockId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/inventory/stock/${stockId}`);
    expect(gone.status, `库存行删除后按主键回读必须 404，实得 ${JSON.stringify(gone)}`).toBe(404);
  });

  test('T2 重复出库同一卷码被状态门拒400 拒绝后匹与库存行零写入', async ({ page }) => {
    const ctx = getCtx();
    const target = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId: ctx.productIds[0],
      warehouseId: target.id,
      quantityMeters: '100',
      pieceCount: 1,
      context: '246T2',
    });
    const piece = bundle.pieces[0];
    const stockId = num(bundle.stockRow.id);
    const dyeLotNo = bundle.dyeLotNo;

    await shipByBarcode(page, piece.piece_no);
    const stockBefore = await readStockById(page, stockId);

    // 第二腿：对已 SHIPPED 的卷码重复出库——必须被状态门拒绝并点名归因
    const dup = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: piece.piece_no,
      order_id: ORDER_ID_NOT_CONSUMED,
    });
    expect(dup.status, `重复出库必须 400（状态门），实得 ${JSON.stringify(dup)}`).toBe(400);
    expect(
      failureCode(dup),
      `重复出库拒绝机器码必须是 BAD_REQUEST（参数/状态面拒绝），不得漂到权限面或 404，实得 ${JSON.stringify(
        dup.code
      )}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);

    // 拒绝零写入：匹状态保持 SHIPPED、库存行三列不动
    const pieceAfter = await readDyedPieceByNo(page, {
      productId: ctx.productIds[0],
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: piece.piece_no,
    });
    expect(
      String((pieceAfter as unknown as Row).status),
      `重复出库被拒后匹状态必须仍为 SHIPPED（首次出库的终态不被改写），实得 ${JSON.stringify(
        (pieceAfter as unknown as Row).status
      )}`
    ).toBe('SHIPPED');
    const stockAfter = await readStockById(page, stockId);
    assertStockColumnsUnchanged(stockBefore, stockAfter, 'T2 重复出库被拒腿');

    await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `246 T2 库存行 ${stockId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/inventory/stock/${stockId}`);
    expect(gone.status, `库存行删除后回读必须 404，实得 ${JSON.stringify(gone)}`).toBe(404);
  });

  test('T3 扫未知码404点名 出库面权限双向腿 销售与仓管被拒零写入 管理员放行落库', async ({
    page,
  }) => {
    const ctx = getCtx();
    const target = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId: ctx.productIds[0],
      warehouseId: target.id,
      quantityMeters: '100',
      pieceCount: 1,
      context: '246T3',
    });
    const piece = bundle.pieces[0];
    const stockId = num(bundle.stockRow.id);
    const dyeLotNo = bundle.dyeLotNo;

    // 未知条码（管理员会话）：进 handler 命中"查无此码"分支——404 + NOT_FOUND 点名拒绝原因
    const fake = `E2E246NOSUCHBARCODE-${Date.now()}`;
    const notFound = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: fake,
      order_id: ORDER_ID_NOT_CONSUMED,
    });
    expect(notFound.status, `扫未知码出库必须 404，实得 ${JSON.stringify(notFound)}`).toBe(404);
    expect(
      failureCode(notFound),
      `扫未知码拒绝机器码必须是 NOT_FOUND，实得 ${JSON.stringify(notFound.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    const stockBaseline = await readStockById(page, stockId);
    const dims = {
      productId: ctx.productIds[0],
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: piece.piece_no,
    };

    // 拒绝腿一：salesperson 无派生键 scan-to-ship:create，POST 必被 RBAC 拦在 handler 前
    await loginAsRole(page, 'salesperson');
    const deniedSales = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: piece.piece_no,
      order_id: ORDER_ID_NOT_CONSUMED,
    });
    expectDenied(
      deniedSales,
      'salesperson 打 POST /api/v1/erp/scanner/scan-to-ship（派生键 scan-to-ship:create 未授予且该资源未登记，除超管全员 403）应被权限中间件拒绝'
    );
    expect(
      failureCode(deniedSales),
      `salesperson 被拒必须归因权限门 FORBIDDEN，不得漂到 400/404 参数面，实得 ${JSON.stringify(
        deniedSales.code
      )}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);
    await loginViaUI(page, undefined, undefined, true);
    const afterSales = await readDyedPieceByNo(page, dims);
    expect(
      String((afterSales as unknown as Row).status),
      `salesperson 被拒后匹状态必须仍 AVAILABLE（拒绝不得触库），实得 ${JSON.stringify(
        (afterSales as unknown as Row).status
      )}`
    ).toBe('AVAILABLE');
    assertStockColumnsUnchanged(
      stockBaseline,
      await readStockById(page, stockId),
      'T3 salesperson 被拒腿'
    );

    // 拒绝腿二：warehouse_keeper 持 scan-receipt:create 但 scan-to-ship 不在其授权面，
    // 同一请求同样 403——钉住"扫码出库当前仅超管可用"的授权面实况（缺口点名见头部契约真相）
    await loginAsRole(page, 'warehouse_keeper');
    const deniedKeeper = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: piece.piece_no,
      order_id: ORDER_ID_NOT_CONSUMED,
    });
    expectDenied(
      deniedKeeper,
      'warehouse_keeper 打 POST /scanner/scan-to-ship（种子矩阵只授该岗 scan-receipt:create，scan-to-ship 键未登记不覆盖）应被权限中间件拒绝'
    );
    await loginViaUI(page, undefined, undefined, true);
    const afterKeeper = await readDyedPieceByNo(page, dims);
    expect(
      String((afterKeeper as unknown as Row).status),
      `warehouse_keeper 被拒后匹状态必须仍 AVAILABLE，实得 ${JSON.stringify(
        (afterKeeper as unknown as Row).status
      )}`
    ).toBe('AVAILABLE');
    assertStockColumnsUnchanged(
      stockBaseline,
      await readStockById(page, stockId),
      'T3 warehouse_keeper 被拒腿'
    );

    // 放行腿：管理员同一请求 200 且 status 真实落库 SHIPPED（证明两枚 403 归因角色授权面）
    await shipByBarcode(page, piece.piece_no);
    const afterAdmin = await readDyedPieceByNo(page, dims);
    expect(
      String((afterAdmin as unknown as Row).status),
      `管理员放行腿必须把匹状态写落为 SHIPPED，实得 ${JSON.stringify(
        (afterAdmin as unknown as Row).status
      )}`
    ).toBe('SHIPPED');
    const scanAfter = await apiCallRaw<Row>(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${encodeURIComponent(piece.piece_no)}`
    );
    expect(String(scanAfter.status), '放行后盘库回读必须同步 SHIPPED').toBe('SHIPPED');

    // 清理：本缸 AVAILABLE 池归零回读 + 删除库存行回读 404
    const left = await fetchAvailableDyedPieces(page, {
      productId: ctx.productIds[0],
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
    });
    expect(left.length, `清理后本缸 ${dyeLotNo} 不应留 AVAILABLE 匹`).toBe(0);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `246 T3 库存行 ${stockId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/inventory/stock/${stockId}`);
    expect(gone.status, `库存行删除后回读必须 404，实得 ${JSON.stringify(gone)}`).toBe(404);
  });
});
