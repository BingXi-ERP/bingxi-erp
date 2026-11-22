// 4.37 计量深度专项：实测克重偏差触发验布 A/B 定级门。
// 端点：POST /production/fabric-inspections、POST /{id}/start、
// POST /production/fabric-inspections/physical-tests、POST /{id}/grade、GET /{id}。
// 契约来源：physical_test_item::WEIGHT_GSM=weight_gsm，physical_test_result 小写 pass/fail；
// 未传 test_result 时写入方按 test_value >= standard_value 派生 pass/fail；
// determine_quality_grade 在 qualification_rate >= 95 时外观判 A，但验布评级再检查
// 全部物理指标，任一 fail 即把 A 降为 B。物理测试端点在标准 ApiResponse 内再包一层
// {code,message,data}，真值在内层 data。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  loginViaUI,
} from './helpers';

interface InspectionRow {
  id?: number;
  inspection_no?: string;
  product_id?: number | null;
  status?: string;
  scoring_system?: string;
  qualification_rate?: string | null;
  abc_grade?: string | null;
  grade?: string | null;
}

interface PhysicalTestRow {
  id?: number;
  inspection_id?: number;
  test_item?: string;
  test_value?: string;
  standard_value?: string | null;
  test_result?: string;
}

function requireId(row: Record<string, unknown>, label: string): number {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`${label}：未取得有效 id，实际响应=${JSON.stringify(row).slice(0, 240)}`);
  }
  return id;
}

function unwrapPhysicalTest(wrapped: Record<string, unknown>, label: string): PhysicalTestRow {
  const inner = wrapped.data;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new Error(
      `${label}：物理测试出参应在标准信封内再包一层 {code,message,data}，实际=${JSON.stringify(
        wrapped
      ).slice(0, 240)}`
    );
  }
  return inner as PhysicalTestRow;
}

function expectDecimal(value: unknown, literal: string, label: string): void {
  const text = String(value);
  expect(text, `${label}应为 DECIMAL 线格式字符串，实际=${text}`).toMatch(/^\d+(?:\.\d{1,2})?$/);
  expect(Number(text), `${label}应逐值对平`).toBeCloseTo(Number(literal), 2);
}

async function startInspection(page: Page, tag: string): Promise<number> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const productId = Number(ctx.productIds[0]);
  expect(productId, '前置：验布单需真实产品').toBeGreaterThan(0);

  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/fabric-inspections',
    {
      product_id: productId,
      product_name: `E2E-542-${tag}`,
      dye_lot_no: genCode('DYE'),
      color_no: genCode('CLR'),
      inspection_date: new Date().toISOString().slice(0, 10),
      scoring_system: 'ten_point',
      remarks: genCode(`542${tag}`),
    }
  );
  const id = requireId(created, `验布单 ${tag}`);
  expect(String(created.inspection_no), '验布单号应由后端取号而非请求体手填').toMatch(/^FIR-/);
  expect(String(created.status), '验布单初始状态').toBe('pending');
  expect(Number(created.product_id), '验布单应绑定本例真实产品').toBe(productId);
  await apiCall(page, 'POST', `/production/fabric-inspections/${id}/start`);
  return id;
}

async function addWeightTest(
  page: Page,
  inspectionId: number,
  testValue: string,
  standardValue: string,
  testResult?: string
): Promise<PhysicalTestRow> {
  const body: Record<string, unknown> = {
    inspection_id: inspectionId,
    test_item: 'weight_gsm',
    test_value: testValue,
    standard_value: standardValue,
    remarks: genCode('542GSM'),
  };
  if (testResult !== undefined) body.test_result = testResult;
  const row = unwrapPhysicalTest(
    await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      body
    ),
    `验布单 ${inspectionId} 克重检测`
  );
  expect(String(row.test_item), '检测项目应逐字符落库').toBe('weight_gsm');
  expect(Number(row.inspection_id), '检测行应锚定本例验布单').toBe(inspectionId);
  expectDecimal(row.test_value, testValue, '实测克重');
  expectDecimal(row.standard_value, standardValue, '标称克重');
  return row;
}

async function gradeAndReadBack(page: Page, inspectionId: number): Promise<InspectionRow> {
  await apiCall(page, 'POST', `/production/fabric-inspections/${inspectionId}/grade`, {
    inspected_yards: '100',
    qualification_rate: '100',
  });
  return await apiCallRaw<InspectionRow>(
    page,
    'GET',
    `/production/fabric-inspections/${inspectionId}`
  );
}

test.describe('542 实测克重偏差与验布 A/B 定级门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('实测克重低于标称：克重项 fail，外观全合格仍由 A 降为 B', async ({ page }) => {
    const inspectionId = await startInspection(page, 'LOW');
    const testRow = await addWeightTest(page, inspectionId, '180', '200');
    expect(String(testRow.test_result), '实测低于标称应由后端派生 fail').toBe('fail');

    const graded = await gradeAndReadBack(page, inspectionId);
    expect(Number(graded.id), '定级详情应命中本例验布单').toBe(inspectionId);
    expect(String(graded.status), '评级后状态').toBe('graded');
    expectDecimal(graded.qualification_rate, '100', '外观合格率');
    expect(String(graded.grade), '十分制外观等级词表').toBe('first');
    expect(String(graded.abc_grade), '外观合格率 A 但克重 fail 必须降为 B').toBe('B');
  });

  test('实测克重达到标称：克重项 pass，外观 A 保持为 A', async ({ page }) => {
    const inspectionId = await startInspection(page, 'PASS');
    const testRow = await addWeightTest(page, inspectionId, '210', '200');
    expect(String(testRow.test_result), '实测达到标称应由后端派生 pass').toBe('pass');

    const graded = await gradeAndReadBack(page, inspectionId);
    expect(String(graded.status), '评级后状态').toBe('graded');
    expectDecimal(graded.qualification_rate, '100', '外观合格率');
    expect(String(graded.grade), '十分制外观等级词表').toBe('first');
    expect(String(graded.abc_grade), '全部物理项 pass 时外观 A 不应降级').toBe('A');
  });

  test('越界 test_result 被拒，且不得因误落 fail 把外观 A 降级', async ({ page }) => {
    const inspectionId = await startInspection(page, 'BADRESULT');
    const bad = await apiCallExpectFail(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      {
        inspection_id: inspectionId,
        test_item: 'weight_gsm',
        test_value: '210',
        standard_value: '200',
        test_result: 'PASS',
      }
    );
    expect(bad.status, '越界检测结果必须 400').toBe(400);
    expect(failureCode(bad), '越界检测结果机器码').toBe(APP_ERROR_CODES.BUSINESS_ERROR);

    const graded = await gradeAndReadBack(page, inspectionId);
    expect(String(graded.status), '被拒后验布单仍可正常评级').toBe('graded');
    expect(String(graded.abc_grade), '被拒的物理测试不得落行并拖低定级').toBe('A');
  });
});
