import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  deferCleanup,
  expectDenied,
  expectStateGateRejection,
  failureCode,
  flushDeferredCleanups,
  loginAsRole,
  loginViaUI,
  testPassword,
  testUsername,
  type DeferredCleanup,
} from './helpers';

/**
 * 255 大货处方加料单状态机与配方计算契约（production 族 W1-E 的 UI 有、e2e 无配对腿）
 *
 * 覆盖端点（挂载前缀 /api/v1/erp/production 取自 backend/src/routes/production.rs 的
 * production_recipe_router，路由登记同文件 180-219 行；前端 baseURL 只写到 /api/v1/erp，
 * 故调用面写 /production/... 其后部分）：
 *   GET  /production/production-recipes/additions/{id}      handler 274 行 get_addition
 *   POST /production/production-recipes/additions/{id}/approve  handler 289 行 approve_addition
 *   POST /production/production-recipes/additions/{id}/close    handler 307 行 close_addition
 *   POST /production/production-recipes/calculate           handler 213 行 calculate
 * 四条路径的 {id} 与 calculate 末段均在 frontend/scripts/route-snapshot.txt 逐字存在
 * （95、772、1470、1471、1472 行），非臆测端点。前置依赖腿走族内既有创建腿：
 * POST /production/production-recipes 建单、POST /production/production-recipes/{id}/approve
 * 审核、POST /production/production-recipes/{id}/additions 开加料单（handler 94、159、257 行），
 * 不用种子数据，保证可重复且可归因。
 *
 * 词表与判据来源（大小写按写入值逐字符对齐，不自行英文化）：
 * 加料状态 draft/approved/closed 取自 backend/src/models/status/quality_dyeing.rs:126-135
 * 的 production_recipe_addition；大货处方状态同源同形（同文件 111 行起）。
 * 状态机转移表是 services/production_recipe_service.rs:314-328（加料）与 209-226（大货）：
 * approved→approved 与 closed→approved 与 closed→closed 皆落 `_ => false` 终态拒绝。
 * 前置门：开加料单要求主单 status == approved（ops/addition.rs:42-47）；
 * 审核要求明细非空（addition.rs:173-176）。
 * 出参键名以实体列为准（models/production_recipe_addition.rs:33-75 的 snake_case 字段，
 * 无 rename 属性），本文件用 ADDITION_COLUMNS 逐列锁死键集。
 * 单号格式 `{前缀}{YYYYMMDD}{3 位流水}`（utils/number_generator.rs:44、75 行），
 * 大货处方前缀 RP、加料处方前缀 PA（services/production_recipe_service.rs:131、298 行）。
 *
 * 查出的后端现状（按现状钉住，不写成成功，也不改源码）：
 * 缺陷一：加料处方与大货处方都没有关闭审计列。production_recipe_addition 的列全集只有
 *   approved_by/approved_at/issued_by（models/production_recipe_addition.rs:60-65），
 *   close 实际只写 status 与 updated_at（services/production_recipe_ops/addition.rs:190-199），
 *   主单 close 同形（recipe_state.rs:39-49）。故关闭腿的副作用只断 status 与 updated_at 两点，
 *   approved_by/approved_at 必须保持原值不清空。
 * 缺陷二：状态门拒绝文案不可外显。非法流转走 AppError::business（facade
 *   services/production_recipe_service.rs:220、322 行），出参 message 恒为脱敏常量
 *   「业务处理失败」（utils/messages.rs:43），含当前状态的原文只进日志；用量计算的入参门
 *   同走该通道（facade 178、180、184、192 行）。故本文件断的是脱敏常量逐字符本身，
 *   不假装能读出业务原因。
 * 缺陷三：不存在主键不回 200 空壳，回 404 且文案脱敏。get_by_id 用 AppError::not_found
 *   （addition.rs:110 行），message 恒「资源未找到」（utils/messages.rs:42），主键不外显。
 * 缺陷四：创建加料单请求体的 production_recipe_id 是死字段，handler 264 行无条件用路径
 *   id 覆盖。本文件用「体填不存在主键 + 路径填真单」钉住覆盖行为，防止日后误读成体字段生效。
 * 缺口如实声明：加料处方没有 DELETE 路由（routes/production.rs:207-217 只登记 GET 与
 *   approve/close 两条动作腿），主单 DELETE 只放行 draft（facade 229-249 行），
 *   因此本文件的可回收面只有草稿主单一条 DELETE，已流转主单与全部加料单是终态残留行；
 *   dyeing_master 的 GET 面不判据（get_by_id 的行级归属门 addition.rs:114-121 取决于
 *   两个账号的部门归属关系，非本 spec 可控），只钉写面 403；匿名写面不判据（CSRF 门与
 *   认证门的先后不由本 spec 定义），只取匿名 GET 两条 401。
 */

