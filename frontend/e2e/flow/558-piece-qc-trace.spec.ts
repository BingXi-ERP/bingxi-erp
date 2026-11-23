// 4.41 联动专项：质检与验布的匹级追溯读出口。
// 端点：POST /production/fabric-inspections、/{id}/start、POST physical-tests、/{id}/grade、
// /{id}/roll；GET /production/fabric-inspections/{inspection_id}/physical-tests；
// GET /inventory/pieces、GET /inventory/pieces/{id}/trace。
// 契约来源：物理测试此前只有 POST 无 GET；匹级聚合追溯返回
// { piece, inspection|null, physical_tests, defects, quality_records }，各集合直接
// 序列化实体 Model（出参键 = 实体列名 snake_case）；匹无验布来源时 inspection 为 null
// 且三个集合为空（真实语义非缺键兜底），inspection_id 有值但验布单查不到 fail-fast 404。
// 打卷必填 warehouse_id/roll_length/roll_weight/roll_width/roll_gram_weight，缺值 400 点名。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  seedDyedPieceChain,
} from './helpers';

interface InspectionRow {
  id?: number;
  inspection_no?: string;
  status?: string;
}

interface PhysicalTestRow {
  id?: number;
  inspection_id?: number;
  test_item?: string;
  test_value?: string;
  standard_value?: string | null;
  test_result?: string;
}

interface PieceRow {
  id?: number;
  piece_no?: string;
  inspection_id?: number | null;
  quality_status?: string;
}

interface PieceTrace {
  piece?: PieceRow;
  inspection?: InspectionRow | null;
  physical_tests?: PhysicalTestRow[];
  defects?: unknown[];
  quality_records?: unknown[];
}

function requireId(row: Record<string, unknown>, label: string): number {
  const id = Number(row.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(`${label}：未取得有效 id，实际响应=${JSON.stringify(row).slice(0, 240)}`);
  }
  return id;
}

async function startInspection(page: Page, tag: string): Promise<number> {
  await ensureTestEntities(page);
  const ctx = getCtx();
  const productId = Number(ctx.productIds[0]);
  expect(productId, '前置：追溯用例需真实产品').toBeGreaterThan(0);

  // 打卷入库要求缸号在 batch_dye_lot 表中真实在册；该档案的产生链路是染色委外回仓
  // （委外单→发料→回仓→确认，find_or_create 建缸号档案），dye-batches 列表读的是
  // dye_batch 表、与打卷门不同源。先走完整染色链种子（拿到回仓建档的缸号）再建验布单。
  const dyedWh = ctx.warehouseIds.find((wid: number) => wid) ?? ctx.warehouseIds[0];
  const dyed = await seedDyedPieceChain(page, {
    productId,
    warehouseId: dyedWh,
    colorNo: genCode('CLR'),
    dyeLotNo: genCode('DL'),
    pieceCount: 1,
    context: `558-${tag}`,
  });
  const realDyeLotNo = dyed[0]?.dye_lot_no;
  expect(realDyeLotNo, '前置：染色链种子须回读在册缸号').toBeTruthy();

  const created = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/fabric-inspections',
    {
      product_id: productId,
      product_name: `E2E-558-${tag}`,
      dye_lot_no: realDyeLotNo,
      color_no: genCode('CLR'),
      inspection_date: new Date().toISOString().slice(0, 10),
      scoring_system: 'ten_point',
      remarks: genCode(`558${tag}`),
    }
  );
  const id = requireId(created, `验布单 ${tag}`);
  expect(String(created.inspection_no), '验布单号应由后端取号而非请求体手填').toMatch(/^FIR-/);
  expect(String(created.status), '验布单初始状态').toBe('pending');
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
    remarks: genCode('558GSM'),
  };
  if (testResult !== undefined) body.test_result = testResult;
  const wrapped = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    '/production/fabric-inspections/physical-tests',
    body
  );
  const inner = wrapped.data;
  if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
    throw new Error(
      `物理测试出参应在标准信封内再包一层 {code,message,data}，实际=${JSON.stringify(wrapped).slice(0, 240)}`
    );
  }
  return inner as PhysicalTestRow;
}

async function gradeInspection(page: Page, inspectionId: number): Promise<void> {
  await apiCall(page, 'POST', `/production/fabric-inspections/${inspectionId}/grade`, {
    inspected_yards: '100',
    qualification_rate: '100',
  });
}

async function rollInspection(page: Page, inspectionId: number): Promise<void> {
  const ctx = getCtx();
  const warehouseId = Number(ctx.warehouseIds[0]);
  expect(warehouseId, '前置：追溯用例需真实仓库').toBeGreaterThan(0);
  const rolled = await apiCallRaw<Record<string, unknown>>(
    page,
    'POST',
    `/production/fabric-inspections/${inspectionId}/roll`,
    {
      warehouse_id: warehouseId,
      roll_length: '100',
      roll_weight: '50',
      roll_width: '150',
      roll_gram_weight: '200',
    }
  );
  expect(String(rolled.status), '打卷后验布单状态').toBe('graded');
}

async function findPieceByInspection(page: Page, inspectionId: number): Promise<PieceRow> {
  const listed = await apiCallRaw<{ items?: PieceRow[] }>(
    page,
    'GET',
    '/inventory/pieces?page=1&page_size=100'
  );
  const items = Array.isArray(listed.items) ? listed.items : [];
  const piece = items.find(item => Number(item.inspection_id) === inspectionId);
  if (!piece) {
    throw new Error(
      `打卷后未在匹列表前 100 行找到回指验布单 ${inspectionId} 的匹，实际条数=${items.length}`
    );
  }
  return piece;
}

