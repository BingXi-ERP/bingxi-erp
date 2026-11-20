// 扫码契约专项（4.36）：以真实生产报工产出的布卷为前置，验证卷码与匹号一一对应、
// 扫码盘库字段映射、扫码发货状态跃迁、重复发货拒绝以及不存在/缺参码的机器码。
// 端点：/scanner/scan-inventory（barcode 必填）、/scanner/scan-to-ship（GET/POST，
// barcode 与 order_id 必填）。出参按 handler 直接序列化的 JSON 逐字段断言，
// 不塞臆造 id，不把 404/400 放宽成健康。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  genName,
  getCtx,
  loginViaUI,
} from './helpers';

interface WarehouseRow {
  id: number;
  warehouse_type: string | null;
}

interface PieceRow {
  id: number;
  piece_no: string;
  barcode: string | null;
  product_id: number;
  status: string;
  length: number | string;
}

interface ScanInventoryRow {
  barcode: string;
  piece_no: string;
  product_id: number;
  batch_no: string;
  warehouse_id: number;
  location_id: number | null;
  length: number | string;
  weight: number | string | null;
  status: string;
  remarks: string | null;
}

interface SeededPiece {
  barcode: string;
  pieceNo: string;
  productId: number;
  orderId: number;
  orderNo: string;
  warehouseId: number;
}

async function seedShippablePiece(page: Page): Promise<SeededPiece> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const productId = ctx.productIds[0];
  const orderId = Number(ctx.salesOrderId);
  expect(productId, '前置：扫码布卷需绑定真实产品').toBeGreaterThan(0);
  expect(orderId, '前置：扫码发货需绑定真实销售订单').toBeGreaterThan(0);

  const warehouses = await apiCallRaw<{ items: WarehouseRow[] }>(
    page,
    'GET',
    '/warehouses?page=1&page_size=200'
  );
  const warehouse = warehouses.items?.find(row => row.warehouse_type !== 'finished');
  expect(warehouse?.id, '前置：需至少一个非成品仓承接报工布卷').toBeTruthy();

  // 单据号由服务端统一生成（PO+yyyyMMdd+序号），请求体不承载单号；断言一律回读服务端真实单号
  const po = await apiCall<{ id?: number; order_no?: string }>(
    page,
    'POST',
    '/production/production-orders/orders',
    { product_id: productId, planned_quantity: 100 }
  );
  expect(po.data?.id, '前置：生产订单应返回真实 id').toBeGreaterThan(0);
  const orderNo = po.data?.order_no;
  if (typeof orderNo !== 'string' || orderNo.length === 0) {
    throw new Error('前置：生产订单未返回服务端生成的真实单号');
  }

  const card = await apiCall<{ id?: number }>(page, 'POST', '/production/flow-cards', {
    production_order_id: po.data!.id,
    product_id: productId,
    product_name: genName('E2E扫码布卷'),
    planned_fabric_weight: 100,
  });
  expect(card.data?.id, '前置：流转卡应返回真实 id').toBeGreaterThan(0);
  await apiCall(page, 'POST', `/production/flow-cards/${card.data!.id}/schedule`, {});
  await apiCall(page, 'POST', `/production/flow-cards/${card.data!.id}/start-preparing`);
  await apiCall(page, 'POST', `/production/flow-cards/${card.data!.id}/complete-preparing`, {
    actual_fabric_weight: 100,
  });

  const step = await apiCall<{ id?: number }>(page, 'POST', '/production/flow-cards/steps/start', {
    flow_card_id: card.data!.id,
  });
  expect(step.data?.id, '前置：工序启动应返回真实 id').toBeGreaterThan(0);

  const pieceNo = `GR-${genCode('SCAN')}-001`;
  await apiCall(page, 'POST', `/production/flow-cards/steps/${step.data!.id}/complete`, {
    actual_quantity: 100,
    qualified_quantity: 100,
    pieces: [
      {
        piece_no: pieceNo,
        machine_no: 'M-E2E-SCAN',
        machine_operator: 'E2E扫码开机人',
        length: 100,
        weight: 50,
        warehouse_id: warehouse!.id,
      },
    ],
  });

  const pieces = await apiCallRaw<{ items: PieceRow[] }>(
    page,
    'GET',
    `/inventory/pieces?piece_no=${encodeURIComponent(pieceNo)}&page=1&page_size=10`
  );
  const row = pieces.items?.find(piece => piece.piece_no === pieceNo);
  expect(row, `前置：报工后应能按匹号 ${pieceNo} 回读布卷`).toBeTruthy();
  expect(row!.status, '前置：新产布卷应为可用状态').toBe('AVAILABLE');
  expect(row!.barcode, '前置：产匹链路应把匹号写为卷码（一码一物）').toBe(pieceNo);
  expect(row!.product_id, '前置：布卷产品应回显本例所用产品').toBe(productId);
  return {
    barcode: row!.barcode!,
    pieceNo,
    productId,
    orderId,
    orderNo,
    warehouseId: warehouse!.id,
  };
}

