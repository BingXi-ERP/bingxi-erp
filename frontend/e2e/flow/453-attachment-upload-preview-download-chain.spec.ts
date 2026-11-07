import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  APP_ERROR_CODES,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  loginViaUI,
  loginAsRole,
} from './helpers';

/**
 * 453 单据附件真实上传-落库-回读-下载-删除-跨角色可见链（本仓唯一在册附件族：供应商资质证照）
 *
 * 端点存在性的唯一事实来源是 frontend/scripts/route-snapshot.txt，本文件只使用下列在册腿：
 * - POST `/purchase/suppliers/{sid}/qualifications`（supplier_handler::create_supplier_qualification）
 *   建资质行，attachment_path 初值取自请求（本用例不传，落库为 null）；
 * - GET  `/purchase/suppliers/{sid}/qualifications`（list_supplier_qualifications）
 *   出参 ApiResponse<Vec<Model>>，data 是裸数组，键为模型 snake_case 名（id/supplier_id/
 *   qualification_name/attachment_path 等），非分页信封；
 * - POST `/purchase/suppliers/{sid}/qualifications/{qid}/attachment`（upload_supplier_qualification_attachment）
 *   multipart，文件字段名固定 `file`；成功出参 ApiResponse<Model>，attachment_path 回写为
 *   服务端生成受控 URL `/uploads/qualifications/{sid}_{qid}.{ext}`（客户端原名不参与路径拼接）；
 * - GET  `/purchase/suppliers/{sid}/qualifications/{qid}/attachment`（get_supplier_qualification_attachment）
 *   成功出参是裸字节流（非 JSON 信封）：Content-Type 按扩展名（pdf→application/pdf）、
 *   Content-Disposition `inline; filename="{sid}_{qid}.pdf"`、Cache-Control `private, no-store`；
 *   该资质未上传附件（attachment_path 为 null）时 AppError::not_found（HTTP 404 + NOT_FOUND）；
 * - DELETE `/purchase/suppliers/{sid}/qualifications/{qid}`（delete_supplier_qualification）
 *   service 只 delete_by_id 落库行、不清盘文件；删后资质行消失 ⇒ 读取端 get_supplier_qualification
 *   双键定位不到 ⇒ 下载腿真实降级为 404（预览不残留）。
 *
 * 上传侧安全校验清单（写入方 supplier_handler.rs，逐条即反假成功腿的点名拒绝依据）：
 * - 大小上限 5MB（MAX_QUALIFICATION_ATTACHMENT_SIZE），全局请求体上限 12MB（constants::MAX_HTTP_BODY_BYTES），
 *   故 5MB<体积<12MB 才能走到显式大小校验、被点名拒绝而非流读取截断；
 * - 扩展名白名单 pdf/jpg/jpeg/png；
 * - 文件头魔数必须命中 PDF(%PDF)/JPEG(FF D8 FF)/PNG(89 50 4E 47...)之一，且与声明后缀同族，
 *   否则 validation_displayable 拒绝（HTTP 4xx + 机器码 VALIDATION_ERROR）。
 *
 * 跨角色可见的权限键事实来源：附件读写挂载于 `/purchase/suppliers/*`，permission 中间件按 URL 段推导为
 * `suppliers:read`（handler 文档注释与 routes/purchase.rs 同口径）：
 * - gm（init_service_ops/permission.rs 的 management 分组持 suppliers:read，data_scope=all）→ 可读，200；
 * - quality_inspector（quality 分组只持 supplier-qualifications:read，无 suppliers:read）→ 挂载段推不出授权，
 *   permission 中间件先于 handler 短路，列表与下载均 403 FORBIDDEN（与数据范围无关，键名近邻不误放行）。
 *
 * 隔离与自清：每个用例自建独立资质行，上传的附件归属该行；删除用例把行删净，其余用例结束后
 * 统一 DELETE 自建资质收尾（盘上文件无删除端点、由换格式清理与运维关注，不属本契约断言面）。
 * 失败信封一律钉 HTTP 码 + 字符串机器码 + trace_id/timestamp 在场，不写裸 isErr、不把 404/403 当健康、
 * 不用 `?? []` 掩盖缺键；前置不成立显式 throw，不伪装成绿灯。
 */

