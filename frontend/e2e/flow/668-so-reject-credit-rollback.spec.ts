// 668 销售订单驳回的信用额度跨域回退：按 total_amount 归还占用额度、理由精确保留、二次驳回零漂移。
//
// 功能：PENDING 订单驳回时除释放预留外，同步把该单占用的信用额度按订单总金额归还，并把驳回理由 trim 后落库。
// 判据来源（写入方为准）：services/so/contract.rs:49-65 reject_order 仅 PENDING 放行，
//       release_credit_txn(customer_id, total_amount) 归还额度、rejected_reason=Some(reason.trim())、
//       status=REJECTED 并发布 SalesOrderRejected；customer_credit_limit.rs:265-301 对 used_credit 做减法、available_credit 做加法。
// 调用方与端点：POST /crm/customers|/crm/customer-credits|/inventory/stock/fabric|/sales/orders 建夹具，
//       /sales/orders/{id}/submit 占用额度，/sales/orders/{id}/reject 触发回退，GET /crm/customer-credits/{customer_id} 回读。
// 数据形状与存储：customer_credit_ratings 的 limit/used/available 均为 DECIMAL，JSON 为字符串，定点分位比较禁浮点等号；
//       销售订单状态词表逐字符为小写 pending/rejected（models/status/sales.rs），不英文化也不大小写混用。
// 失败信封与零漂移：非 PENDING 二次驳回仅 AppError 字符串码 BUSINESS_ERROR，额度三列与订单理由一字不改。
// 与 507 分工：507 钉预留/库存释放与本单状态，本例只钉信用额度回退与理由精确落库，不重复其断言。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  APP_ERROR_CODES,
  ensureTestEntities,
  failureCode,
  genCode,
  genDyeLotNo,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
interface CleanupEntry {
  path: string;
  label: string;
}
const CLEANUP: CleanupEntry[] = [];

/** 功能：DECIMAL 转百分位整数；入参：JSON 值+字段标签；出参：bigint 分；异常：非数字或超两位有效尾数抛错。 */
function decimalCents(value: unknown, label: string): bigint {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${label} 非 DECIMAL 出参：${JSON.stringify(value)}`);
  }
  const matched = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!matched) throw new Error(`${label} 无法定点解析：${String(value)}`);
  const fraction = (matched[3] ?? '').padEnd(2, '0');
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`${label} 精度超过两位：${String(value)}`);
  }
  return BigInt(`${matched[1]}${matched[2]}${fraction.slice(0, 2)}`);
}

/** 功能：必填正整数 id；入参：未知值+标签；出参：number；异常：非正整数抛错。 */
function requireId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} 非法：${JSON.stringify(value)}`);
  return id;
}

