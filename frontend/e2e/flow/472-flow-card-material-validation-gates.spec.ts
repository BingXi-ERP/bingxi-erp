import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
} from './helpers';
// 受控取值单源：投纱单位与库存等级词表的唯一前端真相源，用例比较点一律取常量本身，
// 禁止在 spec 里另抄一套取值（中文等级词表禁止英文化）。
import { MATERIAL_UNIT } from '../../src/constants/yarn-input-unit';
import { STOCK_GRADE } from '../../src/constants/stock-grade';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

/**
 * 472 流转卡投纱登记面受控取值与完工扣料拒绝面补测
 *
 * 功能。把「投纱行登记受控什么、完工扣料拒绝什么」钉成可复演的 HTTP 契约：
 * 非法计量单位（pcs / 吨 / 空串）、非正数量（0 / 负数）、词表外等级（一等 / A）在登记期
 * 必须显式拒绝且不落库（回读该卡投纱列表行数不变）；同一组定位维度（仓库×纱×批次×色号×等级）
 * 存在多个缸而投纱行未登记缸号时完工必须被拒（400 + BUSINESS_ERROR + 订单状态与两库存行
 * 计量列回读零变化）；投纱量超过命中库存行对应计量列时完工必须被拒且不扣负
 * （派工单「文案含纱编号与批次」判据在 HTTP 出参面被脱敏设计挡住，属判据缺口，
 * 见下方契约真相，不伪造也不借此放松拒绝面断言）；软删的投纱行不参与完工扣料，
 * 只有存活行的量被扣且消耗流水条数与存活行数一致。
 *
 * 调用方。Playwright 收集器按 flow 目录发现本 spec；beforeEach 用 loginViaUI 注入 worker
 * 会话，472-00 经 ensureTestEntities 备好仓库与产品分类外键后自建纱线产品与门控用流转卡，
 * 其余用例全程走 apiCall / apiCallExpectFail 不导航页面。
 *
 * 入参。POST /production/flow-cards/materials 请求体为 flow_card_id、warehouse_id、
 * material_id、batch_no、color_no、dye_lot_no（可空）、grade、quantity、unit、remark（可选）；
 * 完工走 PUT /production/production-orders/orders/{id}/status 且状态 token 取
 * 后端写入方原值（DRAFT/SCHEDULED/IN_PROGRESS/COMPLETED）。数量与库存一律用字符串十进制
 * 提交（rust_decimal serde 接受），出参数值统一 Number() 归一后比较，不在用例内再造舍入。
 *
 * 传给谁。登记面落 backend/src/handlers/flow_card_material_handler.rs →
 * services/flow_card_material_service.rs（validate_unit / validate_quantity / ensure_card_exists）；
 * 完工面落 services/production_order_ops/crud.rs update_status → completion.rs
 * complete_production_order → deduct_raw_materials_txn（定位键 = 仓库×纱×批次×色号×等级，
 * 带缸号再按缸号收敛，多缸无缸号、库存不足、单位越域均为 AppError::business 显式拒绝）。
 *
 * 存什么。flow_card_materials 行的四维与 quantity/unit；inventory_stocks 的
 * quantity_meters 与 quantity_kg 两计量列（kg 投纱扣公斤列，米数按命中行自身比值等比随行）；
 * 完工成功时每存活投纱行落一条 PRODUCTION_CONSUMPTION 流水。
 *
 * 存哪里。PostgreSQL public.flow_card_materials（m0131 建表，CHECK 约束含 unit IN ('kg','m')
 * 与 quantity >= 0）与 public.inventory_stocks / 库存流水表；批次号与色号带本 spec 唯一后缀
 * 隔离并发车道，用后不删除（软删面本身是被测行为）。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 单位越域：validate_unit 不在 [kg, m] 即 AppError::validation_displayable，
 * HTTP 400 + code=VALIDATION_ERROR + 外显「投纱计量单位只支持公斤与米两种」；
 * 非正数量：validate_quantity 对 <=0 拒绝，HTTP 400 + VALIDATION_ERROR + 外显「投纱数量必须大于零」。
 * 完工拒绝：AppError::business 族，HTTP 400 + code=BUSINESS_ERROR；
 * 事务内任一拒绝即整体回滚——订单状态保持 IN_PROGRESS、库存两计量列不变、不落流水。
 * 文案面事实（与 flow/471 头部口径一致）：拒绝的格式化文案（纱编号/批次/库存量）只进服务端日志，
 * HTTP 出参 message 恒为脱敏常量「业务处理失败」（utils/error.rs 的 public_message 对
 * BusinessError 非 Displayable 变体的固定回退），所以「错误文案含纱编号与批次」在 HTTP 层
 * 当前不可测；是否改走 business_displayable 外显受调度与研发裁决（库存数量属外显安全边界），
 * 本 spec 不伪造该判据，改以「机器码 + 信封齐全 + 回读零副作用」钉死拒绝面本身。
 * 等级为受控词表值（一等品/二等品/等外品，与库存行 grade 同源），词表外取值在登记期即应
 * 被拒且不落库；登记面缺该门同样保持判红，不得改成「前端拦了就算过」。
 *
 * 假绿防线。拒绝类断言全部同时钉两件事：错误形状可见（HTTP 400 + 字符串机器码 + 非空文案）
 * 与副作用没发生（回读投纱列表行数 / 回读库存计量列 / 回读订单状态），只断 4xx 不算；
 * 落库断言打在 GET 回读结果上而不是请求体；计数一律用前后差值并按唯一批次隔离；
 * 播种库存行与流水回读查不到目标行即当场抛错点名维度，不做「空列表=通过」；
 * 全程无 try/catch 吞失败、无 ?? 兜底掩盖缺键。
 */

