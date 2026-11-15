/**
 * 497 色卡打印 docx 下载面：发放单与大货批色单两条打印腿的正向可达性、文档正文键值真测、
 * 无行单据的 404 信封形态，以及渲染列里不得出现成本类键的脱敏负断言。
 *
 * 调用面（backend/src/routes/color_card.rs 的打印段，nest 前缀 /api/v1/erp/color-cards）：
 *   GET /api/v1/erp/color-cards/{id}/issue/print         doc_type color_card_issue
 *   GET /api/v1/erp/color-cards/{id}/bulk-approval/print doc_type bulk_color_approval
 * 两条腿的 {id} 分别是 color_card_issue 与 bulk_color_approval 两表自己的主键，
 * 不是 color_cards 主键（services/print_service.rs 里两函数各自 find_by_id 自己的 Entity）。
 *
 * 出参形态（utils/docx_export.rs 的 docx_response 与 utils/response.rs 的 DOCX_CONTENT_TYPE）：
 * docx 即 zip 容器，content-type 为 wordprocessingml，下载名是 单据类型_本单主键.docx。
 *
 * 正文装配（services/print_service.rs 的 kv 装配段）：渲染数据按列名字典序排序后成对写进表格，
 * 字符串值原样写，非字符串走 JSON 字面量。因此本用例能按字典序断键次序，也能断种子值落进正文。
 *
 * 与 113 的分工：113 覆盖三张打印口在无行单据上的同码 404 与非法 doc_type 建模板被拒；
 * 本用例补的是"有行单据真的出得了 docx 且正文内容与库内行一致"这一面，两因同码的另一因
 * （缺启用默认模板）不在此断言，因为共享库里同 doc_type 的默认模板位不可假设。
 */
import { test, expect } from '../diagnose-fixture';
import type { APIResponse, Page } from '@playwright/test';
import JSZip from 'jszip';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
} from './helpers';

/**
 * 无行探测用的主键。取一个业务上不可能落到的大值，用来证明"该主键此刻无行"而不是猜库内空。
 * 与 113 同值同语义，两条腿共用同一把探针才有可比性。
 */
const ABSENT_PROBE_ID = 2_000_000_000;

/**
 * 发放单打印体里应当出现的渲染列全集，次序就是服务层排序后的落表次序。
 * 这份清单逐字段对着 services/print_service.rs 的 get_color_card_issue_print_data 抄下来：
 * 该函数在 return 前插完这八列就没有别的键，所以可以拿全等而不是包含来断。
 * 断全等的意义在于成本类列（进价、成本价）一旦被人加进渲染面，这里当场判红。
 */
const ISSUE_RENDER_KEYS = [
  'color_card_id',
  'customer_id',
  'dye_lot_no',
  'expected_return_date',
  'issue_qty',
  'issued_at',
  'purpose',
  'status',
];

interface PrintTemplateRow {
  id?: unknown;
  doc_type?: unknown;
  status?: unknown;
  is_default?: unknown;
}

const str = (v: unknown): string => String(v);
const toNum = (v: unknown): number => Number(String(v));
const printUrl = (path: string): string => `${API_BASE}${API_PREFIX}${path}`;

/**
 * 取 docx 容器里的正文文本。
 * 入参：打印响应的原始字节与本腿名字。传给谁：本用例内所有正文断言。
 * 存什么：不落盘，返回剥掉 XML 标签后的正文。
 * 存哪里：不存。条目缺失或解不开当场抛错，不返回空串把"没渲染出任何正文"咽成通过。
 */
async function docxBodyText(bytes: Buffer, leg: string): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  if (!entry) {
    throw new Error(`${leg} 的 docx 容器内不存在 word/document.xml，打印体不是可解开的 docx`);
  }
  return (await entry.async('string')).replace(/<[^>]*>/g, ' ');
}

/**
 * 断一次打印响应是真正的 docx 下载体。
 * 入参：响应对象、期望下载名、本腿名字。传给谁：两条正向打印腿。
 * 存什么：不落盘，返回解好的正文文本供上层继续做值断言。
 * 存哪里：不存。content-type 与 zip 首两字节与下载名三样缺一即判红，
 * 因为 JSON 错误体与空文件都能在"状态码 200"这一层混过去。
 */
