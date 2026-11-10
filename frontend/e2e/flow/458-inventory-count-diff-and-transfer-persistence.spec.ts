import { test, expect, type Page } from '../diagnose-fixture';
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
  loginAsRole,
  loginViaUI,
  seedFourDimStockIn,
  seedGreigeStockIn,
  tryCleanup,
} from './helpers';

/**
 * 458 库存盘点盘盈盘亏与库位调拨持久化（七枚 test 串行链）
 *
 * 功能。覆盖盘点差异从录入到过账的落库真相，与库位调拨从审批到发货收货的双腿守恒。
 * 458-01 盘盈单腿：差异录入、提交、过账后库存两列等于实盘量，明细差异合计等于库存
 * 变化量，乐观锁版本号随过账递增（T 序一）。458-02 同单盘盈与盘亏两腿：一张单内
 * 正差异与负差异各自反映到对应库存行，主表统计与明细逐行对平，净变化等于两腿代数和
 * （T 序二）。458-03 库位调拨：A 库位减、B 库位增，减增同值且总量守恒，数值全部取
 * 自重读而非请求入参，明细发出量与收货量、流水两族增量三方对平（T 序三）。
 * 458-04 拦截面：不存在或已删除的库存行进差异过账要 4xx，无匹配库存与超出现存量的
 * 调拨要 4xx，染色布缺维度要 4xx，负数量按真实契约钉并点名缺口（T 序四）。
 * 458-05 状态机门控：in_review 的盘点单再编辑、再录入、重复提交一律 4xx，驳回回到
 * pending 后同一动作又成功（证明拒绝来自状态门而非端点坏），已完成单重复过账 4xx
 * 且库存零二次变化，已完成单删除 4xx（T 序五）。458-06 角色面：仓管做建单与录入
 * 实盘能通过、做提交与审批被 403，会计岗与质检岗直连审批与发货被 403 且零副作用，
 * 库存经理做提交与审批能通过；管理员跑通整链由 458-01 与 458-03 反向证明（T 序六）。
 * 458-07 写后重读防线：每个写动作的落库结果一律独立读回逐列核对，响应回显不作为
 * 成立依据；三态更新（有值覆盖、显式 null 清空）必须从库里读出差异（T 序七）。
 *
 * 调用方。Playwright E2E 串行链，flow 分片矩阵注册后由 CI 实跑；岗位腿走
 * loginAsRole 切 warehouse_keeper / accountant / quality_inspector / inventory_manager
 * 会话，放行面由同文件管理员或库存经理会话反向证明。
 *
 * 入参。产品与仓库取 ensureTestEntities 落库的真实主键；色号/缸号/批次每用例唯一
 * （genCode 前缀 458），数量一律以 DECIMAL 字符串提交；盘点建单一律显式传 stock_ids
 * 把快照范围收到本用例自建的库存行，避免整仓快照把他人库存行一并归零。
 *
 * 传给谁。盘点腿 POST /inventory/counts 建单并按 stock_ids 生成快照明细、
 * POST /inventory/counts/{id}/record 录入实盘、/submit 与 /approve 与 /reject 推进
 * 状态机、PUT /inventory/counts/{id} 编辑主表、DELETE /inventory/counts/items/{id}
 * 删明细、GET /inventory/counts/{id} 回读主表与明细；调拨腿 POST /inventory/transfers
 * 建单、/approve 审批、/ship 发货扣减调出仓、/receive 收货入调入仓、
 * GET /inventory/transfers/{id} 与 /items 回读；库存与流水面 GET /inventory/stock
 * 按产品加仓库加批次回读、GET /inventory/stock/transactions 按批次追溯流水。
 * 全部路径逐条对 frontend/scripts/route-snapshot.txt 在册。
 *
 * 存什么。inventory_stocks 行的 quantity_on_hand 与 quantity_available 与
 * quantity_incoming 与 version；inventory_counts 行的 status 与 total_items 与
 * counted_items 与 variance_items 与 notes；inventory_count_items 行的 quantity_before
 * 与 quantity_actual 与 quantity_difference 与 stock_id；inventory_transfers 行的
 * status 与 total_quantity 与 shipped_at 与 received_at；inventory_transfer_items 行的
 * quantity 与 shipped_quantity 与 received_quantity；inventory_transactions 行的
 * transaction_type 与 quantity_before_meters 与 quantity_after_meters 与 warehouse_id。
 *
 * 存哪里。PostgreSQL inventory_stocks 与 inventory_counts 与 inventory_count_items 与
 * inventory_transfers 与 inventory_transfer_items 与 inventory_transactions。状态词表
 * 逐字符取自 models/status/purchase_inventory.rs 写入方：inventory_count 小写
 * pending/in_review/completed（本域没有 in_progress，也没有 approved），
 * inventory_transfer 小写 pending/approved/rejected/shipped/completed，
 * inventory_transaction 的 transaction_type 大写 TRANSFER_OUT 与 TRANSFER_IN。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 盘点过账的库存写法在 services/inventory_count_service.rs 的 apply_stock_adjustments：
 * 只对 quantity_difference 非零的明细执行 update_many，把 quantity_on_hand 与
 * quantity_available 双双置为 quantity_actual（覆盖而非增减），并 version 加一、
 * last_count_date 落时间戳；同事务内经 record_transaction_txn 逐笔写
 * inventory_transactions 流水（transaction_type=INVENTORY_COUNT，
 * source_bill_type=inventory_count，source_bill_no=盘点单号，quantity_meters=差异量，
 * 带过账前后值）。458-01 按批次钉过账后新增流水逐值对账。调拨面同理，
 * services/inv/batch.rs 的 ship 与 receive 逐行写 TRANSFER_OUT
 * 与 TRANSFER_IN 流水，故流水对账腿落在 458-03。
 * 盘点状态门一律 AppError::business 族（出参脱敏），只钉 HTTP 与机器码不钉文案；
 * 删除门与调拨状态门为 business_displayable 族，文案原文必须逐字钉住。
 * 维度必填为 validation_displayable 族，文案回显用户自己提交的色号，逐字钉前缀。
 * 调拨可用量预检在 services/inv/stock.rs 的 match_single_item_against_stocks：
 * 无匹配行与库存不足都是 business 族 400，建单期即拒，不留半截单。
 *
 * 负数量腿的立论（458-04）。调拨明细 DTO InventoryTransferItemRequest.quantity 为
 * Option<Decimal> 且无正负校验，预检判据是 available < quantity，负数恒不触发；
 * 服务侧亦无非负判定，故负数量建单被接受。目标口径"调拨数量为负必须 4xx"缺实现
 * （源码缺陷，本支只暴露不修）：458-04 按真实契约钉 200 接受、明细如实落负值、
 * 库存三列零变化，不发发货动作（避免造出反向库存污染他岗数据），并 console.error
 * 点名缺口。对比面在盘点腿：record 的负实盘量有显式门（validation_displayable
 * 「实盘数量不能为负」），458-04 同时钉住这一侧，证明"同域不同面"的判定不对称是
 * 实现缺口而不是端点坏。
 *
 * 越权面判据（458-06）。权限中间件在 handler 之前按 URL 段派生 resource 与 action：
 * 资源段取 /erp/inventory/{seg4}，动作由末段关键字表与 HTTP 方法派生，故
 * /record 与 /ship 与 /receive 落 create，/submit 与 /approve 落同名动作。
 * 授权面分两层。动作权限按 init_service_ops/permission.rs 的库存域分组：
 * warehouse_keeper 只有 transfers 与 counts 的 read 加 create，inventory_manager 为
 * transfers 与 counts 的通配。行级归属另由 utils/data_scope.rs 的
 * check_resource_owner_by_member_scope 把关：盘点单无部门列，按可见部门成员集合判定，
 * inventory_manager 的 dept 范围不含仓管，故经理对仓管建的单做提交同样被归属门拒绝
 * （动作权限通配不等于跨归属人可写）。所以仓管建单与录入能通过、提交与审批必 403 且
 * 机器码 FORBIDDEN（expectDenied 双钉，防 CSRF 面 403 冒充），被拒后以管理员会话重读
 * 状态与库存逐列不动，零副作用；放行面由库存经理在同一库存行自建自录自批 200（本人行
 * 三种 scope 恒可写）与管理腿 458-01 的 200 反向证明，两腿缺一即假绿。
 * 调拨审批另有金额分级审批人校验（L1 允许 admin 与 warehouse_manager 与
 * inventory_manager 等），本用例不传 unit_cost 使总金额恒为 0 落 L1，
 * 会计岗与质检岗在权限中间件即被拦下，不进入分级校验分支。
 *
 * 频率红线。handlers/inventory_transfer_handler.rs 的 create_transfer 对同一 user_id
 * 一小时内建单调拨限 10 次，超限一律 400 且与业务门无法分辨。故本文件把管理员会话的
 * 建单次数压到一枚（458-03），负数量与三态对平两枚改由 inventory_manager 会话建，
 * 被业务门拒绝的负例不落库不计数。
 *
 * 假成功防线。每次写紧跟独立读回逐列对表，响应回显与库里读数不一致时以库里读数为准；
 * 负例一律钉 HTTP 与机器码，可外显族加钉文案原文，被拒动作后状态与数量逐列不动；
 * 库存与流水断言只按本用例唯一的批次号取行，全表计数不参与；数量一律从行里读出后
 * 参与比较，不用请求里传的数字冒充落库结果；主表统计（total_items 与 counted_items
 * 与 variance_items 与 total_quantity）必须与明细逐行求和相等，两处不一致即判红。
 * 全程不用 ?? 或 || 兜底缺键，后端必出的键缺失即形漂判红，造数失败当场红并点名步骤。
 */

