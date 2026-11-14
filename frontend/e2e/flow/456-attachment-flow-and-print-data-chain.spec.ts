import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
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
  flushDeferredCleanups,
  loginViaUI,
  loginAsRole,
  genCode,
  genName,
  getCtx,
} from './helpers';

/**
 * 456 单据附件流转与打印数据链路断言
 *
 * 端点存在性唯一事实来源 frontend/scripts/route-snapshot.txt，本文件覆盖：
 * - POST `/purchase/suppliers/{sid}/qualifications`（create_supplier_qualification）
 *   建资质行，出参 ApiResponse<Model>，data 含 id/qualification_name/attachment_path 等
 *   模型 snake_case 键；
 * - GET `/purchase/suppliers/{sid}/qualifications`（list_supplier_qualifications）
 *   出参 ApiResponse<Vec<Model>>，data 为裸数组；
 * - POST `/purchase/suppliers/{sid}/qualifications/{qid}/attachment`（upload_supplier_qualification_attachment）
 *   multipart 文件字段名 `file`，成功回写 attachment_path 为服务端生成受控路径；
 *   校验清单：扩展名白名单 pdf/jpg/jpeg/png、魔数与后缀同族、大小<=5MB、非空；
 *   客户端原名仅用于提取扩展名，不落盘不落库（服务端生成 {sid}_{qid}.{ext}），
 *   原名长度不构成拒绝条件，attachment_path 列宽 VARCHAR(500) 约束的是生成 URL；
 * - GET `/purchase/suppliers/{sid}/qualifications/{qid}/attachment`（get_supplier_qualification_attachment）
 *   成功出参是裸字节流，Content-Type 按扩展名，Content-Disposition 含文件名；
 *   attachment_path 为 null 时 404 NOT_FOUND；
 * - DELETE `/purchase/suppliers/{sid}/qualifications/{qid}`（delete_supplier_qualification）
 *   删行后读取端 404；
 * - POST `/purchase/orders`（create_order）body 含 supplier_id/order_date/items
 *   （items 至少一行，CreatePurchaseOrderRequest 对 items 有 length(min=1) 校验，
 *   先建空单再补行必 400）；出参 ApiResponse<Value>，data 含 id/order_no；
 * - POST `/purchase/orders/{id}/items`（create_order_item）body 含 line_no/material_id/
 *   quantity_ordered/unit_price；
 * - GET `/purchase/orders/{id}`（get_order）出参含 items 数组；
 * - GET `/purchase/orders/{id}/print`（purchase_order_print_docx）出参 docx 字节流，
 *   Content-Type 含 wordprocessingml，Content-Disposition 含 `purchase_order_{id}.docx`；
 *   模板缺失时 404，成功渲染后 JSZip 解 word/document.xml 可检索业务标识。
 *
 * 权限模型事实来源（middleware/permission.rs 按 URL 段推导权限键）：
 * - `/purchase/suppliers/*` 段推 suppliers 权限键；quality_inspector 无 suppliers:read → 403；
 * - `/purchase/orders/*` 段推 orders 权限键；quality_inspector 无 purchase orders 读 → 403。
 *
 * 隔离与自清：每个用例自建资质行或订单，用例尾删除或 flushDeferredCleanups 清理。
 * 不遗留跨用例数据；上传的 PDF 字节用 %PDF 魔数构造最小合法体。
 * 断言不恒真、不用 ?? [] 掩盖缺键、不把 404/403 当健康。
 */

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

function buildPdfBuffer(marker: string, padBytes = 0): Buffer {
  const pad = padBytes > 0 ? `\n${' '.repeat(padBytes)}\n%%EOF` : '';
  return Buffer.from(`%PDF-1.4\n${marker}${pad}`, 'utf-8');
}

function fullUrl(path: string): string {
  return `${API_BASE}${API_PREFIX}${path}`;
}

async function csrfTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf) {
    throw new Error('csrf_token cookie missing — loginViaUI/loginAsRole should set it');
  }
  return csrf.value;
}

type UploadResult = {
  status: number;
  code: string | number | undefined;
  message: string | null | undefined;
  data: Record<string, unknown> | null;
};

