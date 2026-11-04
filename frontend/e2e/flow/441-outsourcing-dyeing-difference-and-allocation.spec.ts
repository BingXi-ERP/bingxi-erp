// 441 委外染整链深度契约 E2E —— 缸号/批次逐节点持久化 · 缸差与缩率数值口径 · 染费与运费分摊到缸/批的成本归集 ·
// 委外返工反向腿 · 跨角色回读可见性 · 时序门控负例
//
// 契约来源（每个断言值都对着仓内写入方核过，不含测试自造口径）：
//  · 端点与挂载：路由快照中 /api/v1/erp/production/{outsourcing-orders,outsourcing-receipts,outsourcing-vouchers,
//    fabric-inspections,fabric-defects,dye-batches,dye-batch-reworks,quality-inspection}；
//    前端 baseURL=/api/v1/erp，调用只写其后部分。
//  · 出参键名 = backend/src/models/{outsourcing_order,outsourcing_order_item,outsourcing_receipt,
//    fabric_defect_record,fabric_physical_test_record,quality_inspection_record,dye_batch_rework}.rs 字段名
//    （snake_case）；列表是 PaginatedResponse{items,total,page,page_size}，查询键 page/page_size。
//  · 状态词表逐字符照写入方（大小写混用是故意的，不做规范化）：
//    outsourcing_order_status 小写 draft/issued/processing/received/settled/closed/cancelled；
//    outsourcing_receipt_status draft/confirmed/cancelled；
//    outsourcing_receipt_quality_status pending/qualified/concession/unqualified
//    （passed/failed 属染化料来料检验域、中文 合格/不合格 属库存质量状态，写入方显式拒绝）；
//    quality_inspection_result 是中文 合格/不合格/待检；quality_inspection_type 含 outsourcing_receipt；
//    outsourcing_loss_type normal/abnormal；dye_batch_rework_status draft/approved/in_progress/completed/cancelled；
//    dye_batch_rework_type 含 color_difference（缸差回修）；疵点 defect_type 含 color_diff；
//    physical_test_item 含 shrinkage（缩率），physical_test_result 小写 pass/fail；
//    匹状态 inventory_piece 大写 AVAILABLE。
//  · 派生值一律只认后端出参，不在用例里重算再与自己比对：收回确认落库 loss_quantity/loss_rate/loss_type/
//    is_loss_normal/abnormal_loss_amount/total_cost/unit_cost（services/outsourcing_ops/order.rs
//    compute_receipt_calculation）；发料落 OVIS 凭证 amount=材料成本；结算落 OVFE 凭证 amount=加工费+运费；
//    确认收回落 OVRC 凭证 amount=收回单总成本；超定额损耗>0 才落 OVLS 凭证；
//    验布评级按已登记疵点派生 points_per_100_sq_yards/abc_grade；物理指标未给 test_result 时由
//    standard_value 与 test_value 比较派生 pass/fail。
//  · 金额与数量按 DECIMAL 线格式（JSON 字符串）比较，并钉住列定标位数：outsourcing_* 数量/成本 (14,4)、
//    损耗率 (8,4)；fabric_physical_test_record 实测值/标准值 (12,2)。
//  · 失败体只有 AppError 一种形状：BusinessError/BusinessErrorDisplayable→400 BUSINESS_ERROR、
//    ValidationError(Displayable)→400 VALIDATION_ERROR、PermissionDenied→403 FORBIDDEN、NotFound→404。
//    可外显族（*_displayable）才锁公开文案，脱敏族只锁 HTTP 码 + 机器码并点名根因。
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
  genCode,
  genDyeLotNo,
  testUsername,
  testPassword,
  tryCleanup,
  pickDyeableWarehouse,
} from './helpers';
import { pickListArray } from './ui-helpers';
// 产品类型单源常量（与后端 product_type 词表同源）：建品夹具取值必须经成员引用。
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ───────────────────────────── 十进制字符串对账（禁浮点、禁二次舍入）─────────────────────────────

interface Dec {
  v: bigint;
  s: number;
}

/**
 * 失败消息里的值描述：入参取后端出参原值，出参应为字符串或数字。
 * 用例内部的对平容器 Dec 含 bigint，直接 JSON.stringify 会抛
 * "Do not know how to serialize a BigInt"，把真正的入参类型错误盖掉，故按类型分开呈现。
 */
function describeRaw(raw: unknown): string {
  if (typeof raw === 'bigint') return `${raw.toString()}n`;
  if (raw === null) return 'null';
  if (typeof raw === 'object') return `非原始值:${Array.isArray(raw) ? 'array' : 'object'}`;
  return JSON.stringify(raw);
}

function decFromRaw(raw: unknown, label: string): Dec {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : null;
  if (text === null) {
    throw new Error(
      `${label}：后端 Decimal 出参必须是字符串，实际类型=${typeof raw} 值=${describeRaw(raw)}`
    );
  }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`${label}：无法按十进制解析，raw=${describeRaw(raw)}`);
  const sign = m[1] === '-' ? -1n : 1n;
  return { v: sign * BigInt(`${m[2]}${m[3] ?? ''}`), s: (m[3] ?? '').length };
}

function decLiteral(text: string, label: string): Dec {
  return decFromRaw(text, label);
}

function alignDec(a: Dec, b: Dec): [bigint, bigint] {
  const s = Math.max(a.s, b.s);
  return [a.v * 10n ** BigInt(s - a.s), b.v * 10n ** BigInt(s - b.s)];
}

