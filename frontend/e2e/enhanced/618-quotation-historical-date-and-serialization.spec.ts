// 范围：4.30 时间边界——报价主表历史日期与闰日写入后，按 NaiveDate 形态逐字回读。
// 判据：日期字段无 validator，service 只校验有效期不早于报价日，历史日期与闰日均属合法输入。
// 证据：models/quotation_create_dto.rs:17-18；services/quotation_ops/calc.rs:51-70；
//   models/quotation_response_dto.rs:23-24,60-61（serde 默认输出 YYYY-MM-DD / RFC3339 Z）。
// 端点：POST /quotations 建单（sales_user_id 取 /auth/me 的真实用户），GET /quotations/{id} 回读。
// 检测力：日期若被改写为带 T/Z 的 ISO 串或发生时区偏移，逐字断言与形态正则即红；
//   闰日或跨月正区间被拒时，建单步骤即红。
// 正交：444 spec 测金额阈值、430-431 spec 测采购单日期顺序；本例只钉报价端点日期写入与出参形态。
//   未来日期可录与 4.30 目标冲突，属功能缺失，只登记不固化绿色断言。
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
  created_at?: string;
}

interface DateCase {
  label: string;
  quotationDate: string;
  validUntil: string;
}

async function createQuotationAtDates(page: Page, dates: DateCase, tag: string): Promise<number> {
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
    notes: `E2E-618-${tag}`,
  });
  const id = Number(res.data?.id);
  expect(id, `前置失败：${dates.label} 建单未返回正整数主键`).toBeGreaterThan(0);
  return id;
}

test('报价历史日期与闰日可录，日期出参按纯日期串原样回读', async ({ page }) => {
  const tag = genCode('618');
  await loginViaUI(page);
  await ensureTestEntities(page);

  const cases: DateCase[] = [
    { label: '历史日期', quotationDate: '2000-01-01', validUntil: '2000-01-31' },
    { label: '闰日', quotationDate: '2024-02-29', validUntil: '2024-03-01' },
  ];

  for (const dates of cases) {
    const id = await createQuotationAtDates(page, dates, tag);
    try {
      const created = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${id}`);
      expect(created.quotation_date, `${dates.label}：quotation_date 须逐字回读`).toBe(
        dates.quotationDate
      );
      expect(created.valid_until, `${dates.label}：valid_until 须逐字回读`).toBe(dates.validUntil);
      expect(
        created.quotation_date,
        `${dates.label}：日期出参须为 YYYY-MM-DD，不得带 T/Z 时区后缀`
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        created.valid_until,
        `${dates.label}：有效期出参须为 YYYY-MM-DD，不得带 T/Z 时区后缀`
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        created.created_at,
        `${dates.label}：时间戳出参须为 RFC3339 Z，不得断言本地时区`
      ).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    } finally {
      await tryCleanup(page, 'POST', `/quotations/${id}/cancel`, `${tag} ${dates.label} 清理报价`);
    }
  }
});
