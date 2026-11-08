// 盘点明细改写与删除腿配对用例
//
// 功能。把主干有界面入口、e2e 从未配对过的三条盘点明细腿
// （PUT /inventory/counts/items/{item_id}、DELETE /inventory/counts/items/{item_id}、
// GET /inventory/counts/generate-no）钉成写后双路回读的可失败判定，
// 并为这两条写腿配齐不存在主键、非法前置、状态门、输入校验与权限面五族拒绝腿。
// 调用方。Playwright E2E 串行链，会话取本 worker 专属管理员账号；
// 权限拒绝腿临时切到 warehouse_keeper 角色会话，切回管理员做回读与清理。
// 入参。夹具产品与仓库取 ensureTestEntities 落库的真实主键；
// 每枚用例自建两行专属四维库存（色号、缸号、批次三者唯一），建单时以 stock_ids 把明细限死在这两行。
// 传给谁。前置自建腿打 POST /inventory/counts（盘点单主体建单）与
// POST /inventory/counts/{id}/record、/submit、/reject；两条写腿与一条取号腿是本文件被测面；
// 回读打 GET /inventory/counts/{id}（详情含 items）、GET /inventory/counts?count_no=（列表）与
// GET /inventory/stock/{id}（库存行）；清理打 DELETE /inventory/counts/{id}。
// 存什么。inventory_count_items 行的 quantity_actual / quantity_difference / notes 三列，
// 与 inventory_counts 行的 counted_items / variance_items / total_items / status 四列。
// 存哪里。PostgreSQL inventory_count_items 与 inventory_counts；
// 出参键名逐字段取自 backend/src/models/inventory_count_item.rs 与
// handlers/inventory_count_handler.rs 的 CountItemResponse 与 CountResponse。
//
// 判据来源（逐段读后端源，非推测）。
// 一、明细出参键名。详情与建单响应的 items 元素是 CountItemResponse
// （handlers/inventory_count_handler.rs），键 = id、count_id、stock_id、product_id、
// warehouse_id、quantity_before、quantity_actual、quantity_difference、unit_cost、total_cost、
// notes、created_at、updated_at（snake_case，与 models/inventory_count_item.rs 列名逐字相同）。
// PUT 写腿的响应体只有 6 键（handlers/inventory_count_handler.rs，
// id、count_id、stock_id、quantity_actual、quantity_difference、notes），
// 不含 quantity_before 与 unit_cost/total_cost，因此改写后的账面量与成本必须走详情腿读回。
// 二、差异符号口径。quantity_difference = 实盘 - 账面（services/inventory_count_service.rs
// 批量录入 单条改写两处同一口径），盘盈为正、盘亏为负，账面量取建单时的
// inventory_stocks.quantity_on_hand 快照（services/inventory_count_service.rs）。
// 三、改明细不动库存。apply_stock_adjustments 只在 approve_count 事务内被调用
// （services/inventory_count_service.rs），PUT 与 DELETE 两条写腿都不落库存，
// 所以本用例把"改写与删行前后库存行两列分文未动"按现状钉住，不写成"改明细即调库存"。
// 四、状态词表。唯一写入方是 models/status/inventory_count.rs 的三枚小写常量
// pending、in_review、completed（services/inventory_count_service.rs），
// 词表里没有 in_progress；比较点与写入值逐字符相同，不做大小写归一。
// 五、三态入参。PUT 体是 RFC 7386 三态（handlers/inventory_count_handler.rs）——
// 键缺席保持原值、显式 null 清空可空列 notes、quantity_actual 为 NOT NULL 列的显式 null 被拒。
// 六、拒绝通道。写腿的不存在子行走 AppError::not_found 脱敏通道
// （handlers/inventory_count_handler.rs），出参 message 恒为固定常量「资源未找到」
// （utils/error.rs、utils/messages.rs），真实文案「盘点明细不存在」只进日志；
// 因此 404 腿以 HTTP 状态 + 机器码 NOT_FOUND + 脱敏文案三者同断，不拿"任一非 2xx"充当通过。
//
// 查出的后端缺陷（本用例一律按源码现状钉住，点名在此，不改判据方向）。
// 一、counted_items 两套口径分叉。批量录入按"本次提交条数"累加
// （services/inventory_count_service.rs），而单条明细改写与删除后的
// recalc_count_stats 把 counted_items 直接取明细总行数，
// 于是只改其中一条也会把从未录入实盘的另一行算成已盘。本用例按后者现状断
// counted_items 等于明细行数，并在断言信息里点名该口径。
// 二、total_items 不随删行重算。recalc_count_stats 只写 counted_items 与 variance_items
// （services/inventory_count_service.rs），delete_count_item 也只调用它，
// 故删掉一行明细后表头 total_items 仍是建单快照值，与 items 实际行数永久失配。
// 本用例把"随动的两枚"与"不随动的一枚"同时钉死，任一侧被改动都会立刻判红。
// 三、状态门两腿外显口径不一致。PUT 腿用 AppError::business 脱敏
// （services/inventory_count_service.rs，出参固定文案「业务处理失败」，utils/messages.rs），
// DELETE 腿用 AppError::business_displayable 可外显（:726，出参逐字为真实拒绝原因），
// 同一族的两个前置状态拒绝在 HTTP 面上给出不同可见信息。
// 四、GET /inventory/counts/generate-no 属仓内"单据号展示端点"待废除族，本用例按假可供现状钉住。
// 该腿走 DocumentNumberGenerator::generate_no（handlers/inventory_count_handler.rs），
// 内部只开事务取号并显式回滚式结束、探测全程只有 SELECT（utils/number_generator.rs），
// 不落库、不占号段；真落库单号由建单在自身事务内另取一次 max+1
// （services/inventory_count_service.rs）。因此展示号与随后建单号可能同值、
// 且该端点自身从不写入号段（只 SELECT 探测），出参只有 count_no 一键（无 id、无 status），
// 与真号源（已落库单据）形状不一致。本用例不为它编造"已预留可用单号"的成功语义。
//
// 覆盖面缺口（如实登记，不凑绿）。
// 一、差异是否驱动库存变化只由 approve_count 落账（services/inventory_count_service.rs），
// 该面的库存两列真值已被既有盘点用例覆盖，本文件只把"两条明细写腿不动库存"钉成反向证据，
// 不重复过账面，避免同一张单被两条用例过账后彼此污染库存基线。
// 二、非授权角色的放行面只取列表腿（counts:read 命中 GET /inventory/counts，与行级数据范围无关）。
// 详情腿 GET /inventory/counts/{id} 对仓管要过 check_resource_owner_by_member_scope
// （services/inventory_count_service.rs），归属人是建单的管理员，
// 而角色的 data_scope 取值由库里 role 表决定，放行与否非源码可确定，故不用它做判据。
// 三、写腿成功面的 owner 由本 worker 管理员自建自改（handlers/inventory_count_handler.rs
// 的子行上溯归属门只校 owner，跨 owner 代改面属数据范围专题，本文件不展开）。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  loginAsRole,
  ensureTestEntities,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  getCtx,
  genCode,
  seedFourDimStockIn,
  failureCode,
  APP_ERROR_CODES,
  API_BASE,
  API_PREFIX,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

