// 667 采购退货过账的应付红字守恒：红字 AP 单、红字冲销凭证、四维库存与来源 PO 回退、重复审批零漂移。
//
// 功能：从已入库且已建正向应付单的采购订单发起含四维退货，过账后新增负数红字应付单并关联退货单，
//       同时生成红字冲销凭证、精确回退库存四维与来源 PO received_quantity；重复 approve 被业务码拒绝且不重复出账。
// 判据来源（写入方为准）：purchase_return_service.rs:352-353 事务外生成红字应付；
//       :815-857 失败落死信不改变库存扣减；ap_invoice_ops/receipt.rs:78 来源常量 PURCHASE_RETURN、
//       :582-666 按 source_id 查重生成红字 AP 与红字凭证；build_return_voucher_items 的 summary 含红字单号。
// 调用方与端点：POST /purchase/orders|/purchase/receipts|/ap/invoices|/purchase/returns 建单，
//       /purchase/returns/{id}/items 建四维明细，/submit 与 /approve 过账，GET 各详情与 /ap/invoices、/vouchers 回读。
// 数据形状与存储：AP/Voucher 金额列为 DECIMAL，出参是字符串，定点分位比较禁浮点等号；
//       应付单 source_type=source_id、凭证 source_bill_no/source_bill_id 指向红字单；列表按裸数组或分页信封显式识别。
// 状态词表：退货 draft→SUBMITTED→APPROVED（purchase_return 大写词表），PO 回退后为 PARTIAL_RECEIVED。
// 失败信封与零漂移：失败仅 AppError 字符串码，重复审批归 BUSINESS_ERROR，红字单与凭证数量不得增加。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;

interface CleanupEntry {
  path: string;
  label: string;
}
const CLEANUP: CleanupEntry[] = [];

/** 功能：DECIMAL 出参转百分位整数；入参：任意 JSON 值+字段名；出参：bigint 分；异常：非数字或超两位有效尾数直接抛错。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} 非 DECIMAL 出参：${JSON.stringify(value)}`);
  }
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!matched) throw new Error(`${label} 无法定点解析：${String(value)}`);
  const fraction = (matched[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超过两位：${String(value)}`);
  }
  return BigInt(`${matched[1]}${matched[2]}${fraction.slice(0, 2)}`);
}

/** 功能：规范化列表信封；入参：未知 JSON+标签；出参：裸数组；异常：形状既非裸数组也非 items 信封即抛错。 */
function asList(value: unknown, label: string): Row[] {
  if (Array.isArray(value)) return value as Row[];
  if (value && typeof value === 'object' && Array.isArray((value as Row).items)) {
    return (value as Row).items as Row[];
  }
  throw new Error(`${label} 形状异常：${JSON.stringify(value)}`);
}

/** 功能：必填正整数 id；入参：未知 JSON 值+标签；出参：number；异常：缺失或非正整数抛错。 */
function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} 非法：${JSON.stringify(value)}`);
  return id;
}

/** 功能：按四维读取库存行；入参：page+产品/仓/色/缸/批；出参：库存行；异常：未唯一命中直接抛错，不取第一行兜底。 */
async function readFourDimStock(
  page: Page,
  productId: number,
  warehouseId: number,
  color: string,
  dyeLot: string,
  batch: string
): Promise<Row> {
  const query =
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&color_no=${encodeURIComponent(color)}&dye_lot_no=${encodeURIComponent(dyeLot)}` +
    `&batch_no=${encodeURIComponent(batch)}&page=1&page_size=100`;
  const rows = asList(await apiCallRaw<unknown>(page, 'GET', query), '四维库存回读');
  if (rows.length !== 1)
    throw new Error(`四维库存应唯一命中一行，实际 ${rows.length} 行：${query}`);
  return rows[0] as Row;
}

/** 功能：新建已审批 PO；入参：page+产品 id；出参：PO id；异常：审批后非 APPROVED 抛错。 */
async function seedApprovedPo(page: Page, productId: number): Promise<number> {
  const ctx = getCtx();
  const res = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
    supplier_id: ctx.supplierId,
    order_date: new Date().toISOString().slice(0, 10),
    warehouse_id: ctx.warehouseIds[0],
    department_id: ctx.departmentIds[0],
    notes: `E2E667-PO-${genCode('P')}`,
    items: [{ material_id: productId, quantity_ordered: '100', unit_price: '12.00', tax_rate: 13 }],
  });
  const id = requireId(res.data?.id, '建 PO');
  CLEANUP.push({ path: `/purchase/orders/${id}`, label: `po#${id}` });
  await apiCall(page, 'POST', `/purchase/orders/${id}/submit`);
  await apiCall(page, 'POST', `/purchase/orders/${id}/approve`);
  const detail = await apiCallRaw<Row>(page, 'GET', `/purchase/orders/${id}`);
  expect(detail.status, 'PO 审批后应为 APPROVED').toBe('APPROVED');
  return id;
}

