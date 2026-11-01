import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectDenied,
  failureCode,
  fetchAvailableDyedPieces,
  genCode,
  genDyeLotNo,
  getCtx,
  loginAsRole,
  loginViaUI,
  pickDyeableWarehouse,
  readDyedPieceByNo,
  seedDyedPieceChain,
  type DyedSeedPiece,
} from './helpers';

/**
 * 扫码盘库与扫码统计 E2E 用例（三枚 test）
 *
 * 功能。把"扫一个真实存在的卷码，盘库解析出的对象与委外染色链写入方逐列一致"钉成
 * 双通道逐字段回读断言（T1：条码原文、匹号、产品、仓库、缸号承载列 batch_no、米数、
 * 状态逐列等于 GET /inventory/pieces 的落库行）；把"扫不存在的码被点名拒绝、缺参被
 * 参数门拒绝"钉成机器码判据（T2，归因 NOT_FOUND / BAD_REQUEST 而非中文文案），并把
 * 盘库 GET 面的权限双向腿钉成销售角色 403 归因 FORBIDDEN、管理员同一请求进 handler
 * 产 404（T2 后半，层差即拒因）；把扫码统计与细码列表两个独立通道在同一静默窗口内的
 * 按状态计数钉成聚合一致性断言（T3，available 与 total 两列逐值相等，外加形态不变量
 * 与播种净增下界归因），断的是聚合口径本身，不是 HTTP 200。
 *
 * 调用方。Playwright E2E 串行链，T1 与 T2 前半与 T3 走 worker 专属管理员会话，
 * T2 权限腿先 loginAsRole 切到 salesperson 打拒绝腿、再 loginViaUI(force) 切回管理员
 * 打放行腿。前端调用点：views/barcode-scanner/index.vue（路由 barcode-scanner，
 * router/index.ts:870）经 api/barcode-scanner.ts 的 scanInventory 打
 * GET /scanner/scan-inventory；getScanStatistics 在 api/barcode-scanner.ts:68 定义，
 * 为扫码域统计取数口。
 *
 * 入参。scan-inventory 唯一查询键 barcode，取真实链产匹的条码原文（写入方口径
 * barcode = piece_no，见 services/piece_domain_service.rs:657 染色匹落库构造）；
 * scan-statistics 无入参。夹具产品取 ensureTestEntities 落库的真实主键，仓库取
 * pickDyeableWarehouse 的可承载染色匹仓，缸号用 genDyeLotNo 唯一值，
 * 跨用例不共享可变夹具态。
 *
 * 传给谁。播种腿打 helpers.seedDyedPieceChain（真实委外染色链：生产订单→流转卡→
 * 逐匹报工→染色委外→发料→回仓确认，产 AVAILABLE 染色匹）；对象回读腿打
 * GET /inventory/pieces（handlers/inventory_piece_handler.rs list_pieces）；被测腿打
 * GET /scanner/scan-inventory 与 GET /scanner/scan-statistics
 * （handlers/barcode_scanner_handler.rs scan_inventory 与 scan_statistics）；清理腿打
 * POST /scanner/scan-to-ship（把本用例产的匹置为其词表终态 SHIPPED，出库面唯一
 * 可写的收束通道）并按缸号回读 AVAILABLE 池归零。
 *
 * 存什么。两条被测端点都是读腿，不落库；写入面只在播种链（inventory_piece 匹行）
 * 与清理消耗（匹行 status 列 AVAILABLE→SHIPPED）。米数出参是 DECIMAL 字符串，
 * 数值判定一律 Number(String(v)) 归一，绝不在测试里做二次四舍五入。
 *
 * 存哪里。PostgreSQL inventory_piece 表（盘库投影列 barcode/piece_no/product_id/
 * batch_no/warehouse_id/location_id/length/weight/status/remarks 全部取自该表行；
 * 统计为该表按 status 的 COUNT FILTER 聚合）。
 *
 * 契约真相（逐段读后端源，非推测）。
 * scan_inventory 是 GET /api/v1/erp/scanner/scan-inventory 唯一 handler
 * （routes/analytics.rs scanner 族，nest 到 /api/v1/erp）：缺 barcode 查询键产
 * AppError::bad_request（HTTP 400，机器码 BAD_REQUEST）；按 inventory_piece.barcode
 * 等值查不到产 AppError::not_found（HTTP 404，机器码 NOT_FOUND）。投影里没有 id 列、
 * 也没有 dye_lot_no 列：对象身份只能以 barcode + piece_no + product_id + warehouse_id
 * 钉，缸号由 batch_no 列承载——写入方 piece_domain_service.rs:624-640 染色匹恒
 * batch_no = dye_lot_no = 缸号，故断 batch_no 等于播种缸号即钉住缸号口径；
 * location_id 为 NULL 时如实投影 null（写入方对染色匹不分配库位）。
 * scan_statistics 对 inventory_piece 全表做四枚 COUNT(*) FILTER（AVAILABLE /
 * SHIPPED / DEFECT / RESERVED）加一枚 COUNT(*)：词表另有 UNAVAILABLE 与 SAMPLE
 * 两态（models/status/purchase_inventory.rs:161-179），故四列之和只保证不超过总数，
 * 相等关系只在能与列表通道对账的列上断。管理员会话的 GET /inventory/pieces 数据范围
 * 为 all（handlers/inventory_piece_handler.rs apply_data_scope），与统计同表同谓词，
 * 两通道对账成立。
 * 权限面键派生（middleware/permission.rs extract_resource_info 默认分支 +
 * utils/path_utils.rs:57 scanner 为模块前缀）：GET /scanner/scan-inventory 派生键
 * scan-inventory:read、GET /scanner/scan-statistics 派生 scan-statistics:read、
 * POST /scanner/scan-to-ship 派生 scan-to-ship:create。三枚都未登记进
 * services/init_service.rs 的 PERMISSION_RESOURCES（扫码族仅 scan-receipt 在册，
 * init_service_ops/permission.rs 也只对 warehouse_keeper 与 warehouse_manager 授
 * scan-receipt:create），matches_permission 为资源段精确匹配、不被任何粗域覆盖，
 * 故除通配超管外任何角色访问这三枚一律 403——扫码出库页当前实际只有超管会话可用，
 * 该缺口已写进交付报告，本文件据此只以管理员会话打放行腿。
 * 静默窗口说明：scan-statistics 是全表聚合，活库上其它并行用例的产匹/出库会改动
 * 计数，故跨通道对账采用"两次统计读夹住一次列表读、仅在前后两次统计逐值相等（静默
 * 窗内无人写表）时断等值"的采样判据；连采不中即显式判红点名并发写入，不放宽、
 * 不跳过。播种归因用下界（routes/inventory.rs 对匹只挂 list 与 print，无 HTTP 删除口，
 * 全表行数只增不减；本用例产的匹从 AVAILABLE 进入、终态 SHIPPED，恒落在四状态集内），
 * 并发写只抬高不压低下界，判据确定性成立。
 *
 * 状态词表取值清单（逐字符取自 models/status/purchase_inventory.rs::inventory_piece）：
 * AVAILABLE / SHIPPED / DEFECT / UNAVAILABLE / RESERVED / SAMPLE
 */