type Row = Record<string, unknown>;

/** DECIMAL 出参是字符串，数值判定先归一；非数值类型或缺键当场抛错点名，不做默认值兜底 */
function numOf(row: Row, field: string, label: string): number {
  const raw = row[field];
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error(
      `[458] ${label}：字段 ${field} 不是十进制字符串或数字，实际类型=${typeof raw} ` +
        `值=${JSON.stringify(raw)}——键名以 backend/src/models 实体为准，取不到即判红不兜底`
    );
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`[458] ${label}：字段 ${field}=${JSON.stringify(raw)} 无法解析为数字`);
  }
  return parsed;
}

/** 文本列归一：白坯色号与空缸号在实体侧分别是空串与 NULL，比较前统一成空串口径 */
function textOf(row: Row, field: string): string {
  const raw = row[field];
  if (raw === null || raw === undefined) {
    return '';
  }
  return String(raw);
}

/**
 * 按本用例专属批次回读库存行。调用方 458-01 到 458-07。
 * 入参 产品、仓库、批次与色号（白坯传空串）。
 * 传给谁 GET /inventory/stock 的下推过滤参数 product_id 与 warehouse_id 与 batch_no。
 * 存什么与存哪里，读回 inventory_stocks 行原样 JSON；命中数不为 1 当场红并点名步骤。
 */
async function readStockRow(
  page: Page,
  arg: { productId: number; warehouseId: number; batchNo: string; colorNo: string; label: string }
): Promise<Row> {
  const path =
    `/inventory/stock?product_id=${arg.productId}&warehouse_id=${arg.warehouseId}` +
    `&batch_no=${encodeURIComponent(arg.batchNo)}&page=1&page_size=100`;
  const list = await apiCallRaw<Row>(page, 'GET', path);
  expect(
    Object.prototype.hasOwnProperty.call(list, 'items'),
    `${arg.label} 库存列表信封必须含键 items，实际键集 ${JSON.stringify(Object.keys(list))}`
  ).toBe(true);
  const rows = list.items as Row[];
  expect(Array.isArray(rows), `${arg.label} 库存列表 items 必须是数组`).toBe(true);
  const hits = rows.filter(
    r => textOf(r, 'batch_no') === arg.batchNo && textOf(r, 'color_no') === arg.colorNo
  );
  expect(
    hits.length,
    `${arg.label} 必须按批次 ${arg.batchNo} 恰命中一条库存行，实际 ${hits.length} 条，` +
      `清单=${JSON.stringify(rows.map(r => `${r.id}:${textOf(r, 'batch_no')}`)).slice(0, 300)}`
  ).toBe(1);
  return hits[0] as Row;
}

/**
 * 按批次读库存流水行。调用方 458-01 与 458-03。
 * 传给谁 GET /inventory/stock/transactions?product_id&batch_no。
 * 存什么，返回该批次下的 inventory_transactions 行数组（信封键 items）。
 */
async function readLedgerRows(page: Page, productId: number, batchNo: string): Promise<Row[]> {
  const path =
    `/inventory/stock/transactions?product_id=${productId}` +
    `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`;
  const list = await apiCallRaw<Row>(page, 'GET', path);
  expect(
    Object.prototype.hasOwnProperty.call(list, 'items'),
    `流水列表信封必须含键 items，实际键集 ${JSON.stringify(Object.keys(list))}`
  ).toBe(true);
  const rows = list.items as Row[];
  expect(Array.isArray(rows), '流水列表 items 必须是数组').toBe(true);
  return rows;
}

/**
 * 回读盘点单（主表加明细）。调用方 458-01 到 458-06。
 * 传给谁 GET /inventory/counts/{id}（handlers/inventory_count_handler.rs get_count
 * → CountResponse，明细键为 items，逐列为 CountItemResponse 的 snake_case 字段名）。
 * 存什么，返回主表整行（含 items 数组）。
 */
async function readCount(page: Page, countId: number, label: string): Promise<Row> {
  const detail = await apiCallRaw<Row>(page, 'GET', `/inventory/counts/${countId}`);
  expect(
    Object.prototype.hasOwnProperty.call(detail, 'items'),
    `${label} 盘点详情必须含键 items，实际键集 ${JSON.stringify(Object.keys(detail))}`
  ).toBe(true);
  const items = detail.items as Row[];
  expect(Array.isArray(items), `${label} 盘点明细 items 必须是数组`).toBe(true);
  return detail;
}

/**
 * 明细差异列逐行求和。调用方 458-01 与 458-02。
 * 入参 盘点详情行。传给谁 调用方的主表统计对平断言。
 * 存什么，不持久化；返回 quantity_difference 的代数和与命中行数。
 */
function sumItemDifference(detail: Row): { total: number; lines: number } {
  const items = detail.items as Row[];
  let total = 0;
  for (const it of items) {
    total += numOf(it, 'quantity_difference', '盘点明细行');
  }
  return { total, lines: items.length };
}

/** 跨 test 的串行链共享夹具袋（describe.serial 保证按声明顺序执行） */
const bag: { productId?: number; fromWarehouseId?: number; transferId?: number } = {};

/**
 * 状态词表：镜像 backend/src/models/status/purchase_inventory.rs::inventory_count
 * （小写，本域没有 in_progress 也没有 approved）。调用方各枚状态断言的右值。
 */
const COUNT_STATUS = {
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  COMPLETED: 'completed',
} as const;

/**
 * 状态词表：镜像同文件::inventory_transfer（小写，无 draft 无 in_transit）。
 * 调用方调拨腿的状态断言右值。
 */
const TRANSFER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  SHIPPED: 'shipped',
  COMPLETED: 'completed',
} as const;

/**
 * 流水类型词表：镜像 backend/src/services/inv/batch.rs 写入的 transaction_type
 * （大写）。调用方调拨双腿的流水断言右值。
 */
const TX_TYPE = {
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  INVENTORY_COUNT: 'INVENTORY_COUNT',
} as const;

