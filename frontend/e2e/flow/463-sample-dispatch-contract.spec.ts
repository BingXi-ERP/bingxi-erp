// 调样单族契约（CRUD + xlsx 打印腿，真实 API 级）
//
// 守的是什么：调样单端点族（/sample-dispatches）的信封形状、后端取号格式与
// xlsx 打印产物形态，全部断言基于真实响应结构，无放宽、无 mock：
// - GET /sample-dispatches：标准分页信封 PaginatedResponse{items,total,page,page_size}，
//   空表（items=[] total=0）同样成立；
// - POST /sample-dispatches：单号由后端生成（BX-DY 年月号段），创建请求体不传号，
//   断 document_no 匹配 /^BX-DY\d{6}-\d{3}$/；行级金额由后端按 米数×单价 计算，
//   断回显值而非采信入参；customer_name 经归属客户行取真名；
// - PUT /sample-dispatches/{id}：主表字段全量替换 + 明细整单替换，断新明细金额回显；
// - GET /sample-dispatches/{id}：详情三键 order/customer_name/items；
// - GET /sample-dispatches/{id}/print-xlsx：xlsx 二进制（content-type 为
//   spreadsheetml sheet + zip 魔数 PK），不产 JSON 信封；
// - DELETE /sample-dispatches/{id}：物理删除，测后清理自建数据（前置自建：客户/产品
//   均由本 spec 经 /crm/customers 与 /products 自建，不依赖库里恰好存在的数据）。
import { test, expect, type Page } from '../diagnose-fixture';
import { type APIResponse } from '@playwright/test';
import { API_BASE, API_PREFIX, apiCall, apiCallRaw, loginViaUI } from './helpers';

/** 从上下文 Cookie 取 csrf 双提交令牌（helpers 的 getCsrfToken 未导出，此处同构自取）。 */
async function csrfTokenOf(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const csrf = cookies.find(c => c.name === 'csrf_token');
  if (!csrf) {
    throw new Error('csrf_token cookie not found — loginViaUI 之后应存在');
  }
  return csrf.value;
}

/** 调样单主表行（出参键 = models/sample_dispatch_order.rs 字段名，snake_case） */
interface SampleDispatchOrder {
  id: number;
  document_no: string;
  customer_id: number;
  department: string;
  dispatch_date: string;
  opening_balance: string;
  total_amount: string;
  total_collections: string;
  closing_balance: string;
  remarks: string | null;
  created_by: number | null;
}

/** 调样单行级明细（amount 由后端计算，Decimal 出参为字符串形态） */
interface SampleDispatchItem {
  id: number;
  dispatch_order_id: number;
  product_id: number;
  dye_lot_no: string;
  color_no: string;
  composition: string;
  quantity_meters: string;
  unit_price: string;
  amount: string;
  sort_order: number;
}

/** 详情响应：主表 + 客户真名 + 明细 */
interface SampleDispatchDetail {
  order: SampleDispatchOrder;
  customer_name: string;
  items: SampleDispatchItem[];
}

interface CustomerCreated {
  id: number;
  customer_name: string;
}

interface ProductCreated {
  id: number;
  name: string;
}

