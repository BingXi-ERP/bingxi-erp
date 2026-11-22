// 4.37 计量深度专项：报价交易单位（码/公斤）→销售订单双计量→面料库存回读守恒。
// 端点：POST /products、POST /quotations、POST /quotations/{id}/submit、
// POST /quotations/{id}/convert、GET /sales/orders/{id}、
// POST /inventory/stock/fabric、GET /inventory/stock/fabric。
// 契约来源：quotation_convert_service.rs resolve_unit_conversion 的码/公斤成功路径；
// dual_unit_converter.rs 的 yards_to_meters（1 米=1.0936 码，保留 2 位）、
// kg_to_meters（公斤×1000÷克重÷幅宽m，保留 2 位）、
// meters_to_kg（米×克重×幅宽m÷1000，保留 3 位）；
// copy_quotation_items_to_order 把 quantity 原样带入订单行，同时把 quantity_meters/quantity_kg 落双计量。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallRaw, ensureTestEntities, genCode, getCtx, loginViaUI } from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

type Row = Record<string, unknown>;

interface ConvertedLine {
  quantity: number;
  quantityMeters: number;
  quantityKg: number;
  gramWeight: number;
  width: number;
}

const GRAM_WEIGHT = 200;
const WIDTH_CM = 150;
const EXPECTED_METERS = 10000;
const EXPECTED_KG = 3000;

function requirePositiveId(row: Row, label: string): number {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} 未返回有效 id，实际=${JSON.stringify(row).slice(0, 300)}`);
  }
  return id;
}

function decimal(value: unknown, label: string): number {
  const text = String(value);
  expect(text, `${label} 应为十进制字符串或数字，实际=${text}`).toMatch(/^\d+(?:\.\d+)?$/);
  const parsed = Number(text);
  expect(Number.isFinite(parsed), `${label} 应为有限数，实际=${text}`).toBe(true);
  return parsed;
}

function findOrderLine(orderDetail: Row, productId: number): Row {
  const items = orderDetail.items;
  if (!Array.isArray(items)) {
    throw new Error(`订单详情缺 items 数组，实际=${JSON.stringify(orderDetail).slice(0, 300)}`);
  }
  const line = items.find(item => Number((item as Row).product_id) === productId) as
    Row | undefined;
  if (line === undefined) {
    throw new Error(`订单详情未找到产品 ${productId} 的订单行`);
  }
  return line;
}

async function createUnitProduct(page: Page, unit: '码' | '公斤', tag: string): Promise<number> {
  const ctx = getCtx();
  const categoryId = ctx.productCategoryIds[0];
  if (categoryId === undefined) {
    throw new Error(`543-${tag} 前置不成立：夹具产品分类未就绪`);
  }
  const code = genCode(`543${tag}`);
  const created = await apiCallRaw<Row>(page, 'POST', '/products', {
    code,
    name: `E543-${tag}-${unit}`,
    unit,
    category_id: categoryId,
    product_type: PRODUCT_TYPE.finished,
    fabric_composition: '100%涤纶',
    gram_weight: GRAM_WEIGHT,
    width: WIDTH_CM,
    meters_per_piece: 50,
  });
  const productId = requirePositiveId(created, `产品 ${tag}`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/products/${productId}`);
  expect(String(detail.unit), `${tag} 产品落库单位必须逐字符等于报价行单位`).toBe(unit);
  expect(decimal(detail.gram_weight, `${tag} 产品克重`), '克重应落库为 200').toBeCloseTo(
    GRAM_WEIGHT,
    2
  );
  expect(decimal(detail.width, `${tag} 产品幅宽`), '幅宽应落库为 150').toBeCloseTo(WIDTH_CM, 2);
  return productId;
}

async function createApprovedQuotation(
  page: Page,
  productId: number,
  unit: '码' | '公斤',
  quantity: string,
  unitPrice: string,
  tag: string
): Promise<number> {
  const ctx = getCtx();
  const created = await apiCallRaw<Row>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
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
        unit,
        quantity,
        unit_price: unitPrice,
        unit_price_with_tax: unitPrice,
      },
    ],
    notes: `E2E-543-${tag}-${genCode('Q')}`,
  });
  const quotationId = requirePositiveId(created, `报价单 ${tag}`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  const items = detail.items;
  if (!Array.isArray(items) || items.length !== 1) {
    throw new Error(
      `543-${tag} 报价详情必须恰有 1 条明细，实际=${JSON.stringify(detail).slice(0, 300)}`
    );
  }
  const line = items[0] as Row;
  expect(String(line.unit), `${tag} 报价行单位应逐字符等于产品交易单位`).toBe(unit);
  expect(decimal(line.quantity, `${tag} 报价行交易量`)).toBeCloseTo(Number(quantity), 2);

  await apiCall(page, 'POST', `/quotations/${quotationId}/submit`);
  const submitted = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  expect(
    String(submitted.status),
    `${tag} 报价金额低于 10 万应走销售员自批，提交后即小写 approved，实际=${String(
      submitted.status
    )}`
  ).toBe('approved');
  return quotationId;
}

