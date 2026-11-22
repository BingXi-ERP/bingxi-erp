// 4.14 模糊搜索：报价列表 keyword 按报价单号部分匹配，命中唯一目标单；
//   不存在的片段须零命中，证明搜索键真正下推而非被吞掉返回全量。
// 后端判据：routes/sales.rs 挂 GET /quotations；
//   handlers/quotation_handler.rs:46-52 ListQuotationsQuery.keyword 收查询参数，
//   :118-138 透传 service.list；
//   services/quotation_ops/crud.rs:231-264 `format!("%{}%", k)` 后
//   `QuotationEntity::find().filter(sales_quotation::Column::QuotationNo.like(pattern))`；
//   :243-250 data_scope 在查询构造处下推（非 post-filter），分页 total 与可见集一致。
//   出参 ListQuotationsResponse{list,total,page,page_size}，list[] 为 QuotationResponseDto，
//   models/quotation_response_dto.rs 含 id/quotation_no。
// 与既有覆盖分工：enhanced 441/444/451/453/454 与 flow/02-o2c 都只 POST 建单，
//   无一条 GET /quotations?keyword= 断言；414c 只测客户名空格归一化（sales/orders），
//   两者端点与字段均不同。本例专钉报价单号模糊搜索。
// 检测力：keyword 被吞掉则负例仍含目标单即红；搜索落到错误字段则正向不命中即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCallRaw,
  genCode,
  tryCleanup,
} from '../flow/helpers';

interface QuoteRow {
  id?: number;
  quotation_no?: string;
}
interface QuotePage {
  list?: QuoteRow[];
  total?: number;
  page?: number;
  page_size?: number;
}

async function search(page: Page, keyword: string): Promise<QuotePage> {
  return apiCallRaw<QuotePage>(
    page,
    'GET',
    `/quotations?page=1&page_size=100&keyword=${encodeURIComponent(keyword)}`
  );
}

test.describe('4.14 报价单号模糊搜索', () => {
  test('458-01 keyword 命中报价单号片段，不存在片段零命中', async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
    const ctx = getCtx();
    expect(
      ctx.quotationProductId && ctx.customerId && ctx.userIds[0],
      '[458] 前置：ensureTestEntities 未备齐报价所需产品/客户/销售用户'
    ).toBeTruthy();

    const created = await apiCallRaw<QuoteRow>(page, 'POST', '/quotations', {
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
      notes: `E2E-458-KEYWORD`,
    });
    const id = Number(created?.id);
    expect(id, '[458] 前置：报价单创建未返回正整数主键').toBeGreaterThan(0);
    const no = String(created?.quotation_no ?? '');
    expect(no, '[458] 前置：建单须回传 quotation_no').not.toBe('');

    try {
      const fragment = no.slice(
        Math.max(0, Math.floor(no.length / 2) - 3),
        Math.floor(no.length / 2) + 3
      );
      expect(fragment, '[458] 报价单号须可截取非空中段').not.toBe('');

      const hit = await search(page, fragment);
      expect(Array.isArray(hit.list), '[458] keyword 搜索缺 list 数组').toBe(true);
      expect(
        hit.list?.some(r => Number(r.id) === id),
        `[458] keyword="${fragment}" 须命中目标报价单 ${no}，实际命中 ${JSON.stringify(hit.list?.map(r => r.quotation_no))}`
      ).toBe(true);
      for (const row of hit.list ?? []) {
        expect(
          String(row.quotation_no ?? '').includes(fragment),
          `[458] 命中行 ${row.quotation_no} 的报价单号须含 keyword`
        ).toBe(true);
      }

      const missKey = `E458NOEXIST${genCode('M')}`;
      const miss = await search(page, missKey);
      expect(
        miss.list?.some(r => Number(r.id) === id),
        '[458] 不存在片段不得命中目标单；若仍出现则 keyword 被吞掉返回全量'
      ).toBe(false);
      expect(Number(miss.total), `[458] 不存在片段的总数须为 0，实际 ${miss.total}`).toBe(0);
    } finally {
      await tryCleanup(page, 'DELETE', `/quotations/${id}`, `458 报价单 ${id}`);
    }
  });
});