test.describe('558 质检与验布匹级追溯读出口', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('按验布单读物理测试明细：字段逐值对平且只含本单记录', async ({ page }) => {
    const inspectionId = await startInspection(page, 'GET');
    const inStandard = await addWeightTest(page, inspectionId, '204', '200');
    const belowStandard = await addWeightTest(page, inspectionId, '180', '200');
    expect(Number(inStandard.id), '合格记录 id').toBeGreaterThan(0);
    expect(Number(belowStandard.id), '不合格记录 id').toBeGreaterThan(0);

    const rows = await apiCallRaw<PhysicalTestRow[]>(
      page,
      'GET',
      `/production/fabric-inspections/${inspectionId}/physical-tests`
    );
    expect(Array.isArray(rows), '物理测试明细应为数组').toBe(true);
    expect(rows.length, '本验布单应有两条物理测试').toBe(2);
    for (const row of rows) {
      expect(Number(row.inspection_id), '明细必须回指本验布单').toBe(inspectionId);
      expect(String(row.test_item), '检测项目词表').toBe('weight_gsm');
    }
    const passRow = rows.find(row => Number(row.id) === Number(inStandard.id));
    const failRow = rows.find(row => Number(row.id) === Number(belowStandard.id));
    expect(passRow, '合格记录应出现在明细中').toBeTruthy();
    expect(failRow, '不合格记录应出现在明细中').toBeTruthy();
    expect(Number(passRow?.test_value), '实测值逐值对平').toBeCloseTo(204, 2);
    expect(String(passRow?.test_result), '实测 204 ≥ 标准 200 应派生合格').toBe('pass');
    expect(Number(failRow?.test_value), '实测值逐值对平').toBeCloseTo(180, 2);
    expect(String(failRow?.test_result), '实测 180 < 标准 200 应派生不合格').toBe('fail');
  });

  test('按不存在的验布单读物理测试明细应 404', async ({ page }) => {
    const failure = await apiCallExpectFail(
      page,
      'GET',
      '/production/fabric-inspections/99999999/physical-tests'
    );
    expect(failure.status, '不存在的验布单必须 404').toBe(404);
  });

  test('打卷后的匹可经聚合追溯回指验布单与物理测试', async ({ page }) => {
    const inspectionId = await startInspection(page, 'TRACE');
    const testRow = await addWeightTest(page, inspectionId, '204', '200');
    await gradeInspection(page, inspectionId);
    await rollInspection(page, inspectionId);

    const piece = await findPieceByInspection(page, inspectionId);
    const pieceId = requireId(piece as unknown as Record<string, unknown>, '打卷匹');
    expect(Number(piece.inspection_id), '匹应回指本验布单').toBe(inspectionId);

    const trace = await apiCallRaw<PieceTrace>(page, 'GET', `/inventory/pieces/${pieceId}/trace`);
    expect(trace.piece, '追溯应含匹详情').toBeTruthy();
    expect(String(trace.piece?.piece_no), '匹号应与列表一致').toBe(String(piece.piece_no));
    expect(trace.inspection, '有来源匹的 inspection 不得为 null').toBeTruthy();
    expect(String(trace.inspection?.inspection_no), '追溯应回指本验布单号').toMatch(/^FIR-/);
    expect(Number(trace.inspection?.id), '追溯验布单 id').toBe(inspectionId);

    const tests = Array.isArray(trace.physical_tests) ? trace.physical_tests : [];
    expect(tests.length, '追溯应带出物理测试明细').toBeGreaterThanOrEqual(1);
    expect(
      tests.some(row => Number(row.id) === Number(testRow.id)),
      '本例录入的物理测试应在追溯明细中'
    ).toBe(true);
    expect(Array.isArray(trace.defects), '疵点集合应为数组（本例未录疵点应为空）').toBe(true);
    expect(trace.defects?.length, '未录疵点应为空集合').toBe(0);
    expect(Array.isArray(trace.quality_records), '质检判定集合应为数组').toBe(true);
    expect(trace.quality_records?.length, '未建质检单应为空集合').toBe(0);
  });

  test('质检单绑匹后追溯带出质检判定并按等级联动匹质检状态', async ({ page }) => {
    const inspectionId = await startInspection(page, 'BIND');
    await gradeInspection(page, inspectionId);
    await rollInspection(page, inspectionId);

    const piece = await findPieceByInspection(page, inspectionId);
    const pieceId = requireId(piece as unknown as Record<string, unknown>, '打卷匹');

    await apiCall(page, 'POST', '/production/quality-inspection/records', {
      inspection_no: genCode('E2E558'),
      inspection_type: 'finished',
      product_id: Number(getCtx().productIds[0]),
      inspection_date: new Date().toISOString().slice(0, 10),
      total_qty: '100',
      inspected_qty: '100',
      qualified_qty: '100',
      unqualified_qty: '0',
      qualification_rate: '100',
      inspection_result: '合格',
      grade: 'A',
      piece_id: pieceId,
      remark: genCode('558BIND'),
    });

    const trace = await apiCallRaw<PieceTrace>(page, 'GET', `/inventory/pieces/${pieceId}/trace`);
    const qualityRecords = Array.isArray(trace.quality_records) ? trace.quality_records : [];
    expect(qualityRecords.length, '追溯应带出绑匹的质检判定').toBe(1);
    expect(String(trace.piece?.quality_status), 'A 级判定应把匹质检状态联动为合格').toBe('合格');
  });

  test('按不存在的匹读聚合追溯应 404', async ({ page }) => {
    const failure = await apiCallExpectFail(page, 'GET', '/inventory/pieces/99999999/trace');
    expect(failure.status, '不存在的匹必须 404').toBe(404);
  });
});
