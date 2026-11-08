// 本文件守两类门：一是业务流时序约束必须由后端拦截（报价未审批不得转订单、报价未提交不得审批、
// 定制订单未确认 OK 样不得进入报价/生产阶段），二是客户信用额度必须实时生效（小额度拦得住、
// 放大额度后同一请求立即放得过）。每个负例断言统一失败信封的字符串机器码与拒绝文案，并在被拒后
// 回读源单证明状态与金额零漂移；每个负例都配一条同链合法顺序的正例对照，用来排除"端点本身坏了"
// 这类假绿。金额一律取后端序列化的 DECIMAL(10,2) 字符串，净额只用除法反算（净额 = 含税 ÷ (1+税率)），
// 不用乘法造含税。状态字面量与 backend/src/models/status/ 写入方逐字符同源：sales_order 与 quotation
// 均为小写词值（draft / pending_approval / approved / pending / converted）。
import { test, expect } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ApiResponse,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';
import { pickListArray } from './ui-helpers';

type Row = Record<string, unknown>;

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

function requireId(v: unknown, label: string): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0)
    throw new Error(`${label}：未返回有效 id，raw=${JSON.stringify(v)}`);
  return n;
}

/**
 * 金额口径：只认后端序列化出的 DECIMAL 字符串（本项目未开 serde-float，出参不是 number）。
 * 入参：v 后端出参原值；label 定位用字段名。返回归一到"百分之一元"整数域的 bigint，
 * 供除法反算使用，禁止用乘法反推含税。
 */
function moneyScaled2(v: unknown, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s === '')
    throw new Error(
      `${label}：DECIMAL(10,2) 出参必须是字符串，实际类型=${typeof v} raw=${JSON.stringify(v)}`
    );
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：DECIMAL 字符串形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  const padded = (intPart + frac).padEnd(intPart.length + 2, '0').slice(0, intPart.length + 2);
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

/** 除法反算：num ÷ den，四舍五入到整数（bigint 域），用于净额 = 含税总额 ÷ (1 + 税率/100) */
function divRound(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error('除法反算分母为 0');
  const shifted = num * 2n + den;
  return shifted / (2n * den);
}

/** 失败信封六项校验：字符串机器码 + 非空 message + trace_id + timestamp 逐字段真实存在 */
function expectAppErrorEnvelope(
  res: import('./helpers').ApiFailureResult,
  expectCode: string,
  label: string
): void {
  expect(res.status, `${label}：应回 HTTP 400，实际 ${res.status}`).toBe(400);
  const code = failureCode(res);
  expect(typeof code, `${label}：失败体 code 必须是字符串机器码，raw=${JSON.stringify(res)}`).toBe(
    'string'
  );
  expect(code, `${label}：机器码`).toBe(expectCode);
  expect(typeof res.message, `${label}：message 必须是字符串`).toBe('string');
  expect((res.message ?? '').trim().length, `${label}：拒绝文案非空`).toBeGreaterThan(0);
  expect(typeof res.trace_id, `${label}：trace_id 必须是字符串（统一信封）`).toBe('string');
  expect((res.trace_id ?? '').length, `${label}：trace_id 非空`).toBeGreaterThan(0);
  expect(res.timestamp !== undefined, `${label}：timestamp 必须存在`).toBe(true);
}

/**
 * 成功信封校验：后端成功体是 ApiResponse{code,data}（utils/response.rs，
 * `ApiResponse::success()` 恒置 code=200 并携带 data 载荷），
 * 信封上根本没有 success 布尔位——读 `.success` 只会永远拿到 undefined，把成败判定悬空。
 * 因此成功腿只断真实承载位：code=200 + data 载荷类型与非空。三个信用动作端点
 * （occupy / adjust / deactivate）出参均为 ApiResponse<String>，data 是落库确认文案。
 */
function expectSuccessEnvelope(res: ApiResponse<string>, label: string): void {
  expect(res.code, `${label}：成功信封 code 应为 200，raw=${JSON.stringify(res)}`).toBe(200);
  expect(typeof res.data, `${label}：成功体必须带 data 载荷（后端 ApiResponse<String>）`).toBe(
    'string'
  );
  expect(res.data.trim().length, `${label}：data 载荷非空`).toBeGreaterThan(0);
}

async function readQuotation(page: import('@playwright/test').Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
}

