import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  expectDenied,
  failureCode,
  genCode,
  loginAsRole,
  loginViaUI,
  tryCleanup,
} from './helpers';
import { pickListArray } from './ui-helpers';
// 受控取值单源：投纱计量单位、库存等级、产品类型三张词表的唯一前端真相源，
// 用例比较点一律取常量本身（中文等级词表禁止英文化），禁止在 spec 里另抄取值。
import { MATERIAL_UNIT, type MaterialUnitValue } from '../../src/constants/yarn-input-unit';
import { STOCK_GRADE } from '../../src/constants/stock-grade';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

// ============================================================================
// 480 BOM 下线后「流转卡投纱明细驱动的物料缺料需求链路」补测
//
// 功能。BOM/MRP 整族下线后，物料短缺域保留、需求源从 BOM 换成流转卡投纱明细：
// 本 spec 把「投纱明细→需求量→缺料预警生成/更新→阈值定级→按实体键回读」这条
// 原本零验证的链路钉成可复演的 HTTP 契约。缺料真表是 material_shortage_alerts 与
// material_shortage_threshold_configs（仓库里没有 material_shortages 这张表）。
//
// 调用方。Playwright 收集器按 flow 目录发现本 spec；beforeEach 用 loginViaUI 注入
// worker（admin）会话；归属腿用 loginAsRole 切到 warehouse_keeper 后回切。
//
// 入参。检测/汇总走 POST /material-shortage/check，请求体 ShortageCheckRequest
// （product_ids 过滤的是生产订单的成品布 product_id，不是纱线；threshold 覆写时按
// ShortageThresholdConfig 的 safety_factor/critical_threshold/severe_threshold 三键）；
// 投纱登记走 POST /production/flow-cards/materials（键与 CreateFlowCardMaterialRequest 逐字一致）；
// 状态回写走 PUT /material-shortage/{material_id}/status（:id 语义为 material_id）。
//
// 传给谁。需求源落 services/material_shortage_service.rs::detect_shortages →
// fetch_active_orders（仅 SCHEDULED/IN_PROGRESS 生产订单）→ fetch_flow_card_yarn_rows
// （活跃订单名下未软删流转卡的未软删投纱行）→ compute_material_requirements（投纱 quantity
// 直接累加为绝对需求量，不乘计划数量）→ build_shortage_items（available 取库存
// quantity_available+quantity_incoming，仅 stock_status=NORMAL 且 quality_status=PASS）→
// persist_alerts 落 material_shortage_alerts。
//
// 存什么。material_shortage_alerts 的 alert_no（MS- 前缀服务端取号）、material_id、
// required_quantity/available_quantity/shortage_quantity/deficit_rate、level（Critical/
// Severe/Warning/Normal）、status（identified→…→resolved）、affected_orders_count、unit、
// identified_at/resolved_at；material_shortage_threshold_configs 单行 id=1 的三阈值列。
//
// 存哪里。PostgreSQL public.material_shortage_alerts 与 public.material_shortage_threshold_configs
// （建表见 migration v15 的缺料预警段）；纱线库存行落 public.inventory_stocks（quantity_available
// 在面料直建里等于米数列），投纱行落 public.flow_card_materials。专属成品布/纱线产品与批次
// 带本 spec 唯一后缀（genCode）隔离并发车道；阈值单行改后在本用例内恢复原值。
//
// 假绿防线。前置全部本文件自建且唯一后缀（专属成品布把 check 收口到只含本支订单，
// 需求量/可用量/缺口由此确定，杜绝复用共享成品布把别支订单需求扫进来）；数值断言打在 GET
// 回读的落库面或 detect 重算面，不打在刚发的请求体；读面出参逐字段按 alert_model::Model /
// ShortageAlertView 的真实 snake_case 键名断，不自创键；成本/金额脱敏用 hasOwnProperty
// 正向钉「该键恒不在」，不写成取不到就算通过；归属腿 expectDenied 双钉 HTTP 403 + 字符串
// 机器码 FORBIDDEN，排除 CSRF 冒名；全程无 try/catch 吞失败、无 ?? 兜底掩盖缺键、无 skip。
// ============================================================================

