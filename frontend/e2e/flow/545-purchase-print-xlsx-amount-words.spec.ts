// 功能：钉采购订单与采购收货单 xlsx 打印主表的大写金额行；调用方 CI e2e flow 分片；
// 入参仅真实 HTTP API 与登录会话；传给谁，断言大写金额与详情回读金额逐字同源；
// 存什么，不写库，只在测试中建草稿单据并清理；存哪里，无。
// 检测力自证：若后端删掉任一“大写金额”行或写错金额，解包文本断言即红。
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

test.describe('545 采购 xlsx 打印大写金额', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('采购订单与收货单打印均带与金额同源的大写金额', async ({ page }) => {
    test.setTimeout(420_000);
    await ensureTestEntities(page);
    const ctx = getCtx();

    const created = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      supplier_id: ctx.supplierId,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      order_date: new Date().toISOString().slice(0, 10),
      items: [
        {
          material_id: ctx.productIds[0],
          quantity_ordered: '1',
          unit_price: '12.34',
          tax_rate: 0,
        },
      ],
    });
    const orderId = created.data?.id;
    expect(orderId, `采购订单创建失败：${JSON.stringify(created).slice(0, 200)}`).toBeTruthy();
    let receiptId: number | undefined;

    try {
      const detail = await apiCallRaw<{ total_amount?: string }>(
        page,
        'GET',
        `/purchase/orders/${orderId}`
      );
      expect(
        detail.total_amount,
        `采购订单 ${orderId} 详情 total_amount 缺失：${JSON.stringify(detail).slice(0, 200)}`
      ).toBeTruthy();
      expect(
        Number(detail.total_amount),
        `采购订单 ${orderId} 金额应为 12.34，实际 ${detail.total_amount}`
      ).toBe(12.34);

      const orderPrint = await page.request.get(
        `${API_BASE}${API_PREFIX}/purchase/orders/${orderId}/print-xlsx`,
        {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          timeout: 60_000,
        }
      );
      expect(orderPrint.status(), '采购订单 print-xlsx 应 200').toBe(200);
      const orderText = await extractXlsxText(await orderPrint.body());
      expect(orderText, '采购订单 xlsx 缺“大写金额”行').toContain('大写金额');
      expect(orderText, `采购订单 xlsx 大写金额应为 ${EXPECTED_WORDS}`).toContain(EXPECTED_WORDS);

      const product = await apiCallRaw<{ code?: string }>(
        page,
        'GET',
        `/products/${ctx.productIds[0]}`
      );
      expect(product.code, '产品应能读回 code 作为收货 material_code').toBeTruthy();
      const materialCode = String(product.code);
      const receipt = await apiCall<{ id?: number }>(page, 'POST', '/purchase/receipts', {
        supplier_id: ctx.supplierId,
        warehouse_id: ctx.warehouseIds[0],
        receipt_date: new Date().toISOString().slice(0, 10),
        items: [
          {
            line_no: 1,
            material_id: ctx.productIds[0],
            material_code: materialCode,
            material_name: 'E2E 采购大写金额',
            unit_master: 'm',
            quantity: '1',
            quantity_alt: '0',
            unit_price: '12.34',
          },
        ],
      });
      receiptId = receipt.data?.id;
      expect(
        receiptId,
        `采购收货单创建失败：${JSON.stringify(receipt).slice(0, 200)}`
      ).toBeTruthy();

      const receiptPrint = await page.request.get(
        `${API_BASE}${API_PREFIX}/purchase/receipts/${receiptId}/print-xlsx`,
        {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          timeout: 60_000,
        }
      );
      expect(receiptPrint.status(), '采购收货单 print-xlsx 应 200').toBe(200);
      const receiptText = await extractXlsxText(await receiptPrint.body());
      expect(receiptText, '采购收货单 xlsx 缺“大写金额”行').toContain('大写金额');
      expect(receiptText, `采购收货单 xlsx 大写金额应为 ${EXPECTED_WORDS}`).toContain(
        EXPECTED_WORDS
      );
    } finally {
      if (receiptId) {
        await tryCleanup(page, 'DELETE', `/purchase/receipts/${receiptId}`, '采购大写金额收货单');
      }
      if (orderId) {
        await tryCleanup(page, 'DELETE', `/purchase/orders/${orderId}`, '采购大写金额订单');
      }
    }
  });
});
