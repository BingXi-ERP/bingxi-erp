import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from './helpers';
import { pickListArray } from './ui-helpers';

/**
 * 452 面料多计量换算与守恒链 首个真契约覆盖
 *
 * 功能。把 POST /convert 的「米数↔公斤数」双向换算、POST /validate 的双计量自洽校验（阈值两分支）、
 * POST /inventory/stock/fabric 面料库存入库按克重×幅宽自动折算公斤数、GET /inventory/stock/fabric
 * 入库行按批次读回的守恒与余量非负不变量，四段钉成后端字符串线格式上的真实回读链；
 * 并把「码」在本换算端点不可达、克重/幅宽非法入参被拒两道边界钉到 HTTP 与机器码。
 *
 * 调用方。Playwright 收集器按 flow 目录发现本 spec，worker 会话由 e2e/diagnose-fixture 注入登录态；
 * beforeEach 用 loginViaUI + ensureTestEntities 备好真实仓库与产品外键，随后全程走 apiCall 不导航页面。
 *
 * 入参。换算与入库的克重、幅宽、米数、公斤数一律取整数友好值（克重 200 g/m²、幅宽 150 cm、
 * 米数 100），使米↔公斤的换算落在这组参数下为无舍入歧义的精确值，断言只认后端出参本身，
 * 不在用例内重算第二套舍入去凑。
 *
 * 传给谁。请求经 apiCall 走 page.request 到后端 Axum 路由，落
 * handlers/dual_unit_converter_handler.rs 的 convert_dual_unit 与 validate_dual_unit，
 * 落 handlers/inventory_stock_handler_fabric.rs 的 create_stock_fabric 与 list_stock_fabric，
 * 换算公式唯一真源在 utils/dual_unit_converter.rs。
 *
 * 存什么。POST /inventory/stock/fabric 落 inventory_stocks 一行：提交的 quantity_meters 原样存，
 * quantity_kg 由服务端按「米数×克重×幅宽(m)÷1000」自动折算覆盖入参（本用例不传 quantity_kg），
 * gram_weight 与 width 落提交值；色号为空走白坯分支，缸号归一为 None。
 *
 * 存哪里。inventory_stocks 一行，批次号取本用例唯一 tag，并发车道互不冲突；本 spec 不删除该行
 * （删除端点 DELETE /inventory/stock 的语义属库存域主链，不在计量换算契约内，留唯一批次标记即可隔离）。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 米→公斤（meters_to_kg）：公斤 = 米 × 克重(g/m²) × (幅宽cm ÷ 100) ÷ 1000，保留三位小数。
 * 公斤→米（kg_to_meters）：米 = 公斤 × 1000 ÷ 克重 ÷ 幅宽(m)，保留两位小数。
 * 换算率（calculate_conversion_rate）：1 公斤对应米数 = 1000 ÷ (克重 × 幅宽m)，保留四位小数。
 * 自洽校验（validate_dual_unit）：以米数折出的公斤为基准，差异 ≤ 基准×误差率（默认 0.5%）判为一致。
 * 端点边界：convert 的 from_unit 只接受 meters 与 kg 两个小写词，其余（含 yards 码）走 bad_request
 * 即 400 加 BAD_REQUEST；克重≤0 与幅宽≤0 让 meters_to_kg 返回 Err，同样经 bad_request 外显原文；
 * validate 的入参经 meters_to_kg，幅宽≤0 亦 400 加 BAD_REQUEST。
 * 入库换算（create_stock_fabric）：仅当克重与幅宽同时非空才触发自动折算，否则回落提交公斤数；
 * 列表口 GET /inventory/stock/fabric 的 data 是裸数组（handler 返回 ApiResponse 包 Vec，非分页信封）。
 *
 * 未覆盖腿（如实说明，不凭空造路径）。
 * 缩率：products 无缩率列，缩率只在 fabric_physical_test_record 检测实体上，后端没有任何以缩率为
 * 入参的计量换算端点，meterage↔kg/yard 换算只吃克重×幅宽，故守恒链不含缩率腿。
 * 码↔米：yards_to_meters 只作为报价/订单「码」视图的内部换算率，未对外暴露独立换算端点，
 * convert 端点显式拒绝 yards，本 spec 只能钉出「码在本换算端点不可达」这一契约边界，无法端到端验码数落库守恒。
 * 出库多单位录入：POST /sales/orders/:id/deliveries 的入参 DTO 只有 warehouse_id，不接受逐行按米/码/公斤录入，
 * 「一条按米一条按码一条按公斤」的出库面在该端点不存在；发货对库存的扣减与取消发货的恢复属 SalesService
 * 出库规划内部语义，未在取证预算内逐列核实，不在本 spec 臆断。
 *
 * 假绿防线。换算守恒一律以固定无歧义参数断后端出参本身，不自造舍入；自洽校验钉阈值内与阈值外两条独立分支；
 * 入库换算既断建单出参 quantity_kg，又按唯一批次从列表口读回再断一次，证明真实落库；
 * 边界一律钉 HTTP 400 与机器码 BAD_REQUEST 并外显拒绝原文；
 * 全程不用 ?? 或 || 兜底，后端必出的键缺失即形漂判红；前置不成立当场抛错点名步骤。
 */

