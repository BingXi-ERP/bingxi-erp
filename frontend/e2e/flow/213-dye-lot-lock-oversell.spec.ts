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
} from './helpers';

/**
 * 面料缸号锁定防超卖与释放回滚 E2E 用例（四枚 test）
 *
 * 功能。把"某缸号被按需求量锁定后可用量口径 = 总量 − 锁定量、锁定量逐列等于期望值"
 * 钉成写后逐列回读断言（T1）；把满额锁定后超额第二单的库存零写入不变量钉成回读
 * 断言（T2）；把释放锁定后回滚且不误伤同品另一缸号钉成双路回读断言（T3）；
 * 把库存锁定 PUT 的权限面钉成双向两腿（T4）：未持有派生键 stock:update 的仓库经理角色被 RBAC
 * 拒绝且库存行零写入，持有该键的仓管角色被放行且锁定量与可用量真实落库。
 *
 * 调用方。Playwright E2E 串行链，T1–T3 走 worker 专属管理员会话，T4 在管理员播种
 * 并基准锁定后先切到 warehouse_manager 角色会话做拒绝腿、再切到 warehouse_keeper 做放行腿，
 * 两腿之后都切回管理员做逐列回读与清理。库存数量列
 * quantity_on_hand / quantity_available / quantity_reserved 对非管理员会被数据权限
 * 默认隐藏（见后端字段权限分支），全列回读需管理员会话。
 *
 * 入参。每枚用例自带唯一缸号与色号，维度值只增不改、跨用例不共享可变夹具态；
 * 夹具产品与仓库取 ensureTestEntities 落库的真实主键。
 *
 * 传给谁。播种腿打 POST /inventory/stock/fabric（面料四维库存直建）；建单腿打
 * POST /sales/fabric-orders 与标准明细读回 GET /sales/orders/{id}；缸号锁定与释放的
 * 持久化腿打 PUT /inventory/stock/{id}（携带 GET 回读到的乐观锁版本号）；两路回读分别打
 * GET /inventory/stock/{id} 与 GET /inventory/stock?product_id&dye_lot_no。
 *
 * 存什么。inventory_stocks 行的 quantity_on_hand（总量） quantity_available（可用量）
 * quantity_reserved（锁定量）三列，与 sales_order_item 行的 quantity 与 dye_lot_requirement。
 * 金额与数量列出参是 DECIMAL 字符串，数值比对一律 Number 归一。
 *
 * 存哪里。PostgreSQL inventory_stocks 与 sales_order_item 与 sales_orders，缸号维度是
 * inventory_stocks.dye_lot_no（可空列，染色布经 fabric_class 联动必填校验后非空）。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 缸号锁定落库口径的唯一持久化落点在库存行三列。销售订单建单口（面料口与标准口）
 * 只把明细的 dye_lot_requirement 作为文本要求落 sales_order_item，不对 inventory_stocks
 * 做任何锁定或扣减，也不生成预留行——建单不做超卖校验，见 services/so/fabric_order.rs
 * 与 services/so/order_crud.rs。库存预留口 POST /inventory/reservations 及其 lock /
 * release 动作只在 inventory_reservations（订单+产品+仓库三维，无缸号列）翻转状态，
 * 从不写 inventory_stocks 的可用量与锁定量，见 services/inventory_reservation_service.rs
 * 与 handlers/inventory_reservation_handler.rs。
 * 因此本文件把"缸号被锁定后的可用量口径"钉在库存行三列这一真实落点上：锁定量与据此
 * 扣减的可用量通过库存改单端点 PUT /inventory/stock/{id} 落库（该端点是 HTTP 面唯一能把
 * quantity_reserved 写成非零的持久化入口，且以 version 乐观锁串行化并发编辑），
 * 播种腿 POST /inventory/stock/fabric 初值为 总量 = 可用量、锁定量为零，见
 * handlers/inventory_stock_handler.rs 与 handlers/inventory_stock_handler_fabric.rs。
 *
 * 超卖拒绝腿缺口（T2 的立论）。缸号超卖拦截仅在发货出库的四维扣减规划里生效
 * （可用量不足即整单拒绝并回滚，见 services/so/delivery_ops/inventory.rs 的
 * reduce_inventory_four_dim），而建单口与预留口都不过可用量门。因此"同一缸再下
 * 超出剩余可用量的第二张销售订单"在 HTTP 面被照常接受。T2 按既有契约如实记录：
 * 超额第二单无论是否被接受，库存行三列零写入（建单不触 inventory_stocks）；
 * 缺口在交付说明里点名——拒绝腿仅存在于发货出库面。
 *
 * RBAC 权限腿判据（T4 的立论，两腿同源）。权限中间件在 handler 之前按 URL 段派生
 * resource:action 键再查角色授权行（middleware/permission.rs 的 permission_middleware 与
 * check_permission）：PUT /api/v1/erp/inventory/stock/{id} 派生 resource_type="stock"、
 * action="update"、resource_id=记录主键（utils/path_utils.rs 判 inventory 为模块前缀并取其
 * 下第四段 stock，RESOURCE_NAME_MAP 无 inventory+stock 消歧条目故保留 "stock" 原名；
 * PUT 经 method_to_action 得 update；末段是数字主键故取为 resource_id）。该路径既不在
 * 公共面也不在自助豁免面（middleware/public_routes.rs 两张清单均为精确匹配），白名单层放行
 * segment3=inventory，所以这条面上的 200 只可能来自授权行命中、绝不来自豁免。
 * 种子矩阵（init_service_ops/permission.rs 的库存仓储域分组）对 warehouse_keeper 逐动作授予
 * stock 的 read/create/update 三行，仓管本就是库存维护岗（收货、录细码卷号、盘点、库位调拨），
 * 因此仓管打这一腿得 200 是授权面的真实行为；同分组的 warehouse_manager 只有 pieces 与
 * greige-fabrics 与 suppliers 与 scan-receipt 四族细键、不含任何 stock 键，同一条 PUT 对它
 * 必 403。故 T4 钉成双向两腿：warehouse_manager 的 403 + FORBIDDEN 钉拒绝面（并钉拒绝不触库），
 * warehouse_keeper 的 200 + 读回落库钉放行面。403 + FORBIDDEN 归因权限面而非参数面，因为参数
 * 校验的 BAD_REQUEST / VALIDATION_ERROR / BUSINESS_ERROR 均产 400 而非 403；放行腿必须真写进
 * inventory_stocks 三列，否则两腿任一被改动时另一腿无法独善，断言会空转。
 *
 * 状态词表取值清单（逐字符取自后端源 models/status/）：
 * - inventory_reservation.status：pending / locked / released / consumed / cancelled
 * - sales_fabric_order.status：pending / approved / rejected
 * - inventory_stock_status：正常 / 报废 / 已删除
 */