async function assertDocxResponse(
  response: APIResponse,
  expectedFilename: string,
  leg: string
): Promise<string> {
  expect(response.status(), `${leg} 打印必须 200，实际 ${response.status()}`).toBe(200);
  const ctype = response.headers()['content-type'] ?? '';
  expect(ctype, `${leg} 的 content-type 必须是 docx 流，实际 ${ctype}`).toContain(
    'wordprocessingml'
  );
  const disposition = response.headers()['content-disposition'] ?? '';
  expect(
    disposition,
    `${leg} 的下载名必须含单据类型与本单主键，期望片段 ${expectedFilename}，实际 ${disposition}`
  ).toContain(expectedFilename);
  const bytes = await response.body();
  expect(
    bytes.byteLength,
    `${leg} 的 docx 体必须非空，实际 ${bytes.byteLength} 字节`
  ).toBeGreaterThan(0);
  expect(bytes[0], `${leg} 的 docx 首字节必须是 0x50，实际 ${bytes[0]}`).toBe(0x50);
  expect(bytes[1], `${leg} 的 docx 次字节必须是 0x4b，实际 ${bytes[1]}`).toBe(0x4b);
  return docxBodyText(bytes, leg);
}

/**
 * 建一张草稿色卡并把库存登记成 1。
 * 入参：page 与本用例唯一码。传给谁：发放单两条腿，发放门要求库存足量。
 * 存什么：提交 card_no 与 card_name 与 card_type，再经改档口登记 stock_quantity。
 * 存哪里：color_cards 一行，初态与两枚数量列都由服务端写，不假设库里有现成卡。
 */
