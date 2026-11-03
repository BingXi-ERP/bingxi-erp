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
 * - GET `/crm/customers`、GET `/crm/customers/enhanced`、GET `/crm/customers/{id}/contacts`、
 *   GET `/crm/customers/export`、GET `/color-cards/issues`、GET `/color-cards/issues/export`、
 *   GET `/audit-logs/export`；
 * - POST `/export-approvals`、GET `/export-approvals`、GET `/export-approvals/{id}/token-once`、
 *   GET `/export-approvals/verify-token`、POST `/export-approvals/{id}/cancel`。
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
 *   的空断言。`/crm/customers/enhanced` 的出参是手写分页壳 `{data,total,page,page_size}`
 *   （`list_leads`），承载键由 `crm-enhanced.ts` 的 `CustomerPage` 与 `check-api-envelope.mjs` 共同确认。
 * - `services/color_card_issue_service.rs` 的 `mask_cost_amount`：`handlers/color_card/issue.rs`
 *   在 `can_view_cost` 为假时把 `compensation_amount` 置 None（成本列剔除而非掩码，与 PII 列又是第三种形态）。
 *
 * 一次性令牌的事实来源：`handlers/export_approval_handler.rs` 的 `view_token_once` 首次回
 * `{available:true,token:<明文>}`，之后只回 `{available:false,fingerprint,message}` 且不再携带明文；
 * `services/export_approval_service.rs` 的 `verify_download_token` 走
 * `assert_token_consumable`，状态非 APPROVED 或已消费一律 `AppError::permission_denied`（HTTP 403 +
 * 机器码 FORBIDDEN）；同文件的 `masked_json` 把列表与详情的
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

    // 负例载荷必须与正例同样合法（cups + queue_name），否则它会因"缺连接字段"被拒，
    // 把唯一性断言变成对不上判据对象的假绿。
    const dup = await apiCallExpectFail(page, 'POST', '/print-targets', {
      target_code: targetCode,
      display_name: displayName,
      kind: 'cups',
      queue_name: 'print447',
    });
    expect(
      [400, 409].includes(dup.status),
      `同 target_code 重建必须被唯一性拒绝（本用例刚删同一行，若 200 说明删除只软删未释放唯一键），实际 ${dup.status}`
    ).toBe(true);
    expect(failureCode(dup), `唯一性拒绝的机器码应为 BAD_REQUEST，实际 ${dup.code}`).toBe(
      APP_ERROR_CODES.BAD_REQUEST
    );
    expect(
      str(dup.message).includes('目标编码已存在'),
      `拒绝原因必须是编码唯一性而不是缺连接字段，实际文案 ${str(dup.message)}`
    ).toBe(true);
    await flushDeferredCleanups(page, queue);
  });

  test('447-3 两枚单据打印腿真内容：docx 正文必须带出打样申请号与定制订单号', async ({ page }) => {
    const queue: DeferredCleanup[] = [];

    const labRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/production/lab-dip/requests?page=1&page_size=20'),
      '打样申请列表'
    );
    expect(labRows.length, '测试库必须至少有一条打样申请，否则打印腿无从取证').toBeGreaterThan(0);
    const labId = Number(labRows[0].id);
    const labNo = str(labRows[0].request_no ?? labRows[0].lab_dip_no ?? labRows[0].code);
    expect(Number.isInteger(labId) && labId > 0, `打样申请主键非法：${labRows[0].id}`).toBe(true);
    expect(
      labNo.length,
      `打样申请列表未回显申请号列（候选 request_no/lab_dip_no/code 全空），无法做真内容断言`
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
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.customerId || !ctx.productIds[0]) {
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
    const adminRows = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/crm/customers/enhanced?page=1&page_size=50'),
      '客户增强列表(admin)'
    );
    const withPhone = adminRows.find(
      r => str(r.contact_phone).length > 0 || str(r.phone).length > 0
    ) as ContactRow | undefined;
    expect(withPhone, '测试库必须有带电话的客户行，否则脱敏分面无从取证').toBeTruthy();
    const customerId = Number(withPhone!.id);
    const rawPhone = str(withPhone!.contact_phone ?? withPhone!.phone);
    expect(
      rawPhone.includes('****'),
      `admin 侧客户列表必须出电话原文，实际被掩码为 ${rawPhone}`
    ).toBe(false);
    const rawEmail = str(withPhone!.contact_email ?? withPhone!.email);

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
      await apiCallRaw<unknown>(page, 'GET', '/crm/customers/enhanced?page=1&page_size=50'),
      '客户增强列表(业务员)'
    );
    const spRow = spRows.find(r => Number(r.id) === customerId);
    test.info().annotations.push({
      type: 'note',
      description: `业务员数据范围可能不含客户 ${customerId}；不可见时改断言列表整体不含该行（越权可见才是缺陷）`,
    });
    if (spRow) {
      const maskedPhone = str(spRow.contact_phone ?? spRow.phone);
      expect(
        /^\d{3}\*{4}\d{4}$/.test(maskedPhone),
        `业务员侧 contact_phone 必须是 field_mask.rs 的前3+****+后4 形态，实际 ${maskedPhone}`
      ).toBe(true);
      expect(maskedPhone === rawPhone, '业务员侧不得等于 admin 原文').toBe(false);
      if (rawEmail.length > 0) {
        const maskedEmail = str(spRow.contact_email ?? spRow.email);
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

    const spIssues = rowsOf(
      await apiCallRaw<unknown>(page, 'GET', '/color-cards/issues?page=1&page_size=20'),
      '色卡发放列表(业务员)'
    );
    if (spIssues.length > 0) {
      expect(
        spIssues.every(r => r.compensation_amount === null || r.compensation_amount === undefined),
        `业务员侧 compensation_amount 必须按 issue.rs 置 None（成本列剔除），实际存在非空值`
      ).toBe(true);
    }

    const spExport = await assertExportNotDeadEnd(
      page,
      '/crm/customers/export?page=1&page_size=50',
      '业务员'
    );
    expect(
      spExport.includes(rawPhone),
      `业务员侧 /crm/customers/export 出参含电话原文 ${rawPhone}，导出腿绕过了列表掩码`
    ).toBe(false);

    const spAuditExport = await assertExportNotDeadEnd(
      page,
      '/audit-logs/export?page=1&page_size=20',
      '业务员'
    );
    expect(spAuditExport.length, '业务员侧 /audit-logs/export 正文长度必须大于 0').toBeGreaterThan(
      0
    );

    expect(
      spAuditExport.includes(rawPhone),
      `业务员侧 /audit-logs/export 出参含客户电话原文 ${rawPhone}，审计导出腿未做同款掩码`
    ).toBe(false);
  });

  test('447-5 导出审批一次性令牌：二次查看不漏明文，未授权与作废令牌再用一律 403+FORBIDDEN', async ({
    page,
  }) => {
    const queue: DeferredCleanup[] = [];
    const created = await apiCallRaw<{ id: number; status?: string }>(
      page,
      'POST',
      '/export-approvals',
      {
        resource_type: 'customer',
        export_params: { page: 1, page_size: 10, scene: 'e2e447' },
        estimated_rows: 10,
        file_format: 'csv',
      }
    );
    const id = Number(created.id);
    expect(Number.isInteger(id) && id > 0, `创建导出审批申请必须回主键，实际 ${created.id}`).toBe(
      true
    );
    deferCleanup(queue, 'POST', `/export-approvals/${id}/cancel`, `export-approval-${id}`);

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

    const pendingVerify = await apiCallExpectFail(
      page,
      'GET',
      `/export-approvals/verify-token?token=${encodeURIComponent(plaintext)}`
    );
    expect(
      pendingVerify.status,
      `未批准的令牌用 verify-token 消费必须 403（状态非 APPROVED），实际 ${pendingVerify.status}`
    ).toBe(403);
    expect(pendingVerify.code, '失败体机器码必须是字符串 FORBIDDEN').toBe(
      APP_ERROR_CODES.FORBIDDEN
    );
    expect(
      str(pendingVerify.trace_id).length,
      'AppError 单一失败信封必须带 trace_id'
    ).toBeGreaterThan(0);
    expect(
      pendingVerify.timestamp !== undefined && pendingVerify.timestamp !== null,
      'AppError 单一失败信封必须带 timestamp'
    ).toBe(true);

    const bogus = await apiCallExpectFail(
      page,
      'GET',
      '/export-approvals/verify-token?token=447-not-a-real-token'
    );
    expect(bogus.status, '不存在的令牌必须 403 而不是 500/404').toBe(403);
    expect(bogus.code, '不存在令牌的机器码必须是 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);

    await apiCall(page, 'POST', `/export-approvals/${id}/cancel`, {
      comments: 'e2e447 作废后复用取证',
    });
    const reuse = await apiCallExpectFail(
      page,
      'GET',
      `/export-approvals/verify-token?token=${encodeURIComponent(plaintext)}`
    );
    expect(
      reuse.status,
      `已作废申请的同一令牌再用必须被拒（403），实际 ${reuse.status}——200 即一次性约束失守`
    ).toBe(403);
    expect(reuse.code, '作废后复用失败的机器码必须是 FORBIDDEN').toBe(APP_ERROR_CODES.FORBIDDEN);
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
