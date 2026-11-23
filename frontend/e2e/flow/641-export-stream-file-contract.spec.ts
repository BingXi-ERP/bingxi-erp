/**
 * 641 流式产品导出的真文件响应契约（4.4-2 / 4.19-1）
 *
 * 六要素：
 * - 功能：钉死 /export/stream/products 返回真实 xlsx 文件流，而非被 ApiResponse 解包的 JSON。
 * - 调用方：本 spec 独立登录后创建产品行与产品导出审批令牌，直接发原始 HTTP GET。
 * - 入参：admin 会话、审批令牌 plaintext、可区分的产品 name/code/unit/product_type。
 * - 传给谁：POST /products、POST /export-approvals、POST /export-approvals/{id}/approve、
 *   GET /export-approvals/{id}/token-once、GET /export/stream/products。
 * - 存什么：products 一行、export_approvals 一行；断言写到 HTTP 状态码、三个响应头与文件魔数。
 * - 存哪里：products 与 export_approvals 表；断言后按逆序清理审批申请与产品行。
 *
 * 源码判据：backend/src/handlers/import_export_handler.rs:389 定 Content-Type，
 * :391-394 定 Content-Disposition 的纯 ASCII 文件名，:395 定 Content-Length 为 xlsx 字节数。
 * 令牌获取路径参照 flow/447-print-template-export-masking-and-dead-endpoint.spec.ts 的 447-5：
 * 低风险申请经一级 approve 后由 token-once 回明文一次；通用导出端点当前不校验该令牌，
 * 本用例按前置注入它，不把"令牌被受理门消费"写成假断言。
 */
import { test, expect } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  deferCleanup,
  apiCallRaw,
  ensureTestEntities,
  flushDeferredCleanups,
  genCode,
  genName,
  loginViaUI,
  type DeferredCleanup,
} from './helpers';
import { PRODUCT_TYPE } from '../../src/constants/product-type';

interface ApprovalView {
  id?: number;
  status?: string;
}

interface TokenView {
  available?: boolean;
  token?: string;
}

/** 低风险产品导出申请：一级审批即签发令牌，明文只从 token-once 取一次。 */
async function issueProductExportToken(
  page: import('@playwright/test').Page,
  queue: DeferredCleanup[]
): Promise<string> {
  const created = await apiCallRaw<ApprovalView>(page, 'POST', '/export-approvals', {
    resource_type: 'product',
    export_params: {},
    estimated_rows: 10,
    file_format: 'xlsx',
  });
  const approvalId = Number(created?.id);
  expect(approvalId, '641 前置失败：产品导出审批申请未返回 id').toBeGreaterThan(0);
  expect(created?.status, '新建导出审批初始状态应为 pending').toBe('pending');
  deferCleanup(
    queue,
    'POST',
    `/export-approvals/${approvalId}/cancel`,
    `export-approval-${approvalId}`
  );

  const approved = await apiCallRaw<ApprovalView>(
    page,
    'POST',
    `/export-approvals/${approvalId}/approve`,
    { comments: '641 导出契约用例一级审批' }
  );
  expect(approved?.status, '一级审批通过后必须进入 approved').toBe('approved');

  const tokenView = await apiCallRaw<TokenView>(
    page,
    'GET',
    `/export-approvals/${approvalId}/token-once`
  );
  expect(tokenView?.available, '首次 token-once 必须 available=true').toBe(true);
  if (!tokenView?.token) {
    throw new Error('641 前置失败：首次 token-once 未回明文令牌');
  }
  return tokenView.token;
}

test.describe.serial('641 流式产品导出文件契约', () => {
  test('641-1 原始 GET 响应头与 xlsx 魔数必须逐字对齐源码', async ({ page }) => {
    const queue: DeferredCleanup[] = [];
    await loginViaUI(page);
    await ensureTestEntities(page);

    try {
      const token = await issueProductExportToken(page, queue);
      const product = await apiCallRaw<{ id?: number }>(page, 'POST', '/products', {
        name: genName('641STREAM'),
        code: genCode('641S'),
        unit: 'm',
        product_type: PRODUCT_TYPE.auxiliary,
      });
      const productId = Number(product?.id);
      expect(productId, '641 前置失败：至少需一行产品，POST /products 未返回 id').toBeGreaterThan(
        0
      );
      deferCleanup(queue, 'DELETE', `/products/${productId}`, `product-${productId}`);

      const url = `${API_BASE}${API_PREFIX}/export/stream/products?download_token=${encodeURIComponent(token)}`;
      const response = await page.request.get(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      expect(response.status(), '流式导出应直接返回 200，而非被审批门拦截').toBe(200);

      const headers = response.headers();
      expect(
        headers['content-type'],
        'Content-Type 必须逐字为 xlsx mime，不能有 charset 或多值'
      ).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(
        headers['content-disposition'],
        'Content-Disposition 必须带纯 ASCII 文件名 products.xlsx'
      ).toContain('attachment; filename="products.xlsx"');

      const body = await response.body();
      expect(body.length, 'xlsx 文件体不得为空').toBeGreaterThan(2);
      expect(body.subarray(0, 2).toString('latin1'), 'xlsx 属 zip 容器，头两字节必须是 PK').toBe(
        'PK'
      );
      const contentLength = headers['content-length'];
      expect(contentLength, 'Content-Length 必须存在').toBeDefined();
      expect(Number(contentLength), 'Content-Length 必须等于真实文件体字节数').toBe(body.length);
    } finally {
      await flushDeferredCleanups(page, queue);
    }
  });
});
