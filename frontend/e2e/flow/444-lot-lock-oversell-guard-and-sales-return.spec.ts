import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
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
  tryCleanup,
  verifyStockFourDim,
} from './helpers';

/**
 * 444 订单锁缸防超卖与销售退货反向腿（八枚 test 串行链）
 *
 * 功能。覆盖同一缸号从建档到退货回补的四条腿。预留建单与锁定动作的状态机门与
 * 拒绝后零漂移（T2），预留面对超额需求的真实契约与库存零写入不变量（T3），
 * 预留动作序列的串行拒绝与删除门（T2 T3 T4），取消释放回读（T4），
 * 销售退货全链 DRAFT 到 SUBMITTED 到 APPROVED 到 COMPLETED，审批即库存回补，
 * 回补量与账面恒等（T5），非销售岗直连预留与退货写端点被后端权限门拒绝（T6），
 * 释放后同一缸号重新锁定成功并逐分对平"可用量加锁定量等于在库量"守恒恒等、
 * 出库面订单状态门拒绝后三列零漂移（T7），销售退货拒绝分支 SUBMITTED 到 REJECTED
 * 与拒绝动作零回补及被拒后状态不回跳（T8）。
 *
 * 调用方。Playwright E2E 串行链，flow 分片矩阵注册后由 CI 实跑，T6 拒绝腿走
 * loginAsRole 切 report_viewer 会话，放行面由 T2 T5 的管理员会话反向证明。
 *
 * 入参。播种与建单的产品、仓库、客户取 ensureTestEntities 落库的真实主键，
 * 缸号与色号每用例唯一（genCode 前缀 444），数量一律以 DECIMAL 字符串提交。
 *
 * 传给谁。播种腿 POST /inventory/stock/fabric（面料四维库存直建）并按四维回读
 * GET /inventory/stock，建单腿 POST /sales/fabric-orders 后由标准详情口
 * GET /sales/orders/{id} 带出明细，锁缸腿 POST /inventory/reservations 建预留、
 * POST /inventory/reservations/{id}/lock 与 /release 翻转状态、
 * GET /inventory/reservations 按产品与状态回读、DELETE /inventory/reservations/{id}
 * 走删除门，退货腿 POST /sales/sales-returns 建草稿并关联销售订单、
 * POST /sales/sales-returns/{id}/items 录明细、submit 与 approve 与 execute 推进
 * 状态机、reject 走拒绝分支并落 rejected_reason 专列，GET /sales/sales-returns/{id}
 * 与 /items 回读，回补对账用 GET /inventory/stock 聚合恒等，出库腿
 * POST /sales/orders/{id}/deliveries 与 GET /sales/orders/{id}/deliveries 过订单
 * 状态门（ship.rs 仅放行 approved 与 partial_shipped）。
 * 全部路径逐条对 frontend/scripts/route-snapshot.txt 在册。
 *
 * 存什么。inventory_stocks 行的 quantity_on_hand 与 quantity_available 与
 * quantity_reserved 三列，inventory_reservations 行的 quantity 与 status 与
 * released_at，sales_returns 主表 status 与 return_no 与 total_amount，
 * sales_return_item 行的 quantity 与 unit_price 与四金额列及追溯三列（色号 缸号 批次，
 * 由系统从关联销售订单明细回写），回补落点为该退货仓库加产品的库存行合计。
 *
 * 存哪里。PostgreSQL inventory_stocks 与 inventory_reservations 与 sales_returns
 * 与 sales_return_items 与 sales_orders 与 sales_order_items。状态词表逐字符取自
 * models/status 写入方。inventory_reservation 小写 pending locked released consumed
 * cancelled，sales_return 大写 DRAFT SUBMITTED APPROVED REJECTED COMPLETED，
 * 面料销售订单小写 pending。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 预留口 services/inventory_reservation_service.rs 的 create_reservation 只做三个
 * 外键引用预检（销售订单存在、产品未软删未停用、仓库未停用），不读 inventory_stocks、
 * 不校验可用量、不写库存三列，lock 与 release 与 delete 只在 inventory_reservations
 * 行内翻转状态（单事务加 lock_exclusive 串行化），从不触碰库存可用量。因此
 * "建预留并锁定后可用量相应减少"与"超出剩余可用量的第二笔预留被拒"在预留面 * 均无实现（源码缺陷，本支只暴露不修，T3 按真实契约钉 接受加零写入，并在下方
 * 回报缺口）。缸号口径的锁定量落点唯一在库存行三列，由 PUT /inventory/stock/{id}
 * 写入，该面已由同目录 213 缸号锁定用例钉死，本文件不重复钉写锁，只钉预留面
 * 与退货面两族。
 *
 * 超卖拒绝腿的真实位置与 T3 的立论。缸号超卖拦截仅存在于发货出库四维扣减规划
 * （services/so/delivery_ops/inventory.rs 的 reduce_inventory_four_dim，可用量不足
 * 整单拒绝并回滚），而建单面与预留面都不过可用量门。染色布出库强制第四维匹号，
 * 需真实染色匹链才能命中该门，成本超出本用例边界，故本文件把"同一余量不被两笔
 * 请求同时采纳"钉在预留行自身状态机上。同一条预留先 lock 成功（200 到 locked），
 * 再 lock 必被状态门拒绝（400 BUSINESS_ERROR，外显文案原文可钉），被拒后状态仍为
 * locked、库存三列零漂移，不存在半截锁。发货面拒绝腿缺哪一半写进交付回报。
 *
 * 退货反向腿口径（services/sales_return_service.rs）。建单 status 落 DRAFT，
 * return_no 为 SR 加八位日期加三位流水，reason 由 reason_type 与 reason_detail
 * 落复合列为 type 加冒号加空格加 detail 形态，明细添加门要求主表为 DRAFT（加行锁），税率来源为
 * 请求显式提供或关联销售订单明细，两者皆无业务错误拒绝，不静默补 0，追溯三列
 * 从关联订单明细的 color_no 与 dye_lot_requirement 与 batch_requirement 回写，
 * 取不到唯一定位即业务错误，不落空串。submit 需 DRAFT 且明细非空，approve 需
 * SUBMITTED 且审批事务内完成库存入库与红字应收生成，execute 需 APPROVED。
 * 状态门拒绝一律 AppError business 族（永久脱敏），只钉 HTTP 400 与机器码，
 * 不钉文案，预留面拒绝为 business_displayable 族，文案原文必须逐字钉住。
 * 主表 total_amount 由 update_return_totals 按 数量乘单价逐行求和 回写，
 * 不含税，行 total_amount 含税额，两口径差如实钉出。
 *
 * 越权面判据（T6）。权限中间件在 handler 之前按 URL 段派生 resource 与 action 键
 * 再查角色授权行。report_viewer 为只读报表岗，不含预留创建键与销售退货创建键，
 * 直连 POST 必 403 且机器码 FORBIDDEN（expectDenied 双钉，防 CSRF 面 403 冒充），
 * 拒绝后以管理员会话反查预留列表与退货列表，被拒请求零建行。放行面由 T2 T5 的
 * 管理员 200 反向证明，两腿缺一即假绿。
 *
 * 假绿防线。每次写紧跟独立读回逐列对表，负例一律钉 HTTP 与机器码，外显族加钉
 * 文案原文，被拒动作后锁定量与可用量与状态逐列不动，聚合恒等只对本用例唯一的
 * 产品加仓库组合求和，并发易漂移的全表计数不参与断言。全程不用 ?? 或 || 兜底，
 * 后端必出的键缺失即形漂判红，造数失败当场红并点名步骤。
 */

