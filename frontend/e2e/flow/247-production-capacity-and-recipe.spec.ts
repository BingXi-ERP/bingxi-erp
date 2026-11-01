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
  tryCleanup,
} from './helpers';

/**
 * 产能概览与趋势对账及大货处方用量计算 E2E 用例（三枚 test）
 *
 * 功能。把产能趋势（GET /api/v1/erp/production/capacity/trend，后端实为负荷分析）
 * 的时间口径钉成同一专属工作中心上的逐窗口精确对账（T1）：三个互斥日期窗各自只计入
 * 应计入的下达/在制订单量（区间外的单不混入、未达下达态的草稿单不混入），同一窗两次
 * 取数逐值一致；再把概览（GET /api/v1/erp/production/capacity/summary）与
 * 趋势两个聚合通道钉成汇总对账（T2）：概览的 total_work_centers / total_daily_capacity /
 * total_planned_demand 逐值等于趋势全量的条目数与两列累加，overloaded_count 与 idle_count
 * 与 bottleneck_work_centers 长度逐值等于趋势按状态与负荷率的计数，取不到静默窗即判红；
 * 最后把配方用量试算（POST /api/v1/erp/production/production-recipes/calculate）钉成
 * 线性缩放与字符串十进制判据（T3）：浓度 2% 浴比 1:8 时用量随布重 100→200 精确 16→32
 * 翻倍、随浴比 1:8→1:10 精确 16→40、随加成系数 1→1.5 精确 16→24，无浓度的助剂行
 * 用量按提交原文透传（字符串逐字相等），同输入两次取数逐字一致，四类非法入参逐一被
 * 业务门以 400 BUSINESS_ERROR 点名拒绝，salesperson 无该面授权键被 403 拒且拒绝无副作用
 * （该端点纯函数零落库，放行面以计算值正确性为断点）。
 *
 * 调用方。Playwright E2E 串行链，T1 与 T2 走 worker 专属管理员会话；T3 先
 * loginAsRole 切 salesperson 打拒绝腿、再 loginViaUI(force) 切回管理员重打同一请求
 * 得 200，用 403 与 200 的层差钉拒因归属权限面。前端调用点：views/capacity/
 * composables/useCp.ts:85/99 经 api/capacity.ts 的 getCapacitySummary 与
 * getCapacityTrend 打 summary 与 trend；views/production-recipes/index.vue:497 经
 * api/production-recipe.ts:202 calculateRecipeAmounts 打 calculate 做配方试算。
 *
 * 入参。T1 先建专属工作中心（唯一编码、日产能 1000），再建三张挂该中心的生产订单：
 * A 下达态 100 米（窗口 +1 到 +3 日）、B 在制态 250 米（窗口 +30 到 +32 日）、
 * C 恒为草稿态 9999 米（与 A 同窗，用作"未达下达态不混入"的反面对照）；日期为
 * YYYY-MM-DD 字符串。T3 入参为 fabric_weight / liquor_ratio / adjustment_factor /
 * items（material_code、material_name、concentration 可空、unit、amount、category）。
 *
 * 传给谁。建工作中心腿打 POST /production/capacity/work-centers
 * （handlers/capacity_handler.rs create_work_center）；建单与状态腿打
 * POST /production/production-orders/orders 与 PUT /production/production-orders/
 * orders/{id}/status（handlers/production_order_handler.rs，状态机白名单
 * DRAFT→SCHEDULED→IN_PROGRESS，见 services/production_order_ops/crud.rs）；聚合腿打
 * GET /production/capacity/trend 与 GET /production/capacity/summary（前者实为
 * get_load_analysis，后者为 get_capacity_overview，服务侧 capacity_service.rs）；
 * 试算腿打 POST /production/production-recipes/calculate
 * （handlers/production_recipe_handler.rs calculate 调
 * services/production_recipe_service.rs calculate_amounts）。
 *
 * 存什么。work_centers 一行（专属工位）、production_orders 三行（下达/在制/草稿）；
 * 用量试算端点零落库。负荷与概览出参是 DECIMAL 字符串，计数是整数；数值判定一律
 * Number(String(v)) 归一后断精确值（本链取值全为可精确表示的十进制），不在测试里
 * 重算四舍五入。
 *
 * 存哪里。PostgreSQL work_centers 与 production_orders。清理位点：三张订单逐一
 * DELETE（服务侧软删为 CANCELLED 终态，crud.rs delete 走状态机校验）并按工作中心
 * 回读负荷归零，工作中心 DELETE（软删置 INACTIVE）并回读趋势该中心条目清零——
 * 产能聚合只计 ACTIVE 中心，清理生效以聚合回读为证。
 *
 * 契约真相（逐段读后端源，非推测）。
 * routes/production.rs:700-707 把 /capacity/summary 装到 get_capacity_overview、
 * /capacity/trend 装到 get_load_analysis——trend 不是日期序列而是各工作中心的负荷项
 * 数组（capacity_service.rs:112-147：取 ACTIVE 工作中心，按 date_from/date_to 过滤
 * production_orders 中 status 属于 SCHEDULED/IN_PROGRESS 的单，过滤谓词为
 * planned_end_date >= date_from 且 planned_start_date <= date_to 的区间相交口径，
 * capacity_service.rs:252-281），故"同一区间两次取数一致"与"区间外数据不混入"只能
 * 钉在按 work_center_id 过滤的负荷行数量上（本用例用专属中心，等值判据不受并发干扰）。
 * 前端 api/capacity.ts:61 把 trend 声明为 CapacityTrend（date/planned_hours 等列），
 * 与后端实际返回的负荷项列名（work_center_id/total_demand/load_rate 等）不同源，
 * 该契约漂移已写进交付报告；本文件按后端真实出参钉。
 * summary（capacity_service.rs:395-450）= 无过滤负荷数组的聚合：total_work_centers 为
 * 数组长度、active_work_centers 为非 IDLE 计数、total_daily_capacity 与
 * total_planned_demand 为两列求和、overall_load_rate 为总和比值保留两位、
 * bottleneck_work_centers 为 load_rate 大于 80 的子集、overloaded_count 与 idle_count
 * 为对应状态计数。T2 因此逐列断 summary 与 trend 全量数组的累加与计数等式。
 * 状态分级阈值（capacity_service.rs:305-313）：大于 100 为 OVERLOADED，大于 80 为 HIGH，
 * 大于 20 为 NORMAL，其余 IDLE。
 * calculate（production_recipe_service.rs:174-204）为纯函数：公式 用量 = 浓度 × 布重 ×
 * 浴比 / 100 × 加成系数（加成缺省 1），无浓度的行不重算、原样返回提交 amount；
 * fabric_weight 非正、加成非正、浓度为负、浴比非 1:N 形或分母非正各自产
 * AppError::business（400，机器码 BUSINESS_ERROR）。State(_state) 不触库——
 * 该端点无落库回读可言，判据全部在响应数值形态上。
 * 权限面键派生（middleware/permission.rs extract_resource_info：seg3=production 为
 * 模块前缀，(production, production-recipes) 不在嵌套前缀表故资源段取 seg4，末段
 * calculate 不在动作关键字表按方法派生）：POST /api/v1/erp/production/
 * production-recipes/calculate 派生键 production-recipes:create；GET /production/
 * capacity/summary 与 /production/capacity/trend 均派生 capacity:read。种子矩阵
 * init_service_ops/permission.rs 只对 production_manager 授 (capacity, *) 与
 * (production-recipes, *)，对 finishing_master 只授 production-recipes:read；
 * salesperson 两族键皆无，GET 与 POST 对其一律 403 FORBIDDEN（拒绝归因权限面，
 * 非参数面：参数面 BAD_REQUEST 产 400，NOT_FOUND 产 404，expectDenied 另钉 403
 * 不属 CSRF 家族）。本文件聚合与试算正腿因此全部走超管会话。
 * 静默窗口说明：summary 与 trend 为全表聚合，活库并发用例会改动条目数与两列和，
 * 故 T2 采用"两次 summary 夹一次 trend 读、仅当两次 summary 逐值相等（窗内无人写
 * work_centers 或下达态 production_orders）时断等式"的采样判据，采不中即显式判红
 * 点名并发，不放宽；T1 全部断言按专属中心过滤，恒定时等值成立。
 *
 * 状态词表取值清单（逐字符取自后端源）：
 * - production_order.status（crud.rs 白名单）：DRAFT / SCHEDULED / IN_PROGRESS /
 *   COMPLETED / CANCELLED / PENDING_APPROVAL / APPROVED / REJECTED
 * - work_center.status（capacity_service.rs 查询口径）：ACTIVE / INACTIVE
 * - 负荷分级（capacity_service.rs:305-313）：IDLE / NORMAL / HIGH / OVERLOADED
 */

