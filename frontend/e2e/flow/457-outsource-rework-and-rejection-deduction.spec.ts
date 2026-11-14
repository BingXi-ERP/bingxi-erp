// 457 委外染整「不合格判定 → 返工 → 扣款/染费调整」反向链契约 E2E
//
// 契约来源（每个断言值都对着仓内写入方核过，不含测试自造口径）：
//  · 端点与挂载（事实来源 backend/src/routes/production.rs 与 route-snapshot.txt）：
//    /production/outsourcing-orders（含 {id}/issue、{id}/processing、{id}/settle）、
//    /production/outsourcing-receipts（含 {id}/confirm）、/production/outsourcing-vouchers、
//    /production/quality-inspection/records/{id}、/production/dye-batches、
//    /production/dye-batch-reworks（含 {id}/approve、{id}/start、{id}/complete）；
//    前端 baseURL=/api/v1/erp，调用只写其后部分。
//  · 出参键名 = backend/src/models/{outsourcing_order,outsourcing_receipt,outsourcing_voucher,
//    quality_inspection_record,dye_batch_rework}.rs 字段名（snake_case）；
//    列表是 PaginatedResponse{items,total,page,page_size}，查询键 page/page_size。
//  · 状态词表逐字符照写入方（大小写混用是故意的，不做规范化）：
//    outsourcing_order_status 小写 draft/issued/processing/received/settled；
//    outsourcing_order_type 含 dyeing；outsourcing_receipt_status draft/confirmed；
//    outsourcing_receipt_quality_status pending/qualified/concession/unqualified
//    （passed/failed 属染化料来料检验域、中文 合格/不合格 属库存质量状态，写入方显式拒绝互抄）；
//    outsourcing_loss_type normal/abnormal；outsourcing_voucher_type 小写 issue/fee/receipt/loss
//    （loss 即「非正常损耗单独追责」腿）；quality_inspection_result 是中文 待检/合格/不合格
//    （禁止英文化）；quality_inspection_type 含 outsourcing_receipt；dye_batch_rework_status
//    draft/approved/in_progress/completed/cancelled；dye_batch_rework_type 含 color_difference。
//    以上词表唯一事实来源：backend/src/models/status/{wage_energy_chemical_business,quality_dyeing}.rs。
//  · 派生值一律只认后端出参，不在用例里重算再与自己比对：收回确认落 loss_quantity/loss_rate/
//    loss_type/is_loss_normal/abnormal_loss_amount/total_cost/unit_cost 并回写订单
//    （services/outsourcing_ops/{receipt,order}.rs）；不合格回仓自动建质检记录并把合格量记 0、
//    不合格量记收回全量（services/outsourcing_ops/receipt.rs::trigger_quality_inspection）；
//    OVIS 凭证 amount=材料成本、OVRC=收回单总成本、OVLS=非正常损耗金额（仅 >0 才落）、
//    OVFE=加工费+运费且 tax_amount 取订单进项税额（services/outsourcing_ops/order.rs::settle）。
//  · 金额与数量按 DECIMAL 线格式（JSON 字符串）比较，并钉住列定标位数：outsourcing_* 数量/成本
//    (14,4)、损耗率 (8,4)。
//  · 失败体只有 AppError 一种形状（字符串 code + message + trace_id + timestamp）：
//    BusinessError/BusinessErrorDisplayable→400 BUSINESS_ERROR、请求解码失败由
//    middleware/trace_context.rs 收口为 400 VALIDATION_ERROR、PermissionDenied→403 FORBIDDEN。
//    脱敏族只锁 HTTP 码 + 机器码，不读文案。
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
  safeGetList,
  pickDyeableWarehouse,
  loginAsRole,
  expectDenied,
  expectStateGateRejection,
} from './helpers';
// 列表信封取数组的统一读法（回读生产匹与仓库列表用），与生产报工链同口径。
import { pickListArray } from './ui-helpers';
// 产品类型单源常量（与后端 product_type 词表同源）：建品夹具取值必须经成员引用。
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

// ───────────────────────────── 状态词表常量（逐字符照写入方）─────────────────────────────

const ORDER_TYPE_DYEING = 'dyeing';
const ORDER_STATUS_DRAFT = 'draft';
const ORDER_STATUS_ISSUED = 'issued';
const ORDER_STATUS_PROCESSING = 'processing';
const ORDER_STATUS_RECEIVED = 'received';
const ORDER_STATUS_SETTLED = 'settled';
const RECEIPT_STATUS_DRAFT = 'draft';
const RECEIPT_STATUS_CONFIRMED = 'confirmed';
const RECEIPT_QUALITY_UNQUALIFIED = 'unqualified';
const RECEIPT_QUALITY_QUALIFIED = 'qualified';
const LOSS_TYPE_NORMAL = 'normal';
const LOSS_TYPE_ABNORMAL = 'abnormal';
const VOUCHER_TYPE_ISSUE = 'issue';
const VOUCHER_TYPE_FEE = 'fee';
const VOUCHER_TYPE_RECEIPT = 'receipt';
const VOUCHER_TYPE_LOSS = 'loss';
// 质检结论属中文词表（写入方 quality_inspection_result），必须与写入值逐字符相同，禁止英文化。
const INSPECTION_RESULT_UNQUALIFIED = '不合格';
const INSPECTION_RESULT_QUALIFIED = '合格';
const INSPECTION_TYPE_OUTSOURCING_RECEIPT = 'outsourcing_receipt';
const REWORK_STATUS_DRAFT = 'draft';
const REWORK_STATUS_APPROVED = 'approved';
const REWORK_STATUS_IN_PROGRESS = 'in_progress';
const REWORK_STATUS_COMPLETED = 'completed';
const REWORK_TYPE_COLOR_DIFFERENCE = 'color_difference';
// 回修资格由写入方 services/dye_batch_state_machine_ops/rework.rs 判定：验布中缸可发起同缸回修。
const DYE_BATCH_STATUS_INSPECTING = 'inspecting';

// ───────────────────────────── 十进制字符串对账（禁浮点、禁二次舍入）─────────────────────────────

interface Dec {
  v: bigint;
  s: number;
}

function decFromRaw(raw: unknown, label: string): Dec {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : null;
  if (text === null) {
    throw new Error(
      `${label}：后端 Decimal 出参必须是字符串，实际类型=${typeof raw} 值=${JSON.stringify(raw)}`
    );
  }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`${label}：无法按十进制解析，raw=${JSON.stringify(raw)}`);
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
  return { v: x + y, s: Math.max(a.s, b.s) };
}

function decText(d: Dec): string {
  const sign = d.v < 0n ? '-' : '';
  const digits = (d.v < 0n ? -d.v : d.v).toString().padStart(d.s + 1, '0');
  return d.s === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -d.s)}.${digits.slice(-d.s)}`;
}

/** 两条后端出参相加（明细合计侧），取值全部来自接口出参 */
function decSumOfResponses(left: unknown, right: unknown, label: string): Dec {
  return decAdd(decFromRaw(left, `${label}（左）`), decFromRaw(right, `${label}（右）`));
}

/** 十进制相等（定标对齐后比整数）：被舍入的分位在这里暴露，不做容差比较 */
function expectDecEquals(actual: unknown, expected: Dec, label: string): void {
  const a = decFromRaw(actual, label);
  expect(
    decCmp(a, expected) === 0,
    `${label}：十进制期望=${decText(expected)} 实际=${decText(a)}（raw=${JSON.stringify(actual)}）`
  ).toBe(true);
}

/** 两条后端出参之间的对平（明细合计 vs 总额、单头 vs 凭证），不引入用例自造值 */
function expectDecEqualsEachOther(left: unknown, right: unknown, label: string): void {
  const l = decFromRaw(left, `${label}（左）`);
  const r = decFromRaw(right, `${label}（右）`);
  expect(
    decCmp(l, r) === 0,
    `${label}：两侧出参必须逐分对平，左=${decText(l)}（raw=${JSON.stringify(left)}） ` +
      `右=${decText(r)}（raw=${JSON.stringify(right)}）`
  ).toBe(true);
}

/** 与十进制 0 对平：用于「返工后足量重收不再有超定额扣款」一类零值事实 */
function expectDecIsZero(actual: unknown, label: string): void {
  expectDecEquals(actual, decLiteral('0', label), label);
}

/** 出参必须是十进制字符串（DECIMAL 未开 serde-float 的线格式契约） */
function expectDecimalString(raw: unknown, label: string): Dec {
  expect(
    typeof raw,
    `${label}：Decimal 出参应为 JSON 字符串，实际类型=${typeof raw} 值=${JSON.stringify(raw)}`
  ).toBe('string');
  return decFromRaw(raw, label);
}

/** 列定标位数上限：超出即 DB 列被舍入或序列化线格式位数漂移 */
function expectDecScaleAtMost(raw: unknown, maxScale: number, label: string): Dec {
  const d = expectDecimalString(raw, label);
  expect(
    d.s <= maxScale,
    `${label}：小数位数不得超过列定标 ${maxScale}，实际=${d.s}（raw=${JSON.stringify(raw)}）`
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ───────────────────────────── 回读助手（写后必重读，不只看 200）─────────────────────────────

/** 按单号回读委外订单主行（写入方 outsourcing_order 字段名）。调用方：457 各腿 */
async function readOrder(page: Page, orderNo: string): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/outsourcing-orders/by-no/${encodeURIComponent(orderNo)}`
  );
}

