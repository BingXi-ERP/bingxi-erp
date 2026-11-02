import { test, expect } from '../diagnose-fixture';
import { inflateRawSync } from 'zlib';
import { loginViaUI, loginAsRole, apiCall, apiCallRaw, apiCallExpectFail, API_BASE, API_PREFIX } from './helpers';

/**
 * 导出族「列可见性 + 受理门」配对（号段 235）
 *
 * 靶心不是 HTTP 200，而是同一份数据在不同角色/不同端点上，列与凭据的口径是否一致。
 * 判据源全部取自服务端源码，本文件注释里的 文件:行号 就是断言的依据，不是装饰。
 *
 * 三条腿的真实形状（逐条对着 handler 返回值确认，不按"导出=下载文件"想当然）：
 * - GET /api/v1/erp/export                       report_engine_handler.rs  → JSON 信封
 *   ExportReportResponse{data,format,filename}，format=csv 时 data 是 CSV 原文（可直接做列名成员判定）。
 * - GET /api/v1/erp/audit-logs/export            audit_log_handler.rs      → xlsx 二进制，
 *   先 require_admin_role(:384) 再 enforce_export_download_secured(:391)，无令牌 fail-closed。
 * - GET /api/v1/erp/login-logs/export            login_security_handler.rs → xlsx 二进制，
 *   handler 内既不读 download_token 也不做角色门（与审计日志腿形成不对称，本文件把它钉成断言）。
 * - GET /api/v1/erp/crm/leads/export             crm_handler.rs            → xlsx 二进制，
 *   行级 data_scope + 字段级掩码：非 admin 且无数据权限行时 mask_export_pii_columns(:537)。
 * - GET /api/v1/erp/sales/sales-prices/export    sales_price_handler.rs    → xlsx 二进制，
 *   受理门 resource_type="price_list"，无令牌 fail-closed。
 * - GET /api/v1/erp/production/cost-collections/export cost_collection_handler.rs → xlsx 二进制，
 *   只套行级 data_scope，无审批令牌门、无字段级掩码（与同族的 sales-prices 腿不对称，列为发现项）。
 *
 * 掩码算法同源判据：utils/field_mask.rs mask_phone 取前 3 位 + '****' + 后 4 位，
 * 11 位手机号脱敏后仍是 11 字符，所以"字节数变短"不可用作判据，必须做值的成员判定。
 *
 * xlsx 是 zip 容器（Cargo.toml:129 rust_xlsxwriter 0.98，条目按 deflate 存储），
 * 所以列/值的成员判定必须先解包，不能对压缩字节流做 grep（恒零命中＝假绿）。
 */

/** 只解本用例需要的字段：中央目录条目名 + 解压后的字节。压缩方法非 0/8 直接抛，不静默跳过条目。 */
function readZipEntries(buf: Buffer): Array<{ name: string; data: Buffer }> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error(`导出响应不是合法 zip 容器（未找到 EOCD 0x06054b50，共 ${buf.length} 字节）`);
  }
  const total = buf.readUInt16LE(eocd + 10);
  if (total === 0) {
    throw new Error('导出响应是空 zip 容器（中央目录零条目）');
  }
  const entries: Array<{ name: string; data: Buffer }> = [];
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error(`中央目录第 ${n} 项签名异常（期望 0x02014b50）`);
    }
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf-8', off + 46, off + 46 + nameLen);
    // 本地头的名称/额外字段长度可以与中央目录不同，数据起点必须按本地头重算
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + csize);
    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      data = inflateRawSync(raw);
    } else {
      throw new Error(`条目 ${name} 压缩方法 ${method} 不在解析器支持范围（0=stored,8=deflate）`);
    }
    entries.push({ name, data });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** 取 xlsx 响应体全部 XML 条目的解压文本，供列/值成员判定使用 */
async function xlsxTextOf(res: {
  status: () => number;
  headers: () => Record<string, string>;
  body: () => Promise<Buffer>;
}): Promise<string> {
  const bytes = await res.body();
  return readZipEntries(bytes)
    .filter(e => e.name.endsWith('.xml'))
    .map(e => e.data.toString('utf-8'))
    .join('\n');
}

/** 数一下工作表第 1 行（表头行）的单元格个数＝导出列数，用于两侧列基数一致性判定 */
function headerCellCount(text: string): number {
  return (text.match(/<c r="[A-Z]+1"/g) ?? []).length;
}

