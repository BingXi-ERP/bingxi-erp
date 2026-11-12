/**
 * 473 并发编辑版本控制冲突门面
 *
 * 目标：补测专项 4.2「同账号多端并发编辑、冲突控制」与 4.1 D 段
 * 「编辑时另一标签页也在编辑同一单据：后保存一方触发冲突提示，不静默覆盖」。
 *
 * 契约事实（比较值一律照抄写入方）：
 * 1. 乐观并发令牌是主表既有的更新时刻列，不是新增列。出参键 updated_at 由详情出参结构体
 *    的真实字段序列化而来，值为带微秒的 UTC 串；写回时原样带回 expected_updated_at。
 * 2. 带令牌即进门：比对发生在事务内排他锁之后、任何写入之前，不等即拒绝且零写入，
 *    外显文案是纯公开业务规则（不含主键与金额），机器码走业务族。
 * 3. 不带令牌不进门（兼容既有调用方）：这条也断，免得把"缺省拒绝"当成实现。
 * 4. 一次成功保存会推进令牌，因此同一枚旧令牌第二次带回必被拒——这正是覆盖被拦下的证据。
 *
 * 前置全部本用例自建：自建订单，收尾走删除并读回 404。
 */
import { expect, test } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCall,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  failureCode,
  genCode,
  getCtx,
} from './helpers';

type OrderDetail = {
  id?: unknown;
  status?: unknown;
  notes?: unknown;
  updated_at?: unknown;
};

function str(v: unknown): string {
  return v === null || v === undefined ? 'null' : String(v);
}

/**
 * 功能：把详情出参里的更新时刻取成可回写的令牌串。
 * 入参：详情对象。传给谁：PUT 请求体与断言消息。存什么：不落库。
 */
function tokenOf(detail: OrderDetail): string {
  const token = str(detail.updated_at);
  expect(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(token),
    `详情读回的更新时刻必须是带日时的 UTC 串才能当令牌回写，实际 ${token}`
  ).toBe(true);
  return token;
}

test.describe('473 并发编辑版本控制冲突门面', () => {
  test.describe.configure({ mode: 'serial' });

  test('陈旧令牌那一腿被业务族拒且零写入，最新令牌那一腿成功后旧令牌立即失效', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.customerId || ctx.productIds.length === 0) {
      throw new Error('前置不成立：夹具未产出客户或产品主键，无法自建订单');
    }
    const tag = genCode('SO473A');

    const created = await apiCallRaw<{ id?: unknown; status?: unknown }>(
      page,
      'POST',
      '/sales/orders',
      {
        customer_id: ctx.customerId,
        items: [{ product_id: ctx.productIds[0], quantity: 2, unit_price: '35.00' }],
        remarks: `473并发编辑${tag}`,
      }
    );
    const orderId = Number(created.id);
    expect(
      Number.isInteger(orderId) && orderId > 0,
      `自建订单必须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);

    // 两个"标签页"各自读同一条详情，拿到同一枚令牌
    const readA = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    const readB = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    const sharedToken = tokenOf(readA);
    expect(
      str(readB.updated_at),
      `两次读回应拿到同一枚令牌，实际 ${str(readB.updated_at)} 与 ${sharedToken}`
    ).toBe(sharedToken);

    // 标签页 A 先保存成功
    const noteA = `473甲写${tag}`;
    await apiCall(page, 'PUT', `/sales/orders/${orderId}`, {
      notes: noteA,
      expected_updated_at: sharedToken,
    });
    const afterA = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(str(afterA.notes), `A 保存后备注必须落库，实际 ${str(afterA.notes)}`).toBe(noteA);
    const tokenAfterA = tokenOf(afterA);
    expect(
      tokenAfterA !== sharedToken,
      `一次成功保存必须推进令牌，否则陈旧读回也能继续覆盖，实际仍为 ${tokenAfterA}`
    ).toBe(true);

    // 标签页 B 拿着最初的令牌再保存：必须被拒，且不得覆盖 A 的结果
    const noteB = `473乙写${tag}`;
    const conflict = await apiCallExpectFail(page, 'PUT', `/sales/orders/${orderId}`, {
      notes: noteB,
      expected_updated_at: sharedToken,
    });
    expect(
      [400, 409, 412, 422].includes(conflict.status),
      `陈旧令牌那一腿必须被拒（4xx 族），实际 status=${conflict.status}`
    ).toBe(true);
    expect(failureCode(conflict), `冲突必须走业务族机器码，实际 ${JSON.stringify(conflict)}`).toBe(
      APP_ERROR_CODES.BUSINESS_ERROR
    );

    const afterConflict = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(
      str(afterConflict.notes),
      `被拒的一腿不得静默覆盖，备注必须仍是 A 的值，实际 ${str(afterConflict.notes)}`
    ).toBe(noteA);
    expect(
      tokenOf(afterConflict),
      `被拒的一腿不得推进令牌，实际 ${str(afterConflict.updated_at)}`
    ).toBe(tokenAfterA);

    // B 刷新拿到新令牌后再保存：必须成功，读回为 B 的值
    await apiCall(page, 'PUT', `/sales/orders/${orderId}`, {
      notes: noteB,
      expected_updated_at: tokenAfterA,
    });
    const afterB = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(str(afterB.notes), `B 换新令牌后应保存成功，实际 ${str(afterB.notes)}`).toBe(noteB);

    // 收尾：自建订单删除并读回 404
    await apiCall(page, 'DELETE', `/sales/orders/${orderId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/sales/orders/${orderId}`);
    expect(gone.status, `订单删除后按 id 回读必须 404，实际 ${gone.status}`).toBe(404);
  });

  test('不带令牌的保存保持既有行为不被新门拒绝', async ({ page }) => {
    await ensureTestEntities(page);
    const ctx = getCtx();
    if (!ctx.customerId || ctx.productIds.length === 0) {
      throw new Error('前置不成立：夹具未产出客户或产品主键，无法自建订单');
    }
    const tag = genCode('SO473B');

    const created = await apiCallRaw<{ id?: unknown }>(page, 'POST', '/sales/orders', {
      customer_id: ctx.customerId,
      items: [{ product_id: ctx.productIds[0], quantity: 1, unit_price: '20.00' }],
      remarks: `473无令牌${tag}`,
    });
    const orderId = Number(created.id);
    expect(
      Number.isInteger(orderId) && orderId > 0,
      `自建订单必须回真实主键，实际 ${JSON.stringify(created)}`
    ).toBe(true);

    const note = `473缺省写${tag}`;
    await apiCall(page, 'PUT', `/sales/orders/${orderId}`, { notes: note });
    const detail = await apiCallRaw<OrderDetail>(page, 'GET', `/sales/orders/${orderId}`);
    expect(
      str(detail.notes),
      `缺省不带令牌的保存必须照旧生效（门是可选的，不是默认拒绝），实际 ${str(detail.notes)}`
    ).toBe(note);
    tokenOf(detail);

    await apiCall(page, 'DELETE', `/sales/orders/${orderId}`);
    const gone = await apiCallExpectFail(page, 'GET', `/sales/orders/${orderId}`);
    expect(gone.status, `订单删除后按 id 回读必须 404，实际 ${gone.status}`).toBe(404);
  });
});
