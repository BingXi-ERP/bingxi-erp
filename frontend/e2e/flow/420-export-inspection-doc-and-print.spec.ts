import { test, expect } from '../diagnose-fixture';
import JSZip from 'jszip';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  type ApiFailureBody,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectDenied,
  failureCode,
  loginAsRole,
  loginViaUI,
} from './helpers';

/**
 * 420 出口商检建单、单证通道与打印链（export-inspections 资源族）
 *
 * 端点与实现位置（挂载 backend/src/routes/export_inspection_routes.rs，前缀 /api/v1/erp/export-inspections）：
 * - POST /export-inspections 建单，handlers/export_inspection_handler.rs::create_inspection，
 *   入参形状 handler::CreateInspectionBody（inspection_no、sales_order_id、product_name、hs_code、
 *   inspection_type、inspection_agency、inspection_date 必填，delivery_id 与 remarks 可选），
 *   请求体不承载 result 与 created_by（services/export_inspection_service.rs::create 恒落
 *   词表 export_inspection_result::PENDING，建单人取 AuthContext.user_id）。
 * - GET /export-inspections/{id} 单条读回，handler::get_inspection，出参是 ApiResponse 信封，
 *   data 键名逐列来自 models/export_inspection.rs::Model（snake_case，17 列）。
 * - GET /export-inspections?inspection_no=&page=&page_size= 列表，handler::list_inspections，
 *   data 为 PaginatedResponse{items,total,page,page_size}，page 与 page_size 回显入参。
 * - GET /export-inspections/{id}/certificates 单证列表，handlers/certificate_of_origin_handler.rs::
 *   list_certificates，出参是裸 {items,total}（无 code 信封），键名来自 models/certificate_of_origin.rs。
 * - GET /export-inspections/certificates/{id} 单证详情，handler::get_certificate，出参裸模型对象。
 * - GET /export-inspections/{id}/print 与 GET /export-inspections/certificates/{id}/print
 *   打印出件，handlers/print_handler.rs::render_print_docx（先装配打印数据
 *   services/print_service.rs::get_export_inspection_print_data，再取启用且默认的模板行
 *   handlers/print_task_handler.rs::load_active_default_template，无行 404）。
 * - 模板管理 POST/PUT/DELETE /print-templates，供本用例自建私有 module 的启用默认模板，
 *   使打印口的模板装配分支可判定（共享库该 doc_type 模板有无不可假设）。
 *
 * 鉴权判据（middleware/permission.rs::extract_resource_info 按 URL 段推导，与 handler 声明无关）：
 * 本族 seg3=export-inspections 是直接资源（services/init_service.rs::PERMISSION_RESOURCES 在册），
 * 因此列表、单条、单证两族通道共用资源键 export-inspections，动作由方法或末段推导
 * （GET=read、POST=create、末段 print=print）。services/init_service_ops/permission.rs 里
 * customer_service 岗位只有 crm-leads 分组，无 export-inspections 任何动作键，用作拒绝侧岗位；
 * sales_rep 只读，customs_specialist 才有建单权（CI 不建该岗，建单侧由分片 admin 承担）。
 * 拒因必须是统一失败信封（字符串 code 加 message 加 trace_id 加 timestamp），不判数字 code。
 *
 * 状态词表唯一事实来源是写入方 models/status/export_inspection.rs::export_inspection_result，
 * 小写三值 pending、pass、fail，比较点逐字符相同（区别于 quality_inspection_records 的中文四值结论）。
 * 本域没有删除端点，测试数据留在表里，断言一律按自建行主键与唯一单号命中，不读他人的行、不断全库 total。
 */

