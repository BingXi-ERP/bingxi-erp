// 4.18 附件大小精确边界：供应商资质附件恰好 5MB 可传、超 1KB 被拒且不落库。
// 后端判据：handlers/supplier_handler.rs MAX_QUALIFICATION_ATTACHMENT_SIZE =
//   5*1024*1024 = 5242880 B；upload_qualification_attachment 判定 data.len() > MAX
//   （恰好等于放行）；拒绝走 validation_displayable「资质附件不能超过 5MB」
//   （上限公开可外显）；白名单 QUALIFICATION_ATTACHMENT_ALLOWED_EXTS = jpg/jpeg/png
//   （PDF 已从资质白名单移除，detect_qualification_attachment_magic 只认 JPEG/PNG 头）；
//   multipart 字段名 file。全局体上限 12MB（constants.rs MAX_HTTP_BODY_BYTES），
//   5MB 单点覆写后不被全局掐断。
// 出参 models/supplier_qualification.rs attachment_path，落盘受控文件名
//   /uploads/qualifications/{sid}_{qid}.png，鉴权 GET 回读。
// 与既有覆盖分工：453 spec 已测 6MB 超限、.exe 伪后缀、.png 实为 JPEG 等拒绝，
//   但未测「恰好 5242880 B 成功 / +1KB 拒」的精确阈值边界。本例专钉该残隙。
// 检测力：上限判定写成 >= 则恰好 5MB 被误拒即红；写成 6MB 则 +1KB 被误放即红；
//   拒后落库则预览 200 即红。magic 以 PNG 8 字节签名构造，不因填充字节误判。
import { test, expect, type Page } from '../diagnose-fixture';
import type { APIResponse } from '@playwright/test';
import {
  API_BASE,
  API_PREFIX,
  loginViaUI,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  tryCleanup,
} from '../flow/helpers';

const MAX_BYTES = 5 * 1024 * 1024;
const OVER_BYTES = MAX_BYTES + 1024;
/** PNG 8 字节签名（supplier_handler.rs detect_qualification_attachment_magic 同源），填充不干扰识别。 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface UploadResult {
  status: number;
  code: string | number | undefined;
  message: string | null | undefined;
  data: Record<string, unknown> | null;
}

function fullUrl(path: string): string {
  return `${API_BASE}${API_PREFIX}${path}`;
}

async function csrfTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf) {
    throw new Error('[448] csrf_token cookie 不存在——登录后应存在，前置未就绪');
  }
  return csrf.value;
}

/** 构造精确字节数的合法 PNG：8 字节签名触发 magic，空格填充到目标长度。 */
function exactSizePng(size: number): Buffer {
  if (size < PNG_SIGNATURE.length) {
    throw new Error(`[448] 目标字节数 ${size} 小于 PNG 签名长度 ${PNG_SIGNATURE.length}`);
  }
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    Buffer.alloc(size - PNG_SIGNATURE.length).fill(0x20),
  ]);
}

async function uploadAttachment(
  page: Page,
  supplierId: number,
  qualificationId: number,
  fileName: string,
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
        file: {
          name: fileName,
          mimeType: 'image/png',
          buffer,
        },
      },
      timeout: 120_000,
    }
  );
  const parsed = JSON.parse(await res.text()) as Record<string, unknown>;
  if (res.status() === 403 && typeof parsed.code === 'string' && parsed.code.startsWith('CSRF')) {
    throw new Error(`[448] 上传被 CSRF 中间件拒绝——会话面失败判红：${parsed.code}`);
  }
  return {
    status: res.status(),
    code: parsed.code as string | number | undefined,
    message: (parsed.message ?? null) as string | null,
    data: (parsed.data ?? null) as Record<string, unknown> | null,
  };
}

