// 4.38 误改回滚 E2E — flow/572-sales-order-price-revert-audit-snapshot
// 功能：销售订单改单价后，审计 before/after 快照可追溯到修改前金额，并把旧值回放回退。
// 调用方：Playwright flow 分片；管理员会话态由 diagnose-fixture 按 worker 注入。
// 入参：无外部入参；订单用夹具产物（ensureTestEntities 的客户与产品）自建，避免撞共享单据。
// 传给谁：POST /sales/orders 建单 → GET /sales/orders/{id} 读基线 total_amount →
//   PUT /sales/orders/{id} 改 items 单价 → GET /audit-logs?resource_type=sales_orders 查变更审计 →
//   GET /audit-logs/{id} 读 before_snapshot/after_snapshot → PUT 回放原单价 → GET 详情核对回退。
// 存什么：sales_orders 一行（total_amount 由 items 单价×数量重算）、sales_order_items 明细、
//   audit_logs 行（before_snapshot 存改前模型含旧 total_amount、after_snapshot 存改后模型）。
// 存哪里：sales_orders / sales_order_items 表；audit_logs 表。
// 口径说明：报告认定 445/462 已断言 before/after 快照，但未见"改价→回放旧值"用例，本例补该腿。
//   order_crud.rs:438 的 update_with_audit 用占位符 auto_audit，落库 resource_type 取实体表名
//   sales_orders；金额字段为 Decimal，出参字符串，按字符串逐字比对，不做数值容差掩盖。
import { test, expect } from '../diagnose-fixture';
import type { Page } from '@playwright/test';
import { apiCall, apiCallRaw, ensureTestEntities, genCode, getCtx, tryCleanup } from './helpers';

interface OrderDetail {
  id?: unknown;
  status?: unknown;
  total_amount?: unknown;
  updated_at?: unknown;
  items?: Array<{ product_id?: unknown; unit_price?: unknown; quantity?: unknown }>;
}

interface AuditRow {
  id: number;
  resource_id?: string | null;
  resource_type?: string | null;
  operation_type?: string | null;
  before_snapshot?: Record<string, unknown> | null;
  after_snapshot?: Record<string, unknown> | null;
}

test('572-01 改价后审计快照留存旧金额且回放旧值可回退', async ({ page }: { page: Page }) => {
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (!ctx.customerId || ctx.productIds.length === 0) {
    throw new Error('前置不成立：夹具未产出客户或产品主键，无法自建订单');
  }
  const tag = genCode('572A');
  const productId = ctx.productIds[0];

  const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    items: [{ product_id: productId, quantity: 2, unit_price: '35.00' }],
    remarks: `572改价回滚${tag}`,
  });
  const orderId = Number(created.id);
  expect(Number.isInteger(orderId) && orderId > 0, '建单须回真实主键').toBe(true);
  try {
    const before = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    const oldTotal = String(before.total_amount ?? '');
    expect(oldTotal, '建单详情须回 total_amount 作为改价基线').not.toBe('');

    // 改单价 35.00 → 88.00，数量不变，total_amount 随之变化。
    const changed = await apiCall(page, 'PUT', `/sales/orders/${orderId}`, {
      items: [{ product_id: productId, quantity: 2, unit_price: '88.00' }],
    });
    expect(changed.code, '改价 PUT 须成功信封').toBe(200);
    const afterChange = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    const newTotal = String(afterChange.total_amount ?? '');
    expect(newTotal, '改价后详情须回 total_amount').not.toBe('');
    expect(newTotal, '改价后 total_amount 须与改前不同，否则本例无可观察变化').not.toBe(oldTotal);

    // 审计定位：resource_type=sales_orders + resource_id=订单主键，operation_type=UPDATE。
    const logs = await apiCallRaw<{ items: AuditRow[] }>(
      page,
      'GET',
      `/audit-logs?resource_type=sales_orders&resource_id=${orderId}&operation_type=UPDATE&page=1&page_size=50`
    );
    const candidates = (logs.items ?? []).filter(it => String(it.resource_id) === String(orderId));
    expect(
      candidates.length,
      `按 resource_id=${orderId} 应命中改价 UPDATE 审计`
    ).toBeGreaterThanOrEqual(1);

    // 列表条目脱敏不带快照，逐条查详情定位 before=旧金额/after=新金额的改价行。
    let snapshot: AuditRow | undefined;
    for (const c of candidates) {
      const full = await apiCallRaw<AuditRow>(page, 'GET', `/audit-logs/${c.id}`);
      if (
        String(full.before_snapshot?.total_amount ?? '') === oldTotal &&
        String(full.after_snapshot?.total_amount ?? '') === newTotal
      ) {
        snapshot = full;
        break;
      }
    }
    expect(snapshot, '应找到 before 旧金额/after 新金额的改价审计详情').toBeDefined();
    if (!snapshot) throw new Error('572 未定位到改价审计快照，后续断言不可执行');

    // 回放旧单价，把金额退回基线。
    const revert = await apiCall(page, 'PUT', `/sales/orders/${orderId}`, {
      items: [{ product_id: productId, quantity: 2, unit_price: '35.00' }],
    });
    expect(revert.code, '回放旧价 PUT 须成功信封').toBe(200);
    const afterRevert = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(String(afterRevert.total_amount ?? ''), '回放旧价后 total_amount 须与改前基线一致').toBe(
      oldTotal
    );

    // 回滚也须留痕：新增一条 after=旧金额的 UPDATE 审计。
    const logs2 = await apiCallRaw<{ items: AuditRow[] }>(
      page,
      'GET',
      `/audit-logs?resource_type=sales_orders&resource_id=${orderId}&operation_type=UPDATE&page=1&page_size=50`
    );
    let revertTraced = false;
    for (const c of logs2.items ?? []) {
      const full = await apiCallRaw<AuditRow>(page, 'GET', `/audit-logs/${c.id}`);
      if (String(full.after_snapshot?.total_amount ?? '') === oldTotal) {
        revertTraced = true;
        break;
      }
    }
    expect(revertTraced, '回放旧价后须新增一条 after=旧金额的 UPDATE 审计留痕').toBe(true);
  } finally {
    await tryCleanup(page, 'DELETE', `/sales/orders/${orderId}`, `572 订单 ${orderId}`);
  }
});
