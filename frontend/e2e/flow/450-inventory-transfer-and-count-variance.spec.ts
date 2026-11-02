/**
 * 库存调拨双腿守恒 + 盘盈盘亏反向链路（建单→审批→调出→调入→盘点差异→流水追溯）。
 *
 * 功能：验证一笔库间调拨在同一笔业务里让源库位减少、目标库位增加且调出量等于调入量，
 * 缸号/批次/匹号与米数在调拨后仍逐字符可追溯；验证盘点差异录入并审批后库存数与库存
 * 流水同时变更；未审批的前置动作与库存不足、已完成盘点再改数都必须被后端业务门拒绝。
 * 调用方：Playwright 分片 e2e flow 项目（frontend/playwright.config.ts），由 CI e2e job 执行。
 * 入参：page 会话（admin / warehouse_keeper / accountant 三种岗位）、getCtx() 的实体上下文
 * （productIds/warehouseIds）、quantityMeters 单位米（字符串十进制）、数量断言用整数米。
 * 传给谁：backend inventory_transfer_handler、inventory_count_handler、
 * inventory_stock_handler_query（路由挂载 backend/src/routes/inventory.rs 起）。
 * 存什么：inventory_transfer(_item)、inventory_count(_item)、inventory_stock 的在库量与可用量、
 * inventory_transaction 流水（before/after 米数与 kg）；缺值落库为 NULL 表示未补录，不写 0。
 * 存哪里：PostgreSQL 同名业务表；端点存在性唯一事实来源为 frontend/scripts/route-snapshot.txt。
 *
 * 覆盖端点（路径均为 API_PREFIX=/api/v1/erp 之后部分）：
 *   GET    /inventory/transfers/generate-no
 *   POST   /inventory/transfers
 *   GET    /inventory/transfers/{id}
 *   POST   /inventory/transfers/{id}/approve
 *   POST   /inventory/transfers/{id}/ship
 *   POST   /inventory/transfers/{id}/receive
 *   GET    /inventory/stock
 *   GET    /inventory/stock/transactions
 *   POST   /inventory/counts 、 /inventory/counts/{id}/record 、 /submit 、 /approve
 */
import { test, expect } from '../diagnose-fixture';
import { PERMISSIONS } from '../../src/constants/permissions';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  expectDenied,
  failureCode,
  genCode,
  getCtx,
  isCsrfRejection,
  loginAsRole,
  loginViaUI,
  pickDyeableWarehouse,
  seedDyedOutboundBundle,
  verifyStockFourDim,
  type ApiFailureResult,
} from './helpers';

/**
 * 功能：调拨状态词表常量，比较点必须与写入方逐字符相同（本域为小写词表）。
 * 调用方：本文件各用例的状态断言。
 * 入参：无。
 * 传给谁：expect 比较左值。
 * 存什么：不落库，仅镜像 backend/src/models/status/purchase_inventory.rs
 * `inventory_transfer` 的字面量（该域无 draft、无 in_transit）。
 * 存哪里：不存在数据库。
 */
const TRANSFER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
} as const;

/**
 * 功能：盘点状态词表常量，镜像 backend/src/models/status/purchase_inventory.rs
 * `inventory_count`（小写 pending/in_review/completed，本域没有 in_progress）。
 * 调用方：盘盈盘亏用例的状态断言。
 * 入参：无。
 * 传给谁：expect 比较左值。
 * 存什么：不落库，仅镜像写入方字面量（大小写混用是故意的，禁止顺手统一）。
 * 存哪里：不存在数据库。
 */
const COUNT_STATUS = {
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  COMPLETED: 'completed',
} as const;

/**
 * 功能：库存流水类型常量，镜像 backend/src/services/inv/batch.rs（调出）
 * 与 :1014（调入）写入的 transaction_type 字面量（本域为大写）。
 * 调用方：守恒双腿的流水断言。
 * 入参：无。
 * 传给谁：GET /inventory/stock/transactions 响应行的比较值。
 * 存什么：不落库。
 * 存哪里：inventory_transaction.transaction_type。
 */
const TRANSACTION_TYPE = {
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
} as const;