type Dict = Record<string, unknown>;

/** 生产订单状态词表：写入方 backend/src/models/status 的 common 与 production 模块，全大写 */
const PROD_ORDER_STATUS = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

/** 消耗流水类型 token：写入方 completion.rs record_production_consumption */
const TXN_TYPE_PRODUCTION_CONSUMPTION = 'PRODUCTION_CONSUMPTION';

const ORDERS = '/production/production-orders/orders';
const FLOW_CARDS = '/production/flow-cards';
const MATERIALS = '/production/flow-cards/materials';

/** 本 spec 唯一后缀：所有批次/色号/编码带它，并发车道互不碰撞 */
const UNIQUE = genCode('F472');

let warehouseId = 0;
let yarnProductId = 0;
/** 纱编号（products.code）：完工拒绝文案可定位判据的比对锚点，回读落库真值而非本地拼串 */
let yarnCode = '';
/** 登记面门控用例（472-01..03）共用的流转卡 */
let gateCardId = 0;

/** GET 回读该卡投纱列表；data 必须是裸数组，形状不符当场抛错（不静默收窄成空列表） */
async function listMaterials(page: Page, cardId: number): Promise<Dict[]> {
  const res = await apiCall<unknown>(page, 'GET', `${FLOW_CARDS}/${cardId}/materials`);
  if (!Array.isArray(res.data)) {
    throw new Error(
      `[472] GET ${FLOW_CARDS}/${cardId}/materials 出参 data 不是数组，实际=${JSON.stringify(res.data)?.slice(0, 300)}`
    );
  }
  return res.data as Dict[];
}

/**
 * 登记一条投纱（成功路径）。返回落库行（含 id），断言只认这份回读面。
 * dyeLot 传 undefined 即整键缺席（后端 serde default → NULL，代表未采集缸号）。
 */
async function addMaterial(
  page: Page,
  m: {
    flowCardId: number;
    warehouseId: number;
    materialId: number;
    batchNo: string;
    colorNo: string;
    grade: string;
    dyeLot?: string;
    quantity: string;
    unit: string;
  }
): Promise<Dict> {
  const body: Dict = {
    flow_card_id: m.flowCardId,
    warehouse_id: m.warehouseId,
    material_id: m.materialId,
    batch_no: m.batchNo,
    color_no: m.colorNo,
    grade: m.grade,
    quantity: m.quantity,
    unit: m.unit,
  };
  if (m.dyeLot !== undefined) body.dye_lot_no = m.dyeLot;
  const res = await apiCall<Dict>(page, 'POST', MATERIALS, body);
  return res.data;
}

