/**
 * 面料缸差登记与零头余码持久化（flow 400）。
 *
 * 功能：钉两条面料业务里无既有 spec 覆盖的真实链路。
 * 一，坯布侧缸号与色号双维建档登记。同一产品同一色号的两卷坯布分属两个缸号，
 *    缸差事实在 greige_fabric 行的 dye_lot_no 与 color_no 两列上可区分、可追溯、
 *    可改判（更新缸号后读回新值），并按克重与幅宽的线密度做米公斤双单位一致性门控
 *    （面料相容类型下的米数与公斤数换算即钉在本腿，越界显式拒绝，不静默写库）。
 * 二，染色布卷拆分后的零头余码读写。委外染色链产出的 AVAILABLE 染色匹（母卷）
 *    剪裁拆出零头子卷后，母卷剩余米数、子卷剪裁米数与母卷原始米数三个量在库存
 *    细码（inventory_piece）侧逐列落库且满足守恒式（母卷剩余 + 子卷 = 母卷原始），
 *    子卷逐列继承母卷缸号、色号、批号、匹类型、幅宽、克重与质检判定；委外回仓
 *    不录实测重量，故母子两卷重量列必须如实保持 NULL（拆分链路不洗 0、不造数），
 *    缸号维度可经 GET /inventory/pieces 的 dye_lot_no 筛选直接追回母子两卷。
 *
 * 调用方：Playwright E2E 套件，由 CI 的 e2e flow 分片按文件哈希收集执行。
 * 入参：登录走 loginViaUI（e2e_admin 会话），实体前置走 ensureTestEntities 与
 *    getCtx 的 productIds、supplierId、warehouseIds；缸号走 genDyeLotNo、唯一码走
 *    genCode，不手造主键、不绕过状态机。
 * 传给谁：请求经 flow/helpers 的 apiCall 与 apiCallRaw 与 apiCallExpectFail 发出，
 *    列表解包走 ui-helpers 的 pickListArray，失败机器码直接读 ApiFailureResult 的 code。
 * 存什么：greige_fabric 两行（各自 dye_lot_no、color_no、length_m、weight_kg、
 *    quantity_meters、quantity_kg、status 在库，出库后转已出库）；inventory_piece
 *    在既有一匹母卷之上净增一行零头子卷（piece_no、parent_piece_id、length、
 *    status AVAILABLE、继承的 dye_lot_no 与 color_no 与 batch_no 等，weight 为 NULL）。
 * 存哪里：greige_fabric 与 inventory_piece 业务表，均在真实 PostgreSQL 链路落库。
 *
 * 断言判据与后端口径出处（逐段读源，非推测）。
 * 端点存在性以 frontend/scripts/route-snapshot.txt 在册行为准。
 * 坯布建档与读写通道为 greige_fabric_handler 的 create_greige_fabric、
 * get_greige_fabric、list_greige_fabrics、update_greige_fabric、delete_greige_fabric、
 * stock-out。CreateGreigeFabricRequest 与 UpdateGreigeFabricRequest 均带
 * dye_lot_no 与 color_no（V15 P2 21.3 缸号色号追溯段注释）；列表筛选支持
 * fabric_no 与 status，分页键为 page 与 page_size。
 * 状态词表唯一来源为 models/status/purchase_inventory.rs 的 greige_fabric_status
 * 模块，中文 token 在库与已出库，禁止英文化，比较点与写入值逐字符相同；
 * create 缺省 status 即在库，delete 有在库不可删门（business_displayable，
 * 机器码 BUSINESS_ERROR，出处 delete_greige_fabric）。
 * 双单位一致性门在 ensure_dual_unit_consistent，当 length_m 与 weight_kg 同时提交
 * 且克重与幅宽均为正时，按 utils/dual_unit_converter::DualUnitConverter 的
 * meters_to_kg 公式（公斤 = 米 × 克重 g/m² × 幅宽 m ÷ 1000，容差 0.5%）核对，
 * 越界显式拒绝，机器码 VALIDATION_ERROR（出处 utils/error.rs 的
 * ValidationErrorDisplayable 映射）；本用例选取换算恰好值（200 g/m²、160 cm 线密度
 * 0.32 kg/m，50 m 对 16 kg 与 40 m 对 12.8 kg），避免对舍入方向做二次推断。
 * DECIMAL 出参按 rust_decimal 默认序列化为十进制字符串（未开 serde-float），
 * 数值判据统一经 String 归一后逐值相等，并至少钉一处字符串线格式判据。
 * 拆匹通道为 piece_split_handler 的 split_fabric_piece，入参
 * SplitPieceRequest{parent_piece_id、cut_length、cut_weight、new_barcode}，
 * 出参 SplitPieceResponse{message、parent_piece、new_piece}，两匹均为
 * inventory_piece::Model 全行（键名 snake_case）。update_parent_piece 将母卷
 * length 置为剩余；母卷无实测重量且本次未提交剪裁重量时重量列保持原值不动
 * （源码明注不猜、不塞 0）；original_length 首次拆分记为拆分前现长
 * （unwrap_or(parent.length) 口径）。build_new_piece 子卷 status 取
 * piece_status::AVAILABLE（models/status/purchase_inventory.rs 的 inventory_piece
 * 大写词表），piece_type 与 batch_no 与 product_id 与 warehouse_id 与 dye_lot_no 与
 * color_no 与 width 与 gram_weight 与 quality_status 按母卷继承，weight 取本次提交
 * 剪裁重量（本腿不提交，故为 NULL），barcode 等于 new_barcode 传入的 piece_no，
 * parent_piece_id 回指母卷。validate_parent_piece 的额度门，剪裁长度不得超过母卷
 * 现长（business，机器码 BUSINESS_ERROR）。validate_split_consistency 在事务内校验
 * 母卷剩余 + 全部子卷长度之和 = 原始长度，不等即回滚。
 * 细码读回通道 GET /inventory/pieces（list_pieces，PieceResponse 投影含
 * length、weight、dye_lot_no、color_no、batch_no、parent_piece_id、status、
 * quality_status、width、gram_weight、barcode、inspection_id 各键）支持
 * piece_no 与 dye_lot_no 等值筛选，投影不含 original_length，故原始长度判据
 * 只取拆分响应回显，细码侧守恒式以种子现长 100 为基准。
 * 委外回仓产匹的重量口径出处：outsourcing_ops/receipt.rs 产匹构造段
 * weight: Set(req.weight)，seedDyedPieceChain 的回仓请求体不含 weight 键，
 * 故母卷实测重量为 NULL 是链路事实而非缺陷，断言按 NULL 如实钉。
 *
 * 为何缸差不写色差值断言（证据不足，宁缺毋滥）。
 * 全仓路由面（route-snapshot.txt 检索 color_diff、delta、lot_diff、remnant）不存在
 * 按缸对登记缸间色差值的端点与字段，跨缸色差 ΔE 的既有落点是 fabric_defect_record
 * 的 color_diff 疵点（已由 flow 212 单缸场景钉死）与 bulk_color_approval 的客户
 * 确认反馈（前置链要求销售订单加已完成染色批次加合格大货库存，重夹具归 81 已声明
 * 未覆盖面）。故本用例只钉缸差的可证本体，缸号与色号双维建档登记、跨缸可区分、
 * 缸号改判追溯，ΔE 数值登记点缺失如实写入交付报告，不自造端点凑断言。
 *
 * 残留声明（按判红口径不造假清理）。
 * 零头子卷与母卷及委外染色链前置行无 DELETE 通道（route-snapshot.txt 中
 * inventory/pieces 仅有 GET 与 print，piece-split 仅有 POST），残留属已知不可回收面；
 * 坯布腿两卷在断言完成后经 POST 出库端点（路径末段 stock-out 用连字符，handler
 *    函数名才是 stock_out）全额出库转已出库，再 DELETE 软删，清理干净。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectBusinessRejection,
  genCode,
  genDyeLotNo,
  genName,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedPieceChain,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

/** DECIMAL 出参为十进制字符串，数值判据统一经 String 归一后比较。 */
const dec = (v: unknown): number => Number(String(v));