type Row = Record<string, unknown>;

/** DECIMAL 与整数出参可能是字符串形态，数值判定一律先 Number(String(v)) 归一 */
const num = (v: unknown): number => Number(String(v));

/** 相对今天偏移 offset 天的 YYYY-MM-DD（服务端按 NaiveDate 等值解析，两端口径一致） */
function dstr(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * 十进制出参的数值判据：字符串形态就按字符串原样比（Number 归一仅吸收表示形态，
 * 本链取值全部是可精确表示的十进制，不做也不允许任何二次四舍五入）。
 */
function assertDecimalEq(actual: unknown, expected: number, label: string): void {
  expect(
    typeof actual === 'string' || typeof actual === 'number',
    `${label} 出参必须是十进制字符串或数值形态，实得 ${JSON.stringify(actual)}`
  ).toBe(true);
  expect(
    num(actual),
    `${label} 必须逐值等于 ${expected}（不做二次四舍五入），实得 ${JSON.stringify(actual)}`
  ).toBe(expected);
}

interface LoadItem {
  work_center_id: number;
  planned_quantity: number;
  in_progress_quantity: number;
  total_demand: number;
  daily_capacity: number;
  load_rate: number;
  status: string;
}

/** 归一 trend（负荷分析）行并把越界列显式判红 */
function asLoadItem(row: Row): LoadItem {
  const item: LoadItem = {
    work_center_id: num(row.work_center_id),
    planned_quantity: num(row.planned_quantity),
    in_progress_quantity: num(row.in_progress_quantity),
    total_demand: num(row.total_demand),
    daily_capacity: num(row.daily_capacity),
    load_rate: num(row.load_rate),
    status: String(row.status),
  };
  expect(
    Number.isInteger(item.work_center_id) && item.work_center_id > 0,
    `负荷行 work_center_id 必须是正整数，实际 ${JSON.stringify(row)}`
  ).toBe(true);
  expect(
    ['IDLE', 'NORMAL', 'HIGH', 'OVERLOADED'].includes(item.status),
    `负荷行 status 必须落在词表 IDLE/NORMAL/HIGH/OVERLOADED，实际 ${JSON.stringify(row.status)}`
  ).toBe(true);
  return item;
}

/**
 * 按可选日期窗与工作中心打一次产能趋势（负荷分析）。
 * 调用方：T1 逐窗对账、T2 全量累加。入参：page + 可选 date_from/date_to/work_center_id。
 * 传给谁：GET /production/capacity/trend（handlers/capacity_handler.rs
 * get_load_analysis）。存什么/存哪里：不持久化，返回负荷项数组。
 */
async function readTrend(
  page: Page,
  opts?: { dateFrom?: string; dateTo?: string; workCenterId?: number }
): Promise<LoadItem[]> {
  const parts: string[] = [];
  if (opts?.dateFrom) parts.push(`date_from=${opts.dateFrom}`);
  if (opts?.dateTo) parts.push(`date_to=${opts.dateTo}`);
  if (opts?.workCenterId !== undefined) parts.push(`work_center_id=${opts.workCenterId}`);
  const qs = parts.length > 0 ? `?${parts.join('&')}` : '';
  const data = await apiCallRaw<unknown>(page, 'GET', `/production/capacity/trend${qs}`);
  expect(Array.isArray(data), `trend 出参必须是负荷项数组，实际 ${JSON.stringify(data)}`).toBe(
    true
  );
  return (data as Row[]).map(asLoadItem);
}

/** 把概览出参的标量列序列化成比较键：逐值全等才算同一静默窗内的同一份聚合 */
function summaryKey(s: Row): string {
  return JSON.stringify([
    num(s.total_work_centers),
    num(s.active_work_centers),
    String(s.total_daily_capacity),
    String(s.total_planned_demand),
    String(s.overall_load_rate),
    num(s.overloaded_count),
    num(s.idle_count),
    Array.isArray(s.bottleneck_work_centers) ? s.bottleneck_work_centers.length : -1,
  ]);
}

/** 打一次产能概览（GET /production/capacity/summary）并钉计数形态 */
async function readSummary(page: Page): Promise<Row> {
  const s = await apiCallRaw<Row>(page, 'GET', '/production/capacity/summary');
  for (const col of [
    'total_work_centers',
    'active_work_centers',
    'overloaded_count',
    'idle_count',
  ] as const) {
    expect(
      Number.isInteger(num(s[col])) && num(s[col]) >= 0,
      `概览列 ${col} 必须是非负整数，实际 ${JSON.stringify(s)}`
    ).toBe(true);
  }
  expect(
    Array.isArray(s.bottleneck_work_centers),
    `概览 bottleneck_work_centers 必须是数组，实际 ${JSON.stringify(s.bottleneck_work_centers)}`
  ).toBe(true);
  return s;
}

/**
 * 建一张挂在专属工作中心上的生产订单（DRAFT 落库并回读确认）。
 * 调用方：T1。入参：page + productId + wcId + 数量 + 起止日期。
 * 传给谁：POST /production/production-orders/orders。
 * 存什么/存哪里：production_orders 行（数量、日期窗、中心归属、初始 DRAFT 态）。
 */
async function createOrderOnCenter(
  page: Page,
  productId: number,
  wcId: number,
  quantity: string,
  startDays: number,
  endDays: number,
  remarks: string
): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/production/production-orders/orders', {
    product_id: productId,
    planned_quantity: quantity,
    planned_start_date: dstr(startDays),
    planned_end_date: dstr(endDays),
    work_center_id: wcId,
    remarks,
  });
  const id = num(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `建单必须返回正整数主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  const readBack = await apiCallRaw<Row>(page, 'GET', `/production/production-orders/orders/${id}`);
  expect(
    String(readBack.status),
    `新建生产订单初始态必须落库为词表 DRAFT（DB 默认，crud.rs 不显式 Set），实得 ${JSON.stringify(
      readBack.status
    )}`
  ).toBe('DRAFT');
  expect(
    num(readBack.work_center_id),
    `落库的工作中心归属必须等于提交值 ${wcId}，实得 ${JSON.stringify(readBack.work_center_id)}`
  ).toBe(wcId);
  return id;
}

/** 推进生产订单状态（PUT /production/production-orders/orders/{id}/status）并回读落库态 */
async function transitionOrderStatus(
  page: Page,
  id: number,
  status: 'SCHEDULED' | 'IN_PROGRESS',
  expected: string
): Promise<void> {
  await apiCallRaw<Row>(page, 'PUT', `/production/production-orders/orders/${id}/status`, {
    status,
  });
  const readBack = await apiCallRaw<Row>(page, 'GET', `/production/production-orders/orders/${id}`);
  expect(
    String(readBack.status),
    `订单 ${id} 状态推进后必须落库为 ${expected}，实得 ${JSON.stringify(readBack.status)}`
  ).toBe(expected);
}

/** 取本用例专属工作中心在负荷数组中的唯一行 */
function soleCenterRow(items: LoadItem[], wcId: number, label: string): LoadItem {
  const mine = items.filter(i => i.work_center_id === wcId);
  expect(
    mine.length,
    `${label}：专属中心 ${wcId} 在负荷数组中必须恰有一条，实得 ${JSON.stringify(items)}`
  ).toBe(1);
  return mine[0];
}

test.describe.serial('产能口径对账与大货处方试算链', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('T1 专属中心三日期窗逐一对账 下达在制分列计入 草稿与窗外单不混入 同窗两次取数一致', async ({
    page,
  }) => {
    const ctx = getCtx();
    expect(ctx.productIds.length > 0, `夹具缺产品，productIds=${ctx.productIds.length}`).toBe(true);
    const productId = ctx.productIds[0];
    const wcCode = genCode('E2E247WC');

    const wc = await apiCallRaw<Row>(page, 'POST', '/production/capacity/work-centers', {
      code: wcCode,
      name: `E2E产能对账工位${wcCode}`,
      work_center_type: 'STANDARD',
      daily_capacity: '1000',
      capacity_unit: '米',
      status: 'ACTIVE',
    });
    const wcId = num(wc.id);
    expect(
      Number.isInteger(wcId) && wcId > 0,
      `建工作中心必须返回正整数主键：${JSON.stringify(wc)}`
    ).toBe(true);
    expect(String(wc.code), '工作中心编码回显必须等于提交值').toBe(wcCode);

    // 空载基线：专属中心在趋势里恰一行且全零、IDLE，日产能回显等于建卡值 1000
    const idleRows = await readTrend(page, { workCenterId: wcId });
    const idle = soleCenterRow(idleRows, wcId, '空载基线');
    expect(idle.total_demand, '空载专属中心总需求必须为 0').toBe(0);
    expect(idle.load_rate, '空载负荷率必须为 0').toBe(0);
    expect(idle.status, '空载分级必须为词表 IDLE').toBe('IDLE');
    assertDecimalEq(idle.daily_capacity, 1000, '空载日产能');

    // 三张单：A 下达（窗 +1..+3），B 在制（窗 +30..+32），C 恒草稿（与 A 同窗的反面对照）
    const orderA = await createOrderOnCenter(page, productId, wcId, '100', 1, 3, `247A${wcCode}`);
    const orderB = await createOrderOnCenter(page, productId, wcId, '250', 30, 32, `247B${wcCode}`);
    const orderC = await createOrderOnCenter(page, productId, wcId, '9999', 1, 3, `247C${wcCode}`);
    await transitionOrderStatus(page, orderA, 'SCHEDULED', 'SCHEDULED');
    await transitionOrderStatus(page, orderB, 'SCHEDULED', 'SCHEDULED');
    await transitionOrderStatus(page, orderB, 'IN_PROGRESS', 'IN_PROGRESS');

    // 窗一（只含 A）：计划列计入 100、在制列 0，草稿 C 同窗也不得混入
    const w1 = soleCenterRow(
      await readTrend(page, { dateFrom: dstr(1), dateTo: dstr(3), workCenterId: wcId }),
      wcId,
      '窗一 只含A'
    );
    expect(w1.planned_quantity, '窗一计划量必须恰为 A 的 100（C 草稿态不得混入）').toBe(100);
    expect(w1.in_progress_quantity, '窗一在制量必须为 0（B 在窗三）').toBe(0);
    expect(w1.total_demand, '窗一总需求必须恰为 100').toBe(100);

    // 窗二（只含 B）：在制列 250，A 与 C 都不混入
    const w2 = soleCenterRow(
      await readTrend(page, { dateFrom: dstr(30), dateTo: dstr(32), workCenterId: wcId }),
      wcId,
      '窗二 只含B'
    );
    expect(w2.planned_quantity, '窗二计划量必须为 0（A 不在窗内）').toBe(0);
    expect(w2.in_progress_quantity, '窗二在制量必须恰为 B 的 250').toBe(250);
    expect(w2.total_demand, '窗二总需求必须恰为 250').toBe(250);

    // 全窗（A+B）：两列分列相加，且按日产能 1000 的负荷率 35.00 落 NORMAL 分级
    const wAll = soleCenterRow(
      await readTrend(page, { dateFrom: dstr(0), dateTo: dstr(40), workCenterId: wcId }),
      wcId,
      '全窗 A加B'
    );
    expect(wAll.planned_quantity, '全窗计划量必须为 100').toBe(100);
    expect(wAll.in_progress_quantity, '全窗在制量必须为 250').toBe(250);
    expect(wAll.total_demand, '全窗总需求必须为两列之和 350').toBe(350);
    expect(
      wAll.load_rate,
      `全窗负荷率必须等于 350/1000×100=35.00（服务侧保留两位口径），实得 ${JSON.stringify(
        wAll.load_rate
      )}`
    ).toBe(35);
    expect(wAll.status, '负荷 35 必须落词表 NORMAL（大于20 且不大于80）').toBe('NORMAL');
    const idleCheckRow = soleCenterRow(
      await readTrend(page, { workCenterId: wcId }),
      wcId,
      '日产能回显'
    );
    assertDecimalEq(idleCheckRow.daily_capacity, 1000, '专属中心日产能全程稳定为建卡值');

    // 区间外不混入：一个既不含 A 也不含 B 的中段窗，两列必须归零
    const wGap = soleCenterRow(
      await readTrend(page, { dateFrom: dstr(10), dateTo: dstr(12), workCenterId: wcId }),
      wcId,
      '中段空窗'
    );
    expect(wGap.total_demand, '与两单都不相交的窗口总需求必须为 0').toBe(0);
    expect(wGap.status, '空窗分级必须回落 IDLE').toBe('IDLE');

    // 同一区间两次取数一致：全窗背靠背重读逐值相等（专属中心无外部写入者，等值恒定成立）
    const rerun = soleCenterRow(
      await readTrend(page, { dateFrom: dstr(0), dateTo: dstr(40), workCenterId: wcId }),
      wcId,
      '全窗重读'
    );
    expect(JSON.stringify(rerun), '同一区间两次取数必须逐值一致').toBe(JSON.stringify(wAll));

    // 清理：三单软删为 CANCELLED（下达/在制/草稿三态都允许转 CANCELLED），负荷必须归零
    for (const id of [orderA, orderB, orderC]) {
      await tryCleanup(
        page,
        'DELETE',
        `/production/production-orders/orders/${id}`,
        `247 订单 ${id}`
      );
      const gone = await apiCallRaw<Row>(page, 'GET', `/production/production-orders/orders/${id}`);
      expect(
        String(gone.status),
        `订单 ${id} 清理后必须落 CANCELLED 终态（软删，不再计入负荷），实得 ${JSON.stringify(
          gone.status
        )}`
      ).toBe('CANCELLED');
    }
    const afterClean = soleCenterRow(await readTrend(page, { workCenterId: wcId }), wcId, '清理后');
    expect(afterClean.total_demand, '三单清理后专属中心总需求必须归零').toBe(0);
    await tryCleanup(
      page,
      'DELETE',
      `/production/capacity/work-centers/${wcId}`,
      `247 工位 ${wcId}`
    );
    const left = await readTrend(page, { workCenterId: wcId });
    expect(
      left.length,
      `工作中心删除（置 INACTIVE）后趋势必须不再含该中心，实得 ${JSON.stringify(left)}`
    ).toBe(0);
  });

  test('T2 概览与趋势全量累加对账 静默窗内条目数与两列和与状态计数逐值相等', async ({ page }) => {
    // summary 与 trend 是同一负荷数组的两种投影：概览的每个标量都必须等于趋势数组的
    // 对应聚合（capacity_service.rs overview 内部就是调 load_analysis）。活库并发写会
    // 移动两读之间的数组，故只在"两次概览逐值相等的静默窗"内断等式，采不中即判红。
    const MAX_WINDOWS = 8;
    let matched = false;
    let lastPair = '';
    for (let i = 0; i < MAX_WINDOWS && !matched; i++) {
      const s1 = await readSummary(page);
      const trend = await readTrend(page);
      const s2 = await readSummary(page);
      lastPair = `${summaryKey(s1)} vs ${summaryKey(s2)}`;
      if (summaryKey(s1) !== summaryKey(s2)) {
        continue;
      }
      matched = true;

      expect(
        num(s2.total_work_centers),
        `概览 total_work_centers(${num(s2.total_work_centers)}) 必须等于趋势条目数(${trend.length})`
      ).toBe(trend.length);

      const sumDaily = trend.reduce((acc, i) => acc + i.daily_capacity, 0);
      assertDecimalEq(
        s2.total_daily_capacity,
        sumDaily,
        '概览 total_daily_capacity 对趋势日产能累加'
      );

      const sumDemand = trend.reduce((acc, i) => acc + i.total_demand, 0);
      assertDecimalEq(
        s2.total_planned_demand,
        sumDemand,
        '概览 total_planned_demand 对趋势总需求累加'
      );

      const idleCount = trend.filter(i => i.status === 'IDLE').length;
      expect(
        num(s2.idle_count),
        `概览 idle_count(${num(s2.idle_count)}) 必须等于趋势 IDLE 计数(${idleCount})`
      ).toBe(idleCount);

      const overloaded = trend.filter(i => i.status === 'OVERLOADED').length;
      expect(
        num(s2.overloaded_count),
        `概览 overloaded_count(${num(s2.overloaded_count)}) 必须等于趋势 OVERLOADED 计数(${overloaded})`
      ).toBe(overloaded);

      const active = trend.filter(i => i.status !== 'IDLE').length;
      expect(
        num(s2.active_work_centers),
        `概览 active_work_centers(${num(s2.active_work_centers)}) 必须等于趋势非 IDLE 计数(${active})`
      ).toBe(active);

      const bottleneck = s2.bottleneck_work_centers as Row[];
      const rateOver80 = trend.filter(i => i.load_rate > 80).length;
      expect(
        bottleneck.length,
        `概览瓶颈子集长度(${bottleneck.length}) 必须等于趋势 load_rate 大于 80 的计数(${rateOver80})`
      ).toBe(rateOver80);
      const trendIds = new Set(trend.map(i => i.work_center_id));
      for (const b of bottleneck) {
        expect(
          trendIds.has(num(b.work_center_id)),
          `瓶颈子集成员 ${JSON.stringify(b.work_center_id)} 必须是趋势全量里的同一中心`
        ).toBe(true);
        expect(
          num(b.load_rate) > 80,
          `瓶颈子集成员 load_rate 必须真大于 80（阈值判据），实得 ${JSON.stringify(b)}`
        ).toBe(true);
      }
    }
    expect(
      matched,
      `连续 ${MAX_WINDOWS} 次都采不到 summary 静默窗，最后对 ${lastPair}——` +
        '活库并发写入未停，概览与趋势的累加等式无法确定性成立，显式判红不放宽'
    ).toBe(true);
  });

  test('T3 配方试算按布重浴比加成线性缩放 助剂行原文透传 非法入参与无权限面被点名拒绝', async ({
    page,
  }) => {
    const items = [
      {
        material_code: 'DYE-E2E247',
        material_name: 'E2E试验染料',
        concentration: '2',
        unit: 'kg',
        amount: '0',
        category: 'dye',
      },
      {
        material_code: 'AUX-E2E247',
        material_name: 'E2E试验助剂',
        concentration: null,
        unit: 'kg',
        amount: '7.5',
        category: 'auxiliary',
      },
    ];
    const calc = async (body: Row): Promise<Row[]> => {
      const data = await apiCallRaw<unknown>(
        page,
        'POST',
        '/production/production-recipes/calculate',
        body
      );
      expect(Array.isArray(data), `试算出参必须是物料数组，实际 ${JSON.stringify(data)}`).toBe(
        true
      );
      return data as Row[];
    };

    // 基线：浓度 2% × 布重 100 × 浴比 8 / 100 = 16；助剂无浓度，按提交原文透传
    const base = await calc({ fabric_weight: '100', liquor_ratio: '1:8', items });
    expect(base.length, '试算必须逐行返回提交的全部物料').toBe(2);
    assertDecimalEq(base[0].amount, 16, '基线染料用量 2×100×8/100');
    expect(
      String(base[1].amount),
      `助剂行 amount 必须逐字透传提交原文 7.5（服务侧对无浓度行不重算，recipe_service:190）`
    ).toBe('7.5');
    expect(String(base[0].material_code), '试算必须原样回显物料编码，不得改名或丢行').toBe(
      'DYE-E2E247'
    );
    expect(String(base[0].concentration), '染料行浓度必须原样回显').toBe('2');

    // 线性一：布重翻倍 100→200，用量精确 16→32
    const doubled = await calc({ fabric_weight: '200', liquor_ratio: '1:8', items });
    assertDecimalEq(doubled[0].amount, 32, '布重翻倍后用量精确翻倍');

    // 线性二：浴比 1:8→1:10，用量精确 16→40
    const ratio10 = await calc({ fabric_weight: '100', liquor_ratio: '1:10', items });
    assertDecimalEq(ratio10[0].amount, 40, '浴比改 10 后用量精确按 10/8 缩放');

    // 线性三：加成系数 1→1.5，用量精确 16→24
    const factor = await calc({
      fabric_weight: '100',
      liquor_ratio: '1:8',
      adjustment_factor: '1.5',
      items,
    });
    assertDecimalEq(factor[0].amount, 24, '加成 1.5 后用量精确乘 1.5');

    // 同输入两次取数逐字一致（字符串形态不参与隐式数值放宽）
    const rerun = await calc({ fabric_weight: '100', liquor_ratio: '1:8', items });
    expect(JSON.stringify(rerun), '同入参两次试算必须逐字一致').toBe(JSON.stringify(base));

    // 参数面负例逐一被业务门 400 BUSINESS_ERROR 点名（四类拒绝理由各占一源分支）
    const negatives: Array<[Row, string]> = [
      [{ fabric_weight: '0', liquor_ratio: '1:8', items }, '布重为零必须被备布重量门拒绝'],
      [{ fabric_weight: '-5', liquor_ratio: '1:8', items }, '布重为负必须被备布重量门拒绝'],
      [
        { fabric_weight: '100', liquor_ratio: '1:8', adjustment_factor: '0', items },
        '加成系数为零必须被加成门拒绝',
      ],
      [
        {
          fabric_weight: '100',
          liquor_ratio: '1:8',
          items: [
            {
              material_code: 'DYE-NEG',
              material_name: 'E2E负浓度染料',
              concentration: '-1',
              unit: 'kg',
              amount: '0',
              category: 'dye',
            },
          ],
        },
        '浓度为负必须被物料浓度门拒绝',
      ],
      [{ fabric_weight: '100', liquor_ratio: 'abc', items }, '浴比非 1:N 形必须被浴比门拒绝'],
      [{ fabric_weight: '100', liquor_ratio: '1:0', items }, '浴比分母为零必须被浴比门拒绝'],
    ];
    for (const [body, why] of negatives) {
      const fail = await apiCallExpectFail(
        page,
        'POST',
        '/production/production-recipes/calculate',
        body
      );
      expect(fail.status, `${why}，应得 400，实得 ${JSON.stringify(fail)}`).toBe(400);
      expect(
        failureCode(fail),
        `${why}，机器码必须归因 BUSINESS_ERROR（服务侧业务门），实得 ${JSON.stringify(fail.code)}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    }

    // 权限腿：salesperson 无派生键 production-recipes:create（种子矩阵只授
    // production_manager 该族 * 与 finishing_master read，销售岗种子无任何 production 键），
    // 同一合法请求体必须先被 RBAC 403 拦在 handler 之前；拒绝面无落库副作用可回读
    // （该端点本就零持久化），判据钉在 403/400 层差与管理员放行腿上。
    await loginAsRole(page, 'salesperson');
    const denied = await apiCallExpectFail(
      page,
      'POST',
      '/production/production-recipes/calculate',
      { fabric_weight: '100', liquor_ratio: '1:8', items }
    );
    expectDenied(
      denied,
      'salesperson 打 POST /api/v1/erp/production/production-recipes/calculate（派生键 production-recipes:create 未授予）应被权限中间件 403 拒绝；参数面拒绝产 400，不会出现 403'
    );
    expect(
      failureCode(denied),
      `salesperson 被拒必须是权限门 FORBIDDEN，实得 ${JSON.stringify(denied.code)}`
    ).toBe(APP_ERROR_CODES.FORBIDDEN);

    // 权限腿二（读面，同一 salesperson 会话连打）：GET 产能概览派生键 capacity:read
    // 对销售岗同样未授予——403；管理员放行面在 T1/T2 已反复取数成功，这里补拒绝侧一枚
    const deniedSummary = await apiCallExpectFail(page, 'GET', '/production/capacity/summary');
    expect(
      deniedSummary.status,
      `salesperson 会话打 GET /production/capacity/summary（capacity:read 未授予）应被拒 403，实得 ${JSON.stringify(
        deniedSummary
      )}`
    ).toBe(403);
    expectDenied(
      deniedSummary,
      'salesperson 打 summary 的 403 必须归因权限门（派生键 capacity:read，种子矩阵只授 production_manager）'
    );

    // 放行腿：切回管理员同一请求 200 且算出 16，与拒绝腿合成权限面双向钉
    await loginViaUI(page, undefined, undefined, true);
    const allowed = await calc({ fabric_weight: '100', liquor_ratio: '1:8', items });
    assertDecimalEq(allowed[0].amount, 16, '放行腿基线染料用量');
  });
});