/** PDF 魔数最小合法体：仅 %PDF 头即通过 detect_qualification_attachment_magic，扩展名同族判定为 pdf */
function buildPdfBuffer(marker: string, padBytes = 0): Buffer {
  const pad = padBytes > 0 ? `\n${' '.repeat(padBytes)}\n%%EOF` : '';
  return Buffer.from(`%PDF-1.4\n${marker}${pad}`, 'utf-8');
}

/** 统一 URL 拼装：apiCall 系列自带前缀，原始 page.request 腿必须显式拼 API_BASE + API_PREFIX */
function fullUrl(path: string): string {
  return `${API_BASE}${API_PREFIX}${path}`;
}

/** 从上下文 Cookie 取 csrf 双提交令牌（helpers 的 getCsrfToken 未导出，此处与 122 同构自取） */
async function csrfTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf) {
    throw new Error('csrf_token cookie 不存在——loginViaUI/loginAsRole 之后应存在，前置未就绪');
  }
  return csrf.value;
}

type UploadResult = {
  status: number;
  code: string | number | undefined;
  message: string | null | undefined;
  data: Record<string, unknown> | null;
};

/**
 * 组 multipart 打 POST 附件上传；headers 双提交 CSRF。
 * 返回未收窄的状态/机器码/文案/data，供成功腿与反假成功腿各自断言，不在 helper 内判绿判红。
 */
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
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': token,
      },
      multipart: {
        file: { name: fileName, mimeType, buffer },
      },
      timeout: 60_000,
    }
  );
  const status = res.status();
  const text = await res.text();
  let parsed: { code?: string | number; message?: string | null; data?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    // 上传成功腿返回 JSON 信封；非 JSON 只可能出现在异常，状态与原文一并抛回调用方点名
    throw new Error(`453 上传响应非 JSON status=${status} body 前 200 字符: ${text.slice(0, 200)}`);
  }
  // CSRF 竞败不是被测的业务拒绝：状态 403 且机器码以 CSRF 开头时显式判为会话面失败，绝不落入业务绿
  if (status === 403 && typeof parsed.code === 'string' && parsed.code.startsWith('CSRF')) {
    throw new Error(
      `453 上传被 CSRF 中间件拒绝（status=${status} code=${parsed.code}）——属会话面失败非业务拒绝，判红不放过`
    );
  }
  return {
    status,
    code: parsed.code,
    message: parsed.message ?? null,
    data: (parsed.data ?? null) as Record<string, unknown> | null,
  };
}

/** 建一条资质行（attachment_path 不传，落库初值 null），返回其 id */
async function createQualification(page: Page, supplierId: number, label: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/purchase/suppliers/${supplierId}/qualifications`,
    {
      qualification_name: `E2E453资质${label}`,
      qualification_type: '体系认证',
      qualification_no: `E2E-453-${label}`,
      issuing_authority: '第三方认证机构',
      issue_date: '2020-01-01',
      valid_until: '2099-12-31',
      need_annual_check: true,
    }
  );
  const qid = created.data?.id;
  if (typeof qid !== 'number') {
    throw new Error(`453 前置不成立：创建资质未返回 id，实际出参 ${JSON.stringify(created.data)}`);
  }
  return qid;
}

/** 列表真回读取指定资质行；缺行时产出点名哨兵（不用可选链把缺行咽成 undefined 再判） */
async function readQualificationFromList(
  page: Page,
  supplierId: number,
  qualificationId: number,
  leg: string
): Promise<Record<string, unknown>> {
  const list = await apiCallRaw<unknown>(
    page,
    'GET',
    `/purchase/suppliers/${supplierId}/qualifications`
  );
  if (!Array.isArray(list)) {
    throw new Error(`[${leg}] 资质列表信封形状漂移：期望裸数组，实际 ${JSON.stringify(list)}`);
  }
  const row = (list as Record<string, unknown>[]).find(r => Number(r.id) === qualificationId);
  if (!row) {
    throw new Error(
      `[${leg}] 列表中找不到资质 id=${qualificationId}（共 ${list.length} 行：` +
        `${list.map(r => r.id).join(',')}）——落库缺失或归属错配`
    );
  }
  return row;
}

/** 本 worker 缓存的自建供应商 id（admin 所有，data_scope=all 的 gm 亦可读） */
let cachedSupplierId: number | undefined;

async function ensureSupplier(page: Page): Promise<number> {
  if (typeof cachedSupplierId === 'number') {
    return cachedSupplierId;
  }
  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E453供应商${suffix}`,
    supplier_short_name: `E2E供${suffix.slice(-3)}`,
    contact_phone: '13800000001',
  });
  const sid = created.data?.id;
  if (typeof sid !== 'number') {
    throw new Error(
      `453 前置不成立：创建供应商未返回 id，实际出参 ${JSON.stringify(created.data)}`
    );
  }
  cachedSupplierId = sid;
  console.log(`[453] 本 worker 专属供应商已建 id=${sid}`);
  return sid;
}

