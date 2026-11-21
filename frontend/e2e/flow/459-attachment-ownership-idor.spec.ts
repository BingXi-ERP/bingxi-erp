import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
import { API_BASE, API_PREFIX, apiCall, apiCallRaw, loginViaUI } from './helpers';

/**
 * 459 资质附件跨供应商归属校验与未上传下载反假成功链（目标 3.4 数据隔离 + 4.18 权限/下载）
 *
 * 补齐 451/453/456/458 未覆盖的归属面：
 * - 后端 get_supplier_qualification（supplier_service.rs:1122-1137）先 find_by_id(qualification_id)，
 *   再检查 existing.supplier_id != 传入 supplier_id → AppError::business_displayable
 *   「该资质不属于此供应商」。上传腿（supplier_handler.rs:944-946）与下载腿（:1164-1166）
 *   都先过这道双键门，故跨供应商用 A 的资质 id + B 的 supplier_id 必然被拒。
 * - 下载腿（:1167-1175）在 attachment_path 为 None 时 AppError::not_found「该资质尚未上传附件」，
 *   即未上传资质下载必须 404，不能返回空字节流假装成功。
 *
 * 端点在册事实来源 frontend/scripts/route-snapshot.txt，权限键 suppliers:read 由 URL 段推导。
 * 失败钉 HTTP 码 + 机器码在场；前置不成立显式 throw；不用 ?? 掩盖缺键、不把 404 当健康绿。
 */

function fullUrl(path: string): string {
  return `${API_BASE}${API_PREFIX}${path}`;
}

async function csrfTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf) {
    throw new Error('csrf_token cookie 不存在——loginViaUI 之后应存在，前置未就绪');
  }
  return csrf.value;
}

type UploadResult = {
  status: number;
  code: string | number | undefined;
  message: string | null | undefined;
  data: Record<string, unknown> | null;
};

/** 原始 multipart 上传腿，返回未收窄状态/机器码供归属拒绝与成功两路各自断言 */
async function postAttachment(
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
    throw new Error(`459 上传响应非 JSON status=${status} body 前 200 字符: ${text.slice(0, 200)}`);
  }
  if (status === 403 && typeof parsed.code === 'string' && parsed.code.startsWith('CSRF')) {
    throw new Error(`459 上传被 CSRF 会话面拒绝 code=${parsed.code}，判红不放过`);
  }
  return {
    status,
    code: parsed.code,
    message: parsed.message ?? null,
    data: (parsed.data ?? null) as Record<string, unknown> | null,
  };
}

/** 下载腿：返回裸字节状态与原文，供 404 反假成功断言（成功应为字节流非 JSON） */
async function getAttachment(
  page: Page,
  supplierId: number,
  qualificationId: number
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const res: APIResponse = await page.request.get(
    fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${qualificationId}/attachment`),
    {
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      timeout: 60_000,
    }
  );
  const body = await res.body();
  return { status: res.status(), headers: res.headers(), body };
}

function buildPdfBuffer(marker: string): Buffer {
  return Buffer.from(`%PDF-1.4\n${marker}\n%%EOF`, 'utf-8');
}

async function createSupplier(page: Page, label: string): Promise<number> {
  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E459供应商${label}${suffix}`,
    supplier_short_name: `E2E459${label}${suffix.slice(-3)}`,
    contact_phone: '13800000001',
  });
  const sid = created.data?.id;
  if (typeof sid !== 'number') {
    throw new Error(
      `459 前置不成立：创建供应商 ${label} 未返回 id，实际 ${JSON.stringify(created.data)}`
    );
  }
  return sid;
}

