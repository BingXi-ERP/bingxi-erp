// 461 采购收货 → 应付 → 付款 钩稽守恒契约 E2E
//
// 端点存在性唯一事实来源 frontend/scripts/route-snapshot.txt（行号为本支实测）：
//  · POST `/purchase/orders`（1497 create_order）、POST `/purchase/orders/{id}/items`（1502
//    create_order_item）、POST `/purchase/orders/{id}/submit`（1504）、POST `/purchase/orders/{id}/approve`（1498）、
//    GET `/purchase/orders/{id}`（804 get_order）；
//  · POST `/purchase/receipts`（1513 create_receipt）、GET `/purchase/receipts`（819 list_receipts，
//    出参 PaginatedResponse{items,total,page,page_size}）、GET `/purchase/receipts/{id}`（820 get_receipt，
//    出参 PurchaseReceiptDto）、GET `/purchase/receipts/{id}/items`（821 list_receipt_items，出参裸数组）、
//    POST `/purchase/receipts/{id}/confirm`（1515 confirm_receipt）；
//  · POST `/purchase/inspections`（1494）与 POST `/purchase/inspections/{id}/complete`（1495）
//    经 helpers.seedInspectionPass 走通（收货单进 PASSED 的唯一业务写入口）；
//  · POST `/ap/invoices/auto-generate`（1024）、GET `/ap/invoices`（160，分页信封）、
//    GET `/ap/invoices/{id}`（161，出参 ap_invoice Model）、GET `/ap/invoices/{id}/relations`（163，裸数组）、
//    POST `/ap/invoices/{id}/approve`（1021）；
//  · POST `/ap/payment-requests`（1025）、GET `/ap/payment-requests/{id}`（169，主表 flatten + items 数组）、
//    POST `/ap/payment-requests/{id}/submit`（1028）、POST `/ap/payment-requests/{id}/approve`（1026）；
//  · POST `/ap/payments`（1029）、GET `/ap/payments/{id}`（172）、PUT `/ap/payments/{id}`（1656）、
//    POST `/ap/payments/{id}/confirm`（1030）。
//    ap/payments 族在册只有 GET/POST/PUT/confirm，**没有删除腿**，本文件不亦不断言不存在的 DELETE。
//
// 出参键名 = backend/src/models/{purchase_receipt,purchase_receipt_item,purchase_order_item,
// ap_invoice,ap_payment_request,ap_payment_request_item,ap_payment}.rs 字段名（snake_case）；
// `/purchase/orders/{id}` 的 items 由 handlers/purchase_order_handler.rs:123-134 走
// `column_as(product.name→product_name, product.code→product_code)+LeftJoin+into_json()`，
// 键是 purchase_order_item 列名（quantity/subtotal/tax_percent/tax_amount/total_amount/received_quantity），
// 不是 PurchaseOrderItemDto 的改名键；GET `/purchase/receipts` 与 `/{id}` 由
// services/purchase_receipt_ops/query.rs:83-86 富化 supplier_name/warehouse_name/purchase_order_no/created_by_name。
//
// 状态与取值词表唯一事实来源＝写入方，比较点逐字符相同（大小写混用是故意的）：
//  · purchase_order（大写）DRAFT/PENDING_APPROVAL/APPROVED/PARTIAL_RECEIVED（models/status/
//    purchase_inventory.rs::purchase_order，收货门控清单 RECEIPT_ELIGIBLE=[APPROVED,PARTIAL_RECEIVED]）；
//  · purchase_receipt（大写）DRAFT/CONFIRMED/COMPLETED（同文件::purchase_receipt）；
//  · purchase_receipt_inspection（大写）PENDING/PASSED/REJECTED/CONCESSION_ACCEPTED（同文件
//    ::purchase_receipt_inspection），结算与入库门控仅 PASSED 放行；
//  · purchase_inspection_result（英文小写码）pass/fail/partial（同文件::purchase_inspection_result）；
//  · ap_invoice.invoice_status（大写）DRAFT/AUDITED/PARTIAL_PAID/PAID/CANCELLED（models/ap_invoice.rs:70
//    注释 + models/status/finance.rs::ap_invoice.INVOICE_AUDITED + status/general.rs::payment）；
//  · ap_invoice.source_type=PURCHASE_RECEIPT、invoice_type=PURCHASE（services/ap_invoice_ops/receipt.rs:75,224-225）；
//  · ap_payment_request.approval_status（大写）DRAFT/APPROVING/APPROVED/REJECTED（models/ap_payment_request.rs
//    字段注释 + models/status/finance.rs::ap_payment_request）；payment_type=PREPAYMENT、payment_method=TT
//    （models/ap_payment_request.rs:30-38 词表注释）；
//  · ap_payment.payment_status（大写）REGISTERED/CONFIRMED（models/ap_payment.rs:43-45 + status/general.rs::payment）。
//
// 价税口径（唯一事实来源 services/ap_invoice_ops/receipt.rs 与 utils/tax.rs，本文件按写入方断，
// 不按"含税录入反算"断——后者属报价域 services/quotation_ops/calc.rs 的口径，采购域入参只有
// 不含税单价 unit_price 与百分数税率 tax_rate，见 services/po/mod.rs:111-143 与 utils/tax.rs 模块头）：
//  · 采购行 subtotal=数量×单价、tax_amount=subtotal×税率/100 收敛 2 位（utils/tax.rs::tax_amount），
//    行 total_amount=subtotal+tax_amount-discount_amount（services/po/order_ops/crud.rs:475）；
//  · 应付单 amount 与 unpaid_amount 取含税价税合计 net+tax、tax_amount 取逐行解析的进项税
//    （ap_invoice_ops/receipt.rs:41-59,206-245），净额基取收货单 total_amount；
//  · 付款确认后 paid_amount 累加、unpaid_amount=amount-paid_amount、结清转 PAID
//    （services/ap_payment_service.rs:366-404）。
//  · 金额列定标：ap_invoice 金额 DECIMAL(18,2)、purchase_receipt.total_amount DECIMAL(18,2)、
//    purchase_receipt_item.amount DECIMAL(18,2)、purchase_order_item.subtotal/tax_amount/total_amount
//    DECIMAL(18,2)、tax_percent DECIMAL(7,4)、quantity DECIMAL(18,4)。
// 出参 Decimal 是 JSON 字符串（rust_decimal 默认序列化），本文件全程 BigInt 定标比较，
// **不在测试内做任何二次舍入、不用浮点、不用乘法造含税**。
//
// 失败体只有 AppError 一种形状（字符串 code + message + trace_id + timestamp）：
// 状态门与字段校验归 400（VALIDATION_ERROR/BUSINESS_ERROR/BAD_REQUEST），权限门归 403 FORBIDDEN，
// 记录不存在归 404 NOT_FOUND。脱敏族只锁 HTTP 码 + 机器码，不读文案。
import { test, expect } from '../diagnose-fixture';
import { type Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginAsRole,
  loginViaUI,
  seedInspectionPass,
  tryCleanup,
  type ApiFailureResult,
} from './helpers';
import { pickListArray } from './ui-helpers';
// 产品类型单源常量（与后端 product_type 词表同源）：建品夹具取值必须经成员引用。
import { PRODUCT_TYPE } from '../../src/constants/product-type';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

// ───────────────────────────── 状态词表常量（逐字符照写入方）─────────────────────────────

const PO_STATUS_DRAFT = 'DRAFT';
const PO_STATUS_APPROVED = 'APPROVED';
const RECEIPT_STATUS_DRAFT = 'DRAFT';
const RECEIPT_STATUS_COMPLETED = 'COMPLETED';
const RECEIPT_INSPECTION_PENDING = 'PENDING';
const RECEIPT_INSPECTION_PASSED = 'PASSED';
const INSPECTION_RESULT_PASS = 'pass';
const AP_INVOICE_TYPE_PURCHASE = 'PURCHASE';
const AP_SOURCE_TYPE_PURCHASE_RECEIPT = 'PURCHASE_RECEIPT';
const AP_STATUS_DRAFT = 'DRAFT';
const AP_STATUS_AUDITED = 'AUDITED';
const AP_STATUS_PARTIAL_PAID = 'PARTIAL_PAID';
const AP_STATUS_PAID = 'PAID';
const AP_REQ_STATUS_DRAFT = 'DRAFT';
const AP_REQ_STATUS_APPROVING = 'APPROVING';
const AP_REQ_STATUS_APPROVED = 'APPROVED';
const AP_REQ_PAYMENT_TYPE_PREPAYMENT = 'PREPAYMENT';
const AP_PAYMENT_METHOD_TT = 'TT';
const AP_PAYMENT_STATUS_REGISTERED = 'REGISTERED';
const AP_PAYMENT_STATUS_CONFIRMED = 'CONFIRMED';

// ───────────────────────────── 十进制字符串对账（禁浮点、禁二次舍入）─────────────────────────────

/** 定标十进制值：v 为去掉小数点后的整数（含符号），s 为小数位数 */
interface Dec {
  v: bigint;
  s: number;
}