/** 按四维+批次回读库存行；命中数不是 1 即抛错点名维度组合（多命中=维度没隔离开，零命中=播种断了） */
async function readStockRow(
  page: Page,
  dims: {
    productId: number;
    warehouseId: number;
    batchNo: string;
    colorNo: string;
    grade: string;
    dyeLot?: string;
  }
): Promise<Dict> {
  const path =
    `/inventory/stock?product_id=${dims.productId}&warehouse_id=${dims.warehouseId}` +
    `&batch_no=${encodeURIComponent(dims.batchNo)}&page=1&page_size=100`;
  const res = await apiCallRaw<{ items?: unknown }>(page, 'GET', path);
  if (!Array.isArray(res.items)) {
    throw new Error(
      `[472] 库存回读 ${path} 的 data.items 不是数组，实际=${JSON.stringify(res).slice(0, 300)}`
    );
  }
  const rows = (res.items as Dict[]).filter(
    r =>
      String(r.color_no) === dims.colorNo &&
      String(r.grade) === dims.grade &&
      (dims.dyeLot === undefined ? !r.dye_lot_no : String(r.dye_lot_no ?? '') === dims.dyeLot)
  );
  if (rows.length !== 1) {
    throw new Error(
      `[472] 按 product=${dims.productId} warehouse=${dims.warehouseId} batch=${dims.batchNo}` +
        ` color=${dims.colorNo} grade=${dims.grade} dye=${dims.dyeLot ?? '(未登记)'} ` +
        `回读库存行命中 ${rows.length} 条（应为 1），库存四维追溯在本环境断了`
    );
  }
  return rows[0];
}

/** 播种一行纱线库存（POST /inventory/stock/fabric），落库后立即回读证明真实存在 */
async function seedYarnStock(
  page: Page,
  opts: {
    productId: number;
    warehouseId: number;
    batchNo: string;
    colorNo: string;
    grade: string;
    dyeLot: string;
    meters: string;
    kg: string;
  }
): Promise<Dict> {
  await apiCall(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: opts.warehouseId,
    product_id: opts.productId,
    batch_no: opts.batchNo,
    color_no: opts.colorNo,
    dye_lot_no: opts.dyeLot,
    grade: opts.grade,
    quantity_meters: opts.meters,
    quantity_kg: opts.kg,
  });
  return readStockRow(page, {
    productId: opts.productId,
    warehouseId: opts.warehouseId,
    batchNo: opts.batchNo,
    colorNo: opts.colorNo,
    grade: opts.grade,
    dyeLot: opts.dyeLot,
  });
}

/** 建生产订单并推进到 IN_PROGRESS（完工的唯一合法前置态），返回 {id, orderNo} */
async function makeOrderInProgress(
  page: Page,
  fabricProductId: number
): Promise<{ id: number; orderNo: string }> {
  const created = await apiCall<Dict>(page, 'POST', ORDERS, {
    product_id: fabricProductId,
    planned_quantity: 100,
  });
  const id = Number(created.data.id);
  const orderNo = String(created.data.order_no);
  if (!id || !orderNo || orderNo === 'undefined') {
    throw new Error(
      `[472] 建生产订单未回 id/order_no，实际=${JSON.stringify(created).slice(0, 300)}`
    );
  }
  await apiCall(page, 'PUT', `${ORDERS}/${id}/status`, { status: PROD_ORDER_STATUS.SCHEDULED });
  await apiCall(page, 'PUT', `${ORDERS}/${id}/status`, { status: PROD_ORDER_STATUS.IN_PROGRESS });
  const readBack = await apiCallRaw<Dict>(page, 'GET', `${ORDERS}/${id}`);
  expect(
    String(readBack.status),
    `[472] 订单 ${orderNo} 完工前置态推进后回读应为 ${PROD_ORDER_STATUS.IN_PROGRESS}`
  ).toBe(PROD_ORDER_STATUS.IN_PROGRESS);
  return { id, orderNo };
}