type Row = Record<string, unknown>;

// 每用例一份的清理登记（flow 串行执行，afterEach 倒序 best-effort 删除；
// 完工/审批后被引用而删不掉属既有守门行为，tryCleanup 显式 warn 而非静默）
const CLEANUP: Array<{ path: string; label: string }> = [];

test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) {
    await tryCleanup(page, 'DELETE', c.path, c.label);
  }
  CLEANUP.length = 0;
});

// ---- 缺料读面/写面路径（相对 baseURL=/api/v1/erp，与 routes/mod.rs material_shortage_routes 逐字符一致）----
const MS_ALERTS = '/material-shortage/alerts';
const MS_SUMMARY = '/material-shortage/summary';
const MS_CHECK = '/material-shortage/check';
const MS_THRESHOLD = '/material-shortage/threshold';

// ---- 状态词表写入方原值（唯一来源 backend/src/models/status/purchase_inventory.rs）----
const SHORTAGE_STATUS = {
  identified: 'identified',
  purchaseRequest: 'purchase_request',
  resolved: 'resolved',
} as const;

// ---- 缺料级别落库值（唯一来源 services/material_shortage_service.rs::ShortageLevel::as_str）----
const SHORTAGE_LEVEL = {
  critical: 'Critical',
  severe: 'Severe',
  warning: 'Warning',
  normal: 'Normal',
} as const;

// 成本/金额类候选键黑名单：脱敏腿用 hasOwnProperty 正向钉这些键在任何缺料读面行里恒不出现。
// 之所以是「候选」而非「源码里确有再隐藏」：缺料三读面当前根本不投影任何成本列，见 480-04 缺口登记。
const COST_TOKENS = [
  'unit_cost',
  'cost_price',
  'standard_price',
  'price',
  'amount',
  'total_amount',
  'cost',
  'supplier_price',
  'avg_cost',
  'purchase_price',
];

/** DECIMAL 出参读数：键必须存在且为数字或数字字符串，否则当场点名——缺键不许按 0 计。 */
function decNum(row: Row, key: string, label: string): number {
  if (!Object.prototype.hasOwnProperty.call(row, key)) {
    throw new Error(
      `${label}：后端出参缺键 ${key}（缺料实体/视图的必出字段），实际 ${JSON.stringify(row).slice(0, 400)}`
    );
  }
  const v = row[key];
  if (typeof v !== 'string' && typeof v !== 'number') {
    throw new Error(`${label}：键 ${key} 出参不是数字或数字字符串，实际 ${JSON.stringify(v)}`);
  }
  const n = Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}：键 ${key} 出参 ${JSON.stringify(v)} 不是合法十进制值`);
  }
  return n;
}

/** 必出字符串键读取：缺键或类型不符即点名。 */
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

/** 键存在性断言（不读取值）：alert_no/unit 等可空列用 hasOwnProperty 先钉住键本身在不在。 */
function hasKey(row: Row, key: string, label: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function idOf(row: Row | undefined, label: string): number {
  const id = Number(row?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label}：未取得有效主键，响应 ${JSON.stringify(row).slice(0, 240)}`);
  }
  return id;
}

/** 自建专属仓库，隔离库存定位维度，避免与并发用例共用仓库。 */
async function seedWarehouse(page: Page): Promise<number> {
  const code = genCode('E480W');
  const created = await apiCallRaw<Row>(page, 'POST', '/warehouses', {
    name: `E480仓${code}`,
    code,
  });
  const id = idOf(created, '[480] 仓库创建');
  CLEANUP.push({ path: `/warehouses/${id}`, label: '[480] 仓库' });
  return id;
}

