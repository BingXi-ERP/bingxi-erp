import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  seedFourDimStockIn,
  tryCleanup,
} from './helpers';

/**
 * 面料缸号"锁定量与可用量口径"落库真值链 超卖拒绝腿可达性 释放回滚与多缸隔离
 *
 * 功能。把"某缸号被按订单需求量锁定后可用量口径 = 总量 − 锁定量、锁定量逐列等于
 * 订单行需求量"钉成写后逐列回读断言；把"超出剩余可用量的第二张销售单被服务端拒绝"
 * 这条防超卖判据按 HTTP 面真实可达性如实钉出；把"释放该缸号锁定后锁定量归零、
 * 可用量回到播种值、总量不变，且同品同仓另一缸号的锁定不被连带清掉"钉成两路回读断言。
 *
 * 调用方。Playwright E2E 串行链，走 worker 专属管理员会话（登录账号即管理员，
 * 库存数量列 quantity_on_hand / quantity_available / quantity_reserved 对非管理员会被
 * 数据权限默认隐藏，只有管理员会话能全列回读，见后端库存详情与列表出口的字段隐藏分支）。
 *
 * 入参。每枚用例自带唯一缸号与唯一色号，维度值只增不改、跨用例不共享可变夹具态；
 * 夹具产品与仓库取 ensureTestEntities 落库的真实主键。
 *
 * 传给谁。播种腿打 POST /inventory/stock/fabric（面料四维库存直建）；建单腿打
 * POST /sales/fabric-orders 与标准明细读回 GET /sales/orders/{id}；缸号锁定与释放的
 * 持久化腿打 PUT /inventory/stock/{id}（携带 GET 回读到的乐观锁版本号）；两路回读分别打
 * GET /inventory/stock/{id} 与 GET /inventory/stock?product_id&dye_lot_no。
 *
 * 存什么。inventory_stocks 行的 quantity_on_hand（总量） quantity_available（可用量）
 * quantity_reserved（锁定量）三列，与 sales_order_item 行的 quantity 与 dye_lot_requirement。
 * 金额与数量列出参是 DECIMAL 字符串（未开浮点序列化的线格式口径），数值比对一律 Number 归一，
 * 不做字符串与数值的混比。
 *
 * 存哪里。PostgreSQL inventory_stocks 与 sales_order_item 与 sales_orders，缸号维度是
 * inventory_stocks.dye_lot_no（可空列，染色布经 fabric_class 联动必填校验后非空）。
 *
 * 契约真相（逐段读后端源，非推测）。
 * 缸号锁定落库口径的唯一持久化落点在库存行三列。销售订单建单口（面料口与标准口）
 * 只把明细的 dye_lot_requirement 作为文本要求落 sales_order_item，不对 inventory_stocks
 * 做任何锁定或扣减，也不生成预留行——建单不做超卖校验，见 backend/src/services/so/order_crud.rs
 * 与 backend/src/services/so/fabric_order.rs。库存预留口 POST /inventory/reservations 与
 * 其 lock / release 动作只在 inventory_reservations（订单+产品+仓库三维，无缸号列）翻转状态，
 * 从不写 inventory_stocks 的可用量与锁定量，创建预留也不校验可用量，见
 * backend/src/services/inventory_reservation_service.rs 与 backend/src/handlers/inventory_reservation_handler.rs。
 * 因此本文件把"缸号被锁定后的可用量口径"钉在库存行三列这一真实落点上：锁定量与据此扣减的
 * 可用量通过库存改单端点 PUT /inventory/stock/{id} 落库（该端点是 HTTP 面唯一能把 quantity_reserved
 * 写成非零的持久化入口，且以 version 乐观锁串行化并发编辑），播种腿 POST /inventory/stock/fabric
 * 初值为 总量 = 可用量、锁定量为零，见 backend/src/services/inventory_stock_service.rs 与
 * backend/src/handlers/inventory_stock_handler.rs 与 backend/src/handlers/inventory_stock_handler_fabric.rs。
 * 库存行三列在库内没有"可用 = 总量 − 锁定"的 CHECK 约束强制，本用例钉的是写入方据此口径
 * 落库后经两路回读逐列一致，不是断言数据库会自动维持该等式。
 *
 * 超卖拒绝腿可达性判据（第二枚用例的立论）。真正的缸号超卖拦截只发生在发货出库的四维扣减
 * 规划里（可用量不足即整单拒绝并回滚，见 backend/src/services/so/delivery_ops/inventory.rs），
 * 而建单口与预留口都不过可用量这条门。所以"同一缸再下第二张超出剩余可用量的销售订单"在
 * HTTP 面拿不到任何拒绝——建单会照常返回成功。第二枚用例据此写成暴露型判红：断言该超额
 * 第二单必须被服务端点名拒绝，当前实现不产出该拒绝，故判红；这暴露的是"锁缸防超卖"的拒绝腿
 * 在建单/预留面缺失这一真实缺口，拒绝腿补齐前该用例应保持判红，不得改 skip、不得放宽为恒过。
 */

