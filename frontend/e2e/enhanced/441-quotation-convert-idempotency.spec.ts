// 4.41 模块联动 L 联动幂等：报价转销售订单重复触发只生效一次。
// 后端判据：services/quotation_convert_service.rs
//   :77-82 查报价并校验；:96-109 同事务建单、复制明细、置 converted；
//   :458-461 回填 converted_sales_order_id；
//   唯一守卫 :124-129 —— status != "approved" 即 business_displayable 拒绝，
//   无已生成订单查询、无 quotation_id 唯一约束：二次转单靠"已 converted"状态门拦住，
//   不是幂等返回同一订单。若状态门漏掉，二次调用会新建第二张同源订单。
// 端点：handlers/quotation_handler.rs:443-458，POST /quotations/{id}/convert，
//   Path<i64> 传报价 id、无 JSON 体；routes/quotations.rs:29 注册。
// 前置 approved：金额远低于 10 万走 submit 自批（quotation_approval_service.rs:137-154）。
// 响应：首次 ApiResponse 信封 data.id = 销售订单主键（SalesOrderResponse.id），
//   二次失败 400 + BUSINESS_ERROR（utils/error.rs:383-384,824-826）。
// 与既有覆盖分工：13 spec 只做一次转单的字段翻译回读，
//   517 spec 覆盖打样门禁拒绝，均不测"重复转单"。本例专钉二次触发被拒且首单不变。
// 检测力：状态门漏掉则第二次 convert 返回 200/converted_sales_order_id 被改写即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  failureCode,
  APP_ERROR_CODES,
} from '../flow/helpers';

/** 自建一张小额草稿报价单（qty=40 / 单价 12.5 = 500 < 10 万自批档），复用 13 spec 已验证范式。 */
async function seedSmallDraft(page: Page): Promise<number> {
  const ctx = getCtx();
  if (!ctx.quotationProductId) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
  if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
  if (!ctx.userIds[0]) throw new Error('前置缺失：ctx.userIds[0] 未就绪');
  const res = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: ctx.userIds[0],
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: false,
    tax_rate: '0',
    items: [
      {
        product_id: ctx.quotationProductId,
        unit: ctx.quotationProductUnit,
        quantity: '40',
        unit_price: '12.5',
        unit_price_with_tax: '12.5',
      },
    ],
    notes: `E2E-441-IDEMPOTENT`,
  });
  const id = Number(res.data?.id);
  expect(id, '前置失败：报价单创建未返回正整数主键').toBeGreaterThan(0);
  const created = await apiCallRaw<{ status: string }>(page, 'GET', `/quotations/${id}`);
  expect(created.status, '自建报价单应为 draft').toBe('draft');
  return id;
}

test('441-01 报价二次转订单被状态门拒绝且首张订单不变', async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const sourceId = await seedSmallDraft(page);

  // draft → submit 自批；若金额/配置走 BPM 则补 approve，保证 convert 前置 approved（真实流转，不跳过）。
  await apiCall(page, 'POST', `/quotations/${sourceId}/submit`);
  let afterSubmit = await apiCallRaw<{ status: string }>(page, 'GET', `/quotations/${sourceId}`);
  if (afterSubmit.status !== 'approved') {
    await apiCall(page, 'POST', `/quotations/${sourceId}/approve`);
    afterSubmit = await apiCallRaw<{ status: string }>(page, 'GET', `/quotations/${sourceId}`);
  }
  expect(afterSubmit.status, '转订单前置：报价单应为 approved').toBe('approved');

  // 首次转单：信封 data.id 须为正整数销售订单主键。
  const first = await apiCall<{ id?: number }>(page, 'POST', `/quotations/${sourceId}/convert`);
  const firstOrderId = Number(first.data?.id);
  expect(firstOrderId, '首次转单须返回正整数销售订单主键').toBeGreaterThan(0);

  const converted = await apiCallRaw<{ status: string; converted_sales_order_id?: number }>(
    page,
    'GET',
    `/quotations/${sourceId}`
  );
  expect(converted.status, '转单后报价状态应为 converted').toBe('converted');
  expect(Number(converted.converted_sales_order_id), '转单后报价须回填首张销售订单 id').toBe(
    firstOrderId
  );

  // 二次转单：状态门拒绝，400 + BUSINESS_ERROR，无订单主键回写。
  const second = await apiCallExpectFail(page, 'POST', `/quotations/${sourceId}/convert`);
  expect(second.status, '已 converted 的报价二次转单须被状态门拒绝 400').toBe(400);
  expect(
    failureCode(second),
    `二次转单拒绝码须为 BUSINESS_ERROR，实际 ${JSON.stringify(second.code)}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    String(second.message ?? ''),
    `二次转单拒因须可定位，实际 ${JSON.stringify(second.message)}`
  ).not.toBe('');

  // 幂等验证核心：二次失败后回读，报价状态与已回填的订单 id 均未被改写。
  const afterSecond = await apiCallRaw<{ status: string; converted_sales_order_id?: number }>(
    page,
    'GET',
    `/quotations/${sourceId}`
  );
  expect(afterSecond.status, '二次转单失败后报价状态须仍为 converted').toBe('converted');
  expect(
    Number(afterSecond.converted_sales_order_id),
    '二次转单被拒后不得改写已回填的销售订单 id（证明未生成第二张订单）'
  ).toBe(firstOrderId);
});