async function seedCardWithStock(page: Page, tag: string): Promise<{ id: number; cardNo: string }> {
  const cardNo = `CC497${tag}`;
  const created = await apiCallRaw<{ id?: unknown; card_no?: unknown }>(
    page,
    'POST',
    '/color-cards',
    {
      card_no: cardNo,
      card_name: `497色卡${tag}`,
      card_type: 'PANTONE',
    }
  );
  const id = Number(created.id);
  expect(
    Number.isInteger(id) && id > 0,
    `建卡必须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  expect(str(created.card_no), `建卡回显卡号必须等于提交值，实际 ${str(created.card_no)}`).toBe(
    cardNo
  );

  await apiCall(page, 'PUT', `/color-cards/${id}`, { stock_quantity: 1 });
  const stocked = await apiCallRaw<{ stock_quantity?: unknown; issued_quantity?: unknown }>(
    page,
    'GET',
    `/color-cards/${id}`
  );
  expect(
    toNum(stocked.stock_quantity),
    `库存登记必须落库为 1，实际 ${str(stocked.stock_quantity)}`
  ).toBe(1);
  expect(
    toNum(stocked.issued_quantity),
    `登记库存不该改动已发放量，实际 ${str(stocked.issued_quantity)}`
  ).toBe(0);
  return { id, cardNo };
}

/**
 * 建一条本用例私有的启用默认打印模板。
 * 入参：page、doc_type、本用例唯一码。传给谁：两条正向打印腿的前置。
 * 存什么：doc_type 与 module 与默认位与启用态。
 * 存哪里：print_templates 一行。module 取本用例私有值，默认位只清同 module 的行，
 * 去抢别的模块已有的默认模板会把别人的用例改掉。
 */
async function createDefaultTemplate(page: Page, docType: string, tag: string): Promise<number> {
  const tpl = await apiCallRaw<PrintTemplateRow>(page, 'POST', '/print-templates', {
    template_name: `497${docType}模板${tag}`,
    template_code: genCode('TPL497'),
    doc_type: docType,
    module: `cc497_${tag}`,
    type: 'report',
    paper_size: 'A4',
    orientation: 'portrait',
    copies_default: 1,
    is_default: true,
    status: 'active',
  });
  const id = Number(tpl.id);
  expect(Number.isInteger(id) && id > 0, `模板建行必须回主键，实际 ${JSON.stringify(tpl)}`).toBe(
    true
  );
  expect(str(tpl.doc_type), `模板回显 doc_type 必须等于提交值，实际 ${str(tpl.doc_type)}`).toBe(
    docType
  );
  expect(str(tpl.status), `模板回显启用态必须为 active，实际 ${str(tpl.status)}`).toBe('active');
  expect(tpl.is_default === true, '模板回显默认位必须为真').toBe(true);
  return id;
}

test.describe('497 色卡打印 docx 下载面', () => {
  test.describe.configure({ mode: 'serial' });

  test('发放单打印出 docx 正文八列按字典序落表且种子用途与库内值逐条一致', async ({ page }) => {
    const tag = genCode('CC497A');
    const purposeTag = `497发放用途${tag}`;
    const { id: cardId } = await seedCardWithStock(page, tag);

    // 发放口有五道闸门，闸门 3 要客户信用额度为正、闸门 5 要客户状态逐字符等于 active，
    // 两道门被拒时出参都脱敏成同一枚 BUSINESS_ERROR，共用夹具的这两列不可假设，
    // 所以本用例自建客户并把两道门的输入读回自证，再拿这张客户去发放。
    const customer = await apiCallRaw<{ id?: unknown; status?: unknown; credit_limit?: unknown }>(
      page,
      'POST',
      '/crm/customers',
      {
        customer_name: `497发放客户${tag}`,
        contact_person: `497联系${tag}`,
        contact_phone: `139${Date.now().toString().slice(-8)}`,
        customer_type: 'retail',
        status: 'active',
        credit_limit: '50000.00',
      }
    );
    const customerId = Number(customer.id);
    expect(
      Number.isInteger(customerId) && customerId > 0,
      `建客户必须回真实主键，实际 ${JSON.stringify(customer)}`
    ).toBe(true);
    expect(
      str(customer.status),
      `发放闸门 5 的输入必须成立，客户状态须逐字符等于 active，实际 ${str(customer.status)}`
    ).toBe('active');
    expect(
      Number(customer.credit_limit) > 0,
      `发放闸门 3 的输入必须成立，客户信用额度须为正数，实际 ${str(customer.credit_limit)}`
    ).toBe(true);

    const issued = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/color-cards/issues', {
      color_card_id: cardId,
      customer_id: customerId,
      issue_qty: 1,
      purpose: purposeTag,
      remark: purposeTag,
    });
    const issueId = Number(issued.id);
    expect(
      Number.isInteger(issueId) && issueId > 0,
      `登记库存后向客户发放必须回记录主键，实际 ${JSON.stringify(issued)}`
    ).toBe(true);

    const row = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/color-cards/issues/${issueId}`
    );
    expect(
      toNum(row.color_card_id),
      `发放记录必须挂回本用例色卡，实际 ${str(row.color_card_id)} 期望 ${cardId}`
    ).toBe(cardId);
    expect(
      toNum(row.customer_id),
      `发放记录必须挂回本用例自建客户，实际 ${str(row.customer_id)} 期望 ${customerId}`
    ).toBe(customerId);
    expect(str(row.purpose), `发放用途必须原样落库，实际 ${str(row.purpose)}`).toBe(purposeTag);
    expect(toNum(row.issue_qty), `发放数量必须落库为 1，实际 ${str(row.issue_qty)}`).toBe(1);

    const tplId = await createDefaultTemplate(page, 'color_card_issue', tag);
    const body = await assertDocxResponse(
      await page.request.get(printUrl(`/color-cards/${issueId}/issue/print`)),
      `color_card_issue_${issueId}.docx`,
      '发放单'
    );

    const positions = ISSUE_RENDER_KEYS.map(key => {
      const at = body.indexOf(key);
      expect(at, `发放单渲染必须含列 ${key}，实际正文未出现该列名`).toBeGreaterThan(-1);
      return at;
    });
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i] > positions[i - 1],
        `列次序必须按字典序落表，${ISSUE_RENDER_KEYS[i - 1]} 之后应紧跟 ${ISSUE_RENDER_KEYS[i]}，实际位置 ${positions[i - 1]} 与 ${positions[i]}`
      ).toBe(true);
    }
    expect(
      body.includes(str(row.status)),
      `发放状态必须随渲染落进正文，实际状态 ${str(row.status)} 未出现`
    ).toBe(true);
    // 渲染侧把发放时刻按年月日投影落表，整串微秒时间戳不外显；
    // 断言取读回值的同一段投影，既不放宽成"正文非空"也不按整串硬碰。
    const issuedDate = str(row.issued_at).slice(0, 10);
    expect(
      /^\d{4}-\d{2}-\d{2}$/.test(issuedDate),
      `发放日期取号必须落在年月日投影上，实际读回 ${str(row.issued_at)}`
    ).toBe(true);
    expect(
      body.includes(issuedDate),
      `发放日期必须按年月日投影落进正文，实际正文未出现 ${issuedDate}，读回值 ${str(row.issued_at)}`
    ).toBe(true);
    expect(body).toContain(purposeTag);

    await apiCall(page, 'PUT', `/print-templates/${tplId}`, { status: 'inactive' });
    await apiCall(page, 'DELETE', `/print-templates/${tplId}`);
    const tplGone = await apiCallExpectFail(page, 'GET', `/print-templates/${tplId}`);
    expect(tplGone.status, `模板删除后按 id 回读必须 404，实际 ${tplGone.status}`).toBe(404);

    // 发放行没有删除口，收尾走损坏口把已发放量退回，色卡才可能归档；
    // 残留行靠 purpose 与 remark 里的本用例标记在库里定位，不假装删干净。
    // 自建客户同样留着：客户挂了真实发放行后硬删会被引用挡住还是软删未实量到，
    // 同目录的发放链用例只在全部被拒的腿上删过客户，不拿那条先例外推到这里。
    await apiCall(page, 'POST', `/color-cards/issues/${issueId}/damaged`, {
      remark: `497收尾损坏${tag}`,
    });
    await apiCall(page, 'PUT', `/color-cards/${cardId}`, { stock_quantity: 0 });
    // 归档口是携带请求体的删除方法：入参只有可选的归档原因一列，但抽取器要求合法 JSON 体，
    // 空体在请求体族被拒；归档是软状态跃迁不是行消失，所以读回断的是状态词而非 404。
    await apiCall(page, 'DELETE', `/color-cards/${cardId}`, { reason: `497收尾归档${tag}` });
    const archived = await apiCallRaw<{ status?: unknown }>(page, 'GET', `/color-cards/${cardId}`);
    expect(
      str(archived.status),
      `色卡归档后状态列必须逐字符等于写入方的归档词，实际 ${str(archived.status)}`
    ).toBe('archived');
  });

  test('两条打印腿对无行主键同码 404 且拒因走统一信封不外显内文', async ({ page }) => {
    const issueProbe = await apiCallExpectFail(
      page,
      'GET',
      `/color-cards/issues/${ABSENT_PROBE_ID}`
    );
    expect(
      issueProbe.status,
      `探测主键在发放表必须无行，有行说明探针值失效，实际 ${issueProbe.status}`
    ).toBe(404);
    const bulkProbe = await apiCallExpectFail(
      page,
      'GET',
      `/bulk-color-approvals/${ABSENT_PROBE_ID}`
    );
    expect(bulkProbe.status, `探测主键在批色表必须无行，实际 ${bulkProbe.status}`).toBe(404);

    const legs: Array<[string, string]> = [
      ['发放单', `/color-cards/${ABSENT_PROBE_ID}/issue/print`],
      ['批色单', `/color-cards/${ABSENT_PROBE_ID}/bulk-approval/print`],
    ];
    for (const [legName, path] of legs) {
      const response = await page.request.get(printUrl(path));
      expect(
        response.status(),
        `${legName}打印口对无行单据必须 404，实际 ${response.status()}`
      ).toBe(404);
      const envelope = await response.json();
      expect(
        failureCode(envelope),
        `${legName}拒绝必须走统一信封带字符串机器码，实际 ${JSON.stringify(envelope)}`
      ).toBe(APP_ERROR_CODES.NOT_FOUND);
      expect(
        typeof envelope.message === 'string' && envelope.message.length > 0,
        `${legName}信封的 message 必须是非空字符串，实际 ${JSON.stringify(envelope.message)}`
      ).toBe(true);
      expect(
        typeof envelope.trace_id === 'string' && envelope.trace_id.length > 0,
        `${legName}信封必须带非空 trace_id 供追溯，实际 ${JSON.stringify(envelope.trace_id)}`
      ).toBe(true);
      expect(
        typeof envelope.timestamp === 'number' && Number.isFinite(envelope.timestamp),
        `${legName}信封必须带秒级时间戳（契约是 i64 数字），实际 ${JSON.stringify(envelope.timestamp)}`
      ).toBe(true);
      expect(
        envelope.message,
        `${legName}外显文案必须是脱敏后的公共常量，不得回显内部查询语句，实际 ${str(envelope.message)}`
      ).not.toMatch(/SELECT|FROM|WHERE|color_card_issue \{/i);
    }
  });

  test('批色单打印出 docx 正文逐列取自本单读回值且与对象口一致', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.salesOrderId || !ctx.dyeBatchId || !ctx.customerId) {
      throw new Error('前置不成立：夹具未产出销售订单/染色批次/客户主键，无法自建批色单');
    }
    const tag = genCode('CC497B');

    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/bulk-color-approvals', {
      sales_order_id: ctx.salesOrderId,
      dye_batch_id: ctx.dyeBatchId,
      customer_id: ctx.customerId,
      remark: `497打印链批色单${tag}`,
    });
    const approvalId = Number(created.id);
    expect(
      Number.isInteger(approvalId) && approvalId > 0,
      `自建批色单必须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);

    const row = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/bulk-color-approvals/${approvalId}`
    );
    expect(toNum(row.id), `批色单对象口必须命中本单，实际 ${str(row.id)} 期望 ${approvalId}`).toBe(
      approvalId
    );

    const tplId = await createDefaultTemplate(page, 'bulk_color_approval', tag);
    const body = await assertDocxResponse(
      await page.request.get(printUrl(`/color-cards/${approvalId}/bulk-approval/print`)),
      `bulk_color_approval_${approvalId}.docx`,
      '批色单'
    );

    // 这几列是服务层对该 doc_type 必定插入的渲染键，列名缺失说明装配面漂移。
    for (const key of [
      'sales_order_id',
      'dye_batch_id',
      'customer_id',
      'color_no',
      'dye_lot_no',
      'batch_no',
      'sample_type',
      'approval_status',
      'approval_date',
      'customer_feedback',
      'delta_e_value',
    ]) {
      expect(body, `批色单渲染必须含列 ${key}，实际正文未出现该列名`).toContain(key);
    }

    // 色号 缸号 批次 样型 审批状态这几列有独立字符串值，取对象口真值逐条比对，
    // 空值不硬断（对象口回什么就渲染什么），非空却缺席才说明打印体没读到本单。
    for (const key of ['color_no', 'dye_lot_no', 'batch_no', 'sample_type', 'approval_status']) {
      const value = str(row[key] ?? '');
      if (value.length === 0 || value === 'null' || value === 'undefined') {
        continue;
      }
      expect(body, `批色单正文必须含 ${key} 的库内真值 ${value}`).toContain(value);
    }
    expect(
      body,
      `批色单正文必须把本单的销售订单主键渲染进去，期望 ${str(ctx.salesOrderId)}`
    ).toContain(str(ctx.salesOrderId));

    await apiCall(page, 'PUT', `/print-templates/${tplId}`, { status: 'inactive' });
    await apiCall(page, 'DELETE', `/print-templates/${tplId}`);
    await apiCall(page, 'DELETE', `/bulk-color-approvals/${approvalId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/bulk-color-approvals/${approvalId}`);
    expect(gone.status, `批色单删除后按 id 回读必须 404，实际 ${gone.status}`).toBe(404);
  });
});