/** 功能：必填非空字符串；入参：未知值+标签；出参：string；异常：空或非字符串抛错。 */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} 期望非空字符串，实际 ${JSON.stringify(value)}`);
  }
  return value;
}

/** 功能：信用三元组回读；入参：page+客户 id；出参：limit/used/available 的 bigint 分；异常：字段缺失抛错。 */
async function readCredit(
  page: Page,
  customerId: number
): Promise<{ limit: bigint; used: bigint; available: bigint }> {
  const row = await apiCallRaw<Row>(page, 'GET', `/crm/customer-credits/${customerId}`);
  return {
    limit: decimalCents(row.credit_limit, 'credit_limit'),
    used: decimalCents(row.used_credit, 'used_credit'),
    available: decimalCents(row.available_credit, 'available_credit'),
  };
}

test.describe.serial('668 销售订单驳回信用额度回退', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });

  test.afterEach(async ({ page }) => {
    while (CLEANUP.length > 0) {
      const entry = CLEANUP.pop();
      if (entry) await tryCleanup(page, 'DELETE', entry.path, entry.label);
    }
  });

  test('PENDING 驳回按总金额归还额度并精确落理由，非 PENDING 二次驳回零漂移', async ({ page }) => {
    const ctx = getCtx();
    const tag = genCode('668');
    const productId = requireId(ctx.productIds[0], '基础产品');
    const warehouseId = requireId(ctx.warehouseIds[0], '基础仓库');

    const customer = await apiCallRaw<Row>(page, 'POST', '/crm/customers', {
      customer_name: `E2E668-CUST-${tag}`,
      status: 'active',
    });
    const customerId = requireId(customer.id, '建客户');
    CLEANUP.push({ path: `/crm/customers/${customerId}`, label: `customer#${customerId}` });

    await apiCallRaw(page, 'POST', '/crm/customer-credits', {
      customer_id: customerId,
      credit_level: 'E2E668',
      credit_limit: '1500.00',
      credit_days: 30,
    });
    CLEANUP.push({
      path: `/crm/customer-credits/${customerId}`,
      label: `credit#${customerId}`,
    });
    const creditAtStart = await readCredit(page, customerId);
    expect(creditAtStart.used, '初始占用额度应为 0').toBe(0n);
    expect(creditAtStart.available, '初始可用额度应等于授信额度').toBe(creditAtStart.limit);

    const stock = await apiCallRaw<Row>(page, 'POST', '/inventory/stock/fabric', {
      warehouse_id: warehouseId,
      product_id: productId,
      batch_no: `${tag}-BATCH`,
      color_no: `${tag}-COLOR`,
      dye_lot_no: genDyeLotNo(),
      grade: '一等品',
      quantity_meters: '100',
      quantity_kg: '100',
    });
    const stockId = requireId(stock.id, '建库存行');
    CLEANUP.push({ path: `/inventory/stock/${stockId}`, label: `stock#${stockId}` });

    const order = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
      customer_id: customerId,
      order_date: new Date().toISOString(),
      items: [
        {
          product_id: productId,
          quantity: '40',
          unit_price: '10.00',
          tax_percent: '0',
          quantity_tolerance_pct: '0',
        },
      ],
      notes: `${tag}-SO`,
    });
    const orderId = requireId(order.id, '建销售订单');
    CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `so#${orderId}` });
    await apiCall(page, 'POST', `/sales/orders/${orderId}/submit`);

    const beforeReject = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(requireString(beforeReject.status, '提交后订单状态'), 'submit 后应为 PENDING').toBe(
      'pending'
    );
    const occupied = decimalCents(beforeReject.total_amount, '订单 total_amount');
    expect(occupied, '订单总金额应按 40×10 落库').toBe(40000n);
    const creditOccupied = await readCredit(page, customerId);
    expect(creditOccupied.used, 'submit 后占用额度应等于订单总金额').toBe(occupied);
    expect(creditOccupied.available, 'submit 后可用额度应为授信减订单总额（定点分位）').toBe(
      creditAtStart.limit - occupied
    );

    const reason = `${tag}-驳回理由`;
    const rejected = await apiCall<{ data?: { message?: unknown } }>(
      page,
      'POST',
      `/sales/orders/${orderId}/reject`,
      { reason: `  ${reason}  ` }
    );
    expect(requireString(rejected.data?.message, '驳回响应 message')).toBe('订单已拒绝');

    const afterReject = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(requireString(afterReject.status, '驳回后订单状态')).toBe('rejected');
    expect(requireString(afterReject.rejected_reason, '驳回理由精确落库')).toBe(reason);
    const creditReturned = await readCredit(page, customerId);
    expect(creditReturned.used, '驳回后占用额度应归零').toBe(0n);
    expect(creditReturned.available, '驳回后可用额度应精确归还 400.00').toBe(creditAtStart.limit);
    expect(creditReturned.limit, '授信额度本身不得被驳回改变').toBe(creditAtStart.limit);

    const second = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/reject`, {
      reason: `${tag}-二次驳回`,
    });
    expect(second.status, '非 PENDING 二次驳回应 400').toBe(400);
    expect(failureCode(second), '二次驳回应归 BUSINESS_ERROR').toBe(APP_ERROR_CODES.BUSINESS_ERROR);
    const afterSecond = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(requireString(afterSecond.rejected_reason, '二次驳回不得覆盖理由')).toBe(reason);
    const creditAfterSecond = await readCredit(page, customerId);
    expect(creditAfterSecond.used, '二次驳回后占用额度零漂移').toBe(creditReturned.used);
    expect(creditAfterSecond.available, '二次驳回后可用额度零漂移').toBe(creditReturned.available);
  });
});