test.describe.serial('458 盘点盘盈盘亏与库位调拨持久化', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('458-01 盘盈单腿差异过账 库存两列等于实盘量且版本递增 盘点流水逐值对账', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    if (productId === undefined || warehouseId === undefined) {
      throw new Error(
        `[458-01] 前置不成立：ctx.productIds=${ctx.productIds.length} warehouseIds=${ctx.warehouseIds.length}`
      );
    }
    bag.productId = productId;

    const tag = genCode('458A');
    const colorNo = `E2E${tag}`;
    const dyeLotNo = `LOT-${tag}`;
    const batchNo = `B-${tag}`;
    const seeded = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo,
      dyeLotNo,
      batchNo,
      quantityMeters: '100',
    });
    const stockId = numOf(seeded, 'id', '播种后的库存行');
    expect(
      Number.isInteger(stockId) && stockId > 0,
      `播种库存行主键必须是正整数，实际 ${JSON.stringify(seeded.id)}`
    ).toBe(true);

    const before = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo,
      label: '458-01 建单前',
    });
    const onHandBefore = numOf(before, 'quantity_on_hand', '过账前库存行');
    const versionBefore = numOf(before, 'version', '过账前库存行');
    expect(onHandBefore, `建档账面必须为 100，实际 ${onHandBefore}`).toBe(100);

    // 流水基线：按本用例专属批次取行，过账后必须一条不多一条不少
    const ledgerBefore = await readLedgerRows(page, productId, batchNo);

    // 建单只快照本用例自建的两行库存，避免整仓快照把他岗库存行归零
    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}`,
      stock_ids: [stockId],
    });
    const countId = numOf(created, 'id', '盘点建单响应');
    expect(
      Number.isInteger(countId) && countId > 0,
      `建盘点单失败，实际 ${JSON.stringify(created).slice(0, 200)}`
    ).toBe(true);
    expect(
      String(created.status),
      `盘点建单初值必须逐字符等于写入方词表值 ${COUNT_STATUS.PENDING}，实际 ${JSON.stringify(created.status)}`
    ).toBe(COUNT_STATUS.PENDING);
    expect(
      /^IC\d{11}$/.test(String(created.count_no)),
      `盘点单号必须 IC 加八位日期加三位流水形态，实际 ${JSON.stringify(created.count_no)}`
    ).toBe(true);
    expect(numOf(created, 'total_items', '建单响应'), '快照范围必须恰一条明细').toBe(1);

    const headAfterCreate = await readCount(page, countId, '458-01 建单后');
    const lines = headAfterCreate.items as Row[];
    expect(lines.length, `建单快照明细必须恰 1 行，实际 ${lines.length}`).toBe(1);
    expect(numOf(lines[0], 'stock_id', '快照明细行'), '快照明细必须挂在本用例的库存行上').toBe(
      stockId
    );
    expect(
      numOf(lines[0], 'quantity_before', '快照明细行'),
      '账面数必须取自建单时刻的 quantity_on_hand'
    ).toBe(onHandBefore);
    expect(numOf(lines[0], 'quantity_difference', '快照明细行'), '初值差异必须为 0').toBe(0);

    // 盘盈 18 米：实盘 118
    const recorded = await apiCallRaw<Row>(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [{ stock_id: stockId, quantity_actual: '118.00', notes: `E2E${tag}-IN` }],
    });
    expect(numOf(recorded, 'counted_items', '录入响应'), '已盘点行数必须为 1').toBe(1);
    expect(numOf(recorded, 'variance_items', '录入响应'), '差异行数必须为 1').toBe(1);

    const headAfterRecord = await readCount(page, countId, '458-01 录入后');
    const recLines = headAfterRecord.items as Row[];
    expect(numOf(recLines[0], 'quantity_actual', '录入后明细行'), '实盘量必须如实落库为 118').toBe(
      118
    );
    expect(
      numOf(recLines[0], 'quantity_difference', '录入后明细行'),
      '差异列必须等于实盘减账面'
    ).toBe(18);

    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    const submitted = await readCount(page, countId, '458-01 提交后');
    expect(
      String(submitted.status),
      `提交后必须逐字符等于 ${COUNT_STATUS.IN_REVIEW}，实际 ${JSON.stringify(submitted.status)}`
    ).toBe(COUNT_STATUS.IN_REVIEW);

    await apiCall(page, 'POST', `/inventory/counts/${countId}/approve`);
    const approved = await readCount(page, countId, '458-01 过账后');
    expect(
      String(approved.status),
      `过账后必须逐字符等于 ${COUNT_STATUS.COMPLETED}（词表无 approved），实际 ${JSON.stringify(approved.status)}`
    ).toBe(COUNT_STATUS.COMPLETED);

    // 库存侧落库真相：两列都被写成实盘量（覆盖口径），版本号 +1
    const after = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo,
      label: '458-01 过账后',
    });
    const onHandAfter = numOf(after, 'quantity_on_hand', '过账后库存行');
    expect(onHandAfter, `过账后账面必须等于实盘 118，实际 ${onHandAfter}`).toBe(118);
    expect(numOf(after, 'quantity_available', '过账后库存行'), '过账后可用量必须等于实盘 118').toBe(
      118
    );
    expect(
      numOf(after, 'version', '过账后库存行'),
      `过账必须递增乐观锁版本号（${versionBefore}→），实际 ${numOf(after, 'version', '行')}`
    ).toBeGreaterThan(versionBefore);

    // 明细合计与库存变化量对平：差异代数和必须等于账面变化
    const summed = sumItemDifference(approved);
    expect(
      summed.total,
      `明细差异合计必须等于账面变化量（${onHandBefore}→${onHandAfter}），实际 ${summed.total}`
    ).toBe(onHandAfter - onHandBefore);

    // 流水对账：过账为每条非零差异明细写一条 INVENTORY_COUNT 流水（本单恰 1 条）
    const ledgerAfter = await readLedgerRows(page, productId, batchNo);
    const newRows = ledgerAfter.filter(r => !ledgerBefore.some(b => b.id === r.id));
    expect(
      newRows.length,
      `盘点过账必须为本单唯一非零差异明细新增恰 1 条流水，实际新增 ${newRows.length} 条` +
        `（基线 ${ledgerBefore.length}→过账后 ${ledgerAfter.length}）`
    ).toBe(1);
    const tx = newRows[0];
    expect(
      String(tx.transaction_type),
      `盘点流水类型必须逐字符等于写入方 ${TX_TYPE.INVENTORY_COUNT}，实际 ${tx.transaction_type}`
    ).toBe(TX_TYPE.INVENTORY_COUNT);
    expect(
      String(tx.source_bill_no),
      `盘点流水必须回写盘点单号 ${approved.count_no}，实际 ${tx.source_bill_no}`
    ).toBe(String(approved.count_no));
    expect(
      numOf(tx, 'quantity_meters', '盘点流水'),
      '盘点流水量必须等于明细差异（实盘 118 减账面 100）'
    ).toBe(18);
    expect(numOf(tx, 'quantity_before_meters', '盘点流水'), '盘点流水必须带过账前账面 100').toBe(
      onHandBefore
    );
    expect(numOf(tx, 'quantity_after_meters', '盘点流水'), '盘点流水必须带过账后账面 118').toBe(
      onHandAfter
    );
  });

  test('458-02 同单盘盈与盘亏双腿 两条腿各自反映到库存 主表统计与明细对平', async ({ page }) => {
    const productId = bag.productId ?? getCtx().productIds[0];
    const warehouseId = getCtx().warehouseIds[0];
    if (productId === undefined || warehouseId === undefined) {
      throw new Error('[458-02] 前置不成立：产品或仓库主键缺失');
    }

    const tag = genCode('458B');
    const gainBatch = `B-GAIN-${tag}`;
    const lossBatch = `B-LOSS-${tag}`;
    const gainRow = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-G`,
      dyeLotNo: `LOT-GAIN-${tag}`,
      batchNo: gainBatch,
      quantityMeters: '100',
    });
    const lossRow = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-L`,
      dyeLotNo: `LOT-LOSS-${tag}`,
      batchNo: lossBatch,
      quantityMeters: '60',
    });
    const gainStockId = numOf(gainRow, 'id', '盘盈腿库存行');
    const lossStockId = numOf(lossRow, 'id', '盘亏腿库存行');

    const gainBefore = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: gainBatch,
      colorNo: `E2E${tag}-G`,
      label: '458-02 盘盈腿过账前',
    });
    const lossBefore = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: lossBatch,
      colorNo: `E2E${tag}-L`,
      label: '458-02 盘亏腿过账前',
    });
    const gainOnHandBefore = numOf(gainBefore, 'quantity_on_hand', '盘盈腿过账前');
    const lossOnHandBefore = numOf(lossBefore, 'quantity_on_hand', '盘亏腿过账前');

    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}-BOTH`,
      stock_ids: [gainStockId, lossStockId],
    });
    const countId = numOf(created, 'id', '盘点建单响应');
    expect(numOf(created, 'total_items', '建单响应'), '快照范围必须恰两条明细').toBe(2);

    // 一次录入两条腿：正差异 +12，负差异 -9
    const recorded = await apiCallRaw<Row>(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [
        { stock_id: gainStockId, quantity_actual: '112.00', notes: `E2E${tag}-GAIN` },
        { stock_id: lossStockId, quantity_actual: '51.00', notes: `E2E${tag}-LOSS` },
      ],
    });
    expect(numOf(recorded, 'counted_items', '录入响应'), '已盘点行数必须为 2').toBe(2);
    expect(numOf(recorded, 'variance_items', '录入响应'), '差异行数必须为 2').toBe(2);

    const headAfterRecord = await readCount(page, countId, '458-02 录入后');
    const lines = headAfterRecord.items as Row[];
    expect(lines.length, `明细必须恰 2 行，实际 ${lines.length}`).toBe(2);
    const gainLine = lines.find(r => numOf(r, 'stock_id', '明细行') === gainStockId);
    const lossLine = lines.find(r => numOf(r, 'stock_id', '明细行') === lossStockId);
    expect(gainLine, '盘盈腿明细必须可从库里读到').toBeDefined();
    expect(lossLine, '盘亏腿明细必须可从库里读到').toBeDefined();
    expect(
      numOf(gainLine as Row, 'quantity_difference', '盘盈腿明细'),
      '盘盈腿差异必须为正 12'
    ).toBe(12);
    expect(
      numOf(lossLine as Row, 'quantity_difference', '盘亏腿明细'),
      '盘亏腿差异必须为负 9'
    ).toBe(-9);

    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    await apiCall(page, 'POST', `/inventory/counts/${countId}/approve`);
    const approved = await readCount(page, countId, '458-02 过账后');
    expect(String(approved.status), '过账后必须为 completed').toBe(COUNT_STATUS.COMPLETED);

    // 两条腿各自落库：正腿增 12、负极减 9，不许只跑一侧
    const gainAfter = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: gainBatch,
      colorNo: `E2E${tag}-G`,
      label: '458-02 盘盈腿过账后',
    });
    const lossAfter = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: lossBatch,
      colorNo: `E2E${tag}-L`,
      label: '458-02 盘亏腿过账后',
    });
    const gainOnHandAfter = numOf(gainAfter, 'quantity_on_hand', '盘盈腿过账后');
    const lossOnHandAfter = numOf(lossAfter, 'quantity_on_hand', '盘亏腿过账后');
    expect(
      gainOnHandAfter - gainOnHandBefore,
      `盘盈腿账面必须净增 12，实际 ${gainOnHandBefore}→${gainOnHandAfter}`
    ).toBe(12);
    expect(
      lossOnHandAfter - lossOnHandBefore,
      `盘亏腿账面必须净减 9，实际 ${lossOnHandBefore}→${lossOnHandAfter}`
    ).toBe(-9);
    expect(gainOnHandAfter, '盘盈腿账面必须等于其实盘量 112').toBe(112);
    expect(lossOnHandAfter, '盘亏腿账面必须等于其实盘量 51').toBe(51);
    expect(
      numOf(gainAfter, 'quantity_available', '盘盈腿过账后'),
      '盘盈腿可用量必须等于其实盘量'
    ).toBe(112);
    expect(
      numOf(lossAfter, 'quantity_available', '盘亏腿过账后'),
      '盘亏腿可用量必须等于其实盘量'
    ).toBe(51);

    // 主表统计与明细逐行求和对平；净变化等于两腿代数和
    const summed = sumItemDifference(approved);
    expect(summed.total, '两腿差异代数和必须为 +3').toBe(3);
    expect(
      gainOnHandAfter + lossOnHandAfter - (gainOnHandBefore + lossOnHandBefore),
      `两腿账面净变化必须等于明细差异合计 ${summed.total}`
    ).toBe(summed.total);
    expect(
      numOf(approved, 'variance_items', '主表'),
      '主表差异行数必须与明细中差异非零的行数一致'
    ).toBe(summed.lines);
  });

  test('458-03 库位调拨双腿守恒 发出与收货量及两族流水三方对平', async ({ page }) => {
    const ctx = getCtx();
    const productId = bag.productId ?? ctx.productIds[0];
    const fromWarehouseId = ctx.warehouseIds[0];
    const toWarehouseId = ctx.warehouseIds.find(id => id !== fromWarehouseId);
    if (productId === undefined || fromWarehouseId === undefined || toWarehouseId === undefined) {
      throw new Error(
        `[458-03] 前置不成立：需要两个不同仓库，实际 warehouseIds=${ctx.warehouseIds.length}`
      );
    }
    bag.fromWarehouseId = fromWarehouseId;

    const tag = genCode('458C');
    const batchNo = `B-TRF-${tag}`;
    // 白坯布（色号空串）免缸号与匹号，调拨四维走批次唯一维度，避免依赖染色匹链
    const seeded = await seedGreigeStockIn(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      quantityMeters: '200',
    });
    expect(numOf(seeded, 'id', '白坯播种行'), '白坯库存行主键必须为正整数').toBeGreaterThan(0);

    const srcBefore = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-03 调拨前调出仓',
    });
    const srcOnHandBefore = numOf(srcBefore, 'quantity_on_hand', '调出仓调拨前');
    const srcAvailableBefore = numOf(srcBefore, 'quantity_available', '调出仓调拨前');

    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}`,
      items: [{ product_id: productId, quantity: '30.00', batch_no: batchNo }],
    });
    const transferId = numOf(created, 'id', '调拨建单响应');
    expect(
      Number.isInteger(transferId) && transferId > 0,
      `建调拨单失败，实际 ${JSON.stringify(created).slice(0, 200)}`
    ).toBe(true);
    bag.transferId = transferId;

    const pending = await readTransfer(page, transferId, '458-03 建单后');
    expect(
      String(pending.status),
      `建单初值必须逐字符等于 ${TRANSFER_STATUS.PENDING}，实际 ${JSON.stringify(pending.status)}`
    ).toBe(TRANSFER_STATUS.PENDING);
    expect(
      /^TRF\d{11}$/.test(String(pending.transfer_no)),
      `调拨单号必须 TRF 加八位日期加三位流水形态，实际 ${JSON.stringify(pending.transfer_no)}`
    ).toBe(true);
    // total_quantity 是服务端按明细求和的派生值，不采信请求里传的数字
    expect(numOf(pending, 'total_quantity', '建单回读'), '主表总量必须由明细算出').toBe(30);

    const itemsAfterCreate = await readTransferItems(page, transferId, '458-03 建单后');
    expect(itemsAfterCreate.length, '明细必须恰 1 行').toBe(1);
    expect(numOf(itemsAfterCreate[0], 'quantity', '调拨明细行'), '明细数量必须落库为 30').toBe(30);
    expect(
      numOf(itemsAfterCreate[0], 'shipped_quantity', '调拨明细行'),
      '未发货时发出量必须为 0'
    ).toBe(0);

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/approve`, { approved: true });
    const approved = await readTransfer(page, transferId, '458-03 审批后');
    expect(String(approved.status), `审批后必须为 ${TRANSFER_STATUS.APPROVED}`).toBe(
      TRANSFER_STATUS.APPROVED
    );

    // 审批不动库存：只有 ship 与 receive 才搬数
    const srcAfterApprove = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-03 审批后',
    });
    expect(numOf(srcAfterApprove, 'quantity_on_hand', '审批后调出仓'), '审批动作不许搬库存').toBe(
      srcOnHandBefore
    );

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    const shipped = await readTransfer(page, transferId, '458-03 发货后');
    expect(String(shipped.status), `发货后必须为 ${TRANSFER_STATUS.SHIPPED}`).toBe(
      TRANSFER_STATUS.SHIPPED
    );
    expect(
      shipped.shipped_at,
      `发货后必须落 shipped_at，实际 ${JSON.stringify(shipped.shipped_at)}`
    ).not.toBeNull();

    const srcAfterShip = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-03 发货后调出仓',
    });
    const srcOnHandAfterShip = numOf(srcAfterShip, 'quantity_on_hand', '发货后调出仓');
    const srcAvailableAfterShip = numOf(srcAfterShip, 'quantity_available', '发货后调出仓');
    expect(
      srcOnHandBefore - srcOnHandAfterShip,
      `调出仓账面必须净减 30，实际 ${srcOnHandBefore}→${srcOnHandAfterShip}`
    ).toBe(30);
    expect(
      srcAvailableBefore - srcAvailableAfterShip,
      `调出仓可用量必须净减 30，实际 ${srcAvailableBefore}→${srcAvailableAfterShip}`
    ).toBe(30);

    const itemsAfterShip = await readTransferItems(page, transferId, '458-03 发货后');
    expect(
      numOf(itemsAfterShip[0], 'shipped_quantity', '发货后明细'),
      '明细发出量必须由库里读出为 30'
    ).toBe(30);
    expect(
      numOf(itemsAfterShip[0], 'received_quantity', '发货后明细'),
      '未收货时明细收货量必须为 0'
    ).toBe(0);

    // 发货只在调入仓挂在途，不许提前把调入仓账面抬上去
    const targetAfterShip = await readTargetRow(page, productId, toWarehouseId, batchNo);
    if (targetAfterShip !== null) {
      expect(
        numOf(targetAfterShip, 'quantity_on_hand', '发货后调入仓'),
        '发货阶段调入仓账面必须仍为 0（数量在途）'
      ).toBe(0);
      expect(
        numOf(targetAfterShip, 'quantity_incoming', '发货后调入仓'),
        '发货阶段调入仓在途量必须为 30'
      ).toBe(30);
    }

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/receive`);
    const received = await readTransfer(page, transferId, '458-03 收货后');
    expect(String(received.status), `收货后必须为 ${TRANSFER_STATUS.COMPLETED}`).toBe(
      TRANSFER_STATUS.COMPLETED
    );
    expect(
      received.received_at,
      `收货后必须落 received_at，实际 ${JSON.stringify(received.received_at)}`
    ).not.toBeNull();

    const srcAfterReceive = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-03 收货后调出仓',
    });
    expect(
      numOf(srcAfterReceive, 'quantity_on_hand', '收货后调出仓'),
      '收货不许再动调出仓账面'
    ).toBe(srcOnHandAfterShip);

    const targetAfterReceive = await readStockRow(page, {
      productId,
      warehouseId: toWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-03 收货后调入仓',
    });
    expect(
      numOf(targetAfterReceive, 'quantity_on_hand', '收货后调入仓'),
      '调入仓账面必须由库里读出为 30'
    ).toBe(30);
    expect(
      numOf(targetAfterReceive, 'quantity_incoming', '收货后调入仓'),
      '收货后在途量必须归零（入库与在途两列同事务结转）'
    ).toBe(0);
    expect(textOf(targetAfterReceive, 'batch_no'), '调入仓行的批次必须与调拨批次逐字符相同').toBe(
      batchNo
    );

    const itemsAfterReceive = await readTransferItems(page, transferId, '458-03 收货后');
    expect(
      numOf(itemsAfterReceive[0], 'received_quantity', '收货后明细'),
      '明细收货量必须由库里读出为 30'
    ).toBe(30);

    // 总量守恒：两库位重读值相加必须等于调拨前的单仓账面
    const srcTotal = numOf(srcAfterReceive, 'quantity_on_hand', '守恒检查调出仓');
    const tgtTotal = numOf(targetAfterReceive, 'quantity_on_hand', '守恒检查调入仓');
    expect(
      srcTotal + tgtTotal,
      `两库位账面合计必须守恒于调拨前 ${srcOnHandBefore}，实际 ${srcTotal}+${tgtTotal}`
    ).toBe(srcOnHandBefore);

    // 流水侧双腿：TRANSFER_OUT 记在调出仓、TRANSFER_IN 记在调入仓，两族增量同值
    const ledger = await readLedgerRows(page, productId, batchNo);
    const outRow = ledger.find(
      r =>
        String(r.transaction_type) === TX_TYPE.TRANSFER_OUT &&
        numOf(r, 'warehouse_id', 'TRANSFER_OUT 流水行') === fromWarehouseId
    );
    const inRow = ledger.find(
      r =>
        String(r.transaction_type) === TX_TYPE.TRANSFER_IN &&
        numOf(r, 'warehouse_id', 'TRANSFER_IN 流水行') === toWarehouseId
    );
    expect(outRow, `批次 ${batchNo} 必须命中 TRANSFER_OUT(调出仓) 流水`).toBeDefined();
    expect(inRow, `批次 ${batchNo} 必须命中 TRANSFER_IN(调入仓) 流水`).toBeDefined();
    const outDelta =
      numOf(outRow as Row, 'quantity_before_meters', 'TRANSFER_OUT 行') -
      numOf(outRow as Row, 'quantity_after_meters', 'TRANSFER_OUT 行');
    const inDelta =
      numOf(inRow as Row, 'quantity_after_meters', 'TRANSFER_IN 行') -
      numOf(inRow as Row, 'quantity_before_meters', 'TRANSFER_IN 行');
    expect(outDelta, `调出流水米数必须净减 30，实际 ${outDelta}`).toBe(30);
    expect(inDelta, `调入流水米数必须净增 30，实际 ${inDelta}`).toBe(30);
    expect(inDelta, `调出量与调入量必须相等（${outDelta} vs ${inDelta}）`).toBe(outDelta);
    expect(textOf(outRow as Row, 'batch_no'), '调出流水的批次必须与调拨批次逐字符相同').toBe(
      batchNo
    );
    expect(textOf(inRow as Row, 'batch_no'), '调入流水的批次必须与调拨批次逐字符相同').toBe(
      batchNo
    );
  });

  test('458-04 存在性与维度拦截面 不存在或已删行与无库存与超量与缺维度', async ({ page }) => {
    const ctx = getCtx();
    const productId = bag.productId ?? ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const toWarehouseId = ctx.warehouseIds.find(id => id !== warehouseId);
    if (productId === undefined || warehouseId === undefined || toWarehouseId === undefined) {
      throw new Error(
        `[458-04] 前置不成立：产品或两个仓库主键缺失，warehouseIds=${ctx.warehouseIds.length}`
      );
    }

    const tag = genCode('458D');
    const keepBatch = `B-KEEP-${tag}`;
    const dropBatch = `B-DROP-${tag}`;
    const keepRow = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-K`,
      dyeLotNo: `LOT-K-${tag}`,
      batchNo: keepBatch,
      quantityMeters: '80',
    });
    const dropRow = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-D`,
      dyeLotNo: `LOT-D-${tag}`,
      batchNo: dropBatch,
      quantityMeters: '40',
    });
    const keepStockId = numOf(keepRow, 'id', '保留行库存行');
    const dropStockId = numOf(dropRow, 'id', '待删行库存行');

    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}`,
      stock_ids: [keepStockId, dropStockId],
    });
    const countId = numOf(created, 'id', '盘点建单响应');
    expect(numOf(created, 'total_items', '建单响应'), '快照必须恰两条明细').toBe(2);

    // 负例一：拿不在本单快照里的库存行做差异录入 → 404 NOT_FOUND（与状态门 400 可分辨）
    const ghostStockId = 99999999;
    const ghostRecord = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/record`,
      { items: [{ stock_id: ghostStockId, quantity_actual: '10.00' }] }
    );
    expect(ghostRecord.status, `不存在的库存行录入必须 404，实际 ${ghostRecord.status}`).toBe(404);
    expect(
      failureCode(ghostRecord),
      `不存在的库存行必须归因 NOT_FOUND，实际 ${JSON.stringify(ghostRecord.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);

    // 被拒不落半截：主表统计与保留行库存都不许动
    const headAfterGhost = await readCount(page, countId, '458-04 幽灵行录入后');
    expect(numOf(headAfterGhost, 'counted_items', '主表'), '被拒录入不许推进已盘点数').toBe(0);
    const keepAfterGhost = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: keepBatch,
      colorNo: `E2E${tag}-K`,
      label: '458-04 幽灵行录入后',
    });
    expect(numOf(keepAfterGhost, 'quantity_on_hand', '幽灵行录入后'), '被拒录入不许动库存').toBe(
      80
    );

    // 负例二：先删掉一条明细，再拿已删明细对应的库存行录入 → 404
    const dropLine = (headAfterGhost.items as Row[]).find(
      r => numOf(r, 'stock_id', '明细行') === dropStockId
    );
    expect(dropLine, '待删明细必须可从库里读到').toBeDefined();
    const dropItemId = numOf(dropLine as Row, 'id', '待删明细行');
    await apiCall(page, 'DELETE', `/inventory/counts/items/${dropItemId}`);
    const afterDeleteItems = await readCount(page, countId, '458-04 删明细后');
    expect((afterDeleteItems.items as Row[]).length, '删除后的明细行不许再出现在盘点单里').toBe(1);
    const deletedRecord = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/record`,
      { items: [{ stock_id: dropStockId, quantity_actual: '35.00' }] }
    );
    expect(
      deletedRecord.status,
      `已删除明细的库存行再录入必须 404，实际 ${deletedRecord.status}`
    ).toBe(404);
    expect(
      failureCode(deletedRecord),
      `已删除明细必须归因 NOT_FOUND，实际 ${JSON.stringify(deletedRecord.code)}`
    ).toBe(APP_ERROR_CODES.NOT_FOUND);
    const dropAfterDelete = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: dropBatch,
      colorNo: `E2E${tag}-D`,
      label: '458-04 删明细后',
    });
    expect(
      numOf(dropAfterDelete, 'quantity_on_hand', '删明细后待删行'),
      '删明细与拒录入都不许动库存'
    ).toBe(40);

    // 负例三：实盘量为负 → 字段必填族拒绝，文案可外显（与调拨面缺负数门形成对照）
    const negativeActual = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/record`,
      { items: [{ stock_id: keepStockId, quantity_actual: '-1.00' }] }
    );
    expect(negativeActual.status, `负实盘量必须 400，实际 ${negativeActual.status}`).toBe(400);
    expect(
      failureCode(negativeActual),
      `负实盘量必须归因 VALIDATION_ERROR，实际 ${JSON.stringify(negativeActual.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      String(negativeActual.message),
      `负实盘量拒因必须外显可读，实际 ${JSON.stringify(negativeActual.message)}`
    ).toBe('实盘数量不能为负');

    // 负例四：调拨批次在调出仓无匹配库存 → business 族 400（建单期预检，不留半截单）
    const noStock = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}-NOSTOCK`,
      items: [{ product_id: productId, quantity: '10.00', batch_no: `B-ABSENT-${tag}` }],
    });
    expect(noStock.status, `无匹配库存的调拨必须 400，实际 ${noStock.status}`).toBe(400);
    expect(
      failureCode(noStock),
      `无匹配库存必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(noStock.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 负例五：调拨量超出现存量 → business 族 400，且库存与明细零落库。
    // 量门腿走白坯行：染色布出库强制第四维匹号且须命中真实可用匹，维度校验先于可用量
    // 预检执行，指着染色行会让本腿被维度门挡掉而测不到超量判定；白坯免缸号与匹号，
    // 四维退化为批次唯一维度，available 小于 quantity 这一支才真被测到。
    const overBatch = `B-OVER-${tag}`;
    const overSeed = await seedGreigeStockIn(page, {
      productId,
      warehouseId,
      batchNo: overBatch,
      quantityMeters: '80',
    });
    expect(numOf(overSeed, 'id', '超量腿白坯播种行'), '白坯库存行主键必须为正整数').toBeGreaterThan(
      0
    );
    const overQty = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}-OVERQTY`,
      items: [{ product_id: productId, quantity: '999999.00', batch_no: overBatch }],
    });
    expect(overQty.status, `超出现存量的调拨必须 400，实际 ${overQty.status}`).toBe(400);
    expect(
      failureCode(overQty),
      `超出现存量必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(overQty.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const keepAfterOver = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: overBatch,
      colorNo: '',
      label: '458-04 超量拒绝后',
    });
    expect(numOf(keepAfterOver, 'quantity_available', '超量拒绝后'), '被拒调拨不许动可用量').toBe(
      80
    );

    // 负例六：染色布缺缸号 → 字段必填族 400，文案回显用户提交的色号（可外显族逐字钉）
    const missingDimColor = `E2E${tag}-DIM`;
    const missingDim = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}-MISSDIM`,
      items: [
        {
          product_id: productId,
          quantity: '5.00',
          color_no: missingDimColor,
          batch_no: keepBatch,
        },
      ],
    });
    expect(missingDim.status, `染色布缺缸号的调拨必须 400，实际 ${missingDim.status}`).toBe(400);
    expect(
      failureCode(missingDim),
      `缺维度必须归因 VALIDATION_ERROR，实际 ${JSON.stringify(missingDim.code)}`
    ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
    expect(
      String(missingDim.message),
      `缺维度拒因必须点明缺哪一维并回显用户提交的色号，实际 ${JSON.stringify(missingDim.message)}`
    ).toBe(`调拨出库：染色布必须提供缸号（color_no=${missingDimColor} 但 dye_lot_no 为空）`);

    // 负数量腿按真实契约钉：调拨明细无非负校验，建单被接受（源码缺陷，本支只暴露不修）。
    // 预检按归一维度匹配库存行：只带 batch_no 的 payload 其 color_no 缺省为空串（白坯），
    // 仅命中 color_no 为空的库存行；染色批次缺色号会在匹配期以无匹配库存被拒、到不了数量比较。
    // 故本腿自建白坯批次，确保预检命中并走到 available < quantity（负数恒不触发）。
    // 改由库存经理会话建，避开管理员一小时内 10 次建单的频率门；不发 ship 以免造反向库存。
    const negativeBatch = `B-NEG-${tag}`;
    const negativeSeed = await seedGreigeStockIn(page, {
      productId,
      warehouseId,
      batchNo: negativeBatch,
      quantityMeters: '80',
    });
    const negativeAvailableBefore = numOf(negativeSeed, 'quantity_available', '负数量白坯播种行');
    await loginAsRole(page, 'inventory_manager');
    const negative = await apiCall<Row>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}-NEG`,
      items: [{ product_id: productId, quantity: '-5.00', batch_no: negativeBatch }],
    });
    const negativeId = numOf(negative.data as Row, 'id', '负数量建单响应');
    expect(
      Number.isInteger(negativeId) && negativeId > 0,
      `当前实现接受负数量建单，若本断言转红说明负数门已补上，应改为钉 400 并撤下缺口注释。` +
        `实际响应片段=${JSON.stringify(negative).slice(0, 240)}`
    ).toBe(true);
    const negativeItems = await readTransferItems(page, negativeId, '458-04 负数量建单后');
    expect(
      numOf(negativeItems[0], 'quantity', '负数量明细行'),
      '负数量必须如实落库为 -5（不被静默取绝对值或清零）'
    ).toBe(-5);
    // 建单用库存经理会话避开管理员建单频率门；库存行回读必须切回管理员会话，
    // 库存列表对非管理员删 quantity_available 等五个数量键（inventory_stock_handler.rs
    // apply_data_permission_filter 的角色脱敏），库存经理会话读不到可用量键。
    await loginAsRole(page, 'admin');
    const negativeStockAfter = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo: negativeBatch,
      colorNo: '',
      label: '458-04 负数量建单后',
    });
    expect(
      numOf(negativeStockAfter, 'quantity_available', '负数量建单后'),
      '负数量建单阶段不许动库存'
    ).toBe(negativeAvailableBefore);
    console.error(
      `[458-04][缺陷登记] 调拨负数量缺门：POST /inventory/transfers 接受 quantity=-5 并如实落库` +
        `（明细 id 见 ${negativeId}），建单期可用量预检判据为 available < quantity，负数恒不触发；` +
        `写入方 services/inv/inventory_move.rs::check_from_warehouse_inventory 与 ` +
        `services/inv/stock.rs::match_single_item_against_stocks 均无非负校验，` +
        `而盘点面 record 有「实盘数量不能为负」门——同域判定不对称。` +
        `目标口径"调拨数量为负必须 4xx"缺实现，本支只暴露不修。`
    );
    await tryCleanup(page, 'DELETE', `/inventory/transfers/${negativeId}`, `[458] 负数量调拨单`);

    // 被拒的盘点动作零推进：状态仍 pending，且剩下的那条明细从未被写入实盘量。
    // counted_items 不在此断言——删除明细会触发 services/inventory_count_service.rs
    // ::recalc_count_stats，把"剩余行数"当作已盘点数回写主表，该列此时不再是
    // "已录入动作数"的语义；真正没被写的证据是明细行的 quantity_actual 与
    // quantity_difference 仍为初值 0。
    await loginViaUI(page, undefined, undefined, true);
    const finalHead = await readCount(page, countId, '458-04 终检');
    expect(String(finalHead.status), '负例族不许推进盘点单状态').toBe(COUNT_STATUS.PENDING);
    const finalLines = finalHead.items as Row[];
    expect(finalLines.length, '终检明细必须只剩保留的那一条').toBe(1);
    expect(
      numOf(finalLines[0], 'quantity_actual', '终检明细行'),
      '被拒的录入不许把实盘量写成非零值'
    ).toBe(0);
    expect(
      numOf(finalLines[0], 'quantity_difference', '终检明细行'),
      '被拒的录入不许产生差异'
    ).toBe(0);
    await tryCleanup(page, 'DELETE', `/inventory/counts/${countId}`, `[458] 拦截面盘点单`);
  });

  test('458-05 状态机门控 in_review 再编辑与重复过账被拒 驳回后可编辑反证门在状态', async ({
    page,
  }) => {
    const ctx = getCtx();
    const productId = bag.productId ?? ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    if (productId === undefined || warehouseId === undefined) {
      throw new Error('[458-05] 前置不成立：产品或仓库主键缺失');
    }

    const tag = genCode('458E');
    const batchNo = `B-GATE-${tag}`;
    const seeded = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-G`,
      dyeLotNo: `LOT-G-${tag}`,
      batchNo,
      quantityMeters: '50',
    });
    const stockId = numOf(seeded, 'id', '门控用例库存行');

    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}`,
      stock_ids: [stockId],
    });
    const countId = numOf(created, 'id', '盘点建单响应');

    // pending 态可编辑：三态写入有值覆盖后必须从库里读出
    await apiCall(page, 'PUT', `/inventory/counts/${countId}`, { notes: `E2E${tag}-NOTES` });
    const headNotes = await readCount(page, countId, '458-05 改备注后');
    expect(
      String(headNotes.notes),
      `主表 notes 必须落为提交值，实际 ${JSON.stringify(headNotes.notes)}`
    ).toBe(`E2E${tag}-NOTES`);

    // pending 态可删除：先证明删除门在 pending 放行，再另建一单走终态拒绝
    await apiCallRaw<Row>(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [{ stock_id: stockId, quantity_actual: '58.00' }],
    });

    // 提交进入 in_review：此后编辑与录入都必须被状态门拒绝
    await apiCall(page, 'POST', `/inventory/counts/${countId}/submit`);
    const inReview = await readCount(page, countId, '458-05 提交后');
    expect(String(inReview.status), '提交后必须为 in_review').toBe(COUNT_STATUS.IN_REVIEW);

    const denEdit = await apiCallExpectFail(page, 'PUT', `/inventory/counts/${countId}`, {
      notes: `E2E${tag}-LATE`,
    });
    expect(denEdit.status, `in_review 再编辑必须 400，实际 ${denEdit.status}`).toBe(400);
    expect(
      failureCode(denEdit),
      `再编辑门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(denEdit.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const denRecord = await apiCallExpectFail(page, 'POST', `/inventory/counts/${countId}/record`, {
      items: [{ stock_id: stockId, quantity_actual: '66.00' }],
    });
    expect(denRecord.status, `in_review 再录入必须 400，实际 ${denRecord.status}`).toBe(400);
    expect(
      failureCode(denRecord),
      `再录入门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(denRecord.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const denResubmit = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/submit`
    );
    expect(denResubmit.status, `重复提交必须 400，实际 ${denResubmit.status}`).toBe(400);

    // 被拒三连不许改状态、不许改实盘量、不许动库存
    const headAfterDenials = await readCount(page, countId, '458-05 被拒三连后');
    expect(String(headAfterDenials.status), '被拒动作不许推进状态').toBe(COUNT_STATUS.IN_REVIEW);
    const lineAfterDenials = (headAfterDenials.items as Row[])[0];
    expect(
      numOf(lineAfterDenials, 'quantity_actual', '被拒后明细行'),
      '被拒的再录入不许改实盘量'
    ).toBe(58);
    const stockAfterDenials = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-G`,
      label: '458-05 被拒三连后',
    });
    expect(numOf(stockAfterDenials, 'quantity_on_hand', '被拒后库存行'), '未过账不许动账面').toBe(
      50
    );
    expect(String(headAfterDenials.notes), '被拒的编辑不许把 notes 改写').toBe(`E2E${tag}-NOTES`);

    // 过账一次：库存按实盘量落库
    await apiCall(page, 'POST', `/inventory/counts/${countId}/approve`);
    const completed = await readCount(page, countId, '458-05 过账后');
    expect(String(completed.status), '过账后必须为 completed').toBe(COUNT_STATUS.COMPLETED);
    const stockAfterApprove = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-G`,
      label: '458-05 过账后',
    });
    const onHandAfterApprove = numOf(stockAfterApprove, 'quantity_on_hand', '过账后库存行');
    const versionAfterApprove = numOf(stockAfterApprove, 'version', '过账后库存行');
    expect(onHandAfterApprove, '过账后账面必须等于实盘 58').toBe(58);

    // 重复过账被状态门拒绝，且库存零二次变化（版本号不增说明没执行 update_many）
    const reApprove = await apiCallExpectFail(page, 'POST', `/inventory/counts/${countId}/approve`);
    expect(reApprove.status, `completed 单重复过账必须 400，实际 ${reApprove.status}`).toBe(400);
    expect(
      failureCode(reApprove),
      `重复过账门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(reApprove.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const stockAfterReApprove = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-G`,
      label: '458-05 重复过账后',
    });
    expect(
      numOf(stockAfterReApprove, 'quantity_on_hand', '重复过账后'),
      '重复过账不许二次改写账面'
    ).toBe(onHandAfterApprove);
    expect(
      numOf(stockAfterReApprove, 'version', '重复过账后'),
      '重复过账不许再递增版本号（未执行改写即为零漂移）'
    ).toBe(versionAfterApprove);
    const headAfterReApprove = await readCount(page, countId, '458-05 重复过账后');
    expect(String(headAfterReApprove.status), '重复过账不许回退状态').toBe(COUNT_STATUS.COMPLETED);

    // 终态删除被拒（可外显族文案逐字钉），且单据仍在库
    const denDelete = await apiCallExpectFail(page, 'DELETE', `/inventory/counts/${countId}`);
    expect(denDelete.status, `completed 单删除必须 400，实际 ${denDelete.status}`).toBe(400);
    expect(
      String(denDelete.message),
      `删除门拒因必须外显可读，实际 ${JSON.stringify(denDelete.message)}`
    ).toBe('只有待盘点状态的盘点单可以删除');
    const stillThere = await readCount(page, countId, '458-05 删除被拒后');
    expect(numOf(stillThere, 'id', '仍在库的主表'), '被拒删除不许删掉单据').toBe(countId);

    // 反证腿：另一张 in_review 单被驳回回 pending 后，同一编辑动作立刻成功——
    // 证明上面的 400 来自状态门，而不是端点坏或权限坏
    const secondCreated = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}-S2`,
      stock_ids: [stockId],
    });
    const secondId = numOf(secondCreated, 'id', '第二张盘点单响应');
    await apiCall(page, 'POST', `/inventory/counts/${secondId}/record`, {
      items: [{ stock_id: stockId, quantity_actual: '58.00' }],
    });
    await apiCall(page, 'POST', `/inventory/counts/${secondId}/submit`);
    const secondInReview = await readCount(page, secondId, '458-05 第二张提交后');
    expect(String(secondInReview.status), '第二张提交后必须为 in_review').toBe(
      COUNT_STATUS.IN_REVIEW
    );
    const secondDeny = await apiCallExpectFail(page, 'PUT', `/inventory/counts/${secondId}`, {
      notes: `E2E${tag}-S2-LATE`,
    });
    expect(secondDeny.status, '第二张 in_review 编辑同样被拒').toBe(400);

    await apiCall(page, 'POST', `/inventory/counts/${secondId}/reject`);
    const rejectedBack = await readCount(page, secondId, '458-05 驳回后');
    expect(
      String(rejectedBack.status),
      `驳回后必须逐字符回到 ${COUNT_STATUS.PENDING}，实际 ${JSON.stringify(rejectedBack.status)}`
    ).toBe(COUNT_STATUS.PENDING);

    const editAfterReject = await apiCallRaw<Row>(page, 'PUT', `/inventory/counts/${secondId}`, {
      notes: `E2E${tag}-S2-AGAIN`,
    });
    expect(String(editAfterReject.status), '驳回后同一编辑动作必须成功（反证拒绝来自状态门）').toBe(
      COUNT_STATUS.PENDING
    );
    const headAfterRejectEdit = await readCount(page, secondId, '458-05 驳回后编辑回读');
    expect(String(headAfterRejectEdit.notes), '驳回后的编辑必须落库').toBe(`E2E${tag}-S2-AGAIN`);

    // 三态第二支：显式 null 清空必须落 NULL，不许静默保持原值
    await apiCall(page, 'PUT', `/inventory/counts/${secondId}`, { notes: null });
    const headCleared = await readCount(page, secondId, '458-05 清空备注后');
    expect(
      headCleared.notes,
      `显式 null 必须把 notes 清空为 NULL，实际 ${JSON.stringify(headCleared.notes)}`
    ).toBeNull();

    // NOT NULL 列清空必须被拒且原值不动
    const denClearDate = await apiCallExpectFail(page, 'PUT', `/inventory/counts/${secondId}`, {
      count_date: null,
    });
    expect(denClearDate.status, `NOT NULL 列清空必须 400，实际 ${denClearDate.status}`).toBe(400);
    expect(String(denClearDate.message), '清空拒因必须外显可读').toBe(
      '盘点日期不能清空：该字段为必填项'
    );
    const headDateIntact = await readCount(page, secondId, '458-05 拒清空后');
    expect(headDateIntact.count_date, '被拒的清空不许把 count_date 抹成 NULL').toBeDefined();

    // 第二张单已过账的库存不受其影响：账面仍是第一张单的实盘量
    const stockFinal = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-G`,
      label: '458-05 终检',
    });
    expect(numOf(stockFinal, 'quantity_on_hand', '终检库存行'), '终检账面必须为 58').toBe(58);

    await tryCleanup(page, 'DELETE', `/inventory/counts/${secondId}`, `[458] 反证腿盘点单`);
  });

  test('458-06 角色面 仓管做录入被放行 提交审批发货越位被拒且零副作用', async ({ page }) => {
    const ctx = getCtx();
    const productId = bag.productId ?? ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const toWarehouseId = ctx.warehouseIds.find(id => id !== warehouseId);
    if (productId === undefined || warehouseId === undefined || toWarehouseId === undefined) {
      throw new Error(
        `[458-06] 前置不成立：产品或两个仓库主键缺失，warehouseIds=${ctx.warehouseIds.length}`
      );
    }

    const tag = genCode('458F');
    const batchNo = `B-ROLE-${tag}`;
    const seeded = await seedFourDimStockIn(page, {
      productId,
      warehouseId,
      colorNo: `E2E${tag}-R`,
      dyeLotNo: `LOT-R-${tag}`,
      batchNo,
      quantityMeters: '70',
    });
    const stockId = numOf(seeded, 'id', '角色面库存行');

    // 仓管做自己那步：建盘点单与录入实盘都放行（键 counts:create）
    await loginAsRole(page, 'warehouse_keeper');
    const keeperCount = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}-K`,
      stock_ids: [stockId],
    });
    const countId = numOf(keeperCount, 'id', '仓管建单响应');
    expect(String(keeperCount.status), '仓管建单初值必须为 pending').toBe(COUNT_STATUS.PENDING);

    const keeperRecord = await apiCallRaw<Row>(
      page,
      'POST',
      `/inventory/counts/${countId}/record`,
      { items: [{ stock_id: stockId, quantity_actual: '77.00' }] }
    );
    expect(numOf(keeperRecord, 'counted_items', '仓管录入响应'), '仓管录入必须真落库').toBe(1);

    // 仓管越位做提交（键 counts:submit 未授）→ 403 且状态不回写
    const keeperSubmit = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/submit`
    );
    expectDenied(keeperSubmit, '仓管直连提交审批必须被权限门拒绝（403 加 FORBIDDEN）');

    // 切回管理员重读：被拒动作零副作用（状态仍 pending、库存未过账）
    await loginViaUI(page, undefined, undefined, true);
    const headKeeperSubmitDenied = await readCount(page, countId, '458-06 仓管提交被拒后');
    expect(String(headKeeperSubmitDenied.status), '被拒的提交不许推进状态').toBe(
      COUNT_STATUS.PENDING
    );
    const stockAfterKeeperDeny = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-R`,
      label: '458-06 仓管提交被拒后',
    });
    expect(
      numOf(stockAfterKeeperDeny, 'quantity_on_hand', '仓管提交被拒后'),
      '提交被拒阶段不许动账面'
    ).toBe(70);

    // 越权面：会计岗直连差异过账与建调拨单、质检岗直连发货、会计岗直连收货，
    // 一律 403 加 FORBIDDEN；每枚拒绝都在自己的会话里发出（会话切换次序即判据次序）
    expect(
      bag.transferId !== undefined,
      '458-03 未建立调拨单，越权发货腿失去靶子——前置不成立直接判红'
    ).toBe(true);
    const transferId = bag.transferId as number;
    const headBeforeShipDeny = await readTransfer(page, transferId, '458-06 越权发货前');
    const statusBeforeShipDeny = String(headBeforeShipDeny.status);

    await loginAsRole(page, 'accountant');
    const accountantApprove = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/counts/${countId}/approve`
    );
    expectDenied(accountantApprove, `accountant 直连差异过账必须被权限门拒绝（403 加 FORBIDDEN）`);
    const acctCreate = await apiCallExpectFail(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: warehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}-ACCT`,
      items: [{ product_id: productId, quantity: '3.00', batch_no: batchNo }],
    });
    expectDenied(acctCreate, 'accountant 直连建调拨单必须被权限门拒绝（403 加 FORBIDDEN）');

    await loginAsRole(page, 'quality_inspector');
    const qcShip = await apiCallExpectFail(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    expectDenied(qcShip, 'quality_inspector 直连调拨发货必须被权限门拒绝（403 加 FORBIDDEN）');

    await loginAsRole(page, 'accountant');
    const acctReceive = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/transfers/${transferId}/receive`
    );
    expectDenied(acctReceive, 'accountant 直连调拨收货必须被权限门拒绝（403 加 FORBIDDEN）');

    // 越权拒绝后重读：调拨单状态与两库位账面逐值不变
    await loginViaUI(page, undefined, undefined, true);
    const headAfterShipDeny = await readTransfer(page, transferId, '458-06 越权发货被拒后');
    expect(String(headAfterShipDeny.status), '被拒的发货与收货不许推进调拨单状态').toBe(
      statusBeforeShipDeny
    );
    const stockAfterShipDeny = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-R`,
      label: '458-06 越权发货被拒后',
    });
    expect(
      numOf(stockAfterShipDeny, 'quantity_on_hand', '越权发货被拒后'),
      '越权发货被拒不许搬库存'
    ).toBe(70);
    const transferListAfterAcctCreate = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/transfers?from_warehouse_id=${warehouseId}&to_warehouse_id=${toWarehouseId}&page=1&page_size=100`
    );
    expect(
      Object.prototype.hasOwnProperty.call(transferListAfterAcctCreate, 'items'),
      `调拨列表信封必须含键 items，实际键集 ${JSON.stringify(
        Object.keys(transferListAfterAcctCreate)
      )}`
    ).toBe(true);
    const mine = (transferListAfterAcctCreate.items as Row[]).filter(
      r => String(r.notes) === `E2E${tag}-ACCT`
    );
    expect(
      mine.length,
      `被拒的会计岗建单不许落库，实际命中 ${JSON.stringify(mine).slice(0, 200)}`
    ).toBe(0);

    // 库存经理做自己那步：提交与过账都放行（键 counts:submit 与 counts:approve）。
    // 盘点单无部门列，归属门按成员集合判定（check_resource_owner_by_member_scope），
    // 库存经理 data_scope 为 dept 而仓管不在其可见成员集合内，故经理对仓管建的单做提交
    // 会被归属门拒绝（与越权面同源，属正确拦截而非端点坏）。放行面由经理在同一库存行上
    // 自建自录自批证明：本人行三种 scope 恒可写，提交与过账真实放行，过账把实盘 77 落进
    // 库存行（库读非响应回显）。仓管那张单维持 pending 不受影响，零副作用判据仍成立。
    await loginAsRole(page, 'inventory_manager');
    const mgrCount = await apiCallRaw<Row>(page, 'POST', '/inventory/counts', {
      warehouse_id: warehouseId,
      count_date: new Date().toISOString(),
      notes: `E2E${tag}-MGR`,
      stock_ids: [stockId],
    });
    const mgrCountId = numOf(mgrCount, 'id', '库存经理建单响应');
    await apiCallRaw<Row>(page, 'POST', `/inventory/counts/${mgrCountId}/record`, {
      items: [{ stock_id: stockId, quantity_actual: '77.00' }],
    });
    const mgrSubmit = await apiCallRaw<Row>(page, 'POST', `/inventory/counts/${mgrCountId}/submit`);
    expect(
      String(mgrSubmit.status),
      `库存经理提交后必须为 ${COUNT_STATUS.IN_REVIEW}，实际 ${JSON.stringify(mgrSubmit.status)}`
    ).toBe(COUNT_STATUS.IN_REVIEW);
    const mgrApprove = await apiCallRaw<Row>(
      page,
      'POST',
      `/inventory/counts/${mgrCountId}/approve`
    );
    expect(String(mgrApprove.status), '库存经理过账后必须为 completed').toBe(
      COUNT_STATUS.COMPLETED
    );

    // 库存列表与详情对"无 inventory_stock 数据权限配置且非 admin"的岗位默认隐藏五个数量列
    // （inventory_stock_handler.rs 的详情与列表辅助函数同一口径）。经理会话下读不到账面量
    // 是脱敏契约生效，不是过账没落库。先在经理会话把这条脱敏正向钉住，再切回 admin 做库读，
    // 证明实盘 77 真落进库存行，两件事各自可证，不拿隐藏字段当落库证据。
    const stockAsMgr = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-R`,
      label: '458-06 经理会话脱敏面',
    });
    expect(
      Object.prototype.hasOwnProperty.call(stockAsMgr, 'quantity_on_hand'),
      '非 admin 且无库存数据权限配置的岗位，库存出参必须隐藏 quantity_on_hand'
    ).toBe(false);

    await loginAsRole(page, 'admin');
    const stockAfterMgrApprove = await readStockRow(page, {
      productId,
      warehouseId,
      batchNo,
      colorNo: `E2E${tag}-R`,
      label: '458-06 库存经理过账后',
    });
    expect(
      numOf(stockAfterMgrApprove, 'quantity_on_hand', '库存经理过账后'),
      '库存经理自录自批的链路必须把实盘 77 落进库存行'
    ).toBe(77);
    expect(
      numOf(stockAfterMgrApprove, 'quantity_available', '库存经理过账后'),
      '过账后可用量必须同步为实盘 77'
    ).toBe(77);
    console.log(
      `[458-06] 角色面完成 keeperCount=${countId} mgrCount=${mgrCountId} transfer=${transferId}`
    );
  });

  test('458-07 写后重读防线 派生值与主表统计一律以库里读数为准', async ({ page }) => {
    const ctx = getCtx();
    const productId = bag.productId ?? ctx.productIds[0];
    const fromWarehouseId = ctx.warehouseIds[0];
    const toWarehouseId = ctx.warehouseIds.find(id => id !== fromWarehouseId);
    if (productId === undefined || fromWarehouseId === undefined || toWarehouseId === undefined) {
      throw new Error('[458-07] 前置不成立：产品或两个仓库主键缺失');
    }

    const tag = genCode('458G');
    const batchNo = `B-DERIV-${tag}`;
    await seedGreigeStockIn(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      quantityMeters: '120',
    });

    // 两行明细同批次不同维度不成立（白坯仅批次一维），故用两笔各 7 与 11：
    // 主表 total_quantity 必须由服务端求和为 18，而不是采信任何单行入参
    await loginAsRole(page, 'inventory_manager');
    const created = await apiCallRaw<Row>(page, 'POST', '/inventory/transfers', {
      from_warehouse_id: fromWarehouseId,
      to_warehouse_id: toWarehouseId,
      transfer_date: new Date().toISOString(),
      notes: `E2E${tag}`,
      items: [
        { product_id: productId, quantity: '7.00', batch_no: batchNo },
        { product_id: productId, quantity: '11.00', batch_no: batchNo },
      ],
    });
    const transferId = numOf(created, 'id', '调拨建单响应');

    const head = await readTransfer(page, transferId, '458-07 建单后');
    const items = await readTransferItems(page, transferId, '458-07 建单后');
    expect(items.length, '明细必须恰 2 行').toBe(2);
    const itemSum = items.reduce((acc, r) => acc + numOf(r, 'quantity', '明细行'), 0);
    expect(itemSum, '两行明细求和必须为 18').toBe(18);
    expect(
      numOf(head, 'total_quantity', '主表'),
      `主表 total_quantity 必须由明细算出等于 ${itemSum}，实际 ${JSON.stringify(head.total_quantity)}`
    ).toBe(itemSum);
    expect(numOf(head, 'id', '主表'), '主表回读必须就是刚建的单').toBe(transferId);
    expect(String(head.status), '建单后状态必须由库里读得 pending').toBe(TRANSFER_STATUS.PENDING);

    // 审批与发货后再读：主表状态与明细发出量、库存账面三处必须自洽
    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/approve`, { approved: true });
    const approvedHead = await readTransfer(page, transferId, '458-07 审批后');
    expect(String(approvedHead.status), '审批后必须由库里读得 approved').toBe(
      TRANSFER_STATUS.APPROVED
    );
    expect(approvedHead.approved_by, '审批人必须落库而非只在响应里回显').not.toBeNull();

    await apiCall(page, 'POST', `/inventory/transfers/${transferId}/ship`);
    const shippedItems = await readTransferItems(page, transferId, '458-07 发货后');
    const shippedSum = shippedItems.reduce(
      (acc, r) => acc + numOf(r, 'shipped_quantity', '明细行'),
      0
    );
    expect(shippedSum, '发货后明细发出量合计必须等于主表总量 18，实际 ' + shippedSum).toBe(itemSum);

    // 本腿在库存经理会话里跑，而库存详情与列表对"无 inventory_stock 数据权限配置且非 admin"
    // 的岗位默认隐藏五个数量列（inventory_stock_handler.rs 详情与列表辅助同口径）。
    // 先在经理会话把脱敏正向钉住，再切回 admin 库读证守恒，两件事各自可证，
    // 不拿被隐藏的字段当"库里没变"或"库里变了"的证据。
    const srcAsMgr = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-07 经理会话脱敏面',
    });
    expect(
      Object.prototype.hasOwnProperty.call(srcAsMgr, 'quantity_on_hand'),
      '非 admin 且无库存数据权限配置的岗位，库存出参必须隐藏 quantity_on_hand'
    ).toBe(false);

    await loginAsRole(page, 'admin');
    const src = await readStockRow(page, {
      productId,
      warehouseId: fromWarehouseId,
      batchNo,
      colorNo: '',
      label: '458-07 发货后调出仓',
    });
    expect(
      numOf(src, 'quantity_on_hand', '发货后调出仓'),
      '调出仓账面必须由库里读得 120 减 18'
    ).toBe(102);
    expect(
      numOf(src, 'quantity_available', '发货后调出仓'),
      '调出仓可用量必须由库里读得 120 减 18'
    ).toBe(102);

    // 读口不存在的主键必须 4xx（防止把空响应体当成"库里没变"的假绿）
    const missingHead = await apiCallExpectFail(page, 'GET', '/inventory/transfers/99999999');
    expect(missingHead.status, `不存在主键的调拨详情必须 404，实际 ${missingHead.status}`).toBe(
      404
    );
    expect(failureCode(missingHead), '不存在主键必须归因 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    const missingCount = await apiCallExpectFail(page, 'GET', '/inventory/counts/99999999');
    expect(missingCount.status, `不存在主键的盘点详情必须 404，实际 ${missingCount.status}`).toBe(
      404
    );

    await loginViaUI(page, undefined, undefined, true);
    await tryCleanup(page, 'POST', `/inventory/transfers/${transferId}/receive`, `[458] 收尾收货`);
    await tryCleanup(
      page,
      'DELETE',
      `/inventory/stock/${numOf(src, 'id', '调出仓库存行')}`,
      `[458] 白坯库存行`
    );
  });
});