/**
 * 功能：读取库存行/流水行的十进制字段并转成数字，字段缺失或类型异常即显式判红。
 * 调用方：本文件守恒与盘盈盘亏断言。
 * 入参：row 为 GET /inventory/stock 或 /inventory/stock/transactions 的单行 JSON；
 * field 为后端 InventoryStock / TransactionResponse 的真实 snake_case 列名（米数）；
 * context 为失败定位前缀。
 * 传给谁：调用方的 expect 比较。
 * 存什么：不持久化。
 * 存哪里：无。
 */
function decimalFieldAsNumber(
  row: Record<string, unknown>,
  field: string,
  context: string
): number {
  const raw = row[field];
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(
      `[450] ${context}：字段 ${field} 不是十进制字符串或数字，实际类型=${typeof raw} ` +
        `值=${JSON.stringify(raw)}——响应键以实体/DTO 为准，取不到即判红不兜底`
    );
  }
  const num = Number(raw);
  if (Number.isNaN(num)) {
    throw new Error(`[450] ${context}：字段 ${field}=${JSON.stringify(raw)} 无法解析为数字`);
  }
  return num;
}

/**
 * 功能：断言后端拒绝体是统一失败信封形态（字符串机器码 + message + trace_id），
 * 且不是 5xx 裸崩、不是 CSRF 中间件拒绝。
 * 调用方：非法跃迁、库存不足、已完成盘点再改数三枚负例。
 * 入参：result 为 apiCallExpectFail 的返回（HTTP status + 失败体）；context 为业务前置描述。
 * 传给谁：调用方 expect 判定。
 * 存什么：不持久化。
 * 存哪里：无；失败体产出方为 backend/src/utils/error.rs 的 AppError::into_response。
 */
function expectAppErrorRejection(result: ApiFailureResult, context: string): void {
  const prefix = `${context}：应被后端业务门拒绝`;
  expect(
    result.status,
    `${prefix}（4xx），实际 status=${result.status} code=${JSON.stringify(result.code)} ` +
      `message=${JSON.stringify(result.message)}（5xx 属裸崩、2xx 属未拒绝，均判红）`
  ).toBeGreaterThanOrEqual(400);
  expect(
    result.status,
    `${prefix}（4xx 而非 5xx），实际 status=${result.status} code=${JSON.stringify(result.code)}`
  ).toBeLessThan(500);
  expect(
    isCsrfRejection(result.status, result),
    `${prefix}，实际 403 的 code=${JSON.stringify(result.code)} 属 CSRF 中间件拒绝，` +
      `是会话前置未成立而非权限/业务判定——假绿拦截，勿放宽本断言`
  ).toBe(false);
  const code = failureCode(result);
  expect(
    code,
    `${prefix}：AppError 失败体的 code 必须是字符串机器码，实际 code=${JSON.stringify(result.code)}`
  ).toBeTruthy();
  expect(
    code === APP_ERROR_CODES.NOT_FOUND,
    `${prefix}：拒绝必须由业务状态机/库存校验产出，不能是端点未注册或单据不存在（NOT_FOUND），` +
      `实际 code=${JSON.stringify(code)}——把 404 当健康属假绿`
  ).toBe(false);
  expect(
    typeof result.message === 'string' && result.message.trim().length > 0,
    `${prefix}：失败体必须携带可读 message，实际 message=${JSON.stringify(result.message)}`
  ).toBe(true);
  expect(
    typeof result.trace_id === 'string' && result.trace_id.length > 0,
    `${prefix}：AppError 统一信封必须携带 trace_id，实际 trace_id=${JSON.stringify(result.trace_id)}`
  ).toBe(true);
}