type Row = Record<string, unknown>;

/** DECIMAL 出参是字符串，数值判定一律先 Number 归一再比（不混比字符串与数值） */
const num = (v: unknown): number => Number(String(v));

/**
 * 播种一条带全四维（含唯一缸号）的可用库存行，返回按缸号回读到的真实行（含 id 与 version）。
 * 调用方：本文件 T1–T4。入参：page + 四维标识 + 总量。
 * 传给谁：seedFourDimStockIn（helpers），该函数打 POST /inventory/stock/fabric 后
 * GET /inventory/stock 回读。存什么/存哪里：inventory_stocks 行。
 */
async function seedLotStock(
  page: Page,
  productId: number,
  warehouseId: number,
  colorNo: string,
  dyeLotNo: string,
  total: number
): Promise<Row> {
  const row = await seedFourDimStockIn(page, {
    productId,
    warehouseId,
    colorNo,
    dyeLotNo,
    batchNo: `B-${dyeLotNo}`,
    quantityMeters: String(total),
  });
  expect(row, `播种缸号 ${dyeLotNo} 后按四维回读不到库存行`).not.toBeNull();
  const id = num(row.id);
  expect(
    Number.isInteger(id) && id > 0,
    `播种回读的库存行主键必须是正整数，实际 ${JSON.stringify(row)}`
  ).toBe(true);
  expect(
    num(row.quantity_on_hand),
    `播种后总量必须等于 ${total}，实际 ${JSON.stringify(row.quantity_on_hand)}`
  ).toBe(total);
  expect(
    num(row.quantity_available),
    `播种后可用量必须等于总量 ${total}，实际 ${JSON.stringify(row.quantity_available)}`
  ).toBe(total);
  expect(
    num(row.quantity_reserved),
    `播种后锁定量必须为 0，实际 ${JSON.stringify(row.quantity_reserved)}`
  ).toBe(0);
  return row;
}

/**
 * 按主键回读单行库存（GET /inventory/stock/{id}）。
 * 调用方：T1–T4 锁前后回读。入参：page + 库存行主键。
 * 传给谁：断言函数。存什么/存哪里：不持久化，返回当前值快照。
 */