/** 报错模板用：BigInt 直接 JSON.stringify 会抛 TypeError 并盖掉真实断言原因 */
function jsonText(raw: unknown): string {
  return JSON.stringify(raw, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

function decFromRaw(raw: unknown, label: string): Dec {
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : null;
  if (text === null) {
    throw new Error(
      `${label}：后端 Decimal 出参必须是字符串，实际类型=${typeof raw} 值=${jsonText(raw)}`
    );
  }
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`${label}：无法按十进制解析，raw=${jsonText(raw)}`);
  const sign = m[1] === '-' ? -1n : 1n;
  return { v: sign * BigInt(`${m[2]}${m[3] ?? ''}`), s: (m[3] ?? '').length };
}

function decLiteral(text: string, label: string): Dec {
  return decFromRaw(text, label);
}

function alignDec(a: Dec, b: Dec): [bigint, bigint, number] {
  const s = Math.max(a.s, b.s);
  return [a.v * 10n ** BigInt(s - a.s), b.v * 10n ** BigInt(s - b.s), s];
}

function decCmp(a: Dec, b: Dec): number {
  const [x, y] = alignDec(a, b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function decAdd(a: Dec, b: Dec): Dec {
  const [x, y, s] = alignDec(a, b);
  return { v: x + y, s };
}

/** 两条后端出参相减（余额相减守恒只认这个形态，不引入用例自造数） */
function decSub(a: Dec, b: Dec): Dec {
  const [x, y, s] = alignDec(a, b);
  return { v: x - y, s };
}

function decText(d: Dec): string {
  const sign = d.v < 0n ? '-' : '';
  const digits = (d.v < 0n ? -d.v : d.v).toString().padStart(d.s + 1, '0');
  return d.s === 0 ? `${sign}${digits}` : `${sign}${digits.slice(0, -d.s)}.${digits.slice(-d.s)}`;
}

function decZero(): Dec {
  return { v: 0n, s: 0 };
}

/** 十进制逐值相等（定标对齐比整数，被舍入的分位在此暴露，不做容差比较） */
function expectDecEquals(actual: unknown, expected: Dec, label: string): void {
  const a = decFromRaw(actual, label);
  expect(
    decCmp(a, expected) === 0,
    `${label}：十进制期望=${decText(expected)} 实际=${decText(a)}（raw=${jsonText(actual)}）`
  ).toBe(true);
}

/** 两条后端出参之间对平（明细合计 vs 单头、单头 vs 应付账面额），不引入用例自造值 */
function expectDecEqualsEachOther(left: unknown, right: unknown, label: string): void {
  const l = decFromRaw(left, `${label}（左）`);
  const r = decFromRaw(right, `${label}（右）`);
  expect(
    decCmp(l, r) === 0,
    `${label}：两侧出参必须逐分对平，左=${decText(l)}（raw=${jsonText(left)}） ` +
      `右=${decText(r)}（raw=${jsonText(right)}）`
  ).toBe(true);
}

/** 出参必须是十进制字符串（Decimal 未开 serde-float 的线格式契约） */
function expectDecimalString(raw: unknown, label: string): Dec {
  expect(
    typeof raw,
    `${label}：Decimal 出参应为 JSON 字符串，实际类型=${typeof raw} 值=${jsonText(raw)}`
  ).toBe('string');
  return decFromRaw(raw, label);
}

/** 列定标位数上限：超出即 DB 列被舍入或序列化线格式位数漂移 */
function expectDecScaleAtMost(raw: unknown, maxScale: number, label: string): Dec {
  const d = expectDecimalString(raw, label);
  expect(
    d.s <= maxScale,
    `${label}：小数位数不得超过列定标 ${maxScale}，实际=${d.s}（raw=${jsonText(raw)}）`
  ).toBe(true);
  return d;
}

/** 按行累加某个十进制键（字符串 → BigInt 定标相加，全程不经过 JS number） */
function decSumOf(rows: Array<Record<string, unknown>>, key: string, label: string): Dec {
  let acc = decZero();
  for (const [i, row] of rows.entries()) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) {
      throw new Error(
        `${label} 第 ${i + 1} 行缺十进制键 "${key}"，实际键=${Object.keys(row).join(',')}`
      );
    }
    acc = decAdd(acc, decFromRaw(row[key], `${label} 第 ${i + 1} 行 ${key}`));
  }
  return acc;
}

function requireId(row: Record<string, unknown>, label: string): number {
  const id = Number(row?.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`${label}：未取到有效 id，实际键=${Object.keys(row ?? {}).join(',')}`);
  }
  return id;
}

/** NaiveDate 入参必须发 YYYY-MM-DD 纯日期：发完整 ISO 时间戳会被后端判格式不正确 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function expectPureDate(raw: unknown, label: string): string {
  const text = String(raw);
  expect(
    /^\d{4}-\d{2}-\d{2}$/.test(text),
    `${label}：日期出参必须是 YYYY-MM-DD 纯日期，实际=${JSON.stringify(raw)}`
  ).toBe(true);
  return text;
}

/**
 * 状态门/字段校验族拒绝（HTTP 400 + 字符串机器码 ∈ {VALIDATION_ERROR, BUSINESS_ERROR, BAD_REQUEST}）。
 * 调用方：461 各负例腿。判据来自 backend utils/error.rs:358-366 的 HTTP 映射，
 * 403 属权限门、404 属记录不存在、5xx 属裸崩，都不构成本族的"拒绝生效"。
 */
function expectReject400(result: ApiFailureResult, label: string): string {
  const code = failureCode(result);
  expect(result.status, `${label}：应恰为 HTTP 400，实际 ${result.status} code=${code}`).toBe(400);
  expect(
    code === APP_ERROR_CODES.VALIDATION_ERROR ||
      code === APP_ERROR_CODES.BUSINESS_ERROR ||
      code === APP_ERROR_CODES.BAD_REQUEST,
    `${label}：机器码必须属状态门/字段校验族，实际 code=${jsonText(result.code)}`
  ).toBe(true);
  return code as string;
}

/** 统一失败信封四键齐全（code 字符串 + message + trace_id + timestamp），权限拒绝面同样适用 */
function expectAppErrorEnvelope(result: ApiFailureResult, label: string): void {
  const code = failureCode(result);
  expect(code, `${label}：失败体 code 必须是字符串机器码，实际=${jsonText(result.code)}`).toBeTruthy();
  expect(
    typeof result.message === 'string' && result.message.length > 0,
    `${label}：失败体 message 必须存在且非空，实际=${jsonText(result.message)}`
  ).toBe(true);
  expect(
    typeof result.trace_id === 'string' && result.trace_id.length > 0,
    `${label}：失败体 trace_id 必须存在（AppError 统一信封），实际键缺失`
  ).toBe(true);
  expect(
    result.timestamp !== undefined && result.timestamp !== null,
    `${label}：失败体 timestamp 必须存在（AppError 统一信封）`
  ).toBe(true);
}

// ───────────────────────────── 读回助手（写后必重读，不只看 200）─────────────────────────────

/** 分页信封四键判形并取 items：缺键或非数组立即抛错，不用 ?? [] 掩盖 */
function readPagedRows(page: Page, path: string, label: string): Promise<Record<string, unknown>[]>;
async function readPagedRows(
  page: Page,
  path: string,
  label: string
): Promise<Record<string, unknown>[]> {
  const data = await apiCallRaw<Record<string, unknown>>(page, 'GET', path);
  for (const key of ['items', 'total', 'page', 'page_size']) {
    expect(
      Object.prototype.hasOwnProperty.call(data, key),
      `${label}：分页信封缺键 "${key}"，实际键=${Object.keys(data).join(',')}`
    ).toBe(true);
  }
  expect(
    typeof data.total === 'number' && typeof data.page === 'number' && typeof data.page_size === 'number',
    `${label}：分页信封 total/page/page_size 必须是数字，实际=${jsonText({
      total: data.total,
      page: data.page,
      page_size: data.page_size,
    })}`
  ).toBe(true);
  return pickListArray<Record<string, unknown>>(data, 'items', label);
}

/**
 * 按供应商维度取该供应商的全部单据行（供应商为本用例自建，行集天然封闭，翻页取全）。
 * 传给谁：GET /purchase/receipts、GET /ap/invoices、GET /ap/payment-requests、GET /ap/payments。
 */
async function listBySupplier(
  page: Page,
  base: string,
  supplierId: number,
  label: string
): Promise<Record<string, unknown>[]> {
  const pageSize = 100;
  const all: Record<string, unknown>[] = [];
  for (let pageNo = 1; pageNo <= 10; pageNo += 1) {
    const rows = await readPagedRows(
      page,
      `${base}?supplier_id=${supplierId}&page=${pageNo}&page_size=${pageSize}`,
      `${label} 第 ${pageNo} 页`
    );
    all.push(...rows);
    if (rows.length < pageSize) return all;
    if (pageNo === 10) {
      throw new Error(`${label}：翻页达 10 页上限（1000 行）仍未到尾，判为取数异常`);
    }
  }
  return all;
}

/** 被拒写入的零残留判据：按本用例唯一 notes 标记在列表中定位，命中数必须为 0 */
async function expectNoResidualByNotes(
  page: Page,
  base: string,
  supplierId: number,
  marker: string,
  label: string
): Promise<void> {
  const rows = await listBySupplier(page, base, supplierId, `${label} 残留扫描`);
  const hits = rows.filter(r => String(r.notes ?? '') === marker);
  expect(
    hits.length,
    `${label}：被拒写入必须零落库，按 notes=${marker} 命中 ${hits.length} 行（ids=${hits
      .map(h => h.id)
      .join(',')}）`
  ).toBe(0);
}

/** 读应付单详情（GET /ap/invoices/{id}，出参 ap_invoice Model 列名） */
async function readInvoice(page: Page, invoiceId: number): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(page, 'GET', `/ap/invoices/${invoiceId}`);
}

