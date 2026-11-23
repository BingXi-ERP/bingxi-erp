import { test, expect } from '../diagnose-fixture';
import type { Page, APIResponse } from '@playwright/test';
import { API_BASE, API_PREFIX, apiCall, apiCallRaw, loginViaUI } from './helpers';

/**
 * 458 资质附件大小精确边界与后缀别名/同族真值链（目标 4.18「类型限制/大小限制」）
 *
 * 补齐 451/453/456 未覆盖的边界面：
 * - 大小上限由供应商资质处理器的唯一常量 MAX_QUALIFICATION_ATTACHMENT_SIZE = 5*1024*1024 决定，
 *   判定使用严格大于，故刚好等于上限可传、上限加一字节必须被业务拒绝；全局请求体上限远大于该值，
 *   超出文件能完整读入并走到显式校验，拒绝形态是 validation_displayable（4xx + 可外显文案）。
 * - 后缀取扩展名后统一转小写，故大写别名按小写白名单放行；JPEG 与 JPG 同族，
 *   故 .jpeg 配合 JPEG magic 可传。
 * - magic 真值分别取 PNG、JPEG 的固定头字节（资质附件白名单为 jpg/jpeg/png，PDF 不在册）；
 *   后缀与 magic 不同族视为伪造拒绝，与已有 .png 实为 JPEG 的负例对称。
 *
 * 端点在册事实来源为 frontend/scripts/route-snapshot.txt：
 * POST/GET /purchase/suppliers/{sid}/qualifications 与 POST 附件上传端点（multipart 字段名 file）。
 * 失败信封钉 HTTP 码 + 字符串机器码在场 + 成功不假荷；前置不成立显式 throw，不伪装绿灯。
 */

const MAX_BYTES = 5 * 1024 * 1024;

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
      timeout: 120_000,
    }
  );
  const status = res.status();
  const text = await res.text();
  let parsed: { code?: string | number; message?: string | null; data?: unknown } = {};
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`458 上传响应非 JSON status=${status} body 前 200 字符: ${text.slice(0, 200)}`);
  }
  if (status === 403 && typeof parsed.code === 'string' && parsed.code.startsWith('CSRF')) {
    throw new Error(
      `458 上传被 CSRF 中间件拒绝（status=${status} code=${parsed.code}）——属会话面失败非业务拒绝，判红不放过`
    );
  }
  return {
    status,
    code: parsed.code,
    message: parsed.message ?? null,
    data: (parsed.data ?? null) as Record<string, unknown> | null,
  };
}

/** 构造精确字节数的合法 PNG（8 字节签名触发 magic，空格填充到指定长度） */
function buildPngOfExactSize(totalBytes: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (totalBytes < signature.length) {
    throw new Error(`458 目标字节数 ${totalBytes} 小于 PNG 签名长度 ${signature.length}`);
  }
  return Buffer.concat([signature, Buffer.alloc(totalBytes - signature.length).fill(0x20)]);
}

/** JPEG magic 最小合法体：FF D8 FF + APP0/JFIF，magic 识别只取前三字节 */
function buildJpegBuffer(marker: string): Buffer {
  const header = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
  const jfif = Array.from('JFIF\0', c => c.charCodeAt(0));
  const tail = Array.from(marker, c => c.charCodeAt(0));
  return Buffer.from([...header, ...jfif, ...tail]);
}

/** PNG magic 最小合法体：8 字节签名 + 标记串 */
function buildPngBuffer(marker: string): Buffer {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const tail = Array.from(marker, c => c.charCodeAt(0));
  return Buffer.from([...signature, ...tail]);
}