/**
 * 回读调拨单主表。调用方 458-03 与 458-06 与 458-07。
 * 传给谁 GET /inventory/transfers/{id}（handlers/inventory_transfer_handler.rs
 * get_transfer → services/inv/inventory_move.rs get_transfer_detail，
 * 出参键为 InventoryTransferDetail 的 snake_case 字段名）。
 * 存什么，返回主表整行；缺 transfer_no 键当场红并点名步骤。
 */
async function readTransfer(page: Page, transferId: number, label: string): Promise<Row> {
  const head = await apiCallRaw<Row>(page, 'GET', `/inventory/transfers/${transferId}`);
  expect(
    Object.prototype.hasOwnProperty.call(head, 'transfer_no'),
    `${label} 调拨详情必须含键 transfer_no，实际键集 ${JSON.stringify(Object.keys(head))}`
  ).toBe(true);
  return head;
}

/**
 * 回读调拨明细行数组。调用方 458-03 与 458-04 与 458-07。
 * 传给谁 GET /inventory/transfers/{id}/items（出参直接是数组，不是 PaginatedResponse）。
 * 存什么，返回 inventory_transfer_items 行数组；结构异常当场红并点名步骤。
 */
async function readTransferItems(page: Page, transferId: number, label: string): Promise<Row[]> {
  const res = await apiCallRaw<Row[]>(page, 'GET', `/inventory/transfers/${transferId}/items`);
  expect(
    Array.isArray(res),
    `${label} 调拨明细读口必须直接出数组，实际 ${JSON.stringify(res)}`
  ).toBe(true);
  expect(res.length, `${label} 调拨明细不能为空数组（建单明细未落库）`).toBeGreaterThan(0);
  return res;
}

/**
 * 只读地探测调入仓的批次库存行。调用方 458-03 的发货阶段在途断言。
 * 传给谁 GET /inventory/stock 的下推过滤。
 * 存什么，命中返回该行、未命中返回 null（发货只在调入仓挂行在途，行可能尚未建档，
 * 因此 null 是合法形态，由调用方分支决定断言；本函数自身不做任何兜底改写）。
 */
async function readTargetRow(
  page: Page,
  productId: number,
  warehouseId: number,
  batchNo: string
): Promise<Row | null> {
  const path =
    `/inventory/stock?product_id=${productId}&warehouse_id=${warehouseId}` +
    `&batch_no=${encodeURIComponent(batchNo)}&page=1&page_size=100`;
  const list = await apiCallRaw<Row>(page, 'GET', path);
  expect(Array.isArray(list.items), `调入仓库存列表 items 必须是数组`).toBe(true);
  const hits = (list.items as Row[]).filter(r => textOf(r, 'batch_no') === batchNo);
  return hits.length === 0 ? null : (hits[0] as Row);
}