test.describe('库存调拨与盘盈盘亏反向链路', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('调拨单号展示端点仍在线但不参与建单落号（废除族残留取证）', async ({ page }) => {
    const ctx = getCtx();
    const warehouseIds = ctx.warehouseIds;
    if (warehouseIds.length < 2) {
      throw new Error(
        `[450-T1] 前置不成立：ctx.warehouseIds 不足两个（实际 ${warehouseIds.length}）`
      );
    }

    const preview = await apiCallRaw<{ transfer_no?: unknown }>(
      page,
      'GET',
      '/inventory/transfers/generate-no'
    );
    const previewNo = preview.transfer_no;
    if (typeof previewNo !== 'string' || previewNo.length === 0) {
      throw new Error(
        `[450-T1] GET /inventory/transfers/generate-no 未返回非空 transfer_no 字符串，` +
          `实际响应片段=${JSON.stringify(preview).slice(0, 200)}` +
          `（后端 inventory_transfer_handler.rs 用 DocumentNumberGenerator 现生成）`
      );
    }
    expect(previewNo, `单号格式应为 TRF{yyyyMMdd}{3 位流水}，实际 ${previewNo}`).toMatch(
      /^TRF\d{11}$/
    );

    const created = await apiCall<{ id?: number }>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseIds[0],
      to_warehouse_id: warehouseIds[1],
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-DOCNO'),
      items: [],
    });
    const transferId = created.data?.id;
    if (transferId === undefined) {
      throw new Error(
        `[450-T1] 建单未返回 data.id，实际响应片段=${JSON.stringify(created).slice(0, 200)}`
      );
    }

    const persisted = await apiCallRaw<{ transfer_no?: unknown; status?: unknown }>(
      page,
      'GET',
      `/inventory/transfers/${transferId}`
    );
    const persistedNo = persisted.transfer_no;
    if (typeof persistedNo !== 'string' || persistedNo.length === 0) {
      throw new Error(
        `[450-T1] 建单后回读缺少 transfer_no，实际响应片段=${JSON.stringify(persisted).slice(0, 200)}`
      );
    }
    expect(persistedNo, `落库单号应同族 TRF{yyyyMMdd}{3 位流水}，实际 ${persistedNo}`).toMatch(
      /^TRF\d{11}$/
    );

    // 缺陷证据（源码缺陷，本用例不修）：请求体不含 transfer_no 也能建单并落出同族单号，
    // 说明 GET /inventory/transfers/generate-no 只是把后端即时生成的号取出来给人看，
    // 不属于任何写入路径；该端点属已裁定的"单据号展示端点废除族"（方向=废除），
    // 但 frontend/src/api/inventory-transfer.ts 仍在导出并调用它，路由
    // backend/src/routes/inventory.rs 也仍注册——残留未下线。断言只记录真实行为，
    // 不采纳该端点作为建单前置（否则等于把废除对象当正常路径）。
    console.error(
      `[450-T1][缺陷登记] 展示型单号端点仍在线：GET /inventory/transfers/generate-no → ${previewNo}；` +
        `建单未引用它仍落号 ${persistedNo}。前端调用点 frontend/src/api/inventory-transfer.ts，` +
        `后端注册点 backend/src/routes/inventory.rs，属废除族未下线。`
    );
  });

  test('调拨双腿守恒：源库位减、目标库位增、调出量等于调入量且缸号逐字符可追溯', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) {
      throw new Error('[450-T2] 前置不成立：ctx.productIds 为空');
    }
    const source = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: source.id,
      quantityMeters: '1000',
      pieceCount: 1,
      context: '450-T2',
    });
    const dyeLotNo = bundle.dyeLotNo;
    const colorNo = bundle.colorNo;
    const pieceNo = bundle.pieces[0].piece_no;
    const batchNo = String(bundle.stockRow.batch_no);
    if (batchNo !== dyeLotNo) {
      throw new Error(
        `[450-T2] 库存行批次(${batchNo})与缸号(${dyeLotNo})不一致，与染色匹写入方口径` +
          `（piece_domain_service.rs 恒 batch_no=dye_lot_no）矛盾，四维 tuple 必不命中——显式判红`
      );
    }
    const targetWarehouseId = ctx.warehouseIds.find(id => id !== source.id);
    if (targetWarehouseId === undefined) {
      throw new Error('[450-T2] 前置不成立：找不到与调出仓不同的调入仓');
    }

    const sourceBefore = await verifyStockFourDim(page, productId, colorNo, dyeLotNo, {
      batchNo,
      warehouseId: source.id,
    });
    if (sourceBefore === null) {
      throw new Error(`[450-T2] 调拨前源仓 ${source.id} 无该四维库存行，seed 链路断裂`);
    }
    const sourceOnHandBefore = decimalFieldAsNumber(
      sourceBefore,
      'quantity_on_hand',
      `源仓库存行 id=${sourceBefore.id}`
    );
    const targetBefore = await verifyStockFourDim(page, productId, colorNo, dyeLotNo, {
      batchNo,
      warehouseId: targetWarehouseId,
    });

    const transferQty = 5;
    const created = await apiCall<{ id?: number }>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: source.id,
      to_warehouse_id: targetWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-TRF'),
      items: [
        {
          product_id: productId,
          quantity: String(transferQty),
          color_no: colorNo,
          dye_lot_no: dyeLotNo,
          batch_no: batchNo,
          piece_no: pieceNo,
        },
      ],
    });
    const transferId = created.data?.id;
    if (transferId === undefined) {
      throw new Error(
        `[450-T2] 调拨建单未返回 data.id，实际响应片段=${JSON.stringify(created).slice(0, 200)}`
      );
    }

    const pending = await apiCallRaw<{ status?: unknown; transfer_no?: unknown }>(
      page,
      'GET',
      `/inventory/transfers/${transferId}`
    );
    expect(
      pending.status,
      `建单初始状态必须逐字符等于写入方词表值 ${TRANSFER_STATUS.PENDING}` +
        `（purchase_inventory.rs::inventory_transfer），实际 ${JSON.stringify(pending.status)}`
    ).toBe(TRANSFER_STATUS.PENDING);

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/approve`, { approved: true });
    const approved = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/transfers/${transferId}`
    );
    expect(
      approved.status,
      `审批后状态必须逐字符等于 ${TRANSFER_STATUS.APPROVED}，实际 ${JSON.stringify(approved.status)}`
    ).toBe(TRANSFER_STATUS.APPROVED);

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    const shipped = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/transfers/${transferId}`
    );
    expect(
      shipped.status,
      `调出后状态必须逐字符等于 ${TRANSFER_STATUS.SHIPPED}，实际 ${JSON.stringify(shipped.status)}`
    ).toBe(TRANSFER_STATUS.SHIPPED);

    const sourceAfterShip = await verifyStockFourDim(page, productId, colorNo, dyeLotNo, {
      batchNo,
      warehouseId: source.id,
    });
    if (sourceAfterShip === null) {
      throw new Error(`[450-T2] 调出后源仓四维行消失（缸号 ${dyeLotNo}）——扣减写错行，显式判红`);
    }
    const sourceOnHandAfter = decimalFieldAsNumber(
      sourceAfterShip,
      'quantity_on_hand',
      `调出后源仓库存行 id=${sourceAfterShip.id}`
    );
    const sourceDecrement = sourceOnHandBefore - sourceOnHandAfter;
    expect(
      sourceDecrement,
      `源库位应减少 ${transferQty} 米，实际减少 ${sourceDecrement} 米` +
        `（${sourceOnHandBefore}→${sourceOnHandAfter}，缸号 ${dyeLotNo}）`
    ).toBe(transferQty);

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/receive`);
    const received = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/transfers/${transferId}`
    );
    expect(
      received.status,
      `调入后状态必须逐字符等于 ${TRANSFER_STATUS.COMPLETED}，实际 ${JSON.stringify(received.status)}`
    ).toBe(TRANSFER_STATUS.COMPLETED);

    const targetAfter = await verifyStockFourDim(page, productId, colorNo, dyeLotNo, {
      batchNo,
      warehouseId: targetWarehouseId,
    });
    if (targetAfter === null) {
      throw new Error(
        `[450-T2] 调入后目标仓 ${targetWarehouseId} 未生成该四维库存行` +
          `（缸号 ${dyeLotNo}/批次 ${batchNo}）——receive_transfer 的自动建档未生效，显式判红`
      );
    }
    const targetOnHandAfter = decimalFieldAsNumber(
      targetAfter,
      'quantity_on_hand',
      `调入后目标仓库存行 id=${targetAfter.id}`
    );
    const targetIncrement =
      targetBefore === null
        ? targetOnHandAfter
        : targetOnHandAfter -
          decimalFieldAsNumber(
            targetBefore,
            'quantity_on_hand',
            `调拨前目标仓库存行 id=${targetBefore.id}`
          );
    if (targetBefore === null) {
      expect(
        targetOnHandAfter,
        `目标仓该四维 tuple 调拨前无库存行，调入后应恰为 ${transferQty} 米，实际 ${targetOnHandAfter}`
      ).toBe(transferQty);
    }
    expect(
      targetIncrement,
      `调出量必须等于调入量：源仓减 ${sourceDecrement}、目标仓增 ${targetIncrement}（缸号 ${dyeLotNo}）`
    ).toBe(sourceDecrement);

    // 缸号/批次/匹号逐字符可追溯：两库位重读行的维度必须与 bundle 真实落库值完全相同
    expect(String(targetAfter.dye_lot_no), '目标仓行的缸号必须与调拨缸号逐字符相同').toBe(dyeLotNo);
    expect(String(targetAfter.batch_no), '目标仓行的批次必须与调拨批次逐字符相同').toBe(batchNo);
    expect(String(sourceAfterShip.dye_lot_no), '源仓行的缸号必须与调拨缸号逐字符相同').toBe(
      dyeLotNo
    );

    // 双腿守恒的流水侧证据：同一批次号下应同时存在 TRANSFER_OUT（记在源仓）与
    // TRANSFER_IN（记在目标仓），且两笔的扣减/增加米数与库存行变化同值。
    const ledger = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}` +
        `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
    );
    if (!Array.isArray(ledger.items)) {
      throw new Error(
        `[450-T2] GET /inventory/stock/transactions 的 data.items 不是数组，` +
          `实际片段=${JSON.stringify(ledger).slice(0, 200)}`
      );
    }
    const rows = ledger.items as Array<Record<string, unknown>>;
    const outRow = rows.find(
      r =>
        r.transaction_type === TRANSACTION_TYPE.TRANSFER_OUT && Number(r.warehouse_id) === source.id
    );
    const inRow = rows.find(
      r =>
        r.transaction_type === TRANSACTION_TYPE.TRANSFER_IN &&
        Number(r.warehouse_id) === targetWarehouseId
    );
    if (outRow === undefined || inRow === undefined) {
      throw new Error(
        `[450-T2] 批次 ${batchNo} 未同时命中 TRANSFER_OUT(源仓 ${source.id}) 与 ` +
          `TRANSFER_IN(目标仓 ${targetWarehouseId}) 流水，实际类型清单=` +
          `${JSON.stringify(rows.map(r => `${r.transaction_type}@${r.warehouse_id}`)).slice(0, 400)}`
      );
    }
    expect(String(outRow.batch_no), '调出流水的批次号必须与调拨批次逐字符相同').toBe(batchNo);
    expect(String(inRow.batch_no), '调入流水的批次号必须与调拨批次逐字符相同').toBe(batchNo);
    const outDelta =
      decimalFieldAsNumber(outRow, 'quantity_before_meters', 'TRANSFER_OUT 流水行') -
      decimalFieldAsNumber(outRow, 'quantity_after_meters', 'TRANSFER_OUT 流水行');
    const inDelta =
      decimalFieldAsNumber(inRow, 'quantity_after_meters', 'TRANSFER_IN 流水行') -
      decimalFieldAsNumber(inRow, 'quantity_before_meters', 'TRANSFER_IN 流水行');
    expect(outDelta, `调出流水米数应减 ${transferQty}，实际 ${outDelta}`).toBe(transferQty);
    expect(inDelta, `调入流水米数应增 ${transferQty}，实际 ${inDelta}`).toBe(transferQty);
    expect(inDelta, `调出量与调入量必须相等（${outDelta} vs ${inDelta}）`).toBe(outDelta);
  });

  test('非法跃迁与库存不足被后端拒绝，失败体为统一信封形态', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) {
      throw new Error('[450-T3] 前置不成立：ctx.productIds 为空');
    }
    const source = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: source.id,
      quantityMeters: '100',
      pieceCount: 1,
      context: '450-T3',
    });
    const dyeLotNo = bundle.dyeLotNo;
    const batchNo = String(bundle.stockRow.batch_no);
    const pieceNo = bundle.pieces[0].piece_no;
    const targetWarehouseId = ctx.warehouseIds.find(id => id !== source.id);
    if (targetWarehouseId === undefined) {
      throw new Error('[450-T3] 前置不成立：找不到与调出仓不同的调入仓');
    }

    const buildItems = (quantity: string) => [
      {
        product_id: productId,
        quantity,
        color_no: bundle.colorNo,
        dye_lot_no: dyeLotNo,
        batch_no: batchNo,
        piece_no: pieceNo,
      },
    ];

    const pendingTransfer = await apiCall<{ id?: number }>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: source.id,
      to_warehouse_id: targetWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-ILLEGAL'),
      items: buildItems('1'),
    });
    const pendingId = pendingTransfer.data?.id;
    if (pendingId === undefined) {
      throw new Error(
        `[450-T3] 建单未返回 data.id，实际片段=${JSON.stringify(pendingTransfer).slice(0, 200)}`
      );
    }

    // 未审批直接调出：ship_transfer 的状态门只放行 approved（inv/batch.rs 唯一权威落点）
    const illegalShip = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/transfers/${pendingId}/ship`
    );
    expectAppErrorRejection(illegalShip, '未审批的调拨单直接执行出库');

    // 已完成（调入）的单据不得再次调出：走完整链后二次 ship 必被状态机拒绝
    const fullTransfer = await apiCall<{ id?: number }>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: source.id,
      to_warehouse_id: targetWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-REPEAT'),
      items: buildItems('1'),
    });
    const fullId = fullTransfer.data?.id;
    if (fullId === undefined) {
      throw new Error(
        `[450-T3] 全链建单未返回 data.id，实际片段=${JSON.stringify(fullTransfer).slice(0, 200)}`
      );
    }
    await apiCall(page, 'POST', `/inventory/transfers/${fullId}/approve`, { approved: true });
    await apiCall(page, 'POST', `/inventory/transfers/${fullId}/ship`);
    await apiCall(page, 'POST', `/inventory/transfers/${fullId}/receive`);
    const repeatedShip = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/transfers/${fullId}/ship`
    );
    expectAppErrorRejection(repeatedShip, '已完成调拨再次执行出库');
    const repeatedReceive = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/transfers/${fullId}/receive`
    );
    expectAppErrorRejection(repeatedReceive, '已完成调拨再次执行入库');

    // 跨库位数量不足：建单期即按四维预检源仓可用量（inv/batch.rs 出库预检），
    // 请求 999999 米远超 bundle 的 100 米，必须在建单或出库任一门被业务拒绝——
    // 这里钉在建单腿，因为预检发生在 create_transfer 内。
    const insufficient = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: source.id,
      to_warehouse_id: targetWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-INSUF'),
      items: buildItems('999999'),
    });
    expectAppErrorRejection(insufficient, `源仓 ${source.id} 可用库存不足仍建单调出 999999 米`);
  });

  test('盘盈盘亏：差异录入并审批后库存数与流水同时变更，已完成盘点再改数被拒', async ({ page }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    if (productId === undefined) {
      throw new Error('[450-T4] 前置不成立：ctx.productIds 为空');
    }
    const warehouse = await pickDyeableWarehouse(page);
    const bundle = await seedDyedOutboundBundle(page, {
      productId,
      warehouseId: warehouse.id,
      quantityMeters: '200',
      pieceCount: 1,
      context: '450-T4',
    });
    const dyeLotNo = bundle.dyeLotNo;
    const batchNo = String(bundle.stockRow.batch_no);
    const stockId = Number(bundle.stockRow.id);
    if (!Number.isInteger(stockId) || stockId <= 0) {
      throw new Error(`[450-T4] seed 库存行 id 非法：${JSON.stringify(bundle.stockRow.id)}`);
    }

    const before = await verifyStockFourDim(page, productId, bundle.colorNo, dyeLotNo, {
      batchNo,
      warehouseId: warehouse.id,
    });
    if (before === null) {
      throw new Error(`[450-T4] 盘点前该仓库(${warehouse.id})无四维库存行，seed 链路断裂`);
    }
    const qtyBefore = decimalFieldAsNumber(
      before,
      'quantity_available',
      `盘点前库存行 id=${stockId}`
    );

    const countResult = await apiCall<{ id?: number }>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouse.id,
      count_date: new Date().toISOString(),
      notes: genCode('E2E-COUNT'),
    });
    const countId = countResult.data?.id;
    if (countId === undefined) {
      throw new Error(
        `[450-T4] 盘点建单未返回 data.id，实际片段=${JSON.stringify(countResult).slice(0, 200)}`
      );
    }
    const countCreated = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/counts/${countId}`
    );
    expect(
      countCreated.status,
      `盘点建单初始状态必须逐字符等于 ${COUNT_STATUS.PENDING}` +
        `（purchase_inventory.rs::inventory_count 小写词表，本域无 in_progress），` +
        `实际 ${JSON.stringify(countCreated.status)}`
    ).toBe(COUNT_STATUS.PENDING);

    // 盘盈 7 米：后端 RecordItemInput 真实字段 stock_id + quantity_actual（字符串十进制）
    const actualQty = qtyBefore + 7;
    await apiCall(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [
        { stock_id: stockId, quantity_actual: String(actualQty), notes: genCode('E2E-VARIANCE') },
      ],
    });
    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    const submitted = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/counts/${countId}`
    );
    expect(
      submitted.status,
      `提交后状态必须逐字符等于写入方值 ${COUNT_STATUS.IN_REVIEW}（inventory_count_service.rs），` +
        `实际 ${JSON.stringify(submitted.status)}`
    ).toBe(COUNT_STATUS.IN_REVIEW);
    await apiCall(page, 'POST', `/inventory/counts/${countId}/approve`);
    const approvedCount = await apiCallRaw<{ status?: unknown }>(
      page,
      'GET',
      `/inventory/counts/${countId}`
    );
    expect(
      approvedCount.status,
      `审批后状态必须逐字符等于 ${COUNT_STATUS.COMPLETED}（词表无 approved），` +
        `实际 ${JSON.stringify(approvedCount.status)}`
    ).toBe(COUNT_STATUS.COMPLETED);

    const after = await verifyStockFourDim(page, productId, bundle.colorNo, dyeLotNo, {
      batchNo,
      warehouseId: warehouse.id,
    });
    if (after === null) {
      throw new Error(`[450-T4] 盘点审批后库存行消失（缸号 ${dyeLotNo}），显式判红`);
    }
    const qtyAfterAvailable = decimalFieldAsNumber(
      after,
      'quantity_available',
      `盘点后库存行 id=${stockId}`
    );
    const qtyAfterOnHand = decimalFieldAsNumber(
      after,
      'quantity_on_hand',
      `盘点后库存行 id=${stockId}`
    );
    expect(
      qtyAfterAvailable,
      `库存可用量应等于实盘量 ${actualQty}，实际 ${qtyAfterAvailable}`
    ).toBe(actualQty);
    expect(qtyAfterOnHand, `在库量应等于实盘量 ${actualQty}，实际 ${qtyAfterOnHand}`).toBe(
      actualQty
    );
    expect(afterAvailableDyeLot(after), '盘点调整后行的缸号必须与录入时逐字符相同').toBe(dyeLotNo);

    const ledger = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      `/inventory/stock/transactions?product_id=${productId}` +
        `&warehouse_id=${warehouse.id}&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=50`
    );
    if (!Array.isArray(ledger.items)) {
      throw new Error(
        `[450-T4] 差异流水响应 data.items 不是数组，实际片段=${JSON.stringify(ledger).slice(0, 200)}`
      );
    }
    const varianceRows = (ledger.items as Array<Record<string, unknown>>).filter(
      r => decimalFieldAsNumber(r, 'quantity_after_meters', '流水行') === actualQty
    );
    expect(
      varianceRows.length,
      `按缸号/批次 ${batchNo} 追溯应命中实盘后数量为 ${actualQty} 的差异流水，` +
        `实际命中 ${varianceRows.length} 条，清单=` +
        `${JSON.stringify(
          (ledger.items as Array<Record<string, unknown>>).map(
            r => `${r.transaction_type}:${r.quantity_before_meters}→${r.quantity_after_meters}`
          )
        ).slice(0, 400)}`
    ).toBeGreaterThan(0);
    expect(String(varianceRows[0]!.batch_no), '差异流水的批次号必须与盘点缸号逐字符相同').toBe(
      batchNo
    );

    // 已完成盘点再改数：record_count_items 的状态门只放行未审批单据
    const illegalRecord = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/record`,
      {
        items: [{ stock_id: stockId, quantity_actual: String(actualQty + 100) }],
      }
    );
    expectAppErrorRejection(illegalRecord, '已完成盘点的单据再次录入实盘差异');
  });

  test('岗位隔离：仓管可读调拨面，会计岗读与建调拨单均被权限门拦下', async ({ page }) => {
    const ctx = getCtx();
    const warehouseIds = ctx.warehouseIds;
    if (warehouseIds.length < 2) {
      throw new Error(
        `[450-T5] 前置不成立：ctx.warehouseIds 不足两个（实际 ${warehouseIds.length}）`
      );
    }

    await loginAsRole(page, 'warehouse_keeper');
    const keeperList = await apiCallRaw<{ items?: unknown }>(
      page,
      'GET',
      '/inventory/transfers?page=1&page_size=5'
    );
    if (!Array.isArray(keeperList.items)) {
      throw new Error(
        `[450-T5] 仓管（权限键 ${PERMISSIONS.INVENTORY_TRANSFER_READ}）读调拨列表未返回 items 数组，` +
          `实际片段=${JSON.stringify(keeperList).slice(0, 200)}`
      );
    }

    // 同一端点、同一请求体，无权限岗位必须被权限门拒绝（不是 CSRF、不是 404）
    await loginAsRole(page, 'accountant');
    const deniedRead = await apiCallExpectFail(
      page,
      'GET',
      '/inventory/transfers?page=1&page_size=5'
    );
    expectDenied(
      deniedRead,
      `会计岗调用仓管可读的 GET /inventory/transfers（键 ${PERMISSIONS.INVENTORY_TRANSFER_READ}）`
    );
    expect(
      deniedRead.code,
      `403 必须归因到权限门机器码 ${APP_ERROR_CODES.FORBIDDEN}，实际 code=${JSON.stringify(deniedRead.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    const deniedCreate = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseIds[0],
      to_warehouse_id: warehouseIds[1],
      transfer_date: new Date().toISOString(),
      notes: genCode('E2E-SOD'),
      items: [],
    });
    expectDenied(
      deniedCreate,
      `会计岗调用建单端点 POST /inventory/transfers（键 ${PERMISSIONS.TRANSFER_CREATE}）`
    );
    expect(
      deniedCreate.trace_id,
      `权限拒绝同样走 AppError 统一信封，必须携带 trace_id，实际 ${JSON.stringify(deniedCreate.trace_id)}`
    ).toBeTruthy();
  });
});

/**
 * 功能：取盘点调整后库存行的缸号，行内缺该列即显式判红。
 * 调用方：盘盈盘亏用例的缸号追溯断言。
 * 入参：row 为 GET /inventory/stock 命中行（InventoryStock 的 snake_case 键）。
 * 传给谁：调用方的 expect 比较左值。
 * 存什么：不持久化。
 * 存哪里：无（读的是 inventory_stock.dye_lot_no）。
 */
function afterAvailableDyeLot(row: Record<string, unknown>): string {
  const raw = row.dye_lot_no;
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(
      `[450] 盘点后的库存行缺少非空 dye_lot_no（缸号），实际 ${JSON.stringify(raw)}——` +
        `染色布库存行恒有缸号，缺列说明读的不是同一维度行`
    );
  }
  return raw;
}