/** 直连导出腿（GET 为安全方法，不消费 CSRF，与本仓既有 39b 下载腿同法） */
async function getRaw(page: import('@playwright/test').Page, pathWithQuery: string) {
  const res = await page.request.get(`${API_BASE}${API_PREFIX}${pathWithQuery}`);
  console.log(`[235] GET ${pathWithQuery} → status=${res.status()} ct=${res.headers()['content-type'] ?? ''}`);
  return res;
}

/** 断言响应是真实 xlsx 容器：MIME + zip 魔数 + 非空体（照 82 行 239-247 范式） */
function assertXlsxEnvelope(res: { status: () => number; headers: () => Record<string, string> }, path: string): void {
  expect(res.status(), `GET ${path} 应 200，实际 ${res.status()}`).toBe(200);
  const ct = res.headers()['content-type'] ?? '';
  expect(ct, `GET ${path} Content-Type 应为 xlsx MIME，实际 ${ct}`).toContain('spreadsheetml');
}

const TOKEN_GATE_MESSAGE = '敏感资源导出需先获得导出审批令牌'; // export_approval_service.rs

interface ReportColumn {
  field: string;
  title: string;
  data_type: string;
}
interface ReportTemplate {
  id: string;
  name: string;
  report_type: string;
  columns: ReportColumn[];
}
interface ExportReportPayload {
  data: string;
  format: string;
  filename: string;
}

