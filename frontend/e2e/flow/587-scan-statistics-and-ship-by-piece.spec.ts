/**
 * 扫码统计聚合与按匹号发货的状态三态专项，覆盖尚未被其他用例占用的两个端点。
 *
 * 功能：先钉住 GET /scanner/scan-statistics 五个状态计数的类型与自洽关系，并以一次成功
 *   登记验证可用数与总数同步增长；再用 POST /scanner/ship-by-piece 验证首次发货推进状态、
 *   同匹重复发货被业务拒绝、不存在的匹号按数据面 404 拒绝。
 * 调用方：本文件由 e2e 诊断 fixture 驱动；warehouse_keeper 读统计与发货，admin 建 seed。
 * 入参：统计端点无入参；发货请求带 piece_no 与任意 order_id。seedRegisteredRoll 自建
 *   成品仓、两条库位、产品、内部色号、供应商、供应商商品、外部色号与 SKU 对照。
 * 传给谁：统计交给 scan_statistics 按 inventory_piece 的 status 聚合；发货交给
 *   ship_by_piece_no 按 PieceNo 查行并写 shipped；登记交给 scan_receipt_post。
 * 存什么：统计只读五个计数字段；发货把目标匹的 status 改为 shipped，order_id 被 handler
 *   显式忽略，不建立任何订单关联。存哪里：inventory_piece 表的 status 列。
 *
 * 错误判据：handler 对已 shipped 的行返回 AppError::bad_request，其机器码是 BAD_REQUEST
 *   （utils/error.rs 的 error_code 映射），不是业务错误变体的 BUSINESS_ERROR；未命中匹号
 *   返回 AppError::not_found，机器码 NOT_FOUND、HTTP 404。两处都按实际变体断言，不猜测。
 * 统计是全库聚合，其他 worker 可能并行写入，故先断言五键之和不超过总数，再用同一
 *   worker 内连续两次读做精确增量，避免把并行噪声误判成聚合错误。
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  deferCleanup,
  apiCallRaw,
  failureCode,
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

interface InventoryRow {
  barcode?: string;
  status?: string;
}

const STAT_KEYS = [
  'available_count',
  'shipped_count',
  'defect_count',
  'reserved_count',
  'total_count',
] as const;

type ScanStats = Record<(typeof STAT_KEYS)[number], number>;

function uniqueDigits(length: number): string {
  return Date.now().toString().slice(-length);
}

/**
 * 校验统计出参五键齐备且都是有限数字，缺键或字符串化即判红。
 * 调用方：本文件的 587-01。入参：一次统计出参与位置标签。传给谁：只做本地断言，不外发、不落库。
 * 存什么：无。存哪里：无。
 */
