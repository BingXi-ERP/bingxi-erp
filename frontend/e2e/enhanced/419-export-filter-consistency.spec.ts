/**
 * 4.19 导出内容与筛选一致：色卡发放导出按 customer_id 筛选时只交付筛选结果，而非全量。
 *
 * 调用面：GET /api/v1/erp/color-cards/issues/export?customer_id={id}
 * 后端 handlers/color_card/issue.rs:491 export_issue_records 收 Query(ListIssuesQuery)，
 * 经 services/color_card_issue_service.rs:661 build_issue_conditions 把 customer_id 落到
 * color_card_issue::Column::CustomerId.eq，再交 list_issue_records_for_export 取数；
 * 水印文案「色卡发放记录导出（共 {n} 条）」的 n 取实际交付行数 row_count（issue.rs:527,556）。
 * 判据：自建两个唯一客户 A/B 各发一条 → 按 A 筛选的列表 total 恰为 1 → 按 A 导出的水印条数
 * 与工作表数据行数都等于该 total，且严格小于无筛选全量导出的条数。若导出腿漏传 query、
 * 回退到全量，则筛选导出的条数会等于全量值，收窄断言即红，真抓"导出忽略筛选"缺陷。
 * 前置：客户 credit_limit 正值、色卡登记库存（发放闸门），照抄 39c-export-content 官方范式。
 * 水印文案与行数结构与 39c 同一 xlsx 管线，不另立口径。
 */
import { test, expect, type Page } from '../diagnose-fixture';
import JSZip from 'jszip';
import { apiCall, apiCallRaw, genCode, loginViaUI, seedColorCardArchive } from '../flow/helpers';

const API_BASE = process.env.API_BASE || 'http://localhost:8082';
const API_PREFIX = '/api/v1/erp';
const EXPORT_LABEL = '色卡发放记录导出';

/** 解包导出 xlsx，返回拼接文本与全部 worksheet 的数据行数 */
async function extractXlsx(body: Buffer): Promise<{ text: string; sheetRows: number }> {
  const zip = await JSZip.loadAsync(body);
  let text = '';
  const shared = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (shared) text += shared;
  const sheets = Object.keys(zip.files).filter(
    f => f.startsWith('xl/worksheets/') && f.endsWith('.xml')
  );
  let sheetRows = 0;
  for (const f of sheets) {
    const xml = await zip.file(f)!.async('string');
    text += xml;
    sheetRows += (xml.match(/<row[ >]/g) ?? []).length;
  }
  return { text, sheetRows };
}

/** 水印行「色卡发放记录导出（共 N 条）」取交付条数，取不到即抛错判红 */
function watermarkTotal(text: string): number {
  const m = text.match(new RegExp(`${EXPORT_LABEL}（共 (\\d+) 条）`));
  if (!m) {
    throw new Error(`导出水印缺少 ${EXPORT_LABEL} 共条数形态：${text.slice(0, 400)}`);
  }
  return Number(m[1]);
}

interface IssueRow {
  id: number;
  customer_id: number;
}

/** 自建专属客户 + 色卡 + 库存 + 发放各一条，返回客户与发放记录主键 */
async function createIssue(
  page: Page,
  tag: string
): Promise<{ customerId: number; issueId: number }> {
  const customer = await apiCall<{ id?: number }>(page, 'POST', '/crm/customers', {
    customer_name: `E2E 导出筛选 ${tag} ${genCode('C')}`,
    customer_type: 'wholesale',
    status: 'active',
    credit_limit: '1000',
  });
  const customerId = customer.data?.id;
  expect(
    customerId,
    `${tag} 专属客户创建失败（发放闸门要求 credit_limit 正值）：${JSON.stringify(customer)}`
  ).toBeTruthy();

  const seed = await seedColorCardArchive(page, { context: `419-${tag}` });
  await apiCall(page, 'PUT', `/color-cards/${seed.cardId}`, { stock_quantity: 10 });
  const issued = await apiCall<{ id?: number }>(page, 'POST', '/color-cards/issues', {
    color_card_id: seed.cardId,
    customer_id: customerId,
    issue_qty: 1,
  });
  expect(issued.data?.id, `${tag} 专属发放失败：${JSON.stringify(issued)}`).toBeTruthy();

  return { customerId: customerId!, issueId: issued.data!.id! };
}

test.describe('4.19 导出内容与筛选一致', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('4.19-01 色卡发放导出按 customer_id 筛选只交付筛选结果', async ({ page }) => {
    // 与 39c 导出腿同基线：色卡发放需 UI 建前置实体，420s 为仓库单测统一超时。
    test.setTimeout(420_000);
    const a = await createIssue(page, 'A');
    const b = await createIssue(page, 'B');

    const listA = await apiCallRaw<{ items: IssueRow[]; total: number }>(
      page,
      'GET',
      `/color-cards/issues?customer_id=${a.customerId}&page=1&page_size=100`
    );
    expect(
      Array.isArray(listA.items),
      `A 筛选列表缺 items 数组：${JSON.stringify(listA).slice(0, 200)}`
    ).toBe(true);
    expect(
      listA.total,
      'A 是新建唯一客户，只发一条，筛选 total 恰为 1（大于 1 说明筛选未生效或客户非专属）'
    ).toBe(1);
    expect(
      listA.items.every(r => r.customer_id === a.customerId),
      '列表筛选返回行客户ID必须全部等于 A，出现 B 说明筛选腿已断'
    ).toBe(true);

    const listAll = await apiCallRaw<{ items: IssueRow[]; total: number }>(
      page,
      'GET',
      '/color-cards/issues?page=1&page_size=100'
    );
    expect(listAll.total, '全量至少含 A、B 两条自建记录').toBeGreaterThanOrEqual(2);
    expect(listA.total, '按客户筛选的总数必须严格小于全量，否则无从证明筛选收窄').toBeLessThan(
      listAll.total
    );

    const exportA = await page.request.get(
      `${API_BASE}${API_PREFIX}/color-cards/issues/export?customer_id=${a.customerId}`
    );
    expect(exportA.status(), `A 筛选导出应 200，实际 ${exportA.status()}`).toBe(200);
    const xa = await extractXlsx(Buffer.from(await exportA.body()));
    expect(
      watermarkTotal(xa.text),
      'A 筛选导出的水印条数须等于 A 列表 total；导出腿漏传筛选回退全量时会大于它'
    ).toBe(listA.total);
    expect(xa.sheetRows, '工作表行数 = 水印行 1 + 标题行 1 + 数据行').toBe(2 + listA.total);

    const exportAll = await page.request.get(`${API_BASE}${API_PREFIX}/color-cards/issues/export`);
    expect(exportAll.status(), `全量导出应 200，实际 ${exportAll.status()}`).toBe(200);
    const xall = await extractXlsx(Buffer.from(await exportAll.body()));
    expect(watermarkTotal(xall.text), '全量导出的水印条数须等于全量列表 total').toBe(listAll.total);
    expect(xall.sheetRows, '全量工作表行数 = 水印 1 + 标题 1 + 全量数据行').toBe(2 + listAll.total);
    expect(
      watermarkTotal(xa.text),
      '筛选导出条数须严格小于全量，抓"导出忽略筛选回退全量"缺陷'
    ).toBeLessThan(watermarkTotal(xall.text));

    console.log(
      `[419] A筛选total=${listA.total} 全量total=${listAll.total} ` +
        `筛选导出行=${xa.sheetRows} 全量导出行=${xall.sheetRows} ` +
        `B客户=${b.customerId} 发放=${b.issueId}`
    );
  });
});
