// 4.8 / 4.11 SQL 注入负例 E2E — enhanced/sql-injection-negative
// 前置说明：看板"4.11 仅越权、无 XSS/SQLi/CSRF 负例"经 2026-11-20 复核为假阴——
//   CSRF/XSS 已有断言，SQLi 为真实缺口。本 spec 以真实 API 回读补上 SQLi 负例。
// 后端事实：backend/src/services/crm/lead.rs:134-145 的 list_leads 把 keyword 交给
//   sea-orm 的 Column.like(&format!("%{}%", keyword))，值以绑定参数下发，不参与 SQL
//   文本拼接。因此注入 payload 只作字面 LIKE 模式，不会恒真返回全表、也不会引发语法错。
// 检测力：若实现退化为字符串拼接，用例里的恒真 payload 会让 WHERE 恒真而命中本不该命中的
//   行、单引号/堆叠 payload 会触发 500——两类断言都会判红，不做空断言假绿。
import { test, expect } from '../diagnose-fixture';
import { apiCall, apiCallRaw, genCode, tryCleanup } from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

interface LeadRow {
  id: number;
  lead_no?: string;
  company_name?: string;
}

async function searchLeads(
  page: import('@playwright/test').Page,
  keyword: string
): Promise<LeadRow[]> {
  const payload = await apiCallRaw<{ items: LeadRow[] }>(
    page,
    'GET',
    `/crm/leads?keyword=${encodeURIComponent(keyword)}&page=1&page_size=100`
  );
  expect(
    Array.isArray(payload?.items),
    `keyword=${JSON.stringify(keyword)} 的 /crm/leads 出参缺 items 数组键，实际载荷 ${JSON.stringify(payload)}`
  ).toBe(true);
  return payload.items;
}

async function seedLead(
  page: import('@playwright/test').Page,
  prefix: string
): Promise<LeadRow & { leadNo: string }> {
  const leadNo = genCode(prefix);
  const created = await apiCall<{ id?: number }>(page, 'POST', '/crm/leads', {
    lead_no: leadNo,
    lead_status: 'new',
    company_name: `注入测试 ${leadNo}`,
    contact_name: '测试联系人',
    lead_source: 'WEBSITE',
    mobile_phone: '13700137001',
    email: `${leadNo}@test.com`,
    priority: 'LOW',
  });
  const id = created.data?.id;
  expect(id, `建线索失败，实际响应 ${JSON.stringify(created).slice(0, 300)}`).toBeTruthy();
  CLEANUP.push({ path: `/crm/leads/${id}`, label: 'sql_injection_lead' });
  return { id: id!, leadNo, company_name: `注入测试 ${leadNo}` };
}

test.describe('SQL 注入负例（4.8 接口安全 / 4.11 OWASP 纵深）', () => {
  test('sqli-01 恒真 payload 作 keyword 不绕过参数化返回全表', async ({ page }) => {
    const prefix = 'E2E-SQLI-OR';
    const lead = await seedLead(page, prefix);

    // 正向对照①：正常 keyword 必须命中刚建行——证明搜索通道有效、行确实在库。
    // 缺此对照时"注入 payload 不命中"可能只是行不存在或搜索断裂的假绿。
    const normal = await searchLeads(page, prefix);
    expect(
      normal.find(r => r.id === lead.id),
      `正常 keyword=${prefix} 应命中刚建线索 ${lead.id}（证明搜索通道与数据有效）`
    ).toBeDefined();

    // 核心负例②：恒真 payload 作 keyword。字符串拼接实现会让 WHERE 恒真而把刚建行
    // 一并带回；参数化实现下它只是字面 LIKE 模式，不可能匹配到 company_name。
    const injected = await searchLeads(page, "' OR '1'='1");
    expect(
      injected.find(r => r.id === lead.id),
      `keyword="' OR '1'='1" 不应命中线索 ${lead.id}——若出现说明 SQL 被拼接成恒真条件`
    ).toBeUndefined();
  });

  test('sqli-02 单引号与堆叠 payload 不触发 500 且数据完好', async ({ page }) => {
    const prefix = 'E2E-SQLI-QUOTE';
    const lead = await seedLead(page, prefix);

    // 单引号单独作 keyword：拼接实现会破坏 SQL 语法触发 500（apiCall 解析非 JSON 信封
    // 会抛错判红）；参数化下仅是合法 LIKE 字面模式，返回正常 items 信封。
    const quote = await searchLeads(page, "'");
    expect(Array.isArray(quote), '单引号 payload 应返回正常 items 数组，不得 500').toBe(true);

    // 堆叠 DROP TABLE payload：拼接实现可能执行删表或语法错；参数化下无害。
    // 用后续正常查询仍能命中刚建行来证明表未被破坏、数据未丢（不只判"没报错"）。
    const stacked = await searchLeads(page, "'; DROP TABLE crm_leads; --");
    expect(Array.isArray(stacked), '堆叠 payload 应返回正常 items 数组，不得 500').toBe(true);

    const after = await searchLeads(page, prefix);
    expect(
      after.find(r => r.id === lead.id),
      `堆叠 payload 后线索 ${lead.id} 仍应可查（证明表与数据完好，payload 未被当作 SQL 执行）`
    ).toBeDefined();
  });
});