function expectStatShape(stats: ScanStats, label: string): void {
  for (const key of STAT_KEYS) {
    const value = stats[key];
    expect(typeof value, `${label} ${key} 须为数字`).toBe('number');
    expect(Number.isFinite(value), `${label} ${key} 须为有限数`).toBe(true);
  }
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
  expect(id, '[587] 建档需要已种入的产品分类').toBeGreaterThan(0);
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
  const code = genCode('E587WH');
  const warehouse = await apiCall<{ id?: number }>(page, 'POST', '/warehouses', {
    warehouse_name: genName('E587成品仓'),
    warehouse_code: code,
    warehouse_type: 'finished',
  });
  const warehouseId = Number(warehouse.data?.id);
  expect(warehouseId, '[587] 成品仓创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/warehouses/${warehouseId}`, '587 warehouse');

  for (const position of positionCodes) {
    const location = await apiCall<{ id?: number }>(page, 'POST', '/warehouses/locations', {
      warehouse_id: warehouseId,
      location_code: position,
      location_type: 'rack',
    });
    const locationId = Number(location.data?.id);
    expect(locationId, `[587] 库位 ${position} 创建须回合法 id`).toBeGreaterThan(0);
    deferCleanup(
      cleanup,
      'DELETE',
      `/warehouses/locations/${locationId}`,
      `587 location ${position}`
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
    name: genName('E587成品布'),
    category_id: await seedCategoryId(page),
    unit: '米',
    product_type: PRODUCT_TYPE.finished,
    is_batch_managed: true,
    batch_level: 'four_level',
    is_active: true,
  });
  const productId = Number(product.data?.id);
  expect(productId, `[587] 款号 ${productCode} 建档须回合法 id`).toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}`, '587 product');
  return productId;
}

/**
 * 建齐扫码入库所需的整条前置链，并给出二维码原文与各业务段。
 * 调用方：本文件两个用例。入参：page 会话、清理队列。传给谁：产品色号、供应商、供应商商品、
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
  const mainPosition = genCode('E587-POS-A');
  const backupPosition = genCode('E587-POS-B');
  const warehouse = await seedWarehouseAndPositions(page, cleanup, [mainPosition, backupPosition]);
  const productId = await seedProduct(page, cleanup, productCode);

  const internalColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/products/${productId}/colors`,
    {
      color_no: `IN-${externalColorNo}`,
      color_name: 'E587 内部色',
      extra_cost: 0,
      is_active: true,
    }
  );
  const productColorId = Number(internalColor.data?.id);
  expect(productColorId, '[587] 内部色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/products/${productId}/colors/${productColorId}`, '587 color');

  const supplier = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: genName('E587供应商'),
    supplier_short_name: 'E587SUP',
    contact_phone: '13800000000',
  });
  const supplierId = Number(supplier.data?.id);
  expect(supplierId, '[587] 供应商创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/suppliers/${supplierId}`, '587 supplier');

  const supplierProduct = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-products',
    {
      supplier_id: supplierId,
      product_code: genCode('E587SP'),
      product_name: genName('E587供应商品'),
      unit: '米',
    }
  );
  const supplierProductId = Number(supplierProduct.data?.id);
  expect(supplierProductId, '[587] 供应商商品创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-products/${supplierProductId}`,
    '587 supplier product'
  );

  const supplierColor = await apiCall<{ id?: number }>(
    page,
    'POST',
    '/purchase/supplier-product-colors',
    {
      supplier_product_id: supplierProductId,
      color_no: externalColorNo,
      color_name: 'E587 染厂色',
      extra_cost: '2.50',
    }
  );
  const supplierColorId = Number(supplierColor.data?.id);
  expect(supplierColorId, '[587] 供应商色号创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(
    cleanup,
    'DELETE',
    `/purchase/supplier-product-colors/${supplierColorId}`,
    '587 supplier color'
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
  expect(mappingId, '[587] SKU 对照创建须回合法 id').toBeGreaterThan(0);
  deferCleanup(cleanup, 'DELETE', `/purchase/sku-mappings/${mappingId}`, '587 sku mapping');

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

/** 登记一匹，供统计增量与发货状态用例共用；成功出参的匹号必须与 seed 一致。 */
async function registerOne(page: Page, seed: ReceiptSeed): Promise<void> {
  const receipt = await apiCall<{ piece_no?: string }>(page, 'POST', '/scanner/scan-receipt', {
    barcode: seed.qr,
    position_no: seed.mainPosition,
    length: '100',
  });
  expect(receipt.data?.piece_no, '[587] 登记须返回 seed 的三位匹号').toBe(seed.pieceNo);
}

test('587-01 扫码统计五计数自洽且成功登记后可用数与总数各增一', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'warehouse_keeper');
    const before = (await apiCall<ScanStats>(page, 'GET', '/scanner/scan-statistics')).data;
    expectStatShape(before, '[587-01] 登记前统计');
    expect(
      before.available_count + before.shipped_count + before.defect_count + before.reserved_count,
      '[587-01] 各状态计数之和不得超过全库总数'
    ).toBeLessThanOrEqual(before.total_count);

    await loginAsRole(page, 'admin');
    const seed = await seedRegisteredRoll(page, cleanup);
    await loginAsRole(page, 'warehouse_keeper');
    await registerOne(page, seed);

    const after = (await apiCall<ScanStats>(page, 'GET', '/scanner/scan-statistics')).data;
    expectStatShape(after, '[587-01] 登记后统计');
    expect(after.available_count, '[587-01] 可用数须随成功登记增一').toBe(
      before.available_count + 1
    );
    expect(after.total_count, '[587-01] 总数须随成功登记增一').toBe(before.total_count + 1);
  } finally {
    // 匹行没有删除端点，成功写入的匹不清理；只清理由本用例创建的 seed 资源
    await flushDeferredCleanups(page, cleanup);
  }
});

test('587-02 按匹号发货三态：首次推进、重复业务拒绝、缺匹号数据面拒绝', async ({ page }) => {
  const cleanup: DeferredCleanup[] = [];
  try {
    await loginAsRole(page, 'admin');
    const seed = await seedRegisteredRoll(page, cleanup);
    await loginAsRole(page, 'warehouse_keeper');
    await registerOne(page, seed);

    const first = await apiCall(page, 'POST', '/scanner/ship-by-piece', {
      piece_no: seed.pieceNo,
      // handler 把 order_id 收进带下划线的字段显式忽略，任意值都不建立订单关联
      order_id: 99999999,
    });
    expect(first.message, '[587-02] 首次发货须返回成功信封').toEqual(expect.any(String));
    const shipped = (
      await apiCall<InventoryRow>(
        page,
        'GET',
        `/scanner/scan-inventory?barcode=${encodeURIComponent(seed.qr)}`
      )
    ).data;
    expect(shipped?.status, '[587-02] 首次发货后状态须为 shipped').toBe('shipped');

    const duplicate = await apiCallExpectFail(page, 'POST', '/scanner/ship-by-piece', {
      piece_no: seed.pieceNo,
      order_id: 99999999,
    });
    expect(duplicate.status, '[587-02] 重复发货须为 HTTP 400').toBe(400);
    expect(failureCode(duplicate), '[587-02] 重复发货须命中 bad_request 机器码').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
    const stillShipped = (
      await apiCall<InventoryRow>(
        page,
        'GET',
        `/scanner/scan-inventory?barcode=${encodeURIComponent(seed.qr)}`
      )
    ).data;
    expect(stillShipped?.status, '[587-02] 拒绝重复发货后状态仍为 shipped').toBe('shipped');

    // 极长随机数字串不可能与真实匹号相撞，命中数据面查无行的 NOT_FOUND
    const missingPieceNo = `${Date.now()}${Math.floor(Math.random() * 1_000_000_000)}`;
    const missing = await apiCallExpectFail(page, 'POST', '/scanner/ship-by-piece', {
      piece_no: missingPieceNo,
      order_id: 99999999,
    });
    expect(missing.status, '[587-02] 不存在的匹号须为 HTTP 404').toBe(404);
    expect(failureCode(missing), '[587-02] 不存在的匹号须命中 not_found 机器码').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
  } finally {
    // 匹行没有删除端点，成功写入的匹不清理；只清理由本用例创建的 seed 资源
    await flushDeferredCleanups(page, cleanup);
  }
});
