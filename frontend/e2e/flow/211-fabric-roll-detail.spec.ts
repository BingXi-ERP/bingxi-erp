import { test, expect, type Locator, type Page } from '../diagnose-fixture';
import {
  apiCallExpectFail,
  apiCallRaw,
  BASE_URL,
  ensureTestEntities,
  expectStateGateRejection,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedPieceChain,
  tryCleanup,
  type DyedSeedPiece,
} from './helpers';
import { pickListArray } from './ui-helpers';
import { columnIndex, rowByText, rowCellText, waitFirstRow } from './table-column';

/**
 * 验布打卷的库存细码：卷级逐卷出值与米数合计。
 *
 * 覆盖面。面料库存的真实计量粒度是「一卷一匹」：验布打卷产出一条 inventory_piece 行
 * （卷号 + 米数 + 重量 + 幅宽 + 克重），验布单侧记本单本卷的卷数与米数与重量（一单一卷，
 * 同缸多卷靠另开验布单）。既有 e2e 对该链
 * 零命中（frontend/e2e 全库检索「卷号」「细码」「余码」零命中），既没钉打卷产匹的逐列落库，
 * 也没钉成品布入库标签对话框按卷逐格出值。本 spec 把两段都钉成写后必回读判据。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 路由装配在 backend/src/routes/production.rs 的 fabric_inspections()，前缀
 * /api/v1/erp/production/fabric-inspections 与 /fabric-defects（routes/mod.rs nest）。
 * 建单入参 CreateInspectionRequest（services/fabric_inspection_service.rs）只有
 * inspection_date 为必键，缸号/产品/色号/评分制式/门幅均可缺席；评分制式缺席默认 four_point，
 * 制式非 four_point|ten_point 直接业务拒绝（:273）。门幅非正数拒绝（:284）。
 * 打卷入参 RollFabricRequest（同文件 :230）：warehouse_id 与 roll_length 为必键，
 * roll_weight / roll_width / roll_gram_weight 三列走 validator `required`——键缺席即
 * 400 VALIDATION_ERROR 并点名缺哪个字段（不允许留 NULL 造成「无据标签」）；
 * 取值还必须 > 0（:667-685）。
 * 打卷产出匹（:738-798 build_piece_active_model）：piece_type='dyed'、
 * piece_no=`{缸号}-{seq:03}` 且 seq 取同缸现有最大 piece_seq+1（:701-730）、
 * batch_no 与 dye_lot_no 同为缸号、barcode=piece_no、status='AVAILABLE'（大写词表
 * models/status/purchase_inventory.rs::inventory_piece）、inventory_status='available'、
 * quality_status='合格'（中文词表 inventory_stock_quality_status::PASS，:782）、
 * inspection_id 回指本验布单（:792）、length/weight/width/gram_weight 直取打卷实测入参。
 * 打卷汇总是"一单一卷"的一次性语义：total_rolls 记本单本卷（恒为 1），
 * total_roll_length 与 total_roll_weight 记本卷实测值，状态推进 rolled。
 * 同缸多卷靠另开验布单实现，跨卷匹号由打卷侧按缸号取最大 piece_seq 递增，
 * 因此同一张已 rolled 的验布单再打卷必须被状态门拒绝，不是漏放开。
 * 卷级细码的读回通道 GET /api/v1/erp/inventory/pieces（handlers/inventory_piece_handler.rs）
 * 逐列投影 length/weight/width/gram_weight/barcode/inspection_id/piece_seq/status，
 * 缺值如实投影 null，不洗成 0。
 * DECIMAL 列按 rust_decimal 默认为十进制字符串出参，比较一律 Number(String(v)) 归一；
 * 前端标签列同样按 Number(row.length) 归一展示（views/fabric-inspections/index.vue-300）。
 *
 * 状态词表（唯一来源 models/status/quality_dyeing.rs 的 fabric_inspection 模块，全小写）：
 * pending → inspecting → graded → rolled → closed。疵点只在 inspecting 可加（service :901），
 * 评级只在 inspecting 可执行（:491），打卷只在 graded 可执行（:661），
 * 归档放行 graded|rolled（:828）。打卷另强制缸号与产品（:626、:634），
 * 缸号必须在 batch_dye_lot 建档（:690 按 dye_lot_no 取档，取不到即业务拒绝）——
 * 本 spec 因此先走真实委外染色链播种缸号（helpers.seedDyedPieceChain，该链在回仓确认时
 * find_or_create 缸号档案，services/piece_domain_service.rs-597），
 * 不手工往库里塞缸号、不伪造产品，也不在迁移里造值圆场。
 *
 * 假绿防线。每步写后按主键独立回读逐列比对；打卷产匹除 API 回读外，另开成品布入库标签
 * 对话框按卷号定位行、逐格读米数/重量/幅宽/克重/色号与实测入参比对；
 * 负例一律钉 HTTP 400 + 状态门或校验门机器码族（403/404/5xx 都不算门生效），
 * 并在被拒后回读原值确认零写入；卷号与 piece_seq 按写入方算式钉死（同缸现有最大 seq 加一，
 * 不写成「非空即可」；时间列断为可解析的非空字符串，不接受 null 被转成 "null" 蒙过。
 */