/** 按单号回读收回单主行（写入方 outsourcing_receipt 字段名） */
async function readReceipt(page: Page, receiptNo: string): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/outsourcing-receipts/by-no/${encodeURIComponent(receiptNo)}`
  );
}

/** 按订单取该单全部委外凭证行（凭证类型词表 outsourcing_voucher_type） */
async function readVouchers(page: Page, orderId: number): Promise<Record<string, unknown>[]> {
  return await safeGetList<Record<string, unknown>>(
    page,
    `/production/outsourcing-vouchers?outsourcing_order_id=${orderId}&page=1&page_size=50`
  );
}

function voucherOfType(
  rows: Record<string, unknown>[],
  type: string,
  label: string
): Record<string, unknown> {
  const hit = rows.find(r => String(r['voucher_type']) === type);
  if (!hit) {
    throw new Error(
      `${label}：未取到 type=${type} 的凭证（实得类型集=${
        rows.map(r => String(r['voucher_type'])).join(',') || '(空)'
      }）`
    );
  }
  return hit;
}

// ───────────────────────────── 前置夹具（全部自建、唯一命名，不引用库中历史行）─────────────────────────────

/**
 * 建本用例专属产品：真实建单并回读编码与单位。
 * 委外染整链按缸号/匹号推进、不做米↔公斤换算，取非面料类型免带面料三键。
 */
async function ownProduct(page: Page, tag: string): Promise<{ id: number; code: string }> {
  const ctx = getCtx();
  if (!ctx.productCategoryIds[0]) throw new Error('前置缺失：ctx.productCategoryIds[0] 未就绪');
  const code = genCode(`E457${tag}`);
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/products', {
    code,
    name: `E2E委外返工扣款${tag}${code}`,
    unit: '米',
    category_id: ctx.productCategoryIds[0],
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = requireId(created, `建产品 ${code}`);
  CLEANUP.push({ path: `/products/${id}`, label: `product#${id}` });
  const readBack = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/products/${id}`);
  expect(String(readBack.code), `产品 ${id} 编码回读`).toBe(code);
  expect(String(readBack.unit), `产品 ${id} 计量单位回读`).toBe('米');
  return { id, code };
}

interface DraftOrder {
  orderId: number;
  orderNo: string;
  dyeLotNo: string;
  colorNo: string;
  issueQuantity: string;
}

/**
 * 建委外染整订单（停在 draft）并回读全部写入值。
 * 调用方：457-01/02/03/04/05；传给谁：handlers/outsourcing_handler::create_outsourcing_order
 * → services/outsourcing_ops/order.rs（单号查重、取值域门）。
 * 存什么：outsourcing_order 的 order_no/order_type/supplier_id/issue_date/issue_quantity/
 * issue_unit/material_cost/processing_fee/freight_fee/tax_amount/standard_loss_rate/
 * dye_lot_no/color_no/status。存哪里：表 outsourcing_order。
 */
async function createDraftOrder(
  page: Page,
  tag: string,
  opts: {
    issueQuantity: string;
    materialCost: string;
    processingFee: string;
    freightFee: string;
    taxAmount: string;
    standardLossRate: string;
  }
): Promise<DraftOrder> {
  const ctx = getCtx();
  const supplierId = ctx.supplierId;
  if (!supplierId) throw new Error('前置缺失：ctx.supplierId 未就绪，委外单无法挂真实加工厂');
  const orderNo = genCode(`WO457${tag}`);
  const dyeLotNo = genDyeLotNo();
  const colorNo = genCode(`C457${tag}`);

  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/outsourcing-orders',
    {
      order_no: orderNo,
      order_type: ORDER_TYPE_DYEING,
      supplier_id: supplierId,
      color_no: colorNo,
      dye_lot_no: dyeLotNo,
      issue_date: todayStr(),
      expected_return_date: todayStr(),
      issue_quantity: opts.issueQuantity,
      issue_unit: '米',
      material_cost: opts.materialCost,
      processing_fee: opts.processingFee,
      freight_fee: opts.freightFee,
      tax_amount: opts.taxAmount,
      standard_loss_rate: opts.standardLossRate,
      remarks: `E2E-457${tag} 委外染整`,
    }
  );
  const orderId = requireId(created, `委外订单 ${orderNo}`);
  CLEANUP.push({ path: `/production/outsourcing-orders/${orderId}`, label: `order#${orderId}` });

  const asDraft = await readOrder(page, orderNo);
  expect(String(asDraft.status), `订单 ${orderNo} 建单后初始态应为 draft`).toBe(ORDER_STATUS_DRAFT);
  expect(String(asDraft.order_no), '订单号逐字符落库回读').toBe(orderNo);
  expect(String(asDraft.order_type), '委外类型逐字符落库回读').toBe(ORDER_TYPE_DYEING);
  expect(String(asDraft.issue_unit), '发出单位逐字符落库回读').toBe('米');
  expect(String(asDraft.dye_lot_no), '缸号逐字符落库回读').toBe(dyeLotNo);
  expectDecEquals(
    asDraft.issue_quantity,
    decLiteral(opts.issueQuantity, '发出数量'),
    '发出数量落库回读'
  );
  expectDecEquals(
    asDraft.standard_loss_rate,
    decLiteral(opts.standardLossRate, '定额损耗率'),
    '定额损耗率落库回读'
  );
  expectDecEquals(asDraft.processing_fee, decLiteral(opts.processingFee, '染费'), '染费落库回读');
  expect(Number(asDraft.supplier_id), '加工厂回读等于 ctx.supplierId').toBe(supplierId);
  return { orderId, orderNo, dyeLotNo, colorNo, issueQuantity: opts.issueQuantity };
}

/**
 * draft → issued → processing 两级合法推进，每级读回。
 * 传给谁：outsourcing_handler::issue_outsourcing_order / record_processing →
 * services/outsourcing_ops/order.rs（仅 draft 可发料；发料落 OVIS 凭证）。
 */
/**
 * 选一个可放生产匹的非成品仓（发料门控要求明细引用 AVAILABLE 生产匹，
 * 而生产匹按 validate_warehouse_for_piece_type 不得入成品仓）。
 * 入参 page；传给谁 GET /warehouses 出参；存什么 不持久化，仅回读仓库列表取首个非成品仓 id。
 */
async function pickGreigeWarehouse(page: Page): Promise<number> {
  const res = await apiCallRaw<unknown>(page, 'GET', '/warehouses?page=1&page_size=200');
  const rows = pickListArray<Record<string, unknown>>(res, 'items', '生产匹入仓候选 /warehouses');
  const row = rows.find(r => r.warehouse_type !== 'finished');
  if (!row) {
    throw new Error(
      '[457] 无非成品仓可承载生产匹（发料前置），validate_warehouse_for_piece_type 会拒成品入胚布，链断显式判红'
    );
  }
  return Number(row.id);
}

