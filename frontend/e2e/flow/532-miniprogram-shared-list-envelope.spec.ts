// 微信小程序独立用例集 · 第二层：共用业务链路列表端点的正向信封与分页形状
//
// 守的是什么：小程序实际调用的共用业务链路列表口，与 PC/H5 打同一套
// /api/v1/erp 端点。本文件钉它们在成功路径上的统一信封（code=200）与分页
// 四要素（items/total/page/page_size）。
//
// 端点选取（Explore 已核实小程序真实调用，且后端出参键已逐一定位）：
//   - /products            → PaginatedResponse，items（product_handler.rs:340/399）
//   - /crm/customers       → PaginatedResponse，items（customer_handler.rs:175）
//   - /ar-reconciliations  → PaginatedResponse，items（ar_reconciliation_handler.rs:156/178）
//   - /color-cards         → PagedResponse，   items（color_card_response_dto.rs:12）
// 四者键名一致（items/total/page/page_size），逐字段对后端结构体核过，非臆造。
//
// 为何不含 /sales/orders：其 service 返回 PaginatedResponse（items），但 handler
// 走 get_mut("list") → fallback get_mut("data") 做脱敏过滤（sales_order_handler.rs:105-139），
// 运行时列表键不固定为 items；在未钉死该端点契约前不写死键名断言，避免假绿。
// 该端点的列表形状另由既有 120/213 等 spec 覆盖。
//
// 调用方：CI flow 分片（按当轮用例全集哈希均分，新 spec 进入分片）。
// 入参：无。全部只读 GET、空条件默认全量，不依赖库里有数据、不写库、不 mock、
// 无 test.skip（空库也应返回 items=[] 与分页四要素）。
// 传给谁：无（本文件是被测契约的断言方）。
// 存什么/存哪里：不写库、不存盘。
import { test, expect } from '../diagnose-fixture';
import { apiCall, loginViaUI } from './helpers';

type PageEnvelope = {
  items: unknown[];
  total: number;
  page: number;
  page_size: number;
};

const PAGE_PARAMS = '?page=1&page_size=5';

test.describe('小程序独立用例集 · 共用列表端点信封与分页形状', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  const listEndpoints = [
    { name: '面料产品列表', path: `/products${PAGE_PARAMS}` },
    { name: '客户档案列表', path: `/crm/customers${PAGE_PARAMS}` },
    { name: '应收账款对账列表', path: `/ar-reconciliations${PAGE_PARAMS}` },
    { name: '色卡列表', path: `/color-cards${PAGE_PARAMS}` },
  ] as const;

  for (const { name, path } of listEndpoints) {
    test(`${name}：成功信封 + items 分页四要素`, async ({ page }) => {
      const res = await apiCall<PageEnvelope>(page, 'GET', path);
      expect(res.code, `${name}成功码应为 200`).toBe(200);
      const data = res.data;
      expect(Array.isArray(data.items), `${name} items 应为数组`).toBe(true);
      expect(Number.isInteger(data.total), `${name} total 应为整数`).toBe(true);
      expect(data.total, `${name} total 应非负`).toBeGreaterThanOrEqual(0);
      expect(data.page, `${name} page 应回显请求值 1`).toBe(1);
      expect(data.page_size, `${name} page_size 应回显请求值 5`).toBe(5);
    });
  }
});