/** 自建纱线产品（辅料类，免面料三键）。id 是缺料读面 material_id 的比对源，code 是 material_code 的比对源。 */
async function seedYarn(
  page: Page,
  categoryId: number
): Promise<{ id: number; code: string; name: string }> {
  const code = genCode('E480Y');
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E480纱线${code}`,
    unit: '公斤',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = idOf(created, '[480] 纱线产品创建');
  CLEANUP.push({ path: `/products/${id}`, label: '[480] 纱线产品' });
  return { id, code, name: strField(created, 'name', '[480] 纱线名回读') };
}

/**
 * 自建专属成品布产品（面料类必带成分/克重/幅宽）。它是生产订单的母体，
 * check 的 product_ids 过滤按订单 product_id 收口——用专属成品布才能保证
 * 只把本支订单扫进需求，不把别支并发车道复用共享成品布的订单需求混进来。
 */
async function seedCloth(page: Page, categoryId: number): Promise<number> {
  const code = genCode('E480P');
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E480成品布${code}`,
    unit: '米',
    category_id: categoryId,
    product_type: PRODUCT_TYPE.finished,
    fabric_composition: '100%涤纶',
    gram_weight: 180,
    width: 150,
    meters_per_piece: 50,
  });
  const id = idOf(created, '[480] 成品布产品创建');
  CLEANUP.push({ path: `/products/${id}`, label: '[480] 成品布产品' });
  return id;
}

/** 分类取用前置：优先复用库中任一分类（主数据只读引用），为空则自建。 */
async function seedCategory(page: Page): Promise<number> {
  const cats = await apiCallRaw<unknown>(page, 'GET', '/product-categories?page=1&page_size=5');
  const items = pickListArray<Row>(cats, 'items', '[480] 产品分类列表');
  if (items.length > 0) {
    return idOf(items[0], '[480] 既有产品分类');
  }
  const code = genCode('E480C');
  const created = await apiCallRaw<Row>(page, 'POST', '/product-categories', {
    name: `E480类别${code}`,
    code,
  });
  return idOf(created, '[480] 产品分类自建');
}

async function pushOrderStatus(
  page: Page,
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
    `${label}：PUT status=${status} 后出参状态必须逐字等于 ${status}`
  ).toBe(status);
}

interface DemandChain {
  warehouseId: number;
  categoryId: number;
  yarn: { id: number; code: string; name: string };
  clothId: number;
  orderId: number;
  orderNo: string;
  cardId: number;
}

/**
 * 缺料需求链路公共前置：专属仓库 + 纱线 + 成品布 + 生产订单（推到 IN_PROGRESS）+ 流转卡。
 * 订单号取服务端建单响应回填的 order_no（单据号服务端取号），是 affected_orders 归属聚合的比对源。
 * 本函数只备料与建卡，是否登记投纱由调用方决定——反向腿「无投纱不得凭空产生需求」正是复用此
 * 前置但不投纱来验证。
 */
async function seedDemandChain(page: Page): Promise<DemandChain> {
  const warehouseId = await seedWarehouse(page);
  const categoryId = await seedCategory(page);
  const yarn = await seedYarn(page, categoryId);
  const clothId = await seedCloth(page, categoryId);

  const order = await apiCallRaw<Row>(page, 'POST', '/production/production-orders/orders', {
    product_id: clothId,
    planned_quantity: 100,
    priority: 1,
  });
  const orderId = idOf(order, '[480] 生产订单创建');
  const orderNo = strField(order, 'order_no', '[480] 生产订单服务端取号回读');
  CLEANUP.push({
    path: `/production/production-orders/orders/${orderId}`,
    label: '[480] 生产订单',
  });

  await pushOrderStatus(page, orderId, 'SCHEDULED', '[480] 排产');
  await pushOrderStatus(page, orderId, 'IN_PROGRESS', '[480] 开工');

  const card = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards', {
    production_order_id: orderId,
  });
  const cardId = idOf(card, '[480] 流转卡创建');
  CLEANUP.push({ path: `/production/flow-cards/${cardId}`, label: '[480] 流转卡' });

  return { warehouseId, categoryId, yarn, clothId, orderId, orderNo, cardId };
}