async function createQualification(page: Page, supplierId: number, label: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(
    page,
    'POST',
    `/purchase/suppliers/${supplierId}/qualifications`,
    {
      qualification_name: `E2E458资质${label}`,
      qualification_type: '体系认证',
      qualification_no: `E2E-458-${label}`,
      issuing_authority: '第三方认证机构',
      issue_date: '2020-01-01',
      valid_until: '2099-12-31',
      need_annual_check: true,
    }
  );
  const qid = created.data?.id;
  if (typeof qid !== 'number') {
    throw new Error(`458 前置不成立：创建资质未返回 id，实际出参 ${JSON.stringify(created.data)}`);
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
    throw new Error(
      `[${leg}] 列表中找不到资质 id=${qualificationId}（共 ${list.length} 行：` +
        `${list.map(r => r.id).join(',')}）——落库缺失或归属错配`
    );
  }
  return row;
}

let cachedSupplierId: number | undefined;

async function ensureSupplier(page: Page): Promise<number> {
  if (typeof cachedSupplierId === 'number') {
    return cachedSupplierId;
  }
  const suffix = `${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/suppliers', {
    supplier_name: `E2E458供应商${suffix}`,
    supplier_short_name: `E2E458供${suffix.slice(-3)}`,
    contact_phone: '13800000001',
  });
  const sid = created.data?.id;
  if (typeof sid !== 'number') {
    throw new Error(
      `458 前置不成立：创建供应商未返回 id，实际出参 ${JSON.stringify(created.data)}`
    );
  }
  cachedSupplierId = sid;
  console.log(`[458] 本 worker 专属供应商已建 id=${sid}\n`);
  return sid;
}

test.describe.serial('458 资质附件大小精确边界与后缀别名/同族真值链', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(180_000);
    await loginViaUI(page);
  });

  test('458-01 刚好等于 5MB 上限的合法 PNG 可传并落库回读一致', async ({ page }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '01-boundary');

    const png = buildPngOfExactSize(MAX_BYTES);
    expect(png.length, '458-01 构造体必须精确等于 5MB 上限字节数').toBe(MAX_BYTES);
    const up = await uploadAttachment(page, supplierId, qid, 'boundary.png', 'image/png', png);
    console.log(`[458-01] 上传响应 status=${up.status} code=${up.code} message=${up.message}\n`);
    expect(
      up.status,
      `458-01 刚好等于上限必须可传（2xx），实际 status=${up.status} message=${up.message}`
    ).toBe(200);
    expect(up.code, `458-01 成功信封 code 必须 200，实际 ${up.code}`).toBe(200);

    const expectedPath = `/uploads/qualifications/${supplierId}_${qid}.png`;
    expect(
      up.data ? String(up.data.attachment_path) : '<data 缺失>',
      `458-01 回写 attachment_path 必须为受控 URL ${expectedPath}`
    ).toBe(expectedPath);

    const row = await readQualificationFromList(page, supplierId, qid, '458-01');
    expect(
      String(row.attachment_path),
      `458-01 列表回读 attachment_path 必须仍为 ${expectedPath}（真落库），实际 ${String(row.attachment_path)}`
    ).toBe(expectedPath);

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
  });

  test('458-02 超上限 1 字节被点名拒绝且拒绝后不落库（反假成功）', async ({ page }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '02-overby1');

    const png = buildPngOfExactSize(MAX_BYTES + 1);
    expect(png.length, '458-02 构造体必须为上限+1 字节').toBe(MAX_BYTES + 1);
    const up = await uploadAttachment(page, supplierId, qid, 'overby1.png', 'image/png', png);
    console.log(`[458-02] 上传响应 status=${up.status} code=${up.code} message=${up.message}\n`);
    expect(
      up.status,
      `458-02 超上限 1 字节必须被拒（4xx），实际 status=${up.status} message=${up.message}`
    ).toBeGreaterThanOrEqual(400);
    expect(
      up.status,
      `458-02 拒绝码不得落在 5xx（应是业务校验非服务端故障），实际 ${up.status}`
    ).toBeLessThan(500);
    expect(
      typeof up.code === 'string' || typeof up.code === 'number' ? up.code : '<code 缺失>',
      `458-02 拒绝信封必须带字符串/数值机器码，实际 ${String(up.code)}`
    ).toBeTruthy();
    expect(
      up.message ?? '',
      `458-02 拒绝文案应点名 5MB 上限（可外显规则），实际 ${String(up.message)}`
    ).toContain('5MB');

    const row = await readQualificationFromList(page, supplierId, qid, '458-02');
    const stored = row.attachment_path;
    expect(
      stored === null || stored === undefined || String(stored) === '',
      `458-02 拒绝后 attachment_path 必须仍为空（不落库、无假成功），实际 ${JSON.stringify(stored)}`
    ).toBe(true);

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
  });

  test('458-03 大写后缀别名 .PDF/.JPEG 与 jpg/jpeg 同族按真值放行', async ({ page }) => {
    const supplierId = await ensureSupplier(page);

    const cases = [
      {
        label: '03a-upper-png',
        file: 'UPPER.PNG',
        mime: 'image/png',
        buf: buildPngOfExactSize(128),
        desc: '大写 .PNG 命中 to_ascii_lowercase 白名单',
      },
      {
        label: '03b-upper-jpeg',
        file: 'UPPER.JPEG',
        mime: 'image/jpeg',
        buf: buildJpegBuffer('458-upper-jpeg'),
        desc: '大写 .JPEG + JPEG magic 同族',
      },
      {
        label: '03c-lower-jpeg',
        file: 'alias.jpeg',
        mime: 'image/jpeg',
        buf: buildJpegBuffer('458-lower-jpeg'),
        desc: '.jpeg 后缀 + JPEG magic 同族（jpg/jpeg 同指）',
      },
    ] as const;

    for (const c of cases) {
      const qid = await createQualification(page, supplierId, c.label);
      const up = await uploadAttachment(page, supplierId, qid, c.file, c.mime, c.buf);
      console.log(`[458-${c.label}] status=${up.status} code=${up.code} message=${up.message}\n`);
      expect(
        up.status,
        `458-${c.label} ${c.desc} 必须可传（2xx），实际 status=${up.status} message=${up.message}`
      ).toBe(200);
      expect(up.code, `458-${c.label} 成功信封 code 必须 200，实际 ${up.code}`).toBe(200);
      const path = up.data ? String(up.data.attachment_path) : '';
      expect(
        path.startsWith('/uploads/qualifications/'),
        `458-${c.label} 回写须为受控 URL 前缀，实际 ${path}`
      ).toBe(true);
      const row = await readQualificationFromList(page, supplierId, qid, `458-${c.label}`);
      expect(
        String(row.attachment_path),
        `458-${c.label} 列表回读须与上传回写一致（真落库），实际 ${String(row.attachment_path)}`
      ).toBe(path);
      await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
    }
  });

  test('458-04 后缀与 magic 不同族（.jpg 实为 PNG）被点名拒绝不落库', async ({ page }) => {
    const supplierId = await ensureSupplier(page);
    const qid = await createQualification(page, supplierId, '04-mismatch');

    const pngBytes = buildPngBuffer('458-fake-jpg');
    const up = await uploadAttachment(
      page,
      supplierId,
      qid,
      'disguised.jpg',
      'image/jpeg',
      pngBytes
    );
    console.log(`[458-04] 上传响应 status=${up.status} code=${up.code} message=${up.message}\n`);
    expect(
      up.status,
      `458-04 .jpg 后缀实为 PNG magic 必须被拒（4xx），实际 status=${up.status} message=${up.message}`
    ).toBeGreaterThanOrEqual(400);
    expect(up.status, `458-04 拒绝不得落在 5xx，实际 ${up.status}`).toBeLessThan(500);

    const row = await readQualificationFromList(page, supplierId, qid, '458-04');
    const stored = row.attachment_path;
    expect(
      stored === null || stored === undefined || String(stored) === '',
      `458-04 伪造被拒后 attachment_path 必须仍为空（无假成功），实际 ${JSON.stringify(stored)}`
    ).toBe(true);

    await apiCall(page, 'DELETE', `/purchase/suppliers/${supplierId}/qualifications/${qid}`);
  });
});