/**
 * 建一张归属当前会话的报价单。
 * 入参：客户 id、业务员用户 id、报价专用产品 id 与其落库单位、含税标志与税率、行数量与单价。
 * 传给谁：后端 handlers/quotation_handler.rs create_quotation，落 sales_quotations 主表与明细。
 * 存什么：状态初始 draft，金额由服务端计算后落 total_amount（DECIMAL(10,2)）。
 * 金额口径：含税态（tax_inclusive=true）下含税单价是录入事实，单头总额取行腿含税事实的聚合，
 * 净单价与之成对录入（净额＝含税 ÷ (1+税率)），禁止把两个单价塞同一个数——那会让税额列
 * 恒为 0 并把净额反算带偏。unitPriceWithTax 缺省即与 unitPrice 同值，只适用于零税率腿。
 * 审批档位：total_amount 决定提交后走哪一档（services/quotation_approval_service.rs 的
 * ApproverRole::from_amount，阈值 10 万与 50 万），需要停在待审批的腿必须把金额做到 10 万以上。
 */
async function seedQuotation(
  page: import('@playwright/test').Page,
  args: {
    customerId: number;
    salesUserId: number;
    productId: number;
    productUnit: string;
    taxRate: string;
    quantity: string;
    unitPrice: string;
    unitPriceWithTax?: string;
  }
): Promise<{ id: number; status: string }> {
  const created = await apiCall<Row>(page, 'POST', '/quotations', {
    customer_id: args.customerId,
    sales_user_id: args.salesUserId,
    // 后端入参是 NaiveDate，只收 YYYY-MM-DD；发完整 ISO 时间戳会被判请求格式不正确
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: true,
    tax_rate: args.taxRate,
    items: [
      {
        product_id: args.productId,
        unit: args.productUnit,
        quantity: args.quantity,
        unit_price: args.unitPrice,
        unit_price_with_tax: args.unitPriceWithTax ?? args.unitPrice,
      },
    ],
    notes: `E2E-SEQ-${genCode('Q')}`,
  });
  const id = requireId(created.data?.id, '建报价单');
  const detail = await readQuotation(page, id);
  return { id, status: String(detail.status) };
}

/**
 * 建一张挂指定客户名下的销售订单（单行）。
 * 传给谁：services/so/order_crud.rs create_order（建单侧额度门在非生产环境跳过，
 * 额度门由提交侧 services/so/order_workflow.rs validate_customer_credit 承担）。
 * 存什么：sales_orders.total_amount（含税总额）+ sales_order_items 行金额。
 */
async function seedOrderForCustomer(
  page: import('@playwright/test').Page,
  args: {
    customerId: number;
    productId: number;
    quantity: string;
    unitPrice: string;
    taxPercent: string;
  }
): Promise<{ id: number; status: string; totalAmount: string }> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: args.customerId,
    order_date: new Date().toISOString(),
    items: [
      {
        product_id: args.productId,
        quantity: args.quantity,
        unit_price: args.unitPrice,
        tax_percent: args.taxPercent,
        quantity_tolerance_pct: '0',
      },
    ],
    notes: `E2E-CREDIT-${genCode('S')}`,
  });
  const id = requireId(created.id, '建销售订单');
  CLEANUP.push({ path: `/sales/orders/${id}`, label: `so#${id}` });
  const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  return {
    id,
    status: String(detail.status),
    totalAmount: String(detail.total_amount),
  };
}

/**
 * 建一个本用例独占的客户，避免改写共享客户信用额度污染同分片其它用例。
 * 存哪里：crm_customers.customer_name / status；用例结束由 CLEANUP 删除。
 */
async function seedDedicatedCustomer(page: import('@playwright/test').Page): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
    customer_name: `E2E 信用额度客户 ${genCode('C')}`,
    status: 'active',
  });
  const id = requireId(created.id, '建信用额度专用客户');
  CLEANUP.push({ path: `/crm/customers/${id}`, label: `crm-customer#${id}` });
  return id;
}