/** 纱线库存行直建（POST /inventory/stock/fabric）；available 维度落 quantity_available=米数列。 */
async function seedYarnStock(
  page: Page,
  fx: DemandChain,
  meters: string,
  kg: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: fx.warehouseId,
    product_id: fx.yarn.id,
    batch_no: genCode('E480B'),
    color_no: genCode('E480C'),
    dye_lot_no: genCode('E480D'),
    grade: STOCK_GRADE.first,
    quantity_meters: meters,
    quantity_kg: kg,
  });
  const id = idOf(created, '[480] 纱线库存行创建');
  CLEANUP.push({ path: `/inventory/stock/${id}`, label: '[480] 纱线库存行' });
  return id;
}

/** 投纱行登记：请求体键与 CreateFlowCardMaterialRequest 逐字一致。 */
async function addMaterial(
  page: Page,
  fx: DemandChain,
  quantity: string,
  unit: MaterialUnitValue
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/production/flow-cards/materials', {
    flow_card_id: fx.cardId,
    warehouse_id: fx.warehouseId,
    material_id: fx.yarn.id,
    batch_no: genCode('E480MB'),
    color_no: genCode('E480MC'),
    dye_lot_no: genCode('E480MD'),
    grade: STOCK_GRADE.first,
    quantity,
    unit,
  });
  const id = idOf(created, '[480] 投纱行创建');
  CLEANUP.push({ path: `/production/flow-cards/materials/${id}`, label: '[480] 投纱行' });
  return id;
}

/** 触发缺料检测并把结果收口到本支专属成品布（product_ids=订单母体），返回 items 数组。 */
async function detectItems(page: Page, clothIds: number[]): Promise<Row[]> {
  const summary = await apiCallRaw<Row>(page, 'POST', MS_CHECK, { product_ids: clothIds });
  return pickListArray<Row>(summary, 'items', '[480] 缺料检测 items');
}

/** 从检测结果里按 material_id 精确取本支纱线那一条；取不到即当场点名（不做「空列表=通过」）。 */
function pickMaterial(items: Row[], materialId: number, label: string): Row {
  const rows = items.filter(r => Number(r.material_id) === materialId);
  expect(
    rows.length,
    `${label}：按 material_id=${materialId} 应恰命中 1 条缺料项，实际 ${rows.length}，items=${JSON.stringify(items).slice(0, 600)}`
  ).toBe(1);
  return rows[0];
}