/**
 * 自建一笔 AVAILABLE 生产匹，作为委外染整发料的真实前置（发料必须精确到匹）。
 * 链路与生产报工写入方同源：生产订单 → 流转卡（schedule→备布→完成备布）→ 工序启动 → 报工逐匹入非成品仓，
 * 再 GET /inventory/pieces 回读该匹确认为 AVAILABLE，取不到即判红（不兜底放行空明细）。
 * 入参：productId 本用例自建产品、warehouseId 非成品仓、tag 归因、totalQuantity 单匹米数（等于订单发出量）。
 * 传给谁：handlers 的生产订单/流转卡/工序报工与 GET /inventory/pieces；存哪里：production_orders、
 *        flow_cards、inventory_piece（生产匹）。
 */
async function seedGreigePieceForIssue(
  page: Page,
  opts: { productId: number; warehouseId: number; tag: string; totalQuantity: string }
): Promise<string> {
  const { productId, warehouseId, tag, totalQuantity } = opts;
  const productionOrderNo = genCode(`E457${tag}PO`);
  const po = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/production-orders/orders',
    { order_no: productionOrderNo, product_id: productId, planned_quantity: totalQuantity }
  );
  const poId = requireId(po, `${tag} 生产订单`);

  const card = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/production/flow-cards', {
    production_order_id: poId,
    product_id: productId,
    product_name: `E2E委外返工${tag}胚布`,
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
    { flow_card_id: cardId }
  );
  const stepId = requireId(step, `${tag} 工序启动`);
  const pieceNo = `GR-${genCode(`E457${tag}P`)}-001`;
  await apiCall(page, 'POST', `/production/flow-cards/steps/${stepId}/complete`, {
    actual_quantity: totalQuantity,
    qualified_quantity: totalQuantity,
    pieces: [
      {
        piece_no: pieceNo,
        machine_no: `M-E457-${tag}`,
        machine_operator: `E457开机人${tag}`,
        length: totalQuantity,
        weight: '50.25',
        warehouse_id: warehouseId,
      },
    ],
  });

  const res = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/pieces?piece_no=${encodeURIComponent(pieceNo)}&product_id=${productId}&warehouse_id=${warehouseId}&page=1&page_size=20`
  );
  const rows = pickListArray<Record<string, unknown>>(res, 'items', `${tag} 生产匹回读`);
  const hit = rows.find(r => String(r.piece_no) === pieceNo);
  if (!hit) {
    throw new Error(
      `[457] 报工逐匹后 GET /inventory/pieces 未命中生产匹 ${pieceNo}（实际匹号集=${
        rows.map(r => r.piece_no).join(',') || '(空)'
      }）——发料前置的匹不存在，链断，显式判红`
    );
  }
  expect(String(hit.status), `生产匹 ${pieceNo} 入仓后状态应为 AVAILABLE`).toBe('AVAILABLE');
  return pieceNo;
}

async function advanceToProcessing(page: Page, order: DraftOrder): Promise<void> {
  // 发料前真实前置：自建一笔 AVAILABLE 生产匹并登记一条引用它的发料明细——
  // 委外染整发料门控要求明细精确到匹且匹可用，空明细会被显式拒绝（防"空单也能推进 issued
  // 并生成发料凭证"的静默数据完整性漏洞）。明细数量与单头发出量同源，逐字段取真实落库值。
  const issueProduct = await ownProduct(page, `${order.orderNo.slice(-3)}I`);
  const greigeWhId = await pickGreigeWarehouse(page);
  const pieceNo = await seedGreigePieceForIssue(page, {
    productId: issueProduct.id,
    warehouseId: greigeWhId,
    tag: order.orderNo.slice(-3),
    totalQuantity: order.issueQuantity,
  });
  await apiCall(page, 'POST', '/production/outsourcing-orders/items', {
    outsourcing_order_id: order.orderId,
    product_id: issueProduct.id,
    color_no: order.colorNo,
    dye_lot_no: order.dyeLotNo,
    batch_no: `B-${order.dyeLotNo}`,
    warehouse_id: greigeWhId,
    quantity: order.issueQuantity,
    unit: '米',
    unit_cost: '10',
    piece_no: pieceNo,
    remarks: `E2E-457 发料明细 ${order.orderNo}`,
  });

  const issued = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    `/production/outsourcing-orders/${order.orderId}/issue`
  );
  expect(String(issued.status), '发料返回体状态应为 issued').toBe(ORDER_STATUS_ISSUED);
  const asIssued = await readOrder(page, order.orderNo);
  expect(String(asIssued.status), '读回订单状态应为 issued').toBe(ORDER_STATUS_ISSUED);

  const processed = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    `/production/outsourcing-orders/${order.orderId}/processing`
  );
  expect(String(processed.status), '加工登记返回体状态应为 processing').toBe(
    ORDER_STATUS_PROCESSING
  );
  const asProcessing = await readOrder(page, order.orderNo);
  expect(String(asProcessing.status), '读回订单状态应为 processing').toBe(ORDER_STATUS_PROCESSING);
}

/**
 * 建收回单（草稿）——入参照写入方 CreateOutsourcingReceiptRequest 的键名。
 * 传给谁：outsourcing_handler::create_outsourcing_receipt → services/outsourcing_ops/receipt.rs。
 * 存什么：outsourcing_receipt 的 receipt_no/outsourcing_order_id/receipt_date/product_id/
 * dye_lot_no/color_no/batch_no/warehouse_id/return_quantity/quality_status/grade/status。
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
    returnQuantity: string;
    qualityStatus: string;
    grade: string;
  }
): Promise<{ receiptId: number; receiptNo: string }> {
  const receiptNo = genCode(`457${opts.tag}RC`);
  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/outsourcing-receipts',
    {
      receipt_no: receiptNo,
      outsourcing_order_id: opts.orderId,
      receipt_date: todayStr(),
      product_id: opts.productId,
      dye_lot_no: opts.dyeLotNo,
      color_no: opts.colorNo,
      batch_no: genCode(`457${opts.tag}BT`),
      warehouse_id: opts.warehouseId,
      return_quantity: opts.returnQuantity,
      quality_status: opts.qualityStatus,
      grade: opts.grade,
      remarks: `E2E-457${opts.tag} 收回`,
    }
  );
  const receiptId = requireId(created, `收回单 ${receiptNo}`);
  CLEANUP.push({
    path: `/production/outsourcing-receipts/${receiptId}`,
    label: `receipt#${receiptId}`,
  });
  return { receiptId, receiptNo };
}

/**
 * 在验布中的真实缸号档案上建同缸色差回修单（草稿）。
 * 传给谁：dye_batch_state_machine_handler::create_rework →
 * services/dye_batch_state_machine_ops/rework.rs（回修类型 + 回修资格校验）。
 * 存什么：dye_batch_rework 的 original_batch_id/original_batch_no/rework_batch_id/
 * rework_batch_no/rework_type/rework_reason/original_status/status。存哪里：表 dye_batch_rework。
 */
async function openRework(
  page: Page,
  tag: string
): Promise<{ reworkId: number; batchId: number; batchNo: string }> {
  const dyeBatch = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/dye-batches',
    {
      // 白坯建档形态：不送色号与染色批号（写入方按「色号缺失=白坯」归一，禁止占位假色值），
      // 缸号由后端取号生成；回修单只按该档案的 batch_no 建立追溯锚点
      planned_quantity: 900,
      status: DYE_BATCH_STATUS_INSPECTING,
      remarks: `E2E-457${tag}-REWORK`,
    }
  );
  const batchId = requireId(dyeBatch, '缸号档案');
  const batchNo = String(dyeBatch.batch_no);
  if (!batchNo) {
    throw new Error(`[${tag}] 缸号档案未回读出 batch_no，实际=${JSON.stringify(dyeBatch)}`);
  }
  const rework = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/dye-batch-reworks',
    {
      original_batch_id: batchId,
      original_batch_no: batchNo,
      rework_batch_id: batchId,
      rework_batch_no: batchNo,
      rework_type: REWORK_TYPE_COLOR_DIFFERENCE,
      rework_reason: `E2E-457${tag} 缸差超限同缸回修`,
      original_status: DYE_BATCH_STATUS_INSPECTING,
      remarks: `E2E-457${tag} 返工腿`,
    }
  );
  const reworkId = requireId(rework, '回修单');
  CLEANUP.push({ path: `/production/dye-batch-reworks/${reworkId}`, label: `rework#${reworkId}` });
  return { reworkId, batchId, batchNo };
}