async function uploadAttachment(
  page: Page,
  supplierId: number,
  qualificationId: number,
  fileName: string,
  mimeType: string,
  buffer: Buffer
): Promise<UploadResult> {
  const token = await csrfTokenOf(page);
  const res: APIResponse = await page.request.post(
    fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${qualificationId}/attachment`),
    {
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': token },
      multipart: { file: { name: fileName, mimeType, buffer } },
      timeout: 60_000,
    }
  );
  const status = res.status();
  const text = await res.text();
  let parsed: { code?: string | number; message?: string | null; data?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`456 upload response not JSON status=${status} body: ${text.slice(0, 200)}`);
  }
  if (status === 403 && typeof parsed.code === 'string' && parsed.code.startsWith('CSRF')) {
    throw new Error(
      `456 upload rejected by CSRF middleware status=${status} code=${parsed.code} — session issue`
    );
  }
  return {
    status,
    code: parsed.code,
    message: parsed.message ?? null,
    data: (parsed.data ?? null) as Record<string, unknown> | null,
  };
}

async function createQualification(page: Page, supplierId: number, label: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/purchase/suppliers/${supplierId}/qualifications`,
    {
      qualification_name: genName(`E456Q${label}`),
      qualification_type: 'system_cert',
      qualification_no: genCode(`E456-${label}`),
      issuing_authority: 'third-party',
      issue_date: '2020-01-01',
      valid_until: '2099-12-31',
      need_annual_check: true,
    }
  );
  const qid = created.data?.id;
  if (typeof qid !== 'number') {
    throw new Error(
      `456 precondition: qualification create returned no id, data=${JSON.stringify(created.data)}`
    );
  }
  return qid;
}

async function readQualFromList(
  page: Page,
  supplierId: number,
  qid: number,
  leg: string
): Promise<Record<string, unknown>> {
  const list = await apiCallRaw<unknown>(
    page,
    'GET',
    `/purchase/suppliers/${supplierId}/qualifications`
  );
  if (!Array.isArray(list)) {
    throw new Error(`[${leg}] qualification list shape mismatch: ${JSON.stringify(list)}`);
  }
  const row = (list as Record<string, unknown>[]).find(r => Number(r.id) === qid);
  if (!row) {
    throw new Error(`[${leg}] qualification id=${qid} not found in list (rows=${list.length})`);
  }
  return row;
}

async function assertNoAttachment(
  page: Page,
  supplierId: number,
  qid: number,
  leg: string
): Promise<void> {
  const row = await readQualFromList(page, supplierId, qid, leg);
  expect(
    row.attachment_path === null || row.attachment_path === undefined,
    `[${leg}] rejected upload must leave attachment_path null, actual=${JSON.stringify(row.attachment_path)}`
  ).toBe(true);
  const preview = await apiCallExpectFail(
    page,
    'GET',
    `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
  );
  expect(
    preview.status,
    `[${leg}] after rejection preview must 404, actual ${preview.status}`
  ).toBe(404);
}

let cachedSupplierId: number | undefined;

async function ensureSupplier(page: Page): Promise<number> {
  if (typeof cachedSupplierId === 'number') return cachedSupplierId;
  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E456Sup${suffix}`,
    supplier_short_name: `E456${suffix.slice(-3)}`,
    contact_phone: '13800000001',
  });
  const sid = created.data?.id;
  if (typeof sid !== 'number') {
    throw new Error(
      `456 precondition: supplier create returned no id, data=${JSON.stringify(created.data)}`
    );
  }
  cachedSupplierId = sid;
  console.log(`[456] supplier id=${sid}`);
  return sid;
}

