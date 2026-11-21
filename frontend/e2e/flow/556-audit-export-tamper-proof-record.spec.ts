// 功能：钉死审计日志导出的独立二次审计闭环——按 X-Request-Id 精确回读记录，
//       文件摘要/字节数/行数与实际 xlsx 字节逐项同源，重消费不新增成功记录，非授权角色直调被拒。
// 调用方：CI e2e flow 分片；只发真实 HTTP 请求，不靠前端按钮隐藏作越权证据。
// 入参：worker 独立 admin 会话作申请/导出人，role-credentials 的 admin 账号作第二审批人；
//       salesperson 与 customer 独立会话作接口层负例，自建部门审计行作唯一数据源。
// 传给谁：GET /audit-logs/export 带唯一 X-Request-Id 下载 xlsx；GET /audit-logs/export-logs
//       查询 audit_log_export_log 防篡改记录；端点与字段以 audit_log_handler.rs 为准。
// 存什么：测试自建部门与审批申请；请求头 ID 与 SHA-256 摘要只在测试内存比对，不落测试文件。
// 存哪里：deferred cleanup 逆序清理审批申请与部门；xlsx 字节只在内存里计算摘要。
// 检测力自证：若写入腿漏记/错记摘要或行数，回读比对即红；若重放被误放行，新增记录即红；
//       若权限门被绕过，两个无权限角色的直接调用即红。
import type { Browser, BrowserContext, Page } from '@playwright/test';
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
  items: Array<{ resource_id?: string | number }>;
  total: number;
}

interface ExportLogItem {
  exporter_user_id: number;
  export_record_count: number;
  export_file_format: string;
  export_file_hash_sha256: string | null;
  export_file_size_bytes: number | null;
  export_request_id: string | null;
}

interface ExportLogEnvelope {
  items: ExportLogItem[];
  total: number;
  page: number;
  page_size: number;
}

const AUDIT_RESOURCE_TYPE = 'department';

function exportPath(token: string, resourceId: number): string {
  const params = new URLSearchParams({
    download_token: token,
    resource_type: AUDIT_RESOURCE_TYPE,
    resource_id: String(resourceId),
  });
  return `/audit-logs/export?${params.toString()}`;
}

/** 独立 storageState + 真实登录的角色会话；凭证只从 globalSetup 写出的文件读。 */
async function openRolePage(
  browser: Browser,
  role: string,
  label: string
): Promise<{ page: Page; context: BrowserContext }> {
  const cred = getRoleCredential(role);
  if (!cred) {
    throw new Error(`[556] ${label} 角色 ${role} 凭证缺失，无法建立独立会话`);
  }
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  try {
    await applyAuthMocks(context, { username: cred.username, password: cred.password });
    const page = await context.newPage();
    return { page, context };
  } catch (e) {
    await context.close();
    throw new Error(`[556] ${label} 角色 ${role} 登录失败：${(e as Error).message}`);
  }
}

/** 用运行时全局 Web Crypto 算摘要：本仓 e2e 未装 @types/node，不引入 node:crypto 模块声明。 */
async function sha256Hex(bytes: Buffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function createDepartment(page: Page, marker: string): Promise<number> {
  const created = await apiCall<{ id?: number }>(page, 'POST', '/departments', {
    name: marker,
    code: `${marker}-C`,
    description: `556 ${marker}`,
  });
  const id = Number(created.data?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`[556] 部门创建未回真实主键，实际 ${JSON.stringify(created.data)}`);
  }
  return id;
}

/** service 写审计异步落库；等到唯一行出现再导出，避免空结果被当成 0 行闭环。 */
async function waitAuditRow(page: Page, deptId: number): Promise<number> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const env = await apiCall<AuditEnvelope>(
      page,
      'GET',
      `/audit-logs?resource_type=${AUDIT_RESOURCE_TYPE}&resource_id=${deptId}&operation_type=CREATE&page=1&page_size=100`
    );
    const rows = env.data.items.filter(item => String(item.resource_id) === String(deptId));
    if (rows.length === 1) {
      // 记录数断言必须与导出腿的筛选面完全同源：导出只带 resource_type + resource_id，
      // 不带 operation_type，故回读同一范围的全量 total，而不是拿 CREATE 单维的命中数代替。
      const scoped = await apiCall<AuditEnvelope>(
        page,
        'GET',
        `/audit-logs?resource_type=${AUDIT_RESOURCE_TYPE}&resource_id=${deptId}&page=1&page_size=100`
      );
      return scoped.data.total;
    }
    if (rows.length > 1) {
      throw new Error(`[556] resource_id=${deptId} 命中 ${rows.length} 行，记录数断言前提不成立`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`[556] 60 秒内 dept=${deptId} 的 CREATE 审计未出现，判红不放过`);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

async function readExportLogs(page: Page, exporterId: number): Promise<ExportLogEnvelope> {
  const res = await apiCall<ExportLogEnvelope>(
    page,
    'GET',
    `/audit-logs/export-logs?page=1&per_page=100&exporter_user_id=${exporterId}`
  );
  if (!res.data || !Array.isArray(res.data.items)) {
    throw new Error(`[556] 二次审计列表信封失配，实际 ${JSON.stringify(res.data)}`);
  }
  return res.data;
}

async function waitExportLog(
  page: Page,
  exporterId: number,
  requestId: string
): Promise<ExportLogItem> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const rows = (await readExportLogs(page, exporterId)).items.filter(
      item => item.export_request_id === requestId
    );
    if (rows.length === 1) return rows[0];
    if (rows.length > 1) {
      throw new Error(`[556] request_id=${requestId} 命中 ${rows.length} 条二次审计记录`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`[556] 30 秒内 request_id=${requestId} 的二次审计记录未出现`);
    }
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
}