type Row = Record<string, unknown>;

/** 面料验布域前缀：routes/mod.rs nest /api/v1/erp/production + routes/production.rs */
const FI = '/production/fabric-inspections';

/** 真实链播种出的缸号维度（同批用例复用，避免重复跑整条委外染色链） */
interface Lot {
  productId: number;
  warehouseId: number;
  colorNo: string;
  dyeLotNo: string;
  seedPiece: DyedSeedPiece;
}

const num = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => String(v);

/**
 * 功能 两个十进制出参按数值等值判定，容差 1e-9。
 * 调用方 本文件的卷数合计断言。
 * 入参 actual 原始出参（rust_decimal 字符串或数字）；expected 期望数值。
 * 传给谁 结果直接进 expect(...).toBe(true)，判红消息由调用方给出。
 * 存什么 不存储。容差只吸收 JS 双精度加法的表示误差，远小于本域最小线值 0.01，
 * 不构成精度放宽；单值比较仍用 num() 直接等值。
 * 存哪里 无。
 */
function decimalEq(actual: unknown, expected: number): boolean {
  const a = num(actual);
  return Number.isFinite(a) && Number.isFinite(expected) && Math.abs(a - expected) < 1e-9;
}

/**
 * 功能 断言时间列出参是真实时间字符串并返回可解析的毫秒值。
 * 调用方 本文件对卷入库时间的非空判定。
 * 入参 value 出参原始值；label 判红消息里点名的列名。
 * 传给谁 返回毫秒值交调用方（如需要）参与比较；本文件只用于显式判红。
 * 存什么 不存储。为什么不能只判长度：String(null) 得到 "null" 也非空，
 * 会把「列没落库」读成「落了值」，故先判 typeof 再判 Date.parse。
 * 存哪里 无。
 */
function assertTimestampOut(value: unknown, label: string): number {
  expect(
    typeof value === 'string' && value.length > 0,
    `${label} 必须是非空时间字符串（不接受 null 出参），实际 ${JSON.stringify(value)}`
  ).toBe(true);
  const parsed = Date.parse(String(value));
  expect(Number.isNaN(parsed), `${label} 必须可解析为时间，实际 ${JSON.stringify(value)}`).toBe(
    false
  );
  return parsed;
}

/**
 * 功能 进入验布管理页并返回主表 Locator。
 * 调用方 本文件的列表页状态列逐格读值与标签按钮入口。
 * 入参 page 当前 Playwright Page。
 * 传给谁 返回 Locator 交 table-column 原语与行内按钮定位消费。
 * 存什么 不存储。该页主表未挂 aria-label 且页面无 h2（views/fabric-inspections/index.vue-10
 * 标题在 el-card header 的 span 内，与侧边菜单同名文案不可区分），共享原语 openPageTable
 * 的 aria-label + h2 双锚都不可用，故本地改按该页独有的「新建验布单」按钮锚定，
 * 再取第一个 el-table（对话框未打开时页面上唯一主表），不改共享夹具。
 * 存哪里 无。
 */
async function openInspectionTable(page: Page): Promise<Locator> {
  await page.goto(`${BASE_URL}/fabric-inspections`);
  await expect(
    page.getByRole('button', { name: '新建验布单' }),
    `未渲染验布管理页入口按钮，实际落点 ${page.url()}`
  ).toBeVisible({ timeout: 30_000 });
  const table = page.locator('.el-table').first();
  await table.waitFor({ state: 'visible', timeout: 30_000 });
  await waitFirstRow(table);
  return table;
}

