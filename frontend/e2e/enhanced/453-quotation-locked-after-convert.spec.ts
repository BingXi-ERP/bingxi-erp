// 4.41 B 链联动：报价转销售订单后报价被锁定，任何字段修改被状态门拒绝且不落库。
// 后端判据：services/quotation_convert_service.rs:459-461 转单写 status="converted"、
//   converted_sales_order_id、converted_at；services/quotation_ops/update.rs:63-73 load_for_update
//   仅 DRAFT/REJECTED 可改，否则 AppError::business_displayable("当前状态不允许此操作")
//   → 400 + BUSINESS_ERROR（utils/error.rs:824-826）。
//   响应 DTO models/quotation_response_dto.rs:18-61 回读 status / converted_sales_order_id / notes。
// 与既有覆盖分工：441-quotation-convert-idempotency 只测二次 convert 被拒（转单幂等），
//   无 converted 后 PUT 断言；451/455 的 PUT 均在 draft 态。全 e2e 无 converted 后禁改断言。
// 假红规避：复用 441 已实跑的 seedSmallDraft→submit(自批)→convert 范式取真 converted 前置；
//   PUT 体必须是合法 DTO（tax_inclusive 布尔），避免 DTO 校验码混入掩盖状态门；
//   拒绝后逐字段回读 notes / total_amount / converted_sales_order_id，证明未半截落库。
// 检测力：状态门漏掉则 PUT 返回 200 或 notes 被改写即红。
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

/** 自建一张小额草稿报价单（qty=40 / 单价 12.5 = 500 < 10 万自批档），复用 441 spec 已验证范式。 */
async function seedSmallDraft(page: Page): Promise<number> {
  const ctx = getCtx();
  if (!ctx.quotationProductId || !ctx.customerId || !ctx.userIds[0]) {
    throw new Error('[453] 前置不成立：ensureTestEntities 未备齐报价产品/客户/当前用户');
  }
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
    notes: `E2E-453-LOCK-BEFORE`,
  });
  const id = Number(res.data?.id);
  expect(id, '前置失败：报价单创建未返回正整数主键').toBeGreaterThan(0);
  return id;
}

interface QuoteRow {
  status: string;
  converted_sales_order_id?: number | null;
  notes?: string | null;
  total_amount?: string | number;
}

test.describe.serial('453 报价转单后禁改', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('453-01 converted 报价的 PUT 被状态门拒绝且逐字段不变', async ({ page }) => {
    const sourceId = await seedSmallDraft(page);

    // draft → submit 自批；若走 BPM 则补 approve，确保 convert 前置 approved（复用 441 已验证范式）
    await apiCall(page, 'POST', `/quotations/${sourceId}/submit`);
    let afterSubmit = await apiCallRaw<{ status: string }>(page, 'GET', `/quotations/${sourceId}`);
    if (afterSubmit.status !== 'approved') {
      await apiCall(page, 'POST', `/quotations/${sourceId}/approve`);
      afterSubmit = await apiCallRaw<{ status: string }>(page, 'GET', `/quotations/${sourceId}`);
    }
    expect(afterSubmit.status, '转订单前置：报价单应为 approved').toBe('approved');

    // 首次转单取真实销售订单 id
    const first = await apiCall<{ id?: number }>(page, 'POST', `/quotations/${sourceId}/convert`);
    const firstOrderId = Number(first.data?.id);
    expect(firstOrderId, '首次转单须返回正整数销售订单主键').toBeGreaterThan(0);

    // 转单后回读基线：converted 态 + 已回填订单 id + 原始备注/金额
    const before = await apiCallRaw<QuoteRow>(page, 'GET', `/quotations/${sourceId}`);
    expect(before.status, '转单后报价状态应为 converted').toBe('converted');
    expect(Number(before.converted_sales_order_id), '转单后应回填销售订单 id').toBe(firstOrderId);

    // converted 后改合法字段（tax_inclusive 布尔 + notes 文本），应被状态门拒绝
    const rejected = await apiCallExpectFail(page, 'PUT', `/quotations/${sourceId}`, {
      tax_inclusive: true,
      notes: 'E2E-453-LOCK-AFTER',
    });
    expect(rejected.status, 'converted 报价修改须被状态门拒绝 400').toBe(400);
    expect(
      failureCode(rejected),
      `拒绝码须为 BUSINESS_ERROR，实际 ${JSON.stringify(rejected.code)}`
    ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(rejected.message ?? ''),
      `拒因须可定位，实际 ${JSON.stringify(rejected.message)}`
    ).not.toBe('');

    // 被拒后逐字段回读：状态、回填订单 id、备注、金额均未被改写（证明无半截落库）
    const after = await apiCallRaw<QuoteRow>(page, 'GET', `/quotations/${sourceId}`);
    expect(after.status, '被拒后状态须仍为 converted').toBe('converted');
    expect(Number(after.converted_sales_order_id), '被拒后不得改写已回填的销售订单 id').toBe(
      firstOrderId
    );
    expect(after.notes, '被拒后备注不得改写（证明 PUT 未落库）').toBe(before.notes);
    expect(String(after.total_amount), '被拒后金额不得改写（证明 PUT 未重算落库）').toBe(
      String(before.total_amount)
    );
  });
});