test.describe('556 审计导出二次审计记录闭环', () => {
  test('实际字节摘要/大小/行数与独立记录同源，重消费不新增记录，越权角色直调被拒', async ({
    page,
    browser,
  }) => {
    test.setTimeout(420_000);
    const queue: DeferredCleanup[] = [];
    const targetMarker = genCode('E2E556T');
    const decoyMarker = genCode('E2E556X');
    const requestId = genCode('556REQ');
    const replayId = `${requestId}-REPLAY`;
    const extraContexts: BrowserContext[] = [];

    try {
      const targetId = await createDepartment(page, targetMarker);
      deferCleanup(queue, 'DELETE', `/departments/${targetId}`, `556 目标部门 ${targetId}`);
      const decoyId = await createDepartment(page, decoyMarker);
      deferCleanup(queue, 'DELETE', `/departments/${decoyId}`, `556 对照部门 ${decoyId}`);
      const expectedRows = await waitAuditRow(page, targetId);
      await waitAuditRow(page, decoyId);

      const me = await apiCall<{ id?: number }>(page, 'GET', '/auth/me');
      const exporterId = Number(me.data?.id);
      if (!Number.isInteger(exporterId) || exporterId <= 0) {
        throw new Error(`[556] /auth/me 未回真实用户 id，实际 ${JSON.stringify(me.data)}`);
      }

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
        throw new Error(`[556] 审批创建未回主键，实际 ${JSON.stringify(created.data)}`);
      }
      deferCleanup(
        queue,
        'POST',
        `/export-approvals/${approvalId}/cancel`,
        `556 审批申请 ${approvalId}`
      );
      expect(created.data?.status, '新建导出审批必须是 pending').toBe('pending');

      const approver = await openRolePage(browser, 'admin', '第二审批人');
      extraContexts.push(approver.context);
      const approved = await apiCall<{ status?: string }>(
        approver.page,
        'POST',
        `/export-approvals/${approvalId}/approve`,
        { comments: '556 second admin approval' }
      );
      expect(approved.data?.status, '第二管理员一级审批后必须进入 approved').toBe('approved');

      const once = await apiCall<{ token?: string }>(
        page,
        'GET',
        `/export-approvals/${approvalId}/token-once`
      );
      const token = once.data?.token;
      if (typeof token !== 'string' || token.length === 0) {
        throw new Error(`[556] 首次 token-once 未回明文令牌，实际 ${JSON.stringify(once.data)}`);
      }

      const response = await page.request.get(
        `${API_BASE}${API_PREFIX}${exportPath(token, targetId)}`,
        { headers: { 'X-Request-Id': requestId } }
      );
      expect(response.status(), '合法范围导出必须返回 200 xlsx').toBe(200);
      const bytes = await response.body();
      expect(bytes.length, '导出必须拿到真实字节').toBeGreaterThan(0);
      const sha256 = await sha256Hex(bytes);

      const record = await waitExportLog(page, exporterId, requestId);
      expect(record.exporter_user_id, '二次审计记录的导出人必须是实际申请人').toBe(exporterId);
      expect(record.export_file_format, '导出格式必须逐字符为 xlsx').toBe('xlsx');
      expect(record.export_file_hash_sha256, '记录摘要必须等于实际下载字节的 SHA-256').toBe(sha256);
      expect(record.export_file_size_bytes, '记录字节数必须等于实际下载字节长度').toBe(
        bytes.length
      );
      expect(record.export_record_count, '记录行数必须等于筛选命中的自建审计行数').toBe(
        expectedRows
      );
      expectDenied(
        await apiCallExpectFail(page, 'GET', exportPath(token, targetId), undefined, {
          'X-Request-Id': replayId,
        }),
        '556 成功后同一令牌重消费'
      );
      const afterReplay = await readExportLogs(page, exporterId);
      expect(
        afterReplay.items.some(item => item.export_request_id === replayId),
        '被拒的重放不得留下成功的二次审计记录'
      ).toBe(false);
      expect(
        afterReplay.items.filter(item => item.export_request_id === requestId).length,
        '原成功记录不得被重放改写或重复插入'
      ).toBe(1);

      // 权限键按 middleware/permission.rs:232-246 从 URL 末段派生：export → 导出动作，
      // customer/temporary 在 :570 的 EXPORT_DENIED 黑名单内；secondary list 由 handler 的
      // admin/auditor 角色门管。两例都直接打接口，不依赖任何前端按钮可见性。
      const sales = await openRolePage(browser, 'salesperson', '二次审计读取负例');
      extraContexts.push(sales.context);
      expectDenied(
        await apiCallExpectFail(sales.page, 'GET', '/audit-logs/export-logs?page=1&per_page=20'),
        '556 salesperson 直读二次审计记录'
      );
      const customer = await openRolePage(browser, 'customer', '导出黑名单负例');
      extraContexts.push(customer.context);
      expectDenied(
        await apiCallExpectFail(customer.page, 'GET', '/audit-logs/export?page=1&page_size=20'),
        '556 customer 直调审计导出'
      );
    } finally {
      for (const context of extraContexts.reverse()) await context.close();
      await flushDeferredCleanups(page, queue);
    }
  });
});
