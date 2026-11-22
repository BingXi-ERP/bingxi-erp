// 4.37 允差配置链路：质量标准可按来源/方法配置色差、克重、门幅允差并三态更新。
// 端点：POST /quality-standards、GET /quality-standards/{id}、PUT /quality-standards/{id}。
// 契约来源：quality_standards 新五列可空；任一允差值必须同时带来源与 ISO/GB 方法号；
// 更新走三态：键缺席=保持原值、显式 null=清空、有值=覆盖。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCall, apiCallExpectFail, apiCallRaw, genCode, loginViaUI } from './helpers';

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
