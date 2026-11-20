// 4.37 面料计量与评级 + 4.3 状态机：十分制验布的同码不封顶与总扣分等值边界。
// 后端判据：services/fabric_inspection_service.rs:109-146 经向 8 寸=5 分、不足 1 寸=1 分；
//   :514-522 十分制总扣分线性合计（四分制才按同码封顶）；
//   :174-181 total_points < inspected_yards.to_i32() 才 first，等值落 second；
//   :541-544 十分制 points_per_100_sq_yards 恒 None；:552-565 无物理指标时 A 级保持。
// 与既有覆盖分工：quality/03 只测 four_point，flow/211 仅注释提及 ten_point；
//   全 e2e 无十分制扣分、等值边界与幅宽缺席断言，本例专补零覆盖判据。
import { expect, test } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI } from '../flow/helpers';

interface Inspection {
  id: number;
  scoring_system: string;
  status: string;
  fabric_width_inches: string | number | null;
  inspected_yards?: string | number;
  total_defect_points: number;
  grade: string | null;
  points_per_100_sq_yards: string | number | null;
  abc_grade: string | null;
}

interface Defect {
  id: number;
  points: number;
}

async function createTenPointInspection(page: import('@playwright/test').Page, tag: string) {
  const created = await apiCallRaw<Inspection>(page, 'POST', '/production/fabric-inspections', {
    inspection_date: new Date().toISOString().slice(0, 10),
    scoring_system: 'ten_point',
    product_name: `E2E十分制${tag}`,
    remarks: tag,
  });
  expect(
    Number.isInteger(created.id) && created.id > 0,
    `[492] 十分制验布单须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  expect(String(created.scoring_system), '[492] 建单制式须逐字符回读').toBe('ten_point');
  expect(created.fabric_width_inches, '[492] 未传幅宽不得兜底默认值').toBeNull();
  expect(String(created.status), '[492] 建单初态须 pending').toBe('pending');

  const started = await apiCallRaw<Inspection>(
    page,
    'POST',
    `/production/fabric-inspections/${created.id}/start`
  );
  expect(String(started.status), '[492] 开始验布后须 inspecting').toBe('inspecting');
  return created.id;
}

test.describe('4.37 十分制验布评级边界', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('492-01 两条同码八寸疵点线性合计10分，受检10码等值落次级且不依赖幅宽', async ({ page }) => {
    const tag = genCode('E2E-TP-A');
    const inspectionId = await createTenPointInspection(page, tag);

    for (const defectType of ['broken_end', 'streak']) {
      const defect = await apiCallRaw<Defect>(page, 'POST', '/production/fabric-defects', {
        inspection_id: inspectionId,
        defect_type: defectType,
        position_yards: '0',
        defect_length_inches: '8.00',
        direction: 'warp',
        is_hole: false,
        is_continuous: false,
        is_half_width: false,
      });
      expect(defect.points, `[492] ${defectType} 经向 8 寸须 5 分，实际 ${defect.points}`).toBe(5);
    }

    const graded = await apiCallRaw<Inspection>(
      page,
      'POST',
      `/production/fabric-inspections/${inspectionId}/grade`,
      { inspected_yards: '10.00', qualification_rate: '100' }
    );
    expect(graded.total_defect_points, '[492] 十分制同码须线性合计 10 分').toBe(10);
    expect(graded.grade, '[492] 总扣分 10 等于受检码数 10 须落 second').toBe('second');
    expect(graded.points_per_100_sq_yards, '[492] 十分制不得计算每百平方码分数').toBeNull();
    expect(graded.abc_grade, '[492] 无物理指标时合格率 100 须保持 A 级').toBe('A');
    expect(String(graded.status), '[492] 评级后须 graded').toBe('graded');

    const readback = await apiCallRaw<Inspection>(
      page,
      'GET',
      `/production/fabric-inspections/${inspectionId}`
    );
    expect(readback.total_defect_points, '[492] 总扣分必须落库').toBe(10);
    expect(readback.grade, '[492] 次级必须落库').toBe('second');
    expect(readback.points_per_100_sq_yards, '[492] 空每百平方码分数必须落库').toBeNull();
    expect(readback.abc_grade, '[492] A 级必须落库').toBe('A');
    expect(String(readback.status), '[492] graded 状态必须落库').toBe('graded');
  });

  test('492-02 单条不足一寸疵点扣1分，受检10码严格小于落首级', async ({ page }) => {
    const tag = genCode('E2E-TP-B');
    const inspectionId = await createTenPointInspection(page, tag);

    const defect = await apiCallRaw<Defect>(page, 'POST', '/production/fabric-defects', {
      inspection_id: inspectionId,
      defect_type: 'streak',
      position_yards: '0',
      defect_length_inches: '0.50',
      direction: 'warp',
      is_hole: false,
      is_continuous: false,
      is_half_width: false,
    });
    expect(defect.points, `[492] 不足一寸须 1 分，实际 ${defect.points}`).toBe(1);

    const graded = await apiCallRaw<Inspection>(
      page,
      'POST',
      `/production/fabric-inspections/${inspectionId}/grade`,
      { inspected_yards: '10.00', qualification_rate: '100' }
    );
    expect(graded.total_defect_points, '[492] 单条疵点总扣分须 1').toBe(1);
    expect(graded.grade, '[492] 总扣分 1 小于受检码数 10 须落 first').toBe('first');
    expect(graded.points_per_100_sq_yards, '[492] 十分制不得计算每百平方码分数').toBeNull();
    expect(graded.abc_grade, '[492] 无物理指标时合格率 100 须保持 A 级').toBe('A');
    expect(String(graded.status), '[492] 评级后须 graded').toBe('graded');

    const readback = await apiCallRaw<Inspection>(
      page,
      'GET',
      `/production/fabric-inspections/${inspectionId}`
    );
    expect(readback.total_defect_points, '[492] 总扣分必须落库').toBe(1);
    expect(readback.grade, '[492] 首级必须落库').toBe('first');
    expect(readback.points_per_100_sq_yards, '[492] 空每百平方码分数必须落库').toBeNull();
    expect(readback.abc_grade, '[492] A 级必须落库').toBe('A');
    expect(String(readback.status), '[492] graded 状态必须落库').toBe('graded');
  });
});
