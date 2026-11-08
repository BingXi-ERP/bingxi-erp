// 面料库存细码与卷号链、盘点反向腿的 e2e 契约用例。
//
// 覆盖面。本文件钉七段真实链。
// 一、细码录入。面料库存行的真实计量粒度是"一行一卷的细码"，录入面是
// POST /inventory/stock/fabric，逐字段带批次、缸号、色号、米数、公斤数、克重、门幅、
// 架号、层号，保存后必须从列表与详情两侧逐字段回读对齐。
// 二、零头余码。不足整卷的零头行与整卷行同仓同品并存时，两行米数在出参里必须可区分，
// 零头不被抹平到整卷也不被清零。
// 三、计量字段。米与公斤是两列独立存储事实，仓内没有换算端点，断言存储值与单位字段
// 本身按录入值落库，不自造换算规则。DECIMAL 出参为十进制字符串，断言先钉类型再钉数值。
// 四、按细码出库。白坯调拨出库按产品加批次精确扣减且不做跨缸回退，出库后本行在库量
// 与可用量减少，同仓其它批次行分毫不动。
// 五、盘点盘盈盘亏同单两腿。一张盘点单同时覆盖一行盘盈一行盘亏，差异一正一负分别落库，
// 过账后两行库存分别精确落到实盘量，状态逐字符走 pending、in_review、completed 词表。
// 六、反向防呆两腿。出库量超过该批次行在架可用量必须在建单期四维预检即被 400 业务码整笔拒掉
// （预检只读不占用，失败回信封、无单据载荷、库存三列不动）；同批次两笔各按全额建单成功后，
// 可用量被先发那笔占尽，后发那笔必须在发运事务内的扣减规划被拒，且被拒后调拨单状态、
// 明细已发量与库存三列都不得出现半成品。两处库存不足拒绝均走 AppError::business 脱敏站点，
// 出参文案钉固定常量、不断言外显差额（与本仓其它脱敏站点用例同一口径）。
// 七、权限门。销售岗直连库存细码列表、详情、录入与盘点端点全部被 RBAC 拒绝，
// 统一失败信封含机器码 FORBIDDEN，无权身份拿不到任何数据行，成本类字段随不可达行天然不外泄。
//
// 事实来源。端点与 HTTP 方法逐条对照 frontend/scripts/route-snapshot.txt 的 inventory 分组。
// 出参键名以 backend/src/models/inventory_stock.rs、inventory_transfer.rs、inventory_count.rs、
// inventory_count_item.rs 的实体字段为准，snake_case。状态词表唯一来源是
// backend/src/models/status/purchase_inventory.rs 的 inventory_transfer 模块（小写
// pending、approved、rejected、shipped、completed）与 inventory_count 模块（小写
// pending、in_review、completed）。库存行的 stock_status 默认"正常"、quality_status
// 默认"合格"、grade 写入"一等品"，均为 backend/src/services/inv/stock.rs 与
// inventory_stock_service.rs 写入侧字面值，中文词表不英文化。
// 出库四维校验与白坯不回退口径见 backend/src/services/inv/stock.rs 的
// check 函数族与 services/inv/batch.rs 的库存不足业务错误构造。
// 分页信封：库存列表为 PaginatedResponse 的 items、total、page、page_size 四键，
// 盘点列表数组键为 counts，调拨明细端点 data 直接是数组。
// 全部打真实后端，不用 route mock，不用宽松断言掩盖源码问题。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  getCtx,
  genCode,
  seedFourDimStockIn,
  seedGreigeStockIn,
  verifyStockFourDim,
  failureCode,
  expectBusinessRejection,
  expectDenied,
  getRoleCredential,
  loginInIsolatedContext,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';
import { pickListArray } from './ui-helpers';

/** 本专用色号与缸号与批次的前缀，逐轮由 tag 唯一化，隔离其它分片的共享库数据。 */
function dims443(tag: string) {
  return {
    colorNo: `E2E-443-C${tag}`,
    dyeLotNo: `E2E-443-D${tag}`,
    batchNo: `E2E-443-B${tag}`,
  };
}

/**
 * AppError::business 脱敏站点的固定出参文案（backend/src/utils/messages.rs 的
 * err_msg::BUSINESS_PUBLIC；真实拒绝原因只进后端日志，不外显给调用方）。
 * 库存调拨的建单预检与出库扣减两处库存不足拒绝都走该站点（services/inv/stock.rs 的
 * match_single_item_against_stocks 与 services/inv/batch.rs 的 insufficient_error），
 * 因此本文件按固定常量钉住，不断言外显差额文案——与本仓其它脱敏站点用例同一口径。
 */
