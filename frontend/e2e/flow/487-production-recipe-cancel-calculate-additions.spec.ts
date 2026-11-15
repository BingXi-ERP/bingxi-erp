import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectBusinessRejection,
  failureCode,
  genCode,
  loginViaUI,
  testStorageStatePath,
  tryCleanup,
  APP_ERROR_CODES,
} from './helpers';

/**
 * 487 大货处方五腿断言集：取消、用量计算、加料建单、加料审核、加料关闭。
 *
 * 调用面（backend/src/routes/production.rs 注册，挂载前缀 /api/v1/erp/production）：
 * POST /production-recipes/calculate、POST /production-recipes/{id}/cancel、
 * POST /production-recipes/{id}/additions、POST /production-recipes/additions/{id}/approve、
 * POST /production-recipes/additions/{id}/close；读回用 GET /production-recipes/{id}、
 * GET /production-recipes/{id}/additions、GET /production-recipes/additions/{id}。
 *
 * 入参与出参键名来源：backend/src/services/production_recipe_service.rs 的
 * CreateProductionRecipeRequest / CalculateAmountsRequest /
 * CreateProductionRecipeAdditionRequest，以及 backend/src/models/production_recipe.rs 与
 * backend/src/models/production_recipe_addition.rs 的 Model 序列化键（snake_case）。
 *
 * 状态词表唯一事实来源：backend/src/models/status/quality_dyeing.rs 的
 * production_recipe（draft / approved / closed / cancelled，均小写）与
 * production_recipe_addition（draft / approved / closed，均小写）。
 *
 * 用量计算是纯函数（ProductionRecipeService::calculate_amounts，不访问数据库）：
 * 用量 = 浓度% × 备布重量 × 浴比 N ÷ 100 × 加成系数，浴比取 "1:N" 的 N，加成系数缺省 1，
 * 浓度为空的物料行不改写其用量；非法前置（备布重量不大于 0、浴比非 1:N 或 N 不大于 0、
 * 加成系数不大于 0、浓度为负）一律拒绝。
 *
 * 拒因断言只钉 HTTP 400 与字符串机器码 BUSINESS_ERROR：这些分支走脱敏构造器
 * （AppError::business），出参 message 不含服务层真实文案，断文案会把源码推向可外显改造，
 * 属改判责而非补测。
 */

interface RecipeMaterialRow {
  material_code?: string;
  material_name?: string;
  concentration?: string | number | null;
  unit?: string;
  amount?: string | number;
  category?: string;
}

interface RecipeRow {
  id?: number;
  recipe_no?: string;
  status?: string;
  fabric_weight?: string | number;
  liquor_ratio?: string;
  adjustment_factor?: string | number | null;
  recipe_detail?: RecipeMaterialRow[] | null;
}

interface AdditionRow {
  id?: number;
  addition_no?: string;
  status?: string;
  production_recipe_id?: number;
  addition_reason?: string | null;
  addition_detail?: RecipeMaterialRow[] | null;
  total_cost?: string | number | null;
  issued_by?: number | null;
  created_by?: number | null;
}

/** 本文件创建的大货处方主键，供 afterAll 按真实可达的删除通道清理 */
const createdRecipeIds: number[] = [];