type Row = Record<string, unknown>;

/** DECIMAL 与整数出参可能是字符串形态，数值判定一律先 Number(String(v)) 归一 */
const num = (v: unknown): number => Number(String(v));

/**
 * 按条码打一次扫码盘库（GET /scanner/scan-inventory）。
 * 调用方：T1 双通道对账与 T2 负例与放行腿。入参：page + 条码原文。
 * 传给谁：断言函数或 apiCallExpectFail 的 URL。存什么/存哪里：不持久化，
 * 返回盘库投影当前值。
 */
function scanInventoryPath(barcode: string): string {
  return `/scanner/scan-inventory?barcode=${encodeURIComponent(barcode)}`;
}

interface StatsSnapshot {
  available: number;
  shipped: number;
  defect: number;
  reserved: number;
  total: number;
}

/**
 * 读一次扫码统计并做形态校验（GET /scanner/scan-statistics）。
 * 调用方：T3 各采样点。入参：page。
 * 传给谁：静默窗对账与下界归因断言。存什么/存哪里：不持久化。
 * 每列必须是 0 或正整数（后端 ScanStatisticsRow 为 i64），形态不符即判红，不兜底成 0；
 * 四状态和不超过总数是全词表下的结构不变量。
 */
async function readScanStatistics(page: Page): Promise<StatsSnapshot> {
  const data = await apiCallRaw<Row>(page, 'GET', '/scanner/scan-statistics');
  const snap: StatsSnapshot = {
    available: num(data.available_count),
    shipped: num(data.shipped_count),
    defect: num(data.defect_count),
    reserved: num(data.reserved_count),
    total: num(data.total_count),
  };
  for (const [col, val] of Object.entries(snap)) {
    expect(
      Number.isInteger(val) && val >= 0,
      `扫码统计列 ${col} 必须是非负整数，实际 ${JSON.stringify(data)}`
    ).toBe(true);
  }
  expect(
    snap.available + snap.shipped + snap.defect + snap.reserved <= snap.total,
    `扫码统计四状态计数和 ${snap.available}+${snap.shipped}+${snap.defect}+${snap.reserved} ` +
      `不得超过总数 ${snap.total}（词表另有 UNAVAILABLE/SAMPLE，只容许小于等于），实际 ${JSON.stringify(
        data
      )}`
  ).toBe(true);
  return snap;
}