type Row = Record<string, unknown>;

/** 失败信封四键（backend/src/utils/error.rs:775-780 的 ErrorResponse 结构体） */
interface FailEnvelope {
  code?: string;
  message?: string;
  trace_id?: string;
  timestamp?: number;
}

/** 处方物料明细项（models/production_recipe.rs:16-27 的 RecipeMaterialItem，出参键同名） */
interface RecipeItemRow {
  material_code: string;
  material_name: string;
  concentration: string | null;
  unit: string;
  amount: string;
  category: string;
}

/** 加料明细项（models/production_recipe_addition.rs:17-28 的 AdditionMaterialItem，无浓度列） */
interface AdditionItemRow {
  material_code: string;
  material_name: string;
  amount: string;
  unit: string;
  category: string;
}

/** 出参键集锁：与实体声明序逐列对应（models/production_recipe_addition.rs:33-75） */
const ADDITION_COLUMNS = [
  'id',
  'addition_no',
  'production_recipe_id',
  'work_order_id',
  'dye_batch_id',
  'addition_reason',
  'addition_detail',
  'total_cost',
  'status',
  'approved_by',
  'approved_at',
  'issued_by',
  'remarks',
  'is_deleted',
  'created_by',
  'created_at',
  'updated_at',
];

/** 状态词表原值（models/status/quality_dyeing.rs:128/131/134 行） */
const DRAFT = 'draft';
const APPROVED = 'approved';
const CLOSED = 'closed';

/** 脱敏常量原值（utils/messages.rs:42、43 行） */
const MESSAGE_BUSINESS_MASKED = '业务处理失败';
const MESSAGE_NOT_FOUND_MASKED = '资源未找到';

/** 认证门机器码（utils/error.rs:785 行 CODE_UNAUTHORIZED，认证中间件复用同码） */
const CODE_UNAUTHORIZED = 'UNAUTHORIZED';

/** 不存在主键探针：落在 i32 范围内（路径提取器是 Path<i32>，handler 277 行），且远大于业务流水 */
const GHOST_ID = 2_000_000_001;

/** 延迟清理队列（本文件私有，afterEach 统一 flush，队列语义见 helpers.ts:3733-3766） */
const CLEANUP: DeferredCleanup[] = [];
test.afterEach(async ({ page }) => {
  await flushDeferredCleanups(page, CLEANUP);
});

/** 跨用例传递的被测主键（serial 顺序执行，同 worker） */
let mainRecipeId = 0;
let mainAdditionId = 0;
let approvedAtAfterApprove = '';
let updatedAtAfterApprove = '';
let sessionUserId = 0;

/** rust_decimal 出参是字符串（rust_decimal 默认 Serialize 写字面量），先钉类型再数值化比较 */
function expectDecimal(value: unknown, context: string): string {
  expect(
    typeof value,
    `${context}：DECIMAL 出参应为字符串（缺键或非字符串即契约漂移），实得 ${JSON.stringify(value)}`
  ).toBe('string');
  return value as string;
}

function toNum(value: unknown): number {
  return Number(String(value));
}

/** 失败信封逐键锁死：四键齐全 + trace_id 为 32 位小写 hex + timestamp 为秒级整数 */
function assertFailEnvelope(body: FailEnvelope, context: string): void {
  expect(
    Object.keys(body).slice().sort(),
    `${context}：失败体只有 AppError 一种形状（utils/error.rs:775-780），键集漂移即契约变更`
  ).toEqual(['code', 'message', 'timestamp', 'trace_id']);
  expect(
    typeof body.code === 'string' && body.code.length > 0,
    `${context}：code 应为非空字符串码`
  ).toBe(true);
  expect(
    typeof body.trace_id === 'string' && /^[0-9a-f]{32}$/.test(body.trace_id),
    `${context}：trace_id 应为 Uuid::simple 的 32 位小写 hex（utils/response.rs:148-157 与响应头同源），实得 ${JSON.stringify(body.trace_id)}`
  ).toBe(true);
  expect(
    Number.isInteger(body.timestamp),
    `${context}：timestamp 应为整数秒，实得 ${JSON.stringify(body.timestamp)}`
  ).toBe(true);
}

