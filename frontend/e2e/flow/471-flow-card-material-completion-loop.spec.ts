import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  tryCleanup,
} from './helpers';
import { pickListArray } from './ui-helpers';
// 产品类型单源常量（与后端 models/status/general.rs::product_type 同源）：
// 纱线取「辅料」，成品布取「成品布」，禁止散落中文面值自造第四种取值。
import { PRODUCT_TYPE } from '../../src/constants/product-type';

// ============================================================================
// 471 流转卡投纱 → 生产订单完工扣料闭环
//
// 功能：验证生产订单完工时按流转卡投纱明细逐行扣减纱线库存并落
// PRODUCTION_CONSUMPTION 消耗流水。BOM/MRP 已整族下线，「这块布用了什么纱、
// 纱编号、什么批次」由投纱行承载，完工扣料是唯一消费方。
//
// 被测端点（后端出处均为本仓真实路由注册，非设想稿）：
// - POST /production/flow-cards                    routes/production.rs create_flow_card
// - GET  /production/flow-cards/{cardId}/materials flow_card_material_handler::list_materials_by_card
//   （出参为裸数组 FlowCardMaterialView，snake_case 键；material_no/material_name
//    经 LEFT JOIN products 富化，column_as 范式同 PurchaseOrderDto）
// - POST /production/flow-cards/materials          flow_card_material_handler::create_material
//   （请求体键：flow_card_id/warehouse_id/material_id/batch_no/color_no/dye_lot_no/
//    grade/quantity/unit/remark；unit 只收 kg 与 m，其余建单期显式拒绝）
// - PUT  /production/production-orders/orders/{id}/status
//   状态链 DRAFT→SCHEDULED→IN_PROGRESS→COMPLETED（production_order_ops/crud.rs 的
//   validate_status_transition 与 handler 白名单逐字一致；COMPLETED 走事务内
//   complete_production_order）
// - POST /inventory/stock/fabric                   纱线库存行直建（色号非空必须带缸号，
//   判定权威 services/inv/fabric_class.rs::validate_fabric_trace）
// - GET  /inventory/stock                          库存行回读（quantity_meters/quantity_kg
//   为 DECIMAL 出参，rust_decimal serde 序列化为字符串）
// - GET  /inventory/stock/transactions             消耗流水回读（TransactionResponse 投影
//   不含 dye_lot_no 与 grade，见下方「投影盲区」）
//
// 断言纪律（防假绿）：
// - 前置全部本文件自建且带唯一后缀（genCode），不依赖库中恰好存在的行；
// - 数值断言打在回读的真实落库值上（GET /inventory/stock 与流水列表），不打在刚发的请求体；
// - 流水归属按 source_bill_no（服务端生成的生产订单号，本用例唯一）聚合，天然隔离并发污染源；
// - DECIMAL 线格式：出参量为字符串，统一 Number() 后比较，用例内不再造一次舍入；
//   所选造数值均为十进制精确值（1000/10000/900/700 等），round_dp(4) 不产生尾差。
//
// 投影盲区（如实声明，不掩盖）：
// 流水表实体有 dye_lot_no 与 grade 两列且扣料侧按「实际命中库存行」写入
// （completion.rs::record_production_consumption），但读端点投影 TransactionResponse
// 未携带这两键，HTTP 面不可断言。本用例以「流水 quantity_before_kg/quantity_before_meters
// 逐字等于命中行完工前回读值」钉住流水生成源是那一条库存行（缸号/等级维度随该行唯一确定），
// 并在断言消息里点名该盲区。
//
// 派工口径偏差（已登记，不自迁就源码）：
// 「投纱为空拒完工时 message 含订单号」与现状不符——完工拒绝用 AppError::business
// （非 Displayable），utils/error.rs 的 public_message 对该族恒回退脱敏常量
// 「业务处理失败」，订单号只进服务端日志。本用例按已落地真实现断言：HTTP 400 +
// code=BUSINESS_ERROR + 信封 trace_id/timestamp 齐全 + message 为非空字符串 +
// 订单状态未被改动；订单号外显与否留待调度与后端实例裁定，不写死任一形态。
// ============================================================================

type Row = Record<string, unknown>;

// 每用例一份的清理登记（flow 项目串行执行，afterEach 倒序 best-effort 删除；
// 完工/审批后被引用而删不掉属既有守门行为，tryCleanup 会显式 warn 而非静默）
const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