type Row = Record<string, unknown>;

interface ConvertResp {
  converted_value: string | number;
  to_unit: string;
  formula: string;
  conversion_rate: string | number;
}

interface ValidateResp {
  is_valid: boolean;
  calculated_kg: string | number;
  difference: string | number;
  allowed_difference: string | number;
  error_rate: string;
}

interface StockFabricRow {
  id: number;
  warehouse_id: number;
  product_id: number;
  batch_no: string;
  color_no: string;
  dye_lot_no: string | null;
  grade: string;
  quantity_on_hand: string | number;
  quantity_available: string | number;
  quantity_reserved: string | number;
  quantity_meters: string | number;
  quantity_kg: string | number;
  gram_weight: string | number | null;
  width: string | number | null;
}

const toNum = (v: unknown): number => Number(String(v));
const str = (v: unknown): string => String(v);

// 本链唯一的换算基准参数：克重 200 g/m²、幅宽 150 cm(=1.5 m) ⇒ 每米 0.3 kg、每公斤 3.3333 米。
// 米数 100 折公斤恰为 30.000（三位无舍入），公斤数 30 回米数恰为 100.00（两位无舍入），
// 换算率 1000÷(200×1.5)=3.3333（四位），三者都是精确值，可直接钉后端线格式出参。
const GRAM = 200;
const WIDTH_CM = 150;
const METERS = 100;
const KG = 30;