/**
 * 功能 读列表页某验布单号行的状态列文本（词表渲染后的中文标签）。
 * 调用方 本文件每次状态流转后的界面回读。
 * 入参 page 会话页；inspectionNo 服务端生成的验布单号。
 * 传给谁 文本回调用例断言，与后端 status 原值按 api/fabric-inspection.ts 的
 * INSPECTION_STATUS_LABEL 词表渲染值逐字比对（pending 待验布 / inspecting 检验中 /
 * graded 已定级 / rolled 已打卷 / closed 已关闭）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readInspectionStatusCell(page: Page, inspectionNo: string): Promise<string> {
  const table = await openInspectionTable(page);
  const statusIdx = await columnIndex(table, '状态');
  const row = await rowByText(table, inspectionNo);
  return rowCellText(row, statusIdx);
}

/**
 * 功能 按主键回读验布记录单行。
 * 调用方 本文件每步流转与打卷后的逐列比对。
 * 入参 page 会话页；id 验布记录主键。
 * 传给谁 返回行交调用方断言。读的是 GET /production/fabric-inspections/{id}。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readInspection(page: Page, id: number): Promise<Row> {
  const row = await apiCallRaw<Row>(page, 'GET', `${FI}/${id}`);
  expect(Number(row.id), '验布记录回读应带同一主键').toBe(id);
  return row;
}

/**
 * 功能 按缸号读该缸全部染色匹（卷级细码通道）。
 * 调用方 本文件的 readRollsOfInspection。
 * 入参 page 会话页；dyeLotNo 缸号。
 * 传给谁 返回数组交上层按 inspection_id 归集。读的是
 * GET /inventory/pieces?dye_lot_no=&piece_type=dyed，投影逐列保留 null（缺值不洗成 0）。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function readDyedPiecesByLot(page: Page, dyeLotNo: string): Promise<Row[]> {
  const data = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/pieces?dye_lot_no=${encodeURIComponent(dyeLotNo)}&piece_type=dyed&page=1&page_size=100`
  );
  return pickListArray<Row>(data, 'items', `缸号 ${dyeLotNo} 的染色匹细码`);
}

/**
 * 功能 归集本次验布单打卷产出的卷行，按 piece_seq 升序。
 * 调用方 本文件的逐卷出值与合计断言。
 * 入参 page 会话页；dyeLotNo 缸号；inspectionId 验布记录主键。
 * 传给谁 返回数组按下标交调用方逐卷比对 length/weight/width/gram_weight 与卷号。
 * 存什么 不存储。锚点是产匹行 inspection_id 列（services/fabric_inspection_service.rs
 * 打卷时写入本验布单 id），据此把本次产出的卷与同缸其它来源的匹严格区分。
 * 存哪里 无。
 */
async function readRollsOfInspection(
  page: Page,
  dyeLotNo: string,
  inspectionId: number
): Promise<Row[]> {
  const pieces = await readDyedPiecesByLot(page, dyeLotNo);
  return pieces
    .filter(p => Number(p.inspection_id) === inspectionId)
    .sort((a, b) => num(a.piece_seq) - num(b.piece_seq));
}

/**
 * 功能 按写入方算式算出该缸下一匹细码应有的 piece_seq，即同缸现有最大 seq 加一。
 * 调用方 本文件钉卷号与卷序号的各处断言。
 * 入参 page 会话页；dyeLotNo 缸号；出参 交调用方拼 {缸号}-{seq:03} 并与产出行逐字段比对的正整数。
 * 传给谁 只交给本文件的 toBe 判据，不落库不外传。
 * 存什么 不存储。必须在打卷请求发出前实时取数：同一缸会被本文件多条用例先后打卷，序号取决于
 *   届时已落库的匹数，写死某个定值会随用例执行次序与重跑次数变化而假红。
 * 存哪里 无。
 */
async function nextLotPieceSeq(page: Page, dyeLotNo: string): Promise<number> {
  const pieces = await readDyedPiecesByLot(page, dyeLotNo);
  return pieces.reduce((max, p) => Math.max(max, num(p.piece_seq) || 0), 0) + 1;
}

function lotPieceNo(dyeLotNo: string, seq: number): string {
  return `${dyeLotNo}-${String(seq).padStart(3, '0')}`;
}

/**
 * 功能 整列批量读某表格容器一列的全部单元格文本。
 * 调用方 本文件断言标签对话框已列出本卷卷号。
 * 入参 table 表格容器 Locator（对话框内表格）；index 由 columnIndex 按列头实时求得的列下标。
 * 传给谁 返回文本数组交调用方做 includes 判定。
 * 存什么 不存储。共享原语 columnCellTexts 语义相同，但调用方须保证容器就是本对话框表格，
 * 以免跨容器误命中页面主表，故在派工授权范围内本地实现。
 * 存哪里 无。
 */
async function columnCellTextsIn(table: Locator, index: number): Promise<string[]> {
  const cells = table.locator(
    `.el-table__body-wrapper .el-table__row > td:nth-child(${index + 1})`
  );
  return (await cells.allInnerTexts()).map(text => text.trim());
}

/**
 * 功能 播种一条已在 batch_dye_lot 建档的缸号及其 AVAILABLE 染色匹，供打卷取档与卷序号递增。
 * 调用方 本文件三枚用例（同批内只跑一次真实委外染色链）。
 * 入参 page 会话页。
 * 传给谁 返回的缸号/色号/产品/仓库进验布单建单载荷与打卷入参。
 * 存什么 模块级缓存存本次会话播种出的维度值（进程内，不落库、不跨文件共享）。
 * 存哪里 本文件模块作用域变量 lotCache。
 */
let lotCache: Lot | null = null;

async function ensureLot(page: Page): Promise<Lot> {
  if (lotCache) return lotCache;
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  expect(
    typeof productId === 'number' && Number.isInteger(productId) && productId > 0,
    `前置缺失：ctx.productIds[0] 应为已建档的正整数产品 id，实际=${String(productId)}`
  ).toBe(true);
  const target = await pickDyeableWarehouse(page);
  const dyeLotNo = genDyeLotNo();
  const colorNo = `E2E-RC-${genCode('C')}`;
  const pieces = await seedDyedPieceChain(page, {
    productId,
    warehouseId: target.id,
    colorNo,
    dyeLotNo,
    pieceCount: 1,
    lengthPerPieceMeters: 100,
    context: '211-LOT',
  });
  expect(
    pieces.length,
    `真实委外染色链应至少产出 1 匹 AVAILABLE 染色匹（同时完成缸号 ${dyeLotNo} 建档），实际 ${pieces.length}`
  ).toBeGreaterThan(0);
  lotCache = { productId, warehouseId: target.id, colorNo, dyeLotNo, seedPiece: pieces[0] };
  return lotCache;
}