async function createQualification(page: Page, supplierId: number, label: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/purchase/suppliers/${supplierId}/qualifications`,
    {
      qualification_name: `E2E459资质${label}`,
      qualification_type: '体系认证',
      qualification_no: `E2E-459-${label}`,
      issuing_authority: '第三方认证机构',
      issue_date: '2020-01-01',
      valid_until: '2099-12-31',
      need_annual_check: true,
    }
  );
  const qid = created.data?.id;
  if (typeof qid !== 'number') {
    throw new Error(`459 前置不成立：创建资质未返回 id，实际出参 ${JSON.stringify(created.data)}`);
  }
  return qid;
}

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
    throw new Error(`[${leg}] 列表中找不到资质 id=${qualificationId}——落库缺失或归属错配`);
  }
  return row;
}

test.describe.serial('459 资质附件跨供应商归属校验与未上传下载反假成功链', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await loginViaUI(page);
  });

  test('459-01 未上传附件的资质下载必须 404 且带 NOT_FOUND 机器码（反假成功）', async ({
    page,
  }) => {
    const supplierId = await createSupplier(page, '01');
    const qid = await createQualification(page, supplierId, '01-empty');

    const row = await readQualificationFromList(page, supplierId, qid, '459-01');
    expect(
      row.attachment_path === null ||
        row.attachment_path === undefined ||
        String(row.attachment_path) === '',
      `459-01 前置：新资质 attachment_path 必须为空，实际 ${JSON.stringify(row.attachment_path)}`
    ).toBe(true);

    const got = await getAttachment(page, supplierId, qid);
    process.stdout.write(
      `[459-01] 未上传下载 status=${got.status} body=${got.body.toString('utf8').slice(0, 120)}\n`
    );
    expect(
      got.status,
      `459-01 未上传附件下载必须是 404（not_found），实际 status=${got.status}`
    ).toBe(404);
    let envelope: { code?: unknown; message?: unknown } = {};
    try {
      envelope = JSON.parse(got.body.toString('utf8'));
    } catch {
      throw new Error(
        `459-01 404 响应必须是 AppError 信封 JSON，实际原文 ${got.body.toString('utf8').slice(0, 200)}`
      );
    }
    expect(
      envelope.code,
      `459-01 失败信封机器码必须是 NOT_FOUND（not_found 默认脱敏，真实文案不外显），实际 ${JSON.stringify(envelope.code)}`
    ).toBe('NOT_FOUND');

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
  });

  test('459-02 跨供应商用 A 的资质 id + B 的 supplier_id 下载被双键门拒绝', async ({ page }) => {
    const supplierA = await createSupplier(page, '02A');
    const supplierB = await createSupplier(page, '02B');
    const qidA = await createQualification(page, supplierA, '02-a');

    const up = await postAttachment(
      page,
      supplierA,
      qidA,
      'a.pdf',
      'application/pdf',
      buildPdfBuffer('459-02')
    );
    expect(
      up.status,
      `459-02 前置：A 供应商资质上传必须成功，实际 ${up.status} message=${up.message}`
    ).toBe(200);
    const aPath = up.data ? String(up.data.attachment_path) : '';
    expect(
      aPath.startsWith('/uploads/qualifications/'),
      `459-02 前置：A 附件路径受控，实际 ${aPath}`
    ).toBe(true);

    const cross = await getAttachment(page, supplierB, qidA);
    process.stdout.write(
      `[459-02] 跨供应商下载 status=${cross.status} body=${cross.body.toString('utf8').slice(0, 160)}\n`
    );
    expect(
      cross.status,
      `459-02 跨供应商下载必须被拒（4xx，非 200、非 5xx），实际 status=${cross.status}`
    ).toBeGreaterThanOrEqual(400);
    expect(
      cross.status,
      `459-02 拒绝不得是 5xx（应是业务双键拒绝），实际 ${cross.status}`
    ).toBeLessThan(500);
    let crossEnv: { code?: unknown; message?: unknown } = {};
    try {
      crossEnv = JSON.parse(cross.body.toString('utf8'));
    } catch {
      throw new Error(
        `459-02 跨供应商拒绝响应必须是 AppError 信封，实际 ${cross.body.toString('utf8').slice(0, 200)}`
      );
    }
    expect(
      typeof crossEnv.code === 'string' ? crossEnv.code : '<code 缺失>',
      `459-02 跨供应商拒绝必须带机器码，实际 ${JSON.stringify(crossEnv.code)}`
    ).toBeTruthy();

    // 反向核对：A 供应商自己仍能读到真实字节，证明不是文件损坏造成的失败
    const own = await getAttachment(page, supplierA, qidA);
    expect(own.status, `459-02 反向对照：A 自己下载必须 200，实际 ${own.status}`).toBe(200);
    expect(
      own.body.subarray(0, 4).toString('latin1'),
      `459-02 A 自己下载必须是真实 PDF 字节（%PDF），实际 ${own.body.subarray(0, 8).toString('latin1')}`
    ).toBe('%PDF');

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierA}/qualifications/${qidA}`);
  });

  test('459-03 跨供应商上传 IDOR 被拒且 A 的原附件零漂移', async ({ page }) => {
    const supplierA = await createSupplier(page, '03A');
    const supplierB = await createSupplier(page, '03B');
    const qidA = await createQualification(page, supplierA, '03-a');

    const ownUp = await postAttachment(
      page,
      supplierA,
      qidA,
      'own.pdf',
      'application/pdf',
      buildPdfBuffer('459-03-own')
    );
    expect(ownUp.status, `459-03 前置：A 上传成功，实际 ${ownUp.status}`).toBe(200);
    const before = ownUp.data ? String(ownUp.data.attachment_path) : '';
    expect(
      before.startsWith('/uploads/qualifications/'),
      `459-03 前置：A 路径受控，实际 ${before}`
    ).toBe(true);

    const idor = await postAttachment(
      page,
      supplierB,
      qidA,
      'idor.pdf',
      'application/pdf',
      buildPdfBuffer('459-03-idor')
    );
    process.stdout.write(
      `[459-03] 跨供应商上传 status=${idor.status} code=${idor.code} message=${idor.message}\n`
    );
    expect(
      idor.status,
      `459-03 跨供应商上传必须被拒（4xx），实际 status=${idor.status} message=${idor.message}`
    ).toBeGreaterThanOrEqual(400);
    expect(idor.status, `459-03 拒绝不得是 5xx，实际 ${idor.status}`).toBeLessThan(500);

    // A 的原附件路径不被 B 的越权上传改写（反假成功：拒绝腿没有落库副作用）
    const rowA = await readQualificationFromList(page, supplierA, qidA, '459-03');
    expect(
      String(rowA.attachment_path),
      `459-03 越权上传被拒后 A 的 attachment_path 必须零漂移，实际 ${String(rowA.attachment_path)}`
    ).toBe(before);

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierA}/qualifications/${qidA}`);
  });
});