async function readStockById(page: Page, id: number): Promise<Row> {
  return await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
}

/**
 * 按缸号回读库存行（GET /inventory/stock?product_id&dye_lot_no），要求唯一命中。
 * 调用方：T1/T3 两路交叉验证。入参：page + productId + dyeLotNo。
 * 传给谁：断言函数。存什么/存哪里：不持久化。
 */
async function readStockByDyeLot(page: Page, productId: number, dyeLotNo: string): Promise<Row> {
  const path =
    `/inventory/stock?product_id=${productId}` +
    `&dye_lot_no=${encodeURIComponent(dyeLotNo)}&page=1&page_size=50`;
  const res = await apiCallRaw<{ items: Row[] }>(page, 'GET', path);
  expect(
    Array.isArray(res.items),
    `按缸号回读必须出 items 数组，实际 ${JSON.stringify(res)}`
  ).toBe(true);
  expect(
    res.items.length,
    `唯一缸号 ${dyeLotNo} 必须恰命中一行，实际 ${JSON.stringify(res.items)}`
  ).toBe(1);
  return res.items[0];
}

/**
 * 对某缸号库存行施加"锁定量 + 据此扣减可用量"的落库写入。
 * 现取该行乐观锁版本号再 PUT，避免版本号漂移；总量列不提交，服务端保持原值不动。
 * 调用方：T1/T2/T3。入参：page + 库存行 id + 锁定量字符串 + 可用量字符串。
 * 传给谁：PUT /inventory/stock/{id}（handlers/inventory_stock_handler.rs update_stock）。
 * 存什么/存哪里：quantity_reserved 与 quantity_available 写入 inventory_stocks 行。
 */
async function lockLotStock(
  page: Page,
  id: number,
  reservedStr: string,
  availableStr: string
): Promise<void> {
  const cur = await readStockById(page, id);
  const version = num(cur.version);
  expect(
    Number.isInteger(version) && version >= 0,
    `回读的乐观锁版本号必须是非负整数，实际 ${JSON.stringify(cur.version)}`
  ).toBe(true);
  await apiCallRaw<Row>(page, 'PUT', `/inventory/stock/${id}`, {
    quantity_reserved: reservedStr,
    quantity_available: availableStr,
    version,
  });
}

/**
 * 逐列钉锁定口径：总量不变、锁定量 = 期望需求、可用量 = 总量 − 锁定量，且等式自洽。
 * 调用方：T1/T3 回读后。入参：row + label + total + demand。
 * 传给谁：expect 断言。存什么/存哪里：不持久化，只判读。
 */
function assertLockColumns(row: Row, label: string, total: number, demand: number): void {
  expect(
    num(row.quantity_on_hand),
    `${label} 总量必须仍为播种值 ${total}，实得 ${JSON.stringify(row.quantity_on_hand)}`
  ).toBe(total);
  expect(
    num(row.quantity_reserved),
    `${label} 锁定量必须逐列等于订单行需求量 ${demand}，实得 ${JSON.stringify(row.quantity_reserved)}`
  ).toBe(demand);
  expect(
    num(row.quantity_available),
    `${label} 可用量必须等于 总量−锁定 = ${total - demand}，实得 ${JSON.stringify(row.quantity_available)}`
  ).toBe(total - demand);
  expect(
    num(row.quantity_available),
    `${label} 可用口径 可用 = 总量 − 锁定 必须自洽，实得可用=${JSON.stringify(
      row.quantity_available
    )} 总量=${JSON.stringify(row.quantity_on_hand)} 锁定=${JSON.stringify(row.quantity_reserved)}`
  ).toBe(num(row.quantity_on_hand) - num(row.quantity_reserved));
}

/**
 * 建一枚单行面料销售订单并回读该明细行，返回订单主键与明细行。
 * 调用方：T1。入参：page + productId + customerId + 色号 + 缸号 + 需求量 + 标记。
 * 传给谁：POST /sales/fabric-orders（handlers/sales_fabric_order_handler.rs），
 * 再 GET /sales/orders/{id}（handlers/sales_handler.rs）取明细。
 * 存什么/存哪里：sales_orders 主行 + sales_order_item 明细行。
 */