const SANITIZED_BUSINESS_MESSAGE = '业务处理失败';

/** 读回响应里的一个键并转成数字，键缺席或非有限值直接抛错并点名主语，不用 ?? 0 掩盖缺键。 */
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

/** 数量按 0.01 容差比较，失败信息带期望与实际（DECIMAL 序列化位数与录入位数不同）。 */
function expectQuantity(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}，期望=${expected} 实际=${actual}`).toBeLessThan(
    0.01
  );
}

/**
 * 录入一行卷级细码库存（POST /inventory/stock/fabric）。
 * 入参为四维加米数公斤数克重门幅架号层号，全部按字符串传 DECIMAL 事实。
 * 传给后端 inventory_stock_handler_fabric::create_stock_fabric，落库到 inventory_stocks 表，
 * 出参键以 backend/src/models/inventory_stock.rs 实体字段为准。
 */
async function seedRoll(
  page: import('@playwright/test').Page,
  opts: {
    productId: number;
    warehouseId: number;
    tag: string;
    quantityMeters: string;
    quantityKg: string;
    gramWeight: string;
    width: string;
    shelfNo: string;
    layerNo: string;
  }
): Promise<void> {
  const d = dims443(opts.tag);
  await apiCall(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: opts.warehouseId,
    product_id: opts.productId,
    batch_no: d.batchNo,
    color_no: d.colorNo,
    dye_lot_no: d.dyeLotNo,
    grade: '一等品',
    quantity_meters: opts.quantityMeters,
    quantity_kg: opts.quantityKg,
    gram_weight: opts.gramWeight,
    width: opts.width,
    shelf_no: opts.shelfNo,
    layer_no: opts.layerNo,
  });
  console.warn(`443 seedRoll 录入细码行 batch=${d.batchNo} meters=${opts.quantityMeters}`);
}

/** 按本专用四维回读库存行，未命中立即抛错，调用方拿到的一定是真实落库行。 */
async function rereadRoll(
  page: import('@playwright/test').Page,
  productId: number,
  warehouseId: number,
  tag: string
): Promise<Record<string, unknown>> {
  const d = dims443(tag);
  const row = await verifyStockFourDim(page, productId, d.colorNo, d.dyeLotNo, {
    batchNo: d.batchNo,
    warehouseId,
  });
  if (!row) {
    throw new Error(`细码库存行回读为空，product=${productId} warehouse=${warehouseId} tag=${tag}`);
  }
  return row;
}

/** 按库存行 id 走详情端点回读（GET /inventory/stock/{id}），与列表侧回读互为第二证据。 */
async function readStockDetail(
  page: import('@playwright/test').Page,
  stockId: number
): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(page, 'GET', `/inventory/stock/${stockId}`);
}

/**
 * 按批次回读单行库存（GET /inventory/stock 的 batch_no 为 SQL 下推过滤）。
 * 白坯行色号为空，四维助手要求的完整四维行不适用，此处按 产品加仓库加批次 定位。
 */
async function readStockByBatch(
  page: import('@playwright/test').Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Record<string, unknown>> {
  const path =
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=20`;
  const res = await apiCallRaw<{ items?: unknown }>(page, 'GET', path);
  const rows = pickListArray<Record<string, unknown>>(res, 'items', `批次 ${batchNo} 库存回读`);
  const row = rows.find(r => String(r.batch_no) === batchNo);
  if (!row) {
    throw new Error(
      `按批次回读未命中库存行，product=${productId} warehouse=${warehouseId} batch=${batchNo}，候选行数=${rows.length}`
    );
  }
  return row;
}

/** 调拨主表回读（GET /inventory/transfers/{id}），状态与时间戳断言的唯一读回通道。 */
async function readTransferDetail(
  page: import('@playwright/test').Page,
  transferId: number
): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(page, 'GET', `/inventory/transfers/${transferId}`);
}

/** 读回盘点详情（出参 CountResponse，主表列与 items 明细同层）。 */
async function readCountDetail(
  page: import('@playwright/test').Page,
  countId: number
): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(page, 'GET', `/inventory/counts/${countId}`);
}

/** 盘点明细读回按 stock_id 定位专属行，定位不到即抛错而不是拿第一条蒙过。 */
function pickCountItem(
  detail: Record<string, unknown>,
  stockId: number,
  label: string
): Record<string, unknown> {
  const items = pickListArray<Record<string, unknown>>(detail, 'items', label);
  const row = items.find(it => Number(it.stock_id) === stockId);
  if (!row) {
    throw new Error(
      `${label} 明细里没有库存行 ${stockId}，实际明细 stock_id=${items
        .map(it => String(it.stock_id))
        .join(',')}`
    );
  }
  return row;
}