/** 按匹号等值筛选从库存细码侧取单行，取不到即显式判红，不空转。 */
async function fetchPieceByNo(page: Page, pieceNo: string, tag: string): Promise<Row> {
  const res = await apiCallRaw<{ items?: unknown }>(
    page,
    'GET',
    `/inventory/pieces?page=1&page_size=100&piece_no=${encodeURIComponent(pieceNo)}`
  );
  const rows = pickListArray<Row>(res, 'items', `${tag} 细码按匹号 ${pieceNo} 回读`);
  const hit = rows.find(r => String(r.piece_no) === pieceNo);
  if (!hit) {
    throw new Error(`[${tag}] 细码侧未命中匹号 ${pieceNo}，读写一致性链断，显式判红`);
  }
  return hit;
}

/** 断言分页信封的 items 键真实存在且为数组（信封缺键即契约违例，不用兜底掩盖）。 */
function requireItems(res: unknown, tag: string, context: string): Row[] {
  const items = (res as { items?: unknown })?.items;
  if (!Array.isArray(items)) {
    throw new Error(
      `[${tag}] ${context} 信封缺 items 数组键（PaginatedResponse 契约违例）：${JSON.stringify(res).slice(0, 160)}`
    );
  }
  return items as Row[];
}

test.describe('面料缸差登记与零头余码持久化', () => {
  test('坯布双缸建档，缸号色号追溯，改判，双单位门控，出库删除闭环', async ({ page }) => {
    const tag = 'E400GREIGE';
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const productId = ctx.productIds?.[0];
    const supplierId = ctx.supplierId;
    const warehouseId = ctx.warehouseIds?.[0];
    if (!productId || !supplierId || !warehouseId) {
      throw new Error(
        `[${tag}] 前置缺失（product=${productId} supplier=${supplierId} warehouse=${warehouseId}）`
      );
    }

    // 同一产品同一色号、分属两个缸号，即缸差的两卷事实本体。
    const lotA = genDyeLotNo();
    const lotB = genDyeLotNo();
    const lotB2 = genDyeLotNo();
    const colorNo = genCode('E400C');
    const sharedNo = genCode('E400GF');
    const fabricNoA = `${sharedNo}-A`;
    const fabricNoB = `${sharedNo}-B`;

    // 线密度 200 g/m² × 1.60 m ÷ 1000 = 0.32 kg/m，双单位取换算恰好值。
    const createBodyA = {
      fabric_no: fabricNoA,
      fabric_name: genName(`${tag}缸差坯布甲`),
      fabric_type: 'woven',
      product_id: productId,
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      color_code: colorNo,
      color_no: colorNo,
      dye_lot_no: lotA,
      gram_weight: 200,
      width_cm: 160,
      length_m: 50,
      weight_kg: 16,
      quantity_meters: 50,
      quantity_kg: 16,
    };
    const createdA = await apiCall<{ id?: number }>(
      page,
      'POST',
      '/production/greige-fabrics',
      createBodyA
    );
    const idA = createdA.data?.id;
    if (!idA) {
      throw new Error(`[${tag}] 坯布甲建档未返回 id：${JSON.stringify(createdA).slice(0, 200)}`);
    }

    const createdB = await apiCall<{ id?: number }>(page, 'POST', '/production/greige-fabrics', {
      ...createBodyA,
      fabric_no: fabricNoB,
      dye_lot_no: lotB,
      length_m: 40,
      weight_kg: 12.8,
      quantity_meters: 40,
      quantity_kg: 12.8,
    });
    const idB = createdB.data?.id;
    if (!idB) {
      throw new Error(`[${tag}] 坯布乙建档未返回 id：${JSON.stringify(createdB).slice(0, 200)}`);
    }

    // 写后必回读，缸号色号与状态逐字符相等，双单位数值逐值相等。
    const rowA = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${idA}`);
    const rowB = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${idB}`);
    expect(String(rowA.dye_lot_no), `${tag} 甲缸号落库值`).toBe(lotA);
    expect(String(rowB.dye_lot_no), `${tag} 乙缸号落库值`).toBe(lotB);
    expect(String(rowA.color_no), `${tag} 甲色号落库值`).toBe(colorNo);
    expect(String(rowB.color_no), `${tag} 乙色号落库值`).toBe(colorNo);
    expect(
      String(rowA.dye_lot_no) !== String(rowB.dye_lot_no),
      `${tag} 同品同色两卷必须按缸号可区分（缸差可追溯本体）`
    ).toBe(true);
    expect(String(rowA.status), `${tag} 甲建单缺省状态应为中文词表在库`).toBe('在库');
    expect(String(rowB.status), `${tag} 乙建单缺省状态应为中文词表在库`).toBe('在库');
    expect(typeof rowA.length_m, `${tag} DECIMAL 米数出参线格式应为字符串`).toBe('string');
    expect(dec(rowA.length_m), `${tag} 甲米数落库值`).toBe(50);
    expect(dec(rowA.weight_kg), `${tag} 甲公斤数落库值`).toBe(16);
    expect(dec(rowA.quantity_meters), `${tag} 甲累计米数落库值`).toBe(50);
    expect(dec(rowA.quantity_kg), `${tag} 甲累计公斤数落库值`).toBe(16);
    expect(dec(rowB.length_m), `${tag} 乙米数落库值`).toBe(40);
    expect(dec(rowB.weight_kg), `${tag} 乙公斤数落库值`).toBe(12.8);
    expect(Number(rowA.product_id), `${tag} 甲产品维度`).toBe(productId);
    expect(Number(rowB.product_id), `${tag} 乙产品维度`).toBe(productId);

    // 列表追溯，按共享前缀与在库状态筛选，两卷齐命中且缸号各归各。
    const listRes = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/production/greige-fabrics?page=1&page_size=100&fabric_no=${encodeURIComponent(sharedNo)}&status=${encodeURIComponent('在库')}`
    );
    const listRows = pickListArray<Row>(listRes, 'items', `${tag} 坯布列表按前缀回读`);
    const lotsInList = listRows.map(r => String(r.dye_lot_no)).sort();
    expect(lotsInList, `${tag} 列表筛后应恰为两卷各自缸号`).toEqual([lotA, lotB].sort());

    // 缸号改判，乙卷换缸重登后读回新值，追溯链跟写。
    await apiCall(page, 'PUT', `/production/greige-fabrics/${idB}`, { dye_lot_no: lotB2 });
    const rowBAfter = await apiCallRaw<Row>(page, 'GET', `/production/greige-fabrics/${idB}`);
    expect(String(rowBAfter.dye_lot_no), `${tag} 乙缸号改判后落库值`).toBe(lotB2);
    expect(String(rowBAfter.color_no), `${tag} 改判不动色号`).toBe(colorNo);

    // 双单位门控，米公斤与克重幅宽换算越界（0.5% 容差）显式拒绝且零落库。
    const badRes = await apiCallExpectFail(page, 'POST', '/production/greige-fabrics', {
      ...createBodyA,
      fabric_no: `${sharedNo}-BAD`,
      weight_kg: 30,
    });
    expect(badRes.status, `${tag} 双单位越界应 400，实际 code=${badRes.code}`).toBe(400);
    expect(badRes.code, `${tag} 双单位越界机器码`).toBe('VALIDATION_ERROR');
    const badItems = requireItems(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/production/greige-fabrics?page=1&page_size=100&fabric_no=${encodeURIComponent(`${sharedNo}-BAD`)}`
      ),
      tag,
      '越界负例复查列表'
    );
    expect(
      badItems.length,
      `${tag} 校验失败必须 fail-closed 零落库，实际命中 ${JSON.stringify(badItems).slice(0, 160)}`
    ).toBe(0);

    // 在库删除门，先删必被业务拒绝（出处 delete_greige_fabric 的在库门控）。
    const delWhileInStock = await apiCallExpectFail(
      page,
      'DELETE',
      `/production/greige-fabrics/${idA}`
    );
    expectBusinessRejection(delWhileInStock, `${tag} 在库坯布删除应被状态门拒绝`);
    expect(delWhileInStock.code, `${tag} 在库删除门机器码`).toBe('BUSINESS_ERROR');

    // 出库闭环，全额出尽后状态转已出库，米公斤归零，软删放行。
    const outA = await apiCall<{ status?: string; length_m?: unknown; weight_kg?: unknown }>(
      page,
      'POST',
      `/production/greige-fabrics/${idA}/stock-out`,
      { length_m: 50, weight_kg: 16 }
    );
    expect(String(outA.data?.status), `${tag} 甲出尽后状态应为中文词表已出库`).toBe('已出库');
    expect(dec(outA.data?.length_m), `${tag} 甲出尽后剩余米数`).toBe(0);
    expect(dec(outA.data?.weight_kg), `${tag} 甲出尽后剩余公斤数`).toBe(0);
    await apiCall(page, 'POST', `/production/greige-fabrics/${idB}/stock-out`, {
      length_m: 40,
      weight_kg: 12.8,
    });
    await apiCall(page, 'DELETE', `/production/greige-fabrics/${idA}`);
    await apiCall(page, 'DELETE', `/production/greige-fabrics/${idB}`);
    console.log(`[${tag}] 缸差建档、追溯、改判、门控、出库删除闭环全部判据通过`);
  });

  test('染色母卷拆零头，剩余米数读写守恒，细码继承缸号色号，缺录重量不洗 0', async ({ page }) => {
    const tag = 'E400REMNANT';
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    const productId = ctx.productIds?.[0];
    if (!productId) throw new Error(`[${tag}] 前置缺失，productIds 为空`);
    const warehouse = await pickDyeableWarehouse(page);
    const dyeLotNo = genDyeLotNo();
    const colorNo = genCode('E400RC');

    // 真实委外染色链产出一匹 AVAILABLE 染色母卷，种子现长 100 米（回仓不录重量）。
    const pieces = await seedDyedPieceChain(page, {
      productId,
      warehouseId: warehouse.id,
      colorNo,
      dyeLotNo,
      pieceCount: 1,
      lengthPerPieceMeters: 100,
      context: tag,
    });
    const parent = pieces[0];
    const cutBarcode = genCode('E400CUT');

    // 拆分前从细码侧取母卷基线（幅宽克重质检判定重量等继承判据的对照组）。
    const parentBefore = await fetchPieceByNo(page, parent.piece_no, tag);
    expect(dec(parentBefore.length), `${tag} 母卷拆分前细码现长应为种子 100`).toBe(100);
    expect(parentBefore.status, `${tag} 母卷拆分前状态应为大写词表 AVAILABLE`).toBe('AVAILABLE');
    expect(
      parentBefore.weight === null || parentBefore.weight === undefined,
      `${tag} 委外回仓不录实测重量，母卷拆分前重量应如实为 NULL，实际 ${String(parentBefore.weight)}`
    ).toBe(true);

    // 只提交剪裁米数，不提交剪裁重量，两栏重量在链路上都保持未补录形态。
    const split = await apiCall<{
      message?: string;
      parent_piece?: Row;
      new_piece?: Row;
    }>(page, 'POST', '/inventory/piece-split', {
      parent_piece_id: parent.id,
      cut_length: '30.00',
      new_barcode: cutBarcode,
    });
    const splitParent = split.data?.parent_piece;
    const child = split.data?.new_piece;
    if (!splitParent || !child) {
      throw new Error(
        `[${tag}] 拆分响应缺 parent_piece 或 new_piece 键：${JSON.stringify(split).slice(0, 200)}`
      );
    }

    // 拆分回显，剩余 = 现长 - 剪裁，原始 = 拆分前现长（守恒式两侧）。
    expect(typeof splitParent.length, `${tag} DECIMAL 母卷剩余米数出参应为字符串线格式`).toBe(
      'string'
    );
    expect(dec(splitParent.length), `${tag} 母卷剩余米数`).toBe(70);
    expect(dec(splitParent.original_length), `${tag} 母卷原始米数首次拆分记拆分前现长`).toBe(100);
    expect(
      splitParent.weight === null || splitParent.weight === undefined,
      `${tag} 母卷重量未补录时拆分不洗 0，应仍为 NULL，实际 ${String(splitParent.weight)}`
    ).toBe(true);
    expect(dec(child.length), `${tag} 子卷剪裁米数`).toBe(30);
    expect(
      child.weight === null || child.weight === undefined,
      `${tag} 未提交剪裁重量则子卷重量为 NULL（源码口径不猜值），实际 ${String(child.weight)}`
    ).toBe(true);
    expect(child.parent_piece_id, `${tag} 子卷回指母卷`).toEqual(parent.id);
    expect(String(child.piece_no), `${tag} 子卷匹号取传入条码`).toBe(cutBarcode);
    expect(String(child.barcode), `${tag} 子卷条码等于匹号`).toBe(cutBarcode);
    expect(
      child.status,
      `${tag} 子卷状态取大写词表 AVAILABLE（出处 models/status/purchase_inventory.rs 的 inventory_piece）`
    ).toBe('AVAILABLE');
    expect(child.piece_type, `${tag} 子卷继承母卷匹类型 dyed`).toBe('dyed');
    expect(String(child.dye_lot_no), `${tag} 子卷继承缸号`).toBe(dyeLotNo);
    expect(String(child.color_no), `${tag} 子卷继承色号`).toBe(colorNo);
    expect(String(child.batch_no), `${tag} 子卷继承批号`).toBe(dyeLotNo);
    expect(Number(child.product_id), `${tag} 子卷继承产品`).toBe(productId);
    expect(Number(child.warehouse_id), `${tag} 子卷继承仓库`).toBe(warehouse.id);
    expect(
      String(child.width ?? 'null'),
      `${tag} 子卷幅宽与母卷物理同源（母卷 NULL 则子卷 NULL，不回落标称值）`
    ).toBe(String(parentBefore.width ?? 'null'));
    expect(String(child.gram_weight ?? 'null'), `${tag} 子卷克重与母卷物理同源`).toBe(
      String(parentBefore.gram_weight ?? 'null')
    );
    expect(String(child.quality_status ?? 'null'), `${tag} 子卷质检判定继承母卷`).toBe(
      String(parentBefore.quality_status ?? 'null')
    );

    // 细码侧读回，守恒式在库侧真实行上成立，不是响应回声。
    const parentAfter = await fetchPieceByNo(page, parent.piece_no, tag);
    const childAfter = await fetchPieceByNo(page, cutBarcode, tag);
    expect(dec(parentAfter.length), `${tag} 细码侧母卷剩余米数`).toBe(70);
    expect(dec(childAfter.length), `${tag} 细码侧子卷米数`).toBe(30);
    expect(
      dec(parentAfter.length) + dec(childAfter.length),
      `${tag} 米数守恒，母卷剩余加子卷应等于拆分前现长 100`
    ).toBe(100);
    expect(
      parentAfter.weight === null || parentAfter.weight === undefined,
      `${tag} 细码侧母卷重量保持未补录，不被拆分校验洗成 0`
    ).toBe(true);
    expect(
      childAfter.weight === null || childAfter.weight === undefined,
      `${tag} 细码侧子卷重量为 NULL 而非 0`
    ).toBe(true);

    // 缸号维度追回母子两卷，追溯闭环。
    const lotRes = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/inventory/pieces?page=1&page_size=100&dye_lot_no=${encodeURIComponent(dyeLotNo)}`
    );
    const lotRows = pickListArray<Row>(lotRes, 'items', `${tag} 细码按缸号 ${dyeLotNo} 回读`);
    const nos = lotRows.map(r => String(r.piece_no)).sort();
    expect(
      nos.includes(parent.piece_no) && nos.includes(cutBarcode),
      `${tag} 缸号筛选应同时命中母卷与零头子卷，实际 ${JSON.stringify(nos)}`
    ).toBe(true);

    // 额度门，剪裁米数超母卷剩余必被业务拒绝且零新增子卷。
    const overCut = await apiCallExpectFail(page, 'POST', '/inventory/piece-split', {
      parent_piece_id: parent.id,
      cut_length: '70.5',
    });
    expectBusinessRejection(overCut, `${tag} 剪裁米数超剩余应被额度门拒绝`);
    expect(overCut.code, `${tag} 超剪裁额度门机器码`).toBe('BUSINESS_ERROR');

    // 负例后，母卷子卷面仍只有一卷零头（fail-closed 零写入侧证）。
    const finalLotRows = pickListArray<Row>(
      await apiCallRaw<{ items?: unknown }>(
        page,
        'GET',
        `/inventory/pieces?page=1&page_size=100&dye_lot_no=${encodeURIComponent(dyeLotNo)}`
      ),
      'items',
      `${tag} 负例后缸号面复查`
    );
    const children = finalLotRows.filter(r => Number(r.parent_piece_id) === parent.id);
    expect(children.length, `${tag} 负例不得新增子卷，子卷面应仍为一卷`).toBe(1);

    console.log(`[${tag}] 零头余码米数守恒与细码继承与 NULL 语义与额度门全部判据通过`);
  });
});