/** 在订单下建流转卡（投纱行的承载卡），返回卡 id */
async function makeCard(page: Page, orderId: number): Promise<number> {
  const card = await apiCall<Dict>(page, 'POST', FLOW_CARDS, {
    production_order_id: orderId,
  });
  const id = Number(card.data.id);
  if (!id) {
    throw new Error(`[472] 建流转卡未回 id，实际=${JSON.stringify(card).slice(0, 300)}`);
  }
  return id;
}

/** 回读订单当前状态（比较点与写入方逐字符相同） */
async function readOrderStatus(page: Page, orderId: number): Promise<string> {
  const res = await apiCallRaw<Dict>(page, 'GET', `${ORDERS}/${orderId}`);
  return String(res.status);
}

/**
 * 完工拒绝断言的公共判据：HTTP 恰 400 + 字符串机器码 BUSINESS_ERROR + 非空 message +
 * 统一失败信封的 trace_id/timestamp 键齐全（AppError 单一失败形状的可证面）。
 * 「文案含纱编号与批次」不入本判据：该格式化文案在 AppError::business 出参面被脱敏为固定常量
 * 「业务处理失败」（utils/error.rs 的 public_message 对非 Displayable 变体的固定回退，
 * 且文案含库存数量属外显安全边界），HTTP 层当前不可测；此判据缺口如实登记交调度与研发裁决，
 * 不用可定位断言伪造、也不拿它掩盖拒绝面本身——拒绝面由机器码与回读零副作用钉死。
 */
