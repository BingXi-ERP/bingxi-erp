// 4.37 质检分级联动 + 4.41 上下游联动：物理指标 fail 把外观合格 A 级降为 B 级。
// 后端判据：services/quality_inspection_service.rs:39-71 合格率 >=95 判 A；
//   services/fabric_inspection_service.rs:552-565 初始 A 级时再查物理指标，非全 pass 即降 B；
//   :1104-1113 未给 test_result 时按 test_value >= standard_value 派生 pass/fail；
//   :1159-1168 有指标但任一非 pass 则 all_tests_passed=false。
// 与既有覆盖分工：flow/96 与 flow/211 只测无物理指标保 A，flow/441 的评级先于补录物理指标且只断 A/B/C 词表，
//   全 e2e 无“先录 fail 指标后评级”的降级断言；本例用唯一 genCode 隔离。
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI } from '../flow/helpers';

interface Inspection {
  id: number;
  status: string;
  grade: string | null;
  total_defect_points: number;
  qualification_rate?: string | number | null;
  abc_grade: string | null;
}

interface PhysicalTestRecord {
  test_item?: unknown;
  test_result?: unknown;
}

interface PhysicalTestEnvelope {
  code?: unknown;
  message?: unknown;
  data?: PhysicalTestRecord;
}

function unwrapPhysicalTest(wrapped: PhysicalTestEnvelope): PhysicalTestRecord {
  const inner = wrapped.data;
  expect(
    inner !== null && typeof inner === 'object' && !Array.isArray(inner),
    `[493] 物理测试端点须在标准信封内再包 {code,message,data}，实际 ${JSON.stringify(wrapped)}`
  ).toBe(true);
  return inner as PhysicalTestRecord;
}

async function createAndStart(page: import('@playwright/test').Page, tag: string) {
  const created = await apiCallRaw<Inspection>(page, 'POST', '/production/fabric-inspections', {
    inspection_date: new Date().toISOString().slice(0, 10),
    scoring_system: 'four_point',
    fabric_width_inches: '60.00',
    product_name: `E2E降级${tag}`,
    remarks: tag,
  });
  expect(
    Number.isInteger(created.id) && created.id > 0,
    `[493] 验布单须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);

  const started = await apiCallRaw<Inspection>(
    page,
    'POST',
    `/production/fabric-inspections/${created.id}/start`
  );
  expect(String(started.status), '[493] 开始验布后须 inspecting').toBe('inspecting');
  return created.id;
}

test.describe('4.37 物理指标对质检等级的降级门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('493-01 合格率95且克重指标派生fail，评级时A级降为B级', async ({ page }) => {
    const tag = genCode('E2E-PG-FAIL');
    const inspectionId = await createAndStart(page, tag);

    const physical = unwrapPhysicalTest(
      await apiCallRaw<PhysicalTestEnvelope>(
        page,
        'POST',
        '/production/fabric-inspections/physical-tests',
        {
          inspection_id: inspectionId,
          test_item: 'weight_gsm',
          test_value: '100.00',
          standard_value: '200.00',
          remarks: `${tag}-FAIL`,
        }
      )
    );
    expect(String(physical.test_item), '[493] 检测项目须逐字符回读').toBe('weight_gsm');
    expect(
      String(physical.test_result),
      `[493] 实测100低于标准200须派生 fail，实际 ${String(physical.test_result)}`
    ).toBe('fail');

    const graded = await apiCallRaw<Inspection>(
      page,
      'POST',
      `/production/fabric-inspections/${inspectionId}/grade`,
      { inspected_yards: '50.00', qualification_rate: '95.00' }
    );
    expect(
      graded.abc_grade,
      `[493] 合格率95本应A，物理fail须降B，实际 ${String(graded.abc_grade)}`
    ).toBe('B');
    expect(graded.grade, '[493] 外观评级不受物理指标门影响，须为 first').toBe('first');
    expect(graded.total_defect_points, '[493] 无登记疵点总扣分须 0').toBe(0);
    expect(String(graded.status), '[493] 评级后须 graded').toBe('graded');

    const readback = await apiCallRaw<Inspection>(
      page,
      'GET',
      `/production/fabric-inspections/${inspectionId}`
    );
    expect(readback.abc_grade, '[493] B 级必须落库').toBe('B');
    expect(readback.grade, '[493] 外观首级必须落库').toBe('first');
    expect(Number(readback.qualification_rate), '[493] 合格率必须按数值回读 95').toBe(95);
    expect(String(readback.status), '[493] graded 状态必须落库').toBe('graded');
  });
});