/** export_inspection::Model 的整行 snake_case 键（列序与 models/export_inspection.rs 一致）。 */
type InspectionRow = {
  id: number;
  inspection_no: string;
  sales_order_id: number;
  delivery_id: number | null;
  product_name: string;
  hs_code: string;
  inspection_type: string;
  inspection_agency: string;
  inspection_date: string;
  result: string;
  report_url: string | null;
  certificate_no: string | null;
  certificate_expiry: string | null;
  remarks: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

/** certificate_of_origin::Model 的整行键（列序与 models/certificate_of_origin.rs 一致，Decimal 列出参为字符串）。 */
type CertificateRow = {
  id: number;
  certificate_no: string;
  inspection_id: number | null;
  product_name: string;
  hs_code: string;
  origin_country: string;
  destination_country: string;
  quantity: string;
  unit: string;
  invoice_amount: string | null;
  certificate_type: string;
  issue_date: string;
  expiry_date: string | null;
  status: string;
  remarks: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
};

/** certificate_of_origin_handler::list_certificates 的裸出参形状（无 ApiResponse 信封）。 */
type CertificateListBody = {
  items: CertificateRow[];
  total: number;
};

/** list_inspections 的 data（utils/response.rs::PaginatedResponse）。 */
type InspectionPageBody = {
  items: InspectionRow[];
  total: number;
  page: number;
  page_size: number;
};

/** print_template 行的本用例所需键。 */
type PrintTemplateRow = {
  id: number;
  doc_type: string;
  module: string;
  status: string;
  is_default: boolean;
};

/** 越界哨兵主键：与 export_inspection.id 与 certificate_of_origin.id 的实际取值区间不相交。 */
const ABSENT_PROBE_ID = 2000000000;

/** 商检单的 sales_order_id 是 INTEGER 且无外键约束，取私有段哨兵值，不引用他人在途订单。 */
const SENTINEL_SALES_ORDER_ID = 990011;

const printUrl = (path: string): string => `${API_BASE}${API_PREFIX}${path}`;

function uniq(tagPrefix: string): string {
  return tagPrefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 解出 docx（zip 容器）正文文本。
 * word/document.xml 是 docx 渲染结果的载体，deflate 压缩使明文子串搜索不可用，必须解容器。
 * 条目缺失即抛错（fail-visible），不返回空串把"没渲染出任何正文"咽成通过。
 */
async function docxPlainText(body: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(body);
  const entry = zip.file('word/document.xml');
  if (!entry) {
    throw new Error('docx 容器内不存在 word/document.xml，打印体不是可解开的 docx 文档');
  }
  const xml = await entry.async('string');
  return xml.replace(/<[^>]*>/g, ' ');
}

/** 统一失败信封三要素判据：trace_id 与 timestamp 必须存在，message 必须是非空字符串。 */
function assertFailureEnvelope(body: ApiFailureBody, context: string): void {
  expect(
    typeof body.message === 'string' && body.message.length > 0,
    `${context}，message 必须是非空字符串，实际 ${JSON.stringify(body.message)}`
  ).toBe(true);
  expect(
    typeof body.trace_id === 'string' && body.trace_id.length > 0,
    `${context}，trace_id 必须是服务端回填的非空字符串，实际 ${JSON.stringify(body.trace_id)}`
  ).toBe(true);
  expect(
    body.timestamp !== undefined && body.timestamp !== null,
    `${context}，timestamp 必须存在，实际 ${JSON.stringify(body.timestamp)}`
  ).toBe(true);
}

/** 建一张待检态商检单（唯一单号，返回落库整行）。 */
async function seedInspection(
  page: import('@playwright/test').Page,
  tag: string
): Promise<InspectionRow> {
  return apiCallRaw<InspectionRow>(page, 'POST', '/export-inspections', {
    inspection_no: `E2E420EI${tag}`,
    sales_order_id: SENTINEL_SALES_ORDER_ID,
    product_name: `E2E 出口商检面料 ${tag}`,
    hs_code: '5209210000',
    inspection_type: 'PRE_EXPORT',
    inspection_agency: 'E2E 商检机构',
    inspection_date: '2026-09-15',
    remarks: `420 建单备注 ${tag}`,
  });
}

test.describe.serial('420 出口商检建单、单证通道与打印链', () => {
  test.beforeEach(async ({ page }) => {
    // force 重登，取回本 worker 的分片 admin 会话（用例内会切到受限岗位，必须逐条用例复位）
    await loginViaUI(page, undefined, undefined, true);
  });

  test('建单后按主键独立读回逐列比对，整列键名取 models/export_inspection.rs 的 snake_case', async ({
    page,
  }) => {
    const tag = uniq('');
    const created = await seedInspection(page, tag);
    const id = Number(created.id);
    expect(
      Number.isInteger(id) && id > 0,
      `建单必须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);

    // 写接口回显即服务端派生值：结论恒落词表 pending，证书三列未补录为 NULL，建单人取会话。
    expect(created.result, `建单结论必须逐字符落词表 pending，实际 ${String(created.result)}`).toBe(
      'pending'
    );
    expect(created.report_url, '建单 report_url 必须为 NULL').toBeNull();
    expect(created.certificate_no, '建单 certificate_no 必须为 NULL').toBeNull();
    expect(created.certificate_expiry, '建单 certificate_expiry 必须为 NULL').toBeNull();
    expect(
      Number.isInteger(Number(created.created_by)) && Number(created.created_by) > 0,
      `created_by 必须取会话用户 id 整数，实际 ${String(created.created_by)}`
    ).toBe(true);

    // 独立通道按主键读回，逐列比对提交值，证明落库而非仅写接口回显。
    const got = await apiCallRaw<InspectionRow>(page, 'GET', `/export-inspections/${id}`);
    expect(Number(got.id), `按主键读回的 id 必须等于建单主键 ${id}，实际 ${String(got.id)}`).toBe(
      id
    );
    expect(got.inspection_no, '商检单号必须原样读回').toBe(`E2E420EI${tag}`);
    expect(
      got.sales_order_id,
      `哨兵订单号必须原样落库读回，实际 ${String(got.sales_order_id)}`
    ).toBe(SENTINEL_SALES_ORDER_ID);
    expect(got.delivery_id, '未提交 delivery_id 必须为 NULL，实际落值即判红').toBeNull();
    expect(got.product_name, '品名必须原样读回，禁止落库侧改写').toBe(`E2E 出口商检面料 ${tag}`);
    expect(got.hs_code, `HS 编码必须逐字符读回，实际 ${got.hs_code}`).toBe('5209210000');
    expect(got.inspection_type, `检验类型必须原样读回，实际 ${got.inspection_type}`).toBe(
      'PRE_EXPORT'
    );
    expect(got.inspection_agency, `商检机构必须原样读回，实际 ${got.inspection_agency}`).toBe(
      'E2E 商检机构'
    );
    expect(got.inspection_date, `商检日期必须读回提交值，实际 ${String(got.inspection_date)}`).toBe(
      '2026-09-15'
    );
    expect(got.result, `按主键读回结论仍须是 pending，实际 ${got.result}`).toBe('pending');
    expect(got.remarks, `备注必须原样读回，实际 ${String(got.remarks)}`).toBe(
      `420 建单备注 ${tag}`
    );
    expect(
      Number.isFinite(Date.parse(got.created_at)) && Number.isFinite(Date.parse(got.updated_at)),
      `审计时间戳必须由服务端落库且可解析，实际 ${got.created_at} 与 ${got.updated_at}`
    ).toBe(true);

    // 列表通道按单号包含匹配命中本行，分页键回显入参（utils/response.rs::PaginatedResponse 契约）。
    const page1 = await apiCallRaw<InspectionPageBody>(
      page,
      'GET',
      `/export-inspections?inspection_no=${encodeURIComponent(`E2E420EI${tag}`)}&page=1&page_size=20`
    );
    expect(
      Array.isArray(page1.items),
      `列表 data.items 必须是数组，实际 ${JSON.stringify(page1)}`
    ).toBe(true);
    expect(page1.items.length, `本行必须被单号过滤命中，实际命中 ${page1.items.length} 行`).toBe(1);
    expect(
      page1.items[0].id,
      `列表命中行的主键必须等于建单主键，实际 ${String(page1.items[0].id)}`
    ).toBe(id);
    expect(
      page1.items[0].inspection_no.includes(`E2E420EI${tag}`),
      `单号过滤必须是包含匹配语义，实际 ${page1.items[0].inspection_no}`
    ).toBe(true);
    expect(Number(page1.total), `列表 total 必须命中 1 行，实际 ${String(page1.total)}`).toBe(1);
    expect(Number(page1.page), '列表必须回显收到的 page 入参').toBe(1);
    expect(Number(page1.page_size), '列表必须回显收到的 page_size 入参').toBe(20);
  });

  test('单证列表与详情通道真实可达，打印腿取到含本单商检单号的 docx 正文', async ({ page }) => {
    const tag = uniq('');
    const created = await seedInspection(page, tag);
    const id = Number(created.id);
    const inspectionNo = created.inspection_no;

    // 单证列表通道：handler 出裸 {items,total}，不带 ApiResponse 的 code 信封（键名以 handler 为准）。
    const certListResp = await page.request.get(
      printUrl(`/export-inspections/${id}/certificates?page=1&page_size=20`)
    );
    expect(certListResp.status(), `本单产地证列表通道必须 200，实际 ${certListResp.status()}`).toBe(
      200
    );
    const certList = (await certListResp.json()) as CertificateListBody & { code?: unknown };
    expect(
      'code' in certList === false,
      `产地证列表是裸 {items,total} 出参，出现 code 键说明信封形状与 handler 不一致，实际 ${JSON.stringify(
        certList
      )}`
    ).toBe(true);
    expect(
      Array.isArray(certList.items),
      `产地证 items 必须是数组，实际 ${typeof certList.items}`
    ).toBe(true);
    expect(
      typeof certList.total === 'number',
      `产地证 total 必须是数字，实际 ${typeof certList.total}`
    ).toBe(true);
    expect(
      certList.items.every(row => Number(row.inspection_id) === id),
      `返回的每一行都必须挂在本商检单下，实际 ${JSON.stringify(certList.items.map(r => r.inspection_id))}`
    ).toBe(true);

    // 产地证详情与打印通道对不存在主键必须按统一信封拒绝（路由已挂载且取数段落真实执行）。
    const absentCert = await apiCallExpectFail(
      page,
      'GET',
      `/export-inspections/certificates/${ABSENT_PROBE_ID}`
    );
    expect(absentCert.status, `不存在的产地证按 id 取详情必须 404，实际 ${absentCert.status}`).toBe(
      404
    );
    expect(failureCode(absentCert), `不存在产地证的机器码必须是 NOT_FOUND`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    assertFailureEnvelope(absentCert, '不存在产地证的详情拒绝必须走统一失败信封');

    const absentCertPrint = await page.request.get(
      printUrl(`/export-inspections/certificates/${ABSENT_PROBE_ID}/print`)
    );
    expect(
      absentCertPrint.status(),
      `不存在产地证的打印口必须 404（无行的单据在取数段即拒），实际 ${absentCertPrint.status()}`
    ).toBe(404);
    const absentCertPrintBody = (await absentCertPrint.json()) as ApiFailureBody;
    expect(failureCode(absentCertPrintBody), `不存在产地证打印口的机器码必须是 NOT_FOUND`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
    assertFailureEnvelope(absentCertPrintBody, '不存在产地证的打印拒绝必须走统一失败信封');

    // 自建私有 module 的启用默认模板，让本单打印口的模板装配分支可判定（不假设共享库存量模板）。
    const tplCode = `EI420TPL${tag}`;
    const tpl = await apiCallRaw<PrintTemplateRow>(page, 'POST', '/print-templates', {
      template_name: `出口商检打印模板${tag}`,
      template_code: tplCode,
      doc_type: 'export_inspection',
      module: `ei420_${tag}`,
      type: 'report',
      paper_size: 'A4',
      orientation: 'portrait',
      copies_default: 1,
      is_default: true,
      status: 'active',
    });
    const tplId = Number(tpl.id);
    expect(
      Number.isInteger(tplId) && tplId > 0,
      `打印模板建行必须回主键，实际 ${JSON.stringify(tpl)}`
    ).toBe(true);
    expect(tpl.doc_type, '模板回显 doc_type 必须等于提交值').toBe('export_inspection');
    expect(tpl.status, '模板回显 status 必须为 active').toBe('active');
    expect(tpl.is_default === true, '模板回显默认位必须为真').toBe(true);

    // 打印腿真实取体并解容器，断到能证明内容归属本单证的字段（商检单号与品名），不判 200 即健康。
    const printResp = await page.request.get(printUrl(`/export-inspections/${id}/print`));
    expect(printResp.status(), `本单打印口必须 200，实际 ${printResp.status()}`).toBe(200);
    const ctype = printResp.headers()['content-type'] ?? '';
    expect(
      ctype.includes('wordprocessingml'),
      `打印出参 content-type 必须是 docx 流，实际 ${ctype}`
    ).toBe(true);
    const disposition = printResp.headers()['content-disposition'] ?? '';
    expect(
      disposition.includes(`export_inspection_${id}.docx`),
      `下载名必须含单据类型与本单主键，实际 ${disposition}`
    ).toBe(true);
    const bytes = await printResp.body();
    expect(bytes.byteLength, 'docx 体必须非空').toBeGreaterThan(0);
    expect(bytes[0], `docx 是 zip 容器，首字节必须是 0x50，实际 ${bytes[0]}`).toBe(0x50);
    expect(bytes[1], `docx 次字节必须是 0x4b，实际 ${bytes[1]}`).toBe(0x4b);

    const text = await docxPlainText(bytes);
    expect(
      text.includes(inspectionNo),
      `docx 正文必须含本单商检单号 ${inspectionNo}，否则打印内容与单证归属无法对应；正文片段 ${text.slice(0, 400)}`
    ).toBe(true);
    expect(
      text.includes(`E2E 出口商检面料 ${tag}`),
      `docx 正文必须含本单品名，证明渲染取的是本行数据而非模板占位文本；正文片段 ${text.slice(0, 400)}`
    ).toBe(true);
    expect(
      text.includes('5209210000'),
      `docx 正文必须含本单 HS 编码；正文片段 ${text.slice(0, 400)}`
    ).toBe(true);

    // 启用位真实参与模板解析，停用后同一路径必须退回 404。
    await apiCall(page, 'PUT', `/print-templates/${tplId}`, { status: 'inactive' });
    const tplOff = await apiCallRaw<PrintTemplateRow>(page, 'GET', `/print-templates/${tplId}`);
    expect(tplOff.status, '模板停用后必须回读 inactive').toBe('inactive');
    const afterOff = await page.request.get(printUrl(`/export-inspections/${id}/print`));
    expect(
      afterOff.status(),
      `模板停用后本单打印口必须退回 404（默认模板行断供），实际 ${afterOff.status()}`
    ).toBe(404);

    // 收尾，先删自建模板行，不在共享库留下启用默认位影响后续打印判定。
    await apiCall(page, 'DELETE', `/print-templates/${tplId}`);
    const tplGone = await apiCallExpectFail(page, 'GET', `/print-templates/${tplId}`);
    expect(tplGone.status, `模板删除后按 id 回读必须 404，实际 ${tplGone.status}`).toBe(404);
  });

  test('无 export-inspections 读权的岗位取列表被拒，拒因走统一失败信封且同路径在 admin 会话下可读', async ({
    page,
  }) => {
    // 同一路径在分片 admin 会话下必须 200，先排除"端点本身坏了"这一混淆因。
    const adminList = await apiCallRaw<InspectionPageBody>(
      page,
      'GET',
      '/export-inspections?page=1&page_size=20'
    );
    expect(
      Array.isArray(adminList.items),
      `admin 会话下列表 data.items 必须是数组，实际 ${JSON.stringify(adminList).slice(0, 200)}`
    ).toBe(true);

    await loginAsRole(page, 'customer_service');
    const denied = await apiCallExpectFail(page, 'GET', '/export-inspections?page=1&page_size=20');
    expectDenied(denied, 'customer_service 取商检列表必须被权限门拒绝');
    expect(failureCode(denied), '权限门拒绝的机器码必须是 FORBIDDEN 字符串码').toBe(
      APP_ERROR_CODES.FORBIDDEN
    );
    assertFailureEnvelope(denied, '商检列表的权限拒绝必须走统一失败信封');
  });

  test('A 岗建单后 B 岗按 id 直取详情、单证与打印通道均被后端拒绝', async ({ page }) => {
    const tag = uniq('');
    const created = await seedInspection(page, tag);
    const id = Number(created.id);

    // A 岗（建单会话）按主键可读，先固定"该行确实存在且可读"这一前提。
    const ownerRead = await apiCallRaw<InspectionRow>(page, 'GET', `/export-inspections/${id}`);
    expect(Number(ownerRead.id), `A 岗按 id 读回必须命中本行，实际 ${String(ownerRead.id)}`).toBe(
      id
    );
    expect(ownerRead.inspection_no, 'A 岗读回的单号必须是本行提交值').toBe(`E2E420EI${tag}`);

    // B 岗（无 export-inspections 任何动作键）直取同一主键：必须被后端权限门拒绝，
    // 前端隐藏按钮不作为拦截证据（运行时键由 URL 段推导，与 handler 声明无关）。
    await loginAsRole(page, 'customer_service');
    const foreignGet = await apiCallExpectFail(page, 'GET', `/export-inspections/${id}`);
    expectDenied(foreignGet, `B 岗按 A 岗主键 ${id} 直取商检详情必须被拒`);
    expect(foreignGet.status, '跨岗直取详情必须是 403 而不是 404（拒绝来自权限门而非取数）').toBe(
      403
    );
    assertFailureEnvelope(foreignGet, '跨岗直取详情的拒绝必须走统一失败信封');

    const foreignCertList = await apiCallExpectFail(
      page,
      'GET',
      `/export-inspections/${id}/certificates?page=1&page_size=20`
    );
    expectDenied(foreignCertList, 'B 岗取该商检单的产地证列表必须被同一资源键拒绝');

    const foreignPrint = await apiCallExpectFail(page, 'GET', `/export-inspections/${id}/print`);
    expectDenied(foreignPrint, 'B 岗取该商检单的 docx 打印件必须被 print 动作键拒绝');

    const foreignCreate = await apiCallExpectFail(page, 'POST', '/export-inspections', {
      inspection_no: `E2E420EI${tag}B`,
      sales_order_id: SENTINEL_SALES_ORDER_ID,
      product_name: `E2E 出口商检面料 ${tag}B`,
      hs_code: '5209210000',
      inspection_type: 'PRE_EXPORT',
      inspection_agency: 'E2E 商检机构',
      inspection_date: '2026-09-15',
    });
    expectDenied(foreignCreate, 'B 岗无 create 键，建单必须被拒（审计归属不接受越权写入）');
  });
});