/** 功能：新建并确认四维入库；入参：page+PO/产品/仓/四维；出参：确认后库存行；异常：回读行数异常抛错。 */
async function seedConfirmedReceipt(
  page: Page,
  poId: number,
  productId: number,
  warehouseId: number,
  dims: { color: string; dyeLot: string; batch: string }
): Promise<Row> {
  const ctx = getCtx();
  const prod = await apiCallRaw<{ code: string; name: string; unit: string }>(
    page,
    'GET',
    `/products/${productId}`
  );
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/receipts', {
    supplier_id: ctx.supplierId,
    order_id: poId,
    receipt_date: new Date().toISOString().slice(0, 10),
    warehouse_id: warehouseId,
    department_id: ctx.departmentIds[0],
    notes: `E2E667-RCV-${dims.batch}`,
    items: [
      {
        line_no: 1,
        material_id: productId,
        material_code: prod.code,
        material_name: prod.name,
        batch_no: dims.batch,
        color_code: dims.color,
        lot_no: dims.dyeLot,
        grade: '一等品',
        quantity: '60',
        quantity_alt: '60',
        unit_master: prod.unit,
        unit_price: '12.00',
      },
    ],
  });
  const id = requireId(created.data?.id, '建入库单');
  CLEANUP.push({ path: `/purchase/receipts/${id}`, label: `receipt#${id}` });
  await apiCall(page, 'POST', `/purchase/receipts/${id}/confirm`);
  return readFourDimStock(page, productId, warehouseId, dims.color, dims.dyeLot, dims.batch);
}

/** 功能：读取红字 AP 单；入参：page+供应商 id；出参：PURCHASE_RETURN 来源单数组；异常：列表形状异常抛错。 */
async function redApInvoices(page: Page, supplierId: number): Promise<Row[]> {
  const rows = asList(
    await apiCallRaw<unknown>(
      page,
      'GET',
      `/ap/invoices?supplier_id=${supplierId}&page=1&page_size=100`
    ),
    '应付单列表'
  );
  return rows.filter(row => row.source_type === 'PURCHASE_RETURN');
}

/** 功能：读取红字冲销凭证；入参：page+红字 AP id；出参：凭证裸数组；异常：列表非裸数组抛错。 */
async function redVouchers(page: Page, redInvoiceId: number): Promise<Row[]> {
  const rows = asList(
    await apiCallRaw<unknown>(page, 'GET', '/vouchers?page=1&page_size=100'),
    '凭证列表'
  );
  return rows.filter(
    row => row.source_type === 'PURCHASE_RETURN' && Number(row.source_bill_id) === redInvoiceId
  );
}

