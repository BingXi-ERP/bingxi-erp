// 同一 pending 销售订单两路并发审批的单次生效与审批字段不被覆盖（接口级真实落库用例）。
//
// 功能，覆盖并发与多端一致性中「同一单据并发状态流转只放行一次」的判据。同一
// pending 销售订单被两路真并发 POST approve，服务端必须恰好一笔 200、一笔
// 400 + BUSINESS_ERROR，订单状态推进到 approved 且只推进一次。拦截点在
// order_workflow.rs:411-427 的 approve_order_with_reason：事务内 lock_exclusive
// 读单 → validate_order_for_approval 状态门 → update_with_audit 单行更新 → commit，
// 第二路拿到行锁后状态已非 PENDING 被状态门拒绝，approved_by/approved_at 不被二次覆盖。
// 与 47/48 幂等例的分工：那两例钉顺序重复审批/终态门，本例只钉真并发两路同时到达时
// 的单生效与审批字段守恒，不重复顺序链断言。
// 调用方，frontend e2e flow 分片；打真实端点 POST /sales/orders/{id}/approve 与
// GET /sales/orders/{id} 读回，不 mock 响应，不读事件总线内部队列（纯 API 只钉落库字段）。
// 入参，登录态与客户/产品由 worker fixture 与 ensureTestEntities 提供；订单 remarks
// 带唯一 tag，审批理由两路各异，确保只看落库字段即可分辨哪一路写入、未被二次覆盖。
// 传给谁，断言结果只进 Playwright 报告；两路响应全部保留判读，不因单路抛 fail-fast
// 吞掉另一路，恰好一 200 一失败才算并发判据成立。
// 存什么，sales_orders 一行的 status/approved_by/approved_at/approval_reason 真实列值；
// 成功路把状态从 pending 推到 approved 并写审批人、审批时刻与理由，失败路零副作用，
// 二次覆盖（审批人被改写、时刻被刷新、理由被替换）在此判据下必红。
// 存哪里，以上表均在测试库本体；本用例自建订单收尾按 id 显式 DELETE，不伪造审计链。
import { test, expect, type Page } from '../diagnose-fixture';
import {
  APP_ERROR_CODES,
  apiCallExpectFail,
  apiCallRaw,
  ensureTestEntities,
  genCode,
  getCtx,
  loginViaUI,
  tryCleanup,
} from './helpers';

type Row = Record<string, unknown>;
const ORDERS: number[] = [];

interface SettledCall {
  ok: boolean;
  status?: number;
  text?: string;
  data?: Row;
}

async function settleCall(
  page: Page,
  method: 'POST',
  path: string,
  body?: Record<string, unknown>
): Promise<SettledCall> {
  try {
    const data = await apiCallRaw<Row>(page, method, path, body);
    return { ok: true, data };
  } catch (e) {
    const err = e as Error & { status?: number };
    return { ok: false, status: err.status, text: err.message };
  }
}

/** 建一张 pending 销售订单（已 submit 未 approve），返回主键。 */
async function createPendingOrder(page: Page, tag: string): Promise<number> {
  const created = await apiCallRaw<Row>(page, 'POST', '/sales/orders', {
    customer_id: getCtx().customerId,
    order_date: new Date().toISOString(),
    remarks: `664并发审批${tag}`,
    items: [{ product_id: getCtx().productIds[0], quantity: '7', unit_price: '25.50' }],
  });
  const id = Number(created.id);
  expect(Number.isInteger(id) && id > 0, '[664] 建单未回真实主键').toBe(true);
  ORDERS.push(id);
  await apiCallRaw(page, 'POST', `/sales/orders/${id}/submit`);
  const pending = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${id}`);
  expect(pending.status, '[664] 审批前订单须为 pending').toBe('pending');
  return id;
}

test.describe('664 同一 pending 订单并发审批单次生效', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await ensureTestEntities(page);
  });
  test.afterEach(async ({ page }) => {
    for (const id of ORDERS.splice(0).reverse()) {
      await tryCleanup(page, 'DELETE', `/sales/orders/${id}`, `[664] 订单 ${id}`);
    }
  });

  test('664-01 两路并发 approve 同一 pending 单，恰一成功、审批字段不被二次覆盖', async ({
    page,
  }) => {
    const tag = genCode('664');
    const orderId = await createPendingOrder(page, tag);
    const reasonA = `${tag}-并发审批路A`;
    const reasonB = `${tag}-并发审批路B`;

    // 两路真并发审批：Promise.all 同拍发出，lock_exclusive + 状态门决定唯一生效路。
    const [resA, resB] = await Promise.all([
      settleCall(page, 'POST', `/sales/orders/${orderId}/approve`, {
        approval_reason: reasonA,
      }),
      settleCall(page, 'POST', `/sales/orders/${orderId}/approve`, {
        approval_reason: reasonB,
      }),
    ]);
    expect(resA.ok && resB.ok, '[664] 并发审批不得两路都成功（重复生效）').toBe(false);
    expect(!resA.ok && !resB.ok, '[664] 并发审批不得两路都失败（无生效路）').toBe(false);
    const winners = [resA, resB].filter(r => r.ok);
    const losers = [resA, resB].filter(r => !r.ok);
    expect(winners.length, '[664] 恰好一笔审批成功').toBe(1);
    expect(losers.length, '[664] 恰好一笔审批被拒').toBe(1);
    const loser = losers[0]!;
    expect(loser.status, `[664] 二次审批应为 400，实际 ${loser.status}：${loser.text}`).toBe(400);
    expect(
      loser.text ?? '',
      `[664] 二次审批拒绝须为业务族机器码 BUSINESS_ERROR，实际 ${loser.text}`
    ).toContain(`code=${APP_ERROR_CODES.BUSINESS_ERROR}`);

    // 回读确认状态与审批字段守恒：只有成功路的理由落入，审批人/时刻被写入一次。
    const approved = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(approved.status, '[664] 并发审批后状态须为 approved').toBe('approved');
    expect(approved.approved_by, '[664] 审批人须写入真实用户主键').toBeTruthy();
    expect(approved.approved_at, '[664] 审批时刻须落库非空').toBeTruthy();
    const storedReason = String(approved.approval_reason ?? '');
    expect(
      storedReason === reasonA || storedReason === reasonB,
      `[664] 审批理由须为成功路唯一值、未被二次覆盖，实际=${storedReason}`
    ).toBe(true);

    // 顺序再审批必须仍被状态门拒绝，证明并发只推进一次、终态不可再入。
    const third = await apiCallExpectFail(page, 'POST', `/sales/orders/${orderId}/approve`, {
      approval_reason: `${tag}-顺序第三路`,
    });
    expect(third.status, '[664] approved 后顺序再审批应仍为 400').toBe(400);
    const afterThird = await apiCallRaw<Row>(page, 'GET', `/sales/orders/${orderId}`);
    expect(afterThird.approved_at, '[664] 第三路被拒后审批时刻不得被刷新').toEqual(
      approved.approved_at
    );
    expect(String(afterThird.approval_reason ?? ''), '[664] 第三路被拒后理由不得被覆盖').toEqual(
      storedReason
    );
  });
});