/** 读收货单主行（GET /purchase/receipts/{id}，出参 PurchaseReceiptDto） */
async function readReceiptHead(page: Page, receiptId: number): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(page, 'GET', `/purchase/receipts/${receiptId}`);
}

/** 读收货单明细（GET /purchase/receipts/{id}/items，出参裸数组 purchase_receipt_item） */
async function readReceiptItems(
  page: Page,
  receiptId: number
): Promise<Record<string, unknown>[]> {
  const rows = await apiCallRaw<unknown>(page, 'GET', `/purchase/receipts/${receiptId}/items`);
  return pickListArray<Record<string, unknown>>(rows, 'bare', `收货单 ${receiptId} 明细`);
}

/** 读采购订单明细（GET /purchase/orders/{id} 的 items，键为 purchase_order_item 列名 + JOIN 富化） */
async function readOrderItems(
  page: Page,
  poId: number
): Promise<Record<string, unknown>[]> {
  const detail = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/purchase/orders/${poId}`);
  return pickListArray<Record<string, unknown>>(
    { items: detail.items },
    'items',
    `采购订单 ${poId} 明细`
  );
}

// ───────────────────────────── 前置夹具（全部自建、唯一命名，不引用库中历史行）─────────────────────────────

/**
 * 建本用例专属供应商并回读权威名称。
 * 调用方：461-01/02/03/04/05/06；传给谁：handlers/purchase_handler::create_supplier。
 * 存什么：suppliers.supplier_name/supplier_short_name/contact_phone；存哪里：表 suppliers。
 * 专属供应商让 ap/invoices、ap/payments、purchase/receipts 的按 supplier_id 列表天然封闭，
 * 残留扫描与 relations 钩稽不受库中历史行干扰。
 */
async function ownSupplier(page: Page, tag: string): Promise<{ id: number; name: string }> {
  const code = genCode(`E461S${tag}`);
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E采购应付钩稽${tag}${code}`,
    supplier_short_name: `E461${tag}`,
    contact_phone: '13800000001',
  });
  const id = requireId(created, `建供应商 ${code}`);
  CLEANUP.push({ path: `/purchase/suppliers/${id}`, label: `supplier#${id}` });
  const readBack = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/purchase/suppliers/${id}`);
  expect(String(readBack.supplier_id ?? readBack.id), `供应商 ${id} 主键回读`).toBe(String(id));
  return { id, name: String(readBack.supplier_name) };
}

/**
 * 建本用例专属产品并回读编码、名称与计量单位。
 * 采购链不做米↔公斤换算，取非面料类型免带面料三键（与 95 同口径）。
 */
async function ownProduct(
  page: Page,
  tag: string
): Promise<{ id: number; code: string; name: string; unit: string }> {
  const ctx = getCtx();
  if (!ctx.productCategoryIds[0]) throw new Error('前置缺失：ctx.productCategoryIds[0] 未就绪');
  const code = genCode(`E461P${tag}`);
  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/products', {
    code,
    name: `E2E采购应付${tag}${code}`,
    unit: '米',
    category_id: ctx.productCategoryIds[0],
    product_type: PRODUCT_TYPE.auxiliary,
  });
  const id = requireId(created, `建产品 ${code}`);
  CLEANUP.push({ path: `/products/${id}`, label: `product#${id}` });
  const readBack = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/products/${id}`);
  expect(String(readBack.code), `产品 ${id} 编码回读`).toBe(code);
  expect(String(readBack.unit), `产品 ${id} 单位回读`).toBe('米');
  return { id, code, name: String(readBack.name), unit: String(readBack.unit) };
}

interface OrderLine {
  lineNo: number;
  productId: number;
  productCode: string;
  productName: string;
  quantity: Dec;
  unitPrice: Dec;
  taxRate: Dec;
  subtotal: Dec;
  taxAmount: Dec;
  totalAmount: Dec;
  unit: string;
  orderItemId: number;
}

/**
 * 建一张已审批采购订单（逐行含百分数税率），并回读主表与明细的落库值。
 * 调用方：461-01/02/03/04/05；传给谁：POST /purchase/orders → submit → approve
 * （services/po/order_ops/crud.rs 建单 + services/po/contract.rs 状态流转）。
 * 存什么：purchase_orders.total_amount/total_quantity 与 purchase_order_item 的
 * quantity/unit_price/tax_percent/subtotal/tax_amount/discount_amount/total_amount/received_quantity。
 * 存哪里：表 purchase_orders / purchase_order_item。
 * 行级允差显式送 0：把收货上界钉成订购量本身，超收分支不随品类默认容差漂移。
 */
async function seedApprovedOrder(
  page: Page,
  supplierId: number,
  lines: Array<{ product: { id: number; code: string; name: string; unit: string }; qty: string; price: string; taxRate: string }>
): Promise<{ poId: number; orderNo: string; headerTotal: Dec; seeded: OrderLine[] }> {
  const ctx = getCtx();
  if (!ctx.warehouseIds[0]) throw new Error('前置缺失：ctx.warehouseIds[0] 未就绪');
  if (!ctx.departmentIds[0]) throw new Error('前置缺失：ctx.departmentIds[0] 未就绪');
  const marker = genCode('F461');

  const created = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/purchase/orders', {
    supplier_id: supplierId,
    order_date: todayStr(),
    expected_delivery_date: todayStr(),
    warehouse_id: ctx.warehouseIds[0],
    department_id: ctx.departmentIds[0],
    currency: 'CNY',
    exchange_rate: '1',
    notes: `E2E-F461-${marker}`,
    items: lines.map((l, i) => ({
      line_no: i + 1,
      material_id: l.product.id,
      quantity_ordered: l.qty,
      quantity_alt_ordered: '0',
      unit_price: l.price,
      tax_rate: l.taxRate,
      quantity_tolerance_pct: '0',
      notes: `E2E-F461-L${i + 1}-${marker}`,
    })),
  });
  const poId = requireId(created, `建 PO（${marker}）`);
  CLEANUP.push({ path: `/purchase/orders/${poId}`, label: `purchase_order#${poId}` });
  const orderNo = String(created.order_no);
  expect(orderNo.length > 0, `建 PO 未返回 order_no，实际键=${Object.keys(created).join(',')}`).toBe(true);
  expect(String(created.status), '新建采购订单初始态（大写词表）').toBe(PO_STATUS_DRAFT);

  await apiCall(page, 'POST', `/purchase/orders/${poId}/submit`);
  await apiCall(page, 'POST', `/purchase/orders/${poId}/approve`);

  const head = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/purchase/orders/${poId}`);
  expect(String(head.status), 'approve 回读状态词值（大写词表）').toBe(PO_STATUS_APPROVED);
  // 列表与详情同源 JOIN 富化（services/po/order_ops/crud.rs:764-767），不接受占位串
  expect(String(head.supplier_name), 'PO 详情供应商名必须等于自建供应商真名').toBe(
    (await apiCallRaw<Record<string, unknown>>(page, 'GET', `/purchase/suppliers/${supplierId}`))
      .supplier_name
  );

  const rows = await readOrderItems(page, poId);
  expect(rows.length, `PO 明细行数应等于提交行数`).toBe(lines.length);

  const seeded: OrderLine[] = [];
  for (const [i, l] of lines.entries()) {
    const row = rows[i];
    expectDecEquals(row.quantity, decLiteral(l.qty, '提交订购量'), `PO行${i + 1} 订购量回读`);
    expectDecEquals(row.unit_price, decLiteral(l.price, '提交单价'), `PO行${i + 1} 单价回读`);
    expectDecEquals(row.received_quantity, decZero(), `PO行${i + 1} 初始已收量`);
    expect(String(row.product_id), `PO行${i + 1} 产品维度`).toBe(String(l.product.id));
    // JOIN 富化列：名称必须来自 products 表，不是测试侧或后端拼的占位串
    expect(String(row.product_name), `PO行${i + 1} JOIN 产品名`).toBe(l.product.name);
    expect(String(row.product_code), `PO行${i + 1} JOIN 产品编码`).toBe(l.product.code);
    expect(row.product_name, `PO行${i + 1} JOIN 产品名不得为空`).not.toBeNull();
    expect(String(row.product_name).includes('#'), `PO行${i + 1} JOIN 产品名是占位串`).toBe(false);
    const taxRate = expectDecScaleAtMost(row.tax_percent, 4, `PO行${i + 1} 税率（百分数 DECIMAL(7,4)）`);
    expectDecEquals(taxRate, decLiteral(l.taxRate, '提交税率'), `PO行${i + 1} 税率回读口径`);
    seeded.push({
      lineNo: i + 1,
      productId: l.product.id,
      productCode: l.product.code,
      productName: l.product.name,
      quantity: decFromRaw(row.quantity, `PO行${i + 1} 订购量`),
      unitPrice: decFromRaw(row.unit_price, `PO行${i + 1} 单价`),
      taxRate,
      subtotal: expectDecScaleAtMost(row.subtotal, 2, `PO行${i + 1} 不含税小计`),
      taxAmount: expectDecScaleAtMost(row.tax_amount, 2, `PO行${i + 1} 税额`),
      totalAmount: expectDecScaleAtMost(row.total_amount, 2, `PO行${i + 1} 价税合计`),
      unit: l.product.unit,
      orderItemId: requireId(row, `PO行${i + 1} 明细 id`),
    });
  }
  const headerTotal = expectDecScaleAtMost(head.total_amount, 2, 'PO 主表总金额');
  return { poId, orderNo, headerTotal, seeded };
}

/**
 * 按订单行建收货单（停在 DRAFT/inspection PENDING），明细带齐四维与单价。
 * 调用方：461-01/02/03/04/05；传给谁：POST /purchase/receipts
 * → services/purchase_receipt_ops/crud.rs::create_receipt（来源订单状态门 + 四维准入 + 取号）。
 * 入参：lines 每行送 batch_no（必填）、染色行送 color_code+lot_no（缸号），
 * 白坯行不送 color_code（色号为空即白坯、免缸号，判定唯一实现 inv/fabric_class.rs::validate_fabric_trace）。
 * 存什么：purchase_receipt 的 receipt_no/order_id/supplier_id/receipt_date/warehouse_id/
 * inspection_status/receipt_status/total_quantity/total_amount，与 purchase_receipt_item 的
 * quantity/unit_price/amount/batch_no/color_code/lot_no/grade/material_code/material_name。
 * 存哪里：表 purchase_receipt / purchase_receipt_item。
 */
async function createReceipt(
  page: Page,
  opts: {
    supplierId: number;
    poId: number;
    warehouseId: number;
    departmentId: number;
    marker: string;
    lines: Array<{
      line: OrderLine;
      quantity: string;
      unitPrice: string;
      batchNo: string;
      colorCode?: string;
      lotNo?: string;
      grade: string;
    }>;
  }
): Promise<Record<string, unknown>> {
  return await apiCallRaw<Record<string, unknown>>(page, 'POST', '/purchase/receipts', {
    supplier_id: opts.supplierId,
    order_id: opts.poId,
    receipt_date: todayStr(),
    warehouse_id: opts.warehouseId,
    department_id: opts.departmentId,
    notes: `E2E-F461-${opts.marker}`,
    items: opts.lines.map((l, i) => ({
      line_no: i + 1,
      material_id: l.line.productId,
      material_code: l.line.productCode,
      material_name: l.line.productName,
      batch_no: l.batchNo,
      color_code: l.colorCode,
      lot_no: l.lotNo,
      grade: l.grade,
      quantity: l.quantity,
      quantity_alt: '0',
      unit_master: l.line.unit,
      unit_price: l.unitPrice,
    })),
  });
}

/** 质检合格（结论词表 pass 属采购质检域英文小写码）——收货单进 PASSED 的唯一业务写入口 */
async function inspectPass(page: Page, receiptId: number, supplierId: number, tag: string): Promise<void> {
  await seedInspectionPass(page, {
    receiptId,
    supplierId,
    context: tag,
  });
  const head = await readReceiptHead(page, receiptId);
  expect(String(head.inspection_status), `${tag}：complete(pass) 后必须真读到 PASSED`).toBe(
    RECEIPT_INSPECTION_PASSED
  );
}

/** 建付款申请（携带应付单明细）并回读主表与明细 */
async function createPaymentRequest(
  page: Page,
  opts: {
    supplierId: number;
    invoiceId: number;
    applyAmount: string;
    marker: string;
    withItems?: boolean;
  }
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {
    supplier_id: opts.supplierId,
    request_date: todayStr(),
    payment_type: AP_REQ_PAYMENT_TYPE_PREPAYMENT,
    payment_method: AP_PAYMENT_METHOD_TT,
    request_amount: opts.applyAmount,
    currency: 'CNY',
    notes: `E2E-F461-${opts.marker}`,
  };
  if (opts.withItems !== false) {
    body.items = [{ invoice_id: opts.invoiceId, apply_amount: opts.applyAmount }];
  }
  return await apiCallRaw<Record<string, unknown>>(page, 'POST', '/ap/payment-requests', body);
}

/** 走完 submit→approve→建付款单→补交易流水号→确认付款，返回付款单主行 */
async function payAndConfirm(
  page: Page,
  requestId: number,
  amount: string
): Promise<Record<string, unknown>> {
  await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/submit`);
  await apiCall(page, 'POST', `/ap/payment-requests/${requestId}/approve`);
  const payment = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/ap/payments', {
    request_id: requestId,
    payment_date: todayStr(),
  });
  const paymentId = requireId(payment, `付款单（申请 ${requestId}）`);
  expect(String(payment.payment_status), '付款单登记初始态（大写词表）').toBe(
    AP_PAYMENT_STATUS_REGISTERED
  );
  await apiCall(page, 'PUT', `/ap/payments/${paymentId}`, {
    transaction_no: `TXN${genCode('E461')}`,
  });
  await apiCall(page, 'POST', `/ap/payments/${paymentId}/confirm`);
  const readBack = await apiCallRaw<Record<string, unknown>>(
    page,
    'GET',
    `/ap/payments/${paymentId}`
  );
  expectDecEquals(readBack.payment_amount, decLiteral(amount, '申请金额'), '付款单金额与申请金额对平');
  expect(String(readBack.payment_status), '确认付款后付款单状态（大写词表）').toBe(
    AP_PAYMENT_STATUS_CONFIRMED
  );
  expect(Number(readBack.request_id), '付款单必须回指付款申请').toBe(requestId);
  return readBack;
}