test.describe.serial('480A 缺料需求源=投纱明细的读面与阈值定级', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('480-01 正向：投纱产生需求量→缺料预警落库→读面逐字段按实体键名回读', async ({ page }) => {
    const fx = await seedDemandChain(page);
    // available=100（米数列），required=300（投纱 300m 绝对投入量）→ shortage=200，
    // deficit_rate=round2(200/300*100)=66.67 → 默认阈值(critical=100/severe=50)下判 Severe。
    await seedYarnStock(page, fx, '100', '50');
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    const items = await detectItems(page, [fx.clothId]);
    const item = pickMaterial(items, fx.yarn.id, '480-01 检测');

    // 出参键名 = services 里 MaterialShortageItem 的序列化键（snake_case），逐字段核对，不自创键。
    expect(decNum(item, 'required_quantity', '480-01 需求量'), '需求量应等于投纱 300m').toBe(300);
    expect(decNum(item, 'available_quantity', '480-01 可用量'), '可用量应等于库存米数列 100').toBe(
      100
    );
    expect(decNum(item, 'shortage_quantity', '480-01 缺口量'), '缺口=需求-可用=200').toBe(200);
    expect(decNum(item, 'deficit_rate', '480-01 缺口率'), '缺口率=round2(200/300*100)=66.67').toBe(
      66.67
    );
    expect(
      strField(item, 'level', '480-01 级别'),
      '66.67>severe(50) 且 <critical(100) 应判 Severe'
    ).toBe(SHORTAGE_LEVEL.severe);
    expect(strField(item, 'material_name', '480-01 物料名'), '物料名应由产品档案带出').toBe(
      fx.yarn.name
    );
    expect(strField(item, 'material_code', '480-01 物料编号'), '物料编号应由产品档案带出').toBe(
      fx.yarn.code
    );
    expect(String(item.unit), '投纱单位回读应为登记的 m').toBe('m');

    // 受影响订单归属：affected_orders 必须恰含本支那条生产订单，demand_quantity=投纱量。
    const affected = item.affected_orders as Row[];
    expect(Array.isArray(affected), 'affected_orders 必须是数组').toBe(true);
    const mine = affected.filter(o => Number(o.order_id) === fx.orderId);
    expect(mine.length, `affected_orders 应恰含本支订单 ${fx.orderId} 一条`).toBe(1);
    expect(strField(mine[0], 'order_no', '480-01 受影响订单号'), '订单号应为服务端取号回读').toBe(
      fx.orderNo
    );
    expect(
      decNum(mine[0], 'demand_quantity', '480-01 受影响订单需求'),
      '该订单需求应等于投纱 300m'
    ).toBe(300);

    // 落库回读：detect_shortages 内 persist_alerts 应把该缺料快照落进 material_shortage_alerts，
    // GET /alerts 按实体键名读出 alert_no（MS- 前缀）、status=identified、affected_orders_count=1。
    const listRaw = await apiCallRaw<Row>(page, 'GET', `${MS_ALERTS}?page=1&page_size=100`);
    const alertRows = pickListArray<Row>(listRaw, 'items', '480-01 预警列表').filter(
      r => Number(r.material_id) === fx.yarn.id
    );
    expect(alertRows.length, '该纱线在未解决预警列表应恰 1 行').toBe(1);
    const alertView = alertRows[0];
    const alertNo = strField(alertView, 'alert_no', '480-01 预警单号');
    expect(alertNo.startsWith('MS-'), `预警单号应由服务端取 MS- 前缀号，实际 ${alertNo}`).toBe(
      true
    );
    expect(
      strField(alertView, 'status', '480-01 预警状态'),
      '检测新建预警状态应恒为 identified'
    ).toBe(SHORTAGE_STATUS.identified);
    expect(
      decNum(alertView, 'required_quantity', '480-01 列表需求量'),
      '列表需求量应等于投纱 300'
    ).toBe(300);
    expect(decNum(alertView, 'deficit_rate', '480-01 列表缺口率')).toBe(66.67);
    expect(strField(alertView, 'level', '480-01 列表级别')).toBe(SHORTAGE_LEVEL.severe);

    // 按实体键名逐字段回读：update_shortage_status 直接序列化 alert_model::Model（models/material_shortage.rs），
    // 用它证明落库快照含全部声明键，且键名与源码声明逐字一致（snake_case）。:id 语义是 material_id。
    const model = await apiCallRaw<Row>(page, 'PUT', `/material-shortage/${fx.yarn.id}/status`, {
      status: SHORTAGE_STATUS.purchaseRequest,
    });
    for (const entityKey of [
      'id',
      'alert_no',
      'material_id',
      'material_name',
      'material_code',
      'required_quantity',
      'available_quantity',
      'shortage_quantity',
      'deficit_rate',
      'level',
      'status',
      'affected_orders_count',
      'identified_at',
      'created_at',
      'updated_at',
    ]) {
      expect(
        hasKey(model, entityKey, '480-01 实体回读'),
        `alert_model::Model 出参应含实体键 ${entityKey}（models/material_shortage.rs 声明字段）`
      ).toBe(true);
    }
    expect(Number(model.material_id), '实体 material_id 应回指本支纱线').toBe(fx.yarn.id);
    expect(
      strField(model, 'status', '480-01 状态回写落库'),
      '状态回写后应持久化为 purchase_request'
    ).toBe(SHORTAGE_STATUS.purchaseRequest);
    expect(Number(model.affected_orders_count), '受影响订单数落库应为 1').toBe(1);
    // resolved_at 为可空列：未解除时必须显式是 null（不是缺键、更不是 0）。
    expect(
      hasKey(model, 'resolved_at', '480-01 resolved_at 键在'),
      'resolved_at 是实体声明列，出参必须带该键'
    ).toBe(true);
    expect(
      model.resolved_at,
      '未解除预警 resolved_at 必须为 null（缺值表示未补录，不写其它值）'
    ).toBeNull();
  });

  test('480-02 阈值腿（消费方向）：同一缺口按请求体 threshold 覆写在 Warning/Severe/Critical 间可证翻转', async ({
    page,
  }) => {
    const fx = await seedDemandChain(page);
    // 固定缺口率 66.67（required=300, available=100），只动阈值三键看级别是否随之变——
    // 证明定级真的读 threshold，而非把 Severe/Warning/Critical 写死在 build_shortage_items。
    await seedYarnStock(page, fx, '100', '50');
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    const levelWith = async (
      severeThreshold: number,
      criticalThreshold: number
    ): Promise<string> => {
      const summary = await apiCallRaw<Row>(page, 'POST', MS_CHECK, {
        product_ids: [fx.clothId],
        threshold: {
          safety_factor: 1,
          critical_threshold: criticalThreshold,
          severe_threshold: severeThreshold,
        },
      });
      const item = pickMaterial(
        pickListArray<Row>(summary, 'items', '480-02 阈值检测'),
        fx.yarn.id,
        '480-02 阈值'
      );
      return strField(item, 'level', '480-02 级别');
    };

    // severe=50 默认：66.67>50 且 <100 → Severe
    expect(await levelWith(50, 100), 'severe=50 时 66.67 应判 Severe').toBe(SHORTAGE_LEVEL.severe);
    // severe=70：66.67 不 >70 且 >0 → Warning（抬高严重阈值把 Severe 降成 Warning）
    expect(await levelWith(70, 100), 'severe=70 时 66.67 应降为 Warning').toBe(
      SHORTAGE_LEVEL.warning
    );
    // critical=60：66.67>=60 → Critical（压低紧急阈值把 Severe 抬成 Critical）
    expect(await levelWith(50, 60), 'critical=60 时 66.67 应升为 Critical').toBe(
      SHORTAGE_LEVEL.critical
    );
  });

  test('480-03 阈值腿（持久化生效方向）：POST /threshold 落库→GET 库读回→无覆写检测按已存阈值判定→恢复原值', async ({
    page,
  }) => {
    const fx = await seedDemandChain(page);
    await seedYarnStock(page, fx, '100', '50');
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    // 基线：GET /threshold 从 material_shortage_threshold_configs 单行读当前配置（不是响应回显，是库读回）。
    const baseline = await apiCallRaw<Row>(page, 'GET', MS_THRESHOLD);
    const baseSevere = decNum(baseline, 'severe_threshold', '480-03 基线 severe');
    const baseCritical = decNum(baseline, 'critical_threshold', '480-03 基线 critical');

    // 默认 severe=50 时本缺口 66.67 → Severe（前提校验：若基线被别支改过导致这里就不是 Severe，先点名）。
    const severeByDefault = strField(
      pickMaterial(await detectItems(page, [fx.clothId]), fx.yarn.id, '480-03 默认'),
      'level',
      '480-03 默认级别'
    );
    expect(
      baseSevere < 66.67 && baseCritical > 66.67,
      `480-03 前置不成立：基线阈值(severe=${baseSevere},critical=${baseCritical})本应把 66.67 判 Severe`
    ).toBe(true);
    expect(severeByDefault, '基线阈值下 66.67 应判 Severe').toBe(SHORTAGE_LEVEL.severe);

    // 抬高 severe 到 80（>66.67）并落库；GET 库读回必须看到 80，而不是只信 POST 回显。
    try {
      await apiCall(page, 'POST', MS_THRESHOLD, { severe_threshold: 80 });
      const readBack = await apiCallRaw<Row>(page, 'GET', MS_THRESHOLD);
      expect(
        decNum(readBack, 'severe_threshold', '480-03 落库后库读回'),
        'POST /threshold 后 GET 从库读回的 severe 必须等于新写入的 80'
      ).toBe(80);
      // 无 threshold 覆写的检测 → 走 load_threshold_config（读已存单行）→ 66.67 不 >80 → Warning。
      const levelAfterSave = strField(
        pickMaterial(await detectItems(page, [fx.clothId]), fx.yarn.id, '480-03 改后'),
        'level',
        '480-03 改后级别'
      );
      expect(levelAfterSave, 'severe 持久化为 80 后，无覆写检测应按已存阈值判 Warning').toBe(
        SHORTAGE_LEVEL.warning
      );
    } finally {
      // 阈值单行是全局共享态，改后必恢复基线，避免污染并发车道与其它读缺料的用例。
      await apiCall(page, 'POST', MS_THRESHOLD, {
        severe_threshold: baseSevere,
        critical_threshold: baseCritical,
      });
      const restored = await apiCallRaw<Row>(page, 'GET', MS_THRESHOLD);
      expect(decNum(restored, 'severe_threshold', '480-03 恢复后 severe')).toBe(baseSevere);
      expect(decNum(restored, 'critical_threshold', '480-03 恢复后 critical')).toBe(baseCritical);
    }
  });

  test('480-04 脱敏腿：缺料读面在任何岗位出参均不投影成本/金额键，hasOwnProperty 正向钉', async ({
    page,
  }) => {
    const fx = await seedDemandChain(page);
    await seedYarnStock(page, fx, '100', '50');
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    const checkItem = pickMaterial(
      await detectItems(page, [fx.clothId]),
      fx.yarn.id,
      '480-04 检测'
    );
    const alertView = pickListArray<Row>(
      await apiCallRaw<Row>(page, 'GET', `${MS_ALERTS}?page=1&page_size=100`),
      'items',
      '480-04 列表'
    ).find(r => Number(r.material_id) === fx.yarn.id);
    expect(alertView, '480-04 预警列表应能查到本支纱线那一条').toBeTruthy();
    const model = await apiCallRaw<Row>(page, 'PUT', `/material-shortage/${fx.yarn.id}/status`, {
      status: SHORTAGE_STATUS.purchaseRequest,
    });

    for (const row of [checkItem, alertView as Row, model]) {
      for (const token of COST_TOKENS) {
        expect(
          hasKey(row, token, '480-04 脱敏钉'),
          `缺料读面不应投影成本/金额键 ${token}，实际行=${JSON.stringify(row).slice(0, 400)}`
        ).toBe(false);
      }
    }

    console.error(
      '[480-04][缺口登记] 成本/金额按岗位脱敏在缺料域缺实现：POST /material-shortage/check（' +
        'services/material_shortage_service.rs::MaterialShortageItem）、GET /material-shortage/alerts' +
        '（ShortageAlertView）与 PUT /material-shortage/{id}/status（alert_model::Model，' +
        'models/material_shortage.rs）三个读面均根本不定义任何成本/金额列——因此"按岗位隐藏成本键"' +
        '当前没有可隐藏的对象，也没有岗位差异门（读面只按 material-shortage:read 收口，无字段级脱敏）。' +
        '本用例把"成本键恒不在"用 hasOwnProperty 正向钉为防回归前置钉：若日后任一读面新增成本列' +
        '却不做岗位门控，本断言即判红。目标口径"成本/金额出参按岗位脱敏"缺按岗位的实现，本支只暴露不修。'
    );
  });
});