/** DECIMAL 与整型出参统一按字符串取出再 Number 归一，键缺席直接抛错，不用 ?? 0 掩盖缺键。 */
function readNumber(obj: Row, key: string, label: string): number {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`${label} 响应缺少后端真实键 ${key}，实际键=${Object.keys(obj).join(',')}`);
  }
  const value = Number(String(obj[key]));
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 键 ${key} 不可解析为有限数字，raw=${String(obj[key])}`);
  }
  return value;
}

/** 数量与金额按货币精度比较（容差 0.01），失败信息带期望与实际。 */
function expectQuantity(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}，期望=${expected} 实际=${actual}`).toBeLessThan(
    0.01
  );
}

/** DECIMAL 出参先断 typeof 是字符串（后端 rust_decimal serde 形态），再交调用方 Number 归一。 */
function expectDecimalString(obj: Row, key: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    throw new Error(`${label} 响应缺少后端真实键 ${key}，实际键=${Object.keys(obj).join(',')}`);
  }
  expect(typeof obj[key], `${label} 的 ${key} 应为 DECIMAL 字符串，实际=${String(obj[key])}`).toBe(
    'string'
  );
  return String(obj[key]);
}

/** 按主键在详情 items 集合里定位明细行，定位不到即抛错，不拿第一条蒙过。 */
function pickItemByStockId(detail: Row, stockId: number, label: string): Row {
  const items = pickListArray<Row>(detail, 'items', `${label} 明细集合`);
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

/** 详情 items 的主键集合，用于断"删掉的行真的不在集合里"。 */
function itemIds(detail: Row): number[] {
  return pickListArray<Row>(detail, 'items', '盘点详情明细集合').map(it => Number(it.id));
}

/** 读回盘点详情（出参 CountResponse，主表列与 items 同层）。 */
async function readCountDetail(
  page: import('@playwright/test').Page,
  countId: number
): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/counts/${countId}`);
}

/** 读回库存行（数量列全列回读需管理员会话，本用例只在管理员会话里打这一腿）。 */
async function readStockRow(page: import('@playwright/test').Page, stockId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/inventory/stock/${stockId}`);
}

/**
 * 自建两行专属四维库存并建一张明细只含这两行的盘点单。
 * 调用方：本文件全部用例。入参：page + 产品与仓库主键 + 唯一标记 + 两行入库量。
 * 传给谁：POST /inventory/stock/fabric（经 seedFourDimStockIn）与 POST /inventory/counts。
 * 存什么：inventory_stocks 两行与 inventory_counts 一行及其 inventory_count_items 两行。
 * 存哪里：同上，落库值一律以 GET 回读为准。
 */