/** 读回客户信用视图：GET /crm/customers/{customer_id}/credit */
async function readCredit(page: import('@playwright/test').Page, customerId: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/crm/customers/${customerId}/credit`);
}

test.describe('448 业务流时序门控与客户信用额度', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('448-01 报价草稿跳步审批被后端拒绝，且被拒后状态零漂移', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.quotationProductId || !ctx.userIds[0])
      throw new Error('前置缺失：customerId / quotationProductId / userIds 未就绪');
    const q = await seedQuotation(page, {
      customerId: ctx.customerId,
      salesUserId: ctx.userIds[0],
      productId: ctx.quotationProductId,
      productUnit: ctx.quotationProductUnit,
      taxRate: '0',
      quantity: '1',
      unitPrice: '1',
    });
    expect(q.status, '报价单起点词值 draft').toBe('draft');

    const fail = await apiCallExpectFail(page, 'POST', `/quotations/${q.id}/approve`, {
      approval_reason: 'E2E 跳步审批负例',
    });
    expectAppErrorEnvelope(fail, APP_ERROR_CODES.BUSINESS_ERROR, '草稿报价跳步审批');
    expect(String(fail.message), '审批门回显当前状态 draft').toContain('draft');

    const after = await readQuotation(page, q.id);
    expect(String(after.status), '被拒后不得推进状态').toBe('draft');
    expect(after.approved_by ?? null, '被拒后不得写入审批人').toBeNull();
  });

  test('448-02 报价未审批转订单被拒绝，合法顺序提交-审批-转单则成功', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.quotationProductId || !ctx.userIds[0])
      throw new Error('前置缺失：customerId / quotationProductId / userIds 未就绪');

    // 负例：草稿直接转订单
    const bad = await seedQuotation(page, {
      customerId: ctx.customerId,
      salesUserId: ctx.userIds[0],
      productId: ctx.quotationProductId,
      productUnit: ctx.quotationProductUnit,
      taxRate: '0',
      quantity: '1',
      unitPrice: '1',
    });
    const fail = await apiCallExpectFail(page, 'POST', `/quotations/${bad.id}/convert`);
    expectAppErrorEnvelope(fail, APP_ERROR_CODES.BUSINESS_ERROR, '未审批报价转订单');
    expect(String(fail.message), '拒绝文案点名唯一合法前置').toContain('仅 approved 状态可转换');
    const stillDraft = await readQuotation(page, bad.id);
    expect(String(stillDraft.status), '被拒后报价状态零漂移').toBe('draft');

    // 正例：同一条链按合法顺序走通，证明上面的拒绝来自门控而不是端点坏了
    const good = await seedQuotation(page, {
      customerId: ctx.customerId,
      salesUserId: ctx.userIds[0],
      productId: ctx.quotationProductId,
      productUnit: ctx.quotationProductUnit,
      taxRate: '0',
      quantity: '2',
      unitPrice: '75000.00',
    });
    // 金额落在销售经理档（10 万到 50 万），提交必走 BPM 分支落 pending_approval；
    // 低于 10 万由小额自批短路直接落 approved，与 40 报价全链走同一档位口径。
    const submitted = await apiCallRaw<Row>(page, 'POST', `/quotations/${good.id}/submit`);
    expect(String(submitted.status), '提交后进入待审批 pending_approval').toBe('pending_approval');
    const approved = await apiCallRaw<Row>(page, 'POST', `/quotations/${good.id}/approve`, {
      approval_reason: 'E2E 合法顺序审批',
    });
    expect(String(approved.status), '审批后进入 approved').toBe('approved');
    const order = await apiCallRaw<Row>(page, 'POST', `/quotations/${good.id}/convert`);
    const orderId = requireId(order.id, '报价转订单');
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `so#${orderId}` });
    const converted = await readQuotation(page, good.id);
    expect(String(converted.status), '转单成功后报价置 converted').toBe('converted');
    const orderDetail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(Number(orderDetail.customer_id), '转出的订单挂同一客户').toBe(ctx.customerId);
    expect(String(orderDetail.status), '转出的订单回到草稿 draft').toBe('draft');
  });

  test('448-03 报价重复提交被拒绝，已待审批不得再次提交', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.quotationProductId || !ctx.userIds[0])
      throw new Error('前置缺失：customerId / quotationProductId / userIds 未就绪');
    const q = await seedQuotation(page, {
      customerId: ctx.customerId,
      salesUserId: ctx.userIds[0],
      productId: ctx.quotationProductId,
      productUnit: ctx.quotationProductUnit,
      taxRate: '0',
      // 审批档位由 total_amount 决定（ApproverRole::from_amount，阈值 10 万与 50 万）：
      // 1 元落在免审批档，提交即 approved，本条"已待审批不得再次提交"的判据就无从成立。
      // 金额取 12 万，停在中档待审批；税率 0 使含税与不含税同值，不影响档位判定。
      quantity: '1',
      unitPrice: '120000',
    });
    const first = await apiCallRaw<Row>(page, 'POST', `/quotations/${q.id}/submit`);
    expect(String(first.status), '首次提交进入 pending_approval').toBe('pending_approval');

    const fail = await apiCallExpectFail(page, 'POST', `/quotations/${q.id}/submit`);
    expectAppErrorEnvelope(fail, APP_ERROR_CODES.BUSINESS_ERROR, '待审批报价重复提交');
    expect(String(fail.message), '拒绝文案点名当前态').toContain('pending_approval');

    const after = await apiCallRaw<Row>(page, 'GET', `/quotations/${q.id}`);
    expect(String(after.status), '重复提交被拒后仍 pending_approval').toBe('pending_approval');
  });

  test('448-04 定制订单跳步推进到生产阶段被拒绝，顺序推进并回读工艺时间线', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.productIds[0]) throw new Error('前置缺失：customerId / productIds');
    const created = await apiCallRaw<Row>(page, 'POST', '/custom-orders', {
      order_no: genCode('CO'),
      customer_id: ctx.customerId,
      product_id: ctx.productIds[0],
      color_id: ctx.productColorIds[0],
      spec: '65%棉35%涤 40S 133x72 150cm',
      quantity: 500,
      unit: '米',
      custom_requirements: { yarn_spec: '40S', dye_method: 'reactive' },
      expected_delivery_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      notes: `E2E 时序门控定制订单 ${genCode('N')}`,
    });
    const id = requireId(created.id, '建定制订单');
    CLEANUP.push({ path: `/custom-orders/${id}`, label: `custom-order#${id}` });
    expect(String(created.status), '定制订单起点词值 draft').toBe('draft');

    // 负例：draft 直接跳 yarn_purchasing（大货投产），必须被状态机拒绝
    const fail = await apiCallExpectFail(page, 'POST', `/custom-orders/${id}/advance`, {
      to_status: 'yarn_purchasing',
      notes: 'E2E 跳步推进负例',
    });
    expectAppErrorEnvelope(fail, APP_ERROR_CODES.BUSINESS_ERROR, '定制订单跳步推进到生产阶段');
    expect(String(fail.message), '拒绝文案回显非法跳跃').toContain('yarn_purchasing');
    const afterFail = await apiCallRaw<Row>(page, 'GET', `/custom-orders/${id}`);
    expect(String(afterFail.status), '被拒后不得离开 draft').toBe('draft');

    // 正例：按顺序推进一格（draft → lab_dip），证明推进端点本身可用
    const advanced = await apiCallRaw<Row>(page, 'POST', `/custom-orders/${id}/advance`, {});
    expect(String(advanced.status), '顺序推进进入 lab_dip').toBe('lab_dip');

    // 时间线回读：GET /custom-orders/{id}/timeline 必须返回真实节点集合，不得空壳。
    // 出参 ProcessTimeline{order_id,order_no,current_status,nodes[]}，节点数组挂在 data.nodes
    // （models/custom_order_response_dto.rs），每节点必出 logs（后端该键是非 Option 的 Vec）。
    const timeline = await apiCall<unknown>(page, 'GET', `/custom-orders/${id}/timeline`);
    const rows = pickListArray(timeline.data, 'nodes', '定制订单工艺时间线');
    expect(Array.isArray(rows), '时间线必须是数组形态').toBe(true);
    // 建单即落 5 个默认工艺节点（services/custom_order_crud_service.rs），空壳即契约破坏
    expect(rows.length, '时间线必须返回真实工艺节点').toBeGreaterThan(0);
    for (const node of rows) {
      expect(Number(node.id), `工艺节点缺少 id：${JSON.stringify(node)}`).toBeGreaterThan(0);
      expect(
        Array.isArray(node.logs),
        `工艺节点缺少 logs 数组键（后端必出 Vec，缺即契约破坏）：${JSON.stringify(node)}`
      ).toBe(true);
    }
  });

  test('448-05 未确认 OK 样不得推进到报价阶段，未审批报价不得推进到生产阶段', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.productIds[0]) throw new Error('前置缺失：customerId / productIds');
    const created = await apiCallRaw<Row>(page, 'POST', '/custom-orders', {
      order_no: genCode('CO'),
      customer_id: ctx.customerId,
      product_id: ctx.productIds[0],
      color_id: ctx.productColorIds[0],
      spec: '65%棉35%涤 40S 133x72 150cm',
      quantity: 300,
      unit: '米',
      custom_requirements: { yarn_spec: '40S' },
      expected_delivery_date: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
      notes: `E2E 前置门负例 ${genCode('N')}`,
    });
    const id = requireId(created.id, '建定制订单');
    CLEANUP.push({ path: `/custom-orders/${id}`, label: `custom-order#${id}` });

    // 先到 lab_dip（合法顺序），再请求进 quotation：未关联打样通知单（approved_sample_id 缺失同门）
    const toLabDip = await apiCallRaw<Row>(page, 'POST', `/custom-orders/${id}/advance`, {});
    expect(String(toLabDip.status), '顺序推进到 lab_dip').toBe('lab_dip');

    const gateQuotation = await apiCallExpectFail(page, 'POST', `/custom-orders/${id}/advance`, {
      to_status: 'quotation',
      notes: 'E2E 未确认样请求报价阶段',
    });
    expectAppErrorEnvelope(
      gateQuotation,
      APP_ERROR_CODES.BUSINESS_ERROR,
      '未确认 OK 样推进到报价阶段'
    );
    const stillLabDip = await apiCallRaw<Row>(page, 'GET', `/custom-orders/${id}`);
    expect(String(stillLabDip.status), '前置门拒绝后停在 lab_dip').toBe('lab_dip');

    // 跳生产阶段：quotation_id 为空，同一前置门族（必须关联已审批报价）
    const gateYarn = await apiCallExpectFail(page, 'POST', `/custom-orders/${id}/advance`, {
      to_status: 'yarn_purchasing',
      notes: 'E2E 未审批报价请求生产阶段',
    });
    expectAppErrorEnvelope(gateYarn, APP_ERROR_CODES.BUSINESS_ERROR, '非相邻阶段跳跃');
    const finalState = await apiCallRaw<Row>(page, 'GET', `/custom-orders/${id}`);
    expect(String(finalState.status), '两次拒绝后主单状态零漂移').toBe('lab_dip');
  });

  test('448-06 超额占用信用额度被拒绝，且拒绝后占用与可用额度零漂移', async ({ page }) => {
    const customerId = await seedDedicatedCustomer(page);
    const limit = '10.00';
    const created = await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
      customer_id: customerId,
      credit_level: 'E2E',
      credit_limit: limit,
      credit_days: 30,
      remark: `E2E 小额度 ${genCode('L')}`,
    });
    requireId(created.id ?? customerId, '建信用评级');
    CLEANUP.push({ path: `/crm/customer-credits/${customerId}`, label: `credit#${customerId}` });

    const before = await readCredit(page, customerId);
    expect(moneyScaled2(before.credit_limit, 'credit_limit'), '写入的额度初值').toBe(1000n);
    expect(moneyScaled2(before.available_credit, 'available_credit'), '可用额度等于额度').toBe(
      1000n
    );
    expect(moneyScaled2(before.used_credit, 'used_credit'), '已用额度起点为 0').toBe(0n);
    expect(String(before.status), '信用评级起点词值 active').toBe('active');

    const fail = await apiCallExpectFail(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/occupy`,
      { amount: '50.00' }
    );
    expectAppErrorEnvelope(fail, APP_ERROR_CODES.BUSINESS_ERROR, '超额占用信用额度');

    const after = await readCredit(page, customerId);
    expect(moneyScaled2(after.used_credit, 'used_credit'), '被拒后已用额度不增加').toBe(0n);
    expect(moneyScaled2(after.available_credit, 'available_credit'), '被拒后可用额度不减少').toBe(
      1000n
    );
  });

  test('448-07 放大信用额度立即生效，同一占用请求重放由拒转通', async ({ page }) => {
    const customerId = await seedDedicatedCustomer(page);
    await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
      customer_id: customerId,
      credit_level: 'E2E',
      credit_limit: '10.00',
      credit_days: 30,
      remark: `E2E 额度调整 ${genCode('L')}`,
    });
    CLEANUP.push({ path: `/crm/customer-credits/${customerId}`, label: `credit#${customerId}` });

    const blocked = await apiCallExpectFail(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/occupy`,
      { amount: '50.00' }
    );
    expectAppErrorEnvelope(blocked, APP_ERROR_CODES.BUSINESS_ERROR, '放大额度前的超额占用');

    const adjusted = await apiCall<string>(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/adjust`,
      { adjustment_type: 'increase', amount: '100.00', reason: 'E2E 放大额度以验证实时生效' }
    );
    expectSuccessEnvelope(adjusted, '额度调整');

    // 写后读回：额度变更必须已落库并对后续请求生效
    const afterAdjust = await readCredit(page, customerId);
    expect(moneyScaled2(afterAdjust.credit_limit, 'credit_limit'), '额度 = 10 + 100').toBe(11000n);
    expect(moneyScaled2(afterAdjust.available_credit, 'available_credit'), '可用同步放大').toBe(
      11000n
    );

    // 重放同一笔占用：这次必须通过，且金额按减法落到两个字段上
    const replay = await apiCall<string>(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/occupy`,
      { amount: '50.00' }
    );
    expectSuccessEnvelope(replay, '放大额度后重放的占用请求');
    const afterOccupy = await readCredit(page, customerId);
    expect(moneyScaled2(afterOccupy.used_credit, 'used_credit'), '已用 = 50.00').toBe(5000n);
    expect(moneyScaled2(afterOccupy.available_credit, 'available_credit'), '可用 = 110 - 50').toBe(
      6000n
    );

    // 释放回到原点，证明占用不是只进不出
    await apiCallRaw<Row>(page, 'POST', `/crm/customer-credits/${customerId}/release`, {
      amount: '50.00',
    });
    const afterRelease = await readCredit(page, customerId);
    expect(moneyScaled2(afterRelease.used_credit, 'used_credit'), '释放后已用归零').toBe(0n);
    expect(moneyScaled2(afterRelease.available_credit, 'available_credit'), '释放后可用复原').toBe(
      11000n
    );
  });

  test('448-08 销售订单提交腿信用额度门：超额被拒，放大额度后重放提交通过', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：ctx.productIds 为空');
    const customerId = await seedDedicatedCustomer(page);
    // 先建单（无信用评级 => 建单侧门放行），再设低额度使提交侧门拦截
    const order = await seedOrderForCustomer(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '2',
      unitPrice: '100.00',
      taxPercent: '13',
    });
    expect(order.status, '新订单起点词值 draft').toBe('draft');
    const gross = moneyScaled2(order.totalAmount, 'sales_orders.total_amount');
    expect(gross, '后端落库的含税总额').toBe(22600n);
    // 净额只由除法反算：226.00 ÷ 1.13 = 200.00（不许用乘法造含税）
    const net = divRound(gross * 100n, 113n);
    expect(net, '净额 = 含税 ÷ (1 + 税率)').toBe(20000n);

    await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
      customer_id: customerId,
      credit_level: 'E2E',
      credit_limit: '10.00',
      credit_days: 30,
      remark: `E2E 提交门 ${genCode('L')}`,
    });
    CLEANUP.push({ path: `/crm/customer-credits/${customerId}`, label: `credit#${customerId}` });

    const blocked = await apiCallExpectFail(page, 'POST', `/sales/orders/${order.id}/submit`);
    expectAppErrorEnvelope(blocked, APP_ERROR_CODES.BUSINESS_ERROR, '超额订单提交');
    expect(String(blocked.message), '拒绝文案点名信用前置').toContain('信用额度不足');
    const stillDraft = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    expect(String(stillDraft.status), '被拒后订单仍 draft，未半程写入').toBe('draft');

    await apiCallRaw<Row>(page, 'PUT', `/crm/customer-credits/${customerId}`, {
      credit_limit: '1000.00',
    });
    const afterUpdate = await readCredit(page, customerId);
    expect(moneyScaled2(afterUpdate.credit_limit, 'credit_limit'), '额度变更已读回生效').toBe(
      100000n
    );

    const submitted = await apiCallRaw<Row>(page, 'POST', `/sales/orders/${order.id}/submit`);
    expect(String(submitted.status), '放大额度后同一单据提交通过并进入 pending').toBe('pending');
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    expect(String(detail.status), '提交结果已落库').toBe('pending');
  });

  test('448-09 信用评级停用后额度充足也拦得住，占用与提交双双被拒', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：ctx.productIds 为空');
    const customerId = await seedDedicatedCustomer(page);
    await apiCallRaw<Row>(page, 'POST', '/crm/customer-credits', {
      customer_id: customerId,
      credit_level: 'E2E',
      credit_limit: '1000.00',
      credit_days: 30,
      remark: `E2E 停用态 ${genCode('L')}`,
    });
    CLEANUP.push({ path: `/crm/customer-credits/${customerId}`, label: `credit#${customerId}` });

    // 先建单（评级 active => 建单侧门放行），再停用使提交侧门拦截
    const order = await seedOrderForCustomer(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '1',
      unitPrice: '1.00',
      taxPercent: '0',
    });

    const deactivated = await apiCall<string>(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/deactivate`
    );
    expectSuccessEnvelope(deactivated, '停用信用评级');
    const view = await readCredit(page, customerId);
    expect(String(view.status), '停用后评级状态词值 inactive').toBe('inactive');

    const occupyFail = await apiCallExpectFail(
      page,
      'POST',
      `/crm/customer-credits/${customerId}/occupy`,
      { amount: '1.00' }
    );
    expectAppErrorEnvelope(occupyFail, APP_ERROR_CODES.BUSINESS_ERROR, '非活跃评级下占用额度');
    const submitFail = await apiCallExpectFail(page, 'POST', `/sales/orders/${order.id}/submit`);
    expectAppErrorEnvelope(submitFail, APP_ERROR_CODES.BUSINESS_ERROR, '非活跃评级下提交订单');
    expect(String(submitFail.message), '提交侧拒绝文案点名信用前置').toContain('信用额度不足');
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    expect(String(detail.status), '被拒后订单仍 draft').toBe('draft');
  });

  test('448-10 金额口径：后端出参恒为 DECIMAL 字符串，净额仅用除法反算', async ({ page }) => {
    const ctx = getCtx();
    if (!ctx.productIds[0]) throw new Error('前置缺失：ctx.productIds 为空');
    const customerId = await seedDedicatedCustomer(page);

    const order = await seedOrderForCustomer(page, {
      customerId,
      productId: ctx.productIds[0],
      quantity: '3',
      unitPrice: '50.00',
      taxPercent: '13',
    });
    // 出参类型判据：不是 number 而是后端序列化的字符串（未开 serde-float）
    const detail = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${order.id}`);
    expect(typeof detail.total_amount, 'total_amount 出参类型必须是 string').toBe('string');
    const gross = moneyScaled2(detail.total_amount, 'sales_orders.total_amount');
    expect(gross, '含税总额 3×50×1.13 = 169.50 由后端算出').toBe(16950n);
    const net = divRound(gross * 100n, 113n);
    expect(net, '净额由除法反算 = 150.00').toBe(15000n);
    expect((net * 113n) / 100n, '反算净额乘回税率应回到含税总额（口径自洽）').toBe(gross);

    const lines = detail.items as Row[];
    expect(Array.isArray(lines), '订单明细必须存在').toBe(true);
    const line = lines[0];
    expect(typeof line.quantity, '行数量出参类型必须是 string').toBe('string');
    expect(moneyScaled2(line.unit_price, 'sales_order_items.unit_price'), '行单价').toBe(5000n);

    if (!ctx.quotationProductId || !ctx.userIds[0])
      throw new Error('前置缺失：quotationProductId / userIds 未就绪');
    const q = await seedQuotation(page, {
      customerId,
      salesUserId: ctx.userIds[0],
      productId: ctx.quotationProductId,
      productUnit: ctx.quotationProductUnit,
      taxRate: '13',
      quantity: '2',
      unitPrice: '100.00',
    });
    const qDetail = await readQuotation(page, q.id);
    expect(typeof qDetail.total_amount, '报价单 total_amount 出参必须是 string').toBe('string');
    const qGross = moneyScaled2(qDetail.total_amount, 'sales_quotations.total_amount');
    expect(qGross > 0n, '报价含税总额非零').toBe(true);
    // 报价头按含税口径录入（tax_inclusive 为真），净额只由除法反算：200.00 ÷ 1.13 = 176.99
    expect(divRound(qGross * 100n, 113n), '报价净额由除法反算，与订单腿同一口径').toBe(17699n);
  });
});