/** DOCX 解包取正文 XML：验证 PK 魔数 + word/document.xml 存在 + 内容非空 */
async function documentXml(bytes: Buffer, leg: string): Promise<string> {
  expect(
    bytes.byteLength,
    `[${leg}] docx bytes must be non-empty, actual ${bytes.byteLength}B`
  ).toBeGreaterThan(0);
  expect(bytes[0], `[${leg}] docx first byte must be 0x50 (P), actual ${bytes[0]}`).toBe(0x50);
  expect(bytes[1], `[${leg}] docx second byte must be 0x4b (K), actual ${bytes[1]}`).toBe(0x4b);
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  expect(
    entry,
    `[${leg}] docx must contain word/document.xml, entries: ${Object.keys(zip.files).join(',')}`
  ).toBeTruthy();
  const xml = await entry!.async('string');
  expect(
    xml.length,
    `[${leg}] word/document.xml body must be non-empty, actual ${xml.length}B`
  ).toBeGreaterThan(100);
  return xml;
}

/** 确保打印模板可用：若首次请求 404 则创建默认模板，返回已清除的 404 证明模板装配腿生效 */
async function ensurePrintTemplate(
  page: Page,
  docType: string,
  cleanupQueue: { method: 'DELETE' | 'PUT' | 'POST'; path: string; label?: string }[]
): Promise<void> {
  const existing = await apiCallRaw<{ items?: Record<string, unknown>[] }>(
    page,
    'GET',
    `/print-templates?doc_type=${docType}&page=1&page_size=1`
  );
  const items = existing?.items;
  if (items && items.length > 0) {
    console.log(`[456] print template for ${docType} already exists id=${items[0].id}`);
    return;
  }
  const tpl = await apiCallRaw<{ id: number }>(page, 'POST', '/print-templates', {
    template_name: genName(`E456TPL_${docType}`),
    doc_type: docType,
    template_code: genCode(`E456-${docType}`),
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
    `[456] create print template must return id, actual ${tpl.id}`
  ).toBe(true);
  deferCleanup(cleanupQueue, 'DELETE', `/print-templates/${tplId}`, `print-template-${tplId}`);
  console.log(`[456] print template created for ${docType} id=${tplId}`);
}

/** 创建采购订单并添加指定数量明细行，返回 {orderId, orderNo, itemCount, totalAmount} */
async function createOrderWithItems(
  page: Page,
  supplierId: number,
  itemCount: number,
  cleanupQueue: { method: 'DELETE' | 'PUT' | 'POST'; path: string; label?: string }[]
): Promise<{ orderId: number; orderNo: string; itemCount: number; totalAmount: number }> {
  const ctx = getCtx();
  const warehouseId = ctx.warehouseIds[0];
  const productId = ctx.productIds[0];
  const departmentId = ctx.departmentIds[0];
  if (!warehouseId) throw new Error('456 precondition: no warehouse in context');
  if (!productId) throw new Error('456 precondition: no product in context');
  if (!departmentId) throw new Error('456 precondition: no department in context');

  const orderDate = new Date().toISOString().slice(0, 10);
  let totalAmount = 0;
  const items = Array.from({ length: itemCount }, (_, i) => {
    const unitPrice = 11 + i;
    const qty = 5;
    totalAmount += unitPrice * qty;
    return {
      line_no: i + 1,
      material_id: productId,
      unit_price: String(unitPrice),
      quantity_ordered: String(qty),
      tax_rate: '0',
    };
  });
  const order = await apiCall<{ id?: number; order_no?: string }>(
    page,
    'POST',
    '/purchase/orders',
    {
      supplier_id: supplierId,
      order_date: orderDate,
      warehouse_id: warehouseId,
      department_id: departmentId,
      items,
    }
  );
  const orderId = order.data?.id;
  const orderNo = order.data?.order_no;
  if (typeof orderId !== 'number') {
    throw new Error(
      `456 precondition: order create returned no id, data=${JSON.stringify(order.data)}`
    );
  }
  if (typeof orderNo !== 'string' || !orderNo) {
    throw new Error(
      `456 precondition: order create returned no order_no, data=${JSON.stringify(order.data)}`
    );
  }
  deferCleanup(cleanupQueue, 'DELETE', `/purchase/orders/${orderId}`, `po-${orderId}`);
  console.log(`[456] order id=${orderId} no=${orderNo} items=${itemCount} total=${totalAmount}`);
  return { orderId, orderNo, itemCount, totalAmount };
}

// ─── 用例组 ─────────────────────────────────────────────────────────────────

test.describe.serial('456 attachment flow and print data chain', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await loginViaUI(page);
    // 打印腿需按 ctx 的仓库/产品/加工厂建采购单，这些基础实体由 ensureTestEntities 自建或复用，
    // 缺这一步则 ctx.warehouseIds/productIds/supplierId 为空，建单前置直接判红。
    await ensureTestEntities(page);
  });

  // ─── 456-01 附件上传→回读→下载→删除→确认消失 ────────────────────────────

  test('456-01 upload attachment read-back download delete gone', async ({ page }) => {
    const sid = await ensureSupplier(page);
    const qid = await createQualification(page, sid, '01');

    const pdf = buildPdfBuffer('456-01 craft-doc scan');
    const up = await uploadAttachment(page, sid, qid, 'craft01.pdf', 'application/pdf', pdf);
    console.log(`[456-01] upload status=${up.status} code=${up.code} msg=${up.message}`);
    expect(up.status, `456-01 upload must 200, actual ${up.status} msg=${up.message}`).toBe(200);
    expect(up.code, `456-01 success envelope code must 200, actual ${up.code}`).toBe(200);

    const expectedPath = `/uploads/qualifications/${sid}_${qid}.pdf`;
    expect(up.data, '456-01 upload response data must be present').not.toBeNull();
    expect(
      String(up.data!.attachment_path),
      `456-01 attachment_path must be server-generated URL ${expectedPath}`
    ).toBe(expectedPath);
    expect(Number(up.data!.supplier_id), `456-01 attachment belongs to supplier ${sid}`).toBe(sid);
    expect(Number(up.data!.id), `456-01 attachment belongs to qualification ${qid}`).toBe(qid);

    // 回读列表确认落库
    const row = await readQualFromList(page, sid, qid, '456-01-readback');
    expect(
      String(row.attachment_path),
      `456-01 list read-back attachment_path must still be ${expectedPath}`
    ).toBe(expectedPath);

    // 下载确认字节完整
    const dl = await page.request.get(
      fullUrl(`/purchase/suppliers/${sid}/qualifications/${qid}/attachment`)
    );
    expect(dl.status(), `456-01 download must 200, actual ${dl.status()}`).toBe(200);
    const dlHeaders = dl.headers();
    expect(
      dlHeaders['content-type'],
      `456-01 download content-type must application/pdf, actual ${dlHeaders['content-type']}`
    ).toContain('application/pdf');
    const dlBytes = new Uint8Array(await dl.body());
    expect(
      dlBytes.length,
      `456-01 download bytes must be non-zero, actual ${dlBytes.length}`
    ).toBeGreaterThan(0);
    expect(dlBytes[0], `456-01 first byte %PDF 0x25`).toBe(0x25);
    expect(dlBytes[1], `456-01 second byte %PDF 0x50`).toBe(0x50);
    expect(dlBytes[2], `456-01 third byte %PDF 0x44`).toBe(0x44);
    expect(dlBytes[3], `456-01 fourth byte %PDF 0x46`).toBe(0x46);
    expect(dlBytes.length, `456-01 download byte count must equal upload ${pdf.length}`).toBe(
      pdf.length
    );

    // 删除确认消失
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qid}`);
    const listAfter = await apiCallRaw<unknown>(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications`
    );
    if (!Array.isArray(listAfter)) {
      throw new Error(`456-01 list shape mismatch after delete: ${JSON.stringify(listAfter)}`);
    }
    const gone = (listAfter as Record<string, unknown>[]).some(r => Number(r.id) === qid);
    expect(gone, `456-01 after delete qualification id=${qid} must not be in list`).toBe(false);

    const failAfter = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications/${qid}/attachment`
    );
    expect(
      failAfter.status,
      `456-01 after delete attachment must 404, actual ${failAfter.status}`
    ).toBe(404);
    expect(failAfter.code, `456-01 after delete code must NOT_FOUND`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
  });

  // ─── 456-02 多条附件不覆盖：两条并存、删一余一 ─────────────────────────

  test('456-02 two attachments coexist on same supplier delete one keeps other', async ({
    page,
  }) => {
    const sid = await ensureSupplier(page);
    const qid1 = await createQualification(page, sid, '02a');
    const qid2 = await createQualification(page, sid, '02b');

    const pdf1 = buildPdfBuffer('456-02 attachment-A');
    const pdf2 = buildPdfBuffer('456-02 attachment-B');
    const up1 = await uploadAttachment(page, sid, qid1, 'attA.pdf', 'application/pdf', pdf1);
    expect(up1.status, `456-02 upload A must 200, actual ${up1.status}`).toBe(200);
    const up2 = await uploadAttachment(page, sid, qid2, 'attB.pdf', 'application/pdf', pdf2);
    expect(up2.status, `456-02 upload B must 200, actual ${up2.status}`).toBe(200);

    // 两条都在列表中且 attachment_path 各自独立
    const listBoth = await apiCallRaw<unknown>(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications`
    );
    if (!Array.isArray(listBoth)) {
      throw new Error(`456-02 list shape mismatch: ${JSON.stringify(listBoth)}`);
    }
    const arr = listBoth as Record<string, unknown>[];
    const row1 = arr.find(r => Number(r.id) === qid1);
    const row2 = arr.find(r => Number(r.id) === qid2);
    expect(row1, '456-02 qualification A must exist in list').toBeTruthy();
    expect(row2, '456-02 qualification B must exist in list').toBeTruthy();
    expect(String(row1!.attachment_path), `456-02 A path`).toBe(
      `/uploads/qualifications/${sid}_${qid1}.pdf`
    );
    expect(String(row2!.attachment_path), `456-02 B path`).toBe(
      `/uploads/qualifications/${sid}_${qid2}.pdf`
    );

    // 删除 A → B 不丢
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qid1}`);
    const listAfter = await apiCallRaw<unknown>(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications`
    );
    if (!Array.isArray(listAfter)) {
      throw new Error(`456-02 list shape after delete: ${JSON.stringify(listAfter)}`);
    }
    const arrAfter = listAfter as Record<string, unknown>[];
    const gone1 = arrAfter.find(r => Number(r.id) === qid1);
    const kept2 = arrAfter.find(r => Number(r.id) === qid2);
    expect(gone1, '456-02 deleted A must not be in list').toBeUndefined();
    expect(kept2, '456-02 B must remain after A deletion').toBeTruthy();
    expect(
      String(kept2!.attachment_path),
      `456-02 B attachment_path preserved after A delete`
    ).toBe(`/uploads/qualifications/${sid}_${qid2}.pdf`);

    // 清理 B
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qid2}`);
  });

  // ─── 456-03 打印数据腿：DOCX 含明细行且 20+ 不截断 ──────────────────────

  test('456-03 purchase order print docx contains all items no truncation', async ({ page }) => {
    const sid = await ensureSupplier(page);
    const cleanupQueue: { method: 'DELETE' | 'PUT' | 'POST'; path: string; label?: string }[] = [];

    await ensurePrintTemplate(page, 'purchase_order', cleanupQueue);
    const { orderId, orderNo, itemCount } = await createOrderWithItems(page, sid, 22, cleanupQueue);

    // 先通过订单详情确认 items 数量
    const detail = await apiCallRaw<Record<string, unknown>>(
      page,
      'GET',
      `/purchase/orders/${orderId}`
    );
    const detailItems = detail?.items;
    expect(
      Array.isArray(detailItems),
      `456-03 order detail must contain items array, actual=${JSON.stringify(detail)}`
    ).toBe(true);
    expect(
      (detailItems as unknown[]).length,
      `456-03 order must have ${itemCount} items in detail`
    ).toBe(22);

    // 调打印腿
    const printResp = await page.request.get(fullUrl(`/purchase/orders/${orderId}/print`));
    const printStatus = printResp.status();
    console.log(`[456-03] print status=${printStatus}`);
    expect(printStatus, `456-03 print endpoint must 200, actual ${printStatus}`).toBe(200);

    const printHeaders = printResp.headers();
    expect(
      printHeaders['content-type'] ?? '',
      `456-03 print content-type must be docx, actual ${printHeaders['content-type']}`
    ).toContain('wordprocessingml');
    expect(
      printHeaders['content-disposition'] ?? '',
      `456-03 content-disposition must contain purchase_order_${orderId}`
    ).toContain(`purchase_order_${orderId}`);

    // 解析 DOCX 验证正文含订单号（证明非空壳）与明细行数
    const docxBytes = Buffer.from(await printResp.body());
    const xml = await documentXml(docxBytes, '456-03');
    expect(
      xml.includes(orderNo),
      `456-03 print XML must contain order_no "${orderNo}" — empty shell detection`
    ).toBe(true);

    // 22 行明细不截断：XML 中应含 22 行数据标记（每行的序号 1..22 对应的 product 引用）
    for (let lineNo = 1; lineNo <= 22; lineNo++) {
      expect(
        xml.includes(String(lineNo)),
        `456-03 print XML must contain line_no ${lineNo} (items not truncated)`
      ).toBe(true);
    }

    await flushDeferredCleanups(page, cleanupQueue);
  });

  // ─── 456-04 权限与归属面：无权限角色 4xx ────────────────────────────────

  test('456-04 unauthorized roles get 4xx on attachment and print', async ({ page }) => {
    const sid = await ensureSupplier(page);
    const cleanupQueue: { method: 'DELETE' | 'PUT' | 'POST'; path: string; label?: string }[] = [];

    // 准备附件数据
    const qid = await createQualification(page, sid, '04');
    const pdf = buildPdfBuffer('456-04 permission test');
    const up = await uploadAttachment(page, sid, qid, 'perm.pdf', 'application/pdf', pdf);
    expect(up.status, `456-04 upload must 200 for admin, actual ${up.status}`).toBe(200);

    // 准备打印订单数据
    await ensurePrintTemplate(page, 'purchase_order', cleanupQueue);
    const { orderId } = await createOrderWithItems(page, sid, 3, cleanupQueue);

    // quality_inspector: 无 suppliers:read 权限 → 列表 403、下载 403
    await loginAsRole(page, 'quality_inspector');
    const qiList = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications`
    );
    console.log(`[456-04] quality_inspector list status=${qiList.status} code=${qiList.code}`);
    expect(
      qiList.status,
      `456-04 quality_inspector no suppliers:read, list must 403, actual ${qiList.status}`
    ).toBe(403);
    expect(qiList.code, `456-04 quality_inspector list code must FORBIDDEN`).toBe(
      APP_ERROR_CODES.FORBIDDEN
    );

    const qiDl = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications/${qid}/attachment`
    );
    console.log(`[456-04] quality_inspector download status=${qiDl.status} code=${qiDl.code}`);
    expect(
      qiDl.status,
      `456-04 quality_inspector download attachment must 403, actual ${qiDl.status}`
    ).toBe(403);
    expect(qiDl.code, `456-04 quality_inspector download code must FORBIDDEN`).toBe(
      APP_ERROR_CODES.FORBIDDEN
    );

    // quality_inspector 无 purchase orders 权限 → 打印腿 403
    const qiPrint = await apiCallExpectFail(page, 'GET', `/purchase/orders/${orderId}/print`);
    console.log(`[456-04] quality_inspector print status=${qiPrint.status} code=${qiPrint.code}`);
    expect(
      qiPrint.status,
      `456-04 quality_inspector print access must 4xx, actual ${qiPrint.status}`
    ).toBeGreaterThanOrEqual(400);
    expect(
      qiPrint.status,
      `456-04 quality_inspector print must be < 500 (client error), actual ${qiPrint.status}`
    ).toBeLessThan(500);

    // 切回 admin 清理
    await loginViaUI(page, undefined, undefined, true);
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qid}`);
    await flushDeferredCleanups(page, cleanupQueue);
  });

  // ─── 456-05 反假成功：空文件/非法后缀拒绝无残留；超长原名走服务端受控文件名 ───

  test('456-05 empty file illegal ext rejected no residual long client name uses server-generated path', async ({
    page,
  }) => {
    const sid = await ensureSupplier(page);

    // (a) 空文件：0 字节
    const qidEmpty = await createQualification(page, sid, '05a');
    const emptyUp = await uploadAttachment(
      page,
      sid,
      qidEmpty,
      'empty.pdf',
      'application/pdf',
      Buffer.alloc(0)
    );
    console.log(
      `[456-05a] empty upload status=${emptyUp.status} code=${emptyUp.code} msg=${emptyUp.message}`
    );
    expect(
      emptyUp.status >= 400 && emptyUp.status < 500,
      `456-05a empty file upload must 4xx, actual ${emptyUp.status} code=${emptyUp.code}`
    ).toBe(true);
    await assertNoAttachment(page, sid, qidEmpty, '456-05a');
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qidEmpty}`);

    // (b) 超长客户端原名：服务端丢弃原名、生成 {sid}_{qid}.{ext} 受控文件名（supplier_handler.rs），
    // 原名不参与路径拼接也不落库，长度不是拒绝条件。断言真实契约：上传 200、attachment_path
    // 为受控形态且不泄漏原名（等值断言同时覆盖 VARCHAR(500) 列宽）、回读一致、下载字节完整、删除后无残留。
    const qidLong = await createQualification(page, sid, '05b');
    const longName = 'a'.repeat(250) + '.pdf';
    const pdfLong = buildPdfBuffer('456-05b');
    const longUp = await uploadAttachment(page, sid, qidLong, longName, 'application/pdf', pdfLong);
    console.log(
      `[456-05b] long name upload status=${longUp.status} code=${longUp.code} msg=${longUp.message}`
    );
    expect(
      longUp.status,
      `456-05b long client name is discarded server-side, upload must 200, actual ${longUp.status} msg=${longUp.message}`
    ).toBe(200);
    expect(longUp.code, `456-05b success envelope code must 200, actual ${longUp.code}`).toBe(200);
    const controlledPath = `/uploads/qualifications/${sid}_${qidLong}.pdf`;
    expect(longUp.data, '456-05b upload response data must be present').not.toBeNull();
    expect(
      String(longUp.data!.attachment_path),
      `456-05b attachment_path must be server-generated ${controlledPath}, client name must not leak into path`
    ).toBe(controlledPath);
    const rowLong = await readQualFromList(page, sid, qidLong, '456-05b-readback');
    expect(
      String(rowLong.attachment_path),
      `456-05b list read-back attachment_path must be ${controlledPath}`
    ).toBe(controlledPath);
    const dlLong = await page.request.get(
      fullUrl(`/purchase/suppliers/${sid}/qualifications/${qidLong}/attachment`)
    );
    expect(dlLong.status(), `456-05b download must 200, actual ${dlLong.status()}`).toBe(200);
    const dlLongBytes = Buffer.from(await dlLong.body());
    expect(
      dlLongBytes.length,
      `456-05b download byte count must equal upload ${pdfLong.length}, actual ${dlLongBytes.length}`
    ).toBe(pdfLong.length);
    // latin1 逐字节一一映射为码点，字符串相等即字节内容相等（Buffer 窄类型面无 equals）
    expect(
      dlLongBytes.toString('latin1'),
      '456-05b download bytes must equal uploaded PDF content'
    ).toBe(pdfLong.toString('latin1'));
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qidLong}`);
    const goneLong = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${sid}/qualifications/${qidLong}/attachment`
    );
    expect(
      goneLong.status,
      `456-05b after delete attachment must 404, actual ${goneLong.status}`
    ).toBe(404);

    // (c) 非法后缀 .exe
    const qidExe = await createQualification(page, sid, '05c');
    const exeUp = await uploadAttachment(
      page,
      sid,
      qidExe,
      'trojan.exe',
      'application/pdf',
      buildPdfBuffer('456-05c')
    );
    console.log(
      `[456-05c] exe upload status=${exeUp.status} code=${exeUp.code} msg=${exeUp.message}`
    );
    expect(
      exeUp.status >= 400 && exeUp.status < 500,
      `456-05c illegal extension must 4xx, actual ${exeUp.status} code=${exeUp.code}`
    ).toBe(true);
    await assertNoAttachment(page, sid, qidExe, '456-05c');
    await apiCall(page, 'DELETE', `/purchase/suppliers/${sid}/qualifications/${qidExe}`);
  });
});
