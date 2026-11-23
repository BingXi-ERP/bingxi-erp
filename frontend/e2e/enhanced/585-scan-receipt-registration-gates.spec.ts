// 585 扫码入库登记腿负例：同码重复、同码挪位、定位失败与染厂色号无对照。
// 后端唯一事实源：handlers/barcode_scanner_handler.rs:307-316 ScanReceiptRequest
//   字段是 barcode/position_no/supplier_id?/length/weight（不是 length_m/weight_kg），
//   length 必填正数由 services/scan_inbound.rs:660-680 显式拒绝；
//   register_scanned_roll（:642-716）顺序为库位非空→定长解析→长度→resolve_roll_identity
//   （款号→库位→SKU 色号→查重，:617-621）→成品仓类型门→写 inventory_piece。
//   查重 tuple=款号+缸号+匹号+匹类型（:521-596）：同库位命中 AlreadyInbound
//   （文案 :255），换库位命中 PositionMismatchOnExisting（文案 :278）；
//   PositionNotFound 文案 :227，NoColorMapping 文案 :200-204。
// 与 450 分工：450 已覆盖定长解析七类畸形码，本文件不重复格式门，只钉身份解析与查重。
// 入口：POST /scanner/scan-receipt（仓管持 scan-receipt:create 细键）；
//   GET /scanner/history 的 items 就是 inventory_piece 行（按 updated_at 倒序），
//   以二维码原文 barcode 精确过滤回查落库行数。
// 幂等说明：inventory_piece 没有删除端点，成功写入的匹行不清理；
//   每条用例用唯一的六位款号/七位外部色号/缸号保证跨 run 不撞查重 tuple。
import { expect, test } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  deferCleanup,
  expectStateGateRejection,
  flushDeferredCleanups,
  genCode,
  genName,
  loginAsRole,
  type DeferredCleanup,
} from '../flow/helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface ReceiptSeed {
  qr: string;
  productCode: string;
  externalColorNo: string;
  dyeLotNo: string;
  pieceNo: string;
  mainPosition: string;
  backupPosition: string;
  warehouseCode: string;
}

interface ReceiptResponse {
  piece_no?: string;
  barcode?: string;
  position_no?: string;
}

interface HistoryItem {
  barcode?: string;
  piece_no?: string;
  position_no?: string;
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length);
}

async function seedCategoryId(page: Page): Promise<number> {
  const categories = await apiCallRaw<{ items?: Array<{ id?: unknown }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(categories?.items?.[0]?.id);
  expect(id, '[585] 建档需要已种入的产品分类').toBeGreaterThan(0);
  return id;
}

async function seedWarehouseAndPositions(
  page: Page,
  cleanup: DeferredCleanup[],
  positionCodes: string[]
): Promise<{ id: number; code: string }> {
  const code = genCode('E585WH');
  const warehouse = await apiCall<{ id?: number }>(page, 'POST', '/warehouses', {
    warehouse_name: genName('E585成品仓'),
    warehouse_code: code,
    // 染色匹只能入成品仓（piece_domain_service.rs:95）
    warehouse_type: 'finished',
  });
  const warehouseId = Number(warehouse.data?.id);
  expect(warehouseId, '[585] 成品仓创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/warehouses/${warehouseId}`, '585 warehouse');

  for (const position of positionCodes) {
    const location = await apiCall<{ id?: number }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: warehouseId,
      location_code: position,
      location_type: 'rack',
    });
    const locationId = Number(location.data?.id);
    expect(locationId, `[585] 库位 ${position} 创建须回合法 id`).toBeGreaterThan(0);
    deferCleanup(cleanup, 'DELETE', `/warehouses/locations/${locationId}`, `585 location ${position}`);
  }
  return { id: warehouseId, code };
}