type Row = Record<string, unknown>;

/** DECIMAL 出参是字符串，数值判定一律先 Number 归一再比（不混比字符串与数值） */
const num = (v: unknown): number => Number(String(v));

/** 播种一条带全四维（含唯一缸号）的可用库存行，返回按缸号回读到的真实行（含 id 与 version） */
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
  // 播种初值口径：总量 = 可用量、锁定量为零（这是后端建库存行的真实落库形态，先钉死起点）
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

/** 按主键回读单行库存（GET /inventory/stock/{id}） */
async function readStockById(page: Page, id: number): Promise<Row> {
  return await apiCallRaw<Row>(page, 'GET', `/inventory/stock/${id}`);
}

/** 按缸号回读库存行（GET /inventory/stock?product_id&dye_lot_no），要求唯一命中 */
async function readStockByDyeLot(page: Page, productId: number, dyeLotNo: string): Promise<Row> {
  const path =
    `/inventory/stock?product_id=${productId}` +
    `&dye_lot_no=${encodeURIComponent(dyeLotNo)}&page=1&page_size=50`;
  const res = await apiCallRaw<{ items: Row[] }>(page, 'GET', path);
  expect(Array.isArray(res.items), `按缸号回读必须出 items 数组，实际 ${JSON.stringify(res)}`).toBe(
    true
  );
  expect(
    res.items.length,
    `唯一缸号 ${dyeLotNo} 必须恰命中一行，实际 ${JSON.stringify(res.items)}`
  ).toBe(1);
  return res.items[0];
}

/**
 * 对某缸号库存行施加"锁定量 + 据此扣减可用量"的落库写入。
 * 现取该行乐观锁版本号再 PUT，避免版本号漂移；总量列不提交，服务端保持原值不动。
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

/** 逐列钉锁定口径：总量不变、锁定量 = 期望需求、可用量 = 总量 − 锁定量，且等式自洽 */
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

/** 建一枚单行面料销售订单并回读该明细行，返回订单主键与明细行（需求量与缸号要求的权威源） */
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

/** 按唯一备注标记把该客户下所有本用例遗留的 pending 单撤态删除（超额第二单被接受时的收口） */
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

    // 下销售订单点名该缸号并回读订单行：需求量取明细行落库回显值，不写死
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

    // 按订单行需求量对该缸号施加锁定并据此扣减可用量（持久化落点是库存行三列）
    await lockLotStock(page, stockId, demand.toFixed(2), (total - demand).toFixed(2));

    // 两路回读逐列对表：按主键与按缸号必须各自成立且互相一致
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

  test('T2 超出剩余可用量的第二张销售单必须被点名拒绝（拒绝腿不可达 暴露判红）', async ({
    page,
  }) => {
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

    // 第一张：按可用量满额锁定，把剩余可用量压到 0
    await lockLotStock(page, id, total.toFixed(2), '0');
    const afterFirst = await readStockById(page, id);
    expect(
      num(afterFirst.quantity_available),
      `满额锁定后可用量必须为 0，实得 ${JSON.stringify(afterFirst.quantity_available)}`
    ).toBe(0);

    // 第二张：需求 999 远超剩余可用 0，期望服务端点名拒绝（不产出该拒绝即为本用例判红点）
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

    // 无论拒绝与否先钉零写入：超额第二单被拒不得部分改写缸号锁定量与可用量
    const afterSecond = await readStockById(page, id);
    expect(
      num(afterSecond.quantity_reserved),
      `超额第二单不得改写锁定量，必须仍为 ${total}，实得 ${JSON.stringify(
        afterSecond.quantity_reserved
      )}`
    ).toBe(total);
    expect(
      num(afterSecond.quantity_available),
      `超额第二单不得改写可用量，必须仍为 0，实得 ${JSON.stringify(afterSecond.quantity_available)}`
    ).toBe(0);

    // 若第二张被接受，按唯一备注标记撤态删除它（避免向库里遗留 pending 泄漏单）
    await purgeOrdersByTag(page, customerId, `超额第二单${tag}`);
    await tryCleanup(page, 'DELETE', `/inventory/stock/${id}`, `[213] T2 库存 ${id}`);

    // 判红点（放在全部清理之后，保证判红中断也不向库里泄漏数据）：该超额第二单在 HTTP 面
    // 必须被服务端拒绝。当前建单口不做可用量校验，超额订单被照常接受（实得 2xx），
    // 故本断言判红，用于暴露锁缸防超卖拒绝腿在建单/预留面缺失这一真实缺口。
    expect(
      second.status,
      `超卖拒绝腿不可达：需求 999 > 剩余可用 0 的第二张销售单必须被服务端拒绝(400)，` +
        `实得 HTTP ${second.status} code=${JSON.stringify(second.code)}——` +
        `建单口不过可用量校验，超额订单被照常接受，判红以暴露该缺口`
    ).toBe(400);
    expect(
      failureCode(second),
      `超额拒绝必须归因业务机器码 BUSINESS_ERROR，实得 code=${JSON.stringify(second.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
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
});
