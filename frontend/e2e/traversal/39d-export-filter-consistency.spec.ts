import { test, expect } from '../diagnose-fixture';
import JSZip from 'jszip';
import { apiCall, apiCallRaw, loginViaUI, seedColorCardArchive } from '../flow/helpers';

/**
 * 39d 导出内容与筛选一致（目标 4.19：按当前筛选条件导出，而非全量导出）
 *
 * 后端事实（逐字段读源码）：
 * - GET /color-cards/issues/export 的 Query 与列表同为 ListIssuesQuery，
 *   build_issue_conditions 真实应用 customer_id/status/from_date/to_date/sales_order_id 六项，
 *   导出取数 list_issue_records_for_export 经 build_scoped_issue_find 复用全套条件。
 * - 水印文案「色卡发放记录导出（共 {n} 条）」的 n = 筛选后服务端总数 total（issue.rs:507/553）。
 * - 导出表含「客户ID」列（issue.rs:596），但客户ID为数字，可能与发放人ID/色卡ID等字段数字子串
 *   偶然相同，故不用文本包含断言，改用水印条数+列表total双路真值对账，避免假阳性。
 *
 * 断言口径：专属客户各自发放一条，按 customer_id 精确筛选导出；
 * 单客户水印条数 = 该客户筛选列表 total = 1，且严格小于全量水印条数（证明筛选真的收窄，
 * 不是把全量原样导出）；两客户各自为 1 证明筛选不串号。
 */

const API_BASE = process.env.API_BASE || 'http://localhost:8082';
const API_PREFIX = '/api/v1/erp';

/** 解包 xlsx 取 sharedStrings + 全部 worksheet 文本，用于读取水印条数 */
async function extractExportText(body: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(body);
  let text = '';
  const shared = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (shared) text += shared;
  const sheetFiles = Object.keys(zip.files).filter(
    f => f.startsWith('xl/worksheets/') && f.endsWith('.xml')
  );
  for (const f of sheetFiles) {
    text += await zip.file(f)!.async('string');
  }
  return text;
}

/** 水印取数：文案与 color_card issue handler 的 WatermarkConfig 逐字同源 */
function watermarkTotal(text: string): number {
  const m = text.match(/色卡发放记录导出（共 (\d+) 条）/);
  if (!m) {
    throw new Error(`导出文件水印缺少色卡发放记录导出的共条数形态：${text.slice(0, 400)}`);
  }
  return Number(m[1]);
}

/** 造一个过发放闸门的专属客户（credit_limit 正值 + active，无超期记录） */
async function createIssuableCustomer(page: import('@playwright/test').Page, tag: string) {
  const resp = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: `E2E 筛选导出专属客户 ${tag} ${Date.now()}`,
    customer_type: 'wholesale',
    status: 'active',
    credit_limit: '1000',
  });
  expect(
    resp.data?.id,
    `造数失败：专属客户 ${tag} 创建未返回 id：${JSON.stringify(resp)}`
  ).toBeTruthy();
  return resp.data!.id!;
}

/** 给指定客户发放一条色卡（自建色卡 + 登记库存，过库存闸门） */
async function issueOne(page: import('@playwright/test').Page, customerId: number, tag: string) {
  const seed = await seedColorCardArchive(page, { context: `39d-${tag}` });
  await apiCall(page, 'PUT', `/color-cards/${seed.cardId}`, { stock_quantity: 10 });
  const issued = await apiCall<{ id?: number }>(page, 'POST', '/color-cards/issues', {
    color_card_id: seed.cardId,
    customer_id: customerId,
    issue_qty: 1,
  });
  expect(
    issued.data?.id,
    `造数失败：客户 ${tag} 发放色卡未返回 id：${JSON.stringify(issued)}`
  ).toBeTruthy();
}

test.describe('39d 导出内容与筛选一致', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('色卡发放导出按客户筛选只出该客户行，非全量（4.19）', async ({ page }) => {
    test.setTimeout(420_000);

    const custA = await createIssuableCustomer(page, 'A');
    const custB = await createIssuableCustomer(page, 'B');
    await issueOne(page, custA, 'A');
    await issueOne(page, custB, 'B');
    console.log(`[39d] 专属客户 A=${custA} B=${custB}，各发放一条`);

    // 列表筛选独立读回：各客户筛选 total 应为 1（专属客户仅我造的这一条）
    const listA = await apiCallRaw<{ items: unknown[]; total: number }>(
      page,
      'GET',
      `/color-cards/issues?customer_id=${custA}&page=1&page_size=100`
    );
    const listB = await apiCallRaw<{ items: unknown[]; total: number }>(
      page,
      'GET',
      `/color-cards/issues?customer_id=${custB}&page=1&page_size=100`
    );
    expect(
      Array.isArray(listA.items),
      `客户A筛选列表缺 items：${JSON.stringify(listA).slice(0, 200)}`
    ).toBe(true);
    expect(listA.total, `专属客户A(${custA})筛选列表 total 应为 1`).toBe(1);
    expect(listB.total, `专属客户B(${custB})筛选列表 total 应为 1`).toBe(1);

    // 按客户A筛选导出：水印条数应等于筛选列表 total
    const respA = await page.request.get(
      `${API_BASE}${API_PREFIX}/color-cards/issues/export?customer_id=${custA}`
    );
    expect(respA.status(), `筛选客户A导出应 200，实际 ${respA.status()}`).toBe(200);
    const countA = watermarkTotal(await extractExportText(await respA.body()));
    console.log(`[39d] 筛选A导出水印条数=${countA}，列表total=${listA.total}`);
    expect(countA, '筛选客户A导出水印条数应等于该客户筛选列表 total').toBe(listA.total);
    expect(countA, '专属客户A筛选导出应恰好一条（多出即筛选未生效或串号）').toBe(1);

    // 按客户B筛选导出：同样恰好一条，且与A互不串号
    const respB = await page.request.get(
      `${API_BASE}${API_PREFIX}/color-cards/issues/export?customer_id=${custB}`
    );
    expect(respB.status(), `筛选客户B导出应 200，实际 ${respB.status()}`).toBe(200);
    const countB = watermarkTotal(await extractExportText(await respB.body()));
    expect(countB, '筛选客户B导出水印条数应等于该客户筛选列表 total').toBe(listB.total);
    expect(countB, '专属客户B筛选导出应恰好一条（多出即串到客户A的行）').toBe(1);

    // 全量导出水印应严格大于任一单客户筛选条数——证明导出真的按筛选收窄，
    // 而不是无视筛选条件把全量原样导出（4.19 的核心判据）
    const respAll = await page.request.get(`${API_BASE}${API_PREFIX}/color-cards/issues/export`);
    expect(respAll.status(), `全量导出应 200，实际 ${respAll.status()}`).toBe(200);
    const countAll = watermarkTotal(await extractExportText(await respAll.body()));
    console.log(`[39d] 全量导出水印条数=${countAll}，筛选A=${countA}，筛选B=${countB}`);
    expect(
      countAll,
      `全量导出条数(${countAll})应严格大于单客户筛选条数(${countA})，否则筛选旁路未生效`
    ).toBeGreaterThan(countA);
  });
});
