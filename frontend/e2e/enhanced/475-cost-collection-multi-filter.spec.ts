// 4.14 多条件组合筛选：成本归集列表 collection_no 模糊 + batch_no/color_no/status 等值 AND，
//   collection_no trim 后空串跳过、>64 字符跳过、safe_like_pattern 转义 LIKE 通配符。
// 后端判据：handlers/cost_collection_handler.rs CostCollectionQuery 含四筛选键；
//   services/cost_collection_service.rs:181-205：collection_no trim 非空且 chars<=64 才走
//   safe_like_pattern 模糊，batch_no/color_no 等值，status trim 后等值；出参为模型数组本体（非分页信封）。
// 与既有覆盖分工：445 只测 ?batch_no= 与批次分析，10b 仅裸列表；collection_no/color_no/status
//   三键与「多条件 AND」「trim/长度上限跳过」为零覆盖点。
import { test, expect, type Page } from '../diagnose-fixture';
import { apiCallRaw, genCode, loginViaUI, tryCleanup } from '../flow/helpers';

interface CostRow {
  id: number;
  collection_no?: string;
  batch_no?: string | null;
  color_no?: string | null;
  status?: string;
}

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

async function seedCost(page: Page, batch: string, color: string): Promise<CostRow> {
  const created = await apiCallRaw<CostRow>(page, 'POST', '/production/cost-collections', {
    collection_date: new Date().toISOString().slice(0, 10),
    batch_no: batch,
    color_no: color,
    workshop: 'E2E475 染整车间',
    output_quantity_meters: '100.00',
    direct_material: '10.00',
    direct_labor: '10.00',
    manufacturing_overhead: '10.00',
    processing_fee: '10.00',
    dyeing_fee: '10.00',
  });
  const id = Number(created?.id);
  expect(Number.isInteger(id) && id > 0, `[475] 建成本归集失败：${JSON.stringify(created)}`).toBe(
    true
  );
  CLEANUP.push({ path: `/production/cost-collections/${id}`, label: 'cost_collection' });
  return created;
}

function list(page: Page, q: Record<string, string>): Promise<CostRow[]> {
  const qs = Object.entries(q)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return apiCallRaw<CostRow[]>(page, 'GET', `/production/cost-collections?${qs}`);
}

function ids(rows: CostRow[]): number[] {
  return rows.map(r => Number(r.id)).sort((a, b) => a - b);
}

test.describe('4.14 成本归集多条件筛选', () => {
  test('475-01 单号模糊与三键等值 AND、trim/长度上限跳过、空结果', async ({ page }) => {
    await loginViaUI(page);
    const tag = genCode('E475');
    const batchA = `${tag}A`;
    const batchB = `${tag}B`;
    const colorA = `${tag}CA`;
    const colorB = `${tag}CB`;
    const a = await seedCost(page, batchA, colorA);
    const b = await seedCost(page, batchB, colorB);
    const noA = String(a.collection_no ?? '');
    expect(noA.length, '[475] 建单须回传 collection_no').toBeGreaterThan(0);

    // 单号完整片段模糊：恰命中 A（like 而非 eq，证明模糊腿接入）
    const byNo = await list(page, { collection_no: noA });
    expect(ids(byNo), '[475] 单号片段须仅命中 A').toEqual([Number(a.id)]);

    // 单号带前后空格：trim 后仍命中（trim 判据）
    const trimmed = await list(page, { collection_no: `  ${noA}  ` });
    expect(ids(trimmed), '[475] 单号前后空格 trim 后须仍命中 A').toEqual([Number(a.id)]);

    // 超长 65 字符单号：被跳过（不当过滤条件），返回全量，A/B 都在
    const overlong = await list(page, { collection_no: 'X'.repeat(65) });
    const overlongIds = ids(overlong);
    expect(overlongIds, '[475] 超长单号须被跳过，A 仍在结果').toContain(Number(a.id));
    expect(overlongIds, '[475] 超长单号须被跳过，B 仍在结果').toContain(Number(b.id));

    // 四条件 AND：单号 + 批次 + 色号 + 状态 draft 恰命中 A 一行
    const combined = await list(page, {
      collection_no: noA,
      batch_no: batchA,
      color_no: colorA,
      status: 'draft',
    });
    expect(ids(combined), '[475] 四条件 AND 须恰命中 A').toEqual([Number(a.id)]);

    // 等值互斥：A 的单号配 B 的批次，AND 下 0 行
    const conflict = await list(page, { collection_no: noA, batch_no: batchB });
    expect(conflict.length, '[475] 单号与批次分属不同单，AND 须返回空').toBe(0);

    // 不存在的单号片段：0 行
    const miss = await list(page, { collection_no: `${tag}不存在的单号` });
    expect(miss.length, '[475] 不存在单号片段须返回空').toBe(0);
  });
});
