import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  deferCleanup,
  ensureTestEntities,
  expectDenied,
  failureCode,
  flushDeferredCleanups,
  getCtx,
  loginAsRole,
  loginViaUI,
  genCode,
  genName,
  testPassword,
  testUsername,
  type DeferredCleanup,
} from './helpers';

/**
 * 447 打印模板/打印目标 CRUD 与删除读回、两枚单据打印腿的真实内容、导出脱敏的角色分面、
 * 导出审批一次性令牌，以及 print/export 家族的空壳（死端点）侦测。
 *
 * 端点存在性的唯一事实来源是 frontend/scripts/route-snapshot.txt，本文件只使用下列已注册腿：
 * - GET/POST `/print-templates`、GET/PUT/DELETE `/print-templates/{id}`、PUT `/print-templates/{id}/set-default`
 *   （print_handler 的 list/create/get/update/delete/set_default，mod 组）；
 * - GET/POST `/print-targets`、GET/PUT/DELETE `/print-targets/{id}`
 *   （print_target_handler 的 list/create/get/update/delete，mod 组）；
 * - GET `/color-cards/{request_id}/lab-dip/print`（print_handler::lab_dip_request_print_docx，
 *   doc_type 恒为 `lab_dip_request`，路径参数是打样申请主键而非色卡主键）；
 * - GET `/custom-orders/{id}/print`（print_handler::custom_order_print_docx，doc_type `custom_order`）；
 * - GET/POST `/crm/customers`、GET `/crm/customers/enhanced`、GET `/crm/customers/{id}/contacts`、
 *   GET `/crm/customers/export`、DELETE `/crm/customers/{id}`、DELETE `/crm/customers/enhanced/{id}`、
 *   GET `/color-cards/issues`、GET `/color-cards/issues/{id}`、GET `/color-cards/issues/export`、
 *   GET `/audit-logs/export`；
 * - 成本列分面的造数腿：POST `/color-cards`、GET `/color-cards/{id}`、PUT `/color-cards/{id}`、
 *   DELETE `/color-cards/{id}`、POST `/color-cards/issues`、POST `/color-cards/issues/{id}/damaged`
 *   （发放记录族只有 GET 与 POST 两类挂载，没有 DELETE 腿，见 447-4 的收尾说明）；
 * - POST `/export-approvals`、GET `/export-approvals`、GET `/export-approvals/{id}`、
 *   GET `/export-approvals/{id}/token-once`、GET `/export-approvals/verify-token`、
 *   POST `/export-approvals/{id}/approve`、POST `/export-approvals/{id}/rotate-token`、
 *   POST `/export-approvals/{id}/cancel`。
 *
 * 打印腿的出参与判据来源：`render_print_docx`（backend/src/handlers/print_handler.rs）先装配打印
 * 数据再解析模板布局，无可用默认模板行时 `resolve_print_docx_layout`
 * （backend/src/handlers/print_task_handler.rs）不外显 200，成功出参是
 * `docx_response` 的 docx 字节流，`content-disposition` 文件名格式为 `{doc_type}_{doc_id}.docx`。
 * 因此本文件对打印腿一律 JSZip 解 `word/document.xml` 后断言真实业务标识（打样申请号/定制订单号），
 * 不接受只判 200 或只判字节长度。
 *
 * 脱敏分面的事实来源（不是设想，是写入方代码）：
 * - `utils/field_mask.rs` 的 `mask_contact_fields_for_role`：`is_admin=true` 原样返回；
 *   非 admin 对 phone_keys（contact_phone/phone/mobile/mobile_phone/tel_phone/telephone/driver_phone/
 *   contact_mobile）逐个替换成 `mask_phone` 形态（前 3 + `****` + 后 4，键保留），
 *   email_keys（contact_email/email/email_address）替换成 `mask_email` 形态（首字母 + `***@` + 域名）。
 * - `services/crm/cust.rs` 的 `mask_customer_pii_defaults`：在上述基础上，非 admin 另把 `address`
 *   整键移除（掩码列保留、地址列剔除，两者形态不同，断言不能一刀切）。
 * - `handlers/crm_customer_handler.rs` 的 `apply_customer_field_permission` 是客户域读写出口的唯一实现，
 *   列表（`/crm/customers/enhanced`）、详情与同文件的 `list_contacts`
 *   （`/crm/customers/{id}/contacts`）都走它，故 contacts 子端点与客户列表同一分面；
 *   若实测 contacts 出原文即为旁路缺陷，由本文件的断言直接判红暴露，不做放宽。
 * - 增强列表的行来自线索域（`create_customer` → `services/crm/lead.rs::create_lead`），
 *   PII 列键因此是 `models/crm_lead.rs` 的 `mobile_phone`/`tel_phone`/`email`/`address`，
 *   不是 `customers`/`customer_contacts` 的 `contact_phone`/`contact_email`；读错键等于按钮恒不可达级
 *   的空断言。`/crm/customers/enhanced` 的出参是手写分页壳 `{items,total,page,page_size}`
 *   （`list_leads`），承载键由 `crm-enhanced.ts` 的 `CustomerPage` 与 `check-api-envelope.mjs` 共同确认。
 * - `services/color_card_issue_service.rs` 的 `mask_cost_amount`：`handlers/color_card/issue.rs`
 *   在 `can_view_cost` 为假时把 `compensation_amount` 置 None（成本列剔除而非掩码，与 PII 列又是第三种形态）。
 *   `can_view_cost` 与发放面第二道门都按权限注册表在册的资源名 `color-cards` 判定（动作分别为
 *   `export` 与 `read`/`create`/`cancel`），与 URL 派生出的第一道门同键；第二道门用的判定器
 *   容 `*` 通配授权行，口径与中间件的 `matches_permission` 一致，因此只持 `color-cards:read`
 *   的岗位可读列表、看不到成本列，持 `color-cards:*` 或 `color-cards:export` 的岗位两者都看得到。
 *
 * 一次性令牌的事实来源：`handlers/export_approval_handler.rs` 的 `view_token_once` 先过状态门——
 * `services/export_approval_service.rs` 的 `view_token_once` 对非 approved 状态回
 * `AppError::business_displayable`（HTTP 400 + 机器码 BUSINESS_ERROR，文案点名当前状态），
 * 通过后首次回 `{available:true,token:<明文>}`，之后只回 `{available:false,fingerprint,message}`
 * 且不再携带明文；`verify_download_token` 走 `assert_token_consumable`，只判定可消费性、不消费凭据，
 * 令牌明文找不到或状态非 APPROVED 或已消费一律 `AppError::permission_denied`（HTTP 403 +
 * 机器码 FORBIDDEN）；真正的一次性消费由导出腿的 `record_download` 落 consumed 终态
 * （`build_export_approval_active` 把 max_downloads 签发即为 1）；`rotate_token` 换发即替换哈希列，
 * 旧明文既不匹配哈希也不匹配明文回退分支；`cancel` 仅对 pending/pending_l2 放行（`is_pending_any`），
 * 已批准或已消费的申请取消被 `AppError::business` 拒（出参脱敏，故只钉状态与机器码）；
 * 同文件的 `masked_json` 把列表与详情的
 * `download_token`、`token_hash` 恒置 null。
 *
 * 失败信封断言一律钉 HTTP 码 + 字符串机器码 + trace_id/timestamp 在场（utils/error.rs 单一形状），
 * 不写裸 isErr、不把 404/403 当健康、不用 `?? []` 掩盖缺键。
 */