test.describe.serial('453 单据附件上传-回读-下载-删除-跨角色可见-反假成功链', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginViaUI(page);
  });

  test('453-01 上传真实 PDF 落库、刷新重进后列表真回读附件字段', async ({ page }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '01');

    const pdf = buildPdfBuffer('453-01 工艺单扫描件');
    const up = await uploadAttachment(page, supplierId, qid, 'gongyi.pdf', 'application/pdf', pdf);
    console.log(`[453-01] 上传响应 status=${up.status} code=${up.code} message=${up.message}`);
    expect(up.status, `453-01 上传必须 2xx，实际 status=${up.status} message=${up.message}`).toBe(
      200
    );
    expect(up.code, `453-01 上传成功信封 code 必须 200，实际 ${up.code}`).toBe(200);

    const expectedPath = `/uploads/qualifications/${supplierId}_${qid}.pdf`;
    expect(
      up.data ? String(up.data.attachment_path) : '<data 缺失>',
      `453-01 上传回写 attachment_path 必须等于服务端受控 URL ${expectedPath}`
    ).toBe(expectedPath);
    expect(
      up.data ? Number(up.data.supplier_id) : NaN,
      `453-01 上传回写归属供应商必须=${supplierId}（单据归属一致性）`
    ).toBe(supplierId);
    expect(
      up.data ? Number(up.data.id) : NaN,
      `453-01 上传回写资质 id 必须=${qid}（双键归属一致性）`
    ).toBe(qid);

    // 真回读：重新 GET 列表（不消费前端内存态），落库值必须与提交一致
    const row = await readQualificationFromList(page, supplierId, qid, '453-01');
    expect(
      String(row.attachment_path),
      `453-01 列表回读 attachment_path 必须仍为 ${expectedPath}，实际 ${String(row.attachment_path)}`
    ).toBe(expectedPath);
    expect(
      String(row.qualification_name),
      `453-01 列表回读资质名称必须与提交一致，实际 ${String(row.qualification_name)}`
    ).toBe('E2E453资质01');

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
    console.log(`[453-01] 收尾删除自建资质 id=${qid}`);
  });

  test('453-02 下载腿返回真实字节流：200 + PDF 魔数 + Content-Disposition + 字节数等于上传', async ({
    page,
  }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '02');

    const pdf = buildPdfBuffer('453-02 质检报告');
    const up = await uploadAttachment(page, supplierId, qid, 'zhijian.pdf', 'application/pdf', pdf);
    expect(
      up.status,
      `453-02 前置：附件必须上传成功，实际 status=${up.status} message=${up.message}`
    ).toBe(200);

    const res = await page.request.get(
      fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`)
    );
    const bytes = new Uint8Array(await res.body());
    console.log(`[453-02] 下载 status=${res.status()} bytes=${bytes.length}`);

    expect(res.status(), `453-02 下载必须 200，实际 ${res.status()}`).toBe(200);
    const headers = res.headers();
    expect(
      headers['content-type'],
      `453-02 Content-Type 必须是 application/pdf，实际 ${String(headers['content-type'])}`
    ).toContain('application/pdf');
    expect(
      String(headers['content-disposition']),
      `453-02 Content-Disposition 必须带 inline 与服务端生成文件名 ${supplierId}_${qid}.pdf`
    ).toContain(`filename="${supplierId}_${qid}.pdf"`);
    // 真伪字节：不接受只探 200——必须是真 PDF（首四字节 %PDF）且长度非零
    expect(bytes.length, `453-02 下载字节流必须非零长度，实际 ${bytes.length}B`).toBeGreaterThan(0);
    expect(bytes[0], `453-02 首字节必须 0x25（%），实际 ${bytes[0]}`).toBe(0x25);
    expect(bytes[1], `453-02 次字节必须 0x50（P），实际 ${bytes[1]}`).toBe(0x50);
    expect(bytes[2], `453-02 第三字节必须 0x44（D），实际 ${bytes[2]}`).toBe(0x44);
    expect(bytes[3], `453-02 第四字节必须 0x46（F），实际 ${bytes[3]}`).toBe(0x46);
    // 内容与上传逐字节同：大小一致性
    expect(
      bytes.length,
      `453-02 下载字节数必须等于上传字节数 ${pdf.length}，实际 ${bytes.length}`
    ).toBe(pdf.length);

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
    console.log(`[453-02] 收尾删除自建资质 id=${qid}`);
  });

  test('453-03 删除腿：在册 DELETE 删行后列表真消失、预览真不残留（404）', async ({ page }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '03');

    const pdf = buildPdfBuffer('453-03 客户确认样图');
    const up = await uploadAttachment(page, supplierId, qid, 'yangtu.pdf', 'application/pdf', pdf);
    expect(
      up.status,
      `453-03 前置：附件必须上传成功，实际 status=${up.status} message=${up.message}`
    ).toBe(200);

    // 删除前预览确有内容
    const before = await page.request.get(
      fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`)
    );
    expect(before.status(), `453-03 删除前预览必须 200（附件确在），实际 ${before.status()}`).toBe(
      200
    );

    const del = await apiCall(
      page,
      'DELETE',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}`
    );
    console.log(`[453-03] 删除响应 code=${del.code} message=${del.message}`);

    // 删除后列表真回读不再含该资质行（readQualificationFromList 缺行即 throw，把"没删干净"顶成红）
    const list = await apiCallRaw<unknown>(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications`
    );
    if (!Array.isArray(list)) {
      throw new Error(`[453-03] 删除后列表信封形状漂移，实际 ${JSON.stringify(list)}`);
    }
    const stillThere = (list as Record<string, unknown>[]).some(r => Number(r.id) === qid);
    expect(
      stillThere,
      `453-03 删除后列表不得仍含资质 id=${qid}，实际残留行 ${JSON.stringify(
        (list as Record<string, unknown>[]).find(r => Number(r.id) === qid)
      )}`
    ).toBe(false);

    // 删除后预览真不残留：资质行已删，双键定位不到 → 真实 404 NOT_FOUND
    const fail = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    console.log(`[453-03] 删除后预览 status=${fail.status} code=${fail.code}`);
    expect(
      fail.status,
      `453-03 删除后预览必须 404（附件真消失），实际 ${fail.status} code=${fail.code}`
    ).toBe(404);
    expect(fail.code, `453-03 删除后预览机器码必须 NOT_FOUND，实际 ${String(fail.code)}`).toBe(
      APP_ERROR_CODES.NOT_FOUND
    );
  });

  test('453-04 跨角色可见：all 范围持 suppliers:read 的 gm 可读（200），无 suppliers:read 的质检员 403', async ({
    page,
  }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '04');

    const pdf = buildPdfBuffer('453-04 跨角色可见附件');
    const up = await uploadAttachment(page, supplierId, qid, 'cross.pdf', 'application/pdf', pdf);
    expect(
      up.status,
      `453-04 前置：admin 必须上传成功，实际 status=${up.status} message=${up.message}`
    ).toBe(200);

    // 下游有权限角色（suppliers:read + data_scope=all）：列表与下载均真实可见
    await loginAsRole(page, 'gm');
    const gmList = await apiCallRaw<unknown>(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications`
    );
    if (!Array.isArray(gmList)) {
      throw new Error(`[453-04] gm 列表信封形状漂移，实际 ${JSON.stringify(gmList)}`);
    }
    const gmRow = (gmList as Record<string, unknown>[]).find(r => Number(r.id) === qid);
    expect(
      gmRow ? String(gmRow.attachment_path) : '<gm 列表无该行>',
      `453-04 gm（有 suppliers:read）必须见该资质附件，实际 attachment_path=${
        gmRow ? String(gmRow.attachment_path) : '<缺行>'
      }`
    ).toBe(`/uploads/qualifications/${supplierId}_${qid}.pdf`);

    const gmDl = await page.request.get(
      fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`)
    );
    const gmBytes = new Uint8Array(await gmDl.body());
    console.log(`[453-04] gm 下载 status=${gmDl.status()} bytes=${gmBytes.length}`);
    expect(gmDl.status(), `453-04 gm 下载附件必须 200（真实可见），实际 ${gmDl.status()}`).toBe(
      200
    );
    expect(gmBytes.length, `453-04 gm 下载字节必须非零，实际 ${gmBytes.length}B`).toBeGreaterThan(
      0
    );

    // 无 suppliers:read 的角色（质检员仅持近邻键 supplier-qualifications:read）：
    // permission 中间件按 URL 段推 suppliers:read 短路，列表与下载均 403 FORBIDDEN
    await loginAsRole(page, 'quality_inspector');
    const qiList = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications`
    );
    console.log(`[453-04] 质检员列表 status=${qiList.status} code=${qiList.code}`);
    expect(
      qiList.status,
      `453-04 质检员无 suppliers:read，列表必须 403（权限键由 URL 段推导，近邻键不误放行），实际 ${qiList.status} code=${qiList.code}`
    ).toBe(403);
    expect(qiList.code, `453-04 质检员列表机器码必须 FORBIDDEN，实际 ${String(qiList.code)}`).toBe(
      APP_ERROR_CODES.FORBIDDEN
    );

    const qiDl = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${qid}/attachment`
    );
    console.log(`[453-04] 质检员下载 status=${qiDl.status} code=${qiDl.code}`);
    expect(
      qiDl.status,
      `453-04 质检员无 suppliers:read，附件下载必须 403（越权读不到字节），实际 ${qiDl.status} code=${qiDl.code}`
    ).toBe(403);
    expect(qiDl.code, `453-04 质检员下载机器码必须 FORBIDDEN，实际 ${String(qiDl.code)}`).toBe(
      APP_ERROR_CODES.FORBIDDEN
    );

    // 收尾：切回 admin 删净自建资质
    await loginViaUI(page, undefined, undefined, true);
    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
    console.log(`[453-04] 收尾删除自建资质 id=${qid}`);
  });

  test('453-05 反假成功：超大与伪造类型的上传被点名拒绝，拒绝后附件不落库、预览 404', async ({
    page,
  }) => {
    const supplierId = await ensureSupplier(page);

    // (a) 超大：6MB PDF（>5MB 上限、<12MB 全局体上限，能走到显式大小校验被点名拒绝）
    const qidBig = await createQualification(page, supplierId, '05a');
    const bigPdf = buildPdfBuffer('453-05a 超大件', 6 * 1024 * 1024);
    const bigUp = await uploadAttachment(
      page,
      supplierId,
      qidBig,
      'oversize.pdf',
      'application/pdf',
      bigPdf
    );
    console.log(
      `[453-05a] 超大上传 status=${bigUp.status} code=${bigUp.code} message=${bigUp.message}`
    );
    expect(
      bigUp.status >= 400 && bigUp.status < 500,
      `453-05a 超大上传必须被客户端错误点名拒绝（4xx），实际 ${bigUp.status} code=${bigUp.code}`
    ).toBe(true);
    expect(
      String(bigUp.message ?? ''),
      `453-05a 拒绝文案必须点名体积上限，实际 ${String(bigUp.message)}`
    ).toContain('5MB');

    // 拒绝后未落库：attachment_path 仍 null，预览 404
    await assertRejectedNoAttachment(page, supplierId, qidBig, '453-05a');
    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qidBig}`);

    // (b) 白名单外后缀：.exe（扩展名不在 pdf/jpg/jpeg/png）
    const qidExe = await createQualification(page, supplierId, '05b');
    const exeUp = await uploadAttachment(
      page,
      supplierId,
      qidExe,
      'trojan.exe',
      'application/pdf',
      buildPdfBuffer('453-05b 伪装可执行')
    );
    console.log(
      `[453-05b] exe 上传 status=${exeUp.status} code=${exeUp.code} message=${exeUp.message}`
    );
    expect(
      exeUp.status >= 400 && exeUp.status < 500,
      `453-05b 白名单外后缀必须被点名拒绝（4xx），实际 ${exeUp.status} code=${exeUp.code}`
    ).toBe(true);
    expect(
      String(exeUp.message ?? ''),
      `453-05b 拒绝文案必须点名仅支持 pdf/jpg/jpeg/png，实际 ${String(exeUp.message)}`
    ).toContain('仅支持');
    await assertRejectedNoAttachment(page, supplierId, qidExe, '453-05b');
    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qidExe}`);

    // (c) 后缀与内容不符：名为 .png 实为 PDF（魔数判为 pdf、与 png 不同族）
    const qidFake = await createQualification(page, supplierId, '05c');
    const fakeUp = await uploadAttachment(
      page,
      supplierId,
      qidFake,
      'cert.png',
      'image/png',
      buildPdfBuffer('453-05c 后缀伪造')
    );
    console.log(
      `[453-05c] 后缀伪造上传 status=${fakeUp.status} code=${fakeUp.code} message=${fakeUp.message}`
    );
    expect(
      fakeUp.status >= 400 && fakeUp.status < 500,
      `453-05c 后缀与内容不符必须被点名拒绝（4xx），实际 ${fakeUp.status} code=${fakeUp.code}`
    ).toBe(true);
    expect(
      String(fakeUp.message ?? ''),
      `453-05c 拒绝文案必须点名扩展名与内容不符，实际 ${String(fakeUp.message)}`
    ).toContain('不符');
    await assertRejectedNoAttachment(page, supplierId, qidFake, '453-05c');
    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qidFake}`);
  });
});

/**
 * 反假成功共用断言：被拒上传绝不能留下附件——列表回读该行 attachment_path 必须仍为 null，
 * 且预览腿真实 404（该资质尚未上传附件）。把"接口虽报错但偷偷落库/落文件"顶成红。
 */
async function assertRejectedNoAttachment(
  page: Page,
  supplierId: number,
  qualificationId: number,
  leg: string
): Promise<void> {
  const row = await readQualificationFromList(page, supplierId, qualificationId, leg);
  expect(
    row.attachment_path === null,
    `[${leg}] 被拒上传后 attachment_path 必须仍为 null（未落库），实际 ${JSON.stringify(row.attachment_path)}`
  ).toBe(true);

  const preview = await apiCallExpectFail(
    page,
    'GET',
    `/purchase/suppliers/${supplierId}/qualifications/${qualificationId}/attachment`
  );
  expect(
    preview.status,
    `[${leg}] 被拒上传后预览必须 404（附件不存在），实际 ${preview.status} code=${preview.code}`
  ).toBe(404);
  expect(
    preview.code,
    `[${leg}] 被拒上传后预览机器码必须 NOT_FOUND，实际 ${String(preview.code)}`
  ).toBe(APP_ERROR_CODES.NOT_FOUND);
}
