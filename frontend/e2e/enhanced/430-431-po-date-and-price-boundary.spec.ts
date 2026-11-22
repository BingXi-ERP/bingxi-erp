// 4.30 时间边界 + 4.31 空值/数值边界：采购单建单的交货日顺序与单价缺键/显式 0 三态。
// 后端判据：
//   services/po/order_ops/crud.rs:204-209 expected_delivery_date < order_date → BAD_REQUEST
//     "预计交货日期不能早于订单日期"（日期合理性门）。
//   crud.rs:407-411 unit_price 缺键（None）→ validation_displayable
//     "采购订单行缺少单价 unit_price，须显式提交单价（0 价行请显式提交 0）"；Some(0) 合法进入
//     :412 amount = quantity * unit_price，样布/赠品/寄售的 0 价行是真实形态。
// 检测力：若把 0 价当缺省代填，缺键负例会落库成 200 即红；若把 0 价拒掉，显式 0 正例即红；
//   若删掉日期顺序门，早于订单日的交货日会落库即红。两例各有独立检测点，不互相遮蔽。
// 与 18-resilience-boundary 正交：那条断数量缺键与单价 4 位小数精度，本条断单价 null/0 三态与日期顺序。
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

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe('4.30/4.31 采购单交货日顺序与单价三态边界', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test('4.30-01 交货日早于订单日被拒，等于订单日放行', async ({ page }) => {
    const ctx = getCtx();
    const orderDate = isoDate(0);
    const base = {
      supplier_id: ctx.supplierId,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      order_date: orderDate,
      items: [
        {
          material_id: ctx.productIds[0],
          quantity_ordered: '1',
          unit_price: '10',
          tax_rate: 13,
        },
      ],
    };

    // 交货日早于订单日：日期门须拒，拒因点名方向，不能笼统"操作失败"。
    const bad = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      ...base,
      expected_delivery_date: isoDate(-1),
    });
    expectStateGateRejection(bad, '交货日早于订单日建单');
    expect(
      String(bad.message ?? ''),
      '拒因须点名"预计交货日期不能早于订单日期"，实际 ' + JSON.stringify(bad.message)
    ).toContain('预计交货日期不能早于订单日期');

    // 交货日等于订单日：不早于，放行。证明上一条拒因是方向门而非日期字段整体不可用。
    const ok = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      ...base,
      expected_delivery_date: orderDate,
    });
    const poId = ok.data?.id;
    expect(
      poId,
      `交货日等于订单日应放行，实际响应 ${JSON.stringify(ok).slice(0, 300)}`
    ).toBeTruthy();
    try {
      const detail = await apiCallRaw<{ expected_delivery_date?: string }>(
        page,
        'GET',
        `/purchase/orders/${poId}`
      );
      expect(detail.expected_delivery_date, '回读交货日须等于提交的订单日').toBe(orderDate);
    } finally {
      await tryCleanup(page, 'DELETE', `/purchase/orders/${poId}`, '4.30 交货日边界采购单');
    }
  });

  test('4.31-01 单价缺键被拒、显式 0 放行并回读', async ({ page }) => {
    const ctx = getCtx();
    const base = {
      supplier_id: ctx.supplierId,
      warehouse_id: ctx.warehouseIds[0],
      department_id: ctx.departmentIds[0],
      order_date: isoDate(0),
    };

    // 缺键：不得用 0 代填把"漏录"混成"声明 0 价"。
    const absent = await apiCallExpectFail(page, 'POST', '/purchase/orders', {
      ...base,
      items: [
        {
          material_id: ctx.productIds[0],
          quantity_ordered: '1',
          tax_rate: 13,
        },
      ],
    });
    expectStateGateRejection(absent, '单价缺键建单');
    expect(failureCode(absent), '单价缺键须归 VALIDATION_ERROR，不得落库成 200').toBe(
      APP_ERROR_CODES.VALIDATION_ERROR
    );
    expect(
      String(absent.message ?? ''),
      '拒因须点名缺少单价，实际 ' + JSON.stringify(absent.message)
    ).toContain('缺少单价');

    // 显式 0：样布/赠品/寄售行是真实形态，须放行并原样回读，不能回舍或当成缺键。
    const ok = await apiCall<{ id?: number }>(page, 'POST', '/purchase/orders', {
      ...base,
      items: [
        {
          material_id: ctx.productIds[0],
          quantity_ordered: '5',
          unit_price: '0',
          tax_rate: 13,
        },
      ],
    });
    const poId = ok.data?.id;
    expect(poId, `显式 0 价行应放行，实际响应 ${JSON.stringify(ok).slice(0, 300)}`).toBeTruthy();
    try {
      const detail = await apiCallRaw<{
        items?: Array<{ unit_price?: string | number; quantity?: string | number }>;
      }>(page, 'GET', `/purchase/orders/${poId}`);
      const line = detail.items?.[0];
      expect(line, '0 价单详情须回读出明细行').toBeTruthy();
      expect(Number(line!.unit_price), '显式 0 价须原样落库，不得被缺省值顶替').toBe(0);
      expect(Number(line!.quantity), '数量须等于提交值').toBe(5);
    } finally {
      await tryCleanup(page, 'DELETE', `/purchase/orders/${poId}`, '4.31 零价采购单');
    }
  });
});
