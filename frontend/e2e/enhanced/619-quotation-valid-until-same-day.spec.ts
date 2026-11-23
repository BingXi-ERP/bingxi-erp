// 范围：4.30 时间边界——报价有效期与报价日同日、以及正向跨月区间的放行与逐字回读。
// 判据：validate_create 只要求 valid_until 不早于 quotation_date，等号合法、正向区间合法。
// 证据：services/quotation_ops/calc.rs:55-59；models/quotation_create_dto.rs:17-18（日期无 validator）；
//   models/quotation_response_dto.rs:23-24（NaiveDate 默认输出 YYYY-MM-DD）。
// 端点：POST /quotations 建单，GET /quotations/{id} 回读，sales_user_id 取 /auth/me 的真实用户。
// 检测力：若把不早于比较误写成严格大于（同日被拒）或反向比较（正区间被拒），建单步骤即红；
//   若回读取错字段或发生日期偏移，逐字断言即红。
// 正交：430-431 spec 测采购单日期顺序、444 spec 测金额阈值；本例只钉报价端点有效期边界。
//   倒挂校验只存在于 service、DTO 无校验注解，按判责纪律登记为功能缺失，不固化拒绝断言。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import {
  apiCall,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from '../flow/helpers';

interface QuotationRow {
  id: number;
  quotation_date?: string;
  valid_until?: string;
}

interface ValidityCase {
  label: string;
  quotationDate: string;
  validUntil: string;
}

async function createQuotationAtValidity(
  page: Page,
  dates: ValidityCase,
  tag: string
): Promise<number> {
  const ctx = getCtx();
  if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
  if (!ctx.quotationProductId) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
  if (!ctx.quotationProductUnit) throw new Error('前置缺失：ctx.quotationProductUnit 未就绪');

  const me = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
  expect(Number(me.id), '前置失败：/auth/me 未返回正整数用户主键').toBeGreaterThan(0);

  // 后端 quotations 域未注册 DELETE /quotations/{id}，测试产物用真实的 cancel 动作收口。
  const res = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: Number(me.id),
    quotation_date: dates.quotationDate,
    valid_until: dates.validUntil,
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
        quantity: '1',
        unit_price: '1.00',
        unit_price_with_tax: '1.00',
      },
    ],
    notes: `E2E-619-${tag}`,
  });
  const id = Number(res.data?.id);
  expect(id, `前置失败：${dates.label} 建单未返回正整数主键`).toBeGreaterThan(0);
  return id;
}

test('报价有效期同日与正向区间放行，回读逐字一致', async ({ page }) => {
  const tag = genCode('619');
  await loginViaUI(page);
  await ensureTestEntities(page);

  const cases: ValidityCase[] = [
    { label: '有效期与报价日同日', quotationDate: '2025-02-28', validUntil: '2025-02-28' },
    { label: '正向跨月区间', quotationDate: '2025-02-28', validUntil: '2025-03-01' },
  ];

  for (const dates of cases) {
    const id = await createQuotationAtValidity(page, dates, tag);
    try {
      const created = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${id}`);
      expect(created.quotation_date, `${dates.label}：quotation_date 须逐字回读`).toBe(
        dates.quotationDate
      );
      expect(created.valid_until, `${dates.label}：valid_until 须逐字回读`).toBe(dates.validUntil);
    } finally {
      await tryCleanup(page, 'POST', `/quotations/${id}/cancel`, `${tag} ${dates.label} 清理报价`);
    }
  }
});