async function seedProduct(page: Page, cleanup: DeferredCleanup[], productCode: string): Promise<number> {
  const product = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code: productCode,
    name: genName('E585成品布'),
    category_id: await seedCategoryId(page),
    unit: '米',
    product_type: PRODUCT_TYPE.finished,
    is_batch_managed: true,
    batch_level: 'four_level',
    is_active: true,
  });
  const productId = Number(product.data?.id);
  expect(productId, `[585] 款号 ${productCode} 建档须回合法 id`).toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}`, '585 product');
  return productId;
}

/** 完整 seed 链：成品仓→两条库位→产品→内部色号→供应商→供应商商品→外部色号→SKU 对照。 */
async function seedRegisteredRoll(page: Page, cleanup: DeferredCleanup[]): Promise<ReceiptSeed> {
  const productCode = uniqueDigits(6);
  const externalColorNo = uniqueDigits(7);
  const dyeLotNo = `JL${uniqueDigits(8)}`;
  const pieceNo = '022';
  const mainPosition = genCode('E585-POS-A');
  const backupPosition = genCode('E585-POS-B');
  const warehouse = await seedWarehouseAndPositions(page, cleanup, [mainPosition, backupPosition]);
  const productId = await seedProduct(page, cleanup, productCode);

  const internalColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/products/${productId}/colors`,
    {
      color_no: `IN-${externalColorNo}`,
      color_name: 'E585 内部色',
      extra_cost: 0,
      is_active: true,
    }
  );
  const productColorId = Number(internalColor.data?.id);
  expect(productColorId, '[585] 内部色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}/colors/${productColorId}`, '585 color');

  const supplier = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: genName('E585供应商'),
    supplier_short_name: 'E585SUP',
    contact_phone: '13800000000',
  });
  const supplierId = Number(supplier.data?.id);
  expect(supplierId, '[585] 供应商创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/suppliers/${supplierId}`, '585 supplier');

  const supplierProduct = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-products',
    {
      supplier_id: supplierId,
      product_code: genCode('E585SP'),
      product_name: genName('E585供应商品'),
      unit: '米',
    }
  );
  const supplierProductId = Number(supplierProduct.data?.id);
  expect(supplierProductId, '[585] 供应商商品创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-products/${supplierProductId}`,
    '585 supplier product'
  );

  const supplierColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-product-colors',
    {
      supplier_product_id: supplierProductId,
      color_no: externalColorNo,
      color_name: 'E585 染厂色',
      extra_cost: '2.50',
    }
  );
  const supplierColorId = Number(supplierColor.data?.id);
  expect(supplierColorId, '[585] 供应商色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-product-colors/${supplierColorId}`,
    '585 supplier color'
  );

  const mapping = await apiCall<{ id?: number }>(page, 'POST', '/purchase/sku-mappings', {
    product_id: productId,
    product_color_id: productColorId,
    supplier_id: supplierId,
    supplier_product_id: supplierProductId,
    supplier_product_color_id: supplierColorId,
    supplier_price: '50.00',
    is_primary: true,
    is_enabled: true,
  });
  const mappingId = Number(mapping.data?.id);
  expect(mappingId, '[585] SKU 对照创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/sku-mappings/${mappingId}`, '585 sku mapping');

  return {
    qr: `${productCode}${externalColorNo}${dyeLotNo}${pieceNo}`,
    productCode,
    externalColorNo,
    dyeLotNo,
    pieceNo,
    mainPosition,
    backupPosition,
    warehouseCode: warehouse.code,
  };
}

/** 从扫码历史里精确按二维码原文取行；缺 items 数组直接判红，不用空数组掩盖响应结构漂移。 */
async function findReceiptRows(page: Page, barcode: string): Promise<HistoryItem[]> {
  const history = await apiCallRaw<{ items?: HistoryItem[]; total?: number }>(
    page,
    'GET',
    '/scanner/history?page=1&page_size=100'
  );
  const items = history?.items;
  if (!Array.isArray(items)) {
    throw new Error(`[585] /scanner/history 未返回 items 数组：${JSON.stringify(history)}`);
  }
  return items.filter(item => item.barcode === barcode);
}

test('585-01 同码同库位二次扫码入库被查重拒绝且文案指向移库', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'admin');
    const seed = await seedRegisteredRoll(page, cleanup);

    await loginAsRole(page, 'warehouse_keeper');
    const first = await apiCall<ReceiptResponse>(page, 'POST', '/scanner/scan-receipt', {
      barcode: seed.qr,
      position_no: seed.mainPosition,
      length: '100',
    });
    expect(first.data?.piece_no, '[585-01] 首次扫码应落匹并返回匹号').toBe(seed.pieceNo);
    expect(first.data?.barcode, '[585-01] 首次扫码应回显二维码原文').toBe(seed.qr);

    const duplicate = await apiCallExpectFail(page, 'POST', '/scanner/scan-receipt', {
      barcode: seed.qr,
      position_no: seed.mainPosition,
      length: '100',
    });
    expectStateGateRejection(duplicate, '585-01 同码同库位重复入库');
    expect(duplicate.code, '[585-01] 判重属业务拒绝而非校验/权限').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const message = String(duplicate.message ?? '');
    expect(message, `[585-01] 文案须点名重复事实，实际 ${message}`).toContain('这一匹已经入过库');
    expect(message, `[585-01] 文案须给出挪位出口，实际 ${message}`).toContain(
      '要换位置请走移库或库存调整'
    );

    await loginAsRole(page, 'admin');
    const rows = await findReceiptRows(page, seed.qr);
    expect(rows.length, '[585-01] 重复扫码不得再落第二行匹').toBe(1);
  } finally {
    await loginAsRole(page, 'admin');
    await flushDeferredCleanups(page, cleanup);
  }
});