/** 空壳判据用的载荷字符数：剥掉 JSON 结构符与 null/true/false/[]/{} 后剩下的真实内容长度 */
function shellPayloadLength(payload: unknown): number {
  const t = JSON.stringify(payload ?? null)
    .replace(/[\s{}"':,:[\]]/g, '')
    .replace(/null|true|false/g, '');
  return t.length;
}

/** 统一 URL 拼装：apiCall 系列自带前缀，原始 page.request 腿必须显式拼 API_BASE + API_PREFIX */
function fullUrl(path: string): string {
  return `${API_BASE}${API_PREFIX}${path}`;
}

/** 列表信封取行：分页信封取 items、裸数组直接返回，其余形状抛错（不把形状漂移静默成空列表） */
function rowsOf(data: unknown, leg: string): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data as Record<string, unknown>[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
    return (data as { items: Record<string, unknown>[] }).items;
  }
  throw new Error(
    `[${leg}] 列表信封形状漂移：既非数组也非 {items:[]}，实际 ${JSON.stringify(data)}`
  );
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

/** docx 解包取正文 XML：容器缺 word/document.xml 或正文过短一律判负（空壳模板打不出字） */
async function documentXml(bytes: Buffer, leg: string): Promise<string> {
  expect(
    bytes.byteLength,
    `[${leg}] docx 字节体必须非空，实际 ${bytes.byteLength}B`
  ).toBeGreaterThan(0);
  expect(bytes[0], `[${leg}] docx 首字节必须是 0x50（PK），实际 ${bytes[0]}`).toBe(0x50);
  expect(bytes[1], `[${leg}] docx 次字节必须是 0x4b（PK），实际 ${bytes[1]}`).toBe(0x4b);
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  expect(
    entry,
    `[${leg}] docx 必须含 word/document.xml，实际条目 ${Object.keys(zip.files).join(',')}`
  ).toBeTruthy();
  const xml = await entry!.async('string');
  expect(
    xml.length,
    `[${leg}] word/document.xml 正文必须非空，实际 ${xml.length}B`
  ).toBeGreaterThan(100);
  return xml;
}

/**
 * 打印腿：先探测既有默认模板是否可渲染，不可渲染则建一张 is_default 模板再请求，
 * 用「同一 URL 加模板后由 404 翻成 200」证明 404 来自模板装配分支而不是路由未注册。
 * 入参：page=已登录会话；path=打印腿相对路径；docType=渲染时使用的 doc_type；needle=必须出现在正文
 * 的真实业务标识；cleanupQueue=模板清理队列。返回解包后的正文 XML 供上层继续断言。
 */
async function printDocxWithRealContent(
  page: Page,
  path: string,
  docType: string,
  needle: string,
  cleanupQueue: DeferredCleanup[]
): Promise<string> {
  const url = fullUrl(path);
  let resp = await page.request.get(url);
  let status = resp.status();
  if (status === 404) {
    const tpl = await apiCallRaw<{ id: number }>(page, 'POST', '/print-templates', {
      template_name: genName('P447TPL'),
      doc_type: docType,
      template_code: genCode('P447'),
      paper_size: 'A4',
      orientation: 'portrait',
      copies_default: 1,
      content: '<html><body>${}</body></html>',
      is_default: true,
      status: 'active',
    });
    const tplId = Number(tpl.id);
    expect(
      Number.isInteger(tplId) && tplId > 0,
      `[${path}] 建默认模板必须回主键，实际 ${tpl.id}`
    ).toBe(true);
    deferCleanup(cleanupQueue, 'DELETE', `/print-templates/${tplId}`, `print-template-${tplId}`);
    resp = await page.request.get(url);
    status = resp.status();
  }
  expect(
    status,
    `[${path}] 打印腿必须 200 出 docx 流；404=模板装配不出（死腿），200 空体=空壳，均判负（实际 ${status}）`
  ).toBe(200);
  const ctype = resp.headers()['content-type'] ?? '';
  expect(
    ctype.includes('wordprocessingml'),
    `[${path}] content-type 必须是 docx 流，实际 ${ctype}`
  ).toBe(true);
  const disposition = resp.headers()['content-disposition'] ?? '';
  expect(
    disposition.includes(`${docType}_`),
    `[${path}] 下载名必须是 {doc_type}_{doc_id}.docx 形态，实际 ${disposition}`
  ).toBe(true);
  const xml = await documentXml(await resp.body(), path);
  expect(
    xml.includes(needle),
    `[${path}] 打印正文必须带出真实业务标识「${needle}」，只出模板骨架即空壳打印，判为缺陷`
  ).toBe(true);
  return xml;
}

/**
 * 导出腿空壳侦测：GET 出参必须是真实载荷。JSON 信封要能取到非空 data 或数组非空，
 * 文本/CSV 要有非空白正文，zip 容器（xlsx/docx）要能解出非空条目；
 * 其它形状一律抛错暴露，不做「看起来是 200 就算过」。
 */
async function assertExportNotDeadEnd(page: Page, path: string, session: string): Promise<string> {
  const resp = await page.request.get(fullUrl(path));
  const status = resp.status();
  expect(
    status,
    `[${session}] 导出腿 ${path} 返回 ${status}：404/403 说明路由未注册或权限拒，不当作健康`
  ).toBe(200);
  const bytes = await resp.body();
  expect(
    bytes.byteLength,
    `[${session}] 导出腿 ${path} 出参 0 字节，判为空壳死端点`
  ).toBeGreaterThan(0);
  const ctype = resp.headers()['content-type'] ?? '';
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    expect(
      names.length,
      `[${session}] 导出腿 ${path} 是空 zip 容器，判为空壳死端点`
    ).toBeGreaterThan(0);
    let total = 0;
    for (const n of names.slice(0, 5)) {
      total += (await zip.files[n].async('string')).length;
    }
    expect(
      total,
      `[${session}] 导出腿 ${path} 的 zip 条目正文全空，判为空壳死端点`
    ).toBeGreaterThan(0);
    return `zip:${names.join(',')}`;
  }
  const text = bytes.toString('utf8');
  if (ctype.includes('json') || text.trimStart().startsWith('{')) {
    const json = JSON.parse(text) as { success?: boolean; data?: unknown; code?: string | number };
    expect(
      json.success,
      `[${session}] 导出腿 ${path} 的 JSON 信封 success 不为真：${json.code ?? ''}`
    ).toBe(true);
    const payload = json.data;
    if (Array.isArray(payload)) {
      expect(
        payload.length,
        `[${session}] 导出腿 ${path} 返回 data:[] 且会话前置有数据，判为空壳死端点`
      ).toBeGreaterThan(0);
      return JSON.stringify(payload.slice(0, 3));
    }
    if (
      payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as { items?: unknown }).items)
    ) {
      const items = (payload as { items: unknown[] }).items;
      expect(
        items.length,
        `[${session}] 导出腿 ${path} 返回 items:[] 且会话前置有数据，判为空壳死端点`
      ).toBeGreaterThan(0);
      return JSON.stringify(items.slice(0, 3));
    }
    expect(
      payload !== null && payload !== undefined && str(payload).trim() !== '',
      `[${session}] 导出腿 ${path} 的 data 为空壳（${JSON.stringify(payload)}）`
    ).toBe(true);
    return str(payload).slice(0, 2000);
  }
  expect(
    text.replace(/[\s]/g, '').length,
    `[${session}] 导出腿 ${path} 正文只有空白/表头以下长度，判为空壳死端点`
  ).toBeGreaterThan(2);
  return text;
}