async function createOrderDemandingLot(
  page: Page,
  productId: number,
  customerId: number,
  colorNo: string,
  dyeLotNo: string,
  demand: number,
  tag: string
): Promise<{ orderId: number; line: Row }> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/fabric-orders', {
    customer_id: customerId,
    order_date: new Date().toISOString(),
    required_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    remarks: `缸号锁定链${tag}`,
    items: [
      {
        product_id: productId,
        quantity_meters: demand.toFixed(2),
        quantity_kg: (demand / 3).toFixed(2),
        unit_price_meters: '25.50',
        color_no: colorNo,
        dye_lot_requirement: dyeLotNo,
      },
    ],
  });
  const orderId = num(created.id);
  expect(
    Number.isInteger(orderId) && orderId > 0,
    `建单必须返回正整数主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
  expect(Array.isArray(detail.items), `标准详情必须带 items 明细数组`).toBe(true);
  const lines = detail.items as Row[];
  expect(lines.length, `明细必须恰为提交的 1 行，实际 ${JSON.stringify(lines)}`).toBe(1);
  return { orderId, line: lines[0] };
}

/**
 * 按唯一备注标记把该客户下本用例遗留的 pending 面料单撤态删除。
 * 调用方：T2（超额第二单清理）。入参：page + customerId + tag。
 * 传给谁：GET /sales/fabric-orders（列表查询）与 DELETE /sales/orders/{id}。
 * 存什么/存哪里：不新建数据，清理 sales_orders 残留行。
 */
async function purgeOrdersByTag(page: Page, customerId: number, tag: string): Promise<void> {
  const list = await apiCallRaw<{ items: Row[] }>(
    page,
    'GET',
    `/sales/fabric-orders?customer_id=${customerId}&status=pending&page=1&page_size=100`
  );
  const leaked = (list.items as Row[]).filter(r => String(r.notes).includes(tag));
  for (const r of leaked) {
    await tryCleanup(page, 'DELETE', `/sales/orders/${num(r.id)}`, `[213] 泄漏单 ${num(r.id)}`);
  }
}

test.describe.serial('面料缸号锁定防超卖口径链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 按订单行需求量锁定缸号后 两路回读逐列钉 可用=总量−锁定', async ({ page }) => {
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0 && ctx.customerId !== undefined,
      `夹具缺产品/仓库/客户，productIds=${ctx.productIds.length} warehouseIds=${ctx.warehouseIds.length} customer=${String(
        ctx.customerId
      )}`
    ).toBe(true);
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const customerId = ctx.customerId as number;
    const tag = genCode('213A');
    const colorNo = `E2E${tag}`;
    const dyeLotNo = `LOT-${tag}`;
    const total = 100;

    const seeded = await seedLotStock(page, productId, warehouseId, colorNo, dyeLotNo, total);
    const stockId = num(seeded.id);

    const { orderId, line } = await createOrderDemandingLot(
      page,
      productId,
      customerId,
      colorNo,
      dyeLotNo,
      30,
      tag
    );
    const demand = num(line.quantity);
    expect(
      demand,
      `订单行落库需求量必须为建单提交的 30，实得 quantity=${JSON.stringify(line.quantity)}`
    ).toBe(30);
    expect(
      String(line.dye_lot_requirement),
      `订单行必须点名本缸号，实得 dye_lot_requirement=${JSON.stringify(line.dye_lot_requirement)}`
    ).toBe(dyeLotNo);

    await lockLotStock(page, stockId, demand.toFixed(2), (total - demand).toFixed(2));

    const byId = await readStockById(page, stockId);
    const byLot = await readStockByDyeLot(page, productId, dyeLotNo);
    assertLockColumns(byId, '按主键回读', total, demand);
    assertLockColumns(byLot, '按缸号回读', total, demand);
    for (const col of ['quantity_on_hand', 'quantity_available', 'quantity_reserved']) {
      expect(
        num(byLot[col]),
        `两路回读列 ${col} 必须逐值相等，按主键=${JSON.stringify(byId[col])} 按缸号=${JSON.stringify(
          byLot[col]
        )}`
      ).toBe(num(byId[col]));
    }

    await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `[213] T1 订单 ${orderId}`);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `[213] T1 库存 ${stockId}`);
  });

  /**
   * T2 缸号满额锁定后超额第二单的零写入回读与真实契约记录。
   *
   * 既有契约：建单口 POST /sales/fabric-orders 不检查库存可用量——
   * create_fabric_order 仅校验明细非负与精度（so/fabric_order.rs validate_fabric_order_items），
   * 不读 inventory_stocks，不生成预留行。缸号超卖拒绝腿仅在发货出库
   * reduce_inventory_four_dim（so/delivery_ops/inventory.rs）按四维扣减时生效，
   * 建单面缺失该门控。
   *
   * 本用例按"读回既有契约的真实值"写：钉满额锁定后库存行三列不被建单改写（零写入
   * 不变量），记录超额第二单的真实 HTTP 状态与落库结果，并在 console.warn 里点名缺口。
   * 拒绝腿补齐后可把 console.warn 改为断言被拒（status 400 + code BUSINESS_ERROR）。
   */
  test('T2 缸号满额锁定后超额第二单零写入回读 建单面拒绝腿缺口点名', async ({ page }) => {
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0 && ctx.customerId !== undefined,
      `夹具缺产品/仓库/客户，无法构造超额场景`
    ).toBe(true);
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const customerId = ctx.customerId as number;
    const tag = genCode('213B');
    const colorNo = `E2E${tag}`;
    const dyeLotNo = `LOT-${tag}`;
    const total = 50;

    const seeded = await seedLotStock(page, productId, warehouseId, colorNo, dyeLotNo, total);
    const id = num(seeded.id);

    // 第一张满额锁定：可用量归零
    await lockLotStock(page, id, total.toFixed(2), '0');
    const afterLock = await readStockById(page, id);
    expect(
      num(afterLock.quantity_available),
      `满额锁定后可用量必须为 0，实得 ${JSON.stringify(afterLock.quantity_available)}`
    ).toBe(0);

    // 捕获锁定后的三列基准值，用于超额第二单后的零写入对比
    const reservedBaseline = num(afterLock.quantity_reserved);
    const availableBaseline = num(afterLock.quantity_available);
    const onHandBaseline = num(afterLock.quantity_on_hand);

    // 第二张：需求 999 远超剩余可用 0，建单口按既有契约不检查可用量
    const second = await apiCallExpectFail(page, 'POST', '/sales/fabric-orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      required_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      remarks: `超额第二单${tag}`,
      items: [
        {
          product_id: productId,
          quantity_meters: '999.00',
          quantity_kg: '333.00',
          unit_price_meters: '25.50',
          color_no: colorNo,
          dye_lot_requirement: dyeLotNo,
        },
      ],
    });

    // 核心不变量：超额第二单不得改写缸号锁定量与可用量与总量（零写入）
    // 该不变量在两种契约结局下都成立：(a) 建单被拒（未来修复后），(b) 建单被接受但不触库存（当前）
    const afterSecond = await readStockById(page, id);
    expect(
      num(afterSecond.quantity_reserved),
      `超额第二单不得改写锁定量，必须仍为 ${reservedBaseline}，实得 ${JSON.stringify(
        afterSecond.quantity_reserved
      )}`
    ).toBe(reservedBaseline);
    expect(
      num(afterSecond.quantity_available),
      `超额第二单不得改写可用量，必须仍为 ${availableBaseline}，实得 ${JSON.stringify(
        afterSecond.quantity_available
      )}`
    ).toBe(availableBaseline);
    expect(
      num(afterSecond.quantity_on_hand),
      `超额第二单不得改写总量，必须仍为 ${onHandBaseline}，实得 ${JSON.stringify(
        afterSecond.quantity_on_hand
      )}`
    ).toBe(onHandBaseline);

    // 记录真实契约行为并点名缺口
    console.warn(
      `[213 T2] 超额第二单 HTTP status=${second.status} code=${JSON.stringify(second.code)} ` +
        `message=${JSON.stringify(second.message)} — ` +
        `缺口：建单口 POST /sales/fabric-orders 不检查库存可用量（so/fabric_order.rs ` +
        `create_fabric_order 仅校验明细非负精度，不读 inventory_stocks）；` +
        `缸号超卖拒绝腿仅在发货出库面生效（so/delivery_ops/inventory.rs ` +
        `reduce_inventory_four_dim），建单面缺失。拒绝腿补齐后应断言 second.status === 400。`
    );

    // 清理（若被接受则删除泄漏单，若被拒绝则无泄漏）
    await purgeOrdersByTag(page, customerId, `超额第二单${tag}`);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${id}`, `[213] T2 库存 ${id}`);
  });

  test('T3 释放缸号锁定后锁定量归零可用量回播种值 同品同仓另一缸号不被连带清掉', async ({
    page,
  }) => {
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0,
      `夹具缺产品或仓库，无法构造双缸隔离场景`
    ).toBe(true);
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];

    const tagA = genCode('213CA');
    const tagB = genCode('213CB');
    const dyeLotA = `LOT-${tagA}`;
    const dyeLotB = `LOT-${tagB}`;
    const colorA = `E2E${tagA}`;
    const colorB = `E2E${tagB}`;
    const total = 100;
    const lockA = 30;
    const lockB = 40;

    await seedLotStock(page, productId, warehouseId, colorA, dyeLotA, total);
    await seedLotStock(page, productId, warehouseId, colorB, dyeLotB, total);
    const rowA = await readStockByDyeLot(page, productId, dyeLotA);
    const rowB = await readStockByDyeLot(page, productId, dyeLotB);
    const idA = num(rowA.id);
    const idB = num(rowB.id);

    // 两缸各按自身需求量锁定
    await lockLotStock(page, idA, lockA.toFixed(2), (total - lockA).toFixed(2));
    await lockLotStock(page, idB, lockB.toFixed(2), (total - lockB).toFixed(2));
    assertLockColumns(await readStockById(page, idA), '释放前 A 缸主键回读', total, lockA);
    assertLockColumns(await readStockById(page, idB), '释放前 B 缸主键回读', total, lockB);

    // 释放 A 缸锁定：锁定量归零、可用量回到播种值、总量不变
    await lockLotStock(page, idA, '0', total.toFixed(2));
    const aById = await readStockById(page, idA);
    const aByLot = await readStockByDyeLot(page, productId, dyeLotA);
    for (const [label, row] of [
      ['释放后 A 缸主键回读', aById],
      ['释放后 A 缸按缸号回读', aByLot],
    ] as Array<[string, Row]>) {
      expect(
        num(row.quantity_reserved),
        `${label} 锁定量必须归零，实得 ${JSON.stringify(row.quantity_reserved)}`
      ).toBe(0);
      expect(
        num(row.quantity_available),
        `${label} 可用量必须回到播种值 ${total}，实得 ${JSON.stringify(row.quantity_available)}`
      ).toBe(total);
      expect(
        num(row.quantity_on_hand),
        `${label} 总量必须保持播种值 ${total} 不变，实得 ${JSON.stringify(row.quantity_on_hand)}`
      ).toBe(total);
    }
    expect(
      num(aByLot.quantity_reserved),
      `A 缸两路回读锁定量必须一致，按主键=${JSON.stringify(aById.quantity_reserved)} 按缸号=${JSON.stringify(
        aByLot.quantity_reserved
      )}`
    ).toBe(num(aById.quantity_reserved));

    // 隔离：释放 A 缸不得连带清掉同品同仓另一缸号 B 的锁定量与可用量
    const bById = await readStockById(page, idB);
    const bByLot = await readStockByDyeLot(page, productId, dyeLotB);
    assertLockColumns(bById, '释放 A 后 B 缸主键回读', total, lockB);
    assertLockColumns(bByLot, '释放 A 后 B 缸按缸号回读', total, lockB);

    await tryCleanup(page, 'DELETE', `/inventory/stock/${idA}`, `[213] T3 库存 A ${idA}`);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${idB}`, `[213] T3 库存 B ${idB}`);
  });

  /**
   * T4 库存锁定 PUT 的权限双向两腿：仓库经理被拒 403 且零写入、仓管放行且真实落库。
   *
   * 功能。同一枚 PUT /inventory/stock/{id} 锁定请求按角色拆成两腿钉死权限面。拒绝腿验证
   * 不含任何 stock 键的 warehouse_manager 角色被权限中间件拒绝 HTTP 403 code=FORBIDDEN
   * （归因权限面而非参数面），并钉拒绝后库存行三列与乐观锁版本号逐列不动。放行腿验证
   * 持有派生键 stock:update 的 warehouse_keeper 角色同一请求得 200，且锁定量与可用量
   * 真的写进库存行。两腿成对的意义：只钉拒绝腿会因"该面被全员豁免"而假绿，只钉放行腿
   * 会因"全员都能写"而假绿。
   *
   * 调用方。本用例先以管理员会话播种库存并做一次基准锁定、捕获回读到的乐观锁版本号，
   * 再依次 loginAsRole 切到 warehouse_manager 做拒绝腿、切到 warehouse_keeper 做放行腿，
   * 每条腿之后都切回管理员做逐列回读，末尾清理库存行。
   *
   * 入参。productId / warehouseId / colorNo / dyeLotNo / total 由管理员阶段播种；
   * 拒绝腿与放行腿各用独立的目标锁定量，便于从回读值直接分辨是哪条腿写的。
   * 传给谁。apiCallExpectFail → PUT /inventory/stock/{id}（handlers/inventory_stock_handler.rs
   * update_stock），拒绝发生在 middleware/permission.rs permission_middleware 进入 handler
   * 之前；放行腿走 apiCallRaw 打同一端点，两腿回读均走 GET /inventory/stock/{id}。
   *
   * 存什么。拒绝腿存"四列不动"：quantity_reserved / quantity_available / quantity_on_hand
   * 与 version 逐列等于基准值（version 不动同时证明请求没进 handler）。放行腿存"两列改到
   * 目标值 + 总量不动 + version 前进"。
   * 存哪里。PostgreSQL inventory_stocks 行；拒绝不触 DB，放行才写该行。
   *
   * RBAC 键派生与授权来源（逐段读后端源，非推测）：派生键 stock:update 的取段规则见
   * middleware/permission.rs 的 extract_resource_info 与 extract_route_info、
   * utils/path_utils.rs 的模块前缀与消歧表；warehouse_keeper 与 warehouse_manager 的授权行
   * 清单在 init_service_ops/permission.rs 的库存仓储域分组（该分组对仓管逐动作授 stock 的
   * read/create/update，对仓库经理不含任何 stock 键），迁移通道与 e2e 补授通道
   * （e2e/global-setup.ts 的 SEED_ROLE_EXTRA_PERMISSIONS）都不向仓库经理写 stock 键。
   */
  test('T4 库存锁定PUT权限双腿 warehouse_manager无stock:update被拒403零写入 warehouse_keeper持该键放行并落库', async ({
    page,
  }) => {
    const ctx = getCtx();
    expect(
      ctx.productIds.length > 0 && ctx.warehouseIds.length > 0,
      `夹具缺产品或仓库，无法构造权限双向面场景`
    ).toBe(true);
    const productId = ctx.productIds[0];
    const warehouseId = ctx.warehouseIds[0];
    const tag = genCode('213P');
    const colorNo = `E2E${tag}`;
    const dyeLotNo = `LOT-${tag}`;
    const total = 100;
    const adminReserved = 30;
    const deniedTargetReserved = 50;
    const allowedTargetReserved = 45;

    // 管理员阶段：播种并做一次基准锁定，同时确认该 PUT 路径本身对有权角色可通
    const seeded = await seedLotStock(page, productId, warehouseId, colorNo, dyeLotNo, total);
    const stockId = num(seeded.id);

    await lockLotStock(page, stockId, adminReserved.toFixed(2), (total - adminReserved).toFixed(2));
    const afterAdminLock = await readStockById(page, stockId);
    const reservedBaseline = num(afterAdminLock.quantity_reserved);
    const availableBaseline = num(afterAdminLock.quantity_available);
    const onHandBaseline = num(afterAdminLock.quantity_on_hand);
    const versionBaseline = num(afterAdminLock.version);
    expect(
      reservedBaseline,
      `管理员基准锁定后锁定量应为 ${adminReserved}，实得 ${JSON.stringify(
        afterAdminLock.quantity_reserved
      )}`
    ).toBe(adminReserved);
    expect(
      Number.isInteger(versionBaseline) && versionBaseline >= 0,
      `基准回读的乐观锁版本号必须是非负整数，实得 ${JSON.stringify(afterAdminLock.version)}`
    ).toBe(true);

    // 拒绝腿：切到仓库经理（init_service_ops/permission.rs 库存仓储域分组对它不含任何 stock 键）
    await loginAsRole(page, 'warehouse_manager');

    // 仓库经理发起同一 PUT 锁定请求，目标锁定量与放行腿刻意不同，便于回读值分辨归因
    const denied = await apiCallExpectFail(page, 'PUT', `/inventory/stock/${stockId}`, {
      quantity_reserved: deniedTargetReserved.toFixed(2),
      quantity_available: (total - deniedTargetReserved).toFixed(2),
      version: versionBaseline,
    });

    // 断言 HTTP 403：消息点名派生键与角色码，避免日后误读成"任意角色都被拒"
    expect(
      denied.status,
      `warehouse_manager 未持有派生键 stock:update（PUT /api/v1/erp/inventory/stock/${stockId} ` +
        `派生 resource_type=stock、action=update、resource_id=${stockId}），应被 RBAC 拒绝为 HTTP 403，` +
        `实得 HTTP ${denied.status} code=${JSON.stringify(denied.code)} ` +
        `message=${JSON.stringify(denied.message)}`
    ).toBe(403);
    expectDenied(
      denied,
      `warehouse_manager 打 stock:update 面应被权限中间件拒绝（403 + FORBIDDEN，且不得是 CSRF 面拒绝）`
    );

    // 拒因归属可判：确认不是参数面（400 / BUSINESS_ERROR / VALIDATION_ERROR / BAD_REQUEST）
    const deniedCode = failureCode(denied);
    expect(
      deniedCode === APP_ERROR_CODES.BUSINESS_ERROR ||
        deniedCode === APP_ERROR_CODES.VALIDATION_ERROR ||
        deniedCode === APP_ERROR_CODES.BAD_REQUEST,
      `warehouse_manager 被拒不应归参数面（BUSINESS_ERROR / VALIDATION_ERROR / BAD_REQUEST），` +
        `实得 code=${JSON.stringify(deniedCode)}；若命中则说明中间件未拦截而 handler 参数校验拒绝，` +
        `属 RBAC 权限键漏配置而非权限门判定`
    ).toBe(false);

    // 切回管理员验证拒绝腿零写入：失败 PUT 不得改写三列，也不得推进乐观锁版本号
    // （版本号不动同时证明请求确实没进 handler，拒绝发生在权限中间件）
    await loginViaUI(page, undefined, undefined, true);
    const afterDenied = await readStockById(page, stockId);
    for (const [col, baseline] of [
      ['quantity_reserved', reservedBaseline],
      ['quantity_available', availableBaseline],
      ['quantity_on_hand', onHandBaseline],
      ['version', versionBaseline],
    ] as Array<[string, number]>) {
      expect(
        num(afterDenied[col]),
        `warehouse_manager 被拒后 ${col} 必须保持基准值 ${baseline}（拒绝不得触库），实得 ${JSON.stringify(
          afterDenied[col]
        )}`
      ).toBe(baseline);
    }

    // 放行腿：切到仓管（同一分组对它逐动作授予 stock 的 read/create/update，含 stock:update）。
    // 版本号沿用基准值——拒绝腿未改过该行，此处乐观锁必然成立。
    await loginAsRole(page, 'warehouse_keeper');
    let allowedErr: string | undefined;
    try {
      await apiCallRaw<Row>(page, 'PUT', `/inventory/stock/${stockId}`, {
        quantity_reserved: allowedTargetReserved.toFixed(2),
        quantity_available: (total - allowedTargetReserved).toFixed(2),
        version: versionBaseline,
      });
    } catch (e) {
      allowedErr = (e as Error).message;
    }
    expect(
      allowedErr,
      `warehouse_keeper 持有派生键 stock:update，PUT /inventory/stock/${stockId} 应被放行（HTTP 200），` +
        `实得被拒或出错：${JSON.stringify(allowedErr)}；` +
        `若命中 FORBIDDEN 说明该键从授权种子里掉了，属后端授权面收窄缺陷，不是本条的放宽点`
    ).toBeUndefined();

    // 切回管理员逐列回读放行腿的真实落库值（数量列对非管理员被字段权限隐藏，必须管理员会话读）
    await loginViaUI(page, undefined, undefined, true);
    const afterAllowed = await readStockById(page, stockId);
    expect(
      num(afterAllowed.quantity_reserved),
      `warehouse_keeper 放行后锁定量必须真实落库为 ${allowedTargetReserved}，实得 ${JSON.stringify(
        afterAllowed.quantity_reserved
      )}`
    ).toBe(allowedTargetReserved);
    expect(
      num(afterAllowed.quantity_available),
      `warehouse_keeper 放行后可用量必须真实落库为 ${total - allowedTargetReserved}，实得 ${JSON.stringify(
        afterAllowed.quantity_available
      )}`
    ).toBe(total - allowedTargetReserved);
    expect(
      num(afterAllowed.quantity_on_hand),
      `warehouse_keeper 放行不得改写总量，必须仍为播种值 ${total}，实得 ${JSON.stringify(
        afterAllowed.quantity_on_hand
      )}`
    ).toBe(total);
    expect(
      num(afterAllowed.version) > versionBaseline,
      `warehouse_keeper 放行必须推进乐观锁版本号（证明写入确实落库），基准 ${versionBaseline}，` +
        `实得 ${JSON.stringify(afterAllowed.version)}`
    ).toBe(true);

    await tryCleanup(page, 'DELETE', `/inventory/stock/${stockId}`, `[213] T4 库存 ${stockId}`);
  });
});
