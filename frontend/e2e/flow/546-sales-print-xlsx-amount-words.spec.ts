// 功能：钉销售订单 xlsx 打印主表的大写金额行；调用方 CI e2e flow 分片；
// 入参仅真实 HTTP API 与登录会话；传给谁，断言大写金额与详情回读总金额逐字同源；
// 存什么，不写库，只在测试中建草稿订单并清理；存哪里，无。
// 检测力自证：若后端删掉“金额大写”行或写错金额，解包文本断言即红。
import JSZip from 'jszip';
import { test, expect } from '../diagnose-fixture';
import {
  API_BASE,
  API_PREFIX,
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

const EXPECTED_WORDS = '壹拾贰元叁角肆分';

async function extractXlsxText(body: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(body);
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

test.describe('546 销售订单 xlsx 打印大写金额', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('销售订单打印带与详情总金额同源的大写金额', async ({ page }) => {
    test.setTimeout(300_000);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(ctx.customerId, '夹具应提供销售订单客户').toBeTruthy();
    expect(ctx.productIds[0], '夹具应提供销售订单产品').toBeTruthy();

    const created = await apiCall<{ id?: number }>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      remarks: 'E2E 销售大写金额',
      items: [
        {
          product_id: ctx.productIds[0],
          quantity: '1',
          unit_price: '12.34',
        },
      ],
    });
    const orderId = created.data?.id;
    expect(orderId, `销售订单创建失败：${JSON.stringify(created).slice(0, 200)}`).toBeTruthy();

    try {
      const detail = await apiCallRaw<{ total_amount?: string }>(
        page,
        'GET',
        `/sales/orders/${orderId}`
      );
      expect(
        detail.total_amount,
        `销售订单 ${orderId} 详情 total_amount 缺失：${JSON.stringify(detail).slice(0, 200)}`
      ).toBeTruthy();
      expect(
        Number(detail.total_amount),
        `销售订单 ${orderId} 总金额应为 12.34，实际 ${detail.total_amount}`
      ).toBe(12.34);

      const print = await page.request.get(
        `${API_BASE}${API_PREFIX}/sales/orders/${orderId}/print-xlsx`,
        {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          timeout: 60_000,
        }
      );
      expect(print.status(), '销售订单 print-xlsx 应 200').toBe(200);
      const text = await extractXlsxText(await print.body());
      expect(text, '销售订单 xlsx 缺“金额大写”行').toContain('金额大写');
      expect(text, `销售订单 xlsx 大写金额应为 ${EXPECTED_WORDS}`).toContain(EXPECTED_WORDS);
    } finally {
      if (orderId) {
        await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, '销售大写金额订单');
      }
    }
  });
});