test('585-02 同码换库位扫码入库被挪位门拒绝且历史只留一行', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'admin');
    const seed = await seedRegisteredRoll(page, cleanup);

    await loginAsRole(page, 'warehouse_keeper');
    const first = await apiCall<ReceiptResponse>(page, 'POST', '/scanner/scan-receipt', {
      barcode: seed.qr,
      position_no: seed.mainPosition,
      length: '100',
    });
    expect(first.data?.piece_no, '[585-02] 首次扫码应落匹').toBe(seed.pieceNo);
    expect(first.data?.position_no, '[585-02] 首次扫码应落主库位').toBe(seed.mainPosition);

    const moved = await apiCallExpectFail(page, 'POST', '/scanner/scan-receipt', {
      barcode: seed.qr,
      position_no: seed.backupPosition,
      length: '100',
    });
    expectStateGateRejection(moved, '585-02 同码换库位重复入库');
    expect(moved.code, '[585-02] 挪位门属业务拒绝').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const message = String(moved.message ?? '');
    expect(message, `[585-02] 文案须点名挪位出口，实际 ${message}`).toContain(
      '要挪位置请走移库，不要按重复入库再扫一次'
    );
    expect(message, `[585-02] 文案须带出两个库位的不一致，实际 ${message}`).toContain('不一致');

    await loginAsRole(page, 'admin');
    const rows = await findReceiptRows(page, seed.qr);
    expect(rows.length, '[585-02] 换库位重扫不得新增匹行').toBe(1);
    expect(rows[0]?.piece_no, '[585-02] 历史行须是首次登记那一匹').toBe(seed.pieceNo);
    expect(rows[0]?.position_no, '[585-02] 历史行仍指向主库位，不会被重扫改写').toBe(
      seed.mainPosition
    );
  } finally {
    await loginAsRole(page, 'admin');
    await flushDeferredCleanups(page, cleanup);
  }
});

test('585-03 未登记库位与无外部色号对照在定位腿拒绝且不落匹', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'admin');
    const productCode = uniqueDigits(6);
    const externalColorNo = uniqueDigits(7);
    const qr = `${productCode}${externalColorNo}JL${uniqueDigits(8)}022`;
    const registeredPosition = genCode('E585-POS-OK');
    // 定位门只依赖产品与库位档案，不建 SKU 对照（零前置）：
    await seedWarehouseAndPositions(page, cleanup, [registeredPosition]);
    await seedProduct(page, cleanup, productCode);

    await loginAsRole(page, 'warehouse_keeper');
    const missingPosition = await apiCallExpectFail(page, 'POST', '/scanner/scan-receipt', {
      barcode: qr,
      position_no: genCode('E585-POS-MISSING'),
      length: '100',
    });
    expectStateGateRejection(missingPosition, '585-03 未登记库位');
    expect(missingPosition.code, '[585-03] 库位定位失败属业务拒绝').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    expect(
      String(missingPosition.message ?? ''),
      '[585-03] 文案须点名库位档案缺失'
    ).toContain('在库位档案里没有登记');

    // 库位合法但产品没有任何 SKU 对照 → resolve_internal_color 的 NoColorMapping 分支：
    const noMapping = await apiCallExpectFail(page, 'POST', '/scanner/scan-receipt', {
      barcode: qr,
      position_no: registeredPosition,
      length: '100',
    });
    expectStateGateRejection(noMapping, '585-03 外部色号无对照');
    expect(noMapping.code, '[585-03] 色号无对照属业务拒绝').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const message = String(noMapping.message ?? '');
    expect(message, `[585-03] 文案须点名缺少 SKU 对照，实际 ${message}`).toContain(
      '没有对照到本系统的内部色号'
    );
    expect(message, `[585-03] 文案须带出外部色号，实际 ${message}`).toContain(externalColorNo);

    await loginAsRole(page, 'admin');
    const rows = await findReceiptRows(page, qr);
    expect(rows.length, '[585-03] 两条定位门拒绝均不得落匹').toBe(0);
  } finally {
    await loginAsRole(page, 'admin');
    await flushDeferredCleanups(page, cleanup);
  }
});
