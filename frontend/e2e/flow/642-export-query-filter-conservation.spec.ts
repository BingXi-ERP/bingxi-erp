/**
 * 642 通用产品导出的 query 筛选守恒（4.19-3）
 *
 * 六要素：
 * - 功能：钉死 /export/xlsx/products 按 keyword/status/date_from/date_to 下推取数，而非恒导全表。
 * - 调用方：本 spec 自建两条状态与关键词均可区分的产品，自取产品导出令牌，连发五组导出请求。
 * - 入参：admin 会话、审批令牌 plaintext、唯一 tag 拼出的 A/B 产品名与状态码、按落库创建日推导的日期。
 * - 传给谁：POST /products、GET /products/{id}、POST /export-approvals 及 approve/token-once、
 *   GET /export/xlsx/products?keyword|status|date_from|date_to。
 * - 存什么：products 两行、export_approvals 一行；断言写到 xlsx sharedStrings 与 worksheet 文本命中面。
 * - 存哪里：products 与 export_approvals 表；断言后按逆序清理审批申请与两条产品行。
 *
 * 源码判据：backend/src/services/import_export_ops/export.rs:70-148 的 products 分支逐项应用
 * status/keyword/date_from/date_to（IsDeleted=false 恒定前置），ExportQuery 定义见
 * backend/src/services/import_export_service.rs:96-102。日期按 UTC 自然日 00:00:00 解析，
 * 故 date_to 取落库日的次日才覆盖当天行，本用例从产品详情回读的 created_at 推导日界，避免跨零点抖动。
 * xlsx 解包沿用 traversal/39c-export-content.spec.ts 与 39d-export-filter-consistency.spec.ts
 * 的 JSZip + sharedStrings/worksheet 文本口径（两处 helper 均为 spec 内局部实现，无共享导出可复用）。
 */
import { test, expect } from '../diagnose-fixture';
import JSZip from 'jszip';
import {
  deferCleanup,
  apiCallRaw,
  ensureTestEntities,
  flushDeferredCleanups,
  genCode,
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

interface ProductView {
  id?: number;
  status?: string;
  created_at?: string;
}

interface ExportPayload {
  content?: string;
  total?: number;
}

interface ExportText {
  shared: string;
  text: string;
  total: number;
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
  expect(approvalId, '642 前置失败：产品导出审批申请未返回 id').toBeGreaterThan(0);
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
    { comments: '642 筛选守恒用例一级审批' }
  );
  expect(approved?.status, '一级审批通过后必须进入 approved').toBe('approved');

  const tokenView = await apiCallRaw<TokenView>(
    page,
    'GET',
    `/export-approvals/${approvalId}/token-once`
  );
  expect(tokenView?.available, '首次 token-once 必须 available=true').toBe(true);
  if (!tokenView?.token) {
    throw new Error('642 前置失败：首次 token-once 未回明文令牌');
  }
  return tokenView.token;
}

/** 原始 xlsx 信封解包：sharedStrings 单独留一份，供"只含 A 行"断言直接取证。 */
async function fetchExportText(
  page: import('@playwright/test').Page,
  token: string,
  params: Record<string, string>
): Promise<ExportText> {
  const query = new URLSearchParams({ download_token: token, ...params });
  const payload = await apiCallRaw<ExportPayload>(
    page,
    'GET',
    `/export/xlsx/products?${query.toString()}`
  );
  if (typeof payload?.content !== 'string' || payload.content.length === 0) {
    throw new Error(`642 导出信封缺 content：${JSON.stringify(payload)}`);
  }

  const zip = await JSZip.loadAsync(Buffer.from(payload.content, 'base64'));
  let shared = '';
  const sharedFile = zip.file('xl/sharedStrings.xml');
  if (sharedFile) {
    shared = await sharedFile.async('string');
  }
  let worksheet = '';
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith('xl/worksheets/') && path.endsWith('.xml')) {
      worksheet += await zip.file(path)!.async('string');
    }
  }
  return {
    shared,
    text: `${shared}${worksheet}`,
    total: Number(payload.total),
  };
}

