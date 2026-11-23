// 4.37 允差配置链路：质量标准可按来源/方法配置色差、克重、门幅允差并三态更新；
// 物理指标检测按允差判定并留痕。
// 端点：POST /quality-standards、GET /quality-standards/{id}、PUT /quality-standards/{id}；
// POST /production/fabric-inspections、/{id}/start、POST /production/fabric-inspections/physical-tests。
// 契约来源：quality_standards 新五列可空；任一允差值必须同时带来源与 ISO/GB 方法号；
// 更新走三态：键缺席=保持原值、显式 null=清空、有值=覆盖；
// 物理检测带允差值时 pass=|实测-标准| ≤ 允差（低于标准但在允差内也算合格），
// 未带允差维持 实测≥标准 即合格；允差值/来源/方法三要素成组出现并逐字段落记录。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
} from './helpers';

interface QualityStandardRow {
  id?: number;
  standard_code?: string;
  tolerance_source?: string | null;
  detection_method?: string | null;
  delta_e_tolerance?: string | null;
  weight_tolerance?: string | null;
  width_tolerance?: string | null;
}

const basePayload = {
  standard_name: '',
  standard_type: 'product',
  content: '允差回归用例',
  tolerance_source: 'product_standard',
  detection_method: 'ISO 5084',
  delta_e_tolerance: 1.5,
  weight_tolerance: 10,
  width_tolerance: 1,
};

async function createStandard(
  page: Page,
  overrides: Record<string, unknown> = {}
): Promise<QualityStandardRow> {
  return await apiCallRaw<QualityStandardRow>(page, 'POST', '/quality-standards', {
    ...basePayload,
    standard_name: genCode('TOL'),
    ...overrides,
  });
}

async function readStandard(page: Page, id: number): Promise<QualityStandardRow> {
  return await apiCallRaw<QualityStandardRow>(page, 'GET', `/quality-standards/${id}`);
}

function requireId(row: QualityStandardRow, label: string): number {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`${label}：未取得有效 id，实际响应=${JSON.stringify(row).slice(0, 240)}`);
  }
  return id;
}

test.describe('557 质量标准允差配置', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('创建带完整允差配置的标准并按 id 回读', async ({ page }) => {
    const created = await createStandard(page);
    const id = requireId(created, '创建质量标准');

    const row = await readStandard(page, id);
    expect(String(row.tolerance_source), '允差来源应逐字符落库').toBe('product_standard');
    expect(String(row.detection_method), '检测方法应逐字符落库').toBe('ISO 5084');
    expect(Number(row.delta_e_tolerance), '色差允差').toBeCloseTo(1.5, 2);
    expect(Number(row.weight_tolerance), '克重允差').toBeCloseTo(10, 2);
    expect(Number(row.width_tolerance), '门幅允差').toBeCloseTo(1, 2);

    await apiCall(page, 'DELETE', `/quality-standards/${id}`);
  });

  test('更新可将全部允差字段显式清空', async ({ page }) => {
    const created = await createStandard(page);
    const id = requireId(created, '创建质量标准');

    await apiCall(page, 'PUT', `/quality-standards/${id}`, {
      tolerance_source: null,
      detection_method: null,
      delta_e_tolerance: null,
      weight_tolerance: null,
      width_tolerance: null,
    });

    const row = await readStandard(page, id);
    expect(row.tolerance_source, '允差来源应被显式清空').toBeNull();
    expect(row.detection_method, '检测方法应被显式清空').toBeNull();
    expect(row.delta_e_tolerance, '色差允差应被显式清空').toBeNull();
    expect(row.weight_tolerance, '克重允差应被显式清空').toBeNull();
    expect(row.width_tolerance, '门幅允差应被显式清空').toBeNull();

    await apiCall(page, 'DELETE', `/quality-standards/${id}`);
  });

  test('有允差值但缺来源或方法应被拒绝', async ({ page }) => {
    const failure = await apiCallExpectFail(page, 'POST', '/quality-standards', {
      ...basePayload,
      standard_name: genCode('TOL'),
      tolerance_source: undefined,
    });
    expect(failure.status, '缺允差来源必须返回业务错误').toBe(400);

    const failureWithoutMethod = await apiCallExpectFail(page, 'POST', '/quality-standards', {
      ...basePayload,
      standard_name: genCode('TOL'),
      detection_method: undefined,
    });
    expect(failureWithoutMethod.status, '缺检测方法必须返回业务错误').toBe(400);
  });

  test('有来源或方法但没有任何允差值应被拒绝', async ({ page }) => {
    const failure = await apiCallExpectFail(page, 'POST', '/quality-standards', {
      standard_name: genCode('TOL'),
      standard_type: 'product',
      tolerance_source: 'order_agreement',
      detection_method: 'GB/T 3813.1',
    });
    expect(failure.status, '只有来源与方法而无允差值必须返回业务错误').toBe(400);
  });

  test('非法允差来源应被拒绝', async ({ page }) => {
    const failure = await apiCallExpectFail(page, 'POST', '/quality-standards', {
      ...basePayload,
      standard_name: genCode('TOL'),
      tolerance_source: 'customer_preference',
    });
    expect(failure.status, '词表外允差来源必须返回业务错误').toBe(400);
  });
});