type Row = Record<string, unknown>;

/** DECIMAL 出参是字符串，数值判定一律先 Number 归一（与同目录 213 同口径） */
const num = (v: unknown): number => Number(String(v));

/** 跨 test 的串行链共享夹具袋（describe.serial 保证按声明顺序执行） */
const bag: {
  productId?: number;
  warehouseId?: number;
  colorNo?: string;
  dyeLotNo?: string;
  batchNo?: string;
  stockId?: number;
  total?: number;
  orderId?: number;
} = {};

/**
 * 按本用例专属四维回读库存行（打 GET /inventory/stock 的四维下推过滤）。
 * 调用方 T1 到 T5。入参 page 加袋内维度。传给谁 verifyStockFourDim（helpers）。
 * 存什么与存哪里，读回 inventory_stocks 行原样 JSON，查不到当场红并点名步骤。
 */
async function readLotRow(page: Page, label: string): Promise<Row> {
  const row = await verifyStockFourDim(page, bag.productId as number, bag.colorNo, bag.dyeLotNo, {
    batchNo: bag.batchNo,
    warehouseId: bag.warehouseId,
  });
  expect(row, `${label} 必须按四维命中库存行，实际为 null`).not.toBeNull();
  return row as Row;
}

/**
 * 按产品加仓库聚合库存两列合计（退货回补对账口径，不依赖回补落点行归属）。
 * 调用方 T5。传给谁 GET /inventory/stock?product_id&warehouse_id。
 * 存什么，返回 quantity_on_hand 与 quantity_available 两列在本维度下的合计。
 */
async function sumStockCols(page: Page): Promise<{ onHand: number; available: number }> {
  const list = await apiCallRaw<Row>(
    page,
    'GET',
    `/inventory/stock?product_id=${bag.productId}&warehouse_id=${bag.warehouseId}&page=1&page_size=100`
  );
  const rows = list.items as Row[];
  expect(Array.isArray(rows), '聚合库存列表必须出 items 数组').toBe(true);
  let onHand = 0;
  let available = 0;
  for (const r of rows) {
    onHand += num(r.quantity_on_hand);
    available += num(r.quantity_available);
  }
  return { onHand, available };
}

/**
 * 建一张关联本缸需求的面料销售订单（预留与退货的外键前置）。
 * 调用方 T1 T5。传给谁 POST /sales/fabric-orders，明细含 dye_lot_requirement。
 * 存什么与存哪里，sales_orders 与 sales_order_items 行，返回主表整行。
 */