test.describe.serial('452 多计量换算与缩率守恒链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('452-01 米↔公斤 双向换算守恒 换算率与自洽校验阈值内外两分支 参数与单位边界被拒', async ({
    page,
  }) => {
    // 1) 米→公斤 主链（converted_value 必须精确等于 30，三位无舍入）
    const mToKg = await apiCallRaw<ConvertResp>(page, 'POST', '/convert', {
      value: METERS,
      from_unit: 'meters',
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(str(mToKg.to_unit), '米入参换算的目标单位必须是 kg').toBe('kg');
    expect(
      toNum(mToKg.converted_value),
      `100 米在克重 200 幅宽 150 下必须折成 30 公斤，实际 ${str(mToKg.converted_value)}`
    ).toBe(KG);
    expect(
      toNum(mToKg.conversion_rate),
      `换算率(每公斤米数)必须为 3.3333，实际 ${str(mToKg.conversion_rate)}`
    ).toBeCloseTo(3.3333, 4);

    // 2) 公斤→米 反向腿（回读米数必须精确 100，证明双向换算闭合）
    const kgToM = await apiCallRaw<ConvertResp>(page, 'POST', '/convert', {
      value: KG,
      from_unit: 'kg',
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(str(kgToM.to_unit), '公斤入参换算的目标单位必须是 meters').toBe('meters');
    expect(
      toNum(kgToM.converted_value),
      `30 公斤在同参数下必须回折成 100 米，实际 ${str(kgToM.converted_value)}`
    ).toBe(METERS);

    // 3) 往返守恒：米→公斤→米 的米数差为 0
    const roundTripDelta = Math.abs(toNum(kgToM.converted_value) - METERS);
    expect(roundTripDelta, '米↔公斤 往返换算的米数差必须为 0').toBe(0);

    // 4) 自洽校验阈值内（差异 0.05 ≤ 允许 30×0.005=0.15）判为一致
    const within = await apiCallRaw<ValidateResp>(page, 'POST', '/validate', {
      quantity_meters: METERS,
      quantity_kg: 30.05,
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(within.is_valid === true, `0.5% 阈值内必须判一致，实际 ${JSON.stringify(within)}`).toBe(
      true
    );
    expect(
      toNum(within.calculated_kg),
      `基准公斤必须由米数折出 30，实际 ${str(within.calculated_kg)}`
    ).toBe(KG);
    expect(toNum(within.difference), `差异必须为 0.05，实际 ${str(within.difference)}`).toBeCloseTo(
      0.05,
      6
    );
    expect(
      toNum(within.allowed_difference),
      `允许差异必须为 30×0.005=0.15，实际 ${str(within.allowed_difference)}`
    ).toBeCloseTo(0.15, 6);

    // 5) 自洽校验阈值外（差异 1 > 0.15）判为不一致，仍返回基准与差异明细
    const beyond = await apiCallRaw<ValidateResp>(page, 'POST', '/validate', {
      quantity_meters: METERS,
      quantity_kg: 31,
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(
      beyond.is_valid === false,
      `超 0.5% 阈值必须判不一致，实际 ${JSON.stringify(beyond)}`
    ).toBe(false);
    expect(
      toNum(beyond.difference),
      `阈值外差异必须为 1，实际 ${str(beyond.difference)}`
    ).toBeCloseTo(1, 6);

    // 6) 边界 码单位在本换算端点不可达：from_unit=yards 走 bad_request 400 加 BAD_REQUEST
    const yardReject = await apiCallExpectFail(page, 'POST', '/convert', {
      value: 100,
      from_unit: 'yards',
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(yardReject.status, `码换算在本端点必须 400，实际 ${yardReject.status}`).toBe(400);
    expect(failureCode(yardReject)).toBe(APP_ERROR_CODES.BAD_REQUEST);
    expect(
      str(yardReject.message).includes('无效的单位'),
      `码拒绝必须外显单位原文，实际 ${str(yardReject.message)}`
    ).toBe(true);

    // 7) 边界 克重非正：meters_to_kg 返回 Err 经 bad_request 外显
    const badGram = await apiCallExpectFail(page, 'POST', '/convert', {
      value: METERS,
      from_unit: 'meters',
      gram_weight: 0,
      width_cm: WIDTH_CM,
    });
    expect(badGram.status, `克重为 0 必须 400，实际 ${badGram.status}`).toBe(400);
    expect(failureCode(badGram)).toBe(APP_ERROR_CODES.BAD_REQUEST);
    expect(
      str(badGram.message).includes('克重必须大于 0'),
      `克重非法必须外显真实拒绝文案，实际 ${str(badGram.message)}`
    ).toBe(true);

    // 8) 边界 幅宽非正走自洽校验入参：validate 内部 meters_to_kg Err 经 bad_request
    const badWidth = await apiCallExpectFail(page, 'POST', '/validate', {
      quantity_meters: METERS,
      quantity_kg: KG,
      gram_weight: GRAM,
      width_cm: 0,
    });
    expect(badWidth.status, `幅宽为 0 的自洽校验必须 400，实际 ${badWidth.status}`).toBe(400);
    expect(failureCode(badWidth)).toBe(APP_ERROR_CODES.BAD_REQUEST);
    console.log('[452-01] 米↔公斤 双向换算守恒 + 阈值内外 + 单位/参数边界 全部回读通过');
  });

  test('452-02 面料库存入库按克重幅宽自动折算公斤 建单出参与列表读回双向守恒 余量非负不变量', async ({
    page,
  }) => {
    const ctx = getCtx();
    const warehouseId = ctx.warehouseIds[0];
    const productId = ctx.productIds[0];
    if (warehouseId === undefined || productId === undefined) {
      throw new Error(
        `452-02 前置不成立：夹具仓库或产品缺失 warehouseId=${String(warehouseId)} productId=${String(
          productId
        )}`
      );
    }
    // 唯一批次号：白坯分支（色号留空 ⇒ 服务端缸号归一 None），隔离并发车道且便于按批次读回
    const batchNo = genCode('452B');

    // 1) 入库建单（不传 quantity_kg，让服务端按米×克重×幅宽(m)÷1000 自动折算）
    const created = await apiCallRaw<StockFabricRow>(page, 'POST', '/inventory/stock/fabric', {
      warehouse_id: warehouseId,
      product_id: productId,
      batch_no: batchNo,
      grade: '一等品',
      quantity_meters: METERS,
      gram_weight: GRAM,
      width: WIDTH_CM,
    });
    const stockId = Number(created.id);
    expect(
      Number.isInteger(stockId) && stockId > 0,
      `入库必须返回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);
    expect(str(created.batch_no), '入库出参批次号必须回显提交值').toBe(batchNo);
    expect(
      toNum(created.quantity_meters),
      `主计量米数必须原样落 100，实际 ${str(created.quantity_meters)}`
    ).toBe(METERS);
    expect(
      toNum(created.quantity_kg),
      `辅计量公斤必须由服务端按公式折出 30，实际 ${str(created.quantity_kg)}`
    ).toBe(KG);
    expect(toNum(created.gram_weight), '克重必须回显提交值 200').toBe(GRAM);
    expect(toNum(created.width), '幅宽必须回显提交值 150').toBe(WIDTH_CM);
    expect(
      created.color_no === '',
      `白坯入库色号必须归一为空串，实际 ${String(created.color_no)}`
    ).toBe(true);
    expect(
      created.dye_lot_no === null,
      `白坯入库缸号必须归一为 null（否则永久提不出），实际 ${String(created.dye_lot_no)}`
    ).toBe(true);

    // 2) 余量非负不变量（在库口径三列都不得为负）
    expect(
      toNum(created.quantity_on_hand) >= 0,
      `在库量不得为负，实际 ${str(created.quantity_on_hand)}`
    ).toBe(true);
    expect(
      toNum(created.quantity_available) >= 0,
      `可用量不得为负，实际 ${str(created.quantity_available)}`
    ).toBe(true);
    expect(
      toNum(created.quantity_reserved) >= 0,
      `预留量不得为负，实际 ${str(created.quantity_reserved)}`
    ).toBe(true);

    // 3) 列表口按唯一批次读回，证明跨单位守恒真实落库（裸数组形状）
    const listedRaw = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock/fabric?batch_no=${encodeURIComponent(batchNo)}&product_id=${productId}`
    );
    const rows = pickListArray<StockFabricRow>(
      listedRaw,
      'bare',
      `452-02 面料库存列表 /inventory/stock/fabric 批次 ${batchNo}`
    );
    const hit = rows.find(r => str(r.batch_no) === batchNo);
    if (hit === undefined) {
      throw new Error(`452-02 前置不成立：按批次 ${batchNo} 未能从列表口读回入库行`);
    }
    expect(Number(hit.id), '列表读回行主键必须等于建单主键').toBe(stockId);
    expect(
      toNum(hit.quantity_meters),
      `落库米数必须守恒为 100，实际 ${str(hit.quantity_meters)}`
    ).toBe(METERS);
    expect(
      toNum(hit.quantity_kg),
      `落库公斤必须由米数×克重×幅宽守恒为 30，实际 ${str(hit.quantity_kg)}`
    ).toBe(KG);
    // 跨单位合计回主单位守恒：读回的米数按同参数折公斤，与读回的公斤数零漂移
    const metersToKgFromRow = (toNum(hit.quantity_meters) * GRAM * (WIDTH_CM / 100)) / 1000;
    expect(
      Math.abs(metersToKgFromRow - toNum(hit.quantity_kg)),
      '按主计量米数折公斤与落库辅计量的差必须为 0'
    ).toBe(0);
    console.log(`[452-02] 面料库存入库换算守恒通过 id=${stockId} batch=${batchNo}`);
  });
});