interface ContactRow {
  id: number;
  customer_name?: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  mobile_phone?: string | null;
  tel_phone?: string | null;
  [key: string]: unknown;
}

test.describe('447 打印模板与导出的脱敏一致性 + 死端点侦测', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginViaUI(page, testUsername(), testPassword());
  });

  test('447-1 print-templates 建查改删全腿，删除后列表与对象口双双读回消失', async ({ page }) => {
    const queue: DeferredCleanup[] = [];
    const name = genName('P447TPL');
    const code = genCode('P447');
    const created = await apiCallRaw<{ id: number; template_name?: string; doc_type?: string }>(
      page,
      'POST',
      '/print-templates',
      {
        template_name: name,
        doc_type: 'lab_dip_request',
        template_code: code,
        paper_size: 'A4',
        orientation: 'portrait',
        copies_default: 2,
        content: '<html><body>447</body></html>',
        is_default: false,
        status: 'active',
      }
    );
    const id = Number(created.id);
    expect(Number.isInteger(id) && id > 0, `创建必须回自增主键，实际 ${created.id}`).toBe(true);
    deferCleanup(queue, 'DELETE', `/print-templates/${id}`, `print-template-${id}`);

    const list1 = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/print-templates?page=1&page_size=200'),
      '模板列表'
    );
    const hit = list1.find(r => Number(r.id) === id);
    expect(hit, `列表必须含新建模板 ${id}`).toBeTruthy();
    expect(str(hit!.template_name), '列表回显名称必须等于写入值').toBe(name);
    expect(str(hit!.doc_type), '列表回显 doc_type 必须等于写入的渲染查找键').toBe(
      'lab_dip_request'
    );

    const single = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/print-templates/${id}`);
    expect(Number(single.id), '对象口主键必须命中本行').toBe(id);
    expect(Number(single.copies_default), '对象口 copies_default 必须等于写入值 2').toBe(2);

    const renamed = genName('P447TPL2');
    await apiCall(page, 'PUT', `/print-templates/${id}`, { template_name: renamed });
    const afterPut = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/print-templates/${id}`
    );
    expect(str(afterPut.template_name), 'PUT 后对象口必须读回新名称').toBe(renamed);

    await apiCall(page, 'DELETE', `/print-templates/${id}`);
    const list2 = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/print-templates?page=1&page_size=200'),
      '模板列表删后'
    );
    expect(
      list2.some(r => Number(r.id) === id),
      `删除后列表仍含 ${id}，即假删除`
    ).toBe(false);
    const gone = await apiCallExpectFail(page, 'GET', `/print-templates/${id}`);
    expect(gone.status, `删除后对象口必须 404，实际 ${gone.status}`).toBe(404);
    expect(gone.code, '删除后对象口的机器码必须是 NOT_FOUND').toBe(APP_ERROR_CODES.NOT_FOUND);
    await flushDeferredCleanups(page, queue);
  });

  test('447-2 print-targets 建查改删全腿，删除后列表读回消失', async ({ page }) => {
    const queue: DeferredCleanup[] = [];
    const targetCode = genCode('P447TGT');
    const displayName = genName('P447TGT');
    // kind 必须落 models/status/print.rs 的 print_target_kind 词表（cups/ipp/network/system_command），
    // 且非池行要带该 kind 必需的连接字段：cups 要 queue_name（handlers/print_target_handler.rs 校验）。
    const created = await apiCallRaw<{ id: number }>(page, 'POST', '/print-targets', {
      target_code: targetCode,
      display_name: displayName,
      kind: 'cups',
      queue_name: 'print447',
      enabled: true,
      default_copies: 1,
    });
    const id = Number(created.id);
    expect(Number.isInteger(id) && id > 0, `创建打印目标必须回主键，实际 ${created.id}`).toBe(true);
    deferCleanup(queue, 'DELETE', `/print-targets/${id}`, `print-target-${id}`);

    const list1 = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/print-targets?page=1&page_size=200'),
      '目标列表'
    );
    const hit = list1.find(r => Number(r.id) === id);
    expect(hit, `目标列表必须含新建行 ${id}`).toBeTruthy();
    expect(str(hit!.target_code), '列表回显 target_code 必须等于写入值').toBe(targetCode);
    expect(str(hit!.display_name), '列表回显 display_name 必须等于写入值').toBe(displayName);

    const single = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/print-targets/${id}`);
    expect(str(single.kind), '对象口 kind 必须回显写入值').toBe('cups');

    // 唯一性门的判据对象必须是「还在册的行」：载荷与正例同样合法（cups 加
    // queue_name），否则它会因缺连接字段被拒，断言就打不到唯一性这条判据上。
    const dup = await apiCallExpectFail(page, 'POST', '/print-targets', {
      target_code: targetCode,
      display_name: displayName,
      kind: 'cups',
      queue_name: 'print447',
    });
    expect(
      [400, 409].includes(dup.status),
      `在册行的同 target_code 重复建单必须被拒，实际 ${dup.status}`
    ).toBe(true);
    expect(failureCode(dup), `重复编码的机器码应为 VALIDATION_ERROR，实际 ${dup.code}`).toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      str(dup.message).includes('目标编码已存在'),
      `拒绝原因必须是编码唯一性而不是缺连接字段，实际文案 ${str(dup.message)}`
    ).toBe(true);
    const renamed = genName('P447TGT2');
    await apiCall(page, 'PUT', `/print-targets/${id}`, { display_name: renamed });
    const afterPut = await apiCallRaw<Record<string, unknown>>(page, 'GET', `/print-targets/${id}`);
    expect(str(afterPut.display_name), 'PUT 后必须读回新显示名').toBe(renamed);

    await apiCall(page, 'DELETE', `/print-targets/${id}`);
    const list2 = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/print-targets?page=1&page_size=200'),
      '目标列表删后'
    );
    expect(
      list2.some(r => Number(r.id) === id),
      `删除后目标列表仍含 ${id}，即假删除`
    ).toBe(false);

    // 删除腿是硬删（print_targets 无软删列），唯一键随行释放：同一 target_code
    // 删后必须能重建并回读，且落在新主键上。这一条同时钉住两种失效形态——
    // 「删除只置状态不释放唯一键」与「删除根本没写库」。
    const rebuilt = await apiCallRaw<{ id: number }>(page, 'POST', '/print-targets', {
      target_code: targetCode,
      display_name: displayName,
      kind: 'cups',
      queue_name: 'print447',
    });
    const rebuiltId = Number(rebuilt.id);
    expect(
      Number.isInteger(rebuiltId) && rebuiltId > 0,
      `删后同 target_code 重建必须成功并回主键，实际 ${rebuilt.id}`
    ).toBe(true);
    expect(rebuiltId, '重建行必须是新主键，不能复用已删行的 id').not.toBe(id);
    deferCleanup(
      queue,
      'DELETE',
      `/print-targets/${rebuiltId}`,
      `print-target-rebuild-${rebuiltId}`
    );
    const afterRebuild = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/print-targets/${rebuiltId}`
    );
    expect(str(afterRebuild.target_code), '重建行必须可按新主键回读同一编码').toBe(targetCode);
    await flushDeferredCleanups(page, queue);
  });

  test('447-3 两枚单据打印腿真内容：docx 正文必须带出打样申请号与定制订单号', async ({ page }) => {
    const queue: DeferredCleanup[] = [];

    // 打印腿的取证对象由本用例自建：库内是否恰好存在打样申请不是可信前置，且列表首行可能
    // 属并行 worker 并在本腿用前被其收尾删除。外键取 ensureTestEntities 备好的真实客户，
    // 必填 light_source 与 required_date 按 CreateLabDipRequestRequest 口径给足，单号由服务端取号。
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.customerId) {
      throw new Error('447-3 前置不成立：ensureTestEntities 未产出客户外键，自建打样申请无从落库');
    }
    const lab = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      '/production/lab-dip/requests',
      {
        customer_id: ctx.customerId,
        customer_color_no: `447${genCode('L')}`,
        customer_color_name: '447 打印腿打样色号',
        sample_type: '小样',
        fabric_spec: '447 打印腿规格',
        light_source: 'D65',
        required_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      }
    );
    const labId = Number(lab.id);
    expect(
      Number.isInteger(labId) && labId > 0,
      `自建打样申请必须回主键，实际 ${JSON.stringify(lab)}`
    ).toBe(true);
    deferCleanup(
      queue,
      'DELETE',
      `/production/lab-dip/requests/${labId}`,
      `lab-dip-request-${labId}`
    );
    const labRow = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/production/lab-dip/requests/${labId}`
    );
    const labNo = str(labRow.request_no ?? labRow.lab_dip_no ?? labRow.code);
    expect(
      labNo.length,
      `自建打样申请回读必须回显申请号列（候选 request_no/lab_dip_no/code 全空），实际 ${JSON.stringify(labRow)}`
    ).toBeGreaterThan(0);
    const labXml = await printDocxWithRealContent(
      page,
      `/color-cards/${labId}/lab-dip/print`,
      'lab_dip_request',
      labNo,
      queue
    );
    console.warn(`[447] 打样申请 ${labId} 打印正文长度 ${labXml.length}，含申请号 ${labNo}`);

    // 打印腿的取证对象由本用例自建：库内是否恰好存在定制订单不是可信前置。
    // 外键取 ensureTestEntities 备好的真实客户与产品（custom_orders 两列都是 NOT NULL 外键），
    // order_no 由服务端取号（CreateCustomOrderDto 无该字段），断言只认响应回显的真实单号。
    if (!ctx.productIds[0]) {
      throw new Error(
        `447-3 前置不成立：ensureTestEntities 未产出客户/产品外键（${JSON.stringify({
          customerId: ctx.customerId,
          productIds: ctx.productIds,
        })}），自建定制订单无从落库`
      );
    }
    const co = await apiCallRaw<Record<string, unknown>>(page, 'POST', '/custom-orders', {
      customer_id: ctx.customerId,
      product_id: ctx.productIds[0],
      color_id: ctx.productColorIds[0],
      spec: 'E2E 447 打印腿规格 40S 133x72 150cm',
      quantity: 300,
      unit: '米',
      notes: `E2E 447 打印腿自建单 ${genCode('P447CO')}`,
    });
    const coId = Number(co.id);
    expect(
      Number.isInteger(coId) && coId > 0,
      `自建定制订单必须回主键，实际 ${JSON.stringify(co)}`
    ).toBe(true);
    const orderNo = str(co.order_no);
    // 本用例不留清理动作：定制订单的终结腿是 DELETE /custom-orders/{id}，实为 cancel_custom_order
    // 且必须携带 reason 请求体，与本文件的延迟清理（无体）形状不兼容；行以唯一备注隔离，
    // 取消腿本身的契约归 custom-order 域用例覆盖。
    expect(
      orderNo.length,
      `建单响应必须回显服务端取号结果 order_no，实际 ${JSON.stringify(co)}`
    ).toBeGreaterThan(0);
    expect(
      str(co.status),
      '定制订单起点词值应为小写 draft（models/status/sales.rs 的 custom_order）'
    ).toBe('draft');
    await printDocxWithRealContent(
      page,
      `/custom-orders/${coId}/print`,
      'custom_order',
      orderNo,
      queue
    );

    await flushDeferredCleanups(page, queue);
  });

  test('447-4 导出脱敏按角色分面：admin 原文、业务员掩码并剔除 address 与成本列', async ({
    page,
  }) => {
    const queue: DeferredCleanup[] = [];
    // 前置由本用例自建：增强列表的行来自线索域（list_customers → list_leads → crm_lead::Model），
    // 电话键是 mobile_phone/tel_phone、邮箱键是 email，不是 customers/customer_contacts 的
    // contact_phone/contact_email；建单入参按 CreateLeadRequest 的契约字段名给（lead_source/lead_no
    // 由服务端取号与缺省补齐），库里是否恰好有带电话的行不是可信前置。
    // 写入腿必须与读回腿同域：/crm/customers 挂 customer_handler::create_customer
    //（入参 CreateCustomerRequest，唯一非 Option 必填是 customer_name），按线索字段名提交
    // company_name 会被判成缺必填而回 400 VALIDATION_ERROR；本腿读回走
    // /crm/customers/enhanced（线索域，键 mobile_phone/email），故写入也走 enhanced 腿，
    // 让返回的 lead id 与增强列表行 id 同源。
    const company = genName('P447CUST');
    const createdCust = await apiCallRaw<ContactRow>(page, 'POST', '/crm/customers/enhanced', {
      company_name: company,
      contact_name: `${company}联系人`,
      mobile_phone: '13800001234',
      tel_phone: '057488889999',
      email: 'e2e447pick@example.com',
      address: `${company}地址`,
    });
    const customerId = Number(createdCust.id);
    expect(
      Number.isInteger(customerId) && customerId > 0,
      `自建带电话客户必须返回整数主键，实际 ${JSON.stringify(createdCust['id'])}`
    ).toBe(true);
    // 按 keyword 定位自建行：LeadQuery.keyword 由服务下推到 company_name/contact_name/
    // mobile_phone/email 四列模糊匹配，用它才能与分页排序解耦地取到刚建的那一行。
    const adminRows = rowsOf(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/crm/customers/enhanced?page=1&page_size=50&keyword=${company}`
      ),
      '客户增强列表(admin)'
    );
    const withPhone = adminRows.find(r => Number(r.id) === customerId);
    expect(
      withPhone,
      `自建的带电话客户 ${customerId} 必须能在增强列表读回，否则脱敏分面无从取证`
    ).toBeTruthy();
    const rawPhone = str(withPhone!.mobile_phone);
    expect(rawPhone, `admin 侧 mobile_phone 必须是建单原文，实际 ${rawPhone}`).toBe('13800001234');
    expect(
      rawPhone.includes('****'),
      `admin 侧客户列表必须出电话原文，实际被掩码为 ${rawPhone}`
    ).toBe(false);
    const rawEmail = str(withPhone!.email);

    const clist = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', `/crm/customers/${customerId}/contacts`),
      '联系人列表(admin)'
    );
    expect(
      clist.every(r => !str(r.contact_phone ?? r.phone).includes('****')),
      `admin 侧 contacts 腿必须出电话原文（出现 **** 即与业务员分面串味），实际 ${JSON.stringify(clist.slice(0, 2))}`
    ).toBe(true);

    await loginAsRole(page, 'salesperson');
    const spRows = rowsOf(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/crm/customers/enhanced?page=1&page_size=50&keyword=${company}`
      ),
      '客户增强列表(业务员)'
    );
    const spRow = spRows.find(r => Number(r.id) === customerId);
    test.info().annotations.push({
      type: 'note',
      description: `业务员数据范围可能不含客户 ${customerId}；不可见时改断言列表整体不含该行（越权可见才是缺陷）`,
    });
    if (spRow) {
      const maskedPhone = str(spRow.mobile_phone);
      expect(
        /^\d{3}\*{4}\d{4}$/.test(maskedPhone),
        `业务员侧 mobile_phone 必须是 field_mask.rs 的前3+****+后4 形态，实际 ${maskedPhone}`
      ).toBe(true);
      expect(maskedPhone === rawPhone, '业务员侧不得等于 admin 原文').toBe(false);
      if (rawEmail.length > 0) {
        const maskedEmail = str(spRow.email);
        expect(
          /^[^*]+\*{3}@.+$/.test(maskedEmail),
          `业务员侧 email 必须是 field_mask.rs 的首字母+***@域名 形态，实际 ${maskedEmail}`
        ).toBe(true);
      }
      expect(
        'address' in spRow,
        `业务员侧 address 键必须被 mask_customer_pii_defaults 整键剔除（cust.rs），实际仍在外显`
      ).toBe(false);
    }

    const spContacts = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', `/crm/customers/${customerId}/contacts`),
      '联系人列表(业务员)'
    );
    expect(
      spContacts.every(r => {
        const p = str(r.contact_phone ?? r.phone);
        return p.length === 0 || /^\d{3}\*{4}\d{4}$/.test(p);
      }),
      `业务员侧 contacts 子端点必须与列表同分面出掩码（crm_customer_handler.rs 与客户列表共用 apply_customer_field_permission），实际 ${JSON.stringify(spContacts.slice(0, 2))}——出原文即读出口旁路`
    ).toBe(true);

    // 成本列分面的真实前置。发放列表的行级可见性由行级作用域决定：非 all 范围一律按
    // customers.owner_id = 操作人收敛（services/color_card_issue_service.rs 的
    // build_scoped_issue_find），库里既有客户都不归属业务员，条件断言等于让掩码面恒零行空转。
    // 所以归属客户必须由业务员自己建：归属列由服务端写成 created_by
    // （services/customer_ops/update.rs 的 build_customer_active_model 落
    // owner_id = args.created_by），业务员自建即本人归属，不需要再走认领或分配。
    // 写入腿必须是 /crm/customers（customer_handler::create_customer 写 customers 表）：
    // 上半段那枚 /crm/customers/enhanced 的 id 是线索实体 crm_lead 的主键，拿它当
    // customer_id 去发放，服务层按 customers 主键取行必然 404。
    const ownedCustomer = await apiCallRaw<{ id: unknown }>(page, 'POST', '/crm/customers', {
      customer_name: genName('P447SPCUST'),
      contact_person: '447业务员归属联系人',
      customer_type: 'retail',
      status: 'active',
      // 发放闸门 3 要求 customers.credit_limit > 0；本入参是数值字符串，缺省落 0
      credit_limit: '50000.00',
    });
    const ownedCustomerId = Number(ownedCustomer.id);
    expect(
      Number.isInteger(ownedCustomerId) && ownedCustomerId > 0,
      `业务员自建归属客户必须返回整数主键，实际 ${JSON.stringify(ownedCustomer.id)}`
    ).toBe(true);

    // 切回本 worker 的 admin 会话：发放与改判登记都属写面，业务员岗不持写键；
    // 靶卡与发放行由 admin 建，行级归属仍由上一段那枚客户的 owner_id 决定，与发放人无关。
    await loginViaUI(page, testUsername(), testPassword(), true);
    const issueTag = genName('P447ISSUE');
    const issueCard = await apiCallRaw<{ id: unknown; status: unknown }>(
      page,
      'POST',
      '/color-cards',
      {
        card_no: genCode('P447CC'),
        card_name: issueTag,
        card_type: 'CUSTOM',
      }
    );
    const cardId = Number(issueCard.id);
    expect(
      Number.isInteger(cardId) && cardId > 0,
      `发放靶卡必须返回整数主键，实际 ${JSON.stringify(issueCard)}`
    ).toBe(true);
    expect(
      str(issueCard.status),
      `新建靶卡必须是唯一可发放态 draft，实际 ${JSON.stringify(issueCard.status)}`
    ).toBe('draft');

    // 库存登记是发放闸门 2 的唯一入口（可用量口径 = stock_quantity - issued_quantity）；
    // 成败不信任写请求出参，一律以详情回读为准。
    await apiCall(page, 'PUT', `/color-cards/${cardId}`, { stock_quantity: 1 });
    const cardWithStock = await apiCallRaw<{ stock_quantity: unknown; issued_quantity: unknown }>(
      page,
      'GET',
      `/color-cards/${cardId}`
    );
    expect(
      Number(cardWithStock.stock_quantity),
      `库存登记必须落库为 1，实际 ${JSON.stringify(cardWithStock.stock_quantity)}`
    ).toBe(1);
    expect(
      Number(cardWithStock.issued_quantity),
      `登记库存不该改动已发放量，实际 ${JSON.stringify(cardWithStock.issued_quantity)}`
    ).toBe(0);

    // 发放：purpose 与 remark 都写入本用例标记，用于在库里定位残留行（依据见文末清理说明）。
    const issued = await apiCallRaw<{ id: unknown }>(page, 'POST', '/color-cards/issues', {
      color_card_id: cardId,
      customer_id: ownedCustomerId,
      issue_qty: 1,
      purpose: issueTag,
      remark: issueTag,
    });
    const issueId = Number(issued.id);
    expect(
      Number.isInteger(issueId) && issueId > 0,
      `登记库存后向归属客户发放应成功并回记录主键，实际 ${JSON.stringify(issued)}`
    ).toBe(true);

    // 成本值只有改判登记口会写。这里取损坏口而不是遗失口，依据是写入方的状态联动：
    // services/color_card_issue_service.rs 的 mark_lost 会把色卡本身也推成终态 lost，
    // 而色卡归档门对终态一律拒绝流转（color_card_crud_service.rs 的
    // validate_color_card_status_transition），清理链就断了；mark_damaged 只扣已发放量、
    // 不动色卡状态，靶卡仍可归档。两口都会把赔付额写进 compensation_amount。
    // 赔付额取大于 0 的定值，用于证明掩码是把非空值改成 null，而不是本来就没有值。
    const damagedRecord = await apiCallRaw<{ status: unknown; compensation_amount: unknown }>(
      page,
      'POST',
      `/color-cards/issues/${issueId}/damaged`,
      { compensation_amount: '8888.00', remark: issueTag }
    );
    expect(
      str(damagedRecord.status),
      `登记损坏后发放记录应进终态 damaged，实际 ${JSON.stringify(damagedRecord.status)}`
    ).toBe('damaged');
    expect(
      str(damagedRecord.compensation_amount).startsWith('8888'),
      `登记损坏的出参应带出赔付额原文（admin 旁路成本可见门），实际 ${JSON.stringify(
        damagedRecord.compensation_amount
      )}`
    ).toBe(true);

    // 原文面（admin 在两道门都短路、数据范围 all）必须看到非空成本。
    // 按 customer_id 筛行：admin 看全表，靠分页取第一页会把自建行挤出窗口。
    // 列表与详情是两条独立脱敏代码路径（list_issues 走 mask_cost_amount，
    // get_issue 走单条置 None），两道都断，任一道被改成恒空或恒原样都能被抓。
    const adminIssueRows = rowsOf(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/color-cards/issues?page=1&page_size=20&customer_id=${ownedCustomerId}`
      ),
      '色卡发放列表(admin)'
    );
    const adminIssueRow = adminIssueRows.find(r => Number(r.id) === issueId);
    expect(
      adminIssueRow,
      `admin 必须能在发放列表看到自建记录 ${issueId}，否则成本原文面无从取证；实际行 ${JSON.stringify(
        adminIssueRows.map(r => r.id)
      )}`
    ).toBeTruthy();
    expect(
      adminIssueRow!.compensation_amount !== null &&
        adminIssueRow!.compensation_amount !== undefined,
      `admin 侧列表的 compensation_amount 必须是登记后的原文（null 即成本列被误剔），实际 ${JSON.stringify(
        adminIssueRow!.compensation_amount
      )}`
    ).toBe(true);
    expect(
      str(adminIssueRow!.compensation_amount).startsWith('8888'),
      `admin 侧列表必须带出登记的赔付额，实际 ${JSON.stringify(adminIssueRow!.compensation_amount)}`
    ).toBe(true);
    const adminIssueDetail = await apiCallRaw<{ compensation_amount: unknown }>(
      page,
      'GET',
      `/color-cards/issues/${issueId}`
    );
    expect(
      str(adminIssueDetail.compensation_amount).startsWith('8888'),
      `admin 侧详情口的 compensation_amount 必须是原文，实际 ${JSON.stringify(
        adminIssueDetail.compensation_amount
      )}`
    ).toBe(true);

    // 掩码面：业务员岗持 color-cards:read、不持任何 export 键，读面过门、成本列必须被剔除
    await loginAsRole(page, 'salesperson');
    const spIssues = rowsOf(
      await apiCallRaw<unknown>(
        page,
        'GET',
        `/color-cards/issues?page=1&page_size=20&customer_id=${ownedCustomerId}`
      ),
      '色卡发放列表(业务员)'
    );
    expect(
      spIssues.some(r => Number(r.id) === issueId),
      `业务员名下客户的发放行必须可见，否则掩码面未被证明；实际行 ${JSON.stringify(
        spIssues.map(r => r.id)
      )}`
    ).toBe(true);
    const spIssueRow = spIssues.find(r => Number(r.id) === issueId);
    expect(
      spIssueRow!.compensation_amount,
      `业务员侧列表的 compensation_amount 必须按 mask_cost_amount 剔除为 null，实际 ${JSON.stringify(
        spIssueRow!.compensation_amount
      )}`
    ).toBeNull();
    const spIssueDetail = await apiCallRaw<{ compensation_amount: unknown }>(
      page,
      'GET',
      `/color-cards/issues/${issueId}`
    );
    expect(
      spIssueDetail.compensation_amount,
      `业务员侧详情口的 compensation_amount 必须同样剔除为 null（与列表是两条脱敏代码路径），实际 ${JSON.stringify(
        spIssueDetail.compensation_amount
      )}`
    ).toBeNull();

    // 客户导出面：init 矩阵里 customers 的动作只有 read、create、reveal 三枚，除通配岗外
    // 没有任何岗位持 customers:export，业务员本就打不开这个出口——原写法"业务员侧导出必须
    // 出掩码"的会话前置为假，它一直排在前面那道 403 之后从未真正执行过。
    // 这里先钉"导出面不是绕过权限门的旁路"：无键即 403 加 FORBIDDEN，拒绝不落任何出参。
    // 导出正文与列表掩码引擎的一致性属已知缺口（要证它必须先有一岗持 export 而不持 reveal，
    // 矩阵里不存在），不拿"能导出的岗位"凑这条判据。
    const spExportDenied = await apiCallExpectFail(
      page,
      'GET',
      '/crm/customers/export?page=1&page_size=50'
    );
    expectDenied(
      spExportDenied,
      '不持 customers:export 的业务员调用客户导出必须被权限门拒绝，导出面不得成为掩码旁路'
    );

    // 审计导出族走的是导出受理门，不是可直接下载的活出口：
    // export_approval_service.rs::enforce_export_download_secured 在 download_token 为空时
    // 直接 permission_denied，与岗位持不持有 audit-logs 键无关。这里钉两层：
    // 不持该域键的业务员被拒；持 audit-logs 通配行的 system_admin 无令牌同样被拒。
    // 两条同时成立才证明这个出口确有门管着，也不把它误当免令牌即可导出的面。
    const auditNoKey = await apiCallExpectFail(
      page,
      'GET',
      '/audit-logs/export?page=1&page_size=20'
    );
    expect(auditNoKey.status, '不持 audit-logs 键的业务员调用审计导出必须被拒').toBe(403);
    expect(failureCode(auditNoKey), '不持键调用审计导出的机器码').toBe(APP_ERROR_CODES.FORBIDDEN);

    await loginAsRole(page, 'system_admin');
    const auditNoToken = await apiCallExpectFail(
      page,
      'GET',
      '/audit-logs/export?page=1&page_size=20'
    );
    expect(auditNoToken.status, '持 audit-logs 通配键但无下载令牌同样必须被受理门拒').toBe(403);
    expect(failureCode(auditNoToken), '导出受理门拒绝的机器码').toBe(APP_ERROR_CODES.FORBIDDEN);
    // 已知缺口（另账登记，不在收红这一笔里凑判据）：走完令牌链路后的审计导出正文是否按 PII
    // 掩码无成文契约——审计快照要取证完整性、字段权限面要最小可见，属产品取舍要先定口径；
    // 令牌链路本身由本文件 447-5 在客户资源上覆盖，快照明文同族叙述见 crm_handler.rs。

    // 收尾（诚实口径，不造假清理腿）。发放记录族没有删除端点：route-snapshot.txt 的
    // color-cards 段里 issues 只有 GET 与 POST 两类挂载，service 侧的 is_deleted 只作读
    // 过滤、没有任何 DELETE 腿；而 returned / lost / damaged / cancelled 都是终态，终态上
    // 任何改判一律被状态门拒，所以 POST /issues/{id}/cancel 不能拿来清理本用例的损坏行。
    // 本用例的发放行按设计残留，定位方式就是它的 purpose 与 remark 里的 issueTag。
    // 清得动的只有靶卡与客户两族：色卡走归档腿（损坏口不动色卡状态，卡仍是 draft 可归档），
    // 客户走各自的删除腿。
    await loginViaUI(page, testUsername(), testPassword(), true);
    // 补钉客户导出面的第二层：该族同样走导出受理门
    // （enforce_export_download_secured 对空令牌直接 permission_denied，无岗位旁路），
    // 所以本分片会话这个持全键的管理员无令牌也拿不到 200。两条合起来才说明
    // 拒绝既来自 RBAC 键面也来自受理门，而不是"该端点无人管、只是本用例岗位没权限"。
    const adminExportNoToken = await apiCallExpectFail(
      page,
      'GET',
      '/crm/customers/export?page=1&page_size=50'
    );
    expect(adminExportNoToken.status, '无下载令牌的客户导出必须被受理门拒').toBe(403);
    expect(failureCode(adminExportNoToken), '客户导出受理门拒绝的机器码').toBe(
      APP_ERROR_CODES.FORBIDDEN
    );
    await apiCall(page, 'DELETE', `/color-cards/${cardId}`, {
      reason: `447 发放靶卡收尾 ${issueTag}`,
    });
    const archivedCard = await apiCallRaw<{ status: unknown }>(
      page,
      'GET',
      `/color-cards/${cardId}`
    );
    expect(
      str(archivedCard.status),
      `靶卡归档必须落库为 archived，否则清理链残留可发放卡，实际 ${JSON.stringify(
        archivedCard.status
      )}`
    ).toBe('archived');
    deferCleanup(
      queue,
      'DELETE',
      `/crm/customers/${ownedCustomerId}`,
      `447 业务员归属客户 ${ownedCustomerId}`
    );
    // 回收本用例自建的带电话客户行（增强路由的删除腿与建单腿同域），
    // 全部脱敏分面断言已消费完该句柄，晚于此处不再有读取点。
    deferCleanup(
      queue,
      'DELETE',
      `/crm/customers/enhanced/${customerId}`,
      `447 自建客户 ${customerId}`
    );
    await flushDeferredCleanups(page, queue);
  });

  test('447-5 导出审批令牌腿：pending 不可取令牌，批准后明文仅一次，换发与消费后复用一律 403', async ({
    page,
  }) => {
    const queue: DeferredCleanup[] = [];
    // estimated_rows=10 → 低风险 → 一级审批（assess_risk_level），一次 approve 即终审完成并签发令牌。
    // export_params 取空对象：客户导出腿实际读取的维度只有 keyword/customer_type/status，本用例下载
    // 不带任何筛选项，受理门把批准集合与请求集合逐维比对，批准侧多写一维即成差集。
    const created = await apiCallRaw<{ id: number; status?: string }>(
      page,
      'POST',
      '/export-approvals',
      {
        resource_type: 'customer',
        export_params: {},
        estimated_rows: 10,
        file_format: 'xlsx',
      }
    );
    const id = Number(created.id);
    expect(Number.isInteger(id) && id > 0, `创建导出审批申请必须回主键，实际 ${created.id}`).toBe(
      true
    );
    expect(str(created.status), '新建申请初始必须是 pending').toBe('pending');
    deferCleanup(queue, 'POST', `/export-approvals/${id}/cancel`, `export-approval-${id}`);

    // 状态门：pending 时令牌尚未签发，查看令牌必须被拒且点名当前状态，拒绝不得产生状态跃迁
    const pendingView = await apiCallExpectFail(page, 'GET', `/export-approvals/${id}/token-once`);
    expect(pendingView.status, 'pending 状态查看令牌必须 400').toBe(400);
    expect(pendingView.code, '状态门拒绝的机器码必须是 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const pendingMsg = str(pendingView.message);
    expect(pendingMsg.includes('仅已批准'), '拒绝原因必须点名仅已批准这道门').toBe(true);
    expect(pendingMsg.includes('pending'), '拒绝原因必须点名当前状态').toBe(true);
    expect(
      str(pendingView.trace_id).length,
      'AppError 单一失败信封必须带 trace_id'
    ).toBeGreaterThan(0);
    expect(
      pendingView.timestamp !== undefined && pendingView.timestamp !== null,
      'AppError 单一失败信封必须带 timestamp'
    ).toBe(true);
    const afterPendingView = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/export-approvals/${id}`
    );
    expect(str(afterPendingView.status), '取令牌被拒不产生状态跃迁').toBe('pending');

    // 一级审批通过：approve 代理到 BPM 待办任务，低风险流程在此即终审完成并签发令牌
    const approved = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/export-approvals/${id}/approve`,
      { comments: 'e2e447 一级审批通过' }
    );
    expect(str(approved.status), '一级审批通过后必须进入 approved').toBe('approved');
    expect(approved.download_token, '审批出参不得回显令牌明文').toBeNull();
    expect(approved.token_hash, '审批出参不得回显令牌哈希').toBeNull();

    const first = await apiCallRaw<{ available?: boolean; token?: string; fingerprint?: string }>(
      page,
      'GET',
      `/export-approvals/${id}/token-once`
    );
    expect(
      first.available,
      `首次 token-once 必须 available=true，实际 ${JSON.stringify(first)}`
    ).toBe(true);
    const plaintext = str(first.token);
    expect(plaintext.length, '首次 token-once 必须回明文令牌').toBeGreaterThan(0);

    const second = await page.request.get(fullUrl(`/export-approvals/${id}/token-once`));
    expect(second.status(), '二次 token-once 的路由必须注册（404 即死端点）').toBe(200);
    const secondJson = (await second.json()) as { data?: Record<string, unknown> };
    expect(
      secondJson.data?.available,
      `二次 token-once 必须 available=false（明文仅一次），实际 ${JSON.stringify(secondJson.data)}`
    ).toBe(false);
    expect(str(secondJson.data?.token).length, '二次 token-once 不得再携带 token 键的明文').toBe(0);
    const secondData = secondJson.data;
    expect(secondData, '二次 token-once 必须回 data 位').toBeTruthy();
    const hasTokenKey = Object.prototype.hasOwnProperty.call(secondData!, 'token');
    expect(hasTokenKey, '已查看分支不得再带 token 键').toBe(false);
    const secondText = JSON.stringify(secondJson);
    expect(
      secondText.includes(plaintext),
      '二次 token-once 的响应体里出现了首次明文令牌，一次性约束被击穿'
    ).toBe(false);

    const list = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/export-approvals?page=1&page_size=50'),
      '审批列表'
    );
    const row = list.find(r => Number(r.id) === id);
    expect(row, `列表必须含本申请 ${id}`).toBeTruthy();
    expect(row!.download_token, '列表 download_token 必须被 masked_json 置 null').toBeNull();
    expect(row!.token_hash, '列表 token_hash 必须被 masked_json 置 null').toBeNull();
    expect(JSON.stringify(row).includes(plaintext), '列表行里不得出现明文令牌').toBe(false);

    // 校验门只判定可消费性、不消费凭据：已批准且未消费的明文在此必须放行
    const checked = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/export-approvals/verify-token?token=${encodeURIComponent(plaintext)}`
    );
    expect(str(checked.status), '已批准未消费的令牌在校验门必须放行').toBe('approved');
    expect(checked.download_token, '校验门出参不得回显明文').toBeNull();
    expect(checked.token_hash, '校验门出参不得回显哈希').toBeNull();

    // 换发即作废旧明文：哈希列被整列替换，旧明文既不匹配哈希也不匹配明文回退分支
    const rotated = await apiCallRaw<{ available?: boolean; token?: string }>(
      page,
      'POST',
      `/export-approvals/${id}/rotate-token`
    );
    expect(rotated.available, '申请人本人重发令牌必须 available=true').toBe(true);
    const rotatedToken = str(rotated.token);
    expect(rotatedToken.length, '重发必须下发新的非空明文').toBeGreaterThan(0);
    expect(rotatedToken === plaintext, '重发必须换发新明文，旧明文不得沿用').toBe(false);
    const revoked = await apiCallExpectFail(
      page,
      'GET',
      `/export-approvals/verify-token?token=${encodeURIComponent(plaintext)}`
    );
    expect(revoked.status, '被换发作废的旧明文再用必须 403').toBe(403);
    expect(revoked.code, '作废令牌再用的机器码必须是 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 一次性消费由导出腿的 record_download 落终态（max_downloads 签发即为 1）
    await assertExportNotDeadEnd(
      page,
      `/crm/customers/export?download_token=${encodeURIComponent(rotatedToken)}`,
      '申请人本人持已批准令牌'
    );
    const readBack = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/export-approvals/${id}`
    );
    expect(str(readBack.status), '导出成功后申请必须落 consumed 终态').toBe('consumed');
    expect(readBack.token_consumed, '导出成功后消费标记必须已置真').toBe(true);

    // 消费成功后明文列与哈希列被清空，同一明文再也匹配不上任何一行——禁复用在此落地
    const consumedReuse = await apiCallExpectFail(
      page,
      'GET',
      `/export-approvals/verify-token?token=${encodeURIComponent(rotatedToken)}`
    );
    expect(consumedReuse.status, '消费后同一明文再用校验门必须 403').toBe(403);
    expect(consumedReuse.code, '消费后复用的机器码必须是 FORBIDDEN').toBe(
      APP_ERROR_CODES.FORBIDDEN
    );
    const secondExport = await apiCallExpectFail(
      page,
      'GET',
      `/crm/customers/export?download_token=${encodeURIComponent(rotatedToken)}`
    );
    expect(secondExport.status, '消费后再次导出必须 403').toBe(403);
    expect(secondExport.code, '再次导出的机器码必须是 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    const bogus = await apiCallExpectFail(
      page,
      'GET',
      '/export-approvals/verify-token?token=447-not-a-real-token'
    );
    expect(bogus.status, '不存在的令牌必须 403 而不是 500/404').toBe(403);
    expect(bogus.code, '不存在令牌的机器码必须是 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    // 一次性终态不可回退：已消费的申请取消被拒（该拒绝走脱敏 business，故只钉状态与机器码）
    const cancelReject = await apiCallExpectFail(page, 'POST', `/export-approvals/${id}/cancel`);
    expect(cancelReject.status, 'consumed 终态不可被取消改回在途').toBe(400);
    expect(cancelReject.code, '取消被拒的机器码必须是 BUSINESS_ERROR').toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );
    const afterCancel = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/export-approvals/${id}`
    );
    expect(str(afterCancel.status), '取消被拒不得改状态').toBe('consumed');

    // 取消只对在途申请放行；作废后的申请永远取不到令牌——这是状态机里「作废」的真实形态
    const secondReq = await apiCallRaw<{ id: number; status?: string }>(
      page,
      'POST',
      '/export-approvals',
      {
        resource_type: 'customer',
        export_params: {},
        estimated_rows: 10,
        file_format: 'xlsx',
      }
    );
    const secondId = Number(secondReq.id);
    expect(Number.isInteger(secondId) && secondId > 0, '第二枚申请必须回主键').toBe(true);
    deferCleanup(queue, 'POST', `/export-approvals/${secondId}/cancel`, `approval-${secondId}`);
    const cancelled = await apiCallRaw<Record<string, unknown>>(
      page,
      'POST',
      `/export-approvals/${secondId}/cancel`
    );
    expect(str(cancelled.status), '在途申请取消后必须落 cancelled').toBe('cancelled');
    const cancelledView = await apiCallExpectFail(
      page,
      'GET',
      `/export-approvals/${secondId}/token-once`
    );
    expect(cancelledView.status, '已作废申请查看令牌必须 400').toBe(400);
    expect(cancelledView.code, '已作废申请取不到令牌').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    await flushDeferredCleanups(page, queue);
  });

  test('447-6 print/export 家族死端点侦测：空壳与未注册一律判红', async ({ page }) => {
    const queue: DeferredCleanup[] = [];
    const probeName = genName('P447DEAD');
    const tpl = await apiCallRaw<{ id: number }>(page, 'POST', '/print-templates', {
      template_name: probeName,
      doc_type: 'sales_order',
      template_code: genCode('P447D'),
      content: '<html><body>dead-endpoint-probe</body></html>',
      is_default: false,
      status: 'active',
    });
    const tplId = Number(tpl.id);
    expect(Number.isInteger(tplId) && tplId > 0, '建探针模板必须回主键').toBe(true);
    deferCleanup(queue, 'DELETE', `/print-templates/${tplId}`, `probe-template-${tplId}`);

    const tplGet = await page.request.get(fullUrl(`/print-templates/${tplId}`));
    expect(
      tplGet.status(),
      `[死端点] GET /print-templates/${tplId} 返回 ${tplGet.status()}：刚创建的行取不到即路由未注册或处理器空转`
    ).toBe(200);
    const tplGetBody = await tplGet.body();
    expect(tplGetBody.byteLength, '[死端点] 模板对象口 200 但 0 字节，body 空壳').toBeGreaterThan(
      0
    );
    expect(
      str(
        (JSON.parse(tplGetBody.toString('utf8')) as { data?: Record<string, unknown> }).data
          ?.template_name
      ),
      '[死端点] 模板对象口 200 但 data.template_name 为空壳'
    ).toBe(probeName);

    const previewData = await apiCallRaw<unknown>(
      page,
      'POST',
      `/print-templates/${tplId}/preview`,
      {}
    );
    const previewText = JSON.stringify(previewData ?? null);
    expect(
      previewText.replace(/[\s{}"':,]/g, '').length,
      `[死端点] POST /print-templates/${tplId}/preview 的 data 是空壳（实际 ${previewText.slice(0, 120)}）`
    ).toBeGreaterThan(0);

    const coRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/custom-orders?page=1&page_size=5'),
      '定制订单列表'
    );
    const labRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/production/lab-dip/requests?page=1&page_size=5'),
      '打样申请列表'
    );
    const cardRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/color-cards?page=1&page_size=5'),
      '色卡列表'
    );
    const coId = Number(coRows[0]?.id);
    const labId = Number(labRows[0]?.id);
    const cardId = Number(cardRows[0]?.id);
    const scanLegs: Array<[string, string]> = [
      [`/custom-orders/${coId}/print`, '定制订单打印'],
      [`/color-cards/${labId}/lab-dip/print`, '打样申请打印'],
      ['/color-cards/issues/export?page=1&page_size=5', '色卡发放导出'],
      [`/color-cards/export/${cardId}`, '单张色卡导出'],
      ['/audit-logs/export?page=1&page_size=5', '审计日志导出'],
    ];
    for (const [path, label] of scanLegs) {
      const resp = await page.request.get(fullUrl(path));
      const status = resp.status();
      const body = await resp.body();
      expect(
        status,
        `[死端点] ${label} GET ${path} 返回 ${status}：500/502 是处理器空转，404 在该族只能是模板或行装配不出，均判缺陷`
      ).not.toBeGreaterThanOrEqual(500);
      expect(status, `[死端点] ${label} GET ${path} 返回 404，路由族空转`).not.toBe(404);
      if (status === 200) {
        expect(
          body.byteLength,
          `[死端点] ${label} GET ${path} 200 且 0 字节，空壳响应`
        ).toBeGreaterThan(0);
        const ctype = resp.headers()['content-type'] ?? '';
        if (ctype.includes('json')) {
          const env = JSON.parse(body.toString('utf8')) as { data?: unknown };
          expect(
            shellPayloadLength(env.data),
            `[死端点] ${label} GET ${path} 200 但 data 是空壳（实际 ${str(JSON.stringify(env.data)).slice(0, 120)}）`
          ).toBeGreaterThan(0);
        }
      }
      console.warn(`[447][死端点] ${label} ${path} -> ${status} ${body.byteLength}B`);
    }

    const issueRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/color-cards/issues?page=1&page_size=5'),
      '色卡发放列表(admin 前置)'
    );
    if (issueRows.length > 0) {
      await assertExportNotDeadEnd(page, '/color-cards/issues/export?page=1&page_size=20', 'admin');
    }
    await flushDeferredCleanups(page, queue);
  });
});
