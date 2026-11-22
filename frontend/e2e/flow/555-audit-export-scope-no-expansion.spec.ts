// 功能：钉死审计日志导出令牌的批准范围不可扩大——缺维、改值、增维一律 403 且不消费令牌，
//       原批准范围可成功导出一次且内容仅含批准对象，成功后重放同一令牌再 403。
// 调用方：CI e2e flow 分片；只发真实 HTTP 请求，不启动前端页面交互。
// 入参：worker 独立 admin 会话作申请人，role-credentials 的 admin 账号作第二审批人；
//       自建部门与其审计行是唯一数据前置，端点为 /export-approvals 与 /audit-logs/export。
// 传给谁：POST /export-approvals 建单、第二账号 POST /{id}/approve、GET /{id}/token-once
//       取明文，随后 GET /audit-logs/export 走 enforce_export_download_secured 范围门。
// 存什么：只写 E2E 自建部门与导出审批申请；令牌明文只留在测试进程，不落测试文件。
// 存哪里：deferred cleanup 逆序清理审批申请与部门；xlsx 字节只在内存里 JSZip 解包。
// 检测力自证：若范围比对被删或只查令牌不比参数，三条越权导出任一返回 200 即红；
//       若拒绝腿误调 record_download，回读 token_consumed/download_count 即红。
import type { Browser, BrowserContext, Page } from '@playwright/test';
import JSZip from 'jszip';
import { test, expect } from '../diagnose-fixture';
import { applyAuthMocks } from '../smoke/_helpers';
import {
  API_BASE,
  API_PREFIX,
  apiCall,
  apiCallExpectFail,
  deferCleanup,
  expectDenied,
  flushDeferredCleanups,
  genCode,
  getRoleCredential,
  type DeferredCleanup,
} from './helpers';

interface AuditEnvelope {
  items: Array<{ resource_id?: string | number; description?: string }>;
  total: number;
  page: number;
  page_size: number;
}

/** 审批范围与审计筛选共用同一维度值；顺序与导出审计的筛选参数口径对齐。 */
const AUDIT_RESOURCE_TYPE = 'department';

function exportPath(token: string, extra: Record<string, string>): string {
  const params = new URLSearchParams({ download_token: token, ...extra });
  return `/audit-logs/export?${params.toString()}`;
}

async function extractXlsxText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  let text = '';
  const shared = await zip.file('xl/sharedStrings.xml')?.async('string');
  if (shared) text += shared;
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('xl/worksheets/') && name.endsWith('.xml')) {
      text += await zip.file(name)!.async('string');
    }
  }
  return text;
}

/** 独立 storageState + 真实登录的角色会话；凭证只从 globalSetup 写出的文件读。 */
async function openRolePage(
  browser: Browser,
  role: string,
  label: string
): Promise<{ page: Page; context: BrowserContext }> {
  const cred = getRoleCredential(role);
  if (!cred) {
    throw new Error(`[555] ${label} 角色 ${role} 凭证缺失，无法建立独立审批会话`);
  }
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    await applyAuthMocks(context, { username: cred.username, password: cred.password });
    const page = await context.newPage();
    return { page, context };
  } catch (e) {
    await context.close();
    throw new Error(`[555] ${label} 角色 ${role} 登录失败：${(e as Error).message}`);
  }
}

async function createDepartment(page: Page, marker: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(page, 'POST', '/departments', {
    name: marker,
    code: `${marker}-C`,
    description: `555 ${marker}`,
  });
  const id = Number(created.data?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`[555] 部门创建未回真实主键，实际 ${JSON.stringify(created.data)}`);
  }
  return id;
}

