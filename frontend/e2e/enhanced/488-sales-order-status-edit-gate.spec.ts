// 4.3 单据状态机 + 4.25 错误码：销售订单编辑保存口的状态取值域与流转出边门。
// 后端判据：models/status/sales.rs:14-41 九值小写闭合词表；
//   :50-78 EDIT_OUT_EDGES 为空，仅与当前态逐字符相同的幂等写放行；
//   services/so/order_crud.rs:669-672 仅携带 status 时进门，门在写状态列与 updated_at 之前；
//   :587-600 词表外值 validation_displayable → 400/VALIDATION_ERROR；
//   :637-652 词表内异值 business_displayable → 400/BUSINESS_ERROR，文案点名当前态、目标态与允许清单。
// 与既有覆盖分工：flow/44f-5 只测 shipped 后改普通字段；flow/473 只测并发令牌；
//   flow/120 测的是 /sales/fabric-orders；全 e2e 无 /sales/orders 携带 status 的编辑断言，本例专补零覆盖门。
import { expect, test, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
  tryCleanup,
} from '../flow/helpers';

const CLEANUP: Array<{ path: string; label: string }> = [];
test.afterEach(async ({ page }) => {
  for (const c of CLEANUP.slice().reverse()) await tryCleanup(page, 'DELETE', c.path, c.label);
  CLEANUP.length = 0;
});

const ALLOWED = 'draft/pending/approved/partial_shipped/shipped/completed/cancelled/rejected';

interface OrderDetail {
  id?: unknown;
  status?: unknown;
  notes?: unknown;
  updated_at?: unknown;
}

function str(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v);
}

async function readDetail(page: Page, orderId: number): Promise<OrderDetail> {
  return await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
}

function expectUnchanged(actual: OrderDetail, notes: string, token: string, phase: string): void {
  expect(
    str(actual.status),
    `[488] ${phase} 后状态必须仍为 draft，实际 ${str(actual.status)}`
  ).toBe('draft');
  expect(str(actual.notes), `[488] ${phase} 必须零写入，备注实际 ${str(actual.notes)}`).toBe(notes);
  expect(
    str(actual.updated_at),
    `[488] ${phase} 不得推进更新令牌，实际 ${str(actual.updated_at)}`
  ).toBe(token);
}

test('销售订单编辑口拒词表外状态、拒界内改态，同值幂等写只改备注', async ({ page }) => {
  await ensureTestEntities(page);
  const ctx = getCtx();
  if (!ctx.customerId || ctx.productIds.length === 0) {
    throw new Error('前置不成立：夹具未产出客户或产品主键，无法自建订单');
  }
  const tag = genCode('SO488');

  const created = await apiCallRaw<OrderDetail>(page, 'POST', '/sales/orders', {
    customer_id: ctx.customerId,
    items: [{ product_id: ctx.productIds[0], quantity: 2, unit_price: '35.00' }],
    remarks: `488建单${tag}`,
  });
  const orderId = Number(created.id);
  expect(
    Number.isInteger(orderId) && orderId > 0,
    `自建订单必须回真实主键，实际 ${JSON.stringify(created)}`
  ).toBe(true);
  CLEANUP.push({ path: `/sales/orders/${orderId}`, label: `销售订单${tag}` });

  const before = await readDetail(page, orderId);
  expect(str(before.status), `[488] 建单初态必须为 draft，实际 ${str(before.status)}`).toBe(
    'draft'
  );
  const originalNotes = str(before.notes);
  const originalToken = str(before.updated_at);
  expect(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(originalToken),
    `[488] 详情须回读可比对更新令牌，实际 ${originalToken}`
  ).toBe(true);

  const badToken = `E2E非法状态${tag}`;
  const bad = await apiCallExpectFail(page, 'PUT', `/sales/orders/${orderId}`, {
    status: badToken,
    notes: `${tag}非法写入`,
  });
  expect(bad.status, `[488] 词表外状态须 400，实际 ${bad.status}`).toBe(400);
  expect(
    failureCode(bad),
    `[488] 词表外状态机器码须 VALIDATION_ERROR，实际 ${String(failureCode(bad))}`
  ).toBe(APP_ERROR_CODES.VALIDATION_ERROR);
  expect(String(bad.message), `[488] 拒因须点名非法取值，实际 ${String(bad.message)}`).toContain(
    `订单状态 ${badToken} 不是合法取值`
  );
  expect(String(bad.message), `[488] 拒因须点名权威词表，实际 ${String(bad.message)}`).toContain(
    ALLOWED
  );
  expectUnchanged(await readDetail(page, orderId), originalNotes, originalToken, '词表外状态被拒');

  const illegal = await apiCallExpectFail(page, 'PUT', `/sales/orders/${orderId}`, {
    status: 'approved',
    notes: `${tag}改态写入`,
  });
  expect(illegal.status, `[488] 词表内异值改态须 400，实际 ${illegal.status}`).toBe(400);
  expect(
    failureCode(illegal),
    `[488] 改态机器码须 BUSINESS_ERROR，实际 ${String(failureCode(illegal))}`
  ).toBe(APP_ERROR_CODES.BUSINESS_ERROR);
  expect(
    String(illegal.message),
    `[488] 拒因须点名当前态与目标态，实际 ${String(illegal.message)}`
  ).toContain('销售订单状态不允许由 draft 改为 approved');
  expect(
    String(illegal.message),
    `[488] 拒因须点名权威操作，实际 ${String(illegal.message)}`
  ).toContain('编辑保存不改变状态');
  expectUnchanged(await readDetail(page, orderId), originalNotes, originalToken, '界内改态被拒');

  const newNote = `488幂等${tag}`;
  await apiCall(page, 'PUT', `/sales/orders/${orderId}`, { status: 'draft', notes: newNote });
  const afterSame = await readDetail(page, orderId);
  expect(
    str(afterSame.status),
    `[488] 同值幂等写后状态仍须 draft，实际 ${str(afterSame.status)}`
  ).toBe('draft');
  expect(
    str(afterSame.notes),
    `[488] 同值幂等写必须放行普通字段，备注实际 ${str(afterSame.notes)}`
  ).toBe(newNote);
});
