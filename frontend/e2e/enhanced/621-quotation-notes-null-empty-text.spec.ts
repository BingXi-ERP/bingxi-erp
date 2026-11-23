// 范围：4.31 文本边界——报价主表 notes 省略、显式 null、空串、正常文本三态的落库与回读。
// 判据：notes 为 Option<String>，建单直写列；未填落 NULL、空串原样保留、正常文本逐字回读。
// 证据：models/quotation_create_dto.rs:64（Option<String>）；
//   services/quotation_ops/crud.rs:99-100（Set(dto.notes.clone())）；
//   models/quotation_response_dto.rs:58（Option<String>，serde 默认输出 null）。
// 端点：POST /quotations 建单，GET /quotations/{id} 回读，sales_user_id 取 /auth/me 的真实用户。
// 检测力：若把空串与 NULL 合并（如写入前过滤空串），空串态断言即红；
//   若做截断或转义，正常文本逐字断言即红。
// 正交：439-customer-field-length、439-charset 测客户字段长度与字符集；本例只钉报价 notes 空值语义。
//   超长备注无长度门属功能缺失，不固化"接受超长"断言。
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
  notes?: string | null;
}

interface NotesCase {
  label: string;
  omitNotes: boolean;
  notes?: string | null;
  expected: string | null;
}

async function createQuotationWithNotes(page: Page, notesCase: NotesCase) {
  const ctx = getCtx();
  if (!ctx.customerId) throw new Error('前置缺失：ctx.customerId 未就绪');
  if (!ctx.quotationProductId) throw new Error('前置缺失：ctx.quotationProductId 未就绪');
  if (!ctx.quotationProductUnit) throw new Error('前置缺失：ctx.quotationProductUnit 未就绪');

  const me = await apiCallRaw<{ id?: number }>(page, 'GET', '/auth/me');
  expect(Number(me.id), '前置失败：/auth/me 未返回正整数用户主键').toBeGreaterThan(0);

  // 后端 quotations 域未注册 DELETE /quotations/{id}，测试产物用真实的 cancel 动作收口。
  const payload: Record<string, unknown> = {
    customer_id: ctx.customerId,
    sales_user_id: Number(me.id),
    quotation_date: '2025-04-01',
    valid_until: '2025-04-30',
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
  };
  if (!notesCase.omitNotes) payload.notes = notesCase.notes;

  const res = await apiCall<{ id?: number }>(page, 'POST', '/quotations', payload);
  const id = Number(res.data?.id);
  expect(id, `前置失败：${notesCase.label} 建单未返回正整数主键`).toBeGreaterThan(0);
  return id;
}

test('报价 notes 未填、空串与正常文本三态落库差异按原样回读', async ({ page }) => {
  const tag = genCode('621');
  await loginViaUI(page);
  await ensureTestEntities(page);

  const normalText = `E2E-621-${tag} 正常文本：含中文与空格`;
  const cases: NotesCase[] = [
    { label: '省略 notes', omitNotes: true, expected: null },
    { label: '显式 null', omitNotes: false, notes: null, expected: null },
    { label: '空串', omitNotes: false, notes: '', expected: '' },
    { label: '正常文本', omitNotes: false, notes: normalText, expected: normalText },
  ];

  for (const notesCase of cases) {
    const id = await createQuotationWithNotes(page, notesCase);
    try {
      const created = await apiCallRaw<QuotationRow>(page, 'GET', `/quotations/${id}`);
      expect(created.notes, `${notesCase.label}：notes 出参须与落库语义一致`).toBe(
        notesCase.expected
      );
    } finally {
      await tryCleanup(
        page,
        'POST',
        `/quotations/${id}/cancel`,
        `${tag} ${notesCase.label} 清理报价`
      );
    }
  }
});