test.describe.serial('667 采购退货应付红字守恒', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    while (CLEANUP.length > 0) {
      const entry = CLEANUP.pop();
      if (entry) await tryCleanup(page, 'DELETE', entry.path, entry.label);
    }
  });

  test('退货过账新增红字 AP 与凭证，四维库存及来源 PO 回退，重复审批零漂移', async ({ page }) => {
    const ctx = getCtx();
    const tag = genCode('667');
    const productId = requireId(ctx.productIds[0], '基础产品');
    const warehouseId = requireId(ctx.warehouseIds[0], '基础仓库');
    const supplierId = requireId(ctx.supplierId, '基础供应商');
    const dims = { color: `C-${tag}`, dyeLot: genDyeLotNo(), batch: `B-${tag}` };

    const poId = await seedApprovedPo(page, productId);
    const stockBefore = await seedConfirmedReceipt(page, poId, productId, warehouseId, dims);
    expect(Number(stockBefore.quantity_on_hand), '入库后四维 on_hand 应为 60').toBe(60);
    const poItemsBefore = asList(
      await apiCallRaw<unknown>(page, 'GET', `/purchase/orders/${poId}/items`),
      'PO 明细回读'
    );
    const poLineBefore = poItemsBefore.find(row => Number(row.material_id) === productId);
    if (!poLineBefore) throw new Error('来源 PO 未找到本产品明细行');
    expect(Number(poLineBefore.received_quantity), '入库回写后 received_quantity 应为 60').toBe(60);

    // 先建正向应付账单：红字必须是在此之外新增的独立负单，不得冲改原单。
    const today = new Date().toISOString().slice(0, 10);
    const positive = await apiCallRaw<Row>(page, 'POST', '/ap/invoices', {
      supplier_id: supplierId,
      invoice_type: 'PURCHASE',
      amount: '1200.00',
      tax_amount: '0',
      invoice_date: today,
      due_date: today,
    });
    const positiveId = requireId(positive.id, '正向应付单');
    CLEANUP.push({ path: `/ap/invoices/${positiveId}`, label: `ap#${positiveId}` });
    const apBefore = await redApInvoices(page, supplierId);
    const voucherBefore = await apiCallRaw<unknown>(page, 'GET', '/vouchers?page=1&page_size=100');
    const voucherCountBefore = asList(voucherBefore, '凭证基线').length;

    const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/returns', {
      supplier_id: supplierId,
      order_id: poId,
      warehouse_id: warehouseId,
      department_id: ctx.departmentIds[0],
      return_date: today,
      reason_type: '色差',
      reason_detail: `E2E667 红字守恒 ${tag}`,
      notes: `E2E667-RET-${tag}`,
    });
    const returnId = requireId(created.data?.id, '建退货单');
    CLEANUP.push({ path: `/purchase/returns/${returnId}`, label: `return#${returnId}` });
    await apiCall(page, 'POST', `/purchase/returns/${returnId}/items`, {
      line_no: 1,
      material_id: productId,
      quantity_returned: '20',
      unit_price: '12.00',
      color_no: dims.color,
      dye_lot_no: dims.dyeLot,
      batch_no: dims.batch,
    });
    await apiCall(page, 'POST', `/purchase/returns/${returnId}/submit`);
    await apiCall(page, 'POST', `/purchase/returns/${returnId}/approve`);

    const detail = await apiCallRaw<Row>(page, 'GET', `/purchase/returns/${returnId}`);
    expect(detail.return_status, '过账后退货单应为 APPROVED').toBe('APPROVED');

    const apAfter = await redApInvoices(page, supplierId);
    expect(apAfter.length - apBefore.length, '过账后应恰好新增一张红字 AP 单').toBe(1);
    const red = apAfter.find(row => Number(row.source_id) === returnId);
    if (!red) throw new Error(`未找到关联退货单 ${returnId} 的红字 AP 单`);
    expect(decimalCents(red.amount, '红字 AP amount') < 0n, '红字 AP 金额必须为负').toBe(true);
    expect(decimalCents(red.unpaid_amount, '红字 AP unpaid'), '红字未收应为负额原值').toBe(
      decimalCents(red.amount, '红字 AP amount')
    );
    CLEANUP.push({ path: `/ap/invoices/${requireId(red.id, '红字 AP id')}`, label: 'red_ap' });

    const redId = requireId(red.id, '红字 AP id');
    const redVoucherList = await redVouchers(page, redId);
    expect(redVoucherList.length, '应生成且仅生成一张关联红字 AP 的冲销凭证').toBe(1);
    const voucher = redVoucherList[0] as Row;
    expect(voucher.source_bill_no, '凭证来源单号应等于红字 AP 单号').toBe(red.invoice_no);
    const voucherDetail = await apiCallRaw<{ entries?: Row[] }>(
      page,
      'GET',
      `/vouchers/${requireId(voucher.id, '凭证 id')}`
    );
    const entries = voucherDetail.entries;
    if (!Array.isArray(entries) || entries.length < 2) {
      throw new Error(`红字凭证分录不足两条：${JSON.stringify(voucherDetail)}`);
    }
    expect(
      entries.some(entry => String(entry.summary ?? '').includes(String(red.invoice_no))),
      '红字凭证分录摘要应带红字 AP 单号'
    ).toBe(true);
    const voucherCountAfter = asList(
      await apiCallRaw<unknown>(page, 'GET', '/vouchers?page=1&page_size=100'),
      '凭证过账后回读'
    ).length;
    expect(voucherCountAfter - voucherCountBefore, '一次过账只应生成一张凭证').toBe(1);

    const stockAfter = await readFourDimStock(
      page,
      productId,
      warehouseId,
      dims.color,
      dims.dyeLot,
      dims.batch
    );
    expect(Number(stockAfter.quantity_on_hand), '四维 on_hand 应回退 20').toBe(40);
    expect(Number(stockAfter.quantity_available), '四维 available 应同步回退 20').toBe(40);
    const poItemsAfter = asList(
      await apiCallRaw<unknown>(page, 'GET', `/purchase/orders/${poId}/items`),
      'PO 明细过账后回读'
    );
    const poLineAfter = poItemsAfter.find(row => Number(row.material_id) === productId);
    if (!poLineAfter) throw new Error('过账后来源 PO 明细行丢失');
    expect(Number(poLineAfter.received_quantity), '来源 PO received_quantity 应回退 20').toBe(40);

    const repeated = await apiCallExpectFail(page, 'POST', `/purchase/returns/${returnId}/approve`);
    expect(repeated.status, '重复 approve 应 400').toBe(400);
    expect(failureCode(repeated), '重复 approve 应归 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect((await redApInvoices(page, supplierId)).length, '重复审批后红字 AP 不得增加').toBe(
      apAfter.length
    );
    expect((await redVouchers(page, redId)).length, '重复审批后红字凭证不得增加').toBe(1);
  });
});