/** 调拨明细读回（GET /inventory/transfers/{id}/items 的 data 直接是数组），按批次定位本行。 */
async function readTransferItem(
  page: import('@playwright/test').Page,
  transferId: number,
  batchNo: string,
  label: string
): Promise<Record<string, unknown>> {
  const data = await apiCallRaw<unknown>(page, 'GET', `/inventory/transfers/${transferId}/items`);
  if (!Array.isArray(data)) {
    throw new Error(
      `${label} 调拨明细端点 data 应为数组，实际片段=${JSON.stringify(data).slice(0, 200)}`
    );
  }
  const rows = data as Array<Record<string, unknown>>;
  const row = rows.find(it => String(it.batch_no) === batchNo);
  if (!row) {
    throw new Error(
      `${label} 调拨明细里没有批次 ${batchNo}，实际 batch_no=${rows
        .map(it => String(it.batch_no))
        .join(',')}`
    );
  }
  return row;
}

test.describe('库存细码与卷号链、盘点反向腿', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('细码录入，卷级明细保存后列表与详情两侧逐字段回读对齐', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tag = genCode('R01');
    const d = dims443(tag);
    await seedRoll(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      tag,
      quantityMeters: '70.5',
      quantityKg: '33.84',
      gramWeight: '360',
      width: '150',
      shelfNo: `S443-${tag}`,
      layerNo: 'L2',
    });

    // 列表侧回读（GET /inventory/stock 四维过滤），分页信封四键必须齐
    const listRaw = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=20`
    );
    for (const key of ['items', 'total', 'page', 'page_size']) {
      expect(
        Object.prototype.hasOwnProperty.call(listRaw, key),
        `细码列表响应应含分页键 ${key}，实际键=${Object.keys(listRaw).join(',')}`
      ).toBe(true);
    }
    expect(readNumber(listRaw, 'page', '细码列表回显页码'), '回显页码应为 1').toBe(1);
    expect(readNumber(listRaw, 'page_size', '细码列表回显每页量'), '回显每页量应为 20').toBe(20);

    const listRow = await rereadRoll(page, productId!, warehouseId!, tag);
    const stockId = readNumber(listRow, 'id', '细码列表行');

    // 详情侧回读（GET /inventory/stock/{id}），两侧字段逐一对齐
    const detailRow = await readStockDetail(page, stockId);
    const expectedText: Array<[string, string]> = [
      ['batch_no', d.batchNo],
      ['color_no', d.colorNo],
      ['dye_lot_no', d.dyeLotNo],
      ['grade', '一等品'],
      ['stock_status', '正常'],
      ['quality_status', '合格'],
      ['shelf_no', `S443-${tag}`],
      ['layer_no', 'L2'],
    ];
    for (const [key, expected] of expectedText) {
      expect(String(listRow[key]), `列表侧 ${key} 应逐字符等于录入值`).toBe(expected);
      expect(String(detailRow[key]), `详情侧 ${key} 应逐字符等于录入值`).toBe(expected);
    }
    const expectedDecimal: Array<[string, number]> = [
      ['quantity_meters', 70.5],
      ['quantity_kg', 33.84],
      ['gram_weight', 360],
      ['width', 150],
      ['quantity_on_hand', 70.5],
    ];
    for (const [key, expected] of expectedDecimal) {
      expect(typeof listRow[key], `列表侧 ${key} 出参应为 DECIMAL 字符串`).toBe('string');
      expect(typeof detailRow[key], `详情侧 ${key} 出参应为 DECIMAL 字符串`).toBe('string');
      expectQuantity(
        readNumber(listRow, key, '列表侧细码'),
        expected,
        `列表侧 ${key} 应等于录入值`
      );
      expectQuantity(
        readNumber(detailRow, key, '详情侧细码'),
        expected,
        `详情侧 ${key} 应等于录入值`
      );
    }
    console.warn(`443-T1 细码录入两侧回读通过 stockId=${stockId}`);
  });

  test('零头余码与整卷同仓并存，两行米数可区分且零头不被抹平', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tagFull = genCode('R02F');
    const tagOdd = genCode('R02O');
    await seedRoll(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      tag: tagFull,
      quantityMeters: '70.5',
      quantityKg: '33.84',
      gramWeight: '360',
      width: '150',
      shelfNo: `S443-${tagFull}`,
      layerNo: 'L1',
    });
    await seedRoll(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      tag: tagOdd,
      quantityMeters: '12.34',
      quantityKg: '5.92',
      gramWeight: '360',
      width: '150',
      shelfNo: `S443-${tagOdd}`,
      layerNo: 'L1',
    });

    // 同一次列表查询里两行都要出现且米数各自独立，零头不得被并进整卷或抹平为零
    const listRaw = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=100`
    );
    const rows = pickListArray<Record<string, unknown>>(listRaw, 'items', '零头并存列表查询');
    const fullNo = dims443(tagFull).batchNo;
    const oddNo = dims443(tagOdd).batchNo;
    const fullRow = rows.find(r => String(r.batch_no) === fullNo);
    const oddRow = rows.find(r => String(r.batch_no) === oddNo);
    if (!fullRow || !oddRow) {
      throw new Error(
        `零头与整卷应同时出现在同品同仓列表里，整卷=${fullRow ? '在' : '缺'} 零头=${oddRow ? '在' : '缺'}`
      );
    }
    const fullMeters = readNumber(fullRow, 'quantity_meters', '整卷行');
    const oddMeters = readNumber(oddRow, 'quantity_meters', '零头行');
    expectQuantity(fullMeters, 70.5, '整卷行米数应等于录入值');
    expectQuantity(oddMeters, 12.34, '零头行米数应等于录入值');
    expect(oddMeters, '零头行米数不得被抹平成整卷').not.toBe(fullMeters);
    expect(oddMeters, '零头行米数不得被清零').toBeGreaterThan(0);
    // 在库量同样按行独立，零头行不被并进整卷行的 on_hand
    expectQuantity(
      readNumber(oddRow, 'quantity_on_hand', '零头行在库量'),
      12.34,
      '零头行在库量应独立'
    );
    console.warn(`443-T2 零头与整卷两行区分通过 full=${fullMeters} odd=${oddMeters}`);
  });

  test('计量字段按录入事实分列存储，米数公斤数克重门幅互不折算覆盖', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    // 故意录入与克重门幅不成比例的公斤数（若后端按 米×门幅×克重 折算会被覆盖成另一值），
    // 用偏差事实钉住"各列按录入原样存储"，仓内不存在换算端点，不自造换算规则。
    const tag = genCode('R03');
    await seedRoll(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      tag,
      quantityMeters: '50.25',
      quantityKg: '999.99',
      gramWeight: '200',
      width: '90',
      shelfNo: `S443-${tag}`,
      layerNo: 'L3',
    });
    const row = await rereadRoll(page, productId!, warehouseId!, tag);
    const detail = await readStockDetail(page, readNumber(row, 'id', '换算钉桩库存行'));
    expectQuantity(readNumber(detail, 'quantity_meters', '米数列'), 50.25, '米数应原样落库');
    expectQuantity(
      readNumber(detail, 'quantity_kg', '公斤数列'),
      999.99,
      '公斤数应原样落库不被折算覆盖'
    );
    expectQuantity(readNumber(detail, 'gram_weight', '克重列'), 200, '克重应原样落库');
    expectQuantity(readNumber(detail, 'width', '门幅列'), 90, '门幅应原样落库');
    // 米与公斤是两个独立存储事实，米数不得被公斤列反向改写
    expect(
      Math.abs(
        readNumber(detail, 'quantity_kg', '公斤数列') -
          readNumber(detail, 'quantity_meters', '米数列')
      ) > 1,
      `米与公斤必须分列出值且不相等（kg=999.99 vs m=50.25），实际 kg=${String(detail.quantity_kg)} m=${String(detail.quantity_meters)}`
    ).toBe(true);
    console.warn(`443-T3 计量字段分列存储通过 kg=${String(detail.quantity_kg)}`);
  });

  test('按细码出库，本批次行余量减少且同仓其它批次行不动', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const fromWarehouse = ctx.warehouseIds[0];
    const toWarehouse = ctx.warehouseIds[1];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(fromWarehouse, '前置调出仓缺失').toBeTruthy();
    expect(toWarehouse, '前置第二个仓库缺失，无法构造调拨目标仓').toBeTruthy();

    // 白坯两行同品同仓不同批次，出库按批次精确命中，免缸免匹口径由写入方源码钉死
    const tagA = genCode('R04A');
    const tagB = genCode('R04B');
    const batchA = `E2E-443-GB${tagA}`;
    const batchB = `E2E-443-GB${tagB}`;
    await seedGreigeStockIn(page, {
      productId: productId!,
      warehouseId: fromWarehouse!,
      batchNo: batchA,
      quantityMeters: '50',
    });
    await seedGreigeStockIn(page, {
      productId: productId!,
      warehouseId: fromWarehouse!,
      batchNo: batchB,
      quantityMeters: '40',
    });
    const rowABefore = await readStockByBatch(page, productId!, fromWarehouse!, batchA);
    const rowBBefore = await readStockByBatch(page, productId!, fromWarehouse!, batchB);

    const created = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/inventory/transfers',
      {
        from_warehouse_id: fromWarehouse,
        to_warehouse_id: toWarehouse,
        transfer_date: new Date().toISOString(),
        notes: `E2E 细码出库 ${tagA}`,
        items: [{ product_id: productId, quantity: '15', batch_no: batchA }],
      }
    );
    const transferId = readNumber(created, 'id', '调拨建单');
    // 建单初始状态逐字符等于词表值 pending（小写，models/status/purchase_inventory.rs）
    expect(String((await readTransferDetail(page, transferId)).status)).toBe('pending');
    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/approve`, { approved: true });
    expect(String((await readTransferDetail(page, transferId)).status)).toBe('approved');
    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    const shipped = await readTransferDetail(page, transferId);
    expect(String(shipped.status), '出库后状态应逐字符落词表值 shipped').toBe('shipped');

    // 明细回读，本行实发 15 且未收货
    const item = await readTransferItem(page, transferId, batchA, '出库后明细');
    expectQuantity(readNumber(item, 'quantity', '调拨明细数量'), 15, '明细数量应为 15');
    expectQuantity(readNumber(item, 'shipped_quantity', '明细已发量'), 15, '已发量应为 15');
    expectQuantity(readNumber(item, 'received_quantity', '明细已收量'), 0, '未收货已收量应为 0');

    // 本批次行按出库量减少（在库与可用两列同减，米数按比例扣减）
    const onHandBefore = readNumber(rowABefore, 'quantity_on_hand', '出库前在库量');
    const availableBefore = readNumber(rowABefore, 'quantity_available', '出库前可用量');
    const rowAAfter = await readStockByBatch(page, productId!, fromWarehouse!, batchA);
    expectQuantity(
      readNumber(rowAAfter, 'quantity_on_hand', '出库后在库量'),
      onHandBefore - 15,
      '本批次在库量应恰减 15'
    );
    expectQuantity(
      readNumber(rowAAfter, 'quantity_available', '出库后可用量'),
      availableBefore - 15,
      '本批次可用量应恰减 15'
    );
    expectQuantity(
      readNumber(rowAAfter, 'quantity_meters', '出库后米数'),
      readNumber(rowABefore, 'quantity_meters', '出库前米数') - 15,
      '本批次米数应恰减 15'
    );

    // 同仓其它批次行分毫不动（跨缸不回退，白坯仅无缸号行可扣）
    const rowBAfter = await readStockByBatch(page, productId!, fromWarehouse!, batchB);
    expectQuantity(
      readNumber(rowBAfter, 'quantity_on_hand', '邻批次出库后在库量'),
      readNumber(rowBBefore, 'quantity_on_hand', '邻批次出库前在库量'),
      '邻批次在库量必须分毫不动'
    );
    expectQuantity(
      readNumber(rowBAfter, 'quantity_available', '邻批次出库后可用量'),
      readNumber(rowBBefore, 'quantity_available', '邻批次出库前可用量'),
      '邻批次可用量必须分毫不动'
    );
    expectQuantity(
      readNumber(rowBAfter, 'quantity_meters', '邻批次出库后米数'),
      readNumber(rowBBefore, 'quantity_meters', '邻批次出库前米数'),
      '邻批次米数必须分毫不动'
    );
    console.warn(
      `443-T4 细码出库通过 transfer=${transferId} A行 ${onHandBefore}→${readNumber(rowAAfter, 'quantity_on_hand', '出库后在库量')}`
    );
  });

  test('盘点同单两腿，盘盈为正盘亏为负分别落库，过账后两行精确到实盘量', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tagGain = genCode('R05G');
    const tagLoss = genCode('R05L');
    const gainStock = await seedFourDimStockIn(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      colorNo: dims443(tagGain).colorNo,
      dyeLotNo: dims443(tagGain).dyeLotNo,
      batchNo: dims443(tagGain).batchNo,
      quantityMeters: '100',
    });
    const lossStock = await seedFourDimStockIn(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      colorNo: dims443(tagLoss).colorNo,
      dyeLotNo: dims443(tagLoss).dyeLotNo,
      batchNo: dims443(tagLoss).batchNo,
      quantityMeters: '60',
    });
    const gainId = readNumber(gainStock, 'id', '盘盈库存行');
    const lossId = readNumber(lossStock, 'id', '盘亏库存行');

    const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E 盘盈盘亏同单 ${tagGain}`,
      stock_ids: [gainId, lossId],
    });
    const countId = readNumber(created, 'id', '盘点建单');
    const itemsCreated = pickListArray<Record<string, unknown>>(created, 'items', '盘点建单明细');
    expect(itemsCreated.length, '建单明细应恰为盘盈盘亏两行').toBe(2);
    expect(String((await readCountDetail(page, countId)).status)).toBe('pending');

    await apiCall(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [
        { stock_id: gainId, quantity_actual: '120' },
        { stock_id: lossId, quantity_actual: '45' },
      ],
    });
    const detailRecorded = await readCountDetail(page, countId);
    const gainItem = pickCountItem(detailRecorded, gainId, '录入后盘点详情');
    const lossItem = pickCountItem(detailRecorded, lossId, '录入后盘点详情');
    const gainDiff = readNumber(gainItem, 'quantity_difference', '盘盈差异');
    const lossDiff = readNumber(lossItem, 'quantity_difference', '盘亏差异');
    expectQuantity(gainDiff, 20, '盘盈腿差异应为正 20（实盘 120 减账面 100）');
    expectQuantity(lossDiff, -15, '盘亏腿差异应为负 15（实盘 45 减账面 60）');
    expect(
      readNumber(detailRecorded, 'variance_items', '同单差异项数'),
      '两腿均有差异，差异项数应为 2'
    ).toBe(2);

    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    expect(String((await readCountDetail(page, countId)).status)).toBe('in_review');
    // 提交未过账，两行库存分文未动
    const gainRowBefore = await rereadRoll(page, productId!, warehouseId!, tagGain);
    const lossRowBefore = await rereadRoll(page, productId!, warehouseId!, tagLoss);
    expectQuantity(
      readNumber(gainRowBefore, 'quantity_on_hand', '过账前盘盈行在库量'),
      100,
      '提交审批不应改变盘盈行在库量'
    );
    expectQuantity(
      readNumber(lossRowBefore, 'quantity_on_hand', '过账前盘亏行在库量'),
      60,
      '提交审批不应改变盘亏行在库量'
    );

    await apiCall(page, 'POST', `/inventory/counts/${countId}/approve`);
    const detailApproved = await readCountDetail(page, countId);
    expect(String(detailApproved.status), '过账后状态应逐字符落词表值 completed').toBe('completed');

    // 两腿分别落账：盘盈行升到实盘量，盘亏行降到实盘量，在库与可用两列同改
    const gainRowAfter = await rereadRoll(page, productId!, warehouseId!, tagGain);
    const lossRowAfter = await rereadRoll(page, productId!, warehouseId!, tagLoss);
    expectQuantity(
      readNumber(gainRowAfter, 'quantity_on_hand', '盘盈过账后在库量'),
      120,
      '盘盈过账后在库量应升到 120'
    );
    expectQuantity(
      readNumber(gainRowAfter, 'quantity_available', '盘盈过账后可用量'),
      120,
      '盘盈过账后可用量应升到 120'
    );
    expectQuantity(
      readNumber(lossRowAfter, 'quantity_on_hand', '盘亏过账后在库量'),
      45,
      '盘亏过账后在库量应降到 45'
    );
    expectQuantity(
      readNumber(lossRowAfter, 'quantity_available', '盘亏过账后可用量'),
      45,
      '盘亏过账后可用量应降到 45'
    );
    console.warn(`443-T5 盘点两腿过账通过 count=${countId} 盈差=${gainDiff} 亏差=${lossDiff}`);
  });

  test('反向防呆，超可用量在建单预检即拒；出库期可用量被占尽同样被拒且无半成品', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const fromWarehouse = ctx.warehouseIds[0];
    const toWarehouse = ctx.warehouseIds[1];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(fromWarehouse, '前置调出仓缺失').toBeTruthy();
    expect(toWarehouse, '前置第二个仓库缺失').toBeTruthy();

    // 腿一：建单期四维预检。白坯行在架 40，出库开 45 必须在 POST /inventory/transfers
    // 这一笔即被整笔拒——预检由 services/inv/stock.rs 的 check_from_warehouse_inventory
    // 在建单事务内、commit 之前调用（move::create_transfer），超量根本进不到审批与出库。
    const overTag = genCode('R06A');
    const overBatch = `E2E-443-GB${overTag}`;
    await seedGreigeStockIn(page, {
      productId: productId!,
      warehouseId: fromWarehouse!,
      batchNo: overBatch,
      quantityMeters: '40',
    });
    const before = await readStockByBatch(page, productId!, fromWarehouse!, overBatch);
    const rejectedCreate = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: fromWarehouse,
      to_warehouse_id: toWarehouse,
      transfer_date: new Date().toISOString(),
      notes: `E2E 超量出库防呆 ${overTag}`,
      items: [{ product_id: productId, quantity: '45', batch_no: overBatch }],
    });
    expectBusinessRejection(rejectedCreate, `超可用量建单应被业务拒绝，批次 ${overBatch}`);
    const createCode = failureCode(rejectedCreate);
    expect(
      createCode === APP_ERROR_CODES.BUSINESS_ERROR,
      `库存不足拒绝的机器码应为 BUSINESS_ERROR，实际 code=${createCode ?? '(non-string)'} message=${rejectedCreate.message ?? '(none)'}`
    ).toBe(true);
    expect(
      rejectedCreate.message,
      `库存不足拒绝走脱敏站点，出参文案必须是固定常量，实际 message=${JSON.stringify(rejectedCreate.message)}`
    ).toBe(SANITIZED_BUSINESS_MESSAGE);
    // 失败信封不携带任何单据载荷：建单被拒即没有可继续流转的单据存在
    expect(
      rejectedCreate.data === undefined || rejectedCreate.data === null,
      `被拒建单不得返回单据载荷，实际片段=${JSON.stringify(rejectedCreate).slice(0, 200)}`
    ).toBe(true);
    // 被拒后库存三个米/公斤口径列分毫不动（预检只读，拒绝整笔回滚）
    const afterOver = await readStockByBatch(page, productId!, fromWarehouse!, overBatch);
    for (const key of ['quantity_on_hand', 'quantity_available', 'quantity_meters']) {
      expectQuantity(
        readNumber(afterOver, key, '超量建单被拒后库存列'),
        readNumber(before, key, '超量建单拒绝前库存列'),
        `超量建单被拒不应改动 ${key}`
      );
    }

    // 腿二：出库期可用量竞态（TOCTOU）。同批次两笔各按全额 40 建单都能过预检（预检只读、
    // 不占用），先把乙单出尽，再发甲单就必须由发运事务内的扣减规划拒掉
    // （services/inv/batch.rs 的 apply_ship_item_deduction 行锁 + plan_deduction），整笔回滚。
    const raceTag = genCode('R06B');
    const raceBatch = `E2E-443-GB${raceTag}`;
    await seedGreigeStockIn(page, {
      productId: productId!,
      warehouseId: fromWarehouse!,
      batchNo: raceBatch,
      quantityMeters: '40',
    });
    const createdA = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/inventory/transfers',
      {
        from_warehouse_id: fromWarehouse,
        to_warehouse_id: toWarehouse,
        transfer_date: new Date().toISOString(),
        notes: `E2E 出库竞态甲单 ${raceTag}`,
        items: [{ product_id: productId, quantity: '40', batch_no: raceBatch }],
      }
    );
    const transferAId = readNumber(createdA, 'id', '竞态甲单建单回显');
    await apiCall(page, 'POST', `/inventory/transfers/${transferAId}/approve`, { approved: true });
    const createdB = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/inventory/transfers',
      {
        from_warehouse_id: fromWarehouse,
        to_warehouse_id: toWarehouse,
        transfer_date: new Date().toISOString(),
        notes: `E2E 出库竞态乙单 ${raceTag}`,
        items: [{ product_id: productId, quantity: '40', batch_no: raceBatch }],
      }
    );
    const transferBId = readNumber(createdB, 'id', '竞态乙单建单回显');
    await apiCall(page, 'POST', `/inventory/transfers/${transferBId}/approve`, { approved: true });
    await apiCall(page, 'POST', `/inventory/transfers/${transferBId}/ship`);
    const drained = await readStockByBatch(page, productId!, fromWarehouse!, raceBatch);
    expectQuantity(
      readNumber(drained, 'quantity_available', '乙单出库后可用量'),
      0,
      '乙单应把该批次可用量出尽，作为竞态前置'
    );

    const rejectedShip = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/transfers/${transferAId}/ship`
    );
    expectBusinessRejection(
      rejectedShip,
      `可用量被竞态占尽后再次出库应被业务拒绝，批次 ${raceBatch}`
    );
    const shipCode = failureCode(rejectedShip);
    expect(
      shipCode === APP_ERROR_CODES.BUSINESS_ERROR,
      `出库期库存不足拒绝的机器码应为 BUSINESS_ERROR，实际 code=${shipCode ?? '(non-string)'} message=${rejectedShip.message ?? '(none)'}`
    ).toBe(true);
    expect(
      rejectedShip.message,
      `出库期库存不足拒绝同走脱敏站点，出参文案必须是固定常量，实际 message=${JSON.stringify(rejectedShip.message)}`
    ).toBe(SANITIZED_BUSINESS_MESSAGE);

    // 被拒后无任何半成品：库存三个米/公斤口径列停在竞态后的值，甲单停在 approved，明细已发量为 0
    const afterRace = await readStockByBatch(page, productId!, fromWarehouse!, raceBatch);
    for (const key of ['quantity_on_hand', 'quantity_available', 'quantity_meters']) {
      expectQuantity(
        readNumber(afterRace, key, '甲单被拒后库存列'),
        readNumber(drained, key, '甲单被拒前库存列'),
        `被拒出库不应改动 ${key}`
      );
    }
    const detailA = await readTransferDetail(page, transferAId);
    expect(String(detailA.status), '被拒后甲单应停在 approved，不得半推进 shipped').toBe(
      'approved'
    );
    const itemA = await readTransferItem(page, transferAId, raceBatch, '被拒后甲单明细');
    expectQuantity(
      readNumber(itemA, 'shipped_quantity', '被拒后甲单已发量'),
      0,
      '被拒后甲单已发量应为 0'
    );
    tryCleanup(
      page,
      'DELETE',
      `/inventory/transfers/${transferAId}`,
      `443 竞态甲单 ${transferAId}`
    );
    tryCleanup(
      page,
      'DELETE',
      `/inventory/transfers/${transferBId}`,
      `443 竞态乙单 ${transferBId}`
    );
    console.warn(`443-T6 反向防呆两腿通过 建单拒码=${createCode} 出库拒码=${shipCode}`);
  });

  test('权限门，销售岗直连库存与盘点端点全部 403 且拿不到任何数据行', async ({ page, browser }) => {
    const cred = getRoleCredential('salesperson');
    if (!cred) {
      throw new Error(
        '443-T7 前置缺失：role-credentials.json 无 salesperson 凭证（global-setup 建岗未运行），' +
          '不得改用其它身份兜底，本门的判据正是非库存岗被 RBAC 拒绝'
      );
    }
    // 主会话先建好真实数据，无权会话随后直连同一批端点，证明拒绝来自权限门而非数据不存在
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();
    const tag = genCode('R07');
    await seedRoll(page, {
      productId: productId!,
      warehouseId: warehouseId!,
      tag,
      quantityMeters: '30',
      quantityKg: '15',
      gramWeight: '250',
      width: '120',
      shelfNo: `S443-${tag}`,
      layerNo: 'L1',
    });

    const session = await loginInIsolatedContext(browser, cred.username, cred.password);
    try {
      const deniedList = await apiCallExpectFail(
        session.page,
        'GET',
        '/inventory/stock?page=1&page_size=5'
      );
      expectDenied(deniedList, `销售岗读细码列表 ${cred.username}`);
      const deniedDetail = await apiCallExpectFail(session.page, 'GET', '/inventory/counts');
      expectDenied(deniedDetail, `销售岗读盘点列表 ${cred.username}`);
      const deniedWrite = await apiCallExpectFail(session.page, 'POST', '/inventory/stock/fabric', {
        warehouse_id: warehouseId,
        product_id: productId,
        batch_no: `E2E-443-B${genCode('R07W')}`,
        color_no: `E2E-443-C${tag}`,
        dye_lot_no: `E2E-443-D${tag}`,
        grade: '一等品',
        quantity_meters: '1',
      });
      expectDenied(deniedWrite, `销售岗写细码库存 ${cred.username}`);

      // 三条拒绝体都是统一失败信封，含机器码 FORBIDDEN 与 trace_id、timestamp 两键；
      // 无权身份拿不到任何数据行，成本与数量类字段没有随列表外泄的载体
      for (const denied of [deniedList, deniedDetail, deniedWrite]) {
        expect(
          typeof denied.trace_id === 'string' && denied.trace_id.length > 0,
          `403 失败体应含非空 trace_id，实际=${String(denied.trace_id)}`
        ).toBe(true);
        expect(
          Object.prototype.hasOwnProperty.call(denied, 'items') === false &&
            Object.prototype.hasOwnProperty.call(denied, 'counts') === false,
          `403 失败体不应携带任何数据行载荷，实际键=${Object.keys(denied).join(',')}`
        ).toBe(true);
      }
      console.warn(`443-T7 库存端点权限门通过 身份=${cred.username} 三通道均 403`);
    } finally {
      await session.close();
    }
  });
});