/** 回读回修单主行（写入方 dye_batch_rework 字段名） */
async function readRework(page: Page, reworkId: number): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/production/dye-batch-reworks/${reworkId}`
  );
}

test.describe('457 委外染整不合格返工与扣款钩稽', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('457-01 委外判定不合格：收回数量重算落库并自动登记不合格质检记录，同缸返工逐级推进可读回', async ({
    page,
  }) => {
    // 功能：反向链第一段——判定不合格 → 确认回仓（入库数量/损耗/扣款额重算落库并回写订单）→
    // 自动质检记录逐字段回读 → 同缸色差回修走完 draft→approved→in_progress→completed 四级并每级读回。
    // 调用方：Playwright 分片 e2e（e2e/flow）；默认会话为超管（RBAC 短路），整链在 457-02/03 复用同形写法。
    // 入参：发出 1000 米、材料成本 20000、定额损耗率 0.02、实收 900 米、质检结论 unqualified、等级 C；
    //      实收小于发出且超定额属不合格退回的真实形态，扣款额由写入方算出，用例不自算自比。
    // 传给谁：services/outsourcing_ops/receipt.rs::confirm（收回重算 + 自动质检 + 回写订单）、
    //        services/dye_batch_state_machine_ops/rework.rs（回修状态机与时间戳）。
    // 存什么：outsourcing_receipt 的 status/loss_quantity/loss_rate/loss_type/is_loss_normal/
    //        abnormal_loss_amount/total_cost/unit_cost/inspection_id；outsourcing_order 的
    //        status/return_quantity/loss_quantity/abnormal_loss_amount/voucher_no_receipt；
    //        quality_inspection_record 的 inspection_result/qualified_qty/unqualified_qty/total_qty/
    //        qualification_rate/inspection_type/related_type/related_id/dye_lot_no/color_no/grade；
    //        dye_batch_rework 的 status 与 approved_at/started_at/completed_at。
    // 存哪里：表 outsourcing_receipt、outsourcing_order、quality_inspection_record、dye_batch_rework。
    test.setTimeout(240_000);
    const product = await ownProduct(page, 'A');
    const inbound = await pickDyeableWarehouse(page);
    const order = await createDraftOrder(page, 'A', {
      issueQuantity: '1000',
      materialCost: '20000',
      processingFee: '6000',
      freightFee: '300',
      taxAmount: '780',
      standardLossRate: '0.02',
    });
    await advanceToProcessing(page, order);

    const opened = await openReceipt(page, {
      tag: 'A',
      orderId: order.orderId,
      productId: product.id,
      warehouseId: inbound.id,
      dyeLotNo: order.dyeLotNo,
      colorNo: order.colorNo,
      returnQuantity: '900',
      qualityStatus: RECEIPT_QUALITY_UNQUALIFIED,
      grade: 'C',
    });
    const draft = await readReceipt(page, opened.receiptNo);
    expect(String(draft.status), '新建收回单初始态应为 draft').toBe(RECEIPT_STATUS_DRAFT);
    expect(String(draft.quality_status), '不合格判定逐字符落库回读').toBe(
      RECEIPT_QUALITY_UNQUALIFIED
    );
    expect(String(draft.dye_lot_no), '收回单缸号与订单逐字符同源').toBe(order.dyeLotNo);
    expect(String(draft.product_id), '收回单成品应等于本用例自建产品').toBe(String(product.id));
    // 草稿侧派生列在确认前保持写入方的零值初值（不得被预填）
    expectDecIsZero(draft.total_cost, '草稿收回单总成本应为 0（确认时才算）');
    expectDecIsZero(draft.abnormal_loss_amount, '草稿收回单扣款额应为 0（确认时才算）');
    expect(
      draft.inspection_id === null,
      `草稿收回单尚未生成质检记录，实得=${JSON.stringify(draft.inspection_id)}`
    ).toBe(true);

    const confirmed = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/production/outsourcing-receipts/${opened.receiptId}/confirm`
    );
    expect(String(confirmed.status), '确认收回返回体状态应为 confirmed').toBe(
      RECEIPT_STATUS_CONFIRMED
    );
    const receipt = await readReceipt(page, opened.receiptNo);
    expect(String(receipt.status), '读回收回单状态应为 confirmed').toBe(RECEIPT_STATUS_CONFIRMED);
    expectDecEqualsEachOther(
      receipt.return_quantity,
      confirmed.return_quantity,
      '收回数量在确认前后不得漂移'
    );
    expectDecEquals(
      receipt.loss_quantity,
      decLiteral('100', '损耗量'),
      '入库数量重算：损耗量=发出-实收'
    );
    expect(
      receipt.is_loss_normal === false,
      `超定额损耗必须标为非正常，实得=${JSON.stringify(receipt.is_loss_normal)}`
    ).toBe(true);
    expect(String(receipt.loss_type), '损耗分类应为 abnormal').toBe(LOSS_TYPE_ABNORMAL);
    expectDecScaleAtMost(receipt.loss_rate, 4, '损耗率列定标 (8,4)');
    expect(
      decFromRaw(receipt.abnormal_loss_amount, '收回单扣款额').v > 0n,
      `超定额损耗必须产生扣款额，实得=${JSON.stringify(receipt.abnormal_loss_amount)}`
    ).toBe(true);
    expectDecimalString(receipt.total_cost, '收回单总成本');
    expectDecimalString(receipt.unit_cost, '收回单单位成本');
    const inspectionId = Number(receipt.inspection_id);
    if (!Number.isInteger(inspectionId) || inspectionId <= 0) {
      throw new Error(
        `确认收回必须回写自动质检记录 id，实得=${JSON.stringify(receipt.inspection_id)}`
      );
    }

    const orderAfter = await readOrder(page, order.orderNo);
    expect(String(orderAfter.status), '确认后订单应进入 received').toBe(ORDER_STATUS_RECEIVED);
    expectDecEqualsEachOther(
      orderAfter.return_quantity,
      receipt.return_quantity,
      '订单入库数量与收回单同源'
    );
    expectDecEqualsEachOther(orderAfter.loss_quantity, receipt.loss_quantity, '订单损耗量同源重算');
    expectDecEqualsEachOther(
      orderAfter.abnormal_loss_amount,
      receipt.abnormal_loss_amount,
      '订单扣款额与收回单扣款额同源'
    );
    expect(String(orderAfter.actual_return_date), '确认应回写实际收回日期').toBe(todayStr());
    const receiptVoucherNo = String(orderAfter.voucher_no_receipt ?? '');
    expect(
      receiptVoucherNo.startsWith('OVRC'),
      `入库凭证号应由后端取号并回写订单，实得=${JSON.stringify(orderAfter.voucher_no_receipt)}`
    ).toBe(true);

    // 自动质检记录：不合格腿合格量必须为 0，不合格量等于收回全量（写入方口径）
    const record = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/quality-inspection/records/${inspectionId}`
    );
    expect(String(record.inspection_result), '不合格回仓的质检结论（中文词表，禁英文化）').toBe(
      INSPECTION_RESULT_UNQUALIFIED
    );
    expect(String(record.inspection_type), '质检类型取写入方专用值').toBe(
      INSPECTION_TYPE_OUTSOURCING_RECEIPT
    );
    expect(String(record.related_type), '反查锚点类型').toBe(INSPECTION_TYPE_OUTSOURCING_RECEIPT);
    expect(Number(record.related_id), '反查锚点指向收回单主键').toBe(opened.receiptId);
    expectDecIsZero(record.qualified_qty, '不合格不得计合格量');
    expectDecEqualsEachOther(record.unqualified_qty, receipt.return_quantity, '不合格量=收回数量');
    expectDecEqualsEachOther(record.total_qty, receipt.return_quantity, '受检总量=收回数量');
    expectDecIsZero(record.qualification_rate, '不合格合格率必须为 0');
    expect(String(record.dye_lot_no), '质检记录缸号与收回单逐字符同源').toBe(order.dyeLotNo);
    expect(String(record.color_no), '质检记录色号与收回单逐字符同源').toBe(order.colorNo);
    expect(String(record.grade), '等级透传收回单判定').toBe('C');
    expect(Number(record.supplier_id), '质检记录供应商透传委外订单加工厂').toBe(
      Number(getCtx().supplierId)
    );

    // 同缸返工：状态机逐级推进，每级读回并钉住时间戳只在到达后非空
    const leg = await openRework(page, 'A');
    const asDraftRework = await readRework(page, leg.reworkId);
    expect(String(asDraftRework.status), '回修单初始态应为 draft').toBe(REWORK_STATUS_DRAFT);
    expect(String(asDraftRework.rework_type), '回修类型逐字符落库').toBe(
      REWORK_TYPE_COLOR_DIFFERENCE
    );
    expect(String(asDraftRework.original_batch_no), '原缸号与缸号档案逐字符同源').toBe(leg.batchNo);
    expect(String(asDraftRework.rework_batch_no), '回修缸号逐字符落库回读').toBe(leg.batchNo);
    expect(String(asDraftRework.original_status), '原状态逐字符落库').toBe(
      DYE_BATCH_STATUS_INSPECTING
    );
    expect(
      asDraftRework.approved_at === null,
      `草稿态不得已有审批时间，实得=${JSON.stringify(asDraftRework.approved_at)}`
    ).toBe(true);

    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/approve`);
    const asApproved = await readRework(page, leg.reworkId);
    expect(String(asApproved.status), '审批后读回应为 approved').toBe(REWORK_STATUS_APPROVED);
    expect(
      asApproved.approved_at !== null,
      `审批时间必须落库，实得=${JSON.stringify(asApproved.approved_at)}`
    ).toBe(true);
    expect(
      asApproved.started_at === null && asApproved.completed_at === null,
      `未到达的级不得有时间戳，实得 started=${JSON.stringify(asApproved.started_at)} ` +
        `completed=${JSON.stringify(asApproved.completed_at)}`
    ).toBe(true);

    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/start`);
    const asStarted = await readRework(page, leg.reworkId);
    expect(String(asStarted.status), '开始后读回应为 in_progress').toBe(REWORK_STATUS_IN_PROGRESS);
    expect(
      asStarted.started_at !== null,
      `开始时间必须落库，实得=${JSON.stringify(asStarted.started_at)}`
    ).toBe(true);

    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/complete`);
    const asCompleted = await readRework(page, leg.reworkId);
    expect(String(asCompleted.status), '完成后读回应为 completed').toBe(REWORK_STATUS_COMPLETED);
    expect(
      asCompleted.completed_at !== null,
      `完成时间必须落库，实得=${JSON.stringify(asCompleted.completed_at)}`
    ).toBe(true);
  });

  test('457-02 不合格扣款与染费调整钩稽：四条成本腿逐分对平，返工后足量重收不再产生扣款腿', async ({
    page,
  }) => {
    // 功能：反向链第二段——draft 期按不合格折价调整染费 → 确认不合格回仓（超定额扣款落扣款凭证）→
    // 结算（染费凭证取调整后染费）→ 凭证腿与单头/收回单逐分对平；再建返工后足量重收单，
    // 证明损耗归零时扣款腿随之消失。
    // 调用方：outsourcing_handler 的 update_outsourcing_order / confirm_outsourcing_receipt /
    //        settle_outsourcing_order / list_outsourcing_vouchers。
    // 入参：扣款链订单发出 1000 米、材料成本 20000、定额损耗率 0.02、实收 900 米判不合格、
    //      建单染费 6000 后在 draft 期折价调整为 5400、运费 300、进项税额 780；
    //      返工重收链订单发出 900 米、材料成本 18000、实收 900 米判合格。
    // 传给谁：services/outsourcing_ops/{order,receipt}.rs（收回重算、扣款额、四张凭证、总成本）。
    // 存什么：outsourcing_voucher 的 voucher_type/amount/tax_amount/outsourcing_order_id/voucher_no；
    //        outsourcing_order 的 processing_fee/total_cost/abnormal_loss_amount/status/voucher_no_fee。
    // 存哪里：表 outsourcing_voucher、outsourcing_order、outsourcing_receipt。
    test.setTimeout(240_000);
    const product = await ownProduct(page, 'B');
    const inbound = await pickDyeableWarehouse(page);
    const order = await createDraftOrder(page, 'B', {
      issueQuantity: '1000',
      materialCost: '20000',
      processingFee: '6000',
      freightFee: '300',
      taxAmount: '780',
      standardLossRate: '0.02',
    });

    // 染费调整（不合格折价）只能在 draft 期落：received/settled 之后单头改写被状态门挡住（457-03 钉该门）
    const adjusted = await apiCallRaw<Record<string, unknown>>(
      page,
      'PUT',
      `/production/outsourcing-orders/${order.orderId}`,
      { processing_fee: '5400' }
    );
    expect(String(adjusted.status), 'draft 期改价不得推进状态').toBe(ORDER_STATUS_DRAFT);
    const afterAdjust = await readOrder(page, order.orderNo);
    expectDecEquals(
      afterAdjust.processing_fee,
      decLiteral('5400', '调整后染费'),
      '染费折价必须落库并读回'
    );
    expectDecEqualsEachOther(
      afterAdjust.material_cost,
      adjusted.material_cost,
      '改价不得顺带改写材料成本'
    );

    await advanceToProcessing(page, order);
    const opened = await openReceipt(page, {
      tag: 'B',
      orderId: order.orderId,
      productId: product.id,
      warehouseId: inbound.id,
      dyeLotNo: order.dyeLotNo,
      colorNo: order.colorNo,
      returnQuantity: '900',
      qualityStatus: RECEIPT_QUALITY_UNQUALIFIED,
      grade: 'C',
    });
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${opened.receiptId}/confirm`);
    const receipt = await readReceipt(page, opened.receiptNo);
    const orderReceived = await readOrder(page, order.orderNo);

    const vouchersAfterConfirm = await readVouchers(page, order.orderId);
    const issueVoucher = voucherOfType(
      vouchersAfterConfirm,
      VOUCHER_TYPE_ISSUE,
      `订单 ${order.orderNo} 确认后的凭证集`
    );
    const receiptVoucher = voucherOfType(
      vouchersAfterConfirm,
      VOUCHER_TYPE_RECEIPT,
      `订单 ${order.orderNo} 确认后的凭证集`
    );
    const lossVoucher = voucherOfType(
      vouchersAfterConfirm,
      VOUCHER_TYPE_LOSS,
      `订单 ${order.orderNo} 的超定额扣款凭证`
    );
    // 扣款腿与单头/收回单三方对平（明细合计=总额，取值全部来自后端出参）
    expectDecEqualsEachOther(
      lossVoucher.amount,
      receipt.abnormal_loss_amount,
      '扣款凭证金额=收回单扣款额'
    );
    expectDecEqualsEachOther(
      lossVoucher.amount,
      orderReceived.abnormal_loss_amount,
      '扣款凭证金额=订单扣款额'
    );
    expectDecEqualsEachOther(
      receiptVoucher.amount,
      orderReceived.total_cost,
      '入库凭证金额=订单总成本'
    );
    expectDecEqualsEachOther(
      receiptVoucher.amount,
      receipt.total_cost,
      '入库凭证金额=收回单总成本'
    );
    expectDecEqualsEachOther(
      issueVoucher.amount,
      orderReceived.material_cost,
      '发料凭证金额=材料成本'
    );
    expect(
      String(issueVoucher.voucher_no) === String(orderReceived.voucher_no_issue),
      `发料凭证号与订单回写逐字符同源，凭证=${JSON.stringify(issueVoucher.voucher_no)} ` +
        `订单=${JSON.stringify(orderReceived.voucher_no_issue)}`
    ).toBe(true);
    expect(
      lossVoucher.is_posted === false,
      `新落扣款凭证默认未过账，实得=${JSON.stringify(lossVoucher.is_posted)}`
    ).toBe(true);

    await apiCall(page, 'POST', `/production/outsourcing-orders/${order.orderId}/settle`);
    const orderSettled = await readOrder(page, order.orderNo);
    expect(String(orderSettled.status), '结算后读回应为 settled').toBe(ORDER_STATUS_SETTLED);
    const vouchersAfterSettle = await readVouchers(page, order.orderId);
    const feeVoucher = voucherOfType(
      vouchersAfterSettle,
      VOUCHER_TYPE_FEE,
      `订单 ${order.orderNo} 结算后的凭证集`
    );
    // 染费腿：调整后染费 + 运费 = 结算凭证金额；税额取订单进项税额
    expectDecEquals(
      feeVoucher.amount,
      decSumOfResponses(orderSettled.processing_fee, orderSettled.freight_fee, '染费+运费'),
      '染费凭证金额=调整后染费+运费'
    );
    expectDecEqualsEachOther(
      feeVoucher.tax_amount,
      orderSettled.tax_amount,
      '染费凭证税额=订单进项税额'
    );
    expect(String(feeVoucher.voucher_no), '结算凭证号必须回写订单').toBe(
      String(orderSettled.voucher_no_fee)
    );
    // 成本腿与扣款腿合计对平：入库凭证 + 扣款凭证 = 发料凭证 + 染费凭证（四条后端出参）
    const costLegSum = decSumOfResponses(
      receiptVoucher.amount,
      lossVoucher.amount,
      '入库腿+扣款腿'
    );
    const feeLegSum = decSumOfResponses(issueVoucher.amount, feeVoucher.amount, '材料腿+染费腿');
    expect(
      decCmp(costLegSum, feeLegSum) === 0,
      `成本腿合计必须与费用腿合计逐分对平：左=${decText(costLegSum)} 右=${decText(feeLegSum)}`
    ).toBe(true);
    expect(
      vouchersAfterSettle.length,
      `扣款链四张凭证齐备（实得类型集=${vouchersAfterSettle
        .map(v => String(v['voucher_type']))
        .join(',')}）`
    ).toBe(4);

    // 返工后足量重收：新单收回全量 → 损耗归零 → 扣款额归零且不落扣款凭证
    const reworkOrder = await createDraftOrder(page, 'B2', {
      issueQuantity: '900',
      materialCost: '18000',
      processingFee: '5400',
      freightFee: '300',
      taxAmount: '0',
      standardLossRate: '0.02',
    });
    await advanceToProcessing(page, reworkOrder);
    const reworkReceipt = await openReceipt(page, {
      tag: 'B2',
      orderId: reworkOrder.orderId,
      productId: product.id,
      warehouseId: inbound.id,
      dyeLotNo: reworkOrder.dyeLotNo,
      colorNo: reworkOrder.colorNo,
      returnQuantity: '900',
      qualityStatus: RECEIPT_QUALITY_QUALIFIED,
      grade: 'A',
    });
    await apiCall(
      page,
      'POST',
      `/production/outsourcing-receipts/${reworkReceipt.receiptId}/confirm`
    );
    const backReceipt = await readReceipt(page, reworkReceipt.receiptNo);
    const backOrder = await readOrder(page, reworkOrder.orderNo);
    expect(String(backReceipt.status), '返工后重收单应确认为 confirmed').toBe(
      RECEIPT_STATUS_CONFIRMED
    );
    expectDecIsZero(backReceipt.loss_quantity, '返工后足量重收损耗量应为 0');
    expectDecIsZero(backReceipt.loss_rate, '返工后足量重收损耗率应为 0');
    expect(String(backReceipt.loss_type), '零损耗分类应为 normal').toBe(LOSS_TYPE_NORMAL);
    expectDecIsZero(backReceipt.abnormal_loss_amount, '返工后不得再有超定额扣款额');
    expect(
      backReceipt.is_loss_normal === true,
      `零损耗必须标为正常，实得=${JSON.stringify(backReceipt.is_loss_normal)}`
    ).toBe(true);
    expectDecEqualsEachOther(
      backOrder.return_quantity,
      backReceipt.return_quantity,
      '返工后订单入库数量按新收回单重算'
    );
    expectDecEqualsEachOther(backOrder.total_cost, backReceipt.total_cost, '返工后总成本两腿同源');
    const reworkVouchers = await readVouchers(page, reworkOrder.orderId);
    const types = reworkVouchers.map(r => String(r['voucher_type'])).sort();
    expect(
      types.includes(VOUCHER_TYPE_LOSS),
      `返工后足量重收不得产生扣款凭证，实得凭证类型集=${types.join(',')}`
    ).toBe(false);
    expect(types, '返工后重收链在结算前应只有发料与入库两张凭证').toEqual([
      VOUCHER_TYPE_ISSUE,
      VOUCHER_TYPE_RECEIPT,
    ]);
    const reworkRecord = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/quality-inspection/records/${Number(backReceipt.inspection_id)}`
    );
    expect(String(reworkRecord.inspection_result), '返工后重收判定为合格（中文词表）').toBe(
      INSPECTION_RESULT_QUALIFIED
    );
    expectDecEqualsEachOther(
      reworkRecord.qualified_qty,
      backReceipt.return_quantity,
      '返工后合格量=收回全量'
    );
    expectDecIsZero(reworkRecord.unqualified_qty, '返工后不合格量必须归零');
  });

  test('457-03 状态机拦截：非法跃迁与已完工改写一律被门拒绝且零副作用', async ({ page }) => {
    // 功能：钉死反向链上的四道门——已确认收回单不可再确认、不可改收回数量；已结算订单不可重复结算、
    // 不可改核心字段；草稿回修单不可直接完成；已审批回修单不可改回修类型。每条被拒后读回原值零漂移。
    // 调用方：outsourcing_handler 与 dye_batch_state_machine_handler 各写端点。
    // 入参：自建链（发出 1000 / 实收 900 / 判不合格）与自建缸号回修单；被拒值刻意取当前态的非法目标态。
    // 传给谁：services/outsourcing_ops/{order,receipt}.rs 状态门、
    //        services/dye_batch_state_machine_ops/rework.rs 回修状态门与可改态门。
    // 存什么：被拒时零写入——收回单状态与数量、订单状态/染费/入库数量、凭证张数、回修单状态与类型均不变。
    // 存哪里：表 outsourcing_receipt、outsourcing_order、outsourcing_voucher、dye_batch_rework。
    test.setTimeout(240_000);
    const product = await ownProduct(page, 'C');
    const inbound = await pickDyeableWarehouse(page);
    const order = await createDraftOrder(page, 'C', {
      issueQuantity: '1000',
      materialCost: '20000',
      processingFee: '6000',
      freightFee: '300',
      taxAmount: '780',
      standardLossRate: '0.02',
    });
    await advanceToProcessing(page, order);
    const opened = await openReceipt(page, {
      tag: 'C',
      orderId: order.orderId,
      productId: product.id,
      warehouseId: inbound.id,
      dyeLotNo: order.dyeLotNo,
      colorNo: order.colorNo,
      returnQuantity: '900',
      qualityStatus: RECEIPT_QUALITY_UNQUALIFIED,
      grade: 'C',
    });
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${opened.receiptId}/confirm`);
    const confirmedReceipt = await readReceipt(page, opened.receiptNo);
    const receivedOrder = await readOrder(page, order.orderNo);
    const vouchersBefore = await readVouchers(page, order.orderId);

    // 门 1：已 confirmed 的收回单二次确认
    const doubleConfirm = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-receipts/${opened.receiptId}/confirm`
    );
    expectStateGateRejection(doubleConfirm, '已确认收回单二次确认应被状态门拒绝');
    expect(failureCode(doubleConfirm), '二次确认机器码属业务族（该拒绝为脱敏文案，只锁码）').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterDoubleConfirm = await readReceipt(page, opened.receiptNo);
    expect(String(afterDoubleConfirm.status), '二次确认被拒后状态不得漂移').toBe(
      RECEIPT_STATUS_CONFIRMED
    );
    const afterDoubleConfirmOrder = await readOrder(page, order.orderNo);
    expectDecEqualsEachOther(
      afterDoubleConfirmOrder.return_quantity,
      receivedOrder.return_quantity,
      '二次确认被拒不得追加入库数量'
    );
    const vouchersAfterDouble = await readVouchers(page, order.orderId);
    expect(
      vouchersAfterDouble.length,
      `二次确认被拒不得再落凭证（前 ${vouchersBefore.length} 张 / 后 ${vouchersAfterDouble.length} 张）`
    ).toBe(vouchersBefore.length);

    // 门 2：已 confirmed 的收回单不可改写收回数量（写入方仅放行 draft）
    const editConfirmedReceipt = await apiCallExpectFail(
      page,
      'PUT',
      `/production/outsourcing-receipts/${opened.receiptId}`,
      { return_quantity: '1000' }
    );
    expectStateGateRejection(editConfirmedReceipt, '已确认收回单改写数量应被状态门拒绝');
    const afterEditReceipt = await readReceipt(page, opened.receiptNo);
    expectDecEqualsEachOther(
      afterEditReceipt.return_quantity,
      confirmedReceipt.return_quantity,
      '被拒的数量改写不得落库'
    );

    // 门 3：结算一次后重复结算；已 settled 订单不可再改核心字段
    await apiCall(page, 'POST', `/production/outsourcing-orders/${order.orderId}/settle`);
    const settledOrder = await readOrder(page, order.orderNo);
    expect(String(settledOrder.status), '结算后应为 settled').toBe(ORDER_STATUS_SETTLED);
    const doubleSettle = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${order.orderId}/settle`
    );
    expectStateGateRejection(doubleSettle, '已结算订单重复结算应被状态门拒绝');
    const vouchersAfterDoubleSettle = await readVouchers(page, order.orderId);
    expect(
      vouchersAfterDoubleSettle.filter(r => String(r['voucher_type']) === VOUCHER_TYPE_FEE).length,
      '重复结算不得再落第二张染费凭证'
    ).toBe(1);
    const editSettledOrder = await apiCallExpectFail(
      page,
      'PUT',
      `/production/outsourcing-orders/${order.orderId}`,
      { processing_fee: '9999' }
    );
    expectStateGateRejection(editSettledOrder, '已结算订单改核心字段应被状态门拒绝');
    const afterEditOrder = await readOrder(page, order.orderNo);
    expectDecEqualsEachOther(
      afterEditOrder.processing_fee,
      settledOrder.processing_fee,
      '被拒的染费改写不得落库'
    );
    expect(String(afterEditOrder.status), '被拒不得改写订单态').toBe(ORDER_STATUS_SETTLED);

    // 门 4：回修单状态机——草稿不可直接完成；审批后不可改回修类型
    const leg = await openRework(page, 'C');
    const completeTooEarly = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${leg.reworkId}/complete`
    );
    expectStateGateRejection(completeTooEarly, '草稿回修单直接完成应被状态门拒绝');
    const stillDraft = await readRework(page, leg.reworkId);
    expect(String(stillDraft.status), '被拒后回修单仍应为 draft').toBe(REWORK_STATUS_DRAFT);
    expect(
      stillDraft.completed_at === null,
      `被拒不得写入完成时间，实得=${JSON.stringify(stillDraft.completed_at)}`
    ).toBe(true);

    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/approve`);
    const approved = await readRework(page, leg.reworkId);
    const editAfterApprove = await apiCallExpectFail(
      page,
      'PUT',
      `/production/dye-batch-reworks/${leg.reworkId}`,
      { rework_type: 'shrinkage' }
    );
    expectStateGateRejection(editAfterApprove, '非草稿回修单不可改写');
    const unchanged = await readRework(page, leg.reworkId);
    expect(String(unchanged.rework_type), '被拒的改写不得落库').toBe(String(approved.rework_type));
    expect(String(unchanged.status), '被拒不得推进回修态').toBe(REWORK_STATUS_APPROVED);
  });

  test('457-04 角色面：跟单判定与回仓确认可达、返工执行逐级可达，QC 跨岗调用被权限门拒绝', async ({
    page,
  }) => {
    // 功能：按岗位真实分工跑反向链——跟单/生产岗建收回单、判不合格并确认回仓；返工执行岗把回修单
    // 从审批推到完成；质检岗越权调回修审批与委外结算必须被权限门拒绝，返工执行岗越权建委外单同样被拒；
    // 被拒后由超管会话读回，证明零副作用。
    // 调用方：loginAsRole + apiCallExpectFail + expectDenied（helpers）；权限键由 URL 段
    //        /api/v1/erp/{seg3}/{seg4} 推导，即 production/outsourcing-orders、
    //        production/outsourcing-receipts、production/dye-batch-reworks 三族键。
    // 入参授权事实来源：backend/src/services/init_service_ops/permission.rs ——
    //        production_manager 持 outsourcing-orders:*、outsourcing-receipts:*、dye-batch-reworks:*；
    //        dyeing_master 持 dye-batch-reworks:* 且不持任何 outsourcing-*；
    //        quality_inspector 既不持 outsourcing-* 也不持 dye-batch-reworks。
    // 传给谁：权限中间件（拒绝时不触达 service）；允许侧走完整业务链。
    // 存什么：允许侧落收回单判定/确认与回修单三级状态推进；拒绝侧零写入。
    // 存哪里：表 outsourcing_receipt、outsourcing_order、dye_batch_rework。
    test.setTimeout(240_000);
    const product = await ownProduct(page, 'D');
    const inbound = await pickDyeableWarehouse(page);
    const order = await createDraftOrder(page, 'D', {
      issueQuantity: '1000',
      materialCost: '20000',
      processingFee: '6000',
      freightFee: '300',
      taxAmount: '780',
      standardLossRate: '0.02',
    });
    await advanceToProcessing(page, order);
    const leg = await openRework(page, 'D');

    // ── 跟单/生产岗：建收回单 + 判不合格 + 确认回仓（本岗职责内全部可达）
    await loginAsRole(page, 'production_manager');
    const receiptNo = genCode('457DRC');
    const pmCreated = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/outsourcing-receipts',
      {
        receipt_no: receiptNo,
        outsourcing_order_id: order.orderId,
        receipt_date: todayStr(),
        product_id: product.id,
        dye_lot_no: order.dyeLotNo,
        color_no: order.colorNo,
        batch_no: genCode('457DBT'),
        warehouse_id: inbound.id,
        return_quantity: '880',
        quality_status: RECEIPT_QUALITY_UNQUALIFIED,
        grade: 'C',
        remarks: 'E2E-457D 跟单岗判定',
      }
    );
    const pmReceiptId = requireId(pmCreated, '跟单岗收回单');
    CLEANUP.push({
      path: `/production/outsourcing-receipts/${pmReceiptId}`,
      label: `receipt#${pmReceiptId}`,
    });
    const pmDraft = await readReceipt(page, receiptNo);
    expect(String(pmDraft.status), '跟单岗建单后应为 draft').toBe(RECEIPT_STATUS_DRAFT);
    expect(String(pmDraft.quality_status), '跟单岗不合格判定落库可读回').toBe(
      RECEIPT_QUALITY_UNQUALIFIED
    );
    await apiCall(page, 'POST', `/production/outsourcing-receipts/${pmReceiptId}/confirm`);
    const pmConfirmed = await readReceipt(page, receiptNo);
    expect(String(pmConfirmed.status), '跟单岗确认回仓后可读回 confirmed').toBe(
      RECEIPT_STATUS_CONFIRMED
    );
    expectDecEquals(
      pmConfirmed.loss_quantity,
      decLiteral('120', '损耗量'),
      '跟单岗确认后的入库数量重算=发出-实收'
    );
    expect(String(pmConfirmed.loss_type), '超定额损耗分类应为 abnormal').toBe(LOSS_TYPE_ABNORMAL);

    // ── 返工执行岗：回修单审批→开始→完成（本岗持 dye-batch-reworks:*）
    await loginAsRole(page, 'dyeing_master');
    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/approve`);
    const masterApproved = await readRework(page, leg.reworkId);
    expect(String(masterApproved.status), '返工执行岗审批后可读回 approved').toBe(
      REWORK_STATUS_APPROVED
    );
    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/start`);
    const masterStarted = await readRework(page, leg.reworkId);
    expect(String(masterStarted.status), '返工执行岗开始后可读回 in_progress').toBe(
      REWORK_STATUS_IN_PROGRESS
    );
    await apiCall(page, 'POST', `/production/dye-batch-reworks/${leg.reworkId}/complete`);
    const masterCompleted = await readRework(page, leg.reworkId);
    expect(String(masterCompleted.status), '返工执行岗完成后可读回 completed').toBe(
      REWORK_STATUS_COMPLETED
    );

    // ── 跨岗越权：返工执行岗不能建委外单；质检岗既不能审批回修也不能结算委外
    const ghostOrderNo = genCode('WO457X');
    const dmOrderFail = await apiCallExpectFail(page, 'POST', '/production/outsourcing-orders', {
      order_no: ghostOrderNo,
      order_type: ORDER_TYPE_DYEING,
      supplier_id: getCtx().supplierId ?? 0,
      issue_date: todayStr(),
      issue_quantity: '10',
      issue_unit: '米',
      material_cost: '10',
    });
    expectDenied(dmOrderFail, 'dyeing_master 建委外订单应被权限门拒绝');

    await loginAsRole(page, 'quality_inspector');
    const qcApprove = await apiCallExpectFail(
      page,
      'POST',
      `/production/dye-batch-reworks/${leg.reworkId}/approve`
    );
    expectDenied(qcApprove, 'quality_inspector 调用回修审批端点应被权限门拒绝');
    const qcSettle = await apiCallExpectFail(
      page,
      'POST',
      `/production/outsourcing-orders/${order.orderId}/settle`
    );
    expectDenied(qcSettle, 'quality_inspector 调用委外结算端点应被权限门拒绝');

    // ── 被拒零副作用：由超管会话读回（越权岗本身无权读，不能拿它的读当证据）
    await loginViaUI(page, testUsername(), testPassword(), true);
    const ghostCheck = await apiCallExpectFail(
      page,
      'GET',
      `/production/outsourcing-orders/by-no/${encodeURIComponent(ghostOrderNo)}`
    );
    expect(
      ghostCheck.status,
      `被权限门拒绝的建单不得落库（按单号回读应 4xx，实得 ${ghostCheck.status} ` +
        `code=${failureCode(ghostCheck)}）`
    ).toBeGreaterThanOrEqual(400);
    const reworkAfterQc = await readRework(page, leg.reworkId);
    expect(String(reworkAfterQc.status), 'QC 越权被拒后回修单终态不得漂移').toBe(
      REWORK_STATUS_COMPLETED
    );
    const orderAfterQc = await readOrder(page, order.orderNo);
    expect(String(orderAfterQc.status), 'QC 越权结算被拒后订单态不得漂移').toBe(
      ORDER_STATUS_RECEIVED
    );
    const receiptAfterQc = await readReceipt(page, receiptNo);
    expect(String(receiptAfterQc.status), '越权前后收回单状态一致').toBe(RECEIPT_STATUS_CONFIRMED);
  });

  test('457-05 假成功防线：负数量、缺必填、引用不存在的委外单与成品全被拒且不留半成品', async ({
    page,
  }) => {
    // 功能：把三类会制造半成品的请求钉在被拒侧——收回数量为负、请求体缺必填 product_id、
    // 引用不存在的委外订单 id（外加引用不存在的成品 id），随后按订单维度重数收回单，必须一条都没落。
    // 调用方：outsourcing_handler::create_outsourcing_receipt → services/outsourcing_ops/receipt.rs
    //        的取值域门与引用存在性校验；请求解码失败由 middleware/trace_context.rs 收口成统一信封。
    // 入参：一张真实 draft 委外订单作计数锚点 + 一个不存在的订单 id + 一个不存在的成品 id。
    // 传给谁：写端点；被拒时事务未落一行。
    // 存什么：零写入——按 outsourcing_order_id 过滤的收回单列表计数为 0。
    // 存哪里：表 outsourcing_receipt（不应有行）。
    test.setTimeout(180_000);
    const product = await ownProduct(page, 'E');
    const order = await createDraftOrder(page, 'E', {
      issueQuantity: '500',
      materialCost: '10000',
      processingFee: '3000',
      freightFee: '150',
      taxAmount: '390',
      standardLossRate: '0.02',
    });
    const receiptsPath = `/production/outsourcing-receipts?outsourcing_order_id=${order.orderId}&page=1&page_size=50`;
    const baseline = await safeGetList<Record<string, unknown>>(page, receiptsPath);
    expect(baseline.length, '负例执行前该订单的收回单基数应为 0').toBe(0);

    // 负 1：收回数量为负（写入方 return_quantity <= 0 取值域门）
    const negative = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode('457ENEG'),
      outsourcing_order_id: order.orderId,
      receipt_date: todayStr(),
      product_id: product.id,
      return_quantity: '-50',
      quality_status: RECEIPT_QUALITY_UNQUALIFIED,
    });
    expectStateGateRejection(negative, '负数收回数量必须被取值域门拒绝');

    // 负 2：缺必填 product_id（请求解码失败被收口为统一失败信封）
    const missingField = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode('457EMIS'),
      outsourcing_order_id: order.orderId,
      receipt_date: todayStr(),
      return_quantity: '10',
      quality_status: RECEIPT_QUALITY_UNQUALIFIED,
    });
    expectStateGateRejection(missingField, '缺必填成品的收回单必须被校验门拒绝');

    // 负 3：引用不存在的委外订单（引用存在性校验按业务族拒绝，不裸抛 5xx）
    const ghostOrderId = order.orderId + 900000;
    const ghostOrder = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode('457EGO'),
      outsourcing_order_id: ghostOrderId,
      receipt_date: todayStr(),
      product_id: product.id,
      return_quantity: '10',
      quality_status: RECEIPT_QUALITY_UNQUALIFIED,
    });
    expectStateGateRejection(ghostOrder, '引用不存在的委外订单必须被拒绝');
    expect(
      failureCode(ghostOrder),
      `不存在引用应归因到业务族而非 5xx（实得 code=${failureCode(ghostOrder)}）`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 负 4：引用不存在的成品
    const ghostProduct = await apiCallExpectFail(page, 'POST', '/production/outsourcing-receipts', {
      receipt_no: genCode('457EGP'),
      outsourcing_order_id: order.orderId,
      receipt_date: todayStr(),
      product_id: product.id + 900000,
      return_quantity: '10',
      quality_status: RECEIPT_QUALITY_UNQUALIFIED,
    });
    expectStateGateRejection(ghostProduct, '引用不存在的成品必须被拒绝');

    // 重数：四条被拒请求都不得留下半成品收回单
    const afterNegatives = await safeGetList<Record<string, unknown>>(page, receiptsPath);
    expect(
      afterNegatives.length,
      `被拒的收回单请求不得落库任何行，实得 id 集=${
        afterNegatives.map(r => String(r['id'])).join(',') || '(空)'
      }`
    ).toBe(0);
    const ghostRows = await safeGetList<Record<string, unknown>>(
      page,
      `/production/outsourcing-receipts?outsourcing_order_id=${ghostOrderId}&page=1&page_size=50`
    );
    expect(ghostRows.length, '不存在订单 id 侧同样不得有收回单行').toBe(0);
    const orderStillDraft = await readOrder(page, order.orderNo);
    expect(String(orderStillDraft.status), '负例不得改写锚点订单态').toBe(ORDER_STATUS_DRAFT);
  });
});