async function createQualification(
  page: Page,
  supplierId: number,
  suffix: string
): Promise<number> {
  const created = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/purchase/suppliers/${supplierId}/qualifications`,
    {
      qualification_name: `E2E448资质${suffix}`,
      qualification_type: '体系认证',
      qualification_no: `E2E-448-${suffix}`,
      issuing_authority: '第三方认证机构',
      issue_date: '2020-01-01',
      valid_until: '2099-12-31',
      need_annual_check: true,
    }
  );
  const qid = created.data?.id;
  if (typeof qid !== 'number') {
    throw new Error(`[448] 前置不成立：创建资质未返回 id，实际 ${JSON.stringify(created.data)}`);
  }
  return qid;
}

test('448-01 资质附件恰好 5MB 放行且鉴权回读字节数守恒，超 1KB 拒绝且零落库', async ({ page }) => {
  test.setTimeout(180_000);
  await loginViaUI(page);

  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const supplierCreated = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E448供应商${suffix}`,
    supplier_short_name: `E2E供${suffix.slice(-3)}`,
    contact_phone: `139${suffix.slice(-8)}`,
  });
  const supplierId = supplierCreated.data?.id;
  if (typeof supplierId !== 'number') {
    throw new Error(
      `[448] 前置不成立：创建供应商未返回 id，实际 ${JSON.stringify(supplierCreated.data)}`
    );
  }

  let exactQid: number | undefined;
  let overQid: number | undefined;
  try {
    // 正向：恰好 5242880 B 放行，attachment_path 回写并鉴权下载字节数守恒。
    exactQid = await createQualification(page, supplierId, 'exact');
    const exactPng = exactSizePng(MAX_BYTES);
    expect(exactPng.length, '[448] 构造的正向 PNG 须恰好 5242880 B').toBe(MAX_BYTES);
    const exact = await uploadAttachment(page, supplierId, exactQid, 'exact.png', exactPng);
    expect(
      exact.status,
      `[448] 恰好 5MB 须放行，实际 status=${exact.status} message=${exact.message}`
    ).toBe(200);
    expect(exact.code, '[448] 恰好 5MB 成功信封 code 须为 200').toBe(200);
    const expectedPath = `/uploads/qualifications/${supplierId}_${exactQid}.png`;
    expect(
      exact.data ? String(exact.data.attachment_path) : '<data 缺失>',
      '[448] 成功上传须回写受控 attachment_path'
    ).toBe(expectedPath);

    const downloaded = await page.request.get(
      fullUrl(`/purchase/suppliers/${supplierId}/qualifications/${exactQid}/attachment`),
      { timeout: 120_000 }
    );
    expect(downloaded.status(), '[448] 鉴权下载恰好 5MB 附件须 200').toBe(200);
    const bytes = await downloaded.body();
    expect(bytes.length, '[448] 下载字节数须守恒为 5242880 B').toBe(MAX_BYTES);
    expect(
      bytes.subarray(0, 8).toString('hex'),
      '[448] 下载内容须保留 PNG 8 字节签名（magic 判据同源）'
    ).toBe('89504e470d0a1a0a');

    // 负向：5242880+1024 B 被拒，文案含 5MB，回读 attachment_path 仍 null、预览 404。
    overQid = await createQualification(page, supplierId, 'over');
    const overPng = exactSizePng(OVER_BYTES);
    expect(overPng.length, '[448] 构造的负向 PNG 须恰好 5243904 B').toBe(OVER_BYTES);
    const over = await uploadAttachment(page, supplierId, overQid, 'over.png', overPng);
    expect(
      over.status >= 400 && over.status < 500,
      `[448] 超 1KB 须 4xx 拒绝，实际 status=${over.status}`
    ).toBe(true);
    expect(String(over.message ?? ''), '[448] 超限拒因须点名 5MB（公开规则可外显）').toContain(
      '5MB'
    );

    const overList = await apiCallRaw<Record<string, unknown>[]>(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications`
    );
    expect(Array.isArray(overList), '[448] 资质列表须为裸数组').toBe(true);
    const overRow = overList.find(r => Number(r.id) === overQid);
    expect(overRow, `[448] 超限资质行 qid=${overQid} 须存在`).toBeTruthy();
    expect(
      overRow!.attachment_path == null,
      '[448] 被拒上传后 attachment_path 须仍为 null，不得半落库'
    ).toBe(true);
    const preview = await apiCallExpectFail(
      page,
      'GET',
      `/purchase/suppliers/${supplierId}/qualifications/${overQid}/attachment`
    );
    expect(preview.status, '[448] 被拒上传后预览须 404').toBe(404);
  } finally {
    if (overQid !== undefined) {
      await tryCleanup(
        page,
        'DELETE',
        `/purchase/suppliers/${supplierId}/qualifications/${overQid}`,
        `448 超限资质 ${overQid}`
      );
    }
    if (exactQid !== undefined) {
      await tryCleanup(
        page,
        'DELETE',
        `/purchase/suppliers/${supplierId}/qualifications/${exactQid}`,
        `448 正向资质 ${exactQid}`
      );
    }
    await tryCleanup(
      page,
      'DELETE',
      `/purchase/suppliers/${supplierId}`,
      `448 供应商 ${supplierId}`
    );
  }
});
