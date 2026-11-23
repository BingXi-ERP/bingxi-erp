/**
 * 扫码入库成功腿的逐字段出参映射，以及盘库端对同一匹的跨形态回读。
 *
 * 功能：用一套真实 seed 走通 POST /scanner/scan-receipt 成功路径，逐个钉住九个业务出参
 *   与库存匹列的绑定，再用 GET /scanner/scan-inventory 按二维码回读同一行，确认两个端点
 *   对同一匹的描述一致。
 * 调用方：本文件由 e2e 诊断 fixture 驱动；admin 负责建 seed，warehouse_keeper 负责登记。
 * 入参：seedRegisteredRoll 自建成品仓、两条库位、产品、内部色号、供应商、供应商商品、
 *   外部色号与 SKU 对照；登记请求带二维码原文、主库位、长度 100 与重量 12.5。
 * 传给谁：登记请求交给 handlers/barcode_scanner_handler.rs 的 scan_receipt_post，
 *   落库交给 services/scan_inbound.rs 的 register_scanned_roll；回读交给 scan_inventory。
 * 存什么：一行 inventory_piece，含二维码原文、末三位匹号、缸号、内部色号、库位、仓库 id、
 *   长度、重量、入库时间与 available 状态。
 * 存哪里：inventory_piece 表。匹行没有删除端点，成功写入后不清理匹行，只清理 seed 资源。
 *
 * 出参事实：scan_receipt_post 把 created 的 piece_no/dye_lot_no/color_no/barcode/position_no/
 *   warehouse_id/length/weight/warehouse_in_at 原样序列化；register_scanned_roll 写库时
 *   barcode 取二维码原文、piece_no 取末三位、dye_lot_no 取缸号段、color_no 取内部色号，
 *   status 落 available。scan_inventory 按 Barcode 精确查行，回 barcode/piece_no/
 *   warehouse_id/length/status，故可跨端点比对同一匹。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  apiCall,
  deferCleanup,
  apiCallRaw,
  flushDeferredCleanups,
  genCode,
  genName,
  loginAsRole,
  type DeferredCleanup,
} from './helpers';
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

interface ReceiptRow {
  piece_no?: string;
  dye_lot_no?: string;
  color_no?: string;
  barcode?: string;
  position_no?: string;
  warehouse_id?: number | string;
  length?: number | string;
  weight?: number | string;
  warehouse_in_at?: string;
}

interface InventoryRow {
  barcode?: string;
  piece_no?: string;
  warehouse_id?: number | string;
  length?: number | string;
  status?: string;
}

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length);
}

/**
 * 读取已种入的首个产品分类 id，供产品建档引用。
 * 调用方：本文件的 seedProduct。入参：page 会话。传给谁：GET /product-categories。
 * 存什么：只读分类 id，不写库。存哪里：无。
 */
async function seedCategoryId(page: Page): Promise<number> {
  const categories = await apiCallRaw<{ items?: Array<{ id?: unknown }> }>(
    page,
    'GET',
    '/product-categories'
  );
  const id = Number(categories?.items?.[0]?.id);
  expect(id, '[586] 建档需要已种入的产品分类').toBeGreaterThan(0);
  return id;
}

/**
 * 建成品仓与两条库位，一条作登记库位，一条留作挪位备用。
 * 调用方：seedRegisteredRoll。入参：page 会话、清理队列、两个库位编码。
 * 传给谁：POST /warehouses 与 POST /warehouses/locations。
 * 存什么：一个成品仓与两条 rack 库位；染色匹只能入成品仓。
 * 存哪里：warehouse 与 warehouse_location 表，id 入清理队列延后删除。
 */
async function seedWarehouseAndPositions(
  page: Page,
  cleanup: DeferredCleanup[],
  positionCodes: string[]
): Promise<{ id: number; code: string }> {
  const code = genCode('E586WH');
  const warehouse = await apiCall<{ id?: number }>(page, 'POST', '/warehouses', {
    warehouse_name: genName('E586成品仓'),
    warehouse_code: code,
    warehouse_type: 'finished',
  });
  const warehouseId = Number(warehouse.data?.id);
  expect(warehouseId, '[586] 成品仓创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/warehouses/${warehouseId}`, '586 warehouse');

  for (const position of positionCodes) {
    const location = await apiCall<{ id?: number }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: warehouseId,
      location_code: position,
      location_type: 'rack',
    });
    const locationId = Number(location.data?.id);
    expect(locationId, `[586] 库位 ${position} 创建须回合法 id`).toBeGreaterThan(0);
    deferCleanup(
      cleanup,
      'DELETE',
      `/warehouses/locations/${locationId}`,
      `586 location ${position}`
    );
  }
  return { id: warehouseId, code };
}

/**
 * 建成品布产品，供内部色号与 SKU 对照引用。
 * 调用方：seedRegisteredRoll。入参：page 会话、清理队列、六位款号。
 * 传给谁：POST /products，引用 seedCategoryId 的返回值。
 * 存什么：一个启用中的四级批次管理成品布产品。
 * 存哪里：product 表，id 入清理队列延后删除。
 */