test.describe('扫码契约：卷码一码一物 + 盘库/发货状态机', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('扫码盘库：本例自建卷码 → 九字段回读一致，缺参与不存在码严格拒绝', async ({ page }) => {
    const piece = await seedShippablePiece(page);

    const scanned = await apiCallRaw<ScanInventoryRow>(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${encodeURIComponent(piece.barcode)}`
    );
    expect(scanned.barcode, '盘库应回显本例卷码').toBe(piece.barcode);
    expect(scanned.piece_no, '卷码应唯一命中本例匹号，不得串成色号').toBe(piece.pieceNo);
    expect(scanned.product_id, '盘库产品应来自布卷行，不得臆造').toBe(piece.productId);
    expect(Number(scanned.length), '盘库米数应来自本例报工长度').toBeCloseTo(100, 2);
    expect(scanned.status, '未发货布卷应为 AVAILABLE').toBe('AVAILABLE');
    expect(scanned.batch_no, '生产匹批次应回显生产单号').toBe(piece.orderNo);
    expect(scanned.warehouse_id, '盘库仓库应回显本例报工仓库').toBe(piece.warehouseId);
    expect(scanned.location_id, '生产报工匹未录库位，应如实回显 null').toBeNull();
    expect(Number(scanned.weight), '盘库重量应来自本例报工重量').toBeCloseTo(50, 2);
    expect(scanned.remarks, '备注应带本例生产单号，证明未写成固定文案').toContain(piece.orderNo);

    const missingParam = await apiCallExpectFail(page, 'GET', '/scanner/scan-inventory?page=1');
    expect(missingParam.status, '缺 barcode 应 400，不得返回空集扮健康').toBe(400);
    expect(failureCode(missingParam), '缺参失败码应为 BAD_REQUEST').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );

    const missingPiece = await apiCallExpectFail(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${encodeURIComponent(genCode('NOBARCODE'))}`
    );
    expect(missingPiece.status, '不存在卷码应 404，不得吞成空集').toBe(404);
    expect(failureCode(missingPiece), '不存在码失败码应为 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
  });

  test('扫码发货：卷码出库一次成功 → 盘库状态跃迁 → 重复扫码被业务拒绝', async ({ page }) => {
    const piece = await seedShippablePiece(page);

    const shipped = await apiCallRaw<{ message: string; barcode: string; piece_no: string }>(
      page,
      'POST',
      '/scanner/scan-to-ship',
      { barcode: piece.barcode, order_id: piece.orderId }
    );
    expect(shipped.message, '发货成功文案应与后端业务契约一致').toBe('布卷扫码出库成功');
    expect(shipped.barcode, '发货回报应带回本例卷码').toBe(piece.barcode);
    expect(shipped.piece_no, '发货回报应命中本例匹号').toBe(piece.pieceNo);

    const afterShip = await apiCallRaw<ScanInventoryRow>(
      page,
      'GET',
      `/scanner/scan-inventory?barcode=${encodeURIComponent(piece.barcode)}`
    );
    expect(afterShip.piece_no, '发货后盘库仍应命中同一卷码对应匹号').toBe(piece.pieceNo);
    expect(afterShip.status, '发货后布卷状态应持久化为 SHIPPED').toBe('SHIPPED');

    const repeatPost = await apiCallExpectFail(page, 'POST', '/scanner/scan-to-ship', {
      barcode: piece.barcode,
      order_id: piece.orderId,
    });
    expect(repeatPost.status, '同卷码二次 POST 发货应被拒，防止重复出库').toBe(400);
    expect(failureCode(repeatPost), '重复发货失败码应为 BAD_REQUEST').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );

    const repeatGet = await apiCallExpectFail(
      page,
      'GET',
      `/scanner/scan-to-ship?barcode=${encodeURIComponent(piece.barcode)}&order_id=${piece.orderId}`
    );
    expect(repeatGet.status, '同卷码二次 GET 发货同样应被拒').toBe(400);
    expect(failureCode(repeatGet), '重复发货失败码应为 BAD_REQUEST').toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
  });
});