test.describe('480B 反向腿：投纱是需求唯一来源，缺投纱/撤投纱不得留下需求', () => {
  test('480-05 无投纱明细不得凭空产生需求', async ({ page }) => {
    await loginViaUI(page);
    // 复用与正向完全相同的前置，但一条投纱都不登记——需求源为空时该纱线不得出现在缺料项里。
    const fx = await seedDemandChain(page);
    await seedYarnStock(page, fx, '100', '50');

    const items = await detectItems(page, [fx.clothId]);
    const rows = items.filter(r => Number(r.material_id) === fx.yarn.id);
    expect(
      rows.length,
      `480-05 该卡无投纱时，纱线 material_id=${fx.yarn.id} 不得凭空进入缺料需求，实际命中 ${rows.length}，items=${JSON.stringify(items).slice(0, 500)}`
    ).toBe(0);

    // 反向自证：登记一条投纱后同一纱线立即进入需求（证明上一条判红不是因为检测端点整体失灵）。
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);
    const afterItems = await detectItems(page, [fx.clothId]);
    const after = afterItems.filter(r => Number(r.material_id) === fx.yarn.id);
    expect(after.length, '480-05 登记投纱后该纱线应出现在需求项中（对照自证）').toBe(1);
    expect(
      decNum(after[0], 'required_quantity', '480-05 投纱后需求量'),
      '投纱 300m 应成需求 300'
    ).toBe(300);
  });

  test('480-06 投纱被撤后需求应回退（读面与投纱列表双库读）', async ({ page }) => {
    await loginViaUI(page);
    const fx = await seedDemandChain(page);
    await seedYarnStock(page, fx, '100', '50');
    const materialId = await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    // 投纱在册时先确认真有需求（否则下一条"回退"无对照）。
    const before = await detectItems(page, [fx.clothId]);
    expect(
      before.filter(r => Number(r.material_id) === fx.yarn.id).length,
      '480-06 撤前该纱线应在需求项里'
    ).toBe(1);

    // 撤投纱（软删）：DELETE 后读面立即不可见，重算时 compute_material_requirements 不再计入。
    await apiCall(page, 'DELETE', `/production/flow-cards/materials/${materialId}`);

    // 库读回 1：投纱列表按 flow_card_id 现查应恰 0 行（软删事实）。
    const materialList = pickListArray<Row>(
      await apiCallRaw<unknown>(page, 'GET', `/production/flow-cards/${fx.cardId}/materials`),
      'bare',
      '480-06 撤后投纱列表'
    );
    expect(materialList.length, '投纱软删后该卡未软删投纱行应归零').toBe(0);

    // 库读回 2：无覆写检测按未软删投纱行重算需求量——撤后本支纱线不得再进缺料需求（需求回退）。
    const after = await detectItems(page, [fx.clothId]);
    expect(
      after.filter(r => Number(r.material_id) === fx.yarn.id).length,
      `480-06 投纱撤走后需求应回退：纱线 material_id=${fx.yarn.id} 不应再出现在缺料项，items=${JSON.stringify(after).slice(0, 500)}`
    ).toBe(0);
  });
});