async function seedTwoItemCount(
  page: import('@playwright/test').Page,
  productId: number,
  warehouseId: number,
  tag: string,
  qtyA: string,
  qtyB: string
): Promise<{
  countId: number;
  stockIdA: number;
  stockIdB: number;
  itemIdA: number;
  itemIdB: number;
  onHandA: number;
  onHandB: number;
}> {
  const rowA = await seedFourDimStockIn(page, {
    productId,
    warehouseId,
    colorNo: `E2E-ITEM-C${tag}`,
    dyeLotNo: `E2E-ITEM-D${tag}A`,
    batchNo: `E2E-ITEM-B${tag}A`,
    quantityMeters: qtyA,
  });
  const rowB = await seedFourDimStockIn(page, {
    productId,
    warehouseId,
    colorNo: `E2E-ITEM-C${tag}`,
    dyeLotNo: `E2E-ITEM-D${tag}B`,
    batchNo: `E2E-ITEM-B${tag}B`,
    quantityMeters: qtyB,
  });
  const stockIdA = readNumber(rowA, 'id', '库存行A');
  const stockIdB = readNumber(rowB, 'id', '库存行B');

  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
    warehouse_id: warehouseId,
    count_date: new Date().toISOString(),
    notes: `E2E 明细改写 ${tag}`,
    stock_ids: [stockIdA, stockIdB],
  });
  const countId = readNumber(created, 'id', '盘点建单');
  const items = pickListArray<Row>(created, 'items', '盘点建单明细');
  expect(items.length, `建单明细应只有两行专属库存，实际 ${items.length} 行`).toBe(2);

  // 建单初始态按写入方口径钉死，作为后续所有差值断言的基线
  expect(String(created.status), '建单状态应逐字符等于写入方词表值 pending').toBe('pending');
  expect(readNumber(created, 'total_items', '建单总项数'), '两行库存建单总项数应为 2').toBe(2);
  expect(readNumber(created, 'counted_items', '建单已盘项数'), '未录入实盘时已盘项数应为 0').toBe(
    0
  );
  expect(readNumber(created, 'variance_items', '建单差异项数'), '未录入实盘时差异项数应为 0').toBe(
    0
  );
  const itemA = pickItemByStockId(created, stockIdA, '建单响应');
  const itemB = pickItemByStockId(created, stockIdB, '建单响应');
  expectQuantity(
    readNumber(itemA, 'quantity_before', '明细A账面量'),
    readNumber(rowA, 'quantity_on_hand', '库存行A在库量'),
    '明细 quantity_before 应等于建单时的库存在库量'
  );
  return {
    countId,
    stockIdA,
    stockIdB,
    itemIdA: readNumber(itemA, 'id', '明细A主键'),
    itemIdB: readNumber(itemB, 'id', '明细B主键'),
    onHandA: readNumber(rowA, 'quantity_on_hand', '库存行A在库量'),
    onHandB: readNumber(rowB, 'quantity_on_hand', '库存行B在库量'),
  };
}

/**
 * 收掉本用例自建的盘点单（连带删除明细，services/inventory_count_service.rs）。
 * 主体删除腿只允许 pending，故对已提交（in_review）的先走 reject 退回 pending 再删。
 */
async function cleanupCount(page: import('@playwright/test').Page, countId: number): Promise<void> {
  const detail = await readCountDetail(page, countId);
  if (String(detail.status) === 'in_review') {
    await apiCall(page, 'POST', `/inventory/counts/${countId}/reject`);
  }
  await apiCall(page, 'DELETE', `/inventory/counts/${countId}`);
  const gone = await apiCallExpectFail(page, 'GET', `/inventory/counts/${countId}`);
  expect(
    gone.status,
    `盘点单 ${countId} 清理后详情腿应恰为 404，实际 status=${gone.status} code=${failureCode(gone)}`
  ).toBe(404);
  expect(failureCode(gone), `清理后读回应为 NOT_FOUND，实际 code=${failureCode(gone)}`).toBe(
    APP_ERROR_CODES.NOT_FOUND
  );
}