function expectCompletionRejection(
  result: Awaited<ReturnType<typeof apiCallExpectFail>>,
  context: string
): void {
  expect(
    result.status,
    `${context}：应 HTTP 400 业务拒绝，实际 status=${result.status} code=${JSON.stringify(result.code)} message=${result.message ?? '(none)'}`
  ).toBe(400);
  expect(
    failureCode(result),
    `${context}：机器码应为字符串 BUSINESS_ERROR，实际 code=${JSON.stringify(result.code)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  const message = typeof result.message === 'string' ? result.message : '';
  expect(message.trim().length, `${context}：拒绝必须带非空文案键`).toBeGreaterThan(0);
  expect(
    typeof result.trace_id === 'string' && result.trace_id.length > 0,
    `${context}：AppError 失败信封的 trace_id 必须存在，实际=${JSON.stringify(result).slice(0, 300)}`
  ).toBe(true);
  expect(
    result.timestamp !== undefined,
    `${context}：AppError 失败信封的 timestamp 必须存在，实际=${JSON.stringify(result).slice(0, 300)}`
  ).toBe(true);
}

test.describe.serial('472 流转卡投纱受控取值与完工扣料拒绝面', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('472-00 前置：备好仓库、自建纱线产品并读回落库编号，建门控订单与流转卡', async ({
    page,
  }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.warehouseIds.length) {
      throw new Error('[472-00] ensureTestEntities 后 ctx.warehouseIds 为空，仓库前置断了');
    }
    if (!ctx.productIds.length) {
      throw new Error('[472-00] ensureTestEntities 后 ctx.productIds 为空，成布产品前置断了');
    }
    warehouseId = ctx.warehouseIds[0];
    const code = `E2E-YARN-${UNIQUE}`;
    const created = await apiCall<Dict>(page, 'POST', '/products', {
      code,
      name: `E2E成品纱${UNIQUE}`,
      unit: MATERIAL_UNIT.kilogram,
      category_id: ctx.productCategoryIds[0],
      product_type: PRODUCT_TYPE.auxiliary,
    });
    yarnProductId = Number(created.data.id);
    if (!yarnProductId) {
      throw new Error(
        `[472-00] 纱线产品创建未回 id，实际=${JSON.stringify(created).slice(0, 300)}`
      );
    }
    // 纱编号取回读真值：完工拒绝文案的可定位判据拿它比对，不许用本地拼串凑
    const detail = await apiCallRaw<Dict>(page, 'GET', `/products/${yarnProductId}`);
    yarnCode = String(detail.code);
    expect(yarnCode, `[472-00] 纱线产品回读 code 应等于提交值`).toBe(code);

    const gate = await makeOrderInProgress(page, ctx.productIds[0]);
    gateCardId = await makeCard(page, gate.id);
    console.log(
      `[472-00] 前置就绪 warehouse=${warehouseId} yarn=${yarnProductId}/${yarnCode} gateCard=${gateCardId}`
    );
  });

  test('472-01 非法计量单位（pcs/吨/空串）登记被拒且不落库', async ({ page }) => {
    for (const badUnit of ['pcs', '吨', '']) {
      const before = await listMaterials(page, gateCardId);
      const result = await apiCallExpectFail(page, 'POST', MATERIALS, {
        flow_card_id: gateCardId,
        warehouse_id: warehouseId,
        material_id: yarnProductId,
        batch_no: `B-${UNIQUE}-U1`,
        color_no: `C-${UNIQUE}`,
        grade: STOCK_GRADE.first,
        quantity: '10',
        unit: badUnit,
      });
      expect(
        result.status,
        `[472-01] 单位 ${JSON.stringify(badUnit)} 越域应 HTTP 400，实际 status=${result.status} code=${JSON.stringify(result.code)} message=${result.message ?? '(none)'}`
      ).toBe(400);
      expect(
        failureCode(result),
        `[472-01] 单位 ${JSON.stringify(badUnit)} 越域应是校验族 VALIDATION_ERROR，实际 code=${JSON.stringify(result.code)}`
      ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      const message = typeof result.message === 'string' ? result.message : '';
      expect(
        message,
        `[472-01] 单位 ${JSON.stringify(badUnit)} 被拒必须外显受控原因（validate_unit 的 displayable 文案）`
      ).toContain('只支持公斤与米');
      const after = await listMaterials(page, gateCardId);
      expect(
        after.length,
        `[472-01] 非法单位被拒后不得落库：该卡投纱行数应从 ${before.length} 保持 ${before.length}，实际 ${after.length}`
      ).toBe(before.length);
    }
    // 落库面的受控性：卡上现存行的 unit 逐行必须命中 MATERIAL_UNIT 两值词表
    const rows = await listMaterials(page, gateCardId);
    for (const row of rows) {
      expect(
        [MATERIAL_UNIT.kilogram, MATERIAL_UNIT.meter],
        `[472-01] 落库投纱行 id=${row.id} 的 unit=${JSON.stringify(row.unit)} 越出了受控词表`
      ).toContain(String(row.unit));
    }
  });

  test('472-02 非正数量（0/负数）登记被拒且不落库', async ({ page }) => {
    for (const badQty of ['0', '-5']) {
      const before = await listMaterials(page, gateCardId);
      const result = await apiCallExpectFail(page, 'POST', MATERIALS, {
        flow_card_id: gateCardId,
        warehouse_id: warehouseId,
        material_id: yarnProductId,
        batch_no: `B-${UNIQUE}-Q1`,
        color_no: `C-${UNIQUE}`,
        grade: STOCK_GRADE.first,
        quantity: badQty,
        unit: MATERIAL_UNIT.kilogram,
      });
      expect(
        result.status,
        `[472-02] 数量 ${badQty} 应 HTTP 400 被拒，实际 status=${result.status} code=${JSON.stringify(result.code)} message=${result.message ?? '(none)'}`
      ).toBe(400);
      expect(
        failureCode(result),
        `[472-02] 数量 ${badQty} 应是校验族 VALIDATION_ERROR，实际 code=${JSON.stringify(result.code)}`
      ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
      const message = typeof result.message === 'string' ? result.message : '';
      expect(message, `[472-02] 数量 ${badQty} 被拒必须外显「投纱数量必须大于零」`).toContain(
        '必须大于零'
      );
      const after = await listMaterials(page, gateCardId);
      expect(
        after.length,
        `[472-02] 非正数量被拒后不得落库：应从 ${before.length} 保持 ${before.length}，实际 ${after.length}`
      ).toBe(before.length);
    }
  });

  test('472-03 词表外等级（一等/A）登记被拒且不落库', async ({ page }) => {
    // 等级是与库存行同源的受控词表值（一等品/二等品/等外品）；词表外取值在登记期即应显式
    // 拒绝，判据是「错误形状可见 + 行数没变」，不是「返回 200 但前端拦了」。
    // 若后端写面（flow_card_material_service create/update）与 m0131 DDL 都没有等级门，
    // 本用例判红即该拒绝面缺失的真实暴露——源码缺门，交后端补校验，禁止放宽断言或删用例。
    for (const badGrade of ['一等', 'A']) {
      const before = await listMaterials(page, gateCardId);
      const result = await apiCallExpectFail(page, 'POST', MATERIALS, {
        flow_card_id: gateCardId,
        warehouse_id: warehouseId,
        material_id: yarnProductId,
        batch_no: `B-${UNIQUE}-G1`,
        color_no: `C-${UNIQUE}`,
        grade: badGrade,
        quantity: '10',
        unit: MATERIAL_UNIT.kilogram,
      });
      expect(
        result.status,
        `[472-03] 等级 ${JSON.stringify(badGrade)} 越出词表应被后端登记面拒绝（HTTP 400），` +
          `实际 status=${result.status} code=${JSON.stringify(result.code)} message=${result.message ?? '(none)'}`
      ).toBe(400);
      const code = failureCode(result);
      expect(
        code === APP_ERROR_CODES.VALIDATION_ERROR || code === APP_ERROR_CODES.BUSINESS_ERROR,
        `[472-03] 等级 ${JSON.stringify(badGrade)} 的拒绝码应是校验/业务族字符串机器码，实际 code=${JSON.stringify(result.code)}`
      ).toBe(true);
      expect(
        typeof result.message === 'string' && result.message.trim().length > 0,
        `[472-03] 等级越词表被拒必须带非空原因文案，实际 message=${JSON.stringify(result.message)}`
      ).toBe(true);
      const after = await listMaterials(page, gateCardId);
      expect(
        after.length,
        `[472-03] 词表外等级被拒后不得落库：应从 ${before.length} 保持 ${before.length}，实际 ${after.length}`
      ).toBe(before.length);
    }
  });

  test('472-04 同维度多缸且投纱未登记缸号 → 完工显式拒绝', async ({ page }) => {
    const ctx = getCtx();
    const batchNo = `B-${UNIQUE}-AMBIG`;
    const colorNo = `C-${UNIQUE}-AMBIG`;
    const grade = STOCK_GRADE.first;
    const dye1 = genDyeLotNo();
    const dye2 = genDyeLotNo();
    const stock1 = await seedYarnStock(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo,
      colorNo,
      grade,
      dyeLot: dye1,
      meters: '1000',
      kg: '500',
    });
    const stock2 = await seedYarnStock(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo,
      colorNo,
      grade,
      dyeLot: dye2,
      meters: '1000',
      kg: '500',
    });
    const order = await makeOrderInProgress(page, ctx.productIds[0]);
    const cardId = await makeCard(page, order.id);
    // 投纱行整键缺席 dye_lot_no：缸号未登记，扣料无法在两个缸里收敛
    await addMaterial(page, {
      flowCardId: cardId,
      warehouseId,
      materialId: yarnProductId,
      batchNo,
      colorNo,
      grade,
      quantity: '100',
      unit: MATERIAL_UNIT.kilogram,
    });

    const result = await apiCallExpectFail(page, 'PUT', `${ORDERS}/${order.id}/status`, {
      status: PROD_ORDER_STATUS.COMPLETED,
    });
    expectCompletionRejection(result, '[472-04] 多缸歧义完工');

    expect(
      await readOrderStatus(page, order.id),
      '[472-04] 被拒完工必须整体回滚，订单状态不得变成 COMPLETED'
    ).toBe(PROD_ORDER_STATUS.IN_PROGRESS);
    for (const row of [stock1, stock2]) {
      const dyeLot = String(row.dye_lot_no);
      const after = await readStockRow(page, {
        productId: yarnProductId,
        warehouseId,
        batchNo,
        colorNo,
        grade,
        dyeLot,
      });
      expect(Number(after.quantity_kg), `[472-04] 缸 ${dyeLot} 库存 kg 不应被扣减`).toBe(500);
      expect(Number(after.quantity_meters), `[472-04] 缸 ${dyeLot} 库存米数不应被扣减`).toBe(1000);
    }
  });

  test('472-05 投纱量超过命中库存行公斤列 → 完工拒绝且库存不扣负', async ({ page }) => {
    const ctx = getCtx();
    const batchNo = `B-${UNIQUE}-LOW`;
    const colorNo = `C-${UNIQUE}-LOW`;
    const grade = STOCK_GRADE.second;
    const dyeLot = genDyeLotNo();
    const stock = await seedYarnStock(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo,
      colorNo,
      grade,
      dyeLot,
      meters: '1000',
      kg: '50',
    });
    const order = await makeOrderInProgress(page, ctx.productIds[0]);
    const cardId = await makeCard(page, order.id);
    await addMaterial(page, {
      flowCardId: cardId,
      warehouseId,
      materialId: yarnProductId,
      batchNo,
      colorNo,
      grade,
      dyeLot,
      quantity: '100',
      unit: MATERIAL_UNIT.kilogram,
    });

    const result = await apiCallExpectFail(page, 'PUT', `${ORDERS}/${order.id}/status`, {
      status: PROD_ORDER_STATUS.COMPLETED,
    });
    expectCompletionRejection(result, '[472-05] 库存不足完工');

    expect(
      await readOrderStatus(page, order.id),
      '[472-05] 被拒完工必须整体回滚，订单状态不得变成 COMPLETED'
    ).toBe(PROD_ORDER_STATUS.IN_PROGRESS);
    const after = await readStockRow(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo,
      colorNo,
      grade,
      dyeLot,
    });
    expect(Number(after.quantity_kg), '[472-05] 库存不足被拒后 kg 必须保持播种值').toBe(50);
    expect(Number(after.quantity_meters), '[472-05] 库存不足被拒后米数必须保持播种值').toBe(1000);
    expect(Number(after.quantity_kg), '[472-05] 库存绝不允许被扣成负数').toBeGreaterThanOrEqual(0);
    expect(
      Number(after.id),
      `[472-05] 回读必须命中播种那一行（比主键，不比数量——数量相同也可能是同维度的另一行）`
    ).toBe(Number(stock.id));
  });

  test('472-06 软删投纱行不参与完工扣料：只扣存活行且消耗流水条数=存活行数', async ({ page }) => {
    const ctx = getCtx();
    const colorNo = `C-${UNIQUE}-SOFT`;
    const grade = STOCK_GRADE.first;
    const batchA = `B-${UNIQUE}-SOFTA`;
    const batchB = `B-${UNIQUE}-SOFTB`;
    const dyeA = genDyeLotNo();
    const dyeB = genDyeLotNo();
    await seedYarnStock(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo: batchA,
      colorNo,
      grade,
      dyeLot: dyeA,
      meters: '2000',
      kg: '1000',
    });
    await seedYarnStock(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo: batchB,
      colorNo,
      grade,
      dyeLot: dyeB,
      meters: '2000',
      kg: '1000',
    });
    const order = await makeOrderInProgress(page, ctx.productIds[0]);
    const cardId = await makeCard(page, order.id);
    const rowA = await addMaterial(page, {
      flowCardId: cardId,
      warehouseId,
      materialId: yarnProductId,
      batchNo: batchA,
      colorNo,
      grade,
      quantity: '30',
      unit: MATERIAL_UNIT.kilogram,
    });
    const rowB = await addMaterial(page, {
      flowCardId: cardId,
      warehouseId,
      materialId: yarnProductId,
      batchNo: batchB,
      colorNo,
      grade,
      quantity: '40',
      unit: MATERIAL_UNIT.kilogram,
    });
    const liveCountBefore = (await listMaterials(page, cardId)).length;
    expect(liveCountBefore, '[472-06] 登记两条投纱后回读应为 2 行').toBe(2);

    // 软删行 B：DELETE 回写作废后的行，列表读面立即不可见（软删语义本身的前置自证）
    await apiCall(page, 'DELETE', `${MATERIALS}/${Number(rowB.id)}`);
    const afterDelete = await listMaterials(page, cardId);
    expect(afterDelete.length, '[472-06] 软删后该卡投纱列表应只剩 1 行').toBe(1);
    expect(
      afterDelete.map(r => Number(r.id)),
      '[472-06] 存活的必须是被登记为 A 的那行'
    ).toEqual([Number(rowA.id)]);

    // 完工应成功：只按存活行 A 的 30kg 扣减
    await apiCall(page, 'PUT', `${ORDERS}/${order.id}/status`, {
      status: PROD_ORDER_STATUS.COMPLETED,
    });
    expect(
      await readOrderStatus(page, order.id),
      '[472-06] 前置与投纱齐备时完工应落 COMPLETED'
    ).toBe(PROD_ORDER_STATUS.COMPLETED);

    const stockA = await readStockRow(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo: batchA,
      colorNo,
      grade,
      dyeLot: dyeA,
    });
    const stockB = await readStockRow(page, {
      productId: yarnProductId,
      warehouseId,
      batchNo: batchB,
      colorNo,
      grade,
      dyeLot: dyeB,
    });
    expect(Number(stockA.quantity_kg), '[472-06] 存活行 A 对应库存应恰好扣掉 30kg').toBe(970);
    // kg 扣减后米数按命中行自身比值等比随行（completion.rs calculate_deduct_qty 口径）：
    // 2000 × 970 ÷ 1000 = 1940，断后端出参真值，不在用例里再造第二套舍入
    expect(Number(stockA.quantity_meters), '[472-06] A 行米数应等比落到 1940').toBe(1940);
    expect(Number(stockB.quantity_kg), '[472-06] 软删行 B 对应库存 kg 不得被扣').toBe(1000);
    expect(Number(stockB.quantity_meters), '[472-06] 软删行 B 对应库存米数不得被扣').toBe(2000);

    // 消耗流水条数与存活行数一致：本单在 A 批次恰 1 条、在 B 批次恰 0 条
    const consumption = async (batchNo: string): Promise<Dict[]> => {
      const path =
        `/inventory/stock/transactions?product_id=${yarnProductId}` +
        `&batch_no=${encodeURIComponent(batchNo)}&transaction_type=${TXN_TYPE_PRODUCTION_CONSUMPTION}` +
        `&page=1&page_size=100`;
      const res = await apiCallRaw<{ items?: unknown }>(page, 'GET', path);
      if (!Array.isArray(res.items)) {
        throw new Error(
          `[472-06] 流水回读 ${path} 的 data.items 不是数组，实际=${JSON.stringify(res).slice(0, 300)}`
        );
      }
      return (res.items as Dict[]).filter(r => String(r.source_bill_no ?? '') === order.orderNo);
    };
    const flowsA = await consumption(batchA);
    expect(
      flowsA.length,
      `[472-06] 订单 ${order.orderNo} 在批次 ${batchA} 的 PRODUCTION_CONSUMPTION 应恰 1 条（=存活行数）`
    ).toBe(1);
    expect(Number(flowsA[0].quantity_kg), '[472-06] 该条流水的扣减量应为存活行 A 登记的 30kg').toBe(
      30
    );
    const flowsB = await consumption(batchB);
    expect(flowsB.length, `[472-06] 软删行所在批次 ${batchB} 对本单不应产生任何消耗流水`).toBe(0);
  });
});