async function convertAndReadOrder(
  page: Page,
  quotationId: number,
  productId: number,
  unit: '码' | '公斤',
  transactionQuantity: number,
  tag: string
): Promise<{ orderId: number; line: ConvertedLine }> {
  const converted = await apiCallRaw<Row>(page, 'POST', `/quotations/${quotationId}/convert`);
  const orderId = requirePositiveId(converted, `${tag} 转单出的销售订单`);
  const quotation = await apiCallRaw<Row>(page, 'GET', `/quotations/${quotationId}`);
  expect(String(quotation.status), `${tag} 转单后报价状态`).toBe('converted');
  expect(Number(quotation.converted_sales_order_id), `${tag} 报价应回指转出的订单`).toBe(orderId);

  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  const row = findOrderLine(detail, productId);
  const line: ConvertedLine = {
    quantity: decimal(row.quantity, `${tag} 订单行交易量`),
    quantityMeters: decimal(row.quantity_meters, `${tag} 订单行主计量米数`),
    quantityKg: decimal(row.quantity_kg, `${tag} 订单行辅计量公斤数`),
    gramWeight: decimal(row.gram_weight, `${tag} 订单行克重元数据`),
    width: decimal(row.width, `${tag} 订单行幅宽元数据`),
  };
  expect(line.quantity, `${tag} 订单行交易量应保留报价交易单位原值，不得被换算覆盖`).toBeCloseTo(
    transactionQuantity,
    2
  );
  expect(line.gramWeight, `${tag} 订单行应带入产品克重`).toBeCloseTo(GRAM_WEIGHT, 2);
  expect(line.width, `${tag} 订单行应带入产品幅宽`).toBeCloseTo(WIDTH_CM, 2);
  expect(
    line.quantityMeters,
    `${tag} 订单行主计量必须折回 10000 米，实际=${String(row.quantity_meters)}`
  ).toBeCloseTo(EXPECTED_METERS, 2);
  expect(
    line.quantityKg,
    `${tag} 订单行辅计量必须折回 3000 公斤，实际=${String(row.quantity_kg)}`
  ).toBeCloseTo(EXPECTED_KG, 3);
  return { orderId, line };
}

async function seedAndReadStock(
  page: Page,
  productId: number,
  line: ConvertedLine,
  tag: string
): Promise<void> {
  const ctx = getCtx();
  const warehouseId = ctx.warehouseIds[0];
  if (warehouseId === undefined) {
    throw new Error(`543-${tag} 前置不成立：夹具仓库未就绪`);
  }
  const batchNo = genCode(`543S${tag}`);
  const created = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
    warehouse_id: warehouseId,
    product_id: productId,
    batch_no: batchNo,
    grade: '一等品',
    quantity_meters: String(line.quantityMeters),
    gram_weight: GRAM_WEIGHT,
    width: WIDTH_CM,
  });
  expect(
    decimal(created.quantity_kg, `${tag} 库存建单公斤折算`),
    `${tag} 库存建单公斤应按订单行米数与克重幅宽折出，实际=${String(created.quantity_kg)}`
  ).toBeCloseTo(line.quantityKg, 3);

  const listedRaw = await apiCallRaw<unknown>(
    page,
    'GET',
    `/inventory/stock/fabric?batch_no=${encodeURIComponent(batchNo)}&product_id=${productId}`
  );
  if (!Array.isArray(listedRaw)) {
    throw new Error(
      `543-${tag} 面料库存列表出参应为裸数组，实际=${JSON.stringify(listedRaw).slice(0, 300)}`
    );
  }
  const hit = listedRaw.find(row => String((row as Row).batch_no) === batchNo) as Row | undefined;
  if (hit === undefined) {
    throw new Error(`543-${tag} 按批次 ${batchNo} 未能从库存列表读回入库行`);
  }
  expect(
    decimal(hit.quantity_meters, `${tag} 库存读回米数`),
    `${tag} 库存读回米数应与订单行主计量逐值一致`
  ).toBeCloseTo(line.quantityMeters, 2);
  expect(
    decimal(hit.quantity_kg, `${tag} 库存读回公斤数`),
    `${tag} 库存读回公斤应与订单行辅计量逐值一致`
  ).toBeCloseTo(line.quantityKg, 3);
}

test.beforeEach(async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
});

test('543-01 码制报价转单按 1 米=1.0936 码折回主计量 订单与库存双计量守恒', async ({ page }) => {
  const unit = '码' as const;
  const productId = await createUnitProduct(page, unit, 'YD');
  const quotationId = await createApprovedQuotation(page, productId, unit, '10936', '1', 'YD');
  const { line } = await convertAndReadOrder(page, quotationId, productId, unit, 10936, '码制');
  await seedAndReadStock(page, productId, line, 'YD');
  console.log(
    `[543-01] 码制转单守恒通过 报价=${quotationId} 米=${line.quantityMeters} 公斤=${line.quantityKg}`
  );
});

test('543-02 公斤制报价转单按克重幅宽折回米数 订单与库存双计量守恒', async ({ page }) => {
  const unit = '公斤' as const;
  const productId = await createUnitProduct(page, unit, 'KG');
  const quotationId = await createApprovedQuotation(page, productId, unit, '3000', '3', 'KG');
  const { line } = await convertAndReadOrder(page, quotationId, productId, unit, 3000, '公斤制');
  await seedAndReadStock(page, productId, line, 'KG');
  console.log(
    `[543-02] 公斤制转单守恒通过 报价=${quotationId} 米=${line.quantityMeters} 公斤=${line.quantityKg}`
  );
});