test.describe('480C 归属腿：非授权岗位读缺料被鉴权拦（权限键由 URL 段推导，不看前端按钮）', () => {
  test('480-07 warehouse_keeper 无 material-shortage 键→读列表/汇总被 403 拒；admin 对照 200', async ({
    page,
  }) => {
    await loginViaUI(page);
    const fx = await seedDemandChain(page);
    await seedYarnStock(page, fx, '100', '50');
    await addMaterial(page, fx, '300', MATERIAL_UNIT.meter);

    // 授权对照：admin（worker 会话）读列表应 200，证明端点真实注册、非"未挂载/404 当健康"。
    const adminResp = await apiCallRaw<Row>(page, 'GET', `${MS_ALERTS}?page=1&page_size=20`);
    expect(
      Array.isArray(adminResp.items),
      `480-07 admin 读缺料列表应为分页信封 data.items 数组，实际 ${JSON.stringify(adminResp).slice(0, 300)}`
    ).toBe(true);

    // 切到非授权岗位：warehouse_keeper 在 init 授权矩阵与 e2e 补授面里均无 material-shortage 键，
    // 权限中间件按 URL 段派生 resource=material-shortage → 该岗缺此资源 → 403 FORBIDDEN。
    await loginAsRole(page, 'warehouse_keeper');

    const listFail = await apiCallExpectFail(page, 'GET', `${MS_ALERTS}?page=1&page_size=20`);
    expectDenied(listFail, '480-07 warehouse_keeper 读缺料列表');

    const summaryFail = await apiCallExpectFail(page, 'GET', MS_SUMMARY);
    expectDenied(summaryFail, '480-07 warehouse_keeper 读缺料汇总');

    // 拒绝必须归因到权限机器码（FORBIDDEN），不能是 404/端点未注册或 CSRF 冒名。
    expect(
      failureCode(summaryFail),
      `480-07 汇总拒绝机器码应为 FORBIDDEN，实际 code=${JSON.stringify(summaryFail.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 会话回切 admin：afterEach 的清理删除走 admin 会话，避免 warehouse_keeper 删除权不足而静默残留。
    await loginViaUI(page, undefined, undefined, true);
  });
});