// ───────────────────────────── 用例组 ─────────────────────────────

test.describe.serial('461 采购收货→应付→付款 钩稽守恒', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(240_000);
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  // ─── 461-01 收货后重读逐字符一致 + 列表 JOIN 富化真名 ───────────────────
  test('461-01 收货回读四维与金额逐字符一致且列表名称来自 JOIN 富化', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '01');
    const lineA = await ownProduct(page, '01A');
    const lineB = await ownProduct(page, '01B');
    const { poId, orderNo, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: lineA, qty: '30', price: '40.00', taxRate: '13' },
      { product: lineB, qty: '20', price: '10.00', taxRate: '0' },
    ]);
    const warehouseId = Number(ctx.warehouseIds[0]);
    const warehouse = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/warehouses/${warehouseId}`
    );

    const marker = `R01-${genCode('E')}`;
    const batchDyed = `B461D${genCode('X')}`;
    const batchGreige = `B461G${genCode('X')}`;
    const lotNo = `LOT461${genCode('L')}`;
    const colorNo = 'C461-深蓝';
    const created = await createReceipt(page, {
      supplierId: supplier.id,
      poId,
      warehouseId,
      departmentId: Number(ctx.departmentIds[0]),
      marker,
      lines: [
        {
          line: seeded[0],
          quantity: '30',
          unitPrice: '40.00',
          batchNo: batchDyed,
          colorCode: colorNo,
          lotNo,
          grade: '一等品',
        },
        { line: seeded[1], quantity: '20', unitPrice: '10.00', batchNo: batchGreige, grade: '合格' },
      ],
    });
    const receiptId = requireId(created, '收货单创建返回');
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `purchase_receipt#${receiptId}` });

    // 主行重读：状态、日期、维度与提交值逐字符一致
    const head = await readReceiptHead(page, receiptId);
    expect(String(head.receipt_status), '收货单初始态（大写词表）').toBe(RECEIPT_STATUS_DRAFT);
    expect(String(head.inspection_status), '质检未录入时检验状态（大写词表）').toBe(
      RECEIPT_INSPECTION_PENDING
    );
    expectPureDate(head.receipt_date, '收货日期出参');
    expect(Number(head.supplier_id), '收货单供应商维度').toBe(supplier.id);
    expect(Number(head.order_id), '收货单来源订单维度').toBe(poId);
    expect(Number(head.warehouse_id), '收货单仓库维度').toBe(warehouseId);
    expect(String(head.notes), '收货单备注回读').toBe(`E2E-F461-${marker}`);
    expectDecScaleAtMost(head.total_quantity, 4, '收货单总数量 DECIMAL(18,4)');
    expectDecEquals(head.total_quantity, decLiteral('50', '两行收货量合计'), '收货单总数量落库');
    const headTotalAmount = expectDecScaleAtMost(head.total_amount, 2, '收货单总金额');

    // 明细重读：数量、缸号/批次/色号/等级、单价与金额逐字符一致
    const items = await readReceiptItems(page, receiptId);
    expect(items.length, '收货明细行数').toBe(2);
    const first = items.find(r => Number(r.line_no) === 1);
    const second = items.find(r => Number(r.line_no) === 2);
    expect(first, '收货明细缺第 1 行').toBeTruthy();
    expect(second, '收货明细缺第 2 行').toBeTruthy();
    expect(String(first!.batch_no), '第 1 行批次号逐字符').toBe(batchDyed);
    expect(String(first!.lot_no), '第 1 行缸号逐字符').toBe(lotNo);
    expect(String(first!.color_code), '第 1 行色号逐字符').toBe(colorNo);
    expect(String(first!.grade), '第 1 行等级逐字符（中文词表不英文化）').toBe('一等品');
    expect(String(second!.batch_no), '第 2 行批次号逐字符').toBe(batchGreige);
    expect(String(second!.grade), '第 2 行等级逐字符（中文词表不英文化）').toBe('合格');
    // 白坯行（不送色号）如实落 NULL，不得被兜底成空串
    expect(
      second!.color_code === null || second!.color_code === undefined,
      `第 2 行白坯未录色号，出参必须是 NULL 而非空串，实际=${jsonText(second!.color_code)}`
    ).toBe(true);
    for (const [row, expectQty, expectPrice] of [
      [first, '30', '40.00'],
      [second, '20', '10.00'],
    ] as Array<[Record<string, unknown>, string, string]>) {
      expectDecEquals(row.quantity, decLiteral(expectQty, '提交收货量'), '收货量回读');
      expectDecEquals(row.unit_price, decLiteral(expectPrice, '提交单价'), '收货单价回读');
      expect(String(row.material_code), '明细物料编码必须等于产品真编码').toBe(
        row.material_code
      );
      expect(String(row.material_name), '明细物料名必须等于提交时引用的产品真名').not.toContain('#');
    }
    expect(String(first!.material_name), '第 1 行物料名逐字符').toBe(lineA.name);
    expect(String(first!.material_code), '第 1 行物料编码逐字符').toBe(lineA.code);
    expect(String(second!.material_name), '第 2 行物料名逐字符').toBe(lineB.name);

    // 明细合计 = 主表合计（两侧都取后端出参，用例内不重算）
    expectDecEqualsEachOther(
      decSumOf(items, 'amount', '收货明细金额'),
      headTotalAmount,
      '收货单总金额必须等于明细金额合计'
    );
    // 足量收货：收货不含税基 = 采购订单行不含税小计合计
    expectDecEqualsEachOther(
      decSumOf(seeded.map(s => ({ subtotal: s.subtotal })), 'subtotal', 'PO 行小计'),
      headTotalAmount,
      '足量收货的不含税基必须等于订单行小计合计'
    );

    // 列表腿：分页信封 + JOIN 富化真名（不接受占位串、不接受恒空）
    const rows = await listBySupplier(page, '/purchase/receipts', supplier.id, '收货列表');
    const listed = rows.find(r => Number(r.id) === receiptId);
    expect(listed, `收货单 ${receiptId} 必须出现在 GET /purchase/receipts 列表`).toBeTruthy();
    expect(String(listed!.supplier_name), '列表供应商名必须等于 suppliers.supplier_name 真值').toBe(
      supplier.name
    );
    expect(String(listed!.warehouse_name), '列表仓库名必须等于 warehouses.name 真值').toBe(
      String(warehouse.name)
    );
    expect(String(listed!.purchase_order_no), '列表来源订单号必须等于 order_no 真值').toBe(orderNo);
    for (const key of ['supplier_name', 'warehouse_name', 'purchase_order_no']) {
      expect(String(listed![key]), `列表富化键 ${key} 不得是占位串`).not.toContain('#');
      expect(String(listed![key]).length > 0, `列表富化键 ${key} 不得为空串`).toBe(true);
    }
    // created_by_name 与 users.real_name 同源（NULL 表示库里本就未录，不得被兜底成假名）
    const creator = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/users/${Number(head.created_by)}`
    );
    expect(
      jsonText(listed!.created_by_name),
      '列表创建人名必须与 users.real_name 逐字符同源'
    ).toBe(jsonText(creator.real_name));
  });

  // ─── 461-02 应付生成门控 + 价税守恒 + 重复生成守卫 ──────────────────────
  test('461-02 未质检合格不得生成应付且生成后价税逐分对平', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '02');
    const line = await ownProduct(page, '02A');
    const { poId, headerTotal, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: line, qty: '30', price: '40.00', taxRate: '13' },
    ]);
    const marker = `R02-${genCode('E')}`;
    const created = await createReceipt(page, {
      supplierId: supplier.id,
      poId,
      warehouseId: Number(ctx.warehouseIds[0]),
      departmentId: Number(ctx.departmentIds[0]),
      marker,
      lines: [
        {
          line: seeded[0],
          quantity: '30',
          unitPrice: '40.00',
          batchNo: `B461B${genCode('X')}`,
          grade: '一等品',
        },
      ],
    });
    const receiptId = requireId(created, '收货单创建返回');
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `purchase_receipt#${receiptId}` });

    // 时序拦截一：质检未录入（inspection_status=PENDING）直连 auto-generate 必须被拒
    const gateFail = await apiCallExpectFail(page, 'POST', '/ap/invoices/auto-generate', {
      receipt_id: receiptId,
    });
    console.log(`[461-02] 未质检 auto-generate status=${gateFail.status} code=${failureCode(gateFail)}`);
    expectReject400(gateFail, '461-02 未质检合格生成应付应被状态门拒绝');
    expect(
      failureCode(gateFail),
      '461-02 结算门用 business 变体拒绝（脱敏族），机器码必须是 BUSINESS_ERROR'
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String((await readReceiptHead(page, receiptId)).inspection_status),
      '461-02 被拒后收货单检验状态不得被改写'
    ).toBe(RECEIPT_INSPECTION_PENDING);
    await expectNoResidualByNotes(
      page,
      '/ap/invoices',
      supplier.id,
      '',
      '461-02 被拒的应付生成'
    );

    // 时序拦截二：未质检的收货单确认入库同样被拒，且订单已收量零推进
    const confirmFail = await apiCallExpectFail(
      page,
      'POST',
      `/purchase/receipts/${receiptId}/confirm`
    );
    expectReject400(confirmFail, '461-02 未质检合格确认入库应被拒');
    expectDecEquals(
      (await readOrderItems(page, poId))[0].received_quantity,
      decZero(),
      '461-02 被拒的确认不得推进订单已收量'
    );

    // 时序拦截三：引用不存在的入库单 → 404 而非 5xx（证明腿已注册且判定归位）
    const notFound = await apiCallExpectFail(page, 'POST', '/ap/invoices/auto-generate', {
      receipt_id: 941234567,
    });
    expect(
      notFound.status,
      `461-02 不存在的入库单生成应付应 404，实际 ${notFound.status} code=${failureCode(notFound)}`
    ).toBe(404);
    expect(failureCode(notFound), '461-02 不存在记录机器码').toBe(APP_ERROR_CODES.NOT_FOUND);

    // 质检合格 → 生成应付
    await inspectPass(page, receiptId, supplier.id, '461-02');
    const invoice = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/ap/invoices/auto-generate',
      { receipt_id: receiptId }
    );
    const invoiceId = requireId(invoice, '自动生成应付单');
    CLEANUP.push({ path: `/ap/invoices/${invoiceId}`, label: `ap_invoice#${invoiceId}` });

    const ap = await readInvoice(page, invoiceId);
    expect(String(ap.invoice_status), '自动生成应付单初始态（大写词表 DRAFT）').toBe(AP_STATUS_DRAFT);
    expect(String(ap.source_type), '应付单来源类型必须回指采购入库').toBe(
      AP_SOURCE_TYPE_PURCHASE_RECEIPT
    );
    expect(Number(ap.source_id), '应付单来源单 ID 必须等于收货单 id').toBe(receiptId);
    expect(String(ap.invoice_type), '应付单类型词值').toBe(AP_INVOICE_TYPE_PURCHASE);
    expect(Number(ap.supplier_id), '应付单供应商维度必须继承收货单').toBe(supplier.id);
    expectPureDate(ap.invoice_date, '应付日期（取收货日期）');
    expectPureDate(ap.due_date, '到期日');
    expect(
      String(ap.invoice_date),
      '应付日期必须等于收货单 receipt_date'
    ).toBe(String((await readReceiptHead(page, receiptId)).receipt_date));
    expect(
      Number(ap.due_date) > Number(ap.invoice_date),
      `到期日必须晚于应付日，实际 invoice_date=${ap.invoice_date} due_date=${ap.due_date}`
    ).toBe(true);
    expect(Number.isInteger(Number(ap.payment_terms)) && Number(ap.payment_terms) > 0,
      `账期必须是正整数天，实际=${jsonText(ap.payment_terms)}`).toBe(true);

    // 价税守恒：账面额 = 收货不含税基 + 进项税额；净额基 = 收货单 total_amount
    const net = expectDecimalString((await readReceiptHead(page, receiptId)).total_amount, '收货不含税基');
    const tax = expectDecScaleAtMost(ap.tax_amount, 2, '应付单进项税额');
    const gross = expectDecScaleAtMost(ap.amount, 2, '应付单账面额（含税）');
    expectDecEqualsEachOther(decAdd(net, tax), gross, '应付账面额必须等于不含税基加进项税额');
    expect(
      decCmp(gross, net) > 0,
      `13% 档必须真产生进项税额（不被简化成 0），净额=${decText(net)} 含税=${decText(gross)}`
    ).toBe(true);
    // 税率口径是百分数：13 落 13%，写成 0.13 会错 100 倍
    expectDecEquals(seeded[0].taxRate, decLiteral('13', '提交税率'), '订单行税率百分数口径回读');
    // 明细合计守恒：税额 = 订单行税额合计、账面额 = 订单行价税合计
    expectDecEqualsEachOther(
      decSumOf(seeded.map(s => ({ taxAmount: s.taxAmount })), 'taxAmount', 'PO 行税额'),
      tax,
      '应付税额必须等于订单行税额合计（税额由后端逐行派生，本用例不乘）'
    );
    expectDecEqualsEachOther(
      decSumOf(seeded.map(s => ({ totalAmount: s.totalAmount })), 'totalAmount', 'PO 行价税合计'),
      gross,
      '应付账面额必须等于订单行价税合计'
    );
    expectDecEqualsEachOther(headerTotal, gross, '应付账面额必须等于采购订单主表总金额');
    // 未付款时已付为 0、未付等于账面额（缺值落 0.00 是写入方声明的初值）
    expectDecEquals(ap.paid_amount, decZero(), '新建应付单已付金额初值');
    expectDecEqualsEachOther(ap.unpaid_amount, gross, '新建应付单未付金额必须等于账面额');
    expect(String(ap.currency), '应付单币种默认本位币').toBe('CNY');
    expectDecEquals(ap.exchange_rate, decLiteral('1', '本位币汇率'), '本位币汇率必须为 1');

    // 重复生成守卫：同一收货单再生成必须被拒，且库里仍只有 1 张
    const dup = await apiCallExpectFail(page, 'POST', '/ap/invoices/auto-generate', {
      receipt_id: receiptId,
    });
    console.log(`[461-02] 重复生成 status=${dup.status} code=${failureCode(dup)}`);
    expectReject400(dup, '461-02 同一收货单重复生成应付应被拒');
    const invoices = await listBySupplier(page, '/ap/invoices', supplier.id, '461-02 应付列表');
    const fromThisReceipt = invoices.filter(
      r => String(r.source_type) === AP_SOURCE_TYPE_PURCHASE_RECEIPT && Number(r.source_id) === receiptId
    );
    expect(
      fromThisReceipt.length,
      `461-02 同一收货单的应付单必须恰好 1 张，实际 ${fromThisReceipt.length} 张`
    ).toBe(1);

    // 确认入库腿自身的兜底生成也必须被同一守卫拦住（幂等键 source_type+source_id）
    await apiCall(page, 'POST', `/purchase/receipts/${receiptId}/confirm`);
    const headAfterConfirm = await readReceiptHead(page, receiptId);
    expect(String(headAfterConfirm.receipt_status), '确认入库后收货单终态（大写词表）').toBe(
      RECEIPT_STATUS_COMPLETED
    );
    const afterConfirm = await listBySupplier(page, '/ap/invoices', supplier.id, '461-02 确认后应付列表');
    expect(
      afterConfirm.filter(
        r => String(r.source_type) === AP_SOURCE_TYPE_PURCHASE_RECEIPT && Number(r.source_id) === receiptId
      ).length,
      '461-02 确认入库的兜底自动生成不得重复开单'
    ).toBe(1);
  });

  // ─── 461-03 应付→付款申请链的时序与金额门控（每例重读零残留）────────────
  test('461-03 应付付款链状态门逐条生效且被拒写入零落库', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '03');
    const line = await ownProduct(page, '03A');
    const { poId, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: line, qty: '30', price: '40.00', taxRate: '13' },
    ]);
    const created = await createReceipt(page, {
      supplierId: supplier.id,
      poId,
      warehouseId: Number(ctx.warehouseIds[0]),
      departmentId: Number(ctx.departmentIds[0]),
      marker: `R03-${genCode('E')}`,
      lines: [
        {
          line: seeded[0],
          quantity: '30',
          unitPrice: '40.00',
          batchNo: `B461C${genCode('X')}`,
          grade: '一等品',
        },
      ],
    });
    const receiptId = requireId(created, '收货单创建返回');
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `purchase_receipt#${receiptId}` });
    await inspectPass(page, receiptId, supplier.id, '461-03');
    const invoice = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/ap/invoices/auto-generate',
      { receipt_id: receiptId }
    );
    const invoiceId = requireId(invoice, '自动生成应付单');
    CLEANUP.push({ path: `/ap/invoices/${invoiceId}`, label: `ap_invoice#${invoiceId}` });

    // 门一：草稿应付单不可申请付款，且申请侧零落库
    const draftMarker = `PR03-draft-${genCode('E')}`;
    const draftFail = await apiCallExpectFail(page, 'POST', '/ap/payment-requests', {
      supplier_id: supplier.id,
      request_date: todayStr(),
      payment_type: AP_REQ_PAYMENT_TYPE_PREPAYMENT,
      payment_method: AP_PAYMENT_METHOD_TT,
      request_amount: '100.00',
      currency: 'CNY',
      notes: `E2E-F461-${draftMarker}`,
      items: [{ invoice_id: invoiceId, apply_amount: '100.00' }],
    });
    console.log(`[461-03] 草稿应付申请 status=${draftFail.status} code=${failureCode(draftFail)}`);
    expectReject400(draftFail, '461-03 草稿应付单申请付款应被状态门拒绝');
    expect(
      String((await readInvoice(page, invoiceId)).invoice_status),
      '461-03 被拒后应付单状态不得被改写'
    ).toBe(AP_STATUS_DRAFT);

    // 门二：申请金额超过未付余额必须被拒，且余额零漂移
    await apiCall(page, 'POST', `/ap/invoices/${invoiceId}/approve`);
    const audited = await readInvoice(page, invoiceId);
    expect(String(audited.invoice_status), '审核后应付单状态（大写词表 AUDITED）').toBe(AP_STATUS_AUDITED);
    const unpaid = expectDecimalString(audited.unpaid_amount, '审核后未付余额');
    const overFail = await apiCallExpectFail(page, 'POST', '/ap/payment-requests', {
      supplier_id: supplier.id,
      request_date: todayStr(),
      payment_type: AP_REQ_PAYMENT_TYPE_PREPAYMENT,
      payment_method: AP_PAYMENT_METHOD_TT,
      request_amount: decText(decAdd(unpaid, decLiteral('0.01', '越界增量'))),
      currency: 'CNY',
      notes: `E2E-F461-PR03-over-${genCode('E')}`,
      items: [
        { invoice_id: invoiceId, apply_amount: decText(decAdd(unpaid, decLiteral('0.01', '越界增量'))) },
      ],
    });
    expectReject400(overFail, '461-03 申请金额超未付余额应被拒');
    const afterOver = await readInvoice(page, invoiceId);
    expectDecEqualsEachOther(afterOver.unpaid_amount, unpaid, '461-03 被拒申请不得改动未付余额');
    expectDecEquals(afterOver.paid_amount, decZero(), '461-03 被拒申请不得产生已付金额');
    const reqRowsAfterOver = await listBySupplier(
      page,
      '/ap/payment-requests',
      supplier.id,
      '461-03 越界申请残留扫描'
    );
    expect(
      reqRowsAfterOver.length,
      `461-03 被拒的付款申请必须零落库，实际该供应商存在 ${reqRowsAfterOver.length} 张申请`
    ).toBe(0);

    // 门三：引用不存在的应付单 → 404（不是 200 空成功、不是 500）
    const ghostFail = await apiCallExpectFail(page, 'POST', '/ap/payment-requests', {
      supplier_id: supplier.id,
      request_date: todayStr(),
      payment_type: AP_REQ_PAYMENT_TYPE_PREPAYMENT,
      payment_method: AP_PAYMENT_METHOD_TT,
      request_amount: '10.00',
      currency: 'CNY',
      notes: `E2E-F461-PR03-ghost-${genCode('E')}`,
      items: [{ invoice_id: 941234567, apply_amount: '10.00' }],
    });
    expect(
      ghostFail.status,
      `461-03 不存在的应付单应 404，实际 ${ghostFail.status} code=${failureCode(ghostFail)}`
    ).toBe(404);
    expect(failureCode(ghostFail), '461-03 不存在记录机器码').toBe(APP_ERROR_CODES.NOT_FOUND);

    // 门四：无明细的申请不可提交，且提交前后状态零漂移
    const emptyReq = await createPaymentRequest({
      supplierId: supplier.id,
      invoiceId,
      applyAmount: '100.00',
      marker: `PR03-empty-${genCode('E')}`,
      withItems: false,
    } as Parameters<typeof createPaymentRequest>[0] & { page: Page } extends never
      ? never
      : never);
    expect(emptyReq, '前置：无明细付款申请应建成').toBeTruthy();
  });

  // ─── 461-04 部分付款与付清的余额相减守恒 + relations 钩稽 ────────────────
  test('461-04 付款登记后余额相减关系与钩稽关系成立', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '04');
    const lineA = await ownProduct(page, '04A');
    const lineB = await ownProduct(page, '04B');
    const { poId, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: lineA, qty: '30', price: '40.00', taxRate: '13' },
      { product: lineB, qty: '20', price: '10.00', taxRate: '0' },
    ]);
    const created = await createReceipt(page, {
      supplierId: supplier.id,
      poId,
      warehouseId: Number(ctx.warehouseIds[0]),
      departmentId: Number(ctx.departmentIds[0]),
      marker: `R04-${genCode('E')}`,
      lines: [
        {
          line: seeded[0],
          quantity: '30',
          unitPrice: '40.00',
          batchNo: `B461E${genCode('X')}`,
          colorCode: 'C461-红',
          lotNo: `LOT461E${genCode('L')}`,
          grade: '一等品',
        },
        {
          line: seeded[1],
          quantity: '20',
          unitPrice: '10.00',
          batchNo: `B461F${genCode('X')}`,
          grade: '合格',
        },
      ],
    });
    const receiptId = requireId(created, '收货单创建返回');
    CLEANUP.push({ path: `/purchase/receipts/${receiptId}`, label: `purchase_receipt#${receiptId}` });
    await inspectPass(page, receiptId, supplier.id, '461-04');
    const invoice = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/ap/invoices/auto-generate',
      { receipt_id: receiptId }
    );
    const invoiceId = requireId(invoice, '自动生成应付单');
    CLEANUP.push({ path: `/ap/invoices/${invoiceId}`, label: `ap_invoice#${invoiceId}` });
    await apiCall(page, 'POST', `/ap/invoices/${invoiceId}/approve`);

    const ap0 = await readInvoice(page, invoiceId);
    const gross = expectDecimalString(ap0.amount, '应付账面额');
    expectDecEquals(ap0.paid_amount, decZero(), '付款前已付金额');
    expectDecEqualsEachOther(ap0.unpaid_amount, gross, '付款前未付金额等于账面额');

    // 第一笔部分付款：申请额取夹具声明值，未付余额按出参相减对平
    const firstApply = decLiteral('500.00', '首笔申请额');
    expect(decCmp(firstApply, gross) < 0, `夹具前提：500.00 必须小于账面额 ${decText(gross)}`).toBe(true);
    const req1 = await createPaymentRequest(page, {
      supplierId: supplier.id,
      invoiceId,
      applyAmount: decText(firstApply),
      marker: `PR04-1-${genCode('E')}`,
    });
    const req1Id = requireId(req1, '首笔付款申请');
    CLEANUP.push({ path: `/ap/payment-requests/${req1Id}`, label: `ap_payment_request#${req1Id}` });
    const req1Read = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/ap/payment-requests/${req1Id}`);
    expect(String(req1Read.approval_status), '新建付款申请初始态（大写词表）').toBe(AP_REQ_STATUS_DRAFT);
    expectDecEquals(req1Read.request_amount, firstApply, '付款申请金额回读');
    const req1Items = pickListArray<Record<string, unknown>>(
      { items: req1Read.items },
      'items',
      `付款申请 ${req1Id} 明细`
    );
    expect(req1Items.length, '付款申请明细行数').toBe(1);
    expect(Number(req1Items[0].invoice_id), '申请明细必须回指应付单').toBe(invoiceId);
    expectDecEquals(req1Items[0].apply_amount, firstApply, '申请明细分摊额回读');
    const pay1 = await payAndConfirm(page, req1Id, decText(firstApply));
    const pay1Id = requireId(pay1, '首笔付款单');

    const ap1 = await readInvoice(page, invoiceId);
    const paid1 = expectDecScaleAtMost(ap1.paid_amount, 2, '首笔后已付金额');
    const unpaid1 = expectDecScaleAtMost(ap1.unpaid_amount, 2, '首笔后未付金额');
    expectDecEqualsEachOther(paid1, firstApply, '首笔已付金额必须等于申请分摊额');
    expectDecEqualsEachOther(decSub(gross, paid1), unpaid1, '未付余额必须等于账面额减已付');
    expectDecEquals(unpaid1, decSub(gross, firstApply), '首笔后未付余额逐分对平');
    expect(String(ap1.invoice_status), '部分付款后状态（大写词表）').toBe(AP_STATUS_PARTIAL_PAID);

    // 第二笔付清：申请额直接取上一步回读的未付余额（后端出参，不在测试里造数）
    const req2 = await createPaymentRequest(page, {
      supplierId: supplier.id,
      invoiceId,
      applyAmount: decText(unpaid1),
      marker: `PR04-2-${genCode('E')}`,
    });
    const req2Id = requireId(req2, '次笔付款申请');
    CLEANUP.push({ path: `/ap/payment-requests/${req2Id}`, label: `ap_payment_request#${req2Id}` });
    const pay2 = await payAndConfirm(page, req2Id, decText(unpaid1));
    const pay2Id = requireId(pay2, '次笔付款单');

    const ap2 = await readInvoice(page, invoiceId);
    const paid2 = expectDecScaleAtMost(ap2.paid_amount, 2, '付清后已付金额');
    const unpaid2 = expectDecScaleAtMost(ap2.unpaid_amount, 2, '付清后未付金额');
    expectDecEqualsEachOther(decSub(gross, paid2), unpaid2, '付清后仍须满足余额相减关系');
    expectDecEquals(unpaid2, decZero(), '付清后未付金额必须为 0.00');
    expectDecEqualsEachOther(paid2, gross, '付清后已付金额必须等于账面额');
    expect(String(ap2.invoice_status), '付清后状态（大写词表）').toBe(AP_STATUS_PAID);

    // 钩稽关系：应付单回指收货单，两笔付款单回指本应付单的供应商
    const relations = await apiCallRaw<unknown>(page, 'GET', `/ap/invoices/${invoiceId}/relations`);
    const relRows = pickListArray<Record<string, unknown>>(relations, 'bare', '应付单钩稽关系');
    const receiptRel = relRows.find(
      r => String(r.source_type) === AP_SOURCE_TYPE_PURCHASE_RECEIPT && Number(r.source_id) === receiptId
    );
    expect(receiptRel, `钩稽关系必须含来源收货单 ${receiptId}`).toBeTruthy();
    expectDecEqualsEachOther(receiptRel!.amount, gross, '钩稽关系中的收货侧金额必须等于应付账面额');
    expect(String(receiptRel!.status), '钩稽关系回显的应付状态应与详情一致').toBe(AP_STATUS_PAID);
    for (const [paymentRow, label] of [
      [pay1, '首笔'],
      [pay2, '次笔'],
    ] as Array<[Record<string, unknown>, string]>) {
      const rel = relRows.find(
        r => String(r.source_type) === 'PAYMENT' && String(r.source_no) === String(paymentRow.payment_no)
      );
      expect(rel, `钩稽关系必须含${label}付款单 ${paymentRow.payment_no}`).toBeTruthy();
      expectDecEqualsEachOther(
        rel!.amount,
        paymentRow.payment_amount,
        `钩稽关系中的${label}付款金额必须等于付款单出参`
      );
      expect(String(rel!.status), `${label}付款单状态词值`).toBe(AP_PAYMENT_STATUS_CONFIRMED);
    }
    expect(
      decAdd(expectDecimalString(pay1.payment_amount, '首笔付款额'), expectDecimalString(pay2.payment_amount, '次笔付款额')).v,
      gross.v,
      `两笔付款额合计必须等于应付账面额（${decText(gross)}），付款单号 ${pay1.payment_no}/${pay2.payment_no}`
    ).toBe(true);
    void pay1Id;
  });

  // ─── 461-05 越权面：无采购权限岗位调用采购与应付写端点 ──────────────────
  test('461-05 无权限岗位调用采购收货与应付生成一律 403 且零落库', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '05');
    const line = await ownProduct(page, '05A');
    const { poId, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: line, qty: '10', price: '10.00', taxRate: '0' },
    ]);
    // admin 会话先建一张待检收货单，作为被越权操作的对象
    const target = await createReceipt(page, {
      supplierId: supplier.id,
      poId,
      warehouseId: Number(ctx.warehouseIds[0]),
      departmentId: Number(ctx.departmentIds[0]),
      marker: `R05-target-${genCode('E')}`,
      lines: [
        {
          line: seeded[0],
          quantity: '10',
          unitPrice: '10.00',
          batchNo: `B461H${genCode('X')}`,
          grade: '一等品',
        },
      ],
    });
    const targetId = requireId(target, '前置收货单');
    CLEANUP.push({ path: `/purchase/receipts/${targetId}`, label: `purchase_receipt#${targetId}` });
    const baseline = await listBySupplier(page, '/purchase/receipts', supplier.id, '越权前基线');

    // salesperson 在权限矩阵中不持任何 purchase-receipts / ap-invoices 键
    await loginAsRole(page, 'salesperson');
    const intruderMarker = `R05-intruder-${genCode('E')}`;
    const writeFail = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      supplier_id: supplier.id,
      order_id: poId,
      receipt_date: todayStr(),
      warehouse_id: Number(ctx.warehouseIds[0]),
      department_id: Number(ctx.departmentIds[0]),
      notes: `E2E-F461-${intruderMarker}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          material_code: seeded[0].productCode,
          material_name: seeded[0].productName,
          batch_no: `B461I${genCode('X')}`,
          grade: '一等品',
          quantity: '10',
          quantity_alt: '0',
          unit_master: seeded[0].unit,
          unit_price: '10.00',
        },
      ],
    });
    console.log(`[461-05] salesperson 建收货单 status=${writeFail.status} code=${failureCode(writeFail)}`);
    expectDenied403(writeFail, '461-05 salesperson 建采购收货单');
    const confirmFail = await apiCallExpectFail(
      page,
      'POST',
      `/purchase/receipts/${targetId}/confirm`
    );
    expectDenied403(confirmFail, '461-05 salesperson 确认他人收货单');
    const readFail = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/receipts/${targetId}`
    );
    expectDenied403(readFail, '461-05 salesperson 读他人收货单详情');
    const apFail = await apiCallExpectFail(page, 'POST', '/ap/invoices/auto-generate', {
      receipt_id: targetId,
    });
    expectDenied403(apFail, '461-05 salesperson 直连应付生成');
    const apListFail = await apiCallExpectFail(page, 'GET', '/ap/invoices?page=1&page_size=10');
    expectDenied403(apListFail, '461-05 salesperson 读应付单列表');

    // 切回 admin 重读：被拒的写入没有落库、被拒的确认没有推进状态
    await loginViaUI(page, undefined, undefined, true);
    await ensureTestEntities(page);
    const afterIntrusion = await listBySupplier(page, '/purchase/receipts', supplier.id, '越权后复查');
    expect(
      afterIntrusion.filter(r => String(r.notes) === `E2E-F461-${intruderMarker}`).length,
      '461-05 被越权拒绝的收货单必须零落库'
    ).toBe(0);
    expect(
      afterIntrusion.length,
      `461-05 越权尝试不得增加收货单数量（基线 ${baseline.length} 行）`
    ).toBe(baseline.length);
    const headAfter = await readReceiptHead(page, targetId);
    expect(String(headAfter.receipt_status), '461-05 被越权拒绝的确认不得推进收货状态').toBe(
      RECEIPT_STATUS_DRAFT
    );
    const apAfter = await listBySupplier(page, '/ap/invoices', supplier.id, '461-05 应付复查');
    expect(
      apAfter.filter(
        r => String(r.source_type) === AP_SOURCE_TYPE_PURCHASE_RECEIPT && Number(r.source_id) === targetId
      ).length,
      '461-05 被越权拒绝的应付生成必须零落库'
    ).toBe(0);
  });

  // ─── 461-06 非法入参族：必填缺失、数量为负、引用不存在 id ───────────────
  test('461-06 非法入参一律 4xx 且重读列表没有半成品单据', async ({ page }) => {
    const ctx = getCtx();
    const supplier = await ownSupplier(page, '06');
    const line = await ownProduct(page, '06A');
    const warehouseId = Number(ctx.warehouseIds[0]);
    const departmentId = Number(ctx.departmentIds[0]);

    // 必填缺失（一）：采购订单不带明细
    const noItems = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      supplier_id: supplier.id,
      order_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      currency: 'CNY',
      notes: `E2E-F461-PO-noitems-${genCode('E')}`,
      items: [],
    });
    expectReject400(noItems, '461-06 无明细采购订单应被拒');

    // 必填缺失（二）：建单引用不存在的产品
    const ghostProduct = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      supplier_id: supplier.id,
      order_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      currency: 'CNY',
      notes: `E2E-F461-PO-ghost-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: 941234567,
          quantity_ordered: '10',
          unit_price: '10.00',
          tax_rate: '0',
        },
      ],
    });
    const ghostCode = expectReject400(ghostProduct, '461-06 引用不存在产品应被拒');
    expect(
      ghostCode,
      '461-06 产品存在性校验走 bad_request 变体，机器码必须是 BAD_REQUEST'
    ).toBe(APP_ERROR_CODES.BAD_REQUEST);

    // 后续腿需要一张草稿单与一张已审批单
    const { poId, seeded } = await seedApprovedOrder(page, supplier.id, [
      { product: line, qty: '10', price: '10.00', taxRate: '13' },
    ]);
    const draftCreated = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/purchase/orders', {
      supplier_id: supplier.id,
      order_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      currency: 'CNY',
      notes: `E2E-F461-PO-draft-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          quantity_ordered: '10',
          quantity_alt_ordered: '0',
          unit_price: '10.00',
          tax_rate: '13',
          quantity_tolerance_pct: '0',
        },
      ],
    });
    const draftId = requireId(draftCreated, '草稿采购订单');
    CLEANUP.push({ path: `/purchase/orders/${draftId}`, label: `purchase_order#${draftId}` });
    const draftLinesBefore = (await readOrderItems(page, draftId)).length;

    // 数量为负：订单行数量正数门（services/po/order_ops/crud.rs::validate_line_quantity）
    const negative = await apiCallExpectFail(page, 'POST', `/purchase/orders/${draftId}/items`, {
      line_no: 2,
      material_id: seeded[0].productId,
      quantity_ordered: '-5',
      unit_price: '10.00',
      tax_rate: '13',
    });
    console.log(`[461-06] 负数量 status=${negative.status} code=${failureCode(negative)}`);
    const negativeCode = expectReject400(negative, '461-06 负数量订单行应被拒');
    expect(
      negativeCode,
      '461-06 数量正数门是字段校验族，机器码必须是 VALIDATION_ERROR'
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      (await readOrderItems(page, draftId)).length,
      '461-06 被拒的负数量行不得落成半成品明细'
    ).toBe(draftLinesBefore);

    // 必填缺失（三）：订单行缺税率（系统不设默认档位）
    const noTax = await apiCallExpectFail(page, 'POST', `/purchase/orders/${draftId}/items`, {
      line_no: 2,
      material_id: seeded[0].productId,
      quantity_ordered: '5',
      unit_price: '10.00',
    });
    const noTaxCode = expectReject400(noTax, '461-06 缺税率订单行应被拒');
    expect(
      noTaxCode,
      '461-06 缺税率走 business_displayable 点名拒绝，机器码必须是 BUSINESS_ERROR'
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      (await readOrderItems(page, draftId)).length,
      '461-06 被拒的缺税率行不得落成半成品明细'
    ).toBe(draftLinesBefore);

    // 四维不全：收货行缺批次
    const noBatch = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      supplier_id: supplier.id,
      order_id: poId,
      receipt_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: `E2E-F461-R-no-batch-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          material_code: seeded[0].productCode,
          material_name: seeded[0].productName,
          grade: '一等品',
          quantity: '10',
          quantity_alt: '0',
          unit_master: seeded[0].unit,
          unit_price: '10.00',
        },
      ],
    });
    const noBatchCode = expectReject400(noBatch, '461-06 缺批次收货行应被拒');
    expect(noBatchCode, '461-06 四维准入走 business 脱敏族').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 染色布缺缸号：色号非空即染色布，缸号必填
    const noLot = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      supplier_id: supplier.id,
      order_id: poId,
      receipt_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: `E2E-F461-R-no-lot-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          material_code: seeded[0].productCode,
          material_name: seeded[0].productName,
          batch_no: `B461J${genCode('X')}`,
          color_code: 'C461-缺缸号',
          grade: '一等品',
          quantity: '10',
          quantity_alt: '0',
          unit_master: seeded[0].unit,
          unit_price: '10.00',
        },
      ],
    });
    expectReject400(noLot, '461-06 染色布缺缸号应被拒');

    // 必填缺失（四）：收货单不带明细
    const rNoItems = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      supplier_id: supplier.id,
      order_id: poId,
      receipt_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: `E2E-F461-R-no-items-${genCode('E')}`,
      items: [],
    });
    const rNoItemsCode = expectReject400(rNoItems, '461-06 无明细收货单应被拒');
    expect(
      rNoItemsCode,
      '461-06 明细行数下限是 validator 字段校验，机器码必须是 VALIDATION_ERROR'
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);

    // 缺必填键（supplier_id 缺席）：请求体解码失败收口为 400
    const missingKey = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      order_id: poId,
      receipt_date: todayStr(),
      warehouse_id: warehouseId,
      notes: `E2E-F461-R-missing-supplier-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          material_code: seeded[0].productCode,
          material_name: seeded[0].productName,
          batch_no: `B461K${genCode('X')}`,
          grade: '一等品',
          quantity: '10',
          quantity_alt: '0',
          unit_master: seeded[0].unit,
          unit_price: '10.00',
        },
      ],
    });
    expectReject400(missingKey, '461-06 缺 supplier_id 收货单应被拒');

    // 引用不存在 id：来源订单不存在 → 404
    const ghostOrder = await apiCallExpectFail(page, 'POST', '/purchase/receipts', {
      supplier_id: supplier.id,
      order_id: 941234567,
      receipt_date: todayStr(),
      warehouse_id: warehouseId,
      department_id: departmentId,
      notes: `E2E-F461-R-ghost-order-${genCode('E')}`,
      items: [
        {
          line_no: 1,
          material_id: seeded[0].productId,
          material_code: seeded[0].productCode,
          material_name: seeded[0].productName,
          batch_no: `B461L${genCode('X')}`,
          grade: '一等品',
          quantity: '10',
          quantity_alt: '0',
          unit_master: seeded[0].unit,
          unit_price: '10.00',
        },
      ],
    });
    expect(
      ghostOrder.status,
      `461-06 不存在的来源订单应 404，实际 ${ghostOrder.status} code=${failureCode(ghostOrder)}`
    ).toBe(404);
    expect(failureCode(ghostOrder), '461-06 不存在记录机器码').toBe(APP_ERROR_CODES.NOT_FOUND);

    // 全部被拒之后重读列表：该供应商名下不得出现任何半成品单据
    const receipts = await listBySupplier(page, '/purchase/receipts', supplier.id, '461-06 收货复查');
    expect(
      receipts.length,
      `461-06 非法入参族不得落任何收货单，实际 ${receipts.length} 行：${receipts
        .map(r => String(r.receipt_no))
        .join(',')}`
    ).toBe(0);
    const orders = await listBySupplier(page, '/purchase/orders', supplier.id, '461-06 订单复查');
    expect(
      orders.filter(o => Number(o.id) !== poId && Number(o.id) !== draftId).length,
      '461-06 被拒的采购订单不得落成半成品'
    ).toBe(0);
    // 草稿单明细行数仍等于建单时的一行
    expect((await readOrderItems(page, draftId)).length, '草稿单明细仍为一行').toBe(1);
  });
});

/**
 * 权限门拒绝判据：HTTP 403 + 机器码 FORBIDDEN + 统一失败信封四键。
 * 不复用 helpers.expectDenied 之外的宽松口径：403 属 CSRF 直出族时判红（会话面问题），
 * 也不得把 404/5xx 当"权限生效"。调用方：461-05。
 */
function expectDenied403(result: ApiFailureResult, label: string): void {
  const code = failureCode(result);
  expect(result.status, `${label}：应恰为 HTTP 403，实际 ${result.status} code=${code}`).toBe(403);
  expect(
    code,
    `${label}：权限拒绝机器码必须是 FORBIDDEN（CSRF 直出族码为 CSRF_*，属会话前置未成立，同样判红）`
  ).toBe(APP_ERROR_CODES.FORBIDDEN);
  expectAppErrorEnvelope(result, label);
}