/** service 写入的 CREATE 审计是异步落库；只在真实行出现后继续，不把空列表当通过。 */
async function waitAuditRow(page: Page, deptId: number): Promise<void> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const env = await apiCall<AuditEnvelope>(
      page,
      'GET',
      `/audit-logs?resource_type=${AUDIT_RESOURCE_TYPE}&resource_id=${deptId}&operation_type=CREATE&page=1&page_size=100`
    );
    const rows = env.data.items.filter(item => String(item.resource_id) === String(deptId));
    if (rows.length === 1) {
      return;
    }
    if (rows.length > 1) {
      throw new Error(`[555] resource_id=${deptId} 命中 ${rows.length} 行，范围断言前提不成立`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`[555] 60 秒内 dept=${deptId} 的 CREATE 审计未出现，判红不放过`);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

async function readApproval(page: Page, id: number): Promise<Record<string, unknown>> {
  const res = await apiCall<Record<string, unknown>>(page, 'GET', `/export-approvals/${id}`);
  if (!res.data) {
    throw new Error(`[555] 审批 ${id} 详情未回 data 位`);
  }
  return res.data;
}

test.describe('555 审计导出批准范围防扩权', () => {
  test('缺维/改值/增维也拿不到数据，拒绝不消费令牌，成功后不可重放', async ({ page, browser }) => {
    test.setTimeout(420_000);
    const queue: DeferredCleanup[] = [];
    const targetMarker = genCode('E2E555T');
    const decoyMarker = genCode('E2E555X');
    let approverContext: BrowserContext | undefined;

    try {
      const targetId = await createDepartment(page, targetMarker);
      deferCleanup(queue, 'DELETE', `/departments/${targetId}`, `555 目标部门 ${targetId}`);
      const decoyId = await createDepartment(page, decoyMarker);
      deferCleanup(queue, 'DELETE', `/departments/${decoyId}`, `555 对照部门 ${decoyId}`);
      await waitAuditRow(page, targetId);
      await waitAuditRow(page, decoyId);

      const created = await apiCall<{ id?: number; status?: string }>(
        page,
        'POST',
        '/export-approvals',
        {
          resource_type: 'audit_log',
          export_params: {
            resource_type: AUDIT_RESOURCE_TYPE,
            resource_id: String(targetId),
          },
          estimated_rows: 10,
          file_format: 'xlsx',
        }
      );
      const approvalId = Number(created.data?.id);
      if (!Number.isInteger(approvalId) || approvalId <= 0) {
        throw new Error(`[555] 审批创建未回主键，实际 ${JSON.stringify(created.data)}`);
      }
      deferCleanup(
        queue,
        'POST',
        `/export-approvals/${approvalId}/cancel`,
        `555 审批申请 ${approvalId}`
      );
      expect(created.data?.status, '新建导出审批必须是 pending').toBe('pending');

      const approver = await openRolePage(browser, 'admin', '第二审批人');
      approverContext = approver.context;
      const approved = await apiCall<{ status?: string }>(
        approver.page,
        'POST',
        `/export-approvals/${approvalId}/approve`,
        { comments: '555 second admin approval' }
      );
      expect(approved.data?.status, '第二管理员一级审批后必须进入 approved').toBe('approved');

      const once = await apiCall<{ available?: boolean; token?: string }>(
        page,
        'GET',
        `/export-approvals/${approvalId}/token-once`
      );
      const token = once.data?.token;
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error(`[555] 首次 token-once 未回明文令牌，实际 ${JSON.stringify(once.data)}`);
      }
      expect(once.data?.available, '首次取令牌必须 available=true').toBe(true);

      const before = await readApproval(page, approvalId);
      expect(before.token_consumed, '导出前令牌必须未消费').toBe(false);
      expect(before.download_count, '导出前下载次数必须为 0').toBe(0);

      // 三种扩权形态都走真实受理门；拒绝文案属脱敏层，不拿来当判据。
      expectDenied(
        await apiCallExpectFail(
          page,
          'GET',
          exportPath(token, { resource_type: AUDIT_RESOURCE_TYPE })
        ),
        '555 丢掉批准时的 resource_id 维度'
      );
      expectDenied(
        await apiCallExpectFail(
          page,
          'GET',
          exportPath(token, {
            resource_type: AUDIT_RESOURCE_TYPE,
            resource_id: String(decoyId),
          })
        ),
        '555 把 resource_id 换成另一自建部门'
      );
      expectDenied(
        await apiCallExpectFail(
          page,
          'GET',
          exportPath(token, {
            resource_type: AUDIT_RESOURCE_TYPE,
            resource_id: String(targetId),
            keyword: decoyMarker,
          })
        ),
        '555 额外追加未批准的 keyword 维度'
      );

      const afterRejects = await readApproval(page, approvalId);
      expect(afterRejects.status, '范围拒绝不得改审批终态').toBe('approved');
      expect(afterRejects.token_consumed, '范围拒绝不得消费令牌').toBe(false);
      expect(afterRejects.download_count, '范围拒绝不得计下载次数').toBe(0);

      const scope = { resource_type: AUDIT_RESOURCE_TYPE, resource_id: String(targetId) };
      const response = await page.request.get(
        `${API_BASE}${API_PREFIX}${exportPath(token, scope)}`,
        { headers: { 'X-Request-Id': genCode('555EXP') } }
      );
      expect(response.status(), '按批准范围导出必须返回 200（xlsx 不是 JSON 信封）').toBe(200);
      const bytes = await response.body();
      expect(bytes.length, '导出必须返回真实 xlsx 字节').toBeGreaterThan(0);
      const text = await extractXlsxText(bytes);
      expect(text.includes(targetMarker), '导出内容必须含批准对象的唯一标识').toBe(true);
      expect(text.includes(decoyMarker), '导出内容不得含批准范围外的另一部门').toBe(false);

      const afterSuccess = await readApproval(page, approvalId);
      expect(afterSuccess.status, '导出成功后令牌进入一次性终态').toBe('consumed');
      expect(afterSuccess.token_consumed, '导出成功后 token_consumed 必须置真').toBe(true);
      expect(afterSuccess.download_count, '导出成功后 download_count 必须加一').toBe(1);

      expectDenied(
        await apiCallExpectFail(page, 'GET', exportPath(token, scope)),
        '555 同一令牌二次消费'
      );
    } finally {
      if (approverContext) await approverContext.close();
      await flushDeferredCleanups(page, queue);
    }
  });
});