/**
 * DECIMAL 出参读数：键必须存在且为字符串或数字，否则当场点名——缺键不许按 0 计。
 * 入参：后端 JSON 行 + 键名 + 断言上下文标签；传给谁：本文件全部数值断言。不落库。
 */
function decNum(row: Row, key: string, label: string): number {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(
      `${label}：后端出参缺键 ${key}（该列是实体必出字段），实际 ${JSON.stringify(row).slice(0, 400)}`
    );
  }
  const v = row[key];
  if (typeof v !== 'string' && typeof v !== 'number') {
    throw new Error(`${label}：键 ${key} 出参类型不是数字或数字字符串，实际 ${JSON.stringify(v)}`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}：键 ${key} 出参 ${JSON.stringify(v)} 不是合法十进制值`);
  }
  return n;
}

/** 必出字符串键读取：缺键或类型不符即点名（软删标记 is_deleted 等布尔位单独核） */
function strField(row: Row, key: string, label: string): string {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(`${label}：后端出参缺键 ${key}，实际 ${JSON.stringify(row).slice(0, 400)}`);
  }
  const v = row[key];
  if (typeof v !== 'string') {
    throw new Error(`${label}：键 ${key} 出参不是字符串，实际 ${JSON.stringify(v)}`);
  }
  return v;
}

function idOf(row: Row | undefined, label: string): number {
  const id = Number(row?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label}：未取得有效主键，响应 ${JSON.stringify(row).slice(0, 240)}`);
  }
  return id;
}

/** 库存行回读：按 产品×仓库×批次 三维现查，批次比较用等值（不信任列表端 like 语义），命中数必须恰 1 */
async function readStockRow(
  page: import('@playwright/test').Page,
  productId: number,
  warehouseId: number,
  batchNo: string,
  label: string
): Promise<Row> {
  const raw = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=50`
  );
  const items = pickListArray<Row>(raw, 'items', `${label} 库存列表回读`);
  const rows = items.filter(
    r => Number(r.product_id) === productId && String(r.batch_no) === batchNo
  );
  expect(
    rows.length,
    `${label}：按 产品${productId}×仓库${warehouseId}×批次${batchNo} 应恰命中 1 行，实际 ${rows.length}，列表 ${JSON.stringify(items).slice(0, 600)}`
  ).toBe(1);
  return rows[0];
}

/** 消耗流水回读：按 产品×批次×类型 现查后，再以 source_bill_no（服务端订单号）锁定本用例贡献行 */
async function readConsumptionTxns(
  page: import('@playwright/test').Page,
  productId: number,
  batchNo: string,
  orderNo: string,
  label: string
): Promise<Row[]> {
  const raw = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/stock/transactions?product_id=${productId}` +
      `&batch_no=${encodeURIComponent(batchNo)}&transaction_type=PRODUCTION_CONSUMPTION&page=1&page_size=100`
  );
  const all = pickListArray<Row>(raw, 'items', `${label} 消耗流水回读`);
  return all.filter(r => String(r.source_bill_no) === orderNo);
}

/**
 * 生产订单状态推进：COMPLETED 之外的每一步都回读状态，门值与写入方逐字符一致
 * （大写 DRAFT/SCHEDULED/IN_PROGRESS/COMPLETED，词表唯一来源 models/status）。
 */
async function pushOrderStatus(
  page: import('@playwright/test').Page,
  orderId: number,
  status: 'SCHEDULED' | 'IN_PROGRESS',
  label: string
): Promise<void> {
  const resp = await apiCallRaw<Row>(
    page,
    'PUT',
    `/production/production-orders/orders/${orderId}/status`,
    { status }
  );
  expect(
    strField(resp, 'status', `${label} 状态推进回读`),
    `${label}：PUT status=${status} 后出参状态必须逐字等于 ${status}（状态门未生效的显式证据）`
  ).toBe(status);
}

/** 自建一处专属仓库，避免与并发用例共用仓库维度造成库存定位歧义 */
async function seedWarehouse(page: import('@playwright/test').Page): Promise<number> {
  const code = genCode('E2E471W');
  const created = await apiCallRaw<Row>(page, 'POST', '/warehouses', {
    name: `E2E471仓${code}`,
    code,
  });
  const id = idOf(created, '[471] 仓库创建');
  CLEANUP.push({ path: `/warehouses/${id}`, label: '[471] 仓库' });
  return id;
}

