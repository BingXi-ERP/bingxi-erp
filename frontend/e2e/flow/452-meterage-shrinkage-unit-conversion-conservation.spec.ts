import { test, expect } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  pickDyeableWarehouse,
  readDyedPieceByNo,
  seedDyedOutboundBundle,
  seedGreigeStockIn,
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
 * 端点边界：convert 的 from_unit 只接受 meters 与 kg 两个小写词，其余（含 yards 码）走
 * validation_displayable 即 400 加 VALIDATION_ERROR 并外显「无效的单位，必须是 'meters' 或 'kg'」；
 * 克重≤0 与幅宽≤0 让 meters_to_kg 返回 Err，同样经 validation_displayable 外显真实原因；
 * validate 的入参经 validate_dual_unit，幅宽≤0 亦 400 加 VALIDATION_ERROR。
 * 入库换算（create_stock_fabric）：仅当克重与幅宽同时非空才触发自动折算，否则回落提交公斤数；
 * 列表口 GET /inventory/stock/fabric 的 data 是裸数组（handler 返回 ApiResponse 包 Vec，非分页信封）。
 *
 * 未覆盖腿（如实说明，不凭空造路径）。
 * 缩率：products 无缩率列，缩率只在 fabric_physical_test_record 检测实体上，后端没有任何以缩率为
 * 入参的计量换算端点，meterage↔kg/yard 换算只吃克重×幅宽，故守恒链不含缩率腿。
 * 码↔米：POST /convert 只接受 meters 与 kg 两个小写词，yards 被 400 拒；码→米只发生在报价转订单
 * （services/quotation_convert_service.rs 的 resolve_unit_conversion 命中 UnitStrategy::Yards 后调
 * utils/dual_unit_converter.rs 的 yards_to_meters），且报价行 unit 必须逐字符等于产品交易单位，
 * 故「出库数量直接以码录入」在出库端点面上没有入参字段可承载，不在本 spec 臆造该腿。
 * 出库单位入参：POST /sales/orders/:id/ship 的行入参是 quantity 加批次/色号/缸号/匹号四维
 * （services/so/delivery.rs 的 ShipOrderItemRequest），无单位字段，quantity 即主单位米；
 * POST /sales/orders/:id/deliveries 的 DTO 只有 warehouse_id（handlers/sales_order_handler.rs 的
 * CreateDeliveryDto），更无逐行计量入参。所以出库腿按「细码（匹号）录入 + 主单位米逐位守恒 +
 * 零头余码扣减后单独可查」钉，见 452-03；撤销发货的计量与余码恢复见 452-05。
 *
 * 假绿防线。换算守恒一律以固定无歧义参数断后端出参本身，不自造舍入；自洽校验钉阈值内与阈值外两条独立分支；
 * 入库换算既断建单出参 quantity_kg，又按唯一批次从列表口读回再断一次，证明真实落库；
 * 边界一律钉 HTTP 400 与机器码 VALIDATION_ERROR 并外显真实拒绝原因；
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

/**
 * 十进制线格式比对工具（452-03/04/05 的守恒断言专用）。
 * 职责：把后端 DECIMAL 出参（serde 无 float 开关 ⇒ 序列化成十进制字符串）按字符串精确对齐后比较，
 * 只做「去尾零 / 补零」这类无损归一，绝不舍入——舍入会把守恒差抹平成假绿。
 * 入参：后端出参值或本用例提交的量值字符串；传给谁：sameDec / sameDecDiff / sameDecSum 的断言消息。
 * 存什么：不持久化，纯函数。线格式不合（非纯数字）直接点名抛错，不返回默认值掩盖。
 */
function decKey(v: unknown, label: string): string {
  const s = String(v);
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`${label}：后端十进制出参不是纯数字线格式，实际 ${s}`);
  }
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

function decFracLen(v: unknown, label: string): number {
  const parts = decKey(v, label).split('.');
  return parts.length === 2 ? parts[1].length : 0;
}

function decScaled(v: unknown, label: string, scale: number): bigint {
  const parts = decKey(v, label).split('.');
  const frac = parts.length === 2 ? parts[1] : '';
  if (frac.length > scale) {
    throw new Error(`${label}：小数位 ${frac.length} 超出对齐刻度 ${scale}，拒绝截断凑数`);
  }
  return BigInt(`${parts[0]}${frac.padEnd(scale, '0')}`);
}

function decMaxScale(items: Array<{ v: unknown; label: string }>): number {
  return items.reduce((acc, it) => Math.max(acc, decFracLen(it.v, it.label)), 0);
}

/** 把对齐刻度整数还原为十进制串：只补零与插小数点，不做任何舍入 */
function decFromScaled(units: bigint, scale: number): string {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const body =
    scale === 0
      ? digits
      : `${digits.slice(0, digits.length - scale)}.${digits.slice(digits.length - scale)}`;
  return negative ? `-${body}` : body;
}

/** 两个后端出参逐位相等（同一刻度下整数差为 0） */
function sameDec(a: unknown, b: unknown, label: string): void {
  const scale = decMaxScale([
    { v: a, label: `${label}[左]` },
    { v: b, label: `${label}[右]` },
  ]);
  expect(
    decScaled(a, `${label}[左]`, scale),
    `${label}：左=${String(a)} 右=${String(b)} 的差必须为 0`
  ).toBe(decScaled(b, `${label}[右]`, scale));
}