async function seedProduct(
  page: Page,
  cleanup: DeferredCleanup[],
  productCode: string
): Promise<number> {
  const product = await apiCall<{ id?: number }>(page, 'POST', '/products', {
    code: productCode,
    name: genName('E586成品布'),
    category_id: await seedCategoryId(page),
    unit: '米',
    product_type: PRODUCT_TYPE.finished,
    is_batch_managed: true,
    batch_level: 'four_level',
    is_active: true,
  });
  const productId = Number(product.data?.id);
  expect(productId, `[586] 款号 ${productCode} 建档须回合法 id`).toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}`, '586 product');
  return productId;
}

/**
 * 建齐扫码入库所需的整条前置链，并给出二维码原文与各业务段。
 * 调用方：本文件用例。入参：page 会话、清理队列。传给谁：产品色号、供应商、供应商商品、
 *   供应商色号与 SKU 对照五个建单端点，顺序与 resolve_roll_identity 的解析链一致。
 * 存什么：款号、内部色号、染厂外部色号、缸号、三位匹号与两条库位编码，拼成六位款号 +
 *   七位外部色号 + 缸号 + 三位匹号的二维码原文。存哪里：各建单端点对应的业务表，
 *   子记录与父记录的 id 均入清理队列，flush 时逆序删除。
 */
async function seedRegisteredRoll(page: Page, cleanup: DeferredCleanup[]): Promise<ReceiptSeed> {
  const productCode = uniqueDigits(6);
  const externalColorNo = uniqueDigits(7);
  const dyeLotNo = `JL${uniqueDigits(8)}`;
  const pieceNo = '022';
  const mainPosition = genCode('E586-POS-A');
  const backupPosition = genCode('E586-POS-B');
  const warehouse = await seedWarehouseAndPositions(page, cleanup, [mainPosition, backupPosition]);
  const productId = await seedProduct(page, cleanup, productCode);

  const internalColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/products/${productId}/colors`,
    {
      color_no: `IN-${externalColorNo}`,
      color_name: 'E586 内部色',
      extra_cost: 0,
      is_active: true,
    }
  );
  const productColorId = Number(internalColor.data?.id);
  expect(productColorId, '[586] 内部色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}/colors/${productColorId}`, '586 color');

  const supplier = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: genName('E586供应商'),
    supplier_short_name: 'E586SUP',
    contact_phone: '13800000000',
  });
  const supplierId = Number(supplier.data?.id);
  expect(supplierId, '[586] 供应商创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/suppliers/${supplierId}`, '586 supplier');

  const supplierProduct = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-products',
    {
      supplier_id: supplierId,
      product_code: genCode('E586SP'),
      product_name: genName('E586供应商品'),
      unit: '米',
    }
  );
  const supplierProductId = Number(supplierProduct.data?.id);
  expect(supplierProductId, '[586] 供应商商品创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-products/${supplierProductId}`,
    '586 supplier product'
  );

  const supplierColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-product-colors',
    {
      supplier_product_id: supplierProductId,
      color_no: externalColorNo,
      color_name: 'E586 染厂色',
      extra_cost: '2.50',
    }
  );
  const supplierColorId = Number(supplierColor.data?.id);
  expect(supplierColorId, '[586] 供应商色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-product-colors/${supplierColorId}`,
    '586 supplier color'
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
  expect(mappingId, '[586] SKU 对照创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/sku-mappings/${mappingId}`, '586 sku mapping');

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

test('586-01 扫码入库成功出参逐字段映射并与盘库回读一致', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'admin');
    const seed = await seedRegisteredRoll(page, cleanup);

    await loginAsRole(page, 'warehouse_keeper');
    const receipt = await apiCall<ReceiptRow>(page, 'POST', '/scanner/scan-receipt', {
      barcode: seed.qr,
      position_no: seed.mainPosition,
      length: '100',
      weight: '12.5',
    });
    const row = receipt.data;
    expect(row, '[586-01] 成功登记须回业务数据体').toBeDefined();
    expect(row?.piece_no, '[586-01] 匹号须取二维码末三位').toBe(seed.pieceNo);
    expect(row?.barcode, '[586-01] 条码须为二维码原文').toBe(seed.qr);
    expect(row?.dye_lot_no, '[586-01] 缸号须取二维码缸号段').toBe(seed.dyeLotNo);
    expect(row?.color_no, '[586-01] 色号须落内部色号').toBe(`IN-${seed.externalColorNo}`);
    expect(Number(row?.warehouse_id), '[586-01] 仓库 id 须为正数').toBeGreaterThan(0);
    expect(Number(row?.length), '[586-01] 长度须按数值等价').toBe(100);
    expect(Number(row?.weight), '[586-01] 重量须按数值等价').toBe(12.5);
    expect(row?.position_no, '[586-01] 库位须为登记时指定库位').toBe(seed.mainPosition);
    expect(row?.warehouse_in_at, '[586-01] 入库时间须非空').toEqual(expect.any(String));
    expect(row?.warehouse_in_at, '[586-01] 入库时间不得为空串').not.toBe('');

    const read = (
      await apiCall<InventoryRow>(
        page,
        'GET',
        `/scanner/scan-inventory?barcode=${encodeURIComponent(seed.qr)}`
      )
    ).data;
    expect(read, '[586-01] 盘库回读须命中同一匹').toBeDefined();
    expect(read?.barcode, '[586-01] 回读条码须与入库出参一致').toBe(row?.barcode);
    expect(read?.piece_no, '[586-01] 回读匹号须与入库出参一致').toBe(row?.piece_no);
    expect(Number(read?.warehouse_id), '[586-01] 回读仓库 id 须与入库出参一致').toBe(
      Number(row?.warehouse_id)
    );
    expect(Number(read?.length), '[586-01] 回读长度须与入库出参一致').toBe(Number(row?.length));
    expect(read?.status, '[586-01] 回读状态须为 available').toBe('available');
  } finally {
    // 匹行没有删除端点，成功写入的匹不清理；只清理由本用例创建的 seed 资源
    await flushDeferredCleanups(page, cleanup);
  }
});