test.describe('调样单族契约（真实 API 级）', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('GET /sample-dispatches 返回分页信封（四键不变式，空表则 items=[] total=0）', async ({
    page,
  }) => {
    const env = await apiCallRaw<{
      items: SampleDispatchOrder[];
      total: number;
      page: number;
      page_size: number;
    }>(page, 'GET', '/sample-dispatches?page=1&page_size=20');

    expect(env, '列表响应 data 应存在（分页信封对象）').toBeTruthy();
    expect(Array.isArray(env), 'data 不应是裸数组').toBe(false);
    expect(Array.isArray(env.items), 'items 应为数组').toBe(true);
    expect(typeof env.total, 'total 应为 number').toBe('number');
    expect(env.page, 'page 应回显请求页').toBe(1);
    expect(typeof env.page_size, 'page_size 应为 number').toBe('number');
    expect(env.total, 'total 应不小于当前页 items 长度').toBeGreaterThanOrEqual(env.items.length);
    expect(env.items.length, '单页 items 不应超过 page_size').toBeLessThanOrEqual(env.page_size);
  });

  test('创建/详情/更新/打印/删除全链路：单号 BX-DY 年月格式、金额后端计算、xlsx 二进制', async ({
    page,
  }) => {
    const stamp = Date.now();
    // 前置自建：客户与产品（不依赖库里恰好存在的数据）
    const customerEnv = await apiCall<CustomerCreated>(page, 'POST', '/crm/customers', {
      customer_name: `e2e 调样客户 ${stamp}`,
      customer_code: `E2E-DY-${stamp}`,
    });
    expect(customerEnv.code, '自建客户应成功').toBe(200);
    const productEnv = await apiCall<ProductCreated>(page, 'POST', '/products', {
      name: `e2e 调样品 ${stamp}`,
      code: `E2E-DYP-${stamp}`,
      unit: '米',
    });
    expect(productEnv.code, '自建产品应成功').toBe(200);
    const customerId = customerEnv.data.id;
    const productId = productEnv.data.id;
    const dispatchIdsToDelete: number[] = [];

    try {
      // 创建：单号后端生成（请求体不含 document_no 键），行级金额后端计算
      const created = await apiCall<SampleDispatchDetail>(page, 'POST', '/sample-dispatches', {
        customer_id: customerId,
        department: 'e2e 调样部',
        dispatch_date: '2026-07-15',
        opening_balance: '100.00',
        total_amount: '26.25',
        total_collections: '5.00',
        closing_balance: '121.25',
        remarks: 'e2e 契约单',
        items: [
          {
            product_id: productId,
            dye_lot_no: 'G1',
            color_no: '大红',
            composition: '天丝麻',
            quantity_meters: '10.5',
            unit_price: '2.5',
          },
        ],
      });
      expect(created.code, '创建调样单应成功').toBe(200);
      expect(created.message, '创建应带固定成功文案').toBe('创建成功');
      expect(
        created.data.order.document_no,
        '单号应为 BX-DY + 年月 6 位 + 横杠 + 3 位流水（后端取号）'
      ).toMatch(/^BX-DY\d{6}-\d{3}$/);
      expect(created.data.customer_name, '客户名称应取归属客户真名').toBe(`e2e 调样客户 ${stamp}`);
      expect(created.data.items.length, '明细应有一行').toBe(1);
      expect(created.data.items[0].amount, '行级金额应为米数×单价（后端计算）').toBe('26.25');
      const dispatchId = created.data.order.id;
      dispatchIdsToDelete.push(dispatchId);

      // 详情：三键结构回读
      const detail = await apiCallRaw<SampleDispatchDetail>(
        page,
        'GET',
        `/sample-dispatches/${dispatchId}`
      );
      expect(detail.order.id, '详情主行 id 应一致').toBe(dispatchId);
      expect(detail.order.document_no, '详情单号应与创建回显一致').toBe(
        created.data.order.document_no
      );
      expect(detail.customer_name, '详情客户名称应为真名').toBe(`e2e 调样客户 ${stamp}`);
      expect(Array.isArray(detail.items), '详情 items 应为数组').toBe(true);

      // 更新：明细整单替换，断新行金额回显与缸号替换
      const updated = await apiCall<SampleDispatchDetail>(
        page,
        'PUT',
        `/sample-dispatches/${dispatchId}`,
        {
          customer_id: customerId,
          department: 'e2e 调样部改',
          dispatch_date: '2026-07-16',
          opening_balance: '100.00',
          total_amount: '24.00',
          total_collections: '5.00',
          closing_balance: '119.00',
          remarks: 'e2e 契约单改',
          items: [
            {
              product_id: productId,
              dye_lot_no: 'G2',
              color_no: '藏青',
              composition: '天丝麻',
              quantity_meters: '8',
              unit_price: '3',
            },
          ],
        }
      );
      expect(updated.code, '更新调样单应成功').toBe(200);
      expect(updated.data.order.department, '主表部门应全量替换').toBe('e2e 调样部改');
      expect(updated.data.order.document_no, '更新不应重取单号').toBe(
        created.data.order.document_no
      );
      expect(updated.data.items.length, '更新后明细应只有新一行').toBe(1);
      expect(updated.data.items[0].dye_lot_no, '明细应整单替换').toBe('G2');
      expect(updated.data.items[0].amount, '新明细金额应为米数×单价').toBe('24.00');

      // 打印：xlsx 二进制（content-type + zip 魔数 PK；打印产物不产 JSON 信封）
      const token = await csrfTokenOf(page);
      const printResp: APIResponse = await page.request.get(
        `${API_BASE}${API_PREFIX}/sample-dispatches/${dispatchId}/print-xlsx`,
        {
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': token,
          },
        }
      );
      expect(printResp.status(), '打印 xlsx 应 200').toBe(200);
      expect(printResp.headers()['content-type'], 'content-type 应为 xlsx sheet MIME').toContain(
        'spreadsheetml'
      );
      const bytes = await printResp.body();
      expect(bytes.length, 'xlsx 字节流应非空').toBeGreaterThan(0);
      expect(bytes[0], 'xlsx 是 zip 容器，首字节应为 P').toBe(0x50);
      expect(bytes[1], 'zip 魔数次字节应为 K').toBe(0x4b);
    } finally {
      // 清理：自建调样单 → 产品 → 客户（逆序，不留测试数据）
      for (const id of dispatchIdsToDelete) {
        const delEnv = await apiCall(page, 'DELETE', `/sample-dispatches/${id}`);
        expect(delEnv.code, `清理调样单 ${id} 应成功`).toBe(200);
      }
      const delProduct = await apiCall(page, 'DELETE', `/products/${productId}`);
      expect(delProduct.code, `清理产品 ${productId} 应成功`).toBe(200);
      const delCustomer = await apiCall(page, 'DELETE', `/crm/customers/${customerId}`);
      expect(delCustomer.code, `清理客户 ${customerId} 应成功`).toBe(200);
    }
  });
});