/** 大货处方建档请求：备布重量 200kg、浴比 1:8、加成系数 1，明细一染料一助剂 */
async function createDraftRecipe(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<RecipeRow> {
  const body: Record<string, unknown> = {
    color_no: genCode('CN487'),
    fabric_name: '487 断言用坯布',
    fabric_spec: '40S*40S 133*72',
    fabric_weight: '200.00',
    liquor_ratio: '1:8',
    adjustment_factor: '1.0000',
    recipe_detail: [
      {
        material_code: genCode('DYE'),
        material_name: '活性染料',
        concentration: '2.5000',
        unit: 'kg',
        amount: '0.0000',
        category: 'dye',
      },
      {
        material_code: genCode('AUX'),
        material_name: '匀染剂',
        concentration: null,
        unit: 'kg',
        amount: '7.5000',
        category: 'auxiliary',
      },
    ],
    remarks: genCode('RP487'),
    ...overrides,
  };
  const created = await apiCall<RecipeRow>(page, 'POST', '/production/production-recipes', body);
  const row = created.data;
  const id = row?.id;
  expect(typeof id, `大货处方建档应返回数字主键 id，实际响应=${JSON.stringify(row)}`).toBe(
    'number'
  );
  createdRecipeIds.push(id as number);
  expect(row?.status, `新建大货处方初始状态应为词表 draft，实际=${row?.status}`).toBe('draft');
  expect(
    row?.recipe_no,
    `新建大货处方单号应由服务端生成且带 RP 前缀，实际=${row?.recipe_no}`
  ).toMatch(/^RP\d{8}\d{3}$/);
  return row as RecipeRow;
}

/** 审核腿：仅 draft 可审核，且服务层要求处方明细非空 */
async function approveRecipe(page: Page, id: number): Promise<RecipeRow> {
  const approved = await apiCallRaw<RecipeRow>(
    page,
    'POST',
    `/production/production-recipes/${id}/approve`
  );
  expect(
    approved?.status,
    `大货处方审核后腿内返回状态应为词表 approved，实际=${approved?.status}`
  ).toBe('approved');
  return approved as RecipeRow;
}

/** 建单并审核，返回已生效的大货处方（加料三腿的合法前置） */
async function createApprovedRecipe(page: Page): Promise<RecipeRow> {
  const draft = await createDraftRecipe(page);
  const id = draft.id as number;
  await approveRecipe(page, id);
  return await apiCallRaw<RecipeRow>(page, 'GET', `/production/production-recipes/${id}`);
}

/** 加料建单请求：明细一项，关联父单 id 由调用方决定（可为诱饵值） */
async function createAddition(
  page: Page,
  parentPathId: number,
  bodyRecipeId: number
): Promise<AdditionRow> {
  const created = await apiCall<AdditionRow>(
    page,
    'POST',
    `/production/production-recipes/${parentPathId}/additions`,
    {
      production_recipe_id: bodyRecipeId,
      addition_reason: '色差修正',
      addition_detail: [
        {
          material_code: genCode('ADD'),
          material_name: '保险粉',
          amount: '1.2000',
          unit: 'kg',
          category: 'auxiliary',
        },
      ],
      total_cost: '36.00',
      remarks: genCode('PA487'),
    }
  );
  return created.data as AdditionRow;
}

test.describe('487 大货处方取消与用量计算与加料流转', () => {
  test('487-01 用量计算按公式重算染料行并保持助剂行原用量', async ({ page }) => {
    const items: RecipeMaterialRow[] = [
      {
        material_code: genCode('DYE'),
        material_name: '活性染料',
        concentration: '2.5000',
        unit: 'kg',
        amount: '0.0000',
        category: 'dye',
      },
      {
        material_code: genCode('AUX'),
        material_name: '匀染剂',
        concentration: null,
        unit: 'kg',
        amount: '7.5000',
        category: 'auxiliary',
      },
    ];
    const rows = await apiCallRaw<RecipeMaterialRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      { fabric_weight: '200.00', liquor_ratio: '1:8', items }
    );
    expect(Array.isArray(rows), `用量计算应返回物料数组，实际=${JSON.stringify(rows)}`).toBe(true);
    expect(rows, `用量计算应返回两行物料，实际行数=${rows?.length}`).toHaveLength(2);

    const dye = rows?.find(r => r.category === 'dye');
    const aux = rows?.find(r => r.category === 'auxiliary');
    expect(dye, '出参应含 category=dye 的染料行').toBeTruthy();
    expect(aux, '出参应含 category=auxiliary 的助剂行').toBeTruthy();

    expect(
      typeof dye?.amount,
      `DECIMAL 出参应为序列化字符串（线格式口径），实际类型=${typeof dye?.amount}`
    ).toBe('string');
    expect(
      Number(dye?.amount),
      `染料行用量应等于 2.5% × 200kg × 8 ÷ 100 = 40，实际=${dye?.amount}`
    ).toBe(40);
    expect(
      Number(aux?.amount),
      `助剂行浓度为空不应重算，用量应原样保留 7.5，实际=${aux?.amount}`
    ).toBe(7.5);
  });

  test('487-02 浴比半角冒号全角冒号与斜杠三种写法算得同一用量', async ({ page }) => {
    const item = {
      material_code: genCode('DYE'),
      material_name: '活性染料',
      concentration: '2.5000',
      unit: 'kg',
      amount: '0.0000',
      category: 'dye',
    };
    const amounts: string[] = [];
    for (const ratio of ['1:8', '1：8', '1/8']) {
      const rows = await apiCallRaw<RecipeMaterialRow[]>(
        page,
        'POST',
        '/production/production-recipes/calculate',
        { fabric_weight: '200.00', liquor_ratio: ratio, items: [item] }
      );
      const amount = rows?.[0]?.amount;
      expect(
        typeof amount,
        `浴比 ${ratio} 的用量出参应为序列化字符串，实际=${JSON.stringify(rows)}`
      ).toBe('string');
      amounts.push(amount as string);
    }
    expect(Number(amounts[0]), `半角冒号写法应算得 40，实际=${amounts[0]}`).toBe(40);
    expect(amounts[1], `全角冒号写法应与半角同值，实际=${amounts[1]}`).toBe(amounts[0]);
    expect(amounts[2], `斜杠写法应与半角同值，实际=${amounts[2]}`).toBe(amounts[0]);
  });

  test('487-03 加成系数放大用量且缺省系数不放大', async ({ page }) => {
    const item = {
      material_code: genCode('DYE'),
      material_name: '活性染料',
      concentration: '2.5000',
      unit: 'kg',
      amount: '0.0000',
      category: 'dye',
    };
    const withFactor = await apiCallRaw<RecipeMaterialRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      { fabric_weight: '200.00', liquor_ratio: '1:8', adjustment_factor: '1.5000', items: [item] }
    );
    const withoutFactor = await apiCallRaw<RecipeMaterialRow[]>(
      page,
      'POST',
      '/production/production-recipes/calculate',
      { fabric_weight: '200.00', liquor_ratio: '1:8', items: [item] }
    );
    expect(
      Number(withFactor?.[0]?.amount),
      `加成系数 1.5 时用量应为 40 × 1.5 = 60，实际=${withFactor?.[0]?.amount}`
    ).toBe(60);
    expect(
      Number(withoutFactor?.[0]?.amount),
      `缺省加成系数应按 1 计，用量应为 40，实际=${withoutFactor?.[0]?.amount}`
    ).toBe(40);
  });

  test('487-04 用量计算四类非法前置一律判 400 业务码', async ({ page }) => {
    const okItem = {
      material_code: genCode('DYE'),
      material_name: '活性染料',
      concentration: '2.5000',
      unit: 'kg',
      amount: '0.0000',
      category: 'dye',
    };
    const negativeItem = { ...okItem, concentration: '-1.0000' };
    const cases: { label: string; body: Record<string, unknown> }[] = [
      {
        label: '备布重量为 0',
        body: { fabric_weight: '0.00', liquor_ratio: '1:8', items: [okItem] },
      },
      {
        label: '浴比分母为 0',
        body: { fabric_weight: '200.00', liquor_ratio: '1:0', items: [okItem] },
      },
      {
        label: '加成系数为 0',
        body: {
          fabric_weight: '200.00',
          liquor_ratio: '1:8',
          adjustment_factor: '0.0000',
          items: [okItem],
        },
      },
      {
        label: '浓度为负',
        body: { fabric_weight: '200.00', liquor_ratio: '1:8', items: [negativeItem] },
      },
    ];
    for (const c of cases) {
      const fail = await apiCallExpectFail(
        page,
        'POST',
        '/production/production-recipes/calculate',
        c.body
      );
      expectBusinessRejection(fail, `用量计算非法前置（${c.label}）应被业务拒绝`);
      expect(
        failureCode(fail),
        `用量计算非法前置（${c.label}）机器码应为 BUSINESS_ERROR，实际=${failureCode(fail)}`
      ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    }
  });

  test('487-05 取消腿落库为 cancelled 且终态拒再取消与再审核', async ({ page }) => {
    const draft = await createDraftRecipe(page);
    const id = draft.id as number;

    const cancelled = await apiCallRaw<RecipeRow>(
      page,
      'POST',
      `/production/production-recipes/${id}/cancel`
    );
    expect(cancelled?.status, `取消腿返回状态应为词表 cancelled，实际=${cancelled?.status}`).toBe(
      'cancelled'
    );

    const readback = await apiCallRaw<RecipeRow>(
      page,
      'GET',
      `/production/production-recipes/${id}`
    );
    expect(readback?.status, `取消后读回状态必须落库为 cancelled，实际=${readback?.status}`).toBe(
      'cancelled'
    );

    const cancelAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${id}/cancel`
    );
    expectBusinessRejection(cancelAgain, '已取消处方再取消应被状态机拒绝');
    expect(
      failureCode(cancelAgain),
      `已取消处方再取消机器码应为 BUSINESS_ERROR，实际=${failureCode(cancelAgain)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const approveAfterCancel = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${id}/approve`
    );
    expectBusinessRejection(approveAfterCancel, '已取消处方再审核应被状态机拒绝');

    const readbackAfterIllegal = await apiCallRaw<RecipeRow>(
      page,
      'GET',
      `/production/production-recipes/${id}`
    );
    expect(
      readbackAfterIllegal?.status,
      `非法跃迁不得改库，读回应仍为 cancelled，实际=${readbackAfterIllegal?.status}`
    ).toBe('cancelled');
  });

  test('487-06 草稿父单不允许挂加料单（父单必须已审核）', async ({ page }) => {
    const draft = await createDraftRecipe(page);
    const id = draft.id as number;

    const fail = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/${id}/additions`,
      {
        production_recipe_id: id,
        addition_reason: '助剂不足',
      }
    );
    expectBusinessRejection(fail, '草稿大货处方挂加料单应被前置门拒绝');
    expect(
      failureCode(fail),
      `草稿父单挂加料单机器码应为 BUSINESS_ERROR，实际=${failureCode(fail)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const listAfterReject = await apiCallRaw<AdditionRow[]>(
      page,
      'GET',
      `/production/production-recipes/${id}/additions`
    );
    expect(
      Array.isArray(listAfterReject) && listAfterReject.length === 0,
      `被拒的加料建单不得落库，实际子资源数=${JSON.stringify(listAfterReject)?.length}`
    ).toBe(true);
  });

  test('487-07 加料单关联取路径父单而非请求体 id 并读回子资源列表', async ({ page }) => {
    const parent = await createApprovedRecipe(page);
    const parentId = parent.id as number;
    const decoy = await createDraftRecipe(page);
    const decoyId = decoy.id as number;
    expect(decoyId !== parentId, `诱饵父单 id 必须与真实父单不同，实际两 id 均为 ${decoyId}`).toBe(
      true
    );

    const created = await createAddition(page, parentId, decoyId);
    const additionId = created?.id;
    expect(
      typeof additionId,
      `加料建单应返回数字主键 id，实际响应=${JSON.stringify(created)}`
    ).toBe('number');
    expect(
      created?.production_recipe_id,
      `服务端应以路径 id 覆盖请求体关联，加料单父单应为 ${parentId}，实际=${created?.production_recipe_id}`
    ).toBe(parentId);
    expect(
      created?.addition_no,
      `加料单号应由服务端生成且带 PA 前缀，实际=${created?.addition_no}`
    ).toMatch(/^PA\d{8}\d{3}$/);
    expect(created?.status, `新建加料单初始状态应为词表 draft，实际=${created?.status}`).toBe(
      'draft'
    );

    const readback = await apiCallRaw<AdditionRow>(
      page,
      'GET',
      `/production/production-recipes/additions/${additionId}`
    );
    expect(readback?.id, `加料单读回主键应为 ${additionId}，实际=${readback?.id}`).toBe(
      additionId as number
    );
    expect(
      readback?.production_recipe_id,
      `加料单读回父单应为 ${parentId}（诱饵 id ${decoyId} 不得生效），实际=${readback?.production_recipe_id}`
    ).toBe(parentId);
    expect(readback?.status, `加料单读回状态应为 draft，实际=${readback?.status}`).toBe('draft');

    const parentList = await apiCallRaw<AdditionRow[]>(
      page,
      'GET',
      `/production/production-recipes/${parentId}/additions`
    );
    expect(
      Array.isArray(parentList),
      `父单子资源列表应返回数组，实际=${JSON.stringify(parentList)}`
    ).toBe(true);
    expect(
      parentList?.some(r => r.id === additionId),
      `新建加料单 ${additionId} 应出现在父单 ${parentId} 的子资源列表中`
    ).toBe(true);

    const decoyList = await apiCallRaw<AdditionRow[]>(
      page,
      'GET',
      `/production/production-recipes/${decoyId}/additions`
    );
    expect(
      Array.isArray(decoyList) && decoyList.length === 0,
      `诱饵草稿父单 ${decoyId} 不应挂到任何加料单，实际=${JSON.stringify(decoyList)}`
    ).toBe(true);
  });

  test('487-08 加料单审核与关闭两段跃迁各读回且重复审批与终态再关闭均拒', async ({ page }) => {
    const parent = await createApprovedRecipe(page);
    const parentId = parent.id as number;
    const created = await createAddition(page, parentId, parentId);
    const additionId = created?.id;
    expect(
      typeof additionId,
      `加料建单应返回数字主键 id，实际响应=${JSON.stringify(created)}`
    ).toBe('number');

    const approved = await apiCallRaw<AdditionRow>(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/approve`
    );
    expect(
      approved?.status,
      `加料单审核后腿内返回状态应为词表 approved，实际=${approved?.status}`
    ).toBe('approved');
    const approvedReadback = await apiCallRaw<AdditionRow>(
      page,
      'GET',
      `/production/production-recipes/additions/${additionId}`
    );
    expect(
      approvedReadback?.status,
      `加料单审核后读回落库状态应为 approved，实际=${approvedReadback?.status}`
    ).toBe('approved');

    const approveAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/approve`
    );
    expectBusinessRejection(approveAgain, '已审核加料单重复审批应被状态机拒绝');

    const closed = await apiCallRaw<AdditionRow>(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/close`
    );
    expect(closed?.status, `加料单关闭后腿内返回状态应为 closed，实际=${closed?.status}`).toBe(
      'closed'
    );
    const closedReadback = await apiCallRaw<AdditionRow>(
      page,
      'GET',
      `/production/production-recipes/additions/${additionId}`
    );
    expect(
      closedReadback?.status,
      `加料单关闭后读回落库状态应为 closed，实际=${closedReadback?.status}`
    ).toBe('closed');

    const closeAgain = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/close`
    );
    expectBusinessRejection(closeAgain, '已关闭加料单再关闭应被状态机拒绝');
    const approveAfterClose = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/approve`
    );
    expectBusinessRejection(approveAfterClose, '已关闭加料单再审核应被状态机拒绝');
  });

  test('487-09 加料单草稿直接关闭被拒（跳步拦截）', async ({ page }) => {
    const parent = await createApprovedRecipe(page);
    const parentId = parent.id as number;
    const created = await createAddition(page, parentId, parentId);
    const additionId = created?.id;
    expect(
      typeof additionId,
      `加料建单应返回数字主键 id，实际响应=${JSON.stringify(created)}`
    ).toBe('number');

    const fail = await apiCallExpectFail(
      page,
      'POST',
      `/production/production-recipes/additions/${additionId}/close`
    );
    expectBusinessRejection(fail, '草稿加料单跳过审核直接关闭应被状态机拒绝');
    expect(failureCode(fail), `跳步关闭机器码应为 BUSINESS_ERROR，实际=${failureCode(fail)}`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );

    const readback = await apiCallRaw<AdditionRow>(
      page,
      'GET',
      `/production/production-recipes/additions/${additionId}`
    );
    expect(readback?.status, `跳步被拒不进状态机，读回应仍为 draft，实际=${readback?.status}`).toBe(
      'draft'
    );
  });

  test.afterAll(async ({ browser }) => {
    // 回收走 worker 会话态新建的上下文：大货处方只有草稿态可硬删，已审核、已取消、已关闭的
    // 处方与全部加料单在路由面上没有删除端点（在册 DELETE 仅 /production-recipes/*，加料单
    // 只挂 GET 与两条状态跃迁），不可达残留由 remarks 的 RP487 前缀标记，不伪造清理 URL。
    const ctx = await browser.newContext({ storageState: testStorageStatePath() });
    const page = await ctx.newPage();
    try {
      await loginViaUI(page);
      for (const id of createdRecipeIds) {
        await tryCleanup(page, 'DELETE', `/production/production-recipes/${id}`, `recipe#${id}`);
      }
    } finally {
      await ctx.close();
    }
  });
});