/** a − b 逐位等于 c：三段全取后端出参，用例内不自造期望值 */
function sameDecDiff(a: unknown, b: unknown, c: unknown, label: string): void {
  const scale = decMaxScale([
    { v: a, label: `${label}[被减]` },
    { v: b, label: `${label}[减数]` },
    { v: c, label: `${label}[差]` },
  ]);
  expect(
    decScaled(a, `${label}[被减]`, scale) - decScaled(b, `${label}[减数]`, scale),
    `${label}：${String(a)} − ${String(b)} 必须逐位等于 ${String(c)}`
  ).toBe(decScaled(c, `${label}[差]`, scale));
}

/** 两组后端出参各自补零对齐求和后逐位相等（跨环节合计守恒） */
function sameDecSum(left: string[], right: string[], label: string): void {
  const scale = decMaxScale([
    ...left.map(v => ({ v, label: `${label}[左成员]` })),
    ...right.map(v => ({ v, label: `${label}[右成员]` })),
  ]);
  const sumOf = (vals: string[]): bigint =>
    vals.reduce<bigint>((acc, v) => acc + decScaled(v, `${label}[成员]`, scale), 0n);
  expect(
    sumOf(left),
    `${label}：合计差必须为 0 左=${JSON.stringify(left)} 右=${JSON.stringify(right)}`
  ).toBe(sumOf(right));
}

/** 必出键读取：缺键或非数字出参当场点名，不用 ?? 或 || 把缺键洗成合法值 */
function decField(row: Row, key: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(
      `${label}：后端出参缺键 ${key}（该列是实体必出字段），实际 ${JSON.stringify(row).slice(0, 400)}`
    );
  }
  return decKey(row[key], `${label}.${key}`);
}

/** 按产品取订单明细行：缺 items 键或缺行都点名（不兜底空对象） */
function orderLineOf(detail: Row, productId: number, label: string): Row {
  if (!Object.prototype.hasOwnProperty.call(detail, 'items')) {
    throw new Error(
      `${label}：订单详情出参缺 items 键，实际 ${JSON.stringify(detail).slice(0, 400)}`
    );
  }
  const lines = detail.items as Row[];
  const hit = lines.find(l => Number(l.product_id) === productId);
  if (hit === undefined) {
    throw new Error(
      `${label}：订单明细没有产品 ${productId} 的行，实际 ${JSON.stringify(lines).slice(0, 400)}`
    );
  }
  return hit;
}

/**
 * 建单→提交→审批三段。行级 quantity_tolerance_pct 显式写 0：允许上下界等于行数量，
 * 杜绝产品交易单位默认容差（utils/delivery_tolerance.rs resolve_tolerance_pct 按 unit 取值）
 * 给守恒断言引入区间不确定性。出参键与状态词按 handlers/sales_order_handler.rs 与
 * models/status/sales_order.rs 的写入方口径消费（审批回读小写 approved）。
 */