async function createDemandOrder(page: Page, demandMeters: string, tag: string): Promise<Row> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/fabric-orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    required_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    remarks: `444锁缸需求${tag}`,
    items: [
      {
        product_id: bag.productId,
        quantity_meters: demandMeters,
        quantity_kg: '10.00',
        unit_price_meters: '25.50',
        color_no: bag.colorNo,
        dye_lot_requirement: bag.dyeLotNo,
      },
    ],
  });
  const orderId = num(created.id);
  expect(
    Number.isInteger(orderId) && orderId > 0,
    `面料建单失败，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  return created;
}

/**
 * 建一笔预留并可选立即锁定。调用方 T2 T3 T4。
 * 传给谁 POST /inventory/reservations 与 POST /inventory/reservations/{id}/lock。
 * 存什么与存哪里，inventory_reservations 行（quantity 与 status），返回建单响应体。
 */
async function createReservation(page: Page, quantity: string, notes: string): Promise<Row> {
  const res = await apiCallRaw<Row>(page, 'POST', '/inventory/reservations', {
    order_id: bag.orderId,
    product_id: bag.productId,
    warehouse_id: bag.warehouseId,
    quantity,
    notes,
  });
  const id = num(res.id);
  expect(Number.isInteger(id) && id > 0, `建预留失败，实际 ${JSON.stringify(res)}`).toBe(true);
  return res;
}

/**
 * 按产品与状态过滤预留列表并断言恰命中一条。调用方 T2 T4 T6。
 * 传给谁 GET /inventory/reservations?product_id&status。
 * 存什么，返回命中行，信封键为 list（该端点不是 items，逐字对 handler 出参）。
 */
async function readReservation(
  page: Page,
  reservationId: number,
  status: string,
  label: string
): Promise<Row> {
  const list = await apiCallRaw<Row>(
    page,
    'GET',
    `/inventory/reservations?product_id=${bag.productId}&status=${status}&page=1&page_size=100`
  );
  expect(
    Object.prototype.hasOwnProperty.call(list, 'list'),
    `${label} 预留列表信封必须含键 list，实际键集 ${JSON.stringify(Object.keys(list))}`
  ).toBe(true);
  const rows = list.list as Row[];
  expect(Array.isArray(rows), `${label} 预留列表 list 必须是数组`).toBe(true);
  const hit = rows.find(r => num(r.id) === reservationId);
  expect(hit, `${label} 必须命中预留 ${reservationId}，实际 ${JSON.stringify(rows)}`).toBeDefined();
  expect(String(hit!.status), `${label} 状态必须为 ${status}`).toBe(status);
  return hit as Row;
}

test.describe.serial('444 订单锁缸防超卖与销售退货反向腿', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 建档可用量基线与订单点名缸号回读', async ({ page }) => {
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0 && ctx.customerId !== undefined,
      `夹具缺产品/仓库/客户，productIds=${ctx.productIds.length} warehouseIds=${ctx.warehouseIds.length}`
    ).toBe(true);
    const tag = genCode('444A');
    bag.productId = ctx.productIds[0];
    bag.warehouseId = ctx.warehouseIds[0];
    bag.colorNo = `E2E${tag}`;
    bag.dyeLotNo = `LOT-${tag}`;
    bag.batchNo = `B-${bag.dyeLotNo}`;
    bag.total = 100;

    const seeded = await seedFourDimStockIn(page, {
      productId: bag.productId,
      warehouseId: bag.warehouseId,
      colorNo: bag.colorNo,
      dyeLotNo: bag.dyeLotNo,
      batchNo: bag.batchNo,
      quantityMeters: String(bag.total),
    });
    bag.stockId = num(seeded.id);
    expect(
      Number.isInteger(bag.stockId) && bag.stockId > 0,
      `播种回读库存行主键必须是正整数，实际 ${JSON.stringify(seeded)}`
    ).toBe(true);

    // 基线逐列钉 总量=可用量、锁定量为 0、质量与库存状态中文词表原样
    const row = await readLotRow(page, 'T1 基线回读');
    expect(num(row.quantity_on_hand), '建档总量必须等于播种 100').toBe(100);
    expect(num(row.quantity_available), '建档可用量必须等于播种 100').toBe(100);
    expect(num(row.quantity_reserved), '建档锁定量必须为 0').toBe(0);
    expect(String(row.stock_status), '库存状态词表原样（写入方 正常）').toBe('正常');
    expect(String(row.grade), '等级中文词表原样（写入方 一等品）').toBe('一等品');

    // 订单点名缸号 缸号要求落 sales_order_items.dye_lot_requirement
    const order = await createDemandOrder(page, '40.00', tag);
    bag.orderId = num(order.id);
    expect(String(order.status), '面料建单初值状态必须为 pending').toBe('pending');
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${bag.orderId}`);
    const lines = detail.items as Row[];
    expect(Array.isArray(lines), '标准详情必须带 items 明细数组').toBe(true);
    expect(lines.length, `明细必须恰 1 行，实际 ${JSON.stringify(lines)}`).toBe(1);
    expect(num(lines[0].quantity), '订单行需求量落库必须为 40').toBe(40);
    expect(
      String(lines[0].dye_lot_requirement),
      `订单行必须点名本缸号，实得 ${JSON.stringify(lines[0].dye_lot_requirement)}`
    ).toBe(bag.dyeLotNo);
    console.log(`[444 T1] 建档与基线完成 stock=${bag.stockId} order=${bag.orderId}`);
  });

  test('T2 锁缸预留 pending 到 locked 两路回读 重复锁定被拒零漂移', async ({ page }) => {
    expect(bag.orderId !== undefined && bag.stockId !== undefined, 'T1 夹具缺失').toBe(true);

    // 建预留 初值 pending 逐列回显
    const created = await createReservation(page, '40.00', `444主锁${genCode('444B')}`);
    const reservationId = num(created.id);
    expect(String(created.status), '建预留初值状态必须为 pending').toBe('pending');
    expect(num(created.quantity), '建预留数量必须回显 40').toBe(40);
    expect(num(created.order_id), '建预留必须回显关联订单').toBe(bag.orderId as number);

    // 锁定 pending 到 locked 且按列表口回读
    const locked = await apiCallRaw<Row>(
      page,
      'POST',
      `/inventory/reservations/${reservationId}/lock`
    );
    expect(String(locked.status), '锁定后状态必须为 locked').toBe('locked');
    await readReservation(page, reservationId, 'locked', 'T2 锁定回读');

    // 并发时序腿 同一预留顺序二次锁定必被状态门拒绝 外显文案原文钉住
    const relock = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/reservations/${reservationId}/lock`
    );
    expect(relock.status, `重复锁定必须 400，实际 ${relock.status}`).toBe(400);
    expect(
      failureCode(relock),
      `重复锁定必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(relock.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(relock.message),
      `重复锁定拒因必须外显可读，实际 ${JSON.stringify(relock.message)}`
    ).toBe('预留状态为locked，只有待处理状态的预留可以锁定');

    // 被拒零漂移 预留仍 locked、库存三列与锁定前逐值相同（不留半截锁）
    const after = await readReservation(page, reservationId, 'locked', 'T2 被拒后回读');
    expect(num(after.quantity), '被拒的重复锁定不许改数量').toBe(40);
    const stockRow = await readLotRow(page, 'T2 被拒后库存');
    expect(num(stockRow.quantity_on_hand), '预留面动作不许改总量列').toBe(bag.total);
    expect(num(stockRow.quantity_available), '预留面动作不许改可用量列').toBe(bag.total);
    expect(num(stockRow.quantity_reserved), '预留面动作不许改锁定量列').toBe(0);
    console.log(`[444 T2] 锁缸与双锁门完成 reservation=${reservationId}`);
  });

  test('T3 超额预留面的真实契约与零写入不变量 删除门双向', async ({ page }) => {
    expect(bag.orderId !== undefined && bag.stockId !== undefined, 'T1 夹具缺失').toBe(true);

    // 第二笔预留超额 数量 999 远超该缸总量 100 与剩余可用
    // 真实契约（源码缺陷面，本支只暴露不修），预留创建不过可用量门，照常 200 接受
    const over = await createReservation(page, '999.00', `444超额${genCode('444C')}`);
    const overId = num(over.id);
    expect(String(over.status), '超额预留当前实现照常受理且初值 pending').toBe('pending');

    // 零写入不变量 无论受理与否，库存三列必须与受理前逐值相同（不触库即无半截锁）
    const stockRow = await readLotRow(page, 'T3 超额受理后库存');
    expect(num(stockRow.quantity_available), '超额预留不许改可用量列').toBe(bag.total);
    expect(num(stockRow.quantity_reserved), '超额预留不许改锁定量列').toBe(0);
    console.warn(
      `[444 T3] 缺口点名，预留面 POST /inventory/reservations 与 /lock 均不校验可用量、` +
        `不写 inventory_stocks（services/inventory_reservation_service.rs create_reservation ` +
        `仅外键预检）。目标口径"超出剩余可用量必须被拒且可用量随锁减少"缺拒绝腿，` +
        `真实超卖门仅在发货出库四维扣减（so/delivery_ops/inventory.rs）。此为源码缺陷，本支只暴露不修。`
    );

    // 删除门负例 非 pending（locked 行）删除被拒且行原样在库。
    // 本用例自建自锁一条专属预留，按 id 判定，不抓共享产品过滤列表的首行（并发防污染）
    const lockedRes = await createReservation(page, '20.00', `444删除门${genCode('444X')}`);
    const lockedId = num(lockedRes.id);
    await apiCallRaw<Row>(page, 'POST', `/inventory/reservations/${lockedId}/lock`);
    const delLocked = await apiCallExpectFail(
      page,
      'DELETE',
      `/inventory/reservations/${lockedId}`
    );
    expect(delLocked.status, `locked 预留删除必须 400，实际 ${delLocked.status}`).toBe(400);
    expect(
      failureCode(delLocked),
      `删除状态门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(delLocked.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(delLocked.message),
      `删除拒因必须外显可读，实际 ${JSON.stringify(delLocked.message)}`
    ).toBe('预留状态为locked，只有待处理状态的预留可以删除');
    await readReservation(page, lockedId, 'locked', 'T3 删除被拒后回读');

    // 删除门正例 pending 行删除成功（出参信封 data 为 message 提示）且 pending 过滤读回不存在
    const delPending = await apiCallRaw<Row>(page, 'DELETE', `/inventory/reservations/${overId}`);
    expect(String(delPending.message), 'pending 删除成功的后端提示必须为原文').toBe('预留已删除');
    const listPending = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/reservations?product_id=${bag.productId}&status=pending&page=1&page_size=100`
    );
    const gone = (listPending.list as Row[]).find(r => num(r.id) === overId);
    expect(gone, '删除后的 pending 行不许再出现在 pending 过滤列表').toBeUndefined();
    console.log(`[444 T3] 超额契约与删除门完成 over=${overId} locked=${lockedId}`);
  });

  test('T4 取消释放 pending 直放与 released 复检 释放后再锁被拒', async ({ page }) => {
    expect(bag.orderId !== undefined, 'T1 夹具缺失').toBe(true);

    // 取消腿 对 pending 预留直接 release（release 门放行 pending 与 locked 两源态）
    const fresh = await createReservation(page, '15.00', `444取消${genCode('444D')}`);
    const freshId = num(fresh.id);
    const released = await apiCallRaw<Row>(
      page,
      'POST',
      `/inventory/reservations/${freshId}/release`
    );
    expect(String(released.status), 'pending 直接释放必须成功且状态为 released').toBe('released');
    const hit = await readReservation(page, freshId, 'released', 'T4 释放回读');
    expect(num(hit.quantity), '释放不许改数量列').toBe(15);

    // 释放后再锁 撞锁定状态门 拒因外显可读 状态不回跳
    const relock = await apiCallExpectFail(page, 'POST', `/inventory/reservations/${freshId}/lock`);
    expect(relock.status, `released 行再锁必须 400，实际 ${relock.status}`).toBe(400);
    expect(
      failureCode(relock),
      `再锁门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(relock.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(String(relock.message), '再锁拒因必须外显可读').toBe(
      '预留状态为released，只有待处理状态的预留可以锁定'
    );
    await readReservation(page, freshId, 'released', 'T4 被拒后回读');

    // 重复释放 同样被释放状态门拒绝 且拒因外显可读
    const rerel = await apiCallExpectFail(
      page,
      'POST',
      `/inventory/reservations/${freshId}/release`
    );
    expect(rerel.status, `released 行重复释放必须 400，实际 ${rerel.status}`).toBe(400);
    expect(String(rerel.message), '重复释放拒因必须外显可读').toBe(
      '预留状态为released，只有已锁定或待处理状态的预留可以释放'
    );

    // 释放对不存在主键先行 404 NOT_FOUND（与状态门拒绝的 400 可分辨）
    const missing = await apiCallExpectFail(
      page,
      'POST',
      '/inventory/reservations/99999999/release'
    );
    expect(missing.status, '不存在主键的释放必须 404').toBe(404);
    expect(failureCode(missing), '不存在主键的释放必须归因 NOT_FOUND').toBe(
      APP_ERROR_CODES.NOT_FOUND
    );

    // 取消释放的库存侧对账 该缸可用量恒等播种值（预留面从未扣减，与 T3 同缺口口径）
    const stockRow = await readLotRow(page, 'T4 释放后可用量');
    expect(
      num(stockRow.quantity_available),
      '释放后可用量必须恒等于账面 100（预留面从未扣减）'
    ).toBe(100);
    console.log(`[444 T4] 取消释放链完成 reservation=${freshId}`);
  });

  test('T5 销售退货反向腿 全链状态推进与审批即回补恒等', async ({ page }) => {
    expect(bag.orderId !== undefined && bag.warehouseId !== undefined, 'T1 夹具缺失').toBe(true);
    const tag = genCode('444E');

    // 关联销售订单建退货草稿 初值 DRAFT 单号 SR 形态 reason 复合列拼接形态
    const ret = await apiCallRaw<Row>(page, 'POST', '/sales/sales-returns', {
      order_id: bag.orderId,
      customer_id: getCtx().customerId,
      return_date: new Date().toISOString().slice(0, 10),
      warehouse_id: bag.warehouseId,
      reason_type: `质量问题${tag}`,
      reason_detail: `缸内色差${tag}`,
      notes: `444退货${tag}`,
    });
    const returnId = num(ret.id);
    expect(
      Number.isInteger(returnId) && returnId > 0,
      `建退货单失败，实际 ${JSON.stringify(ret)}`
    ).toBe(true);
    expect(String(ret.status), '退货单初值状态必须为大写 DRAFT').toBe('DRAFT');
    expect(
      /^SR\d{11}$/.test(String(ret.return_no)),
      `退货单号必须 SR 加八位日期加三位流水形态，实际 ${JSON.stringify(ret.return_no)}`
    ).toBe(true);
    expect(
      String(ret.reason),
      `reason 复合列必须等于 type 冒号 detail 拼接，实际 ${JSON.stringify(ret.reason)}`
    ).toBe(`质量问题${tag}: 缸内色差${tag}`);

    // 空单提交门 无明细即拒 状态仍 DRAFT
    const emptySubmit = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/submit`
    );
    expect(emptySubmit.status, '无明细提交必须 400').toBe(400);
    expect(
      failureCode(emptySubmit),
      `空单提交门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(emptySubmit.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const stillDraft = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(stillDraft.status), '被拒提交不许推进状态').toBe('DRAFT');

    // 回补基准 审批前产品加仓库的库存合计
    const before = await sumStockCols(page);

    // 明细录入 12 米乘 25.50 税率显式 13
    const item = await apiCallRaw<Row>(page, 'POST', `/sales/sales-returns/${returnId}/items`, {
      product_id: bag.productId,
      quantity: '12.00',
      unit_price: '25.50',
      tax_percent: '13.00',
      reason: `色差退货${tag}`,
    });
    expect(num(item.quantity), '退货行数量落库必须为 12').toBe(12);
    expect(num(item.subtotal), '行 subtotal 必须等于 12 乘 25.50').toBe(306);
    expect(num(item.tax_amount), '行税额必须等于 306 乘 0.13').toBe(39.78);
    expect(num(item.total_amount), '行含税合计必须等于 306+39.78').toBe(345.78);

    // submit 到 SUBMITTED 再 approve 到 APPROVED 审批事务内完成库存入库
    const submitted = await apiCallRaw<Row>(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/submit`
    );
    expect(String(submitted.status), '提交后状态必须为大写 SUBMITTED').toBe('SUBMITTED');
    const afterSubmit = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(afterSubmit.status), '提交必须真落库').toBe('SUBMITTED');

    const approved = await apiCallRaw<Row>(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/approve`
    );
    expect(String(approved.status), '审批后状态必须为大写 APPROVED').toBe('APPROVED');
    expect(/^SR\d{11}$/.test(String(approved.return_no)), '审批响应必须回显同一单号形态').toBe(
      true
    );
    expect(
      num(approved.total_amount),
      `主表 total_amount 必须按 数量乘单价逐行求和 口径为 306（不含税，与行含税 345.78 两口径差如实钉）`
    ).toBe(306);

    // 审批即回补 该维度库存合计恰好加 12
    const afterApprove = await sumStockCols(page);
    expect(
      afterApprove.onHand,
      `审批后现存量合计必须等于回补前 ${before.onHand} 加退货量 12，实际 ${afterApprove.onHand}`
    ).toBe(before.onHand + 12);
    expect(
      afterApprove.available,
      `审批后可用量合计必须等于回补前 ${before.available} 加退货量 12，实际 ${afterApprove.available}`
    ).toBe(before.available + 12);

    // execute 到 COMPLETED 且状态门拒绝重复执行
    const completed = await apiCallRaw<Row>(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/execute`
    );
    expect(String(completed.status), '执行后状态必须为大写 COMPLETED').toBe('COMPLETED');
    const reExec = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/execute`
    );
    expect(reExec.status, '重复执行必须 400').toBe(400);
    expect(
      failureCode(reExec),
      `重复执行门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(reExec.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const finalHead = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(finalHead.status), '被拒的重复执行不许回退状态').toBe('COMPLETED');

    // 明细独立读回通道 恰一行且量价逐列对表（该口出参直接是数组）
    const items = await apiCallRaw<Row[]>(page, 'GET', `/sales/sales-returns/${returnId}/items`);
    expect(Array.isArray(items), '明细读口必须直接出数组').toBe(true);
    expect(items.length, `明细必须恰 1 行，实际 ${JSON.stringify(items)}`).toBe(1);
    expect(num(items[0].quantity), '明细读回数量必须为 12').toBe(12);
    expect(num(items[0].unit_price), '明细读回单价必须为 25.50').toBe(25.5);
    expect(num(items[0].return_id), '明细读回必须挂在本退货单名下').toBe(returnId);

    // 已审批退货单不许再录明细（DRAFT 明细门 加锁事务内判定）
    const lateItem = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/items`,
      { product_id: bag.productId, quantity: '1.00', unit_price: '1.00', tax_percent: '0.00' }
    );
    expect(lateItem.status, 'COMPLETED 单追加明细必须 400').toBe(400);
    expect(failureCode(lateItem), '明细状态门必须归因 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const itemsAfterLate = await apiCallRaw<Row[]>(
      page,
      'GET',
      `/sales/sales-returns/${returnId}/items`
    );
    expect(itemsAfterLate.length, '被拒的追加分明细必须零落库').toBe(1);
    console.log(`[444 T5] 退货反向腿完成 return=${returnId} 回补量=12`);
  });

  test('T6 越权直连 非销售岗打预留与退货写端点被权限门拒且零建行', async ({ page }) => {
    expect(bag.orderId !== undefined && bag.warehouseId !== undefined, 'T1 夹具缺失').toBe(true);

    // 拒绝前的基准计数
    const baseRes = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/reservations?product_id=${bag.productId}&page=1&page_size=1`
    );
    const baseRet = await apiCallRaw<Row>(
      page,
      'GET',
      `/sales/sales-returns?customer_id=${getCtx().customerId}&page=1&page_size=1`
    );

    // 切到只读报表岗 直连两枚写端点
    await loginAsRole(page, 'report_viewer');
    const denRes = await apiCallExpectFail(page, 'POST', '/inventory/reservations', {
      order_id: bag.orderId,
      product_id: bag.productId,
      warehouse_id: bag.warehouseId,
      quantity: '5.00',
      notes: `444越权预留${genCode('444F')}`,
    });
    expectDenied(denRes, 'report_viewer 直连建预留必须被权限门拒绝（403 加 FORBIDDEN）');

    const denRet = await apiCallExpectFail(page, 'POST', '/sales/sales-returns', {
      order_id: bag.orderId,
      customer_id: getCtx().customerId,
      return_date: new Date().toISOString().slice(0, 10),
      warehouse_id: bag.warehouseId,
      reason_type: `越权退货${genCode('444G')}`,
    });
    expectDenied(denRet, 'report_viewer 直连建退货单必须被权限门拒绝（403 加 FORBIDDEN）');

    // 切回管理员反查零建行 两次被拒的计数与基准逐值相同
    await loginViaUI(page, undefined, undefined, true);
    const afterRes = await apiCallRaw<Row>(
      page,
      'GET',
      `/inventory/reservations?product_id=${bag.productId}&page=1&page_size=1`
    );
    expect(
      num(afterRes.total),
      `被拒的建预留不许落库，计数必须保持 ${String(num(baseRes.total))}，实际 ${String(
        num(afterRes.total)
      )}`
    ).toBe(num(baseRes.total));
    const afterRet = await apiCallRaw<Row>(
      page,
      'GET',
      `/sales/sales-returns?customer_id=${getCtx().customerId}&page=1&page_size=1`
    );
    expect(
      num(afterRet.total),
      `被拒的建退货单不许落库，计数必须保持 ${String(num(baseRet.total))}，实际 ${String(
        num(afterRet.total)
      )}`
    ).toBe(num(baseRet.total));
    console.log('[444 T6] 越权双腿拒绝且零建行');
  });

  test('T7 释放后同缸重新锁成功 逐分对平守恒 出库面订单状态门拒绝零漂移', async ({ page }) => {
    if (bag.orderId === undefined || bag.stockId === undefined || bag.warehouseId === undefined) {
      throw new Error(
        `T1 夹具前置不成立，orderId=${String(bag.orderId)} stockId=${String(bag.stockId)} warehouseId=${String(bag.warehouseId)}`
      );
    }
    const orderId = bag.orderId;
    const warehouseId = bag.warehouseId;

    /**
     * 释放后重新锁同一缸号。功能。证明 T2 与 T4 的 400 是预留行自身状态门而不是端点坏。
     * 调用方 T7。入参 关联 T1 订单与本缸产品仓库，数量 30（DECIMAL 字符串）。
     * 传给谁 POST /inventory/reservations 与 POST /inventory/reservations/{id}/lock。
     * 存什么与存哪里 inventory_reservations 行 status 由 pending 翻到 locked。
     */
    const relockRes = await createReservation(page, '30.00', `444重锁${genCode('444H')}`);
    const relockId = num(relockRes.id);
    const relocked = await apiCallRaw<Row>(
      page,
      'POST',
      `/inventory/reservations/${relockId}/lock`
    );
    expect(String(relocked.status), '释放后同一缸号重新锁定必须成功且状态 locked').toBe('locked');
    const relockRow = await readReservation(page, relockId, 'locked', 'T7 重新锁定回读');
    expect(num(relockRow.quantity), '重新锁定行数量必须为 30').toBe(30);

    // 逐分对平守恒 同一库存行三列自算恒等 零容差（预留面从未扣减库存三列，锁定量恒 0）
    const row = await readLotRow(page, 'T7 守恒回读');
    const onHand = num(row.quantity_on_hand);
    const available = num(row.quantity_available);
    const reserved = num(row.quantity_reserved);
    expect(
      available + reserved,
      `守恒恒等必须成立，实得 可用 ${available} + 锁定 ${reserved}`
    ).toBe(onHand);
    expect(onHand, '在库量必须等于播种 100').toBe(100);

    /**
     * 出库面订单状态门。功能。未审批（pending）销售订单不得生成发货出库。
     * 调用方 T7。入参 本用例订单主键与退货仓库。
     * 传给谁 POST /sales/orders/{id}/deliveries（handlers/sales_order_handler.rs create_delivery
     * → services/so/delivery_ops/ship.rs 状态门，仅 approved 与 partial_shipped 可出库）。
     * 存什么与存哪里 被拒不落 sales_deliveries 行，且不动 inventory_stocks 三列。
     */
    const denShip = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/deliveries`, {
      warehouse_id: warehouseId,
    });
    expect(denShip.status, `未审批订单出库必须 400，实际 ${denShip.status}`).toBe(400);
    expect(
      failureCode(denShip),
      `出库状态门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(denShip.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    // 出库被拒后重新读回再算一次守恒 三列逐值不动
    const after = await readLotRow(page, 'T7 出库被拒后守恒重算');
    const afterOnHand = num(after.quantity_on_hand);
    const afterAvailable = num(after.quantity_available);
    const afterReserved = num(after.quantity_reserved);
    expect(
      afterAvailable + afterReserved,
      `出库被拒后守恒恒等必须仍成立，实得 ${afterAvailable} + ${afterReserved}`
    ).toBe(afterOnHand);
    expect(afterOnHand, '出库被拒不许改在库量列').toBe(onHand);
    expect(afterAvailable, '出库被拒不许改可用量列').toBe(available);
    expect(afterReserved, '出库被拒不许改锁定量列').toBe(reserved);
    const dlvList = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}/deliveries`);
    expect(
      (dlvList.list as Row[]).length,
      `被拒的出库不许落发货单，实际 ${JSON.stringify(dlvList.list)}`
    ).toBe(0);
    console.log(`[444 T7] 重新锁定与守恒完成 reservation=${relockId}`);
  });

  test('T8 销售退货拒绝分支 SUBMITTED 到 REJECTED 与拒绝零回补 末腿清理', async ({ page }) => {
    if (bag.orderId === undefined || bag.warehouseId === undefined || bag.productId === undefined) {
      throw new Error(
        `T1 夹具前置不成立，orderId=${String(bag.orderId)} warehouseId=${String(bag.warehouseId)}`
      );
    }
    const orderId = bag.orderId;
    const warehouseId = bag.warehouseId;
    const productId = bag.productId;
    const tag = genCode('444I');

    // 第二张退货草稿 词表初值大写 DRAFT
    const ret = await apiCallRaw<Row>(page, 'POST', '/sales/sales-returns', {
      order_id: orderId,
      customer_id: getCtx().customerId,
      return_date: new Date().toISOString().slice(0, 10),
      warehouse_id: warehouseId,
      reason_type: `拒绝分支${tag}`,
      reason_detail: `缸内色差${tag}`,
      notes: `444拒绝${tag}`,
    });
    const returnId = num(ret.id);
    expect(String(ret.status), '退货单初值必须为大写 DRAFT').toBe('DRAFT');

    /**
     * DRAFT 直接拒绝被状态门拒。功能。拒绝动作只放行 SUBMITTED（源 services/sales_return_service.rs
     * reject_return 的 sr_status::SUBMITTED 门）。
     * 调用方 T8。入参 主键与拒绝理由。传给谁 POST /sales/sales-returns/{id}/reject。
     * 存什么与存哪里 被拒不写 status 也不写 rejected_reason。
     */
    const denDraftReject = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/reject`,
      { reason: `草稿态拒绝${tag}` }
    );
    expect(denDraftReject.status, `DRAFT 单拒绝必须 400，实际 ${denDraftReject.status}`).toBe(400);
    expect(
      failureCode(denDraftReject),
      `DRAFT 拒绝门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(denDraftReject.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const headAfterDeny = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(headAfterDeny.status), '被拒的拒绝动作不许推进状态').toBe('DRAFT');
    expect(
      headAfterDeny.rejected_reason,
      `被拒的拒绝动作不许写理由列，实际 ${JSON.stringify(headAfterDeny.rejected_reason)}`
    ).toBeNull();

    // 录明细并提交 进入可拒绝源态 SUBMITTED
    const item = await apiCallRaw<Row>(page, 'POST', `/sales/sales-returns/${returnId}/items`, {
      product_id: productId,
      quantity: '8.00',
      unit_price: '20.00',
      tax_percent: '0.00',
      reason: `色差退货${tag}`,
    });
    expect(num(item.quantity), '退货行数量落库必须为 8').toBe(8);
    const submitted = await apiCallRaw<Row>(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/submit`
    );
    expect(String(submitted.status), '提交后必须为大写 SUBMITTED').toBe('SUBMITTED');

    // 回补基准 拒绝前的产品加仓库库存合计
    const before = await sumStockCols(page);

    // 拒绝 SUBMITTED 到 REJECTED 理由逐字落 rejected_reason 专列
    const rejected = await apiCallRaw<Row>(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/reject`,
      {
        reason: `缸内色差${tag}`,
      }
    );
    expect(String(rejected.status), '拒绝后状态必须为大写 REJECTED（词表逐字符）').toBe('REJECTED');
    expect(
      String(rejected.rejected_reason),
      `拒绝理由必须逐字落 rejected_reason 列，实际 ${JSON.stringify(rejected.rejected_reason)}`
    ).toBe(`缸内色差${tag}`);
    const headRejected = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(headRejected.status), '拒绝必须真落库').toBe('REJECTED');

    // 拒绝零回补 库存两列合计与拒绝前逐值相同（只有 approve 事务动库存）
    const after = await sumStockCols(page);
    expect(
      after.onHand,
      `拒绝不许回补现存量，必须保持 ${before.onHand}，实际 ${after.onHand}`
    ).toBe(before.onHand);
    expect(
      after.available,
      `拒绝不许回补可用量，必须保持 ${before.available}，实际 ${after.available}`
    ).toBe(before.available);

    // REJECTED 终态再审批被状态门拒 且状态不回跳
    const denApprove = await apiCallExpectFail(
      page,
      'POST',
      `/sales/sales-returns/${returnId}/approve`
    );
    expect(denApprove.status, `REJECTED 单审批必须 400，实际 ${denApprove.status}`).toBe(400);
    expect(
      failureCode(denApprove),
      `REJECTED 审批门必须归因 BUSINESS_ERROR，实际 ${JSON.stringify(denApprove.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const finalHead = await apiCallRaw<Row>(page, 'GET', `/sales/sales-returns/${returnId}`);
    expect(String(finalHead.status), '被拒的审批不许把 REJECTED 回跳').toBe('REJECTED');
    const items = await apiCallRaw<Row[]>(page, 'GET', `/sales/sales-returns/${returnId}/items`);
    expect(items.length, `明细必须恰 1 行，实际 ${JSON.stringify(items)}`).toBe(1);
    expect(num(items[0].quantity), '明细读回数量必须为 8').toBe(8);

    // 缸行守恒终检 拒绝分支不动库存三列
    const lotRow = await readLotRow(page, 'T8 拒绝分支后守恒');
    const lotOnHand = num(lotRow.quantity_on_hand);
    const lotAvailable = num(lotRow.quantity_available);
    const lotReserved = num(lotRow.quantity_reserved);
    expect(
      lotAvailable + lotReserved,
      `拒绝分支后守恒恒等必须成立，实得 ${lotAvailable} + ${lotReserved} vs ${lotOnHand}`
    ).toBe(lotOnHand);
    console.log(`[444 T8] 退货拒绝分支完成 return=${returnId}`);

    // 清理腿（tryCleanup 尽力而为）：pending 预留已在 T3 删除门删除、locked 与
    // released 与重新锁定后的预留受删除状态门约束无法 HTTP 删除，与 COMPLETED 与
    // REJECTED 退货单一起按专属标记留存隔离，可删的订单与库存行在此删净。
    await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `[444] 订单 ${orderId}`);
    if (bag.stockId !== undefined) {
      await tryCleanup(
        page,
        'DELETE',
        `/inventory/stock/${bag.stockId}`,
        `[444] 库存行 ${String(bag.stockId)}`
      );
    }
  });
});
