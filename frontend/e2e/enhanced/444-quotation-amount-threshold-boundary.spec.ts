// 4.21 审批分支穷举：报价金额三档阈值的等值边界。
// 后端判据：services/quotation_approval_service.rs:47-48 常量 100_000/500_000；
//   :63-77 ApproverRole::from_amount 用 Decimal 两次 < 比较：<10万自批、[10万,50万)经理、
//   ≥50万总经理——等号归下一档；:138 入参是 quotation.total_amount（响应字段，非请求字段）。
//   :154-160 自批落 approved，经理/总经理走 BPM 落 pending_approval。
// 与既有覆盖分工：455 spec 测 500（自批）与 120000（经理档中间值），未测等值边界；
//   469 spec 测折扣阈值（严格 >），与金额档正交；后端单测 quotation_approval_test.rs
//   有等值，但前端 E2E 零覆盖。本例专钉 99999 vs 100000 的状态翻转。
// 金额构造：tax_inclusive=false、tax_rate=0，total_amount = Σ(数量×单价)（calc.rs:25-45）；
//   不传 discount_rate（默认 0），避开折扣审批门，使金额成为唯一分档变量。
// 检测力：若比较符误写成 <=（等值归自批），100000 单返回 approved 即红；
//   若金额取错字段（如取 subtotal 以外值），回读 total_amount 断言即红。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, loginViaUI, ensureTestEntities, getCtx } from '../flow/helpers';

interface QuotationRow {
  id: number;
  status?: string;
  total_amount?: number | string;
}

async function seedQuotationAtAmount(
  page: Page,
  ctx: ReturnType<typeof getCtx>,
  amount: string,
  tag: string
): Promise<number> {
  if (!ctx.quotationProductId) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
  if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
  if (!ctx.userIds[0]) throw new Error('前置缺失：ctx.userIds[0] 未就绪');
  const me = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
  const salesUserId = Number(me.id) || ctx.userIds[0];
  const res = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: salesUserId,
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
        quantity: amount,
        unit_price: '1.00',
        unit_price_with_tax: '1.00',
      },
    ],
    notes: `E2E-444-${tag}`,
  });
  const id = Number(res.data?.id);
  expect(id, `前置失败：金额 ${amount} 报价单创建未返回正整数主键`).toBeGreaterThan(0);
  const created = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${id}`);
  expect(
    Number(created.total_amount),
    `金额 ${amount} 报价单总额回读须等于构造值，否则分档变量不唯一`
  ).toBe(Number(amount));
  return id;
}

test('444-01 金额阈值等值边界：99999 自批 approved，100000 归经理档 pending_approval', async ({
  page,
}) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();

  // 左邻：99999 < 100000，自批直接 approved。
  const belowId = await seedQuotationAtAmount(page, ctx, '99999', 'BELOW');
  await apiCall(page, 'POST', `/quotations/${belowId}/submit`);
  const below = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${belowId}`);
  expect(below.status, '99999 < 10 万门槛须自批 approved（比较符为严格 <，左邻归自批档）').toBe(
    'approved'
  );

  // 等值：100000 == 门槛，等号归经理档，走 BPM → pending_approval。
  const equalId = await seedQuotationAtAmount(page, ctx, '100000', 'EQUAL');
  await apiCall(page, 'POST', `/quotations/${equalId}/submit`);
  const equal = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${equalId}`);
  expect(
    equal.status,
    '100000 == 10 万门槛须归经理档 pending_approval（等号不归自批，比较符误写 <= 会在此红）'
  ).toBe('pending_approval');
});
