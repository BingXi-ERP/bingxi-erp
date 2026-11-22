// 4.5 含税/不含税切换重算：同一张 DRAFT 报价单 PUT tax_inclusive 后三键按口径重算并往返还原。
// 后端判据：services/quotation_ops/update.rs:65-66 仅 DRAFT/REJECTED 可改；
//   :120-122 写 tax_inclusive；:257-280 recalculate_totals_and_update 用同口径重算：
//   含税 total=Σ行 amount_with_tax、税额=总额−小计；不含税 税额=小计×税率/100、
//   总额=小计+税额。建单 calc.rs:20-45 同口径（round_dp(2) 定点数）。
//   DTO models/quotation_update_dto.rs:29 tax_inclusive: Option<bool>；
//   响应 models/sales_quotation.rs subtotal/tax_amount/total_amount/tax_inclusive。
// 与既有覆盖分工：442-05 用两张不同报价单分别建含税态/不含税态验证创建口径，
//   455 只 PUT 改量改价（tax_rate=0）；全 e2e 无同一张单 PUT 切换 tax_inclusive
//   并重算三键的用例。本例专钉切换腿。
// 检测力：切换含税若仍按乘法造税或税额不取差额，则 40.00/240.00 断言即红；
//   切回不含税若残留含税口径，则 26.00/226.00 断言即红；行额若被误改即红。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  genCode,
  tryCleanup,
} from '../flow/helpers';

type Row = Record<string, unknown>;

function toScaled(v: unknown, scale: number, label: string): bigint {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
  if (s === '') throw new Error(`${label}：Decimal 出参非 string|number，raw=${JSON.stringify(v)}`);
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`${label}：Decimal 出参形态非法，raw="${s}"`);
  const [, sign, intPart, frac = ''] = m;
  if (frac.length > scale && frac.slice(scale).replace(/0+$/, '') !== '') {
    throw new Error(`${label}：出参标度超出精度且非零，raw="${s}"`);
  }
  const padded = (intPart + frac).padEnd(intPart.length + scale, '0');
  const value = BigInt(padded);
  return sign === '-' ? -value : value;
}

function eqAmount(actual: unknown, expectedCents: bigint, label: string): void {
  expect(
    toScaled(actual, 2, label),
    `${label}：期望(分)=${expectedCents} 实际=${JSON.stringify(actual)}`
  ).toBe(expectedCents);
}

function cents(s: string): bigint {
  return toScaled(s, 2, `期望金额 ${s}`);
}

function readQuotation(page: Page, id: number): Promise<Row> {
  return apiCallRaw<Row>(page, 'GET', `/quotations/${id}`);
}

function assertTotals(
  row: Row,
  want: { subtotal: string; tax: string; total: string; inclusive: boolean },
  tag: string
): void {
  eqAmount(row.subtotal, cents(want.subtotal), `${tag} 小计`);
  eqAmount(row.tax_amount, cents(want.tax), `${tag} 税额`);
  eqAmount(row.total_amount, cents(want.total), `${tag} 总额`);
  expect(row.tax_inclusive, `${tag} 含税标记须如实落库`).toBe(want.inclusive);
  expect(
    toScaled(row.total_amount, 2, `${tag} 总额`) ===
      toScaled(row.subtotal, 2, `${tag} 小计`) + toScaled(row.tax_amount, 2, `${tag} 税额`),
    `${tag} 三键须勾稽：总额=小计+税额（分位无分差）`
  ).toBe(true);
}

test('451-01 同一张草稿报价切换含税标记后三键按口径重算且可往返还原', async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (!ctx.customerId || !ctx.quotationProductId || !ctx.userIds[0]) {
    throw new Error('[451] 前置缺失：客户/产品/用户未就绪');
  }
  const unit = ctx.quotationProductUnit;
  if (!unit) throw new Error('[451] 前置缺失：ctx.quotationProductUnit 未就绪');

  const created = await apiCall<{ id?: number }>(page, 'POST', '/quotations', {
    customer_id: ctx.customerId,
    sales_user_id: ctx.userIds[0],
    quotation_date: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: 'CNY',
    exchange_rate: '1',
    base_currency: 'CNY',
    price_terms: 'FOB',
    tax_inclusive: false,
    tax_rate: '13',
    items: [
      {
        product_id: ctx.quotationProductId,
        unit,
        quantity: '2',
        unit_price: '100.00',
        unit_price_with_tax: '120.00',
      },
    ],
    notes: `451-${genCode('QT')}`,
  });
  const id = Number(created.data?.id);
  expect(id, '[451] 建单须返回正整数主键').toBeGreaterThan(0);

  try {
    // 不含税建档：小计=200、税额=200×13/100=26、总额=226。
    assertTotals(
      await readQuotation(page, id),
      {
        subtotal: '200.00',
        tax: '26.00',
        total: '226.00',
        inclusive: false,
      },
      '不含税建档'
    );

    // 切含税：总额=Σ行含税额=2×120=240、税额=240−200=40；小计不变、行额不变。
    await apiCall(page, 'PUT', `/quotations/${id}`, { tax_inclusive: true });
    assertTotals(
      await readQuotation(page, id),
      {
        subtotal: '200.00',
        tax: '40.00',
        total: '240.00',
        inclusive: true,
      },
      '切含税'
    );

    // 切回不含税：税额=200×13/100=26、总额=226，往返还原且不残留含税口径。
    await apiCall(page, 'PUT', `/quotations/${id}`, { tax_inclusive: false });
    const back = await readQuotation(page, id);
    assertTotals(
      back,
      {
        subtotal: '200.00',
        tax: '26.00',
        total: '226.00',
        inclusive: false,
      },
      '切回不含税'
    );
    expect(back.status, '[451] 切换后状态须仍为词表原值 draft').toBe('draft');
    const items = back.items as Row[] | undefined;
    expect(Array.isArray(items) && items.length === 1, '[451] 明细行须仍为 1 行未被切换改动').toBe(
      true
    );
    eqAmount(items![0].amount, cents('200.00'), '行净额未被切换改动');
    eqAmount(items![0].amount_with_tax, cents('240.00'), '行含税额未被切换改动');
  } finally {
    await tryCleanup(page, 'DELETE', `/quotations/${id}`, `451 报价 ${id}`);
  }
});