test.describe.serial('642 通用产品导出筛选守恒', () => {
  test('642-1 keyword/status/日期四维均下推到 xlsx 内容', async ({ page }) => {
    const queue: DeferredCleanup[] = [];
    await loginViaUI(page);
    await ensureTestEntities(page);

    try {
      const token = await issueProductExportToken(page, queue);
      const tag = genCode('E2E642');
      const nameA = `${tag}_A`;
      const nameB = `${tag}_B`;

      const productA = await apiCallRaw<ProductView>(page, 'POST', '/products', {
        name: nameA,
        code: `${tag}-A`,
        unit: 'm',
        product_type: PRODUCT_TYPE.auxiliary,
        status: 'active',
      });
      const idA = Number(productA?.id);
      expect(idA, '642 前置失败：A 产品未落库').toBeGreaterThan(0);
      deferCleanup(queue, 'DELETE', `/products/${idA}`, `product-${idA}`);

      const productB = await apiCallRaw<ProductView>(page, 'POST', '/products', {
        name: nameB,
        code: `${tag}-B`,
        unit: 'm',
        product_type: PRODUCT_TYPE.auxiliary,
        status: 'inactive',
      });
      const idB = Number(productB?.id);
      expect(idB, '642 前置失败：B 产品未落库').toBeGreaterThan(0);
      deferCleanup(queue, 'DELETE', `/products/${idB}`, `product-${idB}`);

      const readA = await apiCallRaw<ProductView>(page, 'GET', `/products/${idA}`);
      const readB = await apiCallRaw<ProductView>(page, 'GET', `/products/${idB}`);
      expect(readA?.status, 'A 产品必须是 active，否则 status 维度无从区分').toBe('active');
      expect(readB?.status, 'B 产品必须是 inactive，否则 status 维度无从区分').toBe('inactive');
      if (typeof readA?.created_at !== 'string') {
        throw new Error(`642 前置失败：A 产品详情未回 created_at：${JSON.stringify(readA)}`);
      }
      const createdDay = readA.created_at.slice(0, 10);
      const dayMs = Date.parse(`${createdDay}T00:00:00Z`);
      expect(Number.isNaN(dayMs), '产品 created_at 必须可解析为 UTC 日界').toBe(false);
      const tomorrow = new Date(dayMs + 86_400_000).toISOString().slice(0, 10);
      const yesterday = new Date(dayMs - 86_400_000).toISOString().slice(0, 10);

      // keyword 单点：A 名进 sharedStrings，B 名整个 xlsx 都不出现。
      const byKeyword = await fetchExportText(page, token, { keyword: nameA });
      expect(byKeyword.shared.includes(nameA), 'keyword=A 必须把 A 行写进 sharedStrings').toBe(
        true
      );
      expect(byKeyword.text.includes(nameB), 'keyword=A 不得导出 B 行').toBe(false);

      // 无筛选：两行都必须在全量导出里，证明上面排除 B 是筛选生效而非导出体空。
      const unfiltered = await fetchExportText(page, token, {});
      expect(unfiltered.text.includes(nameA), '无 keyword 必须含 A 行').toBe(true);
      expect(unfiltered.text.includes(nameB), '无 keyword 必须含 B 行').toBe(true);

      // status 与唯一 tag 同发：只留下 inactive 的 B。
      const byStatus = await fetchExportText(page, token, {
        keyword: tag,
        status: 'inactive',
      });
      expect(byStatus.text.includes(nameB), 'status=inactive 必须含 B 行').toBe(true);
      expect(byStatus.text.includes(nameA), 'status=inactive 不得含 active 的 A 行').toBe(false);

      // date_from 下推：取落库日次日，两行都应被排除。
      const byDateFrom = await fetchExportText(page, token, {
        keyword: tag,
        date_from: tomorrow,
      });
      expect(byDateFrom.text.includes(nameA), 'date_from=次日不得含当天创建的 A 行').toBe(false);
      expect(byDateFrom.text.includes(nameB), 'date_from=次日不得含当天创建的 B 行').toBe(false);

      // date_to 下推：取落库日前一天，两行都应被排除。
      const byDateTo = await fetchExportText(page, token, {
        keyword: tag,
        date_to: yesterday,
      });
      expect(byDateTo.text.includes(nameA), 'date_to=前一日不得含当天创建的 A 行').toBe(false);
      expect(byDateTo.text.includes(nameB), 'date_to=前一日不得含当天创建的 B 行').toBe(false);

      // 日期窗口正向对照：落库日 00:00 至次日 00:00 必须覆盖两行，排除上两项空集假象。
      const byWindow = await fetchExportText(page, token, {
        keyword: tag,
        date_from: createdDay,
        date_to: tomorrow,
      });
      expect(byWindow.text.includes(nameA), '日期窗口必须含 A 行').toBe(true);
      expect(byWindow.text.includes(nameB), '日期窗口必须含 B 行').toBe(true);
      expect(byWindow.total, '日期窗口导出 total 必须为正').toBeGreaterThan(0);
    } finally {
      await flushDeferredCleanups(page, queue);
    }
  });
});
