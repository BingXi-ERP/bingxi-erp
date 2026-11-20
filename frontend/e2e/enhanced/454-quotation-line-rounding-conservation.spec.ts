// 4.16 舍入守恒：报价多行明细逐行 round_dp(2) 后行额与表头小计分位守恒，差额为 0。
// 后端判据：services/quotation_ops/calc.rs:25-30 calculate_totals 先对每行
//   (quantity*unitPrice).round_dp(2) 再 sum().round_dp(2) 得 subtotal；
//   crud.rs:176/178 建单行腿 amount/amount_with_tax 同口径逐行 round_dp(2) 落库。
//   响应 models/quotation_response_dto.rs:41-43 表头 subtotal/tax_amount/total_amount、
//   :70 items、:135 items[].amount（Decimal 出参 string）。
// 与既有覆盖分工：451 单行整数（qty 2）只断含税切换重算；fullflow/40 单行整数；
//   flow/452-meterage 两行整数换算守恒。全 e2e 无小数数量多行逐行舍入后合计断言。
// 数值设计：三行 qty 0.333/0.333/0.334、单价 1.00、tax_rate=0 →
//   逐行 round 后 0.33/0.33/0.33，小计 0.99；若错误地先求和再 round 得 1.00，断言即红。
// 假红规避：用 BigInt 分位解析（451:26-45 范式），避开浮点误差；数量列即使被 DB 收敛到
//   两位也只断 amount 与 subtotal（行额来源 DTO 值 round 后落库，恒 0.33），不断 quantity 回读。
// 检测力：行额不 round 或先求和再 round 则 0.33/0.99 断言红；小计与行额不守恒即红。
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

function cents(s: string): bigint {
  return toScaled(s, 2, `期望金额 ${s}`);
}

interface QuoteDetail {
  id: number;
  subtotal: string;
  tax_amount: string;
  total_amount: string;
  items: Array<{ amount: string; unit_price: string; quantity: string }>;
}

test('454-01 三行小数数量逐行舍入后行额合计与表头小计守恒', async ({ page }) => {
  await loginViaUI(page);
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (!ctx.customerId || !ctx.quotationProductId || !ctx.userIds[0]) {
    throw new Error('[454] 前置缺失：客户/产品/用户未就绪');
  }
  const unit = ctx.quotationProductUnit;
  if (!unit) throw new Error('[454] 前置缺失：ctx.quotationProductUnit 未就绪');

  const lineQty = ['0.333', '0.333', '0.334'];
  const created = await apiCall<{ data?: { id?: number } }>(page, 'POST', '/quotations', {
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
    items: lineQty.map(quantity => ({
      product_id: ctx.quotationProductId,
      unit,
      quantity,
      unit_price: '1.00',
      unit_price_with_tax: '1.00',
    })),
    notes: genCode('E2E-454-ROUND'),
  });
  const id = Number(created.data?.id);
  expect(Number.isInteger(id) && id > 0, '报价创建须返回正整数主键').toBe(true);
  try {
    const detail = await apiCallRaw<QuoteDetail>(page, 'GET', `/quotations/${id}`);
    expect(Array.isArray(detail.items) && detail.items.length === 3, '须回读三行明细').toBe(true);

    // 逐行 amount = round_dp(2)(qty*1.00) = 0.33（0.333→0.33、0.334→0.33）
    let lineSum = 0n;
    for (const [idx, item] of detail.items.entries()) {
      expect(
        toScaled(item.amount, 2, `第 ${idx + 1} 行 amount`),
        `第 ${idx + 1} 行金额须逐行舍入到 0.33`
      ).toBe(cents('0.33'));
      lineSum += toScaled(item.amount, 2, `第 ${idx + 1} 行 amount 累加`);
    }

    // 表头小计 = 逐行舍入后求和 = 0.99（若先求和再 round 得 1.00 即红）
    expect(
      toScaled(detail.subtotal, 2, '表头 subtotal'),
      '小计须等于逐行 round_dp(2) 后之和 0.99'
    ).toBe(cents('0.99'));
    expect(lineSum, '行额之和须与表头小计分位守恒（差额 0）').toBe(
      toScaled(detail.subtotal, 2, '守恒校验 subtotal')
    );
    expect(toScaled(detail.tax_amount, 2, '税额'), '税率 0 → 税额须为 0').toBe(0n);
    expect(toScaled(detail.total_amount, 2, '总额'), '总额须等于小计 + 税额 = 0.99').toBe(
      cents('0.99')
    );
  } finally {
    await tryCleanup(page, 'DELETE', `/quotations/${id}`, `454 quotation ${id}`);
  }
});