/** 把统计快照序列化成比较键：逐值全等才算同一静默窗内的同一份聚合 */
function statsKey(s: StatsSnapshot): string {
  return JSON.stringify(s);
}

/**
 * 按状态读细码列表的分页总数（GET /inventory/pieces 的 total 列）。
 * 调用方：T3 跨通道对账。入参：page + 状态词表值（缺省不带状态过滤=全表行数）。
 * 传给谁：聚合一致性断言。存什么/存哪里：不持久化。
 */
async function readPiecesTotal(page: Page, status?: string): Promise<number> {
  const qs = status ? `?status=${status}&page=1&page_size=1` : '?page=1&page_size=1';
  const res = await apiCallRaw<Row>(page, 'GET', `/inventory/pieces${qs}`);
  const total = num(res.total);
  expect(
    Number.isInteger(total) && total >= 0,
    `细码列表 total 必须是 0 或正整数，实际 ${JSON.stringify(res)}`
  ).toBe(true);
  return total;
}

/**
 * 消耗本用例产的 AVAILABLE 匹作为清理：匹行没有 HTTP 删除口，SHIPPED 是其在出库面
 * 的终态，置为终态即离开 AVAILABLE 池。清理失败不吞——直接让用例判红点名哪匹没清掉。
 * 调用方：T1/T3 清理位点。入参：page + 匹行集合。
 * 传给谁：POST /scanner/scan-to-ship（handlers/barcode_scanner_handler.rs
 * scan_to_ship_post；该实现按条码取匹、order_id 已按真实会话订单传入但其未被消费，
 * 见 246 契约真相）。存什么/存哪里：inventory_piece.status 列 AVAILABLE→SHIPPED。
 */
async function consumePiecesAsCleanup(page: Page, pieces: DyedSeedPiece[]): Promise<void> {
  for (const p of pieces) {
    await apiCallRaw<Row>(page, 'POST', '/scanner/scan-to-ship', {
      barcode: p.piece_no,
      order_id: 1,
    });
  }
}