async function seedApprovedOrderFor(
  page: import('@playwright/test').Page,
  productId: number,
  quantity: string,
  tag: string
): Promise<{ id: number; order_no: string }> {
  const ctx = getCtx();
  if (!ctx.customerId) {
    throw new Error(`${tag} 前置不成立：ctx.customerId 未就绪（销售订单必填客户外键）`);
  }
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: productId,
        quantity,
        unit_price: '37.50',
        tax_percent: '13',
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E2E-${tag}-${genCode('SO')}`,
  });
  const id = Number(created.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(
      `${tag} 前置不成立：建销售订单未返回主键，实际 ${JSON.stringify(created).slice(0, 400)}`
    );
  }
  await apiCall(page, 'POST', `/sales/orders/${id}/submit`);
  await apiCall(page, 'POST', `/sales/orders/${id}/approve`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  expect(String(detail.status), `${tag} 审批回读状态词（写入方小写）`).toBe('approved');
  return { id, order_no: String(detail.order_no) };
}

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
    expect(within.is_valid, `0.5% 阈值内必须判一致，实际 ${JSON.stringify(within)}`).toBe(true);
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
    // 判据对象就是出参布尔本身：is_valid 为 false 即"超阈值判不一致"成立，
    // 不再在断言里二次求值（那会把期望值写成表达式取反后的形状）。
    expect(beyond.is_valid, `超 0.5% 阈值必须判不一致，实际 ${JSON.stringify(beyond)}`).toBe(false);
    expect(
      toNum(beyond.difference),
      `阈值外差异必须为 1，实际 ${str(beyond.difference)}`
    ).toBeCloseTo(1, 6);

    // 6) 边界 码单位在本换算端点不可达：from_unit=yards 走 validation_displayable 400 加 VALIDATION_ERROR
    const yardReject = await apiCallExpectFail(page, 'POST', '/convert', {
      value: 100,
      from_unit: 'yards',
      gram_weight: GRAM,
      width_cm: WIDTH_CM,
    });
    expect(yardReject.status, `码换算在本端点必须 400，实际 ${yardReject.status}`).toBe(400);
    expect(failureCode(yardReject)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      str(yardReject.message).includes('无效的单位'),
      `码拒绝必须外显单位原文，实际 ${str(yardReject.message)}`
    ).toBe(true);

    // 7) 边界 克重非正：meters_to_kg 返回 Err 经参数校验外显真实原因
    const badGram = await apiCallExpectFail(page, 'POST', '/convert', {
      value: METERS,
      from_unit: 'meters',
      gram_weight: 0,
      width_cm: WIDTH_CM,
    });
    expect(badGram.status, `克重为 0 必须 400，实际 ${badGram.status}`).toBe(400);
    expect(failureCode(badGram)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      str(badGram.message).includes('克重必须大于 0'),
      `克重非法必须外显真实拒绝文案，实际 ${str(badGram.message)}`
    ).toBe(true);

    // 8) 边界 幅宽非正走自洽校验入参：validate_dual_unit 自身返回 Err 经 validation_displayable
    const badWidth = await apiCallExpectFail(page, 'POST', '/validate', {
      quantity_meters: METERS,
      quantity_kg: KG,
      gram_weight: GRAM,
      width_cm: 0,
    });
    expect(badWidth.status, `幅宽为 0 的自洽校验必须 400，实际 ${badWidth.status}`).toBe(400);
    expect(failureCode(badWidth)).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
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

  /**
   * 452-03 出库按细码（匹号）录入并扣减：主单位米与订单行逐位一致，零头余码扣减后单独可查。
   *
   * 链与端点（逐条经 route-snapshot 在册核对，只写在册方法+路径）。
   * POST /inventory/piece-split（split_fabric_piece）剪出零头子卷；
   * POST /sales/orders（create_order）+ /submit + /approve 备出库源单；
   * POST /sales/orders/{id}/ship（ship_order）按四维（批次/色号/缸号/匹号）出库母卷整匹；
   * GET /inventory/stock/transactions（list_transactions）回读 SALES_DELIVERY 流水；
   * GET /inventory/stock（list_stock）回读四维库存行；
   * GET /inventory/pieces（list_pieces 经 readDyedPieceByNo）按匹号分别回读母卷与零头子卷。
   *
   * 契约真相。SplitPieceRequest 字段 parent_piece_id/cut_length/cut_weight/new_barcode，
   * 出参 SplitPieceResponse{message,parent_piece,new_piece} 是 inventory_piece 整行；
   * 母卷 length 被写成 remaining，original_length 首次拆分记为拆前全长，
   * 服务端 validate_split_consistency 恒等式「母卷剩余 + Σ子卷 = 原始长度」不满足即 400；
   * cut_weight 留 null ⇒ 母卷实测重量保持原值（服务端不猜、不塞 0）。
   * 出库量语义：ShipOrderItemRequest 的 quantity 即主单位米（无单位字段），
   * 流水行 quantity_before_meters − quantity_after_meters = quantity_meters，
   * 订单行 shipped_quantity 由 update_order_item_shipped_qty 逐行按 id 升序分配回写。
   * 词表：匹状态大写（AVAILABLE/SHIPPED，models/status/purchase_inventory.rs::inventory_piece）。
   *
   * 假绿防线。零头剪裁量与出库量都取后端回读值（母卷实测长度、拆分出参长度），不在用例内重算；
   * 母卷出库后必须离开可用态、零头子卷必须仍按自身匹号单独查得到且长度逐位不变；
   * 库存行扣后量与流水扣后量、订单行已发量与出库录入量两两逐位对照。
   */
  test('452-03 出库按细码（匹号）录入并扣减：主单位米与订单行逐位一致，零头余码扣减后单独可查', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) {
      throw new Error('452-03 前置不成立：夹具产品缺失 productIds[0]=undefined');
    }
    const target = await pickDyeableWarehouse(page);
    // 真实委外染色链产 AVAILABLE 染色匹 + 同维（batch_no = 缸号）库存行，不造假匹
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: target.id,
      quantityMeters: '100',
      pieceCount: 1,
      context: '452-03',
    });
    const parent = bundle.pieces[0];
    if (parent === undefined) {
      throw new Error(
        `452-03 前置不成立：委外染色链未产出可出库染色匹 缸号=${bundle.dyeLotNo} 匹数=${String(bundle.pieces.length)}`
      );
    }
    const dims = {
      productId,
      warehouseId: target.id,
      dyeLotNo: bundle.dyeLotNo,
      batchNo: bundle.dyeLotNo,
    };
    // 零头剪裁量必须严格小于母卷实测长度（服务端额度门，相等即母卷留空壳）
    const cutLength = '10';
    const cutScale = decMaxScale([
      { v: parent.length, label: '452-03 母卷实测长度' },
      { v: cutLength, label: '452-03 零头剪裁量' },
    ]);
    if (
      decScaled(parent.length, '452-03 母卷实测长度', cutScale) <=
      decScaled(cutLength, '452-03 零头剪裁量', cutScale)
    ) {
      throw new Error(
        `452-03 前置不成立：母卷实测长度 ${String(parent.length)} 不足以剪出 ${cutLength} 米零头`
      );
    }

    // 1) 剪出零头子卷（POST /inventory/piece-split，cut_weight/new_barcode 传 null 让服务端保持原值/自生成匹号）
    const split = await apiCallRaw<{ message: string; parent_piece: Row; new_piece: Row }>(
      page,
      'POST',
      '/inventory/piece-split',
      {
        parent_piece_id: parent.id,
        cut_length: cutLength,
        cut_weight: null,
        new_barcode: null,
      }
    );
    const child = split.new_piece;
    const parentAfter = split.parent_piece;
    const childId = Number(child.id);
    if (!Number.isInteger(childId) || childId <= 0) {
      throw new Error(
        `452-03 前置不成立：零头子卷未返回主键，实际 ${JSON.stringify(child).slice(0, 400)}`
      );
    }
    const childPieceNo = String(child.piece_no);
    const parentPieceNo = String(parent.piece_no);
    // 拆匹长度守恒：母卷拆前 − 母卷拆后 = 子卷长度（三个值全是后端出参）
    sameDecDiff(parent.length, parentAfter.length, child.length, '452-03 拆匹长度守恒');
    // 服务端把拆前全长记进 original_length（首次拆分），拆前读数即该原值
    sameDec(
      decField(parentAfter, 'original_length', '452-03 母卷原始长度回记'),
      parent.length,
      '452-03 母卷原始长度回记 vs 拆前实测长度'
    );
    expect(String(parentAfter.status), '剪裁不改母卷状态词').toBe(String(parent.status));

    // 2) 备出库源单：行数量 = 母卷拆后实测长度（后端出参），行级容差 0
    const shipQty = decField(parentAfter, 'length', '452-03 母卷拆后长度');
    const order = await seedApprovedOrderFor(page, productId, shipQty, '452-03');

    // 3) 出库前按匹号回读零头子卷（证明零头已在册、可单独查到）
    const childBeforeShip = await readDyedPieceByNo(page, { ...dims, pieceNo: childPieceNo });
    if (childBeforeShip === null) {
      throw new Error(`452-03 前置不成立：零头子卷 ${childPieceNo} 拆出后按匹号查不到`);
    }

    // 4) 出库母卷整匹（POST /sales/orders/{id}/ship，四维齐传）
    await apiCall(page, 'POST', `/sales/orders/${order.id}/ship`, {
      order_id: order.id,
      warehouse_code: target.code,
      items: [
        {
          product_id: productId,
          quantity: shipQty,
          batch_no: bundle.dyeLotNo,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          piece_no: parentPieceNo,
        },
      ],
      remarks: `E2E 452-03 母卷整匹出库 ${parentPieceNo}`,
    });

    // 5) 订单行回读：已发量逐位等于出库录入量
    const afterDetail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    const afterLine = orderLineOf(afterDetail, productId, '452-03 出库后订单行');
    sameDec(
      decField(afterLine, 'shipped_quantity', '452-03 出库后订单行已发量'),
      shipQty,
      '452-03 订单行已发量 vs 出库录入量'
    );

    // 6) 库存流水回读：出库量 = 录入量，且 扣前 − 扣后 = 出库量（全为后端出参）
    const txnRaw = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}&batch_no=${encodeURIComponent(bundle.dyeLotNo)}&transaction_type=SALES_DELIVERY&page=1&page_size=100`
    );
    const txnAll = pickListArray<Row>(
      txnRaw,
      'items',
      `452-03 出库库存流水 /inventory/stock/transactions 批次 ${bundle.dyeLotNo}`
    );
    const txns = txnAll.filter(r => String(r.source_bill_no) === order.order_no);
    expect(
      txns.length,
      `出库流水必须恰 1 行（多行即重复扣减），实际 ${JSON.stringify(txnAll).slice(0, 400)}`
    ).toBe(1);
    const txn = txns[0];
    const txnQty = decField(txn, 'quantity_meters', '452-03 出库流水主单位量');
    sameDec(txnQty, shipQty, '452-03 流水出库量 vs 出库录入量');
    sameDecDiff(
      decField(txn, 'quantity_before_meters', '452-03 流水扣前量'),
      decField(txn, 'quantity_after_meters', '452-03 流水扣后量'),
      txnQty,
      '452-03 流水前后差 vs 出库量'
    );

    // 7) 四维库存行回读：扣后量 = 流水扣后量，扣前量 = 出库前行读数（账实同一刻度零差）
    const stockRaw = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock?product_id=${productId}&warehouse_id=${target.id}&color_no=${encodeURIComponent(bundle.colorNo)}&dye_lot_no=${encodeURIComponent(bundle.dyeLotNo)}&batch_no=${encodeURIComponent(bundle.dyeLotNo)}&page=1&page_size=20`
    );
    const stockRow = pickListArray<Row>(
      stockRaw,
      'items',
      `452-03 出库后四维库存行 /inventory/stock 缸号 ${bundle.dyeLotNo}`
    ).find(
      r =>
        String(r.color_no) === bundle.colorNo &&
        String(r.dye_lot_no) === bundle.dyeLotNo &&
        String(r.batch_no) === bundle.dyeLotNo
    );
    if (stockRow === undefined) {
      throw new Error('452-03 前置不成立：出库后按四维读不到库存行');
    }
    // 口径（以写入方为准）：出库扣减只写库存行 quantity_available 并累计 quantity_shipped
    // （services/so/delivery_ops/inventory.rs 的 reduce_inventory_four_dim），
    // 流水行的 quantity_before_meters/quantity_after_meters 由同一笔扣减的扣前/扣后**可用量**
    // 落库（StockReduction 三字段，services/so/delivery_ops/ship.rs 写 inventory_transactions）；
    // models/inventory_stock.rs 的 quantity_meters 是入库时记的主计量总米数，出库与撤销均不写该列。
    // 因此账实守恒只能拿被扣的同一列 quantity_available 与流水前后对照，
    // 用 quantity_meters 比流水扣后量属于两个口径相减（左恒为入库总量、右为扣后余量）。
    sameDec(
      decField(stockRow, 'quantity_available', '452-03 库存行扣后可用量'),
      decField(txn, 'quantity_after_meters', '452-03 流水扣后量'),
      '452-03 库存行扣后可用量 vs 流水扣后量'
    );
    sameDec(
      decField(bundle.stockRow, 'quantity_available', '452-03 出库前库存行可用量'),
      decField(txn, 'quantity_before_meters', '452-03 流水扣前量'),
      '452-03 出库前库存行可用量 vs 流水扣前量'
    );

    // 8) 母卷出库后离开可用态；零头余码仍可单独查到且长度逐位不变
    const parentAfterShip = await readDyedPieceByNo(page, { ...dims, pieceNo: parentPieceNo });
    if (parentAfterShip === null) {
      throw new Error(`452-03 前置不成立：出库后按匹号 ${parentPieceNo} 读不到母卷行`);
    }
    expect(
      String(parentAfterShip.status),
      '母卷整匹出库后状态词必须是发货态（词表大写，写入方 models/status/purchase_inventory.rs::inventory_piece）'
    ).toBe('SHIPPED');
    const childAfterShip = await readDyedPieceByNo(page, { ...dims, pieceNo: childPieceNo });
    if (childAfterShip === null) {
      throw new Error(`452-03 零头余码 ${childPieceNo} 在母卷出库扣减后必须仍能单独查到`);
    }
    expect(String(childAfterShip.status), '零头子卷未被出库，状态词保持可用态').toBe('AVAILABLE');
    sameDec(
      childAfterShip.length,
      decField(child, 'length', '452-03 零头子卷拆分出参长度'),
      '452-03 零头余码长度在母卷扣减后逐位不变'
    );
    console.log(
      `[452-03] 按匹出库与零头余码守恒通过 订单=${order.order_no} 母卷=${parentPieceNo} 零头=${childPieceNo} 出库量=${shipQty}`
    );
  });

  /**
   * 452-04 跨环节总量守恒：报价明细（按米）→ 销售订单 → 出库，三段各自回读后折回主单位合计分差为 0。
   *
   * 链与端点（逐条在册）。POST /quotations（create_quotation）+ /submit + /approve
   * + POST /quotations/{id}/convert（convert_to_sales_order）；
   * GET /quotations/{id}（get_quotation）与 GET /sales/orders/{id}（get_order）分别回读两段明细；
   * POST /sales/orders/{id}/ship（ship_order）出库；
   * GET /inventory/stock/transactions（list_transactions）回读第三段；
   * 出库可扣库存由 POST /inventory/stock（seedGreigeStockIn 白坯腿）备齐。
   *
   * 契约真相。报价行 unit 必须逐字符等于产品交易单位（validate_item_units_against_products），
   * 转订单按 UnitStrategy 换算：单位「米」⇒ 订单行 quantity_meters 即报价行 quantity 原值，
   * quantity_kg 由 meters_to_kg(克重×幅宽) 折出，产品缺克重或幅宽即 VALIDATION 拒绝（不兜底 0）；
   * 出库流水 quantity_meters 是被扣库存行的实际米数（跨缸回退时如实记实际缸号）。
   * 三段合计一律用补零对齐的整数求和比较，用例内不出现任何舍入调用。
   *
   * 假绿防线。合计期望值全部来自三段后端出参本身（报价行 quantity、订单行 quantity_meters、
   * 流水行 quantity_meters），不做「先算一遍再比」的自证；夹具产品单位不是「米」或缺换算元数据
   * 时按前置不成立点名抛错，绝不静默跳过该段。
   */
  test('452-04 跨环节总量守恒：报价明细按米→销售订单→出库，三段折回主单位合计分差为 0', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.quotationProductId;
    if (productId === undefined) {
      throw new Error(
        '452-04 前置不成立：ctx.quotationProductId 未就绪（报价行必须引用单位已知的自建产品）'
      );
    }
    if (ctx.quotationProductUnit !== '米') {
      throw new Error(
        `452-04 前置不成立：夹具报价产品交易单位为「${ctx.quotationProductUnit}」而非「米」，按米录入的跨环节合计链不可达`
      );
    }
    const prod = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
    const gram = prod.gram_weight;
    const widthMeta = prod.width;
    if (gram === undefined || gram === null || widthMeta === undefined || widthMeta === null) {
      throw new Error(
        `452-04 前置不成立：报价产品 ${productId} 缺克重或幅宽元数据，转订单的米→公斤换算门必拒 实际 gram_weight=${String(gram)} width=${String(widthMeta)}`
      );
    }
    const target = await pickDyeableWarehouse(page);
    const batchNo = genCode('452C');
    // 出库腿的可扣库存：白坯（色号空 ⇒ 服务端缸号归一 None），ShipOrderItemRequest 白坯分支免填匹号。
    // 量与下方报价行的米数合计同量级（9000 米），保持本腿「录入量 = 可扣量」的原设计关系。
    await seedGreigeStockIn(page, {
      productId,
      warehouseId: target.id,
      batchNo,
      quantityMeters: '9000',
    });

    // 段一：报价明细按米录入（两行同产品，验转订单逐行落量与合计守恒）。
    // 米数合计必须落在 9000 米这一量级：报价审批档位由 quotation_approval_service.rs 的
    // AMOUNT_THRESHOLD_SELF=100000 按 total_amount 判档，低于 10 万走销售员自批短路（submit
    // 直接落 approved），/approve 的状态门 lock_and_validate_quotation_for_approval_txn 只放行
    // pending_approval，本腿要的「提交→批准」两跳就无前置可行；12.5 单价 × 9000 米 = 112500
    // 落在 10 万到 50 万的经理审批档，提交才真走 BPM 分支落小写 pending_approval。
    const noteTag = genCode('452Q');
    // 段一还差一户授信客户：夹具客户 ctx.customerId 的 credit_limit 落零，而订单提交面按
    // 信用额度拦（信用门在销售订单 submit 上，112500 的订单额必被拒"信用额度不足，无法提交订单"）。
    // 本腿自建一户足额授信客户，报价与由它转出的销售订单都挂这一户，不改夹具客户的额度
    // （夹具客户被同分片其它腿共用，抬它的额度会把信用门的判据稀释成永真）。
    const creditCust = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
      customer_name: `E2E452授信客户${noteTag}`,
      credit_limit: '1000000.00',
    });
    const creditCustomerId = creditCust.data?.id;
    if (typeof creditCustomerId !== 'number') {
      throw new Error(
        `452-04 前置不成立：自建授信客户未返回数字 id，实际 ${JSON.stringify(creditCust)}`
      );
    }
    const q = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
      customer_id: creditCustomerId,
      sales_user_id: ctx.userIds[0],
      quotation_date: new Date().toISOString().slice(0, 10),
      valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      currency: 'CNY',
      exchange_rate: '1',
      base_currency: 'CNY',
      price_terms: 'FOB',
      tax_inclusive: false,
      tax_rate: '0',
      items: [
        {
          product_id: productId,
          unit: '米',
          quantity: '5000',
          unit_price: '12.5',
          unit_price_with_tax: '12.5',
        },
        {
          product_id: productId,
          unit: '米',
          quantity: '4000',
          unit_price: '12.5',
          unit_price_with_tax: '12.5',
        },
      ],
      notes: `E2E-452-04-${noteTag}`,
    });
    const quotationId = q.data?.id;
    if (!quotationId) {
      throw new Error(
        `452-04 前置不成立：报价单创建未返回 id，实际 ${JSON.stringify(q).slice(0, 400)}`
      );
    }
    const qDetail = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    if (!Object.prototype.hasOwnProperty.call(qDetail, 'items')) {
      throw new Error(
        `452-04 前置不成立：报价详情出参缺 items 键，报价明细这一环节无回读口即合计不可证，实际 ${JSON.stringify(qDetail).slice(0, 400)}`
      );
    }
    const quoteMeterLines = (qDetail.items as Row[])
      .filter(it => Number(it.product_id) === productId && String(it.unit) === '米')
      .map(it => decField(it, 'quantity', `452-04 报价行 标记 ${noteTag}`));
    expect(quoteMeterLines.length, '段一：按米录入的报价行必须恰 2 行').toBe(2);

    // 提交腿与批准腿的合法前置（逐条读后端源，非推测）：
    // 1 档位。ApproverRole::from_amount 以 AMOUNT_THRESHOLD_SELF=100000 判档，低于 10 万走销售员
    //   自批短路（submit 内 self_approve 直接落小写 approved），批准端点的状态门
    //   lock_and_validate_quotation_for_approval_txn 只放行小写 pending_approval，届时本腿的
    //   「提交→批准」这一跳没有任何合法前置可行；9000 米 × 12.5 = 112500 落在 10 万到 50 万的
    //   经理审批档，提交真走 BPM 分支落待审批。提交后先按出参自证档位，把「录入金额落在哪一档」
    //   变成用例自己可证的判据，而不是事后猜。
    // 2 理由。POST /quotations/{id}/approve 的请求体键逐字符取 handlers/quotation_handler.rs 的
    //   ApproveQuotationRequest.approval_reason（Option<String>，经 trim 非空门，缺键即由 handler
    //   收口成 400 VALIDATION_ERROR「审批通过理由不能为空」），理由落 sales_quotations.approval_reason 列。
    await apiCall(page, 'POST', `/quotations/${quotationId}/submit`);
    const submittedQ = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    expect(
      String(submittedQ.status ?? ''),
      `段一前置：提交后应处于小写 pending_approval（models/status/sales.rs 报价模组）才可批准，实际=${JSON.stringify(
        submittedQ.status
      )}`
    ).toBe('pending_approval');
    await apiCall(page, 'POST', `/quotations/${quotationId}/approve`, {
      approval_reason: 'E2E 452-04 按米报价审批通过',
    });
    const approvedQ = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
    expect(
      String(approvedQ.status ?? ''),
      `批准跃迁后应真落库小写 approved，实际=${JSON.stringify(approvedQ.status)}`
    ).toBe('approved');
    expect(
      String(approvedQ.approval_reason ?? ''),
      `审批通过理由应真实落列并可经详情出参回读，实际=${JSON.stringify(approvedQ.approval_reason)}`
    ).toBe('E2E 452-04 按米报价审批通过');

    // 段二：转订单后回读订单行主计量
    const converted = await apiCallRaw<Row>(page, 'POST', `/quotations/${quotationId}/convert`);
    const orderId = Number(converted.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error(
        `452-04 前置不成立：报价转订单出参未含销售订单主键，实际 ${JSON.stringify(converted).slice(0, 400)}`
      );
    }
    const orderDetail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    const orderNo = String(orderDetail.order_no);
    const orderMeterLines = (orderDetail.items as Row[])
      .filter(l => Number(l.product_id) === productId)
      .map(l => decField(l, 'quantity_meters', `452-04 订单行 订单 ${orderNo}`));
    expect(orderMeterLines.length, '段二：转订单必须按报价行逐行落订单行（2 行）').toBe(2);
    sameDecSum(quoteMeterLines, orderMeterLines, '452-04 报价明细折回主单位 vs 订单行主计量合计');

    // 段三前置：转单写出的销售订单初态是 draft（services/quotation_convert_service.rs 的
    // status 置值），而发货门只认已审批与部分发货，跳过 submit 与 approve 两跳就会在
    // POST /sales/orders/{id}/ship 得到"仅已审批或部分发货的订单可发货"。
    // 审批回读的状态词取写入方口径（models/status/sales_order.rs，小写 approved）。
    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);
    await apiCall(page, 'POST', `/sales/orders/${orderId}/approve`);
    const approvedOrder = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(
      String(approvedOrder.status ?? ''),
      `452-04 段三前置：转出的订单经提交与批准后应落小写 approved，实际 ${JSON.stringify(
        approvedOrder.status
      )}`
    ).toBe('approved');

    // 段三：出库（录入量 = 订单行主计量合计，由后端出参补零求和后原样回传）
    const shipScale = decMaxScale(
      orderMeterLines.map(v => ({ v, label: `452-04 订单行主计量 订单 ${orderNo}` }))
    );
    const shipQty = decFromScaled(
      orderMeterLines.reduce(
        (acc, v) => acc + decScaled(v, `452-04 订单行主计量 订单 ${orderNo}`, shipScale),
        0n
      ),
      shipScale
    );
    await apiCall(page, 'POST', `/sales/orders/${orderId}/ship`, {
      order_id: orderId,
      warehouse_code: target.code,
      items: [
        {
          product_id: productId,
          quantity: shipQty,
          batch_no: batchNo,
          color_no: '',
          dye_lot_no: null,
          piece_no: null,
        },
      ],
      remarks: `E2E 452-04 出库 ${noteTag}`,
    });
    const txnRaw = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}&batch_no=${encodeURIComponent(batchNo)}&transaction_type=SALES_DELIVERY&page=1&page_size=100`
    );
    const shipMeterLines = pickListArray<Row>(
      txnRaw,
      'items',
      `452-04 出库库存流水 /inventory/stock/transactions 批次 ${batchNo}`
    )
      .filter(r => String(r.source_bill_no) === orderNo)
      .map(r => decField(r, 'quantity_meters', `452-04 出库流水行 订单 ${orderNo}`));
    expect(
      shipMeterLines.length,
      `段三：出库流水必须恰 1 行（多行即重复扣减），实际 ${JSON.stringify(shipMeterLines)}`
    ).toBe(1);
    sameDecSum(orderMeterLines, shipMeterLines, '452-04 订单行主计量合计 vs 出库流水主单位合计');
    sameDecSum(
      quoteMeterLines,
      shipMeterLines,
      '452-04 报价明细（按米）合计 vs 出库折回主单位合计'
    );
    console.log(
      `[452-04] 三段折回主单位合计守恒通过 报价标记=${noteTag} 订单=${orderNo} 出库录入量=${shipQty}`
    );
  });

  /**
   * 452-05 反向腿：出库撤销后，主计量、订单行进度与匹（细码）逐项恢复到出库前的真接口读数。
   *
   * 链与端点（逐条在册）。POST /sales/orders/{id}/ship 出库整匹；
   * GET /sales/orders/{id}/deliveries（get_order_deliveries，信封键 list/total）取发货单主键；
   * POST /sales/orders/{id}/deliveries/{did}/cancel（cancel_delivery，CancelDeliveryRequest 的 reason）
   * 撤销；GET /inventory/stock、GET /sales/orders/{id}、GET /inventory/pieces（经 readDyedPieceByNo）
   * 三路回读恢复值。
   *
   * 契约真相（读源，非推测）。cancel_delivery 先做路径一致性门（发货单 order_id 与 path order_id
   * 不符即 NOT_FOUND），再按四维把库存行 quantity_shipped/on_hand 回补（已发量小于回补量即业务拒绝），
   * 并把订单行 shipped_quantity 按行 col_expr 减回本次发货量；匹的消耗由
   * services/piece_domain_service.rs 的 outbound CAS 门控制，撤销按同四维回退。
   * 基线全部取出库前真接口读数：库存行主计量、订单行已发量、匹状态与长度，
   * 撤销后与基线在同一十进制刻度上逐位对照（分差 0）。
   *
   * 假绿防线。不看前端状态、不信撤销接口返回值，撤销后一律重新 GET 三路回读；
   * 出库中间态也真读一次并用「扣前 − 扣后 = 出库量」钉住确实扣过（否则恢复等于没扣也能过）；
   * 撤销后发货单是否仍留在列表未取证，故不断其状态词，只断计量与余码恢复。
   */
  test('452-05 反向腿：出库撤销后主计量、订单行进度与匹（细码）逐项回到出库前读数', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) {
      throw new Error('452-05 前置不成立：夹具产品缺失 productIds[0]=undefined');
    }
    const target = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: target.id,
      quantityMeters: '120',
      pieceCount: 1,
      context: '452-05',
    });
    const piece = bundle.pieces[0];
    if (piece === undefined) {
      throw new Error(
        `452-05 前置不成立：委外染色链未产出可出库染色匹 缸号=${bundle.dyeLotNo} 匹数=${String(bundle.pieces.length)}`
      );
    }
    const dims = {
      productId,
      warehouseId: target.id,
      dyeLotNo: bundle.dyeLotNo,
      batchNo: bundle.dyeLotNo,
    };
    const pieceNo = String(piece.piece_no);
    // 匹是 GET /inventory/pieces 回读的 DyedSeedPiece 声明行：length 按字段直取（同 452-03 的 parent.length），
    // 值仍是后端真实读数，不经只吃泛化 Row 的入口
    const shipQty = decKey(piece.length, '452-05 整匹实测长度');
    const order = await seedApprovedOrderFor(page, productId, shipQty, '452-05');

    // 出库前基线：库存行主计量、订单行已发量、匹状态与长度（三路真接口）
    const stockQs =
      `/inventory/stock?product_id=${productId}&warehouse_id=${target.id}` +
      `&color_no=${encodeURIComponent(bundle.colorNo)}&dye_lot_no=${encodeURIComponent(bundle.dyeLotNo)}` +
      `&batch_no=${encodeURIComponent(bundle.dyeLotNo)}&page=1&page_size=20`;
    const stockBefore = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', stockQs),
      'items',
      `452-05 出库前四维库存行 /inventory/stock 缸号 ${bundle.dyeLotNo}`
    ).find(
      r =>
        String(r.color_no) === bundle.colorNo &&
        String(r.dye_lot_no) === bundle.dyeLotNo &&
        String(r.batch_no) === bundle.dyeLotNo
    );
    if (stockBefore === undefined) {
      throw new Error('452-05 前置不成立：出库前按四维读不到库存行');
    }
    // 基线列口径同 452-03 步骤 7 的注释：出库扣与撤销补都写 quantity_available，
    // quantity_meters 由入库录入且出库/撤销不改，拿它当扣前扣后读数会把真实扣减看成零变化。
    const stockAvailableBefore = decField(
      stockBefore,
      'quantity_available',
      '452-05 出库前库存行可用量'
    );
    const lineBefore = orderLineOf(
      await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`),
      productId,
      '452-05 出库前订单行'
    );
    const shippedBefore = decField(lineBefore, 'shipped_quantity', '452-05 出库前订单行已发量');
    const pieceBefore = await readDyedPieceByNo(page, { ...dims, pieceNo });
    if (pieceBefore === null) {
      throw new Error(`452-05 前置不成立：出库前按匹号 ${pieceNo} 读不到染色匹`);
    }

    // 出库：整匹（四维齐传）
    await apiCall(page, 'POST', `/sales/orders/${order.id}/ship`, {
      order_id: order.id,
      warehouse_code: target.code,
      items: [
        {
          product_id: productId,
          quantity: shipQty,
          batch_no: bundle.dyeLotNo,
          color_no: bundle.colorNo,
          dye_lot_no: bundle.dyeLotNo,
          piece_no: pieceNo,
        },
      ],
      remarks: `E2E 452-05 整匹出库 ${pieceNo}`,
    });

    // 出库中间态真读一次：发货单在册且为出库态，库存确实扣了（否则"恢复"无意义）
    const dlvRaw = await apiCallRaw<unknown>(page, 'GET', `/sales/orders/${order.id}/deliveries`);
    const dlvRows = pickListArray<Row>(
      dlvRaw,
      'list',
      `452-05 发货单列表 /sales/orders/{id}/deliveries 订单 ${order.order_no}`
    );
    expect(
      dlvRows.length,
      `出库后应恰 1 张发货单，实际 ${JSON.stringify(dlvRows).slice(0, 400)}`
    ).toBe(1);
    const deliveryId = Number(dlvRows[0].id);
    if (!Number.isInteger(deliveryId) || deliveryId <= 0) {
      throw new Error(
        `452-05 前置不成立：发货单未返回主键，实际 ${JSON.stringify(dlvRows[0]).slice(0, 400)}`
      );
    }
    expect(String(dlvRows[0].status), '发货单出库态词表值（写入方小写）').toBe('shipped');
    const stockMid = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', stockQs),
      'items',
      `452-05 出库后四维库存行 /inventory/stock 缸号 ${bundle.dyeLotNo}`
    ).find(
      r =>
        String(r.color_no) === bundle.colorNo &&
        String(r.dye_lot_no) === bundle.dyeLotNo &&
        String(r.batch_no) === bundle.dyeLotNo
    );
    if (stockMid === undefined) {
      throw new Error('452-05 前置不成立：出库后按四维读不到库存行');
    }
    sameDecDiff(
      stockAvailableBefore,
      decField(stockMid, 'quantity_available', '452-05 出库后库存行可用量'),
      shipQty,
      '452-05 出库确实扣减：扣前 − 扣后 = 出库量'
    );

    // 反向腿：撤销发货（POST /sales/orders/{id}/deliveries/{did}/cancel）
    await apiCall(page, 'POST', `/sales/orders/${order.id}/deliveries/${deliveryId}/cancel`, {
      reason: `E2E 452-05 出库撤销守恒 ${pieceNo}`,
    });

    // 恢复断言：三路回读与出库前基线逐位对照（分差 0，不引用撤销接口返回值）
    const stockAfterCancel = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', stockQs),
      'items',
      `452-05 撤销后四维库存行 /inventory/stock 缸号 ${bundle.dyeLotNo}`
    ).find(
      r =>
        String(r.color_no) === bundle.colorNo &&
        String(r.dye_lot_no) === bundle.dyeLotNo &&
        String(r.batch_no) === bundle.dyeLotNo
    );
    if (stockAfterCancel === undefined) {
      throw new Error('452-05 撤销后按四维必须仍能读到库存行');
    }
    sameDec(
      decField(stockAfterCancel, 'quantity_available', '452-05 撤销后库存行可用量'),
      stockAvailableBefore,
      '452-05 撤销后库存行可用量 vs 出库前基线'
    );
    const lineAfterCancel = orderLineOf(
      await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`),
      productId,
      '452-05 撤销后订单行'
    );
    sameDec(
      decField(lineAfterCancel, 'shipped_quantity', '452-05 撤销后订单行已发量'),
      shippedBefore,
      '452-05 撤销后订单行已发量 vs 出库前基线'
    );
    const pieceAfterCancel = await readDyedPieceByNo(page, { ...dims, pieceNo });
    if (pieceAfterCancel === null) {
      throw new Error(`452-05 撤销后按匹号 ${pieceNo} 必须仍能单独查到该匹（含零头余码）`);
    }
    sameDec(
      pieceAfterCancel.length,
      pieceBefore.length,
      '452-05 撤销后匹（细码）长度 vs 出库前基线'
    );
    expect(
      String(pieceAfterCancel.status),
      '撤销后匹状态词必须回到出库前读到的值（词表来源 models/status/purchase_inventory.rs::inventory_piece）'
    ).toBe(String(pieceBefore.status));
    console.log(
      `[452-05] 出库撤销反向腿恢复守恒通过 订单=${order.order_no} 发货单=${deliveryId} 匹=${pieceNo} 量=${shipQty}`
    );
  });
});
