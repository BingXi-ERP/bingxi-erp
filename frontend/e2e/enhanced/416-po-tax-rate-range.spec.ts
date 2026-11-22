// 4.16 数值精度：采购订单行税率区间门（负数与超上界拒绝，0 与常规值放行）。
// 后端判据：services/po/order_ops/crud.rs:414-421 在 calculate_item_amounts 内真调
//   if percent < Decimal::ZERO || percent > TAX_PERCENT_MAX → Err(AppError::business_displayable
//   "采购订单行税率 {} 非法：须为百分数口径且落在 0 到 {} 之间（13 表示 13%，0 表示无进项税）")；
//   上界 TAX_PERCENT_MAX 见 utils/tax.rs:53。调用链由 POST /purchase/orders 的行循环进入 :582。
// 检测力：若删掉区间门，负税率或超上界税率会落库成 200 即红；若门误把 0 当非法，正例即红。
// 与 430-431-po-date-and-price 正交：那条断日期与单价 null/0，本条断税率区间，同端点不同字段。
// 与 18-resilience-boundary 正交：那条断单价 4 位小数精度，不碰税率。
import { test, expect } from '../diagnose-fixture';
import {
  loginViaUI,
  ensureTestEntities,
  getCtx,
  apiCall,
  apiCallRaw,
  apiCallExpectFail,
  expectStateGateRejection,
  failureCode,
  APP_ERROR_CODES,
  tryCleanup,
} from '../flow/helpers';

test.describe('4.16 采购单税率区间门', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('416-01 税率为负与超上界被拒，0 与常规税率放行', async ({ page }) => {
    const ctx = getCtx();
    const base = {
      supplier_id: ctx.supplierId,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      order_date: new Date().toISOString().slice(0, 10),
    };
    const line = (taxRate: number) => [
      {
        material_id: ctx.productIds[0],
        quantity_ordered: '1',
        unit_price: '10',
        tax_rate: taxRate,
      },
    ];

    // 负税率：百分数口径下不许为负。
    const neg = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      ...base,
      items: line(-1),
    });
    expectStateGateRejection(neg, '负税率建单');
    expect(failureCode(neg), '税率越界须归 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    expect(
      String(neg.message ?? ''),
      '拒因须点名税率非法，实际 ' + JSON.stringify(neg.message)
    ).toContain('税率');

    // 超上界：远超 TAX_PERCENT_MAX，必须拒，防"只挡负数不挡溢出"。
    const over = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      ...base,
      items: line(100000),
    });
    expectStateGateRejection(over, '超上界税率建单');
    expect(
      String(over.message ?? ''),
      '超上界拒因须点名税率非法，实际 ' + JSON.stringify(over.message)
    ).toContain('税率');

    // 正例 0：无进项税是合法口径，不能把 0 当缺省或非法拒掉。
    const zero = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      ...base,
      items: line(0),
    });
    const zeroId = zero.data?.id;
    expect(zeroId, `税率 0 应放行，实际响应 ${JSON.stringify(zero).slice(0, 300)}`).toBeTruthy();

    // 正例 13：常规税率放行并回读，证明区间门未误伤合法档位。
    const normal = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      ...base,
      items: line(13),
    });
    const normalId = normal.data?.id;
    expect(
      normalId,
      `税率 13 应放行，实际响应 ${JSON.stringify(normal).slice(0, 300)}`
    ).toBeTruthy();
    try {
      const detail = await apiCallRaw<{
        items?: Array<{ tax_percent?: string | number }>;
      }>(page, 'GET', `/purchase/orders/${normalId}`);
      expect(
        Number(detail.items?.[0]?.tax_percent),
        '常规税率须原样落库为 13，不得被默认档位替换'
      ).toBe(13);
    } finally {
      for (const [id, label] of [
        [zeroId, '4.16 零税率采购单'],
        [normalId, '4.16 常规税率采购单'],
      ] as Array<[number | undefined, string]>) {
        if (id) await tryCleanup(page, 'DELETE', `/purchase/orders/${id}`, label);
      }
    }
  });
});