interface PhysicalTestRow {
  id?: number;
  inspection_id?: number;
  test_item?: string;
  test_value?: string;
  standard_value?: string | null;
  test_result?: string;
  tolerance_source?: string | null;
  detection_method?: string | null;
  tolerance_value?: string | null;
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

async function startInspection(page: Page, tag: string): Promise<number> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const productId = Number(ctx.productIds[0]);
  expect(productId, '前置：允差判定用例需真实产品').toBeGreaterThan(0);

  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/fabric-inspections',
    {
      product_id: productId,
      product_name: `E2E-557-${tag}`,
      dye_lot_no: genCode('DYE'),
      color_no: genCode('CLR'),
      inspection_date: new Date().toISOString().slice(0, 10),
      scoring_system: 'ten_point',
      remarks: genCode(`557${tag}`),
    }
  );
  const id = Number(created.id);
  expect(id, '验布单应取得有效 id').toBeGreaterThan(0);
  expect(String(created.inspection_no), '验布单号应由后端取号').toMatch(/^FIR-/);
  expect(String(created.status), '验布单初始状态').toBe('pending');
  await apiCall(page, 'POST', `/production/fabric-inspections/${id}/start`);
  return id;
}

async function addTolerancedTest(
  page: Page,
  inspectionId: number,
  body: Record<string, unknown>
): Promise<PhysicalTestRow> {
  return unwrapPhysicalTest(
    await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/fabric-inspections/physical-tests',
      {
        inspection_id: inspectionId,
        test_item: 'weight_gsm',
        test_value: '200',
        standard_value: '200',
        tolerance_source: 'order_agreement',
        detection_method: 'ISO 3801',
        tolerance_value: '5',
        remarks: genCode('557TOL'),
        ...body,
      }
    ),
    '允差物理检测'
  );
}

test.describe('557 物理检测允差判定', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('带允差录入按偏差判定并逐字段留痕', async ({ page }) => {
    const inspectionId = await startInspection(page, 'TOL');

    const inTolerance = await addTolerancedTest(page, inspectionId, {
      test_value: '204',
    });
    expect(inTolerance.test_result, '偏差 4 ≤ 允差 5 应判合格').toBe('pass');

    const overTolerance = await addTolerancedTest(page, inspectionId, {
      test_value: '206',
    });
    expect(overTolerance.test_result, '偏差 6 > 允差 5 应判不合格').toBe('fail');

    for (const row of [inTolerance, overTolerance]) {
      expect(String(row.tolerance_source), '允差来源应逐字符落记录').toBe('order_agreement');
      expect(String(row.detection_method), '检测方法应逐字符落记录').toBe('ISO 3801');
      expect(Number(row.tolerance_value), '允差值应落记录').toBeCloseTo(5, 2);
      expect(String(row.test_result), '判定结果只允许 pass/fail').toMatch(/^(pass|fail)$/);
    }
  });

  test('低于标准但在允差内应判合格（区别于实测≥标准的原规则）', async ({ page }) => {
    const inspectionId = await startInspection(page, 'BELOW');

    const row = await addTolerancedTest(page, inspectionId, {
      test_value: '180',
      standard_value: '200',
      tolerance_value: '25',
    });
    expect(row.test_result, '实测 180 低于标准 200 但偏差 20 ≤ 允差 25 应判合格').toBe('pass');
    expect(String(row.tolerance_source), '允差来源应逐字符落记录').toBe('order_agreement');
  });

  test('允差录入口径违例应被拒绝', async ({ page }) => {
    const inspectionId = await startInspection(page, 'REJECT');

    const cases: Array<[string, Record<string, unknown>]> = [
      ['负允差', { test_value: '200', tolerance_value: '-5' }],
      ['允差值缺标准值', { test_value: '200', standard_value: undefined, tolerance_value: '5' }],
      [
        '允差值缺来源',
        {
          test_value: '200',
          tolerance_value: '5',
          tolerance_source: undefined,
        },
      ],
      [
        '允差值缺方法',
        {
          test_value: '200',
          tolerance_value: '5',
          detection_method: undefined,
        },
      ],
      [
        '词表外允差来源',
        {
          test_value: '200',
          tolerance_value: '5',
          tolerance_source: 'customer_preference',
        },
      ],
    ];
    for (const [label, overrides] of cases) {
      const failure = await apiCallExpectFail(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: inspectionId,
          test_item: 'weight_gsm',
          standard_value: '200',
          tolerance_source: 'order_agreement',
          detection_method: 'ISO 3801',
          ...overrides,
        }
      );
      expect(failure.status, `${label} 必须返回业务错误`).toBe(400);
    }
  });

  test('未带允差维持实测≥标准的原规则', async ({ page }) => {
    const inspectionId = await startInspection(page, 'PLAIN');

    const passRow = await unwrapPhysicalTest(
      await apiCallRaw<Record<string, unknown>>(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: inspectionId,
          test_item: 'weight_gsm',
          test_value: '210',
          standard_value: '200',
          remarks: genCode('557PLAIN'),
        }
      ),
      '无允差物理检测'
    );
    expect(passRow.test_result, '实测 210 ≥ 标准 200 应判合格').toBe('pass');
    expect(passRow.tolerance_source, '未带允差时来源应留空').toBeNull();
    expect(passRow.detection_method, '未带允差时方法应留空').toBeNull();
    expect(passRow.tolerance_value, '未带允差时允差值应留空').toBeNull();

    const failRow = await unwrapPhysicalTest(
      await apiCallRaw<Record<string, unknown>>(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: inspectionId,
          test_item: 'weight_gsm',
          test_value: '180',
          standard_value: '200',
          remarks: genCode('557PLAIN2'),
        }
      ),
      '无允差物理检测'
    );
    expect(failRow.test_result, '实测 180 < 标准 200 应判不合格').toBe('fail');
    expect(failRow.tolerance_value, '未带允差时允差值应留空').toBeNull();
  });
});