function decCmp(a: Dec, b: Dec): number {
  const [x, y] = alignDec(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function decAdd(a: Dec, b: Dec): Dec {
  const [x, y] = alignDec(a, b);
  const s = Math.max(a.s, b.s);
  return { v: x + y, s };
}

function decMul(a: Dec, b: Dec): Dec {
  return { v: a.v * b.v, s: a.s + b.s };
}

function decText(d: Dec): string {
  const sign = d.v < 0n ? '-' : '';
  const digits = (d.v < 0n ? -d.v : d.v).toString().padStart(d.s + 1, '0');
  return d.s === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -d.s)}.${digits.slice(-d.s)}`;
}

/** 十进制相等（定标对齐后比整数）；分差、被舍入的分位都会在这里暴露，不做容差比较 */
function expectDecEquals(actual: unknown, expected: Dec, label: string): void {
  const a = decFromRaw(actual, label);
  expect(
    decCmp(a, expected) === 0,
    `${label}：十进制期望=${decText(expected)} 实际=${decText(a)}（raw=${describeRaw(actual)}）`
  ).toBe(true);
}

/** 两条后端出参之间的对平（合计 vs 明细、单头 vs 凭证），不引入用例自造值 */
function expectDecEqualsEachOther(left: unknown, right: unknown, label: string): void {
  const l = decFromRaw(left, `${label}（左）`);
  const r = decFromRaw(right, `${label}（右）`);
  expect(
    decCmp(l, r) === 0,
    `${label}：两侧出参必须逐分对平，左=${decText(l)}（raw=${describeRaw(left)}） 右=${decText(r)}（raw=${describeRaw(right)}）`
  ).toBe(true);
}

/** 左 > 右（两条后端出参之间的方向判据，用于"派生分随疵点登记上调"一类事实） */
function expectDecGreaterThanEachOther(left: unknown, right: unknown, label: string): void {
  const l = decFromRaw(left, `${label}（左）`);
  const r = decFromRaw(right, `${label}（右）`);
  expect(decCmp(l, r) > 0, `${label}：左必须严格大于右，左=${decText(l)} 右=${decText(r)}`).toBe(
    true
  );
}

/** 出参必须是十进制字符串（DECIMAL 未开 serde-float 的线格式契约） */
function expectDecimalString(raw: unknown, label: string): Dec {
  expect(
    typeof raw,
    `${label}：Decimal 出参应为 JSON 字符串，实际类型=${typeof raw} 值=${describeRaw(raw)}`
  ).toBe('string');
  return decFromRaw(raw, label);
}

/** 列定标位数上限：超出即 DB 列被舍入或序列化线格式位数漂移（禁在小数位上做任何宽容） */
function expectDecScaleAtMost(raw: unknown, maxScale: number, label: string): Dec {
  const d = expectDecimalString(raw, label);
  expect(
    d.s <= maxScale,
    `${label}：小数位数不得超过列定标 ${maxScale}，实际=${d.s}（raw=${describeRaw(raw)}）`
  ).toBe(true);
  return d;
}

function requireId(row: Record<string, unknown>, label: string): number {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`${label}：未取到有效 id，实际键=${Object.keys(row ?? {}).join(',')}`);
  }
  return id;
}

/**
 * 剥一层双信封：POST /production/fabric-inspections/physical-tests 的 handler 在标准
 * ApiResponse 里又内嵌了一层 {code,message,data}，出参真值在内层 data。
 * 调用方：441-02 缩率腿。入参：apiCallRaw 已剥外层信封后的对象。返回：内层检测行；
 * 形状不符（无 data 对象）显式抛错，不做空值兜底。
 */
function unwrapDoubleEnvelope(
  wrapped: Record<string, unknown>,
  label: string
): Record<string, unknown> {
  const inner = wrapped?.data;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new Error(
      `${label}：该端点出参在标准信封内再包一层 {code,message,data}，实际片段=${JSON.stringify(wrapped).slice(0, 240)}`
    );
  }
  return inner as Record<string, unknown>;
}

// ───────────────────────────── 前置夹具（全部自建、唯一命名，不引用库中历史行）─────────────────────────────

interface OwnProduct {
  id: number;
  code: string;
  name: string;
  unit: string;
}

/** 取本用例专属产品（POST + GET 回读，编码与单位逐字段确认） */
async function ownProduct(page: Page, tag: string, unit = '米'): Promise<OwnProduct> {
  const ctx = getCtx();
  if (!ctx.productCategoryIds[0]) throw new Error('前置缺失：ctx.productCategoryIds[0] 未就绪');
  const code = genCode(`E441${tag}`);
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/products', {
    code,
    name: `E2E委外染整${tag}${code}`,
    unit,
    category_id: ctx.productCategoryIds[0],
    // 委外染整链按缸号与匹号推进，不做米↔公斤换算，取非面料类型免带面料三键
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = requireId(created, `建产品 ${code}`);
  CLEANUP.push({ path: `/products/${id}`, label: `product#${id}` });
  const readBack = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/products/${id}`);
  expect(readBack.code, `产品 ${id} 编码回读`).toBe(code);
  expect(readBack.unit, `产品 ${id} 计量单位回读`).toBe(unit);
  return { id, code, name: String(readBack.name ?? ''), unit };
}

/**
 * 仓库两面：回仓入库仓（可承载染色匹）与发料用生产匹入仓（不得为成品仓）。
 * 口径来源：piece_domain_service::validate_warehouse_for_piece_type —— 染色匹只允许
 * 成品仓(finished) 或未设类型仓；胚布匹入仓按 helpers 既有同口径取非成品仓。
 */
async function pickChainWarehouses(
  page: Page,
  tag: string
): Promise<{ inboundId: number; greigeId: number }> {
  const inbound = await pickDyeableWarehouse(page);
  const res = await apiCallRaw<{ items?: unknown }>(
    page,
    'GET',
    '/warehouses?page=1&page_size=200'
  );
  const rows = pickListArray<Record<string, unknown>>(res, 'items', `${tag} 仓库列表`);
  const inboundRow = rows.find(r => Number(r.id) === inbound.id);
  if (!inboundRow) {
    throw new Error(`[${tag}] 回仓仓 ${inbound.id} 不在 /warehouses 列表中，链断，显式判红`);
  }
  if (inboundRow.warehouse_type !== 'finished') {
    return { inboundId: inbound.id, greigeId: inbound.id };
  }
  const greigeRow = rows.find(r => r.warehouse_type !== 'finished');
  if (!greigeRow) {
    throw new Error(
      `[${tag}] 无可用非成品仓存放生产匹（发料前置），validate_warehouse_for_piece_type 会拒成品入胚布，显式判红`
    );
  }
  return { inboundId: inbound.id, greigeId: Number(greigeRow.id) };
}

interface GreigePiece {
  pieceNo: string;
  warehouseId: number;
}

/**
 * 自建 N 匹 AVAILABLE 生产匹（委外发料的真实前置：发料必须精确到匹）。
 * 链：生产订单 → 流转卡（schedule→备布→完成备布）→ 工序启动 → 报工逐匹入非成品仓。
 * 每条写动作后 GET /inventory/pieces 回读匹号/仓库/米数/状态，取不到即判红。
 */
async function ownGreigePieces(
  page: Page,
  opts: {
    productId: number;
    warehouseId: number;
    pieceCount: number;
    lengthPerPiece: string;
    totalQuantity: string;
    tag: string;
  }
): Promise<GreigePiece[]> {
  const { productId, warehouseId, pieceCount, lengthPerPiece, totalQuantity, tag } = opts;
  const productionOrderNo = genCode(`${tag}PO`);
  const po = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/production-orders/orders',
    {
      order_no: productionOrderNo,
      product_id: productId,
      planned_quantity: totalQuantity,
    }
  );
  const poId = requireId(po, `${tag} 生产订单`);

  const card = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/production/flow-cards', {
    production_order_id: poId,
    product_id: productId,
    product_name: `E2E委外染整${tag}胚布`,
    planned_fabric_weight: totalQuantity,
  });
  const cardId = requireId(card, `${tag} 流转卡`);
  await apiCall(page, 'POST', `/production/flow-cards/${cardId}/schedule`, {});
  await apiCall(page, 'POST', `/production/flow-cards/${cardId}/start-preparing`);
  await apiCall(page, 'POST', `/production/flow-cards/${cardId}/complete-preparing`, {
    actual_fabric_weight: totalQuantity,
  });

  const step = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/flow-cards/steps/start',
    {
      flow_card_id: cardId,
    }
  );
  const stepId = requireId(step, `${tag} 工序启动`);
  const pieceNos = Array.from(
    { length: pieceCount },
    (_, i) => `GR-${genCode(`${tag}P`)}-${String(i + 1).padStart(3, '0')}`
  );
  await apiCall(page, 'POST', `/production/flow-cards/steps/${stepId}/complete`, {
    actual_quantity: totalQuantity,
    qualified_quantity: totalQuantity,
    pieces: pieceNos.map(no => ({
      piece_no: no,
      machine_no: `M-E441-${tag}`,
      machine_operator: `E441开机人${tag}`,
      length: lengthPerPiece,
      weight: '50.25',
      warehouse_id: warehouseId,
    })),
  });

  const out: GreigePiece[] = [];
  for (const pieceNo of pieceNos) {
    const res = await apiCallRaw<unknown>(
      page,
      'GET',
      `/inventory/pieces?piece_no=${encodeURIComponent(pieceNo)}&product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=20`
    );
    const rows = pickListArray<Record<string, unknown>>(
      res,
      'items',
      `${tag} 生产匹回读 ${pieceNo}`
    );
    const hit = rows.find(r => String(r.piece_no) === pieceNo);
    if (!hit) {
      throw new Error(
        `[${tag}] 报工逐匹后 GET /inventory/pieces 未命中匹 ${pieceNo}（实际匹号集=${
          rows.map(r => r.piece_no).join(',') || '(空)'
        }）——发料前置的匹不存在，链断，显式判红`
      );
    }
    expect(String(hit.status), `生产匹 ${pieceNo} 入仓后状态（大写词表）`).toBe('AVAILABLE');
    expect(Number(hit.product_id), `生产匹 ${pieceNo} 产品归属`).toBe(productId);
    expect(Number(hit.warehouse_id), `生产匹 ${pieceNo} 入仓仓库`).toBe(warehouseId);
    expectDecScaleAtMost(hit.length, 4, `生产匹 ${pieceNo} 米数`);
    out.push({ pieceNo, warehouseId });
  }
  return out;
}

interface DyeingOrderFixture {
  orderId: number;
  orderNo: string;
  itemId: number;
  dyeLotNo: string;
  colorNo: string;
}

/**
 * 建一笔染色委外单（可多缸多发料明细）并保持 draft。
 * 入参费用/损耗率按字符串送，落库后逐字段 GET 回读比对（单头与明细两侧）。
 */
async function openDyeingOrder(
  page: Page,
  opts: {
    tag: string;
    productId: number;
    supplierId: number;
    productionOrderId?: number;
    dyeLotNo: string;
    colorNo: string;
    issueQuantity: string;
    materialCost: string;
    processingFee: string;
    freightFee: string;
    taxAmount: string;
    standardLossRate: string;
    items: Array<{
      pieceNo: string;
      warehouseId: number;
      batchNo: string;
      dyeLotNo: string;
      quantity: string;
      unitCost: string;
      processingFee: string;
      freightFee: string;
    }>;
  }
): Promise<DyeingOrderFixture> {
  const orderNo = genCode(`${opts.tag}OS`);
  const order = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/outsourcing-orders',
    {
      order_no: orderNo,
      order_type: 'dyeing',
      supplier_id: opts.supplierId,
      production_order_id: opts.productionOrderId ?? null,
      dye_lot_no: opts.dyeLotNo,
      color_no: opts.colorNo,
      issue_date: todayStr(),
      expected_return_date: null,
      issue_quantity: opts.issueQuantity,
      issue_unit: '米',
      material_cost: opts.materialCost,
      processing_fee: opts.processingFee,
      freight_fee: opts.freightFee,
      tax_amount: opts.taxAmount,
      standard_loss_rate: opts.standardLossRate,
      remarks: `E2E-441-${opts.tag}-${orderNo}`,
    }
  );
  const orderId = requireId(order, `委外订单 ${orderNo}`);
  expect(order.status, '新建委外订单初始态（写入方词表小写 draft）').toBe('draft');
  expect(String(order.order_no), '委外订单号回显必须等于提交值').toBe(orderNo);

  const head = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/outsourcing-orders/${orderId}`
  );
  expect(String(head.order_no), '单头订单号落库回读').toBe(orderNo);
  expect(String(head.order_type), '单头委外类型落库回读').toBe('dyeing');
  expect(String(head.dye_lot_no), '单头缸号落库回读（逐字符）').toBe(opts.dyeLotNo);
  expect(String(head.color_no), '单头色号落库回读（逐字符）').toBe(opts.colorNo);
  expect(Number(head.supplier_id), '单头加工厂归属').toBe(opts.supplierId);
  expectDecScaleAtMost(head.issue_quantity, 4, '单头发出数量');
  expectDecEquals(
    head.issue_quantity,
    decLiteral(opts.issueQuantity, '提交发出数量'),
    '单头发出数量落库'
  );
  expect(String(head.issue_unit), '单头发出单位落库').toBe('米');
  expectDecEquals(
    head.material_cost,
    decLiteral(opts.materialCost, '提交材料成本'),
    '单头材料成本落库'
  );
  expectDecEquals(
    head.processing_fee,
    decLiteral(opts.processingFee, '提交加工费'),
    '单头加工费落库'
  );
  expectDecEquals(head.freight_fee, decLiteral(opts.freightFee, '提交运费'), '单头运费落库');
  expectDecEquals(head.tax_amount, decLiteral(opts.taxAmount, '提交进项税额'), '单头税额落库');
  expectDecEquals(
    head.standard_loss_rate,
    decLiteral(opts.standardLossRate, '提交标准损耗率'),
    '单头标准损耗率落库'
  );
  expect(head.status, '单头状态回读').toBe('draft');

  let firstItemId = 0;
  for (const it of opts.items) {
    const item = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-orders/items',
      {
        outsourcing_order_id: orderId,
        product_id: opts.productId,
        color_no: opts.colorNo,
        dye_lot_no: it.dyeLotNo,
        batch_no: it.batchNo,
        warehouse_id: it.warehouseId,
        quantity: it.quantity,
        unit: '米',
        unit_cost: it.unitCost,
        processing_fee: it.processingFee,
        freight_fee: it.freightFee,
        piece_no: it.pieceNo,
        remarks: `E2E-441-${opts.tag}-缸${it.dyeLotNo}`,
      }
    );
    const itemId = requireId(item, `发料明细 缸=${it.dyeLotNo} 匹=${it.pieceNo}`);
    if (firstItemId === 0) firstItemId = itemId;
    expect(String(item.piece_no), `明细匹号回显`).toBe(it.pieceNo);
    // total_cost 是后端派生列（= quantity × unit_cost），按十进制定标逐分核对
    expectDecEquals(
      item.total_cost,
      decMul(decLiteral(it.quantity, '提交明细数量'), decLiteral(it.unitCost, '提交明细单位成本')),
      `明细 ${itemId} 总成本（后端派生 = 数量×单位成本）`
    );
  }

  const items = await readOutsourcingItems(page, orderId);
  expect(items.length, `发料明细行数（订单 ${orderId}）`).toBe(opts.items.length);
  for (const it of opts.items) {
    const hit = items.find(r => String(r.piece_no) === it.pieceNo);
    if (!hit) {
      throw new Error(
        `[${opts.tag}] GET /production/outsourcing-orders/items/by-order/${orderId} 未命中匹 ${it.pieceNo}，` +
          `实际匹号集=${items.map(r => r.piece_no).join(',') || '(空)'}`
      );
    }
    expect(String(hit.dye_lot_no), `明细 ${it.pieceNo} 缸号逐字符落库`).toBe(it.dyeLotNo);
    expect(String(hit.batch_no), `明细 ${it.pieceNo} 匹号逐字符落库`).toBe(it.batchNo);
    expect(String(hit.color_no), `明细 ${it.pieceNo} 色号逐字符落库`).toBe(opts.colorNo);
    expectDecScaleAtMost(hit.processing_fee, 4, `明细 ${it.pieceNo} 分摊加工费`);
    expectDecEquals(
      hit.processing_fee,
      decLiteral(it.processingFee, '提交分摊加工费'),
      `明细 ${it.pieceNo} 分摊加工费落库`
    );
    expectDecEquals(
      hit.freight_fee,
      decLiteral(it.freightFee, '提交分摊运费'),
      `明细 ${it.pieceNo} 分摊运费落库`
    );
  }

  return { orderId, orderNo, itemId: firstItemId, dyeLotNo: opts.dyeLotNo, colorNo: opts.colorNo };
}

async function readOutsourcingItems(
  page: Page,
  orderId: number
): Promise<Array<Record<string, unknown>>> {
  const data = await apiCallRaw<unknown>(
    page,
    'GET',
    `/production/outsourcing-orders/items/by-order/${orderId}`
  );
  return pickListArray<Record<string, unknown>>(data, 'bare', `订单 ${orderId} 发料明细列表`);
}

/** 按单号回读委外订单（写后必回读的默认面） */
async function readOrder(page: Page, orderNo: string): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/outsourcing-orders/by-no/${encodeURIComponent(orderNo)}`
  );
}

/** 按单号回读收回单 */
async function readReceipt(page: Page, receiptNo: string): Promise<Record<string, unknown>> {
  return apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/outsourcing-receipts/by-no/${encodeURIComponent(receiptNo)}`
  );
}

/** 按订单 + 凭证类型回读委外凭证（列表出参恒为 PaginatedResponse.items） */
async function readVouchers(
  page: Page,
  orderId: number,
  voucherType: string
): Promise<Array<Record<string, unknown>>> {
  const data = await apiCallRaw<unknown>(
    page,
    'GET',
    `/production/outsourcing-vouchers?outsourcing_order_id=${orderId}&voucher_type=${voucherType}&page=1&page_size=20`
  );
  return pickListArray<Record<string, unknown>>(
    data,
    'items',
    `订单 ${orderId} ${voucherType} 凭证列表`
  );
}