test.describe.serial('扫码盘库与扫码统计口径链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 扫真实卷码 盘库投影与细码落库行逐列一致 缸号米数状态同值', async ({ page }) => {
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `夹具缺产品，productIds=${ctx.productIds.length}`).toBe(true);
    const productId = ctx.productIds[0];
    const target = await pickDyeableWarehouse(page);
    const dyeLotNo = genDyeLotNo();
    const colorNo = `E2C-${genCode('245A')}`;

    const pieces = await seedDyedPieceChain(page, {
      productId,
      warehouseId: target.id,
      colorNo,
      dyeLotNo,
      pieceCount: 1,
      lengthPerPieceMeters: 100,
      context: '245T1',
    });
    const piece = pieces[0];

    // 写入方口径回读：细码列表行的 barcode 必须等于匹号（piece_domain_service.rs:657）
    const listRow = await readDyedPieceByNo(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
      pieceNo: piece.piece_no,
    });
    expect(listRow, `按四维 tuple 应回读到本用例播种的匹 ${piece.piece_no}`).not.toBeNull();
    const rawRow = listRow as unknown as Row;
    expect(
      String(rawRow.barcode),
      `染色匹落库 barcode 必须等于匹号（写入方口径），实际 ${JSON.stringify(rawRow.barcode)}`
    ).toBe(piece.piece_no);
    expect(
      String(rawRow.status),
      `播种后细码行状态必须是词表 AVAILABLE，实际 ${JSON.stringify(rawRow.status)}`
    ).toBe('AVAILABLE');

    // 被测腿：按条码扫码盘库
    const scanned = await apiCallRaw<Row>(page, 'GET', scanInventoryPath(piece.piece_no));

    // 逐列对账：盘库投影 vs 细码落库行（两独立通道读同一行，逐值相等）
    for (const col of ['barcode', 'piece_no', 'batch_no'] as const) {
      expect(
        String(scanned[col]),
        `盘库列 ${col} 必须与细码落库行逐字相等，盘库=${JSON.stringify(scanned[col])} ` +
          `细码=${JSON.stringify(rawRow[col])}`
      ).toBe(String(rawRow[col]));
    }
    for (const col of ['product_id', 'warehouse_id'] as const) {
      expect(
        num(scanned[col]),
        `盘库列 ${col} 必须与细码落库行逐值相等，盘库=${JSON.stringify(scanned[col])} ` +
          `细码=${JSON.stringify(rawRow[col])}`
      ).toBe(num(rawRow[col]));
    }
    // 缸号口径：盘库投影无 dye_lot_no 列，缸号由 batch_no 承载（写入方恒 batch=缸号）
    expect(
      String(scanned.batch_no),
      `盘库解析出的缸号承载列 batch_no 必须等于播种缸号 ${dyeLotNo}，实际 ${JSON.stringify(
        scanned.batch_no
      )}`
    ).toBe(dyeLotNo);
    expect(
      String(scanned.batch_no),
      '盘库 batch_no 必须与细码行 dye_lot_no 同值（染色匹 batch=缸恒成立）'
    ).toBe(String(rawRow.dye_lot_no));
    // 米数口径：断为播种写入的 100 米，DECIMAL 字符串按 Number 归一后逐值相等
    expect(
      num(scanned.length),
      `盘库解析出的米数必须等于建链写入的 100，实际 ${JSON.stringify(scanned.length)}`
    ).toBe(100);
    expect(
      num(scanned.length),
      `盘库米数与细码落库行米数必须逐值相等，细码=${JSON.stringify(rawRow.length)}`
    ).toBe(num(rawRow.length));
    expect(
      String(scanned.status),
      `盘库状态必须回读 AVAILABLE（词表大写），实际 ${JSON.stringify(scanned.status)}`
    ).toBe('AVAILABLE');
    // 可空列如实投影：染色匹未分配库位，location_id 必须是 null 而不是 0 或空串
    expect(
      scanned.location_id === null,
      `盘库 location_id 必须如实投影 null（未分配库位），洗成 0 或空串即判红，实际 ${JSON.stringify(
        scanned.location_id
      )}`
    ).toBe(true);

    await consumePiecesAsCleanup(page, pieces);
    // 清理生效回读：本缸的 AVAILABLE 匹必须为 0
    const left = await fetchAvailableDyedPieces(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
    });
    expect(left.length, `清理后本缸号 ${dyeLotNo} 不应再留 AVAILABLE 匹，实际 ${left.length}`).toBe(
      0
    );
  });

  test('T2 扫不存在的码被404点名 缺参被400拒绝 销售角色被RBAC拒管理员可进handler', async ({
    page,
  }) => {
    const fake = `E2E245NOSUCHBARCODE-${genCode('X')}`;

    // 不存在的码：404 + NOT_FOUND 机器码（拒绝原因归因"查无此码"，非中文文案）
    const notFound = await apiCallExpectFail(page, 'GET', scanInventoryPath(fake));
    expect(notFound.status, `扫不存在的条码必须 404，实际 ${JSON.stringify(notFound)}`).toBe(404);
    expect(
      failureCode(notFound),
      `扫不存在条码的拒绝机器码必须是 NOT_FOUND（点名查无此码），实际 ${JSON.stringify(
        notFound.code
      )}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    // 缺 barcode 查询键：400 + BAD_REQUEST（参数门，与权限门面区分归因）
    const missing = await apiCallExpectFail(page, 'GET', '/scanner/scan-inventory');
    expect(missing.status, `缺 barcode 参数必须 400，实际 ${JSON.stringify(missing)}`).toBe(400);
    expect(
      failureCode(missing),
      `缺参拒绝机器码必须是 BAD_REQUEST，实际 ${JSON.stringify(missing.code)}`
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);

    // 权限拒绝腿：salesperson 无派生键 scan-inventory:read（扫码族除 scan-receipt 外
    // 无任何在册资源，本岗种子里更没有 scanner 域键），GET 必须先被 RBAC 中间件
    // 拦在 handler 之前——同一请求对管理员会进 handler 产 404，403 与 404 的层差即拒因
    await loginAsRole(page, 'salesperson');
    const denied = await apiCallExpectFail(page, 'GET', scanInventoryPath(fake));
    expectDenied(
      denied,
      `salesperson 打 GET /api/v1/erp/scanner/scan-inventory（派生键 scan-inventory:read 未授予）应被权限中间件 403 拒绝`
    );
    expect(
      failureCode(denied),
      `salesperson 被拒必须是权限门机器码 FORBIDDEN，不得漂到参数面，实际 ${JSON.stringify(
        denied.code
      )}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 放行腿：管理员同一请求进 handler 并命中"查无此码"分支（404 NOT_FOUND），
    // 证明 salesperson 的 403 归因权限面而非该端点整体不可达
    await loginViaUI(page, undefined, undefined, true);
    const allowed = await apiCallExpectFail(page, 'GET', scanInventoryPath(fake));
    expect(
      allowed.status,
      `管理员同一请求应进 handler 得 404（放行面），实际 ${JSON.stringify(allowed)}`
    ).toBe(404);
    expect(failureCode(allowed)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('T3 扫码统计与细码列表双通道对账 静默窗逐值相等 播种净增下界归因', async ({ page }) => {
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `夹具缺产品，productIds=${ctx.productIds.length}`).toBe(true);
    const productId = ctx.productIds[0];
    const target = await pickDyeableWarehouse(page);

    // 播种前基线（下界归因用）
    const before = await readScanStatistics(page);

    // 真实链净产 1 匹 AVAILABLE（本用例自己的净贡献）
    const dyeLotNo = genDyeLotNo();
    const pieces = await seedDyedPieceChain(page, {
      productId,
      warehouseId: target.id,
      colorNo: `E2C-${genCode('245B')}`,
      dyeLotNo,
      pieceCount: 1,
      lengthPerPieceMeters: 100,
      context: '245T3',
    });
    expect(pieces.length, `播种链必须净产 1 匹 AVAILABLE`).toBe(1);

    // 下界归因：匹行无 HTTP 删除口（routes/inventory.rs 对匹只挂 list 与 print），
    // 全表行数只增不减；本用例产的匹从 AVAILABLE 进入、终态 SHIPPED，恒落在四状态集内。
    const after = await readScanStatistics(page);
    expect(
      after.total >= before.total + 1,
      `播种 1 匹后 total_count 必须至少 +1（匹行只增不删），前=${JSON.stringify(before)} 后=${JSON.stringify(
        after
      )}`
    ).toBe(true);
    expect(
      after.available + after.shipped + after.defect + after.reserved >=
        before.available + before.shipped + before.defect + before.reserved + 1,
      `播种 1 匹后四状态计数和必须至少 +1（产的匹恒落在这四个状态集内），前=${JSON.stringify(
        before
      )} 后=${JSON.stringify(after)}`
    ).toBe(true);

    // 跨通道对账：静默窗采样——两次统计读夹住列表读，
    // 仅当前后两次统计逐值相等（窗内无人写表）时才断等值；连采不中即判红点名并发。
    const MAX_WINDOWS = 8;
    let matched = false;
    let lastPair = '';
    for (let i = 0; i < MAX_WINDOWS && !matched; i++) {
      const s1 = await readScanStatistics(page);
      const availListTotal = await readPiecesTotal(page, 'AVAILABLE');
      const allListTotal = await readPiecesTotal(page);
      const s2 = await readScanStatistics(page);
      lastPair = `${statsKey(s1)} vs ${statsKey(s2)}`;
      if (statsKey(s1) === statsKey(s2)) {
        matched = true;
        expect(
          s1.available,
          `静默窗内 available_count(${s1.available}) 必须等于细码列表 status=AVAILABLE 的 ` +
            `分页 total(${availListTotal})——两通道同表同谓词，对不上即统计口径漂移`
        ).toBe(availListTotal);
        expect(
          s1.total,
          `静默窗内 total_count(${s1.total}) 必须等于细码列表无过滤的分页 total(${allListTotal})`
        ).toBe(allListTotal);
      }
    }
    expect(
      matched,
      `连续 ${MAX_WINDOWS} 次都采不到静默窗（两次 scan-statistics 读数从不逐值相等），` +
        `最后对 ${lastPair}——活库并发写入未停，跨通道等值无法成立，显式判红不放宽`
    ).toBe(true);

    // 清理：消耗本用例产的匹并回读 AVAILABLE 池归零
    await consumePiecesAsCleanup(page, pieces);
    const left = await fetchAvailableDyedPieces(page, {
      productId,
      warehouseId: target.id,
      dyeLotNo,
      batchNo: dyeLotNo,
    });
    expect(left.length, `清理后本缸号 ${dyeLotNo} 不应再留 AVAILABLE 匹`).toBe(0);
  });
});