/**
 * 功能 建一张验布单（只建单，不流转），返回服务端出参行。
 * 调用方 本文件需要自行控制流转次序的用例。
 * 入参 page 会话页；lot 缸号维度；opts.width 门幅(英寸)字符串，opts.omitWidth 为真时不提交门幅键。
 * 传给谁 返回行的 id 与 inspection_no 供后续 start/grade/roll 与逐列断言。
 * 存什么 不存储；单号由服务端生成器出 FIR- 前缀（services/fabric_inspection_service.rs）。
 * 存哪里 无。
 */
async function postInspection(
  page: Page,
  lot: Lot,
  opts: { width?: string; omitWidth?: boolean; dyeLotNo?: string } = {}
): Promise<Row> {
  const stamp = String(Date.now()).slice(-6);
  const payload: Row = {
    dye_lot_no: opts.dyeLotNo ?? lot.dyeLotNo,
    product_id: lot.productId,
    product_name: `E2E打卷面料${stamp}`,
    color_no: lot.colorNo,
    inspection_date: new Date().toISOString().slice(0, 10),
    inspector_name: `E2E验布员${stamp}`,
    machine_no: `M-E2E-${stamp}`,
    scoring_system: 'four_point',
    remarks: `E2E打卷细码${stamp}`,
  };
  if (opts.omitWidth !== true) {
    payload.fabric_width_inches = opts.width ?? '60.00';
  }
  const created = await apiCallRaw<Row>(page, 'POST', FI, payload);
  expect(
    Number.isFinite(Number(created.id)),
    `建验布单未回主键 id：${JSON.stringify(created).slice(0, 200)}`
  ).toBe(true);
  return created;
}

/**
 * 功能 开始验布（pending → inspecting）并回读确认。
 * 调用方 本文件各用例在登记疵点前的必经步。
 * 入参 page 会话页；id 验布记录主键。
 * 传给谁 返回流转后的行交调用方继续断言。写的是 POST /production/fabric-inspections/{id}/start。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function startInspection(page: Page, id: number): Promise<Row> {
  const started = await apiCallRaw<Row>(page, 'POST', `${FI}/${id}/start`);
  expect(started.status, '开始验布后状态应为词表 inspecting').toBe('inspecting');
  return started;
}

/**
 * 功能 评级（inspecting → graded）并回读确认，打卷的必经前置。
 * 调用方 本文件各用例打卷前的定级步。
 * 入参 page 会话页；id 验布记录主键；body 受检码数与可选合格率。
 * 传给谁 返回流转后的行交调用方断言；写的是 POST /production/fabric-inspections/{id}/grade。
 * 存什么 不存储。
 * 存哪里 无。
 */
async function gradeInspection(
  page: Page,
  id: number,
  body: { inspected_yards: string; qualification_rate?: string }
): Promise<Row> {
  const graded = await apiCallRaw<Row>(page, 'POST', `${FI}/${id}/grade`, body);
  expect(graded.status, '评级后状态应为词表 graded').toBe('graded');
  return graded;
}