test.describe('盘点明细改写与删除配对', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('PUT明细改写双路回读，盘盈盘亏符号与三态备注落库且库存不动', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tag = genCode('ITEMUPD');
    const seeded = await seedTwoItemCount(page, productId!, warehouseId!, tag, '100', '60');
    const { countId, stockIdA, stockIdB, itemIdA, itemIdB, onHandA, onHandB } = seeded;

    // 盘盈方向，A 行实盘高于账面，差值为正
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '130',
      notes: `E2E 盘盈改写 ${tag}`,
    });
    // 盘亏方向，B 行实盘低于账面，差值为负；只给 quantity_actual，notes 键缺席应保持原值
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdB}`, {
      quantity_actual: '45',
    });

    // 第一路回读：PUT 响应体（6 键，DECIMAL 出参先断 typeof 再归一）
    const putA = await apiCallRaw<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '130',
    });
    for (const key of [
      'id',
      'count_id',
      'stock_id',
      'quantity_actual',
      'quantity_difference',
      'notes',
    ]) {
      expect(
        Object.prototype.hasOwnProperty.call(putA, key),
        `PUT 明细响应应含后端真实键 ${key}，实际键=${Object.keys(putA).join(',')}`
      ).toBe(true);
    }
    expect(readNumber(putA, 'id', 'PUT 明细响应'), 'PUT 响应主键应为被改写的明细行').toBe(itemIdA);
    expect(
      readNumber(putA, 'count_id', 'PUT 明细响应'),
      'PUT 响应 count_id 应指回本用例自建盘点单（子行归属由外键唯一反查）'
    ).toBe(countId);
    expectDecimalString(putA, 'quantity_actual', 'PUT 明细响应');
    expectDecimalString(putA, 'quantity_difference', 'PUT 明细响应');
    expectQuantity(readNumber(putA, 'quantity_actual', 'PUT 实盘量'), 130, 'PUT 应回显实盘量');
    expectQuantity(
      readNumber(putA, 'quantity_difference', 'PUT 差异量'),
      130 - onHandA,
      'PUT 差异量应等于实盘减账面'
    );

    // 第二路回读：详情腿逐行读回，新值生效且旧值不残留
    const detail = await readCountDetail(page, countId);
    const rowA = pickItemByStockId(detail, stockIdA, 'A 行改写后详情');
    const rowB = pickItemByStockId(detail, stockIdB, 'B 行改写后详情');
    expect(rowA.id, 'A 行主键不应因改写而变').toBe(itemIdA);
    expectQuantity(readNumber(rowA, 'quantity_actual', 'A 行实盘量'), 130, 'A 行实盘应落新值');
    expectQuantity(
      readNumber(rowA, 'quantity_before', 'A 行改写后账面量'),
      onHandA,
      'A 行账面量不得被改写腿污染（快照列必须保持建单值）'
    );
    expectDecimalString(rowA, 'quantity_before', 'A 行详情明细');
    const diffA = readNumber(rowA, 'quantity_difference', 'A 行差异量');
    expect(diffA > 0, `盘盈方向的差异量必须为正，实际 ${diffA}`).toBe(true);
    expectQuantity(diffA, 130 - onHandA, `A 行盘盈差异应精确等于 ${130 - onHandA}`);
    expect(String(rowA.notes), `A 行备注应等于改写值，实际 ${String(rowA.notes)}`).toBe(
      `E2E 盘盈改写 ${tag}`
    );

    const diffB = readNumber(rowB, 'quantity_difference', 'B 行差异量');
    expectQuantity(readNumber(rowB, 'quantity_actual', 'B 行实盘量'), 45, 'B 行实盘应落新值');
    expect(diffB < 0, `盘亏方向的差异量必须为负，实际 ${diffB}`).toBe(true);
    expectQuantity(diffB, 45 - onHandB, `B 行盘亏差异应精确等于 ${45 - onHandB}`);
    expect(
      rowB.notes,
      `B 行未提交 notes 键，按三态语义应保持原值 NULL（建单初始），实际 ${JSON.stringify(rowB.notes)}`
    ).toBe(null);

    // 表头统计随单条改写重算（口径现状：counted_items 取明细总行数，非本次录入条数）
    expect(
      readNumber(detail, 'variance_items', '改写后差异项数'),
      '两行差异均非零，差异项数应为 2'
    ).toBe(2);
    expect(
      readNumber(detail, 'counted_items', '改写后已盘项数'),
      '后端 recalc_count_stats 把已盘项数取成明细总行数（缺陷一，按现状钉住）'
    ).toBe(2);
    expect(String(detail.status), '改写明细不得翻转主表状态').toBe('pending');

    // 三态清空腿：显式 null 落 NULL，同时 quantity_actual 键缺席必须保持已落库的实盘量
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, { notes: null });
    const afterClear = await readCountDetail(page, countId);
    const clearedA = pickItemByStockId(afterClear, stockIdA, 'A 行清空备注后详情');
    expect(
      clearedA.notes,
      `显式 null 应把 notes 清成 NULL，实际 ${JSON.stringify(clearedA.notes)}`
    ).toBe(null);
    expectQuantity(
      readNumber(clearedA, 'quantity_actual', 'A 行清空备注后的实盘量'),
      130,
      'notes 单独清空时缺席的实盘量必须保持原值'
    );

    // 改明细只记差异，不动库存：两列分文未动（落账唯一入口是 approve，见文件头判据三）
    const stockA = await readStockRow(page, stockIdA);
    const stockB = await readStockRow(page, stockIdB);
    expectQuantity(
      readNumber(stockA, 'quantity_on_hand', 'A 库存行在库量'),
      onHandA,
      'PUT 明细改写不得改动库存在库量'
    );
    expectQuantity(
      readNumber(stockB, 'quantity_available', 'B 库存行可用量'),
      onHandB,
      'PUT 明细改写不得改动库存可用量'
    );

    // 列表腿按单号读回同一张单，证明改写没有将单据复制或改号
    const list = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/counts?count_no=${encodeURIComponent(String(detail.count_no))}&page=1&page_size=10`
    );
    const rows = pickListArray<Row>(list, 'counts', '按单号过滤盘点列表');
    const matched = rows.filter(r => String(r.count_no) === String(detail.count_no));
    expect(matched.length, `盘点单号 ${String(detail.count_no)} 在库里应只有一行`).toBe(1);
    expect(
      readNumber(matched[0], 'variance_items', '列表行差异项数'),
      '列表侧统计应与详情侧一致'
    ).toBe(2);

    await cleanupCount(page, countId);
  });

  test('PUT明细拒绝腿四族，被拒零写入且文案通道逐字符同源', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tag = genCode('ITEMFAIL');
    const seeded = await seedTwoItemCount(page, productId!, warehouseId!, tag, '80', '80');
    const { countId, stockIdA, itemIdA } = seeded;

    // 基准值先落库一次，后续每条拒绝腿都以"回读等于该基准"证明拒绝不触库
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '88',
      notes: `E2E 基准 ${tag}`,
    });
    const readBackUnchanged = async (label: string): Promise<void> => {
      const detail = await readCountDetail(page, countId);
      const row = pickItemByStockId(detail, stockIdA, label);
      expectQuantity(
        readNumber(row, 'quantity_actual', `${label} 实盘量`),
        88,
        `${label} 被拒后实盘量应保持基准值 88`
      );
      expect(String(row.notes), `${label} 被拒后备注应保持基准值，实际 ${String(row.notes)}`).toBe(
        `E2E 基准 ${tag}`
      );
      expect(String(detail.status), `${label} 被拒后主表状态应保持 pending`).toBe('pending');
    };

    // 一、负实盘，服务层非负校验，走 validation_displayable 可外显通道
    const negative = await apiCallExpectFail(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '-1',
    });
    expect(
      negative.status,
      `负实盘应恰为 400，实际 status=${negative.status} code=${failureCode(negative)}`
    ).toBe(400);
    expect(failureCode(negative), `负实盘属校验拒绝族，实际 code=${failureCode(negative)}`).toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      negative.message,
      `负实盘走可外显校验通道，message 应逐字符等于写入方文案，实际 ${String(negative.message)}`
    ).toBe('实盘数量不能为负');
    await readBackUnchanged('负实盘拒绝');

    // 二、NOT NULL 列显式 null，服务层入口拒绝，business_displayable 可外显通道
    const nullQty = await apiCallExpectFail(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: null,
    });
    expect(
      nullQty.status,
      `实盘量显式 null 应恰为 400，实际 status=${nullQty.status} code=${failureCode(nullQty)}`
    ).toBe(400);
    expect(
      failureCode(nullQty),
      `清空 NOT NULL 列属业务规则拒绝族，实际 code=${failureCode(nullQty)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      nullQty.message,
      `该腿用 business_displayable，message 应逐字符等于写入方文案，实际 ${String(nullQty.message)}`
    ).toBe('实盘数量不能清空：该字段为必填项');
    await readBackUnchanged('显式 null 拒绝');

    // 三、不存在主键，handler 用 AppError::not_found 脱敏通道，出参文案恒为固定常量
    const missingItem = await apiCallExpectFail(page, 'PUT', '/inventory/counts/items/2147483647', {
      quantity_actual: '10',
    });
    expect(
      missingItem.status,
      `不存在明细主键应按源码语义恰为 404，实际 status=${missingItem.status} code=${failureCode(
        missingItem
      )}`
    ).toBe(404);
    expect(
      failureCode(missingItem),
      `不存在主键应命中 NOT_FOUND 机器码，实际 code=${failureCode(missingItem)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(
      missingItem.message,
      `该腿走脱敏通道，message 应恒为固定常量「资源未找到」而非真实文案，实际 ${String(
        missingItem.message
      )}`
    ).toBe('资源未找到');
    await readBackUnchanged('不存在主键拒绝');

    // 四、主键形态非法（非数字），提取器解码拒绝，归一为 400 + VALIDATION_ERROR 固定公开文案
    const badPath = await apiCallExpectFail(page, 'PUT', '/inventory/counts/items/not-a-number', {
      quantity_actual: '10',
    });
    expect(
      badPath.status,
      `非数字主键应在提取器解码阶段被拒且恰为 400，实际 status=${badPath.status} code=${failureCode(
        badPath
      )}`
    ).toBe(400);
    expect(
      failureCode(badPath),
      `请求解码拒绝族应为 VALIDATION_ERROR，实际 code=${failureCode(badPath)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      badPath.message,
      `解码失败出参是恒定公开文案（不含 serde 原文），实际 ${String(badPath.message)}`
    ).toBe(
      '请求格式不正确：请求体或查询参数存在缺失的必填字段、字段类型错误或内容类型错误，请修正后重试'
    );
    await readBackUnchanged('非数字主键拒绝');

    // 五、状态门，提交后主表离开 pending，PUT 腿应被前置状态拒绝（该腿文案脱敏，见缺陷三）
    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    const submitted = await readCountDetail(page, countId);
    expect(
      String(submitted.status),
      `提交后状态应逐字符等于写入方词表值 in_review，实际 ${String(submitted.status)}`
    ).toBe('in_review');

    const stateGate = await apiCallExpectFail(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '99',
    });
    expect(
      stateGate.status,
      `非 pending 单改写明细应恰为 400，实际 status=${stateGate.status} code=${failureCode(
        stateGate
      )}`
    ).toBe(400);
    expect(
      failureCode(stateGate),
      `状态门属业务规则拒绝族，实际 code=${failureCode(stateGate)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      stateGate.message,
      `PUT 状态门用 AppError::business（缺陷三），message 应被收敛成固定常量「业务处理失败」，
       实际 ${String(stateGate.message)}`
    ).toBe('业务处理失败');

    // 状态门下被拒同样零写入，且主表停在 in_review
    const afterGate = await readCountDetail(page, countId);
    const gatedRow = pickItemByStockId(afterGate, stockIdA, '状态门拒绝后详情');
    expectQuantity(
      readNumber(gatedRow, 'quantity_actual', '状态门拒绝后实盘量'),
      88,
      '状态门拒绝不得改写实盘量'
    );
    expect(String(afterGate.status), '状态门拒绝不得改写主表状态').toBe('in_review');

    await cleanupCount(page, countId);
  });

  test('DELETE明细删行后集合与表头重算同步，total_items 不随动按现状钉住', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tag = genCode('ITEMDEL');
    const seeded = await seedTwoItemCount(page, productId!, warehouseId!, tag, '50', '70');
    const { countId, stockIdA, stockIdB, itemIdA, itemIdB, onHandA, onHandB } = seeded;

    // 一行盘盈、一行零差异，删除盘盈行后差异项数必须掉到 0
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '60',
    });
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdB}`, {
      quantity_actual: '70',
    });
    const beforeDelete = await readCountDetail(page, countId);
    expect(readNumber(beforeDelete, 'total_items', '删行前总项数'), '建单两行').toBe(2);
    expect(readNumber(beforeDelete, 'variance_items', '删前差异项数'), 'A 行盘盈差异非零').toBe(1);

    const deleted = await apiCallRaw<Row>(page, 'DELETE', `/inventory/counts/items/${itemIdA}`);
    expect(
      Object.prototype.hasOwnProperty.call(deleted, 'deleted'),
      `DELETE 明细响应应含后端真实键 deleted，实际键=${Object.keys(deleted).join(',')}`
    ).toBe(true);
    expect(deleted.deleted, 'DELETE 明细应回显 deleted=true').toBe(true);

    // 删行必须真的不在集合里，且剩余行未被连带改写
    const afterDelete = await readCountDetail(page, countId);
    expect(
      itemIds(afterDelete).includes(itemIdA),
      `被删明细 ${itemIdA} 不得仍出现在详情集合，实际集合=${itemIds(afterDelete).join(',')}`
    ).toBe(false);
    expect(itemIds(afterDelete).length, '删一行后明细应只剩一行').toBe(1);
    const survivor = pickItemByStockId(afterDelete, stockIdB, '删行后详情');
    expect(survivor.id, '剩余行主键不应改变').toBe(itemIdB);
    expectQuantity(
      readNumber(survivor, 'quantity_actual', '剩余行实盘量'),
      70,
      '删除另一行不得改写剩余行实盘量'
    );
    expectQuantity(
      readNumber(survivor, 'quantity_difference', '剩余行差异量'),
      0,
      '零差异行删对侧后自身差异仍应为零'
    );

    // 表头随明细行数重算的可失败判定：两枚随动 + 一枚不随动（缺陷二，按现状钉住）
    expect(
      readNumber(afterDelete, 'counted_items', '删行后已盘项数'),
      '已盘项数按 recalc_count_stats 取剩余行数，删一行应跟着掉到 1'
    ).toBe(1);
    expect(
      readNumber(afterDelete, 'variance_items', '删行后差异项数'),
      '盘盈行被删后差异项数应重算为 0'
    ).toBe(0);
    expect(
      readNumber(afterDelete, 'total_items', '删行后总项数'),
      `后端 delete_count_item 不重算 total_items（缺陷二），删行后表头总项数仍是建单快照 2，
       与明细实际 1 行永久失配`
    ).toBe(2);

    // 删明细同样不动库存（两行都在库量与可用量分文未变）
    const stockA = await readStockRow(page, stockIdA);
    const stockB = await readStockRow(page, stockIdB);
    expectQuantity(
      readNumber(stockA, 'quantity_on_hand', '被删行对应库存的在库量'),
      onHandA,
      'DELETE 明细不得改动库存'
    );
    expectQuantity(
      readNumber(stockB, 'quantity_available', '剩余行对应库存的可用量'),
      onHandB,
      'DELETE 明细不得改动库存'
    );

    // 重复删除同一主键，按 404 语义且不再改动表头
    const twice = await apiCallExpectFail(page, 'DELETE', `/inventory/counts/items/${itemIdA}`);
    expect(
      twice.status,
      `重复删除已删明细应恰为 404，实际 status=${twice.status} code=${failureCode(twice)}`
    ).toBe(404);
    expect(failureCode(twice), `重复删除应命中 NOT_FOUND，实际 code=${failureCode(twice)}`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    expect(
      twice.message,
      `该腿同样走脱敏通道，message 应恒为「资源未找到」，实际 ${String(twice.message)}`
    ).toBe('资源未找到');
    const afterTwice = await readCountDetail(page, countId);
    expect(
      readNumber(afterTwice, 'counted_items', '重复删除后已盘项数'),
      '重复删除不得再动统计'
    ).toBe(1);
    expect(String(afterTwice.status), '重复删除不得翻转主表状态').toBe('pending');

    // 状态门，提交后删除明细应被拒，且该行仍在（DELETE 腿文案可外显，见缺陷三）
    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    const stateGate = await apiCallExpectFail(page, 'DELETE', `/inventory/counts/items/${itemIdB}`);
    expect(
      stateGate.status,
      `非 pending 单删除明细应恰为 400，实际 status=${stateGate.status} code=${failureCode(
        stateGate
      )}`
    ).toBe(400);
    expect(
      failureCode(stateGate),
      `状态门属业务规则拒绝族，实际 code=${failureCode(stateGate)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      stateGate.message,
      `DELETE 状态门用 business_displayable（缺陷三与 PUT 腿不同口径），
       message 应逐字符等于写入方文案，实际 ${String(stateGate.message)}`
    ).toBe('只有待盘点状态的盘点单可以删除盘点明细');
    const afterGate = await readCountDetail(page, countId);
    expect(
      itemIds(afterGate).includes(itemIdB),
      `状态门拒绝不得删掉明细行，实际集合=${itemIds(afterGate).join(',')}`
    ).toBe(true);

    await cleanupCount(page, countId);
  });

  test('generate-no 取号腿形状与不占号段，按假可供现状钉住', async ({ page }) => {
    const first = await apiCallRaw<Row>(page, 'GET', '/inventory/counts/generate-no');
    expect(
      Object.prototype.hasOwnProperty.call(first, 'count_no'),
      `取号响应应含后端真实键 count_no，实际键=${Object.keys(first).join(',')}`
    ).toBe(true);
    expect(typeof first.count_no, `count_no 应为字符串，实际 ${typeof first.count_no}`).toBe(
      'string'
    );
    expect(
      /^IC\d{11,}$/.test(String(first.count_no)),
      `取号形状应为 IC + 8 位日期 + 流水（与建单同前缀同位数），实际 ${String(first.count_no)}`
    ).toBe(true);

    // 展示形状与真号源不一致，该响应只有单号一键，没有已落库单据的 id 与状态
    expect(
      Object.keys(first).length,
      `取号出参应只有 count_no 一键（假可供，无落库单据形状），实际键=${Object.keys(first).join(',')}`
    ).toBe(1);

    // 不占号段的确定性证据，取号全程只 SELECT（utils/number_generator.rs），
    // 两次取号只断流水单调不减，放行同分片并发建单把 max+1 抬高这一真实并发面，
    // 不写成"两次必同值"（那是把别的车道写入当成不存在）
    const second = await apiCallRaw<Row>(page, 'GET', '/inventory/counts/generate-no');
    expect(
      /^IC\d{11,}$/.test(String(second.count_no)),
      `第二次取号形状同样应为 IC 加日期加流水，实际 ${String(second.count_no)}`
    ).toBe(true);
    expect(
      Number(String(second.count_no).slice(10)),
      `号段流水只增不减，第一次=${String(first.count_no)} 第二次=${String(second.count_no)}`
    ).toBeGreaterThanOrEqual(Number(String(first.count_no).slice(10)));

    // 该号未被落库，按单号过滤列表恒零行
    const list = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/counts?count_no=${encodeURIComponent(String(first.count_no))}&page=1&page_size=10`
    );
    const rows = pickListArray<Row>(list, 'counts', '按取号过滤盘点列表');
    expect(
      rows.filter(r => String(r.count_no) === String(first.count_no)).length,
      `取号 ${String(first.count_no)} 未落库，按该号过滤应为 0 行`
    ).toBe(0);
    for (const key of ['counts', 'total', 'page', 'page_size']) {
      expect(
        Object.prototype.hasOwnProperty.call(list, key),
        `盘点列表应含分页键 ${key}，实际键=${Object.keys(list).join(',')}`
      ).toBe(true);
    }
  });

  test('明细写腿权限三档，未登录401与非授权角色403且被拒零写入', async ({ page, browser }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    expect(productId, '前置产品缺失').toBeTruthy();
    expect(warehouseId, '前置仓库缺失').toBeTruthy();

    const tag = genCode('ITEMPERM');
    const seeded = await seedTwoItemCount(page, productId!, warehouseId!, tag, '70', '70');
    const { countId, stockIdA, itemIdA } = seeded;

    // 基准值先落一次，权限两档被拒后一律以回读等于该基准证明拒绝不触库
    await apiCall<Row>(page, 'PUT', `/inventory/counts/items/${itemIdA}`, {
      quantity_actual: '77',
      notes: `E2E 权限基准 ${tag}`,
    });
    const readBackUnchanged = async (label: string): Promise<void> => {
      const detail = await readCountDetail(page, countId);
      const row = pickItemByStockId(detail, stockIdA, label);
      expectQuantity(
        readNumber(row, 'quantity_actual', `${label} 实盘量`),
        77,
        `${label} 被拒后实盘量应保持基准值 77`
      );
      expect(String(row.notes), `${label} 被拒后备注应保持基准值`).toBe(`E2E 权限基准 ${tag}`);
      expect(String(detail.status), `${label} 被拒后主表状态应保持 pending`).toBe('pending');
    };

    // 一、未登录，无会话 cookie 直打写腿，认证中间件按统一信封拒绝
    const anonymousContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const anonymousPage = await anonymousContext.newPage();
    try {
      const unauth = await anonymousPage.request.fetch(
        `${API_BASE}${API_PREFIX}/inventory/counts/items/${itemIdA}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          },
          data: JSON.stringify({ quantity_actual: '999' }),
        }
      );
      const body = (await unauth.json().catch(() => null)) as {
        code?: string;
        message?: string;
        trace_id?: string;
      } | null;
      expect(
        unauth.status(),
        `未登录改写明细应恰为 401，实际 status=${unauth.status()} code=${String(body?.code)}`
      ).toBe(401);
      expect(
        typeof body?.code === 'string' ? body.code : undefined,
        `未登录应命中 UNAUTHORIZED 机器码，实际 code=${String(body?.code)}`
      ).toBe('UNAUTHORIZED');
      // 未登录拒因走中间件固定字面量契约（utils/response.rs 的 unified_error_response 文档）：
      // 中间件刻意告知下一步动作的文案外显，不走 AppError 对 Unauthorized 的脱敏常量；
      // 缺凭据分支的字面量逐字符为 缺少认证凭据，断言按该真实契约钉。
      expect(
        typeof body?.message === 'string' ? body.message : undefined,
        `未登录拒因应为中间件缺凭据固定字面量，实际 ${String(body?.message)}`
      ).toBe('缺少认证凭据');
      expect(
        typeof body?.trace_id === 'string' && body.trace_id.length > 0,
        `失败体应含 AppError 统一信封的 trace_id，实际 keys=${Object.keys(body ?? {}).join(',')}`
      ).toBe(true);
    } finally {
      await anonymousContext.close();
    }
    await readBackUnchanged('未登录拒绝');

    // 二、非授权角色，warehouse_keeper 持 counts:read 与 counts:create 但不持
    // counts:update 与 counts:delete（种子见 services/init_service_ops/permission.rs 库存仓储域分组，
    // 键由 URL 段 inventory/counts 派生，见 middleware/permission.rs）
    await loginAsRole(page, 'warehouse_keeper');
    const forbiddenPut = await apiCallExpectFail(
      page,
      'PUT',
      `/inventory/counts/items/${itemIdA}`,
      { quantity_actual: '999' }
    );
    expect(
      forbiddenPut.status,
      `warehouse_keeper 打 counts:update 面应恰为 403，实际 status=${forbiddenPut.status} code=${failureCode(
        forbiddenPut
      )}`
    ).toBe(403);
    expect(
      failureCode(forbiddenPut),
      `权限面拒绝应为 FORBIDDEN，不得是参数族，实际 code=${failureCode(forbiddenPut)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    const forbiddenDelete = await apiCallExpectFail(
      page,
      'DELETE',
      `/inventory/counts/items/${itemIdA}`
    );
    expect(
      forbiddenDelete.status,
      `warehouse_keeper 打 counts:delete 面应恰为 403，实际 status=${forbiddenDelete.status} code=${failureCode(
        forbiddenDelete
      )}`
    ).toBe(403);
    expect(
      failureCode(forbiddenDelete),
      `删除腿权限拒绝应为 FORBIDDEN，实际 code=${failureCode(forbiddenDelete)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 三、同角色的读面放行，counts:read 命中的是列表腿（详情腿受行级数据范围过滤，
    // 归属人是建单的管理员，非确定性可见面，故不用它证明授权行命中，见文件头缺口说明）
    const keeperList = await apiCallRaw<Row>(page, 'GET', '/inventory/counts?page=1&page_size=10');
    for (const key of ['counts', 'total', 'page', 'page_size']) {
      expect(
        Object.prototype.hasOwnProperty.call(keeperList, key),
        `仓管读列表应放行并含分页键 ${key}，实际键=${Object.keys(keeperList).join(',')}`
      ).toBe(true);
    }

    // 切回本 worker 管理员做被拒零写入的回读与清理
    await loginViaUI(page, undefined, undefined, true);
    await readBackUnchanged('非授权角色拒绝');
    const survivorIds = itemIds(await readCountDetail(page, countId));
    expect(
      survivorIds.includes(itemIdA),
      `被拒的删除请求不得真的删行，实际集合=${survivorIds.join(',')}`
    ).toBe(true);

    await cleanupCount(page, countId);
  });
});