/** 分类取用前置：优先复用库中任一分类（主数据只读引用），为空则自建，不依赖种子恰好存在 */
async function seedCategory(page: import('@playwright/test').Page): Promise<number> {
  const cats = await apiCallRaw<unknown>(page, 'GET', '/product-categories?page=1&page_size=5');
  const items = pickListArray<Row>(cats, 'items', '[471] 产品分类列表');
  if (items.length > 0) {
    return idOf(items[0], '[471] 既有产品分类');
  }
  const code = genCode('E2E471C');
  const created = await apiCallRaw<Row>(page, 'POST', '/product-categories', {
    name: `E2E471类别${code}`,
    code,
  });
  return idOf(created, '[471] 产品分类自建');
}

/** 自建纱线产品（辅料类，免面料三键），返回主键与编码——编码是流水/投纱读面 material_no 的比对源 */
async function seedYarnProduct(
  page: import('@playwright/test').Page,
  categoryId: number
): Promise<{ id: number; code: string; name: string }> {
  const code = genCode('E2E471Y');
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E471纱线${code}`,
    unit: '公斤',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = idOf(created, '[471] 纱线产品创建');
  CLEANUP.push({ path: `/products/${id}`, label: '[471] 纱线产品' });
  return { id, code, name: strField(created, 'name', '[471] 纱线产品名回读') };
}

/** 自建成品布产品（面料类必带成分/克重/幅宽，否则被 validate_product_create_fields 拒） */
async function seedClothProduct(
  page: import('@playwright/test').Page,
  categoryId: number
): Promise<number> {
  const code = genCode('E2E471P');
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E2E471成品布${code}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.finished,
    fabric_composition: '100%涤纶',
    gram_weight: 180,
    width: 150,
    meters_per_piece: 50,
  });
  const id = idOf(created, '[471] 成品布产品创建');
  CLEANUP.push({ path: `/products/${id}`, label: '[471] 成品布产品' });
  return id;
}

interface OrderFixture {
  warehouseId: number;
  yarnId: number;
  yarnCode: string;
  yarnName: string;
  orderId: number;
  orderNo: string;
  cardId: number;
}

/**
 * 闭环公共前置：仓库 + 纱线 + 成品布 + 生产订单（推到 IN_PROGRESS）+ 流转卡。
 * 订单号取服务端建单响应回填的 order_no（单据号由服务端取号，前端不提交该键），
 * 它是后续流水归属聚合与「投纱为空拒完工」文案判据的比对源。
 */
async function seedOrderChain(page: import('@playwright/test').Page): Promise<OrderFixture> {
  const warehouseId = await seedWarehouse(page);
  const categoryId = await seedCategory(page);
  const yarn = await seedYarnProduct(page, categoryId);
  const clothId = await seedClothProduct(page, categoryId);

  const order = await apiCallRaw<Row>(page, 'POST', '/production/production-orders/orders', {
    product_id: clothId,
    planned_quantity: 100,
    priority: 1,
  });
  const orderId = idOf(order, '[471] 生产订单创建');
  const orderNo = strField(order, 'order_no', '[471] 生产订单服务端取号回读');
  expect(
    orderNo.length,
    `[471] 生产订单号应由服务端回填且非空，实际 ${JSON.stringify(order).slice(0, 200)}`
  ).toBeGreaterThanOrEqual(2);
  CLEANUP.push({
    path: `/production/production-orders/orders/${orderId}`,
    label: '[471] 生产订单',
  });

  await pushOrderStatus(page, orderId, 'SCHEDULED', '[471] 排产');
  await pushOrderStatus(page, orderId, 'IN_PROGRESS', '[471] 开工');

  const card = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards', {
    production_order_id: orderId,
  });
  const cardId = idOf(card, '[471] 流转卡创建');
  CLEANUP.push({ path: `/production/flow-cards/${cardId}`, label: '[471] 流转卡' });

  return {
    warehouseId,
    yarnId: yarn.id,
    yarnCode: yarn.code,
    yarnName: yarn.name,
    orderId,
    orderNo,
    cardId,
  };
}

/** 库存行自建：色号非空必须同带缸号（validate_fabric_trace 联动必填），米/公斤两列显式传入不被换算覆盖 */
async function seedStockRow(
  page: import('@playwright/test').Page,
  fx: OrderFixture,
  dims: { batchNo: string; colorNo: string; dyeLotNo: string; grade: string },
  meters: string,
  kg: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: fx.warehouseId,
    product_id: fx.yarnId,
    batch_no: dims.batchNo,
    color_no: dims.colorNo,
    dye_lot_no: dims.dyeLotNo,
    grade: dims.grade,
    quantity_meters: meters,
    quantity_kg: kg,
  });
  const id = idOf(created, '[471] 纱线库存行创建');
  CLEANUP.push({ path: `/inventory/stock/${id}`, label: '[471] 纱线库存行' });
  return id;
}

/** 投纱行登记：请求体键与 CreateFlowCardMaterialRequest 逐字一致 */
async function seedMaterial(
  page: import('@playwright/test').Page,
  fx: OrderFixture,
  dims: { batchNo: string; colorNo: string; dyeLotNo: string; grade: string },
  quantity: string,
  unit: 'kg' | 'm'
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards/materials', {
    flow_card_id: fx.cardId,
    warehouse_id: fx.warehouseId,
    material_id: fx.yarnId,
    batch_no: dims.batchNo,
    color_no: dims.colorNo,
    dye_lot_no: dims.dyeLotNo,
    grade: dims.grade,
    quantity,
    unit,
  });
  const id = idOf(created, '[471] 投纱行创建');
  CLEANUP.push({ path: `/production/flow-cards/materials/${id}`, label: '[471] 投纱行' });
  return id;
}

/** 完工：actual_quantity 显式传字符串 Decimal（handler DTO 按 Option<String> 解析） */
async function completeOrder(page: import('@playwright/test').Page, orderId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'PUT', `/production/production-orders/orders/${orderId}/status`, {
    status: 'COMPLETED',
    actual_quantity: '100',
  });
}

test.describe('流转卡投纱到生产订单完工扣料闭环', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('471-01 kg 口径闭环：投纱100kg 完工后公斤列净减100、米数按命中行自身比值等比、消耗流水逐字对命中行', async ({
    page,
  }) => {
    const fx = await seedOrderChain(page);
    const dims = {
      batchNo: genCode('E2E471B1'),
      colorNo: genCode('E2E471C'),
      dyeLotNo: genCode('E2E471D'),
      grade: '一等品',
    };
    await seedStockRow(page, fx, dims, '10000', '1000');
    const before = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      dims.batchNo,
      '471-01 完工前'
    );
    const preKg = decNum(before, 'quantity_kg', '471-01 完工前公斤数');
    const preM = decNum(before, 'quantity_meters', '471-01 完工前米数');
    expect(preKg, '471-01 前置落库公斤数应为自建值 1000（回读不成立即前置失真）').toBe(1000);
    expect(preM, '471-01 前置落库米数应为自建值 10000').toBe(10000);

    await seedMaterial(page, fx, dims, '100', 'kg');

    // 投纱读面回读（GET materials 裸数组）：键名与 FlowCardMaterialView 序列化逐字核对，
    // material_no/material_name 必须等于纱线档案编码与名称（LEFT JOIN 富化真实生效，非自造名）。
    const viewRows = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', `/production/flow-cards/${fx.cardId}/materials`),
      'bare',
      '471-01 投纱列表回读'
    );
    expect(viewRows.length, '471-01 该卡投纱应恰 1 行').toBe(1);
    const view = viewRows[0];
    expect(Number(view.flow_card_id), '471-01 投纱行 flow_card_id 应等于所建卡').toBe(fx.cardId);
    expect(String(view.batch_no), '471-01 投纱行批次回读应等于登记值').toBe(dims.batchNo);
    expect(String(view.grade), '471-01 投纱行等级回读应为中文词表原值').toBe('一等品');
    expect(String(view.unit), '471-01 投纱行单位回读应为 kg').toBe('kg');
    expect(decNum(view, 'quantity', '471-01 投纱量回读'), '471-01 投纱量落库应等于登记 100').toBe(
      100
    );
    expect(String(view.material_no), '471-01 纱编号应由产品档案带出').toBe(fx.yarnCode);
    expect(String(view.material_name), '471-01 纱名称应由产品档案带出').toBe(fx.yarnName);

    const completed = await completeOrder(page, fx.orderId);
    expect(
      strField(completed, 'status', '471-01 完工响应状态'),
      '471-01 完工响应状态应为 COMPLETED'
    ).toBe('COMPLETED');

    // 库存回读：公斤列净减恰为投纱量（绝对投入量，不乘生产数量）；
    // 米数按命中行自身比值等比随行：afterM × preKg == preM × afterKg（所选值十进制精确）。
    const after = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      dims.batchNo,
      '471-01 完工后'
    );
    const postKg = decNum(after, 'quantity_kg', '471-01 完工后公斤数');
    const postM = decNum(after, 'quantity_meters', '471-01 完工后米数');
    expect(postKg, `471-01 公斤列应净减 100（${preKg}→${preKg - 100}），实际 ${postKg}`).toBe(
      preKg - 100
    );
    expect(
      postM,
      `471-01 米数应随命中行比值等比收敛：${preM}×${postKg}/${preKg}=${(preM * postKg) / preKg}，实际 ${postM}`
    ).toBe((preM * postKg) / preKg);

    // 消耗流水：按 source_bill_no=订单号聚合，必须恰 1 条（多条即重复扣减）。
    const txns = await readConsumptionTxns(page, fx.yarnId, dims.batchNo, fx.orderNo, '471-01');
    expect(
      txns.length,
      `471-01 订单 ${fx.orderNo} 名下 PRODUCTION_CONSUMPTION 流水应恰 1 条（计数按订单号聚合，天然隔离并发污染）`
    ).toBe(1);
    const txn = txns[0];
    expect(String(txn.transaction_type), '471-01 流水类型应为 PRODUCTION_CONSUMPTION').toBe(
      'PRODUCTION_CONSUMPTION'
    );
    // 定位维度中 HTTP 投影可见的两维（批次/色号）逐字等于命中库存行；
    // 缸号与等级两维读端点不投影（见文件头「投影盲区」），由下方「扣前量==命中行完工前回读」钉来源。
    expect(String(txn.batch_no), '471-01 流水批次必须取自命中的库存行').toBe(dims.batchNo);
    expect(String(txn.color_no), '471-01 流水色号必须取自命中的库存行').toBe(dims.colorNo);
    expect(Number(txn.product_id), '471-01 流水产品维度应为纱线本身而非成品布').toBe(fx.yarnId);
    expect(Number(txn.warehouse_id), '471-01 流水仓库应为投纱登记的仓库').toBe(fx.warehouseId);
    expect(strField(txn, 'source_bill_type', '471-01 流水来源单据类型')).toBe('production_order');
    expect(String(txn.source_bill_no), '471-01 流水 source_bill_no 应为生产订单号').toBe(
      fx.orderNo
    );
    expect(
      decNum(txn, 'quantity_kg', '471-01 流水扣减公斤量'),
      '471-01 kg 口径流水应记 100 公斤'
    ).toBe(100);
    expect(
      decNum(txn, 'quantity_meters', '471-01 流水扣减米量'),
      '471-01 kg 口径流水米列应为 0（不折米）'
    ).toBe(0);
    // 流水前后值 == 命中行完工前/后回读值（账实同一刻度零差；缸号/等级盲区来源钉定在此）
    expect(decNum(txn, 'quantity_before_kg', '471-01 流水扣前公斤')).toBe(preKg);
    expect(decNum(txn, 'quantity_after_kg', '471-01 流水扣后公斤')).toBe(postKg);
    expect(decNum(txn, 'quantity_before_meters', '471-01 流水扣前米数')).toBe(preM);
    expect(decNum(txn, 'quantity_after_meters', '471-01 流水扣后米数')).toBe(postM);
  });

  test('471-02 m 口径闭环：投纱3000米扣的是米数列，公斤按命中行比值随行、绝不按米折算公斤', async ({
    page,
  }) => {
    const fx = await seedOrderChain(page);
    const dims = {
      batchNo: genCode('E2E471B2'),
      colorNo: genCode('E2E471C'),
      dyeLotNo: genCode('E2E471D'),
      grade: '一等品',
    };
    await seedStockRow(page, fx, dims, '10000', '1000');
    const before = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      dims.batchNo,
      '471-02 完工前'
    );
    const preKg = decNum(before, 'quantity_kg', '471-02 完工前公斤数');
    const preM = decNum(before, 'quantity_meters', '471-02 完工前米数');

    await seedMaterial(page, fx, dims, '3000', 'm');
    const viewRows = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', `/production/flow-cards/${fx.cardId}/materials`),
      'bare',
      '471-02 投纱列表回读'
    );
    expect(viewRows.length, '471-02 该卡投纱应恰 1 行').toBe(1);
    expect(String(viewRows[0].unit), '471-02 投纱单位回读应为 m').toBe('m');

    await completeOrder(page, fx.orderId);

    const after = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      dims.batchNo,
      '471-02 完工后'
    );
    const postM = decNum(after, 'quantity_meters', '471-02 完工后米数');
    const postKg = decNum(after, 'quantity_kg', '471-02 完工后公斤数');
    // 主判据：米数列净减恰为投纱量（绝对投入量）。
    expect(postM, `471-02 米数列应净减 3000（${preM}→${preM - 3000}），实际 ${postM}`).toBe(
      preM - 3000
    );
    // 「不按米去折公斤」的可分辨性：本行比值 10 米/公斤 由用例自建，与产品档案克重×幅宽
    // （180g/m²×150cm 的换算系数）无任何同源关系——若实现按米×折算系数扣公斤或原样把 3000
    // 当公斤扣，公斤列会落 -2000/其它值而被下一行显式拦下。正确口径只有命中行自身比值：
    expect(
      postKg,
      `471-02 公斤应按命中行自身比值随行：${preKg}×${postM}/${preM}=${(preKg * postM) / preM}，实际 ${postKg}`
    ).toBe((preKg * postM) / preM);
    expect(postKg, '471-02 公斤列不得原封不动（扣米必牵动该列）').not.toBe(preKg);

    const txns = await readConsumptionTxns(page, fx.yarnId, dims.batchNo, fx.orderNo, '471-02');
    expect(txns.length, '471-02 消耗流水应恰 1 条').toBe(1);
    const txn = txns[0];
    expect(
      decNum(txn, 'quantity_meters', '471-02 流水扣减米量'),
      '471-02 m 口径流水应记 3000 米'
    ).toBe(3000);
    expect(
      decNum(txn, 'quantity_kg', '471-02 流水扣减公斤量'),
      '471-02 m 口径流水扣减公斤量列应为 0（未被折算）'
    ).toBe(0);
    expect(decNum(txn, 'quantity_before_meters', '471-02 流水扣前米数')).toBe(preM);
    expect(decNum(txn, 'quantity_after_meters', '471-02 流水扣后米数')).toBe(postM);
    expect(decNum(txn, 'quantity_before_kg', '471-02 流水扣前公斤')).toBe(preKg);
    expect(decNum(txn, 'quantity_after_kg', '471-02 流水扣后公斤')).toBe(postKg);
  });

  test('471-03 批次维度不被折平：同纱同仓两批次仅命中投纱批次那一行，另一行分毫不动、流水批次为命中行', async ({
    page,
  }) => {
    const fx = await seedOrderChain(page);
    const colorNo = genCode('E2E471C');
    const b1 = {
      batchNo: genCode('E2E471B1'),
      colorNo,
      dyeLotNo: genCode('E2E471D1'),
      grade: '一等品',
    };
    const b2 = {
      batchNo: genCode('E2E471B2'),
      colorNo,
      dyeLotNo: genCode('E2E471D2'),
      grade: '一等品',
    };
    await seedStockRow(page, fx, b1, '5000', '500');
    await seedStockRow(page, fx, b2, '6000', '600');

    const before1 = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      b1.batchNo,
      '471-03 批1完工前'
    );
    const before2 = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      b2.batchNo,
      '471-03 批2完工前'
    );

    // 投纱只登记第一批；第二批与第一批在 仓库×纱线×色号×等级 四维全同，
    // 若实现把批次折平（或按四维聚合取任意一行），第二批会被错扣或两行各扣一半。
    await seedMaterial(page, fx, b1, '100', 'kg');
    await completeOrder(page, fx.orderId);

    const after1 = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      b1.batchNo,
      '471-03 批1完工后'
    );
    const after2 = await readStockRow(
      page,
      fx.yarnId,
      fx.warehouseId,
      b2.batchNo,
      '471-03 批2完工后'
    );

    const pre1Kg = decNum(before1, 'quantity_kg', '471-03 批1完工前公斤');
    const post1Kg = decNum(after1, 'quantity_kg', '471-03 批1完工后公斤');
    expect(post1Kg, `471-03 命中批次应净减 100：${pre1Kg}→${pre1Kg - 100}，实际 ${post1Kg}`).toBe(
      pre1Kg - 100
    );
    const pre1M = decNum(before1, 'quantity_meters', '471-03 批1完工前米数');
    const post1M = decNum(after1, 'quantity_meters', '471-03 批1完工后米数');
    expect(post1M, '471-03 命中批次米数应随该行自身比值变化').toBe((pre1M * post1Kg) / pre1Kg);

    expect(decNum(after2, 'quantity_kg', '471-03 未命中批次公斤')).toBe(
      decNum(before2, 'quantity_kg', '471-03 完工前公斤')
    );
    expect(decNum(after2, 'quantity_meters', '471-03 未命中批次米数')).toBe(
      decNum(before2, 'quantity_meters', '471-03 完工前米数')
    );

    const txns = await readConsumptionTxns(page, fx.yarnId, b1.batchNo, fx.orderNo, '471-03 批1');
    expect(txns.length, '471-03 按投纱批次聚合的消耗流水应恰 1 条').toBe(1);
    expect(String(txns[0].batch_no), '471-03 流水批次必须是命中那一行的批次，不能折平').toBe(
      b1.batchNo
    );
    // 折平的另一种形态是流水挂到第二批：按第二批现查消耗流水必须 0 条。
    const txns2 = await readConsumptionTxns(page, fx.yarnId, b2.batchNo, fx.orderNo, '471-03 批2');
    expect(txns2.length, '471-03 未投纱批次名下不得出现本订单的消耗流水').toBe(0);
  });

  test('471-04 投纱为空拒完工：完工 400 BUSINESS_ERROR 且订单状态未被改动，门真正挡住', async ({
    page,
  }) => {
    const fx = await seedOrderChain(page);
    // 不登记任何投纱行，直接完工。
    const fail = await apiCallExpectFail(
      page,
      'PUT',
      `/production/production-orders/orders/${fx.orderId}/status`,
      { status: 'COMPLETED', actual_quantity: '100' }
    );
    expect(
      fail.status,
      `471-04 无投纱完工必须被拒（预期 400），实际 status=${fail.status} body=${JSON.stringify(fail).slice(0, 300)}`
    ).toBe(400);
    expect(
      failureCode(fail),
      `471-04 拒绝机器码应为 BUSINESS_ERROR（AppError 失败信封 code 为字符串），实际 ${JSON.stringify(fail).slice(0, 300)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    // 统一失败信封四键齐全：message 非空字符串 + trace_id + timestamp。
    // 注意：派工单称「message 含订单号」，而完工侧构造的是 AppError::business（非 Displayable），
    // public_message 对该族恒回退脱敏常量「业务处理失败」，订单号只进服务端日志——
    // 该口径分歧已随交付登记，本断言不写死任一形态，只核文案非空。
    expect(
      typeof fail.message === 'string' && fail.message.length > 0,
      `471-04 失败信封 message 必须为非空字符串，实际 ${JSON.stringify(fail.message)}`
    ).toBe(true);
    expect(
      typeof fail.trace_id === 'string' && fail.trace_id.length > 0,
      `471-04 失败信封应携带 trace_id，实际 ${JSON.stringify(fail).slice(0, 300)}`
    ).toBe(true);
    const ts = Number(fail.timestamp);
    expect(
      Number.isFinite(ts) && ts > 0,
      `471-04 失败信封 timestamp 键必须为正的数值纪元（ErrorResponse.timestamp 为 i64），实际 ${JSON.stringify(fail.timestamp)}`
    ).toBe(true);

    // 门真正挡住的判据：完工失败后订单状态回读必须仍为 IN_PROGRESS（事务回滚，状态未被改动）。
    const detail = await apiCallRaw<Row>(
      page,
      'GET',
      `/production/production-orders/orders/${fx.orderId}`
    );
    expect(
      strField(detail, 'status', '471-04 拒完工后订单状态回读'),
      '471-04 投纱为空被拒后订单状态不得变成 COMPLETED（只报错不改状态才算门生效）'
    ).toBe('IN_PROGRESS');

    // 拒完工不留流水：该订单名下 PRODUCTION_CONSUMPTION 消耗必须 0 条（回读现查，不按请求体推断）。
    const raw = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${fx.yarnId}&transaction_type=PRODUCTION_CONSUMPTION&page=1&page_size=100`
    );
    const all = pickListArray<Row>(raw, 'items', '471-04 消耗流水回读');
    expect(
      all.filter(r => String(r.source_bill_no) === fx.orderNo).length,
      `471-04 被拒完工不得留下任何消耗流水（该纱产品名下按订单 ${fx.orderNo} 聚合应 0 条）`
    ).toBe(0);
  });
});