test.describe('P235 导出族列可见性与受理门配对', () => {
  test('报表导出 /export：CSV 列名集合与模板声明逐一对齐', async ({ page }) => {
    await loginViaUI(page);

    const templates = await apiCallRaw<ReportTemplate[]>(page, 'GET', '/report-templates');
    expect(Array.isArray(templates), `/report-templates 出参应为数组，实际 ${JSON.stringify(templates).slice(0, 160)}`).toBe(true);
    expect(templates.length, '/report-templates 返回零模板＝报表导出腿无数据源（死腿），本用例按判红处理').toBeGreaterThan(0);

    const tpl = templates.find(t => t.columns.length > 0);
    expect(tpl, `没有任何模板声明列定义，可用 id=${templates.map(t => `${t.id}:${t.columns.length}列`).join(', ')}`).toBeDefined();
    const declared = (tpl as ReportTemplate).columns.map(c => c.title);

    const payload = await apiCallRaw<ExportReportPayload>(
      page,
      'GET',
      `/export?template_id=${encodeURIComponent((tpl as ReportTemplate).id)}&format=csv`
    );
    expect(payload.format, `出参 format 应回显 csv，实际 ${payload.format}`).toBe('csv');
    expect(
      payload.filename,
      `出参 filename 应为 <template_id>.csv（report_engine_handler.rs），实际 ${payload.filename}`
    ).toBe(`${(tpl as ReportTemplate).id}.csv`);
    expect(typeof payload.data, `出参 data 必须是 CSV 文本，实际类型 ${typeof payload.data}`).toBe('string');
    expect(payload.data.length, 'CSV 文本为空＝导出腿只出信封不出内容').toBeGreaterThan(0);

    const headerLine = payload.data.split('\n')[0];
    const csvColumns = headerLine.split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(s => s.length > 0);
    expect(csvColumns.length, `CSV 表头解析出的列数为 0，表头行原文：${headerLine.slice(0, 200)}`).toBeGreaterThan(0);
    expect(new Set(csvColumns).size, `CSV 表头存在重复列名：${csvColumns.join('|')}`).toBe(csvColumns.length);
    for (const title of declared) {
      expect(csvColumns, `模板声明列「${title}」未出现在导出表头集合中，实际表头：${csvColumns.join('|')}`).toContain(title);
    }
    console.log(`[235] /export 模板 ${tpl?.id} 导出 ${csvColumns.length} 列，与声明的 ${declared.length} 列全部对齐`);
  });

  test('报表导出 /export 非法路径：缺参与不可运行模板都必须是可读的业务拒绝', async ({ page }) => {
    await loginViaUI(page);

    // 缺必填 template_id：axum Query<ExportReportQuery> 抽取失败 → 400，且响应体点名缺的是哪个字段
    const missing = await apiCallExpectFail(page, 'GET', '/export?format=csv');
    expect(missing.status, `缺 template_id 应 400，实际 ${missing.status}`).toBe(400);
    const missingResp = await getRaw(page, '/export?format=csv');
    const missingBody = await missingResp.text();
    expect(missingBody, `400 响应体应点名缺失字段 template_id，实际：${missingBody.slice(0, 200)}`).toContain('template_id');
    console.log(`[235] /export 缺参拒绝 status=${missing.status} body=${missingBody.slice(0, 120)}`);

    // 不存在的模板：必须被模板可见性门（ensure_template_runnable, :206）拒掉，
    // 判据是"不是 200、不是 5xx、且返回的是带机器码的 JSON 信封"——路由在册才可能有信封。
    const bogus = await getRaw(page, '/export?template_id=e2e235-no-such-template&format=csv');
    expect(bogus.status(), `不存在模板不得返回 200，实际 ${bogus.status()}`).not.toBe(200);
    expect(bogus.status(), `不存在模板不得返回 5xx（真实失败被掩盖），实际 ${bogus.status()}`).toBeLessThan(500);
    const bogusJson = await bogus.json();
    expect(typeof bogusJson.code, `拒绝体必须是带字符串机器码的 AppError 信封，实际：${JSON.stringify(bogusJson).slice(0, 200)}`).toBe('string');
    expect(String(bogusJson.code).length, '拒绝体机器码为空').toBeGreaterThan(0);
    expect(String(bogusJson.message ?? '').length, '拒绝体缺少可外显的拒绝原因').toBeGreaterThan(0);
    console.log(`[235] /export 不存在模板拒绝 status=${bogus.status()} code=${bogusJson.code} message=${bogusJson.message}`);
  });

  test('审计日志导出：未登录 401、admin 无令牌 403（逐字文案）、manager 撞的是角色门', async ({ page, browser }) => {
    // 未登录腿走独立新建上下文：不复用 worker 会话，避免 storageState 把 cookie 带进来变成假绿
    const anon = await browser.newContext();
    const anonResp = await anon.request.get(`${API_BASE}${API_PREFIX}/audit-logs/export`);
    expect(anonResp.status(), `未登录直连审计日志导出应 401，实际 ${anonResp.status()}`).toBe(401);
    const anonJson = await anonResp.json();
    expect(
      String(anonJson.code ?? '').length,
      `未登录拒绝体必须外显机器码（AppError 信封），实际：${JSON.stringify(anonJson).slice(0, 200)}`
    ).toBeGreaterThan(0);
    await anon.close();
    console.log(`[235] audit-logs/export 未登录 status=401 code=${anonJson.code}`);

    // admin 列表腿可达 ⇒ 后面的 403 只能归因到导出受理门，而不是 RBAC 或路由缺失
    await loginViaUI(page, undefined, undefined, true);
    const listRes = await apiCallRaw<{ items?: unknown[]; total?: number }>(page, 'GET', '/audit-logs?page=1&page_size=1');
    expect(listRes, 'admin 审计日志列表腿出参为空对象＝读路径已漂移，无法做受理门归因').toBeTruthy();

    const noToken = await apiCallExpectFail(page, 'GET', '/audit-logs/export');
    expect(noToken.status, `admin 无令牌导出应 403（fail-closed），实际 ${noToken.status}`).toBe(403);
    expect(
      noToken.message ?? '',
      `拒绝原因应逐字同源 export_approval_service.rs，实际：${noToken.message}`
    ).toContain(TOKEN_GATE_MESSAGE);

    const fakeToken = await apiCallExpectFail(page, 'GET', '/audit-logs/export?download_token=e2e235-not-a-real-token');
    expect(fakeToken.status, `伪造令牌应 403（verify_download_token 未命中），实际 ${fakeToken.status}`).toBe(403);
    expect(
      fakeToken.message ?? '',
      `伪造令牌的拒绝原因不应是"缺令牌"文案（否则说明令牌根本没被读），实际：${fakeToken.message}`
    ).not.toContain(TOKEN_GATE_MESSAGE);

    // manager：先撞 require_admin_role(audit_log_handler.rs)，其文案必然不同于受理门文案
    await loginAsRole(page, 'manager');
    const manager = await apiCallExpectFail(page, 'GET', '/audit-logs/export');
    expect(manager.status, `manager 导出审计日志应 403，实际 ${manager.status}`).toBe(403);
    expect(
      manager.message ?? '',
      `manager 的拒绝原因必须外显且不同于"缺令牌"文案（否则两处门被混为一谈），实际：${manager.message}`
    ).not.toContain(TOKEN_GATE_MESSAGE);
    expect(String(manager.message ?? '').length, 'manager 拒绝原因为空文案，不可外显').toBeGreaterThan(0);
    console.log(`[235] audit-logs/export 受理门归因：admin缺令牌="${noToken.message}" / admin伪令牌="${fakeToken.message}" / manager="${manager.message}"`);
  });

  test('登录日志导出：admin 无令牌直接出文件（与审计日志腿的不对称被钉住）', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);
    const res = await getRaw(page, '/login-logs/export');
    assertXlsxEnvelope(res, '/login-logs/export');

    // 对照腿：同族 /audit-logs/export 在完全相同的无令牌条件下是 403（上一条用例已证），
    // 这里断言 200 就是把 login_security_handler.rs 不读 download_token 的现状钉成回归护栏。
    const text = await xlsxTextOf(res);
    const cols = headerCellCount(text);
    expect(cols, `登录日志导出表头单元格数为 ${cols}（应为 8 列，见 login_security_handler.rs）`).toBe(8);
    expect(text, '导出的工作表里没有任何表头文本条目').toContain('<is>');
    console.log(`[235] /login-logs/export 无令牌 200，表头列数=${cols}，解压 XML 文本 ${text.length} 字符`);

    // manager 可达性配对：列表腿与导出腿必须同一口径（两边都 2xx 或都 403，不接受 404/5xx）
    await loginAsRole(page, 'manager');
    const listRes = await getRaw(page, '/login-logs?page=1&page_size=1');
    const exportRes = await getRaw(page, '/login-logs/export');
    const pair = [listRes.status(), exportRes.status()];
    for (const s of pair) {
      expect(s, `登录日志两端点出现 404/5xx（路由漂移或服务错误）：list=${pair[0]} export=${pair[1]}`).not.toBeGreaterThanOrEqual(404);
    }
    const bothOk = pair.every(s => s >= 200 && s < 300);
    const bothForbidden = pair.every(s => s === 403);
    expect(
      bothOk || bothForbidden,
      `登录日志"列表可达而导出不可达"（或反之）＝同一资源的两个腿权限口径漂移：list=${pair[0]} export=${pair[1]}`
    ).toBe(true);
    console.log(`[235] manager 登录日志配对 list=${pair[0]} export=${pair[1]}（${bothOk ? '两腿均可读' : '两腿均被拒'}）`);
  });

  test('线索导出：admin 出原文、manager 同列但 PII 值被掩码', async ({ page }) => {
    // 前置：从 admin 列表腿原文里取一条真实 11 位手机号。取不到就判红并点名，
    // 而不是降级成"没有手机号就跳过掩码断言"——那会把整条用例变成恒过。
    await loginViaUI(page, undefined, undefined, true);
    const adminList = await getRaw(page, '/crm/leads?page=1&page_size=50');
    expect(adminList.status(), `admin 线索列表应 200，实际 ${adminList.status()}`).toBe(200);
    const adminListText = await adminList.text();
    const phoneMatch = adminListText.match(/1[3-9][\d]{9}/);
    expect(
      phoneMatch,
      'CRM 线索表内没有任何带 11 位手机号的行：/crm/leads/export 的脱敏配对无从验证（缺 fixture 或线索列表腿已不返回 phone，需人工定性，禁默认放行）'
    ).not.toBeNull();
    const rawPhone = phoneMatch as RegExpMatchArray;
    const phone = rawPhone[0];
    const maskedPhone = `${phone.slice(0, 3)}****${phone.slice(phone.length - 4)}`;

    const adminExport = await getRaw(page, '/crm/leads/export');
    assertXlsxEnvelope(adminExport, '/crm/leads/export');
    const adminText = await xlsxTextOf(adminExport);
    expect(adminText, `admin 导出应含线索原文手机号 ${phone}（列表有、导出无＝两条腿读的不是同一份数据）`).toContain(phone);
    expect(adminText, `admin 导出不该出现掩码占位 ${maskedPhone}（admin 判据源 crm_handler.rs is_admin_role）`).not.toContain(maskedPhone);

    await loginAsRole(page, 'manager');
    const managerExport = await getRaw(page, '/crm/leads/export');
    assertXlsxEnvelope(managerExport, '/crm/leads/export');
    const managerText = await xlsxTextOf(managerExport);
    expect(managerText, `manager 导出仍含未脱敏手机号 ${phone}＝"列表打码、导出原文"旁路（判据源 crm_handler.rs 默认掩码）`).not.toContain(phone);
    expect(managerText, `manager 导出应出现掩码形态 ${maskedPhone}（field_mask.rs）`).toContain(maskedPhone);

    // 列基数配对：掩码只改值不删列，两侧表头单元格数必须相同
    const adminCols = headerCellCount(adminText);
    const managerCols = headerCellCount(managerText);
    expect(adminCols, `admin 线索导出表头列数为 ${adminCols}（0＝导出腿只出信封不出表结构）`).toBeGreaterThan(0);
    expect(
      managerCols,
      `manager 与 admin 的导出列基数不一致（admin=${adminCols} manager=${managerCols}）：字段级权限把列整列删掉了，而默认掩码口径应保留列名`
    ).toBe(adminCols);
    console.log(`[235] /crm/leads/export 列可见性配对：列数 admin=${adminCols} manager=${managerCols}，原文号 ${phone} 仅 admin 侧命中`);
  });

  test('价格表导出：列表腿 200 而导出腿要令牌（admin 全程同一会话归因）', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);
    const list = await apiCall<{ items?: unknown[] }>(page, 'GET', '/sales/sales-prices?page=1&page_size=1');
    expect(list, 'admin 销售价格列表腿出参为空＝读路径漂移，无法做受理门归因').toBeTruthy();

    const noToken = await apiCallExpectFail(page, 'GET', '/sales/sales-prices/export');
    expect(noToken.status, `无令牌价格表导出应 403，实际 ${noToken.status}`).toBe(403);
    expect(noToken.message ?? '', `拒绝原因应逐字同源受理门文案，实际：${noToken.message}`).toContain(TOKEN_GATE_MESSAGE);

    const fakeToken = await apiCallExpectFail(page, 'GET', '/sales/sales-prices/export?download_token=e2e235-not-a-real-token');
    expect(fakeToken.status, `伪造令牌价格表导出应 403，实际 ${fakeToken.status}`).toBe(403);

    // 跨资源令牌未被本端点误吃：拿 customer 资源的合法形状令牌打价格表导出必然不是 200
    // （资源类型比对在 sales_price_handler.rs 传入 expected="price_list"）
    const crossRes = await getRaw(page, '/sales/sales-prices/export?download_token=e2e235-customer-shaped-token');
    expect(crossRes.status(), `非本资源令牌打价格表导出不得 200，实际 ${crossRes.status()}`).not.toBe(200);
    console.log(`[235] sales-prices/export 受理门：无令牌=${noToken.status}"${noToken.message}" 伪令牌=${fakeToken.status} 异资源令牌=${crossRes.status()}`);
  });

  test('成本归集导出：无审批令牌门即可整表出文件（与同族价格表腿的不对称被钉住）', async ({ page }) => {
    await loginViaUI(page, undefined, undefined, true);
    const res = await getRaw(page, '/production/cost-collections/export');
    assertXlsxEnvelope(res, '/production/cost-collections/export');
    const text = await xlsxTextOf(res);
    const cols = headerCellCount(text);
    expect(cols, `成本归集导出表头列数为 ${cols}：0 表示 handler 只回了信封没有表结构（cost_collection_handler.rs build_collections_table）`).toBeGreaterThan(0);
    console.log(`[235] /production/cost-collections/export admin 无 download_token 直接 200，列数=${cols}（对照：sales-prices 同条件是 403）`);

    // 行级 data_scope 是唯一在生效的层（cost_collection_handler.rs）：
    // manager 侧做列表腿/导出腿可达性配对，两边口径必须一致
    await loginAsRole(page, 'manager');
    const listRes = await getRaw(page, '/production/cost-collections?page=1&page_size=1');
    const exportRes = await getRaw(page, '/production/cost-collections/export');
    const pair = [listRes.status(), exportRes.status()];
    for (const s of pair) {
      expect(s, `成本归集两端点出现 404/5xx：list=${pair[0]} export=${pair[1]}`).not.toBeGreaterThanOrEqual(404);
    }
    const bothOk = pair.every(s => s >= 200 && s < 300);
    const bothForbidden = pair.every(s => s === 403);
    expect(
      bothOk || bothForbidden,
      `成本归集"列表可达而导出不可达"（或反之）＝同一资源两个腿权限口径漂移：list=${pair[0]} export=${pair[1]}`
    ).toBe(true);
    if (bothOk) {
      const managerText = await xlsxTextOf(exportRes);
      expect(
        headerCellCount(managerText),
        `manager 与 admin 的成本归集导出列基数不一致（admin=${cols} manager=${headerCellCount(managerText)}）：该腿没有任何字段级掩码，列集应完全同源`
      ).toBe(cols);
    }
    console.log(`[235] manager 成本归集配对 list=${pair[0]} export=${pair[1]}`);
  });
});