test.describe.serial('验布打卷库存细码：逐卷出值、米数合计与标签逐格回读', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('打卷产出一卷：卷号与米数重量幅宽克重逐列出值，汇总与标签对话框逐格一致', async ({
    page,
  }) => {
    const lot = await ensureLot(page);
    const created = await postInspection(page, lot);
    const id = Number(created.id);
    const inspectionNo = str(created.inspection_no);

    // 建单逐列回读：初值 pending、评分制式、门幅、缸号色号产品与单号前缀
    expect(
      inspectionNo.startsWith('FIR-'),
      `验布单号应由生成器出 FIR- 前缀，实际 ${inspectionNo}`
    ).toBe(true);
    expect(created.status, '验布单初值应为词表 pending').toBe('pending');
    expect(created.scoring_system, '评分制式应落提交值 four_point').toBe('four_point');
    expect(num(created.fabric_width_inches), '门幅(英寸)应落库 60').toBe(60);
    expect(str(created.dye_lot_no), '缸号应落播种链的真实缸号').toBe(lot.dyeLotNo);
    expect(str(created.color_no), '色号应落播种链的真实色号').toBe(lot.colorNo);
    expect(Number(created.product_id), '产品应落播种链的真实产品').toBe(lot.productId);
    expect(
      created.total_rolls,
      `未打卷时总卷数应为 0，实际 ${JSON.stringify(created.total_rolls)}`
    ).toBe(0);
    expect(
      num(created.total_roll_length),
      `未打卷时总米数应为 0，实际 ${JSON.stringify(created.total_roll_length)}`
    ).toBe(0);
    expect(
      await readInspectionStatusCell(page, inspectionNo),
      '列表页状态列未按 pending 渲染词表标签'
    ).toBe('待验布');

    // 按单号回读通道：与详情口同一主键
    const byNo = await apiCallRaw<Row>(
      page,
      'GET',
      `${FI}/by-no/${encodeURIComponent(inspectionNo)}`
    );
    expect(Number(byNo.id), 'by-no 口回读的主键应与详情口一致').toBe(id);

    await startInspection(page, id);
    // 四分制扣分：≤3 寸记 1 分；破洞不论长度记 4 分（service :65-82）
    const defect1 = await apiCallRaw<Row>(page, 'POST', '/production/fabric-defects', {
      inspection_id: id,
      defect_type: 'broken_end',
      position_yards: '5.00',
      defect_length_inches: '2.00',
      direction: 'warp',
      description: '断经一码',
    });
    expect(Number(defect1.points), '断经 2 寸应自动记 1 分').toBe(1);
    const defect2 = await apiCallRaw<Row>(page, 'POST', '/production/fabric-defects', {
      inspection_id: id,
      defect_type: 'hole',
      position_yards: '12.00',
      defect_length_inches: '1.00',
      is_hole: true,
      description: '破洞一码',
    });
    expect(Number(defect2.points), '破洞不论长度应记 4 分').toBe(4);

    const defectRows = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', `${FI}/${id}/defects`),
      'bare',
      `验布单 ${inspectionNo} 的疵点明细`
    );
    expect(defectRows.length, '疵点明细按单回读应命中两行').toBe(2);
    expect(
      defectRows.reduce((sum, d) => sum + Number(d.points), 0),
      '疵点行扣分逐行相加应为 5'
    ).toBe(5);

    // 评级：同码封顶后合计 5 分；每百平方码分数 = 5*3600/(50*60) = 6 → 首级；合格率 95 → A 级
    await gradeInspection(page, id, { inspected_yards: '50.00', qualification_rate: '95.00' });
    const gradeReadBack = await readInspection(page, id);
    expect(Number(gradeReadBack.total_defect_points), '总扣分应落封顶后合计 5').toBe(5);
    expect(num(gradeReadBack.inspected_yards), '受检码数应落提交值 50').toBe(50);
    expect(num(gradeReadBack.points_per_100_sq_yards), '每百平方码分数应落公式值 6').toBe(6);
    expect(gradeReadBack.grade, '四分制 ≤40 应判首级 first').toBe('first');
    expect(gradeReadBack.abc_grade, '合格率 95 且无物理指标未通过项应为 A 级').toBe('A');
    expect(num(gradeReadBack.qualification_rate), '合格率应落提交值 95').toBe(95);

    // 打卷前先取该缸下一序号：卷号与卷序号由届时同缸已落库的匹数决定，不能写死
    const expectedSeq = await nextLotPieceSeq(page, lot.dyeLotNo);

    // 打卷：实测四列入卷
    const rolled = await apiCallRaw<Row>(page, 'POST', `${FI}/${id}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '123.45',
      roll_weight: '30.50',
      roll_width: '180.0',
      roll_gram_weight: '210.0',
    });
    expect(rolled.status, '打卷后状态应为词表 rolled').toBe('rolled');

    // 汇总列回读
    const rollReadBack = await readInspection(page, id);
    expect(Number(rollReadBack.total_rolls), '总卷数应为本单本卷的 1').toBe(1);
    expect(num(rollReadBack.total_roll_length), '总米数应等于本卷实测米数').toBe(123.45);
    expect(num(rollReadBack.total_roll_weight), '总重量应等于本卷实测重量').toBe(30.5);

    // 卷级细码逐列出值（API 通道）
    const rolls = await readRollsOfInspection(page, lot.dyeLotNo, id);
    expect(rolls.length, `本次打卷应产出 1 卷细码，实际 ${rolls.length}`).toBe(1);
    const rollPiece = rolls[0];
    // 卷号等于写入方算式的 {缸号}-{seq:03}，seq 为打卷前同缸最大序号加一
    expect(
      str(rollPiece.piece_no),
      `卷号必须按写入方口径等于同缸递增序号 ${expectedSeq}，实际 ${JSON.stringify(rollPiece.piece_no)}`
    ).toBe(lotPieceNo(lot.dyeLotNo, expectedSeq));
    expect(
      Number(rollPiece.piece_seq),
      `卷序号应为同缸递增后的 ${expectedSeq}，实际 ${JSON.stringify(rollPiece.piece_seq)}`
    ).toBe(expectedSeq);
    expect(str(rollPiece.barcode), '卷条码应与卷号同源').toBe(str(rollPiece.piece_no));
    expect(str(rollPiece.batch_no), '卷批次应回落缸号本身').toBe(lot.dyeLotNo);
    expect(str(rollPiece.dye_lot_no), '卷缸号应落真实缸号').toBe(lot.dyeLotNo);
    expect(rollPiece.piece_type, '打卷产匹类型应为 dyed').toBe('dyed');
    expect(rollPiece.status, '新产卷状态应为大写词表 AVAILABLE').toBe('AVAILABLE');
    expect(rollPiece.quality_status, '质检状态应落中文词表 合格').toBe('合格');
    expect(Number(rollPiece.product_id), '卷产品应随验布单产品落库').toBe(lot.productId);
    expect(Number(rollPiece.warehouse_id), '卷仓库应落打卷提交的仓库').toBe(lot.warehouseId);
    expect(str(rollPiece.color_no), '卷色号应随验布单色号落库').toBe(lot.colorNo);
    expect(num(rollPiece.length), '卷米数应落打卷实测值').toBe(123.45);
    expect(num(rollPiece.weight), '卷重量应落打卷实测值').toBe(30.5);
    expect(num(rollPiece.width), '卷幅宽应落打卷实测值').toBe(180);
    expect(num(rollPiece.gram_weight), '卷克重应落打卷实测值').toBe(210);
    assertTimestampOut(rollPiece.warehouse_in_at, '卷入库时间');

    // 界面回读：列表状态列 + 成品布入库标签对话框按卷号逐格读细码
    const table = await openInspectionTable(page);
    const targetRow = await rowByText(table, inspectionNo);
    expect(
      await rowCellText(targetRow, await columnIndex(table, '状态')),
      '列表页状态列未随 rolled 渲染词表标签'
    ).toBe('已打卷');
    await targetRow.getByRole('button', { name: '打印标签' }).click();
    const dialog = page.getByRole('dialog', { name: '成品布入库标签' });
    await expect(dialog, '打卷后未打开成品布入库标签对话框').toBeVisible({ timeout: 30_000 });
    const labelTable = dialog.locator('.el-table').first();
    await waitFirstRow(labelTable);
    const pieceNo = lotPieceNo(lot.dyeLotNo, expectedSeq);
    expect(
      (await columnCellTextsIn(labelTable, await columnIndex(labelTable, '匹号'))).includes(
        pieceNo
      ),
      `标签清单按缸号未列出本卷 ${pieceNo}`
    ).toBe(true);
    const labelRow = await rowByText(labelTable, pieceNo);
    expect(
      await rowCellText(labelRow, await columnIndex(labelTable, '米数')),
      '标签列米数未按实测值出值'
    ).toBe('123.45');
    expect(
      await rowCellText(labelRow, await columnIndex(labelTable, '重量(kg)')),
      '标签列重量未按实测值出值'
    ).toBe('30.5');
    expect(
      await rowCellText(labelRow, await columnIndex(labelTable, '幅宽(cm)')),
      '标签列幅宽未按实测值出值'
    ).toBe('180');
    expect(
      await rowCellText(labelRow, await columnIndex(labelTable, '克重(g/m²)')),
      '标签列克重未按实测值出值'
    ).toBe('210');
    expect(
      await rowCellText(labelRow, await columnIndex(labelTable, '色号')),
      '标签列色号未随验布单出值'
    ).toBe(lot.colorNo);
    // exact 必需：el-dialog 头部自带 aria-label="关闭此对话框" 的关闭按钮，
    // getByRole 的 name 默认按子串匹配，不加 exact 会同时命中头部那颗而 strict 判红
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();

    // 关闭归档：rolled → closed，界面同步，且不清空已打卷的汇总
    const closed = await apiCallRaw<Row>(page, 'POST', `${FI}/${id}/close`);
    expect(closed.status, '关闭归档后状态应为词表 closed').toBe('closed');
    expect(Number((await readInspection(page, id)).total_rolls), '归档不清空已打卷的总卷数').toBe(
      1
    );
    expect(
      await readInspectionStatusCell(page, inspectionNo),
      '列表页状态列未随 closed 渲染词表标签'
    ).toBe('已关闭');

    await tryCleanup(page, 'DELETE', `${FI}/${id}`, `fabric-inspection#${id}`);
  });

  test('同一验布单不得打第二卷：状态门拒绝且首卷汇总与细码零漂移', async ({ page }) => {
    const lot = await ensureLot(page);
    const created = await postInspection(page, lot);
    const id = Number(created.id);

    await startInspection(page, id);
    await gradeInspection(page, id, { inspected_yards: '50.00' });
    // 首卷卷号取决于本用例打卷前同缸已落库的匹数，先实量再打卷
    const firstSeq = await nextLotPieceSeq(page, lot.dyeLotNo);
    await apiCallRaw(page, 'POST', `${FI}/${id}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '123.45',
      roll_weight: '30.50',
      roll_width: '180.0',
      roll_gram_weight: '210.0',
    });
    expect(Number((await readInspection(page, id)).total_rolls), '第一卷应把总卷数推进到 1').toBe(
      1
    );

    // 同单第二卷必须被状态门拒绝。口径依据：打卷门只放行 graded，而打卷成功即推进 rolled，
    // 且无端点把 rolled 退回 graded；同缸多卷靠另开验布单，其跨卷 piece_seq 递增回归已由
    // 生产染色链用例覆盖，本用例不重复主张同单累加。
    const second = await apiCallExpectFail(page, 'POST', `${FI}/${id}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '98.20',
      roll_weight: '25.05',
      roll_width: '180.0',
      roll_gram_weight: '210.0',
    });
    expectStateGateRejection(second, '已打卷（rolled）的验布单不得再打第二卷');
    expect(
      String(second.message ?? ''),
      `同单第二卷的拒绝文案必须点名状态门，实际 message=${JSON.stringify(second.message)}`
    ).toMatch(/仅已评级\(graded\)状态可打卷入库/);

    // 拒绝必须零写入：状态与本卷汇总都不得被这次失败的请求带跑
    const afterSecond = await readInspection(page, id);
    expect(afterSecond.status, '第二卷被拒后状态应仍为 rolled').toBe('rolled');
    expect(
      Number(afterSecond.total_rolls),
      `第二卷被拒后总卷数不得增加，实际 ${JSON.stringify(afterSecond.total_rolls)}`
    ).toBe(1);
    expect(
      decimalEq(afterSecond.total_roll_length, 123.45),
      `第二卷被拒后总米数不得被改写，应仍为首卷 123.45，实际 ${JSON.stringify(
        afterSecond.total_roll_length
      )}`
    ).toBe(true);
    expect(
      decimalEq(afterSecond.total_roll_weight, 30.5),
      `第二卷被拒后总重量不得被改写，应仍为首卷 30.5，实际 ${JSON.stringify(
        afterSecond.total_roll_weight
      )}`
    ).toBe(true);

    // 细码侧同样零新增：本单只产出一卷，卷号按同缸递增序号且米数重量为打卷实测值
    const rolls = await readRollsOfInspection(page, lot.dyeLotNo, id);
    expect(rolls.length, `本单应只产出 1 卷细码，实际 ${rolls.length}`).toBe(1);
    expect(
      str(rolls[0].piece_no),
      `首卷卷号应为同缸递增序号 ${firstSeq}，实际 ${JSON.stringify(rolls[0].piece_no)}`
    ).toBe(lotPieceNo(lot.dyeLotNo, firstSeq));
    expect(num(rolls[0].length), '首卷米数应独立保真').toBe(123.45);
    expect(num(rolls[0].weight), '首卷重量应独立保真').toBe(30.5);

    await tryCleanup(page, 'DELETE', `${FI}/${id}`, `fabric-inspection#${id}`);
  });

  test('打卷与疵点登记的必填门、状态门与取值门：拒绝后零写入', async ({ page }) => {
    const lot = await ensureLot(page);

    // 未验布（pending）不可打卷
    const pendingCreated = await postInspection(page, lot);
    const pendingId = Number(pendingCreated.id);
    const rollOnPending = await apiCallExpectFail(page, 'POST', `${FI}/${pendingId}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '10.00',
      roll_weight: '5.00',
      roll_width: '180.0',
      roll_gram_weight: '200.0',
    });
    expectStateGateRejection(rollOnPending, 'pending 状态不可打卷');
    const pendingReadBack = await readInspection(page, pendingId);
    expect(pendingReadBack.status, '打卷被拒后状态不得推进').toBe('pending');
    expect(Number(pendingReadBack.total_rolls), '打卷被拒后总卷数不得增加').toBe(0);

    // 验布中（inspecting）不可打卷，但可登记疵点；非法疵点类型必须被白名单拒绝
    const inspectingCreated = await postInspection(page, lot);
    const inspectingId = Number(inspectingCreated.id);
    await startInspection(page, inspectingId);
    const badType = await apiCallExpectFail(page, 'POST', '/production/fabric-defects', {
      inspection_id: inspectingId,
      defect_type: 'not_a_type',
      position_yards: '1.00',
      defect_length_inches: '1.00',
    });
    expectStateGateRejection(badType, '疵点类型必须在后端白名单内');
    const defectsAfterBad = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', `${FI}/${inspectingId}/defects`),
      'bare',
      '非法类型拒绝后的疵点清单'
    );
    expect(defectsAfterBad.length, '非法疵点类型被拒后不应产生疵点行').toBe(0);
    const rollOnInspecting = await apiCallExpectFail(page, 'POST', `${FI}/${inspectingId}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '10.00',
      roll_weight: '5.00',
      roll_width: '180.0',
      roll_gram_weight: '200.0',
    });
    expectStateGateRejection(rollOnInspecting, 'inspecting 状态不可打卷');

    // 四分制评级缺门幅：fail-closed 点名，不用默认幅宽兜底
    const noWidthCreated = await postInspection(page, lot, { omitWidth: true });
    const noWidthId = Number(noWidthCreated.id);
    await startInspection(page, noWidthId);
    expect(
      (await readInspection(page, noWidthId)).fabric_width_inches,
      '未提交门幅时应落 NULL'
    ).toBeNull();
    const gradeNoWidth = await apiCallExpectFail(page, 'POST', `${FI}/${noWidthId}/grade`, {
      inspected_yards: '50.00',
    });
    expect(
      gradeNoWidth.status,
      `四分制评级缺门幅应被拒（HTTP 400），实际 status=${gradeNoWidth.status} code=${JSON.stringify(gradeNoWidth.code)}`
    ).toBe(400);
    expect(
      failureCode(gradeNoWidth),
      `缺门幅属字段必填族，机器码应为 VALIDATION_ERROR，实际 code=${JSON.stringify(gradeNoWidth.code)}`
    ).toBe('VALIDATION_ERROR');
    expect((await readInspection(page, noWidthId)).status, '评级被拒后状态不得推进为 graded').toBe(
      'inspecting'
    );

    // 打卷三列实测值必填门：缺重量即 400 校验族，且整单零写入
    const rollableCreated = await postInspection(page, lot);
    const rollableId = Number(rollableCreated.id);
    await startInspection(page, rollableId);
    await gradeInspection(page, rollableId, {
      inspected_yards: '50.00',
      qualification_rate: '95.00',
    });
    const missingWeight = await apiCallExpectFail(page, 'POST', `${FI}/${rollableId}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '10.00',
      roll_width: '180.0',
      roll_gram_weight: '200.0',
    });
    expect(
      missingWeight.status,
      `打卷缺卷重应被拒（HTTP 400），实际 status=${missingWeight.status} code=${JSON.stringify(missingWeight.code)}`
    ).toBe(400);
    expect(
      failureCode(missingWeight),
      `缺卷重属字段必填族，机器码应为 VALIDATION_ERROR，实际 code=${JSON.stringify(missingWeight.code)}`
    ).toBe('VALIDATION_ERROR');
    const afterMissingWeight = await readInspection(page, rollableId);
    expect(afterMissingWeight.status, '必填门拒绝后状态不得推进为 rolled').toBe('graded');
    expect(Number(afterMissingWeight.total_rolls), '必填门拒绝后总卷数不得增加').toBe(0);
    expect(
      (await readRollsOfInspection(page, lot.dyeLotNo, rollableId)).length,
      '必填门拒绝后不应产出卷行'
    ).toBe(0);

    // 取值门：卷长与克重非正数被拒（提交的是操作员自己填的字段，属可外显族）
    const badRolls: Row[] = [
      {
        warehouse_id: lot.warehouseId,
        roll_length: '0',
        roll_weight: '5.00',
        roll_width: '180.0',
        roll_gram_weight: '200.0',
      },
      {
        warehouse_id: lot.warehouseId,
        roll_length: '10.00',
        roll_weight: '5.00',
        roll_width: '180.0',
        roll_gram_weight: '-1',
      },
    ];
    for (const badRoll of badRolls) {
      const rejected = await apiCallExpectFail(page, 'POST', `${FI}/${rollableId}/roll`, badRoll);
      expect(
        rejected.status,
        `非正实测值应被拒（HTTP 400），载荷 ${JSON.stringify(badRoll)} 实际 status=${rejected.status} code=${JSON.stringify(rejected.code)}`
      ).toBe(400);
    }
    expect(
      Number((await readInspection(page, rollableId)).total_rolls),
      '取值门拒绝后总卷数仍不得增加'
    ).toBe(0);

    // 缸号未在 batch_dye_lot 建档的验布单不可打卷（不造值圆场，如实拒绝）
    const fakeLotCreated = await postInspection(page, lot, { dyeLotNo: genDyeLotNo() });
    const fakeLotId = Number(fakeLotCreated.id);
    await startInspection(page, fakeLotId);
    await gradeInspection(page, fakeLotId, {
      inspected_yards: '50.00',
      qualification_rate: '95.00',
    });
    const rollOnFakeLot = await apiCallExpectFail(page, 'POST', `${FI}/${fakeLotId}/roll`, {
      warehouse_id: lot.warehouseId,
      roll_length: '10.00',
      roll_weight: '5.00',
      roll_width: '180.0',
      roll_gram_weight: '200.0',
    });
    expect(
      rollOnFakeLot.status,
      `未建档缸号打卷应被业务拒绝（HTTP 400），实际 status=${rollOnFakeLot.status} code=${JSON.stringify(rollOnFakeLot.code)}`
    ).toBe(400);
    expect(
      Number((await readInspection(page, fakeLotId)).total_rolls),
      '缸号未建档被拒后不得产出卷'
    ).toBe(0);

    // pending 单可软删：删除后详情口读不到（真实清理验证，不被吞掉当通过）
    await apiCallRaw(page, 'DELETE', `${FI}/${pendingId}`);
    const afterDelete = await apiCallExpectFail(page, 'GET', `${FI}/${pendingId}`);
    expect(
      afterDelete.status,
      `软删后详情口应读不到本单（HTTP 404），实际 status=${afterDelete.status}`
    ).toBe(404);

    await tryCleanup(page, 'DELETE', `${FI}/${rollableId}`, `fabric-inspection#${rollableId}`);
  });
});