/** GET 直取失败体（GET 不消费 CSRF，可用 page.request 原样拿全四键） */
async function fetchFailEnvelope(
  page: Page,
  path: string
): Promise<{ status: number; body: FailEnvelope }> {
  const res = await page.request.fetch(`${API_BASE}${API_PREFIX}${path}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  const body = (await res.json()) as FailEnvelope;
  return { status: res.status(), body };
}

/**
 * 建大货处方（功能：加料单的前置主单；调用方：本文件三条腿；
 * 入参：备布重量与浴比为必填（facade:53、56 行），明细必填审核门（recipe_state.rs:26-30）；
 * 传给谁：handler create（94 行）→ recipe_crud.rs::create；存什么：production_recipe 表一行 draft；
 * 存哪里：production_recipe.recipe_no 取号 RP{YYYYMMDD}{3 位流水}）
 */
async function createRecipe(page: Page, tag: string): Promise<Row> {
  const res = await apiCall<Row>(page, 'POST', '/production/production-recipes', {
    color_no: `E255${tag}`,
    fabric_name: `e255-${tag}`,
    fabric_weight: '100',
    liquor_ratio: '1:8',
    adjustment_factor: '2',
    recipe_detail: [
      {
        material_code: `E255DYE${tag}`,
        material_name: `e255-dye-${tag}`,
        concentration: '1.5',
        unit: 'kg',
        amount: '0',
        category: 'dye',
      },
      {
        material_code: `E255AUX${tag}`,
        material_name: `e255-aux-${tag}`,
        concentration: null,
        unit: 'kg',
        amount: '7.5',
        category: 'auxiliary',
      },
    ],
    remarks: `e255 ${tag}`,
  });
  const row = res.data;
  expect(
    Number.isInteger(Number(row.id)),
    `${tag} 建单应返回整数主键，实得 ${JSON.stringify(row.id)}`
  ).toBe(true);
  expect(
    /^RP\d{11}$/.test(String(row.recipe_no)),
    `${tag} 大货处方单号应为 RP+日期八位+流水三位（number_generator.rs:44 与 service:131 行同源），实得 ${JSON.stringify(row.recipe_no)}`
  ).toBe(true);
  return row;
}

async function readRecipe(page: Page, id: number): Promise<Row> {
  const res = await apiCall<Row>(page, 'GET', `/production/production-recipes/${id}`);
  return res.data;
}

async function readAddition(page: Page, id: number): Promise<Row> {
  const res = await apiCall<Row>(page, 'GET', `/production/production-recipes/additions/${id}`);
  return res.data;
}

/**
 * 开加料单（功能：被测状态机的入口；调用方：本文件全部流转腿；
 * 入参：production_recipe_id 由路径覆盖（handler:264 行），明细与原因落 addition_detail/addition_reason；
 * 传给谁：handler create_addition（257 行）→ addition.rs::create；存什么：production_recipe_addition
 * 一行 draft，approved_by/approved_at 置空（addition.rs:68-69 行）；存哪里：单号 PA{YYYYMMDD}{3 位流水}）
 */
async function createAddition(page: Page, recipeId: number, tag: string): Promise<Row> {
  const res = await apiCall<Row>(
    page,
    'POST',
    `/production/production-recipes/${recipeId}/additions`,
    {
      production_recipe_id: GHOST_ID,
      addition_reason: '色差',
      addition_detail: [
        {
          material_code: `E255ADYE${tag}`,
          material_name: `e255-addye-${tag}`,
          amount: '3.25',
          unit: 'kg',
          category: 'dye',
        },
        {
          material_code: `E255AAUX${tag}`,
          material_name: `e255-adaux-${tag}`,
          amount: '1',
          unit: 'L',
          category: 'auxiliary',
        },
      ],
      total_cost: '65.5',
      remarks: `e255 addition ${tag}`,
    }
  );
  const row = res.data;
  expect(
    Number.isInteger(Number(row.id)) && Number(row.id) > 0,
    `${tag} 加料单建单应返回整数主键，实得 ${JSON.stringify(row.id)}`
  ).toBe(true);
  expect(
    /^PA\d{11}$/.test(String(row.addition_no)),
    `${tag} 加料单号应为 PA+日期八位+流水三位（service:298 行注释与前缀 PA 同源），实得 ${JSON.stringify(row.addition_no)}`
  ).toBe(true);
  return row;
}

/** 用量计算请求体（浓度与系数一律字符串，避免浮点字面量进入 Decimal 解析通道） */
function calcRequest(
  liquorRatio: string,
  items: Array<{ material_code: string; concentration: string | null; amount: string }>
): Row {
  return {
    fabric_weight: '100',
    liquor_ratio: liquorRatio,
    adjustment_factor: '2',
    items: items.map((it, idx) => ({
      material_code: it.material_code,
      material_name: `e255-calc-${idx}`,
      concentration: it.concentration,
      unit: 'kg',
      amount: it.amount,
      category: it.concentration === null ? 'auxiliary' : 'dye',
    })),
  };
}

/**
 * 后端公式的服务端独立复算（口径取 services/production_recipe_service.rs:198 行
 * 的乘除顺序：浓度 × 备布重量 × 浴比 ÷ 100 × 加成系数；无浓度项不重算，原值透传）
 */
function expectedAmount(
  concentration: string | null,
  fabricWeight: number,
  ratio: number,
  factor: number,
  passthrough: string
): number {
  if (concentration === null) {
    return Number(passthrough);
  }
  return ((Number(concentration) * fabricWeight * ratio) / 100) * factor;
}

test.describe.serial('255 加料处方状态机与配方计算契约', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('前置门与全链流转：草稿主单不可开加料单，审核写审计列，关闭只落状态', async ({ page }) => {
    // 前置门负例：主单 draft 时开加料单必须被拒，且不留半行
    const draftRecipe = await createRecipe(page, 'GATE');
    const draftRecipeId = Number(draftRecipe.id);
    deferCleanup(
      CLEANUP,
      'DELETE',
      `/production/production-recipes/${draftRecipeId}`,
      '[255] draft recipe GATE'
    );
    const draftRow = await readRecipe(page, draftRecipeId);
    expect(draftRow.status, '建单落库态必须是词表原值 draft').toBe(DRAFT);
    expect(draftRow.approved_by, '建单不写审核人（recipe_crud.rs:106 行 Set(None)）').toBeNull();
    expect(draftRow.approved_at, '建单不写审核时间（recipe_crud.rs:107 行 Set(None)）').toBeNull();
    expect(Number(draftRow.issued_by), 'issued_by 取服务端会话（handler:100 行）').toBe(
      Number(draftRow.created_by)
    );
    sessionUserId = Number(draftRow.created_by);
    expect(
      Number.isInteger(sessionUserId) && sessionUserId > 0,
      `会话用户 id 应为正整数，实得 ${JSON.stringify(draftRow.created_by)}`
    ).toBe(true);

    const blocked = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${draftRecipeId}/additions`,
      {
        addition_reason: '助剂不足',
        addition_detail: [
          {
            material_code: 'E255GATEDYE',
            material_name: 'e255-gatedye',
            amount: '1',
            unit: 'kg',
            category: 'dye',
          },
        ],
      }
    );
    expectStateGateRejection(blocked, '草稿大货处方开加料单应被前置状态门拒绝');
    expect(
      failureCode(blocked),
      `前置门拒绝码应为 BUSINESS_ERROR（AppError::business → error.rs:824 行），实得 ${JSON.stringify(blocked.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      blocked.message,
      `business 通道出参恒为脱敏常量（缺陷二），实得 ${JSON.stringify(blocked.message)}`
    ).toBe(MESSAGE_BUSINESS_MASKED);

    // 拒绝零副作用：列表回读必须是空数组（addition.rs 未走到 insert）
    const emptyList = await apiCall<Row[]>(
      page,
      'GET',
      `/production/production-recipes/${draftRecipeId}/additions`
    );
    expect(Array.isArray(emptyList.data), '加料列表出参应为数组').toBe(true);
    expect(emptyList.data.length, '被拒的加料单不得留下半行').toBe(0);

    // 正向链：主单 draft → approved
    const main = await createRecipe(page, 'MAIN');
    mainRecipeId = Number(main.id);
    const approvedRecipe = await apiCall<Row>(
      page,
      'POST',
      `/production/production-recipes/${mainRecipeId}/approve`
    );
    const recipeBack = await readRecipe(page, mainRecipeId);
    expect(recipeBack.status, '主单审核副作用必须落进 approved').toBe(APPROVED);
    expect(approvedRecipe.data.status, '审核出参与回读同源同值，不得只回 200 不改状态').toBe(
      APPROVED
    );
    expect(
      Number(recipeBack.approved_by),
      'approved_by 必须写会话用户（handler:169 行 auth.user_id 传入）'
    ).toBe(sessionUserId);
    expect(
      typeof recipeBack.approved_at === 'string' &&
        !Number.isNaN(Date.parse(String(recipeBack.approved_at))),
      `approved_at 必须是可解析时间串（recipe_state.rs:37 行 Set(Some(now))），实得 ${JSON.stringify(recipeBack.approved_at)}`
    ).toBe(true);

    // 加料单建单：体填不存在主键、路径填真单 → 证明 handler:264 行的覆盖（缺陷四）
    const addition = await createAddition(page, mainRecipeId, 'MAIN');
    mainAdditionId = Number(addition.id);
    const additionDraft = await readAddition(page, mainAdditionId);
    expect(
      Object.keys(additionDraft).slice().sort(),
      '加料单出参键集必须与实体列逐一对应（缺陷一的列全集即此）'
    ).toEqual([...ADDITION_COLUMNS].sort());
    expect(additionDraft.status, '加料建单落 draft').toBe(DRAFT);
    expect(Number(additionDraft.production_recipe_id), '路径 id 覆盖请求体 id').toBe(mainRecipeId);
    expect(additionDraft.approved_by, '加料建单不写审核人').toBeNull();
    expect(additionDraft.approved_at, '加料建单不写审核时间').toBeNull();
    expect(Number(additionDraft.issued_by), '加料 issued_by 取会话').toBe(sessionUserId);
    expect(additionDraft.work_order_id, '主单未关联工单时继承为 null，不接受 0 占位').toBeNull();
    expect(additionDraft.is_deleted, '新建行未软删').toBe(false);
    expect(additionDraft.addition_reason, '加料原因按提交值原样落库').toBe('色差');
    const items = additionDraft.addition_detail as AdditionItemRow[];
    expect(items.length, '加料明细两条按提交条数回读').toBe(2);
    expect(
      expectDecimal(items[0].amount, '加料明细 amount（DECIMAL）'),
      '加料明细用量逐字符回读提交值'
    ).toBe('3.25');
    expect(items[1].category, '明细类别原样回读').toBe('auxiliary');
    expect(toNum(expectDecimal(additionDraft.total_cost, '加料成本合计')), '成本合计数值落库').toBe(
      65.5
    );

    // 加料审核：状态与两条审计列同时落库
    await apiCall(
      page,
      'POST',
      `/production/production-recipes/additions/${mainAdditionId}/approve`
    );
    const additionApproved = await readAddition(page, mainAdditionId);
    expect(additionApproved.status, '加料审核副作用必须落进 approved').toBe(APPROVED);
    expect(Number(additionApproved.approved_by), '加料审核人取会话（handler:299 行）').toBe(
      sessionUserId
    );
    expect(
      typeof additionApproved.approved_at === 'string',
      '加料审核时间必须真写进去（addition.rs:183 行）'
    ).toBe('string');
    approvedAtAfterApprove = String(additionApproved.approved_at);
    updatedAtAfterApprove = String(additionApproved.updated_at);
    expect(
      !Number.isNaN(Date.parse(approvedAtAfterApprove)),
      `审核时间应可解析，实得 ${JSON.stringify(approvedAtAfterApprove)}`
    ).toBe(false);

    // 加料关闭：只改 status 与 updated_at（缺陷一），审核列保持原值不清空
    const closedOut = await apiCall<Row>(
      page,
      'POST',
      `/production/production-recipes/additions/${mainAdditionId}/close`
    );
    const additionClosed = await readAddition(page, mainAdditionId);
    expect(additionClosed.status, '加料关闭副作用必须落进 closed').toBe(CLOSED);
    expect(closedOut.data.status, '关闭出参与回读同值').toBe(CLOSED);
    expect(
      Number(additionClosed.approved_by),
      '关闭不得清空审核人（实体无关闭审计列，addition.rs:194-197 行只写两列）'
    ).toBe(sessionUserId);
    expect(additionClosed.approved_at, '关闭不得清空审核时间，必须与审核腿回读值逐字符相同').toBe(
      approvedAtAfterApprove
    );
    expect(
      String(additionClosed.updated_at) !== updatedAtAfterApprove,
      '关闭必须推进 updated_at，否则该腿没有落库'
    ).toBe(true);
    expect(
      Object.keys(additionClosed).filter(k => k.startsWith('closed_')),
      '按现状钉住：实体不存在 closed_by/closed_at 列（缺陷一）'
    ).toEqual([]);
  });

  test('非法流转与不存在主键：终态复操作回 400 脱敏文案，主键不存在回 404，状态零漂移', async ({
    page,
  }) => {
    expect(mainAdditionId, '依赖上一轮的已关闭加料单').toBeGreaterThan(0);

    // closed → approved：终态复操作
    const approveAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${mainAdditionId}/approve`
    );
    expectStateGateRejection(approveAgain, '已关闭加料单再审核应被终态门拒绝');
    expect(failureCode(approveAgain)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(approveAgain.message).toBe(MESSAGE_BUSINESS_MASKED);
    const afterApproveAgain = await readAddition(page, mainAdditionId);
    expect(afterApproveAgain.status, '被拒的审核不得改状态').toBe(CLOSED);

    // closed → closed：重复关闭
    const closeAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${mainAdditionId}/close`
    );
    expectStateGateRejection(closeAgain, '已关闭加料单再关闭应被终态门拒绝');
    expect(failureCode(closeAgain)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const afterCloseAgain = await readAddition(page, mainAdditionId);
    expect(afterCloseAgain.status).toBe(CLOSED);
    expect(afterCloseAgain.approved_at, '两条非法流转都不得动审核时间（零漂移）').toBe(
      approvedAtAfterApprove
    );
    expect(afterCloseAgain.updated_at, '非法流转不得推进 updated_at（零漂移）').toBe(
      afterApproveAgain.updated_at
    );

    // approved → approved：主单重复审核（同一状态机族，facade:214 行 APPROVED 只容 closed）
    const recipeApproveAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${mainRecipeId}/approve`
    );
    expectStateGateRejection(recipeApproveAgain, '已审核主单再审核应被状态门拒绝');
    expect(failureCode(recipeApproveAgain)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const recipeAfter = await readRecipe(page, mainRecipeId);
    expect(recipeAfter.status, '主单非法审核不得改状态').toBe(APPROVED);

    // 主单 approved → closed 正向腿（关闭同样无审计列，缺陷一在主单侧同形）
    await apiCall(page, 'POST', `/production/production-recipes/${mainRecipeId}/close`);
    const recipeClosed = await readRecipe(page, mainRecipeId);
    expect(recipeClosed.status, '主单关闭副作用必须落进 closed').toBe(CLOSED);
    const closedRecipeAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${mainRecipeId}/approve`
    );
    expectStateGateRejection(closedRecipeAgain, '已关闭主单再审核应被终态门拒绝');
    const closedRecipeBack = await readRecipe(page, mainRecipeId);
    expect(closedRecipeBack.status, '拒绝后主单仍为终态').toBe(CLOSED);

    // 不存在主键：GET 详情 404（缺陷三，不是 200 空壳）
    const ghostGet = await fetchFailEnvelope(
      page,
      `/production/production-recipes/additions/${GHOST_ID}`
    );
    expect(ghostGet.status, '不存在主键应回 404，不得是 200 空壳').toBe(404);
    assertFailEnvelope(ghostGet.body, `GET 加料详情 ${GHOST_ID}`);
    expect(failureCode(ghostGet.body)).toBe(APP_ERROR_CODES.NOT_FOUND);
    expect(ghostGet.body.message, 'not_found 通道出参恒为脱敏常量，主键不外显（缺陷三）').toBe(
      MESSAGE_NOT_FOUND_MASKED
    );

    // 不存在主键：两条写腿在归属门之前先 404（handler 298、316 行先 get_by_id）
    const ghostApprove = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${GHOST_ID}/approve`
    );
    expect(ghostApprove.status, '不存在主键的审核腿应 404 而非状态门 400').toBe(404);
    expect(failureCode(ghostApprove)).toBe(APP_ERROR_CODES.NOT_FOUND);
    const ghostClose = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${GHOST_ID}/close`
    );
    expect(ghostClose.status, '不存在主键的关闭腿应 404').toBe(404);
    expect(failureCode(ghostClose)).toBe(APP_ERROR_CODES.NOT_FOUND);

    // 不存在主单：加料列表先校验主单存在（recipe_crud.rs:380 行透传 get_by_id）
    const ghostList = await fetchFailEnvelope(
      page,
      `/production/production-recipes/${GHOST_ID}/additions`
    );
    expect(ghostList.status, '不存在主单的加料列表应 404').toBe(404);
    assertFailEnvelope(ghostList.body, `GET 加料列表 ${GHOST_ID}`);
    expect(failureCode(ghostList.body)).toBe(APP_ERROR_CODES.NOT_FOUND);
  });

  test('配方计算：按服务端口径独立复算逐条比对，明细与合计无分差', async ({ page }) => {
    const ratio = 8;
    const fabricWeight = 100;
    const factor = 2;
    const inputs = [
      { material_code: 'E255C1', concentration: '1.5', amount: '0' },
      { material_code: 'E255C2', concentration: '0.25', amount: '0' },
      { material_code: 'E255C3', concentration: '0', amount: '999' },
      { material_code: 'E255C4', concentration: null, amount: '7.5' },
    ];
    const res = await apiCall<RecipeItemRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      calcRequest('1:8', inputs)
    );
    const rows = res.data;
    expect(Array.isArray(rows), '计算出参是明细数组本体，不是分页信封').toBe(true);
    expect(rows.length, '出参条数与入参逐条对应，不吞项').toBe(inputs.length);

    let sum = 0;
    rows.forEach((row, idx) => {
      const spec = inputs[idx];
      expect(
        Object.keys(row).slice().sort(),
        `${spec.material_code} 明细项键集与 RecipeMaterialItem 列一一对应`
      ).toEqual(['amount', 'category', 'concentration', 'material_code', 'material_name', 'unit']);
      expect(row.material_code).toBe(spec.material_code);
      const raw = expectDecimal(row.amount, `${spec.material_code} 用量`);
      const exp = expectedAmount(spec.concentration, fabricWeight, ratio, factor, spec.amount);
      expect(
        toNum(raw),
        `${spec.material_code} 用量必须等于独立复算值 ${spec.concentration ?? 'null'}×${fabricWeight}×${ratio}/100×${factor}，实得 ${raw}`
      ).toBe(exp);
      sum += exp;
      if (spec.concentration === null) {
        expect(raw, `无浓度助剂项不重算、原值透传（facade:190 行 if-let 分支），实得 ${raw}`).toBe(
          '7.5'
        );
      }
      expect(
        row.concentration === null ? null : String(row.concentration),
        `${spec.material_code} 浓度回读等于提交值`
      ).toBe(spec.concentration);
    });
    expect(sum, '四条明细用量合计与逐项复算无分差').toBe(28);

    // 浴比归一化：全角冒号与半角冒号必须逐字符同值（facade:152-155 行归一分支）
    const fullWidth = await apiCall<RecipeItemRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      calcRequest('1：8', inputs)
    );
    fullWidth.data.forEach((row, idx) => {
      expect(row.amount, `全角冒号浴比结果必须与半角逐字符相同，${inputs[idx].material_code}`).toBe(
        rows[idx].amount
      );
    });
    const slash = await apiCall<RecipeItemRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      calcRequest('1/8', inputs)
    );
    expect(
      slash.data.map(r => r.amount),
      '斜杠浴比同形归一'
    ).toEqual(rows.map(r => r.amount));

    // 入参门四条：全部走 AppError::business → 400 + BUSINESS_ERROR + 脱敏文案
    const gateCases: Array<{ label: string; body: Row }> = [
      {
        label: '浴比无冒号分隔（facade:158 行）',
        body: { ...calcRequest('1:8', inputs), liquor_ratio: '8' },
      },
      {
        label: '浴比分母为 0（facade:168 行）',
        body: { ...calcRequest('1:8', inputs), liquor_ratio: '1:0' },
      },
      {
        label: '加成系数为 0（facade:183 行）',
        body: { ...calcRequest('1:8', inputs), adjustment_factor: '0' },
      },
      {
        label: '浓度为负（facade:192 行）',
        body: calcRequest('1:8', [{ material_code: 'E255NEG', concentration: '-1', amount: '0' }]),
      },
    ];
    for (const gate of gateCases) {
      const rejected = await apiCallExpectFail(
        page,
        'POST',
        '/production/production-recipes/calculate',
        gate.body
      );
      expectStateGateRejection(rejected, `用量计算入参门：${gate.label}`);
      expect(failureCode(rejected), `${gate.label} 的机器码`).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
      expect(rejected.message, `${gate.label} 的文案通道（缺陷二）`).toBe(MESSAGE_BUSINESS_MASKED);
    }
    const zeroWeight = await apiCallExpectFail(
      page,
      'POST',
      '/production/production-recipes/calculate',
      { ...calcRequest('1:8', inputs), fabric_weight: '0' }
    );
    expectStateGateRejection(zeroWeight, '用量计算入参门：备布重量为 0（facade:178 行）');
    expect(failureCode(zeroWeight)).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  });

  test('权限档：匿名读回 401，只持 read 的角色写面回 403 且状态未变', async ({ page, browser }) => {
    expect(mainAdditionId, '依赖上一轮的加料单主键').toBeGreaterThan(0);

    // 匿名档：两条 GET 都是认证门 401 + UNAUTHORIZED 码，失败信封四键齐全
    const anon = await browser.newContext();
    const anonTargets = [
      `/production/production-recipes/additions/${mainAdditionId}`,
      `/production/production-recipes/${mainRecipeId}/additions`,
    ];
    for (const target of anonTargets) {
      const got = await anon.request.fetch(`${API_BASE}${API_PREFIX}${target}`);
      const body = (await got.json()) as FailEnvelope;
      expect(got.status(), `匿名 GET ${target} 应被认证门拒绝为 401`).toBe(401);
      assertFailEnvelope(body, `匿名 GET ${target}`);
      expect(failureCode(body), `匿名 GET ${target} 的机器码`).toBe(CODE_UNAUTHORIZED);
    }
    await anon.close();

    // 非授权角色档：dyeing_master 对 production-recipes 只有 read
    // （init_service_ops/permission.rs:977 行 ("production-recipes","read")，无 approve、无 create）
    const gateRecipe = await createRecipe(page, 'PERM');
    const gateRecipeId = Number(gateRecipe.id);
    deferCleanup(
      CLEANUP,
      'DELETE',
      `/production/production-recipes/${gateRecipeId}`,
      '[255] perm gate recipe'
    );
    await apiCall(page, 'POST', `/production/production-recipes/${gateRecipeId}/approve`);
    const gateAddition = await createAddition(page, gateRecipeId, 'PERM');
    const gateAdditionId = Number(gateAddition.id);
    const beforeDenied = await readAddition(page, gateAdditionId);
    expect(beforeDenied.status, '被拒前置态必须是 draft').toBe(DRAFT);

    await loginAsRole(page, 'dyeing_master');
    const deniedApprove = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${gateAdditionId}/approve`
    );
    expectDenied(
      deniedApprove,
      'dyeing_master 无 production-recipes:approve 键（键由 URL 段推导，permission.rs:259 行起）'
    );
    const deniedClose = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${gateAdditionId}/close`
    );
    expectDenied(deniedClose, 'dyeing_master 无 production-recipes:close 键');
    const deniedCalc = await apiCallExpectFail(
      page,
      'POST',
      '/production/production-recipes/calculate',
      calcRequest('1:8', [{ material_code: 'E255PERM', concentration: '1', amount: '0' }])
    );
    expectDenied(
      deniedCalc,
      'calculate 末段不在 PATH_ACTION_KEYWORDS（permission.rs:233-249 行），动作由方法派生，dyeing_master 无该键'
    );

    // 换回本 worker 账号回读：三条被拒写腿都没有落库
    await loginViaUI(page, testUsername(), testPassword(), true);
    const afterDenied = await readAddition(page, gateAdditionId);
    expect(
      afterDenied.status,
      '权限拒绝不得改状态（落库前被拒，handler:297-298 行门在 update 之前）'
    ).toBe(DRAFT);
    expect(afterDenied.approved_by, '权限拒绝不得写审核人').toBeNull();
    expect(afterDenied.approved_at, '权限拒绝不得写审核时间').toBeNull();
    expect(afterDenied.updated_at, '权限拒绝不得推进 updated_at').toBe(beforeDenied.updated_at);
  });
});