/** 回仓确认生成的染色匹（按缸号 + 产品 + 仓库定位；写入方口径 batch_no=缸号、piece_type=dyed） */
async function readDyedPieces(
  page: Page,
  dims: { productId: number; warehouseId: number; dyeLotNo: string }
): Promise<Array<Record<string, unknown>>> {
  const data = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/pieces?product_id=${dims.productId}&warehouse_id=${dims.warehouseId}` +
      `&dye_lot_no=${encodeURIComponent(dims.dyeLotNo)}&page=1&page_size=100`
  );
  const rows = pickListArray<Record<string, unknown>>(data, 'items', `缸 ${dims.dyeLotNo} 匹列表`);
  return rows.filter(
    r => String(r.dye_lot_no) === dims.dyeLotNo && Number(r.product_id) === dims.productId
  );
}

/**
 * 建收回单（draft）。质量结论/实测三列按入参原样送，缺省即不送键（真实"未补录/未判定"形态）。
 * 返回收回单 id 与单号。
 */
async function openReceipt(
  page: Page,
  opts: {
    tag: string;
    orderId: number;
    productId: number;
    warehouseId: number;
    dyeLotNo: string;
    colorNo: string;
    batchNo: string;
    returnQuantity: string;
    qualityStatus?: string;
    grade?: string;
    weight?: string;
    width?: string;
    gramWeight?: string;
  }
): Promise<{ receiptId: number; receiptNo: string }> {
  const receiptNo = genCode(`${opts.tag}RC`);
  const body: Record<string, unknown> = {
    receipt_no: receiptNo,
    outsourcing_order_id: opts.orderId,
    receipt_date: todayStr(),
    product_id: opts.productId,
    dye_lot_no: opts.dyeLotNo,
    color_no: opts.colorNo,
    batch_no: opts.batchNo,
    warehouse_id: opts.warehouseId,
    return_quantity: opts.returnQuantity,
  };
  if (opts.qualityStatus !== undefined) body.quality_status = opts.qualityStatus;
  if (opts.grade !== undefined) body.grade = opts.grade;
  if (opts.weight !== undefined) body.weight = opts.weight;
  if (opts.width !== undefined) body.width = opts.width;
  if (opts.gramWeight !== undefined) body.gram_weight = opts.gramWeight;
  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/outsourcing-receipts',
    body
  );
  const receiptId = requireId(created, `收回单 ${receiptNo}`);
  return { receiptId, receiptNo };
}

/**
 * 一条完整可用的染色委外链前置：单头 + 明细 + 发料 + 加工中。
 * 返回订单主键、缸号/色号与匹信息，供各条腿继续推进到收回/确认/结算。
 */
async function chainToProcessing(
  page: Page,
  tag: string
): Promise<{
  product: OwnProduct;
  fixture: DyeingOrderFixture;
  pieceNo: string;
  greigeWhId: number;
  inboundWhId: number;
}> {
  const ctx = getCtx();
  if (!ctx.supplierId)
    throw new Error(`[${tag}] 前置缺失：ctx.supplierId 未就绪（委外单必填加工厂）`);
  const product = await ownProduct(page, tag);
  const wh = await pickChainWarehouses(page, tag);
  const [piece] = await ownGreigePieces(page, {
    productId: product.id,
    warehouseId: wh.greigeId,
    pieceCount: 1,
    lengthPerPiece: '200.5',
    totalQuantity: '200.5',
    tag,
  });
  const dyeLotNo = genDyeLotNo();
  const colorNo = `E441C-${genCode(tag)}`;
  const fixture = await openDyeingOrder(page, {
    tag,
    productId: product.id,
    supplierId: ctx.supplierId,
    dyeLotNo,
    colorNo,
    issueQuantity: '200.5',
    materialCost: '2005',
    processingFee: '100.25',
    freightFee: '50.75',
    taxAmount: '15.10',
    standardLossRate: '0.05',
    items: [
      {
        pieceNo: piece.pieceNo,
        warehouseId: wh.greigeId,
        batchNo: `B-${dyeLotNo}`,
        dyeLotNo,
        quantity: '200.5',
        unitCost: '10',
        processingFee: '100.25',
        freightFee: '50.75',
      },
    ],
  });
  await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/issue`);
  await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/processing`);
  const processing = await readOrder(page, fixture.orderNo);
  expect(String(processing.status), `${tag} 前置链推进到加工中`).toBe('processing');
  return {
    product,
    fixture,
    pieceNo: piece.pieceNo,
    greigeWhId: wh.greigeId,
    inboundWhId: wh.inboundId,
  };
}

test.describe('441 委外染整链：缸号/批次持久化 · 缸差与缩率口径 · 染费运费分摊归集 · 返工反向腿 · 跨角色可见性 · 时序门控', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('441-01 建档→发料→加工→回仓确认：缸号/色号/匹号/米数/卷数/仓库每节点回读逐字段同源', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { product, fixture, pieceNo, inboundWhId } = await chainToProcessing(page, 'A');
    const issued = await readOrder(page, fixture.orderNo);

    // 发料节点：状态、发料凭证号前缀与逐字段同源（凭证号由后端生成，用例只验非空与归属）
    expect(String(issued.status), '发料后订单态').toBe('processing');
    const voucherNoIssue = String(issued.voucher_no_issue ?? '');
    expect(
      voucherNoIssue.startsWith('OVIS'),
      `发料凭证号必须由后端以 OVIS 前缀生成，实际=${JSON.stringify(issued.voucher_no_issue)}`
    ).toBe(true);
    const issueVouchers = await readVouchers(page, fixture.orderId, 'issue');
    expect(issueVouchers.length, '发料凭证行数（发料一次，恰一张）').toBe(1);
    expect(String(issueVouchers[0].voucher_no), '发料凭证号与单头回写值同源').toBe(voucherNoIssue);
    expectDecEqualsEachOther(
      issueVouchers[0].amount,
      issued.material_cost,
      '发料凭证金额=单头材料成本'
    );

    // 加工中：缸号/色号/匹号在订单侧不得漂移
    expect(String(issued.dye_lot_no), '加工中订单缸号仍与建档逐字符相同').toBe(fixture.dyeLotNo);
    expect(String(issued.color_no), '加工中订单色号仍与建档逐字符相同').toBe(fixture.colorNo);
    const itemsAfterIssue = await readOutsourcingItems(page, fixture.orderId);
    expect(String(itemsAfterIssue[0].piece_no), '发料明细匹号在发料后不变').toBe(pieceNo);

    // 回仓单建档：实测三列如实落库（NULL=未补录，禁止回落主数据）
    const batchNo = `B-${fixture.dyeLotNo}`;
    const returnQuantity = '190.475';
    const { receiptId, receiptNo } = await openReceipt(page, {
      tag: 'A',
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
      colorNo: fixture.colorNo,
      batchNo,
      returnQuantity,
      qualityStatus: 'qualified',
      grade: 'A',
      weight: '30.25',
      width: '160',
      gramWeight: '180',
    });
    const draftReceipt = await readReceipt(page, receiptNo);
    expect(String(draftReceipt.status), '收回单初始态').toBe('draft');
    expect(String(draftReceipt.dye_lot_no), '收回单缸号逐字符落库').toBe(fixture.dyeLotNo);
    expect(String(draftReceipt.color_no), '收回单色号逐字符落库').toBe(fixture.colorNo);
    expect(String(draftReceipt.batch_no), '收回单匹号逐字符落库').toBe(batchNo);
    expect(Number(draftReceipt.outsourcing_order_id), '收回单归属订单').toBe(fixture.orderId);
    expect(Number(draftReceipt.warehouse_id), '收回单入库仓库').toBe(inboundWhId);
    expectDecScaleAtMost(draftReceipt.return_quantity, 4, '收回单收回数量');
    expectDecEquals(
      draftReceipt.return_quantity,
      decLiteral(returnQuantity, '提交收回数量'),
      '收回数量落库逐分对平'
    );
    expect(String(draftReceipt.quality_status), '收回单质检结论落库值（写入方词表）').toBe(
      'qualified'
    );
    expect(String(draftReceipt.grade), '收回单等级落库值').toBe('A');
    for (const [key, literal, label] of [
      ['weight', '30.25', '收回单实测重量'],
      ['width', '160', '收回单实测幅宽'],
      ['gram_weight', '180', '收回单实测克重'],
    ] as const) {
      expectDecScaleAtMost(draftReceipt[key], 4, label);
      expectDecEquals(draftReceipt[key], decLiteral(literal, label), `${label}落库`);
    }
    // 确认前不得有派生成本与入库凭证（避免"半推进"假象）
    expect(draftReceipt.inspection_id, '未确认不得生成质检记录').toBeNull();

    // 确认收回：损耗/成本派生值只认后端出参，再回读逐字段比对
    const confirmed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-receipts/${receiptId}/confirm`
    );
    expect(String(confirmed.status), '确认出参态').toBe('confirmed');
    expect(
      String(confirmed.loss_type),
      '确认派生损耗类型（发出 200.5、收回 190.475 → 实际损耗率=标准 0.05）'
    ).toBe('normal');
    expect(confirmed.is_loss_normal, '正常损耗标记').toBe(true);
    const receiptAfter = await readReceipt(page, receiptNo);
    expect(String(receiptAfter.status), '确认落库后收回单态').toBe('confirmed');
    expectDecScaleAtMost(receiptAfter.loss_rate, 4, '收回单损耗率(8,4)');
    expectDecEquals(
      receiptAfter.loss_rate,
      decLiteral('0.05', '发出 200.5 与收回 190.475 的损耗率'),
      '后端派生损耗率必须逐值命中'
    );
    expectDecEquals(
      receiptAfter.loss_quantity,
      decLiteral('10.025', '发出减收回'),
      '后端派生损耗数量必须逐值命中'
    );
    expectDecEquals(
      receiptAfter.abnormal_loss_amount,
      decLiteral('0', '未超定额无非正常损耗'),
      '非正常损耗金额'
    );

    // 库存细码联动：确认收回生成 1 卷染色匹，米数=收回数量、缸号/色号/仓库同源、batch_no=缸号
    const pieces = await readDyedPieces(page, {
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
    });
    expect(pieces.length, '一次确认收回恰生成一卷').toBe(1);
    const piece = pieces[0];
    expect(String(piece.piece_type), '确认收回生成染色匹（有缸号）').toBe('dyed');
    expect(String(piece.dye_lot_no), '匹行缸号与收回单逐字符同源').toBe(fixture.dyeLotNo);
    expect(String(piece.color_no), '匹行色号与收回单逐字符同源').toBe(fixture.colorNo);
    expect(String(piece.batch_no), '匹行批次=缸号（写入方口径）').toBe(fixture.dyeLotNo);
    expect(Number(piece.warehouse_id), '匹行入库仓库=收回单仓库').toBe(inboundWhId);
    expectDecScaleAtMost(piece.length, 4, '匹行米数');
    expectDecEqualsEachOther(piece.length, receiptAfter.return_quantity, '匹行米数=收回单收回数量');
    for (const [key, label] of [
      ['weight', '匹行实测重量透传'],
      ['width', '匹行实测幅宽透传'],
      ['gram_weight', '匹行实测克重透传'],
    ] as const) {
      expectDecEqualsEachOther(piece[key], receiptAfter[key], `${label}与收回单同源`);
    }

    // 订单侧同一事务的联动字段：状态、实际收回日期、入库凭证号、成本与损耗派生
    const orderAfter = await readOrder(page, fixture.orderNo);
    expect(String(orderAfter.status), '确认后订单态').toBe('received');
    expect(String(orderAfter.actual_return_date), '实际收回日期由后端回写为收回单日期').toBe(
      todayStr()
    );
    expect(
      String(orderAfter.voucher_no_receipt ?? '').startsWith('OVRC'),
      '入库凭证号前缀 OVRC'
    ).toBe(true);
    for (const key of [
      'return_quantity',
      'loss_quantity',
      'loss_rate',
      'abnormal_loss_amount',
      'total_cost',
      'unit_cost',
    ] as const) {
      expectDecEqualsEachOther(
        orderAfter[key],
        receiptAfter[key],
        `订单与收回单 ${key} 同事务同源`
      );
    }
    expect(
      String(orderAfter.loss_type),
      `订单与收回单损耗类型同源（实际订单=${JSON.stringify(orderAfter.loss_type)} 收回单=${JSON.stringify(receiptAfter.loss_type)}）`
    ).toBe(String(receiptAfter.loss_type));

    // 成本归集与库存同口径：入库凭证金额 = 单头总成本 = 收回单总成本
    const receiptVouchers = await readVouchers(page, fixture.orderId, 'receipt');
    expect(receiptVouchers.length, '入库凭证恰一张').toBe(1);
    expectDecEqualsEachOther(
      receiptVouchers[0].amount,
      orderAfter.total_cost,
      '入库凭证金额=单头总成本'
    );
    expectDecEqualsEachOther(
      receiptVouchers[0].amount,
      receiptAfter.total_cost,
      '入库凭证金额=收回单总成本'
    );
    expect(String(receiptVouchers[0].voucher_no), '入库凭证号与单头回写同源').toBe(
      String(orderAfter.voucher_no_receipt)
    );
    // 正常损耗不造损耗处理凭证（凭证族的分支必须真实存在，不许靠宽容断言蒙过）
    const lossVouchers = await readVouchers(page, fixture.orderId, 'loss');
    expect(lossVouchers.length, '正常损耗不得落损耗处理凭证').toBe(0);
  });

  test('441-02 缸差与缩率数值口径：色差疵点参与评级派生、缩率检测结论按后端比较方向出参，十进制位数按列定标', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { product, fixture, inboundWhId } = await chainToProcessing(page, 'B');
    const returnQuantity = '150';
    const { receiptId } = await openReceipt(page, {
      tag: 'B',
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
      colorNo: fixture.colorNo,
      batchNo: `B-${fixture.dyeLotNo}`,
      returnQuantity,
      qualityStatus: 'qualified',
      grade: 'A',
      weight: '28.5',
      width: '160',
      gramWeight: '185',
    });
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${receiptId}/confirm`);
    const confirmedReceipt = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/${receiptId}`
    );
    expect(String(confirmedReceipt.status), '前置：收回单已确认').toBe('confirmed');

    // 基准面：无疵点验布单，评级派生分与 A/B/C 分级
    const baseInsp = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/fabric-inspections',
      {
        dye_lot_no: fixture.dyeLotNo,
        color_no: fixture.colorNo,
        product_id: product.id,
        product_name: product.name,
        inspection_date: todayStr(),
        scoring_system: 'four_point',
        fabric_width_inches: '62',
        remarks: `E2E-441-BASE-${fixture.dyeLotNo}`,
      }
    );
    const baseId = requireId(baseInsp, '基准验布记录');
    CLEANUP.push({
      path: `/production/fabric-inspections/${baseId}`,
      label: `fabric_inspection#${baseId}`,
    });
    const baseHead = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/fabric-inspections/${baseId}`
    );
    expect(String(baseHead.status), '验布单初始态（小写词表）').toBe('pending');
    expect(String(baseHead.dye_lot_no), '验布单缸号与委外缸号逐字符同源').toBe(fixture.dyeLotNo);
    expect(String(baseHead.color_no), '验布单色号与委外色号逐字符同源').toBe(fixture.colorNo);
    await apiCall(page, 'POST', `/production/fabric-inspections/${baseId}/start`);
    await apiCall(page, 'POST', `/production/fabric-inspections/${baseId}/grade`, {
      inspected_yards: '100',
      qualification_rate: '97',
    });
    const baseGraded = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/fabric-inspections/${baseId}`
    );
    expect(String(baseGraded.status), '评级后态').toBe('graded');
    expectDecEquals(
      baseGraded.points_per_100_sq_yards,
      decLiteral('0', '无疵点派生分'),
      '无疵点基准派生分'
    );

    // 缸差面：验布中登记色差疵点（color_diff），评级派生分必须由后端随之上调
    const dyeInsp = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/fabric-inspections',
      {
        dye_lot_no: fixture.dyeLotNo,
        color_no: fixture.colorNo,
        product_id: product.id,
        product_name: product.name,
        inspection_date: todayStr(),
        scoring_system: 'four_point',
        fabric_width_inches: '62',
        remarks: `E2E-441-DIFF-${fixture.dyeLotNo}`,
      }
    );
    const dyeId = requireId(dyeInsp, '缸差验布记录');
    CLEANUP.push({
      path: `/production/fabric-inspections/${dyeId}`,
      label: `fabric_inspection#${dyeId}`,
    });
    await apiCall(page, 'POST', `/production/fabric-inspections/${dyeId}/start`);
    const defect = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/fabric-defects',
      {
        inspection_id: dyeId,
        defect_type: 'color_diff',
        position_yards: '12.5',
        defect_length_inches: '3.25',
        direction: '纬向',
        is_hole: false,
        is_continuous: false,
        is_half_width: false,
        description: `E2E-441 缸差 ${fixture.dyeLotNo}`,
      }
    );
    const defectId = requireId(defect, '色差疵点行');
    expect(String(defect.defect_type), '疵点类型逐字符落出参').toBe('color_diff');
    expectDecScaleAtMost(defect.position_yards, 2, '疵点位置码数');
    expectDecScaleAtMost(defect.defect_length_inches, 2, '疵点长度英寸');

    const defectRows = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(page, 'GET', `/production/fabric-inspections/${dyeId}/defects`),
      'bare',
      `验布单 ${dyeId} 疵点列表`
    );
    const defectHit = defectRows.find(r => Number(r.id) === defectId);
    if (!defectHit) {
      throw new Error(
        `缸差疵点行未落到验布单 ${dyeId} 的疵点列表（实得 id 集=${defectRows.map(r => r.id).join(',') || '(空)'}）`
      );
    }
    expect(String(defectHit.defect_type), '疵点行按验布单回读类型逐字符').toBe('color_diff');
    expectDecEqualsEachOther(
      defectHit.position_yards,
      defect.position_yards,
      '疵点位置码数落库与出参同源'
    );
    expectDecEqualsEachOther(
      defectHit.defect_length_inches,
      defect.defect_length_inches,
      '疵点长度落库与出参同源'
    );

    await apiCall(page, 'POST', `/production/fabric-inspections/${dyeId}/grade`, {
      inspected_yards: '100',
      qualification_rate: '97',
    });
    const diffGraded = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/fabric-inspections/${dyeId}`
    );
    expectDecScaleAtMost(diffGraded.points_per_100_sq_yards, 4, '带色差疵点的派生分');
    expectDecGreaterThanEachOther(
      diffGraded.points_per_100_sq_yards,
      baseGraded.points_per_100_sq_yards,
      '登记色差疵点后每百平方码分数必须由后端上调（与无疵点基准比）'
    );
    expect(
      ['A', 'B', 'C'].includes(String(diffGraded.abc_grade)),
      `评级 A/B/C 词表内取值，实际=${JSON.stringify(diffGraded.abc_grade)}`
    ).toBe(true);

    // 越界疵点类型：取值域白名单在写入侧拒绝，且不落行
    const badDefect = await apiCallExpectFail(page, 'POST', '/production/fabric-defects', {
      inspection_id: dyeId,
      defect_type: 'colorDifference',
      position_yards: '1',
      defect_length_inches: '1',
    });
    expect(badDefect.status, '越界疵点类型必须 400').toBe(400);
    expect(failureCode(badDefect), '越界疵点类型机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const rowsAfterBad = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(page, 'GET', `/production/fabric-inspections/${dyeId}/defects`),
      'bare',
      `被拒后验布单 ${dyeId} 疵点列表`
    );
    expect(rowsAfterBad.length, '被拒的越界疵点不得留下任何行').toBe(defectRows.length);

    // 缩率腿：test_result 不提交，由后端按 standard_value 与 test_value 的比较方向派生
    const shrinkFail = unwrapDoubleEnvelope(
      await apiCallRaw<Record<string, unknown>>(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: dyeId,
          test_item: 'shrinkage',
          test_value: '2.50',
          standard_value: '3.00',
          remarks: `E2E-441-SHRINK-LOW-${fixture.dyeLotNo}`,
        }
      ),
      '缩率检测（低于标准值）'
    );
    expect(String(shrinkFail.test_item), '缩率检测项逐字符出参').toBe('shrinkage');
    expect(String(shrinkFail.test_result), '缩率低于标准值必须由后端派生 fail').toBe('fail');
    // (12,2) 列定标：实测值与标准值的小数位不得多于 2（多出的分位必须已被列定标收敛，不许测试再舍一次）
    expectDecScaleAtMost(shrinkFail.test_value, 2, '缩率实测值(12,2)');
    expectDecScaleAtMost(shrinkFail.standard_value, 2, '缩率标准值(12,2)');
    expectDecEquals(
      shrinkFail.test_value,
      decLiteral('2.50', '提交缩率'),
      '缩率实测值落库逐分对平'
    );
    expectDecEquals(
      shrinkFail.standard_value,
      decLiteral('3.00', '提交标准值'),
      '缩率标准值落库逐分对平'
    );
    expect(Number(shrinkFail.inspection_id), '缩率检测行锚定验布单').toBe(dyeId);

    // 相等即判 pass：钉住后端比较方向为 >=，不许测试自己重算再对比自己
    const shrinkPass = unwrapDoubleEnvelope(
      await apiCallRaw<Record<string, unknown>>(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: dyeId,
          test_item: 'weight_gsm',
          test_value: '185',
          standard_value: '185',
          remarks: `E2E-441-WEIGHT-EQUAL-${fixture.dyeLotNo}`,
        }
      ),
      '克重检测（等于标准值）'
    );
    expect(String(shrinkPass.test_result), '实测值等于标准值必须判 pass（方向 >=）').toBe('pass');
    expectDecEquals(shrinkPass.test_value, decLiteral('185', '提交克重'), '克重实测值落库逐分对平');

    // 越界检测项目 + 负数实测值：均拒绝，且不得落行
    const badItem = await apiCallExpectFail(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      {
        inspection_id: dyeId,
        test_item: 'shrinkage_rate',
        test_value: '1',
        standard_value: '3',
      }
    );
    expect(badItem.status, '越界检测项目必须 400').toBe(400);
    expect(failureCode(badItem), '越界检测项目机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const negativeValue = await apiCallExpectFail(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      { inspection_id: dyeId, test_item: 'shrinkage', test_value: '-1', standard_value: '3' }
    );
    expect(negativeValue.status, '负数实测值必须 400').toBe(400);
    expect(failureCode(negativeValue), '负数实测值机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 已完成（rolled）验布单不得再录物理指标：状态门真实存在
    await apiCall(page, 'POST', `/production/fabric-inspections/${dyeId}/roll`, {
      warehouse_id: inboundWhId,
      roll_length: '120.5',
      roll_weight: '30.25',
      roll_width: '160',
      roll_gram_weight: '185',
    });
    const rolledHead = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/fabric-inspections/${dyeId}`
    );
    expect(String(rolledHead.status), '打卷后验布态').toBe('rolled');
    const tooLate = await apiCallExpectFail(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      {
        inspection_id: dyeId,
        test_item: 'pilling',
        test_value: '4',
        standard_value: '3',
      }
    );
    expect(tooLate.status, '已打卷单据再录物理指标必须 400').toBe(400);
    expect(failureCode(tooLate), '已打卷录入物理指标机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(tooLate.message ?? ''),
      '该拒绝属可外显族，必须点名状态门（仅验布中/已评级可录入）'
    ).toContain('仅验布中(inspecting)或已评级(graded)状态可录入物理指标');
  });

  test('441-03 染费与运费按缸/批分摊到成本归集：明细合计=单头三费=凭证金额逐分对平，四位小数分摊额不被舍入掩盖', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const ctx = getCtx();
    if (!ctx.supplierId) throw new Error('441-03 前置缺失：ctx.supplierId 未就绪');
    const tag = 'C';
    const product = await ownProduct(page, tag);
    const wh = await pickChainWarehouses(page, tag);
    const pieces = await ownGreigePieces(page, {
      productId: product.id,
      warehouseId: wh.greigeId,
      pieceCount: 2,
      lengthPerPiece: '150',
      totalQuantity: '300',
      tag,
    });
    const lotA = genDyeLotNo();
    const lotB = genDyeLotNo();
    const colorNo = `E441C-${genCode(tag)}`;
    const fixture = await openDyeingOrder(page, {
      tag,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: lotA,
      colorNo,
      // 单头三费用四位小数分摊额之和，任何把分摊舍到两位的实现都会在这里露出分差
      issueQuantity: '300',
      materialCost: '3000',
      processingFee: '100',
      freightFee: '50.75',
      taxAmount: '12',
      // 标准损耗率 0.03：本条腿故意超定额，走非正常损耗分支（损耗处理凭证 + 进项税转出）
      standardLossRate: '0.03',
      items: [
        {
          pieceNo: pieces[0].pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${lotA}`,
          dyeLotNo: lotA,
          quantity: '150',
          unitCost: '20.0025',
          processingFee: '33.3333',
          freightFee: '0.0001',
        },
        {
          pieceNo: pieces[1].pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${lotB}`,
          dyeLotNo: lotB,
          quantity: '150',
          unitCost: '20',
          processingFee: '66.6667',
          freightFee: '50.7499',
        },
      ],
    });

    // 明细分摊合计 vs 单头三费：逐分对平（BigDecimal 定标比较，不做浮点、不做容差）
    const items = await readOutsourcingItems(page, fixture.orderId);
    expect(items.length, '两缸各一条发料明细').toBe(2);
    const sumItemFee = items
      .map(r => decFromRaw(r.processing_fee, '明细加工费'))
      .reduce((acc, d) => decAdd(acc, d), decLiteral('0', '累加初值'));
    const sumItemFreight = items
      .map(r => decFromRaw(r.freight_fee, '明细运费'))
      .reduce((acc, d) => decAdd(acc, d), decLiteral('0', '累加初值'));
    const orderHead = await readOrder(page, fixture.orderNo);
    expectDecEquals(orderHead.processing_fee, sumItemFee, '明细分摊加工费合计=单头');
    expectDecEquals(orderHead.freight_fee, sumItemFreight, '明细分摊运费合计=单头');
    // 四位小数分摊额本身的线格式：不得被截到两位（截了就会让上面的合计差在分位）
    for (const r of items) {
      expectDecScaleAtMost(r.processing_fee, 4, `明细 ${r.piece_no} 加工费(14,4)`);
      expectDecScaleAtMost(r.freight_fee, 4, `明细 ${r.piece_no} 运费(14,4)`);
    }

    // 明细总成本派生随数量更新而变（后端唯一写入点：quantity×unit_cost）
    const targetItem = items[0];
    const itemId = requireId(targetItem, '缸1 明细');
    const beforeTotal = decFromRaw(targetItem.total_cost, '更新前明细总成本');
    await apiCall(page, 'PUT', `/production/outsourcing-orders/items/${itemId}`, {
      quantity: '160',
      unit_cost: '20.0025',
    });
    const itemsAfterPut = await readOutsourcingItems(page, fixture.orderId);
    const hit = itemsAfterPut.find(r => Number(r.id) === itemId);
    if (!hit) throw new Error(`更新后未回读到明细 ${itemId}`);
    const expectedTotal = decMul(
      decLiteral('160', '更新数量'),
      decLiteral('20.0025', '更新单位成本')
    );
    expectDecEquals(hit.total_cost, expectedTotal, '明细总成本必须随数量/单价重算');
    expect(
      decCmp(decFromRaw(hit.total_cost, '更新后明细总成本'), beforeTotal) !== 0,
      '总成本必须真实变动（不许写而不进）'
    ).toBe(true);

    // 发料→加工→超定额收回：非正常损耗分支与四步分录凭证
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/issue`);
    const { receiptId, receiptNo } = await openReceipt(page, {
      tag,
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: wh.inboundId,
      dyeLotNo: lotA,
      colorNo,
      batchNo: `B-${lotA}`,
      // 发出 300、收回 285 → 损耗 15，损耗率 0.05 > 标准 0.03 → abnormal
      returnQuantity: '285',
      qualityStatus: 'concession',
      grade: 'B',
      weight: '55',
      width: '160',
      gramWeight: '190',
    });
    const confirmed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-receipts/${receiptId}/confirm`
    );
    expect(String(confirmed.loss_type), '超定额损耗必须判非正常').toBe('abnormal');
    expect(confirmed.is_loss_normal, '非正常损耗标记').toBe(false);
    const receiptAfter = await readReceipt(page, receiptNo);
    expectDecScaleAtMost(receiptAfter.loss_rate, 4, '损耗率(8,4)');
    expectDecEquals(
      receiptAfter.loss_rate,
      decLiteral('0.05', '15 / 300'),
      '后端派生损耗率逐值命中'
    );
    expectDecScaleAtMost(receiptAfter.abnormal_loss_amount, 4, '非正常损耗金额(14,4)');
    expect(
      decCmp(
        decFromRaw(receiptAfter.abnormal_loss_amount, '非正常损耗金额'),
        decLiteral('0', '零')
      ) > 0,
      `超定额必须产出正的非正常损耗金额，实际=${JSON.stringify(receiptAfter.abnormal_loss_amount)}`
    ).toBe(true);

    const orderReceived = await readOrder(page, fixture.orderNo);
    expect(String(orderReceived.status), '确认后订单态').toBe('received');
    // 总成本 = 材料 + 加工费 + 运费 − 非正常损耗（三个加项都取后端出参，减项亦取后端出参）
    const expectTotal = decSub3(
      decFromRaw(orderReceived.material_cost, '单头材料成本'),
      decFromRaw(orderReceived.processing_fee, '单头加工费'),
      decFromRaw(orderReceived.freight_fee, '单头运费'),
      decFromRaw(orderReceived.abnormal_loss_amount, '单头非正常损耗金额')
    );
    expectDecEquals(orderReceived.total_cost, expectTotal, '单头总成本必须按后端口径落库');
    expectDecEqualsEachOther(
      receiptAfter.total_cost,
      orderReceived.total_cost,
      '收回单与单头总成本同源'
    );

    const receiptVouchers = await readVouchers(page, fixture.orderId, 'receipt');
    expect(receiptVouchers.length, '入库凭证恰一张').toBe(1);
    expectDecEqualsEachOther(
      receiptVouchers[0].amount,
      orderReceived.total_cost,
      '入库凭证金额=单头总成本'
    );
    const lossVouchers = await readVouchers(page, fixture.orderId, 'loss');
    expect(lossVouchers.length, '非正常损耗必须落一张损耗处理凭证').toBe(1);
    expectDecEqualsEachOther(
      lossVouchers[0].amount,
      orderReceived.abnormal_loss_amount,
      '损耗处理凭证金额=单头非正常损耗金额'
    );
    // 进项税转出列必须存在且为十进制字符串（转出额由后端按单据税额反推，用例不重算）
    const transfer = expectDecScaleAtMost(
      lossVouchers[0].tax_transfer_amount,
      4,
      '损耗处理凭证进项税转出额(14,4)'
    );
    expect(
      decCmp(transfer, decLiteral('0', '零')) >= 0,
      `进项税转出额不得为负，实际=${JSON.stringify(lossVouchers[0].tax_transfer_amount)}`
    ).toBe(true);

    // 结算：加工费凭证金额 = 单头加工费 + 运费（合计面与明细面同时闭合）
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/settle`);
    const settled = await readOrder(page, fixture.orderNo);
    expect(String(settled.status), '结算后订单态').toBe('settled');
    expect(String(settled.voucher_no_fee ?? '').startsWith('OVFE'), '加工费凭证号前缀 OVFE').toBe(
      true
    );
    const feeVouchers = await readVouchers(page, fixture.orderId, 'fee');
    expect(feeVouchers.length, '加工费凭证恰一张').toBe(1);
    const expectFeeAmount = decAdd(
      decFromRaw(settled.processing_fee, '结算侧加工费'),
      decFromRaw(settled.freight_fee, '结算侧运费')
    );
    expectDecEquals(
      feeVouchers[0].amount,
      expectFeeAmount,
      '加工费凭证金额=加工费+运费（后端出参相加）'
    );
    expectDecEqualsEachOther(
      feeVouchers[0].tax_amount,
      settled.tax_amount,
      '加工费凭证税额=单头进项税额（同源）'
    );
    // 关账：已结算单必须能关闭，且成本字段不得因关闭而漂移
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/close`);
    const closed = await readOrder(page, fixture.orderNo);
    expect(String(closed.status), '关闭后订单态').toBe('closed');
    expectDecEqualsEachOther(closed.total_cost, settled.total_cost, '关闭不得改写总成本');
    expectDecEqualsEachOther(closed.unit_cost, settled.unit_cost, '关闭不得改写单位成本');
  });

  test('441-04 委外返工反向腿：判不合格→质检记录零合格量→缸号色差回修单状态机；二次收回与非法跳转被 400 判负', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { product, fixture, inboundWhId } = await chainToProcessing(page, 'D');
    const returnQuantity = '120';
    const batchNo = `B-${fixture.dyeLotNo}`;
    const { receiptId, receiptNo } = await openReceipt(page, {
      tag: 'D',
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
      colorNo: fixture.colorNo,
      batchNo,
      returnQuantity,
      qualityStatus: 'unqualified',
      grade: 'C',
      weight: '22.5',
      width: '158',
      gramWeight: '175',
    });
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${receiptId}/confirm`);

    // 不合格 → 自动质检记录必须全额计不合格（数量口径以后端出参为准）
    const confirmed = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/outsourcing-receipts/${receiptId}`
    );
    expect(String(confirmed.quality_status), '不合格结论落库').toBe('unqualified');
    const inspectionId = Number(confirmed.inspection_id);
    if (!Number.isFinite(inspectionId) || inspectionId <= 0) {
      throw new Error(
        `确认收回必须回写自动质检记录 id，实得=${JSON.stringify(confirmed.inspection_id)}`
      );
    }
    const records = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/production/quality-inspection/records?product_id=${product.id}&inspection_type=outsourcing_receipt&page=1&page_size=50`
      ),
      'items',
      `产品 ${product.id} 委外回仓质检记录`
    );
    const record = records.find(r => Number(r.id) === inspectionId);
    if (!record) {
      throw new Error(
        `按 related id 未命中质检记录 ${inspectionId}（实得 id 集=${records.map(r => r.id).join(',') || '(空)'}）`
      );
    }
    expect(String(record.inspection_result), '不合格回仓的质检结论（中文词表，禁英文化）').toBe(
      '不合格'
    );
    expect(String(record.inspection_type), '质检类型取写入方专用值').toBe('outsourcing_receipt');
    expect(String(record.related_type), '反查锚点类型').toBe('outsourcing_receipt');
    expect(Number(record.related_id), '反查锚点指向收回单').toBe(receiptId);
    expect(String(record.dye_lot_no), '质检记录缸号与收回单逐字符同源').toBe(fixture.dyeLotNo);
    expect(String(record.color_no), '质检记录色号与收回单逐字符同源').toBe(fixture.colorNo);
    expectDecEquals(
      record.qualified_qty,
      decLiteral('0', '不合格不得计合格量'),
      '不合格合格量必须为 0'
    );
    expectDecEqualsEachOther(
      record.unqualified_qty,
      confirmed.return_quantity,
      '不合格量=收回数量'
    );
    expectDecEqualsEachOther(record.total_qty, confirmed.return_quantity, '受检总量=收回数量');
    expectDecEquals(record.qualification_rate, decLiteral('0', '合格率'), '不合格合格率必须为 0');
    expect(String(record.grade), '等级透传收回单判定').toBe('C');

    // 反向腿的门：同一订单已收回后二次收回确认必须被判负，且事务零副作用
    const second = await openReceipt(page, {
      tag: 'D2',
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
      colorNo: fixture.colorNo,
      batchNo,
      returnQuantity: '10',
      qualityStatus: 'qualified',
      grade: 'A',
    });
    CLEANUP.push({
      path: `/production/outsourcing-receipts/${second.receiptId}`,
      label: `outsourcing_receipt#${second.receiptId}`,
    });
    const secondConfirmFail = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${second.receiptId}/confirm`
    );
    expect(secondConfirmFail.status, '已收回订单二次确认必须 400').toBe(400);
    expect(
      failureCode(secondConfirmFail),
      '二次确认机器码属业务族（该拒绝为脱敏文案，只锁码）'
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const secondAfterFail = await readReceipt(page, second.receiptNo);
    expect(String(secondAfterFail.status), '被拒的二次收回单仍停留草稿，不得半推进').toBe('draft');
    const orderAfterFail = await readOrder(page, fixture.orderNo);
    expect(String(orderAfterFail.status), '被拒不得改写订单态').toBe('received');
    expectDecEqualsEachOther(
      orderAfterFail.return_quantity,
      confirmed.return_quantity,
      '被拒不得追加收回数量'
    );
    const piecesAfterFail = await readDyedPieces(page, {
      productId: product.id,
      warehouseId: inboundWhId,
      dyeLotNo: fixture.dyeLotNo,
    });
    expect(piecesAfterFail.length, '被拒不得再产匹（该缸卷数仍为 1）').toBe(1);

    // 返工：对同一缸号开色差回修单（回修类型是缸差的权威写法）
    const dyeBatch = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/dye-batches',
      {
        // 白坯建档形态：不送色号与染色批号（写入方按"色号缺失=白坯"归一，禁止占位假色值），
        // 缸号由后端取号生成；回修单只按该档案的 batch_no 建立追溯锚点
        planned_quantity: Number(returnQuantity),
        status: 'inspecting',
        remarks: `E2E-441-REWORK-${fixture.dyeLotNo}`,
      }
    );
    const dyeBatchId = requireId(dyeBatch, '缸号档案');
    const reworkBatchNo = genDyeLotNo();
    const rework = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/dye-batch-reworks',
      {
        original_batch_id: dyeBatchId,
        original_batch_no: String(dyeBatch.batch_no),
        rework_batch_no: reworkBatchNo,
        rework_type: 'color_difference',
        rework_reason: `E2E-441 缸差超限 ${fixture.dyeLotNo}`,
        original_status: 'inspecting',
        remarks: `E2E-441 回修 ${receiptNo}`,
      }
    );
    const reworkId = requireId(rework, '色差回修单');
    expect(String(rework.status), '回修单初始态').toBe('draft');
    expect(String(rework.rework_type), '回修类型逐字符落库').toBe('color_difference');
    const batchHead = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batches/${dyeBatchId}`
    );
    expect(String(batchHead.status), '缸号档案状态逐字段落库回读').toBe('inspecting');
    expect(String(batchHead.batch_no), '回修单引用的原缸号与档案逐字符同源').toBe(
      String(dyeBatch.batch_no)
    );
    const reworkDraft = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(reworkDraft.original_batch_no), '回修单原缸号与缸号档案逐字符同源').toBe(
      String(dyeBatch.batch_no)
    );
    expect(String(reworkDraft.rework_batch_no), '回修缸号逐字符落库回读').toBe(reworkBatchNo);
    expect(
      reworkDraft.rework_cost,
      '回修成本当前无 API 写入口（登记后端疑点，禁止用例伪造成本值）'
    ).toBeNull();

    // 非法跳转：未审批就完成 / 开始，均 400 业务族，且单据原地不动
    const completeTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${reworkId}/complete`
    );
    expect(completeTooEarly.status, '草稿直接完成必须 400').toBe(400);
    expect(failureCode(completeTooEarly), '草稿直接完成机器码').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const startTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${reworkId}/start`
    );
    expect(startTooEarly.status, '草稿直接开始必须 400').toBe(400);
    expect(failureCode(startTooEarly), '草稿直接开始机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const stillDraft = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(stillDraft.status), '被拒不得推进回修态').toBe('draft');

    // 越界回修类型 / 越界前置状态：取值域白名单拒绝且不落行
    const badType = await apiCallExpectFail(page, 'POST', '/production/dye-batch-reworks', {
      original_batch_id: dyeBatchId,
      original_batch_no: String(dyeBatch.batch_no),
      rework_type: 'color_diff',
      rework_reason: 'E2E-441 越界类型',
      original_status: 'inspecting',
    });
    expect(badType.status, '越界回修类型必须 400').toBe(400);
    expect(failureCode(badType), '回修类型越界属可外显校验族').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      String(badType.message ?? ''),
      '越界类型的可外显文案必须逐字列出取值域（把疵点域写法 color_diff 当回修类型提交必被点名）'
    ).toContain(
      '缸号回修类型必须是 color_difference/defect/specification_unqualified/re_dye/replenish_dye/other'
    );
    const badPre = await apiCallExpectFail(page, 'POST', '/production/dye-batch-reworks', {
      original_batch_id: dyeBatchId,
      original_batch_no: String(dyeBatch.batch_no),
      rework_type: 'color_difference',
      rework_reason: 'E2E-441 前置状态不足',
      original_status: 'pending_schedule',
    });
    expect(badPre.status, '待排缸不得发起回修').toBe(400);
    expect(failureCode(badPre), '回修资格门机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const reworkListAfterBad = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/production/dye-batch-reworks?original_batch_id=${dyeBatchId}&page=1&page_size=50`
      ),
      'items',
      `缸 ${dyeBatchId} 回修单列表`
    );
    expect(reworkListAfterBad.length, '两条被拒的回修申请不得留下任何单').toBe(1);

    // 正向推进：审批→开始→完成，每步回读，审批人身份取服务端会话
    await apiCall(page, 'POST', `/production/dye-batch-reworks/${reworkId}/approve`);
    const approved = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(approved.status), '审批后回修态').toBe('approved');
    const approvedBy = Number(approved.approved_by);
    expect(
      Number.isInteger(approvedBy) && approvedBy > 0,
      `审批人必须由服务端会话写入，实得=${JSON.stringify(approved.approved_by)}`
    ).toBe(true);
    expect(
      String(approved.approved_at),
      '审批时间必须由服务端写入为 RFC3339 时间戳，实得=' + JSON.stringify(approved.approved_at)
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // 已审批单不得再编辑（草稿门）
    const editAfterApprove = await apiCallExpectFail(
      page,
      'PUT',
      `/production/dye-batch-reworks/${reworkId}`,
      {
        rework_reason: 'E2E-441 审批后改写',
      }
    );
    expect(editAfterApprove.status, '非草稿回修单不可编辑').toBe(400);
    expect(failureCode(editAfterApprove), '非草稿编辑机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const reasonUnchanged = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(reasonUnchanged.rework_reason), '被拒的改写不得落库').toBe(
      String(approved.rework_reason)
    );

    await apiCall(page, 'POST', `/production/dye-batch-reworks/${reworkId}/start`);
    const inProgress = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(inProgress.status), '开始后回修态').toBe('in_progress');
    await apiCall(page, 'POST', `/production/dye-batch-reworks/${reworkId}/complete`);
    const completed = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(completed.status), '完成后回修态').toBe('completed');
    expect(
      String(completed.completed_at),
      '完成时间必须由服务端写入为 RFC3339 时间戳，实得=' + JSON.stringify(completed.completed_at)
    ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

    // 已完成单据的非法跳转：取消必须被判负；委外侧状态也不得被回修反向改写
    const cancelCompleted = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${reworkId}/cancel`
    );
    expect(cancelCompleted.status, '已完成回修单不可取消').toBe(400);
    expect(failureCode(cancelCompleted), '已完成回修单取消机器码').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterCancelFail = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/dye-batch-reworks/${reworkId}`
    );
    expect(String(afterCancelFail.status), '被拒不得回退终态').toBe('completed');

    const orderAfterRework = await readOrder(page, fixture.orderNo);
    expectDecEqualsEachOther(
      orderAfterRework.total_cost,
      orderAfterFail.total_cost,
      '回修腿不回写委外成本（当前实现无回写路径；登记后端疑点）'
    );
    expectDecEqualsEachOther(
      orderAfterRework.return_quantity,
      orderAfterFail.return_quantity,
      '回修腿不回写收回数量'
    );

    // 已完成委外链上的非法状态跳转：closed 之后取消被判负
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/settle`);
    const settledHead = await readOrder(page, fixture.orderNo);
    expect(String(settledHead.status), '不合格单仍可结算（成本结转不依赖质检结论）').toBe(
      'settled'
    );
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/close`);
    const closedHead = await readOrder(page, fixture.orderNo);
    expect(String(closedHead.status), '关闭后订单态').toBe('closed');
    const cancelClosed = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${fixture.orderId}/cancel`
    );
    expect(cancelClosed.status, '已关闭订单不可取消').toBe(400);
    expect(failureCode(cancelClosed), '已关闭订单取消机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const stillClosed = await readOrder(page, fixture.orderNo);
    expect(String(stillClosed.status), '被拒不得改写终态').toBe('closed');
    // 已关闭不可删除（软删只放开草稿），删除被拒后单仍在
    const deleteClosed = await apiCallExpectFail(
      page,
      'DELETE',
      `/production/outsourcing-orders/${fixture.orderId}`
    );
    expect(deleteClosed.status, '非草稿订单不可删除').toBe(400);
    expect(failureCode(deleteClosed), '非草稿删除机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(String((await readOrder(page, fixture.orderNo)).status), '被拒删除后单仍可读').toBe(
      'closed'
    );
  });

  test('441-05 跨角色回读可见性：跟单写、QC 与财务与仓管各读同一事实，未授权写与越权读被 403 精确拒绝', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const ctx = getCtx();
    if (!ctx.supplierId) throw new Error('441-05 前置缺失：ctx.supplierId 未就绪');
    const tag = 'E';
    const product = await ownProduct(page, tag);
    const wh = await pickChainWarehouses(page, tag);
    const [piece] = await ownGreigePieces(page, {
      productId: product.id,
      warehouseId: wh.greigeId,
      pieceCount: 1,
      lengthPerPiece: '180.25',
      totalQuantity: '180.25',
      tag,
    });
    const dyeLotNo = genDyeLotNo();
    const colorNo = `E441C-${genCode(tag)}`;

    // 跟单侧（本用例由管理会话代写，角色面单独验授权与可见性）：建单→发料→加工→回仓确认→结算
    const fixture = await openDyeingOrder(page, {
      tag,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo,
      colorNo,
      issueQuantity: '180.25',
      materialCost: '1802.5',
      processingFee: '90.125',
      freightFee: '12.5',
      taxAmount: '8.2',
      standardLossRate: '0.05',
      items: [
        {
          pieceNo: piece.pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${dyeLotNo}`,
          dyeLotNo,
          quantity: '180.25',
          unitCost: '10',
          processingFee: '90.125',
          freightFee: '12.5',
        },
      ],
    });
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/issue`);
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/processing`);
    const returnQuantity = '172';
    const { receiptId, receiptNo } = await openReceipt(page, {
      tag,
      orderId: fixture.orderId,
      productId: product.id,
      warehouseId: wh.inboundId,
      dyeLotNo,
      colorNo,
      batchNo: `B-${dyeLotNo}`,
      returnQuantity,
      qualityStatus: undefined,
      weight: '40',
      width: '160',
      gramWeight: '200',
    });
    // 判定这一写动作交给质检岗会话完成（跨角色协同面）：管理会话此刻只推进到"草稿收回单待判定"
    const draftReceipt = await readReceipt(page, receiptNo);
    expect(
      String(draftReceipt.quality_status),
      '未给结论时写入方落 pending（不得默认成已判定）'
    ).toBe('pending');
    expect(String(draftReceipt.status), '待判定阶段收回单为草稿').toBe('draft');
    expect(String((await readOrder(page, fixture.orderNo)).status), '跟单侧已推进到加工中').toBe(
      'processing'
    );

    const createdAccounts: Array<{ userId: number; roleId: number; label: string }> = [];
    /** 建一套"只授予指定键、数据范围 all"的角色 + 账号（全部自建，唯一命名） */
    const makeRole = async (
      codeSuffix: string,
      grants: Array<{ resource_type: string; action: string }>,
      label: string
    ): Promise<{ roleId: number; username: string; password: string }> => {
      const password = testPassword();
      const role = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/roles', {
        name: `E2E委外染整${label}${genCode(codeSuffix)}`,
        code: `${codeSuffix.toLowerCase()}${Date.now().toString().slice(-6)}`,
        description: `441 跨角色可见性专用${label}岗`,
        is_system: false,
      });
      const roleId = requireId(role, `${label} 角色`);
      createdAccounts.push({ userId: 0, roleId, label });
      const grantBody = [
        { resource_type: 'dashboard', action: 'read' },
        { resource_type: 'notifications', action: 'read' },
        ...grants,
      ].map(g => ({ resource_type: g.resource_type, action: g.action, allowed: true }));
      await apiCall(page, 'PUT', `/roles/${roleId}/permissions`, grantBody);
      // 行级数据范围放开到 all：断言"他人写入的事实可见"，而不是被 self 过滤后假绿成空列表
      const scoped = await apiCallRaw<Record<string, unknown>>(
        page,
        'PATCH',
        `/roles/${roleId}/data-scope`,
        { data_scope: 'all' }
      );
      expect(String(scoped.data_scope), `${label} 角色数据范围必须真实落到 all`).toBe('all');
      const username = `e441${codeSuffix.toLowerCase()}${Date.now().toString().slice(-6)}`;
      const user = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/users', {
        username,
        password,
        email: `${username}@test.com`,
        role_id: roleId,
      });
      const userId = requireId(user, `${label} 账号`);
      createdAccounts[createdAccounts.length - 1].userId = userId;
      return { roleId, username, password };
    };

    const qc = await makeRole(
      'QC',
      [
        { resource_type: 'outsourcing-receipts', action: 'read' },
        { resource_type: 'outsourcing-receipts', action: 'update' },
        { resource_type: 'outsourcing-orders', action: 'read' },
      ],
      '质检'
    );
    await loginViaUI(page, qc.username, qc.password, true);
    const beforeJudge = await readReceipt(page, receiptNo);
    expect(String(beforeJudge.quality_status), '质检岗接手时结论仍为待检').toBe('pending');
    // 判定权在质检岗：由该岗会话写入让步接收（词表内真实值，降级体现在等级上）
    await apiCall(page, 'PUT', `/production/outsourcing-receipts/${receiptId}`, {
      quality_status: 'concession',
      grade: 'B',
    });
    const qcReceipt = await readReceipt(page, receiptNo);
    expect(String(qcReceipt.receipt_no), '质检岗读到的收回单号').toBe(receiptNo);
    expect(String(qcReceipt.quality_status), '质检岗自己的判定必须落库可见').toBe('concession');
    expect(String(qcReceipt.grade), '质检岗判定的降级等级落库').toBe('B');
    expect(String(qcReceipt.status), '判定不改写收回态（确认权不在本岗）').toBe('draft');
    // 质检岗读到的跟单侧事实与写入方逐字段同源（不是各自一套）
    expect(String(qcReceipt.dye_lot_no), '质检岗读到的缸号与跟单写入逐字符相同').toBe(
      String(draftReceipt.dye_lot_no)
    );
    expect(String(qcReceipt.color_no), '质检岗读到的色号与跟单写入逐字符相同').toBe(
      String(draftReceipt.color_no)
    );
    expectDecEqualsEachOther(
      qcReceipt.return_quantity,
      draftReceipt.return_quantity,
      '质检岗读到的收回数量与跟单写入同源'
    );
    expect(Number(qcReceipt.warehouse_id), '质检岗读到的入库仓库=回仓单仓库').toBe(wh.inboundId);
    const qcOrder = await readOrder(page, fixture.orderNo);
    expect(String(qcOrder.status), '质检岗读到的订单态即跟单推进结果').toBe('processing');
    expectDecEquals(
      qcOrder.issue_quantity,
      decLiteral('180.25', '跟单提交发出数量'),
      '质检岗读到的发出数量必须与跟单提交值逐分对平（十进制字符串线格式）'
    );

    // 质检岗没有写权：建委外单被 403 精确拒绝，且库里零写入（按同一提交单号读 404 证明）
    const qcAttemptedOrderNo = genCode('E441QCX');
    const qcCreateFail = await apiCallExpectFail(page, 'POST', '/production/outsourcing-orders', {
      order_no: qcAttemptedOrderNo,
      order_type: 'dyeing',
      supplier_id: ctx.supplierId,
      issue_date: todayStr(),
      issue_quantity: '1',
      issue_unit: '米',
      material_cost: '1',
    });
    expect(qcCreateFail.status, '质检岗无 outsourcing-orders:create，写单必须 403').toBe(403);
    expect(failureCode(qcCreateFail), '质检岗写单机器码').toBe(APP_ERROR_CODES.FORBIDDEN);
    // 越权写必须零落库：本岗有单据读权，按刚提交的单号回读必须 404
    const qcGhost = await apiCallExpectFail(
      page,
      'GET',
      `/production/outsourcing-orders/by-no/${encodeURIComponent(qcAttemptedOrderNo)}`
    );
    expect(qcGhost.status, '质检岗越权写未落库（按提交单号回读 404）').toBe(404);
    expect(failureCode(qcGhost), '越权写零落库的读回机器码').toBe(APP_ERROR_CODES.NOT_FOUND);
    const qcConfirmFail = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${receiptId}/confirm`
    );
    expect(qcConfirmFail.status, '质检岗无收回单确认权，必须 403').toBe(403);
    expect(failureCode(qcConfirmFail), '质检岗确认机器码').toBe(APP_ERROR_CODES.FORBIDDEN);
    const qcUnconfirmedReceipt = await readReceipt(page, receiptNo);
    expect(String(qcUnconfirmedReceipt.status), '被拒的确认不得把收回单推进为已确认').toBe('draft');
    expect(qcUnconfirmedReceipt.inspection_id, '质检岗无确认权，不得生成自动质检记录').toBeNull();

    // 回到跟单侧（管理会话）推进确认与结算：确认沿用质检岗的判定值，不得由确认侧改写
    await loginViaUI(page, testUsername(), testPassword(), true);
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${receiptId}/confirm`);
    await apiCall(page, 'POST', `/production/outsourcing-orders/${fixture.orderId}/settle`);
    const adminOrder = await readOrder(page, fixture.orderNo);
    const adminReceipt = await readReceipt(page, receiptNo);
    expect(String(adminOrder.status), '管理会话基准：已结算').toBe('settled');
    expect(String(adminReceipt.status), '管理会话基准：已确认收回').toBe('confirmed');
    expect(String(adminReceipt.quality_status), '确认链沿用质检岗判定值').toBe('concession');
    expectDecEqualsEachOther(
      adminReceipt.total_cost,
      adminOrder.total_cost,
      '确认后单头与收回单总成本同源'
    );
    // 让步接收按接收处理：自动质检记录必须记"合格"，不得与不合格混为一谈（中文词表值）
    const autoRecords = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/production/quality-inspection/records?product_id=${product.id}&inspection_type=outsourcing_receipt&page=1&page_size=50`
      ),
      'items',
      `产品 ${product.id} 委外回仓自动质检记录`
    );
    const autoRecord = autoRecords.find(r => Number(r.related_id) === receiptId);
    if (!autoRecord) {
      throw new Error(
        `确认收回未生成可反查的自动质检记录（实得 related_id 集=${
          autoRecords.map(r => r.related_id).join(',') || '(空)'
        }）`
      );
    }
    expect(String(autoRecord.inspection_result), '让步接收的质检结论（中文词表）').toBe('合格');
    expectDecEqualsEachOther(
      autoRecord.qualified_qty,
      adminReceipt.return_quantity,
      '合格量=收回数量'
    );

    // 财务岗：授凭证读与单据读（成本归集口径），能对上成本；读收回单必须被 403（最小授权面真实生效）
    const fin = await makeRole(
      'FIN',
      [
        { resource_type: 'outsourcing-vouchers', action: 'read' },
        { resource_type: 'outsourcing-orders', action: 'read' },
      ],
      '财务'
    );
    await loginViaUI(page, fin.username, fin.password, true);
    const finFeeVouchers = await readVouchers(page, fixture.orderId, 'fee');
    expect(finFeeVouchers.length, '财务岗读到结算凭证').toBe(1);
    const finOrder = await readOrder(page, fixture.orderNo);
    expect(
      decCmp(
        decFromRaw(finFeeVouchers[0].amount, '财务岗凭证金额'),
        decAdd(
          decFromRaw(finOrder.processing_fee, '凭证侧加工费'),
          decFromRaw(finOrder.freight_fee, '凭证侧运费')
        )
      ) === 0,
      '财务岗读到的凭证金额与同库加工费+运费对平'
    ).toBe(true);
    const finReceiptFail = await apiCallExpectFail(
      page,
      'GET',
      `/production/outsourcing-receipts/${receiptId}`
    );
    expect(finReceiptFail.status, '财务岗未授收回单读权必须 403').toBe(403);
    expect(failureCode(finReceiptFail), '财务岗越权读机器码').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 回到管理会话建岗：建岗要 roles 的 create 动作，而财务岗自建面只有读键，
    // 留在财务岗会话里建岗会被权限中间件按无权限拒绝，与本用例既有的"建岗一律在管理会话"口径同构
    await loginViaUI(page, testUsername(), testPassword(), true);

    // 仓管岗：按四维读回同一卷细码，米数与收回单同一事实（跨角色看到的是同一个数）
    const whRole = await makeRole(
      'WHK',
      [
        { resource_type: 'pieces', action: 'read' },
        { resource_type: 'outsourcing-receipts', action: 'read' },
      ],
      '仓管'
    );
    await loginViaUI(page, whRole.username, whRole.password, true);
    const whPieces = await readDyedPieces(page, {
      productId: product.id,
      warehouseId: wh.inboundId,
      dyeLotNo,
    });
    expect(whPieces.length, '仓管岗按缸号读到卷数').toBe(1);
    expectDecEqualsEachOther(
      whPieces[0].length,
      adminReceipt.return_quantity,
      '仓管岗读到的匹米数=跟单侧收回数量'
    );
    expect(String(whPieces[0].dye_lot_no), '仓管岗读到的缸号逐字符同源').toBe(dyeLotNo);
    expect(String(whPieces[0].status), '仓管岗读到的匹态（大写词表）').toBe('AVAILABLE');
    const whReceipt = await readReceipt(page, receiptNo);
    expect(Number(whReceipt.warehouse_id), '仓管岗读到的入库仓库=回仓单仓库').toBe(wh.inboundId);

    // 回到管理会话做清理（角色/账号是本用例自建，不留库）
    await loginViaUI(page, testUsername(), testPassword(), true);
    for (const a of createdAccounts) {
      if (a.userId > 0) await tryCleanup(page, 'DELETE', `/users/${a.userId}`, `${a.label} 账号`);
      await tryCleanup(page, 'DELETE', `/roles/${a.roleId}`, `${a.label} 角色`);
    }
    // 收回单与订单已进入不可删状态（终态只软删草稿），删除被拒属预期，回读确认单仍在链上
    const finalReceipt = await readReceipt(page, receiptNo);
    expect(String(finalReceipt.status), '清理后终态收回单仍可回读（未被误删）').toBe('confirmed');
  });

  test('441-06 时序门控负例：未发料不可回仓确认、未判定质检结论不得结转成本、空明细与缺匹号不得发料，被拒零副作用', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const ctx = getCtx();
    if (!ctx.supplierId) throw new Error('441-06 前置缺失：ctx.supplierId 未就绪');
    const tag = 'F';
    const product = await ownProduct(page, tag);
    const wh = await pickChainWarehouses(page, tag);
    const [piece] = await ownGreigePieces(page, {
      productId: product.id,
      warehouseId: wh.greigeId,
      pieceCount: 1,
      lengthPerPiece: '100',
      totalQuantity: '100',
      tag,
    });
    const dyeLotNo = genDyeLotNo();
    const colorNo = `E441C-${genCode(tag)}`;

    // 门 1：空明细不得发料（可外显族，钉文案 + 码），订单原地 draft、不落发料凭证
    const emptyOrder = await openDyeingOrder(page, {
      tag: `${tag}0`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [],
    });
    const issueNoItems = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${emptyOrder.orderId}/issue`
    );
    expect(issueNoItems.status, '空明细发料必须 400').toBe(400);
    expect(failureCode(issueNoItems), '空明细发料机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(issueNoItems.message ?? ''),
      '该拒绝属可外显族，必须点名"发料必须精确到匹"'
    ).toContain('委外订单没有发料明细，无法发料');
    const emptyOrderAfter = await readOrder(page, emptyOrder.orderNo);
    expect(String(emptyOrderAfter.status), '被拒后订单仍为草稿').toBe('draft');
    expect(emptyOrderAfter.voucher_no_issue, '被拒不得回写作废料凭证号').toBeNull();
    expect(
      (await readVouchers(page, emptyOrder.orderId, 'issue')).length,
      '被拒不得落发料凭证'
    ).toBe(0);

    // 门 2：明细缺匹号不得发料（脱敏族，只锁码）
    const noPieceOrder = await openDyeingOrder(page, {
      tag: `${tag}1`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: `${dyeLotNo}-NP`,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [],
    });
    await apiCall(page, 'POST', '/production/outsourcing-orders/items', {
      outsourcing_order_id: noPieceOrder.orderId,
      product_id: product.id,
      color_no: colorNo,
      dye_lot_no: `${dyeLotNo}-NP`,
      batch_no: `B-${dyeLotNo}-NP`,
      warehouse_id: wh.greigeId,
      quantity: '100',
      unit: '米',
      unit_cost: '1',
    });
    const issueNoPiece = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${noPieceOrder.orderId}/issue`
    );
    expect(issueNoPiece.status, '缺匹号发料必须 400').toBe(400);
    expect(failureCode(issueNoPiece), '缺匹号发料机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String((await readOrder(page, noPieceOrder.orderNo)).status),
      '缺匹号被拒后订单仍为草稿'
    ).toBe('draft');

    // 门 3：匹号不存在不得发料（脱敏族）
    const ghostOrder = await openDyeingOrder(page, {
      tag: `${tag}2`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: `${dyeLotNo}-GH`,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [],
    });
    await apiCall(page, 'POST', '/production/outsourcing-orders/items', {
      outsourcing_order_id: ghostOrder.orderId,
      product_id: product.id,
      dye_lot_no: `${dyeLotNo}-GH`,
      warehouse_id: wh.greigeId,
      quantity: '100',
      unit: '米',
      unit_cost: '1',
      piece_no: `NOT-EXIST-${genCode(`${tag}X`)}`,
    });
    const issueGhost = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${ghostOrder.orderId}/issue`
    );
    expect(issueGhost.status, '匹不存在发料必须 400').toBe(400);
    expect(failureCode(issueGhost), '匹不存在发料机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 门 4：同一匹被占用后不得重复外发（CAS 真实生效，状态归因取实读值）
    const busyOrder = await openDyeingOrder(page, {
      tag: `${tag}3`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: `${dyeLotNo}-BS`,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [
        {
          pieceNo: piece.pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${dyeLotNo}-BS`,
          dyeLotNo: `${dyeLotNo}-BS`,
          quantity: '100',
          unitCost: '1',
          processingFee: '10',
          freightFee: '5',
        },
      ],
    });
    await apiCall(page, 'POST', `/production/outsourcing-orders/${busyOrder.orderId}/issue`);
    const reserved = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/inventory/pieces?piece_no=${encodeURIComponent(piece.pieceNo)}&product_id=${product.id}&warehouse_id=${wh.greigeId}&page=1&page_size=10`
    );
    const reservedRow = pickListArray<Record<string, unknown>>(
      reserved,
      'items',
      '占用后匹回读'
    ).find(r => String(r.piece_no) === piece.pieceNo);
    if (!reservedRow) throw new Error(`发料后未回读到匹 ${piece.pieceNo}`);
    expect(String(reservedRow.status), '发料必须把匹占用为 RESERVED').toBe('RESERVED');
    const secondBusy = await openDyeingOrder(page, {
      tag: `${tag}4`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: `${dyeLotNo}-BS2`,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [
        {
          pieceNo: piece.pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${dyeLotNo}-BS2`,
          dyeLotNo: `${dyeLotNo}-BS2`,
          quantity: '100',
          unitCost: '1',
          processingFee: '10',
          freightFee: '5',
        },
      ],
    });
    const doubleIssue = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${secondBusy.orderId}/issue`
    );
    expect(doubleIssue.status, '重复占用同一匹发料必须 400').toBe(400);
    expect(failureCode(doubleIssue), '重复占用机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String((await readOrder(page, secondBusy.orderNo)).status),
      '重复占用被拒后订单仍为草稿'
    ).toBe('draft');

    // 门 5：未发料不得回仓确认（时序门）——收回单可以建，确认必须被拒且零副作用
    const draftOrder = await openDyeingOrder(page, {
      tag: `${tag}5`,
      productId: product.id,
      supplierId: ctx.supplierId,
      dyeLotNo: `${dyeLotNo}-DR`,
      colorNo,
      issueQuantity: '100',
      materialCost: '100',
      processingFee: '10',
      freightFee: '5',
      taxAmount: '1',
      standardLossRate: '0.05',
      items: [
        {
          pieceNo: piece.pieceNo,
          warehouseId: wh.greigeId,
          batchNo: `B-${dyeLotNo}-DR`,
          dyeLotNo: `${dyeLotNo}-DR`,
          quantity: '100',
          unitCost: '1',
          processingFee: '10',
          freightFee: '5',
        },
      ],
    });
    const early = await openReceipt(page, {
      tag: `${tag}5R`,
      orderId: draftOrder.orderId,
      productId: product.id,
      warehouseId: wh.inboundId,
      dyeLotNo: `${dyeLotNo}-DR`,
      colorNo,
      batchNo: `B-${dyeLotNo}-DR`,
      returnQuantity: '95',
      qualityStatus: 'qualified',
      grade: 'A',
      weight: '20',
      width: '160',
      gramWeight: '180',
    });
    CLEANUP.push({
      path: `/production/outsourcing-receipts/${early.receiptId}`,
      label: `outsourcing_receipt#${early.receiptId}`,
    });
    const earlyConfirm = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${early.receiptId}/confirm`
    );
    expect(earlyConfirm.status, '未发料订单确认回仓必须 400').toBe(400);
    expect(failureCode(earlyConfirm), '未发料确认机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const earlyReceiptAfter = await readReceipt(page, early.receiptNo);
    expect(String(earlyReceiptAfter.status), '被拒的收回单仍为草稿').toBe('draft');
    expect(earlyReceiptAfter.loss_rate, '被拒不得落派生损耗率').toBeNull();
    expectDecEquals(
      earlyReceiptAfter.total_cost,
      decLiteral('0', '建单初值'),
      '被拒不得结转入库总成本（必须仍是建单初值 0）'
    );
    expectDecEquals(
      earlyReceiptAfter.loss_quantity,
      decLiteral('0', '建单初值'),
      '被拒不得落派生损耗数量（必须仍是建单初值 0）'
    );
    expect(earlyReceiptAfter.inspection_id, '被拒不得生成质检记录').toBeNull();
    expect(String((await readOrder(page, draftOrder.orderNo)).status), '被拒不得推进订单态').toBe(
      'draft'
    );
    expect(
      (await readVouchers(page, draftOrder.orderId, 'receipt')).length,
      '被拒不得落入库凭证'
    ).toBe(0);
    expect(
      (
        await readDyedPieces(page, {
          productId: product.id,
          warehouseId: wh.inboundId,
          dyeLotNo: `${dyeLotNo}-DR`,
        })
      ).length,
      '被拒不得产匹'
    ).toBe(0);

    // 门 6：未判定质检结论不得确认回仓（成本与库存的入口门），事务整体回滚
    const unjudged = await chainToProcessing(page, 'G');
    const noQ = await openReceipt(page, {
      tag: 'G',
      orderId: unjudged.fixture.orderId,
      productId: unjudged.product.id,
      warehouseId: unjudged.inboundWhId,
      dyeLotNo: unjudged.fixture.dyeLotNo,
      colorNo: unjudged.fixture.colorNo,
      batchNo: `B-${unjudged.fixture.dyeLotNo}`,
      returnQuantity: '100',
      weight: '20',
      width: '160',
      gramWeight: '180',
    });
    const noQConfirm = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${noQ.receiptId}/confirm`
    );
    expect(noQConfirm.status, '未记录质检结论确认必须 400').toBe(400);
    expect(failureCode(noQConfirm), '未判定结论机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const noQReceipt = await readReceipt(page, noQ.receiptNo);
    expect(String(noQReceipt.status), '未判定结论的收回单仍为草稿，成本不得落地').toBe('draft');
    expect(String(noQReceipt.quality_status), '未给结论必须落 pending（不得默认成已判定）').toBe(
      'pending'
    );
    expectDecEquals(
      noQReceipt.total_cost,
      decLiteral('0', '建单初值'),
      '未判定结论不得结转入库总成本（必须仍是建单初值 0）'
    );
    const noQOrder = await readOrder(page, unjudged.fixture.orderNo);
    expect(String(noQOrder.status), '未判定结论不得推进订单态').toBe('processing');
    expect(
      (await readVouchers(page, unjudged.fixture.orderId, 'receipt')).length,
      '未判定不落入库凭证'
    ).toBe(0);
    // 结算侧同样被时序挡住（未 received）
    const settleTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${unjudged.fixture.orderId}/settle`
    );
    expect(settleTooEarly.status, '未收回不得结算').toBe(400);
    expect(failureCode(settleTooEarly), '未收回结算机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 门 7：别域同义质检结论（passed）不得写入本列；被拒不落行
    const badQuality = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode(`${tag}BADQ`),
      outsourcing_order_id: unjudged.fixture.orderId,
      receipt_date: todayStr(),
      product_id: unjudged.product.id,
      dye_lot_no: unjudged.fixture.dyeLotNo,
      warehouse_id: unjudged.inboundWhId,
      return_quantity: '100',
      quality_status: 'passed',
    });
    expect(badQuality.status, '别域结论写法必须 400 拒绝').toBe(400);
    expect(failureCode(badQuality), '别域结论机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const badQualityList = pickListArray<Record<string, unknown>>(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/production/outsourcing-receipts?outsourcing_order_id=${unjudged.fixture.orderId}&page=1&page_size=20`
      ),
      'items',
      `订单 ${unjudged.fixture.orderId} 收回单列表`
    );
    expect(badQualityList.length, '被拒的越界结论收回单不得落行（仅前一张草稿）').toBe(1);

    // 门 8：收回数量取值域与实测三列取值域（可外显校验族，钉文案点名列）
    const zeroQty = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode(`${tag}Q0`),
      outsourcing_order_id: unjudged.fixture.orderId,
      receipt_date: todayStr(),
      product_id: unjudged.product.id,
      dye_lot_no: unjudged.fixture.dyeLotNo,
      warehouse_id: unjudged.inboundWhId,
      return_quantity: '0',
      quality_status: 'qualified',
    });
    expect(zeroQty.status, '零收回数量必须 400').toBe(400);
    expect(failureCode(zeroQty), '零收回数量机器码').toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(String(zeroQty.message ?? ''), '可外显文案点名收回数量取值域').toBe(
      '收回数量必须大于零'
    );
    const zeroWeight = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode(`${tag}W0`),
      outsourcing_order_id: unjudged.fixture.orderId,
      receipt_date: todayStr(),
      product_id: unjudged.product.id,
      dye_lot_no: unjudged.fixture.dyeLotNo,
      warehouse_id: unjudged.inboundWhId,
      return_quantity: '100',
      weight: '0',
    });
    expect(zeroWeight.status, '实测重量为 0 必须 400').toBe(400);
    expect(failureCode(zeroWeight), '实测重量为 0 机器码').toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      String(zeroWeight.message ?? ''),
      '可外显文案必须点名是重量(weight)列（防伪实测值绕过标签 fail-closed）'
    ).toContain('收回单重量(weight)必须大于零');

    // 门 9：确认一次后不得重复确认（终态门）
    const once = await openReceipt(page, {
      tag: `${tag}9`,
      orderId: unjudged.fixture.orderId,
      productId: unjudged.product.id,
      warehouseId: unjudged.inboundWhId,
      dyeLotNo: unjudged.fixture.dyeLotNo,
      colorNo: unjudged.fixture.colorNo,
      batchNo: `B-${unjudged.fixture.dyeLotNo}`,
      returnQuantity: '100',
      qualityStatus: 'qualified',
      grade: 'A',
      weight: '20',
      width: '160',
      gramWeight: '180',
    });
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${once.receiptId}/confirm`);
    const doubleConfirm = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${once.receiptId}/confirm`
    );
    expect(doubleConfirm.status, '已确认收回单重复确认必须 400').toBe(400);
    expect(failureCode(doubleConfirm), '重复确认机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const receiptFinal = await readReceipt(page, once.receiptNo);
    expect(String(receiptFinal.status), '重复确认不得改写收回态').toBe('confirmed');
    expect(
      (
        await readDyedPieces(page, {
          productId: unjudged.product.id,
          warehouseId: unjudged.inboundWhId,
          dyeLotNo: unjudged.fixture.dyeLotNo,
        })
      ).length,
      '重复确认不得重复产匹'
    ).toBe(1);
  });
});

/**
 * 单头总成本 = 材料成本 + 加工费 + 运费 − 非正常损耗（十进制定标减法，杜绝浮点误差）。
 * 四个入参全部来自后端出参，本函数只做定标对齐，不引入用例自造值。
 */
function decSub3(material: Dec, processingFee: Dec, freight: Dec, abnormalLoss: Dec): Dec {
  let acc = decAdd(material, processingFee);
  acc = decAdd(acc, freight);
  return { v: acc.v - abnormalLoss.v, s: acc.s };
}
